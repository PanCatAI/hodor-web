import type { HodorApiClient } from "@react/lib/api/client";
import type { AgentServerHandlers, AgentType, AgentWorkDataTagEvent } from "./types";

type UnknownRecord = Record<string, unknown>;

interface CreateAgentServerHandlersOptions {
  agentType: AgentType;
  projectId: number;
  episodeId?: number;
  apiClient: Pick<HodorApiClient, "request">;
  concurrentCount?: number;
  recoveryDelay?: (milliseconds: number) => Promise<void>;
  recoveryDelayMaxMs?: number;
  onFlowDataChange?: () => void;
}

interface ScriptItem extends UnknownRecord {
  id?: number;
  name: string;
  content: string;
}

interface ScriptPlanData extends UnknownRecord {
  storySkeleton: string;
  adaptationStrategy: string;
  script: ScriptItem[];
}

interface ProductionFlowData extends UnknownRecord {
  script: string;
  scriptPlan: string;
  storyboardTable: string;
  assets: UnknownRecord[];
  storyboard: UnknownRecord[];
}

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function post<T>(client: Pick<HodorApiClient, "request">, path: string, body: UnknownRecord): Promise<T> {
  return client.request<T>(path, { method: "POST", body: JSON.stringify(body) });
}

function normalizePlan(value: unknown): ScriptPlanData {
  const envelope = isRecord(value) && isRecord(value.data) ? value.data : value;
  const data = isRecord(envelope) ? envelope : {};
  return {
    ...data,
    storySkeleton: asString(data.storySkeleton),
    adaptationStrategy: asString(data.adaptationStrategy),
    script: asArray(data.script)
      .filter(isRecord)
      .map((item) => ({
        ...item,
        ...(asNumber(item.id) === null ? {} : { id: asNumber(item.id)! }),
        name: asString(item.name),
        content: asString(item.content),
      })),
  };
}

function normalizeFlow(value: unknown): ProductionFlowData {
  const data = isRecord(value) ? value : {};
  return {
    ...data,
    script: asString(data.script),
    scriptPlan: asString(data.scriptPlan),
    storyboardTable: asString(data.storyboardTable),
    assets: asArray(data.assets).filter(isRecord),
    storyboard: asArray(data.storyboard).filter(isRecord),
  };
}

function withoutInternalMaterialFields(value: UnknownRecord): UnknownRecord {
  const { prompt: _prompt, flowId: _flowId, src: _src, ...publicFields } = value;
  return publicFields;
}

function flowForAgent(data: ProductionFlowData): ProductionFlowData {
  return {
    ...data,
    assets: data.assets.map((asset) => {
      const publicAsset = withoutInternalMaterialFields(asset);
      return {
        ...publicAsset,
        derive: asArray(asset.derive).filter(isRecord).map(withoutInternalMaterialFields),
      };
    }),
    storyboard: data.storyboard.map(withoutInternalMaterialFields),
  };
}

function normalizeIds(payload: unknown): number[] {
  if (!isRecord(payload)) return [];
  return asArray(payload.ids)
    .map(asNumber)
    .filter((id): id is number => id !== null);
}

function normalizeStoryboard(payload: unknown): UnknownRecord {
  const data = isRecord(payload) ? payload : {};
  const shouldGenerateImage = data.shouldGenerateImage === true || String(data.shouldGenerateImage).toLowerCase() === "true" ? 1 : 0;
  return {
    prompt: asString(data.prompt),
    duration: asNumber(data.duration) ?? 0,
    track: asString(data.track),
    state: "未生成",
    src: null,
    videoDesc: asString(data.videoDesc),
    shouldGenerateImage,
    associateAssetsIds: asArray(data.associateAssetsIds)
      .map(asNumber)
      .filter((id): id is number => id !== null),
  };
}

