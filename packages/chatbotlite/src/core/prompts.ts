import type { Knowledge } from "./types.js";
import { buildToolsPromptAddendum } from "./tools.js";

export interface BuildPromptOptions {
  /** Tool names available — auto-injects example markers. */
  enabledTools?: readonly string[] | undefined;
  /**
   * Append-only customization. Goes after our anti-hallucination rules,
   * before the tools addendum. 90% case — per-vertical behaviour tweaks
   * like "don't quote price too early" or "warm empathetic tone".
   */
  extraInstructions?: string | undefined;
  /**
   * Power-user hook. Receives the fully-assembled default prompt, returns
   * a new string. Use to MODIFY (replace/delete/restructure) our default
   * rules — e.g. swap "1-2 short sentences" for "3-5 sentences". 10% case.
   *
   * Runs AFTER extraInstructions has been appended, so transform sees the
   * complete default + extras combined.
   */
  systemPromptTransform?: ((defaultPrompt: string) => string) | undefined;
}

/**
 * Build the system prompt by wrapping the user's markdown knowledge
 * with anti-hallucination rules and reply-style guidance.
 *
 * The markdown is injected verbatim — headings, lists, tables all preserved.
 * Works for any vertical because we don't enforce a schema.
 *
 * Customization tiers (low → high invasiveness):
 *   1. `knowledge` (content)            — everyone uses this
 *   2. `extraInstructions` (behavior)   — append per-vertical tweaks
 *   3. `systemPromptTransform`          — modify our defaults inline
 *   4. `systemPrompt` on ReplyOptions   — full replace (escape hatch)
 */
export function buildSystemPrompt(
  knowledge: Knowledge,
  optionsOrEnabledTools: BuildPromptOptions | readonly string[] = []
): string {
  // Back-compat: callers passing readonly string[] continue to work.
  const opts: BuildPromptOptions = Array.isArray(optionsOrEnabledTools)
    ? { enabledTools: optionsOrEnabledTools }
    : (optionsOrEnabledTools as BuildPromptOptions);

  const toolsAddendum = buildToolsPromptAddendum(opts.enabledTools ?? []);
  const extras = opts.extraInstructions?.trim();

  const parts: string[] = [
    "You are an AI assistant on a business website. Use ONLY the knowledge below to answer.",
    "",
    "## Business knowledge",
    knowledge.trim(),
    "",
    "## Reply rules",
    "- Reply in 1-2 short sentences, conversational tone.",
    "- NEVER invent prices, availability, dispatch times, appointment confirmations, or facts not present in the business knowledge above.",
    "- For anything not covered in the knowledge above, say the owner will follow up — do NOT guess.",
    '- If the caller is clearly a vendor/sales pitch, say: "This does not look like a customer service request, so we will not continue this thread."',
    '- If wrong number or asked to stop, say: "Sorry about that. We won\'t text again."',
    "- Match the caller's language automatically."
  ];

  if (extras) {
    parts.push("", "## Additional instructions", extras);
  }

  if (toolsAddendum) {
    parts.push(toolsAddendum);
  }

  const defaultPrompt = parts.join("\n");
  return opts.systemPromptTransform ? opts.systemPromptTransform(defaultPrompt) : defaultPrompt;
}
