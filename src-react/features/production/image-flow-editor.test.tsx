import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ProductionApi } from "./production-api";
import { ImageFlowEditor } from "./image-flow-editor";
import type { DerivedAsset, ImageFlowData, StoryboardItem } from "./types";

const storyboard: StoryboardItem = {
  id: 31,
  index: 0,
  prompt: "医院远景",
  videoDesc: "推进",
  src: "https://example.test/storyboard.jpg",
  state: "completed",
  errorReason: "",
  flowId: 45,
};

const asset: DerivedAsset = {
  id: 81,
  assetsId: 7,
  name: "雨衣造型",
  type: "role",
  prompt: "黄色雨衣",
  desc: "雨夜造型",
  src: "https://example.test/asset.jpg",
  state: "completed",
  errorReason: "",
  flowId: 46,
};

function graph(): ImageFlowData {
  return {
    id: 45,
    nodes: [
      { id: "upload-a", type: "upload", position: { x: 120, y: 140 }, data: { image: "https://example.test/a.jpg" } },
      { id: "upload-b", type: "upload", position: { x: 120, y: 540 }, data: { image: "https://example.test/b.jpg" } },
      {
        id: "generated-a",
        type: "generated",
        position: { x: 620, y: 180 },
        data: {
          generatedImage: "https://example.test/result-a.jpg",
          prompt: "初始提示",
          model: "pancat:pancat-image",
          quality: "1K",
          ratio: "16:9",
          references: [{ image: "stale-reference" }],
        },
      },
      {
        id: "generated-b",
        type: "generated",
        position: { x: 620, y: 620 },
        data: {
          generatedImage: "https://example.test/result-b.jpg",
          prompt: "第二结果",
          model: "pancat:pancat-image",
          quality: "1K",
          ratio: "16:9",
          references: [],
        },
      },
    ],
    edges: [{ id: "edge-only", source: "upload-a", target: "generated-a" }],
  };
}

function apiFor(data: ImageFlowData | null = graph()) {
  return {
    getImageFlow: vi.fn(async () => data),
    saveImageFlow: vi.fn(async () => 99),
    updateImageFlow: vi.fn(async () => undefined),
    uploadFlowImage: vi.fn(async () => "https://example.test/uploaded.jpg"),
    generateFlowImage: vi.fn(async () => "https://example.test/generated.jpg"),
    updateStoryboardImage: vi.fn(async () => undefined),
  } as unknown as ProductionApi;
}

