import { act, render } from "@testing-library/react";
import { useSyncExternalStore } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  useProductionGraphWiring,
  useResumeOrRetryOnLegacyFailure,
  type ProductionGraphSocketAdapterSocket,
} from "./production-graph-wiring";
import { createProductionGraphActionDispatcher, type ProductionActionAck } from "./production-graph-actions";
import { createProductionGraphContextBridge } from "./production-graph-context";
import { createProductionGraphFeatureFlag } from "./feature-flag";
import { createProductionGraphStore, type ProductionGraphStore } from "./production-graph-store";
import { buildDualProjectFixture } from "./production-graph-fixture";

// 真实工厂（defaultSocketFactory）最终调用 socket.io-client 的 io()。
// mock io() 以便行为测试断言真实工厂把后端挂载路径 path=/api/socket.io 传给了传输层。
const { mockIo } = vi.hoisted(() => {
  const mockIo = vi.fn<(url: string, options: Record<string, unknown>) => unknown>(() => {
    const socket = {
      connected: true,
      on() {
        return socket;
      },
      off() {
        return socket;
      },
      emit() {
        return socket;
      },
      disconnect() {
        socket.connected = false;
        return socket;
      },
    };
    return socket;
  });
  return { mockIo };
});

vi.mock("socket.io-client", () => ({ io: mockIo }));

const fixture = buildDualProjectFixture();

class FakeProductionGraphSocket implements ProductionGraphSocketAdapterSocket {
  readonly listeners = new Map<string, Set<(...args: any[]) => void>>();
  readonly emitted: Array<{ event: string; data?: unknown; ack?: (response: unknown) => void }> = [];
  connected = true;
  private readonly auth: Record<string, unknown>;

  constructor(auth: Record<string, unknown>) {
    this.auth = auth;
  }

  get handshake() {
    return { auth: this.auth };
  }

  on(event: string, listener: (...args: any[]) => void) {
    const set = this.listeners.get(event) ?? new Set();
    set.add(listener);
    this.listeners.set(event, set);
    return this;
  }
  off(event: string, listener?: (...args: any[]) => void) {
    if (listener) this.listeners.get(event)?.delete(listener);
    else this.listeners.delete(event);
    return this;
  }
  emit(event: string, data?: unknown, ack?: (response: unknown) => void) {
    this.emitted.push({ event, data, ack });
    return this;
  }
  disconnect() {
    this.connected = false;
    return this;
  }
  trigger(event: string, ...args: unknown[]) {
    this.listeners.get(event)?.forEach((listener) => listener(...args));
  }
}

afterEach(() => {
  vi.useRealTimers();
});

function StoreSubscriber({ store, format }: { store: ProductionGraphStore; format: (store: ProductionGraphStore) => string }) {
  useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return <span data-testid="store-format">{format(store)}</span>;
}

function Harness(props: {
  projectId: number;
  apiBaseUrl: string;
  getToken: () => string | null;
  socket: FakeProductionGraphSocket;
  feature: ReturnType<typeof createProductionGraphFeatureFlag>;
  initialSelectedNodeId?: string | null;
}) {
  const wiring = useProductionGraphWiring({
    projectId: props.projectId,
    apiBaseUrl: props.apiBaseUrl,
    getToken: props.getToken,
    feature: props.feature,
    socketFactory: () => props.socket,
    initialSelectedNodeId: props.initialSelectedNodeId ?? null,
  });
  return (
    <div>
      <span data-testid="feature-enabled">{wiring.featureEnabled ? "on" : "off"}</span>
      <StoreSubscriber
        store={wiring.store}
        format={(store) => store.getSnapshot().graphId ?? "empty"}
      />
      <StoreSubscriber
        store={wiring.store}
        format={(store) => JSON.stringify(wiring.contextBridge())}
      />
      {/* Render bridge-json keyed by feature+graphId so React re-reads the bridge on store updates */}
      <span data-testid="bridge-json">{JSON.stringify(wiring.contextBridge())}</span>
    </div>
  );
}

function HarnessWithDefaultFactory(props: {
  projectId: number;
  apiBaseUrl: string;
  getToken: () => string | null;
  feature: ReturnType<typeof createProductionGraphFeatureFlag>;
}) {
  const wiring = useProductionGraphWiring({
    projectId: props.projectId,
    apiBaseUrl: props.apiBaseUrl,
    getToken: props.getToken,
    feature: props.feature,
  });
  return <span data-testid="feature-enabled">{wiring.featureEnabled ? "on" : "off"}</span>;
}

