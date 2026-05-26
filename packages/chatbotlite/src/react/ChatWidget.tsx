import { useState, useRef, useEffect, useMemo, type ReactElement, type CSSProperties } from "react";
import { luminance } from "./color.js";
import type { Knowledge, Message } from "../core/types.js";
import { ChatBot } from "../client/chatbot.js";
import type { ProviderConfig } from "../client/types.js";
import { parseToolMarkers, stripToolMarkers, type ToolMarker } from "../core/tools.js";
import { UploadForReview } from "./tools/UploadForReview.js";
import { ScheduleCallback } from "./tools/ScheduleCallback.js";
import { RequestPayment } from "./tools/RequestPayment.js";
import { PickerMessage } from "./tools/PickerMessage.js";
import { LocalChatStorage, type ChatStorage, type StoredMessage } from "./storage.js";

export interface ChatWidgetTools {
  uploadForReview?: {
    handler: (args: { files: File[]; purpose: string }) => Promise<{ status?: string; message?: string; [k: string]: unknown }>;
  };
  scheduleCallback?: {
    bookingUrl?: string;
    bookingLabel?: string;
    getAvailableSlots: (args: { durationMin: number; timezone: string }) => Promise<string[]>;
    onConfirm: (args: { slot: string }) => Promise<{ confirmedAt?: string; joinUrl?: string; [k: string]: unknown }>;
  };
  requestPayment?: {
    showInterac?: boolean;
    stripeLink?: string;
    paymentLink?: string;
    paymentLabel?: string;
    onPick: (args: { method: "interac" | "stripe" | string; amount: number; currency: string }) => Promise<{ status?: string; [k: string]: unknown }>;
  };
  pickerMessage?: {
    onPick: (args: { value: string; prompt?: string }) => Promise<{ status?: string; [k: string]: unknown }>;
  };
}

interface ChatWidgetCommonProps {
  /** Optional theme overrides. */
  theme?: {
    /** Brand color used on launcher, header, user message bubbles, send button. */
    primary?: string;
    /** Optional explicit text color for primary surfaces (defaults to white/contrast). */
    onPrimary?: string;
  };
  /** Header title shown when widget is open. */
  title?: string;
  /** Optional subtitle under the title (e.g. "We typically reply in minutes"). */
  subtitle?: string;
  /** Initial greeting (defaults to "Hi! How can we help?"). */
  greeting?: string;
  /** Show "Powered by chatbotlite" footer (default true). Free tier marker. */
  showBranding?: boolean;
  /** Position of the launcher bubble. */
  position?: "bottom-right" | "bottom-left";
  /** Inline file attach (always-on 📎 next to input). Disabled by default. */
  attach?: {
    enabled: boolean;
    /** MIME types or file extensions to accept (e.g. ["image/*", ".pdf"]). Default: any. */
    accept?: string[];
    /** Max file size in MB (default 10). */
    maxSizeMb?: number;
    /** Max number of files per message (default 5). */
    maxFiles?: number;
  };
  /** Voice input (🎙️ next to input). Uses Web Speech API — browser-native, free. */
  voice?: {
    enabled: boolean;
    /** BCP-47 language tag (default "en-US"). */
    lang?: string;
  };
  /** LLM-triggered tool registry. Bot emits `[SKILL:name args]` → widget renders matching card. */
  tools?: ChatWidgetTools;
  /**
   * Header avatar. Defaults to NONE (no avatar, just title) — most website chatbots don't
   * need one.
   * - `true`  → circular badge with first letter of `title` on brand color
   * - `"https://..."` → image URL (rendered in 32px circle)
   * - omit / `false` → no avatar (default)
   */
  avatar?: boolean | string;
  /**
   * Launcher button icon. Customer override for the floating button glyph.
   * - omit → default chat-bubble SVG
   * - emoji string (e.g. "⚡", "💬", "🤖")
   * - URL → rendered as image
   */
  launcherIcon?: string;
  /**
   * Open the chat panel on mount instead of showing only the launcher.
   * Good for demo / landing pages where the visitor should see the bot
   * immediately. Default false — production sites usually want the
   * launcher-first behaviour so the chrome stays unobtrusive.
   */
  defaultOpen?: boolean;
  /** Session ID for conversation persistence. When set, messages are saved/loaded via storage. */
  sessionId?: string;
  /** Pluggable storage backend. Default: localStorage. Pass your own to wire to a DB or API. */
  storage?: ChatStorage;
}

interface ChatWidgetDirectProps extends ChatWidgetCommonProps {
  /** Markdown knowledge for the bot. Client-side mode — API keys WILL be exposed. */
  knowledge: Knowledge;
  /** Provider chain + API keys. */
  providers: ProviderConfig;
  /**
   * Append per-vertical behaviour tweaks to the default system prompt
   * (tone, escalation rules, "don't quote price too early", etc.).
   * Only used in direct (client-side) mode — in endpoint mode the server
   * controls the prompt.
   */
  extraInstructions?: string;
  /**
   * Power-user hook to modify our default scaffolding inline.
   * Receives the assembled default prompt, returns a transformed string.
   * Direct mode only.
   */
  systemPromptTransform?: (defaultPrompt: string) => string;
  endpoint?: never;
}

interface ChatWidgetEndpointProps extends ChatWidgetCommonProps {
  /** POST URL of your server route (e.g. "/api/chat"). Server should accept { message, transcript } and return { reply }. */
  endpoint: string;
  knowledge?: never;
  providers?: never;
}

