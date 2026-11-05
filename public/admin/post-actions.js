/* /admin — post row actions.
 *
 * Sveltia's table view has no per-row actions, so this script augments the
 * rendered table: it reads the hidden `slug` column and appends View / Edit /
 * Publish-Unpublish / Delete controls to each row. Writes go straight to GitHub
 * with the token Sveltia already stored (Contents read/write).
 */
(() => {
  const REPO = "Progressive-Byte/abuaaisha-blog";
  const BRANCH = "main";
  const POSTS_DIR = "src/content/posts";
  const SLUG_LABEL = "__bm_slug";

  let dialog = null;
  let busy = false;
  let timer = 0;
  

  /* ---------- GitHub ---------- */

  function getToken() {
    try {
      const raw = localStorage.getItem("sveltia-cms.user");
      if (!raw) return null;
      const user = JSON.parse(raw);
      return typeof user === "string" ? user : (user?.token ?? null);
    } catch {
      return null;
    }
  }

  async function gh(path, init = {}) {
    const token = getToken();
    if (!token) throw new Error("GitHub লগইন পাওয়া যায়নি—আবার লগইন করুন।");
    const res = await fetch(`https://api.github.com/repos/${REPO}${path}`, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
        "content-type": "application/json",
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`GitHub ${res.status}: ${body.slice(0, 200)}`);
    }
    return res.status === 204 ? null : res.json();
  }

  function encodeBase64(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }

  function decodeBase64(value) {
    const binary = atob(String(value).replace(/\s/g, ""));
    return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
  }

  async function getPost(slug) {
    const data = await gh(`/contents/${POSTS_DIR}/${slug}.md?ref=${BRANCH}`);
    return { sha: data.sha, text: decodeBase64(data.content) };
  }

  async function setDraft(slug, draft) {
    const { sha, text } = await getPost(slug);
    const pattern = /^draft:\s*(true|false)\s*$/m;
    if (!pattern.test(text)) throw new Error("এই ফাইলে draft ফিল্ড পাওয়া যায়নি।");
    const next = text.replace(pattern, `draft: ${draft}`);
    await gh(`/contents/${POSTS_DIR}/${slug}.md`, {
      method: "PUT",
      body: JSON.stringify({
        message: `cms: ${draft ? "unpublish" : "publish"} ${slug}`,
        content: encodeBase64(next),
        sha,
        branch: BRANCH,
      }),
    });
  }

  async function deletePost(slug) {
    const { sha } = await getPost(slug);
    await gh(`/contents/${POSTS_DIR}/${slug}.md`, {
      method: "DELETE",
      body: JSON.stringify({ message: `cms: delete ${slug}`, sha, branch: BRANCH }),
    });
  }

  /* ---------- Preview modal ---------- */

  function previewDialog() {
    if (dialog) return dialog;
    dialog = document.createElement("dialog");
    dialog.className = "bm-preview";
    dialog.innerHTML = `
      <div class="bm-preview__box">
        <header class="bm-preview__head">
          <strong data-bm-title></strong>
          <a class="bm-preview__open" data-bm-open target="_blank" rel="noopener">নতুন ট্যাবে খুলুন</a>
          <button class="bm-preview__close" type="button" data-bm-close aria-label="বন্ধ করুন">×</button>
        </header>
        <div class="bm-preview__body">
          <iframe data-bm-frame title="Post preview" loading="lazy"></iframe>
          <p class="bm-preview__note" data-bm-note hidden></p>
        </div>
      </div>`;
    document.body.append(dialog);
    dialog.querySelector("[data-bm-close]").addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
    return dialog;
  }

  function showPreview(slug, title, isDraft) {
    const modal = previewDialog();
    const url = `${location.origin}/posts/${encodeURIComponent(slug)}/`;
    modal.querySelector("[data-bm-title]").textContent = title || slug;
    modal.querySelector("[data-bm-open]").href = url;
    const frame = modal.querySelector("[data-bm-frame]");
    const note = modal.querySelector("[data-bm-note]");
    if (isDraft) {
      frame.removeAttribute("src");
      frame.hidden = true;
      note.hidden = false;
      note.textContent = "এই লেখাটি এখনো প্রকাশিত হয়নি। প্রকাশ করলে প্রিভিউ দেখা যাবে।";
    } else {
      frame.hidden = false;
      frame.src = url;
      note.hidden = true;
    }
    modal.showModal();
  }

  /* ---------- Actions ---------- */

  async function togglePublished(slug, isDraft, title) {
    if (busy) return;
    if (!isDraft && !confirm(`“${title}” প্রকাশ করা বন্ধ করে খসড়া করবেন?`)) return;
    busy = true;
    try {
      await setDraft(slug, !isDraft);
      location.reload();
    } catch (error) {
      alert(error instanceof Error ? error.message : String(error));
    } finally {
      busy = false;
    }
  }

  async function removePost(slug, title) {
    if (busy) return;
    if (!confirm(`“${title}” স্থায়ীভাবে মুছে ফেলবেন? এটি ফিরিয়ে আনা যাবে না।`)) return;
    busy = true;
    try {
      await deletePost(slug);
      location.reload();
    } catch (error) {
      alert(error instanceof Error ? error.message : String(error));
    } finally {
      busy = false;
    }
  }

  function actionButton(label, className, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `bm-act ${className}`;
    button.textContent = label;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      onClick();
    });
    return button;
  }

  /* ---------- Table augmentation ---------- */

  function enhance() {
    if (!location.hash.startsWith("#/collections/posts")) return;

    const headRow = document.querySelector(".grid-head .grid-row");
    if (headRow) {
      for (const cell of headRow.querySelectorAll(".grid-col-header")) {
        if (cell.textContent.trim() === SLUG_LABEL) cell.style.display = "none";
      }
      if (!headRow.querySelector(".bm-actions-head")) {
        const head = document.createElement("div");
        head.className = "sui grid-col-header column bm-actions-head";
        head.setAttribute("role", "columnheader");
        head.textContent = "অ্যাকশন";
        headRow.append(head);
      }
    }

    for (const row of document.querySelectorAll(".grid-row[aria-label]")) {
      if (row.querySelector(".bm-actions-cell")) continue;
      const slugCell = row.querySelector('.grid-cell[data-key="slug"], .grid-cell[data-key="__bm_slug"]');
      const slug = slugCell?.textContent.trim();
      if (!slug) continue;

      const title = row.getAttribute("aria-label")?.trim() || slug;
      const cells = [...row.querySelectorAll(".grid-cell")];
      const status = cells
        .map((cell) => cell.textContent.replace(/\s+/g, " ").trim())
        .find((text) => text === "খসড়া" || text === "প্রকাশিত");
      const isDraft = status !== "প্রকাশিত";

      const cell = document.createElement("div");
      cell.className = "sui grid-cell column bm-actions-cell";
      cell.setAttribute("role", "gridcell");
      cell.addEventListener("click", (event) => event.stopPropagation());

      const wrap = document.createElement("div");
      wrap.className = "bm-actions";
      wrap.append(
        actionButton("দেখুন", "bm-act--view", () => showPreview(slug, title, isDraft)),
        actionButton("এডিট", "bm-act--edit", () => {
          location.hash = `#/collections/posts/entries/${slug}`;
        }),
        actionButton(isDraft ? "সক্রিয়" : "নিষ্ক্রিয়", isDraft ? "bm-act--publish" : "bm-act--unpublish", () =>
          togglePublished(slug, isDraft, title),
        ),
        actionButton("মুছুন", "bm-act--delete", () => removePost(slug, title)),
      );
      cell.append(wrap);
      row.append(cell);
    }
  }

  function schedule() {
    window.clearTimeout(timer);
    timer = window.setTimeout(enhance, 120);
  }

  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  window.addEventListener("hashchange", schedule);
  schedule();
})();
