import { Link, Outlet, useParams, useRouter } from "@tanstack/react-router";
import { LogOut, Settings } from "lucide-react";

import { clearSession, readSession } from "@react/lib/auth/session";
import { detectRuntime } from "@react/platform/runtime";
import { CurrentProjectProvider, useCurrentProject } from "./current-project";
import { DesktopTitleBar } from "./desktop-title-bar";
import { globalNavigation, projectNavigation } from "./navigation";

export function ProtectedLayout() {
  const router = useRouter();
  const account = readSession();
  const desktop = detectRuntime() === "electron";
  const { projectId } = useParams({ strict: false }) as { projectId?: string };
  const numericProjectId = Number(projectId);
  const { project, loading, error } = useCurrentProject(
    router.options.context.apiClient,
    Number.isInteger(numericProjectId) && numericProjectId > 0 ? numericProjectId : null,
  );
  const studioNavigation = projectNavigation.filter((item) => item.to === "/projects/$projectId/studio-os");
  const interactiveCanvasNavigation = projectNavigation.filter((item) => item.to === "/projects/$projectId/interactive");
  const secondaryProjectNavigation = projectNavigation.filter(
    (item) => item.to !== "/projects/$projectId/studio-os" && item.to !== "/projects/$projectId/interactive",
  );
  const visibleProjectNavigation = project?.projectType === "interactive"
    ? [...studioNavigation, ...interactiveCanvasNavigation, ...secondaryProjectNavigation]
    : [...studioNavigation, ...secondaryProjectNavigation];

  const logout = async () => {
    clearSession();
    await router.navigate({ to: "/login" });
    await router.invalidate();
  };

  return (
    <div className={`min-h-screen bg-[#080a0f] text-foreground lg:grid lg:grid-cols-[248px_minmax(0,1fr)] ${desktop ? "pt-9" : ""}`}>
      <DesktopTitleBar />
      <aside className="border-b border-border bg-[#0d1017] lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r">
        <div className="flex h-full flex-col px-4 py-4 lg:px-5 lg:py-6">
          <Link to="/projects" className="mb-5 flex items-center gap-3 px-2 lg:mb-10">
            <span className="grid size-10 place-items-center rounded-xl bg-primary font-black text-primary-foreground">H</span>
            <span>
              <strong className="block text-lg tracking-tight">Hodor</strong>
              <span className="text-xs text-slate-500">Agent 专业创作系统</span>
            </span>
          </Link>

          <nav aria-label="工作台导航" className="grid grid-cols-4 gap-1 lg:grid-cols-1 lg:gap-2">
            {globalNavigation.map(({ label, to, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                className="flex min-w-0 items-center justify-center gap-3 rounded-lg px-3 py-3 text-sm text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-100 lg:justify-start"
                activeProps={{ className: "bg-primary/10 text-blue-300" }}
              >
                <Icon aria-hidden="true" size={18} />
                <span className="truncate">{label}</span>
              </Link>
            ))}
            {projectId ? (
              <>
                <div className="col-span-full my-2 hidden border-t border-border lg:block" />
                {visibleProjectNavigation.map(({ label, to, icon: Icon }, index) => (
                  <div key={to} className="contents">
                    {project?.projectType === "interactive" && index === 1 ? (
                      <div className="col-span-full mt-2 hidden px-3 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-600 lg:block">
                        二级入口
                      </div>
                    ) : null}
                    <Link
                      to={to}
                      params={{ projectId }}
                      className="flex min-w-0 items-center justify-center gap-3 rounded-lg px-3 py-3 text-sm text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-100 lg:justify-start"
                      activeProps={{ className: "bg-primary/10 text-blue-300" }}
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
              activeProps={{ className: "bg-primary/10 text-blue-300" }}
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

      <main className="min-w-0 overflow-hidden">
        <CurrentProjectProvider value={{ project, loading, error }}>
          <Outlet />
        </CurrentProjectProvider>
      </main>
    </div>
  );
}
