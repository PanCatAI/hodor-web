import { describe, expect, it, vi } from "vitest";

import {
  createProductionGraphActionDispatcher,
  type ProductionActionAck,
  type ProductionGraphActionSocket,
} from "./production-graph-actions";
import { createProductionGraphStore } from "./production-graph-store";
import { buildDualProjectFixture } from "./production-graph-fixture";
import { ProductionGraphBusinessError } from "./types";

const fixture = buildDualProjectFixture();

function createRecordingSocket(): ProductionGraphActionSocket & {
  emitted: Array<{ event: string; payload: unknown; ack?: (response: ProductionActionAck) => void }>;
  ack(response: ProductionActionAck): void;
  ackNext: ProductionActionAck | null;
} {
  const emitted: Array<{ event: string; payload: unknown; ack?: (response: ProductionActionAck) => void }> = [];
  let ackNext: ProductionActionAck | null = null;
  return {
    connected: true,
    emitted,
    ackNext,
    emit(event, payload, ack) {
      emitted.push({ event, payload, ack });
      if (ack && ackNext) {
        const response = ackNext;
        ackNext = null;
        ack(response);
      }
    },
    ack(response) {
      ackNext = response;
    },
  };
}

describe("ProductionGraphActionDispatcher", () => {
  it("bootstraps a missing graph through the real changeScope action and applies the returned snapshot", async () => {
    const store = createProductionGraphStore();
    const socket = createRecordingSocket();
    const snapshot = { ...fixture.snapshots.p1Initial, graphId: "pending-project-7", projectId: 7 };
    const dispatcher = createProductionGraphActionDispatcher({
      store,
      socket,
      buildContext: () => ({ actorRef: null, graphId: "pending-project-7", selectedNodeId: null, checkpointId: null }),
    });
    socket.ack({
      ok: true,
      result: { action: "changeScope", snapshot, idempotencyKey: "bootstrap-1", paidGenerationUsd: 0 },
    });

    const ack = await dispatcher.dispatch({
      action: "changeScope",
      idempotencyKey: "bootstrap-1",
      expectedRevision: 0,
      nodesUpsert: [],
      nodeIdsRemoved: [],
      edgesUpsert: [],
      edgeIdsRemoved: [],
    });

    expect(ack.ok).toBe(true);
    expect(socket.emitted).toHaveLength(1);
    expect(store.getSnapshot().snapshot?.graphId).toBe("pending-project-7");
  });

  it("rejects readGraph when feature is disabled", async () => {
    const store = createProductionGraphStore();
    store.setFeatureEnabled(false);
    const socket = createRecordingSocket();
    const dispatcher = createProductionGraphActionDispatcher({
      store,
      socket,
      buildContext: () => ({ actorRef: null, graphId: "graph-p1", selectedNodeId: null, checkpointId: null }),
    });

    const ack = await dispatcher.dispatch({ action: "readGraph" });
    expect(ack.ok).toBe(false);
    expect(ack.error?.code).toBe("PRODUCTION_GRAPH_DISABLED");
    expect(socket.emitted).toHaveLength(0);
  });

  it("rejects change actions before any snapshot has arrived", async () => {
    const store = createProductionGraphStore();
    const socket = createRecordingSocket();
    const dispatcher = createProductionGraphActionDispatcher({
      store,
      socket,
      buildContext: () => ({ actorRef: "founder@example.com", graphId: "graph-p1", selectedNodeId: "node-a", checkpointId: null }),
    });

    const ack = await dispatcher.dispatch({
      action: "startReady",
      idempotencyKey: "key-1",
      expectedRevision: 1,
      nodeIds: ["node-a"],
    });
    expect(ack.ok).toBe(false);
    expect(ack.error?.code).toBe("PRODUCTION_GRAPH_DISABLED");
    expect(socket.emitted).toHaveLength(0);
  });

  it("emits action event with flat payload expected by backend and accepts ack result", async () => {
    const store = createProductionGraphStore();
    store.applySnapshot(fixture.snapshots.p1Initial);
    const socket = createRecordingSocket();
    const dispatcher = createProductionGraphActionDispatcher({
      store,
      socket,
      buildContext: () => ({ actorRef: "founder@example.com", graphId: "graph-p1", selectedNodeId: "node-a", checkpointId: null }),
    });

    socket.ack({
      ok: true,
      result: {
        action: "startReady",
        snapshot: { ...fixture.snapshots.p1Initial, revision: 2 },
        paidGenerationUsd: 0,
        idempotencyKey: "key-1",
      },
    });

    const ack = await dispatcher.dispatch({
      action: "startReady",
      idempotencyKey: "key-1",
      expectedRevision: 1,
      nodeIds: ["node-a"],
    });

    expect(ack.ok).toBe(true);
    expect(ack.result?.action).toBe("startReady");
    expect(socket.emitted).toHaveLength(1);
    expect(socket.emitted[0].event).toBe("productionGraph:action");
    const payload = socket.emitted[0].payload as {
      graphId: string;
      revision: number;
      selectedNodeId: string | null;
      checkpointId: string | null;
      action: { action: string; idempotencyKey: string; expectedRevision: number; nodeIds: string[] };
    };
    expect(payload.graphId).toBe("graph-p1");
    expect(payload.revision).toBe(1);
    expect(payload.selectedNodeId).toBe("node-a");
    expect(payload.checkpointId).toBeNull();
    expect(payload.action).toMatchObject({ action: "startReady", nodeIds: ["node-a"] });
    expect(payload.action.idempotencyKey).toBe("key-1");
    expect(payload.action.expectedRevision).toBe(1);

    expect(store.getSnapshot().appliedIdempotencyKeys.has("key-1")).toBe(true);
  });

  it("does not re-dispatch when the same idempotencyKey has already been applied", async () => {
    const store = createProductionGraphStore();
    store.applySnapshot(fixture.snapshots.p1Initial);
    store.rememberIdempotencyKey("dup-key");
    const socket = createRecordingSocket();
    const dispatcher = createProductionGraphActionDispatcher({
      store,
      socket,
      buildContext: () => ({ actorRef: null, graphId: "graph-p1", selectedNodeId: "node-a", checkpointId: null }),
    });

    const ack = await dispatcher.dispatch({
      action: "startReady",
      idempotencyKey: "dup-key",
      expectedRevision: 1,
      nodeIds: ["node-a"],
    });
    expect(ack.ok).toBe(true);
    expect(socket.emitted).toHaveLength(0);
    expect(ack.result?.action).toBe("startReady");
  });

  it("records business error from ack and clears on next success", async () => {
    const store = createProductionGraphStore();
    store.applySnapshot(fixture.snapshots.p1Initial);
    const socket = createRecordingSocket();
    const dispatcher = createProductionGraphActionDispatcher({
      store,
      socket,
      buildContext: () => ({ actorRef: null, graphId: "graph-p1", selectedNodeId: "node-a", checkpointId: null }),
    });

    socket.ack({
      ok: false,
      error: { code: "PAID_GENERATION_DISABLED", message: "禁用真实付费生成", status: 422 },
    });

    const failure = await dispatcher.dispatch({
      action: "startReady",
      idempotencyKey: "key-fail",
      expectedRevision: 1,
      nodeIds: ["node-a"],
    });
    expect(failure.ok).toBe(false);
    expect(store.getSnapshot().lastError?.code).toBe("PAID_GENERATION_DISABLED");

    socket.ack({
      ok: true,
      result: {
        action: "startReady",
        snapshot: { ...fixture.snapshots.p1Initial, revision: 2 },
        paidGenerationUsd: 0,
        idempotencyKey: "key-success",
      },
    });
    const success = await dispatcher.dispatch({
      action: "startReady",
      idempotencyKey: "key-success",
      expectedRevision: 1,
      nodeIds: ["node-a"],
    });
    expect(success.ok).toBe(true);
    expect(store.getSnapshot().lastError).toBeNull();
  });

  it("rejects invalid inputs (missing idempotencyKey, negative expectedRevision, unknown action) without emit", async () => {
    const store = createProductionGraphStore();
    store.applySnapshot(fixture.snapshots.p1Initial);
    const socket = createRecordingSocket();
    const dispatcher = createProductionGraphActionDispatcher({
      store,
      socket,
      buildContext: () => ({ actorRef: null, graphId: "graph-p1", selectedNodeId: null, checkpointId: null }),
    });

    const missingKey = await dispatcher.dispatch({
      action: "startReady",
      idempotencyKey: "",
      expectedRevision: 1,
      nodeIds: ["node-a"],
    });
    expect(missingKey.ok).toBe(false);

    const badRevision = await dispatcher.dispatch({
      action: "startReady",
      idempotencyKey: "key-x",
      expectedRevision: -1,
      nodeIds: ["node-a"],
    } as unknown as Parameters<typeof dispatcher.dispatch>[0]);
    expect(badRevision.ok).toBe(false);

    const unknown = await dispatcher.dispatch({ action: "unknown" as never });
    expect(unknown.ok).toBe(false);
    expect(unknown.error?.code).toBe("PRODUCTION_ACTION_UNBOUND");
    expect(socket.emitted).toHaveLength(0);
  });

  it("isAvailable reflects feature flag, snapshot presence, and availableActions list", () => {
    const store = createProductionGraphStore();
    const socket = createRecordingSocket();
    const dispatcher = createProductionGraphActionDispatcher({
      store,
      socket,
      buildContext: () => ({ actorRef: null, graphId: "graph-p1", selectedNodeId: null, checkpointId: null }),
    });

    expect(dispatcher.isAvailable("readGraph")).toBe(true);
    expect(dispatcher.isAvailable("startReady")).toBe(false);

    store.applySnapshot(fixture.snapshots.p1Initial);
    expect(dispatcher.isAvailable("startReady")).toBe(true);

    store.applySnapshot({
      ...fixture.snapshots.p1Initial,
      availableActions: ["readGraph"],
    });
    expect(dispatcher.isAvailable("startReady")).toBe(false);
    expect(dispatcher.isAvailable("readGraph")).toBe(true);

    store.setFeatureEnabled(false);
    expect(dispatcher.isAvailable("startReady")).toBe(false);
    expect(dispatcher.isAvailable("readGraph")).toBe(true);
  });

  it("wraps a thrown synchronous emit into a structured error", async () => {
    const store = createProductionGraphStore();
    store.applySnapshot(fixture.snapshots.p1Initial);
    const socket: ProductionGraphActionSocket = {
      connected: true,
      emit() {
        throw new ProductionGraphBusinessError("PRODUCTION_ACTION_UNBOUND", "broken pipe", 502);
      },
    };
    const dispatcher = createProductionGraphActionDispatcher({
      store,
      socket,
      buildContext: () => ({ actorRef: null, graphId: "graph-p1", selectedNodeId: "node-a", checkpointId: null }),
    });

    const ack = await dispatcher.dispatch({
      action: "startReady",
      idempotencyKey: "key-throw",
      expectedRevision: 1,
      nodeIds: ["node-a"],
    });
    expect(ack.ok).toBe(false);
    expect(ack.error?.code).toBe("PRODUCTION_ACTION_UNBOUND");
  });
});

