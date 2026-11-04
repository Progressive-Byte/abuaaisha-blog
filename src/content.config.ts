import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";
import { postSchema } from "./lib/post-schema";

const posts = defineCollection({
  // File name is the URL slug: src/content/posts/033s22.md → /posts/033s22/
  loader: glob({ pattern: "*.md", base: "./src/content/posts" }),
  schema: postSchema,
});

const pages = defineCollection({
  loader: glob({ pattern: "*.md", base: "./src/content/pages" }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
  }),
});

export const collections = { posts, pages };
