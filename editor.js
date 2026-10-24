/* ==========================================================
   my Recipes — editor (add / edit / delete recipes)

   How saving works:
   - GitHub Pages can't save anything by itself, so this page talks to the
     GitHub API directly from the browser.
   - A GitHub "fine-grained personal access token" is pasted once on the
     #/setup page and stored only in this device's browser (localStorage).
     It never appears in the site's code.
   - Saving a recipe = (1) upload the resized photo to images/, then
     (2) download the latest data/recipes.json, change it, and upload it back.
     Each upload is a normal commit, so the GitHub history doubles as a backup.
   - The public site rebuilds in about a minute. This device reads straight
     from GitHub, so it sees changes immediately.

   Loaded before app.js; uses the shared helpers defined in app.js
   (el, icon, readStore, writeStore, RECIPES, setRecipes, CATEGORIES, PEOPLE …)
   only inside functions, which run after app.js has loaded.
   ========================================================== */

const Editor = (() => {
  const DEFAULT_REPO = "emmaricci/my-favorite-recipes";
  const BRANCH = "main";
  const DATA_PATH = "data/recipes.json";

  /* ---------------- Settings stored on this device ---------------- */
  const token = () => readStore(localStorage, "gh-token", "");
  const repo = () => readStore(localStorage, "gh-repo", DEFAULT_REPO);

  /* ---------------- Text <-> base64 (GitHub sends file contents as base64) ---------------- */
  function utf8ToBase64(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = "";
    // Build the binary string in chunks so large files don't overflow the call stack
    for (let i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(bin);
  }
  function base64ToUtf8(b64) {
    const bin = atob(b64.replace(/\s/g, ""));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  /* ---------------- GitHub API helpers ---------------- */
  // Calls https://api.github.com/repos/<owner>/<repo>/<path> with this device's token
  async function gh(path, options = {}, tok = token(), rep = repo()) {
    const res = await fetch(`https://api.github.com/repos/${rep}${path ? "/" + path : ""}`, {
      ...options,
      cache: "no-store",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${tok}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(options.headers || {}),
      },
    });
    if (!res.ok) {
      const err = new Error(`GitHub said ${res.status}`);
      err.status = res.status;
      try { err.detail = (await res.json()).message; } catch { /* no body */ }
      throw err;
    }
    return res.status === 204 ? null : res.json();
  }

  // Read a file: returns { sha, text }. sha is GitHub's version id, needed to overwrite it.
  async function getFile(path) {
    const meta = await gh(`contents/${path}?ref=${BRANCH}`);
    if (meta.content) return { sha: meta.sha, text: base64ToUtf8(meta.content) };
    // Files over 1 MB come back without content; ask for the raw file instead
    const res = await fetch(`https://api.github.com/repos/${repo()}/contents/${path}?ref=${BRANCH}`, {
      cache: "no-store",
      headers: { Accept: "application/vnd.github.raw+json", Authorization: `Bearer ${token()}` },
    });
    return { sha: meta.sha, text: await res.text() };
  }

  // Create or overwrite a file. contentB64 is already base64. Pass sha when overwriting.
  function putFile(path, contentB64, message, sha) {
    return gh(`contents/${path}`, {
      method: "PUT",
      body: JSON.stringify({ message, content: contentB64, branch: BRANCH, ...(sha ? { sha } : {}) }),
    });
  }

  async function deleteFile(path, message) {
    const meta = await gh(`contents/${path}?ref=${BRANCH}`);
    return gh(`contents/${path}`, {
      method: "DELETE",
      body: JSON.stringify({ message, sha: meta.sha, branch: BRANCH }),
    });
  }

  // Loads the newest recipes.json straight from GitHub (used at startup on editing devices)
  async function loadFromGitHub() {
    const { text } = await getFile(DATA_PATH);
    return JSON.parse(text);
  }

  // Download recipes.json, let `change` edit the array, and upload it again.
  // If someone saved in between (GitHub returns 409), start over once with the newer file.
  async function updateRecipes(change, message) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const { sha, text } = await getFile(DATA_PATH);
      const list = JSON.parse(text);
      const updated = change(list);
      try {
        await putFile(DATA_PATH, utf8ToBase64(JSON.stringify(updated, null, 2) + "\n"), message, sha);
        return updated;
      } catch (e) {
        if (e.status !== 409 || attempt === 1) throw e;
      }
    }
  }

  /* ---------------- New photos: show from GitHub until the site rebuilds ---------------- */
  // A just-uploaded photo isn't on the public site for about a minute, so if an
  // image fails to load on an editing device, retry it from the repo directly.
  document.addEventListener("error", (e) => {
    const img = e.target;
    if (img.tagName !== "IMG" || img.dataset.retried || !token()) return;
    const path = img.getAttribute("src");
    if (!path || !path.startsWith("images/")) return;
    img.dataset.retried = "1";
    img.src = `https://raw.githubusercontent.com/${repo()}/${BRANCH}/${path}`;
  }, true);

  /* ---------------- Small UI helpers ---------------- */
  function toast(message) {
    const t = el("div", { class: "toast", role: "status" }, message);
    document.body.append(t);
    setTimeout(() => t.remove(), 4000);
  }

  function slugify(text) {
    return text.normalize("NFKD").replace(/[̀-ͯ]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "recipe";
  }

  // Turns a recipe's groups into the text-box format:
  // one item per line, a "Group name:" line starts each named group
  function groupsToText(groups, key) {
    return (groups || []).map((g) => [g.group ? `${g.group}:` : null, ...g[key]].filter((x) => x !== null).join("\n")).join("\n\n");
  }

  // The reverse: text box -> groups. Blank lines are ignored; a line ending in ":" starts a group.
  // For directions, leading numbering like "1.", "2)" or "Step 3" is removed.
  function textToGroups(text, key, isSteps) {
    const groups = [];
    let cur = { group: "", [key]: [] };
    for (let line of text.split("\n")) {
      line = line.trim();
      if (!line) continue;
      if (line.endsWith(":") && line.length <= 60) {
        if (cur[key].length || cur.group) groups.push(cur);
        cur = { group: line.slice(0, -1).trim(), [key]: [] };
        continue;
      }
      line = line.replace(/^[-•*]\s+/, "");
      if (isSteps) line = line.replace(/^(step\s*)?\d+\s*[.):-]?\s+/i, "");
      if (line) cur[key].push(line);
    }
    if (cur[key].length) groups.push(cur);
    return groups;
  }

  // Shrinks a photo to at most 1000px on its long side and returns JPEG base64 (no prefix)
  function resizePhoto(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 1000 / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(img.src);
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.onerror = () => reject(new Error("That photo couldn't be read. Try a JPG or PNG."));
      img.src = URL.createObjectURL(file);
    });
  }

  // Reusable "pill" toggle used for categories, people, vegetarian and status
  function toggleChip(label, pressed, onToggle) {
    const b = el("button", { type: "button", class: "chip", "aria-pressed": String(pressed) }, label);
    b.addEventListener("click", () => {
      const next = b.getAttribute("aria-pressed") !== "true";
      b.setAttribute("aria-pressed", String(next));
      onToggle(next, b);
    });
    return b;
  }

  function field(labelText, control, hint) {
    return el("label", { class: "field" },
      el("span", { class: "field-label" }, labelText),
      control,
      hint ? el("span", { class: "field-hint" }, hint) : null
    );
  }

  function topBar(title, backHref) {
    return el("div", { class: "form-top" },
      el("a", { class: "round-btn", href: backHref, "aria-label": "Back" }, icon("back")),
      el("h1", {}, title)
    );
  }

  /* ================= Setup page (#/setup) ================= */
  function renderSetup() {
    document.title = "Set up editing · my Recipes";
    app.replaceChildren();

    const tokInput = el("input", { type: "password", class: "input", autocomplete: "off", placeholder: "github_pat_…", value: token() });
    const repoInput = el("input", { type: "text", class: "input", autocomplete: "off", value: repo() });
    const status = el("p", { class: "form-status", role: "status" });

    const saveBtn = el("button", { type: "button", class: "primary-btn" }, "Save & test");
    saveBtn.addEventListener("click", async () => {
      const tok = tokInput.value.trim();
      const rep = repoInput.value.trim().replace(/^https:\/\/github\.com\//, "").replace(/\/$/, "");
      if (!tok) { status.textContent = "Paste your token first."; return; }
      saveBtn.disabled = true;
      status.textContent = "Checking with GitHub…";
      try {
        // Reading the repo confirms the token works; "push" says whether it can save
        const info = await gh("", {}, tok, rep);
        if (info.permissions && info.permissions.push === false) {
          throw Object.assign(new Error("no-write"), { detail: "This token can read the repo but can't save. Give it Contents: Read and write." });
        }
        writeStore(localStorage, "gh-token", tok);
        writeStore(localStorage, "gh-repo", rep);
        status.textContent = "Connected. This device can now add and edit recipes.";
        setRecipes(await loadFromGitHub());
        setTimeout(() => { location.hash = "#/"; }, 900);
      } catch (e) {
        status.textContent = e.status === 401 ? "GitHub didn't accept that token. Check it was copied fully and hasn't expired."
          : e.status === 404 ? "Couldn't find that repository with this token. Check the name and that the token includes it."
          : e.detail || "Something went wrong. Check your connection and try again.";
      } finally {
        saveBtn.disabled = false;
      }
    });

    const disconnect = token()
      ? el("button", {
          type: "button", class: "ghost-btn",
          onclick: () => {
            try { localStorage.removeItem("gh-token"); } catch { /* ignore */ }
            location.hash = "#/";
          },
        }, "Disconnect this device")
      : null;

    app.append(el("div", { class: "wrap form-wrap" },
      topBar("Set up editing", "#/"),
      el("p", { class: "form-intro" }, "Connect this phone to GitHub once, so it can save recipes. Only do this on your own devices."),
      el("ol", { class: "steps-list" },
        el("li", {}, "On GitHub, open Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token."),
        el("li", {}, "Name it “recipes”, pick an expiration, and under Repository access choose Only select repositories → my-favorite-recipes."),
        el("li", {}, "Under Permissions → Repository permissions, set Contents to Read and write."),
        el("li", {}, "Generate the token, copy it, and paste it below.")
      ),
      field("GitHub token", tokInput, "Stored only in this browser. It never goes into the site’s code."),
      field("Repository", repoInput),
      el("div", { class: "form-actions" }, saveBtn, disconnect),
      status
    ));
    window.scrollTo(0, 0);
  }

  /* ================= Add / edit form (#/add, #/edit/<id>) ================= */
  function renderForm(id) {
    if (!token()) { location.hash = "#/setup"; return; }
    const existing = id ? RECIPES.find((r) => r.id === id) : null;
    if (id && !existing) { location.hash = "#/"; return; }

    document.title = `${existing ? "Edit" : "Add"} recipe · my Recipes`;
    app.replaceChildren();

    // Working copy of the form's choices; text fields are read when saving.
    // New recipes start with the person currently picked in the switcher.
    const state = {
      status: existing ? existing.status : "favorite",
      owners: new Set(existing ? ownersOf(existing) : profile === "both" ? ["emma", "chris"] : [profile]),
      categories: new Set(existing ? existing.categories : []),
      vegetarian: existing ? !!existing.vegetarian : false,
      image: existing ? existing.image : null,   // current image path, or null
      newPhoto: null,                             // data URL of a newly picked photo
    };

    /* --- Text fields --- */
    const title = el("input", { type: "text", class: "input", required: true, value: existing ? existing.title : "", placeholder: "e.g. Grandma’s lasagne" });
    const time = el("input", { type: "text", class: "input", value: existing?.time || "", placeholder: "e.g. 40 mins" });
    const servings = el("input", { type: "text", class: "input", value: existing?.servings || "", placeholder: "e.g. 4, or 12 cups" });
    const sourceLabel = el("input", { type: "text", class: "input", value: existing?.source?.label || "", placeholder: "e.g. NYT, Grandma, a cookbook" });
    const ingredients = el("textarea", { class: "input textarea", rows: "10", placeholder: "2 cups flour\n1 tsp salt\n\nSauce:\n3 tbsp soy sauce" });
    ingredients.value = groupsToText(existing?.ingredients, "items");
    const directions = el("textarea", { class: "input textarea", rows: "10", placeholder: "Preheat the oven to 350F.\nMix the dry ingredients.\n\nSauce:\nWhisk everything together." });
    directions.value = groupsToText(existing?.directions, "steps");
    const notes = el("textarea", { class: "input textarea", rows: "3", placeholder: "Optional" });
    notes.value = existing?.notes || "";

    /* --- Source links: one or more rows of (name, URL) --- */
    const linkRows = el("div", { class: "link-rows" });
    function addLinkRow(text = "", url = "") {
      const nameIn = el("input", { type: "text", class: "input", value: text, placeholder: "Link name (optional)", "aria-label": "Link name" });
      const urlIn = el("input", { type: "url", class: "input", value: url, placeholder: "https://…", "aria-label": "Link URL", inputmode: "url" });
      const row = el("div", { class: "link-row" }, nameIn, urlIn,
        el("button", { type: "button", class: "ghost-btn small", "aria-label": "Remove link", onclick: () => row.remove() }, "Remove"));
      linkRows.append(row);
    }
    const startLinks = existing?.source?.links || [];
    if (startLinks.length) startLinks.forEach((l) => addLinkRow(startLinks.length > 1 ? l.text : "", l.url));
    else addLinkRow();

    /* --- Photo picker with preview --- */
    const preview = el("div", { class: "photo-preview" });
    const fileIn = el("input", { type: "file", accept: "image/*", class: "sr-only", id: "photo-file" });
    function drawPreview() {
      const src = state.newPhoto || state.image;
      preview.replaceChildren(
        src ? el("img", { src, alt: "Recipe photo preview" }) : el("span", { class: "field-hint" }, "No photo yet"),
      );
      removeBtn.hidden = !src;
    }
    const removeBtn = el("button", { type: "button", class: "ghost-btn small", onclick: () => { state.newPhoto = null; state.image = null; fileIn.value = ""; drawPreview(); } }, "Remove photo");
    fileIn.addEventListener("change", async () => {
      const f = fileIn.files[0];
      if (!f) return;
      try {
        state.newPhoto = await resizePhoto(f);
        drawPreview();
      } catch (e) {
        status.textContent = e.message;
      }
    });
    drawPreview();

    /* --- Chip groups --- */
    const statusChips = el("div", { class: "chip-row" });
    const statusBtns = [["favorite", "Favorite"], ["to-try", "To try"]].map(([v, label]) => {
      const b = el("button", { type: "button", class: "chip", "aria-pressed": String(state.status === v) }, label);
      b.addEventListener("click", () => {
        state.status = v;
        statusBtns.forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      });
      return b;
    });
    statusChips.append(...statusBtns);

    const ownerChips = el("div", { class: "chip-row" },
      PEOPLE.map(([v, label]) => toggleChip(label, state.owners.has(v), (on) => (on ? state.owners.add(v) : state.owners.delete(v))))
    );
    const catChips = el("div", { class: "chip-row wrap-row" },
      CATEGORIES.map(([v, label]) => toggleChip(label, state.categories.has(v), (on) => (on ? state.categories.add(v) : state.categories.delete(v))))
    );
    const vegChip = el("div", { class: "chip-row" },
      toggleChip([icon("leaf"), "Vegetarian"], state.vegetarian, (on) => { state.vegetarian = on; })
    );

    /* --- Save / delete --- */
    const status = el("p", { class: "form-status", role: "status" });
    const saveBtn = el("button", { type: "button", class: "primary-btn" }, existing ? "Save changes" : "Add recipe");
    saveBtn.addEventListener("click", save);

    let deleteArmed = false;
    const deleteBtn = existing
      ? el("button", { type: "button", class: "danger-btn" }, "Delete recipe")
      : null;
    if (deleteBtn) {
      // Two taps to delete, so a stray tap can't remove a recipe
      deleteBtn.addEventListener("click", () => {
        if (!deleteArmed) {
          deleteArmed = true;
          deleteBtn.textContent = "Tap again to delete";
          setTimeout(() => { deleteArmed = false; deleteBtn.textContent = "Delete recipe"; }, 4000);
          return;
        }
        remove();
      });
    }

    function busy(on, msg = "") {
      saveBtn.disabled = on;
      if (deleteBtn) deleteBtn.disabled = on;
      status.textContent = msg;
    }

    function explain(e) {
      return e.status === 401 ? "GitHub rejected the token (it may have expired). Open Set up editing to paste a new one."
        : e.status === 403 ? "This token isn't allowed to save. It needs Contents: Read and write."
        : e.status === 404 ? "Couldn't reach the repository. Check Set up editing."
        : e.status === 422 ? "GitHub couldn't save that file. Try again."
        : e.message === "Failed to fetch" ? "No connection. Check your internet and try again."
        : e.detail || e.message || "Something went wrong.";
    }

    async function save() {
      // Validate the essentials
      const t = title.value.trim();
      if (!t) { status.textContent = "Add a title."; title.focus(); return; }
      if (!state.owners.size) { status.textContent = "Pick who it’s for (Emma, Chris, or both)."; return; }
      if (!state.categories.size) { status.textContent = "Pick at least one category."; return; }

      // Links: a single link with no name takes the source name
      const links = [...linkRows.querySelectorAll(".link-row")]
        .map((row) => { const [n, u] = row.querySelectorAll("input"); return { text: n.value.trim(), url: u.value.trim() }; })
        .filter((l) => l.url)
        .map((l, _, all) => ({ text: l.text || (all.length === 1 ? sourceLabel.value.trim() : "") || "Link", url: l.url }));

      // New recipes get an id from the title; edits keep theirs so links and checkboxes still work
      let rid = existing ? existing.id : slugify(t);
      if (!existing) {
        const taken = new Set(RECIPES.map((r) => r.id));
        let n = 2, base = rid;
        while (taken.has(rid)) rid = `${base}-${n++}`;
      }

      const recipe = {
        id: rid,
        title: t,
        status: state.status,
        owners: PEOPLE.map(([v]) => v).filter((v) => state.owners.has(v)),
        categories: CATEGORIES.map(([v]) => v).filter((v) => state.categories.has(v)),
        vegetarian: state.vegetarian,
        servings: servings.value.trim() || null,
        time: time.value.trim() || null,
        source: { label: sourceLabel.value.trim(), links },
        image: state.image,
        ingredients: textToGroups(ingredients.value, "items", false),
        directions: textToGroups(directions.value, "steps", true),
        notes: notes.value.trim(),
      };

      try {
        // 1) Upload a new photo first (a fresh file name each time avoids old cached copies)
        const oldImage = existing ? existing.image : null;
        if (state.newPhoto) {
          busy(true, "Uploading photo…");
          const path = `images/${rid}-${Date.now().toString(36)}.jpg`;
          await putFile(path, state.newPhoto.split(",")[1], `Add photo for ${t}`);
          recipe.image = path;
        }

        // 2) Save the recipe into recipes.json
        busy(true, "Saving recipe…");
        const updated = await updateRecipes((list) => {
          const i = list.findIndex((r) => r.id === rid);
          if (i >= 0) list[i] = recipe; else list.push(recipe);
          return list;
        }, `${existing ? "Update" : "Add"} recipe: ${t}`);

        // 3) Tidy up: remove the old photo if it was replaced or removed (not critical if it fails)
        if (oldImage && oldImage !== recipe.image) {
          deleteFile(oldImage, `Remove old photo for ${t}`).catch(() => {});
        }

        setRecipes(updated);
        busy(false);
        location.hash = `#/recipe/${rid}`;
        toast("Saved. The public site updates in about a minute.");
      } catch (e) {
        busy(false, explain(e));
      }
    }

    async function remove() {
      try {
        busy(true, "Deleting…");
        const updated = await updateRecipes((list) => list.filter((r) => r.id !== existing.id), `Delete recipe: ${existing.title}`);
        if (existing.image) deleteFile(existing.image, `Remove photo for ${existing.title}`).catch(() => {});
        try { localStorage.removeItem(`checked:${existing.id}`); } catch { /* ignore */ }
        setRecipes(updated);
        busy(false);
        location.hash = "#/";
        toast("Recipe deleted.");
      } catch (e) {
        busy(false, explain(e));
      }
    }

    /* --- Layout --- */
    app.append(el("div", { class: "wrap form-wrap" },
      topBar(existing ? "Edit recipe" : "Add a recipe", existing ? `#/recipe/${existing.id}` : "#/"),

      field("Title", title),
      el("div", { class: "field" }, el("span", { class: "field-label" }, "Status"), statusChips),
      el("div", { class: "field" }, el("span", { class: "field-label" }, "For"), ownerChips,
        el("span", { class: "field-hint" }, "Pick both for a shared recipe.")),
      el("div", { class: "field" }, el("span", { class: "field-label" }, "Category"), catChips),
      el("div", { class: "field" }, el("span", { class: "field-label" }, "Diet"), vegChip),

      el("div", { class: "two-col" }, field("Total time", time), field("Servings", servings)),

      el("div", { class: "field" },
        el("span", { class: "field-label" }, "Photo"),
        preview,
        el("div", { class: "form-actions" },
          el("label", { class: "ghost-btn small", for: "photo-file" }, "Choose photo"), fileIn, removeBtn)
      ),

      field("Source", sourceLabel, "Where it’s from: a website, a book, or a person."),
      el("div", { class: "field" },
        el("span", { class: "field-label" }, "Links"),
        linkRows,
        el("button", { type: "button", class: "ghost-btn small", onclick: () => addLinkRow() }, "Add another link")
      ),

      field("Ingredients", ingredients, "One per line. A line ending in a colon, like “Sauce:”, starts a group."),
      field("Directions", directions, "One step per line. Numbers are added for you. “Sauce:” lines start a group."),
      field("Notes", notes),

      // Save bar stays at the bottom of the screen; messages appear right under the buttons
      el("div", { class: "sticky-actions" }, el("div", { class: "form-actions" }, saveBtn, deleteBtn), status),
      el("p", { class: "field-hint" }, el("a", { href: "#/setup" }, "Set up editing"))
    ));
    window.scrollTo(0, 0);
    if (!existing) title.focus();
  }

  return { renderSetup, renderForm, loadFromGitHub };
})();
