import { PROVIDERS, ADAPTERS, type AdapterInfo } from "./data.js";

export interface ScaffoldInput {
  businessName: string;
  /** Free-text description of what the business does — becomes the knowledge base seed. */
  description?: string | undefined;
  /** Hex like "#1e3a8a". Defaults to ChatbotLite dark. */
  primaryColor?: string | undefined;
  /** Provider ids in priority order. Defaults to ["openai", "groq"]. */
  providers?: string[] | undefined;
  /** Optional Stripe Payment Link to wire the requestPayment tool. */
  stripePaymentUrl?: string | undefined;
  /** Optional Calendly/Cal.com URL to wire the scheduleCallback tool. */
  schedulingUrl?: string | undefined;
  /** "react" emits a component, "script" emits a plain <script> snippet. */
  target?: "react" | "script" | undefined;
  /** Framework hint for the server route. */
  framework?: "next" | "express" | "hono" | "generic" | undefined;
}

function pickAdapter(url: string, category: AdapterInfo["category"]): AdapterInfo | undefined {
  const host = url.toLowerCase();
  return ADAPTERS.find((a) => {
    if (a.category !== category) return false;
    if (category === "payment") return host.includes("stripe");
    if (category === "scheduling") return host.includes("calendly") || host.includes("cal.com");
    return false;
  });
}

export function buildScaffold(input: ScaffoldInput): string {
  const {
    businessName,
    description = "",
    primaryColor = "#1e3a8a",
    providers = ["openai", "groq"],
    stripePaymentUrl,
    schedulingUrl,
    target = "react",
    framework = "next"
  } = input;

  const validProviders = providers.filter((p) => PROVIDERS.some((x) => x.id === p));
  const chain = (validProviders.length ? validProviders : ["openai", "groq"]).map((id) => {
    const p = PROVIDERS.find((x) => x.id === id)!;
    return { id, model: p.defaultModel, envVar: p.envVar };
  });

  const out: string[] = [];

  out.push(`# ChatbotLite scaffold for "${businessName}"\n`);
  out.push(`Install:\n\n\`\`\`bash\nnpm install chatbotlite\n\`\`\`\n`);

  // 1. knowledge.md
  out.push(`## 1. knowledge.md\n`);
  out.push(`The bot grounds every answer in this file. Write services, hours, pricing in plain markdown — no vector DB needed.\n`);
  out.push("```markdown");
  out.push(`# ${businessName}`);
  if (description) out.push(`\n${description}`);
  out.push(`\n## Services\n- (list your services and prices)\n\n## Hours\n- Mon-Fri 9am-5pm\n\n## Contact\n- (phone / email)`);
  out.push("```\n");

  // 2. server route
  const tools: string[] = [];
  if (stripePaymentUrl) {
    const adapter = pickAdapter(stripePaymentUrl, "payment");
    tools.push(`    requestPayment: ${adapter ? adapter.fn : "stripeLink"}(${JSON.stringify(stripePaymentUrl)}),`);
  }
  if (schedulingUrl) {
    const adapter = pickAdapter(schedulingUrl, "scheduling");
    tools.push(`    scheduleCallback: ${adapter ? adapter.fn : "calendlyUrl"}(${JSON.stringify(schedulingUrl)}),`);
  }
  const adapterImports = [
    stripePaymentUrl ? (pickAdapter(stripePaymentUrl, "payment")?.fn ?? "stripeLink") : null,
    schedulingUrl ? (pickAdapter(schedulingUrl, "scheduling")?.fn ?? "calendlyUrl") : null
  ].filter(Boolean);

  const keyLines = chain.map((c) => `      ${c.id}: process.env.${c.envVar},`).join("\n");
  const chainLines = chain.map((c) => `      { provider: ${JSON.stringify(c.id)}, model: ${JSON.stringify(c.model)} },`).join("\n");

  out.push(`## 2. Server route (\`/api/chat\`)\n`);
  out.push("```ts");
  out.push(`import { ChatBot } from "chatbotlite/client";`);
  out.push(`import { knowledgeFromFile } from "chatbotlite/node";`);
  if (adapterImports.length) out.push(`import { ${adapterImports.join(", ")} } from "chatbotlite/adapters";`);
  out.push("");
  out.push(`const bot = new ChatBot({`);
  out.push(`  knowledge: knowledgeFromFile("./knowledge.md"),`);
  if (tools.length) {
    out.push(`  tools: {`);
    out.push(...tools);
    out.push(`  },`);
  }
  out.push(`  providers: {`);
  out.push(`    keys: {`);
  out.push(keyLines);
  out.push(`    },`);
  out.push(`    chain: [`);
  out.push(chainLines);
  out.push(`    ]`);
  out.push(`  }`);
  out.push(`});`);
  out.push("");
  out.push(serverHandler(framework));
  out.push("```\n");

  // 3. widget
  out.push(`## 3. Widget (client)\n`);
  if (target === "script") {
    out.push("Plain `<script>` tag — works on Shopify, WordPress, Webflow, any static HTML:\n");
    out.push("```html");
    out.push(`<script src="https://unpkg.com/chatbotlite/dist/embed.global.js"></script>`);
    out.push(`<script>`);
    out.push(`  chatbotlite.mount({`);
    out.push(`    endpoint: "/api/chat",`);
    out.push(`    title: ${JSON.stringify(businessName)},`);
    out.push(`    theme: { primary: ${JSON.stringify(primaryColor)} }`);
    out.push(`  });`);
    out.push(`</script>`);
    out.push("```\n");
  } else {
    out.push("React component:\n");
    out.push("```tsx");
    out.push(`import { ChatWidget } from "chatbotlite/react";`);
    out.push("");
    out.push(`<ChatWidget`);
    out.push(`  endpoint="/api/chat"`);
    out.push(`  title=${JSON.stringify(businessName)}`);
    out.push(`  theme={{ primary: ${JSON.stringify(primaryColor)} }}`);
    out.push(`/>`);
    out.push("```\n");
  }

  // 4. env keys
  out.push(`## 4. Environment variables\n`);
  out.push("Add these to `.env` (keys stay server-side, never exposed to the browser):\n");
  out.push("```bash");
  for (const c of chain) out.push(`${c.envVar}=...`);
  out.push("```\n");

  out.push(`Top-to-bottom in \`chain\` is priority. On a 429/5xx the next provider takes over automatically. That's the failover.`);

  return out.join("\n");
}

function serverHandler(framework: ScaffoldInput["framework"]): string {
  switch (framework) {
    case "express":
      return [
        `app.post("/api/chat", async (req, res) => {`,
        `  const { message, transcript } = req.body;`,
        `  res.setHeader("Content-Type", "text/event-stream");`,
        `  const stream = await bot.replyStream(message, { history: transcript });`,
        `  stream.pipe(res);`,
        `});`
      ].join("\n");
    case "hono":
      return [
        `app.post("/api/chat", async (c) => {`,
        `  const { message, transcript } = await c.req.json();`,
        `  return new Response(await bot.replyStream(message, { history: transcript }), {`,
        `    headers: { "Content-Type": "text/event-stream" }`,
        `  });`,
        `});`
      ].join("\n");
    default: // next / generic — Web Response
      return [
        `export async function POST(req: Request) {`,
        `  const { message, transcript } = await req.json();`,
        `  return new Response(await bot.replyStream(message, { history: transcript }), {`,
        `    headers: { "Content-Type": "text/event-stream" }`,
        `  });`,
        `}`
      ].join("\n");
  }
}
