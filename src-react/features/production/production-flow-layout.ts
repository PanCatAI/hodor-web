import type { Edge, Node } from "@xyflow/react";

import type { FlowNodePosition } from "./types";

export const productionNodeOrder = ["script", "scriptPlan", "assets", "storyboardTable", "storyboard", "workbench"] as const;

export type ProductionFlowNodeId = (typeof productionNodeOrder)[number];

export const productionNodeLabels: Record<ProductionFlowNodeId, string> = {
  script: "原文 / 剧本",
  scriptPlan: "拍摄计划",
  assets: "资产工厂",
  storyboardTable: "分镜表",
  storyboard: "分镜图",
  workbench: "视频工作台",
};

/**
 * The production graph has one asset branch and one fixed main chain. Keeping
 * this topology explicit prevents UI refactors from silently turning it into a
 * misleading linear pipeline.
 */
export const productionConnections = [
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
    id: "storyboard-workbench",
    source: "storyboard",
    target: "workbench",
    sourceHandle: "storyboard-source",
    targetHandle: "workbench-target",
  },
] as const;

export function productionAutoLayout(): Record<ProductionFlowNodeId, FlowNodePosition> {
  return {
    script: { x: 0, y: 0 },
    scriptPlan: { x: 720, y: 0 },
    storyboardTable: { x: 1_440, y: 0 },
    storyboard: { x: 2_160, y: 0 },
    workbench: { x: 3_040, y: 0 },
    assets: { x: 0, y: 520 },
  };
}

export function mergeProductionLayout(layout?: Record<string, FlowNodePosition>): Record<ProductionFlowNodeId, FlowNodePosition> {
  const defaults = productionAutoLayout();
  return Object.fromEntries(
    productionNodeOrder.map((id) => {
      const position = layout?.[id];
      return [id, position && Number.isFinite(position.x) && Number.isFinite(position.y) ? { x: position.x, y: position.y } : defaults[id]];
    }),
  ) as Record<ProductionFlowNodeId, FlowNodePosition>;
}

export function productionEdges(): Edge[] {
  return productionConnections.map((connection) => ({
    ...connection,
    type: "production",
    selectable: false,
    focusable: false,
    animated: false,
    style: { stroke: "#475569", strokeWidth: 2.5 },
  }));
}

export function applyProductionLayout<T extends Node>(nodes: T[], layout: Record<ProductionFlowNodeId, FlowNodePosition>): T[] {
  return nodes.map((node) => ({ ...node, position: layout[node.id as ProductionFlowNodeId] ?? node.position }));
}
