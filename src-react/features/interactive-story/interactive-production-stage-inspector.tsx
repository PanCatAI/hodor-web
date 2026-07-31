import { useEffect, useState } from "react";
import { Download, LoaderCircle, RefreshCw, RotateCcw, Save, Trash2, Video, X } from "lucide-react";

import type {
  ProductionApi,
  CinematicCoverageAggregate,
  ProductionFlowData,
  ProductionGenerationData,
  ProductionPrevisRender,
  ProductionProject,
  StoryboardItem,
} from "@react/features/production";
import { createProductionPrevisContract, selectLatestCoverage, WebAvVideoEditor } from "@react/features/production";
import {
  createCoverageEditorTimeline,
  recommendedCutDigest,
  resolveFormalVideoUrl,
  updateRecommendedCutFromTimeline,
  type CoverageEditorMode,
} from "./interactive-coverage-editor";
import type { InteractiveProductionStage } from "./interactive-production-topology";
import type { InteractiveStoryNode } from "./types";

export interface InteractiveProductionStageInspectorProps {
  projectId: number;
  node: InteractiveStoryNode;
  stage: InteractiveProductionStage;
  flow: ProductionFlowData;
  generation?: ProductionGenerationData;
  coverages?: CinematicCoverageAggregate[];
  api: ProductionApi;
  project: ProductionProject;
  onChange: (flow: ProductionFlowData) => void;
  onRefresh: () => Promise<void> | void;
  onClose: () => void;
}

export const interactiveStageLabels: Record<InteractiveProductionStage, string> = {
  script: "剧本",
  scriptPlan: "导演计划",
  assets: "资产工厂",
  storyboardTable: "分镜表",
  storyboard: "分镜图",
  blocking: "场面调度",
  coverage: "镜头覆盖",
  previs: "Blender 预演",
  formalGeneration: "正式生成",
  multicamEdit: "多机位剪辑",
  supervision: "监督验收",
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "操作失败";
}

function stateLabel(state: string) {
  if (state === "completed") return "已完成";
  if (state === "running") return "生成中";
  if (state === "failed") return "生成失败";
  return "未生成";
}

