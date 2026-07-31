import { describe, expect, it, vi } from "vitest";

import type { HodorApiClient } from "@react/lib/api/client";
import { createProductionApi, normalizeProductionStatus, normalizeProductionVideoMode } from "./production-api";

function createClient() {
  return {
    request: vi.fn(),
  } as unknown as HodorApiClient;
}

function validPrevisContract() {
  return {
    schemaVersion: "1", projectId: 7, scriptId: 12, storyboardId: 31, name: "S01 对话", durationSeconds: 5,
    output: { width: 1280, height: 720, fps: 24 },
    scene: { worldAssetId: 81, colliderMeshUrl: "https://example.test/world.glb", backgroundColor: "#000000" },
    actors: [{ id: "actor-a", name: "A", sourceAssetId: 9, scale: [1, 1, 1], keyframes: [{ frame: 1, position: [0, 0, 0], rotationEuler: [0, 0, 0], pose: "stand" }] }],
    props: [],
    camera: { lensMm: 35, keyframes: [{ frame: 1, position: [0, -5, 1.6], target: [0, 0, 1.4] }] },
  };
}

function validCoverageAggregate() {
  return {
    schemaVersion: "1",
    coverageId: "coverage-12",
    projectId: 7,
    scriptId: 12,
    storyboardId: 31,
    status: "rendering",
    version: 3,
    updatedAt: "2026-08-01T01:00:00.000Z",
    plan: {
      schemaVersion: "1", coverageId: "coverage-12", projectId: 7, scriptId: 12, storyboardId: 31,
      presetId: "dialogue/two-person",
      blocking: {
        schemaVersion: "1", sceneId: "scene-12", performanceTakeId: "take-12", durationSeconds: 5, fps: 24,
        axis: { fromActorId: "a", toActorId: "b", allowedSide: "left" },
        actorAnchors: [{ actorId: "a", anchorId: "a-seat", position: [0, 0, 0], rotationEuler: [0, 0, 0], lookAtActorId: "b" }],
        beats: [{ id: "beat-1", startFrame: 1, endFrame: 120, speakerId: "a", reactionActorIds: ["b"], intensity: 0.5, action: "对话" }],
      },
      cameras: [{ cameraId: "cam-master", role: "MASTER", shotSize: "wide", lensMm: 35, subjects: ["a", "b"], foregroundSubjects: [], activeBeatIds: ["beat-1"], handlesFrames: 8, language: "静态主镜头" }],
      editPolicy: { startWide: true, preferListenerOnReveal: true, reserveCloseUpUntilIntensity: 0.7, minimumShotFrames: 24 },
    },
    bundle: {
      schemaVersion: "1", coverageId: "coverage-12", sceneId: "scene-12", performanceTakeId: "take-12", durationSeconds: 5, fps: 24, frameCount: 120,
      cameras: [{
        cameraId: "cam-master", role: "MASTER", startFrame: 1, endFrame: 120, beatIds: ["beat-1"], subjects: ["a", "b"], status: "rendering", renderId: "render-master",
        assets: { controlFrames: [{ key: "frame-1", url: "https://example.test/frame-1.jpg", frame: 1 }] },
        quality: { status: "pending", issues: [] },
      }],
    },
    recommendedCut: null,
    error: null,
  };
}

