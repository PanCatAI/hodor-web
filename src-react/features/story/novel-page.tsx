import { useCallback, useEffect, useState } from "react";
import { BarChart3, ChevronLeft, ChevronRight, FilePlus2, Pencil, Search, Trash2, Upload, X } from "lucide-react";

import { Button } from "@react/components/ui/button";
import { Input } from "@react/components/ui/input";
import { Label } from "@react/components/ui/label";
import type { CreateNovelInput, OriginalText, StoryApi } from "./story-api";
import { parseNovelText, readImportFile } from "./import-parser";

export interface NovelPageProps {
  api: StoryApi;
  projectId: number;
  pageSize?: number;
  pollIntervalMs?: number;
}

type NovelDraft = Omit<CreateNovelInput, "projectId"> & { id?: number; event: string };

const emptyDraft: NovelDraft = { index: 1, reel: "", chapter: "", chapterData: "", event: "" };

function eventStatus(row: OriginalText) {
  if (row.eventState === 0) return { text: "事件分析中", className: "border-amber-400/30 bg-amber-400/10 text-amber-300" };
  if (row.eventState === -1) {
    return { text: row.errorReason ? `分析失败：${row.errorReason}` : "分析失败", className: "border-red-400/30 bg-red-400/10 text-red-300" };
  }
  if (row.eventState === 1) return { text: "分析完成", className: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" };
  return { text: "待分析", className: "border-slate-400/20 bg-slate-400/10 text-slate-400" };
}

export function NovelPage({ api, projectId, pageSize = 10, pollIntervalMs = 3000 }: NovelPageProps) {
  const [rows, setRows] = useState<OriginalText[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<NovelDraft | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [importRows, setImportRows] = useState<Array<Omit<CreateNovelInput, "projectId">>>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api.listNovels({ projectId, page, limit: pageSize, search });
      setRows(result.data);
      setTotal(result.total);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "原文加载失败");
    } finally {
      setLoading(false);
    }
  }, [api, page, pageSize, projectId, search]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const pendingIds = rows.filter((row) => row.eventState === 0).map((row) => row.id);
    if (!pendingIds.length) return;
    const poll = async () => {
      try {
        const updates = await api.pollNovelEvents(pendingIds);
        if (!updates.length) return;
        setRows((current) => current.map((row) => {
          const update = updates.find((item) => item.id === row.id);
          return update ? { ...row, ...update } : row;
        }));
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "事件状态轮询失败");
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), pollIntervalMs);
    return () => window.clearInterval(timer);
  }, [api, pollIntervalMs, rows]);

  function openEditor(row?: OriginalText) {
    setDraft(
      row
        ? {
            id: row.id,
            index: row.index,
            reel: row.reel,
            chapter: row.chapter,
            chapterData: row.chapterData,
            event: row.event ?? "",
          }
        : { ...emptyDraft, index: total + 1 },
    );
  }

  async function saveDraft() {
    if (!draft || !draft.chapter.trim() || !draft.chapterData.trim()) return;
    setSaving(true);
    setError("");
    try {
      if (draft.id) {
        await api.updateNovel({
          id: draft.id,
          index: draft.index,
          reel: draft.reel,
          chapter: draft.chapter,
          chapterData: draft.chapterData,
          event: draft.event,
        });
      } else {
        await api.createNovel({
          projectId,
          index: draft.index,
          reel: draft.reel,
          chapter: draft.chapter,
          chapterData: draft.chapterData,
        });
      }
      setDraft(null);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "原文保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: OriginalText) {
    setError("");
    try {
      await api.deleteNovel(row.id);
      if (rows.length === 1 && page > 1) setPage((current) => current - 1);
      else await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "原文删除失败");
    }
  }

  function toggleSelected(id: number) {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  async function batchDelete() {
    if (!selectedIds.length) return;
    setError("");
    try {
      await api.deleteNovels(selectedIds);
      setSelectedIds([]);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "批量删除失败");
    }
  }

  async function analyzeEvents() {
    if (!selectedIds.length) return;
    setError("");
    try {
      await api.analyzeNovelEvents({ projectId, novelIds: selectedIds, concurrentCount: 5 });
      setSelectedIds([]);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "事件分析启动失败");
    }
  }

  async function chooseImportFile(file?: File) {
    if (!file) return;
    setError("");
    try {
      setImportRows(parseNovelText(await readImportFile(file)));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "原文文件解析失败");
    }
  }

  async function importAll() {
    if (!importRows.length) return;
    setImporting(true);
    setError("");
    try {
      await api.importNovels(projectId, importRows);
      setImportRows([]);
      setImportOpen(false);
      setPage(1);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "原文导入失败");
    } finally {
      setImporting(false);
    }
  }

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <section className="space-y-5" aria-labelledby="novel-title">
      <header className="flex flex-col gap-4 border-b border-border pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Story Source</p>
          <h1 id="novel-title" className="mt-2 text-2xl font-semibold text-white">原文管理</h1>
          <p className="mt-1 text-sm text-slate-400">管理章节正文，并查看事件分析进度。</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative min-w-64">
            <Search className="absolute left-3 top-3 text-slate-500" size={17} />
            <Input
              aria-label="搜索原文"
              className="pl-10"
              placeholder="搜索章节名称"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  setPage(1);
                  setSearch(searchInput.trim());
                }
              }}
            />
          </div>
          <Button onClick={() => { setPage(1); setSearch(searchInput.trim()); }}>搜索</Button>
          <Button variant="ghost" onClick={() => setImportOpen(true)}><Upload className="mr-2" size={17} />导入原文</Button>
          <Button onClick={() => openEditor()}><FilePlus2 className="mr-2" size={17} />新增原文</Button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" disabled={!selectedIds.length} onClick={() => void analyzeEvents()}><BarChart3 className="mr-2" size={16} />分析事件 ({selectedIds.length})</Button>
        <Button variant="ghost" className="text-red-300" disabled={!selectedIds.length} onClick={() => void batchDelete()}><Trash2 className="mr-2" size={16} />批量删除 ({selectedIds.length})</Button>
      </div>

      {error ? <p role="alert" className="rounded-lg border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-300">{error}</p> : null}

      <div className="overflow-hidden rounded-xl border border-border bg-[#0d1119]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead className="border-b border-border bg-white/[0.025] text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-5 py-4"><input aria-label="选择当前页全部原文" type="checkbox" checked={rows.length > 0 && rows.every((row) => selectedIds.includes(row.id))} onChange={(event) => setSelectedIds(event.target.checked ? rows.map((row) => row.id) : [])} /></th>
                <th className="px-5 py-4">序号</th>
                <th className="px-5 py-4">卷</th>
                <th className="px-5 py-4">章节</th>
                <th className="px-5 py-4">正文</th>
                <th className="px-5 py-4">事件状态</th>
                <th className="px-5 py-4 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => {
                const status = eventStatus(row);
                return (
                  <tr key={row.id} className="align-top text-slate-300 hover:bg-white/[0.025]">
                    <td className="px-5 py-4"><input aria-label={`选择 ${row.chapter}`} type="checkbox" checked={selectedIds.includes(row.id)} onChange={() => toggleSelected(row.id)} /></td>
                    <td className="px-5 py-4 font-mono text-xs text-slate-500">{row.index}</td>
                    <td className="px-5 py-4">{row.reel || "—"}</td>
                    <td className="px-5 py-4 font-medium text-white">{row.chapter}</td>
                    <td className="max-w-md px-5 py-4"><p className="line-clamp-2 leading-6 text-slate-400">{row.chapterData}</p></td>
                    <td className="px-5 py-4">
                      <span title={row.event || undefined} className={`inline-flex rounded-full border px-2.5 py-1 text-xs ${status.className}`}>{status.text}</span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-1">
                        <Button aria-label={`编辑 ${row.chapter}`} variant="ghost" onClick={() => openEditor(row)}><Pencil size={16} /></Button>
                        <Button aria-label={`删除 ${row.chapter}`} variant="ghost" className="text-red-300 hover:bg-red-400/10" onClick={() => void remove(row)}><Trash2 size={16} /></Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {loading ? <p className="px-5 py-10 text-center text-sm text-slate-500">正在加载原文…</p> : null}
        {!loading && rows.length === 0 ? <p className="px-5 py-14 text-center text-sm text-slate-500">暂无原文</p> : null}
        <footer className="flex items-center justify-between border-t border-border px-5 py-3 text-sm text-slate-500">
          <span>共 {total} 章</span>
          <div className="flex items-center gap-3">
            <Button aria-label="上一页" variant="ghost" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}><ChevronLeft size={16} /></Button>
            <span>{page} / {pageCount}</span>
            <Button aria-label="下一页" variant="ghost" disabled={page >= pageCount} onClick={() => setPage((current) => current + 1)}><ChevronRight size={16} /></Button>
          </div>
        </footer>
      </div>

      {importOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/65 p-4" role="dialog" aria-modal="true" aria-labelledby="novel-import-title">
          <div className="w-full max-w-3xl rounded-xl border border-border bg-[#0b0e14] p-6 shadow-2xl">
            <header className="flex items-start justify-between"><div><h2 id="novel-import-title" className="text-xl font-semibold text-white">导入原文</h2><p className="mt-1 text-sm text-slate-500">支持 TXT、DOCX，最大 10MB；章节解析后批量写入。</p></div><Button aria-label="关闭原文导入" variant="ghost" onClick={() => setImportOpen(false)}><X size={18} /></Button></header>
            <label className="mt-5 block cursor-pointer rounded-xl border border-dashed border-border p-8 text-center text-sm text-slate-400 hover:border-primary"><Upload className="mx-auto mb-3" /><span>选择原文文件</span><input aria-label="导入原文文件" className="sr-only" type="file" accept=".txt,.docx,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => void chooseImportFile(event.target.files?.[0])} /></label>
            <p className="mt-4 text-sm text-slate-300">已解析 {importRows.length} 章</p>
            <div className="mt-3 max-h-72 overflow-auto rounded-lg border border-border divide-y divide-border">{importRows.map((row) => <div key={`${row.index}-${row.chapter}`} className="px-4 py-3"><p className="font-medium text-white">{row.index}. {row.chapter}</p><p className="mt-1 line-clamp-2 text-sm text-slate-500">{row.chapterData}</p></div>)}</div>
            <footer className="mt-5 flex justify-end gap-3"><Button variant="ghost" onClick={() => setImportOpen(false)}>取消</Button><Button disabled={!importRows.length || importing} onClick={() => void importAll()}>{importing ? "导入中…" : `导入 ${importRows.length} 章`}</Button></footer>
          </div>
        </div>
      ) : null}

      {draft ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/65" role="dialog" aria-modal="true" aria-labelledby="novel-editor-title">
          <div className="h-full w-full max-w-2xl overflow-y-auto border-l border-border bg-[#0b0e14] p-6 shadow-2xl">
            <header className="mb-6 flex items-start justify-between">
              <div>
                <h2 id="novel-editor-title" className="text-xl font-semibold text-white">{draft.id ? "编辑原文" : "新增原文"}</h2>
                <p className="mt-1 text-sm text-slate-500">章节保存后会进入事件分析流程。</p>
              </div>
              <Button aria-label="关闭原文编辑" variant="ghost" onClick={() => setDraft(null)}><X size={18} /></Button>
            </header>
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2"><Label htmlFor="novel-index">序号</Label><Input id="novel-index" type="number" value={draft.index} onChange={(event) => setDraft({ ...draft, index: Number(event.target.value) })} /></div>
                <div className="space-y-2"><Label htmlFor="novel-reel">卷名</Label><Input id="novel-reel" value={draft.reel} onChange={(event) => setDraft({ ...draft, reel: event.target.value })} /></div>
                <div className="space-y-2"><Label htmlFor="novel-chapter">章节名称</Label><Input id="novel-chapter" value={draft.chapter} onChange={(event) => setDraft({ ...draft, chapter: event.target.value })} /></div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="novel-content">章节内容</Label>
                <textarea id="novel-content" className="min-h-[320px] w-full rounded-md border border-border bg-black/20 p-3 text-sm leading-7 text-foreground outline-none focus:border-primary" value={draft.chapterData} onChange={(event) => setDraft({ ...draft, chapterData: event.target.value })} />
              </div>
              {draft.id ? (
                <div className="space-y-2">
                  <Label htmlFor="novel-event">事件摘要</Label>
                  <textarea id="novel-event" className="min-h-28 w-full rounded-md border border-border bg-black/20 p-3 text-sm text-foreground outline-none focus:border-primary" value={draft.event} onChange={(event) => setDraft({ ...draft, event: event.target.value })} />
                </div>
              ) : null}
              <div className="flex justify-end gap-3 border-t border-border pt-5">
                <Button variant="ghost" onClick={() => setDraft(null)}>取消</Button>
                <Button disabled={saving || !draft.chapter.trim() || !draft.chapterData.trim()} onClick={() => void saveDraft()}>{saving ? "保存中…" : "保存原文"}</Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
