import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { HodorApiClient } from "@react/lib/api/client";
import type { AgentSocket, AgentSocketFactory } from "@react/features/agents";
import type { InteractiveStoryGraph } from "@react/features/interactive-story";
import type { StoryApi } from "@react/features/story";
import { createProductionGraphActionDispatcher } from "@react/features/production-graph/production-graph-actions";
import type { ProductionActionAck } from "@react/features/production-graph/production-graph-actions";
import type { ProductionGraphActionName } from "@react/features/production-graph/types";
import { createProductionGraphContextBridge } from "@react/features/production-graph/production-graph-context";
import { buildDualProjectFixture } from "@react/features/production-graph/production-graph-fixture";
import { createProductionGraphStore } from "@react/features/production-graph/production-graph-store";
import type { UseProductionGraphWiring } from "@react/features/production-graph/production-graph-wiring";
import { clearProjectGoalDraft, writeProjectGoalDraft } from "@react/features/projects";
import { ProjectCanvas, projectCanvasGoalIdempotencyKey } from "./project-canvas";
import { PROJECT_CANVAS_STORY_NODE_SIZE } from "./project-canvas-node-coordinator";
import { StoryModule } from "./story-module";

/** 与 agent-chat-client 测试同构的伪造 socket：记录 chat 载荷并可按事件回放服务端消息。 */
class FakeAgentSocket implements AgentSocket {
  connected = false;
  auth?: Record<string, unknown>;
  readonly emitted: Array<{ event: string; data: unknown }> = [];
  private readonly listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  on(event: string, listener: (...args: unknown[]) => void) {
    const eventListeners = this.listeners.get(event) ?? new Set();
    eventListeners.add(listener);
    this.listeners.set(event, eventListeners);
    return this;
  }

  off(event: string, listener?: (...args: unknown[]) => void) {
    if (listener) this.listeners.get(event)?.delete(listener);
    else this.listeners.delete(event);
    return this;
  }

  emit(event: string, data?: unknown) {
    this.emitted.push({ event, data });
    return this;
  }

  connect() {
    this.connected = true;
    this.trigger("connect");
    return this;
  }

  disconnect() {
    this.connected = false;
    this.trigger("disconnect", "io client disconnect");
    return this;
  }

  trigger(event: string, ...args: unknown[]) {
    this.listeners.get(event)?.forEach((listener) => listener(...args));
  }
}

