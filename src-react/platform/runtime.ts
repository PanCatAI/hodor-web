export type AppRuntime = "browser" | "electron";

interface ReadDesktopAppUrlOptions {
  runtime: AppRuntime;
  fetchImpl?: typeof fetch;
}

interface DesktopAppUrlResponse {
  url?: unknown;
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
