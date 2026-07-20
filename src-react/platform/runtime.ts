export type AppRuntime = "browser" | "electron";

interface ReadDesktopAppUrlOptions {
  runtime: AppRuntime;
  fetchImpl?: typeof fetch;
}

interface DesktopAppUrlResponse {
  url?: unknown;
}

export type HodorDesktopAction =
  | "windowMinimize"
  | "windowMaximize"
  | "windowClose"
  | "windowIsMaximized"
  | "appRestart"
  | "openDevTool"
  | "getLocalLanguage";

interface InvokeDesktopActionOptions {
  runtime?: AppRuntime;
  fetchImpl?: typeof fetch;
}

function trimTrailingSlash(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

export function detectRuntime(userAgent = globalThis.navigator?.userAgent ?? ""): AppRuntime {
  return /(?:^|\s|\/)electron(?:\/|\s|$)/i.test(userAgent) ? "electron" : "browser";
}

export async function readDesktopAppUrl({ runtime, fetchImpl }: ReadDesktopAppUrlOptions): Promise<string | null> {
  if (runtime !== "electron") return null;

  try {
    const request = fetchImpl ?? globalThis.fetch;
    if (!request) return null;

    const response = await request("hodor://getAppUrl");
    const body = (await response.json()) as DesktopAppUrlResponse;
    return typeof body.url === "string" && body.url.trim() ? trimTrailingSlash(body.url) : null;
  } catch {
    return null;
  }
}

export async function invokeDesktopAction<T extends object = { ok?: boolean }>(
  action: HodorDesktopAction,
  options: InvokeDesktopActionOptions = {},
): Promise<T | null> {
  const runtime = options.runtime ?? detectRuntime();
  if (runtime !== "electron") return null;
  const request = options.fetchImpl ?? globalThis.fetch;
  if (!request) return null;
  const response = await request(`hodor://${action}`);
  return (await response.json()) as T;
}

export async function openExternalUrl(
  target: string,
  options: InvokeDesktopActionOptions = {},
): Promise<{ ok?: boolean } | null> {
  const url = new URL(target);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("仅允许打开 HTTP 或 HTTPS 链接");
  }
  const runtime = options.runtime ?? detectRuntime();
  if (runtime === "browser") {
    globalThis.open?.(url.href, "_blank", "noopener,noreferrer");
    return null;
  }
  const request = options.fetchImpl ?? globalThis.fetch;
  if (!request) return null;
  const response = await request(`hodor://openurlwithbrowser?url=${encodeURIComponent(url.href)}`);
  return (await response.json()) as { ok?: boolean };
}
