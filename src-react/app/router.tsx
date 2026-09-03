import { createHashHistory, createRootRouteWithContext, createRoute, createRouter, redirect, useParams, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { ProductionAgentPage, ProductionAgentPanel, ScriptAgentPage, ScriptAgentPanel } from "@react/features/agents";
import { AssetsCenter, createAssetApi } from "@react/features/assets";
import { LoginPage } from "@react/features/auth/login-page";
import { CastingPage, createCastingApi } from "@react/features/casting";
import { createHodorDirectorDeskAdapter, DirectorDeskPage, type DirectorDeskEditorModule } from "@react/features/director-desk";
import { createProductionApi, ImageFlowEditor, ProductionWorkbench, type ProductionApi, type ProductionProject, type StoryboardItem } from "@react/features/production";
import type { ProductionVideoRatio } from "@react/features/production/types";
import { createInteractiveStoryApi, InteractiveStoryPage, type InteractiveStoryGraph } from "@react/features/interactive-story";
import { createProjectsApi, ProjectsPage } from "@react/features/projects";
import { createSettingsApi, SettingsPage, type SettingsSectionId } from "@react/features/settings";
import { ProjectCanvas, StoryModule, type ProjectCanvasModuleId, type ProjectCanvasModuleRenderContext, type ProjectCanvasModuleRenderers } from "@react/features/project-canvas";
import { createAuthenticatedBlobRequest, createStoryApi, NovelPage, ScriptPage, type Script } from "@react/features/story";
import { createStoryboardApi, StoryboardPage, type Storyboard } from "@react/features/storyboards";
import { TasksPage } from "@react/features/tasks";
import { createApiClient, createAuthenticatedDownloadRequest, resolveApiBaseUrl, type HodorApiClient } from "@react/lib/api/client";
import { clearSession, getSessionToken } from "@react/lib/auth/session";
import { PlaceholderPage } from "./placeholder-page";
import { ProtectedLayout } from "./protected-layout";
import { RootLayout } from "./root-layout";
import { useCurrentProjectContext } from "./current-project";
import { normalizeProjectWorldProfile, type ProjectWorldProfile } from "@react/features/world-profile/world-profile-fields";

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

function selectedProjectId(): string | null {
  const value = localStorage.getItem("hodorSelectedProjectId")?.trim();
  return value && /^\d+$/.test(value) && Number(value) > 0 ? value : null;
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  notFoundComponent: () => <PlaceholderPage title="页面不存在" description="这个工作台地址不存在，请从左侧导航重新进入。" />,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: ({ context }) => {
    if (!context.getToken()) throw redirect({ to: "/login" });
    const projectId = selectedProjectId();
    if (!projectId) throw redirect({ to: "/projects" });
    throw redirect({
      to: "/projects/$projectId/canvas",
      params: { projectId },
      search: { module: undefined, view: undefined, scriptId: undefined, episodeId: undefined },
    });
  },
});

