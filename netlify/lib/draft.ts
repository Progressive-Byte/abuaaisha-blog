// Turn agent output into a validated Markdown file + WebP cover. Anything that fails
// validation throws with a readable message, and nothing is committed.
import sharp from "sharp";
import { postSchema, type Category, type PostData } from "../../src/lib/post-schema";
import type { AgentDraft } from "./agent";

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

/** Strip raw HTML (including <script>/<style> blocks) and stray H1s from Markdown. */
export function sanitizeMarkdown(md: string): string {
  return md
    .replace(/<(script|style|iframe|object|embed)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\/?[a-z][^>]*>/gi, "")
    .replace(/\]\(\s*javascript:[^)]*\)/gi, "](#)")
    .replace(/^#\s+/gm, "## ")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

async function loadImage(image: AgentDraft["image"]): Promise<Buffer | null> {
  if (!image) return null;
  if ("data" in image) return image.data;
  if (!/^https:\/\//i.test(image.url)) throw new Error("Image URL must use HTTPS");
  const res = await fetch(image.url, { redirect: "follow" });
  if (!res.ok) throw new Error(`Image download failed (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_IMAGE_BYTES) throw new Error("Image is larger than 15 MB");
  return buf;
}

/** Re-encode as WebP ≤ 1600px wide. sharp throws if the bytes are not really an image. */
export async function toCoverWebp(image: AgentDraft["image"]): Promise<Buffer | null> {
  const input = await loadImage(image);
  if (!input) return null;
  const meta = await sharp(input).metadata().catch(() => null);
  if (!meta?.format || !meta.width) throw new Error("The agent's image is not a valid image file");
  for (const quality of [80, 70, 60]) {
    const out = await sharp(input).rotate().resize({ width: 1600, withoutEnlargement: true }).webp({ quality }).toBuffer();
    if (out.length <= 200 * 1024 || quality === 60) return out;
  }
  return null;
}

const yaml = (v: string) => JSON.stringify(v); // JSON strings are valid YAML scalars

export function buildPost(args: {
  slug: string;
  category: Category;
  draft: AgentDraft;
  hasImage: boolean;
  date: Date;
}): { data: PostData; markdown: string } {
  const { slug, category, draft, hasImage, date } = args;
  const sources = draft.sources
    .map((s) => ({ title: oneLine(String(s.title ?? "")), url: String(s.url ?? "").trim() }))
    .filter((s) => s.title && /^https:\/\//i.test(s.url));

  const candidate = {
    title: oneLine(draft.title),
    date: date.toISOString().slice(0, 10),
    categories: [category],
    summary: oneLine(draft.summary),
    description: oneLine(draft.description) || undefined,
    image: hasImage ? `/images/posts/${slug}.webp` : undefined,
    imageAlt: hasImage ? oneLine(draft.imageAlt) || "AI দিয়ে তৈরি কভার ছবি" : undefined,
    draft: true, // AI never publishes
    aiGenerated: true,
    sources: sources.length ? sources : undefined,
    lang: "bn",
  };

  const result = postSchema.safeParse(candidate);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".") || "post"}: ${i.message}`).join("; ");
    throw new Error(`AI output failed validation — ${issues}`);
  }

  const body = sanitizeMarkdown(draft.body);
  if (body.length < 200) throw new Error("AI output failed validation — body is too short");

  const lines = [
    `title: ${yaml(candidate.title)}`,
    `date: ${candidate.date}`,
    `categories: [${yaml(category)}]`,
    `summary: ${yaml(candidate.summary)}`,
    candidate.description && `description: ${yaml(candidate.description)}`,
    candidate.image && `image: ${yaml(candidate.image)}`,
    candidate.imageAlt && `imageAlt: ${yaml(candidate.imageAlt)}`,
    "draft: true",
    "aiGenerated: true",
    candidate.sources &&
      ["sources:", ...candidate.sources.flatMap((s) => [`  - title: ${yaml(s.title)}`, `    url: ${yaml(s.url)}`])].join(
        "\n",
      ),
  ].filter(Boolean);

  return { data: result.data, markdown: `---\n${lines.join("\n")}\n---\n\n${body}\n` };
}
