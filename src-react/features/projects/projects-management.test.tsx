import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ProjectsPage } from "./projects-page";
import type { ProjectsApi } from "./projects-api";

function createApi(overrides: Partial<ProjectsApi> = {}): ProjectsApi {
  return {
    listProjects: vi.fn().mockResolvedValue([]),
    createProject: vi.fn().mockResolvedValue(undefined),
    updateProject: vi.fn().mockResolvedValue(undefined),
    deleteProject: vi.fn().mockResolvedValue(undefined),
    listModels: vi.fn().mockImplementation(async (type) => type === "image"
      ? [{ id: "pancat:pancat-image", label: "Pancat Image", type: "image", vendorName: "Pancat" }]
      : [{ id: "pancat:pancat-video", label: "Pancat Video", type: "video", vendorName: "Pancat" }]),
    getModelDetail: vi.fn().mockResolvedValue({}),
    listVisualManuals: vi.fn().mockResolvedValue([{ name: "写实", stylePath: "realistic", images: ["cover.jpg"], data: [] }]),
    createVisualManual: vi.fn().mockResolvedValue(undefined),
    updateVisualManual: vi.fn().mockResolvedValue(undefined),
    deleteVisualManual: vi.fn().mockResolvedValue(undefined),
    listDirectorManuals: vi.fn().mockResolvedValue([{ name: "悬疑", directorManual: "crime", images: ["director.jpg"], data: [] }]),
    createDirectorManual: vi.fn().mockResolvedValue(undefined),
    updateDirectorManual: vi.fn().mockResolvedValue(undefined),
    deleteDirectorManual: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("Projects management", () => {
  it("creates a fully configured project and refreshes the list", async () => {
    const user = userEvent.setup();
    const api = createApi();
    render(<ProjectsPage api={api} />);

    await screen.findByText("还没有项目");
    await user.click(screen.getByRole("button", { name: "新建项目" }));
    const dialog = screen.getByRole("dialog", { name: "新建项目" });
    await waitFor(() => expect(api.listModels).toHaveBeenCalledTimes(2));
    await user.type(within(dialog).getByLabelText("项目名称"), "长安十二时辰");
    await user.type(within(dialog).getByLabelText("题材类型"), "悬疑");
    await user.type(within(dialog).getByLabelText("项目简介"), "内部样片");
    await user.selectOptions(within(dialog).getByLabelText("视觉手册"), "realistic");
    await user.selectOptions(within(dialog).getByLabelText("导演手册"), "crime");
    await user.selectOptions(within(dialog).getByLabelText("图片模型"), "pancat:pancat-image");
    await user.selectOptions(within(dialog).getByLabelText("视频模型"), "pancat:pancat-video");
    await user.click(within(dialog).getByRole("button", { name: "创建项目" }));

    await waitFor(() => expect(api.createProject).toHaveBeenCalledWith(expect.objectContaining({
      name: "长安十二时辰",
      artStyle: "realistic",
      directorManual: "crime",
      imageModel: "pancat:pancat-image",
      videoModel: "pancat:pancat-video",
    })));
    expect(api.listProjects).toHaveBeenCalledTimes(2);
  });

  it("edits and deletes an existing project", async () => {
    const user = userEvent.setup();
    const project = { id: "7", name: "旧项目", intro: "旧简介", type: "悬疑", projectType: "novel", artStyle: "realistic", directorManual: "crime", imageModel: "pancat:pancat-image", videoModel: "pancat:pancat-video", videoRatio: "16:9", imageQuality: "1K", mode: "singleImage" };
    const api = createApi({ listProjects: vi.fn().mockResolvedValue([project]) });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<ProjectsPage api={api} />);

    await screen.findByRole("heading", { name: "旧项目" });
    await user.click(screen.getByRole("button", { name: "编辑项目 旧项目" }));
    const dialog = screen.getByRole("dialog", { name: "编辑项目" });
    const name = within(dialog).getByLabelText("项目名称");
    await user.clear(name);
    await user.type(name, "新项目");
    await user.click(within(dialog).getByRole("button", { name: "保存修改" }));
    await waitFor(() => expect(api.updateProject).toHaveBeenCalledWith(expect.objectContaining({ id: "7", name: "新项目" })));

    await user.click(screen.getByRole("button", { name: "删除项目 旧项目" }));
    await waitFor(() => expect(api.deleteProject).toHaveBeenCalledWith("7"));
  });

  it("blocks entry and opens settings when a configured model is unavailable", async () => {
    const user = userEvent.setup();
    const project = { id: "7", name: "模型失效项目", projectType: "novel", artStyle: "realistic", directorManual: "crime", imageModel: "offline:image", videoModel: "pancat:pancat-video" };
    const api = createApi({
      listProjects: vi.fn().mockResolvedValue([project]),
      getModelDetail: vi.fn().mockRejectedValue(new Error("供应商已停用")),
    });
    window.history.replaceState(null, "", "/index.html#/projects");
    render(<ProjectsPage api={api} />);

    await user.click(await screen.findByRole("link", { name: "打开项目 模型失效项目" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("模型不可用");
    expect(screen.getByRole("dialog", { name: "编辑项目" })).toBeInTheDocument();
    expect(window.location.hash).toBe("#/projects");
  });

  it("creates, edits and deletes visual manuals", async () => {
    const user = userEvent.setup();
    const api = createApi();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<ProjectsPage api={api} />);

    await screen.findByText("还没有项目");
    await user.click(screen.getByRole("button", { name: "管理手册" }));
    const manager = screen.getByRole("dialog", { name: "手册管理" });
    await user.click(within(manager).getByRole("button", { name: "新增视觉手册" }));
    const editor = screen.getByRole("dialog", { name: "新增视觉手册" });
    await user.type(within(editor).getByLabelText("手册名称"), "赛博朋克");
    await user.type(within(editor).getByLabelText("目录标识"), "cyberpunk");
    await user.type(within(editor).getByLabelText("封面地址"), "https://example.com/cover.jpg");
    for (const textarea of within(editor).getAllByRole("textbox").filter((node) => node.tagName === "TEXTAREA")) {
      await user.type(textarea, "提示词");
    }
    await user.click(within(editor).getByRole("button", { name: "保存视觉手册" }));
    await waitFor(() => expect(api.createVisualManual).toHaveBeenCalledWith(expect.objectContaining({ stylePath: "cyberpunk" })));

    await user.click(within(manager).getByRole("button", { name: "编辑视觉手册 写实" }));
    await user.click(within(screen.getByRole("dialog", { name: "编辑视觉手册" })).getByRole("button", { name: "保存视觉手册" }));
    await waitFor(() => expect(api.updateVisualManual).toHaveBeenCalled());
    await user.click(within(manager).getByRole("button", { name: "删除视觉手册 写实" }));
    await waitFor(() => expect(api.deleteVisualManual).toHaveBeenCalledWith("realistic"));
  });

  it("creates, edits and deletes director manuals", async () => {
    const user = userEvent.setup();
    const api = createApi();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<ProjectsPage api={api} />);

    await screen.findByText("还没有项目");
    await user.click(screen.getByRole("button", { name: "管理手册" }));
    const manager = screen.getByRole("dialog", { name: "手册管理" });
    await user.click(within(manager).getByRole("button", { name: "导演手册" }));
    await user.click(within(manager).getByRole("button", { name: "新增导演手册" }));
    const editor = screen.getByRole("dialog", { name: "新增导演手册" });
    await user.type(within(editor).getByLabelText("手册名称"), "动作片");
    await user.type(within(editor).getByLabelText("目录标识"), "action");
    await user.type(within(editor).getByLabelText("封面地址"), "https://example.com/director.jpg");
    for (const textarea of within(editor).getAllByRole("textbox").filter((node) => node.tagName === "TEXTAREA")) {
      await user.type(textarea, "导演提示词");
    }
    await user.click(within(editor).getByRole("button", { name: "保存导演手册" }));
    await waitFor(() => expect(api.createDirectorManual).toHaveBeenCalledWith(expect.objectContaining({ directorManual: "action" })));

    await user.click(within(manager).getByRole("button", { name: "编辑导演手册 悬疑" }));
    await user.click(within(screen.getByRole("dialog", { name: "编辑导演手册" })).getByRole("button", { name: "保存导演手册" }));
    await waitFor(() => expect(api.updateDirectorManual).toHaveBeenCalled());
    await user.click(within(manager).getByRole("button", { name: "删除导演手册 悬疑" }));
    await waitFor(() => expect(api.deleteDirectorManual).toHaveBeenCalledWith("crime"));
  });
});
