import type {
  ProductionGraphBudget,
  ProductionGraphCheckpointDecision,
  ProductionGraphCheckpointReason,
  ProductionGraphEdge,
  ProductionGraphEvidence,
  ProductionGraphNode,
  ProductionGraphNodeStatus,
  ProductionGraphPatch,
  ProductionGraphReference,
  ProductionGraphSnapshot,
} from "./types";

/**
 * 与后端 tests/fixtures/production-graph-events.ts 同构的前端夹具。
 *
 * 该夹具只用于单元测试和 UI 演示。冻结字段必须与后端一致：
 * - 双项目 P1（A、B、C、checkpoint-cost）、P2（D）
 * - requires 边 C->A、C->B、checkpoint->C
 * - 所有 budget 为 0
 * - pancat 引用必须保留 authority=pancat
 */

export const FIXTURE_BASE_TIMESTAMP = 1_732_500_000_000;
export const FIXTURE_ISO_BASE = "2024-12-25T00:00:00.000Z";

export function zeroBudget(): ProductionGraphBudget {
  return { currency: "USD", oneTimeCost: 0, recurringCost: 0 };
}

function ref(
  authority: ProductionGraphReference["authority"],
  kind: ProductionGraphReference["kind"],
  refId: string,
): ProductionGraphReference {
  return { authority, kind, ref: refId };
}

interface NodeOptions {
  id: string;
  graphId: string;
  kind: ProductionGraphNode["kind"];
  title: string;
  objective: string;
  status: ProductionGraphNodeStatus;
  capabilityId?: string | null;
  inputRefs?: ProductionGraphReference[];
  outputRefs?: ProductionGraphReference[];
  evidence?: ProductionGraphEvidence[];
  attempt?: number;
  agentRunId?: string | null;
  checkpointId?: string | null;
  checkpointReason?: ProductionGraphCheckpointReason | null;
  createdAt?: number;
  updatedAt?: number;
}

export function fixtureNode(options: NodeOptions): ProductionGraphNode {
  return {
    id: options.id,
    graphId: options.graphId,
    kind: options.kind,
    title: options.title,
    objective: options.objective,
    status: options.status,
    inputRefs: options.inputRefs ?? [],
    outputRefs: options.outputRefs ?? [],
    constraints: [],
    evidence: options.evidence ?? [],
    budget: zeroBudget(),
    attempt: options.attempt ?? 0,
    capabilityId: options.capabilityId ?? null,
    agentRunId: options.agentRunId ?? null,
    checkpointId: options.checkpointId ?? null,
    checkpointReason: options.checkpointReason ?? null,
    createdAt: options.createdAt ?? FIXTURE_BASE_TIMESTAMP,
    updatedAt: options.updatedAt ?? FIXTURE_BASE_TIMESTAMP,
  };
}

export function fixtureEdge(id: string, graphId: string, sourceNodeId: string, targetNodeId: string): ProductionGraphEdge {
  return {
    id,
    graphId,
    kind: "requires",
    sourceNodeId,
    targetNodeId,
    createdAt: FIXTURE_BASE_TIMESTAMP,
    updatedAt: FIXTURE_BASE_TIMESTAMP,
  };
}

export interface DualProjectFixture {
  p1: { projectId: number; graphId: string };
  p2: { projectId: number; graphId: string };
  snapshots: {
    p1Initial: ProductionGraphSnapshot;
    p2Initial: ProductionGraphSnapshot;
    p1Concurrent: ProductionGraphSnapshot;
    p1CheckpointWaiting: ProductionGraphSnapshot;
    p1AfterAdopt: ProductionGraphSnapshot;
  };
  patches: {
    p1StartA: ProductionGraphPatch;
    p1StartB: ProductionGraphPatch;
    p1CompleteAB: ProductionGraphPatch;
    p1CheckpointWaiting: ProductionGraphPatch;
    p1AdoptCandidate: ProductionGraphPatch;
  };
  checkpointDecision: ProductionGraphCheckpointDecision;
}

