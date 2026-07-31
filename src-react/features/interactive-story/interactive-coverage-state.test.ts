import { describe, expect, it } from "vitest";

import {
  applyCoveragePollSettlements,
  patchCoverageById,
  type CoverageByScriptId,
} from "./interactive-coverage-state";
import type { CinematicCoverageAggregate } from "@react/features/production";

function coverage(coverageId: string, scriptId: number, status: CinematicCoverageAggregate["status"] = "running") {
  return {
    schemaVersion: "1",
    coverageId,
    projectId: 7,
    scriptId,
    storyboardId: 31,
    status,
    version: 1,
    plan: { coverageId, cameras: [], blocking: { actorAnchors: [], beats: [] } },
    bundle: null,
    recommendedCut: null,
    error: null,
  } as unknown as CinematicCoverageAggregate;
}

describe("interactive coverage polling state", () => {
  it("keeps every reference when the returned coverage did not change", () => {
    const item = coverage("coverage-a", 12);
    const current: CoverageByScriptId = { 12: [item] };
    const samePayload = { ...item };

    const next = patchCoverageById(current, samePayload);

    expect(next).toBe(current);
    expect(next[12]).toBe(current[12]);
    expect(next[12]?.[0]).toBe(item);
  });

  it("patches only the changed script array and coverage object", () => {
    const first = coverage("coverage-a", 12);
    const sibling = coverage("coverage-b", 12);
    const other = coverage("coverage-c", 13);
    const current: CoverageByScriptId = { 12: [first, sibling], 13: [other] };

    const next = patchCoverageById(current, { ...first, status: "completed", version: 2 });

    expect(next).not.toBe(current);
    expect(next[12]).not.toBe(current[12]);
    expect(next[13]).toBe(current[13]);
    expect(next[12]?.[0]).not.toBe(first);
    expect(next[12]?.[1]).toBe(sibling);
  });

  it("keeps successful polls when another coverage request rejects", () => {
    const first = coverage("coverage-a", 12);
    const second = coverage("coverage-b", 13);
    const current: CoverageByScriptId = { 12: [first], 13: [second] };
    const active = [first, second];
    const results: PromiseSettledResult<CinematicCoverageAggregate>[] = [
      { status: "fulfilled", value: { ...first, status: "completed", version: 2 } },
      { status: "rejected", reason: new Error("网关暂时不可用") },
    ];

    const next = applyCoveragePollSettlements(current, active, results);

    expect(next[12]?.[0]?.status).toBe("completed");
    expect(next[13]?.[0]?.status).toBe("running");
    expect(next[13]?.[0]?.pollError?.message).toBe("网关暂时不可用");
  });
});
