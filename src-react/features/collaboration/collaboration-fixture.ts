export interface CollaborationRole {
  id: "shot-planner" | "continuity-supervisor";
  name: string;
  shortName: string;
  eyebrow: string;
  accent: "amber" | "cyan";
  responsibility: string;
  contractVersion: string;
  memoryNamespace: string;
  knowledgeScopes: string[];
  allowedTools: string[];
  qualityRules: Array<{ code: string; label: string }>;
  forbiddenWrites: string[];
  runId: string;
  status: "parallel" | "returned";
  proposal: string;
}

export interface CollaborationTimelineEvent {
  id: string;
  time: string;
  actor: string;
  label: string;
  detail: string;
  evidence: string;
  tone: "amber" | "cyan" | "green" | "violet";
}

export interface ResponsibilityAssignment {
  id: string;
  scope: string;
  owner: string;
  state: string;
  change?: string;
  evidence: string;
}

export interface ProviderKnowledgeSelection {
  provider: string;
  pack: string;
  capability: string;
  reason: string;
  readPath: string;
  evidence: string;
}

export interface SpatialDecision {
  shotId: string;
  risk: number;
  action: "invoke" | "skip";
  label: string;
  reason: string;
  toolRef: string | null;
  resultRef: string | null;
  evidence: string;
}

export interface ShotScopedPatch {
  shotId: string;
  version: string;
  candidate: string;
  changes: string[];
  boundary: string;
  evidence: string;
}

export interface CollaborationSceneFixture {
  filmId: string;
  sceneId: string;
  title: string;
  location: string;
  timeOfDay: string;
  prompt: string;
  roles: CollaborationRole[];
  timeline: CollaborationTimelineEvent[];
  responsibilities: ResponsibilityAssignment[];
  providerSelections: ProviderKnowledgeSelection[];
  spatialDecisions: SpatialDecision[];
  patches: ShotScopedPatch[];
  arbitration: {
    id: string;
    policy: string;
    proposals: string[];
    conclusion: string;
    rationale: string;
    evidence: string[];
  };
  transcript: Array<{ speaker: string; text: string; evidence: string }>;
  readiness: Array<{ label: string; detail: string }>;
}

/**
 * 固定的零成本单场景夹具。页面只读这份数据，确保截图、测试和文档中的证据互相对应。
 */
