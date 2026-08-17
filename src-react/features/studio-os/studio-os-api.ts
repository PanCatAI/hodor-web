import type { HodorApiClient } from "@react/lib/api/client";

export interface StudioOsTask {
  taskId: string;
  title: string;
  kind: string;
  status: string;
  parentId: string | null;
  childTaskIds: string[];
}

export interface StudioOsSnapshot {
  groups: Array<{ groupId: string; projectId: string; name: string; status: string; revision: number }>;
  assets: Array<{ assetId: string; type: string; status: string }>;
  tasks: StudioOsTask[];
  packets: Array<{ packetId: string; shotId: string; status: string; readiness?: { missingAssetTypes: string[] } }>;
  leases: Array<{ leaseId: string; workerId: string; taskId: string; expiresAt: string }>;
  batches: Array<{ batchId: string; k: number; candidates: Array<{ candidateId: string }> }>;
  verifications: Array<{ verificationId: string; candidateId: string; verdict: "pass" | "fail"; verifierId: string }>;
  events: Array<{ eventId: string; sequence: number; type: string; occurredAt: string }>;
}

export interface StudioOsSnapshotResponse {
  revision: number;
  snapshot: StudioOsSnapshot;
}

export function createStudioOsVnextApi(client: HodorApiClient) {
  return {
    readSnapshot(groupId: string) {
      return client.request<StudioOsSnapshotResponse | null>(`/studio-os-vnext/groups/${encodeURIComponent(groupId)}/snapshot`, { method: "GET" });
    },
  };
}
