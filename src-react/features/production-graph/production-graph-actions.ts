import type { ProductionGraphStore } from "./production-graph-store";
import {
  PRODUCTION_GRAPH_ACTIONS,
  ProductionGraphBusinessError,
  type ProductionGraphActionContext,
  type ProductionGraphActionInput,
  type ProductionGraphActionName,
  type ProductionActionHandlerResult,
} from "./types";

/**
 * 六项动作派发器（前端）。
 *
 * 这是网页动作与 Agent 动作的共同入口：UI 按钮和 Agent 适配器都只能调用本函数，
 * 服务端在收到 emit("productionGraph:action", input, context) 后必须通过同一 ProductionActionRegistry
 * 处理。前端不实现业务规则，只负责：
 * - 校验 feature flag
 * - 校验 idempotencyKey/expectedRevision 形状
 * - 通过 store.beginDispatch 防止重复派发
 * - 在断线/重连后跳过已应用过的 idempotencyKey
 *
 * 接收方通过 ack 回调返回 ProductionActionHandlerResult 或 ProductionGraphBusinessError 序列化结果。
 */

export interface ProductionGraphActionDispatcherOptions {
  store: ProductionGraphStore;
  socket: ProductionGraphActionSocket;
  /** 提供当前上下文（actorRef、selectedNodeId、checkpointId 等）。 */
  buildContext: () => Omit<ProductionGraphActionContext, "featureEnabled" | "paidGenerationUsd">;
  /** 可选：在第一阶段固定 0；服务端注册表会再次守护。 */
  paidGenerationUsd?: () => number;
}

export interface ProductionGraphActionSocket {
  emit(event: string, payload: unknown, ack?: (response: ProductionActionAck) => void): unknown;
  connected?: boolean;
}

export interface ProductionActionAck {
  ok: boolean;
  result?: ProductionActionHandlerResult;
  error?: { code: string; message: string; status: number; details?: Record<string, unknown> };
}

const ACTION_EVENT = "productionGraph:action";

function assertInput(input: ProductionGraphActionInput): void {
  if (!input || typeof input !== "object") {
    throw new ProductionGraphBusinessError("PRODUCTION_ACTION_UNBOUND", "动作输入必须是一个对象", 400);
  }
  if (!PRODUCTION_GRAPH_ACTIONS.includes(input.action)) {
    throw new ProductionGraphBusinessError("PRODUCTION_ACTION_UNBOUND", `未知动作 ${String((input as { action?: unknown }).action)}`, 404);
  }
  if (input.action === "readGraph") return;
  const changeInput = input as { idempotencyKey?: unknown; expectedRevision?: unknown };
  if (typeof changeInput.idempotencyKey !== "string" || changeInput.idempotencyKey.trim().length === 0) {
    throw new ProductionGraphBusinessError("PRODUCTION_ACTION_UNBOUND", `${input.action} 必须包含 idempotencyKey`, 422);
  }
  if (typeof changeInput.expectedRevision !== "number" || !Number.isFinite(changeInput.expectedRevision) || changeInput.expectedRevision < 0) {
    throw new ProductionGraphBusinessError("PRODUCTION_ACTION_UNBOUND", `${input.action} 必须包含非负 expectedRevision`, 422);
  }
}

function toError(error: unknown): { code: string; message: string; status: number; details?: Record<string, unknown> } {
  if (error instanceof ProductionGraphBusinessError) {
    return { code: error.code, message: error.message, status: error.status, details: error.details };
  }
  if (error instanceof Error) {
    return { code: "PRODUCTION_ACTION_UNBOUND", message: error.message, status: 500 };
  }
  return { code: "PRODUCTION_ACTION_UNBOUND", message: "动作派发失败", status: 500 };
}

export interface ProductionGraphActionDispatcher {
  dispatch(input: ProductionGraphActionInput): Promise<ProductionActionAck>;
  isAvailable(action: ProductionGraphActionName): boolean;
}

