import type {
  CinematicCoverageAggregate,
  ProductionGenerationData,
  RecommendedCut,
} from "@react/features/production";
import type { WebAvEditorClip } from "@react/features/production/webav-video-editor";

export type CoverageEditorMode = "final" | "previs";

function formalVideoUrls(generation: ProductionGenerationData | undefined) {
  return new Map(
    (generation?.trackList ?? [])
      .flatMap((track) => track.videoList)
      .filter((video) => video.state === "completed" && Boolean(video.src))
      .map((video) => [video.id, video.src]),
  );
}

export function resolveFormalVideoUrl(
  generation: ProductionGenerationData | undefined,
  videoId: number | undefined,
): string | undefined {
  return videoId == null ? undefined : formalVideoUrls(generation).get(videoId);
}

export function createCoverageEditorTimeline(
  coverage: CinematicCoverageAggregate,
  cut: RecommendedCut,
  generation: ProductionGenerationData | undefined,
  mode: CoverageEditorMode,
): WebAvEditorClip[] {
  const cameras = new Map((coverage.bundle?.cameras ?? []).map((camera) => [camera.cameraId, camera]));
  const finalUrls = formalVideoUrls(generation);
  const sourceDurationFrames = coverage.bundle?.frameCount ?? cut.durationFrames;
  return cut.clips.map((clip) => {
    const camera = cameras.get(clip.cameraId);
    const src = mode === "previs"
      ? camera?.assets?.previewVideo?.url
      : camera?.status === "ready" && camera.videoId === clip.videoId
        ? finalUrls.get(clip.videoId)
        : undefined;
    return {
      id: clip.id,
      type: "video" as const,
      name: `${camera?.role ?? clip.cameraId} · ${clip.id}`,
      src,
      sourceDuration: sourceDurationFrames / cut.fps,
      trimStart: (clip.sourceInFrame - 1) / cut.fps,
      trimEnd: clip.sourceOutFrame / cut.fps,
      playbackRate: 1,
      volume: 1,
      opacity: 1,
      filter: "none" as const,
      transition: "none" as const,
      transitionDuration: 0,
    };
  });
}

