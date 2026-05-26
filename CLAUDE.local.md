# chatbotlite — session handoff (2026-05-25 → next)

> Project-scoped, gitignored. Resume any future session from this file alone.

## Where we are RIGHT NOW

- **Package**: `chatbotlite@0.7.0` (NOT yet published — version bumped, tests passing)
- **Demos**: need redeploy to Vercel after this session
- **Repo**: `agents-io/chatbotlite` on GitHub — needs push
- **Tests**: 32 unit + 6 E2E green, gated on `prepublishOnly`
- **Branch**: `main`

## What shipped this session (v0.7.0)

### 1. Logo
- **ChatGPT-generated** (DALL-E): blue speech bubble + white lightning bolt
- PNG: `packages/chatbotlite/logo.png` (930KB, 1254x1254)
- SVG: `packages/chatbotlite/logo.svg` (full-color: #0066FF bubble + white bolt)
- **Integrated into widget**: default launcher icon now uses evenodd cutout SVG (bolt shows background through)
- **Landing page nav**: SVG logo replaces old blue dot

### 2. llms-full.txt
- `demos/llms-full.txt` — 35KB complete API reference for LLM consumption
- Every export, type, method signature, prop with examples
- Verified against source: `knowledgeFromFile`/`knowledgeFromDir` are sync, `showInterac` defaults false
- Landing page footer links to both `/llms.txt` and `/llms-full.txt`

### 3. Adapter SDK (v0.7 core feature)
- **New entry point**: `chatbotlite/adapters`
- **13 URL-only adapters** (zero backend, zero API keys):
  - Payment: `stripeLink`, `paypalLink`, `squareLink`, `lemonSqueezyLink`, `gumroadLink`
  - Schedule: `calendlyUrl`, `calcomUrl`, `savvycalUrl`, `acuityUrl`, `msBookingsUrl`, `googleCalendarApptUrl`
  - Lead capture: `formspreeUrl`, `tallyUrl`
- **Component extensions**:
  - RequestPayment: `paymentLink` + `paymentLabel` (generic URL payment, backward-compat with `stripeLink`)
  - ScheduleCallback: `bookingUrl` + `bookingLabel` (skip slot picker, show single CTA)
- **13 unit tests** in `src/adapters/adapters.test.ts`
- **Build**: `dist/adapters/index.js` + `.d.ts` + `.cjs`
- **package.json exports**: `"./adapters"` added

### 4. Demo verticals upgraded to production-grade
All 6 demos went from ~70 line prototypes to 200-310 line production-quality pages:

| Demo | Lines | Features |
|---|---|---|
| plumber | 213 | Hero gradient, service cards, testimonials, about stats, contact bar |
| restaurant | 205 | Italian serif typography, 4-section menu with descriptions, testimonials, info grid |
| shopify-store | 239 | Product cards with gradient images, 4-step process, story section, testimonials |
| dentist | 283 | Insurance strip, team cards, testimonials, hours, mobile hamburger |
| tax-prep | 296 | Dark hero, 4-step process, pricing tiers with badges, multi-language strip |
| yoga-studio | 309 | Warm gradient hero, class cards, 3-tier pricing, free class banner |

**All preserved**: chatbotlite mount config, rate-limit endpoint, `defaultOpen`, `avatar`, brand themes.

### 5. Misc
- Landing page: version eyebrow → v0.7.0, schema.org version → 0.7.0
- Landing page: nav brand uses SVG logo instead of `.dot` span
- Package version: 0.6.3 → 0.7.0

## Also shipped this session (post v0.7.0, pre-publish)

### Picker Messages (PickerCard)
- New tool card: `[SKILL:pickerMessage prompt="..." options="A,B,C"]`
- `PickerMessage.tsx` component with tappable buttons
- Added to `ChatWidgetTools.pickerMessage` interface
- Bot can send structured choices, user taps to reply

### Session Persistence
- `ChatStorage` interface: `loadMessages`, `saveMessages`, `loadTitle`, `saveTitle`
- `LocalChatStorage` class (localStorage default)
- `ChatWidget` props: `sessionId?: string`, `storage?: ChatStorage`
- Returning visitors see previous conversation
- Exported from `chatbotlite/react`

### AI Conversation Titles
- Auto-generates title from first user message (truncated to 40 chars)
- Displayed in header subtitle area (fallback when no explicit `subtitle` prop)
- Persisted via storage backend

### Streaming Indicator Improvement
- "thinking" label added next to the 3 animated dots
- Streaming cursor `▍` already existed (DESIGN_SYSTEM signature)

### Mobile Auto Full-screen
- Already implemented (confirmed: `isMobile ? "100vw" : ...` at line 693)

## NOT yet done (next session)

### 1. Push + publish
- `git add` all changes, commit, push to `agents-io/chatbotlite`
- `npm publish` to release 0.7.0
- Redeploy demos: `cd demos && vercel --prod --yes`

### 2. CI workflow scope
`.github/workflows/test.yml` — still needs `gh auth refresh -s workflow` or web UI upload to enable Actions.

### 3. ROADMAP.md needs update
Add v0.7.0 section as completed, move items to done.

### 4. README update
Document adapter SDK usage with examples.

### 5. Show HN prep (from VISION.md)
- Custom domain (chatbotlite.dev?)
- Reddit/HN/Dev.to launch posts
- Adapter SDK docs in README

## Accounts

- Vercel `ithiria894` (OAuth, CLI authorized)
- Groq demo `janeytbtc@gmail.com` (key `gsk_3fkt...gcaG`, env var `GROQ_API_KEY` on Vercel project)
- Full ledger: `~/MyGithub/agentic-journal/projects/accounts/accounts.md`

## Useful URLs

- Live demos: https://chatbotlite-demos.vercel.app
- npm: https://www.npmjs.com/package/chatbotlite
- GitHub: https://github.com/agents-io/chatbotlite
- Vercel project: https://vercel.com/ithiria894s-projects/chatbotlite-demos

## How to resume

```bash
cd ~/MyGithub/chatbotlite/packages/chatbotlite
npm run test:all          # verify green
git status                # see all changes
# Then: commit, push, publish, redeploy
```
