import { Maximize2, Minus, X } from "lucide-react";

import { detectRuntime, invokeDesktopAction, type AppRuntime } from "@react/platform/runtime";

interface DesktopTitleBarProps {
  runtime?: AppRuntime;
  invoke?: typeof invokeDesktopAction;
}

export function DesktopTitleBar({
  runtime = detectRuntime(),
  invoke = invokeDesktopAction,
}: DesktopTitleBarProps) {
  if (runtime !== "electron") return null;

  const run = (action: "windowMinimize" | "windowMaximize" | "windowClose") => {
    void invoke(action, { runtime });
  };

  return (
    <div
      aria-label="桌面窗口栏"
      className="fixed inset-x-0 top-0 z-[100] flex h-9 items-center border-b border-white/5 bg-[#090b10]/95 pl-4"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      <span className="text-xs font-semibold tracking-wide text-slate-500">Hodor</span>
      <div className="ml-auto flex h-full" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
        <button type="button" aria-label="最小化窗口" className="grid w-12 place-items-center text-slate-400 hover:bg-white/10 hover:text-white" onClick={() => run("windowMinimize")}>
          <Minus size={15} />
        </button>
        <button type="button" aria-label="最大化窗口" className="grid w-12 place-items-center text-slate-400 hover:bg-white/10 hover:text-white" onClick={() => run("windowMaximize")}>
          <Maximize2 size={13} />
        </button>
        <button type="button" aria-label="关闭窗口" className="grid w-12 place-items-center text-slate-400 hover:bg-red-600 hover:text-white" onClick={() => run("windowClose")}>
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
