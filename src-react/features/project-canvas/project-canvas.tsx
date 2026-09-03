import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Handle, Position, type NodeProps, type NodeTypes, type ReactFlowInstance } from "@xyflow/react";
import {
  Bot,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  Layers3,
  MapPin,
  Menu,
  PanelRight,
  Pause,
  Play,
  RotateCcw,
  Send,
  Settings,
  Sparkles,
  X,
} from "lucide-react";

import { AgentConsole, createAgentChatClient, type AgentChatClient, type AgentSocketFactory, type SourceImportRequest, type SourceImportResult } from "@react/features/agents";
import { CanvasAgentPanel, InfiniteCanvas } from "@react/features/canvas";
import type { InteractiveStoryGraph } from "@react/features/interactive-story";
import {
  type ProductionGraphActionDispatcher,
  type ProductionGraphNode,
  type ProductionGraphSnapshot,
  useProductionGraphWiring,
  type UseProductionGraphWiring,
} from "@react/features/production-graph";
import type { ProductionGraphActionInput, ProductionGraphActionName } from "@react/features/production-graph/types";
import { clearProjectGoalDraft, parseGoalConstraints, readProjectGoalDraft } from "@react/features/projects";
import type { HodorApiClient } from "@react/lib/api/client";
import {
  canvasFramingKey,
  coordinateProjectCanvasNodes,
  productionGraphMatchesInteractiveStory,
  projectCanvasFitViewOptions,
  shouldReframeCanvas,
  type ProjectCanvasNode,
  type ProjectCanvasNodeData,
  type ProjectCanvasViewport,
} from "./project-canvas-node-coordinator";

export interface ProjectCanvasProps {
  projectId: number;
  projectType: string;
  apiBaseUrl: string;
  getToken: () => string | null;
  initialModule?: ProjectCanvasModuleId | null;
  initialScriptId?: number;
  initialEpisodeId?: number;
  initialView?: "agent" | "workbench";
  openInitialModuleWithoutSnapshot?: boolean;
  interactiveGraph?: InteractiveStoryGraph | null;
  moduleRenderers?: ProjectCanvasModuleRenderers;
  wiring?: UseProductionGraphWiring;
  /** 传入后画布会创建与抽屉共享的真实 AgentChatClient（scriptAgent，项目级通道）。 */
  apiClient?: HodorApiClient;
  /** 测试可注入伪造 socket；生产环境默认通过 socket.io 连接现有智能体通道。 */
  agentSocketFactory?: AgentSocketFactory;
  /** 完全注入已装配好的智能体客户端（测试用）；优先于 apiClient 内部创建。 */
  agentClient?: AgentChatClient;
  /** 项目智能体完成一轮工作后重新读取互动剧情图。 */
  onRefreshInteractiveGraph?: () => void | Promise<void>;
  /** 从全屏画布进入阶段智能体与模型配置。 */
  onOpenModelSettings?: () => void;
  /** 将拖入或选择的原文导入当前项目，并交给当前项目智能体。 */
  onImportSource?: (source: SourceImportRequest) => Promise<SourceImportResult>;
}

export const PROJECT_CANVAS_MODULES = [
  { id: "goal", label: "目标", eyebrow: "MISSION" },
  { id: "story", label: "原文/剧本", eyebrow: "STORY" },
  { id: "casting", label: "选角", eyebrow: "CASTING" },
  { id: "assets", label: "资产", eyebrow: "ASSETS" },
  { id: "storyboards", label: "分镜", eyebrow: "STORYBOARD" },
  { id: "production", label: "生产", eyebrow: "OUTPUT" },
  { id: "interactive", label: "互动", eyebrow: "INTERACTIVE" },
] as const;

export type ProjectCanvasModuleId = (typeof PROJECT_CANVAS_MODULES)[number]["id"];
export type ProjectCanvasModuleRenderContext = {
  projectId: number;
  projectType: string;
  scriptId?: number;
  episodeId?: number;
  view?: "agent" | "workbench";
};
export type ProjectCanvasModuleRenderers = Partial<Record<ProjectCanvasModuleId, (context: ProjectCanvasModuleRenderContext) => ReactNode>>;

