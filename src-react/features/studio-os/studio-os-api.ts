import type { HodorApiClient } from "@react/lib/api/client";
import type { StudioSnapshotResponse } from "./studio-os-types";

interface RequestClient { request(path: string, init?: RequestInit): Promise<unknown> }

function groupPath(groupId: string, suffix: string): string {
  return `/studio-os-vnext/groups/${encodeURIComponent(groupId)}${suffix}`;
}

function post(body: Record<string, unknown>): RequestInit {
  return { method: "POST", body: JSON.stringify(body) };
}

export function createStudioOsApi(client: RequestClient | HodorApiClient) {
  return {
    getSnapshot(groupId: string) {
      return client.request(groupPath(groupId, "/snapshot")) as Promise<StudioSnapshotResponse>;
    },
    getEvidence(groupId: string) {
      return client.request(groupPath(groupId, "/epyc/evidence"));
    },
    adoptCandidate(input: { groupId: string; taskId: string; batchId: string; candidateId: string; idempotencyKey: string }) {
      return client.request(groupPath(input.groupId, "/adoptions"), post(input));
    },
    rollbackAdoption(input: { groupId: string; taskId: string; actorRef: string; idempotencyKey: string }) {
      return client.request(groupPath(input.groupId, "/rollbacks"), post(input));
    },
  };
}

export type StudioOsApi = ReturnType<typeof createStudioOsApi>;
