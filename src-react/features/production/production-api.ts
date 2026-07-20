import type { HodorApiClient } from "@react/lib/api/client";
import type {
  ProductionFlowData,
  ProductionGenerationData,
  ProductionState,
  ScriptSummary,
  StoryboardItem,
  TrackMedia,
  VideoItem,
  VideoTrack,
} from "./types";

type UnknownRecord = Record<string, unknown>;

export interface GenerateStoryboardsInput {
  projectId: number;
  scriptId: number;
  storyboardIds: number[];
}

export interface GenerateVideoInput {
  projectId: number;
  scriptId: number;
  track: VideoTrack;
  model: string;
  mode: string;
  resolution: string;
  audio: boolean;
}

export interface ProductionApi {
  listScripts(projectId: number): Promise<ScriptSummary[]>;
  getFlowData(projectId: number, scriptId: number): Promise<ProductionFlowData>;
  getGenerationData(projectId: number, scriptId: number): Promise<ProductionGenerationData>;
  generateStoryboards(input: GenerateStoryboardsInput): Promise<StoryboardItem[]>;
  pollStoryboards(ids: number[]): Promise<StoryboardItem[]>;
  generateVideo(input: GenerateVideoInput): Promise<number>;
  pollVideos(projectId: number, scriptId: number, videoIds: number[]): Promise<VideoItem[]>;
}

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asRecord(value: unknown): UnknownRecord {
  return isRecord(value) ? value : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function normalizeProductionStatus(value: unknown): ProductionState {
  switch (value) {
    case "生成中":
    case "pending":
    case "running":
      return "running";
    case "生成成功":
    case "已完成":
    case "success":
    case "completed":
      return "completed";
    case "生成失败":
    case "error":
    case "failed":
      return "failed";
    default:
      return "idle";
  }
}

function mapScript(value: unknown): ScriptSummary {
  const record = asRecord(value);
  return {
    id: asNumber(record.id),
    name: asString(record.name) || `剧本 ${asNumber(record.id)}`,
    content: asString(record.content),
    state: normalizeProductionStatus(record.extractState),
    errorReason: asString(record.errorReason),
  };
}

function mapStoryboard(value: unknown): StoryboardItem {
  const record = asRecord(value);
  return {
    id: asNumber(record.id),
    index: asNumber(record.index),
    prompt: asString(record.prompt),
    videoDesc: asString(record.videoDesc),
    src: asString(record.src) || asString(record.filePath),
    state: normalizeProductionStatus(record.state),
    errorReason: asString(record.errorReason) || asString(record.reason),
  };
}

function mapMedia(value: unknown): TrackMedia {
  const record = asRecord(value);
  const source = record.sources === "storyboard" || record.sources === "assets" ? record.sources : undefined;
  const fileType = record.fileType === "video" || record.fileType === "audio" ? record.fileType : "image";
  const id = Number(record.id);
  return {
    ...(Number.isFinite(id) ? { id } : {}),
    ...(source ? { sources: source } : {}),
    fileType,
    src: asString(record.src),
    name: asString(record.name),
    prompt: asString(record.prompt),
  };
}

function mapVideo(value: unknown): VideoItem {
  const record = asRecord(value);
  return {
    id: asNumber(record.id),
    src: asString(record.src) || asString(record.filePath),
    state: normalizeProductionStatus(record.state),
    errorReason: asString(record.errorReason) || asString(record.reason),
  };
}

function mapTrack(value: unknown): VideoTrack {
  const record = asRecord(value);
  const selectedVideoId = Number(record.selectVideoId);
  return {
    id: asNumber(record.id),
    prompt: asString(record.prompt),
    state: normalizeProductionStatus(record.state),
    errorReason: asString(record.errorReason) || asString(record.reason),
    duration: asNumber(record.duration, 5),
    medias: asArray(record.medias).map(mapMedia),
    videoList: asArray(record.videoList).map(mapVideo),
    ...(Number.isFinite(selectedVideoId) && selectedVideoId > 0 ? { selectVideoId: selectedVideoId } : {}),
  };
}

function post<T>(client: HodorApiClient, path: string, body: UnknownRecord): Promise<T> {
  return client.request<T>(path, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function selectReferenceMedia(track: VideoTrack, mode: string): Array<{ id: number; sources: "storyboard" | "assets" }> {
  const references = track.medias
    .filter(
      (media): media is TrackMedia & { id: number; sources: "storyboard" | "assets" } =>
        Number.isFinite(media.id) && (media.sources === "storyboard" || media.sources === "assets") && Boolean(media.src),
    )
    .map(({ id, sources }) => ({ id, sources }));

  if (mode === "text") return [];
  if (mode === "singleImage") return references.slice(0, 1);
  if (["startEndRequired", "endFrameOptional", "startFrameOptional"].includes(mode)) return references.slice(0, 2);
  return references;
}

export function createProductionApi(client: HodorApiClient): ProductionApi {
  return {
    async listScripts(projectId) {
      const data = await post<unknown>(client, "/script/getScrptApi", { projectId, name: "" });
      return asArray(data).map(mapScript);
    },

    async getFlowData(projectId, scriptId) {
      const data = asRecord(await post<unknown>(client, "/production/getFlowData", { projectId, episodesId: scriptId }));
      return { storyboard: asArray(data.storyboard).map(mapStoryboard) };
    },

    async getGenerationData(projectId, scriptId) {
      const data = await post<unknown>(client, "/production/workbench/getGenerateData", { projectId, scriptId });
      if (!isRecord(data)) throw new Error(asString(data) || "生产工作台数据格式错误");
      return {
        storyboardList: asArray(data.storyboardList).map(mapStoryboard),
        trackList: asArray(data.trackList).map(mapTrack),
      };
    },

    async generateStoryboards({ projectId, scriptId, storyboardIds }) {
      const data = await post<unknown>(client, "/production/storyboard/batchGenerateImage", {
        projectId,
        scriptId,
        storyboardIds,
        concurrentCount: 5,
        compulsory: true,
      });
      return asArray(data).map(mapStoryboard);
    },

    async pollStoryboards(ids) {
      const data = await post<unknown>(client, "/production/storyboard/pollingImage", { ids });
      return asArray(data).map(mapStoryboard);
    },

    generateVideo({ projectId, scriptId, track, model, mode, resolution, audio }) {
      return post<number>(client, "/production/workbench/generateVideo", {
        projectId,
        scriptId,
        uploadData: selectReferenceMedia(track, mode),
        prompt: track.prompt,
        model,
        mode,
        resolution,
        duration: track.duration,
        audio,
        trackId: track.id,
      });
    },

    async pollVideos(projectId, scriptId, videoIds) {
      const data = await post<unknown>(client, "/production/workbench/checkVideoStateList", { projectId, scriptId, videoIds });
      return asArray(data).map(mapVideo);
    },
  };
}
