import { describe, expect, it } from "vitest";

import type { WebAvEditorClip } from "./webav-video-editor";
import {
  WEBAV_EFFECT_TYPES,
  createWebAvEditorHistory,
  getWebAvEffectKeyframes,
  pushWebAvEditorHistory,
  redoWebAvEditorHistory,
  resetWebAvEditorHistory,
  undoWebAvEditorHistory,
} from "./webav-editor-history";

function clip(id: string, name = id): WebAvEditorClip {
  return {
    id,
    type: "video",
    name,
    trimStart: 0,
    trimEnd: 3,
    playbackRate: 1,
    volume: 1,
    opacity: 1,
    filter: "none",
    transition: "none",
    transitionDuration: 0,
  };
}

describe("WebAV editor history", () => {
  it("pushes isolated snapshots and clears redo history", () => {
    const initial = [clip("one")];
    const created = createWebAvEditorHistory(initial);
    const next = [clip("two")];
    const history = pushWebAvEditorHistory({ ...created, future: [[clip("discarded")]] }, next);

    initial[0].name = "mutated initial";
    next[0].name = "mutated next";

    expect(history.past).toEqual([[expect.objectContaining({ id: "one", name: "one" })]]);
    expect(history.present).toEqual([expect.objectContaining({ id: "two", name: "two" })]);
    expect(history.future).toEqual([]);
  });

  it("moves snapshots backward and forward without sharing clip objects", () => {
    const initial = createWebAvEditorHistory([clip("one")]);
    const pushed = pushWebAvEditorHistory(initial, [clip("two")]);
    const undone = undoWebAvEditorHistory(pushed);

    expect(undone.present).toEqual([expect.objectContaining({ id: "one" })]);
    expect(undone.future).toEqual([[expect.objectContaining({ id: "two" })]]);

    undone.present[0].name = "changed after undo";
    const redone = redoWebAvEditorHistory(undone);

    expect(redone.present).toEqual([expect.objectContaining({ id: "two", name: "two" })]);
    expect(redone.past.at(-1)).toEqual([expect.objectContaining({ id: "one", name: "changed after undo" })]);
    expect(redone.future).toEqual([]);
    expect(redone.present[0]).not.toBe(pushed.present[0]);
  });

  it("resets all history to an isolated replacement snapshot", () => {
    const pushed = pushWebAvEditorHistory(createWebAvEditorHistory([clip("one")]), [clip("two")]);
    const replacement = [clip("fresh")];
    const reset = resetWebAvEditorHistory(pushed, replacement);

    replacement[0].name = "mutated replacement";

    expect(reset).toEqual({
      past: [],
      present: [expect.objectContaining({ id: "fresh", name: "fresh" })],
      future: [],
    });
  });
});

describe("WebAV editor effects", () => {
  it("exposes real animation keyframes for every supported effect", () => {
    expect(WEBAV_EFFECT_TYPES).toEqual(["fadeIn", "fadeOut", "pulse", "rotateIn"]);
    expect(getWebAvEffectKeyframes("fadeIn")).toEqual([
      { offset: 0, opacity: 0 },
      { offset: 1, opacity: 1 },
    ]);
    expect(getWebAvEffectKeyframes("fadeOut")).toEqual([
      { offset: 0, opacity: 1 },
      { offset: 1, opacity: 0 },
    ]);
    expect(getWebAvEffectKeyframes("pulse")).toEqual([
      { offset: 0, transform: "scale(1)" },
      { offset: 0.5, transform: "scale(1.08)" },
      { offset: 1, transform: "scale(1)" },
    ]);
    expect(getWebAvEffectKeyframes("rotateIn")).toEqual([
      { offset: 0, opacity: 0, transform: "rotate(-90deg) scale(0.8)" },
      { offset: 1, opacity: 1, transform: "rotate(0deg) scale(1)" },
    ]);
  });
});
