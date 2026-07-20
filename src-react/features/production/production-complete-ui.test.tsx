import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import React from "react";

import type { ProductionApi } from "./production-api";
import { ImageFlowEditor } from "./image-flow-editor";
import { ProductionFlowBoard } from "./production-flow-board";
import { readWebAvOutput, WebAvVideoEditor } from "./webav-video-editor";
import type { ProductionFlowData } from "./types";

beforeAll(() => {
  Object.defineProperties(Range.prototype, {
    getClientRects: {
      configurable: true,
      value: () => [],
    },
    getBoundingClientRect: {
      configurable: true,
      value: () => ({ bottom: 0, height: 0, left: 0, right: 0, top: 0, width: 0, x: 0, y: 0, toJSON: () => ({}) }),
    },
  });
});

function flowData(): ProductionFlowData {
  return {
    script: "雨夜，角色推门。",
    scriptPlan: "先远后近",
    storyboardTable: "| 镜头 | 景别 |",
    assets: [
      {
        id: 3,
        name: "黛利拉",
        type: "role",
        prompt: "",
        desc: "女主角",
        src: "",
        state: "completed",
        errorReason: "",
        derive: [
          {
            id: 41,
            assetsId: 3,
            name: "雨衣造型",
            type: "role",
            prompt: "黄色雨衣",
            desc: "雨夜服装",
            src: "",
            state: "failed",
            errorReason: "审核失败",
          },
        ],
      },
    ],
    storyboard: [{ id: 31, index: 0, prompt: "医院远景", videoDesc: "推进", src: "", state: "idle", errorReason: "" }],
  };
}

