# Changelog

abuaaisha.com

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),  
and this project adheres to [Semantic Versioning](https://semver.org/).

---

## [Unreleased]
### Added
- AI drafting panel inside the Sveltia CMS post editor (custom `ai-start` field type).
### Changed
- Admin is one page again: `/admin` only. The separate `/admin/ai` page was removed and redirects to `/admin/`.
- Admin UI themed to the site (Hind Siliguri, Midnight Blue accent, dark mode) with a redesigned AI panel.
### Fixed
- Placeholder for bug/security fixes.
### Removed
- Placeholder for removed/unused code or assets.
---

## [2.0.0] - 2026-10-27
### Changed
- Rebuilt the site in Astro 7 (static output) with the Figma "Midnight Blue" redesign: home, blog, post, Islamic counseling, about and contact popup.
- Posts moved to `src/content/posts/` with a build-time schema; Hugo `short_summary`/`long_summary` became `summary`/`description`; every post got `draft: false`, English posts `lang: en`.
- Self-hosted Hind Siliguri font; Bangla + Hijri dates and reading time on every card; dark mode.
### Added
- Sveltia CMS at `/admin` (GitHub login via Netlify OAuth, editorial workflow).
- AI drafting at `/admin/ai` with Netlify functions (Gemini adapter); drafts are always `draft: true`.
- Cover photos for 12 posts and a branded placeholder for the rest; 640px thumbnails generated at build.
- Pagefind search, RSS (old `/index.xml` URLs kept), sitemap, Open Graph, Article JSON-LD.
- Contact form (Netlify Forms) and counseling page.
- Security headers (CSP, nosniff, referrer policy) and redirects for old Hugo URLs.
### Removed
- Hugo layouts, config and static assets.

## [1.3.1] - 2025-09-19  
### Added  
- Support for short and long summaries:  
  - Short summaries for homepage grid cards.  
  - Longer summaries for posts listing page.  

### Fixed  
- Post category filtering and sorting to ensure newest posts are displayed first.  

## [1.3.0] - 2025-09-18  
### Changed  
- Converted project to Hugo for improved SEO and content management.  

### Added  
- Local Hugo configuration.  
- Netlify deployment with Hugo. 

## [1.2.0] - 2025-09-15
### Added
- Post cards dynamically loaded using JSON file.
- Added `posts.json` and `posts.js` to dynamically load cards.

### Fixed
- Header position fixed.

### Removed
- Removed Kalpurush font.

---

## [1.1.0] - 2025-09-5
### Added
- Header and footer dynamically loaded across the site using JavaScript fetch.
- Added components `header.html` and `footer.html`
- Added custom domain to Netlify.

### Fixed
- Fixed broken "Read more" links in `index.html` and `posts.html`.
- Edited navbar CSS slightly for better look on mobile view.

---

## [1.0.0] - 2025-09-02
### Added
- Initial release of the static site.
- Pages: `index.html`, `posts.html`, `about.html`.
- Global stylesheet `style.css`.
- Deployment setup with GitHub → Netlify.
