export type CastingAssetType = "role" | "scene" | "tool";

export interface CastingImage {
  id: number;
  filePath: string;
}

export interface CastingAudio {
  id: number;
  name: string;
}

export interface CastingAsset {
  id: number;
  imageId?: number;
  type: CastingAssetType;
  name: string;
  describe?: string;
  prompt?: string;
  filePath?: string | null;
  state?: string;
  promptState?: string;
  audioBindState?: string;
  errorReason?: string;
  promptErrorReason?: string;
  model?: string;
  resolution?: string;
  historyImages?: CastingImage[];
  relepedAudio?: CastingAudio[];
}

export interface PromptStateUpdate {
  id: number;
  promptState: string;
  prompt?: string;
}

export interface ImageStateUpdate {
  id: number;
  state: string;
  filePath?: string;
  errorReason?: string;
}

export interface AudioStateUpdate {
  id: number;
  audioBindState: string;
  filePath?: string;
}
