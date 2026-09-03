import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { CanvasAgentPanel } from "./canvas-agent-panel";

describe("CanvasAgentPanel", () => {
  it("keeps the production panel resize, keyboard width and collapse behavior", () => {
    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <div className="relative h-[600px]">
          <CanvasAgentPanel open={open} onOpenChange={setOpen} label="剧情智能体侧栏" name="剧情智能体">
            对话内容
          </CanvasAgentPanel>
        </div>
      );
    }

    render(<Harness />);
    const panel = screen.getByRole("complementary", { name: "剧情智能体侧栏" });
    expect(panel).toHaveStyle({ width: "380px" });

    fireEvent.keyDown(screen.getByRole("separator", { name: "调整剧情智能体侧栏宽度" }), { key: "ArrowLeft" });
    expect(panel).toHaveStyle({ width: "404px" });
    fireEvent.keyDown(screen.getByRole("separator", { name: "调整剧情智能体侧栏宽度" }), { key: "ArrowRight" });
    expect(panel).toHaveStyle({ width: "380px" });

    fireEvent.click(screen.getByRole("button", { name: "收起剧情智能体" }));
    fireEvent.click(screen.getByRole("button", { name: "打开剧情智能体" }));
    expect(panel).toHaveAttribute("aria-hidden", "false");
  });

  it("clamps the desktop width to the 360–420px contract and never beyond 42vw", () => {
    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <div className="relative h-[600px]">
          <CanvasAgentPanel open={open} onOpenChange={setOpen} label="剧情智能体侧栏" name="剧情智能体" minimumWidth={420}>
            对话内容
          </CanvasAgentPanel>
        </div>
      );
    }

    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 });
    render(<Harness />);
    const panel = screen.getByRole("complementary", { name: "剧情智能体侧栏" });
    // 42vw = 604px，超出 420px 上限 → 停在 420px。
    expect(panel).toHaveStyle({ width: "420px" });

    // 窄桌面：42vw 优先，宽度上限随视口收紧。
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 800 });
    fireEvent(window, new Event("resize"));
    expect(Number.parseFloat(panel.style.width)).toBeLessThanOrEqual(336);
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
    fireEvent(window, new Event("resize"));
  });
});
