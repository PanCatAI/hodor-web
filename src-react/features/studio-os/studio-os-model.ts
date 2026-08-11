import type { StudioEvent, StudioEvolutionStage, StudioOsSnapshot, StudioTask, StudioVerification } from "./studio-os-types";

const EVOLUTION_STAGES: StudioEvolutionStage[] = ["replay", "shadow", "canary", "rollback"];

export function normalizeStudioSnapshot(snapshot: StudioOsSnapshot, groupId: string): StudioOsSnapshot {
  const tasks = snapshot.tasks.filter((item) => item.groupId === groupId);
  const taskIds = new Set(tasks.map((item) => item.taskId));
  const assets = snapshot.assets.filter((item) => item.groupId === groupId);
  const packets = snapshot.packets.filter((item) => item.groupId === groupId && taskIds.has(item.taskId));
  const packetIds = new Set(packets.map((item) => item.packetId));
  const leases = snapshot.leases.filter((item) => taskIds.has(item.taskId));
  const leaseIds = new Set(leases.map((item) => item.leaseId));
  const batches = snapshot.batches.filter((item) => taskIds.has(item.taskId) && packetIds.has(item.packetId) && leaseIds.has(item.leaseId));
  const batchIds = new Set(batches.map((item) => item.batchId));
  const verifications = snapshot.verifications.filter((item) => batchIds.has(item.batchId));
  const events = snapshot.events.filter((item) => item.payload.groupId === undefined || item.payload.groupId === groupId);
  return {
    ...snapshot,
    groups: snapshot.groups.filter((item) => item.groupId === groupId),
    assets,
    tasks,
    decisions: snapshot.decisions.filter((item) => item.groupId === groupId && (taskIds.has(item.subjectId) || !item.subjectId)),
    packets,
    leases,
    batches,
    verifications,
    events,
    idempotency: snapshot.idempotency,
  };
}

export interface EvolutionState {
  status: "not_reported" | "started" | "running" | "completed" | "failed" | "rolled_back";
  evidenceRefs: string[];
  eventId?: string;
}

function evidenceFromEvent(event: StudioEvent): string[] {
  const refs = event.payload.evidenceRefs;
  const single = event.payload.evidenceRef;
  return Array.from(new Set([
    ...(Array.isArray(refs) ? refs.filter((item): item is string => typeof item === "string") : []),
    ...(typeof single === "string" ? [single] : []),
  ]));
}

function statusFromEvent(event: StudioEvent): EvolutionState["status"] {
  const type = event.type.toLowerCase();
  if (type.includes("rolled_back") || type.includes("rollback.completed")) return "rolled_back";
  if (type.includes("failed")) return "failed";
  if (type.includes("completed") || type.includes("succeeded")) return "completed";
  if (type.includes("running")) return "running";
  return "started";
}

export function deriveEvolutionStates(events: StudioEvent[]): Record<StudioEvolutionStage, EvolutionState> {
  const result = Object.fromEntries(EVOLUTION_STAGES.map((stage) => [stage, { status: "not_reported", evidenceRefs: [] }])) as unknown as Record<StudioEvolutionStage, EvolutionState>;
  for (const event of [...events].sort((left, right) => left.sequence - right.sequence)) {
    const type = event.type.toLowerCase();
    const stage = EVOLUTION_STAGES.find((candidate) => type.includes(candidate) || (candidate === "rollback" && type.includes("rolled_back")));
    if (!stage) continue;
    result[stage] = { status: statusFromEvent(event), evidenceRefs: evidenceFromEvent(event), eventId: event.eventId };
  }
  return result;
}

export interface ControlRoomModel {
  group: StudioOsSnapshot["groups"][number] | null;
  rootTasks: StudioTask[];
  verificationFailures: Array<{ id: string; title: string; detail: string; evidenceRefs: string[] }>;
  evolution: Record<StudioEvolutionStage, EvolutionState>;
  impactForAsset(assetId: string): StudioTask[];
}

function failureForVerification(verification: StudioVerification, snapshot: StudioOsSnapshot) {
  const batch = snapshot.batches.find((item) => item.batchId === verification.batchId);
  return { id: verification.verificationId, title: `候选 ${verification.candidateId} 验证失败`, detail: batch ? `批次 ${batch.batchId} · 验证者 ${verification.verifierId}` : "候选批次不可回读", evidenceRefs: verification.evidenceRefs };
}

export function deriveControlRoom(snapshot: StudioOsSnapshot, groupId: string): ControlRoomModel {
  const taskById = new Map(snapshot.tasks.map((item) => [item.taskId, item]));
  const failures = snapshot.verifications.filter((item) => item.verdict === "fail").map((item) => failureForVerification(item, snapshot));
  failures.push(...snapshot.tasks.filter((item) => item.status === "failed" || item.status === "invalidated").map((task) => ({ id: task.taskId, title: task.title, detail: task.status === "invalidated" ? "依赖资产已失效" : "任务报告失败", evidenceRefs: snapshot.events.filter((event) => event.aggregateId === task.taskId).flatMap(evidenceFromEvent) })));
  const descendantsForAsset = (assetId: string) => {
    const result: StudioTask[] = [];
    const seen = new Set<string>();
    const pendingAssets = [assetId];
    while (pendingAssets.length) {
      const currentAssetId = pendingAssets.shift()!;
      for (const task of snapshot.tasks) {
        if (seen.has(task.taskId) || !task.inputAssetIds.includes(currentAssetId)) continue;
        seen.add(task.taskId);
        result.push(task);
        pendingAssets.push(...task.outputAssetIds);
      }
    }
    return result;
  };
  return {
    group: snapshot.groups.find((item) => item.groupId === groupId) ?? null,
    rootTasks: snapshot.tasks.filter((item) => item.parentId === null),
    verificationFailures: failures,
    evolution: deriveEvolutionStates(snapshot.events),
    impactForAsset: (assetId) => descendantsForAsset(assetId).filter((task) => taskById.get(task.taskId)),
  };
}
