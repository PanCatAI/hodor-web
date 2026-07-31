import type { CinematicCoverageAggregate } from "./types";

function compareCoverage(left: CinematicCoverageAggregate, right: CinematicCoverageAggregate) {
  const version = left.version - right.version;
  if (version !== 0) return version;
  const updatedAt = (left.updatedAt ?? "").localeCompare(right.updatedAt ?? "");
  if (updatedAt !== 0) return updatedAt;
  return left.coverageId.localeCompare(right.coverageId);
}

export function sortCoverageAggregates(items: readonly CinematicCoverageAggregate[]) {
  return [...items].sort(compareCoverage);
}

export function selectLatestCoverage(items: readonly CinematicCoverageAggregate[]) {
  return sortCoverageAggregates(items).at(-1);
}
