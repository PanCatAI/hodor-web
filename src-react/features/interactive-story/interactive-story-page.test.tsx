import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useEffect } from "react";
import { describe, expect, it, vi } from "vitest";

import { InteractiveStoryPage } from "./interactive-story-page";
import type { InteractiveStoryApi } from "./interactive-story-api";
import type { InteractiveStoryGraph } from "./types";
import type { ProductionApi, ProductionProject } from "@react/features/production";
import { createWesternFantasyWorldProfile } from "@react/features/world-profile/world-profile-fields";

function createApi(): InteractiveStoryApi {
  const graph: InteractiveStoryGraph = {
    id: "graph-7",
    projectId: 7,
    title: "雨夜抉择",
    entryNodeId: "scene-1",
    status: "draft",
    revision: 0,
    createdAt: 1,
    updatedAt: 1,
    variables: [],
    edges: [
      {
        id: "edge-1",
        graphId: "graph-7",
        sourceNodeId: "scene-1",
        targetNodeId: "ending-1",
        choiceText: "推开门",
        condition: null,
        effects: [],
        priority: 0,
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    nodes: [
      {
        id: "scene-1",
        graphId: "graph-7",
        scriptId: 12,
        kind: "scene",
        title: "锁住的房间",
        summary: "主角发现门后的秘密。",
        position: { x: 0, y: 0 },
        status: "ready",
        script: { id: 12, name: "锁住的房间", content: "", createTime: 1 },
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: "ending-1",
        graphId: "graph-7",
        scriptId: 13,
        kind: "ending",
        title: "真相",
        summary: "秘密被公开。",
        position: { x: 560, y: 0 },
        status: "draft",
        script: { id: 13, name: "真相", content: "", createTime: 1 },
        createdAt: 1,
        updatedAt: 1,
      },
    ],
  };
  return {
    getGraph: vi.fn(async () => graph),
    initializeGraph: vi.fn(),
    updateNodePositions: vi.fn(async () => graph),
  };
}

const productionProject: ProductionProject = {
  id: 7,
  name: "雨夜抉择",
  imageModel: "pancat:pancat-image",
  videoModel: "pancat:pancat-video",
  videoMode: "singleImage",
  worldProfile: {
    ...createWesternFantasyWorldProfile(),
    premise: "圣像闭眼，旧王国的誓约苏醒。",
    worldRules: ["神迹必须付出代价"],
  },
};

function createProductionApi(): ProductionApi {
  return {
    getFlowData: vi.fn(async (_projectId: number, scriptId: number) => ({
      script: scriptId === 12 ? "INT. ROOM" : "EXT. STREET",
      scriptPlan: "从远景推进到近景",
      assets: [],
      storyboardTable: "| 镜头 | 景别 |\n| 1 | 近景 |",
      storyboard: [],
    })),
    getGenerationData: vi.fn(async () => ({ storyboardList: [], trackList: [] })),
  } as unknown as ProductionApi;
}

describe("InteractiveStoryPage", () => {
  it("does not reload the graph when selecting a node while the agent is busy", async () => {
    const api = createApi();
    function BusyReporter({ onBusyChange }: { onBusyChange: (busy: boolean) => void }) {
      useEffect(() => {
        onBusyChange(true);
        return () => onBusyChange(false);
      }, [onBusyChange]);
      return <div>智能体运行中</div>;
    }

    render(
      <InteractiveStoryPage
        projectId={7}
        api={api}
        productionApi={createProductionApi()}
        productionProject={productionProject}
        renderScriptAgent={(onBusyChange) => <BusyReporter onBusyChange={onBusyChange} />}
      />,
    );

    await screen.findByTestId("interactive-story-infinite-canvas");
    expect(api.getGraph).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("interactive-story-node-ending-1"));
    await waitFor(() => expect(screen.getByText("智能体运行中")).toBeInTheDocument());
    expect(api.getGraph).toHaveBeenCalledTimes(1);
  });

  it("initializes an empty project and then reads the graph snapshot", async () => {
    const api = createApi();
    vi.mocked(api.getGraph).mockResolvedValueOnce(null);

    render(
      <InteractiveStoryPage
        projectId={7}
        api={api}
        productionApi={createProductionApi()}
        productionProject={productionProject}
        renderScriptAgent={() => <div>项目级剧本对话</div>}
      />,
    );

    expect(await screen.findByTestId("interactive-story-infinite-canvas")).toBeInTheDocument();
    expect(api.initializeGraph).toHaveBeenCalledWith(7, "互动剧 7");
    expect(api.getGraph).toHaveBeenCalledTimes(2);
  });

  it("keeps every production stage inside the interactive canvas and opens only a stage inspector", async () => {
    const api = createApi();
    const productionApi = createProductionApi();
    const onWorldProfileChange = vi.fn(async () => undefined);
    render(
      <InteractiveStoryPage
        projectId={7}
        api={api}
        productionApi={productionApi}
        productionProject={productionProject}
        onWorldProfileChange={onWorldProfileChange}
        renderScriptAgent={(onBusyChange) => (
          <section aria-label="剧本智能体侧栏">
            <button type="button" onClick={() => onBusyChange(true)}>
              运行智能体
            </button>
            项目级剧本对话
          </section>
        )}
      />,
    );

    expect(await screen.findByTestId("interactive-story-infinite-canvas")).toBeInTheDocument();
    const worldProfileNode = screen.getByTestId("world-profile-node");
    expect(screen.getByTestId("rf__node-world-profile")).not.toHaveClass("draggable");
    const storyNodeBeforeEdit = screen.getByTestId("interactive-story-node-scene-1");
    expect(worldProfileNode).toHaveTextContent("欧美玄幻");
    fireEvent.click(worldProfileNode.querySelector("button") as HTMLButtonElement);
    expect(screen.getByRole("dialog", { name: "世界设定" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("世界前提"), { target: { value: "更新后的旧王国誓约" } });
    fireEvent.click(screen.getByRole("button", { name: "保存世界设定" }));
    await waitFor(() => expect(onWorldProfileChange).toHaveBeenCalledWith(expect.objectContaining({ premise: "更新后的旧王国誓约" })));
    expect(screen.getByTestId("interactive-story-node-scene-1")).toBe(storyNodeBeforeEdit);
    await waitFor(() =>
      expect(screen.getByTestId("world-profile-node")).toHaveTextContent("更新后的旧王国誓约"),
    );
    expect(screen.getByText("项目级剧本对话")).toBeInTheDocument();
    expect(within(screen.getByTestId("interactive-story-node-scene-1")).getByText("锁住的房间")).toBeInTheDocument();
    expect(screen.getByText("主角发现门后的秘密。")).toBeInTheDocument();
    await waitFor(() => expect(productionApi.getFlowData).toHaveBeenCalledTimes(2));
    expect(screen.getAllByText("分镜表")).toHaveLength(2);
    expect(screen.getAllByText("分镜图")).toHaveLength(2);
    expect(screen.getAllByText("视频工作台")).toHaveLength(2);
    expect(screen.getAllByText("监督验收")).toHaveLength(2);

    fireEvent.doubleClick(screen.getByTestId("interactive-story-node-scene-1"));
    expect(await screen.findByRole("region", { name: "锁住的房间剧本节点详情" })).toBeInTheDocument();
    expect(screen.queryByTestId("production-infinite-canvas")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("interactive-story-infinite-canvas")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "关闭节点详情" }));

    const storyboardTableNode = screen.getByTestId("interactive-production-node-ending-1::storyboardTable");
    fireEvent.click(storyboardTableNode.querySelector("button") as HTMLButtonElement);
    expect(await screen.findByRole("region", { name: "真相分镜表节点详情" })).toBeInTheDocument();
    expect(screen.getByLabelText("分镜表内容")).toHaveTextContent("| 镜头 | 景别 |");
    expect(screen.queryByTestId("production-infinite-canvas")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("interactive-story-infinite-canvas")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "运行智能体" }));
    await waitFor(() => expect(api.getGraph).toHaveBeenCalledTimes(1));
    expect(screen.getByText("项目级剧本对话")).toBeInTheDocument();
  });
});
