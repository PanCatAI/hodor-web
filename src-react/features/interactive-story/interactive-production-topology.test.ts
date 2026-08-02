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
  it("places every spatial production stage in the main chain", () => {
    expect(interactiveProductionStageOrder).toEqual([
      "script",
      "scriptPlan",
      "assets",
      "storyboardTable",
      "storyboard",
      "sceneMaster",
      "marbleWorld",
      "spatialRegistration",
      "blocking",
      "coverage",
      "previs",
      "previsValidation",
      "formalGeneration",
      "multicamEdit",
      "supervision",
    ]);

    const topology = buildInteractiveProductionTopology(graph);
    expect(topology.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: "scene-1::storyboard", target: "scene-1::sceneMaster" }),
        expect.objectContaining({ source: "scene-1::assets", target: "scene-1::sceneMaster" }),
        expect.objectContaining({ source: "scene-1::sceneMaster", target: "scene-1::marbleWorld" }),
        expect.objectContaining({ source: "scene-1::marbleWorld", target: "scene-1::spatialRegistration" }),
        expect.objectContaining({ source: "scene-1::spatialRegistration", target: "scene-1::blocking" }),
        expect.objectContaining({ source: "scene-1::blocking", target: "scene-1::coverage" }),
        expect.objectContaining({ source: "scene-1::coverage", target: "scene-1::previs" }),
        expect.objectContaining({ source: "scene-1::previs", target: "scene-1::previsValidation" }),
        expect.objectContaining({ source: "scene-1::previsValidation", target: "scene-1::formalGeneration" }),
        expect.objectContaining({ source: "scene-1::formalGeneration", target: "scene-1::multicamEdit" }),
        expect.objectContaining({ source: "scene-1::multicamEdit", target: "scene-1::supervision" }),
      ]),
    );
  });

  it("expands every interactive node into a complete production chain on one canvas", () => {
    const topology = buildInteractiveProductionTopology(graph);

    expect(topology.nodes).toHaveLength(graph.nodes.length * interactiveProductionStageOrder.length + 1);
    expect(topology.nodes).toContainEqual(expect.objectContaining({ id: "world-profile", kind: "worldProfile" }));
    for (const storyNode of graph.nodes) {
      expect(
        topology.nodes
          .filter((node) => node.kind === "production" && node.storyNodeId === storyNode.id)
          .map((node) => node.kind === "production" ? node.stage : null),
      ).toEqual(
        interactiveProductionStageOrder,
      );
    }
  });

  it("connects the project world profile to every root script stage", () => {
    const topology = buildInteractiveProductionTopology(graph);

    expect(topology.edges).toContainEqual(
      expect.objectContaining({
        source: "world-profile",
        target: "scene-1::script",
        kind: "worldProfile",
      }),
    );
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
        source: "scene-1::multicamEdit",
        target: "scene-1::supervision",
        kind: "production",
      }),
    );
  });
});
