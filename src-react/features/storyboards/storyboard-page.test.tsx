import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { StoryboardApi } from "./storyboard-api";
import { StoryboardPage } from "./storyboard-page";

function createApi(overrides: Partial<StoryboardApi> = {}): StoryboardApi {
  return {
    load: vi.fn(async () => ({
      storyboardTable: "# 镜头表",
      storyboard: [
        {
          id: 23,
          index: 1,
          duration: 4,
          prompt: "中景，医院走廊",
          videoDesc: "镜头向前推进",
          src: "https://assets.example/frame-1.jpg",
          state: "生成失败",
          reason: "供应商超时",
          associateAssetsIds: [2],
          shouldGenerateImage: 1,
        },
      ],
    })),
    update: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
    removeMany: vi.fn(async () => undefined),
    generateImages: vi.fn(async () => []),
    pollImages: vi.fn(async () => []),
    previewGrid: vi.fn(async () => "data:image/jpeg;base64,preview"),
    downloadGrid: vi.fn(async () => new Blob(["png"], { type: "image/png" })),
    ...overrides,
  };
}

describe("StoryboardPage", () => {
  it("shows storyboard images, production fields and failure reasons", async () => {
    render(<StoryboardPage api={createApi()} projectId={7} scriptId={19} />);

    expect(await screen.findByText("S01")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "分镜 S01" })).toHaveAttribute("src", "https://assets.example/frame-1.jpg");
    expect(screen.getByText("镜头向前推进")).toBeInTheDocument();
    expect(screen.getByText("生成失败：供应商超时")).toBeInTheDocument();
  });

  it("edits storyboard generation fields and refreshes the flow", async () => {
    const api = createApi();
    render(<StoryboardPage api={api} projectId={7} scriptId={19} />);

    await screen.findByText("S01");
    fireEvent.click(screen.getByRole("button", { name: "编辑分镜 S01" }));
    fireEvent.change(screen.getByLabelText("图片提示词"), { target: { value: "特写，雨滴" } });
    fireEvent.click(screen.getByRole("button", { name: "保存分镜" }));

    await waitFor(() =>
      expect(api.update).toHaveBeenCalledWith({
        id: 23,
        prompt: "特写，雨滴",
        videoDesc: "镜头向前推进",
      }),
    );
    expect(api.load).toHaveBeenCalledTimes(2);
  });

  it("opens the selected frame in the 3D director desk", async () => {
    const onOpenDirectorDesk = vi.fn();
    render(
      <StoryboardPage
        api={createApi()}
        projectId={7}
        scriptId={19}
        onOpenDirectorDesk={onOpenDirectorDesk}
      />,
    );

    await screen.findByText("S01");
    fireEvent.click(screen.getByRole("button", { name: "在 3D 导演台打开分镜 S01" }));

    expect(onOpenDirectorDesk).toHaveBeenCalledWith(23);
  });

  it("batch-generates selected frames and opens the grid preview", async () => {
    const api = createApi();
    render(<StoryboardPage api={api} projectId={7} scriptId={19} />);

    await screen.findByText("S01");
    fireEvent.click(screen.getByRole("checkbox", { name: "选择分镜 S01" }));
    fireEvent.click(screen.getByRole("button", { name: "批量生图 (1)" }));
    await waitFor(() => expect(api.generateImages).toHaveBeenCalledWith({
      projectId: 7,
      scriptId: 19,
      storyboardIds: [23],
      concurrentCount: 5,
      compulsory: true,
    }));

    fireEvent.click(screen.getByRole("button", { name: "网格预览" }));
    expect(await screen.findByRole("img", { name: "分镜网格预览" })).toHaveAttribute("src", "data:image/jpeg;base64,preview");
  });

  it("exposes the selected frame to the image editor hook", async () => {
    const onOpenImageEditor = vi.fn();
    render(<StoryboardPage api={createApi()} projectId={7} scriptId={19} onOpenImageEditor={onOpenImageEditor} />);

    await screen.findByText("S01");
    fireEvent.click(screen.getByRole("button", { name: "编辑分镜图 S01" }));
    expect(onOpenImageEditor).toHaveBeenCalledWith(expect.objectContaining({ id: 23 }));
  });

  it("polls image generation and replaces the frame image", async () => {
    const api = createApi({
      load: vi.fn(async () => ({ storyboardTable: "", storyboard: [{ id: 23, duration: 4, prompt: "镜头", videoDesc: "推进", state: "生成中" }] })),
      pollImages: vi.fn(async () => [{ id: 23, state: "已完成", src: "https://assets.example/done.jpg", prompt: "镜头" }]),
    });
    render(<StoryboardPage api={api} projectId={7} scriptId={19} pollIntervalMs={10} />);

    expect(await screen.findByRole("img", { name: "分镜 S01" })).toHaveAttribute("src", "https://assets.example/done.jpg");
    expect(api.pollImages).toHaveBeenCalledWith([23]);
  });

  it("downloads the generated grid through the page action", async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const createObjectURL = vi.fn(() => "blob:grid");
    const revokeObjectURL = vi.fn();
    Object.defineProperties(URL, {
      createObjectURL: { configurable: true, value: createObjectURL },
      revokeObjectURL: { configurable: true, value: revokeObjectURL },
    });
    const api = createApi();
    render(<StoryboardPage api={api} projectId={7} scriptId={19} />);

    await screen.findByText("S01");
    fireEvent.click(screen.getByRole("button", { name: "下载网格" }));
    await waitFor(() => expect(api.downloadGrid).toHaveBeenCalledWith([23]));
    expect(createObjectURL).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:grid");
    click.mockRestore();
  });
});
