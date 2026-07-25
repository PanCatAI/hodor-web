import { describe, expect, it, vi } from "vitest";

import type { HodorApiClient } from "@react/lib/api/client";
import { createInteractiveStoryApi } from "./interactive-story-api";

describe("interactive story api", () => {
  it("reads the project graph and persists node positions through the graph contract", async () => {
    const request = vi.fn(async () => ({ id: "graph-7", nodes: [], edges: [], variables: [] }));
    const api = createInteractiveStoryApi({ request } as unknown as HodorApiClient);

    await api.getGraph(7);
    await api.updateNodePositions(7, "graph-7", 4, [{ nodeId: "scene-1", position: { x: 120, y: 240 } }]);

    expect(request).toHaveBeenNthCalledWith(
      1,
      "/interactiveStory/graph/get",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ projectId: 7 }) }),
    );
    expect(request).toHaveBeenNthCalledWith(
      2,
      "/interactiveStory/graph/nodes/positions",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          projectId: 7,
          graphId: "graph-7",
          expectedRevision: 4,
          positions: [{ nodeId: "scene-1", position: { x: 120, y: 240 } }],
        }),
      }),
    );
  });
});
