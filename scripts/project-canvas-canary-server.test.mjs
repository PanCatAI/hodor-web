import { spawn } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

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
