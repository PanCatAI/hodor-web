import { describe, expect, it } from "vitest";

import { CreationProfilesView } from "./creation-profiles";
import { renderStatic, staticText } from "./studio-os-ssr";
import { buildEvidenceRecord, buildMockStudioOsApi, TEST_RUN_ID } from "./studio-os-test-utils";
import { databaseRecordIdFor, evidenceHttpPath, evidenceIdFor } from "./types";

describe("CreationProfilesView (non-browser SSR)", () => {
  it("renders the five creation profiles bound to canonical evidence identifiers", () => {
    const { api } = buildMockStudioOsApi();
    const profiles = [
      buildEvidenceRecord("short-drama", { formatId: "duanju", outputMode: "vertical-single", formatValid: true, graphId: "graph:g1", nodeCount: 2, vertical: true, bounded: true }),
      buildEvidenceRecord("interactive-game-drama", { formatId: "interactive-game-drama", outputMode: "branching-interactive", formatValid: true, branchCount: 3, sessionStateBounded: true }),
      buildEvidenceRecord("television", { formatId: "tv-series", outputMode: "episodic-series", formatValid: true, episodeCount: 24, seasonStructure: true }),
      buildEvidenceRecord("film", { formatId: "film", outputMode: "feature-film", formatValid: true, acts: 3, durationMinutes: 118 }),
      buildEvidenceRecord("ainovel-originality", { workbench: "ainovel-originality-workbench:v5", providerRef: "host-injected", originalityScore: 4.5, overlaps: 2, withinRange: true, scoreRange: [0, 10], holdoutAccess: "forbidden", providerCalls: 0, rawPayloadRejected: true, privacyPolicySha256: "p".repeat(64) }),
    ];
    const html = renderStatic(<CreationProfilesView api={api} profiles={profiles} />);

    const shortDramaId = evidenceIdFor(TEST_RUN_ID, "short-drama");
    expect(html).toContain("短剧 · 竖屏短剧");
    expect(html).toContain("互动剧 · 分支互动");
    expect(html).toContain("电视剧 · 剧集");
    expect(html).toContain("电影 · 长片");
    expect(html).toContain("AINovel 原创性");
    expect(html).toContain(shortDramaId);
    expect(html).toContain(evidenceHttpPath(shortDramaId));
    expect(html).toContain(databaseRecordIdFor(shortDramaId));
    expect(html).toContain("duanju");
    expect(html).toContain("branching-interactive");
    expect(html).toContain("episodic-series");
    expect(html).toContain("feature-film");
  });

  it("renders the AINovel originality commitment-only profile fields", () => {
    const { api } = buildMockStudioOsApi();
    const profiles = [
      buildEvidenceRecord("ainovel-originality", { workbench: "ainovel-originality-workbench:v5", providerRef: "host-injected", originalityScore: 4.5, overlaps: 2, withinRange: true, scoreRange: [0, 10], holdoutAccess: "forbidden", providerCalls: 0, rawPayloadRejected: true, privacyPolicySha256: "p".repeat(64) }),
    ];
    const html = renderStatic(<CreationProfilesView api={api} profiles={profiles} />);

    expect(html).toContain("ainovel-originality-workbench:v5");
    expect(html).toContain("originalityScore");
    expect(html).toContain("4.5");
    expect(html).toContain("holdoutAccess");
    expect(html).toContain("forbidden");
    expect(html).toContain("providerCalls");
    expect(html).toContain("rawPayloadRejected");
    expect(html).toContain("true");
  });

  it("shows a pending state when no creation profile evidence is supplied", () => {
    const { api } = buildMockStudioOsApi();
    const html = renderStatic(<CreationProfilesView api={api} profiles={[]} />);
    expect(staticText(html)).toContain("当前没有可展示的创建画像证据。");
  });

  it("shows the loading state when no controlled profiles are supplied (effect-driven)", () => {
    const { api } = buildMockStudioOsApi();
    const html = renderStatic(<CreationProfilesView api={api} />);
    expect(staticText(html)).toContain("正在读取运行证据…");
  });
});
