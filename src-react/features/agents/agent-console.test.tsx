import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AgentConsole } from "./agent-console";
import type { AgentChatClient, AgentChatSnapshot } from "./types";

function createClient(overrides: Partial<AgentChatSnapshot> = {}): AgentChatClient {
  let snapshot: AgentChatSnapshot = {
    connection: "connected",
    activity: "idle",
    thinkLevel: 0,
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
    ...overrides,
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
    updateThinkLevel: vi.fn((level) => {
      snapshot = { ...snapshot, thinkLevel: level };
      listeners.forEach((listener) => listener());
    }),
    updateContext: vi.fn(),
  };
}

afterEach(() => vi.restoreAllMocks());

describe("AgentConsole", () => {
  it("uses the episode title and connection dot, then sends an instruction", async () => {
    const client = createClient();
    render(<AgentConsole client={client} title="第一幕" display="panel" />);

    expect(screen.getByRole("heading", { name: "第一幕" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "连接状态：已连接" })).toBeInTheDocument();
    expect(screen.getByText("剧本已拆分")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("发送指令"), { target: { value: "继续生成第二幕" } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    expect(client.send).toHaveBeenCalledWith("继续生成第二幕");
    await waitFor(() => expect(screen.getByLabelText("发送指令")).toHaveValue(""));
  });

  it("keeps reconnect and all memory operations inside the settings menu", async () => {
    const client = createClient();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<AgentConsole client={client} title="第一幕" confirmClear={() => true} display="panel" />);

    expect(screen.queryByRole("button", { name: "重新连接" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "智能体设置" }));
    let menu = screen.getByRole("menu", { name: "智能体设置菜单" });
    fireEvent.click(within(menu).getByRole("menuitem", { name: "重新连接" }));

    for (const name of ["清除消息记忆", "清除摘要记忆", "清除所有记忆"] as const) {
      fireEvent.click(screen.getByRole("button", { name: "智能体设置" }));
      menu = screen.getByRole("menu", { name: "智能体设置菜单" });
      fireEvent.click(within(menu).getByRole("menuitem", { name }));
    }

    expect(client.reconnect).toHaveBeenCalledOnce();
    await waitFor(() => {
      expect(client.clearMemory).toHaveBeenCalledWith("message");
      expect(client.clearMemory).toHaveBeenCalledWith("summary");
      expect(client.clearMemory).toHaveBeenCalledWith("all");
    });
  });

  it("shows think levels only when the active model supports thinking", () => {
    const client = createClient();
    const hidden = render(<AgentConsole client={client} title="第一幕" display="panel" />);
    expect(screen.queryByRole("button", { name: "思考级别" })).not.toBeInTheDocument();
    hidden.unmount();

    render(<AgentConsole client={client} title="第一幕" display="panel" showThink />);
    fireEvent.click(screen.getByRole("button", { name: "思考级别" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "深度思考" }));
    expect(client.updateThinkLevel).toHaveBeenCalledWith(2);
    expect(screen.getByRole("button", { name: "思考级别" })).toHaveTextContent("深度思考");
  });

  it("renders upstream content segments without custom avatars or status badges", () => {
    const client = createClient({
      messages: [
        {
          id: "assistant-1",
          role: "assistant",
          name: "视频策划",
          status: "complete",
          datetime: "2026-07-20T10:00:00.000Z",
          content: [
            { id: "thinking-1", type: "thinking", status: "complete", data: { title: "已思考", text: "先分析镜头" }, ext: { collapsed: true } },
            { id: "markdown-1", type: "markdown", status: "complete", data: "## 制作计划\n\n- 生成资产\n- 生成分镜" },
            { id: "suggestion-1", type: "suggestion", status: "complete", data: [{ title: "开始制作视频", prompt: "请帮我开始制作视频" }] },
          ],
        },
        {
          id: "user-1",
          role: "user",
          status: "complete",
          datetime: "2026-07-20T10:00:01.000Z",
          content: [{ id: "user-text", type: "text", status: "complete", data: "继续制作" }],
        },
      ],
    });

    render(<AgentConsole client={client} title="第一幕" display="panel" />);

    expect(screen.getByText("视频策划")).toBeInTheDocument();
    expect(screen.getByText("已思考")).toBeInTheDocument();
    expect(screen.getByTestId("thinking-segment")).not.toHaveAttribute("open");
    expect(screen.getByRole("heading", { name: "制作计划", level: 2 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "开始制作视频" })).toBeInTheDocument();
    expect(screen.queryByText("智能体")).not.toBeInTheDocument();
    expect(document.querySelector("svg.lucide-bot")).not.toBeInTheDocument();
    expect(document.querySelector('[data-message-role="assistant"] [data-message-variant="outline"]')).toHaveClass("border-[#5e5e5e]");
    expect(document.querySelector('[data-message-role="user"] [data-message-variant="base"]')).toHaveClass("bg-[#2c2c2c]");
  });

  it("disables input while generating and turns send into stop", () => {
    const client = createClient({ activity: "streaming", currentMessageId: "assistant-1" });
    render(<AgentConsole client={client} title="第一幕" display="panel" />);

    expect(screen.getByLabelText("发送指令")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "发送" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "停止生成" }));
    expect(client.stop).toHaveBeenCalledOnce();
  });

  it("disables both input and action while disconnected", () => {
    const client = createClient({ connection: "disconnected" });
    render(<AgentConsole client={client} title="第一幕" display="panel" />);

    expect(screen.getByRole("status", { name: "连接状态：未连接" })).toBeInTheDocument();
    expect(screen.getByLabelText("发送指令")).toBeDisabled();
    expect(screen.getByRole("button", { name: "发送" })).toBeDisabled();
  });
});
