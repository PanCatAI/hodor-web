import { act, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { HodorApiClient } from "@react/lib/api/client";
import { ScriptAgentPage } from "./agent-pages";
import type { AgentSocket, AgentSocketFactory } from "./types";

class PageSocket implements AgentSocket {
  connected = false;
  auth?: Record<string, unknown>;
  private readonly listeners = new Map<string, Set<(...args: any[]) => void>>();

  on(event: string, listener: (...args: any[]) => void) {
    const listeners = this.listeners.get(event) ?? new Set();
    listeners.add(listener);
    this.listeners.set(event, listeners);
    return this;
  }

  off(event: string, listener?: (...args: any[]) => void) {
    if (listener) this.listeners.get(event)?.delete(listener);
    else this.listeners.delete(event);
    return this;
  }

  emit() {
    return this;
  }

  connect() {
    this.connected = true;
    this.trigger("connect");
    return this;
  }

  disconnect() {
    this.connected = false;
    this.trigger("disconnect", "io client disconnect");
    return this;
  }

  trigger(event: string, ...args: unknown[]) {
    this.listeners.get(event)?.forEach((listener) => listener(...args));
  }
}

describe("agent pages", () => {
  it("creates real script handlers when the router does not inject them", async () => {
    const socket = new PageSocket();
    const request = vi.fn(async (path: string) => {
      if (path === "/agents/getMemory") return [];
      if (path === "/scriptAgent/getPlanData") {
        return { id: 41, data: { storySkeleton: "雨夜相遇", adaptationStrategy: "悬疑", script: [] } };
      }
      throw new Error(`未预期接口 ${path}`);
    });
    const socketFactory = (() => socket) as AgentSocketFactory;

    let view!: ReturnType<typeof render>;
    await act(async () => {
      view = render(
        <ScriptAgentPage
          projectId={7}
          apiClient={{ request } as unknown as HodorApiClient}
          apiBaseUrl="/api"
          getToken={() => "session-token"}
          socketFactory={socketFactory}
        />,
      );
    });
    let response: unknown;
    await act(async () => {
      response = await new Promise((resolve) => socket.trigger("getPlanData", { key: "script" }, resolve));
    });

    expect(response).toEqual({ storySkeleton: "雨夜相遇", adaptationStrategy: "悬疑", script: [] });
    expect(request).toHaveBeenCalledWith("/scriptAgent/getPlanData", expect.anything());
    await act(async () => view.unmount());
  });
});