export function buildDualProjectFixture(): DualProjectFixture {
  const p1 = { projectId: 1, graphId: "graph-p1" };
  const p2 = { projectId: 2, graphId: "graph-p2" };

  const goalP1 = fixtureNode({
    id: "goal-p1",
    graphId: p1.graphId,
    kind: "goal",
    title: "P1 互动短剧生产目标",
    objective: "通过零成本工作并发产出最终交付候选。",
    status: "ready",
  });
  const workA = fixtureNode({
    id: "node-a",
    graphId: p1.graphId,
    kind: "work",
    title: "A：零成本工作节点",
    objective: "对内部只读资料完成整理。",
    status: "ready",
    capabilityId: "internal.reviewText",
  });
  const workB = fixtureNode({
    id: "node-b",
    graphId: p1.graphId,
    kind: "work",
    title: "B：零成本工作节点",
    objective: "对剧本风险做静态检查。",
    status: "ready",
    capabilityId: "internal.staticAnalysis",
  });
  const deliverableC = fixtureNode({
    id: "node-c",
    graphId: p1.graphId,
    kind: "deliverable",
    title: "C：合并 A、B 的交付节点",
    objective: "在 A、B 都成功后产出可采用的候选。",
    status: "blocked",
    capabilityId: "internal.mergeCandidate",
    outputRefs: [ref("pancat", "candidate", "pancat://candidate/c-1")],
  });
  const checkpointCost = fixtureNode({
    id: "checkpoint-cost",
    graphId: p1.graphId,
    kind: "checkpoint",
    title: "费用人工控制点",
    objective: "在采用候选前确认是否需要付费扩容。",
    status: "waiting_decision",
    checkpointId: "checkpoint-cost-1",
    checkpointReason: "cost",
  });
  const requiresCtoA = fixtureEdge("edge-c-a", p1.graphId, "node-a", "node-c");
  const requiresCtoB = fixtureEdge("edge-c-b", p1.graphId, "node-b", "node-c");
  const requiresCheckpointToC = fixtureEdge("edge-checkpoint-c", p1.graphId, "node-c", "checkpoint-cost");

  const availableActions = ["readGraph", "changeScope", "startReady", "pause", "resumeOrRetry", "adoptCandidate"] as const;

  const p1Initial: ProductionGraphSnapshot = {
    schemaVersion: "1",
    graphId: p1.graphId,
    projectId: p1.projectId,
    interactiveStoryGraphId: "story-p1",
    revision: 1,
    status: "active",
    nodes: [goalP1, workA, workB, deliverableC, checkpointCost],
    edges: [requiresCtoA, requiresCtoB, requiresCheckpointToC],
    checkpointDecisions: [],
    resolvedReferences: [],
    availableActions: [...availableActions],
    createdAt: FIXTURE_BASE_TIMESTAMP,
    updatedAt: FIXTURE_BASE_TIMESTAMP,
  };

  const goalP2 = fixtureNode({
    id: "goal-p2",
    graphId: p2.graphId,
    kind: "goal",
    title: "P2 独立项目目标",
    objective: "另一项目并行运行，验证跨项目并发不互相冻结。",
    status: "ready",
  });
  const workD = fixtureNode({
    id: "node-d",
    graphId: p2.graphId,
    kind: "work",
    title: "D：零成本工作节点",
    objective: "对独立工作做静态分析。",
    status: "ready",
    capabilityId: "internal.staticAnalysis",
  });
  const p2Initial: ProductionGraphSnapshot = {
    schemaVersion: "1",
    graphId: p2.graphId,
    projectId: p2.projectId,
    interactiveStoryGraphId: null,
    revision: 1,
    status: "active",
    nodes: [goalP2, workD],
    edges: [],
    checkpointDecisions: [],
    resolvedReferences: [],
    availableActions: [...availableActions],
    createdAt: FIXTURE_BASE_TIMESTAMP,
    updatedAt: FIXTURE_BASE_TIMESTAMP,
  };

  const p1Concurrent: ProductionGraphSnapshot = {
    ...p1Initial,
    revision: 3,
    nodes: [
      goalP1,
      { ...workA, status: "running", agentRunId: "run-a-1", attempt: 1, updatedAt: FIXTURE_BASE_TIMESTAMP + 1000 },
      { ...workB, status: "running", agentRunId: "run-b-1", attempt: 1, updatedAt: FIXTURE_BASE_TIMESTAMP + 1000 },
      deliverableC,
      checkpointCost,
    ],
    updatedAt: FIXTURE_BASE_TIMESTAMP + 1000,
  };

  const deliverableCReady: ProductionGraphNode = {
    ...deliverableC,
    status: "ready",
    evidence: [
      {
        code: "upstream.succeeded",
        ref: ref("hodor", "evidence", "hodor://evidence/a-success"),
        capturedAt: FIXTURE_ISO_BASE,
        summary: "A 节点成功产出可采用的候选引用。",
      },
    ],
    updatedAt: FIXTURE_BASE_TIMESTAMP + 2000,
  };
  const checkpointWaiting: ProductionGraphNode = {
    ...checkpointCost,
    status: "waiting_decision",
    inputRefs: [ref("pancat", "candidate", "pancat://candidate/c-1")],
    updatedAt: FIXTURE_BASE_TIMESTAMP + 3000,
  };
  const p1CheckpointWaiting: ProductionGraphSnapshot = {
    ...p1Initial,
    revision: 5,
    nodes: [
      goalP1,
      { ...workA, status: "succeeded", attempt: 1, updatedAt: FIXTURE_BASE_TIMESTAMP + 2000 },
      { ...workB, status: "succeeded", attempt: 1, updatedAt: FIXTURE_BASE_TIMESTAMP + 2000 },
      deliverableCReady,
      checkpointWaiting,
    ],
    updatedAt: FIXTURE_BASE_TIMESTAMP + 3000,
  };

  const checkpointDecision: ProductionGraphCheckpointDecision = {
    checkpointId: "checkpoint-cost-1",
    nodeId: "checkpoint-cost",
    graphId: p1.graphId,
    reason: "cost",
    outcome: "approved",
    actorRef: "founder@example.com",
    decisionAt: FIXTURE_ISO_BASE,
    note: "允许采用候选，不触发付费扩容。",
  };

  const p1AfterAdopt: ProductionGraphSnapshot = {
    ...p1CheckpointWaiting,
    revision: 7,
    nodes: [
      goalP1,
      { ...workA, status: "succeeded", attempt: 1, updatedAt: FIXTURE_BASE_TIMESTAMP + 2000 },
      { ...workB, status: "succeeded", attempt: 1, updatedAt: FIXTURE_BASE_TIMESTAMP + 2000 },
      {
        ...deliverableCReady,
        status: "succeeded",
        outputRefs: [
          ref("pancat", "candidate", "pancat://candidate/c-1"),
          ref("pancat", "asset", "pancat://asset/adopted-1"),
        ],
        updatedAt: FIXTURE_BASE_TIMESTAMP + 4000,
      },
      { ...checkpointCost, status: "succeeded", updatedAt: FIXTURE_BASE_TIMESTAMP + 4000 },
    ],
    checkpointDecisions: [checkpointDecision],
    updatedAt: FIXTURE_BASE_TIMESTAMP + 4000,
  };

  function patch(
    graphId: string,
    baseRevision: number,
    revision: number,
    options: Partial<Pick<ProductionGraphPatch, "nodesUpsert" | "checkpointDecisionsUpsert">>,
  ): ProductionGraphPatch {
    return {
      schemaVersion: "1",
      graphId,
      baseRevision,
      revision,
      nodesUpsert: options.nodesUpsert ?? [],
      nodeIdsRemoved: [],
      edgesUpsert: [],
      edgeIdsRemoved: [],
      checkpointDecisionsUpsert: options.checkpointDecisionsUpsert ?? [],
      emittedAt: FIXTURE_ISO_BASE,
    };
  }

  return {
    p1,
    p2,
    snapshots: {
      p1Initial,
      p2Initial,
      p1Concurrent,
      p1CheckpointWaiting,
      p1AfterAdopt,
    },
    patches: {
      p1StartA: patch(p1.graphId, 1, 2, {
        nodesUpsert: [
          { ...workA, status: "running", agentRunId: "run-a-1", attempt: 1, updatedAt: FIXTURE_BASE_TIMESTAMP + 1000 },
        ],
      }),
      p1StartB: patch(p1.graphId, 2, 3, {
        nodesUpsert: [
          { ...workB, status: "running", agentRunId: "run-b-1", attempt: 1, updatedAt: FIXTURE_BASE_TIMESTAMP + 1000 },
        ],
      }),
      p1CompleteAB: patch(p1.graphId, 3, 4, {
        nodesUpsert: [
          { ...workA, status: "succeeded", attempt: 1, updatedAt: FIXTURE_BASE_TIMESTAMP + 2000 },
          { ...workB, status: "succeeded", attempt: 1, updatedAt: FIXTURE_BASE_TIMESTAMP + 2000 },
        ],
      }),
      p1CheckpointWaiting: patch(p1.graphId, 4, 5, {
        nodesUpsert: [deliverableCReady, checkpointWaiting],
      }),
      p1AdoptCandidate: patch(p1.graphId, 5, 7, {
        nodesUpsert: [
          { ...deliverableCReady, status: "succeeded", outputRefs: p1AfterAdopt.nodes[3].outputRefs, updatedAt: FIXTURE_BASE_TIMESTAMP + 4000 },
          { ...checkpointCost, status: "succeeded", updatedAt: FIXTURE_BASE_TIMESTAMP + 4000 },
        ],
        checkpointDecisionsUpsert: [checkpointDecision],
      }),
    },
    checkpointDecision,
  };
}