/** 与项目智能体一起发送的画布上下文：当前阶段、选中节点与图版本（消息每次发送时读取）。 */
export interface CanvasAgentContext {
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

/** 画布节点动作的中文标签：节点检查器动作按钮与反馈文案共用。 */
const CANVAS_NODE_ACTION_LABELS: Record<ProductionGraphActionName, string> = {
  readGraph: "刷新图",
  changeScope: "调整范围",
  startReady: "启动就绪节点",
  pause: "暂停节点",
  resumeOrRetry: "恢复或重试",
  adoptCandidate: "采用候选",
};

/** 节点动作的确定性前缀 + 随机后缀，保证服务端幂等去重。 */
function randomCanvasNodeActionIdempotencyKey(): string {
  const random = Math.random().toString(36).slice(2, 10);
  const time = Date.now().toString(36);
  return `canvas-node-action-${time}-${random}`;
}

export function projectCanvasGoalIdempotencyKey(projectId: number, objective: string): string {
  let hash = 2166136261;
  for (const character of objective.trim()) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return `canvas-bootstrap-${projectId}-${(hash >>> 0).toString(16)}`;
}

const NODE_STATUS: Record<ProjectCanvasNodeData["status"], { label: string; tone: string }> = {
  draft: { label: "草稿", tone: "text-slate-400" },
  blocked: { label: "阻塞", tone: "text-zinc-300" },
  ready: { label: "就绪", tone: "text-zinc-200" },
  queued: { label: "排队", tone: "text-zinc-300" },
  running: { label: "运行中", tone: "text-zinc-200" },
  paused: { label: "已暂停", tone: "text-slate-200" },
  waiting_decision: { label: "等待决定", tone: "text-zinc-200" },
  succeeded: { label: "已完成", tone: "text-zinc-300" },
  failed: { label: "失败", tone: "text-zinc-300" },
  cancelled: { label: "已取消", tone: "text-slate-400" },
};

/** 卡片「下一步」动作提示：由节点状态推导，与节点检查器动作保持同一心智模型。 */
const NODE_NEXT_ACTION: Record<ProjectCanvasNodeData["status"], string> = {
  draft: "待启动",
  blocked: "等待上游",
  ready: "启动执行",
  queued: "排队中",
  running: "运行中",
  paused: "恢复执行",
  waiting_decision: "等待决定",
  succeeded: "已完成",
  failed: "重试",
  cancelled: "已取消",
};

export interface CanvasStageStatusSummary {
  running: number;
  pending: number;
  failed: number;
  waiting: number;
}

/**
 * 从生产图节点状态聚合「运行中 / 待处理 / 失败 / 等待决定」四类数量，
 * 供顶部阶段栏与移动端阶段菜单展示层级状态。
 */
export function summarizeCanvasStageStatus(snapshot: ProductionGraphSnapshot | null): CanvasStageStatusSummary {
  if (!snapshot) return { running: 0, pending: 0, failed: 0, waiting: 0 };
  let running = 0;
  let pending = 0;
  let failed = 0;
  let waiting = 0;
  for (const node of snapshot.nodes) {
    if (node.status === "running" || node.status === "queued") running += 1;
    else if (node.status === "ready") pending += 1;
    else if (node.status === "failed" || node.status === "blocked" || node.status === "cancelled") failed += 1;
    else if (node.status === "waiting_decision") waiting += 1;
  }
  return { running, pending, failed, waiting };
}

function GraphNodeCard({ data, selected }: NodeProps<ProjectCanvasNode>) {
  const status = NODE_STATUS[data.status];
  const nextAction = NODE_NEXT_ACTION[data.status];
  // 互动剧情节点卡片更宽、标题/摘要完整展示；普通生产节点保持紧凑卡片与两行截断。
  const isInteractiveStory = data.source === "interactive-story";
  return (
    <div
      data-testid={`project-canvas-node-${data.graphNode.id}`}
      className={`${isInteractiveStory ? "w-[400px]" : "w-[300px]"} rounded-xl border bg-[#121212]/95 px-4 py-3 shadow-xl backdrop-blur ${
        selected ? "border-zinc-300/80 ring-2 ring-zinc-300/20" : "border-slate-700/70"
      }`}>
      <Handle type="target" position={Position.Left} className="!size-2 !border-0 !bg-slate-500" />
      <div className="flex items-start justify-between gap-4">
        <div className={`min-w-0 ${isInteractiveStory ? "flex-1" : ""}`}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{data.graphNode.kind}</p>
          <h3
            className={`mt-1 break-words text-sm font-semibold leading-5 text-slate-100 ${
              isInteractiveStory ? "" : "line-clamp-2"
            }`}>
            {data.title}
          </h3>
        </div>
        <CircleDashed className={`size-4 shrink-0 ${status.tone}`} />
      </div>
      <p
        className={`mt-3 text-xs leading-5 ${
          isInteractiveStory ? "whitespace-pre-wrap break-words text-slate-300" : "line-clamp-2 text-slate-400"
        }`}>
        {data.objective}
      </p>
      <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-800/80 pt-2">
        <span className={`inline-flex items-center rounded-md border border-slate-700/60 bg-slate-950/60 px-1.5 py-0.5 font-medium ${status.tone}`}>
          {status.label}
        </span>
        <span className="flex min-w-0 items-center gap-1 text-[10px] text-slate-500">
          <span className="shrink-0 uppercase tracking-[0.14em]">下一步</span>
          <span className="truncate text-slate-200">{nextAction}</span>
        </span>
      </div>
      <Handle type="source" position={Position.Right} className="!size-2 !border-0 !bg-zinc-300" />
    </div>
  );
}

const nodeTypes: NodeTypes = { "production-graph": GraphNodeCard };

function graphEdges(snapshot: ProductionGraphSnapshot, interactive: InteractiveStoryGraph | null) {
  const productionEdges = (productionGraphMatchesInteractiveStory(snapshot, interactive) ? snapshot.edges : []).map((edge) => ({
    id: edge.id,
    source: edge.sourceNodeId,
    target: edge.targetNodeId,
    type: "smoothstep",
    animated: snapshot.nodes.some((node) => node.id === edge.targetNodeId && node.status === "running"),
    style: { stroke: "#535353", strokeWidth: 1.5 },
  }));
  const interactiveEdges = (interactive?.edges ?? []).map((edge) => ({
    id: `interactive:${interactive!.id}:${edge.id}`,
    source: `interactive:${interactive!.id}:${edge.sourceNodeId}`,
    target: `interactive:${interactive!.id}:${edge.targetNodeId}`,
    type: "smoothstep",
    animated: interactive?.nodes.some((node) => node.id === edge.targetNodeId && node.status === "producing") ?? false,
    label: edge.choiceText,
    style: { stroke: "#a6a6a6", strokeWidth: 1.5 },
  }));
  return [...productionEdges, ...interactiveEdges];
}

function goalNode(
  projectId: number,
  objective: string,
  projectType: string,
  options?: { id?: string; graphId?: string; constraints?: { code: string; params: Record<string, unknown> }[] },
): ProductionGraphNode {
  const now = Date.now();
  return {
    id: options?.id ?? `goal-project-${projectId}`,
    graphId: options?.graphId ?? `pending-project-${projectId}`,
    kind: "goal",
    title: projectType === "interactive" ? "互动剧生产目标" : "项目生产目标",
    objective,
    status: "ready",
    inputRefs: [],
    outputRefs: [],
    constraints: options?.constraints ?? [],
    evidence: [],
    budget: { currency: "USD", oneTimeCost: 0, recurringCost: 0 },
    attempt: 0,
    capabilityId: null,
    agentRunId: null,
    checkpointId: null,
    checkpointReason: null,
    createdAt: now,
    updatedAt: now,
  };
}

function GoalPrompt({
  onSubmit,
  onOpenModelSettings,
  busy,
  error,
  initialObjective = "",
  initialConstraints = "",
}: {
  onSubmit: (objective: string, constraints: string) => void;
  onOpenModelSettings?: () => void;
  busy: boolean;
  error: string | null;
  initialObjective?: string;
  initialConstraints?: string;
}) {
  const [objective, setObjective] = useState(initialObjective);
  const [constraints, setConstraints] = useState(initialConstraints);
  const confirmed = initialObjective.trim().length > 0;
  return (
    <section className="relative mx-auto flex min-h-dvh max-w-5xl items-center px-6 py-16" data-testid="project-canvas-goal-prompt">
      <div className="relative w-full overflow-hidden rounded-[2rem] border border-slate-700/80 bg-[#121212]/95 p-8 shadow-[0_30px_100px_rgba(0,0,0,.45)] md:p-14">
        {onOpenModelSettings ? (
          <button
            type="button"
            aria-label="模型设置"
            onClick={onOpenModelSettings}
            className="absolute right-8 top-8 inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 transition hover:border-zinc-300/50 hover:text-zinc-100">
            <Settings className="size-4" />
            模型设置
          </button>
        ) : (
          <div className="absolute right-8 top-8 text-zinc-300/70">
            <Sparkles className="size-7" />
          </div>
        )}
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-zinc-300">制作工作台 / 01</p>
        <h1 className="mt-5 max-w-2xl text-4xl font-semibold tracking-tight text-slate-50 md:text-6xl">
          {confirmed ? "确认你的制作目标" : "先说说你想完成什么"}
        </h1>
        <p className="mt-5 max-w-xl text-base leading-7 text-slate-400">
          {confirmed
            ? "目标与约束已从项目入口带入，确认后画布会为你建立可恢复的项目流程。"
            : "把目标交给 Hodor，画布会为你建立可恢复的项目流程。普通制作和互动剧从同一块工作区开始。"}
        </p>
        <form
          className="mt-10 max-w-3xl"
          onSubmit={(event) => {
            event.preventDefault();
            if (objective.trim()) onSubmit(objective.trim(), constraints.trim());
          }}>
          <label htmlFor="production-goal" className="mb-3 block text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
            生产目标
          </label>
          <textarea
            id="production-goal"
            aria-label="生产目标"
            value={objective}
            onChange={(event) => setObjective(event.target.value)}
            placeholder="例如：做一支 60 秒的雨夜悬疑短片，保留可编辑的分镜和素材关系"
            rows={4}
            className="w-full resize-none rounded-2xl border border-slate-700 bg-[#0b0b0b] px-5 py-4 text-base leading-7 text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-zinc-300/70 focus:ring-4 focus:ring-zinc-300/10"
          />
          <label htmlFor="production-constraints" className="mb-3 mt-5 block text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
            必要约束
          </label>
          <textarea
            id="production-constraints"
            aria-label="必要约束"
            value={constraints}
            onChange={(event) => setConstraints(event.target.value)}
            placeholder={"时长、画幅、风格、预算等，一行一条。例如：\n不超过 60 秒\n竖屏 9:16"}
            rows={3}
            className="w-full resize-none rounded-2xl border border-slate-700 bg-[#0b0b0b] px-5 py-4 text-base leading-7 text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-zinc-300/70 focus:ring-4 focus:ring-zinc-300/10"
          />
          {error ? (
            <p role="alert" className="mt-3 text-sm text-zinc-300">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={busy || !objective.trim()}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-zinc-300 px-5 py-3 text-sm font-semibold text-[#131313] transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50">
            {busy ? "正在建立项目流程…" : confirmed ? "开始执行" : "创建生产目标"}
            <Send className="size-4" />
          </button>
        </form>
      </div>
    </section>
  );
}

function GoalModule({ snapshot, onAppend }: { snapshot: ProductionGraphSnapshot | null; onAppend: (objective: string) => Promise<string | null> }) {
  const goal = snapshot?.nodes.find((node) => node.kind === "goal");
  const [objective, setObjective] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
        <p className="text-sm font-semibold text-slate-100">{goal?.title ?? "生产目标"}</p>
        <p className="mt-2 text-sm leading-6 text-slate-400">{goal?.objective ?? "尚未创建生产目标。"}</p>
      </div>
      <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-3 text-xs text-slate-300">
        <Check className="size-4 text-zinc-300" />
        目标与项目流程同步更新
      </div>
      <form
        className="rounded-xl border border-slate-800 bg-slate-950/60 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!objective.trim() || busy) return;
          setBusy(true);
          setError(null);
          void onAppend(objective.trim())
            .then((message) => {
              setError(message);
              if (!message) setObjective("");
            })
            .finally(() => setBusy(false));
        }}>
        <label htmlFor="append-project-goal" className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
          追加目标
        </label>
        <textarea
          id="append-project-goal"
          aria-label="追加目标"
          value={objective}
          onChange={(event) => setObjective(event.target.value)}
          rows={3}
          placeholder="例如：基于现有素材再补一支 15 秒预告片"
          className="mt-3 w-full resize-none rounded-xl border border-slate-700 bg-[#0b0b0b] px-4 py-3 text-sm leading-6 text-slate-100 outline-none placeholder:text-slate-600 focus:border-zinc-300/70"
        />
        {error ? (
          <p role="alert" className="mt-2 text-xs text-zinc-300">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={!snapshot || !objective.trim() || busy}
          className="mt-3 rounded-lg bg-zinc-300 px-4 py-2 text-xs font-semibold text-[#131313] disabled:opacity-50">
          {busy ? "正在追加…" : "追加到画布"}
        </button>
      </form>
    </div>
  );
}

function ModulePanel({
  module,
  snapshot,
  renderers,
  context,
  onAppendGoal,
  onClose,
}: {
  module: ProjectCanvasModuleId;
  snapshot: ProductionGraphSnapshot | null;
  renderers?: ProjectCanvasModuleRenderers;
  context: ProjectCanvasModuleRenderContext;
  onAppendGoal: (objective: string) => Promise<string | null>;
  onClose: () => void;
}) {
  const item = PROJECT_CANVAS_MODULES.find((entry) => entry.id === module)!;
  const content =
    module === "goal" ? (
      <GoalModule snapshot={snapshot} onAppend={onAppendGoal} />
    ) : (
      (renderers?.[module]?.(context) ?? <p className="text-sm leading-6 text-slate-400">该模块暂未提供业务组件。</p>)
    );
  const status = summarizeCanvasStageStatus(snapshot);
  return (
    <aside
      role="dialog"
      aria-label={`${item.label}模块`}
      data-testid={`module-host-${module}`}
      data-canvas-overlay="module"
      className="absolute bottom-3 left-3 top-[4.25rem] z-50 flex min-h-0 w-[min(52rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-zinc-200/20 bg-[#111111]/95 shadow-2xl backdrop-blur-xl max-md:inset-x-0 max-md:top-0 max-md:w-auto max-md:rounded-none max-md:border-x-0 max-md:border-b-0">
      <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-800 px-5 py-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-300">{item.eyebrow}</p>
          <h2 className="mt-1 text-xl font-semibold text-slate-50">{item.label}模块</h2>
        </div>
        <div className="flex items-center gap-3">
          {status.running > 0 ? (
            <span className="hidden items-center gap-1.5 text-[11px] text-zinc-200 sm:flex">
              <span className="size-1.5 animate-pulse rounded-full bg-zinc-300" />
              运行中 {status.running}
            </span>
          ) : null}
          <button
            type="button"
            aria-label={`关闭${item.label}模块`}
            onClick={onClose}
            className="rounded-md border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 transition hover:border-zinc-300/50 hover:text-slate-100">
            关闭
          </button>
        </div>
      </div>
      <div data-module-host className="relative h-full min-h-0 flex-1 overflow-y-auto px-5 py-4 [contain:content]">
        {content}
      </div>
    </aside>
  );
}

const NODE_ACTION_ICONS: Partial<Record<ProductionGraphActionName, typeof Play>> = {
  startReady: Play,
  pause: Pause,
  resumeOrRetry: RotateCcw,
  adoptCandidate: CheckCircle2,
};

/**
 * 轻量节点检查器：仅在选中节点时出现，承载节点详情、图版本与节点级动作；
 * 未选中节点时不渲染，不占用任何常驻栏位。
 */
function Inspector({
  node,
  snapshot,
  onAction,
  onClose,
}: {
  node: ProductionGraphNode;
  snapshot: ProductionGraphSnapshot | null;
  onAction: (action: ProductionGraphActionName) => Promise<{ ok: boolean; error?: string }>;
  onClose: () => void;
}) {
  const status = NODE_STATUS[node.status];
  const [busy, setBusy] = useState<ProductionGraphActionName | null>(null);
  const [notice, setNotice] = useState<{ action: ProductionGraphActionName; ok: boolean; error?: string } | null>(null);

  async function run(action: ProductionGraphActionName) {
    if (busy) return;
    setBusy(action);
    setNotice(null);
    const result = await onAction(action);
    setNotice({ action, ...result });
    setBusy(null);
  }

  return (
    <aside
      aria-label="节点检查器"
      data-canvas-overlay="inspector"
      className="absolute left-3 top-[4.25rem] z-30 w-80 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border border-slate-700/80 bg-[#111111]/95 shadow-2xl backdrop-blur-xl max-md:inset-x-3 max-md:bottom-24 max-md:top-auto max-md:max-h-[45%] max-md:w-auto max-md:rounded-lg">
      <div className="flex items-center justify-between gap-3 border-b border-slate-800/80 px-4 py-2.5">
        <span className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          <PanelRight className="size-3.5" />
          节点检查器
        </span>
        <button
          type="button"
          aria-label="关闭节点检查器"
          onClick={onClose}
          className="grid size-7 place-items-center rounded-md hover:bg-white/5 hover:text-slate-200">
          <X className="size-4" />
        </button>
      </div>
      <div className="max-h-[calc(100dvh-9.5rem)] space-y-3 overflow-y-auto px-4 py-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{node.kind}</p>
          <h2 className="mt-0.5 text-sm font-semibold leading-5 text-slate-100">{node.title}</h2>
          <p className="mt-1.5 line-clamp-3 text-xs leading-5 text-slate-400">{node.objective}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className={`rounded-md border border-slate-700/70 bg-slate-950/60 px-2 py-1 ${status.tone}`}>{status.label}</span>
        </div>
        <div className="border-t border-slate-800/80 pt-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">节点动作</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(["startReady", "pause", "resumeOrRetry", "adoptCandidate"] as const).map((action) => {
              const Icon = NODE_ACTION_ICONS[action];
              return (
                <button
                  key={action}
                  type="button"
                  aria-label={CANVAS_NODE_ACTION_LABELS[action]}
                  disabled={busy !== null}
                  onClick={() => void run(action)}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-950/60 px-2 py-1 text-[11px] text-slate-300 transition hover:border-zinc-300/50 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-40">
                  {Icon ? <Icon className="size-3" /> : null}
                  {CANVAS_NODE_ACTION_LABELS[action]}
                </button>
              );
            })}
          </div>
          {notice ? (
            <p role="status" data-testid="inspector-action-notice" className={`mt-2 text-[11px] ${notice.ok ? "text-zinc-300" : "text-zinc-300"}`}>
              {notice.ok ? `已派发「${CANVAS_NODE_ACTION_LABELS[notice.action]}」。` : notice.error}
            </p>
          ) : null}
        </div>
        {/* 次要位置：技术性同步信息只以弱化文本与 title 呈现，不进入常驻画布。 */}
        <p
          data-testid="inspector-graph-version"
          title={`graphId ${snapshot?.graphId ?? "—"} · revision ${snapshot?.revision ?? "—"} · node ${node.id}`}
          className="pt-1 text-[10px] leading-4 text-slate-600">
          项目流程已同步
        </p>
      </div>
    </aside>
  );
}

/** 智能体抽屉内的紧凑上下文条：当前阶段 / 作用域；内部图术语只进 title 属性。 */
function AgentContextStrip({
  stageLabel,
  nodeTitle,
  graphId,
  revision,
}: {
  stageLabel: string;
  nodeTitle: string | null;
  graphId: string | null;
  revision: number | null;
}) {
  const technical = graphId != null ? `graphId ${graphId} · revision ${revision ?? "—"}` : null;
  return (
    <div
      data-testid="agent-context-strip"
      aria-label="画布上下文"
      title={technical ?? undefined}
      className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-slate-800/80 bg-[#0f0f0f] px-4 py-2 text-[11px]">
      <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-700/70 bg-slate-950/60 px-2 py-1 text-slate-200">
        <MapPin className="size-3 text-zinc-300/80" />
        {stageLabel}
      </span>
      <span className="inline-flex max-w-48 items-center gap-1.5 rounded-md border border-slate-700/70 bg-slate-950/60 px-2 py-1 text-slate-200">
        <CircleDashed className="size-3 text-zinc-300/80" />
        <span className="truncate">{nodeTitle ?? "整个项目流程"}</span>
      </span>
    </div>
  );
}

export function ProjectCanvas({
  projectId,
  projectType,
  apiBaseUrl,
  getToken,
  initialModule = null,
  initialScriptId,
  initialEpisodeId,
  initialView,
  openInitialModuleWithoutSnapshot = false,
  interactiveGraph = null,
  moduleRenderers,
  wiring: injectedWiring,
  apiClient,
  agentSocketFactory,
  agentClient: injectedAgentClient,
  onRefreshInteractiveGraph,
  onOpenModelSettings,
  onImportSource,
}: ProjectCanvasProps) {
  const liveWiring = useProductionGraphWiring({ projectId, apiBaseUrl, getToken });
  const wiring = injectedWiring ?? liveWiring;
  const state = useSyncExternalStore(wiring.store.subscribe, wiring.store.getSnapshot, wiring.store.getSnapshot);
  const snapshot = state.snapshot;
  const [nodes, setNodes] = useState<ProjectCanvasNode[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [activeModule, setActiveModule] = useState<ProjectCanvasModuleId | null>(initialModule);
  const [agentOpen, setAgentOpen] = useState(false);
  const [goalBusy, setGoalBusy] = useState(false);
  const [goalError, setGoalError] = useState<string | null>(null);
  const [mobileStageOpen, setMobileStageOpen] = useState(false);
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<ProjectCanvasNode> | null>(null);
  const [overlayCloseCount, setOverlayCloseCount] = useState(0);
  const layoutTimerRef = useRef(0);
  const canvasAreaRef = useRef<HTMLElement | null>(null);
  const previousFramingKeyRef = useRef<string | null>(null);
  const previousOverlayOpenRef = useRef(false);
  const goalDraft = useMemo(() => readProjectGoalDraft(), []);
  // 覆盖层触发焦点：关闭模块 / 抽屉 / 检查器时把焦点还给打开它们的控件。
  const overlayTriggersRef = useRef<Partial<Record<"module" | "agent" | "inspector", HTMLElement | null>>>({});
  // 智能体聊天上下文随最新画布状态变化，messageContext 每次发送时读取该 ref。
  const canvasContextRef = useRef<CanvasAgentContext>({
    projectId,
    projectType,
    stage: null,
    stageLabel: "画布总览",
    selectedNodeId: null,
    nodeTitle: null,
    checkpointId: null,
    graphId: null,
    revision: null,
  });

  const rememberOverlayTrigger = useCallback((kind: "module" | "agent" | "inspector") => {
    const active = document.activeElement;
    overlayTriggersRef.current[kind] = active instanceof HTMLElement ? active : null;
  }, []);

  const restoreOverlayFocus = useCallback((kind: "module" | "agent" | "inspector") => {
    const trigger = overlayTriggersRef.current[kind];
    overlayTriggersRef.current[kind] = null;
    if (trigger && document.contains(trigger)) trigger.focus({ preventScroll: true });
  }, []);

  // 打开阶段模块：所有视口统一单焦点——同时关闭智能体抽屉与节点检查器，
  // 避免左右覆盖层夹住画布；再次点击同一模块则关闭自身，切换其它模块同理。
  const toggleActiveModule = useCallback(
    (module: ProjectCanvasModuleId) => {
      rememberOverlayTrigger("module");
      setActiveModule((current) => (current === module ? null : module));
      setAgentOpen(false);
      setSelectedNodeId(null);
    },
    [rememberOverlayTrigger],
  );

  // 打开智能体抽屉：所有视口统一单焦点——同时关闭阶段模块与节点检查器。
  const openAgentPanel = useCallback(() => {
    rememberOverlayTrigger("agent");
    setActiveModule(null);
    setSelectedNodeId(null);
    setAgentOpen(true);
  }, [rememberOverlayTrigger]);

  // 读取画布容器尺寸，用于单节点布局落在视口视觉中心；未测量到（如 jsdom）时交给协调器默认视口。
  const readCanvasViewport = useCallback((): ProjectCanvasViewport | undefined => {
    const area = canvasAreaRef.current;
    if (!area || area.clientWidth <= 0 || area.clientHeight <= 0) return undefined;
    return { width: area.clientWidth, height: area.clientHeight };
  }, []);

  useEffect(() => {
    if (!snapshot) return;
    const viewport = readCanvasViewport();
    setNodes((current) => coordinateProjectCanvasNodes(snapshot, interactiveGraph, new Map(current.map((node) => [node.id, node])), viewport));
  }, [interactiveGraph, readCanvasViewport, snapshot]);

  useEffect(
    () => () => {
      window.clearTimeout(layoutTimerRef.current);
    },
    [],
  );

  // 取景决策 key：首次加载、graphId/revision 变化、覆盖层关闭时变化 → fitView；
  // 普通重渲染与用户拖动画布不改变 key，不会反复重置视口。
  const framingKey = useMemo(
    () => canvasFramingKey({
      graphId: snapshot?.graphId ?? null,
      revision: snapshot?.revision ?? null,
      interactiveGraphId: interactiveGraph?.id ?? null,
      interactiveRevision: interactiveGraph?.revision ?? null,
      overlayCloseCount,
    }),
    [interactiveGraph?.id, interactiveGraph?.revision, overlayCloseCount, snapshot?.graphId, snapshot?.revision],
  );

  // 覆盖层（阶段模块 / Agent 抽屉 / 节点检查器）从打开到关闭时计数 +1，并入 framing key。
  useEffect(() => {
    const overlayOpen = activeModule !== null || agentOpen || selectedNodeId !== null;
    if (previousOverlayOpenRef.current && !overlayOpen) {
      setOverlayCloseCount((count) => count + 1);
    }
    previousOverlayOpenRef.current = overlayOpen;
  }, [activeModule, agentOpen, selectedNodeId]);

  useEffect(() => {
    if (!flowInstance || nodes.length === 0) return;
    if (!shouldReframeCanvas(previousFramingKeyRef.current, framingKey)) return;
    previousFramingKeyRef.current = framingKey;
    layoutTimerRef.current = window.setTimeout(() => void flowInstance.fitView(projectCanvasFitViewOptions(nodes.length)), 60);
  }, [flowInstance, framingKey, nodes.length]);

  // 画布容器尺寸变化后重新取景，保证节点始终落在可视中心（resize 不打断用户拖动后的取景）。
  useEffect(() => {
    const area = canvasAreaRef.current;
    if (!area) return;
    let lastWidth = area.clientWidth;
    let lastHeight = area.clientHeight;
    let timer = 0;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const nextWidth = entry.contentRect.width;
      const nextHeight = entry.contentRect.height;
      if (nextWidth === lastWidth && nextHeight === lastHeight) return;
      lastWidth = nextWidth;
      lastHeight = nextHeight;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (flowInstance && nodes.length > 0) {
          void flowInstance.fitView(projectCanvasFitViewOptions(nodes.length));
        }
      }, 120);
    });
    observer.observe(area);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, [flowInstance, nodes.length]);

  const edges = useMemo(() => (snapshot ? graphEdges(snapshot, interactiveGraph) : []), [interactiveGraph, snapshot]);
  const selectedNode = nodes.find((node) => node.id === selectedNodeId)?.data.graphNode ?? null;
  const moduleContext = useMemo(
    () => ({ projectId, projectType, scriptId: initialScriptId, episodeId: initialEpisodeId, view: initialView }),
    [initialEpisodeId, initialScriptId, initialView, projectId, projectType],
  );
  const visibleModules = PROJECT_CANVAS_MODULES;
  const stageStatus = useMemo(() => summarizeCanvasStageStatus(snapshot), [snapshot]);
  const stageItem = activeModule ? (visibleModules.find((module) => module.id === activeModule) ?? null) : null;
  const stageLabel = stageItem?.label ?? "画布总览";

  // 每次渲染都刷新智能体消息上下文，保证发送时携带最新阶段 / 选中节点 / 图版本。
  canvasContextRef.current = {
    projectId,
    projectType,
    stage: activeModule,
    stageLabel,
    selectedNodeId: selectedNodeId,
    nodeTitle: selectedNode?.title ?? null,
    checkpointId: wiring.contextBridge.getSelection().checkpointId,
    graphId: snapshot?.graphId ?? null,
    revision: snapshot?.revision ?? null,
  };

  // 项目智能体抽屉是唯一对话入口，使用现有 socket.io 客户端，不新增平行聊天。
  const agentClient = useMemo(() => {
    if (injectedAgentClient) return injectedAgentClient;
    if (!apiClient) return null;
    return createAgentChatClient({
      agentType: "scriptAgent",
      projectId,
      apiBaseUrl,
      getToken,
      apiClient,
      socketFactory: agentSocketFactory,
      initialMessages: [
        {
          id: "canvas-agent-welcome",
          role: "assistant",
          status: "complete",
          datetime: "",
          content: [
            {
              type: "text",
              status: "complete",
              data: "我是项目智能体，与画布共享上下文：当前阶段与选中的节点会随指令一起发送。",
            },
          ],
        },
      ],
      messageContext: () => ({ ...canvasContextRef.current }),
    });
  }, [agentSocketFactory, apiBaseUrl, apiClient, getToken, injectedAgentClient, projectId]);

  useEffect(() => {
    if (!agentClient || !onRefreshInteractiveGraph) return;
    let previousActivity = agentClient.getSnapshot().activity;
    return agentClient.subscribe(() => {
      const activity = agentClient.getSnapshot().activity;
      const finishedWork = (previousActivity === "pending" || previousActivity === "streaming") && activity === "idle";
      previousActivity = activity;
      if (finishedWork) void onRefreshInteractiveGraph();
    });
  }, [agentClient, onRefreshInteractiveGraph]);

  // Escape 按层级关闭最上层覆盖层：阶段模块 > 智能体抽屉 > 节点检查器。
  useEffect(() => {
    function handleCanvasEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      const target = event.target instanceof Element ? event.target : null;
      const overlay = target?.closest?.("[data-canvas-overlay]");
      if (target && overlay) {
        const kind = overlay.getAttribute("data-canvas-overlay");
        if (kind === "module") {
          // 焦点在模块内容里的业务嵌套弹层（编辑/导入等对话框、菜单）时，先交由内层处理。
          const nested = target.closest('[role="dialog"], [role="menu"]');
          if (nested && nested !== overlay) return;
        }
        if (kind === "agent") {
          // 抽屉内的思考级别/设置菜单自行监听 Escape；这里只关闭抽屉本身。
          if (target.closest('[role="menu"]')) return;
        }
      }
      if (activeModule) {
        setActiveModule(null);
        restoreOverlayFocus("module");
      } else if (agentOpen) {
        setAgentOpen(false);
        restoreOverlayFocus("agent");
      } else if (selectedNodeId) {
        setSelectedNodeId(null);
        restoreOverlayFocus("inspector");
      }
    }
    window.addEventListener("keydown", handleCanvasEscape);
    return () => window.removeEventListener("keydown", handleCanvasEscape);
  }, [activeModule, agentOpen, restoreOverlayFocus, selectedNodeId]);

