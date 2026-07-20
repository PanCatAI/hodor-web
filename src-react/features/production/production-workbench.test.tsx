import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ProductionApi } from "./production-api";
import { ProductionWorkbench } from "./production-workbench";
import type { ProductionFlowData, ProductionGenerationData, ScriptSummary, StoryboardItem } from "./types";

function createApi(scriptItems?: ScriptSummary[]): ProductionApi {
  const scripts: ScriptSummary[] = scriptItems ?? [{ id: 12, name: "第一幕", content: "", state: "completed", errorReason: "" }];
  const flow: ProductionFlowData = {
    script: "雨夜",
    scriptPlan: "",
    assets: [],
    storyboardTable: "",
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

  it("adds, edits, generates a prompt for and deletes video tracks", async () => {
    const api = createApi();
    render(
      <ProductionWorkbench
        api={api}
        project={{ id: 7, name: "雨夜", imageModel: "pancat:pancat-image", videoModel: "pancat:pancat-video", videoMode: "singleImage" }}
      />,
    );

    await screen.findByTestId("video-track-51");
    fireEvent.click(screen.getByRole("button", { name: "新增视频轨道" }));
    await waitFor(() => expect(api.addTrack).toHaveBeenCalledWith(7, 12, 5));
    const track = screen.getByTestId("video-track-51");
    fireEvent.change(within(track).getByLabelText("轨道提示词 51"), { target: { value: "手动推进" } });
    fireEvent.blur(within(track).getByLabelText("轨道提示词 51"));
    fireEvent.change(within(track).getByLabelText("轨道时长 51"), { target: { value: "8" } });
    fireEvent.blur(within(track).getByLabelText("轨道时长 51"));
    fireEvent.click(within(track).getByRole("button", { name: "生成轨道提示词" }));

    await waitFor(() => expect(api.updateTrackPrompt).toHaveBeenCalledWith(51, "手动推进"));
    expect(api.updateTrackDuration).toHaveBeenCalledWith(51, 8);
    await waitFor(() => expect(api.generateVideoPrompt).toHaveBeenCalledOnce());
    expect(within(track).getByDisplayValue("AI 生成的推进提示词")).toBeInTheDocument();
    fireEvent.click(within(track).getByRole("button", { name: "删除轨道 51" }));
    await waitFor(() => expect(api.deleteTrack).toHaveBeenCalledWith(51));
  });

  it("selects media references and generated videos, supports preview downloads and deletion", async () => {
    const api = createApi();
    render(
      <ProductionWorkbench
        api={api}
        project={{ id: 7, name: "雨夜", imageModel: "pancat:pancat-image", videoModel: "pancat:pancat-video", videoMode: "singleImage" }}
      />,
    );

    const track = await screen.findByTestId("video-track-51");
    const media = within(track).getByLabelText("使用参考素材 32");
    expect(media).toBeChecked();
    fireEvent.click(media);
    expect(media).not.toBeChecked();
    fireEvent.click(within(track).getByRole("button", { name: "选择视频 88" }));
    await waitFor(() => expect(api.selectVideo).toHaveBeenCalledWith(51, 88));
    fireEvent.click(within(track).getByRole("button", { name: "删除视频 88" }));
    await waitFor(() => expect(api.deleteVideo).toHaveBeenCalledWith(88));
  });

  it("edits storyboard text and opens its combined preview from the reachable workbench", async () => {
    const api = createApi();
    render(
      <ProductionWorkbench
        api={api}
        project={{ id: 7, name: "雨夜", imageModel: "pancat:pancat-image", videoModel: "pancat:pancat-video", videoMode: "singleImage" }}
      />,
    );

    const card = await screen.findByTestId("storyboard-31");
    fireEvent.change(within(card).getByLabelText("分镜画面提示词 31"), { target: { value: "雨夜医院全景" } });
    fireEvent.change(within(card).getByLabelText("分镜视频描述 31"), { target: { value: "低机位推进" } });
    fireEvent.blur(within(card).getByLabelText("分镜视频描述 31"));
    await waitFor(() => expect(api.editStoryboard).toHaveBeenCalledWith(31, "雨夜医院全景", "低机位推进"));
    fireEvent.click(screen.getByRole("button", { name: "预览分镜表" }));
    expect(await screen.findByAltText("分镜合并预览")).toHaveAttribute("src", "data:image/jpeg;base64,preview");
    expect(screen.getByRole("link", { name: "下载分镜预览" })).toHaveAttribute("download", "storyboard-preview.jpg");
  });

  it("mounts the flow board, image workflow and video editor from reachable controls", async () => {
    const api = createApi();
    render(
      <ProductionWorkbench
        api={api}
        project={{ id: 7, name: "雨夜", imageModel: "pancat:pancat-image", videoModel: "pancat:pancat-video", videoMode: "singleImage" }}
      />,
    );

    await screen.findByTestId("storyboard-31");
    fireEvent.click(screen.getByRole("button", { name: "产线图" }));
    expect(screen.getByRole("region", { name: "生产流图" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "生成工作台" }));
    fireEvent.click(within(screen.getByTestId("storyboard-31")).getByRole("button", { name: "图片编辑" }));
    expect(screen.getByRole("dialog", { name: "图片工作流" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "关闭图片工作流" }));

    fireEvent.click(screen.getByRole("button", { name: "视频编辑" }));
    expect(screen.getByRole("region", { name: "WebAV 视频编辑器" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "添加素材 雨声音效" })).toBeInTheDocument();
  });

  it("inserts a storyboard before or after its neighbour and persists the new order", async () => {
    const api = createApi();
    render(
      <ProductionWorkbench
        api={api}
        project={{ id: 7, name: "雨夜", imageModel: "pancat:pancat-image", videoModel: "pancat:pancat-video", videoMode: "singleImage" }}
      />,
    );

    const card = await screen.findByTestId("storyboard-31");
    fireEvent.click(within(card).getByRole("button", { name: "在分镜 31 后插入" }));

    await waitFor(() =>
      expect(api.addStoryboard).toHaveBeenCalledWith(7, 12, {
        prompt: "",
        duration: 0,
        state: "未生成",
        videoDesc: "",
        shouldGenerateImage: 0,
        src: null,
      }),
    );
    expect(await screen.findByTestId("storyboard-77")).toBeInTheDocument();
    await waitFor(() =>
      expect(api.saveFlowData).toHaveBeenCalledWith(
        7,
        12,
        expect.objectContaining({
          storyboard: expect.arrayContaining([expect.objectContaining({ id: 77, index: 1 })]),
        }),
      ),
    );
  });

  it("keeps the edit timeline mounted while switching production tabs", async () => {
    const api = createApi();
    render(
      <ProductionWorkbench
        api={api}
        project={{ id: 7, name: "雨夜", imageModel: "pancat:pancat-image", videoModel: "pancat:pancat-video", videoMode: "singleImage" }}
      />,
    );

    await screen.findByTestId("storyboard-31");
    fireEvent.click(screen.getByRole("button", { name: "视频编辑" }));
    fireEvent.click(screen.getByRole("button", { name: "添加文字轨道" }));
    const textTrack = screen.getByRole("button", { name: /选择轨道 文字/ });
    expect(textTrack).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "生成工作台" }));
    fireEvent.click(screen.getByRole("button", { name: "视频编辑" }));
    expect(screen.getByRole("button", { name: /选择轨道 文字/ })).toBe(textTrack);
  });

  it("isolates local edit timelines when switching scripts", async () => {
    const api = createApi([
      { id: 12, name: "第一幕", content: "", state: "completed", errorReason: "" },
      { id: 13, name: "第二幕", content: "", state: "completed", errorReason: "" },
    ]);
    render(
      <ProductionWorkbench
        api={api}
        project={{ id: 7, name: "雨夜", imageModel: "pancat:pancat-image", videoModel: "pancat:pancat-video", videoMode: "singleImage" }}
      />,
    );

    await screen.findByTestId("storyboard-31");
    fireEvent.click(screen.getByRole("button", { name: "视频编辑" }));
    fireEvent.click(screen.getByRole("button", { name: "添加文字轨道" }));
    expect(screen.getByRole("button", { name: /选择轨道 文字/ })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("当前剧本"), { target: { value: "13" } });
    await waitFor(() => expect(api.getMediaLibrary).toHaveBeenCalledWith(7, 13));
    await waitFor(() => expect(screen.queryByRole("button", { name: /选择轨道 文字/ })).not.toBeInTheDocument());
  });

  it("keeps the production workbench usable when the edit media library fails and offers retry", async () => {
    const api = createApi();
    vi.mocked(api.getMediaLibrary).mockRejectedValueOnce(new Error("对象存储暂时不可用"));
    render(
      <ProductionWorkbench
        api={api}
        project={{ id: 7, name: "雨夜", imageModel: "pancat:pancat-image", videoModel: "pancat:pancat-video", videoMode: "singleImage" }}
      />,
    );

    expect(await screen.findByTestId("storyboard-31")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "视频编辑" }));
    expect(screen.getByText("剪辑素材库加载失败：对象存储暂时不可用")).toBeInTheDocument();

    vi.mocked(api.getMediaLibrary).mockResolvedValueOnce([]);
    fireEvent.click(screen.getByRole("button", { name: "重试加载剪辑素材" }));
    await waitFor(() => expect(api.getMediaLibrary).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText("剪辑素材库加载失败：对象存储暂时不可用")).not.toBeInTheDocument());
  });

  it("keeps the production agent beside the canvas and refreshes shared flow data after agent writes", async () => {
    const api = createApi();
    const onOpenAgent = vi.fn();
    const renderProductionAgent = vi.fn((episodeId: number, onFlowDataChange: () => void) => (
      <section aria-label="真实生产智能体">
        <span>剧本 #{episodeId}</span>
        <button type="button" onClick={onFlowDataChange}>
          同步产线图
        </button>
      </section>
    ));
    render(
      <ProductionWorkbench
        api={api}
        project={{ id: 7, name: "雨夜", imageModel: "pancat:pancat-image", videoModel: "pancat:pancat-video", videoMode: "singleImage" }}
        onOpenAgent={onOpenAgent}
        renderProductionAgent={renderProductionAgent}
      />,
    );

    await screen.findByTestId("storyboard-31");
    fireEvent.click(screen.getByRole("button", { name: "生产智能体" }));

    expect(screen.getByRole("region", { name: "生产流图" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "生产智能体侧栏" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "真实生产智能体" })).toHaveTextContent("剧本 #12");

    vi.mocked(api.getFlowData).mockResolvedValueOnce({
      script: "雨夜",
      scriptPlan: "智能体刚写入的新拍摄计划",
      assets: [],
      storyboardTable: "",
      storyboard: [],
    });
    fireEvent.click(screen.getByRole("button", { name: "同步产线图" }));
    await waitFor(() => expect(api.getFlowData).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("智能体刚写入的新拍摄计划")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "独立打开" }));
    expect(onOpenAgent).toHaveBeenCalledWith(12);

    fireEvent.click(screen.getByRole("button", { name: "收起生产智能体" }));
    expect(screen.queryByRole("complementary", { name: "生产智能体侧栏" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "生产智能体" }));
    expect(screen.getByRole("complementary", { name: "生产智能体侧栏" })).toBeInTheDocument();
  });
});
