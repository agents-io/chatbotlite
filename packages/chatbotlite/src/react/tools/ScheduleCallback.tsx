import { useEffect, useState, type ReactElement } from "react";

export interface ScheduleCallbackProps {
  durationMin?: number;
  timezone?: string;
  primary: string;
  onPrimary: string;
  border: string;
  surface: string;
  surfaceMuted: string;
  textBody: string;
  textMuted: string;
  /** Direct booking URL (Calendly, Cal.com, etc). When set, skip slot picker and show a single CTA. */
  bookingUrl?: string;
  /** Label for the booking CTA (default "Book appointment"). */
  bookingLabel?: string;
  getAvailableSlots: (args: { durationMin: number; timezone: string }) => Promise<string[]>;
  onConfirm: (slot: string) => Promise<void> | void;
  submitting?: boolean;
  submitted?: boolean;
  submittedSlot?: string;
}

export function ScheduleCallback(props: ScheduleCallbackProps): ReactElement {
  const {
    durationMin = 15,
    timezone = "UTC",
    primary, onPrimary, border, surface, surfaceMuted, textBody, textMuted,
    bookingUrl, bookingLabel,
    getAvailableSlots, onConfirm,
    submitting = false, submitted = false, submittedSlot
  } = props;
  const [slots, setSlots] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getAvailableSlots({ durationMin, timezone }).then((s) => {
      if (cancelled) return;
      setSlots(s);
      setLoading(false);
    }).catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [durationMin, timezone, getAvailableSlots]);

  if (bookingUrl) {
    return (
      <div style={{
        padding: 16,
        borderRadius: 14,
        background: surface,
        border: `1px solid ${border}`,
        boxShadow: "0 2px 8px -2px rgba(15,23,42,0.08)"
      }}>
        <p style={{ margin: 0, marginBottom: 12, fontSize: 13, fontWeight: 600, color: textBody }}>
          {bookingLabel || "Book appointment"}
        </p>
        <button
          onClick={() => { window.open(bookingUrl, "_blank", "noopener"); }}
          style={{
            width: "100%",
            padding: "9px 16px",
            borderRadius: 10,
            background: primary,
            color: onPrimary,
            border: "none",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer"
          }}
        >
          {bookingLabel || "Book appointment"}
        </button>
      </div>
    );
  }

  if (submitted && submittedSlot) {
    return (
      <div style={{
        padding: "12px 16px",
        borderRadius: 14,
        background: surface,
        border: `1px solid ${border}`,
        fontSize: 13,
        color: textBody
      }}>
        ✓ Booked for {formatSlot(submittedSlot)}
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
      <p style={{ margin: 0, marginBottom: 12, fontSize: 13, fontWeight: 600, color: textBody }}>
        Pick a {durationMin}-minute slot
      </p>
      {loading ? (
        <p style={{ fontSize: 12, color: textMuted }}>Loading availability…</p>
      ) : slots.length === 0 ? (
        <p style={{ fontSize: 12, color: textMuted }}>No slots available — the owner will follow up.</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {slots.map((slot) => {
            const isSel = selected === slot;
            return (
              <button
                key={slot}
                onClick={() => setSelected(slot)}
                style={{
                  padding: "8px 10px",
                  borderRadius: 10,
                  fontSize: 12,
                  fontWeight: isSel ? 600 : 500,
                  cursor: "pointer",
                  background: isSel ? `${primary}0d` : surfaceMuted,
                  color: textBody,
                  border: `1px solid ${isSel ? primary : border}`,
                  transition: "border-color 120ms ease, background 120ms ease"
                }}
              >
                {formatSlot(slot)}
              </button>
            );
          })}
        </div>
      )}
      <button
        onClick={() => { if (selected) void onConfirm(selected); }}
        disabled={!selected || submitting}
        style={{
          width: "100%",
          marginTop: 12,
          padding: "9px 16px",
          borderRadius: 10,
          background: primary,
          color: onPrimary,
          border: "none",
          fontSize: 13,
          fontWeight: 600,
          cursor: selected && !submitting ? "pointer" : "default",
          opacity: selected && !submitting ? 1 : 0.4
        }}
      >
        {submitting ? "Booking…" : "Confirm"}
      </button>
    </div>
  );
}

function formatSlot(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  } catch {
    return iso;
  }
}