describe("useProductionGraphWiring", () => {
  it("passes the /api/socket.io transport path to the real socket factory while keeping the productionGraph namespace URL", () => {
    mockIo.mockClear();
    const feature = createProductionGraphFeatureFlag({}, {});
    // 不注入 socketFactory：走真实 defaultSocketFactory -> io()。
    const view = render(
      <HarnessWithDefaultFactory projectId={9} apiBaseUrl="/api" getToken={() => "tok"} feature={feature} />,
    );

    expect(mockIo).toHaveBeenCalledTimes(1);
    const [url, options] = mockIo.mock.calls[0] as [string, Record<string, unknown>];
    // namespace URL 保持不变（/api/socket/productionGraph），path 显式指向后端挂载路径。
    expect(url).toMatch(/\/api\/socket\/productionGraph$/);
    // 传输顺序冻结为 [polling, websocket]：先可靠建立认证会话再自动升级，避免本机 WebSocket 首握悬挂。
    expect(options.transports).toEqual(["polling", "websocket"]);
    expect(options).toMatchObject({
      path: "/api/socket.io",
      transports: ["polling", "websocket"],
      auth: { token: "tok", projectId: "9" },
    });
    view.unmount();
  });

  it("listens for snapshot/patch and connect/reconnect when feature is on, and bridges graphId+revision into context", () => {
    const feature = createProductionGraphFeatureFlag({}, {});
    const socket = new FakeProductionGraphSocket({ token: "tok", projectId: "9" });

    const view = render(
      <Harness projectId={9} apiBaseUrl="/api" getToken={() => "tok"} socket={socket} feature={feature} />,
    );

    expect(socket.listeners.has("productionGraph:snapshot")).toBe(true);
    expect(socket.listeners.has("productionGraph:patch")).toBe(true);
    expect(socket.listeners.has("connect")).toBe(true);
    expect(socket.listeners.has("reconnect")).toBe(true);
    expect(view.getByTestId("feature-enabled").textContent).toBe("on");

    act(() => socket.trigger("productionGraph:snapshot", fixture.snapshots.p1Initial));
    expect(view.getAllByTestId("store-format")[0].textContent).toBe("graph-p1");
    expect(view.getAllByTestId("store-format")[1].textContent ?? "").toContain("graph-p1");

    view.unmount();
  });

  it("returns empty context bridge before snapshot arrives so the legacy chat path stays untouched", () => {
    const feature = createProductionGraphFeatureFlag({}, {});
    const socket = new FakeProductionGraphSocket({ token: "tok", projectId: "9" });
    const view = render(
      <Harness projectId={9} apiBaseUrl="/api" getToken={() => "tok"} socket={socket} feature={feature} />,
    );
    expect(view.getByTestId("bridge-json").textContent).toBe("{}");
    view.unmount();
  });

  it("does not connect when the feature flag is disabled", () => {
    const feature = createProductionGraphFeatureFlag({}, {});
    feature.setEnabled(false);
    const socket = new FakeProductionGraphSocket({ token: "tok", projectId: "9" });
    const view = render(
      <Harness projectId={9} apiBaseUrl="/api" getToken={() => "tok"} socket={socket} feature={feature} />,
    );
    expect(socket.listeners.has("productionGraph:snapshot")).toBe(false);
    expect(view.getByTestId("feature-enabled").textContent).toBe("off");
    view.unmount();
  });

  it("falls back gracefully when server signals no persistent graph (snapshot=null)", () => {
    const feature = createProductionGraphFeatureFlag({}, {});
    const socket = new FakeProductionGraphSocket({ token: "tok", projectId: "9" });
    const view = render(
      <Harness projectId={9} apiBaseUrl="/api" getToken={() => "tok"} socket={socket} feature={feature} />,
    );

    act(() => socket.trigger("productionGraph:snapshot", null));
    // Snapshot=null must disable the local store flag (not the global feature flag) so the
    // console shows the disabled fallback and the legacy fixed-stage path runs for this project.
    expect(view.getAllByTestId("store-format")[0].textContent).toBe("empty");
    expect(view.getByTestId("feature-enabled").textContent).toBe("on");
    view.unmount();
  });

  it("emits productionGraph:read with graphId on reconnect so the server can re-send authoritative state", () => {
    const feature = createProductionGraphFeatureFlag({}, {});
    const socket = new FakeProductionGraphSocket({ token: "tok", projectId: "9" });
    const view = render(
      <Harness projectId={9} apiBaseUrl="/api" getToken={() => "tok"} socket={socket} feature={feature} />,
    );
    act(() => socket.trigger("productionGraph:snapshot", fixture.snapshots.p1Initial));
    socket.emitted.length = 0;

    act(() => socket.trigger("reconnect"));
    expect(socket.emitted).toContainEqual({ event: "productionGraph:read", data: { graphId: "graph-p1" } });
    view.unmount();
  });

  it("initialSelectedNodeId flows into the contextBridge so chat carries the scene the user picked", () => {
    const feature = createProductionGraphFeatureFlag({}, {});
    const socket = new FakeProductionGraphSocket({ token: "tok", projectId: "9" });
    const view = render(
      <Harness
        projectId={9}
        apiBaseUrl="/api"
        getToken={() => "tok"}
        socket={socket}
        feature={feature}
        initialSelectedNodeId="scene-7"
      />,
    );
    act(() => socket.trigger("productionGraph:snapshot", fixture.snapshots.p1Initial));
    // The wiring subscribes to the store; the bridge returns the latest snapshot+selection on read.
    expect(view.getAllByTestId("store-format")[1].textContent ?? "").toContain('"selectedNodeId":"scene-7"');
    view.unmount();
  });
});

