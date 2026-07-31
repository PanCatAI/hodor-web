import type { CinematicCoverageAggregate } from "@react/features/production";

export type CoverageByScriptId = Record<number, CinematicCoverageAggregate[] | undefined>;

function mediaSignature(media: { key: string; url: string; frame?: number } | undefined) {
  return media ? `${media.key}\u0000${media.url}\u0000${media.frame ?? ""}` : "";
}

export function coveragePollSignature(coverage: CinematicCoverageAggregate) {
  const cameras = coverage.bundle?.cameras.map((camera) => [
    camera.cameraId,
    camera.status,
    camera.renderId ?? "",
    camera.videoId ?? "",
    camera.startFrame,
    camera.endFrame,
    camera.retry?.attempt ?? "",
    camera.retry?.maxAttempts ?? "",
    camera.retry?.lastError ?? "",
    camera.retry?.lastAttemptAt ?? "",
    camera.quality?.status ?? "",
    camera.quality?.score ?? "",
    ...(camera.quality?.issues.map((issue) => `${issue.code}:${issue.severity}:${issue.message}`) ?? []),
    mediaSignature(camera.assets?.previewVideo),
    mediaSignature(camera.assets?.firstFrame),
    mediaSignature(camera.assets?.lastFrame),
    mediaSignature(camera.assets?.manifest),
    ...(camera.assets?.controlFrames?.map(mediaSignature) ?? []),
    ...(camera.assets?.depthMaps?.map(mediaSignature) ?? []),
    ...(camera.assets?.masks?.map(mediaSignature) ?? []),
  ].join("\u0001")).join("\u0002") ?? "";
  const clips = coverage.recommendedCut?.clips.map((clip) => [
    clip.id,
    clip.cameraId,
    clip.startFrame,
    clip.endFrame,
    clip.sourceInFrame,
    clip.sourceOutFrame,
    clip.videoId,
  ].join(":")).join("\u0002") ?? "";
  return [
    coverage.coverageId,
    coverage.version,
    coverage.updatedAt ?? "",
    coverage.status,
    coverage.timelineRevision ?? "",
    coverage.error?.code ?? "",
    coverage.error?.message ?? "",
    coverage.pollError?.message ?? "",
    coverage.plan.presetId ?? "",
    coverage.plan.cameras?.length ?? 0,
    coverage.plan.blocking?.actorAnchors?.length ?? 0,
    coverage.plan.blocking?.beats?.length ?? 0,
    coverage.bundle?.frameCount ?? "",
    cameras,
    coverage.recommendedCut?.durationFrames ?? "",
    clips,
  ].join("\u0003");
}

export function patchCoverageById(current: CoverageByScriptId, update: CinematicCoverageAggregate): CoverageByScriptId {
  const items = current[update.scriptId];
  if (!items) return current;
  const index = items.findIndex((item) => item.coverageId === update.coverageId);
  if (index < 0) return current;
  const previous = items[index];
  if (!previous || coveragePollSignature(previous) === coveragePollSignature(update)) return current;
  const nextItems = items.slice();
  nextItems[index] = update;
  return { ...current, [update.scriptId]: nextItems };
}

function pollErrorMessage(reason: unknown) {
  return reason instanceof Error ? reason.message : typeof reason === "string" ? reason : "镜头覆盖状态读取失败";
}

export function applyCoveragePollSettlements(
  current: CoverageByScriptId,
  active: readonly CinematicCoverageAggregate[],
  results: readonly PromiseSettledResult<CinematicCoverageAggregate>[],
) {
  return results.reduce<CoverageByScriptId>((state, result, index) => {
    const requested = active[index];
    if (!requested) return state;
    if (result.status === "fulfilled") {
      const update = result.value.pollError ? { ...result.value, pollError: null } : result.value;
      return patchCoverageById(state, update);
    }
    return patchCoverageById(state, { ...requested, pollError: { message: pollErrorMessage(result.reason) } });
  }, current);
}
