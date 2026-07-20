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
});
