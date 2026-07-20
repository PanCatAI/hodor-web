import { describe, expect, it, vi } from "vitest";

import { createHodorDirectorDeskAdapter } from "./hodor-director-adapter";

describe("createHodorDirectorDeskAdapter", () => {
  it("loads and saves a storyboard-scoped cloud project through injectable endpoints", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        projectJson: { cameras: [{ id: "camera-9" }] },
        captures: [],
        revision: "revision-9",
        updatedAt: "2026-07-20T09:00:00.000Z",
      })
      .mockResolvedValueOnce({ revision: "revision-10", savedAt: "2026-07-20T10:00:00.000Z" });
    const adapter = createHodorDirectorDeskAdapter(
      { request },
      { loadProject: "/custom/load", saveProject: "/custom/save", uploadCapture: "/custom/upload" },
    );

    await expect(adapter.loadProject({ projectId: 7, storyboardId: 9 })).resolves.toMatchObject({
      projectJson: { cameras: [{ id: "camera-9" }] },
      revision: "revision-9",
    });
    await expect(
      adapter.saveProject({
        scope: { projectId: 7, storyboardId: 9 },
        projectJson: { cameras: [{ id: "camera-10" }] },
        captures: [],
        updatedAt: "2026-07-20T10:00:00.000Z",
      }),
    ).resolves.toMatchObject({ revision: "revision-10" });

    expect(request).toHaveBeenNthCalledWith(1, "/custom/load", {
      method: "POST",
      body: JSON.stringify({ projectId: 7, storyboardId: 9 }),
    });
    expect(request).toHaveBeenNthCalledWith(2, "/custom/save", {
      method: "POST",
      body: expect.stringContaining('"projectId":7'),
    });
  });

  it("preserves non-numeric scope IDs instead of serializing them as null", async () => {
    const request = vi.fn().mockResolvedValue(null);
    const adapter = createHodorDirectorDeskAdapter({ request });

    await adapter.loadProject({ projectId: "project-cloud", storyboardId: "storyboard-cloud" });

    expect(request).toHaveBeenCalledWith("/directorDesk/getProject", {
      method: "POST",
      body: JSON.stringify({ projectId: "project-cloud", storyboardId: "storyboard-cloud" }),
    });
  });

  it("uploads a capture and returns only the stable cloud URL and receipt", async () => {
    const request = vi.fn().mockResolvedValue({
      assetId: 101,
      imageId: 202,
      filePath: "director/shot-9.png",
      url: "https://assets.pancat.ai/director/shot-9.png",
      requestId: "request-1",
      providerPayload: { temporarySignedUrl: "should-not-persist" },
    });
    const adapter = createHodorDirectorDeskAdapter({ request });
    const body = new Blob(["capture"], { type: "image/png" });

    const receipt = await adapter.uploadCapture({
      scope: { projectId: 7, storyboardId: 9 },
      fileName: "shot-9.png",
      contentType: "image/png",
      body,
    });

    expect(request).toHaveBeenCalledWith("/directorDesk/uploadCapture", {
      method: "POST",
      body: expect.stringContaining('"projectId":7'),
    });
    expect(receipt).toEqual({
      assetId: 101,
      imageId: 202,
      filePath: "director/shot-9.png",
      url: "https://assets.pancat.ai/director/shot-9.png",
      requestId: "request-1",
    });
  });

  it("never sends retry Base64 data or failed captures in the cloud project payload", async () => {
    const request = vi.fn().mockResolvedValue({ revision: "revision-clean" });
    const adapter = createHodorDirectorDeskAdapter({ request });

    await adapter.saveProject({
      scope: { projectId: 7, storyboardId: 9 },
      projectJson: {},
      captures: [
        {
          id: "ready",
          fileName: "ready.png",
          contentType: "image/png",
          status: "ready",
          url: "https://assets.pancat.ai/ready.png",
          assetReceipt: { assetId: "asset-ready", requestId: "request-ready" },
        },
        {
          id: "failed",
          fileName: "failed.png",
          contentType: "image/png",
          status: "error",
          dataUrl: "data:image/png;base64,ZmFpbGVk",
          error: "上传失败",
        },
      ],
      updatedAt: "2026-07-20T10:00:00.000Z",
    });

    const payload = JSON.parse(String(request.mock.calls[0]?.[1]?.body));
    expect(payload.captures).toEqual([expect.objectContaining({ id: "ready", url: "https://assets.pancat.ai/ready.png" })]);
    expect(JSON.stringify(payload)).not.toContain("base64");
    expect(JSON.stringify(payload)).not.toContain("failed.png");
  });

  it("rejects upload responses without a stable URL", async () => {
    const adapter = createHodorDirectorDeskAdapter({
      request: vi.fn().mockResolvedValue({ assetId: "asset-processing", requestId: "request-2" }),
    });

    await expect(
      adapter.uploadCapture({
        scope: { projectId: 7, storyboardId: 9 },
        fileName: "shot-9.png",
        contentType: "image/png",
        body: new Blob(["capture"], { type: "image/png" }),
      }),
    ).rejects.toThrow("没有返回可用 URL");
  });
});
