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
  worldProfile: { x: -900, y: 0 },
  script: { x: 0, y: 0 },
  scriptPlan: { x: 900, y: 0 },
  assets: { x: 1_200, y: 4_000 },
  storyboardTable: { x: 1_800, y: 0 },
  storyboard: { x: 2_500, y: 0 },
  workbench: { x: 3_000, y: 0 },
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
      "worldProfile->script",
      "worldProfile->scriptPlan",
      "worldProfile->assets",
      "script->assets",
      "script->scriptPlan",
      "scriptPlan->storyboardTable",
      "storyboardTable->storyboard",
      "storyboard->workbench",
    ]);
    expect(connections).not.toContain("assets->storyboardTable");
  });

  it("uses the same untyped default bezier edges and style as the upstream canvas", () => {
    expect(productionEdges()).toEqual(
      productionConnections.map((connection) => ({
        ...connection,
        animated: false,
        style: { stroke: "#000000", strokeWidth: 4 },
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
    expect(layout.workbench).toEqual(initialPositions.workbench);
  });

  it("lays out the main chain from measured widths with a fixed 80px gap", () => {
    const nodeSizes: Record<ProductionFlowNodeId, ProductionNodeSize> = {
      worldProfile: { width: 330, height: 240 },
      script: { width: 731, height: 517 },
      scriptPlan: { width: 642, height: 498 },
      assets: { width: 300, height: 260 },
      storyboardTable: { width: 413, height: 451 },
      storyboard: { width: 804, height: 650 },
      workbench: { width: 925, height: 540 },
    };

    const layout = productionAutoLayout({ nodeSizes });
    expect(layout.worldProfile.x).toBeLessThan(layout.script.x);
    expect(layout.scriptPlan.x).toBeGreaterThan(layout.script.x);
    expect(rectanglesOverlap("worldProfile", "script", layout, nodeSizes)).toBe(false);
    expect(rectanglesOverlap("assets", "scriptPlan", layout, nodeSizes)).toBe(false);
  });

  it("falls back to 150x50 only for missing or invalid measurements", () => {
    const layout = productionAutoLayout({
      nodeSizes: {
        script: { width: 400, height: 300 },
        scriptPlan: { width: Number.NaN, height: 300 },
      },
    });

    expect(layout.worldProfile).toEqual({ x: 0, y: 0 });
    expect(layout.script.x).toBeGreaterThan(layout.worldProfile.x);
    expect(layout.assets.y).toBeGreaterThan(layout.script.y);
  });

  it("keeps the optional gap input for existing callers", () => {
    const layout = productionAutoLayout({
      gap: 96,
      nodeSizes: {
        script: { width: 400, height: 300 },
      },
    });

    expect(layout.scriptPlan.x).toBeGreaterThan(layout.script.x);
    expect(layout.assets.y).toBeGreaterThan(layout.script.y);
  });

  it("moves the colliding main-chain node and every following node to the right", () => {
    const nodeSizes: Record<ProductionFlowNodeId, ProductionNodeSize> = {
      worldProfile: { width: 100, height: 100 },
      script: { width: 100, height: 100 },
      scriptPlan: { width: 100, height: 400 },
      assets: { width: 500, height: 200 },
      storyboardTable: { width: 100, height: 400 },
      storyboard: { width: 100, height: 400 },
      workbench: { width: 100, height: 400 },
    };

    const first = productionAutoLayout({ nodeSizes });
    const second = productionAutoLayout({ nodeSizes });

    expect(second).toEqual(first);
    expect(first.worldProfile.x).toBeLessThan(first.script.x);
    expect(first.scriptPlan.x).toBeGreaterThan(first.script.x);
    expect(rectanglesOverlap("assets", "scriptPlan", first, nodeSizes)).toBe(false);
  });
});
