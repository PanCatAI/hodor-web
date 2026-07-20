import { describe, expect, it, vi } from "vitest";

import type { HodorApiClient } from "@react/lib/api/client";
import { createAgentChatClient, resolveAgentSocketUrl } from "./agent-chat-client";
import type { AgentServerHandlers, AgentSocket, AgentSocketFactory } from "./types";

class FakeSocket implements AgentSocket {
  connected = false;
  auth?: Record<string, unknown>;
  readonly emitted: Array<{ event: string; data: unknown }> = [];
  readonly connect = vi.fn(() => {
    this.connected = true;
    this.trigger("connect");
    return this;
  });
  readonly disconnect = vi.fn(() => {
    this.connected = false;
    this.trigger("disconnect", "io client disconnect");
    return this;
  });
  private readonly listeners = new Map<string, Set<(...args: any[]) => void>>();

  on(event: string, listener: (...args: any[]) => void) {
    const eventListeners = this.listeners.get(event) ?? new Set();
    eventListeners.add(listener);
    this.listeners.set(event, eventListeners);
    return this;
  }

  off(event: string, listener?: (...args: any[]) => void) {
    if (listener) this.listeners.get(event)?.delete(listener);
    else this.listeners.delete(event);
    return this;
  }

  emit(event: string, data?: unknown) {
    this.emitted.push({ event, data });
    return this;
  }

  trigger(event: string, ...args: unknown[]) {
    this.listeners.get(event)?.forEach((listener) => listener(...args));
  }
}

function setup() {
  const socket = new FakeSocket();
  const socketFactory = vi.fn(() => socket) as unknown as AgentSocketFactory;
  const request = vi.fn(async (..._args: unknown[]): Promise<unknown> => []);
  const client = createAgentChatClient({
    agentType: "scriptAgent",
    projectId: 7,
    apiBaseUrl: "http://localhost:10588/api",
    getToken: () => "Bearer pancat-session",
    apiClient: { request } as unknown as HodorApiClient,
    socketFactory,
  });
  return { client, request, socket, socketFactory };
}

describe("agent chat client", () => {
  it("connects to the existing namespace with Pancat session auth", () => {
    const { client, socket, socketFactory } = setup();

    client.connect();

    expect(socketFactory).toHaveBeenCalledWith(
      "http://localhost:10588/api/socket/scriptAgent",
      expect.objectContaining({
        autoConnect: false,
        auth: { token: "Bearer pancat-session", isolationKey: "7:scriptAgent", projectId: 7 },
      }),
    );
    expect(socket.connect).toHaveBeenCalledOnce();
    expect(client.getSnapshot().connection).toBe("connected");
  });

  it("merges streamed message content and returns to idle when complete", () => {
    const { client, socket } = setup();
    client.connect();

    socket.trigger("message", {
      id: "assistant-1",
      role: "assistant",
      name: "统筹",
      status: "pending",
      datetime: "2026-07-20T10:00:00.000Z",
      content: [],
    });
    socket.trigger("content:add", {
      messageId: "assistant-1",
      content: { id: "text-1", type: "markdown", data: "正在", status: "pending" },
    });
    socket.trigger("content:update", {
      messageId: "assistant-1",
      contentId: "text-1",
      type: "markdown",
      data: "拆分剧本",
      strategy: "append",
      status: "streaming",
    });

    expect(client.getSnapshot()).toMatchObject({
      activity: "streaming",
      currentMessageId: "assistant-1",
      messages: [
        {
          id: "assistant-1",
          status: "streaming",
          content: [{ id: "text-1", data: "正在拆分剧本", status: "streaming" }],
        },
      ],
    });

    socket.trigger("message:update", { id: "assistant-1", status: "complete" });
    expect(client.getSnapshot().activity).toBe("idle");
    expect(client.getSnapshot().currentMessageId).toBeNull();
  });

  it("sends commands, reconnects, and clears memory through the compatible API", async () => {
    const { client, request, socket } = setup();
    request.mockResolvedValueOnce(undefined).mockResolvedValueOnce([
      {
        id: "history-1",
        role: "assistant",
        status: "complete",
        datetime: "2026-07-20T09:00:00.000Z",
        content: [{ type: "markdown", data: "旧消息", status: "complete" }],
      },
    ]);
    client.connect();

    expect(client.send("开始拆分剧本")).toBe(true);
    expect(socket.emitted).toContainEqual({ event: "chat", data: { content: "开始拆分剧本" } });
    expect(client.getSnapshot().messages.at(-1)).toMatchObject({ role: "user" });

    client.reconnect();
    expect(socket.disconnect).toHaveBeenCalledOnce();
    expect(socket.connect).toHaveBeenCalledTimes(2);

    await client.clearMemory("message");
    expect(request).toHaveBeenNthCalledWith(1, "/agents/clearMemory", {
      method: "POST",
      body: JSON.stringify({ projectId: 7, agentType: "scriptAgent", type: "message" }),
    });
    expect(request).toHaveBeenNthCalledWith(2, "/agents/getMemory", {
      method: "POST",
      body: JSON.stringify({ projectId: 7, agentType: "scriptAgent" }),
    });
    expect(client.getSnapshot().messages[0].content[0].data).toBe("旧消息");
  });

  it("includes the episode context for production agents", () => {
    const socket = new FakeSocket();
    const socketFactory = vi.fn(() => socket) as unknown as AgentSocketFactory;
    const client = createAgentChatClient({
      agentType: "productionAgent",
      projectId: 7,
      episodeId: 12,
      apiBaseUrl: "/api",
      getToken: () => "session-token",
      apiClient: { request: vi.fn() } as unknown as HodorApiClient,
      socketFactory,
    });

    client.connect();

    expect(socketFactory).toHaveBeenCalledWith(
      expect.stringMatching(/\/socket\/productionAgent$/),
      expect.objectContaining({
        auth: {
          token: "session-token",
          isolationKey: "7:productionAgent:12",
          projectId: 7,
          scriptId: 12,
        },
      }),
    );
  });

  it("keeps live messages that arrive while history is loading", async () => {
    const { client, request, socket } = setup();
    let resolveHistory!: (messages: unknown) => void;
    request.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveHistory = resolve;
        }),
    );
    client.connect();

    const historyPromise = client.loadHistory();
    socket.trigger("message", {
      id: "assistant-live",
      role: "assistant",
      status: "pending",
      datetime: "2026-07-20T10:00:00.000Z",
      content: [],
    });
    resolveHistory([
      {
        id: "history-1",
        role: "user",
        status: "complete",
        datetime: "2026-07-20T09:00:00.000Z",
        content: [{ type: "markdown", data: "先前指令", status: "complete" }],
      },
    ]);
    await historyPromise;

    expect(client.getSnapshot().messages.map((message) => message.id)).toEqual(["history-1", "assistant-live"]);
  });

  it("does not stop tracking a newer response when an older response completes late", () => {
    const { client, socket } = setup();
    client.connect();
    socket.trigger("message", {
      id: "assistant-old",
      role: "assistant",
      status: "pending",
      datetime: "2026-07-20T10:00:00.000Z",
      content: [],
    });
    socket.trigger("message", {
      id: "assistant-new",
      role: "assistant",
      status: "streaming",
      datetime: "2026-07-20T10:00:01.000Z",
      content: [],
    });

    socket.trigger("message:update", { id: "assistant-old", status: "complete" });

    expect(client.getSnapshot()).toMatchObject({ currentMessageId: "assistant-new", activity: "streaming" });
  });
});

