import { spawn } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

const serverPath = fileURLToPath(new URL("./project-canvas-canary-server.mjs", import.meta.url));

async function startServer() {
  const httpPort = 25080 + Math.floor(Math.random() * 1000);
  const socketPort = httpPort + 1;
  const child = spawn(process.execPath, [serverPath], {
    env: { ...process.env, HODOR_CANARY_HTTP_PORT: String(httpPort), HODOR_CANARY_SOCKET_PORT: String(socketPort) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = [];
  child.stdout.on("data", (chunk) => output.push(String(chunk)));
  child.stderr.on("data", (chunk) => output.push(String(chunk)));
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline && !output.join("").includes("HTTP listening")) await new Promise((resolve) => setTimeout(resolve, 20));
  return { child, httpPort };
}

test("canary HTTP server answers cross-port OPTIONS and CORS requests", async (t) => {
  const { child, httpPort } = await startServer();
  t.after(() => child.kill("SIGTERM"));

  const origin = "http://127.0.0.1:50288";
  const options = await fetch(`http://127.0.0.1:${httpPort}/api/project/getProject`, {
    method: "OPTIONS",
    headers: { Origin: origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization,content-type" },
  });
  assert.equal(options.status, 204);
  assert.equal(options.headers.get("access-control-allow-origin"), origin);
  assert.match(options.headers.get("access-control-allow-methods") ?? "", /POST/);

  const response = await fetch(`http://127.0.0.1:${httpPort}/api/project/getProject`, { headers: { Origin: origin } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), origin);
  assert.deepEqual(await response.json(), { data: [{ id: 7, name: "普通制作金丝雀", projectType: "novel" }, { id: 8, name: "互动剧金丝雀", projectType: "interactive" }] });
});

test("canary HTTP server returns the real empty-state contracts used by canvas modules", async (t) => {
  const { child, httpPort } = await startServer();
  t.after(() => child.kill("SIGTERM"));

  const post = async (path) => fetch(`http://127.0.0.1:${httpPort}/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  }).then((response) => response.json());

  assert.deepEqual(await post("/novel/getNovel"), { data: { data: [], total: 0 } });
  assert.deepEqual(await post("/script/getScrptApi"), { data: [{ id: 19, name: "金丝雀第一集", content: "雨夜测试场景" }] });
  assert.deepEqual(await post("/assets/getAssetsApi"), { data: { data: [], total: 0 } });
  assert.deepEqual(await post("/cornerScape/getAllAssets"), { data: [] });
  assert.deepEqual(await post("/production/getFlowData"), { data: { script: "", scriptPlan: "", assets: [], storyboardTable: "", storyboard: [] } });
  assert.deepEqual(await post("/production/workbench/getGenerateData"), { data: { storyboardList: [], trackList: [] } });
  const interactive = await post("/interactiveStory/graph/get");
  assert.equal(interactive.data.id, "canary-interactive-8");
  assert.equal(interactive.data.nodes[0].scriptId, 19);
});

/**
 * 登录合同验证：真实 HTTP 请求 /api/login/login，断言回包 data 与前端
 * PancatLoginSession（token/id/name/partnerId/partnerName/role）逐一一致，
 * 并确认 CORS 头保持；错误口令按后端业务错误约定（HTTP 200 + code 400）拒绝。
 */
test("canary HTTP server accepts the fixed isolated login account with the real Pancat session contract", async (t) => {
  const { child, httpPort } = await startServer();
  t.after(() => child.kill("SIGTERM"));

  const origin = "http://127.0.0.1:50288";
  const response = await fetch(`http://127.0.0.1:${httpPort}/api/login/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({ username: "canary", password: "password" }),
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), origin);
  assert.match(response.headers.get("access-control-allow-methods") ?? "", /POST/);

  const session = (await response.json()).data;
  assert.equal(session.token, "Bearer canary-session");
  assert.equal(session.id, "canary");
  assert.equal(session.name, "canary");
  assert.equal(session.partnerId, "pancat");
  assert.equal(session.partnerName, "PanCat");
  assert.equal(session.role, "super_admin");
  assert.deepEqual(session, {
    token: "Bearer canary-session",
    id: "canary",
    name: "canary",
    partnerId: "pancat",
    partnerName: "PanCat",
    role: "super_admin",
  });

  const rejected = await fetch(`http://127.0.0.1:${httpPort}/api/login/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({ username: "canary", password: "wrong" }),
  });
  assert.equal(rejected.status, 200);
  assert.deepEqual(await rejected.json(), { code: 400, message: "账号或密码错误", data: null });
});

/**
 * 页面级动作回路验证：用真实 canary 进程 + 真实 WebSocket，按前端 dispatcher
 * 的线上帧格式（graphId / revision / selectedNodeId / checkpointId / action + requestId）
 * 派发命令入口产生的动作，验证 ack 与随后推送的快照。
 */
test("canary socket applies the command-bar action wire contract end to end", async (t) => {
  const { child, httpPort } = await startServer();
  const socketPort = httpPort + 1;
  t.after(() => child.kill("SIGTERM"));

  const ws = new WebSocket(`ws://127.0.0.1:${socketPort}?projectId=7&mode=active&token=canary`);
  t.after(() => ws.close());

  const events = [];
  const pending = new Map();
  let sequence = 0;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("canary socket 连接超时")), 5000);
    ws.on("message", (raw) => {
      const frame = JSON.parse(String(raw));
      if (frame.kind === "event") events.push(frame);
      if (frame.kind === "ack" && frame.requestId) {
        const callback = pending.get(frame.requestId);
        if (callback) {
          pending.delete(frame.requestId);
          callback(frame.data);
        }
      }
    });
    ws.on("open", () => {
      clearTimeout(timer);
      resolve();
    });
    ws.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });

  await new Promise((resolve) => setTimeout(resolve, 100));
  const initial = events.find((frame) => frame.event === "productionGraph:snapshot");
  assert.ok(initial, "连接后应推送初始 productionGraph:snapshot");
  const graphId = initial.data.graphId;

  const sendAction = (data) => new Promise((resolve) => {
    const requestId = String(++sequence);
    pending.set(requestId, resolve);
    ws.send(JSON.stringify({ kind: "event", event: "productionGraph:action", data, requestId }));
  });

  // 阶段级 readGraph：无选中节点也可执行。
  const readAck = await sendAction({ graphId, revision: initial.data.revision, selectedNodeId: null, checkpointId: null, action: { action: "readGraph" } });
  assert.equal(readAck.ok, true);
  assert.equal(readAck.result.action, "readGraph");

  // 节点级 startReady：命令入口携带 selectedNodeId 与 nodeIds。
  const startAck = await sendAction({
    graphId,
    revision: initial.data.revision,
    selectedNodeId: "work-7",
    checkpointId: null,
    action: { action: "startReady", idempotencyKey: "command-canary-start-1", expectedRevision: initial.data.revision, nodeIds: ["work-7"] },
  });
  assert.equal(startAck.ok, true);
  assert.equal(startAck.result.action, "startReady");

  await new Promise((resolve) => setTimeout(resolve, 100));
  const afterStart = events.filter((frame) => frame.event === "productionGraph:snapshot").at(-1);
  const work = afterStart.data.nodes.find((node) => node.id === "work-7");
  assert.equal(work.status, "running", "startReady 后快照中的 work-7 应变为 running");
  assert.equal(afterStart.data.revision, initial.data.revision + 1);
});

