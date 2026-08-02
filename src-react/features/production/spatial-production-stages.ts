import { selectLatestCoverage } from "./coverage-selection";
import type {
  CinematicCoverageAggregate,
  ProductionFlowData,
  ProductionGenerationData,
  ProductionPrevisRender,
} from "./types";

export const spatialProductionStageOrder = [
  "sceneMaster",
  "marbleWorld",
  "spatialRegistration",
  "blocking",
  "coverage",
  "previs",
  "previsValidation",
  "formalGeneration",
  "multicamEdit",
] as const;

export type SpatialProductionStageId = (typeof spatialProductionStageOrder)[number];
export type SpatialProductionStageState = "blocked" | "running" | "ready" | "failed";

export interface SpatialProductionArtifact {
  kind: "image" | "video" | "model" | "report" | "metric";
  label: string;
  url?: string;
  detail?: string;
}

export interface SpatialProductionStage {
  id: SpatialProductionStageId;
  label: string;
  state: SpatialProductionStageState;
  summary: string;
  blockingReason?: string;
  artifacts: SpatialProductionArtifact[];
}

export interface SpatialProductionStageInput {
  flow?: ProductionFlowData;
  generation?: ProductionGenerationData;
  coverages?: CinematicCoverageAggregate[];
}

export const spatialProductionStageLabels: Record<SpatialProductionStageId, string> = {
  sceneMaster: "场景母版",
  marbleWorld: "Marble 世界",
  spatialRegistration: "空间注册",
  blocking: "场面调度",
  coverage: "镜头覆盖",
  previs: "Blender 预演",
  previsValidation: "预演校验",
  formalGeneration: "正式生成",
  multicamEdit: "多机位剪辑",
};

function stage(
  id: SpatialProductionStageId,
  state: SpatialProductionStageState,
  summary: string,
  artifacts: SpatialProductionArtifact[] = [],
  blockingReason?: string,
): SpatialProductionStage {
  return {
    id,
    label: spatialProductionStageLabels[id],
    state,
    summary,
    artifacts,
    ...(blockingReason ? { blockingReason } : {}),
  };
}

function firstText(values: Array<string | null | undefined>): string | undefined {
  return values.find((value): value is string => Boolean(value?.trim()))?.trim();
}

function sceneMasterStage(flow?: ProductionFlowData): SpatialProductionStage {
  const sceneAssets = (flow?.assets ?? [])
    .flatMap((asset) => [asset, ...asset.derive])
    .filter((asset) => asset.type === "scene");
  const artifacts = sceneAssets
    .filter((asset) => Boolean(asset.src))
    .map((asset) => ({ kind: "image" as const, label: asset.name || `场景资产 ${asset.id}`, url: asset.src }));
  const failure = firstText(sceneAssets.filter((asset) => asset.state === "failed").map((asset) => asset.errorReason));
  if (sceneAssets.some((asset) => asset.state === "running")) {
    return stage("sceneMaster", "running", `${sceneAssets.length} 个场景资产正在聚合`, artifacts);
  }
  if (artifacts.length) return stage("sceneMaster", "ready", `${artifacts.length} 个场景母版可用`, artifacts);
  if (failure) return stage("sceneMaster", "failed", "场景母版生成失败", artifacts, failure);
  return stage("sceneMaster", "blocked", "尚无可用场景母版", artifacts, "等待场景资产生成可用图片");
}

