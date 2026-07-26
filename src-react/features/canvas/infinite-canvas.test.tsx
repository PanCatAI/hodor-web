import { fireEvent, render, screen } from "@testing-library/react";
import type { Node } from "@xyflow/react";
import { describe, expect, it, vi } from "vitest";

import { InfiniteCanvas } from "./infinite-canvas";

describe("InfiniteCanvas", () => {
  it("保留 production 画布的自动布局、背景与控制器入口", () => {
    const onAutoLayout = vi.fn();
    const nodes: Node[] = [
      {
        id: "node-1",
        position: { x: 0, y: 0 },
        data: { label: "序幕" },
      },
    ];

    render(
      <div style={{ width: 900, height: 600 }}>
        <InfiniteCanvas
          nodes={nodes}
          edges={[]}
          onNodesChange={() => undefined}
          onAutoLayout={onAutoLayout}
          ariaLabel="互动剧情画布"
          testId="interactive-story-infinite-canvas"
        />
      </div>,
    );

    expect(screen.getByTestId("interactive-story-infinite-canvas")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "自动布局" }));
    expect(onAutoLayout).toHaveBeenCalledTimes(1);
  });

  it("提供节点查找、全图概览、位置撤销与重做入口", () => {
    const onUndo = vi.fn();
    const onRedo = vi.fn();
    const nodes: Node[] = [
      {
        id: "storyboard",
        position: { x: 0, y: 0 },
        data: { label: "分镜面板" },
      },
    ];

    render(
      <div style={{ width: 900, height: 600 }}>
        <InfiniteCanvas
          nodes={nodes}
          edges={[]}
          onNodesChange={() => undefined}
          ariaLabel="生产画布"
          testId="production-infinite-canvas"
          getNodeLabel={(node) => String(node.data.label)}
          canUndo
          canRedo
          onUndo={onUndo}
          onRedo={onRedo}
          showMiniMap
        />
      </div>,
    );

    expect(screen.getByTestId("canvas-minimap")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "概览全图" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "查找节点" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "查找画布节点" }), { target: { value: "分镜" } });
    expect(screen.getByRole("button", { name: "定位到 分镜面板" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "撤销位置" }));
    fireEvent.click(screen.getByRole("button", { name: "重做位置" }));
    expect(onUndo).toHaveBeenCalledOnce();
    expect(onRedo).toHaveBeenCalledOnce();

    fireEvent.keyDown(document, { key: "z", metaKey: true });
    fireEvent.keyDown(document, { key: "z", metaKey: true, shiftKey: true });
    expect(onUndo).toHaveBeenCalledTimes(2);
    expect(onRedo).toHaveBeenCalledTimes(2);
  });
});
