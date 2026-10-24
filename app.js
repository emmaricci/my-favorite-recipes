/* ==========================================================
   my Recipes — app logic (plain JavaScript, no build step)

   Views (chosen by the URL hash):
     #/                 home: list with search and filters
     #/recipe/<id>      one recipe
     #/add              new-recipe form        (editor.js)
     #/edit/<id>        edit-recipe form       (editor.js)
     #/setup            connect this device to GitHub so it can save (editor.js)

   - Recipes load from data/recipes.json. On a device that has been set up
     for editing, they load straight from GitHub instead, so new edits show
     up right away instead of after the ~1 minute site rebuild.
   - The profile switcher (Emma / Chris / Both) is remembered per device.
   - Home filters live in sessionStorage so Back returns to the same list.
   - Ingredient checkboxes are saved per recipe in localStorage.
   ========================================================== */

// Category ids used in recipes.json, in the order the chips appear
const CATEGORIES = [
  ["breakfast", "Breakfast"],
  ["snack", "Snack"],
  ["appsides", "Appetizers & Sides"],
  ["entrees", "Entrées"],
  ["dessert", "Dessert"],
  ["drinks", "Drinks"],
];
const CAT_LABEL = Object.fromEntries(CATEGORIES);

// People a recipe can belong to. A recipe's "owners" holds one or both ids.
const PEOPLE = [
  ["emma", "Emma"],
  ["chris", "Chris"],
];
const PERSON_LABEL = Object.fromEntries(PEOPLE);

// Inline SVG icons (stroke style, colored by CSS currentColor)
const ICON = {
  search: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B3CFE5" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  leaf: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 19c0-8 5-13 15-14-1 10-6 15-14 15"/><path d="M5 19l7-7"/></svg>',
  back: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
  clock: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
  bowl: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 11h16"/><path d="M5 11c0 4.5 3 8 7 8s7-3.5 7-8"/><path d="M12 4v3"/></svg>',
  star: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/></svg>',
  bookmark: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M6 4h12v16l-6-4-6 4z"/></svg>',
  reset: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4h4"/></svg>',
  check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0A1931" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  user: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c1.2-3.6 3.8-5.5 7-5.5s5.8 1.9 7 5.5"/></svg>',
  users: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="9" r="3"/><path d="M3.5 19c.9-3 3-4.5 5.5-4.5s4.6 1.5 5.5 4.5"/><circle cx="16.5" cy="8" r="2.5"/><path d="M16.5 13.5c2 0 3.6 1.2 4.3 3.5"/></svg>',
  plus: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  edit: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg>',
  caret: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
};

const app = document.getElementById("app");
let RECIPES = [];

/* ---------- Storage helpers (wrapped: storage can be blocked in private mode) ---------- */
function readStore(store, key, fallback) {
  try {
    const v = store.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}
function writeStore(store, key, value) {
  try {
    store.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore: the page still works, it just won't remember */
  }
}

/* ---------- Tiny DOM helper: el("div", {class: "x"}, child, "text") ---------- */
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "html") node.innerHTML = v;                 // only used for our own icon strings
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}
function icon(name) {
  const span = document.createElement("span");
  span.innerHTML = ICON[name];
  return span.firstChild;
}

/* ---------- Recipe helpers ---------- */
// Older recipes without an owners field count as Emma's
function ownersOf(r) {
  return r.owners && r.owners.length ? r.owners : ["emma"];
}
function isShared(r) {
  return ownersOf(r).length > 1;
}
function ownerText(r) {
  return ownersOf(r).map((o) => PERSON_LABEL[o] || o).join(" & ");
}

// Lowercased text used for searching: title, categories and every ingredient
function searchText(r) {
  const ings = (r.ingredients || []).flatMap((g) => [g.group, ...g.items]);
  const cats = (r.categories || []).map((c) => CAT_LABEL[c] || c);
  return [r.title, ...cats, ...ings].join(" ").toLowerCase();
}

