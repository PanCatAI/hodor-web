import { describe, expect, it, vi } from "vitest";

import {
  createProductionGraphActionDispatcher,
  type ProductionActionAck,
  type ProductionGraphActionSocket,
} from "./production-graph-actions";
import { createProductionGraphContextBridge } from "./production-graph-context";
import { createProductionGraphSocketAdapter, type ProductionGraphSocket } from "./production-graph-socket-adapter";
import {
  createProductionGraphStore,
} from "./production-graph-store";
import { buildDualProjectFixture } from "./production-graph-fixture";
import { ProductionGraphBusinessError } from "./types";

const fixture = buildDualProjectFixture();

class IntegrationSocket implements ProductionGraphSocket, ProductionGraphActionSocket {
  readonly listeners = new Map<string, Set<(...args: any[]) => void>>();
  readonly emitted: Array<{ event: string; data?: unknown; ack?: (response: ProductionActionAck) => void }> = [];
  connected = true;
  private ackQueue: ProductionActionAck[] = [];

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
  emit(event: string, data?: unknown, ack?: (response: ProductionActionAck) => void) {
    this.emitted.push({ event, data, ack });
    if (ack) {
      const next = this.ackQueue.shift();
      if (next) ack(next);
    }
    return this;
  }
  trigger(event: string, ...args: unknown[]) {
    this.listeners.get(event)?.forEach((listener) => listener(...args));
  }
  queueAck(ack: ProductionActionAck) {
    this.ackQueue.push(ack);
  }
  resetEmitted() {
    this.emitted.length = 0;
  }
}

