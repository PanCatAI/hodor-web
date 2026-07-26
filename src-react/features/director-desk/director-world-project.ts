import type { DirectorDeskProjectJson, DirectorWorldJob } from "./director-desk-contract";

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}

export function readDirectorWorldJob(projectJson: DirectorDeskProjectJson): DirectorWorldJob | null {
  const value = projectJson.sceneWorldJob;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const job = value as Partial<DirectorWorldJob>;
  return typeof job.jobId === "string" &&
    typeof job.status === "string" &&
    typeof job.prompt === "string"
    ? job as DirectorWorldJob
    : null;
}

export function applyDirectorWorldJob(
  projectJson: DirectorDeskProjectJson,
  job: DirectorWorldJob,
): DirectorDeskProjectJson {
  const sceneAsset = job.sceneAsset;
  if (job.status !== "succeeded" || !sceneAsset?.worldId || !sceneAsset.panoramaUrl) {
    return { ...projectJson, sceneWorldJob: job };
  }
  const panoramaAssetId = `marble-panorama-${sceneAsset.worldId}`;
  const assets = records(projectJson.assets).filter((asset) => {
    const id = typeof asset.id === "string" ? asset.id : "";
    return !id.startsWith("marble-panorama-");
  });
  assets.push({
    id: panoramaAssetId,
    kind: "panorama",
    sourceType: "image",
    fileName: `${sceneAsset.worldId}-panorama.jpg`,
    name: sceneAsset.displayName || sceneAsset.caption || "Marble 场景",
    url: sceneAsset.panoramaUrl,
    assetSource: "library",
    projectionMode: "equirectangular",
  });
  return {
    ...projectJson,
    assets,
    panoramaAssetId,
    sceneWorldJob: job,
    sceneWorld: {
      provider: sceneAsset.provider,
      jobId: job.jobId,
      model: job.model,
      prompt: job.prompt,
      worldId: sceneAsset.worldId,
      worldMarbleUrl: sceneAsset.worldMarbleUrl,
      panoramaUrl: sceneAsset.panoramaUrl,
      colliderMeshUrl: sceneAsset.colliderMeshUrl,
      spzUrls: sceneAsset.spzUrls,
      thumbnailUrl: sceneAsset.thumbnailUrl,
      caption: sceneAsset.caption,
      semantics: sceneAsset.semantics,
    },
  };
}
