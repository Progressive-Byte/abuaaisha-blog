# Abu Aaisha — blog & Islamic counseling

Static Astro site on Netlify, edited in Sveltia CMS, with AI-drafted posts that a person reviews before publishing. No server, no database: every post is a Markdown file in this repo.

## Run locally

```sh
npm install
npm run dev        # http://localhost:4321
npm run build      # thumbs → astro check → astro build → Pagefind search index
npm run preview    # serve dist/
```

`netlify.toml` and `.nvmrc` select Node 24 for production builds. Astro is held at
`~7.3.8` because Netlify preview builds currently use Node 22.12, which does not
support the Astro 7.4 line. The `engines` field allows Node 22.12+ for preview
builds. Upgrade Astro after the preview build environment moves to a newer Node
version.

## Where things live

| Path | What |
| --- | --- |
| `src/content/posts/*.md` | Posts. File name = URL: `033s22.md` → `/posts/033s22/` |
| `src/content/pages/about.md` | About page text |
| `src/lib/post-schema.ts` | Post front matter schema — used by the build **and** the AI function |
| `src/styles/global.css` | Design tokens (from the Figma "Midnight Blue" page) |
| `src/components/`, `src/pages/` | Design and routes |
| `public/admin/` | Sveltia CMS (`/admin`), `config.yml`, `admin.css`, `ai-panel.js` |
| `netlify/functions/` | `ai-generate`, `ai-generate-background`, `ai-status` |
| `netlify/lib/agent.ts` | The only file that knows the AI provider (Gemini) |
| `public/images/posts/` | Post images (WebP, ≤1600px); thumbs are generated at build |

## Post slugs

3-digit sequence + category letter (`f` faith, `s` social, `w` worldview) + per-category number, e.g. `033s22`. Never rename or delete a published file — unpublish with `draft: true`, or add a redirect in `netlify.toml`.

## AI drafts

`/admin` → open a post (or **Add new post**) → the **AI সহায়ক** panel at the top of the editor. It calls `ai-generate` (checks the editor, daily limit, reserves the slug with `ai-jobs/<slug>.pending.json`) → `ai-generate-background` (Gemini → schema check → WebP → one commit with `draft: true, aiGenerated: true`) → the panel polls `ai-status` and opens the new draft. A person reads it, checks every source, then sets `draft: false`.

The panel is a Sveltia custom field type (`public/admin/ai-panel.js`); a `preSave` hook strips its `aiDraft` value so it never reaches the front matter. `/admin/ai` redirects to `/admin/`.

Setup on Netlify (Site configuration → Environment variables): `AI_AGENT_KEY`, `GITHUB_BOT_TOKEN` (this repo, Contents read/write) and `ALLOWED_EDITORS` (comma-separated GitHub logins). The repository owner from `GITHUB_REPO` is always allowed. Redeploy after changing any variable. The cover image is best-effort: if the image model fails (for example, no quota), the article is still saved without a cover. If text generation fails with 429, the AI key has no quota left — enable billing or use another key/model.

Environment variables are listed in `.env.example`.
