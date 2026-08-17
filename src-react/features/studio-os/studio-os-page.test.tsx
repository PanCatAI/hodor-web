import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { StudioOsControlRoomPage } from "./studio-os-page";

const snapshot = {
  revision: 7,
  snapshot: {
    groups: [{ groupId: "studio-project-9", projectId: "9", name: "雾港试片", status: "active", revision: 7 }],
    assets: [{ assetId: "asset-1", type: "character", status: "active" }],
    tasks: [
      { taskId: "task-root", title: "镜头 01", kind: "composite", status: "ready", parentId: null, childTaskIds: ["task-shot"] },
      { taskId: "task-shot", title: "生成候选", kind: "work", status: "verifying", parentId: "task-root", childTaskIds: [] },
    ],
    packets: [{ packetId: "packet-1", shotId: "shot-01", status: "production_ready", readiness: { missingAssetTypes: [] } }],
    leases: [{ leaseId: "lease-1", workerId: "worker-a", taskId: "task-shot", expiresAt: "2026-08-12T12:00:00.000Z" }],
    batches: [{ batchId: "batch-1", k: 2, candidates: [{ candidateId: "candidate-1" }, { candidateId: "candidate-2" }] }],
    verifications: [{ verificationId: "verification-1", candidateId: "candidate-1", verdict: "pass", verifierId: "independent-verifier" }],
    events: [{ eventId: "event-1", sequence: 1, type: "candidate.verified", occurredAt: "2026-08-12T11:59:00.000Z" }],
  },
};

describe("StudioOsControlRoomPage", () => {
  it("keeps the control room read-only behind the feature flag", async () => {
    const client = { request: vi.fn().mockResolvedValue(snapshot) };

    render(<StudioOsControlRoomPage client={client as never} groupId="studio-project-9" enabled />);

    expect(await screen.findByRole("heading", { name: "Studio OS vNext 控制室" })).toBeInTheDocument();
    expect(screen.getByText("只读观测")).toBeInTheDocument();
    expect(screen.getByText("递归任务图")).toBeInTheDocument();
    expect(screen.getByText("生成候选")).toBeInTheDocument();
    expect(screen.getByText("生产就绪")).toBeInTheDocument();
    expect(screen.getByText("candidate.verified")).toBeInTheDocument();
    expect(client.request).toHaveBeenCalledWith("/studio-os-vnext/groups/studio-project-9/snapshot", { method: "GET" });
  });

  it("does not call the backend when the flag is disabled", () => {
    const client = { request: vi.fn() };

    render(<StudioOsControlRoomPage client={client as never} groupId="studio-project-9" enabled={false} />);

    expect(screen.getByRole("heading", { name: "Studio OS vNext 控制室未启用" })).toBeInTheDocument();
    expect(client.request).not.toHaveBeenCalled();
  });

  it("surfaces an empty project-group readback instead of hanging", async () => {
    const client = { request: vi.fn().mockResolvedValue(null) };

    render(<StudioOsControlRoomPage client={client as never} groupId="missing-group" enabled />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Studio OS 快照不存在");
  });
});
