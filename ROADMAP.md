# chatbotlite — Roadmap

> Single source of truth for what's done, what's next, and what's parked.
> Update this file when scope changes. Newest version at top.

---

## Current: `0.6.0` (published 2026-05-25)

| Area | Status |
|---|---|
| Design system locked (Telegram-inspired, DESIGN_SYSTEM.md) | ✅ |
| CSS tokens refactor (`:where(.chatbotlite-root)`, dark mode, light-primary auto-contrast) | ✅ |
| SVG icons replace emoji in widget chrome (paperclip, mic, send, bolt footer) | ✅ |
| Avatar opt-in (none / letter badge / image URL) | ✅ |
| Composer focus styling fix (no nested box) | ✅ |
| Stream-error clean rendering (no raw HTML leak — regression test in place) | ✅ |
| Unit tests (vitest, 10 tests on color utils) | ✅ |
| E2E tests (Playwright, 6 tests covering launcher / send / stream / error path / tokens) | ✅ |
| `prepublishOnly` release gate (typecheck + unit + build + E2E) | ✅ |
| GitHub Actions CI (`.github/workflows/test.yml`) | ✅ |
| Demo gallery deployed to `chatbotlite-demos.vercel.app` (6 verticals + landing) | ✅ |
| Vercel SSO protection disabled (publicly accessible) | ✅ |
| Vercel AI-training opt-in unchecked (Nicole's data not used for model training) | ✅ |
| Groq demo key isolated on `janeytbtc@gmail.com` (production voice key untouched) | ✅ |
| Rate limits on demo `/api/chat` (10/IP/hr, 5000/day, 500-char prompt cap) | ✅ |

---

## Next patch: `0.6.1` (in flight)

Small, additive — backwards-compatible.

| Item | Notes |
|---|---|
| `extraInstructions` field on `ChatBot` + `<ChatWidget>` | Per-vertical behaviour tweaks ("don't quote price too early", tone, escalation triggers). Appends after our anti-hallucination rules, before tool addendum. |
| `systemPromptTransform: (defaultPrompt: string) => string` | Power-user hook to MODIFY (not just append) our scaffolding — replace/delete/restructure any default rule. Three-tier customization: `extraInstructions` (append) → `systemPromptTransform` (modify) → `systemPrompt` (full replace, escape hatch). |
| `requestPayment.showInterac` default flips `true` → `false` | Interac is Canada-only — global default should be Stripe-first. Canadian customers explicitly opt in. |
| Replace `💳` emoji in `RequestPayment.tsx` with SVG card icon | DESIGN_SYSTEM compliance — no emoji in chrome. |
| Maximize/compact panel toggle | Button in header next to X — toggles 380×580 ↔ 720×800. Preference persisted to `localStorage["cbl-panel-size"]`. Mobile: always full-screen, button hidden. |
| Unit test for system prompt assembly order | Covers `extraInstructions` + `systemPromptTransform` injection points. |
| README: pin Stripe-Payment-Link path as the zero-code recommendation | "Create a Stripe Payment Link → paste URL → done." |

---

## `0.7` — Adapter SDK + Marketing-ready

Goal: make the "30-second integration" claim true for the top 3 verticals.

### Common-case adapters (URL-only, zero backend)

These are pure-config: customer pastes a URL, we open it. No API keys, no server, no risk. The generic `onPick` / `handler` contract still works for everything else.

| Category | Adapter | Customer provides | Notes |
|---|---|---|---|
| Payment | `stripeLink` | Stripe Payment Link URL | ✅ already in 0.6.x — works globally (195 countries) |
| Payment | `paypalLink` | PayPal.me URL or PayPal hosted button | Personal + business |
| Payment | `squareLink` | Square / Cash App Pay URL | US + CA |
| Payment | `lemonSqueezyLink` | Lemon Squeezy product checkout URL | MoR — handles VAT/sales tax |
| Payment | `gumroadLink` | Gumroad product URL | Creator/digital-goods focus |
| Schedule | `calendlyUrl` | Calendly link | Most common globally |
| Schedule | `calcomUrl` | Cal.com link | Open-source alternative |
| Schedule | `savvycalUrl` | SavvyCal link | |
| Schedule | `acuityUrl` | Acuity Scheduling link | Squarespace-owned |
| Schedule | `msBookingsUrl` | Microsoft Bookings link | M365 SMB stack |
| Schedule | `googleCalendarApptUrl` | Google Calendar appointment schedule URL | |
| Lead capture | `formspreeUrl` / `tallyUrl` | Hosted form URL | For "leave us your email" cards |

### Landing page rebuild (`/demos`)

- Hero: "Drop-in AI chatbot. 3 steps. Any website."
- Two integration paths visible above the fold:
  - **AI Code path**: copy-paste prompt block → pasted into Claude/Cursor/Copilot
  - **Manual path**: 1) `npm i chatbotlite` 2) write `knowledge.md` 3) mount widget
