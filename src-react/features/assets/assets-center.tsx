import { FormEvent, useMemo, useState } from "react";
import { AlertCircle, Box, Clapperboard, ImageIcon, LoaderCircle, Music2, Plus, Search, Users, X } from "lucide-react";

import { Button } from "@react/components/ui/button";
import { Input } from "@react/components/ui/input";
import { createApiClient, resolveApiBaseUrl } from "@react/lib/api/client";
import { clearSession, getSessionToken } from "@react/lib/auth/session";
import { createAssetApi, type AssetApi } from "./asset-api";
import type { AssetRecord, AssetType, CreateAssetInput, VisualAssetType } from "./types";
import { useAssets } from "./use-assets";

const TYPE_OPTIONS: Array<{ type: AssetType; label: string; icon: typeof Users }> = [
  { type: "role", label: "角色", icon: Users },
  { type: "tool", label: "道具", icon: Box },
  { type: "scene", label: "场景", icon: ImageIcon },
  { type: "clip", label: "素材", icon: Clapperboard },
  { type: "audio", label: "音频", icon: Music2 },
];

const VISUAL_TYPES = new Set<AssetType>(["role", "tool", "scene"]);
const PAGE_SIZE = 20;

function createDefaultAssetApi(): AssetApi {
  const baseUrl = resolveApiBaseUrl({
    envBaseUrl: import.meta.env.VITE_HODOR_API_BASE_URL,
    storedBaseUrl: localStorage.getItem("hodorApiBaseUrl"),
    location: window.location,
  });
  return createAssetApi(
    createApiClient({
      baseUrl,
      getToken: getSessionToken,
      onUnauthorized: clearSession,
    }),
  );
}

function typeLabel(type: AssetType): string {
  return TYPE_OPTIONS.find((item) => item.type === type)?.label ?? type;
}

function assetStatus(asset: AssetRecord): string {
  if (asset.state === "生成中" || asset.promptState === "生成中") return "生成中";
  if (asset.state === "生成失败" || asset.promptState === "生成失败") return "生成失败";
  if (asset.state) return asset.state;
  if (asset.src) return "已完成";
  return "待生成";
}

