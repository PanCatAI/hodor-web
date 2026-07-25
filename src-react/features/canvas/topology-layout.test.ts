import { describe, expect, it } from "vitest";

import { topologyLevelLayout } from "./topology-layout";

describe("topologyLevelLayout", () => {
  it("places graph nodes by edge depth and stacks sibling branches in the same level", () => {
    expect(
      topologyLevelLayout({
        nodeIds: ["entry", "choice-a", "choice-b", "ending"],
        edges: [
          { source: "entry", target: "choice-a" },
          { source: "entry", target: "choice-b" },
          { source: "choice-a", target: "ending" },
          { source: "choice-b", target: "ending" },
        ],
        nodeSizes: {
          entry: { width: 300, height: 120 },
          "choice-a": { width: 320, height: 140 },
          "choice-b": { width: 320, height: 160 },
          ending: { width: 280, height: 120 },
        },
        gap: 80,
      }),
    ).toEqual({
      entry: { x: 0, y: 0 },
      "choice-a": { x: 380, y: 0 },
      "choice-b": { x: 380, y: 220 },
      ending: { x: 780, y: 0 },
    });
  });

  it("supports the production asset branch below its source while keeping topology collision-free", () => {
    expect(
      topologyLevelLayout({
        nodeIds: ["script", "scriptPlan", "assets", "storyboard"],
        edges: [
          { source: "script", target: "assets" },
          { source: "script", target: "scriptPlan" },
          { source: "scriptPlan", target: "storyboard" },
        ],
        underSourceNodeIds: ["assets"],
        nodeSizes: {
          script: { width: 100, height: 100 },
          scriptPlan: { width: 100, height: 400 },
          assets: { width: 500, height: 200 },
          storyboard: { width: 100, height: 400 },
        },
        gap: 80,
      }),
    ).toEqual({
      script: { x: 0, y: 0 },
      scriptPlan: { x: 580, y: 0 },
      assets: { x: 0, y: 180 },
      storyboard: { x: 760, y: 0 },
    });
  });
});
