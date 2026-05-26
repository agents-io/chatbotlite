# SKILL Marker Protocol — v1.0

> An open convention for LLM-triggered interactive UI cards in chat interfaces.
>
> Any chat widget library can adopt this protocol. ChatbotLite is the reference implementation.

---

## Overview

The SKILL marker protocol defines how a language model triggers structured UI workflows inline in a chat reply. The model emits a text marker; the chat widget parses it, strips it from the displayed text, and renders an interactive card in its place.

This decouples the LLM from the UI. The model doesn't need to know what framework renders the card, and the widget doesn't need to know which model emitted the marker. Any LLM that can output text can participate.

## Marker syntax

```
[SKILL:<name> <key>=<value> ...]
```

### Rules

1. Markers appear inline in the LLM's reply text, typically after a short introductory sentence.
2. `<name>` is a camelCase identifier (e.g., `requestPayment`, `scheduleCallback`, `pickerMessage`).
3. Arguments are space-separated `key=value` pairs.
4. String values are double-quoted: `reason="initial deposit"`.
5. Numeric values are unquoted: `amount=4250`.
6. Boolean values are unquoted: `showInterac=true`.
7. Commas inside quoted strings are preserved: `options="Option A,Option B,Option C"`.
8. Multiple markers may appear in a single reply.
9. The widget strips all markers before displaying the reply text.

### Formal grammar

```
marker     = "[SKILL:" name args "]"
name       = [a-zA-Z][a-zA-Z0-9]*
args       = (SP arg)*
arg        = key "=" value
key        = [a-zA-Z][a-zA-Z0-9]*
value      = quoted / number / boolean / bare
quoted     = DQUOTE [^"]* DQUOTE
number     = "-"? DIGIT+ ("." DIGIT+)?
boolean    = "true" / "false"
bare       = [a-zA-Z0-9./@*+,:-]+
```

### Regex (JavaScript)

```js
const MARKER_RE = /\[SKILL:(\w+)((?:\s+\w+=(?:"[^"]*"|[\w./@*+,:-]+))*)\s*\]/g;
```

## Standard markers

These markers are part of the v1.0 protocol. Implementations should support all of them.

### requestPayment

Collect a payment from the user.

```
[SKILL:requestPayment amount=4250 currency="cad" reason="initial deposit"]
```

| Arg | Type | Required | Description |
|---|---|---|---|
| `amount` | number | yes | Amount in smallest currency unit (e.g., cents) |
| `currency` | string | no | ISO 4217 code. Default: `"USD"` |
| `reason` | string | no | Human-readable reason displayed on the card |

**Widget renders**: A payment card with amount, reason, and one or more payment method buttons. The widget opens the configured payment link (Stripe, PayPal, etc.) or calls the customer's `onPick` handler.

**Result posted back**: `{ status: "opened" | "completed", method: "stripe" | "paypal" | ... }`

### scheduleCallback

Let the user pick a time slot or open a booking page.

```
[SKILL:scheduleCallback durationMin=15 timezone="America/Vancouver"]
```

| Arg | Type | Required | Description |
|---|---|---|---|
| `durationMin` | number | no | Slot duration in minutes. Default: 15 |
| `timezone` | string | no | IANA timezone. Default: `"UTC"` |

**Widget renders**: Either a slot-picker grid (when `getAvailableSlots` is provided) or a single booking CTA button (when `bookingUrl` is provided via adapter).

**Result posted back**: `{ confirmedAt: "ISO-8601", joinUrl?: "https://..." }`

### uploadForReview

Collect one or more files from the user.

```
[SKILL:uploadForReview purpose="T4 slip" accept="image/*,application/pdf" maxMb=10]
```

| Arg | Type | Required | Description |
|---|---|---|---|
| `purpose` | string | no | Displayed label explaining what the file is for |
| `accept` | string | no | Comma-separated MIME types or extensions |
| `maxMb` | number | no | Maximum file size in megabytes. Default: 10 |

**Widget renders**: A drag-and-drop file upload zone with the purpose label.

**Result posted back**: `{ status: "received", filename: "doc.pdf", count: 1 }`

### pickerMessage

Present tappable choice buttons. User picks one, value is returned.

```
[SKILL:pickerMessage prompt="What type of service?" options="Inspection,Repair,Emergency,Quote only"]
```

| Arg | Type | Required | Description |
|---|---|---|---|
| `prompt` | string | no | Question displayed above the buttons |
| `options` | string | yes | Comma-separated list of choices |

**Widget renders**: A card with the prompt text and one button per option.

**Result posted back**: `{ status: "picked", value: "Inspection" }`

## Protocol lifecycle

1. **LLM emits marker** inline in reply text: `"I can help with that. [SKILL:requestPayment amount=9500 currency="usd" reason="Leak inspection"]"`
2. **Widget parses** the marker(s) from the text using the regex above.
3. **Widget strips** all markers from the displayed text. User sees: `"I can help with that."`
4. **Widget renders** the matching interactive card below the message bubble.
5. **User interacts** with the card (picks a slot, uploads a file, taps a button).
6. **Widget posts result** as a system message in the next conversation turn, so the LLM knows the tool completed.
7. **LLM acknowledges** the result in its next reply.

The LLM should **pause after emitting a marker** and wait for the tool result before continuing the conversation.

## System prompt addendum

To teach an LLM about available tools, append this to the system prompt:

```
## Available tools
When you need one of these workflows, emit the marker INLINE in your reply.
Write a short message first, THEN the marker. The marker will be replaced by an interactive card.
Pause the conversation after emitting — wait for the tool result before continuing.

- [SKILL:requestPayment amount=4250 currency="cad" reason="initial deposit"] — collect payment via inline card
- [SKILL:scheduleCallback durationMin=15 timezone="America/Vancouver"] — let the user pick a callback time slot
- [SKILL:uploadForReview purpose="T4 slip" accept="image/*,application/pdf" maxMb=10] — collect a document for human review
- [SKILL:pickerMessage prompt="What type of service?" options="Inspection,Repair,Emergency,Quote only"] — show tappable choice buttons
```

## Extending the protocol

Libraries can define custom markers beyond the standard set. Custom markers should use a namespaced name to avoid collisions:

```
[SKILL:myapp.createTicket priority="high" assignee="sarah"]
```

The convention is `<namespace>.<action>` with a dot separator.

## Reference implementation

- **Parser**: [`chatbotlite/core`](https://github.com/agents-io/chatbotlite) — `parseToolMarkers()`, `stripToolMarkers()`, `buildToolsPromptAddendum()`
- **Widget**: [`chatbotlite/react`](https://github.com/agents-io/chatbotlite) — `ChatWidget` renders cards for all standard markers
- **npm**: `npm install chatbotlite`

## Adopting this protocol

If your library implements SKILL markers, add to your README:

```
Implements the [SKILL Marker Protocol](https://github.com/agents-io/chatbotlite/blob/main/SKILL_MARKER_SPEC.md) v1.0
```

## License

This specification is released under [Apache 2.0](https://www.apache.org/licenses/LICENSE-2.0). You may implement it in any project, commercial or open-source, without attribution (though attribution is appreciated).

## Versioning

- **v1.0** (2026-05-26): Initial release. Four standard markers: `requestPayment`, `scheduleCallback`, `uploadForReview`, `pickerMessage`.
