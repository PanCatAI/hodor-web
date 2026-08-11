import { describe, expect, it, vi } from "vitest";

import { createStudioOsApi } from "./studio-os-api";

describe("Studio OS API", () => {
  it("reads the project-group snapshot through the Hodor authority", async () => {
    const request = vi.fn(async (path: string) => ({ revision: 3, snapshot: { schemaVersion: "1", groups: [], assets: [], tasks: [], decisions: [], packets: [], leases: [], batches: [], verifications: [], events: [], idempotency: [] } }));
    const api = createStudioOsApi({ request });

    await api.getSnapshot("group/with-space");

    expect(request).toHaveBeenCalledWith("/studio-os-vnext/groups/group%2Fwith-space/snapshot");
  });

  it("uses deterministic idempotency keys for adoption and rollback requests", async () => {
    const request = vi.fn(async () => ({}));
    const api = createStudioOsApi({ request });

    await api.adoptCandidate({ groupId: "group-a", taskId: "task-a", batchId: "batch-a", candidateId: "candidate-a", idempotencyKey: "adopt:task-a:v1" });
    await api.rollbackAdoption({ groupId: "group-a", taskId: "task-a", actorRef: "operator", idempotencyKey: "rollback:task-a:v1" });

    expect(request.mock.calls).toEqual([
      ["/studio-os-vnext/groups/group-a/adoptions", expect.objectContaining({ method: "POST", body: expect.stringContaining("adopt:task-a:v1") })],
      ["/studio-os-vnext/groups/group-a/rollbacks", expect.objectContaining({ method: "POST", body: expect.stringContaining("rollback:task-a:v1") })],
    ]);
  });
});
