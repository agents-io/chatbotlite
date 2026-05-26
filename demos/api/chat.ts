// Vercel serverless function — shared chat backend for all demo verticals.
//
// Endpoint: /api/chat?demo=<vertical>
// Verticals: shopify-store, plumber, restaurant, dentist, tax-prep, yoga-studio
//
// Abuse protection (in-memory, per-instance — survives warm invocations, resets on cold start):
//   - Per-IP:  MAX_REQS_PER_IP_PER_HOUR
//   - Global:  MAX_REQS_PER_DAY (Groq free tier is 14400/day; we cap below)
//   - Prompt:  MAX_PROMPT_CHARS
// When any cap is hit, returns a friendly canned reply instead of calling the LLM.

import { ChatBot } from "chatbotlite";
import type { Message } from "chatbotlite";

const MAX_REQS_PER_IP_PER_HOUR = 10;
const MAX_REQS_PER_DAY = 5000;
const MAX_PROMPT_CHARS = 500;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// ─── Rate-limit state (in-memory; per-instance) ───
const ipHits = new Map<string, number[]>(); // ip → array of request timestamps (ms)
let dayStart = Date.now();
let dayCounter = 0;

function rateLimitCheck(ip: string): { ok: true } | { ok: false; reason: string } {
  const now = Date.now();

  // Reset day counter every 24h
  if (now - dayStart > DAY_MS) {
    dayStart = now;
    dayCounter = 0;
  }

  if (dayCounter >= MAX_REQS_PER_DAY) {
    return { ok: false, reason: "Demo is busy today — try again tomorrow or check the live install at github.com/agents-io/chatbotlite." };
  }

  const hits = ipHits.get(ip) ?? [];
  const recent = hits.filter((t) => now - t < HOUR_MS);
  if (recent.length >= MAX_REQS_PER_IP_PER_HOUR) {
    return { ok: false, reason: "You've hit the demo rate limit (10/hour). Try again in a bit, or self-host from GitHub." };
  }

  recent.push(now);
  ipHits.set(ip, recent);
  dayCounter++;
  return { ok: true };
}

function getClientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

function cannedReplyStream(message: string): ReadableStream {
  // Mimic the SSE shape the widget expects: token events then done.
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`event: token\ndata: ${JSON.stringify(message)}\n\n`));
      controller.enqueue(encoder.encode(`event: done\ndata: ${JSON.stringify({ reply: message })}\n\n`));
      controller.close();
    }
  });
}

// ─── Knowledge loading ───
const KNOWLEDGE_BY_DEMO: Record<string, string> = {};

async function loadKnowledge(): Promise<void> {
  if (Object.keys(KNOWLEDGE_BY_DEMO).length > 0) return;
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  // On Vercel, the function is bundled at /var/task with includeFiles bringing _shared/knowledge in.
  // Locally (vercel dev), cwd is the demos/ folder.
  // Probe both common layouts.
  const candidates = [
    path.join(process.cwd(), "_shared", "knowledge"),
    path.join(process.cwd(), "demos", "_shared", "knowledge"),
    path.join("/var/task", "_shared", "knowledge")
  ];
  let dir = candidates[0]!;
  for (const c of candidates) {
    try { await fs.access(c); dir = c; break; } catch { /* try next */ }
  }
  try {
    const files = await fs.readdir(dir);
    for (const f of files) {
      if (f.endsWith(".md")) {
        const name = f.replace(/\.md$/, "");
        KNOWLEDGE_BY_DEMO[name] = await fs.readFile(path.join(dir, f), "utf8");
      }
    }
  } catch (err) {
    console.error("[chatbotlite/demos] failed to load knowledge:", err);
  }
}

const botCache = new Map<string, ChatBot>();

function getBot(demo: string): ChatBot {
  if (botCache.has(demo)) return botCache.get(demo)!;
  const knowledge = KNOWLEDGE_BY_DEMO[demo];
  if (!knowledge) throw new Error(`unknown demo: ${demo}`);
  // Only include providers that actually have a key configured.
  const keys: Record<string, string> = {};
  const chain: { provider: "groq" | "deepseek" | "openai"; model: string }[] = [];
  if (process.env.GROQ_API_KEY) {
    keys.groq = process.env.GROQ_API_KEY;
    chain.push({ provider: "groq", model: "llama-3.3-70b-versatile" });
  }
  if (process.env.DEEPSEEK_API_KEY) {
    keys.deepseek = process.env.DEEPSEEK_API_KEY;
    chain.push({ provider: "deepseek", model: "deepseek-chat" });
  }
  if (process.env.OPENAI_API_KEY) {
    keys.openai = process.env.OPENAI_API_KEY;
    chain.push({ provider: "openai", model: "gpt-4o-mini" });
  }
  if (chain.length === 0) throw new Error("no LLM provider key configured");
  const bot = new ChatBot({ knowledge, providers: { keys, chain } });
  botCache.set(demo, bot);
  return bot;
}

export const config = {
  runtime: "nodejs",
  maxDuration: 30
};

export async function POST(req: Request): Promise<Response> {
  await loadKnowledge();
  // req.url can be path-only on Vercel — supply a dummy base for parsing.
  const url = new URL(req.url, "http://localhost");
  const demo = url.searchParams.get("demo") ?? "shopify-store";

  try {
    const ct = req.headers.get("content-type") ?? "";
    let message: string | undefined;
    let transcript: Message[] = [];
    let enabledTools: string[] = [];

    if (ct.includes("multipart/form-data")) {
      const form = await req.formData();
      message = form.get("message") as string;
      const tStr = form.get("transcript") as string | null;
      transcript = tStr ? JSON.parse(tStr) : [];
      const eStr = form.get("enabledTools") as string | null;
      enabledTools = eStr ? JSON.parse(eStr) : [];
    } else {
      const body = (await req.json()) as {
        message?: string;
        transcript?: Message[];
        enabledTools?: string[];
      };
      message = body.message;
      transcript = body.transcript ?? [];
      enabledTools = body.enabledTools ?? [];
    }

    if (!message) {
      return Response.json({ error: "message required" }, { status: 400 });
    }

    // Abuse caps — return a friendly streaming reply rather than 4xx,
    // so the widget renders it like any other bot message.
    if (message.length > MAX_PROMPT_CHARS) {
      const reply = `That's a lot to chew on — demo accepts up to ${MAX_PROMPT_CHARS} chars. Try a shorter question, or self-host from github.com/agents-io/chatbotlite for no limits.`;
      return new Response(cannedReplyStream(reply), {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" }
      });
    }

    const ip = getClientIp(req);
    const gate = rateLimitCheck(ip);
    if (!gate.ok) {
      return new Response(cannedReplyStream(gate.reason), {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" }
      });
    }

    const bot = getBot(demo);
    const stream = await bot.replyStream(message, { history: transcript, enabledTools });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive"
      }
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[chatbotlite/demos]", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
