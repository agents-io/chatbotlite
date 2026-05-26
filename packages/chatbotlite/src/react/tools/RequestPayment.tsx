import { type ReactElement } from "react";

export interface RequestPaymentProps {
  amount: number;        // in smallest currency unit (e.g. cents)
  currency?: string;
  reason?: string;
  primary: string;
  onPrimary: string;
  border: string;
  surface: string;
  surfaceMuted: string;
  textBody: string;
  textMuted: string;
  /** Show Interac e-Transfer option. Default false — Canada-only. Opt-in for CA SMBs. */
  showInterac?: boolean;
  /** Optional Stripe Payment Link URL — falls back to this if Elements not configured. */
  stripeLink?: string;
  /** Generic payment link URL (PayPal, Square, LemonSqueezy, Gumroad, etc). Opens in new tab on click. */
  paymentLink?: string;
  /** Custom label for the payment button (default "Pay by card"). */
  paymentLabel?: string;
  /** Called when user picks a method. Customer wires actual checkout. */
  onPick: (method: "interac" | "stripe" | string) => Promise<void> | void;
  submitting?: boolean;
  submitted?: boolean;
  submittedMethod?: "interac" | "stripe";
}

function formatAmount(amountMinor: number, currency = "USD"): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency.toUpperCase(),
      minimumFractionDigits: 2
    }).format(amountMinor / 100);
  } catch {
    return `${currency.toUpperCase()} ${(amountMinor / 100).toFixed(2)}`;
  }
}

export function RequestPayment(props: RequestPaymentProps): ReactElement {
  const {
    amount, currency = "USD", reason,
    primary, border, surface, textBody, textMuted,
    showInterac = false, stripeLink, paymentLink, paymentLabel,
    onPick,
    submitting = false, submitted = false, submittedMethod
  } = props;
  const resolvedLink = paymentLink || stripeLink;
  const resolvedLabel = paymentLabel || "Pay by card";
  const formatted = formatAmount(amount, currency);

  if (submitted) {
    return (
      <div style={{
        padding: "12px 16px",
        borderRadius: 14,
        background: surface,
        border: `1px solid ${border}`,
        fontSize: 13,
        color: textBody
      }}>
        ✓ {submittedMethod === "interac" ? "Interac request sent — instructions to follow" : "Payment opened"} · {formatted}
      </div>
    );
  }

  return (
    <div style={{
      padding: 16,
      borderRadius: 14,
      background: surface,
      border: `1px solid ${border}`,
      boxShadow: "0 2px 8px -2px rgba(15,23,42,0.08)"
    }}>
      <div style={{ marginBottom: 12 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: textBody }}>
          {reason || "Payment required"}
        </p>
        <p style={{ margin: "2px 0 0", fontSize: 20, fontWeight: 700, color: textBody, letterSpacing: "-0.01em" }}>
          {formatted}
        </p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {showInterac && (
          <button
            onClick={() => void onPick("interac")}
            disabled={submitting}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: 12,
              borderRadius: 12,
              background: surface,
              border: `1px solid ${border}`,
              cursor: submitting ? "default" : "pointer",
              opacity: submitting ? 0.5 : 1,
              textAlign: "left",
              transition: "border-color 120ms ease"
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = primary; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = border; }}
          >
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: "#FFBE2E1f",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 18, fontWeight: 700, color: "#B8860B", flexShrink: 0
            }}>$</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: textBody }}>Interac e-Transfer</p>
              <p style={{ margin: "2px 0 0", fontSize: 11, color: textMuted }}>Instant, no fees</p>
            </div>
          </button>
        )}
        <button
          onClick={() => { if (resolvedLink) window.open(resolvedLink, "_blank", "noopener"); void onPick("stripe"); }}
          disabled={submitting}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: 12,
            borderRadius: 12,
            background: surface,
            border: `1px solid ${border}`,
            cursor: submitting ? "default" : "pointer",
            opacity: submitting ? 0.5 : 1,
            textAlign: "left",
            transition: "border-color 120ms ease"
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = primary; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = border; }}
        >
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: "#635BFF1a",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
            color: "#635BFF"
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="2" y="5" width="20" height="14" rx="2.5" />
              <line x1="2" y1="10" x2="22" y2="10" />
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: textBody }}>{resolvedLabel}</p>
            <p style={{ margin: "2px 0 0", fontSize: 11, color: textMuted }}>Visa · Mastercard · Amex</p>
          </div>
        </button>
      </div>
    </div>
  );
}
