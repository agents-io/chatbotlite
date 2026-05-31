import { describe, it, expect } from "vitest";
import { ChatBot } from "./chatbot.js";

// Minimal OpenAI-compatible SSE response: one token, then [DONE].
function sseResponse(token = "hi"): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: token } }] })}\n\n`));
      c.enqueue(enc.encode("data: [DONE]\n\n"));
      c.close();
    }
  });
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

async function drain(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const dec = new TextDecoder();
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out += dec.decode(value);
  }
  return out;
}

describe("custom / self-hosted (local LLM) provider", () => {
  it("calls a custom baseUrl with the given model and a dummy bearer", async () => {
    const calls: Array<{ url: string; headers: Record<string, string>; body: any }> = [];
    const mockFetch = (async (url: any, init: any) => {
      calls.push({ url: String(url), headers: init.headers, body: JSON.parse(init.body) });
      return sseResponse();
    }) as unknown as typeof fetch;

    const bot = new ChatBot({
      knowledge: "# Test\nWe sell widgets.",
      providers: {
        keys: {},
        chain: [{ provider: "custom", baseUrl: "http://localhost:11434/v1", model: "llama3.2" }]
      },
      options: { fetch: mockFetch }
    });

    await drain(await bot.replyStream("hello"));

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("http://localhost:11434/v1/chat/completions");
    expect(calls[0]!.headers.Authorization).toBe("Bearer local");
    expect(calls[0]!.body.model).toBe("llama3.2");
  });

  it("strips a trailing slash from baseUrl (no double //chat/completions)", async () => {
    const urls: string[] = [];
    const mockFetch = (async (url: any) => { urls.push(String(url)); return sseResponse(); }) as unknown as typeof fetch;
    const bot = new ChatBot({
      knowledge: "# Test",
      providers: { keys: {}, chain: [{ provider: "custom", baseUrl: "http://localhost:8000/v1/", model: "m" }] },
      options: { fetch: mockFetch }
    });
    await drain(await bot.replyStream("hi"));
    expect(urls[0]).toBe("http://localhost:8000/v1/chat/completions");
  });

  it("uses a custom apiKey when provided", async () => {
    let auth = "";
    const mockFetch = (async (_url: any, init: any) => { auth = init.headers.Authorization; return sseResponse(); }) as unknown as typeof fetch;
    const bot = new ChatBot({
      knowledge: "# Test",
      providers: { keys: {}, chain: [{ provider: "custom", baseUrl: "http://localhost:1234/v1", model: "m", apiKey: "sk-local-xyz" }] },
      options: { fetch: mockFetch }
    });
    await drain(await bot.replyStream("hi"));
    expect(auth).toBe("Bearer sk-local-xyz");
  });

  it("lets baseUrl override a known provider (point openai at a gateway)", async () => {
    const urls: string[] = [];
    const mockFetch = (async (url: any) => { urls.push(String(url)); return sseResponse(); }) as unknown as typeof fetch;
    const bot = new ChatBot({
      knowledge: "# Test",
      providers: {
        keys: { openai: "sk-real" },
        chain: [{ provider: "openai", model: "gpt-4o-mini", baseUrl: "https://gateway.internal/v1" }]
      },
      options: { fetch: mockFetch }
    });
    await drain(await bot.replyStream("hi"));
    expect(urls[0]).toBe("https://gateway.internal/v1/chat/completions");
  });

  it("throws if a custom entry is missing baseUrl", () => {
    expect(() => new ChatBot({
      knowledge: "# Test",
      providers: { keys: {}, chain: [{ provider: "custom", model: "m" } as any] }
    })).toThrow(/custom.*baseUrl/i);
  });

  it("throws if a custom entry is missing model", () => {
    expect(() => new ChatBot({
      knowledge: "# Test",
      providers: { keys: {}, chain: [{ provider: "custom", baseUrl: "http://localhost:11434/v1" } as any] }
    })).toThrow(/custom.*model/i);
  });

  it("falls back from a dead local endpoint to the next chain step", async () => {
    const urls: string[] = [];
    const mockFetch = (async (url: any) => {
      urls.push(String(url));
      if (String(url).includes("localhost")) return new Response("down", { status: 503 });
      return sseResponse("from-cloud");
    }) as unknown as typeof fetch;

    const bot = new ChatBot({
      knowledge: "# Test",
      providers: {
        keys: { groq: "gsk-real" },
        chain: [
          { provider: "custom", baseUrl: "http://localhost:11434/v1", model: "llama3.2" },
          { provider: "groq", model: "llama-3.3-70b-versatile" }
        ]
      },
      options: { fetch: mockFetch }
    });

    const out = await drain(await bot.replyStream("hi"));
    expect(urls[0]).toContain("localhost");
    expect(urls[1]).toContain("groq.com");
    expect(out).toContain("from-cloud");
  });
});
