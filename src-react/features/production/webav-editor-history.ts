import type { WebAvEditorClip } from "./webav-video-editor";

export interface WebAvEditorHistoryState {
  past: WebAvEditorClip[][];
  present: WebAvEditorClip[];
  future: WebAvEditorClip[][];
}

export const WEBAV_EFFECT_TYPES = ["fadeIn", "fadeOut", "pulse", "rotateIn"] as const;

export type WebAvEffectType = (typeof WEBAV_EFFECT_TYPES)[number];

export interface WebAvEffectKeyframe {
  offset: number;
  opacity?: number;
  transform?: string;
}

function cloneClips(clips: readonly WebAvEditorClip[]): WebAvEditorClip[] {
  return structuredClone([...clips]);
}

export function createWebAvEditorHistory(clips: readonly WebAvEditorClip[] = []): WebAvEditorHistoryState {
  return {
    past: [],
    present: cloneClips(clips),
    future: [],
  };
}

export function pushWebAvEditorHistory(history: WebAvEditorHistoryState, clips: readonly WebAvEditorClip[]): WebAvEditorHistoryState {
  return {
    past: [...history.past.map(cloneClips), cloneClips(history.present)],
    present: cloneClips(clips),
    future: [],
  };
}

export function undoWebAvEditorHistory(history: WebAvEditorHistoryState): WebAvEditorHistoryState {
  if (history.past.length === 0) return history;

  const previous = history.past.at(-1) ?? [];
  return {
    past: history.past.slice(0, -1).map(cloneClips),
    present: cloneClips(previous),
    future: [cloneClips(history.present), ...history.future.map(cloneClips)],
  };
}

export function redoWebAvEditorHistory(history: WebAvEditorHistoryState): WebAvEditorHistoryState {
  const [next, ...remaining] = history.future;
  if (!next) return history;

  return {
    past: [...history.past.map(cloneClips), cloneClips(history.present)],
    present: cloneClips(next),
    future: remaining.map(cloneClips),
  };
}

export function resetWebAvEditorHistory(_history: WebAvEditorHistoryState, clips: readonly WebAvEditorClip[] = []): WebAvEditorHistoryState {
  return createWebAvEditorHistory(clips);
}

export function getWebAvEffectKeyframes(effect: WebAvEffectType): WebAvEffectKeyframe[] {
  switch (effect) {
    case "fadeIn":
      return [
        { offset: 0, opacity: 0 },
        { offset: 1, opacity: 1 },
      ];
    case "fadeOut":
      return [
        { offset: 0, opacity: 1 },
        { offset: 1, opacity: 0 },
      ];
    case "pulse":
      return [
        { offset: 0, transform: "scale(1)" },
        { offset: 0.5, transform: "scale(1.08)" },
        { offset: 1, transform: "scale(1)" },
      ];
    case "rotateIn":
      return [
        { offset: 0, opacity: 0, transform: "rotate(-90deg) scale(0.8)" },
        { offset: 1, opacity: 1, transform: "rotate(0deg) scale(1)" },
      ];
  }
}
