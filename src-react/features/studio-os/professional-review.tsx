import { useEffect, useState } from "react";
import { CheckCircle2, TriangleAlert } from "lucide-react";

import type { StudioOsApi } from "./studio-os-api";
import { EvidenceBinding, Field, LoadState, PendingState, SectionCard } from "./studio-os-ui";
import type { ProfessionalReviewOutput, StudioOsEvidenceRecord } from "./types";

const REVIEW_DOMAIN = "professional-screenwriter-review";

function ReviewSummary({ output }: { output: ProfessionalReviewOutput }) {
  const scores = output.scores ?? {};
  const total = output.total ?? Object.values(scores).reduce((sum, value) => sum + value, 0);
  const status = output.status ?? (output.total != null && output.gate?.minimumTotal != null && output.total >= output.gate.minimumTotal ? "approved" : "needs-revision");
  const approved = status === "approved";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
            approved ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"
          }`}
        >
          {approved ? <CheckCircle2 aria-hidden="true" size={14} /> : <TriangleAlert aria-hidden="true" size={14} />}
          {approved ? "通过 approved" : "需修改 needs-revision"}
        </span>
        <span className="inline-flex rounded-full bg-white/5 px-3 py-1 text-xs text-slate-300">
          总分 {total} / 门槛 {output.gate?.minimumTotal ?? "—"}
        </span>
        <span className="text-xs text-slate-500">修订处置 revisionDisposition：{output.revisionDisposition ?? "—"}</span>
      </div>

      <table className="w-full border-collapse text-left text-xs">
        <thead>
          <tr className="border-b border-border text-[11px] uppercase tracking-wide text-slate-500">
            <th className="py-2 pr-3">维度 dimension</th>
            <th className="py-2 pr-3">分数 score</th>
            <th className="py-2">要求 required</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(scores).map(([dimension, score]) => (
            <tr key={dimension} className="border-b border-border/40">
              <td className="py-2 pr-3 font-mono text-slate-200">{dimension}</td>
              <td className="py-2 pr-3 font-mono text-slate-200">{score}</td>
              <td className="py-2 text-slate-400">{output.gate?.allDimensionsRequired ? "全部维度必填" : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Field label="评分表 rubricRef" value={output.rubricRef ?? "—"} mono />
        <Field label="审核人 reviewerRef" value={output.reviewerRef ?? output.gate?.reviewerRef ?? "—"} mono />
        <Field label="稿件哈希 briefContentSha256" value={output.briefContentSha256 ?? "—"} mono />
        <Field label="完整性校验 completenessValid" value={output.completenessValid == null ? "—" : String(output.completenessValid)} />
      </dl>
    </div>
  );
}

export interface ProfessionalReviewViewProps {
  api: StudioOsApi;
  record?: StudioOsEvidenceRecord | null;
  onRecordChange?: (record: StudioOsEvidenceRecord | null) => void;
}

/**
 * Professional screenwriter review: rubric version, reviewer identity class,
 * scores, total, findings/status, revision disposition, and input/output
 * snapshot binding, all bound to the canonical evidence identifier.
 */
export function ProfessionalReviewView({ api, record: controlledRecord, onRecordChange }: ProfessionalReviewViewProps) {
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
        const item = list.evidence.find((entry) => entry.domain === REVIEW_DOMAIN);
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
        if (!cancelled) setError(cause instanceof Error ? cause.message : "专业审核读取失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, controlledRecord, onRecordChange]);

  return (
    <SectionCard title="专业编剧审核" description="评分表版本、审核人身份、评分、修订处置与输入/输出快照绑定">
      <LoadState
        loading={loading}
        error={error}
        empty={
          !record ? (
            <PendingState>
              尚未发现专业审核证据（professional-screenwriter-review）。请先在“证据状态”中创建一次十域运行。
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
            <ReviewSummary output={(record.receipt?.domainOutput ?? {}) as ProfessionalReviewOutput} />
          </div>
        )}
      </LoadState>
    </SectionCard>
  );
}
