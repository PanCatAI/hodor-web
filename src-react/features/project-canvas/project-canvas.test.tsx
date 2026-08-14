import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { InteractiveStoryGraph } from "@react/features/interactive-story";
import { createProductionGraphActionDispatcher } from "@react/features/production-graph/production-graph-actions";
import type { ProductionActionAck } from "@react/features/production-graph/production-graph-actions";
import type { ProductionGraphActionName } from "@react/features/production-graph/types";
import { createProductionGraphContextBridge } from "@react/features/production-graph/production-graph-context";
import { buildDualProjectFixture } from "@react/features/production-graph/production-graph-fixture";
import { createProductionGraphStore } from "@react/features/production-graph/production-graph-store";
import type { UseProductionGraphWiring } from "@react/features/production-graph/production-graph-wiring";
import { ProjectCanvas, projectCanvasGoalIdempotencyKey } from "./project-canvas";

function createWiring(withSnapshot = false): { wiring: UseProductionGraphWiring; emitted: unknown[] } {
  const store = createProductionGraphStore();
  const emitted: unknown[] = [];
  if (withSnapshot) store.applySnapshot(buildDualProjectFixture().snapshots.p1Initial);
  const socket = {
    connected: true,
    emit(event: string, payload: unknown, ack?: (response: ProductionActionAck) => void) {
      emitted.push({ event, payload });
      if (event === "productionGraph:action") {
        const request = payload as { action: { action: string; idempotencyKey?: string } };
        const snapshot = withSnapshot
          ? { ...buildDualProjectFixture().snapshots.p1Initial, revision: 2 }
          : { ...buildDualProjectFixture().snapshots.p1Initial, graphId: "pending-project-7", projectId: 7 };
        ack?.({
          ok: true,
          result: { action: request.action.action as ProductionGraphActionName, snapshot, idempotencyKey: request.action.idempotencyKey, paidGenerationUsd: 0 },
        });
      }
    },
  };
  const dispatcher = createProductionGraphActionDispatcher({
    store,
    socket,
    buildContext: () => ({ actorRef: null, graphId: store.getSnapshot().graphId ?? "pending-project-7", selectedNodeId: null, checkpointId: null }),
  });
  return {
    emitted,
    wiring: {
      store,
      dispatcher,
      contextBridge: createProductionGraphContextBridge({ store }),
      featureEnabled: true,
    },
  };
}

function interactiveGraph(): InteractiveStoryGraph {
  return {
    id: "story-graph-8",
    projectId: 8,
    title: "互动剧情",
    entryNodeId: "scene-1",
    status: "ready",
    revision: 1,
    nodes: [{ id: "scene-1", graphId: "story-graph-8", scriptId: 19, kind: "scene", title: "雨夜开场", summary: "等待观众选择", position: { x: 120, y: 80 }, status: "ready", script: null, createdAt: 1, updatedAt: 2 }],
    edges: [],
    variables: [],
    createdAt: 1,
    updatedAt: 2,
  };
}

