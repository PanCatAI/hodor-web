import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { describe, expect, it, vi } from "vitest";

import { InteractiveStoryPage } from "./interactive-story-page";
import type { InteractiveStoryApi } from "./interactive-story-api";
import type { InteractiveStoryGraph } from "./types";

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
        renderScriptAgent={(onBusyChange) => <BusyReporter onBusyChange={onBusyChange} />}
        onOpenProduction={() => undefined}
      />,
    );

    await screen.findByTestId("interactive-story-infinite-canvas");
    expect(api.getGraph).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText("真相"));
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
        renderScriptAgent={() => <div>项目级剧本对话</div>}
        onOpenProduction={() => undefined}
      />,
    );

    expect(await screen.findByTestId("interactive-story-infinite-canvas")).toBeInTheDocument();
    expect(api.initializeGraph).toHaveBeenCalledWith(7, "互动剧 7");
    expect(api.getGraph).toHaveBeenCalledTimes(2);
  });

  it("uses the shared infinite canvas, keeps the script agent at project level and opens bound production", async () => {
    const api = createApi();
    const openProduction = vi.fn();
    render(
      <InteractiveStoryPage
        projectId={7}
        api={api}
        renderScriptAgent={(onBusyChange) => (
          <section aria-label="剧本智能体侧栏">
            <button type="button" onClick={() => onBusyChange(true)}>
              运行智能体
            </button>
            项目级剧本对话
          </section>
        )}
        onOpenProduction={openProduction}
      />,
    );

    expect(await screen.findByTestId("interactive-story-infinite-canvas")).toBeInTheDocument();
    expect(screen.getByText("项目级剧本对话")).toBeInTheDocument();
    expect(screen.getByText("锁住的房间")).toBeInTheDocument();
    expect(screen.getByText("主角发现门后的秘密。")).toBeInTheDocument();

    fireEvent.doubleClick(screen.getByTestId("interactive-story-node-scene-1"));
    expect(openProduction).toHaveBeenCalledWith(12);

    fireEvent.click(screen.getByText("真相"));
    fireEvent.click(screen.getByRole("button", { name: "进入节点生产" }));
    expect(openProduction).toHaveBeenCalledWith(13);

    fireEvent.click(screen.getByRole("button", { name: "运行智能体" }));
    await waitFor(() => expect(api.getGraph).toHaveBeenCalledTimes(1));
    expect(screen.getByText("项目级剧本对话")).toBeInTheDocument();
  });
});
