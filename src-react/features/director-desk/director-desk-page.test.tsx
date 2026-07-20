import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  DirectorDeskPage,
  type DirectorDeskAdapter,
  type DirectorDeskEditorProps,
} from "./index";

function Editor({ projectJson, onProjectChange, onCapture }: DirectorDeskEditorProps) {
  return (
    <div>
      <span>镜头数：{Array.isArray(projectJson.cameras) ? projectJson.cameras.length : 0}</span>
      <button type="button" onClick={() => onProjectChange({ cameras: [{ id: "camera-1" }] })}>
        调整机位
      </button>
      <button
        type="button"
        onClick={() => onCapture({ dataUrl: "data:image/png;base64,aG9kb3I=", fileName: "shot.png" })}
      >
        发送截图
      </button>
    </div>
  );
}

function createAdapter(): DirectorDeskAdapter {
  return {
    saveProject: vi.fn().mockResolvedValue({ revision: "revision-1" }),
    uploadCapture: vi.fn().mockResolvedValue({ url: "https://assets.pancat.ai/shot.png", assetId: "asset-1" }),
  };
}

describe("DirectorDeskPage", () => {
  it("loads the scoped local draft and saves editor changes", async () => {
    localStorage.setItem(
      "hodor:director-desk:v1:project-7:storyboard-31",
      JSON.stringify({
        version: 1,
        scope: { projectId: "project-7", storyboardId: "storyboard-31" },
        projectJson: { cameras: [{ id: "existing" }, { id: "existing-2" }] },
        captures: [],
        updatedAt: "2026-07-20T09:00:00.000Z",
        saveState: "local",
        error: null,
      }),
    );
    const adapter = createAdapter();

    render(
      <DirectorDeskPage
        projectId="project-7"
        storyboardId="storyboard-31"
        adapter={adapter}
        EditorComponent={Editor}
      />,
    );

    expect(screen.getByText("镜头数：2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "调整机位" }));
    fireEvent.click(screen.getByRole("button", { name: "保存工程" }));

    await waitFor(() =>
      expect(adapter.saveProject).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: { projectId: "project-7", storyboardId: "storyboard-31" },
          projectJson: { cameras: [{ id: "camera-1" }] },
        }),
      ),
    );
    expect(screen.getByRole("status")).toHaveTextContent("已保存");
  });

  it("uploads captures and shows retained failures", async () => {
    const adapter = createAdapter();
    adapter.uploadCapture = vi.fn().mockRejectedValue(new Error("素材服务繁忙"));

    render(
      <DirectorDeskPage
        projectId="project-8"
        storyboardId="storyboard-41"
        adapter={adapter}
        EditorComponent={Editor}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "发送截图" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("素材服务繁忙");
    expect(screen.getByText("shot.png · 上传失败，可重试")).toBeInTheDocument();
  });
});
