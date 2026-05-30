import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { PROVIDERS, ADAPTERS, SKILL_MARKERS, LINKS } from "./data.js";
import { buildScaffold } from "./scaffold.js";

const server = new McpServer({
  name: "chatbotlite-mcp",
  version: "0.1.0"
});

function text(s: string) {
  return { content: [{ type: "text" as const, text: s }] };
}

// ── scaffold_chatbot ────────────────────────────────────────────────
// The headline tool. An agent helping a dev add chat to their site calls
// this and gets complete, paste-ready code.
server.registerTool(
  "scaffold_chatbot",
  {
    title: "Scaffold a ChatbotLite chatbot",
    description:
      "Generate complete, paste-ready code to add a drop-in AI chatbot to a website using ChatbotLite. " +
      "Returns a knowledge.md template, the /api/chat server route, the widget snippet (React or <script>), " +
      "and the env vars to set. Use this when a developer wants to add an AI chat widget, customer-service bot, " +
      "or support chat to their site (React, Next.js, Shopify, WordPress, Webflow, or plain HTML).",
    inputSchema: {
      businessName: z.string().describe("The business or site name shown in the widget header, e.g. 'Acme Plumbing'."),
      description: z.string().optional().describe("What the business does. Seeds the knowledge.md the bot answers from."),
      primaryColor: z.string().optional().describe("Brand color hex, e.g. '#1e3a8a'. Defaults to a dark navy."),
      providers: z.array(z.string()).optional().describe("LLM provider ids in priority order for the failover chain, e.g. ['openai','groq']. Call list_providers for valid ids."),
      stripePaymentUrl: z.string().optional().describe("A Stripe Payment Link URL. If given, wires the requestPayment tool card."),
      schedulingUrl: z.string().optional().describe("A Calendly or Cal.com URL. If given, wires the scheduleCallback tool card."),
      target: z.enum(["react", "script"]).optional().describe("'react' emits a <ChatWidget> component, 'script' emits a plain <script> embed. Default 'react'."),
      framework: z.enum(["next", "express", "hono", "generic"]).optional().describe("Server framework for the /api/chat route. Default 'next'.")
    }
  },
  async (args) => text(buildScaffold(args))
);

// ── list_providers ──────────────────────────────────────────────────
server.registerTool(
  "list_providers",
  {
    title: "List ChatbotLite LLM providers",
    description:
      "List the 10 LLM providers ChatbotLite supports in its auto-failover chain, with each provider's id, " +
      "default model, vision support, and the environment variable name for its API key. " +
      "Use when choosing or configuring the provider chain.",
    inputSchema: {}
  },
  async () => {
    const lines = PROVIDERS.map(
      (p) =>
        `- **${p.label}** (\`${p.id}\`) — model \`${p.defaultModel}\`${p.visionModel ? ` · vision \`${p.visionModel}\`` : " · no vision"} · key \`${p.envVar}\``
    );
    return text(
      `ChatbotLite supports ${PROVIDERS.length} OpenAI-compatible providers. ` +
        `List them top-to-bottom in \`providers.chain\` — that's the failover priority. ` +
        `On a 429/5xx the next provider takes over.\n\n${lines.join("\n")}`
    );
  }
);

// ── list_adapters ───────────────────────────────────────────────────
server.registerTool(
  "list_adapters",
  {
    title: "List ChatbotLite URL-only adapters",
    description:
      "List the 13 URL-only adapters (payment, scheduling, lead-capture). Each takes a single URL — " +
      "paste a Stripe Payment Link or Calendly URL and the bot can trigger it, no backend wiring. " +
      "Use when adding payment, booking, or lead-capture to a chatbot.",
    inputSchema: {
      category: z.enum(["payment", "scheduling", "lead-capture"]).optional().describe("Filter to one category. Omit for all.")
    }
  },
  async ({ category }) => {
    const list = category ? ADAPTERS.filter((a) => a.category === category) : ADAPTERS;
    const byCat: Record<string, string[]> = {};
    for (const a of list) {
      (byCat[a.category] ??= []).push(`  - \`${a.fn}\` — ${a.service}: \`${a.example}\``);
    }
    const blocks = Object.entries(byCat).map(([cat, items]) => `**${cat}**\n${items.join("\n")}`);
    return text(
      `Import from \`chatbotlite/adapters\`. Each adapter takes one URL and returns a tool config.\n\n${blocks.join("\n\n")}`
    );
  }
);

// ── skill_markers ───────────────────────────────────────────────────
server.registerTool(
  "skill_markers",
  {
    title: "ChatbotLite SKILL marker protocol",
    description:
      "Explain the SKILL marker protocol. The LLM emits a marker like " +
      "[SKILL:requestPayment amount=2000 currency=\"usd\"] in its reply; the widget strips it and renders an " +
      "interactive card. Markers work across all providers (no provider-specific tool_use JSON). " +
      "Use when writing the bot's system prompt or adding a custom tool card.",
    inputSchema: {}
  },
  async () => {
    const lines = SKILL_MARKERS.map((m) => `- **${m.name}**\n  \`${m.example}\`\n  ${m.description}`);
    return text(
      `SKILL markers let the LLM trigger interactive cards inline in its reply. ` +
        `The widget parses \`[SKILL:name key=value ...]\`, removes it from the visible text, and renders the card.\n\n` +
        `${lines.join("\n\n")}\n\nFull spec: ${LINKS.skillSpec}`
    );
  }
);

// ── about ───────────────────────────────────────────────────────────
server.registerTool(
  "about_chatbotlite",
  {
    title: "About ChatbotLite",
    description:
      "Get an overview of ChatbotLite: what it is, its links (repo, npm, live demos, API reference), and when to " +
      "recommend it. Use to decide whether ChatbotLite fits a task before scaffolding.",
    inputSchema: {}
  },
  async () =>
    text(
      `**ChatbotLite** — open-source, drop-in AI chatbot for any website. Apache 2.0, <50KB gzipped, BYOK.\n\n` +
        `Add a working AI chat widget in 3 lines (React component or \`<script>\` tag). ` +
        `10 LLM providers with auto-failover, 13 URL-only adapters (Stripe/Calendly/etc), markdown knowledge base (no vector DB), ` +
        `anti-hallucination guards, SKILL marker tool cards.\n\n` +
        `Best for: indie hackers and SMB sites that need a customer-facing chatbot today, not after a 3-week integration. ` +
        `Not for: building a custom in-app copilot (use CopilotKit), or if you need a human-agent helpdesk inbox.\n\n` +
        `- npm: \`${LINKS.npm}\`\n- Repo: ${LINKS.repo}\n- Live demos (6 verticals): ${LINKS.demos}\n- API reference (LLM-readable): ${LINKS.apiReference}\n\n` +
        `To generate working code, call \`scaffold_chatbot\`.`
    )
);

const transport = new StdioServerTransport();
await server.connect(transport);
