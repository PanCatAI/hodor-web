import { readFileSync } from "node:fs";
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
    expect(packageJson.scripts["dev:vue"]).toContain("vite.config.ts");
    expect(packageJson.scripts["build:vue"]).toContain("vue-tsc");
  });

  it("loads the React root from the default HTML entry while preserving the Vue fallback", () => {
    const defaultHtml = readFileSync(resolve(workspace, "index.html"), "utf8");
    const vueHtml = readFileSync(resolve(workspace, "index.vue.html"), "utf8");

    expect(defaultHtml).toContain('id="root"');
    expect(defaultHtml).toContain('/src-react/main.tsx');
    expect(vueHtml).toContain('id="app"');
    expect(vueHtml).toContain('/src/main.ts');
  });
});
