/**
 * Non-browser verification config for the Studio OS feature.
 *
 * The sandbox denies the jsdom CSS chain (css-tokenizer path), so this suite
 * runs in the node environment. Component views are verified through
 * server-side rendering (react-dom/server) with controlled props — an
 * approved non-browser route that still exercises every evidence binding.
 *
 * Plain ESM (.mjs) so Vite imports it directly and never writes a bundled
 * temp config. Cache is redirected under the feature directory (an authorized
 * path) and the dependency optimizer is disabled so no writes escape the
 * session workspace.
 */
import path from "node:path";

import { defineConfig } from "vitest/config";

const root = process.cwd();

export default defineConfig({
  resolve: {
    alias: {
      "@react": path.resolve(root, "src-react"),
    },
  },
  test: {
    environment: "node",
    globals: true,
    include: ["src-react/features/studio-os/**/*.test.{ts,tsx}"],
    cache: { dir: path.join(root, "src-react/features/studio-os/.vitest-cache") },
    deps: {
      optimizer: {
        web: { enabled: false },
        ssr: { enabled: false },
      },
    },
    css: false,
  },
});
