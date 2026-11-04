import { getCollection, type CollectionEntry } from "astro:content";
import type { Category } from "./post-schema";

export type Post = CollectionEntry<"posts">;

/** Published posts, newest first. Drafts never reach a listing or a page. */
export async function getPublishedPosts(): Promise<Post[]> {
  const posts = await getCollection("posts", ({ data }) => !data.draft);
  return posts.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf() || b.id.localeCompare(a.id));
}

export function inCategory(posts: Post[], category: Category): Post[] {
  return posts.filter((p) => p.data.categories.includes(category));
}

export function relatedPosts(posts: Post[], current: Post, count = 3): Post[] {
  const others = posts.filter((p) => p.id !== current.id);
  const same = others.filter((p) => p.data.categories.some((c) => current.data.categories.includes(c)));
  return [...same, ...others.filter((p) => !same.includes(p))].slice(0, count);
}

export function pageCount(total: number, perPage: number): number {
  return Math.max(1, Math.ceil(total / perPage));
}
