import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AssetsCenter } from "./assets-center";
import type { AssetApi } from "./asset-api";
import type { AssetRecord } from "./types";

const role: AssetRecord = {
  id: 7,
  assetsId: null,
  name: "黛利拉",
  type: "role",
  describe: "十四岁少女",
  prompt: "角色设定图",
  state: "生成中",
  promptState: "已完成",
  src: "https://example.com/delilah.png",
};

function createFakeApi(overrides: Partial<AssetApi> = {}): AssetApi {
  return {
    listAssets: vi.fn(async ({ type }) => ({ items: type === "role" ? [role] : [], total: type === "role" ? 1 : 0 })),
    createAsset: vi.fn(async () => undefined),
    pollImageAssets: vi.fn(async () => []),
    pollPromptAssets: vi.fn(async () => []),
    ...overrides,
  };
}

describe("React asset center", () => {
  it("loads project assets, filters by type and opens an image preview", async () => {
    const api = createFakeApi();
    render(<AssetsCenter projectId={42} api={api} />);

    expect(await screen.findByText("黛利拉")).toBeInTheDocument();
    expect(screen.getByText("生成中")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "预览 黛利拉" }));
    expect(screen.getByRole("dialog", { name: "黛利拉预览" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "黛利拉" })).toHaveAttribute("src", role.src);

    fireEvent.click(screen.getByRole("button", { name: "场景" }));
    await waitFor(() => expect(api.listAssets).toHaveBeenLastCalledWith(expect.objectContaining({ projectId: 42, type: "scene" })));
  });

  it("creates an asset from the active visual type and refreshes the list", async () => {
    const api = createFakeApi();
    render(<AssetsCenter projectId={42} api={api} />);
    await screen.findByText("黛利拉");

    fireEvent.click(screen.getByRole("button", { name: "新建角色" }));
    fireEvent.change(screen.getByLabelText("名称"), { target: { value: "以撒" } });
    fireEvent.change(screen.getByLabelText("描述"), { target: { value: "医院里的少年" } });
    fireEvent.change(screen.getByLabelText("提示词"), { target: { value: "角色三视图" } });
    fireEvent.click(screen.getByRole("button", { name: "创建资产" }));

    await waitFor(() =>
      expect(api.createAsset).toHaveBeenCalledWith({
        projectId: 42,
        type: "role",
        name: "以撒",
        describe: "医院里的少年",
        remark: "",
        prompt: "角色三视图",
      }),
    );
    expect(api.listAssets).toHaveBeenCalledTimes(2);
  });

  it("shows the API error while keeping the current workspace usable", async () => {
    const api = createFakeApi({ listAssets: vi.fn(async () => Promise.reject(new Error("数据库暂时不可用"))) });
    render(<AssetsCenter projectId={42} api={api} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("数据库暂时不可用");
    expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument();
  });
});
