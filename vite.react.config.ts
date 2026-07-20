import { fileURLToPath, URL } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",
  plugins: [react()],
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "react",
  },
  resolve: {
    alias: {
      "@react": fileURLToPath(new URL("./src-react", import.meta.url)),
    },
  },
  build: {
    outDir: "dist-react",
    emptyOutDir: true,
    rollupOptions: {
      input: fileURLToPath(new URL("./index.react.html", import.meta.url)),
    },
  },
  css: {
    postcss: "./postcss.react.config.cjs",
  },
  server: {
    port: 50288,
    proxy: {
      "/api": "http://127.0.0.1:10588",
      "/assets": "http://127.0.0.1:10588",
      "/oss": "http://127.0.0.1:10588",
      "/skills": "http://127.0.0.1:10588",
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src-react/test/setup.ts",
    include: ["src-react/**/*.test.{ts,tsx}"],
  },
});
