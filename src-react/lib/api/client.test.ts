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
});
