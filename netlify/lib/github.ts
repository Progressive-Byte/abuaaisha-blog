// Minimal GitHub REST client for the bot token (contents read/write on this repo only).
import { env } from "./env";

const API = "https://api.github.com";

async function gh<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${env.githubBotToken}`,
      accept: "application/vnd.github+json",
      "content-type": "application/json",
      "user-agent": "abuaaisha-ai",
      "x-github-api-version": "2022-11-28",
      ...init.headers,
    },
  });
  if (!res.ok) {
    const err = new Error(`GitHub ${init.method ?? "GET"} ${path} → ${res.status}: ${await res.text()}`);
    (err as Error & { status: number }).status = res.status;
    throw err;
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

const repo = () => `/repos/${env.githubRepo}`;
const ref = () => encodeURIComponent(env.githubBranch);

/** File contents as UTF-8, or null if the file does not exist. */
export async function readFile(path: string): Promise<string | null> {
  try {
    const file = await gh<{ content: string; encoding: string }>(
      `${repo()}/contents/${encodeURI(path)}?ref=${ref()}`,
    );
    return Buffer.from(file.content, file.encoding as BufferEncoding).toString("utf8");
  } catch (err) {
    if ((err as { status?: number }).status === 404) return null;
    throw err;
  }
}

export async function fileExists(path: string): Promise<boolean> {
  return (await readFile(path)) !== null;
}

/** Names of the files in a directory (empty if it does not exist). */
export async function listDir(path: string): Promise<string[]> {
  try {
    const items = await gh<{ name: string; type: string }[]>(`${repo()}/contents/${encodeURI(path)}?ref=${ref()}`);
    return items.filter((i) => i.type === "file").map((i) => i.name);
  } catch (err) {
    if ((err as { status?: number }).status === 404) return [];
    throw err;
  }
}

/** Commit messages touching `path` since `since`. */
export async function commitMessagesSince(path: string, since: Date): Promise<string[]> {
  const commits = await gh<{ commit: { message: string } }[]>(
    `${repo()}/commits?sha=${ref()}&path=${encodeURIComponent(path)}&since=${since.toISOString()}&per_page=100`,
  );
  return commits.map((c) => c.commit.message);
}

export type FileChange =
  | { path: string; content: string | Buffer } // add or replace
  | { path: string; delete: true };

/**
 * Write several files in ONE commit on the branch (Git Data API).
 * Retries if someone else pushed in between.
 */
export async function commitFiles(message: string, changes: FileChange[]): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    const head = await gh<{ object: { sha: string } }>(`${repo()}/git/ref/heads/${ref()}`);
    const parent = await gh<{ tree: { sha: string } }>(`${repo()}/git/commits/${head.object.sha}`);

    const tree = await Promise.all(
      changes.map(async (change) => {
        if ("delete" in change) return { path: change.path, mode: "100644", type: "blob", sha: null };
        const data = typeof change.content === "string" ? Buffer.from(change.content, "utf8") : change.content;
        const blob = await gh<{ sha: string }>(`${repo()}/git/blobs`, {
          method: "POST",
          body: JSON.stringify({ content: data.toString("base64"), encoding: "base64" }),
        });
        return { path: change.path, mode: "100644", type: "blob", sha: blob.sha };
      }),
    );

    const newTree = await gh<{ sha: string }>(`${repo()}/git/trees`, {
      method: "POST",
      body: JSON.stringify({ base_tree: parent.tree.sha, tree }),
    });
    const commit = await gh<{ sha: string }>(`${repo()}/git/commits`, {
      method: "POST",
      body: JSON.stringify({ message, tree: newTree.sha, parents: [head.object.sha] }),
    });

    try {
      await gh(`${repo()}/git/refs/heads/${ref()}`, {
        method: "PATCH",
        body: JSON.stringify({ sha: commit.sha, force: false }),
      });
      return commit.sha;
    } catch (err) {
      // 422 = branch moved on (not a fast-forward); rebuild on the new head.
      if ((err as { status?: number }).status !== 422 || attempt >= 3) throw err;
    }
  }
}
