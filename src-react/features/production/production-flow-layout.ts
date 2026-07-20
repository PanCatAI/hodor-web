import type { Edge, Node } from "@xyflow/react";

import type { FlowNodePosition } from "./types";

export const productionNodeOrder = ["script", "scriptPlan", "assets", "storyboardTable", "storyboard", "workbench"] as const;

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

const fallbackNodeSize: ProductionNodeSize = { width: 150, height: 50 };
const productionLayoutGap = 80;

const initialProductionLayout: Record<ProductionFlowNodeId, FlowNodePosition> = {
  script: { x: 0, y: 0 },
  scriptPlan: { x: 900, y: 0 },
  assets: { x: 1_200, y: 4_000 },
  storyboardTable: { x: 1_800, y: 0 },
  storyboard: { x: 2_500, y: 0 },
  workbench: { x: 3_000, y: 0 },
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

function overlaps(firstPosition: FlowNodePosition, firstSize: ProductionNodeSize, secondPosition: FlowNodePosition, secondSize: ProductionNodeSize) {
  return (
    firstPosition.x < secondPosition.x + secondSize.width &&
    firstPosition.x + firstSize.width > secondPosition.x &&
    firstPosition.y < secondPosition.y + secondSize.height &&
    firstPosition.y + firstSize.height > secondPosition.y
  );
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
  const mainChain: ProductionFlowNodeId[] = ["script", "scriptPlan", "storyboardTable", "storyboard", "workbench"];
  const layout = {} as Record<ProductionFlowNodeId, FlowNodePosition>;

  let cursorX = 0;
  for (const id of mainChain) {
    layout[id] = { x: cursorX, y: 0 };
    cursorX += sizes[id].width + gap;
  }

  layout.assets = {
    x: layout.script.x,
    y: layout.script.y + sizes.script.height + gap,
  };

  // Keep the upstream behavior: on the first collision, move that main-chain
  // node and every following node together so their internal gaps stay intact.
  for (let index = 1; index < mainChain.length; index += 1) {
    const id = mainChain[index];
    if (!overlaps(layout.assets, sizes.assets, layout[id], sizes[id])) continue;
    const shift = layout.assets.x + sizes.assets.width + gap - layout[id].x;
    for (let following = index; following < mainChain.length; following += 1) {
      const followingId = mainChain[following];
      layout[followingId] = { ...layout[followingId], x: layout[followingId].x + shift };
    }
    break;
  }

  return layout;
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
