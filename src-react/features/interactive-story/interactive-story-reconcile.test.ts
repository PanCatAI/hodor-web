import { describe, expect, it, vi } from "vitest";
import type { Node } from "@xyflow/react";
import type { CinematicCoverageAggregate } from "@react/features/production";

import { patchInteractiveStoryCoverageNodes, reconcileInteractiveStoryCanvasNodes } from "./interactive-story-canvas";
import type { InteractiveStoryGraph } from "./types";

describe("interactive canvas node reconciliation", () => {
  it("keeps the node array itself when a poll returns no visible changes", () => {
    const current = [
      { id: "scene-1::coverage", position: { x: 3, y: 4 }, data: { status: "running" } },
    ] as Node[];

    const next = reconcileInteractiveStoryCanvasNodes(current, [{ ...current[0], data: current[0]?.data }] as Node[]);

    expect(next).toBe(current);
  });

  it("keeps unchanged node objects and every existing node position while polling", () => {
    const open = vi.fn();
    const current = [
      {
        id: "scene-1::coverage",
        type: "interactiveProductionStage",
        position: { x: 931, y: 247 },
        data: { stage: "coverage", status: "running", onOpenStage: open },
      },
      {
        id: "scene-1::previs",
        type: "interactiveProductionStage",
        position: { x: 1288, y: 247 },
        data: { stage: "previs", status: "idle", onOpenStage: open },
      },
    ] as Node[];
    const desired = [
      {
        ...current[0],
        position: { x: 100, y: 100 },
        data: current[0].data,
      },
      {
        ...current[1],
        position: { x: 500, y: 100 },
        data: { ...current[1].data, status: "completed" },
      },
    ] as Node[];

    const next = reconcileInteractiveStoryCanvasNodes(current, desired);

    expect(next[0]).toBe(current[0]);
    expect(next[1]).not.toBe(current[1]);
    expect(next[1]?.position).toEqual({ x: 1288, y: 247 });
    expect(next.map((node) => node.id)).toEqual(["scene-1::coverage", "scene-1::previs"]);
  });

  it("adds and removes nodes without rebuilding retained nodes", () => {
    const retained = { id: "scene-1::coverage", position: { x: 3, y: 4 }, data: { status: "idle" } } as Node;
    const removed = { id: "scene-1::legacy", position: { x: 5, y: 6 }, data: {} } as Node;
    const added = { id: "scene-1::previs", position: { x: 7, y: 8 }, data: {} } as Node;

    const next = reconcileInteractiveStoryCanvasNodes([retained, removed], [{ ...retained }, added]);

    expect(next).toHaveLength(2);
    expect(next[0]).toBe(retained);
    expect(next[1]).toBe(added);
  });

  it("does not rebuild any canvas node when coverage references are unchanged", () => {
    const coverage: CinematicCoverageAggregate[] = [];
    const current = [
      { id: "scene-1::coverage", type: "interactiveProductionStage", position: { x: 11, y: 12 }, data: { storyNodeId: "scene-1", stage: "coverage", coverages: coverage } },
      { id: "scene-1::script", type: "interactiveStory", position: { x: 21, y: 22 }, data: { storyNodeId: "scene-1" } },
    ] as Node[];
    const graph = { nodes: [{ id: "scene-1", scriptId: 12 }] } as InteractiveStoryGraph;

    const next = patchInteractiveStoryCoverageNodes(current, graph, { 12: coverage }, { 12: coverage });

    expect(next).toBe(current);
    expect(next[0]).toBe(current[0]);
    expect(next[1]).toBe(current[1]);
  });

  it("updates only coverage-backed nodes for the changed script and preserves positions", () => {
    const first: CinematicCoverageAggregate[] = [];
    const changed = [{}] as CinematicCoverageAggregate[];
    const other: CinematicCoverageAggregate[] = [];
    const current = [
      { id: "scene-1::coverage", type: "interactiveProductionStage", position: { x: 111, y: 112 }, data: { storyNodeId: "scene-1", stage: "coverage", coverages: first } },
      { id: "scene-1::script", type: "interactiveStory", position: { x: 121, y: 122 }, data: { storyNodeId: "scene-1" } },
      { id: "scene-2::coverage", type: "interactiveProductionStage", position: { x: 211, y: 212 }, data: { storyNodeId: "scene-2", stage: "coverage", coverages: other } },
    ] as Node[];
    const graph = { nodes: [{ id: "scene-1", scriptId: 12 }, { id: "scene-2", scriptId: 13 }] } as InteractiveStoryGraph;

    const next = patchInteractiveStoryCoverageNodes(current, graph, { 12: first, 13: other }, { 12: changed, 13: other });

    expect(next).not.toBe(current);
    expect(next[0]).not.toBe(current[0]);
    expect(next[0]?.data.coverages).toBe(changed);
    expect(next[0]?.position).toEqual({ x: 111, y: 112 });
    expect(next[1]).toBe(current[1]);
    expect(next[2]).toBe(current[2]);
  });
});
