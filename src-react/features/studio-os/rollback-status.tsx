import { useCallback, useEffect, useState } from "react";
import { RotateCcw, ShieldCheck } from "lucide-react";

import type { StudioOsApi } from "./studio-os-api";
import { EvidenceBinding, Field, LoadState, PendingState, SectionCard } from "./studio-os-ui";
import type { RollbackDomainOutput, StudioOsEvidenceRecord, StudioOsRollbackState } from "./types";

const ROLLBACK_DOMAIN = "rollback";

export interface RollbackStatusViewProps {
  api: StudioOsApi;
  domainRecord?: StudioOsEvidenceRecord | null;
  onRollbackInvoked?: (receiptId: string | null) => void;
  /** Controlled readback state for non-browser (server-side render) verification; skips the load effect. */
  initialState?: StudioOsRollbackState | null;
}

/**
 * Exact, idempotent rollback status. Shows the frozen rollback contract
 * binding (exactTargetRef artifact:target-policy-v5 -> lastKnownGoodRef
 * artifact:target-policy-v4), the rollback domain evidence receipt, and the
 * repeated-invocation readback proving the same receipt identity resolves on
 * every call.
 */
export function RollbackStatusView({ api, domainRecord, onRollbackInvoked, initialState }: RollbackStatusViewProps) {
  const [state, setState] = useState<StudioOsRollbackState | null>(initialState ?? null);
  const [loading, setLoading] = useState(initialState === undefined);
  const [error, setError] = useState("");
  const [invoking, setInvoking] = useState(false);
  const [reload, setReload] = useState(0);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const readback = await api.readRollbackState();
      setState(readback);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "回滚状态读取失败");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    if (initialState !== undefined) return;
    void refresh();
  }, [refresh, reload, initialState]);

  const invokeRollback = useCallback(async () => {
    setInvoking(true);
    setError("");
    try {
      const receipt = await api.readRollback();
      onRollbackInvoked?.(receipt.receiptId);
      setReload((value) => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "回滚调用失败");
    } finally {
      setInvoking(false);
    }
  }, [api, onRollbackInvoked]);

  const domainOutput = (domainRecord?.receipt?.domainOutput ?? null) as RollbackDomainOutput | null;

  return (
    <SectionCard title="回滚状态" description="精确幂等回滚 · artifact:target-policy-v5 → artifact:target-policy-v4 的只读回读">
      <div className="mb-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => void invokeRollback()}
          disabled={invoking}
          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-300 transition-colors hover:bg-amber-500/20 disabled:pointer-events-none disabled:opacity-50"
        >
          <RotateCcw aria-hidden="true" size={14} />
          {invoking ? "正在调用幂等回滚…" : "调用精确回滚"}
        </button>
        <span className="text-xs text-slate-500">重复调用应解析到同一回执标识。</span>
      </div>

      <LoadState loading={loading} error={error} empty={state == null ? <PendingState>回滚回读为空。</PendingState> : null}>
        {domainRecord ? (
          <div className="mb-4">
            <h4 className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-slate-500">
              <ShieldCheck aria-hidden="true" size={13} />
              回滚域证据
            </h4>
            <EvidenceBinding
              evidenceId={domainRecord.evidenceId}
              httpPath={domainRecord.receipt?.httpEvidencePath ?? domainRecord.evidenceId}
              databaseRecordId={domainRecord.receipt?.databaseRecordId ?? `db:${domainRecord.evidenceId}`}
              manifestSha256={domainRecord.manifestSha256}
              policyRef={domainRecord.policyRef}
            />
            {domainOutput ? (
              <dl className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <Field label="回滚 ok" value={domainOutput.ok == null ? "—" : String(domainOutput.ok)} />
                <Field label="追加 appended" value={domainOutput.appended == null ? "—" : String(domainOutput.appended)} />
                <Field label="精确恢复 restorationExact" value={domainOutput.restorationExact == null ? "—" : String(domainOutput.restorationExact)} />
              </dl>
            ) : null}
          </div>
        ) : null}

        {state ? (
          <div>
            <h4 className="mb-2 text-[11px] uppercase tracking-wide text-slate-500">幂等回读（重复调用）</h4>
            <dl className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Field label="回执数量 receiptCount" value={state.receiptCount} />
              <Field label="精确恢复至 v4 exactRestorationToV4" value={String(state.exactRestorationToV4)} />
              <Field label="重复调用同一回执 repeatSameReceipt" value={String(state.repeatReturnsSameReceipt)} />
            </dl>
            {state.receipt ? (
              <div className="mt-2 space-y-2">
                <Field label="回执标识 receiptId" value={String(state.receipt.receiptId ?? "—")} mono />
                <Field label="幂等键 idempotencyKey" value={String(state.receipt.idempotencyKey ?? "—")} mono />
                <Field label="精确目标 exactTargetRef" value={String(state.receipt.exactTargetRef ?? "—")} mono />
                <Field label="最近良好 lastKnownGoodRef" value={String(state.receipt.lastKnownGoodRef ?? "—")} mono />
                <Field label="恢复内容哈希 restoredContentSha256" value={String(state.receipt.restoredContentSha256 ?? "—")} mono />
              </div>
            ) : (
              <p className="mt-3 text-xs text-slate-500">尚未产生回滚回执。</p>
            )}
          </div>
        ) : null}
      </LoadState>
    </SectionCard>
  );
}
