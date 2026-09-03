import { afterEach, describe, expect, it } from "vitest";

import {
  createProductionGraphFeatureFlag,
  getProductionGraphFeatureFlag,
  setProductionGraphEnabled,
} from "./feature-flag";

afterEach(() => {
  setProductionGraphEnabled(true);
});

describe("ProductionGraphFeatureFlag", () => {
  it("defaults to enabled when no env or storage hint exists", () => {
    const flag = createProductionGraphFeatureFlag({}, { localStorage: memoryStorage() });
    expect(flag.isEnabled()).toBe(true);
  });

  it("respects the env flag when storage is silent", () => {
    const flag = createProductionGraphFeatureFlag({ VITE_PRODUCTION_GRAPH_V1_ENABLED: "false" }, { localStorage: memoryStorage() });
    expect(flag.isEnabled()).toBe(false);

    const truthy = createProductionGraphFeatureFlag({ VITE_PRODUCTION_GRAPH_V1_ENABLED: "1" }, { localStorage: memoryStorage() });
    expect(truthy.isEnabled()).toBe(true);
  });

  it("prefers the persisted storage value over the env value", () => {
    const storage = memoryStorage();
    storage.setItem("hodor.productionGraph.v1.enabled", "false");
    const flag = createProductionGraphFeatureFlag({ VITE_PRODUCTION_GRAPH_V1_ENABLED: "true" }, { localStorage: storage });
    expect(flag.isEnabled()).toBe(false);
  });

  it("toggles at runtime and notifies subscribers", () => {
    const storage = memoryStorage();
    const flag = createProductionGraphFeatureFlag({}, { localStorage: storage });
    const calls: boolean[] = [];
    const unsubscribe = flag.subscribe(() => calls.push(flag.isEnabled()));

    flag.setEnabled(false);
    flag.setEnabled(true);

    expect(calls).toEqual([false, true]);
    expect(storage.getItem("hodor.productionGraph.v1.enabled")).toBe("true");
    unsubscribe();
    flag.setEnabled(false);
    expect(calls).toEqual([false, true]);
  });

  it("singleton setter updates the shared flag", () => {
    setProductionGraphEnabled(false);
    expect(getProductionGraphFeatureFlag().isEnabled()).toBe(false);
  });
});

function memoryStorage(): { getItem(key: string): string | null; setItem(key: string, value: string): void } {
  const map = new Map<string, string>();
  return {
    getItem(key) {
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key, value) {
      map.set(key, value);
    },
  };
}
