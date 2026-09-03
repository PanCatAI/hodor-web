/**
 * Studio OS canonical types for the governed v5 professional-creation
 * evaluation runtime.
 *
 * Every view binds to the same backend HTTP evidence identifiers used by
 * PostgreSQL readback: evidence identifiers `ev:<runId>:<domain>`, HTTP
 * evidence paths `/api/evolution/evidence/<evidenceId>`, and database record
 * identities `db:<evidenceId>`. The identifier grammar below mirrors the
 * backend runtime exactly so frontend views and backend receipts can never
 * drift apart.
 */

export const STUDIO_OS_DOMAINS = [
  "short-drama",
  "interactive-game-drama",
  "television",
  "film",
  "ainovel-originality",
  "professional-screenwriter-review",
  "fourth-wall-interaction",
  "symbiosis",
  "rollback",
  "matched-comparison",
] as const;

export type StudioOsDomain = (typeof STUDIO_OS_DOMAINS)[number];

/** The five professional creation formats surfaced as creation profiles. */
export const CREATION_PROFILE_DOMAINS: readonly StudioOsDomain[] = [
  "short-drama",
  "interactive-game-drama",
  "television",
  "film",
  "ainovel-originality",
];

export const DOMAIN_LABELS: Record<StudioOsDomain, string> = {
  "short-drama": "短剧 · 竖屏短剧",
  "interactive-game-drama": "互动剧 · 分支互动",
  television: "电视剧 · 剧集",
  film: "电影 · 长片",
  "ainovel-originality": "AINovel 原创性",
  "professional-screenwriter-review": "专业编剧审核",
  "fourth-wall-interaction": "第四墙互动",
  symbiosis: "共生反馈",
  rollback: "精确回滚",
  "matched-comparison": "匹配对照",
};

export const DOMAIN_IDS: Record<StudioOsDomain, string> = {
  "short-drama": "short-drama",
  "interactive-game-drama": "interactive-game-drama",
  television: "television",
  film: "film",
  "ainovel-originality": "ainovel-originality",
  "professional-screenwriter-review": "professional-screenwriter-review",
  "fourth-wall-interaction": "fourth-wall-interaction",
  symbiosis: "symbiosis",
  rollback: "rollback",
  "matched-comparison": "matched-comparison",
};

/** Canonical evidence identifier: `ev:<runId>:<domain>` (backend-authoritative). */
export function evidenceIdFor(runId: string, domain: string): string {
  return `ev:${runId}:${domain}`;
}

/** Canonical HTTP evidence path: `/api/evolution/evidence/<evidenceId>`. */
export function evidenceHttpPath(evidenceId: string): string {
  // Backend-authoritative canonical path: colons are not percent-encoded.
  return `/api/evolution/evidence/${evidenceId}`;
}

/** Canonical PostgreSQL record identity: `db:<evidenceId>`. */
export function databaseRecordIdFor(evidenceId: string): string {
  return `db:${evidenceId}`;
}

export interface StudioOsEvidenceSummary {
  evidenceId: string;
  runId: string;
  domain: string;
  httpPath: string;
  databaseRecordId: string;
  manifestSha256: string;
  policyRef: string;
}

/** Domain receipt as persisted by the backend runtime and read back over HTTP. */
export interface StudioOsDomainReceipt {
  receiptId: string;
  domainId: string;
  requestSha256: string;
  canonicalStateRef: string;
  canonicalStateSha256: string;
  outputSha256: string;
  policyRef: string;
  manifestSha256: string;
  contractRef: string;
  databaseRecordId: string;
  httpEvidencePath: string;
  evidenceRefs: string[];
  sideEffectCounters: Record<string, number>;
  holdoutCommitment: Record<string, unknown>;
  domainOutput: Record<string, unknown>;
  canonicalState: unknown;
  [key: string]: unknown;
}

export interface StudioOsEvidenceRecord {
  evidenceId: string;
  runId: string;
  domain: string;
  requestSha256: string;
  policyRef: string;
  manifestSha256: string;
  canonicalStateSha256: string;
  outputSha256: string;
  receipt: StudioOsDomainReceipt;
  createdAt: string;
  [key: string]: unknown;
}

export interface StudioOsRunCreate {
  kind?: string;
  command?: string;
  runId: string;
  manifestSha256?: string;
  policyRef?: string;
  domainCount?: number;
  evidenceIds: string[];
  evidencePaths: string[];
  databaseRecords: string[];
}

export interface StudioOsEvidenceList {
  kind?: string;
  command?: string;
  count: number;
  evidence: StudioOsEvidenceSummary[];
}

