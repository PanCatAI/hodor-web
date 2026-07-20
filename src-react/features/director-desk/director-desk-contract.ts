export type DirectorDeskScopeId = string | number;

export interface DirectorDeskScope {
  projectId: DirectorDeskScopeId;
  storyboardId: DirectorDeskScopeId;
}

export type DirectorDeskProjectJson = Record<string, unknown>;

export interface DirectorDeskAssetReceipt {
  assetId?: string | number;
  imageId?: string | number;
  filePath?: string;
  requestId?: string;
}

export interface DirectorDeskCapture {
  id: string;
  fileName: string;
  contentType: string;
  status: "uploading" | "ready" | "error";
  url?: string;
  assetReceipt?: DirectorDeskAssetReceipt;
  dataUrl?: string;
  error?: string;
}

export interface DirectorDeskSaveReceipt {
  revision?: string | number;
  savedAt?: string;
  [key: string]: unknown;
}

export interface DirectorDeskLoadReceipt {
  projectJson: DirectorDeskProjectJson;
  captures?: DirectorDeskCapture[];
  revision?: string | number;
  updatedAt?: string;
}

export interface DirectorDeskRemoteConflict extends DirectorDeskLoadReceipt {}

export interface DirectorDeskDraft {
  version: 1;
  scope: DirectorDeskScope;
  projectJson: DirectorDeskProjectJson;
  captures: DirectorDeskCapture[];
  updatedAt: string;
  saveState: "local" | "saving" | "saved" | "error";
  error: string | null;
  saveReceipt?: DirectorDeskSaveReceipt;
  loadState?: "idle" | "loading" | "loaded" | "offline" | "conflict";
  loadError?: string;
  remoteConflict?: DirectorDeskRemoteConflict;
}

export interface DirectorDeskSaveInput {
  scope: DirectorDeskScope;
  projectJson: DirectorDeskProjectJson;
  captures: DirectorDeskCapture[];
  updatedAt: string;
  revision?: string | number;
}

export interface DirectorDeskCaptureUploadInput {
  scope: DirectorDeskScope;
  fileName: string;
  contentType: string;
  body: Blob;
}

export interface DirectorDeskCaptureUploadReceipt extends DirectorDeskAssetReceipt {
  url: string;
}

export interface DirectorDeskAdapter {
  loadProject(scope: DirectorDeskScope): Promise<DirectorDeskLoadReceipt | null>;
  saveProject(input: DirectorDeskSaveInput): Promise<DirectorDeskSaveReceipt>;
  uploadCapture(input: DirectorDeskCaptureUploadInput): Promise<DirectorDeskCaptureUploadReceipt>;
}

export interface DirectorDeskCaptureInput {
  dataUrl: string;
  fileName?: string;
}

export interface DirectorDeskDraftStore {
  readonly key: string;
  read(): DirectorDeskDraft | null;
  write(draft: DirectorDeskDraft): void;
  clear(): void;
}

interface DirectorDeskSessionOptions {
  scope: DirectorDeskScope;
  adapter: DirectorDeskAdapter;
  storage: Storage;
  now?: () => Date;
  initialProjectJson?: DirectorDeskProjectJson;
}

export interface DirectorDeskSession {
  read(): DirectorDeskDraft;
  subscribe(listener: (draft: DirectorDeskDraft) => void): () => void;
  updateProject(projectJson: DirectorDeskProjectJson): DirectorDeskDraft;
  loadProject(): Promise<DirectorDeskDraft>;
  resolveConflict(strategy: "local" | "remote"): DirectorDeskDraft | Promise<DirectorDeskDraft>;
  saveProject(projectJson?: DirectorDeskProjectJson): Promise<DirectorDeskDraft>;
  uploadCapture(input: DirectorDeskCaptureInput): Promise<DirectorDeskCapture>;
  retryCapture(captureId: string): Promise<DirectorDeskCapture>;
}

