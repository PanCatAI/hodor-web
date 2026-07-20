import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createDirectorDeskDraftStore,
  createDirectorDeskSession,
  type DirectorDeskAdapter,
  type DirectorDeskScope,
} from "./director-desk-contract";

const scope: DirectorDeskScope = { projectId: "project-7", storyboardId: "storyboard-31" };

function createMemoryStorage(): Storage {
  const entries = new Map<string, string>();
  return {
    get length() {
      return entries.size;
    },
    clear: () => entries.clear(),
    getItem: (key) => entries.get(key) ?? null,
    key: (index) => [...entries.keys()][index] ?? null,
    removeItem: (key) => entries.delete(key),
    setItem: (key, value) => entries.set(key, value),
  };
}

function createAdapter(overrides: Partial<DirectorDeskAdapter> = {}): DirectorDeskAdapter {
  return {
    saveProject: vi.fn().mockResolvedValue({ revision: "revision-2", savedAt: "2026-07-20T10:00:00.000Z" }),
    uploadCapture: vi.fn().mockResolvedValue({
      url: "https://assets.pancat.ai/director/capture-1.png",
      assetId: "asset-88",
      requestId: "request-99",
    }),
    ...overrides,
  };
}

describe("director desk scoped draft", () => {
  it("isolates local project JSON by project and storyboard", () => {
    const storage = createMemoryStorage();
    const first = createDirectorDeskDraftStore(storage, scope);
    const second = createDirectorDeskDraftStore(storage, {
      projectId: "project-7",
      storyboardId: "storyboard-32",
    });

    first.write({
      version: 1,
      scope,
      projectJson: { cameras: [{ id: "camera-1" }] },
      captures: [],
      updatedAt: "2026-07-20T09:00:00.000Z",
      saveState: "local",
      error: null,
    });

    expect(first.read()?.projectJson).toEqual({ cameras: [{ id: "camera-1" }] });
    expect(second.read()).toBeNull();
  });

  it("ignores malformed or cross-scoped local data", () => {
    const storage = createMemoryStorage();
    const store = createDirectorDeskDraftStore(storage, scope);
    storage.setItem(store.key, JSON.stringify({ version: 1, scope: { projectId: "other", storyboardId: "other" } }));

    expect(store.read()).toBeNull();
  });
});

describe("director desk session", () => {
  let storage: Storage;

  beforeEach(() => {
    storage = createMemoryStorage();
  });

  it("writes the project locally before saving and keeps the error when remote save fails", async () => {
    const adapter = createAdapter({ saveProject: vi.fn().mockRejectedValue(new Error("数据库暂时不可用")) });
    const session = createDirectorDeskSession({
      scope,
      adapter,
      storage,
      now: () => new Date("2026-07-20T09:30:00.000Z"),
    });

    await expect(session.saveProject({ cameras: [{ id: "camera-2" }] })).rejects.toThrow("数据库暂时不可用");

    expect(session.read()).toMatchObject({
      projectJson: { cameras: [{ id: "camera-2" }] },
      saveState: "error",
      error: "数据库暂时不可用",
    });
  });

  it("uploads a screenshot then saves its URL and Pancat asset receipt", async () => {
    const adapter = createAdapter();
    const session = createDirectorDeskSession({ scope, adapter, storage });

    const capture = await session.uploadCapture({
      dataUrl: "data:image/png;base64,aG9kb3I=",
      fileName: "camera-1.png",
    });

    expect(adapter.uploadCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        scope,
        fileName: "camera-1.png",
        contentType: "image/png",
        body: expect.any(Blob),
      }),
    );
    expect(capture).toMatchObject({
      status: "ready",
      url: "https://assets.pancat.ai/director/capture-1.png",
      assetReceipt: { assetId: "asset-88", requestId: "request-99" },
    });
    expect(session.read()?.captures[0]).not.toHaveProperty("dataUrl");
    expect(adapter.saveProject).toHaveBeenCalledWith(
      expect.objectContaining({
        scope,
        captures: [expect.objectContaining({ url: "https://assets.pancat.ai/director/capture-1.png" })],
      }),
    );
  });

  it("keeps a retryable local screenshot and error when upload fails", async () => {
    const adapter = createAdapter({ uploadCapture: vi.fn().mockRejectedValue({ message: "上传超时", requestId: "request-failed" }) });
    const session = createDirectorDeskSession({ scope, adapter, storage });

    await expect(
      session.uploadCapture({ dataUrl: "data:image/png;base64,aG9kb3I=", fileName: "failed.png" }),
    ).rejects.toMatchObject({ message: "上传超时" });

    expect(session.read()?.captures[0]).toMatchObject({
      fileName: "failed.png",
      status: "error",
      dataUrl: "data:image/png;base64,aG9kb3I=",
      error: "上传超时",
    });
    expect(adapter.saveProject).not.toHaveBeenCalled();
  });
});
