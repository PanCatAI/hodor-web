import { io } from "socket.io-client";

import type { HodorApiClient } from "@react/lib/api/client";
import type {
  AgentActivityState,
  AgentChatClient,
  AgentChatSnapshot,
  AgentMessage,
  AgentMessageContent,
  AgentMessageStatus,
  AgentServerHandler,
  AgentServerHandlers,
  AgentSocket,
  AgentSocketFactory,
  AgentType,
  MemoryType,
} from "./types";

interface CreateAgentChatClientOptions {
  agentType: AgentType;
  projectId: number;
  episodeId?: number;
  apiBaseUrl: string;
  getToken: () => string | null;
  apiClient: HodorApiClient;
  socketFactory?: AgentSocketFactory;
  handlers?: AgentServerHandlers;
}

interface MessageEvent extends Omit<AgentMessage, "content"> {
  content?: AgentMessageContent[];
}

interface MessageUpdateEvent {
  id: string;
  status?: AgentMessageStatus;
  ext?: Record<string, unknown>;
}

interface ContentAddEvent {
  messageId: string;
  content: AgentMessageContent;
}

interface ContentUpdateEvent {
  messageId: string;
  contentId: string;
  data?: unknown;
  strategy?: "merge" | "append";
  status?: AgentMessageStatus;
}

const defaultSocketFactory: AgentSocketFactory = (url, options) => io(url, options) as unknown as AgentSocket;
let localMessageSequence = 0;

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export function resolveAgentSocketUrl(apiBaseUrl: string, agentType: AgentType): string {
  const normalized = trimTrailingSlash(apiBaseUrl.trim());

  if (/^https?:\/\//.test(normalized)) return `${normalized}/socket/${agentType}`;

  const origin = typeof window === "undefined" ? "http://localhost" : window.location.origin;
  const path = normalized.startsWith("/") ? normalized : `/${normalized}`;
  return `${trimTrailingSlash(origin)}${path}/socket/${agentType}`.replace(/([^:]\/)\/+/, "$1");
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    if (typeof record.message === "string") return record.message;
    if (typeof record.error === "string") return record.error;
    try {
      return JSON.stringify(error);
    } catch {
      return "智能体请求失败";
    }
  }
  return "智能体请求失败";
}

function cloneMessage(message: MessageEvent): AgentMessage {
  return {
    id: message.id,
    role: message.role,
    name: message.name,
    status: message.status ?? "pending",
    datetime: message.datetime,
    content: (message.content ?? []).map((content) => ({ ...content })),
    ext: message.ext ? { ...message.ext } : undefined,
  };
}

function mergeContentData(current: unknown, incoming: unknown, strategy?: "merge" | "append"): unknown {
  if (strategy === "append") {
    if (typeof incoming === "string") return `${typeof current === "string" ? current : ""}${incoming}`;
    if (Array.isArray(incoming)) return [...(Array.isArray(current) ? current : []), ...incoming];
  }
  if (current && incoming && typeof current === "object" && typeof incoming === "object" && !Array.isArray(incoming)) {
    return { ...(current as Record<string, unknown>), ...(incoming as Record<string, unknown>) };
  }
  return incoming;
}

function inferActivity(status: AgentMessageStatus | undefined): AgentActivityState {
  return status === "streaming" ? "streaming" : "pending";
}

function successResult(result: unknown): unknown {
  if (result && typeof result === "object" && typeof (result as Record<string, unknown>).success === "boolean") return result;
  return { success: true, message: result ?? "操作完成" };
}

function failureResult(error: unknown) {
  const message = toErrorMessage(error);
  return { success: false, error: message, message };
}

