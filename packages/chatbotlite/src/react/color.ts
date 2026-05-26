// Pure color utilities, isolated from React for easy unit testing.

/**
 * WCAG relative luminance for a hex color. Returns 0-1.
 * > 0.65 ≈ light (yellow / lime / pale) → caller should pick dark text on the bubble.
 * Accepts "#RGB", "#RRGGBB", or bare "RRGGBB" forms. Invalid input → 0.
 */
export function luminance(hex: string): number {
  const m = hex.replace("#", "");
  const norm = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  if (norm.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(norm)) return 0;
  const r = parseInt(norm.slice(0, 2), 16) / 255;
  const g = parseInt(norm.slice(2, 4), 16) / 255;
  const b = parseInt(norm.slice(4, 6), 16) / 255;
  const toLinear = (c: number): number => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/**
 * Returns the recommended on-color text token for a given background hex.
 * Threshold 0.65 — anything brighter (yellow, lime, pale pink) needs dark text.
 */
export function onColorFor(hex: string): "#0F172A" | "#FFFFFF" {
  return luminance(hex) > 0.65 ? "#0F172A" : "#FFFFFF";
}

/** True when the brand color is light enough that the user bubble needs a hairline outline. */
export function needsLightOutline(hex: string): boolean {
  return luminance(hex) > 0.65;
}
