import { describe, expect, it, vi } from "vitest";

import type { HodorApiClient } from "@react/lib/api/client";
import { createProductionApi, normalizeProductionStatus } from "./production-api";

function createClient() {
  return {
    request: vi.fn(),
  } as unknown as HodorApiClient;
}

describe("production API adapter", () => {
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
