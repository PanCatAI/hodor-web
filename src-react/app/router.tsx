import { createHashHistory, createRootRouteWithContext, createRoute, createRouter, redirect, useParams, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { ProductionAgentPage, ProductionAgentPanel, ScriptAgentPage } from "@react/features/agents";
import { AssetsCenter, createAssetApi } from "@react/features/assets";
import { LoginPage } from "@react/features/auth/login-page";
import { CastingPage, createCastingApi } from "@react/features/casting";
import { createHodorDirectorDeskAdapter, DirectorDeskPage, type DirectorDeskEditorModule } from "@react/features/director-desk";
import { createProductionApi, ImageFlowEditor, ProductionWorkbench, type ProductionProject, type StoryboardItem } from "@react/features/production";
import { createProjectsApi, ProjectsPage } from "@react/features/projects";
import { createSettingsApi, SettingsPage } from "@react/features/settings";
import { createAuthenticatedBlobRequest, createStoryApi, NovelPage, ScriptPage, type Script } from "@react/features/story";
import { createStoryboardApi, StoryboardPage, type Storyboard } from "@react/features/storyboards";
import { TasksPage } from "@react/features/tasks";
import { createApiClient, resolveApiBaseUrl, type HodorApiClient } from "@react/lib/api/client";
import { clearSession, getSessionToken } from "@react/lib/auth/session";
import { PlaceholderPage } from "./placeholder-page";
import { ProtectedLayout } from "./protected-layout";
import { RootLayout } from "./root-layout";

export interface RouterContext {
  apiClient: HodorApiClient;
  apiBaseUrl: string;
  getToken: () => string | null;
}

function resolveBrowserApiBaseUrl(): string {
  return resolveApiBaseUrl({
    envBaseUrl: import.meta.env.VITE_HODOR_API_BASE_URL,
    storedBaseUrl: localStorage.getItem("hodorApiBaseUrl"),
    location: window.location,
  });
}

export function createRouterContext(apiBaseUrl: string): RouterContext {
  return {
    apiClient: createApiClient({
      baseUrl: apiBaseUrl,
      getToken: getSessionToken,
      onUnauthorized: () => {
        clearSession();
        window.location.hash = "#/login";
      },
    }),
    apiBaseUrl,
    getToken: getSessionToken,
  };
}

function createDefaultContext(): RouterContext {
  return createRouterContext(resolveBrowserApiBaseUrl());
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  notFoundComponent: () => <PlaceholderPage title="页面不存在" description="这个工作台地址不存在，请从左侧导航重新进入。" />,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: ({ context }) => {
    throw redirect({ to: context.getToken() ? "/projects" : "/login" });
  },
});

function LoginRoutePage() {
  const router = useRouter();
  const { apiClient } = loginRoute.useRouteContext();

  return (
    <LoginPage
      login={apiClient.login}
      onAuthenticated={() => {
        void router.navigate({ to: "/projects" }).then(() => router.invalidate());
      }}
    />
  );
}

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  beforeLoad: ({ context }) => {
    if (context.getToken()) throw redirect({ to: "/projects" });
  },
  component: LoginRoutePage,
});

const protectedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "_workspace",
  beforeLoad: ({ context }) => {
    if (!context.getToken()) throw redirect({ to: "/login" });
  },
  component: ProtectedLayout,
});

function ProjectsRoutePage() {
  const { apiClient } = projectsRoute.useRouteContext();
  const api = useMemo(() => createProjectsApi(apiClient), [apiClient]);
  return <ProjectsPage api={api} />;
}

