import { describe, expect, it } from "vitest";

import { createProductionDirectorProject } from "./production-director-project";
import { createProductionPrevisContract } from "./production-previs-contract";
import type { ProductionFlowData } from "./types";

function flowData(): ProductionFlowData {
  return {
    script: "雨夜，Rachel 走进医院。",
    scriptPlan: "低机位推进",
    storyboardTable: "| S01 | 医院大厅 |",
    assets: [
      { id: 9, name: "Rachel", type: "role", prompt: "女侦探", desc: "主角", src: "https://example.test/rachel.jpg", state: "completed", errorReason: "", derive: [] },
      { id: 10, name: "医院大厅", type: "scene", prompt: "雨夜医院大厅", desc: "主场景", src: "https://example.test/lobby.jpg", state: "completed", errorReason: "", derive: [] },
    ],
    storyboard: [
      { id: 31, index: 0, prompt: "Rachel 进入医院大厅", videoDesc: "低机位缓慢推进", src: "https://example.test/shot-31.jpg", state: "completed", errorReason: "", duration: 5, associateAssetsIds: [9, 10] },
    ],
    worldAssets: [
      {
        id: 81, projectId: 7, sourceSceneAssetId: 10, storyboardId: 31, provider: "worldlabs-marble", providerWorldId: "world-lobby", model: "marble-1.1", status: "succeeded", prompt: "雨夜医院大厅", displayName: "医院大厅", worldJobId: "job-81", panoramaUrl: "https://example.test/lobby-pano.jpg", colliderMeshUrl: "https://example.test/lobby.glb", spzUrls: { "500k": "https://example.test/lobby-500k.spz" }, thumbnailUrl: "https://example.test/lobby-thumb.jpg", caption: "医院大厅", semantics: { metricScaleFactor: 1.4, groundPlaneOffset: -0.25 }, error: "", createdAt: "2026-07-27T01:00:00.000Z", updatedAt: "2026-07-27T01:00:00.000Z",
      },
    ],
  };
}

describe("production Blender previs contract", () => {
  it("ports the existing director-desk scene assembly without a second canvas model", () => {
    const director = createProductionDirectorProject(flowData(), 31);
    expect(director).toMatchObject({
      activeCameraId: "camera-storyboard-31",
      panoramaAssetId: "asset-scene-10",
      sceneWorld: expect.objectContaining({ worldId: "world-lobby", colliderMeshUrl: "https://example.test/lobby.glb" }),
    });
    expect(director.objects).toEqual(expect.arrayContaining([expect.objectContaining({ id: "character-9", kind: "character" })]));
  });

  it("turns that same scene into the backend PrevisShotContract v1", () => {
    const contract = createProductionPrevisContract(flowData(), 7, 12, 31, "9:16");
    expect(contract).toMatchObject({
      schemaVersion: "1",
      projectId: 7,
      scriptId: 12,
      storyboardId: 31,
      output: { width: 720, height: 1280, fps: 24 },
      scene: { worldAssetId: 81, colliderMeshUrl: "https://example.test/lobby.glb" },
    });
    expect(contract.actors[0]?.keyframes).toHaveLength(2);
    expect(contract.camera.keyframes).toHaveLength(2);
  });
});
