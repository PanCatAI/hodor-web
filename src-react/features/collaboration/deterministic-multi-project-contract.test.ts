import { describe, expect, it } from "vitest";

import { HODOR_EVIDENCE_SUMMARY_HASH, ROLES, buildContractFixture, runDeterministicWebSimulation, shuffledRoleOrder, stableJson } from "./deterministic-multi-project-contract.fixture";

describe("deterministic multi-project collaboration contract", () => {
  const baseline = runDeterministicWebSimulation();

  it("covers two films, four scenes and sixteen shots with stable scoped identities", () => {
    const fixture = buildContractFixture();
    expect(fixture.films.map(({ filmId }) => filmId)).toEqual(["film-alpha", "film-beta"]);
    expect(fixture.scenes).toHaveLength(4);
    expect(fixture.shots).toHaveLength(16);
    expect(new Set(baseline.roleRuns.map(({ roleRunId }) => roleRunId)).size).toBe(6);
    expect(baseline.graphSnapshots).toHaveLength(2);
    expect(new Set(baseline.graphSnapshots.map(({ graphId }) => graphId)).size).toBe(2);
    expect(baseline.graphSnapshots.every(({ filmId, memoryNamespace }) => memoryNamespace === `memory:${filmId}`)).toBe(true);
    for (const run of baseline.roleRuns) {
      expect(run.privateMemoryNamespace).toMatch(new RegExp(`^memory:${run.filmId}:`));
      expect(run.qualityContractVersion).toBe("quality-v3");
    }
    expect(baseline.snapshot.crossFilmLeaks).toBe(0);
  });

  it("collapses three create replays per film into one ledger record", () => {
    expect(baseline.ledger).toHaveLength(2);
    for (const filmId of ["film-alpha", "film-beta"]) {
      const record = baseline.ledger.find(({ idempotencyKey }) => idempotencyKey === `create:${filmId}:v1`);
      expect(record?.taskId).toMatch(/^task_/);
      expect(record?.roleRunId).toMatch(/^role-run_/);
      expect(record?.assetId).toMatch(/^asset_/);
      expect(record?.referenceId).toMatch(/^reference_/);
    }
  });

  it("keeps role ids, responsibility revision, events and evidence stable across ten completion orders", () => {
    const summaries = Array.from({ length: 10 }, (_, index) => {
      const result = runDeterministicWebSimulation(shuffledRoleOrder(index + 1, baseline.roleRuns));
      return {
        roleRunIds: result.roleRuns.map(({ roleRunId }) => roleRunId),
        revisions: result.eventSummary.filter((event): event is Extract<(typeof result.eventSummary)[number], { type: "role-completed" }> => event.type === "role-completed").map(({ responsibilityGraphRevision }) => responsibilityGraphRevision),
        events: stableJson(result.eventSummary),
        evidence: result.eventSummary.filter((event): event is Extract<(typeof result.eventSummary)[number], { type: "role-completed" }> => event.type === "role-completed").map(({ roleRunId, evidenceRefs }) => ({ roleRunId, evidenceRefs })),
        summaryHash: result.summaryHash,
      };
    });
    for (const summary of summaries) expect(summary).toEqual(summaries[0]);
    expect(summaries[0].summaryHash).toBe(HODOR_EVIDENCE_SUMMARY_HASH);
  });

  it("records asset reuse, compression, risk routing and vendor knowledge provenance", () => {
    expect(baseline.assetReuse).toEqual({ allReusableIdentityAssetsHitBeforeMockGeneration: true, mockGenerationCount: 16, providerCalls: 0 });
    expect(baseline.references.filter(({ route }) => route.route === "blender")).toHaveLength(4);
    expect(baseline.references.filter(({ route }) => route.route === "3x3")).toHaveLength(4);
    expect(baseline.references.filter(({ route }) => route.route === "model-direct")).toHaveLength(8);
    for (const reference of baseline.references) {
      expect(reference.compressed.width).toBe(1024);
      expect(reference.original.bytes).toBeGreaterThan(reference.compressed.bytes);
      expect(reference.adoptionReason).toBeTruthy();
      expect(reference.knowledge).toMatchObject({ task: expect.any(String), modelCapability: expect.any(String), filmConstraints: `constraints:${reference.filmId}`, historicalEvidence: expect.any(String), sourceVersion: "vendor-knowledge-source-v2", adoptedVersion: `vendor-adopted:${reference.filmId}:v1` });
    }
  });

  it("repairs only the defective shot and keeps dialog and Graph actions equivalent", () => {
    expect(baseline.localRepair.repairedVersions["film-beta/scene-2/shot-3"].version).toBe(2);
    for (const [shotKey, initial] of Object.entries(baseline.localRepair.initialVersions)) {
      if (shotKey === baseline.localRepair.defectiveShot) continue;
      expect(baseline.localRepair.repairedVersions[shotKey]).toEqual(initial);
    }
    expect(baseline.actionParity.equal).toBe(true);
    expect(baseline.actionParity.dialog).toEqual(baseline.actionParity.graph);
  });

  it("keeps readiness independent from stage and preserves the zero-cost guard", () => {
    expect(baseline.readiness.storyboard).toEqual(baseline.readiness.review);
    expect(baseline.guards).toEqual({ paidGenerationUsd: 0, realProviderCalls: 0, pancatWrites: 0 });
    expect(ROLES).toHaveLength(3);
  });
});
