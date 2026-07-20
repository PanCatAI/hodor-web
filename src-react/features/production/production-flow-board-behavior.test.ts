import { afterEach, describe, expect, it, vi } from "vitest";

import { readCanvasWheelEvent, waitForStableNodeMeasurements } from "./production-flow-board";

describe("upstream production canvas behavior", () => {
  afterEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  it("reads the legacy canvas wheel setting and defaults to zoom", () => {
    expect(readCanvasWheelEvent(localStorage)).toBe("zoom");

    localStorage.setItem("setting", JSON.stringify({ canvasWheelEvent: "scroll" }));
    expect(readCanvasWheelEvent(localStorage)).toBe("scroll");

    localStorage.setItem("canvasWheelEvent", "zoom");
    expect(readCanvasWheelEvent(localStorage)).toBe("zoom");

    localStorage.setItem("canvasWheelEvent", "invalid");
    localStorage.setItem("setting", "not-json");
    expect(readCanvasWheelEvent(localStorage)).toBe("zoom");
  });

  it("forces a remeasurement before waiting for two stable dimension snapshots", async () => {
    vi.useFakeTimers();
    const forceMeasure = vi.fn();
    const snapshots = [
      [{ id: "script", measured: { width: 100, height: 50 } }],
      [{ id: "script", measured: { width: 120, height: 60 } }],
      [{ id: "script", measured: { width: 120, height: 60 } }],
      [{ id: "script", measured: { width: 120, height: 60 } }],
    ];
    const getNodes = vi.fn(() => snapshots.shift() ?? [{ id: "script", measured: { width: 120, height: 60 } }]);

    const waiting = waitForStableNodeMeasurements({
      nodeIds: ["script"],
      forceMeasure,
      getNodes,
      delayMs: 80,
    });

    expect(forceMeasure).toHaveBeenCalledOnce();
    expect(forceMeasure).toHaveBeenCalledWith(["script"]);
    await vi.runAllTimersAsync();
    const measured = await waiting;

    expect(measured[0]?.measured).toEqual({ width: 120, height: 60 });
    expect(getNodes).toHaveBeenCalledTimes(4);
  });
});