function readProjectId(): number | null {
  const { projectId } = useParams({ strict: false }) as { projectId?: string };
  const value = Number(projectId);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function WorkspaceBoundary({ children }: { children: React.ReactNode }) {
  return <section className="mx-auto max-w-[1500px] px-6 py-8 lg:px-10 lg:py-10">{children}</section>;
}

function MissingContext({ children }: { children: React.ReactNode }) {
  return (
    <WorkspaceBoundary>
      <div className="rounded-xl border border-dashed border-border bg-white/[0.02] px-6 py-20 text-center text-sm text-slate-400">{children}</div>
    </WorkspaceBoundary>
  );
}

function NovelRoutePage() {
  const projectId = readProjectId();
  const { apiClient, apiBaseUrl } = projectNovelRoute.useRouteContext();
  const api = useMemo(() => createStoryApi(apiClient, { requestBlob: createAuthenticatedBlobRequest(apiBaseUrl) }), [apiBaseUrl, apiClient]);
  if (projectId == null) return <MissingContext>项目编号无效，请返回项目列表重新选择。</MissingContext>;
  return (
    <WorkspaceBoundary>
      <NovelPage api={api} projectId={projectId} />
    </WorkspaceBoundary>
  );
}

function ScriptRoutePage() {
  const projectId = readProjectId();
  const router = useRouter();
  const { apiClient, apiBaseUrl } = projectScriptRoute.useRouteContext();
  const api = useMemo(() => createStoryApi(apiClient, { requestBlob: createAuthenticatedBlobRequest(apiBaseUrl) }), [apiBaseUrl, apiClient]);
  if (projectId == null) return <MissingContext>项目编号无效，请返回项目列表重新选择。</MissingContext>;

  function openStoryboard(script: Script) {
    void router.navigate({
      to: "/projects/$projectId/storyboards",
      params: { projectId: String(projectId) },
      search: { scriptId: script.id },
    });
  }

  return (
    <WorkspaceBoundary>
      <ScriptPage api={api} projectId={projectId} onOpenStoryboard={openStoryboard} />
    </WorkspaceBoundary>
  );
}

function AssetsRoutePage() {
  const projectId = readProjectId();
  const { apiClient } = projectAssetsRoute.useRouteContext();
  const api = useMemo(() => createAssetApi(apiClient), [apiClient]);
  if (projectId == null) return <MissingContext>项目编号无效，请返回项目列表重新选择。</MissingContext>;
  return <AssetsCenter projectId={projectId} api={api} />;
}

function StoryboardsRoutePage() {
  const projectId = readProjectId();
  const { scriptId } = projectStoryboardsRoute.useSearch();
  const router = useRouter();
  const { apiClient, apiBaseUrl } = projectStoryboardsRoute.useRouteContext();
  const api = useMemo(() => createStoryboardApi(apiClient, { requestBlob: createAuthenticatedBlobRequest(apiBaseUrl) }), [apiBaseUrl, apiClient]);
  const productionApi = useMemo(() => createProductionApi(apiClient), [apiClient]);
  const [editingStoryboard, setEditingStoryboard] = useState<Storyboard | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [imageModel, setImageModel] = useState("pancat:pancat-image");

  useEffect(() => {
    if (projectId == null) return;
    let cancelled = false;
    void apiClient
      .request<RawProductionProject[]>("/project/getProject", { method: "POST" })
      .then((projects) => {
        const project = projects.find((item) => Number(item.id) === projectId);
        if (!cancelled) setImageModel(project?.imageModel?.trim() || "pancat:pancat-image");
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [apiClient, projectId]);
  if (projectId == null) return <MissingContext>项目编号无效，请返回项目列表重新选择。</MissingContext>;
  if (scriptId == null) return <MissingContext>请先选择剧本，再进入分镜工作台。</MissingContext>;
  return (
    <WorkspaceBoundary>
      <StoryboardPage
        key={reloadVersion}
        api={api}
        projectId={projectId}
        scriptId={scriptId}
        onOpenDirectorDesk={(storyboardId) => {
          void router.navigate({
            to: "/projects/$projectId/director-desk",
            params: { projectId: String(projectId) },
            search: { storyboardId },
          });
        }}
        onOpenImageEditor={setEditingStoryboard}
      />
      {editingStoryboard ? (
        <ImageFlowEditor
          api={productionApi}
          projectId={projectId}
          scriptId={scriptId}
          storyboard={storyboardForProduction(editingStoryboard)}
          imageModel={imageModel}
          onClose={() => setEditingStoryboard(null)}
          onSaved={() => {
            setEditingStoryboard(null);
            setReloadVersion((value) => value + 1);
          }}
        />
      ) : null}
    </WorkspaceBoundary>
  );
}

function storyboardForProduction(storyboard: Storyboard): StoryboardItem {
  const state =
    storyboard.state === "已完成" ? "completed" : storyboard.state === "生成中" ? "running" : storyboard.state === "生成失败" ? "failed" : "idle";
  return {
    ...storyboard,
    index: storyboard.index ?? 0,
    src: storyboard.src ?? "",
    state,
    errorReason: storyboard.reason ?? "",
  };
}

function ScriptAgentRoutePage() {
  const projectId = readProjectId();
  const { apiClient, apiBaseUrl, getToken } = projectAgentsRoute.useRouteContext();
  if (projectId == null) return <MissingContext>项目编号无效，请返回项目列表重新选择。</MissingContext>;
  return (
    <WorkspaceBoundary>
      <ScriptAgentPage projectId={projectId} apiClient={apiClient} apiBaseUrl={apiBaseUrl} getToken={getToken} />
    </WorkspaceBoundary>
  );
}

function positiveInteger(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : undefined;
}

interface RawProductionProject {
  id?: number | string;
  name?: string;
  videoModel?: string;
  mode?: string;
  videoMode?: string;
  resolution?: string;
  videoResolution?: string;
  audio?: boolean;
  videoAudio?: boolean;
  imageModel?: string;
}

function normalizeProductionProject(value: RawProductionProject | RawProductionProject[], projectId: number): ProductionProject {
  const project = Array.isArray(value) ? (value.find((item) => Number(item.id) === projectId) ?? {}) : value;
  return {
    id: positiveInteger(project.id) ?? projectId,
    name: project.name?.trim() || `项目 ${projectId}`,
    imageModel: project.imageModel?.trim() || "pancat:pancat-image",
    videoModel: project.videoModel?.trim() || "pancat:pancat-video",
    videoMode: project.mode?.trim() || project.videoMode?.trim() || "singleImage",
    videoResolution: project.videoResolution?.trim() || project.resolution?.trim() || "1080p",
    videoAudio: project.videoAudio ?? project.audio ?? false,
  };
}

function ProductionWorkbenchRoutePage({ projectId }: { projectId: number }) {
  const { apiClient, apiBaseUrl, getToken } = projectProductionRoute.useRouteContext();
  const router = useRouter();
  const api = useMemo(() => createProductionApi(apiClient), [apiClient]);
  const [project, setProject] = useState<ProductionProject | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setProject(null);
    setError("");
    void apiClient
      .request<RawProductionProject | RawProductionProject[]>("/project/getProject", {
        method: "POST",
      })
      .then((value) => {
        if (!cancelled) setProject(normalizeProductionProject(value, projectId));
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "项目配置加载失败");
      });
    return () => {
      cancelled = true;
    };
  }, [apiClient, projectId]);

  if (error) return <MissingContext>{error}</MissingContext>;
  if (!project) return <MissingContext>正在读取项目生产配置…</MissingContext>;
  return (
    <ProductionWorkbench
      api={api}
      project={project}
      onOpenAgent={(episodeId) =>
        void router.navigate({
          to: "/projects/$projectId/production",
          params: { projectId: String(projectId) },
          search: { view: "agent", episodeId },
        })
      }
      renderProductionAgent={(episodeId, onFlowDataChange) => (
        <ProductionAgentPanel
          projectId={projectId}
          episodeId={episodeId}
          apiClient={apiClient}
          apiBaseUrl={apiBaseUrl}
          getToken={getToken}
          onFlowDataChange={onFlowDataChange}
        />
      )}
    />
  );
}

function ProductionRoutePage() {
  const projectId = readProjectId();
  const { view, episodeId } = projectProductionRoute.useSearch();
  const { apiClient, apiBaseUrl, getToken } = projectProductionRoute.useRouteContext();
  if (projectId == null) return <MissingContext>项目编号无效，请返回项目列表重新选择。</MissingContext>;
  if (view === "agent") {
    if (episodeId == null) return <MissingContext>请先选择剧本集，再进入生产智能体。</MissingContext>;
    return (
      <WorkspaceBoundary>
        <ProductionAgentPage projectId={projectId} episodeId={episodeId} apiClient={apiClient} apiBaseUrl={apiBaseUrl} getToken={getToken} />
      </WorkspaceBoundary>
    );
  }
  return <ProductionWorkbenchRoutePage projectId={projectId} />;
}

const projectsRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: "/projects",
  component: ProjectsRoutePage,
});