function sameScope(left: DirectorDeskScope, right: DirectorDeskScope) {
  return String(left.projectId) === String(right.projectId) && String(left.storyboardId) === String(right.storyboardId);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isDraft(value: unknown, scope: DirectorDeskScope): value is DirectorDeskDraft {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.scope)) return false;
  const storedScope = value.scope as unknown as DirectorDeskScope;
  return (
    sameScope(storedScope, scope) &&
    isRecord(value.projectJson) &&
    Array.isArray(value.captures) &&
    typeof value.updatedAt === "string" &&
    typeof value.saveState === "string"
  );
}

function scopePart(value: DirectorDeskScopeId) {
  return encodeURIComponent(String(value));
}

export function createDirectorDeskDraftStore(storage: Storage, scope: DirectorDeskScope): DirectorDeskDraftStore {
  const key = `hodor:director-desk:v1:${scopePart(scope.projectId)}:${scopePart(scope.storyboardId)}`;
  return {
    key,
    read() {
      const raw = storage.getItem(key);
      if (!raw) return null;
      try {
        const value: unknown = JSON.parse(raw);
        return isDraft(value, scope) ? value : null;
      } catch {
        return null;
      }
    },
    write(draft) {
      storage.setItem(key, JSON.stringify(draft));
    },
    clear() {
      storage.removeItem(key);
    },
  };
}

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (isRecord(error) && typeof error.message === "string" && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return "操作失败";
}

function parseCaptureDataUrl(dataUrl: string) {
  const match = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) throw new Error("截图数据格式无效");
  const contentType = match[1] || "image/png";
  const encoded = match[3] ?? "";
  const binary = match[2] ? atob(encoded) : decodeURIComponent(encoded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return { contentType, body: new Blob([bytes], { type: contentType }) };
}

function defaultDraft(scope: DirectorDeskScope, projectJson: DirectorDeskProjectJson, now: () => Date): DirectorDeskDraft {
  return {
    version: 1,
    scope,
    projectJson,
    captures: [],
    updatedAt: now().toISOString(),
    saveState: "local",
    error: null,
  };
}

