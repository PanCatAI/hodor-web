import { useEffect, useMemo, useState } from "react";
import { Activity, Archive, CheckCircle2, CircleDot, Clock3, GitBranch, LockKeyhole, RefreshCw, ShieldCheck, Workflow } from "lucide-react";

import { Button } from "@react/components/ui/button";
import type { HodorApiClient } from "@react/lib/api/client";
import { createStudioOsVnextApi, type StudioOsSnapshotResponse, type StudioOsTask } from "./studio-os-api";

interface StudioOsControlRoomPageProps {
  client: HodorApiClient;
  groupId: string;
  enabled: boolean;
}

const taskStatus: Record<string, string> = {
  ready: "待运行",
  leased: "已租约",
  generating: "生成中",
  verifying: "验证中",
  adopted: "已采用",
  invalidated: "已失效",
  failed: "失败",
};

const packetStatus: Record<string, string> = {
  draft: "草稿",
  production_ready: "生产就绪",
  leased: "已租约",
  generating: "生成中",
  adopted: "已采用",
  invalidated: "已失效",
};

function statusLabel(value: string, labels: Record<string, string>): string {
  return labels[value] ?? value;
}

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(date);
}

function statusTone(value: string): string {
  if (["adopted", "production_ready", "pass"].includes(value)) return "border-emerald-400/25 bg-emerald-400/10 text-emerald-300";
  if (["invalidated", "failed", "fail"].includes(value)) return "border-rose-400/25 bg-rose-400/10 text-rose-300";
  if (["verifying", "generating", "leased"].includes(value)) return "border-amber-300/25 bg-amber-300/10 text-amber-200";
  return "border-slate-400/20 bg-slate-400/10 text-slate-300";
}

function Metric({ label, value, detail, icon: Icon }: { label: string; value: string | number; detail: string; icon: typeof Activity }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#111722]/80 p-4 shadow-[0_16px_50px_rgba(0,0,0,0.18)]">
      <div className="flex items-center justify-between text-slate-500">
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em]">{label}</span>
        <Icon aria-hidden="true" className="size-4 text-cyan-300/70" />
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-100">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </div>
  );
}

function ReadOnlyBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-xs font-semibold text-cyan-200">
      <LockKeyhole aria-hidden="true" className="size-3.5" />
      只读观测
    </span>
  );
}

function TaskTree({ tasks }: { tasks: StudioOsTask[] }) {
  const roots = tasks.filter((task) => task.parentId === null);
  const childrenByParent = new Map<string, StudioOsTask[]>();
  tasks.filter((task) => task.parentId).forEach((task) => {
    const children = childrenByParent.get(task.parentId!) ?? [];
    children.push(task);
    childrenByParent.set(task.parentId!, children);
  });

  function renderTask(task: StudioOsTask, depth = 0): React.ReactNode {
    return (
      <div key={task.taskId} className="relative" style={{ marginLeft: `${depth * 18}px` }}>
        {depth > 0 ? <span className="absolute -left-3 top-0 h-6 w-px bg-white/10" /> : null}
        <div className="flex items-center gap-3 rounded-xl border border-white/8 bg-[#0d131d] px-3 py-3">
          <GitBranch aria-hidden="true" className="size-4 shrink-0 text-cyan-300/70" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-200">{task.title}</p>
            <p className="mt-1 truncate font-mono text-[10px] text-slate-600">{task.taskId}</p>
          </div>
          <span className={`shrink-0 rounded-full border px-2 py-1 text-[11px] ${statusTone(task.status)}`}>{statusLabel(task.status, taskStatus)}</span>
        </div>
        <div className="mt-2 space-y-2">{(childrenByParent.get(task.taskId) ?? []).map((child) => renderTask(child, depth + 1))}</div>
      </div>
    );
  }

  return roots.length ? <div className="space-y-2">{roots.map((task) => renderTask(task))}</div> : <p className="text-sm text-slate-500">暂无递归任务。</p>;
}

