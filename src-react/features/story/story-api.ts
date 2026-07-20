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
  listScripts(projectId: number, search: string): Promise<Script[]>;
  createScript(input: Required<Omit<SaveScriptInput, "id">>): Promise<void>;
  updateScript(input: Required<Omit<SaveScriptInput, "projectId">>): Promise<void>;
  deleteScripts(ids: number[]): Promise<void>;
}

interface RequestClient {
  request(path: string, init?: RequestInit): Promise<unknown>;
}

function post(body: unknown): RequestInit {
  return { method: "POST", body: JSON.stringify(body) };
}

export function createStoryApi(client: RequestClient): StoryApi {
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
  };
}
