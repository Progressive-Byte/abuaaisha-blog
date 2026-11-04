import { env } from "./env";
import { HttpError } from "./http";

/**
 * Every AI call: verify the caller's GitHub token with GitHub itself, then check
 * the login against ALLOWED_EDITORS. Returns the GitHub login.
 */
export async function requireEditor(req: Request): Promise<string> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) throw new HttpError(401, "Missing GitHub token");

  const res = await fetch("https://api.github.com/user", {
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "user-agent": "abuaaisha-ai",
    },
  });
  if (res.status === 401) throw new HttpError(401, "GitHub token is invalid or expired");
  if (!res.ok) throw new HttpError(502, `GitHub user check failed (${res.status})`);

  const { login } = (await res.json()) as { login: string };
  if (!env.allowedEditors.includes(login.toLowerCase())) {
    throw new HttpError(403, `${login} is not allowed to generate drafts`);
  }
  return login;
}
