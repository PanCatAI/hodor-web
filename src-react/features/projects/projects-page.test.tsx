import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HodorApp } from "@react/app/hodor-app";

function openProjects() {
  window.scrollTo = vi.fn();
  localStorage.setItem("token", "Bearer pancat-session");
  window.history.replaceState(null, "", "/index.react.html#/projects");
}

describe("Projects page", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads and displays Hodor projects from the compatible API", async () => {
    openProjects();
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              id: "7",
              name: "长安十二时辰",
              intro: "自动生成样片的内部项目",
              projectType: "novel",
              artStyle: "国风写实",
              imageModel: "pancat:pancat-image",
              videoModel: "pancat:pancat-video",
              createTime: 1760000000000,
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    render(<HodorApp />);

    expect(await screen.findByRole("heading", { name: "长安十二时辰" })).toBeInTheDocument();
    expect(screen.getByText("自动生成样片的内部项目")).toBeInTheDocument();
    expect(screen.getByText("国风写实")).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith(
      "http://localhost:10588/api/project/getProject",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("carries the project id into the project workspace route", async () => {
    openProjects();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              id: "7",
              name: "长安十二时辰",
              projectType: "novel",
              imageModel: "pancat:pancat-image",
              videoModel: "pancat:pancat-video",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    render(<HodorApp />);
    fireEvent.click(await screen.findByRole("link", { name: "打开项目 长安十二时辰" }));

    await waitFor(() => expect(window.location.hash).toBe("#/projects/7/novels"));
    expect(await screen.findByRole("heading", { name: "原文管理" })).toBeInTheDocument();
    expect(localStorage.getItem("hodorSelectedProjectId")).toBe("7");
  });

  it("shows a useful empty state when no projects exist", async () => {
    openProjects();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(<HodorApp />);

    expect(await screen.findByText("还没有项目")).toBeInTheDocument();
    expect(screen.getByText("新建项目后，从原文、资产和分镜开始生产。")).toBeInTheDocument();
  });

  it("keeps the workspace usable when the project request fails", async () => {
    openProjects();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message: "数据库暂时不可用" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(<HodorApp />);

    expect(await screen.findByRole("alert")).toHaveTextContent("数据库暂时不可用");
    expect(screen.getByRole("button", { name: "重新加载" })).toBeInTheDocument();
  });
});
