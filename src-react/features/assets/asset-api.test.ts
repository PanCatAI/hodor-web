import { describe, expect, it, vi } from "vitest";

import type { HodorApiClient } from "@react/lib/api/client";
import { createAssetApi } from "./asset-api";

describe("asset API", () => {
  it("maps list filters to the Hodor asset contract", async () => {
    const request = vi.fn(async () => ({ data: [], total: "12" }));
    const api = createAssetApi({ request } as unknown as HodorApiClient);

    const result = await api.listAssets({
      projectId: 42,
      type: "scene",
      name: "医院",
      page: 2,
      limit: 20,
    });

    expect(request).toHaveBeenCalledWith("/assets/getAssetsApi", {
      method: "POST",
      body: JSON.stringify({ projectId: 42, type: "scene", name: "医院", page: 2, limit: 20 }),
    });
    expect(result).toEqual({ items: [], total: 12 });
  });

  it("creates a visual asset with the active project and type", async () => {
    const request = vi.fn(async () => ({ message: "新增资产成功" }));
    const api = createAssetApi({ request } as unknown as HodorApiClient);

    await api.createAsset({
      projectId: 42,
      type: "role",
      name: "黛利拉",
      describe: "十四岁少女",
      remark: "主角",
      prompt: "角色设定图",
    });

    expect(request).toHaveBeenCalledWith("/assets/addAssets", {
      method: "POST",
      body: JSON.stringify({
        projectId: 42,
        type: "role",
        name: "黛利拉",
        describe: "十四岁少女",
        remark: "主角",
        prompt: "角色设定图",
      }),
    });
  });

  it("uses the mounted edit, delete, history and upload contracts", async () => {
    const request = vi.fn(async (path: string) =>
      path === "/assets/getImage"
        ? { id: 7, imageId: 11, tempAssets: [{ id: 11, filePath: "https://cdn/image.jpg", selected: true }] }
        : undefined,
    );
    const api = createAssetApi({ request } as unknown as HodorApiClient);

    await api.updateAsset({ id: 7, name: "黛利拉", describe: "新描述", remark: "主角", prompt: "新提示词" });
    await api.deleteAsset(7);
    await api.batchDeleteAssets([7, 8]);
    const history = await api.getImageHistory(7);
    await api.selectImage({ id: 7, projectId: 42, type: "role", imageId: 11, prompt: "新提示词" });
    await api.deleteImage(11);
    await api.uploadClip({ projectId: 42, name: "片头", type: "clip", base64Data: "data:video/mp4;base64,AAAA" });
    await api.retryPrompt({ assetsId: 7, projectId: 42, type: "role", name: "黛利拉", describe: "新描述" });
    await api.retryImage({ projectId: 42, model: "pancat:pancat-image", resolution: "1K", id: 7, type: "role", name: "黛利拉", prompt: "新提示词" });

    expect(request).toHaveBeenCalledWith("/assets/updateAssets", expect.objectContaining({ body: JSON.stringify({ id: 7, name: "黛利拉", describe: "新描述", remark: "主角", prompt: "新提示词" }) }));
    expect(request).toHaveBeenCalledWith("/assets/delAssets", expect.objectContaining({ body: JSON.stringify({ id: 7 }) }));
    expect(request).toHaveBeenCalledWith("/assets/batchDelete", expect.objectContaining({ body: JSON.stringify({ id: [7, 8] }) }));
    expect(history.tempAssets[0].selected).toBe(true);
    expect(request).toHaveBeenCalledWith("/assets/saveAssets", expect.objectContaining({ body: JSON.stringify({ id: 7, projectId: 42, type: "role", imageId: 11, prompt: "新提示词" }) }));
    expect(request).toHaveBeenCalledWith("/assets/delImage", expect.objectContaining({ body: JSON.stringify({ id: 11 }) }));
    expect(request).toHaveBeenCalledWith("/assets/uploadClip", expect.objectContaining({ body: JSON.stringify({ projectId: 42, name: "片头", type: "clip", base64Data: "data:video/mp4;base64,AAAA" }) }));
    expect(request).toHaveBeenCalledWith("/assetsGenerate/polishAssetsPrompt", expect.anything());
    expect(request).toHaveBeenCalledWith("/assetsGenerate/generateAssets", expect.anything());
  });

  it("uses the mounted audio asset contracts", async () => {
    const request = vi.fn(async () => undefined);
    const api = createAssetApi({ request } as unknown as HodorApiClient);
    const input = {
      projectId: 42,
      name: "少女音色",
      describe: "女|清亮",
      assetsItem: [{ name: "样本", describe: "普通话", prompt: "平静", base64: "data:audio/mpeg;base64,AAAA" }],
    };
    await api.createAudioAsset(input);
    await api.updateAudioAsset({ id: 9, ...input, assetsItem: [{ id: 10, name: "样本", describe: "普通话", prompt: "平静", src: "https://cdn/audio.mp3" }] });
    expect(request).toHaveBeenCalledWith("/assets/addAudioAssets", expect.objectContaining({ body: JSON.stringify(input) }));
    expect(request).toHaveBeenCalledWith("/assets/updateAudioAssets", expect.anything());
  });
});
