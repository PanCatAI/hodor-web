import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Expand, Pencil, X } from "lucide-react";

export interface ProductionTextNodeEditorProps {
  label: string;
  value: string;
  placeholder: string;
  tall?: boolean;
  onSave: (value: string) => void;
}

function ReadableText({ value, placeholder }: { value: string; placeholder: string }) {
  if (!value.trim()) {
    return <p className="text-sm leading-7 text-slate-600">{placeholder}</p>;
  }

  return (
    <div className="space-y-2 text-sm leading-7 text-slate-300">
      {value.split("\n").map((line, index) => {
        const heading = /^(#{1,3})\s+(.+)$/.exec(line);
        const bullet = /^[-*+]\s+(.+)$/.exec(line);
        const numbered = /^(\d+[.)])\s+(.+)$/.exec(line);

        if (!line.trim()) return <div key={index} className="h-2" aria-hidden="true" />;
        if (heading) {
          const size = heading[1].length === 1 ? "text-base" : "text-sm";
          return (
            <h4 key={index} className={`${size} font-semibold text-slate-100`}>
              {heading[2]}
            </h4>
          );
        }
        if (bullet) {
          return (
            <p key={index} className="flex gap-2">
              <span className="text-blue-400">•</span>
              <span>{bullet[1]}</span>
            </p>
          );
        }
        if (numbered) {
          return (
            <p key={index} className="flex gap-2">
              <span className="font-mono text-blue-400">{numbered[1]}</span>
              <span>{numbered[2]}</span>
            </p>
          );
        }
        if (line.startsWith("|")) {
          return (
            <code key={index} className="block whitespace-pre-wrap break-words font-mono text-xs leading-6 text-cyan-200/80">
              {line}
            </code>
          );
        }
        if (line.startsWith(">")) {
          return (
            <blockquote key={index} className="border-l-2 border-blue-500/50 pl-3 text-slate-400">
              {line.replace(/^>\s?/, "")}
            </blockquote>
          );
        }
        return (
          <p key={index} className="whitespace-pre-wrap break-words">
            {line}
          </p>
        );
      })}
    </div>
  );
}

export function ProductionTextNodeEditor({ label, value, placeholder, tall = false, onSave }: ProductionTextNodeEditorProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) setDraft(value);
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        onSave(draft);
        setOpen(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    requestAnimationFrame(() => textareaRef.current?.focus());
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [draft, onSave, open]);

  const beginEdit = () => {
    setDraft(value);
    setOpen(true);
  };

  const cancel = () => {
    setDraft(value);
    setOpen(false);
  };

  const save = () => {
    onSave(draft);
    setOpen(false);
  };

  const dialog =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed inset-0 z-[80] flex flex-col bg-[#07090e]/98 text-slate-100"
            role="dialog"
            aria-modal="true"
            aria-label={`编辑${label}`}
            onPointerDown={(event) => event.stopPropagation()}>
            <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-800 px-6">
              <div>
                <h2 className="text-base font-semibold">{label}</h2>
                <p className="mt-0.5 text-xs text-slate-500">在大画布中编辑，保存后同步回产线合同</p>
              </div>
              <button
                type="button"
                aria-label={`关闭${label}编辑器`}
                onClick={cancel}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white">
                <X className="size-5" />
              </button>
            </header>

            <main className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(0,1.15fr)_minmax(320px,.85fr)]">
              <section className="flex min-h-0 flex-col border-b border-slate-800 md:border-b-0 md:border-r" aria-label={`${label}编辑区`}>
                <div className="flex h-11 shrink-0 items-center justify-between border-b border-slate-800 px-5 text-xs text-slate-500">
                  <span>正文</span>
                  <span>{draft.length} 字</span>
                </div>
                <textarea
                  ref={textareaRef}
                  aria-label={`${label}内容`}
                  value={draft}
                  placeholder={placeholder}
                  onChange={(event) => setDraft(event.target.value)}
                  onPointerDown={(event) => event.stopPropagation()}
                  className="nodrag nowheel min-h-0 flex-1 resize-none bg-transparent p-6 font-mono text-sm leading-7 text-slate-200 outline-none placeholder:text-slate-700"
                />
              </section>
              <section className="min-h-0 overflow-auto bg-slate-950/50 p-6 nowheel" aria-label={`${label}预览`}>
                <div className="mx-auto max-w-3xl">
                  <p className="mb-5 text-[11px] font-medium uppercase tracking-[.18em] text-slate-600">阅读预览</p>
                  <ReadableText value={draft} placeholder={placeholder} />
                </div>
              </section>
            </main>

            <footer className="flex h-16 shrink-0 items-center justify-between border-t border-slate-800 px-6">
              <p className="text-xs text-slate-600">⌘/Ctrl + Enter 保存 · Esc 取消</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={cancel}
                  className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800">
                  取消
                </button>
                <button type="button" onClick={save} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500">
                  保存
                </button>
              </div>
            </footer>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="nodrag nowheel">
      <div className="mb-3 flex items-center justify-between text-[11px] text-slate-500">
        <span>{value.trim() ? `${value.length} 字` : "等待智能体写入"}</span>
        <button
          type="button"
          aria-label={`编辑${label}`}
          onClick={beginEdit}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-blue-300 hover:bg-blue-500/10 hover:text-blue-200">
          <Pencil className="size-3" />
          编辑
        </button>
      </div>
      <div
        aria-label={`${label}预览`}
        onDoubleClick={beginEdit}
        onPointerDown={(event) => event.stopPropagation()}
        className={`group relative w-full select-text overflow-auto rounded-xl border border-slate-800 bg-slate-900/65 p-4 text-left outline-none transition hover:border-blue-500/40 ${tall ? "h-72" : "h-64"}`}>
        <ReadableText value={value} placeholder={placeholder} />
        <span className="pointer-events-none absolute bottom-3 right-3 flex items-center gap-1 rounded-md bg-slate-950/85 px-2 py-1 text-[10px] text-slate-500 opacity-0 shadow-lg transition group-hover:opacity-100">
          <Expand className="size-3" />
          双击展开编辑
        </span>
      </div>
      {dialog}
    </div>
  );
}
