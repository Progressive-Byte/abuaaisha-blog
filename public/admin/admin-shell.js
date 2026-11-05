/* /admin — mobile shell.
 *
 * On phones the admin lands on the posts list (not the collection dashboard),
 * Sveltia's bottom icon bar is replaced by a labelled hamburger drawer with
 * parent/child navigation, and the posts list is rendered as comfortable cards.
 */
(() => {
  const MOBILE = "(max-width: 48rem)";
  const mq = window.matchMedia(MOBILE);
  const POSTS_HASH = "#/collections/posts";

  const ICONS = {
    folder: '<path d="M3 6a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>',
    posts: '<path d="M6 3h9l3 3v15H6z"/><path d="M9 9h6M9 13h6M9 17h4"/>',
    pages: '<path d="M6 3h9l3 3v15H6z"/>',
    search: '<circle cx="11" cy="11" r="6"/><path d="M16 16l4 4"/>',
    media: '<path d="M4 5h16v14H4z"/><path d="M4 15l5-5 4 4 3-3 4 4"/>',
    workflow: '<path d="M6 4v10a4 4 0 004 4h8M6 8h6a4 4 0 014 4v6M16 4l4 4-4 4"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9M10 5H5v14h14v-5"/>',
    chevron: '<path d="M7 9l5 5 5-5"/>',
  };

  const icon = (name) =>
    `<svg class="bm-drawer__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

  const CONTENT_CHILDREN = [
    { hash: POSTS_HASH, icon: "posts", label: "লেখা" },
    { hash: "#/collections/pages", icon: "pages", label: "পাতা" },
  ];

  const LINKS = [
    { hash: "#/search", icon: "search", label: "খুঁজুন" },
    { hash: "#/assets", icon: "media", label: "মিডিয়া" },
    { hash: "#/workflow", icon: "workflow", label: "ওয়ার্কফ্লো" },
  ];

  let drawer = null;
  let scrim = null;
  let hamburger = null;
  let timer = 0;

  function build() {
    if (drawer) return;
    scrim = document.createElement("div");
    scrim.className = "bm-drawer-scrim";
    scrim.addEventListener("click", close);

    drawer = document.createElement("aside");
    drawer.className = "bm-drawer";
    drawer.setAttribute("aria-label", "অ্যাডমিন মেনু");
    drawer.innerHTML = `
      <div class="bm-drawer__head">
        <span class="bm-drawer__mark">আ</span>
        <div class="bm-drawer__brand">
          <strong>আবু আয়েশা</strong>
          <small>অ্যাডমিন</small>
        </div>
        <button class="bm-drawer__close" type="button" data-bm-close aria-label="বন্ধ করুন">×</button>
      </div>
      <nav class="bm-drawer__nav">
        <div class="bm-drawer__group" data-open="true">
          <button class="bm-drawer__parent" type="button" aria-expanded="true">
            ${icon("folder")}
            <span>কনটেন্ট</span>
            <svg class="bm-drawer__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS.chevron}</svg>
          </button>
          <div class="bm-drawer__sub">
            ${CONTENT_CHILDREN.map(
              (link) =>
                `<a href="${link.hash}" data-nav="${link.hash}">${icon(link.icon)}<span>${link.label}</span></a>`,
            ).join("")}
          </div>
        </div>
        ${LINKS.map(
          (link) => `<a href="${link.hash}" data-nav="${link.hash}">${icon(link.icon)}<span>${link.label}</span></a>`,
        ).join("")}
      </nav>
      <div class="bm-drawer__foot">
        <a href="/" target="_blank" rel="noopener">${icon("external")}<span>সাইট দেখুন</span></a>
      </div>`;
    document.body.append(scrim, drawer);

    const group = drawer.querySelector(".bm-drawer__group");
    const parent = group.querySelector(".bm-drawer__parent");
    parent.addEventListener("click", () => {
      const open = group.dataset.open !== "true";
      group.dataset.open = String(open);
      parent.setAttribute("aria-expanded", String(open));
    });

    drawer.querySelector("[data-bm-close]").addEventListener("click", close);
    drawer.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => close()));
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && isOpen()) close();
    });
    updateActive();
  }

  const isOpen = () => document.documentElement.classList.contains("bm-drawer-open");

  function open() {
    build();
    document.documentElement.classList.add("bm-drawer-open");
    hamburger?.setAttribute("aria-expanded", "true");
    updateActive();
    drawer.querySelector("a")?.focus();
  }

  function close() {
    document.documentElement.classList.remove("bm-drawer-open");
    hamburger?.setAttribute("aria-expanded", "false");
  }

  function updateActive() {
    if (!drawer) return;
    const hash = location.hash || "#/";
    let childActive = false;
    drawer.querySelectorAll("[data-nav]").forEach((link) => {
      const target = link.getAttribute("data-nav");
      const active = target === "#/" ? hash === "#/" : hash.startsWith(target);
      link.classList.toggle("active", active);
      if (active) {
        link.setAttribute("aria-current", "page");
        childActive = true;
      } else {
        link.removeAttribute("aria-current");
      }
    });
    const group = drawer.querySelector(".bm-drawer__group");
    const parent = group?.querySelector(".bm-drawer__parent");
    if (group && parent && childActive) {
      group.dataset.open = "true";
      parent.setAttribute("aria-expanded", "true");
    }
  }

  function syncRouteClass() {
    const hash = location.hash;
    document.documentElement.classList.toggle("bm-list-route", /^#\/collections\/[^/]+$/.test(hash));
  }

  function ensureLanding() {
    if (!mq.matches) return;
    if (!location.hash || location.hash === "#" || location.hash === "#/") {
      location.replace(POSTS_HASH);
    }
  }

  function ensureHamburger() {
    if (!mq.matches) return;
    const toolbars = [...document.querySelectorAll(".sui .toolbar.primary")];
    const toolbar = toolbars.find((el) => !el.closest(".bottom-navigation") && el.getClientRects().length > 0);
    if (!toolbar) return;

    const existing = toolbar.querySelector(".bm-hamburger");
    if (existing) {
      hamburger = existing;
      return;
    }

    const inner = toolbar.querySelector(".inner") ?? toolbar;
    hamburger = document.createElement("button");
    hamburger.type = "button";
    hamburger.className = "bm-hamburger";
    hamburger.setAttribute("aria-label", "মেনু");
    hamburger.setAttribute("aria-expanded", "false");
    hamburger.innerHTML = "<span></span><span></span><span></span>";
    hamburger.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (isOpen()) close();
      else open();
    });
    inner.prepend(hamburger);
  }

  function schedule() {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      ensureLanding();
      syncRouteClass();
      ensureHamburger();
    }, 120);
  }

  build();
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  window.addEventListener("hashchange", () => {
    close();
    updateActive();
    syncRouteClass();
    ensureLanding();
    schedule();
  });
  mq.addEventListener("change", () => {
    if (!mq.matches) close();
    ensureLanding();
    syncRouteClass();
    schedule();
  });
  syncRouteClass();
  ensureLanding();
  schedule();
})();
