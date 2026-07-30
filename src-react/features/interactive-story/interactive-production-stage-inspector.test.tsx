import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ProductionApi, ProductionFlowData, ProductionProject } from "@react/features/production";
import { InteractiveProductionStageInspector } from "./interactive-production-stage-inspector";
import type { InteractiveStoryNode } from "./types";

const node: InteractiveStoryNode = {
  id: "scene-1",
  graphId: "graph-1",
  scriptId: 12,
  kind: "scene",
  title: "锁住的房间",
  summary: "测试",
  position: { x: 0, y: 0 },
  status: "ready",
  script: { id: 12, name: "锁住的房间", content: "INT. ROOM", createTime: 1 },
  createdAt: 1,
  updatedAt: 1,
};

const project: ProductionProject = {
  id: 7,
  name: "雨夜",
  imageModel: "pancat:pancat-image",
  videoModel: "pancat:pancat-video",
  videoMode: "singleImage",
};

function flow(): ProductionFlowData {
  return {
    script: "INT. ROOM",
    scriptPlan: "推进",
    storyboardTable: "镜头 1",
    assets: [
      {
        id: 1,
        name: "人物",
        type: "role",
        prompt: "",
        desc: "",
        src: "",
        state: "completed",
        errorReason: "",
        derive: [
          {
            id: 2,
            assetsId: 1,
            name: "Rachel",
            type: "role",
            prompt: "旧提示词",
            desc: "旧描述",
            src: "",
            state: "idle",
            errorReason: "",
          },
        ],
      },
    ],
    storyboard: [
      {
        id: 9,
        index: 0,
        prompt: "旧分镜提示词",
        videoDesc: "旧镜头描述",
        src: "",
        state: "idle",
        errorReason: "",
      },
    ],
  };
}

function api() {
  return {
    saveFlowData: vi.fn(async () => undefined),
    editStoryboard: vi.fn(async () => undefined),
  } as unknown as ProductionApi;
}

describe("InteractiveProductionStageInspector", () => {
  it("edits an asset locally and persists it only when the user saves", async () => {
    const productionApi = api();
    render(
      <InteractiveProductionStageInspector
        projectId={7}
        node={node}
        stage="assets"
        flow={flow()}
        api={productionApi}
        project={project}
        onChange={vi.fn()}
        onRefresh={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Rachel描述"), { target: { value: "完整人物描述" } });
    expect(productionApi.saveFlowData).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "保存Rachel" }));
    await waitFor(() => expect(productionApi.saveFlowData).toHaveBeenCalledTimes(1));
    expect(productionApi.saveFlowData).toHaveBeenCalledWith(
      7,
      12,
      expect.objectContaining({
        assets: [expect.objectContaining({ derive: [expect.objectContaining({ desc: "完整人物描述" })] })],
      }),
    );
  });

  it("edits a storyboard locally and persists it only when the user saves", async () => {
    const productionApi = api();
    render(
      <InteractiveProductionStageInspector
        projectId={7}
        node={node}
        stage="storyboard"
        flow={flow()}
        api={productionApi}
        project={project}
        onChange={vi.fn()}
        onRefresh={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("分镜 1提示词"), { target: { value: "新分镜提示词" } });
    expect(productionApi.editStoryboard).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "保存分镜 1" }));
    await waitFor(() => expect(productionApi.editStoryboard).toHaveBeenCalledWith(9, "新分镜提示词", "旧镜头描述"));
  });
});
