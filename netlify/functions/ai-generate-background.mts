// Background function (up to 15 minutes). Calls the AI agent, validates the result against
// the site's schema, converts the cover to WebP and commits the draft post + image in ONE
// commit, removing the pending marker. On any failure it commits a failure marker instead.
// The draft is always `draft: true` — only a person can publish it.
import { AiError, describeAiError, redact } from "../lib/ai-error";
import { generateDraft } from "../lib/agent";
import { requireEditor } from "../lib/auth";
import { buildPost, toCoverWebp } from "../lib/draft";
import { commitFiles, fileExists } from "../lib/github";
import { failedPath, imagePath, LENGTHS, pendingPath, postPath, readPending, type FailedJob } from "../lib/jobs";

/** Anything that escaped the AI adapter, tagged so a GitHub failure is never blamed on the key. */
function toJobError(err: unknown): AiError {
  if (err instanceof AiError) return err;
  const message = err instanceof Error ? err.message : String(err);
  if (/^GitHub /i.test(message)) return new AiError("GITHUB", redact(message));
  return new AiError("UNKNOWN", redact(message));
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

    let cover: Buffer | null = null;
    try {
      cover = await toCoverWebp(draft.image);
    } catch (err) {
      // The cover is best-effort: a bad download/encode must not discard the article.
      console.warn(
        JSON.stringify({ event: "ai-cover-skipped", error: redact(err instanceof Error ? err.message : String(err)) }),
      );
    }

    const { markdown } = buildPost({ slug, category: job.category, draft, hasImage: !!cover, date: new Date() });

    await commitFiles(
      `content: AI draft ${slug} (needs review)\n\nRequested by @${job.requestedBy}. Topic: ${job.topic}`,
      [
        { path: postPath(slug), content: markdown },
        ...(cover ? [{ path: imagePath(slug), content: cover }] : []),
        { path: pendingPath(slug), delete: true as const },
      ],
    );

    // Cost tracking: one structured log line per job (Netlify → Logs → Functions).
    console.log(
      JSON.stringify({ event: "ai-draft", slug, by: job.requestedBy, ms: Date.now() - started, usage: draft.usage }),
    );
  } catch (err) {
    const jobError = toJobError(err);
    console.error(
      JSON.stringify({
        event: "ai-draft-failed",
        slug,
        by: job.requestedBy,
        code: jobError.code,
        status: jobError.status,
        model: jobError.model,
        error: jobError.detail,
      }),
    );

    const failed: FailedJob = {
      slug,
      error: describeAiError(jobError),
      code: jobError.code,
      status: jobError.status,
      model: jobError.model ?? undefined,
      failedAt: new Date().toISOString(),
    };

    try {
      await commitFiles(`ai: failed ${slug}`, [
        { path: failedPath(slug), content: `${JSON.stringify(failed, null, 2)}\n` },
        { path: pendingPath(slug), delete: true },
      ]);
    } catch (markerError) {
      // If GitHub itself is down, the pending marker remains and ai-status reports
      // a timeout later. Log it so the two failures are not conflated.
      console.error(
        JSON.stringify({
          event: "ai-failure-marker-not-written",
          slug,
          error: redact(markerError instanceof Error ? markerError.message : String(markerError)),
        }),
      );
    }
  }
};
