import { describe, expect, it } from "vitest";

import { createProductionDirectorProject } from "./production-director-project";
import type { ProductionFlowData } from "./types";

function flowData(): ProductionFlowData {
  return {
    source: { chapters: [], state: "completed" },
    script: "雨夜，Rachel 走进医院。",
    scriptPlan: "低机位推进",
    storyboardTable: "| S01 | 医院大厅 |",
    assets: [
      {
        id: 9,
        name: "Rachel",
        type: "role",
        prompt: "女侦探",
        desc: "主角",
        src: "https://example.test/rachel.jpg",
        state: "completed",
        errorReason: "",
        derive: [],
      },
      {
        id: 10,
        name: "医院大厅",
        type: "scene",
        prompt: "雨夜医院大厅",
        desc: "主场景",
        src: "https://example.test/lobby.jpg",
        state: "completed",
        errorReason: "",
        derive: [],
      },
    ],
    storyboard: [
      {
        id: 31,
        index: 0,
        prompt: "Rachel 进入医院大厅",
        videoDesc: "低机位缓慢推进",
        src: "https://example.test/shot-31.jpg",
        state: "completed",
        errorReason: "",
        associateAssetsIds: [9, 10],
      },
    ],
    videoTracks: [],
    timeline: { id: null, revision: 0, status: "idle", clips: [], errorReason: "", updatedAt: null },
    finalOutputs: [],
  };
}

describe("createProductionDirectorProject", () => {
  it("把当前分镜、关联角色和场景参考图转成有效的导演台工程", () => {
    const project = createProductionDirectorProject(flowData(), 31);

    expect(project).toMatchObject({
      version: 1,
      activeCameraId: "camera-storyboard-31",
      panoramaAssetId: "asset-scene-10",
      worldPrompt: "雨夜医院大厅\n低机位缓慢推进\nRachel 进入医院大厅",
    });
    expect(project.objects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "character-9", name: "Rachel", kind: "character" }),
        expect.objectContaining({ id: "camera-object-storyboard-31", kind: "camera" }),
      ]),
    );
    expect(project.assets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "asset-role-9", kind: "character", url: "https://example.test/rachel.jpg" }),
        expect.objectContaining({ id: "asset-scene-10", kind: "panorama", url: "https://example.test/lobby.jpg" }),
        expect.objectContaining({ id: "asset-storyboard-31", kind: "panorama", url: "https://example.test/shot-31.jpg" }),
      ]),
    );
    expect(project.cameras[0]).toMatchObject({
      id: "camera-storyboard-31",
      name: "S01 · 低机位缓慢推进",
    });
  });
});