export function createAgentServerHandlers(options: CreateAgentServerHandlersOptions): AgentServerHandlers {
  const { apiClient } = options;
  let projectId = options.projectId;
  let episodeId = options.episodeId;
  const concurrentCount = options.concurrentCount ?? 5;
  let planData: ScriptPlanData | null = null;
  let flowData: ProductionFlowData | null = null;
  let saveQueue = Promise.resolve<unknown>(undefined);
  let recoveryRun = 0;
  const recoveryDelay =
    options.recoveryDelay ?? ((milliseconds: number) => new Promise<void>((resolve) => globalThis.setTimeout(resolve, milliseconds)));
  const recoveryDelayMaxMs = options.recoveryDelayMaxMs ?? 30000;

  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = saveQueue.then(operation, operation);
    saveQueue = next.catch(() => undefined);
    return next;
  }

  async function loadPlan() {
    const response = await post<unknown>(apiClient, "/scriptAgent/getPlanData", { projectId, agentType: "scriptAgent" });
    planData = normalizePlan(response);
    return planData;
  }

  async function savePlan() {
    const data = planData ?? (await loadPlan());
    await post(apiClient, "/scriptAgent/setPlanData", { projectId, agentType: "scriptAgent", data });
    return data;
  }

  async function loadFlow() {
    if (episodeId === undefined) throw new Error("生产智能体缺少剧本 ID");
    flowData = normalizeFlow(await post<unknown>(apiClient, "/production/getFlowData", { projectId, episodesId: episodeId }));
    return flowData;
  }

  async function saveFlow() {
    if (episodeId === undefined) throw new Error("生产智能体缺少剧本 ID");
    const data = flowData ?? (await loadFlow());
    await post(apiClient, "/production/saveFlowData", { projectId, episodesId: episodeId, data });
    options.onFlowDataChange?.();
    return data;
  }

  async function refreshAndSaveFlow() {
    const data = await loadFlow();
    await saveFlow();
    return data;
  }

  async function updateScriptWorkData(event: AgentWorkDataTagEvent) {
    if (event.status !== "complete") return;
    // Generated scripts are validated and persisted by the backend after the
    // complete agent response is available. Keeping this write in the browser
    // would create two competing database writers for the same script.
    if (event.tag === "scriptItem") return;
    const data = planData ?? (await loadPlan());
    if (event.tag === "storySkeleton") data.storySkeleton = event.value;
    else if (event.tag === "adaptationStrategy") data.adaptationStrategy = event.value;
    else return;
    await savePlan();
  }

  async function updateProductionWorkData(event: AgentWorkDataTagEvent) {
    if (event.status !== "complete") return;
    const data = flowData ?? (await loadFlow());
    if (event.tag === "script") data.script = event.value;
    else if (event.tag === "scriptPlan") data.scriptPlan = event.value;
    else if (event.tag === "storyboardTable") data.storyboardTable = event.value;
    else return;
    await saveFlow();
  }

  function isRunning(value: unknown) {
    return value === "生成中" || value === "pending" || value === "running";
  }

  function runningProductionIds(data: ProductionFlowData) {
    const assetIds: number[] = [];
    for (const asset of data.assets) {
      for (const derived of asArray(asset.derive).filter(isRecord)) {
        const id = asNumber(derived.id);
        if (id !== null && isRunning(derived.state)) assetIds.push(id);
      }
    }
    const storyboardIds = data.storyboard
      .filter((storyboard) => isRunning(storyboard.state))
      .map((storyboard) => asNumber(storyboard.id))
      .filter((id): id is number => id !== null);
    return { assetIds, storyboardIds };
  }

  function mergeProductionRecovery(data: ProductionFlowData, assetUpdates: unknown, storyboardUpdates: unknown) {
    const assetMap = new Map(
      asArray(assetUpdates)
        .filter(isRecord)
        .map((item) => [asNumber(item.id), item] as const)
        .filter((entry): entry is [number, UnknownRecord] => entry[0] !== null),
    );
    for (const asset of data.assets) {
      for (const derived of asArray(asset.derive).filter(isRecord)) {
        const update = assetMap.get(asNumber(derived.id) ?? -1);
        if (update) Object.assign(derived, update);
      }
    }
    const storyboardMap = new Map(
      asArray(storyboardUpdates)
        .filter(isRecord)
        .map((item) => [asNumber(item.id), item] as const)
        .filter((entry): entry is [number, UnknownRecord] => entry[0] !== null),
    );
    data.storyboard.forEach((storyboard) => {
      const update = storyboardMap.get(asNumber(storyboard.id) ?? -1);
      if (update) Object.assign(storyboard, update);
    });
  }

  async function restoreProductionWorkData() {
    const run = ++recoveryRun;
    const data = await loadFlow();
    let delayMs = 1000;
    while (run === recoveryRun) {
      const { assetIds, storyboardIds } = runningProductionIds(data);
      if (!assetIds.length && !storyboardIds.length) return data;
      try {
        const [assetUpdates, storyboardUpdates] = await Promise.all([
          assetIds.length ? post(apiClient, "/production/assets/pollingImage", { ids: assetIds }) : Promise.resolve([]),
          storyboardIds.length ? post(apiClient, "/production/storyboard/pollingImage", { ids: storyboardIds }) : Promise.resolve([]),
        ]);
        if (run !== recoveryRun) return data;
        await enqueue(async () => {
          mergeProductionRecovery(data, assetUpdates, storyboardUpdates);
          const latest = flowData ?? data;
          if (latest !== data) mergeProductionRecovery(latest, assetUpdates, storyboardUpdates);
          if (episodeId === undefined) throw new Error("生产智能体缺少剧本 ID");
          await post(apiClient, "/production/saveFlowData", { projectId, episodesId: episodeId, data: latest });
          options.onFlowDataChange?.();
        });
        delayMs = 1000;
        const remaining = runningProductionIds(data);
        if (!remaining.assetIds.length && !remaining.storyboardIds.length) return data;
      } catch {
        // A transient poll error keeps the server-backed running IDs intact for the next attempt.
      }
      await recoveryDelay(delayMs);
      delayMs = Math.min(delayMs * 2, recoveryDelayMaxMs);
    }
    return data;
  }

  function continueProductionRecovery() {
    void restoreProductionWorkData().catch(() => undefined);
  }

  if (options.agentType === "scriptAgent") {
    return {
      getPlanData: () => enqueue(loadPlan),
      onWorkDataTag: (event) => enqueue(() => updateScriptWorkData(event)),
      restoreWorkData: () => enqueue(loadPlan),
      updateContext: (context) => {
        projectId = context.projectId;
        planData = null;
      },
    };
  }

  if (episodeId === undefined) throw new Error("生产智能体处理器需要 episodeId");
  return {
    getFlowData: () => enqueue(async () => flowForAgent(await loadFlow())),
    addDeriveAsset: () =>
      enqueue(async () => {
        await refreshAndSaveFlow();
        return { success: true, message: "衍生资产已保存" };
      }),
    delDeriveAsset: () =>
      enqueue(async () => {
        await refreshAndSaveFlow();
        return { success: true, message: "衍生资产已删除" };
      }),
    generateDeriveAsset: (payload) =>
      enqueue(async () => {
        const ids = normalizeIds(payload);
        if (!ids.length) throw new Error("缺少需要生成的衍生资产 ID");
        const result = await post(apiClient, "/production/assets/batchGenerateAssetsImage", {
          assetIds: ids,
          projectId,
          scriptId: episodeId!,
          concurrentCount,
        });
        continueProductionRecovery();
        return result;
      }),
    generateStoryboard: (payload) =>
      enqueue(async () => {
        const ids = normalizeIds(payload);
        if (!ids.length) throw new Error("缺少需要生成的分镜 ID");
        const result = await post(apiClient, "/production/storyboard/batchGenerateImage", {
          storyboardIds: ids,
          projectId,
          scriptId: episodeId!,
          concurrentCount,
          compulsory: true,
        });
        continueProductionRecovery();
        return result;
      }),
    addStoryboard: (payload) =>
      enqueue(async () => {
        const data = normalizeStoryboard(payload);
        await post(apiClient, "/production/storyboard/batchAddStoryboardInfo", {
          projectId,
          scriptId: episodeId!,
          data: [data],
        });
        await refreshAndSaveFlow();
        return { success: true, message: "分镜已保存" };
      }),
    onWorkDataTag: (event) => enqueue(() => updateProductionWorkData(event)),
    restoreWorkData: () => restoreProductionWorkData(),
    stopRecovery: () => {
      recoveryRun += 1;
    },
    updateContext: (context) => {
      recoveryRun += 1;
      projectId = context.projectId;
      episodeId = context.episodeId;
      flowData = null;
    },
  };
}

export type { CreateAgentServerHandlersOptions };
