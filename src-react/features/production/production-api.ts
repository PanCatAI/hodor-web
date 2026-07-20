import type { HodorApiClient } from "@react/lib/api/client";
import type {
  ProductionFlowData,
  ProductionGenerationData,
  ProductionMediaItem,
  DerivedAsset,
  ImageFlowData,
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

export interface AddStoryboardInput {
  prompt: string;
  duration: number;
  state: string;
  videoDesc: string;
  shouldGenerateImage: number;
  src: string | null;
}

export interface ProductionApi {
  listScripts(projectId: number): Promise<ScriptSummary[]>;
  getFlowData(projectId: number, scriptId: number): Promise<ProductionFlowData>;
  getGenerationData(projectId: number, scriptId: number): Promise<ProductionGenerationData>;
  generateStoryboards(input: GenerateStoryboardsInput): Promise<StoryboardItem[]>;
  pollStoryboards(ids: number[]): Promise<StoryboardItem[]>;
  generateVideo(input: GenerateVideoInput): Promise<number>;
  pollVideos(projectId: number, scriptId: number, videoIds: number[]): Promise<VideoItem[]>;
  saveFlowData(projectId: number, scriptId: number, data: ProductionFlowData): Promise<void>;
  generateDerivedAssets(projectId: number, scriptId: number, assetIds: number[]): Promise<void>;
  pollDerivedAssets(ids: number[]): Promise<DerivedAsset[]>;
  deleteDerivedAsset(projectId: number, id: number): Promise<void>;
  addTrack(projectId: number, scriptId: number, duration: number): Promise<number>;
  deleteTrack(id: number): Promise<void>;
  updateTrackPrompt(id: number, prompt: string): Promise<void>;
  updateTrackDuration(id: number, duration: number): Promise<void>;
  generateVideoPrompt(projectId: number, track: VideoTrack, model: string, mode: string): Promise<string>;
  selectVideo(trackId: number, videoId: number): Promise<void>;
  deleteVideo(id: number): Promise<void>;
  previewStoryboards(storyboardIds: number[]): Promise<string>;
  editStoryboard(id: number, prompt: string, videoDesc: string): Promise<void>;
  deleteStoryboards(projectId: number, ids: number[]): Promise<void>;
  getImageFlow(id: number): Promise<ImageFlowData | null>;
  saveImageFlow(data: ImageFlowData): Promise<number>;
  updateImageFlow(flowId: number, data: ImageFlowData): Promise<void>;
  uploadFlowImage(projectId: number, scriptId: number, base64Data: string): Promise<string>;
  generateFlowImage(input: {
    model: string;
    references: string[];
    quality: string;
    ratio: string;
    prompt: string;
    projectId: number;
  }): Promise<string>;
  updateStoryboardImage(id: number, url: string, flowId: number): Promise<void>;
  addStoryboard(projectId: number, scriptId: number, input: AddStoryboardInput): Promise<number>;
  updateAssetImage(id: number, url: string, flowId: number): Promise<void>;
  getMediaLibrary(projectId: number, scriptId: number): Promise<ProductionMediaItem[]>;
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
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : value;
  switch (normalized) {
    case 0:
    case 2:
    case "生成中":
    case "处理中":
    case "排队中":
    case "pending":
    case "processing":
    case "queued":
    case "running":
      return "running";
    case 1:
    case "生成成功":
    case "已完成":
    case "成功":
    case "success":
    case "completed":
      return "completed";
    case -1:
    case "生成失败":
    case "失败":
    case "异常":
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
    duration: asNumber(record.duration),
    associateAssetsIds: asArray(record.associateAssetsIds).map((id) => asNumber(id)),
    shouldGenerateImage: asNumber(record.shouldGenerateImage),
    ...(asNumber(record.flowId) > 0 ? { flowId: asNumber(record.flowId) } : {}),
    ...(asNumber(record.trackId) > 0 ? { trackId: asNumber(record.trackId) } : {}),
  };
}

function mapDerivedAsset(value: unknown): DerivedAsset {
  const record = asRecord(value);
  const rawType = asString(record.type);
  const type = rawType === "tool" || rawType === "scene" || rawType === "clip" ? rawType : "role";
  const parentId = Number(record.assetsId);
  return {
    id: asNumber(record.id),
    assetsId: Number.isFinite(parentId) && parentId > 0 ? parentId : null,
    name: asString(record.name),
    type,
    prompt: asString(record.prompt),
    desc: asString(record.desc) || asString(record.describe),
    src: asString(record.src) || asString(record.filePath),
    state: normalizeProductionStatus(record.state),
    errorReason: asString(record.errorReason) || asString(record.reason),
    ...(asNumber(record.flowId) > 0 ? { flowId: asNumber(record.flowId) } : {}),
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
    ...(asNumber(record.duration) > 0 ? { duration: asNumber(record.duration) } : {}),
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

function mediaType(record: UnknownRecord, src: string): ProductionMediaItem["type"] | null {
  const declaredType = asString(record.fileType) || asString(record.mediaType);
  if (["video", "audio", "image"].includes(declaredType)) return declaredType as ProductionMediaItem["type"];
  const mimeType = (asString(record.contentType) || asString(record.mimeType)).toLowerCase();
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("image/")) return "image";
  const extension = src.split(/[?#]/, 1)[0].split(".").pop()?.toLowerCase();
  if (extension && ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"].includes(extension)) return "image";
  if (extension && ["mp4", "webm", "mov", "avi", "mkv"].includes(extension)) return "video";
  if (extension && ["mp3", "wav", "aac", "flac", "m4a"].includes(extension)) return "audio";
  return null;
}

function mapMediaLibrary(value: unknown): ProductionMediaItem[] {
  const record = asRecord(value);
  const uploaded = asArray(record.data).flatMap((entry) => {
    const item = asRecord(entry);
    const src = asString(item.filePath) || asString(item.src);
    const type = mediaType(item, src);
    const sourceId = asNumber(item.id);
    if (!src || !type) return [];
    return [
      {
        id: `${type}-${sourceId}`,
        sourceId,
        type,
        name: asString(item.name) || `素材 ${sourceId}`,
        src,
        duration: asNumber(item.duration, type === "image" ? 5 : 0),
      },
    ];
  });
  const generated = asArray(record.video).flatMap((track, trackIndex) => {
    const trackRecord = asRecord(track);
    const selectedId = asNumber(trackRecord.videoId);
    return asArray(trackRecord.video).flatMap((entry, videoIndex) => {
      const item = asRecord(entry);
      const sourceId = asNumber(item.id);
      const src = asString(item.filePath) || asString(item.src);
      if (!sourceId || !src) return [];
      return [
        {
          id: `video-${sourceId}`,
          sourceId,
          type: "video" as const,
          name: `分镜视频 ${trackIndex + 1}-${videoIndex + 1}`,
          src,
          duration: asNumber(item.duration),
          selected: sourceId === selectedId,
        },
      ];
    });
  });
  return [...generated, ...uploaded];
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
        Number.isFinite(media.id) && (media.sources === "storyboard" || media.sources === "assets") && Boolean(media.src) && media.selected !== false,
    )
    .map(({ id, sources }) => ({ id, sources }));

  if (mode === "text") return [];
  if (mode === "singleImage") return references.slice(0, 1);
  if (["startEndRequired", "endFrameOptional", "startFrameOptional"].includes(mode)) return references.slice(0, 2);
  return references;
}

function selectPromptMedia(track: VideoTrack, mode: string): Array<{ id: number; sources: "storyboard" | "assets" }> {
  const references = track.medias
    .filter(
      (media): media is TrackMedia & { id: number; sources: "storyboard" | "assets" } =>
        Number.isFinite(media.id) && (media.sources === "storyboard" || media.sources === "assets") && media.selected !== false,
    )
    .map(({ id, sources }) => ({ id, sources }));
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
      return {
        script: asString(data.script),
        scriptPlan: asString(data.scriptPlan),
        assets: asArray(data.assets).map((value) => {
          const asset = mapDerivedAsset(value);
          return { ...asset, derive: asArray(asRecord(value).derive).map(mapDerivedAsset) };
        }),
        storyboardTable: asString(data.storyboardTable),
        storyboard: asArray(data.storyboard).map(mapStoryboard),
        ...(isRecord(data.workbench) ? { workbench: data.workbench } : {}),
        ...(isRecord(data.layout)
          ? {
              layout: Object.fromEntries(
                Object.entries(data.layout).map(([key, value]) => [key, { x: asNumber(asRecord(value).x), y: asNumber(asRecord(value).y) }]),
              ),
            }
          : {}),
      };
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

    async generateVideo({ projectId, scriptId, track, model, mode, resolution, audio }) {
      const result = await post<unknown>(client, "/production/workbench/generateVideo", {
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
      const record = asRecord(result);
      const id = typeof result === "number" ? result : asNumber(record.taskId) || asNumber(record.id) || asNumber(record.videoId);
      if (!id) throw new Error("Pancat 视频任务没有返回视频任务 ID");
      return id;
    },

    async pollVideos(projectId, scriptId, videoIds) {
      const data = await post<unknown>(client, "/production/workbench/checkVideoStateList", { projectId, scriptId, videoIds });
      return asArray(data).map(mapVideo);
    },

    async saveFlowData(projectId, scriptId, data) {
      await post(client, "/production/saveFlowData", { projectId, episodesId: scriptId, data });
    },

    async generateDerivedAssets(projectId, scriptId, assetIds) {
      await post(client, "/production/assets/batchGenerateAssetsImage", { projectId, scriptId, assetIds, concurrentCount: 5 });
    },

    async pollDerivedAssets(ids) {
      const data = await post<unknown>(client, "/production/assets/pollingImage", { ids });
      return asArray(data).map(mapDerivedAsset);
    },

    async deleteDerivedAsset(projectId, id) {
      await post(client, "/production/assets/deleteAssetsDireve", { projectId, id });
    },

    async addTrack(projectId, scriptId, duration) {
      return asNumber(await post<unknown>(client, "/production/workbench/addTrack", { projectId, scriptId, duration }));
    },

    async deleteTrack(id) {
      await post(client, "/production/workbench/deleteTrack", { id });
    },

    async updateTrackPrompt(id, prompt) {
      await post(client, "/production/workbench/updateVideoPrompt", { id, prompt });
    },

    async updateTrackDuration(id, duration) {
      await post(client, "/production/workbench/updateVideoDuration", { id, duration });
    },

    generateVideoPrompt(projectId, track, model, mode) {
      return post<string>(client, "/production/workbench/generateVideoPrompt", {
        projectId,
        trackId: track.id,
        info: selectPromptMedia(track, mode),
        model,
        mode,
      });
    },

    async selectVideo(trackId, videoId) {
      await post(client, "/production/workbench/selectVideo", { trackId, videoId });
    },

    async deleteVideo(id) {
      await post(client, "/production/workbench/delVideo", { id });
    },

    previewStoryboards(storyboardIds) {
      return post<string>(client, "/production/storyboard/previewImage", { storyboardIds });
    },

    async editStoryboard(id, prompt, videoDesc) {
      await post(client, "/production/storyboard/editStoryboardInfo", { id, prompt, videoDesc });
    },

    async deleteStoryboards(projectId, ids) {
      await post(client, "/production/storyboard/batchDelete", { projectId, ids });
    },

    async getImageFlow(id) {
      const data = await post<unknown>(client, "/production/editImage/getImageFlow", { id });
      return isRecord(data) ? (data as unknown as ImageFlowData) : null;
    },

    async saveImageFlow(data) {
      const result = asRecord(await post<unknown>(client, "/production/editImage/saveImageFlow", { nodes: data.nodes, edges: data.edges }));
      return asNumber(result.id);
    },

    async updateImageFlow(flowId, data) {
      await post(client, "/production/editImage/updateImageFlow", { nodes: data.nodes, edges: data.edges, flowId });
    },

    uploadFlowImage(projectId, scriptId, base64Data) {
      return post<string>(client, "/production/editImage/uploadImage", { projectId, scriptId, base64Data });
    },

    async generateFlowImage(input) {
      const result = asRecord(await post<unknown>(client, "/production/editImage/generateFlowImage", input));
      const url = asString(result.url);
      if (!url) throw new Error("图片工作流没有返回图片地址");
      return url;
    },

    async updateStoryboardImage(id, url, flowId) {
      await post(client, "/production/storyboard/updateStoryboardUrl", { id, url, flowId });
    },

    async addStoryboard(projectId, scriptId, input) {
      const result = asRecord(await post<unknown>(client, "/production/storyboard/addStoryboard", { ...input, projectId, scriptId }));
      const id = asNumber(result.id);
      if (!id) throw new Error("新增分镜没有返回分镜 ID");
      return id;
    },

    async updateAssetImage(id, url, flowId) {
      await post(client, "/production/assets/updateAssetsUrl", { id, url, flowId });
    },

    async getMediaLibrary(projectId, scriptId) {
      const data = await post<unknown>(client, "/assets/getMaterialData", { projectId, scriptId });
      return mapMediaLibrary(data);
    },
  };
}
