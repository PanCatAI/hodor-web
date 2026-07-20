import { Fragment, FormEvent, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  CircleStop,
  FileText,
  LoaderCircle,
  RotateCcw,
  Send,
  Settings,
  Trash2,
  X,
  XCircle,
} from "lucide-react";

import type { AgentChatClient, AgentMessageContent, MemoryType } from "./types";

interface AgentConsoleProps {
  client: AgentChatClient;
  title: string;
  description?: string;
  confirmClear?: (type: MemoryType) => boolean;
  display?: "page" | "panel";
  showThink?: boolean;
}

const connectionLabels = {
  connected: "已连接",
  connecting: "连接中",
  disconnected: "未连接",
  error: "连接失败",
} as const;

const thinkLevelOptions = [
  { label: "关闭思考", value: 0 },
  { label: "轻度思考", value: 1 },
  { label: "深度思考", value: 2 },
  { label: "极致思考", value: 3 },
] as const;

const memoryLabels: Record<MemoryType, string> = {
  message: "消息记忆",
  summary: "摘要记忆",
  all: "所有记忆",
};

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

function inlineMarkdown(value: string) {
  return value
    .split(/(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|\*[^*]+\*|_[^_]+_|!?\[[^\]]+\]\([^)]+\))/g)
    .filter(Boolean)
    .map((token, index) => {
      if (/^`[^`]+`$/.test(token)) {
        return (
          <code key={index} className="rounded bg-black/30 px-1 py-0.5 font-mono text-[0.92em]">
            {token.slice(1, -1)}
          </code>
        );
      }
      if (/^(\*\*|__)[\s\S]+(\*\*|__)$/.test(token)) return <strong key={index}>{token.slice(2, -2)}</strong>;
      if (/^~~[\s\S]+~~$/.test(token)) return <del key={index}>{token.slice(2, -2)}</del>;
      if (/^(\*|_)[\s\S]+(\*|_)$/.test(token)) return <em key={index}>{token.slice(1, -1)}</em>;
      const image = /^!\[([^\]]*)\]\(([^)]+)\)$/.exec(token);
      if (image && /^(https?:\/\/|data:image\/|blob:|\/)/.test(image[2])) {
        return <img key={index} src={image[2]} alt={image[1]} className="my-2 max-h-72 max-w-full rounded object-contain" />;
      }
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      if (link) {
        const href = /^(https?:\/\/|mailto:|\/|#)/.test(link[2]) ? link[2] : "#";
        return (
          <a key={index} href={href} target="_blank" rel="noreferrer" className="text-blue-300 underline underline-offset-2">
            {link[1]}
          </a>
        );
      }
      return <Fragment key={index}>{token}</Fragment>;
    });
}

function MarkdownContent({ value }: { value: string }) {
  const blocks = useMemo(() => {
    const lines = value.replace(/\r\n/g, "\n").split("\n");
    const result: React.ReactNode[] = [];
    let index = 0;
    while (index < lines.length) {
      const line = lines[index];
      if (!line.trim()) {
        index += 1;
        continue;
      }
      if (line.trim().startsWith("```")) {
        const language = line.trim().slice(3);
        const code: string[] = [];
        index += 1;
        while (index < lines.length && !lines[index].trim().startsWith("```")) code.push(lines[index++]);
        if (index < lines.length) index += 1;
        result.push(
          <pre key={`code-${index}`} className="overflow-x-auto rounded-md bg-black/35 p-3 text-xs leading-5">
            {language ? <span className="mb-2 block text-[10px] uppercase text-slate-500">{language}</span> : null}
            <code>{code.join("\n")}</code>
          </pre>,
        );
        continue;
      }
      const heading = /^(#{1,6})\s+(.+)$/.exec(line);
      if (heading) {
        const size = heading[1].length <= 2 ? "text-lg" : heading[1].length === 3 ? "text-base" : "text-sm";
        result.push(
          <div key={`heading-${index}`} role="heading" aria-level={heading[1].length} className={`${size} font-semibold leading-7`}>
            {inlineMarkdown(heading[2])}
          </div>,
        );
        index += 1;
        continue;
      }
      const unordered = /^\s*[-*+]\s+(.+)$/.exec(line);
      const ordered = /^\s*\d+[.)]\s+(.+)$/.exec(line);
      if (unordered || ordered) {
        const orderedList = Boolean(ordered);
        const items: string[] = [];
        while (index < lines.length) {
          const match = orderedList ? /^\s*\d+[.)]\s+(.+)$/.exec(lines[index]) : /^\s*[-*+]\s+(.+)$/.exec(lines[index]);
          if (!match) break;
          items.push(match[1]);
          index += 1;
        }
        const List = orderedList ? "ol" : "ul";
        result.push(
          <List key={`list-${index}`} className={`${orderedList ? "list-decimal" : "list-disc"} space-y-1 pl-5`}>
            {items.map((item, itemIndex) => (
              <li key={itemIndex}>{inlineMarkdown(item)}</li>
            ))}
          </List>,
        );
        continue;
      }
      const paragraph: string[] = [line];
      index += 1;
      while (index < lines.length && lines[index].trim() && !/^(#{1,6})\s+|^\s*[-*+]\s+|^\s*\d+[.)]\s+|^```/.test(lines[index])) {
        paragraph.push(lines[index++]);
      }
      result.push(
        <p key={`paragraph-${index}`} className="whitespace-pre-wrap break-words leading-6">
          {inlineMarkdown(paragraph.join("\n"))}
        </p>,
      );
    }
    return result;
  }, [value]);

  return <div className="space-y-2 text-sm text-slate-200">{blocks}</div>;
}

