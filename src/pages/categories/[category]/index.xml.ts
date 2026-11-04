// Per-category feeds at Hugo's old URLs, e.g. /categories/faith/index.xml.
import type { APIContext } from "astro";
import { postsFeed } from "../../../lib/feed";
import { CATEGORIES, type Category } from "../../../lib/post-schema";
import { getPublishedPosts, inCategory } from "../../../lib/posts";
import { CATEGORY_META, SITE } from "../../../lib/site";

export function getStaticPaths() {
  return CATEGORIES.map((category) => ({ params: { category } }));
}

export async function GET(context: APIContext) {
  const category = context.params.category as Category;
  const posts = inCategory(await getPublishedPosts(), category);
  return postsFeed(context, posts, `${SITE.nameEn} — ${CATEGORY_META[category].label}`);
}
