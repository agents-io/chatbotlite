# Reddit launch post drafts

Three subreddits, three different angles. **Don't cross-post the same text** — Reddit and the mods hate that. Post one per day, not all at once.

Each post must end as a comment in the conversation, not as a sales pitch. Reply to comments fast in the first hour — that's how upvote ranking decides whether to lift you.

---

## r/SideProject — "I built it" angle

**Title**: I got tired of Intercom charging $39/seat, so I built an open-source drop-in chatbot. 3 lines, any website.

**Body**:

Been quoted $39/seat/mo (Intercom), $29/mo (Tidio), per-conversation pricing (Drift) for what is basically a JSON parser + a textarea + an OpenAI call. So I spent two weeks building [ChatbotLite](https://chatbotlite-demos.vercel.app).

What's in it:
- 3 lines to integrate (React component or plain `<script>` tag)
- 11 LLM provider auto-failover — OpenAI flakes mid-stream, Groq picks up
- Markdown knowledge file (no vector DB)
- Tool cards built-in: payment, scheduling, file upload, picker buttons
- 13 URL-only adapters (Stripe Payment Link, Calendly, PayPal — paste URL, done)
- Session persistence with pluggable storage interface
- Apache 2.0, BYOK (bring your own LLM key)

Live demos for 6 verticals: plumber, restaurant, coffee shop, dentist, tax prep, yoga studio — each rendered with a custom AI-generated poster style.

What I'd love feedback on:
1. Is the `<script>` tag install actually drop-in for your use case, or do you need something even simpler?
2. Anything missing in the adapter list?
3. The SKILL marker protocol (`[SKILL:requestPayment amount=42 currency="usd"]`) — clear enough, or should it be something else?

Repo: https://github.com/agents-io/chatbotlite
Demos: https://chatbotlite-demos.vercel.app

---

## r/webdev — practical / technical angle

**Title**: Drop-in AI chatbot widget — 3 lines, 11 providers with auto-failover, works in plain HTML (no React required)

**Body**:

Most "AI chatbot" libs assume you're already on React + Next.js + a vector DB + a fine-tuning pipeline. ChatbotLite is the opposite — it's for the case where you have a static site or a WordPress install and you just want a working chatbot.

**Drop-in HTML**:
```html
<script src="https://unpkg.com/chatbotlite/dist/embed.global.js"></script>
<script>
  chatbotlite.mount({ endpoint: "/api/chat", title: "Acme Plumbing" });
</script>
```

**Or React**:
```tsx
<ChatWidget endpoint="/api/chat" title="Acme Plumbing" />
```

**Server** (`/api/chat`):
```ts
const bot = new ChatBot({
  knowledge: knowledgeFromFile("./knowledge.md"),
  providers: { keys: { openai: process.env.OPENAI_API_KEY, groq: process.env.GROQ_API_KEY } }
});
```

A few things I'm proud of:

- **Auto-failover**: configure a chain of providers. If OpenAI 429s mid-stream, the next one picks up. Zero tokens lost. Demo recording in the README.
- **Anti-hallucination guards**: prompt assembly blocks the bot from quoting prices/policies not in your knowledge file.
- **Markdown knowledge instead of a vector DB**: works fine up to ~50KB. Above that we have RAG hooks planned for 0.8.
- **`[SKILL:name args]` markers**: the LLM outputs these inline, the widget renders interactive cards (Stripe checkout, Calendly picker, file upload). [Public spec here.](https://github.com/agents-io/chatbotlite/blob/main/SKILL_MARKER_SPEC.md)

Bundle: <50KB gzipped. Apache 2.0. BYOK (you bring the LLM key, we never proxy).

GitHub: https://github.com/agents-io/chatbotlite

Curious what people think about the SKILL marker protocol vs native function calling (which we'll also support in 0.8).

---

## r/reactjs — React-specific angle

**Title**: Open-source React chatbot widget with multi-provider failover, pluggable session storage, and zero vector DB

**Body**:

Tired of writing the same "chatbot with streaming + tool cards + provider fallback" boilerplate every project? I extracted it into a 3-line component.

```tsx
import { ChatWidget } from "chatbotlite/react";

<ChatWidget
  endpoint="/api/chat"
  title="Acme"
  theme={{ primary: "#1e3a8a" }}
  sessionId={userId}        // returning visitors see previous convo
  storage={new MyDBStorage()} // optional: wire to your backend
/>
```

What's interesting from a React standpoint:

**Pluggable `ChatStorage` interface**
```ts
interface ChatStorage {
  loadMessages(sessionId: string): Promise<Message[]>;
  saveMessages(sessionId: string, messages: Message[]): Promise<void>;
  loadTitle?(sessionId: string): Promise<string | undefined>;
  saveTitle?(sessionId: string, title: string): Promise<void>;
}
```
Default is `LocalChatStorage`. Wire to Supabase / Firestore / your own API in 30 lines.

**Tool cards via inline markers**
The bot emits `[SKILL:requestPayment amount=4250 currency="cad"]`, the widget intercepts the stream and renders a Stripe card. No JSON tool-use roundtrips needed for the common 90% case (though native function calling is on the 0.8 roadmap).

**Streaming SSE without the usual gotchas**
- Provider chain auto-failover (configure OpenAI → Groq → DeepSeek; if one 429s mid-stream the next one picks up).
- Streaming cursor stays in brand colour.
- Stream-errors render cleanly (no raw HTML leak — regression tested).

**Peer deps**: react >=18, react-dom >=18 (both optional — only needed if you use `chatbotlite/react`).

Bundle: <50KB gzipped. TypeScript types ship with the package.

Repo: https://github.com/agents-io/chatbotlite
Live demos: https://chatbotlite-demos.vercel.app

Would love thoughts on the `ChatStorage` interface — anything you'd want that isn't there?

---

## Posting timing

- **Day 1 (Mon-Wed, 10am-noon PT)**: r/SideProject — most lenient, friendly to launches.
- **Day 2**: r/webdev — be in the comments answering for the first 2 hours.
- **Day 3**: r/reactjs — has higher technical bar; lean on the storage interface + SKILL marker bits.

## After the post

- Reply to every comment in the first hour. Reddit ranks by reply velocity.
- If someone asks "why not LangChain / CopilotKit / Vercel AI SDK" — have a one-line honest answer ready. (Ours: zero-backend URL adapters + plain HTML embed + markdown-only knowledge + multi-provider failover, all in <50KB.)
- Don't argue. Thank corrections, note pushback as a roadmap item.
- Pin the GitHub link in the first reply on every thread.
