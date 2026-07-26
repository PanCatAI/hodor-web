import type { Edge, Node } from "@xyflow/react";

import { topologyLevelLayout } from "@react/features/canvas";
import type { FlowNodePosition } from "./types";

export const productionNodeOrder = [
  "source",
  "script",
  "scriptPlan",
  "assets",
  "worldAssets",
  "storyboardTable",
  "storyboard",
  "videoTracks",
  "timeline",
  "finalOutput",
] as const;

export type ProductionFlowNodeId = (typeof productionNodeOrder)[number];

export interface ProductionNodeSize {
  width: number;
  height: number;
}

export interface ProductionLayoutOptions {
  nodeSizes?: Partial<Record<ProductionFlowNodeId, Partial<ProductionNodeSize>>>;
  gap?: number;
}

export const productionNodeLabels: Record<ProductionFlowNodeId, string> = {
  source: "原文",
  script: "剧本",
  scriptPlan: "拍摄计划",
  assets: "资产工厂",
  worldAssets: "三维场景资产",
  storyboardTable: "分镜表",
  storyboard: "分镜图",
  videoTracks: "视频轨道",
  timeline: "剪辑时间线",
  finalOutput: "最终成片",
};

/**
 * The production graph has one asset branch and one fixed main chain. Keeping
 * this topology explicit prevents UI refactors from silently turning it into a
 * misleading linear pipeline.
 */
export const productionConnections = [
  { id: "source-script", source: "source", target: "script", sourceHandle: "source-source", targetHandle: "script-target" },
  { id: "script-assets", source: "script", target: "assets", sourceHandle: "script-assets", targetHandle: "assets-target" },
  { id: "assets-worldAssets", source: "assets", target: "worldAssets", sourceHandle: "assets-source", targetHandle: "worldAssets-target" },
  {
    id: "worldAssets-storyboard",
    source: "worldAssets",
    target: "storyboard",
    sourceHandle: "worldAssets-source",
    targetHandle: "storyboard-world-target",
  },
  { id: "script-scriptPlan", source: "script", target: "scriptPlan", sourceHandle: "script-main", targetHandle: "scriptPlan-target" },
  {
    id: "scriptPlan-storyboardTable",
    source: "scriptPlan",
    target: "storyboardTable",
    sourceHandle: "scriptPlan-source",
    targetHandle: "storyboardTable-target",
  },
  {
    id: "storyboardTable-storyboard",
    source: "storyboardTable",
    target: "storyboard",
    sourceHandle: "storyboardTable-source",
    targetHandle: "storyboard-target",
  },
  {
    id: "storyboard-videoTracks",
    source: "storyboard",
    target: "videoTracks",
    sourceHandle: "storyboard-source",
    targetHandle: "videoTracks-target",
  },
  {
    id: "videoTracks-timeline",
    source: "videoTracks",
    target: "timeline",
    sourceHandle: "videoTracks-source",
    targetHandle: "timeline-target",
  },
  {
    id: "timeline-finalOutput",
    source: "timeline",
    target: "finalOutput",
    sourceHandle: "timeline-source",
    targetHandle: "finalOutput-target",
  },
] as const;

const fallbackNodeSize: ProductionNodeSize = { width: 150, height: 50 };
const productionLayoutGap = 80;

const initialProductionLayout: Record<ProductionFlowNodeId, FlowNodePosition> = {
  source: { x: 0, y: 0 },
  script: { x: 900, y: 0 },
  scriptPlan: { x: 1_800, y: 0 },
  assets: { x: 2_100, y: 4_000 },
  worldAssets: { x: 2_700, y: 4_000 },
  storyboardTable: { x: 2_700, y: 0 },
  storyboard: { x: 3_400, y: 0 },
  videoTracks: { x: 3_900, y: 0 },
  timeline: { x: 4_300, y: 0 },
  finalOutput: { x: 4_700, y: 0 },
};

function finitePositive(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function measuredNodeSizes(
  nodeSizes?: Partial<Record<ProductionFlowNodeId, Partial<ProductionNodeSize>>>,
): Record<ProductionFlowNodeId, ProductionNodeSize> {
  return Object.fromEntries(
    productionNodeOrder.map((id) => {
      const measured = nodeSizes?.[id];
      return [
        id,
        {
          width: finitePositive(measured?.width, fallbackNodeSize.width),
          height: finitePositive(measured?.height, fallbackNodeSize.height),
        },
      ];
    }),
  ) as Record<ProductionFlowNodeId, ProductionNodeSize>;
}

/**
 * Match the upstream Vue canvas auto-layout contract: use React Flow's measured
 * dimensions, place the main chain left-to-right with an 80px default gap, and
 * keep assets below the script. Missing measurements alone use Vue Flow's
 * 150x50 fallback.
 */
export function productionAutoLayout(options?: ProductionLayoutOptions): Record<ProductionFlowNodeId, FlowNodePosition> {
  const sizes = measuredNodeSizes(options?.nodeSizes);
  const gap = finitePositive(options?.gap, productionLayoutGap);
  const layout = topologyLevelLayout({
    nodeIds: productionNodeOrder.filter((id) => id !== "worldAssets"),
    edges: productionConnections.filter(({ source, target }) => source !== "worldAssets" && target !== "worldAssets"),
    nodeSizes: sizes,
    underSourceNodeIds: ["assets"],
    gap,
  }) as Omit<Record<ProductionFlowNodeId, FlowNodePosition>, "worldAssets"> & Partial<Record<"worldAssets", FlowNodePosition>>;
  layout.worldAssets = {
    x: layout.assets.x + sizes.assets.width + gap,
    y: layout.assets.y,
  };
  return layout as Record<ProductionFlowNodeId, FlowNodePosition>;
}

export function mergeProductionLayout(layout?: Record<string, FlowNodePosition>): Record<ProductionFlowNodeId, FlowNodePosition> {
  return Object.fromEntries(
    productionNodeOrder.map((id) => {
      const position = layout?.[id];
      return [
        id,
        position && Number.isFinite(position.x) && Number.isFinite(position.y)
          ? { x: position.x, y: position.y }
          : { ...initialProductionLayout[id] },
      ];
    }),
  ) as Record<ProductionFlowNodeId, FlowNodePosition>;
}

export function productionEdges(): Edge[] {
  return productionConnections.map((connection) => ({
    ...connection,
    animated: false,
    style: { stroke: "#00000", strokeWidth: 4 },
  }));
}

export function applyProductionLayout<T extends Node>(nodes: T[], layout: Record<ProductionFlowNodeId, FlowNodePosition>): T[] {
  return nodes.map((node) => ({ ...node, position: layout[node.id as ProductionFlowNodeId] ?? node.position }));
}
