import type { ProductionGraphStore } from "./production-graph-store";
import type { ProductionGraphServerAvailability } from "./feature-flag";
import {
  ProductionGraphBusinessError,
  type ProductionGraphPatch,
  type ProductionGraphSnapshot,
  type ProductionRunRestorePayload,
  type ProductionRunUpdatePayload,
} from "./types";

/**
 * ProductionGraph Socket 适配器。
 *
 * 把以下事件映射到 ProductionGraphStore：
 * - productionGraph:snapshot -> store.applySnapshot；payload 为 null 时进入 disabled 回退
 * - productionGraph:patch   -> store.applyPatch（受 baseRevision/revision 守护）
 * - productionRun:update    -> store.recordLegacyProductionRun（兼容迁移期）
 * - productionRun:restore   -> 选择活跃或可重试运行并写入 legacyProductionRun
 *
 * 关键不变量：
 * - 断线重连只触发 readGraph 重新读取快照；前端绝不向服务端补发本地 patch。
 * - 已应用的 idempotencyKey 在重连后不会被再次派发。
 * - 旧 productionRun 事件不得改写真实节点状态。
 * - 当服务端发送 productionGraph:snapshot=null（项目没有持久图），适配器关闭功能开关，
 *   让旧固定拓扑继续工作；不向上抛出 PRODUCTION_GRAPH_DISABLED。
 */

export interface ProductionGraphSocket {
  on(event: string, listener: (...args: any[]) => void): unknown;
  off?(event: string, listener?: (...args: any[]) => void): unknown;
  emit(event: string, data?: unknown): unknown;
  connected?: boolean;
}

export interface ProductionGraphSocketAdapterOptions {
  store: ProductionGraphStore;
  socket: ProductionGraphSocket;
  onServerAvailabilityChange?: (availability: ProductionGraphServerAvailability) => void;
  /**
   * 用于在重连后请求最新快照；测试可注入。
   * 生产环境默认为 () => socket.emit("productionGraph:read", { graphId: store.getSnapshot().graphId })。
   */
  requestSnapshotOnReconnect?: (socket: ProductionGraphSocket, graphId: string | null) => void;
}

const SNAPSHOT_EVENT = "productionGraph:snapshot";
const PATCH_EVENT = "productionGraph:patch";
const LEGACY_UPDATE_EVENT = "productionRun:update";
const LEGACY_RESTORE_EVENT = "productionRun:restore";
const READ_EVENT = "productionGraph:read";
const ERROR_EVENT = "productionGraph:error";

const AUTHORITATIVE_UNAVAILABLE_CODES = new Set([
  "PRODUCTION_GRAPH_DISABLED",
  "PRODUCTION_GRAPH_PROJECT_FORBIDDEN",
  "PANCAT_AUTH_REQUIRED",
]);

function asObject(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return null;
}

function asSnapshot(value: unknown): ProductionGraphSnapshot | null {
  if (value === null || value === undefined) return null;
  const record = asObject(value);
  if (!record) {
    throw new ProductionGraphBusinessError("PRODUCTION_GRAPH_DISABLED", "无效的 productionGraph:snapshot 事件", 422);
  }
  return record as unknown as ProductionGraphSnapshot;
}

function asPatch(value: unknown): ProductionGraphPatch {
  const record = asObject(value);
  if (!record) throw new ProductionGraphBusinessError("PRODUCTION_GRAPH_DISABLED", "无效的 productionGraph:patch 事件", 422);
  return record as unknown as ProductionGraphPatch;
}

function isAuthoritativeUnavailableError(value: unknown): boolean {
  const record = asObject(value);
  const nested = asObject(record?.data);
  const status = Number(record?.status ?? nested?.status);
  if (status === 401 || status === 403) return true;
  const code = String(record?.code ?? nested?.code ?? "").toUpperCase();
  if (AUTHORITATIVE_UNAVAILABLE_CODES.has(code)) return true;
  const message = String(record?.message ?? value ?? "").toLowerCase();
  return message.includes("invalid namespace")
    || message.includes("unauthorized")
    || message.includes("forbidden")
    || message.includes("authentication required");
}

