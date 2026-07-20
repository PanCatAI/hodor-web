import { useCallback, useEffect, useMemo, useState } from "react";
import { Cuboid, ImageOff, Pencil, RefreshCw, Trash2, X } from "lucide-react";

import { Button } from "@react/components/ui/button";
import { Label } from "@react/components/ui/label";
import type { Storyboard, StoryboardApi } from "./storyboard-api";

interface StoryboardPageProps {
  api: StoryboardApi;
  projectId: number;
  scriptId: number;
  onOpenDirectorDesk?: (storyboardId: number) => void;
}

function frameName(item: Storyboard, position: number) {
  return `S${String(item.index ?? position + 1).padStart(2, "0")}`;
}

function stateStyle(state: string) {
  if (state === "已完成") return "border-emerald-400/30 bg-emerald-400/10 text-emerald-300";
  if (state === "生成中") return "border-amber-400/30 bg-amber-400/10 text-amber-300";
  if (state === "生成失败") return "border-red-400/30 bg-red-400/10 text-red-300";
  return "border-slate-400/20 bg-slate-400/10 text-slate-400";
}

export function StoryboardPage({ api, projectId, scriptId, onOpenDirectorDesk }: StoryboardPageProps) {
  const [items, setItems] = useState<Storyboard[]>([]);
  const [storyboardTable, setStoryboardTable] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<Storyboard | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api.load(projectId, scriptId);
      setItems(result.storyboard ?? []);
      setStoryboardTable(result.storyboardTable ?? "");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "分镜加载失败");
    } finally {
      setLoading(false);
    }
  }, [api, projectId, scriptId]);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => ({
    total: items.length,
    finished: items.filter((item) => item.state === "已完成").length,
    running: items.filter((item) => item.state === "生成中").length,
    failed: items.filter((item) => item.state === "生成失败").length,
  }), [items]);

  async function saveDraft() {
    if (!draft) return;
    setSaving(true);
    setError("");
    try {
      await api.update({ id: draft.id, prompt: draft.prompt ?? "", videoDesc: draft.videoDesc ?? "" });
      setDraft(null);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "分镜保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function remove(item: Storyboard) {
    setError("");
    try {
      await api.remove(item.id, projectId);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "分镜删除失败");
    }
  }

  return (
    <section className="space-y-5" aria-labelledby="storyboard-title">
      <header className="flex flex-col gap-4 border-b border-border pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Storyboard</p>
          <h1 id="storyboard-title" className="mt-2 text-2xl font-semibold text-white">分镜管理</h1>
          <p className="mt-1 text-sm text-slate-400">镜头脚本、生成状态和成片素材集中在这里。</p>
        </div>
        <Button variant="ghost" disabled={loading} onClick={() => void load()}><RefreshCw className={`mr-2 ${loading ? "animate-spin" : ""}`} size={16} />刷新状态</Button>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[{ label: "镜头总数", value: stats.total }, { label: "已完成", value: stats.finished }, { label: "生成中", value: stats.running }, { label: "失败", value: stats.failed }].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-border bg-[#0d1119] px-4 py-3"><p className="text-xs text-slate-500">{stat.label}</p><p className="mt-1 text-2xl font-semibold text-white">{stat.value}</p></div>
        ))}
      </div>

      {storyboardTable ? <details className="rounded-xl border border-border bg-[#0d1119] p-4"><summary className="cursor-pointer text-sm font-medium text-slate-300">查看镜头表原文</summary><pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap text-sm leading-6 text-slate-400">{storyboardTable}</pre></details> : null}
      {error ? <p role="alert" className="rounded-lg border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-300">{error}</p> : null}
      {loading ? <p className="py-16 text-center text-sm text-slate-500">正在加载分镜…</p> : null}
      {!loading && items.length === 0 ? <p className="rounded-xl border border-dashed border-border py-20 text-center text-sm text-slate-500">当前剧本还没有分镜</p> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {items.map((item, position) => {
          const name = frameName(item, position);
          const stateText = item.state === "生成失败" && item.reason ? `生成失败：${item.reason}` : item.state || "未生成";
          return (
            <article key={item.id} className="overflow-hidden rounded-xl border border-border bg-[#0d1119]">
              <div className="relative aspect-video bg-black/30">
                {item.src ? <img src={item.src} alt={`分镜 ${name}`} className="h-full w-full object-contain" loading="lazy" /> : <div className="grid h-full place-items-center text-slate-600"><ImageOff size={28} /></div>}
                <span className="absolute left-3 top-3 rounded bg-black/75 px-2 py-1 font-mono text-xs text-white">{name}</span>
              </div>
              <div className="space-y-4 p-4">
                <div className="flex items-start justify-between gap-3">
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs ${stateStyle(item.state)}`} title={item.reason}>{stateText}</span>
                  <span className="text-xs text-slate-500">{item.duration || 0}s</span>
                </div>
                <div><p className="text-xs text-slate-600">图片提示词</p><p className="mt-1 line-clamp-3 text-sm leading-6 text-slate-300">{item.prompt || "未填写"}</p></div>
                <div><p className="text-xs text-slate-600">视频描述</p><p className="mt-1 line-clamp-3 text-sm leading-6 text-slate-400">{item.videoDesc || "未填写"}</p></div>
                <div className="flex items-center justify-between border-t border-border pt-3">
                  <span className="text-xs text-slate-600">绑定资产 {item.associateAssetsIds?.length ?? 0}</span>
                  <div className="flex gap-1">
                    {onOpenDirectorDesk ? (
                      <Button
                        aria-label={`在 3D 导演台打开分镜 ${name}`}
                        variant="ghost"
                        onClick={() => onOpenDirectorDesk(item.id)}
                      >
                        <Cuboid size={16} />
                      </Button>
                    ) : null}
                    <Button aria-label={`编辑分镜 ${name}`} variant="ghost" onClick={() => setDraft({ ...item })}><Pencil size={16} /></Button>
                    <Button aria-label={`删除分镜 ${name}`} variant="ghost" className="text-red-300 hover:bg-red-400/10" onClick={() => void remove(item)}><Trash2 size={16} /></Button>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {draft ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/65" role="dialog" aria-modal="true" aria-labelledby="storyboard-editor-title">
          <div className="h-full w-full max-w-2xl overflow-y-auto border-l border-border bg-[#0b0e14] p-6 shadow-2xl">
            <header className="mb-6 flex items-start justify-between">
              <div><h2 id="storyboard-editor-title" className="text-xl font-semibold text-white">编辑分镜</h2><p className="mt-1 text-sm text-slate-500">修改图片提示词和视频镜头描述。</p></div>
              <Button aria-label="关闭分镜编辑" variant="ghost" onClick={() => setDraft(null)}><X size={18} /></Button>
            </header>
            <div className="space-y-5">
              <div className="space-y-2"><Label htmlFor="storyboard-prompt">图片提示词</Label><textarea id="storyboard-prompt" className="min-h-48 w-full rounded-md border border-border bg-black/20 p-3 text-sm leading-7 text-foreground outline-none focus:border-primary" value={draft.prompt ?? ""} onChange={(event) => setDraft({ ...draft, prompt: event.target.value })} /></div>
              <div className="space-y-2"><Label htmlFor="storyboard-video-desc">视频描述</Label><textarea id="storyboard-video-desc" className="min-h-40 w-full rounded-md border border-border bg-black/20 p-3 text-sm leading-7 text-foreground outline-none focus:border-primary" value={draft.videoDesc ?? ""} onChange={(event) => setDraft({ ...draft, videoDesc: event.target.value })} /></div>
              <div className="flex justify-end gap-3 border-t border-border pt-5"><Button variant="ghost" onClick={() => setDraft(null)}>取消</Button><Button disabled={saving} onClick={() => void saveDraft()}>{saving ? "保存中…" : "保存分镜"}</Button></div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
