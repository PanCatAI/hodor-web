import { useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Boxes, CheckCircle2, ClipboardCheck, Clapperboard, Film, ListVideo, Map, ScanLine, Table2, UsersRound, Video, WandSparkles, Workflow, Scissors } from "lucide-react";

import { selectLatestCoverage, type CinematicCoverageAggregate, type ProductionFlowData, type ProductionGenerationData, type ProductionState } from "@react/features/production";
import type { InteractiveProductionStage } from "./interactive-production-topology";
import { spatialProductionStageById, spatialProductionStageOrder, type SpatialProductionStageId } from "@react/features/production/spatial-production-stages";
import { isCanvasSpatialRetryStage, spatialStageActionLabel, type CanvasSpatialRetryStage } from "@react/features/production/spatial-production-retry";

export interface InteractiveProductionStageNodeData extends Record<string, unknown> {
  storyNodeId: string;
  storyTitle: string;
  stage: Exclude<InteractiveProductionStage, "script">;
  flow?: ProductionFlowData;
  generation?: ProductionGenerationData;
  coverages?: CinematicCoverageAggregate[];
  onOpenStage: (storyNodeId: string, stage: InteractiveProductionStage) => void;
  onRetryStage?: (storyNodeId: string, stage: CanvasSpatialRetryStage) => Promise<void>;
}

const stageLabels: Record<Exclude<InteractiveProductionStage, "script">, string> = {
  scriptPlan: "导演计划",
  assets: "资产工厂",
  storyboardTable: "分镜表",
  storyboard: "分镜图",
  sceneMaster: "场景母版",
  marbleWorld: "Marble 世界",
  spatialRegistration: "空间注册",
  blocking: "场面调度",
  coverage: "镜头覆盖",
  previs: "Blender 预演",
  previsValidation: "预演校验",
  formalGeneration: "正式生成",
  multicamEdit: "多机位剪辑",
  supervision: "监督验收",
};

const stageIcons = {
  scriptPlan: Clapperboard,
  assets: Boxes,
  storyboardTable: Table2,
  storyboard: ListVideo,
  sceneMaster: Film,
  marbleWorld: Map,
  spatialRegistration: ScanLine,
  blocking: UsersRound,
  coverage: Workflow,
  previs: Video,
  previsValidation: CheckCircle2,
  formalGeneration: WandSparkles,
  multicamEdit: Scissors,
  supervision: ClipboardCheck,
};

function aggregateState(states: ProductionState[]): ProductionState {
  if (states.includes("running")) return "running";
  if (states.includes("failed")) return "failed";
  if (states.length > 0 && states.every((state) => state === "completed")) return "completed";
  return "idle";
}

