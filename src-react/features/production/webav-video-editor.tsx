import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Download, FilePlus2, Film, LoaderCircle, Pause, Play, Trash2, Type, X } from "lucide-react";

import type { VideoItem } from "./types";
import {
  createWebAvEditorHistory,
  getWebAvEffectKeyframes,
  pushWebAvEditorHistory,
  redoWebAvEditorHistory,
  resetWebAvEditorHistory,
  undoWebAvEditorHistory,
  type WebAvEditorHistoryState,
  type WebAvEffectType,
} from "./webav-editor-history";

export type WebAvMediaType = "video" | "audio" | "image" | "text";
export type WebAvFilter = "none" | "grayscale" | "sepia" | "warm" | "cool" | "contrast";
export type WebAvTransition = "none" | "fade" | "dissolve" | "slide" | "wipe" | "zoom" | "rotate";
export type WebAvEffect = "none" | "fadeIn" | "fadeOut" | "pulse" | "rotateIn";

export interface WebAvEditorClip {
  id: string;
  sourceId?: number;
  type: WebAvMediaType;
  name: string;
  src?: string;
  text?: string;
  sourceDuration?: number;
  trimStart: number;
  trimEnd?: number;
  startAt?: number;
  playbackRate: number;
  volume: number;
  opacity: number;
  filter: WebAvFilter;
  transition: WebAvTransition;
  transitionDuration: number;
  fadeIn?: number;
  fadeOut?: number;
  fontSize?: number;
  rect?: { x: number; y: number; w?: number; h?: number; angle?: number };
  zIndex?: number;
  effect?: WebAvEffect;
}

export interface WebAvVideoEditorProps {
  clips: VideoItem[];
  videoRatio?: string;
  initialOverlays?: WebAvEditorClip[];
  mediaLibrary?: WebAvEditorClip[];
  onClipsChange?: (clips: VideoItem[]) => void;
  onTimelineChange?: (clips: WebAvEditorClip[]) => void;
}

interface TimelineEntry {
  start: number;
  duration: number;
  end: number;
}

interface TimelineCalculation {
  byId: Record<string, TimelineEntry>;
  duration: number;
}

type WebAvCombinator = {
  destroy?(): void;
  on?(type: "OutputProgress" | "error", listener: ((progress: number) => void) | ((error: Error) => void)): () => void;
  output(options?: { maxTime?: number }): ReadableStream<Uint8Array>;
};

type WebAvCanvasRuntime = {
  addSprite(sprite: unknown): Promise<void>;
  createCombinator(): Promise<WebAvCombinator>;
  destroy(): void;
  on?(type: string, listener: (value?: any) => void): () => void;
  pause(): void;
  play(options: { start: number; end?: number; playbackRate?: number }): void;
  previewFrame(time: number): Promise<void>;
};

const STILL_DURATION = 3;

export interface WebAvCanvasSize {
  width: number;
  height: number;
}

export function resolveWebAvCanvasSize(videoRatio: string | null | undefined): WebAvCanvasSize {
  if (videoRatio === "1:1") return { width: 1080, height: 1080 };
  if (videoRatio === "9:16") return { width: 1080, height: 1920 };
  return { width: 1920, height: 1080 };
}

export function supportsWebAvRuntime(target: typeof globalThis = globalThis): boolean {
  return typeof target.VideoFrame !== "undefined";
}

export function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function radiansToDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

export function sampleWaveform(samples: Float32Array, bars = 48): number[] {
  if (samples.length === 0 || bars <= 0) return [];
  const result: number[] = [];
  const width = Math.max(1, Math.ceil(samples.length / bars));
  for (let start = 0; start < samples.length; start += width) {
    let peak = 0;
    for (let index = start; index < Math.min(samples.length, start + width); index += 1) peak = Math.max(peak, Math.abs(samples[index]));
    result.push(Number(peak.toFixed(4)));
  }
  return result;
}

function positive(value: number | undefined, fallback = 0): number {
  return Number.isFinite(value) && (value ?? 0) > 0 ? Number(value) : fallback;
}

function editableDuration(clip: WebAvEditorClip): number {
  const end = positive(clip.trimEnd, positive(clip.sourceDuration));
  const raw = Math.max(0, end - Math.max(0, clip.trimStart));
  if (clip.type === "video" || clip.type === "audio") return raw / Math.max(0.1, positive(clip.playbackRate, 1));
  return raw;
}

export function calculateTimeline(clips: WebAvEditorClip[], startOverrides: Record<string, number> = {}): TimelineCalculation {
  const byId: Record<string, TimelineEntry> = {};
  let visualCursor = 0;
  let duration = 0;
  for (const clip of clips) {
    const clipDuration = editableDuration(clip);
    const explicitStart = startOverrides[clip.id] ?? clip.startAt;
    const sequential = clip.type === "video" && explicitStart == null;
    const overlap = sequential && visualCursor > 0 && clip.transition !== "none" ? Math.min(clipDuration, Math.max(0, clip.transitionDuration)) : 0;
    const start = Math.max(0, sequential ? visualCursor - overlap : (explicitStart ?? 0));
    const end = start + clipDuration;
    byId[clip.id] = { start, duration: clipDuration, end };
    if (sequential) visualCursor = end;
    duration = Math.max(duration, end);
  }
  return { byId, duration };
}

export function formatWebAvError(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError") return "操作已取消";
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error !== null) {
    const value = error as { message?: unknown; error?: unknown };
    if (typeof value.message === "string" && value.message) return value.message;
    if (value.error) return formatWebAvError(value.error);
  }
  if (typeof error === "string" && error) {
    const title = error.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();
    return (
      title ||
      error
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim() ||
      "WebAV 操作失败"
    );
  }
  return "WebAV 操作失败";
}

function abortError(): DOMException {
  return new DOMException("操作已取消", "AbortError");
}

export async function readWebAvOutput(
  stream: ReadableStream<Uint8Array>,
  options: { signal?: AbortSignal; onBytes?: (bytes: number) => void } = {},
): Promise<Blob> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let aborted = options.signal?.aborted === true;
  const handleAbort = () => {
    aborted = true;
    void reader.cancel(abortError());
  };
  options.signal?.addEventListener("abort", handleAbort, { once: true });
  if (aborted) handleAbort();
  try {
    while (true) {
      if (aborted) throw abortError();
      const { done, value } = await reader.read();
      if (aborted) throw abortError();
      if (done) break;
      if (value?.byteLength) {
        chunks.push(value);
        bytes += value.byteLength;
        options.onBytes?.(bytes);
      }
    }
  } finally {
    options.signal?.removeEventListener("abort", handleAbort);
    reader.releaseLock();
  }
  if (bytes === 0) throw new Error("WebAV 没有输出视频数据");
  return new Blob(chunks as BlobPart[], { type: "video/mp4" });
}

