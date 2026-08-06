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
