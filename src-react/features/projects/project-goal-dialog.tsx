import { useMemo, useState, type FormEvent } from "react";
import { Clapperboard, GitBranch, Play, Sparkles, X } from "lucide-react";

import { Button } from "@react/components/ui/button";
import type { ProjectsApi } from "./projects-api";
import { writeProjectGoalDraft } from "./project-goal-draft";

export interface ProjectGoalDialogProps {
  api: ProjectsApi;
  onClose: () => void;
  /** 打开完整的项目配置表单（保留模型 / 手册 / 世界设定配置）。 */
  onOpenDetailedConfig: () => void;
}

const TYPE_OPTIONS = [
  { value: "novel", label: "小说原文", hint: "从原文改编" },
  { value: "script", label: "剧本", hint: "直接使用剧本" },
  { value: "interactive", label: "互动剧", hint: "分支剧情画布" },
] as const;

const CONSTRAINT_SUGGESTIONS = ["60 秒内", "竖屏 9:16", "低成本制作"];

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "项目创建失败，请稍后重试。";
}

function deriveProjectName(goal: string): string {
  const firstLine =
    goal
      .split("\n")
      .map((line) => line.trim())
      .find(Boolean) ?? "";
  return firstLine.slice(0, 20) || "新制作";
}

/**
 * 目标优先的项目入口：占据视觉中心的大型目标对话框。
 *
 * 用户输入制作目标、项目类型与必要约束后「开始执行」：创建项目、
 * 把目标草稿写入会话，并进入统一画布；画布会用同一份目标预填生产图。
 */
export function ProjectGoalDialog({ api, onClose, onOpenDetailedConfig }: ProjectGoalDialogProps) {
  const [goal, setGoal] = useState("");
  const [projectType, setProjectType] = useState<string>("novel");
  const [constraints, setConstraints] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const canStart = useMemo(() => goal.trim().length > 0 && !saving, [goal, saving]);

  function appendConstraint(constraint: string) {
    setConstraints((current) => (current.trim() ? `${current.trim()}\n${constraint}` : constraint));
  }

  async function startExecution(event: FormEvent) {
    event.preventDefault();
    if (!canStart) return;
    setSaving(true);
    setError("");
    try {
      const trimmedGoal = goal.trim();
      const created = await api.createProject({
        projectType,
        name: deriveProjectName(trimmedGoal),
        intro: trimmedGoal,
        type: projectType === "interactive" ? "互动剧" : "短片",
        artStyle: "",
        directorManual: "",
        videoRatio: "16:9",
        imageModel: "",
        videoModel: "",
        imageQuality: "1K",
        mode: "singleImage",
        worldProfile: null,
      });
      writeProjectGoalDraft({ goal: trimmedGoal, constraints: constraints.trim(), projectType });
      localStorage.setItem("hodorSelectedProjectId", created.id);
      window.location.hash = `#/projects/${created.id}/canvas`;
      onClose();
    } catch (cause) {
      setError(errorText(cause));
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/80 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="开始一次新制作">
      <form
        onSubmit={(event) => void startExecution(event)}
        data-testid="project-goal-dialog"
        className="relative my-8 w-full max-w-3xl overflow-hidden rounded-3xl border border-zinc-200/20 bg-[#121212]/95 shadow-[0_40px_120px_rgba(0,0,0,.6)] backdrop-blur-xl">
        <header className="flex items-start justify-between gap-4 px-8 pt-8">
          <div>
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-300">
              <Sparkles className="size-3.5" />
              Project entry
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-50">开始一次新制作</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">
              把目标交给 Hodor，普通制作与互动剧从同一块画布开始。模型与手册可在「详细配置」中补充。
            </p>
          </div>
          <Button type="button" variant="ghost" aria-label="关闭目标对话框" onClick={onClose}>
            <X size={18} />
          </Button>
        </header>

        <div className="space-y-7 px-8 py-7">
          {error ? (
            <div role="alert" className="rounded-xl border border-zinc-900/60 bg-zinc-950/30 px-4 py-3 text-sm text-zinc-200">
              {error}
            </div>
          ) : null}

          <section aria-label="制作目标">
            <label htmlFor="project-goal" className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              制作目标
            </label>
            <textarea
              id="project-goal"
              aria-label="制作目标"
              required
              autoFocus
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              rows={4}
              placeholder="例如：做一支 60 秒雨夜悬疑短片，保留可编辑的分镜和素材关系"
              className="w-full resize-none rounded-2xl border border-slate-700 bg-[#0b0b0b] px-5 py-4 text-base leading-7 text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-zinc-300/70 focus:ring-4 focus:ring-zinc-300/10"
            />
          </section>

          <section aria-label="项目类型">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">项目类型</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" role="radiogroup" aria-label="项目类型">
              {TYPE_OPTIONS.map((option) => {
                const selected = projectType === option.value;
                const Icon = option.value === "interactive" ? GitBranch : Clapperboard;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={`项目类型 ${option.label}`}
                    onClick={() => setProjectType(option.value)}
                    className={`rounded-xl border px-4 py-3 text-left transition ${
                      selected
                        ? "border-zinc-300/70 bg-zinc-300/10 ring-2 ring-zinc-300/20"
                        : "border-slate-700/80 bg-slate-950/40 hover:border-slate-600"
                    }`}>
                    <Icon className={`size-4 ${selected ? "text-zinc-300" : "text-slate-500"}`} />
                    <p className={`mt-2 text-sm font-semibold ${selected ? "text-zinc-100" : "text-slate-200"}`}>{option.label}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">{option.hint}</p>
                  </button>
                );
              })}
            </div>
          </section>

          <section aria-label="必要约束">
            <div className="mb-2 flex items-center justify-between gap-3">
              <label htmlFor="project-constraints" className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                必要约束
              </label>
              <div className="flex flex-wrap gap-1.5">
                {CONSTRAINT_SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => appendConstraint(suggestion)}
                    className="rounded-full border border-slate-700 px-2.5 py-1 text-[11px] text-slate-400 transition hover:border-zinc-300/50 hover:text-zinc-200">
                    + {suggestion}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              id="project-constraints"
              aria-label="必要约束"
              value={constraints}
              onChange={(event) => setConstraints(event.target.value)}
              rows={3}
              placeholder={"时长、画幅、风格、预算等，一行一条。\n例如：\n不超过 60 秒\n竖屏 9:16\n不使用付费素材"}
              className="w-full resize-none rounded-2xl border border-slate-700 bg-[#0b0b0b] px-5 py-4 text-sm leading-6 text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-zinc-300/70 focus:ring-4 focus:ring-zinc-300/10"
            />
          </section>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 bg-black/20 px-8 py-5">
          <Button type="button" variant="ghost" className="text-slate-400" onClick={onOpenDetailedConfig}>
            详细配置（模型 / 手册 / 世界设定）
          </Button>
          <div className="flex gap-3">
            <Button type="button" variant="ghost" onClick={onClose}>
              取消
            </Button>
            <Button type="submit" disabled={!canStart} className="gap-2">
              {saving ? "正在创建…" : "开始执行"}
              <Play aria-hidden="true" size={16} />
            </Button>
          </div>
        </footer>
      </form>
    </div>
  );
}