// Replace the in-memory recipe list (also used by editor.js after saving)
function setRecipes(data) {
  RECIPES = data
    .map((r) => ({ ...r, _search: searchText(r) }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

// Plain numbers like "4", "3-4" or "2.5" become "Serves 4"; descriptive
// servings like "9 little cups" stay exactly as written
function servesText(s) {
  if (!s) return "";
  return /^[\d.\s\-–]+$/.test(s) ? `Serves ${s}` : s;
}

// True when this device has been set up to save recipes (token stored by editor.js)
function canEdit() {
  return !!readStore(localStorage, "gh-token", "");
}

/* ---------- Profile (Emma / Chris / Both), remembered per device ---------- */
let profile = readStore(localStorage, "profile", "both");
function setProfile(p) {
  profile = p;
  writeStore(localStorage, "profile", p);
  renderHome();
}
// Recipes visible for the current profile: a person sees their own plus shared ones
function visibleRecipes() {
  if (profile === "both") return RECIPES;
  return RECIPES.filter((r) => ownersOf(r).includes(profile));
}

/* ---------- Home filter state ---------- */
const DEFAULT_FILTERS = { status: "favorite", cat: "all", veg: false, q: "" };
let filters = { ...DEFAULT_FILTERS, ...readStore(sessionStorage, "filters", {}) };
function setFilters(patch) {
  filters = { ...filters, ...patch };
  writeStore(sessionStorage, "filters", filters);
  renderList();          // re-render only the list area, so the search box keeps focus
}

function filtered() {
  const q = filters.q.trim().toLowerCase();
  return visibleRecipes().filter(
    (r) =>
      r.status === filters.status &&
      (filters.cat === "all" || r.categories.includes(filters.cat)) &&
      (!filters.veg || r.vegetarian) &&
      (!q || r._search.includes(q))
  );
}

/* ---------- Profile switcher (button + small menu) ---------- */
function profileSwitcher() {
  const label = profile === "both" ? "Both" : PERSON_LABEL[profile];
  const menu = el("div", { class: "profile-menu", role: "menu", hidden: true });
  const btn = el("button", {
    type: "button", class: "profile-btn", "aria-haspopup": "menu", "aria-expanded": "false",
    "aria-label": `Showing recipes for ${label}. Change`,
  }, icon("user"), el("span", {}, label), icon("caret"));

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
    btn.setAttribute("aria-expanded", String(!menu.hidden));
  });

  const options = [...PEOPLE, ["both", "Both"]];
  options.forEach(([id, name]) => {
    menu.append(el("button", {
      type: "button", role: "menuitemradio", "aria-checked": String(profile === id),
      onclick: () => setProfile(id),
    }, name, profile === id ? icon("check") : null));
  });
  return el("div", { class: "profile" }, btn, menu);
}

// Tapping anywhere outside an open profile menu closes it
document.addEventListener("click", () => {
  document.querySelectorAll(".profile-menu").forEach((m) => { m.hidden = true; });
  document.querySelectorAll(".profile-btn").forEach((b) => b.setAttribute("aria-expanded", "false"));
});

/* ---------- Home view ---------- */
function renderHome() {
  document.title = "my Recipes";
  app.replaceChildren();

  const wrap = el("div", { class: "wrap" });

  // Header: site name on the left, profile switcher on the right
  wrap.append(
    el("header", { class: "site-head" },
      el("a", { class: "logo", href: "#/" },
        el("span", { class: "my" }, "my"),
        el("span", { class: "name" }, "RECIPES")
      ),
      profileSwitcher()
    )
  );

  // Featured favorite (shown on desktop only, via CSS)
  const withPhotos = visibleRecipes().filter((r) => r.status === "favorite" && r.image);
  if (withPhotos.length) {
    const f = withPhotos[Math.floor(Math.random() * withPhotos.length)];
    wrap.append(
      el("section", { class: "feature", "aria-label": "Featured recipe" },
        el("div", { class: "copy" },
          el("span", { class: "script" }, "tried, tested & loved…"),
          el("h2", {}, f.title),
          el("span", { class: "info" }, [CAT_LABEL[f.categories[0]], f.time, servesText(f.servings)].filter(Boolean).join(" · ")),
          el("a", { class: "cta", href: `#/recipe/${f.id}` }, "VIEW RECIPE")
        ),
        el("div", { class: "pic" }, el("img", { src: f.image, alt: "" }))
      )
    );
  }

  // Toolbar: search, status toggle, chips
  const toolbar = el("div", { class: "toolbar" });
  const input = el("input", {
    type: "search", id: "q", placeholder: "Search recipes or ingredients",
    value: filters.q, autocomplete: "off",
    oninput: (e) => setFilters({ q: e.target.value }),
  });
  toolbar.append(
    el("label", { class: "search", for: "q" },
      icon("search"),
      el("span", { class: "sr-only" }, "Search recipes and ingredients"),
      input
    ),
    el("div", { class: "segmented", id: "segmented", role: "group", "aria-label": "Show" }),
    el("div", { class: "chips", id: "chips", role: "group", "aria-label": "Filter by category" })
  );
  wrap.append(toolbar);

  // List heading + grid get filled by renderList()
  wrap.append(el("div", { id: "list" }));
  app.append(wrap);

  // Floating "add recipe" button, only on devices set up for editing
  if (canEdit()) {
    app.append(el("a", { class: "fab", href: "#/add", "aria-label": "Add a recipe" }, icon("plus")));
  }
  renderList();
}

// Re-draws the toggle, chips, heading and grid from the current filters
function renderList() {
  const pool = visibleRecipes();
  const favCount = pool.filter((r) => r.status === "favorite").length;
  const tryCount = pool.filter((r) => r.status === "to-try").length;

  document.getElementById("segmented").replaceChildren(
    el("button", { type: "button", "aria-pressed": String(filters.status === "favorite"), onclick: () => setFilters({ status: "favorite" }) }, `Favorites · ${favCount}`),
    el("button", { type: "button", "aria-pressed": String(filters.status === "to-try"), onclick: () => setFilters({ status: "to-try" }) }, `To Try · ${tryCount}`)
  );

  const chips = [
    el("button", { type: "button", class: "chip", "aria-pressed": String(filters.veg), onclick: () => setFilters({ veg: !filters.veg }) }, icon("leaf"), "Vegetarian"),
    el("button", { type: "button", class: "chip", "aria-pressed": String(filters.cat === "all"), onclick: () => setFilters({ cat: "all" }) }, "All"),
    ...CATEGORIES.map(([id, label]) =>
      el("button", { type: "button", class: "chip", "aria-pressed": String(filters.cat === id), onclick: () => setFilters({ cat: id }) }, label)
    ),
  ];
  document.getElementById("chips").replaceChildren(...chips);

  const results = filtered();
  const catName = filters.cat === "all" ? "all categories" : CAT_LABEL[filters.cat].toLowerCase();
  const who = profile === "both" ? "Emma & Chris" : PERSON_LABEL[profile];
  const head = el("div", { class: "list-head" },
    el("span", { class: "main" }, filters.status === "favorite" ? "Favorites" : "Want to try"),
    el("span", { class: "sub" }, `${who} · ${filters.veg ? "vegetarian · " : ""}${catName} · ${results.length} ${results.length === 1 ? "recipe" : "recipes"}`)
  );

  let body;
  if (results.length) {
    body = el("div", { class: "grid" }, results.map(card));
  } else {
    body = el("div", { class: "empty" },
      el("span", { class: "script" }, "nothing here yet…"),
      el("p", {}, filters.q ? `No recipes match “${filters.q}” with these filters.` : "No recipes match these filters.")
    );
  }
  document.getElementById("list").replaceChildren(head, body);
}

function card(r) {
  const info = [r.time, servesText(r.servings)].filter(Boolean).join(" · ");
  return el("a", { class: "card", href: `#/recipe/${r.id}` },
    el("div", { class: "photo" },
      r.image ? el("img", { src: r.image, alt: "", loading: "lazy" }) : null,
      el("div", { class: "badges" },
        r.vegetarian ? el("span", { class: "badge", title: "Vegetarian" }, icon("leaf"), el("span", { class: "sr-only" }, "Vegetarian")) : null,
        isShared(r) ? el("span", { class: "badge", title: "Shared: Emma & Chris" }, icon("users"), el("span", { class: "sr-only" }, "Shared by Emma and Chris")) : null
      )
    ),
    el("div", { class: "meta" },
      el("span", { class: "cat" }, r.categories.map((c) => CAT_LABEL[c]).join(" · ")),
      el("span", { class: "title" }, r.title),
      info ? el("span", { class: "info" }, info) : null
    )
  );
}

/* ---------- Recipe view ---------- */
function renderRecipe(id) {
  const r = RECIPES.find((x) => x.id === id);
  if (!r) {
    location.hash = "#/";
    return;
  }
  document.title = `${r.title} · my Recipes`;
  app.replaceChildren();

  const storeKey = `checked:${r.id}`;
  let checked = readStore(localStorage, storeKey, {});

  // Hero photo with back button, edit button (editing devices only) and title
  const hero = el("div", { class: "recipe-hero" },
    r.image ? el("img", { src: r.image, alt: r.title }) : null,
    el("div", { class: "hero-bar" },
      el("a", { class: "round-btn", href: "#/", "aria-label": "Back to all recipes" }, icon("back")),
      canEdit() ? el("a", { class: "round-btn", href: `#/edit/${r.id}`, "aria-label": "Edit recipe" }, icon("edit")) : null
    ),
    el("div", { class: "hero-title" },
      el("span", { class: "cat" }, r.categories.map((c) => CAT_LABEL[c]).join(" · ")),
      el("h1", {}, r.title)
    )
  );

  const panel = el("div", { class: "panel" });

  // Pills: time, servings, vegetarian, owner(s), status
  const pills = el("div", { class: "pills" });
  if (r.time) pills.append(el("span", { class: "pill" }, icon("clock"), r.time));
  if (r.servings) pills.append(el("span", { class: "pill" }, icon("bowl"), servesText(r.servings)));
  if (r.vegetarian) pills.append(el("span", { class: "pill" }, icon("leaf"), "Vegetarian"));
  pills.append(el("span", { class: "pill" }, icon(isShared(r) ? "users" : "user"), ownerText(r)));
  pills.append(r.status === "favorite"
    ? el("span", { class: "pill status" }, icon("star"), "Favorite")
    : el("span", { class: "pill status" }, icon("bookmark"), "To try"));
  panel.append(pills);

  // Source: a single link makes the label itself the link; multiple links get their own names
  const links = (r.source && r.source.links) || [];
  if (r.source && (r.source.label || links.length)) {
    const src = el("div", { class: "source" }, el("span", { class: "label-caps" }, "SOURCE"));
    if (links.length === 1) {
      src.append(el("span", { class: "value" }, el("a", { href: links[0].url, target: "_blank", rel: "noopener" }, r.source.label || links[0].text)));
    } else {
      src.append(el("span", { class: "value" }, r.source.label));
      links.forEach((l) => src.append(el("span", { class: "value" }, el("a", { href: l.url, target: "_blank", rel: "noopener" }, l.text))));
    }
    panel.append(src);
  }

  // Ingredients with persistent checkboxes
  const groups = r.ingredients || [];
  if (groups.length) {
    const total = groups.reduce((n, g) => n + g.items.length, 0);
    const count = el("span", { class: "count" });
    const clearBtn = el("button", { type: "button", class: "ghost-btn" }, icon("reset"), "Clear all");

    const updateCount = () => {
      const done = Object.values(checked).filter(Boolean).length;
      count.textContent = `${done} of ${total} checked`;
      clearBtn.disabled = done === 0;
    };

    const section = el("section", {},
      el("div", { class: "sec-head" },
        el("div", {}, el("h2", {}, "Ingredients"), count),
        clearBtn
      )
    );

    const rows = [];
    groups.forEach((g, gi) => {
      if (g.group) section.append(el("span", { class: "group-name" }, g.group));
      g.items.forEach((text, ii) => {
        const key = `${gi}-${ii}`;
        const row = el("button", {
          type: "button", class: "ing", "aria-pressed": String(!!checked[key]),
          onclick: () => {
            checked[key] = !checked[key];
            if (!checked[key]) delete checked[key];
            row.setAttribute("aria-pressed", String(!!checked[key]));
            writeStore(localStorage, storeKey, checked);
            updateCount();
          },
        },
          el("span", { class: "box" }, icon("check")),
          el("span", { class: "text" }, text)
        );
        rows.push(row);
        section.append(row);
      });
    });

    // "Clear all" unchecks every ingredient for this recipe only
    clearBtn.addEventListener("click", () => {
      checked = {};
      writeStore(localStorage, storeKey, checked);
      rows.forEach((row) => row.setAttribute("aria-pressed", "false"));
      updateCount();
    });
    updateCount();
    panel.append(section);
  }

  // Directions, numbered across groups
  const dGroups = r.directions || [];
  const dirSection = el("section", {}, el("div", { class: "sec-head" }, el("h2", {}, "Directions")));
  if (dGroups.some((g) => g.steps.length)) {
    let n = 0;
    dGroups.forEach((g) => {
      if (g.group) dirSection.append(el("span", { class: "group-name" }, g.group));
      g.steps.forEach((s) => {
        n += 1;
        dirSection.append(el("div", { class: "step" },
          el("span", { class: "num" }, String(n).padStart(2, "0")),
          el("span", { class: "text" }, s)
        ));
      });
    });
  } else {
    const link = links[0];
    dirSection.append(el("p", { class: "note" },
      "Directions aren’t saved here yet. ",
      link ? el("a", { href: link.url, target: "_blank", rel: "noopener", style: "color: var(--champagne)" }, "Open the original recipe") : null,
      link ? "." : ""
    ));
  }
  panel.append(dirSection);

  if (r.notes) {
    panel.append(el("div", { class: "note" }, el("span", { class: "label-caps" }, "NOTES"), r.notes));
  }

  app.append(el("div", { class: "recipe-layout" }, hero, panel));
  window.scrollTo(0, 0);
}

/* ---------- Router ---------- */
let homeScroll = 0;
function route() {
  const h = location.hash;
  let m;
  if ((m = h.match(/^#\/recipe\/([\w-]+)/))) return renderRecipe(m[1]);
  if (h === "#/add") return Editor.renderForm(null);
  if ((m = h.match(/^#\/edit\/([\w-]+)/))) return Editor.renderForm(m[1]);
  if (h === "#/setup") return Editor.renderSetup();
  renderHome();
  window.scrollTo(0, homeScroll);   // return to where you were in the list
}
window.addEventListener("hashchange", () => {
  // Leaving the home list: remember the scroll position for when you come back
  if (document.getElementById("list")) homeScroll = window.scrollY;
  route();
});

/* ---------- Start ---------- */
// Editing devices read the latest file from GitHub; everyone else reads the published copy
(canEdit() ? Editor.loadFromGitHub().catch(() => fetch("data/recipes.json", { cache: "no-cache" }).then((r) => r.json()))
           : fetch("data/recipes.json", { cache: "no-cache" }).then((res) => res.json()))
  .then((data) => {
    setRecipes(data);
    route();
  })
  .catch(() => {
    app.replaceChildren(el("div", { class: "wrap" }, el("p", { class: "empty" }, "Couldn’t load the recipes. Try refreshing.")));
  });
