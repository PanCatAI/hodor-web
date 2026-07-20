import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { AlertCircle, BookOpen, Pencil, Plus, Trash2, X } from "lucide-react";

import { Button } from "@react/components/ui/button";
import { Input } from "@react/components/ui/input";
import type { DirectorManual, ManualTab, ProjectsApi, VisualManual } from "./projects-api";

const visualTabs: Omit<ManualTab, "data">[] = [
  { label: "README", value: "README" },
  { label: "前缀", value: "prefix" },
  { label: "角色", value: "art_character" },
  { label: "角色衍生", value: "art_character_derivative" },
  { label: "道具", value: "art_prop" },
  { label: "道具衍生", value: "art_prop_derivative" },
  { label: "场景", value: "art_scene" },
  { label: "场景衍生", value: "art_scene_derivative" },
  { label: "分镜", value: "director_storyboard" },
  { label: "分镜视频", value: "art_storyboard_video" },
  { label: "技法-导演规划", value: "director_planning_style" },
  { label: "技法-分镜表设计", value: "director_storyboard_table_style" },
];

const directorTabs: Omit<ManualTab, "data">[] = [
  { label: "README", value: "README" },
  { label: "导演规划", value: "director_planning_narrative" },
  { label: "分镜表", value: "director_storyboard_table_narrative" },
];

type ManualKind = "visual" | "director";
type EditingManual = { kind: ManualKind; manual: VisualManual | DirectorManual | null };

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "手册操作失败";
}

function mergeTabs(definitions: Omit<ManualTab, "data">[], current: ManualTab[] | undefined): ManualTab[] {
  return definitions.map((definition) => ({
    ...definition,
    data: current?.find((item) => item.value === definition.value)?.data || "",
  }));
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error("封面读取失败"));
    reader.readAsDataURL(file);
  });
}

interface ManualEditorProps {
  api: ProjectsApi;
  editing: EditingManual;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}