export type ChatWidgetProps = ChatWidgetDirectProps | ChatWidgetEndpointProps;

interface PendingTool {
  /** ID of the assistant message this tool is attached to. */
  messageId: string;
  marker: ToolMarker;
  status: "pending" | "submitting" | "submitted";
  result?: Record<string, unknown>;
}

interface ChatMessage extends Message {
  id: string;
  ts: number;
}

const DEFAULT_PRIMARY = "#0f172a";
const DEFAULT_ON_PRIMARY = "#ffffff";
const DEFAULT_LOGO = "data:image/png;base64,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";

// Inline SVG icons — premium-feel, no emoji in chrome. Sized via width/height on caller.
const IconPaperclip = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  </svg>
);
const IconMic = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="9" y="3" width="6" height="12" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 19v3" />
  </svg>
);
const IconBolt = ({ size = 11 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ verticalAlign: "-1px" }}>
    <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />
  </svg>
);

// Design tokens — see DESIGN_SYSTEM.md for spec. All visual constants resolve to CSS vars
// declared inside the injected stylesheet. Override per-instance: set inline CSS vars on
// the .chatbotlite-root element (e.g. theme.primary populates --cbl-primary).
// Host page CSS can override too — `.chatbotlite-root { --cbl-bg: #1a1a1a }`.
const SURFACE = "var(--cbl-bg)";
const CHAT_BG = "var(--cbl-bg-chat)";
const BUBBLE_BOT = "var(--cbl-bg-elevated)";
const INPUT_BG = "var(--cbl-bg-sunken)";
const BORDER = "var(--cbl-border)";
const TEXT_BODY = "var(--cbl-text)";
const TEXT_MUTED = "var(--cbl-text-muted)";
const TEXT_FAINT = "var(--cbl-text-faint)";
const FONT_STACK = "var(--cbl-font)";

const STYLE_TAG_ID = "chatbotlite-widget-styles";
const TOKENS = `
:where(.chatbotlite-root) {
  --cbl-bg: #FFFFFF;
  --cbl-bg-elevated: #FFFFFF;
  --cbl-bg-chat: #F7F8FA;
  --cbl-bg-sunken: #F1F3F5;
  --cbl-border: #E5E7EB;
  --cbl-border-strong: #D1D5DB;
  --cbl-border-light: rgba(15,23,42,0.06);
  --cbl-text: #0F172A;
  --cbl-text-muted: #64748B;
  --cbl-text-faint: #94A3B8;
  --cbl-success: #10B981;
  --cbl-danger: #EF4444;
  /* Soft tint of primary brand color — used for header background, avatar bg fallback.
     12% mix keeps chrome neutral but lets the panel feel branded on colored vertical pages. */
  --cbl-primary-soft: color-mix(in oklab, var(--cbl-primary, #0F172A) 10%, white);
  --cbl-font: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", system-ui, sans-serif;
  --cbl-ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --cbl-ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
  --cbl-ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
  --cbl-shadow-1: 0 1px 2px rgba(15,23,42,0.04);
  --cbl-shadow-2: 0 4px 12px rgba(15,23,42,0.06), 0 1px 2px rgba(15,23,42,0.04);
  --cbl-shadow-3: 0 10px 32px rgba(15,23,42,0.10), 0 2px 6px rgba(15,23,42,0.04);
  --cbl-shadow-4: 0 20px 48px rgba(15,23,42,0.18), 0 4px 12px rgba(15,23,42,0.08);
}
@media (prefers-color-scheme: dark) {
  :where(.chatbotlite-root[data-color-scheme="auto"]),
  :where(.chatbotlite-root[data-color-scheme="dark"]) {
    --cbl-bg: #16181D;
    --cbl-bg-elevated: #1F2228;
    --cbl-bg-chat: #0B0D10;
    --cbl-bg-sunken: #1F2228;
    --cbl-border: #24272E;
    --cbl-border-strong: #2E323A;
    --cbl-border-light: rgba(255,255,255,0.06);
    --cbl-text: #ECEDEE;
    --cbl-text-muted: #9BA1A6;
    --cbl-text-faint: #6B7177;
  }
}
:where(.chatbotlite-root[data-color-scheme="light"]) {
  --cbl-bg: #FFFFFF;
  --cbl-bg-elevated: #FFFFFF;
  --cbl-bg-chat: #F7F8FA;
  --cbl-bg-sunken: #F1F3F5;
  --cbl-border: #E5E7EB;
  --cbl-border-strong: #D1D5DB;
  --cbl-border-light: rgba(15,23,42,0.06);
  --cbl-text: #0F172A;
  --cbl-text-muted: #64748B;
  --cbl-text-faint: #94A3B8;
}
`;

