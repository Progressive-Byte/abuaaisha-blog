// Server-side configuration. Every value lives in Netlify environment variables;
// nothing here is ever sent to the browser.

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

// Editor logins that are always allowed to generate AI drafts, in addition to
// ALLOWED_EDITORS and the repository owner.
const ALWAYS_ALLOWED_EDITORS = ["rwxlog", "MujahidEmon"];

export const env = {
  get githubRepo() {
    return process.env.GITHUB_REPO ?? "Progressive-Byte/abuaaisha-blog";
  },
  get githubBranch() {
    return process.env.GITHUB_BRANCH ?? "main";
  },
  get githubBotToken() {
    return required("GITHUB_BOT_TOKEN");
  },
  get allowedEditors(): string[] {
    const editors = (process.env.ALLOWED_EDITORS ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    // The repository owner always has access, so a stale ALLOWED_EDITORS value
    // can't lock the site owner out of their own AI drafting.
    const repo = process.env.GITHUB_REPO ?? "Progressive-Byte/abuaaisha-blog";
    const owner = repo.split("/")[0]?.trim().toLowerCase();
    if (owner && !editors.includes(owner)) editors.unshift(owner);
    for (const login of ALWAYS_ALLOWED_EDITORS) {
      const normalized = login.toLowerCase();
      if (!editors.includes(normalized)) editors.push(normalized);
    }
    return editors;
  },
  get dailyLimit() {
    return Number(process.env.AI_DAILY_LIMIT ?? 20);
  },
};
