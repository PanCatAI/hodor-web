import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { AlertTriangle, ArrowDownRight, CheckCircle2, CircleDashed, Clock3, GitBranch, Layers3, RefreshCw, RotateCcw, ShieldCheck, Sparkles, Users, XCircle } from "lucide-react";

import type { StudioOsApi } from "./studio-os-api";
import { deriveControlRoom, normalizeStudioSnapshot, type ControlRoomModel } from "./studio-os-model";
import type { StudioAsset, StudioOsSnapshot, StudioTask, StudioTaskStatus } from "./studio-os-types";

interface StudioOsPageProps {
  projectId: number;
  groupId: string;
  api: StudioOsApi;
}

const statusLabels: Record<StudioTaskStatus, string> = {
  draft: "草稿", ready: "待处理", leased: "已租约", generating: "生成中", verifying: "验证中", adopted: "已采用", invalidated: "已失效", failed: "失败",
};

function Panel({ eyebrow, title, detail, children, className = "" }: { eyebrow: string; title: string; detail?: string; children: ReactNode; className?: string }) {
  return <section className={`studio-panel ${className}`}><div className="studio-panel-heading"><div><span className="studio-eyebrow">{eyebrow}</span><h2>{title}</h2>{detail ? <p>{detail}</p> : null}</div></div>{children}</section>;
}

function StatusPill({ status }: { status: string }) {
  const tone = status === "adopted" || status === "completed" ? "good" : status === "failed" || status === "invalidated" ? "bad" : status === "not_reported" ? "muted" : "live";
  return <span className={`studio-status studio-status-${tone}`}><span />{statusLabels[status as StudioTaskStatus] ?? status}</span>;
}

function formatTime(value: string | undefined): string {
  if (!value) return "—";
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(time) : value;
}

function treeRows(snapshot: StudioOsSnapshot): Array<{ task: StudioTask; depth: number }> {
  const byParent = new Map<string | null, StudioTask[]>();
  for (const task of snapshot.tasks) byParent.set(task.parentId, [...(byParent.get(task.parentId) ?? []), task]);
  const rows: Array<{ task: StudioTask; depth: number }> = [];
  const visit = (task: StudioTask, depth: number, path: Set<string>) => {
    if (path.has(task.taskId)) return;
    rows.push({ task, depth });
    const nextPath = new Set(path).add(task.taskId);
    for (const child of byParent.get(task.taskId) ?? []) visit(child, depth + 1, nextPath);
  };
  for (const root of byParent.get(null) ?? []) visit(root, 0, new Set());
  for (const task of snapshot.tasks) if (!rows.some((row) => row.task.taskId === task.taskId)) visit(task, 0, new Set());
  return rows;
}

function assetTypeLabel(type: StudioAsset["type"]): string {
  return { source_text: "原文", character: "角色", location: "场景", prop: "道具", style: "风格", audio: "音频", image: "图片", video: "视频", shot_video: "镜头视频", evidence: "证据" }[type];
}

function readEvidenceRefs(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item === "string") return [item];
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    return [typeof record.evidenceRef === "string" ? record.evidenceRef : ""].filter(Boolean);
  });
}

function EvidenceLink({ value }: { value: string }) {
  return <code className="studio-evidence">{value}</code>;
}

