import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { io } from "socket.io-client";

import {
  createProductionGraphActionDispatcher,
  type ProductionActionAck,
  type ProductionGraphActionDispatcher,
  type ProductionGraphActionSocket,
} from "./production-graph-actions";
import {
  createProductionGraphContextBridge,
  type ProductionGraphContextBridge,
} from "./production-graph-context";
import {
  createProductionGraphSocketAdapter,
  type ProductionGraphSocket,
  type ProductionGraphSocketAdapter,
} from "./production-graph-socket-adapter";
import { createProductionGraphStore, type ProductionGraphStore } from "./production-graph-store";
import {
  getProductionGraphFeatureFlag,
  type ProductionGraphFeatureFlag,
  type ProductionGraphServerAvailability,
} from "./feature-flag";

/**
 * ProductionGraph wiring for the project workspace.
 *
 * 该 hook 负责把 store、socket 适配器、动作派发器、contextBridge 装配在一起，
 * 并把它们暴露给 ScriptAgentPanel / 项目工作台。它遵守以下不变量：
 *
 * - 功能开关关闭时不连接 Socket、不渲染控制台；旧固定阶段路由继续工作。
 * - 项目编号变化时安全地重置 store 并重连。
 * - 同时把 contextBridge 暴露给 AgentChatClient.messageContext，使对话自动携带
 *   graphId、revision、selectedNodeId 和 checkpointId。
 * - resumeOrRetry 通过 dispatcher 派发，避免再走合成聊天文本的旧路径。
 */

export interface ProductionGraphWiringOptions {
  projectId: number;
  apiBaseUrl: string;
  getToken: () => string | null;
  initialSelectedNodeId?: string | null;
  /** 测试可注入；生产环境默认从 localStorage / VITE 环境解析。 */
  feature?: ProductionGraphFeatureFlag;
  /** 测试可注入伪造 socket；生产环境默认通过 io() 创建。 */
  socketFactory?: (url: string, auth: Record<string, unknown>) => ProductionGraphSocketAdapterSocket;
}

export interface ProductionGraphSocketAdapterSocket {
  on(event: string, listener: (...args: any[]) => void): unknown;
  off?(event: string, listener?: (...args: any[]) => void): unknown;
  emit(event: string, data?: unknown, ack?: (response: unknown) => void): unknown;
  connected?: boolean;
  disconnect?(): void;
  close?(): void;
}

export interface ProductionGraphWiring {
  store: ProductionGraphStore;
  dispatcher: ProductionGraphActionDispatcher;
  contextBridge: ProductionGraphContextBridge;
  adapter: ProductionGraphSocketAdapter | null;
  socket: ProductionGraphSocketAdapterSocket | null;
  feature: ProductionGraphFeatureFlag;
  featureEnabled: boolean;
}

