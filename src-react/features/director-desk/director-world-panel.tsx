import { Globe2, LoaderCircle, RefreshCw, X } from "lucide-react";

import { Button } from "@react/components/ui/button";

import type { DirectorWorldJob } from "./director-desk-contract";

interface DirectorWorldPanelProps {
  prompt: string;
  model: string;
  job: DirectorWorldJob | null;
  busy: boolean;
  error: string;
  onPromptChange(value: string): void;
  onModelChange(value: string): void;
  onStart(): void;
  onRefresh(): void;
  onClose(): void;
}

function jobDescription(job: DirectorWorldJob) {
  if (job.status === "succeeded") return "Marble 场景已经生成并写入导演台";
  if (job.status === "failed") return job.error || "Marble 场景生成失败";
  const progress = job.progress == null ? "" : ` ${Math.round(job.progress)}%`;
  return `任务已提交${progress}${job.progressDescription ? ` · ${job.progressDescription}` : ""}`;
}

export function DirectorWorldPanel({
  prompt,
  model,
  job,
  busy,
  error,
  onPromptChange,
  onModelChange,
  onStart,
  onRefresh,
  onClose,
}: DirectorWorldPanelProps) {
  const running = job?.status === "submitting" || job?.status === "running";
  return (
    <aside aria-label="Marble 场景生成" className="absolute right-5 top-20 z-30 w-[min(28rem,calc(100%-2.5rem))] rounded-xl border border-white/15 bg-[#202126]/95 p-4 shadow-2xl backdrop-blur">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
            <Globe2 className="h-4 w-4 text-[#ffb649]" aria-hidden="true" />
            Marble 3D 场景
          </h2>
          <p className="mt-1 text-xs leading-5 text-white/50">生成任务保存在服务端，关闭页面后仍可继续恢复。</p>
        </div>
        <button type="button" aria-label="关闭 Marble 面板" className="rounded p-1 text-white/45 hover:bg-white/10 hover:text-white" onClick={onClose}>
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <label className="mt-4 block text-xs font-medium text-white/65">
        场景提示词
        <textarea
          aria-label="Marble 场景提示词"
          className="mt-2 min-h-28 w-full resize-y rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-sm leading-6 text-white outline-none focus:border-[#ffb649]/60"
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
        />
      </label>

      <label className="mt-3 block text-xs font-medium text-white/65">
        模型
        <select
          aria-label="Marble 模型"
          className="mt-2 h-10 w-full rounded-lg border border-white/10 bg-[#151619] px-3 text-sm text-white"
          value={model}
          onChange={(event) => onModelChange(event.target.value)}>
          <option value="marble-1.0-draft">Marble 1.0 Draft</option>
          <option value="marble-1.0">Marble 1.0</option>
          <option value="marble-1.1">Marble 1.1</option>
          <option value="marble-1.1-plus">Marble 1.1 Plus</option>
        </select>
      </label>

      {job ? (
        <div role="status" className={`mt-3 rounded-lg border px-3 py-2 text-xs ${job.status === "failed" ? "border-red-400/25 bg-red-500/10 text-red-200" : "border-emerald-400/20 bg-emerald-500/10 text-emerald-100"}`}>
          {jobDescription(job)}
        </div>
      ) : null}
      {error ? <div role="alert" className="mt-3 rounded-lg border border-red-400/25 bg-red-500/10 px-3 py-2 text-xs text-red-200">{error}</div> : null}

      <div className="mt-4 flex justify-end gap-2">
        {job && running ? (
          <Button type="button" variant="ghost" aria-label="刷新 Marble 任务" onClick={onRefresh} disabled={busy}>
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
            刷新任务
          </Button>
        ) : null}
        <Button type="button" aria-label="开始生成 3D 场景" onClick={onStart} disabled={busy || !prompt.trim()} className="bg-[#ffb649] text-[#171717] hover:bg-[#ffc66f]">
          {busy ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <Globe2 className="mr-2 h-4 w-4" aria-hidden="true" />}
          {job?.status === "failed" ? "重新生成" : "开始生成 3D 场景"}
        </Button>
      </div>
    </aside>
  );
}
