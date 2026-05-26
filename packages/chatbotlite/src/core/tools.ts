/**
 * Tool / skill system — LLM-triggered structured workflows.
 *
 * The bot emits a marker inline in its reply, like:
 *   [SKILL:uploadForReview purpose="T4 slip" accept="image/*,application/pdf"]
 *
 * The widget detects the marker, strips it from the displayed text, and renders
 * a structured card matching the tool name. The user completes the card; the
 * result is posted back as a system message in the next turn so the LLM knows
 * the tool completed.
 */

export interface ToolMarker {
  /** Tool name (e.g. "uploadForReview"). */
  name: string;
  /** Key-value args parsed from the marker. */
  args: Record<string, string | number | boolean>;
  /** Original marker text — used to strip from displayed reply. */
  raw: string;
}

const MARKER_RE = /\[SKILL:(\w+)((?:\s+\w+=(?:"[^"]*"|[\w./@*+,:-]+))*)\s*\]/g;
const ARG_RE = /(\w+)=("([^"]*)"|([\w./@*+,:-]+))/g;

function coerce(value: string): string | number | boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  return value;
}

/**
 * Parse all `[SKILL:...]` markers from a chunk of text.
 * Returns the markers in order; original text is preserved.
 */
export function parseToolMarkers(text: string): ToolMarker[] {
  const markers: ToolMarker[] = [];
  let m: RegExpExecArray | null;
  MARKER_RE.lastIndex = 0;
  while ((m = MARKER_RE.exec(text)) !== null) {
    const name = m[1]!;
    const argsRaw = m[2] ?? "";
    const args: Record<string, string | number | boolean> = {};
    let a: RegExpExecArray | null;
    ARG_RE.lastIndex = 0;
    while ((a = ARG_RE.exec(argsRaw)) !== null) {
      const key = a[1]!;
      const value = a[3] ?? a[4] ?? "";
      args[key] = coerce(value);
    }
    markers.push({ name, args, raw: m[0]! });
  }
  return markers;
}

/**
 * Remove all `[SKILL:...]` markers from a reply so the user only sees clean text.
 */
export function stripToolMarkers(text: string): string {
  return text.replace(MARKER_RE, "").replace(/\s+\n/g, "\n").trim();
}

/**
 * Build the system prompt addendum that tells the LLM which tools are available
 * and how to invoke them.
 */
export function buildToolsPromptAddendum(enabledTools: readonly string[]): string {
  if (enabledTools.length === 0) return "";
  const examples: Record<string, string> = {
    uploadForReview: '[SKILL:uploadForReview purpose="T4 slip" accept="image/*,application/pdf" maxMb=10] — collect a document for human review (bytes go to webhook, you never see content)',
    scheduleCallback: '[SKILL:scheduleCallback durationMin=15 timezone="America/Vancouver"] — let the user pick a callback time slot',
    requestPayment: '[SKILL:requestPayment amount=4250 currency="cad" reason="initial deposit"] — collect payment via inline card',
    pickerMessage: '[SKILL:pickerMessage prompt="What type of service?" options="Inspection,Repair,Emergency,Quote only"] — show tappable choice buttons; user picks one and the value is returned'
  };
  const lines = enabledTools
    .filter((t) => examples[t])
    .map((t) => `- ${examples[t]}`);
  if (lines.length === 0) return "";
  return [
    "",
    "## Available tools",
    "When you need one of these workflows, emit the marker INLINE in your reply.",
    "Write a short message first, THEN the marker. The marker will be replaced by an interactive card.",
    "Pause the conversation after emitting — wait for the tool result before continuing.",
    "",
    ...lines
  ].join("\n");
}
