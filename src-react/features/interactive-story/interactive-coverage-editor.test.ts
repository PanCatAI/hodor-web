import { describe, expect, it } from "vitest";

import type { CinematicCoverageAggregate, ProductionGenerationData, RecommendedCut } from "@react/features/production";
import { calculateTimeline, type WebAvEditorClip } from "@react/features/production/webav-video-editor";
import {
  createCoverageEditorTimeline,
  recommendedCutDigest,
  updateRecommendedCutFromTimeline,
} from "./interactive-coverage-editor";

const cut: RecommendedCut = {
  schemaVersion: "1",
  coverageId: "coverage-12",
  performanceTakeId: "take-12",
  fps: 24,
  durationFrames: 120,
  clips: [
    { id: "clip-a", cameraId: "cam-a", startFrame: 1, endFrame: 48, sourceInFrame: 1, sourceOutFrame: 48, videoId: 51 },
    { id: "clip-b", cameraId: "cam-b", startFrame: 49, endFrame: 120, sourceInFrame: 49, sourceOutFrame: 120, videoId: 52 },
  ],
};

const coverage = {
  coverageId: "coverage-12",
  bundle: {
    frameCount: 120,
    cameras: [
      { cameraId: "cam-a", role: "MASTER", status: "ready", videoId: 51, assets: { previewVideo: { key: "a-preview", url: "/preview/a.mp4" } } },
      { cameraId: "cam-b", role: "OTS_A", status: "ready", videoId: 52, assets: { previewVideo: { key: "b-preview", url: "/preview/b.mp4" } } },
    ],
  },
} as unknown as CinematicCoverageAggregate;

const generation: ProductionGenerationData = {
  storyboardList: [],
  trackList: [
    { id: 1, prompt: "", duration: 5, state: "completed", errorReason: "", medias: [], videoList: [{ id: 51, src: "/final/a.mp4", state: "completed", errorReason: "" }] },
    { id: 2, prompt: "", duration: 5, state: "completed", errorReason: "", medias: [], videoList: [{ id: 52, src: "/final/b.mp4", state: "completed", errorReason: "" }] },
  ],
};

describe("interactive coverage editor", () => {
  it("uses only completed formal video URLs unless previs mode is explicit", () => {
    const formal = createCoverageEditorTimeline(coverage, cut, generation, "final");
    const previs = createCoverageEditorTimeline(coverage, cut, { storyboardList: [], trackList: [] }, "previs");

    expect(formal.map((clip) => clip.src)).toEqual(["/final/a.mp4", "/final/b.mp4"]);
    expect(previs.map((clip) => clip.src)).toEqual(["/preview/a.mp4", "/preview/b.mp4"]);
    expect(createCoverageEditorTimeline(coverage, cut, { storyboardList: [], trackList: [] }, "final").every((clip) => !clip.src)).toBe(true);
  });

  it("reorders by the WebAV array while preserving every clip duration and the coverage frame count", () => {
    const timeline = [
      { id: "clip-b", trimStart: 2, trimEnd: 5, playbackRate: 1 },
      { id: "clip-a", trimStart: 0, trimEnd: 2, playbackRate: 1 },
    ] as WebAvEditorClip[];

    const next = updateRecommendedCutFromTimeline(cut, timeline, coverage.bundle!.frameCount);

    expect(next.durationFrames).toBe(120);
    expect(next.clips).toEqual([
      expect.objectContaining({ id: "clip-b", startFrame: 1, endFrame: 72, sourceInFrame: 49, sourceOutFrame: 120 }),
      expect.objectContaining({ id: "clip-a", startFrame: 73, endFrame: 120, sourceInFrame: 1, sourceOutFrame: 48 }),
    ]);
    const rendered = createCoverageEditorTimeline(coverage, next, generation, "final");
    const positions = calculateTimeline(rendered).byId;
    expect(rendered.map((clip) => clip.id)).toEqual(next.clips.map((clip) => clip.id));
    expect(rendered.map((clip) => clip.startAt)).toEqual([undefined, undefined]);
    expect(positions["clip-b"]).toMatchObject({ start: 0, end: 3 });
    expect(positions["clip-a"]).toMatchObject({ start: 3, end: 5 });
  });

  it("accepts a paired adjacent cut-boundary edit without changing the coverage duration", () => {
    const timeline = [
      { id: "clip-a", trimStart: 0, trimEnd: 1.5, playbackRate: 1 },
      { id: "clip-b", trimStart: 1.5, trimEnd: 5, playbackRate: 1 },
    ] as WebAvEditorClip[];

    const next = updateRecommendedCutFromTimeline(cut, timeline, 120);

    expect(next.durationFrames).toBe(120);
    expect(next.clips).toEqual([
      expect.objectContaining({ id: "clip-a", startFrame: 1, endFrame: 36, sourceInFrame: 1, sourceOutFrame: 36 }),
      expect.objectContaining({ id: "clip-b", startFrame: 37, endFrame: 120, sourceInFrame: 37, sourceOutFrame: 120 }),
    ]);
  });

  it("ripples a single end-boundary drag into the adjacent clip in one update", () => {
    const timeline = [
      { id: "clip-a", trimStart: 0, trimEnd: 1.5, playbackRate: 1 },
      { id: "clip-b", trimStart: 2, trimEnd: 5, playbackRate: 1 },
    ] as WebAvEditorClip[];

    const next = updateRecommendedCutFromTimeline(cut, timeline, 120);

    expect(next.durationFrames).toBe(120);
    expect(next.clips).toEqual([
      expect.objectContaining({ id: "clip-a", startFrame: 1, endFrame: 36, sourceInFrame: 1, sourceOutFrame: 36 }),
      expect.objectContaining({ id: "clip-b", startFrame: 37, endFrame: 120, sourceInFrame: 37, sourceOutFrame: 120 }),
    ]);
  });

  it("ripples a single start-boundary drag into the previous clip in one update", () => {
    const timeline = [
      { id: "clip-a", trimStart: 0, trimEnd: 2, playbackRate: 1 },
      { id: "clip-b", trimStart: 2.5, trimEnd: 5, playbackRate: 1 },
    ] as WebAvEditorClip[];

    const next = updateRecommendedCutFromTimeline(cut, timeline, 120);

    expect(next.durationFrames).toBe(120);
    expect(next.clips).toEqual([
      expect.objectContaining({ id: "clip-a", startFrame: 1, endFrame: 60, sourceInFrame: 1, sourceOutFrame: 60 }),
      expect.objectContaining({ id: "clip-b", startFrame: 61, endFrame: 120, sourceInFrame: 61, sourceOutFrame: 120 }),
    ]);
  });

  it("rejects a terminal-boundary shrink that has no adjacent clip to ripple", () => {
    const timeline = [
      { id: "clip-a", trimStart: 0, trimEnd: 2, playbackRate: 1 },
      { id: "clip-b", trimStart: 2, trimEnd: 4, playbackRate: 1 },
    ] as WebAvEditorClip[];

    expect(() => updateRecommendedCutFromTimeline(cut, timeline, 120)).toThrow(
      "clip-b 的独立裁剪会改变总时长",
    );
  });

  it("changes the stable digest when an external cut refresh changes frames or order", () => {
    const refreshed = { ...cut, clips: [cut.clips[1]!, cut.clips[0]!] };
    expect(recommendedCutDigest(refreshed)).not.toBe(recommendedCutDigest(cut));
  });
});
