import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SettingsPage } from "./settings-page";
import type { SettingsApi } from "./settings-api";

function createSettingsApiStub(overrides: Partial<SettingsApi> = {}): SettingsApi {
  return {
    load: vi.fn(async () => ({})),
    save: vi.fn(async () => ({})),
    run: vi.fn(async () => ({})),
    ...overrides,
  };
}

describe("SettingsPage", () => {
  it("shows the upstream attribution in the about section", async () => {
    render(<SettingsPage api={createSettingsApiStub()} />);
    fireEvent.click(screen.getByRole("button", { name: "关于" }));
    expect(await screen.findByText(/Based on Toonflow by HBAI-Ltd/)).toBeInTheDocument();
    expect(screen.getByAltText("Toonflow 原项目标识")).toBeInTheDocument();
  });
  it("loads and saves the Hodor backend address", () => {
    localStorage.setItem("hodorApiBaseUrl", "https://old.hodor.internal/api");
    render(<SettingsPage />);

    const input = screen.getByLabelText("Hodor API 地址");
    expect(input).toHaveValue("https://old.hodor.internal/api");

    fireEvent.change(input, { target: { value: " https://hodor.pancat.ai/api/ " } });
    fireEvent.click(screen.getByRole("button", { name: "保存地址" }));

    expect(localStorage.getItem("hodorApiBaseUrl")).toBe("https://hodor.pancat.ai/api");
    expect(screen.getByRole("status")).toHaveTextContent("后端地址已保存");
  });

  it("clears the Pancat session and returns to login", () => {
    localStorage.setItem("token", "Bearer pancat-session");
    localStorage.setItem("userId", "operator");
    localStorage.setItem("pancatAccount", "{}");
    const onLoggedOut = vi.fn();
    render(<SettingsPage onLoggedOut={onLoggedOut} />);

    fireEvent.click(screen.getByRole("button", { name: "退出登录" }));
    fireEvent.click(screen.getByRole("button", { name: "确认退出" }));

    expect(localStorage.getItem("token")).toBeNull();
    expect(localStorage.getItem("userId")).toBeNull();
    expect(localStorage.getItem("pancatAccount")).toBeNull();
    expect(onLoggedOut).toHaveBeenCalledOnce();
  });

  it("provides every settings area from the Vue settings center", () => {
    render(<SettingsPage api={createSettingsApiStub()} />);

    ["界面", "语言", "供应商", "模型映射", "智能体", "提示词", "Skills", "记忆", "数据库", "文件", "其他", "请求", "开发", "关于", "会话"].forEach(
      (name) => expect(screen.getByRole("button", { name })).toBeInTheDocument(),
    );
  });

  it("loads a remote section and displays its JSON response", async () => {
    const load = vi.fn(async () => [{ id: 1, name: "Pancat", enable: true }]);
    render(<SettingsPage api={createSettingsApiStub({ load })} />);

    fireEvent.click(screen.getByRole("button", { name: "供应商" }));

    await waitFor(() => expect(load).toHaveBeenCalledWith("providers"));
    expect(screen.getByText("Pancat")).toBeInTheDocument();
  });

  it("edits and saves a writable remote JSON section", async () => {
    const load = vi.fn(async () => ({ ragLimit: 3 }));
    const save = vi.fn(async () => ({ ok: true }));
    render(<SettingsPage api={createSettingsApiStub({ load, save })} />);

    fireEvent.click(screen.getByRole("button", { name: "记忆" }));
    const editor = await screen.findByLabelText("记忆 JSON");
    fireEvent.change(editor, { target: { value: '{"ragLimit": 4}' } });
    fireEvent.click(screen.getByRole("button", { name: "保存记忆配置" }));

    await waitFor(() => expect(save).toHaveBeenCalledWith("memory", { ragLimit: 4 }));
    expect(screen.getByRole("status")).toHaveTextContent("记忆配置已保存");
  });

  it("shows backend errors inside the active settings area", async () => {
    const load = vi.fn(async () => {
      throw new Error("供应商接口不可用");
    });
    render(<SettingsPage api={createSettingsApiStub({ load })} />);

    fireEvent.click(screen.getByRole("button", { name: "供应商" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("供应商接口不可用");
  });

  it("updates one prompt with the legacy id and data payload", async () => {
    const load = vi.fn(async () => [{ id: 7, name: "分镜提示词", type: "image", data: "old" }]);
    const save = vi.fn(async () => ({ ok: true }));
    render(<SettingsPage api={createSettingsApiStub({ load, save })} />);

    fireEvent.click(screen.getByRole("button", { name: "提示词" }));
    const editor = await screen.findByLabelText("提示词内容");
    fireEvent.change(editor, { target: { value: "new prompt" } });
    fireEvent.click(screen.getByRole("button", { name: "保存提示词" }));

    await waitFor(() => expect(save).toHaveBeenCalledWith("prompts", { id: 7, data: "new prompt" }));
  });

  it("loads and saves one skill file through the mounted skill routes", async () => {
    const load = vi.fn(async () => ["director/SKILL.md"]);
    const run = vi.fn(async () => "skill body");
    const save = vi.fn(async () => ({ ok: true }));
    render(<SettingsPage api={createSettingsApiStub({ load, run, save })} />);

    fireEvent.click(screen.getByRole("button", { name: "Skills" }));
    fireEvent.click(await screen.findByRole("button", { name: "director/SKILL.md" }));
    expect(await screen.findByLabelText("Skill 内容")).toHaveValue("skill body");
    fireEvent.change(screen.getByLabelText("Skill 内容"), { target: { value: "updated skill" } });
    fireEvent.click(screen.getByRole("button", { name: "保存 Skill" }));

    await waitFor(() => expect(run).toHaveBeenCalledWith("skills", "content", { path: "director/SKILL.md" }));
    expect(save).toHaveBeenCalledWith("skills", { path: "director/SKILL.md", content: "updated skill" });
  });

  it("edits provider inputs, toggles its state, and confirms provider deletion", async () => {
    const load = vi.fn(async () => [
      { id: "legacy", name: "旧供应商", enable: 1, inputValues: { apiKey: "secret" }, models: [], code: "old adapter" },
    ]);
    const run = vi.fn(async () => ({ ok: true }));
    render(<SettingsPage api={createSettingsApiStub({ load, run })} />);

    fireEvent.click(screen.getByRole("button", { name: "供应商" }));
    fireEvent.click(await screen.findByRole("button", { name: "编辑旧供应商" }));
    fireEvent.change(screen.getByLabelText("供应商输入 JSON"), { target: { value: '{"apiKey":"changed"}' } });
    fireEvent.click(screen.getByRole("button", { name: "保存供应商" }));
    await waitFor(() =>
      expect(run).toHaveBeenCalledWith("providers", "updateInputs", {
        id: "legacy",
        inputValues: { apiKey: "changed" },
      }),
    );

    fireEvent.change(screen.getByLabelText("供应商适配器代码"), { target: { value: "new adapter" } });
    fireEvent.click(screen.getByRole("button", { name: "保存适配器代码" }));
    await waitFor(() => expect(run).toHaveBeenCalledWith("providers", "updateCode", { id: "legacy", tsCode: "new adapter" }));

    fireEvent.click(screen.getByRole("button", { name: "停用旧供应商" }));
    await waitFor(() => expect(run).toHaveBeenCalledWith("providers", "enable", { id: "legacy", enable: 0 }));

    fireEvent.click(screen.getByRole("button", { name: "删除旧供应商" }));
    fireEvent.click(screen.getByRole("button", { name: "确认删除供应商" }));
    await waitFor(() => expect(run).toHaveBeenCalledWith("providers", "delete", { id: "legacy" }));
  });

  it("adds a provider from its TypeScript adapter contract", async () => {
    const run = vi.fn(async () => ({ ok: true }));
    render(<SettingsPage api={createSettingsApiStub({ load: vi.fn(async () => []), run })} />);

    fireEvent.click(screen.getByRole("button", { name: "供应商" }));
    fireEvent.click(await screen.findByRole("button", { name: "添加供应商" }));
    fireEvent.change(screen.getByLabelText("供应商适配器 TypeScript"), { target: { value: "export const vendor = {}" } });
    fireEvent.click(screen.getByRole("button", { name: "导入供应商适配器" }));

    await waitFor(() => expect(run).toHaveBeenCalledWith("providers", "add", { tsCode: "export const vendor = {}" }));
  });

  it.each([
    {
      type: "text" as const,
      modelName: "pancat-text",
      inputLabel: "文本测试消息",
      action: "testText",
      expected: {
        id: "pancat",
        modelName: "pancat-text",
        messages: [{ role: "user", content: "测试输入" }],
      },
    },
    {
      type: "image" as const,
      modelName: "pancat-image",
      inputLabel: "图片测试提示词",
      action: "testImage",
      expected: { id: "pancat", modelName: "pancat-image", prompt: "测试输入" },
    },
    {
      type: "video" as const,
      modelName: "pancat-video",
      inputLabel: "视频测试提示词",
      action: "testVideo",
      expected: {
        id: "pancat",
        modelName: "pancat-video",
        mode: "text",
        prompt: "测试输入",
        images: [],
        videos: [],
        audios: [],
      },
    },
  ])("tests a $type provider model without sending provider inputs", async ({ type, modelName, inputLabel, action, expected }) => {
    const load = vi.fn(async () => [
      {
        id: "pancat",
        name: "Pancat",
        enable: 1,
        inputValues: { apiKey: "must-not-leave-editor" },
        models: [{ name: modelName, modelName, type, mode: ["text"] }],
      },
    ]);
    const run = vi.fn(async () => (type === "text" ? { thinking: "", content: "测试成功" } : `https://assets.example/${type}`));
    render(<SettingsPage api={createSettingsApiStub({ load, run })} />);

    fireEvent.click(screen.getByRole("button", { name: "供应商" }));
    fireEvent.click(await screen.findByRole("button", { name: "编辑Pancat" }));
    fireEvent.click(screen.getByRole("button", { name: `测试模型${modelName}` }));
    fireEvent.change(screen.getByLabelText(inputLabel), { target: { value: "测试输入" } });
    fireEvent.click(screen.getByRole("button", { name: "开始模型测试" }));

    await waitFor(() => expect(run).toHaveBeenCalledWith("providers", action, expected));
    expect(JSON.stringify(run.mock.calls)).not.toContain("must-not-leave-editor");
  });

  it("preserves a structured video mode as the backend JSON-string contract", async () => {
    const load = vi.fn(async () => [
      {
        id: "pancat",
        name: "Pancat",
        enable: 1,
        inputValues: {},
        models: [{ name: "参考视频", modelName: "pancat-video", type: "video", mode: [["imageReference:3"]] }],
      },
    ]);
    const run = vi.fn(async () => "https://assets.example/video.mp4");
    render(<SettingsPage api={createSettingsApiStub({ load, run })} />);

    fireEvent.click(screen.getByRole("button", { name: "供应商" }));
    fireEvent.click(await screen.findByRole("button", { name: "编辑Pancat" }));
    fireEvent.click(screen.getByRole("button", { name: "测试模型pancat-video" }));
    expect(screen.getByLabelText("视频测试模式")).toHaveValue('["imageReference:3"]');
    fireEvent.change(screen.getByLabelText("视频测试提示词"), { target: { value: "三张角色参考图" } });
    fireEvent.click(screen.getByRole("button", { name: "开始模型测试" }));

    await waitFor(() =>
      expect(run).toHaveBeenCalledWith("providers", "testVideo", {
        id: "pancat",
        modelName: "pancat-video",
        mode: '["imageReference:3"]',
        prompt: "三张角色参考图",
        images: [],
        videos: [],
        audios: [],
      }),
    );
  });

  it("binds a prompt to a provider model", async () => {
    const load = vi.fn(async (section) =>
      section === "models"
        ? {
            bindings: [{ id: "pancat", name: "Pancat", promptList: [{ name: "Pancat Video", model: "pancat-video", type: "video" }] }],
            prompts: [{ name: "电影感", type: "video", path: "video/cinematic.md", data: "prompt" }],
          }
        : {},
    );
    const run = vi.fn(async () => ({ ok: true }));
    render(<SettingsPage api={createSettingsApiStub({ load, run })} />);

    fireEvent.click(screen.getByRole("button", { name: "模型映射" }));
    await screen.findByText("pancat-video");
    fireEvent.change(screen.getByLabelText("pancat-video 提示词"), { target: { value: "video/cinematic.md" } });
    fireEvent.click(screen.getByRole("button", { name: "保存 pancat-video 映射" }));

    await waitFor(() =>
      expect(run).toHaveBeenCalledWith("models", "bindPrompt", {
        vendorId: "pancat",
        model: "pancat-video",
        path: "video/cinematic.md",
        fileName: "电影感",
      }),
    );
  });

  it("creates, edits, and deletes model prompt files through mounted routes", async () => {
    const prompt = { name: "电影感", type: "video", path: "video/电影感.md", data: "old" };
    const load = vi.fn(async (section) => (section === "models" ? { bindings: [], prompts: [prompt] } : {}));
    const run = vi.fn(async () => ({ ok: true }));
    render(<SettingsPage api={createSettingsApiStub({ load, run })} />);

    fireEvent.click(screen.getByRole("button", { name: "模型映射" }));
    fireEvent.click(await screen.findByRole("button", { name: "编辑提示词电影感" }));
    fireEvent.change(screen.getByLabelText("提示词文件内容"), { target: { value: "updated" } });
    fireEvent.click(screen.getByRole("button", { name: "保存提示词文件" }));
    await waitFor(() => expect(run).toHaveBeenCalledWith("models", "updatePrompt", { name: "电影感", type: "video", data: "updated" }));

    fireEvent.click(screen.getByRole("button", { name: "删除提示词电影感" }));
    fireEvent.click(screen.getByRole("button", { name: "确认删除提示词" }));
    await waitFor(() => expect(run).toHaveBeenCalledWith("models", "deletePrompt", { path: "video/电影感.md" }));

    fireEvent.change(screen.getByLabelText("提示词文件名"), { target: { value: "写实" } });
    fireEvent.change(screen.getByLabelText("提示词类型"), { target: { value: "image" } });
    fireEvent.change(screen.getByLabelText("提示词文件内容"), { target: { value: "realistic" } });
    fireEvent.click(screen.getByRole("button", { name: "创建提示词文件" }));
    await waitFor(() => expect(run).toHaveBeenCalledWith("models", "savePrompt", { name: "写实", type: "image", data: "realistic" }));
  });

  it("loads, changes, saves, and reloads a complete vendor:model agent binding", async () => {
    let persistedModelName = "pancat:openai:gpt-4o";
    const load = vi.fn(async (section) =>
      section === "agents"
        ? {
            deployments: {
              qrdinaryData: [{ id: 4, name: "剧本智能体", model: "GPT 4o", modelName: persistedModelName, vendorId: "pancat", desc: "写剧本" }],
              advancedData: [],
            },
            useMode: "0",
            providers: [
              {
                id: "pancat",
                name: "Pancat",
                models: [
                  { name: "GPT 4o", modelName: "openai:gpt-4o", type: "text" },
                  { name: "Claude", modelName: "anthropic:claude", type: "text" },
                ],
              },
            ],
          }
        : {},
    );
    const save = vi.fn(async (_section, value) => {
      persistedModelName = (value as { modelName: string }).modelName;
      return { ok: true };
    });
    render(<SettingsPage api={createSettingsApiStub({ load, save })} />);

    fireEvent.click(screen.getByRole("button", { name: "智能体" }));
    const select = await screen.findByLabelText("剧本智能体 模型");
    expect(select).toHaveValue("pancat:openai:gpt-4o");
    fireEvent.change(select, { target: { value: "pancat:anthropic:claude" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(
        "agents",
        expect.objectContaining({
          id: 4,
          vendorId: "pancat",
          modelName: "pancat:anthropic:claude",
        }),
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "界面" }));
    fireEvent.click(screen.getByRole("button", { name: "智能体" }));
    expect(await screen.findByLabelText("剧本智能体 模型")).toHaveValue("pancat:anthropic:claude");
  });

  it("batch saves all advanced agent deployments", async () => {
    const agent = {
      id: 9,
      name: "监督智能体",
      model: "Pancat Text",
      modelName: "pancat:pancat-text",
      vendorId: "pancat",
      desc: "验收任务",
      temperature: 0.2,
      maxOutputTokens: 2048,
    };
    const load = vi.fn(async (section) =>
      section === "agents"
        ? {
            deployments: { qrdinaryData: [], advancedData: [agent] },
            useMode: "1",
            providers: [{ id: "pancat", name: "Pancat", models: [{ name: "Pancat Text", modelName: "pancat-text", type: "text" }] }],
          }
        : {},
    );
    const run = vi.fn(async () => ({ ok: true }));
    render(<SettingsPage api={createSettingsApiStub({ load, run })} />);

    fireEvent.click(screen.getByRole("button", { name: "智能体" }));
    fireEvent.click(await screen.findByRole("button", { name: "批量保存当前智能体" }));
    await waitFor(() => expect(run).toHaveBeenCalledWith("agents", "deployMany", { items: [agent] }));
  });

  it("requires confirmation before clearing all memory", async () => {
    const run = vi.fn(async () => ({ ok: true }));
    render(<SettingsPage api={createSettingsApiStub({ load: vi.fn(async () => ({ ragLimit: 3 })), run })} />);

    fireEvent.click(screen.getByRole("button", { name: "记忆" }));
    fireEvent.click(await screen.findByRole("button", { name: "清空全部记忆" }));
    expect(run).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "确认清空记忆" }));
    await waitFor(() => expect(run).toHaveBeenCalledWith("memory", "clear"));
  });

  it("downloads database exports as a blob and imports a selected backup", async () => {
    const run = vi.fn(async (_section, action) =>
      action === "export" ? { blob: new Blob(["backup"], { type: "application/json" }), filename: "hodor-backup.json" } : { ok: true },
    );
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:backup") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:backup");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    render(<SettingsPage api={createSettingsApiStub({ load: vi.fn(async () => [{ name: "projects", rowCount: 2 }]), run })} />);

    fireEvent.click(screen.getByRole("button", { name: "数据库" }));
    fireEvent.click(await screen.findByRole("button", { name: "导出数据库" }));
    await waitFor(() => expect(createObjectURL).toHaveBeenCalled());
    expect(click).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:backup");

    const file = new File([JSON.stringify({ tables: { projects: [] } })], "backup.json", { type: "application/json" });
    fireEvent.change(screen.getByLabelText("导入数据库文件"), { target: { files: [file] } });
    fireEvent.click(await screen.findByRole("button", { name: "确认导入数据库" }));
    await waitFor(() => expect(run).toHaveBeenCalledWith("database", "import", { tables: { projects: [] } }));

    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
    click.mockRestore();
  });

  it("applies and persists the theme through the shared platform preference", () => {
    render(<SettingsPage api={createSettingsApiStub()} />);
    fireEvent.click(screen.getByRole("button", { name: "界面" }));
    fireEvent.change(screen.getByLabelText("主题"), { target: { value: "light" } });
    fireEvent.click(screen.getByRole("button", { name: "保存主题" }));
    expect(localStorage.getItem("hodorTheme")).toBe("light");
    expect(document.documentElement).toHaveAttribute("theme-mode", "light");
  });

  it("does not expose browser-local production controls without consumers", () => {
    render(<SettingsPage api={createSettingsApiStub()} />);
    fireEvent.click(screen.getByRole("button", { name: "其他" }));
    expect(screen.getByText(/运行参数由云端产线合同管理/)).toBeInTheDocument();
    expect(screen.queryByLabelText("请求超时（秒）")).not.toBeInTheDocument();
  });
});
