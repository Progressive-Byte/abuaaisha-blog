// POST /.netlify/functions/ai-generate
// Verifies the editor, applies the daily limit, reserves the next slug (pending marker
// committed to the repo), hands the work to the background function, and returns
// 202 { slug } at once. A background function cannot return a body itself, so this
// small synchronous step is what gives the page its slug to poll.
import type { Config } from "@netlify/functions";
import { toBanglaDigits } from "../../src/lib/format";
import { requireEditor } from "../lib/auth";
import { env } from "../lib/env";
import { commitFiles } from "../lib/github";
import { handle, HttpError, json } from "../lib/http";
import {
  failedPath,
  jobRequestSchema,
  jobsInLastDay,
  nextSlug,
  pendingPath,
  type FailedJob,
  type PendingJob,
} from "../lib/jobs";

export default (req: Request) =>
  handle(async () => {
    if (req.method !== "POST") throw new HttpError(405, "Use POST");
    const login = await requireEditor(req);

    const parsed = jobRequestSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, parsed.error.issues.map((i) => i.message).join("; "));

    const used = await jobsInLastDay(login);
    if (used >= env.dailyLimit) {
      throw new HttpError(
        429,
        `দৈনিক সীমা (${toBanglaDigits(env.dailyLimit)}টি) পূর্ণ হয়েছে। ২৪ ঘণ্টা পরে আবার চেষ্টা করুন।`,
      );
    }

    const slug = await nextSlug(parsed.data.category);
    const job: PendingJob = { ...parsed.data, slug, requestedBy: login, startedAt: new Date().toISOString() };
    await commitFiles(`ai: start ${slug} by @${login}`, [
      { path: pendingPath(slug), content: `${JSON.stringify(job, null, 2)}\n` },
    ]);

    const bg = await fetch(new URL("/.netlify/functions/ai-generate-background", req.url), {
      method: "POST",
      headers: { authorization: req.headers.get("authorization") ?? "", "content-type": "application/json" },
      body: JSON.stringify({ slug }),
    }).catch(() => null);
    if (bg?.status !== 202) {
      const error = `Background job did not start (${bg?.status ?? "network error"})`;
      const failed: FailedJob = { slug, error, failedAt: new Date().toISOString() };
      await commitFiles(`ai: failed ${slug}`, [
        { path: failedPath(slug), content: `${JSON.stringify(failed, null, 2)}\n` },
        { path: pendingPath(slug), delete: true },
      ]);
      throw new HttpError(502, error);
    }

    return json({ slug }, 202);
  });

export const config: Config = { method: "POST" };
