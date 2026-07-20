import { describe, expect, it } from "vitest";

import {
  estimateProductionNodeSizes,
  mergeProductionLayout,
  productionAutoLayout,
  productionConnections,
  type ProductionFlowNodeId,
  type ProductionNodeSize,
} from "./production-flow-layout";

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

function expectNoOverlap(layout: ReturnType<typeof productionAutoLayout>, sizes: Record<ProductionFlowNodeId, ProductionNodeSize>) {
  const ids = Object.keys(layout) as ProductionFlowNodeId[];
  for (let left = 0; left < ids.length; left += 1) {
    for (let right = left + 1; right < ids.length; right += 1) {
      expect(rectanglesOverlap(ids[left], ids[right], layout, sizes), `${ids[left]} overlaps ${ids[right]}`).toBe(false);
    }
  }
}

describe("production flow contract", () => {
  it("keeps assets as a script branch and preserves the main production chain", () => {
    const connections: readonly string[] = productionConnections.map(({ source, target }) => `${source}->${target}`);
    expect(connections).toEqual([
      "script->assets",
      "script->scriptPlan",
      "scriptPlan->storyboardTable",
      "storyboardTable->storyboard",
      "storyboard->workbench",
    ]);
    expect(connections).not.toContain("assets->storyboardTable");
  });

  it("preserves valid saved positions and repairs invalid layout entries", () => {
    const layout = mergeProductionLayout({
      script: { x: 42, y: 84 },
      assets: { x: Number.NaN, y: 1 },
    });

    expect(layout.script).toEqual({ x: 42, y: 84 });
    expect(layout.assets).toEqual({ x: 0, y: 520 });
    expect(layout.workbench).toEqual({ x: 3_040, y: 0 });
  });

  it.each([1, 20, 100])("lays out %i assets without overlapping the main chain", (assetCount) => {
    const sizes = estimateProductionNodeSizes({ assetCount, storyboardCount: 1 });
    const first = productionAutoLayout({ nodeSizes: sizes });
    const second = productionAutoLayout({ nodeSizes: sizes });

    expect(second).toEqual(first);
    expect(first.assets.x).toBe(first.script.x);
    expect(first.assets.y).toBe(first.script.y + sizes.script.height + 80);
    expectNoOverlap(first, sizes);
  });

  it.each([1, 50, 100])("lays out %i storyboards deterministically without overlap", (storyboardCount) => {
    const sizes = estimateProductionNodeSizes({ assetCount: 1, storyboardCount });
    const first = productionAutoLayout({ nodeSizes: sizes });
    const second = productionAutoLayout({ nodeSizes: sizes });

    expect(second).toEqual(first);
    expectNoOverlap(first, sizes);
  });

  it("prefers measured dimensions and keeps at least the configured gap", () => {
    const sizes = estimateProductionNodeSizes({
      assetCount: 100,
      storyboardCount: 100,
      measured: {
        script: { width: 731, height: 517 },
        scriptPlan: { width: 642, height: 498 },
      },
    });
    const layout = productionAutoLayout({ nodeSizes: sizes, gap: 96 });

    expect(sizes.script).toEqual({ width: 731, height: 517 });
    expect(layout.scriptPlan.x).toBeGreaterThanOrEqual(layout.script.x + sizes.script.width + 96);
    expect(layout.assets.y).toBe(layout.script.y + sizes.script.height + 96);
    expectNoOverlap(layout, sizes);
  });
});