function TasksRoutePage() {
  const { apiClient } = tasksRoute.useRouteContext();
  return <TasksPage client={apiClient} />;
}

const tasksRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: "/tasks",
  component: TasksRoutePage,
});

function SettingsRoutePage() {
  const router = useRouter();
  const { apiClient, apiBaseUrl, getToken } = settingsRoute.useRouteContext();
  const api = useMemo(
    () =>
      createSettingsApi({
        request: apiClient.request,
        async requestBlob(path, init = {}) {
          const headers = new Headers(init.headers);
          const token = getToken();
          if (token) headers.set("Authorization", token);
          const response = await fetch(`${apiBaseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`, { ...init, headers });
          if (!response.ok) throw new Error((await response.text()) || `数据库导出失败 (${response.status})`);
          const disposition = response.headers.get("content-disposition") ?? "";
          const encodedName = disposition.match(/filename\*?=(?:UTF-8''|\")?([^\";]+)/i)?.[1];
          return {
            blob: await response.blob(),
            filename: encodedName ? decodeURIComponent(encodedName.replace(/\"/g, "")) : `hodor-backup-${Date.now()}.json`,
          };
        },
      }),
    [apiBaseUrl, apiClient, getToken],
  );
  return (
    <SettingsPage api={api} apiBaseUrl={apiBaseUrl} onLoggedOut={() => void router.navigate({ to: "/login" }).then(() => router.invalidate())} />
  );
}

const settingsRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: "/settings",
  component: SettingsRoutePage,
});

const projectNovelRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: "/projects/$projectId/novels",
  component: NovelRoutePage,
});

const projectScriptRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: "/projects/$projectId/scripts",
  component: ScriptRoutePage,
});

const projectAssetsRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: "/projects/$projectId/assets",
  component: AssetsRoutePage,
});

const projectStoryboardsRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: "/projects/$projectId/storyboards",
  validateSearch: (search: Record<string, unknown>) => ({ scriptId: positiveInteger(search.scriptId) }),
  component: StoryboardsRoutePage,
});

const projectProductionRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: "/projects/$projectId/production",
  validateSearch: (search: Record<string, unknown>) => ({
    view: search.view === "agent" ? ("agent" as const) : ("workbench" as const),
    episodeId: positiveInteger(search.episodeId),
  }),
  component: ProductionRoutePage,
});

const projectAgentsRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: "/projects/$projectId/script-agent",
  component: ScriptAgentRoutePage,
});

function CastingRoutePage() {
  const projectId = readProjectId();
  const { apiClient } = projectCastingRoute.useRouteContext();
  const api = useMemo(() => createCastingApi(apiClient), [apiClient]);
  const [imageModel, setImageModel] = useState("pancat:pancat-image");
  const [error, setError] = useState("");

  useEffect(() => {
    if (projectId == null) return;
    let cancelled = false;
    void apiClient
      .request<RawProductionProject[]>("/project/getProject", { method: "POST" })
      .then((projects) => {
        const project = projects.find((item) => Number(item.id) === projectId);
        if (!cancelled) setImageModel(project?.imageModel?.trim() || "pancat:pancat-image");
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "项目图片模型加载失败");
      });
    return () => {
      cancelled = true;
    };
  }, [apiClient, projectId]);

  if (projectId == null) return <MissingContext>项目编号无效，请返回项目列表重新选择。</MissingContext>;
  if (error) return <MissingContext>{error}</MissingContext>;
  return (
    <WorkspaceBoundary>
      <CastingPage projectId={projectId} imageModel={imageModel} api={api} />
    </WorkspaceBoundary>
  );
}

const projectCastingRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: "/projects/$projectId/casting",
  component: CastingRoutePage,
});

const loadDirectorDeskEditor = (): Promise<DirectorDeskEditorModule> => import("../../vendor/storyai-3d-director-desk/src/embed");

