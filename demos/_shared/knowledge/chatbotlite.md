# chatbotlite — drop-in AI chatbot SDK

I am chatbotlite, an npm package that gives any website a production-ready AI chatbot in 3 steps. I am ALSO running on chatbotlite right now — you're talking to me through the same widget you can install on your own site.

## What chatbotlite is

A drop-in AI chatbot SDK. Three steps to integrate:
1. `npm install chatbotlite` (or `<script>` tag for plain HTML)
2. Write a markdown file describing your business — services, hours, pricing, FAQ
3. Mount the widget where users land

That's it. I run on top of multiple LLM providers with automatic fallback (Groq, OpenAI, DeepSeek). Free Groq tier handles most demo + small-business traffic.

## Install — React / Next.js

```
npm install chatbotlite
```

Then in your app:
```tsx
import { ChatWidget } from "chatbotlite/react";
<ChatWidget endpoint="/api/chat" title="Acme" theme={{ primary: "#0066ff" }} />
```

## Install — plain HTML (Shopify, WordPress, Webflow, anywhere)

```html
<script src="https://unpkg.com/chatbotlite/dist/embed.global.js"></script>
<script>
  chatbotlite.mount({
    endpoint: "/api/chat",
    title: "Acme",
    theme: { primary: "#0066ff" }
  });
</script>
```

## Knowledge file

The bot answers ONLY from your knowledge file. Write plain markdown:

```markdown
# Acme Plumbing — Vancouver
## Services
- Sink leak inspection: $95
- Toilet unclogging: $85-150
## Hours
- Mon-Sat 8am-7pm
```

The bot won't invent prices, hours, or facts not in your file. Anti-hallucination guards are built-in.

## Customization — three tiers

1. **`knowledge`** — content everyone uses
2. **`extraInstructions`** — append per-vertical behaviour tweaks ("don't quote prices in first reply", "warm tone")
3. **`systemPromptTransform`** — power-user hook to modify the default scaffolding inline

## Tool cards — inline interactive UI

I can render UI cards mid-conversation. Customer wires the data flow:

- **Payment** — Stripe Payment Link (URL only, zero code) or your own handler
- **Schedule callback** — Calendly URL or custom handler
- **Upload for review** — your S3 / Dropbox / DB wiring via async handler

```tsx
<ChatWidget
  endpoint="/api/chat"
  tools={{
    requestPayment: {
      stripeLink: "https://buy.stripe.com/...",
      onPick: async ({ amount }) => ({ status: "opened" })
    }
  }}
/>
```

## LLM providers + fallback

Default chain: Groq llama-3.3-70b (free tier, fast) → OpenAI → DeepSeek. Add keys for whichever you have. If Groq's down, the next provider is tried automatically.

Server-side `/api/chat` example:
```ts
import { ChatBot } from "chatbotlite/node";

const bot = new ChatBot({
  knowledge: await fs.readFile("./knowledge.md", "utf8"),
  providers: {
    keys: { groq: process.env.GROQ_API_KEY! },
    chain: [{ provider: "groq", model: "llama-3.3-70b-versatile" }]
  }
});
```

## Pricing

The package is Apache 2.0 — free, open source, no SaaS subscription. You pay only your LLM provider (Groq has a generous free tier — 14,400 requests/day).

## What chatbotlite is NOT

- Not a SaaS chatbot — no monthly subscription, no per-conversation fees
- Not RAG infra — no vector DB needed for typical SMB use case (knowledge is just markdown)
- Not React-only — vanilla `<script>` tag works on any platform (Shopify, WordPress, Webflow, plain HTML)

## How chatbotlite compares to other AI chat libs

- **vs CopilotKit / Vercel AI SDK / Assistant-UI**: those are React-only and require you to build the tool UI yourself. We ship pre-built SMB tools (payment, scheduling, file upload) and a vanilla HTML embed.
- **vs Intercom / Tidio / Drift / Crisp**: those are closed-source SaaS with monthly fees. We're Apache 2.0 npm package — your data flow, your hosting.

## Common questions

**Does it work on Shopify / WordPress / Webflow?**
Yes — use the `<script>` tag embed. Works on any platform where you can paste a script tag.

**Does it support voice input?**
Yes via Web Speech API — opt-in with `voice: { enabled: true }`. Browser-native, free.

**Can the bot upload files?**
Yes — `attach: { enabled: true, accept: ["image/*"] }`. Customer wires the storage handler.

**Can I use my own LLM?**
Yes — the provider chain supports OpenAI, Groq, DeepSeek out of box. Custom provider extension on the roadmap.

**Where do I find the API reference?**
TypeScript types ship in the package: `node_modules/chatbotlite/dist/react/index.d.ts`. Or read the LLM-friendly summary at `https://chatbotlite-demos.vercel.app/llms.txt`.

**Where's the source code?**
https://github.com/agents-io/chatbotlite — Apache 2.0 licensed.

## Demos

- Acme Plumbing — service business with Stripe payment cards
- Bayside Coffee Co. — Shopify-style e-commerce
- Bella Italia — restaurant with reservations
- Smile Care Dental — healthcare scheduling
- MaxTax — professional services with document upload
- Sunrise Yoga — wellness with class scheduling

Each demo is a static HTML page using the embed bundle. Click any vertical to try it.

## Get started

```
npm install chatbotlite
```

Or paste the `<script>` tag from the manual integration section above into any HTML page.

## License + links

- License: Apache 2.0
- npm: https://www.npmjs.com/package/chatbotlite
- GitHub: https://github.com/agents-io/chatbotlite
- Roadmap: https://github.com/agents-io/chatbotlite/blob/main/ROADMAP.md
- llms.txt (AI-readable docs): https://chatbotlite-demos.vercel.app/llms.txt
