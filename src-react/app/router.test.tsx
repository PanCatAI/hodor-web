import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HodorApp } from "./hodor-app";
import { normalizeProductionProject } from "./router";

function openRoute(path: string) {
  window.history.replaceState(null, "", `/index.react.html#${path}`);
}

function authenticate() {
  localStorage.setItem("token", "Bearer pancat-session");
}

describe("Hodor React router", () => {
  beforeEach(() => {
    window.scrollTo = vi.fn();
    openRoute("/projects");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps the project video ratio in the production contract", () => {
    expect(normalizeProductionProject([{ id: 9, videoRatio: "9:16" }], 9)).toMatchObject({ id: 9, videoRatio: "9:16" });
    expect(normalizeProductionProject([{ id: 9 }], 9)).toMatchObject({ id: 9, videoRatio: "16:9" });
    expect(normalizeProductionProject([{ id: 9, videoRatio: "4:3" }], 9)).toMatchObject({ id: 9, videoRatio: "16:9" });
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

    await waitFor(() => expect(window.location.hash).toBe("#/projects/9/casting"));
    expect(await screen.findByRole("heading", { name: "塑角造景" })).toBeInTheDocument();
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
      new Response(JSON.stringify({ data: { data: [], total: 0 } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(<HodorApp />);

    expect(await screen.findByRole("heading", { name: "原文管理" })).toBeInTheDocument();
  });

  it("mounts the migrated asset center with the route project id", async () => {
    authenticate();
    openRoute("/projects/7/assets");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: { data: [], total: 0 } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(<HodorApp />);

    expect(await screen.findByRole("heading", { name: "资产中心" })).toBeInTheDocument();
    expect(screen.getByText(/项目 #7/)).toBeInTheDocument();
  });

  it("asks for a script before mounting the storyboard page", async () => {
    authenticate();
    openRoute("/projects/7/storyboards");

    render(<HodorApp />);

    expect(await screen.findByText("请先选择剧本，再进入分镜工作台。")).toBeInTheDocument();
  });

  it("renders a finished not-found page for unknown routes", async () => {
    authenticate();
    openRoute("/missing-workspace");

    render(<HodorApp />);

    expect(await screen.findByRole("heading", { name: "页面不存在" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "返回项目列表" })).toHaveAttribute("href", "#/projects");
  });
});
