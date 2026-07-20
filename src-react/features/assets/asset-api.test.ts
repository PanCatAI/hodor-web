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
});
