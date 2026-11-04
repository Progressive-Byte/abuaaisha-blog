// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://abuaaisha.com",
  trailingSlash: "ignore",
  build: {
    format: "directory",
  },
  integrations: [
    sitemap({
      filter: (page) => !new URL(page).pathname.startsWith("/admin"),
    }),
  ],
});
