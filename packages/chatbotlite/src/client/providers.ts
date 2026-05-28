import type { Provider } from "./types.js";

export interface ProviderEndpoint {
  baseUrl: string;
  defaultModel: string;
  /** Vision-capable model. If absent, provider doesn't support image inputs. */
  visionModel?: string;
}

/**
 * Built-in OpenAI-compatible providers. All use /v1/chat/completions
 * with response in OpenAI format. Caller supplies API key per provider.
 *
 * Providers with `visionModel` set support image inputs via OpenAI-style
 * `image_url` content blocks (data: URLs accepted).
 */
export const PROVIDER_ENDPOINTS: Record<Provider, ProviderEndpoint> = {
  openai:     { baseUrl: "https://api.openai.com/v1",                              defaultModel: "gpt-4o-mini",                                       visionModel: "gpt-4o" },
  deepseek:   { baseUrl: "https://api.deepseek.com/v1",                            defaultModel: "deepseek-chat" },
  groq:       { baseUrl: "https://api.groq.com/openai/v1",                         defaultModel: "llama-3.3-70b-versatile",                          visionModel: "llama-3.2-90b-vision-preview" },
  gemini:     { baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", defaultModel: "gemini-2.5-flash",                                 visionModel: "gemini-2.5-flash" },
  cerebras:   { baseUrl: "https://api.cerebras.ai/v1",                             defaultModel: "qwen-3-235b-a22b-instruct-2507" },
  sambanova:  { baseUrl: "https://api.sambanova.ai/v1",                            defaultModel: "Meta-Llama-3.3-70B-Instruct" },
  fireworks:  { baseUrl: "https://api.fireworks.ai/inference/v1",                  defaultModel: "accounts/fireworks/models/llama-v3p3-70b-instruct" },
  mistral:    { baseUrl: "https://api.mistral.ai/v1",                              defaultModel: "mistral-small-latest" },
  openrouter: { baseUrl: "https://openrouter.ai/api/v1",                           defaultModel: "deepseek/deepseek-chat",                            visionModel: "openai/gpt-4o" },
  moonshot:   { baseUrl: "https://api.moonshot.ai/v1",                             defaultModel: "moonshot-v1-32k",                                  visionModel: "moonshot-v1-32k-vision-preview" }
};

export function isRetryableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /\b(429|rate.?limit|quota|exceed|5\d\d|timeout|ECONNRESET|fetch failed)\b/i.test(msg);
}

/** Convert a File/Blob to a `data:` URL for inline vision input. */
export async function fileToDataUrl(file: File | Blob): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const base64 = bufferToBase64(buf);
  const mime = (file as File).type || "application/octet-stream";
  return `data:${mime};base64,${base64}`;
}

function bufferToBase64(buf: Uint8Array): string {
  // Browser-safe base64. Node also has Buffer but we keep it portable.
  let bin = "";
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]!);
  if (typeof btoa === "function") return btoa(bin);
  // Node fallback
  return globalThis.Buffer.from(bin, "binary").toString("base64");
}
