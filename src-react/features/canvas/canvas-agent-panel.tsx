import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { PanelRightClose, PanelRightOpen } from "lucide-react";

export interface CanvasAgentPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  label: string;
  name: string;
  children: ReactNode;
  /** 侧栏基准宽度（px）；桌面端落在 360–420 之间。 */
  minimumWidth?: number;
  width?: number;
  onWidthChange?: (width: number) => void;
  showCollapsedTrigger?: boolean;
  /** 覆盖层堆叠层级；画布内传 40 使其位于阶段模块(50)之下、检查器(30)之上。 */
  zIndex?: number;
  /** 供上层 Escape 按层级关闭覆盖层时识别抽屉身份。 */
  overlayKind?: string;
}

/**
 * 右侧覆盖抽屉（智能体 / 生产侧栏）。
 *
 * 桌面端宽度固定落在 360–420px 区间且不超过视口 42vw，通过绝对定位浮在画布之上，
 * 不参与画布布局流，因此不会挤压主舞台；移动端由调用方通过 max-md 覆盖为全宽抽屉。
 */
export function CanvasAgentPanel({
  open,
  onOpenChange,
  label,
  name,
  children,
  minimumWidth = 380,
  width: controlledWidth,
  onWidthChange,
  showCollapsedTrigger = true,
  zIndex = 50,
  overlayKind,
}: CanvasAgentPanelProps) {
  const [internalWidth, setInternalWidth] = useState(minimumWidth);
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  const width = controlledWidth ?? internalWidth;
  const controlled = controlledWidth !== undefined;
  const resize = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    function handleResize() {
      setViewportWidth(window.innerWidth);
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // 桌面契约：360–420px，且不超过 42vw；窄视口下 42vw 优先，宽度下限随之收紧。
  const viewportMax = Math.floor(viewportWidth * 0.42);
  const effectiveMax = Math.min(420, Math.max(320, viewportMax));
  const effectiveMin = Math.min(minimumWidth, effectiveMax);
  const displayWidth = Math.min(Math.max(width, effectiveMin), effectiveMax);

  useEffect(() => {
    const handleMove = (event: PointerEvent) => {
      const current = resize.current;
      if (!current) return;
      const nextWidth = Math.min(effectiveMax, Math.max(effectiveMin, current.startWidth + current.startX - event.clientX));
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
  }, [controlled, effectiveMax, effectiveMin, onWidthChange]);

  function beginResize(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    resize.current = { startX: event.clientX, startWidth: displayWidth };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  function resizeByKeyboard(delta: number) {
    const nextWidth = Math.min(effectiveMax, Math.max(effectiveMin, width + delta));
    if (!controlled) setInternalWidth(nextWidth);
    onWidthChange?.(nextWidth);
  }

  return (
    <>
      <aside
        aria-label={label}
        aria-hidden={!open}
        data-canvas-overlay={overlayKind}
        className={`absolute bottom-[10px] right-[5px] top-[10px] flex flex-col overflow-hidden rounded-[10px] border border-slate-700 bg-slate-950 shadow-[-4px_2px_10px_rgba(0,0,0,.45)] transition-transform duration-300 ease-out max-md:!inset-x-0 max-md:!w-auto max-md:!min-w-0 max-md:!rounded-none max-md:border-x-0 max-md:border-b-0 ${
          open ? "translate-x-0" : "pointer-events-none translate-x-[calc(100%+5px)]"
        }`}
        style={{ width: displayWidth, minWidth: effectiveMin, maxWidth: effectiveMax, zIndex }}>
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
          className="absolute inset-y-0 left-0 z-[70] w-1 cursor-col-resize hover:bg-slate-700 focus:bg-slate-700 focus:outline-none max-md:hidden"
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
      {!open && showCollapsedTrigger ? (
        <button
          type="button"
          aria-label={`打开${name}`}
          onClick={() => onOpenChange(true)}
          className="absolute right-0 top-[10px] grid size-10 place-items-center rounded-[10px] border border-slate-700 bg-slate-950 text-slate-300 shadow-lg hover:bg-slate-900"
          style={{ zIndex: zIndex - 10 }}>
          <PanelRightOpen className="size-5" />
        </button>
      ) : null}
    </>
  );
}