function ContentBlock({
  content,
  role,
  onSuggestion,
}: {
  content: AgentMessageContent;
  role: "assistant" | "user" | "system";
  onSuggestion: (prompt: string) => void;
}) {
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
              className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-200 transition hover:bg-slate-800"
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
    if (url) return <img src={url} alt="智能体生成结果" className="mt-3 max-h-72 rounded-lg object-contain" />;
  }

  if (content.type === "thinking") {
    const data = typeof content.data === "object" && content.data ? (content.data as { title?: string; text?: string }) : {};
    const text = data.text ?? stringifyData(content.data);
    return (
      <details data-testid="thinking-segment" open={content.ext?.collapsed === false} className="group rounded-md bg-[#2c2c2c] text-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-[14px] leading-[22px] text-white/55 [&::-webkit-details-marker]:hidden">
          <span className="flex min-w-0 items-center gap-2">
            {content.status === "complete" ? (
              <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
            ) : content.status === "error" ? (
              <XCircle className="size-4 shrink-0 text-red-400" />
            ) : content.status === "stop" ? null : (
              <LoaderCircle className="size-4 shrink-0 animate-spin" />
            )}
            <span className="truncate">{content.status === "stop" ? "思考已终止" : data.title}</span>
          </span>
          <ChevronDown className="size-4 shrink-0 rotate-180 text-white/55 transition-transform group-open:rotate-0" />
        </summary>
        {text ? (
          <div className="space-y-2 px-3 pb-2 text-[14px] leading-[22px] text-white/55">
            {text
              .split("\n")
              .filter(Boolean)
              .map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
          </div>
        ) : null}
      </details>
    );
  }

  if (content.type === "reasoning" && Array.isArray(content.data)) {
    return (
      <div className="space-y-2">
        {(content.data as AgentMessageContent[]).map((item, index) => (
          <ContentBlock key={item.id ?? `${item.type}-${index}`} content={item} role={role} onSuggestion={onSuggestion} />
        ))}
      </div>
    );
  }

  if (content.type === "search" && typeof content.data === "object" && content.data) {
    const data = content.data as { title?: string; references?: { title: string; url?: string; site?: string }[] };
    return (
      <section className="rounded-md border border-slate-700/80 p-3 text-sm">
        {data.title ? <div className="mb-2 font-medium">{data.title}</div> : null}
        <div className="space-y-1">
          {data.references?.map((reference, index) =>
            reference.url ? (
              <a
                key={`${reference.url}-${index}`}
                href={reference.url}
                target="_blank"
                rel="noreferrer"
                className="block text-blue-300 hover:underline">
                {reference.title}
                {reference.site ? ` · ${reference.site}` : ""}
              </a>
            ) : (
              <div key={`${reference.title}-${index}`}>{reference.title}</div>
            ),
          )}
        </div>
      </section>
    );
  }

  if (content.type === "attachment" && Array.isArray(content.data)) {
    return (
      <div className="space-y-2">
        {(content.data as { name?: string; url?: string; fileType?: string; size?: number }[]).map((attachment, index) => {
          const body = (
            <span className="flex items-center gap-2">
              <FileText className="size-4" />
              {attachment.name || attachment.fileType || "附件"}
            </span>
          );
          return attachment.url ? (
            <a
              key={`${attachment.url}-${index}`}
              href={attachment.url}
              target="_blank"
              rel="noreferrer"
              className="block rounded-md border border-slate-700 p-2 hover:bg-slate-800">
              {body}
            </a>
          ) : (
            <div key={`${attachment.name}-${index}`} className="rounded-md border border-slate-700 p-2">
              {body}
            </div>
          );
        })}
      </div>
    );
  }

  if (content.type === "toolcall" && typeof content.data === "object" && content.data) {
    const data = content.data as { toolCallName?: string; result?: string; args?: string };
    return (
      <details className="rounded-md border border-slate-700/80 px-3 py-2 text-sm">
        <summary className="cursor-pointer text-slate-400">{data.toolCallName || "工具调用"}</summary>
        {data.result || data.args ? (
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap border-t border-slate-800 pt-2 text-xs">{data.result || data.args}</pre>
        ) : null}
      </details>
    );
  }

  const text = stringifyData(content.data);
  if (!text) return null;
  if (content.type === "markdown" && role !== "user") return <MarkdownContent value={text} />;
  return <div className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-200">{text}</div>;
}

