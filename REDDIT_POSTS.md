# ChatbotLite — Reddit launch playbook

Released under **agents.io** brand. Positioning: lightweight dev SDK / drop-in widget. Peer category: CopilotKit, assistant-ui, Vercel AI SDK, LiteLLM. (Not "OSS alternative to Intercom" — that's a different audience.)

Based on patterns from CopilotKit v2 (197 pts), Plasmo (132 pts), Resend Launch HN (432 pts), Chatwoot (~110 comments), Onyx YC W24 (254 pts).

---

## Post 1 — r/reactjs

**Title**: Open-sourced our React chat widget — looking for API feedback before 1.0

**Body**:

We at agents.io just open-sourced ChatbotLite, the AI chat widget we built for our customer-facing tools. It ships as a React component (and a plain `<script>` tag for non-React sites). We want eyes on the API before locking it into 1.0.

The basic usage:

```tsx
import { ChatWidget } from "chatbotlite/react";

<ChatWidget endpoint="/api/chat" title="Acme Plumbing" />
```

That's the floor. Everything else is opt-in. The pieces we'd love a sanity check on:

**1. Provider failover.** The server-side `ChatBot` class takes an ordered chain. If a stream fails mid-token, the next provider resumes from where the first one stopped. 11 providers supported (OpenAI, Anthropic, Groq, DeepSeek, Gemini, Mistral, Fireworks, Cerebras, SambaNova, OpenRouter, Moonshot). Is `providers.chain: [...]` the right shape, or do people prefer per-message routing?

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

**2. Skill markers.** Tool cards render when the LLM emits `[SKILL:requestPayment amount=2000 currency="usd"]` in the stream. Protocol is public (SKILL_MARKER_SPEC.md) — anyone can write adapters for other libraries. 13 URL-only adapters ship out of the box: Stripe Payment Link, Calendly, PayPal, Cal.com, Acuity, etc. Paste a URL into config and the bot can use it.

**3. Storage.** `ChatStorage` interface with `localStorage` default; swap in Postgres/Redis/IndexedDB. Possibly over-abstracted — should we just ship localStorage and a single `onMessage` hook?

```tsx
<ChatWidget endpoint="/api/chat" sessionId={userId} storage={myDbStorage} />
```

**4. Knowledge base.** One markdown file, no vector DB. For most SMB use cases the whole thing fits in a 32k context. Will this fall apart at 50k tokens?

Other facts: Apache 2.0, <50KB gzipped, BYOK (we never proxy your traffic), 6 live demos at https://chatbotlite-demos.vercel.app.

Repo: https://github.com/agents-io/chatbotlite
npm: `chatbotlite@0.7.22`

Specifically asking: is `providers.chain` the right abstraction, or should failover be its own hook? We'll change it now if there's a better pattern.

---

## Post 2 — r/webdev

**Title**: We open-sourced our chatbot SDK — drops into any site as `<script>` tag or React component

**Body**:

We at agents.io just open-sourced ChatbotLite. It's the widget we built internally for our customer-facing chat. Apache 2.0, npm, BYOK (you bring the LLM key, we never proxy traffic).

The market has good toolkits (CopilotKit, assistant-ui) and a great model layer (Vercel AI SDK, LiteLLM). What was missing for us was a fully assembled widget you can drop in and ship the same afternoon. So we shipped one.

Also relevant if you're shipping for SMB clients — instead of charging them $39/seat for Intercom or $29/mo for Tidio, they bring their own OpenAI/Groq key and pay the model provider directly (typically <$5/mo at SMB volume). The widget is free forever.

Three lines on a static site:

```html
<script src="https://unpkg.com/chatbotlite/dist/embed.global.js"></script>
<script>
  chatbotlite.mount({ endpoint: "/api/chat", title: "Acme Plumbing" });
</script>
```

Or as a React component:

```tsx
import { ChatWidget } from "chatbotlite/react";
<ChatWidget endpoint="/api/chat" title="Acme Plumbing" />
```

What's in it:

- **11 LLM providers with mid-stream failover.** OpenAI 500s after 40 tokens, the next provider continues from token 41. Configured server-side as an ordered chain
- **13 URL-only skill adapters.** Drop a Stripe Payment Link or Calendly URL into config and the bot knows how to use it. No webhook wiring, no OAuth dance
- **Markdown knowledge base.** Hours, pricing, services in a `.md` file. No vector DB, no embeddings pipeline. RAG hooks on the 0.8 roadmap when demand justifies it
- **Anti-hallucination guards.** Phrase redlines (hard block) + optional LLM judges (soft check). Keeps the bot from promising things it shouldn't
- **Session persistence.** Pluggable `ChatStorage` interface, `localStorage` default
- **<50KB gzipped.** Apache 2.0

6 live demos with real LLM calls: https://chatbotlite-demos.vercel.app

Repo: https://github.com/agents-io/chatbotlite
npm: `chatbotlite@0.7.22`

Genuine question for this sub: what's the one chat widget feature your clients keep asking for that no library does well? We'd rather build the unsexy one everyone actually needs than another "AI agent that books your meetings".

---

## Post 3 — r/opensource (recommended) OR r/SideProject

**Title**: Releasing ChatbotLite — open-source AI chat widget with 11 LLM provider failover

**Body**:

agents.io just open-sourced ChatbotLite under Apache 2.0.

It's the AI chat widget we built for our own customer-facing tools. We're releasing it because the existing options weren't right for us. We needed something fully assembled (not a toolkit you assemble yourself), something that worked outside React (plain `<script>` tag), and mid-stream provider failover — none of which were available off the shelf.

What it does:

- Drop-in chat widget for any website (React component or `<script>` tag, your choice)
- 11 LLM providers with auto-failover. If OpenAI dies mid-stream, the next provider continues from the last token
- 13 URL-only "skill" adapters — Stripe Payment Link, Calendly, PayPal, Cal.com, Acuity, etc. Paste URL, done
- Markdown knowledge base, no vector DB
- Anti-hallucination guards: phrase redlines + optional LLM judges
- BYOK — your LLM key lives in your env, we never see your traffic
- Session persistence with pluggable storage interface
- <50KB gzipped

What's intentionally out of scope (for now):
- Human handoff / live agent inbox
- Vector RAG (markdown KB works up to ~50KB; vector hooks come in 0.8)
- Conversation analytics dashboard
- Multi-language UI localisation

We built 6 demo verticals (plumber, restaurant, coffee, dentist, tax prep, yoga) to prove the same widget fits without forking. Each has a custom illustrated poster background. Live at https://chatbotlite-demos.vercel.app

Repo: https://github.com/agents-io/chatbotlite
npm: `chatbotlite@0.7.22`
SKILL marker protocol: public spec in the repo — anyone can write adapters

What helps most:
- Bug reports, especially edge cases in provider failover
- New URL-only adapters — the pattern is "user pastes a URL, we open it"
- If you've shipped a chatbot recently and something broke, the war story is useful to us

---

## Post 4 — r/Entrepreneur / r/SmallBusiness / r/shopify / r/WordPress

For business-owner audiences who run their own site (not devs).

**Title**: We just open-sourced a chatbot for your site — bring your own ChatGPT key instead of paying Intercom $39/seat

**Body**:

If you run a small business website and you've been quoted $39/seat/mo for Intercom, $29/mo for Tidio, or per-conversation pricing from Drift — there's now a free option.

agents.io just open-sourced ChatbotLite. The widget is free forever (Apache 2.0). You bring your own OpenAI/Anthropic/Groq API key and pay the model provider directly. At small-business volume (a few hundred chats a month) that's typically under $5/mo.

How small business owners use it:

- Pop it into your **Shopify** theme, **WordPress** site, **Squarespace**, **Wix**, **Webflow**, **Ghost**, or any plain HTML with a `<script>` tag. Three lines of code
- Write your services / hours / pricing / FAQ in a markdown file. The bot grounds every answer in it (no random hallucinations about prices you don't charge)
- Drop in your Stripe Payment Link or Calendly URL — the bot can take deposits and book appointments
- Anti-hallucination guards stop it from confirming bookings or guaranteeing prices it shouldn't

What this is not:
- It's not a human helpdesk inbox. If you need a team of agents handling tickets, get Intercom
- It's not zero-config. You need to paste an API key from OpenAI (10 minutes) and host a small server route (Vercel/Netlify free tier works)
- Comfortable with pasting code into your theme? You're good. Never opened a code editor? Get a freelancer for an hour to install it once

Comparison table on our landing page (https://chatbotlite-demos.vercel.app) — scroll to "Why not just use a SaaS chatbot?"

6 live demos for typical small businesses: plumber, restaurant, coffee shop, dentist, tax preparer, yoga studio. Click any of them at the link above and try the bot in the bottom-right.

Repo: https://github.com/agents-io/chatbotlite
npm: `chatbotlite@0.7.22`

Question for this sub: if you've paid SaaS chat for the last year, what's the one thing you wished the chatbot did automatically that it didn't? We're building from real complaints.

---

## Sub choice for Post 3

Recommend **r/opensource** over r/SideProject for the company-release framing. r/SideProject's audience is wired for solo founder stories; posting "agents.io released our internal SDK" reads slightly off there.

Alternative subs to consider:
- **r/LocalLLaMA** — fits if we lead with the multi-provider/BYOK angle. Tougher crowd, higher technical bar
- **r/programming** — broad, hard to land traction
- **r/typescript** — narrower but high-signal, fits since the SDK is fully typed
- **r/selfhosted** — fits the BYOK angle, audience overlaps with r/opensource

---

## Posting order (3-4 day cadence)

**Dev track** (r/reactjs, r/opensource, r/webdev) — for the developer audience comparing us to peer SDKs:

1. **r/reactjs first** (Tue/Wed, 9-11am ET) — API-feedback framing
2. **r/opensource 24-48h later** — clean company OSS announcement
3. **r/webdev 24-48h after that** — comparison-vs-toolkits framing

**Business-owner track** (r/Entrepreneur, r/SmallBusiness, r/shopify, r/WordPress) — for SMB owners DIY-ing their own site:

4. **r/SmallBusiness** or **r/Entrepreneur** — lead with the pricing pain (Post 4)
5. **r/shopify** and **r/WordPress** — platform-specific subs, paste Post 4 with tweaked title naming the platform

Run dev track first (gets stars + credibility). Then run business-owner track 5-7 days later — by then we can say "since launch X people are using it" which lifts BO trust.

Never cross-post identical content. Reddit downranks duplicate text. Each sub needs its own tweaked title and intro.

---

## Pre-drafted replies to anticipated comments

**Q: "How is this different from CopilotKit / assistant-ui / Vercel AI SDK?"**

> CopilotKit and assistant-ui are toolkits — you assemble the UX with their primitives. ChatbotLite is the assembled widget: one component, one config, done. Vercel AI SDK is the model layer underneath, no UI. None of them ship URL-only Stripe/Calendly adapters or mid-stream provider failover out of the box. If you want to build a custom in-app copilot, CopilotKit is better. If you want to ship a chat widget on a customer-facing site today, this is the path.

**Q: "BYOK means the API key is in the browser?"**

> No. The widget posts to your `/api/chat` route; the key stays server-side in your env. Same flow for the `<script>` tag — you still need a `/api/chat` endpoint. README has a one-pager. Never paste an LLM key into client code.

**Q: "Why no vector DB?"**

> For the use cases we're targeting — SMB sites, 5-50 page knowledge bases — the whole KB fits in a 32k context window cheaper than running embeddings. If your KB is 500 pages you're not our user yet. RAG hooks are on the 0.8 roadmap when demand justifies it.

**Q: "Does the failover actually work mid-stream? Sounds hard."**

> It's the part we spent the most time on. The stream resumer tracks the last successfully delivered token and on failure injects "continue from: ..." into the next provider's prompt. There's a regression test in the repo. Open edge case: if the first provider produced tool-call markers before failing, the second provider sees them as user context.

**Q: "Apache 2.0 why not MIT?"**

> Patent grant. For something that touches payment links and integrations, explicit patent coverage matters more to us than the slightly looser MIT terms. No deeper reason.

**Q: "Just launched, low stars — looks unfinished."**

> We literally pushed it last week. If you star it that helps; if you find a bug an issue helps more.

**Q: "What's the business model? Are you going to enshittify this later?"**

> agents.io is building tools we use internally and releasing the ones that have broad value. ChatbotLite is Apache 2.0, <50KB of code, one markdown file. The escape hatch is "keep using the version you forked." If we ever monetise around it (hosted version, managed enterprise tier), the OSS core stays OSS.

---

## Don't do

- Don't ask for stars in the post body. Mention it if someone asks how to support.
- Don't post Sat/Sun. Weekday morning ET catches the largest engaged audience.
- Don't argue with the troll who says "another chatbot, original". Upvote and move on.
- Don't reply with marketing fluff. Specific numbers, specific limits, specific tradeoffs.
- Don't lead with the SaaS-vs-OSS pricing comparison. That's for SMB site owners, not the Reddit dev audience.

## Block 3 hours after each post

Reply within 15 minutes to every comment for the first 2 hours. Founder/team presence is the single biggest engagement multiplier across every launch we studied.

---

## Sources

- [Show HN: CopilotKit v2 (Dec 2023, 197 pts, 67 comments)](https://news.ycombinator.com/item?id=38545207)
- [Launch HN: Resend (Jun 2023, 432 pts, 270 comments)](https://news.ycombinator.com/item?id=36309120)
- [Launch HN: Chatwoot (Mar 2021, ~110 comments)](https://news.ycombinator.com/item?id=26501527)
- [Show HN: Plasmo (Jun 2022, 132 pts, 37 comments)](https://news.ycombinator.com/item?id=31609896)
- [Launch HN: Onyx YC W24 (2025, 254 pts, 160 comments)](https://news.ycombinator.com/item?id=46045987)
