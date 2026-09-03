import { useState, type FormEvent } from "react";
import { Bot, CornerDownLeft, Focus, MapPin, Send } from "lucide-react";

import type { ProductionGraphActionName } from "@react/features/production-graph/types";
import type { ProjectCanvasModuleId } from "./project-canvas";

/**
 * 画布底部居中的浮动命令坞。
 *
 * 该入口把「当前阶段」与「当前选中节点」作为显式上下文展示出来，并把用户指令
 * 连同上下文一起交给现有 Agent / ProductionGraph 动作：
 * - 指令命中六项动作关键词时，通过 ProductionGraph dispatcher 派发（nodeIds 等
 *   上下文来自 command context）；
 * - 其余指令作为自由文本交给 onAgentCommand（画布智能体通道），未提供时降级为
 *   打开项目智能体面板并明确提示当前作用域。
 * 未选中节点时，节点芯片用自然中文说明作用域为「整个项目流程」，节点动作会被拦下并提示先选中目标节点。
 *
 * 命令坞以绝对定位浮在画布之上（max-width 760px），不参与画布布局流，因此不会
 * 挤压 React Flow 主舞台；父级负责把它固定在视口底部中央。
 */

export interface CanvasSelectedNode {
  id: string;
  title: string;
}

export interface CanvasCommandContext {
  projectId: number;
  projectType: string;
  stage: ProjectCanvasModuleId | null;
  stageLabel: string;
  selectedNodeId: string | null;
  nodeTitle: string | null;
  checkpointId: string | null;
  graphId: string | null;
  revision: number | null;
}

export const COMMAND_ACTION_LABELS: Record<ProductionGraphActionName, string> = {
  readGraph: "刷新图",
  changeScope: "调整范围",
  startReady: "启动就绪节点",
  pause: "暂停节点",
  resumeOrRetry: "恢复或重试",
  adoptCandidate: "采用候选",
};

export interface ParsedCanvasCommand {
  action: ProductionGraphActionName;
  agent: false;
}

/**
 * 把指令文本解析为六项统一动作之一；未命中任何动作关键词时视为自由文本（交给智能体）。
 * 关键词匹配对大小写不敏感，支持中文动作词与英文动作名。
 */
export function parseCanvasCommandInstruction(instruction: string): ParsedCanvasCommand | { action: null; agent: true } {
  const text = instruction.trim().toLowerCase();
  if (!text) return { action: null, agent: true };
  const matches = (...keywords: string[]) => keywords.some((keyword) => text.includes(keyword));
  if (matches("刷新", "readgraph", "read graph", "refresh")) return { action: "readGraph", agent: false };
  if (matches("启动", "开始", "startready", "start ready", "start")) return { action: "startReady", agent: false };
  if (matches("暂停", "pause")) return { action: "pause", agent: false };
  if (matches("恢复", "重试", "resume", "retry")) return { action: "resumeOrRetry", agent: false };
  if (matches("采用", "采纳", "adopt")) return { action: "adoptCandidate", agent: false };
  return { action: null, agent: true };
}

/** 画布指令的确定性前缀 + 随机后缀，保证服务端幂等去重。 */
export function randomCommandIdempotencyKey(): string {
  const random = Math.random().toString(36).slice(2, 10);
  const time = Date.now().toString(36);
  return `command-${time}-${random}`;
}

export interface CanvasCommandBarProps {
  projectId: number;
  projectType: string;
  stage: ProjectCanvasModuleId | null;
  stageLabel: string;
  selectedNode: CanvasSelectedNode | null;
  graphId: string | null;
  revision: number | null;
  checkpointId: string | null;
  status: string | null;
  disabled?: boolean;
  onFocusNode?: () => void;
  onSubmit: (instruction: string, context: CanvasCommandContext) => void | Promise<void>;
}

