import { test, expect } from "@playwright/test";

// Switch fixture server response mode for the next /api/chat hit.
async function setMode(request: import("@playwright/test").APIRequestContext, mode: string): Promise<void> {
  const r = await request.post(`http://127.0.0.1:4317/__mode/${mode}`);
  expect(r.ok()).toBeTruthy();
}

test.describe.configure({ mode: "serial" });

test.describe("chatbotlite widget", () => {
  test.beforeEach(async ({ request }) => {
    await setMode(request, "stream");
  });

  test("launcher renders + click opens panel + greeting visible", async ({ page }) => {
    await page.goto("/");
    const launcher = page.locator(".chatbotlite-launcher");
    await expect(launcher).toBeVisible();
    await launcher.click();
    await expect(page.getByText("Test Bot")).toBeVisible();
    await expect(page.getByText("Hello! Ask me something.")).toBeVisible();
  });

  test("send message → user bubble + streamed bot reply", async ({ page }) => {
    await page.goto("/");
    await page.locator(".chatbotlite-launcher").click();
    const input = page.locator(".chatbotlite-input");
    await input.fill("hi");
    await input.press("Enter");
    await expect(page.getByText("hi").first()).toBeVisible();
    // Streamed reply assembles to "Hi there! I am a bot."
    await expect(page.getByText("Hi there! I am a bot.")).toBeVisible({ timeout: 5_000 });
  });

  test("REGRESSION: 501 with HTML body → clean error, never dumps raw HTML", async ({ page, request }) => {
    await setMode(request, "err501");
    await page.goto("/");
    await page.locator(".chatbotlite-launcher").click();
    const input = page.locator(".chatbotlite-input");
    await input.fill("hi");
    await input.press("Enter");
    // Should show "Server returned 501" inside a "Sorry — something went wrong" bubble
    await expect(page.getByText(/Server returned 501/)).toBeVisible({ timeout: 5_000 });
    // Must NOT leak HTML doctype / tags into UI
    await expect(page.getByText(/DOCTYPE/i)).toHaveCount(0);
    await expect(page.getByText(/<html/)).toHaveCount(0);
  });

  test("500 plaintext error → clean bubble with status", async ({ page, request }) => {
    await setMode(request, "err500");
    await page.goto("/");
    await page.locator(".chatbotlite-launcher").click();
    await page.locator(".chatbotlite-input").fill("hi");
    await page.locator(".chatbotlite-input").press("Enter");
    await expect(page.getByText(/Server returned 500/)).toBeVisible({ timeout: 5_000 });
  });

  test("JSON fallback endpoint (non-SSE) works", async ({ page, request }) => {
    await setMode(request, "json");
    await page.goto("/");
    await page.locator(".chatbotlite-launcher").click();
    await page.locator(".chatbotlite-input").fill("hi");
    await page.locator(".chatbotlite-input").press("Enter");
    await expect(page.getByText("JSON mode reply")).toBeVisible({ timeout: 5_000 });
  });

  test("FAILOVER: partial stream then SSE error → partial tokens visible + clean error bubble, no crash", async ({ page, request }) => {
    // Simulates the documented failover behaviour: a provider streamed some tokens,
    // then the chain reported "all steps failed". The widget should keep the partial
    // tokens already rendered AND surface a clean error message — never crash, never
    // leak the raw JSON error payload to the DOM.
    await setMode(request, "partial-error");
    await page.goto("/");
    await page.locator(".chatbotlite-launcher").click();
    const input = page.locator(".chatbotlite-input");
    await input.fill("how much is a leak inspection?");
    await input.press("Enter");

    // Partial tokens that streamed before the error should remain in the DOM.
    // We assert on either bubble (assistant streamed bubble + new error bubble) being present.
    await expect(page.getByText(/Sink leak/)).toBeVisible({ timeout: 5_000 });

    // An error indication must appear (the widget renders "Sorry — something went wrong"
    // when it receives an SSE error event mid-stream).
    await expect(page.getByText(/Sorry|something went wrong|chain steps failed/i)).toBeVisible({ timeout: 5_000 });

    // The raw JSON error payload must NOT leak into the DOM as literal text.
    await expect(page.getByText(/"attempts":\s*\[/)).toHaveCount(0);
    await expect(page.getByText(/"latencyMs"/)).toHaveCount(0);

    // After the error the widget must remain usable: input is still there, can type again.
    await expect(input).toBeVisible();
    await expect(input).toBeEnabled();
  });

  test("CSS tokens scoped to .chatbotlite-root resolve from injected stylesheet", async ({ page }) => {
    await page.goto("/");
    const v = await page.evaluate(() => {
      const el = document.querySelector(".chatbotlite-launcher") as HTMLElement;
      const style = getComputedStyle(el);
      return {
        primary: style.getPropertyValue("--cbl-primary").trim(),
        bg: style.getPropertyValue("--cbl-bg").trim()
      };
    });
    expect(v.primary).toBeTruthy();
    expect(v.bg).toBeTruthy();
  });
});
