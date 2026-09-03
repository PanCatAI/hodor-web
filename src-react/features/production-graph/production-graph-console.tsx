import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AlertTriangle, CheckCircle2, Clock, Pause, Play, ShieldAlert } from "lucide-react";

import {
  PRODUCTION_GRAPH_ACTIONS,
  type ProductionGraphActionName,
  type ProductionGraphCheckpointDecision,
  type ProductionGraphCheckpointReason,
  type ProductionGraphEdge,
  type ProductionGraphNode,
  type ProductionGraphNodeKind,
  type ProductionGraphPatch,
  type ProductionGraphSnapshot,
} from "./types";
import type { ProductionGraphActionDispatcher } from "./production-graph-actions";
import type { ProductionGraphContextBridge } from "./production-graph-context";
import {
  createProductionGraphStore,
  isNodeReady,
  type ProductionGraphStore,
} from "./production-graph-store";

/**
 * ProductionGraph 控制台。
 *
 * 该面板只渲染来自服务端的节点和 requires 边；它不推导固定阶段顺序，
 * 也不从 productionRun 事件重建节点状态。六项动作通过 dispatcher 派发，
 * 每个按钮都映射到 readGraph / changeScope / startReady / pause / resumeOrRetry / adoptCandidate。
 */

export interface ProductionGraphConsoleProps {
  store: ProductionGraphStore;
  dispatcher: ProductionGraphActionDispatcher;
  contextBridge: ProductionGraphContextBridge;
  /** 用于 UI 调试；告诉用户功能开关是否启用。 */
  featureLabel?: string;
}

const KIND_LABELS: Record<ProductionGraphNodeKind, string> = {
  goal: "目标",
  work: "工作",
  deliverable: "交付",
  checkpoint: "人工控制点",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "草稿",
  blocked: "阻塞",
  ready: "就绪",
  queued: "排队",
  running: "运行中",
  paused: "已暂停",
  waiting_decision: "等待决定",
  succeeded: "成功",
  failed: "失败",
  cancelled: "已取消",
};

const ACTION_LABELS: Record<ProductionGraphActionName, string> = {
  readGraph: "刷新图",
  changeScope: "调整范围",
  startReady: "启动就绪节点",
  pause: "暂停节点",
  resumeOrRetry: "恢复或重试",
  adoptCandidate: "采用候选",
};

const CHECKPOINT_REASON_LABELS: Record<ProductionGraphCheckpointReason, string> = {
  cost: "费用",
  purchase: "采购",
  capital_policy: "资本政策",
  recurring_infrastructure: "持续基础设施",
  manual_review: "人工复核",
};

function randomIdempotencyKey(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 10);
  const time = Date.now().toString(36);
  return `${prefix}-${time}-${random}`;
}

function statusTone(status: string): string {
  if (status === "succeeded") return "border-emerald-700/70 bg-emerald-950/40 text-emerald-200";
  if (status === "running") return "border-blue-700/70 bg-blue-950/40 text-blue-200";
  if (status === "failed" || status === "cancelled") return "border-red-800/70 bg-red-950/40 text-red-200";
  if (status === "waiting_decision") return "border-amber-700/70 bg-amber-950/40 text-amber-200";
  if (status === "paused") return "border-slate-600 bg-slate-800/60 text-slate-200";
  if (status === "ready") return "border-violet-700/70 bg-violet-950/30 text-violet-100";
  return "border-slate-700 bg-slate-900/60 text-slate-300";
}

function topologicalOrder(nodes: ProductionGraphNode[], edges: ProductionGraphEdge[]): ProductionGraphNode[] {
  const indegree = new Map<string, number>();
  nodes.forEach((node) => indegree.set(node.id, 0));
  edges.forEach((edge) => {
    if (!indegree.has(edge.targetNodeId)) indegree.set(edge.targetNodeId, 0);
    indegree.set(edge.targetNodeId, (indegree.get(edge.targetNodeId) ?? 0) + 1);
  });
  const queue = nodes.filter((node) => (indegree.get(node.id) ?? 0) === 0).map((node) => node.id);
  const visited: ProductionGraphNode[] = [];
  const seen = new Set<string>();
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const node = nodes.find((item) => item.id === id);
    if (node) visited.push(node);
    for (const edge of edges) {
      if (edge.sourceNodeId !== id) continue;
      const next = edge.targetNodeId;
      indegree.set(next, (indegree.get(next) ?? 1) - 1);
      if ((indegree.get(next) ?? 0) <= 0) queue.push(next);
    }
  }
  for (const node of nodes) {
    if (!seen.has(node.id)) visited.push(node);
  }
  return visited;
}

