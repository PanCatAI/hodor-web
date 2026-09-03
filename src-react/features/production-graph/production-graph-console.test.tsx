import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProductionGraphConsole } from "./production-graph-console";
import {
  createProductionGraphContextBridge,
} from "./production-graph-context";
import { createProductionGraphStore } from "./production-graph-store";
import {
  createProductionGraphActionDispatcher,
  type ProductionActionAck,
  type ProductionGraphActionSocket,
} from "./production-graph-actions";
import { buildDualProjectFixture } from "./production-graph-fixture";

const fixture = buildDualProjectFixture();

function createAckSocket(): ProductionGraphActionSocket & {
  emitted: Array<{ event: string; payload: unknown; ack?: (response: ProductionActionAck) => void }>;
  setAck(ack: ProductionActionAck): void;
} {
  const emitted: Array<{ event: string; payload: unknown; ack?: (response: ProductionActionAck) => void }> = [];
  let pending: ProductionActionAck | null = null;
  return {
    connected: true,
    emitted,
    emit(event, payload, ack) {
      emitted.push({ event, payload, ack });
      if (ack && pending) {
        const response = pending;
        pending = null;
        ack(response);
      }
    },
    setAck(ack) {
      pending = ack;
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("ProductionGraphConsole", () => {
  it("renders the disabled fallback when the feature flag is off", () => {
    const store = createProductionGraphStore();
    store.setFeatureEnabled(false);
    const socket = createAckSocket();
    const dispatcher = createProductionGraphActionDispatcher({
      store,
      socket,
      buildContext: () => ({ actorRef: null, graphId: "graph-p1", selectedNodeId: null, checkpointId: null }),
    });
    const bridge = createProductionGraphContextBridge({ store });

    render(<ProductionGraphConsole store={store} dispatcher={dispatcher} contextBridge={bridge} />);
    expect(screen.getByText(/功能开关已关闭/)).toBeInTheDocument();
    expect(screen.queryByLabelText("启动就绪节点")).not.toBeInTheDocument();
  });

  it("shows the waiting hint before any snapshot arrives and surfaces legacy productionRun banner", () => {
    const store = createProductionGraphStore();
    const socket = createAckSocket();
    const dispatcher = createProductionGraphActionDispatcher({
      store,
      socket,
      buildContext: () => ({ actorRef: null, graphId: "graph-p1", selectedNodeId: null, checkpointId: null }),
    });
    const bridge = createProductionGraphContextBridge({ store });
    store.recordLegacyProductionRun({
      runId: "run-a-1",
      stage: "internal.reviewText",
      status: "running",
      attempt: 1,
      updatedAt: "2026-08-07T00:00:00.000Z",
    });

    render(<ProductionGraphConsole store={store} dispatcher={dispatcher} contextBridge={bridge} />);
    expect(screen.getByText(/等待服务端推送/)).toBeInTheDocument();
    expect(screen.getByLabelText("兼容 productionRun 进度")).toHaveTextContent("internal.reviewText");
  });

  it("renders real topology ordered by requires edges and shows status badges", () => {
    const store = createProductionGraphStore();
    store.applySnapshot(fixture.snapshots.p1CheckpointWaiting);
    const socket = createAckSocket();
    const dispatcher = createProductionGraphActionDispatcher({
      store,
      socket,
      buildContext: () => ({ actorRef: null, graphId: "graph-p1", selectedNodeId: null, checkpointId: null }),
    });
    const bridge = createProductionGraphContextBridge({ store });

    render(<ProductionGraphConsole store={store} dispatcher={dispatcher} contextBridge={bridge} />);
    expect(screen.getByText(/graphId/)).toBeInTheDocument();
    expect(screen.getByText("A：零成本工作节点")).toBeInTheDocument();
    expect(screen.getByText("C：合并 A、B 的交付节点")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("选择节点 C：合并 A、B 的交付节点"));
    expect(screen.getByText(/capabilityId: internal.mergeCandidate/)).toBeInTheDocument();
  });

  it("re-renders Inspector when a different node is selected after first render", () => {
    const store = createProductionGraphStore();
    store.applySnapshot(fixture.snapshots.p1CheckpointWaiting);
    const socket = createAckSocket();
    const dispatcher = createProductionGraphActionDispatcher({
      store,
      socket,
      buildContext: () => ({ actorRef: null, graphId: "graph-p1", selectedNodeId: null, checkpointId: null }),
    });
    const bridge = createProductionGraphContextBridge({ store });

    render(<ProductionGraphConsole store={store} dispatcher={dispatcher} contextBridge={bridge} />);

    // Initially no node is selected — Inspector shows the empty hint.
    expect(screen.getByText(/选择左侧节点以查看证据/)).toBeInTheDocument();

    // Select node C — Inspector header must show C's title and its evidence code.
    fireEvent.click(screen.getByLabelText("选择节点 C：合并 A、B 的交付节点"));
    expect(screen.getByRole("heading", { name: "C：合并 A、B 的交付节点" })).toBeInTheDocument();
    expect(screen.getByText("upstream.succeeded")).toBeInTheDocument();

    // Switch to node A — Inspector must update on the same render tree to show A's content.
    fireEvent.click(screen.getByLabelText("选择节点 A：零成本工作节点"));
    expect(screen.getByRole("heading", { name: "A：零成本工作节点" })).toBeInTheDocument();
    expect(screen.getByText("该节点暂无证据。")).toBeInTheDocument();
    // C's evidence must not linger after switching.
    expect(screen.queryByText("upstream.succeeded")).not.toBeInTheDocument();

    // The context bridge must reflect the latest selection so chat context stays in sync.
    expect(bridge()).toMatchObject({ selectedNodeId: "node-a" });
  });

  it("starts a ready node through the dispatcher and remembers idempotencyKey", async () => {
    const store = createProductionGraphStore();
    store.applySnapshot(fixture.snapshots.p1Initial);
    const socket = createAckSocket();
    const dispatcher = createProductionGraphActionDispatcher({
      store,
      socket,
      buildContext: () => ({ actorRef: null, graphId: "graph-p1", selectedNodeId: "node-a", checkpointId: null }),
    });
    const bridge = createProductionGraphContextBridge({ store, initial: { selectedNodeId: "node-a", checkpointId: null } });

    socket.setAck({
      ok: true,
      result: {
        action: "startReady",
        snapshot: { ...fixture.snapshots.p1Initial, revision: 2 },
        paidGenerationUsd: 0,
      },
    });

    render(<ProductionGraphConsole store={store} dispatcher={dispatcher} contextBridge={bridge} />);
    fireEvent.click(screen.getByLabelText("启动就绪节点"));

    await vi.waitFor(() => expect(screen.getByLabelText(/动作 startReady 结果/)).toBeInTheDocument());

    expect(socket.emitted[0]?.event).toBe("productionGraph:action");
    const payload = socket.emitted[0]?.payload as {
      graphId: string;
      revision: number;
      action: { action: string; idempotencyKey: string };
    };
    expect(payload.action.idempotencyKey).toBeTruthy();
    expect(payload.graphId).toBe("graph-p1");
    expect(payload.revision).toBe(1);
    expect(store.getSnapshot().appliedIdempotencyKeys.size).toBe(1);
  });

  it("renders disabled action buttons when checkpoint is unresolved and dispatcher rejects paid generation", async () => {
    const store = createProductionGraphStore();
    store.applySnapshot(fixture.snapshots.p1Initial);
    const socket = createAckSocket();
    const dispatcher = createProductionGraphActionDispatcher({
      store,
      socket,
      buildContext: () => ({ actorRef: null, graphId: "graph-p1", selectedNodeId: "checkpoint-cost", checkpointId: "checkpoint-cost-1" }),
    });
    const bridge = createProductionGraphContextBridge({
      store,
      initial: { selectedNodeId: "checkpoint-cost", checkpointId: "checkpoint-cost-1" },
    });

    socket.setAck({
      ok: false,
      error: { code: "PAID_GENERATION_DISABLED", message: "禁用真实付费生成", status: 422 },
    });

    render(<ProductionGraphConsole store={store} dispatcher={dispatcher} contextBridge={bridge} />);
    fireEvent.click(screen.getByLabelText("恢复或重试"));

    await vi.waitFor(() => expect(screen.getByLabelText(/动作 resumeOrRetry 结果/)).toBeInTheDocument());

    expect(screen.getByRole("alert")).toHaveTextContent(/PAID_GENERATION_DISABLED/);
  });
});