function SnapshotView({ response, onRefresh, loading }: { response: StudioOsSnapshotResponse; onRefresh: () => void; loading: boolean }) {
  const { snapshot } = response;
  const group = snapshot.groups[0];
  const passed = snapshot.verifications.filter((item) => item.verdict === "pass").length;
  const verificationRate = snapshot.verifications.length ? `${Math.round((passed / snapshot.verifications.length) * 100)}%` : "—";
  const frozenTuple = [
    ["qualityLevel", "production-ready"],
    ["complianceRegion", "locked"],
    ["candidateLineage", "host-bound"],
    ["schedulerClass", "heterogeneous"],
    ["accepted-sec/GPU-h", "frozen"],
  ];

  return (
    <main className="min-h-full bg-[#080c13] px-5 py-7 text-foreground lg:px-10 lg:py-10">
      <div className="mx-auto max-w-[1500px]">
        <header className="relative overflow-hidden rounded-[28px] border border-cyan-200/10 bg-[radial-gradient(circle_at_82%_12%,rgba(35,211,238,0.18),transparent_30%),linear-gradient(135deg,#121b28,#0b1018_55%,#11151d)] p-6 shadow-[0_24px_90px_rgba(0,0,0,0.3)] lg:p-8">
          <div className="absolute -right-16 -top-24 size-72 rounded-full border border-cyan-200/10" />
          <div className="absolute -right-4 -top-12 size-48 rounded-full border border-cyan-200/10" />
          <div className="relative flex flex-wrap items-start justify-between gap-6">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Studio OS / observation deck</p>
                <ReadOnlyBadge />
              </div>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-50 lg:text-4xl">Studio OS vNext 控制室</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">项目组运行时的受限读回：递归任务、生产镜头包、租约、验证和采用证据保持在同一条可追溯时间线上。</p>
            </div>
            <Button aria-label="刷新 Studio OS 快照" variant="ghost" onClick={onRefresh} disabled={loading} className="border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10">
              <RefreshCw aria-hidden="true" className={loading ? "mr-2 size-4 animate-spin" : "mr-2 size-4"} />
              刷新快照
            </Button>
          </div>
          <div className="relative mt-8 flex flex-wrap gap-x-8 gap-y-3 border-t border-white/10 pt-4 text-xs text-slate-500">
            <span>项目组 <strong className="ml-2 font-mono font-normal text-slate-300">{group?.name ?? "未命名"}</strong></span>
            <span>group <strong className="ml-2 font-mono font-normal text-slate-300">{group?.groupId ?? "—"}</strong></span>
            <span>revision <strong className="ml-2 font-mono font-normal text-cyan-200">{response.revision}</strong></span>
            <span className="inline-flex items-center gap-1.5 text-emerald-300"><CircleDot aria-hidden="true" className="size-3" /> 快照已读回</span>
          </div>
        </header>

        <section aria-label="运行摘要" className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="递归任务" value={snapshot.tasks.length} detail="项目组任务图节点" icon={Workflow} />
          <Metric label="Shot packets" value={snapshot.packets.length} detail={`${snapshot.packets.filter((item) => item.status === "production_ready").length} 个生产就绪`} icon={Archive} />
          <Metric label="活动租约" value={snapshot.leases.length} detail="worker lease / heartbeat 边界" icon={Clock3} />
          <Metric label="独立验证" value={verificationRate} detail={`${passed}/${snapshot.verifications.length} 条通过`} icon={ShieldCheck} />
        </section>

        <div className="mt-5 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-2xl border border-white/10 bg-[#0e141e] p-5">
            <div className="mb-5 flex items-center justify-between"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-200/60">Dependency graph</p><h2 className="mt-1 text-lg font-semibold text-slate-100">递归任务图</h2></div><GitBranch className="size-5 text-cyan-300/60" /></div>
            <TaskTree tasks={snapshot.tasks} />
          </section>

          <section className="rounded-2xl border border-white/10 bg-[#0e141e] p-5">
            <div className="mb-5 flex items-center justify-between"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-200/60">Frozen evaluation tuple</p><h2 className="mt-1 text-lg font-semibold text-slate-100">冻结评价元组</h2></div><LockKeyhole className="size-5 text-cyan-300/60" /></div>
            <div className="divide-y divide-white/8 rounded-xl border border-white/8 bg-[#0b1018] px-4">{frozenTuple.map(([key, value]) => <div key={key} className="flex items-center justify-between gap-4 py-3 text-xs"><span className="font-mono text-slate-500">{key}</span><span className="text-right font-medium text-slate-200">{value}</span></div>)}</div>
            <div className="mt-4 rounded-xl border border-amber-300/15 bg-amber-300/5 p-3 text-xs leading-5 text-amber-100/70">社区加速保持 trial pool；候选生成和验证仅读回元数据，不展示密封留出集引用、内容或结果。</div>
          </section>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          <section className="rounded-2xl border border-white/10 bg-[#0e141e] p-5"><div className="mb-4 flex items-center gap-2"><Archive className="size-4 text-cyan-300/70" /><h2 className="text-lg font-semibold text-slate-100">Production-ready shot packets</h2></div><div className="space-y-2">{snapshot.packets.map((packet) => <div key={packet.packetId} className="flex items-center gap-3 rounded-xl border border-white/8 bg-[#0b1018] px-3 py-3"><div className="min-w-0 flex-1"><p className="text-sm text-slate-200">{packet.shotId}</p><p className="mt-1 font-mono text-[10px] text-slate-600">{packet.packetId}</p></div><span className={`rounded-full border px-2 py-1 text-[11px] ${statusTone(packet.status)}`}>{statusLabel(packet.status, packetStatus)}</span></div>)}{snapshot.packets.length === 0 ? <p className="text-sm text-slate-500">暂无 shot packet。</p> : null}</div></section>
          <section className="rounded-2xl border border-white/10 bg-[#0e141e] p-5"><div className="mb-4 flex items-center gap-2"><Activity className="size-4 text-cyan-300/70" /><h2 className="text-lg font-semibold text-slate-100">证据追加日志</h2></div><div className="space-y-2">{snapshot.events.slice(-6).reverse().map((event) => <div key={event.eventId} className="flex items-center gap-3 rounded-xl border border-white/8 bg-[#0b1018] px-3 py-3"><CheckCircle2 className="size-4 shrink-0 text-emerald-300/70" /><div className="min-w-0 flex-1"><p className="truncate font-mono text-xs text-slate-200">{event.type}</p><p className="mt-1 text-[10px] text-slate-600">#{event.sequence} · {formatTime(event.occurredAt)}</p></div></div>)}{snapshot.events.length === 0 ? <p className="text-sm text-slate-500">暂无事件。</p> : null}</div></section>
        </div>
      </div>
    </main>
  );
}

export function StudioOsControlRoomPage({ client, groupId, enabled }: StudioOsControlRoomPageProps) {
  const api = useMemo(() => createStudioOsVnextApi(client), [client]);
  const [response, setResponse] = useState<StudioOsSnapshotResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setLoading(true);
    setError(null);
    void api.readSnapshot(groupId).then((next) => {
      if (!next) throw new Error("Studio OS 快照不存在");
      if (active) setResponse(next);
    }).catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : "Studio OS 快照读取失败");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [api, enabled, groupId, refreshVersion]);

  if (!enabled) return <main className="grid min-h-full place-items-center bg-[#080c13] px-6 py-16 text-center"><div><LockKeyhole className="mx-auto size-8 text-slate-600" /><h1 className="mt-4 text-2xl font-semibold text-slate-200">Studio OS vNext 控制室未启用</h1><p className="mt-2 text-sm text-slate-500">只读控制室由 VITE_STUDIO_OS_VNEXT_ENABLED 开关控制。</p></div></main>;
  if (error) return <main className="grid min-h-full place-items-center bg-[#080c13] px-6 py-16 text-center"><div><p role="alert" className="text-sm text-rose-300">{error}</p><Button className="mt-5" onClick={() => setRefreshVersion((value) => value + 1)}>重新加载</Button></div></main>;
  if (!response) return <main className="grid min-h-full place-items-center bg-[#080c13] px-6 py-16 text-sm text-slate-500">正在读取 Studio OS 快照…</main>;
  return <SnapshotView response={response} onRefresh={() => setRefreshVersion((value) => value + 1)} loading={loading} />;
}
