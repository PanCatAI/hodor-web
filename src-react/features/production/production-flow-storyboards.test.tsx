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
    script: "雨夜，角色推门。",
    scriptPlan: "先远后近",
    storyboardTable: "| 镜头 | 景别 |",
    assets: [],
    storyboard: storyboards(),
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
  } as unknown as ProductionApi;
}

afterEach(() => vi.restoreAllMocks());

describe("production flow storyboard node", () => {
  it("selects every storyboard, submits the real batch generation contract and writes results to shared flow data", async () => {
    const api = createApi();
    const onChange = vi.fn();
    render(<ProductionFlowBoard api={api} projectId={7} scriptId={12} initialData={flowData()} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "全选" }));
    expect(screen.getByText("已选 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "批量生成分镜图" }));

    await waitFor(() => expect(api.generateStoryboards).toHaveBeenCalledWith({ projectId: 7, scriptId: 12, storyboardIds: [31, 32] }));
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ storyboard: expect.arrayContaining([expect.objectContaining({ id: 31, state: "completed" })]) }),
      ),
    );
    expect(screen.getByText("已选 0")).toBeInTheDocument();
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
      ),
    );
  });

  it("uses the backend composite preview and exposes composite and individual downloads", async () => {
    const api = createApi();
    render(<ProductionFlowBoard api={api} projectId={7} scriptId={12} initialData={flowData()} />);

    expect(screen.getByRole("link", { name: "下载分镜 31" })).toHaveAttribute("href", "https://example.test/31.jpg");
    fireEvent.click(screen.getByRole("button", { name: "预览全部分镜" }));

    await waitFor(() => expect(api.previewStoryboards).toHaveBeenCalledWith([31, 32]));
    expect(await screen.findByRole("dialog", { name: "分镜合并预览" })).toBeInTheDocument();
    expect(screen.getByAltText("画布分镜合并预览")).toHaveAttribute("src", "data:image/jpeg;base64,preview");
    expect(screen.getByRole("link", { name: "下载合并预览" })).toHaveAttribute("download", "storyboard-preview.jpg");
  });
});
