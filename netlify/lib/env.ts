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
    return (process.env.ALLOWED_EDITORS ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  },
  get dailyLimit() {
    return Number(process.env.AI_DAILY_LIMIT ?? 20);
  },
};