function upstreamOf(snapshot: ProductionGraphSnapshot, nodeId: string): ProductionGraphNode[] {
  return snapshot.edges
    .filter((edge) => edge.targetNodeId === nodeId)
    .map((edge) => snapshot.nodes.find((node) => node.id === edge.sourceNodeId))
    .filter((node): node is ProductionGraphNode => Boolean(node));
}

function downstreamOf(snapshot: ProductionGraphSnapshot, nodeId: string): ProductionGraphNode[] {
  return snapshot.edges
    .filter((edge) => edge.sourceNodeId === nodeId)
    .map((edge) => snapshot.nodes.find((node) => node.id === edge.targetNodeId))
    .filter((node): node is ProductionGraphNode => Boolean(node));
}

function NodeRow({
  node,
  selected,
  snapshot,
  onSelect,
}: {
  node: ProductionGraphNode;
  selected: boolean;
  snapshot: ProductionGraphSnapshot;
  onSelect: (node: ProductionGraphNode) => void;
}) {
  const ready = isNodeReady(snapshot, node.id);
  const upstream = upstreamOf(snapshot, node.id);
  const downstream = downstreamOf(snapshot, node.id);
  const upstreamLabel =
    upstream.length === 0
      ? "无前置依赖"
      : `前置：${upstream.map((item) => item.title).join("、")}`;
  const downstreamLabel =
    downstream.length === 0
      ? "无下游"
      : `下游：${downstream.map((item) => item.title).join("、")}`;

  return (
    <li>
      <button
        type="button"
        aria-label={`选择节点 ${node.title}`}
        aria-pressed={selected}
        onClick={() => onSelect(node)}
        className={`flex w-full flex-col gap-1 rounded-md border px-3 py-2 text-left text-xs transition ${statusTone(
          node.status,
        )} ${selected ? "ring-2 ring-blue-400" : ""}`}>
        <span className="flex items-center justify-between gap-2">
          <span className="font-medium">{node.title}</span>
          <span className="rounded-full border border-current/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wider">
            {KIND_LABELS[node.kind]} · {STATUS_LABELS[node.status] ?? node.status}
          </span>
        </span>
        <span className="text-[11px] leading-4 opacity-80">{node.objective}</span>
        <span className="text-[10px] leading-4 opacity-60">{upstreamLabel}</span>
        <span className="text-[10px] leading-4 opacity-60">{downstreamLabel}</span>
        <span className="text-[10px] leading-4 opacity-70">
          capabilityId: {node.capabilityId ?? "—"} · ready: {ready ? "yes" : "no"} · attempt: {node.attempt}
        </span>
      </button>
    </li>
  );
}

function EvidencePanel({ node }: { node: ProductionGraphNode }) {
  if (node.evidence.length === 0) {
    return <p className="text-[11px] text-slate-500">该节点暂无证据。</p>;
  }
  return (
    <ul className="space-y-2">
      {node.evidence.map((entry) => (
        <li key={entry.code} className="rounded border border-slate-800 bg-slate-950/40 px-2 py-1 text-[11px] text-slate-200">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">{entry.code}</span>
            <span className="text-[10px] text-slate-500">{entry.capturedAt}</span>
          </div>
          <p className="leading-4 text-slate-400">{entry.summary || entry.ref.ref}</p>
        </li>
      ))}
    </ul>
  );
}

function CheckpointPanel({
  node,
  decision,
  onResolve,
}: {
  node: ProductionGraphNode;
  decision: ProductionGraphCheckpointDecision | undefined;
  onResolve: (outcome: "approved" | "rejected" | "deferred") => void;
}) {
  if (node.kind !== "checkpoint") return null;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs text-amber-200">
        <ShieldAlert className="size-4" />
        <span>
          {CHECKPOINT_REASON_LABELS[node.checkpointReason ?? "manual_review"]} 控制点 · {node.checkpointId}
        </span>
      </div>
      <p className="text-[11px] text-slate-300">{node.objective}</p>
      {decision ? (
        <p className="text-[11px] text-emerald-200">
          已记录决定：{decision.outcome} · 由 {decision.actorRef ?? "system"} 在 {decision.decisionAt} 记录
        </p>
      ) : (
        <p className="text-[11px] text-slate-500">尚未记录决定。</p>
      )}
      <div className="flex flex-wrap gap-2">
        {(["approved", "rejected", "deferred"] as const).map((outcome) => (
          <button
            key={outcome}
            type="button"
            aria-label={`提交检查点决定 ${outcome}`}
            className="rounded-md border border-amber-700/60 bg-amber-950/40 px-2 py-1 text-[11px] text-amber-100 hover:bg-amber-900/40"
            onClick={() => onResolve(outcome)}>
            {outcome === "approved" ? "批准" : outcome === "rejected" ? "拒绝" : "推迟"}
          </button>
        ))}
      </div>
    </div>
  );
}

