import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import type { Post } from "./posts";
import { SITE } from "./site";

export function postsFeed(context: APIContext, posts: Post[], title: string = SITE.nameEn) {
  return rss({
    title,
    description: SITE.description,
    site: context.site!,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description ?? post.data.summary,
      pubDate: post.data.date,
      link: `/posts/${post.id}/`,
      categories: post.data.categories,
    })),
    customData: "<language>bn</language>",
  });
}
