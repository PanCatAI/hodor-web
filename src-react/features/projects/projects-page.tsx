import { useCallback, useEffect, useState, type MouseEvent } from "react";
import { AlertCircle, BookOpen, FolderOpen, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";

import { Button } from "@react/components/ui/button";
import { ManualManager } from "./manual-manager";
import { ProjectDialog } from "./project-dialog";
import type { HodorProject, ProjectsApi } from "./projects-api";

export type { HodorProject } from "./projects-api";

export interface ProjectsPageProps {
  api?: ProjectsApi;
  /** Temporary compatibility for the first React router commit. New callers should pass api. */
  loadProjects?: () => Promise<HodorProject[]>;
}

function projectTypeLabel(type: string): string {
  if (type === "novel") return "小说原文";
  if (type === "script") return "剧本";
  return type || "未分类";
}

function formatCreatedAt(value: HodorProject["createTime"]): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function readError(error: unknown, fallback = "项目加载失败"): string {
  return error instanceof Error ? error.message : fallback;
}

function projectHref(project: HodorProject): string {
  return `#/projects/${project.id}/${project.projectType === "novel" ? "novels" : "scripts"}`;
}

export function ProjectsPage({ api, loadProjects }: ProjectsPageProps) {
  const [projects, setProjects] = useState<HodorProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modelError, setModelError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<HodorProject | null>(null);
  const [manualsOpen, setManualsOpen] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const request = api?.listProjects ?? loadProjects;
      if (!request) throw new Error("项目接口未配置");
      setProjects(await request());
    } catch (requestError) {
      setError(readError(requestError));
    } finally {
      setLoading(false);
    }
  }, [api, loadProjects]);

  useEffect(() => { void refresh(); }, [refresh]);

  function openEditor(project: HodorProject | null) {
    setModelError(null);
    setEditingProject(project);
    setEditorOpen(true);
  }

  async function openProject(event: MouseEvent<HTMLAnchorElement>, project: HodorProject) {
    localStorage.setItem("hodorSelectedProjectId", project.id);
    if (!api) return;
    event.preventDefault();
    if (!project.imageModel || !project.videoModel) {
      setModelError("模型不可用：请先为项目选择图片模型和视频模型");
      setEditingProject(project);
      setEditorOpen(true);
      return;
    }
    try {
      const [imageDetail, videoDetail] = await Promise.all([
        api.getModelDetail(project.imageModel),
        api.getModelDetail(project.videoModel),
      ]);
      if (!imageDetail || !videoDetail) throw new Error("模型配置已经失效");
      window.location.hash = projectHref(project).slice(1);
    } catch (requestError) {
      setModelError(`模型不可用：${readError(requestError, "供应商或模型已停用")}。请更新项目配置。`);
      setEditingProject(project);
      setEditorOpen(true);
    }
  }

  async function deleteProject(project: HodorProject) {
    if (!api || !window.confirm(`确认删除项目“${project.name}”及其全部数据？`)) return;
    setError(null);
    try {
      await api.deleteProject(project.id);
      if (localStorage.getItem("hodorSelectedProjectId") === project.id) localStorage.removeItem("hodorSelectedProjectId");
      await refresh();
    } catch (requestError) {
      setError(readError(requestError, "项目删除失败"));
    }
  }

  return (
    <section className="mx-auto max-w-7xl px-6 py-8 lg:px-10 lg:py-10">
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.24em] text-blue-400">Hodor Workspace</p>
          <h1 className="text-3xl font-semibold tracking-tight">项目</h1>
          <p className="mt-2 text-sm text-slate-400">从原文开始，组织资产、分镜和最终视频。</p>
        </div>
        <div className="flex gap-3">
          <Button type="button" variant="ghost" className="gap-2 border border-border" disabled={!api} onClick={() => setManualsOpen(true)}><BookOpen aria-hidden="true" size={17} />管理手册</Button>
          <Button type="button" className="gap-2" disabled={!api} onClick={() => openEditor(null)}><Plus aria-hidden="true" size={17} />新建项目</Button>
        </div>
      </header>

      {modelError ? <div role="alert" className="mt-6 flex items-start gap-3 rounded-xl border border-amber-800/70 bg-amber-950/30 p-4 text-sm text-amber-100"><AlertCircle aria-hidden="true" size={19} /><div><p className="font-medium">{modelError}</p><button type="button" className="mt-2 text-xs underline" onClick={() => setModelError(null)}>关闭提示</button></div></div> : null}

      {loading ? (
        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="正在加载项目">
          {[0, 1, 2].map((item) => <div key={item} className="h-52 animate-pulse rounded-xl border border-border bg-white/[0.025]" />)}
        </div>
      ) : error ? (
        <div role="alert" className="mt-8 flex items-start gap-4 rounded-xl border border-red-900/60 bg-red-950/20 p-5 text-red-200">
          <AlertCircle aria-hidden="true" className="mt-0.5 shrink-0" size={20} />
          <div><p className="font-medium">{error}</p><Button type="button" variant="ghost" className="mt-4 gap-2 border border-red-900/60" onClick={() => void refresh()}><RefreshCw aria-hidden="true" size={15} />重新加载</Button></div>
        </div>
      ) : projects.length === 0 ? (
        <div className="mt-8 grid min-h-72 place-items-center rounded-xl border border-dashed border-border bg-white/[0.02] px-6 text-center">
          <div><FolderOpen aria-hidden="true" className="mx-auto mb-4 text-slate-600" size={32} /><p className="text-lg font-medium">还没有项目</p><p className="mt-2 text-sm text-slate-500">新建项目后，从原文、资产和分镜开始生产。</p></div>
        </div>
      ) : (
        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => {
            const createdAt = formatCreatedAt(project.createTime);
            return (
              <article key={project.id} className="flex min-h-56 flex-col rounded-xl border border-border bg-[#10131b] transition-colors hover:border-blue-500/50">
                <a href={projectHref(project)} onClick={(event) => void openProject(event, project)} aria-label={`打开项目 ${project.name}`} className="flex flex-1 flex-col p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                  <div className="flex items-start justify-between gap-3"><h2 className="text-lg font-semibold tracking-tight">{project.name}</h2><span className="shrink-0 rounded-full border border-blue-900/70 bg-blue-950/40 px-2.5 py-1 text-xs text-blue-300">{projectTypeLabel(project.projectType)}</span></div>
                  {project.artStyle ? <p className="mt-4 w-fit rounded-md bg-white/5 px-2 py-1 text-xs text-slate-300">{project.artStyle}</p> : null}
                  <p className="mt-4 line-clamp-2 text-sm leading-6 text-slate-400">{project.intro || "暂无项目简介"}</p>
                </a>
                <footer className="flex items-center justify-between border-t border-border px-5 py-3 text-xs text-slate-600">
                  <span>{createdAt ? `创建于 ${createdAt}` : project.imageModel && project.videoModel ? "模型已配置" : "待配置模型"}</span>
                  {api ? <div className="flex gap-1"><Button type="button" variant="ghost" aria-label={`编辑项目 ${project.name}`} onClick={() => openEditor(project)}><Pencil size={15} /></Button><Button type="button" variant="ghost" aria-label={`删除项目 ${project.name}`} onClick={() => void deleteProject(project)}><Trash2 size={15} /></Button></div> : null}
                </footer>
              </article>
            );
          })}
        </div>
      )}

      {api && editorOpen ? <ProjectDialog api={api} project={editingProject} onClose={() => setEditorOpen(false)} onSaved={refresh} onManageManuals={() => { setEditorOpen(false); setManualsOpen(true); }} /> : null}
      {api && manualsOpen ? <ManualManager api={api} onClose={() => setManualsOpen(false)} /> : null}
    </section>
  );
}
