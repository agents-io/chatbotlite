import { defineConfig } from "tsup";
import pkg from "./package.json";

export default defineConfig([
  // Main library — externalizes React (for users who already have React)
  {
    entry: {
      index: "src/index.ts",
      "core/index": "src/core/index.ts",
      "client/index": "src/client/index.ts",
      "react/index": "src/react/index.tsx",
      "node/index": "src/node/index.ts",
      "adapters/index": "src/adapters/index.ts"
    },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: true,
    splitting: false,
    treeshake: true,
    external: ["react", "react-dom", "node:fs", "node:path"]
  },
  // Embed bundle — vanilla JS, React + ReactDOM bundled inline.
  // Drop into any HTML page via <script src="...embed.global.js"></script>.
  {
    entry: { embed: "src/embed/index.tsx" },
    format: ["iife"],
    sourcemap: true,
    clean: false,
    splitting: false,
    treeshake: true,
    minify: true,
    platform: "browser",
    dts: false,
    noExternal: ["react", "react-dom", "react-dom/client"],
    define: {
      __CHATBOTLITE_VERSION__: JSON.stringify(pkg.version)
    }
  }
]);
