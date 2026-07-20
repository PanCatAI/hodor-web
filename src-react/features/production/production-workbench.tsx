import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Clapperboard, Download, Film, ImageIcon, LoaderCircle, Pencil, Play, Plus, RefreshCw, Sparkles, Trash2 } from "lucide-react";

import { ImageFlowEditor } from "./image-flow-editor";
import type { ProductionApi } from "./production-api";
import { ProductionFlowBoard } from "./production-flow-board";
import type { ProductionFlowData, ProductionMediaItem, ProductionProject, ProductionState, ScriptSummary, StoryboardItem, VideoItem, VideoTrack } from "./types";
import { WebAvVideoEditor } from "./webav-video-editor";
import type { WebAvEditorClip } from "./webav-video-editor";

export interface ProductionWorkbenchProps {
  api: ProductionApi;
  project: ProductionProject;
  pollIntervalMs?: number;
}

const emptyFlow: ProductionFlowData = { script: "", scriptPlan: "", assets: [], storyboardTable: "", storyboard: [] };
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
  return <div role="alert" className="flex gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs leading-5 text-red-300"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" /><span>{children}</span></div>;
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
    return update ? { ...item, ...update, index: update.index ?? item.index, prompt: update.prompt || item.prompt, videoDesc: update.videoDesc || item.videoDesc, src: update.src || item.src } : item;
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

