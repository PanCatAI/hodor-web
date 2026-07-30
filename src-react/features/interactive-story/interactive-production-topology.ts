import type { InteractiveStoryGraph, InteractiveStoryPosition } from "./types";

export const interactiveProductionStageOrder = [
  "script",
  "scriptPlan",
  "assets",
  "storyboardTable",
  "storyboard",
  "workbench",
  "supervision",
] as const;

export type InteractiveProductionStage = (typeof interactiveProductionStageOrder)[number];

export interface InteractiveProductionTopologyNode {
  id: string;
  storyNodeId: string;
  scriptId: number;
  stage: InteractiveProductionStage;
  position: InteractiveStoryPosition;
}

export interface InteractiveProductionTopologyEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  kind: "production" | "choice";
}

export interface InteractiveProductionTopology {
  nodes: InteractiveProductionTopologyNode[];
  edges: InteractiveProductionTopologyEdge[];
}

const stageOffsets: Record<InteractiveProductionStage, InteractiveStoryPosition> = {
  script: { x: 0, y: 0 },
  scriptPlan: { x: 390, y: 0 },
  assets: { x: 390, y: 330 },
  storyboardTable: { x: 780, y: 0 },
  storyboard: { x: 1_170, y: 0 },
  workbench: { x: 1_560, y: 0 },
  supervision: { x: 1_950, y: 0 },
};

const productionConnections: Array<[InteractiveProductionStage, InteractiveProductionStage]> = [
  ["script", "scriptPlan"],
  ["script", "assets"],
  ["scriptPlan", "storyboardTable"],
  ["assets", "storyboard"],
  ["storyboardTable", "storyboard"],
  ["storyboard", "workbench"],
  ["workbench", "supervision"],
];

export function interactiveProductionNodeId(storyNodeId: string, stage: InteractiveProductionStage): string {
  return `${storyNodeId}::${stage}`;
}

export function buildInteractiveProductionTopology(graph: InteractiveStoryGraph): InteractiveProductionTopology {
  const nodes = graph.nodes.flatMap((storyNode) => {
    const clusterOrigin = {
      x: storyNode.position.x * 4,
      y: storyNode.position.y * 2,
    };
    return interactiveProductionStageOrder.map((stage) => ({
      id: interactiveProductionNodeId(storyNode.id, stage),
      storyNodeId: storyNode.id,
      scriptId: storyNode.scriptId,
      stage,
      position: {
        x: clusterOrigin.x + stageOffsets[stage].x,
        y: clusterOrigin.y + stageOffsets[stage].y,
      },
    }));
  });

  const edges: InteractiveProductionTopologyEdge[] = graph.nodes.flatMap((storyNode) =>
    productionConnections.map(([source, target]) => ({
      id: `production:${storyNode.id}:${source}:${target}`,
      source: interactiveProductionNodeId(storyNode.id, source),
      target: interactiveProductionNodeId(storyNode.id, target),
      kind: "production" as const,
    })),
  );

  edges.push(
    ...graph.edges.map((edge) => ({
      id: `choice:${edge.id}`,
      source: interactiveProductionNodeId(edge.sourceNodeId, "supervision"),
      target: interactiveProductionNodeId(edge.targetNodeId, "script"),
      label: edge.choiceText,
      kind: "choice" as const,
    })),
  );

  return { nodes, edges };
}
