import {
  PRODUCTION_GRAPH_ACTIONS,
  ProductionGraphBusinessError,
  type ProductionGraphActionName,
  type ProductionGraphCheckpointDecision,
  type ProductionGraphEdge,
  type ProductionGraphNode,
  type ProductionGraphPatch,
  type ProductionGraphSnapshot,
} from "./types";

/**
 * ProductionGraph 前端 store。
 *
 * 单一 graphId 视图；服务端推送 snapshot 时整体替换，patch 必须满足
 * `patch.baseRevision === snapshot.revision`，且 `patch.revision >= patch.baseRevision`。
 *
 * 该 store 是事件真相的渲染源：组件只能从这里读节点、边、证据、人工控制点；
 * 不得从旧的固定七阶段或 productionRun 事件推导节点状态。
 */

export interface ProductionGraphStoreSnapshot {
  graphId: string | null;
  snapshot: ProductionGraphSnapshot | null;
  pendingPatches: ProductionGraphPatch[];
  /** 本地未完成的 patch 派发数；用于在并发提交时阻止重复派发。 */
  pendingDispatchCount: number;
  /** 已应用过的 idempotencyKey，用于在断线重连后跳过重复派发。 */
  appliedIdempotencyKeys: ReadonlySet<string>;
  /** 兼容 productionRun 事件提供的辅助进度，仅用于在 UI 中展示错误重试提示。 */
  legacyProductionRun: {
    graphId: string | null;
    runId: string | null;
    status: string | null;
    stage: string | null;
    attempt: number | null;
    error: { message?: string; retryable?: boolean } | null;
    updatedAt: string | null;
  } | null;
  featureEnabled: boolean;
  lastError: { code: string; message: string } | null;
}

export const INITIAL_PRODUCTION_GRAPH_STORE: ProductionGraphStoreSnapshot = {
  graphId: null,
  snapshot: null,
  pendingPatches: [],
  pendingDispatchCount: 0,
  appliedIdempotencyKeys: new Set<string>(),
  legacyProductionRun: null,
  featureEnabled: true,
  lastError: null,
};

export type ProductionGraphStoreListener = () => void;

export interface ProductionGraphStore {
  getSnapshot(): ProductionGraphStoreSnapshot;
  subscribe(listener: ProductionGraphStoreListener): () => void;
  setFeatureEnabled(enabled: boolean): void;
  applySnapshot(snapshot: ProductionGraphSnapshot): void;
  applyPatch(patch: ProductionGraphPatch): void;
  recordLegacyProductionRun(payload: {
    graphId?: string;
    runId?: string;
    status?: string;
    stage?: string;
    attempt?: number;
    error?: { message?: string; retryable?: boolean } | null;
    updatedAt?: string;
  }): void;
  clearLegacyProductionRun(): void;
  rememberIdempotencyKey(idempotencyKey: string): void;
  beginDispatch(idempotencyKey: string, expectedRevision: number): boolean;
  endDispatch(idempotencyKeyKey: string): void;
  recordError(error: ProductionGraphBusinessError): void;
  clearError(): void;
  reset(): void;
}

function isFresherSnapshot(current: ProductionGraphSnapshot | null, next: ProductionGraphSnapshot): boolean {
  if (!current) return true;
  if (current.graphId !== next.graphId) return true;
  return next.revision >= current.revision;
}

function upsertNode(nodes: ProductionGraphNode[], next: ProductionGraphNode): ProductionGraphNode[] {
  const index = nodes.findIndex((node) => node.id === next.id);
  if (index === -1) return [...nodes, next];
  const result = nodes.slice();
  result[index] = next;
  return result;
}

function upsertEdge(edges: ProductionGraphEdge[], next: ProductionGraphEdge): ProductionGraphEdge[] {
  const index = edges.findIndex((edge) => edge.id === next.id);
  if (index === -1) return [...edges, next];
  const result = edges.slice();
  result[index] = next;
  return result;
}

function upsertDecision(
  decisions: ProductionGraphCheckpointDecision[],
  next: ProductionGraphCheckpointDecision,
): ProductionGraphCheckpointDecision[] {
  const index = decisions.findIndex((decision) => decision.checkpointId === next.checkpointId);
  if (index === -1) return [...decisions, next];
  const result = decisions.slice();
  result[index] = next;
  return result;
}

function applyPatchToSnapshot(
  current: ProductionGraphSnapshot,
  patch: ProductionGraphPatch,
): ProductionGraphSnapshot {
  if (patch.baseRevision !== current.revision) {
    throw new ProductionGraphBusinessError(
      "PRODUCTION_GRAPH_REVISION_CONFLICT",
      `patch baseRevision ${patch.baseRevision} 与当前 revision ${current.revision} 不一致。`,
      409,
      { baseRevision: patch.baseRevision, currentRevision: current.revision },
    );
  }
  if (patch.revision < patch.baseRevision) {
    throw new ProductionGraphBusinessError(
      "PRODUCTION_GRAPH_REVISION_CONFLICT",
      `patch revision ${patch.revision} 不得小于 baseRevision ${patch.baseRevision}。`,
      409,
      { baseRevision: patch.baseRevision, revision: patch.revision },
    );
  }

  let nodes = current.nodes.slice();
  for (const upsert of patch.nodesUpsert) nodes = upsertNode(nodes, upsert);
  if (patch.nodeIdsRemoved.length) {
    const removed = new Set(patch.nodeIdsRemoved);
    nodes = nodes.filter((node) => !removed.has(node.id));
  }

  let edges = current.edges.slice();
  for (const upsert of patch.edgesUpsert) edges = upsertEdge(edges, upsert);
  if (patch.edgeIdsRemoved.length) {
    const removed = new Set(patch.edgeIdsRemoved);
    edges = edges.filter((edge) => !removed.has(edge.id));
  }

  let decisions = current.checkpointDecisions.slice();
  for (const upsert of patch.checkpointDecisionsUpsert) decisions = upsertDecision(decisions, upsert);

  return {
    ...current,
    revision: patch.revision,
    nodes,
    edges,
    checkpointDecisions: decisions,
    updatedAt: Math.max(current.updatedAt, Date.parse(patch.emittedAt) || current.updatedAt),
  };
}

