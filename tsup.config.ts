import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  target: "node18",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  splitting: false,
  shims: true,
  banner: {
    js: "#!/usr/bin/env node",
  },
});
