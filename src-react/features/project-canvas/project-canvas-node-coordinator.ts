import type { Node } from "@xyflow/react";

import { topologyLevelLayout } from "@react/features/canvas";
import type { InteractiveStoryGraph, InteractiveStoryNode } from "@react/features/interactive-story";
import type { ProductionGraphNode, ProductionGraphSnapshot } from "@react/features/production-graph";

export interface ProjectCanvasNodeData {
  [key: string]: unknown;
  graphNode: ProductionGraphNode;
  source: "production-graph" | "interactive-story";
  sourceRef: string;
  status: ProductionGraphNode["status"];
  title: string;
  objective: string;
}

export type ProjectCanvasNode = Node<ProjectCanvasNodeData, "production-graph">;

/** 生产图节点在画布上的估算尺寸，用于确定性布局（与实际渲染尺寸留有裕量，保证不重叠）。 */
export const PROJECT_CANVAS_NODE_SIZE = { width: 300, height: 190 };
/**
 * 互动剧情节点卡片的估算尺寸：卡片更宽、正文不再截断，因此估算高度与纵向行距
 * 都大于普通生产节点，避免展开后的标题/摘要与相邻卡片重叠。
 * 需与 GraphNodeCard 中互动剧情卡片实际渲染宽度（w-[400px]）保持一致。
 */
export const PROJECT_CANVAS_STORY_NODE_SIZE = { width: 400, height: 230 };
/** 未提供画布容器尺寸时的默认视口（1280×720 典型桌面工作区）。 */
export const PROJECT_CANVAS_DEFAULT_VIEWPORT = { width: 1280, height: 720 };

export interface ProjectCanvasViewport {
  width: number;
  height: number;
}

const GOAL_POSITION = { x: 80, y: 140 };
const COLUMN_GAP = 64;
const STORY_ORIGIN = { x: 80, y: 60 };
/** 剧情层级（横向分列）之间的净空：卡片加宽后仍保持宽裕，连线的选项文字不被挤压。 */
const STORY_COLUMN_GAP = 180;
/** 同一剧情层级内纵向卡片之间的净空：容纳展开后的标题与摘要。 */
const STORY_ROW_GAP = 120;

export interface CanvasFramingKeyInput {
  graphId: string | null;
  revision: number | null;
  interactiveGraphId?: string | null;
  interactiveRevision?: number | null;
  overlayCloseCount: number;
}

/**
 * 画布取景（fitView）决策 key：只在「首次加载 / graphId+revision 变化 / 覆盖层关闭」时变化。
 * 普通重渲染与用户拖动画布不改变该 key，因此不会反复重置视口。
 */
export function canvasFramingKey(input: CanvasFramingKeyInput): string {
  const graph = input.graphId != null && input.revision != null ? `${input.graphId}@${input.revision}` : `pending@${input.graphId ?? "none"}`;
  const interactiveGraph = input.interactiveGraphId != null && input.interactiveRevision != null
    ? `${input.interactiveGraphId}@${input.interactiveRevision}`
    : `pending@${input.interactiveGraphId ?? "none"}`;
  return `${graph}|interactive:${interactiveGraph}|overlays:${input.overlayCloseCount}`;
}

/** 取景决策：previous 为 null（首次加载）或 key 发生变化时返回 true。 */
export function shouldReframeCanvas(previousKey: string | null, nextKey: string): boolean {
  return previousKey !== nextKey;
}

/**
 * fitView 选项：单节点/少量节点时允许放大到可读尺寸，节点密集时交由 fitView 自动缩放，
 * 避免过度放大；padding 保证取景后节点不贴边。
 */
export function projectCanvasFitViewOptions(nodeCount: number): { padding: number; duration: number; maxZoom: number } {
  return { padding: 0.15, duration: 220, maxZoom: nodeCount <= 2 ? 1.5 : 1.2 };
}

