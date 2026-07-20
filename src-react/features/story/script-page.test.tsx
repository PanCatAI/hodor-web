import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ScriptPage } from "./script-page";
import type { StoryApi } from "./story-api";

function createApi(overrides: Partial<StoryApi> = {}): StoryApi {
  return {
    listNovels: vi.fn(async () => ({ data: [], total: 0 })),
    createNovel: vi.fn(async () => undefined),
    updateNovel: vi.fn(async () => undefined),
    deleteNovel: vi.fn(async () => undefined),
    deleteNovels: vi.fn(async () => undefined),
    importNovels: vi.fn(async () => undefined),
    analyzeNovelEvents: vi.fn(async () => undefined),
    pollNovelEvents: vi.fn(async () => []),
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
    importScripts: vi.fn(async () => undefined),
    exportScripts: vi.fn(async () => new Blob(["zip"], { type: "application/zip" })),
    listSelectableAssets: vi.fn(async () => [{ id: 3, name: "医院", type: "scene" as const }]),
    extractScriptAssets: vi.fn(async () => undefined),
    pollScriptAssets: vi.fn(async () => []),
    ...overrides,
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

  it("selects assets while editing and persists the complete binding", async () => {
    const api = createApi();
    render(<ScriptPage api={api} projectId={7} />);

    await screen.findByText("第一集");
    fireEvent.click(screen.getByRole("button", { name: "编辑 第一集" }));
    fireEvent.click(await screen.findByRole("checkbox", { name: "医院" }));
    fireEvent.click(screen.getByRole("button", { name: "保存剧本" }));

    await waitFor(() => expect(api.updateScript).toHaveBeenCalledWith(expect.objectContaining({ assets: [2, 3] })));
  });

  it("extracts assets for selected scripts", async () => {
    const api = createApi();
    render(<ScriptPage api={api} projectId={7} />);

    await screen.findByText("第一集");
    fireEvent.click(screen.getByRole("checkbox", { name: "选择 第一集" }));
    fireEvent.click(screen.getByRole("button", { name: "提取资产 (1)" }));

    await waitFor(() => expect(api.extractScriptAssets).toHaveBeenCalledWith({ projectId: 7, scriptIds: [19], groupSize: 5 }));
  });

  it("imports episode files in batch", async () => {
    const api = createApi();
    render(<ScriptPage api={api} projectId={7} />);

    fireEvent.click(screen.getByRole("button", { name: "批量导入" }));
    fireEvent.change(screen.getByLabelText("导入剧本文件"), {
      target: { files: [new File(["第一集 雨夜\n场景一\n第二集 追踪\n场景二"], "scripts.txt", { type: "text/plain" })] },
    });
    expect(await screen.findByText("已解析 2 集")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "导入 2 集" }));

    await waitFor(() => expect(api.importScripts).toHaveBeenCalledWith(7, [
      { scriptName: "雨夜", scriptData: "场景一" },
      { scriptName: "追踪", scriptData: "场景二" },
    ]));
  });

  it("polls extraction states and renders completion", async () => {
    const api = createApi({
      listScripts: vi.fn(async () => [{ id: 19, name: "第一集", content: "场景", extractState: 0 as const }]),
      pollScriptAssets: vi.fn(async () => [{ id: 19, extractState: 1 as const }]),
    });
    render(<ScriptPage api={api} projectId={7} pollIntervalMs={10} />);

    expect(await screen.findByText("资产提取完成")).toBeInTheDocument();
    expect(api.pollScriptAssets).toHaveBeenCalledWith([19]);
  });

  it("downloads an export for selected scripts", async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const createObjectURL = vi.fn(() => "blob:script-export");
    const revokeObjectURL = vi.fn();
    Object.defineProperties(URL, {
      createObjectURL: { configurable: true, value: createObjectURL },
      revokeObjectURL: { configurable: true, value: revokeObjectURL },
    });
    const api = createApi();
    render(<ScriptPage api={api} projectId={7} />);

    await screen.findByText("第一集");
    fireEvent.click(screen.getByRole("checkbox", { name: "选择 第一集" }));
    fireEvent.click(screen.getByRole("button", { name: "导出剧本 (1)" }));

    await waitFor(() => expect(api.exportScripts).toHaveBeenCalledWith([19]));
    expect(createObjectURL).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:script-export");
    click.mockRestore();
  });
});
