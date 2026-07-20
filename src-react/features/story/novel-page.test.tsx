import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { NovelPage } from "./novel-page";
import type { StoryApi } from "./story-api";

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
          eventState: 0 as const,
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
    listScripts: vi.fn(async () => []),
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

describe("NovelPage", () => {
  it("shows original text and the event analysis state", async () => {
    render(<NovelPage api={createApi()} projectId={7} />);

    expect(await screen.findByText("雨夜")).toBeInTheDocument();
    expect(screen.getByText("事件分析中")).toBeInTheDocument();
    expect(screen.getByText("她推开医院的大门。")).toBeInTheDocument();
  });

  it("edits an original-text record and reloads the list", async () => {
    const api = createApi();
    render(<NovelPage api={api} projectId={7} />);

    await screen.findByText("雨夜");
    fireEvent.click(screen.getByRole("button", { name: "编辑 雨夜" }));
    fireEvent.change(screen.getByLabelText("章节内容"), { target: { value: "修改后的正文" } });
    fireEvent.click(screen.getByRole("button", { name: "保存原文" }));

    await waitFor(() =>
      expect(api.updateNovel).toHaveBeenCalledWith({
        id: 11,
        index: 1,
        reel: "第一卷",
        chapter: "雨夜",
        chapterData: "修改后的正文",
        event: "黛利拉遭遇追捕",
      }),
    );
    expect(api.listNovels).toHaveBeenCalledTimes(2);
  });

  it("analyzes and batch-deletes selected chapters", async () => {
    const api = createApi();
    render(<NovelPage api={api} projectId={7} />);

    await screen.findByText("雨夜");
    fireEvent.click(screen.getByRole("checkbox", { name: "选择 雨夜" }));
    fireEvent.click(screen.getByRole("button", { name: "分析事件 (1)" }));
    await waitFor(() => expect(api.analyzeNovelEvents).toHaveBeenCalledWith({ projectId: 7, novelIds: [11], concurrentCount: 5 }));

    fireEvent.click(screen.getByRole("checkbox", { name: "选择 雨夜" }));
    fireEvent.click(screen.getByRole("button", { name: "批量删除 (1)" }));
    await waitFor(() => expect(api.deleteNovels).toHaveBeenCalledWith([11]));
  });

  it("imports parsed TXT chapters in one request", async () => {
    const api = createApi();
    render(<NovelPage api={api} projectId={7} />);

    fireEvent.click(screen.getByRole("button", { name: "导入原文" }));
    fireEvent.change(screen.getByLabelText("导入原文文件"), {
      target: { files: [new File(["第一章 雨夜\n正文一\n第二章 追踪\n正文二"], "novel.txt", { type: "text/plain" })] },
    });
    expect(await screen.findByText("已解析 2 章")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "导入 2 章" }));

    await waitFor(() => expect(api.importNovels).toHaveBeenCalledWith(7, [
      { index: 1, reel: "正文卷", chapter: "雨夜", chapterData: "正文一" },
      { index: 2, reel: "正文卷", chapter: "追踪", chapterData: "正文二" },
    ]));
  });

  it("polls event analysis until the chapter reaches a terminal state", async () => {
    const api = createApi({
      pollNovelEvents: vi.fn(async () => [{ id: 11, eventState: 1 as const, event: "分析完成事件" }]),
    });
    render(<NovelPage api={api} projectId={7} pollIntervalMs={10} />);

    expect(await screen.findByText("分析完成")).toBeInTheDocument();
    expect(api.pollNovelEvents).toHaveBeenCalledWith([11]);
  });
});