export function describeInteractiveProductionStage(data: InteractiveProductionStageNodeData): { state: ProductionState; summary: string } {
  const flow = data.flow;
  if (!flow) return { state: "running", summary: "正在读取节点生产数据" };
  if (["sceneMaster", "marbleWorld", "spatialRegistration", "previsValidation"].includes(data.stage)) {
    const snapshot = spatialProductionStageById(
      { flow, generation: data.generation, coverages: data.coverages },
      data.stage as SpatialProductionStageId,
    );
    return {
      state: snapshot.state === "ready" ? "completed" : snapshot.state === "blocked" ? "idle" : snapshot.state,
      summary: snapshot.summary,
    };
  }
  if (data.stage === "scriptPlan") {
    return {
      state: flow.scriptPlan.trim() ? "completed" : "idle",
      summary: flow.scriptPlan.trim() ? flow.scriptPlan.trim().slice(0, 90) : "等待导演计划",
    };
  }
  if (data.stage === "assets") {
    const assets = flow.assets.flatMap((asset) => asset.derive);
    return {
      state: aggregateState(assets.map((asset) => asset.state)),
      summary: assets.length ? `${assets.length} 个衍生资产，${assets.filter((asset) => asset.state === "completed").length} 个已完成` : "等待资产提取与生成",
    };
  }
  if (data.stage === "storyboardTable") {
    return {
      state: flow.storyboardTable.trim() ? "completed" : "idle",
      summary: flow.storyboardTable.trim() ? flow.storyboardTable.trim().slice(0, 90) : "等待分镜表",
    };
  }
  if (data.stage === "storyboard") {
    return {
      state: aggregateState(flow.storyboard.map((item) => item.state)),
      summary: flow.storyboard.length
        ? `${flow.storyboard.length} 个分镜，${flow.storyboard.filter((item) => item.state === "completed").length} 个已完成`
        : "等待分镜图",
    };
  }
  const coverage = selectLatestCoverage(data.coverages ?? []);
  if (data.stage === "blocking") {
    return {
      state: coverage ? "completed" : "idle",
      summary: coverage
        ? `${coverage.plan.blocking.actorAnchors.length} 个人物锚点 · ${coverage.plan.blocking.beats.length} 个表演节拍`
        : "等待场面调度计划",
    };
  }
  const cameras = coverage?.bundle?.cameras ?? [];
  if (data.stage === "coverage") {
    return {
      state: coverage?.status ?? "idle",
      summary: coverage?.pollError
        ? `状态刷新失败：${coverage.pollError.message}`
        : coverage
          ? `${coverage.plan.cameras.length} 个同步机位 · ${coverage.plan.presetId}`
          : "等待镜头覆盖计划",
    };
  }
  if (data.stage === "previs") {
    const ready = cameras.filter((camera) => ["previs-ready", "generating", "ready"].includes(camera.status)).length;
    const states = cameras.map((camera): ProductionState => {
      if (camera.status === "failed") return "failed";
      if (camera.status === "rendering" || camera.status === "queued") return "running";
      if (["previs-ready", "generating", "ready"].includes(camera.status)) return "completed";
      return "idle";
    });
    return { state: aggregateState(states), summary: cameras.length ? `${ready}/${cameras.length} 个 Blender 机位预演可用` : "等待 Blender 预演" };
  }
  if (data.stage === "formalGeneration") {
    const ready = cameras.filter((camera) => camera.status === "ready").length;
    const running = cameras.filter((camera) => camera.status === "generating").length;
    return { state: cameras.some((camera) => camera.status === "failed") ? "failed" : running ? "running" : cameras.length > 0 && ready === cameras.length ? "completed" : "idle", summary: cameras.length ? `${ready}/${cameras.length} 个正式机位素材可剪` : "等待正式视频生成" };
  }
  if (data.stage === "multicamEdit") {
    const clips = coverage?.recommendedCut?.clips.length ?? 0;
    return { state: clips ? "completed" : "idle", summary: clips ? `${clips} 个建议剪辑片段，可继续人工调整和导出 OTIO` : "等待建议剪辑" };
  }
  const ready =
    Boolean(flow.scriptPlan.trim()) &&
    Boolean(flow.storyboardTable.trim()) &&
    flow.storyboard.length > 0 &&
    flow.storyboard.every((item) => item.state === "completed");
  return {
    state: ready ? "completed" : "idle",
    summary: ready ? "生产数据齐备，可执行监督验收" : "等待上游生产节点完成",
  };
}

const stateLabels: Record<ProductionState, string> = {
  idle: "未完成",
  running: "处理中",
  completed: "已完成",
  failed: "失败",
};

const stateStyles: Record<ProductionState, string> = {
  idle: "border-slate-600 bg-slate-900 text-slate-400",
  running: "border-blue-500/40 bg-blue-500/10 text-blue-300",
  completed: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  failed: "border-red-500/40 bg-red-500/10 text-red-300",
};

const spatialStateLabels = {
  blocked: "受阻",
  running: "处理中",
  ready: "就绪",
  failed: "失败",
} as const;

const spatialStateStyles = {
  blocked: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  running: stateStyles.running,
  ready: stateStyles.completed,
  failed: stateStyles.failed,
} as const;

