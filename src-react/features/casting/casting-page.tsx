import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, AudioLines, ImageIcon, LoaderCircle, Sparkles, Square, SquareCheckBig, X } from "lucide-react";

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
  return error instanceof Error && error.message ? error.message : "请求失败";
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
  if (state === "生成失败") return "border-red-500/30 bg-red-500/10 text-red-300";
  if (state === "生成中") return "border-blue-500/30 bg-blue-500/10 text-blue-300";
  if (state === "已完成") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  return "border-slate-700 bg-slate-900 text-slate-400";
}

export function CastingPage({ projectId, imageModel, api, concurrentCount = 2, pollIntervalMs = 3_000 }: CastingPageProps) {
  const [assets, setAssets] = useState<CastingAsset[]>([]);
  const [filter, setFilter] = useState<"" | CastingAssetType>("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [resolution, setResolution] = useState("1K");
  const [otherTextPrompt, setOtherTextPrompt] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
                      {asset.state === "生成中" ? (
                        <button
                          type="button"
                          aria-label={`取消生成 ${asset.name}`}
                          onClick={() => void cancelAsset(asset)}
                          className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-500/30 px-3 py-2 text-xs text-red-300 hover:bg-red-500/10">
                          <X className="size-3.5" /> 取消生成
                        </button>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
