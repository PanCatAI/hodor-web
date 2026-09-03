import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
    productionRun: null,
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

  it("keeps the composer editable while generating and offers a dedicated stop that preserves the draft", () => {
    const client = createClient({ activity: "streaming", currentMessageId: "assistant-1" });
    render(<AgentConsole client={client} title="第一幕" display="panel" />);

    const composer = screen.getByLabelText("发送指令");
    expect(composer).toBeEnabled();
    fireEvent.change(composer, { target: { value: "先把这段草稿留住" } });

    // 生成中始终有独立的「停止生成」控件，与发送按钮分离，不依赖清空输入框。
    const stop = screen.getByRole("button", { name: "停止生成" });
    expect(stop).toBeEnabled();
    fireEvent.click(stop);

    expect(client.stop).toHaveBeenCalledOnce();
    expect(client.send).not.toHaveBeenCalled();
    // 停止生成绝不清空或覆盖草稿。
    expect(composer).toHaveValue("先把这段草稿留住");
  });

  it("shows the live production stage instead of an unexplained loading indicator", () => {
    const client = createClient({
      activity: "streaming",
      currentMessageId: "assistant-running",
      productionRun: {
        runId: "production-run-1",
        stage: "generateAssets",
        status: "running",
        attempt: 3,
        objective: "生成年幼 Evelyn 的衍生资产图片",
        updatedAt: "2026-08-01T03:53:41.876Z",
        error: null,
      },
      messages: [
        {
          id: "assistant-running",
          role: "assistant",
          name: "执行导演",
          status: "streaming",
          datetime: "2026-08-01T03:53:41.876Z",
          content: [],
        },
      ],
    });

    render(<AgentConsole client={client} title="童年圣像" display="panel" />);

    expect(screen.getByRole("status", { name: "生产阶段进度" })).toHaveTextContent("资产生成");
    expect(screen.getByRole("status", { name: "生产阶段进度" })).toHaveTextContent("第 3 次尝试");
    expect(screen.getByRole("status", { name: "生产阶段进度" })).toHaveTextContent("生成年幼 Evelyn 的衍生资产图片");
  });

  it("lets a new instruction replace a stuck generation", async () => {
    const client = createClient({ activity: "streaming", currentMessageId: "assistant-1" });
    render(<AgentConsole client={client} title="第一幕" display="panel" />);

    fireEvent.change(screen.getByLabelText("发送指令"), {
      target: { value: "继续执行衍生资产分析" },
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: "发送",
      }),
    );

    expect(client.send).toHaveBeenCalledWith("继续执行衍生资产分析");
    expect(client.stop).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByLabelText("发送指令")).toHaveValue(""));
  });

  it("disables both input and action while disconnected and shows an inline reconnect alert", () => {
    const client = createClient({ connection: "disconnected" });
    render(<AgentConsole client={client} title="第一幕" display="panel" />);

    expect(screen.getByRole("status", { name: "连接状态：未连接" })).toBeInTheDocument();
    expect(screen.getByLabelText("发送指令")).toBeDisabled();
    expect(screen.getByRole("button", { name: "发送" })).toBeDisabled();

    // 断线状态用输入区上方的明确横幅说明，并提供直达重连，而非把入口藏进菜单。
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("连接已断开");
    const inlineReconnect = within(alert).getByRole("button", { name: "重新连接" });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(inlineReconnect);
    expect(client.reconnect).toHaveBeenCalledOnce();
    expect(client.send).not.toHaveBeenCalled();
  });

  it("imports pasted source material and tells the current agent to read it", async () => {
    const client = createClient();
    const onImportSource = vi.fn(async () => ({ sourceName: "粘贴原文", chapterCount: 2 }));
    render(<AgentConsole client={client} title="互动剧智能体" display="panel" onImportSource={onImportSource} />);

    fireEvent.click(screen.getByRole("button", { name: "上传文档" }));
    fireEvent.change(screen.getByLabelText("粘贴文档内容"), {
      target: { value: "第一章 雨夜\n她推开门。\n第二章 追踪\n脚步声逼近。" },
    });
    fireEvent.click(screen.getByRole("button", { name: "确认导入" }));

    await waitFor(() =>
      expect(onImportSource).toHaveBeenCalledWith({
        text: "第一章 雨夜\n她推开门。\n第二章 追踪\n脚步声逼近。",
      }),
    );
    expect(client.send).toHaveBeenCalledWith(expect.stringContaining("已上传文档“粘贴原文”，共解析为 2 章"));
    expect(await screen.findByRole("status", { name: "文档上传成功" })).toHaveTextContent("文档已解析为 2 章");
  });

  it("lets the user choose txt, docx, or markdown from the chat composer", () => {
    const client = createClient();
    render(
      <AgentConsole
        client={client}
        title="互动剧智能体"
        display="panel"
        onImportSource={vi.fn(async () => ({ sourceName: "原文", chapterCount: 1 }))}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "上传文档" }));
    expect(screen.getByLabelText("选择文档")).toHaveAttribute("accept", expect.stringContaining(".md"));
    expect(screen.getByText("支持 TXT、DOCX、MD，最大 10MB")).toBeInTheDocument();
  });

  it("imports a document dropped anywhere on the conversation and tells the current agent to read it", async () => {
    const client = createClient();
    const onImportSource = vi.fn(async () => ({ sourceName: "人物小传", chapterCount: 1 }));
    render(<AgentConsole client={client} title="项目智能体" display="panel" onImportSource={onImportSource} />);
    const file = new File(["第一章\n她推开门。"], "人物小传.md", { type: "text/markdown" });

    fireEvent.dragEnter(screen.getByRole("region", { name: "项目智能体对话框" }), {
      dataTransfer: { files: [file], types: ["Files"] },
    });
    expect(screen.getByText("松开即可交给项目智能体")).toBeInTheDocument();

    fireEvent.drop(screen.getByRole("region", { name: "项目智能体对话框" }), {
      dataTransfer: { files: [file], types: ["Files"] },
    });

    await waitFor(() => expect(onImportSource).toHaveBeenCalledWith({ file }));
    expect(client.send).toHaveBeenCalledWith(expect.stringContaining("已上传文档“人物小传”，共解析为 1 章"));
    expect(await screen.findByRole("status", { name: "文档上传成功" })).toHaveTextContent("文档已解析为 1 章");
  });

  it("keeps a taller composer that never shrinks below its comfortable min-height", () => {
    const client = createClient();
    render(<AgentConsole client={client} title="第一幕" display="panel" />);

    const composer = screen.getByLabelText("发送指令");
    // 输入区作为右侧面板唯一入口更大更醒目：默认高度明显高于单行，纵向随内容自增高到上限。
    expect(composer.className).toContain("min-h-28");
    expect(composer.className).toContain("max-h-[216px]");
    expect(composer).toHaveClass("resize-none");
    expect(composer).toHaveClass("overflow-y-auto");
  });

  it("hints Enter sends / Shift+Enter newline and sends whole multi-line instructions only on Enter", async () => {
    const client = createClient();
    render(<AgentConsole client={client} title="第一幕" display="panel" />);

    const hint = screen.getByTestId("composer-hint");
    expect(hint).toHaveTextContent("Enter 发送");
    expect(hint).toHaveTextContent("Shift+Enter 换行");

    const composer = screen.getByLabelText("发送指令") as HTMLTextAreaElement;
    fireEvent.change(composer, { target: { value: "第一行要求\n第二行补充说明" } });
    // Shift+Enter 只换行、不发送。
    fireEvent.keyDown(composer, { key: "Enter", shiftKey: true });
    expect(client.send).not.toHaveBeenCalled();
    expect(composer).toHaveValue("第一行要求\n第二行补充说明");

    // Enter 发送完整的多行指令。
    fireEvent.keyDown(composer, { key: "Enter" });
    expect(client.send).toHaveBeenCalledWith("第一行要求\n第二行补充说明");
    await waitFor(() => expect(composer).toHaveValue(""));
  });

  it("does not send when Enter confirms a Chinese IME composition", () => {
    const client = createClient();
    render(<AgentConsole client={client} title="第一幕" display="panel" />);

    const composer = screen.getByLabelText("发送指令");
    fireEvent.change(composer, { target: { value: "为当前镜头" } });
    const compositionEnter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    Object.defineProperty(compositionEnter, "isComposing", { get: () => true });
    fireEvent(composer, compositionEnter);

    expect(client.send).not.toHaveBeenCalled();
    expect(composer).toHaveValue("为当前镜头");
  });

  it("shows parsing-in-progress while a dropped document is imported, then the sent state", async () => {
    const client = createClient();
    let finish: (result: { sourceName: string; chapterCount: number }) => void = () => undefined;
    const pending = new Promise<{ sourceName: string; chapterCount: number }>((resolve) => {
      finish = resolve;
    });
    const onImportSource = vi.fn(() => pending);
    render(<AgentConsole client={client} title="项目智能体" display="panel" onImportSource={onImportSource} />);
    const file = new File(["第一章\n她推开门。"], "人物小传.md", { type: "text/markdown" });

    fireEvent.drop(screen.getByRole("region", { name: "项目智能体对话框" }), {
      dataTransfer: { files: [file], types: ["Files"] },
    });

    // 解析中状态在输入区上方清楚可见，不把用户晾在静默等待里。
    expect(await screen.findByRole("status", { name: "文档解析中" })).toHaveTextContent("正在解析");
    expect(client.send).not.toHaveBeenCalled();

    await act(async () => {
      finish({ sourceName: "人物小传", chapterCount: 1 });
    });
    await waitFor(() => expect(client.send).toHaveBeenCalledWith(expect.stringContaining("已上传文档“人物小传”，共解析为 1 章")));
    expect(await screen.findByRole("status", { name: "文档上传成功" })).toHaveTextContent("文档已解析为 1 章");
    expect(screen.queryByRole("status", { name: "文档解析中" })).not.toBeInTheDocument();
  });

  it("never overwrites an existing composer draft when the parsed document cannot be sent yet", async () => {
    const client = createClient({ activity: "streaming" });
    const onImportSource = vi.fn(async () => ({ sourceName: "粘贴原文", chapterCount: 2 }));
    render(<AgentConsole client={client} title="项目智能体" display="panel" onImportSource={onImportSource} />);

    const composer = screen.getByLabelText("发送指令");
    fireEvent.change(composer, { target: { value: "这是我先写好的要求" } });

    fireEvent.click(screen.getByRole("button", { name: "上传文档" }));
    fireEvent.change(screen.getByLabelText("粘贴文档内容"), {
      target: { value: "第一章 雨夜\n她推开门。\n第二章 追踪\n脚步声逼近。" },
    });
    fireEvent.click(screen.getByRole("button", { name: "确认导入" }));

    await waitFor(() => expect(onImportSource).toHaveBeenCalled());
    // 生成中无法立即发送：绝不吞掉用户草稿，指令并入草稿末尾由用户确认。
    expect(client.send).not.toHaveBeenCalled();
    const value = (composer as HTMLTextAreaElement).value;
    expect(value).toContain("这是我先写好的要求");
    expect(value).toContain("已上传文档“粘贴原文”，共解析为 2 章");
    expect(await screen.findByRole("status", { name: "文档上传成功" })).toHaveTextContent(/未覆盖|输入框/);
  });

  it("places the read-document instruction into an empty composer when disconnected instead of losing it", async () => {
    const client = createClient({ connection: "disconnected" });
    const onImportSource = vi.fn(async () => ({ sourceName: "人物小传", chapterCount: 1 }));
    render(<AgentConsole client={client} title="项目智能体" display="panel" onImportSource={onImportSource} />);

    const file = new File(["第一章"], "人物小传.md", { type: "text/markdown" });
    fireEvent.drop(screen.getByRole("region", { name: "项目智能体对话框" }), {
      dataTransfer: { files: [file], types: ["Files"] },
    });

    await waitFor(() => expect(onImportSource).toHaveBeenCalledWith({ file }));
    expect(client.send).not.toHaveBeenCalled();
    expect((screen.getByLabelText("发送指令") as HTMLTextAreaElement).value).toContain("已上传文档“人物小传”，共解析为 1 章");
    expect(await screen.findByRole("status", { name: "文档上传成功" })).toHaveTextContent(/未覆盖|输入框/);
  });

  it("keeps the composer draft and the upload dialog open with the error when a document import fails", async () => {
    const client = createClient();
    const onImportSource = vi.fn(async () => {
      throw new Error("解析失败：无法读取该文件");
    });
    render(<AgentConsole client={client} title="项目智能体" display="panel" onImportSource={onImportSource} />);

    const composer = screen.getByLabelText("发送指令");
    fireEvent.change(composer, { target: { value: "保留这段草稿" } });

    fireEvent.click(screen.getByRole("button", { name: "上传文档" }));
    fireEvent.change(screen.getByLabelText("粘贴文档内容"), { target: { value: "坏内容" } });
    fireEvent.click(screen.getByRole("button", { name: "确认导入" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("解析失败：无法读取该文件");
    expect(client.send).not.toHaveBeenCalled();
    // 失败不清空对话草稿，也不关闭对话框：可修正后重试或取消。
    expect(composer).toHaveValue("保留这段草稿");
    expect(screen.getByRole("dialog", { name: "上传文档" })).toBeInTheDocument();
  });
});
