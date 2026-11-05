/* Sveltia CMS extension: an "AI start" field type that renders the drafting panel
 * inside the post editor, so /admin is the only admin page.
 *
 * The panel calls the existing Netlify functions with the GitHub token Sveltia
 * already stored at login. The generated entry is committed by the function; on
 * success the panel opens it. The field itself is stripped on save (preSave), so
 * nothing extra ends up in the post front matter.
 */
(() => {
  const { CMS, html } = window;
  const { useState } = CMS.React;

  const CATEGORIES = [
    { value: "social", label: "সমাজ" },
    { value: "faith", label: "ঈমান" },
    { value: "worldview", label: "বিশ্বদৃষ্টি" },
  ];

  const LENGTHS = [
    { value: "short", label: "ছোট", hint: "≈ ৭০০ শব্দ" },
    { value: "medium", label: "মাঝারি", hint: "≈ ১২০০ শব্দ" },
    { value: "long", label: "বড়", hint: "≈ ২০০০ শব্দ" },
  ];

  const SPARKLE = html`<svg class="ai-start__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 2.75l2.02 5.4 5.4 2.02-5.4 2.02L12 17.6l-2.02-5.41-5.4-2.02 5.4-2.02L12 2.75z" fill="currentColor" />
    <path d="M18.5 15.2l.86 2.3 2.3.86-2.3.86-.86 2.3-.86-2.3-2.3-.86 2.3-.86.86-2.3z" fill="currentColor" opacity=".65" />
  </svg>`;

  /** The GitHub token Sveltia stored after OAuth login (`sveltia-cms.user`). */
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

  async function api(path, init = {}) {
    const token = getToken();
    if (!token) {
      throw new Error("লগইন পাওয়া যায়নি। পাতাটি রিফ্রেশ করে আবার লগইন করুন।");
    }
    const res = await fetch(`/.netlify/functions/${path}`, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
    });
    const isJson = (res.headers.get("content-type") ?? "").includes("application/json");
    const body = isJson ? await res.json().catch(() => ({})) : {};
    if (res.status === 404 && !isJson) {
      throw new Error(
        "AI ফাংশন এখানে চলছে না। লোকালি `netlify dev` দিয়ে চালান, অথবা Netlify-তে চেষ্টা করুন।",
      );
    }
    if (res.status === 401) {
      throw new Error("সেশন মেয়াদোত্তীর্ণ হয়েছে—পাতাটি রিফ্রেশ করে আবার লগইন করুন।");
    }
    if (!res.ok && res.status !== 404) {
      throw new Error(body.error ?? `ত্রুটি (${res.status})`);
    }
    return body;
  }

  function AiStart({ entry }) {
    const firstCategory = (() => {
      try {
        const categories = entry?.getIn?.(["data", "categories"]);
        const list = categories?.toJS ? categories.toJS() : categories;
        return Array.isArray(list) && list.length > 0 ? list[0] : "social";
      } catch {
        return "social";
      }
    })();

    const [topic, setTopic] = useState("");
    const [category, setCategory] = useState(firstCategory);
    const [length, setLength] = useState("medium");
    const [notes, setNotes] = useState("");
    const [phase, setPhase] = useState("idle"); // idle | running | ready | error
    const [status, setStatus] = useState("");
    const [error, setError] = useState("");
    const [slug, setSlug] = useState("");
    const [editUrl, setEditUrl] = useState("");

    async function poll(current) {
      for (;;) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        try {
          const result = await api(`ai-status?slug=${encodeURIComponent(current)}`);
          if (result.status === "running" || result.status === "unknown") {
            setStatus("AI লিখছে ও কভার তৈরি করছে… সাধারণত ১–৩ মিনিট লাগে।");
            continue;
          }
          if (result.status === "ready") {
            setSlug(result.slug ?? current);
            setEditUrl(result.editUrl ?? `/admin/#/collections/posts/entries/${result.slug ?? current}`);
            setStatus("");
            setPhase("ready");
            return;
          }
          setPhase("error");
          setError(result.error ?? "খসড়া তৈরি করা যায়নি। আবার চেষ্টা করুন।");
          return;
        } catch {
          setStatus("অবস্থা জানা যাচ্ছে না—আবার চেষ্টা করছি…");
        }
      }
    }

    async function generate(event) {
      event.preventDefault();
      if (phase === "running") return;
      const trimmed = topic.trim();
      if (trimmed.length < 5) {
        setError("বিষয়টি অন্তত ৫ অক্ষরের হতে হবে।");
        return;
      }
      setError("");
      setPhase("running");
      setStatus("খসড়ার অনুরোধ পাঠানো হচ্ছে…");
      try {
        const result = await api("ai-generate", {
          method: "POST",
          body: JSON.stringify({
            topic: trimmed,
            category,
            length,
            notes: notes.trim() || undefined,
          }),
        });
        if (!result.slug) throw new Error("কাজ শুরু করা যায়নি।");
        setSlug(result.slug);
        setStatus("AI লিখছে ও কভার তৈরি করছে… সাধারণত ১–৩ মিনিট লাগে।");
        await poll(result.slug);
      } catch (err) {
        setPhase("error");
        setError(err instanceof Error ? err.message : String(err));
      }
    }

    function openDraft() {
      const target = editUrl || `/admin/#/collections/posts/entries/${slug}`;
      // Full reload so Sveltia fetches the freshly committed file from GitHub.
      window.location.hash = target.includes("#") ? `#${target.split("#")[1]}` : target;
      window.location.reload();
    }

    function reset() {
      setPhase("idle");
      setError("");
      setStatus("");
      setSlug("");
      setEditUrl("");
    }

    const running = phase === "running";

    return html`<div class="ai-start">
      <div class="ai-start__head">
        <span class="ai-start__badge">${SPARKLE}</span>
        <div class="ai-start__intro">
          <strong>AI দিয়ে নতুন খসড়া</strong>
          <span>বিষয় দিন—AI শিরোনাম, সারাংশ, লেখা, কভার ছবি ও তথ্যসূত্র তৈরি করে খসড়া হিসেবে সংরক্ষণ করবে। প্রকাশের আগে পুরো লেখা ও প্রতিটি সূত্র যাচাই করুন।</span>
        </div>
      </div>

      ${phase === "ready"
        ? html`<div class="ai-start__body">
            <div class="ai-start__done">
              <span class="ai-start__done-icon" aria-hidden="true">✓</span>
              <div>
                <strong>খসড়া প্রস্তুত: ${slug}</strong>
                <p>এটি <code>draft: true</code> অবস্থায় আছে। এখনই খুলে পড়ুন, তথ্যসূত্র যাচাই করুন, তারপর প্রকাশ করুন।</p>
              </div>
            </div>
            <div class="ai-start__actions">
              <button type="button" class="ai-start__button ai-start__button--primary" onClick=${openDraft}>
                খসড়াটি খুলুন
              </button>
              <button type="button" class="ai-start__button" onClick=${reset}>আরেকটি তৈরি করুন</button>
            </div>
          </div>`
        : html`<form class="ai-start__body" onSubmit=${generate}>
            <label class="ai-start__field">
              <span class="ai-start__label">বিষয়</span>
              <textarea
                class="ai-start__input"
                rows="3"
                maxlength="500"
                placeholder="যেমন: কিশোর সন্তানের সঙ্গে মোবাইল ব্যবহার নিয়ে কথা শুরু করবেন কীভাবে"
                value=${topic}
                onChange=${(event) => setTopic(event.target.value)}
                disabled=${running}
              ></textarea>
            </label>

            <div class="ai-start__grid">
              <label class="ai-start__field">
                <span class="ai-start__label">বিভাগ</span>
                <select
                  class="ai-start__input"
                  value=${category}
                  onChange=${(event) => setCategory(event.target.value)}
                  disabled=${running}
                >
                  ${CATEGORIES.map(
                    (item) => html`<option key=${item.value} value=${item.value}>${item.label}</option>`,
                  )}
                </select>
              </label>

              <fieldset class="ai-start__field ai-start__fieldset">
                <legend class="ai-start__label">দৈর্ঘ্য</legend>
                <div class="ai-start__chips">
                  ${LENGTHS.map(
                    (item) => html`<label key=${item.value} class="ai-start__chip" data-active=${String(length === item.value)}>
                      <input
                        type="radio"
                        name="ai-start-length"
                        value=${item.value}
                        checked=${length === item.value}
                        onChange=${() => setLength(item.value)}
                        disabled=${running}
                      />
                      <span>${item.label}</span>
                      <small>${item.hint}</small>
                    </label>`,
                  )}
                </div>
              </fieldset>
            </div>

            <label class="ai-start__field">
              <span class="ai-start__label">বাড়তি নির্দেশনা <small>ঐচ্ছিক</small></span>
              <textarea
                class="ai-start__input"
                rows="2"
                maxlength="2000"
                placeholder="যেমন: একটি ব্যক্তিগত ঘটনা দিয়ে শুরু করুন; শেষে পরিবারের জন্য ৫টি করণীয় দিন"
                value=${notes}
                onChange=${(event) => setNotes(event.target.value)}
                disabled=${running}
              ></textarea>
            </label>

            ${error ? html`<p class="ai-start__error" role="alert">${error}</p>` : ""}
            ${running
              ? html`<p class="ai-start__running" aria-live="polite">
                  <span class="ai-start__spinner" aria-hidden="true"></span>
                  <span>${status || "খসড়া তৈরি হচ্ছে…"}</span>
                </p>`
              : ""}

            <div class="ai-start__actions">
              <button type="submit" class="ai-start__button ai-start__button--primary" disabled=${running}>
                ${SPARKLE} ${running ? "তৈরি হচ্ছে…" : "AI দিয়ে খসড়া তৈরি করুন"}
              </button>
              <small class="ai-start__note">
                এটি একটি আলাদা খসড়া ফাইল তৈরি করবে—এই ফাঁকা ফর্মটি সংরক্ষণ করা হবে না।
                ${phase === "error" ? "আবার চেষ্টা করতে পারেন।" : ""}
              </small>
            </div>
          </form>`}
    </div>`;
  }

  function AiStartField(props) {
    const newRecord = props.entry?.get?.("newRecord");
    const onNewRoute =
      typeof window !== "undefined" && /\/collections\/[^/]+\/new(?:$|[?#/])/.test(window.location.hash);

    // Existing entries get a one-line collapsible section instead of a full card.
    if (newRecord !== true && !onNewRoute) {
      return html`<details class="ai-start ai-start--collapsed">
        <summary>AI দিয়ে নতুন খসড়া তৈরি করুন</summary>
        <${AiStart} entry=${props.entry} />
      </details>`;
    }

    return html`<${AiStart} entry=${props.entry} />`;
  }

  CMS.registerFieldType("ai-start", AiStartField);

  // The panel never writes a value, but guard against it ever landing in the
  // front matter if a future change does call onChange.
  CMS.registerEventListener({
    name: "preSave",
    handler: ({ entry }) => {
      const data = entry.get("data");
      return data?.delete ? data.delete("aiDraft") : data;
    },
  });
})();
