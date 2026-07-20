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

export interface UpdateAssetInput {
  id: number;
  name: string;
  describe: string;
  remark?: string | null;
  prompt?: string | null;
}

export interface AssetHistoryImage { id: number; filePath: string; selected?: boolean }
export interface AssetImageHistory { id: number; imageId: number | null; tempAssets: AssetHistoryImage[] }
export interface SelectAssetImageInput { id: number; projectId: number; type: VisualAssetType; imageId: number; prompt?: string | null }
export interface UploadClipInput { projectId: number; name: string; type: "clip"; base64Data: string }
export interface AudioAssetItem { id?: number; src?: string; base64?: string; prompt: string; describe: string; name: string }
export interface CreateAudioAssetInput { projectId: number; name: string; describe: string; assetsItem: AudioAssetItem[] }
export interface UpdateAudioAssetInput extends CreateAudioAssetInput { id: number }
