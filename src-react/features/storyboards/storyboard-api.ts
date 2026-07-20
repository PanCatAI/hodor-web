export type StoryboardState = "未生成" | "生成中" | "已完成" | "生成失败" | string;

export interface Storyboard {
  id: number;
  index?: number;
  duration: number;
  prompt: string;
  associateAssetsIds?: number[];
  src?: string;
  state: StoryboardState;
  videoDesc: string;
  shouldGenerateImage?: number;
  reason?: string;
  flowId?: number;
}

export interface StoryboardWorkspace {
  storyboardTable: string;
  storyboard: Storyboard[];
}

export interface UpdateStoryboardInput {
  id: number;
  prompt: string;
  videoDesc: string;
}

export interface StoryboardApi {
  load(projectId: number, scriptId: number): Promise<StoryboardWorkspace>;
  update(input: UpdateStoryboardInput): Promise<void>;
  remove(id: number, projectId: number): Promise<void>;
  removeMany(ids: number[], projectId: number): Promise<void>;
  generateImages(input: { projectId: number; scriptId: number; storyboardIds: number[]; concurrentCount?: number; compulsory?: boolean }): Promise<Storyboard[]>;
  pollImages(ids: number[]): Promise<Array<Pick<Storyboard, "id" | "state" | "src" | "reason" | "prompt">>>;
  previewGrid(ids: number[]): Promise<string | null>;
  downloadGrid(ids: number[]): Promise<Blob>;
}

interface RequestClient {
  request(path: string, init?: RequestInit): Promise<unknown>;
}

type BlobRequest = (path: string, init?: RequestInit) => Promise<Blob>;

function post(body: unknown): RequestInit {
  return { method: "POST", body: JSON.stringify(body) };
}

function defaultBlobRequest(path: string, init: RequestInit = {}) {
  const configured = import.meta.env.VITE_HODOR_API_BASE_URL?.trim() || localStorage.getItem("hodorApiBaseUrl")?.trim();
  const baseUrl = configured?.replace(/\/+$/, "") ||
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" ? "http://localhost:10588/api" : `${window.location.origin}/api`);
  const headers = new Headers(init.headers);
  const token = localStorage.getItem("token");
  if (token) headers.set("Authorization", token);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return fetch(`${baseUrl}/${path.replace(/^\/+/, "")}`, { ...init, headers }).then((response) => {
    if (!response.ok) throw new Error(`Hodor 文件请求失败 (${response.status})`);
    return response.blob();
  });
}

export function createStoryboardApi(client: RequestClient, options: { requestBlob?: BlobRequest } = {}): StoryboardApi {
  const requestBlob = options.requestBlob ?? defaultBlobRequest;
  return {
    async load(projectId, scriptId) {
      return (await client.request("/production/getFlowData", post({ projectId, episodesId: scriptId }))) as StoryboardWorkspace;
    },
    async update(input) {
      await client.request("/production/storyboard/editStoryboardInfo", post(input));
    },
    async remove(id) {
      await client.request("/production/storyboard/removeFrame", post({ id }));
    },
    async removeMany(ids, projectId) {
      await client.request("/production/storyboard/batchDelete", post({ ids, projectId }));
    },
    async generateImages(input) {
      return (await client.request("/production/storyboard/batchGenerateImage", post(input))) as Storyboard[];
    },
    async pollImages(ids) {
      return (await client.request("/production/storyboard/pollingImage", post({ ids }))) as Array<Pick<Storyboard, "id" | "state" | "src" | "reason" | "prompt">>;
    },
    async previewGrid(ids) {
      return (await client.request("/production/storyboard/previewImage", post({ storyboardIds: ids }))) as string | null;
    },
    downloadGrid(ids) {
      return requestBlob("/production/storyboard/downPreviewImage", post({ storyboardIds: ids }));
    },
  };
}
