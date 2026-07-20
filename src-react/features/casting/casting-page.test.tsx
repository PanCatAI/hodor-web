import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CastingApi } from "./casting-api";
import { CastingPage } from "./casting-page";
import type { CastingAsset } from "./types";

const role: CastingAsset = {
  id: 7,
  imageId: 99,
  type: "role",
  name: "黛利拉",
  describe: "十四岁少女",
  prompt: "角色三视图",
  filePath: "https://example.com/delilah.png",
  state: "已完成",
  promptState: "已完成",
  audioBindState: "",
  historyImages: [],
  relepedAudio: [],
};

function createFakeApi(overrides: Partial<CastingApi> = {}): CastingApi {
  return {
    listAssets: vi.fn(async () => [role]),
    batchPolish: vi.fn(async () => undefined),
    batchGenerateImages: vi.fn(async () => undefined),
    cancelAsset: vi.fn(async () => undefined),
    bindAudio: vi.fn(async () => undefined),
    pollPrompts: vi.fn(async () => []),
    pollImages: vi.fn(async () => []),
    pollAudio: vi.fn(async () => []),
    ...overrides,
  };
}

describe("React casting page", () => {
  beforeEach(() => vi.useRealTimers());
  afterEach(() => vi.useRealTimers());

  it("loads project assets, filters them, and submits prompt and image batches", async () => {
    const api = createFakeApi();
    render(<CastingPage projectId={42} imageModel="pancat:pancat-image" api={api} concurrentCount={3} />);

    expect(await screen.findByText("黛利拉")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("选择黛利拉"));
    fireEvent.change(screen.getByLabelText("追加提示"), { target: { value: "统一成电影概念图" } });
    fireEvent.click(screen.getByRole("button", { name: "批量润色提示词" }));

    await waitFor(() =>
      expect(api.batchPolish).toHaveBeenCalledWith({
        projectId: 42,
        items: [{ assetsId: 7, type: "role", name: "黛利拉", describe: "十四岁少女" }],
        concurrentCount: 3,
        otherTextPrompt: "统一成电影概念图",
      }),
    );

    fireEvent.click(screen.getByLabelText("选择黛利拉"));
    fireEvent.click(screen.getByRole("button", { name: "批量生成图片" }));

    await waitFor(() =>
      expect(api.batchGenerateImages).toHaveBeenCalledWith({
        projectId: 42,
        model: "pancat:pancat-image",
        resolution: "1K",
        concurrentCount: 3,
        items: [{ id: 7, type: "role", name: "黛利拉", prompt: "角色三视图" }],
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "场景" }));
    await waitFor(() => expect(api.listAssets).toHaveBeenLastCalledWith({ projectId: 42, types: ["scene"] }));
  });

  it("binds audio for selected assets and refreshes completed audio state by polling", async () => {
    vi.useFakeTimers();
    const api = createFakeApi({
      listAssets: vi.fn(async () => [role]),
      pollAudio: vi.fn(async () => [{ id: 7, audioBindState: "已完成" }]),
    });
    render(<CastingPage projectId={42} imageModel="pancat:pancat-image" api={api} pollIntervalMs={10} />);

    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText("黛利拉")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("选择黛利拉"));
    fireEvent.click(screen.getByRole("button", { name: "批量绑定音频" }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(api.bindAudio).toHaveBeenCalledWith({ projectId: 42, assetsIds: [7], concurrentCount: 2 });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(api.pollAudio).toHaveBeenCalledWith([7]);
    expect(screen.getByText("音频已完成")).toBeInTheDocument();
  });

  it("polls running image tasks and exposes cancellation", async () => {
    vi.useFakeTimers();
    const generating = { ...role, filePath: "", state: "生成中" };
    const api = createFakeApi({
      listAssets: vi.fn(async () => [generating]),
      pollImages: vi.fn(async () => [{ id: 7, state: "已完成", filePath: "https://example.com/final.png" }]),
    });
    const view = render(<CastingPage projectId={42} imageModel="pancat:pancat-image" api={api} pollIntervalMs={10} />);

    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText("黛利拉")).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(api.pollImages).toHaveBeenCalledWith([7]);
    expect(screen.getByRole("img", { name: "黛利拉" })).toHaveAttribute("src", "https://example.com/final.png");
    view.unmount();

    const stillGeneratingApi = createFakeApi({ listAssets: vi.fn(async () => [generating]) });
    render(<CastingPage projectId={42} imageModel="pancat:pancat-image" api={stillGeneratingApi} pollIntervalMs={10} />);
    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole("button", { name: "取消生成 黛利拉" }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(stillGeneratingApi.cancelAsset).toHaveBeenCalledWith({ projectId: 42, assetId: 7, types: [] });
  });

  it("cancels all selected running image tasks", async () => {
    const generating = { ...role, state: "生成中" };
    const api = createFakeApi({ listAssets: vi.fn(async () => [generating]) });
    render(<CastingPage projectId={42} imageModel="pancat:pancat-image" api={api} />);

    expect(await screen.findByText("黛利拉")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("选择黛利拉"));
    fireEvent.click(screen.getByRole("button", { name: "批量取消生成" }));

    await waitFor(() => expect(api.cancelAsset).toHaveBeenCalledWith({ projectId: 42, assetId: 7, types: [] }));
  });

  it("shows actionable failures and blocks image generation when a selected prompt is empty", async () => {
    const emptyPrompt = { ...role, prompt: "" };
    const api = createFakeApi({ listAssets: vi.fn(async () => [emptyPrompt]) });
    render(<CastingPage projectId={42} imageModel="pancat:pancat-image" api={api} />);

    expect(await screen.findByText("黛利拉")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("选择黛利拉"));
    fireEvent.click(screen.getByRole("button", { name: "批量生成图片" }));

    expect(screen.getByRole("alert")).toHaveTextContent("黛利拉还没有提示词");
    expect(api.batchGenerateImages).not.toHaveBeenCalled();
  });
});
