import { describe, expect, it } from "vitest";

import { buildSpatialProductionStages, spatialProductionStageOrder } from "./spatial-production-stages";
import type { CinematicCoverageAggregate, ProductionFlowData, ProductionGenerationData } from "./types";

const flow: ProductionFlowData = {
  script: "INT. ROOM",
  scriptPlan: "先建立空间，再覆盖表演。",
  assets: [
    {
      id: 1,
      name: "雨夜房间",
      type: "scene",
      prompt: "",
      desc: "场景母版",
      src: "https://example.test/scene-master.jpg",
      state: "completed",
      errorReason: "",
      derive: [],
    },
  ],
  storyboardTable: "| 镜头 |",
  storyboard: [],
  worldAssets: [
    {
      id: 8,
      projectId: 7,
      sourceSceneAssetId: 1,
      storyboardId: 31,
      provider: "worldlabs-marble",
      providerWorldId: "world-8",
      model: "Marble 0.1",
      status: "succeeded",
      prompt: "雨夜房间",
      displayName: "雨夜房间世界",
      worldJobId: "job-8",
      panoramaUrl: "https://example.test/world.jpg",
      colliderMeshUrl: "https://example.test/collider.glb",
      spzUrls: { high: "https://example.test/world.spz" },
      thumbnailUrl: "https://example.test/world-thumb.jpg",
      caption: "雨夜室内",
      semantics: {
        metricScaleFactor: 1,
        groundPlaneOffset: 0,
        coordinateSystem: "opengl",
        registration: {
          schemaVersion: "1",
          status: "calibrated",
          coordinateSystem: "opengl",
          worldToStage: { translation: [0, 0, 0], rotationEuler: [0, 0, 0] },
          landmarks: [{ landmarkId: "scene-1", name: "雨夜房间", position: [0, 0, 0], facing: [0, 1, 0] }],
          stagingZones: [{ zoneId: "stage", name: "表演区", min: [-2, -2, 0], max: [2, 2, 3] }],
          cameraZones: [{ zoneId: "camera", name: "机位区", min: [-6, -6, 0], max: [6, 6, 4] }],
        },
      },
      error: "",
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:01:00.000Z",
    },
  ],
  previsRenders: [
    {
      renderId: "render-1",
      jobId: "previs-job-1",
      projectId: 7,
      scriptId: 12,
      storyboardId: 31,
      status: "completed",
      progress: 1,
      attempt: 1,
      errorReason: "",
      contract: {} as never,
      result: {
        schemaVersion: "1",
        previewVideoKey: "previs.mp4",
        previewVideoUrl: "https://example.test/previs.mp4",
        firstFrameKey: "first.jpg",
        firstFrameUrl: "https://example.test/first.jpg",
        lastFrameKey: "last.jpg",
        lastFrameUrl: "https://example.test/last.jpg",
        manifestKey: "manifest.json",
        manifestUrl: "https://example.test/manifest.json",
        width: 1920,
        height: 1080,
        fps: 24,
        frameCount: 120,
        durationSeconds: 5,
      },
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:01:00.000Z",
    },
  ],
};

const coverage = {
  schemaVersion: "1",
  coverageId: "coverage-12",
  projectId: 7,
  scriptId: 12,
  storyboardId: 31,
  status: "completed",
  version: 3,
  plan: {
    schemaVersion: "1",
    coverageId: "coverage-12",
    projectId: 7,
    scriptId: 12,
    storyboardId: 31,
    presetId: "dialogue",
    blocking: {
      schemaVersion: "1",
      sceneId: "scene-12",
      performanceTakeId: "take-12",
      durationSeconds: 5,
      fps: 24,
      axis: { fromActorId: "a", toActorId: "b", allowedSide: "left" },
      actorAnchors: [{ actorId: "a", anchorId: "anchor-a", position: [0, 0, 0], rotationEuler: [0, 0, 0] }],
      beats: [{ id: "beat-1", startFrame: 0, endFrame: 120, reactionActorIds: [], intensity: 0.5, action: "推门" }],
    },
    cameras: [{ cameraId: "master", role: "MASTER", shotSize: "wide", lensMm: 35, subjects: ["a"], foregroundSubjects: [], activeBeatIds: ["beat-1"], handlesFrames: 8, language: "zh-CN" }],
    editPolicy: { startWide: true, preferListenerOnReveal: true, reserveCloseUpUntilIntensity: 0.8, minimumShotFrames: 24 },
  },
  bundle: {
    schemaVersion: "1",
    coverageId: "coverage-12",
    sceneId: "scene-12",
    performanceTakeId: "take-12",
    durationSeconds: 5,
    fps: 24,
    frameCount: 120,
    cameras: [{
      cameraId: "master",
      role: "MASTER",
      startFrame: 0,
      endFrame: 120,
      beatIds: ["beat-1"],
      subjects: ["a"],
      status: "ready",
      videoId: 91,
      assets: { previewVideo: { key: "master.mp4", url: "https://example.test/master.mp4" } },
      quality: { status: "passed", score: 0.96, issues: [] },
    }],
  },
  recommendedCut: {
    schemaVersion: "1",
    coverageId: "coverage-12",
    performanceTakeId: "take-12",
    fps: 24,
    durationFrames: 120,
    clips: [{ id: "clip-1", cameraId: "master", startFrame: 0, endFrame: 120, sourceInFrame: 0, sourceOutFrame: 120, videoId: 91 }],
  },
  error: null,
} satisfies CinematicCoverageAggregate;