describe("complete production UI", () => {
  it("edits and immediately saves flow text while keeping deterministic node layout", async () => {
    const user = userEvent.setup();
    const api = { saveFlowData: vi.fn(async () => undefined) } as unknown as ProductionApi;
    render(<ProductionFlowBoard api={api} projectId={7} scriptId={12} initialData={flowData()} />);

    expect(screen.getByTestId("flow-node-script")).toHaveAttribute("data-x", "0");
    fireEvent.click(screen.getByRole("button", { name: "编辑导演计划" }));
    const editor = screen.getByRole("dialog", { name: "编辑导演计划" });
    const textbox = within(editor).getByRole("textbox");
    await user.click(textbox);
    await user.keyboard("{Control>}a{/Control}低机位推进");
    fireEvent.click(within(editor).getByRole("button", { name: "保存" }));
    fireEvent.click(screen.getByRole("button", { name: "自动布局" }));
    fireEvent.dragEnd(screen.getByTestId("flow-node-script"), { clientX: 640, clientY: 320 });

    await waitFor(() => expect(api.saveFlowData).toHaveBeenCalledOnce());
    expect(api.saveFlowData).toHaveBeenCalledWith(7, 12, expect.objectContaining({ scriptPlan: "低机位推进" }));
  });

  it("opens a failed derived asset from the whole upstream card and exposes its backend failure", async () => {
    const api = {
      saveFlowData: vi.fn(async () => undefined),
      generateDerivedAssets: vi.fn(async () => undefined),
      pollDerivedAssets: vi.fn(async () => [
        {
          id: 41,
          assetsId: 3,
          name: "雨衣造型",
          type: "role",
          prompt: "黄色雨衣",
          desc: "雨夜服装",
          src: "",
          state: "failed",
          errorReason: "真人审核失败",
        },
      ]),
      deleteDerivedAsset: vi.fn(async () => undefined),
    } as unknown as ProductionApi;
    render(<ProductionFlowBoard api={api} projectId={7} scriptId={12} initialData={flowData()} pollIntervalMs={5} />);

    expect(screen.getByText("生成失败")).toHaveAttribute("title", "审核失败");
    fireEvent.click(screen.getByRole("button", { name: "编辑衍生资产 雨衣造型" }));
    expect(screen.getByRole("dialog", { name: "图片工作流" })).toBeInTheDocument();
  });

  it("opens a derived asset image workflow and writes the adopted result back", async () => {
    const api = {
      saveFlowData: vi.fn(async () => undefined),
      generateDerivedAssets: vi.fn(async () => undefined),
      pollDerivedAssets: vi.fn(async () => []),
      deleteDerivedAsset: vi.fn(async () => undefined),
      generateFlowImage: vi.fn(async () => "https://example.test/asset-result.jpg"),
      saveImageFlow: vi.fn(async () => 66),
      updateImageFlow: vi.fn(async () => undefined),
      updateAssetImage: vi.fn(async () => undefined),
    } as unknown as ProductionApi;
    render(<ProductionFlowBoard api={api} projectId={7} scriptId={12} imageModel="pancat:pancat-image" initialData={flowData()} />);

    fireEvent.click(screen.getByRole("button", { name: "编辑衍生资产 雨衣造型" }));
    expect(screen.getByRole("dialog", { name: "图片工作流" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "生成工作流图片" }));
    expect(await screen.findByAltText("工作流生成结果")).toHaveAttribute("src", "https://example.test/asset-result.jpg");
    fireEvent.click(screen.getByRole("button", { name: "采用并保存" }));

    await waitFor(() => expect(api.updateAssetImage).toHaveBeenCalledWith(41, "https://example.test/asset-result.jpg", 66));
    expect(screen.queryByRole("dialog", { name: "图片工作流" })).not.toBeInTheDocument();
  });

  it("creates, connects, generates and persists an image flow", async () => {
    const api = {
      getImageFlow: vi.fn(async () => null),
      generateFlowImage: vi.fn(async () => "https://example.test/generated.jpg"),
      saveImageFlow: vi.fn(async () => 66),
      updateImageFlow: vi.fn(async () => undefined),
      updateStoryboardImage: vi.fn(async () => undefined),
    } as unknown as ProductionApi;
    const onClose = vi.fn();
    render(
      <ImageFlowEditor
        api={api}
        projectId={7}
        scriptId={12}
        storyboard={{
          id: 31,
          index: 0,
          prompt: "医院远景",
          videoDesc: "推进",
          src: "https://example.test/ref.jpg",
          state: "completed",
          errorReason: "",
        }}
        imageModel="pancat:pancat-image"
        onClose={onClose}
        onSaved={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "新增生成节点" }));
    const prompts = screen.getAllByLabelText("生成提示词");
    fireEvent.change(prompts[prompts.length - 1], { target: { value: "雨夜医院远景" } });
    const generateButtons = screen.getAllByRole("button", { name: "生成工作流图片" });
    fireEvent.click(generateButtons[generateButtons.length - 1]);
    expect(await screen.findByAltText("工作流生成结果")).toHaveAttribute("src", "https://example.test/generated.jpg");
    fireEvent.click(screen.getByRole("button", { name: "采用并保存" }));

    await waitFor(() => expect(api.saveImageFlow).toHaveBeenCalledOnce());
    expect(api.updateStoryboardImage).toHaveBeenCalledWith(31, "https://example.test/generated.jpg", 66);
    expect(onClose).toHaveBeenCalled();
  });

  it("provides a runnable timeline with preview, ordering and downloads", () => {
    const createObjectURL = vi.fn(() => "blob:rendered");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });
    render(
      <WebAvVideoEditor
        clips={[
          { id: 91, src: "https://example.test/a.mp4", state: "completed", errorReason: "" },
          { id: 92, src: "https://example.test/b.mp4", state: "completed", errorReason: "" },
        ]}
      />,
    );

    expect(screen.getByLabelText("视频编辑预览")).toHaveAttribute("src", "https://example.test/a.mp4");
    fireEvent.click(screen.getByRole("button", { name: "下移片段 91" }));
    expect(screen.getByLabelText("视频编辑预览")).toHaveAttribute("src", "https://example.test/b.mp4");
    expect(screen.getByRole("link", { name: "下载当前片段" })).toHaveAttribute("href", "https://example.test/b.mp4");
  });

  it("collects the WebAV compositor stream into an mp4 blob", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2]));
        controller.enqueue(new Uint8Array([3, 4]));
        controller.close();
      },
    });

    const blob = await readWebAvOutput(stream);

    expect(blob.type).toBe("video/mp4");
    expect(blob.size).toBe(4);
  });
});
