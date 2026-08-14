import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { Handle, Position, type NodeProps, type NodeTypes } from "@xyflow/react";
import { Bot, Check, ChevronRight, CircleDashed, Layers3, PanelRight, Send, Sparkles, X } from "lucide-react";

import { CanvasAgentPanel, InfiniteCanvas } from "@react/features/canvas";
import type { InteractiveStoryGraph } from "@react/features/interactive-story";
import {
  ProductionGraphConsole,
  type ProductionGraphNode,
  type ProductionGraphSnapshot,
  useProductionGraphWiring,
  type UseProductionGraphWiring,
} from "@react/features/production-graph";
import type { ProductionGraphActionInput } from "@react/features/production-graph/types";
import { coordinateProjectCanvasNodes, type ProjectCanvasNode, type ProjectCanvasNodeData } from "./project-canvas-node-coordinator";

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
export type ProjectCanvasModuleRenderers = Partial<
  Record<ProjectCanvasModuleId, (context: ProjectCanvasModuleRenderContext) => ReactNode>
>;

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
  blocked: { label: "阻塞", tone: "text-rose-300" },
  ready: { label: "就绪", tone: "text-amber-200" },
  queued: { label: "排队", tone: "text-sky-300" },
  running: { label: "运行中", tone: "text-sky-200" },
  paused: { label: "已暂停", tone: "text-slate-200" },
  waiting_decision: { label: "等待决定", tone: "text-amber-200" },
  succeeded: { label: "已完成", tone: "text-emerald-300" },
  failed: { label: "失败", tone: "text-rose-300" },
  cancelled: { label: "已取消", tone: "text-slate-400" },
};

function GraphNodeCard({ data, selected }: NodeProps<ProjectCanvasNode>) {
  const status = NODE_STATUS[data.status];
  return (
    <div
      data-testid={`project-canvas-node-${data.graphNode.id}`}
      className={`min-w-56 rounded-xl border bg-[#10151d]/95 px-4 py-3 shadow-2xl backdrop-blur ${
        selected ? "border-amber-300/80 ring-2 ring-amber-300/20" : "border-slate-700/80"
      }`}>
      <Handle type="target" position={Position.Left} className="!size-2 !border-0 !bg-slate-500" />
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{data.graphNode.kind}</p>
          <h3 className="mt-1 text-sm font-semibold leading-5 text-slate-100">{data.title}</h3>
        </div>
        <CircleDashed className={`size-4 shrink-0 ${status.tone}`} />
      </div>
      <p className="mt-3 line-clamp-2 text-xs leading-5 text-slate-400">{data.objective}</p>
      <div className="mt-3 flex items-center justify-between border-t border-slate-800 pt-2 text-[10px]">
        <span className={status.tone}>{status.label}</span>
        <span className="text-slate-600">#{data.graphNode.id}</span>
      </div>
      <Handle type="source" position={Position.Right} className="!size-2 !border-0 !bg-amber-300" />
    </div>
  );
}

const nodeTypes: NodeTypes = { "production-graph": GraphNodeCard };

function graphEdges(snapshot: ProductionGraphSnapshot, interactive: InteractiveStoryGraph | null) {
  const productionEdges = snapshot.edges.map((edge) => ({
    id: edge.id,
    source: edge.sourceNodeId,
    target: edge.targetNodeId,
    type: "smoothstep",
    animated: snapshot.nodes.some((node) => node.id === edge.targetNodeId && node.status === "running"),
    style: { stroke: "#475569", strokeWidth: 1.5 },
  }));
  const interactiveEdges = (interactive?.edges ?? []).map((edge) => ({
    id: `interactive:${interactive!.id}:${edge.id}`,
    source: `interactive:${interactive!.id}:${edge.sourceNodeId}`,
    target: `interactive:${interactive!.id}:${edge.targetNodeId}`,
    type: "smoothstep",
    animated: interactive?.nodes.some((node) => node.id === edge.targetNodeId && node.status === "producing") ?? false,
    label: edge.choiceText,
    style: { stroke: "#f59e0b", strokeWidth: 1.5 },
  }));
  return [...productionEdges, ...interactiveEdges];
}

