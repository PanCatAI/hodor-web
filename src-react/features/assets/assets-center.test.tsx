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
    updateAsset: vi.fn(async () => undefined),
    deleteAsset: vi.fn(async () => undefined),
    batchDeleteAssets: vi.fn(async () => undefined),
    getImageHistory: vi.fn(async () => ({ id: 7, imageId: 13, tempAssets: [{ id: 12, filePath: "https://example.com/old.png" }, { id: 13, filePath: "https://example.com/current.png", selected: true }] })),
    selectImage: vi.fn(async () => undefined),
    deleteImage: vi.fn(async () => undefined),
    uploadClip: vi.fn(async () => undefined),
    createAudioAsset: vi.fn(async () => undefined),
    updateAudioAsset: vi.fn(async () => undefined),
    retryPrompt: vi.fn(async () => undefined),
    retryImage: vi.fn(async () => undefined),
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

  it("edits, deletes, batch deletes and manages image history", async () => {
    const api = createFakeApi();
    render(<AssetsCenter projectId={42} api={api} />);
    await screen.findByText("黛利拉");

    fireEvent.click(screen.getByRole("button", { name: "编辑 黛利拉" }));
    fireEvent.change(screen.getByLabelText("编辑名称"), { target: { value: "黛利拉2" } });
    fireEvent.click(screen.getByRole("button", { name: "保存修改" }));
    await waitFor(() => expect(api.updateAsset).toHaveBeenCalledWith(expect.objectContaining({ id: 7, name: "黛利拉2" })));

    fireEvent.click(screen.getByRole("button", { name: "图片历史 黛利拉" }));
    expect(await screen.findByRole("dialog", { name: "黛利拉图片历史" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "选择历史图片 12" }));
    await waitFor(() => expect(api.selectImage).toHaveBeenCalledWith(expect.objectContaining({ id: 7, projectId: 42, imageId: 12 })));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "黛利拉图片历史" })).not.toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("选择资产 黛利拉"));
    fireEvent.click(screen.getByRole("button", { name: "批量删除" }));
    await waitFor(() => expect(api.batchDeleteAssets).toHaveBeenCalledWith([7]));

    fireEvent.click(screen.getByRole("button", { name: "删除 黛利拉" }));
    await waitFor(() => expect(api.deleteAsset).toHaveBeenCalledWith(7));
  });

  it("opens the clip and audio upload workflows", async () => {
    const api = createFakeApi();
    render(<AssetsCenter projectId={42} api={api} />);
    await screen.findByText("黛利拉");
    fireEvent.click(screen.getByRole("button", { name: "素材" }));
    await waitFor(() => expect(api.listAssets).toHaveBeenLastCalledWith(expect.objectContaining({ type: "clip" })));
    await screen.findByText("暂无素材资产");
    expect(screen.getByRole("button", { name: "上传素材" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "音频" }));
    await screen.findByText("暂无音频资产");
    expect(screen.getByRole("button", { name: "新建音频" })).toBeInTheDocument();
  });

  it("uploads a video clip through the mounted upload route", async () => {
    const api = createFakeApi();
    render(<AssetsCenter projectId={42} api={api} />);
    await screen.findByText("黛利拉");
    fireEvent.click(screen.getByRole("button", { name: "素材" }));
    await screen.findByText("暂无素材资产");
    fireEvent.click(screen.getByRole("button", { name: "上传素材" }));
    fireEvent.change(screen.getByLabelText("名称"), { target: { value: "片头" } });
    fireEvent.change(screen.getByLabelText("选择文件"), { target: { files: [new File(["video"], "intro.mp4", { type: "video/mp4" })] } });
    fireEvent.click(screen.getByRole("button", { name: "上传" }));
    await waitFor(() => expect(api.uploadClip).toHaveBeenCalledWith(expect.objectContaining({ projectId: 42, name: "片头", type: "clip", base64Data: expect.stringMatching(/^data:video\/mp4;base64,/) })));
  });

  it("creates and updates audio assets through the audio contract", async () => {
    const audio: AssetRecord = { id: 9, assetsId: null, name: "少女音色", type: "audio", describe: "女|清亮", sonAssets: [{ id: 10, assetsId: 9, name: "样本", type: "audio", describe: "普通话", prompt: "平静", src: "https://example.com/audio.mp3" }] };
    const api = createFakeApi({ listAssets: vi.fn(async ({ type }) => ({ items: type === "audio" ? [audio] : [role], total: 1 })) });
    render(<AssetsCenter projectId={42} api={api} />);
    await screen.findByText("黛利拉");
    fireEvent.click(screen.getByRole("button", { name: "音频" }));
    await screen.findByText("少女音色");
    fireEvent.click(screen.getByRole("button", { name: "编辑 少女音色" }));
    fireEvent.change(screen.getByLabelText("音频名称"), { target: { value: "少女音色2" } });
    fireEvent.click(screen.getByRole("button", { name: "添加音频样本" }));
    fireEvent.change(screen.getByLabelText("样本文件 2"), { target: { files: [new File(["new"], "new.mp3", { type: "audio/mpeg" })] } });
    fireEvent.change(screen.getByLabelText("样本文本 2"), { target: { value: "替换样本" } });
    fireEvent.click(screen.getByRole("button", { name: "删除音频样本 1" }));
    fireEvent.click(screen.getByRole("button", { name: "保存音频资产" }));
    await waitFor(() => expect(api.updateAudioAsset).toHaveBeenCalledWith(expect.objectContaining({ id: 9, projectId: 42, name: "少女音色2", assetsItem: [expect.objectContaining({ prompt: "替换样本", base64: expect.stringMatching(/^data:audio\/mpeg;base64,/) })] })));
  });

  it("creates a multi-sample audio asset and edits child samples", async () => {
    const api = createFakeApi();
    render(<AssetsCenter projectId={42} api={api} />);
    await screen.findByText("黛利拉");
    fireEvent.click(screen.getByRole("button", { name: "音频" }));
    await screen.findByText("暂无音频资产");
    fireEvent.click(screen.getByRole("button", { name: "新建音频" }));
    fireEvent.change(screen.getByLabelText("音频名称"), { target: { value: "少女音色" } });
    fireEvent.change(screen.getByLabelText("性别"), { target: { value: "女" } });
    fireEvent.change(screen.getByLabelText("音频描述"), { target: { value: "清亮" } });
    fireEvent.change(screen.getByLabelText("样本文件 1"), { target: { files: [new File(["one"], "one.mp3", { type: "audio/mpeg" })] } });
    fireEvent.change(screen.getByLabelText("样本文本 1"), { target: { value: "你好" } });
    fireEvent.click(screen.getByRole("button", { name: "添加音频样本" }));
    fireEvent.change(screen.getByLabelText("样本文件 2"), { target: { files: [new File(["two"], "two.mp3", { type: "audio/mpeg" })] } });
    fireEvent.change(screen.getByLabelText("样本文本 2"), { target: { value: "再见" } });
    fireEvent.click(screen.getByRole("button", { name: "保存音频资产" }));
    await waitFor(() => expect(api.createAudioAsset).toHaveBeenCalledWith(expect.objectContaining({ projectId: 42, name: "少女音色", describe: "女|清亮", assetsItem: [expect.objectContaining({ prompt: "你好" }), expect.objectContaining({ prompt: "再见" })] })));
  });

  it("retries failed prompt and image generation from the asset row", async () => {
    const failed = { ...role, state: "生成失败", promptState: "生成失败" };
    const api = createFakeApi({ listAssets: vi.fn(async () => ({ items: [failed], total: 1 })) });
    render(<AssetsCenter projectId={42} api={api} imageModel="pancat:pancat-image" />);
    await screen.findByText("黛利拉");
    fireEvent.click(screen.getByRole("button", { name: "重试提示词 黛利拉" }));
    fireEvent.click(screen.getByRole("button", { name: "重试图片 黛利拉" }));
    await waitFor(() => expect(api.retryPrompt).toHaveBeenCalledWith(expect.objectContaining({ assetsId: 7, projectId: 42 })));
    await waitFor(() => expect(api.retryImage).toHaveBeenCalledWith(expect.objectContaining({ id: 7, projectId: 42, model: "pancat:pancat-image" })));
  });

  it("shows the real retry error instead of swallowing it", async () => {
    const failed = { ...role, state: "生成失败", promptState: "生成失败" };
    const api = createFakeApi({ listAssets: vi.fn(async () => ({ items: [failed], total: 1 })), retryImage: vi.fn(async () => Promise.reject(new Error("Pancat 暂时不可用"))) });
    render(<AssetsCenter projectId={42} api={api} />);
    await screen.findByText("黛利拉");
    fireEvent.click(screen.getByRole("button", { name: "重试图片 黛利拉" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Pancat 暂时不可用");
  });
});
