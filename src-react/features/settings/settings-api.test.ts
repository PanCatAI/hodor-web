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

  it("edits, enables, and deletes providers through the mounted vendor routes", async () => {
    const request = vi.fn(async () => ({ ok: true }));
    const api = createSettingsApi({ request });

    await api.run("providers", "updateInputs", { id: "pancat", inputValues: { baseUrl: "https://api.pancat.ai" } });
    await api.run("providers", "enable", { id: "pancat", enable: 1 });
    await api.run("providers", "delete", { id: "legacy" });

    expect(request).toHaveBeenNthCalledWith(1, "/setting/vendorConfig/updateVendorInputs", {
      method: "POST",
      body: JSON.stringify({ id: "pancat", inputValues: { baseUrl: "https://api.pancat.ai" } }),
    });
    expect(request).toHaveBeenNthCalledWith(2, "/setting/vendorConfig/enableVendor", {
      method: "POST",
      body: JSON.stringify({ id: "pancat", enable: 1 }),
    });
    expect(request).toHaveBeenNthCalledWith(3, "/setting/vendorConfig/deleteVendor", {
      method: "POST",
      body: JSON.stringify({ id: "legacy" }),
    });
  });

  it("adds, updates, and deletes provider models using the backend contracts", async () => {
    const request = vi.fn(async () => ({ ok: true }));
    const api = createSettingsApi({ request });
    const model = { name: "Pancat Image", modelName: "pancat-image", type: "image", mode: ["text"] };

    await api.run("providers", "addModel", { id: "pancat", model });
    await api.run("providers", "updateModel", { id: "pancat", modelName: "pancat-image", model });
    await api.run("providers", "deleteModel", { id: "pancat", modelName: "old-image" });

    expect(request).toHaveBeenNthCalledWith(1, "/setting/vendorConfig/addVendorModel", {
      method: "POST",
      body: JSON.stringify({ id: "pancat", model }),
    });
    expect(request).toHaveBeenNthCalledWith(2, "/setting/vendorConfig/upVendorModel", {
      method: "POST",
      body: JSON.stringify({ id: "pancat", modelName: "pancat-image", model }),
    });
    expect(request).toHaveBeenNthCalledWith(3, "/setting/vendorConfig/delVendorModel", {
      method: "POST",
      body: JSON.stringify({ id: "pancat", modelName: "old-image" }),
    });
  });

  it("runs text, image, and video model checks without including provider credentials", async () => {
    const request = vi.fn(async () => ({ ok: true }));
    const api = createSettingsApi({ request });

    await api.run("providers", "testText", { id: "pancat", modelName: "text", messages: [{ role: "user", content: "hello" }] });
    await api.run("providers", "testImage", { id: "pancat", modelName: "image", prompt: "cat" });
    await api.run("providers", "testVideo", { id: "pancat", modelName: "video", mode: "text", prompt: "cat", images: [], videos: [], audios: [] });

    expect(request).toHaveBeenNthCalledWith(1, "/setting/vendorConfig/modelTest/textTest", expect.objectContaining({ method: "POST" }));
    expect(request).toHaveBeenNthCalledWith(2, "/setting/vendorConfig/modelTest/imageTest", expect.objectContaining({ method: "POST" }));
    expect(request).toHaveBeenNthCalledWith(3, "/setting/vendorConfig/modelTest/videoTest", expect.objectContaining({ method: "POST" }));
    expect(request.mock.calls.flat().join(" ")).not.toContain("apiKey");
  });

  it("saves model prompt bindings and prompt files", async () => {
    const request = vi.fn(async () => ({ ok: true }));
    const api = createSettingsApi({ request });

    await api.run("models", "bindPrompt", { vendorId: "pancat", model: "pancat-video", path: "video/cinematic.md", fileName: "cinematic" });
    await api.run("models", "savePrompt", { name: "cinematic", type: "video", data: "prompt" });
    await api.run("models", "updatePrompt", { name: "cinematic", type: "video", data: "updated" });
    await api.run("models", "deletePrompt", { path: "video/cinematic.md" });

    expect(request).toHaveBeenNthCalledWith(1, "/setting/modelMap/bindingPrompt", expect.objectContaining({ method: "POST" }));
    expect(request).toHaveBeenNthCalledWith(2, "/setting/modelMap/savePrompt", expect.objectContaining({ method: "POST" }));
    expect(request).toHaveBeenNthCalledWith(3, "/setting/modelMap/updatePrompt", expect.objectContaining({ method: "POST" }));
    expect(request).toHaveBeenNthCalledWith(4, "/setting/modelMap/deletePrompt", expect.objectContaining({ method: "POST" }));
  });

  it("uses a raw blob transport for database export and JSON routes for destructive database actions", async () => {
    const request = vi.fn(async () => ({ ok: true }));
    const requestBlob = vi.fn(async () => ({
      blob: new Blob(["backup"], { type: "application/json" }),
      filename: "hodor-backup.json",
    }));
    const api = createSettingsApi({ request, requestBlob });

    await expect(api.run("database", "export")).resolves.toMatchObject({ filename: "hodor-backup.json" });
    await api.run("database", "import", { tables: { projects: [] } });
    await api.run("database", "clearTable", { tableName: "projects" });
    await api.run("database", "clearAll");

    expect(requestBlob).toHaveBeenCalledWith("/setting/dbConfig/exportData");
    expect(request).toHaveBeenNthCalledWith(1, "/setting/dbConfig/importData", expect.objectContaining({ method: "POST" }));
    expect(request).toHaveBeenNthCalledWith(2, "/setting/dbConfig/clearTable", expect.objectContaining({ method: "POST" }));
    expect(request).toHaveBeenNthCalledWith(3, "/setting/dbConfig/clearData");
  });
});
