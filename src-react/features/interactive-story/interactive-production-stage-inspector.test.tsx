import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { CinematicCoverageAggregate, ProductionApi, ProductionFlowData, ProductionProject } from "@react/features/production";
import { InteractiveProductionStageInspector } from "./interactive-production-stage-inspector";
import type { InteractiveStoryNode } from "./types";

const node: InteractiveStoryNode = {
  id: "scene-1",
  graphId: "graph-1",
  scriptId: 12,
  kind: "scene",
  title: "锁住的房间",
  summary: "测试",
  position: { x: 0, y: 0 },
  status: "ready",
  script: { id: 12, name: "锁住的房间", content: "INT. ROOM", createTime: 1 },
  createdAt: 1,
  updatedAt: 1,
};

const project: ProductionProject = {
  id: 7,
  name: "雨夜",
  imageModel: "pancat:pancat-image",
  videoModel: "pancat:pancat-video",
  videoMode: "singleImage",
  videoRatio: "9:16",
};

function flow(): ProductionFlowData {
  return {
    script: "INT. ROOM",
    scriptPlan: "推进",
    storyboardTable: "镜头 1",
    assets: [
      {
        id: 1,
        name: "人物",
        type: "role",
        prompt: "",
        desc: "",
        src: "",
        state: "completed",
        errorReason: "",
        derive: [
          {
            id: 2,
            assetsId: 1,
            name: "Rachel",
            type: "role",
            prompt: "旧提示词",
            desc: "旧描述",
            src: "",
            state: "idle",
            errorReason: "",
          },
        ],
      },
    ],
    storyboard: [
      {
        id: 9,
        index: 0,
        prompt: "旧分镜提示词",
        videoDesc: "旧镜头描述",
        src: "",
        state: "idle",
        errorReason: "",
      },
    ],
  };
}

function api() {
  return {
    saveFlowData: vi.fn(async () => undefined),
    editStoryboard: vi.fn(async () => undefined),
  } as unknown as ProductionApi;
}

