import { describe, expect, it, vi } from "vitest";

import { detectRuntime, invokeDesktopAction, openExternalUrl, readDesktopAppUrl } from "./runtime";

describe("Hodor runtime", () => {
  it("detects Electron from the user agent", () => {
    expect(detectRuntime("Mozilla/5.0 Chrome/150.0.0.0 Electron/38.0.0")).toBe("electron");
    expect(detectRuntime("Mozilla/5.0 Chrome/150.0.0.0 Safari/537.36")).toBe("browser");
  });

  it("never requests the Toonflow protocol in a browser", async () => {
    const fetchImpl = vi.fn();

    await expect(readDesktopAppUrl({ runtime: "browser", fetchImpl })).resolves.toBeNull();

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("reads the backend address through the Hodor protocol in Electron", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ url: "http://127.0.0.1:10588/api/" }));

    await expect(readDesktopAppUrl({ runtime: "electron", fetchImpl })).resolves.toBe(
      "http://127.0.0.1:10588/api",
    );

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl).toHaveBeenCalledWith("hodor://getAppUrl");
  });

  it("falls back cleanly when the Electron bridge cannot return an address", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("protocol unavailable");
    });

    await expect(readDesktopAppUrl({ runtime: "electron", fetchImpl })).resolves.toBeNull();
  });

  it("invokes window controls only inside Electron", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ ok: true }));

    await expect(invokeDesktopAction("windowMinimize", { runtime: "browser", fetchImpl })).resolves.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();

    await expect(invokeDesktopAction("windowMinimize", { runtime: "electron", fetchImpl })).resolves.toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledWith("hodor://windowMinimize");
  });

  it("opens only HTTP links through the desktop bridge", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ ok: true }));

    await openExternalUrl("https://pancat.ai/docs?a=1", { runtime: "electron", fetchImpl });
    expect(fetchImpl).toHaveBeenCalledWith(
      `hodor://openurlwithbrowser?url=${encodeURIComponent("https://pancat.ai/docs?a=1")}`,
    );
    await expect(openExternalUrl("file:///tmp/secret", { runtime: "electron", fetchImpl })).rejects.toThrow("仅允许打开 HTTP");
  });
});
