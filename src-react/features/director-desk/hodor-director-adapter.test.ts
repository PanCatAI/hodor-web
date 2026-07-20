import { describe, expect, it, vi } from "vitest";

import { createHodorDirectorDeskAdapter } from "./hodor-director-adapter";

describe("createHodorDirectorDeskAdapter", () => {
  it("registers a director capture through the existing asset upload contract", async () => {
    const request = vi.fn().mockResolvedValue({});
    const adapter = createHodorDirectorDeskAdapter({ request });
    const body = new Blob(["capture"], { type: "image/png" });

    const receipt = await adapter.uploadCapture({
      scope: { projectId: 7, storyboardId: 9 },
      fileName: "shot-9.png",
      contentType: "image/png",
      body,
    });

    expect(request).toHaveBeenCalledWith("/assets/uploadClip", {
      method: "POST",
      body: expect.stringContaining('"projectId":7'),
    });
    expect(receipt.url).toMatch(/^data:image\/png;base64,/);
  });

  it("returns an explicit local draft receipt until the backend project contract exists", async () => {
    const adapter = createHodorDirectorDeskAdapter({ request: vi.fn() });
    await expect(
      adapter.saveProject({
        scope: { projectId: 7, storyboardId: 9 },
        projectJson: {},
        captures: [],
        updatedAt: "2026-07-20T00:00:00.000Z",
      }),
    ).resolves.toMatchObject({ revision: "local:7:9", persistence: "local-draft" });
  });
});
