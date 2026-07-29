export type ProductionState = "idle" | "running" | "completed" | "failed";
export type ProductionVideoRatio = "16:9" | "1:1" | "9:16";
export type ProductionStageTarget = "source" | "script" | "assets" | "storyboard";
export type ProductionWorkbenchView = "preview" | "generate" | "editVideo";

export interface ProductionProject {
  id: number;
  name: string;
  imageModel?: string;
  videoModel: string;
  videoMode: string;
  videoRatio?: ProductionVideoRatio;
  videoResolution?: string;
  videoAudio?: boolean;
}

export type ProductionVideoReferenceMode = "videoReference" | "imageReference" | "audioReference" | "textReference";
export type ProductionVideoMode = string | ProductionVideoReferenceMode[];

export interface ProductionVideoModelOption {
  id: string;
  label: string;
  vendorName: string;
}

export interface ProductionDurationResolution {
  duration: number[];
  resolution: string[];
}

export interface ProductionVideoModelDetail {
  name: string;
  modelName: string;
  type: "video";
  mode: ProductionVideoMode[];
  audio: boolean | "optional";
  durationResolutionMap: ProductionDurationResolution[];
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
  duration?: number;
  associateAssetsIds?: number[];
  shouldGenerateImage?: number;
  flowId?: number;
  trackId?: number;
}

export interface DerivedAsset {
  id: number;
  assetsId: number | null;
  name: string;
  type: "role" | "tool" | "scene" | "clip";
  prompt: string;
  desc: string;
  src: string;
  state: ProductionState;
  errorReason: string;
  flowId?: number;
}

export interface ProductionAsset extends Omit<DerivedAsset, "assetsId"> {
  derive: DerivedAsset[];
}

export interface FlowNodePosition {
  x: number;
  y: number;
}

export interface TrackMedia {
  id?: number;
  sources?: "storyboard" | "assets";
  fileType: "image" | "video" | "audio";
  src: string;
  name?: string;
  prompt?: string;
  selected?: boolean;
}

export interface VideoItem {
  id: number;
  src: string;
  state: ProductionState;
  errorReason: string;
  duration?: number;
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

export interface ProductionSourceChapter {
  id: number;
  chapterIndex: number;
  chapter: string;
  contentPreview?: string;
  charCount?: number;
  eventState: number;
  errorReason: string;
}

export interface ProductionSourceData {
  chapters: ProductionSourceChapter[];
  state: ProductionState;
}

export interface ProductionTimelineData {
  id: number | null;
  revision: number;
  status: ProductionState;
  clips: import("./webav-video-editor").WebAvEditorClip[];
  errorReason: string;
  updatedAt: string | null;
}

export interface ProductionFinalOutput {
  id: number;
  state: ProductionState;
  src: string;
  duration: number;
  size: number;
  checksum: string;
  errorReason: string;
  createdAt: string;
}

export interface ProductionSceneWorldAsset {
  id: number;
  projectId: number;
  sourceSceneAssetId: number;
  storyboardId: number;
  provider: "worldlabs-marble";
  providerWorldId: string;
  model: string;
  status: "submitting" | "running" | "succeeded" | "failed";
  prompt: string;
  displayName: string;
  worldJobId: string;
  panoramaUrl: string;
  colliderMeshUrl: string;
  spzUrls: Record<string, string>;
  thumbnailUrl: string;
  caption: string;
  semantics: {
    metricScaleFactor: number;
    groundPlaneOffset: number;
  };
  error: string;
  createdAt: string;
  updatedAt: string;
}

export type PrevisVector3 = [number, number, number];

export interface ProductionPrevisShotContract {
  schemaVersion: "1";
  projectId: number;
  scriptId: number;
  storyboardId: number;
  name: string;
  durationSeconds: number;
  output: { width: number; height: number; fps: number };
  scene: {
    worldAssetId?: number;
    colliderMeshUrl?: string;
    panoramaUrl?: string;
    backgroundColor: string;
  };
  actors: Array<{
    id: string;
    name: string;
    sourceAssetId?: number;
    scale: PrevisVector3;
    keyframes: Array<{
      frame: number;
      position: PrevisVector3;
      rotationEuler: PrevisVector3;
      pose?: string;
    }>;
  }>;
  props: Array<{
    id: string;
    name: string;
    sourceAssetId?: number;
    position: PrevisVector3;
    rotationEuler: PrevisVector3;
    scale: PrevisVector3;
  }>;
  camera: {
    lensMm: number;
    keyframes: Array<{
      frame: number;
      position: PrevisVector3;
      target: PrevisVector3;
    }>;
  };
}

export interface ProductionPrevisResult {
  schemaVersion: "1";
  previewVideoKey: string;
  previewVideoUrl: string;
  firstFrameKey: string;
  firstFrameUrl: string;
  lastFrameKey: string;
  lastFrameUrl: string;
  manifestKey: string;
  manifestUrl: string;
  width: number;
  height: number;
  fps: number;
  frameCount: number;
  durationSeconds: number;
}

export interface ProductionPrevisRender {
  renderId: string;
  jobId: string;
  projectId: number;
  scriptId: number;
  storyboardId: number;
  status: ProductionState;
  progress: number;
  attempt: number;
  errorReason: string;
  contract: ProductionPrevisShotContract;
  result: ProductionPrevisResult | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProductionFlowData {
  [key: string]: unknown;
  source: ProductionSourceData;
  script: string;
  scriptPlan: string;
  assets: ProductionAsset[];
  worldAssets?: ProductionSceneWorldAsset[];
  previsRenders?: ProductionPrevisRender[];
  storyboardTable: string;
  storyboard: StoryboardItem[];
  videoTracks: VideoTrack[];
  timeline: ProductionTimelineData;
  finalOutputs: ProductionFinalOutput[];
  workbench?: Record<string, unknown>;
  layout?: Record<string, FlowNodePosition>;
}

export interface ProductionGenerationData {
  storyboardList: StoryboardItem[];
  trackList: VideoTrack[];
}

export interface ProductionMediaItem {
  id: string;
  sourceId: number;
  type: "video" | "audio" | "image";
  name: string;
  src: string;
  duration: number;
  selected?: boolean;
}

export interface ImageFlowNode {
  id: string;
  type: "upload" | "generated";
  position: FlowNodePosition;
  data: {
    image?: string;
    generatedImage?: string;
    prompt?: string;
    model?: string;
    quality?: string;
    ratio?: string;
    references?: Array<{ image: string }>;
  };
}

export interface ImageFlowEdge {
  id: string;
  source: string;
  target: string;
}

export interface ImageFlowData {
  id?: number;
  nodes: ImageFlowNode[];
  edges: ImageFlowEdge[];
}
