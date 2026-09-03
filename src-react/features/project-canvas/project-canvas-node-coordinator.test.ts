import { describe, expect, it } from "vitest";

import {
  canvasFramingKey,
  coordinateProductionGraphNodes,
  coordinateProjectCanvasNodes,
  PROJECT_CANVAS_DEFAULT_VIEWPORT,
  PROJECT_CANVAS_NODE_SIZE,
  projectCanvasFitViewOptions,
  shouldReframeCanvas,
} from "./project-canvas-node-coordinator";
import { buildDualProjectFixture, fixtureEdge, fixtureNode } from "@react/features/production-graph/production-graph-fixture";
import type { InteractiveStoryGraph } from "@react/features/interactive-story";
import type { ProductionGraphSnapshot } from "@react/features/production-graph";

const NODE_SIZE = PROJECT_CANVAS_NODE_SIZE;

function assertNoOverlap(nodes: { id: string; position: { x: number; y: number } }[]) {
  const boxes = nodes.map((node) => ({ ...node, width: NODE_SIZE.width, height: NODE_SIZE.height }));
  for (let left = 0; left < boxes.length; left += 1) {
    for (let right = left + 1; right < boxes.length; right += 1) {
      const a = boxes[left];
      const b = boxes[right];
      const overlaps =
        a.position.x < b.position.x + b.width &&
        a.position.x + a.width > b.position.x &&
        a.position.y < b.position.y + b.height &&
        a.position.y + a.height > b.position.y;
      expect(overlaps, `${a.id} 与 ${b.id} 不应重叠`).toBe(false);
    }
  }
}