describe("ImageFlowEditor graph contract", () => {
  it("connects the target image only when creating a new flow", async () => {
    const api = apiFor(null);
    const newStoryboard = { ...storyboard, flowId: undefined };
    render(
      <ImageFlowEditor
        api={api}
        projectId={7}
        scriptId={12}
        storyboard={newStoryboard}
        imageModel="pancat:pancat-image"
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "生成工作流图片" }));

    await waitFor(() => expect(api.generateFlowImage).toHaveBeenCalledOnce());
    expect(api.generateFlowImage).toHaveBeenCalledWith(expect.objectContaining({ references: ["https://example.test/storyboard.jpg"] }));
  });

  it("preserves server positions and only the server edges when saving", async () => {
    const api = apiFor();
    render(
      <ImageFlowEditor
        api={api}
        projectId={7}
        scriptId={12}
        storyboard={storyboard}
        imageModel="pancat:pancat-image"
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    await screen.findByTestId("image-flow-node-upload-a");
    fireEvent.click(screen.getByRole("button", { name: "保存工作流" }));

    await waitFor(() => expect(api.updateImageFlow).toHaveBeenCalledOnce());
    expect(api.updateImageFlow).toHaveBeenCalledWith(
      45,
      expect.objectContaining({
        nodes: expect.arrayContaining([
          expect.objectContaining({ id: "upload-a", position: { x: 120, y: 140 } }),
          expect.objectContaining({ id: "upload-b", position: { x: 120, y: 540 } }),
        ]),
        edges: [{ id: "edge-only", source: "upload-a", target: "generated-a" }],
      }),
    );
  });

  it("creates and disconnects one explicit edge without changing the other graph", async () => {
    const data = graph();
    data.edges = [];
    const api = apiFor(data);
    render(
      <ImageFlowEditor
        api={api}
        projectId={7}
        scriptId={12}
        storyboard={storyboard}
        imageModel="pancat:pancat-image"
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    await screen.findByTestId("image-flow-node-upload-a");
    fireEvent.click(screen.getByRole("button", { name: "从 upload-a 开始连线" }));
    fireEvent.click(screen.getByRole("button", { name: "连接到 generated-a" }));
    expect(screen.getByRole("button", { name: "断开 upload-a 到 generated-a" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "保存工作流" }));
    await waitFor(() => expect(api.updateImageFlow).toHaveBeenCalledOnce());
    expect(vi.mocked(api.updateImageFlow).mock.calls[0]?.[1].edges).toEqual([expect.objectContaining({ source: "upload-a", target: "generated-a" })]);

    fireEvent.click(screen.getByRole("button", { name: "断开 upload-a 到 generated-a" }));
    fireEvent.click(screen.getByRole("button", { name: "保存工作流" }));
    await waitFor(() => expect(api.updateImageFlow).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.updateImageFlow).mock.calls[1]?.[1].edges).toEqual([]);
  });

  it("persists a dragged node position", async () => {
    const api = apiFor();
    render(
      <ImageFlowEditor
        api={api}
        projectId={7}
        scriptId={12}
        storyboard={storyboard}
        imageModel="pancat:pancat-image"
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    const node = await screen.findByTestId("image-flow-node-upload-a");
    const handle = within(node).getByRole("button", { name: "拖动节点 upload-a" });
    fireEvent(handle, new MouseEvent("pointerdown", { bubbles: true, clientX: 20, clientY: 20 }));
    fireEvent(window, new MouseEvent("pointermove", { bubbles: true, clientX: 100, clientY: 80 }));
    fireEvent(window, new MouseEvent("pointerup", { bubbles: true, clientX: 100, clientY: 80 }));
    fireEvent.click(screen.getByRole("button", { name: "保存工作流" }));

    await waitFor(() => expect(api.updateImageFlow).toHaveBeenCalledOnce());
    const saved = vi.mocked(api.updateImageFlow).mock.calls[0]?.[1];
    expect(saved.nodes.find((item) => item.id === "upload-a")?.position).toEqual({ x: 200, y: 200 });
  });

  it("lays out the graph in topological columns before saving", async () => {
    const api = apiFor();
    render(
      <ImageFlowEditor
        api={api}
        projectId={7}
        scriptId={12}
        storyboard={storyboard}
        imageModel="pancat:pancat-image"
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    await screen.findByTestId("image-flow-node-upload-a");
    fireEvent.click(screen.getByRole("button", { name: "自动布局" }));
    fireEvent.click(screen.getByRole("button", { name: "保存工作流" }));

    await waitFor(() => expect(api.updateImageFlow).toHaveBeenCalledOnce());
    const saved = vi.mocked(api.updateImageFlow).mock.calls[0]?.[1];
    expect(saved.nodes.find((item) => item.id === "upload-a")?.position.x).toBe(100);
    expect(saved.nodes.find((item) => item.id === "generated-a")?.position.x).toBe(600);
  });

  it("generates with references derived from the selected incoming edge", async () => {
    const api = apiFor();
    render(
      <ImageFlowEditor
        api={api}
        projectId={7}
        scriptId={12}
        storyboard={storyboard}
        imageModel="pancat:pancat-image"
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    const generated = await screen.findByTestId("image-flow-node-generated-a");
    fireEvent.click(within(generated).getByRole("button", { name: "生成工作流图片" }));

    await waitFor(() => expect(api.generateFlowImage).toHaveBeenCalledOnce());
    expect(api.generateFlowImage).toHaveBeenCalledWith(expect.objectContaining({ references: ["https://example.test/a.jpg"] }));
  });

  it("lets an asset consumer choose a result without writing a storyboard", async () => {
    const data = graph();
    data.id = 46;
    const api = apiFor(data);
    const onSaved = vi.fn();
    render(
      <ImageFlowEditor
        api={api}
        projectId={7}
        scriptId={12}
        targetKind="asset"
        asset={asset}
        imageModel="pancat:pancat-image"
        onClose={vi.fn()}
        onSaved={onSaved}
      />,
    );

    await screen.findByTestId("image-flow-node-generated-a");
    fireEvent.click(screen.getByRole("button", { name: "选择结果 generated-a" }));
    fireEvent.click(screen.getByRole("button", { name: "采用并保存" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith("https://example.test/result-a.jpg", 46));
    expect(api.updateStoryboardImage).not.toHaveBeenCalled();
  });

  it("keeps the editor open when the external asset write-back fails", async () => {
    const data = graph();
    data.id = 46;
    const api = apiFor(data);
    const onClose = vi.fn();
    render(
      <ImageFlowEditor
        api={api}
        projectId={7}
        scriptId={12}
        targetKind="asset"
        asset={asset}
        imageModel="pancat:pancat-image"
        onClose={onClose}
        onSaved={vi.fn(async () => {
          throw new Error("资产回写失败");
        })}
      />,
    );

    await screen.findByTestId("image-flow-node-generated-a");
    fireEvent.click(screen.getByRole("button", { name: "采用并保存" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("资产回写失败");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("uploads a local image as a new source node", async () => {
    const api = apiFor();
    render(
      <ImageFlowEditor
        api={api}
        projectId={7}
        scriptId={12}
        storyboard={storyboard}
        imageModel="pancat:pancat-image"
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    await screen.findByTestId("image-flow-node-upload-a");
    const file = new File(["image"], "reference.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("上传参考图"), { target: { files: [file] } });

    await waitFor(() => expect(api.uploadFlowImage).toHaveBeenCalledOnce());
    expect(await screen.findByAltText("工作流参考图 https://example.test/uploaded.jpg")).toBeInTheDocument();
  });

  it("saves an existing graph before closing the editor", async () => {
    const api = apiFor();
    const onClose = vi.fn();
    render(
      <ImageFlowEditor
        api={api}
        projectId={7}
        scriptId={12}
        storyboard={storyboard}
        imageModel="pancat:pancat-image"
        onClose={onClose}
        onSaved={vi.fn()}
      />,
    );

    await screen.findByTestId("image-flow-node-generated-a");
    fireEvent.click(screen.getByRole("button", { name: "关闭图片工作流" }));

    await waitFor(() => expect(api.updateImageFlow).toHaveBeenCalledOnce());
    expect(onClose).toHaveBeenCalledOnce();
  });
});
