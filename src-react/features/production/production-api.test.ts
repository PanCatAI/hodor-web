import { describe, expect, it, vi } from "vitest";

import type { HodorApiClient } from "@react/lib/api/client";
import { createProductionApi, normalizeProductionStatus, normalizeProductionVideoMode } from "./production-api";

function createClient() {
  return {
    request: vi.fn(),
  } as unknown as HodorApiClient;
}

describe("production API adapter", () => {
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
