import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ProductionApi } from "./production-api";
import { ProductionFlowBoard } from "./production-flow-board";
import type { ProductionFlowData, StoryboardItem } from "./types";

function storyboards(): StoryboardItem[] {
  return [
    {
      id: 31,
      index: 0,
      prompt: "雨夜医院远景",
      videoDesc: "低机位推进",
      src: "https://example.test/31.jpg",
      state: "completed",
      errorReason: "",
    },
    {
      id: 32,
      index: 1,
      prompt: "角色回头",
      videoDesc: "近景",
      src: "https://example.test/32.jpg",
      state: "completed",
      errorReason: "",
    },
  ];
}

function flowData(): ProductionFlowData {
  return {
    source: { chapters: [], state: "completed" },
    script: "雨夜，角色推门。",
    scriptPlan: "先远后近",
    storyboardTable: "| 镜头 | 景别 |",
    assets: [],
    storyboard: storyboards(),
    videoTracks: [],
    timeline: { id: null, revision: 0, status: "idle", clips: [], errorReason: "", updatedAt: null },
    finalOutputs: [],
  };
}

function createApi(): ProductionApi {
  return {
    saveFlowData: vi.fn(async () => undefined),
    generateStoryboards: vi.fn(async ({ storyboardIds }) =>
      storyboards()
        .filter((item) => storyboardIds.includes(item.id))
        .map((item) => ({ ...item, state: "completed" as const })),
    ),
    pollStoryboards: vi.fn(async () => []),
    deleteStoryboards: vi.fn(async () => undefined),
    addStoryboard: vi.fn(async () => 77),
    previewStoryboards: vi.fn(async () => "data:image/jpeg;base64,preview"),
    listPrevisRenders: vi.fn(async () => []),
  } as unknown as ProductionApi;
}

afterEach(() => vi.restoreAllMocks());