function TextStage({
  label,
  value,
  onSave,
}: {
  label: string;
  value: string;
  onSave: (value: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(value), [value]);
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <textarea
        aria-label={`${label}内容`}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={`等待智能体生成${label}`}
        className="min-h-[360px] flex-1 resize-none rounded-xl border border-slate-700 bg-slate-950 p-4 text-sm leading-7 text-slate-100 outline-none focus:border-blue-500"
      />
      <div className="flex justify-end">
        <button
          type="button"
          disabled={saving || draft === value}
          onClick={async () => {
            setSaving(true);
            try {
              await onSave(draft);
            } finally {
              setSaving(false);
            }
          }}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-500 disabled:opacity-40">
          {saving ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
          保存
        </button>
      </div>
    </div>
  );
}

function AssetStage({
  flow,
  busyId,
  onEdit,
  onCommit,
  onGenerate,
  onDelete,
}: {
  flow: ProductionFlowData;
  busyId: number | null;
  onEdit: (id: number, field: "desc" | "prompt", value: string) => void;
  onCommit: (id: number) => Promise<void>;
  onGenerate: (id: number) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}) {
  const derived = flow.assets.flatMap((asset) => asset.derive.map((item) => ({ ...item, groupName: asset.name })));
  if (!derived.length) {
    return <p className="rounded-xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-400">等待右侧智能体完成资产提取。</p>;
  }
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {derived.map((asset) => (
        <article key={asset.id} className="overflow-hidden rounded-xl border border-slate-700 bg-slate-950/70">
          {asset.src ? (
            <img src={asset.src} alt={asset.name} className="h-48 w-full bg-black object-contain" />
          ) : (
            <div className="grid h-48 place-items-center bg-slate-900 text-sm text-slate-500">尚无图片</div>
          )}
          <div className="space-y-3 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <strong>{asset.name}</strong>
                <p className="text-xs text-slate-500">{asset.groupName} · {asset.type}</p>
              </div>
              <span className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300">{stateLabel(asset.state)}</span>
            </div>
            <textarea aria-label={`${asset.name}描述`} value={asset.desc} onChange={(event) => onEdit(asset.id, "desc", event.target.value)} className="h-24 w-full resize-y rounded-lg border border-slate-700 bg-slate-900 p-3 text-xs leading-5" />
            <textarea aria-label={`${asset.name}提示词`} value={asset.prompt} onChange={(event) => onEdit(asset.id, "prompt", event.target.value)} className="h-28 w-full resize-y rounded-lg border border-slate-700 bg-slate-900 p-3 text-xs leading-5" />
            {asset.errorReason ? <p className="text-xs text-red-300">{asset.errorReason}</p> : null}
            <div className="flex gap-2">
              <button type="button" aria-label={`保存${asset.name}`} onClick={() => void onCommit(asset.id)} className="flex items-center gap-2 rounded-lg border border-slate-600 px-3 py-2 text-xs hover:bg-slate-800">
                <Save className="size-4" />保存
              </button>
              <button type="button" disabled={busyId === asset.id} onClick={() => void onGenerate(asset.id)} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs hover:bg-blue-500 disabled:opacity-50">
                {busyId === asset.id ? <LoaderCircle className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
                {asset.state === "failed" ? "重试生成" : "生成图片"}
              </button>
              <button type="button" aria-label={`删除${asset.name}`} onClick={() => void onDelete(asset.id)} className="rounded-lg border border-red-500/40 px-3 text-red-300 hover:bg-red-500/10">
                <Trash2 className="size-4" />
              </button>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function StoryboardStage({
  items,
  busyId,
  onEdit,
  onCommit,
  onGenerate,
  onDelete,
}: {
  items: StoryboardItem[];
  busyId: number | null;
  onEdit: (item: StoryboardItem) => void;
  onCommit: (item: StoryboardItem) => Promise<void>;
  onGenerate: (id: number) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}) {
  if (!items.length) {
    return <p className="rounded-xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-400">等待右侧智能体生成分镜表并写入分镜节点。</p>;
  }
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {items.map((item) => (
        <article key={item.id} className="overflow-hidden rounded-xl border border-slate-700 bg-slate-950/70">
          {item.src ? <img src={item.src} alt={`分镜 ${item.index + 1}`} className="h-52 w-full bg-black object-contain" /> : <div className="grid h-52 place-items-center bg-slate-900 text-sm text-slate-500">尚无分镜图</div>}
          <div className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <strong>分镜 {item.index + 1}</strong>
              <span className="rounded border border-slate-700 px-2 py-1 text-xs">{stateLabel(item.state)}</span>
            </div>
            <textarea aria-label={`分镜 ${item.index + 1}描述`} value={item.videoDesc} onChange={(event) => onEdit({ ...item, videoDesc: event.target.value })} className="h-24 w-full resize-y rounded-lg border border-slate-700 bg-slate-900 p-3 text-xs leading-5" />
            <textarea aria-label={`分镜 ${item.index + 1}提示词`} value={item.prompt} onChange={(event) => onEdit({ ...item, prompt: event.target.value })} className="h-28 w-full resize-y rounded-lg border border-slate-700 bg-slate-900 p-3 text-xs leading-5" />
            {item.errorReason ? <p className="text-xs text-red-300">{item.errorReason}</p> : null}
            <div className="flex gap-2">
              <button type="button" aria-label={`保存分镜 ${item.index + 1}`} onClick={() => void onCommit(item)} className="flex items-center gap-2 rounded-lg border border-slate-600 px-3 py-2 text-xs hover:bg-slate-800">
                <Save className="size-4" />保存
              </button>
              <button type="button" disabled={busyId === item.id} onClick={() => void onGenerate(item.id)} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs hover:bg-blue-500 disabled:opacity-50">
                {busyId === item.id ? <LoaderCircle className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
                {item.state === "failed" ? "重试分镜" : "生成分镜"}
              </button>
              <button type="button" aria-label={`删除分镜 ${item.index + 1}`} onClick={() => void onDelete(item.id)} className="rounded-lg border border-red-500/40 px-3 text-red-300 hover:bg-red-500/10"><Trash2 className="size-4" /></button>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function cameraStatusLabel(status: string) {
  return {
    planned: "已规划",
    queued: "排队中",
    rendering: "预演中",
    "previs-ready": "预演可用",
    generating: "正式生成中",
    ready: "正式素材可用",
    failed: "失败",
  }[status] ?? status;
}

function previsStatusLabel(status: string) {
  if (status === "failed") return "预演失败";
  if (status === "queued") return "预演排队中";
  if (status === "rendering") return "预演中";
  if (["previs-ready", "generating", "ready"].includes(status)) return "预演已完成";
  return "等待预演";
}

function formalStatusLabel(status: string) {
  if (status === "failed") return "正式生成失败";
  if (status === "generating") return "正式生成中";
  if (status === "ready") return "正式素材可用";
  return "等待正式生成";
}

function CoverageMatrix({
  coverage,
  busyCameraId,
  onRetry,
}: {
  coverage: CinematicCoverageAggregate;
  busyCameraId: string | null;
  onRetry: (cameraId: string) => Promise<void>;
}) {
  const [previewCameraId, setPreviewCameraId] = useState<string | null>(null);
  const byCamera = new Map((coverage.bundle?.cameras ?? []).map((camera) => [camera.cameraId, camera]));
  const selected = previewCameraId ? byCamera.get(previewCameraId) : undefined;
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl border border-slate-700">
        <table aria-label="镜头覆盖矩阵" className="min-w-full border-collapse text-left text-xs">
          <thead className="bg-slate-950 text-slate-300">
            <tr>
              <th className="sticky left-0 border-b border-r border-slate-700 bg-slate-950 px-3 py-3">表演节拍</th>
              {coverage.plan.cameras.map((camera) => <th key={camera.cameraId} className="min-w-48 border-b border-slate-700 px-3 py-3">{camera.role}</th>)}
            </tr>
          </thead>
          <tbody>
            {coverage.plan.blocking.beats.map((beat) => (
              <tr key={beat.id} className="border-b border-slate-800 last:border-0">
                <th className="sticky left-0 border-r border-slate-700 bg-slate-950/95 px-3 py-3 align-top">
                  <div>{beat.id}</div><div className="mt-1 font-normal text-slate-500">{beat.startFrame}–{beat.endFrame} 帧</div>
                </th>
                {coverage.plan.cameras.map((camera) => {
                  const result = byCamera.get(camera.cameraId);
                  const active = camera.activeBeatIds.includes(beat.id);
                  if (!active) return <td key={camera.cameraId} className="px-3 py-3 text-slate-700">—</td>;
                  const preview = result?.assets?.previewVideo?.url || result?.assets?.firstFrame?.url;
                  return (
                    <td key={camera.cameraId} className="px-3 py-3 align-top">
                      <button type="button" disabled={!preview} onClick={() => setPreviewCameraId(camera.cameraId)} className="w-full rounded-lg border border-slate-700 bg-slate-950/60 p-3 text-left disabled:cursor-default">
                        <div className="flex justify-between gap-2"><strong>{camera.shotSize}</strong><span>{camera.lensMm}mm</span></div>
                        <p className="mt-1 line-clamp-2 text-slate-400">{camera.language}</p>
                        <div className="mt-2 flex items-center justify-between gap-2"><span>{cameraStatusLabel(result?.status ?? "planned")}</span><span>{result?.quality?.score == null ? "待评分" : `${Math.round(result.quality.score * 100)}%`}</span></div>
                      </button>
                      {result?.status === "failed" ? (
                        <button type="button" aria-label={`重试机位 ${camera.role}`} disabled={busyCameraId === camera.cameraId} onClick={() => void onRetry(camera.cameraId)} className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-red-500/40 px-3 py-2 text-red-200 hover:bg-red-500/10 disabled:opacity-50">
                          {busyCameraId === camera.cameraId ? <LoaderCircle className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}重试该机位
                        </button>
                      ) : null}
                      {result?.quality?.issues.map((issue) => <p key={`${issue.code}-${issue.message}`} className={issue.severity === "error" ? "mt-2 text-red-300" : "mt-2 text-amber-300"}>{issue.message}</p>)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selected?.assets?.previewVideo?.url ? <video aria-label={`${selected.role} 预演`} src={selected.assets.previewVideo.url} controls className="max-h-[460px] w-full rounded-xl bg-black object-contain" /> : null}
      {!selected?.assets?.previewVideo?.url && selected?.assets?.firstFrame?.url ? <img alt={`${selected.role} 首帧`} src={selected.assets.firstFrame.url} className="max-h-[460px] w-full rounded-xl bg-black object-contain" /> : null}
    </div>
  );
}

function CameraPrevisArtifacts({ coverage }: { coverage: CinematicCoverageAggregate }) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {(coverage.bundle?.cameras ?? []).map((camera) => (
        <article key={camera.cameraId} aria-label={`${camera.role} 预演产物`} className="space-y-3 rounded-xl border border-slate-700 bg-slate-950/70 p-4 text-xs">
          <header className="flex items-center justify-between gap-3">
            <strong>{camera.role}</strong>
            <span className="rounded border border-slate-700 px-2 py-1">预演状态：{previsStatusLabel(camera.status)}</span>
          </header>
          {camera.assets?.previewVideo?.url ? <video aria-label={`${camera.role} 预演视频`} src={camera.assets.previewVideo.url} controls className="aspect-video w-full rounded-lg bg-black object-contain" /> : <p className="text-slate-500">暂无预演视频</p>}
          <div className="grid grid-cols-2 gap-2">
            {camera.assets?.firstFrame?.url ? <a href={camera.assets.firstFrame.url} target="_blank" rel="noreferrer"><img alt={`${camera.role} 首帧`} src={camera.assets.firstFrame.url} className="aspect-video w-full rounded bg-black object-contain" /></a> : null}
            {camera.assets?.lastFrame?.url ? <a href={camera.assets.lastFrame.url} target="_blank" rel="noreferrer"><img alt={`${camera.role} 尾帧`} src={camera.assets.lastFrame.url} className="aspect-video w-full rounded bg-black object-contain" /></a> : null}
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {(["controlFrames", "depthMaps", "masks"] as const).map((field) => {
              const label = field === "controlFrames" ? "控制帧" : field === "depthMaps" ? "深度图" : "遮罩";
              const assets = camera.assets?.[field] ?? [];
              return <div key={field} className="rounded border border-slate-800 p-2"><strong>{label} {assets.length}</strong>{assets.map((asset) => <a key={`${asset.key}-${asset.frame}`} href={asset.url} target="_blank" rel="noreferrer" className="mt-1 block text-blue-300">第 {asset.frame} 帧</a>)}</div>;
            })}
          </div>
          {camera.assets?.manifest?.url ? <a href={camera.assets.manifest.url} target="_blank" rel="noreferrer" className="text-blue-300">打开产物清单</a> : <p className="text-slate-500">暂无产物清单</p>}
          <div className="rounded border border-slate-800 p-3">
            <div className="flex justify-between"><strong>质量报告：{camera.quality?.status ?? "pending"}</strong><span>{camera.quality?.score == null ? "待评分" : `${Math.round(camera.quality.score * 100)}%`}</span></div>
            {camera.quality?.issues.length ? camera.quality.issues.map((issue) => <p key={`${issue.code}-${issue.message}`} className={issue.severity === "error" ? "mt-2 text-red-300" : "mt-2 text-amber-300"}>{issue.code}：{issue.message}</p>) : <p className="mt-2 text-slate-500">暂无质量问题</p>}
            {camera.retry ? <p className="mt-2 text-slate-400">重试 {camera.retry.attempt}/{camera.retry.maxAttempts}{camera.retry.lastError ? ` · ${camera.retry.lastError}` : ""}</p> : null}
          </div>
        </article>
      ))}
    </div>
  );
}

function PrevisStage({
  projectId,
  scriptId,
  flow,
  coverage,
  project,
  api,
  onError,
}: {
  projectId: number;
  scriptId: number;
  flow: ProductionFlowData;
  coverage: CinematicCoverageAggregate;
  project: ProductionProject;
  api: ProductionApi;
  onError: (message: string) => void;
}) {
  const [renders, setRenders] = useState<ProductionPrevisRender[]>(flow.previsRenders ?? []);
  const [busy, setBusy] = useState<string | null>(null);
  const storyboardId = coverage.storyboardId || flow.storyboard[0]?.id;
  useEffect(() => {
    let active = true;
    void api.listPrevisRenders(projectId, scriptId)
      .then((items) => { if (active) setRenders(items); })
      .catch((error) => { if (active) onError(errorMessage(error)); });
    return () => { active = false; };
  }, [api, onError, projectId, scriptId]);

  const replaceRender = (next: ProductionPrevisRender) => setRenders((current) => {
    const exists = current.some((item) => item.renderId === next.renderId);
    return exists ? current.map((item) => item.renderId === next.renderId ? next : item) : [...current, next];
  });
  const run = async (key: string, action: () => Promise<ProductionPrevisRender>) => {
    setBusy(key);
    try { replaceRender(await action()); } catch (error) { onError(errorMessage(error)); } finally { setBusy(null); }
  };

  return (
    <section role="region" aria-label="Blender 预演工作区" className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <a aria-label="打开 3D 导演台" href={`#/projects/${projectId}/director-desk?storyboardId=${storyboardId ?? ""}`} className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-blue-200">打开 3D 导演台</a>
        <a aria-label="打开生产预演工作台" href={`#/projects/${projectId}/production?view=workbench&episodeId=${scriptId}`} className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-blue-200">打开生产预演工作台</a>
        <button type="button" aria-label="提交 Blender 预演" disabled={!storyboardId || busy != null} onClick={() => {
          if (!storyboardId) return;
          const contract = createProductionPrevisContract(flow, projectId, scriptId, storyboardId, project.videoRatio);
          void run("submit", () => api.submitPrevis(contract));
        }} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm disabled:opacity-40">{busy === "submit" ? <LoaderCircle className="size-4 animate-spin" /> : <Video className="size-4" />}提交 Blender 预演</button>
      </div>
      <CameraPrevisArtifacts coverage={coverage} />
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Blender 预演任务</h3>
        {renders.length ? renders.map((render) => (
          <article key={render.renderId} className="rounded-xl border border-slate-700 bg-slate-950/70 p-4 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-3"><strong>{render.renderId}</strong><span>{stateLabel(render.status)} · {render.progress}% · 第 {render.attempt} 次</span></div>
            {render.result?.previewVideoUrl ? <video aria-label={`${render.renderId} Blender 预演`} src={render.result.previewVideoUrl} controls className="mt-3 max-h-80 w-full rounded bg-black object-contain" /> : null}
            {render.errorReason ? <p className="mt-2 text-red-300">{render.errorReason}</p> : null}
            <div className="mt-3 flex gap-2">
              <button type="button" aria-label={`刷新 ${render.renderId}`} disabled={busy != null} onClick={() => void run(`refresh:${render.renderId}`, () => api.getPrevisStatus(projectId, render.renderId))} className="rounded border border-slate-600 px-3 py-2">刷新状态</button>
              {render.status === "failed" ? <button type="button" aria-label={`重试 ${render.renderId}`} disabled={busy != null} onClick={() => void run(`retry:${render.renderId}`, () => api.retryPrevis(projectId, render.renderId))} className="rounded border border-red-500/40 px-3 py-2 text-red-200">重试预演</button> : null}
            </div>
          </article>
        )) : <p className="rounded-xl border border-dashed border-slate-700 p-6 text-center text-slate-500">尚无 Blender 预演任务。</p>}
      </div>
    </section>
  );
}

function FormalGenerationStage({ coverage, generation }: { coverage: CinematicCoverageAggregate; generation?: ProductionGenerationData }) {
  return (
    <section role="region" aria-label="正式生成状态" className="grid gap-4 xl:grid-cols-2">
      {(coverage.bundle?.cameras ?? []).map((camera) => {
        const finalUrl = camera.status === "ready" ? resolveFormalVideoUrl(generation, camera.videoId) : undefined;
        return (
          <article key={camera.cameraId} className="space-y-3 rounded-xl border border-slate-700 bg-slate-950/70 p-4 text-xs">
            <div className="flex items-center justify-between gap-3"><strong>{camera.role}</strong><span>{formalStatusLabel(camera.status)}</span></div>
            {finalUrl ? <video aria-label={`${camera.role} 正式视频`} src={finalUrl} controls className="aspect-video w-full rounded bg-black object-contain" /> : null}
            {camera.status === "ready" && !finalUrl ? <p className="text-red-300">正式视频地址未找到，videoId {camera.videoId ?? "缺失"} 不能进入正式剪辑。</p> : null}
            {camera.status === "failed" ? <p className="text-red-300">正式视频地址未找到；当前机位生成失败。</p> : null}
            {camera.status !== "ready" && camera.status !== "failed" ? <p className="text-slate-500">该机位尚未完成正式视频生成。</p> : null}
          </article>
        );
      })}
    </section>
  );
}

function MulticamEditStage({
  coverage,
  api,
  generation,
  videoRatio,
  onApplied,
  onError,
}: {
  coverage: CinematicCoverageAggregate;
  api: ProductionApi;
  generation?: ProductionGenerationData;
  videoRatio: ProductionProject["videoRatio"];
  onApplied: () => Promise<void> | void;
  onError: (message: string) => void;
}) {
  const [cut, setCut] = useState(coverage.recommendedCut);
  const [busy, setBusy] = useState<"apply" | "export" | null>(null);
  const [mode, setMode] = useState<CoverageEditorMode>("final");
  const [editorRevision, setEditorRevision] = useState(0);
  const [timelineRevision, setTimelineRevision] = useState(coverage.timelineRevision ?? 0);
  const [timelineError, setTimelineError] = useState("");
  useEffect(() => {
    if (coverage.timelineRevision !== undefined) setTimelineRevision(coverage.timelineRevision);
  }, [coverage.timelineRevision]);
  if (!cut) return <p className="rounded-xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-400">建议剪辑尚未生成。</p>;
  const coverageFrameCount = coverage.bundle?.frameCount ?? Math.round((coverage.bundle?.durationSeconds ?? 0) * (coverage.bundle?.fps ?? cut.fps));
  const cutFrames = cut.clips.reduce((sum, clip) => sum + clip.endFrame - clip.startFrame + 1, 0);
  const durationError = coverageFrameCount <= 0 || cut.durationFrames !== coverageFrameCount || cutFrames !== coverageFrameCount
    ? `建议剪辑总时长与镜头覆盖不一致：覆盖 ${coverageFrameCount} 帧，剪辑 ${cutFrames} 帧。`
    : "";
  const downloadOtio = async () => {
    setBusy("export");
    try {
      const file = await api.exportCoverageOtio(coverage.projectId, coverage.scriptId, coverage.coverageId);
      if (typeof URL.createObjectURL === "function") {
        const payload = typeof file.document === "string" ? file.document : JSON.stringify(file.document, null, 2);
        const url = URL.createObjectURL(new Blob([payload], { type: file.mediaType }));
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = file.fileName;
        anchor.click();
        URL.revokeObjectURL(url);
      }
    } catch (error) { onError(errorMessage(error)); } finally { setBusy(null); }
  };
  const editorTimeline = createCoverageEditorTimeline(coverage, cut, generation, mode);
  const unavailable = editorTimeline.filter((clip) => !clip.src);
  return (
    <section role="region" aria-label="建议剪辑" className="space-y-4">
      <label className="flex w-fit items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs"><input type="checkbox" aria-label="预演剪辑模式" checked={mode === "previs"} onChange={(event) => setMode(event.target.checked ? "previs" : "final")} />预演剪辑模式</label>
      {mode === "previs" ? <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">当前使用低清预演素材，仅用于节奏确认。</p> : null}
      {unavailable.length ? <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">{mode === "final" ? "找不到正式视频地址，不能进入正式剪辑。" : "部分机位缺少预演视频，不能建立完整预演时间线。"} 缺少：{unavailable.map((clip) => clip.name).join("、")}</p> : null}
      {durationError ? <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">{durationError}</p> : null}
      {timelineError ? <p role="alert" className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">{timelineError}</p> : null}
      <div className="space-y-2">
        {cut.clips.map((clip) => (
          <div key={clip.id} className="rounded-xl border border-slate-700 bg-slate-950/70 p-3 text-xs">
            <div><strong>{clip.id}</strong><p className="mt-1 text-slate-400">{clip.cameraId} · {clip.startFrame}–{clip.endFrame} 帧</p></div>
          </div>
        ))}
      </div>
      {!unavailable.length && !durationError ? <WebAvVideoEditor key={`${mode}:${editorRevision}`} clips={[]} initialOverlays={editorTimeline} videoRatio={videoRatio} normalizeTimelineChange={(timeline) => {
        const nextCut = updateRecommendedCutFromTimeline(cut, timeline, coverageFrameCount);
        return createCoverageEditorTimeline(coverage, nextCut, generation, mode);
      }} onTimelineError={(error) => {
        setTimelineError(errorMessage(error));
        setEditorRevision((value) => value + 1);
      }} onTimelineChange={(timeline) => {
        try {
          setCut(updateRecommendedCutFromTimeline(cut, timeline, coverageFrameCount));
          setTimelineError("");
        } catch (error) {
          setTimelineError(errorMessage(error));
          setEditorRevision((value) => value + 1);
        }
      }} /> : null}
      <div className="flex justify-end gap-2">
        <button type="button" aria-label="导出 OTIO" disabled={busy != null} onClick={() => void downloadOtio()} className="flex items-center gap-2 rounded-lg border border-slate-600 px-4 py-2 text-sm"><Download className="size-4" />导出 OTIO</button>
        <button type="button" aria-label="应用建议剪辑" disabled={busy != null || unavailable.length > 0 || Boolean(durationError)} onClick={() => {
          setBusy("apply");
          void api.saveCoverageRecommendedCut(coverage.projectId, coverage.scriptId, coverage.coverageId, coverage.version, cut)
            .then((saved) => api.applyCoverageRecommendedCut(coverage.projectId, coverage.scriptId, coverage.coverageId, saved.timelineRevision ?? timelineRevision))
            .then((applied) => { setTimelineRevision(applied.timelineRevision); return onApplied(); }).catch((error) => onError(errorMessage(error))).finally(() => setBusy(null));
        }} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm hover:bg-blue-500 disabled:opacity-50">{busy === "apply" ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}应用建议剪辑</button>
      </div>
    </section>
  );
}

export function InteractiveProductionStageInspector({
  projectId,
  node,
  stage,
  flow,
  generation,
  coverages = [],
  api,
  project,
  onChange,
  onRefresh,
  onClose,
}: InteractiveProductionStageInspectorProps) {
  const label = interactiveStageLabels[stage];
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [busyCameraId, setBusyCameraId] = useState<string | null>(null);
  const [draftFlow, setDraftFlow] = useState(flow);
  useEffect(() => setDraftFlow(flow), [flow, node.scriptId]);

  async function saveFlow(next: ProductionFlowData) {
    setDraftFlow(next);
    onChange(next);
    setNotice("");
    try {
      await api.saveFlowData(projectId, node.scriptId, next);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }

  async function run(id: number, action: () => Promise<unknown>) {
    setBusyId(id);
    setNotice("");
    try {
      await action();
      await onRefresh();
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setBusyId(null);
    }
  }

  let content;
  if (stage === "script" || stage === "scriptPlan" || stage === "storyboardTable") {
    const field = stage;
    const value = field === "script" ? draftFlow.script || node.script?.content || "" : draftFlow[field];
    content = <TextStage label={label} value={value} onSave={(next) => saveFlow({ ...draftFlow, [field]: next })} />;
  } else if (stage === "assets") {
    content = (
      <AssetStage
        flow={draftFlow}
        busyId={busyId}
        onEdit={(id, field, value) => {
          const next = {
            ...draftFlow,
            assets: draftFlow.assets.map((asset) => ({
              ...asset,
              derive: asset.derive.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
            })),
          };
          setDraftFlow(next);
          onChange(next);
        }}
        onCommit={() => saveFlow(draftFlow)}
        onGenerate={(id) => run(id, () => api.generateDerivedAssets(projectId, node.scriptId, [id]))}
        onDelete={async (id) => {
          if (!window.confirm("确定删除该衍生资产吗？")) return;
          try {
            await api.deleteDerivedAsset(projectId, id);
            const next = { ...draftFlow, assets: draftFlow.assets.map((asset) => ({ ...asset, derive: asset.derive.filter((item) => item.id !== id) })) };
            setDraftFlow(next);
            onChange(next);
          } catch (error) {
            setNotice(errorMessage(error));
          }
        }}
      />
    );
  } else if (stage === "storyboard") {
    content = (
      <StoryboardStage
        items={draftFlow.storyboard}
        busyId={busyId}
        onEdit={(item) => {
          const next = { ...draftFlow, storyboard: draftFlow.storyboard.map((current) => (current.id === item.id ? item : current)) };
          setDraftFlow(next);
          onChange(next);
        }}
        onCommit={async (item) => {
          setNotice("");
          try {
            await api.editStoryboard(item.id, item.prompt, item.videoDesc);
          } catch (error) {
            setNotice(errorMessage(error));
          }
        }}
        onGenerate={(id) => run(id, () => api.generateStoryboards({ projectId, scriptId: node.scriptId, storyboardIds: [id] }))}
        onDelete={async (id) => {
          if (!window.confirm("确定删除该分镜吗？")) return;
          try {
            await api.deleteStoryboards(projectId, [id]);
            const next = { ...draftFlow, storyboard: draftFlow.storyboard.filter((item) => item.id !== id) };
            setDraftFlow(next);
            onChange(next);
          } catch (error) {
            setNotice(errorMessage(error));
          }
        }}
      />
    );
  } else if (stage === "blocking") {
    const coverage = selectLatestCoverage(coverages);
    content = coverage ? (
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-4"><div className="text-xs text-slate-500">人物锚点</div><strong className="mt-2 block text-2xl">{coverage.plan.blocking.actorAnchors.length}</strong></div>
        <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-4"><div className="text-xs text-slate-500">表演节拍</div><strong className="mt-2 block text-2xl">{coverage.plan.blocking.beats.length}</strong></div>
        <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-4"><div className="text-xs text-slate-500">表演母线</div><strong className="mt-2 block text-sm">{coverage.plan.blocking.performanceTakeId}</strong></div>
      </div>
    ) : <p className="rounded-xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-400">等待智能体写入场面调度计划。</p>;
  } else if (stage === "coverage") {
    const coverage = selectLatestCoverage(coverages);
    content = coverage ? <CoverageMatrix coverage={coverage} busyCameraId={busyCameraId} onRetry={async (cameraId) => {
      setBusyCameraId(cameraId);
      setNotice("");
      try { await api.retryCoverageCamera(projectId, node.scriptId, coverage.coverageId, cameraId); await onRefresh(); }
      catch (error) { setNotice(errorMessage(error)); }
      finally { setBusyCameraId(null); }
    }} /> : <p className="rounded-xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-400">等待智能体生成镜头覆盖计划。</p>;
  } else if (stage === "previs") {
    const coverage = selectLatestCoverage(coverages);
    content = coverage ? <PrevisStage projectId={projectId} scriptId={node.scriptId} flow={draftFlow} coverage={coverage} project={project} api={api} onError={setNotice} /> : <p className="rounded-xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-400">等待镜头覆盖计划后再提交 Blender 预演。</p>;
  } else if (stage === "formalGeneration") {
    const coverage = selectLatestCoverage(coverages);
    content = coverage ? <FormalGenerationStage coverage={coverage} generation={generation} /> : <p className="rounded-xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-400">等待镜头覆盖与预演结果。</p>;
  } else if (stage === "multicamEdit") {
    const coverage = selectLatestCoverage(coverages);
    content = coverage ? <MulticamEditStage key={recommendedCutDigest(coverage.recommendedCut)} coverage={coverage} api={api} generation={generation} videoRatio={project.videoRatio} onApplied={onRefresh} onError={setNotice} /> : <p className="rounded-xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-400">等待镜头覆盖素材与建议剪辑。</p>;
  } else {
    const checks = [
      ["剧本", Boolean(draftFlow.script.trim())],
      ["导演计划", Boolean(draftFlow.scriptPlan.trim())],
      ["资产", draftFlow.assets.flatMap((asset) => asset.derive).every((asset) => asset.state === "completed")],
      ["分镜表", Boolean(draftFlow.storyboardTable.trim())],
      ["分镜图", draftFlow.storyboard.length > 0 && draftFlow.storyboard.every((item) => item.state === "completed")],
      ["视频", Boolean(generation?.trackList.length) && (generation?.trackList ?? []).every((track) => track.selectVideoId != null)],
    ] as const;
    content = (
      <div className="space-y-3">
        {checks.map(([name, done]) => (
          <div key={name} className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-950/70 px-4 py-3">
            <span>{name}</span>
            <span className={done ? "text-emerald-300" : "text-slate-500"}>{done ? "已通过" : "待完成"}</span>
          </div>
        ))}
        <p className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 text-sm leading-6 text-blue-100">右侧剧本智能体可读取当前节点及全部上游结果，并继续执行缺失阶段。</p>
      </div>
    );
  }

  return (
    <aside role="region" aria-label={`${node.title}${label}节点详情`} className="absolute bottom-4 left-4 right-[430px] top-16 z-[70] flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-700 bg-[#0d1118]/98 text-slate-100 shadow-2xl">
      <header className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
        <div><strong className="text-base">{node.title}</strong><span className="ml-3 text-sm text-blue-300">{label}</span></div>
        <div className="flex gap-2">
          <button type="button" aria-label="刷新节点详情" onClick={() => void onRefresh()} className="grid size-9 place-items-center rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800"><RefreshCw className="size-4" /></button>
          <button type="button" aria-label="关闭节点详情" onClick={onClose} className="grid size-9 place-items-center rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800"><X className="size-4" /></button>
        </div>
      </header>
      {notice ? <div role="alert" className="border-b border-red-500/20 bg-red-500/10 px-5 py-3 text-sm text-red-200">{notice}</div> : null}
      <div className="min-h-0 flex-1 overflow-y-auto p-5">{content}</div>
    </aside>
  );
}