function videoToEditorClip(item: VideoItem): WebAvEditorClip {
  const sourceDuration = positive(item.duration) || undefined;
  return {
    id: `video-${item.id}`,
    sourceId: item.id,
    type: "video",
    name: `镜头 ${item.id}`,
    src: item.src,
    sourceDuration,
    trimStart: 0,
    trimEnd: sourceDuration,
    playbackRate: 1,
    volume: 1,
    opacity: 1,
    filter: "none",
    transition: "none",
    transitionDuration: 0,
  };
}

function normalizeOverlay(clip: WebAvEditorClip): WebAvEditorClip {
  const sourceDuration = positive(clip.sourceDuration, clip.type === "image" || clip.type === "text" ? STILL_DURATION : 0) || undefined;
  return {
    ...clip,
    sourceDuration,
    trimStart: Math.max(0, clip.trimStart ?? 0),
    trimEnd: positive(clip.trimEnd, sourceDuration),
    startAt: clip.type === "video" && clip.startAt == null ? undefined : Math.max(0, clip.startAt ?? 0),
    playbackRate: positive(clip.playbackRate, 1),
    volume: Math.min(1, Math.max(0, clip.volume ?? 1)),
    opacity: Math.min(1, Math.max(0, clip.opacity ?? 1)),
    filter: clip.filter ?? "none",
    transition: clip.transition ?? "none",
    transitionDuration: Math.max(0, clip.transitionDuration ?? 0),
    fadeIn: Math.max(0, clip.fadeIn ?? 0),
    fadeOut: Math.max(0, clip.fadeOut ?? 0),
    fontSize: positive(clip.fontSize, 48),
    rect: clip.rect ? { ...clip.rect } : undefined,
    zIndex: Number.isFinite(clip.zIndex) ? clip.zIndex : undefined,
    effect: (clip.transition ?? "none") === "none" ? (clip.effect ?? "none") : "none",
  };
}

function filterCss(filter: WebAvFilter): string {
  return {
    none: "none",
    grayscale: "grayscale(1)",
    sepia: "sepia(1)",
    warm: "sepia(.35) saturate(1.25)",
    cool: "hue-rotate(180deg) saturate(1.15)",
    contrast: "contrast(1.5)",
  }[filter];
}

function installFilter(mediaClip: { tickInterceptor?: unknown }, filter: WebAvFilter, canvasWidth: number, canvasHeight: number) {
  if (filter === "none" || typeof OffscreenCanvas === "undefined") return;
  const css = filterCss(filter);
  mediaClip.tickInterceptor = async (_time: number, result: { video?: CanvasImageSource & { close?: () => void }; [key: string]: unknown }) => {
    if (!result.video) return result;
    const frame = result.video as CanvasImageSource & {
      displayWidth?: number;
      displayHeight?: number;
      width?: number;
      height?: number;
      close?: () => void;
    };
    const width = frame.displayWidth ?? frame.width ?? canvasWidth;
    const height = frame.displayHeight ?? frame.height ?? canvasHeight;
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) return result;
    context.filter = css;
    context.drawImage(frame, 0, 0, width, height);
    const filtered = canvas.transferToImageBitmap();
    frame.close?.();
    return { ...result, video: filtered };
  };
}

function installAudioFades(mediaClip: { tickInterceptor?: unknown }, fadeIn: number, fadeOut: number, duration: number) {
  if (fadeIn <= 0 && fadeOut <= 0) return;
  mediaClip.tickInterceptor = async (time: number, result: { audio?: Float32Array[]; [key: string]: unknown }) => {
    if (!result.audio?.length) return result;
    const seconds = time / 1e6;
    const inGain = fadeIn > 0 ? Math.min(1, seconds / fadeIn) : 1;
    const outGain = fadeOut > 0 ? Math.min(1, Math.max(0, duration - seconds) / fadeOut) : 1;
    const gain = Math.max(0, Math.min(inGain, outGain));
    return { ...result, audio: result.audio.map((channel) => channel.map((sample) => sample * gain)) };
  };
}

function fitSprite(
  sprite: { rect: { x: number; y: number; w: number; h: number } },
  width: number,
  height: number,
  canvasWidth: number,
  canvasHeight: number,
) {
  const scale = Math.min(canvasWidth / Math.max(1, width), canvasHeight / Math.max(1, height));
  sprite.rect.w = width * scale;
  sprite.rect.h = height * scale;
  sprite.rect.x = (canvasWidth - sprite.rect.w) / 2;
  sprite.rect.y = (canvasHeight - sprite.rect.h) / 2;
}

async function trimMediaClip<
  T extends { ready: Promise<unknown>; meta: { duration: number }; split(time: number): Promise<[T, T]>; destroy(): void },
>(mediaClip: T, trimStart: number, trimEnd: number | undefined): Promise<T> {
  let current = mediaClip;
  const sourceDuration = current.meta.duration / 1e6;
  const safeStart = Math.min(Math.max(0, trimStart), sourceDuration);
  if (safeStart > 0.05 && safeStart < sourceDuration - 0.05) {
    const [discard, keep] = await current.split(safeStart * 1e6);
    discard.destroy();
    current = keep;
    await current.ready;
  }
  const requested = Math.max(0, (trimEnd ?? sourceDuration) - safeStart);
  const currentDuration = current.meta.duration / 1e6;
  if (requested > 0.05 && requested < currentDuration - 0.05) {
    const [keep, discard] = await current.split(requested * 1e6);
    discard.destroy();
    current = keep;
    await current.ready;
  }
  return current;
}

function applyTransition(
  sprite: {
    rect: { x: number; y: number; w: number; h: number; angle?: number };
    opacity: number;
    setAnimation?: (
      frames: Record<string, Partial<{ x: number; y: number; w: number; h: number; angle: number; opacity: number }>>,
      options: { duration: number; delay?: number; iterCount: number },
    ) => void;
  },
  clip: WebAvEditorClip,
  canvasWidth: number,
) {
  const duration = Math.min(editableDuration(clip), Math.max(0, clip.transitionDuration)) * 1e6;
  if (!sprite.setAnimation || clip.transition === "none" || duration <= 0) return;
  const target = { x: sprite.rect.x, y: sprite.rect.y, w: sprite.rect.w, h: sprite.rect.h, angle: sprite.rect.angle ?? 0, opacity: clip.opacity };
  if (clip.transition === "fade" || clip.transition === "dissolve") {
    sprite.setAnimation({ "0%": { ...target, opacity: 0 }, "100%": target }, { duration, iterCount: 1 });
  } else if (clip.transition === "slide") {
    sprite.setAnimation({ "0%": { ...target, x: canvasWidth }, "100%": target }, { duration, iterCount: 1 });
  } else if (clip.transition === "zoom") {
    sprite.setAnimation(
      {
        "0%": { ...target, x: target.x + target.w * 0.25, y: target.y + target.h * 0.25, w: target.w * 0.5, h: target.h * 0.5, opacity: 0 },
        "100%": target,
      },
      { duration, iterCount: 1 },
    );
  } else if (clip.transition === "wipe") {
    sprite.setAnimation({ "0%": { ...target, w: 1, opacity: 1 }, "100%": target }, { duration, iterCount: 1 });
  } else if (clip.transition === "rotate") {
    sprite.setAnimation(
      { "0%": { ...target, angle: (target.angle ?? 0) - degreesToRadians(90), opacity: 0 }, "100%": target },
      { duration, iterCount: 1 },
    );
  }
}

