// Typed AI failures. The UI speaks Bangla; logs and the failed marker carry a
// machine code so an operator can tell auth from quota from GitHub without guessing.
// No function in this file receives or prints the API key.

export type AiErrorCode =
  | "MISSING_KEY"
  | "AUTH"
  | "PERMISSION"
  | "QUOTA"
  | "MODEL_UNAVAILABLE"
  | "TIMEOUT"
  | "NETWORK"
  | "INVALID_OUTPUT"
  | "PROVIDER"
  | "GITHUB"
  | "UNKNOWN";

export class AiError extends Error {
  readonly code: AiErrorCode;
  readonly status: number | null;
  readonly model: string | null;
  /** Safe, human-readable detail (never contains the key). */
  readonly detail: string;

  constructor(code: AiErrorCode, detail: string, opts: { status?: number | null; model?: string | null } = {}) {
    super(detail);
    this.name = "AiError";
    this.code = code;
    this.status = opts.status ?? null;
    this.model = opts.model ?? null;
    this.detail = detail;
  }
}

const MAX_DETAIL = 600;

/** Strip the configured key and any key-shaped token from provider text. */
export function redact(text: string): string {
  const key = process.env.AI_AGENT_KEY?.trim();
  let out = text;
  if (key && key.length >= 8) out = out.split(key).join("[redacted]");
  out = out.replace(/\b(AQ\.|AIza)[A-Za-z0-9._-]{12,}/g, "$1[redacted]");
  return out.length > MAX_DETAIL ? `${out.slice(0, MAX_DETAIL)}…` : out;
}

interface ProviderDetail {
  status: number | null;
  reason: string;
  text: string;
}

/** Read status/reason/message out of the SDK's ApiError without trusting its shape. */
function providerDetail(err: unknown, fallback: string): ProviderDetail {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : typeof (err as { message?: unknown })?.message === "string"
          ? (err as { message: string }).message
          : "";
  const statusFromError =
    typeof (err as { status?: unknown })?.status === "number" ? (err as { status: number }).status : null;

  let status = statusFromError;
  let reason = "";
  let message = "";

  try {
    const parsed = JSON.parse(raw) as {
      error?: { code?: number; status?: string; message?: string; details?: { reason?: string }[] };
    };
    const error = parsed?.error;
    if (error) {
      if (typeof error.code === "number") status = error.code;
      if (typeof error.status === "string") reason = error.status;
      if (typeof error.message === "string") message = error.message;
      for (const detail of error.details ?? []) if (detail?.reason) reason = detail.reason;
    }
  } catch {
    // Not a structured provider error; use the raw text below.
  }

  return { status, reason, text: redact(message || raw || fallback) };
}

/** Map any provider/SDK failure to a stable code, keeping the raw cause only in `detail`. */
export function fromProviderError(err: unknown, model: string): AiError {
  const { status, reason, text } = providerDetail(err, "AI provider request failed");
  const haystack = `${reason} ${text}`;
  const opts = { status, model };

  if (status === 504 || /DEADLINE_EXCEEDED|ETIMEDOUT|timed? ?out|aborted/i.test(haystack)) {
    return new AiError("TIMEOUT", text, opts);
  }
  if (status === 401 || /UNAUTHENTICATED|API key not valid|ACCESS_TOKEN_TYPE_UNSUPPORTED/i.test(haystack)) {
    return new AiError("AUTH", text, opts);
  }
  if (
    status === 403 ||
    /PERMISSION_DENIED|origin is not allowed|is not authorized|has not been used|is disabled/i.test(haystack)
  ) {
    return new AiError("PERMISSION", text, opts);
  }
  if (status === 404 || /NOT_FOUND|no longer available|is not found|unsupported model/i.test(haystack)) {
    return new AiError("MODEL_UNAVAILABLE", text, opts);
  }
  if (status === 429 || /RESOURCE_EXHAUSTED|\bquota\b/i.test(haystack)) {
    return new AiError("QUOTA", text, opts);
  }
  if (/ENOTFOUND|ECONNREFUSED|ECONNRESET|EAI_AGAIN|fetch failed/i.test(haystack)) {
    return new AiError("NETWORK", text, opts);
  }
  return new AiError("PROVIDER", text, opts);
}

/**
 * Whether a different model name might succeed. Auth/permission failures are
 * key-level and will fail for every model; deprecation and per-model quota differ.
 */
export function canTryNextModel(err: AiError): boolean {
  if (err.code === "MODEL_UNAVAILABLE" || err.code === "QUOTA") return true;
  // A provider-side 5xx can be model-specific; a different model may answer.
  return err.code === "PROVIDER" && (err.status ?? 0) >= 500;
}

/** Bangla message for the CMS panel. `detail` is never included for secret-adjacent codes. */
export function describeAiError(err: AiError): string {
  const model = err.model ? ` — ${err.model}` : "";
  switch (err.code) {
    case "MISSING_KEY":
      return "সার্ভারে AI_AGENT_KEY সেট করা নেই। Netlify → Site configuration → Environment variables-এ কী যোগ করে আবার deploy করুন।";
    case "AUTH":
      return "AI প্রদানকারী কী-টি গ্রহণ করেনি (401)। Google AI Studio থেকে নতুন কী নিয়ে Netlify-র AI_AGENT_KEY-তে বসান, তারপর redeploy করুন।";
    case "PERMISSION":
      return "AI কী-এর অনুমতি নেই (403)। Google Cloud project-এ Generative Language API চালু আছে এবং কী-এর restriction ঠিক আছে কি না দেখুন।";
    case "QUOTA":
      return `AI কোটা শেষ (429)${model}। Google AI Studio-র কোটা/বিলিং দেখুন, অথবা অন্য AI_TEXT_MODEL সেট করুন।`;
    case "MODEL_UNAVAILABLE":
      return `মডেলটি এখন পাওয়া যাচ্ছে না${model}। AI_TEXT_MODEL সেট করুন (উদাহরণ: gemini-3.8-flash)।`;
    case "TIMEOUT":
      return "AI নির্ধারিত সময়ের মধ্যে উত্তর দেয়নি। আবার চেষ্টা করুন, অথবা লেখার দৈর্ঘ্য কমিয়ে দিন।";
    case "NETWORK":
      return "AI প্রদানকারীর সঙ্গে সংযোগ ব্যর্থ হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।";
    case "INVALID_OUTPUT":
      return "AI-এর উত্তর প্রত্যাশিত ফরম্যাটে আসেনি। আবার চেষ্টা করুন।";
    case "GITHUB":
      return "GitHub-এ পড়া/লেখা ব্যর্থ (টোকেন বা অনুমতি)। GITHUB_BOT_TOKEN দেখুন।";
    default:
      return err.detail || "খসড়া তৈরি করা যায়নি। আবার চেষ্টা করুন।";
  }
}
