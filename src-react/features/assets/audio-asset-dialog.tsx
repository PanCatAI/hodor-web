import { FormEvent, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";

import { Button } from "@react/components/ui/button";
import { Input } from "@react/components/ui/input";
import type { AssetApi } from "./asset-api";
import type { AssetRecord, AudioAssetItem } from "./types";

interface AudioDraft extends AudioAssetItem {
  key: string;
  file?: File;
}

function emptyDraft(): AudioDraft {
  return { key: crypto.randomUUID(), name: "", describe: "", prompt: "" };
}

function toDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

export function AudioAssetDialog({ asset, projectId, api, onClose, onSaved }: { asset?: AssetRecord; projectId: number; api: AssetApi; onClose: () => void; onSaved: () => Promise<void> }) {
  const [sex = "", ...descriptionParts] = (asset?.describe ?? "|").split("|");
  const [name, setName] = useState(asset?.name ?? "");
  const [description, setDescription] = useState(descriptionParts.join("|"));
  const [gender, setGender] = useState(sex);
  const [items, setItems] = useState<AudioDraft[]>(
    asset?.sonAssets?.length
      ? asset.sonAssets.map((item) => ({ key: String(item.id), id: item.id, src: item.src ?? undefined, name: item.name, describe: item.describe ?? "", prompt: item.prompt ?? "" }))
      : [emptyDraft()],
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const update = (key: string, patch: Partial<AudioDraft>) => setItems((current) => current.map((item) => item.key === key ? { ...item, ...patch } : item));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !description.trim()) { setError("请填写音频名称和描述"); return; }
    const validItems = items.filter((item) => item.file || (item.id && item.src));
    if (!validItems.length) { setError("请至少保留一个音频样本"); return; }
    setSaving(true); setError("");
    try {
      const assetsItem = await Promise.all(validItems.map(async (item) => ({
        ...(item.id && !item.file ? { id: item.id, src: item.src } : { base64: await toDataUrl(item.file!) }),
        name: item.name.trim() || item.file?.name || "音频样本",
        describe: item.describe.trim(),
        prompt: item.prompt.trim(),
      })));
      const input = { projectId, name: name.trim(), describe: `${gender.trim()}|${description.trim()}`, assetsItem };
      if (asset) await api.updateAudioAsset({ id: asset.id, ...input });
      else await api.createAudioAsset(input);
      await onSaved();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "音频资产保存失败");
    } finally { setSaving(false); }
  }

  return <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/75 p-4" role="dialog" aria-label={asset ? `编辑${asset.name}` : "新建音频"}>
    <form onSubmit={submit} className="my-6 w-full max-w-2xl space-y-4 rounded-xl border border-white/10 bg-[#11141b] p-6">
      <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">{asset ? "编辑音频资产" : "新建音频资产"}</h2><button type="button" aria-label="关闭音频编辑" onClick={onClose}><X size={18} /></button></div>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm">音频名称<Input aria-label="音频名称" className="mt-2" value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label className="text-sm">性别<Input aria-label="性别" className="mt-2" value={gender} onChange={(event) => setGender(event.target.value)} /></label>
      </div>
      <label className="block text-sm">音频描述<textarea aria-label="音频描述" className="mt-2 min-h-20 w-full rounded-md border border-border bg-transparent p-3" value={description} onChange={(event) => setDescription(event.target.value)} /></label>
      <div className="space-y-3">
        {items.map((item, index) => <section key={item.key} className="space-y-3 rounded-lg border border-white/10 p-4">
          <div className="flex items-center justify-between"><h3 className="text-sm font-medium">音频样本 {index + 1}</h3><button type="button" aria-label={`删除音频样本 ${index + 1}`} onClick={() => setItems((current) => current.length === 1 ? [emptyDraft()] : current.filter((value) => value.key !== item.key))} className="text-rose-400"><Trash2 size={15} /></button></div>
          {item.src && !item.file ? <audio controls src={item.src} className="w-full" /> : null}
          <input aria-label={`样本文件 ${index + 1}`} type="file" accept="audio/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) update(item.key, { file, src: undefined, name: item.name || file.name }); }} />
          <div className="grid gap-3 md:grid-cols-2"><Input aria-label={`样本名称 ${index + 1}`} placeholder="样本名称" value={item.name} onChange={(event) => update(item.key, { name: event.target.value })} /><Input aria-label={`样本文本 ${index + 1}`} placeholder="对应文本" value={item.prompt} onChange={(event) => update(item.key, { prompt: event.target.value })} /></div>
          <Input aria-label={`样本描述 ${index + 1}`} placeholder="样本描述" value={item.describe} onChange={(event) => update(item.key, { describe: event.target.value })} />
        </section>)}
      </div>
      <Button type="button" variant="ghost" aria-label="添加音频样本" onClick={() => setItems((current) => [...current, emptyDraft()])}><Plus size={15} />添加音频</Button>
      {error ? <p role="alert" className="text-sm text-rose-400">{error}</p> : null}
      <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>取消</Button><Button type="submit" disabled={saving}>{saving ? "保存中…" : "保存音频资产"}</Button></div>
    </form>
  </div>;
}
