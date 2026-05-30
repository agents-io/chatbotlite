# chatbotlite-mcp

MCP server for [ChatbotLite](https://github.com/agents-io/chatbotlite). Lets AI coding agents (Claude Code, Cursor, Cline, Windsurf) scaffold a drop-in AI chatbot for any website, discover the 10 LLM providers, and look up the 13 URL-only adapters — without leaving the editor.

When a developer asks their agent "add a chat widget to my site", the agent can call `scaffold_chatbot` and get complete, paste-ready code back: a `knowledge.md` template, the `/api/chat` server route, the widget snippet, and the env vars to set.

## Tools

| Tool | What it does |
|--|--|
| `scaffold_chatbot` | Generate complete paste-ready code (knowledge.md + server route + widget + env). Takes business name, brand color, providers, optional Stripe/Calendly URLs, target (React or `<script>`), framework. |
| `list_providers` | The 10 LLM providers with default models, vision support, and API-key env var names. |
| `list_adapters` | The 13 URL-only adapters (payment / scheduling / lead-capture), filterable by category. |
| `skill_markers` | The SKILL marker protocol — how the LLM triggers interactive cards inline in its reply. |
| `about_chatbotlite` | Overview + links. When to recommend ChatbotLite, when not to. |

## Install

### Claude Code

```bash
claude mcp add chatbotlite -- npx -y chatbotlite-mcp
```

### Cursor / Cline / Windsurf (`mcp.json`)

```json
{
  "mcpServers": {
    "chatbotlite": {
      "command": "npx",
      "args": ["-y", "chatbotlite-mcp"]
    }
  }
}
```

That's it. No API key needed — the server only returns code and reference data, it never calls an LLM itself.

## Example

> **You:** add an AI chat widget to my Next.js plumbing site, brand color navy, fall back from OpenAI to Groq, and let it take Stripe deposits

The agent calls `scaffold_chatbot` and pastes back a working `knowledge.md`, a `/api/chat` route with the failover chain and the `requestPayment` tool wired to your Stripe link, the `<ChatWidget>` component, and the two env vars to set.

## License

Apache 2.0. Part of [ChatbotLite](https://github.com/agents-io/chatbotlite).
