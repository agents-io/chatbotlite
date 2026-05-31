---
name: chatbotlite
description: Use when adding an AI chatbot, customer-service chat, or support widget to a website (React, Next.js, Shopify, WordPress, Webflow, or plain HTML) with the chatbotlite npm package. Covers the ChatWidget component, the script-tag embed, the server-side ChatBot client, the /api/chat SSE route, multi-provider failover (OpenAI/Groq/+8), the markdown knowledge base, and URL-only payment/scheduling adapters (Stripe, Calendly).
license: Apache-2.0
metadata:
  package: chatbotlite
  homepage: https://github.com/agents-io/chatbotlite
---

# ChatbotLite — add an AI chatbot to any site

Drop-in AI chat widget. Three pieces: a client widget, a `/api/chat` server route, and a markdown knowledge file. Apache-2.0, BYOK (the user brings their own LLM key).

## When to use this skill
The user wants to add an AI chatbot / support chat / customer-service widget to a website, or is working in a project that already depends on `chatbotlite`.

## 1. Widget (client)

React:
```tsx
import { ChatWidget } from "chatbotlite/react";

<ChatWidget endpoint="/api/chat" title="Acme Plumbing" theme={{ primary: "#1e3a8a" }} />
```

Non-React (Shopify, WordPress, Webflow, static HTML):
```html
<script src="https://unpkg.com/chatbotlite/dist/embed.global.js"></script>
<script>chatbotlite.mount({ endpoint: "/api/chat", title: "Acme Plumbing" })</script>
```

## 2. Server route (`/api/chat`)

```ts
import { ChatBot } from "chatbotlite/client";
import { knowledgeFromFile } from "chatbotlite/node";

const bot = new ChatBot({
  knowledge: knowledgeFromFile("./knowledge.md"),   // required, a markdown string
  providers: {
    keys: { openai: process.env.OPENAI_API_KEY, groq: process.env.GROQ_API_KEY },
    chain: [                                          // ordered failover, top first
      { provider: "openai", model: "gpt-4o-mini" },
      { provider: "groq",   model: "llama-3.3-70b-versatile" },
    ],
  },
});

// Next.js / Web Response handler:
export async function POST(req: Request) {
  const { message, transcript } = await req.json();
  return new Response(await bot.replyStream(message, { history: transcript }), {
    headers: { "Content-Type": "text/event-stream" },
  });
}
```

`replyStream(message, { history })` returns a `ReadableStream` (SSE). `history` is an array of `{ role, content }` messages.

## 3. Knowledge base
One markdown file (services, hours, pricing). No vector DB, no embeddings. The bot grounds answers in it.

## Providers (failover chain)
10 OpenAI-compatible providers: `openai`, `groq`, `deepseek`, `gemini`, `mistral`, `fireworks`, `cerebras`, `sambanova`, `openrouter`, `moonshot`. The `chain` is priority order; on 429/5xx the next provider takes over. There is **no** per-message routing option — don't invent one. No `anthropic` entry in the chain (native API differs).

## Adapters (payment / scheduling / lead capture)
URL-only — paste a URL, the bot can trigger it. Import from `chatbotlite/adapters`:
```ts
import { stripeLink, calendlyUrl } from "chatbotlite/adapters";
<ChatWidget endpoint="/api/chat" tools={{
  requestPayment: stripeLink("https://buy.stripe.com/..."),
  scheduleCallback: calendlyUrl("https://calendly.com/.../30min"),
}} />
```
Payment: `stripeLink`, `paypalLink`, `squareLink`, `lemonSqueezyLink`, `gumroadLink`.
Scheduling: `calendlyUrl`, `calcomUrl`, `savvycalUrl`, `acuityUrl`, `msBookingsUrl`, `googleCalendarApptUrl`.
Lead capture: `formspreeUrl`, `tallyUrl`.

## Tool cards (SKILL markers)
The LLM emits `[SKILL:requestPayment amount=2000 currency="usd"]` inline; the widget strips it and renders a card. Built-in: `requestPayment`, `scheduleCallback`, `uploadForReview`, `pickerMessage`.

## Gotchas
- LLM keys stay server-side (env), never in client code.
- `knowledge` must be a non-empty markdown string, not a file path passed directly to `ChatBot`.
- `<50KB` gzipped, Apache-2.0, BYOK.

Full API reference: https://chatbotlite-demos.vercel.app/llms-full.txt
