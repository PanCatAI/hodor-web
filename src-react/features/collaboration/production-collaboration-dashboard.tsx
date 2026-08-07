import {
  Activity,
  ArrowRight,
  Box,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Clock3,
  Database,
  FileCheck2,
  GitBranch,
  KeyRound,
  Layers3,
  LockKeyhole,
  MessageSquare,
  Network,
  PanelTop,
  ShieldCheck,
  Sparkles,
  Split,
  Telescope,
  Wrench,
  Zap,
} from "lucide-react";

import { COLLABORATION_SCENE, type CollaborationRole, type SpatialDecision } from "./collaboration-fixture";

function AccentIcon({ accent, children }: { accent: "amber" | "cyan"; children: React.ReactNode }) {
  return <span className={`collab-icon collab-icon-${accent}`}>{children}</span>;
}

function EvidenceTag({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "amber" | "cyan" | "green" }) {
  return <span className={`collab-evidence collab-evidence-${tone}`}>{children}</span>;
}

function SectionHeading({ eyebrow, title, detail, icon }: { eyebrow: string; title: string; detail: string; icon: React.ReactNode }) {
  return (
    <div className="collab-section-heading">
      <span className="collab-section-icon">{icon}</span>
      <div>
        <p className="collab-micro-label">{eyebrow}</p>
        <h2>{title}</h2>
        <p>{detail}</p>
      </div>
    </div>
  );
}

function RoleContractCard({ role }: { role: CollaborationRole }) {
  return (
    <article className={`collab-role-card collab-role-${role.accent}`} data-testid={`role-card-${role.id}`}>
      <div className="collab-role-card-top">
        <div className="collab-role-heading">
          <AccentIcon accent={role.accent}><Sparkles size={18} /></AccentIcon>
          <div>
            <p className="collab-micro-label">{role.eyebrow}</p>
            <h3>{role.name}</h3>
          </div>
        </div>
        <span className="collab-live-pill"><span />{role.status === "returned" ? "已返场" : "并行中"}</span>
      </div>

      <p className="collab-role-responsibility">{role.responsibility}</p>

      <div className="collab-contract-line">
        <span><LockKeyhole size={13} /> {role.contractVersion}</span>
        <span><Database size={13} /> private memory</span>
      </div>

      <div className="collab-role-grid">
        <div>
          <p className="collab-field-label">知识范围</p>
          <div className="collab-token-list">{role.knowledgeScopes.map((item) => <span key={item}>{item}</span>)}</div>
        </div>
        <div>
          <p className="collab-field-label">允许工具</p>
          <div className="collab-token-list">{role.allowedTools.map((item) => <span key={item}>{item}</span>)}</div>
        </div>
      </div>

      <div className="collab-quality-block">
        <p className="collab-field-label">质量合同</p>
        {role.qualityRules.map((rule) => (
          <div className="collab-quality-row" key={rule.code}><Check size={13} /><span>{rule.code}</span><em>{rule.label}</em></div>
        ))}
      </div>

      <footer className="collab-role-footer">
        <span className="collab-run-id">{role.runId}</span>
        <span className="collab-forbidden"><ShieldCheck size={13} /> 禁写 {role.forbiddenWrites.length} 项</span>
      </footer>
    </article>
  );
}

function ResponsibilityGraph() {
  return (
    <div className="collab-graph-wrap" data-testid="responsibility-graph">
      <div className="collab-graph-axis"><span>输入</span><span>责任图 revision {COLLABORATION_SCENE.responsibilityGraphRevision}</span><span>局部交付</span></div>
      <div className="collab-graph-flow">
        <div className="collab-graph-node collab-graph-node-source"><MessageSquare size={17} /><strong>制片消息</strong><small>scene-kitchen-007</small></div>
        <ChevronRight className="collab-graph-arrow" size={19} />
        <div className="collab-graph-node collab-graph-node-planner"><Sparkles size={17} /><strong>动作拆解</strong><small>shot-planner</small></div>
        <div className="collab-graph-split"><Split size={17} /><span>split</span></div>
        <div className="collab-graph-node collab-graph-node-continuity"><Telescope size={17} /><strong>空间验证</strong><small>continuity-supervisor</small></div>
        <ChevronRight className="collab-graph-arrow" size={19} />
        <div className="collab-graph-node collab-graph-node-patch"><Wrench size={17} /><strong>003 局部修复</strong><small>shot-scoped patch</small></div>
      </div>
      <div className="collab-graph-change"><GitBranch size={14} /><span><strong>reorder</strong> 白模完成后再处理局部 patch；责任字段没有写入影片知识节点。</span><EvidenceTag tone="green">evidence:arbitration:shot-003</EvidenceTag></div>
    </div>
  );
}

