import { FormEvent, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Bot, BrainCircuit, CircleStop, PlugZap, RotateCcw, Send, Trash2, UserRound } from "lucide-react";

import { Button } from "@react/components/ui/button";
import type { AgentChatClient, AgentMessageContent, MemoryType } from "./types";

interface AgentConsoleProps {
  client: AgentChatClient;
  title: string;
  description?: string;
  confirmClear?: (type: MemoryType) => boolean;
}

const connectionLabels = {
  connected: "已连接",
  connecting: "连接中",
  disconnected: "未连接",
  error: "连接失败",
} as const;

function stringifyData(data: unknown): string {
  if (typeof data === "string") return data;
  if (data === null || data === undefined) return "";
  if (typeof data === "object") {
    const record = data as Record<string, unknown>;
    if (typeof record.text === "string") return record.text;
    if (typeof record.title === "string") {
      const text = typeof record.text === "string" ? record.text : "";
      return `${record.title}${text ? `\n${text}` : ""}`;
    }
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return "无法显示此消息内容";
    }
  }
  return String(data);
}

function ContentBlock({ content, onSuggestion }: { content: AgentMessageContent; onSuggestion: (prompt: string) => void }) {
  if (content.type === "suggestion" && Array.isArray(content.data)) {
    return (
      <div className="mt-3 flex flex-wrap gap-2">
        {content.data.map((item, index) => {
          const suggestion = item as { title?: string; prompt?: string };
          const prompt = suggestion.prompt ?? suggestion.title ?? "";
          return (
            <button
              key={`${prompt}-${index}`}
              type="button"
              className="rounded-full border border-blue-400/30 bg-blue-400/10 px-3 py-1.5 text-xs text-blue-100 transition hover:border-blue-300/60 hover:bg-blue-400/20"
              onClick={() => onSuggestion(prompt)}>
              {suggestion.title ?? prompt}
            </button>
          );
        })}
      </div>
    );
  }

  if (content.type === "image" && typeof content.data === "object" && content.data) {
    const url = (content.data as { url?: string; src?: string }).url ?? (content.data as { src?: string }).src;
    if (url) return <img src={url} alt="智能体生成结果" className="mt-3 max-h-72 rounded-xl object-contain" />;
  }

  const text = stringifyData(content.data);
  if (!text) return null;
  return <div className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-200">{text}</div>;
}

