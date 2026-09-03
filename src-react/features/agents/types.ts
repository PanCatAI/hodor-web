export type AgentType = "scriptAgent" | "productionAgent";
export type AgentConnectionState = "disconnected" | "connecting" | "connected" | "error";
export type AgentActivityState = "idle" | "pending" | "streaming";
export type AgentMessageStatus = "pending" | "streaming" | "complete" | "error" | "stop";
export type MemoryType = "message" | "summary" | "all";

export interface ProductionRunProgress {
  runId: string;
  stage: string;
  status: string;
  attempt: number;
  objective: string;
  updatedAt: string;
  error: { message?: string; retryable?: boolean } | null;
}

export interface AgentMessageContent {
  id?: string;
  type: string;
  status: AgentMessageStatus;
  data: unknown;
  ext?: Record<string, unknown>;
}

export interface AgentMessage {
  id: string;
  role: "assistant" | "user" | "system";
  name?: string;
  status: AgentMessageStatus;
  datetime: string;
  content: AgentMessageContent[];
  ext?: Record<string, unknown>;
}

export interface AgentChatSnapshot {
  connection: AgentConnectionState;
  activity: AgentActivityState;
  thinkLevel: 0 | 1 | 2 | 3;
  currentMessageId: string | null;
  messages: AgentMessage[];
  error: string | null;
  productionRun: ProductionRunProgress | null;
  loadingHistory: boolean;
  clearingMemory: MemoryType | null;
}

export interface AgentSocket {
  connected: boolean;
  auth?: Record<string, unknown>;
  on(event: string, listener: (...args: any[]) => void): this;
  off(event: string, listener?: (...args: any[]) => void): this;
  emit(event: string, data?: unknown): this;
  connect(): this;
  disconnect(): this;
}

export interface AgentSocketOptions {
  /** 后端 Socket.IO Server 挂载路径；必须与服务端 path 一致，否则请求落到默认 /socket.io 被 401。 */
  path: string;
  autoConnect: false;
  /** 传输顺序固定为先 polling 后 websocket：先可靠建立认证会话再自动升级，避免本机 WebSocket 首握悬挂。 */
  transports: ["polling", "websocket"];
  reconnection: true;
  reconnectionAttempts: number;
  reconnectionDelay: number;
  reconnectionDelayMax: number;
  timeout: number;
  auth: Record<string, unknown>;
}

export type AgentSocketFactory = (url: string, options: AgentSocketOptions) => AgentSocket;

export type AgentServerHandler<TPayload = unknown, TResult = unknown> = (payload: TPayload) => TResult | Promise<TResult>;

export interface AgentWorkDataTagEvent {
  tag: string;
  value: string;
  attrs: Record<string, string>;
  status: AgentMessageStatus;
}

export interface AgentServerHandlers {
  getPlanData?: AgentServerHandler;
  getFlowData?: AgentServerHandler;
  addDeriveAsset?: AgentServerHandler;
  delDeriveAsset?: AgentServerHandler;
  generateDeriveAsset?: AgentServerHandler;
  generateStoryboard?: AgentServerHandler;
  addStoryboard?: AgentServerHandler;
  onWorkDataTag?: AgentServerHandler<AgentWorkDataTagEvent, void>;
  restoreWorkData?: AgentServerHandler<void, unknown>;
  stopRecovery?: () => void;
  updateContext?: (context: { projectId: number; episodeId?: number }) => void;
}

export interface AgentChatClient {
  getSnapshot(): AgentChatSnapshot;
  subscribe(listener: () => void): () => void;
  connect(): void;
  disconnect(): void;
  reconnect(): void;
  loadHistory(): Promise<void>;
  send(content: string): boolean;
  stop(): boolean;
  clearMemory(type: MemoryType): Promise<void>;
  updateThinkLevel(level: 0 | 1 | 2 | 3): void;
  updateContext(context: { projectId: number; episodeId?: number }): void;
}