describe("production API adapter", () => {
  it("keeps the existing Blender previs submit, status and local retry routes", async () => {
    const client = createClient();
    const render = {
      renderId: "render-1", jobId: "job-1", projectId: 7, scriptId: 12, storyboardId: 31,
      status: "rendering", progress: 35, attempt: 1, errorReason: "",
      contract: validPrevisContract(), result: null, createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z",
    };
    vi.mocked(client.request).mockResolvedValueOnce(render).mockResolvedValueOnce([render]).mockResolvedValueOnce(render).mockResolvedValueOnce(render);
    const api = createProductionApi(client);
    const contract = validPrevisContract() as never;

    await api.submitPrevis(contract);
    await api.listPrevisRenders(7, 12);
    await api.getPrevisStatus(7, "render-1");
    await api.retryPrevis(7, "render-1");

    expect(client.request).toHaveBeenNthCalledWith(1, "/production/workbench/previsRender", { method: "POST", body: JSON.stringify(contract) });
    expect(client.request).toHaveBeenNthCalledWith(2, "/production/workbench/previsList", { method: "POST", body: JSON.stringify({ projectId: 7, scriptId: 12 }) });
    expect(client.request).toHaveBeenNthCalledWith(3, "/production/workbench/previsStatus", { method: "POST", body: JSON.stringify({ projectId: 7, renderId: "render-1" }) });
    expect(client.request).toHaveBeenNthCalledWith(4, "/production/workbench/previsRetry", { method: "POST", body: JSON.stringify({ projectId: 7, renderId: "render-1" }) });
  });

  it("maps cinematic coverage domain responses and scoped commands", async () => {
    const client = createClient();
    const aggregate = {
      schemaVersion: "1",
      coverageId: "coverage-12",
      projectId: 7,
      scriptId: 12,
      storyboardId: 31,
      status: "rendering",
      version: 3,
      plan: {
        schemaVersion: "1",
        coverageId: "coverage-12",
        projectId: 7,
        scriptId: 12,
        storyboardId: 31,
        presetId: "dialogue/two-person",
        blocking: {
          schemaVersion: "1",
          sceneId: "scene-12",
          performanceTakeId: "take-12",
          durationSeconds: 5,
          fps: 24,
          axis: { fromActorId: "a", toActorId: "b", allowedSide: "left" },
          actorAnchors: [
            { actorId: "a", anchorId: "a-seat", position: [0, 0, 0], rotationEuler: [0, 0, 0], lookAtActorId: "b" },
            { actorId: "b", anchorId: "b-seat", position: [1, 0, 0], rotationEuler: [0, 0, 0], lookAtActorId: "a" },
          ],
          beats: [{ id: "beat-1", startFrame: 1, endFrame: 120, speakerId: "a", reactionActorIds: ["b"], intensity: 0.5, action: "对话" }],
        },
        cameras: [{ cameraId: "cam-master", role: "MASTER", shotSize: "wide", lensMm: 35, subjects: ["a", "b"], foregroundSubjects: [], activeBeatIds: ["beat-1"], handlesFrames: 8, language: "静态主镜头" }],
        editPolicy: { startWide: true, preferListenerOnReveal: true, reserveCloseUpUntilIntensity: 0.7, minimumShotFrames: 24 },
      },
      bundle: {
        schemaVersion: "1",
        coverageId: "coverage-12",
        sceneId: "scene-12",
        performanceTakeId: "take-12",
        durationSeconds: 5,
        fps: 24,
        frameCount: 120,
        cameras: [{ cameraId: "cam-master", role: "MASTER", startFrame: 1, endFrame: 120, beatIds: ["beat-1"], subjects: ["a", "b"], status: "rendering", renderId: "render-master", quality: { status: "pending", issues: [] } }],
      },
      recommendedCut: null,
      error: null,
    };
    vi.mocked(client.request)
      .mockResolvedValueOnce([aggregate])
      .mockResolvedValueOnce(aggregate)
      .mockResolvedValueOnce({ ...aggregate, status: "queued" })
      .mockResolvedValueOnce({ ...aggregate, status: "queued" })
      .mockResolvedValueOnce({ ...aggregate, recommendedCut: { schemaVersion: "1", coverageId: "coverage-12", performanceTakeId: "take-12", fps: 24, durationFrames: 120, clips: [] } })
      .mockResolvedValueOnce({ timelineId: 91, timelineRevision: 4 })
      .mockResolvedValueOnce({ fileName: "coverage-12.otio", mediaType: "application/vnd.opentimelineio+json", document: "{}" });
    const api = createProductionApi(client);

    await expect(api.listCoverage(7, 12)).resolves.toEqual([expect.objectContaining({ coverageId: "coverage-12", status: "running" })]);
    await api.getCoverageStatus(7, 12, "coverage-12");
    await api.retryCoverageCamera(7, 12, "coverage-12", "cam-master");
    await api.retryCoverageCamera(7, 12, "coverage-12");
    await api.getCoverageRecommendedCut(7, 12, "coverage-12");
    await api.applyCoverageRecommendedCut(7, 12, "coverage-12", 3);
    await api.exportCoverageOtio(7, 12, "coverage-12");

    expect(client.request).toHaveBeenNthCalledWith(1, "/production/workbench/coverageList", { method: "POST", body: JSON.stringify({ projectId: 7, scriptId: 12 }) });
    expect(client.request).toHaveBeenNthCalledWith(2, "/production/workbench/coverageStatus", { method: "POST", body: JSON.stringify({ projectId: 7, scriptId: 12, coverageId: "coverage-12" }) });
    expect(client.request).toHaveBeenNthCalledWith(3, "/production/workbench/coverageRetry", { method: "POST", body: JSON.stringify({ projectId: 7, scriptId: 12, coverageId: "coverage-12", cameraId: "cam-master" }) });
    expect(client.request).toHaveBeenNthCalledWith(4, "/production/workbench/coverageRetry", { method: "POST", body: JSON.stringify({ projectId: 7, scriptId: 12, coverageId: "coverage-12" }) });
    expect(client.request).toHaveBeenNthCalledWith(5, "/production/workbench/coverageRecommendedCut?projectId=7&scriptId=12&coverageId=coverage-12", { method: "GET" });
    expect(client.request).toHaveBeenNthCalledWith(6, "/production/workbench/coverageApplyCut", { method: "POST", body: JSON.stringify({ projectId: 7, scriptId: 12, coverageId: "coverage-12", expectedTimelineRevision: 3 }) });
    expect(client.request).toHaveBeenNthCalledWith(7, "/production/workbench/coverageExportOtio", { method: "POST", body: JSON.stringify({ projectId: 7, scriptId: 12, coverageId: "coverage-12" }) });
  });

  it("sorts coverage list responses before consumers select the latest version", async () => {
    const client = createClient();
    const older = { ...validCoverageAggregate(), coverageId: "coverage-old", version: 2, updatedAt: "2026-08-01T03:00:00.000Z" };
    const sameVersionEarlier = { ...validCoverageAggregate(), coverageId: "coverage-b", version: 4, updatedAt: "2026-08-01T01:00:00.000Z" };
    const latest = { ...validCoverageAggregate(), coverageId: "coverage-a", version: 4, updatedAt: "2026-08-01T02:00:00.000Z" };
    vi.mocked(client.request).mockResolvedValue([latest, older, sameVersionEarlier]);

    await expect(createProductionApi(client).listCoverage(7, 12)).resolves.toEqual([
      expect.objectContaining({ coverageId: "coverage-old" }),
      expect.objectContaining({ coverageId: "coverage-b" }),
      expect.objectContaining({ coverageId: "coverage-a" }),
    ]);
  });

  it("saves an edited recommended cut before applying it", async () => {
    const client = createClient();
    vi.mocked(client.request).mockResolvedValue({ data: { aggregate: {
      ...validCoverageAggregate(), status: "completed", version: 4,
      recommendedCut: { schemaVersion: "1", coverageId: "coverage-12", performanceTakeId: "take-12", fps: 24, durationFrames: 120, clips: [] },
    } } });
    const api = createProductionApi(client);
    const cut = { schemaVersion: "1", coverageId: "coverage-12", performanceTakeId: "take-12", fps: 24, durationFrames: 120, clips: [] } as never;

    await expect(api.saveCoverageRecommendedCut(7, 12, "coverage-12", 3, cut)).resolves.toEqual(
      expect.objectContaining({ coverageId: "coverage-12", version: 4 }),
    );

    expect(client.request).toHaveBeenCalledWith("/production/workbench/coverageRecommendedCut", {
      method: "PUT",
      body: JSON.stringify({ projectId: 7, scriptId: 12, coverageId: "coverage-12", expectedVersion: 3, recommendedCut: cut }),
    });
  });

  it("unwraps coverage response envelopes and rejects an empty success-shaped payload", async () => {
    const client = createClient();
    const aggregate = { ...validCoverageAggregate(), version: 2 };
    vi.mocked(client.request)
      .mockResolvedValueOnce({ data: { items: [aggregate] } })
      .mockResolvedValueOnce({ result: { coverage: aggregate } })
      .mockResolvedValueOnce({ data: {} });
    const api = createProductionApi(client);

    await expect(api.listCoverage(7, 12)).resolves.toEqual([expect.objectContaining({ coverageId: "coverage-12" })]);
    await expect(api.getCoverageStatus(7, 12, "coverage-12")).resolves.toEqual(expect.objectContaining({ coverageId: "coverage-12" }));
    await expect(api.getCoverageStatus(7, 12, "coverage-12")).rejects.toThrow("镜头覆盖响应缺少 coverageId");
  });

  it("rejects malformed nested coverage and previs contracts with an exact field path", async () => {
    const client = createClient();
    const badPlan = validCoverageAggregate();
    (badPlan.plan.blocking.axis as { allowedSide: unknown }).allowedSide = "center";
    const badBundle = validCoverageAggregate();
    (badBundle.bundle.cameras[0].assets.controlFrames[0] as { frame: unknown }).frame = "first";
    const badQuality = validCoverageAggregate();
    (badQuality.bundle.cameras[0].quality as { status: unknown }).status = "unknown";
    const badCut = {
      schemaVersion: "1", coverageId: "coverage-12", performanceTakeId: "take-12", fps: 24, durationFrames: 120,
      clips: [{ id: "clip-1", cameraId: "cam-master", startFrame: 1, endFrame: 24, sourceInFrame: 1, sourceOutFrame: 24, videoId: "91" }],
    };
    const badRender = {
      renderId: "render-1", jobId: "job-1", projectId: 7, scriptId: 12, storyboardId: 31,
      status: "completed", progress: 100, attempt: 1, errorReason: "", contract: validPrevisContract(),
      result: { schemaVersion: "1", previewVideoKey: "preview", previewVideoUrl: 12 },
      createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z",
    };
    vi.mocked(client.request)
      .mockResolvedValueOnce(badPlan)
      .mockResolvedValueOnce(badBundle)
      .mockResolvedValueOnce(badQuality)
      .mockResolvedValueOnce({ data: { recommendedCut: badCut } })
      .mockResolvedValueOnce(badRender);
    const api = createProductionApi(client);

    await expect(api.getCoverageStatus(7, 12, "coverage-12")).rejects.toThrow("coverage.plan.blocking.axis.allowedSide");
    await expect(api.getCoverageStatus(7, 12, "coverage-12")).rejects.toThrow("coverage.bundle.cameras[0].assets.controlFrames[0].frame");
    await expect(api.getCoverageStatus(7, 12, "coverage-12")).rejects.toThrow("coverage.bundle.cameras[0].quality.status");
    await expect(api.getCoverageRecommendedCut(7, 12, "coverage-12")).rejects.toThrow("coverage.recommendedCut.clips[0].videoId");
    await expect(api.getPrevisStatus(7, "render-1")).rejects.toThrow("previs.result.previewVideoUrl");
  });

  it("unwraps apply and OTIO envelopes without manufacturing empty command results", async () => {
    const client = createClient();
    vi.mocked(client.request)
      .mockResolvedValueOnce({ data: { timelineId: 91, timelineRevision: 4 } })
      .mockResolvedValueOnce({ result: { fileName: "coverage.otio", mediaType: "application/json", document: { OTIO_SCHEMA: "Timeline.1" } } })
      .mockResolvedValueOnce({ data: {} });
    const api = createProductionApi(client);

    await expect(api.applyCoverageRecommendedCut(7, 12, "coverage-12", 3)).resolves.toEqual({ timelineId: 91, timelineRevision: 4 });
    await expect(api.exportCoverageOtio(7, 12, "coverage-12")).resolves.toEqual({ fileName: "coverage.otio", mediaType: "application/json", document: { OTIO_SCHEMA: "Timeline.1" } });
    await expect(api.exportCoverageOtio(7, 12, "coverage-12")).rejects.toThrow("OTIO 导出响应缺少 document");
  });

  it("normalizes the real video model list and capability detail contracts", async () => {
    const client = createClient();
    vi.mocked(client.request)
      .mockResolvedValueOnce([
        { id: 4, name: "Pancat", label: "Pancat Video", value: "pancat-video", type: "video" },
        { id: 5, name: "Cinema", label: "", value: "cinema-video", type: "video" },
      ])
      .mockResolvedValueOnce({
        name: "Pancat",
        modelName: "pancat-video",
        type: "video",
        mode: ["singleImage", ["imageReference", "imageReference", "audioReference"], '["videoReference","textReference"]'],
        audio: "optional",
        durationResolutionMap: [
          { duration: [5, "8", 0], resolution: ["720p", "1080p"] },
          { duration: [10], resolution: ["4K"] },
        ],
      });
    const api = createProductionApi(client);

    await expect(api.listVideoModels?.()).resolves.toEqual([
      { id: "4:pancat-video", label: "Pancat Video", vendorName: "Pancat" },
      { id: "5:cinema-video", label: "cinema-video", vendorName: "Cinema" },
    ]);
    await expect(api.getVideoModelDetail?.("4:pancat-video")).resolves.toEqual({
      name: "Pancat",
      modelName: "pancat-video",
      type: "video",
      mode: ["singleImage", ["imageReference", "imageReference", "audioReference"], ["videoReference", "textReference"]],
      audio: "optional",
      durationResolutionMap: [
        { duration: [5, 8], resolution: ["720p", "1080p"] },
        { duration: [10], resolution: ["4K"] },
      ],
    });
    expect(client.request).toHaveBeenNthCalledWith(1, "/modelSelect/getModelList", {
      method: "POST",
      body: JSON.stringify({ type: "video" }),
    });
    expect(client.request).toHaveBeenNthCalledWith(2, "/modelSelect/getModelDetail", {
      method: "POST",
      body: JSON.stringify({ modelId: "4:pancat-video" }),
    });
  });

  it("normalizes scalar, array and JSON-encoded reference modes", () => {
    expect(normalizeProductionVideoMode("singleImage")).toBe("singleImage");
    expect(normalizeProductionVideoMode(["imageReference", "audioReference"])).toEqual(["imageReference", "audioReference"]);
    expect(normalizeProductionVideoMode('["videoReference","textReference"]')).toEqual(["videoReference", "textReference"]);
    expect(normalizeProductionVideoMode(["unknownReference"])).toBeNull();
  });

  it("maps the script list request to the existing Hodor contract", async () => {
    const client = createClient();
    vi.mocked(client.request).mockResolvedValue([{ id: 12, name: "第一幕", content: "雨夜", extractState: "已完成", errorReason: "" }]);
    const api = createProductionApi(client);

    await expect(api.listScripts(7)).resolves.toEqual([{ id: 12, name: "第一幕", content: "雨夜", state: "completed", errorReason: "" }]);
    expect(client.request).toHaveBeenCalledWith("/script/getScrptApi", {
      method: "POST",
      body: JSON.stringify({ projectId: 7, name: "" }),
    });
  });

  it("maps the storyboard generation payload and normalizes returned states", async () => {
    const client = createClient();
    vi.mocked(client.request).mockResolvedValue([{ id: 31, prompt: "远景", src: null, state: "生成中", videoDesc: "镜头推进" }]);
    const api = createProductionApi(client);

    await expect(api.generateStoryboards({ projectId: 7, scriptId: 12, storyboardIds: [31] })).resolves.toEqual([
      expect.objectContaining({ id: 31, state: "running" }),
    ]);
    expect(client.request).toHaveBeenCalledWith("/production/storyboard/batchGenerateImage", {
      method: "POST",
      body: JSON.stringify({ projectId: 7, scriptId: 12, storyboardIds: [31], concurrentCount: 5, compulsory: true }),
    });
  });

  it("preserves the workbench payload when loading and saving the flow contract", async () => {
    const client = createClient();
    vi.mocked(client.request).mockResolvedValueOnce({
      script: "雨夜",
      scriptPlan: "先远后近",
      assets: [],
      storyboardTable: "| 镜头 |",
      storyboard: [],
      workbench: { videoList: [{ id: 88 }], cover: "https://example.test/cover.jpg" },
      assetFactoryContract: { revision: 3, source: "story-mesh" },
    });
    const api = createProductionApi(client);

    const flow = await api.getFlowData(7, 12);
    expect(flow.workbench).toEqual({ videoList: [{ id: 88 }], cover: "https://example.test/cover.jpg" });
    expect(flow.assetFactoryContract).toEqual({ revision: 3, source: "story-mesh" });

    vi.mocked(client.request).mockResolvedValueOnce(undefined);
    await api.saveFlowData(7, 12, flow);
    expect(client.request).toHaveBeenLastCalledWith("/production/saveFlowData", {
      method: "POST",
      body: JSON.stringify({ projectId: 7, episodesId: 12, data: flow }),
    });
  });

  it("maps storyboard references into the existing video generation payload", async () => {
    const client = createClient();
    vi.mocked(client.request).mockResolvedValue(88);
    const api = createProductionApi(client);

    await expect(
      api.generateVideo({
        projectId: 7,
        scriptId: 12,
        track: {
          id: 51,
          prompt: "人物回头",
          state: "idle",
          duration: 5,
          medias: [
            { id: 31, sources: "storyboard", fileType: "image", src: "https://example.test/31.jpg" },
            { id: 9, sources: "assets", fileType: "image", src: "https://example.test/9.jpg" },
          ],
          videoList: [],
        },
        model: "pancat:pancat-video",
        mode: "startEndRequired",
        resolution: "1080p",
        audio: false,
      }),
    ).resolves.toBe(88);
    expect(client.request).toHaveBeenCalledWith("/production/workbench/generateVideo", {
      method: "POST",
      body: JSON.stringify({
        projectId: 7,
        scriptId: 12,
        uploadData: [
          { id: 31, sources: "storyboard" },
          { id: 9, sources: "assets" },
        ],
        prompt: "人物回头",
        model: "pancat:pancat-video",
        mode: "startEndRequired",
        resolution: "1080p",
        duration: 5,
        audio: false,
        trackId: 51,
      }),
    });
  });

  it("treats both backend success strings as completed and preserves failures", () => {
    expect(normalizeProductionStatus("生成成功")).toBe("completed");
    expect(normalizeProductionStatus("已完成")).toBe("completed");
    expect(normalizeProductionStatus("生成中")).toBe("running");
    expect(normalizeProductionStatus("生成失败")).toBe("failed");
    expect(normalizeProductionStatus("未生成")).toBe("idle");
    expect(normalizeProductionStatus(2)).toBe("running");
    expect(normalizeProductionStatus(0)).toBe("running");
    expect(normalizeProductionStatus(1)).toBe("completed");
    expect(normalizeProductionStatus(-1)).toBe("failed");
  });
});
