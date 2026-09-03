import { vi } from "vitest";

import type { EvolutionStudioOsApi as StudioOsApi } from "./evolution-studio-os-api";
import { databaseRecordIdFor, evidenceHttpPath, evidenceIdFor, type StudioOsEvidenceRecord, type StudioOsEvidenceSummary } from "./types";

export const TEST_RUN_ID = "run:evolution:frontendtest1234";
export const TEST_MANIFEST_SHA256 = "a".repeat(64);
export const TEST_POLICY_REF = "artifact:target-policy-v5";

export function buildEvidenceSummary(domain: string): StudioOsEvidenceSummary {
  const evidenceId = evidenceIdFor(TEST_RUN_ID, domain);
  return {
    evidenceId,
    runId: TEST_RUN_ID,
    domain,
    httpPath: evidenceHttpPath(evidenceId),
    databaseRecordId: databaseRecordIdFor(evidenceId),
    manifestSha256: TEST_MANIFEST_SHA256,
    policyRef: TEST_POLICY_REF,
  };
}

export function buildEvidenceRecord(domain: string, domainOutput: Record<string, unknown>): StudioOsEvidenceRecord {
  const evidenceId = evidenceIdFor(TEST_RUN_ID, domain);
  return {
    evidenceId,
    runId: TEST_RUN_ID,
    domain,
    requestSha256: `request-${domain}`,
    policyRef: TEST_POLICY_REF,
    manifestSha256: TEST_MANIFEST_SHA256,
    canonicalStateSha256: `state-${domain}`,
    outputSha256: `output-${domain}`,
    receipt: {
      receiptId: `ev-receipt:${TEST_RUN_ID}:${domain}`,
      domainId: domain,
      requestSha256: `request-${domain}`,
      canonicalStateRef: `graph:${TEST_RUN_ID}:${domain}`,
      canonicalStateSha256: `state-${domain}`,
      outputSha256: `output-${domain}`,
      policyRef: TEST_POLICY_REF,
      manifestSha256: TEST_MANIFEST_SHA256,
      contractRef: `contract:${domain}:v5`,
      databaseRecordId: databaseRecordIdFor(evidenceId),
      httpEvidencePath: evidenceHttpPath(evidenceId),
      domainOutput,
      canonicalState: {},
      evidenceRefs: ["action:action_5f54a6478b78442bbca050f14632c3dc"],
      sideEffectCounters: {},
      holdoutCommitment: { algorithm: "sha256", count: 1 },
    },
    createdAt: "2026-08-16T13:15:56.831Z",
  };
}

const ALL_DOMAINS = [
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
];

const DEFAULT_OUTPUTS: Record<string, Record<string, unknown>> = {
  "short-drama": { formatId: "duanju", outputMode: "vertical-single", formatValid: true, graphId: "graph:g1", nodeCount: 2, vertical: true, bounded: true },
  "interactive-game-drama": { formatId: "interactive-game-drama", outputMode: "branching-interactive", formatValid: true, branchCount: 3, sessionStateBounded: true },
  television: { formatId: "tv-series", outputMode: "episodic-series", formatValid: true, episodeCount: 24, seasonStructure: true },
  film: { formatId: "film", outputMode: "feature-film", formatValid: true, acts: 3, durationMinutes: 118 },
  "ainovel-originality": { workbench: "ainovel-originality-workbench:v5", providerRef: "host-injected", originalityScore: 4.5, overlaps: 2, withinRange: true, scoreRange: [0, 10], holdoutAccess: "forbidden", providerCalls: 0, rawPayloadRejected: true, privacyPolicySha256: "p".repeat(64) },
  "professional-screenwriter-review": {
    rubricRef: "professional-screenwriter-rubric",
    gate: { allDimensionsRequired: true, minimumTotal: 24, approvalStatus: "approved", reviewerRef: "reviewer:independent-host-verifier" },
    scores: { originality: 5, structure: 4, character: 5, formatFit: 4, continuity: 4, safety: 5, rightsSignals: 5 },
    total: 32,
    status: "approved",
    revisionDisposition: "approved-as-is",
    reviewerRef: "reviewer:independent-host-verifier",
    briefContentSha256: "b".repeat(64),
    completenessValid: true,
  },
  "fourth-wall-interaction": {
    sessionId: "fourth-wall-session-001",
    mode: "opt-in",
    consentRequired: true,
    finalTurns: 4,
    bounded: { maxTurns: 6, ttlMinutes: 30 },
    personalization: { theme: "dark" },
    events: [
      { event: "consent-required", ok: true, refusalOk: true },
      { event: "diegetic-turn", ok: true, turns: 1 },
      { event: "continuity-refusal", ok: true, errors: ["missing consent continuity token"] },
      { event: "non-diegetic-refusal", ok: true, errors: ["non-diegetic interaction target realWorldSideEffect"] },
      { event: "reversal", ok: true, state: { theme: "dark" } },
    ],
  },
  symbiosis: { mode: "append-only-feedback", feedbackCount: 2, sourceHistoryImmutable: true, sourceHistoryHash: "s".repeat(64), maxProposalsPerRound: 3 },
  rollback: { ok: true, appended: true, restorationExact: true, activeStateReadback: { before: { activePolicyRef: "artifact:target-policy-v5" }, after: { activePolicyRef: "artifact:target-policy-v4" } } },
  "matched-comparison": { primaryMetric: "matched offline replay pass rate", matched: true, hardGatesSatisfied: true, noRegression: true, minimumUplift: 0, maximumGuardRegression: 0, zeroSideEffects: true },
};

