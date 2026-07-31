import { describe, expect, it, vi } from "vitest";

import type { HodorApiClient } from "@react/lib/api/client";
import { createProjectsApi, type ProjectInput } from "./projects-api";
import { createWesternFantasyWorldProfile } from "@react/features/world-profile/world-profile-fields";

function createClient() {
  return { request: vi.fn() } as unknown as HodorApiClient;
}

const projectInput: ProjectInput = {
  projectType: "novel",
  name: "长安十二时辰",
  intro: "内部样片",
  type: "悬疑",
  artStyle: "realistic",
  directorManual: "crime",
  videoRatio: "16:9",
  imageModel: "pancat:pancat-image",
  videoModel: "pancat:pancat-video",
  imageQuality: "1K",
  mode: "singleImage",
  worldProfile: createWesternFantasyWorldProfile(),
};

describe("projects api", () => {
  it("uses the project CRUD contracts and sends numeric ids", async () => {
    const client = createClient();
    vi.mocked(client.request)
      .mockResolvedValueOnce([{ id: 7, name: "长安十二时辰", projectType: "novel" }])
      .mockResolvedValueOnce({ id: 8, message: "新增项目成功" })
      .mockResolvedValue(undefined);
    const api = createProjectsApi(client);

    await expect(api.listProjects()).resolves.toEqual([{ id: "7", name: "长安十二时辰", projectType: "novel", worldProfile: null }]);
    await expect(api.createProject(projectInput)).resolves.toEqual({ id: "8" });
    await api.updateProject({ ...projectInput, id: "7" });
    await api.deleteProject("7");

    expect(client.request).toHaveBeenNthCalledWith(1, "/project/getProject", { method: "POST" });
    expect(client.request).toHaveBeenNthCalledWith(2, "/project/addProject", {
      method: "POST",
      body: JSON.stringify(projectInput),
    });
    expect(client.request).toHaveBeenNthCalledWith(3, "/project/editProject", {
      method: "POST",
      body: JSON.stringify({ ...projectInput, id: 7 }),
    });
    expect(client.request).toHaveBeenNthCalledWith(4, "/project/delProject", {
      method: "POST",
      body: JSON.stringify({ id: 7 }),
    });
  });

  it("preserves world profiles in project reads and supports a profile-only update", async () => {
    const client = createClient();
    const worldProfile = createWesternFantasyWorldProfile();
    worldProfile.premise = "圣像闭眼，旧王国的誓约苏醒。";
    vi.mocked(client.request).mockResolvedValueOnce([{ id: 9, name: "圣像", projectType: "interactive", worldProfile }]).mockResolvedValue(undefined);
    const api = createProjectsApi(client);

    await expect(api.listProjects()).resolves.toEqual([
      expect.objectContaining({ id: "9", worldProfile }),
    ]);
    await api.updateWorldProfile("9", worldProfile);

    expect(client.request).toHaveBeenNthCalledWith(2, "/general/updateProject", {
      method: "POST",
      body: JSON.stringify({ id: 9, worldProfile }),
    });
  });

  it("extracts a validated world profile from project source text", async () => {
    const client = createClient();
    const worldProfile = createWesternFantasyWorldProfile();
    vi.mocked(client.request).mockResolvedValue({
      profile: worldProfile,
      evidence: { chapterCount: 3, characterCount: 3200 },
    });
    const api = createProjectsApi(client);

    await expect(api.extractWorldProfile("9", "merge")).resolves.toEqual({
      profile: worldProfile,
      evidence: { chapterCount: 3, characterCount: 3200 },
    });
    expect(client.request).toHaveBeenCalledWith("/project/extractWorldProfile", {
      method: "POST",
      body: JSON.stringify({ projectId: 9, mode: "merge", persist: false }),
    });
  });

  it("normalizes vendor model selections and validates configured models", async () => {
    const client = createClient();
    vi.mocked(client.request)
      .mockResolvedValueOnce([{ id: "pancat", label: "Pancat Image", value: "pancat-image", type: "image", name: "Pancat" }])
      .mockResolvedValueOnce({ modelName: "pancat-image", type: "image" });
    const api = createProjectsApi(client);

    await expect(api.listModels("image")).resolves.toEqual([
      expect.objectContaining({ id: "pancat:pancat-image", label: "Pancat Image" }),
    ]);
    await expect(api.getModelDetail("pancat:pancat-image")).resolves.toEqual({ modelName: "pancat-image", type: "image" });
    expect(client.request).toHaveBeenNthCalledWith(1, "/modelSelect/getModelList", {
      method: "POST",
      body: JSON.stringify({ type: "image" }),
    });
  });

  it("uses every visual and director manual endpoint with the backend field names", async () => {
    const client = createClient();
    vi.mocked(client.request).mockImplementation(async (path) => {
      if (path === "/project/getVisualManual") return [{ name: "写实", image: ["cover.jpg"], stylePath: "realistic", data: [] }];
      if (path === "/project/queryDirectorManual") return [{ name: "悬疑", image: "director.jpg", directorManual: "crime", data: [] }];
      return undefined;
    });
    const api = createProjectsApi(client);
    const visual = { name: "写实", stylePath: "realistic", images: ["cover.jpg"], data: [{ label: "README", value: "README", data: "说明" }] };
    const director = { name: "悬疑", directorManual: "crime", images: ["director.jpg"], data: [{ label: "README", value: "README", data: "说明" }] };

    await expect(api.listVisualManuals()).resolves.toEqual([{ ...visual, data: [] }]);
    await api.createVisualManual(visual);
    await api.updateVisualManual(visual);
    await api.deleteVisualManual("realistic");
    await expect(api.listDirectorManuals()).resolves.toEqual([{ ...director, data: [] }]);
    await api.createDirectorManual(director);
    await api.updateDirectorManual(director);
    await api.deleteDirectorManual("crime");

    expect(vi.mocked(client.request).mock.calls.map(([path]) => path)).toEqual([
      "/project/getVisualManual",
      "/project/addVisualManual",
      "/project/editVisualManual",
      "/project/deleteVisualManual",
      "/project/queryDirectorManual",
      "/project/addDirectorManual",
      "/project/editDirectorlManual",
      "/project/deleteDirectorManual",
    ]);
  });
});