export function createProductionGraphStore(initial?: Partial<ProductionGraphStoreSnapshot>): ProductionGraphStore {
  let state: ProductionGraphStoreSnapshot = { ...INITIAL_PRODUCTION_GRAPH_STORE, ...initial };
  const listeners = new Set<ProductionGraphStoreListener>();
  const appliedKeys = new Set<string>(initial?.appliedIdempotencyKeys ?? []);

  function setState(next: ProductionGraphStoreSnapshot) {
    state = next;
    listeners.forEach((listener) => listener());
  }

  function ensureAppliedKeysSet(): Set<string> {
    if (state.appliedIdempotencyKeys === appliedKeys) return appliedKeys;
    for (const key of state.appliedIdempotencyKeys) appliedKeys.add(key);
    return appliedKeys;
  }

  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setFeatureEnabled(enabled) {
      if (state.featureEnabled === enabled) return;
      setState({ ...state, featureEnabled: enabled, lastError: null });
    },
    applySnapshot(snapshot) {
      if (!isFresherSnapshot(state.snapshot, snapshot)) return;
      ensureAppliedKeysSet();
      setState({
        ...state,
        graphId: snapshot.graphId,
        snapshot,
        pendingPatches: state.snapshot?.graphId === snapshot.graphId ? state.pendingPatches : [],
        lastError: null,
      });
    },
    applyPatch(patch) {
      if (!state.snapshot) {
        setState({ ...state, pendingPatches: [...state.pendingPatches, patch] });
        return;
      }
      if (state.snapshot.graphId !== patch.graphId) return;
      const next = applyPatchToSnapshot(state.snapshot, patch);
      setState({ ...state, snapshot: next });
    },
    recordLegacyProductionRun(payload) {
      const normalized = {
        graphId: payload.graphId ?? state.legacyProductionRun?.graphId ?? null,
        runId: payload.runId ?? null,
        status: payload.status ?? null,
        stage: payload.stage ?? null,
        attempt: payload.attempt ?? null,
        error: payload.error ?? null,
        updatedAt: payload.updatedAt ?? null,
      };
      setState({ ...state, legacyProductionRun: normalized });
    },
    clearLegacyProductionRun() {
      if (!state.legacyProductionRun) return;
      setState({ ...state, legacyProductionRun: null });
    },
    rememberIdempotencyKey(idempotencyKey) {
      if (!idempotencyKey || appliedKeys.has(idempotencyKey)) return;
      appliedKeys.add(idempotencyKey);
      setState({ ...state, appliedIdempotencyKeys: new Set(appliedKeys) });
    },
    beginDispatch(idempotencyKey, expectedRevision) {
      if (!state.snapshot) return false;
      if (state.snapshot.graphId !== state.graphId) return false;
      if (expectedRevision !== state.snapshot.revision) return false;
      if (idempotencyKey && appliedKeys.has(idempotencyKey)) return false;
      if (state.pendingDispatchCount > 0) return false;
      setState({ ...state, pendingDispatchCount: state.pendingDispatchCount + 1 });
      return true;
    },
    endDispatch(idempotencyKey) {
      if (idempotencyKey) appliedKeys.add(idempotencyKey);
      setState({
        ...state,
        pendingDispatchCount: Math.max(0, state.pendingDispatchCount - 1),
        appliedIdempotencyKeys: new Set(appliedKeys),
      });
    },
    recordError(error) {
      setState({ ...state, lastError: { code: error.code, message: error.message } });
    },
    clearError() {
      if (!state.lastError) return;
      setState({ ...state, lastError: null });
    },
    reset() {
      appliedKeys.clear();
      setState({ ...INITIAL_PRODUCTION_GRAPH_STORE, featureEnabled: state.featureEnabled });
    },
  };
}

/**
 * 计算节点是否就绪：所有 requires 边的 source 节点必须处于终态成功。
 *
 * 该函数只读取真实节点和 requires 边，绝不引入固定阶段顺序。
 */
export function isNodeReady(
  snapshot: ProductionGraphSnapshot,
  nodeId: string,
): boolean {
  const node = snapshot.nodes.find((item) => item.id === nodeId);
  if (!node) return false;
  if (node.kind === "checkpoint") return node.status === "waiting_decision";
  if (node.status === "succeeded" || node.status === "running" || node.status === "paused") return true;
  const upstream = snapshot.edges.filter((edge) => edge.targetNodeId === nodeId);
  for (const edge of upstream) {
    const source = snapshot.nodes.find((item) => item.id === edge.sourceNodeId);
    if (!source) return false;
    if (source.status !== "succeeded") return false;
  }
  return true;
}

export function selectAvailableActions(snapshot: ProductionGraphSnapshot | null): readonly ProductionGraphActionName[] {
  if (!snapshot) return PRODUCTION_GRAPH_ACTIONS;
  const allowed = new Set(snapshot.availableActions);
  return PRODUCTION_GRAPH_ACTIONS.filter((action) => allowed.has(action));
}