export function buildMockStudioOsApi(options: { domains?: string[]; missing?: string[] } = {}): {
  api: StudioOsApi;
  listEvidence: ReturnType<typeof vi.fn>;
  readEvidence: ReturnType<typeof vi.fn>;
  createRun: ReturnType<typeof vi.fn>;
  readRollbackState: ReturnType<typeof vi.fn>;
  readRollback: ReturnType<typeof vi.fn>;
  readPackage: ReturnType<typeof vi.fn>;
} {
  const domains = options.domains ?? ALL_DOMAINS;
  const missing = options.missing ?? [];
  const summaries = domains.filter((domain) => !missing.includes(domain)).map(buildEvidenceSummary);
  const records = new Map(
    summaries.map((summary) => [summary.domain, buildEvidenceRecord(summary.domain, DEFAULT_OUTPUTS[summary.domain] ?? {})]),
  );

  const listEvidence = vi.fn(async () => ({
    kind: "readback",
    command: "readback-evidence-list",
    count: summaries.length,
    evidence: summaries,
  }));

  const readEvidence = vi.fn(async (evidenceId: string) => {
    const summary = summaries.find((item) => item.evidenceId === evidenceId);
    if (!summary) throw new Error(`evidence not found: ${evidenceId}`);
    const record = records.get(summary.domain) ?? buildEvidenceRecord(summary.domain, {});
    return { evidenceId, httpPath: summary.httpPath, record };
  });

  const createRun = vi.fn(async () => ({
    kind: "readback",
    command: "create-run",
    runId: TEST_RUN_ID,
    manifestSha256: TEST_MANIFEST_SHA256,
    policyRef: TEST_POLICY_REF,
    domainCount: 10,
    evidenceIds: domains.map((domain) => evidenceIdFor(TEST_RUN_ID, domain)),
    evidencePaths: domains.map((domain) => evidenceHttpPath(evidenceIdFor(TEST_RUN_ID, domain))),
    databaseRecords: domains.map((domain) => databaseRecordIdFor(evidenceIdFor(TEST_RUN_ID, domain))),
  }));

  const readRollbackState = vi.fn(async () => ({
    kind: "readback",
    command: "readback-rollback-state",
    receiptCount: 1,
    receipt: {
      receiptId: "rollback:target-policy-v5",
      idempotencyKey: "rollback:target-policy-v5",
      exactTargetRef: "artifact:target-policy-v5",
      lastKnownGoodRef: "artifact:target-policy-v4",
      restoredContentSha256: "c".repeat(64),
      restorationExact: true,
    },
    exactRestorationToV4: true,
    repeatReturnsSameReceipt: true,
  }));

  const readRollback = vi.fn(async () => ({
    kind: "readback",
    command: "readback-rollback",
    ok: true,
    appended: true,
    receiptId: "rollback:target-policy-v5",
    idempotencyKey: "rollback:target-policy-v5",
    exactTargetRef: "artifact:target-policy-v5",
    lastKnownGoodRef: "artifact:target-policy-v4",
    restoredContentSha256: "c".repeat(64),
    restoration: { exactRestorationToV4: true, restoredFromExactTarget: true, repeatReturnsSameReceipt: true, receiptCount: 1 },
  }));

  const readPackage = vi.fn(async () => ({
    kind: "readback",
    command: "readback-package",
    manifestSha256: TEST_MANIFEST_SHA256,
    freezeBoundManifestSha256: TEST_MANIFEST_SHA256,
    manifestMatchesFreeze: true,
    sourceByteCommitmentsVerified: true,
    sourceByteCommitmentCount: 3,
    corpusSnapshotSha256: "b62d06263d803147e8cfa085f7a8b69c90df6f9a10b16f317e7c3125c76bb4b8",
    equalBudgetVerified: true,
  }));

  const api: StudioOsApi = {
    listEvidence,
    readEvidence,
    createRun,
    readRollback,
    readRollbackState,
    readPackage,
    readDomains: vi.fn(async () => ({ domains })),
    readAttestations: vi.fn(async () => ({ kind: "readback", command: "readback-attestations", attestations: { zeroCredentials: true, zeroBrowser: true } })),
    readEvidenceReadback: vi.fn(async () => ({ kind: "readback", command: "readback-evidence", allRequiredEvidenceResolved: true, resolutions: [] })),
    readAinovelCapabilityBoundary: vi.fn(async () => ({ workbench: "ainovel-originality-workbench:v5" })),
    checkAinovelOriginality: vi.fn(async () => ({ evidenceId: evidenceIdFor(TEST_RUN_ID, "ainovel-originality") })),
  };

  return { api, listEvidence, readEvidence, createRun, readRollbackState, readRollback, readPackage };
}
