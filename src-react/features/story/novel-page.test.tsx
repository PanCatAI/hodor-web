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
    listScripts: vi.fn(async () => []),
    createScript: vi.fn(async () => undefined),
    updateScript: vi.fn(async () => undefined),
    deleteScripts: vi.fn(async () => undefined),
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
});
