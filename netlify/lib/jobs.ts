// AI job state lives in the repo itself — no database:
//   ai-jobs/<slug>.pending.json   job reserved / running (holds the request)
//   ai-jobs/<slug>.failed.json    job failed (holds a readable error)
//   src/content/posts/<slug>.md   job done
// netlify.toml skips deploys for commits that only touch ai-jobs/.
import { z } from "zod";
import { CATEGORIES, type Category } from "../../src/lib/post-schema";
import { commitMessagesSince, listDir, readFile } from "./github";

export const POSTS_DIR = "src/content/posts";
export const IMAGES_DIR = "public/images/posts";
export const JOBS_DIR = "ai-jobs";

export const pendingPath = (slug: string) => `${JOBS_DIR}/${slug}.pending.json`;
export const failedPath = (slug: string) => `${JOBS_DIR}/${slug}.failed.json`;
export const postPath = (slug: string) => `${POSTS_DIR}/${slug}.md`;
export const imagePath = (slug: string) => `${IMAGES_DIR}/${slug}.webp`;

export const LENGTHS = { short: 700, medium: 1200, long: 2000 } as const;

export const jobRequestSchema = z.object({
  topic: z.string().trim().min(5, "বিষয়টি আরেকটু বিস্তারিত লিখুন").max(500),
  category: z.enum(CATEGORIES),
  length: z.enum(["short", "medium", "long"]).default("medium"),
  notes: z.string().trim().max(2000).optional(),
});
export type JobRequest = z.infer<typeof jobRequestSchema>;

export interface PendingJob extends JobRequest {
  slug: string;
  requestedBy: string;
  startedAt: string;
}

export interface FailedJob {
  slug: string;
  error: string;
  /** Machine-readable cause (AUTH, PERMISSION, QUOTA, …); never contains secrets. */
  code?: string;
  status?: number | null;
  model?: string;
  failedAt: string;
}

const LETTER: Record<Category, string> = { faith: "f", social: "s", worldview: "w" };

/**
 * Next slug in the existing scheme: 3-digit sequence + category letter + per-category number.
 * 032s21 is the 32nd post and the 21st "social" one, so the next social post is 033s22.
 * Pending/failed jobs count too, so two jobs never get the same slug.
 */
export async function nextSlug(category: Category): Promise<string> {
  const names = [...(await listDir(POSTS_DIR)), ...(await listDir(JOBS_DIR))];
  const slugs = names.map((n) => n.match(/^(\d{3})([fsw])(\d{2,})/)).filter((m) => m !== null);
  const seq = Math.max(0, ...slugs.map((m) => Number(m[1]))) + 1;
  const letter = LETTER[category];
  const inCat = Math.max(0, ...slugs.filter((m) => m[2] === letter).map((m) => Number(m[3]))) + 1;
  return `${String(seq).padStart(3, "0")}${letter}${String(inCat).padStart(2, "0")}`;
}

/** Jobs started by this user in the last 24 hours (from the job-marker commits). */
export async function jobsInLastDay(login: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const messages = await commitMessagesSince(JOBS_DIR, since);
  return messages.filter((m) => m.startsWith("ai: start ") && m.includes(`by @${login}`)).length;
}

export async function readPending(slug: string): Promise<PendingJob | null> {
  const raw = await readFile(pendingPath(slug));
  return raw ? (JSON.parse(raw) as PendingJob) : null;
}

export async function readFailed(slug: string): Promise<FailedJob | null> {
  const raw = await readFile(failedPath(slug));
  return raw ? (JSON.parse(raw) as FailedJob) : null;
}