export function CanvasCommandBar({
  projectId,
  projectType,
  stage,
  stageLabel,
  selectedNode,
  graphId,
  revision,
  checkpointId,
  status,
  disabled = false,
  onFocusNode,
  onSubmit,
}: CanvasCommandBarProps) {
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);

  const context: CanvasCommandContext = {
    projectId,
    projectType,
    stage,
    stageLabel,
    selectedNodeId: selectedNode?.id ?? null,
    nodeTitle: selectedNode?.title ?? null,
    checkpointId,
    graphId,
    revision,
  };

  function submit(event: FormEvent) {
    event.preventDefault();
    const text = instruction.trim();
    if (!text || busy || disabled) return;
    setBusy(true);
    void Promise.resolve(onSubmit(text, context)).finally(() => {
      setBusy(false);
      setInstruction("");
    });
  }

  const placeholder = selectedNode
    ? "输入指令：启动 / 暂停 / 恢复 / 采用候选 / 刷新，或直接交给项目智能体"
    : "指令作用于整个项目流程：「刷新」可直接执行；启动 / 暂停等节点动作请先在画布选中目标节点";

  return (
    <form
      aria-label="画布统一命令入口"
      data-testid="canvas-command-bar"
      onSubmit={submit}
      className="flex w-full max-w-[760px] flex-col gap-1.5 rounded-2xl border border-slate-600/70 bg-[#0f0f0f]/95 px-2.5 py-2 shadow-[0_18px_50px_rgba(0,0,0,.55)] backdrop-blur-xl">
      <div className="flex items-center gap-2">
        <span
          data-testid="canvas-command-stage-chip"
          className="hidden h-8 shrink-0 items-center gap-1.5 rounded-lg border border-slate-600 bg-slate-950/80 px-2.5 text-[11px] sm:inline-flex">
          <MapPin className="size-3.5 text-zinc-300" />
          <span className="uppercase tracking-[0.14em] text-slate-400">阶段</span>
          <strong className="font-semibold text-slate-100">{stageLabel}</strong>
        </span>
        <span
          data-testid="canvas-command-node-chip"
          className={`inline-flex h-8 max-w-56 shrink-0 items-center gap-2 rounded-lg border px-2.5 text-[11px] ${
            selectedNode ? "border-zinc-300/50 bg-zinc-300/10 text-zinc-100" : "border-slate-600 bg-slate-950/70 text-slate-200"
          }`}>
          <span className="truncate">
            <span className="uppercase tracking-[0.14em] text-slate-400">{selectedNode ? "当前节点" : "当前范围"}</span>
            <strong className={`ml-1.5 font-semibold ${selectedNode ? "" : "text-slate-100"}`}>{selectedNode ? selectedNode.title : "整个项目流程"}</strong>
          </span>
        </span>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <input
            aria-label="画布指令"
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            placeholder={placeholder}
            disabled={disabled}
            className="h-8 w-full min-w-0 flex-1 rounded-lg border border-slate-600 bg-[#121212] px-3 text-sm text-slate-50 outline-none transition placeholder:text-slate-500 focus:border-zinc-300/80"
          />
          <button
            type="button"
            aria-label="聚焦选中节点"
            title="把画布取景移动到选中节点"
            disabled={!selectedNode}
            onClick={onFocusNode}
            className="grid size-8 shrink-0 place-items-center rounded-lg border border-slate-600 text-slate-200 transition hover:border-zinc-300/50 hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-40">
            <Focus className="size-3.5" />
          </button>
          <button
            type="submit"
            aria-label="发送画布指令"
            disabled={disabled || busy || !instruction.trim()}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-zinc-300 px-3 text-xs font-semibold text-[#131313] transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50">
            {busy ? <CornerDownLeft className="size-3.5 animate-pulse" /> : <Send className="size-3.5" />}
            <span className="hidden sm:inline">发送</span>
          </button>
        </div>
      </div>
      {status ? (
        <p
          role="status"
          data-testid="canvas-command-status"
          className="flex items-center gap-1.5 border-t border-slate-700/70 pt-1.5 text-[11px] leading-5 text-slate-300">
          <Bot className="size-3.5 shrink-0 text-zinc-300/90" />
          <span className="truncate">{status}</span>
        </p>
      ) : null}
    </form>
  );
}
