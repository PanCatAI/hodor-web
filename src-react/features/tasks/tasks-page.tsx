import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";

import { Button } from "@react/components/ui/button";
import { createApiClient, resolveApiBaseUrl, type HodorApiClient } from "@react/lib/api/client";
import { clearSession, getSessionToken } from "@react/lib/auth/session";

const API_BASE_URL_KEY = "hodorApiBaseUrl";
const PAGE_SIZE = 10;

export interface TaskItem {
  id: number;
  taskClass: string;
  relatedObjects: string;
  model: string;
  projectName?: string;
  episode?: string;
  state: string;
  startTime: number;
  describe?: string;
  reason?: string;
}

interface TaskCategory {
  taskClass: string;
}

interface TaskProject {
  id: number;
  name: string;
}

interface TaskListResponse {
  data: TaskItem[];
  total: number | string;
}

interface TasksPageProps {
  client?: HodorApiClient;
}

function createDefaultClient(): HodorApiClient {
  const baseUrl = resolveApiBaseUrl({
    envBaseUrl: import.meta.env.VITE_HODOR_API_BASE_URL,
    storedBaseUrl: localStorage.getItem(API_BASE_URL_KEY),
    location: window.location,
  });
  return createApiClient({
    baseUrl,
    getToken: getSessionToken,
    onUnauthorized: clearSession,
  });
}

function formatTime(timestamp: number): string {
  if (!timestamp) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(timestamp));
}

function statusClassName(state: string): string {
  if (state === "生成失败") return "border-red-500/30 bg-red-500/10 text-red-300";
  if (state === "进行中") return "border-sky-500/30 bg-sky-500/10 text-sky-300";
  if (state === "已完成") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  return "border-border bg-white/5 text-slate-300";
}

