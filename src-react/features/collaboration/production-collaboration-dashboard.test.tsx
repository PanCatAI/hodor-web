import { render, screen } from "@testing-library/react";

import { COLLABORATION_SCENE, ProductionCollaborationDashboard } from "./index";

describe("ProductionCollaborationDashboard", () => {
  it("renders the deterministic single-scene collaboration evidence view", () => {
    render(<ProductionCollaborationDashboard />);

    expect(screen.getByTestId("production-collaboration-dashboard")).toBeInTheDocument();
    expect(screen.getByText(COLLABORATION_SCENE.filmId)).toBeInTheDocument();
    expect(screen.getAllByText(COLLABORATION_SCENE.sceneId).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId("role-card-shot-planner")).toHaveTextContent("shot-planner.v2");
    expect(screen.getByTestId("role-card-continuity-supervisor")).toHaveTextContent("continuity-supervisor.v3");
    expect(screen.getByTestId("responsibility-graph")).toHaveTextContent("EV-GRAPH-004");
    expect(screen.getByTestId("spatial-shot-003")).toHaveTextContent("启用 Blender 白模");
    expect(screen.getByTestId("spatial-shot-001")).toHaveTextContent("有理由跳过");
    expect(screen.getByText("仅写入 shot-003；shot-001 / 002 / 004 的 adopted 版本保持不变。")).toBeInTheDocument();
    expect(screen.getByText("adopt-continuity")).toBeInTheDocument();
    expect(screen.getByText("READY，理由写在这里")).toBeInTheDocument();
  });

  it("keeps the evidence contract stable and zero-cost", () => {
    expect(COLLABORATION_SCENE.roles).toHaveLength(2);
    expect(COLLABORATION_SCENE.roles.map((role) => role.memoryNamespace)).toEqual([
      "private://film-zero-cost-001/shot-planner",
      "private://film-zero-cost-001/continuity-supervisor",
    ]);
    expect(COLLABORATION_SCENE.spatialDecisions.map((decision) => decision.action)).toEqual(["invoke", "skip"]);
    expect(COLLABORATION_SCENE.arbitration.evidence).toEqual(["EV-SPACE-003", "EV-PATCH-003", "EV-CONTEXT-002"]);
    expect(COLLABORATION_SCENE.timeline.at(-1)?.evidence).toBe("EV-CONTEXT-002");
  });
});
