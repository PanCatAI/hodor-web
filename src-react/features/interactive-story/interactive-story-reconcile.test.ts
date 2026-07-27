import { describe, expect, it, vi } from "vitest";

import * as canvasModule from "./interactive-story-canvas";
import type { InteractiveStoryGraph } from "./types";

const reconcileInteractiveStoryNodes = (
  canvasModule as typeof canvasModule & {
    reconcileInteractiveStoryNodes?: (
      current: unknown[],
      graph: InteractiveStoryGraph,
      selectedNodeId: string | null,
      onOpenProduction: (scriptId: number) => void,
    ) => unknown[];
  }
).reconcileInteractiveStoryNodes;
const reconcileInteractiveStoryEdges = (
  canvasModule as typeof canvasModule & {
    reconcileInteractiveStoryEdges?: (current: unknown[], graph: InteractiveStoryGraph) => unknown[];
  }
).reconcileInteractiveStoryEdges;

function graph(summary = "开场", revision = 0): InteractiveStoryGraph {
  return {
    id: "graph-7",
    projectId: 7,
    title: "雨夜抉择",
    entryNodeId: "scene-1",
    status: "draft",
    revision,
    createdAt: 1,
    updatedAt: revision + 1,
    variables: [],
    edges: [
      {
        id: "edge-1",
        graphId: "graph-7",
        sourceNodeId: "scene-1",
        targetNodeId: "ending-1",
        choiceText: "推开门",
        condition: null,
        effects: [],
        priority: 0,
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    nodes: [
      {
        id: "scene-1",
        graphId: "graph-7",
        scriptId: 12,
        kind: "scene",
        title: "锁住的房间",
        summary,
        position: { x: 0, y: 0 },
        status: "ready",
        script: { id: 12, name: "锁住的房间", content: "", createTime: 1 },
        createdAt: 1,
        updatedAt: revision + 1,
      },
      {
        id: "ending-1",
        graphId: "graph-7",
        scriptId: 13,
        kind: "ending",
        title: "真相",
        summary: "秘密被公开。",
        position: { x: 560, y: 0 },
        status: "draft",
        script: { id: 13, name: "真相", content: "", createTime: 1 },
        createdAt: 1,
        updatedAt: 1,
      },
    ],
  };
}

describe("interactive story component refresh", () => {
  it("keeps unchanged React Flow node objects during a graph refresh", () => {
    expect(typeof reconcileInteractiveStoryNodes).toBe("function");
    const openProduction = vi.fn();
    const initial = reconcileInteractiveStoryNodes!([], graph(), "scene-1", openProduction);
    const refreshed = reconcileInteractiveStoryNodes!(initial, graph(), "scene-1", openProduction);

    expect(refreshed[0]).toBe(initial[0]);
    expect(refreshed[1]).toBe(initial[1]);
  });

  it("replaces only the node whose persisted content changed", () => {
    expect(typeof reconcileInteractiveStoryNodes).toBe("function");
    const openProduction = vi.fn();
    const initial = reconcileInteractiveStoryNodes!([], graph(), "scene-1", openProduction);
    const refreshed = reconcileInteractiveStoryNodes!(initial, graph("改写后的开场", 1), "scene-1", openProduction);

    expect(refreshed[0]).not.toBe(initial[0]);
    expect(refreshed[1]).toBe(initial[1]);
  });

  it("keeps unchanged edge objects while refreshing node components", () => {
    expect(typeof reconcileInteractiveStoryEdges).toBe("function");
    const initial = reconcileInteractiveStoryEdges!([], graph());
    const refreshed = reconcileInteractiveStoryEdges!(initial, graph("改写后的开场", 1));

    expect(refreshed[0]).toBe(initial[0]);
  });
});
