import { describe, expect, it } from "vitest";

import {
  marbleWorldTransform,
  selectMarbleSplatUrl,
} from "../../../vendor/storyai-3d-director-desk/src/editor/canvas/MarbleWorldScene";

describe("MarbleWorldScene contract", () => {
  it("uses an editing-friendly SPZ and keeps the full-resolution fallback", () => {
    const urls = {
      "100k": "https://example.test/world-100k.spz",
      "500k": "https://example.test/world-500k.spz",
      full_res: "https://example.test/world-full.spz",
    };

    expect(selectMarbleSplatUrl(urls, "editing")).toBe(urls["500k"]);
    expect(selectMarbleSplatUrl(urls, "preview")).toBe(urls["100k"]);
    expect(selectMarbleSplatUrl({ full: urls.full_res }, "editing")).toBe(urls.full_res);
  });

  it("centralizes Marble metric scale, ground offset, and web coordinate correction", () => {
    expect(
      marbleWorldTransform({
        metricScaleFactor: 1.4,
        groundPlaneOffset: -0.25,
      }),
    ).toEqual({
      position: [0, 0.25, 0],
      rotation: [Math.PI, 0, 0],
      scale: [1.4, 1.4, 1.4],
    });
  });
});
