// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { StudioOsPage } from "./studio-os-page";
import type { StudioOsApi } from "./studio-os-api";

function snapshot() {
  return {
    revision: 8,
    snapshot: {
      schemaVersion: "1" as const,
      groups: [{ schemaVersion: "1" as const, groupId: "group-fixture", projectId: "42", name: "夜航项目组", status: "active" as const, revision: 8, createdAt: "2026-08-11T00:00:00.000Z", updatedAt: "2026-08-11T01:00:00.000Z" }],
      assets: [{ schemaVersion: "1" as const, assetId: "asset-fixture", groupId: "group-fixture", type: "character" as const, contentRef: "asset://character/ada", contentHash: "sha256:ada", status: "active" as const, provenance: { source: "human" as const, sourceRef: "story-room" }, invalidatedAt: null, invalidationReason: null, createdAt: "2026-08-11T00:00:00.000Z", updatedAt: "2026-08-11T00:00:00.000Z" }],
      tasks: [{ schemaVersion: "1" as const, taskId: "task-fixture", groupId: "group-fixture", parentId: null, kind: "root" as const, title: "保留台词意图", status: "ready" as const, contract: { version: "contract:v1", requiredAssetTypes: ["character" as const], acceptance: ["独立验证"], constraints: {} }, inputAssetIds: ["asset-fixture"], outputAssetIds: [], childTaskIds: [], activeLeaseId: null, createdAt: "2026-08-11T00:00:00.000Z", updatedAt: "2026-08-11T00:00:00.000Z" }],
      decisions: [{ schemaVersion: "1" as const, decisionId: "decision-fixture", groupId: "group-fixture", subjectId: "task-fixture", actorRef: "story-room", outcome: "approved" as const, rationale: "采用夜航版本", evidenceRefs: ["evidence:story"], createdAt: "2026-08-11T00:00:00.000Z" }],
      packets: [], leases: [], batches: [], verifications: [], events: [{ schemaVersion: "1" as const, eventId: "event-fixture", sequence: 1, type: "evolution.replay.completed", aggregateType: "evolution", aggregateId: "replay-fixture", idempotencyKey: null, payload: { evidenceRef: "evidence:replay" }, occurredAt: "2026-08-11T00:00:00.000Z" }], idempotency: [],
    },
  };
}

describe("Studio OS control room", () => {
  it("renders the authority snapshot, evidence entry, and no production publish action", async () => {
    const api = {
      getSnapshot: vi.fn(async () => snapshot()),
      getEvidence: vi.fn(async () => [{ evidenceRef: "evidence:epyc" }]),
      adoptCandidate: vi.fn(),
      rollbackAdoption: vi.fn(),
    } as unknown as StudioOsApi;

    render(<StudioOsPage projectId={42} groupId="group-fixture" api={api} />);

    expect(await screen.findByRole("heading", { name: "夜航项目组" })).toBeInTheDocument();
    expect(screen.getByText("保留台词意图")).toBeInTheDocument();
    expect(screen.getByText("evidence:replay")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /发布|生产发布/ })).not.toBeInTheDocument();
    expect(api.getSnapshot).toHaveBeenCalledWith("group-fixture");
  });

  it("presents an actionable error and preserves the project-group boundary", async () => {
    const api = { getSnapshot: vi.fn(async () => { throw new Error("GROUP_NOT_FOUND"); }), getEvidence: vi.fn(), adoptCandidate: vi.fn(), rollbackAdoption: vi.fn() } as unknown as StudioOsApi;
    render(<StudioOsPage projectId={42} groupId="group-missing" api={api} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("GROUP_NOT_FOUND");
    await waitFor(() => expect(api.getSnapshot).toHaveBeenCalledWith("group-missing"));
  });
});
