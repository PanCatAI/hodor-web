import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AgentConsole } from "./agent-console";
import type { AgentChatClient, AgentChatSnapshot } from "./types";

function createClient(): AgentChatClient {
  let snapshot: AgentChatSnapshot = {
    connection: "connected",
    activity: "idle",
    currentMessageId: null,
    messages: [
      {
        id: "assistant-1",
        role: "assistant",
        name: "统筹",
        status: "complete",
        datetime: "2026-07-20T10:00:00.000Z",
        content: [{ id: "content-1", type: "markdown", status: "complete", data: "剧本已拆分" }],
      },
    ],
    error: null,
    loadingHistory: false,
    clearingMemory: null,
  };
  const listeners = new Set<() => void>();

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    connect: vi.fn(),
    disconnect: vi.fn(),
    reconnect: vi.fn(),
    loadHistory: vi.fn(async () => undefined),
    send: vi.fn(() => true),
    stop: vi.fn(() => true),
    clearMemory: vi.fn(async (type) => {
      snapshot = { ...snapshot, clearingMemory: type };
      listeners.forEach((listener) => listener());
      snapshot = { ...snapshot, clearingMemory: null };
      listeners.forEach((listener) => listener());
    }),
    updateThinkLevel: vi.fn(),
    updateContext: vi.fn(),
  };
}

describe("AgentConsole", () => {
  it("shows connection state and sends an instruction", async () => {
    const client = createClient();
    render(<AgentConsole client={client} title="剧本智能体" />);

    expect(screen.getByText("已连接")).toBeInTheDocument();
    expect(screen.getByText("剧本已拆分")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("发送指令"), { target: { value: "继续生成第二幕" } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    expect(client.send).toHaveBeenCalledWith("继续生成第二幕");
    await waitFor(() => expect(screen.getByLabelText("发送指令")).toHaveValue(""));
  });

  it("offers reconnect, stop, and all three memory operations", async () => {
    const client = createClient();
    render(<AgentConsole client={client} title="生产智能体" confirmClear={() => true} />);

    fireEvent.click(screen.getByRole("button", { name: "重新连接" }));
    fireEvent.click(screen.getByRole("button", { name: "停止生成" }));
    fireEvent.click(screen.getByRole("button", { name: "清空消息" }));
    fireEvent.click(screen.getByRole("button", { name: "清空摘要" }));
    fireEvent.click(screen.getByRole("button", { name: "清空全部" }));

    expect(client.reconnect).toHaveBeenCalledOnce();
    expect(client.stop).toHaveBeenCalledOnce();
    await waitFor(() => {
      expect(client.clearMemory).toHaveBeenCalledWith("message");
      expect(client.clearMemory).toHaveBeenCalledWith("summary");
      expect(client.clearMemory).toHaveBeenCalledWith("all");
    });
  });
});