function StatusBadge({ asset }: { asset: AssetRecord }) {
  const status = assetStatus(asset);
  const tone =
    status === "生成中"
      ? "border-amber-400/30 bg-amber-400/10 text-amber-300"
      : status === "生成失败"
        ? "border-rose-400/30 bg-rose-400/10 text-rose-300"
        : status === "已完成"
          ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
          : "border-slate-700 bg-slate-800 text-slate-400";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${tone}`}>
      {status === "生成中" ? <LoaderCircle className="animate-spin" size={12} /> : null}
      {status}
    </span>
  );
}

function PreviewDialog({ asset, onClose }: { asset: AssetRecord; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-6" role="dialog" aria-modal="true" aria-label={`${asset.name}预览`}>
      <button className="absolute inset-0 cursor-default" aria-label="关闭预览" onClick={onClose} />
      <figure className="relative z-10 max-h-[88vh] max-w-[88vw]">
        <img className="max-h-[80vh] max-w-full rounded-lg object-contain" src={asset.src ?? ""} alt={asset.name} />
        <figcaption className="mt-3 text-center text-sm text-slate-300">{asset.name}</figcaption>
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭"
          className="absolute -right-3 -top-3 grid size-9 place-items-center rounded-full bg-slate-900 text-white shadow-xl ring-1 ring-white/15">
          <X size={17} />
        </button>
      </figure>
    </div>
  );
}

function AssetRow({ asset, onPreview, nested = false }: { asset: AssetRecord; onPreview: (asset: AssetRecord) => void; nested?: boolean }) {
  return (
    <div className={`grid grid-cols-[72px_minmax(140px,1fr)_minmax(180px,2fr)_110px] items-center gap-4 border-b border-white/[.06] px-4 py-3 ${nested ? "bg-white/[.015] pl-10" : ""}`}>
      <button
        type="button"
        aria-label={`预览 ${asset.name}`}
        disabled={!asset.src}
        onClick={() => onPreview(asset)}
        className="group grid size-14 place-items-center overflow-hidden rounded-md bg-slate-900 ring-1 ring-white/10 disabled:cursor-default">
        {asset.src ? (
          <img src={asset.src} alt="" className="size-full object-cover transition group-hover:scale-105" />
        ) : (
          <ImageIcon className="text-slate-600" size={20} />
        )}
      </button>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-slate-100">{asset.name}</p>
        <p className="mt-1 truncate text-xs text-slate-500">{asset.describe || "暂无描述"}</p>
      </div>
      <p className="line-clamp-2 text-sm leading-6 text-slate-400">{asset.prompt || "尚未生成提示词"}</p>
      <StatusBadge asset={asset} />
    </div>
  );
}

function CreateAssetDialog({ projectId, type, api, onClose, onCreated }: { projectId: number; type: VisualAssetType; api: AssetApi; onClose: () => void; onCreated: () => Promise<void> }) {
  const [form, setForm] = useState<Omit<CreateAssetInput, "projectId" | "type">>({ name: "", describe: "", remark: "", prompt: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.name.trim() || !form.describe.trim()) {
      setError("请填写名称和描述");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.createAsset({ projectId, type, ...form, name: form.name.trim(), describe: form.describe.trim() });
      await onCreated();
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "资产创建失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label={`新建${typeLabel(type)}`}>
      <form onSubmit={submit} className="w-full max-w-lg rounded-xl border border-white/10 bg-[#11141b] p-6 shadow-2xl">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">新建{typeLabel(type)}</h2>
            <p className="mt-1 text-sm text-slate-500">先建立资产记录，图片和提示词可在生产阶段继续生成。</p>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭" className="text-slate-500 hover:text-white"><X size={18} /></button>
        </div>
        <div className="space-y-4">
          <label className="block text-sm text-slate-300">名称<Input className="mt-2" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
          <label className="block text-sm text-slate-300">描述<textarea className="mt-2 min-h-24 w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-white outline-none focus:border-primary" value={form.describe} onChange={(event) => setForm({ ...form, describe: event.target.value })} /></label>
          <label className="block text-sm text-slate-300">提示词<textarea className="mt-2 min-h-20 w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-white outline-none focus:border-primary" value={form.prompt} onChange={(event) => setForm({ ...form, prompt: event.target.value })} /></label>
          <label className="block text-sm text-slate-300">备注<Input className="mt-2" value={form.remark} onChange={(event) => setForm({ ...form, remark: event.target.value })} /></label>
        </div>
        {error ? <p className="mt-4 text-sm text-rose-400" role="alert">{error}</p> : null}
        <div className="mt-6 flex justify-end gap-3">
          <Button type="button" variant="ghost" className="border border-border" onClick={onClose}>取消</Button>
          <Button type="submit" disabled={submitting}>{submitting ? "创建中…" : "创建资产"}</Button>
        </div>
      </form>
    </div>
  );
}

export interface AssetsCenterProps {
  projectId: number;
  api?: AssetApi;
}

export function AssetsCenter({ projectId, api }: AssetsCenterProps) {
  const resolvedApi = useMemo(() => api ?? createDefaultAssetApi(), [api]);
  const [activeType, setActiveType] = useState<AssetType>("role");
  const [searchDraft, setSearchDraft] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [preview, setPreview] = useState<AssetRecord | null>(null);
  const [creating, setCreating] = useState(false);
  const { items, total, loading, error, reload } = useAssets({ api: resolvedApi, projectId, type: activeType, name: query, page, pageSize: PAGE_SIZE });
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const selectType = (type: AssetType) => {
    setActiveType(type);
    setSearchDraft("");
    setQuery("");
    setPage(1);
    setCreating(false);
  };

  return (
    <main className="min-h-screen bg-[#090b10] p-5 text-slate-100 lg:p-7">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">Asset Factory</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">资产中心</h1>
          <p className="mt-1 text-sm text-slate-500">项目 #{projectId} · 共 {total} 项</p>
        </div>
        {VISUAL_TYPES.has(activeType) ? (
          <Button onClick={() => setCreating(true)}><Plus size={16} />新建{typeLabel(activeType)}</Button>
        ) : null}
      </header>

      <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-white/10" aria-label="资产类型">
        {TYPE_OPTIONS.map(({ type, label, icon: Icon }) => (
          <button
            type="button"
            key={type}
            onClick={() => selectType(type)}
            className={`flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm transition ${activeType === type ? "border-primary text-white" : "border-transparent text-slate-500 hover:text-slate-300"}`}>
            <Icon size={16} />{label}
          </button>
        ))}
      </nav>

      <form
        className="mb-4 flex max-w-xl gap-2"
        onSubmit={(event) => { event.preventDefault(); setPage(1); setQuery(searchDraft.trim()); }}>
        <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" size={16} /><Input aria-label="搜索资产" className="pl-9" placeholder={`搜索${typeLabel(activeType)}名称`} value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} /></div>
        <Button type="submit" variant="ghost" className="border border-border">搜索</Button>
      </form>

      <section className="overflow-hidden rounded-lg border border-white/10 bg-[#0d1016]" aria-label={`${typeLabel(activeType)}列表`}>
        <div className="grid grid-cols-[72px_minmax(140px,1fr)_minmax(180px,2fr)_110px] gap-4 border-b border-white/10 bg-white/[.025] px-4 py-2.5 text-xs font-medium text-slate-500">
          <span>预览</span><span>名称</span><span>提示词</span><span>状态</span>
        </div>
        {loading ? <div className="grid min-h-52 place-items-center text-sm text-slate-500"><span className="flex items-center gap-2"><LoaderCircle className="animate-spin" size={16} />正在加载资产</span></div> : null}
        {!loading && error ? (
          <div className="grid min-h-52 place-items-center px-6 text-center"><div><AlertCircle className="mx-auto text-rose-400" size={22} /><p role="alert" className="mt-3 text-sm text-rose-300">{error}</p><Button className="mt-4 border border-border" variant="ghost" onClick={() => void reload()}>重试</Button></div></div>
        ) : null}
        {!loading && !error && !items.length ? <div className="grid min-h-52 place-items-center text-sm text-slate-500">暂无{typeLabel(activeType)}资产</div> : null}
        {!loading && !error ? items.map((asset) => (
          <div key={asset.id}>
            <AssetRow asset={asset} onPreview={setPreview} />
            {asset.sonAssets?.map((child) => <AssetRow key={child.id} asset={child} onPreview={setPreview} nested />)}
          </div>
        )) : null}
      </section>

      {total > PAGE_SIZE ? (
        <footer className="mt-4 flex items-center justify-end gap-3 text-sm text-slate-500">
          <Button variant="ghost" className="border border-border" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>上一页</Button>
          <span>{page} / {pageCount}</span>
          <Button variant="ghost" className="border border-border" disabled={page >= pageCount} onClick={() => setPage((current) => current + 1)}>下一页</Button>
        </footer>
      ) : null}

      {preview ? <PreviewDialog asset={preview} onClose={() => setPreview(null)} /> : null}
      {creating && VISUAL_TYPES.has(activeType) ? (
        <CreateAssetDialog projectId={projectId} type={activeType as VisualAssetType} api={resolvedApi} onClose={() => setCreating(false)} onCreated={reload} />
      ) : null}
    </main>
  );
}