  useEffect(() => {
    setActiveModule(initialModule ?? null);
  }, [initialModule]);

  const createGoal = useCallback(
    async (objective: string, constraints = "") => {
      setGoalBusy(true);
      setGoalError(null);
      const input: ProductionGraphActionInput = {
        action: "changeScope",
        idempotencyKey: projectCanvasGoalIdempotencyKey(projectId, objective),
        expectedRevision: 0,
        nodesUpsert: [goalNode(projectId, objective, projectType, { constraints: parseGoalConstraints(constraints) })],
        nodeIdsRemoved: [],
        edgesUpsert: [],
        edgeIdsRemoved: [],
      };
      const result = await wiring.dispatcher.dispatch(input);
      if (result.ok) clearProjectGoalDraft();
      if (!result.ok) setGoalError(result.error?.message ?? "项目流程创建失败，请稍后重试。");
      setGoalBusy(false);
    },
    [projectId, projectType, wiring.dispatcher],
  );

  const runAutoLayout = useCallback(
    (instance: ReactFlowInstance<ProjectCanvasNode> | null) => {
      if (!snapshot) return;
      // 传入空的 previous 映射，强制按确定性拓扑重新摆放，消除手动拖动造成的重叠。
      setNodes(coordinateProjectCanvasNodes(snapshot, interactiveGraph, new Map(), readCanvasViewport()));
      if (instance) {
        const nodeCount = snapshot.nodes.length + (interactiveGraph?.nodes.length ?? 0);
        layoutTimerRef.current = window.setTimeout(() => void instance.fitView(projectCanvasFitViewOptions(nodeCount)), 60);
      }
    },
    [interactiveGraph, readCanvasViewport, snapshot],
  );

