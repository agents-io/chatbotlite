# Contributing to ChatbotLite

Thanks for the interest. ChatbotLite is small and we want to keep it that way — drop-in, low-config, no surprise dependencies. This guide covers how to get a working dev environment and the kinds of PRs that get merged quickly.

## Setup

```bash
git clone https://github.com/agents-io/chatbotlite
cd chatbotlite/packages/chatbotlite
npm install
npm run test:all   # unit + typecheck + build + E2E
```

E2E tests use Playwright. First-time install of browsers:

```bash
npx playwright install --with-deps chromium
```

## Repo layout

```
chatbotlite/
├── packages/chatbotlite/   # the npm package
│   ├── src/
│   │   ├── core/           # types, prompt builder, guards, SKILL marker parser
│   │   ├── client/         # ChatBot class, provider chain, retry logic
│   │   ├── node/           # knowledgeFromFile, knowledgeFromDir
│   │   ├── react/          # ChatWidget + tool cards
│   │   ├── embed/          # IIFE bundle for <script> tag
│   │   └── adapters/       # URL-only adapter factories
│   └── tests/
├── demos/                  # 6 vertical demos + landing page
└── docs/                   # README assets (GIF etc.)
```

## What we merge fast

- **Bug fixes with a failing test that now passes.**
- **New URL-only adapters** — pattern: customer pastes a URL, we open it. See `src/adapters/index.ts` for examples.
- **Provider additions** to the auto-failover chain (model names, endpoints, error shape).
- **Docs improvements** — typos, clearer examples, missing prop documentation in `llms-full.txt`.

## What we usually decline

- Heavyweight UI features that bloat the bundle. Budget: <50KB gzipped.
- Per-resolution pricing, telemetry, or anything that meters the widget layer. **ChatbotLite is BYOK** (bring your own key).
- Bouncing/pulsing attention-grabbers, pre-chat forms that block conversation, multi-tab Intercom-style portals.

See `STRATEGY.md` and `ROADMAP.md` for direction.

## PR convention

- One concept per PR. Small PRs ship fast.
- Add tests for any code change. `prepublishOnly` blocks publish if `test:all` fails.
- Run `npm run typecheck` before pushing.
- Squash on merge. Commit message in the body, not the title.

## Filing issues

Use the templates under `.github/ISSUE_TEMPLATE`. For bugs, include:

- `chatbotlite` version (`npm view chatbotlite version` to compare with yours)
- Browser + OS
- Minimal reproduction (CodeSandbox / StackBlitz link preferred)
- What you expected vs what happened

## Code of conduct

Be kind. Be specific. Disagree with the idea, not the person.
