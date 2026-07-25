import type { HodorApiClient } from "@react/lib/api/client";
import type { InteractiveStoryGraph, InteractiveStoryPosition } from "./types";

export interface InteractiveStoryNodePositionUpdate {
  nodeId: string;
  position: InteractiveStoryPosition;
}

function post<T>(client: HodorApiClient, path: string, body: unknown): Promise<T> {
  return client.request<T>(path, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function createInteractiveStoryApi(client: HodorApiClient) {
  return {
    getGraph(projectId: number): Promise<InteractiveStoryGraph | null> {
      return post(client, "/interactiveStory/graph/get", { projectId });
    },
    initializeGraph(projectId: number, title: string): Promise<unknown> {
      return post(client, "/interactiveStory/graph/initialize", { projectId, title });
    },
    updateNodePositions(
      projectId: number,
      graphId: string,
      expectedRevision: number,
      positions: InteractiveStoryNodePositionUpdate[],
    ): Promise<InteractiveStoryGraph> {
      return post(client, "/interactiveStory/graph/nodes/positions", { projectId, graphId, expectedRevision, positions });
    },
  };
}

export type InteractiveStoryApi = ReturnType<typeof createInteractiveStoryApi>;
