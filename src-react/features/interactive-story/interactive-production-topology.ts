import type { InteractiveStoryGraph, InteractiveStoryPosition } from "./types";

export const interactiveProductionStageOrder = [
  "script",
  "scriptPlan",
  "assets",
  "storyboardTable",
  "storyboard",
  "blocking",
  "coverage",
  "previs",
  "formalGeneration",
  "multicamEdit",
  "supervision",
] as const;

export type InteractiveProductionStage = (typeof interactiveProductionStageOrder)[number];

export interface InteractiveProductionTopologyNode {
  kind: "production";
  id: string;
  storyNodeId: string;
  scriptId: number;
  stage: InteractiveProductionStage;
  position: InteractiveStoryPosition;
}

export interface InteractiveWorldProfileTopologyNode {
  kind: "worldProfile";
  id: "world-profile";
  position: InteractiveStoryPosition;
}

export interface InteractiveProductionTopologyEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  kind: "production" | "choice" | "worldProfile";
}

export interface InteractiveProductionTopology {
  nodes: Array<InteractiveProductionTopologyNode | InteractiveWorldProfileTopologyNode>;
  edges: InteractiveProductionTopologyEdge[];
}

const stageOffsets: Record<InteractiveProductionStage, InteractiveStoryPosition> = {
  script: { x: 0, y: 0 },
  scriptPlan: { x: 390, y: 0 },
  assets: { x: 390, y: 330 },
  storyboardTable: { x: 780, y: 0 },
  storyboard: { x: 1_170, y: 0 },
  blocking: { x: 1_560, y: 0 },
  coverage: { x: 1_950, y: 0 },
  previs: { x: 2_340, y: 0 },
  formalGeneration: { x: 2_730, y: 0 },
  multicamEdit: { x: 3_120, y: 0 },
  supervision: { x: 3_510, y: 0 },
};

const productionConnections: Array<[InteractiveProductionStage, InteractiveProductionStage]> = [
  ["script", "scriptPlan"],
  ["script", "assets"],
  ["scriptPlan", "storyboardTable"],
  ["assets", "storyboard"],
  ["storyboardTable", "storyboard"],
  ["storyboard", "blocking"],
  ["assets", "blocking"],
  ["blocking", "coverage"],
  ["coverage", "previs"],
  ["previs", "formalGeneration"],
  ["formalGeneration", "multicamEdit"],
  ["multicamEdit", "supervision"],
];

export function interactiveProductionNodeId(storyNodeId: string, stage: InteractiveProductionStage): string {
  return `${storyNodeId}::${stage}`;
}

export function buildInteractiveProductionTopology(graph: InteractiveStoryGraph): InteractiveProductionTopology {
  const productionNodes: InteractiveProductionTopologyNode[] = graph.nodes.flatMap((storyNode) => {
    const clusterOrigin = {
      x: storyNode.position.x * 4,
      y: storyNode.position.y * 2,
    };
    return interactiveProductionStageOrder.map((stage) => ({
      kind: "production" as const,
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
  const firstX = productionNodes.length ? Math.min(...productionNodes.map((node) => node.position.x)) : 0;
  const firstY = productionNodes.length ? Math.min(...productionNodes.map((node) => node.position.y)) : 0;
  const nodes: InteractiveProductionTopology["nodes"] = [
    { kind: "worldProfile", id: "world-profile", position: { x: firstX - 420, y: firstY } },
    ...productionNodes,
  ];

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

  const inboundStoryNodeIds = new Set(graph.edges.map((edge) => edge.targetNodeId));
  const rootStoryNodeIds = graph.nodes
    .filter((node) => node.id === graph.entryNodeId || !inboundStoryNodeIds.has(node.id))
    .map((node) => node.id);
  edges.push(
    ...[...new Set(rootStoryNodeIds)].map((storyNodeId) => ({
      id: `world-profile:${storyNodeId}`,
      source: "world-profile",
      target: interactiveProductionNodeId(storyNodeId, "script"),
      kind: "worldProfile" as const,
    })),
  );

  return { nodes, edges };
}
