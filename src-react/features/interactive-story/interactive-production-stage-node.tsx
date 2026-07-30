import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Boxes, ClipboardCheck, Clapperboard, Film, ListVideo, Table2 } from "lucide-react";

import type { ProductionFlowData, ProductionGenerationData, ProductionState } from "@react/features/production";
import type { InteractiveProductionStage } from "./interactive-production-topology";

export interface InteractiveProductionStageNodeData extends Record<string, unknown> {
  storyNodeId: string;
  storyTitle: string;
  stage: Exclude<InteractiveProductionStage, "script">;
  flow?: ProductionFlowData;
  generation?: ProductionGenerationData;
  onOpenStage: (storyNodeId: string, stage: InteractiveProductionStage) => void;
}

const stageLabels: Record<Exclude<InteractiveProductionStage, "script">, string> = {
  scriptPlan: "导演计划",
  assets: "资产工厂",
  storyboardTable: "分镜表",
  storyboard: "分镜图",
  workbench: "视频工作台",
  supervision: "监督验收",
};

const stageIcons = {
  scriptPlan: Clapperboard,
  assets: Boxes,
  storyboardTable: Table2,
  storyboard: ListVideo,
  workbench: Film,
  supervision: ClipboardCheck,
};

function aggregateState(states: ProductionState[]): ProductionState {
  if (states.includes("running")) return "running";
  if (states.includes("failed")) return "failed";
  if (states.length > 0 && states.every((state) => state === "completed")) return "completed";
  return "idle";
}

function describeStage(data: InteractiveProductionStageNodeData): { state: ProductionState; summary: string } {
  const flow = data.flow;
  if (!flow) return { state: "running", summary: "正在读取节点生产数据" };
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
  if (data.stage === "workbench") {
    const tracks = data.generation?.trackList ?? [];
    const selected = tracks.filter((track) => track.selectVideoId != null).length;
    return {
      state: aggregateState(tracks.map((track) => track.state)),
      summary: tracks.length ? `${tracks.length} 条视频轨道，${selected} 条已选定素材；包含剪辑与成片` : "等待视频、剪辑与成片",
    };
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

export function InteractiveProductionStageNode({ id, data }: NodeProps) {
  const node = data as InteractiveProductionStageNodeData;
  const Icon = stageIcons[node.stage];
  const status = describeStage(node);
  const label = stageLabels[node.stage];
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
        <span className={`rounded border px-2 py-1 text-[11px] ${stateStyles[status.state]}`}>{stateLabels[status.state]}</span>
      </header>
      <p className="mt-4 min-h-12 whitespace-pre-wrap text-xs leading-5 text-slate-300">{status.summary}</p>
      <button
        type="button"
        aria-label={`打开${label} ${node.storyTitle}`}
        onClick={(event) => {
          event.stopPropagation();
          node.onOpenStage(node.storyNodeId, node.stage);
        }}
        className="nodrag mt-3 rounded-lg border border-slate-600 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800">
        在画布中操作
      </button>
    </article>
  );
}
