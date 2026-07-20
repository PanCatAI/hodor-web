import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ProductionApi } from "./production-api";
import { ProductionWorkbench } from "./production-workbench";
import type { ProductionFlowData, ProductionGenerationData, ProductionVideoModelDetail, ScriptSummary, StoryboardItem } from "./types";

function createApi(scriptItems?: ScriptSummary[]): ProductionApi {
  const scripts: ScriptSummary[] = scriptItems ?? [{ id: 12, name: "第一幕", content: "", state: "completed", errorReason: "" }];
  const flow: ProductionFlowData = {
    script: "雨夜",
    scriptPlan: "",
    assets: [
      {
        id: 9,
        name: "黛利拉",
        type: "role",
        prompt: "雨夜中的少女",
        desc: "主角",
        src: "https://example.test/role.jpg",
        state: "completed",
        errorReason: "",
        derive: [],
      },
    ],
    storyboardTable: "",
    storyboard: [
      { id: 31, index: 0, prompt: "雨夜远景", videoDesc: "镜头缓慢推进", src: "", state: "failed", errorReason: "图片审核失败" },
      {
        id: 32,
        index: 1,
        prompt: "角色回头",
        videoDesc: "近景",
        src: "https://example.test/32.jpg",
        state: "completed",
        errorReason: "",
        duration: 4,
        associateAssetsIds: [9],
      },
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
    listVideoModels: vi.fn(async () => [
      { id: "pancat:pancat-video", label: "Pancat Video", vendorName: "Pancat" },
      { id: "pancat:cinema-video", label: "Cinema Video", vendorName: "Pancat" },
    ]),
    getVideoModelDetail: vi.fn(
      async (modelId: string): Promise<ProductionVideoModelDetail> =>
        modelId === "pancat:cinema-video"
          ? {
              name: "Pancat",
              modelName: "cinema-video",
              type: "video" as const,
              mode: [["imageReference", "audioReference"]],
              audio: false as const,
              durationResolutionMap: [{ duration: [8], resolution: ["720p"] }],
            }
          : {
              name: "Pancat",
              modelName: "pancat-video",
              type: "video" as const,
              mode: ["singleImage", "startEndRequired", ["imageReference", "imageReference", "audioReference"]],
              audio: "optional" as const,
              durationResolutionMap: [
                { duration: [5, 8], resolution: ["1080p"] },
                { duration: [8], resolution: ["720p"] },
              ],
            },
    ),
    listScripts: vi.fn(async () => scripts),
    getFlowData: vi.fn(async () => flow),
    getGenerationData: vi.fn(async () => generation),
    getMediaLibrary: vi.fn(async () => [
      { id: "audio-4", sourceId: 4, type: "audio" as const, name: "雨声音效", src: "https://example.test/rain.mp3", duration: 0 },
    ]),
    generateStoryboards: vi.fn(async () => generatedStoryboards),
    pollStoryboards: vi.fn(async () => []),
    generateVideo: vi.fn(async () => 89),
    pollVideos: vi.fn(async () => []),
    saveFlowData: vi.fn(async () => undefined),
    generateDerivedAssets: vi.fn(async () => undefined),
    pollDerivedAssets: vi.fn(async () => []),
    deleteDerivedAsset: vi.fn(async () => undefined),
    addTrack: vi.fn(async () => 52),
    deleteTrack: vi.fn(async () => undefined),
    updateTrackPrompt: vi.fn(async () => undefined),
    updateTrackDuration: vi.fn(async () => undefined),
    generateVideoPrompt: vi.fn(async () => "AI 生成的推进提示词"),
    selectVideo: vi.fn(async () => undefined),
    deleteVideo: vi.fn(async () => undefined),
    previewStoryboards: vi.fn(async () => "data:image/jpeg;base64,preview"),
    editStoryboard: vi.fn(async () => undefined),
    deleteStoryboards: vi.fn(async () => undefined),
    getImageFlow: vi.fn(async () => null),
    saveImageFlow: vi.fn(async () => 1),
    updateImageFlow: vi.fn(async () => undefined),
    uploadFlowImage: vi.fn(async () => "https://example.test/upload.jpg"),
    generateFlowImage: vi.fn(async () => "https://example.test/generated.jpg"),
    updateStoryboardImage: vi.fn(async () => undefined),
    addStoryboard: vi.fn(async () => 77),
    updateAssetImage: vi.fn(async () => undefined),
  };
}

describe("ProductionWorkbench", () => {
  beforeEach(() => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  });

  it("restores the complete upstream quick preview controls and asset information", async () => {
    const api = createApi();
    render(<ProductionWorkbench api={api} project={{ id: 7, name: "雨夜", videoModel: "pancat:pancat-video", videoMode: "singleImage" }} />);

    await screen.findByLabelText("轨道提示词 51");
    fireEvent.click(screen.getByRole("button", { name: "快速预览" }));

    expect(screen.getByRole("button", { name: "上一条" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "播放" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "下一条" })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "预览进度" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "全选分镜" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "恢复顺序" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "导出图片" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "下一条" }));
    expect(screen.getByText("【序号 2】近景")).toBeInTheDocument();
    expect(screen.getByText("4 秒")).toBeInTheDocument();
    expect(screen.getByText("黛利拉（角色）")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: "选择分镜 32" }));
    fireEvent.click(screen.getByRole("button", { name: "导出图片" }));
    await waitFor(() => expect(api.previewStoryboards).toHaveBeenCalledWith([32]));
  });

  it("supports thumbnail drag sorting, select all and restoring the source order", async () => {
    render(<ProductionWorkbench api={createApi()} project={{ id: 7, name: "雨夜", videoModel: "pancat:pancat-video", videoMode: "singleImage" }} />);
    await screen.findByLabelText("轨道提示词 51");
    fireEvent.click(screen.getByRole("button", { name: "快速预览" }));

    const first = screen.getByTestId("preview-shot-31");
    const second = screen.getByTestId("preview-shot-32");
    fireEvent.dragStart(second, { dataTransfer: { effectAllowed: "move" } });
    fireEvent.dragOver(first);
    fireEvent.drop(first);
    expect([...document.querySelectorAll("[data-testid^='preview-shot-']")].map((node) => node.getAttribute("data-testid"))).toEqual([
      "preview-shot-32",
      "preview-shot-31",
    ]);

    fireEvent.click(screen.getByRole("checkbox", { name: "全选分镜" }));
    expect(screen.getByRole("checkbox", { name: "选择分镜 31" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "选择分镜 32" })).toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: "恢复顺序" }));
    expect([...document.querySelectorAll("[data-testid^='preview-shot-']")].map((node) => node.getAttribute("data-testid"))).toEqual([
      "preview-shot-31",
      "preview-shot-32",
    ]);
  });

  it("ports the reference, model, mode, resolution, duration, audio and referenced prompt workflow", async () => {
    const api = createApi();
    render(
      <ProductionWorkbench
        api={api}
        project={{ id: 7, name: "雨夜", videoModel: "pancat:pancat-video", videoMode: "singleImage", videoResolution: "1080p" }}
      />,
    );

    const prompt = await screen.findByLabelText("轨道提示词 51");
    expect(screen.getByLabelText("视频模型")).toHaveValue("pancat:pancat-video");
    expect(screen.getByLabelText("视频模式")).toHaveValue("singleImage");
    expect(screen.getByLabelText("视频分辨率")).toHaveValue("1080p");
    expect(screen.getByLabelText("轨道时长 51")).toHaveValue("5");
    expect(screen.getByLabelText("提示词引用")).toHaveTextContent("分镜 #32");

    fireEvent.change(prompt, { target: { value: "手动推进" } });
    fireEvent.blur(prompt);
    await waitFor(() => expect(api.updateTrackPrompt).toHaveBeenCalledWith(51, "手动推进"));

    fireEvent.click(screen.getByRole("button", { name: "切换音频" }));
    fireEvent.click(screen.getByRole("button", { name: "生成轨道提示词" }));
    await waitFor(() =>
      expect(api.generateVideoPrompt).toHaveBeenCalledWith(7, expect.objectContaining({ id: 51 }), "pancat:pancat-video", "singleImage"),
    );
    expect(screen.getByDisplayValue("AI 生成的推进提示词")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "生成视频" }));
    await waitFor(() =>
      expect(api.generateVideo).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: 7, scriptId: 12, model: "pancat:pancat-video", mode: "singleImage", resolution: "1080p", audio: true }),
      ),
    );
  });

  it("drives all generation options from the selected model detail", async () => {
    const api = createApi();
    render(
      <ProductionWorkbench
        api={api}
        project={{ id: 7, name: "雨夜", videoModel: "pancat:pancat-video", videoMode: "singleImage", videoResolution: "1080p" }}
      />,
    );

    const model = await screen.findByLabelText("视频模型");
    await waitFor(() => expect(api.getVideoModelDetail).toHaveBeenCalledWith("pancat:pancat-video"));
    expect(within(screen.getByLabelText("视频模式")).getByRole("option", { name: "图片 ×2 + 音频参考" })).toBeInTheDocument();
    expect(
      within(screen.getByLabelText("轨道时长 51"))
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["5", "8"]);
    expect(
      within(screen.getByLabelText("视频分辨率"))
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["1080p"]);
    expect(screen.getByRole("button", { name: "切换音频" })).not.toBeDisabled();

    fireEvent.change(model, { target: { value: "pancat:cinema-video" } });
    await waitFor(() => expect(api.getVideoModelDetail).toHaveBeenCalledWith("pancat:cinema-video"));
    await waitFor(() => expect(screen.getByLabelText("视频模式")).toHaveValue('["imageReference","audioReference"]'));
    expect(screen.getByLabelText("视频分辨率")).toHaveValue("720p");
    expect(screen.getByLabelText("轨道时长 51")).toHaveValue("8");
    expect(screen.getByRole("button", { name: "切换音频" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "切换音频" })).toHaveAttribute("aria-pressed", "false");
  });

  it("synchronizes storyboard updates into the mounted flow board without saving in a loop", async () => {
    const api = createApi();
    vi.mocked(api.getFlowData).mockResolvedValue({
      script: "雨夜",
      scriptPlan: "",
      assets: [],
      storyboardTable: "",
      storyboard: [
        {
          id: 31,
          index: 0,
          prompt: "轮询前的分镜",
          videoDesc: "等待生成",
          src: "",
          state: "running",
          errorReason: "",
        },
      ],
    });
    vi.mocked(api.pollStoryboards).mockResolvedValue([
      {
        id: 31,
        index: 0,
        prompt: "轮询后的分镜",
        videoDesc: "已经完成",
        src: "https://example.test/31.jpg",
        state: "completed",
        errorReason: "",
      },
    ]);

    render(
      <ProductionWorkbench
        api={api}
        initialView="flow"
        pollIntervalMs={1}
        project={{ id: 7, name: "雨夜", videoModel: "pancat:pancat-video", videoMode: "singleImage" }}
      />,
    );

    expect(await screen.findByAltText("画布分镜 1")).toHaveAttribute("src", "https://example.test/31.jpg");
    await waitFor(() => expect(api.pollStoryboards).toHaveBeenCalledWith([31]));
    expect(api.saveFlowData).not.toHaveBeenCalled();
  });

  it("selects references from the same asset and storyboard sources as upstream", async () => {
    render(<ProductionWorkbench api={createApi()} project={{ id: 7, name: "雨夜", videoModel: "pancat:pancat-video", videoMode: "singleImage" }} />);
    await screen.findByLabelText("轨道提示词 51");

    fireEvent.click(screen.getByRole("button", { name: "移除参考素材 32" }));
    fireEvent.click(screen.getByRole("button", { name: /添加参考/ }));
    const picker = screen.getByRole("dialog", { name: "选择参考素材" });
    expect(within(picker).getByRole("button", { name: "选择参考素材 黛利拉" })).toBeInTheDocument();
    expect(within(picker).getByRole("button", { name: "选择参考素材 P2" })).toBeInTheDocument();
    fireEvent.click(within(picker).getByRole("button", { name: "选择参考素材 黛利拉" }));
    expect(screen.getByAltText("黛利拉")).toBeInTheDocument();
  });

  it("keeps upstream track add, switch, delete and history operations wired to the real API", async () => {
    const api = createApi();
    render(<ProductionWorkbench api={api} project={{ id: 7, name: "雨夜", videoModel: "pancat:pancat-video", videoMode: "singleImage" }} />);
    await screen.findByLabelText("轨道提示词 51");

    fireEvent.click(screen.getByRole("button", { name: "选择视频 88" }));
    await waitFor(() => expect(api.selectVideo).toHaveBeenCalledWith(51, 88));
    fireEvent.click(screen.getByRole("button", { name: "删除视频 88" }));
    await waitFor(() => expect(api.deleteVideo).toHaveBeenCalledWith(88));

    fireEvent.click(screen.getByRole("button", { name: "新增视频轨道" }));
    await waitFor(() => expect(api.addTrack).toHaveBeenCalledWith(7, 12, 5));
    expect(screen.getByRole("button", { name: "删除轨道 52" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "删除轨道 52" }));
    await waitFor(() => expect(api.deleteTrack).toHaveBeenCalledWith(52));
  });

  it("keeps the flow canvas mounted under the upstream full-screen workbench", async () => {
    const api = createApi();
    render(
      <ProductionWorkbench
        api={api}
        initialView="flow"
        project={{ id: 7, name: "雨夜", videoModel: "pancat:pancat-video", videoMode: "singleImage" }}
      />,
    );

    const flowBoard = await screen.findByRole("region", { name: "生产流图" });
    fireEvent.click(screen.getByTestId("flow-node-workbench"));
    const workbench = screen.getByRole("dialog", { name: "视频工作台" });
    expect(screen.getByRole("region", { name: "生产流图" })).toBe(flowBoard);
    expect(
      within(workbench)
        .getAllByRole("button")
        .slice(0, 3)
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual(["快速预览", "视频生成", "视频编辑"]);

    fireEvent.click(within(workbench).getByRole("button", { name: "视频生成" }));
    expect(await within(workbench).findByLabelText("轨道提示词 51")).toBeInTheDocument();
    fireEvent.click(within(workbench).getByRole("button", { name: "视频编辑" }));
    expect(screen.getByRole("region", { name: "WebAV 视频编辑器" })).toBeInTheDocument();

    fireEvent.click(within(workbench).getByRole("button", { name: "关闭视频工作台" }));
    expect(screen.queryByRole("dialog", { name: "视频工作台" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "生产流图" })).toBe(flowBoard);
  });

  it("checks the latest production-agent state before switching episodes", async () => {
    const api = createApi([
      { id: 12, name: "第一幕", content: "", state: "running", errorReason: "" },
      { id: 13, name: "第二幕", content: "", state: "completed", errorReason: "" },
    ]);
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    render(<ProductionWorkbench api={api} project={{ id: 7, name: "雨夜", videoModel: "pancat:pancat-video", videoMode: "singleImage" }} />);
    await screen.findByLabelText("轨道提示词 51");

    fireEvent.change(screen.getByLabelText("当前剧本"), { target: { value: "13" } });
    await waitFor(() => expect(window.confirm).toHaveBeenCalledWith("当前生产智能体或生成任务仍在运行，切换后任务会继续在后台执行。确定切换吗？"));
    expect(api.saveFlowData).not.toHaveBeenCalled();

    vi.mocked(window.confirm).mockReturnValueOnce(true);
    fireEvent.change(screen.getByLabelText("当前剧本"), { target: { value: "13" } });
    await waitFor(() => expect(api.saveFlowData).toHaveBeenCalledWith(7, 12, expect.objectContaining({ storyboard: expect.any(Array) })));
    await waitFor(() => expect(api.getGenerationData).toHaveBeenCalledWith(7, 13));
  });

  it("keeps the edit timeline mounted and isolated per episode", async () => {
    const api = createApi([
      { id: 12, name: "第一幕", content: "", state: "completed", errorReason: "" },
      { id: 13, name: "第二幕", content: "", state: "completed", errorReason: "" },
    ]);
    render(<ProductionWorkbench api={api} project={{ id: 7, name: "雨夜", videoModel: "pancat:pancat-video", videoMode: "singleImage" }} />);
    await screen.findByLabelText("轨道提示词 51");

    fireEvent.click(screen.getByRole("button", { name: "视频编辑" }));
    fireEvent.click(screen.getByRole("button", { name: "添加文字轨道" }));
    const textTrack = screen.getByRole("button", { name: /选择轨道 文字/ });
    fireEvent.click(screen.getByRole("button", { name: "视频生成" }));
    fireEvent.click(screen.getByRole("button", { name: "视频编辑" }));
    expect(screen.getByRole("button", { name: /选择轨道 文字/ })).toBe(textTrack);

    fireEvent.change(screen.getByLabelText("当前剧本"), { target: { value: "13" } });
    await waitFor(() => expect(screen.queryByRole("button", { name: /选择轨道 文字/ })).not.toBeInTheDocument());
  });

  it("keeps the workbench usable when the edit media library fails and offers retry", async () => {
    const api = createApi();
    vi.mocked(api.getMediaLibrary).mockRejectedValueOnce(new Error("对象存储暂时不可用"));
    render(<ProductionWorkbench api={api} project={{ id: 7, name: "雨夜", videoModel: "pancat:pancat-video", videoMode: "singleImage" }} />);
    await screen.findByLabelText("轨道提示词 51");

    fireEvent.click(screen.getByRole("button", { name: "视频编辑" }));
    expect(screen.getByText("剪辑素材库加载失败：对象存储暂时不可用")).toBeInTheDocument();
    vi.mocked(api.getMediaLibrary).mockResolvedValueOnce([]);
    fireEvent.click(screen.getByRole("button", { name: "重试加载剪辑素材" }));
    await waitFor(() => expect(api.getMediaLibrary).toHaveBeenCalledTimes(2));
  });

  it("keeps the production agent beside the canvas and refreshes the single flow-data source", async () => {
    const api = createApi([
      { id: 12, name: "第一幕", content: "", state: "completed", errorReason: "" },
      { id: 13, name: "第二幕", content: "", state: "completed", errorReason: "" },
    ]);
    const renderProductionAgent = vi.fn((episodeId: number, onFlowDataChange: () => void, onBusyChange: (busy: boolean) => void) => (
      <section aria-label="真实生产智能体">
        <span>剧本 #{episodeId}</span>
        <button type="button" onClick={onFlowDataChange}>
          同步产线图
        </button>
        <button type="button" onClick={() => onBusyChange(true)}>
          模拟智能体忙碌
        </button>
      </section>
    ));
    render(
      <ProductionWorkbench
        api={api}
        project={{ id: 7, name: "雨夜", videoModel: "pancat:pancat-video", videoMode: "singleImage" }}
        renderProductionAgent={renderProductionAgent}
      />,
    );
    await screen.findByLabelText("轨道提示词 51");
    fireEvent.click(screen.getByRole("button", { name: "生产智能体" }));

    expect(screen.getByRole("complementary", { name: "生产智能体侧栏" })).toBeInTheDocument();
    vi.mocked(api.getFlowData).mockResolvedValueOnce({
      script: "雨夜",
      scriptPlan: "智能体刚写入的新拍摄计划",
      assets: [],
      storyboardTable: "",
      storyboard: [],
    });
    fireEvent.click(screen.getByRole("button", { name: "同步产线图" }));
    expect(await screen.findByText("智能体刚写入的新拍摄计划")).toBeInTheDocument();

    vi.mocked(window.confirm).mockReturnValueOnce(false);
    fireEvent.click(screen.getByRole("button", { name: "模拟智能体忙碌" }));
    fireEvent.change(screen.getByLabelText("当前剧本"), { target: { value: "13" } });
    await waitFor(() => expect(window.confirm).toHaveBeenCalledWith("当前生产智能体或生成任务仍在运行，切换后任务会继续在后台执行。确定切换吗？"));
  });
});
