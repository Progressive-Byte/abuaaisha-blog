// AI agent adapter — the ONLY file that knows which provider is used (currently Google Gemini).
// Swapping providers means rewriting this file; callers depend only on `generateDraft`.
//
// Env: AI_AGENT_KEY (required), AI_AGENT_URL (optional API base URL override),
//      AI_TEXT_MODEL, AI_IMAGE_MODEL (optional model overrides).
import { GoogleGenAI } from "@google/genai";
import type { Category } from "../../src/lib/post-schema";

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

const TEXT_MODEL = () => process.env.AI_TEXT_MODEL ?? "gemini-pro-latest";
const IMAGE_MODEL = () => process.env.AI_IMAGE_MODEL ?? "gemini-3.1-flash-image";

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

function client(): GoogleGenAI {
  const apiKey = process.env.AI_AGENT_KEY;
  if (!apiKey) throw new Error("AI_AGENT_KEY is not set");
  const baseUrl = process.env.AI_AGENT_URL;
  return new GoogleGenAI({ apiKey, ...(baseUrl ? { httpOptions: { baseUrl } } : {}) });
}

export async function generateDraft(input: DraftInput): Promise<AgentDraft> {
  const ai = client();
  const usage: AgentDraft["usage"] = [];

  const prompt = [
    `বিষয়: ${input.topic}`,
    `বিভাগ: ${CATEGORY_HINT[input.category]}`,
    `দৈর্ঘ্য: প্রায় ${input.words} শব্দ`,
    input.notes ? `লেখকের নির্দেশনা: ${input.notes}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const text = await ai.models.generateContent({
    model: TEXT_MODEL(),
    contents: prompt,
    config: {
      systemInstruction: SYSTEM,
      responseMimeType: "application/json",
      responseJsonSchema: RESPONSE_SCHEMA,
      temperature: 0.7,
    },
  });
  usage.push({
    model: TEXT_MODEL(),
    inputTokens: text.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: text.usageMetadata?.candidatesTokenCount ?? 0,
  });

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text.text ?? "");
  } catch {
    throw new Error("AI agent returned text that is not valid JSON");
  }

  let image: AgentDraft["image"] = null;
  const imagePrompt = typeof parsed.imagePrompt === "string" ? parsed.imagePrompt : "";
  if (imagePrompt) {
    const pic = await ai.models.generateContent({
      model: IMAGE_MODEL(),
      contents: `${imagePrompt}\nPhotorealistic, warm natural light, 3:2 landscape, no text or watermark.`,
      config: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "3:2" } },
    });
    usage.push({
      model: IMAGE_MODEL(),
      inputTokens: pic.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: pic.usageMetadata?.candidatesTokenCount ?? 0,
    });
    const part = pic.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
    if (part?.inlineData?.data) {
      image = { data: Buffer.from(part.inlineData.data, "base64"), mimeType: part.inlineData.mimeType ?? "image/png" };
    }
  }

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
