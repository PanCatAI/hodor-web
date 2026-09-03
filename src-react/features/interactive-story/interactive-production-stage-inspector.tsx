import { useEffect, useState } from "react";
import { CheckCircle2, LoaderCircle, RefreshCw, RotateCcw, Save, Trash2, X } from "lucide-react";

import type {
  ProductionApi,
  ProductionFlowData,
  ProductionGenerationData,
  ProductionProject,
  StoryboardItem,
  VideoTrack,
} from "@react/features/production";
import type { InteractiveProductionStage } from "./interactive-production-topology";
import type { InteractiveStoryNode } from "./types";

export interface InteractiveProductionStageInspectorProps {
  projectId: number;
  node: InteractiveStoryNode;
  stage: InteractiveProductionStage;
  flow: ProductionFlowData;
  generation?: ProductionGenerationData;
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
  workbench: "视频工作台",
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
        className="min-h-[360px] flex-1 resize-none rounded-xl border border-slate-700 bg-slate-950 p-4 text-sm leading-7 text-slate-100 outline-none focus:border-zinc-500"
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
          className="flex items-center gap-2 rounded-lg bg-zinc-600 px-4 py-2 text-sm text-white hover:bg-zinc-500 disabled:opacity-40">
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
            {asset.errorReason ? <p className="text-xs text-zinc-300">{asset.errorReason}</p> : null}
            <div className="flex gap-2">
              <button type="button" aria-label={`保存${asset.name}`} onClick={() => void onCommit(asset.id)} className="flex items-center gap-2 rounded-lg border border-slate-600 px-3 py-2 text-xs hover:bg-slate-800">
                <Save className="size-4" />保存
              </button>
              <button type="button" disabled={busyId === asset.id} onClick={() => void onGenerate(asset.id)} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-zinc-600 px-3 py-2 text-xs hover:bg-zinc-500 disabled:opacity-50">
                {busyId === asset.id ? <LoaderCircle className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
                {asset.state === "failed" ? "重试生成" : "生成图片"}
              </button>
              <button type="button" aria-label={`删除${asset.name}`} onClick={() => void onDelete(asset.id)} className="rounded-lg border border-zinc-500/40 px-3 text-zinc-300 hover:bg-zinc-500/10">
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
            {item.errorReason ? <p className="text-xs text-zinc-300">{item.errorReason}</p> : null}
            <div className="flex gap-2">
              <button type="button" aria-label={`保存分镜 ${item.index + 1}`} onClick={() => void onCommit(item)} className="flex items-center gap-2 rounded-lg border border-slate-600 px-3 py-2 text-xs hover:bg-slate-800">
                <Save className="size-4" />保存
              </button>
              <button type="button" disabled={busyId === item.id} onClick={() => void onGenerate(item.id)} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-zinc-600 px-3 py-2 text-xs hover:bg-zinc-500 disabled:opacity-50">
                {busyId === item.id ? <LoaderCircle className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
                {item.state === "failed" ? "重试分镜" : "生成分镜"}
              </button>
              <button type="button" aria-label={`删除分镜 ${item.index + 1}`} onClick={() => void onDelete(item.id)} className="rounded-lg border border-zinc-500/40 px-3 text-zinc-300 hover:bg-zinc-500/10"><Trash2 className="size-4" /></button>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function WorkbenchStage({
  tracks,
  busyId,
  onPrompt,
  onGenerate,
  onSelect,
}: {
  tracks: VideoTrack[];
  busyId: number | null;
  onPrompt: (track: VideoTrack, prompt: string) => void;
  onGenerate: (track: VideoTrack) => Promise<void>;
  onSelect: (trackId: number, videoId: number) => Promise<void>;
}) {
  if (!tracks.length) {
    return <p className="rounded-xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-400">等待右侧智能体建立视频轨道。</p>;
  }
  return (
    <div className="space-y-4">
      {tracks.map((track, index) => (
        <article key={track.id} className="rounded-xl border border-slate-700 bg-slate-950/70 p-4">
          <div className="flex items-center justify-between gap-3">
            <strong>镜头轨道 {index + 1}</strong>
            <span className="text-xs text-slate-400">{track.duration} 秒 · {stateLabel(track.state)}</span>
          </div>
          <textarea aria-label={`轨道 ${index + 1}视频提示词`} value={track.prompt} onChange={(event) => onPrompt(track, event.target.value)} className="mt-3 h-24 w-full resize-y rounded-lg border border-slate-700 bg-slate-900 p-3 text-xs leading-5" />
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {track.videoList.map((video) => (
              <button key={video.id} type="button" onClick={() => void onSelect(track.id, video.id)} className={`overflow-hidden rounded-lg border text-left ${track.selectVideoId === video.id ? "border-zinc-500 ring-2 ring-zinc-500/20" : "border-slate-700"}`}>
                {video.src ? <video src={video.src} className="aspect-video w-full bg-black object-contain" controls /> : <div className="grid aspect-video place-items-center bg-slate-900 text-xs text-slate-500">{stateLabel(video.state)}</div>}
                <span className="flex items-center gap-2 px-3 py-2 text-xs">{track.selectVideoId === video.id ? <CheckCircle2 className="size-4 text-zinc-400" /> : null}候选 {video.id}</span>
              </button>
            ))}
          </div>
          {track.errorReason ? <p className="mt-3 text-xs text-zinc-300">{track.errorReason}</p> : null}
          <button type="button" disabled={busyId === track.id} onClick={() => void onGenerate(track)} className="mt-3 flex items-center gap-2 rounded-lg bg-zinc-600 px-4 py-2 text-xs hover:bg-zinc-500 disabled:opacity-50">
            {busyId === track.id ? <LoaderCircle className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
            生成新候选视频
          </button>
        </article>
      ))}
    </div>
  );
}

export function InteractiveProductionStageInspector({
  projectId,
  node,
  stage,
  flow,
  generation,
  api,
  project,
  onChange,
  onRefresh,
  onClose,
}: InteractiveProductionStageInspectorProps) {
  const label = interactiveStageLabels[stage];
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
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
  } else if (stage === "workbench") {
    content = (
      <WorkbenchStage
        tracks={generation?.trackList ?? []}
        busyId={busyId}
        onPrompt={(track, prompt) => {
          track.prompt = prompt;
          void api.updateTrackPrompt(track.id, prompt).catch((error) => setNotice(errorMessage(error)));
        }}
        onGenerate={(track) =>
          run(track.id, () =>
            api.generateVideo({
              projectId,
              scriptId: node.scriptId,
              track,
              model: project.videoModel,
              mode: project.videoMode,
              resolution: project.videoResolution || "720p",
              audio: project.videoAudio ?? false,
            }),
          )
        }
        onSelect={(trackId, videoId) => run(trackId, () => api.selectVideo(trackId, videoId))}
      />
    );
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
            <span className={done ? "text-zinc-300" : "text-slate-500"}>{done ? "已通过" : "待完成"}</span>
          </div>
        ))}
        <p className="rounded-xl border border-zinc-500/20 bg-zinc-500/5 p-4 text-sm leading-6 text-zinc-100">右侧剧本智能体可读取当前节点及全部上游结果，并继续执行缺失阶段。</p>
      </div>
    );
  }

  return (
    <aside role="region" aria-label={`${node.title}${label}节点详情`} className="absolute bottom-4 left-4 right-[430px] top-16 z-[70] flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-700 bg-[#111111]/98 text-slate-100 shadow-2xl">
      <header className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
        <div><strong className="text-base">{node.title}</strong><span className="ml-3 text-sm text-zinc-300">{label}</span></div>
        <div className="flex gap-2">
          <button type="button" aria-label="刷新节点详情" onClick={() => void onRefresh()} className="grid size-9 place-items-center rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800"><RefreshCw className="size-4" /></button>
          <button type="button" aria-label="关闭节点详情" onClick={onClose} className="grid size-9 place-items-center rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800"><X className="size-4" /></button>
        </div>
      </header>
      {notice ? <div role="alert" className="border-b border-zinc-500/20 bg-zinc-500/10 px-5 py-3 text-sm text-zinc-200">{notice}</div> : null}
      <div className="min-h-0 flex-1 overflow-y-auto p-5">{content}</div>
    </aside>
  );
}