export function createProductionGraphActionDispatcher(
  options: ProductionGraphActionDispatcherOptions,
): ProductionGraphActionDispatcher {
  const { store, socket, buildContext } = options;

  return {
    async dispatch(input) {
      try {
        assertInput(input);
        if (!store.getSnapshot().featureEnabled) {
          throw new ProductionGraphBusinessError(
            "PRODUCTION_GRAPH_DISABLED",
            "ProductionGraph v1 功能开关已关闭。",
            404,
          );
        }
        const snapshot = store.getSnapshot().snapshot;
        if (input.action !== "readGraph") {
          if (!snapshot) {
            throw new ProductionGraphBusinessError(
              "PRODUCTION_GRAPH_DISABLED",
              "ProductionGraph 尚未接收到初始快照，无法派发变更动作。",
              409,
            );
          }
          const changeInput = input as { expectedRevision: number; idempotencyKey: string };
          if (changeInput.expectedRevision !== snapshot.revision) {
            throw new ProductionGraphBusinessError(
              "PRODUCTION_GRAPH_REVISION_CONFLICT",
              `expectedRevision ${changeInput.expectedRevision} 与当前 revision ${snapshot.revision} 不一致。`,
              409,
              { expectedRevision: changeInput.expectedRevision, currentRevision: snapshot.revision },
            );
          }
          if (!store.beginDispatch(changeInput.idempotencyKey, changeInput.expectedRevision)) {
            // 已派发过或并发竞争中败北；不抛错，但也不重复派发。
            return {
              ok: true,
              result: {
                action: input.action,
                snapshot,
                paidGenerationUsd: 0,
                idempotencyKey: changeInput.idempotencyKey,
              },
            };
          }
        }

        const baseContext = buildContext();
        const context: ProductionGraphActionContext = {
          ...baseContext,
          graphId: snapshot?.graphId ?? baseContext.graphId,
          revision: snapshot?.revision ?? baseContext.revision,
          featureEnabled: true,
          paidGenerationUsd: Math.max(0, Math.floor(options.paidGenerationUsd?.() ?? 0)),
        };

        const ack = await new Promise<ProductionActionAck>((resolve) => {
          let settled = false;
          const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            resolve({
              ok: false,
              error: {
                code: "PRODUCTION_ACTION_UNBOUND",
                message: "ProductionGraph 动作响应超时。",
                status: 504,
              },
            });
          }, 30_000);
          try {
            socket.emit(ACTION_EVENT, { input, context }, (response: ProductionActionAck | undefined) => {
              if (settled) return;
              settled = true;
              clearTimeout(timer);
              if (!response) {
                resolve({ ok: false, error: { code: "PRODUCTION_ACTION_UNBOUND", message: "未收到 ack", status: 502 } });
                return;
              }
              resolve(response);
            });
          } catch (error) {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve({ ok: false, error: toError(error) });
          }
        });

        if (input.action !== "readGraph") {
          const changeInput = input as { idempotencyKey: string };
          store.endDispatch(changeInput.idempotencyKey);
        }

        if (!ack.ok && ack.error) {
          store.recordError(new ProductionGraphBusinessError(ack.error.code, ack.error.message, ack.error.status, ack.error.details));
        } else {
          store.clearError();
        }
        if (ack.ok && ack.result?.idempotencyKey) {
          store.rememberIdempotencyKey(ack.result.idempotencyKey);
        }
        return ack;
      } catch (error) {
        const normalized = toError(error);
        store.recordError(new ProductionGraphBusinessError(normalized.code, normalized.message, normalized.status, normalized.details));
        return { ok: false, error: normalized };
      }
    },
    isAvailable(action) {
      if (!PRODUCTION_GRAPH_ACTIONS.includes(action)) return false;
      if (!store.getSnapshot().featureEnabled) return action === "readGraph";
      const snapshot = store.getSnapshot().snapshot;
      if (!snapshot) return action === "readGraph";
      return snapshot.availableActions.includes(action);
    },
  };
}
