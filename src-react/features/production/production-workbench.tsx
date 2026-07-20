import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Clapperboard, Film, ImageIcon, LoaderCircle, Play, RefreshCw } from "lucide-react";

import type { ProductionApi } from "./production-api";
import type { ProductionProject, ProductionState, ScriptSummary, StoryboardItem, VideoItem, VideoTrack } from "./types";

export interface ProductionWorkbenchProps {
  api: ProductionApi;
  project: ProductionProject;
  pollIntervalMs?: number;
}

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

function messageOf(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "请求失败";
}

function updateStoryboards(current: StoryboardItem[], updates: StoryboardItem[]): StoryboardItem[] {
  const updateMap = new Map(updates.map((item) => [item.id, item]));
  return current.map((item) => {
    const update = updateMap.get(item.id);
    if (!update) return item;
    return {
      ...item,
      ...update,
      index: update.index || item.index,
      prompt: update.prompt || item.prompt,
      videoDesc: update.videoDesc || item.videoDesc,
      src: update.src || item.src,
    };
  });
}

function updateVideos(current: VideoTrack[], updates: VideoItem[]): VideoTrack[] {
  const updateMap = new Map(updates.map((item) => [item.id, item]));
  return current.map((track) => {
    let changed = false;
    const videoList = track.videoList.map((video) => {
      const update = updateMap.get(video.id);
      if (!update) return video;
      changed = true;
      return { ...video, ...update, src: update.src || video.src };
    });
    if (!changed) return track;
    const latestUpdate = videoList.find((video) => updateMap.has(video.id));
    return {
      ...track,
      state: latestUpdate?.state ?? track.state,
      errorReason: latestUpdate?.state === "failed" ? latestUpdate.errorReason : "",
      videoList,
    };
  });
}