describe("ProductionGraph v1 six-action parity (UI ⇄ Agent)", () => {
  // The contract requires that UI buttons and the Agent adapter both go through
  // the same createProductionGraphActionDispatcher.dispatch() entry point and
  // produce the same flat payload shape for every frozen action. This test
  // exercises each of the six actions through the dispatcher and asserts the
  // wire-format the backend route parses.
  function buildDispatcher() {
    const store = createProductionGraphStore();
    store.applySnapshot(fixture.snapshots.p1Initial);
    const emitted: Array<{ event: string; payload: unknown; ack?: (response: ProductionActionAck) => void }> = [];
    let nextRevision = fixture.snapshots.p1Initial.revision;
    const socket: ProductionGraphActionSocket = {
      connected: true,
      emit(event, payload, ack) {
        emitted.push({ event, payload, ack });
        nextRevision += 1;
        const input = (payload as { action: { action: string; idempotencyKey?: string } }).action;
        ack?.({
          ok: true,
          result: {
            action: input.action as never,
            snapshot: { ...fixture.snapshots.p1Initial, revision: nextRevision },
            paidGenerationUsd: 0,
            idempotencyKey: input.idempotencyKey,
          },
        });
      },
    };
    const dispatcher = createProductionGraphActionDispatcher({
      store,
      socket,
      buildContext: () => ({ actorRef: "founder@example.com", graphId: "graph-p1", selectedNodeId: "node-a", checkpointId: null }),
    });
    return { dispatcher, emitted, store };
  }

  it("each of the six frozen actions dispatches through the same handler with the same payload shape", async () => {
    const { dispatcher, emitted } = buildDispatcher();
    const expectedRevision = fixture.snapshots.p1Initial.revision;

    // 1. readGraph — no idempotencyKey needed; safe to interleave with change actions.
    await dispatcher.dispatch({ action: "readGraph" });

    // 2. changeScope — empty delta at the same revision.
    await dispatcher.dispatch({
      action: "changeScope",
      idempotencyKey: "scope-1",
      expectedRevision,
      nodesUpsert: [],
      nodeIdsRemoved: [],
      edgesUpsert: [],
      edgeIdsRemoved: [],
    });

    // 3. startReady — single-node dispatch; the dual-dispatch case is covered below.
    await dispatcher.dispatch({
      action: "startReady",
      idempotencyKey: "start-a",
      expectedRevision,
      nodeIds: ["node-a"],
    });

    // 4. pause.
    await dispatcher.dispatch({
      action: "pause",
      idempotencyKey: "pause-a",
      expectedRevision,
      nodeIds: ["node-a"],
    });

    // 5. resumeOrRetry with a checkpoint decision.
    await dispatcher.dispatch({
      action: "resumeOrRetry",
      idempotencyKey: "resume-a",
      expectedRevision,
      nodeIds: ["node-a"],
      checkpointDecision: {
        checkpointId: "checkpoint-cost-1",
        outcome: "approved",
        reason: "cost",
        note: "",
      },
    });

    // 6. adoptCandidate using node-c's candidate/asset refs from the fixture.
    await dispatcher.dispatch({
      action: "adoptCandidate",
      idempotencyKey: "adopt-c",
      expectedRevision,
      nodeId: "node-c",
      candidate: { authority: "pancat", kind: "candidate", ref: "pancat://candidate/c-1" },
      target: { authority: "pancat", kind: "asset", ref: "pancat://asset/adopted-1" },
    });

    // All six actions emitted exactly one productionGraph:action event each.
    expect(emitted.filter((entry) => entry.event === "productionGraph:action")).toHaveLength(6);
    // Each emission uses the same flat payload shape (graphId/revision/selectedNodeId/checkpointId/action).
    for (const entry of emitted) {
      if (entry.event !== "productionGraph:action") continue;
      const payload = entry.payload as Record<string, unknown>;
      expect(Object.keys(payload).sort()).toEqual(["action", "checkpointId", "graphId", "revision", "selectedNodeId"]);
    }
  });

  it("two independent startReady dispatches with distinct idempotency keys both reach the socket and both keys are remembered", async () => {
    const { dispatcher, emitted, store } = buildDispatcher();
    const expectedRevision = fixture.snapshots.p1Initial.revision;

    const [ackA, ackB] = await Promise.all([
      dispatcher.dispatch({
        action: "startReady",
        idempotencyKey: "start-a",
        expectedRevision,
        nodeIds: ["node-a"],
      }),
      dispatcher.dispatch({
        action: "startReady",
        idempotencyKey: "start-b",
        expectedRevision,
        nodeIds: ["node-b"],
      }),
    ]);

    expect(ackA.ok).toBe(true);
    expect(ackB.ok).toBe(true);
    expect(ackA.result?.idempotencyKey).toBe("start-a");
    expect(ackB.result?.idempotencyKey).toBe("start-b");

    const actionEmits = emitted.filter((entry) => entry.event === "productionGraph:action");
    expect(actionEmits).toHaveLength(2);
    expect((actionEmits[0].payload as { action: { idempotencyKey: string } }).action.idempotencyKey).toBe("start-a");
    expect((actionEmits[1].payload as { action: { idempotencyKey: string } }).action.idempotencyKey).toBe("start-b");

    // Both keys are persisted so a reconnect-time duplicate is suppressed.
    expect(store.getSnapshot().appliedIdempotencyKeys.has("start-a")).toBe(true);
    expect(store.getSnapshot().appliedIdempotencyKeys.has("start-b")).toBe(true);
  });

  it("duplicate dispatch of the same idempotency key while in flight is a no-op that does not reach the socket", async () => {
    const store = createProductionGraphStore();
    store.applySnapshot(fixture.snapshots.p1Initial);
    const expectedRevision = fixture.snapshots.p1Initial.revision;

    const emitted: Array<{ event: string; payload: unknown; ack?: (response: ProductionActionAck) => void }> = [];
    const release: { current: ((response: ProductionActionAck) => void) | null } = { current: null };
    const socket: ProductionGraphActionSocket = {
      connected: true,
      emit(event, payload, ack) {
        emitted.push({ event, payload, ack });
        // Hold the ack until the test releases it; this lets us observe the
        // in-flight window during which a duplicate must be suppressed.
        if (!release.current) {
          release.current = (response) => ack?.(response);
        }
      },
    };
    const dispatcher = createProductionGraphActionDispatcher({
      store,
      socket,
      buildContext: () => ({ actorRef: null, graphId: "graph-p1", selectedNodeId: "node-a", checkpointId: null }),
    });

    const promiseA = dispatcher.dispatch({
      action: "startReady",
      idempotencyKey: "dup-key",
      expectedRevision,
      nodeIds: ["node-a"],
    });
    // Allow the microtask queue to settle so promiseA has entered the await window.
    await Promise.resolve();
    const duplicate = await dispatcher.dispatch({
      action: "startReady",
      idempotencyKey: "dup-key",
      expectedRevision,
      nodeIds: ["node-a"],
    });
    expect(duplicate.ok).toBe(true);
    expect(duplicate.result?.action).toBe("startReady");

    release.current?.({
      ok: true,
      result: {
        action: "startReady",
        snapshot: { ...fixture.snapshots.p1Initial, revision: expectedRevision + 1 },
        paidGenerationUsd: 0,
        idempotencyKey: "dup-key",
      },
    });
    const ackA = await promiseA;
    expect(ackA.ok).toBe(true);

    // Only the first dispatch actually reached the socket; the duplicate was a no-op.
    const actionEmits = emitted.filter((entry) => entry.event === "productionGraph:action");
    expect(actionEmits).toHaveLength(1);
  });
});
