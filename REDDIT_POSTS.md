# ChatbotLite — Reddit launch playbook

Based on patterns from successful OSS launches: CopilotKit v2 (197 pts), Plasmo (132 pts), Resend Launch HN (432 pts), Chatwoot (~110 comments), Onyx YC W24 (254 pts).

**Core patterns**: One concrete opening sentence, 1-paragraph origin story, 250-450 words, humble-confident tone, specific ask. Founder must reply in comments within 15 minutes for first 2 hours.

---

## Post 1 — r/SideProject

**Title**: I spent two weekends building a chatbot widget so I'd never pay Intercom $39/seat again

**Body**:

I run a few small side projects and every time I wanted to add a chat widget the options were Intercom ($39 per seat), Tidio ($29/mo), Drift ($0.99 per resolution), or Crisp (€95/mo for the useful tier). For a side project with three users this is absurd.

So I built ChatbotLite. Apache 2.0, npm, 3 lines of code. You bring your own LLM key (OpenAI, Anthropic, Groq, whatever) and pay the model provider directly. I never proxy your traffic.

What's in it:

- 11 LLM providers with auto-failover. If OpenAI 500s mid-stream, it picks up on Groq without losing tokens already streamed to the user
- 13 URL-only adapters. Paste a Stripe Payment Link, Calendly URL, PayPal, Cal.com — the bot knows how to use it. No SDK wiring
- A markdown file for the knowledge base. No vector DB, no embeddings pipeline, no Pinecone bill
- Phrase redlines + optional LLM judges for hallucination guards
- <50KB gzipped
- Sessions persist; storage is a pluggable interface so you can swap localStorage for Postgres

There are 6 live demos — plumber, restaurant, coffee shop, dentist, tax prep, yoga studio — each with its own poster background. I built them mostly to prove the same widget actually fits different verticals without forking.

Demos: https://chatbotlite-demos.vercel.app
GitHub: https://github.com/agents-io/chatbotlite (just shipped)
npm: `chatbotlite@0.7.22`

Honest ask: which of the 6 demo verticals looks the most useless? I want to cull one and replace it with something people actually need. Roast the worst one.

---

## Post 2 — r/webdev

**Title**: Open-source alternative to Intercom/Tidio/Drift — math on why SaaS chat pricing stopped making sense

**Body**:

Quick napkin math that pushed me to build this. A side project doing 10k visitors a month, say 200 chats:

- Intercom: $39/seat/mo, more for the AI add-on
- Tidio: $29/mo base, jumps fast with operators
- Drift: $0.99 per resolution = ~$200/mo at that volume
- Crisp: €95/mo for the tier with actual integrations

Now the same workload with your own OpenAI key on gpt-4o-mini: 200 chats × ~3k tokens × $0.15/M ≈ **9 cents a month**. Even on full gpt-4o you're under $5.

The reason SaaS chat pricing didn't collapse with LLMs is that nobody shipped a serious open-source widget. So I shipped one.

ChatbotLite is a `<script>` tag or a React component. BYOK — your LLM key sits in your env, the widget calls the provider directly through your `/api/chat` route. I never see your traffic.

Things I cared about while building:

- Provider failover that actually works mid-stream. If OpenAI dies after 40 tokens, the next provider continues from token 41. No "sorry, something went wrong, restart"
- 13 URL-only "skills" — drop a Stripe Payment Link or Calendly URL in config, done. No webhook setup, no OAuth dance
- Anti-hallucination: phrase redlines (hard block) + optional LLM judges (soft check) so the bot can't promise things it shouldn't
- The knowledge base is one markdown file. I am tired of vector DBs for side projects
- Apache 2.0, <50KB gzipped

Repo: https://github.com/agents-io/chatbotlite
Demos (6 verticals, real LLM): https://chatbotlite-demos.vercel.app
npm: `chatbotlite`

Question for this sub: what's the one chat widget feature your clients keep asking for that no SaaS does well? I'd rather build the unsexy one everybody actually needs than another "AI agent that books your meetings".

---

## Post 3 — r/reactjs

**Title**: Built a 3-line React chat widget with provider failover. Want feedback on the API shape.

**Body**:

I shipped a React component called ChatbotLite and I want eyes on the API before I lock it into 1.0.

The basic usage:

```tsx
import { ChatWidget } from "chatbotlite/react";

<ChatWidget endpoint="/api/chat" title="Acme Plumbing" />
```

That's the floor. Everything else is opt-in.

The pieces I'd love a sanity check on:

**1. Provider failover.** I have one config block on the server that takes an ordered list of providers. If a stream fails partway, the next provider picks up from the last token, not from scratch. 11 providers supported. Is this the right shape, or do people want per-message routing instead?

```ts
import { ChatBot } from "chatbotlite/client";

const bot = new ChatBot({
  knowledge: knowledgeFromFile("./knowledge.md"),
  providers: {
    keys: {
      openai: process.env.OPENAI_API_KEY,
      groq:   process.env.GROQ_API_KEY,
    },
    chain: [
      { provider: "openai", model: "gpt-4o-mini" },
      { provider: "groq",   model: "llama-3.3-70b-versatile" },
    ]
  }
});
```

