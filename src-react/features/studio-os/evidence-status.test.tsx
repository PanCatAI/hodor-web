import { describe, expect, it } from "vitest";

import { EvidenceStatusView } from "./evidence-status";
import { renderStatic, staticText } from "./studio-os-ssr";
import { buildEvidenceSummary, buildMockStudioOsApi, TEST_RUN_ID, TEST_MANIFEST_SHA256 } from "./studio-os-test-utils";
import { databaseRecordIdFor, evidenceHttpPath, evidenceIdFor } from "./types";

describe("EvidenceStatusView (non-browser SSR)", () => {
  it("renders every persisted evidence record bound to its HTTP path and database record id", () => {
    const { api } = buildMockStudioOsApi();
    const evidence = ["short-drama", "symbiosis", "rollback", "matched-comparison"].map(buildEvidenceSummary);
    const html = renderStatic(
      <EvidenceStatusView
        api={api}
        initialEvidence={evidence}
        initialPackage={{
          kind: "readback",
          command: "readback-package",
          manifestSha256: TEST_MANIFEST_SHA256,
          freezeBoundManifestSha256: TEST_MANIFEST_SHA256,
          manifestMatchesFreeze: true,
          sourceByteCommitmentsVerified: true,
          sourceByteCommitmentCount: 3,
          corpusSnapshotSha256: "b62d06263d803147e8cfa085f7a8b69c90df6f9a10b16f317e7c3125c76bb4b8",
          equalBudgetVerified: true,
        }}
        initialEvidenceReadback={{ kind: "readback", command: "readback-evidence", allRequiredEvidenceResolved: true, resolutions: [{ ref: "fixture:tests/fixtures/production-collaboration/single-scene.json", resolved: true }] }}
      />,
    );

    expect(html).toContain("证据状态");
    expect(html).toContain(`运行 ${TEST_RUN_ID} · 4 条证据`);
    expect(html).toContain(evidenceIdFor(TEST_RUN_ID, "short-drama"));
    expect(html).toContain(evidenceHttpPath(evidenceIdFor(TEST_RUN_ID, "short-drama")));
    expect(html).toContain(databaseRecordIdFor(evidenceIdFor(TEST_RUN_ID, "short-drama")));
    expect(html).toContain(evidenceIdFor(TEST_RUN_ID, "symbiosis"));
    expect(html).toContain(evidenceIdFor(TEST_RUN_ID, "matched-comparison"));
    expect(html).toContain(evidenceIdFor(TEST_RUN_ID, "rollback"));
  });

  it("renders the frozen v5 package readback and evidence resolution status", () => {
    const { api } = buildMockStudioOsApi();
    const html = renderStatic(
      <EvidenceStatusView
        api={api}
        initialEvidence={[buildEvidenceSummary("short-drama")]}
        initialPackage={{ kind: "readback", command: "readback-package", manifestSha256: TEST_MANIFEST_SHA256, freezeBoundManifestSha256: TEST_MANIFEST_SHA256, manifestMatchesFreeze: true, sourceByteCommitmentsVerified: true, sourceByteCommitmentCount: 3, corpusSnapshotSha256: "b62d06263d803147e8cfa085f7a8b69c90df6f9a10b16f317e7c3125c76bb4b8", equalBudgetVerified: true }}
        initialEvidenceReadback={{ kind: "readback", command: "readback-evidence", allRequiredEvidenceResolved: true, resolutions: [{ ref: "[SEALED_HOLDOUT_REFERENCE]", resolved: true }] }}
      />,
    );

    expect(html).toContain("冻结 v5 包回读");
    expect(html).toContain("清单与冻结一致 manifestMatchesFreeze");
    expect(html).toContain("true");
    expect(html).toContain("全部必需证据已解析");
    expect(html).toContain("1/1");
  });

  it("renders the create-run and refresh action buttons", () => {
    const { api } = buildMockStudioOsApi();
    const html = renderStatic(
      <EvidenceStatusView api={api} initialEvidence={[buildEvidenceSummary("short-drama")]} initialPackage={null} initialEvidenceReadback={null} />,
    );
    expect(html).toContain("创建十域运行");
    expect(html).toContain("刷新");
  });

  it("shows a pending state when no evidence has been persisted", () => {
    const { api } = buildMockStudioOsApi();
    const html = renderStatic(
      <EvidenceStatusView api={api} initialEvidence={[]} initialPackage={null} initialEvidenceReadback={null} />,
    );
    expect(staticText(html)).toContain("尚未持久化任何运行证据。");
  });
});
