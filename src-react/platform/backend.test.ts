import { describe, expect, it, vi } from "vitest";

import { HODOR_API_BASE_URL_KEY, readBackendApiBaseUrl } from "./backend";

describe("Hodor backend address", () => {
  it("uses explicit configuration before runtime discovery", async () => {
    const fetchImpl = vi.fn();
    const storage = {
      getItem: vi.fn((key: string) => (key === HODOR_API_BASE_URL_KEY ? "http://stored.local/api/" : null)),
    };

    await expect(
      readBackendApiBaseUrl({
        envBaseUrl: "https://env.hodor.pancat.ai/api/",
        storage,
        location: new URL("https://hodor.pancat.ai/projects"),
        userAgent: "Electron/38.0.0",
        fetchImpl,
      }),
    ).resolves.toBe("https://env.hodor.pancat.ai/api");

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("uses the saved address when no environment address is present", async () => {
    localStorage.setItem(HODOR_API_BASE_URL_KEY, "http://saved.local:10588/api/");

    await expect(
      readBackendApiBaseUrl({
        storage: localStorage,
        location: new URL("http://localhost:50288/index.react.html"),
        userAgent: "Chrome/150.0.0.0",
      }),
    ).resolves.toBe("http://saved.local:10588/api");
  });

  it("asks Electron for its backend address only when no explicit address exists", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ url: "http://127.0.0.1:10588/api" }));

    await expect(
      readBackendApiBaseUrl({
        storage: localStorage,
        location: new URL("file:///Applications/Hodor/index.react.html"),
        userAgent: "Chrome/150.0.0.0 Electron/38.0.0",
        fetchImpl,
      }),
    ).resolves.toBe("http://127.0.0.1:10588/api");
  });

  it("uses local and same-origin browser fallbacks without touching the custom protocol", async () => {
    const fetchImpl = vi.fn();

    await expect(
      readBackendApiBaseUrl({
        storage: localStorage,
        location: new URL("http://localhost:50288/index.react.html"),
        userAgent: "Chrome/150.0.0.0",
        fetchImpl,
      }),
    ).resolves.toBe("http://localhost:10588/api");
    await expect(
      readBackendApiBaseUrl({
        storage: localStorage,
        location: new URL("https://hodor.pancat.ai/projects"),
        userAgent: "Chrome/150.0.0.0",
        fetchImpl,
      }),
    ).resolves.toBe("https://hodor.pancat.ai/api");

    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