  // 节点级动作：节点检查器统一派发，全部走 productionGraph:action。
  const runNodeAction = useCallback(
    async (action: ProductionGraphActionName, nodeId: string): Promise<{ ok: boolean; error?: string }> => {
      if (!snapshot) return { ok: false, error: "项目流程尚未就绪，无法执行节点动作。" };
      const idempotencyKey = randomCanvasNodeActionIdempotencyKey();
      const expectedRevision = snapshot.revision;
      let input: ProductionGraphActionInput;
      if (action === "startReady" || action === "pause" || action === "resumeOrRetry") {
        input = { action, idempotencyKey, expectedRevision, nodeIds: [nodeId] };
      } else if (action === "adoptCandidate") {
        const node = snapshot.nodes.find((item) => item.id === nodeId);
        const candidate = node?.outputRefs.find((ref) => ref.kind === "candidate" && ref.authority === "pancat");
        const target = node?.outputRefs.find((ref) => ref.kind === "asset" || ref.kind === "workspace");
        if (!node || !candidate || !target) return { ok: false, error: "节点缺少可采用的候选或目标引用，无法执行「采用候选」。" };
        input = { action: "adoptCandidate", idempotencyKey, expectedRevision, nodeId, candidate, target };
      } else {
        return { ok: false, error: "该动作不适用于节点检查器。" };
      }
      const result = await wiring.dispatcher.dispatch(input);
      return result.ok ? { ok: true } : { ok: false, error: result.error?.message ?? "未知错误" };
    },
    [snapshot, wiring.dispatcher],
  );

