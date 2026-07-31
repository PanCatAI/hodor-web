import { describe, expect, it } from "vitest";

import type { CinematicCoverageAggregate, ProductionFlowData } from "@react/features/production";
import { describeInteractiveProductionStage } from "./interactive-production-stage-node";
import type { InteractiveProductionStageNodeData } from "./interactive-production-stage-node";

const emptyFlow: ProductionFlowData = {
  script: "INT. ROOM",
  scriptPlan: "",
  assets: [],
  storyboardTable: "",
  storyboard: [],
};

describe("interactive production stage node", () => {
  it("keeps Blender previs running while any camera is still queued", () => {
    const coverage = {
      status: "running",
      plan: { cameras: [] },
      bundle: {
        cameras: [
          { cameraId: "cam-master", status: "previs-ready" },
          { cameraId: "cam-close", status: "queued" },
        ],
      },
    } as unknown as CinematicCoverageAggregate;

    expect(
      describeInteractiveProductionStage({
        storyNodeId: "scene-1",
        storyTitle: "锁住的房间",
        stage: "previs",
        flow: emptyFlow,
        coverages: [coverage],
        onOpenStage: () => undefined,
      } satisfies InteractiveProductionStageNodeData),
    ).toEqual({
      state: "running",
      summary: "1/2 个 Blender 机位预演可用",
    });
  });

  it("keeps a polling failure on the matching coverage node", () => {
    const coverage = {
      coverageId: "coverage-12",
      version: 2,
      updatedAt: "2026-08-01T01:00:00.000Z",
      status: "running",
      plan: { presetId: "dialogue/two-person", cameras: [] },
      bundle: null,
      pollError: { message: "网关暂时不可用" },
    } as unknown as CinematicCoverageAggregate;

    expect(describeInteractiveProductionStage({
      storyNodeId: "scene-1", storyTitle: "锁住的房间", stage: "coverage", flow: emptyFlow,
      coverages: [coverage], onOpenStage: () => undefined,
    })).toEqual({ state: "running", summary: "状态刷新失败：网关暂时不可用" });
  });
});
