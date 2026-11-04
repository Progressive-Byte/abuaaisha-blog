// Hugo also published a feed at /posts/index.xml.
import type { APIContext } from "astro";
import { postsFeed } from "../../lib/feed";
import { getPublishedPosts } from "../../lib/posts";

export async function GET(context: APIContext) {
  return postsFeed(context, await getPublishedPosts());
}
