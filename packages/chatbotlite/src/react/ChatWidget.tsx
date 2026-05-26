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
              <img src={DEFAULT_LOGO} width="36" height="36" alt="" style={{ objectFit: "contain", filter: "brightness(0) invert(1)" }} />
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