export function ProductionWorkbench({ api, project, pollIntervalMs = 3_000 }: ProductionWorkbenchProps) {
  const [scripts, setScripts] = useState<ScriptSummary[]>([]);
  const [scriptId, setScriptId] = useState<number | null>(null);
  const [flowData, setFlowData] = useState<ProductionFlowData>(emptyFlow);
  const [storyboards, setStoryboards] = useState<StoryboardItem[]>([]);
  const [tracks, setTracks] = useState<VideoTrack[]>([]);
  const [mediaLibrary, setMediaLibrary] = useState<ProductionMediaItem[]>([]);
  const [mediaError, setMediaError] = useState("");
  const [tab, setTab] = useState<"generation" | "flow" | "editor">("generation");
  const [editingStoryboard, setEditingStoryboard] = useState<StoryboardItem | null>(null);
  const [storyboardPreview, setStoryboardPreview] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const loadSequence = useRef(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void api.listScripts(project.id).then((items) => {
      if (!active) return;
      setScripts(items);
      setScriptId((current) => (items.some((item) => item.id === current) ? current : (items[0]?.id ?? null)));
      if (!items.length) setLoading(false);
    }).catch((cause) => { if (active) { setError(messageOf(cause)); setLoading(false); } });
    return () => { active = false; };
  }, [api, project.id]);

  const loadProductionData = useCallback(async (nextScriptId: number) => {
    const sequence = ++loadSequence.current;
    setLoading(true);
    setError("");
    setMediaError("");
    setMediaLibrary([]);
    void api.getMediaLibrary(project.id, nextScriptId)
      .then((media) => {
        if (loadSequence.current === sequence) setMediaLibrary(media);
      })
      .catch((cause) => {
        if (loadSequence.current === sequence) setMediaError(`剪辑素材库加载失败：${messageOf(cause)}`);
      });
    try {
      const [flow, generation] = await Promise.all([api.getFlowData(project.id, nextScriptId), api.getGenerationData(project.id, nextScriptId)]);
      if (loadSequence.current !== sequence) return;
      setFlowData(flow);
      setStoryboards(flow.storyboard.length ? flow.storyboard : generation.storyboardList);
      setTracks(generation.trackList.map((track) => ({ ...track, medias: track.medias.map((media) => ({ ...media, selected: media.selected !== false })) })));
    } catch (cause) {
      if (loadSequence.current === sequence) setError(messageOf(cause));
    } finally {
      if (loadSequence.current === sequence) setLoading(false);
    }
  }, [api, project.id]);

  function retryMediaLibrary() {
    if (scriptId == null) return;
    setMediaError("");
    void api.getMediaLibrary(project.id, scriptId)
      .then(setMediaLibrary)
      .catch((cause) => setMediaError(`剪辑素材库加载失败：${messageOf(cause)}`));
  }

  useEffect(() => { if (scriptId != null) void loadProductionData(scriptId); }, [loadProductionData, scriptId]);

  const runningStoryboardIds = useMemo(() => storyboards.filter((item) => item.state === "running").map((item) => item.id), [storyboards]);
  const runningVideoIds = useMemo(() => tracks.flatMap((track) => track.videoList.filter((video) => video.state === "running").map((video) => video.id)), [tracks]);

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
    return () => { cancelled = true; window.clearTimeout(timer); };
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
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [api, pollIntervalMs, project.id, runningVideoIds.join(","), scriptId]);

  async function generateStoryboard(id: number) {
    if (scriptId == null) return;
    setStoryboards((current) => current.map((item) => item.id === id ? { ...item, state: "running", errorReason: "" } : item));
    try {
      const updates = await api.generateStoryboards({ projectId: project.id, scriptId, storyboardIds: [id] });
      setStoryboards((current) => updateStoryboards(current, updates));
    } catch (cause) {
      setStoryboards((current) => current.map((item) => item.id === id ? { ...item, state: "failed", errorReason: messageOf(cause) } : item));
    }
  }

  async function insertStoryboard(referenceId: number, placement: "before" | "after") {
    if (scriptId == null) return;
    try {
      const id = await api.addStoryboard(project.id, scriptId, {
        prompt: "",
        duration: 0,
        state: "未生成",
        videoDesc: "",
        shouldGenerateImage: 0,
        src: null,
      });
      const referenceIndex = storyboards.findIndex((item) => item.id === referenceId);
      const insertionIndex = Math.max(0, referenceIndex + (placement === "after" ? 1 : 0));
      const next = [...storyboards];
      next.splice(insertionIndex, 0, { id, index: insertionIndex, prompt: "", videoDesc: "", src: "", state: "idle", errorReason: "", duration: 0, shouldGenerateImage: 0 });
      const ordered = next.map((item, index) => ({ ...item, index }));
      setStoryboards(ordered);
      setFlowData((current) => ({ ...current, storyboard: ordered }));
      await api.saveFlowData(project.id, scriptId, { ...flowData, storyboard: ordered });
    } catch (cause) {
      setError(`新增分镜失败：${messageOf(cause)}`);
    }
  }

  async function addTrack() {
    if (scriptId == null) return;
    try {
      const id = await api.addTrack(project.id, scriptId, 5);
      setTracks((current) => [...current, { id, prompt: "", duration: 5, state: "idle", errorReason: "", medias: [], videoList: [] }]);
    } catch (cause) { setError(messageOf(cause)); }
  }

  async function deleteTrack(id: number) {
    try { await api.deleteTrack(id); setTracks((current) => current.filter((track) => track.id !== id)); } catch (cause) { setError(messageOf(cause)); }
  }

  async function generatePrompt(trackId: number) {
    const track = tracks.find((item) => item.id === trackId);
    if (!track) return;
    setTracks((current) => current.map((item) => item.id === trackId ? { ...item, state: "running", errorReason: "" } : item));
    try {
      const prompt = await api.generateVideoPrompt(project.id, track, project.videoModel, project.videoMode);
      setTracks((current) => current.map((item) => item.id === trackId ? { ...item, prompt, state: "completed" } : item));
    } catch (cause) {
      setTracks((current) => current.map((item) => item.id === trackId ? { ...item, state: "failed", errorReason: messageOf(cause) } : item));
    }
  }

  async function generateVideo(trackId: number) {
    if (scriptId == null) return;
    const track = tracks.find((item) => item.id === trackId);
    if (!track) return;
    setTracks((current) => current.map((item) => item.id === trackId ? { ...item, state: "running", errorReason: "" } : item));
    try {
      const videoId = await api.generateVideo({ projectId: project.id, scriptId, track, model: project.videoModel, mode: project.videoMode, resolution: project.videoResolution ?? "1080p", audio: project.videoAudio ?? false });
      setTracks((current) => current.map((item) => item.id === trackId ? { ...item, state: "running", videoList: [...item.videoList, { id: videoId, src: "", state: "running", errorReason: "" }] } : item));
    } catch (cause) {
      setTracks((current) => current.map((item) => item.id === trackId ? { ...item, state: "failed", errorReason: messageOf(cause) } : item));
    }
  }

  const completedVideos = tracks.flatMap((track) => track.videoList.filter((video) => video.state === "completed" && video.src).map((video) => ({ ...video, duration: video.duration ?? track.duration })));

  return (
    <main className="min-h-screen bg-[#090b10] p-5 text-slate-100 lg:p-8">
      <header className="mx-auto mb-6 flex max-w-[1500px] flex-wrap items-end justify-between gap-4">
        <div><div className="mb-2 flex items-center gap-2 text-sm text-blue-300"><Clapperboard className="size-4" />生产工作台</div><h1 className="text-2xl font-semibold">{project.name}</h1><p className="mt-2 text-sm text-slate-500">从合同、分镜图、视频生成到 WebAV 剪辑均可在此恢复和继续。</p></div>
        <label className="grid gap-1.5 text-xs text-slate-500">当前剧本<select aria-label="当前剧本" value={scriptId ?? ""} onChange={(event) => setScriptId(Number(event.target.value))} className="min-w-52 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200">{scripts.map((script) => <option key={script.id} value={script.id}>{script.name}</option>)}</select></label>
      </header>
      <div className="mx-auto max-w-[1500px]">
        <nav aria-label="生产工作台视图" className="mb-5 flex gap-2">{([['generation','生成工作台'],['flow','产线图'],['editor','视频编辑']] as const).map(([id,label]) => <button key={id} type="button" onClick={() => setTab(id)} className={`rounded-lg px-3 py-2 text-xs ${tab === id ? 'bg-blue-600' : 'border border-slate-800 bg-slate-950'}`}>{label}</button>)}</nav>
        {error ? <div className="mb-4 flex items-center justify-between gap-3"><FailureReason>{error}</FailureReason><button type="button" aria-label="重新加载生产数据" onClick={() => scriptId != null && void loadProductionData(scriptId)} className="rounded-lg border border-slate-700 p-2"><RefreshCw className="size-4" /></button></div> : null}
        {loading ? <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-800 py-20 text-sm text-slate-400"><LoaderCircle className="size-4 animate-spin" />正在读取生产数据</div> : !scripts.length ? <div className="rounded-xl border border-dashed border-slate-800 py-20 text-center text-sm text-slate-500">项目还没有剧本。</div> : tab === "flow" && scriptId != null ? <ProductionFlowBoard api={api} projectId={project.id} scriptId={scriptId} initialData={{ ...flowData, storyboard: storyboards }} imageModel={project.imageModel || "pancat:pancat-image"} pollIntervalMs={pollIntervalMs} /> : tab === "generation" ? (
          <div className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
            <section aria-labelledby="storyboard-title" className="min-w-0">
              <div className="mb-3 flex items-center justify-between"><h2 id="storyboard-title" className="flex items-center gap-2 font-medium"><ImageIcon className="size-4 text-blue-300" />分镜生产列表</h2><div className="flex gap-2"><button type="button" aria-label="预览分镜表" onClick={() => void api.previewStoryboards(storyboards.filter((item) => item.src).map((item) => item.id)).then(setStoryboardPreview).catch((cause) => setError(messageOf(cause)))} className="rounded-md border border-slate-700 px-2 py-1 text-xs">预览 / 下载</button><span className="py-1 text-xs text-slate-500">{storyboards.length} 个镜头</span></div></div>
              {storyboardPreview ? <div className="mb-3 rounded-xl border border-slate-800 bg-slate-950 p-3"><img src={storyboardPreview} alt="分镜合并预览" className="w-full rounded-lg" /><a href={storyboardPreview} download="storyboard-preview.jpg" className="mt-2 inline-flex items-center gap-1 text-xs text-blue-300"><Download className="size-3" />下载分镜预览</a></div> : null}
              <div className="grid gap-3 sm:grid-cols-2">{storyboards.map((storyboard, position) => <article key={storyboard.id} data-testid={`storyboard-${storyboard.id}`} className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/70">
                <div className="aspect-video bg-slate-900">{storyboard.src ? <img className="size-full object-cover" src={storyboard.src} alt={`分镜 ${position + 1}`} /> : <div className="grid size-full place-items-center text-slate-700"><ImageIcon className="size-8" /></div>}</div>
                <div className="space-y-3 p-4"><div className="flex items-center justify-between"><span className="text-xs text-slate-500">镜头 {position + 1}</span><StatusBadge state={storyboard.state} /></div><textarea aria-label={`分镜画面提示词 ${storyboard.id}`} value={storyboard.prompt} onChange={(event) => setStoryboards((current) => current.map((item) => item.id === storyboard.id ? { ...item, prompt: event.target.value } : item))} onBlur={() => void api.editStoryboard(storyboard.id, storyboard.prompt, storyboard.videoDesc).catch((cause) => setError(messageOf(cause)))} className="h-16 w-full rounded-lg border border-slate-800 bg-slate-900 p-2 text-sm font-medium" placeholder="未填写画面描述" /><textarea aria-label={`分镜视频描述 ${storyboard.id}`} value={storyboard.videoDesc} onChange={(event) => setStoryboards((current) => current.map((item) => item.id === storyboard.id ? { ...item, videoDesc: event.target.value } : item))} onBlur={() => void api.editStoryboard(storyboard.id, storyboard.prompt, storyboard.videoDesc).catch((cause) => setError(messageOf(cause)))} className="h-14 w-full rounded-lg border border-slate-800 bg-slate-900 p-2 text-xs text-slate-400" placeholder="视频运动描述" /><FailureReason>{storyboard.errorReason}</FailureReason>
                  <div className="grid grid-cols-2 gap-2"><button type="button" aria-label={`在分镜 ${storyboard.id} 前插入`} onClick={() => void insertStoryboard(storyboard.id, "before")} className="rounded-lg border border-slate-800 px-2 py-1.5 text-xs text-slate-400"><Plus className="mr-1 inline size-3" />前插分镜</button><button type="button" aria-label={`在分镜 ${storyboard.id} 后插入`} onClick={() => void insertStoryboard(storyboard.id, "after")} className="rounded-lg border border-slate-800 px-2 py-1.5 text-xs text-slate-400"><Plus className="mr-1 inline size-3" />后插分镜</button></div>
                  <div className="grid grid-cols-3 gap-2"><button type="button" disabled={storyboard.state === "running"} onClick={() => void generateStoryboard(storyboard.id)} className="rounded-lg border border-slate-700 px-2 py-2 text-xs">{storyboard.state === "running" ? "处理中" : storyboard.state === "completed" || storyboard.state === "failed" ? "重新生成分镜图" : "生成分镜图"}</button><button type="button" onClick={() => setEditingStoryboard(storyboard)} className="rounded-lg border border-slate-700 px-2 py-2 text-xs"><Pencil className="mr-1 inline size-3" />图片编辑</button><button type="button" aria-label={`删除分镜 ${storyboard.id}`} onClick={() => void api.deleteStoryboards(project.id, [storyboard.id]).then(() => setStoryboards((current) => current.filter((item) => item.id !== storyboard.id))).catch((cause) => setError(messageOf(cause)))} className="rounded-lg border border-red-900 px-2 py-2 text-xs text-red-300"><Trash2 className="mx-auto size-3.5" /></button></div>
                </div></article>)}</div>
            </section>
            <section aria-labelledby="video-title" className="min-w-0">
              <div className="mb-3 flex items-center justify-between"><h2 id="video-title" className="flex items-center gap-2 font-medium"><Film className="size-4 text-violet-300" />视频轨道</h2><button type="button" onClick={() => void addTrack()} className="flex items-center gap-1 rounded-md border border-slate-700 px-2 py-1 text-xs"><Plus className="size-3" />新增视频轨道</button></div>
              <div className="space-y-3">{tracks.map((track, position) => <article key={track.id} data-testid={`video-track-${track.id}`} className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                <div className="flex items-center justify-between"><span className="text-xs text-slate-500">视频轨道 {position + 1}</span><div className="flex items-center gap-2"><StatusBadge state={track.state} /><button type="button" aria-label={`删除轨道 ${track.id}`} onClick={() => void deleteTrack(track.id)}><Trash2 className="size-3.5 text-red-300" /></button></div></div>
                <div className="grid grid-cols-[1fr_80px] gap-2"><textarea aria-label={`轨道提示词 ${track.id}`} value={track.prompt} onChange={(event) => setTracks((current) => current.map((item) => item.id === track.id ? { ...item, prompt: event.target.value } : item))} onBlur={() => void api.updateTrackPrompt(track.id, track.prompt).catch((cause) => setError(messageOf(cause)))} className="h-20 rounded-lg border border-slate-800 bg-slate-900 p-2 text-xs" /><input aria-label={`轨道时长 ${track.id}`} type="number" min="1" max="30" value={track.duration} onChange={(event) => setTracks((current) => current.map((item) => item.id === track.id ? { ...item, duration: Number(event.target.value) } : item))} onBlur={() => void api.updateTrackDuration(track.id, track.duration).catch((cause) => setError(messageOf(cause)))} className="h-9 rounded-lg border border-slate-800 bg-slate-900 px-2 text-xs" /></div>
                <div className="flex gap-2 overflow-x-auto">{track.medias.map((media, index) => <label key={`${media.sources}-${media.id}-${index}`} className={`relative size-16 shrink-0 cursor-pointer overflow-hidden rounded-lg border ${media.selected !== false ? 'border-blue-500' : 'border-slate-800 opacity-50'}`}><input aria-label={`使用参考素材 ${media.id ?? index}`} type="checkbox" checked={media.selected !== false} onChange={(event) => setTracks((current) => current.map((item) => item.id === track.id ? { ...item, medias: item.medias.map((entry, entryIndex) => entryIndex === index ? { ...entry, selected: event.target.checked } : entry) } : item))} className="absolute left-1 top-1 z-10" />{media.fileType === "image" && media.src ? <img className="size-full object-cover" src={media.src} alt={media.name || `参考素材 ${index + 1}`} /> : <div className="grid size-full place-items-center"><Film className="size-4" /></div>}</label>)}</div>
                <FailureReason>{track.errorReason}</FailureReason>
                {track.videoList.map((video) => <div key={video.id} className={`rounded-lg border p-3 ${track.selectVideoId === video.id ? 'border-emerald-500' : 'border-slate-800'}`}><div className="flex items-center justify-between"><span className="text-xs text-slate-500">视频 #{video.id}</span><StatusBadge state={video.state} /></div><FailureReason>{video.errorReason}</FailureReason>{video.src && video.state === "completed" ? <><video className="mt-3 w-full rounded-md" src={video.src} controls preload="metadata" /><a href={video.src} download={`video-${video.id}.mp4`} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-blue-300"><Download className="size-3" />下载视频</a></> : null}<div className="mt-2 flex gap-2"><button type="button" aria-label={`选择视频 ${video.id}`} onClick={() => void api.selectVideo(track.id, video.id).then(() => setTracks((current) => current.map((item) => item.id === track.id ? { ...item, selectVideoId: video.id } : item))).catch((cause) => setError(messageOf(cause)))} className="flex-1 rounded border border-slate-700 px-2 py-1 text-xs"><Check className="mr-1 inline size-3" />采用</button><button type="button" aria-label={`删除视频 ${video.id}`} onClick={() => void api.deleteVideo(video.id).then(() => setTracks((current) => current.map((item) => item.id === track.id ? { ...item, videoList: item.videoList.filter((entry) => entry.id !== video.id), selectVideoId: item.selectVideoId === video.id ? null : item.selectVideoId } : item))).catch((cause) => setError(messageOf(cause)))} className="rounded border border-red-900 px-2 text-red-300"><Trash2 className="size-3" /></button></div></div>)}
                <div className="grid grid-cols-2 gap-2"><button type="button" aria-label="生成轨道提示词" onClick={() => void generatePrompt(track.id)} disabled={track.state === "running"} className="rounded-lg border border-violet-700 px-3 py-2 text-xs"><Sparkles className="mr-1 inline size-3.5" />生成提示词</button><button type="button" disabled={track.state === "running" || !project.videoModel || !track.prompt} onClick={() => void generateVideo(track.id)} className="rounded-lg bg-blue-600 px-3 py-2 text-xs disabled:bg-slate-800"><Play className="mr-1 inline size-3.5" />生成视频</button></div>
              </article>)}</div>
            </section>
          </div>
        ) : null}
        {!loading && scripts.length ? <div className={tab === "editor" ? "space-y-3" : "hidden"} aria-hidden={tab === "editor" ? undefined : true}>{mediaError ? <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"><span>{mediaError}</span><button type="button" aria-label="重试加载剪辑素材" onClick={retryMediaLibrary} className="rounded border border-amber-400/40 px-2 py-1">重试</button></div> : null}<WebAvVideoEditor key={`${project.id}:${scriptId}`} clips={completedVideos} mediaLibrary={mediaLibrary.map(toEditorMedia)} /></div> : null}
      </div>
      {editingStoryboard && scriptId != null ? <ImageFlowEditor api={api} projectId={project.id} scriptId={scriptId} storyboard={editingStoryboard} imageModel={project.imageModel || "pancat:pancat-image"} onClose={() => setEditingStoryboard(null)} onSaved={(url, flowId) => setStoryboards((current) => current.map((item) => item.id === editingStoryboard.id ? { ...item, src: url, flowId, state: "completed" } : item))} /> : null}
    </main>
  );
}
