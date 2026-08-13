import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import type { HodorApiClient } from "@react/lib/api/client";
import { createStoryApi } from "../story/story-api";
import { parseNovelText, readImportFile } from "../story/import-parser";
import { ProductionGraphConsole, useProductionGraphWiring, useResumeOrRetryOnLegacyFailure } from "../production-graph";
import { AgentConsole } from "./agent-console";
import type { SourceImportRequest, SourceImportResult } from "./agent-console";
import { createAgentChatClient } from "./agent-chat-client";
import { createAgentServerHandlers } from "./agent-server-handlers";
import type { AgentServerHandlers, AgentSocketFactory } from "./types";

interface AgentPageProps {
  projectId: number;
  apiClient: HodorApiClient;
  apiBaseUrl: string;
  getToken: () => string | null;
  socketFactory?: AgentSocketFactory;
  handlers?: AgentServerHandlers;
}

interface ProductionAgentPageProps extends AgentPageProps {
  episodeId: number;
  episodeTitle?: string;
  onFlowDataChange?: () => void;
  onBusyChange?: (busy: boolean) => void;
}

interface ScriptAgentPanelProps extends AgentPageProps {
  onBusyChange?: (busy: boolean) => void;
  selectedNodeId?: string | null;
}

const productionWelcomeMessages = [
  {
    id: "welcome",
    role: "assistant" as const,
    status: "complete" as const,
    datetime: "",
    content: [
      { type: "text", status: "complete" as const, data: "你好！我是你的 AI 助手，有什么可以帮你的吗？" },
      { type: "suggestion", status: "complete" as const, data: [{ title: "开始制作视频", prompt: "请帮我开始制作视频" }] },
    ],
  },
];

const interactiveWelcomeMessages = [
  {
    id: "interactive-welcome",
    role: "assistant" as const,
    status: "complete" as const,
    datetime: "",
    content: [
      {
        type: "text",
        status: "complete" as const,
        data: "你好，我会陪你把故事想法或原文整理成可以直接生产的分支互动剧。",
      },
      {
        type: "text",
        status: "complete" as const,
        data: "你可以导入已有原文、从一个故事想法开始，或者让我先读取当前画布并给出下一步。",
      },
      {
        type: "suggestion",
        status: "complete" as const,
        data: [
          {
            title: "我有一份原文",
            prompt: "我有一份原文，请告诉我如何导入，并引导我把它改编成带分支的互动剧。",
          },
          {
            title: "从故事想法开始",
            prompt: "我想从一个故事想法开始，请逐步提问，并帮我建立第一版互动剧情图。",
          },
          {
            title: "检查当前进度",
            prompt: "请读取当前项目和互动剧情画布，概括已有内容，并告诉我最应该继续完成什么。",
          },
        ],
      },
    ],
  },
];

function AgentBusyReporter({ client, onBusyChange }: { client: ReturnType<typeof createAgentChatClient>; onBusyChange?: (busy: boolean) => void }) {
  const snapshot = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  const busy = snapshot.activity === "pending" || snapshot.activity === "streaming";

  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);

  useEffect(
    () => () => {
      onBusyChange?.(false);
    },
    [onBusyChange],
  );

  return null;
}

function useThinkCapability(apiClient: HodorApiClient, key: "scriptAgent" | "productionAgent") {
  const [showThink, setShowThink] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void apiClient
      .request<{ think?: boolean }>("/project/getModelDetails", {
        method: "POST",
        body: JSON.stringify({ key }),
      })
      .then((model) => {
        if (!cancelled) setShowThink(model?.think === true);
      })
      .catch(() => {
        if (!cancelled) setShowThink(false);
      });
    return () => {
      cancelled = true;
    };
  }, [apiClient, key]);

  return showThink;
}