function ActionToolbar({
  snapshot,
  selectedNode,
  dispatcher,
  onAction,
}: {
  snapshot: ProductionGraphSnapshot;
  selectedNode: ProductionGraphNode | null;
  dispatcher: ProductionGraphActionDispatcher;
  onAction: (action: ProductionGraphActionName, ack: { ok: boolean; error?: string }) => void;
}) {
  const [busy, setBusy] = useState<ProductionGraphActionName | null>(null);

  const run = useCallback(
    async (action: ProductionGraphActionName) => {
      if (busy) return;
      setBusy(action);
      try {
        let ack;
        if (action === "readGraph") {
          ack = await dispatcher.dispatch({ action: "readGraph" });
        } else if (!selectedNode) {
          onAction(action, { ok: false, error: "请先选择节点。" });
          return;
        } else {
          const expectedRevision = snapshot.revision;
          const idempotencyKey = randomIdempotencyKey(action);
          if (action === "startReady") {
            ack = await dispatcher.dispatch({
              action: "startReady",
              idempotencyKey,
              expectedRevision,
              nodeIds: [selectedNode.id],
            });
          } else if (action === "pause") {
            ack = await dispatcher.dispatch({
              action: "pause",
              idempotencyKey,
              expectedRevision,
              nodeIds: [selectedNode.id],
            });
          } else if (action === "resumeOrRetry") {
            ack = await dispatcher.dispatch({
              action: "resumeOrRetry",
              idempotencyKey,
              expectedRevision,
              nodeIds: [selectedNode.id],
              ...(selectedNode.kind === "checkpoint" && selectedNode.checkpointId
                ? {
                    checkpointDecision: {
                      checkpointId: selectedNode.checkpointId,
                      outcome: "approved" as const,
                      reason: selectedNode.checkpointReason ?? "manual_review",
                      note: "",
                    },
                  }
                : {}),
            });
          } else if (action === "adoptCandidate") {
            const candidate = selectedNode.outputRefs.find((ref) => ref.kind === "candidate" && ref.authority === "pancat");
            const target = selectedNode.outputRefs.find((ref) => ref.kind === "asset" || ref.kind === "workspace");
            if (!candidate || !target) {
              onAction(action, { ok: false, error: "节点缺少可采用的候选或目标引用。" });
              return;
            }
            ack = await dispatcher.dispatch({
              action: "adoptCandidate",
              idempotencyKey,
              expectedRevision,
              nodeId: selectedNode.id,
              candidate,
              target,
            });
          } else if (action === "changeScope") {
            ack = await dispatcher.dispatch({
              action: "changeScope",
              idempotencyKey,
              expectedRevision,
              nodesUpsert: [],
              nodeIdsRemoved: [],
              edgesUpsert: [],
              edgeIdsRemoved: [],
            });
          }
        }
        onAction(action, ack?.ok ? { ok: true } : { ok: false, error: ack?.error?.message });
      } finally {
        setBusy(null);
      }
    },
    [busy, dispatcher, onAction, selectedNode, snapshot.revision],
  );

  return (
    <div className="flex flex-wrap gap-2">
      {PRODUCTION_GRAPH_ACTIONS.map((action) => {
        const available = dispatcher.isAvailable(action);
        const requiresSelection = action !== "readGraph" && action !== "changeScope";
        const disabled = !available || busy !== null || (requiresSelection && !selectedNode);
        return (
          <button
            key={action}
            type="button"
            aria-label={ACTION_LABELS[action]}
            disabled={disabled}
            onClick={() => void run(action)}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900/70 px-3 py-1.5 text-xs text-slate-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40">
            {action === "pause" ? <Pause className="size-3.5" /> : action === "startReady" ? <Play className="size-3.5" /> : null}
            {ACTION_LABELS[action]}
          </button>
        );
      })}
    </div>
  );
}

