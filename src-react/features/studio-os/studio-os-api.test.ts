import { describe, expect, it, vi } from "vitest";

import { createStudioOsApi } from "./studio-os-api";
import { databaseRecordIdFor, evidenceHttpPath, evidenceIdFor } from "./types";

const RUN_ID = "run:evolution:deadbeefcafe1234";

function recordFor(domain: string) {
  const evidenceId = evidenceIdFor(RUN_ID, domain);
  return {
    evidenceId,
    runId: RUN_ID,
    domain,
    requestSha256: `sha256-request-${domain}`,
    policyRef: "artifact:target-policy-v5",
    manifestSha256: "sha256-manifest",
    canonicalStateSha256: `sha256-state-${domain}`,
    outputSha256: `sha256-output-${domain}`,
    receipt: {
      receiptId: `ev-receipt:${RUN_ID}:${domain}`,
      domainId: domain,
      requestSha256: `sha256-request-${domain}`,
      canonicalStateRef: `graph:${RUN_ID}:${domain}`,
      canonicalStateSha256: `sha256-state-${domain}`,
      outputSha256: `sha256-output-${domain}`,
      policyRef: "artifact:target-policy-v5",
      manifestSha256: "sha256-manifest",
      contractRef: `contract:${domain}:v5`,
      databaseRecordId: databaseRecordIdFor(evidenceId),
      httpEvidencePath: evidenceHttpPath(evidenceId),
      domainOutput: { formatId: domain, formatValid: true },
      canonicalState: { graphId: `graph:${RUN_ID}:${domain}` },
      evidenceRefs: ["action:action_5f54a6478b78442bbca050f14632c3dc"],
      sideEffectCounters: {},
      holdoutCommitment: { algorithm: "sha256", count: 1 },
    },
    createdAt: "2026-08-16T13:15:56.831Z",
  };
}

