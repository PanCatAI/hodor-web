import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { InteractiveStoryApi } from "./interactive-story-api";
import { InteractiveStoryPage } from "./interactive-story-page";
import type { InteractiveStoryGraph } from "./types";
import type { ProductionApi, ProductionProject } from "@react/features/production";

vi.mock("./interactive-story-canvas", () => ({
  InteractiveStoryCanvas: ({
    graph,
    onPositionsChange,
  }: {
    graph: InteractiveStoryGraph;
    onPositionsChange: (positions: Array<{ nodeId: string; position: { x: number; y: number } }>) => void;
  }) => (
    <section data-testid="position-canvas">
      <output data-testid="graph-revision">{graph.revision}</output>
      {graph.nodes.map((node) => (
        <output key={node.id} data-testid={`position-${node.id}`}>
          {node.position.x},{node.position.y}
        </output>
      ))}
      <button
        type="button"
        onClick={() =>
          onPositionsChange([
            { nodeId: "scene-1", position: { x: 100, y: 200 } },
            { nodeId: "ending-1", position: { x: 500, y: 200 } },
          ])
        }>
        模拟自动布局
      </button>
      <button type="button" onClick={() => onPositionsChange([{ nodeId: "scene-1", position: { x: 10, y: 20 } }])}>
        第一次拖动
      </button>
      <button type="button" onClick={() => onPositionsChange([{ nodeId: "scene-1", position: { x: 30, y: 40 } }])}>
        第二次拖动
      </button>
    </section>
  ),
}));

function graphSnapshot(revision = 0, scenePosition = { x: 0, y: 0 }, endingPosition = { x: 400, y: 0 }): InteractiveStoryGraph {
  return {
    id: "graph-7",
    projectId: 7,
    title: "雨夜抉择",
    entryNodeId: "scene-1",
    status: "draft",
    revision,
    createdAt: 1,
    updatedAt: 1,
    variables: [],
    edges: [],
    nodes: [
      {
        id: "scene-1",
        graphId: "graph-7",
        scriptId: 12,
        kind: "scene",
        title: "开场",
        summary: "",
        position: scenePosition,
        status: "ready",
        script: { id: 12, name: "开场", content: "", createTime: 1 },
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: "ending-1",
        graphId: "graph-7",
        scriptId: 13,
        kind: "ending",
        title: "结局",
        summary: "",
        position: endingPosition,
        status: "draft",
        script: { id: 13, name: "结局", content: "", createTime: 1 },
        createdAt: 1,
        updatedAt: 1,
      },
    ],
  };
}

function apiWith(updateNodePositions: InteractiveStoryApi["updateNodePositions"]): InteractiveStoryApi {
  return {
    getGraph: vi.fn(async () => graphSnapshot()),
    initializeGraph: vi.fn(),
    updateNodePositions,
  };
}

function renderPage(api: InteractiveStoryApi) {
  const productionApi = {
    getFlowData: vi.fn(async () => ({ script: "", scriptPlan: "", assets: [], storyboardTable: "", storyboard: [] })),
    getGenerationData: vi.fn(async () => ({ storyboardList: [], trackList: [] })),
  } as unknown as ProductionApi;
  const productionProject: ProductionProject = {
    id: 7,
    name: "雨夜抉择",
    videoModel: "pancat:pancat-video",
    videoMode: "singleImage",
  };
  return render(
    <InteractiveStoryPage
      projectId={7}
      api={api}
      productionApi={productionApi}
      productionProject={productionProject}
      renderScriptAgent={() => <div>智能体</div>}
    />,
  );
}

describe("interactive story position mutations", () => {
  it("sends one revision-guarded batch for automatic layout and adopts the returned snapshot", async () => {
    const updateNodePositions = vi.fn(async () => graphSnapshot(1, { x: 100, y: 200 }, { x: 500, y: 200 }));
    const api = apiWith(updateNodePositions);
    renderPage(api);
    await screen.findByTestId("position-canvas");

    fireEvent.click(screen.getByRole("button", { name: "模拟自动布局" }));

    await waitFor(() =>
      expect(updateNodePositions).toHaveBeenCalledWith(7, "graph-7", 0, [
        { nodeId: "scene-1", position: { x: 100, y: 200 } },
        { nodeId: "ending-1", position: { x: 500, y: 200 } },
      ]),
    );
    expect(updateNodePositions).toHaveBeenCalledTimes(1);
    expect(await screen.findByTestId("graph-revision")).toHaveTextContent("1");
  });

  it("serializes drags, advances expectedRevision and keeps a newer local position over an older response", async () => {
    let resolveFirst!: (graph: InteractiveStoryGraph) => void;
    let resolveSecond!: (graph: InteractiveStoryGraph) => void;
    const updateNodePositions = vi
      .fn<InteractiveStoryApi["updateNodePositions"]>()
      .mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)))
      .mockImplementationOnce(() => new Promise((resolve) => (resolveSecond = resolve)));
    const api = apiWith(updateNodePositions);
    renderPage(api);
    await screen.findByTestId("position-canvas");

    fireEvent.click(screen.getByRole("button", { name: "第一次拖动" }));
    await waitFor(() => expect(updateNodePositions).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "第二次拖动" }));
    expect(screen.getByTestId("position-scene-1")).toHaveTextContent("30,40");
    expect(updateNodePositions).toHaveBeenCalledTimes(1);

    await act(async () => resolveFirst(graphSnapshot(1, { x: 10, y: 20 })));
    await waitFor(() =>
      expect(updateNodePositions).toHaveBeenNthCalledWith(2, 7, "graph-7", 1, [{ nodeId: "scene-1", position: { x: 30, y: 40 } }]),
    );
    expect(screen.getByTestId("position-scene-1")).toHaveTextContent("30,40");

    await act(async () => resolveSecond(graphSnapshot(2, { x: 30, y: 40 })));
    expect(await screen.findByTestId("graph-revision")).toHaveTextContent("2");
  });

  it("keeps the optimistic layout and reports the error when persistence fails", async () => {
    const updateNodePositions = vi.fn(async () => {
      throw new Error("版本冲突，请稍后重试");
    });
    const api = apiWith(updateNodePositions);
    renderPage(api);
    await screen.findByTestId("position-canvas");

    fireEvent.click(screen.getByRole("button", { name: "第一次拖动" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("版本冲突，请稍后重试");
    expect(screen.getByTestId("position-scene-1")).toHaveTextContent("10,20");
    expect(api.getGraph).toHaveBeenCalledTimes(1);
  });
});