function applyOutgoingTransition(
  sprite: {
    rect: { x: number; y: number; w: number; h: number; angle?: number };
    opacity: number;
    setAnimation?: (
      frames: Record<string, Partial<{ x: number; y: number; w: number; h: number; angle: number; opacity: number }>>,
      options: { duration: number; delay?: number; iterCount: number },
    ) => void;
  },
  outgoingDuration: number,
  incoming: WebAvEditorClip,
  outgoingEffect: WebAvEffect,
) {
  const durationSeconds = Math.min(outgoingDuration, editableDuration(incoming), Math.max(0, incoming.transitionDuration));
  if (!sprite.setAnimation || incoming.transition === "none" || durationSeconds <= 0) return;
  const transitionStart = Math.max(0, outgoingDuration - durationSeconds);
  const source = { x: sprite.rect.x, y: sprite.rect.y, w: sprite.rect.w, h: sprite.rect.h, angle: sprite.rect.angle ?? 0, opacity: sprite.opacity };
  let target: Partial<typeof source> = { ...source, opacity: 0 };
  if (incoming.transition === "slide") target = { ...source, x: -source.w };
  if (incoming.transition === "zoom")
    target = { ...source, x: source.x - source.w * 0.25, y: source.y - source.h * 0.25, w: source.w * 1.5, h: source.h * 1.5, opacity: 0 };
  if (incoming.transition === "rotate") target = { ...source, angle: (source.angle ?? 0) + degreesToRadians(90), opacity: 0 };
  const frames: Record<string, Partial<typeof source>> = { "0%": source };
  if (outgoingEffect !== "none") {
    for (const frame of getWebAvEffectKeyframes(outgoingEffect as WebAvEffectType)) {
      const percent = Math.min(transitionStart / outgoingDuration, frame.offset) * 100;
      const values: Partial<typeof source> = { ...source };
      if (frame.opacity != null) values.opacity = frame.opacity * source.opacity;
      if (frame.transform?.includes("scale(1.08)")) {
        values.x = source.x - source.w * 0.04;
        values.y = source.y - source.h * 0.04;
        values.w = source.w * 1.08;
        values.h = source.h * 1.08;
      }
      if (frame.transform?.includes("rotate(-90deg)")) values.angle = degreesToRadians(-90);
      frames[`${Math.round(percent)}%`] = values;
    }
  }
  frames[`${Math.round((transitionStart / outgoingDuration) * 100)}%`] = source;
  frames["100%"] = target;
  sprite.setAnimation(frames, { duration: outgoingDuration * 1e6, iterCount: 1 });
}

function applyEffect(
  sprite: {
    rect: { x: number; y: number; w: number; h: number; angle?: number };
    opacity: number;
    setAnimation?: (
      frames: Record<string, Partial<{ x: number; y: number; w: number; h: number; angle: number; opacity: number }>>,
      options: { duration: number; delay?: number; iterCount: number },
    ) => void;
  },
  effect: WebAvEffect,
  durationSeconds: number,
) {
  if (!sprite.setAnimation || effect === "none" || durationSeconds <= 0) return;
  const keyframes = getWebAvEffectKeyframes(effect as WebAvEffectType);
  const base = { x: sprite.rect.x, y: sprite.rect.y, w: sprite.rect.w, h: sprite.rect.h, angle: sprite.rect.angle ?? 0, opacity: sprite.opacity };
  const frames: Record<string, Partial<typeof base>> = {};
  for (const frame of keyframes) {
    const values: Partial<typeof base> = { ...base };
    if (frame.opacity != null) values.opacity = frame.opacity * sprite.opacity;
    if (frame.transform?.includes("scale(1.08)")) {
      values.x = base.x - base.w * 0.04;
      values.y = base.y - base.h * 0.04;
      values.w = base.w * 1.08;
      values.h = base.h * 1.08;
    } else if (frame.transform?.includes("scale(0.8)")) {
      values.x = base.x + base.w * 0.1;
      values.y = base.y + base.h * 0.1;
      values.w = base.w * 0.8;
      values.h = base.h * 0.8;
    }
    if (frame.transform?.includes("rotate(-90deg)")) values.angle = degreesToRadians(-90);
    if (frame.transform?.includes("rotate(0deg)")) values.angle = 0;
    frames[`${Math.round(frame.offset * 100)}%`] = values;
  }
  const effectDuration = effect === "pulse" ? durationSeconds * 1e6 : Math.min(1, durationSeconds) * 1e6;
  const delay = effect === "fadeOut" ? Math.max(0, durationSeconds - Math.min(1, durationSeconds)) * 1e6 : 0;
  sprite.setAnimation(frames, { duration: effectDuration, delay, iterCount: 1 });
}