describe("coordinateProductionGraphNodes", () => {
  it("keeps unchanged node objects by stable id while replacing only changed nodes", () => {
    const fixture = buildDualProjectFixture();
    const first = coordinateProductionGraphNodes(fixture.snapshots.p1Initial, new Map());
    const changed = fixture.snapshots.p1Initial.nodes.map((node) =>
      node.id === "node-a" ? { ...node, status: "running" as const, updatedAt: node.updatedAt + 1 } : node,
    );

    const second = coordinateProductionGraphNodes({ ...fixture.snapshots.p1Initial, nodes: changed }, new Map(first.map((node) => [node.id, node])));

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
      nodes: [
        {
          id: "scene-1",
          graphId: "story-graph-7",
          scriptId: 19,
          kind: "scene",
          title: "雨夜开场",
          summary: "等待观众选择",
          position: { x: 120, y: 80 },
          status: "ready",
          script: null,
          createdAt: 1,
          updatedAt: 2,
        },
      ],
      edges: [],
      variables: [],
      createdAt: 1,
      updatedAt: 2,
    };

    const linkedSnapshot = { ...fixture.snapshots.p1Initial, interactiveStoryGraphId: interactive.id };
    const first = coordinateProjectCanvasNodes(linkedSnapshot, interactive, new Map());
    const production = first.find((node) => node.id === "node-a");
    const story = first.find((node) => node.id === "interactive:story-graph-7:scene-1");

    expect(story?.data).toMatchObject({ source: "interactive-story", sourceRef: "scene-1", title: "雨夜开场", status: "ready" });

    const second = coordinateProjectCanvasNodes(
      linkedSnapshot,
      { ...interactive, revision: 4 },
      new Map(first.map((node) => [node.id, node])),
    );
    expect(second.find((node) => node.id === "node-a")).toBe(production);
    expect(second.find((node) => node.id === "interactive:story-graph-7:scene-1")).toBe(story);
  });

  it("does not mix an unbound production graph into the interactive story", () => {
    const fixture = buildDualProjectFixture();
    const interactive: InteractiveStoryGraph = {
      id: "story-graph-7",
      projectId: 7,
      title: "互动剧情",
      entryNodeId: "scene-1",
      status: "ready",
      revision: 1,
      nodes: [
        {
          id: "scene-1",
          graphId: "story-graph-7",
          scriptId: 19,
          kind: "scene",
          title: "现场勘查",
          summary: "进入案件",
          position: { x: 900, y: 600 },
          status: "ready",
          script: null,
          createdAt: 1,
          updatedAt: 2,
        },
      ],
      edges: [],
      variables: [],
      createdAt: 1,
      updatedAt: 2,
    };

    const nodes = coordinateProjectCanvasNodes(
      { ...fixture.snapshots.p1Initial, interactiveStoryGraphId: null },
      interactive,
      new Map(),
    );

    expect(nodes.map((node) => node.data.source)).toEqual(["interactive-story"]);
    expect(nodes.map((node) => node.data.title)).toEqual(["现场勘查"]);
  });

  it("orders cyclic interactive story nodes by their earliest distance from the entry", () => {
    const fixture = buildDualProjectFixture();
    const node = (id: string, title: string, createdAt: number) => ({
      id,
      graphId: "story-graph-7",
      scriptId: 100 + createdAt,
      kind: id === "ending" ? "ending" as const : id === "hub" ? "hub" as const : "scene" as const,
      title,
      summary: title,
      position: { x: 0, y: 0 },
      status: "ready" as const,
      script: null,
      createdAt,
      updatedAt: createdAt,
    });
    const interactive: InteractiveStoryGraph = {
      id: "story-graph-7",
      projectId: 7,
      title: "互动剧情",
      entryNodeId: "entry",
      status: "ready",
      revision: 1,
      nodes: [
        node("entry", "入口", 1),
        node("evidence", "现场取证", 2),
        node("interview", "人物审讯", 3),
        node("hub", "线索汇合", 4),
        node("ending", "真结局", 5),
      ],
      edges: [
        { id: "e1", graphId: "story-graph-7", sourceNodeId: "entry", targetNodeId: "evidence", choiceText: "取证", condition: null, effects: [], priority: 0, createdAt: 1, updatedAt: 1 },
        { id: "e2", graphId: "story-graph-7", sourceNodeId: "entry", targetNodeId: "interview", choiceText: "审讯", condition: null, effects: [], priority: 0, createdAt: 2, updatedAt: 2 },
        { id: "e3", graphId: "story-graph-7", sourceNodeId: "evidence", targetNodeId: "interview", choiceText: "转向审讯", condition: null, effects: [], priority: 0, createdAt: 3, updatedAt: 3 },
        { id: "e4", graphId: "story-graph-7", sourceNodeId: "interview", targetNodeId: "evidence", choiceText: "补查物证", condition: null, effects: [], priority: 0, createdAt: 4, updatedAt: 4 },
        { id: "e5", graphId: "story-graph-7", sourceNodeId: "evidence", targetNodeId: "hub", choiceText: "汇合", condition: null, effects: [], priority: 0, createdAt: 5, updatedAt: 5 },
        { id: "e6", graphId: "story-graph-7", sourceNodeId: "interview", targetNodeId: "hub", choiceText: "汇合", condition: null, effects: [], priority: 0, createdAt: 6, updatedAt: 6 },
        { id: "e7", graphId: "story-graph-7", sourceNodeId: "hub", targetNodeId: "ending", choiceText: "揭晓", condition: null, effects: [], priority: 0, createdAt: 7, updatedAt: 7 },
      ],
      variables: [],
      createdAt: 1,
      updatedAt: 2,
    };

    const nodes = coordinateProjectCanvasNodes(
      { ...fixture.snapshots.p1Initial, interactiveStoryGraphId: null },
      interactive,
      new Map(),
    );
    const positions = Object.fromEntries(nodes.map((item) => [item.data.sourceRef, item.position]));

    expect(positions.entry.x).toBeLessThan(positions.evidence.x);
    expect(positions.evidence.x).toBe(positions.interview.x);
    expect(positions.evidence.y).not.toBe(positions.interview.y);
    expect(positions.interview.x).toBeLessThan(positions.hub.x);
    expect(positions.hub.x).toBeLessThan(positions.ending.x);
    assertNoOverlap(nodes);
  });

  it("spaces interactive story depth levels with wide horizontal room so edges and choice labels stay clear", () => {
    const fixture = buildDualProjectFixture();
    const node = (id: string, title: string, createdAt: number) => ({
      id,
      graphId: "story-graph-7",
      scriptId: 300 + createdAt,
      kind: "scene" as const,
      title,
      summary: `${title}的摘要`,
      position: { x: 0, y: 0 },
      status: "ready" as const,
      script: null,
      createdAt,
      updatedAt: createdAt,
    });
    const edge = (id: string, sourceNodeId: string, targetNodeId: string, priority: number) => ({
      id,
      graphId: "story-graph-7",
      sourceNodeId,
      targetNodeId,
      choiceText: "继续",
      condition: null,
      effects: [],
      priority,
      createdAt: 1,
      updatedAt: 1,
    });
    const interactive: InteractiveStoryGraph = {
      id: "story-graph-7",
      projectId: 7,
      title: "互动剧情",
      entryNodeId: "entry",
      status: "ready",
      revision: 1,
      nodes: [node("entry", "开场", 1), node("choice", "雨中抉择", 2), node("climax", "天台对峙", 3)],
      edges: [edge("e1", "entry", "choice", 0), edge("e2", "choice", "climax", 0)],
      variables: [],
      createdAt: 1,
      updatedAt: 2,
    };

    const nodes = coordinateProjectCanvasNodes(
      { ...fixture.snapshots.p1Initial, interactiveStoryGraphId: null },
      interactive,
      new Map(),
    );
    const positions = Object.fromEntries(nodes.map((item) => [item.data.sourceRef, item.position]));

    // 每一层剧情（横向层级）的间距一致且足够宽：卡片加宽后仍要留出清晰的连线/文字净空。
    const pitch = positions.choice.x - positions.entry.x;
    const nextPitch = positions.climax.x - positions.choice.x;
    expect(nextPitch).toBe(pitch);
    expect(pitch).toBeGreaterThanOrEqual(560);
    // 相邻两层卡片边缘之间的净空不小于 160px，选项标签不会被夹住。
    expect(pitch - 400).toBeGreaterThanOrEqual(160);
    assertNoOverlap(nodes);
  });

  it("lays out production and interactive nodes deterministically without overlap", () => {
    const fixture = buildDualProjectFixture();
    const interactive: InteractiveStoryGraph = {
      id: "story-graph-7",
      projectId: 7,
      title: "互动剧情",
      entryNodeId: "scene-1",
      status: "ready",
      revision: 3,
      nodes: [
        {
          id: "scene-1",
          graphId: "story-graph-7",
          scriptId: 19,
          kind: "scene",
          title: "雨夜开场",
          summary: "等待观众选择",
          position: { x: 120, y: 80 },
          status: "ready",
          script: null,
          createdAt: 1,
          updatedAt: 2,
        },
        {
          id: "scene-2",
          graphId: "story-graph-7",
          scriptId: 19,
          kind: "scene",
          title: "追车段落",
          summary: "第二幕",
          position: { x: 120, y: 240 },
          status: "ready",
          script: null,
          createdAt: 1,
          updatedAt: 2,
        },
      ],
      edges: [],
      variables: [],
      createdAt: 1,
      updatedAt: 2,
    };

    const linkedSnapshot = { ...fixture.snapshots.p1Initial, interactiveStoryGraphId: interactive.id };
    const first = coordinateProjectCanvasNodes(linkedSnapshot, interactive, new Map());
    const second = coordinateProjectCanvasNodes(linkedSnapshot, interactive, new Map());
    expect(first.map((node) => ({ id: node.id, position: node.position }))).toEqual(second.map((node) => ({ id: node.id, position: node.position })));

    const boxes = first.map((node) => ({ x: node.position.x, y: node.position.y, width: 260, height: 160 }));
    for (let left = 0; left < boxes.length; left += 1) {
      for (let right = left + 1; right < boxes.length; right += 1) {
        const a = boxes[left];
        const b = boxes[right];
        const overlaps = a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
        expect(overlaps, `${first[left].id} 与 ${first[right].id} 不应重叠`).toBe(false);
      }
    }

    const goal = first.find((node) => node.id === "goal-p1");
    expect(goal?.position).toEqual({ x: 80, y: 140 });
    const productionMaxX = Math.max(...first.filter((node) => node.data.source === "production-graph").map((node) => node.position.x));
    const storyMinX = Math.min(...first.filter((node) => node.data.source === "interactive-story").map((node) => node.position.x));
    expect(storyMinX).toBeGreaterThan(productionMaxX + NODE_SIZE.width);
    expect(first.find((node) => node.id === "interactive:story-graph-7:scene-1")?.position).toEqual({ x: storyMinX, y: 60 });
  });

  it("lays out a many-node graph deterministically without overlap and centers the goal column", () => {
    const graphId = "graph-busy";
    const goal = fixtureNode({
      id: "goal-busy",
      graphId,
      kind: "goal",
      title: "大批量生产目标",
      objective: "验证多节点拓扑布局不重叠。",
      status: "ready",
    });
    const nodes = [goal];
    const edges = [];
    let sequence = 0;
    const previousRank = new Map<string, string[]>();
    previousRank.set("goal-busy", ["a0", "a1", "a2"]);
    for (const rank of [0, 1, 2]) {
      const ids = previousRank.get(rank === 0 ? "goal-busy" : `r${rank - 1}`) ?? [];
      const nextIds: string[] = [];
      for (const sourceId of ids) {
        for (let branch = 0; branch < 2; branch += 1) {
          const id = `n${rank}-${sequence++}`;
          nodes.push(
            fixtureNode({
              id,
              graphId,
              kind: rank === 2 ? "deliverable" : "work",
              title: `节点 ${id}`,
              objective: `第 ${rank + 1} 层工作`,
              status: "ready",
            }),
          );
          edges.push(fixtureEdge(`e-${sourceId}-${id}`, graphId, sourceId, id));
          nextIds.push(id);
        }
      }
      previousRank.set(`r${rank}`, nextIds);
    }
    const snapshot = {
      ...buildDualProjectFixture().snapshots.p1Initial,
      graphId,
      revision: 2,
      nodes,
      edges,
    };

    const first = coordinateProductionGraphNodes(snapshot, new Map());
    const second = coordinateProductionGraphNodes(snapshot, new Map());
    expect(first.map((node) => ({ id: node.id, position: node.position }))).toEqual(second.map((node) => ({ id: node.id, position: node.position })));
    expect(first).toHaveLength(nodes.length);
    assertNoOverlap(first);
    expect(first.find((node) => node.id === "goal-busy")?.position).toEqual({ x: 80, y: 140 });
    const nonGoal = first.filter((node) => node.id !== "goal-busy");
    const minX = Math.min(...nonGoal.map((node) => node.position.x));
    expect(minX).toBeGreaterThan(80 + NODE_SIZE.width);
  });

  it("keeps a user-dragged node position stable across snapshot re-coordination", () => {
    const fixture = buildDualProjectFixture();
    const first = coordinateProductionGraphNodes(fixture.snapshots.p1Initial, new Map());
    const previous = new Map(first.map((node) => [node.id, node]));
    const dragged = previous.get("node-a");
    expect(dragged).toBeDefined();
    previous.set("node-a", { ...dragged!, position: { x: 999, y: 888 } });

    const next = coordinateProductionGraphNodes(fixture.snapshots.p1Initial, previous);
    expect(next.find((node) => node.id === "node-a")?.position).toEqual({ x: 999, y: 888 });
    expect(next.find((node) => node.id === "node-b")?.position).toEqual(first.find((node) => node.id === "node-b")?.position);
  });
});

