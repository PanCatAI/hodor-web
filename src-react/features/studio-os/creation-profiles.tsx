import { useEffect, useState } from "react";

import type { StudioOsApi } from "./studio-os-api";
import { EvidenceBinding, Field, LoadState, PendingState, SectionCard } from "./studio-os-ui";
import { CREATION_PROFILE_DOMAINS, DOMAIN_LABELS, type CreationProfileOutput, type StudioOsEvidenceRecord } from "./types";

export interface CreationProfileCardProps {
  domain: string;
  record: StudioOsEvidenceRecord;
}

function summaryFields(output: CreationProfileOutput): Array<[string, string | number | boolean | undefined]> {
  if (output.formatId === "ainovel-originality" || output.workbench === "ainovel-originality-workbench:v5") {
    return [
      ["工作台 workbench", output.workbench],
      ["原创性得分 originalityScore", output.originalityScore],
      ["重叠 overlaps", output.overlaps],
      ["范围判定 withinRange", output.withinRange],
      ["得分区间 scoreRange", output.scoreRange?.join(" … ")],
      ["holdoutAccess", output.holdoutAccess],
      ["providerCalls", output.providerCalls],
      ["rawPayloadRejected", output.rawPayloadRejected],
      ["隐私策略 privacyPolicySha256", output.privacyPolicySha256],
    ];
  }
  return [
    ["格式 formatId", output.formatId],
    ["输出模式 outputMode", output.outputMode],
    ["格式校验 formatValid", output.formatValid],
    ["格式错误 formatErrors", output.formatErrors?.join("; ")],
    ["图谱 graphId", output.graphId],
    ["节点数 nodeCount", output.nodeCount],
    ["分支数 branchCount", output.branchCount],
    ["集数 episodeCount", output.episodeCount],
    ["幕 acts", output.acts],
    ["时长 durationMinutes", output.durationMinutes],
  ];
}

export function CreationProfileCard({ domain, record }: CreationProfileCardProps) {
  const output = (record.receipt?.domainOutput ?? {}) as CreationProfileOutput;
  const httpPath = record.receipt?.httpEvidencePath ?? record.evidenceId;
  return (
    <SectionCard title={DOMAIN_LABELS[domain as keyof typeof DOMAIN_LABELS] ?? domain} description={`创建画像 · 证据标识 ${record.evidenceId}`}>
      <div className="space-y-3">
        <EvidenceBinding
          evidenceId={record.evidenceId}
          httpPath={httpPath}
          databaseRecordId={record.receipt?.databaseRecordId ?? `db:${record.evidenceId}`}
          manifestSha256={record.manifestSha256}
          policyRef={record.policyRef}
        />
        <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {summaryFields(output).map(([label, value]) => (
            <Field key={label} label={label} value={value === undefined ? "—" : String(value)} mono />
          ))}
        </dl>
        <dl className="grid grid-cols-1 gap-2 border-t border-border/50 pt-3 sm:grid-cols-3">
          <Field label="请求 requestSha256" value={record.requestSha256} mono />
          <Field label="规范状态 canonicalStateSha256" value={record.canonicalStateSha256} mono />
          <Field label="输出 outputSha256" value={record.outputSha256} mono />
        </dl>
      </div>
    </SectionCard>
  );
}

export interface CreationProfilesViewProps {
  api: StudioOsApi;
  profiles?: StudioOsEvidenceRecord[];
  onProfilesChange?: (profiles: StudioOsEvidenceRecord[]) => void;
}

/**
 * Creation profiles for the five professional creation formats (short drama,
 * interactive game drama, television, film, AINovel originality). Each profile
 * binds to its canonical HTTP evidence identifier exactly as PostgreSQL
 * readback resolves it.
 */
export function CreationProfilesView({ api, profiles: controlledProfiles, onProfilesChange }: CreationProfilesViewProps) {
  const [profiles, setProfiles] = useState<StudioOsEvidenceRecord[]>(controlledProfiles ?? []);
  const [loading, setLoading] = useState(controlledProfiles == null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (controlledProfiles != null) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    void (async () => {
      try {
        const list = await api.listEvidence();
        const domainProfiles = list.evidence.filter((item) => (CREATION_PROFILE_DOMAINS as readonly string[]).includes(item.domain));
        const records = await Promise.all(
          domainProfiles.map(async (item) => {
            const readback = await api.readEvidence(item.evidenceId);
            return readback.record;
          }),
        );
        if (!cancelled) {
          setProfiles(records);
          onProfilesChange?.(records);
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "创建画像读取失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, controlledProfiles, onProfilesChange]);

  return (
    <LoadState loading={loading} error={error}>
      {profiles.length === 0 ? (
        <PendingState>当前没有可展示的创建画像证据。</PendingState>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {profiles.map((record) => (
            <CreationProfileCard key={record.evidenceId} domain={record.domain} record={record} />
          ))}
        </div>
      )}
    </LoadState>
  );
}