/**
 * 自由文本指令的线上载荷回路：复用 canary 的真实 WebSocket，按 AgentChatClient
 * 的 chat 帧（content + context）发送画布命令入口产生的指令，验证服务端原样收到
 * 完整上下文，并回推 assistant 消息作为抽屉内的执行反馈。
 */
test("canary socket receives the canvas free-text command with its full context over real WebSocket", async (t) => {
  const { child, httpPort } = await startServer();
  const socketPort = httpPort + 1;
  t.after(() => child.kill("SIGTERM"));

  const ws = new WebSocket(`ws://127.0.0.1:${socketPort}?projectId=7&mode=active&token=canary`);
  t.after(() => ws.close());

  const events = [];
  const pending = new Map();
  let sequence = 0;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("canary socket 连接超时")), 5000);
    ws.on("message", (raw) => {
      const frame = JSON.parse(String(raw));
      if (frame.kind === "event") events.push(frame);
      if (frame.kind === "ack" && frame.requestId) {
        const callback = pending.get(frame.requestId);
        if (callback) {
          pending.delete(frame.requestId);
          callback(frame.data);
        }
      }
    });
    ws.on("open", () => {
      clearTimeout(timer);
      resolve();
    });
    ws.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });

  const sendChat = (data) => new Promise((resolve) => {
    const requestId = String(++sequence);
    pending.set(requestId, resolve);
    ws.send(JSON.stringify({ kind: "event", event: "chat", data, requestId }));
  });

  const ack = await sendChat({
    content: "为当前镜头写一段分镜描述",
    context: {
      projectId: 7,
      projectType: "novel",
      stage: "storyboards",
      stageLabel: "分镜",
      selectedNodeId: "work-7",
      nodeTitle: "整理项目内容",
      graphId: "canary-graph-7",
      revision: 1,
      checkpointId: null,
    },
  });
  assert.equal(ack.ok, true);
  assert.equal(ack.result.content, "为当前镜头写一段分镜描述");

  await new Promise((resolve) => setTimeout(resolve, 100));
  const reply = events.find((frame) => frame.event === "message");
  assert.ok(reply, "canary 应回推 assistant message 作为执行反馈");
  assert.equal(reply.data.role, "assistant");
  assert.match(reply.data.content[0].data, /已收到指令：为当前镜头写一段分镜描述（阶段：分镜）/);
});