function createWiring(
  withSnapshot = false,
  initialSnapshot = buildDualProjectFixture().snapshots.p1Initial,
): { wiring: UseProductionGraphWiring; emitted: unknown[] } {
  const store = createProductionGraphStore();
  const emitted: unknown[] = [];
  const bridge = createProductionGraphContextBridge({ store });
  if (withSnapshot) store.applySnapshot(initialSnapshot);
  const socket = {
    connected: true,
    emit(event: string, payload: unknown, ack?: (response: ProductionActionAck) => void) {
      emitted.push({ event, payload });
      if (event === "productionGraph:action") {
        const request = payload as { action: { action: string; idempotencyKey?: string } };
        const snapshot = withSnapshot
          ? { ...initialSnapshot, revision: initialSnapshot.revision + 1 }
          : { ...buildDualProjectFixture().snapshots.p1Initial, graphId: "pending-project-7", projectId: 7 };
        ack?.({
          ok: true,
          result: {
            action: request.action.action as ProductionGraphActionName,
            snapshot,
            idempotencyKey: request.action.idempotencyKey,
            paidGenerationUsd: 0,
          },
        });
      }
    },
  };
  const dispatcher = createProductionGraphActionDispatcher({
    store,
    socket,
    buildContext: () => {
      const selection = bridge.getSelection();
      return {
        actorRef: null,
        graphId: store.getSnapshot().graphId ?? "pending-project-7",
        selectedNodeId: selection.selectedNodeId,
        checkpointId: selection.checkpointId,
      };
    },
  });
  return {
    emitted,
    wiring: {
      store,
      dispatcher,
      contextBridge: bridge,
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
    nodes: [
      {
        id: "scene-1",
        graphId: "story-graph-8",
        scriptId: 19,
        kind: "scene",
        title: "雨夜开场",
        summary: "等待观众选择",
        position: { x: 120, y: 80 },
        status: "ready",
        script: null,
        createdAt: 1,
        updatedAt: 2,
      },
    ],
    edges: [],
    variables: [],
    createdAt: 1,
    updatedAt: 2,
  };
}

/** 供真实 StoryModule 嵌入画布测试的 StoryApi 桩：原文与剧本各一条记录。 */
function createStoryApiStub(): StoryApi {
  return {
    listNovels: vi.fn(async () => ({
      data: [
        {
          id: 11,
          index: 1,
          reel: "第一卷",
          chapter: "雨夜",
          chapterData: "她推开医院的大门。",
          event: "黛利拉遭遇追捕",
          eventState: 1 as const,
        },
      ],
      total: 1,
    })),
    createNovel: vi.fn(async () => undefined),
    updateNovel: vi.fn(async () => undefined),
    deleteNovel: vi.fn(async () => undefined),
    deleteNovels: vi.fn(async () => undefined),
    importNovels: vi.fn(async () => undefined),
    analyzeNovelEvents: vi.fn(async () => undefined),
    pollNovelEvents: vi.fn(async () => []),
    listScripts: vi.fn(async () => [
      { id: 19, name: "第一集", content: "医院走廊，黛利拉回头。", extractState: -1 as const, errorReason: "模型超时", relatedAssets: [] },
    ]),
    createScript: vi.fn(async () => undefined),
    updateScript: vi.fn(async () => undefined),
    deleteScripts: vi.fn(async () => undefined),
    importScripts: vi.fn(async () => undefined),
    exportScripts: vi.fn(async () => new Blob()),
    listSelectableAssets: vi.fn(async () => []),
    extractScriptAssets: vi.fn(async () => undefined),
    pollScriptAssets: vi.fn(async () => []),
  };
}

describe("ProjectCanvas", () => {
  const moduleRenderers = {
    story: () => (
      <div>
        <h3>原文管理</h3>
        <button type="button">新增原文</button>
      </div>
    ),
    casting: () => (
      <div>
        <h3>塑角造景</h3>
        <button type="button">批量生成图片</button>
      </div>
    ),
    assets: () => (
      <div>
        <h3>资产中心</h3>
        <button type="button">新建角色</button>
      </div>
    ),
    storyboards: () => (
      <div>
        <h3>分镜管理</h3>
        <button type="button">刷新状态</button>
      </div>
    ),
    production: () => (
      <div>
        <h3>生产工作台</h3>
        <button type="button">视频生成</button>
      </div>
    ),
    interactive: () => (
      <div>
        <h3>互动剧情</h3>
        <button type="button">刷新互动剧情</button>
      </div>
    ),
  };

  afterEach(() => {
    sessionStorage.clear();
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
  });

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
    expect(emitted[0]).toEqual(
      expect.objectContaining({
        payload: expect.objectContaining({ action: expect.objectContaining({ action: "changeScope" }) }),
      }),
    );
  });

  it("opens model settings from the full-screen canvas header", async () => {
    const { wiring } = createWiring(true);
    const onOpenModelSettings = vi.fn();
    render(
      <ProjectCanvas
        projectId={7}
        projectType="novel"
        apiBaseUrl="http://localhost:24680/api"
        getToken={() => null}
        wiring={wiring}
        onOpenModelSettings={onOpenModelSettings}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "模型设置" }));

    expect(onOpenModelSettings).toHaveBeenCalledOnce();
  });

  it.each(["novel", "interactive"] as const)(
    "uses the same canvas shell for %s projects and keeps the graph running under module panels",
    async (projectType) => {
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
      expect(screen.getByTestId("module-host-story")).toBeInTheDocument();
      expect(screen.getByTestId("project-canvas-infinite-canvas")).toBeInTheDocument();
    },
  );

  it("renders every business module on the same canvas and exposes interactive work for ordinary projects", async () => {
    const { wiring } = createWiring(true);
    const { unmount } = render(
      <ProjectCanvas
        projectId={7}
        projectType="novel"
        apiBaseUrl="http://localhost:24680/api"
        getToken={() => null}
        moduleRenderers={moduleRenderers}
        wiring={wiring}
      />,
    );

    for (const [label, moduleId, content] of [
      ["目标", "goal", "生产目标"],
      ["原文/剧本", "story", "原文管理"],
      ["选角", "casting", "塑角造景"],
      ["资产", "assets", "资产中心"],
      ["分镜", "storyboards", "分镜管理"],
      ["生产", "production", "生产工作台"],
    ]) {
      fireEvent.click(screen.getByRole("button", { name: `打开${label}模块` }));
      expect(screen.getByTestId(`module-host-${moduleId}`)).toHaveTextContent(content);
      fireEvent.click(screen.getByRole("button", { name: `关闭${label}模块` }));
    }
    fireEvent.click(screen.getByRole("button", { name: "打开互动模块" }));
    expect(screen.getByTestId("module-host-interactive")).toHaveTextContent("刷新互动剧情");
    fireEvent.click(screen.getByRole("button", { name: "关闭互动模块" }));
    expect(screen.getByTestId("project-canvas-infinite-canvas")).toBeInTheDocument();
    unmount();

    const interactive = createWiring(true);
    render(
      <ProjectCanvas
        projectId={8}
        projectType="interactive"
        apiBaseUrl="http://localhost:24680/api"
        getToken={() => null}
        interactiveGraph={interactiveGraph()}
        moduleRenderers={moduleRenderers}
        wiring={interactive.wiring}
      />,
    );
    expect(await screen.findByTestId("project-canvas-node-interactive:story-graph-8:scene-1")).toHaveTextContent("雨夜开场");
    fireEvent.click(screen.getByRole("button", { name: "打开互动模块" }));
    expect(screen.getByTestId("module-host-interactive")).toHaveTextContent("刷新互动剧情");
    expect(screen.getByTestId("project-canvas-infinite-canvas")).toBeInTheDocument();
  });

  it("keeps the canvas node DOM identity while a real module overlay opens", async () => {
    const { wiring } = createWiring(true);
    render(
      <ProjectCanvas
        projectId={7}
        projectType="novel"
        apiBaseUrl="http://localhost:24680/api"
        getToken={() => null}
        moduleRenderers={moduleRenderers}
        wiring={wiring}
      />,
    );

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
    expect(emitted[0]).toEqual(
      expect.objectContaining({
        payload: expect.objectContaining({
          action: expect.objectContaining({
            action: "changeScope",
            expectedRevision: 1,
            nodesUpsert: [
              expect.objectContaining({ id: expect.stringMatching(/^goal-project-7-[a-f0-9]+$/), objective: "补一支预告片", graphId: "graph-p1" }),
            ],
          }),
        }),
      }),
    );
    expect(screen.getByTestId("project-canvas-node-node-a")).toBe(unchangedNode);
  });

  it("prefills the goal prompt from the project-entry draft and writes constraints into the goal node", async () => {
    const { wiring, emitted } = createWiring();
    writeProjectGoalDraft({ goal: "做一支 60 秒雨夜悬疑短片", constraints: "不超过 60 秒\n竖屏 9:16", projectType: "novel" });
    render(<ProjectCanvas projectId={7} projectType="novel" apiBaseUrl="http://localhost:24680/api" getToken={() => null} wiring={wiring} />);

    expect(screen.getByRole("heading", { name: "确认你的制作目标" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "生产目标" })).toHaveValue("做一支 60 秒雨夜悬疑短片");
    expect(screen.getByRole("textbox", { name: "必要约束" })).toHaveValue("不超过 60 秒\n竖屏 9:16");

    fireEvent.click(screen.getByRole("button", { name: "开始执行" }));

    await waitFor(() => expect(emitted).toHaveLength(1));
    expect(emitted[0]).toEqual(
      expect.objectContaining({
        payload: expect.objectContaining({
          action: expect.objectContaining({
            action: "changeScope",
            nodesUpsert: [
              expect.objectContaining({
                kind: "goal",
                objective: "做一支 60 秒雨夜悬疑短片",
                constraints: [
                  { code: "user-specified", params: { text: "不超过 60 秒" } },
                  { code: "user-specified", params: { text: "竖屏 9:16" } },
                ],
              }),
            ],
          }),
        }),
      }),
    );
    expect(sessionStorage.getItem("hodorProjectGoalDraft")).toBeNull();
    expect(await screen.findByTestId("project-canvas-infinite-canvas")).toBeInTheDocument();
  });

  it("offers a small-screen stage menu and opens the same overlay module without unmounting the canvas", async () => {
    const { wiring } = createWiring(true);
    render(
      <ProjectCanvas
        projectId={7}
        projectType="novel"
        apiBaseUrl="http://localhost:24680/api"
        getToken={() => null}
        moduleRenderers={moduleRenderers}
        wiring={wiring}
      />,
    );

    const canvas = await screen.findByTestId("project-canvas-infinite-canvas");
    fireEvent.click(screen.getByRole("button", { name: "打开阶段菜单" }));
    expect(screen.getByTestId("project-canvas-mobile-stage-menu")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("menuitem", { name: "打开资产模块" }));
    expect(screen.getByTestId("module-host-assets")).toHaveTextContent("资产中心");
    expect(screen.getByTestId("project-canvas-infinite-canvas")).toBe(canvas);
  });

  it("keeps the deterministic auto-layout entry on the shared canvas", async () => {
    const { wiring } = createWiring(true);
    render(<ProjectCanvas projectId={7} projectType="novel" apiBaseUrl="http://localhost:24680/api" getToken={() => null} wiring={wiring} />);

    await screen.findByTestId("project-canvas-node-goal-p1");
    const button = screen.getByRole("button", { name: "自动布局" });
    fireEvent.click(button);
    expect(screen.getByTestId("project-canvas-infinite-canvas")).toBeInTheDocument();
    expect(screen.getByTestId("project-canvas-node-goal-p1")).toBeInTheDocument();
  });

  it("keeps the same canvas DOM and node identity across stage module, agent drawer, and inspector toggles", async () => {
    const { wiring } = createWiring(true);
    render(
      <ProjectCanvas
        projectId={7}
        projectType="novel"
        apiBaseUrl="http://localhost:24680/api"
        getToken={() => null}
        moduleRenderers={moduleRenderers}
        wiring={wiring}
      />,
    );

    const canvas = await screen.findByTestId("project-canvas-infinite-canvas");
    const node = await screen.findByTestId("project-canvas-node-goal-p1");

    fireEvent.click(screen.getByRole("button", { name: "打开原文/剧本模块" }));
    expect(screen.getByTestId("project-canvas-infinite-canvas")).toBe(canvas);
    expect(screen.getByTestId("project-canvas-node-goal-p1")).toBe(node);
    fireEvent.click(screen.getByRole("button", { name: "关闭原文/剧本模块" }));

    fireEvent.click(screen.getByRole("button", { name: "打开项目智能体" }));
    expect(screen.getByRole("complementary", { name: "项目智能体" })).toBeInTheDocument();
    expect(screen.getByTestId("project-canvas-infinite-canvas")).toBe(canvas);
    expect(screen.getByTestId("project-canvas-node-goal-p1")).toBe(node);
    fireEvent.click(screen.getByRole("button", { name: "收起项目智能体" }));

    fireEvent.click(node);
    expect(screen.getByRole("complementary", { name: "节点检查器" })).toBeInTheDocument();
    expect(screen.getByTestId("project-canvas-infinite-canvas")).toBe(canvas);
    fireEvent.click(screen.getByRole("button", { name: "关闭节点检查器" }));
    expect(screen.getByTestId("project-canvas-infinite-canvas")).toBe(canvas);
    expect(screen.getByTestId("project-canvas-node-goal-p1")).toBe(node);
  });

  it("owns node actions in the inspector while a node is selected and dispatches them directly", async () => {
    const { wiring, emitted } = createWiring(true);
    render(<ProjectCanvas projectId={7} projectType="novel" apiBaseUrl="http://localhost:24680/api" getToken={() => null} wiring={wiring} />);

    await screen.findByTestId("project-canvas-node-goal-p1");

    // 选中节点打开检查器：节点动作归属检查器。
    fireEvent.click(screen.getByTestId("project-canvas-node-goal-p1"));
    expect(screen.getByRole("complementary", { name: "节点检查器" })).toBeInTheDocument();

    // 检查器节点动作直接走 productionGraph:action 派发。
    fireEvent.click(screen.getByRole("button", { name: "启动就绪节点" }));
    await waitFor(() => expect(emitted).toHaveLength(1));
    expect(emitted[0]).toEqual(
      expect.objectContaining({
        payload: expect.objectContaining({
          selectedNodeId: "goal-p1",
          graphId: "graph-p1",
          action: expect.objectContaining({
            action: "startReady",
            nodeIds: ["goal-p1"],
            expectedRevision: 1,
          }),
        }),
      }),
    );
    expect(await screen.findByTestId("inspector-action-notice")).toHaveTextContent("已派发");
  });

  it("keeps node coordinates and the viewport stable while the agent drawer and inspector toggle", async () => {
    const { wiring } = createWiring(true);
    render(<ProjectCanvas projectId={7} projectType="novel" apiBaseUrl="http://localhost:24680/api" getToken={() => null} wiring={wiring} />);

    const canvas = await screen.findByTestId("project-canvas-infinite-canvas");
    const node = await screen.findByTestId("project-canvas-node-goal-p1");
    const nodeWrapper = node.closest(".react-flow__node") as HTMLElement | null;
    const viewport = canvas.querySelector(".react-flow__viewport") as HTMLElement | null;
    const transformBefore = nodeWrapper?.style.transform ?? "";
    const viewportBefore = viewport?.getAttribute("style") ?? "";

    fireEvent.click(screen.getByRole("button", { name: "打开项目智能体" }));
    expect(nodeWrapper?.style.transform ?? "").toBe(transformBefore);
    expect(viewport?.getAttribute("style") ?? "").toBe(viewportBefore);
    fireEvent.click(screen.getByRole("button", { name: "收起项目智能体" }));

    fireEvent.click(node);
    expect(nodeWrapper?.style.transform ?? "").toBe(transformBefore);
    expect(viewport?.getAttribute("style") ?? "").toBe(viewportBefore);
  });

  it("shows the running / pending / failed hierarchy from the graph in the canvas header", async () => {
    const { wiring } = createWiring(true, buildDualProjectFixture().snapshots.p1Concurrent);
    render(<ProjectCanvas projectId={7} projectType="novel" apiBaseUrl="http://localhost:24680/api" getToken={() => null} wiring={wiring} />);

    await screen.findByTestId("project-canvas-node-goal-p1");
    const status = screen.getByTestId("canvas-stage-status");
    expect(status).toHaveTextContent("运行中 2");
    expect(status).toHaveTextContent("待处理 1");
    expect(status).toHaveTextContent("失败 1");
    expect(status).toHaveTextContent("等待决定 1");
  });

  it("renders a fullscreen production desk shell with no horizontal overflow at 1440px", async () => {
    const { wiring } = createWiring(true);
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 });
    fireEvent(window, new Event("resize"));
    render(
      <ProjectCanvas
        projectId={7}
        projectType="novel"
        apiBaseUrl="http://localhost:24680/api"
        getToken={() => null}
        moduleRenderers={moduleRenderers}
        wiring={wiring}
      />,
    );

    const shell = await screen.findByTestId("project-canvas-shell");
    await screen.findByTestId("project-canvas-infinite-canvas");
    // 根容器占满 100dvh/100vw 且禁止横向溢出。
    expect(shell.className).toContain("h-dvh");
    expect(shell.className).toContain("w-full");
    expect(shell.className).toContain("overflow-hidden");
    // 顶部工作栏与画布舞台都锚定左右边缘，不产生横向滚动。
    const header = shell.querySelector("header") as HTMLElement;
    expect(header.className).toContain("inset-x-0");
    const section = shell.querySelector("section[aria-label='统一项目画布']") as HTMLElement;
    expect(section.className).toContain("inset-x-0");
    expect(section.className).toContain("top-14");
    expect(section.className).toContain("bottom-0");
    // 打开 Agent 后画布容器仍保持全宽锚定。
    fireEvent.click(screen.getByRole("button", { name: "打开项目智能体" }));
    expect(section.className).toContain("inset-x-0");
    expect(screen.getByRole("complementary", { name: "项目智能体" })).toBeInTheDocument();

    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
    fireEvent(window, new Event("resize"));
  });

  it("keeps only chat and a compact context strip in the agent drawer without the ProductionGraph v1 console", async () => {
    const { wiring } = createWiring(true);
    render(
      <ProjectCanvas
        projectId={7}
        projectType="novel"
        apiBaseUrl="http://localhost:24680/api"
        getToken={() => null}
        moduleRenderers={moduleRenderers}
        wiring={wiring}
      />,
    );

    await screen.findByTestId("project-canvas-node-goal-p1");
    // 打开阶段模块后再打开 Agent：单焦点下阶段模块自动关闭，抽屉只保留聊天与紧凑上下文条。
    fireEvent.click(screen.getByRole("button", { name: "打开分镜模块" }));
    fireEvent.click(screen.getByRole("button", { name: "打开项目智能体" }));
    expect(screen.queryByTestId("module-host-storyboards")).not.toBeInTheDocument();

    const drawer = screen.getByRole("complementary", { name: "项目智能体" });
    // 旧的 ProductionGraph v1 六动作控制台不再嵌套进 Agent 抽屉。
    expect(within(drawer).queryByLabelText("ProductionGraph v1 控制台")).not.toBeInTheDocument();
    // 只保留聊天与紧凑上下文条：阶段与作用域用自然中文，内部图术语只进 title 属性。
    const strip = within(drawer).getByTestId("agent-context-strip");
    expect(strip).toHaveTextContent("画布总览");
    expect(strip).toHaveTextContent("整个项目流程");
    expect(strip.textContent).not.toContain("graph-p1");
    expect(strip.textContent).not.toContain("rev");
    expect(strip.getAttribute("title")).toContain("graph-p1");
    expect(strip.getAttribute("title")).toContain("revision 1");
  });

  it("shows a lightweight inspector with node actions and graph version only while a node is selected", async () => {
    const { wiring, emitted } = createWiring(true);
    render(<ProjectCanvas projectId={7} projectType="novel" apiBaseUrl="http://localhost:24680/api" getToken={() => null} wiring={wiring} />);

    await screen.findByTestId("project-canvas-node-goal-p1");
    // 未选中节点时检查器不占栏。
    expect(screen.queryByRole("complementary", { name: "节点检查器" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("project-canvas-node-goal-p1"));
    const inspector = screen.getByRole("complementary", { name: "节点检查器" });
    expect(inspector).toHaveTextContent("P1 互动短剧生产目标");
    // 图详情降级为检查器次要位置：仅弱化文本 + title，不进入常驻画布。
    const version = within(inspector).getByTestId("inspector-graph-version");
    expect(version).toHaveTextContent("项目流程已同步");
    expect(version.getAttribute("title")).toContain("graph-p1");
    expect(version.getAttribute("title")).toContain("revision 1");
    expect(inspector.textContent).not.toContain("rev");
    expect(screen.getByRole("button", { name: "启动就绪节点" })).toBeInTheDocument();

    // 检查器节点动作直接走 productionGraph:action 派发。
    fireEvent.click(screen.getByRole("button", { name: "暂停节点" }));
    await waitFor(() => expect(emitted).toHaveLength(1));
    expect(emitted[0]).toEqual(
      expect.objectContaining({
        payload: expect.objectContaining({
          selectedNodeId: "goal-p1",
          graphId: "graph-p1",
          action: expect.objectContaining({ action: "pause", nodeIds: ["goal-p1"], expectedRevision: 1 }),
        }),
      }),
    );
    expect(await screen.findByTestId("inspector-action-notice")).toHaveTextContent("已派发");

    fireEvent.click(screen.getByRole("button", { name: "关闭节点检查器" }));
    expect(screen.queryByRole("complementary", { name: "节点检查器" })).not.toBeInTheDocument();
  });

  it("keeps the small-screen stage menu and agent entry operable without touching the canvas DOM", async () => {
    const { wiring } = createWiring(true);
    render(
      <ProjectCanvas
        projectId={7}
        projectType="novel"
        apiBaseUrl="http://localhost:24680/api"
        getToken={() => null}
        moduleRenderers={moduleRenderers}
        wiring={wiring}
      />,
    );

    const canvas = await screen.findByTestId("project-canvas-infinite-canvas");
    expect(screen.getByRole("button", { name: "打开项目智能体" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "打开阶段菜单" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "打开生产模块" }));
    expect(screen.getByTestId("module-host-production")).toBeInTheDocument();
    expect(screen.getByTestId("project-canvas-infinite-canvas")).toBe(canvas);
    fireEvent.click(screen.getByRole("button", { name: "关闭生产模块" }));

    fireEvent.click(screen.getByRole("button", { name: "打开项目智能体" }));
    expect(screen.getByRole("complementary", { name: "项目智能体" })).toBeInTheDocument();
    expect(screen.getByTestId("project-canvas-infinite-canvas")).toBe(canvas);
  });

  it("sends the free-text command through the real AgentChatClient socket with full canvas context", async () => {
    const { wiring } = createWiring(true);
    const agentSocket = new FakeAgentSocket();
    const socketFactory = vi.fn(() => agentSocket) as unknown as AgentSocketFactory;
    const request = vi.fn(async () => []);
    render(
      <ProjectCanvas
        projectId={7}
        projectType="novel"
        apiBaseUrl="http://localhost:24680/api"
        getToken={() => "Bearer canary"}
        wiring={wiring}
        moduleRenderers={moduleRenderers}
        apiClient={{ request } as unknown as HodorApiClient}
        agentSocketFactory={socketFactory}
      />,
    );

    await screen.findByTestId("project-canvas-node-goal-p1");
    // 抽屉里的 AgentConsole 挂载即连接现有智能体通道。
    await waitFor(() => expect(agentSocket.connected).toBe(true));
    // 等待 loadHistory 完成，避免异步 setState 逃逸 act。
    await waitFor(() => expect(request).toHaveBeenCalled());

    // 对话入口只有右侧 Agent 抽屉：打开抽屉后在聊天输入框发送自由文本。
    fireEvent.click(screen.getByRole("button", { name: "打开项目智能体" }));
    const drawer = screen.getByRole("complementary", { name: "项目智能体" });
    fireEvent.change(within(drawer).getByRole("textbox", { name: "发送指令" }), {
      target: { value: "为当前镜头写一段分镜描述" },
    });
    fireEvent.click(within(drawer).getByRole("button", { name: "发送" }));

    await waitFor(() => expect(agentSocket.emitted.some((entry) => entry.event === "chat")).toBe(true));
    const chat = agentSocket.emitted.find((entry) => entry.event === "chat")!.data as {
      content: string;
      context: Record<string, unknown>;
    };
    expect(chat.content).toBe("为当前镜头写一段分镜描述");
    expect(chat.context).toMatchObject({
      projectId: 7,
      projectType: "novel",
      stage: null,
      stageLabel: "画布总览",
      selectedNodeId: null,
      nodeTitle: null,
      graphId: "graph-p1",
      revision: 1,
    });

    // 抽屉内能看到已发送指令。
    expect(within(drawer).getByText("为当前镜头写一段分镜描述")).toBeInTheDocument();

    // 服务端回复经现有 socket 事件回流，抽屉内显示执行反馈。
    act(() => {
      agentSocket.trigger("message", {
        id: "assistant-reply-1",
        role: "assistant",
        status: "complete",
        datetime: "",
        content: [{ type: "text", data: "已按指令生成该镜头的分镜描述。", status: "complete" }],
      });
    });
    expect(await within(drawer).findByText("已按指令生成该镜头的分镜描述。")).toBeInTheDocument();
  });

  it("carries the latest graph revision and stage context into each drawer message at send time", async () => {
    const { wiring } = createWiring(true);
    const agentSocket = new FakeAgentSocket();
    const socketFactory = vi.fn(() => agentSocket) as unknown as AgentSocketFactory;
    const request = vi.fn(async () => []);
    render(
      <ProjectCanvas
        projectId={7}
        projectType="novel"
        apiBaseUrl="http://localhost:24680/api"
        getToken={() => "Bearer canary"}
        wiring={wiring}
        moduleRenderers={moduleRenderers}
        apiClient={{ request } as unknown as HodorApiClient}
        agentSocketFactory={socketFactory}
      />,
    );

    await screen.findByTestId("project-canvas-node-goal-p1");
    await waitFor(() => expect(agentSocket.connected).toBe(true));
    await waitFor(() => expect(request).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "打开项目智能体" }));
    const drawer = screen.getByRole("complementary", { name: "项目智能体" });
    const chats = () => agentSocket.emitted.filter((entry) => entry.event === "chat").map((entry) => entry.data as { content: string; context: Record<string, unknown> });
    const chat = () => chats()[chats().length - 1];
    const chatCount = () => chats().length;

    fireEvent.change(within(drawer).getByRole("textbox", { name: "发送指令" }), { target: { value: "先看一眼当前流程" } });
    fireEvent.click(within(drawer).getByRole("button", { name: "发送" }));
    await waitFor(() => expect(chatCount()).toBe(1));
    expect(chat().context).toMatchObject({ graphId: "graph-p1", revision: 1, stage: null, stageLabel: "画布总览" });

    // 图版本前进后，下一句消息仍携带最新 revision / graphId（消息上下文按发送时刻读取，不是创建时刻的快照）。
    act(() => {
      wiring.store.applySnapshot({ ...buildDualProjectFixture().snapshots.p1Initial, revision: 2 });
    });
    fireEvent.change(within(drawer).getByRole("textbox", { name: "发送指令" }), { target: { value: "图更新后再看一眼" } });
    fireEvent.click(within(drawer).getByRole("button", { name: "发送" }));
    await waitFor(() => expect(chatCount()).toBe(2));
    expect(chat().content).toBe("图更新后再看一眼");
    expect(chat().context).toMatchObject({ projectId: 7, projectType: "novel", graphId: "graph-p1", revision: 2 });
  });

  it("refreshes the interactive graph after the project agent finishes writing", async () => {
    const { wiring } = createWiring(true);
    const agentSocket = new FakeAgentSocket();
    const socketFactory = vi.fn(() => agentSocket) as unknown as AgentSocketFactory;
    const onRefreshInteractiveGraph = vi.fn(async () => undefined);

    render(
      <ProjectCanvas
        projectId={7}
        projectType="interactive"
        apiBaseUrl="http://localhost:24680/api"
        getToken={() => "Bearer canary"}
        wiring={wiring}
        apiClient={{ request: vi.fn(async () => []) } as unknown as HodorApiClient}
        agentSocketFactory={socketFactory}
        onRefreshInteractiveGraph={onRefreshInteractiveGraph}
      />,
    );

    await waitFor(() => expect(agentSocket.connected).toBe(true));
    act(() => {
      agentSocket.trigger("message", {
        id: "assistant-writing-graph",
        role: "assistant",
        status: "streaming",
        datetime: "",
        content: [{ type: "text", data: "正在写入互动节点", status: "streaming" }],
      });
      agentSocket.trigger("message:update", { id: "assistant-writing-graph", status: "complete" });
    });

    await waitFor(() => expect(onRefreshInteractiveGraph).toHaveBeenCalledTimes(1));
  });

  it("closes the open overlay on Escape and restores focus to its trigger", async () => {
    const { wiring } = createWiring(true);
    render(
      <ProjectCanvas
        projectId={7}
        projectType="novel"
        apiBaseUrl="http://localhost:24680/api"
        getToken={() => null}
        moduleRenderers={moduleRenderers}
        wiring={wiring}
      />,
    );

    await screen.findByTestId("project-canvas-node-goal-p1");

    // 单焦点：任一时刻只有一个覆盖层打开，Escape 关闭它并归还焦点给触发控件。
    const moduleTrigger = screen.getByRole("button", { name: "打开原文/剧本模块" });
    moduleTrigger.focus();
    fireEvent.click(moduleTrigger);
    expect(screen.getByTestId("module-host-story")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("module-host-story")).not.toBeInTheDocument();
    expect(moduleTrigger).toHaveFocus();

    const agentTrigger = screen.getByRole("button", { name: "打开项目智能体" });
    agentTrigger.focus();
    fireEvent.click(agentTrigger);
    expect(screen.getByRole("complementary", { name: "项目智能体" })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("complementary", { name: "项目智能体" })).not.toBeInTheDocument();
    expect(agentTrigger).toHaveFocus();

    fireEvent.click(screen.getByTestId("project-canvas-node-goal-p1"));
    expect(screen.getByRole("complementary", { name: "节点检查器" })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("complementary", { name: "节点检查器" })).not.toBeInTheDocument();
  });

  it("assigns distinct z-layers to module, agent, and inspector overlays that never stack together", async () => {
    const { wiring } = createWiring(true);
    render(
      <ProjectCanvas
        projectId={7}
        projectType="novel"
        apiBaseUrl="http://localhost:24680/api"
        getToken={() => null}
        moduleRenderers={moduleRenderers}
        wiring={wiring}
      />,
    );

    await screen.findByTestId("project-canvas-node-goal-p1");

    // 阶段模块单独打开：z-50 覆盖层身份。
    fireEvent.click(screen.getByRole("button", { name: "打开原文/剧本模块" }));
    const modulePanel = screen.getByTestId("module-host-story");
    expect(modulePanel).toHaveAttribute("data-canvas-overlay", "module");
    expect(modulePanel.className).toMatch(/z-50/);
    expect(screen.getByRole("button", { name: "关闭原文/剧本模块" })).toBeEnabled();

    // 打开 Agent：单焦点下阶段模块自动关闭，抽屉以 z-40 独立呈现，不再夹住画布。
    fireEvent.click(screen.getByRole("button", { name: "打开项目智能体" }));
    expect(screen.queryByTestId("module-host-story")).not.toBeInTheDocument();
    const agentPanel = screen.getByRole("complementary", { name: "项目智能体" });
    expect(agentPanel).toHaveAttribute("data-canvas-overlay", "agent");
    expect(agentPanel.style.zIndex).toBe("40");
    expect(screen.getByRole("button", { name: "收起项目智能体" })).toBeEnabled();
  });

  it("turns module and agent overlays into full-width drawers on small screens with an exit control", async () => {
    const { wiring } = createWiring(true);
    render(
      <ProjectCanvas
        projectId={7}
        projectType="novel"
        apiBaseUrl="http://localhost:24680/api"
        getToken={() => null}
        moduleRenderers={moduleRenderers}
        wiring={wiring}
      />,
    );

    await screen.findByTestId("project-canvas-node-goal-p1");
    fireEvent.click(screen.getByRole("button", { name: "打开原文/剧本模块" }));
    expect(screen.getByTestId("module-host-story").className).toMatch(/max-md:inset-x-0/);
    expect(screen.getByTestId("module-host-story").className).toMatch(/max-md:rounded-none/);

    fireEvent.click(screen.getByRole("button", { name: "打开项目智能体" }));
    const agentPanel = screen.getByRole("complementary", { name: "项目智能体" });
    expect(agentPanel.className).toMatch(/max-md:!inset-x-0/);
    expect(agentPanel.className).toMatch(/max-md:!w-auto/);
    expect(screen.getByRole("button", { name: "收起项目智能体" })).toBeInTheDocument();
  });

  it("keeps the canvas full size and the top bar full width while the agent drawer opens (360-420px, max 42vw)", async () => {
    const { wiring } = createWiring(true);
    render(
      <ProjectCanvas
        projectId={7}
        projectType="novel"
        apiBaseUrl="http://localhost:24680/api"
        getToken={() => null}
        moduleRenderers={moduleRenderers}
        wiring={wiring}
      />,
    );

    const canvas = await screen.findByTestId("project-canvas-infinite-canvas");
    const node = await screen.findByTestId("project-canvas-node-goal-p1");
    const nodeWrapper = node.closest(".react-flow__node") as HTMLElement | null;
    const transformBefore = nodeWrapper?.style.transform ?? "";
    const shell = screen.getByTestId("project-canvas-shell");
    const header = shell.querySelector("header") as HTMLElement;
    const canvasSection = shell.querySelector("section[aria-label='统一项目画布']") as HTMLElement;

    // 顶部工作栏固定全宽（56px 高），不存在随 Agent 缩窄的协同模式。
    expect(header.className).toContain("h-14");
    expect(header.className).toContain("inset-x-0");
    expect(shell).not.toHaveAttribute("data-canvas-coexist");

    // 单独打开阶段模块：使用完整覆盖宽度，不进入紧凑宽度。
    fireEvent.click(screen.getByRole("button", { name: "打开原文/剧本模块" }));
    const soloModule = screen.getByTestId("module-host-story");
    expect(soloModule.className).toContain("w-[min(52rem,calc(100vw-1.5rem))]");
    expect(soloModule).not.toHaveAttribute("data-canvas-compact");
    // 关闭阶段模块后再打开 Agent：抽屉浮在右侧，不挤压画布，顶部栏与画布舞台保持全宽。
    fireEvent.click(screen.getByRole("button", { name: "关闭原文/剧本模块" }));
    expect(screen.queryByTestId("module-host-story")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "打开项目智能体" }));
    expect(shell).not.toHaveAttribute("data-canvas-coexist");
    expect(shell.className).not.toContain("canvas-coexist-compact");
    const agentPanel = screen.getByRole("complementary", { name: "项目智能体" });
    const width = Number.parseFloat(agentPanel.style.width);
    expect(width).toBeGreaterThanOrEqual(360);
    expect(width).toBeLessThanOrEqual(420);
    expect(agentPanel).not.toHaveAttribute("data-canvas-compact");
    expect(header.className).toContain("inset-x-0");
    expect(canvasSection.className).toContain("inset-x-0");
    expect(screen.getByTestId("project-canvas-infinite-canvas")).toBe(canvas);
    expect(screen.getByTestId("project-canvas-node-goal-p1")).toBe(node);
    expect(nodeWrapper?.style.transform ?? "").toBe(transformBefore);

    // 关闭 Agent：画布身份与节点坐标保持不变。
    fireEvent.click(screen.getByRole("button", { name: "收起项目智能体" }));
    expect(screen.getByTestId("project-canvas-infinite-canvas")).toBe(canvas);
    expect(screen.getByTestId("project-canvas-node-goal-p1")).toBe(node);
    expect(nodeWrapper?.style.transform ?? "").toBe(transformBefore);
  });

  it("mutually excludes the stage module and agent drawer on small screens so overlays never stack full-width", async () => {
    const { wiring } = createWiring(true);
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 500 });
    fireEvent(window, new Event("resize"));
    render(
      <ProjectCanvas
        projectId={7}
        projectType="novel"
        apiBaseUrl="http://localhost:24680/api"
        getToken={() => null}
        moduleRenderers={moduleRenderers}
        wiring={wiring}
      />,
    );

    const canvas = await screen.findByTestId("project-canvas-infinite-canvas");
    const node = await screen.findByTestId("project-canvas-node-goal-p1");
    const shell = screen.getByTestId("project-canvas-shell");

    // 打开 Agent 后再打开阶段模块：Agent 自动关闭，避免层叠全屏。
    fireEvent.click(screen.getByRole("button", { name: "打开项目智能体" }));
    expect(screen.getByRole("complementary", { name: "项目智能体" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "打开原文/剧本模块" }));
    expect(screen.getByTestId("module-host-story")).toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "项目智能体" })).not.toBeInTheDocument();
    expect(shell).not.toHaveAttribute("data-canvas-coexist");

    // 打开阶段模块后再打开 Agent：阶段模块自动关闭。
    fireEvent.click(screen.getByRole("button", { name: "打开项目智能体" }));
    expect(screen.getByRole("complementary", { name: "项目智能体" })).toBeInTheDocument();
    expect(screen.queryByTestId("module-host-story")).not.toBeInTheDocument();

    // 同一 canvas DOM 身份与节点坐标继续成立。
    expect(screen.getByTestId("project-canvas-infinite-canvas")).toBe(canvas);
    expect(screen.getByTestId("project-canvas-node-goal-p1")).toBe(node);

    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
    fireEvent(window, new Event("resize"));
  });

  it("restores focus to the opening trigger and keeps canvas node coordinates when toggling module and agent", async () => {
    const { wiring } = createWiring(true);
    render(
      <ProjectCanvas
        projectId={7}
        projectType="novel"
        apiBaseUrl="http://localhost:24680/api"
        getToken={() => null}
        moduleRenderers={moduleRenderers}
        wiring={wiring}
      />,
    );

    const canvas = await screen.findByTestId("project-canvas-infinite-canvas");
    const node = await screen.findByTestId("project-canvas-node-goal-p1");
    const nodeWrapper = node.closest(".react-flow__node") as HTMLElement | null;
    const viewport = canvas.querySelector(".react-flow__viewport") as HTMLElement | null;
    const transformBefore = nodeWrapper?.style.transform ?? "";
    const viewportBefore = viewport?.getAttribute("style") ?? "";

    // 打开再关闭阶段模块：焦点回到触发控件，画布身份不变。
    const moduleTrigger = screen.getByRole("button", { name: "打开原文/剧本模块" });
    moduleTrigger.focus();
    fireEvent.click(moduleTrigger);
    expect(screen.getByTestId("module-host-story")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "关闭原文/剧本模块" }));
    expect(moduleTrigger).toHaveFocus();
    expect(screen.getByTestId("project-canvas-infinite-canvas")).toBe(canvas);

    // 打开再关闭 Agent：焦点回到触发控件，节点坐标与取景不变。
    const agentTrigger = screen.getByRole("button", { name: "打开项目智能体" });
    agentTrigger.focus();
    fireEvent.click(agentTrigger);
    expect(screen.getByRole("complementary", { name: "项目智能体" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "收起项目智能体" }));
    expect(agentTrigger).toHaveFocus();
    expect(screen.getByTestId("project-canvas-infinite-canvas")).toBe(canvas);
    expect(screen.getByTestId("project-canvas-node-goal-p1")).toBe(node);
    expect(nodeWrapper?.style.transform ?? "").toBe(transformBefore);
    expect(viewport?.getAttribute("style") ?? "").toBe(viewportBefore);
  });

  it("mutually excludes the stage module, agent drawer, and node inspector on desktop so overlays never stack", async () => {
    const { wiring } = createWiring(true);
    render(
      <ProjectCanvas
        projectId={7}
        projectType="novel"
        apiBaseUrl="http://localhost:24680/api"
        getToken={() => null}
        moduleRenderers={moduleRenderers}
        wiring={wiring}
      />,
    );

    const canvas = await screen.findByTestId("project-canvas-infinite-canvas");
    const node = await screen.findByTestId("project-canvas-node-goal-p1");

    // 打开 Agent 后再打开阶段模块：Agent 自动关闭，避免左右覆盖层夹住画布。
    fireEvent.click(screen.getByRole("button", { name: "打开项目智能体" }));
    expect(screen.getByRole("complementary", { name: "项目智能体" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "打开原文/剧本模块" }));
    expect(screen.getByTestId("module-host-story")).toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "项目智能体" })).not.toBeInTheDocument();

    // 打开阶段模块后再打开 Agent：阶段模块自动关闭。
    fireEvent.click(screen.getByRole("button", { name: "打开项目智能体" }));
    expect(screen.getByRole("complementary", { name: "项目智能体" })).toBeInTheDocument();
    expect(screen.queryByTestId("module-host-story")).not.toBeInTheDocument();

    // 选中节点打开检查器：Agent 自动关闭，检查器独占焦点。
    fireEvent.click(node);
    expect(screen.getByRole("complementary", { name: "节点检查器" })).toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "项目智能体" })).not.toBeInTheDocument();

    // 检查器打开时再打开阶段模块：检查器关闭，阶段模块独占焦点。
    fireEvent.click(screen.getByRole("button", { name: "打开原文/剧本模块" }));
    expect(screen.getByTestId("module-host-story")).toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "节点检查器" })).not.toBeInTheDocument();

    // 同一覆盖层可切换/关闭：再点同一模块按钮关闭它。
    fireEvent.click(screen.getByRole("button", { name: "打开原文/剧本模块" }));
    expect(screen.queryByTestId("module-host-story")).not.toBeInTheDocument();

    // 同一 canvas DOM 身份与节点坐标继续成立。
    expect(screen.getByTestId("project-canvas-infinite-canvas")).toBe(canvas);
    expect(screen.getByTestId("project-canvas-node-goal-p1")).toBe(node);
  });

  it("renders a ~300px node card with title/objective/status/next-action hierarchy and no raw internal id", async () => {
    const { wiring } = createWiring(true);
    render(<ProjectCanvas projectId={7} projectType="novel" apiBaseUrl="http://localhost:24680/api" getToken={() => null} wiring={wiring} />);

    const card = await screen.findByTestId("project-canvas-node-goal-p1");
    expect(card.className).toContain("w-[300px]");
    expect(card).toHaveTextContent("P1 互动短剧生产目标");
    expect(card).toHaveTextContent("通过零成本工作并发产出最终交付候选。");
    expect(card).toHaveTextContent("就绪");
    expect(card).toHaveTextContent("启动执行");
    // 去掉显眼的内部 ID：卡片不再展示原始节点 id。
    expect(card.textContent).not.toContain("goal-p1");
  });

  it("replaces the top-left graph version badge with a user-facing project flow status", async () => {
    const { wiring } = createWiring(true);
    render(<ProjectCanvas projectId={7} projectType="novel" apiBaseUrl="http://localhost:24680/api" getToken={() => null} wiring={wiring} />);

    await screen.findByTestId("project-canvas-infinite-canvas");
    const badge = screen.getByTestId("canvas-flow-status");
    expect(badge).toHaveTextContent("项目流程");
    expect(badge).toHaveTextContent("已同步");
    expect(badge.textContent).not.toContain("ProductionGraph");
    expect(badge.textContent).not.toContain("rev");
    expect(badge.textContent).not.toContain("graph-p1");
  });

  it.each([1440, 2048] as const)(
    "keeps the four header sections with readable stage controls and no internal terms at %ipx width",
    async (width) => {
      const { wiring } = createWiring(true);
      Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
      fireEvent(window, new Event("resize"));
      render(
        <ProjectCanvas
          projectId={7}
          projectType="novel"
          apiBaseUrl="http://localhost:24680/api"
          getToken={() => null}
          moduleRenderers={moduleRenderers}
          wiring={wiring}
        />,
      );

      await screen.findByTestId("project-canvas-infinite-canvas");
      const shell = screen.getByTestId("project-canvas-shell");
      const header = shell.querySelector("header") as HTMLElement;

      // 四部分层级：项目身份 / 阶段切换 / 运行状态 / Agent。
      expect(within(header).getByRole("heading", { name: /项目 #7/ })).toBeInTheDocument();
      expect(within(header).getByTestId("project-canvas-stage-bar")).toBeInTheDocument();
      expect(within(header).getByTestId("canvas-stage-status")).toBeInTheDocument();
      expect(within(header).getByRole("button", { name: "打开项目智能体" })).toBeInTheDocument();

      // 阶段按钮：不小于 text-sm、不小于 py-2，未激活不用过淡的 slate-500。
      const stageButtons = within(header).getAllByRole("button", { name: /打开.+模块/ });
      expect(stageButtons.length).toBeGreaterThanOrEqual(6);
      for (const button of stageButtons) {
        expect(button.className).toContain("text-sm");
        expect(button.className).toContain("py-2");
        expect(button.className).not.toContain("text-slate-500");
      }

      // 常驻头部不出现内部术语。
      expect(header.textContent).not.toContain("ProductionGraph");
      expect(header.textContent).not.toMatch(/rev\b/);
      expect(header.textContent).not.toContain("graph-p1");

      Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
      fireEvent(window, new Event("resize"));
    },
  );

  it("uses the same header stage structure for novel and interactive projects", async () => {
    for (const projectType of ["novel", "interactive"] as const) {
      const { wiring } = createWiring(true);
      const view = render(
        <ProjectCanvas
          projectId={projectType === "interactive" ? 8 : 7}
          projectType={projectType}
          apiBaseUrl="http://localhost:24680/api"
          getToken={() => null}
          interactiveGraph={projectType === "interactive" ? interactiveGraph() : undefined}
          wiring={wiring}
        />,
      );
      await screen.findByTestId("project-canvas-infinite-canvas");
      const stageBar = screen.getByTestId("project-canvas-stage-bar");
      for (const label of ["目标", "原文/剧本", "选角", "资产", "分镜", "生产"]) {
        expect(within(stageBar).getByRole("button", { name: `打开${label}模块` })).toBeInTheDocument();
      }
      expect(within(stageBar).getByRole("button", { name: "打开互动模块" })).toBeInTheDocument();
      expect(screen.getByTestId("canvas-flow-status")).toHaveTextContent("项目流程");
      view.unmount();
    }
  });

  it("keeps internal graph terms out of the persistent canvas text", async () => {
    const { wiring } = createWiring(true);
    render(<ProjectCanvas projectId={7} projectType="novel" apiBaseUrl="http://localhost:24680/api" getToken={() => null} wiring={wiring} />);

    await screen.findByTestId("project-canvas-infinite-canvas");
    const shell = screen.getByTestId("project-canvas-shell");
    const persistent: Array<HTMLElement | null> = [shell.querySelector("header"), screen.getByTestId("canvas-flow-status")];
    for (const element of persistent) {
      const text = element?.textContent ?? "";
      expect(text).not.toContain("ProductionGraph");
      expect(text).not.toContain("graphId");
      expect(text).not.toMatch(/rev\b/);
      expect(text).not.toContain("graph-p1");
    }
  });

  it("reframes on first load, revision change, and overlay close but stays stable on ordinary re-render and panning", async () => {
    const { wiring } = createWiring(true);
    render(
      <ProjectCanvas
        projectId={7}
        projectType="novel"
        apiBaseUrl="http://localhost:24680/api"
        getToken={() => null}
        moduleRenderers={moduleRenderers}
        wiring={wiring}
      />,
    );

    const canvas = await screen.findByTestId("project-canvas-infinite-canvas");
    const section = screen.getByTestId("project-canvas-shell").querySelector("section[aria-label='统一项目画布']") as HTMLElement;
    const readKey = () => section.getAttribute("data-canvas-framing-key");
    const firstKey = readKey();
    expect(firstKey).toBeTruthy();

    // 普通重渲染（同一 graphId/revision，无覆盖层切换）：key 稳定，不反复取景。
    act(() => {
      wiring.store.applySnapshot({ ...buildDualProjectFixture().snapshots.p1Initial });
    });
    expect(readKey()).toBe(firstKey);

    // graphId/revision 变化：key 变化，触发重新取景。
    act(() => {
      wiring.store.applySnapshot({ ...buildDualProjectFixture().snapshots.p1Initial, revision: 2 });
    });
    const revisionKey = readKey();
    expect(revisionKey).not.toBe(firstKey);

    // 覆盖层打开不改变 key；关闭时 key 变化，触发重新取景。
    fireEvent.click(screen.getByRole("button", { name: "打开原文/剧本模块" }));
    expect(readKey()).toBe(revisionKey);
    fireEvent.click(screen.getByRole("button", { name: "关闭原文/剧本模块" }));
    const closedKey = readKey();
    expect(closedKey).not.toBe(revisionKey);

    // 用户拖动画布：key 不变，不会反复重置视口。
    fireEvent.mouseDown(canvas, { clientX: 120, clientY: 120, button: 0 });
    fireEvent.mouseMove(canvas, { clientX: 220, clientY: 160 });
    fireEvent.mouseUp(canvas);
    expect(readKey()).toBe(closedKey);
  });

  it("reframes when the agent drawer and node inspector close", async () => {
    const { wiring } = createWiring(true);
    render(<ProjectCanvas projectId={7} projectType="novel" apiBaseUrl="http://localhost:24680/api" getToken={() => null} wiring={wiring} />);

    const node = await screen.findByTestId("project-canvas-node-goal-p1");
    const section = screen.getByTestId("project-canvas-shell").querySelector("section[aria-label='统一项目画布']") as HTMLElement;
    const readKey = () => section.getAttribute("data-canvas-framing-key");
    const base = readKey();
    expect(base).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "打开项目智能体" }));
    expect(readKey()).toBe(base);
    fireEvent.click(screen.getByRole("button", { name: "收起项目智能体" }));
    const afterAgentClose = readKey();
    expect(afterAgentClose).not.toBe(base);

    fireEvent.click(node);
    expect(readKey()).toBe(afterAgentClose);
    fireEvent.click(screen.getByRole("button", { name: "关闭节点检查器" }));
    expect(readKey()).not.toBe(afterAgentClose);
  });

  it("keeps original and script mutually exclusive inside the story module without touching the canvas", async () => {
    const { wiring } = createWiring(true);
    render(
      <ProjectCanvas
        projectId={7}
        projectType="novel"
        apiBaseUrl="http://localhost:24680/api"
        getToken={() => null}
        moduleRenderers={{ ...moduleRenderers, story: () => <StoryModule api={createStoryApiStub()} projectId={7} /> }}
        wiring={wiring}
      />,
    );

    const canvas = await screen.findByTestId("project-canvas-infinite-canvas");
    const node = await screen.findByTestId("project-canvas-node-goal-p1");
    const nodeWrapper = node.closest(".react-flow__node") as HTMLElement | null;
    const transformBefore = nodeWrapper?.style.transform ?? "";

    fireEvent.click(screen.getByRole("button", { name: "打开原文/剧本模块" }));
    const dialog = screen.getByTestId("module-host-story");

    // 默认原文：剧本面板不在 DOM，不纵向堆叠两个完整页面。
    expect(await within(dialog).findByText("雨夜")).toBeInTheDocument();
    expect(within(dialog).queryByTestId("story-module-pane-script")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("第一集")).not.toBeInTheDocument();

    // 切到剧本：原文消失；切换不离开画布，节点坐标不被重置。
    fireEvent.click(within(dialog).getByRole("button", { name: "剧本" }));
    expect(await within(dialog).findByText("第一集")).toBeInTheDocument();
    expect(within(dialog).queryByTestId("story-module-pane-novel")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("雨夜")).not.toBeInTheDocument();
    expect(screen.getByTestId("project-canvas-infinite-canvas")).toBe(canvas);
    expect(screen.getByTestId("project-canvas-node-goal-p1")).toBe(node);
    expect(nodeWrapper?.style.transform ?? "").toBe(transformBefore);

    // 切回原文：剧本消失，画布身份不变。
    fireEvent.click(within(dialog).getByRole("button", { name: "原文" }));
    expect(await within(dialog).findByText("雨夜")).toBeInTheDocument();
    expect(within(dialog).queryByTestId("story-module-pane-script")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("第一集")).not.toBeInTheDocument();
    expect(screen.getByTestId("project-canvas-infinite-canvas")).toBe(canvas);
    expect(screen.getByTestId("project-canvas-node-goal-p1")).toBe(node);
  });

  it("renders a single story module title bar and keeps the route on close", async () => {
    const { wiring } = createWiring(true);
    const hashBefore = window.location.hash;
    render(
      <ProjectCanvas
        projectId={7}
        projectType="novel"
        apiBaseUrl="http://localhost:24680/api"
        getToken={() => null}
        moduleRenderers={{ ...moduleRenderers, story: () => <StoryModule api={createStoryApiStub()} projectId={7} /> }}
        wiring={wiring}
      />,
    );

    await screen.findByTestId("project-canvas-node-goal-p1");

    fireEvent.click(screen.getByRole("button", { name: "打开原文/剧本模块" }));
    const dialog = screen.getByTestId("module-host-story");
    // 等待原文面板异步加载完成，避免 setState 逃逸 act。
    expect(await within(dialog).findByText("雨夜")).toBeInTheDocument();

    // 模块标题栏只出现一次；不复制全局导航，不出现嵌套控制台。
    const headings = within(dialog).getAllByRole("heading");
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("原文/剧本模块");
    expect(within(dialog).queryByText("制作工作台")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("ProductionGraph")).not.toBeInTheDocument();
    // 分段切换只挂载一个内容面板。
    expect(within(dialog).queryByTestId("story-module-pane-novel")).toBeInTheDocument();
    expect(within(dialog).queryByTestId("story-module-pane-script")).not.toBeInTheDocument();

    // 模块关闭后回到画布，路由不变。
    fireEvent.click(screen.getByRole("button", { name: "关闭原文/剧本模块" }));
    expect(screen.queryByTestId("module-host-story")).not.toBeInTheDocument();
    expect(window.location.hash).toBe(hashBefore);
  });

  it.each([1440, 2048] as const)(
    "keeps the story module overlay capped and the canvas full width at %ipx",
    async (width) => {
      const { wiring } = createWiring(true);
      Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
      fireEvent(window, new Event("resize"));
      render(
        <ProjectCanvas
          projectId={7}
          projectType="novel"
          apiBaseUrl="http://localhost:24680/api"
          getToken={() => null}
          moduleRenderers={{ ...moduleRenderers, story: () => <StoryModule api={createStoryApiStub()} projectId={7} /> }}
          wiring={wiring}
        />,
      );

      const canvas = await screen.findByTestId("project-canvas-infinite-canvas");
      const shell = screen.getByTestId("project-canvas-shell");
      fireEvent.click(screen.getByRole("button", { name: "打开原文/剧本模块" }));
      const dialog = screen.getByTestId("module-host-story");
      // 等待原文面板异步加载完成，避免 setState 逃逸 act。
      expect(await within(dialog).findByText("雨夜")).toBeInTheDocument();

      // 覆盖层宽度在桌面端固定上限，不随视口宽度无限拉宽。
      expect(dialog.className).toContain("w-[min(52rem,calc(100vw-1.5rem))]");
      // 画布舞台保持全宽锚定，没有被覆盖层挤压/重排。
      const canvasSection = shell.querySelector("section[aria-label='统一项目画布']") as HTMLElement;
      expect(canvasSection.className).toContain("inset-x-0");
      expect(screen.getByTestId("project-canvas-infinite-canvas")).toBe(canvas);

      Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
      fireEvent(window, new Event("resize"));
    },
  );

  it("closes the story module when another stage module opens and vice versa", async () => {
    const { wiring } = createWiring(true);
    render(
      <ProjectCanvas
        projectId={7}
        projectType="novel"
        apiBaseUrl="http://localhost:24680/api"
        getToken={() => null}
        moduleRenderers={{ ...moduleRenderers, story: () => <StoryModule api={createStoryApiStub()} projectId={7} /> }}
        wiring={wiring}
      />,
    );

    const canvas = await screen.findByTestId("project-canvas-infinite-canvas");
    fireEvent.click(screen.getByRole("button", { name: "打开原文/剧本模块" }));
    const storyDialog = screen.getByTestId("module-host-story");
    // 等待原文面板异步加载完成，避免 setState 逃逸 act。
    expect(await within(storyDialog).findByText("雨夜")).toBeInTheDocument();

    // 打开另一个模块：原文/剧本模块自动关闭，模块互斥成立。
    fireEvent.click(screen.getByRole("button", { name: "打开目标模块" }));
    expect(screen.queryByTestId("module-host-story")).not.toBeInTheDocument();
    expect(screen.getByTestId("module-host-goal")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "关闭目标模块" }));

    fireEvent.click(screen.getByRole("button", { name: "打开原文/剧本模块" }));
    const reopened = screen.getByTestId("module-host-story");
    expect(await within(reopened).findByText("雨夜")).toBeInTheDocument();
    expect(screen.getByTestId("project-canvas-infinite-canvas")).toBe(canvas);
  });

  it("removes the bottom canvas command dock and keeps the Agent drawer as the only chat entry", async () => {
    const { wiring } = createWiring(true);
    render(
      <ProjectCanvas
        projectId={7}
        projectType="novel"
        apiBaseUrl="http://localhost:24680/api"
        getToken={() => null}
        moduleRenderers={moduleRenderers}
        wiring={wiring}
      />,
    );

    await screen.findByTestId("project-canvas-node-goal-p1");
    // 全屏画布不再渲染底部命令坞：阶段/范围芯片、伪输入框、定位与发送按钮都不存在。
    expect(screen.queryByTestId("canvas-command-dock")).not.toBeInTheDocument();
    expect(screen.queryByTestId("canvas-command-bar")).not.toBeInTheDocument();
    expect(screen.queryByTestId("canvas-command-stage-chip")).not.toBeInTheDocument();
    expect(screen.queryByTestId("canvas-command-node-chip")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "画布指令" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "发送画布指令" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "聚焦选中节点" })).not.toBeInTheDocument();
    // 打开覆盖层时也不会出现任何命令坞残留。
    fireEvent.click(screen.getByRole("button", { name: "打开项目智能体" }));
    expect(screen.queryByTestId("canvas-command-dock")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "收起项目智能体" }));
    fireEvent.click(screen.getByTestId("project-canvas-node-goal-p1"));
    expect(screen.queryByTestId("canvas-command-dock")).not.toBeInTheDocument();
    // 对话输入只属于右侧 Agent 抽屉。
    expect(screen.getByRole("button", { name: "打开项目智能体" })).toBeInTheDocument();
  });

  it("renders interactive story nodes on a wide card without line-clamped titles or summaries", async () => {
    const { wiring } = createWiring(true);
    render(
      <ProjectCanvas
        projectId={8}
        projectType="interactive"
        apiBaseUrl="http://localhost:24680/api"
        getToken={() => null}
        interactiveGraph={interactiveGraph()}
        moduleRenderers={moduleRenderers}
        wiring={wiring}
      />,
    );

    const storyCard = await screen.findByTestId("project-canvas-node-interactive:story-graph-8:scene-1");
    // 互动剧情卡片比普通生产卡片更宽，标题/摘要不再因卡片过窄而被截断。
    expect(storyCard.className).toContain("w-[400px]");
    // 渲染宽度必须与确定性布局使用的估算宽度一致，保证层级间不重叠。
    const renderedWidth = Number.parseFloat(storyCard.className.match(/w-\[(\d+)px\]/)?.[1] ?? "");
    expect(renderedWidth).toBe(PROJECT_CANVAS_STORY_NODE_SIZE.width);
    const title = within(storyCard).getByText("雨夜开场").closest("h3") as HTMLElement | null;
    expect(title?.className).not.toContain("line-clamp");
    const summary = within(storyCard).getByText("等待观众选择");
    expect(summary.className).not.toContain("line-clamp");
  });
});
