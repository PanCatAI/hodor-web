import { createServer } from "node:http";
import { WebSocketServer } from "ws";

const httpPort = Number(process.env.HODOR_CANARY_HTTP_PORT ?? 24680);
const socketPort = Number(process.env.HODOR_CANARY_SOCKET_PORT ?? 24681);

function node({ id, graphId, kind, title, objective, status = "ready" }) {
  const now = Date.now();
  return {
    id, graphId, kind, title, objective, status, inputRefs: [], outputRefs: [], constraints: [], evidence: [],
    budget: { currency: "USD", oneTimeCost: 0, recurringCost: 0 }, attempt: 0, capabilityId: null, agentRunId: null,
    checkpointId: null, checkpointReason: null, createdAt: now, updatedAt: now,
  };
}

function snapshot(projectId, graphId = `canary-graph-${projectId}`, revision = 1, nodes = null, edges = null) {
  const goal = node({ id: `goal-${projectId}`, graphId, kind: "goal", title: "项目生产目标", objective: "用统一画布完成一条零成本可恢复生产链。" });
  const work = node({ id: `work-${projectId}`, graphId, kind: "work", title: "整理项目内容", objective: "准备可供后续制作使用的内容节点。" });
  const resolvedNodes = nodes ?? [goal, work];
  const resolvedEdges = edges ?? [{ id: `edge-${projectId}`, graphId, kind: "requires", sourceNodeId: goal.id, targetNodeId: work.id, createdAt: Date.now(), updatedAt: Date.now() }];
  return {
    schemaVersion: "1", graphId, projectId: Number(projectId), interactiveStoryGraphId: null, revision, status: "active",
    nodes: resolvedNodes, edges: resolvedEdges,
    checkpointDecisions: [], resolvedReferences: [], availableActions: ["readGraph", "changeScope", "startReady", "pause", "resumeOrRetry", "adoptCandidate"],
    createdAt: Date.now(), updatedAt: Date.now(),
  };
}

const projects = [
  { id: 7, name: "普通制作金丝雀", projectType: "novel" },
  { id: 8, name: "互动剧金丝雀", projectType: "interactive" },
];

const interactiveGraph = {
  id: "canary-interactive-8",
  projectId: 8,
  title: "互动剧金丝雀",
  entryNodeId: "scene-8-1",
  status: "draft",
  revision: 1,
  nodes: [{
    id: "scene-8-1",
    graphId: "canary-interactive-8",
    scriptId: 19,
    kind: "scene",
    title: "雨夜开场",
    summary: "等待观众作出第一项选择",
    position: { x: 0, y: 0 },
    status: "ready",
    script: { id: 19, name: "金丝雀第一集", content: "雨夜测试场景", createTime: 1 },
    createdAt: 1,
    updatedAt: 1,
  }],
  edges: [],
  variables: [],
  createdAt: 1,
  updatedAt: 1,
};

// 隔离金丝雀登录账号：仅本 canary 进程接受，与真实前端 PancatLoginSession 契约一致。
const canaryCredentials = { username: "canary", password: "password" };
const canarySession = {
  token: "Bearer canary-session",
  id: "canary",
  name: "canary",
  partnerId: "pancat",
  partnerName: "PanCat",
  role: "super_admin",
};

const moduleFixtures = new Map([
  ["/api/novel/getNovel", { data: [], total: 0 }],
  ["/api/script/getScrptApi", [{ id: 19, name: "金丝雀第一集", content: "雨夜测试场景" }]],
  ["/api/assets/getAssetsApi", { data: [], total: 0 }],
  ["/api/cornerScape/getAllAssets", []],
  ["/api/modelSelect/getModelList", []],
  ["/api/production/getFlowData", { script: "", scriptPlan: "", assets: [], storyboardTable: "", storyboard: [] }],
  ["/api/production/workbench/getGenerateData", { storyboardList: [], trackList: [] }],
  ["/api/interactiveStory/graph/get", interactiveGraph],
  ["/api/agents/getMemory", []],
]);

function corsHeaders(request) {
  const origin = request.headers.origin;
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Authorization,Content-Type",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

function readJsonBody(request) {
  return new Promise((resolve) => {
    let raw = "";
    request.on("data", (chunk) => { raw += chunk; });
    request.on("end", () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({}); }
    });
    request.on("error", () => resolve({}));
  });
}

