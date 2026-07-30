import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Clapperboard } from "lucide-react";

import type { InteractiveProductionStage } from "./interactive-production-topology";
import type { InteractiveStoryNodeKind, InteractiveStoryNodeStatus } from "./types";

export interface InteractiveStoryNodeData extends Record<string, unknown> {
  storyNodeId: string;
  title: string;
  summary: string;
  kind: InteractiveStoryNodeKind;
  status: InteractiveStoryNodeStatus;
  scriptId: number;
  entry: boolean;
  selected: boolean;
  onOpenStage: (storyNodeId: string, stage: InteractiveProductionStage) => void;
}

const kindLabels: Record<InteractiveStoryNodeKind, string> = {
  scene: "场景",
  branch: "分支",
  hub: "汇合",
  ending: "结局",
};

const statusLabels: Record<InteractiveStoryNodeStatus, string> = {
  draft: "草稿",
  ready: "可生产",
  producing: "生产中",
  completed: "已完成",
  blocked: "受阻",
};

export function InteractiveStoryFlowNode({ id, data }: NodeProps) {
  const node = data as InteractiveStoryNodeData;
  return (
    <article
      data-testid={`interactive-story-node-${node.storyNodeId}`}
      className={`w-[320px] rounded-lg border bg-[#242626] p-4 text-slate-100 shadow-sm ${
        node.selected ? "border-blue-500 ring-2 ring-blue-500/20" : "border-slate-700"
      }`}>
      <Handle id={`${id}-target`} type="target" position={Position.Left} />
      <Handle id={`${id}-source`} type="source" position={Position.Right} />
      <header className="production-node-drag-handle relative flex cursor-grab select-none items-center justify-between active:cursor-grabbing">
        <div className="w-fit rounded-bl-none rounded-br-lg rounded-tl-lg rounded-tr-none bg-black px-2.5 py-[5px] text-base text-white">
          {node.title}
        </div>
        {node.entry ? <span className="rounded border border-blue-500/40 bg-blue-500/10 px-2 py-1 text-[11px] text-blue-300">入口</span> : null}
      </header>
      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded border border-amber-700/60 bg-amber-950/40 px-2 py-1 text-amber-300">{kindLabels[node.kind]}</span>
        <span className="rounded border border-slate-600 bg-slate-900 px-2 py-1 text-slate-300">{statusLabels[node.status]}</span>
        <span className="text-slate-500">剧本 #{node.scriptId}</span>
      </div>
      <p className="mt-4 min-h-12 whitespace-pre-wrap text-sm leading-6 text-slate-300">{node.summary || "暂无节点摘要"}</p>
      <button
        type="button"
        aria-label={`打开剧本 ${node.title}`}
        onClick={(event) => {
          event.stopPropagation();
          node.onOpenStage(node.storyNodeId, "script");
        }}
        className="nodrag mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-600 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800">
        <Clapperboard className="size-3.5" />
        在画布中操作剧本
      </button>
    </article>
  );
}
