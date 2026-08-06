import type { ProductionGraphStore } from "./production-graph-store";
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
 * - productionGraph:snapshot -> store.applySnapshot
 * - productionGraph:patch   -> store.applyPatch（受 baseRevision/revision 守护）
 * - productionRun:update    -> store.recordLegacyProductionRun（兼容迁移期）
 * - productionRun:restore   -> 选择活跃或可重试运行并写入 legacyProductionRun
 *
 * 关键不变量：
 * - 断线重连只触发 readGraph 重新读取快照；前端绝不向服务端补发本地 patch。
 * - 已应用的 idempotencyKey 在重连后不会被再次派发。
 * - 旧 productionRun 事件不得改写真实节点状态。
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
  /** 用于在重连后请求最新快照；测试可注入，生产环境通常为 () => socket.emit("productionGraph:readGraph")。 */
  requestSnapshotOnReconnect?: (socket: ProductionGraphSocket) => void;
}

const SNAPSHOT_EVENT = "productionGraph:snapshot";
const PATCH_EVENT = "productionGraph:patch";
const LEGACY_UPDATE_EVENT = "productionRun:update";
const LEGACY_RESTORE_EVENT = "productionRun:restore";

function asObject(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return null;
}

function asSnapshot(value: unknown): ProductionGraphSnapshot {
  const record = asObject(value);
  if (!record) throw new ProductionGraphBusinessError("PRODUCTION_GRAPH_DISABLED", "无效的 productionGraph:snapshot 事件", 422);
  return record as unknown as ProductionGraphSnapshot;
}

function asPatch(value: unknown): ProductionGraphPatch {
  const record = asObject(value);
  if (!record) throw new ProductionGraphBusinessError("PRODUCTION_GRAPH_DISABLED", "无效的 productionGraph:patch 事件", 422);
  return record as unknown as ProductionGraphPatch;
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

  return {
    attach() {
      if (attached) return;
      attached = true;
      socket.on(SNAPSHOT_EVENT, handleSnapshot);
      socket.on(PATCH_EVENT, handlePatch);
      socket.on(LEGACY_UPDATE_EVENT, handleLegacyUpdate);
      socket.on(LEGACY_RESTORE_EVENT, handleLegacyRestore);
    },
    detach() {
      if (!attached) return;
      attached = false;
      if (typeof socket.off === "function") {
        socket.off(SNAPSHOT_EVENT, handleSnapshot);
        socket.off(PATCH_EVENT, handlePatch);
        socket.off(LEGACY_UPDATE_EVENT, handleLegacyUpdate);
        socket.off(LEGACY_RESTORE_EVENT, handleLegacyRestore);
      }
    },
    requestSnapshot() {
      const fallback = options.requestSnapshotOnReconnect;
      if (fallback) fallback(socket);
      else socket.emit("productionGraph:readGraph");
    },
  };
}