export function WebAvVideoEditor({
  clips,
  videoRatio = "16:9",
  initialOverlays = [],
  mediaLibrary = [],
  onClipsChange,
  onTimelineChange,
}: WebAvVideoEditorProps) {
  const { width: canvasWidth, height: canvasHeight } = resolveWebAvCanvasSize(videoRatio);
  const usableVideos = useMemo(() => clips.filter((clip) => clip.state === "completed" && clip.src), [clips]);
  const [timelineClips, setTimelineClips] = useState<WebAvEditorClip[]>(() => [
    ...usableVideos.map(videoToEditorClip),
    ...initialOverlays.map(normalizeOverlay),
  ]);
  const [selectedId, setSelectedId] = useState<string | null>(() => timelineClips[0]?.id ?? null);
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const [runtimeState, setRuntimeState] = useState<"loading" | "webav" | "native">("loading");
  const [runtimeError, setRuntimeError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [waveforms, setWaveforms] = useState<Record<string, number[]>>({});
  const timelineClipsRef = useRef(timelineClips);
  timelineClipsRef.current = timelineClips;
  const canvasHost = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<WebAvCanvasRuntime | null>(null);
  const exportAbortRef = useRef<AbortController | null>(null);
  const objectUrlsRef = useRef(new Set<string>());
  const importedCounterRef = useRef(0);
  const initialTimelineRef = useRef(timelineClips.map((clip) => ({ ...clip, rect: clip.rect ? { ...clip.rect } : undefined })));
  const historyRef = useRef<WebAvEditorHistoryState>(createWebAvEditorHistory(timelineClips));
  const [, setHistoryRevision] = useState(0);

  useEffect(() => {
    setTimelineClips((current) => {
      const currentVideos = new Map(current.filter((item) => item.type === "video" && item.sourceId != null).map((item) => [item.sourceId, item]));
      const videos = usableVideos.map((item) => {
        const previous = currentVideos.get(item.id);
        return previous ? { ...previous, src: item.src, name: `镜头 ${item.id}` } : videoToEditorClip(item);
      });
      return [...videos, ...current.filter((item) => item.type !== "video" || item.sourceId == null)];
    });
  }, [usableVideos]);

  useEffect(
    () => () => {
      exportAbortRef.current?.abort();
      for (const url of objectUrlsRef.current) URL.revokeObjectURL(url);
    },
    [],
  );

  const timeline = useMemo(() => calculateTimeline(timelineClips), [timelineClips]);
  const timelineSignature = timelineClips
    .map((clip) =>
      [
        clip.id,
        clip.src,
        clip.text,
        clip.trimStart,
        clip.trimEnd,
        clip.startAt,
        clip.playbackRate,
        clip.volume,
        clip.opacity,
        clip.filter,
        clip.transition,
        clip.transitionDuration,
        clip.fadeIn,
        clip.fadeOut,
        clip.fontSize,
        clip.rect?.x,
        clip.rect?.y,
        clip.rect?.w,
        clip.rect?.h,
        clip.rect?.angle,
        clip.zIndex,
        clip.effect,
      ].join(":"),
    )
    .join("|");

  useEffect(() => {
    let active = true;
    let runtime: WebAvCanvasRuntime | null = null;
    const abort = new AbortController();
    const spriteCommitTimers = new Map<string, number>();
    const supportsWebCodecs = supportsWebAvRuntime();
    setPlaying(false);
    setCurrentTime(0);
    setRuntimeError("");
    if (!supportsWebCodecs || !canvasHost.current || timelineClips.length === 0) {
      setRuntimeState("native");
      runtimeRef.current = null;
      return () => abort.abort();
    }

    setRuntimeState("loading");
    void Promise.all([import("@webav/av-canvas"), import("@webav/av-cliper")])
      .then(async ([{ AVCanvas }, { AudioClip, ImgClip, MP4Clip, VisibleSprite, renderTxt2ImgBitmap }]) => {
        if (!active || !canvasHost.current) return;
        runtime = new AVCanvas(canvasHost.current, { bgColor: "#000000", width: canvasWidth, height: canvasHeight }) as WebAvCanvasRuntime;
        const discovered: Record<string, number> = {};
        const discoveredWaveforms: Record<string, number[]> = {};
        const calculated = calculateTimeline(timelineClips);
        let previousVideo: { sprite: any; duration: number; effect: WebAvEffect } | null = null;
        const spriteIds = new Map<any, string>();
        for (const item of timelineClips) {
          if (abort.signal.aborted) throw abortError();
          let mediaClip: any;
          let width = 0;
          let height = 0;
          if (item.type === "text") {
            if (!item.text?.trim()) continue;
            const bitmap = await renderTxt2ImgBitmap(
              item.text,
              `font-size:${positive(item.fontSize, 48)}px;font-family:system-ui;color:white;background:rgba(0,0,0,.55);padding:12px 20px;text-align:center;white-space:pre-wrap;`,
            );
            mediaClip = new ImgClip(bitmap);
            await mediaClip.ready;
            width = bitmap.width;
            height = bitmap.height;
          } else {
            if (!item.src) continue;
            const response = await fetch(item.src, { signal: abort.signal });
            if (!response.ok || !response.body) throw new Error(`${item.name}读取失败（${response.status}）`);
            if (item.type === "video") {
              mediaClip = new MP4Clip(response.body, { audio: { volume: item.volume } });
              await mediaClip.ready;
              discovered[item.id] = mediaClip.meta.duration / 1e6;
              mediaClip = await trimMediaClip(mediaClip, item.trimStart, item.trimEnd);
              width = mediaClip.meta.width;
              height = mediaClip.meta.height;
            } else if (item.type === "audio") {
              mediaClip = new AudioClip(response.body, { volume: item.volume });
              await mediaClip.ready;
              discovered[item.id] = mediaClip.meta.duration / 1e6;
              const pcm = mediaClip.getPCMData?.()[0];
              if (pcm) discoveredWaveforms[item.id] = sampleWaveform(pcm);
              mediaClip = await trimMediaClip(mediaClip, item.trimStart, item.trimEnd);
            } else {
              mediaClip = new ImgClip(response.body);
              await mediaClip.ready;
              width = mediaClip.meta.width;
              height = mediaClip.meta.height;
            }
          }
          if (!active) {
            mediaClip.destroy?.();
            return;
          }
          installFilter(mediaClip, item.filter, canvasWidth, canvasHeight);
          if (item.type === "audio") installAudioFades(mediaClip, item.fadeIn ?? 0, item.fadeOut ?? 0, calculated.byId[item.id].duration);
          const sprite = new VisibleSprite(mediaClip);
          const timing = calculated.byId[item.id];
          sprite.time.offset = timing.start * 1e6;
          sprite.time.duration = timing.duration * 1e6;
          sprite.time.playbackRate = item.playbackRate;
          sprite.opacity = item.opacity;
          sprite.zIndex = item.zIndex ?? (item.type === "text" ? 30 : item.type === "image" ? 20 : item.type === "video" ? 10 : 0);
          sprite.interactable = item.type === "audio" ? "disabled" : "interactive";
          if (item.type !== "audio") {
            fitSprite(sprite, width, height, canvasWidth, canvasHeight);
            if (item.type === "text") sprite.rect.y = canvasHeight - sprite.rect.h - 56;
            if (item.rect) {
              sprite.rect.x = item.rect.x;
              sprite.rect.y = item.rect.y;
              const rectWidth = positive(item.rect.w);
              const rectHeight = positive(item.rect.h);
              if (rectWidth) sprite.rect.w = rectWidth;
              if (rectHeight) sprite.rect.h = rectHeight;
              sprite.rect.angle = degreesToRadians(item.rect.angle ?? 0);
            }
            applyTransition(sprite, item, canvasWidth);
            if (item.transition === "none") applyEffect(sprite, item.effect ?? "none", timing.duration);
          }
          await runtime.addSprite(sprite);
          spriteIds.set(sprite, item.id);
          if (item.type !== "audio") {
            sprite.on?.("propsChange", () => {
              if (!active) return;
              const previousTimer = spriteCommitTimers.get(item.id);
              if (previousTimer != null) window.clearTimeout(previousTimer);
              spriteCommitTimers.set(
                item.id,
                window.setTimeout(() => {
                  if (!active) return;
                  const current = timelineClipsRef.current;
                  const next = current.map((clip) =>
                    clip.id === item.id
                      ? {
                          ...clip,
                          rect: {
                            x: sprite.rect.x,
                            y: sprite.rect.y,
                            w: sprite.rect.w,
                            h: sprite.rect.h,
                            angle: radiansToDegrees(sprite.rect.angle ?? 0),
                          },
                          zIndex: sprite.zIndex,
                          opacity: sprite.opacity,
                        }
                      : clip,
                  );
                  historyRef.current = pushWebAvEditorHistory({ ...historyRef.current, present: structuredClone(current) }, next);
                  setHistoryRevision((revision) => revision + 1);
                  applyTimeline(next);
                }, 180),
              );
            });
          }
          if (item.type === "video") {
            if (previousVideo) applyOutgoingTransition(previousVideo.sprite, previousVideo.duration, item, previousVideo.effect);
            previousVideo = { sprite, duration: timing.duration, effect: item.effect ?? "none" };
          }
        }
        if (!active) return;
        runtimeRef.current = runtime;
        runtime.on?.("timeupdate", (microseconds) => setCurrentTime(Number(microseconds) / 1e6));
        runtime.on?.("playing", () => setPlaying(true));
        runtime.on?.("paused", () => setPlaying(false));
        runtime.on?.("activeSpriteChange", (sprite) => {
          const id = spriteIds.get(sprite);
          if (id) setSelectedId(id);
        });
        setWaveforms((current) => ({ ...current, ...discoveredWaveforms }));
        setTimelineClips((current) =>
          current.map((item) => {
            const sourceDuration = discovered[item.id];
            if (!sourceDuration || item.sourceDuration === sourceDuration) return item;
            return { ...item, sourceDuration, trimEnd: item.trimEnd || sourceDuration };
          }),
        );
        setRuntimeState("webav");
        await runtime.previewFrame(0);
      })
      .catch((error) => {
        runtime?.destroy();
        runtime = null;
        if (!active || (error instanceof DOMException && error.name === "AbortError")) return;
        runtimeRef.current = null;
        setRuntimeError(`WebAV 素材载入失败：${formatWebAvError(error)}`);
        setRuntimeState("native");
      });

    return () => {
      active = false;
      abort.abort();
      for (const timer of spriteCommitTimers.values()) window.clearTimeout(timer);
      runtimeRef.current = null;
      runtime?.destroy();
    };
  }, [canvasHeight, canvasWidth, timelineSignature]);

  const videoTracks = timelineClips.filter((clip) => clip.type === "video" && clip.src);
  const currentVideo = videoTracks[Math.min(currentVideoIndex, Math.max(0, videoTracks.length - 1))];
  const selected = timelineClips.find((clip) => clip.id === selectedId) ?? timelineClips[0];

  function applyTimeline(next: WebAvEditorClip[]) {
    setTimelineClips(next);
    setSelectedId((id) => (id && next.some((item) => item.id === id) ? id : (next[0]?.id ?? null)));
    onTimelineChange?.(next);
    const sourceById = new Map(clips.map((item) => [item.id, item]));
    onClipsChange?.(
      next.flatMap((item) => (item.sourceId == null ? [] : [{ ...sourceById.get(item.sourceId)!, id: item.sourceId, src: item.src ?? "" }])),
    );
  }

  function commit(next: WebAvEditorClip[]) {
    historyRef.current = pushWebAvEditorHistory({ ...historyRef.current, present: structuredClone(timelineClips) }, next);
    setHistoryRevision((revision) => revision + 1);
    applyTimeline(next);
  }

  function undo() {
    const history = undoWebAvEditorHistory(historyRef.current);
    if (history === historyRef.current) return;
    historyRef.current = history;
    setHistoryRevision((revision) => revision + 1);
    applyTimeline(history.present);
  }

  function redo() {
    const history = redoWebAvEditorHistory(historyRef.current);
    if (history === historyRef.current) return;
    historyRef.current = history;
    setHistoryRevision((revision) => revision + 1);
    applyTimeline(history.present);
  }

  function resetTimeline() {
    historyRef.current = resetWebAvEditorHistory(historyRef.current, initialTimelineRef.current);
    setHistoryRevision((revision) => revision + 1);
    setCurrentTime(0);
    applyTimeline(historyRef.current.present);
  }

  function splitSelected() {
    if (!selected) return;
    const timing = timeline.byId[selected.id];
    if (!timing || currentTime <= timing.start || currentTime >= timing.end) {
      setRuntimeError("播放位置必须位于选中轨道内部才能切割");
      return;
    }
    importedCounterRef.current += 1;
    const outputBeforeSplit = currentTime - timing.start;
    const sourceSplit = selected.trimStart + outputBeforeSplit * (selected.type === "video" || selected.type === "audio" ? selected.playbackRate : 1);
    const first = { ...selected, trimEnd: sourceSplit };
    const second: WebAvEditorClip = {
      ...selected,
      id: `${selected.id}-split-${importedCounterRef.current}`,
      sourceId: undefined,
      name: `${selected.name}（后段）`,
      trimStart: sourceSplit,
      startAt: selected.type === "video" ? undefined : currentTime,
      rect: selected.rect ? { ...selected.rect } : undefined,
    };
    const index = timelineClips.findIndex((clip) => clip.id === selected.id);
    const next = [...timelineClips];
    next.splice(index, 1, first, second);
    commit(next);
    setSelectedId(second.id);
  }

  function duplicateSelected() {
    if (!selected) return;
    importedCounterRef.current += 1;
    const timing = timeline.byId[selected.id];
    const copy: WebAvEditorClip = {
      ...selected,
      id: `${selected.id}-copy-${importedCounterRef.current}`,
      sourceId: undefined,
      name: `${selected.name}（副本）`,
      startAt: selected.type === "video" ? undefined : (timing?.end ?? selected.startAt),
      rect: selected.rect ? { ...selected.rect } : undefined,
    };
    const index = timelineClips.findIndex((clip) => clip.id === selected.id);
    const next = [...timelineClips];
    next.splice(index + 1, 0, copy);
    commit(next);
    setSelectedId(copy.id);
  }

  function updateSelected(patch: Partial<WebAvEditorClip>) {
    if (!selected) return;
    commit(timelineClips.map((clip) => (clip.id === selected.id ? { ...clip, ...patch } : clip)));
  }

  function moveVideo(id: string, direction: -1 | 1) {
    const videos = timelineClips.filter((clip) => clip.type === "video");
    const overlays = timelineClips.filter((clip) => clip.type !== "video");
    const index = videos.findIndex((clip) => clip.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= videos.length) return;
    const nextVideos = [...videos];
    [nextVideos[index], nextVideos[target]] = [nextVideos[target], nextVideos[index]];
    setCurrentVideoIndex((current) => Math.min(current, nextVideos.length - 1));
    if (selectedId === id) setSelectedId(nextVideos[index].id);
    commit([...nextVideos, ...overlays]);
  }

  function removeClip(id: string) {
    const removed = timelineClips.find((clip) => clip.id === id);
    if (removed?.src && objectUrlsRef.current.has(removed.src)) {
      URL.revokeObjectURL(removed.src);
      objectUrlsRef.current.delete(removed.src);
    }
    commit(timelineClips.filter((clip) => clip.id !== id));
  }

  function addTextTrack() {
    importedCounterRef.current += 1;
    const id = `text-local-${importedCounterRef.current}`;
    const next: WebAvEditorClip = normalizeOverlay({
      id,
      type: "text",
      name: `文字 ${importedCounterRef.current}`,
      text: "输入文字",
      sourceDuration: STILL_DURATION,
      trimStart: 0,
      trimEnd: STILL_DURATION,
      startAt: 0,
      playbackRate: 1,
      volume: 1,
      opacity: 1,
      filter: "none",
      transition: "none",
      transitionDuration: 0,
    });
    commit([...timelineClips, next]);
    setSelectedId(id);
  }

  function addLibraryClip(source: WebAvEditorClip) {
    importedCounterRef.current += 1;
    const id = `library-${source.id}-${importedCounterRef.current}`;
    const next = normalizeOverlay({
      ...source,
      id,
      sourceId: undefined,
      startAt: source.type === "video" ? undefined : (source.startAt ?? 0),
      rect: source.rect ? { ...source.rect } : undefined,
    });
    commit([...timelineClips, next]);
    setSelectedId(id);
  }

  function importMedia(files: FileList | null) {
    if (!files) return;
    const additions: WebAvEditorClip[] = [];
    for (const file of files) {
      const type: WebAvMediaType | null = file.type.startsWith("video/")
        ? "video"
        : file.type.startsWith("audio/")
          ? "audio"
          : file.type.startsWith("image/")
            ? "image"
            : null;
      if (!type) continue;
      importedCounterRef.current += 1;
      const src = URL.createObjectURL(file);
      objectUrlsRef.current.add(src);
      const defaultDuration = type === "image" ? STILL_DURATION : undefined;
      additions.push(
        normalizeOverlay({
          id: `${type}-local-${importedCounterRef.current}`,
          type,
          name: file.name,
          src,
          sourceDuration: defaultDuration,
          trimStart: 0,
          trimEnd: defaultDuration,
          startAt: type === "video" ? undefined : 0,
          playbackRate: 1,
          volume: 1,
          opacity: 1,
          filter: "none",
          transition: "none",
          transitionDuration: 0,
        }),
      );
    }
    if (additions.length) {
      commit([...timelineClips, ...additions]);
      setSelectedId(additions[0].id);
    }
  }

  function togglePlayback() {
    const runtime = runtimeRef.current;
    if (!runtime || timeline.duration <= 0) return;
    if (playing) {
      runtime.pause();
      setPlaying(false);
      return;
    }
    const start = currentTime >= timeline.duration - 0.01 ? 0 : currentTime;
    runtime.play({ start: start * 1e6, end: timeline.duration * 1e6 });
    setPlaying(true);
  }

  function seek(next: number) {
    const value = Math.min(timeline.duration, Math.max(0, next));
    setCurrentTime(value);
    void runtimeRef.current?.previewFrame(value * 1e6).catch((error) => setRuntimeError(`预览失败：${formatWebAvError(error)}`));
  }

  async function exportTimeline() {
    const runtime = runtimeRef.current;
    if (!runtime || timeline.duration <= 0) return;
    const abort = new AbortController();
    exportAbortRef.current = abort;
    let combinator: WebAvCombinator | null = null;
    let stopProgress: (() => void) | undefined;
    setExporting(true);
    setExportProgress(0);
    setRuntimeError("");
    try {
      runtime.pause();
      setPlaying(false);
      combinator = await runtime.createCombinator();
      stopProgress = combinator.on?.("OutputProgress", ((progress: number) => setExportProgress(Math.round(progress * 100))) as (
        progress: number,
      ) => void);
      const blob = await readWebAvOutput(combinator.output({ maxTime: timeline.duration * 1e6 }), { signal: abort.signal });
      if (abort.signal.aborted) throw abortError();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `hodor-timeline-${Date.now()}.mp4`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setExportProgress(100);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) setRuntimeError(`合成导出失败：${formatWebAvError(error)}`);
    } finally {
      stopProgress?.();
      combinator?.destroy?.();
      exportAbortRef.current = null;
      setExporting(false);
    }
  }

  return (
    <section aria-label="WebAV 视频编辑器" className="space-y-4 rounded-xl border border-slate-800 bg-slate-950/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <Film className="size-4 text-violet-300" />
            视频时间线
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            {runtimeState === "webav"
              ? "音视频和图文轨道已载入 WebAV，可预览并导出合成视频"
              : runtimeState === "native"
                ? "当前浏览器未启用 WebCodecs 或素材跨域不可读，可继续编排和逐段预览"
                : "正在解析时间线素材"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="flex cursor-pointer items-center gap-1 rounded-lg border border-slate-700 px-3 py-2 text-xs">
            <FilePlus2 className="size-3.5" />
            导入媒体
            <input
              aria-label="导入媒体文件"
              type="file"
              multiple
              accept="video/*,audio/*,image/*"
              className="sr-only"
              onChange={(event) => importMedia(event.target.files)}
            />
          </label>
          <button
            type="button"
            aria-label="添加文字轨道"
            onClick={addTextTrack}
            className="flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-2 text-xs">
            <Type className="size-3.5" />
            添加文字
          </button>
          {runtimeState === "webav" ? (
            <button type="button" onClick={togglePlayback} className="flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-2 text-xs">
              {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
              {playing ? "暂停合成预览" : "播放合成预览"}
            </button>
          ) : null}
          {runtimeState === "webav" ? (
            exporting ? (
              <button
                type="button"
                aria-label="取消合成"
                onClick={() => exportAbortRef.current?.abort()}
                className="flex items-center gap-1 rounded-lg bg-red-600 px-3 py-2 text-xs">
                <X className="size-3.5" />
                取消合成 {exportProgress}%
              </button>
            ) : (
              <button
                type="button"
                aria-label="导出合成视频"
                onClick={() => void exportTimeline()}
                className="flex items-center gap-1 rounded-lg bg-violet-600 px-3 py-2 text-xs">
                <Download className="size-3.5" />
                导出合成视频
              </button>
            )
          ) : null}
          {currentVideo ? (
            <a
              href={currentVideo.src}
              download={`hodor-video-${currentVideo.sourceId ?? currentVideo.id}.mp4`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-2 text-xs">
              <Download className="size-3.5" />
              下载当前片段
            </a>
          ) : null}
        </div>
      </div>

      {runtimeError ? (
        <div role="alert" className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-300">
          {runtimeError}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2 rounded-lg border border-slate-800 bg-slate-900/50 p-2">
        <button
          type="button"
          aria-label="撤销"
          disabled={historyRef.current.past.length === 0}
          onClick={undo}
          className="rounded border border-slate-700 px-2.5 py-1.5 text-xs disabled:opacity-30">
          撤销
        </button>
        <button
          type="button"
          aria-label="重做"
          disabled={historyRef.current.future.length === 0}
          onClick={redo}
          className="rounded border border-slate-700 px-2.5 py-1.5 text-xs disabled:opacity-30">
          重做
        </button>
        <button
          type="button"
          aria-label="切割选中轨道"
          disabled={!selected}
          onClick={splitSelected}
          className="rounded border border-slate-700 px-2.5 py-1.5 text-xs disabled:opacity-30">
          切割
        </button>
        <button
          type="button"
          aria-label="复制选中轨道"
          disabled={!selected}
          onClick={duplicateSelected}
          className="rounded border border-slate-700 px-2.5 py-1.5 text-xs disabled:opacity-30">
          复制
        </button>
        <button type="button" aria-label="重置时间线" onClick={resetTimeline} className="rounded border border-slate-700 px-2.5 py-1.5 text-xs">
          重置
        </button>
      </div>
      <div
        ref={canvasHost}
        aria-label="WebAV 合成画布"
        style={{ aspectRatio: `${canvasWidth} / ${canvasHeight}` }}
        className={runtimeState === "webav" || runtimeState === "loading" ? "overflow-hidden rounded-lg bg-black" : "hidden"}
      />
      {runtimeState === "native" ? (
        currentVideo ? (
          <video
            aria-label="视频编辑预览"
            key={currentVideo.id}
            src={currentVideo.src}
            controls
            preload="metadata"
            style={{ aspectRatio: `${canvasWidth} / ${canvasHeight}` }}
            className="w-full rounded-lg bg-black object-contain"
          />
        ) : (
          <div
            style={{ aspectRatio: `${canvasWidth} / ${canvasHeight}` }}
            className="grid place-items-center rounded-lg bg-black text-sm text-slate-600">
            导入素材或添加文字后开始编排
          </div>
        )
      ) : null}

      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>{timelineClips.length} 条轨道</span>
          <span>{timeline.duration > 0 ? `${currentTime.toFixed(1)} / ${timeline.duration.toFixed(1)} 秒` : "等待有效素材时长"}</span>
        </div>
        <input
          aria-label="时间线播放位置"
          type="range"
          min={0}
          max={timeline.duration || 0}
          step={0.01}
          value={Math.min(currentTime, timeline.duration)}
          disabled={timeline.duration <= 0}
          onChange={(event) => seek(Number(event.target.value))}
          className="w-full accent-violet-500"
        />
      </div>

      {mediaLibrary.length ? (
        <div aria-label="媒体素材库" className="space-y-2 rounded-lg border border-slate-800 bg-slate-900/50 p-3">
          <div className="text-xs font-medium text-slate-300">媒体素材库</div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {mediaLibrary.map((item) => (
              <button
                key={item.id}
                type="button"
                draggable
                aria-label={`添加素材 ${item.name}`}
                onDragStart={(event) => event.dataTransfer.setData("application/json", JSON.stringify({ kind: "hodor-media", id: item.id }))}
                onClick={() => addLibraryClip(item)}
                className="min-w-32 rounded border border-slate-700 bg-slate-950 px-3 py-2 text-left text-xs">
                <span className="block truncate">{item.name}</span>
                <span className="text-[10px] text-slate-500">{item.type}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div
          className="space-y-2"
          aria-label="时间线轨道"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            try {
              const payload = JSON.parse(event.dataTransfer.getData("application/json")) as { kind?: string; id?: string };
              const source = payload.kind === "hodor-media" ? mediaLibrary.find((item) => item.id === payload.id) : undefined;
              if (source) addLibraryClip(source);
            } catch {
              setRuntimeError("拖放素材数据无效");
            }
          }}>
          {timelineClips.map((clip) => {
            const timing = timeline.byId[clip.id];
            const videoIndex = videoTracks.findIndex((item) => item.id === clip.id);
            return (
              <div
                key={clip.id}
                className={`flex items-center gap-2 rounded-lg border p-2 ${selected?.id === clip.id ? "border-blue-500 bg-blue-500/10" : "border-slate-800 bg-slate-900"}`}>
                <button
                  type="button"
                  aria-label={`选择轨道 ${clip.name}`}
                  onClick={() => {
                    setSelectedId(clip.id);
                    if (videoIndex >= 0) setCurrentVideoIndex(videoIndex);
                  }}
                  className="grid size-8 place-items-center rounded bg-slate-800">
                  <Play className="size-3.5" />
                </button>
                <span className="min-w-0 flex-1 truncate text-xs">{clip.name}</span>
                <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">{clip.type}</span>
                {clip.type === "audio" && waveforms[clip.id]?.length ? (
                  <div aria-label={`${clip.name} 波形`} className="flex h-6 w-24 items-center gap-px overflow-hidden">
                    {waveforms[clip.id].map((peak, bar) => (
                      <span key={bar} className="w-0.5 bg-emerald-400/80" style={{ height: `${Math.max(2, peak * 22)}px` }} />
                    ))}
                  </div>
                ) : null}
                <span className="text-[11px] text-slate-500">{timing ? `${timing.start.toFixed(1)}–${timing.end.toFixed(1)} 秒` : "读取中"}</span>
                {clip.type === "video" ? (
                  <button
                    type="button"
                    aria-label={`上移片段 ${clip.sourceId ?? clip.id}`}
                    disabled={videoIndex === 0}
                    onClick={() => moveVideo(clip.id, -1)}
                    className="p-1 disabled:opacity-30">
                    <ArrowUp className="size-3.5" />
                  </button>
                ) : null}
                {clip.type === "video" ? (
                  <button
                    type="button"
                    aria-label={`下移片段 ${clip.sourceId ?? clip.id}`}
                    disabled={videoIndex === videoTracks.length - 1}
                    onClick={() => moveVideo(clip.id, 1)}
                    className="p-1 disabled:opacity-30">
                    <ArrowDown className="size-3.5" />
                  </button>
                ) : null}
                <button
                  type="button"
                  aria-label={`移除片段 ${clip.sourceId ?? clip.id}`}
                  onClick={() => removeClip(clip.id)}
                  className="p-1 text-red-300">
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            );
          })}
        </div>

        {selected ? (
          <aside aria-label="轨道属性" className="space-y-3 rounded-lg border border-slate-800 bg-slate-900/70 p-3 text-xs">
            <label className="block space-y-1">
              <span className="text-slate-400">轨道名称</span>
              <input
                aria-label="轨道名称"
                value={selected.name}
                onChange={(event) => updateSelected({ name: event.target.value })}
                className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5"
              />
            </label>
            {selected.type !== "video" ? (
              <NumberField label="轨道起点" value={selected.startAt ?? 0} min={0} onChange={(value) => updateSelected({ startAt: value })} />
            ) : null}
            {selected.type === "text" ? (
              <label className="block space-y-1">
                <span className="text-slate-400">文字内容</span>
                <textarea
                  aria-label="文字内容"
                  value={selected.text ?? ""}
                  onChange={(event) => updateSelected({ text: event.target.value })}
                  className="min-h-20 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5"
                />
              </label>
            ) : null}
            {selected.type === "text" ? (
              <NumberField
                label="字号"
                value={selected.fontSize ?? 48}
                min={12}
                max={144}
                step={1}
                onChange={(value) => updateSelected({ fontSize: value })}
              />
            ) : null}
            <NumberField
              label="裁剪起点"
              value={selected.trimStart}
              min={0}
              max={selected.trimEnd}
              onChange={(value) => updateSelected({ trimStart: Math.min(value, selected.trimEnd ?? value) })}
            />
            <NumberField
              label="裁剪终点"
              value={selected.trimEnd ?? selected.sourceDuration ?? 0}
              min={selected.trimStart}
              max={selected.sourceDuration}
              onChange={(value) => updateSelected({ trimEnd: Math.max(value, selected.trimStart) })}
            />
            {selected.type === "video" || selected.type === "audio" ? (
              <NumberField
                label="播放速度"
                value={selected.playbackRate}
                min={0.1}
                max={4}
                step={0.1}
                onChange={(value) => updateSelected({ playbackRate: value })}
              />
            ) : null}
            {selected.type === "video" || selected.type === "audio" ? (
              <NumberField label="音量" value={selected.volume} min={0} max={1} step={0.05} onChange={(value) => updateSelected({ volume: value })} />
            ) : null}
            {selected.type === "audio" ? (
              <NumberField
                label="淡入时长"
                value={selected.fadeIn ?? 0}
                min={0}
                max={editableDuration(selected)}
                step={0.1}
                onChange={(value) => updateSelected({ fadeIn: value })}
              />
            ) : null}
            {selected.type === "audio" ? (
              <NumberField
                label="淡出时长"
                value={selected.fadeOut ?? 0}
                min={0}
                max={editableDuration(selected)}
                step={0.1}
                onChange={(value) => updateSelected({ fadeOut: value })}
              />
            ) : null}
            {selected.type !== "audio" ? (
              <NumberField
                label="不透明度"
                value={selected.opacity}
                min={0}
                max={1}
                step={0.05}
                onChange={(value) => updateSelected({ opacity: value })}
              />
            ) : null}
            {selected.type !== "audio" ? (
              <NumberField
                label="画布 X"
                value={selected.rect?.x ?? 0}
                min={-canvasWidth}
                max={canvasWidth}
                step={1}
                onChange={(value) => updateSelected({ rect: { ...selected.rect, x: value, y: selected.rect?.y ?? 0 } })}
              />
            ) : null}
            {selected.type !== "audio" ? (
              <NumberField
                label="画布 Y"
                value={selected.rect?.y ?? 0}
                min={-canvasHeight}
                max={canvasHeight}
                step={1}
                onChange={(value) => updateSelected({ rect: { ...selected.rect, x: selected.rect?.x ?? 0, y: value } })}
              />
            ) : null}
            {selected.type !== "audio" ? (
              <NumberField
                label="旋转角度"
                value={selected.rect?.angle ?? 0}
                min={-360}
                max={360}
                step={1}
                onChange={(value) => updateSelected({ rect: { ...selected.rect, x: selected.rect?.x ?? 0, y: selected.rect?.y ?? 0, angle: value } })}
              />
            ) : null}
            <NumberField
              label="层级"
              value={selected.zIndex ?? (selected.type === "text" ? 30 : selected.type === "image" ? 20 : selected.type === "video" ? 10 : 0)}
              min={0}
              max={100}
              step={1}
              onChange={(value) => updateSelected({ zIndex: value })}
            />
            {selected.type !== "audio" ? (
              <SelectField
                label="滤镜"
                value={selected.filter}
                options={["none", "grayscale", "sepia", "warm", "cool", "contrast"]}
                onChange={(value) => updateSelected({ filter: value as WebAvFilter })}
              />
            ) : null}
            {selected.type !== "audio" ? (
              <SelectField
                label="入场转场"
                value={selected.transition}
                options={["none", "fade", "dissolve", "slide", "wipe", "zoom", "rotate"]}
                onChange={(value) =>
                  updateSelected({
                    transition: value as WebAvTransition,
                    transitionDuration: value === "none" ? 0 : Math.max(selected.transitionDuration, 0.5),
                    effect: value === "none" ? selected.effect : "none",
                  })
                }
              />
            ) : null}
            {selected.type !== "audio" && selected.transition !== "none" ? (
              <NumberField
                label="转场时长"
                value={selected.transitionDuration}
                min={0.1}
                max={Math.max(0.1, editableDuration(selected))}
                step={0.1}
                onChange={(value) => updateSelected({ transitionDuration: value })}
              />
            ) : null}
            {selected.type !== "audio" ? (
              <SelectField
                label="特效"
                value={selected.effect ?? "none"}
                options={["none", "fadeIn", "fadeOut", "pulse", "rotateIn"]}
                onChange={(value) =>
                  updateSelected({
                    effect: value as WebAvEffect,
                    transition: value === "none" ? selected.transition : "none",
                    transitionDuration: value === "none" ? selected.transitionDuration : 0,
                  })
                }
              />
            ) : null}
          </aside>
        ) : null}
      </div>
      {exporting ? (
        <div role="status" className="flex items-center gap-2 text-xs text-violet-200">
          <LoaderCircle className="size-3.5 animate-spin" />
          正在合成并编码 MP4，进度 {exportProgress}%
        </div>
      ) : null}
    </section>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step = 0.1,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange(value: number): void;
}) {
  return (
    <label className="flex items-center justify-between gap-2">
      <span className="text-slate-400">{label}</span>
      <input
        aria-label={label}
        type="number"
        value={Number.isFinite(value) ? value : 0}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-24 rounded border border-slate-700 bg-slate-950 px-2 py-1"
      />
    </label>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange(value: string): void }) {
  const labels: Record<string, string> = {
    none: "无",
    grayscale: "黑白",
    sepia: "复古",
    warm: "暖色",
    cool: "冷色",
    contrast: "高对比",
    fade: "淡入淡出",
    dissolve: "溶解",
    slide: "滑动",
    wipe: "擦除",
    zoom: "缩放",
    rotate: "旋转",
    fadeIn: "渐显",
    fadeOut: "渐隐",
    pulse: "脉冲",
    rotateIn: "旋入",
  };
  return (
    <label className="flex items-center justify-between gap-2">
      <span className="text-slate-400">{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-28 rounded border border-slate-700 bg-slate-950 px-2 py-1">
        {options.map((option) => (
          <option key={option} value={option}>
            {labels[option] ?? option}
          </option>
        ))}
      </select>
    </label>
  );
}
