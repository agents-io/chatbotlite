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
const DEFAULT_LOGO = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAACOUlEQVR4nO3YWU4DMRAA0TbLQZHCCTgOHIkbQdJ8jCPCkECWGc9SVVKk5MuW/NSKHZn5FBGRmQ9hvDJzl5nP9bsIaGXmNrs29bcISNUJ8FkR7CfB49T7skbVgz9EsJ8EIiCU34mAWP5MBLTydyIgdQSACEidACACSn8AEAGhfwD0EfhOsLbOAHAKgS+Ga+hMAE6CtXYBABGssQsBiGBtXQGgj8DbwZK7EoAI1tINAESwhm4EIIKlNwAAESy5gQD0EXg7WEoDAugjcBIsoYEB9BH4bDz3RgBwCoGTYI6NBEAES2lEAH0E/ieYYyMDEMHMu2uwRqnrbCPiNTM3pZQPEcyjFgAiRDDbWl7P+giilPJWEewa7sMOan0/P4qg8R7soJKZOcG6WT93EfESEe/R4XASNG4qABEdgIju4G2ipnyi3R/8NkQwWXN4o7+fegPkWl0DbaYJAJ4A4AkAngDgCQCeAOAJAJ4A4AkAngDgCQCeAOAJAJ4A4AkAngDgCQCeAOAJAJ4A4AkAngDgCQCeAOAJAJ4A4AkAngDgCQCeAOAJAJ4A4AkAngDgCQCeAOAJAJ4A4AkAngDgCQCeAOAJAJ4A4AkAngDgCQCeAOAJAJ4A4AkAngDgCQCeAOAJAJ4A4AkAngDgCQCeAOAJAJ4A4AkAngDgCQCeAOAJAJ4A4AkAngDgCQCeAOAJAJ4A4AkAngDgCQCeAOAJAJ4A4AkAngDgCQCeAOAJAJ4A4AkAngDgCQCeAOAJAN4X/cXET7u0kMkAAAAASUVORK5CYII=";

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
