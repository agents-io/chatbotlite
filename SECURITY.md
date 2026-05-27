# Security Policy

## Supported versions

Only the latest minor receives security updates.

| Version | Supported |
|---------|-----------|
| 0.7.x   | ✅        |
| < 0.7   | ❌        |

## Reporting a vulnerability

If you find a security issue in ChatbotLite — for example a way to leak API keys, bypass anti-hallucination guards, exfiltrate conversation state, or smuggle markup through the widget — please **do not open a public issue**.

Email: **security@agents.io**

Include:
- A short description of the issue
- A reproduction (smallest possible test case or code snippet)
- Affected version (`chatbotlite@x.y.z`)
- Your assessment of impact

We will acknowledge within **72 hours** and aim to ship a fix or mitigation within **14 days** for confirmed high-severity issues.

## What's in scope

- The `chatbotlite` npm package and its build artefacts.
- The widget UI: input handling, message rendering, tool-card props, streaming parser.
- The `ChatBot` server class: prompt assembly, provider chain, anti-hallucination guards.
- Adapters under `chatbotlite/adapters` (URL safety, redirect handling).

## What's out of scope

- Issues that require the customer's own LLM provider keys to be compromised first (e.g. someone with OpenAI access can already do anything).
- Demo deployments on `chatbotlite-demos.vercel.app` (demos use a rate-limited shared key for illustration only).
- Vulnerabilities in third-party services the customer chooses to wire up (Stripe, Calendly, etc).
- Browser extensions that modify the widget at runtime.

## Best practices for integrators

- **Never expose your LLM provider keys in client-side code.** Put them in your `/api/chat` handler only.
- **Validate the customer's input on your server** before forwarding to the LLM.
- **Rate-limit your `/api/chat` endpoint** — the package does not do this for you.
- **Keep `chatbotlite` up to date** — `npm outdated chatbotlite`.
