import { describe, expect, it, vi } from "vitest";

import { createCastingApi } from "./casting-api";

describe("casting API contract", () => {
  it("maps the casting asset list and all batch operations to the existing backend routes", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce([{ id: 7, type: "role", name: "黛利拉" }])
      .mockResolvedValue(undefined);
    const api = createCastingApi({ request });

    await expect(api.listAssets({ projectId: 42, types: ["role", "scene"] })).resolves.toEqual([
      expect.objectContaining({ id: 7, type: "role", name: "黛利拉" }),
    ]);
    await api.batchPolish({
      projectId: 42,
      items: [{ assetsId: 7, type: "role", name: "黛利拉", describe: "十四岁少女" }],
      concurrentCount: 3,
      otherTextPrompt: "统一成电影概念图",
    });
    await api.batchGenerateImages({
      projectId: 42,
      model: "pancat:pancat-image",
      resolution: "1K",
      concurrentCount: 3,
      items: [{ id: 7, type: "role", name: "黛利拉", prompt: "角色三视图" }],
    });
    await api.bindAudio({ projectId: 42, assetsIds: [7], concurrentCount: 3 });

    expect(request).toHaveBeenNthCalledWith(1, "/cornerScape/getAllAssets", {
      method: "POST",
      body: JSON.stringify({ projectId: 42, type: ["role", "scene"] }),
    });
    expect(request).toHaveBeenNthCalledWith(2, "/assetsGenerate/batchPolishAssetsPrompt", {
      method: "POST",
      body: JSON.stringify({
        projectId: 42,
        items: [{ assetsId: 7, type: "role", name: "黛利拉", describe: "十四岁少女" }],
        concurrentCount: 3,
        otherTextPrompt: "统一成电影概念图",
      }),
    });
    expect(request).toHaveBeenNthCalledWith(3, "/assetsGenerate/batchGenerateImageAssets", {
      method: "POST",
      body: JSON.stringify({
        projectId: 42,
        model: "pancat:pancat-image",
        resolution: "1K",
        concurrentCount: 3,
        items: [{ id: 7, type: "role", name: "黛利拉", prompt: "角色三视图" }],
      }),
    });
    expect(request).toHaveBeenNthCalledWith(4, "/cornerScape/batchBindAudio", {
      method: "POST",
      body: JSON.stringify({ projectId: 42, assetsIds: [7], concurrentCount: 3 }),
    });
  });

  it("polls prompt, image and audio state with the backend field names", async () => {
    const request = vi.fn(async () => []);
    const api = createCastingApi({ request });

    await api.pollPrompts([1, 2]);
    await api.pollImages([3]);
    await api.pollAudio([4]);

    expect(request).toHaveBeenNthCalledWith(1, "/assets/pollingPromptAssets", {
      method: "POST",
      body: JSON.stringify({ ids: [1, 2] }),
    });
    expect(request).toHaveBeenNthCalledWith(2, "/assets/pollingImageAssets", {
      method: "POST",
      body: JSON.stringify({ ids: [3] }),
    });
    expect(request).toHaveBeenNthCalledWith(3, "/cornerScape/pollingAudio", {
      method: "POST",
      body: JSON.stringify({ ids: [4] }),
    });
  });

  it("refreshes an asset before cancellation and sends the current image task id", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce([{ id: 7, imageId: 99, type: "role", name: "黛利拉" }])
      .mockResolvedValueOnce(undefined);
    const api = createCastingApi({ request });

    await api.cancelAsset({ projectId: 42, assetId: 7, types: ["role"] });

    expect(request).toHaveBeenNthCalledWith(1, "/cornerScape/getAllAssets", {
      method: "POST",
      body: JSON.stringify({ projectId: 42, type: ["role"] }),
    });
    expect(request).toHaveBeenNthCalledWith(2, "/assetsGenerate/cancelGenerate", {
      method: "POST",
      body: JSON.stringify({ id: 99 }),
    });
  });

  it("reports a clear cancellation error when the asset has no active image task", async () => {
    const api = createCastingApi({ request: vi.fn(async () => [{ id: 7, imageId: 0 }]) });

    await expect(api.cancelAsset({ projectId: 42, assetId: 7, types: [] })).rejects.toThrow("没有可取消的图片任务");
  });

  it("selects and deletes history images, updates one role audio, and retries failures", async () => {
    const request = vi.fn(async () => undefined);
    const api = createCastingApi({ request });
    await api.selectHistoryImage({ id: 7, projectId: 42, type: "role", imageId: 99, prompt: "角色图" });
    await api.deleteHistoryImage(98);
    await api.updateAssetAudio({ assetsId: 7, audioIds: [5] });
    await api.retryPrompt({ assetsId: 7, projectId: 42, type: "role", name: "黛利拉", describe: "少女" });
    await api.retryImage({ projectId: 42, model: "pancat:pancat-image", resolution: "1K", id: 7, type: "role", name: "黛利拉", prompt: "角色图" });
    expect(request).toHaveBeenCalledWith("/assets/saveAssets", expect.objectContaining({ body: JSON.stringify({ id: 7, projectId: 42, type: "role", imageId: 99, prompt: "角色图" }) }));
    expect(request).toHaveBeenCalledWith("/assets/delImage", expect.objectContaining({ body: JSON.stringify({ id: 98 }) }));
    expect(request).toHaveBeenCalledWith("/cornerScape/updateAssetsAudio", expect.objectContaining({ body: JSON.stringify({ assetsId: 7, audioIds: [5] }) }));
    expect(request).toHaveBeenCalledWith("/assetsGenerate/polishAssetsPrompt", expect.anything());
    expect(request).toHaveBeenCalledWith("/assetsGenerate/generateAssets", expect.anything());
  });

  it("lists available parent audio assets for one-role binding", async () => {
    const request = vi.fn(async () => ({ data: [{ id: 5, name: "少女音色" }], total: 1 }));
    const api = createCastingApi({ request });
    await expect(api.listAudioAssets(42)).resolves.toEqual([{ id: 5, name: "少女音色" }]);
    expect(request).toHaveBeenCalledWith("/assets/getAssetsApi", { method: "POST", body: JSON.stringify({ projectId: 42, type: "audio", page: 1, limit: 1000 }) });
  });
});
