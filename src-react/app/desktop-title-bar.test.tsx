// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { HodorDesktopAction } from "@react/platform/runtime";
import { DesktopTitleBar } from "./desktop-title-bar";

describe("DesktopTitleBar", () => {
  it("does not render in a browser", () => {
    render(<DesktopTitleBar runtime="browser" />);
    expect(screen.queryByLabelText("桌面窗口栏")).toBeNull();
  });

  it("connects every frameless window control", () => {
    const actions: HodorDesktopAction[] = [];
    const invoke = async <T extends object = { ok?: boolean }>(action: HodorDesktopAction): Promise<T | null> => {
      actions.push(action);
      return { ok: true } as T;
    };
    render(<DesktopTitleBar runtime="electron" invoke={invoke} />);

    fireEvent.click(screen.getByRole("button", { name: "最小化窗口" }));
    fireEvent.click(screen.getByRole("button", { name: "最大化窗口" }));
    fireEvent.click(screen.getByRole("button", { name: "关闭窗口" }));

    expect(actions).toEqual([
      "windowMinimize",
      "windowMaximize",
      "windowClose",
    ]);
  });
});