const generation: ProductionGenerationData = {
  storyboardList: [],
  trackList: [{
    id: 71,
    prompt: "雨夜推门",
    state: "completed",
    errorReason: "",
    duration: 5,
    medias: [],
    selectVideoId: 91,
    videoList: [{ id: 91, src: "https://example.test/final.mp4", state: "completed", errorReason: "", duration: 5 }],
  }],
};

describe("spatial production stage selector", () => {
  it("maps API snapshots to the fixed spatial production stages with real artifacts", () => {
    const stages = buildSpatialProductionStages({ flow, generation, coverages: [coverage] });

    expect(stages.map((stage) => stage.id)).toEqual(spatialProductionStageOrder);
    expect(stages.every((stage) => stage.state === "ready")).toBe(true);
    expect(stages.find((stage) => stage.id === "sceneMaster")?.artifacts).toContainEqual(
      expect.objectContaining({ url: "https://example.test/scene-master.jpg" }),
    );
    expect(stages.find((stage) => stage.id === "marbleWorld")?.artifacts).toContainEqual(
      expect.objectContaining({ url: "https://example.test/world.spz" }),
    );
    expect(stages.find((stage) => stage.id === "previs")?.artifacts).toContainEqual(
      expect.objectContaining({ url: "https://example.test/previs.mp4" }),
    );
    expect(stages.find((stage) => stage.id === "formalGeneration")?.artifacts).toContainEqual(
      expect.objectContaining({ url: "https://example.test/final.mp4" }),
    );
    expect(stages.find((stage) => stage.id === "multicamEdit")?.summary).toContain("1 个剪辑片段");
  });

  it("keeps upstream blockers and failures on the matching stage", () => {
    const stages = buildSpatialProductionStages({
      flow: {
        ...flow,
        assets: [{ ...flow.assets[0]!, src: "", state: "failed", errorReason: "场景图审核失败" }],
        worldAssets: [],
        previsRenders: [],
      },
      generation: { storyboardList: [], trackList: [] },
      coverages: [],
    });

    expect(stages.find((stage) => stage.id === "sceneMaster")).toEqual(
      expect.objectContaining({ state: "failed", blockingReason: "场景图审核失败" }),
    );
    expect(stages.find((stage) => stage.id === "marbleWorld")).toEqual(
      expect.objectContaining({ state: "blocked", blockingReason: expect.stringContaining("场景母版") }),
    );
    expect(stages.find((stage) => stage.id === "spatialRegistration")?.state).toBe("blocked");
    expect(stages.find((stage) => stage.id === "blocking")?.state).toBe("blocked");
    expect(stages.find((stage) => stage.id === "previsValidation")?.blockingReason).toContain("预演");
    expect(stages.find((stage) => stage.id === "multicamEdit")?.state).toBe("blocked");
  });

  it("uses previs quality and report as the validation source before coverage fallback", () => {
    const stages = buildSpatialProductionStages({
      flow: {
        ...flow,
        previsRenders: [{
          ...flow.previsRenders![0]!,
          quality: { status: "failed", score: 0.42, issues: [{ code: "AXIS_CROSS", severity: "error", message: "角色越过动作轴" }] },
          report: { key: "reports/render-1.json", url: "https://example.test/render-1-report.json", summary: "需要重做" },
        }],
      },
      generation,
      coverages: [],
    });

    expect(stages.find((stage) => stage.id === "previsValidation")).toEqual(
      expect.objectContaining({
        state: "failed",
        blockingReason: "角色越过动作轴",
        artifacts: expect.arrayContaining([expect.objectContaining({ url: "https://example.test/render-1-report.json" })]),
      }),
    );
  });
});
