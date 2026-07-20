import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type SetStateAction,
} from "react";
import {
  AlertTriangle,
  Check,
  Clapperboard,
  CirclePlay,
  Download,
  Film,
  FolderOpen,
  ImageIcon,
  LoaderCircle,
  Pause,
  PanelRightClose,
  PanelRightOpen,
  Play,
  Presentation,
  Plus,
  RefreshCw,
  RotateCcw,
  SkipBack,
  SkipForward,
  Sparkles,
  SquarePen,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";

import type { ProductionApi } from "./production-api";
import { ProductionFlowBoard } from "./production-flow-board";
import type {
  ProductionFlowData,
  ProductionAsset,
  ProductionMediaItem,
  ProductionProject,
  ProductionState,
  ProductionVideoMode,
  ProductionVideoModelDetail,
  ProductionVideoModelOption,
  ScriptSummary,
  StoryboardItem,
  VideoItem,
  VideoTrack,
  TrackMedia,
} from "./types";
import { WebAvVideoEditor } from "./webav-video-editor";
import type { WebAvEditorClip } from "./webav-video-editor";

export interface ProductionWorkbenchProps {
  api: ProductionApi;
  project: ProductionProject;
  pollIntervalMs?: number;
  initialView?: "generation" | "flow" | "editor";
  onOpenAgent?: (scriptId: number) => void;
  renderProductionAgent?: (scriptId: number, onFlowDataChange: () => void, onBusyChange: (busy: boolean) => void) => ReactNode;
}

const emptyFlow: ProductionFlowData = { script: "", scriptPlan: "", assets: [], storyboardTable: "", storyboard: [] };
type WorkbenchMenu = "preview" | "generate" | "editVideo";
const statusContent: Record<ProductionState, { label: string; className: string }> = {
  idle: { label: "未生成", className: "border-slate-700 bg-slate-900 text-slate-400" },
  running: { label: "生成中", className: "border-blue-500/30 bg-blue-500/10 text-blue-300" },
  completed: { label: "已完成", className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" },
  failed: { label: "生成失败", className: "border-red-500/30 bg-red-500/10 text-red-300" },
};

function StatusBadge({ state }: { state: ProductionState }) {
  const content = statusContent[state];
  return <span className={`rounded-full border px-2 py-1 text-xs font-medium ${content.className}`}>{content.label}</span>;
}

function FailureReason({ children }: { children?: string }) {
  if (!children) return null;
  return (
    <div role="alert" className="flex gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs leading-5 text-red-300">
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

function messageOf(error: unknown) {
  return error instanceof Error && error.message ? error.message : "请求失败";
}

export function nextPollDelay(base: number, failures: number) {
  return Math.min(base * 2 ** Math.max(0, failures), 30_000);
}

function updateStoryboards(current: StoryboardItem[], updates: StoryboardItem[]) {
  const map = new Map(updates.map((item) => [item.id, item]));
  return current.map((item) => {
    const update = map.get(item.id);
    return update
      ? {
          ...item,
          ...update,
          index: update.index ?? item.index,
          prompt: update.prompt || item.prompt,
          videoDesc: update.videoDesc || item.videoDesc,
          src: update.src || item.src,
        }
      : item;
  });
}

function updateVideos(current: VideoTrack[], updates: VideoItem[]) {
  const map = new Map(updates.map((item) => [item.id, item]));
  return current.map((track) => {
    let changed = false;
    const videoList = track.videoList.map((video) => {
      const update = map.get(video.id);
      if (!update) return video;
      changed = true;
      return { ...video, ...update, src: update.src || video.src };
    });
    if (!changed) return track;
    const running = videoList.some((video) => video.state === "running");
    const failed = videoList.find((video) => video.state === "failed");
    const state: ProductionState = running ? "running" : failed ? "failed" : "completed";
    return { ...track, videoList, state, errorReason: failed?.errorReason ?? "" };
  });
}

function toEditorMedia(item: ProductionMediaItem): WebAvEditorClip {
  return {
    id: item.id,
    sourceId: item.sourceId,
    type: item.type,
    name: item.name,
    src: item.src,
    ...(item.duration > 0 ? { sourceDuration: item.duration, trimEnd: item.duration } : {}),
    trimStart: 0,
    playbackRate: 1,
    volume: 1,
    opacity: 1,
    filter: "none",
    transition: "none",
    transitionDuration: 0,
  };
}

type StoryboardSetter = Dispatch<SetStateAction<StoryboardItem[]>>;

function formatPreviewTime(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(whole / 60)).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`;
}

function PreviewWorkbench({
  api,
  scriptId,
  storyboards,
  assets,
  onError,
}: {
  api: ProductionApi;
  scriptId: number;
  storyboards: StoryboardItem[];
  assets: ProductionAsset[];
  onError: (message: string) => void;
}) {
  const [orderedIds, setOrderedIds] = useState<number[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [currentIndex, setCurrentIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const initialOrder = useRef<number[]>([]);
  const progressRef = useRef<HTMLDivElement | null>(null);
  const shotRefs = useRef(new Map<number, HTMLDivElement>());

  useEffect(() => {
    const ids = storyboards.map((item) => item.id);
    initialOrder.current = ids;
    setOrderedIds(ids);
    setSelectedIds(new Set());
    setCurrentIndex(0);
    setElapsed(0);
    setPlaying(false);
  }, [scriptId]);

  useEffect(() => {
    const liveIds = new Set(storyboards.map((item) => item.id));
    setOrderedIds((current) => {
      const retained = current.filter((id) => liveIds.has(id));
      const retainedIds = new Set(retained);
      return [...retained, ...storyboards.map((item) => item.id).filter((id) => !retainedIds.has(id))];
    });
    setSelectedIds((current) => new Set([...current].filter((id) => liveIds.has(id))));
  }, [storyboards]);

  const ordered = useMemo(() => {
    const byId = new Map(storyboards.map((item) => [item.id, item]));
    return orderedIds.flatMap((id) => {
      const item = byId.get(id);
      return item ? [item] : [];
    });
  }, [orderedIds, storyboards]);
  const current = ordered[currentIndex] ?? null;
  const durationAt = useCallback((index: number) => ordered[index]?.duration || 3, [ordered]);
  const cumulativeAt = useCallback((index: number) => ordered.slice(0, index).reduce((sum, item) => sum + (item.duration || 3), 0), [ordered]);
  const totalDuration = useMemo(() => ordered.reduce((sum, item) => sum + (item.duration || 3), 0), [ordered]);
  const totalElapsed = current ? cumulativeAt(currentIndex) + elapsed : 0;
  const progress = totalDuration > 0 ? Math.min(100, (totalElapsed / totalDuration) * 100) : 0;

  const scrollToShot = useCallback((id: number | undefined) => {
    if (id == null) return;
    shotRefs.current.get(id)?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, []);

  useEffect(() => {
    if (!playing || !current) return;
    const timer = window.setInterval(() => {
      setElapsed((value) => {
        const next = value + 0.05;
        const duration = durationAt(currentIndex);
        if (next < duration) return next;
        if (currentIndex < ordered.length - 1) {
          const nextIndex = currentIndex + 1;
          setCurrentIndex(nextIndex);
          window.setTimeout(() => scrollToShot(ordered[nextIndex]?.id), 0);
          return 0;
        }
        setPlaying(false);
        return duration;
      });
    }, 50);
    return () => window.clearInterval(timer);
  }, [current, currentIndex, durationAt, ordered, playing, scrollToShot]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat || !current) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, button, [contenteditable='true']")) return;
      event.preventDefault();
      setSelectedIds((ids) => {
        const next = new Set(ids);
        if (next.has(current.id)) next.delete(current.id);
        else next.add(current.id);
        return next;
      });
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [current]);

  function goTo(index: number) {
    if (index < 0 || index >= ordered.length) return;
    setPlaying(false);
    setCurrentIndex(index);
    setElapsed(0);
    scrollToShot(ordered[index]?.id);
  }

  function seek(event: ReactPointerEvent<HTMLDivElement>) {
    const rect = progressRef.current?.getBoundingClientRect();
    if (!rect || !totalDuration) return;
    setPlaying(false);
    const target = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * totalDuration;
    let cumulative = 0;
    for (let index = 0; index < ordered.length; index += 1) {
      const duration = durationAt(index);
      if (cumulative + duration > target || index === ordered.length - 1) {
        setCurrentIndex(index);
        setElapsed(Math.min(duration, target - cumulative));
        scrollToShot(ordered[index]?.id);
        break;
      }
      cumulative += duration;
    }
  }

  function dropBefore(targetId: number) {
    if (draggedId == null || draggedId === targetId) return;
    setOrderedIds((currentIds) => {
      const next = currentIds.filter((id) => id !== draggedId);
      next.splice(Math.max(0, next.indexOf(targetId)), 0, draggedId);
      return next;
    });
    setDraggedId(null);
  }

  async function exportSelected() {
    const ids = ordered.filter((item) => selectedIds.has(item.id) && item.src).map((item) => item.id);
    if (!ids.length) {
      onError("请至少选择一张分镜图");
      return;
    }
    try {
      const url = await api.previewStoryboards(ids);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "分镜图片.jpg";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } catch (cause) {
      onError(messageOf(cause));
    }
  }

  const relatedAssets = useMemo(() => {
    const ids = new Set(current?.associateAssetsIds ?? []);
    return assets.flatMap((asset) => [asset, ...asset.derive]).filter((asset) => ids.has(asset.id));
  }, [assets, current]);

  return (
    <section aria-label="快速预览" className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex min-h-0 flex-1 gap-6">
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
          <div className="flex min-h-0 flex-1 items-center justify-center bg-black">
            {current?.src ? (
              <img src={current.src} alt={current.videoDesc || current.prompt || "分镜预览"} className="max-h-full max-w-full object-contain" />
            ) : (
              <div className="flex flex-col items-center gap-3 text-sm text-slate-500">
                <ImageIcon className="size-12" />
                暂无图片
              </div>
            )}
          </div>
          <div className="shrink-0 border-t border-slate-800 bg-slate-950 px-4 py-3">
            <div className="mb-2 flex items-center justify-center gap-2">
              <button
                type="button"
                aria-label="上一条"
                disabled={currentIndex === 0}
                onClick={() => goTo(currentIndex - 1)}
                className="rounded-full p-2 disabled:opacity-30">
                <SkipBack className="size-[18px]" />
              </button>
              <button
                type="button"
                aria-label={playing ? "暂停" : "播放"}
                onClick={() => {
                  if (playing) setPlaying(false);
                  else if (currentIndex === ordered.length - 1 && elapsed >= durationAt(currentIndex)) {
                    setCurrentIndex(0);
                    setElapsed(0);
                    setPlaying(true);
                  } else setPlaying(true);
                }}
                className="rounded-full p-2 text-blue-400">
                {playing ? <Pause className="size-[22px]" /> : <Play className="size-[22px]" />}
              </button>
              <button
                type="button"
                aria-label="下一条"
                disabled={currentIndex >= ordered.length - 1}
                onClick={() => goTo(currentIndex + 1)}
                className="rounded-full p-2 disabled:opacity-30">
                <SkipForward className="size-[18px]" />
              </button>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="w-10 text-center text-xs tabular-nums text-slate-500">{formatPreviewTime(elapsed)}</span>
              <div
                ref={progressRef}
                role="slider"
                aria-label="预览进度"
                aria-valuemin={0}
                aria-valuemax={totalDuration}
                aria-valuenow={totalElapsed}
                onPointerDown={seek}
                className="flex h-5 flex-1 cursor-pointer items-center">
                <div className="relative h-1.5 w-full rounded bg-slate-800">
                  {ordered.map((item, index) => (
                    <button
                      key={item.id}
                      type="button"
                      aria-label={`跳到分镜 ${index + 1}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        goTo(index);
                      }}
                      className={`absolute top-0 h-full rounded ${index === currentIndex ? "bg-blue-500/50" : index < currentIndex ? "bg-blue-900" : "bg-transparent"}`}
                      style={{
                        left: `${(cumulativeAt(index) / Math.max(totalDuration, 1)) * 100}%`,
                        width: `${(durationAt(index) / Math.max(totalDuration, 1)) * 100}%`,
                      }}
                    />
                  ))}
                  {ordered.slice(0, -1).map((item, index) => (
                    <span
                      key={item.id}
                      className="absolute -top-0.5 z-20 h-2.5 w-px bg-slate-600"
                      style={{ left: `${(cumulativeAt(index + 1) / Math.max(totalDuration, 1)) * 100}%` }}
                    />
                  ))}
                  <span className="pointer-events-none absolute left-0 top-0 z-10 h-full rounded bg-blue-500" style={{ width: `${progress}%` }} />
                  <span
                    className="pointer-events-none absolute top-1/2 z-30 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-blue-400 bg-slate-950"
                    style={{ left: `${progress}%` }}
                  />
                </div>
              </div>
              <span className="w-10 text-center text-xs tabular-nums text-slate-500">{formatPreviewTime(totalDuration)}</span>
            </div>
          </div>
        </div>

        <aside className="w-[380px] shrink-0 overflow-y-auto pr-2">
          <PreviewInfo title="分镜描述">
            【序号 {currentIndex + 1}】{current?.videoDesc || "暂无描述"}
          </PreviewInfo>
          <PreviewInfo title="时长">{current?.duration || 3} 秒</PreviewInfo>
          <PreviewInfo title="关联资产">
            {relatedAssets.length ? (
              <div className="flex flex-wrap gap-3">
                {relatedAssets.map((asset) => (
                  <div key={asset.id} className="grid gap-2">
                    <div className="size-20 overflow-hidden rounded-lg border-2 border-slate-800 bg-slate-900">
                      {asset.src ? <img src={asset.src} alt={asset.name} className="size-full object-cover" /> : null}
                    </div>
                    <span className="rounded bg-slate-800 px-2 py-1 text-xs">
                      {asset.name}（{asset.type === "role" ? "角色" : asset.type === "tool" ? "道具" : "场景"}）
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <span className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-400">无关联资产</span>
            )}
          </PreviewInfo>
          <PreviewInfo title="图片提示词">
            <div className="grid gap-2 text-[13px] leading-6">
              {current?.videoDesc ? (
                <p>
                  <strong className="text-slate-200">场景描述：</strong>
                  {current.videoDesc}
                </p>
              ) : null}
              {current?.prompt ? (
                <p>
                  <strong className="text-slate-200">提示词：</strong>
                  {current.prompt}
                </p>
              ) : null}
            </div>
          </PreviewInfo>
        </aside>
      </div>

      <div className="shrink-0 border-t border-slate-800 pt-3">
        <div className="mb-3 flex items-center justify-between px-1">
          <div className="flex items-center gap-3 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                aria-label="全选分镜"
                checked={ordered.length > 0 && selectedIds.size === ordered.length}
                onChange={(event) => setSelectedIds(event.target.checked ? new Set(ordered.map((item) => item.id)) : new Set())}
              />
              全选
            </label>
            <button
              type="button"
              aria-label="恢复顺序"
              onClick={() => {
                if (window.confirm("确定恢复分镜的原始顺序吗？")) setOrderedIds(initialOrder.current);
              }}
              className="flex items-center gap-1 text-slate-300">
              <RotateCcw className="size-4" />
              恢复顺序
            </button>
          </div>
          <button type="button" aria-label="导出图片" onClick={() => void exportSelected()} className="flex items-center gap-1 text-sm text-blue-400">
            <Download className="size-4" />
            导出图片
          </button>
        </div>
        <div className="flex overflow-x-auto pb-1">
          {ordered.map((storyboard, index) => (
            <div
              key={storyboard.id}
              data-testid={`preview-shot-${storyboard.id}`}
              ref={(node) => {
                if (node) shotRefs.current.set(storyboard.id, node);
                else shotRefs.current.delete(storyboard.id);
              }}
              role="button"
              tabIndex={0}
              draggable
              onDragStart={(event: DragEvent<HTMLDivElement>) => {
                setDraggedId(storyboard.id);
                event.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                dropBefore(storyboard.id);
              }}
              onClick={() => goTo(index)}
              onKeyDown={(event) => {
                if (event.key === "Enter") goTo(index);
              }}
              className={`relative mr-3 h-[100px] w-40 shrink-0 overflow-hidden rounded-xl border-2 bg-slate-900 ${index === currentIndex ? "border-blue-500" : "border-transparent hover:border-blue-500"}`}>
              <input
                type="checkbox"
                aria-label={`选择分镜 ${storyboard.id}`}
                checked={selectedIds.has(storyboard.id)}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => {
                  setSelectedIds((ids) => {
                    const next = new Set(ids);
                    if (event.target.checked) next.add(storyboard.id);
                    else next.delete(storyboard.id);
                    return next;
                  });
                }}
                className="absolute left-2 top-2 z-10"
              />
              {storyboard.src ? (
                <img src={storyboard.src} alt={storyboard.videoDesc || `分镜 ${index + 1}`} className="size-full object-cover" />
              ) : (
                <ImageIcon className="m-auto size-6 text-slate-600" />
              )}
              <span className="absolute bottom-1.5 right-1.5 rounded bg-black/75 px-1.5 py-0.5 text-[10px]">#{storyboard.id}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function PreviewInfo({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-5 border-b border-slate-800 pb-4 last:border-0">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <span className="h-3.5 w-[3px] rounded bg-blue-500" />
        {title}
      </h2>
      <div className="text-sm leading-6 text-slate-300">{children}</div>
    </section>
  );
}

function modeLabel(mode: string) {
  try {
    const parsed = JSON.parse(mode) as unknown;
    if (Array.isArray(parsed)) {
      const labels: Record<string, string> = {
        videoReference: "视频",
        imageReference: "图片",
        audioReference: "音频",
        textReference: "文本",
      };
      const counts = new Map<string, number>();
      parsed.forEach((item) => {
        if (typeof item === "string") counts.set(item, (counts.get(item) ?? 0) + 1);
      });
      return `${[...counts].map(([item, count]) => `${labels[item] ?? item}${count > 1 ? ` ×${count}` : ""}`).join(" + ")}参考`;
    }
  } catch {
    // Scalar modes continue through the standard label map.
  }
  return (
    {
      singleImage: "单图",
      startEndRequired: "首尾帧",
      endFrameOptional: "尾帧可选",
      startFrameOptional: "首帧可选",
      text: "文本生视频",
    }[mode] ?? mode
  );
}

function serializeVideoMode(mode: ProductionVideoMode) {
  return Array.isArray(mode) ? JSON.stringify(mode) : mode;
}

function modelResolutions(detail: ProductionVideoModelDetail | undefined, duration?: number) {
  if (!detail) return [];
  const matched = duration == null ? detail.durationResolutionMap : detail.durationResolutionMap.filter((item) => item.duration.includes(duration));
  return [...new Set((matched.length ? matched : detail.durationResolutionMap).flatMap((item) => item.resolution))];
}

function modelDurations(detail: ProductionVideoModelDetail | undefined, resolution?: string) {
  if (!detail) return [];
  const matched = resolution ? detail.durationResolutionMap.filter((item) => item.resolution.includes(resolution)) : detail.durationResolutionMap;
  return [...new Set((matched.length ? matched : detail.durationResolutionMap).flatMap((item) => item.duration))].sort((a, b) => a - b);
}

interface VideoSettings {
  model: string;
  mode: string;
  resolution: string;
  audio: boolean;
}

function GenerationWorkbench({
  api,
  project,
  flowData,
  storyboards,
  tracks,
  setTracks,
  onAddTrack,
  onDeleteTrack,
  onGeneratePrompt,
  onGenerateVideo,
  onError,
}: {
  api: ProductionApi;
  project: ProductionProject;
  flowData: ProductionFlowData;
  storyboards: StoryboardItem[];
  tracks: VideoTrack[];
  setTracks: Dispatch<SetStateAction<VideoTrack[]>>;
  onAddTrack: () => Promise<void>;
  onDeleteTrack: (id: number) => Promise<void>;
  onGeneratePrompt: (id: number, settings: VideoSettings) => Promise<void>;
  onGenerateVideo: (id: number, settings: VideoSettings) => Promise<void>;
  onError: (message: string) => void;
}) {
  const [activeTrackIndex, setActiveTrackIndex] = useState(0);
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());
  const [referencePicker, setReferencePicker] = useState<{ trackId: number; slot?: number } | null>(null);
  const [settingsByTrack, setSettingsByTrack] = useState<Record<number, VideoSettings>>({});
  const [videoModels, setVideoModels] = useState<ProductionVideoModelOption[]>([]);
  const [modelDetails, setModelDetails] = useState<Record<string, ProductionVideoModelDetail>>({});
  const activeTrack = tracks[activeTrackIndex] ?? null;
  const settings = activeTrack
    ? (settingsByTrack[activeTrack.id] ?? {
        model: project.videoModel,
        mode: project.videoMode,
        resolution: project.videoResolution ?? "1080p",
        audio: project.videoAudio ?? false,
      })
    : null;
  const modelDetail = settings ? modelDetails[settings.model] : undefined;
  const modeOptions = modelDetail?.mode.map(serializeVideoMode) ?? (settings?.mode ? [settings.mode] : []);
  const durationOptions = modelDurations(modelDetail, settings?.resolution);
  const resolutionOptions = modelResolutions(modelDetail, activeTrack?.duration);
  const videoModelGroups = useMemo(() => {
    const groups = new Map<string, ProductionVideoModelOption[]>();
    videoModels.forEach((model) => groups.set(model.vendorName, [...(groups.get(model.vendorName) ?? []), model]));
    return [...groups];
  }, [videoModels]);

  useEffect(() => {
    let cancelled = false;
    if (!api.listVideoModels) {
      setVideoModels([{ id: project.videoModel, label: project.videoModel, vendorName: "项目配置" }]);
      return;
    }
    void api
      .listVideoModels()
      .then((models) => {
        if (cancelled) return;
        setVideoModels(
          models.some((model) => model.id === project.videoModel)
            ? models
            : [{ id: project.videoModel, label: project.videoModel, vendorName: "项目配置" }, ...models],
        );
      })
      .catch((cause) => {
        if (!cancelled) onError(`视频模型列表加载失败：${messageOf(cause)}`);
      });
    return () => {
      cancelled = true;
    };
  }, [api, onError, project.videoModel]);

  useEffect(() => {
    if (!activeTrack || !settings?.model || !api.getVideoModelDetail) return;
    const trackId = activeTrack.id;
    const trackDuration = activeTrack.duration;
    const baseline = settings;
    let cancelled = false;
    void api
      .getVideoModelDetail(settings.model)
      .then((detail) => {
        if (cancelled) return;
        setModelDetails((current) => ({ ...current, [baseline.model]: detail }));
        const modes = detail.mode.map(serializeVideoMode);
        const mode = modes.includes(baseline.mode) ? baseline.mode : (modes[0] ?? "");
        const firstMap = detail.durationResolutionMap[0];
        const allResolutions = modelResolutions(detail);
        const resolution = allResolutions.includes(baseline.resolution) ? baseline.resolution : (firstMap?.resolution[0] ?? allResolutions[0] ?? "");
        const durations = modelDurations(detail, resolution);
        const duration = durations.includes(trackDuration) ? trackDuration : (firstMap?.duration[0] ?? durations[0] ?? trackDuration);
        const audio = detail.audio === false ? false : detail.audio === true ? true : baseline.audio;
        setSettingsByTrack((current) => ({
          ...current,
          [trackId]: { model: baseline.model, mode, resolution, audio },
        }));
        if (duration !== trackDuration) {
          setTracks((current) => current.map((track) => (track.id === trackId ? { ...track, duration } : track)));
        }
      })
      .catch((cause) => {
        if (!cancelled) onError(`视频模型能力加载失败：${messageOf(cause)}`);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTrack?.id, api, onError, settings?.model, setTracks]);

  useEffect(() => {
    if (activeTrackIndex >= tracks.length) setActiveTrackIndex(Math.max(0, tracks.length - 1));
    setCheckedIds((current) => new Set([...current].filter((id) => tracks.some((track) => track.id === id))));
  }, [activeTrackIndex, tracks]);

  function updateSettings(patch: Partial<VideoSettings>) {
    if (!activeTrack || !settings) return;
    setSettingsByTrack((current) => ({ ...current, [activeTrack.id]: { ...settings, ...patch } }));
  }

  function updateActiveTrack(update: (track: VideoTrack) => VideoTrack) {
    if (!activeTrack) return;
    setTracks((current) => current.map((track) => (track.id === activeTrack.id ? update(track) : track)));
  }

  function changeMode(nextMode: string) {
    if (!activeTrack || !settings || nextMode === settings.mode) return;
    if ((activeTrack.medias.length || activeTrack.prompt) && !window.confirm("切换模式会清空当前参考素材和提示词，确定切换吗？")) return;
    updateSettings({ mode: nextMode });
    updateActiveTrack((track) => ({ ...track, medias: [], prompt: "" }));
  }

  function changeModel(nextModel: string) {
    if (!activeTrack || !settings || nextModel === settings.model) return;
    if (
      (activeTrack.medias.length || activeTrack.prompt) &&
      !window.confirm("切换模型会重新校正模式和生成参数，并清空当前参考素材和提示词。确定切换吗？")
    )
      return;
    updateSettings({ model: nextModel });
    updateActiveTrack((track) => ({ ...track, medias: [], prompt: "" }));
  }

  function inferFileType(src: string): TrackMedia["fileType"] {
    const extension = src.split(/[?#]/, 1)[0].split(".").pop()?.toLowerCase();
    if (extension && ["mp4", "webm", "mov", "avi", "mkv"].includes(extension)) return "video";
    if (extension && ["mp3", "wav", "ogg", "aac", "flac", "m4a"].includes(extension)) return "audio";
    return "image";
  }

  function selectReference(media: TrackMedia) {
    if (!referencePicker) return;
    setTracks((current) =>
      current.map((track) => {
        if (track.id !== referencePicker.trackId) return track;
        const mode = settingsByTrack[track.id]?.mode ?? project.videoMode;
        if (typeof referencePicker.slot === "number") {
          const medias = [...track.medias];
          while (medias.length < 2) medias.push({ fileType: "image", src: "", selected: false });
          medias[referencePicker.slot] = media;
          return { ...track, medias };
        }
        if (mode === "singleImage") return { ...track, medias: [media] };
        return { ...track, medias: [...track.medias.filter((item) => item.src), media] };
      }),
    );
    setReferencePicker(null);
  }

  function removeReference(index: number) {
    if (!activeTrack || !settings) return;
    updateActiveTrack((track) => {
      if (["startEndRequired", "endFrameOptional", "startFrameOptional"].includes(settings.mode)) {
        const medias = [...track.medias];
        medias[index] = { fileType: "image", src: "", selected: false };
        return { ...track, medias };
      }
      return { ...track, medias: track.medias.filter((_, itemIndex) => itemIndex !== index) };
    });
  }

  async function batchPrompt() {
    for (const track of tracks.filter((item) => checkedIds.has(item.id))) {
      const trackSettings = settingsByTrack[track.id] ?? {
        model: project.videoModel,
        mode: project.videoMode,
        resolution: project.videoResolution ?? "1080p",
        audio: project.videoAudio ?? false,
      };
      await onGeneratePrompt(track.id, trackSettings);
    }
    setCheckedIds(new Set());
  }

  async function batchVideo() {
    const selected = tracks.filter((item) => checkedIds.has(item.id));
    if (selected.some((track) => !track.prompt)) {
      onError("已跳过视频提示词为空的轨道");
      return;
    }
    if (!window.confirm("确认批量生成所选轨道的视频吗？")) return;
    for (const track of selected) {
      const trackSettings = settingsByTrack[track.id] ?? {
        model: project.videoModel,
        mode: project.videoMode,
        resolution: project.videoResolution ?? "1080p",
        audio: project.videoAudio ?? false,
      };
      await onGenerateVideo(track.id, trackSettings);
    }
    setCheckedIds(new Set());
  }

  function batchDownload() {
    const videos = tracks
      .filter((track) => checkedIds.has(track.id))
      .flatMap((track) => track.videoList.filter((video) => video.id === track.selectVideoId && video.src));
    videos.forEach((video, index) => {
      const anchor = document.createElement("a");
      anchor.href = video.src;
      anchor.download = `分镜${index + 1}.mp4`;
      anchor.target = "_blank";
      anchor.rel = "noreferrer";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    });
    setCheckedIds(new Set());
  }

  const allReferenceItems = useMemo(
    () => [
      ...flowData.assets
        .flatMap((asset) => [asset, ...asset.derive])
        .filter((asset) => asset.src)
        .map((asset) => ({
          id: asset.id,
          sources: "assets" as const,
          fileType: inferFileType(asset.src),
          src: asset.src,
          name: asset.name,
          prompt: asset.prompt,
        })),
      ...storyboards
        .filter((storyboard) => storyboard.src)
        .map((storyboard) => ({
          id: storyboard.id,
          sources: "storyboard" as const,
          fileType: "image" as const,
          src: storyboard.src,
          name: `P${storyboard.index + 1}`,
          prompt: storyboard.videoDesc,
        })),
    ],
    [flowData.assets, storyboards],
  );

  return (
    <section aria-label="视频生成" className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto pr-1">
      {activeTrack && settings ? (
        <>
          <div className="flex shrink-0 gap-2 overflow-x-auto pb-1" aria-label="参考素材">
            {["startEndRequired", "endFrameOptional", "startFrameOptional"].includes(settings.mode)
              ? [0, 1].map((slot) => {
                  const media = activeTrack.medias[slot];
                  const optional = (slot === 0 && settings.mode === "startFrameOptional") || (slot === 1 && settings.mode === "endFrameOptional");
                  return (
                    <ReferenceSlot
                      key={slot}
                      media={media?.src ? media : undefined}
                      label={`${slot === 0 ? "首帧" : "尾帧"}${optional ? "（可选）" : ""}`}
                      onAdd={() => setReferencePicker({ trackId: activeTrack.id, slot })}
                      onRemove={() => removeReference(slot)}
                    />
                  );
                })
              : activeTrack.medias
                  .filter((media) => media.src)
                  .map((media, index) => (
                    <ReferenceSlot
                      key={`${media.sources}-${media.id}-${index}`}
                      media={media}
                      onAdd={() => undefined}
                      onRemove={() => removeReference(index)}
                    />
                  ))}
            {settings.mode !== "text" &&
            !["startEndRequired", "endFrameOptional", "startFrameOptional"].includes(settings.mode) &&
            !(settings.mode === "singleImage" && activeTrack.medias.some((media) => media.src)) ? (
              <ReferenceSlot label="添加参考" onAdd={() => setReferencePicker({ trackId: activeTrack.id })} onRemove={() => undefined} />
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-2" aria-label="视频模型设置">
            <select
              aria-label="视频模型"
              value={settings.model}
              onChange={(event) => changeModel(event.target.value)}
              className="h-8 min-w-52 rounded border border-slate-700 bg-slate-950 px-2 text-xs">
              {!videoModels.some((model) => model.id === settings.model) ? <option value={settings.model}>{settings.model}</option> : null}
              {videoModelGroups.map(([vendor, models]) => (
                <optgroup key={vendor} label={vendor}>
                  {models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <select
              aria-label="视频模式"
              value={settings.mode}
              onChange={(event) => changeMode(event.target.value)}
              className="h-8 min-w-40 rounded border border-slate-700 bg-slate-950 px-2 text-xs">
              {[...new Set([...modeOptions, settings.mode])].filter(Boolean).map((mode) => (
                <option key={mode} value={mode}>
                  {modeLabel(mode)}
                </option>
              ))}
            </select>
            <button
              type="button"
              aria-label="切换音频"
              aria-pressed={settings.audio}
              disabled={modelDetail ? modelDetail.audio !== "optional" : false}
              onClick={() => updateSettings({ audio: !settings.audio })}
              className={`grid size-8 place-items-center rounded border disabled:cursor-not-allowed disabled:opacity-50 ${settings.audio ? "border-emerald-600 text-emerald-400" : "border-red-800 text-red-400"}`}>
              {settings.audio ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
            </button>
            <select
              aria-label="视频分辨率"
              value={settings.resolution}
              onChange={(event) => {
                const resolution = event.target.value;
                updateSettings({ resolution });
                const durations = modelDurations(modelDetail, resolution);
                if (durations.length && !durations.includes(activeTrack.duration)) {
                  updateActiveTrack((track) => ({ ...track, duration: durations[0] }));
                  void apiVoid(onError, () => api.updateTrackDuration(activeTrack.id, durations[0]));
                }
              }}
              className="h-8 rounded border border-slate-700 bg-slate-950 px-2 text-xs">
              {[...new Set([...resolutionOptions, settings.resolution])].filter(Boolean).map((resolution) => (
                <option key={resolution} value={resolution}>
                  {resolution}
                </option>
              ))}
            </select>
            <label className="flex h-8 items-center gap-1 rounded border border-slate-700 px-2 text-xs">
              时长
              <select
                aria-label={`轨道时长 ${activeTrack.id}`}
                value={activeTrack.duration}
                onChange={(event) => {
                  const duration = Number(event.target.value);
                  updateActiveTrack((track) => ({ ...track, duration }));
                  void apiVoid(onError, () => api.updateTrackDuration(activeTrack.id, duration));
                }}
                className="w-14 bg-transparent text-right outline-none">
                {[...new Set([...durationOptions, activeTrack.duration])].map((duration) => (
                  <option key={duration} value={duration}>
                    {duration}
                  </option>
                ))}
              </select>
              s
            </label>
          </div>

          <div className="flex min-h-[260px] flex-1 gap-[5px]">
            <article className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
              <header className="flex h-12 shrink-0 items-center justify-between border-b border-slate-800 px-4">
                <h2 className="font-medium">#{activeTrackIndex + 1} 生成提示词</h2>
                <button
                  type="button"
                  aria-label="生成轨道提示词"
                  disabled={activeTrack.state === "running"}
                  onClick={() => void onGeneratePrompt(activeTrack.id, settings)}
                  className="rounded bg-blue-600 px-3 py-1.5 text-xs disabled:opacity-50">
                  生成提示词
                </button>
              </header>
              <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-4">
                {activeTrack.medias.some((media) => media.src) ? (
                  <div aria-label="提示词引用" className="flex flex-wrap gap-2">
                    {activeTrack.medias
                      .filter((media) => media.src)
                      .map((media, index) => (
                        <span
                          key={`${media.sources}-${media.id}-${index}`}
                          className="flex items-center gap-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-300">
                          {media.fileType === "image" ? <ImageIcon className="size-3" /> : <Film className="size-3" />}
                          {media.name || `${media.sources === "storyboard" ? "分镜" : "资产"} #${media.id}`}
                        </span>
                      ))}
                  </div>
                ) : null}
                <textarea
                  aria-label={`轨道提示词 ${activeTrack.id}`}
                  value={activeTrack.prompt}
                  onChange={(event) => updateActiveTrack((track) => ({ ...track, prompt: event.target.value }))}
                  onBlur={() => void apiVoid(onError, () => api.updateTrackPrompt(activeTrack.id, activeTrack.prompt))}
                  placeholder="请输入提示词，可以结合上方引用素材描述镜头运动和画面变化"
                  className="min-h-40 flex-1 resize-none bg-transparent text-sm leading-6 outline-none"
                />
                <FailureReason>{activeTrack.errorReason}</FailureReason>
              </div>
            </article>

            <article
              data-testid={`video-track-${activeTrack.id}`}
              className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
              <header className="flex h-12 shrink-0 items-center justify-between border-b border-slate-800 px-4">
                <h2 className="font-medium">#{activeTrackIndex + 1} 视频</h2>
                <button
                  type="button"
                  aria-label="生成视频"
                  disabled={activeTrack.state === "running" || !settings.model || !activeTrack.prompt}
                  onClick={() => void onGenerateVideo(activeTrack.id, settings)}
                  className="rounded bg-blue-600 px-3 py-1.5 text-xs disabled:opacity-50">
                  生成
                </button>
              </header>
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                <h3 className="mb-2 flex items-center gap-1.5 text-xs text-slate-400">历史版本（{activeTrack.videoList.length}）</h3>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-2.5">
                  {activeTrack.videoList.map((video) => (
                    <div
                      key={video.id}
                      className={`group relative h-[90px] w-[130px] overflow-hidden rounded border-2 bg-slate-900 ${activeTrack.selectVideoId === video.id ? "border-blue-500" : "border-transparent"}`}>
                      {video.state === "completed" && video.src ? (
                        <video src={video.src} muted preload="metadata" className="size-full object-cover" />
                      ) : null}
                      {video.state === "running" ? (
                        <div className="absolute inset-0 grid place-items-center bg-black/45 text-xs">
                          <LoaderCircle className="size-5 animate-spin" />
                          生成中
                        </div>
                      ) : null}
                      {video.state === "failed" ? (
                        <div title={video.errorReason} className="absolute bottom-1 left-1 rounded bg-red-600 px-1.5 py-0.5 text-[10px]">
                          生成失败
                        </div>
                      ) : null}
                      <button
                        type="button"
                        aria-label={`选择视频 ${video.id}`}
                        onClick={() => void selectHistoryVideo(activeTrack.id, video.id)}
                        className="absolute bottom-1 right-1 hidden size-6 place-items-center rounded-full bg-black/60 group-hover:grid">
                        <Check className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label={`删除视频 ${video.id}`}
                        onClick={() => void deleteHistoryVideo(activeTrack.id, video.id)}
                        className="absolute right-1 top-1 hidden size-6 place-items-center rounded-full bg-black/60 group-hover:grid">
                        <Trash2 className="size-3.5" />
                      </button>
                      {video.state === "completed" && video.src ? (
                        <a
                          href={video.src}
                          download={`video-${video.id}.mp4`}
                          aria-label={`下载视频 ${video.id}`}
                          className="absolute bottom-1 left-1 hidden size-6 place-items-center rounded-full bg-black/60 group-hover:grid">
                          <Download className="size-3.5" />
                        </a>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            </article>
          </div>

          <div className="shrink-0 rounded-lg border border-slate-800 bg-slate-950 p-4">
            <div className="mb-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs">
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    aria-label="全选轨道"
                    checked={tracks.length > 0 && checkedIds.size === tracks.length}
                    onChange={(event) => setCheckedIds(event.target.checked ? new Set(tracks.map((track) => track.id)) : new Set())}
                  />
                  全选
                </label>
                {checkedIds.size ? <span className="text-slate-400">已选 {checkedIds.size} 段</span> : null}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={batchDownload} className="rounded border border-slate-700 px-2 py-1 text-xs">
                  批量下载视频
                </button>
                <button type="button" onClick={() => void batchPrompt()} className="rounded border border-slate-700 px-2 py-1 text-xs">
                  批量生成提示词
                </button>
                <button type="button" onClick={() => void batchVideo()} className="rounded border border-slate-700 px-2 py-1 text-xs">
                  批量生成视频
                </button>
              </div>
            </div>
            <div className="flex h-[150px] gap-2.5 overflow-x-auto pb-1">
              {tracks.map((track, index) => {
                const selectedVideo = track.videoList.find((video) => video.id === track.selectVideoId && video.src);
                return (
                  <div
                    key={track.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setActiveTrackIndex(index)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") setActiveTrackIndex(index);
                    }}
                    className={`group relative h-full w-[150px] shrink-0 overflow-hidden rounded-lg border-2 bg-slate-900 ${index === activeTrackIndex ? "border-blue-500" : "border-transparent"}`}>
                    <input
                      type="checkbox"
                      aria-label={`选择轨道 ${track.id}`}
                      checked={checkedIds.has(track.id)}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) =>
                        setCheckedIds((current) => {
                          const next = new Set(current);
                          if (event.target.checked) next.add(track.id);
                          else next.delete(track.id);
                          return next;
                        })
                      }
                      className="absolute left-2 top-2 z-20"
                    />
                    <span className="absolute bottom-2 left-2 z-20 rounded bg-blue-600 px-1.5 py-0.5 text-[10px]">#{index + 1}</span>
                    {track.selectVideoId ? (
                      <span className="absolute left-2 top-8 z-20 rounded bg-emerald-600 px-1.5 py-0.5 text-[10px]">已选择</span>
                    ) : null}
                    {selectedVideo ? (
                      <video src={selectedVideo.src} muted preload="metadata" className="size-full object-cover" />
                    ) : track.medias.find((media) => media.src)?.src ? (
                      <img src={track.medias.find((media) => media.src)!.src} alt={`轨道 ${index + 1}`} className="size-full object-cover" />
                    ) : (
                      <span className="grid size-full place-items-center text-xs text-slate-500">空轨道 {index + 1}</span>
                    )}
                    <button
                      type="button"
                      aria-label={`删除轨道 ${track.id}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (window.confirm("确定删除该轨道吗？")) void onDeleteTrack(track.id);
                      }}
                      className="absolute right-2 top-2 z-20 hidden size-6 place-items-center rounded-full bg-black/60 group-hover:grid">
                      <X className="size-3.5" />
                    </button>
                  </div>
                );
              })}
              <button
                type="button"
                aria-label="新增视频轨道"
                onClick={() => void onAddTrack()}
                className="grid h-full w-[150px] shrink-0 place-items-center rounded-lg border border-dashed border-slate-700 text-slate-400">
                <Plus className="size-9" />
              </button>
            </div>
          </div>
        </>
      ) : (
        <button
          type="button"
          aria-label="新增视频轨道"
          onClick={() => void onAddTrack()}
          className="grid min-h-48 place-items-center rounded-lg border border-dashed border-slate-700 text-slate-400">
          <Plus className="size-9" />
        </button>
      )}

      {referencePicker ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="选择参考素材"
          className="fixed inset-0 z-[140] grid place-items-center bg-black/65 p-6"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setReferencePicker(null);
          }}>
          <div className="max-h-[70vh] w-full max-w-4xl overflow-y-auto rounded-xl border border-slate-700 bg-slate-950 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-medium">选择参考素材</h2>
              <button type="button" aria-label="关闭参考素材选择" onClick={() => setReferencePicker(null)}>
                <X className="size-5" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
              {allReferenceItems.map((media, index) => (
                <button
                  key={`${media.sources}-${media.id}-${index}`}
                  type="button"
                  aria-label={`选择参考素材 ${media.name || media.id}`}
                  onClick={() => selectReference(media)}
                  className="relative aspect-square overflow-hidden rounded-lg border border-slate-700 bg-slate-900">
                  {media.fileType === "image" ? (
                    <img src={media.src} alt={media.name} className="size-full object-cover" />
                  ) : (
                    <span className="grid size-full place-items-center">
                      <Film className="size-6" />
                    </span>
                  )}
                  <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px]">
                    {media.sources === "storyboard" ? "分镜" : "资产"}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );

  async function selectHistoryVideo(trackId: number, videoId: number) {
    try {
      // Actual persistence stays on the parent API adapter through this closure.
      await api.selectVideo(trackId, videoId);
      setTracks((current) => current.map((track) => (track.id === trackId ? { ...track, selectVideoId: videoId } : track)));
    } catch (cause) {
      onError(messageOf(cause));
    }
  }

  async function deleteHistoryVideo(trackId: number, videoId: number) {
    try {
      await api.deleteVideo(videoId);
      setTracks((current) =>
        current.map((track) =>
          track.id === trackId
            ? {
                ...track,
                videoList: track.videoList.filter((video) => video.id !== videoId),
                selectVideoId: track.selectVideoId === videoId ? null : track.selectVideoId,
              }
            : track,
        ),
      );
    } catch (cause) {
      onError(messageOf(cause));
    }
  }
}

function ReferenceSlot({ media, label, onAdd, onRemove }: { media?: TrackMedia; label?: string; onAdd: () => void; onRemove: () => void }) {
  return media ? (
    <div className="group relative size-20 shrink-0 overflow-hidden rounded-lg border border-dashed border-slate-700 bg-slate-900">
      {media.fileType === "image" ? (
        <img src={media.src} alt={media.name || "参考素材"} className="size-full object-cover" />
      ) : media.fileType === "video" ? (
        <video src={media.src} muted preload="metadata" className="size-full object-cover" />
      ) : (
        <span className="grid size-full place-items-center text-xs">音频</span>
      )}
      <button
        type="button"
        aria-label={`移除参考素材 ${media.id ?? ""}`}
        onClick={onRemove}
        className="absolute right-1 top-1 hidden size-[18px] place-items-center rounded-full bg-black/60 group-hover:grid">
        <X className="size-3" />
      </button>
      <span className="absolute bottom-1 right-1 hidden rounded bg-black/65 px-1 py-0.5 text-[10px] group-hover:block">
        {media.sources === "storyboard" ? "分镜" : "资产"}
      </span>
    </div>
  ) : (
    <button
      type="button"
      onClick={onAdd}
      className="grid size-20 shrink-0 place-items-center rounded-lg border border-dashed border-slate-700 text-xs text-slate-400">
      <span className="grid place-items-center gap-1">
        <Plus className="size-6" />
        {label}
      </span>
    </button>
  );
}

async function apiVoid(onError: (message: string) => void, operation: () => Promise<void>) {
  try {
    await operation();
  } catch (cause) {
    onError(messageOf(cause));
  }
}

export function ProductionWorkbench({
  api,
  project,
  pollIntervalMs = 3_000,
  initialView = "generation",
  onOpenAgent,
  renderProductionAgent,
}: ProductionWorkbenchProps) {
  const [scripts, setScripts] = useState<ScriptSummary[]>([]);
  const [scriptId, setScriptId] = useState<number | null>(null);
  const [flowData, setFlowData] = useState<ProductionFlowData>(emptyFlow);
  const [tracks, setTracks] = useState<VideoTrack[]>([]);
  const [mediaLibrary, setMediaLibrary] = useState<ProductionMediaItem[]>([]);
  const [mediaError, setMediaError] = useState("");
  const [tab, setTab] = useState<"generation" | "flow" | "editor">(initialView);
  const [workbenchOpen, setWorkbenchOpen] = useState(initialView !== "flow");
  const [activeWorkbenchMenu, setActiveWorkbenchMenu] = useState<WorkbenchMenu>(initialView === "editor" ? "editVideo" : "generate");
  const [editorActivated, setEditorActivated] = useState(initialView === "editor");
  const [loading, setLoading] = useState(true);
  const [switchingScript, setSwitchingScript] = useState(false);
  const [error, setError] = useState("");
  const [agentPanelOpen, setAgentPanelOpen] = useState(true);
  const [productionAgentBusy, setProductionAgentBusy] = useState(false);
  const [agentPanelWidth, setAgentPanelWidth] = useState(400);
  const [canvasFps, setCanvasFps] = useState(0);
  const [flowRevision, setFlowRevision] = useState(0);
  const flowRevisionRef = useRef(0);
  const loadSequence = useRef(0);
  const agentResize = useRef<{ startX: number; startWidth: number } | null>(null);
  const storyboards = flowData.storyboard;
  const bumpFlowRevision = useCallback(() => {
    flowRevisionRef.current += 1;
    setFlowRevision(flowRevisionRef.current);
  }, []);
  const setStoryboards: StoryboardSetter = useCallback(
    (update) => {
      setFlowData((current) => ({
        ...current,
        storyboard: typeof update === "function" ? update(current.storyboard) : update,
      }));
      bumpFlowRevision();
    },
    [bumpFlowRevision],
  );
  const acceptCanvasFlowData = useCallback((next: ProductionFlowData, baseRevision: number) => {
    setFlowData((current) =>
      baseRevision === flowRevisionRef.current
        ? next
        : {
            ...next,
            storyboard: current.storyboard,
          },
    );
  }, []);

  useEffect(() => {
    if (tab !== "flow" || !workbenchOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setWorkbenchOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [tab, workbenchOpen]);

  useEffect(() => {
    const handleMove = (event: PointerEvent) => {
      const resize = agentResize.current;
      if (!resize) return;
      const maximum = Math.max(400, Math.floor(window.innerWidth * 0.8));
      setAgentPanelWidth(Math.min(maximum, Math.max(400, resize.startWidth + resize.startX - event.clientX)));
    };
    const handleUp = () => {
      agentResize.current = null;
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
    };
  }, []);

  function beginAgentResize(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    agentResize.current = { startX: event.clientX, startWidth: agentPanelWidth };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  function resizeAgentByKeyboard(delta: number) {
    const maximum = Math.max(400, Math.floor(window.innerWidth * 0.8));
    setAgentPanelWidth((current) => Math.min(maximum, Math.max(400, current + delta)));
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    void api
      .listScripts(project.id)
      .then((items) => {
        if (!active) return;
        setScripts(items);
        setScriptId((current) => (items.some((item) => item.id === current) ? current : (items[0]?.id ?? null)));
        if (!items.length) setLoading(false);
      })
      .catch((cause) => {
        if (active) {
          setError(messageOf(cause));
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [api, project.id]);

  const loadProductionData = useCallback(
    async (nextScriptId: number) => {
      const sequence = ++loadSequence.current;
      setLoading(true);
      setError("");
      setMediaError("");
      setMediaLibrary([]);
      void api
        .getMediaLibrary(project.id, nextScriptId)
        .then((media) => {
          if (loadSequence.current === sequence) setMediaLibrary(media);
        })
        .catch((cause) => {
          if (loadSequence.current === sequence) setMediaError(`剪辑素材库加载失败：${messageOf(cause)}`);
        });
      try {
        const [flow, generation] = await Promise.all([api.getFlowData(project.id, nextScriptId), api.getGenerationData(project.id, nextScriptId)]);
        if (loadSequence.current !== sequence) return;
        setFlowData({ ...flow, storyboard: flow.storyboard.length ? flow.storyboard : generation.storyboardList });
        setTracks(
          generation.trackList.map((track) => ({
            ...track,
            medias: track.medias.map((media) => ({ ...media, selected: media.selected !== false })),
          })),
        );
        bumpFlowRevision();
        return true;
      } catch (cause) {
        if (loadSequence.current === sequence) setError(messageOf(cause));
        return false;
      } finally {
        if (loadSequence.current === sequence) setLoading(false);
      }
    },
    [api, bumpFlowRevision, project.id],
  );

  const refreshSelectedFlow = useCallback(() => {
    if (scriptId == null) return;
    void loadProductionData(scriptId);
  }, [loadProductionData, scriptId]);

  function retryMediaLibrary() {
    if (scriptId == null) return;
    setMediaError("");
    void api
      .getMediaLibrary(project.id, scriptId)
      .then(setMediaLibrary)
      .catch((cause) => setMediaError(`剪辑素材库加载失败：${messageOf(cause)}`));
  }

  useEffect(() => {
    if (scriptId != null) void loadProductionData(scriptId);
  }, [loadProductionData, scriptId]);

  async function switchScript(nextScriptId: number) {
    if (nextScriptId === scriptId) return;
    setSwitchingScript(true);
    setError("");
    try {
      const latestScripts = await api.listScripts(project.id);
      setScripts(latestScripts);
      const scriptAgentBusy = latestScripts.find((script) => script.id === scriptId)?.state === "running";
      const hasRunningTask =
        productionAgentBusy ||
        scriptAgentBusy ||
        storyboards.some((item) => item.state === "running") ||
        tracks.some((track) => track.state === "running" || track.videoList.some((video) => video.state === "running"));
      if (hasRunningTask && !window.confirm("当前生产智能体或生成任务仍在运行，切换后任务会继续在后台执行。确定切换吗？")) return;
      if (scriptId != null) await api.saveFlowData(project.id, scriptId, flowData);
      setScriptId(nextScriptId);
    } catch (cause) {
      setError(`切换剧本前保存失败：${messageOf(cause)}`);
    } finally {
      setSwitchingScript(false);
    }
  }

  function openCanvasWorkbench() {
    setActiveWorkbenchMenu("preview");
    setWorkbenchOpen(true);
  }

  function changeWorkbenchMenu(nextMenu: WorkbenchMenu) {
    if (nextMenu === "editVideo") setEditorActivated(true);
    setActiveWorkbenchMenu(nextMenu);
  }

  const runningStoryboardIds = useMemo(() => storyboards.filter((item) => item.state === "running").map((item) => item.id), [storyboards]);
  const runningVideoIds = useMemo(
    () => tracks.flatMap((track) => track.videoList.filter((video) => video.state === "running").map((video) => video.id)),
    [tracks],
  );

  useEffect(() => {
    if (!runningStoryboardIds.length) return;
    let cancelled = false;
    let timer = 0;
    let failures = 0;
    const poll = async () => {
      try {
        const updates = await api.pollStoryboards(runningStoryboardIds);
        if (cancelled) return;
        setStoryboards((current) => updateStoryboards(current, updates));
        failures = 0;
      } catch (cause) {
        if (cancelled) return;
        failures += 1;
        setError(`分镜轮询暂时失败，将自动恢复：${messageOf(cause)}`);
      }
      if (!cancelled) timer = window.setTimeout(poll, nextPollDelay(pollIntervalMs, failures));
    };
    timer = window.setTimeout(poll, pollIntervalMs);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [api, pollIntervalMs, runningStoryboardIds.join(",")]);

  useEffect(() => {
    if (scriptId == null || !runningVideoIds.length) return;
    let cancelled = false;
    let timer = 0;
    let failures = 0;
    const poll = async () => {
      try {
        const updates = await api.pollVideos(project.id, scriptId, runningVideoIds);
        if (cancelled) return;
        setTracks((current) => updateVideos(current, updates));
        failures = 0;
      } catch (cause) {
        if (cancelled) return;
        failures += 1;
        setError(`视频轮询暂时失败，将自动恢复：${messageOf(cause)}`);
      }
      if (!cancelled) timer = window.setTimeout(poll, nextPollDelay(pollIntervalMs, failures));
    };
    timer = window.setTimeout(poll, pollIntervalMs);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [api, pollIntervalMs, project.id, runningVideoIds.join(","), scriptId]);

  async function addTrack() {
    if (scriptId == null) return;
    try {
      const id = await api.addTrack(project.id, scriptId, 5);
      setTracks((current) => [...current, { id, prompt: "", duration: 5, state: "idle", errorReason: "", medias: [], videoList: [] }]);
    } catch (cause) {
      setError(messageOf(cause));
    }
  }

  async function deleteTrack(id: number) {
    try {
      await api.deleteTrack(id);
      setTracks((current) => current.filter((track) => track.id !== id));
    } catch (cause) {
      setError(messageOf(cause));
    }
  }

  async function generatePrompt(trackId: number, settings: VideoSettings) {
    const track = tracks.find((item) => item.id === trackId);
    if (!track) return;
    setTracks((current) => current.map((item) => (item.id === trackId ? { ...item, state: "running", errorReason: "" } : item)));
    try {
      const prompt = await api.generateVideoPrompt(project.id, track, settings.model, settings.mode);
      setTracks((current) => current.map((item) => (item.id === trackId ? { ...item, prompt, state: "completed" } : item)));
    } catch (cause) {
      setTracks((current) => current.map((item) => (item.id === trackId ? { ...item, state: "failed", errorReason: messageOf(cause) } : item)));
    }
  }

  async function generateVideo(trackId: number, settings: VideoSettings) {
    if (scriptId == null) return;
    const track = tracks.find((item) => item.id === trackId);
    if (!track) return;
    setTracks((current) => current.map((item) => (item.id === trackId ? { ...item, state: "running", errorReason: "" } : item)));
    try {
      const videoId = await api.generateVideo({
        projectId: project.id,
        scriptId,
        track,
        model: settings.model,
        mode: settings.mode,
        resolution: settings.resolution,
        audio: settings.audio,
      });
      setTracks((current) =>
        current.map((item) =>
          item.id === trackId
            ? { ...item, state: "running", videoList: [...item.videoList, { id: videoId, src: "", state: "running", errorReason: "" }] }
            : item,
        ),
      );
    } catch (cause) {
      setTracks((current) => current.map((item) => (item.id === trackId ? { ...item, state: "failed", errorReason: messageOf(cause) } : item)));
    }
  }

  const completedVideos = tracks.flatMap((track) =>
    track.videoList
      .filter((video) => video.state === "completed" && video.src)
      .map((video) => ({ ...video, duration: video.duration ?? track.duration })),
  );

  useEffect(() => {
    if (tab !== "flow" || agentPanelOpen) return;
    let animationFrame = 0;
    let lastFrameTime = performance.now();
    let frameCount = 0;
    const animate = (now: number) => {
      frameCount += 1;
      const elapsed = now - lastFrameTime;
      if (elapsed >= 500) {
        setCanvasFps(Math.round((frameCount * 1_000) / elapsed));
        frameCount = 0;
        lastFrameTime = now;
      }
      animationFrame = window.requestAnimationFrame(animate);
    };
    animationFrame = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [agentPanelOpen, tab]);

  const canvasSurface =
    tab === "flow"
      ? (() => {
          const flowControls =
            scriptId != null ? (
              <div className="flex items-center gap-2">
                <label className="flex h-10 items-center gap-2 rounded-lg border border-slate-700 bg-slate-950/95 px-3 text-slate-300 shadow-lg">
                  <FolderOpen className="size-5 shrink-0" />
                  <select
                    aria-label="当前剧本"
                    value={scriptId}
                    disabled={switchingScript}
                    onChange={(event) => void switchScript(Number(event.target.value))}
                    className="min-w-48 bg-transparent text-sm text-slate-200 outline-none disabled:opacity-50">
                    {scripts.map((script) => (
                      <option key={script.id} value={script.id}>
                        {script.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  title="重新读取产线数据"
                  aria-label="刷新生产数据"
                  disabled={loading}
                  onClick={refreshSelectedFlow}
                  className="grid size-10 place-items-center rounded-lg border border-slate-700 bg-slate-950/95 text-slate-300 shadow-lg hover:bg-slate-900 disabled:opacity-50">
                  <RefreshCw className="size-4" />
                </button>
              </div>
            ) : null;

          return (
            <main className="relative h-screen overflow-hidden bg-[#090b10] text-slate-100">
              {scriptId != null ? (
                <ProductionFlowBoard
                  api={api}
                  projectId={project.id}
                  scriptId={scriptId}
                  initialData={flowData}
                  externalRevision={flowRevision}
                  immersive
                  leadingControls={flowControls}
                  trailingControls={loading ? <LoaderCircle aria-label="正在读取生产数据" className="size-5 animate-spin text-slate-300" /> : null}
                  imageModel={project.imageModel || "pancat:pancat-image"}
                  pollIntervalMs={pollIntervalMs}
                  onChange={acceptCanvasFlowData}
                  onOpenWorkbench={openCanvasWorkbench}
                />
              ) : loading ? (
                <div className="absolute inset-0 z-20 flex items-center justify-center gap-2 text-sm text-slate-400">
                  <LoaderCircle className="size-4 animate-spin" />
                  正在读取生产数据
                </div>
              ) : !scripts.length ? (
                <div className="absolute inset-0 grid place-items-center text-sm text-slate-500">项目还没有剧本。</div>
              ) : null}

              {error ? (
                <div className="absolute left-1/2 top-3 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-lg border border-red-500/30 bg-slate-950 px-3 py-2 shadow-xl">
                  <FailureReason>{error}</FailureReason>
                  <button
                    type="button"
                    aria-label="重新加载生产数据"
                    onClick={refreshSelectedFlow}
                    className="rounded-md p-1 text-slate-300 hover:bg-slate-800">
                    <RefreshCw className="size-4" />
                  </button>
                </div>
              ) : null}

              {renderProductionAgent && scriptId != null ? (
                <aside
                  aria-label="生产智能体侧栏"
                  aria-hidden={!agentPanelOpen}
                  className={`absolute bottom-[10px] right-[5px] top-[10px] z-50 flex min-w-[400px] flex-col overflow-hidden rounded-[10px] border border-slate-700 bg-slate-950 shadow-[-4px_2px_10px_rgba(0,0,0,.45)] transition-transform duration-300 ease-out ${agentPanelOpen ? "translate-x-0" : "pointer-events-none translate-x-[calc(100%+5px)]"}`}
                  style={{ width: agentPanelWidth }}>
                  <div
                    role="separator"
                    aria-label="调整生产智能体侧栏宽度"
                    aria-orientation="vertical"
                    tabIndex={0}
                    onPointerDown={beginAgentResize}
                    onKeyDown={(event) => {
                      if (event.key === "ArrowLeft") resizeAgentByKeyboard(24);
                      if (event.key === "ArrowRight") resizeAgentByKeyboard(-24);
                    }}
                    className="absolute inset-y-0 left-0 z-[70] w-1 cursor-col-resize hover:bg-slate-700 focus:bg-slate-700 focus:outline-none"
                  />
                  <button
                    type="button"
                    aria-label="收起生产智能体"
                    onClick={() => setAgentPanelOpen(false)}
                    className="absolute right-2 top-2 z-[70] grid size-8 place-items-center rounded-md bg-slate-900/90 text-slate-400 hover:text-slate-100">
                    <PanelRightClose className="size-4" />
                  </button>
                  <div className="h-full min-h-0">{renderProductionAgent(scriptId, refreshSelectedFlow, setProductionAgentBusy)}</div>
                </aside>
              ) : null}
              {(renderProductionAgent || onOpenAgent) && scriptId != null && (!renderProductionAgent || !agentPanelOpen) ? (
                <button
                  type="button"
                  aria-label="打开生产智能体"
                  onClick={() => (renderProductionAgent ? setAgentPanelOpen(true) : onOpenAgent?.(scriptId))}
                  className="absolute right-0 top-[10px] z-40 grid size-10 place-items-center rounded-[10px] border border-slate-700 bg-slate-950 text-slate-300 shadow-lg hover:bg-slate-900">
                  <PanelRightOpen className="size-5" />
                </button>
              ) : null}
              {!agentPanelOpen ? (
                <span className="absolute bottom-[10px] right-0 z-30 rounded border border-slate-700 bg-slate-950 px-1.5 py-0.5 text-xs text-slate-300">
                  {canvasFps}
                </span>
              ) : null}
            </main>
          );
        })()
      : null;

  return (
    <>
      {canvasSurface}
      {(tab !== "flow" || workbenchOpen) && (
        <main
          role={tab === "flow" ? "dialog" : undefined}
          aria-modal={tab === "flow" ? true : undefined}
          aria-label={tab === "flow" ? "视频工作台" : undefined}
          data-testid={tab === "flow" ? "production-workbench-overlay" : undefined}
          className={`${tab === "flow" ? "fixed inset-0 z-[100] h-screen overflow-hidden" : "min-h-screen"} bg-[#090b10] text-slate-100`}>
          {tab !== "flow" ? (
            <header className="mx-auto flex max-w-[1500px] flex-wrap items-end justify-between gap-4 px-5 pt-5 lg:px-8 lg:pt-8">
              <div>
                <div className="mb-2 flex items-center gap-2 text-sm text-blue-300">
                  <Clapperboard className="size-4" />
                  生产工作台
                </div>
                <h1 className="text-2xl font-semibold">{project.name}</h1>
              </div>
              <label className="grid gap-1.5 text-xs text-slate-500">
                当前剧本
                <select
                  aria-label="当前剧本"
                  value={scriptId ?? ""}
                  disabled={switchingScript}
                  onChange={(event) => void switchScript(Number(event.target.value))}
                  className="min-w-52 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200 disabled:opacity-50">
                  {scripts.map((script) => (
                    <option key={script.id} value={script.id}>
                      {script.name}
                    </option>
                  ))}
                </select>
              </label>
            </header>
          ) : null}
          <div className={`${tab === "flow" ? "flex h-full min-h-0 flex-col px-4 pb-4 pt-2" : "mx-auto max-w-[1500px] px-5 pb-5 lg:px-8 lg:pb-8"}`}>
            <nav aria-label="视频工作台功能" className="flex w-fit shrink-0 items-center pb-4 pt-2">
              {(
                [
                  ["preview", "快速预览", Presentation],
                  ["generate", "视频生成", CirclePlay],
                  ["editVideo", "视频编辑", SquarePen],
                ] as const
              ).map(([id, label, Icon]) => (
                <button
                  key={id}
                  type="button"
                  title={label}
                  aria-label={label}
                  aria-pressed={activeWorkbenchMenu === id}
                  onClick={() => changeWorkbenchMenu(id)}
                  className={`mr-1 grid size-[50px] place-items-center rounded-2xl transition-colors ${
                    activeWorkbenchMenu === id ? "bg-blue-600 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                  }`}>
                  <Icon className="size-6" />
                </button>
              ))}
            </nav>
            {tab === "flow" ? (
              <button
                type="button"
                aria-label="关闭视频工作台"
                title="关闭"
                onClick={() => setWorkbenchOpen(false)}
                className="absolute right-8 top-8 z-10 grid size-10 place-items-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-100">
                <X className="size-6" />
              </button>
            ) : null}
            <div className={`${tab === "flow" ? "min-h-0 flex-1 overflow-hidden" : "mt-5"}`}>
              {tab !== "flow" && (renderProductionAgent || onOpenAgent) && scriptId != null ? (
                <button
                  type="button"
                  aria-expanded={renderProductionAgent ? agentPanelOpen : undefined}
                  onClick={() => {
                    if (renderProductionAgent) {
                      setAgentPanelOpen(true);
                      setTab("flow");
                      setWorkbenchOpen(false);
                    } else {
                      onOpenAgent?.(scriptId);
                    }
                  }}
                  className="flex items-center gap-1.5 rounded-lg border border-violet-700/70 bg-violet-500/10 px-3 py-2 text-xs text-violet-200">
                  {renderProductionAgent && agentPanelOpen ? <PanelRightClose className="size-3.5" /> : <PanelRightOpen className="size-3.5" />}
                  生产智能体
                </button>
              ) : null}
              {error ? (
                <div className="mb-4 flex items-center justify-between gap-3">
                  <FailureReason>{error}</FailureReason>
                  <button
                    type="button"
                    aria-label="重新加载生产数据"
                    onClick={() => scriptId != null && void loadProductionData(scriptId)}
                    className="rounded-lg border border-slate-700 p-2">
                    <RefreshCw className="size-4" />
                  </button>
                </div>
              ) : null}
              {loading ? (
                <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-800 py-20 text-sm text-slate-400">
                  <LoaderCircle className="size-4 animate-spin" />
                  正在读取生产数据
                </div>
              ) : !scripts.length ? (
                <div className="rounded-xl border border-dashed border-slate-800 py-20 text-center text-sm text-slate-500">项目还没有剧本。</div>
              ) : activeWorkbenchMenu === "preview" && scriptId != null ? (
                <PreviewWorkbench api={api} scriptId={scriptId} storyboards={storyboards} assets={flowData.assets} onError={setError} />
              ) : activeWorkbenchMenu === "generate" ? (
                <GenerationWorkbench
                  api={api}
                  project={project}
                  flowData={flowData}
                  storyboards={storyboards}
                  tracks={tracks}
                  setTracks={setTracks}
                  onAddTrack={addTrack}
                  onDeleteTrack={deleteTrack}
                  onGeneratePrompt={generatePrompt}
                  onGenerateVideo={generateVideo}
                  onError={setError}
                />
              ) : null}
              {!loading && scripts.length && editorActivated ? (
                <div
                  className={activeWorkbenchMenu === "editVideo" ? "h-full space-y-3 overflow-hidden" : "hidden"}
                  aria-hidden={activeWorkbenchMenu === "editVideo" ? undefined : true}>
                  {mediaError ? (
                    <div
                      role="alert"
                      className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                      <span>{mediaError}</span>
                      <button
                        type="button"
                        aria-label="重试加载剪辑素材"
                        onClick={retryMediaLibrary}
                        className="rounded border border-amber-400/40 px-2 py-1">
                        重试
                      </button>
                    </div>
                  ) : null}
                  <WebAvVideoEditor
                    key={`${project.id}:${scriptId}`}
                    clips={completedVideos}
                    mediaLibrary={mediaLibrary.map(toEditorMedia)}
                    videoRatio={project.videoRatio}
                  />
                </div>
              ) : null}
            </div>
          </div>
        </main>
      )}
    </>
  );
}
