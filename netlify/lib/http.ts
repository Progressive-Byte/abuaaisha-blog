export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Turn thrown HttpErrors into JSON responses; log anything unexpected. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status);
    console.error(err);

    // GitHub/env setup problems are the most common reason generation fails before
    // a job is created. Surface the fix instead of a generic 500.
    const message = err instanceof Error ? err.message : "";
    if (/Missing environment variable/i.test(message)) {
      return json(
        { error: `সার্ভার সেটআপ অসম্পূর্ণ: ${message}। Netlify → Site configuration → Environment variables দেখুন।` },
        500,
      );
    }
    if (/GitHub .*→ 401/i.test(message)) {
      return json(
        { error: "GitHub টোকেন ভুল বা মেয়াদোত্তীর্ণ (GITHUB_BOT_TOKEN)। Netlify-এ নতুন টোকেন দিন।" },
        500,
      );
    }
    if (/GitHub .*→ 403/i.test(message)) {
      return json(
        { error: "GitHub টোকেনে এই রিপোতে লেখার অনুমতি নেই। GITHUB_BOT_TOKEN-এ Contents read/write দিন।" },
        500,
      );
    }
    return json({ error: "Internal error" }, 500);
  }
}
