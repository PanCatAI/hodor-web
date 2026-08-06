/**
 * ProductionGraph v1 第一阶段前端合同。
 *
 * 字段与 Hodor 后端 `src/domain/productionGraph.ts` 冻结的 Zod schema 一一对应。
 * 前端不引入 Zod，依赖服务端校验；本文件只是结构化类型契约，使前端 store、动作、UI 与
 * socket 适配器共享同一组字段名和枚举值。
 *
 * 该合同不引入持久化、Socket、AgentRun 写入路径；前端只读取快照、应用 patch
 * 并通过统一动作入口派发用户意图。
 */

export const PRODUCTION_GRAPH_SCHEMA_VERSION = "1" as const;

export type ProductionGraphSchemaVersion = typeof PRODUCTION_GRAPH_SCHEMA_VERSION;

export type ProductionGraphNodeKind = "goal" | "work" | "deliverable" | "checkpoint";

export type ProductionGraphNodeStatus =
  | "draft"
  | "blocked"
  | "ready"
  | "queued"
  | "running"
  | "paused"
  | "waiting_decision"
  | "succeeded"
  | "failed"
  | "cancelled";

export type ProductionGraphEdgeKind = "requires";

export type ProductionGraphReferenceAuthority = "pancat" | "hodor";

export type ProductionGraphReferenceKind =
  | "asset"
  | "providerTask"
  | "workspace"
  | "candidate"
  | "evidence";

export interface ProductionGraphReference {
  authority: ProductionGraphReferenceAuthority;
  kind: ProductionGraphReferenceKind;
  ref: string;
}

export interface ProductionGraphBudget {
  currency: "USD";
  oneTimeCost: number;
  recurringCost: number;
}

export interface ProductionGraphConstraint {
  code: string;
  params: Record<string, unknown>;
}

export type ProductionGraphCheckpointReason =
  | "cost"
  | "purchase"
  | "capital_policy"
  | "recurring_infrastructure"
  | "manual_review";

export interface ProductionGraphCheckpointDecision {
  checkpointId: string;
  nodeId: string;
  graphId: string;
  reason: ProductionGraphCheckpointReason;
  outcome: "approved" | "rejected" | "deferred";
  actorRef: string | null;
  decisionAt: string;
  note: string;
}

export interface ProductionGraphEvidence {
  code: string;
  ref: ProductionGraphReference;
  capturedAt: string;
  summary: string;
}

export interface ProductionGraphNode {
  id: string;
  graphId: string;
  kind: ProductionGraphNodeKind;
  title: string;
  objective: string;
  status: ProductionGraphNodeStatus;
  inputRefs: ProductionGraphReference[];
  outputRefs: ProductionGraphReference[];
  constraints: ProductionGraphConstraint[];
  evidence: ProductionGraphEvidence[];
  budget: ProductionGraphBudget;
  attempt: number;
  capabilityId: string | null;
  agentRunId: string | null;
  checkpointId: string | null;
  checkpointReason: ProductionGraphCheckpointReason | null;
  createdAt: number;
  updatedAt: number;
}

export interface ProductionGraphEdge {
  id: string;
  graphId: string;
  kind: ProductionGraphEdgeKind;
  sourceNodeId: string;
  targetNodeId: string;
  createdAt: number;
  updatedAt: number;
}

export type ProductionGraphStatus = "draft" | "active" | "paused" | "completed" | "cancelled";

export interface ProductionGraphResolvedReference {
  ref: ProductionGraphReference;
  status: string;
  summary: string;
  resolvedAt: string;
}

export interface ProductionGraphSnapshot {
  schemaVersion: ProductionGraphSchemaVersion;
  graphId: string;
  projectId: number;
  interactiveStoryGraphId: string | null;
  revision: number;
  status: ProductionGraphStatus;
  nodes: ProductionGraphNode[];
  edges: ProductionGraphEdge[];
  checkpointDecisions: ProductionGraphCheckpointDecision[];
  resolvedReferences: ProductionGraphResolvedReference[];
  availableActions: string[];
  createdAt: number;
  updatedAt: number;
}

export interface ProductionGraphPatch {
  schemaVersion: ProductionGraphSchemaVersion;
  graphId: string;
  baseRevision: number;
  revision: number;
  nodesUpsert: ProductionGraphNode[];
  nodeIdsRemoved: string[];
  edgesUpsert: ProductionGraphEdge[];
  edgeIdsRemoved: string[];
  checkpointDecisionsUpsert: ProductionGraphCheckpointDecision[];
  emittedAt: string;
}

export const PRODUCTION_GRAPH_ACTIONS = [
  "readGraph",
  "changeScope",
  "startReady",
  "pause",
  "resumeOrRetry",
  "adoptCandidate",
] as const;

export type ProductionGraphActionName = (typeof PRODUCTION_GRAPH_ACTIONS)[number];

