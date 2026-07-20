import { describe, expect, it, vi } from "vitest";

import { createSettingsApi } from "./settings-api";

describe("createSettingsApi", () => {
  it("loads provider, model, and memory settings from the legacy mounted endpoints", async () => {
    const request = vi.fn(async (path: string) => ({ path }));
    const api = createSettingsApi({ request });

    await expect(api.load("providers")).resolves.toEqual({ path: "/setting/vendorConfig/getVendorList" });
    await expect(api.load("models")).resolves.toEqual({
      bindings: { path: "/setting/modelMap/getImageAndVideoModel" },
      prompts: { path: "/setting/modelMap/getPromptList" },
    });
    await expect(api.load("memory")).resolves.toEqual({ path: "/setting/memoryConfig/getMemory" });

    expect(request).toHaveBeenNthCalledWith(1, "/setting/vendorConfig/getVendorList", { method: "POST" });
    expect(request).toHaveBeenNthCalledWith(2, "/setting/modelMap/getImageAndVideoModel", { method: "POST" });
    expect(request).toHaveBeenNthCalledWith(3, "/setting/modelMap/getPromptList");
    expect(request).toHaveBeenNthCalledWith(4, "/setting/memoryConfig/getMemory");
  });

  it("saves JSON settings with the payload expected by the old backend", async () => {
    const request = vi.fn(async () => ({ ok: true }));
    const api = createSettingsApi({ request });

    await api.save("memory", { ragLimit: 4 });
    await api.save("prompts", { id: 7, data: "updated prompt" });

    expect(request).toHaveBeenNthCalledWith(1, "/setting/memoryConfig/sureMemory", {
      method: "POST",
      body: JSON.stringify({ ragLimit: 4 }),
    });
    expect(request).toHaveBeenNthCalledWith(2, "/setting/promptManage/updatePrompt", {
      method: "POST",
      body: JSON.stringify({ id: 7, data: "updated prompt" }),
    });
  });

  it("runs file and memory actions against their real routes", async () => {
    const request = vi.fn(async () => ({ ok: true }));
    const api = createSettingsApi({ request });

    await api.run("files", "open", { path: "logs" });
    await api.run("memory", "clear");

    expect(request).toHaveBeenNthCalledWith(1, "/setting/fileManagement/openFolder", {
      method: "POST",
      body: JSON.stringify({ path: "logs" }),
    });
    expect(request).toHaveBeenNthCalledWith(2, "/setting/memoryConfig/delAllMemory", { method: "POST" });
  });
});