describe("resolveAgentSocketUrl", () => {
  it("keeps the API namespace and an upstream path", () => {
    expect(resolveAgentSocketUrl("https://pancat.example/hodor/api/", "scriptAgent")).toBe("https://pancat.example/hodor/api/socket/scriptAgent");
  });
});

describe("agent server callback events", () => {
  function createWithHandlers(agentType: "scriptAgent" | "productionAgent", handlers?: AgentServerHandlers) {
    const socket = new FakeSocket();
    const client = createAgentChatClient({
      agentType,
      projectId: 7,
      episodeId: agentType === "productionAgent" ? 12 : undefined,
      apiBaseUrl: "http://localhost:10588/api",
      getToken: () => "session-token",
      apiClient: { request: vi.fn() } as unknown as HodorApiClient,
      socketFactory: (() => socket) as AgentSocketFactory,
      handlers,
    });
    client.connect();
    return socket;
  }

  it("returns raw plan and flow data for the existing read contracts", async () => {
    const plan = { storySkeleton: "雨夜相遇", adaptationStrategy: "悬疑", script: [] };
    const flow = { script: "第一幕", assets: [], storyboard: [] };
    const scriptSocket = createWithHandlers("scriptAgent", { getPlanData: vi.fn(async () => plan) });
    const productionSocket = createWithHandlers("productionAgent", { getFlowData: vi.fn(async () => flow) });

    const planResponse = await new Promise((resolve) => scriptSocket.trigger("getPlanData", { key: "script" }, resolve));
    const flowResponse = await new Promise((resolve) => productionSocket.trigger("getFlowData", { key: "storyboard" }, resolve));

    expect(planResponse).toEqual(plan);
    expect(flowResponse).toEqual(flow);
  });

  it("acknowledges every production mutation with an explicit success result", async () => {
    const eventNames = ["addDeriveAsset", "delDeriveAsset", "generateDeriveAsset", "generateStoryboard", "addStoryboard"] as const;
    const handlers = Object.fromEntries(eventNames.map((event) => [event, vi.fn(async () => `${event}完成`)])) as AgentServerHandlers;
    const socket = createWithHandlers("productionAgent", handlers);

    for (const event of eventNames) {
      const response = await new Promise((resolve) => socket.trigger(event, { id: 31 }, resolve));
      expect(response).toEqual({ success: true, message: `${event}完成` });
      expect(handlers[event]).toHaveBeenCalledWith({ id: 31 });
    }
  });

  it("returns failure when a handler is missing or throws", async () => {
    const missingSocket = createWithHandlers("productionAgent");
    const failingSocket = createWithHandlers("productionAgent", {
      generateStoryboard: async () => {
        throw new Error("分镜生成失败");
      },
    });

    const missing = await new Promise((resolve) => missingSocket.trigger("addStoryboard", {}, resolve));
    const failed = await new Promise((resolve) => failingSocket.trigger("generateStoryboard", { ids: [31] }, resolve));

    expect(missing).toEqual(expect.objectContaining({ success: false, error: expect.stringContaining("addStoryboard") }));
    expect(failed).toEqual({ success: false, error: "分镜生成失败", message: "分镜生成失败" });
  });
});
