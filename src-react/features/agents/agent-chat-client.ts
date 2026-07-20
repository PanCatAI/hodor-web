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
  initialMessages?: AgentMessage[];
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

const WORK_TAGS: Record<AgentType, string[]> = {
  scriptAgent: ["storySkeleton", "adaptationStrategy", "scriptItem"],
  productionAgent: ["script", "scriptPlan", "storyboardTable", "storyboardItem"],
};

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

function parseAttributes(value: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const pattern = /([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value)) !== null) attrs[match[1]] = match[2] ?? match[3] ?? "";
  return attrs;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function createAgentChatClient(options: CreateAgentChatClientOptions): AgentChatClient {
  const listeners = new Set<() => void>();
  let socket: AgentSocket | null = null;
  let activeProjectId = options.projectId;
  let activeEpisodeId = options.episodeId;
  let hasConnected = false;
  const rawContent = new Map<string, string>();
  const persistedWorkTags = new Map<string, string>();
  const initialMessages = (options.initialMessages ?? []).map(cloneMessage);
  const initialMessageIds = new Set(initialMessages.map((message) => message.id));
  let snapshot: AgentChatSnapshot = {
    connection: "disconnected",
    activity: "idle",
    thinkLevel: 0,
    currentMessageId: null,
    messages: initialMessages,
    error: null,
    loadingHistory: false,
    clearingMemory: null,
  };

  function context() {
    return {
      projectId: activeProjectId,
      agentType: options.agentType,
      ...(activeEpisodeId === undefined ? {} : { episodesId: activeEpisodeId }),
    };
  }

  function isolationKey() {
    return `${activeProjectId}:${options.agentType}${activeEpisodeId === undefined ? "" : `:${activeEpisodeId}`}`;
  }

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
      isolationKey: isolationKey(),
      projectId: activeProjectId,
      ...(activeEpisodeId === undefined ? {} : { scriptId: activeEpisodeId }),
    };
  }

  function contentKey(messageId: string, content: Pick<AgentMessageContent, "id" | "type">) {
    return `${messageId}:${content.id ?? content.type}`;
  }

  function stripAndPersistWorkTags(messageId: string, content: AgentMessageContent, source?: string, persist = true) {
    if (content.type !== "text" && content.type !== "markdown") return;
    const text = source ?? (typeof content.data === "string" ? content.data : null);
    if (text === null) return;
    const key = contentKey(messageId, content);
    rawContent.set(key, text);
    let visible = text;

    for (const tag of WORK_TAGS[options.agentType]) {
      const escaped = escapeRegExp(tag);
      const completePattern = new RegExp(`<${escaped}(\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, "g");
      let match: RegExpExecArray | null;
      while ((match = completePattern.exec(text)) !== null) {
        const stateKey = `${key}:${tag}:${match.index}`;
        const value = match[2].trim();
        if (persist && persistedWorkTags.get(stateKey) !== value) {
          persistedWorkTags.set(stateKey, value);
          void Promise.resolve(options.handlers?.onWorkDataTag?.({ tag, value, attrs: parseAttributes(match[1] ?? ""), status: "complete" })).catch(
            (error) => update({ error: toErrorMessage(error) }),
          );
        }
      }
      visible = visible.replace(completePattern, "");
      visible = visible.replace(new RegExp(`<${escaped}(?:\\s[^>]*)?>[\\s\\S]*$`), "");
    }
    content.data = visible;
  }

  function recoverSnapshotActivity() {
    const unfinished = [...snapshot.messages]
      .reverse()
      .find((message) => message.role === "assistant" && (message.status === "pending" || message.status === "streaming"));
    update({
      currentMessageId: unfinished?.id ?? null,
      activity: unfinished ? inferActivity(unfinished.status) : "idle",
    });
  }

  function isEmptyMessage(message: AgentMessage) {
    return message.content.every((content) => {
      if (typeof content.data === "string") return content.data.trim().length === 0;
      if (content.data === null || content.data === undefined) return true;
      if (Array.isArray(content.data)) return content.data.length === 0;
      if (typeof content.data === "object") return Object.keys(content.data as Record<string, unknown>).length === 0;
      return false;
    });
  }

  function setupHandlers(activeSocket: AgentSocket) {
    activeSocket.on("connect", () => {
      const reconnecting = hasConnected;
      hasConnected = true;
      update({ connection: "connected", error: null });
      activeSocket.emit("updateThinkConfig", { think: snapshot.thinkLevel > 0, thinlLevel: snapshot.thinkLevel });
      void Promise.resolve(options.handlers?.restoreWorkData?.()).catch((error) => update({ error: toErrorMessage(error) }));
      if (reconnecting) void client.loadHistory();
    });
    activeSocket.on("disconnect", () => update({ connection: "disconnected" }));
    activeSocket.on("connect_error", (error: unknown) => update({ connection: "error", error: toErrorMessage(error) }));
    activeSocket.on("error", (error: unknown) => update({ error: toErrorMessage(error) }));

    activeSocket.on("message", (event: MessageEvent) => {
      const message = cloneMessage(event);
      message.content.forEach((content) => stripAndPersistWorkTags(message.id, content));
      if (message.status === "complete" && isEmptyMessage(message)) return;
      const messages = snapshot.messages.some((item) => item.id === message.id)
        ? snapshot.messages.map((item) => (item.id === message.id ? message : item))
        : [...snapshot.messages, message];
      update({
        messages,
        ...(message.role === "assistant" ? { currentMessageId: message.id, activity: inferActivity(message.status) } : {}),
      });
    });

    activeSocket.on("message:update", (event: MessageUpdateEvent) => {
      const updatedMessage = replaceMessage(event.id, (message) => ({
        ...message,
        status: event.status ?? message.status,
        ext: event.ext ? { ...message.ext, ...event.ext } : message.ext,
      }));
      if (event.status === "complete" && updatedMessage && isEmptyMessage(updatedMessage)) {
        update({ messages: snapshot.messages.filter((message) => message.id !== event.id) });
      }
      if (event.status === "streaming") update({ activity: "streaming" });
      if (snapshot.currentMessageId === event.id && (event.status === "complete" || event.status === "error" || event.status === "stop")) {
        update({ activity: "idle", currentMessageId: null });
      }
    });

    activeSocket.on("content:add", (event: ContentAddEvent) => {
      replaceMessage(event.messageId, (message) => ({
        ...message,
        content: (() => {
          const content = {
            ...event.content,
            status: event.content.status ?? "pending",
            ...(event.content.type === "thinking" ? { ext: { collapsed: true, ...event.content.ext } } : {}),
          };
          stripAndPersistWorkTags(event.messageId, content);
          if (content.type !== "thinking") return [...message.content, content];
          const firstNonThinkingIndex = message.content.findIndex((item) => item.type !== "thinking");
          if (firstNonThinkingIndex === -1) return [...message.content, content];
          return [...message.content.slice(0, firstNonThinkingIndex), content, ...message.content.slice(firstNonThinkingIndex)];
        })(),
      }));
      if (event.content.status === "streaming") update({ activity: "streaming" });
    });

    activeSocket.on("content:update", (event: ContentUpdateEvent) => {
      replaceMessage(event.messageId, (message) => ({
        ...message,
        status: event.status === "streaming" && message.status === "pending" ? "streaming" : message.status,
        content: message.content.map((content) => {
          if (content.id !== event.contentId) return content;
          const key = contentKey(event.messageId, content);
          const currentData = rawContent.get(key) ?? content.data;
          const nextContent = {
            ...content,
            status: event.status ?? (event.strategy === "append" ? "streaming" : content.status),
            data: event.data === undefined ? currentData : mergeContentData(currentData, event.data, event.strategy),
          };
          stripAndPersistWorkTags(event.messageId, nextContent, typeof nextContent.data === "string" ? nextContent.data : undefined);
          return nextContent;
        }),
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
      reconnectionAttempts: Number.POSITIVE_INFINITY,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
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
      options.handlers?.stopRecovery?.();
      socket?.disconnect();
      update({ connection: "disconnected" });
    },
    reconnect() {
      const activeSocket = ensureSocket();
      options.handlers?.stopRecovery?.();
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
          body: JSON.stringify(context()),
        });
        const history = messages.map(cloneMessage);
        history.forEach((message) => message.content.forEach((content) => stripAndPersistWorkTags(message.id, content, undefined, false)));
        const historyIds = new Set(history.map((message) => message.id));
        const retainedMessages = snapshot.messages.filter(
          (message) =>
            !initialMessageIds.has(message.id) &&
            !historyIds.has(message.id) &&
            (!messageIdsAtStart.has(message.id) || message.status === "pending" || message.status === "streaming"),
        );
        update({ messages: [...initialMessages.filter((message) => !historyIds.has(message.id)), ...history, ...retainedMessages] });
        recoverSnapshotActivity();
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
          body: JSON.stringify({ ...context(), type }),
        });
        await client.loadHistory();
      } catch (error) {
        update({ error: toErrorMessage(error) });
      } finally {
        update({ clearingMemory: null });
      }
    },
    updateThinkLevel(level) {
      update({ thinkLevel: level });
      socket?.emit("updateThinkConfig", { think: level > 0, thinlLevel: level });
    },
    updateContext(nextContext) {
      activeProjectId = nextContext.projectId;
      activeEpisodeId = nextContext.episodeId;
      options.handlers?.updateContext?.(nextContext);
      if (socket) socket.auth = auth();
      if (options.agentType === "productionAgent" && socket?.connected && activeEpisodeId !== undefined) {
        socket.emit("updateContext", {
          isolationKey: isolationKey(),
          projectId: activeProjectId,
          scriptId: activeEpisodeId,
        });
      } else if (socket?.connected) {
        client.reconnect();
      }
    },
  };

  return client;
}

export type { CreateAgentChatClientOptions };
