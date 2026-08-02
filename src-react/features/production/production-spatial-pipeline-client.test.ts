import { describe, expect, it, vi } from "vitest";

import {
  createProductionSpatialPipelineClient,
  type ProductionSpatialPipelineSocket,
  type ProductionSpatialPipelineSocketFactory,
} from "./production-spatial-pipeline-client";

class FakeSocket implements ProductionSpatialPipelineSocket {
  connected = false;
  auth?: Record<string, unknown>;
  emitted: Array<{ event: string; data?: unknown }> = [];
  private listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  on(event: string, listener: (...args: unknown[]) => void) {
    const listeners = this.listeners.get(event) ?? new Set();
    listeners.add(listener);
    this.listeners.set(event, listeners);
    return this;
  }

  off(event: string, listener?: (...args: unknown[]) => void) {
    if (listener) this.listeners.get(event)?.delete(listener);
    else this.listeners.delete(event);
    return this;
  }

  emit(event: string, data?: unknown, callback?: (response: unknown) => void) {
    this.emitted.push({ event, data });
    if (event === "productionSpatialPipeline:start") {
      callback?.({ success: true, accepted: true, projectId: 7, scriptId: 12, currentStage: "sceneMaster" });
    }
    return this;
  }

  connect() {
    this.connected = true;
    for (const listener of this.listeners.get("connect") ?? []) listener();
    return this;
  }

  disconnect() {
    this.connected = false;
    return this;
  }
}

describe("production spatial pipeline socket client", () => {
  it("connects to scriptAgent and starts the scoped pipeline with acknowledgement", async () => {
    const socket = new FakeSocket();
    const socketFactory = vi.fn(() => socket) as unknown as ProductionSpatialPipelineSocketFactory;
    const client = createProductionSpatialPipelineClient({
      apiBaseUrl: "https://pancat.example/hodor/api/",
      projectId: 7,
      getToken: () => "token-7",
      socketFactory,
    });

    await expect(client.start({ scriptId: 12, objective: "启动或恢复空间注册" })).resolves.toEqual(
      expect.objectContaining({ accepted: true, scriptId: 12, currentStage: "sceneMaster" }),
    );

    expect(socketFactory).toHaveBeenCalledWith(
      "https://pancat.example/hodor/api/socket/scriptAgent",
      expect.objectContaining({ autoConnect: false }),
    );
    expect(socket.auth).toEqual({ token: "token-7", isolationKey: "7:scriptAgent", projectId: 7 });
    expect(socket.emitted).toContainEqual({
      event: "productionSpatialPipeline:start",
      data: { scriptId: 12, objective: "启动或恢复空间注册" },
    });
  });

  it("surfaces a rejected start acknowledgement", async () => {
    const socket = new FakeSocket();
    socket.emit = vi.fn((event: string, data?: unknown, callback?: (response: unknown) => void) => {
      socket.emitted.push({ event, data });
      callback?.({ success: false, accepted: false, error: "剧本不属于当前项目" });
      return socket;
    });
    const client = createProductionSpatialPipelineClient({
      apiBaseUrl: "http://localhost:10588/api",
      projectId: 7,
      getToken: () => "token-7",
      socketFactory: (() => socket) as ProductionSpatialPipelineSocketFactory,
    });

    await expect(client.start({ scriptId: 12, objective: "恢复镜头覆盖" })).rejects.toThrow("剧本不属于当前项目");
  });
});
