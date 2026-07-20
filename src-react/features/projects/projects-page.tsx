import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertCircle, FolderOpen, Plus, RefreshCw } from "lucide-react";

import { Button } from "@react/components/ui/button";

export interface HodorProject {
  id: string;
  name: string;
  intro?: string | null;
  projectType: "novel" | "script" | string;
  artStyle?: string | null;
  imageModel?: string | null;
  videoModel?: string | null;
  createTime?: number | string | null;
}

interface ProjectsPageProps {
  loadProjects: () => Promise<HodorProject[]>;
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

function readError(error: unknown): string {
  return error instanceof Error ? error.message : "项目加载失败";
}

export function ProjectsPage({ loadProjects }: ProjectsPageProps) {
  const [projects, setProjects] = useState<HodorProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setProjects(await loadProjects());
    } catch (requestError) {
      setError(readError(requestError));
    } finally {
      setLoading(false);
    }
  }, [loadProjects]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <section className="mx-auto max-w-7xl px-6 py-8 lg:px-10 lg:py-10">
      <header className="flex items-start justify-between gap-6">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.24em] text-blue-400">Hodor Workspace</p>
          <h1 className="text-3xl font-semibold tracking-tight">项目</h1>
          <p className="mt-2 text-sm text-slate-400">从原文开始，组织资产、分镜和最终视频。</p>
        </div>
        <Button type="button" className="gap-2" disabled title="新建项目表单正在迁移">
          <Plus aria-hidden="true" size={17} />
          新建项目
        </Button>
      </header>

      {loading ? (
        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="正在加载项目">
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-48 animate-pulse rounded-xl border border-border bg-white/[0.025]" />
          ))}
        </div>
      ) : error ? (
        <div role="alert" className="mt-8 flex items-start gap-4 rounded-xl border border-red-900/60 bg-red-950/20 p-5 text-red-200">
          <AlertCircle aria-hidden="true" className="mt-0.5 shrink-0" size={20} />
          <div>
            <p className="font-medium">{error}</p>
            <Button type="button" variant="ghost" className="mt-4 gap-2 border border-red-900/60" onClick={() => void refresh()}>
              <RefreshCw aria-hidden="true" size={15} />
              重新加载
            </Button>
          </div>
        </div>
      ) : projects.length === 0 ? (
        <div className="mt-8 grid min-h-72 place-items-center rounded-xl border border-dashed border-border bg-white/[0.02] px-6 text-center">
          <div>
            <FolderOpen aria-hidden="true" className="mx-auto mb-4 text-slate-600" size={32} />
            <p className="text-lg font-medium">还没有项目</p>
            <p className="mt-2 text-sm text-slate-500">新建项目后，从原文、资产和分镜开始生产。</p>
          </div>
        </div>
      ) : (
        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => {
            const createdAt = formatCreatedAt(project.createTime);
            return (
              <Link
                key={project.id}
                to={project.projectType === "novel" ? "/projects/$projectId/novels" : "/projects/$projectId/scripts"}
                params={{ projectId: project.id }}
                onClick={() => localStorage.setItem("hodorSelectedProjectId", project.id)}
                aria-label={`打开项目 ${project.name}`}
                className="flex min-h-52 flex-col rounded-xl border border-border bg-[#10131b] p-5 transition-colors hover:border-blue-500/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-lg font-semibold tracking-tight">{project.name}</h2>
                  <span className="shrink-0 rounded-full border border-blue-900/70 bg-blue-950/40 px-2.5 py-1 text-xs text-blue-300">
                    {projectTypeLabel(project.projectType)}
                  </span>
                </div>
                {project.artStyle ? <p className="mt-4 w-fit rounded-md bg-white/5 px-2 py-1 text-xs text-slate-300">{project.artStyle}</p> : null}
                <p className="mt-4 line-clamp-2 text-sm leading-6 text-slate-400">{project.intro || "暂无项目简介"}</p>
                <div className="mt-auto flex items-center justify-between border-t border-border pt-4 text-xs text-slate-600">
                  <span>{createdAt ? `创建于 ${createdAt}` : "Hodor 项目"}</span>
                  <span>{project.imageModel && project.videoModel ? "模型已配置" : "待配置模型"}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
