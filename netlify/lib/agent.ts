// AI agent adapter — the ONLY file that knows which provider is used (currently Google Gemini).
// Swapping providers means rewriting this file; callers depend only on `generateDraft`.
//
// Env: AI_AGENT_KEY (required), AI_AGENT_URL (optional API base URL override),
//      AI_TEXT_MODEL / AI_TEXT_MODEL_FALLBACKS / AI_IMAGE_MODEL (optional model overrides).
import { GoogleGenAI } from "@google/genai";
import type { Category } from "../../src/lib/post-schema";
import { AiError, canTryNextModel, fromProviderError } from "./ai-error";

export interface DraftInput {
  topic: string;
  category: Category;
  words: number;
  notes?: string;
}

export interface AgentDraft {
  title: string;
  summary: string;
  description: string;
  body: string;
  imageAlt: string;
  sources: { title: string; url: string }[];
  /** Raw image bytes from the agent, or an https URL to download. */
  image: { data: Buffer; mimeType: string } | { url: string } | null;
  usage: { model: string; inputTokens: number; outputTokens: number }[];
}

// Free-tier keys have no quota for Pro-class models (gemini-3.1-pro answers
// 429 with "limit: 0"), and older Flash names are retired for new accounts
// (gemini-2.5-flash answers 404), so defaults must be current Flash models.
const DEFAULT_TEXT_MODELS = ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash"];
const DEFAULT_IMAGE_MODELS = ["gemini-3.1-flash-image", "gemini-2.5-flash-image"];

// Must stay well under the 15-minute background-function limit (text + cover + commit).
const REQUEST_TIMEOUT_MS = 10 * 60 * 1000;

const csv = (value: string | undefined) =>
  (value ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

const textModels = () => [
  ...new Set([...csv(process.env.AI_TEXT_MODEL), ...csv(process.env.AI_TEXT_MODEL_FALLBACKS), ...DEFAULT_TEXT_MODELS]),
];

const imageModels = () => [...new Set([...csv(process.env.AI_IMAGE_MODEL), ...DEFAULT_IMAGE_MODELS])];

const CATEGORY_HINT: Record<Category, string> = {
  faith: "ঈমান — আকীদা, ফিকহ ও ইবাদত",
  social: "সমাজ — পরিবার, সন্তান প্রতিপালন ও সমকালীন সংকট",
  worldview: "বিশ্বদৃষ্টি — সেক্যুলার চিন্তা ও মুসলিম পরিচয়",
};

const SYSTEM = `তুমি "আবু আয়েশা" ব্লগের জন্য খসড়া লেখক। ব্লগটি সালাফদের পথ অনুসরণকারী একজন মুসলিমের—পরিবার, সন্তান প্রতিপালন, সমাজ ও দ্বীন নিয়ে আন্তরিক, ব্যক্তিগত, যুক্তিনির্ভর লেখা।

নিয়ম:
- পুরো লেখা প্রমিত বাংলায়, উষ্ণ ও সহজ ভাষায়; প্রথম পুরুষের ব্যক্তিগত অভিজ্ঞতার সুর রাখো।
- body শুধু Markdown: অনুচ্ছেদ, "## " উপশিরোনাম, তালিকা, "> " উদ্ধৃতি। কোনো HTML নয়, শিরোনাম (#) নয়, ছবি নয়।
- প্রতিটি কুরআনের আয়াত, হাদীস, ফতোয়া বা আলেমের উক্তির জন্য sources-এ একটি নির্ভরযোগ্য https লিংক দাও (যেমন quran.com, sunnah.com, islamqa.info)। নিশ্চিত না হলে উদ্ধৃতি দিও না—বানিয়ে লিংক দেওয়া সম্পূর্ণ নিষেধ।
- summary: কার্ডের জন্য এক বাক্য (২০–৩০ শব্দ)। description: SEO-র জন্য ২–৩ বাক্য।
- imagePrompt: ইংরেজিতে কভার ছবির বর্ণনা—বাংলাদেশি ঘরোয়া পরিবেশ, প্রাকৃতিক আলো, সিনেমাটিক ফটোগ্রাফি; কোনো লেখা, লোগো বা মুখ স্পষ্ট নয় এমন। imageAlt: ছবির বাংলা বর্ণনা।`;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    description: { type: "string" },
    body: { type: "string" },
    imagePrompt: { type: "string" },
    imageAlt: { type: "string" },
    sources: {
      type: "array",
      items: {
        type: "object",
        properties: { title: { type: "string" }, url: { type: "string" } },
        required: ["title", "url"],
      },
    },
  },
  required: ["title", "summary", "description", "body", "imagePrompt", "imageAlt", "sources"],
};

