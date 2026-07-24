import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, AudioLines, History, ImageIcon, LoaderCircle, PencilLine, RotateCcw, Sparkles, Square, SquareCheckBig, Trash2, X } from "lucide-react";

import { Button } from "@react/components/ui/button";
import type { CastingApi } from "./casting-api";
import type { CastingAsset, CastingAssetType } from "./types";

export interface CastingPageProps {
  projectId: number;
  imageModel: string;
  api: CastingApi;
  concurrentCount?: number;
  pollIntervalMs?: number;
}

const assetTypes: Array<{ value: "" | CastingAssetType; label: string }> = [
  { value: "", label: "全部" },
  { value: "role", label: "角色" },
  { value: "scene", label: "场景" },
  { value: "tool", label: "道具" },
];

const typeLabels: Record<CastingAssetType, string> = {
  role: "角色",
  scene: "场景",
  tool: "道具",
};

function messageOf(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const value = error as { message?: unknown; error?: unknown };
    if (typeof value.message === "string") return value.message;
    if (typeof value.error === "string") return value.error;
    try { return JSON.stringify(error); } catch { return "请求失败"; }
  }
  return "请求失败";
}

function updateAssets(current: CastingAsset[], updates: Array<Partial<CastingAsset> & { id: number }>): CastingAsset[] {
  const updateMap = new Map(updates.map((update) => [update.id, update]));
  return current.map((asset) => {
    const update = updateMap.get(asset.id);
    if (!update) return asset;
    return { ...asset, ...update };
  });
}

function stateClass(state: string): string {
  if (state === "生成失败" || state === "失败") return "border-red-500/30 bg-red-500/10 text-red-300";
  if (state === "生成中") return "border-blue-500/30 bg-blue-500/10 text-blue-300";
  if (state === "已完成") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  return "border-slate-700 bg-slate-900 text-slate-400";
}