function marbleWorldStage(flow?: ProductionFlowData): SpatialProductionStage {
  const worlds = flow?.worldAssets ?? [];
  const completed = worlds.filter((world) => world.status === "succeeded");
  const artifacts = completed.flatMap((world) => [
    ...(world.thumbnailUrl ? [{ kind: "image" as const, label: `${world.displayName}缩略图`, url: world.thumbnailUrl }] : []),
    ...(world.panoramaUrl ? [{ kind: "image" as const, label: `${world.displayName}全景`, url: world.panoramaUrl }] : []),
    ...Object.entries(world.spzUrls ?? {}).map(([quality, url]) => ({ kind: "model" as const, label: `${world.displayName} ${quality}`, url })),
  ]);
  if (worlds.some((world) => world.status === "submitting" || world.status === "running")) {
    return stage("marbleWorld", "running", `${worlds.length} 个 Marble 世界任务正在处理`, artifacts);
  }
  if (completed.length) return stage("marbleWorld", "ready", `${completed.length} 个 Marble 世界可用`, artifacts);
  const failure = firstText(worlds.filter((world) => world.status === "failed").map((world) => world.error));
  if (failure) return stage("marbleWorld", "failed", "Marble 世界生成失败", artifacts, failure);
  return stage("marbleWorld", "blocked", "尚无 Marble 世界", artifacts, "等待场景母版提交世界生成");
}

function spatialRegistrationStage(flow?: ProductionFlowData): SpatialProductionStage {
  const worlds = (flow?.worldAssets ?? []).filter((world) => world.status === "succeeded");
  const registered = worlds.filter(
    (world) =>
      Boolean(world.colliderMeshUrl) &&
      Number.isFinite(world.semantics?.metricScaleFactor) &&
      world.semantics.metricScaleFactor > 0 &&
      Number.isFinite(world.semantics?.groundPlaneOffset) &&
      Boolean(world.semantics?.registration),
  );
  const artifacts = registered.flatMap((world) => [
    { kind: "model" as const, label: `${world.displayName}碰撞网格`, url: world.colliderMeshUrl },
    {
      kind: "metric" as const,
      label: `${world.displayName}空间语义`,
      detail: `尺度 ${world.semantics.metricScaleFactor} · 地面 ${world.semantics.groundPlaneOffset} · ${world.semantics.registration?.landmarks.length ?? 0} 个地标`,
    },
  ]);
  if (!worlds.length) return stage("spatialRegistration", "blocked", "尚无可注册的世界", artifacts, "等待 Marble 世界生成完成");
  if (registered.length === worlds.length) return stage("spatialRegistration", "ready", `${registered.length} 个世界已完成空间注册`, artifacts);
  return stage(
    "spatialRegistration",
    "blocked",
    `${registered.length}/${worlds.length} 个世界完成空间注册`,
    artifacts,
    "空间注册由脚本智能体自动生成；当前世界仍缺少已保存注册、碰撞网格、尺度或地面语义",
  );
}

function blockingStage(coverage?: CinematicCoverageAggregate): SpatialProductionStage {
  if (!coverage) return stage("blocking", "blocked", "尚无场面调度计划", [], "等待空间注册后提交镜头覆盖计划");
  const blocking = coverage.plan.blocking;
  const artifacts: SpatialProductionArtifact[] = [
    { kind: "metric", label: "人物锚点", detail: `${blocking.actorAnchors.length} 个` },
    { kind: "metric", label: "表演节拍", detail: `${blocking.beats.length} 个` },
  ];
  if (!blocking.actorAnchors.length && !blocking.beats.length) {
    return stage("blocking", "blocked", "场面调度计划为空", artifacts, "需要人物锚点或表演节拍");
  }
  return stage("blocking", "ready", `${blocking.actorAnchors.length} 个人物锚点 · ${blocking.beats.length} 个表演节拍`, artifacts);
}

function coverageArtifacts(coverage: CinematicCoverageAggregate): SpatialProductionArtifact[] {
  return (coverage.bundle?.cameras ?? []).flatMap((camera) => [
    ...(camera.assets?.previewVideo?.url
      ? [{ kind: "video" as const, label: `${camera.role} 预览`, url: camera.assets.previewVideo.url }]
      : []),
    ...(camera.assets?.firstFrame?.url
      ? [{ kind: "image" as const, label: `${camera.role} 首帧`, url: camera.assets.firstFrame.url }]
      : []),
    ...(camera.assets?.manifest?.url
      ? [{ kind: "report" as const, label: `${camera.role} 清单`, url: camera.assets.manifest.url }]
      : []),
  ]);
}

