import { useState } from "react";
import { BookOpenText, Clapperboard } from "lucide-react";

import { NovelPage, ScriptPage, type Script, type StoryApi } from "@react/features/story";

export type StoryModuleTab = "novel" | "script";

export interface StoryModuleProps {
  api: StoryApi;
  projectId: number;
  /** 模块默认展示原文；切换是模块内部状态，不改变路由。 */
  defaultTab?: StoryModuleTab;
  onOpenStoryboard?: (script: Script) => void;
}

/**
 * 「原文/剧本」阶段模块。
 *
 * 用内部二选一分段切换（原文 / 剧本）承载两个完整的嵌入式业务页面，默认原文：
 * - 每次只挂载一个内容面板，绝不同时纵向堆叠两个整页；
 * - 切换不离开画布、不改变路由（纯内部 state）；
 * - 模块标题栏由画布 ModulePanel 统一管理，这里不复制全局导航、不嵌套控制台；
 * - 内容面板独立滚动，分段切换始终固定在内容区顶部。
 */
export function StoryModule({ api, projectId, defaultTab = "novel", onOpenStoryboard }: StoryModuleProps) {
  const [tab, setTab] = useState<StoryModuleTab>(defaultTab);

  return (
    <section data-testid="story-module" aria-label="原文与剧本" className="flex h-full min-h-0 flex-col gap-4">
      <div
        role="group"
        aria-label="原文与剧本分段切换"
        className="flex shrink-0 items-center gap-1 rounded-xl border border-slate-700/70 bg-slate-950/60 p-1">
        <button
          type="button"
          data-testid="story-module-tab-novel"
          aria-pressed={tab === "novel"}
          onClick={() => setTab("novel")}
          className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium transition ${
            tab === "novel"
              ? "border-zinc-300/40 bg-zinc-300/10 text-zinc-200"
              : "border-transparent text-slate-300 hover:bg-white/5 hover:text-slate-100"
          }`}>
          <BookOpenText className="size-4" />
          原文
        </button>
        <button
          type="button"
          data-testid="story-module-tab-script"
          aria-pressed={tab === "script"}
          onClick={() => setTab("script")}
          className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium transition ${
            tab === "script"
              ? "border-zinc-300/40 bg-zinc-300/10 text-zinc-200"
              : "border-transparent text-slate-300 hover:bg-white/5 hover:text-slate-100"
          }`}>
          <Clapperboard className="size-4" />
          剧本
        </button>
      </div>
      {tab === "novel" ? (
        <div data-testid="story-module-pane-novel" className="min-h-0 flex-1 overflow-y-auto">
          <NovelPage api={api} projectId={projectId} embedded />
        </div>
      ) : null}
      {tab === "script" ? (
        <div data-testid="story-module-pane-script" className="min-h-0 flex-1 overflow-y-auto">
          <ScriptPage api={api} projectId={projectId} embedded onOpenStoryboard={onOpenStoryboard} />
        </div>
      ) : null}
    </section>
  );
}
