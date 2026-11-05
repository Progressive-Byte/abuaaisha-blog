// Server-side configuration. Every value lives in Netlify environment variables;
// nothing here is ever sent to the browser.

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

export const env = {
  get githubRepo() {
    return process.env.GITHUB_REPO ?? "MujahidEmon/blog-pgb";
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
    const repo = process.env.GITHUB_REPO ?? "MujahidEmon/blog-pgb";
    const owner = repo.split("/")[0]?.trim().toLowerCase();
    if (owner && !editors.includes(owner)) editors.unshift(owner);
    return editors;
  },
  get dailyLimit() {
    return Number(process.env.AI_DAILY_LIMIT ?? 20);
  },
};
