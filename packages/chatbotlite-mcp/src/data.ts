// Static reference data mirrored from the chatbotlite package source.
// Keep in sync with packages/chatbotlite/src/client/providers.ts and
// packages/chatbotlite/src/adapters/index.ts.

export interface ProviderInfo {
  id: string;
  label: string;
  baseUrl: string;
  defaultModel: string;
  visionModel?: string;
  envVar: string;
}

/** The 10 OpenAI-compatible providers the failover chain supports. */
export const PROVIDERS: ProviderInfo[] = [
  { id: "openai", label: "OpenAI", baseUrl: "https://api.openai.com/v1", defaultModel: "gpt-4o-mini", visionModel: "gpt-4o", envVar: "OPENAI_API_KEY" },
  { id: "groq", label: "Groq", baseUrl: "https://api.groq.com/openai/v1", defaultModel: "llama-3.3-70b-versatile", visionModel: "llama-3.2-90b-vision-preview", envVar: "GROQ_API_KEY" },
  { id: "deepseek", label: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", defaultModel: "deepseek-chat", envVar: "DEEPSEEK_API_KEY" },
  { id: "gemini", label: "Google Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", defaultModel: "gemini-2.5-flash", visionModel: "gemini-2.5-flash", envVar: "GEMINI_API_KEY" },
  { id: "mistral", label: "Mistral", baseUrl: "https://api.mistral.ai/v1", defaultModel: "mistral-small-latest", envVar: "MISTRAL_API_KEY" },
  { id: "fireworks", label: "Fireworks", baseUrl: "https://api.fireworks.ai/inference/v1", defaultModel: "accounts/fireworks/models/llama-v3p3-70b-instruct", envVar: "FIREWORKS_API_KEY" },
  { id: "cerebras", label: "Cerebras", baseUrl: "https://api.cerebras.ai/v1", defaultModel: "qwen-3-235b-a22b-instruct-2507", envVar: "CEREBRAS_API_KEY" },
  { id: "sambanova", label: "SambaNova", baseUrl: "https://api.sambanova.ai/v1", defaultModel: "Meta-Llama-3.3-70B-Instruct", envVar: "SAMBANOVA_API_KEY" },
  { id: "openrouter", label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", defaultModel: "deepseek/deepseek-chat", visionModel: "openai/gpt-4o", envVar: "OPENROUTER_API_KEY" },
  { id: "moonshot", label: "Moonshot", baseUrl: "https://api.moonshot.ai/v1", defaultModel: "moonshot-v1-32k", visionModel: "moonshot-v1-32k-vision-preview", envVar: "MOONSHOT_API_KEY" }
];

export interface AdapterInfo {
  fn: string;
  category: "payment" | "scheduling" | "lead-capture";
  service: string;
  example: string;
}

/** The 13 URL-only adapters. Paste a URL, the bot can trigger it. */
export const ADAPTERS: AdapterInfo[] = [
  { fn: "stripeLink", category: "payment", service: "Stripe Payment Link", example: 'stripeLink("https://buy.stripe.com/your-link")' },
  { fn: "paypalLink", category: "payment", service: "PayPal", example: 'paypalLink("https://paypal.me/yourname/25")' },
  { fn: "squareLink", category: "payment", service: "Square", example: 'squareLink("https://checkout.square.site/your-link")' },
  { fn: "lemonSqueezyLink", category: "payment", service: "Lemon Squeezy", example: 'lemonSqueezyLink("https://yourstore.lemonsqueezy.com/buy/uuid")' },
  { fn: "gumroadLink", category: "payment", service: "Gumroad", example: 'gumroadLink("https://yourname.gumroad.com/l/product")' },
  { fn: "calendlyUrl", category: "scheduling", service: "Calendly", example: 'calendlyUrl("https://calendly.com/your-page/30min")' },
  { fn: "calcomUrl", category: "scheduling", service: "Cal.com", example: 'calcomUrl("https://cal.com/your-name/30min")' },
  { fn: "savvycalUrl", category: "scheduling", service: "SavvyCal", example: 'savvycalUrl("https://savvycal.com/your-name/meeting")' },
  { fn: "acuityUrl", category: "scheduling", service: "Acuity Scheduling", example: 'acuityUrl("https://app.acuityscheduling.com/schedule.php?owner=123")' },
  { fn: "msBookingsUrl", category: "scheduling", service: "Microsoft Bookings", example: 'msBookingsUrl("https://outlook.office365.com/owa/calendar/your-org/bookings/")' },
  { fn: "googleCalendarApptUrl", category: "scheduling", service: "Google Calendar appointments", example: 'googleCalendarApptUrl("https://calendar.google.com/calendar/appointments/schedules/your-id")' },
  { fn: "formspreeUrl", category: "lead-capture", service: "Formspree", example: 'formspreeUrl("https://formspree.io/f/your-id")' },
  { fn: "tallyUrl", category: "lead-capture", service: "Tally", example: 'tallyUrl("https://tally.so/r/your-form")' }
];

export interface SkillMarker {
  name: string;
  example: string;
  description: string;
}

/** The 4 built-in SKILL markers the LLM can emit. */
export const SKILL_MARKERS: SkillMarker[] = [
  {
    name: "requestPayment",
    example: '[SKILL:requestPayment amount=4250 currency="usd" reason="deposit"]',
    description: "Renders a payment card. amount is in minor units (cents). The widget opens the configured payment link."
  },
  {
    name: "scheduleCallback",
    example: '[SKILL:scheduleCallback durationMin=15 timezone="America/New_York"]',
    description: "Renders a scheduling card. Opens the configured booking URL, or a slot picker if getAvailableSlots is wired."
  },
  {
    name: "uploadForReview",
    example: '[SKILL:uploadForReview purpose="invoice" accept="image/*,application/pdf"]',
    description: "Renders a file upload card. The user can attach a file the bot asked for."
  },
  {
    name: "pickerMessage",
    example: '[SKILL:pickerMessage prompt="Service type?" options="Inspection,Repair,Emergency"]',
    description: "Renders tappable choice buttons. The user taps one and it becomes their reply."
  }
];

export const LINKS = {
  repo: "https://github.com/agents-io/chatbotlite",
  npm: "chatbotlite",
  demos: "https://chatbotlite-demos.vercel.app",
  apiReference: "https://chatbotlite-demos.vercel.app/llms-full.txt",
  skillSpec: "https://github.com/agents-io/chatbotlite/blob/main/SKILL_MARKER_SPEC.md"
};