function coverageStage(coverage?: CinematicCoverageAggregate): SpatialProductionStage {
  if (!coverage) return stage("coverage", "blocked", "尚无镜头覆盖", [], "等待场面调度计划");
  const artifacts = coverageArtifacts(coverage);
  const reason = coverage.error?.message || coverage.pollError?.message;
  if (coverage.status === "failed") return stage("coverage", "failed", "镜头覆盖失败", artifacts, reason || "镜头覆盖任务失败");
  if (coverage.status === "running") return stage("coverage", "running", `${coverage.plan.cameras.length} 个机位正在处理`, artifacts, reason);
  if (coverage.status === "completed") return stage("coverage", "ready", `${coverage.plan.cameras.length} 个同步机位`, artifacts, reason);
  return stage("coverage", "blocked", "镜头覆盖尚未开始", artifacts, reason || "等待场面调度完成");
}

function previsArtifacts(renders: ProductionPrevisRender[]): SpatialProductionArtifact[] {
  return renders.flatMap((render) =>
    render.result
      ? [
          { kind: "video" as const, label: `${render.renderId} 预演`, url: render.result.previewVideoUrl },
          { kind: "image" as const, label: `${render.renderId} 首帧`, url: render.result.firstFrameUrl },
          { kind: "report" as const, label: `${render.renderId} 清单`, url: render.result.manifestUrl },
        ]
      : [],
  );
}

function previsStage(flow?: ProductionFlowData): SpatialProductionStage {
  const renders = flow?.previsRenders ?? [];
  const artifacts = previsArtifacts(renders);
  if (renders.some((render) => render.status === "running")) return stage("previs", "running", `${renders.length} 个预演任务正在处理`, artifacts);
  const completed = renders.filter((render) => render.status === "completed" && render.result);
  if (completed.length) return stage("previs", "ready", `${completed.length} 个 Blender 预演可用`, artifacts);
  const failure = firstText(renders.filter((render) => render.status === "failed").map((render) => render.errorReason));
  if (failure) return stage("previs", "failed", "Blender 预演失败", artifacts, failure);
  return stage("previs", "blocked", "尚无 Blender 预演", artifacts, "等待镜头覆盖完成");
}

function previsValidationStage(flow: ProductionFlowData | undefined, coverage?: CinematicCoverageAggregate): SpatialProductionStage {
  const renders = flow?.previsRenders ?? [];
  if (!renders.some((render) => render.status === "completed" && render.result)) {
    return stage("previsValidation", "blocked", "尚无可校验的预演", [], "等待 Blender 预演产物");
  }
  const renderQualities = renders.flatMap((render) => render.quality ? [{ render, quality: render.quality }] : []);
  if (renderQualities.length) {
    const artifacts: SpatialProductionArtifact[] = renderQualities.flatMap(({ render, quality }) => [
      {
        kind: "report" as const,
        label: `${render.renderId} 质量报告`,
        ...(render.report?.url ? { url: render.report.url } : {}),
        detail: quality.score === undefined ? quality.status : `${quality.status} · ${Math.round(quality.score * 100)} 分`,
      },
    ]);
    const failedIssues = renderQualities.flatMap(({ quality }) => quality.issues.filter((issue) => issue.severity === "error").map((issue) => issue.message));
    if (renderQualities.some(({ quality }) => quality.status === "failed") || failedIssues.length) {
      const failedRender = renderQualities.find(({ quality }) => quality.status === "failed")?.render;
      return stage(
        "previsValidation",
        "failed",
        "预演校验未通过",
        artifacts,
        failedIssues[0] || failedRender?.report?.summary || "预演质量报告标记失败",
      );
    }
    if (renderQualities.every(({ quality }) => quality.status === "passed")) {
      return stage("previsValidation", "ready", `${renderQualities.length} 个预演通过校验`, artifacts);
    }
    return stage("previsValidation", "running", "预演质量报告生成中", artifacts);
  }
  const qualities = (coverage?.bundle?.cameras ?? []).flatMap((camera) => (camera.quality ? [{ camera, quality: camera.quality }] : []));
  const artifacts = qualities.map(({ camera, quality }) => ({
    kind: "report" as const,
    label: `${camera.role} 质量报告`,
    detail: quality.score === undefined ? quality.status : `${quality.status} · ${Math.round(quality.score * 100)} 分`,
  }));
  const failedIssues = qualities.flatMap(({ quality }) => quality.issues.filter((issue) => issue.severity === "error").map((issue) => issue.message));
  if (qualities.some(({ quality }) => quality.status === "failed") || failedIssues.length) {
    return stage("previsValidation", "failed", "预演校验未通过", artifacts, failedIssues[0] || "质量报告标记失败");
  }
  if (qualities.length && qualities.every(({ quality }) => quality.status === "passed")) {
    return stage("previsValidation", "ready", `${qualities.length} 个机位通过预演校验`, artifacts);
  }
  if (qualities.some(({ quality }) => quality.status === "pending")) return stage("previsValidation", "running", "预演质量报告生成中", artifacts);
  return stage("previsValidation", "blocked", "预演尚无质量报告", artifacts, "等待预演校验报告");
}