export const COLLABORATION_SCENE = {
  filmId: "film-zero-cost-001",
  sceneId: "scene-kitchen-007",
  title: "厨房 · 夜 · 一句台词改变镜头顺序",
  location: "老公寓厨房",
  timeOfDay: "23:40 / 雨夜",
  prompt: "把“钥匙落桌”的动作拆成可拍镜头，保持人物手位、台面方位和情绪连续。",
  roles: [
    {
      id: "shot-planner",
      name: "分镜规划师",
      shortName: "SHOT PLANNER",
      eyebrow: "ROLE 01 / MOTION",
      accent: "amber",
      responsibility: "拆解动作节拍，提出镜头顺序与构图候选。",
      contractVersion: "shot-planner.v1",
      memoryNamespace: "memory:film-zero-cost-001:shot-planner",
      knowledgeScopes: ["film.characters", "film.locations", "scene.shot-intent"],
      allowedTools: ["productionGraph.changeScope", "productionGraph.startReady", "providerKnowledge.select", "shot.patch"],
      qualityRules: [
        { code: "planner-shot-intent", label: "镜头候选必须保留叙事意图和证据引用" },
        { code: "planner-scoped-patch", label: "修复只能作用于指定 shotId" },
      ],
      forbiddenWrites: ["film-knowledge.attributes", "continuity-private-memory", "scene-wide-shot-replace"],
      runId: "role-run:film-zero-cost-001:scene-kitchen-007:shot-planner:1",
      status: "returned",
      proposal: "为 shot-003 提出保留叙事意图的镜头候选，修复严格限定在目标 shotId。",
    },
    {
      id: "continuity-supervisor",
      name: "连续性监修",
      shortName: "CONTINUITY",
      eyebrow: "ROLE 02 / MEMORY",
      accent: "cyan",
      responsibility: "核对空间、手位与前后镜头，标出需要隔离修复的风险。",
      contractVersion: "continuity-supervisor.v1",
      memoryNamespace: "memory:film-zero-cost-001:continuity-supervisor",
      knowledgeScopes: ["film.locations", "scene.spatial-facts", "scene.continuity"],
      allowedTools: ["productionGraph.changeScope", "spatialPrevis.createBlockout", "responsibilityGraph.reassign", "arbitration.propose"],
      qualityRules: [
        { code: "continuity-axis", label: "越轴风险必须有空间证据" },
        { code: "continuity-blockout", label: "高风险镜头必须记录白模调用或可审计跳过理由" },
      ],
      forbiddenWrites: ["film-knowledge.attributes", "shot-planner-private-memory", "scene-wide-shot-replace"],
      runId: "role-run:film-zero-cost-001:scene-kitchen-007:continuity-supervisor:2",
      status: "returned",
      proposal: "为 shot-003 提出空间风险证据，支持后续白模和局部修复责任分配。",
    },
  ],
  timeline: [
    {
      id: "event-user",
      time: "00:00.000",
      actor: "制片人",
      label: "单条消息进入",
      detail: "把厨房钥匙动作整理成一场可拍的镜头组。",
      evidence: "input:user-message",
      tone: "violet",
    },
    {
      id: "event-parallel",
      time: "00:00.214",
      actor: "编排器",
      label: "双角色并行启动",
      detail: "shot-planner 与 continuity-supervisor 共享 filmId，在同一场景并发运行。",
      evidence: "role-run:film-zero-cost-001:scene-kitchen-007:shot-planner:1",
      tone: "amber",
    },
    {
      id: "event-knowledge",
      time: "00:00.592",
      actor: "知识选择器",
      label: "按任务选择供应商知识",
      detail: "仅为镜头候选读取 mock-seedance-2.5/video-prompt.json。",
      evidence: "evidence:role-run:film-zero-cost-001:scene-kitchen-007:shot-planner:1:provider-knowledge",
      tone: "cyan",
    },
    {
      id: "event-graph",
      time: "00:01.106",
      actor: "责任图",
      label: "拆分并重排责任",
      detail: "将白模责任分配给连续性监修，再把局部 patch 责任分配给分镜规划师。",
      evidence: "evidence:arbitration:shot-003",
      tone: "violet",
    },
    {
      id: "event-blockout",
      time: "00:01.804",
      actor: "空间策略",
      label: "003 启用白模",
      detail: "风险 0.85 高于阈值 0.70；记录调用和结果引用。",
      evidence: "evidence:shot-003:spatial-risk",
      tone: "amber",
    },
    {
      id: "event-arbitration",
      time: "00:02.311",
      actor: "裁决器",
      label: "采用监修结论",
      detail: "记录 invoke-blockout 裁决，再对 003 写入局部修复。",
      evidence: "evidence:arbitration:shot-003:1",
      tone: "green",
    },
    {
      id: "event-return",
      time: "00:02.644",
      actor: "编排器",
      label: "同角色返场",
      detail: "分镜规划师用原 filmId 和私有记忆返回，不新建影片上下文。",
      evidence: "memory:film-zero-cost-001:shot-planner",
      tone: "cyan",
    },
  ],
  responsibilities: [
    { id: "assignment-01", scope: "shot-003 候选", owner: "分镜规划师", state: "已分配", evidence: "proposal:planner:shot-003" },
    {
      id: "assignment-02",
      scope: "空间验证",
      owner: "连续性监修",
      state: "已完成",
      change: "blockout assignment",
      evidence: "evidence:shot-003:spatial-risk",
    },
    { id: "assignment-03", scope: "003 局部修复", owner: "分镜规划师", state: "已分配", evidence: "evidence:arbitration:shot-003" },
    { id: "assignment-04", scope: "责任图变更", owner: "编排器", state: "已记录", evidence: "evidence:shot-003:spatial-risk" },
  ],
  providerSelections: [
    {
      provider: "mock-seedance-2.5",
      pack: "mock-seedance-2.5/video.prompt/v1",
      capability: "video.prompt",
      reason: "显式匹配 mock-seedance-2.5/video.prompt；只读取与 shot-planner.v1 匹配的本地包。",
      readPath: "data/agent/production-collaboration/providers/mock-seedance-2.5/video-prompt.json",
      evidence: "evidence:role-run:film-zero-cost-001:scene-kitchen-007:shot-planner:1:provider-knowledge",
    },
    {
      provider: "none",
      pack: "none",
      capability: "continuity.analyze",
      reason: "任务不要求供应商专属知识。",
      readPath: "[]",
      evidence: "evidence:role-run:film-zero-cost-001:scene-kitchen-007:continuity-supervisor:2:provider-knowledge",
    },
  ],
  spatialDecisions: [
    {
      shotId: "shot-003",
      risk: 0.85,
      action: "invoke",
      label: "启用 Blender 白模",
      reason: "轴线、人物三维路径、遮挡和道具交接共同使风险达到 0.85，高于 0.70 阈值。",
      toolRef: "blockout:film-zero-cost-001:scene-kitchen-007:shot-003:1:call",
      resultRef: "blockout:film-zero-cost-001:scene-kitchen-007:shot-003:1:result",
      evidence: "evidence:shot-003:spatial-risk",
    },
    {
      shotId: "shot-001",
      risk: 0,
      action: "skip",
      label: "跳过 Blender 白模",
      reason: "固定机位，没有触发空间风险特征；可审计地跳过白模。",
      toolRef: null,
      resultRef: null,
      evidence: "evidence:shot-001:spatial-risk",
    },
  ],
  patches: [
    {
      shotId: "shot-003",
      version: "v1 → v2",
      candidate: "candidate:shot-003:v2",
      changes: ["修正越轴", "保留道具交接"],
      boundary: "仅写入 shot-003；shot-001 / 002 / 004 的 adopted 版本保持不变。",
      evidence: "evidence:shot-003:patch:2",
    },
  ],
  arbitration: {
    id: "arbitration:shot-003:1",
    policy: "spatial-consistency.v1",
    proposals: ["proposal:planner:shot-003", "proposal:continuity:shot-003"],
    conclusion: "invoke-blockout",
    rationale: "高空间风险含越轴、路径和遮挡证据。",
    evidence: ["evidence:shot-003:spatial-risk", "evidence:continuity:shot-003"],
  },
  transcript: [
    { speaker: "制片人", text: "请验证厨房场景的空间连续性并准备镜头修复。", evidence: "input:user-message" },
    { speaker: "分镜规划师", text: "我为 shot-003 提出镜头意图候选，并把修复范围限定在目标 shotId。", evidence: "proposal:planner:shot-003" },
    { speaker: "连续性监修", text: "我提供 shot-003 的连续性分析；供应商专属知识选择为空。", evidence: "evidence:role-run:film-zero-cost-001:scene-kitchen-007:continuity-supervisor:2:provider-knowledge" },
    { speaker: "编排器", text: "空间风险达到 0.85，执行本地白模；裁决为 invoke-blockout，并把 patch 分配给分镜规划师。", evidence: "evidence:arbitration:shot-003:1" },
  ],
  readiness: [
    { label: "证据齐全", detail: "双角色、图变更、知识选择、空间策略、裁决和局部 patch 均有引用。" },
    { label: "上下文连续", detail: "返场记录仍指向 film-zero-cost-001，私有记忆按 roleId 隔离。" },
    { label: "边界安全", detail: "只读面板不写后端；patch 只针对 shot-003。" },
    { label: "零成本", detail: "mock provider、local white-blockout、real provider calls 0、paid generation USD 0。" },
  ],
} satisfies CollaborationSceneFixture;
