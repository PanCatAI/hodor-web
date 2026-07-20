import { useMemo } from "react";

import type { HodorApiClient } from "@react/lib/api/client";
import { AgentConsole } from "./agent-console";
import { createAgentChatClient } from "./agent-chat-client";
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
  const client = useMemo(
    () => createAgentChatClient({ agentType: "scriptAgent", projectId, apiClient, apiBaseUrl, getToken, socketFactory, handlers }),
    [apiBaseUrl, apiClient, getToken, handlers, projectId, socketFactory],
  );

  return <AgentConsole client={client} title="剧本智能体" description="拆分原文、整理故事骨架并形成可生产的剧本。" />;
}

export function ProductionAgentPage({ projectId, episodeId, apiClient, apiBaseUrl, getToken, socketFactory, handlers }: ProductionAgentPageProps) {
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
        handlers,
      }),
    [apiBaseUrl, apiClient, episodeId, getToken, handlers, projectId, socketFactory],
  );

  return <AgentConsole client={client} title="生产智能体" description="协调资产、分镜、视频和后续生产任务。" />;
}

export type { AgentPageProps, ProductionAgentPageProps };
