import { describe, expect, it } from "vitest";

import { applyDirectorWorldJob } from "./director-world-project";

describe("applyDirectorWorldJob", () => {
  it("adds the Marble panorama and metadata while preserving existing director objects", () => {
    const result = applyDirectorWorldJob(
      {
        version: 1,
        assets: [{ id: "role-1", kind: "character", url: "https://assets.pancat.ai/role.jpg" }],
        objects: [{ id: "character-1", kind: "character" }],
        cameras: [{ id: "camera-1" }],
        panoramaAssetId: null,
      },
      {
        jobId: "world-job-1",
        projectId: 7,
        storyboardId: 9,
        provider: "worldlabs-marble",
        model: "marble-1.1",
        status: "succeeded",
        progress: 100,
        progressDescription: "completed",
        prompt: "Abandoned hospital",
        sceneAsset: {
          provider: "worldlabs-marble",
          worldId: "world-1",
          displayName: "Hospital",
          worldMarbleUrl: "https://marble.worldlabs.ai/world-1",
          panoramaUrl: "https://cdn.worldlabs.ai/pano.jpg",
          colliderMeshUrl: "https://cdn.worldlabs.ai/collider.glb",
          spzUrls: { full: "https://cdn.worldlabs.ai/full.spz" },
          thumbnailUrl: "https://cdn.worldlabs.ai/thumb.jpg",
          caption: "Hospital",
          semantics: { groundPlaneOffset: -0.1, metricScaleFactor: 1.4 },
        },
        error: null,
      },
    );

    expect(result.objects).toEqual([{ id: "character-1", kind: "character" }]);
    expect(result.cameras).toEqual([{ id: "camera-1" }]);
    expect(result.panoramaAssetId).toBe("marble-panorama-world-1");
    expect(result.assets).toEqual([
      { id: "role-1", kind: "character", url: "https://assets.pancat.ai/role.jpg" },
      expect.objectContaining({
        id: "marble-panorama-world-1",
        kind: "panorama",
        sourceType: "image",
        projectionMode: "equirectangular",
        url: "https://cdn.worldlabs.ai/pano.jpg",
      }),
    ]);
    expect(result.sceneWorld).toEqual(expect.objectContaining({
      jobId: "world-job-1",
      worldId: "world-1",
      colliderMeshUrl: "https://cdn.worldlabs.ai/collider.glb",
    }));
  });
});
