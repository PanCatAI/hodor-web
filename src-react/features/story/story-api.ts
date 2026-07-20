export interface OriginalText {
  id: number;
  index: number;
  reel: string;
  chapter: string;
  chapterData: string;
  event: string;
  eventState?: -1 | 0 | 1;
  errorReason?: string;
}

export interface ScriptAsset {
  id: number;
  name: string;
  type?: "role" | "scene" | "tool";
}

export interface Script {
  id: number;
  name: string;
  content: string;
  createTime?: number;
  extractState?: -1 | 0 | 1 | 2;
  errorReason?: string;
  relatedAssets?: ScriptAsset[];
}

export interface NovelListInput {
  projectId: number;
  page: number;
  limit: number;
  search: string;
}

export interface NovelListResult {
  data: OriginalText[];
  total: number;
}

export interface CreateNovelInput {
  projectId: number;
  index: number;
  reel: string;
  chapter: string;
  chapterData: string;
}

export type ImportNovelInput = Omit<CreateNovelInput, "projectId">;

export interface ImportScriptInput {
  scriptName: string;
  scriptData: string;
}

export interface NovelEventState {
  id: number;
  eventState: -1 | 0 | 1;
  event?: string;
  errorReason?: string;
}

export interface ScriptExtractionState {
  id: number;
  extractState: -1 | 0 | 1 | 2;
  errorReason?: string;
}

export interface UpdateNovelInput extends Omit<OriginalText, "eventState" | "errorReason"> {}

export interface SaveScriptInput {
  id?: number;
  projectId?: number;
  name: string;
  content: string;
  assets: number[];
}

export interface StoryApi {
  listNovels(input: NovelListInput): Promise<NovelListResult>;
  createNovel(input: CreateNovelInput): Promise<void>;
  updateNovel(input: UpdateNovelInput): Promise<void>;
  deleteNovel(id: number): Promise<void>;
  deleteNovels(ids: number[]): Promise<void>;
  importNovels(projectId: number, data: ImportNovelInput[]): Promise<void>;
  analyzeNovelEvents(input: { projectId: number; novelIds: number[]; concurrentCount?: number }): Promise<void>;
  pollNovelEvents(ids: number[]): Promise<NovelEventState[]>;
  listScripts(projectId: number, search: string): Promise<Script[]>;
  createScript(input: Required<Omit<SaveScriptInput, "id">>): Promise<void>;
  updateScript(input: Required<Omit<SaveScriptInput, "projectId">>): Promise<void>;
  deleteScripts(ids: number[]): Promise<void>;
  importScripts(projectId: number, data: ImportScriptInput[]): Promise<void>;
  exportScripts(ids: number[]): Promise<Blob>;
  listSelectableAssets(projectId: number): Promise<ScriptAsset[]>;
  extractScriptAssets(input: { projectId: number; scriptIds: number[]; groupSize?: number }): Promise<void>;
  pollScriptAssets(ids: number[]): Promise<ScriptExtractionState[]>;
}

interface RequestClient {
  request(path: string, init?: RequestInit): Promise<unknown>;
}

type BlobRequest = (path: string, init?: RequestInit) => Promise<Blob>;

interface StoryApiOptions {
  requestBlob?: BlobRequest;
}

function post(body: unknown): RequestInit {
  return { method: "POST", body: JSON.stringify(body) };
}

function apiBaseUrl(explicitBaseUrl?: string) {
  const configured = explicitBaseUrl?.trim() || import.meta.env.VITE_HODOR_API_BASE_URL?.trim() || localStorage.getItem("hodorApiBaseUrl")?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "http://localhost:10588/api"
    : `${window.location.origin}/api`;
}

export const createAuthenticatedBlobRequest = (baseUrl?: string): BlobRequest => async (path, init = {}) => {
  const headers = new Headers(init.headers);
  const token = localStorage.getItem("token");
  if (token) headers.set("Authorization", token);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(`${apiBaseUrl(baseUrl)}/${path.replace(/^\/+/, "")}`, { ...init, headers });
  if (!response.ok) throw new Error(`Hodor 文件请求失败 (${response.status})`);
  return response.blob();
};

export function createStoryApi(client: RequestClient, options: StoryApiOptions = {}): StoryApi {
  const requestBlob = options.requestBlob ?? createAuthenticatedBlobRequest();
  return {
    async listNovels(input) {
      return (await client.request("/novel/getNovel", post(input))) as NovelListResult;
    },
    async createNovel({ projectId, ...novel }) {
      await client.request("/novel/addNovel", post({ projectId, data: [novel] }));
    },
    async updateNovel(input) {
      await client.request("/novel/updateNovel", post(input));
    },
    async deleteNovel(id) {
      await client.request("/novel/delNovel", post({ id }));
    },
    async deleteNovels(ids) {
      await client.request("/novel/batchDeleteNovel", post({ ids }));
    },
    async importNovels(projectId, data) {
      await client.request("/novel/addNovel", post({ projectId, data }));
    },
    async analyzeNovelEvents(input) {
      await client.request("/novel/event/generateEvents", post(input));
    },
    async pollNovelEvents(ids) {
      return (await client.request("/novel/getNovelEventState", post({ ids }))) as NovelEventState[];
    },
    async listScripts(projectId, search) {
      return (await client.request("/script/getScrptApi", post({ projectId, name: search }))) as Script[];
    },
    async createScript(input) {
      await client.request("/script/addScript", post(input));
    },
    async updateScript(input) {
      await client.request("/script/updateScript", post(input));
    },
    async deleteScripts(ids) {
      await client.request("/script/delScript", post({ ids }));
    },
    async importScripts(projectId, data) {
      await client.request("/script/batchAddScript", post({ projectId, data }));
    },
    exportScripts(ids) {
      return requestBlob("/script/exportScript", post({ id: ids }));
    },
    async listSelectableAssets(projectId) {
      const types = ["role", "scene", "tool"] as const;
      const results = await Promise.all(
        types.map(async (type) => {
          const result = (await client.request("/assets/getAssetsApi", post({ projectId, type, page: 1, limit: 1000 }))) as { data?: ScriptAsset[] };
          return (result.data ?? []).map((asset) => ({ id: asset.id, name: asset.name, type }));
        }),
      );
      return results.flat();
    },
    async extractScriptAssets(input) {
      await client.request("/script/extractAssets", post(input));
    },
    async pollScriptAssets(ids) {
      return (await client.request("/script/pollScriptAssets", post({ ids }))) as ScriptExtractionState[];
    },
  };
}
