import type { HodorApiClient } from "@react/lib/api/client";

export type ProjectType = "novel" | "script" | string;

export interface HodorProject {
  id: string;
  name: string;
  intro?: string | null;
  type?: string | null;
  projectType: ProjectType;
  artStyle?: string | null;
  directorManual?: string | null;
  videoRatio?: string | null;
  imageModel?: string | null;
  videoModel?: string | null;
  imageQuality?: "1K" | "2K" | "4K" | "" | null;
  mode?: string | null;
  createTime?: number | string | null;
}

export interface ProjectInput {
  projectType: string;
  name: string;
  intro: string;
  type: string;
  artStyle: string;
  directorManual: string;
  videoRatio: string;
  imageModel: string;
  videoModel: string;
  imageQuality: string;
  mode: string;
}

export interface ProjectUpdate extends ProjectInput {
  id: string;
}

export interface ModelOption {
  id: string;
  label: string;
  type: "image" | "video" | string;
  vendorName: string;
}

export interface ManualTab {
  label: string;
  value: string;
  data: string;
}

export interface VisualManual {
  name: string;
  images: string[];
  data: ManualTab[];
  stylePath: string;
}

export interface DirectorManual {
  name: string;
  images: string[];
  data: ManualTab[];
  directorManual: string;
}

interface RawProject extends Omit<HodorProject, "id"> {
  id: string | number;
}

interface RawModelOption {
  id: string | number;
  label?: string;
  value: string;
  type: string;
  name?: string;
}

interface RawManual {
  name: string;
  image?: string | string[];
  images?: string[];
  data?: ManualTab[];
  stylePath?: string;
  directorManual?: string;
}

function post<T>(client: HodorApiClient, path: string, body?: unknown): Promise<T> {
  return client.request<T>(path, {
    method: "POST",
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function numericProjectId(id: string): number {
  const value = Number(id);
  if (!Number.isFinite(value)) throw new Error("项目编号无效");
  return value;
}

function normalizeImages(item: RawManual): string[] {
  if (Array.isArray(item.images)) return item.images;
  if (Array.isArray(item.image)) return item.image;
  return item.image ? [item.image] : [];
}

export function createProjectsApi(client: HodorApiClient) {
  return {
    async listProjects(): Promise<HodorProject[]> {
      const projects = await post<RawProject[]>(client, "/project/getProject");
      return projects.map((project) => ({ ...project, id: String(project.id) }));
    },
    createProject(input: ProjectInput): Promise<unknown> {
      return post(client, "/project/addProject", input);
    },
    updateProject(input: ProjectUpdate): Promise<unknown> {
      const { id, ...project } = input;
      return post(client, "/project/editProject", { ...project, id: numericProjectId(id) });
    },
    deleteProject(id: string): Promise<unknown> {
      return post(client, "/project/delProject", { id: numericProjectId(id) });
    },
    async listModels(type: "image" | "video"): Promise<ModelOption[]> {
      const models = await post<RawModelOption[]>(client, "/modelSelect/getModelList", { type });
      return models.map((model) => ({
        id: `${model.id}:${model.value}`,
        label: model.label?.trim() || model.value,
        type: model.type,
        vendorName: model.name?.trim() || String(model.id),
      }));
    },
    getModelDetail(modelId: string): Promise<unknown> {
      return post(client, "/modelSelect/getModelDetail", { modelId });
    },
    async listVisualManuals(): Promise<VisualManual[]> {
      const manuals = await post<RawManual[]>(client, "/project/getVisualManual");
      return manuals.map((item) => ({
        name: item.name,
        stylePath: item.stylePath || "",
        images: normalizeImages(item),
        data: item.data || [],
      }));
    },
    createVisualManual(input: VisualManual): Promise<unknown> {
      return post(client, "/project/addVisualManual", input);
    },
    updateVisualManual(input: VisualManual): Promise<unknown> {
      return post(client, "/project/editVisualManual", input);
    },
    deleteVisualManual(name: string): Promise<unknown> {
      return post(client, "/project/deleteVisualManual", { name });
    },
    async listDirectorManuals(): Promise<DirectorManual[]> {
      const manuals = await post<RawManual[]>(client, "/project/queryDirectorManual");
      return manuals.map((item) => ({
        name: item.name,
        directorManual: item.directorManual || "",
        images: normalizeImages(item),
        data: item.data || [],
      }));
    },
    createDirectorManual(input: DirectorManual): Promise<unknown> {
      return post(client, "/project/addDirectorManual", input);
    },
    updateDirectorManual(input: DirectorManual): Promise<unknown> {
      return post(client, "/project/editDirectorlManual", input);
    },
    deleteDirectorManual(name: string): Promise<unknown> {
      return post(client, "/project/deleteDirectorManual", { name });
    },
  };
}

export type ProjectsApi = ReturnType<typeof createProjectsApi>;