function sameGraphNode(left: ProjectCanvasNodeData["graphNode"], right: ProjectCanvasNodeData["graphNode"]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function productionStatusForInteractive(status: InteractiveStoryNode["status"]): ProductionGraphNode["status"] {
  if (status === "producing") return "running";
  if (status === "completed") return "succeeded";
  return status;
}

function interactiveGraphNode(graphId: string, node: InteractiveStoryNode): ProductionGraphNode {
  return {
    id: `interactive:${graphId}:${node.id}`,
    graphId,
    kind: "work",
    title: node.title,
    objective: node.summary,
    status: productionStatusForInteractive(node.status),
    inputRefs: [],
    outputRefs: [],
    constraints: [],
    evidence: [],
    budget: { currency: "USD", oneTimeCost: 0, recurringCost: 0 },
    attempt: 0,
    capabilityId: null,
    agentRunId: null,
    checkpointId: null,
    checkpointReason: null,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
  };
}

/** 单节点图的目标节点位置：落在画布视口视觉中心（减去半个节点尺寸）。 */
function centeredGoalPosition(viewport: ProjectCanvasViewport): { x: number; y: number } {
  return {
    x: Math.max(0, Math.round((viewport.width - PROJECT_CANVAS_NODE_SIZE.width) / 2)),
    y: Math.max(0, Math.round((viewport.height - PROJECT_CANVAS_NODE_SIZE.height) / 2)),
  };
}

/**
 * 确定性拓扑布局：单节点图把目标节点放在画布视觉中心；
 * 多节点图目标节点固定在左上角，其余生产节点按边的关系分列摆放，
 * 每列内部纵向排布，列与列之间互不重叠；互动剧节点归一化后放到生产图右侧。
 */
function productionNodeLayout(snapshot: ProductionGraphSnapshot, viewport: ProjectCanvasViewport): Record<string, { x: number; y: number }> {
  const goalIds = new Set(snapshot.nodes.filter((node) => node.kind === "goal").map((node) => node.id));
  const goal = snapshot.nodes.find((node) => goalIds.has(node.id));
  const restIds = snapshot.nodes.filter((node) => !goalIds.has(node.id)).map((node) => node.id);
  const layout: Record<string, { x: number; y: number }> = {};
  if (goal) layout[goal.id] = restIds.length === 0 ? centeredGoalPosition(viewport) : GOAL_POSITION;
  if (restIds.length === 0) return layout;

  const restEdges = snapshot.edges
    .filter((edge) => !goalIds.has(edge.sourceNodeId) && !goalIds.has(edge.targetNodeId))
    .map((edge) => ({ source: edge.sourceNodeId, target: edge.targetNodeId }));
  const ranked = topologyLevelLayout({
    nodeIds: restIds,
    edges: restEdges,
    nodeSizes: Object.fromEntries(restIds.map((id) => [id, PROJECT_CANVAS_NODE_SIZE])),
    gap: COLUMN_GAP,
    fallbackNodeSize: PROJECT_CANVAS_NODE_SIZE,
  });
  const originX = goal ? GOAL_POSITION.x + PROJECT_CANVAS_NODE_SIZE.width + COLUMN_GAP : 0;
  for (const id of restIds) {
    layout[id] = { x: ranked[id].x + originX, y: ranked[id].y + GOAL_POSITION.y };
  }
  return layout;
}

export function productionGraphMatchesInteractiveStory(
  snapshot: ProductionGraphSnapshot,
  interactive: InteractiveStoryGraph | null,
): boolean {
  return interactive === null || snapshot.interactiveStoryGraphId === interactive.id;
}

/**
 * 互动剧情按入口的最短可达层级分列。回跳边不会把整张图拖成长链，
 * 同层节点按服务端稳定顺序纵向排列，刷新后位置保持确定。
 */
function interactiveStoryLayout(
  interactive: InteractiveStoryGraph,
  originX: number,
): Record<string, { x: number; y: number }> {
  const ids = interactive.nodes.map((node) => node.id);
  const idSet = new Set(ids);
  const entryId = interactive.entryNodeId && idSet.has(interactive.entryNodeId) ? interactive.entryNodeId : ids[0];
  if (!entryId) return {};

  const adjacency = new Map(ids.map((id) => [id, [] as string[]]));
  for (const edge of interactive.edges) {
    if (!idSet.has(edge.sourceNodeId) || !idSet.has(edge.targetNodeId) || edge.sourceNodeId === edge.targetNodeId) continue;
    const targets = adjacency.get(edge.sourceNodeId)!;
    if (!targets.includes(edge.targetNodeId)) targets.push(edge.targetNodeId);
  }

  const rank = new Map<string, number>([[entryId, 0]]);
  const queue = [entryId];
  while (queue.length > 0) {
    const source = queue.shift()!;
    const nextRank = (rank.get(source) ?? 0) + 1;
    for (const target of adjacency.get(source) ?? []) {
      if (rank.has(target)) continue;
      rank.set(target, nextRank);
      queue.push(target);
    }
  }
  const disconnectedRank = Math.max(0, ...rank.values()) + 1;
  for (const id of ids) if (!rank.has(id)) rank.set(id, disconnectedRank);

  const levels = new Map<number, string[]>();
  for (const id of ids) {
    const level = rank.get(id) ?? disconnectedRank;
    levels.set(level, [...(levels.get(level) ?? []), id]);
  }
  const maxLevelCount = Math.max(1, ...[...levels.values()].map((levelIds) => levelIds.length));
  const maxLevelHeight =
    maxLevelCount * PROJECT_CANVAS_STORY_NODE_SIZE.height + (maxLevelCount - 1) * STORY_ROW_GAP;
  const layout: Record<string, { x: number; y: number }> = {};
  for (const [level, levelIds] of [...levels.entries()].sort(([left], [right]) => left - right)) {
    const levelHeight =
      levelIds.length * PROJECT_CANVAS_STORY_NODE_SIZE.height + (levelIds.length - 1) * STORY_ROW_GAP;
    const startY = STORY_ORIGIN.y + Math.round((maxLevelHeight - levelHeight) / 2);
    levelIds.forEach((id, index) => {
      layout[id] = {
        x: originX + level * (PROJECT_CANVAS_STORY_NODE_SIZE.width + STORY_COLUMN_GAP),
        y: startY + index * (PROJECT_CANVAS_STORY_NODE_SIZE.height + STORY_ROW_GAP),
      };
    });
  }
  return layout;
}

function toCanvasNode(
  graphNode: ProductionGraphNode,
  source: ProjectCanvasNodeData["source"],
  sourceRef: string,
  position: { x: number; y: number },
  existing?: ProjectCanvasNode,
): ProjectCanvasNode {
  if (existing && sameGraphNode(existing.data.graphNode, graphNode)) return existing;
  return {
    id: graphNode.id,
    type: "production-graph",
    position: existing?.position ?? position,
    data: { graphNode, source, sourceRef, status: graphNode.status, title: graphNode.title, objective: graphNode.objective },
    selectable: true,
    draggable: true,
    focusable: false,
  };
}

export function coordinateProjectCanvasNodes(
  snapshot: ProductionGraphSnapshot,
  interactive: InteractiveStoryGraph | null,
  previous: ReadonlyMap<string, ProjectCanvasNode>,
  viewport: ProjectCanvasViewport = PROJECT_CANVAS_DEFAULT_VIEWPORT,
): ProjectCanvasNode[] {
  const includeProductionGraph = productionGraphMatchesInteractiveStory(snapshot, interactive);
  const layout = includeProductionGraph ? productionNodeLayout(snapshot, viewport) : {};
  const productionNodes = includeProductionGraph
    ? snapshot.nodes.map((graphNode) =>
        toCanvasNode(graphNode, "production-graph", graphNode.id, layout[graphNode.id] ?? GOAL_POSITION, previous.get(graphNode.id)),
      )
    : [];
  if (!interactive) return productionNodes;

  const interactiveNodes = interactive.nodes;
  const originX = productionNodes.length > 0
    ? Math.max(...productionNodes.map((node) => node.position.x + PROJECT_CANVAS_NODE_SIZE.width)) + COLUMN_GAP * 2
    : STORY_ORIGIN.x;
  const storyLayout = interactiveStoryLayout(interactive, originX);
  const storyNodes = interactiveNodes.map((node) => {
    const graphNode = interactiveGraphNode(interactive.id, node);
    return toCanvasNode(
      graphNode,
      "interactive-story",
      node.id,
      storyLayout[node.id] ?? STORY_ORIGIN,
      previous.get(graphNode.id),
    );
  });
  return [...productionNodes, ...storyNodes];
}

export function coordinateProductionGraphNodes(
  snapshot: ProductionGraphSnapshot,
  previous: ReadonlyMap<string, ProjectCanvasNode>,
): ProjectCanvasNode[] {
  return coordinateProjectCanvasNodes(snapshot, null, previous);
}