describe("InteractiveProductionStageInspector", () => {
  it("shows a camera coverage matrix, retries only the failed camera and exports OTIO", async () => {
    const previsRender = {
      renderId: "render-1",
      jobId: "job-1",
      projectId: 7,
      scriptId: 12,
      storyboardId: 9,
      status: "failed" as const,
      progress: 45,
      attempt: 1,
      errorReason: "Blender 渲染中断",
      contract: {} as never,
      result: null,
      createdAt: "2026-08-01T00:00:00Z",
      updatedAt: "2026-08-01T00:00:00Z",
    };
    const productionApi = {
      ...api(),
      retryCoverageCamera: vi.fn(async () => undefined),
      saveCoverageRecommendedCut: vi.fn(async () => ({ ...coverage, version: 4 })),
      applyCoverageRecommendedCut: vi.fn(async () => ({ timelineId: 91, timelineRevision: 4 })),
      exportCoverageOtio: vi.fn(async () => ({ fileName: "coverage-12.otio", mediaType: "application/vnd.opentimelineio+json", document: {} })),
      listPrevisRenders: vi.fn(async () => [previsRender]),
      submitPrevis: vi.fn(async (contract) => ({ ...previsRender, renderId: "render-2", status: "running", contract })),
      getPrevisStatus: vi.fn(async () => previsRender),
      retryPrevis: vi.fn(async () => ({ ...previsRender, status: "running" })),
    } as unknown as ProductionApi;
    const coverage = {
      schemaVersion: "1" as const,
      coverageId: "coverage-12",
      projectId: 7,
      scriptId: 12,
      storyboardId: 9,
      status: "failed" as const,
      version: 3,
      timelineRevision: 2,
      plan: {
        schemaVersion: "1" as const,
        coverageId: "coverage-12",
        projectId: 7,
        scriptId: 12,
        storyboardId: 9,
        presetId: "dialogue/two-person",
        blocking: {
          schemaVersion: "1" as const,
          sceneId: "scene-12",
          performanceTakeId: "take-12",
          durationSeconds: 5,
          fps: 24,
          axis: { fromActorId: "a", toActorId: "b", allowedSide: "left" as const },
          actorAnchors: [
            { actorId: "a", anchorId: "a-seat", position: [0, 0, 0] as [number, number, number], rotationEuler: [0, 0, 0] as [number, number, number], lookAtActorId: "b" },
            { actorId: "b", anchorId: "b-seat", position: [1, 0, 0] as [number, number, number], rotationEuler: [0, 0, 0] as [number, number, number], lookAtActorId: "a" },
          ],
          beats: [{ id: "beat-1", startFrame: 1, endFrame: 120, speakerId: "a", reactionActorIds: ["b"], intensity: 0.5, action: "对话" }],
        },
        cameras: [
          { cameraId: "cam-master", role: "MASTER" as const, shotSize: "wide" as const, lensMm: 35, subjects: ["a", "b"], foregroundSubjects: [], activeBeatIds: ["beat-1"], handlesFrames: 8, language: "固定主镜头" },
          { cameraId: "cam-ots-a", role: "OTS_A" as const, shotSize: "medium" as const, lensMm: 50, subjects: ["a"], foregroundSubjects: ["b"], activeBeatIds: ["beat-1"], handlesFrames: 8, language: "A 过肩" },
        ],
        editPolicy: { startWide: true, preferListenerOnReveal: true, reserveCloseUpUntilIntensity: 0.7, minimumShotFrames: 24 },
      },
      bundle: {
        schemaVersion: "1" as const,
        coverageId: "coverage-12",
        sceneId: "scene-12",
        performanceTakeId: "take-12",
        durationSeconds: 5,
        fps: 24,
        frameCount: 120,
        cameras: [
          { cameraId: "cam-master", role: "MASTER" as const, startFrame: 1, endFrame: 120, beatIds: ["beat-1"], subjects: ["a", "b"], status: "ready" as const, videoId: 51, renderId: "render-master", assets: { previewVideo: { key: "master.mp4", url: "/oss/master.mp4" }, firstFrame: { key: "first.png", url: "/oss/first.png" }, lastFrame: { key: "last.png", url: "/oss/last.png" }, controlFrames: [{ key: "control.png", url: "/oss/control.png", frame: 48 }], depthMaps: [{ key: "depth.png", url: "/oss/depth.png", frame: 48 }], masks: [{ key: "mask.png", url: "/oss/mask.png", frame: 48 }], manifest: { key: "manifest.json", url: "/oss/manifest.json" } }, quality: { status: "passed" as const, score: 0.93, issues: [{ code: "continuity", severity: "warning" as const, message: "动作连续性需要复核" }] } },
          { cameraId: "cam-ots-a", role: "OTS_A" as const, startFrame: 1, endFrame: 120, beatIds: ["beat-1"], subjects: ["a"], status: "failed" as const, renderId: "render-ots-a", quality: { status: "failed" as const, score: 0.42, issues: [{ code: "eyeline", severity: "error" as const, message: "视线不匹配" }] }, retry: { attempt: 1, maxAttempts: 3, lastError: "视线不匹配" } },
        ],
      },
      recommendedCut: {
        schemaVersion: "1" as const,
        coverageId: "coverage-12",
        performanceTakeId: "take-12",
        fps: 24,
        durationFrames: 120,
        clips: [{ id: "clip-1", cameraId: "cam-master", startFrame: 1, endFrame: 120, sourceInFrame: 1, sourceOutFrame: 120, videoId: 51 }],
      },
      error: null,
    };

    const { rerender } = render(
      <InteractiveProductionStageInspector
        projectId={7}
        node={node}
        stage="coverage"
        flow={flow()}
        coverages={[coverage]}
        api={productionApi}
        project={project}
        onChange={vi.fn()}
        onRefresh={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole("table", { name: "镜头覆盖矩阵" })).toHaveTextContent("MASTER");
    expect(screen.getByRole("table", { name: "镜头覆盖矩阵" })).toHaveTextContent("OTS_A");
    expect(screen.getByText("93%")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重试机位 OTS_A" }));
    await waitFor(() => expect(productionApi.retryCoverageCamera).toHaveBeenCalledWith(7, 12, "coverage-12", "cam-ots-a"));

    rerender(
      <InteractiveProductionStageInspector
        projectId={7}
        node={node}
        stage="previs"
        flow={flow()}
        coverages={[coverage]}
        api={productionApi}
        project={project}
        onChange={vi.fn()}
        onRefresh={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(productionApi.listPrevisRenders).toHaveBeenCalledWith(7, 12));
    expect(screen.getByRole("region", { name: "Blender 预演工作区" })).toHaveTextContent("预演状态：预演已完成");
    expect(screen.getByRole("region", { name: "Blender 预演工作区" })).toHaveTextContent("控制帧 1");
    expect(screen.getByRole("region", { name: "Blender 预演工作区" })).toHaveTextContent("深度图 1");
    expect(screen.getByRole("region", { name: "Blender 预演工作区" })).toHaveTextContent("遮罩 1");
    expect(screen.getByRole("link", { name: "打开 3D 导演台" })).toHaveAttribute("href", "#/projects/7/director-desk?storyboardId=9");
    expect(screen.getByRole("link", { name: "打开生产预演工作台" })).toHaveAttribute("href", "#/projects/7/production?view=workbench&episodeId=12");
    fireEvent.click(screen.getByRole("button", { name: "提交 Blender 预演" }));
    await waitFor(() => expect(productionApi.submitPrevis).toHaveBeenCalledWith(expect.objectContaining({ projectId: 7, scriptId: 12, storyboardId: 9 })));
    fireEvent.click(screen.getByRole("button", { name: "刷新 render-1" }));
    await waitFor(() => expect(productionApi.getPrevisStatus).toHaveBeenCalledWith(7, "render-1"));
    fireEvent.click(screen.getByRole("button", { name: "重试 render-1" }));
    await waitFor(() => expect(productionApi.retryPrevis).toHaveBeenCalledWith(7, "render-1"));

    const generation = {
      storyboardList: [],
      trackList: [{ id: 81, prompt: "", duration: 5, state: "completed" as const, errorReason: "", medias: [], videoList: [{ id: 51, src: "/final/master.mp4", state: "completed" as const, errorReason: "" }] }],
    };
    rerender(
      <InteractiveProductionStageInspector
        projectId={7}
        node={node}
        stage="formalGeneration"
        flow={flow()}
        generation={generation}
        coverages={[coverage]}
        api={productionApi}
        project={project}
        onChange={vi.fn()}
        onRefresh={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole("region", { name: "正式生成状态" })).toHaveTextContent("正式素材可用");
    expect(screen.getByLabelText("MASTER 正式视频")).toHaveAttribute("src", "/final/master.mp4");
    expect(screen.getByRole("region", { name: "正式生成状态" })).toHaveTextContent("正式视频地址未找到");

    rerender(
      <InteractiveProductionStageInspector
        projectId={7}
        node={node}
        stage="multicamEdit"
        flow={flow()}
        generation={generation}
        coverages={[coverage]}
        api={productionApi}
        project={project}
        onChange={vi.fn()}
        onRefresh={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole("region", { name: "建议剪辑" })).toHaveTextContent("clip-1");
    expect(screen.getByLabelText("WebAV 合成画布")).toHaveStyle({ aspectRatio: "1080 / 1920" });
    fireEvent.click(screen.getByRole("button", { name: "应用建议剪辑" }));
    await waitFor(() => expect(productionApi.saveCoverageRecommendedCut).toHaveBeenCalledWith(7, 12, "coverage-12", 3, coverage.recommendedCut));
    await waitFor(() => expect(productionApi.applyCoverageRecommendedCut).toHaveBeenCalledWith(7, 12, "coverage-12", 2));
    fireEvent.click(screen.getByRole("button", { name: "导出 OTIO" }));
    await waitFor(() => expect(productionApi.exportCoverageOtio).toHaveBeenCalledWith(7, 12, "coverage-12"));

    const refreshedCoverage = {
      ...coverage,
      version: 5,
      recommendedCut: {
        ...coverage.recommendedCut,
        clips: [{ ...coverage.recommendedCut.clips[0]!, id: "clip-refreshed" }],
      },
    };
    rerender(
      <InteractiveProductionStageInspector
        projectId={7}
        node={node}
        stage="multicamEdit"
        flow={flow()}
        generation={generation}
        coverages={[refreshedCoverage]}
        api={productionApi}
        project={project}
        onChange={vi.fn()}
        onRefresh={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText("clip-refreshed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "选择轨道 MASTER · clip-refreshed" })).toBeInTheDocument();

    rerender(
      <InteractiveProductionStageInspector
        projectId={7}
        node={node}
        stage="multicamEdit"
        flow={flow()}
        generation={{ storyboardList: [], trackList: [] }}
        coverages={[coverage]}
        api={productionApi}
        project={project}
        onChange={vi.fn()}
        onRefresh={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("找不到正式视频地址");
    expect(screen.queryByLabelText("WebAV 合成画布")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "预演剪辑模式" }));
    expect(screen.getByText(/当前使用低清预演素材/)).toBeInTheDocument();
    expect(screen.getByLabelText("WebAV 合成画布")).toBeInTheDocument();
  });

  it("ripples one coverage boundary drag into its neighbor and saves the full-length cut", async () => {
    const coverage = {
      schemaVersion: "1",
      coverageId: "coverage-ripple",
      projectId: 7,
      scriptId: 12,
      storyboardId: 9,
      status: "completed",
      version: 1,
      timelineRevision: 6,
      plan: {},
      bundle: {
        schemaVersion: "1",
        coverageId: "coverage-ripple",
        sceneId: "scene-ripple",
        performanceTakeId: "take-ripple",
        durationSeconds: 5,
        fps: 24,
        frameCount: 120,
        cameras: [
          { cameraId: "cam-a", role: "MASTER", startFrame: 1, endFrame: 120, beatIds: [], subjects: ["a"], status: "ready", videoId: 51 },
          { cameraId: "cam-b", role: "OTS_A", startFrame: 1, endFrame: 120, beatIds: [], subjects: ["b"], status: "ready", videoId: 52 },
        ],
      },
      recommendedCut: {
        schemaVersion: "1",
        coverageId: "coverage-ripple",
        performanceTakeId: "take-ripple",
        fps: 24,
        durationFrames: 120,
        clips: [
          { id: "clip-a", cameraId: "cam-a", startFrame: 1, endFrame: 48, sourceInFrame: 1, sourceOutFrame: 48, videoId: 51 },
          { id: "clip-b", cameraId: "cam-b", startFrame: 49, endFrame: 120, sourceInFrame: 49, sourceOutFrame: 120, videoId: 52 },
        ],
      },
      error: null,
    } as unknown as CinematicCoverageAggregate;
    const saveCoverageRecommendedCut = vi.fn(async (_projectId, _scriptId, _coverageId, _version, recommendedCut) => ({
      ...coverage,
      version: 2,
      recommendedCut,
    }));
    const applyCoverageRecommendedCut = vi.fn(async () => ({ timelineId: 91, timelineRevision: 7 }));
    const productionApi = {
      ...api(),
      saveCoverageRecommendedCut,
      applyCoverageRecommendedCut,
      exportCoverageOtio: vi.fn(async () => ({ fileName: "coverage.otio", mediaType: "application/json", document: { OTIO_SCHEMA: "Timeline.1" } })),
    } as unknown as ProductionApi;
    const generation = {
      storyboardList: [],
      trackList: [
        { id: 1, prompt: "", duration: 5, state: "completed" as const, errorReason: "", medias: [], videoList: [{ id: 51, src: "/final/a.mp4", state: "completed" as const, errorReason: "" }] },
        { id: 2, prompt: "", duration: 5, state: "completed" as const, errorReason: "", medias: [], videoList: [{ id: 52, src: "/final/b.mp4", state: "completed" as const, errorReason: "" }] },
      ],
    };

    render(
      <InteractiveProductionStageInspector
        projectId={7}
        node={node}
        stage="multicamEdit"
        flow={flow()}
        generation={generation}
        coverages={[coverage]}
        api={productionApi}
        project={project}
        onChange={vi.fn()}
        onRefresh={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: "上移 clip-a" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "下移 clip-a" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "下移片段 clip-a" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("裁剪终点"), { target: { value: "1.5" } });
    const region = screen.getByRole("region", { name: "建议剪辑" });
    await waitFor(() => expect(region).toHaveTextContent("cam-a · 1–36 帧"));
    expect(region).toHaveTextContent("cam-b · 37–120 帧");
    expect(screen.queryByText(/独立裁剪会改变总时长/)).not.toBeInTheDocument();

    const undo = screen.getByRole("button", { name: "撤销" });
    expect(undo).toBeEnabled();
    fireEvent.click(undo);
    await waitFor(() => expect(region).toHaveTextContent("cam-a · 1–48 帧"));
    expect(region).toHaveTextContent("cam-b · 49–120 帧");
    expect(region).not.toHaveTextContent(/当前 108 帧/);
    fireEvent.click(screen.getByRole("button", { name: "重做" }));
    await waitFor(() => expect(region).toHaveTextContent("cam-a · 1–36 帧"));
    expect(region).toHaveTextContent("cam-b · 37–120 帧");

    fireEvent.click(screen.getByRole("button", { name: "应用建议剪辑" }));
    await waitFor(() => expect(saveCoverageRecommendedCut).toHaveBeenCalledWith(
      7,
      12,
      "coverage-ripple",
      1,
      expect.objectContaining({
        durationFrames: 120,
        clips: [
          expect.objectContaining({ id: "clip-a", startFrame: 1, endFrame: 36, sourceInFrame: 1, sourceOutFrame: 36 }),
          expect.objectContaining({ id: "clip-b", startFrame: 37, endFrame: 120, sourceInFrame: 37, sourceOutFrame: 120 }),
        ],
      }),
    ));
    await waitFor(() => expect(applyCoverageRecommendedCut).toHaveBeenCalledWith(7, 12, "coverage-ripple", 6));

    fireEvent.click(screen.getByRole("button", { name: "下移片段 clip-a" }));
    await waitFor(() => expect(region).toHaveTextContent("cam-b · 1–84 帧"));
    expect(region).toHaveTextContent("cam-a · 85–120 帧");
    const renderedTimeline = screen.getByLabelText("时间线轨道");
    const renderedTracks = within(renderedTimeline).getAllByRole("button", { name: /选择轨道/ });
    expect(renderedTracks.map((button) => button.getAttribute("aria-label"))).toEqual([
      "选择轨道 OTS_A · clip-b",
      "选择轨道 MASTER · clip-a",
    ]);
    expect(renderedTimeline).toHaveTextContent("0.0–3.5 秒");
    expect(renderedTimeline).toHaveTextContent("3.5–5.0 秒");

    fireEvent.click(screen.getByRole("button", { name: "撤销" }));
    await waitFor(() => expect(region).toHaveTextContent("cam-a · 1–36 帧"));
    expect(region).toHaveTextContent("cam-b · 37–120 帧");
    fireEvent.click(screen.getByRole("button", { name: "重做" }));
    await waitFor(() => expect(region).toHaveTextContent("cam-b · 1–84 帧"));
    expect(region).toHaveTextContent("cam-a · 85–120 帧");

    saveCoverageRecommendedCut.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "应用建议剪辑" }));
    await waitFor(() => expect(saveCoverageRecommendedCut).toHaveBeenCalledWith(
      7,
      12,
      "coverage-ripple",
      1,
      expect.objectContaining({
        durationFrames: 120,
        clips: [
          expect.objectContaining({ id: "clip-b", startFrame: 1, endFrame: 84 }),
          expect.objectContaining({ id: "clip-a", startFrame: 85, endFrame: 120 }),
        ],
      }),
    ));
  });

  it("edits an asset locally and persists it only when the user saves", async () => {
    const productionApi = api();
    render(
      <InteractiveProductionStageInspector
        projectId={7}
        node={node}
        stage="assets"
        flow={flow()}
        api={productionApi}
        project={project}
        onChange={vi.fn()}
        onRefresh={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Rachel描述"), { target: { value: "完整人物描述" } });
    expect(productionApi.saveFlowData).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "保存Rachel" }));
    await waitFor(() => expect(productionApi.saveFlowData).toHaveBeenCalledTimes(1));
    expect(productionApi.saveFlowData).toHaveBeenCalledWith(
      7,
      12,
      expect.objectContaining({
        assets: [expect.objectContaining({ derive: [expect.objectContaining({ desc: "完整人物描述" })] })],
      }),
    );
  });

  it("edits a storyboard locally and persists it only when the user saves", async () => {
    const productionApi = api();
    render(
      <InteractiveProductionStageInspector
        projectId={7}
        node={node}
        stage="storyboard"
        flow={flow()}
        api={productionApi}
        project={project}
        onChange={vi.fn()}
        onRefresh={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("分镜 1提示词"), { target: { value: "新分镜提示词" } });
    expect(productionApi.editStoryboard).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "保存分镜 1" }));
    await waitFor(() => expect(productionApi.editStoryboard).toHaveBeenCalledWith(9, "新分镜提示词", "旧镜头描述"));
  });
});
