import { detectRuntime, readDesktopAppUrl } from "./runtime";

export const HODOR_API_BASE_URL_KEY = "hodorApiBaseUrl";
export const DEFAULT_LOCAL_API_BASE_URL = "http://localhost:10588/api";

interface ReadableStorage {
  getItem(key: string): string | null;
}

interface BackendLocation {
  hostname: string;
  origin: string;
}

interface ReadBackendApiBaseUrlOptions {
  envBaseUrl?: string;
  storage?: ReadableStorage;
  location?: BackendLocation;
  userAgent?: string;
  fetchImpl?: typeof fetch;
}

function normalizeAddress(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function readConfiguredAddress(envBaseUrl: string | undefined, storage: ReadableStorage | undefined): string | null {
  const configured = envBaseUrl?.trim() || storage?.getItem(HODOR_API_BASE_URL_KEY)?.trim();
  return configured ? normalizeAddress(configured) : null;
}

function browserFallback(location: BackendLocation): string {
  if (location.hostname === "localhost" || location.hostname === "127.0.0.1" || location.origin === "null") {
    return DEFAULT_LOCAL_API_BASE_URL;
  }
  return `${normalizeAddress(location.origin)}/api`;
}

export async function readBackendApiBaseUrl(options: ReadBackendApiBaseUrlOptions = {}): Promise<string> {
  const storage = options.storage ?? globalThis.localStorage;
  const location = options.location ?? globalThis.location;
  const configured = readConfiguredAddress(options.envBaseUrl, storage);
  if (configured) return configured;

  const runtime = detectRuntime(options.userAgent);
  const desktopAddress = await readDesktopAppUrl({ runtime, fetchImpl: options.fetchImpl });
  if (desktopAddress) return desktopAddress;

  return browserFallback(location);
}
