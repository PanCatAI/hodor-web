import { LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";

/** Shared Studio OS presentation primitives. */

export function SectionCard({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-white/[0.02] p-5">
      <header className="mb-4">
        <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
        {description ? <p className="mt-1 text-xs text-slate-500">{description}</p> : null}
      </header>
      {children}
    </section>
  );
}

export function Field({ label, value, mono = false }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[11px] uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className={`break-all text-xs text-slate-200 ${mono ? "font-mono" : ""}`}>{value ?? "—"}</dd>
    </div>
  );
}

export function EvidenceBinding({
  evidenceId,
  httpPath,
  databaseRecordId,
  manifestSha256,
  policyRef,
}: {
  evidenceId: string;
  httpPath: string;
  databaseRecordId: string;
  manifestSha256?: string;
  policyRef?: string;
}) {
  return (
    <dl className="grid grid-cols-1 gap-2 rounded-lg border border-border/60 bg-[#0a0d13] p-3 sm:grid-cols-2">
      <Field label="证据标识 evidenceId" value={evidenceId} mono />
      <Field label="HTTP 回读路径 httpPath" value={httpPath} mono />
      <Field label="数据库记录 databaseRecordId" value={databaseRecordId} mono />
      <Field label="策略 policyRef" value={policyRef ?? "—"} mono />
      <div className="sm:col-span-2">
        <Field label="清单哈希 manifestSha256" value={manifestSha256 ?? "—"} mono />
      </div>
    </dl>
  );
}

export function LoadState({ loading, error, children, empty }: { loading: boolean; error: string; children: ReactNode; empty?: ReactNode }) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-slate-400">
        <LoaderCircle aria-hidden="true" className="animate-spin" size={16} />
        正在读取运行证据…
      </div>
    );
  }
  if (error) {
    return <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">读取失败：{error}</div>;
  }
  if (empty != null) return <>{empty}</>;
  return <>{children}</>;
}

export function PendingState({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-xs text-slate-500">{children}</div>;
}
