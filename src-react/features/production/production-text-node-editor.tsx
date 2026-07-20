import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { MdEditor, MdPreview } from "md-editor-rt";
import type { Themes, ToolbarNames } from "md-editor-rt";
import "md-editor-rt/lib/style.css";

export interface ProductionTextNodeEditorProps {
  label: string;
  value: string;
  placeholder: string;
  tall?: boolean;
  onSave: (value: string) => void;
}

const toolbars: ToolbarNames[] = [
  "bold",
  "underline",
  "italic",
  "strikeThrough",
  "-",
  "title",
  "sub",
  "sup",
  "quote",
  "unorderedList",
  "orderedList",
  "task",
  "-",
  "codeRow",
  "code",
  "table",
  "-",
  "revoke",
  "next",
  "=",
  "preview",
];

function currentTheme(): Themes {
  return document.documentElement.getAttribute("theme-mode") === "light" ? "light" : "dark";
}

function useEditorTheme(): Themes {
  const [theme, setTheme] = useState<Themes>(() => currentTheme());

  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(currentTheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["theme-mode"] });
    return () => observer.disconnect();
  }, []);

  return theme;
}

function containsMedia(transfer: DataTransfer | null): boolean {
  return Array.from(transfer?.items ?? []).some((item) => item.type.startsWith("image/") || item.type.startsWith("video/"));
}

export function ProductionTextNodeEditor({ label, value, placeholder, onSave }: ProductionTextNodeEditorProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const theme = useEditorTheme();
  const reactId = useId();
  const editorId = `production-text-${reactId.replace(/:/g, "")}`;

  useEffect(() => {
    if (!open) setDraft(value);
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDraft(value);
        setOpen(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, value]);

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
          <div className="fixed inset-0 z-[80] grid place-items-center bg-black/60" onPointerDown={(event) => event.stopPropagation()}>
            <section
              role="dialog"
              aria-modal="true"
              aria-label={`编辑${label}`}
              className="relative w-[90vw] rounded-lg border border-slate-700 bg-[#242626] p-5 text-slate-100 shadow-xl">
              <h2 className="mb-4 text-base font-semibold">编辑{label}</h2>
              <button
                type="button"
                aria-label="关闭"
                onClick={cancel}
                className="absolute right-4 top-3 grid size-8 place-items-center rounded text-xl text-slate-400 hover:bg-white/5 hover:text-slate-100">
                ×
              </button>
              <div
                role="group"
                aria-label={`${label}内容`}
                className="nodrag nowheel overflow-hidden"
                onPointerDown={(event) => event.stopPropagation()}
                onPasteCapture={(event) => {
                  if (containsMedia(event.clipboardData)) event.preventDefault();
                }}
                onDropCapture={(event) => event.preventDefault()}>
                <MdEditor
                  editorId={`${editorId}-editor`}
                  value={draft}
                  onChange={setDraft}
                  theme={theme}
                  language="zh-CN"
                  toolbars={toolbars}
                  footers={[]}
                  placeholder={placeholder}
                  style={{ height: "72vh" }}
                  onUploadImg={() => {}}
                />
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" onClick={cancel} className="rounded border border-slate-600 px-4 py-2 text-sm hover:bg-white/5">
                  取消
                </button>
                <button type="button" onClick={save} className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-500">
                  保存
                </button>
              </div>
            </section>
          </div>,
          document.body,
        )
      : null;

  return (
    <div>
      <header className="production-node-drag-handle relative flex cursor-grab select-none items-center justify-between gap-6 active:cursor-grabbing">
        <div className="w-fit rounded-bl-none rounded-br-lg rounded-tl-lg rounded-tr-none bg-black px-2.5 py-[5px] text-base text-white">{label}</div>
        <button type="button" aria-label={`编辑${label}`} onClick={beginEdit} className="nodrag px-2 py-1 text-sm text-blue-400 hover:text-blue-300">
          编辑
        </button>
      </header>
      <div
        aria-label={`${label}预览`}
        onPointerDown={(event) => event.stopPropagation()}
        className="nodrag nowheel mt-2 select-text overflow-visible [&_.md-editor]:!border-0 [&_.md-editor]:!bg-transparent [&_.md-editor-preview-wrapper]:!p-0">
        {value ? (
          <MdPreview editorId={`${editorId}-preview`} value={value} theme={theme} language="zh-CN" />
        ) : (
          <p className="text-sm text-slate-500">{placeholder}</p>
        )}
      </div>
      {dialog}
    </div>
  );
}
