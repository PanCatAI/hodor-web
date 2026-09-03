import { Link, Outlet, useMatchRoute, useParams, useRouter } from "@tanstack/react-router";
import { LogOut, Settings } from "lucide-react";

import { clearSession, readSession } from "@react/lib/auth/session";
import { detectRuntime } from "@react/platform/runtime";
import { CurrentProjectProvider, useCurrentProject } from "./current-project";
import { DesktopTitleBar } from "./desktop-title-bar";
import { globalNavigation, projectNavigation } from "./navigation";

export function ProtectedLayout() {
  const router = useRouter();
  const matchRoute = useMatchRoute();
  const account = readSession();
  const desktop = detectRuntime() === "electron";
  const canvasFullscreen = Boolean(
    matchRoute({ to: "/projects", fuzzy: false }) || matchRoute({ to: "/projects/$projectId/canvas", fuzzy: false }),
  );
  const { projectId } = useParams({ strict: false }) as { projectId?: string };
  const numericProjectId = Number(projectId);
  const { project, loading, error } = useCurrentProject(
    router.options.context.apiClient,
    Number.isInteger(numericProjectId) && numericProjectId > 0 ? numericProjectId : null,
  );
  const visibleProjectNavigation = projectNavigation;

  const logout = async () => {
    clearSession();
    await router.navigate({ to: "/login" });
    await router.invalidate();
  };

  return (
    <div className={`min-h-screen bg-[#0a0a0a] text-foreground ${canvasFullscreen ? "block" : "lg:grid lg:grid-cols-[248px_minmax(0,1fr)]"} ${desktop ? "pt-9" : ""}`}>
      <DesktopTitleBar />
      {!canvasFullscreen ? (
        <aside className="border-b border-border bg-[#101010] lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r">
          <div className="flex h-full flex-col px-4 py-4 lg:px-5 lg:py-6">
            <Link to="/projects" className="mb-5 flex items-center gap-3 px-2 lg:mb-10">
              <span className="grid size-10 place-items-center rounded-xl bg-primary font-black text-primary-foreground">H</span>
              <span>
                <strong className="block text-lg tracking-tight">Hodor</strong>
                <span className="text-xs text-slate-500">自动内容生产线</span>
              </span>
            </Link>

            <nav aria-label="工作台导航" className="grid grid-cols-4 gap-1 lg:grid-cols-1 lg:gap-2">
              {globalNavigation.map(({ label, to, icon: Icon }) => (
                <Link
                  key={to}
                  to={to}
                  className="flex min-w-0 items-center justify-center gap-3 rounded-lg px-3 py-3 text-sm text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-100 lg:justify-start"
                  activeProps={{ className: "bg-primary/10 text-zinc-300" }}
                >
                  <Icon aria-hidden="true" size={18} />
                  <span className="truncate">{label}</span>
                </Link>
              ))}
              {projectId ? (
                <>
                  <div className="col-span-full my-2 hidden border-t border-border lg:block" />
                  {visibleProjectNavigation.map(({ label, to, icon: Icon }) => (
                    <div key={to} className="contents">
                      <Link
                        to={to}
                        params={{ projectId }}
                        className="flex min-w-0 items-center justify-center gap-3 rounded-lg px-3 py-3 text-sm text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-100 lg:justify-start"
                        activeProps={{ className: "bg-primary/10 text-zinc-300" }}
                      >
                        <Icon aria-hidden="true" size={18} />
                        <span className="truncate">{label}</span>
                      </Link>
                    </div>
                  ))}
                </>
              ) : null}
            </nav>

            <div className="mt-auto hidden border-t border-border pt-5 lg:block">
              <p className="truncate px-2 text-sm text-slate-300">{account?.name ?? "Pancat 操作员"}</p>
              <Link
                to="/settings"
                className="mt-3 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-white/5 hover:text-slate-200"
                activeProps={{ className: "bg-primary/10 text-zinc-300" }}
              >
                <Settings aria-hidden="true" size={16} />
                设置
              </Link>
              <button
                type="button"
                onClick={() => void logout()}
                className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-white/5 hover:text-slate-200"
              >
                <LogOut aria-hidden="true" size={16} />
                退出登录
              </button>
            </div>
          </div>
        </aside>
      ) : null}

      <main className={`min-w-0 overflow-hidden ${canvasFullscreen ? "min-h-screen" : ""}`}>
        <CurrentProjectProvider value={{ project, loading, error }}>
          <Outlet />
        </CurrentProjectProvider>
      </main>
    </div>
  );
}
