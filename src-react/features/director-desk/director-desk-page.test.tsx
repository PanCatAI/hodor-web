import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DirectorDeskPage, type DirectorDeskAdapter, type DirectorDeskEditorProps } from "./index";

function Editor({ projectJson, onProjectChange, onCapture }: DirectorDeskEditorProps) {
  return (
    <div>
      <span>镜头数：{Array.isArray(projectJson.cameras) ? projectJson.cameras.length : 0}</span>
      <button type="button" onClick={() => onProjectChange({ cameras: [{ id: "camera-1" }] })}>
        调整机位
      </button>
      <button type="button" onClick={() => onCapture({ dataUrl: "data:image/png;base64,aG9kb3I=", fileName: "shot.png" })}>
        发送截图
      </button>
    </div>
  );
}

function createAdapter(): DirectorDeskAdapter {
  return {
    loadProject: vi.fn().mockResolvedValue(null),
    saveProject: vi.fn().mockResolvedValue({ revision: "revision-1" }),
    uploadCapture: vi.fn().mockResolvedValue({ url: "https://assets.pancat.ai/shot.png", assetId: "asset-1" }),
  };
}

describe("DirectorDeskPage", () => {
  it("loads the cloud project on first render", async () => {
    const adapter = createAdapter();
    adapter.loadProject = vi.fn().mockResolvedValue({
      projectJson: { cameras: [{ id: "cloud-camera" }] },
      captures: [],
      revision: "revision-cloud",
      updatedAt: "2026-07-20T08:00:00.000Z",
    });

    render(<DirectorDeskPage projectId="project-cloud" storyboardId="storyboard-cloud" adapter={adapter} EditorComponent={Editor} />);

    expect(await screen.findByText("镜头数：1")).toBeInTheDocument();
    expect(adapter.loadProject).toHaveBeenCalledWith({
      projectId: "project-cloud",
      storyboardId: "storyboard-cloud",
    });
  });

  it("keeps the offline draft and lets the operator retry cloud loading", async () => {
    const adapter = createAdapter();
    adapter.loadProject = vi
      .fn()
      .mockRejectedValueOnce(new Error("云端暂时不可用"))
      .mockResolvedValueOnce({
        projectJson: { cameras: [{ id: "recovered-cloud-camera" }] },
        captures: [],
        revision: "revision-recovered",
      });

    render(
      <DirectorDeskPage
        projectId="project-retry"
        storyboardId="storyboard-retry"
        adapter={adapter}
        EditorComponent={Editor}
        initialProjectJson={{ cameras: [{ id: "offline-camera" }] }}
      />,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("云端暂时不可用");
    fireEvent.click(screen.getByRole("button", { name: "重新载入云端工程" }));
    expect(await screen.findByText("镜头数：1")).toBeInTheDocument();
    expect(adapter.loadProject).toHaveBeenCalledTimes(2);
  });

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

    render(<DirectorDeskPage projectId="project-7" storyboardId="storyboard-31" adapter={adapter} EditorComponent={Editor} />);

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

    render(<DirectorDeskPage projectId="project-8" storyboardId="storyboard-41" adapter={adapter} EditorComponent={Editor} />);
    fireEvent.click(screen.getByRole("button", { name: "发送截图" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("素材服务繁忙");
    expect(screen.getByText("shot.png · 上传失败，可重试")).toBeInTheDocument();
  });
});
