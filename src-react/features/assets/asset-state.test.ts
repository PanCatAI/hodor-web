import { describe, expect, it } from "vitest";

import { collectGeneratingIds, mergeAssetUpdates } from "./asset-state";
import type { AssetRecord } from "./types";

const child: AssetRecord = {
  id: 2,
  assetsId: 1,
  name: "黛利拉正面",
  type: "role",
  state: "生成中",
  promptState: "已完成",
  src: "",
};

const parent: AssetRecord = {
  id: 1,
  assetsId: null,
  name: "黛利拉",
  type: "role",
  state: "已完成",
  promptState: "生成中",
  src: "https://example.com/old.png",
  sonAssets: [child],
};

describe("asset generation state", () => {
  it("collects image and prompt jobs from parent and child assets", () => {
    expect(collectGeneratingIds([parent])).toEqual({ imageIds: [2], promptIds: [1] });
  });

  it("merges a completed child image without mutating the current list", () => {
    const next = mergeAssetUpdates([parent], [{ id: 2, state: "已完成", filePath: "https://example.com/new.png" }]);

    expect(next[0]).not.toBe(parent);
    expect(next[0].sonAssets?.[0]).toMatchObject({ state: "已完成", src: "https://example.com/new.png" });
    expect(child.state).toBe("生成中");
  });
});
