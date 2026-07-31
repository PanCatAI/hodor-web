import { useEffect, useState, type FormEvent } from "react";
import { AlertCircle, X } from "lucide-react";

import { WorldProfileEditor } from "./world-profile-editor";
import {
  createWesternFantasyWorldProfile,
  projectWorldProfileSubmissionError,
  type ProjectWorldProfile,
} from "./world-profile-fields";
import { WorldProfileSummary } from "./world-profile-summary";

export interface WorldProfileInspectorProps {
  profile: ProjectWorldProfile | null;
  onSave: (profile: ProjectWorldProfile) => void | Promise<void>;
  onClose: () => void;
  onExtract?: (mode: "merge" | "replace") => ProjectWorldProfile | Promise<ProjectWorldProfile>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "世界设定保存失败";
}

export function WorldProfileInspector({ profile, onSave, onClose, onExtract }: WorldProfileInspectorProps) {
  const [draft, setDraft] = useState<ProjectWorldProfile>(() => profile ?? createWesternFantasyWorldProfile());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [extracting, setExtracting] = useState<"merge" | "replace" | null>(null);

  useEffect(() => {
    setDraft(profile ?? createWesternFantasyWorldProfile());
    setError("");
  }, [profile]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const validationError = projectWorldProfileSubmissionError(draft);
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave(draft);
      onClose();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  async function extract(mode: "merge" | "replace") {
    if (!onExtract) return;
    if (mode === "replace" && !window.confirm("确认用原文重新整理并替换当前世界设定？手动填写的内容会被覆盖。")) return;
    setExtracting(mode);
    setError("");
    try {
      setDraft(await onExtract(mode));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setExtracting(null);
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="世界设定" className="fixed inset-0 z-[90] flex justify-end bg-slate-950/75 backdrop-blur-sm">
      <form onSubmit={(event) => void submit(event)} className="h-full w-full max-w-3xl overflow-y-auto border-l border-slate-700 bg-[#10131b] p-6 shadow-2xl">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-800 bg-[#10131b] pb-5">
          <div>
            <h2 className="text-xl font-semibold text-slate-100">世界设定</h2>
            <p className="mt-1 text-sm text-slate-500">修改后只更新项目级节点，并由后端注入后续生产提示词。</p>
          </div>
          <button type="button" aria-label="关闭世界设定" onClick={onClose} className="rounded-lg border border-slate-700 p-2 text-slate-300">
            <X className="size-4" />
          </button>
        </header>
        {error ? (
          <div role="alert" className="mt-5 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-300">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            {error}
          </div>
        ) : null}
        <div className="mt-5">
          <WorldProfileSummary profile={draft} />
        </div>
        {onExtract ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              aria-label="从原文整理世界设定"
              disabled={extracting !== null}
              onClick={() => void extract("merge")}
              className="rounded-lg border border-blue-500/40 bg-blue-500/10 px-3 py-2 text-xs text-blue-200 disabled:opacity-50">
              {extracting === "merge" ? "整理中…" : "从原文整理"}
            </button>
            {profile ? (
              <button
                type="button"
                aria-label="替换世界设定"
                disabled={extracting !== null}
                onClick={() => void extract("replace")}
                className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 disabled:opacity-50">
                {extracting === "replace" ? "替换中…" : "重新整理并替换"}
              </button>
            ) : null}
          </div>
        ) : null}
        <div className="mt-6">
          <WorldProfileEditor value={draft} onChange={setDraft} compact />
        </div>
        <footer className="sticky bottom-0 mt-6 flex justify-end gap-3 border-t border-slate-800 bg-[#10131b] py-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300">
            取消
          </button>
          <button type="submit" disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50">
            {saving ? "保存中…" : "保存世界设定"}
          </button>
        </footer>
      </form>
    </div>
  );
}