export function AgentConsole({ client, title, description, confirmClear }: AgentConsoleProps) {
  const snapshot = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  const [input, setInput] = useState("");
  const transcriptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    client.connect();
    void client.loadHistory();
    return () => client.disconnect();
  }, [client]);

  useEffect(() => {
    const transcript = transcriptRef.current;
    if (typeof transcript?.scrollTo === "function") {
      transcript.scrollTo({ top: transcript.scrollHeight, behavior: "smooth" });
    }
  }, [snapshot.messages]);

  function send(text: string) {
    if (client.send(text)) setInput("");
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    send(input);
  }

  function clear(type: MemoryType) {
    const confirmed = confirmClear?.(type) ?? window.confirm("确认清理这部分智能体记忆吗？");
    if (confirmed) void client.clearMemory(type);
  }

  return (
    <section className="flex min-h-[680px] flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 text-slate-100 shadow-2xl shadow-black/20">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <BrainCircuit className="size-5 text-blue-400" aria-hidden="true" />
            <h1 className="text-base font-semibold">{title}</h1>
            <span
              className={`rounded-full px-2 py-1 text-xs ${
                snapshot.connection === "connected" ? "bg-emerald-400/10 text-emerald-300" : "bg-amber-400/10 text-amber-200"
              }`}>
              {connectionLabels[snapshot.connection]}
            </span>
          </div>
          {description ? <p className="mt-1 text-xs text-slate-400">{description}</p> : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-slate-400">
            思考强度
            <select
              aria-label="思考强度"
              className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-200 outline-none focus:border-blue-500"
              defaultValue="0"
              onChange={(event) => client.updateThinkLevel(Number(event.target.value) as 0 | 1 | 2 | 3)}>
              <option value="0">关闭</option>
              <option value="1">轻量</option>
              <option value="2">深入</option>
              <option value="3">极限</option>
            </select>
          </label>
          <Button type="button" variant="ghost" className="h-9 px-3" onClick={() => client.reconnect()}>
            <RotateCcw className="mr-1 size-4" />
            重新连接
          </Button>
          <Button type="button" variant="ghost" className="h-9 px-3" onClick={() => client.stop()}>
            <CircleStop className="mr-1 size-4" />
            停止生成
          </Button>
        </div>
      </header>

      {snapshot.error ? (
        <div role="alert" className="border-b border-red-500/20 bg-red-500/10 px-5 py-3 text-sm text-red-200">
          {snapshot.error}
        </div>
      ) : null}

      <div ref={transcriptRef} className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-6" aria-label="智能体消息">
        {snapshot.loadingHistory ? <p className="text-center text-sm text-slate-500">正在加载历史消息…</p> : null}
        {!snapshot.loadingHistory && snapshot.messages.length === 0 ? (
          <div className="mx-auto flex max-w-sm flex-col items-center py-20 text-center">
            <PlugZap className="mb-4 size-8 text-slate-600" />
            <p className="text-sm text-slate-300">输入指令开始工作</p>
            <p className="mt-1 text-xs text-slate-500">消息会实时显示智能体的执行进度。</p>
          </div>
        ) : null}
        {snapshot.messages.map((message) => {
          const user = message.role === "user";
          return (
            <article key={message.id} className={`flex gap-3 ${user ? "justify-end" : "justify-start"}`}>
              {!user ? (
                <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-blue-500/15 text-blue-300">
                  <Bot className="size-4" aria-hidden="true" />
                </div>
              ) : null}
              <div className={`max-w-[78%] ${user ? "order-first" : ""}`}>
                <div className="mb-1 flex items-center gap-2 text-xs text-slate-500">
                  <span>{user ? "你" : (message.name ?? "智能体")}</span>
                  {message.status === "streaming" || message.status === "pending" ? <span className="text-blue-300">生成中</span> : null}
                  {message.status === "error" ? <span className="text-red-300">失败</span> : null}
                  {message.status === "stop" ? <span>已停止</span> : null}
                </div>
                <div
                  className={`space-y-2 rounded-2xl px-4 py-3 ${
                    user ? "rounded-tr-sm bg-blue-600 text-white" : "rounded-tl-sm border border-slate-800 bg-slate-900/80"
                  }`}>
                  {message.content.map((content, index) => (
                    <ContentBlock key={content.id ?? `${message.id}-${index}`} content={content} onSuggestion={send} />
                  ))}
                  {message.ext?.error ? <p className="text-sm text-red-300">{stringifyData(message.ext.error)}</p> : null}
                </div>
              </div>
              {user ? (
                <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-800 text-slate-300">
                  <UserRound className="size-4" aria-hidden="true" />
                </div>
              ) : null}
            </article>
          );
        })}
      </div>

      <footer className="border-t border-slate-800 bg-slate-950/95 px-5 py-4">
        <div className="mb-3 flex flex-wrap gap-2">
          {(["message", "summary", "all"] as const).map((type) => (
            <button
              key={type}
              type="button"
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-500 transition hover:bg-slate-900 hover:text-slate-200 disabled:opacity-50"
              disabled={snapshot.clearingMemory !== null}
              onClick={() => clear(type)}>
              <Trash2 className="size-3" />
              {type === "message" ? "清空消息" : type === "summary" ? "清空摘要" : "清空全部"}
            </button>
          ))}
        </div>
        <form onSubmit={handleSubmit} className="flex gap-3">
          <textarea
            aria-label="发送指令"
            rows={2}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                send(input);
              }
            }}
            placeholder="告诉智能体下一步做什么"
            className="min-h-14 flex-1 resize-none rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-blue-500"
          />
          <Button type="submit" className="h-auto min-h-14 px-5" disabled={!input.trim() || snapshot.connection !== "connected"}>
            <Send className="mr-2 size-4" />
            发送
          </Button>
        </form>
      </footer>
    </section>
  );
}

export type { AgentConsoleProps };
