import { describe, expect, it, vi } from "vitest";

import { createEvolutionStudioOsApi } from "./evolution-studio-os-api";
import { databaseRecordIdFor, evidenceHttpPath, evidenceIdFor } from "./types";

const RUN_ID = "run:evolution:deadbeefcafe1234";

describe("createEvolutionStudioOsApi", () => {
  it("lists and reads evidence through canonical identifiers", async () => {
    const evidenceId = evidenceIdFor(RUN_ID, "short-drama");
    const record = { evidenceId, runId: RUN_ID, domain: "short-drama", receipt: { databaseRecordId: databaseRecordIdFor(evidenceId) } };
    const request = vi.fn(async (path: string) => path === "/api/evolution/evidence"
      ? { count: 1, evidence: [{ evidenceId, httpPath: evidenceHttpPath(evidenceId), databaseRecordId: databaseRecordIdFor(evidenceId) }] }
      : { record });
    const api = createEvolutionStudioOsApi({ request });

    const list = await api.listEvidence();
    const readback = await api.readEvidence(evidenceId);

    expect(list.evidence[0]).toMatchObject({ evidenceId, httpPath: evidenceHttpPath(evidenceId) });
    expect(request).toHaveBeenNthCalledWith(2, `/api/evolution/evidence/${encodeURIComponent(evidenceId)}`);
    expect(readback).toMatchObject({ evidenceId, httpPath: evidenceHttpPath(evidenceId), record });
  });

  it("creates runs and reads the complete evaluation contract", async () => {
    const request = vi.fn(async (path: string) => {
      if (path === "/api/evolution/runs") return { runId: RUN_ID, domainCount: 10 };
      if (path === "/api/evolution/domains") return { domains: ["short-drama", "rollback"] };
      if (path === "/api/evolution/package") return { manifestMatchesFreeze: true };
      if (path === "/api/evolution/attestations") return { attestations: { zeroCredentials: true } };
      return { allRequiredEvidenceResolved: true };
    });
    const api = createEvolutionStudioOsApi({ request });

    expect(await api.createRun({ runId: RUN_ID })).toMatchObject({ runId: RUN_ID, domainCount: 10 });
    expect(await api.readDomains()).toEqual({ domains: ["short-drama", "rollback"] });
    expect(await api.readPackage()).toMatchObject({ manifestMatchesFreeze: true });
    expect(await api.readAttestations()).toMatchObject({ attestations: { zeroCredentials: true } });
    expect(await api.readEvidenceReadback()).toMatchObject({ allRequiredEvidenceResolved: true });
    expect(request).toHaveBeenNthCalledWith(1, "/api/evolution/runs", { method: "POST", body: JSON.stringify({ runId: RUN_ID }) });
  });

  it("binds rollback and AINovel checks to their dedicated endpoints", async () => {
    const request = vi.fn(async (path: string) => ({ path, ok: true }));
    const api = createEvolutionStudioOsApi({ request });

    await api.readRollback();
    await api.readRollbackState();
    await api.readAinovelCapabilityBoundary();
    await api.checkAinovelOriginality({ referenceTokensSha256: ["a".repeat(64)] });

    expect(request.mock.calls).toEqual([
      ["/api/evolution/rollback", { method: "POST" }],
      ["/api/evolution/rollback/readback"],
      ["/api/evolution/ainovel/capability-boundary"],
      ["/api/evolution/ainovel/check", { method: "POST", body: JSON.stringify({ referenceTokensSha256: ["a".repeat(64)] }) }],
    ]);
  });
});