describe("ProductionGraph v1 wire-format contract with Hodor backend", () => {
  it("dispatch sends the flat payload shape the backend route parses (graphId/revision/selectedNodeId/checkpointId/action)", async () => {
    // Backend (src/socket/routes/productionGraph.ts):
    //   socket.on("productionGraph:action", (payload, callback) => {
    //     const context = productionGraphActionContextSchema.parse({
    //       actorRef, graphId: payload.graphId, revision: payload.revision,
    //       selectedNodeId: payload.selectedNodeId ?? null, checkpointId: payload.checkpointId ?? null, ...
    //     });
    //     const input = productionGraphActionInputSchema.parse(payload.action);
    //   });
    //
    // We assert the dispatcher emits exactly this shape so all six actions land in the
    // backend's strict Zod parser without contract drift.
    const emitted: Array<{ event: string; payload: unknown; ack?: (response: ProductionActionAck) => void }> = [];
    const store = createProductionGraphStore();
    store.applySnapshot(fixture.snapshots.p1Initial);
    const dispatcher = createProductionGraphActionDispatcher({
      store,
      socket: {
        connected: true,
        emit(event, payload, ack) {
          emitted.push({ event, payload, ack });
          // Synchronously ack so dispatch resolves within the test.
          ack?.({
            ok: true,
            result: {
              action: "startReady",
              snapshot: { ...fixture.snapshots.p1Initial, revision: fixture.snapshots.p1Initial.revision + 1 },
              paidGenerationUsd: 0,
              idempotencyKey: "wire-contract-1",
            },
          });
        },
      },
      buildContext: () => ({ actorRef: "founder@example.com", graphId: "graph-p1", selectedNodeId: "node-c", checkpointId: "checkpoint-cost-1" }),
    });

    const ack = await dispatcher.dispatch({
      action: "startReady",
      idempotencyKey: "wire-contract-1",
      expectedRevision: fixture.snapshots.p1Initial.revision,
      nodeIds: ["node-c"],
    });

    expect(ack.ok).toBe(true);
    expect(emitted).toHaveLength(1);
    expect(emitted[0].event).toBe("productionGraph:action");
    const payload = emitted[0].payload as {
      graphId: string;
      revision: number;
      selectedNodeId: string | null;
      checkpointId: string | null;
      action: { action: string; idempotencyKey: string; expectedRevision: number; nodeIds: string[] };
    };
    // All four context identity fields the backend reads must be present at the top level.
    expect(payload.graphId).toBe("graph-p1");
    expect(payload.revision).toBe(fixture.snapshots.p1Initial.revision);
    expect(payload.selectedNodeId).toBe("node-c");
    expect(payload.checkpointId).toBe("checkpoint-cost-1");
    // The input must be nested under `action` so productionGraphActionInputSchema.parse(payload.action) succeeds.
    expect(payload.action.action).toBe("startReady");
    expect(payload.action.idempotencyKey).toBe("wire-contract-1");
    expect(payload.action.expectedRevision).toBe(fixture.snapshots.p1Initial.revision);
    expect(payload.action.nodeIds).toEqual(["node-c"]);
    // No extra wrapper keys — the backend's strict parser would reject them.
    const keys = Object.keys(payload).sort();
    expect(keys).toEqual(["action", "checkpointId", "graphId", "revision", "selectedNodeId"]);
  });

  it("the legacy chat-path context bridge emits {} when no snapshot is present, matching createAgentChatClient.messageContext contract", () => {
    const store = createProductionGraphStore();
    const bridge = createProductionGraphContextBridge({ store });
    expect(bridge()).toEqual({});
    store.applySnapshot(fixture.snapshots.p1Initial);
    expect(bridge()).toMatchObject({ graphId: "graph-p1", revision: 1 });
  });
});

