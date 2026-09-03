import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { isValidElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProductionAgentPanel } from "@react/features/agents";
import { ProductionWorkbench } from "@react/features/production";
import type { ProductionApi, ProductionProject, ProductionWorkbenchProps } from "@react/features/production";
import { HodorApp } from "./hodor-app";
import { createProjectCanvasProductionRenderer, normalizeProductionProject } from "./router";
import { createWesternFantasyWorldProfile } from "@react/features/world-profile/world-profile-fields";

function openRoute(path: string) {
  window.history.replaceState(null, "", `/index.react.html#${path}`);
}

function authenticate() {
  localStorage.setItem("token", "Bearer pancat-session");
}

describe("Hodor React router", () => {
  beforeEach(() => {
    window.scrollTo = vi.fn();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    openRoute("/projects");
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("keeps the project video ratio in the production contract", () => {
    expect(normalizeProductionProject([{ id: 9, videoRatio: "9:16" }], 9)).toMatchObject({ id: 9, videoRatio: "9:16" });
    expect(normalizeProductionProject([{ id: 9 }], 9)).toMatchObject({ id: 9, videoRatio: "16:9" });
    expect(normalizeProductionProject([{ id: 9, videoRatio: "4:3" }], 9)).toMatchObject({ id: 9, videoRatio: "16:9" });
    expect(normalizeProductionProject([{ id: 9 }], 9).worldProfile).toBeNull();
    const worldProfile = createWesternFantasyWorldProfile();
    expect(normalizeProductionProject([{ id: 9, worldProfile }], 9).worldProfile).toEqual(worldProfile);
  });

  it("redirects protected routes to the Pancat login page", async () => {
    render(<HodorApp />);

    expect(await screen.findByRole("heading", { name: "Hodor" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "登录" })).toBeInTheDocument();
  });

  it("renders the workspace navigation for an authenticated session", async () => {
    authenticate();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(<HodorApp />);

    expect(await screen.findByRole("navigation", { name: "工作台导航" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "项目" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "任务" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "设置" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "资产" })).not.toBeInTheDocument();
  });

  it("hides the persistent workspace navigation on the full-screen project canvas", async () => {
    authenticate();
    openRoute("/projects/7/canvas");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: 7, projectType: "novel" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(<HodorApp />);

    expect(await screen.findByTestId("project-canvas-goal-prompt")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "工作台导航" })).not.toBeInTheDocument();
  });

  it("keeps the embedded production agent in the canvas workbench while preserving the deep-link page", () => {
    const apiClient = { request: vi.fn() } as never;
    const productionApi = {} as ProductionApi;
    const project: ProductionProject = normalizeProductionProject([{ id: 7, name: "雨夜" }], 7);
    const renderProduction = createProjectCanvasProductionRenderer({
      projectId: 7,
      productionApi,
      productionProject: project,
      apiClient,
      apiBaseUrl: "/api",
      getToken: () => "session-token",
    });

    const workbench = renderProduction({ projectId: 7, projectType: "novel", episodeId: 19, view: "workbench" });
    expect(isValidElement(workbench)).toBe(true);
    if (!isValidElement(workbench)) throw new Error("普通生产分支没有返回 React 元素");
    expect(workbench.type).toBe(ProductionWorkbench);
    const renderProductionAgent = (workbench.props as ProductionWorkbenchProps).renderProductionAgent;
    expect(renderProductionAgent).toBeTypeOf("function");

    const onFlowDataChange = vi.fn();
    const onBusyChange = vi.fn();
    const panel = renderProductionAgent?.(19, onFlowDataChange, onBusyChange);
    expect(isValidElement(panel)).toBe(true);
    if (!isValidElement(panel)) throw new Error("普通生产分支没有返回真实 Agent 面板");
    expect(panel?.type).toBe(ProductionAgentPanel);
    expect(panel?.props).toMatchObject({
      projectId: 7,
      episodeId: 19,
      apiClient,
      apiBaseUrl: "/api",
      getToken: expect.any(Function),
      onFlowDataChange,
      onBusyChange,
    });

    const deepLink = renderProduction({ projectId: 7, projectType: "novel", episodeId: 19, view: "agent" });
    expect(isValidElement(deepLink)).toBe(true);
    if (!isValidElement(deepLink)) throw new Error("Agent 深链没有返回 React 元素");
    // 画布内嵌模式使用面板形态（display="panel"），不创建第二个全页壳。
    expect(deepLink.type).toBe(ProductionAgentPanel);
    expect(deepLink.props).toMatchObject({
      projectId: 7,
      episodeId: 19,
      apiClient,
      apiBaseUrl: "/api",
      getToken: expect.any(Function),
    });
  });

  it("requires a storyboard when the director desk route is opened directly", async () => {
    authenticate();
    openRoute("/projects/7/director-desk");

    render(<HodorApp />);

    expect(await screen.findByText("请从分镜页面选择镜头，再进入 3D 导演台。")).toBeInTheDocument();
    expect(window.location.hash).toBe("#/projects/7/director-desk");
  });

  it("redirects legacy Vue routes to the selected project route", async () => {
    authenticate();
    localStorage.setItem("hodorSelectedProjectId", "9");
    openRoute("/cornerScape");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      const data = url.endsWith("/project/getProject") ? [{ id: 9, imageModel: "pancat:pancat-image" }] : [];
      return new Response(JSON.stringify({ data }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    render(<HodorApp />);

    await waitFor(() => expect(window.location.hash).toBe("#/projects/9/canvas?module=casting"));
    expect(await screen.findByTestId("project-canvas-goal-prompt")).toBeInTheDocument();
  });

  it("mounts the embedded director desk when a storyboard is selected", async () => {
    authenticate();
    openRoute("/projects/7/director-desk?storyboardId=23");

    render(<HodorApp />);

    expect(await screen.findByRole("heading", { name: "3D 导演台" })).toBeInTheDocument();
    expect(screen.getByText("项目 7 · 分镜 23")).toBeInTheDocument();
  });

  it("mounts the migrated task center on the global task route", async () => {
    authenticate();
    openRoute("/tasks");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      const data = url.endsWith("/getTaskApi") ? { data: [], total: 0 } : [];
      return new Response(JSON.stringify({ data }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    render(<HodorApp />);

    expect(await screen.findByRole("button", { name: "刷新任务" })).toBeInTheDocument();
  });

  it("mounts the migrated settings page", async () => {
    authenticate();
    openRoute("/settings");

    render(<HodorApp />);

    expect(await screen.findByLabelText("Hodor API 地址")).toBeInTheDocument();
  });

  it("uses the resolved Electron backend and session for settings requests and database exports", async () => {
    authenticate();
    openRoute("/settings");
    const baseUrl = "http://127.0.0.1:24680/api";
    const requests: Array<{ url: string; authorization: string | null }> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      requests.push({ url, authorization: new Headers(init?.headers).get("Authorization") });
      if (url.endsWith("/setting/dbConfig/exportData")) {
        return new Response(JSON.stringify({ exportTime: 1, tables: {} }), {
          status: 200,
          headers: { "Content-Type": "application/json", "Content-Disposition": 'attachment; filename="hodor-backup.json"' },
        });
      }
      return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:settings-backup") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    render(<HodorApp resolveBackendApiBaseUrl={async () => baseUrl} />);

    expect(await screen.findByLabelText("Hodor API 地址")).toHaveValue(baseUrl);
    fireEvent.click(screen.getByRole("button", { name: "供应商" }));
    await waitFor(() => expect(requests.some((request) => request.url === `${baseUrl}/setting/vendorConfig/getVendorList`)).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "数据库" }));
    fireEvent.click(await screen.findByRole("button", { name: "导出数据库" }));
    await waitFor(() => expect(requests.some((request) => request.url === `${baseUrl}/setting/dbConfig/exportData`)).toBe(true));
    expect(requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ url: `${baseUrl}/setting/vendorConfig/getVendorList`, authorization: "Bearer pancat-session" }),
        expect.objectContaining({ url: `${baseUrl}/setting/dbConfig/exportData`, authorization: "Bearer pancat-session" }),
      ]),
    );
  });

  it("mounts the migrated original-text page with the route project id", async () => {
    authenticate();
    openRoute("/projects/7/novels");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: 7, projectType: "novel" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(<HodorApp />);

    expect(await screen.findByTestId("project-canvas-goal-prompt")).toBeInTheDocument();
    expect(window.location.hash).toBe("#/projects/7/canvas?module=story");
  });

  it("mounts the migrated asset center with the route project id", async () => {
    authenticate();
    openRoute("/projects/7/assets");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: 7, projectType: "novel" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(<HodorApp />);

    expect(await screen.findByTestId("project-canvas-goal-prompt")).toBeInTheDocument();
    expect(window.location.hash).toBe("#/projects/7/canvas?module=assets");
  });

  it("preserves module, script, episode, and view context when a legacy deep link enters the canvas", async () => {
    authenticate();
    openRoute("/projects/7/storyboards?scriptId=11");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      const data = url.endsWith("/project/getProject")
        ? [{ id: 7, projectType: "novel" }]
        : url.endsWith("/production/getFlowData")
          ? { storyboardTable: "", storyboard: [{ id: 23, index: 1, duration: 4, prompt: "中景", videoDesc: "推进", state: "已完成", src: "" }] }
          : [];
      return new Response(JSON.stringify({ data }), { status: 200, headers: { "Content-Type": "application/json" } });
    });

    render(<HodorApp />);

    expect(await screen.findByText("S01")).toBeInTheDocument();
    expect(window.location.hash).toContain("#/projects/7/canvas");
    expect(window.location.hash).toContain("module=storyboards");
    expect(window.location.hash).toContain("scriptId=11");
  });

  it("lets the no-script storyboard entry choose a real script and open its storyboard page", async () => {
    authenticate();
    openRoute("/projects/7/storyboards");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      const data = url.endsWith("/project/getProject")
        ? [{ id: 7, projectType: "novel" }]
        : url.endsWith("/script/getScrptApi")
          ? [{ id: 19, name: "第一集", content: "医院走廊" }]
          : url.endsWith("/production/getFlowData")
            ? { storyboardTable: "", storyboard: [{ id: 23, index: 1, duration: 4, prompt: "中景", videoDesc: "推进", state: "已完成", src: "" }] }
            : [];
      return new Response(JSON.stringify({ data }), { status: 200, headers: { "Content-Type": "application/json" } });
    });

    render(<HodorApp />);

    expect(await screen.findByText("第一集")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "查看分镜" }));

    await waitFor(() => expect(window.location.hash).toContain("scriptId=19"));
    expect(await screen.findByText("S01")).toBeInTheDocument();
  });

  it("mounts the production agent for an agent deep link with an episode id", async () => {
    authenticate();
    openRoute("/projects/7/production?view=agent&episodeId=19");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      const data = url.endsWith("/project/getProject")
        ? [{ id: 7, projectType: "novel", videoModel: "pancat:pancat-video" }]
        : url.endsWith("/script/getScrptApi")
          ? [{ id: 19, name: "第一集", content: "医院走廊" }]
          : url.endsWith("/project/getModelDetails")
            ? { think: false }
            : url.endsWith("/agents/getMemory")
              ? []
              : [];
      return new Response(JSON.stringify({ data }), { status: 200, headers: { "Content-Type": "application/json" } });
    });

    render(<HodorApp />);

    // Agent 深链重定向到画布生产模块，模块 host 内嵌面板形态（无全页壳与重复描述头）。
    expect(await screen.findByRole("dialog", { name: "生产模块" })).toBeInTheDocument();
    expect(await screen.findByText("第一集")).toBeInTheDocument();
  });

  it("mounts the project-group Studio OS control room from the authoritative snapshot", async () => {
    authenticate();
    openRoute("/projects/7/studio-os?groupId=group-fixture");
    const request = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      const data = url.endsWith("/project/getProject")
        ? [{ id: 7, name: "夜航项目", projectType: "novel" }]
        : url.endsWith("/studio-os-vnext/groups/group-fixture/snapshot")
          ? {
              revision: 2,
              snapshot: {
                schemaVersion: "1",
                groups: [{ schemaVersion: "1", groupId: "group-fixture", projectId: "7", name: "夜航项目组", status: "active", revision: 2, createdAt: "2026-08-11T00:00:00.000Z", updatedAt: "2026-08-11T00:00:00.000Z" }],
                assets: [], tasks: [], decisions: [], packets: [], leases: [], batches: [], verifications: [], events: [], idempotency: [],
              },
            }
          : [];
      return new Response(JSON.stringify({ data }), { status: 200, headers: { "Content-Type": "application/json" } });
    });

    render(<HodorApp />);

    expect(await screen.findByRole("heading", { name: "夜航项目组" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "控制室" })).toBeInTheDocument();
    expect(request.mock.calls.some(([input]) => String(input).endsWith("/studio-os-vnext/groups/group-fixture/snapshot"))).toBe(true);
  });

  it("mounts the unified project canvas for interactive projects", async () => {
    authenticate();
    openRoute("/projects/7/canvas");
    const request = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      const data = url.endsWith("/project/getProject")
        ? [{ id: 7, projectType: "interactive" }]
        : [];
      return new Response(JSON.stringify({ data }), { status: 200, headers: { "Content-Type": "application/json" } });
    });

    render(<HodorApp />);

    expect(await screen.findByTestId("project-canvas-goal-prompt")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "工作台导航" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "互动剧画布" })).not.toBeInTheDocument();
    expect(request.mock.calls.filter(([input]) => String(input).endsWith("/project/getProject"))).toHaveLength(1);
  });

  it("redirects the legacy interactive route to the unified canvas without initializing the old graph", async () => {
    authenticate();
    openRoute("/projects/7/interactive");
    const request = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      const data = url.endsWith("/project/getProject") ? [{ id: 7, projectType: "novel" }] : [];
      return new Response(JSON.stringify({ data }), { status: 200, headers: { "Content-Type": "application/json" } });
    });

    render(<HodorApp />);

    await waitFor(() => expect(window.location.hash).toBe("#/projects/7/canvas?module=interactive"));
    expect(await screen.findByTestId("project-canvas-goal-prompt")).toBeInTheDocument();
    expect(request.mock.calls.some(([input]) => String(input).includes("/interactiveStory/graph/"))).toBe(false);
  });

  it("preserves legacy project search context while redirecting to the canvas", async () => {
    authenticate();
    openRoute("/projects/7/production?view=agent&episodeId=23");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "Content-Type": "application/json" } }));

    render(<HodorApp />);

    await waitFor(() => expect(window.location.hash).toBe("#/projects/7/canvas?module=production&view=agent&episodeId=23"));
  });

  it("asks for a script before mounting the storyboard page", async () => {
    authenticate();
    openRoute("/projects/7/storyboards");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      const data = url.endsWith("/project/getProject") ? [{ id: 7, projectType: "novel" }] : url.endsWith("/script/getScrptApi") ? [] : [];
      return new Response(JSON.stringify({ data }), { status: 200, headers: { "Content-Type": "application/json" } });
    });

    render(<HodorApp />);

    expect(await screen.findByText("暂无剧本")).toBeInTheDocument();
    expect(window.location.hash).toBe("#/projects/7/canvas?module=storyboards");
  });

  it("renders a finished not-found page for unknown routes", async () => {
    authenticate();
    openRoute("/missing-workspace");

    render(<HodorApp />);

    expect(await screen.findByRole("heading", { name: "页面不存在" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "返回项目列表" })).toHaveAttribute("href", "#/projects");
  });
});