export function AgentConsole({ client, title, description, confirmClear, display = "page", showThink = false }: AgentConsoleProps) {
  const snapshot = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  const [input, setInput] = useState("");
  const [openMenu, setOpenMenu] = useState<"settings" | "think" | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const busy = snapshot.activity === "pending" || snapshot.activity === "streaming";
  const connected = snapshot.connection === "connected";

  useEffect(() => {
    client.connect();
    void client.loadHistory();
    return () => client.disconnect();
  }, [client]);

  useEffect(() => {
    const transcript = transcriptRef.current;
    if (typeof transcript?.scrollTo === "function") transcript.scrollTo({ top: transcript.scrollHeight, behavior: "smooth" });
  }, [snapshot.messages]);

  useEffect(() => {
    if (!openMenu) return;
    function closeOnOutside(event: MouseEvent) {
      if (!footerRef.current?.contains(event.target as Node)) setOpenMenu(null);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenMenu(null);
    }
    document.addEventListener("mousedown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [openMenu]);

  function send(text: string) {
    if (!busy && connected && client.send(text)) setInput("");
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) client.stop();
    else send(input);
  }

  function reconnect() {
    setOpenMenu(null);
    if (window.confirm("重新连接会中断当前对话，是否确认？")) client.reconnect();
  }

  function clear(type: MemoryType) {
    setOpenMenu(null);
    const confirmed = confirmClear?.(type) ?? window.confirm(`确定要清除${memoryLabels[type]}吗？`);
    if (confirmed) void client.clearMemory(type);
  }

  function updateThinkLevel(level: 0 | 1 | 2 | 3) {
    setOpenMenu(null);
    client.updateThinkLevel(level);
  }

  return (
    <section
      className={`flex h-full min-h-0 flex-col overflow-hidden bg-[#242424] text-white/90 ${
        display === "panel" ? "" : "min-h-[680px] rounded-[10px] border border-[#393939] shadow-2xl shadow-black/20"
      }`}>
      <header className={`flex h-10 shrink-0 items-center border-b border-[#393939] pl-2.5 ${display === "panel" ? "pr-12" : "pr-2.5"}`}>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span
            role="status"
            aria-label={`连接状态：${connectionLabels[snapshot.connection]}`}
            title={connectionLabels[snapshot.connection]}
            className={`size-2 shrink-0 rounded-full ${connected ? "bg-emerald-500" : "bg-red-500"}`}
          />
          <h1 className="truncate text-lg font-medium leading-none">{title}</h1>
        </div>
      </header>

      {display === "page" && description ? <p className="border-b border-slate-800 px-4 py-2 text-xs text-slate-400">{description}</p> : null}

      {snapshot.error ? (
        <div role="alert" className="border-b border-red-500/20 bg-red-500/10 px-4 py-2 text-sm text-red-200">
          {snapshot.error}
        </div>
      ) : null}

      <div ref={transcriptRef} className="min-h-0 flex-1 overflow-y-auto px-2 pt-4" aria-label="智能体消息">
        {snapshot.loadingHistory ? <p className="text-center text-sm text-slate-500">正在加载历史消息…</p> : null}
        {snapshot.messages.map((message) => {
          const user = message.role === "user";
          if (message.role === "system") {
            return (
              <article
                key={message.id}
                className="mx-auto mb-4 max-w-[calc(100%-40px)] rounded-[3px] bg-[#2c2c2c] px-2 py-0.5 text-center text-xs text-white/35">
                {message.content.map((content, index) => (
                  <ContentBlock key={content.id ?? `${message.id}-${index}`} content={content} role={message.role} onSuggestion={send} />
                ))}
              </article>
            );
          }
          return (
            <article key={message.id} data-message-role={message.role} className={`mb-4 flex ${user ? "flex-row-reverse" : ""}`}>
              <div className={`flex w-full flex-col ${user ? "items-end" : "items-start"}`}>
                {message.name ? (
                  <div className={`px-4 pt-6 text-[14px] leading-[22px] text-white/35 ${user ? "text-right" : ""}`}>{message.name}</div>
                ) : null}
                <div
                  data-message-variant={user ? "base" : "outline"}
                  className={`w-fit max-w-[min(calc(100%-40px),800px)] space-y-2 rounded-xl px-4 py-3 text-[16px] leading-6 ${
                    user ? "bg-[#2c2c2c]" : message.status === "error" ? "border border-red-700/70" : "border border-[#5e5e5e]"
                  }`}>
                  {message.content.map((content, index) => (
                    <ContentBlock key={content.id ?? `${message.id}-${index}`} content={content} role={message.role} onSuggestion={send} />
                  ))}
                  {(message.status === "pending" || message.status === "streaming") && message.content.length === 0 ? (
                    <span role="status" aria-label="生成中" className="flex h-5 items-center gap-1">
                      <i className="size-1.5 animate-pulse rounded-full bg-slate-500" />
                      <i className="size-1.5 animate-pulse rounded-full bg-slate-500 [animation-delay:120ms]" />
                      <i className="size-1.5 animate-pulse rounded-full bg-slate-500 [animation-delay:240ms]" />
                    </span>
                  ) : null}
                  {message.ext?.error ? <p className="text-sm text-red-300">{stringifyData(message.ext.error)}</p> : null}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <footer ref={footerRef} className="shrink-0 px-2 pb-2">
        <form onSubmit={handleSubmit} className="rounded-lg border border-slate-700 bg-slate-900 focus-within:border-blue-500">
          <textarea
            aria-label="发送指令"
            rows={3}
            value={input}
            disabled={busy || !connected}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                send(input);
              }
            }}
            placeholder="输入消息..."
            className="block min-h-20 w-full resize-none bg-transparent px-3 pt-3 text-sm text-slate-100 outline-none placeholder:text-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
          />
          <div className="flex min-h-10 items-center justify-between gap-2 px-2 pb-2">
            <div className="flex items-center gap-1.5">
              <div className="relative">
                <button
                  type="button"
                  aria-label="智能体设置"
                  aria-expanded={openMenu === "settings"}
                  onClick={() => setOpenMenu((current) => (current === "settings" ? null : "settings"))}
                  className="grid size-8 place-items-center rounded-md border border-slate-700 text-slate-300 hover:bg-slate-800">
                  <Settings className="size-4" />
                </button>
                {openMenu === "settings" ? (
                  <div
                    role="menu"
                    aria-label="智能体设置菜单"
                    className="absolute bottom-10 left-0 z-[80] min-w-44 rounded-md border border-slate-700 bg-slate-900 py-1 shadow-xl">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={reconnect}
                      className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs hover:bg-slate-800">
                      <RotateCcw className="size-3.5" />
                      重新连接
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      disabled={snapshot.clearingMemory !== null}
                      onClick={() => clear("message")}
                      className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs hover:bg-slate-800 disabled:opacity-50">
                      <Trash2 className="size-3.5" />
                      清除消息记忆
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      disabled={snapshot.clearingMemory !== null}
                      onClick={() => clear("summary")}
                      className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs hover:bg-slate-800 disabled:opacity-50">
                      <X className="size-3.5" />
                      清除摘要记忆
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      disabled={snapshot.clearingMemory !== null}
                      onClick={() => clear("all")}
                      className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs text-red-300 hover:bg-slate-800 disabled:opacity-50">
                      <Trash2 className="size-3.5" />
                      清除所有记忆
                    </button>
                  </div>
                ) : null}
              </div>

              {showThink ? (
                <div className="relative">
                  <button
                    type="button"
                    aria-label="思考级别"
                    aria-expanded={openMenu === "think"}
                    onClick={() => setOpenMenu((current) => (current === "think" ? null : "think"))}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-700 px-2 text-xs text-slate-300 hover:bg-slate-800">
                    <BrainCircuit className="size-4" />
                    {thinkLevelOptions[snapshot.thinkLevel].label}
                  </button>
                  {openMenu === "think" ? (
                    <div
                      role="menu"
                      aria-label="思考级别菜单"
                      className="absolute bottom-10 left-0 z-[80] min-w-32 rounded-md border border-slate-700 bg-slate-900 py-1 shadow-xl">
                      {thinkLevelOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          role="menuitemradio"
                          aria-checked={snapshot.thinkLevel === option.value}
                          onClick={() => updateThinkLevel(option.value)}
                          className={`block w-full px-4 py-2 text-left text-xs hover:bg-slate-800 ${snapshot.thinkLevel === option.value ? "text-blue-300" : ""}`}>
                          {option.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <button
              type="submit"
              aria-label={busy ? "停止生成" : "发送"}
              disabled={busy ? !connected : !input.trim() || !connected}
              className="grid size-8 place-items-center rounded-md bg-blue-600 text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40">
              {busy ? <CircleStop className="size-4" /> : <Send className="size-4" />}
            </button>
          </div>
        </form>
      </footer>
    </section>
  );
}

export type { AgentConsoleProps };
