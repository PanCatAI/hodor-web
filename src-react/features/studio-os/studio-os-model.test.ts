import { describe, expect, it } from "vitest";

import { deriveControlRoom, deriveEvolutionStates, normalizeStudioSnapshot } from "./studio-os-model";
import type { StudioOsSnapshot } from "./studio-os-types";

const baseSnapshot: StudioOsSnapshot = {
  schemaVersion: "1",
  groups: [
    { schemaVersion: "1", groupId: "group-a", projectId: "7", name: "主项目组", status: "active", revision: 4, createdAt: "2026-08-11T00:00:00.000Z", updatedAt: "2026-08-11T00:00:00.000Z" },
  ],
  assets: [
    { schemaVersion: "1", assetId: "asset-a", groupId: "group-a", type: "character", contentRef: "asset://ada", contentHash: "hash-a", status: "active", provenance: { source: "human", sourceRef: "brief" }, invalidatedAt: null, invalidationReason: null, createdAt: "2026-08-11T00:00:00.000Z", updatedAt: "2026-08-11T00:00:00.000Z" },
    { schemaVersion: "1", assetId: "asset-leak", groupId: "group-b", type: "video", contentRef: "asset://other", contentHash: "hash-b", status: "active", provenance: { source: "human", sourceRef: "other" }, invalidatedAt: null, invalidationReason: null, createdAt: "2026-08-11T00:00:00.000Z", updatedAt: "2026-08-11T00:00:00.000Z" },
  ],
  tasks: [
    { schemaVersion: "1", taskId: "task-root", groupId: "group-a", parentId: null, kind: "root", title: "故事室决定", status: "adopted", contract: { version: "contract:v1", requiredAssetTypes: ["character"], acceptance: ["独立验证"], constraints: {} }, inputAssetIds: ["asset-a"], outputAssetIds: [], childTaskIds: ["task-failed"], activeLeaseId: null, createdAt: "2026-08-11T00:00:00.000Z", updatedAt: "2026-08-11T00:00:00.000Z" },
    { schemaVersion: "1", taskId: "task-failed", groupId: "group-a", parentId: "task-root", kind: "gate", title: "导演室验证", status: "failed", contract: { version: "contract:v1", requiredAssetTypes: ["character"], acceptance: ["独立验证"], constraints: {} }, inputAssetIds: ["asset-a"], outputAssetIds: [], childTaskIds: [], activeLeaseId: null, createdAt: "2026-08-11T00:00:00.000Z", updatedAt: "2026-08-11T00:00:00.000Z" },
  ],
  decisions: [{ schemaVersion: "1", decisionId: "decision-a", groupId: "group-a", subjectId: "task-root", actorRef: "story-room", outcome: "approved", rationale: "保留镜头意图", evidenceRefs: ["evidence:brief"], createdAt: "2026-08-11T00:00:00.000Z" }],
  packets: [{ schemaVersion: "1", packetId: "packet-a", groupId: "group-a", taskId: "task-failed", shotId: "shot-001", assetIds: ["asset-a"], status: "invalidated", readiness: { requiredAssetTypes: ["character"], missingAssetTypes: [], contractVersion: "contract:v1" }, createdAt: "2026-08-11T00:00:00.000Z", updatedAt: "2026-08-11T00:00:00.000Z" }],
  leases: [{ schemaVersion: "1", leaseId: "lease-a", taskId: "task-failed", workerId: "worker-a", acquiredAt: "2026-08-11T00:00:00.000Z", heartbeatAt: "2026-08-11T00:00:00.000Z", expiresAt: "2026-08-11T00:10:00.000Z" }],
  batches: [{ schemaVersion: "1", batchId: "batch-a", taskId: "task-failed", packetId: "packet-a", leaseId: "lease-a", k: 1, candidates: [{ candidateId: "candidate-a", contentRef: "asset://candidate", contentHash: "hash-c" }], createdAt: "2026-08-11T00:00:00.000Z" }],
  verifications: [{ schemaVersion: "1", verificationId: "verify-a", batchId: "batch-a", candidateId: "candidate-a", verifierId: "independent-verifier", verdict: "fail", evidenceRefs: ["evidence:failure"], createdAt: "2026-08-11T00:00:00.000Z" }],
  events: [
    { schemaVersion: "1", eventId: "event-replay", sequence: 1, type: "evolution.replay.completed", aggregateType: "evolution", aggregateId: "replay-1", idempotencyKey: null, payload: { evidenceRefs: ["evidence:replay"] }, occurredAt: "2026-08-11T00:00:00.000Z" },
    { schemaVersion: "1", eventId: "event-shadow", sequence: 2, type: "evolution.shadow.started", aggregateType: "evolution", aggregateId: "shadow-1", idempotencyKey: null, payload: { evidenceRef: "evidence:shadow" }, occurredAt: "2026-08-11T00:01:00.000Z" },
  ],
  idempotency: [],
};

describe("Studio OS control-room model", () => {
  it("keeps every collection inside the requested project group", () => {
    const scoped = normalizeStudioSnapshot(baseSnapshot, "group-a");
    expect(scoped.assets.map((asset) => asset.assetId)).toEqual(["asset-a"]);
    expect(scoped.groups.map((group) => group.groupId)).toEqual(["group-a"]);
    expect(scoped.tasks.every((task) => task.groupId === "group-a")).toBe(true);
  });

  it("aggregates failed verification and invalidation impact without losing evidence", () => {
    const model = deriveControlRoom(normalizeStudioSnapshot(baseSnapshot, "group-a"), "group-a");
    expect(model.verificationFailures).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "verify-a", evidenceRefs: ["evidence:failure"] }),
      expect.objectContaining({ id: "task-failed", title: "导演室验证" }),
    ]));
    expect(model.impactForAsset("asset-a").map((task) => task.taskId)).toEqual(["task-root", "task-failed"]);
  });

  it("derives evolution state from ordered authority events and exposes evidence refs", () => {
    expect(deriveEvolutionStates(baseSnapshot.events)).toMatchObject({
      replay: { status: "completed", evidenceRefs: ["evidence:replay"], eventId: "event-replay" },
      shadow: { status: "started", evidenceRefs: ["evidence:shadow"], eventId: "event-shadow" },
      canary: { status: "not_reported", evidenceRefs: [] },
      rollback: { status: "not_reported", evidenceRefs: [] },
    });
  });
});
