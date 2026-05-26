import { type ReactElement } from "react";

export interface PickerMessageProps {
  prompt?: string;
  options: string[];
  primary: string;
  onPrimary: string;
  border: string;
  surface: string;
  surfaceMuted: string;
  textBody: string;
  textMuted: string;
  onPick: (value: string) => Promise<void> | void;
  submitting?: boolean;
  submitted?: boolean;
  submittedValue?: string;
}

export function PickerMessage(props: PickerMessageProps): ReactElement {
  const {
    prompt, options,
    primary, border, surface, surfaceMuted, textBody,
    onPick,
    submitting = false, submitted = false, submittedValue
  } = props;

  if (submitted && submittedValue) {
    return (
      <div style={{
        padding: "12px 16px",
        borderRadius: 14,
        background: surface,
        border: `1px solid ${border}`,
        fontSize: 13,
        color: textBody
      }}>
        ✓ {submittedValue}
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
      {prompt && (
        <p style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 600, color: textBody }}>
          {prompt}
        </p>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {options.map((opt) => (
          <button
            key={opt}
            onClick={() => void onPick(opt)}
            disabled={submitting}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 500,
              cursor: submitting ? "default" : "pointer",
              opacity: submitting ? 0.5 : 1,
              background: surfaceMuted,
              color: textBody,
              border: `1px solid ${border}`,
              textAlign: "left",
              transition: "border-color 120ms ease, background 120ms ease"
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = primary;
              (e.currentTarget as HTMLButtonElement).style.background = `${primary}0d`;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = border;
              (e.currentTarget as HTMLButtonElement).style.background = surfaceMuted;
            }}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}