function formalGenerationStage(
  generation: ProductionGenerationData | undefined,
  coverage: CinematicCoverageAggregate | undefined,
): SpatialProductionStage {
  const videos = generation?.trackList.flatMap((track) => track.videoList) ?? [];
  const cameras = coverage?.bundle?.cameras ?? [];
  const artifacts: SpatialProductionArtifact[] = [
    ...videos.filter((video) => video.state === "completed" && video.src).map((video) => ({
      kind: "video" as const,
      label: `正式视频 ${video.id}`,
      url: video.src,
    })),
    ...cameras.flatMap((camera) => camera.status === "ready" && camera.assets?.previewVideo?.url
      ? [{ kind: "video" as const, label: `${camera.role} 正式机位`, url: camera.assets.previewVideo.url }]
      : []),
  ];
  if (videos.some((video) => video.state === "running") || cameras.some((camera) => camera.status === "generating")) {
    return stage("formalGeneration", "running", "正式视频正在生成", artifacts);
  }
  if (artifacts.length) return stage("formalGeneration", "ready", `${artifacts.length} 个正式视频产物可用`, artifacts);
  const failure = firstText([
    ...videos.filter((video) => video.state === "failed").map((video) => video.errorReason),
    ...cameras.filter((camera) => camera.status === "failed").map((camera) => camera.retry?.lastError),
  ]);
  if (failure) return stage("formalGeneration", "failed", "正式视频生成失败", artifacts, failure);
  return stage("formalGeneration", "blocked", "尚无正式视频", artifacts, "等待预演校验通过");
}

function multicamEditStage(coverage?: CinematicCoverageAggregate): SpatialProductionStage {
  const cut = coverage?.recommendedCut;
  if (!cut?.clips.length) return stage("multicamEdit", "blocked", "尚无建议剪辑", [], "等待多机位正式素材与建议剪辑");
  const artifacts: SpatialProductionArtifact[] = [
    { kind: "metric", label: "建议剪辑", detail: `${cut.clips.length} 段 · ${cut.durationFrames} 帧` },
  ];
  return stage("multicamEdit", "ready", `${cut.clips.length} 个剪辑片段 · ${cut.durationFrames} 帧`, artifacts);
}

export function buildSpatialProductionStages({
  flow,
  generation,
  coverages = [],
}: SpatialProductionStageInput): SpatialProductionStage[] {
  const coverage = selectLatestCoverage(coverages);
  return [
    sceneMasterStage(flow),
    marbleWorldStage(flow),
    spatialRegistrationStage(flow),
    blockingStage(coverage),
    coverageStage(coverage),
    previsStage(flow),
    previsValidationStage(flow, coverage),
    formalGenerationStage(generation, coverage),
    multicamEditStage(coverage),
  ];
}

export function spatialProductionStageById(
  input: SpatialProductionStageInput,
  id: SpatialProductionStageId,
): SpatialProductionStage {
  return buildSpatialProductionStages(input).find((item) => item.id === id)!;
}
