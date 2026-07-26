import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DirectorDeskPage, type DirectorDeskAdapter, type DirectorDeskEditorProps } from "./index";

function Editor({ projectJson, onProjectChange, onCapture }: DirectorDeskEditorProps) {
  return (
    <div>
      <span>镜头数：{Array.isArray(projectJson.cameras) ? projectJson.cameras.length : 0}</span>
      <span>当前全景：{String(projectJson.panoramaAssetId ?? "无")}</span>
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
    startWorldGeneration: vi.fn(),
    getWorldGeneration: vi.fn(),
    refreshWorldGeneration: vi.fn(),
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

  it("generates a Marble world, refreshes the recoverable job, and applies its panorama", async () => {
    const adapter = createAdapter();
    adapter.startWorldGeneration = vi.fn().mockResolvedValue({
      jobId: "world-job-1",
      projectId: 7,
      storyboardId: 31,
      provider: "worldlabs-marble",
      model: "marble-1.1",
      status: "running",
      progress: 4,
      progressDescription: "queued",
      prompt: "Abandoned hospital corridor",
      sceneAsset: null,
      error: null,
    });
    adapter.refreshWorldGeneration = vi.fn().mockResolvedValue({
      jobId: "world-job-1",
      projectId: 7,
      storyboardId: 31,
      provider: "worldlabs-marble",
      model: "marble-1.1",
      status: "succeeded",
      progress: 100,
      progressDescription: "completed",
      prompt: "Abandoned hospital corridor",
      sceneAsset: {
        provider: "worldlabs-marble",
        worldId: "world-1",
        displayName: "Hospital",
        worldMarbleUrl: "https://marble.worldlabs.ai/world-1",
        panoramaUrl: "https://cdn.worldlabs.ai/pano.jpg",
        colliderMeshUrl: "https://cdn.worldlabs.ai/collider.glb",
        spzUrls: {},
        thumbnailUrl: "",
        caption: "Hospital",
        semantics: { groundPlaneOffset: 0, metricScaleFactor: 1 },
      },
      error: null,
    });

    render(
      <DirectorDeskPage
        projectId={7}
        storyboardId={31}
        adapter={adapter}
        EditorComponent={Editor}
        initialProjectJson={{ cameras: [], assets: [], objects: [], panoramaAssetId: null, worldPrompt: "Abandoned hospital corridor" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "生成 Marble 场景" }));
    expect(screen.getByLabelText("Marble 场景提示词")).toHaveValue("Abandoned hospital corridor");
    fireEvent.click(screen.getByRole("button", { name: "开始生成 3D 场景" }));

    await waitFor(() => expect(adapter.startWorldGeneration).toHaveBeenCalledWith(expect.objectContaining({
      scope: { projectId: 7, storyboardId: 31 },
      prompt: "Abandoned hospital corridor",
      model: "marble-1.1",
    })));
    expect(await screen.findByText(/任务已提交/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "刷新 Marble 任务" }));
    expect(await screen.findByText("当前全景：marble-panorama-world-1")).toBeInTheDocument();
    await waitFor(() => expect(adapter.saveProject).toHaveBeenCalledWith(expect.objectContaining({
      projectJson: expect.objectContaining({
        panoramaAssetId: "marble-panorama-world-1",
        sceneWorld: expect.objectContaining({ worldId: "world-1" }),
      }),
    })));
  });
});
