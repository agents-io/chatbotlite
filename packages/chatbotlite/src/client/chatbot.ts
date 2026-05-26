import type { Knowledge, Message } from "../core/types.js";
import { buildSystemPrompt } from "../core/prompts.js";
import { checkForbiddenPhrases, stripForbidden } from "../core/guards.js";
import { runJudge, type GuardsConfig, type JudgeVerdict } from "../core/judges.js";
import type { Provider, ProviderConfig, ClientOptions, ChainStep, ChainEntry, AttemptInfo } from "./types.js";
import { isKnownProvider } from "./types.js";
import { PROVIDER_ENDPOINTS, isRetryableError, fileToDataUrl } from "./providers.js";

export interface ChatBotInit {
  /** Markdown describing the business — services, hours, policies, anything. */
  knowledge: Knowledge;
  /** Provider keys + fallback chain. */
  providers: ProviderConfig;
  /** Optional runtime overrides. */
  options?: ClientOptions;
  /** Defense-in-depth: phrase redlines (default) + optional LLM input/output judges. */
  guards?: GuardsConfig;
  /**
   * Append per-vertical behaviour tweaks to our default system prompt
   * (e.g. "Don't quote price in first reply", "Use warm empathetic tone").
   * Appended after our anti-hallucination rules, before tool examples.
   */
  extraInstructions?: string;
  /**
   * Power-user hook to MODIFY (not just append) the default system prompt.
   * Receives the fully-assembled prompt (knowledge + rules + extras + tools)
   * and returns a transformed string. Use for: replacing default rules,
   * deleting rules, restructuring sections.
   */
  systemPromptTransform?: (defaultPrompt: string) => string;
}

export interface ReplyOptions {
  /** Conversation history (excluding the new user message). */
  history?: Message[];
  /** Override system prompt — advanced use only. */
  systemPrompt?: string;
  /** Tool names that the widget will render (auto-injects examples into system prompt). */
  enabledTools?: string[];
}

export interface ReplyWithMediaOptions extends ReplyOptions {
  /** Image files (PNG/JPEG/WebP) to include alongside the message. Skipped on providers without vision. */
  images?: (File | Blob)[];
}

export interface ReplyResult {
  reply: string;
  /** Provider/model that produced the final reply (after fallback). */
  usedProvider: Provider;
  usedModel: string;
  /** Token usage if reported by the final provider. */
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  /** Guard violations the bot caught and stripped, if any. */
  guardWarnings: string[];
  /** LLM-judge verdicts if judges configured. */
  judges?: { input?: JudgeVerdict; output?: JudgeVerdict };
  /** Debug trace of every attempt in the chain. */
  attempts: AttemptInfo[];
  /** True when blocked by input judge — `reply` will be the refusal message. */
  blockedByInputJudge?: boolean;
}

/**
 * The main ChatBot entry. Holds knowledge + provider chain.
 *
 * @example
 * const bot = new ChatBot({
 *   knowledge: `# Acme Plumbing\n## Services\n- Sink leak: $95`,
 *   providers: {
 *     keys: { deepseek: "sk-...", openai: "sk-..." },
 *     chain: [
 *       { provider: "deepseek", model: "deepseek-chat" },
 *       { provider: "openai",   model: "gpt-4o-mini" }
 *     ]
 *   }
 * });
 * const { reply } = await bot.reply("My sink is leaking");
 */
export class ChatBot {
  private readonly steps: ChainStep[];
  private readonly keys: Partial<Record<Provider, string>>;
  private readonly fetcher: typeof globalThis.fetch;
  private readonly timeoutMs: number;
  private readonly cachedSystemPrompt: string;

  private readonly guards: GuardsConfig;

  private readonly knowledge: string;
  private readonly extraInstructions: string | undefined;
  private readonly systemPromptTransform: ((p: string) => string) | undefined;

  constructor(init: ChatBotInit) {
    if (!init.knowledge || typeof init.knowledge !== "string" || init.knowledge.trim().length === 0) {
      throw new Error("chatbotlite: knowledge is required (a non-empty markdown string).");
    }
    this.knowledge = init.knowledge;
    this.keys = init.providers.keys ?? {};
    this.steps = resolveChain(init.providers);
    this.fetcher = init.options?.fetch ?? globalThis.fetch.bind(globalThis);
    this.timeoutMs = init.options?.timeoutMs ?? 30_000;
    this.extraInstructions = init.extraInstructions;
    this.systemPromptTransform = init.systemPromptTransform;
    this.cachedSystemPrompt = buildSystemPrompt(init.knowledge, {
      extraInstructions: this.extraInstructions,
      systemPromptTransform: this.systemPromptTransform
    });
    this.guards = init.guards ?? {};
  }

