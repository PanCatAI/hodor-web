import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProjectsPage } from "./projects-page";
import type { ProjectsApi } from "./projects-api";
import { PROJECT_GOAL_DRAFT_KEY, readProjectGoalDraft } from "./project-goal-draft";
import { ProjectGoalDialog } from "./project-goal-dialog";

function createApi(overrides: Partial<ProjectsApi> = {}): ProjectsApi {
  return {
    listProjects: vi.fn().mockResolvedValue([]),
    createProject: vi.fn().mockResolvedValue({ id: "88" }),
    updateProject: vi.fn().mockResolvedValue(undefined),
    updateWorldProfile: vi.fn().mockResolvedValue(undefined),
    extractWorldProfile: vi.fn().mockResolvedValue({ profile: null, evidence: {} }),
    deleteProject: vi.fn().mockResolvedValue(undefined),
    listModels: vi.fn().mockResolvedValue([]),
    getModelDetail: vi.fn().mockResolvedValue({}),
    listVisualManuals: vi.fn().mockResolvedValue([]),
    createVisualManual: vi.fn().mockResolvedValue(undefined),
    updateVisualManual: vi.fn().mockResolvedValue(undefined),
    deleteVisualManual: vi.fn().mockResolvedValue(undefined),
    listDirectorManuals: vi.fn().mockResolvedValue([]),
    createDirectorManual: vi.fn().mockResolvedValue(undefined),
    updateDirectorManual: vi.fn().mockResolvedValue(undefined),
    deleteDirectorManual: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("ProjectGoalDialog", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    window.history.replaceState(null, "", "/index.react.html#/projects");
  });

  it("occupies the visual center and collects goal, type and constraints", () => {
    render(<ProjectGoalDialog api={createApi()} onClose={() => undefined} onOpenDetailedConfig={() => undefined} />);

    const dialog = screen.getByRole("dialog", { name: "开始一次新制作" });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "开始一次新制作" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "制作目标" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "必要约束" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "项目类型 小说原文" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "项目类型 互动剧" })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "开始执行" })).toBeDisabled();
  });

  it("creates the project from the goal, writes the draft, and enters the shared canvas", async () => {
    const api = createApi();
    window.history.replaceState(null, "", "/index.react.html#/projects");
    render(<ProjectGoalDialog api={api} onClose={() => undefined} onOpenDetailedConfig={() => undefined} />);

    fireEvent.change(screen.getByRole("textbox", { name: "制作目标" }), { target: { value: "做一支 60 秒雨夜悬疑短片，保留可编辑的分镜关系" } });
    fireEvent.click(screen.getByRole("radio", { name: "项目类型 互动剧" }));
    fireEvent.change(screen.getByRole("textbox", { name: "必要约束" }), { target: { value: "不超过 60 秒\n竖屏 9:16" } });
    fireEvent.click(screen.getByRole("button", { name: "开始执行" }));

    await waitFor(() =>
      expect(api.createProject).toHaveBeenCalledWith(
        expect.objectContaining({
          projectType: "interactive",
          name: "做一支 60 秒雨夜悬疑短片，保留可编辑",
          intro: "做一支 60 秒雨夜悬疑短片，保留可编辑的分镜关系",
        }),
      ),
    );
    expect(window.location.hash).toBe("#/projects/88/canvas");
    expect(localStorage.getItem("hodorSelectedProjectId")).toBe("88");
    expect(readProjectGoalDraft()).toEqual({
      goal: "做一支 60 秒雨夜悬疑短片，保留可编辑的分镜关系",
      constraints: "不超过 60 秒\n竖屏 9:16",
      projectType: "interactive",
    });
  });

  it("keeps the goal draft in session storage so the canvas can prefill the production graph", async () => {
    const api = createApi();
    render(<ProjectGoalDialog api={api} onClose={() => undefined} onOpenDetailedConfig={() => undefined} />);

    fireEvent.change(screen.getByRole("textbox", { name: "制作目标" }), { target: { value: "普通项目短片" } });
    fireEvent.change(screen.getByRole("textbox", { name: "必要约束" }), { target: { value: "竖屏 9:16" } });
    fireEvent.click(screen.getByRole("button", { name: "开始执行" }));

    await waitFor(() => expect(sessionStorage.getItem(PROJECT_GOAL_DRAFT_KEY)).toBeTruthy());
    expect(JSON.parse(sessionStorage.getItem(PROJECT_GOAL_DRAFT_KEY) ?? "null")).toMatchObject({
      goal: "普通项目短片",
      constraints: "竖屏 9:16",
      projectType: "novel",
    });
  });

  it("opens the detailed configuration form instead of creating", () => {
    const onOpenDetailedConfig = vi.fn();
    render(<ProjectGoalDialog api={createApi()} onClose={() => undefined} onOpenDetailedConfig={onOpenDetailedConfig} />);

    fireEvent.click(screen.getByRole("button", { name: "详细配置（模型 / 手册 / 世界设定）" }));
    expect(onOpenDetailedConfig).toHaveBeenCalledTimes(1);
  });

  it("keeps the detailed create form as the secondary entry on the projects page", async () => {
    const api = createApi();
    window.history.replaceState(null, "", "/index.react.html#/projects");
    render(<ProjectsPage api={api} />);

    await screen.findByText("还没有项目");
    fireEvent.click(screen.getByRole("button", { name: "从目标开始" }));
    expect(screen.getByRole("dialog", { name: "开始一次新制作" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "详细配置（模型 / 手册 / 世界设定）" }));
    expect(screen.getByRole("dialog", { name: "新建项目" })).toBeInTheDocument();
  });
});
