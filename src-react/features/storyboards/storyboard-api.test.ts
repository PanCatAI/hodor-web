import { describe, expect, it, vi } from "vitest";

import { createStoryboardApi } from "./storyboard-api";

describe("storyboard API", () => {
  it("loads the production flow and exposes the storyboard contract", async () => {
    const request = vi.fn(async () => ({ storyboardTable: "# 镜头表", storyboard: [] }));
    const api = createStoryboardApi({ request });

    await api.load(7, 19);

    expect(request).toHaveBeenCalledWith("/production/getFlowData", {
      method: "POST",
      body: JSON.stringify({ projectId: 7, episodesId: 19 }),
    });
  });

  it("updates the prompt and video description through the existing endpoint", async () => {
    const request = vi.fn(async () => ({ message: "ok" }));
    const api = createStoryboardApi({ request });

    await api.update({ id: 23, prompt: "中景，雨夜", videoDesc: "缓慢推镜" });

    expect(request).toHaveBeenCalledWith("/production/storyboard/editStoryboardInfo", {
      method: "POST",
      body: JSON.stringify({ id: 23, prompt: "中景，雨夜", videoDesc: "缓慢推镜" }),
    });
  });

  it("generates and polls storyboard images through mounted endpoints", async () => {
    const request = vi.fn(async () => []);
    const api = createStoryboardApi({ request });

    await api.generateImages({ projectId: 7, scriptId: 19, storyboardIds: [23], concurrentCount: 3, compulsory: true });
    await api.pollImages([23]);

    expect(request).toHaveBeenNthCalledWith(1, "/production/storyboard/batchGenerateImage", {
      method: "POST",
      body: JSON.stringify({ projectId: 7, scriptId: 19, storyboardIds: [23], concurrentCount: 3, compulsory: true }),
    });
    expect(request).toHaveBeenNthCalledWith(2, "/production/storyboard/pollingImage", {
      method: "POST",
      body: JSON.stringify({ ids: [23] }),
    });
  });

  it("previews and downloads the generated image grid", async () => {
    const request = vi.fn(async () => "data:image/jpeg;base64,preview");
    const blob = new Blob(["png"], { type: "image/png" });
    const requestBlob = vi.fn(async () => blob);
    const api = createStoryboardApi({ request }, { requestBlob });

    await expect(api.previewGrid([23, 24])).resolves.toContain("data:image/jpeg");
    await expect(api.downloadGrid([23, 24])).resolves.toBe(blob);
    expect(request).toHaveBeenCalledWith("/production/storyboard/previewImage", {
      method: "POST",
      body: JSON.stringify({ storyboardIds: [23, 24] }),
    });
    expect(requestBlob).toHaveBeenCalledWith("/production/storyboard/downPreviewImage", {
      method: "POST",
      body: JSON.stringify({ storyboardIds: [23, 24] }),
    });
  });
});
