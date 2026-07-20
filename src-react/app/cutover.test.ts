import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const workspace = resolve(import.meta.dirname, "../..");

describe("Hodor React default entry", () => {
  it("uses the Hodor package name and React as the default development and build target", () => {
    const packageJson = JSON.parse(readFileSync(resolve(workspace, "package.json"), "utf8")) as {
      name: string;
      scripts: Record<string, string>;
    };

    expect(packageJson.name).toBe("hodor-web");
    expect(packageJson.scripts.dev).toContain("vite.react.config.ts");
    expect(packageJson.scripts.build).toContain("tsconfig.react.json");
  });

  it("loads the React root from the default HTML entry", () => {
    const defaultHtml = readFileSync(resolve(workspace, "index.html"), "utf8");

    expect(defaultHtml).toContain('id="root"');
    expect(defaultHtml).toContain('/src-react/main.tsx');
  });

  it("has no legacy runtime entry, source tree, scripts, or dependencies", () => {
    const packageJson = JSON.parse(readFileSync(resolve(workspace, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    const packageNames = [...Object.keys(packageJson.dependencies), ...Object.keys(packageJson.devDependencies)];

    expect(existsSync(resolve(workspace, "src"))).toBe(false);
    expect(existsSync(resolve(workspace, "index.vue.html"))).toBe(false);
    expect(existsSync(resolve(workspace, "vite.config.ts"))).toBe(false);
    expect(Object.keys(packageJson.scripts).some((name) => name.includes("vue"))).toBe(false);
    expect(packageNames.some((name) => /(?:^vue$|vue-|@vue|pinia|tdesign-vue|splitpanes)/i.test(name))).toBe(false);
  });
});
