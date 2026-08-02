import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNodesState, type Edge, type Node, type NodeProps, type ReactFlowInstance } from "@xyflow/react";

import { InfiniteCanvas, topologyLevelLayout } from "@react/features/canvas";
import type { CinematicCoverageAggregate, ProductionFlowData, ProductionGenerationData } from "@react/features/production";
import {
  buildInteractiveProductionTopology,
  type InteractiveProductionStage,
  type InteractiveProductionTopology,
} from "./interactive-production-topology";
import {
  InteractiveProductionStageNode,
  type InteractiveProductionStageNodeData,
} from "./interactive-production-stage-node";
import { InteractiveStoryFlowNode, type InteractiveStoryNodeData } from "./interactive-story-node";
import type { InteractiveStoryNodePositionUpdate } from "./interactive-story-api";
import type { InteractiveStoryGraph } from "./types";
import type { ProjectWorldProfile } from "@react/features/world-profile/world-profile-fields";
import { WorldProfileNode, type WorldProfileNodeData } from "@react/features/world-profile/world-profile-node";
import type { CanvasSpatialRetryStage } from "@react/features/production/spatial-production-retry";

type AggregateNodeData = InteractiveStoryNodeData | InteractiveProductionStageNodeData | WorldProfileNodeData;
type AggregateNode = Node<AggregateNodeData, "interactiveStory" | "interactiveProductionStage" | "worldProfile">;

export interface InteractiveStoryCanvasProps {
  graph: InteractiveStoryGraph;
  selectedNodeId: string | null;
  flowsByScriptId: Record<number, ProductionFlowData | undefined>;
  generationByScriptId: Record<number, ProductionGenerationData | undefined>;
  coverageByScriptId?: Record<number, CinematicCoverageAggregate[] | undefined>;
  leadingControls?: ReactNode;
  trailingControls?: ReactNode;
  onSelectNode: (nodeId: string) => void;
  onOpenStage: (storyNodeId: string, stage: InteractiveProductionStage) => void;
  onRetryStage: (storyNodeId: string, stage: CanvasSpatialRetryStage) => Promise<void>;
  onPositionsChange: (positions: InteractiveStoryNodePositionUpdate[]) => void;
  worldProfile: ProjectWorldProfile | null;
  onOpenWorldProfile: () => void;
}

function createAggregateNode(
  topologyNode: InteractiveProductionTopology["nodes"][number],
  graph: InteractiveStoryGraph,
  selectedNodeId: string | null,
  flowsByScriptId: Record<number, ProductionFlowData | undefined>,
  generationByScriptId: Record<number, ProductionGenerationData | undefined>,
  coverageByScriptId: Record<number, CinematicCoverageAggregate[] | undefined>,
  onOpenStage: (storyNodeId: string, stage: InteractiveProductionStage) => void,
  onRetryStage: (storyNodeId: string, stage: CanvasSpatialRetryStage) => Promise<void>,
  worldProfile: ProjectWorldProfile | null,
  onOpenWorldProfile: () => void,
): AggregateNode {
  if (topologyNode.kind === "worldProfile") {
    return {
      id: topologyNode.id,
      type: "worldProfile",
      position: topologyNode.position,
      draggable: false,
      selectable: true,
      focusable: false,
      data: { profile: worldProfile, mode: "interactive", onOpen: onOpenWorldProfile },
    };
  }
  const storyNode = graph.nodes.find((candidate) => candidate.id === topologyNode.storyNodeId);
  if (!storyNode) throw new Error(`互动剧情节点不存在: ${topologyNode.storyNodeId}`);
  if (topologyNode.stage === "script") {
    return {
      id: topologyNode.id,
      type: "interactiveStory",
      position: topologyNode.position,
      dragHandle: ".production-node-drag-handle",
      draggable: true,
      selectable: true,
      focusable: false,
      data: {
        storyNodeId: storyNode.id,
        title: storyNode.title,
        summary: storyNode.summary,
        kind: storyNode.kind,
        status: storyNode.status,
        scriptId: storyNode.scriptId,
        entry: graph.entryNodeId === storyNode.id,
        selected: selectedNodeId === storyNode.id,
        onOpenStage,
      },
    };
  }
  return {
    id: topologyNode.id,
    type: "interactiveProductionStage",
    position: topologyNode.position,
    draggable: false,
    selectable: true,
    focusable: false,
    data: {
      storyNodeId: storyNode.id,
      storyTitle: storyNode.title,
      stage: topologyNode.stage,
      flow: flowsByScriptId[storyNode.scriptId],
      generation: generationByScriptId[storyNode.scriptId],
      coverages: coverageByScriptId[storyNode.scriptId],
      onOpenStage,
      onRetryStage,
    },
  };
}

