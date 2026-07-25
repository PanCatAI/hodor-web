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
});