describe("ProductionGraph v1 reconnect contract", () => {
  it("preserves graphId, revision, node states, evidence, and control points across two reconnects", () => {
    const store = createProductionGraphStore();
    const socket = new IntegrationSocket();
    const adapter = createProductionGraphSocketAdapter({ store, socket });
    adapter.attach();

    socket.trigger("productionGraph:snapshot", fixture.snapshots.p1Initial);
    socket.trigger("productionGraph:patch", fixture.patches.p1StartA);
    socket.trigger("productionGraph:patch", fixture.patches.p1StartB);
    socket.trigger("productionGraph:patch", fixture.patches.p1CompleteAB);
    socket.trigger("productionGraph:patch", fixture.patches.p1CheckpointWaiting);

    const beforeDisconnect = JSON.stringify({
      graphId: store.getSnapshot().graphId,
      revision: store.getSnapshot().snapshot?.revision,
      nodes: store.getSnapshot().snapshot?.nodes,
      edges: store.getSnapshot().snapshot?.edges,
      checkpointDecisions: store.getSnapshot().snapshot?.checkpointDecisions,
      evidence: store.getSnapshot().snapshot?.nodes.map((node) => node.evidence),
      appliedIdempotencyKeys: [...store.getSnapshot().appliedIdempotencyKeys],
    });

    // First reconnect: server pushes the same authoritative snapshot.
    socket.trigger("productionGraph:snapshot", fixture.snapshots.p1CheckpointWaiting);
    // Second reconnect with a no-op identical snapshot — must not rewind revision or duplicate work.
    socket.trigger("productionGraph:snapshot", fixture.snapshots.p1CheckpointWaiting);

    const afterReconnect = JSON.stringify({
      graphId: store.getSnapshot().graphId,
      revision: store.getSnapshot().snapshot?.revision,
      nodes: store.getSnapshot().snapshot?.nodes,
      edges: store.getSnapshot().snapshot?.edges,
      checkpointDecisions: store.getSnapshot().snapshot?.checkpointDecisions,
      evidence: store.getSnapshot().snapshot?.nodes.map((node) => node.evidence),
      appliedIdempotencyKeys: [...store.getSnapshot().appliedIdempotencyKeys],
    });

    expect(afterReconnect).toEqual(beforeDisconnect);
  });

  it("does not re-emit local patches after reconnect; only readGraph is allowed", () => {
    const store = createProductionGraphStore();
    const socket = new IntegrationSocket();
    const adapter = createProductionGraphSocketAdapter({
      store,
      socket,
      requestSnapshotOnReconnect: (target) => target.emit("productionGraph:read", { graphId: "graph-p1" }),
    });
    adapter.attach();

    socket.trigger("productionGraph:snapshot", fixture.snapshots.p1Initial);
    socket.trigger("productionGraph:patch", fixture.patches.p1StartA);

    socket.resetEmitted();
    // Reconnect: simulate server pushing a fresh snapshot.
    socket.trigger("productionGraph:snapshot", { ...fixture.snapshots.p1Initial, revision: 2 });

    const emittedEvents = socket.emitted.map((entry) => entry.event);
    expect(emittedEvents).not.toContain("productionGraph:patch");
    expect(emittedEvents).toEqual([]);
    expect(store.getSnapshot().snapshot?.revision).toBe(2);
  });

  it("skips duplicate action dispatch when the same idempotencyKey was already applied before disconnect", async () => {
    const store = createProductionGraphStore();
    const socket = new IntegrationSocket();
    const adapter = createProductionGraphSocketAdapter({ store, socket });
    adapter.attach();

    socket.trigger("productionGraph:snapshot", fixture.snapshots.p1Initial);

    const dispatcher = createProductionGraphActionDispatcher({
      store,
      socket,
      buildContext: () => ({ actorRef: null, graphId: "graph-p1", selectedNodeId: "node-a", checkpointId: null }),
    });

    socket.queueAck({
      ok: true,
      result: {
        action: "startReady",
        snapshot: { ...fixture.snapshots.p1Initial, revision: 2 },
        paidGenerationUsd: 0,
        idempotencyKey: "action-key-1",
      },
    });

    const first = await dispatcher.dispatch({
      action: "startReady",
      idempotencyKey: "action-key-1",
      expectedRevision: 1,
      nodeIds: ["node-a"],
    });
    expect(first.ok).toBe(true);
    expect(store.getSnapshot().appliedIdempotencyKeys.has("action-key-1")).toBe(true);

    socket.resetEmitted();
    // Reconnect: a fresh snapshot lands at the new revision.
    socket.trigger("productionGraph:snapshot", { ...fixture.snapshots.p1Initial, revision: 2 });

    // Agent adapter tries the SAME idempotencyKey again (e.g. retry storm).
    const duplicate = await dispatcher.dispatch({
      action: "startReady",
      idempotencyKey: "action-key-1",
      expectedRevision: 2,
      nodeIds: ["node-a"],
    });
    expect(duplicate.ok).toBe(true);
    expect(socket.emitted).toHaveLength(0);
  });

  it("keeps legacy productionRun events out of the real node state across reconnects", () => {
    const store = createProductionGraphStore();
    const socket = new IntegrationSocket();
    const adapter = createProductionGraphSocketAdapter({ store, socket });
    adapter.attach();

    socket.trigger("productionGraph:snapshot", fixture.snapshots.p1Initial);
    socket.trigger("productionRun:update", {
      runId: "legacy",
      stage: "storyboardGen",
      status: "running",
      attempt: 9,
      graphId: "graph-p1",
      nodeId: "node-c",
      updatedAt: "2026-08-07T00:00:00.000Z",
      error: null,
    });

    const nodeCStatus = store.getSnapshot().snapshot?.nodes.find((node) => node.id === "node-c")?.status;
    expect(nodeCStatus).toBe("blocked");
    expect(store.getSnapshot().legacyProductionRun?.runId).toBe("legacy");

    // Reconnect.
    socket.trigger("productionGraph:snapshot", fixture.snapshots.p1Initial);

    expect(store.getSnapshot().snapshot?.nodes.find((node) => node.id === "node-c")?.status).toBe("blocked");
  });

  it("rollback path: disabling the feature flag mid-session keeps the snapshot but hides the UI surface", () => {
    const store = createProductionGraphStore();
    const socket = new IntegrationSocket();
    const adapter = createProductionGraphSocketAdapter({ store, socket });
    const bridge = createProductionGraphContextBridge({ store, initial: { selectedNodeId: "node-a", checkpointId: null } });
    adapter.attach();

    socket.trigger("productionGraph:snapshot", fixture.snapshots.p1Initial);
    expect(bridge()).toMatchObject({ graphId: "graph-p1", revision: 1, selectedNodeId: "node-a" });

    store.setFeatureEnabled(false);

    // When disabled, the bridge returns an empty context so the legacy chat path is unchanged.
    expect(bridge()).toEqual({});
    // Snapshot must remain intact for an instant rollback re-enable.
    expect(store.getSnapshot().snapshot?.revision).toBe(1);

    store.setFeatureEnabled(true);
    expect(bridge()).toMatchObject({ graphId: "graph-p1", revision: 1, selectedNodeId: "node-a" });
  });
});

