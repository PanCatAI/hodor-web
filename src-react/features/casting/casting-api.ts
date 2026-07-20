import type { AudioStateUpdate, CastingAsset, CastingAssetType, ImageStateUpdate, PromptStateUpdate } from "./types";

interface RequestClient {
  request(path: string, init?: RequestInit): Promise<unknown>;
}

export interface CastingListInput {
  projectId: number;
  types: CastingAssetType[];
}

export interface BatchPolishInput {
  projectId: number;
  items: Array<{ assetsId: number; type: CastingAssetType; name: string; describe: string }>;
  concurrentCount: number;
  otherTextPrompt: string;
}

export interface BatchGenerateImagesInput {
  projectId: number;
  model: string;
  resolution: string;
  concurrentCount: number;
  items: Array<{ id: number; type: CastingAssetType; name: string; prompt: string }>;
}

export interface BindAudioInput {
  projectId: number;
  assetsIds: number[];
  concurrentCount: number;
}

export interface CancelAssetInput {
  projectId: number;
  assetId: number;
  types: CastingAssetType[];
}

export interface CastingApi {
  listAssets(input: CastingListInput): Promise<CastingAsset[]>;
  batchPolish(input: BatchPolishInput): Promise<void>;
  batchGenerateImages(input: BatchGenerateImagesInput): Promise<void>;
  cancelAsset(input: CancelAssetInput): Promise<void>;
  bindAudio(input: BindAudioInput): Promise<void>;
  pollPrompts(ids: number[]): Promise<PromptStateUpdate[]>;
  pollImages(ids: number[]): Promise<ImageStateUpdate[]>;
  pollAudio(ids: number[]): Promise<AudioStateUpdate[]>;
  selectHistoryImage(input: { id: number; projectId: number; type: CastingAssetType; imageId: number; prompt?: string }): Promise<void>;
  deleteHistoryImage(id: number): Promise<void>;
  updateAssetAudio(input: { assetsId: number; audioIds: number[] }): Promise<void>;
  retryPrompt(input: { assetsId: number; projectId: number; type: CastingAssetType; name: string; describe: string }): Promise<void>;
  retryImage(input: { projectId: number; model: string; resolution: string; id: number; type: CastingAssetType; name: string; prompt: string }): Promise<void>;
  listAudioAssets(projectId: number): Promise<Array<{ id: number; name: string }>>;
}

function post(client: RequestClient, path: string, body: unknown): Promise<unknown> {
  return client.request(path, { method: "POST", body: JSON.stringify(body) });
}

export function createCastingApi(client: RequestClient): CastingApi {
  const listAssets = async ({ projectId, types }: CastingListInput): Promise<CastingAsset[]> => {
    const response = await post(client, "/cornerScape/getAllAssets", { projectId, type: types });
    return Array.isArray(response) ? (response as CastingAsset[]) : [];
  };

  return {
    listAssets,
    async batchPolish(input) {
      await post(client, "/assetsGenerate/batchPolishAssetsPrompt", input);
    },
    async batchGenerateImages(input) {
      await post(client, "/assetsGenerate/batchGenerateImageAssets", input);
    },
    async cancelAsset({ projectId, assetId, types }) {
      const assets = await listAssets({ projectId, types });
      const imageId = assets.find((asset) => asset.id === assetId)?.imageId;
      if (!imageId) throw new Error("没有可取消的图片任务");
      await post(client, "/assetsGenerate/cancelGenerate", { id: imageId });
    },
    async bindAudio(input) {
      await post(client, "/cornerScape/batchBindAudio", input);
    },
    async selectHistoryImage(input) { await post(client, "/assets/saveAssets", input); },
    async deleteHistoryImage(id) { await post(client, "/assets/delImage", { id }); },
    async updateAssetAudio(input) { await post(client, "/cornerScape/updateAssetsAudio", input); },
    async retryPrompt(input) { await post(client, "/assetsGenerate/polishAssetsPrompt", input); },
    async retryImage(input) { await post(client, "/assetsGenerate/generateAssets", input); },
    async listAudioAssets(projectId) {
      const response = (await post(client, "/assets/getAssetsApi", { projectId, type: "audio", page: 1, limit: 1000 })) as { data?: Array<{ id: number; name: string }> };
      return Array.isArray(response?.data) ? response.data : [];
    },
    async pollPrompts(ids) {
      const response = await post(client, "/assets/pollingPromptAssets", { ids });
      return Array.isArray(response) ? (response as PromptStateUpdate[]) : [];
    },
    async pollImages(ids) {
      const response = await post(client, "/assets/pollingImageAssets", { ids });
      return Array.isArray(response) ? (response as ImageStateUpdate[]) : [];
    },
    async pollAudio(ids) {
      const response = await post(client, "/cornerScape/pollingAudio", { ids });
      return Array.isArray(response) ? (response as AudioStateUpdate[]) : [];
    },
  };
}
