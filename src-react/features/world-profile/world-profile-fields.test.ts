import { describe, expect, it } from "vitest";

import {
  createWesternFantasyWorldProfile,
  normalizeProjectWorldProfile,
  projectWorldProfileCompletion,
  projectWorldProfileSummary,
  projectWorldProfileSubmissionError,
  worldProfileFromForm,
  worldProfileToForm,
} from "./world-profile-fields";

describe("world profile fields", () => {
  it("creates a fresh western-fantasy preset on every call", () => {
    const first = createWesternFantasyWorldProfile();
    const second = createWesternFantasyWorldProfile();

    expect(first).toEqual(
      expect.objectContaining({
        schemaVersion: "1",
        genre: "欧美玄幻",
        culturalBase: "西欧文化语境",
        era: "前工业时代",
      }),
    );
    first.worldRules.push("魔法有代价");
    expect(second.worldRules).toEqual([]);
  });

  it("normalizes old projects to null and rejects incomplete wire objects", () => {
    expect(normalizeProjectWorldProfile(undefined)).toBeNull();
    expect(normalizeProjectWorldProfile(null)).toBeNull();
    expect(normalizeProjectWorldProfile({ schemaVersion: "1", genre: "奇幻" })).toBeNull();
  });

  it("round trips multiline form fields deterministically", () => {
    const profile = createWesternFantasyWorldProfile();
    profile.premise = "圣像闭眼后，疼痛会在人群中转移。";
    profile.worldRules = ["魔法必须支付代价", "神迹不会无缘无故发生"];
    profile.forbiddenElements = ["现代车辆"];

    const restored = worldProfileFromForm(worldProfileToForm(profile));

    expect(restored).toEqual(profile);
    expect(projectWorldProfileCompletion(restored)).toBe("complete");
    expect(projectWorldProfileSummary(restored)).toContain("欧美玄幻");
    expect(projectWorldProfileSummary(restored)).toContain("圣像闭眼");
  });

  it("rejects an empty preset premise before submitting to the backend", () => {
    const profile = createWesternFantasyWorldProfile();

    expect(projectWorldProfileSubmissionError(profile)).toBe("请补充世界前提后再保存项目");
    profile.premise = "圣像闭眼后，疼痛会在人群中转移。";
    expect(projectWorldProfileSubmissionError(profile)).toBe("");
  });
});