function ManualEditor({ api, editing, onClose, onSaved }: ManualEditorProps) {
  const isVisual = editing.kind === "visual";
  const visual = isVisual ? editing.manual as VisualManual | null : null;
  const director = isVisual ? null : editing.manual as DirectorManual | null;
  const originalPath = visual?.stylePath || director?.directorManual || "";
  const [name, setName] = useState(editing.manual?.name || "");
  const [path, setPath] = useState(originalPath);
  const [images, setImages] = useState(editing.manual?.images || []);
  const [coverUrl, setCoverUrl] = useState("");
  const [tabs, setTabs] = useState(() => mergeTabs(isVisual ? visualTabs : directorTabs, editing.manual?.data));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const title = `${editing.manual ? "编辑" : "新增"}${isVisual ? "视觉" : "导演"}手册`;

  async function addFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    try {
      const values = await Promise.all(files.map(fileToDataUrl));
      setImages((current) => [...current, ...values]);
    } catch (readError) {
      setError(errorText(readError));
    }
    event.target.value = "";
  }

  function addCoverUrl() {
    const value = coverUrl.trim();
    if (!value) return;
    setImages((current) => current.includes(value) ? current : [...current, value]);
    setCoverUrl("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const cleanName = name.trim();
    const cleanPath = path.trim();
    const nextImages = coverUrl.trim() ? [...images, coverUrl.trim()] : images;
    if (!cleanName || !cleanPath || nextImages.length === 0) {
      setError("请填写手册名称、目录标识并添加封面");
      return;
    }
    if (/[/\\]/.test(cleanPath) || cleanPath === "." || cleanPath === ".." || /^\d+$/.test(cleanPath)) {
      setError("目录标识不能包含路径分隔符，也不能是纯数字");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (isVisual) {
        const payload: VisualManual = { name: cleanName, stylePath: cleanPath, images: nextImages, data: tabs };
        if (editing.manual) await api.updateVisualManual(payload);
        else await api.createVisualManual(payload);
      } else {
        const payload: DirectorManual = { name: cleanName, directorManual: cleanPath, images: nextImages, data: tabs };
        if (editing.manual) await api.updateDirectorManual(payload);
        else await api.createDirectorManual(payload);
      }
      await onSaved();
      onClose();
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/80 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <form onSubmit={(event) => void submit(event)} className="max-h-[94vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-border bg-[#10131b] p-6 shadow-2xl">
        <header className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-semibold">{title}</h2>
          <Button type="button" variant="ghost" aria-label="关闭手册编辑" onClick={onClose}><X size={18} /></Button>
        </header>
        {error ? <div role="alert" className="mt-4 flex gap-2 rounded-lg border border-red-900/60 bg-red-950/30 p-3 text-sm text-red-200"><AlertCircle size={17} />{error}</div> : null}
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="space-y-1.5 text-sm text-slate-300"><span>手册名称</span><Input aria-label="手册名称" value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label className="space-y-1.5 text-sm text-slate-300"><span>目录标识</span><Input aria-label="目录标识" value={path} disabled={editing.manual !== null} onChange={(event) => setPath(event.target.value)} placeholder="仅使用字母、数字、下划线或短横线" /></label>
          <label className="space-y-1.5 text-sm text-slate-300 md:col-span-2">
            <span>封面地址</span>
            <div className="flex gap-2"><Input aria-label="封面地址" value={coverUrl} onChange={(event) => setCoverUrl(event.target.value)} placeholder="https://…，也可以选择本地图片" /><Button type="button" variant="ghost" onClick={addCoverUrl}>添加地址</Button></div>
          </label>
          <label className="space-y-1.5 text-sm text-slate-300 md:col-span-2"><span>上传封面</span><Input aria-label="上传封面" type="file" accept="image/*" multiple onChange={(event) => void addFiles(event)} /></label>
        </div>
        {images.length ? (
          <div className="mt-4 flex flex-wrap gap-3">
            {images.map((image, index) => <div key={`${image}-${index}`} className="relative"><img src={image} alt={`手册封面 ${index + 1}`} className="h-20 w-28 rounded-md border border-border object-cover" /><button type="button" aria-label={`移除封面 ${index + 1}`} onClick={() => setImages((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="absolute -right-2 -top-2 rounded-full bg-red-600 p-1 text-white"><X size={12} /></button></div>)}
          </div>
        ) : null}
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {tabs.map((tab, index) => (
            <label key={tab.value} className="space-y-1.5 text-sm text-slate-300">
              <span>{tab.label}</span>
              <textarea aria-label={`${tab.label}提示词`} value={tab.data} onChange={(event) => setTabs((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, data: event.target.value } : item))} className="min-h-28 w-full rounded-md border border-border bg-black/20 px-3 py-2 text-sm text-foreground outline-none focus:border-primary" />
            </label>
          ))}
        </div>
        <footer className="mt-6 flex justify-end gap-3 border-t border-border pt-5"><Button type="button" variant="ghost" onClick={onClose}>取消</Button><Button type="submit" disabled={saving}>{saving ? "保存中…" : `保存${isVisual ? "视觉" : "导演"}手册`}</Button></footer>
      </form>
    </div>
  );
}

export interface ManualManagerProps {
  api: ProjectsApi;
  onClose: () => void;
}

export function ManualManager({ api, onClose }: ManualManagerProps) {
  const [visuals, setVisuals] = useState<VisualManual[]>([]);
  const [directors, setDirectors] = useState<DirectorManual[]>([]);
  const [kind, setKind] = useState<ManualKind>("visual");
  const [editing, setEditing] = useState<EditingManual | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [visualManuals, directorManuals] = await Promise.all([api.listVisualManuals(), api.listDirectorManuals()]);
      setVisuals(visualManuals);
      setDirectors(directorManuals);
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { void refresh(); }, [refresh]);

  const manuals = useMemo(() => kind === "visual" ? visuals : directors, [directors, kind, visuals]);

  async function remove(manual: VisualManual | DirectorManual) {
    const name = kind === "visual" ? (manual as VisualManual).stylePath : (manual as DirectorManual).directorManual;
    if (!window.confirm(`确认删除“${manual.name}”手册？`)) return;
    try {
      if (kind === "visual") await api.deleteVisualManual(name);
      else await api.deleteDirectorManual(name);
      await refresh();
    } catch (requestError) {
      setError(errorText(requestError));
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4" role="dialog" aria-modal="true" aria-label="手册管理">
      <section className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-border bg-[#10131b] p-6 shadow-2xl">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div><h2 className="text-xl font-semibold">手册管理</h2><p className="mt-1 text-sm text-slate-500">维护技能提示词和参考封面，项目会保存对应目录标识。</p></div>
          <Button type="button" variant="ghost" aria-label="关闭手册管理" onClick={onClose}><X size={18} /></Button>
        </header>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
          <div className="flex gap-2">
            <Button type="button" variant={kind === "visual" ? "default" : "ghost"} onClick={() => setKind("visual")}>视觉手册</Button>
            <Button type="button" variant={kind === "director" ? "default" : "ghost"} onClick={() => setKind("director")}>导演手册</Button>
          </div>
          <Button type="button" className="gap-2" onClick={() => setEditing({ kind, manual: null })}><Plus size={16} />新增{kind === "visual" ? "视觉" : "导演"}手册</Button>
        </div>
        {error ? <div role="alert" className="mt-4 flex gap-2 rounded-lg border border-red-900/60 bg-red-950/30 p-3 text-sm text-red-200"><AlertCircle size={17} />{error}</div> : null}
        {loading ? <p className="py-16 text-center text-sm text-slate-500">正在读取手册…</p> : manuals.length === 0 ? <div className="grid min-h-52 place-items-center text-center text-sm text-slate-500"><div><BookOpen className="mx-auto mb-3" /><p>还没有{kind === "visual" ? "视觉" : "导演"}手册</p></div></div> : (
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {manuals.map((manual) => {
              const path = kind === "visual" ? (manual as VisualManual).stylePath : (manual as DirectorManual).directorManual;
              return <article key={path} className="overflow-hidden rounded-xl border border-border bg-white/[0.02]">
                {manual.images[0] ? <img src={manual.images[0]} alt={`${manual.name}封面`} className="h-32 w-full object-cover" /> : <div className="grid h-32 place-items-center bg-black/20"><BookOpen className="text-slate-700" /></div>}
                <div className="p-4"><h3 className="font-medium">{manual.name}</h3><p className="mt-1 truncate text-xs text-slate-500">{path}</p><div className="mt-4 flex gap-2"><Button type="button" variant="ghost" aria-label={`编辑${kind === "visual" ? "视觉" : "导演"}手册 ${manual.name}`} onClick={() => setEditing({ kind, manual })}><Pencil size={15} /></Button><Button type="button" variant="ghost" aria-label={`删除${kind === "visual" ? "视觉" : "导演"}手册 ${manual.name}`} onClick={() => void remove(manual)}><Trash2 size={15} /></Button></div></div>
              </article>;
            })}
          </div>
        )}
      </section>
      {editing ? <ManualEditor api={api} editing={editing} onClose={() => setEditing(null)} onSaved={refresh} /> : null}
    </div>
  );
}
