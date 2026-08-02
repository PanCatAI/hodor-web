import type { ProductionApi, StartMarbleWorldInput } from "./production-api";
import { spatialProductionStageLabels, type SpatialProductionStageId } from "./spatial-production-stages";
import type {
  CinematicCoverageAggregate,
  ProductionAsset,
  ProductionFlowData,
  ProductionGenerationData,
} from "./types";

export const canvasSpatialRetryStages = [
  "sceneMaster",
  "marbleWorld",
  "spatialRegistration",
  "blocking",
  "coverage",
  "previs",
  "previsValidation",
] as const satisfies readonly SpatialProductionStageId[];

export type CanvasSpatialRetryStage = (typeof canvasSpatialRetryStages)[number];

export interface SpatialProductionRetryResult {
  action: "retried" | "refreshed";
  flow: ProductionFlowData;
  generation?: ProductionGenerationData;
  coverages: CinematicCoverageAggregate[];
}

export function isCanvasSpatialRetryStage(stage: string): stage is CanvasSpatialRetryStage {
  return (canvasSpatialRetryStages as readonly string[]).includes(stage);
}

export function spatialStageActionLabel(stage: CanvasSpatialRetryStage, label: string): string {
  return `启动或恢复${label}`;
}

export function spatialPipelineObjective(stage: CanvasSpatialRetryStage): string {
  const label = spatialProductionStageLabels[stage];
  return `启动或恢复当前剧本的空间生产流水线，复用已完成阶段，并继续推进${label}及后续空间生产。`;
}

function sceneMasterImage(asset: ProductionAsset): string {
  if (asset.src.trim()) return asset.src.trim();
  return asset.derive.find((item) => item.type === "scene" && item.state === "completed" && item.src.trim())?.src.trim()
    ?? asset.derive.find((item) => item.type === "scene" && item.src.trim())?.src.trim()
    ?? "";
}

function selectableSceneMasters(flow: ProductionFlowData): ProductionAsset[] {
  return flow.assets.filter((asset) => asset.type === "scene" && Boolean(sceneMasterImage(asset)));
}

function storyboardIdForScene(flow: ProductionFlowData, sourceSceneAssetId: number, preferredStoryboardId?: number): number | null {
  if (preferredStoryboardId && flow.storyboard.some((item) => item.id === preferredStoryboardId)) return preferredStoryboardId;
  return flow.storyboard.find((item) => item.associateAssetsIds?.includes(sourceSceneAssetId))?.id
    ?? flow.storyboard[0]?.id
    ?? preferredStoryboardId
    ?? null;
}

export function selectMarbleWorldRefreshes(flow: ProductionFlowData): Array<{ storyboardId: number; jobId: string }> {
  return (flow.worldAssets ?? [])
    .filter((world) => (world.status === "submitting" || world.status === "running") && Boolean(world.worldJobId))
    .map((world) => ({ storyboardId: world.storyboardId, jobId: world.worldJobId }));
}

export function selectMarbleWorldStarts({
  projectId,
  scriptId,
  flow,
}: {
  projectId: number;
  scriptId: number;
  flow: ProductionFlowData;
}): StartMarbleWorldInput[] {
  const worlds = flow.worldAssets ?? [];
  return selectableSceneMasters(flow).flatMap((asset) => {
    const matchingWorlds = worlds.filter((world) => world.sourceSceneAssetId === asset.id);
    if (matchingWorlds.some((world) => world.status === "submitting" || world.status === "running" || world.status === "succeeded")) return [];
    const failedWorld = matchingWorlds[matchingWorlds.length - 1];
    const storyboardId = storyboardIdForScene(flow, asset.id, failedWorld?.storyboardId);
    if (!storyboardId) return [];
    const retryKey = failedWorld?.worldJobId || "start";
    return [{
      projectId,
      storyboardId,
      sourceSceneAssetId: asset.id,
      requestId: `production-world:${projectId}:${scriptId}:${storyboardId}:${asset.id}:${retryKey}`,
      prompt: asset.prompt.trim() || asset.desc.trim() || asset.name.trim() || `场景资产 ${asset.id}`,
      displayName: asset.name.trim() || `场景资产 ${asset.id}`,
      model: failedWorld?.model || "marble-1.1",
      sourceIsPanorama: false,
    }];
  });
}

async function refreshScriptSnapshot(
  api: ProductionApi,
  projectId: number,
  scriptId: number,
): Promise<Omit<SpatialProductionRetryResult, "action">> {
  const [flow, generation, coverages] = await Promise.all([
    api.getFlowData(projectId, scriptId),
    typeof api.getGenerationData === "function" ? api.getGenerationData(projectId, scriptId) : Promise.resolve(undefined),
    typeof api.listCoverage === "function" ? api.listCoverage(projectId, scriptId) : Promise.resolve([]),
  ]);
  return { flow, generation, coverages };
}

export async function retrySpatialProductionStage({
  api,
  projectId,
  scriptId,
  stage,
  flow,
}: {
  api: ProductionApi;
  projectId: number;
  scriptId: number;
  stage: CanvasSpatialRetryStage;
  flow: ProductionFlowData;
  coverages: CinematicCoverageAggregate[];
}): Promise<SpatialProductionRetryResult> {
  let retried = false;

  if (stage === "marbleWorld") {
    const refreshes = typeof api.refreshMarbleWorld === "function" ? selectMarbleWorldRefreshes(flow) : [];
    const starts = typeof api.startMarbleWorld === "function" ? selectMarbleWorldStarts({ projectId, scriptId, flow }) : [];
    if (refreshes.length) {
      await Promise.all(refreshes.map((input) => api.refreshMarbleWorld(projectId, input.storyboardId, input.jobId)));
      retried = true;
    }
    if (starts.length) {
      await Promise.all(starts.map((input) => api.startMarbleWorld(input)));
      retried = true;
    }
  }

  if (
    stage === "spatialRegistration"
    && typeof api.getWorldRegistration === "function"
  ) {
    const worlds = (flow.worldAssets ?? []).filter((world) => world.status === "succeeded" && Boolean(world.providerWorldId));
    await Promise.all(worlds.map((world) => api.getWorldRegistration(projectId, scriptId, world.id)));
  }

  if (typeof api.startSpatialPipeline === "function") {
    await api.startSpatialPipeline(scriptId, spatialPipelineObjective(stage));
    retried = true;
  }

  return { ...(await refreshScriptSnapshot(api, projectId, scriptId)), action: retried ? "retried" : "refreshed" };
}
