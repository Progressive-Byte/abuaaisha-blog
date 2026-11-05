// Background function (up to 15 minutes). Calls the AI agent, validates the result against
// the site's schema, converts the cover to WebP and commits the draft post + image in ONE
// commit, removing the pending marker. On any failure it commits a failure marker instead.
// The draft is always `draft: true` — only a person can publish it.
import { generateDraft } from "../lib/agent";
import { requireEditor } from "../lib/auth";
import { buildPost, toCoverWebp } from "../lib/draft";
import { commitFiles, fileExists } from "../lib/github";
import { failedPath, imagePath, LENGTHS, pendingPath, postPath, readPending, type FailedJob } from "../lib/jobs";

/** Turn provider errors into something an editor can act on. Full details stay in the logs. */
function readableError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (/RESOURCE_EXHAUSTED|quota|\b429\b/i.test(raw)) {
    return "AI কোটা শেষ হয়েছে (429)। Google AI Studio-তে বিলিং/কোটা দেখুন, অথবা পরে আবার চেষ্টা করুন।";
  }
  if (/API key|PERMISSION_DENIED|\b401\b|\b403\b/i.test(raw)) {
    return "AI কী বা অনুমতি সঠিক নয়। Netlify → Environment variables-এ AI_AGENT_KEY পরীক্ষা করুন।";
  }
  if (/Missing environment variable/i.test(raw)) {
    return `${raw} — Netlify → Site configuration → Environment variables দেখুন।`;
  }
  return raw.length > 500 ? `${raw.slice(0, 500)}…` : raw;
}

export default async (req: Request) => {
  // Re-check the caller: this endpoint is public like any function.
  await requireEditor(req);
  const { slug } = (await req.json()) as { slug?: string };
  if (!slug || !/^\d{3}[fsw]\d{2,}$/.test(slug)) throw new Error("Invalid slug");

  const job = await readPending(slug);
  if (!job) throw new Error(`No pending job for ${slug}`);
  const started = Date.now();

  try {
    if (await fileExists(postPath(slug))) throw new Error(`${postPath(slug)} already exists`);

    const draft = await generateDraft({
      topic: job.topic,
      category: job.category,
      words: LENGTHS[job.length],
      notes: job.notes,
    });
    const cover = await toCoverWebp(draft.image);
    const { markdown } = buildPost({ slug, category: job.category, draft, hasImage: !!cover, date: new Date() });

    await commitFiles(`content: AI draft ${slug} (needs review)\n\nRequested by @${job.requestedBy}. Topic: ${job.topic}`, [
      { path: postPath(slug), content: markdown },
      ...(cover ? [{ path: imagePath(slug), content: cover }] : []),
      { path: pendingPath(slug), delete: true as const },
    ]);

    // Cost tracking: one structured log line per job (Netlify → Logs → Functions).
    console.log(
      JSON.stringify({ event: "ai-draft", slug, by: job.requestedBy, ms: Date.now() - started, usage: draft.usage }),
    );
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({ event: "ai-draft-failed", slug, by: job.requestedBy, error }));
    const failed: FailedJob = { slug, error: readableError(err), failedAt: new Date().toISOString() };
    await commitFiles(`ai: failed ${slug}`, [
      { path: failedPath(slug), content: `${JSON.stringify(failed, null, 2)}\n` },
      { path: pendingPath(slug), delete: true },
    ]);
  }
};
