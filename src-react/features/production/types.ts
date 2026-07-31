export type ProductionState = "idle" | "running" | "completed" | "failed";
export type ProductionVideoRatio = "16:9" | "1:1" | "9:16";
import type { ProjectWorldProfile } from "@react/features/world-profile/world-profile-fields";

export type CoverageVector3 = [number, number, number];
export type CoverageCameraRole =
  | "MASTER"
  | "TWO_SHOT"
  | "OTS_A"
  | "OTS_B"
  | "SINGLE_A"
  | "SINGLE_B"
  | "REACTION_A"
  | "REACTION_B"
  | "INSERT"
  | "BRIDGE";
export type CoverageShotSize = "extreme-wide" | "wide" | "medium" | "close-up" | "extreme-close-up";
export type CoverageCameraStatus = "planned" | "queued" | "rendering" | "previs-ready" | "generating" | "ready" | "failed";

export interface BlockingPlan {
  schemaVersion: "1";
  sceneId: string;
  performanceTakeId: string;
  durationSeconds: number;
  fps: number;
  axis: { fromActorId: string; toActorId: string; allowedSide: "left" | "right" };
  actorAnchors: Array<{
    actorId: string;
    anchorId: string;
    position: CoverageVector3;
    rotationEuler: CoverageVector3;
    lookAtActorId?: string;
  }>;
  beats: Array<{
    id: string;
    startFrame: number;
    endFrame: number;
    speakerId?: string;
    reactionActorIds: string[];
    intensity: number;
    action: string;
  }>;
}

export interface CinematicCoveragePlan {
  schemaVersion: "1";
  coverageId: string;
  projectId: number;
  scriptId: number;
  storyboardId: number;
  presetId: string;
  blocking: BlockingPlan;
  cameras: Array<{
    cameraId: string;
    role: CoverageCameraRole;
    shotSize: CoverageShotSize;
    lensMm: number;
    subjects: string[];
    foregroundSubjects: string[];
    activeBeatIds: string[];
    handlesFrames: number;
    language: string;
  }>;
  editPolicy: {
    startWide: boolean;
    preferListenerOnReveal: boolean;
    reserveCloseUpUntilIntensity: number;
    minimumShotFrames: number;
  };
}

export interface CoverageMediaAsset {
  key: string;
  url: string;
}

export interface CoverageTimedMediaAsset extends CoverageMediaAsset {
  frame: number;
}

export interface CoverageBundle {
  schemaVersion: "1";
  coverageId: string;
  sceneId: string;
  performanceTakeId: string;
  durationSeconds: number;
  fps: number;
  frameCount: number;
  cameras: Array<{
    cameraId: string;
    role: CoverageCameraRole;
    startFrame: number;
    endFrame: number;
    beatIds: string[];
    subjects: string[];
    status: CoverageCameraStatus;
    renderId?: string;
    videoId?: number;
    assets?: {
      previewVideo?: CoverageMediaAsset;
      firstFrame?: CoverageMediaAsset;
      lastFrame?: CoverageMediaAsset;
      controlFrames?: CoverageTimedMediaAsset[];
      depthMaps?: CoverageTimedMediaAsset[];
      masks?: CoverageTimedMediaAsset[];
      manifest?: CoverageMediaAsset;
    };
    quality?: {
      status: "pending" | "passed" | "failed";
      score?: number;
      issues: Array<{ code: string; severity: "warning" | "error"; message: string }>;
    };
    retry?: { attempt: number; maxAttempts: number; lastError?: string; lastAttemptAt?: string };
  }>;
}

export interface RecommendedCut {
  schemaVersion: "1";
  coverageId: string;
  performanceTakeId: string;
  fps: number;
  durationFrames: number;
  clips: Array<{
    id: string;
    cameraId: string;
    startFrame: number;
    endFrame: number;
    sourceInFrame: number;
    sourceOutFrame: number;
    videoId: number;
  }>;
}

export interface CinematicCoverageAggregate {
  schemaVersion: "1";
  coverageId: string;
  projectId: number;
  scriptId: number;
  storyboardId: number;
  status: ProductionState;
  version: number;
  updatedAt?: string;
  timelineRevision?: number;
  plan: CinematicCoveragePlan;
  bundle: CoverageBundle | null;
  recommendedCut: RecommendedCut | null;
  error: { code?: string; message: string } | null;
  pollError?: { message: string } | null;
}

export interface CoverageOtioExport {
  fileName: string;
  mediaType: string;
  document: unknown;
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
  semantics: { metricScaleFactor: number; groundPlaneOffset: number };
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
  scene: { worldAssetId?: number; colliderMeshUrl?: string; panoramaUrl?: string; backgroundColor: string };
  actors: Array<{
    id: string; name: string; sourceAssetId?: number; scale: PrevisVector3;
    keyframes: Array<{ frame: number; position: PrevisVector3; rotationEuler: PrevisVector3; pose?: string }>;
  }>;
  props: Array<{ id: string; name: string; sourceAssetId?: number; position: PrevisVector3; rotationEuler: PrevisVector3; scale: PrevisVector3 }>;
  camera: { lensMm: number; keyframes: Array<{ frame: number; position: PrevisVector3; target: PrevisVector3 }> };
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
  result: null | {
    schemaVersion: "1";
    previewVideoKey: string; previewVideoUrl: string;
    firstFrameKey: string; firstFrameUrl: string;
    lastFrameKey: string; lastFrameUrl: string;
    manifestKey: string; manifestUrl: string;
    width: number; height: number; fps: number; frameCount: number; durationSeconds: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface ProductionProject {
  id: number;
  name: string;
  imageModel?: string;
  videoModel: string;
  videoMode: string;
  videoRatio?: ProductionVideoRatio;
  videoResolution?: string;
  videoAudio?: boolean;
  worldProfile?: ProjectWorldProfile | null;
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

export interface ProductionFlowData {
  [key: string]: unknown;
  script: string;
  scriptPlan: string;
  assets: ProductionAsset[];
  storyboardTable: string;
  storyboard: StoryboardItem[];
  worldAssets?: ProductionSceneWorldAsset[];
  previsRenders?: ProductionPrevisRender[];
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
