import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const workspace = resolve(import.meta.dirname, "../..");

describe("Hodor Electron release contract", () => {
  it("pins the React development server to the Electron port", () => {
    const viteConfig = readFileSync(resolve(workspace, "vite.react.config.ts"), "utf8");

    expect(viteConfig).toContain('base: "./"');
    expect(viteConfig).toContain("port: 50288");
    expect(viteConfig).toContain("strictPort: true");
    expect(viteConfig).toContain('assetsDir: "static"');
    expect(viteConfig).toContain('"Cross-Origin-Opener-Policy": "same-origin"');
    expect(viteConfig).toContain('"Cross-Origin-Embedder-Policy": "credentialless"');
  });

  it("provides a repeatable React build and backend publish command", () => {
    const packageJson = JSON.parse(readFileSync(resolve(workspace, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts["publish:hodor"]).toContain("yarn build");
    expect(packageJson.scripts["publish:hodor"]).toContain("scripts/publish-to-hodor.mjs");
  });
});
