export type AgentType = "scriptAgent" | "productionAgent";
export type AgentConnectionState = "disconnected" | "connecting" | "connected" | "error";
export type AgentActivityState = "idle" | "pending" | "streaming";
export type AgentMessageStatus = "pending" | "streaming" | "complete" | "error" | "stop";
export type MemoryType = "message" | "summary" | "all";

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
  currentMessageId: string | null;
  messages: AgentMessage[];
  error: string | null;
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
  autoConnect: false;
  transports: ["websocket", "polling"];
  reconnection: true;
  reconnectionAttempts: number;
  reconnectionDelay: number;
  reconnectionDelayMax: number;
  timeout: number;
  auth: Record<string, unknown>;
}

export type AgentSocketFactory = (url: string, options: AgentSocketOptions) => AgentSocket;

export type AgentServerHandler<TPayload = unknown, TResult = unknown> = (payload: TPayload) => TResult | Promise<TResult>;

export interface AgentServerHandlers {
  getPlanData?: AgentServerHandler;
  getFlowData?: AgentServerHandler;
  addDeriveAsset?: AgentServerHandler;
  delDeriveAsset?: AgentServerHandler;
  generateDeriveAsset?: AgentServerHandler;
  generateStoryboard?: AgentServerHandler;
  addStoryboard?: AgentServerHandler;
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
}
