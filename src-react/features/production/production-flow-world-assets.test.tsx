import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ProductionApi } from "./production-api";
import { ProductionFlowBoard } from "./production-flow-board";
import type { ProductionFlowData } from "./types";

function flowData(): ProductionFlowData {
  return {
    source: { chapters: [], state: "completed" },
    script: "医院故事",
    scriptPlan: "低机位推进",
    assets: [
      {
        id: 10,
        name: "医院大厅",
        type: "scene",
        prompt: "废弃医院大厅",
        desc: "雨夜主场景",
        src: "https://example.test/lobby.jpg",
        state: "completed",
        errorReason: "",
        derive: [],
      },
    ],
    worldAssets: [
      {
        id: 81,
        projectId: 7,
        sourceSceneAssetId: 10,
        storyboardId: 31,
        provider: "worldlabs-marble",
        providerWorldId: "world-lobby",
        model: "marble-1.1",
        status: "succeeded",
        prompt: "废弃医院大厅",
        displayName: "医院大厅",
        worldJobId: "job-81",
        panoramaUrl: "https://example.test/lobby-pano.jpg",
        colliderMeshUrl: "https://example.test/lobby.glb",
        spzUrls: {
          "500k": "https://example.test/lobby-500k.spz",
          full_res: "https://example.test/lobby-full.spz",
        },
        thumbnailUrl: "https://example.test/lobby-thumb.jpg",
        caption: "废弃医院大厅",
        semantics: { metricScaleFactor: 1.4, groundPlaneOffset: -0.25 },
        error: "",
        createdAt: "2026-07-27T01:00:00.000Z",
        updatedAt: "2026-07-27T01:00:00.000Z",
      },
    ],
    storyboardTable: "| S01 | 医院大厅 |",
    storyboard: [
      {
        id: 31,
        index: 0,
        prompt: "进入医院",
        videoDesc: "推进",
        src: "",
        state: "idle",
        errorReason: "",
        associateAssetsIds: [10],
      },
    ],
    videoTracks: [],
    timeline: { id: null, revision: 0, status: "idle", clips: [], errorReason: "", updatedAt: null },
    finalOutputs: [],
  };
}

describe("production Marble scene asset node", () => {
  it("shows the reusable SPZ and collider outputs on the existing production canvas", () => {
    render(
      <ProductionFlowBoard
        api={{ saveFlowData: vi.fn(async () => undefined) } as unknown as ProductionApi}
        projectId={7}
        scriptId={12}
        initialData={flowData()}
      />,
    );

    const node = screen.getByTestId("flow-node-worldAssets");
    expect(within(node).getByText("三维场景资产")).toBeInTheDocument();
    expect(within(node).getByText("医院大厅")).toBeInTheDocument();
    expect(within(node).getByText("SPZ 500k · 完整精度")).toBeInTheDocument();
    expect(within(node).getByText("碰撞网格可用")).toBeInTheDocument();
    expect(screen.getByTestId("stage-status-worldAssets")).toHaveTextContent("已完成");
  });

  it("opens the scene's director desk without creating another canvas", () => {
    const onOpenDirectorDesk = vi.fn();
    render(
      <ProductionFlowBoard
        api={{ saveFlowData: vi.fn(async () => undefined) } as unknown as ProductionApi}
        projectId={7}
        scriptId={12}
        initialData={flowData()}
        onOpenDirectorDesk={onOpenDirectorDesk}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "在导演台打开三维场景 医院大厅" }));
    expect(onOpenDirectorDesk).toHaveBeenCalledWith(31);
  });
});