export function StudioOsPage({ projectId, groupId, api }: StudioOsPageProps) {
  const [snapshot, setSnapshot] = useState<StudioOsSnapshot | null>(null);
  const [revision, setRevision] = useState<number | null>(null);
  const [epycEvidence, setEpycEvidence] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await api.getSnapshot(groupId);
      setRevision(response.revision);
      setSnapshot(normalizeStudioSnapshot(response.snapshot, groupId));
      try { setEpycEvidence(await api.getEvidence(groupId)); } catch { setEpycEvidence(null); }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "项目组控制室读取失败");
      setSnapshot(null);
    } finally {
      setLoading(false);
    }
  }, [api, groupId]);

  useEffect(() => { void load(); }, [load]);

  const model = useMemo<ControlRoomModel | null>(() => snapshot ? deriveControlRoom(snapshot, groupId) : null, [groupId, snapshot]);
  const rows = useMemo(() => snapshot ? treeRows(snapshot) : [], [snapshot]);
  const activeLeases = snapshot?.leases.length ?? 0;
  const queueCount = snapshot?.tasks.filter((task) => ["ready", "leased", "generating", "verifying"].includes(task.status)).length ?? 0;
  const adoptedCount = snapshot?.assets.filter((asset) => asset.provenance.source === "candidate_adoption" && asset.status === "active").length ?? 0;
  const invalidatedCount = snapshot?.assets.filter((asset) => asset.status === "invalidated").length ?? 0;

  async function adopt(taskId: string, batchId: string, candidateId: string) {
    const idempotencyKey = `adopt:${groupId}:${taskId}:${candidateId}`;
    setBusyAction(idempotencyKey);
    setNotice("");
    try { await api.adoptCandidate({ groupId, taskId, batchId, candidateId, idempotencyKey }); setNotice(`候选 ${candidateId} 已提交采用，正在回读权威快照。`); await load(); }
    catch (cause) { setNotice(cause instanceof Error ? cause.message : "候选采用失败"); }
    finally { setBusyAction(""); }
  }

  async function rollback(taskId: string) {
    const idempotencyKey = `rollback:${groupId}:${taskId}`;
    setBusyAction(idempotencyKey);
    setNotice("");
    try { await api.rollbackAdoption({ groupId, taskId, actorRef: "studio-os-control-room", idempotencyKey }); setNotice(`任务 ${taskId} 已提交回滚，正在回读权威快照。`); await load(); }
    catch (cause) { setNotice(cause instanceof Error ? cause.message : "采用回滚失败"); }
    finally { setBusyAction(""); }
  }

  return <section className="studio-page" data-testid="studio-os-control-room">
    <div className="studio-page-glow" aria-hidden="true" />
    <header className="studio-hero">
      <div><div className="studio-kicker"><Sparkles size={14} /> STUDIO OS / PROJECT GROUP CONTROL ROOM</div><h1>{model?.group?.name ?? `项目组 ${groupId}`}</h1><p>故事室的决定、导演室的镜头上下文与递归生产图，共用 Hodor 权威快照。页面不维护第二份数据库真相，也不提供生产发布入口。</p><div className="studio-hero-meta"><span>project {model?.group?.projectId ?? projectId}</span><span>group {groupId}</span><span>revision {revision ?? "—"}</span></div></div>
      <div className="studio-hero-aside"><span className="studio-eyebrow">AUTHORITY READBACK</span><strong>{model?.group?.status === "archived" ? "ARCHIVED" : model ? "LIVE SNAPSHOT" : "WAITING"}</strong><small>Hodor HTTP · {formatTime(model?.group?.updatedAt)}</small><button type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={14} className={loading ? "studio-spin" : ""} />刷新快照</button></div>
    </header>

    {error ? <div role="alert" className="studio-error"><AlertTriangle size={17} /><div><strong>控制室暂时无法读取权威快照</strong><p>{error}</p><button type="button" onClick={() => void load()}>重试读取</button></div></div> : null}
    {notice ? <div role="status" className="studio-notice"><CheckCircle2 size={16} />{notice}</div> : null}
    {loading && !snapshot ? <div className="studio-loading" aria-label="正在读取控制室"><span /><span /><span /></div> : null}

    {snapshot && model ? <>
      <div className="studio-metrics"><div><span>递归任务</span><strong>{snapshot.tasks.length}</strong><small>{queueCount} 个在队列中</small></div><div><span>采用资产</span><strong>{adoptedCount}</strong><small>{invalidatedCount} 个已失效</small></div><div><span>工作租约</span><strong>{activeLeases}</strong><small>{new Set(snapshot.leases.map((lease) => lease.workerId)).size} 个 worker</small></div><div><span>验证失败</span><strong className={model.verificationFailures.length ? "studio-number-bad" : ""}>{model.verificationFailures.length}</strong><small>按阻塞节点聚合</small></div></div>

      <div className="studio-main-grid">
        <Panel eyebrow="01 / STORY ROOM" title="故事室上下文" detail="只读展示已记录的叙事决定和上游任务。"><div className="studio-context-list">{snapshot.decisions.length ? snapshot.decisions.map((decision) => <article key={decision.decisionId}><span className="studio-context-icon"><GitBranch size={15} /></span><div><strong>{decision.subjectId}</strong><p>{decision.rationale}</p><small>{decision.actorRef} · {decision.outcome} · {formatTime(decision.createdAt)}</small><div>{decision.evidenceRefs.map((ref) => <EvidenceLink key={ref} value={ref} />)}</div></div></article>) : <div className="studio-empty">尚无故事决定记录。</div>}</div></Panel>
        <Panel eyebrow="02 / DIRECTOR ROOM" title="导演室上下文" detail="镜头包、资产准备度和合同版本都来自同一份快照。"><div className="studio-context-list">{snapshot.packets.length ? snapshot.packets.map((packet) => <article key={packet.packetId}><span className="studio-context-icon studio-context-icon-cyan"><Layers3 size={15} /></span><div><strong>{packet.shotId}</strong><p>{packet.packetId} · {packet.readiness.contractVersion}</p><small>{packet.status} · 缺少 {packet.readiness.missingAssetTypes.length ? packet.readiness.missingAssetTypes.map(assetTypeLabel).join("、") : "无"}</small></div><StatusPill status={packet.status} /></article>) : <div className="studio-empty">尚无镜头包记录。</div>}</div></Panel>
      </div>

      <Panel eyebrow="03 / RECURSIVE PRODUCTION GRAPH" title="递归生产图" detail="依赖关系由 parentId、childTaskIds 和资产引用组成；节点状态保留后端原值。" className="studio-graph-panel"><div className="studio-graph">{rows.length ? rows.map(({ task, depth }) => <div className="studio-task-row" key={task.taskId} style={{ "--depth": depth } as CSSProperties}><span className="studio-tree-line"><ArrowDownRight size={14} /></span><div className="studio-task-name"><strong>{task.title}</strong><small>{task.taskId} · {task.kind} · contract {task.contract.version}</small></div><span className="studio-task-assets">{task.inputAssetIds.length} in / {task.outputAssetIds.length} out</span><StatusPill status={task.status} /></div>) : <div className="studio-empty">权威快照里没有递归任务。</div>}</div></Panel>

      <div className="studio-main-grid">
        <Panel eyebrow="04 / ADOPTION & IMPACT" title="采用资产与失效影响" detail="采用和回滚都通过 Hodor API；页面只在服务端回读后更新状态。"><div className="studio-asset-list">{snapshot.assets.length ? snapshot.assets.map((asset) => { const impact = model.impactForAsset(asset.assetId); return <article key={asset.assetId}><div className="studio-asset-top"><div><strong>{assetTypeLabel(asset.type)}</strong><span>{asset.assetId}</span></div><StatusPill status={asset.status} /></div><p>{asset.contentRef}</p><small>来源 {asset.provenance.source} · {asset.provenance.sourceRef}</small><div className="studio-impact">{impact.length ? <><span>影响 {impact.length} 个任务</span>{impact.slice(0, 3).map((task) => <code key={task.taskId}>{task.taskId}</code>)}</> : <span>暂无下游依赖</span>}</div></article>; }) : <div className="studio-empty">尚无资产记录。</div>}</div></Panel>
        <Panel eyebrow="05 / WORKERS & RESOURCE QUEUE" title="工作节点与资源队列" detail="租约代表服务端已分配的工作权；控制室不会直接调度或发布。"><div className="studio-worker-list">{snapshot.leases.length ? snapshot.leases.map((lease) => <article key={lease.leaseId}><span className="studio-worker-icon"><Users size={15} /></span><div><strong>{lease.workerId}</strong><p>{lease.taskId} · lease {lease.leaseId}</p><small>心跳 {formatTime(lease.heartbeatAt)} · 到期 {formatTime(lease.expiresAt)}</small></div><StatusPill status="leased" /></article>) : <div className="studio-empty">当前没有活动租约；队列状态仍以任务列表为准。</div>}{epycEvidence ? <div className="studio-resource-receipt"><ShieldCheck size={15} /><span>EPYC 证据已回读</span><code>{Array.isArray(epycEvidence) ? `${epycEvidence.length} refs` : "authority response"}</code></div> : <div className="studio-resource-receipt studio-resource-muted"><CircleDashed size={15} /><span>EPYC 证据入口未报告数据</span></div>}</div></Panel>
      </div>

      <div className="studio-main-grid">
        <Panel eyebrow="06 / VERIFICATION FAILURES" title="验证失败聚合" detail="失败停在产生问题的候选或任务节点，证据引用保持可回读。"><div className="studio-failure-list">{model.verificationFailures.length ? model.verificationFailures.map((failure) => <article key={failure.id}><XCircle size={17} /><div><strong>{failure.title}</strong><p>{failure.detail}</p><div>{failure.evidenceRefs.length ? failure.evidenceRefs.map((ref) => <EvidenceLink key={ref} value={ref} />) : <span className="studio-muted-text">未提供证据引用</span>}</div></div></article>) : <div className="studio-empty studio-empty-good"><CheckCircle2 size={16} />当前没有失败聚合。</div>}</div></Panel>
        <Panel eyebrow="07 / EVOLUTION READBACK" title="replay / shadow / canary / rollback" detail="演化状态只从权威事件推导；没有事件就显示未报告，不以页面阶段名代替证据。"><div className="studio-evolution-list">{Object.entries(model.evolution).map(([stage, state]) => <article key={stage}><div><strong>{stage}</strong><small>{state.eventId ?? "no authority event"}</small></div><StatusPill status={state.status} /><div className="studio-evolution-evidence">{state.evidenceRefs.length ? state.evidenceRefs.map((ref) => <EvidenceLink key={ref} value={ref} />) : <span className="studio-muted-text">证据未报告</span>}</div></article>)}</div></Panel>
      </div>

      <Panel eyebrow="08 / VERIFIED CANDIDATES" title="候选采用与精确回滚" detail="只有通过独立验证的候选可采用；动作使用项目组、任务和候选组成的幂等键。"><div className="studio-candidate-list">{snapshot.batches.length ? snapshot.batches.flatMap((batch) => batch.candidates.map((candidate) => { const verification = snapshot.verifications.find((item) => item.batchId === batch.batchId && item.candidateId === candidate.candidateId); const task = snapshot.tasks.find((item) => item.taskId === batch.taskId); const key = `adopt:${groupId}:${batch.taskId}:${candidate.candidateId}`; return <article key={candidate.candidateId}><div><strong>{candidate.candidateId}</strong><p>{batch.batchId} · {candidate.contentRef}</p><small>{verification ? `verdict ${verification.verdict} · ${verification.verifierId}` : "尚无独立验证"}</small></div>{verification?.verdict === "pass" && task?.status !== "adopted" ? <button type="button" onClick={() => void adopt(batch.taskId, batch.batchId, candidate.candidateId)} disabled={busyAction === key}><CheckCircle2 size={14} />采用候选</button> : verification?.verdict === "pass" && task ? <button type="button" className="studio-button-quiet" onClick={() => void rollback(task.taskId)} disabled={busyAction === `rollback:${groupId}:${task.taskId}`}><RotateCcw size={14} />回滚采用</button> : <span className="studio-muted-text">{verification?.verdict === "fail" ? "验证未通过" : "等待验证"}</span>}</article>; })) : <div className="studio-empty">尚无候选批次。</div>}</div></Panel>

      <footer className="studio-footer"><span><Clock3 size={13} /> snapshot revision {revision}</span><span>authority: Hodor HTTP</span><span>provider calls 0 · production publishes 0</span><span>evidence refs {snapshot.events.length + readEvidenceRefs(epycEvidence).length}</span></footer>
    </> : null}
  </section>;
}