- 6-demo gallery below
- "Why" section: SMB plumbing pre-wired, no vendor lock-in, LLM-agnostic, Apache 2.0
- Tone: both playful + enterprise; solo-dev sees in 5 seconds "I don't need to write this from scratch"

### AI-discoverability (SEO / GEO)

- `llms.txt` at site root — high-signal summary for LLM crawlers
- `llms-full.txt` — complete API reference for LLM consumption
- README rewrite with keyword density: "drop-in AI chatbot for Shopify / WordPress / Next.js / React / Webflow / HTML"
- Open Graph + schema.org JSON-LD on every demo page
- Goal: when someone asks "add a chatbot to my Shopify store" to Claude/GPT, `chatbotlite` is the first suggestion

### Test coverage expansion

- Dark mode auto-detection E2E
- Light-primary contrast E2E (yellow brand → dark text on bubble)
- Tool card render + submit E2E (each of the 3 tools)
- Mobile 375px viewport E2E

---

## `0.8` — Server-side adapters + native function calling

These need backend credentials, so they ship with security guidance, not just config. Each adapter is a `chatbotlite/adapters/<name>` module the customer mounts in their `/api/chat` handler.

### Payment (server-side)

| Adapter | Use case |
|---|---|
| `payment.stripeCheckout` | Programmatic Checkout Sessions; webhook for completion; idempotency keys |
| `payment.stripeSubscriptions` | Recurring billing flows |
| `payment.paypalOrders` | PayPal Orders API |

### File upload

| Adapter | Use case |
|---|---|
| `upload.s3Presigned` | Backend issues presigned PUT URLs; never expose AWS secret to client |
| `upload.r2Presigned` | Cloudflare R2 (S3-compatible, no egress fees) |
| `upload.dropbox` | OAuth flow; refresh tokens |
| `upload.googleDrive` | OAuth flow; Drive API |
| `upload.cloudinary` | Image/video CDN with transformations |
| `upload.uploadcare` | Image CDN + adaptive delivery |

### Email / notification

| Adapter | Use case |
|---|---|
| `notify.resend` | "When a customer submits a callback request, email the owner" |
| `notify.sendgrid` | Same, SendGrid backend |
| `notify.mailgun` | Same, Mailgun backend |

### CRM lead capture

| Adapter | Use case |
|---|---|
| `crm.hubspot` | Create contact + deal on lead-capture tool submission |
| `crm.pipedrive` | Same, Pipedrive |
| `crm.salesforce` | Same, Salesforce Leads object |

### Platform features

| Item | Why it needs care |
|---|---|
| Native function calling (OpenAI / Anthropic / Groq tool_use protocol) | Replace our markdown tool-marker convention with structured tool_use; opt-in per provider |
| RAG hooks | `knowledge.vectorize()` for customers with > 50KB knowledge; pluggable retriever (pgvector, Pinecone, in-memory) |

---

## `1.0` vision — Marketplace + polish

- **Vertical starter packs**: `chatbotlite-templates/plumber`, `/dentist`, `/coffee-shop` etc. — ready-to-customize knowledge.md + brand theme presets
- **Conversation analytics dashboard**: track resolved-without-human rate, common questions, tool conversion
- **Multi-language UI localization**: header, error states, footer copy
- **Custom theme builder**: visual interface to tune tokens → exports `theme: {...}` object
- **Plugin marketplace**: community-contributed tool cards (booking systems, payment gateways, lead capture)

---

## Parking lot (no version assigned)

- **Custom domain for demo gallery** — currently `chatbotlite-demos.vercel.app`. Buy `chatbotlite.dev` or `tryit.chatbotlite.io`?
- **Real Shopify dev store demo** — current shopify-store demo is static HTML mimic. Phase 2 = embed in actual `*.myshopify.com` for authenticity.
- **Show HN / Reddit launch campaign** — needs landing page first; planned post-0.7.
- **Sanitization layer for analytics** — strip PII before exporting conversation logs.
- **Voice input completion** — Web Speech API integration was started but pulled from public demos pending UX polish.

---

## Decisions worth remembering

- **Tool architecture: generic contract + named common adapters.** Like Tailwind's utility classes for common cases + arbitrary values for edge cases. We expose typed async handlers; common providers (Stripe / Calendly / PayPal) get pre-built URL-based adapters so customers can skip writing the handler.
- **No vendor lock-in.** Customers always own their data flow. We provide UI cards + contracts; they wire the backend.
- **Honest positioning.** We didn't invent the "LLM triggers UI cards" pattern (CopilotKit, Vercel AI SDK, Assistant-UI do this too). We win on: SMB-shaped pre-built tools + drop-in for non-React (vanilla `<script>` tag) + markdown-only knowledge convention + multi-provider fallback chain.
- **Tests are release-blocking.** Every `npm publish` runs typecheck + unit + build + E2E. Failure = no publish.
- **All accounts/keys logged to `~/MyGithub/agentic-journal/projects/accounts/accounts.md`** — single source of truth, fingerprints only in markdown.