function createNodes(
  graph: InteractiveStoryGraph,
  selectedNodeId: string | null,
  flowsByScriptId: Record<number, ProductionFlowData | undefined>,
  generationByScriptId: Record<number, ProductionGenerationData | undefined>,
  coverageByScriptId: Record<number, CinematicCoverageAggregate[] | undefined>,
  onOpenStage: (storyNodeId: string, stage: InteractiveProductionStage) => void,
  onRetryStage: (storyNodeId: string, stage: CanvasSpatialRetryStage) => Promise<void>,
  worldProfile: ProjectWorldProfile | null,
  onOpenWorldProfile: () => void,
): AggregateNode[] {
  const topology = buildInteractiveProductionTopology(graph);
  return topology.nodes.map((node) =>
    createAggregateNode(node, graph, selectedNodeId, flowsByScriptId, generationByScriptId, coverageByScriptId, onOpenStage, onRetryStage, worldProfile, onOpenWorldProfile),
  );
}

function shallowEqualRecord(left: Record<string, unknown>, right: Record<string, unknown>) {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return leftKeys.length === rightKeys.length && leftKeys.every((key) => Object.is(left[key], right[key]));
}

export function reconcileInteractiveStoryCanvasNodes<T extends Node>(current: T[], desired: T[]): T[] {
  const byId = new Map(current.map((node) => [node.id, node]));
  const reconciled = desired.map((next) => {
    const previous = byId.get(next.id);
    if (!previous) return next;
    const unchanged =
      previous.type === next.type &&
      previous.draggable === next.draggable &&
      previous.selectable === next.selectable &&
      previous.focusable === next.focusable &&
      shallowEqualRecord(previous.data as Record<string, unknown>, next.data as Record<string, unknown>);
    if (unchanged) return previous;
    return { ...next, position: previous.position };
  });
  return reconciled.length === current.length && reconciled.every((node, index) => node === current[index])
    ? current
    : reconciled;
}

const coverageBackedStages = new Set<InteractiveProductionStage>([
  "blocking",
  "coverage",
  "previs",
  "previsValidation",
  "formalGeneration",
  "multicamEdit",
]);

export function patchInteractiveStoryCoverageNodes<T extends Node>(
  current: T[],
  graph: InteractiveStoryGraph,
  previous: Record<number, CinematicCoverageAggregate[] | undefined>,
  next: Record<number, CinematicCoverageAggregate[] | undefined>,
): T[] {
  const scriptIds = new Set([...Object.keys(previous), ...Object.keys(next)].map(Number));
  const changedScriptIds = new Set([...scriptIds].filter((scriptId) => previous[scriptId] !== next[scriptId]));
  if (changedScriptIds.size === 0) return current;
  const scriptIdByStoryNode = new Map(graph.nodes.map((node) => [node.id, node.scriptId]));
  let changed = false;
  const patched = current.map((node) => {
    if (node.type !== "interactiveProductionStage") return node;
    const data = node.data as unknown as InteractiveProductionStageNodeData;
    const scriptId = scriptIdByStoryNode.get(data.storyNodeId);
    if (scriptId === undefined || !changedScriptIds.has(scriptId) || !coverageBackedStages.has(data.stage)) return node;
    if (data.coverages === next[scriptId]) return node;
    changed = true;
    return { ...node, data: { ...data, coverages: next[scriptId] } } as T;
  });
  return changed ? patched : current;
}

function createEdges(graph: InteractiveStoryGraph): Edge[] {
  return buildInteractiveProductionTopology(graph).edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: `${edge.source}-source`,
    targetHandle: `${edge.target}-target`,
    label: edge.label,
    animated: edge.kind === "choice",
    style: {
      stroke: edge.kind === "choice" ? "#3b82f6" : "#475569",
      strokeWidth: edge.kind === "choice" ? 3 : 2,
    },
    labelStyle: { fill: "#dbeafe", fontSize: 12 },
    labelBgStyle: { fill: "#0f172a", fillOpacity: 0.94 },
    labelBgPadding: [8, 5],
    labelBgBorderRadius: 6,
  }));
}

function layoutNodes(nodes: AggregateNode[], instance: ReactFlowInstance<AggregateNode> | null) {
  if (!instance) return nodes;
  const current = new Map(instance.getNodes().map((node) => [node.id, node]));
  const layout = topologyLevelLayout({
    nodeIds: nodes.map((node) => node.id),
    edges: instance.getEdges().map((edge) => ({ source: edge.source, target: edge.target })),
    nodeSizes: Object.fromEntries(
      nodes.map((node) => {
        const measured = current.get(node.id);
        return [node.id, { width: measured?.measured?.width || 330, height: measured?.measured?.height || 220 }];
      }),
    ),
    fallbackNodeSize: { width: 330, height: 220 },
    gap: 90,
  });
  return nodes.map((node) => ({ ...node, position: layout[node.id] ?? node.position }));
}

