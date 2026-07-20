import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { publishReactBundle, validateReactBundle } from "./publish-to-hodor.mjs";

test("publishReactBundle replaces stale files and copies the complete React bundle", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "hodor-web-publish-"));
  const webRoot = path.join(root, "web");
  const appRoot = path.join(root, "app");
  const distRoot = path.join(webRoot, "dist-react");
  const targetRoot = path.join(appRoot, "data", "web");

  await mkdir(path.join(distRoot, "static"), { recursive: true });
  await mkdir(targetRoot, { recursive: true });
  await writeFile(
    path.join(distRoot, "index.html"),
    '<script type="module" src="./static/app.js"></script>',
  );
  await writeFile(path.join(distRoot, "static", "app.js"), "console.log('hodor')");
  await writeFile(path.join(targetRoot, "stale.js"), "old");

  const result = await publishReactBundle({ distRoot, appRoot });

  assert.equal(result.targetRoot, targetRoot);
  assert.equal(
    await readFile(path.join(targetRoot, "index.html"), "utf8"),
    '<script type="module" src="./static/app.js"></script>',
  );
  assert.equal(await readFile(path.join(targetRoot, "static", "app.js"), "utf8"), "console.log('hodor')");
  await assert.rejects(readFile(path.join(targetRoot, "stale.js"), "utf8"));
});

test("validateReactBundle rejects absolute or missing renderer resources", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "hodor-web-assets-invalid-"));
  await mkdir(path.join(root, "static"), { recursive: true });
  await writeFile(path.join(root, "index.html"), '<script src="/static/app.js"></script>');
  await writeFile(path.join(root, "static", "app.js"), "ok");

  await assert.rejects(validateReactBundle(root), /必须使用相对 static 路径/);

  await writeFile(path.join(root, "index.html"), '<script src="./static/missing.js"></script>');
  await assert.rejects(validateReactBundle(root), /构建资源不存在/);
});

test("publishReactBundle refuses a bundle without index.html", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "hodor-web-publish-invalid-"));
  const distRoot = path.join(root, "dist-react");
  const appRoot = path.join(root, "app");
  await mkdir(distRoot, { recursive: true });

  await assert.rejects(publishReactBundle({ distRoot, appRoot }), /缺少 React 构建入口/);
});
