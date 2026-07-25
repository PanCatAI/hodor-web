import { describe, expect, it } from "vitest";

import {
  mergeProductionLayout,
  productionAutoLayout,
  productionConnections,
  productionEdges,
  type ProductionFlowNodeId,
  type ProductionNodeSize,
} from "./production-flow-layout";

const initialPositions = {
  source: { x: 0, y: 0 },
  script: { x: 900, y: 0 },
  scriptPlan: { x: 1_800, y: 0 },
  assets: { x: 2_100, y: 4_000 },
  storyboardTable: { x: 2_700, y: 0 },
  storyboard: { x: 3_400, y: 0 },
  videoTracks: { x: 3_900, y: 0 },
  timeline: { x: 4_300, y: 0 },
  finalOutput: { x: 4_700, y: 0 },
};

function rectanglesOverlap(
  firstId: ProductionFlowNodeId,
  secondId: ProductionFlowNodeId,
  layout: ReturnType<typeof productionAutoLayout>,
  sizes: Record<ProductionFlowNodeId, ProductionNodeSize>,
) {
  const first = { ...layout[firstId], ...sizes[firstId] };
  const second = { ...layout[secondId], ...sizes[secondId] };
  return (
    first.x < second.x + second.width && first.x + first.width > second.x && first.y < second.y + second.height && first.y + first.height > second.y
  );
}

describe("production flow contract", () => {
  it("keeps assets as a script branch and preserves the main production chain", () => {
    const connections: readonly string[] = productionConnections.map(({ source, target }) => `${source}->${target}`);
    expect(connections).toEqual([
      "source->script",
      "script->assets",
      "script->scriptPlan",
      "scriptPlan->storyboardTable",
      "storyboardTable->storyboard",
      "storyboard->videoTracks",
      "videoTracks->timeline",
      "timeline->finalOutput",
    ]);
    expect(connections).not.toContain("assets->storyboardTable");
  });

  it("uses the same untyped default bezier edges and style as the upstream canvas", () => {
    expect(productionEdges()).toEqual(
      productionConnections.map((connection) => ({
        ...connection,
        animated: false,
        style: { stroke: "#00000", strokeWidth: 4 },
      })),
    );
    expect(productionEdges().every((edge) => edge.type === undefined)).toBe(true);
  });

  it("uses the upstream canvas initial positions", () => {
    expect(mergeProductionLayout()).toEqual(initialPositions);
  });

  it("preserves valid saved positions and repairs invalid entries with upstream positions", () => {
    const layout = mergeProductionLayout({
      script: { x: 42, y: 84 },
      assets: { x: Number.NaN, y: 1 },
    });

    expect(layout.script).toEqual({ x: 42, y: 84 });
    expect(layout.assets).toEqual(initialPositions.assets);
    expect(layout.finalOutput).toEqual(initialPositions.finalOutput);
  });

  it("lays out the main chain from measured widths with a fixed 80px gap", () => {
    const nodeSizes: Record<ProductionFlowNodeId, ProductionNodeSize> = {
      source: { width: 400, height: 260 },
      script: { width: 731, height: 517 },
      scriptPlan: { width: 642, height: 498 },
      assets: { width: 300, height: 260 },
      storyboardTable: { width: 413, height: 451 },
      storyboard: { width: 804, height: 650 },
      videoTracks: { width: 500, height: 540 },
      timeline: { width: 500, height: 540 },
      finalOutput: { width: 400, height: 300 },
    };

    expect(productionAutoLayout({ nodeSizes })).toEqual({
      source: { x: 0, y: 0 },
      script: { x: 480, y: 0 },
      scriptPlan: { x: 1_291, y: 0 },
      storyboardTable: { x: 2_013, y: 0 },
      storyboard: { x: 2_506, y: 0 },
      videoTracks: { x: 3_390, y: 0 },
      timeline: { x: 3_970, y: 0 },
      finalOutput: { x: 4_550, y: 0 },
      assets: { x: 480, y: 597 },
    });
  });

  it("falls back to 150x50 only for missing or invalid measurements", () => {
    const layout = productionAutoLayout({
      nodeSizes: {
        script: { width: 400, height: 300 },
        scriptPlan: { width: Number.NaN, height: 300 },
      },
    });

    expect(layout).toEqual({
      source: { x: 0, y: 0 },
      script: { x: 230, y: 0 },
      scriptPlan: { x: 710, y: 0 },
      storyboardTable: { x: 940, y: 0 },
      storyboard: { x: 1_170, y: 0 },
      videoTracks: { x: 1_400, y: 0 },
      timeline: { x: 1_630, y: 0 },
      finalOutput: { x: 1_860, y: 0 },
      assets: { x: 230, y: 380 },
    });
  });

  it("keeps the optional gap input for existing callers", () => {
    const layout = productionAutoLayout({
      gap: 96,
      nodeSizes: {
        script: { width: 400, height: 300 },
      },
    });

    expect(layout.scriptPlan).toEqual({ x: 742, y: 0 });
    expect(layout.assets).toEqual({ x: 246, y: 396 });
  });

  it("moves the colliding main-chain node and every following node to the right", () => {
    const nodeSizes: Record<ProductionFlowNodeId, ProductionNodeSize> = {
      source: { width: 100, height: 100 },
      script: { width: 100, height: 100 },
      scriptPlan: { width: 100, height: 400 },
      assets: { width: 500, height: 200 },
      storyboardTable: { width: 100, height: 400 },
      storyboard: { width: 100, height: 400 },
      videoTracks: { width: 100, height: 400 },
      timeline: { width: 100, height: 400 },
      finalOutput: { width: 100, height: 400 },
    };

    const first = productionAutoLayout({ nodeSizes });
    const second = productionAutoLayout({ nodeSizes });

    expect(second).toEqual(first);
    expect(first).toEqual({
      source: { x: 0, y: 0 },
      script: { x: 180, y: 0 },
      scriptPlan: { x: 760, y: 0 },
      storyboardTable: { x: 940, y: 0 },
      storyboard: { x: 1_120, y: 0 },
      videoTracks: { x: 1_300, y: 0 },
      timeline: { x: 1_480, y: 0 },
      finalOutput: { x: 1_660, y: 0 },
      assets: { x: 180, y: 180 },
    });
    expect(rectanglesOverlap("assets", "scriptPlan", first, nodeSizes)).toBe(false);
  });
});
