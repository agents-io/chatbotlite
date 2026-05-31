// Client types — provider + chain config

export type Provider =
  | "openai"
  | "deepseek"
  | "groq"
  | "gemini"
  | "cerebras"
  | "sambanova"
  | "fireworks"
  | "mistral"
  | "openrouter"
  | "moonshot";

/**
 * One step in the fallback chain. Provider is required; model defaults to the provider's preset.
 *
 * For a self-hosted / local LLM (Ollama, LM Studio, vLLM, llama.cpp — anything that
 * speaks the OpenAI-compatible `/chat/completions` API), use `provider: "custom"` with
 * a `baseUrl` and `model`:
 *
 * ```ts
 * { provider: "custom", baseUrl: "http://localhost:11434/v1", model: "llama3.2", apiKey: "ollama" }
 * ```
 *
 * `baseUrl` can also override a known provider's endpoint (e.g. to point "openai" at a proxy).
 */
export interface ChainEntry {
  provider: Provider | "custom";
  model?: string;
  /** OpenAI-compatible base URL. Required when `provider` is `"custom"`; optional override otherwise. */
  baseUrl?: string;
  /** API key for this entry. For `"custom"` it defaults to `"local"`; otherwise falls back to `keys[provider]`. */
  apiKey?: string;
}

/**
 * Provider configuration.
 *
 * `keys` are auth credentials (one key per provider — that key covers all that provider's models).
 * `chain` is the ordered fallback list. Each entry is `{ provider, model? }`.
 *
 * @example
 * ```ts
 * providers: {
 *   keys: {
 *     deepseek: "sk-...",
 *     groq:     "gsk-...",
 *     openai:   "sk-..."
 *   },
 *   chain: [
 *     { provider: "deepseek", model: "deepseek-chat" },
 *     { provider: "groq",     model: "llama-3.3-70b-versatile" },
 *     { provider: "openai",   model: "gpt-4o-mini" }
 *   ]
 * }
 * ```
 *
 * If `chain` is omitted, defaults to one entry per key (in insertion order) using each provider's
 * default model.
 */
export interface ProviderConfig {
  /** API keys per provider. One key covers all that provider's models. */
  keys: Partial<Record<Provider, string>>;
  /**
   * Ordered fallback chain. Each entry: `{ provider, model? }`.
   * Omit `model` to use the provider's default model.
   * Omit `chain` entirely to auto-build from keys.
   */
  chain?: ChainEntry[];
}

export interface ClientOptions {
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}

export interface ChainStep {
  provider: Provider | "custom";
  model: string;
  /** Resolved OpenAI-compatible base URL for this step (no trailing `/chat/completions`). */
  baseUrl: string;
  /** Resolved API key (or `"local"` dummy for custom endpoints that ignore auth). */
  apiKey: string;
  /** Human-readable label used in attempt traces, e.g. `"openai/gpt-4o-mini"`. */
  label: string;
}

export interface AttemptInfo {
  provider: Provider | "custom";
  model: string;
  status: "ok" | "error";
  error?: string;
  latencyMs: number;
}

const PROVIDER_NAMES: ReadonlySet<string> = new Set([
  "openai", "deepseek", "groq", "gemini",
  "cerebras", "sambanova", "fireworks", "mistral", "openrouter", "moonshot"
]);

export function isKnownProvider(name: string): name is Provider {
  return PROVIDER_NAMES.has(name);
}
