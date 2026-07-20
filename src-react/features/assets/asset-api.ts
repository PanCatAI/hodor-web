import type { HodorApiClient } from "@react/lib/api/client";
import type { AssetListQuery, AssetRecord, CreateAssetInput, ImageAssetUpdate, PromptAssetUpdate } from "./types";

export interface AssetListResult {
  items: AssetRecord[];
  total: number;
}

export interface AssetApi {
  listAssets(query: AssetListQuery): Promise<AssetListResult>;
  createAsset(input: CreateAssetInput): Promise<void>;
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

    pollImageAssets(ids) {
      return postJson<ImageAssetUpdate[]>(client, "/assets/pollingImageAssets", { ids });
    },

    pollPromptAssets(ids) {
      return postJson<PromptAssetUpdate[]>(client, "/assets/pollingPromptAssets", { ids });
    },
  };
}
