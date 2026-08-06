import { describe, expect, it, vi } from "vitest";

import { createProductionGraphSocketAdapter, type ProductionGraphSocket } from "./production-graph-socket-adapter";
import { createProductionGraphStore } from "./production-graph-store";
import { buildDualProjectFixture } from "./production-graph-fixture";

const fixture = buildDualProjectFixture();

class FakeSocket implements ProductionGraphSocket {
  readonly listeners = new Map<string, Set<(...args: any[]) => void>>();
  readonly emitted: Array<{ event: string; data: unknown }> = [];
  connected = true;

  on(event: string, listener: (...args: any[]) => void) {
    const set = this.listeners.get(event) ?? new Set();
    set.add(listener);
    this.listeners.set(event, set);
    return this;
  }

  off(event: string, listener?: (...args: any[]) => void) {
    if (listener) this.listeners.get(event)?.delete(listener);
    else this.listeners.delete(event);
    return this;
  }

  emit(event: string, data?: unknown) {
    this.emitted.push({ event, data });
    return this;
  }

  trigger(event: string, ...args: unknown[]) {
    this.listeners.get(event)?.forEach((listener) => listener(...args));
  }
}

describe("ProductionGraphSocketAdapter", () => {
  it("forwards snapshot and patch events to the store with revision guard", () => {
    const store = createProductionGraphStore();
    const socket = new FakeSocket();
    const adapter = createProductionGraphSocketAdapter({ store, socket });
    adapter.attach();

    socket.trigger("productionGraph:snapshot", fixture.snapshots.p1Initial);
    expect(store.getSnapshot().snapshot?.revision).toBe(1);

    socket.trigger("productionGraph:patch", fixture.patches.p1StartA);
    expect(store.getSnapshot().snapshot?.revision).toBe(2);
    expect(store.getSnapshot().snapshot?.nodes.find((node) => node.id === "node-a")?.status).toBe("running");
  });

  it("ignores patches that target a different graphId", () => {
    const store = createProductionGraphStore();
    const socket = new FakeSocket();
    const adapter = createProductionGraphSocketAdapter({ store, socket });
    adapter.attach();

    socket.trigger("productionGraph:snapshot", fixture.snapshots.p1Initial);
    const before = store.getSnapshot().snapshot?.revision;
    socket.trigger("productionGraph:patch", {
      ...fixture.patches.p1StartA,
      graphId: "graph-other",
    });
    expect(store.getSnapshot().snapshot?.revision).toBe(before);
  });

  it("maps legacy productionRun:update into the legacy banner and never mutates node status", () => {
    const store = createProductionGraphStore();
    const socket = new FakeSocket();
    const adapter = createProductionGraphSocketAdapter({ store, socket });
    adapter.attach();

    store.applySnapshot(fixture.snapshots.p1Initial);
    socket.trigger("productionRun:update", {
      runId: "run-a-1",
      stage: "internal.reviewText",
      status: "running",
      attempt: 1,
      graphId: "graph-p1",
      nodeId: "node-a",
      revision: 1,
      error: null,
      updatedAt: "2026-08-07T00:00:00.000Z",
    });

    const state = store.getSnapshot();
    expect(state.legacyProductionRun?.runId).toBe("run-a-1");
    expect(state.snapshot?.nodes.find((node) => node.id === "node-a")?.status).toBe("ready");
  });

  it("selects active run over recent terminal run on productionRun:restore", () => {
    const store = createProductionGraphStore();
    const socket = new FakeSocket();
    const adapter = createProductionGraphSocketAdapter({ store, socket });
    adapter.attach();

    socket.trigger("productionRun:restore", {
      activeRuns: [
        {
          runId: "active-run",
          stage: "storyboardGen",
          status: "running",
          attempt: 1,
          updatedAt: "2026-08-07T00:00:00.000Z",
          error: null,
        },
      ],
      recentTerminalRuns: [
        {
          runId: "dead-run",
          stage: "storyboardPanel",
          status: "cancelled",
          attempt: 1,
          updatedAt: "2026-08-07T00:00:00.000Z",
          error: null,
        },
      ],
    });

    expect(store.getSnapshot().legacyProductionRun?.runId).toBe("active-run");
  });

  it("picks retryable terminal run when no active run exists", () => {
    const store = createProductionGraphStore();
    const socket = new FakeSocket();
    const adapter = createProductionGraphSocketAdapter({ store, socket });
    adapter.attach();

    socket.trigger("productionRun:restore", {
      recentTerminalRuns: [
        {
          runId: "dead-run",
          stage: "storyboardPanel",
          status: "cancelled",
          attempt: 1,
          updatedAt: "2026-08-07T00:00:00.000Z",
          error: null,
        },
        {
          runId: "retryable",
          stage: "storyboardGen",
          status: "failed",
          attempt: 2,
          updatedAt: "2026-08-07T00:00:00.000Z",
          error: { message: "gateway", retryable: true },
        },
      ],
    });

    expect(store.getSnapshot().legacyProductionRun?.runId).toBe("retryable");
  });

  it("clears legacy record when restore has no candidates", () => {
    const store = createProductionGraphStore();
    const socket = new FakeSocket();
    const adapter = createProductionGraphSocketAdapter({ store, socket });
    adapter.attach();

    store.applySnapshot(fixture.snapshots.p1Initial);
    socket.trigger("productionRun:update", {
      runId: "x",
      stage: "s",
      status: "running",
      attempt: 1,
      updatedAt: "2026-08-07T00:00:00.000Z",
      error: null,
    });
    expect(store.getSnapshot().legacyProductionRun).not.toBeNull();

    socket.trigger("productionRun:restore", { activeRuns: [], recentTerminalRuns: [] });
    expect(store.getSnapshot().legacyProductionRun).toBeNull();
  });

  it("detach removes listeners so further events are ignored", () => {
    const store = createProductionGraphStore();
    const socket = new FakeSocket();
    const adapter = createProductionGraphSocketAdapter({ store, socket });
    adapter.attach();
    adapter.detach();

    socket.trigger("productionGraph:snapshot", fixture.snapshots.p1Initial);
    expect(store.getSnapshot().snapshot).toBeNull();
  });
});

