/**
 * URL-only adapters — zero backend, zero API keys.
 * Customer pastes a URL, we open it in a new tab.
 *
 * Each adapter returns a partial tool config that plugs directly into
 * ChatWidget's `tools` prop or the embed mount config.
 */

// ─── Types ──────────────────────────────────────────────────────────

export interface PaymentAdapterConfig {
  paymentLink: string;
  paymentLabel?: string;
  paymentIcon?: string;
  showInterac?: boolean;
  onPick: (args: { method: string; amount: number; currency: string }) => Promise<{ status: string; [k: string]: unknown }>;
}

export interface ScheduleAdapterConfig {
  bookingUrl: string;
  bookingLabel?: string;
  getAvailableSlots: (args: { durationMin: number; timezone: string }) => Promise<string[]>;
  onConfirm: (args: { slot: string }) => Promise<{ confirmedAt?: string; joinUrl?: string; [k: string]: unknown }>;
}

export interface LeadCaptureAdapterConfig {
  formUrl: string;
  formLabel?: string;
  handler: (args: { name?: string; email?: string; message?: string }) => Promise<{ status: string; [k: string]: unknown }>;
}

// ─── Payment adapters ───────────────────────────────────────────────

function makePaymentAdapter(url: string, label: string): PaymentAdapterConfig {
  return {
    paymentLink: url,
    paymentLabel: label,
    showInterac: false,
    onPick: async ({ method }) => {
      window.open(url, "_blank", "noopener");
      return { status: "opened", method, url };
    }
  };
}

export function stripeLink(url: string): PaymentAdapterConfig {
  return makePaymentAdapter(url, "Pay by card");
}

export function paypalLink(url: string): PaymentAdapterConfig {
  return makePaymentAdapter(url, "Pay with PayPal");
}

export function squareLink(url: string): PaymentAdapterConfig {
  return makePaymentAdapter(url, "Pay with Square");
}

export function lemonSqueezyLink(url: string): PaymentAdapterConfig {
  return makePaymentAdapter(url, "Complete purchase");
}

export function gumroadLink(url: string): PaymentAdapterConfig {
  return makePaymentAdapter(url, "Buy on Gumroad");
}

// ─── Schedule adapters ──────────────────────────────────────────────

function makeScheduleAdapter(url: string, label: string): ScheduleAdapterConfig {
  return {
    bookingUrl: url,
    bookingLabel: label,
    getAvailableSlots: async () => [],
    onConfirm: async () => {
      window.open(url, "_blank", "noopener");
      return { confirmedAt: new Date().toISOString() };
    }
  };
}

export function calendlyUrl(url: string): ScheduleAdapterConfig {
  return makeScheduleAdapter(url, "Book on Calendly");
}

export function calcomUrl(url: string): ScheduleAdapterConfig {
  return makeScheduleAdapter(url, "Book on Cal.com");
}

export function savvycalUrl(url: string): ScheduleAdapterConfig {
  return makeScheduleAdapter(url, "Book on SavvyCal");
}

export function acuityUrl(url: string): ScheduleAdapterConfig {
  return makeScheduleAdapter(url, "Book on Acuity");
}

export function msBookingsUrl(url: string): ScheduleAdapterConfig {
  return makeScheduleAdapter(url, "Book on Microsoft Bookings");
}

export function googleCalendarApptUrl(url: string): ScheduleAdapterConfig {
  return makeScheduleAdapter(url, "Book on Google Calendar");
}

// ─── Lead capture adapters ──────────────────────────────────────────

function makeLeadCaptureAdapter(url: string, label: string): LeadCaptureAdapterConfig {
  return {
    formUrl: url,
    formLabel: label,
    handler: async () => {
      window.open(url, "_blank", "noopener");
      return { status: "opened", url };
    }
  };
}

export function formspreeUrl(url: string): LeadCaptureAdapterConfig {
  return makeLeadCaptureAdapter(url, "Open form");
}

export function tallyUrl(url: string): LeadCaptureAdapterConfig {
  return makeLeadCaptureAdapter(url, "Open form");
}
