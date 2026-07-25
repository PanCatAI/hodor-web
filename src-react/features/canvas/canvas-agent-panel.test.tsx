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
    expect(panel).toHaveStyle({ width: "400px" });

    fireEvent.keyDown(screen.getByRole("separator", { name: "调整剧情智能体侧栏宽度" }), { key: "ArrowLeft" });
    expect(panel).toHaveStyle({ width: "424px" });
    fireEvent.keyDown(screen.getByRole("separator", { name: "调整剧情智能体侧栏宽度" }), { key: "ArrowRight" });
    expect(panel).toHaveStyle({ width: "400px" });

    fireEvent.click(screen.getByRole("button", { name: "收起剧情智能体" }));
    fireEvent.click(screen.getByRole("button", { name: "打开剧情智能体" }));
    expect(panel).toHaveAttribute("aria-hidden", "false");
  });
});
