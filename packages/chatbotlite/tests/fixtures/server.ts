// Minimal Node HTTP server for Playwright E2E.
// Serves:
//   /              → fixture HTML mounting the built embed bundle
//   /embed.global.js → built embed bundle from dist/
//   /api/chat      → behaviour controlled by ?mode= query OR /__mode endpoint
//   /__mode/<m>    → switch runtime mode (stream | json | err500 | err501 | hang | empty)
//   /health        → 200 for webServer readiness probe
//
// Test ordering: tests POST /__mode/err501 → then exercise widget → assert.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = 4317;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(__dirname, "..", "..");
const EMBED_BUNDLE = path.join(PKG_ROOT, "dist", "embed.global.js");

let mode: "stream" | "json" | "err500" | "err501" | "hang" | "empty" = "stream";

function indexHtml(): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>cbl e2e</title></head>
<body>
<h1>chatbotlite E2E fixture</h1>
<script src="/embed.global.js"></script>
<script>
  window.__cblInstance = chatbotlite.mount({
    endpoint: "/api/chat",
    title: "Test Bot",
    greeting: "Hello! Ask me something.",
    theme: { primary: "#0066ff" },
    attach: { enabled: true }
  });
</script>
</body></html>`;
}

function sendSseStream(res: http.ServerResponse): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive"
  });
  const tokens = ["Hi", " there", "!", " I am", " a bot."];
  let i = 0;
  const interval = setInterval(() => {
    if (i < tokens.length) {
      res.write(`event: token\ndata: ${JSON.stringify(tokens[i])}\n\n`);
      i++;
    } else {
      const full = tokens.join("");
      res.write(`event: done\ndata: ${JSON.stringify({ reply: full })}\n\n`);
      clearInterval(interval);
      res.end();
    }
  }, 40);
}

const server = http.createServer((req, res) => {
  const url = req.url ?? "/";

  if (url === "/health") {
    res.writeHead(200).end("ok");
    return;
  }

  if (url.startsWith("/__mode/")) {
    const m = url.replace("/__mode/", "");
    if (["stream", "json", "err500", "err501", "hang", "empty"].includes(m)) {
      mode = m as typeof mode;
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ mode }));
    } else {
      res.writeHead(400).end("bad mode");
    }
    return;
  }

  if (url === "/" || url === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(indexHtml());
    return;
  }

  if (url === "/embed.global.js") {
    if (!fs.existsSync(EMBED_BUNDLE)) {
      res.writeHead(500).end("// embed bundle not built — run `npm run build`");
      return;
    }
    res.writeHead(200, { "Content-Type": "application/javascript" }).end(fs.readFileSync(EMBED_BUNDLE));
    return;
  }

  if (url === "/api/chat" && req.method === "POST") {
    // Drain request body
    req.on("data", () => {});
    req.on("end", () => {
      if (mode === "err500") {
        res.writeHead(500, { "Content-Type": "text/plain" }).end("internal error");
        return;
      }
      if (mode === "err501") {
        // Mimic a static-server 501 that returns an HTML error page — the bug we just fixed.
        res.writeHead(501, { "Content-Type": "text/html" }).end(
          `<!DOCTYPE HTML><html><head><title>Error response</title></head><body><h1>Error response</h1><p>Error code: 501</p></body></html>`
        );
        return;
      }
      if (mode === "hang") {
        // Never respond — client should time out / be aborted
        return;
      }
      if (mode === "empty") {
        res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({}));
        return;
      }
      if (mode === "json") {
        res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ reply: "JSON mode reply" }));
        return;
      }
      // default: stream
      sendSseStream(res);
    });
    return;
  }

  res.writeHead(404).end("not found");
});

server.listen(PORT, "127.0.0.1", () => {
  // eslint-disable-next-line no-console
  console.log(`[fixture] listening on http://127.0.0.1:${PORT}`);
});