function goalNode(projectId: number, objective: string, projectType: string, options?: { id?: string; graphId?: string }): ProductionGraphNode {
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
    constraints: [],
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

function GoalPrompt({ onSubmit, busy, error }: { onSubmit: (objective: string) => void; busy: boolean; error: string | null }) {
  const [objective, setObjective] = useState("");
  return (
    <section className="relative mx-auto flex min-h-[calc(100vh-5rem)] max-w-5xl items-center px-6 py-16" data-testid="project-canvas-goal-prompt">
      <div className="pointer-events-none absolute inset-10 rounded-[2rem] border border-amber-200/10 bg-[radial-gradient(circle_at_70%_20%,rgba(245,158,11,.12),transparent_36%),linear-gradient(135deg,rgba(15,23,42,.7),rgba(8,10,15,.2))]" />
      <div className="relative w-full overflow-hidden rounded-[2rem] border border-slate-700/80 bg-[#0d121a]/95 p-8 shadow-[0_30px_100px_rgba(0,0,0,.45)] md:p-14">
        <div className="absolute right-8 top-8 text-amber-300/70"><Sparkles className="size-7" /></div>
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-300">Project canvas / 01</p>
        <h1 className="mt-5 max-w-2xl text-4xl font-semibold tracking-tight text-slate-50 md:text-6xl">先说说你想完成什么</h1>
        <p className="mt-5 max-w-xl text-base leading-7 text-slate-400">把目标交给 Hodor，画布会为你建立可恢复的生产图。普通制作和互动剧从同一块工作区开始。</p>
        <form
          className="mt-10 max-w-3xl"
          onSubmit={(event) => {
            event.preventDefault();
            if (objective.trim()) onSubmit(objective.trim());
          }}>
          <label htmlFor="production-goal" className="mb-3 block text-xs font-medium uppercase tracking-[0.18em] text-slate-500">生产目标</label>
          <textarea
            id="production-goal"
            aria-label="生产目标"
            value={objective}
            onChange={(event) => setObjective(event.target.value)}
            placeholder="例如：做一支 60 秒的雨夜悬疑短片，保留可编辑的分镜和素材关系"
            rows={4}
            className="w-full resize-none rounded-2xl border border-slate-700 bg-[#080b11] px-5 py-4 text-base leading-7 text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-amber-300/70 focus:ring-4 focus:ring-amber-300/10"
          />
          {error ? <p role="alert" className="mt-3 text-sm text-rose-300">{error}</p> : null}
          <button
            type="submit"
            disabled={busy || !objective.trim()}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-amber-300 px-5 py-3 text-sm font-semibold text-[#18120a] transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50">
            {busy ? "正在建立生产图…" : "创建生产目标"}
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
      <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-3 text-xs text-slate-300"><Check className="size-4 text-emerald-300" />目标与画布 ProductionGraph 共用</div>
      <form
        className="rounded-xl border border-slate-800 bg-slate-950/60 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!objective.trim() || busy) return;
          setBusy(true);
          setError(null);
          void onAppend(objective.trim()).then((message) => {
            setError(message);
            if (!message) setObjective("");
          }).finally(() => setBusy(false));
        }}>
        <label htmlFor="append-project-goal" className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">追加目标</label>
        <textarea
          id="append-project-goal"
          aria-label="追加目标"
          value={objective}
          onChange={(event) => setObjective(event.target.value)}
          rows={3}
          placeholder="例如：基于现有素材再补一支 15 秒预告片"
          className="mt-3 w-full resize-none rounded-xl border border-slate-700 bg-[#080b11] px-4 py-3 text-sm leading-6 text-slate-100 outline-none placeholder:text-slate-600 focus:border-amber-300/70"
        />
        {error ? <p role="alert" className="mt-2 text-xs text-rose-300">{error}</p> : null}
        <button type="submit" disabled={!snapshot || !objective.trim() || busy} className="mt-3 rounded-lg bg-amber-300 px-4 py-2 text-xs font-semibold text-[#18120a] disabled:opacity-50">
          {busy ? "正在追加…" : "追加到画布"}
        </button>
      </form>
    </div>
  );
}

function ModulePanel({ module, snapshot, renderers, context, onAppendGoal, onClose }: { module: ProjectCanvasModuleId; snapshot: ProductionGraphSnapshot | null; renderers?: ProjectCanvasModuleRenderers; context: ProjectCanvasModuleRenderContext; onAppendGoal: (objective: string) => Promise<string | null>; onClose: () => void }) {
  const item = PROJECT_CANVAS_MODULES.find((entry) => entry.id === module)!;
  const content = module === "goal" ? <GoalModule snapshot={snapshot} onAppend={onAppendGoal} /> : renderers?.[module]?.(context) ?? <p className="text-sm leading-6 text-slate-400">该模块暂未提供业务组件。</p>;
  return (
    <aside role="dialog" aria-label={`${item.label}模块`} className="absolute bottom-5 left-6 top-24 z-40 w-[min(52rem,calc(100vw-3rem))] overflow-hidden rounded-2xl border border-amber-200/20 bg-[#0c1119]/95 shadow-2xl backdrop-blur-xl">
      <div className="flex items-start justify-between gap-4 border-b border-slate-800 px-5 py-4">
        <div><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-300">{item.eyebrow}</p><h2 className="mt-1 text-xl font-semibold text-slate-50">{item.label}模块</h2></div>
        <button type="button" aria-label={`关闭${item.label}模块`} onClick={onClose} className="text-xs text-slate-500 hover:text-slate-100">关闭</button>
      </div>
      <div className="h-full min-h-0 overflow-y-auto px-5 py-4">{content}</div>
    </aside>
  );
}

