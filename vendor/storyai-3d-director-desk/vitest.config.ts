import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const vendorRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: vendorRoot,
  assetsInclude: ["**/*.fbx", "**/*.obj", "**/*.glb"],
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: "./src/test/setup.ts",
  },
});
