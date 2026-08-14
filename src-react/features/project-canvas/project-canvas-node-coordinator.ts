import type { Node } from "@xyflow/react";

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

function positionFor(index: number, kind: ProductionGraphNode["kind"]): { x: number; y: number } {
  const columns = kind === "goal" ? 1 : 2;
  return { x: kind === "goal" ? 80 : 360 + (index % columns) * 340, y: kind === "goal" ? 140 : 90 + Math.floor(index / columns) * 220 };
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
): ProjectCanvasNode[] {
  const productionNodes = snapshot.nodes.map((graphNode, index) =>
    toCanvasNode(graphNode, "production-graph", graphNode.id, positionFor(index, graphNode.kind), previous.get(graphNode.id)),
  );
  if (!interactive) return productionNodes;
  const interactiveNodes = interactive.nodes.map((node) => {
    const graphNode = interactiveGraphNode(interactive.id, node);
    return toCanvasNode(
      graphNode,
      "interactive-story",
      node.id,
      { x: node.position.x + 760, y: node.position.y + 100 },
      previous.get(graphNode.id),
    );
  });
  return [...productionNodes, ...interactiveNodes];
}

export function coordinateProductionGraphNodes(
  snapshot: ProductionGraphSnapshot,
  previous: ReadonlyMap<string, ProjectCanvasNode>,
): ProjectCanvasNode[] {
  return coordinateProjectCanvasNodes(snapshot, null, previous);
}
