import { io } from "socket.io-client";

import { resolveAgentSocketUrl } from "@react/features/agents/agent-chat-client";

export interface ProductionSpatialPipelineStartInput {
  scriptId: number;
  objective: string;
}

export type ProductionSpatialPipelineStartAck =
  | {
      success: true;
      accepted: true;
      projectId: number;
      scriptId: number;
      currentStage: string | null;
    }
  | {
      success: false;
      accepted: false;
      error: string;
    };

export interface ProductionSpatialPipelineSocket {
  connected: boolean;
  auth?: Record<string, unknown>;
  on(event: string, listener: (...args: unknown[]) => void): this;
  off(event: string, listener?: (...args: unknown[]) => void): this;
  emit(event: string, data?: unknown, callback?: (response: unknown) => void): this;
  connect(): this;
  disconnect(): this;
}

export interface ProductionSpatialPipelineSocketOptions {
  autoConnect: false;
  transports: ["websocket", "polling"];
  reconnection: true;
  reconnectionAttempts: number;
  reconnectionDelay: number;
  reconnectionDelayMax: number;
  timeout: number;
  auth: Record<string, unknown>;
}

export type ProductionSpatialPipelineSocketFactory = (
  url: string,
  options: ProductionSpatialPipelineSocketOptions,
) => ProductionSpatialPipelineSocket;

const defaultSocketFactory: ProductionSpatialPipelineSocketFactory = (url, options) =>
  io(url, options) as unknown as ProductionSpatialPipelineSocket;

function errorMessage(value: unknown): string {
  if (value instanceof Error && value.message) return value.message;
  if (value && typeof value === "object" && "message" in value && typeof value.message === "string") return value.message;
  return "空间生产连接失败";
}

export function createProductionSpatialPipelineClient({
  apiBaseUrl,
  projectId,
  getToken,
  socketFactory = defaultSocketFactory,
  timeoutMs = 10_000,
}: {
  apiBaseUrl: string;
  projectId: number;
  getToken: () => string | null;
  socketFactory?: ProductionSpatialPipelineSocketFactory;
  timeoutMs?: number;
}) {
  let socket: ProductionSpatialPipelineSocket | null = null;
  let connecting: Promise<void> | null = null;

  function auth() {
    return {
      token: getToken(),
      isolationKey: `${projectId}:scriptAgent`,
      projectId,
    };
  }

  function ensureSocket() {
    if (socket) return socket;
    socket = socketFactory(resolveAgentSocketUrl(apiBaseUrl, "scriptAgent"), {
      autoConnect: false,
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Number.POSITIVE_INFINITY,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 30_000,
      timeout: 10_000,
      auth: auth(),
    });
    return socket;
  }

  async function connect() {
    const activeSocket = ensureSocket();
    if (activeSocket.connected) return;
    if (connecting) return connecting;
    connecting = new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        activeSocket.off("connect", onConnect);
        activeSocket.off("connect_error", onError);
      };
      const onConnect = () => {
        cleanup();
        resolve();
      };
      const onError = (error: unknown) => {
        cleanup();
        reject(new Error(errorMessage(error)));
      };
      activeSocket.on("connect", onConnect);
      activeSocket.on("connect_error", onError);
      activeSocket.auth = auth();
      activeSocket.connect();
    }).finally(() => {
      connecting = null;
    });
    return connecting;
  }

  return {
    async start(input: ProductionSpatialPipelineStartInput): Promise<Extract<ProductionSpatialPipelineStartAck, { success: true }>> {
      if (!Number.isSafeInteger(input.scriptId) || input.scriptId <= 0) throw new Error("空间生产缺少有效的剧本 ID");
      const objective = input.objective.trim();
      if (!objective) throw new Error("空间生产缺少任务说明");
      await connect();
      const activeSocket = ensureSocket();
      return await new Promise((resolve, reject) => {
        const timer = globalThis.setTimeout(() => reject(new Error("空间生产启动确认超时")), timeoutMs);
        activeSocket.emit(
          "productionSpatialPipeline:start",
          { scriptId: input.scriptId, objective },
          (response) => {
            globalThis.clearTimeout(timer);
            const ack = response as ProductionSpatialPipelineStartAck;
            if (!ack || ack.success !== true || ack.accepted !== true) {
              reject(new Error(ack && "error" in ack && ack.error ? ack.error : "空间生产启动失败"));
              return;
            }
            resolve(ack);
          },
        );
      });
    },
    disconnect() {
      socket?.disconnect();
      socket = null;
      connecting = null;
    },
  };
}

export type ProductionSpatialPipelineClient = ReturnType<typeof createProductionSpatialPipelineClient>;
