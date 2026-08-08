import { describe, expect, it } from "vitest";

import { HODOR_EVIDENCE_SUMMARY_HASH, ROLES, buildContractFixture, runDeterministicWebSimulation, shuffledRoleOrder, stableJson } from "./deterministic-multi-project-contract.fixture";

describe("deterministic multi-project collaboration contract", () => {
  const baseline = runDeterministicWebSimulation();

  it("covers two films, four scenes and sixteen shots with stable scoped identities", () => {
    const fixture = buildContractFixture();
    expect(fixture.films.map(({ filmId }: any) => filmId)).toEqual(["film-alpha", "film-beta"]);
    expect(fixture.scenes).toHaveLength(4);
    expect(fixture.shots).toHaveLength(16);
    expect(new Set(baseline.roleRuns.map(({ roleRunId }: any) => roleRunId)).size).toBe(6);
    expect(baseline.graphSnapshots).toHaveLength(2);
    expect(new Set(baseline.graphSnapshots.map(({ graphId }: any) => graphId)).size).toBe(2);
    expect(baseline.graphSnapshots.every(({ filmId, memoryNamespace }: any) => memoryNamespace === `memory:${filmId}`)).toBe(true);
    for (const run of baseline.roleRuns as any[]) {
      expect(run.privateMemoryNamespace).toMatch(new RegExp(`^memory:${run.filmId}:`));
      expect(run.qualityContractVersion).toBe("quality-v3");
    }
    expect(baseline.snapshot.crossFilmLeaks).toBe(0);
  });

  it("collapses three create replays per film into one ledger record", () => {
    expect(baseline.ledger).toHaveLength(2);
    for (const filmId of ["film-alpha", "film-beta"]) {
      const record = baseline.ledger.find(({ idempotencyKey }: any) => idempotencyKey === `create:${filmId}:v1`);
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
        roleRunIds: result.roleRuns.map(({ roleRunId }: any) => roleRunId),
        revisions: result.eventSummary.filter((event: any) => event.type === "role-completed").map(({ responsibilityGraphRevision }: any) => responsibilityGraphRevision),
        events: stableJson(result.eventSummary),
        evidence: result.eventSummary.filter((event: any) => event.type === "role-completed").map(({ roleRunId, evidenceRefs }: any) => ({ roleRunId, evidenceRefs })),
        summaryHash: result.summaryHash,
      };
    });
    for (const summary of summaries) expect(summary).toEqual(summaries[0]);
    expect(summaries[0].summaryHash).toBe(HODOR_EVIDENCE_SUMMARY_HASH);
  });

  it("records asset reuse, compression, risk routing and vendor knowledge provenance", () => {
    expect(baseline.assetReuse).toMatchObject({ allReusableIdentityAssetsHitBeforeMockGeneration: true, mockGenerationCount: 16, providerCalls: 0 });
    expect(baseline.references.filter(({ route }: any) => route.route === "blender")).toHaveLength(4);
    expect(baseline.references.filter(({ route }: any) => route.route === "3x3")).toHaveLength(4);
    expect(baseline.references.filter(({ route }: any) => route.route === "model-direct")).toHaveLength(8);
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

  it("records Promise.all replay provenance and computed isolation", () => {
    expect(baseline.execution.promiseAllFilms).toBe(true);
    expect(baseline.execution.interleavedFilmEvents).toBe(true);
    expect(baseline.replaySummaries).toHaveLength(6);
    expect(baseline.replaySummaries.every(({ replayCount, uniqueRecordCounts }: any) => replayCount === 3 && uniqueRecordCounts.task === 1 && uniqueRecordCounts.roleRun === 1 && uniqueRecordCounts.asset === 1 && uniqueRecordCounts.reference === 1)).toBe(true);
    expect(baseline.snapshot.computedIsolation).toEqual({ graphLeaks: 0, memoryLeaks: 0, assetLeaks: 0, responsibilityLeaks: 0 });
  });

  it("persists ten distinct completion orders and a stable logical revision", () => {
    expect(baseline.determinism.comparisons).toHaveLength(10);
    expect(new Set(baseline.determinism.comparisons.map(({ completionOrder }: any) => completionOrder.join(","))).size).toBe(10);
    expect(baseline.determinism.comparisons.every(({ matchesCanonical, logicalRevision }: any) => matchesCanonical && logicalRevision === baseline.determinism.logicalRevision)).toBe(true);
  });

  it("records ordered asset, reference, review and role return-context evidence", () => {
    for (const shot of baseline.fixture.shots) {
      const key = `${shot.filmId}/${shot.sceneId}/${shot.shotId}`;
      const events = baseline.eventSummary.filter((event: any) => event.shotKey === key && ["asset-hit", "mock-generation-skipped", "reference-compressed", "shot-planned"].includes(event.type));
      expect(events.map(({ type }: any) => type)).toEqual(["asset-hit", "mock-generation-skipped", "reference-compressed", "shot-planned"]);
    }
    expect(baseline.localRepair.reviewEvent.type).toBe("automatic-review");
    expect(baseline.localRepair.unaffectedHashProof).toHaveLength(15);
    expect(baseline.localRepair.versionChain).toHaveLength(2);
    for (const run of baseline.roleRuns) expect(run.returnContext).toEqual({ filmId: run.filmId, sceneId: run.sceneId, privateMemoryNamespace: run.privateMemoryNamespace, qualityContractVersion: "quality-v3" });
    expect(baseline.actionParity.dialog.responsibilityGraphChange).toEqual(baseline.actionParity.graph.responsibilityGraphChange);
    expect(baseline.actionParity.dialog.evidenceChain).toEqual(baseline.actionParity.graph.evidenceChain);
  });
});
