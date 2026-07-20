import type { Edge, Node } from "@xyflow/react";

import type { FlowNodePosition } from "./types";

export const productionNodeOrder = ["script", "scriptPlan", "assets", "storyboardTable", "storyboard", "workbench"] as const;

export type ProductionFlowNodeId = (typeof productionNodeOrder)[number];

export interface ProductionNodeSize {
  width: number;
  height: number;
}

export interface ProductionContentCounts {
  assetCount: number;
  storyboardCount: number;
  measured?: Partial<Record<ProductionFlowNodeId, Partial<ProductionNodeSize>>>;
}

export interface ProductionLayoutOptions {
  nodeSizes?: Partial<Record<ProductionFlowNodeId, ProductionNodeSize>>;
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

const estimatedProductionNodeSizes: Record<ProductionFlowNodeId, ProductionNodeSize> = {
  script: { width: 560, height: 420 },
  scriptPlan: { width: 560, height: 420 },
  assets: { width: 680, height: 400 },
  storyboardTable: { width: 620, height: 460 },
  storyboard: { width: 780, height: 380 },
  workbench: { width: 420, height: 350 },
};

function finitePositive(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * Estimate the rendered node bounds before React Flow has measured them. The
 * assets and storyboard nodes scroll internally, so their canvas footprint is
 * capped even for very large projects.
 */
export function estimateProductionNodeSizes({
  assetCount,
  storyboardCount,
  measured,
}: ProductionContentCounts): Record<ProductionFlowNodeId, ProductionNodeSize> {
  const safeAssetCount = Math.max(0, Math.floor(finitePositive(assetCount, 0)));
  const safeStoryboardCount = Math.max(0, Math.floor(finitePositive(storyboardCount, 0)));
  const estimated = {
    ...estimatedProductionNodeSizes,
    assets: {
      width: estimatedProductionNodeSizes.assets.width,
      height: Math.min(730, Math.max(300, 120 + Math.max(1, safeAssetCount) * 280)),
    },
    storyboard: {
      width: estimatedProductionNodeSizes.storyboard.width,
      height: Math.min(670, Math.max(310, 100 + Math.ceil(Math.max(1, safeStoryboardCount) / 3) * 250)),
    },
  } satisfies Record<ProductionFlowNodeId, ProductionNodeSize>;

  return Object.fromEntries(
    productionNodeOrder.map((id) => {
      const actual = measured?.[id];
      return [
        id,
        {
          width: finitePositive(actual?.width, estimated[id].width),
          height: finitePositive(actual?.height, estimated[id].height),
        },
      ];
    }),
  ) as Record<ProductionFlowNodeId, ProductionNodeSize>;
}

function legacyProductionLayout(): Record<ProductionFlowNodeId, FlowNodePosition> {
  return {
    script: { x: 0, y: 0 },
    scriptPlan: { x: 720, y: 0 },
    storyboardTable: { x: 1_440, y: 0 },
    storyboard: { x: 2_160, y: 0 },
    workbench: { x: 3_040, y: 0 },
    assets: { x: 0, y: 520 },
  };
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
 * Place the fixed main chain from left to right and keep the assets branch
 * below the script. Supplying dimensions produces an edge-aware layout; the
 * zero-argument form retains saved-layout compatibility with earlier builds.
 */
export function productionAutoLayout(options?: ProductionLayoutOptions): Record<ProductionFlowNodeId, FlowNodePosition> {
  if (!options?.nodeSizes) return legacyProductionLayout();

  const gap = Math.max(24, finitePositive(options.gap, 80));
  const sizes = Object.fromEntries(
    productionNodeOrder.map((id) => {
      const supplied = options.nodeSizes?.[id];
      const fallback = estimatedProductionNodeSizes[id];
      return [
        id,
        {
          width: finitePositive(supplied?.width, fallback.width),
          height: finitePositive(supplied?.height, fallback.height),
        },
      ];
    }),
  ) as Record<ProductionFlowNodeId, ProductionNodeSize>;
  const mainChain: ProductionFlowNodeId[] = ["script", "scriptPlan", "storyboardTable", "storyboard", "workbench"];
  const layout = {} as Record<ProductionFlowNodeId, FlowNodePosition>;

  let cursorX = 0;
  for (const id of mainChain) {
    layout[id] = { x: cursorX, y: 0 };
    cursorX += sizes[id].width + gap;
  }

  layout.assets = { x: layout.script.x, y: layout.script.y + sizes.script.height + gap };

  // A measured node may be taller or wider than its estimate. If the branch
  // then intersects the main chain, shift that node and all following ranks.
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