export interface StudioOsRollbackState {
  kind?: string;
  command?: string;
  receiptCount: number;
  receipt: Record<string, unknown> | null;
  exactRestorationToV4: boolean;
  repeatReturnsSameReceipt: boolean;
}

export interface StudioOsRollbackReceipt {
  kind?: string;
  command?: string;
  ok: boolean;
  appended: boolean;
  receiptId: string | null;
  idempotencyKey: string | null;
  exactTargetRef: string | null;
  lastKnownGoodRef: string | null;
  restoredContentSha256: string | null;
  restoration: {
    exactRestorationToV4?: boolean;
    restoredFromExactTarget?: boolean;
    repeatReturnsSameReceipt?: boolean;
    receiptCount?: number;
  } | null;
}

export interface StudioOsPackageReadback {
  kind?: string;
  command?: string;
  manifestSha256?: string;
  freezeBoundManifestSha256?: string;
  manifestMatchesFreeze?: boolean;
  sourceByteCommitmentsVerified?: boolean;
  sourceByteCommitmentCount?: number;
  corpusSnapshotSha256?: string;
  equalBudgetVerified?: boolean;
  replayReceipt?: Record<string, unknown>;
  holdoutDisclosure?: string;
}

export interface StudioOsEvidenceReadback {
  kind?: string;
  command?: string;
  allRequiredEvidenceResolved?: boolean;
  resolutions?: Array<{ ref: string; resolved: boolean }>;
  [key: string]: unknown;
}

export interface StudioOsAttestations {
  kind?: string;
  command?: string;
  attestations: Record<string, unknown>;
}

// ---- typed domain outputs (subsets of the canonical backend receipts) ----

export interface CreationProfileOutput {
  formatId?: string;
  formatLabel?: string;
  outputMode?: string;
  formatValid?: boolean;
  formatErrors?: string[];
  graphId?: string;
  nodeCount?: number;
  branchCount?: number;
  episodeCount?: number;
  acts?: number;
  durationMinutes?: number;
  vertical?: boolean;
  bounded?: boolean;
  sessionStateBounded?: boolean;
  seasonStructure?: boolean;
  workbench?: string;
  providerRef?: string;
  originalityScore?: number;
  overlaps?: number;
  withinRange?: boolean;
  scoreRange?: number[];
  holdoutAccess?: string;
  providerCalls?: number;
  rawPayloadRejected?: boolean;
  privacyPolicySha256?: string;
  evidenceRefs?: string[];
  [key: string]: unknown;
}

export interface ProfessionalReviewOutput {
  rubricRef?: string;
  gate?: {
    allDimensionsRequired?: boolean;
    minimumTotal?: number;
    approvalStatus?: string;
    reviewerRef?: string;
  };
  scores?: Record<string, number>;
  total?: number;
  status?: "approved" | "needs-revision";
  revisionDisposition?: string;
  reviewerRef?: string;
  briefContentSha256?: string;
  completenessValid?: boolean;
  [key: string]: unknown;
}

export interface FourthWallEvent {
  event: string;
  ok?: boolean;
  refusalOk?: boolean;
  refusalErrors?: string[];
  errors?: string[];
  turns?: number;
  state?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface FourthWallOutput {
  sessionId?: string;
  mode?: string;
  consentRequired?: boolean;
  finalTurns?: number;
  bounded?: { maxTurns?: number; ttlMinutes?: number };
  personalization?: Record<string, unknown>;
  events?: FourthWallEvent[];
  [key: string]: unknown;
}

export interface SymbiosisOutput {
  mode?: string;
  feedbackCount?: number;
  feedbackIds?: string[];
  branchProposals?: Array<Record<string, unknown>>;
  sourceHistoryImmutable?: boolean;
  sourceHistoryHash?: string;
  maxProposalsPerRound?: number;
  [key: string]: unknown;
}

export interface RollbackDomainOutput {
  ok?: boolean;
  appended?: boolean;
  errors?: string[];
  receipt?: Record<string, unknown> | null;
  activeStateReadback?: Record<string, unknown> | null;
  restorationExact?: boolean;
  [key: string]: unknown;
}

export interface MatchedComparisonOutput {
  primaryMetric?: string;
  controlPassRate?: number;
  candidatePassRate?: number;
  unrelatedPassRate?: number;
  matched?: boolean;
  hardGatesSatisfied?: boolean;
  noRegression?: boolean;
  minimumUplift?: number;
  maximumGuardRegression?: number;
  zeroSideEffects?: boolean;
  equalBudgetSha256?: string;
  matchedShadowReceiptId?: string;
  [key: string]: unknown;
}
