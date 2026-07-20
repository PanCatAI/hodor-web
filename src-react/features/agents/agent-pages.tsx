import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import type { HodorApiClient } from "@react/lib/api/client";
import { AgentConsole } from "./agent-console";
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

export function ScriptAgentPage({ projectId, apiClient, apiBaseUrl, getToken, socketFactory, handlers }: AgentPageProps) {
  const showThink = useThinkCapability(apiClient, "scriptAgent");
  const defaultHandlers = useMemo(() => createAgentServerHandlers({ agentType: "scriptAgent", projectId, apiClient }), [apiClient, projectId]);
  const activeHandlers = handlers ?? defaultHandlers;
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

  return <AgentConsole client={client} title="剧本智能体" description="拆分原文、整理故事骨架并形成可生产的剧本。" showThink={showThink} />;
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

export type { AgentPageProps, ProductionAgentPageProps };