function useEpisodeTitle(apiClient: HodorApiClient, projectId: number, episodeId: number, initialTitle?: string) {
  const [title, setTitle] = useState(initialTitle ?? "");

  useEffect(() => {
    let cancelled = false;
    if (initialTitle) setTitle(initialTitle);
    void apiClient
      .request<unknown[]>("/script/getScrptApi", {
        method: "POST",
        body: JSON.stringify({ projectId, name: "" }),
      })
      .then((scripts) => {
        if (cancelled) return;
        const current = Array.isArray(scripts)
          ? scripts.find((item) => item && typeof item === "object" && Number((item as Record<string, unknown>).id) === episodeId)
          : undefined;
        const nameValue = current && typeof current === "object" ? (current as Record<string, unknown>).name : undefined;
        const name = typeof nameValue === "string" ? nameValue : "";
        setTitle(name || initialTitle || `剧本 ${episodeId}`);
      })
      .catch(() => {
        if (!cancelled) setTitle((current) => current || initialTitle || `剧本 ${episodeId}`);
      });
    return () => {
      cancelled = true;
    };
  }, [apiClient, episodeId, initialTitle, projectId]);

  return title;
}

function useSourceImporter(apiClient: HodorApiClient, projectId: number) {
  const storyApi = useMemo(() => createStoryApi(apiClient), [apiClient]);
  return useCallback(
    async (source: SourceImportRequest): Promise<SourceImportResult> => {
      const rawText = source.file ? await readImportFile(source.file) : source.text?.trim() ?? "";
      if (!rawText) throw new Error("原文内容不能为空");
      const chapters = parseNovelText(rawText);
      if (!chapters.length) throw new Error("没有解析到可导入的原文");
      await storyApi.importNovels(projectId, chapters);
      return {
        sourceName: source.file?.name.replace(/\.[^.]+$/, "") || "粘贴原文",
        chapterCount: chapters.length,
      };
    },
    [projectId, storyApi],
  );
}

export function ScriptAgentPage({ projectId, apiClient, apiBaseUrl, getToken, socketFactory, handlers }: AgentPageProps) {
  const showThink = useThinkCapability(apiClient, "scriptAgent");
  const defaultHandlers = useMemo(() => createAgentServerHandlers({ agentType: "scriptAgent", projectId, apiClient }), [apiClient, projectId]);
  const activeHandlers = handlers ?? defaultHandlers;
  const importSource = useSourceImporter(apiClient, projectId);
  const client = useMemo(
    () =>
      createAgentChatClient({
        agentType: "scriptAgent",
        projectId,
        apiClient,
        apiBaseUrl,
        getToken,
        socketFactory,
        handlers: activeHandlers,
      }),
    [activeHandlers, apiBaseUrl, apiClient, getToken, projectId, socketFactory],
  );

  return (
    <AgentConsole
      client={client}
      title="剧本智能体"
      description="拆分原文、整理故事骨架并形成可生产的剧本。"
      showThink={showThink}
      onImportSource={importSource}
    />
  );
}

export function ScriptAgentPanel({
  projectId,
  apiClient,
  apiBaseUrl,
  getToken,
  socketFactory,
  handlers,
  onBusyChange,
  selectedNodeId,
}: ScriptAgentPanelProps) {
  // ProductionGraph v1 wiring — connects to /api/socket/productionGraph, carries
  // graphId/revision/selectedNodeId/checkpointId into the chat context, and renders
  // the control console alongside the agent panel. When the feature flag is off,
  // the wiring is a no-op and the legacy fixed-stage path stays authoritative.
  const productionGraph = useProductionGraphWiring({
    projectId,
    apiBaseUrl,
    getToken,
    initialSelectedNodeId: selectedNodeId ?? null,
  });

  // Bridge the production graph context into the chat client. The callback reads the
  // live bridge each call so the latest selection/revision is sent with every message.
  const messageContext = useCallback(
    () => productionGraph.contextBridge() as Record<string, unknown> | undefined,
    [productionGraph.contextBridge],
  );

  const showThink = useThinkCapability(apiClient, "scriptAgent");
  const defaultHandlers = useMemo(() => createAgentServerHandlers({ agentType: "scriptAgent", projectId, apiClient }), [apiClient, projectId]);
  const activeHandlers = handlers ?? defaultHandlers;
  const importSource = useSourceImporter(apiClient, projectId);
  const client = useMemo(
    () =>
      createAgentChatClient({
        agentType: "scriptAgent",
        projectId,
        apiClient,
        apiBaseUrl,
        getToken,
        socketFactory,
        handlers: activeHandlers,
        initialMessages: interactiveWelcomeMessages,
        messageContext,
      }),
    [activeHandlers, apiBaseUrl, apiClient, getToken, messageContext, projectId, socketFactory],
  );

  // When the ProductionGraph v1 feature is on, recover retryable productionRun failures
  // by dispatching resumeOrRetry with an idempotency key — instead of synthesizing chat
  // text. The legacy synthesized-recovery path stays as a fallback for when the feature
  // is off, so we don't touch the user's uncommitted agent-chat-client logic.
  useResumeOrRetryOnLegacyFailure({
    store: productionGraph.store,
    dispatcher: productionGraph.dispatcher,
    featureEnabled: productionGraph.featureEnabled,
  });

  return (
    <>
      <AgentBusyReporter client={client} onBusyChange={onBusyChange} />
      <AgentConsole client={client} title="互动剧智能体" showThink={showThink} display="panel" onImportSource={importSource} />
      {productionGraph.featureEnabled ? (
        <ProductionGraphConsole
          store={productionGraph.store}
          dispatcher={productionGraph.dispatcher}
          contextBridge={productionGraph.contextBridge}
          featureLabel="feature on"
        />
      ) : null}
    </>
  );
}

