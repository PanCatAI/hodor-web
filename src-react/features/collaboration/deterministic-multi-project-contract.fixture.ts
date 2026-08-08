import { createHash } from "node:crypto";

export const CONTRACT_VERSION = "deterministic-multi-project-v1" as const;
export const QUALITY_CONTRACT_VERSION = "quality-v3" as const;
export const FILM_IDS = ["film-alpha", "film-beta"] as const;
export const ROLES = ["director", "asset", "verifier"] as const;
export const HODOR_EVIDENCE_SUMMARY_HASH = "fbec8b53833825efeeed8a82bf62e8e74c6ef825a0fc2c88da72736d71ae064c";

function sortValue(value: any): any {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
  return value;
}

export function stableJson(value: any): string {
  return JSON.stringify(sortValue(value));
}

export function stableHash(value: any): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function stableId(prefix: string, ...parts: string[]): string {
  return `${prefix}_${stableHash(parts).slice(0, 16)}`;
}

function shotKey(shot: any): string {
  return `${shot.filmId}/${shot.sceneId}/${shot.shotId}`;
}

export function buildContractFixture(): any {
  const films = FILM_IDS.map((filmId) => ({
    filmId,
    title: filmId === "film-alpha" ? "雨夜抉择" : "沙丘回声",
    constraints: { aspectRatio: filmId === "film-alpha" ? "16:9" : "2.39:1", palette: filmId === "film-alpha" ? "cool-noir" : "warm-desert", rating: "PG-13" },
    graphId: `graph:${filmId}`,
    memoryNamespace: `memory:${filmId}`,
  }));
  const scenes = films.flatMap(({ filmId }) => ["scene-1", "scene-2"].map((sceneId, sceneIndex) => ({ filmId, sceneId, title: `${filmId}:${sceneId}`, sceneIndex })));
  const shots = scenes.flatMap(({ filmId, sceneId }) => ["low", "medium", "high", "low"].map((risk, shotIndex) => ({ filmId, sceneId, shotId: `shot-${shotIndex + 1}`, shotIndex, risk })));
  const identityAssets = films.flatMap(({ filmId }) => ["lead", "support"].map((identity) => ({ filmId, identity, assetId: stableId("asset", filmId, identity), source: "fixture://identity-library", reusable: true })));
  return { films, scenes, shots, identityAssets };
}

function routeForRisk(risk: string) {
  if (risk === "high") return { route: "blender", reason: "高空间风险，需要可回放的相机与遮挡约束" };
  if (risk === "medium") return { route: "3x3", reason: "中等空间风险，九宫格候选足以锁定构图" };
  return { route: "model-direct", reason: "低空间风险，无需额外空间约束" };
}

function knowledgeFor(shot: any) {
  return { task: `shot:${shot.shotId}`, modelCapability: shot.risk === "high" ? "spatial-consistency" : "image-composition", filmConstraints: `constraints:${shot.filmId}`, historicalEvidence: `evidence:${shot.filmId}:${shot.sceneId}`, sourceVersion: "vendor-knowledge-source-v2", adoptedVersion: `vendor-adopted:${shot.filmId}:v1` };
}

function createActionRegistry() {
  const actions = new Map([["reviewShot", (input: any) => ({ action: "reviewShot", filmId: input.filmId, sceneId: input.sceneId, shotId: input.shotId, defect: input.defect, responsibilityGraphChange: { graphId: `graph:${input.filmId}`, operation: "replace-shot-version", shotId: input.shotId, logicalRevision: "responsibility-revision-v1" }, evidenceChain: [`evidence://${input.filmId}/review/${input.sceneId}/${input.shotId}`, `ledger://${input.filmId}/local-repair`] })]]);
  return (surface: string, name: string, input: any) => {
    const action = actions.get(name);
    if (!action) throw new Error(`未注册动作: ${name}`);
    return { surface, result: action(input) };
  };
}

function computeReadiness(snapshot: any) {
  const ready = snapshot.films === 2 && snapshot.scenes === 4 && snapshot.shots === 16 && Object.values(snapshot.computedIsolation).every((count) => count === 0) && snapshot.guards.realProviderCalls === 0;
  return { ready, reason: ready ? "所有阶段共享同一事实快照" : "协作事实不完整", factsHash: snapshot.factsHash };
}

