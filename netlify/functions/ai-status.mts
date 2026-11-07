// GET /.netlify/functions/ai-status?slug=033s22
// Status comes from the repo: post file exists = ready, failure marker = failed,
// pending marker = running. No database.
import type { Config } from "@netlify/functions";
import { requireEditor } from "../lib/auth";
import { fileExists } from "../lib/github";
import { handle, HttpError, json } from "../lib/http";
import { postPath, readFailed, readPending } from "../lib/jobs";

const TIMEOUT_MS = 16 * 60 * 1000; // background functions stop at 15 minutes

export default (req: Request) =>
  handle(async () => {
    await requireEditor(req);
    const slug = new URL(req.url).searchParams.get("slug") ?? "";
    if (!/^\d{3}[fsw]\d{2,}$/.test(slug)) throw new HttpError(400, "Invalid slug");

    if (await fileExists(postPath(slug))) {
      return json({ status: "ready", slug, editUrl: `/admin/#/collections/posts/entries/${slug}` });
    }
    const failed = await readFailed(slug);
    if (failed) return json({ status: "failed", slug, error: failed.error, code: failed.code, model: failed.model });

    const pending = await readPending(slug);
    if (pending) {
      const age = Date.now() - Date.parse(pending.startedAt);
      if (age > TIMEOUT_MS) return json({ status: "failed", slug, error: "সময়সীমা পেরিয়ে গেছে (১৫ মিনিট)" });
      return json({ status: "running", slug, startedAt: pending.startedAt });
    }
    return json({ status: "unknown", slug }, 404);
  });

export const config: Config = { method: "GET" };
