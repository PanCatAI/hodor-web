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
}

interface RequestClient {
  request(path: string, init?: RequestInit): Promise<unknown>;
}

function post(body: unknown): RequestInit {
  return { method: "POST", body: JSON.stringify(body) };
}

export function createStoryboardApi(client: RequestClient): StoryboardApi {
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
  };
}