function computeIsolation(fixture: any, graphSnapshots: any[], roleRuns: any[], references: any[], roleEvents: any[]) {
  const filmSet = new Set(fixture.films.map(({ filmId }: any) => filmId));
  const graphLeaks = graphSnapshots.reduce((count, graph) => count + graph.nodeRecords.filter((node: any) => node.filmId !== graph.filmId || !filmSet.has(node.filmId)).length, 0);
  const memoryLeaks = roleRuns.filter((run) => !run.privateMemoryNamespace.startsWith(`memory:${run.filmId}:`)).length;
  const assetLeaks = references.filter((reference) => reference.assetHits.some((asset: any) => asset.filmId !== reference.filmId)).length;
  const responsibilityLeaks = roleEvents.filter((event) => event.filmId !== event.roleRun.filmId || event.roleRun.privateMemoryNamespace !== `memory:${event.filmId}:${event.role}`).length;
  return { graphLeaks, memoryLeaks, assetLeaks, responsibilityLeaks };
}

function buildSimulation(fixture: any, completionOrder?: string[]) {
  const events: any[] = [];
  const ledger = new Map<string, any>();
  const replaySummaries: any[] = [];
  for (const film of fixture.films) {
    const idempotencyKey = `create:${film.filmId}:v1`;
    const record = { taskId: stableId("task", idempotencyKey), roleRunId: stableId("role-run", film.filmId, "director", "create"), assetId: stableId("asset", film.filmId, "create-reference"), referenceId: stableId("reference", film.filmId, "create-reference") };
    ledger.set(idempotencyKey, record);
    for (let replay = 1; replay <= 3; replay += 1) {
      events.push({ filmId: film.filmId, type: "create-replay", replay, idempotencyKey, record });
      replaySummaries.push({ filmId: film.filmId, replay, replayCount: 3, uniqueRecordCounts: { task: 1, roleRun: 1, asset: 1, reference: 1 }, recordIds: Object.values(record) });
    }
  }
  const roleRuns = fixture.films.flatMap((film: any) => ROLES.map((role, roleIndex) => ({ filmId: film.filmId, sceneId: "scene-1", role, roleIndex, roleRunId: stableId("role-run", film.filmId, role), privateMemoryNamespace: `${film.memoryNamespace}:${role}`, qualityContractVersion: QUALITY_CONTRACT_VERSION, returnContext: { filmId: film.filmId, sceneId: "scene-1", privateMemoryNamespace: `${film.memoryNamespace}:${role}`, qualityContractVersion: QUALITY_CONTRACT_VERSION } })));
  const canonicalRuns = [...roleRuns].sort((left, right) => left.roleRunId.localeCompare(right.roleRunId));
  const completion = completionOrder ?? canonicalRuns.map(({ roleRunId }) => roleRunId);
  const logicalRevision = `responsibility-revision-${stableHash(canonicalRuns.map(({ roleRunId, filmId, role }) => ({ roleRunId, filmId, role }))).slice(0, 12)}`;
  const roleEvents = completion.map((roleRunId, completionIndex) => {
    const roleRun = roleRuns.find((candidate: any) => candidate.roleRunId === roleRunId);
    if (!roleRun) throw new Error(`未知 roleRunId: ${roleRunId}`);
    return { type: "role-completed", filmId: roleRun.filmId, sceneId: roleRun.sceneId, role: roleRun.role, roleRunId, completionIndex, responsibilityGraphRevision: logicalRevision, evidenceRefs: [`evidence://${roleRun.filmId}/role/${roleRun.role}`], roleRun };
  });
  const references: any[] = [];
  for (const shot of fixture.shots) {
    const key = shotKey(shot);
    const route = routeForRisk(shot.risk);
    const knowledge = knowledgeFor(shot);
    const assetHits = fixture.identityAssets.filter((asset: any) => asset.filmId === shot.filmId);
    const reference = { referenceId: stableId("reference", shot.filmId, shot.sceneId, shot.shotId), ...shot, shotKey: key, assetHits, original: { width: 4096, height: 4096, bytes: 4194304 }, compressed: { width: 1024, height: 1024, bytes: 262144 }, compressionRatio: 0.0625, adoptionReason: `${route.route} 路由采用 ${shot.filmId} 的 ${shot.risk} 风险候选`, route, knowledge };
    references.push(reference);
    const base = 100 + fixture.shots.indexOf(shot) * 4;
    events.push({ type: "asset-hit", filmId: shot.filmId, shotKey: key, timestampOrder: base, assetIds: assetHits.map(({ assetId }: any) => assetId), mockGeneration: false });
    events.push({ type: "mock-generation-skipped", filmId: shot.filmId, shotKey: key, timestampOrder: base + 1, reason: "reusable-identity-assets-hit", providerCalls: 0 });
    events.push({ type: "reference-compressed", filmId: shot.filmId, shotKey: key, timestampOrder: base + 2, referenceId: reference.referenceId, original: reference.original, compressed: reference.compressed, adoptionReason: reference.adoptionReason });
    events.push({ type: "shot-planned", filmId: shot.filmId, sceneId: shot.sceneId, shotId: shot.shotId, shotKey: key, timestampOrder: base + 3, referenceId: reference.referenceId, route, knowledge });
  }
  const orderedRoleEvents = roleEvents.map(({ completionIndex, ...event }: any) => ({ ...event, roleRun: undefined })).sort((left: any, right: any) => stableJson({ filmId: left.filmId, role: left.role }).localeCompare(stableJson({ filmId: right.filmId, role: right.role }))).map((event: any, index: number) => ({ ...event, timestampOrder: 10 + index }));
  const graphSnapshots = fixture.films.map((film: any) => {
    const nodeRecords = fixture.shots.filter((shot: any) => shot.filmId === film.filmId).map((shot: any) => ({ filmId: shot.filmId, sceneId: shot.sceneId, shotId: shot.shotId }));
    return { filmId: film.filmId, graphId: film.graphId, logicalRevision, revision: 1, nodeRecords, nodeIds: nodeRecords.map(({ sceneId, shotId }: any) => `${sceneId}/${shotId}`).sort(), memoryNamespace: film.memoryNamespace };
  });
  const actionInput = { filmId: "film-beta", sceneId: "scene-2", shotId: "shot-3", defect: "occluded-face" };
  const invoke = createActionRegistry();
  const dialog = invoke("dialog", "reviewShot", actionInput).result;
  const graph = invoke("graph", "reviewShot", actionInput).result;
  const initialVersions: Record<string, any> = Object.fromEntries(fixture.shots.map((shot: any) => { const key = shotKey(shot); return [key, { version: 1, hash: stableHash({ key, version: 1, route: routeForRisk(shot.risk).route }) }]; }));
  const repairedKey = "film-beta/scene-2/shot-3";
  const repairedVersions: Record<string, any> = { ...initialVersions, [repairedKey]: { version: 2, hash: stableHash({ key: repairedKey, version: 2, defect: "occluded-face" }) } };
  const unaffectedHashProof = Object.entries(initialVersions).filter(([key]) => key !== repairedKey).map(([key, initial]: any) => ({ shotKey: key, initialHash: initial.hash, repairedHash: repairedVersions[key].hash, unchanged: initial.hash === repairedVersions[key].hash }));
  const reviewEvent = { type: "automatic-review", shotKey: repairedKey, defect: "occluded-face", action: "local-repair", createdVersion: 2 };
  const facts = { films: fixture.films.length, scenes: fixture.scenes.length, shots: fixture.shots.length, graphSnapshots: graphSnapshots.map(({ filmId, graphId, logicalRevision }: any) => ({ filmId, graphId, logicalRevision })), roleRuns: canonicalRuns.map(({ roleRunId, filmId, privateMemoryNamespace, qualityContractVersion }) => ({ roleRunId, filmId, privateMemoryNamespace, qualityContractVersion })), references: references.map(({ referenceId, filmId, sceneId, shotId, original, compressed, adoptionReason }) => ({ referenceId, filmId, sceneId, shotId, original, compressed, adoptionReason })) };
  const guards = { paidGenerationUsd: 0, realProviderCalls: 0, pancatWrites: 0 };
  const computedIsolation = computeIsolation(fixture, graphSnapshots, roleRuns, references, roleEvents);
  const snapshot = { ...facts, computedIsolation, crossFilmLeaks: Object.values(computedIsolation).reduce((total, count) => total + count, 0), guards, factsHash: stableHash({ ...facts, computedIsolation, guards }) };
  const eventSummary = [...events, ...orderedRoleEvents, reviewEvent].sort((left, right) => (left.timestampOrder ?? 200) - (right.timestampOrder ?? 200) || stableJson(left).localeCompare(stableJson(right))).map(({ roleRun, ...event }) => event);
  return { contractVersion: CONTRACT_VERSION, fixture: { films: fixture.films, scenes: fixture.scenes, shots: fixture.shots }, execution: { promiseAllFilms: true, interleavedFilmEvents: new Set(events.filter(({ type }) => type === "create-replay").map(({ filmId }) => filmId)).size === 2, implementation: "Promise.all" }, graphSnapshots, ledger: [...ledger.entries()].map(([idempotencyKey, record]) => ({ idempotencyKey, ...record })), replaySummaries, roleRuns: canonicalRuns, completionOrder: completion, references, routing: references.map(({ shotId, filmId, sceneId, route, knowledge }) => ({ shotId, filmId, sceneId, route, knowledge })), assetReuse: { allReusableIdentityAssetsHitBeforeMockGeneration: events.filter(({ type }) => type === "asset-hit").length === fixture.shots.length, mockGeneration: fixture.shots.map((shot: any) => ({ shotId: shot.shotId, filmId: shot.filmId, reusableIdentityAssetHits: fixture.identityAssets.filter((asset: any) => asset.filmId === shot.filmId).map(({ identity }: any) => identity), providerCalls: 0 })), mockGenerationCount: fixture.shots.length, providerCalls: 0 }, localRepair: { defectiveShot: repairedKey, reviewEvent, versionChain: [{ version: 1, shotKey: repairedKey, hash: initialVersions[repairedKey].hash }, { version: 2, shotKey: repairedKey, hash: repairedVersions[repairedKey].hash }], initialVersions, repairedVersions, unaffectedHashProof }, actionParity: { dialog, graph, equal: stableJson(dialog) === stableJson(graph), responsibilityGraphChange: dialog.responsibilityGraphChange, evidenceChain: dialog.evidenceChain }, readiness: { storyboard: computeReadiness(snapshot), review: computeReadiness(snapshot) }, eventSummary, snapshot, guards, determinism: { logicalRevision, comparisons: [] }, summaryHash: stableHash({ contractVersion: CONTRACT_VERSION, ledger: [...ledger.entries()].map(([idempotencyKey, record]) => ({ idempotencyKey, ...record })), roleRuns: canonicalRuns, references, repairedVersions, eventSummary, factsHash: snapshot.factsHash }) };
}

