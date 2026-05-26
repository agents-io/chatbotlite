# ChatbotLite — Vision + Positioning

> Strategic context that doesn't belong in ROADMAP (what + when) or DESIGN_SYSTEM (visual rules).
> This file captures the "why" — positioning, audience, tone, what we deliberately don't build.
> Update when strategic direction shifts. Tactical state lives in CLAUDE.local.md.

---

## What ChatbotLite IS

A drop-in AI chatbot SDK for any website. Three steps to integrate:
1. `npm install chatbotlite` (or `<script>` tag for plain HTML)
2. Write a markdown file describing the business — services, hours, pricing, FAQ
3. Mount the widget

The bot grounds every answer in the markdown file (anti-hallucination by design). Pre-built tool cards (payment, scheduling, file upload) render inline. Customer wires the data flow via typed async handlers — we don't own customer data.

## What ChatbotLite is NOT

- **Not a SaaS** — no monthly subscription, no per-conversation fees. Apache 2.0 npm package.
- **Not React-only** — vanilla `<script>` tag works on Shopify, WordPress, Webflow, plain HTML.
- **Not RAG infra** — no vector DB needed for typical SMB use case (knowledge is just markdown).
- **Not a hosted backend** — customer's `/api/chat` route owns the LLM call. We're a client + a class.
- **Not vendor-locked** — fallback chain across Groq / OpenAI / DeepSeek built in.
- **Not enterprise-shaped** — we serve solo devs and SMBs, not Fortune 500 SSO/SCIM flows.

---

## Audience — two tiers, both critical

### Tier 1: Solo developers
- Browse Reddit (r/SaaS, r/sideproject, r/javascript), Hacker News, Dev.to
- Building a side project / SMB consulting gig / freelance client site
- Want indie-tool credibility ("looks like Vite / tldraw / Drizzle")
- Will read code, read GitHub, read README
- Care about: TypeScript types, multi-LLM, OSS license, npm bundle size
- Decision in 60 seconds: "is this serious or is it AI slop?"

### Tier 2: SMB owners (the END customer)
- Plumbers, restaurants, dentists, yoga studios, tax preparers
- Don't read code — they read marketing
- Probably hired Tier 1 to integrate this
- Want professional readability ("ChatbotLite", not "chatbotlite")
- Care about: it works, it doesn't look broken, it doesn't expose them
- Decision in 5 seconds: "does this fit my site or look like a 1999 widget"

**The packaging must serve both.** Code samples + npm strings lowercase (Tier 1). Display copy capitalized (Tier 2). Landing page hooks solo devs with the "stop writing chatbots from scratch" promise, but the 6 demo verticals prove SMB-readiness.

---

## Positioning — honest competitive landscape

The "LLM triggers UI cards" pattern is NOT our invention. Industry has converged on it over the last 18 months:

| Lib | Overlap |
|---|---|
| **CopilotKit** | React-only AI actions. Closest concept overlap. |
| **Vercel AI SDK** | Generative UI / streaming components. State-of-the-art pattern. |
| **Assistant-UI** | Shadcn-based AI chat with tool calling. Modern but bare. |
| **Intercom / Tidio / Drift / Crisp** | SaaS chatbots with booking/payment cards. Closed-source, monthly fees. |

**Pitching "we invented this" burns credibility.** Reddit/HN will eviscerate it. The honest pitch:

> Yet another AI chatbot, BUT with the SMB plumbing pre-wired — payment cards, scheduling, file upload — and works on plain HTML, not just React. Knowledge file is markdown, no vector DB. Three lines to integrate.

### Where we actually win

1. **SMB-shaped tools pre-built** — Stripe Payment Link, Calendly URL, Cal.com URL, file upload contract. Other libs make you build these.
2. **Drop-in for non-React** — vanilla `<script>` tag works on every platform. Other libs are React-only.
3. **Markdown knowledge convention** — one `.md` file → grounded bot with anti-hallucination guards. Nobody else makes this trivial.
4. **LLM-agnostic with fallback** — Groq → OpenAI → DeepSeek auto failover. Not locked to OpenAI.
5. **Apache 2.0** — customer owns the bundle, the data flow, the deployment. No "we own your conversations".

---

## Tone — both playful AND enterprise

Target sensibility: **Linear / Vercel / Stripe**, not "playful AI startup".

### Voice rules (from this session's iterations)

