import { describe, it, expect } from "vitest";
import { parseToolMarkers, stripToolMarkers, buildToolsPromptAddendum } from "./tools.js";

describe("parseToolMarkers", () => {
  it("parses a simple marker with quoted + unquoted args", () => {
    const text = 'sure thing [SKILL:requestPayment amount=4250 currency="cad" reason="initial deposit"]';
    const m = parseToolMarkers(text);
    expect(m).toHaveLength(1);
    expect(m[0]!.name).toBe("requestPayment");
    expect(m[0]!.args).toEqual({ amount: 4250, currency: "cad", reason: "initial deposit" });
  });

  it("coerces booleans + numbers", () => {
    const m = parseToolMarkers('[SKILL:test active=true count=12 ratio=0.5 name="bob"]');
    expect(m[0]!.args).toEqual({ active: true, count: 12, ratio: 0.5, name: "bob" });
  });

  it("returns empty when no marker", () => {
    expect(parseToolMarkers("just some text, no marker here")).toEqual([]);
  });
});

describe("stripToolMarkers", () => {
  it("removes the marker and leaves clean text", () => {
    const text = 'Our inspection costs $95 [SKILL:requestPayment amount=9500 currency="cad"]';
    expect(stripToolMarkers(text)).toBe("Our inspection costs $95");
  });

  it("removes multiple markers", () => {
    const text = 'a [SKILL:foo x=1] b [SKILL:bar y=2] c';
    expect(stripToolMarkers(text)).toBe("a  b  c");
  });
});

describe("buildToolsPromptAddendum — INLINE leak regression", () => {
  // The bot was emitting the literal word "INLINE" into its reply because the
  // prompt instruction said "emit the marker INLINE in your reply" and the LLM
  // treated INLINE as a token to type. Fixed by rewriting the instruction.
  it("does NOT contain a positive instruction telling the LLM to write 'INLINE'", () => {
    const prompt = buildToolsPromptAddendum(["requestPayment"]);
    // The new prompt should NOT tell the LLM to "emit ... INLINE"
    expect(prompt).not.toMatch(/emit the marker INLINE/i);
    expect(prompt).not.toMatch(/marker INLINE in your/i);
  });

  it("explicitly tells the LLM not to write descriptive words like INLINE", () => {
    const prompt = buildToolsPromptAddendum(["requestPayment"]);
    // The negative instruction should be present so the LLM is warned off.
    expect(prompt).toMatch(/Do NOT include.*INLINE/i);
  });

  it("returns empty string for empty tool list", () => {
    expect(buildToolsPromptAddendum([])).toBe("");
  });

  it("includes example markers for each enabled tool", () => {
    const prompt = buildToolsPromptAddendum(["requestPayment", "scheduleCallback"]);
    expect(prompt).toContain("requestPayment");
    expect(prompt).toContain("scheduleCallback");
    expect(prompt).toContain("[SKILL:requestPayment");
    expect(prompt).toContain("[SKILL:scheduleCallback");
  });

  it("skips unknown tools without crashing", () => {
    const prompt = buildToolsPromptAddendum(["requestPayment", "nonExistentTool"]);
    expect(prompt).toContain("requestPayment");
    expect(prompt).not.toContain("nonExistentTool");
  });
});
