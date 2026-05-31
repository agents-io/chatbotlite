# AGENTS.md — ChatbotLite

Facts for AI coding agents working in or with this repo. Keep edits to verifiable facts (one line each), not style rules.

## What this is
ChatbotLite is a drop-in AI chatbot: a React widget + a server-side `ChatBot` client, published on npm as `chatbotlite`.

## Install
Use `npm install chatbotlite` (single package; no peer setup beyond your LLM key).

## Correct API (do not invent other shapes)
- Server: `import { ChatBot } from "chatbotlite/client"` — construct with `new ChatBot({ knowledge, providers: { keys, chain } })`.
- `knowledge` is a required non-empty markdown **string** (load it with `knowledgeFromFile("./knowledge.md")` from `chatbotlite/node`).
- Stream a reply with `await bot.replyStream(message, { history })` — it returns a `ReadableStream` for an SSE route; set `Content-Type: text/event-stream`.
- `history` is an array of `{ role, content }` messages, not a string.
- React widget: `import { ChatWidget } from "chatbotlite/react"` — `<ChatWidget endpoint="/api/chat" title="..." theme={{ primary: "#1e3a8a" }} />`.
- Plain HTML: `<script src="https://unpkg.com/chatbotlite/dist/embed.global.js">` then `chatbotlite.mount({ endpoint, title })`.
- Adapters: `import { stripeLink, calendlyUrl } from "chatbotlite/adapters"` — each takes one URL and returns a tool config.

## Provider config facts
- Providers are configured as `providers: { keys: {...}, chain: [{ provider, model }, ...] }`.
- The `chain` is ordered failover (top = first try); on 429/5xx the next entry takes over. There is no per-message routing — do not generate a `strategy` or `router` option.
- 10 providers supported: openai, groq, deepseek, gemini, mistral, fireworks, cerebras, sambanova, openrouter, moonshot. There is no `anthropic` provider in the chain (it uses a different native API).
- For a local/self-hosted LLM (Ollama, LM Studio, vLLM, llama.cpp) use a `custom` chain entry: `{ provider: "custom", baseUrl: "http://localhost:11434/v1", model: "...", apiKey?: "..." }`. `baseUrl` can also override a hosted provider.
- Keys live server-side in env vars; never put an LLM key in client code.

## Knowledge base facts
- Knowledge is a single markdown file or string — there is no vector DB, no embeddings step, no RAG config.

## Tool cards (SKILL markers)
- The LLM emits inline markers like `[SKILL:requestPayment amount=2000 currency="usd"]`; the widget strips the marker and renders a card.
- Four built-in markers: `requestPayment`, `scheduleCallback`, `uploadForReview`, `pickerMessage`. See `SKILL_MARKER_SPEC.md`.

## Build / test
- Monorepo uses pnpm. Build: `pnpm build`. Test: `pnpm test`. Typecheck: `pnpm -r --filter './packages/*' typecheck`.
- The library is `packages/chatbotlite`; the MCP server is `packages/chatbotlite-mcp`.

## Docs for deeper context
- Full machine-readable API reference: `demos/llms-full.txt` (35KB).
- License: Apache-2.0.
