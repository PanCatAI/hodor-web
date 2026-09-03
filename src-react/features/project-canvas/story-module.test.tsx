import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { StoryApi } from "@react/features/story";
import { StoryModule } from "./story-module";

/** 与 novel-page / script-page 测试同构的 StoryApi 桩：原文与剧本各一条记录。 */
function createApi(overrides: Partial<StoryApi> = {}): StoryApi {
  return {
    listNovels: vi.fn(async () => ({
      data: [
        {
          id: 11,
          index: 1,
          reel: "第一卷",
          chapter: "雨夜",
          chapterData: "她推开医院的大门。",
          event: "黛利拉遭遇追捕",
          eventState: 1 as const,
        },
      ],
      total: 1,
    })),
    createNovel: vi.fn(async () => undefined),
    updateNovel: vi.fn(async () => undefined),
    deleteNovel: vi.fn(async () => undefined),
    deleteNovels: vi.fn(async () => undefined),
    importNovels: vi.fn(async () => undefined),
    analyzeNovelEvents: vi.fn(async () => undefined),
    pollNovelEvents: vi.fn(async () => []),
    listScripts: vi.fn(async () => [
      { id: 19, name: "第一集", content: "医院走廊，黛利拉回头。", extractState: -1 as const, errorReason: "模型超时", relatedAssets: [] },
    ]),
    createScript: vi.fn(async () => undefined),
    updateScript: vi.fn(async () => undefined),
    deleteScripts: vi.fn(async () => undefined),
    importScripts: vi.fn(async () => undefined),
    exportScripts: vi.fn(async () => new Blob()),
    listSelectableAssets: vi.fn(async () => []),
    extractScriptAssets: vi.fn(async () => undefined),
    pollScriptAssets: vi.fn(async () => []),
    ...overrides,
  };
}

describe("StoryModule", () => {
  it("defaults to the original-text pane with the script pane absent", async () => {
    render(<StoryModule api={createApi()} projectId={7} />);

    expect(await screen.findByText("雨夜")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "原文" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "剧本" })).toHaveAttribute("aria-pressed", "false");
    // 只挂载一个内容面板：剧本面板不在 DOM。
    expect(screen.getByTestId("story-module-pane-novel")).toBeInTheDocument();
    expect(screen.queryByTestId("story-module-pane-script")).not.toBeInTheDocument();
    expect(screen.queryByText("第一集")).not.toBeInTheDocument();
  });

  it("switches to the script pane and back without leaving the module or changing route", async () => {
    const hashBefore = window.location.hash;
    render(<StoryModule api={createApi()} projectId={7} />);

    await screen.findByText("雨夜");
    fireEvent.click(screen.getByRole("button", { name: "剧本" }));
    expect(await screen.findByText("第一集")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "剧本" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("雨夜")).not.toBeInTheDocument();
    expect(screen.queryByTestId("story-module-pane-novel")).not.toBeInTheDocument();
    expect(window.location.hash).toBe(hashBefore);

    fireEvent.click(screen.getByRole("button", { name: "原文" }));
    expect(await screen.findByText("雨夜")).toBeInTheDocument();
    expect(screen.queryByText("第一集")).not.toBeInTheDocument();
    expect(screen.queryByTestId("story-module-pane-script")).not.toBeInTheDocument();
    expect(window.location.hash).toBe(hashBefore);
  });

  it("never renders both original-text and script panes at the same time", async () => {
    render(<StoryModule api={createApi()} projectId={7} />);

    const mountedPanes = () =>
      [screen.queryByTestId("story-module-pane-novel"), screen.queryByTestId("story-module-pane-script")].filter(Boolean);

    await screen.findByText("雨夜");
    expect(mountedPanes()).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "剧本" }));
    await screen.findByText("第一集");
    expect(mountedPanes()).toHaveLength(1);
    expect(screen.queryByTestId("story-module-pane-novel")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "原文" }));
    await screen.findByText("雨夜");
    expect(mountedPanes()).toHaveLength(1);
    expect(screen.queryByTestId("story-module-pane-script")).not.toBeInTheDocument();
  });

  it("keeps the embedded pages free of duplicated page headers and nested consoles", async () => {
    render(<StoryModule api={createApi()} projectId={7} />);

    await screen.findByText("雨夜");
    // 嵌入形态不复制整页标题（原文管理/剧本管理只作为分段名存在）。
    expect(screen.queryByRole("heading", { name: "原文管理" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "剧本管理" })).not.toBeInTheDocument();
    expect(screen.queryByText("ProductionGraph")).not.toBeInTheDocument();
    expect(screen.queryByText("制作工作台")).not.toBeInTheDocument();
  });
});
