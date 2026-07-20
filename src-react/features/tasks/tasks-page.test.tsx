import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TasksPage } from "./tasks-page";

const taskRows = [
  {
    id: 12,
    taskClass: "视频生成",
    relatedObjects: "第 3 幕 / 镜头 7",
    model: "pancat:pancat-video",
    projectName: "长安十二时辰",
    state: "生成失败",
    startTime: 1760000000000,
    describe: "生成追逐镜头",
    reason: "输入图片仍在处理中",
  },
  {
    id: 11,
    taskClass: "生成分镜图片",
    relatedObjects: "第 3 幕 / 镜头 6",
    model: "pancat:pancat-image",
    projectName: "长安十二时辰",
    state: "进行中",
    startTime: 1759999900000,
    describe: "生成分镜图",
  },
];

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function mockTaskApi() {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith("/task/getTaskCategories")) {
      return jsonResponse({ data: [{ taskClass: "视频生成" }, { taskClass: "生成分镜图片" }] });
    }
    if (url.endsWith("/task/getProject")) {
      return jsonResponse({ data: [{ id: 9, name: "长安十二时辰" }] });
    }
    if (url.endsWith("/task/getTaskApi")) {
      return jsonResponse({ data: { data: taskRows, total: taskRows.length } });
    }
    return jsonResponse({ message: "unknown endpoint" }, 404);
  });
}

describe("TasksPage", () => {
  beforeEach(() => {
    localStorage.setItem("token", "Bearer pancat-session");
  });

  it("shows task state and the full failure reason", async () => {
    mockTaskApi();

    render(<TasksPage />);

    expect(await screen.findByRole("heading", { name: "任务中心" })).toBeInTheDocument();
    const failedRow = (await screen.findByText("输入图片仍在处理中")).closest("tr");
    expect(failedRow).not.toBeNull();
    expect(within(failedRow!).getByText("生成失败")).toBeInTheDocument();
    expect(screen.getAllByText("进行中")).toHaveLength(2);
  });

  it("sends project, category and state filters to the backend", async () => {
    const request = mockTaskApi();
    render(<TasksPage />);
    await screen.findByText("输入图片仍在处理中");

    fireEvent.change(screen.getByLabelText("项目"), { target: { value: "9" } });
    fireEvent.change(screen.getByLabelText("任务类型"), { target: { value: "视频生成" } });
    fireEvent.change(screen.getByLabelText("任务状态"), { target: { value: "生成失败" } });

    await waitFor(() => {
      const calls = request.mock.calls.filter(([input]) => String(input).endsWith("/task/getTaskApi"));
      expect(calls.length).toBeGreaterThanOrEqual(4);
      const body = JSON.parse(String(calls.at(-1)?.[1]?.body));
      expect(body).toEqual({
        page: 1,
        limit: 10,
        projectId: 9,
        taskClass: "视频生成",
        state: "生成失败",
      });
    });
  });

  it("reloads the task list when refresh is pressed", async () => {
    const request = mockTaskApi();
    render(<TasksPage />);
    await screen.findByText("输入图片仍在处理中");

    const before = request.mock.calls.filter(([input]) => String(input).endsWith("/task/getTaskApi")).length;
    fireEvent.click(screen.getByRole("button", { name: "刷新任务" }));

    await waitFor(() => {
      const after = request.mock.calls.filter(([input]) => String(input).endsWith("/task/getTaskApi")).length;
      expect(after).toBe(before + 1);
    });
  });

  it("keeps the page usable when loading fails", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => jsonResponse({ message: "任务数据库暂时不可用" }, 500));

    render(<TasksPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("任务数据库暂时不可用");
    expect(screen.getByRole("button", { name: "重新加载" })).toBeInTheDocument();
  });
});
