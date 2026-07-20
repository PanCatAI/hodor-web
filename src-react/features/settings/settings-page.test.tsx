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

    [
      "界面",
      "语言",
      "供应商",
      "模型映射",
      "智能体",
      "提示词",
      "Skills",
      "记忆",
      "数据库",
      "文件",
      "其他",
      "请求",
      "开发",
      "关于",
      "会话",
    ].forEach((name) => expect(screen.getByRole("button", { name })).toBeInTheDocument());
  });

  it("loads a remote section and displays its JSON response", async () => {
    const load = vi.fn(async () => [{ id: 1, name: "Pancat", enable: true }]);
    render(<SettingsPage api={createSettingsApiStub({ load })} />);

    fireEvent.click(screen.getByRole("button", { name: "供应商" }));

    await waitFor(() => expect(load).toHaveBeenCalledWith("providers"));
    expect((screen.getByLabelText("供应商 JSON") as HTMLTextAreaElement).value).toContain('"name": "Pancat"');
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
});
