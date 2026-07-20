import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { StoryboardApi } from "./storyboard-api";
import { StoryboardPage } from "./storyboard-page";

function createApi(): StoryboardApi {
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
});
