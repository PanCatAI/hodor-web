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
      contractVersion: "shot-planner.v2",
      memoryNamespace: "private://film-zero-cost-001/shot-planner",
      knowledgeScopes: ["blocking.geometry", "shot.language", "script.scene-007"],
      allowedTools: ["shot.list", "prompt.compose", "candidate.propose"],
      qualityRules: [
        { code: "SHOT-CONTINUITY-01", label: "每个动作必须可落到一个镜头" },
        { code: "SHOT-COST-01", label: "只产生候选，不触发生成" },
      ],
      forbiddenWrites: ["film-knowledge", "adopted-shot:shot-001", "provider-secrets"],
      runId: "run-shot-planner-007",
      status: "returned",
      proposal: "先保留 001 / 002，再为 003 提出低机位白模候选。",
    },
    {
      id: "continuity-supervisor",
      name: "连续性监修",
      shortName: "CONTINUITY",
      eyebrow: "ROLE 02 / MEMORY",
      accent: "cyan",
      responsibility: "核对空间、手位与前后镜头，标出需要隔离修复的风险。",
      contractVersion: "continuity-supervisor.v3",
      memoryNamespace: "private://film-zero-cost-001/continuity-supervisor",
      knowledgeScopes: ["blocking.geometry", "character.hands", "adopted-shots"],
      allowedTools: ["knowledge.query", "spatial.risk", "patch.propose"],
      qualityRules: [
        { code: "CONTINUITY-SPACE-02", label: "高空间风险必须有白模证据" },
        { code: "CONTINUITY-SCOPE-01", label: "修复只能写入目标镜头" },
      ],
      forbiddenWrites: ["role-contracts", "adopted-shot:shot-004", "provider-secrets"],
      runId: "run-continuity-007",
      status: "returned",
      proposal: "001 / 004 风险低可跳过白模，003 必须启用局部白模。",
    },
  ],
  timeline: [
    {
      id: "event-user",
      time: "00:00.000",
      actor: "制片人",
      label: "单条消息进入",
      detail: "把厨房钥匙动作整理成一场可拍的镜头组。",
      evidence: "EV-USER-001",
      tone: "violet",
    },
    {
      id: "event-parallel",
      time: "00:00.214",
      actor: "编排器",
      label: "双角色并行启动",
      detail: "shot-planner 与 continuity-supervisor 共享 filmId，在同一场景并发运行。",
      evidence: "EV-RUN-007",
      tone: "amber",
    },
    {
      id: "event-knowledge",
      time: "00:00.592",
      actor: "知识选择器",
      label: "按任务选择供应商知识",
      detail: "仅为镜头候选读取 mock-seedance-2.5/video-prompt.json。",
      evidence: "EV-KNOW-003",
      tone: "cyan",
    },
    {
      id: "event-graph",
      time: "00:01.106",
      actor: "责任图",
      label: "拆分并重排责任",
      detail: "将空间验证从规划责任中拆出，交给连续性监修。",
      evidence: "EV-GRAPH-004",
      tone: "violet",
    },
    {
      id: "event-blockout",
      time: "00:01.804",
      actor: "空间策略",
      label: "003 启用白模",
      detail: "风险 0.92 高于阈值 0.70；记录调用和结果引用。",
      evidence: "EV-SPACE-003",
      tone: "amber",
    },
    {
      id: "event-arbitration",
      time: "00:02.311",
      actor: "裁决器",
      label: "采用监修结论",
      detail: "以连续性证据为依据，只对 003 写入局部修复。",
      evidence: "EV-ARB-001",
      tone: "green",
    },
    {
      id: "event-return",
      time: "00:02.644",
      actor: "编排器",
      label: "同角色返场",
      detail: "连续性监修用原 filmId 和私有记忆返回，不新建影片上下文。",
      evidence: "EV-CONTEXT-002",
      tone: "cyan",
    },
  ],
  responsibilities: [
    { id: "assignment-01", scope: "动作拆解", owner: "分镜规划师", state: "已完成", evidence: "EV-RUN-007" },
    {
      id: "assignment-02",
      scope: "空间验证",
      owner: "连续性监修",
      state: "已重排",
      change: "split from shot-planner",
      evidence: "EV-GRAPH-004",
    },
    { id: "assignment-03", scope: "供应商提示知识", owner: "编排器", state: "已选择", evidence: "EV-KNOW-003" },
    { id: "assignment-04", scope: "003 局部修复", owner: "连续性监修", state: "待采用", evidence: "EV-PATCH-003" },
  ],
  providerSelections: [
    {
      provider: "mock-seedance-2.5",
      pack: "video-prompt.json",
      capability: "shot-candidate.video-prompt",
      reason: "任务需要镜头运动语法；读取供应商专属包，不污染角色合同。",
      readPath: "data/agent/production-collaboration/providers/mock-seedance-2.5/video-prompt.json",
      evidence: "EV-KNOW-003",
    },
    {
      provider: "internal",
      pack: "continuity-rules.v1",
      capability: "spatial-consistency.review",
      reason: "空间审查只需本地规则，跳过供应商提示读取。",
      readPath: "data/agent/production-collaboration/roles/continuity-supervisor.json",
      evidence: "EV-KNOW-004",
    },
  ],
  spatialDecisions: [
    {
      shotId: "shot-003",
      risk: 0.92,
      action: "invoke",
      label: "启用 Blender 白模",
      reason: "手位、钥匙落点和镜头轴线同时变化；高于 0.70 阈值。",
      toolRef: "mock-blender://blockout/shot-003",
      resultRef: "artifact://blockout/shot-003-v1",
      evidence: "EV-SPACE-003",
    },
    {
      shotId: "shot-001",
      risk: 0.18,
      action: "skip",
      label: "跳过 Blender 白模",
      reason: "低风险单人近景，已有 adopted 参考且无空间变化。",
      toolRef: null,
      resultRef: null,
      evidence: "EV-SPACE-001",
    },
  ],
  patches: [
    {
      shotId: "shot-003",
      version: "v1 → v2",
      candidate: "candidate://shot-003-continuity-fix",
      changes: ["手从画面右侧入场", "钥匙落点锁定在台面前沿", "保留 35mm 低机位"],
      boundary: "仅写入 shot-003；shot-001 / 002 / 004 的 adopted 版本保持不变。",
      evidence: "EV-PATCH-003",
    },
  ],
  arbitration: {
    id: "ARB-003-001",
    policy: "arbitration.v1 / evidence-first",
    proposals: ["proposal-shot-planner-003", "proposal-continuity-003"],
    conclusion: "adopt-continuity",
    rationale: "连续性监修提供了白模结果引用，且局部 patch 的 expectedVersion 与当前 003 版本一致。",
    evidence: ["EV-SPACE-003", "EV-PATCH-003", "EV-CONTEXT-002"],
  },
  transcript: [
    { speaker: "制片人", text: "把厨房钥匙动作整理成一场可拍的镜头组，保留已经采用的镜头。", evidence: "EV-USER-001" },
    { speaker: "分镜规划师", text: "我拆出 001—004。001、002 可沿用，003 需要一个低机位候选；我不写入影片知识或已采用镜头。", evidence: "proposal-shot-planner-003" },
    { speaker: "连续性监修", text: "我复核了台面方位和手位。003 的空间风险是 0.92，调用白模；001 风险 0.18，理由充分，跳过。", evidence: "EV-SPACE-003" },
    { speaker: "编排器", text: "依据白模证据采用连续性方案，只提交 shot-003 的局部 patch，并保持 filmId 返回。", evidence: "EV-ARB-001" },
  ],
  readiness: [
    { label: "证据齐全", detail: "双角色、图变更、知识选择、空间策略、裁决和局部 patch 均有引用。" },
    { label: "上下文连续", detail: "返场记录仍指向 film-zero-cost-001，私有记忆按 roleId 隔离。" },
    { label: "边界安全", detail: "只读面板不写后端；patch 只针对 shot-003。" },
    { label: "零成本", detail: "mock provider、local white-blockout、real provider calls 0、paid generation USD 0。" },
  ],
} satisfies CollaborationSceneFixture;