function LoginRoutePage() {
  const router = useRouter();
  const { apiClient } = loginRoute.useRouteContext();

  return (
    <LoginPage
      login={apiClient.login}
      onAuthenticated={() => {
        const projectId = selectedProjectId();
        const navigation = projectId
          ? router.navigate({
              to: "/projects/$projectId/canvas",
              params: { projectId },
              search: { module: undefined, view: undefined, scriptId: undefined, episodeId: undefined },
            })
          : router.navigate({ to: "/projects" });
        void navigation.then(() => router.invalidate());
      }}
    />
  );
}

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  beforeLoad: ({ context }) => {
    if (!context.getToken()) return;
    const projectId = selectedProjectId();
    if (!projectId) throw redirect({ to: "/projects" });
    throw redirect({
      to: "/projects/$projectId/canvas",
      params: { projectId },
      search: { module: undefined, view: undefined, scriptId: undefined, episodeId: undefined },
    });
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

function isCanvasModule(value: unknown): ProjectCanvasModuleId | undefined {
  return value === "goal" || value === "story" || value === "casting" || value === "assets" || value === "storyboards" || value === "production" || value === "interactive"
    ? value
    : undefined;
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
  videoRatio?: string;
  imageModel?: string;
  worldProfile?: unknown;
}

function normalizeVideoRatio(value: string | undefined): ProductionVideoRatio {
  return value === "1:1" || value === "9:16" ? value : "16:9";
}

export function normalizeProductionProject(value: RawProductionProject | RawProductionProject[], projectId: number): ProductionProject {
  const project = Array.isArray(value) ? (value.find((item) => Number(item.id) === projectId) ?? {}) : value;
  return {
    id: positiveInteger(project.id) ?? projectId,
    name: project.name?.trim() || `项目 ${projectId}`,
    imageModel: project.imageModel?.trim() || "pancat:pancat-image",
    videoModel: project.videoModel?.trim() || "pancat:pancat-video",
    videoMode: project.mode?.trim() || project.videoMode?.trim() || "singleImage",
    videoRatio: normalizeVideoRatio(project.videoRatio?.trim()),
    videoResolution: project.videoResolution?.trim() || project.resolution?.trim() || "1080p",
    videoAudio: project.videoAudio ?? project.audio ?? false,
    worldProfile: normalizeProjectWorldProfile(project.worldProfile),
  };
}

function ProductionWorkbenchRoutePage({ projectId, initialScriptId }: { projectId: number; initialScriptId?: number }) {
  const { apiClient, apiBaseUrl, getToken } = projectProductionRoute.useRouteContext();
  const router = useRouter();
  const api = useMemo(() => createProductionApi(apiClient), [apiClient]);
  const projectsApi = useMemo(() => createProjectsApi(apiClient), [apiClient]);
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
      initialView="flow"
      initialScriptId={initialScriptId}
      onOpenAgent={(episodeId) =>
        void router.navigate({
          to: "/projects/$projectId/production",
          params: { projectId: String(projectId) },
          search: { view: "agent", episodeId },
        })
      }
      renderProductionAgent={(episodeId, onFlowDataChange, onBusyChange) => (
        <ProductionAgentPanel
          projectId={projectId}
          episodeId={episodeId}
          apiClient={apiClient}
          apiBaseUrl={apiBaseUrl}
          getToken={getToken}
          onFlowDataChange={onFlowDataChange}
          onBusyChange={onBusyChange}
        />
      )}
      onWorldProfileChange={async (worldProfile) => {
        await projectsApi.updateWorldProfile(String(projectId), worldProfile);
        setProject((current) => (current ? { ...current, worldProfile } : current));
      }}
      onExtractWorldProfile={async (mode) => {
        const result = await projectsApi.extractWorldProfile(String(projectId), mode);
        setProject((current) => (current ? { ...current, worldProfile: result.profile } : current));
        return result.profile;
      }}
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
  return <ProductionWorkbenchRoutePage projectId={projectId} initialScriptId={episodeId} />;
}

function InteractiveStoryRoutePage() {
  const projectId = readProjectId();
  const { apiClient, apiBaseUrl, getToken } = projectInteractiveStoryRoute.useRouteContext();
  const api = useMemo(() => createInteractiveStoryApi(apiClient), [apiClient]);
  const productionApi = useMemo(() => createProductionApi(apiClient), [apiClient]);
  const projectsApi = useMemo(() => createProjectsApi(apiClient), [apiClient]);
  const { project, loading, error } = useCurrentProjectContext();
  const productionProject = useMemo(
    () => (projectId != null && project ? normalizeProductionProject(project, projectId) : null),
    [project, projectId],
  );

  if (projectId == null) return <MissingContext>项目编号无效，请返回项目列表重新选择。</MissingContext>;
  if (loading) return <MissingContext>正在核验项目类型…</MissingContext>;
  if (error) return <MissingContext>{error}</MissingContext>;
  if (project?.projectType !== "interactive") {
    return <MissingContext>当前项目使用线性流程，只有互动剧项目可以进入互动剧情画布。</MissingContext>;
  }
  if (!productionProject) return <MissingContext>正在读取互动剧生产配置…</MissingContext>;
  return (
    <InteractiveStoryPage
      projectId={projectId}
      api={api}
      productionApi={productionApi}
      productionProject={productionProject}
      onWorldProfileChange={async (worldProfile: ProjectWorldProfile) => {
        await projectsApi.updateWorldProfile(String(projectId), worldProfile);
      }}
      onExtractWorldProfile={async (mode) => (await projectsApi.extractWorldProfile(String(projectId), mode)).profile}
      renderScriptAgent={(onBusyChange, selectedNodeId) => (
        <ScriptAgentPanel
          projectId={projectId}
          apiClient={apiClient}
          apiBaseUrl={apiBaseUrl}
          getToken={getToken}
          onBusyChange={onBusyChange}
          selectedNodeId={selectedNodeId}
        />
      )}
    />
  );
}

export function createProjectCanvasProductionRenderer({
  projectId,
  productionApi,
  productionProject,
  apiClient,
  apiBaseUrl,
  getToken,
}: {
  projectId: number;
  productionApi: ProductionApi;
  productionProject: ProductionProject;
  apiClient: HodorApiClient;
  apiBaseUrl: string;
  getToken: () => string | null;
}) {
  return ({ episodeId, view }: ProjectCanvasModuleRenderContext) => view === "agent" && episodeId != null ? (
    <ProductionAgentPanel
      projectId={projectId}
      episodeId={episodeId}
      apiClient={apiClient}
      apiBaseUrl={apiBaseUrl}
      getToken={getToken}
    />
  ) : (
    <ProductionWorkbench
      api={productionApi}
      project={productionProject}
      initialView="generation"
      initialScriptId={episodeId}
      embedded
      renderProductionAgent={(agentEpisodeId, onFlowDataChange, onBusyChange) => (
        <ProductionAgentPanel
          projectId={projectId}
          episodeId={agentEpisodeId}
          apiClient={apiClient}
          apiBaseUrl={apiBaseUrl}
          getToken={getToken}
          onFlowDataChange={onFlowDataChange}
          onBusyChange={onBusyChange}
        />
      )}
    />
  );
}

function ProjectCanvasRoutePage() {
  const projectId = readProjectId();
  const router = useRouter();
  const { apiClient, apiBaseUrl, getToken } = projectCanvasRoute.useRouteContext();
  const search = projectCanvasRoute.useSearch();
  const { project, loading, error } = useCurrentProjectContext();
  const storyApi = useMemo(() => createStoryApi(apiClient, { requestBlob: createAuthenticatedBlobRequest(apiBaseUrl) }), [apiBaseUrl, apiClient]);
  const castingApi = useMemo(() => createCastingApi(apiClient), [apiClient]);
  const assetsApi = useMemo(() => createAssetApi(apiClient), [apiClient]);
  const storyboardApi = useMemo(() => createStoryboardApi(apiClient, { requestBlob: createAuthenticatedBlobRequest(apiBaseUrl) }), [apiBaseUrl, apiClient]);
  const productionApi = useMemo(() => createProductionApi(apiClient), [apiClient]);
  const interactiveApi = useMemo(() => createInteractiveStoryApi(apiClient), [apiClient]);
  const projectsApi = useMemo(() => createProjectsApi(apiClient), [apiClient]);
  const productionProject = useMemo(() => (projectId != null && project ? normalizeProductionProject(project, projectId) : null), [project, projectId]);
  const [interactiveGraph, setInteractiveGraph] = useState<InteractiveStoryGraph | null>(null);

  useEffect(() => {
    if (projectId == null || project?.projectType !== "interactive") {
      setInteractiveGraph(null);
      return;
    }
    let cancelled = false;
    void interactiveApi.getGraph(projectId).then((graph) => {
      if (!cancelled) setInteractiveGraph(graph);
    }).catch(() => {
      if (!cancelled) setInteractiveGraph(null);
    });
    return () => {
      cancelled = true;
    };
  }, [interactiveApi, project?.projectType, projectId]);
  const renderProduction = useMemo(
    () => projectId != null && productionProject
      ? createProjectCanvasProductionRenderer({ projectId, productionApi, productionProject, apiClient, apiBaseUrl, getToken })
      : null,
    [apiBaseUrl, apiClient, getToken, productionApi, productionProject, projectId],
  );
  const renderers = useMemo<ProjectCanvasModuleRenderers>(() => {
    if (projectId == null || !productionProject) return {};
    const projectType = project?.projectType ?? "novel";
    const openStoryboard = (script: Script) => {
      void router.navigate({
        to: "/projects/$projectId/canvas",
        params: { projectId: String(projectId) },
        search: { module: "storyboards", view: undefined, scriptId: script.id, episodeId: undefined },
      });
    };
    return {
      story: () => (
        <StoryModule api={storyApi} projectId={projectId} onOpenStoryboard={openStoryboard} />
      ),
      casting: () => <CastingPage projectId={projectId} imageModel={productionProject.imageModel ?? "pancat:pancat-image"} api={castingApi} embedded />,
      assets: () => <AssetsCenter projectId={projectId} imageModel={productionProject.imageModel ?? "pancat:pancat-image"} api={assetsApi} embedded />,
      storyboards: ({ scriptId }) => scriptId ? <StoryboardPage api={storyboardApi} projectId={projectId} scriptId={scriptId} embedded /> : <ScriptPage api={storyApi} projectId={projectId} embedded onOpenStoryboard={openStoryboard} />,
      production: (context) => renderProduction?.(context) ?? null,
      interactive: () => projectType === "interactive" ? (
        <InteractiveStoryPage
          projectId={projectId}
          api={interactiveApi}
          productionApi={productionApi}
          productionProject={productionProject}
          onWorldProfileChange={async (worldProfile) => {
            await projectsApi.updateWorldProfile(String(projectId), worldProfile);
          }}
          onExtractWorldProfile={async (mode) => (await projectsApi.extractWorldProfile(String(projectId), mode)).profile}
          renderScriptAgent={(onBusyChange, selectedNodeId) => (
            <ScriptAgentPanel
              projectId={projectId}
              apiClient={apiClient}
              apiBaseUrl={apiBaseUrl}
              getToken={getToken}
              onBusyChange={onBusyChange}
              selectedNodeId={selectedNodeId}
            />
          )}
        />
      ) : null,
    };
  }, [apiBaseUrl, apiClient, assetsApi, castingApi, getToken, interactiveApi, productionApi, productionProject, project, projectsApi, renderProduction, router, storyApi, storyboardApi]);
  if (projectId == null) return <MissingContext>项目编号无效，请返回项目列表重新选择。</MissingContext>;
  if (loading) return <MissingContext>正在读取项目画布…</MissingContext>;
  if (error) return <MissingContext>{error}</MissingContext>;
  const openInitialModuleWithoutSnapshot = search.module === "storyboards" || (search.module === "production" && search.view === "agent" && search.episodeId != null);
  return (
    <ProjectCanvas
      projectId={projectId}
      projectType={project?.projectType ?? "novel"}
      apiBaseUrl={apiBaseUrl}
      getToken={getToken}
      apiClient={apiClient}
      initialModule={search.module}
      initialScriptId={search.scriptId}
      initialEpisodeId={search.episodeId}
      initialView={search.view}
      openInitialModuleWithoutSnapshot={openInitialModuleWithoutSnapshot}
      interactiveGraph={interactiveGraph}
      moduleRenderers={renderers}
      onOpenModelSettings={() => void router.navigate({ to: "/settings", search: { section: "agents", projectId } })}
    />
  );
}

const projectsRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: "/projects",
  beforeLoad: () => {
    const projectId = selectedProjectId();
    if (!projectId) return;
    throw redirect({
      to: "/projects/$projectId/canvas",
      params: { projectId },
      search: { module: undefined, view: undefined, scriptId: undefined, episodeId: undefined },
    });
  },
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
  const search = settingsRoute.useSearch();
  const { apiClient, apiBaseUrl, getToken } = settingsRoute.useRouteContext();
  const authenticatedToken = getToken();
  const api = useMemo(
    () =>
      createSettingsApi({
        request: apiClient.request,
        requestBlob: createAuthenticatedDownloadRequest({
          baseUrl: apiBaseUrl,
          getToken: () => authenticatedToken,
          onUnauthorized: () => {
            clearSession();
            window.location.hash = "#/login";
          },
        }),
      }),
    [apiBaseUrl, apiClient, authenticatedToken],
  );
  return (
    <SettingsPage
      api={api}
      apiBaseUrl={apiBaseUrl}
      initialSection={search.section}
      onBackToCanvas={search.projectId
        ? () => void router.navigate({
            to: "/projects/$projectId/canvas",
            params: { projectId: String(search.projectId) },
            search: { module: undefined, view: undefined, scriptId: undefined, episodeId: undefined },
          })
        : undefined}
      onLoggedOut={() => void router.navigate({ to: "/login" }).then(() => router.invalidate())}
    />
  );
}

