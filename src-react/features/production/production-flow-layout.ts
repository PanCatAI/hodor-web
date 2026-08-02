import type { Edge, Node } from "@xyflow/react";

import { topologyLevelLayout } from "@react/features/canvas";
import type { FlowNodePosition } from "./types";

export const productionNodeOrder = [
  "worldProfile",
  "script",
  "scriptPlan",
  "assets",
  "storyboardTable",
  "storyboard",
  "sceneMaster",
  "marbleWorld",
  "spatialRegistration",
  "blocking",
  "coverage",
  "previs",
  "previsValidation",
  "formalGeneration",
  "multicamEdit",
  "workbench",
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
  worldProfile: "项目世界设定",
  script: "原文 / 剧本",
  scriptPlan: "拍摄计划",
  assets: "资产工厂",
  storyboardTable: "分镜表",
  storyboard: "分镜图",
  sceneMaster: "场景母版",
  marbleWorld: "Marble 世界",
  spatialRegistration: "空间注册",
  blocking: "场面调度",
  coverage: "镜头覆盖",
  previs: "Blender 预演",
  previsValidation: "预演校验",
  formalGeneration: "正式生成",
  multicamEdit: "多机位剪辑",
  workbench: "视频工作台",
};

/**
 * The production graph has one asset branch and one fixed main chain. Keeping
 * this topology explicit prevents UI refactors from silently turning it into a
 * misleading linear pipeline.
 */
export const productionConnections = [
  {
    id: "worldProfile-script",
    source: "worldProfile",
    target: "script",
    sourceHandle: "worldProfile-script",
    targetHandle: "script-worldProfile",
  },
  {
    id: "worldProfile-scriptPlan",
    source: "worldProfile",
    target: "scriptPlan",
    sourceHandle: "worldProfile-scriptPlan",
    targetHandle: "scriptPlan-target",
  },
  {
    id: "worldProfile-assets",
    source: "worldProfile",
    target: "assets",
    sourceHandle: "worldProfile-assets",
    targetHandle: "assets-target",
  },
  { id: "script-assets", source: "script", target: "assets", sourceHandle: "script-assets", targetHandle: "assets-target" },
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
    id: "storyboard-sceneMaster",
    source: "storyboard",
    target: "sceneMaster",
    sourceHandle: "storyboard-source",
    targetHandle: "sceneMaster-target",
  },
  { id: "assets-sceneMaster", source: "assets", target: "sceneMaster", sourceHandle: "assets-source", targetHandle: "sceneMaster-target" },
  { id: "sceneMaster-marbleWorld", source: "sceneMaster", target: "marbleWorld", sourceHandle: "sceneMaster-source", targetHandle: "marbleWorld-target" },
  { id: "marbleWorld-spatialRegistration", source: "marbleWorld", target: "spatialRegistration", sourceHandle: "marbleWorld-source", targetHandle: "spatialRegistration-target" },
  { id: "spatialRegistration-blocking", source: "spatialRegistration", target: "blocking", sourceHandle: "spatialRegistration-source", targetHandle: "blocking-target" },
  { id: "blocking-coverage", source: "blocking", target: "coverage", sourceHandle: "blocking-source", targetHandle: "coverage-target" },
  { id: "coverage-previs", source: "coverage", target: "previs", sourceHandle: "coverage-source", targetHandle: "previs-target" },
  { id: "previs-previsValidation", source: "previs", target: "previsValidation", sourceHandle: "previs-source", targetHandle: "previsValidation-target" },
  { id: "previsValidation-formalGeneration", source: "previsValidation", target: "formalGeneration", sourceHandle: "previsValidation-source", targetHandle: "formalGeneration-target" },
  { id: "formalGeneration-multicamEdit", source: "formalGeneration", target: "multicamEdit", sourceHandle: "formalGeneration-source", targetHandle: "multicamEdit-target" },
  { id: "multicamEdit-workbench", source: "multicamEdit", target: "workbench", sourceHandle: "multicamEdit-source", targetHandle: "workbench-target" },
] as const;

const fallbackNodeSize: ProductionNodeSize = { width: 150, height: 50 };
const productionLayoutGap = 80;

const initialProductionLayout: Record<ProductionFlowNodeId, FlowNodePosition> = {
  worldProfile: { x: -900, y: 0 },
  script: { x: 0, y: 0 },
  scriptPlan: { x: 900, y: 0 },
  assets: { x: 1_200, y: 4_000 },
  storyboardTable: { x: 1_800, y: 0 },
  storyboard: { x: 2_500, y: 0 },
  sceneMaster: { x: 3_000, y: 0 },
  marbleWorld: { x: 3_390, y: 0 },
  spatialRegistration: { x: 3_780, y: 0 },
  blocking: { x: 4_170, y: 0 },
  coverage: { x: 4_560, y: 0 },
  previs: { x: 4_950, y: 0 },
  previsValidation: { x: 5_340, y: 0 },
  formalGeneration: { x: 5_730, y: 0 },
  multicamEdit: { x: 6_120, y: 0 },
  workbench: { x: 6_510, y: 0 },
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
  return topologyLevelLayout({
    nodeIds: [...productionNodeOrder],
    edges: productionConnections,
    nodeSizes: sizes,
    underSourceNodeIds: ["assets"],
    gap,
  }) as Record<ProductionFlowNodeId, FlowNodePosition>;
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