- **Confident, not hyperactive.** "Drop-in AI chatbot. 3 steps." not "🚀✨ The MAGICAL chatbot that 10X's your conversions!! 🤖"
- **Specific, not vague.** "Three lines" beats "easy integration". "Groq free tier — 14,400 req/day" beats "fast LLM".
- **Occasional wink, no smugness.** "Stop writing chatbots from scratch" is the wink. "Disrupting customer service" is smugness.
- **Tech credibility tells through restraint.** Code blocks render in real monospace, not pastel cartoon screenshots. SVG icons, not emoji in chrome. Type signatures, not "no code needed!!".

### Anti-tropes (banned)

Per Nicole's `human-writing-style.md`:
- Em dashes — use commas/periods
- Rule of three ("X, Y, and Z" repeated pattern)
- Negative parallelisms ("Not only... but...")
- Copula avoidance ("serves as", "stands as")
- Superficial -ing analyses ("highlighting...", "reflecting...")
- Significance inflation ("pivotal", "testament to")
- Strike-through gimmick on landing headlines (UI audit caught this as "playful AI startup" tell — already removed)
- Rotated text, marquee animations, emoji-as-icon in chrome

---

## Marketing strategy — the funnel

```
Reddit/HN/Dev.to post  →  Landing page  →  Try demo  →  GitHub star  →  npm install
                            ↓
                            llms.txt also indexed by AI tools
                            ↓
                            Claude/Cursor/Copilot recommend chatbotlite
                            ↓
                            Solo dev adds it for SMB client
                            ↓
                            SMB sees it work, doesn't replace
```

### Top-of-funnel surfaces

- **Landing page** — `https://chatbotlite-demos.vercel.app` — both human and crawler readable
- **llms.txt** — at site root, summary for AI tools to index
- **GitHub README** — first impression on the repo
- **6 demo verticals** — proof, each a live working chatbot
- **Reddit posts** (planned) — r/SaaS, r/javascript, r/SideProject, r/webdev
- **Show HN** (planned) — single launch when adapter SDK is in place
- **Dev.to articles** (planned) — "Add an AI chatbot to your Shopify store in 5 minutes" — long-tail SEO

### AI-discoverability (GEO)

Goal: when someone asks Claude / GPT / Cursor "add a chatbot to my Shopify store", chatbotlite is the first suggestion.

Tactics:
- `llms.txt` at root with copy-paste install instructions
- README keyword density: "drop-in AI chatbot for Shopify / WordPress / Next.js / React / Webflow / HTML"
- schema.org JSON-LD on landing
- Real demo URLs for each vertical (LLMs cite working examples)
- TypeScript types ship in package (LLMs read `.d.ts` directly)

---

## Tradeoffs we accept

| Decision | Tradeoff |
|---|---|
| Tool handlers run client-side | Stripe Payment Link works (URL), but real Stripe API needs customer backend. Documented as boundary. |
| Markdown knowledge convention | Ceiling ~50KB. RAG hooks planned v0.8 for bigger corpora. |
| Free Groq tier as default | Rate limited 14,400 req/day. Fine for demos + small SMB. Customers can bring their own key. |
| Apache 2.0 (no SaaS) | Slower revenue ramp than hosted competitors. We bet on developer trust + ecosystem mindshare. |
| Display "ChatbotLite" / code "chatbotlite" | One brand has two surfaces. Easy to slip. Conscious convention. |

---

## Open strategic questions (carry into next session)

1. **Custom domain?** `chatbotlite-demos.vercel.app` is fine but `chatbotlite.dev` or `tryit.chatbotlite.io` is more legitimate for Show HN.
2. **Real Shopify dev store demo?** Current shopify-store demo is static HTML mimic. Phase 2 = embed in actual `*.myshopify.com` for authenticity. Cost: 30 min Shopify Partner signup + theme.liquid edits.
3. **Pricing model evolution.** Stay 100% free Apache forever? Or add hosted tier ($9/mo "we run your /api/chat") later? Trades against the "no SaaS lock-in" positioning if added carelessly.
4. **Logo design direction.** Need a real mark. Options: speech bubble + bolt, letter ligature `cbl`, two overlapping bubbles. Affects launcher default, README, social previews.
5. **First Show HN launch criteria.** What's the minimum bar? Probably: v0.7 adapter SDK done + 6 demos look production-grade + custom domain.

---

## North star

> Make it so when a solo dev asks "how do I add a chatbot to this site" — whether they ask Claude, ask Google, or ask a friend — the answer is `chatbotlite`. Not because we marketed harder, but because we made it genuinely the easiest correct choice for non-enterprise use.

If we win this, the SMB owners follow automatically (they hire the solo devs).
