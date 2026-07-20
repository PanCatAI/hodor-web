import type { PancatCredentials, PancatLoginSession } from "../auth/types";

const DEFAULT_LOCAL_API_BASE_URL = "http://localhost:10588/api";

interface ApiClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  getToken: () => string | null;
  onUnauthorized?: () => void;
}

interface ResolveApiBaseUrlOptions {
  envBaseUrl?: string;
  storedBaseUrl?: string | null;
  location: Pick<URL, "hostname" | "origin">;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function readErrorMessage(body: unknown, status: number): string {
  if (typeof body === "string" && body.trim()) return body.trim();
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    if (typeof record.data === "string" && record.data.trim()) return record.data;
    if (record.data && typeof record.data === "object") {
      const dataMessage = (record.data as Record<string, unknown>).message;
      if (typeof dataMessage === "string" && dataMessage) return dataMessage;
    }
    if (typeof record.error === "string" && record.error.trim()) return record.error.trim();
    if (record.error && typeof record.error === "object") {
      const errorMessage = (record.error as Record<string, unknown>).message;
      if (typeof errorMessage === "string" && errorMessage.trim()) return errorMessage.trim();
    }
    if (typeof record.message === "string" && record.message) return record.message;
  }
  return `Hodor 请求失败 (${status})`;
}

async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function unwrapData<T>(body: unknown): T {
  if (body && typeof body === "object" && "data" in body) {
    return (body as { data: T }).data;
  }
  return body as T;
}

function readBusinessErrorStatus(body: unknown): number | null {
  if (!body || typeof body !== "object") return null;
  const code = Number((body as Record<string, unknown>).code);
  return Number.isInteger(code) && code >= 400 ? code : null;
}

export function resolveApiBaseUrl({ envBaseUrl, storedBaseUrl, location }: ResolveApiBaseUrlOptions): string {
  const configured = envBaseUrl?.trim() || storedBaseUrl?.trim();
  if (configured) return trimTrailingSlash(configured);
  if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
    return DEFAULT_LOCAL_API_BASE_URL;
  }
  return `${location.origin}/api`;
}

export function createApiClient({
  baseUrl,
  fetchImpl = fetch,
  getToken,
  onUnauthorized,
}: ApiClientOptions) {
  const normalizedBaseUrl = trimTrailingSlash(baseUrl);

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

    const token = getToken();
    if (token) headers.set("Authorization", token);

    const response = await fetchImpl(`${normalizedBaseUrl}/${path.replace(/^\/+/, "")}`, {
      ...init,
      headers,
    });
    const body = await readResponseBody(response);

    if (!response.ok) {
      if (response.status === 401) onUnauthorized?.();
      throw new ApiError(readErrorMessage(body, response.status), response.status, body);
    }

    const businessErrorStatus = readBusinessErrorStatus(body);
    if (businessErrorStatus != null) {
      if (businessErrorStatus === 401) onUnauthorized?.();
      throw new ApiError(readErrorMessage(body, businessErrorStatus), businessErrorStatus, body);
    }

    return unwrapData<T>(body);
  }

  return {
    request,
    login(credentials: PancatCredentials) {
      return request<PancatLoginSession>("/login/login", {
        method: "POST",
        body: JSON.stringify(credentials),
      });
    },
  };
}

export type HodorApiClient = ReturnType<typeof createApiClient>;