function selectRestoreCandidate(payload: ProductionRunRestorePayload): ProductionRunUpdatePayload | null {
  const active = payload.active ?? payload.activeRuns ?? [];
  if (active.length) return active[0];
  const recent = payload.recent ?? payload.recentTerminalRuns ?? [];
  const retryable = recent.find((run) => {
    const status = run.status;
    return status === "failed" || status === "blocked" || status === "partial";
  });
  return retryable ?? recent[0] ?? null;
}

export interface ProductionGraphSocketAdapter {
  attach(): void;
  detach(): void;
  requestSnapshot(): void;
}

export function createProductionGraphSocketAdapter(options: ProductionGraphSocketAdapterOptions): ProductionGraphSocketAdapter {
  const { store, socket } = options;
  let attached = false;

  const handleSnapshot = (raw: unknown) => {
    const snapshot = asSnapshot(raw);
    if (!snapshot) {
      // 服务端发送 null 表示项目尚未拥有持久图；切回旧固定拓扑而不是抛错。
      store.setFeatureEnabled(false);
      options.onServerAvailabilityChange?.("unavailable");
      return;
    }
    options.onServerAvailabilityChange?.("available");
    store.applySnapshot(snapshot);
  };
  const handlePatch = (raw: unknown) => {
    const patch = asPatch(raw);
    store.applyPatch(patch);
  };
  const handleLegacyUpdate = (raw: unknown) => {
    const record = asObject(raw) as ProductionRunUpdatePayload | null;
    if (!record) return;
    store.recordLegacyProductionRun({
      graphId: record.graphId,
      runId: record.runId,
      status: record.status,
      stage: record.stage,
      attempt: record.attempt,
      error: record.error ?? null,
      updatedAt: record.updatedAt,
    });
  };
  const handleLegacyRestore = (raw: unknown) => {
    const record = asObject(raw) as ProductionRunRestorePayload | null;
    if (!record) return;
    const candidate = selectRestoreCandidate(record);
    if (!candidate) {
      store.clearLegacyProductionRun();
      return;
    }
    handleLegacyUpdate(candidate);
  };
  const handleConnect = () => {
    if (!store.getSnapshot().featureEnabled) return;
    const graphId = store.getSnapshot().graphId;
    const fallback = options.requestSnapshotOnReconnect;
    if (fallback) fallback(socket, graphId);
    else if (graphId) socket.emit(READ_EVENT, { graphId });
  };
  const handleConnectError = (error: unknown) => {
    if (isAuthoritativeUnavailableError(error)) {
      options.onServerAvailabilityChange?.("unavailable");
    }
  };
  const handleDisconnect = (reason: unknown) => {
    if (reason === "io server disconnect") {
      options.onServerAvailabilityChange?.("unavailable");
    }
  };
  const handleServerError = (error: unknown) => {
    if (isAuthoritativeUnavailableError(error)) {
      options.onServerAvailabilityChange?.("unavailable");
    }
  };

  return {
    attach() {
      if (attached) return;
      attached = true;
      socket.on(SNAPSHOT_EVENT, handleSnapshot);
      socket.on(PATCH_EVENT, handlePatch);
      socket.on(LEGACY_UPDATE_EVENT, handleLegacyUpdate);
      socket.on(LEGACY_RESTORE_EVENT, handleLegacyRestore);
      socket.on(ERROR_EVENT, handleServerError);
      socket.on("connect", handleConnect);
      socket.on("reconnect", handleConnect);
      socket.on("connect_error", handleConnectError);
      socket.on("disconnect", handleDisconnect);
    },
    detach() {
      if (!attached) return;
      attached = false;
      if (typeof socket.off === "function") {
        socket.off(SNAPSHOT_EVENT, handleSnapshot);
        socket.off(PATCH_EVENT, handlePatch);
        socket.off(LEGACY_UPDATE_EVENT, handleLegacyUpdate);
        socket.off(LEGACY_RESTORE_EVENT, handleLegacyRestore);
        socket.off(ERROR_EVENT, handleServerError);
        socket.off("connect", handleConnect);
        socket.off("reconnect", handleConnect);
        socket.off("connect_error", handleConnectError);
        socket.off("disconnect", handleDisconnect);
      }
    },
    requestSnapshot() {
      const graphId = store.getSnapshot().graphId;
      const fallback = options.requestSnapshotOnReconnect;
      if (fallback) fallback(socket, graphId);
      else if (graphId) socket.emit(READ_EVENT, { graphId });
    },
  };
}
