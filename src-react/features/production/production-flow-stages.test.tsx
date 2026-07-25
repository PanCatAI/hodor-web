import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ProductionApi } from "./production-api";
import { ProductionFlowBoard } from "./production-flow-board";
import type { ProductionFlowData } from "./types";

function flowData(): ProductionFlowData {
  return {
    source: {
      state: "completed",
      chapters: [
        {
          id: 1,
          chapterIndex: 0,
          chapter: "第一章 雨夜",
          contentPreview: "雨夜，她推开医院大门。",
          charCount: 1280,
          eventState: 1,
          errorReason: "",
        },
        { id: 2, chapterIndex: 1, chapter: "走廊尽头传来脚步声。", eventState: 0, errorReason: "" },
      ],
    },
    script: "第一场，医院走廊。",
    scriptPlan: "从远景推进到近景。",
    assets: [
      {
        id: 3,
        name: "黛利拉",
        type: "role",
        prompt: "",
        desc: "",
        src: "",
        state: "completed",
        errorReason: "",
        derive: [
          {
            id: 31,
            assetsId: 3,
            name: "雨衣造型",
            type: "role",
            prompt: "",
            desc: "",
            src: "",
            state: "failed",
            errorReason: "审核失败",
          },
        ],
      },
    ],
    storyboardTable: "| 镜头 | 景别 |",
    storyboard: [{ id: 41, index: 0, prompt: "", videoDesc: "", src: "", state: "running", errorReason: "" }],
    videoTracks: [
      {
        id: 51,
        prompt: "镜头推进",
        state: "completed",
        errorReason: "",
        duration: 5,
        medias: [],
        videoList: [{ id: 61, src: "https://example.test/track.mp4", state: "completed", errorReason: "", duration: 5 }],
      },
    ],
    timeline: {
      id: 71,
      revision: 3,
      status: "failed",
      clips: [],
      errorReason: "合成轨道缺少音频",
      updatedAt: "2026-07-25T12:00:00.000Z",
    },
    finalOutputs: [
      {
        id: 81,
        state: "completed",
        src: "https://example.test/final.mp4",
        duration: 42,
        size: 8_192,
        checksum: "sha256:final",
        errorReason: "",
        createdAt: "2026-07-25T12:30:00.000Z",
      },
      {
        id: 80,
        state: "completed",
        src: "https://example.test/older-final.mp4",
        duration: 84,
        size: 16_384,
        checksum: "sha256:older",
        errorReason: "",
        createdAt: "2026-07-25T12:00:00.000Z",
      },
    ],
    workbench: { cover: "https://example.test/workbench.jpg" },
  };
}

function api() {
  return { saveFlowData: vi.fn(async () => undefined) } as unknown as ProductionApi;
}

describe("production full-flow stages", () => {
  it("renders every contract stage with its real aggregate status", () => {
    render(<ProductionFlowBoard api={api()} projectId={7} scriptId={12} initialData={flowData()} />);

    expect(screen.getByTestId("stage-status-source")).toHaveTextContent("已完成");
    expect(screen.getByTestId("stage-status-script")).toHaveTextContent("已完成");
    expect(screen.getByTestId("stage-status-assets")).toHaveTextContent("生成失败");
    expect(screen.getByTestId("stage-status-storyboard")).toHaveTextContent("生成中");
    expect(screen.getByTestId("stage-status-videoTracks")).toHaveTextContent("已完成");
    expect(screen.getByTestId("stage-status-timeline")).toHaveTextContent("生成失败");
    expect(screen.getByTestId("stage-status-finalOutput")).toHaveTextContent("已完成");
    expect(screen.getByTestId("flow-node-source")).toHaveTextContent("第一章 雨夜");
    expect(screen.getByTestId("flow-node-source")).toHaveTextContent("1,280 字");
    expect(screen.getByTestId("flow-node-source")).toHaveTextContent("雨夜，她推开医院大门。");
  });

  it("opens existing project pages and the matching workbench surface from stage nodes", () => {
    const onOpenStage = vi.fn();
    const onOpenWorkbench = vi.fn();
    render(
      <ProductionFlowBoard
        api={api()}
        projectId={7}
        scriptId={12}
        initialData={flowData()}
        onOpenStage={onOpenStage}
        onOpenWorkbench={onOpenWorkbench}
      />,
    );

    fireEvent.click(within(screen.getByTestId("flow-node-source")).getByRole("button", { name: "打开原文" }));
    fireEvent.click(within(screen.getByTestId("flow-node-script")).getByRole("button", { name: "打开剧本" }));
    fireEvent.click(within(screen.getByTestId("flow-node-assets")).getByRole("button", { name: "打开资产" }));
    fireEvent.click(within(screen.getByTestId("flow-node-storyboard")).getByRole("button", { name: "打开分镜" }));
    fireEvent.click(screen.getByTestId("flow-node-videoTracks"));
    fireEvent.click(screen.getByTestId("flow-node-timeline"));
    const finalVideo = within(screen.getByTestId("flow-node-finalOutput")).getByLabelText("最终成片预览");
    expect(finalVideo).toHaveAttribute("controls");
    expect(finalVideo).toHaveAttribute("src", "https://example.test/final.mp4");
    fireEvent.click(finalVideo);

    expect(onOpenStage.mock.calls.map(([stage]) => stage)).toEqual(["source", "script", "assets", "storyboard"]);
    expect(onOpenWorkbench.mock.calls.map(([view]) => view)).toEqual(["generate", "editVideo"]);
  });
});