export function InteractiveStoryCanvas({
  graph,
  selectedNodeId,
  flowsByScriptId,
  generationByScriptId,
  coverageByScriptId = {},
  leadingControls,
  trailingControls,
  onSelectNode,
  onOpenStage,
  onRetryStage,
  onPositionsChange,
  worldProfile,
  onOpenWorldProfile,
}: InteractiveStoryCanvasProps) {
  const worldProfileRef = useRef(worldProfile);
  const openWorldProfileRef = useRef(onOpenWorldProfile);
  worldProfileRef.current = worldProfile;
  openWorldProfileRef.current = onOpenWorldProfile;
  const openWorldProfile = useCallback(() => openWorldProfileRef.current(), []);
  const coverageRef = useRef(coverageByScriptId);
  const [initialNodes] = useState(() =>
    createNodes(graph, selectedNodeId, flowsByScriptId, generationByScriptId, coverageByScriptId, onOpenStage, onRetryStage, worldProfileRef.current, openWorldProfile),
  );
  const [nodes, setNodes, onNodesChange] = useNodesState<AggregateNode>(initialNodes);
  const edges = useMemo(() => createEdges(graph), [graph]);
  const nodeTypes = useMemo(
    () => ({
      interactiveStory: InteractiveStoryFlowNode as (props: NodeProps) => React.ReactNode,
      interactiveProductionStage: InteractiveProductionStageNode as (props: NodeProps) => React.ReactNode,
      worldProfile: WorldProfileNode as (props: NodeProps) => React.ReactNode,
    }),
    [],
  );

  useEffect(() => {
    const desired = createNodes(graph, selectedNodeId, flowsByScriptId, generationByScriptId, coverageRef.current, onOpenStage, onRetryStage, worldProfileRef.current, openWorldProfile);
    setNodes((current) => reconcileInteractiveStoryCanvasNodes(current, desired));
  }, [flowsByScriptId, generationByScriptId, graph, onOpenStage, onRetryStage, openWorldProfile, selectedNodeId, setNodes]);

  useEffect(() => {
    const previous = coverageRef.current;
    coverageRef.current = coverageByScriptId;
    setNodes((current) => patchInteractiveStoryCoverageNodes(current, graph, previous, coverageByScriptId));
  }, [coverageByScriptId, graph, setNodes]);

  useEffect(() => {
    setNodes((current) =>
      current.map((node) =>
        node.type === "worldProfile" && (node.data as WorldProfileNodeData).profile !== worldProfile
          ? { ...node, data: { ...(node.data as WorldProfileNodeData), profile: worldProfile } }
          : node,
      ),
    );
  }, [setNodes, worldProfile]);

  return (
    <InfiniteCanvas<AggregateNode>
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      nodeTypes={nodeTypes}
      leadingControls={leadingControls}
      trailingControls={trailingControls}
      ariaLabel="互动剧情画布"
      testId="interactive-story-infinite-canvas"
      onNodeClick={(node) => {
        if (node.type !== "worldProfile") onSelectNode((node.data as InteractiveStoryNodeData | InteractiveProductionStageNodeData).storyNodeId);
      }}
      onNodeDoubleClick={(node) =>
        node.type === "worldProfile"
          ? openWorldProfile()
          : onOpenStage(
              (node.data as InteractiveStoryNodeData | InteractiveProductionStageNodeData).storyNodeId,
              node.type === "interactiveStory" ? "script" : (node.data as InteractiveProductionStageNodeData).stage,
            )
      }
      onNodeDragStop={(flowNode) => {
        if (flowNode.type !== "interactiveStory") return;
        onPositionsChange([
          {
              nodeId: (flowNode.data as InteractiveStoryNodeData).storyNodeId,
            position: {
              x: Math.round(flowNode.position.x / 4),
              y: Math.round(flowNode.position.y / 2),
            },
          },
        ]);
      }}
      onAutoLayout={(instance) => {
        const nextNodes = layoutNodes(nodes, instance);
        setNodes(nextNodes);
        onPositionsChange(
          nextNodes
            .filter((node) => node.type === "interactiveStory")
            .map((node) => ({
              nodeId: (node.data as InteractiveStoryNodeData).storyNodeId,
              position: { x: Math.round(node.position.x / 4), y: Math.round(node.position.y / 2) },
            })),
        );
        window.requestAnimationFrame(() => void instance?.fitView({ duration: 300 }));
      }}
    />
  );
}
