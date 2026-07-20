export const ASSET_TYPES = ["role", "tool", "scene", "clip", "audio"] as const;

export type AssetType = (typeof ASSET_TYPES)[number];
export type VisualAssetType = Extract<AssetType, "role" | "tool" | "scene">;

export interface AssetRecord {
  id: number;
  assetsId: number | null;
  name: string;
  type: AssetType;
  describe?: string | null;
  remark?: string | null;
  prompt?: string | null;
  src?: string | null;
  filePath?: string | null;
  state?: string | null;
  promptState?: string | null;
  imageId?: number | null;
  startTime?: number | string | null;
  errorReason?: string | null;
  sonAssets?: AssetRecord[];
}

export interface AssetListQuery {
  projectId: number;
  type: AssetType;
  name?: string;
  page: number;
  limit: number;
}

export interface CreateAssetInput {
  projectId: number;
  type: VisualAssetType;
  name: string;
  describe: string;
  remark: string;
  prompt: string;
}

export interface ImageAssetUpdate {
  id: number;
  state: string;
  filePath?: string | null;
  src?: string | null;
  errorReason?: string | null;
}

export interface PromptAssetUpdate {
  id: number;
  promptState: string;
  prompt?: string | null;
}
