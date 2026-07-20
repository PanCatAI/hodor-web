import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AlertCircle, X } from "lucide-react";

import { Button } from "@react/components/ui/button";
import { Input } from "@react/components/ui/input";
import type {
  DirectorManual,
  HodorProject,
  ModelOption,
  ProjectInput,
  ProjectsApi,
  VisualManual,
} from "./projects-api";

export interface ProjectDialogProps {
  api: ProjectsApi;
  project: HodorProject | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  onManageManuals: () => void;
}

const fieldClass = "space-y-1.5 text-sm text-slate-300";
const selectClass = "h-11 w-full rounded-md border border-border bg-[#0b0e15] px-3 text-sm text-foreground outline-none focus:border-primary";
const textareaClass = "min-h-24 w-full rounded-md border border-border bg-black/20 px-3 py-2 text-sm text-foreground outline-none focus:border-primary";

function defaultInput(project: HodorProject | null): ProjectInput {
  return {
    projectType: project?.projectType || "novel",
    name: project?.name || "",
    intro: project?.intro || "",
    type: project?.type || "",
    artStyle: project?.artStyle || "",
    directorManual: project?.directorManual || "",
    videoRatio: project?.videoRatio || "16:9",
    imageModel: project?.imageModel || "",
    videoModel: project?.videoModel || "",
    imageQuality: project?.imageQuality || "1K",
    mode: project?.mode || "singleImage",
  };
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "项目保存失败";
}

function SelectField({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return (
    <label className={fieldClass}>
      <span>{label}</span>
      <select aria-label={label} required value={value} onChange={(event) => onChange(event.target.value)} className={selectClass}>
        {children}
      </select>
    </label>
  );
}

function modelOptions(models: ModelOption[], current: string, fallbackLabel: string) {
  const hasCurrent = !current || models.some((model) => model.id === current);
  return (
    <>
      <option value="">{fallbackLabel}</option>
      {!hasCurrent ? <option value={current}>{current}（当前配置）</option> : null}
      {models.map((model) => <option key={model.id} value={model.id}>{model.vendorName} · {model.label}</option>)}
    </>
  );
}

export function ProjectDialog({ api, project, onClose, onSaved, onManageManuals }: ProjectDialogProps) {
  const [form, setForm] = useState(() => defaultInput(project));
  const [imageModels, setImageModels] = useState<ModelOption[]>([]);
  const [videoModels, setVideoModels] = useState<ModelOption[]>([]);
  const [visualManuals, setVisualManuals] = useState<VisualManual[]>([]);
  const [directorManuals, setDirectorManuals] = useState<DirectorManual[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const isEdit = project !== null;

  useEffect(() => {
    let active = true;
    setLoadingOptions(true);
    Promise.all([api.listModels("image"), api.listModels("video"), api.listVisualManuals(), api.listDirectorManuals()])
      .then(([images, videos, visuals, directors]) => {
        if (!active) return;
        setImageModels(images);
        setVideoModels(videos);
        setVisualManuals(visuals);
        setDirectorManuals(directors);
      })
      .catch((requestError) => active && setError(errorText(requestError)))
      .finally(() => active && setLoadingOptions(false));
    return () => { active = false; };
  }, [api]);

  const canSubmit = useMemo(() => Object.values(form).every((value) => String(value).trim()), [form]);

  function update<K extends keyof ProjectInput>(key: K, value: ProjectInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) {
      setError("请填写完整的项目、模型和手册配置");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (project) await api.updateProject({ ...form, id: project.id });
      else await api.createProject(form);
      await onSaved();
      onClose();
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4" role="dialog" aria-modal="true" aria-label={isEdit ? "编辑项目" : "新建项目"}>
      <form onSubmit={(event) => void submit(event)} className="max-h-[94vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-border bg-[#10131b] p-6 shadow-2xl">
        <header className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">{isEdit ? "编辑项目" : "新建项目"}</h2>
            <p className="mt-1 text-sm text-slate-500">项目创建后可继续调整模型和生产手册。</p>
          </div>
          <Button type="button" variant="ghost" aria-label="关闭项目表单" onClick={onClose}><X size={18} /></Button>
        </header>

        {error ? <div role="alert" className="mt-5 flex gap-2 rounded-lg border border-red-900/60 bg-red-950/30 p-3 text-sm text-red-200"><AlertCircle size={17} />{error}</div> : null}

        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <label className={fieldClass}><span>项目名称</span><Input aria-label="项目名称" required value={form.name} onChange={(event) => update("name", event.target.value)} /></label>
          <SelectField label="项目来源" value={form.projectType} onChange={(value) => update("projectType", value)}>
            <option value="novel">小说原文</option><option value="script">剧本</option>
          </SelectField>
          <label className={fieldClass}><span>题材类型</span><Input aria-label="题材类型" required value={form.type} onChange={(event) => update("type", event.target.value)} placeholder="悬疑、科幻、言情" /></label>
          <SelectField label="画面比例" value={form.videoRatio} onChange={(value) => update("videoRatio", value)}>
            <option value="16:9">16:9</option><option value="9:16">9:16</option>
          </SelectField>
          <div className="md:col-span-2">
            <label className={fieldClass}><span>项目简介</span><textarea aria-label="项目简介" required value={form.intro} onChange={(event) => update("intro", event.target.value)} className={textareaClass} /></label>
          </div>
          <SelectField label="视觉手册" value={form.artStyle} onChange={(value) => update("artStyle", value)}>
            <option value="">选择视觉手册</option>
            {visualManuals.map((manual) => <option key={manual.stylePath} value={manual.stylePath}>{manual.name}</option>)}
          </SelectField>
          <SelectField label="导演手册" value={form.directorManual} onChange={(value) => update("directorManual", value)}>
            <option value="">选择导演手册</option>
            {directorManuals.map((manual) => <option key={manual.directorManual} value={manual.directorManual}>{manual.name}</option>)}
          </SelectField>
          <SelectField label="图片模型" value={form.imageModel} onChange={(value) => update("imageModel", value)}>
            {modelOptions(imageModels, form.imageModel, "选择图片模型")}
          </SelectField>
          <SelectField label="视频模型" value={form.videoModel} onChange={(value) => update("videoModel", value)}>
            {modelOptions(videoModels, form.videoModel, "选择视频模型")}
          </SelectField>
          <SelectField label="图片质量" value={form.imageQuality} onChange={(value) => update("imageQuality", value)}>
            <option value="1K">1K</option><option value="2K">2K</option><option value="4K">4K</option>
          </SelectField>
          <SelectField label="视频模式" value={form.mode} onChange={(value) => update("mode", value)}>
            <option value="singleImage">单图参考</option><option value="startEndRequired">首尾帧</option><option value="text">纯文本</option>
          </SelectField>
        </div>

        <footer className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
          <Button type="button" variant="ghost" onClick={onManageManuals}>管理手册</Button>
          <div className="flex gap-3">
            <Button type="button" variant="ghost" onClick={onClose}>取消</Button>
            <Button type="submit" disabled={saving || loadingOptions || !canSubmit}>{saving ? "保存中…" : isEdit ? "保存修改" : "创建项目"}</Button>
          </div>
        </footer>
      </form>
    </div>
  );
}