function Inspector({ node, onClose }: { node: ProductionGraphNode; onClose: () => void }) {
  return (
    <aside aria-label="节点检查器" className="absolute bottom-5 right-5 top-24 z-30 w-72 overflow-auto rounded-2xl border border-slate-800 bg-[#0d121a]/95 p-5 shadow-2xl backdrop-blur-xl">
      <div className="flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
        <span className="flex items-center gap-2"><PanelRight className="size-4" />检查器</span>
        <button type="button" aria-label="关闭节点检查器" onClick={onClose} className="grid size-7 place-items-center rounded-md hover:bg-white/5 hover:text-slate-200"><X className="size-4" /></button>
      </div>
      <h2 className="mt-5 text-lg font-semibold text-slate-100">{node.title}</h2><p className="mt-3 text-sm leading-6 text-slate-400">{node.objective}</p><dl className="mt-6 space-y-3 text-xs"><div className="flex justify-between gap-3"><dt className="text-slate-500">节点状态</dt><dd className="text-slate-200">{NODE_STATUS[node.status].label}</dd></div><div className="flex justify-between gap-3"><dt className="text-slate-500">稳定 ID</dt><dd className="truncate text-slate-300">{node.id}</dd></div><div className="flex justify-between gap-3"><dt className="text-slate-500">运行次数</dt><dd className="text-slate-200">{node.attempt}</dd></div></dl>
    </aside>
  );
}

