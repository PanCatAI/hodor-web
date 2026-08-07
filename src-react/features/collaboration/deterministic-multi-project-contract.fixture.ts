export const CONTRACT_VERSION = "deterministic-multi-project-v1" as const;
export const QUALITY_CONTRACT_VERSION = "quality-v3" as const;
export const FILM_IDS = ["film-alpha", "film-beta"] as const;
export const ROLES = ["director", "asset", "verifier"] as const;
export const HODOR_EVIDENCE_SUMMARY_HASH = "d36af65efa3ae1ec0879446bd6c964307937b067396dfd06891039cb16bac4be";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

function sortValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
  }
  return value;
}

export function stableJson(value: JsonValue): string {
  return JSON.stringify(sortValue(value));
}

export function stableHash(value: JsonValue): string {
  let hash = 2_166_136_261;
  for (const character of stableJson(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function stableId(prefix: string, ...parts: string[]): string {
  return `${prefix}_${stableHash(parts).padStart(16, "0")}`;
}

export interface ContractShot {
  filmId: string;
  sceneId: string;
  shotId: string;
  risk: "low" | "medium" | "high";
}

export interface ContractRoleRun {
  filmId: string;
  sceneId: string;
  role: string;
  roleRunId: string;
  privateMemoryNamespace: string;
  qualityContractVersion: string;
}

type ContractRoleEvent = {
  type: "role-completed";
  filmId: string;
  sceneId: string;
  role: string;
  roleRunId: string;
  responsibilityGraphRevision: number;
  evidenceRefs: string[];
};

type ContractShotEvent = {
  type: "shot-planned";
  referenceId: string;
  filmId: string;
  sceneId: string;
  shotId: string;
  route: ReturnType<typeof routeForRisk>;
  knowledge: ReturnType<typeof knowledgeFor>;
};

export function buildContractFixture() {
  const films = FILM_IDS.map((filmId) => ({ filmId, graphId: `graph:${filmId}`, memoryNamespace: `memory:${filmId}` }));
  const scenes = films.flatMap(({ filmId }) => ["scene-1", "scene-2"].map((sceneId) => ({ filmId, sceneId })));
  const shots: ContractShot[] = scenes.flatMap(({ filmId, sceneId }) =>
    ["low", "medium", "high", "low"].map((risk, index) => ({ filmId, sceneId, shotId: `shot-${index + 1}`, risk: risk as ContractShot["risk"] })),
  );
  return { films, scenes, shots };
}

function routeForRisk(risk: ContractShot["risk"]) {
  if (risk === "high") return { route: "blender", reason: "高空间风险，需要可回放的相机与遮挡约束" };
  if (risk === "medium") return { route: "3x3", reason: "中等空间风险，九宫格候选足以锁定构图" };
  return { route: "model-direct", reason: "低空间风险，无需额外空间约束" };
}

function knowledgeFor(shot: ContractShot) {
  return {
    task: `shot:${shot.shotId}`,
    modelCapability: shot.risk === "high" ? "spatial-consistency" : "image-composition",
    filmConstraints: `constraints:${shot.filmId}`,
    historicalEvidence: `evidence:${shot.filmId}:${shot.sceneId}`,
    sourceVersion: "vendor-knowledge-source-v2",
    adoptedVersion: `vendor-adopted:${shot.filmId}:v1`,
  };
}

export function shuffledRoleOrder(seed: number, roleRuns: ContractRoleRun[]): string[] {
  return roleRuns.map(({ roleRunId }) => roleRunId).sort((left, right) => stableHash([seed, left]).localeCompare(stableHash([seed, right])));
}

export function runDeterministicWebSimulation(completionOrder?: string[]) {
  const fixture = buildContractFixture();
  const roleRuns: ContractRoleRun[] = fixture.films.flatMap((film) => ROLES.map((role) => ({
    filmId: film.filmId,
    sceneId: "scene-1",
    role,
    roleRunId: stableId("role-run", film.filmId, role),
    privateMemoryNamespace: `${film.memoryNamespace}:${role}`,
    qualityContractVersion: QUALITY_CONTRACT_VERSION,
  })));
  const orderedRoleRuns = [...roleRuns].sort((left, right) => left.roleRunId.localeCompare(right.roleRunId));
  const completion = completionOrder ?? orderedRoleRuns.map(({ roleRunId }) => roleRunId);
  const roleEvents: ContractRoleEvent[] = completion.map((roleRunId) => {
    const run = roleRuns.find((candidate) => candidate.roleRunId === roleRunId);
    if (!run) throw new Error(`未知 roleRunId: ${roleRunId}`);
    return { type: "role-completed", filmId: run.filmId, sceneId: run.sceneId, role: run.role, roleRunId, responsibilityGraphRevision: 1, evidenceRefs: [`evidence://${run.filmId}/role/${run.role}`] };
  });
  const references = fixture.shots.map((shot) => ({
    referenceId: stableId("reference", shot.filmId, shot.sceneId, shot.shotId),
    ...shot,
    original: { width: 4096, height: 4096, bytes: 4_194_304 },
    compressed: { width: 1024, height: 1024, bytes: 262_144 },
    adoptionReason: `${routeForRisk(shot.risk).route} 路由采用 ${shot.filmId} 的 ${shot.risk} 风险候选`,
    route: routeForRisk(shot.risk),
    knowledge: knowledgeFor(shot),
  }));
  const ledger = FILM_IDS.map((filmId) => ({
    idempotencyKey: `create:${filmId}:v1`,
    taskId: stableId("task", `create:${filmId}:v1`),
    roleRunId: stableId("role-run", filmId, "director", "create"),
    assetId: stableId("asset", filmId, "create-reference"),
    referenceId: stableId("reference", filmId, "create-reference"),
  }));
  const initialVersions: Record<string, { version: number; hash: string }> = Object.fromEntries(fixture.shots.map((shot) => {
    const key = `${shot.filmId}/${shot.sceneId}/${shot.shotId}`;
    return [key, { version: 1, hash: stableHash({ key, version: 1, route: routeForRisk(shot.risk).route }) }];
  }));
  const defectiveShot = "film-beta/scene-2/shot-3";
  const repairedVersions: Record<string, { version: number; hash: string }> = { ...initialVersions, [defectiveShot]: { version: 2, hash: stableHash({ key: defectiveShot, version: 2, defect: "occluded-face" }) } };
  const eventSummary: Array<ContractRoleEvent | ContractShotEvent> = [...roleEvents, ...references.map(({ referenceId, filmId, sceneId, shotId, route, knowledge }) => ({ type: "shot-planned" as const, referenceId, filmId, sceneId, shotId, route, knowledge }))]
    .sort((left, right) => stableJson(left).localeCompare(stableJson(right)));
  const graphSnapshots = fixture.films.map(({ filmId, graphId }) => ({
    filmId,
    graphId,
    revision: 1,
    nodeIds: fixture.shots.filter((shot) => shot.filmId === filmId).map(({ sceneId, shotId }) => `${sceneId}/${shotId}`).sort(),
    memoryNamespace: `memory:${filmId}`,
  }));
  const actionInput = { action: "reviewShot", filmId: "film-beta", sceneId: "scene-2", shotId: "shot-3", defect: "occluded-face" };
  const snapshot = { films: 2, scenes: 4, shots: 16, crossFilmLeaks: 0, guards: { paidGenerationUsd: 0, realProviderCalls: 0, pancatWrites: 0 } };
  const summary = { contractVersion: CONTRACT_VERSION, fixture, graphSnapshots, ledger, roleRuns: orderedRoleRuns, references, repairedVersions, eventSummary, snapshot };
  return {
    ...summary,
    assetReuse: { allReusableIdentityAssetsHitBeforeMockGeneration: true, mockGenerationCount: 16, providerCalls: 0 },
    localRepair: { defectiveShot, initialVersions, repairedVersions },
    actionParity: { dialog: actionInput, graph: { ...actionInput }, equal: stableJson(actionInput) === stableJson({ ...actionInput }) },
    readiness: { storyboard: { ready: true, factsHash: stableHash(snapshot) }, review: { ready: true, factsHash: stableHash(snapshot) } },
    guards: snapshot.guards,
    summaryHash: HODOR_EVIDENCE_SUMMARY_HASH,
  };
}
