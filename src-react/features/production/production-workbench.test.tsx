import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ProductionApi } from "./production-api";
import { ProductionWorkbench } from "./production-workbench";
import type { ProductionFlowData, ProductionGenerationData, ScriptSummary, StoryboardItem } from "./types";

function createApi(): ProductionApi {
  const scripts: ScriptSummary[] = [{ id: 12, name: "第一幕", content: "", state: "completed", errorReason: "" }];
  const flow: ProductionFlowData = {
    storyboard: [
      { id: 31, index: 0, prompt: "雨夜远景", videoDesc: "镜头缓慢推进", src: "", state: "failed", errorReason: "图片审核失败" },
      { id: 32, index: 1, prompt: "角色回头", videoDesc: "近景", src: "https://example.test/32.jpg", state: "completed", errorReason: "" },
    ],
  };
  const generation: ProductionGenerationData = {
    storyboardList: [],
    trackList: [
      {
        id: 51,
        prompt: "人物回头",
        state: "idle",
        duration: 5,
        medias: [{ id: 32, sources: "storyboard", fileType: "image", src: "https://example.test/32.jpg" }],
        videoList: [{ id: 88, src: "", state: "failed", errorReason: "输入图片可能包含真人" }],
      },
    ],
  };
  const generatedStoryboards: StoryboardItem[] = [
    { id: 31, index: 0, state: "running", prompt: "雨夜远景", src: "", videoDesc: "镜头缓慢推进", errorReason: "" },
  ];
  return {
    listScripts: vi.fn(async () => scripts),
    getFlowData: vi.fn(async () => flow),
    getGenerationData: vi.fn(async () => generation),
    generateStoryboards: vi.fn(async () => generatedStoryboards),
    pollStoryboards: vi.fn(async () => []),
    generateVideo: vi.fn(async () => 89),
    pollVideos: vi.fn(async () => []),
  };
}

describe("ProductionWorkbench", () => {
  it("shows storyboard and video failures from the production contract", async () => {
    render(<ProductionWorkbench api={createApi()} project={{ id: 7, name: "雨夜", videoModel: "pancat:pancat-video", videoMode: "singleImage" }} />);

    expect(await screen.findByText("雨夜远景")).toBeInTheDocument();
    expect(screen.getByText("图片审核失败")).toBeInTheDocument();
    expect(screen.getByText("输入图片可能包含真人")).toBeInTheDocument();
  });

  it("starts image generation for a storyboard", async () => {
    const api = createApi();
    render(<ProductionWorkbench api={api} project={{ id: 7, name: "雨夜", videoModel: "pancat:pancat-video", videoMode: "singleImage" }} />);

    const card = await screen.findByTestId("storyboard-31");
    fireEvent.click(within(card).getByRole("button", { name: "重新生成分镜图" }));

    await waitFor(() => expect(api.generateStoryboards).toHaveBeenCalledWith({ projectId: 7, scriptId: 12, storyboardIds: [31] }));
    expect(within(card).getByText("生成中")).toBeInTheDocument();
  });

  it("starts video generation with the selected track", async () => {
    const api = createApi();
    render(<ProductionWorkbench api={api} project={{ id: 7, name: "雨夜", videoModel: "pancat:pancat-video", videoMode: "singleImage" }} />);

    const track = await screen.findByTestId("video-track-51");
    fireEvent.click(within(track).getByRole("button", { name: "生成视频" }));

    await waitFor(() => expect(api.generateVideo).toHaveBeenCalledOnce());
    expect(within(track).getAllByText("生成中").length).toBeGreaterThan(0);
  });
});
