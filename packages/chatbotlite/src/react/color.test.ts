import { describe, it, expect } from "vitest";
import { luminance, onColorFor, needsLightOutline } from "./color.js";

describe("luminance()", () => {
  it("returns 0 for invalid hex", () => {
    expect(luminance("")).toBe(0);
    expect(luminance("xyz")).toBe(0);
    expect(luminance("#zz")).toBe(0);
    expect(luminance("notahex")).toBe(0);
  });

  it("returns 0 for pure black, 1 for pure white", () => {
    expect(luminance("#000000")).toBeCloseTo(0, 4);
    expect(luminance("#FFFFFF")).toBeCloseTo(1, 4);
  });

  it("supports short-form #RGB", () => {
    expect(luminance("#fff")).toBeCloseTo(1, 4);
    expect(luminance("#000")).toBeCloseTo(0, 4);
  });

  it("supports hex without leading #", () => {
    expect(luminance("FFFFFF")).toBeCloseTo(1, 4);
  });

  it("classifies bright yellows as light (>0.65)", () => {
    expect(luminance("#FFFF00")).toBeGreaterThan(0.65);
    expect(luminance("#FFEB3B")).toBeGreaterThan(0.65);
  });

  it("classifies typical brand blues/reds as dark (<0.65)", () => {
    expect(luminance("#0066ff")).toBeLessThan(0.65);
    expect(luminance("#1e3a8a")).toBeLessThan(0.65);
    expect(luminance("#EF4444")).toBeLessThan(0.65);
  });
});

describe("onColorFor()", () => {
  it("dark text on light brand", () => {
    expect(onColorFor("#FFFF00")).toBe("#0F172A");
  });
  it("white text on dark brand", () => {
    expect(onColorFor("#0066ff")).toBe("#FFFFFF");
    expect(onColorFor("#1e3a8a")).toBe("#FFFFFF");
  });
});

describe("needsLightOutline()", () => {
  it("true for pale primaries that would melt into white bg", () => {
    expect(needsLightOutline("#FFFF00")).toBe(true);
  });
  it("false for normal saturated primaries", () => {
    expect(needsLightOutline("#0066ff")).toBe(false);
  });
});
