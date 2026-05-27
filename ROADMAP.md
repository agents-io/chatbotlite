# chatbotlite — Roadmap

> Single source of truth for what's done, what's next, and what's parked.
> Update this file when scope changes. Newest version at top.

---

## Current: `0.7.21` (published 2026-05-27)

Latest release adds: adapter SDK, robot logo as default launcher, llms-full.txt, picker messages, session persistence with pluggable storage, AI conversation titles, mobile auto full-screen, streaming "thinking" indicator. See sections below for the per-minor breakdown.

---

## Earlier baseline: `0.6.0` (published 2026-05-25)

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

## `0.6.1` — Published 2026-05-25 ✅

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

## `0.7.0` — Adapter SDK + Logo + Demos + llms-full.txt ✅ (2026-05-25)

| Item | Status |
|---|---|
| **Logo**: robot speech bubble (DALL-E → SVG trace), integrated as default launcher icon + landing nav | ✅ |
| **llms-full.txt**: 35KB complete API reference for LLM consumption, linked from landing page | ✅ |
| **Adapter SDK** (`chatbotlite/adapters`): 13 URL-only adapters (5 payment + 6 schedule + 2 lead capture) | ✅ |
| RequestPayment: `paymentLink` + `paymentLabel` generics (backward-compat with `stripeLink`) | ✅ |
| ScheduleCallback: `bookingUrl` + `bookingLabel` (skip slot picker, show single CTA) | ✅ |
| 6 demo verticals upgraded to production-grade (200-310 lines each, responsive, testimonials) | ✅ |
| Landing page: version bump, SVG logo, llms-full.txt link | ✅ |
| 13 new adapter unit tests (32 total unit + 6 E2E = 38 tests) | ✅ |

---

## Next up — Widget UX features (cherry-picked from Intercom/Tidio/Crisp/tawk.to)

Priority batch (building now):

| # | Feature | Notes |
|---|---|---|
| 3 | **Picker messages** | Bot sends structured choice buttons; user taps to reply. Generic `PickerCard` primitive. |
| 6 | **Session persistence** | `sessionId` + pluggable storage interface (`localStorage` default, customer can wire to own DB/API). Returning visitors see previous conversation. |
| 7 | **Mobile auto full-screen** | Expand/compact already exists; mobile should auto full-screen on open. |
| 8 | **AI conversation titles** | Summarize first few messages into a title. Cheap via existing LLM access. |
| 10 | **Streaming "thinking" indicator** | Partial response preview during streaming, more informative than 3 dots. |

---

## Ideas backlog (no version assigned, validated ideas from competitor research)

Cherry-picked from Intercom, Tidio, tawk.to, Crisp. All can be built as open-source pipeline (customer brings own LLM key).

| # | Idea | Source | Impact | Notes |
|---|---|---|---|---|
| 1 | **Home screen with composable cards** | tawk.to Widget Cards | High | Pre-chat menu: KB search, quick-action buttons, branding. `homeCards={[...]}` prop. Reduces unnecessary AI calls. |
| 2 | **In-widget knowledge base search** | Intercom Help space | High | Expose `knowledge` markdown as searchable card inside widget. Zero API cost for FAQ lookups. |
| 4 | **Proactive message triggers** | Intercom/Crisp | Medium | Time-on-page or scroll triggers that pop a greeting bubble without opening widget. `proactive: { delay, message }` prop. |
| 5 | **Bot vs Human label** | Intercom | Medium | Visual distinction: grey bubble for bot, named avatar for human. `senderType: "bot" \| "human" \| "system"` on messages. Foundation for human handoff feature. |
| 9 | **WCAG accessibility** | tawk.to | Medium | `aria-live`, `role="log"`, keyboard focus trap, high-contrast mode. Legal requirement in some markets. |
| — | **Human handoff** | All four | High | Bot-to-human escalation when AI can't answer. Requires session persistence + real-time channel (WebSocket/SSE). |
| — | **Conversation analytics** | Intercom/Crisp | Medium | Resolved-without-human rate, common questions, tool conversion. Already in 1.0 vision. |
| — | **Multi-language UI** | Tidio | Low | Header, error states, footer copy in customer's locale. Already in 1.0 vision. |

### Explicitly NOT doing

- ❌ Multi-space navigation (Intercom 6-tab portal) — too bloated for a drop-in widget
- ❌ Bouncing attention-grabber animations (tawk.to) — spammy, conflicts with "calm messenger" positioning
- ❌ Pre-chat forms that block conversation — kills conversion; collect info later via tool cards
- ❌ Per-resolution pricing — we are BYOK (bring your own key), never meter the widget layer
- ❌ Heavy bundle — budget: <50KB gzipped

---

## Previous `0.7` plan (subsumed into 0.7.0 above)

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
