import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  calculateTimeline,
  degreesToRadians,
  formatWebAvError,
  radiansToDegrees,
  readWebAvOutput,
  resolveWebAvCanvasSize,
  sampleWaveform,
  WebAvVideoEditor,
  type WebAvEditorClip,
} from "./webav-video-editor";

const webAvMocks = vi.hoisted(() => ({
  addedSprites: [] as any[],
  canvasOptions: [] as Array<{ bgColor: string; width: number; height: number }>,
  canvasDestroy: vi.fn(),
  clipDestroy: vi.fn(),
  combinatorDestroy: vi.fn(),
  createCombinator: vi.fn(),
  previewFrame: vi.fn(async () => undefined),
}));

vi.mock("@webav/av-canvas", () => ({
  AVCanvas: class MockAVCanvas {
    constructor(_host: HTMLElement, options: { bgColor: string; width: number; height: number }) {
      webAvMocks.canvasOptions.push(options);
    }
    addSprite = async (sprite: unknown) => {
      webAvMocks.addedSprites.push(sprite);
    };
    createCombinator = webAvMocks.createCombinator;
    destroy = webAvMocks.canvasDestroy;
    on = vi.fn(() => () => undefined);
    pause = vi.fn();
    play = vi.fn();
    previewFrame = webAvMocks.previewFrame;
  },
}));

vi.mock("@webav/av-cliper", () => {
  class BaseClip {
    ready = Promise.resolve();
    meta = { duration: 5e6, width: 1280, height: 720 };
    destroy = webAvMocks.clipDestroy;
    split = vi.fn(async () => [new (this.constructor as new () => BaseClip)(), new (this.constructor as new () => BaseClip)()]);
  }
  class AudioClip extends BaseClip {
    getPCMData = () => [new Float32Array([0, 0.5, -1, 0.25])];
  }
  class VisibleSprite {
    kind: string;
    interactable = "interactive";
    opacity = 1;
    rect = { x: 0, y: 0, w: 1, h: 1, angle: 0 };
    setAnimation = vi.fn();
    time = { offset: 0, duration: 0, playbackRate: 1 };
    zIndex = 0;
    listeners: Record<string, () => void> = {};
    on = vi.fn((type: string, listener: () => void) => {
      this.listeners[type] = listener;
      return () => {
        delete this.listeners[type];
      };
    });
    constructor(clip: unknown) {
      this.kind = clip instanceof AudioClip ? "audio" : clip instanceof ImgClip ? "image" : "video";
    }
  }
  class ImgClip extends BaseClip {}
  return {
    AudioClip,
    ImgClip,
    MP4Clip: class MP4Clip extends BaseClip {},
    VisibleSprite,
    renderTxt2ImgBitmap: vi.fn(async () => ({ width: 400, height: 100 })),
  };
});

function editorClips(): WebAvEditorClip[] {
  return [
    {
      id: "video-1",
      sourceId: 1,
      type: "video",
      name: "镜头 1",
      src: "https://example.test/one.mp4",
      sourceDuration: 12,
      trimStart: 2,
      trimEnd: 10,
      playbackRate: 2,
      volume: 1,
      opacity: 1,
      filter: "none",
      transition: "none",
      transitionDuration: 0,
    },
    {
      id: "image-1",
      type: "image",
      name: "封面",
      src: "https://example.test/cover.png",
      sourceDuration: 3,
      trimStart: 0,
      trimEnd: 3,
      playbackRate: 1,
      volume: 1,
      opacity: 0.8,
      filter: "sepia",
      transition: "fade",
      transitionDuration: 0.5,
    },
    {
      id: "audio-1",
      type: "audio",
      name: "配乐",
      src: "https://example.test/music.mp3",
      sourceDuration: 30,
      trimStart: 0,
      trimEnd: 30,
      playbackRate: 1,
      volume: 0.4,
      opacity: 1,
      filter: "none",
      transition: "none",
      transitionDuration: 0,
    },
    {
      id: "text-1",
      type: "text",
      name: "字幕",
      text: "雨夜",
      sourceDuration: 4,
      trimStart: 0,
      trimEnd: 4,
      playbackRate: 1,
      volume: 1,
      opacity: 1,
      filter: "none",
      transition: "fade",
      transitionDuration: 0.4,
    },
  ];
}

