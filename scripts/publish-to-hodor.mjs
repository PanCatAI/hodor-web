import { access, cp, mkdir, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptDirectory, "..");

async function exists(value) {
  try {
    await access(value);
    return true;
  } catch {
    return false;
  }
}

export async function publishReactBundle({
  distRoot = path.join(workspaceRoot, "dist-react"),
  appRoot,
}) {
  if (!appRoot) throw new Error("缺少 Hodor 后端目录");

  await validateReactBundle(distRoot);

  const targetParent = path.join(path.resolve(appRoot), "data");
  const targetRoot = path.join(targetParent, "web");
  const stagingRoot = path.join(targetParent, `.web-hodor-staging-${process.pid}`);
  const backupRoot = path.join(targetParent, `.web-hodor-backup-${process.pid}`);

  await mkdir(targetParent, { recursive: true });
  await rm(stagingRoot, { recursive: true, force: true });
  await rm(backupRoot, { recursive: true, force: true });
  await cp(distRoot, stagingRoot, { recursive: true });

  const hadTarget = await exists(targetRoot);
  try {
    if (hadTarget) await rename(targetRoot, backupRoot);
    await rename(stagingRoot, targetRoot);
    await rm(backupRoot, { recursive: true, force: true });
  } catch (error) {
    await rm(stagingRoot, { recursive: true, force: true });
    if (hadTarget && !(await exists(targetRoot)) && (await exists(backupRoot))) {
      await rename(backupRoot, targetRoot);
    }
    throw error;
  }

  return { sourceRoot: path.resolve(distRoot), targetRoot };
}

export async function validateReactBundle(distRoot) {
  const sourceIndex = path.join(distRoot, "index.html");
  if (!(await exists(sourceIndex))) {
    throw new Error(`缺少 React 构建入口: ${sourceIndex}`);
  }

  const html = await readFile(sourceIndex, "utf8");
  const rendererResources = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
    .map((match) => match[1])
    .filter((value) => /\.(?:js|css)(?:\?|$)/i.test(value));

  if (rendererResources.length === 0) {
    throw new Error("React 构建入口没有脚本或样式资源");
  }

  for (const resource of rendererResources) {
    if (!resource.startsWith("./static/")) {
      throw new Error(`Electron 构建资源必须使用相对 static 路径: ${resource}`);
    }
    const cleanResource = resource.split("?", 1)[0];
    const resourcePath = path.resolve(distRoot, cleanResource);
    if (!(await exists(resourcePath))) {
      throw new Error(`构建资源不存在: ${resourcePath}`);
    }
  }

  return rendererResources;
}

async function resolveAppRoot(cliValue) {
  const explicit = cliValue || process.env.HODOR_APP_DIR;
  if (explicit) return path.resolve(explicit);

  const candidates = [path.resolve(workspaceRoot, "../hodor")];
  for (const candidate of candidates) {
    if (await exists(path.join(candidate, "package.json"))) return candidate;
  }

  throw new Error("找不到 Hodor 后端目录，请设置 HODOR_APP_DIR");
}

async function validateHodorApp(appRoot) {
  const packagePath = path.join(appRoot, "package.json");
  let packageJson;
  try {
    packageJson = JSON.parse(await readFile(packagePath, "utf8"));
  } catch {
    throw new Error(`Hodor 后端目录无效: ${appRoot}`);
  }
  if (packageJson.name !== "hodor") {
    throw new Error(`目标目录不是 Hodor 后端: ${appRoot}`);
  }
}

async function main() {
  const appDirIndex = process.argv.indexOf("--app-dir");
  const cliAppRoot = appDirIndex >= 0 ? process.argv[appDirIndex + 1] : undefined;
  const appRoot = await resolveAppRoot(cliAppRoot);
  await validateHodorApp(appRoot);
  const result = await publishReactBundle({ appRoot });
  console.log(`Hodor React 静态资源已同步到 ${result.targetRoot}`);
}

const executedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === executedPath) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