export function InteractiveProductionStageNode({ id, data }: NodeProps) {
  const node = data as InteractiveProductionStageNodeData;
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState("");
  const Icon = stageIcons[node.stage];
  const status = describeInteractiveProductionStage(node);
  const spatialSnapshot = spatialProductionStageOrder.includes(node.stage as SpatialProductionStageId) && node.flow
    ? spatialProductionStageById(
        { flow: node.flow, generation: node.generation, coverages: node.coverages },
        node.stage as SpatialProductionStageId,
      )
    : null;
  const label = stageLabels[node.stage];
  const stateLabel = spatialSnapshot ? spatialStateLabels[spatialSnapshot.state] : stateLabels[status.state];
  const stateStyle = spatialSnapshot ? spatialStateStyles[spatialSnapshot.state] : stateStyles[status.state];
  const canRetry = isCanvasSpatialRetryStage(node.stage) && Boolean(node.onRetryStage);
  return (
    <article className="w-[330px] rounded-lg border border-slate-700 bg-[#242626] p-4 text-slate-100 shadow-sm" data-testid={`interactive-production-node-${id}`}>
      <Handle id={`${id}-target`} type="target" position={Position.Left} />
      <Handle id={`${id}-source`} type="source" position={Position.Right} />
      <header className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Icon className="size-4 text-blue-300" />
            {label}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">{node.storyTitle}</div>
        </div>
        <span className={`rounded border px-2 py-1 text-[11px] ${stateStyle}`}>{stateLabel}</span>
      </header>
      <p className="mt-4 min-h-12 whitespace-pre-wrap text-xs leading-5 text-slate-300">{status.summary}</p>
      {spatialSnapshot?.blockingReason ? (
        <div role="alert" className="mt-3 rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs leading-5 text-amber-200">
          {spatialSnapshot.blockingReason}
        </div>
      ) : null}
      {spatialSnapshot?.artifacts.length ? (
        <ul className="mt-3 grid gap-1.5" aria-label={`${label}产物`}>
          {spatialSnapshot.artifacts.slice(0, 3).map((artifact, index) => (
            <li key={`${artifact.label}-${artifact.url ?? artifact.detail ?? index}`} className="min-w-0 truncate rounded border border-slate-700 bg-slate-900/60 px-2 py-1.5 text-[11px] text-slate-400">
              {artifact.url ? <a href={artifact.url} target="_blank" rel="noreferrer" className="text-blue-300 hover:underline">{artifact.label}</a> : artifact.label}
              {artifact.detail ? ` · ${artifact.detail}` : ""}
            </li>
          ))}
        </ul>
      ) : null}
      {retryError ? <div role="alert" className="mt-3 text-xs text-red-300">{retryError}</div> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {canRetry ? (
          <button
            type="button"
            disabled={retrying}
            aria-label={spatialStageActionLabel(node.stage as CanvasSpatialRetryStage, label)}
            onClick={(event) => {
              event.stopPropagation();
              setRetrying(true);
              setRetryError("");
              void node.onRetryStage!(node.storyNodeId, node.stage as CanvasSpatialRetryStage)
                .catch((error) => setRetryError(error instanceof Error ? error.message : "阶段重试失败"))
                .finally(() => setRetrying(false));
            }}
            className="nodrag rounded-lg border border-blue-500/50 px-3 py-2 text-xs text-blue-200 hover:bg-blue-500/10 disabled:opacity-50">
            {retrying ? "处理中" : spatialStageActionLabel(node.stage as CanvasSpatialRetryStage, label)}
          </button>
        ) : null}
        <button
          type="button"
          aria-label={`打开${label} ${node.storyTitle}`}
          onClick={(event) => {
            event.stopPropagation();
            node.onOpenStage(node.storyNodeId, node.stage);
          }}
          className="nodrag rounded-lg border border-slate-600 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800">
          在画布中操作
        </button>
      </div>
    </article>
  );
}