describe("createStudioOsApi", () => {
  it("lists evidence and binds every summary to its canonical HTTP path and database record id", async () => {
    const request = vi.fn(async () => ({
      kind: "readback",
      command: "readback-evidence-list",
      count: 10,
      evidence: [
        { evidenceId: evidenceIdFor(RUN_ID, "short-drama"), runId: RUN_ID, domain: "short-drama", httpPath: evidenceHttpPath(evidenceIdFor(RUN_ID, "short-drama")), databaseRecordId: databaseRecordIdFor(evidenceIdFor(RUN_ID, "short-drama")), manifestSha256: "sha256-manifest", policyRef: "artifact:target-policy-v5" },
        { evidenceId: evidenceIdFor(RUN_ID, "rollback"), runId: RUN_ID, domain: "rollback", httpPath: evidenceHttpPath(evidenceIdFor(RUN_ID, "rollback")), databaseRecordId: databaseRecordIdFor(evidenceIdFor(RUN_ID, "rollback")), manifestSha256: "sha256-manifest", policyRef: "artifact:target-policy-v5" },
      ],
    }));
    const api = createStudioOsApi({ request });

    const list = await api.listEvidence();

    expect(request).toHaveBeenCalledWith("/api/evolution/evidence");
    expect(list.count).toBe(10);
    expect(list.evidence[0]).toMatchObject({
      evidenceId: evidenceIdFor(RUN_ID, "short-drama"),
      httpPath: "/api/evolution/evidence/ev:run:evolution:deadbeefcafe1234:short-drama",
      databaseRecordId: "db:ev:run:evolution:deadbeefcafe1234:short-drama",
    });
  });

  it("reads a single evidence record through its canonical identifier", async () => {
    const record = recordFor("fourth-wall-interaction");
    const request = vi.fn(async () => ({
      kind: "readback",
      command: "readback-evidence",
      record,
    }));
    const api = createStudioOsApi({ request });

    const readback = await api.readEvidence(record.evidenceId);

    expect(request).toHaveBeenCalledWith(`/api/evolution/evidence/${encodeURIComponent(record.evidenceId)}`);
    expect(readback.evidenceId).toBe(record.evidenceId);
    expect(readback.httpPath).toBe(evidenceHttpPath(record.evidenceId));
    expect(readback.record.receipt.databaseRecordId).toBe(databaseRecordIdFor(record.evidenceId));
  });

  it("creates the canonical ten-domain run sweep", async () => {
    const request = vi.fn(async () => ({
      kind: "readback",
      command: "create-run",
      runId: RUN_ID,
      manifestSha256: "sha256-manifest",
      policyRef: "artifact:target-policy-v5",
      domainCount: 10,
      evidenceIds: ["ev:run:evolution:deadbeefcafe1234:short-drama"],
      evidencePaths: ["/api/evolution/evidence/ev:run:evolution:deadbeefcafe1234:short-drama"],
      databaseRecords: ["db:ev:run:evolution:deadbeefcafe1234:short-drama"],
    }));
    const api = createStudioOsApi({ request });

    const created = await api.createRun({ runId: RUN_ID });

    expect(request).toHaveBeenCalledWith("/api/evolution/runs", { method: "POST", body: JSON.stringify({ runId: RUN_ID }) });
    expect(created.runId).toBe(RUN_ID);
    expect(created.domainCount).toBe(10);
    expect(created.evidencePaths[0]).toBe(`/api/evolution/evidence/${created.evidenceIds[0]}`);
  });

  it("reads rollback receipts and the idempotent rollback state", async () => {
    const request = vi.fn(async (path: string) => {
      if (path === "/api/evolution/rollback/readback") {
        return {
          kind: "readback",
          command: "readback-rollback-state",
          receiptCount: 1,
          receipt: { receiptId: "rollback:target-policy-v5", idempotencyKey: "rollback:target-policy-v5", exactTargetRef: "artifact:target-policy-v5", lastKnownGoodRef: "artifact:target-policy-v4", restorationExact: true },
          exactRestorationToV4: true,
          repeatReturnsSameReceipt: true,
        };
      }
      return { kind: "readback", command: "readback-rollback", ok: true, appended: false, receiptId: "rollback:target-policy-v5", idempotencyKey: "rollback:target-policy-v5", exactTargetRef: "artifact:target-policy-v5", lastKnownGoodRef: "artifact:target-policy-v4", restoredContentSha256: "sha256-v4", restoration: { exactRestorationToV4: true, repeatReturnsSameReceipt: true } };
    });
    const api = createStudioOsApi({ request });

    const receipt = await api.readRollback();
    const state = await api.readRollbackState();

    expect(request).toHaveBeenNthCalledWith(1, "/api/evolution/rollback", { method: "POST" });
    expect(request).toHaveBeenNthCalledWith(2, "/api/evolution/rollback/readback");
    expect(receipt.exactTargetRef).toBe("artifact:target-policy-v5");
    expect(receipt.lastKnownGoodRef).toBe("artifact:target-policy-v4");
    expect(state.exactRestorationToV4).toBe(true);
    expect(state.repeatReturnsSameReceipt).toBe(true);
  });

  it("reads the frozen package, domains, attestations, and evidence resolution", async () => {
    const request = vi.fn(async (path: string) => {
      if (path === "/api/evolution/package") return { kind: "readback", command: "readback-package", manifestSha256: "sha256-manifest", manifestMatchesFreeze: true, sourceByteCommitmentsVerified: true, corpusSnapshotSha256: "b62d06263d803147e8cfa085f7a8b69c90df6f9a10b16f317e7c3125c76bb4b8", equalBudgetVerified: true };
      if (path === "/api/evolution/domains") return { kind: "readback", command: "readback-domains", domains: ["short-drama", "rollback"] };
      if (path === "/api/evolution/attestations") return { kind: "readback", command: "readback-attestations", attestations: { zeroCredentials: true } };
      return { kind: "readback", command: "readback-evidence", allRequiredEvidenceResolved: true, resolutions: [] };
    });
    const api = createStudioOsApi({ request });

    const pkg = await api.readPackage();
    const domains = await api.readDomains();
    const attestations = await api.readAttestations();
    const readback = await api.readEvidenceReadback();

    expect(pkg.manifestMatchesFreeze).toBe(true);
    expect(domains.domains).toEqual(["short-drama", "rollback"]);
    expect(attestations.attestations).toEqual({ zeroCredentials: true });
    expect(readback.allRequiredEvidenceResolved).toBe(true);
    expect(request.mock.calls.map((call) => call[0])).toEqual([
      "/api/evolution/package",
      "/api/evolution/domains",
      "/api/evolution/attestations",
      "/api/evolution/evidence-readback",
    ]);
  });

  it("invokes the commitment-only ainovel check and capability boundary", async () => {
    const request = vi.fn(async (_path: string) => ({ ok: true, evidenceId: "ev:run:evolution:deadbeefcafe1234:ainovel-originality", canonicalTokensSha256: [] }));
    const api = createStudioOsApi({ request });

    await api.readAinovelCapabilityBoundary();
    const check = await api.checkAinovelOriginality({ referenceCorpusRefs: ["fixture:tests/fixtures/production-collaboration/single-scene.json"], referenceTokensSha256: ["a".repeat(64)] });

    expect(request.mock.calls.map((call) => call[0])).toEqual(["/api/evolution/ainovel/capability-boundary", "/api/evolution/ainovel/check"]);
    expect(check.evidenceId).toContain("ainovel-originality");
  });
});
