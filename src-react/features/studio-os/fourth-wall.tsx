import { useEffect, useState } from "react";
import { Ban, CheckCircle2, RotateCcw, UserCheck } from "lucide-react";

import type { StudioOsApi } from "./studio-os-api";
import { EvidenceBinding, Field, LoadState, PendingState, SectionCard } from "./studio-os-ui";
import type { FourthWallEvent, FourthWallOutput, StudioOsEvidenceRecord } from "./types";

const FOURTH_WALL_DOMAIN = "fourth-wall-interaction";

const EVENT_LABELS: Record<string, string> = {
  "consent-required": "显式同意（consent）",
  "diegetic-turn": "叙事内回合（diegetic）",
  "continuity-refusal": "连续性拒绝（continuity refusal）",
  "non-diegetic-refusal": "非叙事副作用拒绝（non-diegetic refusal）",
  reversal: "个性化回退（reversal）",
};

function eventVerdict(event: FourthWallEvent): { ok: boolean; text: string } {
  if (event.event === "consent-required") {
    return { ok: event.ok === true, text: `同意开启 ${event.ok ? "通过" : "失败"} · 无同意拒绝 ${event.refusalOk ? "生效" : "未生效"}` };
  }
  if (event.event === "continuity-refusal" || event.event === "non-diegetic-refusal") {
    return { ok: event.ok === true, text: event.errors?.join("; ") ?? (event.ok ? "已拒绝" : "未按预期拒绝") };
  }
  if (event.event === "reversal") {
    return { ok: event.ok === true, text: "个性化已回退并恢复被覆盖键" };
  }
  return { ok: event.ok === true, text: event.turns != null ? `回合数 ${event.turns}` : (event.ok ? "通过" : "失败") };
}

function FourthWallEvents({ events }: { events: FourthWallEvent[] }) {
  return (
    <ul className="space-y-2">
      {events.map((event, index) => {
        const verdict = eventVerdict(event);
        const Icon = event.event === "reversal" ? RotateCcw : event.event.endsWith("-refusal") ? Ban : event.event === "consent-required" ? UserCheck : CheckCircle2;
        return (
          <li key={`${event.event}-${index}`} className="flex items-start gap-2 rounded-lg border border-border/60 bg-[#0a0d13] px-3 py-2 text-xs">
            <Icon aria-hidden="true" size={14} className={`mt-0.5 shrink-0 ${verdict.ok ? "text-emerald-400" : "text-red-400"}`} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-slate-200">{EVENT_LABELS[event.event] ?? event.event}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] ${verdict.ok ? "bg-emerald-500/10 text-emerald-300" : "bg-red-500/10 text-red-300"}`}>
                  {verdict.ok ? "通过" : "拒绝/失败"}
                </span>
              </div>
              <p className="mt-1 text-slate-500">{verdict.text}</p>
              {event.state && Object.keys(event.state).length ? (
                <pre className="mt-1 overflow-x-auto rounded bg-black/40 p-2 font-mono text-[10px] text-slate-400">
                  {JSON.stringify(event.state, null, 2)}
                </pre>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export interface FourthWallViewProps {
  api: StudioOsApi;
  record?: StudioOsEvidenceRecord | null;
  onRecordChange?: (record: StudioOsEvidenceRecord | null) => void;
}

/**
 * Opt-in fourth-wall interaction: explicit consent, bounded session state,
 * consent continuity, diegetic-only targets, reversible personalization, and
 * refusal receipts — bound to the canonical evidence identifier.
 */
export function FourthWallView({ api, record: controlledRecord, onRecordChange }: FourthWallViewProps) {
  const [record, setRecord] = useState<StudioOsEvidenceRecord | null>(controlledRecord ?? null);
  const [loading, setLoading] = useState(controlledRecord === undefined);
  const [error, setError] = useState("");

  useEffect(() => {
    if (controlledRecord !== undefined) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    void (async () => {
      try {
        const list = await api.listEvidence();
        const item = list.evidence.find((entry) => entry.domain === FOURTH_WALL_DOMAIN);
        if (!item) {
          if (!cancelled) setRecord(null);
          return;
        }
        const readback = await api.readEvidence(item.evidenceId);
        if (!cancelled) {
          setRecord(readback.record);
          onRecordChange?.(readback.record);
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "第四墙互动读取失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, controlledRecord, onRecordChange]);

  const output = (record?.receipt?.domainOutput ?? {}) as FourthWallOutput;

  return (
    <SectionCard title="第四墙互动" description="选择加入（opt-in）、有界会话、连续性校验、可回退个性化与非叙事安全边界">
      <LoadState
        loading={loading}
        error={error}
        empty={
          !record ? (
            <PendingState>
              尚未发现第四墙互动证据（fourth-wall-interaction）。请先在“证据状态”中创建一次十域运行。
            </PendingState>
          ) : null
        }
      >
        {!record ? null : (
          <div className="space-y-4">
            <EvidenceBinding
              evidenceId={record.evidenceId}
              httpPath={record.receipt?.httpEvidencePath ?? record.evidenceId}
              databaseRecordId={record.receipt?.databaseRecordId ?? `db:${record.evidenceId}`}
              manifestSha256={record.manifestSha256}
              policyRef={record.policyRef}
            />
            <dl className="grid grid-cols-1 gap-2 sm:grid-cols-4">
              <Field label="模式 mode" value={output.mode ?? "—"} />
              <Field label="必须同意 consentRequired" value={output.consentRequired == null ? "—" : String(output.consentRequired)} />
              <Field label="最大回合 maxTurns" value={output.bounded?.maxTurns ?? "—"} />
              <Field label="TTL 分钟" value={output.bounded?.ttlMinutes ?? "—"} />
            </dl>
            <div>
              <h4 className="mb-2 text-[11px] uppercase tracking-wide text-slate-500">会话事件 receipts</h4>
              <FourthWallEvents events={output.events ?? []} />
            </div>
            <div>
              <h4 className="mb-2 text-[11px] uppercase tracking-wide text-slate-500">当前个性化状态</h4>
              <pre className="overflow-x-auto rounded-lg bg-[#0a0d13] p-3 font-mono text-[11px] text-slate-300">
                {JSON.stringify(output.personalization ?? {}, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </LoadState>
    </SectionCard>
  );
}