export function ProductionWorkbench({ api, project, pollIntervalMs = 3_000 }: ProductionWorkbenchProps) {
  const [scripts, setScripts] = useState<ScriptSummary[]>([]);
  const [scriptId, setScriptId] = useState<number | null>(null);
  const [storyboards, setStoryboards] = useState<StoryboardItem[]>([]);
  const [tracks, setTracks] = useState<VideoTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    void api
      .listScripts(project.id)
      .then((items) => {
        if (cancelled) return;
        setScripts(items);
        setScriptId((current) => (items.some((item) => item.id === current) ? current : (items[0]?.id ?? null)));
        if (items.length === 0) setLoading(false);
      })
      .catch((cause) => {
        if (cancelled) return;
        setError(messageOf(cause));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, project.id]);

  const loadProductionData = useCallback(
    async (nextScriptId: number) => {
      setLoading(true);
      setError("");
      try {
        const [flow, generation] = await Promise.all([api.getFlowData(project.id, nextScriptId), api.getGenerationData(project.id, nextScriptId)]);
        setStoryboards(flow.storyboard.length > 0 ? flow.storyboard : generation.storyboardList);
        setTracks(generation.trackList);
      } catch (cause) {
        setError(messageOf(cause));
      } finally {
        setLoading(false);
      }
    },
    [api, project.id],
  );

  useEffect(() => {
    if (scriptId == null) return;
    void loadProductionData(scriptId);
  }, [loadProductionData, scriptId]);

  const runningStoryboardIds = useMemo(() => storyboards.filter((item) => item.state === "running").map((item) => item.id), [storyboards]);
  const runningVideoIds = useMemo(
    () => tracks.flatMap((track) => track.videoList.filter((video) => video.state === "running").map((video) => video.id)),
    [tracks],
  );

  useEffect(() => {
    if (runningStoryboardIds.length === 0) return;
    const timer = window.setInterval(() => {
      void api
        .pollStoryboards(runningStoryboardIds)
        .then((updates) => setStoryboards((current) => updateStoryboards(current, updates)))
        .catch((cause) => setError(messageOf(cause)));
    }, pollIntervalMs);
    return () => window.clearInterval(timer);
  }, [api, pollIntervalMs, runningStoryboardIds.join(",")]);

  useEffect(() => {
    if (scriptId == null || runningVideoIds.length === 0) return;
    const timer = window.setInterval(() => {
      void api
        .pollVideos(project.id, scriptId, runningVideoIds)
        .then((updates) => setTracks((current) => updateVideos(current, updates)))
        .catch((cause) => setError(messageOf(cause)));
    }, pollIntervalMs);
    return () => window.clearInterval(timer);
  }, [api, pollIntervalMs, project.id, runningVideoIds.join(","), scriptId]);

  async function generateStoryboard(storyboardId: number) {
    if (scriptId == null) return;
    setStoryboards((current) => current.map((item) => (item.id === storyboardId ? { ...item, state: "running", errorReason: "" } : item)));
    try {
      const updates = await api.generateStoryboards({ projectId: project.id, scriptId, storyboardIds: [storyboardId] });
      setStoryboards((current) => updateStoryboards(current, updates));
    } catch (cause) {
      setStoryboards((current) =>
        current.map((item) => (item.id === storyboardId ? { ...item, state: "failed", errorReason: messageOf(cause) } : item)),
      );
    }
  }

  async function generateVideo(trackId: number) {
    if (scriptId == null) return;
    const track = tracks.find((item) => item.id === trackId);
    if (!track) return;
    setTracks((current) => current.map((item) => (item.id === trackId ? { ...item, state: "running", errorReason: "" } : item)));
    try {
      const videoId = await api.generateVideo({
        projectId: project.id,
        scriptId,
        track,
        model: project.videoModel,
        mode: project.videoMode,
        resolution: project.videoResolution ?? "1080p",
        audio: project.videoAudio ?? false,
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

  return (
    <main className="min-h-screen bg-[#090b10] p-5 text-slate-100 lg:p-8">
      <header className="mx-auto mb-7 flex max-w-[1500px] flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm text-blue-300">
            <Clapperboard className="size-4" />
            生产工作台
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
          <p className="mt-2 text-sm text-slate-500">检查分镜产物，提交图片和视频生成任务，并查看失败原因。</p>
        </div>
        <label className="grid gap-1.5 text-xs text-slate-500">
          当前剧本
          <select
            aria-label="当前剧本"
            className="min-w-52 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200 outline-none focus:border-blue-500"
            value={scriptId ?? ""}
            onChange={(event) => setScriptId(Number(event.target.value))}>
            {scripts.map((script) => (
              <option key={script.id} value={script.id}>
                {script.name}
              </option>
            ))}
          </select>
        </label>
      </header>

      <div className="mx-auto max-w-[1500px]">
        {error ? <FailureReason>{error}</FailureReason> : null}
        {loading ? (
          <div className="mt-6 flex items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-950/60 py-20 text-sm text-slate-400">
            <LoaderCircle className="size-4 animate-spin" /> 正在读取生产数据
          </div>
        ) : scripts.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-slate-800 py-20 text-center text-sm text-slate-500">项目还没有剧本。</div>
        ) : (
          <div className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
            <section aria-labelledby="storyboard-title" className="min-w-0">
              <div className="mb-3 flex items-center justify-between">
                <h2 id="storyboard-title" className="flex items-center gap-2 font-medium">
                  <ImageIcon className="size-4 text-blue-300" /> 分镜生产列表
                </h2>
                <span className="text-xs text-slate-500">{storyboards.length} 个镜头</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {storyboards.map((storyboard, position) => (
                  <article
                    key={storyboard.id}
                    data-testid={`storyboard-${storyboard.id}`}
                    className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/70">
                    <div className="aspect-video bg-slate-900">
                      {storyboard.src ? (
                        <img className="size-full object-cover" src={storyboard.src} alt={`分镜 ${position + 1}`} />
                      ) : (
                        <div className="grid size-full place-items-center text-slate-700">
                          <ImageIcon className="size-8" />
                        </div>
                      )}
                    </div>
                    <div className="space-y-3 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-slate-500">镜头 {position + 1}</span>
                        <StatusBadge state={storyboard.state} />
                      </div>
                      <div>
                        <h3 className="line-clamp-2 text-sm font-medium leading-6">{storyboard.prompt || "未填写画面描述"}</h3>
                        {storyboard.videoDesc ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{storyboard.videoDesc}</p> : null}
                      </div>
                      <FailureReason>{storyboard.errorReason}</FailureReason>
                      <button
                        type="button"
                        disabled={storyboard.state === "running"}
                        onClick={() => void generateStoryboard(storyboard.id)}
                        className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200 transition hover:border-blue-500 hover:text-blue-300 disabled:cursor-not-allowed disabled:opacity-50">
                        {storyboard.state === "running" ? <LoaderCircle className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                        {storyboard.state === "completed" || storyboard.state === "failed" ? "重新生成分镜图" : "生成分镜图"}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section aria-labelledby="video-title" className="min-w-0">
              <div className="mb-3 flex items-center justify-between">
                <h2 id="video-title" className="flex items-center gap-2 font-medium">
                  <Film className="size-4 text-violet-300" /> 视频轨道
                </h2>
                <span className="text-xs text-slate-500">{tracks.length} 条轨道</span>
              </div>
              <div className="space-y-3">
                {tracks.map((track, position) => (
                  <article
                    key={track.id}
                    data-testid={`video-track-${track.id}`}
                    className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <span className="text-xs text-slate-500">
                          视频轨道 {position + 1} · {track.duration || 0} 秒
                        </span>
                        <h3 className="mt-1 text-sm font-medium leading-6">{track.prompt || "未填写视频提示词"}</h3>
                      </div>
                      <StatusBadge state={track.state} />
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {track.medias
                        .filter((media) => media.src)
                        .map((media, index) => (
                          <div
                            key={`${media.sources}-${media.id}-${index}`}
                            className="relative size-16 shrink-0 overflow-hidden rounded-lg bg-slate-900">
                            {media.fileType === "image" ? (
                              <img className="size-full object-cover" src={media.src} alt={media.name || `参考素材 ${index + 1}`} />
                            ) : (
                              <div className="grid size-full place-items-center text-slate-600">
                                <Film className="size-5" />
                              </div>
                            )}
                            <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1 text-[9px] text-slate-300">
                              {media.sources === "storyboard" ? "分镜" : "资产"}
                            </span>
                          </div>
                        ))}
                    </div>
                    <FailureReason>{track.errorReason}</FailureReason>
                    {track.videoList.map((video) => (
                      <div key={video.id} className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                        <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                          <span>视频 #{video.id}</span>
                          <StatusBadge state={video.state} />
                        </div>
                        <FailureReason>{video.errorReason}</FailureReason>
                        {video.src && video.state === "completed" ? (
                          <video className="mt-3 w-full rounded-md" src={video.src} controls preload="metadata" />
                        ) : null}
                      </div>
                    ))}
                    <button
                      type="button"
                      disabled={track.state === "running" || !project.videoModel || !track.prompt}
                      onClick={() => void generateVideo(track.id)}
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2.5 text-sm font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500">
                      {track.state === "running" ? <LoaderCircle className="size-4 animate-spin" /> : <Play className="size-4 fill-current" />}
                      生成视频
                    </button>
                  </article>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
