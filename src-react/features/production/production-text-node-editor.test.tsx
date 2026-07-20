import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ProductionTextNodeEditor } from "./production-text-node-editor";

describe("ProductionTextNodeEditor", () => {
  it("shows a readable preview and only writes the shared contract after save", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<ProductionTextNodeEditor label="拍摄计划" value={"# 第一幕\n- 雨夜推进"} placeholder="等待拍摄计划" onSave={onSave} />);

    expect(screen.getByText("第一幕")).toBeInTheDocument();
    expect(screen.getByText("雨夜推进")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "编辑拍摄计划" }));
    const dialog = screen.getByRole("dialog", { name: "编辑拍摄计划" });
    const editor = within(dialog).getByLabelText("拍摄计划内容");
    await user.clear(editor);
    await user.type(editor, "第二幕：医院走廊");
    await user.click(within(dialog).getByRole("button", { name: "取消" }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("第一幕")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "编辑拍摄计划" }));
    const reopened = screen.getByRole("dialog", { name: "编辑拍摄计划" });
    const reopenedEditor = within(reopened).getByLabelText("拍摄计划内容");
    await user.clear(reopenedEditor);
    await user.type(reopenedEditor, "第二幕：医院走廊");
    await user.click(within(reopened).getByRole("button", { name: "保存" }));

    expect(onSave).toHaveBeenCalledOnce();
    expect(onSave).toHaveBeenCalledWith("第二幕：医院走廊");
  });

  it("does not bubble text selection gestures into the draggable canvas", async () => {
    const onPointerDown = vi.fn();
    render(
      <div onPointerDown={onPointerDown}>
        <ProductionTextNodeEditor label="剧本原文" value="雨夜，角色推门。" placeholder="等待剧本" onSave={vi.fn()} />
      </div>,
    );

    fireEvent.pointerDown(screen.getByLabelText("剧本原文预览"));
    expect(onPointerDown).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "编辑剧本原文" }));
    fireEvent.pointerDown(screen.getByLabelText("剧本原文内容"));
    expect(onPointerDown).not.toHaveBeenCalled();
  });

  it("saves with the keyboard shortcut", () => {
    const onSave = vi.fn();
    render(<ProductionTextNodeEditor label="分镜表" value="旧分镜" placeholder="等待分镜表" tall onSave={onSave} />);

    fireEvent.click(screen.getByRole("button", { name: "编辑分镜表" }));
    fireEvent.change(screen.getByLabelText("分镜表内容"), { target: { value: "新分镜" } });
    fireEvent.keyDown(document, { key: "Enter", ctrlKey: true });

    expect(onSave).toHaveBeenCalledWith("新分镜");
    expect(screen.queryByRole("dialog", { name: "编辑分镜表" })).not.toBeInTheDocument();
  });
});
