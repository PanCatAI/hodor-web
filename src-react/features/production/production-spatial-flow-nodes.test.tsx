import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ProductionFlowBoard } from "./production-flow-board";
import type { ProductionApi } from "./production-api";
import type { CinematicCoverageAggregate, ProductionFlowData, ProductionGenerationData } from "./types";

const flow: ProductionFlowData = {
  script: "INT. ROOM",
  scriptPlan: "",
  storyboardTable: "",
  storyboard: [],
  assets: [{
    id: 1,
    name: "房间",
    type: "scene",
    prompt: "",
    desc: "",
    src: "",
    state: "failed",
    errorReason: "场景母版审核失败",
    derive: [],
  }],
  worldAssets: [],
  previsRenders: [],
};

const generation: ProductionGenerationData = {
  storyboardList: [],
  trackList: [{
    id: 71,
    prompt: "",
    state: "failed",
    errorReason: "正式视频额度不足",
    duration: 5,
    medias: [],
    videoList: [{ id: 91, src: "", state: "failed", errorReason: "正式视频额度不足" }],
  }],
};

const failedCoverage = {
  coverageId: "coverage-12",
  version: 1,
  status: "failed",
  plan: {
    cameras: [],
    blocking: { actorAnchors: [], beats: [] },
  },
  bundle: null,
  recommendedCut: null,
  error: { message: "机位越过动作轴" },
} as unknown as CinematicCoverageAggregate;

