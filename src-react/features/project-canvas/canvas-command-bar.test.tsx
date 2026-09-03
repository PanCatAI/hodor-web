import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import type { ProductionGraphSnapshot } from "@react/features/production-graph";
import { buildDualProjectFixture } from "@react/features/production-graph/production-graph-fixture";
import { CanvasCommandBar, parseCanvasCommandInstruction, randomCommandIdempotencyKey } from "./canvas-command-bar";
import { summarizeCanvasStageStatus } from "./project-canvas";

describe("parseCanvasCommandInstruction", () => {
  it("maps Chinese and English action keywords to the six unified actions", () => {
    expect(parseCanvasCommandInstruction("刷新一下生产图")).toEqual({ action: "readGraph", agent: false });
    expect(parseCanvasCommandInstruction("readGraph")).toEqual({ action: "readGraph", agent: false });
    expect(parseCanvasCommandInstruction("启动当前节点")).toEqual({ action: "startReady", agent: false });
    expect(parseCanvasCommandInstruction("开始")).toEqual({ action: "startReady", agent: false });
    expect(parseCanvasCommandInstruction("暂停这个工作节点")).toEqual({ action: "pause", agent: false });
    expect(parseCanvasCommandInstruction("恢复运行")).toEqual({ action: "resumeOrRetry", agent: false });
    expect(parseCanvasCommandInstruction("重试失败节点")).toEqual({ action: "resumeOrRetry", agent: false });
    expect(parseCanvasCommandInstruction("采用候选结果")).toEqual({ action: "adoptCandidate", agent: false });
  });

  it("keeps free-text instructions for the agent channel", () => {
    expect(parseCanvasCommandInstruction("为当前镜头写一段分镜描述")).toEqual({ action: null, agent: true });
    expect(parseCanvasCommandInstruction("   ")).toEqual({ action: null, agent: true });
    expect(parseCanvasCommandInstruction("")).toEqual({ action: null, agent: true });
  });

  it("produces unique idempotency keys with a stable prefix", () => {
    const first = randomCommandIdempotencyKey();
    const second = randomCommandIdempotencyKey();
    expect(first).toMatch(/^command-/);
    expect(first).not.toBe(second);
  });
});

describe("CanvasCommandBar", () => {
  it("labels the stage and current scope in natural Chinese without a selected node", () => {
    render(
      <CanvasCommandBar
        projectId={7}
        projectType="novel"
        stage={null}
        stageLabel="画布总览"
        selectedNode={null}
        graphId={null}
        revision={null}
        checkpointId={null}
        status={null}
        onSubmit={() => {}}
      />,
    );
    expect(screen.getByLabelText("画布统一命令入口")).toBeInTheDocument();
    expect(screen.getByTestId("canvas-command-stage-chip")).toHaveTextContent("画布总览");
    const nodeChip = screen.getByTestId("canvas-command-node-chip");
    expect(nodeChip).toHaveTextContent("当前范围");
    expect(nodeChip).toHaveTextContent("整个项目流程");
    expect(nodeChip.textContent).not.toContain("未选中节点");
    expect(screen.getByRole("textbox", { name: "画布指令" })).toHaveAttribute("placeholder", expect.stringContaining("整个项目流程"));
  });

  it("shows the selected node as the command scope and keeps the input label clear", () => {
    render(
      <CanvasCommandBar
        projectId={7}
        projectType="interactive"
        stage="interactive"
        stageLabel="互动"
        selectedNode={{ id: "goal-p1", title: "P1 互动短剧生产目标" }}
        graphId="graph-p1"
        revision={1}
        checkpointId={null}
        status={null}
        onSubmit={() => {}}
      />,
    );
    expect(screen.getByTestId("canvas-command-stage-chip")).toHaveTextContent("互动");
    expect(screen.getByTestId("canvas-command-node-chip")).toHaveTextContent("当前节点");
    expect(screen.getByTestId("canvas-command-node-chip")).toHaveTextContent("P1 互动短剧生产目标");
    expect(screen.getByRole("button", { name: "聚焦选中节点" })).toBeEnabled();
    expect(screen.getByRole("textbox", { name: "画布指令" })).toHaveAttribute("placeholder", expect.stringContaining("启动"));
  });
});

describe("summarizeCanvasStageStatus", () => {
  it("aggregates running, pending, failed, and waiting counts from the graph", () => {
    const fixture = buildDualProjectFixture();
    expect(summarizeCanvasStageStatus(fixture.snapshots.p1Initial)).toEqual({ running: 0, pending: 3, failed: 1, waiting: 1 });
    expect(summarizeCanvasStageStatus(fixture.snapshots.p1Concurrent)).toEqual({ running: 2, pending: 1, failed: 1, waiting: 1 });
    expect(summarizeCanvasStageStatus(null)).toEqual({ running: 0, pending: 0, failed: 0, waiting: 0 });
  });

  it("counts succeeded and cancelled nodes in neither the running nor pending buckets", () => {
    const base = buildDualProjectFixture().snapshots.p1Initial;
    const snapshot: ProductionGraphSnapshot = {
      ...base,
      nodes: base.nodes.map((node) => ({ ...node, status: "succeeded" })),
    };
    expect(summarizeCanvasStageStatus(snapshot)).toEqual({ running: 0, pending: 0, failed: 0, waiting: 0 });
  });
});
