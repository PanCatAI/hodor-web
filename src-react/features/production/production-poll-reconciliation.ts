import type { DerivedAsset, ProductionAsset, ProductionFlowData, StoryboardItem } from "./types";
import type { ProductionFlowNodeId } from "./production-flow-layout";

function sameJsonValue(left: unknown, right: unknown) {
  if (Object.is(left, right)) return true;
  return JSON.stringify(left) === JSON.stringify(right);
}

function sameNumberList(left?: number[], right?: number[]) {
  if (left === right) return true;
  if (!left || !right || left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function sameStoryboard(left: StoryboardItem, right: StoryboardItem) {
  return (
    left.id === right.id &&
    left.index === right.index &&
    left.prompt === right.prompt &&
    left.videoDesc === right.videoDesc &&
    left.src === right.src &&
    left.state === right.state &&
    left.errorReason === right.errorReason &&
    left.duration === right.duration &&
    sameNumberList(left.associateAssetsIds, right.associateAssetsIds) &&
    left.shouldGenerateImage === right.shouldGenerateImage &&
    left.flowId === right.flowId &&
    left.trackId === right.trackId
  );
}

function sameDerivedAsset(left: DerivedAsset, right: DerivedAsset) {
  return (
    left.id === right.id &&
    left.assetsId === right.assetsId &&
    left.name === right.name &&
    left.type === right.type &&
    left.prompt === right.prompt &&
    left.desc === right.desc &&
    left.src === right.src &&
    left.state === right.state &&
    left.errorReason === right.errorReason &&
    left.flowId === right.flowId
  );
}

export function mergePolledStoryboards(current: StoryboardItem[], updates: StoryboardItem[]): StoryboardItem[] {
  if (!updates.length) return current;
  const updateById = new Map(updates.map((item) => [item.id, item]));
  let changed = false;
  const merged = current.map((item) => {
    const update = updateById.get(item.id);
    if (!update) return item;
    const next: StoryboardItem = {
      ...item,
      ...update,
      index: update.index ?? item.index,
      prompt: update.prompt || item.prompt,
      videoDesc: update.videoDesc || item.videoDesc,
      src: update.src || item.src,
    };
    if (sameStoryboard(item, next)) return item;
    changed = true;
    return next;
  });
  return changed ? merged : current;
}

export function mergePolledDerivedAssets(current: ProductionAsset[], updates: DerivedAsset[]): ProductionAsset[] {
  if (!updates.length) return current;
  const updateById = new Map(updates.map((item) => [item.id, item]));
  let assetsChanged = false;
  const merged = current.map((asset) => {
    let derivedChanged = false;
    const derive = asset.derive.map((item) => {
      const update = updateById.get(item.id);
      if (!update) return item;
      const next: DerivedAsset = { ...item, ...update, src: update.src || item.src };
      if (sameDerivedAsset(item, next)) return item;
      derivedChanged = true;
      return next;
    });
    if (!derivedChanged) return asset;
    assetsChanged = true;
    return { ...asset, derive };
  });
  return assetsChanged ? merged : current;
}

export function mergeProductionFlowSnapshot(
  current: ProductionFlowData,
  incoming: ProductionFlowData,
): ProductionFlowData {
  const currentKeys = Object.keys(current);
  const incomingKeys = Object.keys(incoming);
  let changed = currentKeys.length !== incomingKeys.length;
  const merged = { ...incoming };
  for (const key of incomingKeys) {
    if (Object.prototype.hasOwnProperty.call(current, key) && sameJsonValue(current[key], incoming[key])) {
      merged[key] = current[key];
    } else {
      changed = true;
    }
  }
  return changed ? merged : current;
}

export function productionNodeFlowChanged(
  id: ProductionFlowNodeId,
  current: ProductionFlowData,
  next: ProductionFlowData,
): boolean {
  if (current === next) return false;
  if (id === "source") return current.source !== next.source;
  if (id === "script") return current.script !== next.script;
  if (id === "scriptPlan") return current.scriptPlan !== next.scriptPlan;
  if (id === "assets") return current.assets !== next.assets;
  if (id === "worldAssets") {
    return current.worldAssets !== next.worldAssets || current.assets !== next.assets || current.storyboard !== next.storyboard;
  }
  if (id === "storyboardTable") return current.storyboardTable !== next.storyboardTable;
  if (id === "storyboard") return current.storyboard !== next.storyboard;
  if (id === "previs") {
    return current.previsRenders !== next.previsRenders || current.storyboard !== next.storyboard;
  }
  return (
    current.videoTracks !== next.videoTracks ||
    current.timeline !== next.timeline ||
    current.finalOutputs !== next.finalOutputs ||
    current.workbench !== next.workbench
  );
}
