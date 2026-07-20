/// <reference types="vite/client" />

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import App from "./App";
import {
  clearDirectorDeskHostBridge,
  initDirectorDeskHostBridge,
  postDirectorDeskCapturesToHost,
  setDirectorDeskEmbeddedHostCallbacks,
} from "./editor/io/hostBridge";
import type { DirectorProject } from "./editor/schema/directorProject";
import { useDirectorStore } from "./editor/store/directorStore";
import directorDeskStyles from "./styles/index.css?inline";

export type StoryAiDirectorDeskScopeId = string | number;
export type StoryAiDirectorDeskProjectJson = Record<string, unknown>;

export interface StoryAiDirectorDeskCapture {
  dataUrl: string;
  fileName?: string;
}

export interface StoryAiDirectorDeskProps {
  projectId: StoryAiDirectorDeskScopeId;
  storyboardId: StoryAiDirectorDeskScopeId;
  projectJson: StoryAiDirectorDeskProjectJson;
  onProjectChange(projectJson: StoryAiDirectorDeskProjectJson): void;
  onCapture(capture: StoryAiDirectorDeskCapture): void | Promise<void>;
  onClose?: () => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isDirectorProject(
  value: StoryAiDirectorDeskProjectJson
): value is StoryAiDirectorDeskProjectJson & DirectorProject {
  return (
    value.version === 1 &&
    isRecord(value.scene) &&
    Array.isArray(value.assets) &&
    Array.isArray(value.objects) &&
    Array.isArray(value.cameras)
  );
}

function shadowStyles() {
  return `${directorDeskStyles
    .replace(
      /:root\[data-theme="dark"\],\s*:root\.dark/,
      ':host-context([data-theme="dark"]),\n:host-context(.dark)'
    )
    .replaceAll(":root", ":host")
    .replace(/html,\s*body,\s*#root/g, ".storyai-director-root")
    .replace(/^body\s*\{/gm, ".storyai-director-root {")}

:host {
  display: block;
  width: 100%;
  height: 100%;
  min-height: 40rem;
}

.storyai-director-root,
.storyai-director-root .app-shell {
  height: 100%;
  min-height: 100%;
}`;
}

export function StoryAiDirectorDesk({
  projectId,
  storyboardId,
  projectJson,
  onProjectChange,
  onCapture,
  onClose,
}: StoryAiDirectorDeskProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const callbacksRef = useRef({ onProjectChange, onCapture, onClose });
  const loadedProjectRef = useRef<StoryAiDirectorDeskProjectJson | null>(null);
  const [portalRoot, setPortalRoot] = useState<HTMLDivElement | null>(null);
  const scopeId = `${String(projectId)}:${String(storyboardId)}`;

  callbacksRef.current = { onProjectChange, onCapture, onClose };

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const shadowRoot = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    const root = document.createElement("div");
    style.textContent = shadowStyles();
    root.className = "storyai-director-root";
    shadowRoot.replaceChildren(style, root);
    setPortalRoot(root);

    return () => {
      setPortalRoot(null);
      shadowRoot.replaceChildren();
    };
  }, []);

  useEffect(() => {
    const store = useDirectorStore.getState();
    store.openScopedScene(scopeId);
    if (isDirectorProject(projectJson)) {
      store.replaceProject(projectJson);
    }
    loadedProjectRef.current = projectJson;

    const unsubscribe = useDirectorStore.subscribe((state, previousState) => {
      if (state.project === previousState.project) return;
      loadedProjectRef.current = state.project as unknown as StoryAiDirectorDeskProjectJson;
      callbacksRef.current.onProjectChange(
        state.project as unknown as StoryAiDirectorDeskProjectJson
      );
    });
    const clearEmbeddedCallbacks = setDirectorDeskEmbeddedHostCallbacks({
      onCapture: (capture) => callbacksRef.current.onCapture(capture),
      onClose: () => callbacksRef.current.onClose?.(),
    });

    return () => {
      unsubscribe();
      clearEmbeddedCallbacks();
    };
  }, [scopeId]);

  useEffect(() => {
    if (loadedProjectRef.current === projectJson || !isDirectorProject(projectJson)) return;
    loadedProjectRef.current = projectJson;
    useDirectorStore.getState().replaceProject(projectJson);
  }, [projectJson]);

  return (
    <div
      ref={hostRef}
      data-director-desk-embed
      style={{ display: "block", width: "100%", height: "100%", minHeight: "40rem" }}
    >
      {portalRoot ? createPortal(<App />, portalRoot) : null}
    </div>
  );
}

export default StoryAiDirectorDesk;

export {
  clearDirectorDeskHostBridge,
  initDirectorDeskHostBridge,
  postDirectorDeskCapturesToHost,
};
export { useDirectorStore } from "./editor/store/directorStore";
export type {
  DirectorAssetRef,
  DirectorObject,
  DirectorProject,
} from "./editor/schema/directorProject";
