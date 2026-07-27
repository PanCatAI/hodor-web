import { describe, expect, it } from "vitest";

import type { DerivedAsset, ProductionAsset, ProductionFlowData, StoryboardItem } from "./types";
import {
  mergePolledDerivedAssets,
  mergePolledStoryboards,
  mergeProductionFlowSnapshot,
  productionNodeFlowChanged,
} from "./production-poll-reconciliation";

function storyboard(overrides: Partial<StoryboardItem> = {}): StoryboardItem {
  return {
    id: 31,
    index: 0,
    prompt: "医院远景",
    videoDesc: "缓慢推进",
    src: "",
    state: "running",
    errorReason: "",
    ...overrides,
  };
}

function flow(overrides: Partial<ProductionFlowData> = {}): ProductionFlowData {
  return {
    source: { chapters: [], state: "completed" },
    script: "雨夜，角色推门。",
    scriptPlan: "先远后近",
    storyboardTable: "| 镜头 | 景别 |",
    assets: [],
    worldAssets: [],
    storyboard: [storyboard()],
    videoTracks: [],
    timeline: { id: null, revision: 0, status: "idle", clips: [], errorReason: "", updatedAt: null },
    finalOutputs: [],
    ...overrides,
  };
}

describe("production polling reconciliation", () => {
  it("keeps the current storyboard array and item identities when polling returns no changes", () => {
    const current = [storyboard()];
    const merged = mergePolledStoryboards(current, [{ ...current[0] }]);

    expect(merged).toBe(current);
    expect(merged[0]).toBe(current[0]);
  });

  it("keeps unrelated asset cards stable while applying one derived-asset update", () => {
    const first: DerivedAsset = {
      id: 41,
      assetsId: 3,
      name: "雨衣造型",
      type: "role",
      prompt: "黄色雨衣",
      desc: "雨夜服装",
      src: "",
      state: "running",
      errorReason: "",
    };
    const second: ProductionAsset = {
      id: 4,
      name: "医院",
      type: "scene",
      prompt: "夜间医院",
      desc: "走廊",
      src: "",
      state: "completed",
      errorReason: "",
      derive: [],
    };
    const current: ProductionAsset[] = [
      {
        id: 3,
        name: "黛利拉",
        type: "role",
        prompt: "",
        desc: "女主角",
        src: "",
        state: "completed",
        errorReason: "",
        derive: [first],
      },
      second,
    ];

    const merged = mergePolledDerivedAssets(current, [{ ...first, state: "completed", src: "https://example.test/41.jpg" }]);

    expect(merged).not.toBe(current);
    expect(merged[0]).not.toBe(current[0]);
    expect(merged[0].derive[0]).not.toBe(first);
    expect(merged[1]).toBe(second);
  });

  it("marks only storyboard-dependent canvas nodes when one storyboard changes", () => {
    const current = flow();
    const next = {
      ...current,
      storyboard: [storyboard({ state: "completed", src: "https://example.test/31.jpg" })],
    };

    expect(productionNodeFlowChanged("source", current, next)).toBe(false);
    expect(productionNodeFlowChanged("script", current, next)).toBe(false);
    expect(productionNodeFlowChanged("assets", current, next)).toBe(false);
    expect(productionNodeFlowChanged("storyboard", current, next)).toBe(true);
    expect(productionNodeFlowChanged("worldAssets", current, next)).toBe(true);
    expect(productionNodeFlowChanged("videoTracks", current, next)).toBe(false);
  });

  it("keeps unchanged component data stable when a full agent snapshot arrives", () => {
    const current = flow();
    const incoming = flow({ scriptPlan: "改写后的导演计划" });
    const merged = mergeProductionFlowSnapshot(current, incoming);

    expect(merged).not.toBe(current);
    expect(merged.scriptPlan).toBe("改写后的导演计划");
    expect(merged.source).toBe(current.source);
    expect(merged.assets).toBe(current.assets);
    expect(merged.storyboard).toBe(current.storyboard);
    expect(merged.videoTracks).toBe(current.videoTracks);
    expect(merged.timeline).toBe(current.timeline);
    expect(merged.finalOutputs).toBe(current.finalOutputs);
  });
});