describe("production flow storyboard node", () => {
  it("selects every storyboard, submits the real batch generation contract and writes results to shared flow data", async () => {
    const api = createApi();
    const onChange = vi.fn();
    render(<ProductionFlowBoard api={api} projectId={7} scriptId={12} initialData={flowData()} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "全选" }));
    expect(screen.getByText("已选 2 项")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "批量生成分镜图" }));

    await waitFor(() => expect(api.generateStoryboards).toHaveBeenCalledWith({ projectId: 7, scriptId: 12, storyboardIds: [31, 32] }));
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ storyboard: expect.arrayContaining([expect.objectContaining({ id: 31, state: "completed" })]) }),
        expect.any(Number),
      ),
    );
    expect(screen.getByText("已选 0 项")).toBeInTheDocument();
  });

  it("inserts after a frame, persists the reordered flow and deletes selected frames through mounted endpoints", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const api = createApi();
    const onChange = vi.fn();
    render(<ProductionFlowBoard api={api} projectId={7} scriptId={12} initialData={flowData()} onChange={onChange} />);

    const first = screen.getByTestId("canvas-storyboard-31");
    fireEvent.click(within(first).getByRole("button", { name: "在分镜 31 后插入" }));

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
    await waitFor(() =>
      expect(api.saveFlowData).toHaveBeenCalledWith(
        7,
        12,
        expect.objectContaining({
          storyboard: [
            expect.objectContaining({ id: 31, index: 0 }),
            expect.objectContaining({ id: 77, index: 1 }),
            expect.objectContaining({ id: 32, index: 2 }),
          ],
        }),
      ),
    );

    fireEvent.click(screen.getByLabelText("选择分镜 31"));
    fireEvent.click(screen.getByRole("button", { name: "批量删除分镜" }));
    await waitFor(() => expect(api.deleteStoryboards).toHaveBeenCalledWith(7, [31]));
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ storyboard: expect.not.arrayContaining([expect.objectContaining({ id: 31 })]) }),
        expect.any(Number),
      ),
    );
  });

  it("uses the backend composite preview and exposes composite and individual downloads", async () => {
    const api = createApi();
    render(<ProductionFlowBoard api={api} projectId={7} scriptId={12} initialData={flowData()} />);

    expect(screen.getByRole("button", { name: "复制分镜 31" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "预览分镜 31" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "下载分镜 31" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "预览全部分镜" }));

    await waitFor(() => expect(api.previewStoryboards).toHaveBeenCalledWith([31, 32]));
    expect(await screen.findByRole("dialog", { name: "分镜合并预览" })).toBeInTheDocument();
    expect(screen.getByAltText("画布分镜合并预览")).toHaveAttribute("src", "data:image/jpeg;base64,preview");
    expect(screen.getByRole("link", { name: "下载合并预览" })).toHaveAttribute("download", "storyboard-preview.jpg");
  });

  it("opens the selected storyboard in the embedded 3D director desk", () => {
    const onOpenDirectorDesk = vi.fn();
    render(
      <ProductionFlowBoard
        api={createApi()}
        projectId={7}
        scriptId={12}
        initialData={flowData()}
        onOpenDirectorDesk={onOpenDirectorDesk}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "在 3D 导演台打开分镜 S01" }));
    expect(onOpenDirectorDesk).toHaveBeenCalledWith(31);
  });

  it("retries one failed storyboard directly from its canvas card", async () => {
    const api = createApi();
    const data = flowData();
    data.storyboard = [
      {
        ...data.storyboard[0]!,
        src: "",
        state: "failed",
        errorReason: "软件退出导致失败",
      },
    ];
    vi.mocked(api.generateStoryboards).mockResolvedValue([
      {
        ...data.storyboard[0]!,
        state: "running",
        errorReason: "",
      },
    ]);
    render(<ProductionFlowBoard api={api} projectId={7} scriptId={12} initialData={data} />);

    fireEvent.click(screen.getByRole("button", { name: "重试分镜 S01" }));

    await waitFor(() =>
      expect(api.generateStoryboards).toHaveBeenCalledWith({
        projectId: 7,
        scriptId: 12,
        storyboardIds: [31],
      }),
    );
    expect(screen.queryByRole("button", { name: "重试分镜 S01" })).not.toBeInTheDocument();
    expect(within(screen.getByTestId("storyboard-frame-image-31")).getByText("生成中")).toBeInTheDocument();
  });

  it("submits a 9:16 Blender previs from the existing storyboard and retries failures in place", async () => {
    const api = createApi();
    const failed = {
      renderId: "previs:7:12:31:abc",
      jobId: "previs-render:7:12:31:abc",
      projectId: 7,
      scriptId: 12,
      storyboardId: 31,
      status: "failed" as const,
      progress: 0,
      attempt: 1,
      errorReason: "Blender 渲染失败",
      contract: {} as never,
      result: null,
      createdAt: "2026-07-29T10:00:00.000Z",
      updatedAt: "2026-07-29T10:00:00.000Z",
    };
    vi.mocked(api.listPrevisRenders).mockResolvedValue([failed]);
    api.submitPrevis = vi.fn(async (contract) => ({
      ...failed,
      renderId: "previs:7:12:32:def",
      storyboardId: 32,
      status: "running" as const,
      errorReason: "",
      contract,
    }));
    api.retryPrevis = vi.fn(async () => ({ ...failed, status: "running" as const, errorReason: "" }));

    render(
      <ProductionFlowBoard
        api={api}
        projectId={7}
        scriptId={12}
        videoRatio="9:16"
        initialData={flowData()}
      />,
    );

    expect(await screen.findByText("Blender 渲染失败")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重试预演 S01" }));
    await waitFor(() => expect(api.retryPrevis).toHaveBeenCalledWith(7, failed.renderId));

    fireEvent.click(screen.getByRole("button", { name: "生成预演 S02" }));
    await waitFor(() =>
      expect(api.submitPrevis).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 7,
          scriptId: 12,
          storyboardId: 32,
          output: { width: 720, height: 1280, fps: 24 },
        }),
      ),
    );
  });
});
