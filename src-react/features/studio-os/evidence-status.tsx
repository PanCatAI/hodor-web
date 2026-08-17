import { useCallback, useEffect, useMemo, useState } from "react";
import { Database, FileCheck2, RefreshCw, PlusCircle } from "lucide-react";

import type { StudioOsApi } from "./studio-os-api";
import { EvidenceBinding, Field, LoadState, PendingState, SectionCard } from "./studio-os-ui";
import { DOMAIN_LABELS, type StudioOsEvidenceSummary, type StudioOsPackageReadback } from "./types";

export interface EvidenceStatusViewProps {
  api: StudioOsApi;
  onEvidenceCreated?: (runId: string, evidenceIds: string[]) => void;
  /** Controlled data for non-browser (server-side render) verification; skips the load effect. */
  initialEvidence?: StudioOsEvidenceSummary[];
  initialPackage?: StudioOsPackageReadback | null;
  initialEvidenceReadback?: Record<string, unknown> | null;
}

function evidenceDomainLabel(domain: string): string {
  return (DOMAIN_LABELS as Record<string, string>)[domain] ?? domain;
}

function PackageReadback({ packageReadback }: { packageReadback: StudioOsPackageReadback }) {
  const matched = packageReadback.manifestMatchesFreeze;
  return (
    <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <Field label="清单哈希 manifestSha256" value={packageReadback.manifestSha256 ?? "—"} mono />
      <Field label="冻结边界清单 freezeBound" value={packageReadback.freezeBoundManifestSha256 ?? "—"} mono />
      <Field label="清单与冻结一致 manifestMatchesFreeze" value={matched == null ? "—" : String(matched)} />
      <Field label="源码字节承诺 verified" value={packageReadback.sourceByteCommitmentsVerified == null ? "—" : String(packageReadback.sourceByteCommitmentsVerified)} />
      <Field label="语料快照 corpusSnapshotSha256" value={packageReadback.corpusSnapshotSha256 ?? "—"} mono />
      <Field label="等额预算校验 equalBudgetVerified" value={packageReadback.equalBudgetVerified == null ? "—" : String(packageReadback.equalBudgetVerified)} />
    </dl>
  );
}

/**
 * Evidence status: every PostgreSQL-persisted evidence record read back by
 * HTTP, its canonical HTTP evidence identifier and database record identity,
 * plus the frozen v5 package readback and evidence-resolution status.
 */
export function EvidenceStatusView({ api, onEvidenceCreated, initialEvidence, initialPackage, initialEvidenceReadback }: EvidenceStatusViewProps) {
  const [evidence, setEvidence] = useState<StudioOsEvidenceSummary[]>(initialEvidence ?? []);
  const [packageReadback, setPackageReadback] = useState<StudioOsPackageReadback | null>(initialPackage ?? null);
  const [evidenceReadback, setEvidenceReadback] = useState<Record<string, unknown> | null>(initialEvidenceReadback ?? null);
  const [loading, setLoading] = useState(initialEvidence === undefined);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [lastRunId, setLastRunId] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [list, pkg, readback] = await Promise.all([api.listEvidence(), api.readPackage(), api.readEvidenceReadback()]);
      setEvidence(list.evidence);
      setPackageReadback(pkg);
      setEvidenceReadback(readback);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "证据状态读取失败");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    if (initialEvidence !== undefined) return;
    void refresh();
  }, [refresh, reload, initialEvidence]);

  const createRun = useCallback(async () => {
    setCreating(true);
    setError("");
    try {
      const created = await api.createRun({ requestSeed: "frontend-studio-os-sweep" });
      setLastRunId(created.runId);
      onEvidenceCreated?.(created.runId, created.evidenceIds);
      setReload((value) => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "创建十域运行失败");
    } finally {
      setCreating(false);
    }
  }, [api, onEvidenceCreated]);

  const resolution = useMemo(() => {
    if (!evidenceReadback || typeof evidenceReadback !== "object") return null;
    const allResolved = evidenceReadback.allRequiredEvidenceResolved;
    const resolutions = Array.isArray(evidenceReadback.resolutions) ? (evidenceReadback.resolutions as Array<{ ref: string; resolved: boolean }>) : null;
    return { allResolved: typeof allResolved === "boolean" ? allResolved : null, resolutions };
  }, [evidenceReadback]);

  const runGroups = useMemo(() => {
    const groups = new Map<string, StudioOsEvidenceSummary[]>();
    for (const item of evidence) {
      const list = groups.get(item.runId) ?? [];
      list.push(item);
      groups.set(item.runId, list);
    }
    return [...groups.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [evidence]);

  return (
    <SectionCard title="证据状态" description="PostgreSQL 持久化证据的 HTTP 回读状态，与后端证据标识严格绑定">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void createRun()}
          disabled={creating}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
        >
          <PlusCircle aria-hidden="true" size={14} />
          {creating ? "正在创建十域运行…" : "创建十域运行"}
        </button>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white/[0.03] px-3 py-2 text-xs text-slate-300 transition-colors hover:bg-white/5 disabled:opacity-50"
        >
          <RefreshCw aria-hidden="true" size={14} className={loading ? "animate-spin" : ""} />
          刷新
        </button>
        {lastRunId ? <span className="text-xs text-slate-500">最近运行：{lastRunId}</span> : null}
      </div>

      <LoadState loading={loading} error={error}>
        <div className="space-y-5">
          {packageReadback ? (
            <div>
              <h4 className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-slate-500">
                <FileCheck2 aria-hidden="true" size={13} />
                冻结 v5 包回读
              </h4>
              <PackageReadback packageReadback={packageReadback} />
            </div>
          ) : null}

          {resolution ? (
            <div>
              <h4 className="mb-2 text-[11px] uppercase tracking-wide text-slate-500">证据解析状态 evidence-readback</h4>
              <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Field label="全部必需证据已解析" value={resolution.allResolved == null ? "—" : String(resolution.allResolved)} />
                <Field label="已解析条目" value={resolution.resolutions ? `${resolution.resolutions.filter((r) => r.resolved).length}/${resolution.resolutions.length}` : "—"} />
              </dl>
            </div>
          ) : null}

          {runGroups.length === 0 ? (
            <PendingState>尚未持久化任何运行证据。</PendingState>
          ) : (
            runGroups.map(([runId, items]) => (
              <div key={runId}>
                <h4 className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-slate-500">
                  <Database aria-hidden="true" size={13} />
                  运行 {runId} · {items.length} 条证据
                </h4>
                <div className="space-y-3">
                  {items.map((item) => (
                    <div key={item.evidenceId}>
                      <p className="mb-1 text-xs font-medium text-slate-300">{evidenceDomainLabel(item.domain)}</p>
                      <EvidenceBinding
                        evidenceId={item.evidenceId}
                        httpPath={item.httpPath}
                        databaseRecordId={item.databaseRecordId}
                        manifestSha256={item.manifestSha256}
                        policyRef={item.policyRef}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </LoadState>
    </SectionCard>
  );
}
