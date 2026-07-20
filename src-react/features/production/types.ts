export type ProductionState = "idle" | "running" | "completed" | "failed";

export interface ProductionProject {
  id: number;
  name: string;
  videoModel: string;
  videoMode: string;
  videoResolution?: string;
  videoAudio?: boolean;
}

export interface ScriptSummary {
  id: number;
  name: string;
  content: string;
  state: ProductionState;
  errorReason: string;
}

export interface StoryboardItem {
  id: number;
  index: number;
  prompt: string;
  videoDesc: string;
  src: string;
  state: ProductionState;
  errorReason: string;
}

export interface TrackMedia {
  id?: number;
  sources?: "storyboard" | "assets";
  fileType: "image" | "video" | "audio";
  src: string;
  name?: string;
  prompt?: string;
}

export interface VideoItem {
  id: number;
  src: string;
  state: ProductionState;
  errorReason: string;
}

export interface VideoTrack {
  id: number;
  prompt: string;
  state: ProductionState;
  errorReason?: string;
  duration: number;
  medias: TrackMedia[];
  videoList: VideoItem[];
  selectVideoId?: number | null;
}

export interface ProductionFlowData {
  storyboard: StoryboardItem[];
}

export interface ProductionGenerationData {
  storyboardList: StoryboardItem[];
  trackList: VideoTrack[];
}
