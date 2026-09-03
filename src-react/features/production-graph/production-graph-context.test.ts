import { describe, expect, it } from "vitest";

import {
  createProductionGraphContextBridge,
  missingProductionGraphContextKeys,
} from "./production-graph-context";
import { createProductionGraphStore } from "./production-graph-store";
import { buildDualProjectFixture } from "./production-graph-fixture";

const fixture = buildDualProjectFixture();

describe("ProductionGraphContextBridge", () => {
  it("returns empty object until snapshot arrives so legacy chat path stays unchanged", () => {
    const store = createProductionGraphStore();
    const bridge = createProductionGraphContextBridge({ store });
    expect(bridge()).toEqual({});
  });

  it("carries graphId and revision once a snapshot is applied", () => {
    const store = createProductionGraphStore();
    const bridge = createProductionGraphContextBridge({ store });
    store.applySnapshot(fixture.snapshots.p1Initial);

    expect(bridge()).toMatchObject({ graphId: "graph-p1", revision: 1 });
    expect(missingProductionGraphContextKeys(bridge())).toEqual(["selectedNodeId", "checkpointId"]);
  });

  it("reflects selectedNodeId and checkpointId after setSelection", () => {
    const store = createProductionGraphStore();
    const bridge = createProductionGraphContextBridge({ store });
    store.applySnapshot(fixture.snapshots.p1CheckpointWaiting);

    bridge.setSelection({ selectedNodeId: "checkpoint-cost", checkpointId: "checkpoint-cost-1" });
    expect(bridge()).toMatchObject({
      graphId: "graph-p1",
      revision: 5,
      selectedNodeId: "checkpoint-cost",
      checkpointId: "checkpoint-cost-1",
    });

    expect(missingProductionGraphContextKeys(bridge())).toEqual([]);
  });

  it("returns empty object when feature flag is disabled, regardless of selection", () => {
    const store = createProductionGraphStore();
    const bridge = createProductionGraphContextBridge({
      store,
      initial: { selectedNodeId: "node-a", checkpointId: "checkpoint-cost-1" },
    });
    store.applySnapshot(fixture.snapshots.p1Initial);
    store.setFeatureEnabled(false);

    expect(bridge()).toEqual({});
  });

  it("missingProductionGraphContextKeys flags every missing identity field", () => {
    expect(missingProductionGraphContextKeys(undefined)).toEqual([
      "graphId",
      "revision",
      "selectedNodeId",
      "checkpointId",
    ]);
    expect(
      missingProductionGraphContextKeys({ graphId: "graph-p1", revision: 1 }),
    ).toEqual(["selectedNodeId", "checkpointId"]);
    expect(
      missingProductionGraphContextKeys({
        graphId: "graph-p1",
        revision: 5,
        selectedNodeId: "checkpoint-cost",
        checkpointId: "checkpoint-cost-1",
      }),
    ).toEqual([]);
  });
});
