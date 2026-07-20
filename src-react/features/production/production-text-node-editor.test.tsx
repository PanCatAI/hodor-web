import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { ProductionTextNodeEditor } from "./production-text-node-editor";

beforeAll(() => {
  Object.defineProperties(Range.prototype, {
    getClientRects: {
      configurable: true,
      value: () => [],
    },
    getBoundingClientRect: {
      configurable: true,
      value: () => ({ bottom: 0, height: 0, left: 0, right: 0, top: 0, width: 0, x: 0, y: 0, toJSON: () => ({}) }),
    },
  });
});

async function replaceEditorText(dialog: HTMLElement, value: string) {
  const editor = within(dialog).getByRole("textbox");
  await userEvent.click(editor);
  await userEvent.keyboard("{Control>}a{/Control}");
  await userEvent.keyboard(value);
}

describe("ProductionTextNodeEditor", () => {
  it("uses the upstream editor, keeps edits local, and writes the shared contract only after save", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<ProductionTextNodeEditor label="拍摄计划" value={"# 第一幕\n- 雨夜推进"} placeholder="等待拍摄计划" onSave={onSave} />);

    expect(screen.getByText("第一幕")).toBeInTheDocument();
    expect(screen.getByText("雨夜推进")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "编辑拍摄计划" }));
    const dialog = screen.getByRole("dialog", { name: "编辑拍摄计划" });
    expect(dialog).toHaveClass("w-[90vw]");
    expect(within(dialog).getByLabelText("拍摄计划内容").querySelector(".md-editor")).toHaveStyle({ height: "72vh" });
    expect(within(dialog).getByRole("button", { name: "加粗" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "后退" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "前进" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "预览" })).toBeInTheDocument();
    expect(within(dialog).getAllByText("第一幕").length).toBeGreaterThan(0);

    await replaceEditorText(dialog, "第二幕：医院走廊");
    await user.click(within(dialog).getByRole("button", { name: "取消" }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("第一幕")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "编辑拍摄计划" }));
    const reopened = screen.getByRole("dialog", { name: "编辑拍摄计划" });
    await replaceEditorText(reopened, "第二幕：医院走廊");
    await user.click(within(reopened).getByRole("button", { name: "保存" }));

    expect(onSave).toHaveBeenCalledOnce();
    expect(onSave.mock.calls[0]?.[0].trim()).toBe("第二幕：医院走廊");
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

  it("cancels with Escape and rejects pasted or dropped media like the upstream nodes", () => {
    const onSave = vi.fn();
    render(<ProductionTextNodeEditor label="分镜表" value="旧分镜" placeholder="等待分镜表" tall onSave={onSave} />);

    fireEvent.click(screen.getByRole("button", { name: "编辑分镜表" }));
    const editor = screen.getByLabelText("分镜表内容");
    expect(
      fireEvent.paste(editor, {
        clipboardData: { items: [{ type: "image/png" }] },
      }),
    ).toBe(false);
    expect(fireEvent.drop(editor)).toBe(false);
    fireEvent.keyDown(document, { key: "Escape" });

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "编辑分镜表" })).not.toBeInTheDocument();
  });

  it("renders Markdown with the same engine family as the upstream preview", () => {
    render(
      <ProductionTextNodeEditor
        label="剧本"
        value={
          "# 第一幕\n\n**雨夜**\n\n- [x] 建立场景\n\n| 镜头 | 景别 |\n| --- | --- |\n| 1 | 远景 |\n\n```txt\nFADE IN\n```\n\n![参考图](https://example.test/reference.jpg)"
        }
        placeholder="暂无数据"
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "第一幕" })).toBeInTheDocument();
    expect(screen.getByText("雨夜").tagName).toBe("STRONG");
    expect(screen.getByRole("checkbox")).toBeChecked();
    expect(screen.getByText("建立场景")).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("FADE IN").closest("code")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "参考图" })).toHaveAttribute("src", "https://example.test/reference.jpg");
  });
});
