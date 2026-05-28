# Changelog

All notable changes to ChatbotLite are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning follows [SemVer](https://semver.org/).

## [0.7.23] — 2026-05-27

### Fixed
- **Embed bundle version string** is now injected at build time from `package.json` (was hardcoded `"0.6.3"`).
- `tsup.config.ts` comment `embed.iife.js` corrected to `embed.global.js` to match the actual output filename.

### Changed
- **Removed `anthropic` from the built-in provider list.** Anthropic's native API uses `/v1/messages` with a different request shape and `x-api-key` header — our OpenAI-compat path would 404. Anthropic users should route via OpenRouter for now; native Anthropic adapter is on the 0.8 roadmap. Provider count is now 10 (was 11).
- **Softened auto-failover claim**. The README previously implied "zero tokens lost" mid-stream replay. In reality, when a stream fails partway, the next provider takes over with a fresh reply — tokens already streamed to the client remain visible during the brief switch. True token-level replay is a 0.8 roadmap item.
- Removed empty `examples/nextjs-demo/` and `examples/vanilla-demo/` folders. Runnable starters will return when they actually exist.

## [0.7.21] — 2026-05-27

### Added
- **Adapter SDK** (`chatbotlite/adapters`) — 13 URL-only adapters (5 payment, 6 scheduling, 2 lead capture). Stripe Payment Links, Calendly, PayPal, Cal.com, Acuity, Microsoft Bookings, Google Calendar, Formspree, Tally and more. Customer pastes a URL, we open it. Zero backend, zero API keys.
- **Robot logo** as default launcher icon — no more emoji bubble.
- **Session persistence** — `sessionId` + pluggable `ChatStorage` interface (`localStorage` default; wire to your own DB). Returning visitors see previous conversation.
- **Picker messages** — bot emits `[SKILL:pickerMessage prompt="..." options="A,B,C"]`, widget renders tappable choice buttons.
- **AI conversation titles** — first message gets auto-summarised into a title shown in the header.
- **Mobile auto full-screen** — widget opens 100vw on mobile devices.
- **Streaming "thinking" indicator** — label next to the 3-dot animation while the LLM is generating.
- **`llms-full.txt`** — 35KB complete API reference for LLM crawlers. Linked from landing page.
- **6 production-grade demo verticals** — plumber, restaurant, coffee shop, dentist, tax prep, yoga studio. Each with a custom hand-illustrated poster background.
- **SKILL Marker Protocol** — `SKILL_MARKER_SPEC.md` public spec for the `[SKILL:name args]` invocation grammar.

### Changed
- `RequestPayment` accepts generic `paymentLink` + `paymentLabel` props (backward-compat with `stripeLink`).
- `ScheduleCallback` accepts `bookingUrl` + `bookingLabel` (skip slot picker, show single CTA).
- `requestPayment.showInterac` default flips `true` → `false` — global default is Stripe-first; Canadian customers opt in.

### Fixed
- Stream-error clean rendering — no raw HTML leak on provider failures (regression test in place).
- Composer focus styling — no nested box.

## [0.6.1] — 2026-05-25

### Added
- `extraInstructions` field — per-vertical behaviour tweaks ("don't quote price too early", tone hints, escalation triggers). Appends after anti-hallucination rules.
- `systemPromptTransform: (defaultPrompt: string) => string` — power-user hook to MODIFY (not just append) the scaffolding.
- Panel maximize/compact toggle — preference persisted to `localStorage`.

## [0.6.0] — 2026-05-25

### Added
- Design system locked (Telegram-inspired, see `DESIGN_SYSTEM.md`).
- CSS tokens refactor (`:where(.chatbotlite-root)`, dark mode, light-primary auto-contrast).
- SVG icons replace emoji in widget chrome.
- Avatar opt-in (none / letter badge / image URL).
- Unit tests (vitest) + E2E tests (Playwright) gated by `prepublishOnly`.
- GitHub Actions CI.
- Demo gallery on `chatbotlite-demos.vercel.app`.
