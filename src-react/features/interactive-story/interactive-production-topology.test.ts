import { describe, expect, it } from "vitest";

import { buildInteractiveProductionTopology, interactiveProductionStageOrder } from "./interactive-production-topology";
import type { InteractiveStoryGraph } from "./types";

const graph: InteractiveStoryGraph = {
  id: "graph-7",
  projectId: 7,
  title: "雨夜抉择",
  entryNodeId: "scene-1",
  status: "ready",
  revision: 1,
  createdAt: 1,
  updatedAt: 1,
  variables: [],
  nodes: [
    {
      id: "scene-1",
      graphId: "graph-7",
      scriptId: 12,
      kind: "scene",
      title: "锁住的房间",
      summary: "主角发现门后的秘密。",
      position: { x: 0, y: 0 },
      status: "ready",
      script: { id: 12, name: "锁住的房间", content: "INT. ROOM", createTime: 1 },
      createdAt: 1,
      updatedAt: 1,
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
      script: { id: 13, name: "真相", content: "EXT. STREET", createTime: 1 },
      createdAt: 1,
      updatedAt: 1,
    },
  ],
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
};

describe("interactive production topology", () => {
  it("expands every interactive node into a complete production chain on one canvas", () => {
    const topology = buildInteractiveProductionTopology(graph);

    expect(topology.nodes).toHaveLength(graph.nodes.length * interactiveProductionStageOrder.length);
    for (const storyNode of graph.nodes) {
      expect(topology.nodes.filter((node) => node.storyNodeId === storyNode.id).map((node) => node.stage)).toEqual(
        interactiveProductionStageOrder,
      );
    }
  });

  it("connects branch choices from the completed source chain to the target script", () => {
    const topology = buildInteractiveProductionTopology(graph);

    expect(topology.edges).toContainEqual(
      expect.objectContaining({
        id: "choice:edge-1",
        source: "scene-1::supervision",
        target: "ending-1::script",
        label: "推开门",
        kind: "choice",
      }),
    );
    expect(topology.edges).toContainEqual(
      expect.objectContaining({
        source: "scene-1::workbench",
        target: "scene-1::supervision",
        kind: "production",
      }),
    );
  });
});