  /** Build system prompt for given opts — uses cached if no enabledTools, else rebuilds. */
  private resolveSystemPrompt(opts: ReplyOptions): string {
    if (opts.systemPrompt) return opts.systemPrompt;
    if (opts.enabledTools && opts.enabledTools.length > 0) {
      return buildSystemPrompt(this.knowledge, {
        enabledTools: opts.enabledTools,
        extraInstructions: this.extraInstructions,
        systemPromptTransform: this.systemPromptTransform
      });
    }
    return this.cachedSystemPrompt;
  }

  /** Run an LLM judge against content. Fail-open on errors. */
  private async judge(
    config: NonNullable<GuardsConfig["inputJudge"]>,
    content: string
  ): Promise<JudgeVerdict> {
    const endpoint = PROVIDER_ENDPOINTS[config.provider];
    const key = this.keys[config.provider];
    if (!key) {
      return { decision: "PASS", raw: `judge provider ${config.provider} has no key — fail-open` };
    }
    const model = config.model ?? endpoint.defaultModel;
    return runJudge(
      { provider: config.provider, model, prompt: config.prompt },
      key,
      endpoint.baseUrl,
      content,
      this.fetcher
    );
  }

  /**
   * Stream a reply as SSE events. Returns a ReadableStream that yields tokens
   * progressively. Designed to plug into Next.js/Hono/Express route handlers:
   *
   * ```ts
   * export async function POST(req: Request) {
   *   const { message, transcript } = await req.json();
   *   const stream = await bot.replyStream(message, { history: transcript });
   *   return new Response(stream, {
   *     headers: { "Content-Type": "text/event-stream" }
   *   });
   * }
   * ```
   *
   * Events emitted (one per `data:` line, SSE format):
   *   event: token   data: "<text fragment>"
   *   event: done    data: {"reply":"...","usedProvider":"...","usedModel":"...","attempts":[...]}
   *   event: error   data: {"message":"...","attempts":[...]}
   */
  async replyStream(message: string, opts: ReplyOptions = {}): Promise<ReadableStream<Uint8Array>> {
    const systemPrompt = this.resolveSystemPrompt(opts);
    const messages: Message[] = [
      { role: "system", content: systemPrompt },
      ...(opts.history ?? []),
      { role: "user", content: message }
    ];
    const steps = this.steps;
    const fetcher = this.fetcher;
    const keys = this.keys;
    const timeoutMs = this.timeoutMs;

    const encoder = new TextEncoder();
    const sse = (event: string, data: string): Uint8Array =>
      encoder.encode(`event: ${event}\ndata: ${data}\n\n`);

    return new ReadableStream<Uint8Array>({
      async start(controller) {
        const attempts: AttemptInfo[] = [];
        let lastError: unknown;
        let assembled = "";

        for (const step of steps) {
          const t0 = Date.now();
          const endpoint = PROVIDER_ENDPOINTS[step.provider];
          const key = keys[step.provider];
          if (!key) {
            attempts.push({ provider: step.provider, model: step.model, status: "error", error: "missing key", latencyMs: 0 });
            continue;
          }
          const abortCtrl = new AbortController();
          const timer = setTimeout(() => abortCtrl.abort(), timeoutMs);
          try {
            const res = await fetcher(`${endpoint.baseUrl}/chat/completions`, {
              method: "POST",
              headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
              body: JSON.stringify({ model: step.model, messages, temperature: 0.3, max_tokens: 300, stream: true }),
              signal: abortCtrl.signal
            });
            if (!res.ok) {
              const body = await res.text();
              throw new Error(`${res.status}: ${body.slice(0, 200)}`);
            }
            const reader = res.body!.getReader();
            const decoder = new TextDecoder();
            let sseBuffer = "";
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              sseBuffer += decoder.decode(value, { stream: true });
              const lines = sseBuffer.split("\n");
              sseBuffer = lines.pop() ?? "";
              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed.startsWith("data:")) continue;
                const payload = trimmed.slice(5).trim();
                if (payload === "[DONE]") continue;
                try {
                  const obj = JSON.parse(payload) as {
                    choices?: Array<{ delta?: { content?: string; reasoning_content?: string } }>;
                  };
                  const delta = obj.choices?.[0]?.delta?.content ?? obj.choices?.[0]?.delta?.reasoning_content ?? "";
                  if (delta) {
                    assembled += delta;
                    controller.enqueue(sse("token", JSON.stringify(delta)));
                  }
                } catch {
                  // Skip malformed SSE chunks
                }
              }
            }
            // Stream finished cleanly
            attempts.push({ provider: step.provider, model: step.model, status: "ok", latencyMs: Date.now() - t0 });
            const guard = checkForbiddenPhrases(assembled);
            const finalReply = guard.ok ? assembled : stripForbidden(assembled);
            controller.enqueue(sse("done", JSON.stringify({
              reply: finalReply,
              usedProvider: step.provider,
              usedModel: step.model,
              guardWarnings: guard.violations,
              attempts
            })));
            controller.close();
            return;
          } catch (err) {
            lastError = err;
            const errMsg = err instanceof Error ? err.message : String(err);
            attempts.push({ provider: step.provider, model: step.model, status: "error", error: errMsg, latencyMs: Date.now() - t0 });
            assembled = ""; // reset accumulated tokens on failure
            if (!isRetryableError(err)) {
              controller.enqueue(sse("error", JSON.stringify({ message: `${step.label} failed (non-retryable): ${errMsg}`, attempts })));
              controller.close();
              return;
            }
          } finally {
            clearTimeout(timer);
          }
        }

        const summary = attempts.map((a) => `${a.provider}/${a.model}:${a.error ?? "ok"}`).join(" → ");
        controller.enqueue(sse("error", JSON.stringify({
          message: `all chain steps failed. Trace: ${summary}. Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
          attempts
        })));
        controller.close();
      }
    });
  }

  /**
   * Reply to a message with optional image attachments. Routes through vision-capable
   * providers only — chain steps without `visionModel` are skipped (logged in attempts).
   *
   * Images are inlined as data: URLs. Keep total payload modest (<10MB).
   */
  async replyWithMedia(message: string, opts: ReplyWithMediaOptions = {}): Promise<ReplyResult> {
    const images = opts.images ?? [];
    if (images.length === 0) {
      return this.reply(message, opts);
    }

    // Convert images to data URLs once
    const dataUrls = await Promise.all(images.map(fileToDataUrl));

    const systemPrompt = this.resolveSystemPrompt(opts);
    const userContent: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> = [];
    if (message) userContent.push({ type: "text", text: message });
    for (const url of dataUrls) userContent.push({ type: "image_url", image_url: { url } });

    const messages: Array<{ role: "system" | "user" | "assistant"; content: string | typeof userContent }> = [
      { role: "system", content: systemPrompt },
      ...(opts.history ?? []),
      { role: "user", content: userContent }
    ];

    const attempts: AttemptInfo[] = [];
    let lastError: unknown;
    for (const step of this.steps) {
      const endpoint = PROVIDER_ENDPOINTS[step.provider];
      if (!endpoint.visionModel) {
        attempts.push({ provider: step.provider, model: step.model, status: "error", error: "no vision support", latencyMs: 0 });
        continue;
      }
      const t0 = Date.now();
      const visionStep: ChainStep = { provider: step.provider, model: endpoint.visionModel, label: `${step.provider}/${endpoint.visionModel}` };
      try {
        const key = this.keys[step.provider];
        if (!key) throw new Error(`Missing API key for provider: ${step.provider}`);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
          const res = await this.fetcher(`${endpoint.baseUrl}/chat/completions`, {
            method: "POST",
            headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model: visionStep.model, messages, temperature: 0.3, max_tokens: 400 }),
            signal: controller.signal
          });
          if (!res.ok) {
            const body = await res.text();
            throw new Error(`${res.status}: ${body.slice(0, 200)}`);
          }
          const data = (await res.json()) as {
            choices?: Array<{ message?: { content?: string } }>;
            usage?: { prompt_tokens?: number; completion_tokens?: number };
          };
          const reply = (data.choices?.[0]?.message?.content ?? "").trim();
          if (!reply) throw new Error("empty vision reply");
          attempts.push({ provider: visionStep.provider, model: visionStep.model, status: "ok", latencyMs: Date.now() - t0 });
          const guard = checkForbiddenPhrases(reply);
          const finalReply = guard.ok ? reply : stripForbidden(reply);
          return {
            reply: finalReply,
            usedProvider: visionStep.provider,
            usedModel: visionStep.model,
            ...(data.usage ? { usage: data.usage } : {}),
            guardWarnings: guard.violations,
            attempts
          };
        } finally {
          clearTimeout(timer);
        }
      } catch (err) {
        lastError = err;
        const errMsg = err instanceof Error ? err.message : String(err);
        attempts.push({ provider: visionStep.provider, model: visionStep.model, status: "error", error: errMsg, latencyMs: Date.now() - t0 });
        if (!isRetryableError(err)) {
          throw new Error(`chatbotlite: ${visionStep.label} vision failed (non-retryable). ${errMsg}`);
        }
      }
    }
    const summary = attempts.map((a) => `${a.provider}/${a.model}:${a.error ?? "ok"}`).join(" → ");
    throw new Error(`chatbotlite: no vision-capable provider succeeded. Trace: ${summary}. Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
  }

  async reply(message: string, opts: ReplyOptions = {}): Promise<ReplyResult> {
    // 1. Optional input judge — block before LLM call
    let inputVerdict: JudgeVerdict | undefined;
    if (this.guards.inputJudge) {
      inputVerdict = await this.judge(this.guards.inputJudge, message);
      if (inputVerdict.decision === "BLOCK") {
        return {
          reply: "I can't process that request. Please ask in a different way.",
          usedProvider: this.steps[0]!.provider,
          usedModel: this.steps[0]!.model,
          guardWarnings: [],
          judges: { input: inputVerdict },
          attempts: [],
          blockedByInputJudge: true
        };
      }
    }

    const systemPrompt = this.resolveSystemPrompt(opts);
    const messages: Message[] = [
      { role: "system", content: systemPrompt },
      ...(opts.history ?? []),
      { role: "user", content: message }
    ];
    const attempts: AttemptInfo[] = [];
    let lastError: unknown;
    for (const step of this.steps) {
      const t0 = Date.now();
      try {
        const result = await this.callProvider(step, messages);
        attempts.push({ provider: step.provider, model: step.model, status: "ok", latencyMs: Date.now() - t0 });
        const guard = checkForbiddenPhrases(result.reply);
        let finalReply = guard.ok ? result.reply : stripForbidden(result.reply);

        // 2. Optional output judge — block dangerous output
        let outputVerdict: JudgeVerdict | undefined;
        if (this.guards.outputJudge) {
          outputVerdict = await this.judge(this.guards.outputJudge, finalReply);
          if (outputVerdict.decision === "BLOCK") {
            finalReply = "Let me check with the owner and get back to you on that.";
          }
        }

        return {
          reply: finalReply,
          usedProvider: step.provider,
          usedModel: step.model,
          ...(result.usage ? { usage: result.usage } : {}),
          guardWarnings: guard.violations,
          ...(inputVerdict || outputVerdict
            ? { judges: { ...(inputVerdict ? { input: inputVerdict } : {}), ...(outputVerdict ? { output: outputVerdict } : {}) } }
            : {}),
          attempts
        };
      } catch (err) {
        lastError = err;
        const errMsg = err instanceof Error ? err.message : String(err);
        attempts.push({
          provider: step.provider,
          model: step.model,
          status: "error",
          error: errMsg,
          latencyMs: Date.now() - t0
        });
        if (!isRetryableError(err)) {
          throw new Error(`chatbotlite: ${step.label} failed (non-retryable). ${errMsg}`);
        }
      }
    }
    const summary = attempts.map((a) => `${a.provider}/${a.model}:${a.error ?? "ok"}`).join(" → ");
    throw new Error(`chatbotlite: all chain steps failed. Trace: ${summary}. Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
  }

  private async callProvider(step: ChainStep, messages: Message[]): Promise<{ reply: string; usage?: { prompt_tokens?: number; completion_tokens?: number } }> {
    const endpoint = PROVIDER_ENDPOINTS[step.provider];
    const key = this.keys[step.provider];
    if (!key) throw new Error(`Missing API key for provider: ${step.provider}`);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetcher(`${endpoint.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${key}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: step.model,
          messages,
          temperature: 0.3,
          max_tokens: 300
        }),
        signal: controller.signal
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`${res.status}: ${body.slice(0, 200)}`);
      }
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string; reasoning_content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const msg = data.choices?.[0]?.message;
      const reply = (msg?.content?.trim() || msg?.reasoning_content?.trim()) ?? "";
      if (!reply) throw new Error("empty reply from provider");
      const result: { reply: string; usage?: { prompt_tokens?: number; completion_tokens?: number } } = { reply };
      if (data.usage) result.usage = data.usage;
      return result;
    } finally {
      clearTimeout(timer);
    }
  }
}

function resolveChain(providers: ProviderConfig): ChainStep[] {
  const keys = providers.keys ?? {};
  const explicit = providers.chain;
  if (explicit && explicit.length > 0) {
    return explicit.map((entry) => normalizeChainEntry(entry, keys));
  }
  const orderedProviders = Object.keys(keys).filter((k) => isKnownProvider(k) && keys[k as Provider]) as Provider[];
  if (orderedProviders.length === 0) {
    throw new Error("chatbotlite: at least one provider key is required.");
  }
  return orderedProviders.map((provider) => ({
    provider,
    model: PROVIDER_ENDPOINTS[provider].defaultModel,
    label: `${provider}/${PROVIDER_ENDPOINTS[provider].defaultModel}`
  }));
}

function normalizeChainEntry(entry: ChainEntry, keys: Partial<Record<Provider, string>>): ChainStep {
  if (!isKnownProvider(entry.provider)) {
    throw new Error(`chatbotlite: unknown provider "${entry.provider}" in chain entry.`);
  }
  const provider = entry.provider;
  const model = entry.model ?? PROVIDER_ENDPOINTS[provider].defaultModel;
  if (!keys[provider]) {
    throw new Error(`chatbotlite: chain entry for "${provider}" needs a matching key in providers.keys.`);
  }
  return { provider, model, label: `${provider}/${model}` };
}