function DirectorDeskRoutePage() {
  const projectId = readProjectId();
  const { storyboardId } = projectDirectorDeskRoute.useSearch();
  const { apiClient } = projectDirectorDeskRoute.useRouteContext();
  const adapter = useMemo(() => createHodorDirectorDeskAdapter(apiClient), [apiClient]);
  if (projectId == null) return <MissingContext>项目编号无效，请返回项目列表重新选择。</MissingContext>;
  if (storyboardId == null) return <MissingContext>请从分镜页面选择镜头，再进入 3D 导演台。</MissingContext>;
  return (
    <WorkspaceBoundary>
      <DirectorDeskPage projectId={projectId} storyboardId={storyboardId} adapter={adapter} loadEditor={loadDirectorDeskEditor} />
    </WorkspaceBoundary>
  );
}

const projectDirectorDeskRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: "/projects/$projectId/director-desk",
  validateSearch: (search: Record<string, unknown>) => ({ storyboardId: positiveInteger(search.storyboardId) }),
  component: DirectorDeskRoutePage,
});

function selectedProjectId(): string | null {
  return localStorage.getItem("hodorSelectedProjectId");
}

const legacyProjectRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: "/project",
  beforeLoad: () => {
    throw redirect({ to: "/projects" });
  },
});

const legacyNovelRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: "/novel",
  beforeLoad: () => {
    const projectId = selectedProjectId();
    if (!projectId) throw redirect({ to: "/projects" });
    throw redirect({ to: "/projects/$projectId/novels", params: { projectId } });
  },
});

const legacyScriptRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: "/script",
  beforeLoad: () => {
    const projectId = selectedProjectId();
    if (!projectId) throw redirect({ to: "/projects" });
    throw redirect({ to: "/projects/$projectId/scripts", params: { projectId } });
  },
});

const legacyScriptAgentRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: "/scriptAgent",
  beforeLoad: () => {
    const projectId = selectedProjectId();
    if (!projectId) throw redirect({ to: "/projects" });
    throw redirect({ to: "/projects/$projectId/script-agent", params: { projectId } });
  },
});

const legacyCastingRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: "/cornerScape",
  beforeLoad: () => {
    const projectId = selectedProjectId();
    if (!projectId) throw redirect({ to: "/projects" });
    throw redirect({ to: "/projects/$projectId/casting", params: { projectId } });
  },
});

const legacyProductionRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: "/production",
  beforeLoad: () => {
    const projectId = selectedProjectId();
    if (!projectId) throw redirect({ to: "/projects" });
    throw redirect({
      to: "/projects/$projectId/production",
      params: { projectId },
      search: { view: "workbench", episodeId: undefined },
    });
  },
});

const legacyAssetsRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: "/assets",
  beforeLoad: () => {
    const projectId = selectedProjectId();
    if (!projectId) throw redirect({ to: "/projects" });
    throw redirect({ to: "/projects/$projectId/assets", params: { projectId } });
  },
});

const legacyDirectorDeskRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: "/director-desk",
  beforeLoad: () => {
    const projectId = selectedProjectId();
    if (!projectId) throw redirect({ to: "/projects" });
    throw redirect({
      to: "/projects/$projectId/director-desk",
      params: { projectId },
      search: { storyboardId: undefined },
    });
  },
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  protectedRoute.addChildren([
    projectsRoute,
    tasksRoute,
    settingsRoute,
    projectNovelRoute,
    projectScriptRoute,
    projectAssetsRoute,
    projectStoryboardsRoute,
    projectProductionRoute,
    projectAgentsRoute,
    projectCastingRoute,
    projectDirectorDeskRoute,
    legacyProjectRoute,
    legacyNovelRoute,
    legacyScriptRoute,
    legacyScriptAgentRoute,
    legacyCastingRoute,
    legacyProductionRoute,
    legacyAssetsRoute,
    legacyDirectorDeskRoute,
  ]),
]);

export function createHodorRouter(context: RouterContext = createDefaultContext()) {
  return createRouter({
    routeTree,
    history: createHashHistory(),
    context,
    defaultPreload: "intent",
  });
}

export type HodorRouter = ReturnType<typeof createHodorRouter>;

declare module "@tanstack/react-router" {
  interface Register {
    router: HodorRouter;
  }
}
