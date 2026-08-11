export type StudioTaskStatus = "draft" | "ready" | "leased" | "generating" | "verifying" | "adopted" | "invalidated" | "failed";
export type StudioEvolutionStage = "replay" | "shadow" | "canary" | "rollback";

export interface StudioProjectGroup {
  schemaVersion: "1";
  groupId: string;
  projectId: string;
  name: string;
  status: "active" | "archived";
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export type StudioAssetType = "source_text" | "character" | "location" | "prop" | "style" | "audio" | "image" | "video" | "shot_video" | "evidence";

export interface StudioAsset {
  schemaVersion: "1";
  assetId: string;
  groupId: string;
  type: StudioAssetType;
  contentRef: string;
  contentHash: string;
  status: "active" | "invalidated";
  provenance: { source: "human" | "legacy_adapter" | "candidate_adoption"; sourceRef: string };
  invalidatedAt: string | null;
  invalidationReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StudioTaskContract {
  version: string;
  requiredAssetTypes: StudioAssetType[];
  acceptance: string[];
  constraints: Record<string, unknown>;
}

export interface StudioTask {
  schemaVersion: "1";
  taskId: string;
  groupId: string;
  parentId: string | null;
  kind: "root" | "composite" | "work" | "gate" | "review";
  title: string;
  status: StudioTaskStatus;
  contract: StudioTaskContract;
  inputAssetIds: string[];
  outputAssetIds: string[];
  childTaskIds: string[];
  activeLeaseId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StudioDecision {
  schemaVersion: "1";
  decisionId: string;
  groupId: string;
  subjectId: string;
  actorRef: string;
  outcome: "proposed" | "approved" | "rejected" | "superseded";
  rationale: string;
  evidenceRefs: string[];
  createdAt: string;
}

export interface StudioShotPacket {
  schemaVersion: "1";
  packetId: string;
  groupId: string;
  taskId: string;
  shotId: string;
  assetIds: string[];
  status: "draft" | "production_ready" | "leased" | "generating" | "adopted" | "invalidated";
  readiness: { requiredAssetTypes: StudioAssetType[]; missingAssetTypes: StudioAssetType[]; contractVersion: string };
  createdAt: string;
  updatedAt: string;
}

export interface StudioLease {
  schemaVersion: "1";
  leaseId: string;
  taskId: string;
  workerId: string;
  acquiredAt: string;
  heartbeatAt: string;
  expiresAt: string;
}

export interface StudioCandidateBatch {
  schemaVersion: "1";
  batchId: string;
  taskId: string;
  packetId: string;
  leaseId: string;
  k: number;
  candidates: Array<{ candidateId: string; contentRef: string; contentHash: string }>;
  createdAt: string;
}

export interface StudioVerification {
  schemaVersion: "1";
  verificationId: string;
  batchId: string;
  candidateId: string;
  verifierId: string;
  verdict: "pass" | "fail";
  evidenceRefs: string[];
  createdAt: string;
}

export interface StudioEvent {
  schemaVersion: "1";
  eventId: string;
  sequence: number;
  type: string;
  aggregateType: string;
  aggregateId: string;
  idempotencyKey: string | null;
  payload: Record<string, unknown>;
  occurredAt: string;
}

export interface StudioOsSnapshot {
  schemaVersion: "1";
  groups: StudioProjectGroup[];
  assets: StudioAsset[];
  tasks: StudioTask[];
  decisions: StudioDecision[];
  packets: StudioShotPacket[];
  leases: StudioLease[];
  batches: StudioCandidateBatch[];
  verifications: StudioVerification[];
  events: StudioEvent[];
  idempotency: Array<[string, string]>;
}

export interface StudioSnapshotResponse {
  revision: number;
  snapshot: StudioOsSnapshot;
}