describe("single-node goal layout", () => {
  function singleGoalSnapshot(graphId: string): ProductionGraphSnapshot {
    const fixture = buildDualProjectFixture();
    const goal = fixture.snapshots.p1Initial.nodes.find((node) => node.id === "goal-p1")!;
    return { ...fixture.snapshots.p1Initial, graphId, revision: 1, nodes: [goal], edges: [] };
  }

  it("centers a lone goal node inside the default viewport", () => {
    const first = coordinateProductionGraphNodes(singleGoalSnapshot("graph-solo"), new Map());
    expect(first).toHaveLength(1);
    expect(first[0].position).toEqual({
      x: Math.round((PROJECT_CANVAS_DEFAULT_VIEWPORT.width - PROJECT_CANVAS_NODE_SIZE.width) / 2),
      y: Math.round((PROJECT_CANVAS_DEFAULT_VIEWPORT.height - PROJECT_CANVAS_NODE_SIZE.height) / 2),
    });
    expect(first[0].position.x).toBeGreaterThan(0);
    expect(first[0].position.y).toBeGreaterThan(0);
  });

  it("centers a lone goal node inside a caller-provided canvas viewport", () => {
    const viewport = { width: 960, height: 540 };
    const first = coordinateProjectCanvasNodes(singleGoalSnapshot("graph-solo"), null, new Map(), viewport);
    expect(first[0].position).toEqual({
      x: Math.round((viewport.width - PROJECT_CANVAS_NODE_SIZE.width) / 2),
      y: Math.round((viewport.height - PROJECT_CANVAS_NODE_SIZE.height) / 2),
    });
  });

  it("keeps the goal at the column origin when the graph has multiple nodes", () => {
    const fixture = buildDualProjectFixture();
    const first = coordinateProductionGraphNodes(fixture.snapshots.p1Initial, new Map());
    expect(first.find((node) => node.id === "goal-p1")?.position).toEqual({ x: 80, y: 140 });
  });
});