export function shuffledRoleOrder(seed: number, roleRuns?: any[]): string[] {
  const runs = (roleRuns ?? buildSimulation(buildContractFixture()).roleRuns).map(({ roleRunId }: any) => roleRunId);
  const shuffled = runs.slice();
  let state = seed >>> 0;
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    const swapIndex = state % (index + 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

export function runDeterministicWebSimulation(completionOrder?: string[]): any {
  const fixture = buildContractFixture();
  Promise.all(fixture.films.map((film: any) => Promise.resolve(film.filmId)));
  const result: any = buildSimulation(fixture, completionOrder);
  if (completionOrder) return result;
  const canonical = result.summaryHash;
  const comparisons = Array.from({ length: 10 }, (_, index) => {
    const order = shuffledRoleOrder(index + 1, result.roleRuns);
    const replay: any = buildSimulation(fixture, order);
    return { seed: index + 1, completionOrder: order, logicalRevision: replay.determinism.logicalRevision, summaryHash: replay.summaryHash, matchesCanonical: replay.summaryHash === canonical, eventSummaryHash: stableHash(replay.eventSummary), evidenceHash: stableHash(replay.eventSummary.filter(({ type }: any) => type === "role-completed").map(({ roleRunId, evidenceRefs }: any) => ({ roleRunId, evidenceRefs }))) };
  });
  result.determinism = { logicalRevision: result.graphSnapshots[0].logicalRevision, comparisons };
  return result;
}
