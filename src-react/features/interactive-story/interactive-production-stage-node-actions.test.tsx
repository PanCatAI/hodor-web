import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ReactFlowProvider, type NodeProps } from "@xyflow/react";
import { describe, expect, it, vi } from "vitest";

import { InteractiveProductionStageNode, type InteractiveProductionStageNodeData } from "./interactive-production-stage-node";

describe("interactive spatial stage node actions", () => {
  it("retries only its own stage from the canvas card", async () => {
    const onRetryStage = vi.fn(async () => undefined);
    const data: InteractiveProductionStageNodeData = {
      storyNodeId: "scene-1",
      storyTitle: "锁住的房间",
      stage: "marbleWorld",
      flow: { script: "", scriptPlan: "", assets: [], storyboardTable: "", storyboard: [], worldAssets: [] },
      onOpenStage: vi.fn(),
      onRetryStage,
    };

    render(
      <ReactFlowProvider>
        <InteractiveProductionStageNode {...({ id: "scene-1::marbleWorld", data } as unknown as NodeProps)} />
      </ReactFlowProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "启动或恢复Marble 世界" }));

    await waitFor(() => expect(onRetryStage).toHaveBeenCalledWith("scene-1", "marbleWorld"));
    expect(screen.getByRole("button", { name: "启动或恢复Marble 世界" })).toBeEnabled();
  });
});
