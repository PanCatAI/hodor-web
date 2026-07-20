import type { AssetRecord, ImageAssetUpdate, PromptAssetUpdate } from "./types";

export function collectGeneratingIds(items: AssetRecord[]): { imageIds: number[]; promptIds: number[] } {
  const imageIds: number[] = [];
  const promptIds: number[] = [];

  for (const item of items) {
    if (item.state === "生成中") imageIds.push(item.id);
    if (item.promptState === "生成中") promptIds.push(item.id);
    for (const child of item.sonAssets ?? []) {
      if (child.state === "生成中") imageIds.push(child.id);
      if (child.promptState === "生成中") promptIds.push(child.id);
    }
  }

  return { imageIds, promptIds };
}

type AssetUpdate = ImageAssetUpdate | PromptAssetUpdate;

function updateAsset(asset: AssetRecord, updates: Map<number, AssetUpdate>): AssetRecord {
  const update = updates.get(asset.id);
  const sonAssets = asset.sonAssets?.map((child) => updateAsset(child, updates));
  if (!update && sonAssets === asset.sonAssets) return asset;

  const next = { ...asset, ...update, sonAssets };
  if (update && "filePath" in update && !update.src && update.filePath && update.state !== "生成中") {
    next.src = update.filePath;
  }
  return next;
}

export function mergeAssetUpdates(items: AssetRecord[], updates: AssetUpdate[]): AssetRecord[] {
  if (!updates.length) return items;
  const byId = new Map(updates.map((update) => [update.id, update]));
  return items.map((item) => updateAsset(item, byId));
}