function EditCastingAssetDialog({
  asset,
  api,
  onClose,
  onSaved,
}: {
  asset: CastingAsset;
  api: CastingApi;
  onClose: () => void;
  onSaved: (updated: CastingAsset) => void;
}) {
  const [describe, setDescribe] = useState(asset.describe ?? "");
  const [prompt, setPrompt] = useState(asset.prompt ?? "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setSaveError("");
    try {
      await api.updateAsset({
        id: asset.id,
        name: asset.name,
        describe,
        prompt,
      });
      onSaved({ ...asset, describe, prompt });
      onClose();
    } catch (cause) {
      setSaveError(messageOf(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={`编辑资产 ${asset.name}`}>
      <form onSubmit={(event) => void save(event)} className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-[#10131a] shadow-2xl shadow-black/60">
        <header className="flex items-start justify-between gap-4 border-b border-slate-800 px-6 py-5">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <span className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-300">{typeLabels[asset.type]}</span>
              <span className="text-xs text-slate-500">资产 #{asset.id}</span>
            </div>
            <h2 className="text-xl font-semibold text-slate-100">{asset.name}</h2>
            <p className="mt-1 text-sm text-slate-400">查看并编辑生成图片所用的完整描述和提示词。</p>
          </div>
          <button type="button" aria-label="关闭资产编辑" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white">
            <X className="size-5" />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto p-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <div className="space-y-5">
            <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
              {asset.filePath ? (
                <img src={asset.filePath} alt={asset.name} className="aspect-video w-full object-cover" />
              ) : (
                <div className="grid aspect-video place-items-center text-slate-700"><ImageIcon className="size-10" /></div>
              )}
            </div>
            <label className="block space-y-2">
              <span className="flex items-center justify-between text-sm font-medium text-slate-200">
                资产描述
                <span className="font-normal text-slate-500">{describe.length} 字</span>
              </span>
              <textarea
                aria-label="资产描述"
                value={describe}
                onChange={(event) => setDescribe(event.target.value)}
                className="min-h-48 w-full resize-y rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm leading-6 text-slate-100 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                placeholder="填写角色、场景或道具的完整描述"
              />
            </label>
          </div>

          <label className="flex min-h-0 flex-col gap-2">
            <span className="flex items-center justify-between text-sm font-medium text-slate-200">
              图片提示词
              <span className="font-normal text-slate-500">{prompt.length} 字</span>
            </span>
            <textarea
              aria-label="图片提示词"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              className="min-h-80 flex-1 resize-y rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 font-mono text-sm leading-6 text-slate-100 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              placeholder="填写将提交给图片模型的完整提示词"
            />
          </label>
        </div>

        <footer className="flex items-center justify-between gap-4 border-t border-slate-800 bg-slate-950/40 px-6 py-4">
          <div className="min-w-0 text-sm text-red-300" role={saveError ? "alert" : undefined}>{saveError}</div>
          <div className="flex shrink-0 gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>取消</Button>
            <Button type="submit" disabled={saving}>
              {saving ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : <PencilLine className="mr-2 size-4" />}
              {saving ? "保存中…" : "保存描述和提示词"}
            </Button>
          </div>
        </footer>
      </form>
    </div>
  );
}

export function CastingPage({ projectId, imageModel, api, concurrentCount = 2, pollIntervalMs = 3_000 }: CastingPageProps) {
  const [assets, setAssets] = useState<CastingAsset[]>([]);
  const [filter, setFilter] = useState<"" | CastingAssetType>("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [resolution, setResolution] = useState("1K");
  const [otherTextPrompt, setOtherTextPrompt] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [historyAsset, setHistoryAsset] = useState<CastingAsset | null>(null);
  const [audioAsset, setAudioAsset] = useState<CastingAsset | null>(null);
  const [editingAsset, setEditingAsset] = useState<CastingAsset | null>(null);
  const [audioIdDraft, setAudioIdDraft] = useState("");
  const [audioOptions, setAudioOptions] = useState<Array<{ id: number; name: string }>>([]);
  const [audioOptionsLoading, setAudioOptionsLoading] = useState(false);

  const activeTypes = useMemo<CastingAssetType[]>(() => (filter ? [filter] : []), [filter]);

  const loadAssets = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const nextAssets = await api.listAssets({ projectId, types: activeTypes });
      setAssets(nextAssets);
      const visibleIds = new Set(nextAssets.map((asset) => asset.id));
      setSelectedIds((current) => current.filter((id) => visibleIds.has(id)));
    } catch (cause) {
      setAssets([]);
      setSelectedIds([]);
      setError(messageOf(cause));
    } finally {
      setLoading(false);
    }
  }, [activeTypes, api, projectId]);

  useEffect(() => {
    void loadAssets();
  }, [loadAssets]);

  const promptIds = useMemo(() => assets.filter((asset) => asset.promptState === "生成中").map((asset) => asset.id), [assets]);
  const imageIds = useMemo(() => assets.filter((asset) => asset.state === "生成中").map((asset) => asset.id), [assets]);
  const audioIds = useMemo(() => assets.filter((asset) => asset.audioBindState === "生成中").map((asset) => asset.id), [assets]);

  useEffect(() => {
    if (promptIds.length === 0 && imageIds.length === 0 && audioIds.length === 0) return;
    const timer = window.setInterval(() => {
      if (promptIds.length > 0) {
        void api
          .pollPrompts(promptIds)
          .then((updates) => setAssets((current) => updateAssets(current, updates)))
          .catch((cause) => setError(messageOf(cause)));
      }
      if (imageIds.length > 0) {
        void api
          .pollImages(imageIds)
          .then((updates) => setAssets((current) => updateAssets(current, updates)))
          .catch((cause) => setError(messageOf(cause)));
      }
      if (audioIds.length > 0) {
        void api
          .pollAudio(audioIds)
          .then((updates) => setAssets((current) => updateAssets(current, updates)))
          .catch((cause) => setError(messageOf(cause)));
      }
    }, pollIntervalMs);
    return () => window.clearInterval(timer);
  }, [api, audioIds.join(","), imageIds.join(","), pollIntervalMs, promptIds.join(",")]);

  function toggleSelected(id: number) {
    setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function selectedAssets(): CastingAsset[] {
    return assets.filter((asset) => selectedIds.includes(asset.id));
  }

  async function batchPolish() {
    const selected = selectedAssets();
    if (selected.length === 0) {
      setError("请先选择至少一个资产");
      return;
    }
    setError("");
    setAssets((current) => updateAssets(current, selected.map((asset) => ({ id: asset.id, promptState: "生成中" }))));
    setSelectedIds([]);
    try {
      await api.batchPolish({
        projectId,
        items: selected.map((asset) => ({
          assetsId: asset.id,
          type: asset.type,
          name: asset.name,
          describe: asset.describe ?? "",
        })),
        concurrentCount,
        otherTextPrompt,
      });
    } catch (cause) {
      setAssets((current) => updateAssets(current, selected.map((asset) => ({ id: asset.id, promptState: "生成失败" }))));
      setError(messageOf(cause));
    }
  }

  async function batchGenerateImages() {
    const selected = selectedAssets();
    if (selected.length === 0) {
      setError("请先选择至少一个资产");
      return;
    }
    const missingPrompts = selected.filter((asset) => !asset.prompt?.trim());
    if (missingPrompts.length > 0) {
      setError(`${missingPrompts.map((asset) => asset.name).join("、")}还没有提示词`);
      return;
    }
    if (!imageModel) {
      setError("项目还没有配置图片模型");
      return;
    }
    setError("");
    setAssets((current) => updateAssets(current, selected.map((asset) => ({ id: asset.id, state: "生成中", errorReason: "" }))));
    setSelectedIds([]);
    try {
      await api.batchGenerateImages({
        projectId,
        model: imageModel,
        resolution,
        concurrentCount,
        items: selected.map((asset) => ({
          id: asset.id,
          type: asset.type,
          name: asset.name,
          prompt: asset.prompt!,
        })),
      });
    } catch (cause) {
      const reason = messageOf(cause);
      setAssets((current) => updateAssets(current, selected.map((asset) => ({ id: asset.id, state: "生成失败", errorReason: reason }))));
      setError(reason);
    }
  }

  async function bindAudio() {
    const selected = selectedAssets();
    if (selected.length === 0) {
      setError("请先选择至少一个要绑定音频的资产");
      return;
    }
    setError("");
    setAssets((current) => updateAssets(current, selected.map((asset) => ({ id: asset.id, audioBindState: "生成中" }))));
    setSelectedIds([]);
    try {
      await api.bindAudio({ projectId, assetsIds: selected.map((asset) => asset.id), concurrentCount });
    } catch (cause) {
      setAssets((current) => updateAssets(current, selected.map((asset) => ({ id: asset.id, audioBindState: "生成失败" }))));
      setError(messageOf(cause));
    }
  }

  async function batchCancel() {
    const selected = selectedAssets().filter((asset) => asset.state === "生成中");
    if (selected.length === 0) {
      setError("所选资产里没有正在生成的图片任务");
      return;
    }
    setError("");
    setSelectedIds([]);
    try {
      await Promise.all(selected.map((asset) => api.cancelAsset({ projectId, assetId: asset.id, types: activeTypes })));
      await loadAssets();
    } catch (cause) {
      setError(messageOf(cause));
    }
  }

  async function cancelAsset(asset: CastingAsset) {
    setError("");
    try {
      await api.cancelAsset({ projectId, assetId: asset.id, types: activeTypes });
      await loadAssets();
    } catch (cause) {
      setError(messageOf(cause));
    }
  }

  async function useHistoryImage(asset: CastingAsset, imageId: number) {
    setError("");
    try {
      await api.selectHistoryImage({ id: asset.id, projectId, type: asset.type, imageId, prompt: asset.prompt });
      setHistoryAsset(null);
      await loadAssets();
    } catch (cause) { setError(messageOf(cause)); }
  }

  async function deleteHistoryImage(imageId: number) {
    try {
      await api.deleteHistoryImage(imageId);
      setHistoryAsset((current) => current ? { ...current, historyImages: current.historyImages?.filter((image) => image.id !== imageId) } : null);
    } catch (cause) { setError(messageOf(cause)); }
  }

  async function retryPrompt(asset: CastingAsset) {
    setError("");
    setAssets((current) => updateAssets(current, [{ id: asset.id, promptState: "生成中", promptErrorReason: "" }]));
    try { await api.retryPrompt({ assetsId: asset.id, projectId, type: asset.type, name: asset.name, describe: asset.describe ?? "" }); }
    catch (cause) { const reason = messageOf(cause); setAssets((current) => updateAssets(current, [{ id: asset.id, promptState: "生成失败", promptErrorReason: reason }])); setError(reason); }
  }

  async function retryImage(asset: CastingAsset) {
    if (!asset.prompt?.trim()) { setError(`${asset.name}还没有提示词`); return; }
    setError("");
    setAssets((current) => updateAssets(current, [{ id: asset.id, state: "生成中", errorReason: "" }]));
    try { await api.retryImage({ projectId, model: imageModel, resolution, id: asset.id, type: asset.type, name: asset.name, prompt: asset.prompt }); }
    catch (cause) { const reason = messageOf(cause); setAssets((current) => updateAssets(current, [{ id: asset.id, state: "生成失败", errorReason: reason }])); setError(reason); }
  }

  async function saveAudio() {
    if (!audioAsset) return;
    const audioIds = audioIdDraft.trim() ? [Number(audioIdDraft)] : [];
    if (audioIds.some((id) => !Number.isInteger(id) || id <= 0)) { setError("请输入有效的音频资产 ID"); return; }
    try { await api.updateAssetAudio({ assetsId: audioAsset.id, audioIds }); setAudioAsset(null); setAudioIdDraft(""); await loadAssets(); }
    catch (cause) { setError(messageOf(cause)); }
  }

  async function openAudio(asset: CastingAsset) {
    setAudioAsset(asset);
    setAudioIdDraft(String(asset.relepedAudio?.[0]?.id ?? ""));
    setAudioOptionsLoading(true);
    try { setAudioOptions(await api.listAudioAssets(projectId)); }
    catch (cause) { setError(messageOf(cause)); setAudioOptions([]); }
    finally { setAudioOptionsLoading(false); }
  }

  return (
    <main className="min-h-full bg-[#090b10] p-5 text-slate-100 lg:p-8">
      <header className="mx-auto mb-6 max-w-[1600px]">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-primary">Asset Factory</p>
        <h1 className="text-3xl font-semibold tracking-tight">塑角造景</h1>
        <p className="mt-2 text-sm text-slate-400">批量完善提示词、生成角色和场景图，并绑定可用音频。</p>
      </header>

      <div className="mx-auto grid max-w-[1600px] gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="h-fit space-y-5 rounded-xl border border-slate-800 bg-[#10131a] p-4">
          <div>
            <span className="text-xs font-medium text-slate-500">资产类型</span>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {assetTypes.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => {
                    setFilter(item.value);
                    setSelectedIds([]);
                  }}
                  className={`rounded-lg border px-3 py-2 text-sm transition ${
                    filter === item.value ? "border-blue-500 bg-blue-500/10 text-blue-300" : "border-slate-800 text-slate-400 hover:border-slate-600"
                  }`}>
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <label className="grid gap-2 text-xs text-slate-500">
            图片分辨率
            <select
              aria-label="图片分辨率"
              className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200"
              value={resolution}
              onChange={(event) => setResolution(event.target.value)}>
              <option value="1K">1K</option>
              <option value="2K">2K</option>
              <option value="4K">4K</option>
            </select>
          </label>

          <label className="grid gap-2 text-xs text-slate-500">
            追加提示
            <textarea
              aria-label="追加提示"
              className="min-h-24 resize-y rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm leading-6 text-slate-200 outline-none focus:border-blue-500"
              value={otherTextPrompt}
              onChange={(event) => setOtherTextPrompt(event.target.value)}
              placeholder="例如：统一成电影概念图"
            />
          </label>

          <div className="space-y-2">
            <div className="text-xs text-slate-500">已选 {selectedIds.length} 项</div>
            <Button className="w-full justify-center" onClick={() => void batchPolish()}>
              <Sparkles className="mr-2 size-4" /> 批量润色提示词
            </Button>
            <Button className="w-full justify-center" onClick={() => void batchGenerateImages()}>
              <ImageIcon className="mr-2 size-4" /> 批量生成图片
            </Button>
            <Button className="w-full justify-center" onClick={() => void bindAudio()}>
              <AudioLines className="mr-2 size-4" /> 批量绑定音频
            </Button>
            <button
              type="button"
              onClick={() => void batchCancel()}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-red-500/30 px-4 py-2 text-sm font-medium text-red-300 transition hover:bg-red-500/10">
              <X className="size-4" /> 批量取消生成
            </button>
          </div>
        </aside>

        <section className="min-w-0">
          {error ? (
            <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-300">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {error}
            </div>
          ) : null}

          <div className="mb-3 flex items-center justify-between text-xs text-slate-500">
            <span>{assets.length} 个资产</span>
            <button
              type="button"
              className="text-blue-300 hover:text-blue-200"
              onClick={() => setSelectedIds((current) => (current.length === assets.length ? [] : assets.map((asset) => asset.id)))}>
              {selectedIds.length === assets.length && assets.length > 0 ? "取消全选" : "全选"}
            </button>
          </div>

          {loading ? (
            <div className="grid min-h-72 place-items-center rounded-xl border border-slate-800 bg-[#10131a] text-sm text-slate-400">
              <span className="flex items-center gap-2"><LoaderCircle className="size-4 animate-spin" /> 正在读取资产</span>
            </div>
          ) : assets.length === 0 ? (
            <div className="grid min-h-72 place-items-center rounded-xl border border-dashed border-slate-800 text-sm text-slate-500">当前筛选下没有资产。</div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
              {assets.map((asset) => {
                const selected = selectedIds.includes(asset.id);
                return (
                  <article key={asset.id} className={`overflow-hidden rounded-xl border bg-[#10131a] ${selected ? "border-blue-500" : "border-slate-800"}`}>
                    <div className="relative aspect-video bg-slate-950">
                      {asset.filePath ? (
                        <img className="size-full object-cover" src={asset.filePath} alt={asset.name} />
                      ) : (
                        <div className="grid size-full place-items-center text-slate-700"><ImageIcon className="size-9" /></div>
                      )}
                      <button
                        type="button"
                        aria-label={`选择${asset.name}`}
                        onClick={() => toggleSelected(asset.id)}
                        className="absolute left-3 top-3 rounded-md bg-black/70 p-1 text-slate-200">
                        {selected ? <SquareCheckBig className="size-5 text-blue-300" /> : <Square className="size-5" />}
                      </button>
                    </div>
                    <div className="space-y-3 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h2 className="font-medium">{asset.name}</h2>
                          <span className="mt-1 inline-flex rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[11px] text-amber-300">
                            {typeLabels[asset.type]}
                          </span>
                        </div>
                        <div className="flex flex-wrap justify-end gap-1">
                          {asset.state ? <span className={`rounded-full border px-2 py-1 text-[11px] ${stateClass(asset.state)}`}>{asset.state}</span> : null}
                          {asset.promptState === "生成中" ? <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-1 text-[11px] text-violet-300">提示词生成中</span> : null}
                          {asset.audioBindState ? <span className={`rounded-full border px-2 py-1 text-[11px] ${stateClass(asset.audioBindState)}`}>音频{asset.audioBindState}</span> : null}
                        </div>
                      </div>
                      <p className="line-clamp-2 min-h-10 text-xs leading-5 text-slate-500">{asset.describe || "暂无描述"}</p>
                      <p className="line-clamp-3 min-h-[3.75rem] rounded-lg bg-slate-950/70 p-2 text-xs leading-5 text-slate-300">{asset.prompt || "尚未生成提示词"}</p>
                      {asset.errorReason || asset.promptErrorReason ? (
                        <p className="text-xs leading-5 text-red-300">{asset.errorReason || asset.promptErrorReason}</p>
                      ) : null}
                      <button
                        type="button"
                        aria-label={`查看并编辑 ${asset.name}`}
                        onClick={() => setEditingAsset(asset)}
                        className="flex w-full items-center justify-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/5 px-3 py-2 text-xs font-medium text-blue-200 transition hover:border-blue-400/50 hover:bg-blue-500/10">
                        <PencilLine className="size-3.5" /> 查看并编辑描述/提示词
                      </button>
                      {asset.state === "生成中" ? (
                        <button
                          type="button"
                          aria-label={`取消生成 ${asset.name}`}
                          onClick={() => void cancelAsset(asset)}
                          className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-500/30 px-3 py-2 text-xs text-red-300 hover:bg-red-500/10">
                          <X className="size-3.5" /> 取消生成
                        </button>
                      ) : null}
                      <div className="grid grid-cols-2 gap-2">
                        {asset.historyImages?.length ? <button type="button" aria-label={`历史图片 ${asset.name}`} onClick={() => setHistoryAsset(asset)} className="flex items-center justify-center gap-1 rounded-lg border border-slate-700 px-2 py-2 text-xs text-slate-300"><History className="size-3.5" />历史图片</button> : null}
                        {asset.type === "role" ? <button type="button" aria-label={`更新音频 ${asset.name}`} onClick={() => void openAudio(asset)} className="flex items-center justify-center gap-1 rounded-lg border border-slate-700 px-2 py-2 text-xs text-slate-300"><AudioLines className="size-3.5" />更新音频</button> : null}
                        {asset.promptState === "生成失败" || asset.promptState === "失败" ? <button type="button" aria-label={`重试提示词 ${asset.name}`} onClick={() => void retryPrompt(asset)} className="flex items-center justify-center gap-1 rounded-lg border border-violet-500/30 px-2 py-2 text-xs text-violet-300"><RotateCcw className="size-3.5" />重试提示词</button> : null}
                        {asset.state === "生成失败" ? <button type="button" aria-label={`重试图片 ${asset.name}`} onClick={() => void retryImage(asset)} className="flex items-center justify-center gap-1 rounded-lg border border-blue-500/30 px-2 py-2 text-xs text-blue-300"><RotateCcw className="size-3.5" />重试图片</button> : null}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
      {historyAsset ? <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4" role="dialog" aria-label={`${historyAsset.name}历史图片`}><section className="w-full max-w-3xl rounded-xl border border-slate-800 bg-[#10131a] p-6"><div className="mb-4 flex justify-between"><h2 className="text-lg font-semibold">{historyAsset.name} · 历史图片</h2><button aria-label="关闭历史图片" onClick={() => setHistoryAsset(null)}><X /></button></div><div className="grid grid-cols-2 gap-3 md:grid-cols-4">{historyAsset.historyImages?.map((image) => <figure key={image.id} className="rounded-lg border border-slate-800 p-2"><img src={image.filePath} alt={`历史图片 ${image.id}`} className="aspect-video w-full rounded object-cover" /><div className="mt-2 flex justify-between"><button type="button" aria-label={`使用历史图片 ${image.id}`} className="text-xs text-blue-300" onClick={() => void useHistoryImage(historyAsset, image.id)}>替换</button><button type="button" aria-label={`删除历史图片 ${image.id}`} className="text-rose-400" onClick={() => void deleteHistoryImage(image.id)}><Trash2 className="size-3.5" /></button></div></figure>)}</div></section></div> : null}
      {audioAsset ? <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4" role="dialog" aria-label={`${audioAsset.name}更新音频`}><section className="w-full max-w-md space-y-4 rounded-xl border border-slate-800 bg-[#10131a] p-6"><h2 className="text-lg font-semibold">更新单项音频</h2><p className="text-sm text-slate-400">从资产中心已上传的音频中选择；选“解除绑定”可清空。</p><select aria-label="选择音频资产" disabled={audioOptionsLoading} className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2" value={audioIdDraft} onChange={(event) => setAudioIdDraft(event.target.value)}><option value="">解除绑定</option>{audioOptions.map((audio) => <option key={audio.id} value={audio.id}>{audio.name}</option>)}</select><div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setAudioAsset(null)}>取消</Button><Button onClick={() => void saveAudio()}>保存音频</Button></div></section></div> : null}
      {editingAsset ? (
        <EditCastingAssetDialog
          asset={editingAsset}
          api={api}
          onClose={() => setEditingAsset(null)}
          onSaved={(updated) => setAssets((current) => updateAssets(current, [{ id: updated.id, describe: updated.describe, prompt: updated.prompt }]))}
        />
      ) : null}
    </main>
  );
}
