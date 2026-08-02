import { describe, expect, it, vi } from "vitest";

import type { ProductionApi } from "./production-api";
import { canvasSpatialRetryStages, retrySpatialProductionStage } from "./spatial-production-retry";
import type { CinematicCoverageAggregate, ProductionFlowData } from "./types";

const emptyFlow: ProductionFlowData = {
  script: "",
  scriptPlan: "",
  assets: [],
  storyboardTable: "",
  storyboard: [],
};

function apiFor(overrides: Partial<ProductionApi> = {}): ProductionApi {
  return {
    getFlowData: vi.fn(async () => emptyFlow),
    getGenerationData: vi.fn(async () => ({ storyboardList: [], trackList: [] })),
    listCoverage: vi.fn(async () => []),
    ...overrides,
  } as unknown as ProductionApi;
}

describe("spatial production local retry", () => {
  it("routes every canvas spatial action into the same resumable pipeline", async () => {
    const startSpatialPipeline = vi.fn(async (_scriptId: number, _objective: string) => ({ accepted: true, currentStage: "sceneMaster" } as never));
    const api = apiFor({ startSpatialPipeline });

    for (const stage of canvasSpatialRetryStages) {
      await retrySpatialProductionStage({ api, projectId: 7, scriptId: 12, stage, flow: emptyFlow, coverages: [] });
    }

    expect(startSpatialPipeline).toHaveBeenCalledTimes(7);
    expect(startSpatialPipeline.mock.calls.every(([scriptId]) => scriptId === 12)).toBe(true);
    for (const label of ["场景母版", "Marble 世界", "空间注册", "场面调度", "镜头覆盖", "Blender 预演", "预演校验"]) {
      expect(startSpatialPipeline.mock.calls.some(([, objective]) => String(objective).includes(label))).toBe(true);
    }
  });

  it("starts the shared spatial pipeline from the scene-master node", async () => {
    const flow: ProductionFlowData = {
      ...emptyFlow,
      assets: [{
        id: 11, name: "房间母版", type: "scene", prompt: "", desc: "", src: "", state: "failed", errorReason: "审核失败",
        derive: [{ id: 12, assetsId: 11, name: "可用版本", type: "scene", prompt: "", desc: "", src: "", state: "completed", errorReason: "" }],
      }],
    };
    const startSpatialPipeline = vi.fn(async (_scriptId: number, _objective: string) => ({ accepted: true, currentStage: "sceneMaster" } as never));
    const generateDerivedAssets = vi.fn(async () => undefined);
    const api = apiFor({ startSpatialPipeline, generateDerivedAssets, getFlowData: vi.fn(async () => ({ ...flow, assets: [] })) });

    const result = await retrySpatialProductionStage({ api, projectId: 7, scriptId: 12, stage: "sceneMaster", flow, coverages: [] });

    expect(startSpatialPipeline).toHaveBeenCalledWith(12, expect.stringContaining("场景母版"));
    expect(generateDerivedAssets).not.toHaveBeenCalled();
    expect(api.getFlowData).toHaveBeenCalledWith(7, 12);
    expect(result.action).toBe("retried");
  });

  it("starts the same pipeline from coverage without directly retrying cameras", async () => {
    const coverage = {
      coverageId: "coverage-12",
      version: 2,
      status: "failed",
      plan: { cameras: [], blocking: { actorAnchors: [], beats: [] } },
      bundle: { cameras: [{ cameraId: "master", status: "ready" }, { cameraId: "close", status: "failed" }] },
      recommendedCut: null,
      error: { message: "机位失败" },
    } as unknown as CinematicCoverageAggregate;
    const retryCoverageCamera = vi.fn(async () => coverage);
    const startSpatialPipeline = vi.fn(async (_scriptId: number, _objective: string) => ({ accepted: true, currentStage: "coverage" } as never));
    const api = apiFor({ retryCoverageCamera, startSpatialPipeline, listCoverage: vi.fn(async () => [coverage]) });

    const result = await retrySpatialProductionStage({ api, projectId: 7, scriptId: 12, stage: "coverage", flow: emptyFlow, coverages: [coverage] });

    expect(startSpatialPipeline).toHaveBeenCalledWith(12, expect.stringContaining("镜头覆盖"));
    expect(retryCoverageCamera).not.toHaveBeenCalled();
    expect(result.coverages).toEqual([coverage]);
  });

  it("starts the pipeline from validation without directly retrying renders", async () => {
    const retryPrevis = vi.fn(async (_projectId, renderId) => ({ renderId } as never));
    const startSpatialPipeline = vi.fn(async (_scriptId: number, _objective: string) => ({ accepted: true, currentStage: "previsValidation" } as never));
    const flow = {
      ...emptyFlow,
      previsRenders: [{ renderId: "render-1", status: "completed", quality: { status: "failed", issues: [] } }],
    } as unknown as ProductionFlowData;
    const api = apiFor({ retryPrevis, startSpatialPipeline });

    await retrySpatialProductionStage({ api, projectId: 7, scriptId: 12, stage: "previsValidation", flow, coverages: [] });

    expect(startSpatialPipeline).toHaveBeenCalledWith(12, expect.stringContaining("预演校验"));
    expect(retryPrevis).not.toHaveBeenCalled();
  });

  it("starts Marble from the selected scene master and its bound storyboard", async () => {
    const flow = {
      ...emptyFlow,
      assets: [{
        id: 11, name: "医院大厅", type: "scene", prompt: "雨夜医院大厅", desc: "", src: "", state: "idle", errorReason: "",
        derive: [{ id: 21, assetsId: 11, name: "大厅母版", type: "scene", prompt: "", desc: "", src: "https://example.test/hall.jpg", state: "completed", errorReason: "" }],
      }],
      storyboard: [{ id: 31, index: 0, prompt: "推门进入大厅", videoDesc: "", src: "", state: "idle", errorReason: "", associateAssetsIds: [11] }],
    } satisfies ProductionFlowData;
    const startMarbleWorld = vi.fn(async () => ({ jobId: "job-81" } as never));
    const startSpatialPipeline = vi.fn(async (_scriptId: number, _objective: string) => ({ accepted: true, currentStage: "marbleWorld" } as never));
    const api = apiFor({ startMarbleWorld, startSpatialPipeline });

    const result = await retrySpatialProductionStage({ api, projectId: 7, scriptId: 12, stage: "marbleWorld", flow, coverages: [] });

    expect(startMarbleWorld).toHaveBeenCalledWith({
      projectId: 7,
      storyboardId: 31,
      sourceSceneAssetId: 11,
      requestId: "production-world:7:12:31:11:start",
      prompt: "雨夜医院大厅",
      displayName: "医院大厅",
      model: "marble-1.1",
      sourceIsPanorama: false,
    });
    expect(startSpatialPipeline).toHaveBeenCalledWith(12, expect.stringContaining("Marble 世界"));
    expect(result.action).toBe("retried");
  });

  it("refreshes only active Marble jobs for this script", async () => {
    const refreshMarbleWorld = vi.fn(async () => ({ jobId: "job-81" } as never));
    const flow = {
      ...emptyFlow,
      worldAssets: [{
        id: 81, projectId: 7, sourceSceneAssetId: 11, storyboardId: 31, provider: "worldlabs-marble", providerWorldId: "", model: "marble-1.1",
        status: "running", prompt: "雨夜医院大厅", displayName: "医院大厅", worldJobId: "job-81", panoramaUrl: "", colliderMeshUrl: "",
        spzUrls: {}, thumbnailUrl: "", caption: "", semantics: { metricScaleFactor: 1, groundPlaneOffset: 0, coordinateSystem: "opengl", registration: null },
        error: "", createdAt: "2026-08-03T00:00:00.000Z", updatedAt: "2026-08-03T00:01:00.000Z",
      }],
    } satisfies ProductionFlowData;
    const startSpatialPipeline = vi.fn(async (_scriptId: number, _objective: string) => ({ accepted: true, currentStage: "marbleWorld" } as never));
    const api = apiFor({ refreshMarbleWorld, startSpatialPipeline });

    const result = await retrySpatialProductionStage({ api, projectId: 7, scriptId: 12, stage: "marbleWorld", flow, coverages: [] });

    expect(refreshMarbleWorld).toHaveBeenCalledWith(7, 31, "job-81");
    expect(startSpatialPipeline).toHaveBeenCalledWith(12, expect.stringContaining("Marble 世界"));
    expect(result.action).toBe("retried");
  });

  it("never invents scene-image anchors or writes registration from the canvas", async () => {
    const flow = {
      ...emptyFlow,
      assets: [{ id: 11, name: "医院大厅", type: "scene", prompt: "雨夜医院大厅", desc: "", src: "https://example.test/hall.jpg", state: "completed", errorReason: "", derive: [] }],
      worldAssets: [{
        id: 81, projectId: 7, sourceSceneAssetId: 11, storyboardId: 31, provider: "worldlabs-marble", providerWorldId: "world-81", model: "marble-1.1",
        status: "succeeded", prompt: "雨夜医院大厅", displayName: "医院大厅", worldJobId: "job-81", panoramaUrl: "https://example.test/pano.jpg", colliderMeshUrl: "https://example.test/world.glb",
        spzUrls: {}, thumbnailUrl: "", caption: "", semantics: { metricScaleFactor: 1, groundPlaneOffset: 0, coordinateSystem: "opengl", registration: null },
        error: "", createdAt: "2026-08-03T00:00:00.000Z", updatedAt: "2026-08-03T00:01:00.000Z",
      }],
    } satisfies ProductionFlowData;
    const getWorldRegistration = vi.fn(async () => ({ worldAssetId: 81, providerWorldId: "world-81", status: "incomplete", registration: null, worldAsset: flow.worldAssets![0]! } as const));
    const generateWorldRegistration = vi.fn(async () => { throw new Error("不应调用"); });
    const saveWorldRegistration = vi.fn(async () => { throw new Error("不应调用"); });
    const startSpatialPipeline = vi.fn(async (_scriptId: number, _objective: string) => ({ accepted: true, currentStage: "spatialRegistration" } as never));
    const api = apiFor({ getWorldRegistration, generateWorldRegistration, saveWorldRegistration, startSpatialPipeline });

    const result = await retrySpatialProductionStage({ api, projectId: 7, scriptId: 12, stage: "spatialRegistration", flow, coverages: [] });

    expect(getWorldRegistration).toHaveBeenCalledWith(7, 12, 81);
    expect(startSpatialPipeline).toHaveBeenCalledWith(12, expect.stringContaining("空间注册"));
    expect(generateWorldRegistration).not.toHaveBeenCalled();
    expect(saveWorldRegistration).not.toHaveBeenCalled();
    expect(result.action).toBe("retried");
  });
});
