import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

vi.mock("./App", () => ({
  default: () => <div data-testid="director-desk-editor" />,
}));

import {
  StoryAiDirectorDesk,
  type StoryAiDirectorDeskProjectJson,
} from "./embed";
import { postDirectorDeskCapturesToHost } from "./editor/io/hostBridge";
import {
  createDefaultDirectorProject,
  createInitialDirectorState,
  useDirectorStore,
} from "./editor/store/directorStore";

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, String(value)),
  };
}

beforeEach(() => {
  vi.stubGlobal("localStorage", createMemoryStorage());
  useDirectorStore.setState({
    ...useDirectorStore.getState(),
    ...createInitialDirectorState(),
  });
});

it("loads and reports the Hodor-scoped project without an iframe", async () => {
  const project = createDefaultDirectorProject();
  project.scene = { ...project.scene, backgroundColor: "#123456" };
  const onProjectChange = vi.fn();

  const view = render(
    <StoryAiDirectorDesk
      projectId="project-7"
      storyboardId="storyboard-31"
      projectJson={project as unknown as StoryAiDirectorDeskProjectJson}
      onProjectChange={onProjectChange}
      onCapture={vi.fn()}
    />
  );

  expect(view.container.querySelector("[data-director-desk-embed]")?.shadowRoot).not.toBeNull();
  expect(useDirectorStore.getState().project.scene.backgroundColor).toBe("#123456");

  act(() => {
    useDirectorStore.getState().updateScene({ backgroundColor: "#654321" });
  });

  await waitFor(() => {
    expect(onProjectChange).toHaveBeenCalledWith(
      expect.objectContaining({ scene: expect.objectContaining({ backgroundColor: "#654321" }) })
    );
  });
});

it("forwards editor captures to the Hodor upload hook and releases it on unmount", () => {
  const onCapture = vi.fn();
  const view = render(
    <StoryAiDirectorDesk
      projectId="project-8"
      storyboardId="storyboard-41"
      projectJson={createDefaultDirectorProject() as unknown as StoryAiDirectorDeskProjectJson}
      onProjectChange={vi.fn()}
      onCapture={onCapture}
    />
  );

  act(() => {
    postDirectorDeskCapturesToHost([
      { dataUrl: "data:image/png;base64,aG9kb3I=", fileName: "shot.png" },
    ]);
  });

  expect(onCapture).toHaveBeenCalledWith({
    dataUrl: "data:image/png;base64,aG9kb3I=",
    fileName: "shot.png",
  });

  view.unmount();
  onCapture.mockClear();
  postDirectorDeskCapturesToHost([
    { dataUrl: "data:image/png;base64,bGF0ZQ==", fileName: "late.png" },
  ]);
  expect(onCapture).not.toHaveBeenCalled();
});
