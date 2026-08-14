import { describe, expect, it } from "vitest";

import { coordinateProductionGraphNodes, coordinateProjectCanvasNodes } from "./project-canvas-node-coordinator";
import { buildDualProjectFixture } from "@react/features/production-graph/production-graph-fixture";
import type { InteractiveStoryGraph } from "@react/features/interactive-story";

describe("coordinateProductionGraphNodes", () => {
  it("keeps unchanged node objects by stable id while replacing only changed nodes", () => {
    const fixture = buildDualProjectFixture();
    const first = coordinateProductionGraphNodes(fixture.snapshots.p1Initial, new Map());
    const changed = fixture.snapshots.p1Initial.nodes.map((node) =>
      node.id === "node-a" ? { ...node, status: "running" as const, updatedAt: node.updatedAt + 1 } : node,
    );

    const second = coordinateProductionGraphNodes(
      { ...fixture.snapshots.p1Initial, nodes: changed },
      new Map(first.map((node) => [node.id, node])),
    );

    expect(second.find((node) => node.id === "node-b")).toBe(first.find((node) => node.id === "node-b"));
    expect(second.find((node) => node.id === "node-a")).not.toBe(first.find((node) => node.id === "node-a"));
    expect(second.find((node) => node.id === "node-a")?.data.status).toBe("running");
  });
});

describe("coordinateProjectCanvasNodes", () => {
  it("namespaces interactive story nodes into the same stable canvas without remounting production nodes", () => {
    const fixture = buildDualProjectFixture();
    const interactive: InteractiveStoryGraph = {
      id: "story-graph-7",
      projectId: 7,
      title: "互动剧情",
      entryNodeId: "scene-1",
      status: "ready",
      revision: 3,
      nodes: [{ id: "scene-1", graphId: "story-graph-7", scriptId: 19, kind: "scene", title: "雨夜开场", summary: "等待观众选择", position: { x: 120, y: 80 }, status: "ready", script: null, createdAt: 1, updatedAt: 2 }],
      edges: [],
      variables: [],
      createdAt: 1,
      updatedAt: 2,
    };

    const first = coordinateProjectCanvasNodes(fixture.snapshots.p1Initial, interactive, new Map());
    const production = first.find((node) => node.id === "node-a");
    const story = first.find((node) => node.id === "interactive:story-graph-7:scene-1");

    expect(story?.data).toMatchObject({ source: "interactive-story", sourceRef: "scene-1", title: "雨夜开场", status: "ready" });

    const second = coordinateProjectCanvasNodes(
      fixture.snapshots.p1Initial,
      { ...interactive, revision: 4 },
      new Map(first.map((node) => [node.id, node])),
    );
    expect(second.find((node) => node.id === "node-a")).toBe(production);
    expect(second.find((node) => node.id === "interactive:story-graph-7:scene-1")).toBe(story);
  });
});
