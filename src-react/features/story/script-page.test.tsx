import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ScriptPage } from "./script-page";
import type { StoryApi } from "./story-api";

function createApi(): StoryApi {
  return {
    listNovels: vi.fn(async () => ({ data: [], total: 0 })),
    createNovel: vi.fn(async () => undefined),
    updateNovel: vi.fn(async () => undefined),
    deleteNovel: vi.fn(async () => undefined),
    deleteNovels: vi.fn(async () => undefined),
    listScripts: vi.fn(async () => [
      {
        id: 19,
        name: "第一集",
        content: "医院走廊，黛利拉回头。",
        extractState: -1 as const,
        errorReason: "模型超时",
        relatedAssets: [{ id: 2, name: "黛利拉" }],
      },
    ]),
    createScript: vi.fn(async () => undefined),
    updateScript: vi.fn(async () => undefined),
    deleteScripts: vi.fn(async () => undefined),
  };
}

describe("ScriptPage", () => {
  it("shows scripts, related assets and extraction errors", async () => {
    render(<ScriptPage api={createApi()} projectId={7} />);

    expect(await screen.findByText("第一集")).toBeInTheDocument();
    expect(screen.getByText("黛利拉")).toBeInTheDocument();
    expect(screen.getByText("资产提取失败：模型超时")).toBeInTheDocument();
  });

  it("preserves related asset ids when editing a script", async () => {
    const api = createApi();
    render(<ScriptPage api={api} projectId={7} />);

    await screen.findByText("第一集");
    fireEvent.click(screen.getByRole("button", { name: "编辑 第一集" }));
    fireEvent.change(screen.getByLabelText("剧本内容"), { target: { value: "新的镜头内容" } });
    fireEvent.click(screen.getByRole("button", { name: "保存剧本" }));

    await waitFor(() =>
      expect(api.updateScript).toHaveBeenCalledWith({
        id: 19,
        name: "第一集",
        content: "新的镜头内容",
        assets: [2],
      }),
    );
  });
});