export interface ProductionGraphActionContext {
  actorRef: string | null;
  graphId: string;
  revision?: number | undefined;
  selectedNodeId: string | null;
  checkpointId: string | null;
  featureEnabled: boolean;
  paidGenerationUsd: number;
}

export interface ProductionGraphReadGraphInput {
  action: "readGraph";
}

export interface ProductionGraphChangeScopeNodeDraft {
  id: string;
  graphId: string;
  kind: ProductionGraphNodeKind;
  title: string;
  objective: string;
  status: ProductionGraphNodeStatus;
  inputRefs: ProductionGraphReference[];
  outputRefs: ProductionGraphReference[];
  constraints: ProductionGraphConstraint[];
  evidence: ProductionGraphEvidence[];
  budget: ProductionGraphBudget;
  attempt: number;
  capabilityId: string | null;
  agentRunId: string | null;
  checkpointId: string | null;
  checkpointReason: ProductionGraphCheckpointReason | null;
}

export interface ProductionGraphChangeScopeEdgeDraft {
  id: string;
  graphId: string;
  kind: ProductionGraphEdgeKind;
  sourceNodeId: string;
  targetNodeId: string;
}

export interface ProductionGraphChangeScopeInput {
  action: "changeScope";
  idempotencyKey: string;
  expectedRevision: number;
  nodesUpsert: ProductionGraphChangeScopeNodeDraft[];
  nodeIdsRemoved: string[];
  edgesUpsert: ProductionGraphChangeScopeEdgeDraft[];
  edgeIdsRemoved: string[];
}

export interface ProductionGraphStartReadyInput {
  action: "startReady";
  idempotencyKey: string;
  expectedRevision: number;
  nodeIds: string[];
}

export interface ProductionGraphPauseInput {
  action: "pause";
  idempotencyKey: string;
  expectedRevision: number;
  nodeIds: string[];
}

export interface ProductionGraphResumeCheckpointDecision {
  checkpointId: string;
  outcome: "approved" | "rejected" | "deferred";
  reason: ProductionGraphCheckpointReason;
  note: string;
}

export interface ProductionGraphResumeOrRetryInput {
  action: "resumeOrRetry";
  idempotencyKey: string;
  expectedRevision: number;
  nodeIds: string[];
  checkpointDecision?: ProductionGraphResumeCheckpointDecision;
}

export interface ProductionGraphAdoptCandidateInput {
  action: "adoptCandidate";
  idempotencyKey: string;
  expectedRevision: number;
  nodeId: string;
  candidate: ProductionGraphReference;
  target: ProductionGraphReference;
}

export type ProductionGraphActionInput =
  | ProductionGraphReadGraphInput
  | ProductionGraphChangeScopeInput
  | ProductionGraphStartReadyInput
  | ProductionGraphPauseInput
  | ProductionGraphResumeOrRetryInput
  | ProductionGraphAdoptCandidateInput;

export interface ProductionActionHandlerResult {
  action: ProductionGraphActionName;
  snapshot: ProductionGraphSnapshot;
  patch?: ProductionGraphPatch;
  idempotencyKey?: string;
  paidGenerationUsd: number;
}

/**
 * 冻结结构化错误码。前端必须按这些 code 回退到旧路径，而不是依赖 message 文本。
 */
export type ProductionGraphErrorCode =
  | "PRODUCTION_GRAPH_DISABLED"
  | "PAID_GENERATION_DISABLED"
  | "PRODUCTION_ACTION_UNBOUND"
  | "PANCAT_REFERENCE_REQUIRED"
  | "PRODUCTION_GRAPH_REVISION_CONFLICT"
  | "PRODUCTION_GRAPH_NODE_NOT_READY"
  | "PRODUCTION_GRAPH_CHECKPOINT_REQUIRED";

export class ProductionGraphBusinessError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: Record<string, unknown> | undefined;

  constructor(
    code: string,
    message: string,
    status: number,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ProductionGraphBusinessError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function isProductionGraphActionName(value: unknown): value is ProductionGraphActionName {
  return typeof value === "string" && (PRODUCTION_GRAPH_ACTIONS as readonly string[]).includes(value);
}

/**
 * 兼容事件：旧生产 Socket 仍会发送 productionRun:update / productionRun:restore。
 * 前端在迁移期把它们映射为 graph patch 的辅助证据，但不得依此推导真实节点状态。
 */
export interface ProductionRunUpdatePayload {
  runId: string;
  status: string;
  stage: string;
  graphId?: string;
  nodeId?: string;
  revision?: number;
  attempt?: number;
  checkpointRef?: string | null;
  error?: { category?: string; message?: string; retryable?: boolean } | null;
  updatedAt: string;
}

export interface ProductionRunRestorePayload {
  graphId?: string;
  active?: ProductionRunUpdatePayload[];
  activeRuns?: ProductionRunUpdatePayload[];
  recent?: ProductionRunUpdatePayload[];
  recentTerminalRuns?: ProductionRunUpdatePayload[];
}
