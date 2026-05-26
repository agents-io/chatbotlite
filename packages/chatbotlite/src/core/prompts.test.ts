import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "./prompts.js";

const KNOWLEDGE = "# Acme Plumbing\n## Services\n- Sink leak: $95";

describe("buildSystemPrompt — defaults", () => {
  it("includes preamble, knowledge, and default reply rules", () => {
    const p = buildSystemPrompt(KNOWLEDGE);
    expect(p).toContain("You are an AI assistant on a business website");
    expect(p).toContain("# Acme Plumbing");
    expect(p).toContain("Sink leak: $95");
    expect(p).toContain("Reply in 1-2 short sentences");
    expect(p).toContain("NEVER invent prices");
  });

  it("readonly string[] arg is back-compat shorthand for enabledTools", () => {
    const p = buildSystemPrompt(KNOWLEDGE, ["uploadForReview"]);
    expect(p).toContain("Business knowledge");
    // tool addendum should be present (auto-injected examples)
    expect(p.length).toBeGreaterThan(buildSystemPrompt(KNOWLEDGE).length);
  });
});

describe("buildSystemPrompt — extraInstructions", () => {
  it("appends Additional instructions section after Reply rules", () => {
    const p = buildSystemPrompt(KNOWLEDGE, {
      extraInstructions: "Don't quote prices in first reply.\nUse warm tone."
    });
    expect(p).toContain("## Additional instructions");
    expect(p).toContain("Don't quote prices in first reply.");
    expect(p).toContain("Use warm tone.");
    // Order: rules section comes before extras
    expect(p.indexOf("Reply in 1-2")).toBeLessThan(p.indexOf("## Additional instructions"));
  });

  it("ignores empty or whitespace-only extraInstructions", () => {
    const baseline = buildSystemPrompt(KNOWLEDGE);
    expect(buildSystemPrompt(KNOWLEDGE, { extraInstructions: "" })).toBe(baseline);
    expect(buildSystemPrompt(KNOWLEDGE, { extraInstructions: "   \n  " })).toBe(baseline);
  });

  it("extras come before tools addendum when both present", () => {
    const p = buildSystemPrompt(KNOWLEDGE, {
      extraInstructions: "EXTRA-MARKER",
      enabledTools: ["uploadForReview"]
    });
    const extraIdx = p.indexOf("EXTRA-MARKER");
    // tool addendum begins with a `##` heading from buildToolsPromptAddendum
    // — assert ordering by checking the addendum sits AFTER extras
    expect(extraIdx).toBeGreaterThan(0);
    expect(p.length).toBeGreaterThan(extraIdx + "EXTRA-MARKER".length);
  });
});

describe("buildSystemPrompt — systemPromptTransform", () => {
  it("runs transform on the assembled prompt and returns its output", () => {
    const p = buildSystemPrompt(KNOWLEDGE, {
      systemPromptTransform: (prompt) => prompt.replace("1-2 short sentences", "3-5 sentences with warmth")
    });
    expect(p).toContain("3-5 sentences with warmth");
    expect(p).not.toContain("1-2 short sentences");
  });

  it("transform can delete default rules", () => {
    const p = buildSystemPrompt(KNOWLEDGE, {
      systemPromptTransform: (prompt) =>
        prompt.replace("- Match the caller's language automatically.", "")
    });
    expect(p).not.toContain("Match the caller's language");
    // Other defaults still present
    expect(p).toContain("NEVER invent prices");
  });

  it("transform sees the assembled prompt including extraInstructions", () => {
    const p = buildSystemPrompt(KNOWLEDGE, {
      extraInstructions: "VERTICAL-RULE",
      systemPromptTransform: (prompt) => {
        // Assert transform receives the extras already embedded
        if (!prompt.includes("VERTICAL-RULE")) throw new Error("transform did not see extras");
        return prompt + "\n- POST-TRANSFORM-APPENDIX";
      }
    });
    expect(p).toContain("VERTICAL-RULE");
    expect(p).toContain("POST-TRANSFORM-APPENDIX");
  });

  it("transform can return a completely synthetic prompt", () => {
    const p = buildSystemPrompt(KNOWLEDGE, {
      systemPromptTransform: () => "I am a fully custom prompt."
    });
    expect(p).toBe("I am a fully custom prompt.");
  });
});