export function createAgentChatClient(options: CreateAgentChatClientOptions): AgentChatClient {
  const listeners = new Set<() => void>();
  let socket: AgentSocket | null = null;
  let snapshot: AgentChatSnapshot = {
    connection: "disconnected",
    activity: "idle",
    currentMessageId: null,
    messages: [],
    error: null,
    loadingHistory: false,
    clearingMemory: null,
  };

  const context = {
    projectId: options.projectId,
    agentType: options.agentType,
    ...(options.episodeId === undefined ? {} : { episodesId: options.episodeId }),
  };
  const isolationKey = `${options.projectId}:${options.agentType}${options.episodeId === undefined ? "" : `:${options.episodeId}`}`;

  function notify() {
    listeners.forEach((listener) => listener());
  }

  function update(next: Partial<AgentChatSnapshot>) {
    snapshot = { ...snapshot, ...next };
    notify();
  }

  function replaceMessage(id: string, change: (message: AgentMessage) => AgentMessage): AgentMessage | undefined {
    const current = snapshot.messages.find((message) => message.id === id);
    if (!current) return undefined;
    const nextMessage = change(current);
    update({ messages: snapshot.messages.map((message) => (message.id === id ? nextMessage : message)) });
    return nextMessage;
  }

  function auth() {
    return {
      token: options.getToken(),
      isolationKey,
      projectId: options.projectId,
      ...(options.episodeId === undefined ? {} : { scriptId: options.episodeId }),
    };
  }

  function setupHandlers(activeSocket: AgentSocket) {
    activeSocket.on("connect", () => update({ connection: "connected", error: null }));
    activeSocket.on("disconnect", () => update({ connection: "disconnected" }));
    activeSocket.on("connect_error", (error: unknown) => update({ connection: "error", error: toErrorMessage(error) }));
    activeSocket.on("error", (error: unknown) => update({ error: toErrorMessage(error) }));

    activeSocket.on("message", (event: MessageEvent) => {
      const message = cloneMessage(event);
      const messages = snapshot.messages.some((item) => item.id === message.id)
        ? snapshot.messages.map((item) => (item.id === message.id ? message : item))
        : [...snapshot.messages, message];
      update({
        messages,
        ...(message.role === "assistant" ? { currentMessageId: message.id, activity: inferActivity(message.status) } : {}),
      });
    });

    activeSocket.on("message:update", (event: MessageUpdateEvent) => {
      replaceMessage(event.id, (message) => ({
        ...message,
        status: event.status ?? message.status,
        ext: event.ext ? { ...message.ext, ...event.ext } : message.ext,
      }));
      if (event.status === "streaming") update({ activity: "streaming" });
      if (snapshot.currentMessageId === event.id && (event.status === "complete" || event.status === "error" || event.status === "stop")) {
        update({ activity: "idle", currentMessageId: null });
      }
    });

    activeSocket.on("content:add", (event: ContentAddEvent) => {
      replaceMessage(event.messageId, (message) => ({
        ...message,
        content: [...message.content, { ...event.content, status: event.content.status ?? "pending" }],
      }));
      if (event.content.status === "streaming") update({ activity: "streaming" });
    });

    activeSocket.on("content:update", (event: ContentUpdateEvent) => {
      replaceMessage(event.messageId, (message) => ({
        ...message,
        status: event.status === "streaming" && message.status === "pending" ? "streaming" : message.status,
        content: message.content.map((content) =>
          content.id === event.contentId
            ? {
                ...content,
                status: event.status ?? (event.strategy === "append" ? "streaming" : content.status),
                data: event.data === undefined ? content.data : mergeContentData(content.data, event.data, event.strategy),
              }
            : content,
        ),
      }));
      if (event.status === "streaming" || event.strategy === "append") update({ activity: "streaming" });
    });

    function registerReadHandler(event: "getPlanData" | "getFlowData", handler?: AgentServerHandler) {
      activeSocket.on(event, async (payload: unknown, callback?: (response: unknown) => void) => {
        if (typeof callback !== "function") return;
        if (!handler) {
          callback(failureResult(new Error(`未配置 ${event} 处理器`)));
          return;
        }
        try {
          const result = await handler(payload);
          callback(result === undefined ? failureResult(new Error(`${event} 没有返回数据`)) : result);
        } catch (error) {
          callback(failureResult(error));
        }
      });
    }

    function registerMutationHandler(
      event: "addDeriveAsset" | "delDeriveAsset" | "generateDeriveAsset" | "generateStoryboard" | "addStoryboard",
      handler?: AgentServerHandler,
    ) {
      activeSocket.on(event, async (payload: unknown, callback?: (response: unknown) => void) => {
        if (typeof callback !== "function") return;
        if (!handler) {
          callback(failureResult(new Error(`未配置 ${event} 处理器`)));
          return;
        }
        try {
          callback(successResult(await handler(payload)));
        } catch (error) {
          callback(failureResult(error));
        }
      });
    }

    if (options.agentType === "scriptAgent") {
      registerReadHandler("getPlanData", options.handlers?.getPlanData);
    } else {
      registerReadHandler("getFlowData", options.handlers?.getFlowData);
      registerMutationHandler("addDeriveAsset", options.handlers?.addDeriveAsset);
      registerMutationHandler("delDeriveAsset", options.handlers?.delDeriveAsset);
      registerMutationHandler("generateDeriveAsset", options.handlers?.generateDeriveAsset);
      registerMutationHandler("generateStoryboard", options.handlers?.generateStoryboard);
      registerMutationHandler("addStoryboard", options.handlers?.addStoryboard);
    }
  }

  function ensureSocket(): AgentSocket {
    if (socket) return socket;
    socket = (options.socketFactory ?? defaultSocketFactory)(resolveAgentSocketUrl(options.apiBaseUrl, options.agentType), {
      autoConnect: false,
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
      auth: auth(),
    });
    setupHandlers(socket);
    return socket;
  }

  const client: AgentChatClient = {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    connect() {
      const activeSocket = ensureSocket();
      if (activeSocket.connected || snapshot.connection === "connecting") return;
      activeSocket.auth = auth();
      update({ connection: "connecting", error: null });
      activeSocket.connect();
    },
    disconnect() {
      socket?.disconnect();
      update({ connection: "disconnected" });
    },
    reconnect() {
      const activeSocket = ensureSocket();
      activeSocket.disconnect();
      activeSocket.auth = auth();
      update({ connection: "connecting", error: null });
      activeSocket.connect();
    },
    async loadHistory() {
      const messageIdsAtStart = new Set(snapshot.messages.map((message) => message.id));
      update({ loadingHistory: true, error: null });
      try {
        const messages = await options.apiClient.request<AgentMessage[]>("/agents/getMemory", {
          method: "POST",
          body: JSON.stringify(context),
        });
        const history = messages.map(cloneMessage);
        const historyIds = new Set(history.map((message) => message.id));
        const liveMessages = snapshot.messages.filter((message) => !messageIdsAtStart.has(message.id) && !historyIds.has(message.id));
        update({ messages: [...history, ...liveMessages] });
      } catch (error) {
        update({ error: toErrorMessage(error) });
      } finally {
        update({ loadingHistory: false });
      }
    },
    send(content) {
      const text = content.trim();
      if (!text || !socket?.connected) return false;
      const userMessage: AgentMessage = {
        id: `user_${Date.now()}_${++localMessageSequence}`,
        role: "user",
        status: "complete",
        datetime: new Date().toISOString(),
        content: [{ type: "text", data: text, status: "complete" }],
      };
      update({ messages: [...snapshot.messages, userMessage], error: null });
      socket.emit("chat", { content: text });
      return true;
    },
    stop() {
      if (!socket?.connected || !snapshot.currentMessageId) return false;
      const messageId = snapshot.currentMessageId;
      replaceMessage(messageId, (message) => ({ ...message, status: "stop" }));
      update({ activity: "idle", currentMessageId: null });
      socket.emit("stop", { messageId });
      return true;
    },
    async clearMemory(type: MemoryType) {
      update({ clearingMemory: type, error: null });
      try {
        await options.apiClient.request("/agents/clearMemory", {
          method: "POST",
          body: JSON.stringify({ ...context, type }),
        });
        await client.loadHistory();
      } catch (error) {
        update({ error: toErrorMessage(error) });
      } finally {
        update({ clearingMemory: null });
      }
    },
    updateThinkLevel(level) {
      socket?.emit("updateThinkConfig", { think: level > 0, thinlLevel: level });
    },
  };

  return client;
}

export type { CreateAgentChatClientOptions };
