import { describe, expect, it, vi } from "vitest";

import { createApiClient, resolveApiBaseUrl } from "./client";

describe("Hodor API client", () => {
  it("uses the local backend in development and the current origin in cloud deployments", () => {
    expect(
      resolveApiBaseUrl({
        envBaseUrl: undefined,
        storedBaseUrl: null,
        location: new URL("http://localhost:50288/director-desk"),
      }),
    ).toBe("http://localhost:10588/api");
    expect(
      resolveApiBaseUrl({
        envBaseUrl: undefined,
        storedBaseUrl: null,
        location: new URL("https://hodor.pancat.ai/projects"),
      }),
    ).toBe("https://hodor.pancat.ai/api");
  });

  it("adds the Pancat authorization token to protected requests", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Response.json({ data: { projects: [] } }, { status: 200 }),
    );
    const client = createApiClient({
      baseUrl: "http://localhost:10588/api/",
      fetchImpl,
      getToken: () => "Bearer pancat-session",
    });

    await client.request("/project/list");

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("http://localhost:10588/api/project/list");
    if (!init) throw new Error("request init was not provided");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer pancat-session");
  });

  it("unwraps the Pancat login response", async () => {
    const loginSession = {
      token: "Bearer pancat-session",
      id: "operator",
      name: "operator",
      partnerId: "pancat",
      partnerName: "PanCat",
      role: "super_admin",
    };
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Response.json({ data: loginSession }, { status: 200 }),
    );
    const client = createApiClient({
      baseUrl: "http://localhost:10588/api",
      fetchImpl,
      getToken: () => null,
    });

    const result = await client.login({ username: "operator", password: "secret" });

    expect(result).toEqual(loginSession);
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://localhost:10588/api/login/login",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ username: "operator", password: "secret" }),
      }),
    );
  });

  it("clears the session when the server returns 401", async () => {
    const onUnauthorized = vi.fn();
    const client = createApiClient({
      baseUrl: "http://localhost:10588/api",
      fetchImpl: async () => Response.json({ message: "登录已过期" }, { status: 401 }),
      getToken: () => "Bearer expired",
      onUnauthorized,
    });

    await expect(client.request("/project/list")).rejects.toEqual(
      expect.objectContaining({ status: 401, message: "登录已过期" }),
    );
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it("rejects business errors returned with HTTP 200", async () => {
    const client = createApiClient({
      baseUrl: "http://localhost:10588/api",
      fetchImpl: async () => Response.json({ code: 400, message: "目录不存在", data: null }, { status: 200 }),
      getToken: () => "Bearer pancat-session",
    });

    await expect(client.request("/setting/fileManagement/openFolder")).rejects.toEqual(
      expect.objectContaining({ status: 400, message: "目录不存在" }),
    );
  });

  it("surfaces legacy error data instead of the wrapper success label", async () => {
    const client = createApiClient({
      baseUrl: "http://localhost:10588/api",
      fetchImpl: async () => Response.json({ code: 200, message: "成功", data: "项目未配置视频模型" }, { status: 400 }),
      getToken: () => "Bearer pancat-session",
    });

    await expect(client.request("/production/workbench/getGenerateData")).rejects.toEqual(
      expect.objectContaining({ status: 400, message: "项目未配置视频模型" }),
    );
  });

  it.each([
    [{ error: "模型供应商不存在" }, "模型供应商不存在"],
    [{ error: { message: "素材删除失败" } }, "素材删除失败"],
    ["图片供应商请求失败", "图片供应商请求失败"],
  ])("preserves legacy error response details", async (body, message) => {
    const client = createApiClient({
      baseUrl: "http://localhost:10588/api",
      fetchImpl: async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status: 500 }),
      getToken: () => "Bearer pancat-session",
    });

    await expect(client.request("/legacy-error")).rejects.toEqual(expect.objectContaining({ message }));
  });
});