describe("ProductionGraphSocketAdapter reconnect", () => {
  it("does not re-emit local patches on reconnect; the only legal post-reconnect action is readGraph", () => {
    const store = createProductionGraphStore();
    const socket = new FakeSocket();
    const requestSpy = vi.fn();
    const adapter = createProductionGraphSocketAdapter({
      store,
      socket,
      requestSnapshotOnReconnect: (target) => {
        requestSpy();
        target.emit("productionGraph:read", { graphId: "graph-p1" });
      },
    });
    adapter.attach();

    socket.trigger("productionGraph:snapshot", fixture.snapshots.p1Initial);
    socket.trigger("productionGraph:patch", fixture.patches.p1StartA);
    expect(store.getSnapshot().snapshot?.revision).toBe(2);

    store.rememberIdempotencyKey("already-applied");
    expect(store.beginDispatch("already-applied", 2)).toBe(false);

    // Simulate reconnect: server pushes a fresh authoritative snapshot.
    socket.trigger("productionGraph:snapshot", {
      ...fixture.snapshots.p1Initial,
      revision: 2,
      nodes: fixture.snapshots.p1Initial.nodes.map((node) =>
        node.id === "node-a" ? { ...node, status: "running", attempt: 1, agentRunId: "run-a-1" } : node,
      ),
    });

    expect(store.getSnapshot().snapshot?.revision).toBe(2);
    expect(store.getSnapshot().snapshot?.nodes.find((node) => node.id === "node-a")?.status).toBe("running");
    expect(socket.emitted).not.toContainEqual({ event: "productionGraph:patch", data: expect.anything() });
  });

  it("after a snapshot arrives, requestSnapshot emits productionGraph:read with graphId", () => {
    const store = createProductionGraphStore();
    const socket = new FakeSocket();
    const adapter = createProductionGraphSocketAdapter({ store, socket });
    adapter.attach();

    socket.trigger("productionGraph:snapshot", fixture.snapshots.p1Initial);
    socket.emitted.length = 0;

    adapter.requestSnapshot();
    expect(socket.emitted).toContainEqual({ event: "productionGraph:read", data: { graphId: "graph-p1" } });
  });

  it("on socket connect/reconnect, emits productionGraph:read with current graphId when feature is enabled", () => {
    const store = createProductionGraphStore();
    const socket = new FakeSocket();
    const adapter = createProductionGraphSocketAdapter({ store, socket });
    adapter.attach();

    socket.trigger("productionGraph:snapshot", fixture.snapshots.p1Initial);
    socket.emitted.length = 0;

    socket.trigger("connect");
    expect(socket.emitted).toContainEqual({ event: "productionGraph:read", data: { graphId: "graph-p1" } });

    socket.emitted.length = 0;
    socket.trigger("reconnect");
    expect(socket.emitted).toContainEqual({ event: "productionGraph:read", data: { graphId: "graph-p1" } });
  });

  it("does not auto-request snapshot when feature flag has been disabled by a null snapshot", () => {
    const store = createProductionGraphStore();
    const socket = new FakeSocket();
    const adapter = createProductionGraphSocketAdapter({ store, socket });
    adapter.attach();

    // Server signals "no persistent graph yet" — adapter must fall back, not throw.
    socket.trigger("productionGraph:snapshot", null);
    expect(store.getSnapshot().featureEnabled).toBe(false);
    expect(store.getSnapshot().snapshot).toBeNull();

    socket.emitted.length = 0;
    socket.trigger("connect");
    expect(socket.emitted).toEqual([]);
  });

  it("applies late patches that build on the post-reconnect snapshot", () => {
    const store = createProductionGraphStore();
    const socket = new FakeSocket();
    const adapter = createProductionGraphSocketAdapter({ store, socket });
    adapter.attach();

    socket.trigger("productionGraph:snapshot", fixture.snapshots.p1Initial);
    socket.trigger("productionGraph:patch", fixture.patches.p1StartA);
    expect(store.getSnapshot().snapshot?.revision).toBe(2);

    // Late patch with stale baseRevision must throw without corrupting state.
    expect(() => socket.trigger("productionGraph:patch", fixture.patches.p1StartA)).toThrowError(
      /PRODUCTION_GRAPH_REVISION_CONFLICT|baseRevision/,
    );

    // A fresh patch on the new revision succeeds.
    socket.trigger("productionGraph:patch", {
      ...fixture.patches.p1CompleteAB,
      baseRevision: 2,
      revision: 3,
    });
    expect(store.getSnapshot().snapshot?.revision).toBe(3);
  });
});