function SpatialDecisionCard({ decision }: { decision: SpatialDecision }) {
  const invoked = decision.action === "invoke";
  return (
    <article className={`collab-decision-card ${invoked ? "is-invoked" : "is-skipped"}`} data-testid={`spatial-${decision.shotId}`}>
      <div className="collab-decision-top">
        <div><span className="collab-shot-id">{decision.shotId}</span><h3>{decision.label}</h3></div>
        <div className="collab-risk-meter"><span style={{ width: `${decision.risk * 100}%` }} /><strong>{decision.risk.toFixed(2)}</strong></div>
      </div>
      <p>{decision.reason}</p>
      <div className="collab-ref-row">
        <EvidenceTag tone={invoked ? "amber" : "cyan"}>{decision.evidence}</EvidenceTag>
        {invoked ? <><code>{decision.toolRef}</code><code>{decision.resultRef}</code></> : <span className="collab-null-ref"><CheckCircle2 size={13} /> 无工具调用 · 有理由跳过</span>}
      </div>
    </article>
  );
}

export function ProductionCollaborationDashboard() {
  const scene = COLLABORATION_SCENE;
  return (
    <section className="collab-page" data-testid="production-collaboration-dashboard">
      <div className="collab-noise" aria-hidden="true" />
      <header className="collab-topbar">
        <div className="collab-breadcrumb"><span className="collab-breadcrumb-mark"><PanelTop size={14} /></span><span>HODOR / 协作控制室</span><ChevronRight size={13} /><strong>只读证据视图</strong></div>
        <div className="collab-topbar-status"><span className="collab-status-dot" />本地夹具 · 同步于 2026-08-08 <span className="collab-divider" /> <span className="collab-zero">$0 生成费用</span></div>
      </header>

      <div className="collab-content">
        <header className="collab-hero">
          <div className="collab-hero-copy">
            <p className="collab-kicker"><span />PRODUCTION COLLABORATION / SINGLE SCENE</p>
            <h1>一场戏，<br /><em>两个视角。</em></h1>
            <p className="collab-hero-intro">把角色职责、影片上下文和每一次修复边界摊在同一张证据桌上。这里展示的是一条由单条制片消息驱动的完整协作记录。</p>
            <div className="collab-hero-meta"><span><KeyRound size={14} /> {scene.filmId}</span><span><CircleDot size={14} /> {scene.sceneId}</span><span><Clock3 size={14} /> 00:02.644</span></div>
          </div>
          <div className="collab-scene-card">
            <div className="collab-scene-card-top"><span className="collab-scene-index">SCENE 07</span><span className="collab-adopted"><CheckCircle2 size={14} /> evidence complete</span></div>
            <div className="collab-scene-visual"><div className="collab-film-frame frame-one" /><div className="collab-film-frame frame-two" /><div className="collab-film-frame frame-three" /></div>
            <div className="collab-scene-caption"><p>{scene.title}</p><span>{scene.location} · {scene.timeOfDay}</span></div>
            <div className="collab-scene-prompt"><span>BRIEF</span><p>{scene.prompt}</p></div>
          </div>
        </header>

        <div className="collab-stat-strip" aria-label="协作摘要">
          <div><span>角色运行</span><strong>02</strong><small>同一场景真实并行</small></div>
          <div><span>图谱修订</span><strong>{scene.responsibilityGraphRevision}</strong><small>责任图 revision {scene.responsibilityGraphRevision} · 拆分 + 重排有证据</small></div>
          <div><span>空间决策</span><strong>02</strong><small>1 invoke / 1 skip</small></div>
          <div><span>外部生成</span><strong>$0</strong><small>provider calls 0 · Pancat writes 0</small></div>
          <div className="collab-stat-ready"><span>READINESS</span><strong>READY</strong><small>不依赖阶段名判断</small></div>
        </div>

        <section className="collab-section" aria-labelledby="roles-heading">
          <SectionHeading eyebrow="01 / ROLE CONTRACTS" title="并行运行，各自带着自己的边界" detail="合同、知识范围、私有记忆、工具与质量规则在角色之间保持隔离。" icon={<LockKeyhole size={17} />} />
          <div className="collab-role-grid-large" id="roles-heading">{scene.roles.map((role) => <RoleContractCard key={role.id} role={role} />)}</div>
          <div className="collab-return-ribbon"><div className="collab-return-icon"><ArrowRight size={17} /></div><div><strong>同角色返场已确认</strong><span>shot-planner · {scene.filmId} · {scene.roles[0].memoryNamespace} · contract {scene.roles[0].contractVersion}</span></div><EvidenceTag tone="cyan">memory:film-zero-cost-001:shot-planner</EvidenceTag></div>
        </section>

        <section className="collab-section" aria-labelledby="graph-heading">
          <SectionHeading eyebrow="02 / RESPONSIBILITY GRAPH" title="责任图会跟着证据变化" detail="影片知识保存事实；责任图单独维护“谁负责什么”，可以拆分和重排而不污染知识节点。" icon={<Network size={17} />} />
          <ResponsibilityGraph />
          <div className="collab-assignment-grid">
            {scene.responsibilities.map((assignment) => <div className="collab-assignment" key={assignment.id}><span className="collab-assignment-index">{assignment.id.replace("assignment-", "0")}</span><div><strong>{assignment.scope}</strong><span>{assignment.owner}</span></div><div className="collab-assignment-state"><span>{assignment.state}</span>{assignment.change ? <small>{assignment.change}</small> : null}</div><EvidenceTag>{assignment.evidence}</EvidenceTag></div>)}
          </div>
        </section>

        <section className="collab-section" aria-labelledby="evidence-heading">
          <SectionHeading eyebrow="03 / EVIDENCE TRACE" title="从一条消息到一次有边界的采用" detail="时间线记录每个决定的来源；证据编号可回到单场景对话和后端验证夹具。" icon={<Activity size={17} />} />
          <div className="collab-evidence-layout">
            <div className="collab-timeline" id="evidence-heading">
              <div className="collab-timeline-line" />
              {scene.timeline.map((event) => <div className={`collab-timeline-event collab-timeline-${event.tone}`} key={event.id}><span className="collab-timeline-dot" /><time>{event.time}</time><div><div className="collab-event-heading"><strong>{event.label}</strong><span>{event.actor}</span></div><p>{event.detail}</p><EvidenceTag tone={event.tone === "amber" ? "amber" : event.tone === "cyan" ? "cyan" : event.tone === "green" ? "green" : "neutral"}>{event.evidence}</EvidenceTag></div></div>)}
            </div>
            <aside className="collab-transcript"><div className="collab-transcript-head"><span className="collab-micro-label">FULL SINGLE-SCENE DIALOGUE</span><MessageSquare size={17} /></div><p className="collab-transcript-note">单条用户消息 · 4 个内部回合 · 0 次付费生成</p>{scene.transcript.map((turn, index) => <div className="collab-transcript-turn" key={turn.evidence}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{turn.speaker}</strong><p>“{turn.text}”</p><EvidenceTag>{turn.evidence}</EvidenceTag></div></div>)}</aside>
          </div>
        </section>

        <section className="collab-split-section">
          <div className="collab-panel">
            <SectionHeading eyebrow="04 / DYNAMIC KNOWLEDGE" title="知识按任务选择" detail="角色合同只声明能力，供应商专属知识在运行时按 capability 读取。" icon={<Layers3 size={17} />} />
            <div className="collab-knowledge-list">{scene.providerSelections.map((selection) => <article className="collab-knowledge-row" key={selection.evidence}><div className="collab-knowledge-icon"><Database size={16} /></div><div className="collab-knowledge-main"><div><strong>{selection.provider}</strong><span>{selection.pack}</span></div><p>{selection.reason}</p><code>{selection.readPath}</code></div><EvidenceTag tone="cyan">{selection.evidence}</EvidenceTag></article>)}</div>
          </div>
          <div className="collab-panel">
            <SectionHeading eyebrow="05 / SPATIAL GATE" title="空间风险决定白模" detail="高风险必须有调用与结果，低风险的跳过也要有理由。" icon={<Box size={17} />} />
            <div className="collab-decision-list">{scene.spatialDecisions.map((decision) => <SpatialDecisionCard key={decision.shotId} decision={decision} />)}</div>
          </div>
        </section>

        <section className="collab-section collab-patch-section" aria-labelledby="patch-heading">
          <SectionHeading eyebrow="06 / SHOT-SCOPED ADOPTION" title="只修这一格，不覆盖整卷" detail="局部镜头修复携带 expectedVersion 和 evidenceRefs，其他已采用镜头保持原样。" icon={<Wrench size={17} />} />
          <div className="collab-patch-layout" id="patch-heading">
            <div className="collab-shot-strip"><div className="collab-shot adopted"><span>001</span><strong>ADOPTED</strong><small>v1 · low risk</small></div><div className="collab-shot adopted"><span>002</span><strong>ADOPTED</strong><small>v2 · medium</small></div><div className="collab-shot target"><span>003</span><strong>PATCH ONLY</strong><small>v1 → v2</small></div><div className="collab-shot adopted"><span>004</span><strong>ADOPTED</strong><small>v1 · low risk</small></div></div>
            {scene.patches.map((patch) => <article className="collab-patch-card" key={patch.shotId}><div className="collab-patch-title"><div><span className="collab-shot-id">{patch.shotId}</span><h3>{patch.candidate}</h3></div><EvidenceTag tone="amber">{patch.evidence}</EvidenceTag></div><div className="collab-patch-changes">{patch.changes.map((change) => <span key={change}><Check size={13} />{change}</span>)}</div><p className="collab-patch-boundary"><ShieldCheck size={15} />{patch.boundary}</p></article>)}
          </div>
        </section>

        <section className="collab-arbitration-section">
          <div className="collab-arbitration-mark"><Zap size={24} /></div>
          <div className="collab-arbitration-copy"><p className="collab-micro-label">07 / ARBITRATION DECISION</p><h2>分歧裁决也要能回放</h2><p>{scene.arbitration.rationale}</p><div className="collab-arbitration-meta"><span><FileCheck2 size={14} /> {scene.arbitration.id}</span><span><GitBranch size={14} /> {scene.arbitration.policy}</span><span><CheckCircle2 size={14} /> {scene.arbitration.conclusion}</span></div></div>
          <div className="collab-arbitration-evidence"><span>证据链</span>{scene.arbitration.evidence.map((evidence) => <div key={evidence}><ArrowRight size={13} />{evidence}</div>)}</div>
        </section>

        <section className="collab-readiness" aria-labelledby="readiness-heading"><div className="collab-readiness-head"><div><p className="collab-kicker"><span />READINESS / EVIDENCE-BASED</p><h2 id="readiness-heading">READY，理由写在这里</h2></div><div className="collab-ready-seal"><CheckCircle2 size={18} /><span>READY</span></div></div><div className="collab-readiness-grid">{scene.readiness.map((item) => <div key={item.label}><CheckCircle2 size={17} /><div><strong>{item.label}</strong><p>{item.detail}</p></div></div>)}</div></section>
      </div>
      <footer className="collab-footer"><span>HODOR / PRODUCTION COLLABORATION</span><span>READ-ONLY FIXTURE · NO PROVIDER CALLS · NO PANcat WRITES</span><span>{scene.filmId} / {scene.sceneId}</span></footer>
    </section>
  );
}
