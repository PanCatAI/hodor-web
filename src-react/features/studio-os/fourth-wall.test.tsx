import { describe, expect, it } from "vitest";

import { FourthWallView } from "./fourth-wall";
import { renderStatic, staticText } from "./studio-os-ssr";
import { buildEvidenceRecord, buildMockStudioOsApi, TEST_RUN_ID } from "./studio-os-test-utils";
import { databaseRecordIdFor, evidenceHttpPath, evidenceIdFor } from "./types";

const FOURTH_WALL_OUTPUT = {
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
};

describe("FourthWallView (non-browser SSR)", () => {
  it("renders consent, bounded state, continuity refusal, non-diegetic refusal, and reversal receipts", () => {
    const { api } = buildMockStudioOsApi();
    const record = buildEvidenceRecord("fourth-wall-interaction", FOURTH_WALL_OUTPUT);
    const html = renderStatic(<FourthWallView api={api} record={record} />);

    expect(html).toContain("第四墙互动");
    expect(html).toContain("opt-in");
    expect(html).toContain("显式同意（consent）");
    expect(html).toContain("叙事内回合（diegetic）");
    expect(html).toContain("连续性拒绝（continuity refusal）");
    expect(html).toContain("非叙事副作用拒绝（non-diegetic refusal）");
    expect(html).toContain("个性化回退（reversal）");
    expect(html).toContain("个性化已回退并恢复被覆盖键");
    expect(html).toContain("missing consent continuity token");
    expect(html).toContain("non-diegetic interaction target realWorldSideEffect");
    expect(html).toContain("maxTurns");
    expect(html).toContain("6");
    expect(html).toContain("30");

    const evidenceId = evidenceIdFor(TEST_RUN_ID, "fourth-wall-interaction");
    expect(html).toContain(evidenceId);
    expect(html).toContain(evidenceHttpPath(evidenceId));
    expect(html).toContain(databaseRecordIdFor(evidenceId));
  });

  it("shows a pending state when no fourth-wall record is supplied", () => {
    const { api } = buildMockStudioOsApi();
    const html = renderStatic(<FourthWallView api={api} record={null} />);
    expect(staticText(html)).toContain("尚未发现第四墙互动证据");
  });
});
