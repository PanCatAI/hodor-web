import { describe, expect, it, vi } from "vitest";

import { createStoryApi } from "./story-api";

describe("story API", () => {
  it("loads original text with the existing pagination contract", async () => {
    const request = vi.fn(async () => ({ data: [], total: 0 }));
    const api = createStoryApi({ request });

    await api.listNovels({ projectId: 7, page: 2, limit: 20, search: "雨夜" });

    expect(request).toHaveBeenCalledWith("/novel/getNovel", {
      method: "POST",
      body: JSON.stringify({ projectId: 7, page: 2, limit: 20, search: "雨夜" }),
    });
  });

  it("maps create and update operations to the existing original-text endpoints", async () => {
    const request = vi.fn(async () => ({ message: "ok" }));
    const api = createStoryApi({ request });

    await api.createNovel({ projectId: 7, index: 1, reel: "第一卷", chapter: "第一章", chapterData: "正文" });
    await api.updateNovel({ id: 11, index: 1, reel: "第一卷", chapter: "第一章", chapterData: "新正文", event: "冲突" });

    expect(request).toHaveBeenNthCalledWith(1, "/novel/addNovel", {
      method: "POST",
      body: JSON.stringify({
        projectId: 7,
        data: [{ index: 1, reel: "第一卷", chapter: "第一章", chapterData: "正文" }],
      }),
    });
    expect(request).toHaveBeenNthCalledWith(2, "/novel/updateNovel", {
      method: "POST",
      body: JSON.stringify({ id: 11, index: 1, reel: "第一卷", chapter: "第一章", chapterData: "新正文", event: "冲突" }),
    });
  });

  it("loads and updates scripts without changing the backend contract", async () => {
    const request = vi.fn(async () => []);
    const api = createStoryApi({ request });

    await api.listScripts(7, "第一集");
    await api.updateScript({ id: 19, name: "第一集", content: "场景一", assets: [2, 3] });

    expect(request).toHaveBeenNthCalledWith(1, "/script/getScrptApi", {
      method: "POST",
      body: JSON.stringify({ projectId: 7, name: "第一集" }),
    });
    expect(request).toHaveBeenNthCalledWith(2, "/script/updateScript", {
      method: "POST",
      body: JSON.stringify({ id: 19, name: "第一集", content: "场景一", assets: [2, 3] }),
    });
  });
});
