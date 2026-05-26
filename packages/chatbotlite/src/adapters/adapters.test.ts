import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  stripeLink,
  paypalLink,
  squareLink,
  lemonSqueezyLink,
  gumroadLink,
  calendlyUrl,
  calcomUrl,
  savvycalUrl,
  acuityUrl,
  msBookingsUrl,
  googleCalendarApptUrl,
  formspreeUrl,
  tallyUrl,
} from "./index.js";

const openSpy = vi.fn();

beforeEach(() => {
  openSpy.mockClear();
  vi.stubGlobal("open", openSpy);
  if (typeof window !== "undefined") {
    window.open = openSpy;
  }
});

describe("payment adapters", () => {
  it("stripeLink returns config with paymentLink and onPick", () => {
    const cfg = stripeLink("https://buy.stripe.com/test");
    expect(cfg.paymentLink).toBe("https://buy.stripe.com/test");
    expect(cfg.paymentLabel).toBe("Pay by card");
    expect(cfg.showInterac).toBe(false);
    expect(typeof cfg.onPick).toBe("function");
  });

  it("paypalLink opens URL on onPick", async () => {
    const cfg = paypalLink("https://paypal.me/biz");
    const result = await cfg.onPick({ method: "paypal", amount: 1000, currency: "usd" });
    expect(openSpy).toHaveBeenCalledWith("https://paypal.me/biz", "_blank", "noopener");
    expect(result.status).toBe("opened");
  });

  it("squareLink has correct label", () => {
    expect(squareLink("https://square.link/x").paymentLabel).toBe("Pay with Square");
  });

  it("lemonSqueezyLink has correct label", () => {
    expect(lemonSqueezyLink("https://lemonsqueezy.com/x").paymentLabel).toBe("Complete purchase");
  });

  it("gumroadLink has correct label", () => {
    expect(gumroadLink("https://gumroad.com/x").paymentLabel).toBe("Buy on Gumroad");
  });
});

describe("schedule adapters", () => {
  it("calendlyUrl returns config with bookingUrl", () => {
    const cfg = calendlyUrl("https://calendly.com/biz/30min");
    expect(cfg.bookingUrl).toBe("https://calendly.com/biz/30min");
    expect(cfg.bookingLabel).toBe("Book on Calendly");
  });

  it("calcomUrl opens URL on onConfirm", async () => {
    const cfg = calcomUrl("https://cal.com/biz/30min");
    await cfg.onConfirm({ slot: "2026-01-01T10:00:00Z" });
    expect(openSpy).toHaveBeenCalledWith("https://cal.com/biz/30min", "_blank", "noopener");
  });

  it("getAvailableSlots returns empty array for URL adapters", async () => {
    const cfg = savvycalUrl("https://savvycal.com/biz");
    const slots = await cfg.getAvailableSlots({ durationMin: 30, timezone: "UTC" });
    expect(slots).toEqual([]);
  });

  it("acuityUrl has correct label", () => {
    expect(acuityUrl("https://acuity.com/x").bookingLabel).toBe("Book on Acuity");
  });

  it("msBookingsUrl has correct label", () => {
    expect(msBookingsUrl("https://outlook.office365.com/x").bookingLabel).toBe("Book on Microsoft Bookings");
  });

  it("googleCalendarApptUrl has correct label", () => {
    expect(googleCalendarApptUrl("https://calendar.google.com/x").bookingLabel).toBe("Book on Google Calendar");
  });
});

describe("lead capture adapters", () => {
  it("formspreeUrl returns config with formUrl", () => {
    const cfg = formspreeUrl("https://formspree.io/f/abc");
    expect(cfg.formUrl).toBe("https://formspree.io/f/abc");
    expect(cfg.formLabel).toBe("Open form");
  });

  it("tallyUrl opens URL on handler", async () => {
    const cfg = tallyUrl("https://tally.so/r/xyz");
    const result = await cfg.handler({});
    expect(openSpy).toHaveBeenCalledWith("https://tally.so/r/xyz", "_blank", "noopener");
    expect(result.status).toBe("opened");
  });
});