export function createDirectorDeskSession({
  scope,
  adapter,
  storage,
  now = () => new Date(),
  initialProjectJson = {},
}: DirectorDeskSessionOptions): DirectorDeskSession {
  const store = createDirectorDeskDraftStore(storage, scope);
  const storedDraft = store.read();
  let draft = storedDraft ?? defaultDraft(scope, initialProjectJson, now);
  const listeners = new Set<(nextDraft: DirectorDeskDraft) => void>();

  function publish(nextDraft: DirectorDeskDraft) {
    draft = nextDraft;
    store.write(draft);
    listeners.forEach((listener) => listener(draft));
    return draft;
  }

  function updateProject(projectJson: DirectorDeskProjectJson) {
    return publish({
      ...draft,
      projectJson,
      updatedAt: now().toISOString(),
      saveState: "local",
      error: null,
      loadError: undefined,
    });
  }

  function cleanRemoteCaptures(captures: DirectorDeskCapture[] = []) {
    return captures
      .filter((capture) => capture.status === "ready" && typeof capture.url === "string" && capture.url.length > 0)
      .map(({ dataUrl: _dataUrl, error: _error, ...capture }) => capture);
  }

  function adoptRemote(remote: DirectorDeskLoadReceipt) {
    return publish({
      ...draft,
      projectJson: remote.projectJson,
      captures: cleanRemoteCaptures(remote.captures),
      updatedAt: remote.updatedAt ?? now().toISOString(),
      saveState: "saved",
      error: null,
      loadState: "loaded",
      loadError: undefined,
      remoteConflict: undefined,
      saveReceipt: {
        revision: remote.revision,
        savedAt: remote.updatedAt,
      },
    });
  }

  async function loadProject() {
    const loadingDraft = publish({ ...draft, loadState: "loading", loadError: undefined });
    try {
      const remote = await adapter.loadProject(scope);
      if (!remote) {
        return publish({ ...draft, loadState: "loaded", loadError: undefined });
      }

      const changedWhileLoading = draft.projectJson !== loadingDraft.projectJson || draft.updatedAt !== loadingDraft.updatedAt;
      const hasUnsavedLocalDraft = (Boolean(storedDraft) || changedWhileLoading) && (draft.saveState === "local" || draft.saveState === "error");
      const savedRevision = draft.saveReceipt?.revision;
      const revisionChanged = !savedRevision || !remote.revision || savedRevision !== remote.revision;
      if (hasUnsavedLocalDraft && revisionChanged) {
        return publish({
          ...draft,
          loadState: "conflict",
          loadError: undefined,
          remoteConflict: { ...remote, captures: cleanRemoteCaptures(remote.captures) },
        });
      }
      return adoptRemote(remote);
    } catch (error) {
      publish({ ...draft, loadState: "offline", loadError: errorMessage(error) });
      throw error;
    }
  }

  function resolveConflict(strategy: "local" | "remote") {
    const remote = draft.remoteConflict;
    if (!remote) return draft;
    if (strategy === "remote") return adoptRemote(remote);
    const current = publish({
      ...draft,
      loadState: "loaded",
      loadError: undefined,
      remoteConflict: undefined,
    });
    return persist(current);
  }

  async function persist(current: DirectorDeskDraft) {
    const saving = publish({ ...current, saveState: "saving", error: null });
    try {
      const saveReceipt = await adapter.saveProject({
        scope,
        projectJson: saving.projectJson,
        captures: saving.captures,
        updatedAt: saving.updatedAt,
        revision: saving.saveReceipt?.revision,
      });
      return publish({ ...saving, saveState: "saved", error: null, saveReceipt });
    } catch (error) {
      publish({ ...saving, saveState: "error", error: errorMessage(error) });
      throw error;
    }
  }

  async function upload(input: DirectorDeskCaptureInput, existingId?: string) {
    const parsed = parseCaptureDataUrl(input.dataUrl);
    const id = existingId ?? `capture-${now().getTime()}-${draft.captures.length + 1}`;
    const fileName = input.fileName?.trim() || `${id}.png`;
    const pending: DirectorDeskCapture = {
      id,
      fileName,
      contentType: parsed.contentType,
      status: "uploading",
      dataUrl: input.dataUrl,
    };
    const otherCaptures = draft.captures.filter((capture) => capture.id !== id);
    publish({
      ...draft,
      captures: [...otherCaptures, pending],
      updatedAt: now().toISOString(),
      saveState: "local",
      error: null,
    });

    try {
      const receipt = await adapter.uploadCapture({
        scope,
        fileName,
        contentType: parsed.contentType,
        body: parsed.body,
      });
      const { url, ...assetReceipt } = receipt;
      const ready: DirectorDeskCapture = {
        id,
        fileName,
        contentType: parsed.contentType,
        status: "ready",
        url,
        assetReceipt,
      };
      const completed = publish({
        ...draft,
        captures: draft.captures.map((capture) => (capture.id === id ? ready : capture)),
        updatedAt: now().toISOString(),
        saveState: "local",
        error: null,
      });
      await persist(completed);
      return ready;
    } catch (error) {
      if (draft.captures.some((capture) => capture.id === id && capture.status === "uploading")) {
        publish({
          ...draft,
          captures: draft.captures.map((capture) => (capture.id === id ? { ...pending, status: "error", error: errorMessage(error) } : capture)),
          saveState: "error",
          error: errorMessage(error),
        });
      }
      throw error;
    }
  }

  return {
    read: () => draft,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    updateProject,
    loadProject,
    resolveConflict,
    saveProject(projectJson) {
      const current = projectJson ? updateProject(projectJson) : draft;
      return persist(current);
    },
    uploadCapture: (input) => upload(input),
    retryCapture(captureId) {
      const capture = draft.captures.find((item) => item.id === captureId);
      if (!capture?.dataUrl) return Promise.reject(new Error("没有可重试的本地截图"));
      return upload({ dataUrl: capture.dataUrl, fileName: capture.fileName }, capture.id);
    },
  };
}
