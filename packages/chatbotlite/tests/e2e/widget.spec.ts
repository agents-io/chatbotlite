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