describe("ProjectCanvas", () => {
  const moduleRenderers = {
    story: () => <div><h3>原文管理</h3><button type="button">新增原文</button><h3>剧本管理</h3></div>,
    casting: () => <div><h3>塑角造景</h3><button type="button">批量生成图片</button></div>,
    assets: () => <div><h3>资产中心</h3><button type="button">新建角色</button></div>,
    storyboards: () => <div><h3>分镜管理</h3><button type="button">刷新状态</button></div>,
    production: () => <div><h3>生产工作台</h3><button type="button">视频生成</button></div>,
    interactive: () => <div><h3>互动剧情</h3><button type="button">刷新互动剧情</button></div>,
  };

  it("uses a stable goal idempotency key for the same unconfirmed submission", () => {
    expect(projectCanvasGoalIdempotencyKey(7, "做一支雨夜短片")).toBe(projectCanvasGoalIdempotencyKey(7, "做一支雨夜短片"));
    expect(projectCanvasGoalIdempotencyKey(7, "做一支雨夜短片")).not.toBe(projectCanvasGoalIdempotencyKey(8, "做一支雨夜短片"));
  });

  it("shows the goal prompt without a graph and creates a persistent graph through changeScope", async () => {
    const { wiring, emitted } = createWiring();
    render(<ProjectCanvas projectId={7} projectType="novel" apiBaseUrl="http://localhost:24680/api" getToken={() => null} wiring={wiring} />);

    expect(screen.getByRole("heading", { name: "先说说你想完成什么" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "生产目标" }), { target: { value: "做一支雨夜短片" } });
    fireEvent.click(screen.getByRole("button", { name: "创建生产目标" }));

    expect(await screen.findByTestId("project-canvas-infinite-canvas")).toBeInTheDocument();
    expect(emitted).toEqual(expect.arrayContaining([expect.objectContaining({ event: "productionGraph:action" })]));
    expect(emitted[0]).toEqual(expect.objectContaining({
      payload: expect.objectContaining({ action: expect.objectContaining({ action: "changeScope" }) }),
    }));
  });

  it.each(["novel", "interactive"] as const)("uses the same canvas shell for %s projects and keeps the graph running under module panels", async (projectType) => {
    const { wiring } = createWiring(true);
    render(<ProjectCanvas projectId={7} projectType={projectType} apiBaseUrl="http://localhost:24680/api" getToken={() => null} wiring={wiring} />);

    expect(await screen.findByTestId("project-canvas-infinite-canvas")).toBeInTheDocument();
    expect(screen.getByTestId("project-canvas-shell")).toHaveAttribute("data-project-type", projectType);
    expect(screen.queryByRole("complementary", { name: "节点检查器" })).not.toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "项目智能体" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开项目智能体" })).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("project-canvas-node-goal-p1"));
    expect(screen.getByRole("complementary", { name: "节点检查器" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "关闭节点检查器" }));
    expect(screen.queryByRole("complementary", { name: "节点检查器" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "打开原文/剧本模块" }));
    expect(screen.getByRole("dialog", { name: "原文/剧本模块" })).toBeInTheDocument();
    expect(screen.getByTestId("project-canvas-infinite-canvas")).toBeInTheDocument();
  });

  it("renders real business module controls on the same canvas and only exposes interactive for interactive projects", async () => {
    const { wiring } = createWiring(true);
    const { unmount } = render(<ProjectCanvas projectId={7} projectType="novel" apiBaseUrl="http://localhost:24680/api" getToken={() => null} moduleRenderers={moduleRenderers} wiring={wiring} />);

    for (const [label, content] of [["目标", "生产目标"], ["原文/剧本", "原文管理"], ["选角", "塑角造景"], ["资产", "资产中心"], ["分镜", "分镜管理"], ["生产", "生产工作台"]]) {
      fireEvent.click(screen.getByRole("button", { name: `打开${label}模块` }));
      expect(screen.getByRole("dialog", { name: `${label}模块` })).toHaveTextContent(content);
      fireEvent.click(screen.getByRole("button", { name: `关闭${label}模块` }));
    }
    expect(screen.queryByRole("button", { name: "打开互动模块" })).not.toBeInTheDocument();
    expect(screen.getByTestId("project-canvas-infinite-canvas")).toBeInTheDocument();
    unmount();

    const interactive = createWiring(true);
    render(<ProjectCanvas projectId={8} projectType="interactive" apiBaseUrl="http://localhost:24680/api" getToken={() => null} interactiveGraph={interactiveGraph()} moduleRenderers={moduleRenderers} wiring={interactive.wiring} />);
    expect(await screen.findByTestId("project-canvas-node-interactive:story-graph-8:scene-1")).toHaveTextContent("雨夜开场");
    fireEvent.click(screen.getByRole("button", { name: "打开互动模块" }));
    expect(screen.getByRole("dialog", { name: "互动模块" })).toHaveTextContent("刷新互动剧情");
    expect(screen.getByTestId("project-canvas-infinite-canvas")).toBeInTheDocument();
  });

  it("keeps the canvas node DOM identity while a real module overlay opens", async () => {
    const { wiring } = createWiring(true);
    render(<ProjectCanvas projectId={7} projectType="novel" apiBaseUrl="http://localhost:24680/api" getToken={() => null} moduleRenderers={moduleRenderers} wiring={wiring} />);

    const node = await screen.findByTestId("project-canvas-node-goal-p1");
    fireEvent.click(screen.getByRole("button", { name: "打开原文/剧本模块" }));

    expect(screen.getByTestId("project-canvas-node-goal-p1")).toBe(node);
  });

  it("appends a goal against the current revision without remounting unchanged canvas nodes", async () => {
    const { wiring, emitted } = createWiring(true);
    render(<ProjectCanvas projectId={7} projectType="novel" apiBaseUrl="http://localhost:24680/api" getToken={() => null} wiring={wiring} />);

    const unchangedNode = await screen.findByTestId("project-canvas-node-node-a");
    fireEvent.click(screen.getByRole("button", { name: "打开目标模块" }));
    fireEvent.change(screen.getByRole("textbox", { name: "追加目标" }), { target: { value: "补一支预告片" } });
    fireEvent.click(screen.getByRole("button", { name: "追加到画布" }));

    await waitFor(() => expect(emitted).toHaveLength(1));
    expect(emitted[0]).toEqual(expect.objectContaining({
      payload: expect.objectContaining({
        action: expect.objectContaining({
          action: "changeScope",
          expectedRevision: 1,
          nodesUpsert: [expect.objectContaining({ id: expect.stringMatching(/^goal-project-7-[a-f0-9]+$/), objective: "补一支预告片", graphId: "graph-p1" })],
        }),
      }),
    }));
    expect(screen.getByTestId("project-canvas-node-node-a")).toBe(unchangedNode);
  });
});