export function ProductionAgentPage({
  projectId,
  episodeId,
  apiClient,
  apiBaseUrl,
  getToken,
  socketFactory,
  handlers,
  episodeTitle,
  onFlowDataChange,
}: ProductionAgentPageProps) {
  const showThink = useThinkCapability(apiClient, "productionAgent");
  const title = useEpisodeTitle(apiClient, projectId, episodeId, episodeTitle);
  const defaultHandlers = useMemo(
    () => createAgentServerHandlers({ agentType: "productionAgent", projectId, episodeId, apiClient, onFlowDataChange }),
    [apiClient, episodeId, onFlowDataChange, projectId],
  );
  const activeHandlers = handlers ?? defaultHandlers;
  const client = useMemo(
    () =>
      createAgentChatClient({
        agentType: "productionAgent",
        projectId,
        episodeId,
        apiClient,
        apiBaseUrl,
        getToken,
        socketFactory,
        handlers: activeHandlers,
        initialMessages: productionWelcomeMessages,
      }),
    [activeHandlers, apiBaseUrl, apiClient, episodeId, getToken, projectId, socketFactory],
  );

  return <AgentConsole client={client} title={title} description="协调资产、分镜、视频和后续生产任务。" showThink={showThink} />;
}

export function ProductionAgentPanel({
  projectId,
  episodeId,
  apiClient,
  apiBaseUrl,
  getToken,
  socketFactory,
  handlers,
  episodeTitle,
  onFlowDataChange,
  onBusyChange,
}: ProductionAgentPageProps) {
  const showThink = useThinkCapability(apiClient, "productionAgent");
  const title = useEpisodeTitle(apiClient, projectId, episodeId, episodeTitle);
  const defaultHandlers = useMemo(
    () => createAgentServerHandlers({ agentType: "productionAgent", projectId, episodeId, apiClient, onFlowDataChange }),
    [apiClient, episodeId, onFlowDataChange, projectId],
  );
  const activeHandlers = handlers ?? defaultHandlers;
  const client = useMemo(
    () =>
      createAgentChatClient({
        agentType: "productionAgent",
        projectId,
        episodeId,
        apiClient,
        apiBaseUrl,
        getToken,
        socketFactory,
        handlers: activeHandlers,
        initialMessages: productionWelcomeMessages,
      }),
    [activeHandlers, apiBaseUrl, apiClient, episodeId, getToken, projectId, socketFactory],
  );

  return (
    <>
      <AgentBusyReporter client={client} onBusyChange={onBusyChange} />
      <AgentConsole client={client} title={title} showThink={showThink} display="panel" />
    </>
  );
}

export type { AgentPageProps, ProductionAgentPageProps, ScriptAgentPanelProps };