function sendJson(request, response, status, data) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...corsHeaders(request) });
  response.end(JSON.stringify(data));
}

const httpServer = createServer(async (request, response) => {
  if (request.method === "OPTIONS") {
    response.writeHead(204, corsHeaders(request));
    response.end();
    return;
  }
  const pathname = new URL(request.url ?? "/", `http://127.0.0.1:${httpPort}`).pathname;
  if (pathname === "/api/login/login" && request.method === "POST") {
    const credentials = await readJsonBody(request);
    if (credentials.username === canaryCredentials.username && credentials.password === canaryCredentials.password) {
      sendJson(request, response, 200, { data: canarySession });
    } else {
      sendJson(request, response, 200, { code: 400, message: "账号或密码错误", data: null });
    }
    return;
  }
  if (pathname === "/api/project/getProject") {
    sendJson(request, response, 200, { data: projects });
    return;
  }
  if (moduleFixtures.has(pathname)) {
    sendJson(request, response, 200, { data: moduleFixtures.get(pathname) });
    return;
  }
  sendJson(request, response, 200, { data: [] });
});

const socketServer = new WebSocketServer({ port: socketPort });
socketServer.on("connection", (connection, request) => {
  const query = new URL(request.url ?? "/", `http://127.0.0.1:${socketPort}`).searchParams;
  const projectId = query.get("projectId") ?? "7";
  const mode = query.get("mode") ?? "active";
  let current = mode === "empty" ? null : snapshot(projectId);
  const sendEvent = (event, data) => connection.send(JSON.stringify({ kind: "event", event, data }));
  sendEvent("productionGraph:snapshot", current);

  connection.on("message", (raw) => {
    const frame = JSON.parse(String(raw));
    if (frame.kind !== "event") return;
    const action = frame.data?.action;
    if (frame.event === "productionGraph:read") {
      if (frame.requestId) connection.send(JSON.stringify({ kind: "ack", requestId: frame.requestId, data: { ok: true, result: { action: "readGraph", snapshot: current, paidGenerationUsd: 0 } } }));
      return;
    }
    // 画布自由文本指令：按 AgentChatClient 的 chat 帧载荷（content + context）回推执行反馈。
    if (frame.event === "chat") {
      const payload = frame.data ?? {};
      const context = payload.context ?? {};
      if (frame.requestId) connection.send(JSON.stringify({ kind: "ack", requestId: frame.requestId, data: { ok: true, result: { content: payload.content } } }));
      connection.send(JSON.stringify({
        kind: "event",
        event: "message",
        data: {
          id: `canary-reply-${Date.now()}`,
          role: "assistant",
          status: "complete",
          datetime: new Date().toISOString(),
          content: [{
            type: "text",
            status: "complete",
            data: `已收到指令：${payload.content}（阶段：${context.stageLabel ?? "画布总览"}）`,
          }],
        },
      }));
      return;
    }
    if (frame.event !== "productionGraph:action") return;
    if (action?.action === "changeScope" && action.nodesUpsert?.length) {
      const graphId = current?.graphId ?? `canary-graph-${projectId}`;
      const nodes = action.nodesUpsert.map((item) => ({ ...item, graphId }));
      if (current) {
        const merged = new Map(current.nodes.map((item) => [item.id, item]));
        for (const item of nodes) merged.set(item.id, item);
        current = { ...current, revision: current.revision + 1, nodes: [...merged.values()], updatedAt: Date.now() };
      } else {
        current = snapshot(projectId, graphId, 1, nodes, []);
      }
    } else if (action?.action === "startReady") {
      current = { ...current, revision: current.revision + 1, nodes: current.nodes.map((item) => action.nodeIds?.includes(item.id) ? { ...item, status: "running", updatedAt: Date.now() } : item) };
    }
    if (frame.requestId) connection.send(JSON.stringify({ kind: "ack", requestId: frame.requestId, data: { ok: true, result: { action: action?.action ?? "readGraph", snapshot: current, idempotencyKey: action?.idempotencyKey, paidGenerationUsd: 0 } } }));
    sendEvent("productionGraph:snapshot", current);
  });
});

httpServer.listen(httpPort, "127.0.0.1", () => console.log(`Hodor canvas canary HTTP listening on ${httpPort}`));
console.log(`Hodor canvas canary Socket listening on ${socketPort}`);

function shutdown() {
  socketServer.close();
  httpServer.close();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
