import { describe, expect, it } from "vitest";

import { mergeProductionLayout, productionConnections } from "./production-flow-layout";

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
});
