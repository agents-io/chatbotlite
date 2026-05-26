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
const DEFAULT_LOGO = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAAABGdBTUEAALGPC/xhBQAAACBjSFJNAAB6JgAAgIQAAPoAAACA6AAAdTAAAOpgAAA6mAAAF3CculE8AAAABmJLR0QA/wD/AP+gvaeTAAAAB3RJTUUH6gUaExEk/fVwJwAAO2ZJREFUeNrtvXnQLcd1H/Y73bPc760AHgCS2BcSJCEQIkQJJkWaNqyFVERRDrV5UUVREoIVKkklJSlFxLFT5YoDmkkqiWVZJqOqRIqjOJEoybITJYyozaa5CgIBOpAIkMRKLAbe/r5778x0n/zRfbpP98z9gCrJAmm9QT1839d37kx3n+6z/M7SOHPmzHvPnjnTnT1zBhevP32XAfC3GfzvTeNkT5869XL35+L1J32dO3eOz507d+bChQvvd9NoN+v1y92li9ef5OWcY+ccj+N45vy5c+8/efKkPXv27MvdrYvXn9BliAhEBAKOeeZ7rTXvA7M9c+b0y923i9efwEXjODKY4ZkxTRMAnDXG3MPMH2Zmd/jw4Ze7jxevf4UXnTt7lhmAIcJqbw9EBO/cuc1284HRjR+xZKfjxy95uft58fpXdBkGA8wAASIOABxlxgctNXez4+aidfCv70UXLlxgAgAiWGtBRGDv4bwDgHNE5gPOu4+AeTpy5OjL3d+L1x/zRc45JgDOe2w2G7D3sLbBam8FImCa3NnNZnOP8+4jhsx0/Pjxl7vPF68/xssQESCsnxkMAPH/AAHAMYDvNWTuduPUnLooDv61umi73TIAMDOYfVAHiGDiwmD28J4B4KwxdM9ms/mwtdYdPXrs5e77xeuP4aKzZ84wA7DGYLW3B2MMpmnCZr0GA2iaBqvVCkSEcRzObjfbe4jowwy4Y8cuLoKv98sIs2cAwQDQV/iU8p/HGLiXmd+3Hbb21KmTL3f/L15/xIvW6zWnPyKlOQgFaRXTEMxiMtJZIrpnvd7/cNM0F8XB1/FFPgp45xzW6zWYPRrbJFBomqZgHTCjbVv0fQ8AmMbx7HbY3sMeHyaCO3bROvi6vExi8xEIAijtfQBhx3NuISSRcAyMe8ngfZ7ZnrkYT/B1eVUiQLF6fdNCO2WF4RyAD5w/f/4jXd9Nxy6Kg6+ry4zjiHEc4NyEtmnQdR0aazEOA4ZhC+89uq5F13UwhjAMA4ZhADOj6zq0bXsUwAe7rrvbO99c5ARfX5cJPyrWT4gaoez8/IW08aNoICIw81Ew32uMuZuBi4vg6+ii7XbDAFVAEEBkEMFBeO/DzUQgQ1Ft4NhOyYlERGeZ+Z4zp09/ZG/v0HTs+EVx8LV+mbbt0LYtrLWYxgnjOMI5j7Zt0bYdjDEIYmIMbL8J4gAgjOOEcRgAQMTBMe/9vau9vbvJ0MXIoq+DyxR/Udz9ui2y+fRn/YQ5enQMESwyxthz58693GO8eB1w0f7+fqJpcAcD3jO8c+EGIhhrAQQrwDuXnEfGhPXjvU8gkYkuZSI6672/5/nnn//w0aNH3UUv4tfmZYS9O+dgrUXTtIHtT0Ec+AgAtW0LAlI7M6NtGrRtCwBBTISQMhEpx7x39x49evR9RLBnz15UDL8WL6MUOADZ1q/bOLqKFRAERo0NyAep7RgR7gXofV3X2wsXLrzc4714VRcNw5DcwdM0gZlhiNDEne29h3MusHdjYJsGQICORUwYa2GjmHBuStaBtVbExFnnpntOnjrz4SOHD10UB19Dl2maBk3TwBgD51wgIHMUB7F9mjA5F93DFk2U85NzmNwEQnAbN00DZmCaHNw0wRiDpmmCOHD+3iOHD72PLsLGX1NXU8O7BCPgDoDAGcT2JwQFkdT9YjqImMjPiaLD+2A5EI4R0QcpRB9/ZL1eT3t7ey/3+P/UX3T+/PlAHyJ0XQciwDmf7HtjDdq2AxDY/jiOIAA27ngAiUMAkB0PAEm5JCK0bVAuwXxunKYPnD937iOrvb3pYlDJy3sZH2U5e46mnYUxlGQ/M4LsjyYie5+QQWuNkv0uEdtGnYA5oIU+tRsYa4967+9drVZ3s3fNxQykl/cyZAzIGICQCeYZZAyMMYmVB1sfSPcD8d7A4o0xMIYqood20u3egwjHrDX3nhm6u4//wPHmrr8zvtzz8Kf2ommaGAjEHLbbYAVYi77rACI45zBEcWCtjTAwME0RBiagbdpoNTDGccQ0BXHQdV3iBMMwJM6xt+rx/L7BX/91nPmlz9MHifBZIligjkqSi0EKn9RmqP5J+kMwwJQ+v/YS4KM/SrjpRH42a5Qz6jqffpTxgz/HOL+NegzUPQolLfpH+d3MyE6y9Pay79LCzLjlSsbP/8Aa115m0fV7YOYUnAMEkbq3F9qnccRmuwUA9H2HruvBzNhut5jGMYjxvkfbtmBmbDZrTOMEMgZ7e3uw1sJ7j816nTZuI2iehIR7ZhAHDkBE8N4lBc9aCzKUsIDQHr4uz2Ee4b0DIaOFQTkMziZDhDMbwt/6OOFXHsRxIvyXBLgXWac7P+GdH+TveGZcfoRwfBXXRfhfdHZFAkcinzgCnDgMnNtwvaLKHgmxFfFFUeb4LIpLd2d/CXj8FOGf/EGL976Z0akFSdW9NIPcqWyn6v6DVqx6VCO70kf7H4nwPloDEOUtwMTOp4EYa4MHEUEHkMtW0LGElhpjMHnC3/0E8A/vA5wHTNj5NvVLTWrqst7i2Rk5/2zHimAmvOIIcLjj9N0wcSUHAAiX7REuOwx8+QXAUkW+yFRIvZIXqKV3+bwzuq+E/QH46U+2uPqSCe+53UE8syZyzqCUu8RRbNponOZcRG1A4+t2RYsI2ScYn4AmsBoGkUHf9wkP2Gw2ADNsERY+FqxptVoBQGonAG3Xoe8Daxq2WwyRG3RdB2MtfuE+4H/8FGFygFGwot5FMpkF4rhjQiMdw+Cp/J6+Z38EPL/IEwkYHLAexSmm76f0a3oPqUW71C9ZbAu3yN+GgJP7wH/1cYsrD21x53UMkE1z6yaXQvTbtsUqms7jOEKKebRdh9UqiGYJ2BGrruvCAthut/DbLchkOgOACbY6p90g/zimjAsHyLa9T/a+iYpiWmGcn2EUjOyZYQ3hM48TPvSbhAtDJn5aA3pbVVRUHLpYIGkyk0yaLxp51JNngGfOAUSMXaFvAOMrLzC+eib2T68M+aEWaREuubQ6hfiqX0ucikD4ykmD/+af9nj6LIEiLUxcYV7tXj3nXuB5IhgT/sm4OHJwoV0QwZw4QKKTmGyGTDL9vPcKCQyKoJumwIJsk5JI3TQldtMo0885F5JLiWCNRWMNnj0PfOjjwBOnS+LnbVVNzE7hvuOqvqdFHxHw6AvARx8AnFcKGZW/r0fCL/w+cGa9zEXq3V68kvPv9d+z4VQiDQQ0BvjUYwY/86kGgwu6l/M+cOFICyKCcxOcm2ZzPk0O0+QCKmstbJNpEcS5gW0srMl0ds6hEVbjJTk0vrDv+xwWvpglNGK92QBgtG2XWNN2uw0sCEDX92j6Ht4zfv4TjN/9cuAEJfEXJuYgItPCV/iAR8T7nQd+9lOM6y8j/MXbgNZkSU0ALgyMn/0U8KsPLBN/6eELBsdyP3brsMU9HsAvPdjiW2+c8I6bN/AcALe91QqIc75Zb8AIFtZqbw9gxjayfUh7n60D0R/6vk+LZbPZJIvMLHr9FJsAIqsRtk9KMtbwb/WccD/wuScJP/85gpaq9egPpL3m58J+43/gXVTJf0qI4wsXgHv+MeNv/j9B7kr746eAn/w14IO/wbiwnfdEWD0ftGp54V/VJe1JLVZJvJ8AnF4DP/0Jg6fPm7zwiNLvvp5zU855Yu1aNEdxsERnM00Tpil48Bpr0TQ2KYLiHRRHDxGSAwjM8f4AB0/jiGkSx5CFbRoQgDP7Dj/zCeCrZ0nHmc7moJ7bXfOZWSwp4b9jUuWHinQ6vQb+4X2Mx08h8fQvPAN89AHG4BZd2vNnH7Ti9M3M6cfMRlvoOhiwBnjgaYNf+kKbALdAC1fMuXhvpyns8CQOvIfQNLQH2nkf6OmcgzUmOPWaBs12E1iKLhGTrAAI2+8RYgDHJCYSC0LQPAWg6LoOqzZmDw0b/L8PAb/5sEkKSiLMDo39oMlm/QWef0YHfFdfxsjNWaOzBDhSChstLckDe7zQm7IjzC/y9fjZ5IH/7f4G/8atFq+/wmGz3YK9L6yAYRiw2WySqO26Llte4xAsr75H04fFst1sgjgwhNVqr7QCciiwZuVaHGgrQHkJC7biSxZEwOk14X+9v8X5YYH1czkXNc2So3Fhgpa+NftILTDOmzETQsXAy2fMFITUEp9esD52EV/5S7MFUy3cggFUn5solv73zxs4poS1gMrgHYg4iHhBArQ4iIrwFUoYQg0sEREaCfwAgs3pEJC/xjYJ4x/HMfVdWL4ognI1TZsWyDSOMMT4nS8bfPoJkyNPl0AbWrbxU9sOhZEJ2CGUiy/UYFLa+FS8JRKfK9A5LSEF/XHZPlcZl/GKqrsFN9gBEvzaFxjfdxvj1iuahGGMcXcDQUEU4o7jlOjStG1aHEIja0wyK8UyAIBGkj3FChATcE+SQyPbB4CmbQvwR9q7rkvt2+0W4zRhPRE++mCP9UiwekZmxCmn/CVushf/XOMI6n6PGApdJbsQlYuFZwuPq2e/GD+ff7xI7wIoyovLAHjyNPB/PmTxxmvaNLfb7QAwo+265CMQXwAI6Lo+AXGbzQbTNMFEtl/4AjhEbRVWwM5BUNbSVWHJ8jb1HCLGg89YfOYJUwIqy3D2/HW7bk0WQGbr3tf/eNbmmOM/gOPn9RryHEzFAFwB7AFXP4vjPx8+Z8/Z+YNsyxQLCeU/vYjECuH5SNN9H/si4akzoVUgeQF/oH6KIyobDmpTKVu5pDWjSew92v8C8kjgh0CQIt/F3gSArm3TPhjHIaCGRIBt8bGHLU5vqEw8oIVfxWO3SynkwJZl8q0BjvbAkR5YNYwQrKQFvmLkSVRSIpBn4JJDwF6SfIzDPeGmE4wpWQFRjnNYzGmPMrI5wal72EzA2Q2wP4RFI+8mEsWDikdgibssmEgGwBefA37z4Ql/9Y7A0pu2TUit0CLK8rS2pN0Yg65rwRyCfLwbIphnYckCIDTbqL0TEfZiiRjnJqz3Ff4c2fswDNhuNkCM8NFsf9hswQBWqx4vXOjwO19+CVovl5O9dK9nQmuA608Ab7oW+JbrgdddCZw4BKzaisPMllct0ylODHD5IQYHRQLfci3jF39UzErdkYPYl/QPWI+E584z/uBZwqcfA37vccYTpwNHsYQgg9QKp7KLpT+kmp7NBPzmw8C7bhmwak0C4gLgtgUz0EcrgIiw2WwwjgMAwmq1Spt3vV7DuQnGWOytVinXo0nD0ytQVnoNDMX7eMFGFrZkifCZx4GvnMQy+6/MwML1x3k+PAOtBd50HfCX7gDueg3hqmOMttEvXVIGliRqOdOcPgk/91rg6lY+XbJNDrJXwly99krCn70J+JFvAR47Cfz6Q8Av3g889GxYaEsYSO5xjKkUS0t9FoA0g6+cBN5wlUnV3GT4RVi/ckzsBNyYi+fTZrNJT8vTVucJ5MmbW7dpDlKH/vr/bfHhTxk0xAfrFzseyAxccwnw3rcAP/hGwhVH8uTLGPVjF9cBUIyh/H3+XVrcllzdI+ZxOe5yMEjWxBOngP/pM4z/5XPAqX21Iah6Q21YVAvPEOO//h6Hv3KHn+kvixuS8qJamgt9meAy7NA0DcZxxLAd4JxD24YkUGsMhmEsagIIuxmGbcag2w6rvsPJfcbvPcEwFUAvK29GK90QPZN3Xg/8/R8kvP9thCuPlDcWnsGKCMtILRe/17s8WQBcTg7r3RSh2DoJZtfa9vG26y4F/rPvIPwP7yHccqXY5lkzZA1OFHNRPnhwhPueajB5wjAOOSG37xKLFzewIULfBZHgvQ9W2TBEfSDcP01Tvr9ml9ih4UsPs/skd1Qz3UdPEr5ySmSzpkya5RofK3676zWEn3oP4S03ADS7d/lKIV6KMJpglNlTQbUEEHE1Rm32V/PAO4gki6ZeRI0Bvvv1wE9/H+GNVwdlNo2Kd3OvxK7jov39rwIv7CtsZAc+ArXThdvNQDb1rxG7EjGAIK267TbJ9b7v0g7RSqNgCAJBGmJ88V9anNtix/Yo4WC9PjwDb7mB8LffTbj58iA3gy2uZbcsvspwIk3EzFwLSLcyf4TIeQHxjOhiEeRecu52ZY6F+0vxkIkBfNO1wIfeTfgPPgr84bOBrWdkkpc3XvxpCHjqNOPx0wavuraH84GbbDZzWgieAyC5kQEk3w4Q8BxZSDk5dJrQxBIx1lpI6RjBoLuug4nm4TiOAHMqHRPMwBHDOOGR54HJ57jBnYs0zWfYFTeeAP6L7yLcfLkiCDJrDjZuZTwtyBP5buauWfCIzS6TVkmHHc8u9QJSLKZ8BlfP09yAwT5YMX/tOwknjgAexSQs65vpPYzzW+DLJw1srOcABAfcKMGgXZvEwTiOAY1VbN97p+hs0XZdqP+gX6Q7nwaodkgCL+J3NOsFARMbPHqy4jkV9l0yhvDhqgXe/zbgm6+RSZvL6LxbuYzESfdRuh/Ve/IOz/b2LCNqiVHM3ley+Ex4rZ/QrL8yAczAO18L/PA30zziaBcsHPs3OsJX4tzOMH3QAueihedkuskCTQEhGlgAgH7VgxCCQ5PH0Bj06n5hNcYY7K32cHIfeOKMidhrhfkuoX5EcAz82ZuB77tds/ZSDs8mc/HSsjcPWO/k2gJIk59+ZkIuviGBP6W4qBf1rD3zejSW8KN3Ar/1MPDAU1zuvQVrM40dwKMnPc7vj7AmOOjEMyjeW4kDWK1U+3oNIABFbdslDpHiNcTXbyMAJB+KH9mYmAQaYwOkVgCA5F8mhBiA82ODF9ZUsuqduG4Y1NEe+OE3EY7vzdmuQJvMua3WvjNR9MIqF5lWCPVuTV8sTK+yD7s4i16YS1fxGeUvMAfr4Ae+MaCaS1ND6hc9JU+cZpzfOrgpp+FJbIDTMQCNxAB4jNOEyeVE3aZpUoifcy4GhSZtO7uCMwgkrLvSLlWbUOXkfpBVpadlYQFEjuAB3H4V8NYbwwTlSVOuZuWeLgl78CLIfy+Zj2oRJHV6RrH0s35XGpLCk7SjsGbB2d2cZdd3vZ5ww4kwB1oPSFZJsQwDLHxmbXBhMOn+OiJLXrYzUVeBehJl1KRzAqMmGTRyj812E8R+ZPuEcKiEhIVbGyBFBuCdw7BZ4/QFg3Fqs/dtF2qEICUMgLfeBFy6F1S+2s5+MdCG1IvyDq846QJnKNtq+aT7Mbf7a3g7EUovhvRcZJi/eD5w7aXAN11DePhfZoCoEIILltK5DbD2LQ7ttRgnV2j7baSFZBURgrtYc2vBD1KiLhjG+RAdyt7DxgIQxtgUNYoYEiYhXiEqNcQM6AzhaRpxYeMKxfAgkc0ADnXAm68naH9t3qklCpdWs8JUtxOwPxI2k/o8ztaLAZByfyb4nOhlf7JIYCasx+ADGL2ikOJ2ebNXfDxerQW+6ZogBtInC/3OATuMrSNsXQPTNADFqOzI9q0WB5FGie1HN/DkJjjvU1KvtQ0aIpPU88AxJbInt6csIQCGTBKZ7H3qMZGBh01GFx0gJAmAY+DKI8BNJ8qJWQzFU0ANEfD0WeBXHgT++aPAhQ2jscFJ9P23AzdeJh3I7HvpmZnD5DyIJVFT9oPw4NPAL97PePj54GI+3BG+7Rbge28jHO8DyLNk6SwMCK+7EjjUhkSUIv5AsQKNZTgAG8cJRSSJr2cuaKGzgfQhIESSwJtRyMIKCNo+w5BBES4e2b6xttA81yp7aG9vD2yCVl8Mfh5ZEZ1ujFccJRxbIcqtXUTKjyITiP/j/4jxsT8M3ja5fvsR4GMPMX7qPcDrX0kx2SU/Ry+uUoRwscBk9lkTAAAZxj/7MvAf/zLw5ZOs/Vf42B8Gp89f+3bgcFfQGNr6qOX1lUcIR3tOiTIzKKDSJQwxxmHCZj0BxsaAkJgNFPGApmmSmz5hNkDCcsTaS1aATgxx3sNNLmbyxJoAcRG4qiZAPF8QLnIHGFtgA8neBmYyNe5lHF8Bvd2pJhTEk3n4lQcYH/uDmKxKDGtCUgUz476ngP/5c8AYUux2wLlCIM4s+gCASW45tyH81D8FHnkh5DYYQ7CG0NoQxPnznwV+6xG9uJQlo9FC9YK+AVo5smPZCEl9JQR0dJqcnOgWazlIqn6uz2BibaaUGOIcDOW6DSkByDkYydn3MXPX2JgcynXuf3yR8znJMLUzwA4GHkbJsdrDXP/WNTFCF6W00LJeE2OYAtufJHgzylchJAH47GPB85bNx5KoGfufWwUy2bo/ct/TZ4GHnkNIbCkWcvjO/gh8/ukaZKJqXKhfXF6V/iSqiWyYkBo2r89oiGDIpHS8RB8AxhDIBLEttDYRLyBj0Gw269g5k8Af5z026wjyKLY/TRPWGwEWAtsHgHEYsF5v0FGDxrYYXdauswwrgZqS3S2ZC3MWPnnGemDkwA0UbJIBbMawI+tn1qCSfk+KAqrAF+0g2k6Bs9DCUpbluBkkyKQErbT1UPGayp7UCmM5Q2LdHFr12NtjbLY5IbdpW+wdOpRAnmE7gCiy/ejHGYYh6Qmh8ntYRCE9PMrXkEhowOC8+63E9FMUB5wmQR4SxIFHZ73yAioCKSAnD067dWoEblkn0N8XKUzqecrTeqAJuuuiaqGWikCID0z9Vsq/XJMvwaN6kS1FSNHsKaoviSOEGV+1hGN7mYPEaisJAQQQi3t6EANkQskfYScuJYzm+xsTtX0yJhCXHLxnGLFPQHAuWwE2shNJOcodNjjaB7l2YVCDWiJCHFx2ac45xFx+Z7MwTCQXO1R7DQviLTxzbmpJt/IzZgCL9CFKniVsa0dAQvWuHVaG6n6t94g4O9wBh1sPjtNelvBxSd/INMKsPVh1DIGgGmHvEjzA7GGMxWq1B0JIBQu1AgDblOJArAPbhDOGXnEJ4egKeOGCZn+LS3628rXWLCw5f7XmFVl1C0ZGfFplyudAj3Lt1e8rMQeNz+cFxkVtgaUdi4X4xDmmoOMPSHVaRy/u0gevPOKxwhb7a0bTtEkED8OA9VpAnjJjSyfqimI4bLcpccSIgmeMiRXAOMKyFMvEILaL5mlSzrlXbIWMwWWHQ/iWZxEZC6xwcfpKAkhTuYnzkjFxNjUpEpACzBSvOnii9jloL558vuRqJsoualSLahfioZ+1aOrq3woUrfycAVx1jLFq0kGeqgCXn1X/EGIHBb9qh+ADjEby+6UsiUEAgYTgEi4esJWAPiECJ9bmoO9pcugN4/pLCJ+GKYgwB1vnq6CMyOFab0yXWV5B6VZjsHjJ2hJil9/KipYmamqUBZL26VIG0fJbS69hBUgoa2LmwlUSVFpvuAzoOxt0kWjigWMJX9uk+3KJGELThPBv9h5O6Bx1PQBopBQMGYPVqgeRlIjZRpBHsX0pERMBB3E7DsOAzXoNawivu6JLMqgSZUq9DpzPFDh8LTYqZYxovrvj1wrhwAeTpYj+SYuiVkLVsqHMlh0LF8pxEoVIOUA8lMQl9Wyef6VSOzwYnQVuuZyw6lfwLGx/DaKQDSQVw4ZhSFFbfd+jacpaAcYQ+n5VlYhhxfYrr19BlIQ8ZgUpeZsAgBg3nQA6G2bkAGxjZ4v+rFaGWku4ZI/C7ks7RHYRAT4mjLTlk7TdX5vheqPX39HRPoc7xtFVqa7q7xoCLju0BDRVCyqD5TtlwsxUjKDZLVdyFnPyqRLZgsmIb6OsBF8fCaRLxKSaACG3nGN+oE1lSWKJGC5LxEgeOiCHTRi85nLGicNBDyghzQUTV02lTHjCqcu4FwBAY4F33ko41Gm7Oi9AY4DveK14F9W3K86rQZaa+Booym2Eq48T3npDwCKUrQAgxDNecQR4243SE57pFOWiovQ9HSSqPdOZyEHXes0VjGuOBaRWWLzQiMGqJoAU6G4i4hdjNmK70FnaixIx280mwcCFth/djm3bVMmha4BzcigBuOb4gFuvmPDk6SZPVL274jxdGAJo01pNKFrYPXI6WQip+vffSvi5TzNOrzOXOboC3vUNhH/rWyJeMSPinMVrSaP9AzPzk4FVA/xHbyc8cw745FcYm0EWHeOq44T/5M8H714NBNUIp364eDJFtO2aLwLwZ24wOL4K/hfmkJYn7vjtZoPtNlQGkywhACkkHAT0/aooERNAIaDRSYZLbF/DnXoSSwArI357DePN13t8/EvAsiKQr6fPhUVwqM2f64mbsWUEF/JP3gX8hVcD9z8FrAegbwm3vhK48zrgaJ+jdesQMi0KtMKdd+mOkLG4KF5zOfAz30/45KPAl54PzqhL9kL20m2vzK7degzJ21itiK+eAc4Pmfj1WOV/h3vCN18jzxPWF/6J11XwABEHYkaF9yqAKrI+jo66lBwqXj0baSGsXUrEIA5gHMZogjGatoG4JuW4GCLCn7ne4JJVKMdSjEhWeSTE02eBp84G9omY8aK5gJ5EbRn0DeFbbyS89abS1GBovWO+A5fkfKmlY+E7WVNnhCqi33MbzZ6j750/i2e7HwAeeJqxGTETlfpXx8AtVzBuf2UA6FISKHPc3bHQQ4wI9pxrApAxqYSv9z5Fc2cnEuUSMcL2jTGK7YcXSqTQoGrVhoOkA9vfRs2TmbFa9fjGa1vccQ3j419EWRugUtRPXgA+9SjwxquyciNTPSeMzGgW0iyqeE214ppbGTWR9O9Lj6sfLXb40neWUEy9cwVG3x8Iv/dkSDW3CdXCLC7AAPhzNzkcb7dwvknx/1KWhyJ7b5sWjMDepVDkatWnQh+bzTrpCJIEDAAmsUDMuXRWyPJoZ6t81k440gPf9fos2zX9E5tCYKG/8cXgai2t6vr3rFwtfZywtEUAp7RakodthgjOxy7f0SPIQSQl4WuYORlNlJ+TrT/CHz7HuP/JhXdz+eulh4A/d+MU8ZmqREyaDEaAxhesEOWWhprlVCKm7WIMH1Fg4/F5uRQMoGsIdF0Q2CE3MJeIaWPeuvfhsIm332hw42UGDz9PRcyb7pAh4HNPMD75GOE7X1vb0pnopU+9XrI6pj8jitqxpDlI0vsWFoo8q1TgNEpZttVwsV482hVe9JcIzgO//ADw7PmKQ4pzK9LDM/C2GxnfeLWBiay/qM8Qc/+950QLOZxD6DUOUhPAROCuLPBpVv0K/WqFtmli/n8ADPq+x2q1gjUWw7BNLL7v9yJgRKkdAFarVS5Nsh3wqkMbvOMWX0xemmZlj5/bAD/3Wa6qc9ZmYMYlKhBtRkAN82YCKQW30spL+FdMOOy8SnNV97dSLivTUn4hAv7FM8A//hdL9n4yIsEAjveM77+dccnhDn0XsPxhG+acEACdXhWFDMmhJtHCOYfNNoiEpmnQ9yt0bYvJTaGa2LCtCniINr+kfiviFX9D7TaW3RJw8794O3D18R0Qa/yupRDO9X98XhNrfu+MCNX79KIpcwTnxNZsUverdNZUS+sAnSD0mSqQJfc14YdEOL8F/t4nQgEJK+XqqHwWALAHvvUGj2+93ge+IFaaLLRirCg4l27PPE8hF+lPAq3Xay6/lLBVZeUpOS9mR6XpcP06IjjP+FsfN/j7/9wilWypkCxQsNmvvQT4O+8JRRYK3aMYjGbxeWA6oFOz5Doca67p1L1eVuj0wiu6Qjreb8fiqOTwz36K8Tc/hhzJjOr50c9wbAX89Hscvv01TlU5RxrrwVlSerHO79Wiy4zRZTil5NAetmkwjGOKIpGAQqkRJKd/dH2Pru/BCDWChmiW9PHUCmKHH7p9xM2Xc3I/6sUl/wyFilh/49cZ9z+1G7Yt2armNmo1ofy95g6aMpqFLymQSyw9xyOE72lbP99fcjK5/sn/B/x3vxOilpaJlcf2XbcCf/41FiCT8P0ggvuUkDsMQ8r97/sevQr6HMcxnfDSdV06+WUaR1jbpHYDotlEizJScfu0okpZnX+daahk8OoTjB/+JofGFo+fi3ACHnga+PFfY3z68TyJ9btloubEyQuiBrTmC+LgS+ceFFr9ArxbDCq/Jv8albl/9AXGf/5/MZ47V31ezbEH4YYThLvfAux1lMZWsHjOXBaLO3x5rEs6B223W5abQ4SP1Kq3EMePRP4khwMHyEX7pWWSwv2hw8aEk8ZeuAD82C8b/PYjVLCfwvERf/EeuOly4APfRvju1wfHTgaCwpLcRcMlblGz50X/i26naK0fMKm1CVmwf42ORiX3H3yO8d//LvD8+WwdzART/F5rgb/xDo9/+01TekFd+FnmXBYYi88fSEf9hLksz3bIaK9PgyUfqSgpRcwe1ja5UKQqFx8qg4W6wdrt2MVTQgDEKlWhxNxqby8UmQbjt7844sc+avH0efEg8mwm5FfPwLEV8J7bgbvfQnj15YA1MSqHy51Wyum8QJYIv8vePxAHqFbKwSFdmWuMDvj8V4Gf+WeMX38oZDHNYhlYKXMIORXf8w3Af/vuCSsEzL+pq7RtNwComPPtZhPyAoBg0UUzcL1ep4RROTSKvcd6s07H+zZKTY0ruNBykGDMhagdWhKS8VtS6RrM8GDcea3Dv3Mn40O/3WJKSRulUiYomKFQd+/nPgP87pcY33sb8O7bQvGIQ20OGdMYgH5e9lfkFTDPAVRjLlYDFp6743494jgVZzchfPyX7g+Ef/psGE8mfmWdKM/gra8E/tNvI1y6R1hvKKkuushVUc1NdJeiXwztiq/FQUklgPb3L6QVsHTYU4g2mR9IVBwXo84PtDHeXLiH7JimaXBua/ATv2bwqw9yyoTR4JAwBG1eew6m4pXHGG+4inDH1cBtrwCuOg7stZQnVnPsWriWxk2lyZf0B+pdXz1bLTYG4H04Auex04wHvgr8/pPAQ88GsZd0q0Uuo6wtDqeVfei7R7zjlmD2CRAnSRz1OQDpDEaE0P2C7QstdLtzSUykdgKaSYoMx3Iiclj0dhsigpoYW06R7U/TCIDQtS2atgntsT4wM8MKC4pOCQkha5sWlx02uOfbQyXs+55EKl5czzopYshCeeYs4ekzwMceAvqGcbgFuiYkShRI8Q49oPhb0I8Kdq3XTlJX6oWkFAZmxsaFKqGDy8Q26kHF7qyCIxjBm/ljb3W466YR4wRVsRUYR07H9Ui5FyC4eoUWK9ugbZvoGt4mx1wTs4OZGetxhHPBF9DGMkAA0KBgLVBgAxU7kaspYtUunxi1tRjl7HMkwGuuYPz42wf8h7/a4vR6d4x9fSWzEMDoCac2CxTThKeFjwtFryL+i4BPxQJQsLLunzh1eIkbyR9VR1oL/LtvBn7kmxnGZ6BHD0K76gt8JNGCC9Fc01N8L3KWY2oHQMM4sKzq4AIOQaE1CwKHuMHUHvMCgXy2MJiLUuQ2RqBIyjL7kNF6fmzwl/+Bxe89SVBxpTNQpF4AsxtL3KdCubLI5fo7Owg7V83nt6F+TKXLctWnerFpc8Ma4C/fMeEDd004tgrRVuJPEeXNUEj9Lmih5xzh8O4859nVG0RwjP9v2kT8adIlYlIpmHhMzDhVp4aZ6nTwcKwMiFJZktDeBJ+0hCfp/PTGwnuOdQgcXtg3eO78bkWr2EC0QHyN6yRcWLHsJXrP7L96halmXvi9ujepYrTwxFqeFH2I+pYB/tIdjJ94+4AjzRR9/U06ssfHMDzPnI53CcSrSsHEiO1wlI+EfrUhVIwZ0zjBTZkWKSRsCqVmmhnkquzF0Oey3KvY+Ol+ZPs/sRWVsZICEZGBoj94Fnh+H4uFnjMuvSASaOlOmt0iUXu1bS+/B05xEK+fvzbRjooXLdJZuldq5rnXrQF+5E7GT9zFOEThKDub5jzOaczjJyAEflZznux5LtvzZ4oWNX3UrmrExpd4MmFBugJYrgkQs4EosKvQHs6sKw87DjFpY6pjF+zZkIYW0rg343wBLJJUs2euP9hFMFIykZZZN16ssfp4ybKoerFbymRT70gHvPctDnffOeKIJdimRxfnXODeutLXWpWC2dOJuut5ou40jlhLTYBY91HEe8oSirA+ADRyOKGxNplwAIpMk5RTVsh9Tv7laXLxMMPgixbZNAwDvAtF+LuW0DQGp9fAZ5+sKlZXEzfzp1ds9qXuXZ1qVT9Kcxpp0Nxj10IQtl9AJrOFMS9S7xh41THgx+9i/Ju3jmjgMTlC22VzWid0JOTO+2SSi3UgC8C5WG6ybVOSzjgiVW6jtjy93cU6AUSUrQDNDjwzjMo5F84g9mPABTJrqjOFBSsoKonJuXYRoPjS88Ajz+eDJOayesf8K3a7dEuN6NVu59niqBtFNORfXsQTWPW9EAnzFXvn9YyfvIvx9puAYQj4gYZmC7AHiG2RBgL7ImxMebeJNrLA73JJNrdkeadFpby4ghU0e3srAHMW1K9WIAonTUh8oI1lScBB6SjZ/qHEavb390EIhxp3povewhFuHHDfYxan1/3c3x4n6yXtcM619fXi2AXrFoDlQYtiYUEUnIMP+AwRyVTv8Qwc64EfugN4750DrjrisN3kRE3PPtRkZsnM0tXYMtuXQyJSQm7cwXnOy1oBXXco7fphuwUZQtd2MHKo97BNJXQaKSiEuBK9Lw8dDmfwhBVqTUj+IEMgZe6F1ajy0+P5dFKuRFb5MAGfe8piclLWpcIAZibTLiItrJ4K1CH1mdjWOx2BL0G+z1kOdq5Uz2F8b7oWeP9bge+4hcGjw+Sq/HyPVInFGiqSbkV5tsrcI0JCXBtlYjMHNJYpiw9R+Dx7kDepmgv78Fwv5qEQMWSQhmIQoggKiwpsP0ONqVaAQMSxXWbQxjBy8V6JSHn+AvDAM6GUfBElhJd2iWWht/mijigKIJVbtY5m+iNfC9iB8yGJ86++yeEHvpFwzfFwaNUgMC7l/Px0qLMJQbHlnNs01pCoG0SviXMutAjjqj2GLnFDXTGsziAGCI2wcQkqEOKncHFrk0YawsWz5int4zhivb8flL2uTXFqgzrUeG/V4dGzNp2AlQj4Enh+kn8c3MUhTTtm8Sz4EZaCQCugbE7IA+g6W4T6vuivMARcdwnju78B+KE3El53pcE4bHF+Px/eXObnB+JLe0jIDZlWwvYB8dKG01pDZpaa80i7ru3Q6loB+0OkRYcuJGpiux3gvSveCSDiAMzwKNmHHFIsOX8pCMNzEnSmUiCJxRunFJxUv45w35MhJs7ULPZFsFghyBVHwpkCN58A7n+S8bknEc4mUF9bwg5efOMruJAOJn76RiT8qgFefTnjnbeMeOdrHb7hmh59a8Jxdb4sq5tYNoICbYwK9Y7PFE+etMuuFZEghAt98KnPqVhXpIUEoCZxEBVFY3JZGQBoUio3hUIDzgVWkYI8AFUrAOm0KQDJJARKT2JhzkSnxoUB+MzjebcUOy39L+nhcZJCQujNJ4B3vM7jHa/1uP0qg1UDnNr3uO8Jj994pMFvPUJ44jSwnQK6aBThi1W0tLLiG9OBr0obZ/k72joeof+dBa44ynjTtYzvvAV4y3UTXnHEgcAg9nATxR2ezS1h18m0llJ70Qz3zEmkpvZI5ECLoB/I3IJywE0555oWyrQ0JmR9UUxs4WBaknOhtKOAP7LrRRwIgCApYgIijDFmEAiJim0XUna3Mb6QIguSgJAHn9zir/xCh6fPmUSg2RaXzcjAXsd4w6sY777V4ztf3+D6ywB2U2Bl7NG1HfpVh8kBX3puwKcf8/jkYw1+/6sWT58lXBgYnqksWzejfe0oKD8XRcpSqH30iuPAHVcT3nYj8MZXjbj26IBVCzRth6bJZ/fI+Pu+T3X5JPFW5+cXc54sL4JzE7bxGL7GWnSRFsWci2eQge2wTZC8tOuaALovUhDUR85cJIeK4qZLqApnyO7ZvLXm9QMqT1OKNyQ8/ILFKTlIUhFE5l8edcke8LYbPd71+hFvvs7jiiOErg85iBNnLTgQiGCIccOljGuOTvjeWx1ODj0eeaHBQ88SvvicwxefYzx73mA9EjYjYYysOS26ZHszLEJIVt8Ah3vCVccJr77c4+ZLR7z6csZrX2Fx3YkWnQWGgbEdwmGTtkEp9qrgGJkzObU0z43y8klb6g1m4mBxzlOgjsx5DQv7xD3mtR8YjU4CNdbCRJs0lY7xIURMHh6cQmGbStIoA8qTSKk9eLUCy3/wGYP1QKlGvhDR+fD5tZcyvuMWj3fdCrzhFRMONR4eBB+rYwKIbNImook/nEEg06A1wNW9x/WXTPgLNxOG0eHU/oQzG4MzQ4PnzwOn1sD+GMTF5IKqbMA41IYU86O9x6Ur4IpjFicOA4caB/IuYuoMww7jyPEU03lfZuOPhDRkAEsLbN8mK0nm3MeCzojiILF9cC75Eu3/8E4kpxDzAi2QdYmA+mbEtykw/9UKhihXBgOitr9Kg9xs1mCenygqAEXfdejSiaIbDMMW1hD6ZqXYKsEjlIl9w6uAd90KvPN1jOuODrAUCN90OSZRAKom+h9I3rnJ8XF7q1UIzthusY3JkV3X41WXHcKrAGxjHFzSyBVrZh8qo/V7KxA18LFETpCVFm2/l1jwJlpHbdsmH0nIygkbabXqYW2TWO0QWfAqntbJHA/pdj6BP+L922xDHGC2Aigl6oa0vK4qy7PJc77XJ3EgmH+/WkV9IBwwFQ6Szu8kqJNDU5gDKTetEgdZPmcHS8Fq4v0gHRoeIUkORP7EV4AHvxoied54lcP33sb4tte2eOUxgvfAeu0x+YAvlCJI0rpUmjXJs0vroYzejfd4H07acgAZgCGwNcUDo0MfvQ8watDgfZJPWsPWOEQRAp+8p6pdKbv5fpPmUXtIQ8Bpfo5wE/3s2TsrMaFrJyYFlrRjDLPn0P7+Psv81aCB3FiDDNK5umatcJKlsGRrQgzAF54BjvSM113hcbQPgAfIpBi35XeWeLZE54qjSd4p7FJMz6Iv0aECZC1Z2DBzuN/W42ddDxkJKQUirh53kZMavIaiyVyNX8RrBNCciFFQLsi9MOe72gGkUPCD5vwgWqRF7Jxjmbhwrjwntk+I4E8M/w4JhiEUeRpHbNVpojpJcYruyF4dXhzY3pS13RiYIOxNsyan2F7TNEk7HscxhqIz2ja+EwFYCRnMgR220QW6Wa+DFmxCHWQb0bUQ/h7k7mpvlQ7I2GzWKTAjs+AxHcgkGVLCgtPxeTFbJ41/CjH9EhYvokb6soqsWQ57Yu9hoqs3Yf6xepse/1IofjHnUbw1MSZzs9nMwsLF8kj5BYUVUGuaCywusX5CwZoK9hu/u+SxcyxHq2oAhIvvF3GEWLgKGFn8xgtn5WpxoFmqdEYhhvI02enSDXl6XUktWU3VNCGJKyr7gloUlO0z1q7nsXhWeU+yHJSzQw8rg23qMx07uNlsUu3tnEdXvnSWFBofkmTWgWYK/kjtaXB1ezUTS/fnVCrOeQrFeNQJKEJ4riY9ElkXhhC7VQJ4tBtXENQZkRfHueMgai4Xvk7aLQ7vXXiOhsHzO+X09/r8BqAZhm0wN0wuHeLcFNlkqe2PqSxJYId91wGUz7IHl5kpKUuICHurFWzThAOp1pt0pk1+Z3Qvc6hVVLhAN4KFtwmgElcnAykxEkRB8xb/Q2TBge3vh9i4eNiVWAFB7HmYWDqFVF+YGW3TFLV3i8ycVR9YrYRocyX21usQG0mEVcWCZ+OPpfiZQyTParUCROzFk1ykICRRCMUfpCDkaoWubQACNpstxjFbASksPIpDo0RQUIfjgqFyQSHV39PAhuwAxREKDqN2gtwjLDRFyqgwmprp5U3Hc/EiO7mK9CjEBudw9NTP8uZln3DNx5WGngdX796y0zL+yi7a6YeY+ywoz/nCd+STWpxAj3/2PP3nUu0HCiJAD7yWU3M2RYoV1e3L1UEXJ0DRgnQjSha16zl1fYDZ5EZLYUlE6WelEm477q/HtNQ+T1rN2PbS+Asx8lLmqvqwptG8OpluL0V6ISoBNKLV+ngmoPceTTwlZCk5NOWmJ40cAYgQtp80cmBvtUrly9brdTjiLLI9YYf7+/vJ/7CYkFpZAQJQLSWkAsCq75NfYr3ZYJpGhMpYq1Q9cx3fGfqSrYA0/iYnx47jiEEKZXZdqJHEOTcfQLQC+qR5S2ZOFkEe6/3MgvcOHUq+gP39/YC2Njohd0wRQW3boF9pEZStAG15jFVyqFheyQqIIpi9x/56HUxlIJeIWWK71bKqlmThvynY1k5LYUHTzfi3ynxR8kixp/kurFc/5t9LT6+42C73sFnoYzIHkBU/adP9m40fIkLzdxJgpsevuUpyqacmtZOr7+wYO1SfZr8p5xgIoPV6P2dxVb5mQbVIEvQ4V/qQ0Caw0nzjM4Q7e6U/GJUbzT7I6hrt0yFmO/sS9RDv9bNLDb/oC5SFExcXUeVTX9L8ld5jFOE856pj0q43z1K/Z32MDi2KfZmNP1onQDWHEXwClgCf+ZzPnEiqj9JuJHZ/ci65e601GMdwkLT3Hm0TWb8hTPFs+gDGRDcwdA4ApQOmQ2bKiGmaUrmStm3hfHj2NE3pXmttyHoZRzhVlsYYg3EY46HWPj4juKQndS6edoOO44BxGmFMSIRs2xbeu5ismsfZNA2mKbbr8TcNxmnCIAdpCwCU3hlYvB6njN8Q5XE6n8Yp42+aBpNzGMfgNm5jAmcYf5hb78M7Wxl/fDard8qcTwtzLvdba1JfvHMYxhHjNKGxNt0fbAfadUbv3INeqKkKY57Z65lfJUmQV2FZgzgrsrlKIFeig5YUPiqfk5szt8kYfu6frhtEwCxJSDhIjT/UgEshRgpQqVbKQlvhshXwSn2LQGDST9WYB6vn6GcviLj4Ye0DSKCWPJsBGoYtC3F8ijahslbAAv6f2lmOLpFzBV3yb9sK/5YJaJRLVxJP63cu5cSndsT6BNGVKjnxM/xf2pHPQ0zvjJf2C0iSjI5kkpxGESmF/0MUqSoPX+a9fqeOBpJrqS/azzGbcx3ho84DzOOnJOJ2+QX0O03TRFYQz5UfpxEcNWE5ZVrYpIAxbVsmKkKzoNjuouuxic/23odkRxdwb2F7zjlMMbu1aSzatoG1wT2a20MCK1FISB1jvrz0UfdFs0PvPcZpwuQCC27bNh2kLGzfVn0Zp3DAcnhnG/z08Z1AxYLjs4mQ5kXGP0W/R9vmw5ulQqcxJr8zir085yHce3IutnNqJ8QkUEkOVX0J4x/n41ciSOjs47OnaczJoYJfE0ziSRn/1qxG25Fa0+cKXi9z2msXqcamuWzK7LoGfiJ3InDRF2GTmTFzIcaynV7a7pQ0+3n7i4maUsFC8c7khkVVwqUQs9pnUMLNkOGrwMYSv8njiZ+m92WXfb5VA3rayiIAdOHCBQ4dNmhaiTbxIQqHq5oAPqQUB9epSQGioSaAnGLRqFy3KaUsyQ6W1SoRrW08Cj3XJwiT2yzlxNNyrry1Vr0zJ6w01ibRlMrVAKmyiZd3cqhb0FjpSxw/QiSPrcePwPaL/HxxtUpfmDG5KZl1efwhZVuIvzT+l1QTQNdhqMYv4lO3y0kwiHMrormR8iPGMHrbJzbrphiUqIgxjozJBfDDRI1WXiphW1JvINwf2I8hgollSdh7DC4cgGyMTQcdy2HGkg+vj6URzL9t1LOHIZSfiRMwy58HJZYHjsmR0wRjLbpYL5+8xzCEyB8LC9urI3LcFsxA0xD6+Oxh8KlOQjd75xjeGfvIzBhiiRwpv5PG74ckCkzfw0aWn/ShpkEn4x9HDKlETFsW6IjFvRs1L1MUMwQU4xdLzxiCtSovgAzFAxxUTQAg2f6EnA0kq5ATy18GNLTrVAdwMHvl4jQFCxY2Js6Jgr0Zk07GkKNOdB8BqPyDqlSNEkFlrTxpNyFWXrF3aafYp2L8CkTiwvdgkhgqAmtF+ZJ3Iopa1T7zIEaen4BchdzkGn9x/MjPlstU/ajFVq4tQKBxHFkmUGxNYwhtmyFisbVtOoECSXkT711egSOcC50UJTLsHnV4cduGE62jzR5Kx5hUil6/UxSm4p1gWNugbbLSJaveNk0qVzNOI7yTA5NbEMk7xzThUuaemTEOIxghUKTtFsZf7XphzY28Ezk3UhRjEQdDxDHCO7v8znFIINfS+BfnHIhcUvdlSqKm6IsvaaHHH8VkTFxASBhkzyCyxW6R8KglGcTMaAjJvTiNKMxGiXrlaGbJ0eXijpXkUxt3kTaz0jtTTp2EZDGszUkqwVoI72z0OyOoRJHjZBYsIVz51FTnXBy/B8XEy3r8Oj9f6z1EbXonoE5TTX3x4IHhXPlOGb8c1xsSPXbPuY9iMnC6vNAn5rTQ6znXYXO5VsA23Z+CQpNOXgAa6tLae1ZOC9Alc6Flt+gcJtHPp+rP3Xh9Ol+k6AvtuLe8dj1zVz8W29NAl9qWHpEPvdzVy9raCQDVAXTQL9v94Dw/hYmVO/n/A8n+hDkbycLrAAAAJXRFWHRkYXRlOmNyZWF0ZQAyMDI2LTA1LTI2VDE4OjIxOjE5KzAwOjAw7trtQgAAACV0RVh0ZGF0ZTptb2RpZnkAMjAyNi0wNS0yNlQxODoyMToxOSswMDowMJ+HVf4AAAAASUVORK5CYII=";

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
