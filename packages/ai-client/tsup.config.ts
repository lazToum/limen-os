import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  external: ["@tauri-apps/api", "@tauri-apps/api/core", "@anthropic-ai/sdk"],
});