  const appendGoal = useCallback(
    async (objective: string): Promise<string | null> => {
      if (!snapshot) return "项目流程尚未就绪。";
      const idempotencyKey = projectCanvasGoalIdempotencyKey(projectId, objective);
      const nodeId = `goal-project-${projectId}-${idempotencyKey.slice(idempotencyKey.lastIndexOf("-") + 1)}`;
      const input: ProductionGraphActionInput = {
        action: "changeScope",
        idempotencyKey,
        expectedRevision: snapshot.revision,
        nodesUpsert: [goalNode(projectId, objective, projectType, { id: nodeId, graphId: snapshot.graphId })],
        nodeIdsRemoved: [],
        edgesUpsert: [],
        edgeIdsRemoved: [],
      };
      const result = await wiring.dispatcher.dispatch(input);
      return result.ok ? null : (result.error?.message ?? "目标追加失败，请稍后重试。");
    },
    [projectId, projectType, snapshot, wiring.dispatcher],
  );

  if (!snapshot && (!activeModule || !openInitialModuleWithoutSnapshot)) {
    return (
      <GoalPrompt
        onSubmit={(objective, constraints) => void createGoal(objective, constraints)}
        onOpenModelSettings={onOpenModelSettings}
        busy={goalBusy}
        error={goalError}
        initialObjective={goalDraft?.goal ?? ""}
        initialConstraints={goalDraft?.constraints ?? ""}
      />
    );
  }