export function ProjectCanvas({ projectId, projectType, apiBaseUrl, getToken, initialModule = null, initialScriptId, initialEpisodeId, initialView, openInitialModuleWithoutSnapshot = false, interactiveGraph = null, moduleRenderers, wiring: injectedWiring }: ProjectCanvasProps) {
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

  useEffect(() => {
    if (!snapshot) return;
    setNodes((current) => coordinateProjectCanvasNodes(snapshot, interactiveGraph, new Map(current.map((node) => [node.id, node]))));
  }, [interactiveGraph, snapshot]);

  const edges = useMemo(() => (snapshot ? graphEdges(snapshot, interactiveGraph) : []), [interactiveGraph, snapshot]);
  const selectedNode = nodes.find((node) => node.id === selectedNodeId)?.data.graphNode ?? null;
  const moduleContext = useMemo(() => ({ projectId, projectType, scriptId: initialScriptId, episodeId: initialEpisodeId, view: initialView }), [initialEpisodeId, initialScriptId, initialView, projectId, projectType]);

  useEffect(() => {
    setActiveModule(initialModule ?? null);
  }, [initialModule]);

  const createGoal = useCallback(async (objective: string) => {
    setGoalBusy(true);
    setGoalError(null);
    const input: ProductionGraphActionInput = {
      action: "changeScope",
      idempotencyKey: projectCanvasGoalIdempotencyKey(projectId, objective),
      expectedRevision: 0,
      nodesUpsert: [goalNode(projectId, objective, projectType)],
      nodeIdsRemoved: [],
      edgesUpsert: [],
      edgeIdsRemoved: [],
    };
    const result = await wiring.dispatcher.dispatch(input);
    if (!result.ok) setGoalError(result.error?.message ?? "生产图创建失败，请稍后重试。");
    setGoalBusy(false);
  }, [projectId, projectType, wiring.dispatcher]);

  const appendGoal = useCallback(async (objective: string): Promise<string | null> => {
    if (!snapshot) return "生产图尚未就绪。";
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
    return result.ok ? null : result.error?.message ?? "目标追加失败，请稍后重试。";
  }, [projectId, projectType, snapshot, wiring.dispatcher]);

  if (!snapshot && (!activeModule || !openInitialModuleWithoutSnapshot)) {
    return <GoalPrompt onSubmit={(objective) => void createGoal(objective)} busy={goalBusy} error={goalError} />;
  }

  return (
    <main data-testid="project-canvas-shell" data-project-type={projectType} className="relative h-screen min-h-[720px] overflow-hidden bg-[#080b11] text-slate-100">
      <header className="absolute inset-x-0 top-0 z-50 flex h-20 items-center justify-between border-b border-slate-800/80 bg-[#0b1017]/90 px-6 backdrop-blur-xl">
        <div className="flex items-center gap-4"><div className="grid size-10 place-items-center rounded-xl border border-amber-300/40 bg-amber-300/10 text-amber-200"><Layers3 className="size-5" /></div><div><p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">Hodor project canvas</p><h1 className="mt-1 text-sm font-semibold text-slate-100">项目 #{projectId} · {projectType === "interactive" ? "互动剧" : "普通制作"}</h1></div></div>
        <nav aria-label="画布阶段栏" data-testid="project-canvas-stage-bar" className="hidden items-center gap-1 md:flex">
          {PROJECT_CANVAS_MODULES.filter((module) => module.id !== "interactive" || projectType === "interactive").map((module, index) => <span key={module.id} className="flex items-center"><button type="button" aria-label={`打开${module.label}模块`} onClick={() => setActiveModule((current) => current === module.id ? null : module.id)} className={`group flex items-center gap-2 rounded-lg px-3 py-2 text-xs transition ${activeModule === module.id ? "bg-amber-300/10 text-amber-200" : "text-slate-500 hover:bg-white/5 hover:text-slate-200"}`}><span className={`grid size-5 place-items-center rounded-full border text-[10px] ${activeModule === module.id ? "border-amber-300 bg-amber-300 text-[#18120a]" : "border-slate-700"}`}>{index + 1}</span>{module.label}</button>{index < PROJECT_CANVAS_MODULES.filter((entry) => entry.id !== "interactive" || projectType === "interactive").length - 1 ? <ChevronRight className="mx-1 size-3 text-slate-700" /> : null}</span>)}
        </nav>
        <div className="flex items-center gap-3 text-xs text-slate-500"><span className="hidden items-center gap-1.5 sm:flex"><span className="size-2 rounded-full bg-emerald-300" />画布运行中</span><button type="button" aria-label="打开项目智能体" onClick={() => setAgentOpen(true)} className="rounded-lg border border-slate-700 px-3 py-2 text-slate-300 hover:border-amber-300/50 hover:text-amber-200"><Bot className="mr-1 inline size-4" />Agent</button></div>
      </header>

      <section className="absolute inset-x-0 bottom-0 top-20" aria-label="统一项目画布">
        <InfiniteCanvas<ProjectCanvasNode>
          nodes={nodes}
          edges={edges}
          onNodesChange={(changes) => setNodes((current) => current.map((node) => {
            const change = changes.find((entry) => "id" in entry && entry.id === node.id);
            if (!change || change.type !== "position" || !change.position) return node;
            return { ...node, position: change.position };
          }))}
          nodeTypes={nodeTypes}
          ariaLabel="项目生产图画布"
          testId="project-canvas-infinite-canvas"
          onNodeClick={(node) => { setSelectedNodeId(node.id); wiring.contextBridge.setSelection({ selectedNodeId: node.id, checkpointId: node.data.graphNode.checkpointId }); }}
          leadingControls={<div className="rounded-lg border border-slate-700 bg-slate-950/95 px-3 py-2 text-xs text-slate-300 shadow-lg">ProductionGraph · {snapshot ? `rev ${snapshot.revision}` : "等待连接"}</div>}
        />
        {activeModule ? <ModulePanel module={activeModule} snapshot={snapshot} renderers={moduleRenderers} context={moduleContext} onAppendGoal={appendGoal} onClose={() => setActiveModule(null)} /> : null}
        {selectedNode ? <Inspector node={selectedNode} onClose={() => setSelectedNodeId(null)} /> : null}
        <CanvasAgentPanel open={agentOpen} onOpenChange={setAgentOpen} label="项目智能体" name="项目智能体" minimumWidth={420} showCollapsedTrigger={false}>
          <div className="flex h-full min-h-0 flex-col overflow-auto bg-[#0b1017] p-4 text-slate-100"><div className="mb-4 flex items-center gap-3 border-b border-slate-800 pb-4"><div className="grid size-9 place-items-center rounded-lg bg-amber-300/10 text-amber-200"><Bot className="size-4" /></div><div><h2 className="text-sm font-semibold">项目智能体</h2><p className="text-[11px] text-slate-500">与画布共用 ProductionGraph 动作</p></div></div><ProductionGraphConsole store={wiring.store} dispatcher={wiring.dispatcher} contextBridge={wiring.contextBridge} /></div>
        </CanvasAgentPanel>
      </section>
    </main>
  );
}
