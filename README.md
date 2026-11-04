# Abu Aaisha — blog & Islamic counseling

Static Astro site on Netlify, edited in Sveltia CMS, with AI-drafted posts that a person reviews before publishing. No server, no database: every post is a Markdown file in this repo.

## Run locally

```sh
npm install
npm run dev        # http://localhost:4321
npm run build      # thumbs → astro check → astro build → Pagefind search index
npm run preview    # serve dist/
```

Node 22.12+ (pinned in `netlify.toml` and `package.json`).

## Where things live

| Path | What |
| --- | --- |
| `src/content/posts/*.md` | Posts. File name = URL: `033s22.md` → `/posts/033s22/` |
| `src/content/pages/about.md` | About page text |
| `src/lib/post-schema.ts` | Post front matter schema — used by the build **and** the AI function |
| `src/styles/global.css` | Design tokens (from the Figma "Midnight Blue" page) |
| `src/components/`, `src/pages/` | Design and routes |
| `public/admin/` | Sveltia CMS (`/admin`) and its `config.yml` |
| `src/pages/admin/ai.astro` | AI drafting page (`/admin/ai`) |
| `netlify/functions/` | `ai-generate`, `ai-generate-background`, `ai-status` |
| `netlify/lib/agent.ts` | The only file that knows the AI provider (Gemini) |
| `public/images/posts/` | Post images (WebP, ≤1600px); thumbs are generated at build |

## Post slugs

3-digit sequence + category letter (`f` faith, `s` social, `w` worldview) + per-category number, e.g. `033s22`. Never rename or delete a published file — unpublish with `draft: true`, or add a redirect in `netlify.toml`.

## AI drafts

`/admin/ai` → `ai-generate` (checks the editor, daily limit, reserves the slug with `ai-jobs/<slug>.pending.json`) → `ai-generate-background` (Gemini → schema check → WebP → one commit with `draft: true, aiGenerated: true`) → the page polls `ai-status` and links to the draft in Sveltia. A person reads it, checks every source, then sets `draft: false`.

Environment variables are listed in `.env.example`.
