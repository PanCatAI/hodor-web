import type { ProductionGraphStore } from "./production-graph-store";

/**
 * 把 ProductionGraph store 当前状态桥接到 Agent 对话上下文。
 *
 * AgentChatClient 的 messageContext 是发送消息时的扩展点；本模块保证对话中始终携带
 * graphId、revision、selectedNodeId 和 checkpointId 四个字段，使服务端 Agent 与 Graph
 * 共享同一控制点身份。
 *
 * 当功能开关关闭或没有快照时，返回空对象，使旧对话路径不受影响。
 */

export interface ProductionGraphSelection {
  selectedNodeId: string | null;
  checkpointId: string | null;
}

export interface ProductionGraphContextBridge {
  /** 用于注入 AgentChatClient.messageContext。 */
  (): Record<string, unknown>;
  setSelection(selection: ProductionGraphSelection): void;
  getSelection(): ProductionGraphSelection;
}

export interface CreateProductionGraphContextBridgeOptions {
  store: ProductionGraphStore;
  initial?: ProductionGraphSelection;
}

export function createProductionGraphContextBridge(
  options: CreateProductionGraphContextBridgeOptions,
): ProductionGraphContextBridge {
  let selection: ProductionGraphSelection = {
    selectedNodeId: options.initial?.selectedNodeId ?? null,
    checkpointId: options.initial?.checkpointId ?? null,
  };

  return Object.assign(
    () => {
      const state = options.store.getSnapshot();
      if (!state.featureEnabled) return {};
      const snapshot = state.snapshot;
      if (!snapshot) return {};
      const context: Record<string, unknown> = {
        graphId: snapshot.graphId,
        revision: snapshot.revision,
      };
      if (selection.selectedNodeId) context.selectedNodeId = selection.selectedNodeId;
      if (selection.checkpointId) context.checkpointId = selection.checkpointId;
      return context;
    },
    {
      setSelection(next: ProductionGraphSelection) {
        selection = { selectedNodeId: next.selectedNodeId, checkpointId: next.checkpointId };
      },
      getSelection() {
        return selection;
      },
    },
  );
}

/**
 * 校验消息上下文是否携带 ProductionGraph 必需的四项身份字段。
 * 用于测试和 Inspector 面板：返回缺失的字段名。
 */
export function missingProductionGraphContextKeys(context: Record<string, unknown> | undefined): string[] {
  const required = ["graphId", "revision", "selectedNodeId", "checkpointId"] as const;
  return required.filter((key) => {
    const value = context?.[key];
    if (value === undefined || value === null) return true;
    if (key === "revision") return typeof value !== "number" || !Number.isFinite(value);
    return typeof value !== "string" || value.trim().length === 0;
  });
}
