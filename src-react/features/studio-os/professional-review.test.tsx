import { describe, expect, it } from "vitest";

import { ProfessionalReviewView } from "./professional-review";
import { renderStatic, staticText } from "./studio-os-ssr";
import { buildEvidenceRecord, buildMockStudioOsApi, TEST_RUN_ID } from "./studio-os-test-utils";
import { databaseRecordIdFor, evidenceHttpPath, evidenceIdFor } from "./types";

const REVIEW_OUTPUT = {
  rubricRef: "professional-screenwriter-rubric",
  gate: { allDimensionsRequired: true, minimumTotal: 24, approvalStatus: "approved", reviewerRef: "reviewer:independent-host-verifier" },
  scores: { originality: 5, structure: 4, character: 5, formatFit: 4, continuity: 4, safety: 5, rightsSignals: 5 },
  total: 32,
  status: "approved",
  revisionDisposition: "approved-as-is",
  reviewerRef: "reviewer:independent-host-verifier",
  briefContentSha256: "b".repeat(64),
  completenessValid: true,
} as const;

describe("ProfessionalReviewView (non-browser SSR)", () => {
  it("renders rubric, scores, status, revision disposition, and the canonical evidence binding", () => {
    const { api } = buildMockStudioOsApi();
    const record = buildEvidenceRecord("professional-screenwriter-review", REVIEW_OUTPUT as unknown as Record<string, unknown>);
    const html = renderStatic(<ProfessionalReviewView api={api} record={record} />);

    expect(html).toContain("专业编剧审核");
    expect(html).toContain("professional-screenwriter-rubric");
    expect(html).toContain("通过 approved");
    expect(html).toContain("总分 32 / 门槛 24");
    expect(html).toContain("修订处置 revisionDisposition：approved-as-is");
    expect(html).toContain("reviewer:independent-host-verifier");
    expect(html).toContain("originality");

    const evidenceId = evidenceIdFor(TEST_RUN_ID, "professional-screenwriter-review");
    expect(html).toContain(evidenceId);
    expect(html).toContain(evidenceHttpPath(evidenceId));
    expect(html).toContain(databaseRecordIdFor(evidenceId));
  });

  it("shows needs-revision disposition when the review fails the gate", () => {
    const { api } = buildMockStudioOsApi();
    const record = buildEvidenceRecord("professional-screenwriter-review", {
      rubricRef: "professional-screenwriter-rubric",
      gate: { allDimensionsRequired: true, minimumTotal: 24 },
      scores: { originality: 1, structure: 1, character: 1, formatFit: 1, continuity: 1, safety: 1, rightsSignals: 1 },
      total: 7,
      status: "needs-revision",
      revisionDisposition: "required-revision",
      reviewerRef: "reviewer:independent-host-verifier",
      completenessValid: true,
    });
    const html = renderStatic(<ProfessionalReviewView api={api} record={record} />);

    expect(html).toContain("需修改 needs-revision");
    expect(html).toContain("总分 7 / 门槛 24");
    expect(html).toContain("修订处置 revisionDisposition：required-revision");
  });

  it("shows a pending state when no review record is supplied", () => {
    const { api } = buildMockStudioOsApi();
    const html = renderStatic(<ProfessionalReviewView api={api} record={null} />);
    expect(staticText(html)).toContain("尚未发现专业审核证据");
  });
});