  return (
    <main
      data-testid="project-canvas-shell"
      data-project-type={projectType}
      className="relative h-dvh w-full overflow-hidden bg-[#0b0b0b] text-slate-100">
      <header className="absolute inset-x-0 top-0 z-50 flex h-14 items-center justify-between gap-4 border-b border-slate-800/80 bg-[#0f0f0f]/95 px-3 backdrop-blur-xl md:px-5">
        {/* 第一部分：项目身份 */}
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-lg border border-zinc-300/40 bg-zinc-300/10 text-zinc-200">
            <Layers3 className="size-4" />
          </div>
          <div className="min-w-0">
            <p className="hidden text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400 sm:block">制作工作台</p>
            <h1 className="truncate text-sm font-semibold leading-4 text-slate-50">
              项目 #{projectId} <span className="text-slate-500">·</span> {projectType === "interactive" ? "互动剧" : "普通制作"}
            </h1>
          </div>
        </div>
        {/* 第二部分：阶段切换 */}
        <nav aria-label="画布阶段栏" data-testid="project-canvas-stage-bar" className="hidden items-center gap-1 md:flex">
          {visibleModules.map((module, index) => (
            <span key={module.id} className="flex items-center">
              <button
                type="button"
                aria-label={`打开${module.label}模块`}
                aria-pressed={activeModule === module.id}
                onClick={() => toggleActiveModule(module.id)}
                className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-sm font-medium transition ${
                  activeModule === module.id
                    ? "border-zinc-300/40 bg-zinc-300/10 text-zinc-200"
                    : "border-transparent text-slate-300 hover:bg-white/5 hover:text-slate-100"
                }`}>
                <span
                  className={`grid size-5 place-items-center rounded-full border text-[10px] font-semibold ${
                    activeModule === module.id ? "border-zinc-300 bg-zinc-300 text-[#131313]" : "border-slate-500 text-slate-400"
                  }`}>
                  {index + 1}
                </span>
                {module.label}
                {activeModule === module.id && stageStatus.running > 0 ? (
                  <span className="size-1.5 animate-pulse rounded-full bg-zinc-300" aria-label="阶段运行中" />
                ) : null}
              </button>
              {index < visibleModules.length - 1 ? <ChevronRight className="mx-0.5 size-3 text-slate-600" /> : null}
            </span>
          ))}
        </nav>
        {/* 第三、四部分：运行状态与 Agent */}
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            aria-label="打开阶段菜单"
            aria-expanded={mobileStageOpen}
            onClick={() => setMobileStageOpen((open) => !open)}
            className="grid size-8 shrink-0 place-items-center rounded-lg border border-slate-600 text-slate-300 md:hidden">
            <Menu className="size-4" />
          </button>
          {mobileStageOpen ? (
            <div
              data-testid="project-canvas-mobile-stage-menu"
              role="menu"
              aria-label="阶段菜单"
              className="absolute inset-x-3 top-[4.5rem] z-50 rounded-xl border border-slate-700 bg-[#111111]/95 p-2 shadow-2xl backdrop-blur-xl md:hidden">
              {visibleModules.map((module, index) => (
                <button
                  key={module.id}
                  type="button"
                  role="menuitem"
                  aria-label={`打开${module.label}模块`}
                  aria-pressed={activeModule === module.id}
                  onClick={() => {
                    toggleActiveModule(module.id);
                    setMobileStageOpen(false);
                  }}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${activeModule === module.id ? "bg-zinc-300/10 text-zinc-200" : "text-slate-200 hover:bg-white/5 hover:text-slate-50"}`}>
                  <span
                    className={`grid size-5 place-items-center rounded-full border text-[10px] ${activeModule === module.id ? "border-zinc-300 bg-zinc-300 text-[#131313]" : "border-slate-500 text-slate-400"}`}>
                    {index + 1}
                  </span>
                  {module.label}
                  {activeModule === module.id && stageStatus.running > 0 ? (
                    <span className="ml-auto size-1.5 animate-pulse rounded-full bg-zinc-300" />
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}
          <span data-testid="canvas-stage-status" aria-label="画布运行状态" className="hidden items-center gap-2 sm:flex">
            {stageStatus.running > 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700/60 bg-zinc-950/40 px-2 py-1 text-[11px] font-medium text-zinc-200">
                <span className="size-1.5 animate-pulse rounded-full bg-zinc-300" />
                运行中 {stageStatus.running}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700/60 bg-zinc-950/40 px-2 py-1 text-[11px] font-medium text-zinc-200">
                <span className="size-1.5 rounded-full bg-zinc-300" />
                已就绪
              </span>
            )}
            {stageStatus.pending > 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700/60 bg-zinc-950/40 px-2 py-1 text-[11px] font-medium text-zinc-200">
                待处理 {stageStatus.pending}
              </span>
            ) : null}
            {stageStatus.failed > 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700/60 bg-zinc-950/40 px-2 py-1 text-[11px] font-medium text-zinc-300">
                失败 {stageStatus.failed}
              </span>
            ) : null}
            {stageStatus.waiting > 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700/60 bg-zinc-950/40 px-2 py-1 text-[11px] font-medium text-zinc-200">
                等待决定 {stageStatus.waiting}
              </span>
            ) : null}
          </span>
          {onOpenModelSettings ? (
            <button
              type="button"
              aria-label="模型设置"
              onClick={onOpenModelSettings}
              className="grid size-9 shrink-0 place-items-center rounded-lg border border-slate-600 text-slate-300 transition hover:border-zinc-300/50 hover:text-zinc-100"
              title="模型设置">
              <Settings className="size-4" />
            </button>
          ) : null}
          <button
            type="button"
            aria-label="打开项目智能体"
            aria-pressed={agentOpen}
            onClick={() => (agentOpen ? setAgentOpen(false) : openAgentPanel())}
            className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
              agentOpen ? "border-zinc-300/60 bg-zinc-300/10 text-zinc-200" : "border-slate-600 text-slate-200 hover:border-zinc-300/50 hover:text-zinc-200"
            }`}>
            <Bot className="mr-1.5 inline size-4" />
            Agent
          </button>
        </div>
      </header>

      <section ref={canvasAreaRef} className="absolute inset-x-0 bottom-0 top-14" aria-label="统一项目画布" data-canvas-framing-key={framingKey}>
        <div className="relative h-full min-h-0">
          <InfiniteCanvas<ProjectCanvasNode>
            nodes={nodes}
            edges={edges}
            onNodesChange={(changes) =>
              setNodes((current) =>
                current.map((node) => {
                  const change = changes.find((entry) => "id" in entry && entry.id === node.id);
                  if (!change || change.type !== "position" || !change.position) return node;
                  return { ...node, position: change.position };
                }),
              )
            }
            nodeTypes={nodeTypes}
            ariaLabel="项目流程画布"
            testId="project-canvas-infinite-canvas"
            onInit={setFlowInstance}
            onAutoLayout={runAutoLayout}
            onNodeClick={(node) => {
              rememberOverlayTrigger("inspector");
              // 选中节点打开检查器：所有视口统一单焦点——同时关闭阶段模块与 Agent 抽屉。
              setActiveModule(null);
              setAgentOpen(false);
              setSelectedNodeId(node.id);
              wiring.contextBridge.setSelection({ selectedNodeId: node.id, checkpointId: node.data.graphNode.checkpointId });
            }}
            onNodeDoubleClick={(node) => {
              // 直接使用当前节点取景，避免 state 闭包过期导致聚焦到旧选择。
              rememberOverlayTrigger("inspector");
              setActiveModule(null);
              setAgentOpen(false);
              setSelectedNodeId(node.id);
              void flowInstance?.fitView({ nodes: [node], padding: 0.4, maxZoom: 1.6, duration: 240 });
            }}
            leadingControls={
              <div
                data-testid="canvas-flow-status"
                aria-label="项目流程同步状态"
                className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950/95 px-3 py-2 text-xs shadow-lg">
                <span className="font-semibold uppercase tracking-[0.14em] text-slate-300">项目流程</span>
                {snapshot ? (
                  <span className="inline-flex items-center gap-1.5 font-medium text-zinc-300">
                    <span className="size-1.5 rounded-full bg-zinc-300" />
                    已同步
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 font-medium text-zinc-200">
                    <span className="size-1.5 animate-pulse rounded-full bg-zinc-300" />
                    待同步
                  </span>
                )}
              </div>
            }
          />
          {activeModule ? (
            <ModulePanel
              module={activeModule}
              snapshot={snapshot}
              renderers={moduleRenderers}
              context={moduleContext}
              onAppendGoal={appendGoal}
              onClose={() => {
                setActiveModule(null);
                restoreOverlayFocus("module");
              }}
            />
          ) : null}
          {selectedNode ? (
            <Inspector
              node={selectedNode}
              snapshot={snapshot}
              onAction={(action) => runNodeAction(action, selectedNode.id)}
              onClose={() => {
                setSelectedNodeId(null);
                restoreOverlayFocus("inspector");
              }}
            />
          ) : null}
          <CanvasAgentPanel
            open={agentOpen}
            onOpenChange={(open) => {
              if (open) {
                rememberOverlayTrigger("agent");
                // 打开 Agent：所有视口统一单焦点——同时关闭阶段模块与节点检查器。
                setActiveModule(null);
                setSelectedNodeId(null);
              } else {
                restoreOverlayFocus("agent");
              }
              setAgentOpen(open);
            }}
            label="项目智能体"
            name="项目智能体"
            minimumWidth={400}
            showCollapsedTrigger={false}
            zIndex={40}
            overlayKind="agent">
            {agentClient ? (
              <div className="flex h-full min-h-0 flex-col bg-[#0f0f0f] text-slate-100">
                <AgentContextStrip
                  stageLabel={stageLabel}
                  nodeTitle={selectedNode?.title ?? null}
                  graphId={snapshot?.graphId ?? null}
                  revision={snapshot?.revision ?? null}
                />
                <div className="min-h-0 flex-1">
                  <AgentConsole client={agentClient} title="项目智能体" display="panel" onImportSource={onImportSource} />
                </div>
              </div>
            ) : (
              <div className="flex h-full min-h-0 flex-col bg-[#0f0f0f] text-slate-100">
                <AgentContextStrip
                  stageLabel={stageLabel}
                  nodeTitle={selectedNode?.title ?? null}
                  graphId={snapshot?.graphId ?? null}
                  revision={snapshot?.revision ?? null}
                />
                <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-center text-xs leading-5 text-slate-500">
                  未配置项目智能体客户端：请在画布中选中节点，用节点检查器查看详情并执行节点动作。
                </div>
              </div>
            )}
          </CanvasAgentPanel>
        </div>
      </section>
    </main>
  );
}
