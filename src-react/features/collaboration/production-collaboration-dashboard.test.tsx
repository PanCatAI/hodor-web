import { render, screen } from "@testing-library/react";

import { COLLABORATION_SCENE, ProductionCollaborationDashboard } from "./index";

describe("ProductionCollaborationDashboard", () => {
  it("renders the deterministic single-scene collaboration evidence view", () => {
    render(<ProductionCollaborationDashboard />);

    expect(screen.getByTestId("production-collaboration-dashboard")).toBeInTheDocument();
    expect(screen.getByText(COLLABORATION_SCENE.filmId)).toBeInTheDocument();
    expect(screen.getAllByText(COLLABORATION_SCENE.sceneId).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId("role-card-shot-planner")).toHaveTextContent("shot-planner.v1");
    expect(screen.getByTestId("role-card-continuity-supervisor")).toHaveTextContent("continuity-supervisor.v1");
    expect(COLLABORATION_SCENE.responsibilityGraphRevision).toBe(1);
    expect(screen.getByTestId("responsibility-graph")).toHaveTextContent(`责任图 revision ${COLLABORATION_SCENE.responsibilityGraphRevision}`);
    expect(screen.getByTestId("responsibility-graph")).not.toHaveTextContent("revision 04");
    expect(screen.getByTestId("responsibility-graph")).toHaveTextContent("evidence:arbitration:shot-003");
    expect(screen.getByText("图谱修订").parentElement).toHaveTextContent(String(COLLABORATION_SCENE.responsibilityGraphRevision));
    expect(screen.getByText("图谱修订").parentElement).toHaveTextContent(`责任图 revision ${COLLABORATION_SCENE.responsibilityGraphRevision}`);
    expect(screen.getByTestId("spatial-shot-003")).toHaveTextContent("启用 Blender 白模");
    expect(screen.getByTestId("spatial-shot-001")).toHaveTextContent("有理由跳过");
    expect(screen.getByText("仅写入 shot-003；shot-001 / 002 / 004 的 adopted 版本保持不变。")).toBeInTheDocument();
    expect(screen.getByText("invoke-blockout")).toBeInTheDocument();
    expect(screen.getByText("READY，理由写在这里")).toBeInTheDocument();
  });

  it("keeps the evidence contract stable and zero-cost", () => {
    expect(COLLABORATION_SCENE.roles).toHaveLength(2);
    expect(COLLABORATION_SCENE.roles.map((role) => role.memoryNamespace)).toEqual([
      "memory:film-zero-cost-001:shot-planner",
      "memory:film-zero-cost-001:continuity-supervisor",
    ]);
    expect(COLLABORATION_SCENE.spatialDecisions.map((decision) => decision.action)).toEqual(["invoke", "skip"]);
    expect(COLLABORATION_SCENE.arbitration.evidence).toEqual([
      "evidence:shot-003:spatial-risk",
      "evidence:continuity:shot-003",
    ]);
    expect(COLLABORATION_SCENE.timeline.at(-1)?.evidence).toBe("memory:film-zero-cost-001:shot-planner");
  });
});