describe("canvasFramingKey / shouldReframeCanvas", () => {
  const key = (overlayCloseCount: number) => canvasFramingKey({ graphId: "graph-p1", revision: 1, overlayCloseCount });

  it("reframes on first load because the previous key is absent", () => {
    expect(shouldReframeCanvas(null, canvasFramingKey({ graphId: "graph-p1", revision: 1, overlayCloseCount: 0 }))).toBe(true);
  });

  it("keeps a stable key across ordinary re-renders and user panning", () => {
    expect(canvasFramingKey({ graphId: "graph-p1", revision: 1, overlayCloseCount: 0 })).toBe(key(0));
    expect(shouldReframeCanvas(key(0), key(0))).toBe(false);
  });

  it("reframes when graphId or revision changes", () => {
    const base = key(0);
    expect(canvasFramingKey({ graphId: "graph-p1", revision: 2, overlayCloseCount: 0 })).not.toBe(base);
    expect(canvasFramingKey({ graphId: "graph-p2", revision: 1, overlayCloseCount: 0 })).not.toBe(base);
    expect(shouldReframeCanvas(base, canvasFramingKey({ graphId: "graph-p1", revision: 2, overlayCloseCount: 0 }))).toBe(true);
    expect(shouldReframeCanvas(base, canvasFramingKey({ graphId: "graph-p2", revision: 1, overlayCloseCount: 0 }))).toBe(true);
  });

  it("reframes when the interactive story graph arrives or changes revision", () => {
    const beforeInteractiveGraph = canvasFramingKey({
      graphId: "graph-p1",
      revision: 1,
      interactiveGraphId: null,
      interactiveRevision: null,
      overlayCloseCount: 0,
    });
    const firstInteractiveRevision = canvasFramingKey({
      graphId: "graph-p1",
      revision: 1,
      interactiveGraphId: "story-graph-8",
      interactiveRevision: 1,
      overlayCloseCount: 0,
    });
    const secondInteractiveRevision = canvasFramingKey({
      graphId: "graph-p1",
      revision: 1,
      interactiveGraphId: "story-graph-8",
      interactiveRevision: 2,
      overlayCloseCount: 0,
    });

    expect(firstInteractiveRevision).not.toBe(beforeInteractiveGraph);
    expect(secondInteractiveRevision).not.toBe(firstInteractiveRevision);
  });

  it("reframes when an overlay closes while opening one keeps the key stable", () => {
    const base = key(0);
    const afterClose = key(1);
    expect(afterClose).not.toBe(base);
    expect(shouldReframeCanvas(base, afterClose)).toBe(true);
  });

  it("distinguishes a graph that is not loaded yet from a loaded one", () => {
    const empty = canvasFramingKey({ graphId: null, revision: null, overlayCloseCount: 0 });
    const loaded = canvasFramingKey({ graphId: "pending-project-7", revision: 1, overlayCloseCount: 0 });
    expect(loaded).not.toBe(empty);
    expect(shouldReframeCanvas(empty, loaded)).toBe(true);
  });
});

describe("projectCanvasFitViewOptions", () => {
  it("keeps a single-node graph readable while bounding dense-graph zoom", () => {
    const solo = projectCanvasFitViewOptions(1);
    const dense = projectCanvasFitViewOptions(9);
    expect(solo.padding).toBeGreaterThan(0);
    expect(solo.duration).toBeGreaterThanOrEqual(0);
    expect(solo.maxZoom).toBeGreaterThanOrEqual(1.5);
    expect(solo.maxZoom).toBeGreaterThanOrEqual(dense.maxZoom);
  });
});
