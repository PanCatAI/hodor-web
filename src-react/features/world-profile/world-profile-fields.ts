export interface ProjectWorldProfile {
  schemaVersion: "1";
  genre: string;
  culturalBase: string;
  era: string;
  premise: string;
  worldRules: string[];
  geography: string[];
  peoples: string[];
  factions: string[];
  religions: string[];
  magicRules: string[];
  technologyRules: string[];
  socialRules: string[];
  locations: string[];
  materialCulture: string[];
  visualMotifs: string[];
  castingRules: string[];
  forbiddenElements: string[];
  secrets: string[];
  revealRules: string[];
  unresolvedQuestions: string[];
}

export type ProjectWorldProfileCompletion = "missing" | "partial" | "complete";

export type ProjectWorldProfileForm = {
  [Key in keyof ProjectWorldProfile]: ProjectWorldProfile[Key] extends string[] ? string : ProjectWorldProfile[Key];
};

export const worldProfileArrayFields = [
  "worldRules",
  "geography",
  "peoples",
  "factions",
  "religions",
  "magicRules",
  "technologyRules",
  "socialRules",
  "locations",
  "materialCulture",
  "visualMotifs",
  "castingRules",
  "forbiddenElements",
  "secrets",
  "revealRules",
  "unresolvedQuestions",
] as const satisfies ReadonlyArray<keyof ProjectWorldProfile>;

export const worldProfileTextFields = [
  "genre",
  "culturalBase",
  "era",
  "premise",
] as const satisfies ReadonlyArray<keyof ProjectWorldProfile>;

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stringList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return [...new Set(value.flatMap((item) => (typeof item === "string" && item.trim() ? [item.trim()] : [])))];
}

export function createWesternFantasyWorldProfile(): ProjectWorldProfile {
  return {
    schemaVersion: "1",
    genre: "欧美玄幻",
    culturalBase: "西欧文化语境",
    era: "前工业时代",
    premise: "",
    worldRules: [],
    geography: [],
    peoples: [],
    factions: [],
    religions: [],
    magicRules: [],
    technologyRules: [],
    socialRules: [],
    locations: [],
    materialCulture: [],
    visualMotifs: [],
    castingRules: [],
    forbiddenElements: [],
    secrets: [],
    revealRules: [],
    unresolvedQuestions: [],
  };
}

export function normalizeProjectWorldProfile(value: unknown): ProjectWorldProfile | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== "1") return null;

  const arrays = Object.fromEntries(
    worldProfileArrayFields.map((field) => [field, stringList(record[field])]),
  ) as Record<(typeof worldProfileArrayFields)[number], string[] | null>;
  if (worldProfileArrayFields.some((field) => arrays[field] === null)) return null;
  if (worldProfileTextFields.some((field) => typeof record[field] !== "string")) return null;

  return {
    schemaVersion: "1",
    genre: stringValue(record.genre),
    culturalBase: stringValue(record.culturalBase),
    era: stringValue(record.era),
    premise: stringValue(record.premise),
    worldRules: arrays.worldRules ?? [],
    geography: arrays.geography ?? [],
    peoples: arrays.peoples ?? [],
    factions: arrays.factions ?? [],
    religions: arrays.religions ?? [],
    magicRules: arrays.magicRules ?? [],
    technologyRules: arrays.technologyRules ?? [],
    socialRules: arrays.socialRules ?? [],
    locations: arrays.locations ?? [],
    materialCulture: arrays.materialCulture ?? [],
    visualMotifs: arrays.visualMotifs ?? [],
    castingRules: arrays.castingRules ?? [],
    forbiddenElements: arrays.forbiddenElements ?? [],
    secrets: arrays.secrets ?? [],
    revealRules: arrays.revealRules ?? [],
    unresolvedQuestions: arrays.unresolvedQuestions ?? [],
  };
}

function splitLines(value: string): string[] {
  return [...new Set(value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean))];
}

export function worldProfileToForm(profile: ProjectWorldProfile): ProjectWorldProfileForm {
  return {
    schemaVersion: "1",
    genre: profile.genre,
    culturalBase: profile.culturalBase,
    era: profile.era,
    premise: profile.premise,
    worldRules: profile.worldRules.join("\n"),
    geography: profile.geography.join("\n"),
    peoples: profile.peoples.join("\n"),
    factions: profile.factions.join("\n"),
    religions: profile.religions.join("\n"),
    magicRules: profile.magicRules.join("\n"),
    technologyRules: profile.technologyRules.join("\n"),
    socialRules: profile.socialRules.join("\n"),
    locations: profile.locations.join("\n"),
    materialCulture: profile.materialCulture.join("\n"),
    visualMotifs: profile.visualMotifs.join("\n"),
    castingRules: profile.castingRules.join("\n"),
    forbiddenElements: profile.forbiddenElements.join("\n"),
    secrets: profile.secrets.join("\n"),
    revealRules: profile.revealRules.join("\n"),
    unresolvedQuestions: profile.unresolvedQuestions.join("\n"),
  };
}

export function worldProfileFromForm(form: ProjectWorldProfileForm): ProjectWorldProfile {
  return {
    schemaVersion: "1",
    genre: form.genre.trim(),
    culturalBase: form.culturalBase.trim(),
    era: form.era.trim(),
    premise: form.premise.trim(),
    worldRules: splitLines(form.worldRules),
    geography: splitLines(form.geography),
    peoples: splitLines(form.peoples),
    factions: splitLines(form.factions),
    religions: splitLines(form.religions),
    magicRules: splitLines(form.magicRules),
    technologyRules: splitLines(form.technologyRules),
    socialRules: splitLines(form.socialRules),
    locations: splitLines(form.locations),
    materialCulture: splitLines(form.materialCulture),
    visualMotifs: splitLines(form.visualMotifs),
    castingRules: splitLines(form.castingRules),
    forbiddenElements: splitLines(form.forbiddenElements),
    secrets: splitLines(form.secrets),
    revealRules: splitLines(form.revealRules),
    unresolvedQuestions: splitLines(form.unresolvedQuestions),
  };
}

export function projectWorldProfileCompletion(profile: ProjectWorldProfile | null): ProjectWorldProfileCompletion {
  if (!profile) return "missing";
  const identityComplete = Boolean(profile.genre && profile.culturalBase && profile.era && profile.premise);
  return identityComplete && profile.worldRules.length > 0 ? "complete" : "partial";
}

export function projectWorldProfileSubmissionError(profile: ProjectWorldProfile | null): string {
  if (!profile) return "";
  if (!profile.genre.trim()) return "请补充世界类型后再保存项目";
  if (!profile.culturalBase.trim()) return "请补充文化基底后再保存项目";
  if (!profile.era.trim()) return "请补充时代后再保存项目";
  if (!profile.premise.trim()) return "请补充世界前提后再保存项目";
  return "";
}

export function projectWorldProfileSummary(profile: ProjectWorldProfile | null): string {
  if (!profile) return "尚未配置世界设定";
  const identity = [profile.genre, profile.culturalBase, profile.era].filter(Boolean).join(" · ");
  const premise = profile.premise || "世界前提待补充";
  return [identity, premise].filter(Boolean).join("｜");
}
