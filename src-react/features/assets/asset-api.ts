import type { HodorApiClient } from "@react/lib/api/client";
import type { AssetImageHistory, AssetListQuery, AssetRecord, CreateAssetInput, CreateAudioAssetInput, ImageAssetUpdate, PromptAssetUpdate, SelectAssetImageInput, UpdateAssetInput, UpdateAudioAssetInput, UploadClipInput, VisualAssetType } from "./types";

export interface AssetListResult {
  items: AssetRecord[];
  total: number;
}

export interface AssetApi {
  listAssets(query: AssetListQuery): Promise<AssetListResult>;
  createAsset(input: CreateAssetInput): Promise<void>;
  updateAsset(input: UpdateAssetInput): Promise<void>;
  deleteAsset(id: number): Promise<void>;
  batchDeleteAssets(ids: number[]): Promise<void>;
  getImageHistory(assetsId: number): Promise<AssetImageHistory>;
  selectImage(input: SelectAssetImageInput): Promise<void>;
  deleteImage(id: number): Promise<void>;
  uploadClip(input: UploadClipInput): Promise<void>;
  createAudioAsset(input: CreateAudioAssetInput): Promise<void>;
  updateAudioAsset(input: UpdateAudioAssetInput): Promise<void>;
  retryPrompt(input: { assetsId: number; projectId: number; type: VisualAssetType; name: string; describe: string }): Promise<void>;
  retryImage(input: { projectId: number; model: string; resolution: string; id: number; type: VisualAssetType; name: string; prompt: string }): Promise<void>;
  pollImageAssets(ids: number[]): Promise<ImageAssetUpdate[]>;
  pollPromptAssets(ids: number[]): Promise<PromptAssetUpdate[]>;
}

interface AssetListResponse {
  data?: AssetRecord[];
  total?: number | string;
}

function postJson<T>(client: Pick<HodorApiClient, "request">, path: string, body: unknown): Promise<T> {
  return client.request<T>(path, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function createAssetApi(client: Pick<HodorApiClient, "request">): AssetApi {
  return {
    async listAssets(query) {
      const response = await postJson<AssetListResponse>(client, "/assets/getAssetsApi", {
        ...query,
        name: query.name || undefined,
      });
      return {
        items: Array.isArray(response.data) ? response.data : [],
        total: Number(response.total) || 0,
      };
    },

    async createAsset(input) {
      await postJson(client, "/assets/addAssets", input);
    },
    async updateAsset(input) { await postJson(client, "/assets/updateAssets", input); },
    async deleteAsset(id) { await postJson(client, "/assets/delAssets", { id }); },
    async batchDeleteAssets(ids) { await postJson(client, "/assets/batchDelete", { id: ids }); },
    getImageHistory(assetsId) { return postJson<AssetImageHistory>(client, "/assets/getImage", { assetsId }); },
    async selectImage(input) { await postJson(client, "/assets/saveAssets", input); },
    async deleteImage(id) { await postJson(client, "/assets/delImage", { id }); },
    async uploadClip(input) { await postJson(client, "/assets/uploadClip", input); },
    async createAudioAsset(input) { await postJson(client, "/assets/addAudioAssets", input); },
    async updateAudioAsset(input) { await postJson(client, "/assets/updateAudioAssets", input); },
    async retryPrompt(input) { await postJson(client, "/assetsGenerate/polishAssetsPrompt", input); },
    async retryImage(input) { await postJson(client, "/assetsGenerate/generateAssets", input); },

    pollImageAssets(ids) {
      return postJson<ImageAssetUpdate[]>(client, "/assets/pollingImageAssets", { ids });
    },

    pollPromptAssets(ids) {
      return postJson<PromptAssetUpdate[]>(client, "/assets/pollingPromptAssets", { ids });
    },
  };
}
