import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ProductionApi } from "./production-api";
import { ProductionFlowBoard } from "./production-flow-board";
import type { ProductionAsset, ProductionFlowData, StoryboardItem } from "./types";

function asset(index: number): ProductionAsset {
  return {
    id: index,
    name: `资产 ${index}`,
    type: "role",
    prompt: `资产提示词 ${index}`,
    desc: `资产描述 ${index}`,
    src: `https://example.test/asset-${index}.jpg`,
    state: "completed",
    errorReason: "",
    derive: [
      {
        id: 1000 + index,
        assetsId: index,
        name: `衍生 ${index}`,
        type: "role",
        prompt: `衍生提示词 ${index}`,
        desc: `衍生描述 ${index}`,
        src: `https://example.test/derive-${index}.jpg`,
        state: "completed",
        errorReason: "",
      },
    ],
  };
}

function storyboard(index: number): StoryboardItem {
  return {
    id: 2000 + index,
    index,
    prompt: `分镜 ${index}`,
    videoDesc: `镜头 ${index}`,
    src: `https://example.test/storyboard-${index}.jpg`,
    state: "completed",
    errorReason: "",
  };
}

function flowData(assetCount = 13, storyboardCount = 25): ProductionFlowData {
  return {
    script: "# 原文",
    scriptPlan: "# 拍摄计划",
    storyboardTable: "| 镜头 | 景别 |\n| --- | --- |\n| 1 | 远景 |",
    assets: Array.from({ length: assetCount }, (_, index) => asset(index + 1)),
    storyboard: Array.from({ length: storyboardCount }, (_, index) => storyboard(index)),
    workbench: { cover: "https://example.test/workbench.jpg", gradient: "linear-gradient(#111,#333)" },
  };
}

function api() {
  return { saveFlowData: vi.fn(async () => undefined) } as unknown as ProductionApi;
}

describe("upstream production node parity", () => {
  beforeEach(() => localStorage.clear());

  it("keeps every asset row in the natural canvas flow with 200px original and derived cards", () => {
    render(<ProductionFlowBoard api={api()} projectId={7} scriptId={12} initialData={flowData()} />);

    const assets = screen.getByTestId("flow-node-assets");
    expect(within(assets).queryByText(/显示更多资产/)).not.toBeInTheDocument();
    expect(within(assets).getByText("资产 13")).toBeInTheDocument();
    expect(within(assets).getAllByTestId("asset-row")).toHaveLength(13);
    expect(within(assets).getAllByTestId("original-asset-card")[0]).toHaveClass("w-[200px]");
    expect(within(assets).getByTestId("derived-asset-1001")).toHaveClass("w-[200px]");
  });

  it("matches the upstream storyboard square grid and original control order without pagination", () => {
    render(<ProductionFlowBoard api={api()} projectId={7} scriptId={12} initialData={flowData()} />);

    const node = screen.getByTestId("flow-node-storyboard");
    expect(within(node).queryByText(/显示更多分镜/)).not.toBeInTheDocument();
    expect(within(node).getAllByTestId(/canvas-storyboard-/)).toHaveLength(25);
    expect(within(node).getByTestId("storyboard-frame-image-2000")).toHaveStyle({ width: "200px", height: "200px" });

    const scale = within(node).getByLabelText("分镜缩放比例");
    expect(scale).toHaveAttribute("type", "number");
    expect(scale).toHaveAttribute("min", "0.1");
    expect(scale).toHaveAttribute("max", "3");
    expect(scale).toHaveAttribute("step", "0.1");

    const controls = within(node).getByTestId("storyboard-selection-controls");
    expect(Array.from(controls.querySelectorAll("button")).map((button) => button.textContent)).toEqual(["取消选择", "全选", "批量删除"]);
    const actions = within(node).getByTestId("storyboard-primary-actions");
    expect(Array.from(actions.querySelectorAll("button")).map((button) => button.textContent)).toEqual(["宫格预览", "生成分镜图"]);
  });

  it("keeps the complete upstream image tools and previews the original URL without query parameters", () => {
    const data = flowData(1, 1);
    data.storyboard[0]!.src = "https://example.test/storyboard-original.jpg?token=temporary";
    render(<ProductionFlowBoard api={api()} projectId={7} scriptId={12} initialData={data} />);

    expect(screen.getByRole("button", { name: "复制分镜 2000" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "预览分镜 2000" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "下载分镜 2000" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "预览分镜 2000" }));
    const preview = screen.getByRole("dialog", { name: "预览 分镜 2000" });
    expect(within(preview).getByAltText("预览 分镜 2000")).toHaveAttribute("src", "https://example.test/storyboard-original.jpg");
    fireEvent.click(within(preview).getByRole("button", { name: "关闭预览" }));
    expect(screen.queryByRole("dialog", { name: "预览 分镜 2000" })).not.toBeInTheDocument();
  });

  it("scales the checkbox, delete, edit and image tools with a shrunken frame and caps overlays at their original size", () => {
    render(<ProductionFlowBoard api={api()} projectId={7} scriptId={12} initialData={flowData(0, 1)} />);

    const frame = screen.getByTestId("storyboard-frame-image-2000");
    const scale = screen.getByLabelText("分镜缩放比例");
    fireEvent.change(scale, { target: { value: "0.5" } });

    expect(frame).toHaveStyle({ width: "100px", height: "100px" });
    expect(screen.getByLabelText("选择分镜 2000").closest("label")).toHaveStyle({ transform: "scale(0.5)", transformOrigin: "top left" });
    expect(screen.getByRole("button", { name: "删除分镜 2000" })).toHaveStyle({ transform: "scale(0.5)", transformOrigin: "top right" });
    expect(screen.getByRole("button", { name: "编辑分镜信息 2000" })).toHaveStyle({ transform: "scale(0.5)", transformOrigin: "bottom left" });
    expect(screen.getByTestId("image-tools-分镜 2000")).toHaveStyle({ transform: "scale(0.5)", transformOrigin: "bottom right" });

    fireEvent.change(scale, { target: { value: "2" } });
    expect(frame).toHaveStyle({ width: "400px", height: "400px" });
    expect(screen.getByTestId("image-tools-分镜 2000")).toHaveStyle({ transform: "scale(1)" });
  });

  it("opens the workbench from the whole upstream card and has no invented copy or action button", () => {
    const onOpenWorkbench = vi.fn();
    render(<ProductionFlowBoard api={api()} projectId={7} scriptId={12} initialData={flowData(0, 1)} onOpenWorkbench={onOpenWorkbench} />);

    const workbench = screen.getByTestId("flow-node-workbench");
    expect(workbench).toHaveClass("min-w-[280px]");
    expect(within(workbench).queryByText("进入生成与合成工作台")).not.toBeInTheDocument();
    expect(within(workbench).queryByRole("button", { name: "打开工作台" })).not.toBeInTheDocument();
    fireEvent.click(workbench);
    expect(onOpenWorkbench).toHaveBeenCalledOnce();
  });

  it("removes the React-only node id badges and blue marker dots", () => {
    render(<ProductionFlowBoard api={api()} projectId={7} scriptId={12} initialData={flowData(0, 0)} />);

    expect(screen.queryByTestId("production-node-id-badge")).not.toBeInTheDocument();
    expect(screen.queryByTestId("production-node-marker-dot")).not.toBeInTheDocument();
  });
});
