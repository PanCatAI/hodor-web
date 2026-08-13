import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createWesternFantasyWorldProfile } from "./world-profile-fields";
import { WorldProfileInspector } from "./world-profile-inspector";

describe("WorldProfileInspector", () => {
  it("rejects the empty preset premise with a clear error and keeps the inspector open", async () => {
    const onSave = vi.fn();
    const onClose = vi.fn();

    render(
      <WorldProfileInspector
        profile={null}
        onSave={onSave}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "保存世界设定" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("请补充世界前提后再保存项目");
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it.each([
    ["世界类型", "请补充世界类型后再保存项目"],
    ["文化基底", "请补充文化基底后再保存项目"],
    ["时代", "请补充时代后再保存项目"],
    ["世界前提", "请补充世界前提后再保存项目"],
  ])("rejects an existing profile when %s is cleared", async (fieldLabel, expectedError) => {
    const profile = createWesternFantasyWorldProfile();
    profile.premise = "圣像闭眼，旧王国的誓约苏醒。";
    const onSave = vi.fn();
    const onClose = vi.fn();

    render(
      <WorldProfileInspector
        profile={profile}
        onSave={onSave}
        onClose={onClose}
      />,
    );

    fireEvent.change(screen.getByLabelText(fieldLabel), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "保存世界设定" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(expectedError);
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("merges source facts into the local editor without closing or reloading the canvas", async () => {
    const extracted = createWesternFantasyWorldProfile();
    extracted.premise = "圣像闭眼，旧王国的誓约苏醒。";
    const onExtract = vi.fn(async () => extracted);
    const onSave = vi.fn();
    const onClose = vi.fn();

    render(
      <WorldProfileInspector
        profile={null}
        onSave={onSave}
        onExtract={onExtract}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "从原文整理世界设定" }));

    await waitFor(() => expect(onExtract).toHaveBeenCalledWith("merge"));
    expect(screen.getByLabelText("世界前提")).toHaveValue("圣像闭眼，旧王国的誓约苏醒。");
    expect(screen.getByRole("dialog", { name: "世界设定" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "取消" }));

    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("persists an extracted draft only after the user saves it", async () => {
    const extracted = createWesternFantasyWorldProfile();
    extracted.premise = "圣像闭眼，旧王国的誓约苏醒。";
    const onSave = vi.fn();
    const onClose = vi.fn();

    render(
      <WorldProfileInspector
        profile={null}
        onSave={onSave}
        onExtract={vi.fn(async () => extracted)}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "从原文整理世界设定" }));
    await waitFor(() => expect(screen.getByLabelText("世界前提")).toHaveValue(extracted.premise));
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "保存世界设定" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith(extracted));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("requires explicit confirmation before replacing an existing profile", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const onExtract = vi.fn();
    render(
      <WorldProfileInspector
        profile={createWesternFantasyWorldProfile()}
        onSave={vi.fn()}
        onExtract={onExtract}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "替换世界设定" }));

    expect(confirm).toHaveBeenCalled();
    expect(onExtract).not.toHaveBeenCalled();
  });
});