describe("ProductionGraph v1 dual-project concurrency acceptance", () => {
  it("two independent work nodes are both ready and can dispatch concurrently without serializing on each other", () => {
    const store = createProductionGraphStore();
    store.applySnapshot(fixture.snapshots.p1Initial);

    const snapshot = store.getSnapshot().snapshot!;
    expect(snapshot.nodes.find((n) => n.id === "node-a")?.status).toBe("ready");
    expect(snapshot.nodes.find((n) => n.id === "node-b")?.status).toBe("ready");
    // Both A and B can be started simultaneously without serializing on each other.
    // The store must allow distinct idempotency keys to dispatch concurrently.
    expect(store.beginDispatch("start-a", 1)).toBe(true);
    expect(store.beginDispatch("start-b", 1)).toBe(true);
    expect(store.getSnapshot().pendingDispatchCount).toBe(2);
    // The same key remains a duplicate while in flight.
    expect(store.beginDispatch("start-a", 1)).toBe(false);
    expect(store.beginDispatch("start-b", 1)).toBe(false);

    store.endDispatch("start-a");
    store.endDispatch("start-b");
    expect(store.getSnapshot().pendingDispatchCount).toBe(0);
  });

  it("dependent node C remains blocked until both A and B have succeeded", () => {
    const store = createProductionGraphStore();
    store.applySnapshot(fixture.snapshots.p1Initial);
    const snapshot = () => store.getSnapshot().snapshot!;
    expect(snapshot().nodes.find((n) => n.id === "node-c")?.status).toBe("blocked");

    store.applyPatch(fixture.patches.p1StartA);
    expect(snapshot().nodes.find((n) => n.id === "node-c")?.status).toBe("blocked");

    store.applyPatch(fixture.patches.p1StartB);
    expect(snapshot().nodes.find((n) => n.id === "node-c")?.status).toBe("blocked");

    store.applyPatch(fixture.patches.p1CompleteAB);
    // After A and B succeeded, the server pushes a fresh snapshot moving C to ready.
    store.applySnapshot(fixture.snapshots.p1CheckpointWaiting);
    const nodeC = snapshot().nodes.find((n) => n.id === "node-c");
    expect(nodeC?.status).toBe("ready");
    expect(nodeC?.evidence).toHaveLength(1);
  });

  it("concurrent project P2 stays independent of P1's failure or checkpoint", () => {
    const storeP1 = createProductionGraphStore();
    const storeP2 = createProductionGraphStore();
    storeP1.applySnapshot(fixture.snapshots.p1Initial);
    storeP2.applySnapshot(fixture.snapshots.p2Initial);

    // P1's checkpoint cannot affect P2's revision or availability.
    storeP1.applySnapshot(fixture.snapshots.p1CheckpointWaiting);
    expect(storeP2.getSnapshot().snapshot?.revision).toBe(1);
    expect(storeP2.getSnapshot().snapshot?.nodes.find((n) => n.id === "node-d")?.status).toBe("ready");

    // P1 records a paid-generation error; P2 is unaffected.
    storeP1.recordError(
      new ProductionGraphBusinessError("PAID_GENERATION_DISABLED", "禁用真实付费生成", 422),
    );
    expect(storeP1.getSnapshot().lastError?.code).toBe("PAID_GENERATION_DISABLED");
    expect(storeP2.getSnapshot().lastError).toBeNull();
  });
});
