import { describe, expect, it } from "vitest";

import { selectLatestCoverage, sortCoverageAggregates } from "./coverage-selection";
import type { CinematicCoverageAggregate } from "./types";

function coverage(coverageId: string, version: number, updatedAt?: string): CinematicCoverageAggregate {
  return { coverageId, version, updatedAt } as CinematicCoverageAggregate;
}

describe("coverage selection", () => {
  it("sorts by version, updatedAt and stable coverage id without mutating the source", () => {
    const source = [
      coverage("coverage-b", 3, "2026-08-01T01:00:00.000Z"),
      coverage("coverage-c", 2, "2026-08-01T03:00:00.000Z"),
      coverage("coverage-a", 3, "2026-08-01T01:00:00.000Z"),
      coverage("coverage-z", 3, "2026-08-01T00:00:00.000Z"),
    ];

    expect(sortCoverageAggregates(source).map((item) => item.coverageId)).toEqual([
      "coverage-c",
      "coverage-z",
      "coverage-a",
      "coverage-b",
    ]);
    expect(source.map((item) => item.coverageId)).toEqual(["coverage-b", "coverage-c", "coverage-a", "coverage-z"]);
  });

  it("selects the same latest coverage regardless of response order", () => {
    const old = coverage("coverage-old", 1, "2026-08-01T01:00:00.000Z");
    const latest = coverage("coverage-latest", 4, "2026-08-01T02:00:00.000Z");

    expect(selectLatestCoverage([latest, old])).toBe(latest);
    expect(selectLatestCoverage([old, latest])).toBe(latest);
    expect(selectLatestCoverage([])).toBeUndefined();
  });
});
