import { describe, expect, it, vi } from "vitest";

import type { HodorApiClient } from "@react/lib/api/client";
import { createProductionApi } from "./production-api";

function createClient() {
  return { request: vi.fn() } as unknown as HodorApiClient;
}

describe("complete production API adapter", () => {
  it("persists the production contract and node layout through the mounted flow endpoint", async () => {
    const client = createClient();
    vi.mocked(client.request).mockResolvedValue(null);
    const api = createProductionApi(client);
    const data = {
      script: "第一幕",
      scriptPlan: "夜戏",
      assets: [],
      storyboardTable: "| 镜头 | 内容 |",
      storyboard: [],
      layout: { script: { x: 10, y: 20 } },
    };

    await api.saveFlowData(7, 12, data);

    expect(client.request).toHaveBeenCalledWith("/production/saveFlowData", {
      method: "POST",
      body: JSON.stringify({ projectId: 7, episodesId: 12, data }),
    });
  });

  it("uses the mounted derived-asset generation and polling endpoints", async () => {
    const client = createClient();
    vi.mocked(client.request)
      .mockResolvedValueOnce("开始生成资产图片")
      .mockResolvedValueOnce([{ id: 41, state: "生成失败", errorReason: "审核失败", prompt: "雨衣", src: null }]);
    const api = createProductionApi(client);

    await api.generateDerivedAssets(7, 12, [41]);
    await expect(api.pollDerivedAssets([41])).resolves.toEqual([
      expect.objectContaining({ id: 41, state: "failed", errorReason: "审核失败", prompt: "雨衣" }),
    ]);

    expect(client.request).toHaveBeenNthCalledWith(1, "/production/assets/batchGenerateAssetsImage", {
      method: "POST",
      body: JSON.stringify({ projectId: 7, scriptId: 12, assetIds: [41], concurrentCount: 5 }),
    });
    expect(client.request).toHaveBeenNthCalledWith(2, "/production/assets/pollingImage", {
      method: "POST",
      body: JSON.stringify({ ids: [41] }),
    });
  });

  it("maps all track and generated-result mutations to the existing workbench endpoints", async () => {
    const client = createClient();
    vi.mocked(client.request).mockResolvedValue(71);
    const api = createProductionApi(client);

    await expect(api.addTrack(7, 12, 6)).resolves.toBe(71);
    await api.updateTrackPrompt(71, "推进");
    await api.updateTrackDuration(71, 8);
    await api.selectVideo(71, 91);
    await api.deleteVideo(91);
    await api.deleteTrack(71);

    expect(client.request).toHaveBeenNthCalledWith(1, "/production/workbench/addTrack", expect.objectContaining({ body: JSON.stringify({ projectId: 7, scriptId: 12, duration: 6 }) }));
    expect(client.request).toHaveBeenNthCalledWith(2, "/production/workbench/updateVideoPrompt", expect.objectContaining({ body: JSON.stringify({ id: 71, prompt: "推进" }) }));
    expect(client.request).toHaveBeenNthCalledWith(3, "/production/workbench/updateVideoDuration", expect.objectContaining({ body: JSON.stringify({ id: 71, duration: 8 }) }));
    expect(client.request).toHaveBeenNthCalledWith(4, "/production/workbench/selectVideo", expect.objectContaining({ body: JSON.stringify({ trackId: 71, videoId: 91 }) }));
    expect(client.request).toHaveBeenNthCalledWith(5, "/production/workbench/delVideo", expect.objectContaining({ body: JSON.stringify({ id: 91 }) }));
    expect(client.request).toHaveBeenNthCalledWith(6, "/production/workbench/deleteTrack", expect.objectContaining({ body: JSON.stringify({ id: 71 }) }));
  });

  it("supports storyboard preview and the persisted image workflow contract", async () => {
    const client = createClient();
    vi.mocked(client.request)
      .mockResolvedValueOnce("data:image/jpeg;base64,preview")
      .mockResolvedValueOnce({ id: 5, nodes: [], edges: [] })
      .mockResolvedValueOnce({ url: "https://example.test/generated.jpg" })
      .mockResolvedValueOnce({ id: 6 });
    const api = createProductionApi(client);

    await expect(api.previewStoryboards([31, 32])).resolves.toContain("data:image/jpeg");
    await expect(api.getImageFlow(5)).resolves.toEqual({ id: 5, nodes: [], edges: [] });
    await expect(api.generateFlowImage({ model: "pancat:pancat-image", references: [], quality: "1K", ratio: "16:9", prompt: "远景", projectId: 7 })).resolves.toBe("https://example.test/generated.jpg");
    await expect(api.saveImageFlow({ nodes: [], edges: [] })).resolves.toBe(6);

    expect(client.request).toHaveBeenNthCalledWith(1, "/production/storyboard/previewImage", expect.objectContaining({ body: JSON.stringify({ storyboardIds: [31, 32] }) }));
    expect(client.request).toHaveBeenNthCalledWith(2, "/production/editImage/getImageFlow", expect.objectContaining({ body: JSON.stringify({ id: 5 }) }));
    expect(client.request).toHaveBeenNthCalledWith(3, "/production/editImage/generateFlowImage", expect.any(Object));
    expect(client.request).toHaveBeenNthCalledWith(4, "/production/editImage/saveImageFlow", expect.objectContaining({ body: JSON.stringify({ nodes: [], edges: [] }) }));
  });

  it("creates adjacent storyboards and writes adopted asset workflow images through mounted routes", async () => {
    const client = createClient();
    vi.mocked(client.request).mockResolvedValueOnce({ id: 77 }).mockResolvedValueOnce({ message: "ok" });
    const api = createProductionApi(client);
    const draft = { prompt: "", duration: 0, state: "未生成", videoDesc: "", shouldGenerateImage: 0, src: null };

    await expect(api.addStoryboard(7, 12, draft)).resolves.toBe(77);
    await api.updateAssetImage(41, "https://example.test/asset.jpg", 9);

    expect(client.request).toHaveBeenNthCalledWith(1, "/production/storyboard/addStoryboard", {
      method: "POST",
      body: JSON.stringify({ ...draft, projectId: 7, scriptId: 12 }),
    });
    expect(client.request).toHaveBeenNthCalledWith(2, "/production/assets/updateAssetsUrl", {
      method: "POST",
      body: JSON.stringify({ id: 41, url: "https://example.test/asset.jpg", flowId: 9 }),
    });
  });

  it("loads generated and uploaded edit material from the legacy mounted media route", async () => {
    const client = createClient();
    vi.mocked(client.request).mockResolvedValue({
      video: [{ videoId: 91, video: [{ id: 91, filePath: "https://example.test/story.mp4" }] }],
      data: [
        { id: 5, name: "雨声", filePath: "https://example.test/rain.mp3" },
        { id: 6, name: "海报", filePath: "https://example.test/poster.jpg", duration: 4 },
        { id: 7, name: "签名音频", filePath: "https://cdn.example.test/object?id=7&signature=x", fileType: "audio" },
        { id: 8, name: "OGG 音频", filePath: "https://example.test/sound.ogg", mimeType: "audio/ogg" },
        { id: 9, name: "类型不明 OGG", filePath: "https://example.test/ambiguous.ogg" },
      ],
    });
    const api = createProductionApi(client);

    await expect(api.getMediaLibrary(7, 12)).resolves.toEqual([
      expect.objectContaining({ id: "video-91", type: "video", selected: true, src: "https://example.test/story.mp4" }),
      expect.objectContaining({ id: "audio-5", type: "audio", name: "雨声" }),
      expect.objectContaining({ id: "image-6", type: "image", duration: 4 }),
      expect.objectContaining({ id: "audio-7", type: "audio", name: "签名音频" }),
      expect.objectContaining({ id: "audio-8", type: "audio", name: "OGG 音频" }),
    ]);
    expect(client.request).toHaveBeenCalledWith("/assets/getMaterialData", {
      method: "POST",
      body: JSON.stringify({ projectId: 7, scriptId: 12 }),
    });
  });

  it("accepts legacy numeric video ids and object task receipts without losing the id", async () => {
    const client = createClient();
    const api = createProductionApi(client);
    const input = {
      projectId: 7,
      scriptId: 12,
      track: { id: 51, prompt: "回头", state: "idle" as const, duration: 5, medias: [], videoList: [] },
      model: "pancat:pancat-video",
      mode: "text",
      resolution: "1080p",
      audio: false,
    };

    vi.mocked(client.request).mockResolvedValueOnce({ taskId: 88 });
    await expect(api.generateVideo(input)).resolves.toBe(88);
    vi.mocked(client.request).mockResolvedValueOnce({ id: 89 });
    await expect(api.generateVideo(input)).resolves.toBe(89);
    vi.mocked(client.request).mockResolvedValueOnce({});
    await expect(api.generateVideo(input)).rejects.toThrow("没有返回视频任务 ID");
  });

  it("generates a track prompt from the selected mounted media references", async () => {
    const client = createClient();
    vi.mocked(client.request).mockResolvedValue("镜头缓慢推进");
    const api = createProductionApi(client);

    await expect(
      api.generateVideoPrompt(7, {
        id: 51,
        prompt: "",
        state: "idle",
        duration: 5,
        medias: [
          { id: 31, sources: "storyboard", fileType: "image", src: "a", selected: true },
          { id: 41, sources: "assets", fileType: "image", src: "b", selected: false },
        ],
        videoList: [],
      }, "pancat:pancat-video", "singleImage"),
    ).resolves.toBe("镜头缓慢推进");

    expect(client.request).toHaveBeenCalledWith("/production/workbench/generateVideoPrompt", {
      method: "POST",
      body: JSON.stringify({ projectId: 7, trackId: 51, info: [{ id: 31, sources: "storyboard" }], model: "pancat:pancat-video", mode: "singleImage" }),
    });
  });
});