export function updateRecommendedCutFromTimeline(
  cut: RecommendedCut,
  timeline: WebAvEditorClip[],
  coverageFrameCount: number,
): RecommendedCut {
  const expectedFrames = Math.round(coverageFrameCount);
  if (!Number.isFinite(expectedFrames) || expectedFrames <= 0) throw new Error("镜头覆盖缺少有效的总帧数");
  const byId = new Map(cut.clips.map((clip) => [clip.id, clip]));
  const originalFrames = new Map(cut.clips.map((clip) => [clip.id, clip.endFrame - clip.startFrame + 1]));
  const currentTotal = cut.clips.reduce((sum, clip) => sum + clip.endFrame - clip.startFrame + 1, 0);
  if (cut.durationFrames !== expectedFrames || currentTotal !== expectedFrames) {
    throw new Error(`建议剪辑总时长与镜头覆盖不一致（应为 ${expectedFrames} 帧）`);
  }
  const adjustedTimeline = timeline.map((item) => ({ ...item }));
  const sourceBounds = (item: WebAvEditorClip) => {
    const playbackRate = item.playbackRate > 0 ? item.playbackRate : 1;
    const trimEnd = item.trimEnd ?? item.sourceDuration ?? item.trimStart;
    const sourceInFrame = Math.max(1, Math.round(item.trimStart * cut.fps) + 1);
    const sourceOutFrame = Math.round(trimEnd * cut.fps);
    const outputFrames = Math.max(1, Math.round(((trimEnd - item.trimStart) / playbackRate) * cut.fps));
    return { sourceInFrame, sourceOutFrame, outputFrames };
  };
  const rawTotal = adjustedTimeline.reduce((sum, item) => sum + sourceBounds(item).outputFrames, 0);
  if (rawTotal !== expectedFrames) {
    const changes = adjustedTimeline.flatMap((item, index) => {
      const clip = byId.get(item.id);
      if (!clip) return [];
      const bounds = sourceBounds(item);
      const originalLength = originalFrames.get(item.id) ?? 0;
      return bounds.outputFrames === originalLength ? [] : [{ index, item, clip, bounds, delta: bounds.outputFrames - originalLength }];
    });
    const change = changes.length === 1 ? changes[0] : undefined;
    if (change) {
      const startChanged = change.bounds.sourceInFrame !== change.clip.sourceInFrame;
      const endChanged = change.bounds.sourceOutFrame !== change.clip.sourceOutFrame;
      if (!startChanged && endChanged && change.index < adjustedTimeline.length - 1) {
        const neighbor = adjustedTimeline[change.index + 1]!;
        const neighborBounds = sourceBounds(neighbor);
        const nextSourceIn = neighborBounds.sourceInFrame + change.delta;
        if (nextSourceIn < 1 || nextSourceIn > neighborBounds.sourceOutFrame) {
          throw new Error(`${change.item.id} 的边界调整超出相邻片段素材范围`);
        }
        neighbor.trimStart = (nextSourceIn - 1) / cut.fps;
      } else if (startChanged && !endChanged && change.index > 0) {
        const neighbor = adjustedTimeline[change.index - 1]!;
        const neighborBounds = sourceBounds(neighbor);
        const nextSourceOut = neighborBounds.sourceOutFrame - change.delta;
        if (nextSourceOut < neighborBounds.sourceInFrame || nextSourceOut > expectedFrames) {
          throw new Error(`${change.item.id} 的边界调整超出相邻片段素材范围`);
        }
        neighbor.trimEnd = nextSourceOut / cut.fps;
      }
    }
  }
  const seen = new Set<string>();
  let cursor = 1;
  const draft = adjustedTimeline.flatMap((item) => {
    const clip = byId.get(item.id);
    if (!clip) throw new Error(`时间线包含未知片段 ${item.id}`);
    if (seen.has(item.id)) throw new Error(`时间线重复包含片段 ${item.id}`);
    seen.add(item.id);
    const playbackRate = item.playbackRate > 0 ? item.playbackRate : 1;
    if (Math.abs(playbackRate - 1) > 0.0001) throw new Error(`${item.id} 不支持修改播放速度`);
    const trimEnd = item.trimEnd ?? item.sourceDuration ?? item.trimStart;
    const outputFrames = Math.max(1, Math.round(((trimEnd - item.trimStart) / playbackRate) * cut.fps));
    const sourceInFrame = Math.max(1, Math.round(item.trimStart * cut.fps) + 1);
    const sourceOutFrame = sourceInFrame + outputFrames - 1;
    if (sourceOutFrame > expectedFrames) throw new Error(`${item.id} 的素材裁剪超出镜头覆盖范围`);
    const next = {
      ...clip,
      startFrame: cursor,
      endFrame: cursor + outputFrames - 1,
      sourceInFrame,
      sourceOutFrame,
    };
    cursor = next.endFrame + 1;
    return [next];
  });
  const missing = cut.clips.find((clip) => !seen.has(clip.id));
  if (missing) throw new Error(`时间线缺少片段 ${missing.id}`);
  const durationFrames = Math.max(1, cursor - 1);
  if (durationFrames !== expectedFrames) {
    const changed = draft.find((clip) => (clip.endFrame - clip.startFrame + 1) !== originalFrames.get(clip.id));
    throw new Error(`${changed?.id ?? "时间线"} 的独立裁剪会改变总时长（应为 ${expectedFrames} 帧，当前 ${durationFrames} 帧）`);
  }

  let changedRunStart = -1;
  for (let index = 0; index <= draft.length; index += 1) {
    const clip = draft[index];
    const changed = clip != null && (clip.endFrame - clip.startFrame + 1) !== originalFrames.get(clip.id);
    if (changed && changedRunStart < 0) changedRunStart = index;
    if (!changed && changedRunStart >= 0) {
      const run = draft.slice(changedRunStart, index);
      const delta = run.reduce(
        (sum, item) => sum + (item.endFrame - item.startFrame + 1) - (originalFrames.get(item.id) ?? 0),
        0,
      );
      if (run.length < 2 || delta !== 0) throw new Error(`${run[0]!.id} 的裁剪必须与相邻片段成对调整`);
      changedRunStart = -1;
    }
  }
  return { ...cut, durationFrames: expectedFrames, clips: draft };
}

export function recommendedCutDigest(cut: RecommendedCut | null): string {
  if (!cut) return "none";
  return [
    cut.coverageId,
    cut.fps,
    cut.durationFrames,
    ...cut.clips.map((clip) => [clip.id, clip.cameraId, clip.startFrame, clip.endFrame, clip.sourceInFrame, clip.sourceOutFrame, clip.videoId].join(":")),
  ].join("|");
}