describe("WebAV video editor contracts", () => {
  it("maps the upstream project ratios to their production canvas dimensions", () => {
    expect(resolveWebAvCanvasSize("16:9")).toEqual({ width: 1920, height: 1080 });
    expect(resolveWebAvCanvasSize("1:1")).toEqual({ width: 1080, height: 1080 });
    expect(resolveWebAvCanvasSize("9:16")).toEqual({ width: 1080, height: 1920 });
    expect(resolveWebAvCanvasSize(undefined)).toEqual({ width: 1920, height: 1080 });
  });

  it("calculates sequential visual clips from real trims while overlays keep their requested start", () => {
    const timeline = calculateTimeline(editorClips(), {
      "image-1": 2,
      "audio-1": 1,
      "text-1": 3,
    });

    expect(timeline.byId["video-1"]).toMatchObject({ start: 0, duration: 4, end: 4 });
    expect(timeline.byId["image-1"]).toMatchObject({ start: 2, duration: 3, end: 5 });
    expect(timeline.byId["audio-1"]).toMatchObject({ start: 1, duration: 30, end: 31 });
    expect(timeline.byId["text-1"]).toMatchObject({ start: 3, duration: 4, end: 7 });
    expect(timeline.duration).toBe(31);
  });

  it("overlaps adjacent videos by the configured transition duration", () => {
    const clips = editorClips().slice(0, 1);
    clips.push({ ...clips[0], id: "video-2", sourceId: 2, transition: "dissolve", transitionDuration: 1 });

    const timeline = calculateTimeline(clips);

    expect(timeline.byId["video-1"]).toMatchObject({ start: 0, end: 4 });
    expect(timeline.byId["video-2"]).toMatchObject({ start: 3, end: 7 });
    expect(timeline.duration).toBe(7);
  });

  it("converts canvas rotation units and samples real PCM amplitudes", () => {
    expect(degreesToRadians(90)).toBeCloseTo(Math.PI / 2);
    expect(radiansToDegrees(Math.PI)).toBeCloseTo(180);
    expect(sampleWaveform(new Float32Array([0, 0.5, -1, 0.25]), 2)).toEqual([0.5, 1]);
  });

  it("normalizes structured and html-shaped errors into readable text", () => {
    expect(formatWebAvError({ message: "编码器不可用" })).toBe("编码器不可用");
    expect(formatWebAvError({ error: { message: "素材跨域失败" } })).toBe("素材跨域失败");
    expect(formatWebAvError("<html><head><title>413 Request Entity Too Large</title></head></html>")).toBe("413 Request Entity Too Large");
  });

  it("cancels the output reader and does not return a partial mp4", async () => {
    const cancel = vi.fn(async () => undefined);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
      },
      cancel,
    });
    const abort = new AbortController();
    abort.abort();

    await expect(readWebAvOutput(stream, { signal: abort.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(cancel).toHaveBeenCalled();
  });

  it("interrupts a stalled compositor stream when cancellation arrives during export", async () => {
    const cancel = vi.fn(async () => undefined);
    const stream = new ReadableStream<Uint8Array>({ cancel });
    const abort = new AbortController();
    const output = readWebAvOutput(stream, { signal: abort.signal });

    abort.abort();

    await expect(output).rejects.toMatchObject({ name: "AbortError" });
    expect(cancel).toHaveBeenCalled();
  });

  it("offers video trimming, filter, transition, overlay timing and text tracks", async () => {
    const onTimelineChange = vi.fn();
    render(
      <WebAvVideoEditor
        clips={[{ id: 91, src: "https://example.test/a.mp4", state: "completed", errorReason: "", duration: 12 }]}
        initialOverlays={editorClips().slice(1)}
        onTimelineChange={onTimelineChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "选择轨道 镜头 91" }));
    fireEvent.change(screen.getByLabelText("裁剪起点"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("裁剪终点"), { target: { value: "9" } });
    fireEvent.change(screen.getByLabelText("滤镜"), { target: { value: "grayscale" } });
    fireEvent.change(screen.getByLabelText("入场转场"), { target: { value: "fade" } });

    fireEvent.click(screen.getByRole("button", { name: "选择轨道 配乐" }));
    fireEvent.change(screen.getByLabelText("轨道起点"), { target: { value: "2.5" } });
    fireEvent.change(screen.getByLabelText("音量"), { target: { value: "0.6" } });

    fireEvent.click(screen.getByRole("button", { name: "选择轨道 字幕" }));
    fireEvent.change(screen.getByLabelText("文字内容"), { target: { value: "新的字幕" } });

    await waitFor(() => expect(onTimelineChange).toHaveBeenCalled());
    const latest = onTimelineChange.mock.calls.at(-1)?.[0] as WebAvEditorClip[];
    expect(latest.find((clip) => clip.id === "video-91")).toMatchObject({ trimStart: 2, trimEnd: 9, filter: "grayscale", transition: "fade" });
    expect(latest.find((clip) => clip.id === "audio-1")).toMatchObject({ startAt: 2.5, volume: 0.6 });
    expect(latest.find((clip) => clip.id === "text-1")).toMatchObject({ text: "新的字幕" });
  });

  it("adds an editable text track without a placeholder download", () => {
    render(<WebAvVideoEditor clips={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "添加文字轨道" }));

    expect(screen.getByRole("button", { name: /选择轨道 文字/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "下载当前片段" })).not.toBeInTheDocument();
  });

  it("supports split, duplicate, undo, redo and reset as real timeline edits", async () => {
    const onTimelineChange = vi.fn();
    render(
      <WebAvVideoEditor
        clips={[{ id: 7, src: "https://example.test/seven.mp4", state: "completed", errorReason: "", duration: 10 }]}
        onTimelineChange={onTimelineChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("时间线播放位置"), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "切割选中轨道" }));
    expect(screen.getAllByRole("button", { name: /选择轨道 镜头 7/ })).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "撤销" }));
    expect(screen.getAllByRole("button", { name: /选择轨道 镜头 7/ })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "重做" }));
    expect(screen.getAllByRole("button", { name: /选择轨道 镜头 7/ })).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "复制选中轨道" }));
    expect(screen.getAllByRole("button", { name: /选择轨道 镜头 7/ })).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "重置时间线" }));
    expect(screen.getAllByRole("button", { name: /选择轨道 镜头 7/ })).toHaveLength(1);
    await waitFor(() => expect(onTimelineChange).toHaveBeenCalled());
  });

  it("imports local image and audio tracks and exposes their actual property controls", () => {
    const createObjectURL = vi.fn((file: File) => `blob:${file.name}`);
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    render(<WebAvVideoEditor clips={[]} />);

    const input = screen.getByLabelText("导入媒体文件");
    fireEvent.change(input, {
      target: {
        files: [new File(["image"], "cover.png", { type: "image/png" }), new File(["audio"], "music.mp3", { type: "audio/mpeg" })],
      },
    });

    expect(screen.getByRole("button", { name: "选择轨道 cover.png" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "选择轨道 music.mp3" }));
    expect(screen.getByLabelText("淡入时长")).toBeInTheDocument();
    expect(screen.getByLabelText("淡出时长")).toBeInTheDocument();
    expect(screen.getByLabelText("音量")).toBeInTheDocument();
  });

  it("adds explicitly typed library media even when its signed URL has no extension", () => {
    const libraryAudio: WebAvEditorClip = { ...editorClips()[2], id: "signed-audio", src: "https://cdn.example.test/signed?id=8", name: "签名配乐" };
    render(<WebAvVideoEditor clips={[]} mediaLibrary={[libraryAudio]} />);

    fireEvent.click(screen.getByRole("button", { name: "添加素材 签名配乐" }));

    expect(screen.getByRole("button", { name: "选择轨道 签名配乐" })).toBeInTheDocument();
    expect(within(screen.getByLabelText("时间线轨道")).getByText("audio")).toBeInTheDocument();
  });

  it("persists text style, canvas geometry, z order and effect settings", async () => {
    const onTimelineChange = vi.fn();
    render(<WebAvVideoEditor clips={[]} onTimelineChange={onTimelineChange} />);
    fireEvent.click(screen.getByRole("button", { name: "添加文字轨道" }));

    fireEvent.change(screen.getByLabelText("字号"), { target: { value: "56" } });
    fireEvent.change(screen.getByLabelText("画布 X"), { target: { value: "120" } });
    fireEvent.change(screen.getByLabelText("画布 Y"), { target: { value: "300" } });
    fireEvent.change(screen.getByLabelText("层级"), { target: { value: "42" } });
    fireEvent.change(screen.getByLabelText("特效"), { target: { value: "pulse" } });

    await waitFor(() => expect(onTimelineChange).toHaveBeenCalled());
    const latest = onTimelineChange.mock.calls.at(-1)?.[0] as WebAvEditorClip[];
    expect(latest[0]).toMatchObject({ fontSize: 56, rect: { x: 120, y: 300 }, zIndex: 42, effect: "pulse" });
  });

  it("loads video, audio, image and text sprites into WebAV and exports their combined MP4", async () => {
    const originalVideoFrame = globalThis.VideoFrame;
    Object.defineProperty(globalThis, "VideoFrame", { configurable: true, value: class VideoFrame {} });
    webAvMocks.addedSprites.length = 0;
    webAvMocks.canvasOptions.length = 0;
    webAvMocks.canvasDestroy.mockClear();
    webAvMocks.clipDestroy.mockClear();
    webAvMocks.combinatorDestroy.mockClear();
    webAvMocks.createCombinator.mockResolvedValue({
      destroy: webAvMocks.combinatorDestroy,
      on: vi.fn((_type: string, listener: (progress: number) => void) => {
        listener(0.5);
        return () => undefined;
      }),
      output: () =>
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array([1, 2, 3, 4]));
            controller.close();
          },
        }),
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 })),
    );
    const createObjectURL = vi.fn(() => "blob:combined-mp4");
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    const overlays = editorClips()
      .slice(1)
      .map((clip) => (clip.type === "audio" ? { ...clip, startAt: 1 } : clip));
    const onTimelineChange = vi.fn();
    const { unmount } = render(
      <WebAvVideoEditor
        clips={[{ id: 1, src: "https://example.test/video.mp4", state: "completed", errorReason: "", duration: 5 }]}
        videoRatio="9:16"
        initialOverlays={overlays}
        onTimelineChange={onTimelineChange}
      />,
    );

    const exportButton = await screen.findByRole("button", { name: "导出合成视频" });
    expect(screen.getByLabelText("WebAV 合成画布")).toHaveStyle({ aspectRatio: "1080 / 1920" });
    await waitFor(() => expect(webAvMocks.addedSprites.map((sprite) => sprite.kind)).toEqual(expect.arrayContaining(["video", "audio", "image"])));
    expect(webAvMocks.canvasOptions).toContainEqual({ bgColor: "#000000", width: 1080, height: 1920 });
    expect(webAvMocks.addedSprites).toHaveLength(4);
    expect(webAvMocks.addedSprites.find((sprite) => sprite.kind === "video").rect).toMatchObject({ x: 0, y: 656.25, w: 1080, h: 607.5 });
    expect(webAvMocks.addedSprites.find((sprite) => sprite.kind === "audio")).toMatchObject({
      time: { offset: 1e6, duration: 30e6, playbackRate: 1 },
    });
    fireEvent.click(exportButton);

    await waitFor(() => expect(webAvMocks.createCombinator).toHaveBeenCalled());
    await waitFor(() => expect(createObjectURL).toHaveBeenCalledWith(expect.objectContaining({ type: "video/mp4", size: 4 })));
    expect(webAvMocks.combinatorDestroy).toHaveBeenCalled();

    const imageSprite = webAvMocks.addedSprites.find((sprite) => sprite.kind === "image");
    imageSprite.rect.x = 72;
    imageSprite.rect.y = 91;
    imageSprite.rect.angle = Math.PI / 2;
    imageSprite.listeners.propsChange();
    await waitFor(() => expect(onTimelineChange).toHaveBeenCalled(), { timeout: 1_000 });
    expect((onTimelineChange.mock.calls.at(-1)?.[0] as WebAvEditorClip[]).find((clip) => clip.id === "image-1")).toMatchObject({
      rect: { x: 72, y: 91, angle: 90 },
    });
    fireEvent.click(screen.getByRole("button", { name: "撤销" }));
    await waitFor(() =>
      expect((onTimelineChange.mock.calls.at(-1)?.[0] as WebAvEditorClip[]).find((clip) => clip.id === "image-1")?.rect).toBeUndefined(),
    );

    unmount();
    expect(webAvMocks.canvasDestroy).toHaveBeenCalled();

    Object.defineProperty(globalThis, "VideoFrame", { configurable: true, value: originalVideoFrame });
    anchorClick.mockRestore();
    vi.unstubAllGlobals();
  });
});
