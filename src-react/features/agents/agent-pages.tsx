import { useMemo } from "react";

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
}

export function ScriptAgentPage({ projectId, apiClient, apiBaseUrl, getToken, socketFactory, handlers }: AgentPageProps) {
  const defaultHandlers = useMemo(
    () => createAgentServerHandlers({ agentType: "scriptAgent", projectId, apiClient }),
    [apiClient, projectId],
  );
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

  return <AgentConsole client={client} title="剧本智能体" description="拆分原文、整理故事骨架并形成可生产的剧本。" />;
}

export function ProductionAgentPage({ projectId, episodeId, apiClient, apiBaseUrl, getToken, socketFactory, handlers }: ProductionAgentPageProps) {
  const defaultHandlers = useMemo(
    () => createAgentServerHandlers({ agentType: "productionAgent", projectId, episodeId, apiClient }),
    [apiClient, episodeId, projectId],
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
      }),
    [activeHandlers, apiBaseUrl, apiClient, episodeId, getToken, projectId, socketFactory],
  );

  return <AgentConsole client={client} title="生产智能体" description="协调资产、分镜、视频和后续生产任务。" />;
}

export type { AgentPageProps, ProductionAgentPageProps };
