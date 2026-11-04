// Main RSS feed; keeps Hugo's /index.xml URL so existing subscribers keep working.
import type { APIContext } from "astro";
import { postsFeed } from "../lib/feed";
import { getPublishedPosts } from "../lib/posts";

export async function GET(context: APIContext) {
  return postsFeed(context, await getPublishedPosts());
}