export function TasksPage({ client: providedClient }: TasksPageProps) {
  const client = useMemo(() => providedClient ?? createDefaultClient(), [providedClient]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [categories, setCategories] = useState<TaskCategory[]>([]);
  const [projects, setProjects] = useState<TaskProject[]>([]);
  const [projectId, setProjectId] = useState("");
  const [taskClass, setTaskClass] = useState("");
  const [taskState, setTaskState] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const latestRequest = useRef(0);

  useEffect(() => {
    let active = true;
    Promise.all([
      client.request<TaskCategory[]>("/task/getTaskCategories", { method: "POST" }),
      client.request<TaskProject[]>("/task/getProject", { method: "POST" }),
    ]).then(
      ([nextCategories, nextProjects]) => {
        if (!active) return;
        setCategories(nextCategories);
        setProjects(nextProjects);
      },
      () => {
        // 筛选项加载失败不影响任务列表和手动刷新。
      },
    );
    return () => {
      active = false;
    };
  }, [client]);

  const loadTasks = useCallback(async () => {
    const requestId = ++latestRequest.current;
    setLoading(true);
    setError(null);
    try {
      const result = await client.request<TaskListResponse>("/task/getTaskApi", {
        method: "POST",
        body: JSON.stringify({
          page,
          limit: PAGE_SIZE,
          projectId: projectId ? Number(projectId) : null,
          taskClass,
          state: taskState,
        }),
      });
      if (requestId !== latestRequest.current) return;
      setTasks(Array.isArray(result.data) ? result.data : []);
      setTotal(Number(result.total) || 0);
    } catch (loadError) {
      if (requestId !== latestRequest.current) return;
      setTasks([]);
      setTotal(0);
      setError(loadError instanceof Error ? loadError.message : "获取任务列表失败");
    } finally {
      if (requestId === latestRequest.current) setLoading(false);
    }
  }, [client, page, projectId, refreshVersion, taskClass, taskState]);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  function updateFilter(setter: (value: string) => void, value: string) {
    setPage(1);
    setter(value);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main className="min-h-full bg-[#090b10] p-6 text-foreground lg:p-8">
      <header className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-primary">Production Activity</p>
          <h1 className="text-3xl font-semibold tracking-tight">任务中心</h1>
          <p className="mt-2 text-sm text-slate-400">查看生成任务的运行状态和失败原因。</p>
        </div>
        <Button aria-label="刷新任务" onClick={() => setRefreshVersion((version) => version + 1)} disabled={loading}>
          <RefreshCw className={loading ? "mr-2 size-4 animate-spin" : "mr-2 size-4"} />
          刷新
        </Button>
      </header>

      <section className="overflow-hidden rounded-xl border border-border bg-[#10131a] shadow-2xl shadow-black/20">
        <div className="grid gap-4 border-b border-border p-4 md:grid-cols-3">
          <label className="space-y-2 text-sm text-slate-400">
            <span>项目</span>
            <select
              aria-label="项目"
              className="h-10 w-full rounded-md border border-border bg-[#0b0e14] px-3 text-sm text-slate-200 outline-none focus:border-primary"
              value={projectId}
              onChange={(event) => updateFilter(setProjectId, event.target.value)}>
              <option value="">全部项目</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2 text-sm text-slate-400">
            <span>任务类型</span>
            <select
              aria-label="任务类型"
              className="h-10 w-full rounded-md border border-border bg-[#0b0e14] px-3 text-sm text-slate-200 outline-none focus:border-primary"
              value={taskClass}
              onChange={(event) => updateFilter(setTaskClass, event.target.value)}>
              <option value="">全部类型</option>
              {categories.map((category) => (
                <option key={category.taskClass} value={category.taskClass}>
                  {category.taskClass}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2 text-sm text-slate-400">
            <span>任务状态</span>
            <select
              aria-label="任务状态"
              className="h-10 w-full rounded-md border border-border bg-[#0b0e14] px-3 text-sm text-slate-200 outline-none focus:border-primary"
              value={taskState}
              onChange={(event) => updateFilter(setTaskState, event.target.value)}>
              <option value="">全部状态</option>
              <option value="进行中">进行中</option>
              <option value="已完成">已完成</option>
              <option value="生成失败">生成失败</option>
            </select>
          </label>
        </div>

        {error ? (
          <div className="grid min-h-64 place-items-center p-8 text-center">
            <div>
              <AlertCircle className="mx-auto mb-3 size-8 text-red-400" />
              <p role="alert" className="text-sm text-red-300">
                {error}
              </p>
              <Button className="mt-5" onClick={() => setRefreshVersion((version) => version + 1)}>
                重新加载
              </Button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-left text-sm">
              <thead className="bg-white/[0.025] text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">任务类型</th>
                  <th className="px-4 py-3 font-medium">项目</th>
                  <th className="px-4 py-3 font-medium">相关对象</th>
                  <th className="px-4 py-3 font-medium">模型</th>
                  <th className="px-4 py-3 font-medium">说明</th>
                  <th className="px-4 py-3 font-medium">状态</th>
                  <th className="px-4 py-3 font-medium">失败原因</th>
                  <th className="px-4 py-3 font-medium">开始时间</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {tasks.map((task) => (
                  <tr key={task.id} className="align-top hover:bg-white/[0.025]">
                    <td className="whitespace-nowrap px-4 py-4 font-medium text-slate-200">{task.taskClass || "—"}</td>
                    <td className="px-4 py-4 text-slate-400">{task.projectName || "—"}</td>
                    <td className="max-w-48 truncate px-4 py-4 text-slate-400" title={task.relatedObjects}>
                      {task.relatedObjects || "—"}
                    </td>
                    <td className="max-w-52 truncate px-4 py-4 font-mono text-xs text-slate-400" title={task.model}>
                      {task.model || "—"}
                    </td>
                    <td className="max-w-52 px-4 py-4 text-slate-400">{task.describe || "—"}</td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClassName(task.state)}`}>
                        {task.state || "未知"}
                      </span>
                    </td>
                    <td className="max-w-64 whitespace-normal px-4 py-4 text-red-300" title={task.reason}>
                      {task.state === "生成失败" ? task.reason || "后端未返回失败原因" : "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-slate-500">{formatTime(task.startTime)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {!loading && tasks.length === 0 ? (
              <div className="grid min-h-56 place-items-center p-8 text-center text-sm text-slate-500">当前筛选条件下没有任务</div>
            ) : null}
            {loading ? <div className="p-8 text-center text-sm text-slate-500">正在加载任务…</div> : null}
          </div>
        )}

        {!error ? (
          <footer className="flex items-center justify-between border-t border-border px-4 py-3 text-sm text-slate-500">
            <span>共 {total} 条</span>
            <div className="flex items-center gap-3">
              <Button variant="ghost" aria-label="上一页" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}>
                <ChevronLeft className="size-4" />
              </Button>
              <span>
                {page} / {totalPages}
              </span>
              <Button variant="ghost" aria-label="下一页" disabled={page >= totalPages || loading} onClick={() => setPage((value) => value + 1)}>
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </footer>
        ) : null}
      </section>
    </main>
  );
}