const SETTINGS_SECTIONS = new Set<SettingsSectionId>([
  "ui",
  "language",
  "providers",
  "models",
  "agents",
  "prompts",
  "skills",
  "memory",
  "database",
  "files",
  "other",
  "request",
  "development",
  "about",
  "session",
]);

function settingsSection(value: unknown): SettingsSectionId | undefined {
  return typeof value === "string" && SETTINGS_SECTIONS.has(value as SettingsSectionId) ? (value as SettingsSectionId) : undefined;
}

const settingsRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: "/settings",
  validateSearch: (search: Record<string, unknown>) => ({
    section: settingsSection(search.section),
    projectId: positiveInteger(search.projectId),
  }),
  component: SettingsRoutePage,
});

const projectNovelRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: "/projects/$projectId/novels",
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/projects/$projectId/canvas", params, search: { module: "story", view: undefined, scriptId: undefined, episodeId: undefined } });
  },
});

const projectCanvasRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: "/projects/$projectId/canvas",
  validateSearch: (search: Record<string, unknown>) => ({
    module: isCanvasModule(search.module),
    view: search.view === "agent" ? ("agent" as const) : search.view === "workbench" ? ("workbench" as const) : undefined,
    scriptId: positiveInteger(search.scriptId),
    episodeId: positiveInteger(search.episodeId),
  }),
  component: ProjectCanvasRoutePage,
});

const projectScriptRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: "/projects/$projectId/scripts",
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/projects/$projectId/canvas", params, search: { module: "story", view: undefined, scriptId: undefined, episodeId: undefined } });
  },
});

const projectAssetsRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: "/projects/$projectId/assets",
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/projects/$projectId/canvas", params, search: { module: "assets", view: undefined, scriptId: undefined, episodeId: undefined } });
  },
});

const projectStoryboardsRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: "/projects/$projectId/storyboards",
  validateSearch: (search: Record<string, unknown>) => ({ scriptId: positiveInteger(search.scriptId) }),
  beforeLoad: ({ params, search }) => {
    throw redirect({ to: "/projects/$projectId/canvas", params, search: { module: "storyboards", view: undefined, scriptId: positiveInteger((search as { scriptId?: unknown }).scriptId), episodeId: undefined } });
  },
});

const projectProductionRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: "/projects/$projectId/production",
  beforeLoad: ({ params, search }) => {
    throw redirect({ to: "/projects/$projectId/canvas", params, search: { module: "production", view: (search as { view?: "agent" | "workbench" }).view, scriptId: undefined, episodeId: positiveInteger((search as { episodeId?: unknown }).episodeId) } });
  },
  validateSearch: (search: Record<string, unknown>) => ({
    view: search.view === "agent" ? ("agent" as const) : ("workbench" as const),
    episodeId: positiveInteger(search.episodeId),
  }),
  component: ProductionRoutePage,
});

const projectStudioOsRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: "/projects/$projectId/studio-os",
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/projects/$projectId/canvas",
      params,
      search: { module: undefined, view: undefined, scriptId: undefined, episodeId: undefined },
    });
  },
});

const projectInteractiveStoryRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: "/projects/$projectId/interactive",
  validateSearch: (search: Record<string, unknown>) => search,
  beforeLoad: ({ params, search }) => {
    throw redirect({ to: "/projects/$projectId/canvas", params, search: { module: "interactive", view: (search as { view?: "agent" | "workbench" }).view, scriptId: undefined, episodeId: positiveInteger((search as { episodeId?: unknown }).episodeId) } });
  },
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
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/projects/$projectId/canvas", params, search: { module: "casting", view: undefined, scriptId: undefined, episodeId: undefined } });
  },
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
    projectCanvasRoute,
    projectScriptRoute,
    projectAssetsRoute,
    projectStoryboardsRoute,
    projectProductionRoute,
    projectStudioOsRoute,
    projectInteractiveStoryRoute,
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