describe("useResumeOrRetryOnLegacyFailure", () => {
  function RecoveryHarness({
    store,
    dispatcher,
    featureEnabled,
    selectNodeId,
  }: {
    store: ProductionGraphStore;
    dispatcher: ReturnType<typeof createProductionGraphActionDispatcher>;
    featureEnabled: boolean;
    selectNodeId?: (store: ProductionGraphStore) => string | null;
  }) {
    useResumeOrRetryOnLegacyFailure({ store, dispatcher, featureEnabled, selectNodeId });
    // Subscribe so React re-renders on store updates.
    useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
    return (
      <div>
        <span data-testid="applied-keys">{[...store.getSnapshot().appliedIdempotencyKeys].join(",")}</span>
      </div>
    );
  }

  it("dispatches resumeOrRetry with a deterministic idempotency key when the legacy productionRun event is retryable", async () => {
    const store = createProductionGraphStore();
    store.applySnapshot(fixture.snapshots.p1CheckpointWaiting);
    const emitted: Array<{ event: string; payload: unknown; ack?: (response: ProductionActionAck) => void }> = [];
    const dispatcher = createProductionGraphActionDispatcher({
      store,
      socket: {
        connected: true,
        emit(event, payload, ack) {
          emitted.push({ event, payload, ack });
          ack?.({
            ok: true,
            result: {
              action: "resumeOrRetry",
              snapshot: { ...fixture.snapshots.p1CheckpointWaiting, revision: fixture.snapshots.p1CheckpointWaiting.revision + 1 },
              paidGenerationUsd: 0,
              idempotencyKey: "resume-run-a-1-1",
            },
          });
        },
      },
      buildContext: () => ({ actorRef: null, graphId: "graph-p1", selectedNodeId: "node-c", checkpointId: null }),
    });

    const view = render(
      <RecoveryHarness
        store={store}
        dispatcher={dispatcher}
        featureEnabled={true}
        selectNodeId={() => "node-c"}
      />,
    );

    // Simulate the legacy productionRun:update event landing on the store.
    act(() => {
      store.recordLegacyProductionRun({
        runId: "run-a-1",
        stage: "storyboardGen",
        status: "failed",
        attempt: 1,
        graphId: "graph-p1",
        updatedAt: "2026-08-07T00:00:00.000Z",
        error: { message: "transient", retryable: true },
      });
    });

    await vi.waitFor(() => expect(emitted.length).toBeGreaterThan(0));
    expect(emitted[0].event).toBe("productionGraph:action");
    const payload = emitted[0].payload as { action: { action: string; idempotencyKey: string; nodeIds: string[] } };
    expect(payload.action.action).toBe("resumeOrRetry");
    expect(payload.action.idempotencyKey).toBe("resume-run-a-1-1");
    expect(payload.action.nodeIds).toEqual(["node-c"]);

    // The hook must not re-dispatch for the same failure signature.
    const firstCount = emitted.length;
    act(() => {
      store.recordLegacyProductionRun({
        runId: "run-a-1",
        stage: "storyboardGen",
        status: "failed",
        attempt: 1,
        updatedAt: "2026-08-07T00:00:00.000Z",
        error: { message: "transient", retryable: true },
      });
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(emitted.length).toBe(firstCount);

    view.unmount();
  });

  it("does not dispatch when feature is disabled, leaving the legacy synthesized chat recovery in charge", () => {
    const store = createProductionGraphStore();
    store.applySnapshot(fixture.snapshots.p1CheckpointWaiting);
    const emitted: Array<{ event: string; payload: unknown }> = [];
    const dispatcher = createProductionGraphActionDispatcher({
      store,
      socket: {
        connected: true,
        emit(event, payload) {
          emitted.push({ event, payload });
        },
      },
      buildContext: () => ({ actorRef: null, graphId: "graph-p1", selectedNodeId: null, checkpointId: null }),
    });

    const view = render(
      <RecoveryHarness
        store={store}
        dispatcher={dispatcher}
        featureEnabled={false}
        selectNodeId={() => "node-c"}
      />,
    );

    act(() => {
      store.recordLegacyProductionRun({
        runId: "run-x",
        stage: "storyboardGen",
        status: "failed",
        attempt: 1,
        updatedAt: "2026-08-07T00:00:00.000Z",
        error: { message: "transient", retryable: true },
      });
    });
    expect(emitted).toEqual([]);
    view.unmount();
  });
});
