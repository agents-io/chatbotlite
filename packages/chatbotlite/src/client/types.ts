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
 */
export interface ChainEntry {
  provider: Provider;
  model?: string;
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
  provider: Provider;
  model: string;
  /** Human-readable label used in attempt traces, e.g. `"openai/gpt-4o-mini"`. */
  label: string;
}

export interface AttemptInfo {
  provider: Provider;
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