**2. Skills via markers.** Tool cards are rendered when the LLM emits `[SKILL:requestPayment amount=2000 currency="usd"]` in the stream. The protocol is public — anyone can write an adapter. 13 URL-only adapters ship in the box (Stripe Payment Link, Calendly, PayPal, Cal.com etc — you literally paste a URL into config).

**3. Storage.** I went with a `ChatStorage` interface — `localStorage` default, swap in your own (Postgres, Redis, IndexedDB). Did I over-abstract? Should I just ship localStorage and a hook for "onMessage"?

```tsx
<ChatWidget endpoint="/api/chat" sessionId={userId} storage={myDbStorage} />
```

**4. Knowledge base.** One markdown file, no vector DB. For SMB use cases the whole KB fits in context. Am I going to regret this at 50k tokens?

Other facts: Apache 2.0, <50KB gzipped, BYOK (never proxied), also ships as a `<script>` tag for non-React sites. 6 live demos at https://chatbotlite-demos.vercel.app.

Repo: https://github.com/agents-io/chatbotlite
npm: `chatbotlite@0.7.22`

Specifically asking: is the `providers.chain` array the right abstraction, or should failover be a separate hook? I'll change it now if there's a better pattern.

---

## Posting order (3-4 day cadence, never same day)

1. **r/reactjs first** (Tue or Wed, 9-11am ET) — tightest community, highest signal. The API-feedback framing makes it OK for self-promo even in strict subs. If it lands you get technical credibility for the others.
2. **r/SideProject 24-48h later** — broader, more forgiving, rewards the personal/founder angle. By then you'll have 1-2 stars and maybe an issue, which makes the post feel real.
3. **r/webdev 24-48h after that** — the price-comparison framing works best when you can already say "since launching N days ago, X people have tried it".

**Never** cross-post identical content. Reddit downranks duplicate text.

---

## Pre-drafted replies to anticipated comments

**Q: "How is this different from CopilotKit / assistant-ui / Vercel AI SDK?"**

> CopilotKit and assistant-ui are toolkits — you assemble the UX. ChatbotLite is the assembled widget: one component, one config, done. Vercel AI SDK is the model layer underneath. None of them ship URL-only Stripe/Calendly adapters or mid-stream failover out of the box. I'd actually recommend CopilotKit if you want to build a custom in-app copilot.

**Q: "BYOK means the API key is in the browser?"**

> No. The widget posts to your `/api/chat` route; the key lives server-side in your env. The `<script>` tag flow is the same — you still need a `/api/chat` route. README has a one-pager. Never paste an LLM key into client code.

**Q: "Why no vector DB?"**

> For the use cases I'm targeting — SMB sites, 5-50 page knowledge bases — the whole thing fits in a 32k context window cheaper than running embeddings. If your KB is 500 pages you're not my user yet. RAG hooks are on the 0.8 roadmap when there's real demand.

**Q: "Does the failover actually work mid-stream? Sounds hard."**

> It's the part I spent the most time on. The stream resumer tracks the last successfully delivered token, and on failure it injects "continue from: …" into the next provider's prompt. There's a regression test in the repo. Edge case still open: if the first provider produced tool-call markers before failing, the second provider sees them as user context.

**Q: "Apache 2.0 why not MIT?"**

> Patent grant. For something that touches payment links and integrations I wanted explicit patent coverage. No deeper reason.

**Q: "Just launched, 0 stars — looks suspicious."**

> Yeah, I literally pushed this last week. If you star it that helps; if you find a bug an issue helps more.

**Q: "What if you stop maintaining it?"**

> Apache 2.0, <50KB of code, one markdown KB file. The escape hatch is "keep using the version you forked." I'd rather build something you can walk away from than lock you into my hosting.

---

## Don't do

- Don't ask for stars in the post body. If someone asks how to support, mention it then.
- Don't post Sat/Sun. Weekday morning ET catches the largest engaged audience.
- Don't argue with the troll who says "another chatbot, original". Upvote them and move on.
- Don't reply with marketing fluff. Specific numbers, specific limits, specific tradeoffs.

## Block 3 hours after each post

Reply within 15 minutes to every comment for the first 2 hours. Founder presence is the single biggest engagement multiplier across every launch I read.

---

## Sources

- [Show HN: CopilotKit v2 (Dec 2023, 197 pts, 67 comments)](https://news.ycombinator.com/item?id=38545207)
- [Launch HN: Resend (Jun 2023, 432 pts, 270 comments)](https://news.ycombinator.com/item?id=36309120)
- [Launch HN: Chatwoot (Mar 2021, ~110 comments)](https://news.ycombinator.com/item?id=26501527)
- [Show HN: Plasmo (Jun 2022, 132 pts, 37 comments)](https://news.ycombinator.com/item?id=31609896)
- [Launch HN: Onyx YC W24 (2025, 254 pts, 160 comments)](https://news.ycombinator.com/item?id=46045987)
