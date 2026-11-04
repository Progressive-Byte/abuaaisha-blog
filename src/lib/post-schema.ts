// Single source of truth for a post's front matter. Used by the Astro content
// collection at build time and by the AI function before it commits a draft.
import { z } from "zod";

export const CATEGORIES = ["faith", "social", "worldview"] as const;
export type Category = (typeof CATEGORIES)[number];

export const postSchema = z
  .object({
    title: z.string().trim().min(1),
    date: z.coerce.date(),
    categories: z.array(z.enum(CATEGORIES)).min(1),
    summary: z.string().trim().min(1),
    description: z.string().trim().optional(),
    image: z
      .string()
      .regex(/^(\/images\/|https:\/\/)/, "image must be a /images/… path or an https URL")
      .optional(),
    imageAlt: z.string().trim().optional(),
    draft: z.boolean(),
    aiGenerated: z.boolean().optional(),
    sources: z
      .array(z.object({ title: z.string().trim().min(1), url: z.url({ protocol: /^https?$/ }) }))
      .optional(),
    lang: z.enum(["bn", "en"]).default("bn"),
  })
  .refine((post) => !post.image || !!post.imageAlt, {
    message: "imageAlt is required when image is set",
    path: ["imageAlt"],
  });

export type PostData = z.infer<typeof postSchema>;
