import { describe, expect, it, vi } from "vitest";

import { createAuthenticatedBlobRequest, createStoryApi } from "./story-api";

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

  it("starts and polls original-text event analysis", async () => {
    const request = vi.fn(async () => []);
    const api = createStoryApi({ request });

    await api.analyzeNovelEvents({ projectId: 7, novelIds: [11, 12], concurrentCount: 3 });
    await api.pollNovelEvents([11, 12]);

    expect(request).toHaveBeenNthCalledWith(1, "/novel/event/generateEvents", {
      method: "POST",
      body: JSON.stringify({ projectId: 7, novelIds: [11, 12], concurrentCount: 3 }),
    });
    expect(request).toHaveBeenNthCalledWith(2, "/novel/getNovelEventState", {
      method: "POST",
      body: JSON.stringify({ ids: [11, 12] }),
    });
  });

  it("uses the mounted batch import and extraction endpoints", async () => {
    const request = vi.fn(async () => []);
    const api = createStoryApi({ request });

    await api.importNovels(7, [{ index: 1, reel: "正文卷", chapter: "第一章", chapterData: "正文" }]);
    await api.importScripts(7, [{ scriptName: "第一集", scriptData: "场景一" }]);
    await api.extractScriptAssets({ projectId: 7, scriptIds: [19], groupSize: 4 });
    await api.pollScriptAssets([19]);

    expect(request).toHaveBeenNthCalledWith(1, "/novel/addNovel", {
      method: "POST",
      body: JSON.stringify({ projectId: 7, data: [{ index: 1, reel: "正文卷", chapter: "第一章", chapterData: "正文" }] }),
    });
    expect(request).toHaveBeenNthCalledWith(2, "/script/batchAddScript", {
      method: "POST",
      body: JSON.stringify({ projectId: 7, data: [{ scriptName: "第一集", scriptData: "场景一" }] }),
    });
    expect(request).toHaveBeenNthCalledWith(3, "/script/extractAssets", {
      method: "POST",
      body: JSON.stringify({ projectId: 7, scriptIds: [19], groupSize: 4 }),
    });
    expect(request).toHaveBeenNthCalledWith(4, "/script/pollScriptAssets", {
      method: "POST",
      body: JSON.stringify({ ids: [19] }),
    });
  });

  it("loads selectable assets across the three script asset types", async () => {
    const request = vi.fn(async (_path: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      return { data: [{ id: body.type === "role" ? 1 : body.type === "scene" ? 2 : 3, name: body.type }], total: 1 };
    });
    const api = createStoryApi({ request });

    await expect(api.listSelectableAssets(7)).resolves.toEqual([
      { id: 1, name: "role", type: "role" },
      { id: 2, name: "scene", type: "scene" },
      { id: 3, name: "tool", type: "tool" },
    ]);
    expect(request).toHaveBeenCalledTimes(3);
  });

  it("returns the script export blob from the injected binary transport", async () => {
    const blob = new Blob(["zip"], { type: "application/zip" });
    const requestBlob = vi.fn(async () => blob);
    const api = createStoryApi({ request: vi.fn() }, { requestBlob });

    await expect(api.exportScripts([19, 20])).resolves.toBe(blob);
    expect(requestBlob).toHaveBeenCalledWith("/script/exportScript", {
      method: "POST",
      body: JSON.stringify({ id: [19, 20] }),
    });
  });

  it("uses the resolved Hodor API address for binary requests", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("zip", { status: 200 }));
    const request = createAuthenticatedBlobRequest("https://hodor.pancat.ai/api/");

    await request("/script/exportScript", { method: "POST" });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://hodor.pancat.ai/api/script/exportScript",
      expect.objectContaining({ method: "POST" }),
    );
    fetchMock.mockRestore();
  });
});