/** Read the key the way Netlify actually stores it: trimmed, with wrapping quotes removed. */
function apiKey(): string {
  const raw = process.env.AI_AGENT_KEY;
  if (!raw || !raw.trim()) throw new AiError("MISSING_KEY", "AI_AGENT_KEY is not set");
  let key = raw.trim();
  if (/^["'].*["']$/.test(key)) key = key.slice(1, -1).trim();
  return key;
}

/** Only accept an absolute http(s) URL; a bad override must not silently break every call. */
function baseUrl(): string | undefined {
  const raw = process.env.AI_AGENT_URL?.trim();
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("unsupported protocol");
    return raw;
  } catch {
    console.warn(
      JSON.stringify({ event: "ai-config", warning: "AI_AGENT_URL is not a valid URL; using the default endpoint" }),
    );
    return undefined;
  }
}

const keyFormat = (key: string) => (key.startsWith("AQ.") ? "AQ" : key.startsWith("AIza") ? "AIza" : "other");

function client(): GoogleGenAI {
  const raw = process.env.AI_AGENT_KEY ?? "";
  const key = apiKey();
  const base = baseUrl();

  // Diagnostics only. Neither the key nor a derived secret ever reaches a log line.
  console.info(
    JSON.stringify({
      event: "ai-client",
      keyFormat: keyFormat(key),
      keyLength: key.length,
      keyHadOuterWhitespace: raw !== raw.trim(),
      keyHadSurroundingQuotes: /^["'].*["']$/.test(raw.trim()),
      baseUrlOverridden: Boolean(base),
    }),
  );

  return new GoogleGenAI({
    apiKey: key,
    httpOptions: {
      ...(base ? { baseUrl: base } : {}),
      timeout: REQUEST_TIMEOUT_MS,
      // We do our own model fallback; silent SDK retries can eat the function budget.
      retryOptions: { attempts: 1 },
    },
  });
}

interface TextResult {
  text: string | undefined;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

async function generateText(ai: GoogleGenAI, prompt: string): Promise<TextResult> {
  let firstError: AiError | null = null;

  for (const model of textModels()) {
    try {
      const result = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction: SYSTEM,
          responseMimeType: "application/json",
          responseJsonSchema: RESPONSE_SCHEMA,
          temperature: 0.7,
        },
      });
      return {
        text: result.text,
        model,
        inputTokens: result.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: result.usageMetadata?.candidatesTokenCount ?? 0,
      };
    } catch (err) {
      const mapped = fromProviderError(err, model);
      firstError ??= mapped;
      console.warn(
        JSON.stringify({
          event: "ai-text-model-failed",
          model,
          code: mapped.code,
          status: mapped.status,
          error: mapped.detail,
        }),
      );
      if (!canTryNextModel(mapped)) throw mapped;
    }
  }

  throw firstError ?? new AiError("PROVIDER", "No text model produced a response");
}

function parseAgentJson(text: string | undefined): Record<string, unknown> {
  if (!text?.trim()) throw new AiError("INVALID_OUTPUT", "The model returned an empty response");

  let json = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(json);
  if (fenced) json = fenced[1];

  try {
    const value = JSON.parse(json) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("not a JSON object");
    return value as Record<string, unknown>;
  } catch {
    throw new AiError("INVALID_OUTPUT", "The model returned text that is not a JSON object");
  }
}

async function generateCover(
  ai: GoogleGenAI,
  imagePrompt: string,
  usage: AgentDraft["usage"],
): Promise<AgentDraft["image"]> {
  if (!imagePrompt) return null;
  let firstError: AiError | null = null;

  for (const model of imageModels()) {
    try {
      const pic = await ai.models.generateContent({
        model,
        contents: `${imagePrompt}\nPhotorealistic, warm natural light, 3:2 landscape, no text or watermark.`,
        config: { responseModalities: ["TEXT", "IMAGE"], imageConfig: { aspectRatio: "3:2" } },
      });
      usage.push({
        model,
        inputTokens: pic.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: pic.usageMetadata?.candidatesTokenCount ?? 0,
      });
      const part = pic.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
      if (part?.inlineData?.data) {
        return { data: Buffer.from(part.inlineData.data, "base64"), mimeType: part.inlineData.mimeType ?? "image/png" };
      }
      firstError ??= new AiError("INVALID_OUTPUT", "The image model returned no image data", { model });
    } catch (err) {
      const mapped = fromProviderError(err, model);
      firstError ??= mapped;
      console.warn(
        JSON.stringify({
          event: "ai-image-failed",
          model,
          code: mapped.code,
          status: mapped.status,
          error: mapped.detail,
        }),
      );
      if (!canTryNextModel(mapped)) break;
    }
  }

  // The cover is best-effort. A model/quota failure must not throw away a
  // finished article: the draft is committed without an image and the site
  // falls back to its branded placeholder.
  console.warn(
    JSON.stringify({
      event: "ai-image-skipped",
      code: firstError?.code ?? "UNKNOWN",
      status: firstError?.status ?? null,
    }),
  );
  return null;
}

export async function generateDraft(input: DraftInput): Promise<AgentDraft> {
  const ai = client();

  const prompt = [
    `বিষয়: ${input.topic}`,
    `বিভাগ: ${CATEGORY_HINT[input.category]}`,
    `দৈর্ঘ্য: প্রায় ${input.words} শব্দ`,
    input.notes ? `লেখকের নির্দেশনা: ${input.notes}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const text = await generateText(ai, prompt);
  const parsed = parseAgentJson(text.text);

  const usage: AgentDraft["usage"] = [
    { model: text.model, inputTokens: text.inputTokens, outputTokens: text.outputTokens },
  ];

  const imagePrompt = typeof parsed.imagePrompt === "string" ? parsed.imagePrompt.trim() : "";
  const image = await generateCover(ai, imagePrompt, usage);

  return {
    title: String(parsed.title ?? ""),
    summary: String(parsed.summary ?? ""),
    description: String(parsed.description ?? ""),
    body: String(parsed.body ?? ""),
    imageAlt: String(parsed.imageAlt ?? ""),
    sources: Array.isArray(parsed.sources) ? (parsed.sources as AgentDraft["sources"]) : [],
    image,
    usage,
  };
}
