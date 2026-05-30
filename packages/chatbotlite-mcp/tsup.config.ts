import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts" },
  format: ["esm"],
  target: "node18",
  clean: true,
  sourcemap: true,
  // Keep the shebang so `npx chatbotlite-mcp` works as a CLI binary.
  banner: { js: "#!/usr/bin/env node" }
});