const KEYFRAMES = `
@keyframes chatbotlite-pop { 0% { opacity: 0; transform: scale(0.6); } 100% { opacity: 1; transform: scale(1); } }
@keyframes chatbotlite-slide { 0% { opacity: 0; transform: translateY(16px) scale(0.98); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes chatbotlite-fade-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
@keyframes chatbotlite-dot { 0%, 60%, 100% { transform: translateY(0); opacity: 0.4; } 30% { transform: translateY(-4px); opacity: 1; } }
@keyframes chatbotlite-cursor { 0%, 50% { opacity: 1; } 51%, 100% { opacity: 0.2; } }
@keyframes chatbotlite-pulse { 0%, 100% { box-shadow: 0 12px 28px -8px rgba(15,23,42,0.32), 0 4px 8px -2px rgba(15,23,42,0.12); } 50% { box-shadow: 0 14px 32px -8px rgba(15,23,42,0.36), 0 6px 12px -2px rgba(15,23,42,0.16); } }
.chatbotlite-launcher { transition: transform 180ms cubic-bezier(0.4, 0, 0.2, 1), box-shadow 180ms cubic-bezier(0.4, 0, 0.2, 1); animation: chatbotlite-pop 320ms cubic-bezier(0.34, 1.56, 0.64, 1), chatbotlite-pulse 3.6s ease-in-out 1.2s 2; }
.chatbotlite-launcher:hover { transform: translateY(-2px) scale(1.04); }
.chatbotlite-launcher:active { transform: translateY(0) scale(0.98); }
.chatbotlite-close { transition: background 120ms ease, color 120ms ease; }
.chatbotlite-close:hover { background: rgba(15,23,42,0.06); color: ${TEXT_BODY}; }
.chatbotlite-send { transition: transform 120ms ease, opacity 120ms ease, box-shadow 120ms ease; }
.chatbotlite-send:not(:disabled):hover { transform: translateY(-1px); }
.chatbotlite-send:not(:disabled):active { transform: translateY(0); }
.chatbotlite-input:focus { box-shadow: none; outline: none; }
.chatbotlite-composer { transition: background 120ms ease, box-shadow 120ms ease; }
.chatbotlite-composer:focus-within { background: ${SURFACE}; box-shadow: 0 0 0 1px ${BORDER}, 0 1px 2px rgba(15,23,42,0.04); }
.chatbotlite-msg { animation: chatbotlite-fade-in 220ms cubic-bezier(0.4, 0, 0.2, 1); }
.chatbotlite-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: ${TEXT_FAINT}; margin-right: 4px; animation: chatbotlite-dot 1.2s ease-in-out infinite; }
.chatbotlite-cursor { display: inline-block; width: 0.5ch; vertical-align: text-bottom; margin-left: 1px; font-size: inherit; line-height: inherit; animation: chatbotlite-cursor 1s ease-in-out infinite; }
.chatbotlite-icon-btn:hover:not(:disabled) { background: rgba(15,23,42,0.06) !important; opacity: 1 !important; }
.chatbotlite-icon-btn:active:not(:disabled) { transform: scale(0.92); }
.chatbotlite-dot:nth-child(2) { animation-delay: 0.15s; }
.chatbotlite-dot:nth-child(3) { animation-delay: 0.3s; margin-right: 0; }
.chatbotlite-brand:hover { color: ${TEXT_MUTED} !important; }
`;

function ensureStyles(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_TAG_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_TAG_ID;
  style.textContent = TOKENS + KEYFRAMES;
  document.head.appendChild(style);
}

