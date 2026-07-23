import { describe, expect, it, vi } from "vitest";

import type { HodorApiClient } from "@react/lib/api/client";
import { createAgentServerHandlers } from "./agent-server-handlers";

function createClient() {
  const request = vi.fn();
  return { client: { request } as unknown as HodorApiClient, request };
}

describe("createAgentServerHandlers", () => {
  it("persists planning work while leaving generated script persistence to the backend", async () => {
    const { client, request } = createClient();
    request
      .mockResolvedValueOnce({
        id: 41,
        data: { storySkeleton: "旧骨架", adaptationStrategy: "旧策略", script: [{ id: 9, name: "第一集", content: "旧内容" }] },
      })
      .mockResolvedValueOnce(undefined);
    const handlers = createAgentServerHandlers({ agentType: "scriptAgent", projectId: 7, apiClient: client });

    await expect(handlers.getPlanData?.({ key: "script" })).resolves.toEqual({
      storySkeleton: "旧骨架",
      adaptationStrategy: "旧策略",
      script: [{ id: 9, name: "第一集", content: "旧内容" }],
    });
    await handlers.onWorkDataTag?.({ tag: "storySkeleton", value: "新骨架", attrs: {}, status: "complete" });
    await handlers.onWorkDataTag?.({ tag: "scriptItem", value: "新内容", attrs: { name: "第一集" }, status: "complete" });

    expect(request).toHaveBeenNthCalledWith(1, "/scriptAgent/getPlanData", {
      method: "POST",
      body: JSON.stringify({ projectId: 7, agentType: "scriptAgent" }),
    });
    expect(request).toHaveBeenNthCalledWith(2, "/scriptAgent/setPlanData", {
      method: "POST",
      body: JSON.stringify({
        projectId: 7,
        agentType: "scriptAgent",
        data: { storySkeleton: "新骨架", adaptationStrategy: "旧策略", script: [{ id: 9, name: "第一集", content: "旧内容" }] },
      }),
    });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("binds production callbacks to flow, asset, storyboard, and save endpoints", async () => {
    const { client, request } = createClient();
    const initialFlow = {
      script: "第一幕",
      scriptPlan: "旧计划",
      storyboardTable: "旧分镜表",
      assets: [{ id: 1, type: "role", derive: [] }],
      storyboard: [],
      workbench: { videoList: [] },
    };
    const flowWithDerivedAsset = {
      ...initialFlow,
      assets: [{ id: 1, type: "role", derive: [{ id: 21, assetsId: 1, name: "雨衣", desc: "黄色雨衣", type: "role" }] }],
    };
    const flowWithStoryboard = {
      ...flowWithDerivedAsset,
      storyboard: [{ id: 31, prompt: "雨夜街口", state: "未生成" }],
    };
    let flowReads = 0;
    request.mockImplementation(async (path: string) => {
      if (path === "/production/getFlowData") {
        flowReads += 1;
        if (flowReads === 1) return initialFlow;
        if (flowReads === 2) return flowWithDerivedAsset;
        return flowWithStoryboard;
      }
      if (path === "/production/saveFlowData") return undefined;
      if (path === "/production/assets/batchGenerateAssetsImage") return "开始生成资产图片";
      if (path === "/production/storyboard/batchGenerateImage") return [{ id: 31, state: "生成中" }];
      if (path === "/production/storyboard/batchAddStoryboardInfo") return [{ id: 31, prompt: "雨夜街口", state: "未生成" }];
      throw new Error(`未预期接口 ${path}`);
    });
    const handlers = createAgentServerHandlers({
      agentType: "productionAgent",
      projectId: 7,
      episodeId: 12,
      apiClient: client,
      concurrentCount: 3,
    });

    await expect(handlers.getFlowData?.({ key: "assets" })).resolves.toEqual({
      ...initialFlow,
      assets: [{ id: 1, type: "role", derive: [] }],
    });
    await expect(handlers.addDeriveAsset?.({ assetsId: 1, id: 21 })).resolves.toEqual({
      success: true,
      message: "衍生资产已保存",
    });
    await handlers.generateDeriveAsset?.({ ids: [21] });
    await handlers.generateStoryboard?.({ ids: [31] });
    await expect(
      handlers.addStoryboard?.({
        videoDesc: "雨夜重逢",
        prompt: "雨夜街口",
        track: "主线",
        duration: 5,
        associateAssetsIds: [21],
        shouldGenerateImage: "true",
      }),
    ).resolves.toEqual({ success: true, message: "分镜已保存" });

    expect(request).toHaveBeenCalledWith("/production/assets/batchGenerateAssetsImage", {
      method: "POST",
      body: JSON.stringify({ assetIds: [21], projectId: 7, scriptId: 12, concurrentCount: 3 }),
    });
    expect(request).toHaveBeenCalledWith("/production/storyboard/batchGenerateImage", {
      method: "POST",
      body: JSON.stringify({ storyboardIds: [31], projectId: 7, scriptId: 12, concurrentCount: 3, compulsory: true }),
    });
    expect(request).toHaveBeenCalledWith("/production/storyboard/batchAddStoryboardInfo", {
      method: "POST",
      body: JSON.stringify({
        projectId: 7,
        scriptId: 12,
        data: [
          {
            prompt: "雨夜街口",
            duration: 5,
            track: "主线",
            state: "未生成",
            src: null,
            videoDesc: "雨夜重逢",
            shouldGenerateImage: 1,
            associateAssetsIds: [21],
          },
        ],
      }),
    });
    expect(request).toHaveBeenLastCalledWith("/production/saveFlowData", {
      method: "POST",
      body: JSON.stringify({ projectId: 7, episodesId: 12, data: flowWithStoryboard }),
    });
  });

  it("reports REST failures as explicit callback failures", async () => {
    const { client, request } = createClient();
    request.mockRejectedValueOnce(new Error("资产生成接口不可用"));
    const handlers = createAgentServerHandlers({ agentType: "productionAgent", projectId: 7, episodeId: 12, apiClient: client });

    await expect(handlers.generateDeriveAsset?.({ ids: [21] })).rejects.toThrow("资产生成接口不可用");
  });

  it("removes internal prompt, flow, and material URL fields from production agent context", async () => {
    const { client, request } = createClient();
    request.mockResolvedValueOnce({
      script: "第一幕",
      scriptPlan: "计划",
      storyboardTable: "表格",
      assets: [
        {
          id: 1,
          name: "角色",
          prompt: "内部提示词",
          flowId: 91,
          src: "https://private/role.png",
          derive: [{ id: 21, name: "雨衣", prompt: "衍生提示词", flowId: 92, src: "https://private/derive.png" }],
        },
      ],
      storyboard: [{ id: 31, videoDesc: "雨夜", prompt: "分镜提示词", flowId: 93, src: "https://private/shot.png" }],
    });
    const handlers = createAgentServerHandlers({ agentType: "productionAgent", projectId: 7, episodeId: 12, apiClient: client });

    const result = await handlers.getFlowData?.({ key: "storyboard" });

    expect(result).toEqual({
      script: "第一幕",
      scriptPlan: "计划",
      storyboardTable: "表格",
      assets: [{ id: 1, name: "角色", derive: [{ id: 21, name: "雨衣" }] }],
      storyboard: [{ id: 31, videoDesc: "雨夜" }],
    });
  });

  it("recovers server-side unfinished generations and backs off after polling errors", async () => {
    const { client, request } = createClient();
    const delays: number[] = [];
    const onFlowDataChange = vi.fn();
    let assetPolls = 0;
    request.mockImplementation(async (path: string) => {
      if (path === "/production/getFlowData") {
        return {
          script: "第一幕",
          scriptPlan: "",
          storyboardTable: "",
          assets: [{ id: 1, derive: [{ id: 21, state: "生成中" }] }],
          storyboard: [{ id: 31, state: "生成中" }],
        };
      }
      if (path === "/production/assets/pollingImage") {
        assetPolls += 1;
        if (assetPolls === 1) throw new Error("临时网络错误");
        return [{ id: 21, state: "已完成", src: "https://cdn/asset.png" }];
      }
      if (path === "/production/storyboard/pollingImage") return [{ id: 31, state: "已完成", src: "https://cdn/shot.png" }];
      if (path === "/production/saveFlowData") return undefined;
      throw new Error(`未预期接口 ${path}`);
    });
    const handlers = createAgentServerHandlers({
      agentType: "productionAgent",
      projectId: 7,
      episodeId: 12,
      apiClient: client,
      recoveryDelay: async (milliseconds) => {
        delays.push(milliseconds);
      },
      onFlowDataChange,
    });

    await handlers.restoreWorkData?.();

    expect(delays).toEqual([1000]);
    expect(assetPolls).toBe(2);
    expect(request).toHaveBeenCalledWith("/production/assets/pollingImage", {
      method: "POST",
      body: JSON.stringify({ ids: [21] }),
    });
    expect(request).toHaveBeenCalledWith("/production/storyboard/pollingImage", {
      method: "POST",
      body: JSON.stringify({ ids: [31] }),
    });
    expect(request).toHaveBeenCalledWith(
      "/production/saveFlowData",
      expect.objectContaining({ body: expect.stringContaining("https://cdn/shot.png") }),
    );
    expect(onFlowDataChange).toHaveBeenCalledOnce();
  });

  it("acknowledges generation submission before continuing server-backed recovery", async () => {
    const { client, request } = createClient();
    request.mockImplementation(async (path: string) => {
      if (path === "/production/assets/batchGenerateAssetsImage") return "开始生成资产图片";
      if (path === "/production/getFlowData") {
        return {
          script: "第一幕",
          scriptPlan: "",
          storyboardTable: "",
          assets: [{ id: 1, derive: [{ id: 21, state: "生成中" }] }],
          storyboard: [],
        };
      }
      if (path === "/production/assets/pollingImage") return [{ id: 21, state: "已完成", src: "https://cdn/asset.png" }];
      if (path === "/production/saveFlowData") return undefined;
      throw new Error(`未预期接口 ${path}`);
    });
    const handlers = createAgentServerHandlers({ agentType: "productionAgent", projectId: 7, episodeId: 12, apiClient: client });

    await expect(handlers.generateDeriveAsset?.({ ids: [21] })).resolves.toBe("开始生成资产图片");
    await vi.waitFor(() => expect(request).toHaveBeenCalledWith("/production/getFlowData", expect.anything()));
    await vi.waitFor(() =>
      expect(request).toHaveBeenCalledWith(
        "/production/saveFlowData",
        expect.objectContaining({ body: expect.stringContaining("https://cdn/asset.png") }),
      ),
    );
  });

  it("moves the REST handler context when the selected production episode changes", async () => {
    const { client, request } = createClient();
    request.mockResolvedValue({ script: "第二幕", assets: [], storyboard: [] });
    const handlers = createAgentServerHandlers({ agentType: "productionAgent", projectId: 7, episodeId: 12, apiClient: client });

    handlers.updateContext?.({ projectId: 7, episodeId: 18 });
    await handlers.getFlowData?.({ key: "script" });

    expect(request).toHaveBeenCalledWith("/production/getFlowData", {
      method: "POST",
      body: JSON.stringify({ projectId: 7, episodesId: 18 }),
    });
  });

  it("does not let a recovery delay block later agent callbacks", async () => {
    const { client, request } = createClient();
    let flowReads = 0;
    request.mockImplementation(async (path: string) => {
      if (path === "/production/assets/batchGenerateAssetsImage") return "开始生成资产图片";
      if (path === "/production/getFlowData") {
        flowReads += 1;
        return flowReads === 1
          ? { script: "第一幕", assets: [{ id: 1, derive: [{ id: 21, state: "生成中" }] }], storyboard: [] }
          : { script: "第一幕", assets: [], storyboard: [{ id: 31, state: "未生成" }] };
      }
      if (path === "/production/assets/pollingImage") return [];
      if (path === "/production/storyboard/batchAddStoryboardInfo") return [{ id: 31 }];
      if (path === "/production/saveFlowData") return undefined;
      throw new Error(`未预期接口 ${path}`);
    });
    const handlers = createAgentServerHandlers({
      agentType: "productionAgent",
      projectId: 7,
      episodeId: 12,
      apiClient: client,
      recoveryDelay: () => new Promise(() => undefined),
    });
    await handlers.generateDeriveAsset?.({ ids: [21] });
    await vi.waitFor(() => expect(request).toHaveBeenCalledWith("/production/assets/pollingImage", expect.anything()));

    const added = handlers.addStoryboard?.({
      videoDesc: "雨夜",
      prompt: "雨夜街口",
      track: "主线",
      duration: 5,
      associateAssetsIds: [],
      shouldGenerateImage: "true",
    });

    await vi.waitFor(() => expect(request).toHaveBeenCalledWith("/production/storyboard/batchAddStoryboardInfo", expect.anything()));
    await expect(added).resolves.toEqual({ success: true, message: "分镜已保存" });
    handlers.stopRecovery?.();
  });

  it("notifies the shared canvas after production work tags are persisted", async () => {
    const { client, request } = createClient();
    const onFlowDataChange = vi.fn();
    request
      .mockResolvedValueOnce({ script: "旧原文", scriptPlan: "旧计划", storyboardTable: "旧分镜表", assets: [], storyboard: [] })
      .mockResolvedValueOnce(undefined);
    const handlers = createAgentServerHandlers({
      agentType: "productionAgent",
      projectId: 7,
      episodeId: 12,
      apiClient: client,
      onFlowDataChange,
    });

    await handlers.onWorkDataTag?.({ tag: "scriptPlan", value: "智能体写入的新计划", attrs: {}, status: "complete" });

    expect(request).toHaveBeenLastCalledWith("/production/saveFlowData", {
      method: "POST",
      body: JSON.stringify({
        projectId: 7,
        episodesId: 12,
        data: { script: "旧原文", scriptPlan: "智能体写入的新计划", storyboardTable: "旧分镜表", assets: [], storyboard: [] },
      }),
    });
    expect(onFlowDataChange).toHaveBeenCalledOnce();
  });
});