describe("linear spatial production nodes", () => {
  it("renders every fixed stage and keeps API blockers on their own nodes", async () => {
    const api = {
      saveFlowData: vi.fn(async () => undefined),
      listCoverage: vi.fn(async () => [failedCoverage]),
    } as unknown as ProductionApi;

    render(
      <ProductionFlowBoard
        api={api}
        projectId={7}
        scriptId={12}
        initialData={flow}
        generationData={generation}
      />,
    );

    for (const id of ["sceneMaster", "marbleWorld", "spatialRegistration", "blocking", "coverage", "previs", "previsValidation", "formalGeneration", "multicamEdit"]) {
      expect(screen.getByTestId(`flow-node-${id}`)).toBeInTheDocument();
    }
    expect(within(screen.getByTestId("flow-node-sceneMaster")).getByRole("alert")).toHaveTextContent("场景母版审核失败");
    expect(within(screen.getByTestId("flow-node-marbleWorld")).getByRole("alert")).toHaveTextContent("等待场景母版");
    await waitFor(() => expect(api.listCoverage).toHaveBeenCalledWith(7, 12));
    await waitFor(() =>
      expect(within(screen.getByTestId("flow-node-coverage")).getByRole("alert")).toHaveTextContent("机位越过动作轴"),
    );
    expect(within(screen.getByTestId("flow-node-formalGeneration")).getByRole("alert")).toHaveTextContent("正式视频额度不足");
  });

  it("retries one failed node and preserves its canvas position", async () => {
    const refreshedFlow = { ...flow, assets: [] };
    const api = {
      saveFlowData: vi.fn(async () => undefined),
      startSpatialPipeline: vi.fn(async () => ({ accepted: true, currentStage: "sceneMaster" })),
      generateDerivedAssets: vi.fn(async () => undefined),
      getFlowData: vi.fn(async () => refreshedFlow),
      getGenerationData: vi.fn(async () => generation),
      listCoverage: vi.fn(async () => []),
    } as unknown as ProductionApi;

    render(<ProductionFlowBoard api={api} projectId={7} scriptId={12} initialData={flow} generationData={generation} />);
    const node = screen.getByTestId("flow-node-sceneMaster");
    const position = { x: node.getAttribute("data-x"), y: node.getAttribute("data-y") };
    fireEvent.click(within(node).getByRole("button", { name: "启动或恢复场景母版" }));

    await waitFor(() => expect(api.startSpatialPipeline).toHaveBeenCalledWith(12, expect.stringContaining("场景母版")));
    expect(api.generateDerivedAssets).not.toHaveBeenCalled();
    expect(screen.getByTestId("flow-node-sceneMaster")).toHaveAttribute("data-x", position.x);
    expect(screen.getByTestId("flow-node-sceneMaster")).toHaveAttribute("data-y", position.y);
  });

  it("starts Marble from its node without moving the linear canvas", async () => {
    const marbleFlow: ProductionFlowData = {
      ...flow,
      assets: [{
        id: 11, name: "医院大厅", type: "scene", prompt: "雨夜医院大厅", desc: "", src: "https://example.test/hall.jpg", state: "completed", errorReason: "", derive: [],
      }],
      storyboard: [{ id: 31, index: 0, prompt: "推门", videoDesc: "", src: "", state: "idle", errorReason: "", associateAssetsIds: [11] }],
    };
    const api = {
      saveFlowData: vi.fn(async () => undefined),
      startSpatialPipeline: vi.fn(async () => ({ accepted: true, currentStage: "marbleWorld" })),
      startMarbleWorld: vi.fn(async () => ({ jobId: "job-81" })),
      getFlowData: vi.fn(async () => marbleFlow),
      getGenerationData: vi.fn(async () => generation),
      listCoverage: vi.fn(async () => []),
    } as unknown as ProductionApi;

    render(<ProductionFlowBoard api={api} projectId={7} scriptId={12} initialData={marbleFlow} generationData={generation} />);
    const node = screen.getByTestId("flow-node-marbleWorld");
    const position = { x: node.getAttribute("data-x"), y: node.getAttribute("data-y") };
    fireEvent.click(within(node).getByRole("button", { name: "启动或恢复Marble 世界" }));

    await waitFor(() => expect(api.startMarbleWorld).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 7,
      storyboardId: 31,
      sourceSceneAssetId: 11,
    })));
    expect(api.startSpatialPipeline).toHaveBeenCalledWith(12, expect.stringContaining("Marble 世界"));
    expect(screen.getByTestId("flow-node-marbleWorld")).toHaveAttribute("data-x", position.x);
    expect(screen.getByTestId("flow-node-marbleWorld")).toHaveAttribute("data-y", position.y);
  });

  it("delegates spatial registration to the shared pipeline without fabricating anchors", async () => {
    const registrationFlow: ProductionFlowData = {
      ...flow,
      assets: [{
        id: 11, name: "医院大厅", type: "scene", prompt: "雨夜医院大厅", desc: "", src: "https://example.test/hall.jpg", state: "completed", errorReason: "", derive: [],
      }],
      storyboard: [{ id: 31, index: 0, prompt: "推门", videoDesc: "", src: "", state: "idle", errorReason: "", associateAssetsIds: [11] }],
      worldAssets: [{
        id: 81, projectId: 7, sourceSceneAssetId: 11, storyboardId: 31, provider: "worldlabs-marble", providerWorldId: "world-81", model: "marble-1.1",
        status: "succeeded", prompt: "雨夜医院大厅", displayName: "医院大厅", worldJobId: "job-81", panoramaUrl: "https://example.test/pano.jpg", colliderMeshUrl: "https://example.test/world.glb",
        spzUrls: {}, thumbnailUrl: "", caption: "", semantics: { metricScaleFactor: 1, groundPlaneOffset: 0, coordinateSystem: "opengl", registration: null },
        error: "", createdAt: "2026-08-03T00:00:00.000Z", updatedAt: "2026-08-03T00:01:00.000Z",
      }],
    };
    const api = {
      saveFlowData: vi.fn(async () => undefined),
      startSpatialPipeline: vi.fn(async () => ({ accepted: true, currentStage: "spatialRegistration" })),
      getWorldRegistration: vi.fn(async () => ({ worldAssetId: 81, providerWorldId: "world-81", status: "incomplete", registration: null, worldAsset: registrationFlow.worldAssets![0]! })),
      generateWorldRegistration: vi.fn(async () => { throw new Error("不应调用"); }),
      saveWorldRegistration: vi.fn(async () => { throw new Error("不应调用"); }),
      getFlowData: vi.fn(async () => registrationFlow),
      getGenerationData: vi.fn(async () => generation),
      listCoverage: vi.fn(async () => []),
    } as unknown as ProductionApi;

    render(<ProductionFlowBoard api={api} projectId={7} scriptId={12} initialData={registrationFlow} generationData={generation} />);
    const node = screen.getByTestId("flow-node-spatialRegistration");
    const position = { x: node.getAttribute("data-x"), y: node.getAttribute("data-y") };
    expect(within(node).getByRole("alert")).toHaveTextContent("由脚本智能体自动生成");
    fireEvent.click(within(node).getByRole("button", { name: "启动或恢复空间注册" }));

    await waitFor(() => expect(api.startSpatialPipeline).toHaveBeenCalledWith(12, expect.stringContaining("空间注册")));
    expect(api.getWorldRegistration).toHaveBeenCalledWith(7, 12, 81);
    expect(api.generateWorldRegistration).not.toHaveBeenCalled();
    expect(api.saveWorldRegistration).not.toHaveBeenCalled();
    expect(screen.getByTestId("flow-node-spatialRegistration")).toHaveAttribute("data-x", position.x);
    expect(screen.getByTestId("flow-node-spatialRegistration")).toHaveAttribute("data-y", position.y);
  });
});