function resolveSocketUrl(apiBaseUrl: string): string {
  const normalized = apiBaseUrl.replace(/\/+$/, "");
  if (/^https?:\/\//.test(normalized)) return `${normalized}/socket/productionGraph`;
  const origin = typeof window === "undefined" ? "http://localhost" : window.location.origin;
  const path = normalized.startsWith("/") ? normalized : `/${normalized}`;
  return `${origin}${path}/socket/productionGraph`.replace(/([^:]\/)\/+/, "$1");
}

function defaultSocketFactory(url: string, auth: Record<string, unknown>): ProductionGraphSocketAdapterSocket {
  return io(url, {
    autoConnect: true,
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: 8,
    reconnectionDelay: 500,
    reconnectionDelayMax: 8_000,
    timeout: 12_000,
    auth,
  }) as unknown as ProductionGraphSocketAdapterSocket;
}

export interface UseProductionGraphWiring {
  store: ProductionGraphStore;
  dispatcher: ProductionGraphActionDispatcher;
  contextBridge: ProductionGraphContextBridge;
  featureEnabled: boolean;
  serverAvailability: ProductionGraphServerAvailability;
  requestServerRecovery(): void;
}

/**
 * React hook 把 ProductionGraph 控制面绑到项目页面。
 *
 * 调用方负责把 contextBridge 注入 AgentChatClient.messageContext，并渲染
 * `<ProductionGraphConsole store={store} dispatcher={dispatcher} contextBridge={contextBridge} />`。
 */
export function useProductionGraphWiring(options: ProductionGraphWiringOptions): UseProductionGraphWiring {
  const { projectId, apiBaseUrl, getToken, initialSelectedNodeId, feature, socketFactory } = options;
  const featureFlag = feature ?? getProductionGraphFeatureFlag();

  const storeRef = useRef<ProductionGraphStore | null>(null);
  if (storeRef.current === null) {
    storeRef.current = createProductionGraphStore();
  }
  const bridgeRef = useRef<ProductionGraphContextBridge | null>(null);
  if (bridgeRef.current === null) {
    bridgeRef.current = createProductionGraphContextBridge({
      store: storeRef.current,
      initial: { selectedNodeId: initialSelectedNodeId ?? null, checkpointId: null },
    });
  }
  const dispatcherRef = useRef<ProductionGraphActionDispatcher | null>(null);
  const socketRef = useRef<ProductionGraphSocketAdapterSocket | null>(null);
  const adapterRef = useRef<ProductionGraphSocketAdapter | null>(null);

  // Subscribe to feature flag changes so the panel re-renders on toggle.
  const featureEnabled = useSyncExternalStore(
    (listener) => featureFlag.subscribe(listener),
    () => featureFlag.isEnabled(),
    () => featureFlag.isEnabled(),
  );

  // Sync the local store's feature flag with the global flag.
  useEffect(() => {
    storeRef.current?.setFeatureEnabled(featureEnabled);
  }, [featureEnabled]);

  // Re-sync the initial selectedNodeId whenever the caller hands us a new one
  // (e.g. user clicks a scene in the canvas). Don't override an explicit null
  // when the bridge already has a selection.
  useEffect(() => {
    if (!bridgeRef.current || !storeRef.current) return;
    if (initialSelectedNodeId && bridgeRef.current.getSelection().selectedNodeId !== initialSelectedNodeId) {
      bridgeRef.current.setSelection({
        selectedNodeId: initialSelectedNodeId,
        checkpointId: bridgeRef.current.getSelection().checkpointId,
      });
    }
  }, [initialSelectedNodeId]);

  // Create the dispatcher lazily so test code can pass a deterministic socket factory.
  if (dispatcherRef.current === null) {
    const proxySocket: ProductionGraphActionSocket = {
      get connected() {
        return socketRef.current?.connected ?? false;
      },
      emit(event: string, payload: unknown, ack?: (response: ProductionActionAck) => void) {
        if (!socketRef.current) {
          ack?.({ ok: false, error: { code: "PRODUCTION_ACTION_UNBOUND", message: "ProductionGraph socket 未连接", status: 502 } });
          return;
        }
        socketRef.current.emit(event, payload, ack as ((response: unknown) => void) | undefined);
      },
    };
    dispatcherRef.current = createProductionGraphActionDispatcher({
      store: storeRef.current,
      socket: proxySocket,
      buildContext: () => ({
        actorRef: null,
        graphId: storeRef.current!.getSnapshot().graphId ?? `pending-project-${projectId}`,
        selectedNodeId: bridgeRef.current?.getSelection().selectedNodeId ?? null,
        checkpointId: bridgeRef.current?.getSelection().checkpointId ?? null,
      }),
    });
  }

  useEffect(() => {
    if (!featureEnabled) return;
    const token = getToken();
    if (!token) return;
    const url = resolveSocketUrl(apiBaseUrl);
    const factory = socketFactory ?? defaultSocketFactory;
    const socket = factory(url, { token, projectId: String(projectId) });
    socketRef.current = socket;
    const adapter = createProductionGraphSocketAdapter({
      store: storeRef.current!,
      socket,
      onServerAvailabilityChange: (availability) => featureFlag.setServerAvailability(availability),
    });
    adapter.attach();
    adapterRef.current = adapter;
    return () => {
      adapter.detach();
      adapterRef.current = null;
      socketRef.current = null;
      try {
        socket.disconnect?.();
      } catch {
        // ignore
      }
    };
  }, [apiBaseUrl, featureEnabled, featureFlag, getToken, projectId, socketFactory]);

  const requestServerRecovery = useCallback(() => {
    featureFlag.requestServerRecovery();
  }, [featureFlag]);

  return {
    store: storeRef.current,
    dispatcher: dispatcherRef.current,
    contextBridge: bridgeRef.current,
    featureEnabled,
    serverAvailability: featureFlag.getServerAvailability(),
    requestServerRecovery,
  };
}

/**
 * 当功能开关启用、store 收到 productionRun 兼容事件且节点是 retryable 失败时，
 * 自动派发 resumeOrRetry（带幂等键），代替合成聊天文本。
 *
 * 该 hook 只在调用方明确启用时生效。它确保前端不再依赖合成的恢复提示文本，
 * 而是把恢复责任交给 ProductionGraph 的统一动作。
 */
export function useResumeOrRetryOnLegacyFailure(options: {
  store: ProductionGraphStore;
  dispatcher: ProductionGraphActionDispatcher;
  featureEnabled: boolean;
  selectNodeId?: (store: ProductionGraphStore) => string | null;
}): void {
  const { store, dispatcher, featureEnabled, selectNodeId } = options;
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const lastAttemptRef = useRef<string | null>(null);

  useEffect(() => {
    if (!featureEnabled) return;
    const legacy = state.legacyProductionRun;
    if (!legacy?.runId || !legacy.error?.retryable) return;
    if (!state.snapshot) return;
    const retryableStatus = legacy.status === "failed" || legacy.status === "blocked" || legacy.status === "partial";
    if (!retryableStatus) return;
    const nodeId = selectNodeId?.(store) ?? null;
    if (!nodeId) return;
    const idempotencyKey = `resume-${legacy.runId}-${legacy.attempt ?? 0}`;
    if (lastAttemptRef.current === idempotencyKey) return;
    if (state.appliedIdempotencyKeys.has(idempotencyKey)) {
      lastAttemptRef.current = idempotencyKey;
      return;
    }
    lastAttemptRef.current = idempotencyKey;
    void dispatcher.dispatch({
      action: "resumeOrRetry",
      idempotencyKey,
      expectedRevision: state.snapshot.revision,
      nodeIds: [nodeId],
    });
  }, [dispatcher, featureEnabled, selectNodeId, state, store]);
}

/**
 * 暴露给测试和小工具：把 AgentChatClient.messageContext 与 ProductionGraphContextBridge 绑在一起。
 * 桥接函数返回的 context 永远是最新 store snapshot + selection 的反映。
 */
export function buildMessageContext(bridge: ProductionGraphContextBridge): () => Record<string, unknown> | undefined {
  return useCallbackBridge(bridge);
}

function useCallbackBridge(bridge: ProductionGraphContextBridge): () => Record<string, unknown> | undefined {
  return useCallback(() => {
    const value = bridge();
    if (!value || Object.keys(value).length === 0) return undefined;
    return value;
  }, [bridge]);
}

export const __productionGraphWiringInternals = { resolveSocketUrl };