function LegacyProductionRunBanner({ store }: { store: ProductionGraphStore }) {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const legacy = state.legacyProductionRun;
  if (!legacy) return null;
  const failed = legacy.status === "failed" || legacy.status === "blocked" || legacy.status === "partial";
  return (
    <div
      role="status"
      aria-label="兼容 productionRun 进度"
      className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${
        failed ? "border-amber-800/60 bg-amber-950/30 text-amber-100" : "border-slate-700 bg-slate-900/70 text-slate-200"
      }`}>
      {failed ? <AlertTriangle className="size-3.5 shrink-0" /> : <Clock className="size-3.5 shrink-0" />}
      <div className="flex flex-col gap-1">
        <span>
          {legacy.stage ?? "未知阶段"} · {legacy.status ?? "未知状态"}
          {legacy.attempt != null ? ` · 第 ${legacy.attempt} 次尝试` : null}
        </span>
        {legacy.error?.message ? <span className="text-[11px] opacity-80">{legacy.error.message}</span> : null}
        <span className="text-[10px] opacity-60">
          该事件来自旧 productionRun 通道，仅用于辅助提示；真实节点状态请以图为准。
        </span>
      </div>
    </div>
  );
}

export function ProductionGraphConsole({
  store,
  dispatcher,
  contextBridge,
  featureLabel,
}: ProductionGraphConsoleProps) {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const snapshot = state.snapshot;
  const [notice, setNotice] = useState<{ action: ProductionGraphActionName; ok: boolean; error?: string } | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Local React state mirrors contextBridge so clicking a node actually triggers a re-render
  // and the Inspector panel updates. The contextBridge remains the single source of truth for
  // chat context; we sync it back whenever the selection changes.
  const [selectedNodeId, setSelectedNodeIdState] = useState<string | null>(
    () => contextBridge.getSelection().selectedNodeId,
  );
  const [checkpointId, setCheckpointIdState] = useState<string | null>(
    () => contextBridge.getSelection().checkpointId,
  );

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    };
  }, []);

  const orderedNodes = useMemo(() => {
    if (!snapshot) return [];
    return topologicalOrder(snapshot.nodes, snapshot.edges);
  }, [snapshot]);

  const selectedNode = useMemo(() => {
    if (!snapshot || !selectedNodeId) return null;
    return snapshot.nodes.find((node) => node.id === selectedNodeId) ?? null;
  }, [snapshot, selectedNodeId]);

  const selectNode = useCallback(
    (node: ProductionGraphNode) => {
      const nextCheckpointId = node.checkpointId ?? checkpointId;
      setSelectedNodeIdState(node.id);
      setCheckpointIdState(nextCheckpointId);
      contextBridge.setSelection({
        selectedNodeId: node.id,
        checkpointId: nextCheckpointId,
      });
    },
    [checkpointId, contextBridge],
  );

  const handleAction = useCallback((action: ProductionGraphActionName, ack: { ok: boolean; error?: string }) => {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    setNotice({ action, ok: ack.ok, error: ack.error });
    noticeTimerRef.current = setTimeout(() => setNotice(null), 4_000);
  }, []);

  if (!state.featureEnabled) {
    return (
      <section
        aria-label="ProductionGraph v1 控制台"
        className="flex h-full min-h-0 flex-col gap-3 rounded-lg border border-slate-800 bg-[#10131b] p-4 text-slate-200">
        <header className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">ProductionGraph v1</h2>
          <span className="text-[10px] uppercase tracking-wider text-slate-500">{featureLabel ?? "feature off"}</span>
        </header>
        <p className="text-xs text-slate-400">
          功能开关已关闭，已回退到旧的固定阶段路由；图控制面板不会渲染。
        </p>
      </section>
    );
  }

  if (!snapshot) {
    return (
      <section
        aria-label="ProductionGraph v1 控制台"
        className="flex h-full min-h-0 flex-col gap-3 rounded-lg border border-slate-800 bg-[#10131b] p-4 text-slate-200">
        <header className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">ProductionGraph v1</h2>
          <span className="text-[10px] uppercase tracking-wider text-slate-500">{featureLabel ?? "feature on"}</span>
        </header>
        <p className="text-xs text-slate-400">等待服务端推送 productionGraph:snapshot …</p>
        <LegacyProductionRunBanner store={store} />
      </section>
    );
  }

  const checkpointDecision = selectedNode?.checkpointId
    ? snapshot.checkpointDecisions.find((decision) => decision.checkpointId === selectedNode.checkpointId)
    : undefined;

  return (
    <section
      aria-label="ProductionGraph v1 控制台"
      className="flex h-full min-h-0 flex-col gap-3 rounded-lg border border-slate-800 bg-[#10131b] p-4 text-slate-200">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">ProductionGraph v1</h2>
          <p className="text-[11px] text-slate-500">
            graphId <code className="rounded bg-slate-900/70 px-1 py-0.5">{snapshot.graphId}</code> · revision {snapshot.revision} · {snapshot.status}
          </p>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-slate-500">{featureLabel ?? "feature on"}</span>
      </header>

      {state.lastError ? (
        <div role="alert" className="rounded border border-red-900/60 bg-red-950/30 px-3 py-2 text-xs text-red-200">
          <span className="font-medium">{state.lastError.code}</span> · {state.lastError.message}
        </div>
      ) : null}

      {notice ? (
        <div
          role="status"
          aria-label={`动作 ${notice.action} 结果`}
          className={`rounded-md border px-3 py-2 text-xs ${
            notice.ok
              ? "border-emerald-800/60 bg-emerald-950/30 text-emerald-100"
              : "border-amber-800/60 bg-amber-950/30 text-amber-100"
          }`}>
          {notice.ok ? (
            <Fragment>
              <CheckCircle2 className="mr-1 inline size-3.5" />
              {ACTION_LABELS[notice.action]} 已派发
            </Fragment>
          ) : (
            <Fragment>
              <AlertTriangle className="mr-1 inline size-3.5" />
              {ACTION_LABELS[notice.action]} 失败：{notice.error ?? "未知错误"}
            </Fragment>
          )}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-[minmax(260px,1fr)_minmax(320px,1.4fr)]">
        <div className="flex flex-col gap-2">
          <header className="flex items-center justify-between text-xs text-slate-400">
            <span>拓扑（来自服务端 requires 边）</span>
            <span>{snapshot.nodes.length} 节点 · {snapshot.edges.length} 边</span>
          </header>
          <ul className="flex max-h-80 flex-col gap-2 overflow-y-auto pr-1">
            {orderedNodes.map((node) => (
              <NodeRow
                key={node.id}
                node={node}
                snapshot={snapshot}
                selected={selectedNode?.id === node.id}
                onSelect={selectNode}
              />
            ))}
          </ul>
          <LegacyProductionRunBanner store={store} />
        </div>

        <div className="flex flex-col gap-3">
          <div className="rounded-md border border-slate-800 bg-slate-950/40 p-3 text-xs">
            <h3 className="text-[12px] font-semibold text-slate-200">六项统一动作</h3>
            <p className="mt-1 text-[11px] text-slate-500">
              所有按钮通过 productionGraph:action 派发，服务端 ProductionActionRegistry 处理；Agent 工具走同一入口。
            </p>
            <div className="mt-2">
              <ActionToolbar
                snapshot={snapshot}
                selectedNode={selectedNode}
                dispatcher={dispatcher}
                onAction={handleAction}
              />
            </div>
          </div>

          {selectedNode ? (
            <div className="space-y-3 rounded-md border border-slate-800 bg-slate-950/40 p-3 text-xs">
              <header className="flex items-center justify-between">
                <h3 className="text-[12px] font-semibold text-slate-200">{selectedNode.title}</h3>
                <span className="text-[10px] text-slate-500">
                  {KIND_LABELS[selectedNode.kind]} · {STATUS_LABELS[selectedNode.status] ?? selectedNode.status}
                </span>
              </header>
              <p className="text-[11px] leading-5 text-slate-300">{selectedNode.objective}</p>

              <div>
                <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">证据</h4>
                <div className="mt-1">
                  <EvidencePanel node={selectedNode} />
                </div>
              </div>

              <CheckpointPanel
                node={selectedNode}
                decision={checkpointDecision}
                onResolve={(outcome) => {
                  if (!selectedNode.checkpointId) return;
                  const idempotencyKey = randomIdempotencyKey("resolve");
                  void dispatcher
                    .dispatch({
                      action: "resumeOrRetry",
                      idempotencyKey,
                      expectedRevision: snapshot.revision,
                      nodeIds: [selectedNode.id],
                      checkpointDecision: {
                        checkpointId: selectedNode.checkpointId,
                        outcome,
                        reason: selectedNode.checkpointReason ?? "manual_review",
                        note: "",
                      },
                    })
                    .then((ack) =>
                      handleAction("resumeOrRetry", ack?.ok ? { ok: true } : { ok: false, error: ack?.error?.message }),
                    );
                }}
              />
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-slate-800 bg-slate-950/30 p-3 text-xs text-slate-500">
              选择左侧节点以查看证据、控制点详情并执行动作。
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export { createProductionGraphStore };
export type { ProductionGraphSnapshot, ProductionGraphPatch };
