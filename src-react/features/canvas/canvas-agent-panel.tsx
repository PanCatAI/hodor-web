import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { PanelRightClose, PanelRightOpen } from "lucide-react";

export interface CanvasAgentPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  label: string;
  name: string;
  children: ReactNode;
  minimumWidth?: number;
  width?: number;
  onWidthChange?: (width: number) => void;
}

export function CanvasAgentPanel({
  open,
  onOpenChange,
  label,
  name,
  children,
  minimumWidth = 400,
  width: controlledWidth,
  onWidthChange,
}: CanvasAgentPanelProps) {
  const [internalWidth, setInternalWidth] = useState(minimumWidth);
  const width = controlledWidth ?? internalWidth;
  const controlled = controlledWidth !== undefined;
  const resize = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    const handleMove = (event: PointerEvent) => {
      const current = resize.current;
      if (!current) return;
      const maximum = Math.max(minimumWidth, Math.floor(window.innerWidth * 0.8));
      const nextWidth = Math.min(maximum, Math.max(minimumWidth, current.startWidth + current.startX - event.clientX));
      if (!controlled) setInternalWidth(nextWidth);
      onWidthChange?.(nextWidth);
    };
    const handleUp = () => {
      resize.current = null;
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
    };
  }, [controlled, minimumWidth, onWidthChange]);

  function beginResize(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    resize.current = { startX: event.clientX, startWidth: width };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  function resizeByKeyboard(delta: number) {
    const maximum = Math.max(minimumWidth, Math.floor(window.innerWidth * 0.8));
    const nextWidth = Math.min(maximum, Math.max(minimumWidth, width + delta));
    if (!controlled) setInternalWidth(nextWidth);
    onWidthChange?.(nextWidth);
  }

  return (
    <>
      <aside
        aria-label={label}
        aria-hidden={!open}
        className={`absolute bottom-[10px] right-[5px] top-[10px] z-50 flex flex-col overflow-hidden rounded-[10px] border border-slate-700 bg-slate-950 shadow-[-4px_2px_10px_rgba(0,0,0,.45)] transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "pointer-events-none translate-x-[calc(100%+5px)]"
        }`}
        style={{ width, minWidth: minimumWidth }}>
        <div
          role="separator"
          aria-label={`调整${name}侧栏宽度`}
          aria-orientation="vertical"
          tabIndex={0}
          onPointerDown={beginResize}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") resizeByKeyboard(24);
            if (event.key === "ArrowRight") resizeByKeyboard(-24);
          }}
          className="absolute inset-y-0 left-0 z-[70] w-1 cursor-col-resize hover:bg-slate-700 focus:bg-slate-700 focus:outline-none"
        />
        <button
          type="button"
          aria-label={`收起${name}`}
          onClick={() => onOpenChange(false)}
          className="absolute right-2 top-2 z-[70] grid size-8 place-items-center rounded-md bg-slate-900/90 text-slate-400 hover:text-slate-100">
          <PanelRightClose className="size-4" />
        </button>
        <div className="h-full min-h-0">{children}</div>
      </aside>
      {!open ? (
        <button
          type="button"
          aria-label={`打开${name}`}
          onClick={() => onOpenChange(true)}
          className="absolute right-0 top-[10px] z-40 grid size-10 place-items-center rounded-[10px] border border-slate-700 bg-slate-950 text-slate-300 shadow-lg hover:bg-slate-900">
          <PanelRightOpen className="size-5" />
        </button>
      ) : null}
    </>
  );
}
