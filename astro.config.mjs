// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://abuaaisha.com",
  trailingSlash: "ignore",
  // Keep the admin preview clean; the dev toolbar is not part of the CMS UI.
  devToolbar: { enabled: false },
  build: {
    format: "directory",
  },
  integrations: [
    sitemap({
      filter: (page) => !new URL(page).pathname.startsWith("/admin"),
    }),
  ],
});
