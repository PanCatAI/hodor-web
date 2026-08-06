import { describe, expect, it } from "vitest";

import { buildDualProjectFixture } from "./production-graph-fixture";
import {
  createProductionGraphStore,
  INITIAL_PRODUCTION_GRAPH_STORE,
  isNodeReady,
  selectAvailableActions,
} from "./production-graph-store";
import { ProductionGraphBusinessError } from "./types";

const fixture = buildDualProjectFixture();

describe("ProductionGraphStore", () => {
  it("accepts an initial snapshot and exposes graphId + revision", () => {
    const store = createProductionGraphStore();
    let observed = store.getSnapshot();
    expect(observed.graphId).toBeNull();

    const changes: number[] = [];
    store.subscribe(() => changes.push(changes.length));
    store.applySnapshot(fixture.snapshots.p1Initial);

    observed = store.getSnapshot();
    expect(observed.graphId).toBe("graph-p1");
    expect(observed.snapshot?.revision).toBe(1);
    expect(changes).toHaveLength(1);
  });

  it("applies a patch that builds on the current revision and ignores stale snapshots", () => {
    const store = createProductionGraphStore();
    store.applySnapshot(fixture.snapshots.p1Initial);
    store.applyPatch(fixture.patches.p1StartA);

    expect(store.getSnapshot().snapshot?.revision).toBe(2);
    const nodeA = store.getSnapshot().snapshot?.nodes.find((node) => node.id === "node-a");
    expect(nodeA?.status).toBe("running");
    expect(nodeA?.agentRunId).toBe("run-a-1");

    // stale snapshot (lower revision) must be ignored
    store.applySnapshot({ ...fixture.snapshots.p1Initial, revision: 1 });
    expect(store.getSnapshot().snapshot?.revision).toBe(2);
  });

  it("rejects patches with mismatched baseRevision as a structured business error", () => {
    const store = createProductionGraphStore();
    store.applySnapshot(fixture.snapshots.p1Initial);

    expect(() =>
      store.applyPatch({
        ...fixture.patches.p1StartA,
        baseRevision: 99,
      }),
    ).toThrowError(/PRODUCTION_GRAPH_REVISION_CONFLICT|baseRevision/);

    try {
      store.applyPatch({ ...fixture.patches.p1StartA, baseRevision: 99 });
    } catch (error) {
      expect(error).toBeInstanceOf(ProductionGraphBusinessError);
      expect((error as ProductionGraphBusinessError).code).toBe("PRODUCTION_GRAPH_REVISION_CONFLICT");
    }
  });

  it("removes nodes and edges via changeScope-style patches", () => {
    const store = createProductionGraphStore();
    store.applySnapshot(fixture.snapshots.p1Initial);
    store.applyPatch({
      schemaVersion: "1",
      graphId: "graph-p1",
      baseRevision: 1,
      revision: 2,
      nodesUpsert: [],
      nodeIdsRemoved: ["node-b"],
      edgesUpsert: [],
      edgeIdsRemoved: ["edge-c-b"],
      checkpointDecisionsUpsert: [],
      emittedAt: fixture.patches.p1StartA.emittedAt,
    });

    const snapshot = store.getSnapshot().snapshot;
    expect(snapshot?.nodes.map((node) => node.id)).not.toContain("node-b");
    expect(snapshot?.edges.map((edge) => edge.id)).not.toContain("edge-c-b");
  });

  it("records and clears legacy productionRun events without changing node status", () => {
    const store = createProductionGraphStore();
    store.applySnapshot(fixture.snapshots.p1Initial);

    store.recordLegacyProductionRun({
      graphId: "graph-p1",
      runId: "run-a-1",
      status: "running",
      stage: "internal.reviewText",
      attempt: 1,
      updatedAt: "2026-08-07T00:00:00.000Z",
    });

    expect(store.getSnapshot().legacyProductionRun).toMatchObject({ runId: "run-a-1", stage: "internal.reviewText" });

    store.applyPatch(fixture.patches.p1StartA);
    const nodeA = store.getSnapshot().snapshot?.nodes.find((node) => node.id === "node-a");
    expect(nodeA?.status).toBe("running");
    // legacy record must not propagate back into the real node state
    store.clearLegacyProductionRun();
    expect(store.getSnapshot().legacyProductionRun).toBeNull();
    expect(store.getSnapshot().snapshot?.nodes.find((node) => node.id === "node-a")?.status).toBe("running");
  });

  it("prevents duplicate dispatch but allows two independent nodes to dispatch concurrently", () => {
    const store = createProductionGraphStore();
    store.applySnapshot(fixture.snapshots.p1Initial);

    expect(store.beginDispatch("key-1", 1)).toBe(true);
    // Distinct idempotency key is allowed to dispatch concurrently — this is the
    // concurrency contract: two independent nodes can enter running side-by-side.
    expect(store.beginDispatch("key-2", 1)).toBe(true);
    // Duplicate of an in-flight key is blocked.
    expect(store.beginDispatch("key-1", 1)).toBe(false);
    expect(store.beginDispatch("key-2", 1)).toBe(false);
    expect(store.getSnapshot().pendingDispatchCount).toBe(2);
    expect(store.getSnapshot().inflightIdempotencyKeys.has("key-1")).toBe(true);
    expect(store.getSnapshot().inflightIdempotencyKeys.has("key-2")).toBe(true);

    store.endDispatch("key-1");
    expect(store.getSnapshot().appliedIdempotencyKeys.has("key-1")).toBe(true);
    expect(store.getSnapshot().inflightIdempotencyKeys.has("key-1")).toBe(false);
    // After endDispatch the dedup still kicks in for an already-applied key.
    expect(store.beginDispatch("key-1", 1)).toBe(false);
    // The second in-flight key is still pending and remains a duplicate of itself.
    expect(store.beginDispatch("key-2", 1)).toBe(false);
    store.endDispatch("key-2");
    expect(store.getSnapshot().pendingDispatchCount).toBe(0);
    expect(store.getSnapshot().inflightIdempotencyKeys).toEqual(new Set());
  });

  it("toggles feature flag and keeps the snapshot intact for rollback", () => {
    const store = createProductionGraphStore();
    store.applySnapshot(fixture.snapshots.p1Initial);
    store.setFeatureEnabled(false);

    expect(store.getSnapshot().featureEnabled).toBe(false);
    expect(store.getSnapshot().snapshot?.revision).toBe(1);

    store.setFeatureEnabled(true);
    expect(store.getSnapshot().featureEnabled).toBe(true);
  });

  it("initial state matches the frozen shape", () => {
    expect(INITIAL_PRODUCTION_GRAPH_STORE).toEqual({
      graphId: null,
      snapshot: null,
      pendingPatches: [],
      pendingDispatchCount: 0,
      inflightIdempotencyKeys: expect.any(Set),
      appliedIdempotencyKeys: expect.any(Set),
      legacyProductionRun: null,
      featureEnabled: true,
      lastError: null,
    });
  });
});

describe("isNodeReady / selectAvailableActions", () => {
  it("treats a node as ready when all requires sources have succeeded", () => {
    expect(isNodeReady(fixture.snapshots.p1Initial, "node-c")).toBe(false);
    expect(isNodeReady(fixture.snapshots.p1CheckpointWaiting, "node-c")).toBe(true);
  });

  it("returns checkpoint nodes as ready only when waiting_decision", () => {
    expect(isNodeReady(fixture.snapshots.p1Initial, "checkpoint-cost")).toBe(true);
    expect(isNodeReady(fixture.snapshots.p1AfterAdopt, "checkpoint-cost")).toBe(false);
  });

  it("selectAvailableActions returns frozen six when snapshot is null and intersects when present", () => {
    expect(selectAvailableActions(null)).toEqual([
      "readGraph",
      "changeScope",
      "startReady",
      "pause",
      "resumeOrRetry",
      "adoptCandidate",
    ]);
    expect(
      selectAvailableActions({
        ...fixture.snapshots.p1Initial,
        availableActions: ["readGraph", "pause"],
      }),
    ).toEqual(["readGraph", "pause"]);
  });
});
