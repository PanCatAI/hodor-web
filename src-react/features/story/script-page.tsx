import { useCallback, useEffect, useState } from "react";
import { Clapperboard, Download, FilePlus2, Pencil, Search, Sparkles, Trash2, Upload, X } from "lucide-react";

import { Button } from "@react/components/ui/button";
import { Input } from "@react/components/ui/input";
import { Label } from "@react/components/ui/label";
import type { Script, StoryApi } from "./story-api";
import { parseScriptText, readImportFile } from "./import-parser";

export interface ScriptPageProps {
  api: StoryApi;
  projectId: number;
  onOpenStoryboard?: (script: Script) => void;
  pollIntervalMs?: number;
}

interface ScriptDraft {
  id?: number;
  name: string;
  content: string;
  assets: number[];
}

function extractionStatus(script: Script) {
  if (script.extractState === 0) return { text: "资产提取中", className: "text-amber-300" };
  if (script.extractState === 2) return { text: "等待提取资产", className: "text-sky-300" };
  if (script.extractState === -1) return { text: `资产提取失败${script.errorReason ? `：${script.errorReason}` : ""}`, className: "text-red-300" };
  if (script.extractState === 1) return { text: "资产提取完成", className: "text-emerald-300" };
  return { text: "待提取资产", className: "text-slate-500" };
}

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ScriptPage({ api, projectId, onOpenStoryboard, pollIntervalMs = 3000 }: ScriptPageProps) {
  const [scripts, setScripts] = useState<Script[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<ScriptDraft | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [availableAssets, setAvailableAssets] = useState<Array<{ id: number; name: string; type?: string }>>([]);
  const [importRows, setImportRows] = useState<Array<{ scriptName: string; scriptData: string }>>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setScripts(await api.listScripts(projectId, search));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "剧本加载失败");
    } finally {
      setLoading(false);
    }
  }, [api, projectId, search]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const pendingIds = scripts.filter((script) => script.extractState === 0 || script.extractState === 2).map((script) => script.id);
    if (!pendingIds.length) return;
    const poll = async () => {
      try {
        const updates = await api.pollScriptAssets(pendingIds);
        if (!updates.length) return;
        setScripts((current) => {
          let changed = false;
          const next = current.map((script) => {
            const update = updates.find((record) => record.id === script.id);
            if (!update || (update.extractState === script.extractState && update.errorReason === script.errorReason)) return script;
            changed = true;
            return { ...script, ...update };
          });
          return changed ? next : current;
        });
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "资产提取状态轮询失败");
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), pollIntervalMs);
    return () => window.clearInterval(timer);
  }, [api, pollIntervalMs, scripts]);

  function openEditor(script?: Script) {
    setDraft(
      script
        ? { id: script.id, name: script.name, content: script.content, assets: script.relatedAssets?.map((asset) => asset.id) ?? [] }
        : { name: "", content: "", assets: [] },
    );
    api.listSelectableAssets(projectId).then(setAvailableAssets).catch((reason) => setError(reason instanceof Error ? reason.message : "资产列表加载失败"));
  }

  async function saveDraft() {
    if (!draft || !draft.name.trim() || !draft.content.trim()) return;
    setSaving(true);
    setError("");
    try {
      if (draft.id) await api.updateScript({ id: draft.id, name: draft.name, content: draft.content, assets: draft.assets });
      else await api.createScript({ projectId, name: draft.name, content: draft.content, assets: draft.assets });
      setDraft(null);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "剧本保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function remove(script: Script) {
    setError("");
    try {
      await api.deleteScripts([script.id]);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "剧本删除失败");
    }
  }

  function toggleSelected(id: number) {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  async function extractAssets() {
    if (!selectedIds.length) return;
    setWorking(true);
    setError("");
    try {
      await api.extractScriptAssets({ projectId, scriptIds: selectedIds, groupSize: 5 });
      setSelectedIds([]);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "资产提取启动失败");
    } finally {
      setWorking(false);
    }
  }

  async function exportSelected() {
    if (!selectedIds.length) return;
    setWorking(true);
    setError("");
    try {
      saveBlob(await api.exportScripts(selectedIds), `scripts-${new Date().toISOString().slice(0, 10)}.zip`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "剧本导出失败");
    } finally {
      setWorking(false);
    }
  }

  async function batchDelete() {
    if (!selectedIds.length) return;
    setWorking(true);
    setError("");
    try {
      await api.deleteScripts(selectedIds);
      setSelectedIds([]);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "批量删除失败");
    } finally {
      setWorking(false);
    }
  }

  async function chooseImportFile(file?: File) {
    if (!file) return;
    setError("");
    try {
      setImportRows(parseScriptText(await readImportFile(file)).map(({ scriptName, scriptData }) => ({ scriptName, scriptData })));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "剧本文件解析失败");
    }
  }

  async function importAll() {
    if (!importRows.length) return;
    setWorking(true);
    setError("");
    try {
      await api.importScripts(projectId, importRows);
      setImportRows([]);
      setImportOpen(false);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "剧本导入失败");
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className="space-y-5" aria-labelledby="script-title">
      <header className="flex flex-col gap-4 border-b border-border pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Screenplay</p>
          <h1 id="script-title" className="mt-2 text-2xl font-semibold text-white">剧本管理</h1>
          <p className="mt-1 text-sm text-slate-400">管理分集剧本及资产提取状态。</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative min-w-64">
            <Search className="absolute left-3 top-3 text-slate-500" size={17} />
            <Input aria-label="搜索剧本" className="pl-10" placeholder="搜索剧本名称" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") setSearch(searchInput.trim()); }} />
          </div>
          <Button onClick={() => setSearch(searchInput.trim())}>搜索</Button>
          <Button variant="ghost" onClick={() => setImportOpen(true)}><Upload className="mr-2" size={17} />批量导入</Button>
          <Button onClick={() => openEditor()}><FilePlus2 className="mr-2" size={17} />新增剧本</Button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" disabled={!selectedIds.length || working} onClick={() => void extractAssets()}><Sparkles className="mr-2" size={16} />提取资产 ({selectedIds.length})</Button>
        <Button variant="ghost" disabled={!selectedIds.length || working} onClick={() => void exportSelected()}><Download className="mr-2" size={16} />导出剧本 ({selectedIds.length})</Button>
        <Button variant="ghost" className="text-red-300" disabled={!selectedIds.length || working} onClick={() => void batchDelete()}><Trash2 className="mr-2" size={16} />批量删除 ({selectedIds.length})</Button>
      </div>

      {error ? <p role="alert" className="rounded-lg border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-300">{error}</p> : null}
      {loading ? <p className="py-16 text-center text-sm text-slate-500">正在加载剧本…</p> : null}
      {!loading && scripts.length === 0 ? <p className="rounded-xl border border-dashed border-border py-20 text-center text-sm text-slate-500">暂无剧本</p> : null}

      <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
        {scripts.map((script) => {
          const status = extractionStatus(script);
          return (
            <article key={script.id} className="group flex min-h-60 flex-col rounded-xl border border-border bg-[#0d1119] p-5 transition-colors hover:border-slate-600">
              <header className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <input aria-label={`选择 ${script.name}`} type="checkbox" checked={selectedIds.includes(script.id)} onChange={() => toggleSelected(script.id)} />
                  <p className="font-mono text-xs text-slate-600">SCRIPT · {script.id}</p>
                  <h2 className="mt-2 truncate text-lg font-semibold text-white">{script.name}</h2>
                </div>
                <div className="flex gap-1">
                  <Button aria-label={`编辑 ${script.name}`} variant="ghost" onClick={() => openEditor(script)}><Pencil size={16} /></Button>
                  <Button aria-label={`删除 ${script.name}`} variant="ghost" className="text-red-300 hover:bg-red-400/10" onClick={() => void remove(script)}><Trash2 size={16} /></Button>
                </div>
              </header>
              <p className="mt-4 line-clamp-4 flex-1 whitespace-pre-wrap text-sm leading-6 text-slate-400">{script.content}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {script.relatedAssets?.map((asset) => <span key={asset.id} className="rounded-md border border-border bg-white/[0.03] px-2 py-1 text-xs text-slate-300">{asset.name}</span>)}
              </div>
              <footer className="mt-5 flex items-center justify-between border-t border-border pt-4 text-xs">
                <span className={status.className} title={script.errorReason}>{status.text}</span>
                {onOpenStoryboard ? <Button variant="ghost" onClick={() => onOpenStoryboard(script)}><Clapperboard className="mr-2" size={15} />查看分镜</Button> : null}
              </footer>
            </article>
          );
        })}
      </div>

      {draft ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/65" role="dialog" aria-modal="true" aria-labelledby="script-editor-title">
          <div className="h-full w-full max-w-3xl overflow-y-auto border-l border-border bg-[#0b0e14] p-6 shadow-2xl">
            <header className="mb-6 flex items-start justify-between">
              <div><h2 id="script-editor-title" className="text-xl font-semibold text-white">{draft.id ? "编辑剧本" : "新增剧本"}</h2><p className="mt-1 text-sm text-slate-500">保存后可继续提取资产并生成分镜。</p></div>
              <Button aria-label="关闭剧本编辑" variant="ghost" onClick={() => setDraft(null)}><X size={18} /></Button>
            </header>
            <div className="space-y-5">
              <div className="space-y-2"><Label htmlFor="script-name">剧本名称</Label><Input id="script-name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></div>
              <div className="space-y-2"><Label htmlFor="script-content">剧本内容</Label><textarea id="script-content" className="min-h-[480px] w-full rounded-md border border-border bg-black/20 p-3 font-mono text-sm leading-7 text-foreground outline-none focus:border-primary" value={draft.content} onChange={(event) => setDraft({ ...draft, content: event.target.value })} /></div>
              <fieldset className="space-y-3 rounded-xl border border-border p-4"><legend className="px-2 text-sm font-medium text-slate-300">关联资产</legend><div className="grid gap-2 sm:grid-cols-2">{availableAssets.map((asset) => <label key={asset.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm text-slate-300"><input aria-label={asset.name} type="checkbox" checked={draft.assets.includes(asset.id)} onChange={(event) => setDraft({ ...draft, assets: event.target.checked ? [...draft.assets, asset.id] : draft.assets.filter((id) => id !== asset.id) })} /><span>{asset.name}</span><span className="ml-auto text-xs text-slate-600">{asset.type}</span></label>)}</div>{!availableAssets.length ? <p className="text-sm text-slate-500">当前项目暂无可选资产</p> : null}</fieldset>
              <div className="flex justify-end gap-3 border-t border-border pt-5">
                <Button variant="ghost" onClick={() => setDraft(null)}>取消</Button>
                <Button disabled={saving || !draft.name.trim() || !draft.content.trim()} onClick={() => void saveDraft()}>{saving ? "保存中…" : "保存剧本"}</Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {importOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/65 p-4" role="dialog" aria-modal="true" aria-labelledby="script-import-title">
          <div className="w-full max-w-3xl rounded-xl border border-border bg-[#0b0e14] p-6 shadow-2xl">
            <header className="flex items-start justify-between"><div><h2 id="script-import-title" className="text-xl font-semibold text-white">批量导入剧本</h2><p className="mt-1 text-sm text-slate-500">支持 TXT、DOCX，并按“第 N 集”拆分。</p></div><Button aria-label="关闭剧本导入" variant="ghost" onClick={() => setImportOpen(false)}><X size={18} /></Button></header>
            <label className="mt-5 block cursor-pointer rounded-xl border border-dashed border-border p-8 text-center text-sm text-slate-400 hover:border-primary"><Upload className="mx-auto mb-3" /><span>选择剧本文件</span><input aria-label="导入剧本文件" className="sr-only" type="file" accept=".txt,.docx,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => void chooseImportFile(event.target.files?.[0])} /></label>
            <p className="mt-4 text-sm text-slate-300">已解析 {importRows.length} 集</p>
            <div className="mt-3 max-h-72 overflow-auto rounded-lg border border-border divide-y divide-border">{importRows.map((row, index) => <div key={`${index}-${row.scriptName}`} className="px-4 py-3"><p className="font-medium text-white">{row.scriptName}</p><p className="mt-1 line-clamp-2 text-sm text-slate-500">{row.scriptData}</p></div>)}</div>
            <footer className="mt-5 flex justify-end gap-3"><Button variant="ghost" onClick={() => setImportOpen(false)}>取消</Button><Button disabled={!importRows.length || working} onClick={() => void importAll()}>{working ? "导入中…" : `导入 ${importRows.length} 集`}</Button></footer>
          </div>
        </div>
      ) : null}
    </section>
  );
}