export function ChatWidget(props: ChatWidgetProps): ReactElement {
  const {
    theme: themeOverrides,
    title,
    subtitle,
    greeting,
    showBranding = true,
    position = "bottom-right"
  } = props;

  const sessionId = props.sessionId;
  const storageBackend = useMemo(() => props.storage ?? new LocalChatStorage(), [props.storage]);

  const isEndpointMode = "endpoint" in props && typeof props.endpoint === "string";
  const resolvedTitle = title ?? "Chat";
  const resolvedGreeting = greeting ?? "Hi! How can we help?";

  const primary = themeOverrides?.primary ?? DEFAULT_PRIMARY;
  // WCAG-based contrast fallback: light primaries (yellow/lime/pale) auto-switch to dark text
  const primaryIsLight = luminance(primary) > 0.65;
  const onPrimary = themeOverrides?.onPrimary ?? (primaryIsLight ? "#0f172a" : DEFAULT_ON_PRIMARY);

  const attachCfg = props.attach;
  const attachEnabled = attachCfg?.enabled === true;
  const acceptAttr = attachCfg?.accept?.join(",");
  const maxSizeMb = attachCfg?.maxSizeMb ?? 10;
  const maxFiles = attachCfg?.maxFiles ?? 5;

  const voiceCfg = props.voice;
  const voiceEnabled = voiceCfg?.enabled === true;
  const voiceLang = voiceCfg?.lang ?? "en-US";
  const speechSupported = typeof window !== "undefined" &&
    (Boolean((window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition) ||
      Boolean((window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition));

  const [open, setOpen] = useState(Boolean(props.defaultOpen));
  // Panel expansion — persisted in localStorage so the visitor's preference survives reload.
  const [expanded, setExpanded] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try { return window.localStorage.getItem("cbl-panel-size") === "expanded"; } catch { return false; }
  });
  // Mobile breakpoint — under 640px we go full-screen and hide the toggle.
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window === "undefined" ? false : window.innerWidth < 640
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = (): void => setIsMobile(window.innerWidth < 640);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  function toggleExpanded(): void {
    setExpanded((prev) => {
      const next = !prev;
      try { window.localStorage.setItem("cbl-panel-size", next ? "expanded" : "compact"); } catch { /* ignore quota */ }
      return next;
    });
  }
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "g0", role: "assistant", content: resolvedGreeting, ts: Date.now() }
  ]);
  const [sessionLoaded, setSessionLoaded] = useState(!sessionId);
  const [conversationTitle, setConversationTitle] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    storageBackend.loadMessages(sessionId).then((stored) => {
      if (cancelled || stored.length === 0) { setSessionLoaded(true); return; }
      const restored: ChatMessage[] = [
        { id: "g0", role: "assistant", content: resolvedGreeting, ts: stored[0]!.timestamp - 1 },
        ...stored.map((m) => ({ id: m.id, role: m.role, content: m.content, ts: m.timestamp }))
      ];
      setMessages(restored);
      setSessionLoaded(true);
    }).catch(() => setSessionLoaded(true));
    return () => { cancelled = true; };
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId || !sessionLoaded) return;
    const toStore: StoredMessage[] = messages
      .filter((m) => m.id !== "g0" && m.content && (m.role === "user" || m.role === "assistant"))
      .map((m) => ({ id: m.id, role: m.role as "user" | "assistant", content: m.content, timestamp: m.ts }));
    if (toStore.length > 0) {
      storageBackend.saveMessages(sessionId, toStore).catch(() => {});
    }
  }, [messages, sessionId, sessionLoaded]);

  useEffect(() => {
    if (!sessionId) return;
    storageBackend.loadTitle(sessionId).then((t) => {
      if (t) setConversationTitle(t);
    }).catch(() => {});
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId || conversationTitle) return;
    const userMsgs = messages.filter((m) => m.role === "user" && m.content);
    if (userMsgs.length < 1) return;
    const firstUserMsg = userMsgs[0]!.content;
    const title = firstUserMsg.length > 40 ? firstUserMsg.slice(0, 40) + "…" : firstUserMsg;
    setConversationTitle(title);
    storageBackend.saveTitle(sessionId, title).catch(() => {});
  }, [messages, sessionId, conversationTitle]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [pendingTools, setPendingTools] = useState<PendingTool[]>([]);
  const tools = props.tools ?? {};

  const [voiceListening, setVoiceListening] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  async function continueAfterTool(toolName: string, result: Record<string, unknown>): Promise<void> {
    // Post tool result as a hidden user-side context message so LLM continues
    const ctxMsg = `[Tool ${toolName} result: ${JSON.stringify(result)}]`;
    setSending(true);
    const assistantId = `a${Date.now()}`;
    setMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: "", ts: Date.now() }]);
    const appendToken = (tok: string): void => {
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + tok } : m))
      );
    };
    try {
      const history: Message[] = messages
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role, content: m.content }));
      const reply = isEndpointMode
        ? await fetchReplyFromEndpoint(ctxMsg, history, [], appendToken)
        : (await bot!.reply(ctxMsg, { history })).reply;
      const markers = parseToolMarkers(reply);
      const cleanReply = stripToolMarkers(reply);
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, content: cleanReply } : m))
      );
      if (markers.length > 0) {
        setPendingTools((prev) => [
          ...prev,
          ...markers.map((marker) => ({ messageId: assistantId, marker, status: "pending" as const }))
        ]);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, content: `Sorry — something went wrong. (${errMsg})` } : m
        )
      );
    } finally {
      setSending(false);
    }
  }

  async function handleToolSubmit(toolName: string, idx: number, result: Record<string, unknown>): Promise<void> {
    setPendingTools((prev) =>
      prev.map((p, i) => (i === idx ? { ...p, status: "submitted", result } : p))
    );
    await continueAfterTool(toolName, result);
  }

  function toggleVoice(): void {
    if (!speechSupported) return;
    if (voiceListening) {
      recognitionRef.current?.stop();
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Ctor = (window as unknown as { SpeechRecognition?: any; webkitSpeechRecognition?: any })
      .SpeechRecognition ??
      (window as unknown as { SpeechRecognition?: any; webkitSpeechRecognition?: any })
        .webkitSpeechRecognition;
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = voiceLang;
    rec.continuous = false;
    rec.interimResults = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      let transcript = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        transcript += e.results[i][0].transcript;
      }
      setInput(transcript);
    };
    rec.onend = () => setVoiceListening(false);
    rec.onerror = () => setVoiceListening(false);
    recognitionRef.current = rec;
    setVoiceListening(true);
    rec.start();
  }

  function addFiles(picked: FileList | File[]): void {
    const arr = Array.from(picked).filter((f) => f.size <= maxSizeMb * 1024 * 1024);
    setFiles((prev) => {
      const combined = [...prev, ...arr];
      return combined.slice(0, maxFiles);
    });
  }
  function removeFile(idx: number): void {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  useEffect(() => { ensureStyles(); }, []);

  const directProps = isEndpointMode ? null : (props as ChatWidgetDirectProps);
  const bot = useMemo(() => {
    if (!directProps) return null;
    if (!directProps.knowledge || !directProps.providers) return null;
    return new ChatBot({
      knowledge: directProps.knowledge,
      providers: directProps.providers,
      ...(directProps.extraInstructions ? { extraInstructions: directProps.extraInstructions } : {}),
      ...(directProps.systemPromptTransform ? { systemPromptTransform: directProps.systemPromptTransform } : {})
    });
  }, [directProps]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, sending, open]);

  useEffect(() => {
    if (open && inputRef.current) {
      const t = setTimeout(() => inputRef.current?.focus(), 240);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [open]);

  /**
   * Fetch reply from server endpoint. Auto-detects SSE streaming vs JSON response.
   * When streaming, onToken is called for each chunk so the widget can update progressively.
   */
  async function fetchReplyFromEndpoint(
    text: string,
    history: Message[],
    attachedFiles: File[],
    onToken: (token: string) => void
  ): Promise<string> {
    const enabledTools = Object.keys(tools);
    let body: BodyInit;
    const headers: Record<string, string> = { Accept: "text/event-stream, application/json" };
    if (attachedFiles.length > 0) {
      const form = new FormData();
      form.append("message", text);
      form.append("transcript", JSON.stringify(history));
      form.append("enabledTools", JSON.stringify(enabledTools));
      for (const f of attachedFiles) form.append("attachments", f, f.name);
      body = form;
    } else {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify({ message: text, transcript: history, enabledTools });
    }
    const res = await fetch(props.endpoint!, { method: "POST", headers, body });
    if (!res.ok) {
      // Read body for diagnostics but don't leak HTML / huge payloads into the bubble.
      const raw = await res.text().catch(() => "");
      const looksLikeHtml = /^\s*<(!doctype|html|head|body)/i.test(raw);
      const snippet = looksLikeHtml ? "" : raw.slice(0, 120).replace(/\s+/g, " ").trim();
      throw new Error(`Server returned ${res.status}${snippet ? ` — ${snippet}` : ""}`);
    }

    const contentType = res.headers.get("Content-Type") ?? "";
    if (contentType.includes("text/event-stream") && res.body) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assembled = "";
      let lastError: string | null = null;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const evt of events) {
          const lines = evt.split("\n");
          let evtName = "message";
          let data = "";
          for (const line of lines) {
            if (line.startsWith("event:")) evtName = line.slice(6).trim();
            else if (line.startsWith("data:")) data = line.slice(5).trim();
          }
          if (!data) continue;
          if (evtName === "token") {
            try {
              const tok = JSON.parse(data) as string;
              assembled += tok;
              onToken(tok);
            } catch { /* skip */ }
          } else if (evtName === "done") {
            try {
              const obj = JSON.parse(data) as { reply?: string };
              if (obj.reply) return obj.reply;
            } catch { /* skip */ }
          } else if (evtName === "error") {
            try {
              const obj = JSON.parse(data) as { message?: string };
              lastError = obj.message ?? "stream error";
            } catch {
              lastError = "stream error";
            }
          }
        }
      }
      if (lastError) throw new Error(lastError);
      return assembled;
    }

    // Fallback: JSON response (legacy endpoints)
    const data = (await res.json()) as { reply?: string; error?: string };
    if (data.error) throw new Error(data.error);
    if (!data.reply) throw new Error("Endpoint returned no reply.");
    return data.reply;
  }

  async function send(): Promise<void> {
    const text = input.trim();
    const attached = files;
    if ((!text && attached.length === 0) || sending) return;
    setInput("");
    setFiles([]);
    const userContent = attached.length > 0
      ? `${text}${text ? "\n" : ""}📎 ${attached.map((f) => f.name).join(", ")}`
      : text;
    const userMsg: ChatMessage = { id: `u${Date.now()}`, role: "user", content: userContent, ts: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    setSending(true);

    // Insert a placeholder assistant message that will be filled progressively by streaming
    const assistantId = `a${Date.now()}`;
    setMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: "", ts: Date.now() }]);

    const appendToken = (tok: string): void => {
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + tok } : m))
      );
    };

    try {
      const history: Message[] = messages
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role, content: m.content }));
      const reply = isEndpointMode
        ? await fetchReplyFromEndpoint(text, history, attached, appendToken)
        : (await bot!.reply(text, { history })).reply;
      // Parse tool markers from final reply
      const markers = parseToolMarkers(reply);
      const cleanReply = stripToolMarkers(reply);
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, content: cleanReply } : m))
      );
      if (markers.length > 0) {
        setPendingTools((prev) => [
          ...prev,
          ...markers.map((marker) => ({ messageId: assistantId, marker, status: "pending" as const }))
        ]);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, content: `Sorry — something went wrong. (${errMsg})` } : m
        )
      );
    } finally {
      setSending(false);
    }
  }

  const launcherPos: CSSProperties = position === "bottom-left" ? { left: 20 } : { right: 20 };
  const panelPos: CSSProperties = position === "bottom-left" ? { left: 20 } : { right: 20 };

  return (
    <>
      {!open && (
        <button
          className="chatbotlite-root chatbotlite-launcher"
          data-color-scheme="auto"
          onClick={() => setOpen(true)}
          aria-label="Open chat"
          style={{
            ["--cbl-primary" as never]: primary,
            ["--cbl-on-primary" as never]: onPrimary,
            position: "fixed",
            bottom: 20,
            ...launcherPos,
            width: 64,
            height: 56,
            borderRadius: 18,
            background: primary,
            color: onPrimary,
            border: "none",
            fontSize: 28,
            lineHeight: 1,
            cursor: "pointer",
            boxShadow: "0 12px 28px -8px rgba(15,23,42,0.32), 0 4px 8px -2px rgba(15,23,42,0.12)",
            zIndex: 99999,
            animation: "chatbotlite-pop 320ms cubic-bezier(0.34, 1.56, 0.64, 1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          {props.launcherIcon
            ? (props.launcherIcon.startsWith("http") || props.launcherIcon.startsWith("/")
                ? <img src={props.launcherIcon} alt="" style={{ width: 28, height: 28, objectFit: "contain" }} />
                : <span style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.2))" }}>{props.launcherIcon}</span>)
            : (
              <img src={DEFAULT_LOGO} width="36" height="36" alt="" style={{ objectFit: "contain", }} />
            )}
        </button>
      )}

      {open && (
        <div
          className="chatbotlite-root"
          data-color-scheme="auto"
          role="dialog"
          aria-label="Chat"
          style={{
            ["--cbl-primary" as never]: primary,
            ["--cbl-on-primary" as never]: onPrimary,
            position: "fixed",
            bottom: isMobile ? 0 : 20,
            ...(isMobile ? { left: 0, right: 0 } : panelPos),
            width: isMobile ? "100vw" : (expanded ? 720 : 380),
            maxWidth: isMobile ? "100vw" : "calc(100vw - 40px)",
            height: isMobile ? "100dvh" : (expanded ? 800 : 580),
            maxHeight: isMobile ? "100dvh" : "calc(100vh - 40px)",
            paddingTop: isMobile ? "env(safe-area-inset-top, 0px)" : undefined,
            background: SURFACE,
            color: TEXT_BODY,
            borderRadius: isMobile ? 0 : 20,
            boxShadow: "0 24px 60px -16px rgba(15,23,42,0.32), 0 8px 24px -8px rgba(15,23,42,0.12), 0 0 0 1px rgba(15,23,42,0.04)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            fontFamily: FONT_STACK,
            zIndex: 99999,
            animation: "chatbotlite-slide 280ms cubic-bezier(0.16, 1, 0.3, 1)"
          }}
        >
          <header style={{
            padding: "14px 16px",
            background: primary,
            color: onPrimary,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: props.avatar ? 10 : 0, minWidth: 0 }}>
              {/* Avatar — opt-in: true=letter badge, string=image URL, omit=none */}
              {props.avatar === true && (
                <div style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: onPrimary,
                  color: primary,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 14,
                  fontWeight: 700,
                  flexShrink: 0,
                  letterSpacing: "-0.02em"
                }}>
                  {resolvedTitle.charAt(0).toUpperCase()}
                </div>
              )}
              {typeof props.avatar === "string" && (
                <img
                  src={props.avatar}
                  alt=""
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    objectFit: "cover",
                    flexShrink: 0,
                    border: `1px solid rgba(255,255,255,0.25)`
                  }}
                />
              )}
              <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.2, minWidth: 0 }}>
                <span style={{ fontWeight: 600, fontSize: 15, letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: onPrimary }}>
                  {resolvedTitle}
                </span>
                {(subtitle || conversationTitle || sending) && (
                  <span style={{ fontSize: 12, color: onPrimary, opacity: 0.75, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {sending ? "typing…" : (subtitle ?? conversationTitle ?? "")}
                  </span>
                )}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
              {!isMobile && (
                <button
                  className="chatbotlite-resize"
                  onClick={toggleExpanded}
                  aria-label={expanded ? "Compact view" : "Expand view"}
                  title={expanded ? "Compact view" : "Expand view"}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: onPrimary,
                    opacity: 0.85,
                    width: 32,
                    height: 32,
                    borderRadius: 10,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                  }}
                >
                  {expanded ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="9 4 4 4 4 9" />
                      <polyline points="15 4 20 4 20 9" />
                      <polyline points="4 15 4 20 9 20" />
                      <polyline points="20 15 20 20 15 20" />
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="3 9 3 3 9 3" />
                      <polyline points="21 9 21 3 15 3" />
                      <polyline points="3 15 3 21 9 21" />
                      <polyline points="21 15 21 21 15 21" />
                    </svg>
                  )}
                </button>
              )}
              <button
                className="chatbotlite-close"
                onClick={() => setOpen(false)}
                aria-label="Close chat"
                style={{
                  background: "transparent",
                  border: "none",
                  color: onPrimary,
                  opacity: 0.85,
                  width: 32,
                  height: 32,
                  borderRadius: 10,
                  fontSize: 22,
                  lineHeight: 1,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                {"\u00D7"}
              </button>
            </div>
          </header>

          <div
            ref={scrollRef}
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "16px 14px",
              display: "flex",
              flexDirection: "column",
              gap: 8,
              background: CHAT_BG
            }}
          >
            {messages.map((m) => (
              <div key={m.id} style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: m.role === "user" ? "flex-end" : "stretch" }}>
                {m.content && (
                  <div
                    className="chatbotlite-msg"
                    style={{
                      alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                      maxWidth: "82%",
                      padding: "9px 13px",
                      borderRadius: m.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                      background: m.role === "user" ? primary : BUBBLE_BOT,
                      color: m.role === "user" ? onPrimary : TEXT_BODY,
                      border: m.role === "user" ? "none" : `1px solid ${BORDER}`,
                      fontSize: 14,
                      lineHeight: 1.5,
                      letterSpacing: "-0.005em",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      boxShadow: m.role === "user"
                        ? "0 1px 2px rgba(15,23,42,0.12)"
                        : "0 1px 2px rgba(15,23,42,0.04)"
                    }}
                  >
                    {m.content}
                    {/* Streaming cursor — signature ▍ in brand color */}
                    {sending && m.role === "assistant" && m === messages[messages.length - 1] && (
                      <span
                        className="chatbotlite-cursor"
                        style={{ color: primary }}
                        aria-hidden="true"
                      >
                        {"\u258D"}
                      </span>
                    )}
                  </div>
                )}
                {/* Tool cards attached to this assistant message */}
                {pendingTools
                  .map((pt, originalIdx) => ({ pt, originalIdx }))
                  .filter(({ pt }) => pt.messageId === m.id)
                  .map(({ pt, originalIdx }) => {
                    const toolCommonStyle = { className: "chatbotlite-msg", style: { alignSelf: "stretch" } };
                    const palette = {
                      primary, onPrimary,
                      border: BORDER, surface: SURFACE, surfaceMuted: CHAT_BG,
                      textBody: TEXT_BODY, textMuted: TEXT_MUTED
                    };
                    if (pt.marker.name === "uploadForReview" && tools.uploadForReview) {
                      return (
                        <div key={`tool-${originalIdx}`} {...toolCommonStyle}>
                          <UploadForReview
                            {...palette}
                            purpose={String(pt.marker.args.purpose ?? "files")}
                            accept={String(pt.marker.args.accept ?? "*")}
                            maxMb={Number(pt.marker.args.maxMb ?? 10)}
                            submitting={pt.status === "submitting"}
                            submitted={pt.status === "submitted"}
                            onSubmit={async (files) => {
                              setPendingTools((prev) =>
                                prev.map((p, i) => (i === originalIdx ? { ...p, status: "submitting" } : p))
                              );
                              try {
                                const result = await tools.uploadForReview!.handler({
                                  files,
                                  purpose: String(pt.marker.args.purpose ?? "files")
                                });
                                await handleToolSubmit("uploadForReview", originalIdx, result);
                              } catch (err) {
                                setPendingTools((prev) =>
                                  prev.map((p, i) => (i === originalIdx ? { ...p, status: "pending" } : p))
                                );
                                throw err;
                              }
                            }}
                          />
                        </div>
                      );
                    }
                    if (pt.marker.name === "scheduleCallback" && tools.scheduleCallback) {
                      return (
                        <div key={`tool-${originalIdx}`} {...toolCommonStyle}>
                          <ScheduleCallback
                            {...palette}
                            durationMin={Number(pt.marker.args.durationMin ?? 15)}
                            timezone={String(pt.marker.args.timezone ?? "UTC")}
                            submitting={pt.status === "submitting"}
                            submitted={pt.status === "submitted"}
                            {...(pt.result?.confirmedAt ? { submittedSlot: String(pt.result.confirmedAt) } : {})}
                            getAvailableSlots={tools.scheduleCallback.getAvailableSlots}
                            onConfirm={async (slot) => {
                              setPendingTools((prev) =>
                                prev.map((p, i) => (i === originalIdx ? { ...p, status: "submitting" } : p))
                              );
                              const result = await tools.scheduleCallback!.onConfirm({ slot });
                              await handleToolSubmit("scheduleCallback", originalIdx, result);
                            }}
                          />
                        </div>
                      );
                    }
                    if (pt.marker.name === "requestPayment" && tools.requestPayment) {
                      return (
                        <div key={`tool-${originalIdx}`} {...toolCommonStyle}>
                          <RequestPayment
                            {...palette}
                            amount={Number(pt.marker.args.amount ?? 0)}
                            currency={String(pt.marker.args.currency ?? "USD")}
                            {...(pt.marker.args.reason ? { reason: String(pt.marker.args.reason) } : {})}
                            showInterac={tools.requestPayment.showInterac ?? true}
                            {...(tools.requestPayment.stripeLink ? { stripeLink: tools.requestPayment.stripeLink } : {})}
                            submitting={pt.status === "submitting"}
                            submitted={pt.status === "submitted"}
                            {...(pt.result?.method ? { submittedMethod: pt.result.method as "interac" | "stripe" } : {})}
                            onPick={async (method) => {
                              setPendingTools((prev) =>
                                prev.map((p, i) => (i === originalIdx ? { ...p, status: "submitting" } : p))
                              );
                              const amount = Number(pt.marker.args.amount ?? 0);
                              const currency = String(pt.marker.args.currency ?? "USD");
                              const result = await tools.requestPayment!.onPick({ method, amount, currency });
                              await handleToolSubmit("requestPayment", originalIdx, { ...result, method });
                            }}
                          />
                        </div>
                      );
                    }
                    if (pt.marker.name === "pickerMessage") {
                      const optionsRaw = String(pt.marker.args.options ?? "");
                      const options = optionsRaw.split(",").map((o) => o.trim()).filter(Boolean);
                      const pickerHandler = tools.pickerMessage;
                      return (
                        <div key={`tool-${originalIdx}`} {...toolCommonStyle}>
                          <PickerMessage
                            {...palette}
                            {...(pt.marker.args.prompt ? { prompt: String(pt.marker.args.prompt) } : {})}
                            options={options}
                            submitting={pt.status === "submitting"}
                            submitted={pt.status === "submitted"}
                            {...(pt.result?.value ? { submittedValue: pt.result.value as string } : {})}
                            onPick={async (value) => {
                              setPendingTools((prev) =>
                                prev.map((p, i) => (i === originalIdx ? { ...p, status: "submitting" } : p))
                              );
                              const pickerPrompt = pt.marker.args.prompt ? String(pt.marker.args.prompt) : undefined;
                              const result = pickerHandler
                                ? await pickerHandler.onPick({ value, ...(pickerPrompt ? { prompt: pickerPrompt } : {}) })
                                : { status: "picked", value };
                              await handleToolSubmit("pickerMessage", originalIdx, { ...result, value });
                            }}
                          />
                        </div>
                      );
                    }
                    return null;
                  })}
              </div>
            ))}
            {sending && messages[messages.length - 1]?.content === "" && (
              <div
                className="chatbotlite-msg"
                style={{
                  alignSelf: "flex-start",
                  padding: "12px 14px",
                  borderRadius: "18px 18px 18px 4px",
                  background: BUBBLE_BOT,
                  border: `1px solid ${BORDER}`,
                  boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
                  display: "flex",
                  alignItems: "center",
                  gap: 4
                }}
              >
                <span className="chatbotlite-dot" />
                <span className="chatbotlite-dot" />
                <span className="chatbotlite-dot" />
                <span style={{ fontSize: 12, color: TEXT_MUTED, marginLeft: 4 }}>thinking</span>
              </div>
            )}
          </div>

          {/* File chips above composer pill */}
          {files.length > 0 && (
            <div style={{
              padding: "8px 12px 0",
              background: SURFACE,
              display: "flex",
              flexWrap: "wrap",
              gap: 6
            }}>
              {files.map((f, i) => (
                <span
                  key={`${f.name}-${i}`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "4px 8px 4px 10px",
                    borderRadius: 999,
                    background: INPUT_BG,
                    fontSize: 12,
                    color: TEXT_BODY,
                    maxWidth: 200
                  }}
                >
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: TEXT_MUTED }}>
                    <IconPaperclip size={12} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", color: TEXT_BODY }}>{f.name}</span>
                  </span>
                  <button
                    onClick={() => removeFile(i)}
                    aria-label={`Remove ${f.name}`}
                    style={{ background: "transparent", border: "none", cursor: "pointer", color: TEXT_MUTED, fontSize: 14, lineHeight: 1, padding: 0 }}
                  >×</button>
                </span>
              ))}
            </div>
          )}

          {/* Composer — messenger-style pill */}
          <div style={{
            padding: "10px 12px 12px",
            background: SURFACE
          }}>
            <div
              className="chatbotlite-composer"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "4px 4px 4px 8px",
                background: INPUT_BG,
                borderRadius: 999
              }}
            >
              {attachEnabled && (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept={acceptAttr}
                    style={{ display: "none" }}
                    onChange={(e) => {
                      if (e.target.files) addFiles(e.target.files);
                      e.target.value = "";
                    }}
                  />
                  <button
                    className="chatbotlite-icon-btn"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={sending || files.length >= maxFiles}
                    aria-label="Attach file"
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: "50%",
                      background: "transparent",
                      border: "none",
                      cursor: sending || files.length >= maxFiles ? "default" : "pointer",
                      opacity: sending || files.length >= maxFiles ? 0.35 : 0.75,
                      color: TEXT_MUTED,
                      lineHeight: 1,
                      padding: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      alignSelf: "center",
                      transition: "opacity 120ms ease, background 120ms ease"
                    }}
                  ><IconPaperclip size={18} /></button>
                </>
              )}
              {voiceEnabled && speechSupported && (
                <button
                  className="chatbotlite-icon-btn"
                  onClick={toggleVoice}
                  disabled={sending}
                  aria-label={voiceListening ? "Stop recording" : "Start voice input"}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    background: voiceListening ? primary : "transparent",
                    color: voiceListening ? onPrimary : "inherit",
                    border: "none",
                    cursor: sending ? "default" : "pointer",
                    opacity: sending ? 0.35 : (voiceListening ? 1 : 0.75),
                    lineHeight: 1,
                    padding: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    alignSelf: "center",
                    transition: "opacity 120ms ease, background 120ms ease, color 120ms ease"
                  }}
                ><IconMic size={16} /></button>
              )}
              <textarea
                ref={inputRef}
                className="chatbotlite-input"
                rows={1}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  const el = e.currentTarget;
                  el.style.height = "20px";
                  if (el.scrollHeight > 28) {
                    el.style.height = Math.min(el.scrollHeight, 100) + "px";
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                placeholder="Message"
                disabled={sending}
                style={{
                  flex: 1,
                  padding: "4px 6px",
                  margin: 0,
                  border: "none",
                  background: "transparent",
                  fontSize: 14,
                  fontFamily: FONT_STACK,
                  color: TEXT_BODY,
                  outline: "none",
                  resize: "none",
                  lineHeight: 1.4,
                  height: 20,
                  maxHeight: 100,
                  boxSizing: "content-box",
                  overflow: "hidden"
                }}
              />
              <button
                className="chatbotlite-send"
                onClick={() => void send()}
                disabled={sending || (!input.trim() && files.length === 0)}
                aria-label="Send message"
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: "50%",
                  background: primary,
                  color: onPrimary,
                  border: "none",
                  fontSize: 14,
                  fontWeight: 600,
                  fontFamily: FONT_STACK,
                  cursor: sending || (!input.trim() && files.length === 0) ? "default" : "pointer",
                  opacity: sending || (!input.trim() && files.length === 0) ? 0.35 : 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  padding: 0,
                  transition: "opacity 120ms ease, transform 80ms ease"
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="19" x2="12" y2="5" />
                  <polyline points="5 12 12 5 19 12" />
                </svg>
              </button>
            </div>
          </div>

          {showBranding && (
            <a
              className="chatbotlite-brand"
              href="https://chatbotlite-demos.vercel.app"
              target="_blank"
              rel="noreferrer"
              style={{
                padding: "8px 12px",
                fontSize: 11,
                fontWeight: 500,
                color: TEXT_FAINT,
                textAlign: "center",
                textDecoration: "none",
                background: SURFACE,
                borderTop: `1px solid ${BORDER}`,
                letterSpacing: "0.01em",
                transition: "color 120ms ease"
              }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <IconBolt size={11} />
                Powered by ChatbotLite
              </span>
            </a>
          )}
        </div>
      )}
    </>
  );
}
