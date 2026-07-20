import { lazy, Suspense, useEffect, useMemo, useState, type ComponentType } from "react";
import { Box, Camera, CloudUpload, RotateCcw, Save } from "lucide-react";

import { Button } from "@react/components/ui/button";

import {
  createDirectorDeskSession,
  type DirectorDeskAdapter,
  type DirectorDeskCaptureInput,
  type DirectorDeskDraft,
  type DirectorDeskProjectJson,
  type DirectorDeskScopeId,
} from "./director-desk-contract";

export interface DirectorDeskEditorProps {
  projectId: DirectorDeskScopeId;
  storyboardId: DirectorDeskScopeId;
  projectJson: DirectorDeskProjectJson;
  onProjectChange(projectJson: DirectorDeskProjectJson): void;
  onCapture(capture: DirectorDeskCaptureInput): void | Promise<void>;
}

export interface DirectorDeskEditorModule {
  default: ComponentType<DirectorDeskEditorProps>;
}

export interface DirectorDeskPageProps {
  projectId: DirectorDeskScopeId;
  storyboardId: DirectorDeskScopeId;
  adapter: DirectorDeskAdapter;
  EditorComponent?: ComponentType<DirectorDeskEditorProps>;
  loadEditor?: () => Promise<DirectorDeskEditorModule>;
  initialProjectJson?: DirectorDeskProjectJson;
  storage?: Storage;
  onClose?: () => void;
}

const EMPTY_PROJECT_JSON: DirectorDeskProjectJson = {};

function EditorUnavailable() {
  return (
    <div className="grid h-full min-h-[32rem] place-items-center bg-[#101113] text-[#aeb4bd]">
      <div className="max-w-sm text-center">
        <Box className="mx-auto mb-4 h-9 w-9 text-[#ffb649]" aria-hidden="true" />
        <p className="text-base font-medium text-white">导演台编辑器正在载入</p>
        <p className="mt-2 text-sm leading-6">工程草稿、截图上传和保存合同已经就绪。</p>
      </div>
    </div>
  );
}

function statusLabel(draft: DirectorDeskDraft) {
  if (draft.saveState === "saving") return "保存中";
  if (draft.saveState === "saved") return "已保存";
  if (draft.saveState === "error") return "保存失败，草稿已保留";
  if (draft.loadState === "loading") return "加载云端工程中";
  if (draft.loadState === "offline") return "离线草稿";
  if (draft.loadState === "conflict") return "发现云端冲突";
  return "本地草稿";
}

export function DirectorDeskPage({
  projectId,
  storyboardId,
  adapter,
  EditorComponent,
  loadEditor,
  initialProjectJson,
  storage = window.localStorage,
  onClose,
}: DirectorDeskPageProps) {
  const startingProjectJson = initialProjectJson ?? EMPTY_PROJECT_JSON;
  const session = useMemo(
    () =>
      createDirectorDeskSession({
        scope: { projectId, storyboardId },
        adapter,
        storage,
        initialProjectJson: startingProjectJson,
      }),
    [adapter, projectId, startingProjectJson, storage, storyboardId],
  );
  const [draft, setDraft] = useState(() => session.read());
  const LazyEditor = useMemo(() => (loadEditor ? lazy(loadEditor) : null), [loadEditor]);
  const ActiveEditor = EditorComponent ?? LazyEditor;

  useEffect(() => {
    setDraft(session.read());
    const unsubscribe = session.subscribe(setDraft);
    void session.loadProject().catch(() => {
      // The complete offline draft remains available and the session publishes the load error.
    });
    return unsubscribe;
  }, [session]);

  async function save() {
    try {
      await session.saveProject();
    } catch {
      // The session keeps the actionable error and the complete local draft.
    }
  }

  async function uploadCapture(capture: DirectorDeskCaptureInput) {
    try {
      await session.uploadCapture(capture);
    } catch {
      // The failed data URL remains local so the operator can retry safely.
    }
  }

  async function retryCapture(captureId: string) {
    try {
      await session.retryCapture(captureId);
    } catch {
      // State is published by the session.
    }
  }

  async function keepLocalConflict() {
    try {
      await session.resolveConflict("local");
    } catch {
      // Save state and the local draft remain visible through the session.
    }
  }

  return (
    <section className="flex min-h-[calc(100vh-4rem)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#17181b] text-white shadow-2xl shadow-black/30">
      <header className="flex min-h-16 items-center justify-between gap-4 border-b border-white/10 bg-[#202126] px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#ffb649] text-[#181818]">
            <Camera className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold tracking-wide">3D 导演台</h1>
            <p className="truncate text-xs text-white/45">
              项目 {projectId} · 分镜 {storyboardId}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span role="status" className="hidden text-xs text-white/55 sm:inline">
            {statusLabel(draft)}
          </span>
          <Button type="button" onClick={save} disabled={draft.saveState === "saving"} className="bg-[#ffb649] text-[#171717] hover:bg-[#ffc66f]">
            <Save className="mr-2 h-4 w-4" aria-hidden="true" />
            保存工程
          </Button>
          {onClose ? (
            <Button type="button" variant="ghost" onClick={onClose} className="text-white/70 hover:text-white">
              关闭
            </Button>
          ) : null}
        </div>
      </header>

      {draft.error ? (
        <div role="alert" className="border-b border-red-400/20 bg-red-500/10 px-5 py-2 text-sm text-red-200">
          {draft.error}
        </div>
      ) : null}

      {draft.loadError ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-400/20 bg-amber-500/10 px-5 py-2 text-sm text-amber-100">
          <span>云端工程载入失败，已继续使用离线草稿：{draft.loadError}</span>
          <Button type="button" variant="ghost" onClick={() => void session.loadProject().catch(() => undefined)}>
            重新载入云端工程
          </Button>
        </div>
      ) : null}

      {draft.loadState === "conflict" ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-400/20 bg-amber-500/10 px-5 py-3 text-sm text-amber-100">
          <span>本地草稿和云端工程都有改动，请选择要保留的版本。</span>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => session.resolveConflict("remote")}>
              使用云端版本
            </Button>
            <Button type="button" onClick={keepLocalConflict} className="bg-[#ffb649] text-[#171717] hover:bg-[#ffc66f]">
              保留本地并保存
            </Button>
          </div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1">
        {ActiveEditor ? (
          <Suspense fallback={<EditorUnavailable />}>
            <ActiveEditor
              projectId={projectId}
              storyboardId={storyboardId}
              projectJson={draft.projectJson}
              onProjectChange={session.updateProject}
              onCapture={uploadCapture}
            />
          </Suspense>
        ) : (
          <EditorUnavailable />
        )}
      </div>

      {draft.captures.length > 0 ? (
        <aside aria-label="导演台截图回执" className="border-t border-white/10 bg-[#202126] px-5 py-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-white/45">
            <CloudUpload className="h-4 w-4" aria-hidden="true" />
            截图素材
          </div>
          <ul className="flex flex-wrap gap-2">
            {draft.captures.map((capture) => (
              <li key={capture.id} className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/70">
                <span>
                  {capture.fileName} · {capture.status === "ready" ? "已入库" : capture.status === "uploading" ? "上传中" : "上传失败，可重试"}
                </span>
                {capture.status === "error" ? (
                  <button
                    type="button"
                    aria-label={`重试 ${capture.fileName}`}
                    className="rounded p-1 text-[#ffb649] hover:bg-white/10"
                    onClick={() => retryCapture(capture.id)}>
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </aside>
      ) : null}
    </section>
  );
}
