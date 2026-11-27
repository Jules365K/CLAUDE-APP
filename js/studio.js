/* JULES · studio.js
   The Studio: where things get made before they become tasks.
   - Boards: an endless canvas. Notes, links, pictures and tasks, anywhere. Drag the background to
     move around, pinch (or Ctrl/⌘ + scroll) to zoom, double-click to write.
   - Ideas: throw an idea in; warm it up; turn it into a project or a board when it's ready.
     Jules can suggest next steps, which you keep or dismiss.
   - Moodboards: pictures and colours for a look. Jules pulls a palette out of the pictures.
   Pictures are uploaded to this artifact's own storage (the `assets` capability) and only their
   ids are kept in the database: boards → "boards", everything on them → "bits", ideas → "ideas". */
(function () {
  "use strict";
  const J = window.J, S = J.store, { $, $$, esc } = J, P = J.app;
  const ST = J.studio = { tab: P.lsGet("studioTab", "boards"), board: P.lsGet("studioBoard", null), sel: null, editing: null, ideaHelp: {} };
  let assets = null, sample = null;
  J.cap("assets").then(a => { assets = a; if (J.ui && J.ui.view === "studio") J.render(); });
  J.cap("sample").then(x => { sample = x; });

  /* ---------- pictures ---------- */
  const urlCache = {};
  J.assetUrl = id => urlCache[id] || "/_blob/" + encodeURIComponent(id);
  async function upload(file) {
    if (!assets) { J.toast("Pictures can be added when Jules is open in claude.ai."); return null; }
    if (!/^image\/(png|jpeg|gif|webp)$/.test(file.type)) { J.toast("That isn't a picture Jules can keep (PNG, JPEG, GIF or WebP)."); return null; }
    try { const r = await assets.upload(file); urlCache[r.id] = r.url; return r.id; }
    catch (e) { J.toast(e && e.code === "too_large" ? "That picture is over 20 MB." : e && e.code === "quota_or_state" ? "The artifact's picture storage is full." : "The picture didn't upload. Try again."); return null; }
  }

  /* ---------- reading ---------- */
  const boards = kind => S.list("boards").filter(b => (b.kind || "canvas") === kind).sort((a, b) => (b.at || 0) - (a.at || 0));
  const bitsOf = id => S.list("bits").filter(x => x.board === id);
  const safeUrl = u => /^https:\/\//i.test(u || "") ? u : "";
  const hostOf = u => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return ""; } };
  const COLORS = ["paper", "sand", "rose", "sage", "steel", "plume"];

  /* ---------- the view ---------- */
  function render() {
    /* A redraw while a note is being written: keep what's typed, and carry on writing after. */
    if (ST.editing) {
      const el = $(`.bit[data-bit="${CSS.escape(ST.editing)}"] .bit-text`), cur = S.get("bits", ST.editing);
      if (el && cur) { const t = el.innerText.replace(/\u00a0/g, " ").trimEnd().slice(0, 4000); if (t !== (cur.text || "")) S.patch("bits", cur.id, { text: t }); }
      ST.pendingEdit = ST.editing; ST.editing = null; ST.redrawing = true;   // the page is about to be replaced: ignore the blur that causes
    }
    const b = ST.board && S.get("boards", ST.board);
    if (b) return (b.kind === "mood" ? moodView : canvasView)(b);
    ST.board = null;
    const tabs = P.tabs("studioTab", ST.tab, [["boards", "Boards"], ["ideas", "Ideas"], ["mood", "Moodboards"]]);
    let h = P.viewHead("Studio", "Where things get made before they become tasks.", tabs + (ST.tab === "ideas" ? "" : `<button type="button" class="btn primary" data-act="stNew" data-kind="${ST.tab === "mood" ? "mood" : "canvas"}">${J.icon.plus}${ST.tab === "mood" ? "Moodboard" : "Board"}</button>`));
    if (ST.tab === "ideas") h += ideasView();
    else h += shelfOf(ST.tab === "mood" ? "mood" : "canvas");
    return `<div class="studio">${h}</div>`;
  }
  function shelfOf(kind) {
    const list = boards(kind);
    if (!list.length) return `<div class="st-empty"><p>${kind === "mood" ? "No moodboards yet. Start one for a look you're after: a website, a poster, a room." : "No boards yet. A board is an endless page for thinking: notes, links, pictures and tasks wherever you like."}</p><button type="button" class="btn primary" data-act="stNew" data-kind="${kind}">${J.icon.plus}${kind === "mood" ? "New moodboard" : "New board"}</button></div>`;
    return `<div class="st-grid">${list.map(b => {
      const bs = bitsOf(b.id), pics = bs.filter(x => x.type === "image" && x.asset).slice(0, kind === "mood" ? 4 : 1);
      const pj = b.project && S.get("projects", b.project);
      const preview = kind === "mood"
        ? `<span class="st-mosaic">${pics.map(x => `<img src="${esc(J.assetUrl(x.asset))}" alt="" loading="lazy">`).join("")}${(b.palette || []).slice(0, 6).map(c => `<i style="background:${esc(c)}"></i>`).join("")}</span>`
        : `<span class="st-mini">${bs.slice(0, 24).map(x => `<i class="t-${esc(x.type)}" style="left:${Math.max(0, Math.min(92, 46 + (x.x || 0) / 40))}%;top:${Math.max(0, Math.min(86, 40 + (x.y || 0) / 40))}%"></i>`).join("")}</span>`;
      return `<button type="button" class="st-tile" data-act="stOpen" data-id="${esc(b.id)}">${preview}<span class="st-meta"><b>${esc(b.title)}</b><em>${bs.length} ${bs.length === 1 ? "thing" : "things"}${pj ? " · " + esc(pj.name) : ""}</em></span></button>`;
    }).join("")}</div>`;
  }

  /* ---------- canvas ---------- */
  const VK = "jules5:cv:";
  const viewOf = id => { try { return JSON.parse(localStorage.getItem(VK + id)) || { x: 0, y: 0, z: 1 }; } catch (e) { return { x: 0, y: 0, z: 1 }; } };
  const saveView = (id, v) => { try { localStorage.setItem(VK + id, JSON.stringify(v)); } catch (e) {} };
  let cv = null;   // { id, x, y, z } while a board is open
  function canvasView(b) {
    const pj = b.project && S.get("projects", b.project);
    const head = P.viewHead(b.title, pj ? `Board for <a class="link" href="#projects" data-act="openProject" data-id="${esc(pj.id)}">${esc(pj.name)}</a>` : "A board", `<button type="button" class="btn" data-act="stBack">${J.icon.left}Studio</button><button type="button" class="btn" data-act="stEdit">${J.icon.edit}Board</button>`);
    const sel = ST.sel && S.get("bits", ST.sel);
    const tools = `<div class="cv-tools" role="toolbar" aria-label="Add to the board">
      <button type="button" class="btn sm" data-act="cvAdd" data-type="note">${J.icon.plus}Note</button>
      <button type="button" class="btn sm" data-act="cvAdd" data-type="link">${J.icon.plus}Link</button>
      ${assets ? `<label class="btn sm cv-file">${J.icon.image}Picture<input type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple data-upload="canvas"></label>` : ""}
      <button type="button" class="btn sm" data-act="cvAdd" data-type="task">${J.icon.tasks}Task</button>
      <span class="cv-colors" id="cvColors" ${sel && sel.type === "note" ? "" : "hidden"}>${COLORS.map(c => `<button type="button" class="cv-c c-${c}${sel && (sel.color || "paper") === c ? " on" : ""}" data-act="cvColor" data-c="${c}" aria-label="Note colour: ${c}"></button>`).join("")}</span>
      <span class="cv-spacer"></span>
      <button type="button" class="ibtn" data-act="cvZoom" data-d="-1" aria-label="Zoom out">−</button><span class="cv-z" id="cvZ">100%</span><button type="button" class="ibtn" data-act="cvZoom" data-d="1" aria-label="Zoom in">+</button>
      <button type="button" class="btn sm" data-act="cvFit">Fit</button></div>`;
    const bits = bitsOf(b.id).map(bitHtml).join("");
    return `<div class="studio">${head}${tools}<div class="cv-stage" id="cvStage" tabindex="0" data-board="${esc(b.id)}" aria-label="Board: drag to move around, double-click to add a note">
      <div class="cv-world" id="cvWorld">${bits}</div>
      ${bitsOf(b.id).length ? "" : `<p class="cv-hint">Double-click anywhere to write. Paste a link or a picture. Drag the background to move around.</p>`}</div></div>`;
  }
  function bitHtml(x) {
    const st = `left:${x.x || 0}px;top:${x.y || 0}px;width:${x.w || 200}px;${x.type === "link" || x.type === "task" ? "" : `height:${x.h || 120}px;`}`;
    const sel = ST.sel === x.id ? " sel" : "";
    if (x.type === "note") return `<div class="bit note c-${esc(x.color || "paper")}${sel}" data-bit="${esc(x.id)}" style="${st}"><div class="bit-text">${esc(x.text || "")}</div><span class="bit-rs" aria-hidden="true"></span></div>`;
    if (x.type === "link") { const u = safeUrl(x.url); return `<div class="bit link${sel}" data-bit="${esc(x.id)}" style="${st}"><span class="bl-host">${esc(hostOf(u) || "link")}</span><b>${esc(x.text || u)}</b>${u ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer" class="link">Open</a>` : ""}</div>`; }
    if (x.type === "image") return `<div class="bit image${sel}" data-bit="${esc(x.id)}" style="${st}"><img src="${esc(J.assetUrl(x.asset))}" alt="" draggable="false"><span class="bit-rs" aria-hidden="true"></span></div>`;
    if (x.type === "task") { const t = S.get("tasks", x.task); return `<div class="bit task${sel}${t && t.status === "done" ? " done" : ""}" data-bit="${esc(x.id)}" style="${st}">${t ? `<button type="button" class="chk" data-act="toggle" data-id="${esc(t.id)}" aria-label="Done">${J.icon.check}</button><span><b>${esc(t.title)}</b><em>${t.due ? esc(J.relDay(t.due)) : "No date"}</em></span>` : `<span><b>Task removed</b></span>`}</div>`; }
    return "";
  }
  function apply() {
    const w = $("#cvWorld"); if (!w || !cv) return;
    w.style.transform = `translate(${cv.x}px,${cv.y}px) scale(${cv.z})`;
    const z = $("#cvZ"); if (z) z.textContent = Math.round(cv.z * 100) + "%";
    const stg = $("#cvStage");
    if (stg) { stg.style.backgroundPosition = `${cv.x}px ${cv.y}px`; stg.style.backgroundSize = `${28 * cv.z}px ${28 * cv.z}px`; }
  }
  const toWorld = (stage, cx, cy) => { const r = stage.getBoundingClientRect(); return { x: (cx - r.left - cv.x) / cv.z, y: (cy - r.top - cv.y) / cv.z }; };
  function center(stage) { const r = stage.getBoundingClientRect(); return toWorld(stage, r.left + r.width / 2, r.top + r.height / 2); }
  function zoomAt(stage, cx, cy, f) {
    const r = stage.getBoundingClientRect(), nz = J.clamp(cv.z * f, .2, 3);
    const px = cx - r.left, py = cy - r.top;
    cv.x = px - (px - cv.x) * (nz / cv.z); cv.y = py - (py - cv.y) * (nz / cv.z); cv.z = nz;
    apply(); saveView(cv.id, cv);
  }
  function fit() {
    const stage = $("#cvStage"), bs = bitsOf(cv.id); if (!stage) return;
    if (!bs.length) { cv.x = 0; cv.y = 0; cv.z = 1; apply(); return; }
    const x0 = Math.min(...bs.map(b => b.x || 0)), y0 = Math.min(...bs.map(b => b.y || 0)), x1 = Math.max(...bs.map(b => (b.x || 0) + (b.w || 200))), y1 = Math.max(...bs.map(b => (b.y || 0) + (b.h || 120)));
    const r = stage.getBoundingClientRect(), pad = 60;
    cv.z = J.clamp(Math.min((r.width - pad * 2) / (x1 - x0 || 1), (r.height - pad * 2) / (y1 - y0 || 1)), .2, 1.4);
    cv.x = (r.width - (x1 - x0) * cv.z) / 2 - x0 * cv.z; cv.y = (r.height - (y1 - y0) * cv.z) / 2 - y0 * cv.z;
    apply(); saveView(cv.id, cv);
  }
  function addBit(type, at, extra = {}) {
    const stage = $("#cvStage"); if (!stage || !cv) return null;
    const p = at || center(stage);
    const base = { board: cv.id, type, x: Math.round(p.x - 100), y: Math.round(p.y - 50), w: type === "image" ? 260 : 200, h: type === "image" ? 200 : 120, at: Date.now() };
    const x = S.put("bits", Object.assign(base, extra));
    S.patch("boards", cv.id, { at: Date.now() });
    return x;
  }
  function editNote(id) {
    const el = $(`.bit[data-bit="${CSS.escape(id)}"] .bit-text`); if (!el) return;
    ST.editing = id;
    el.contentEditable = "plaintext-only";
    if (el.contentEditable !== "plaintext-only") el.contentEditable = "true";
    el.focus();
    const rg = document.createRange(); rg.selectNodeContents(el); rg.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(rg);
    el.addEventListener("blur", () => {
      if (ST.redrawing || !el.isConnected) return;      // redrawn away: render() already kept the text
      el.contentEditable = "false"; ST.editing = null;
      const text = el.innerText.replace(/ /g, " ").trimEnd().slice(0, 4000), cur = S.get("bits", id);
      if (!cur) return;
      if (!text && cur.type === "note" && !cur.text) { S.remove("bits", id); return; }
      if (text !== (cur.text || "")) S.patch("bits", id, { text });
    }, { once: true });
  }
  /* Selecting doesn't redraw the page (that would drop a drag in progress): it just marks things. */
  function select(id) {
    ST.sel = id;
    $$("#cvWorld .bit.sel").forEach(b => b.classList.remove("sel"));
    if (id) { const b = $(`.bit[data-bit="${CSS.escape(id)}"]`); if (b) b.classList.add("sel"); }
    const now = id && S.get("bits", id), row = $("#cvColors");
    if (row) { row.hidden = !(now && now.type === "note"); $$(".cv-c", row).forEach(c => c.classList.toggle("on", !!now && (now.color || "paper") === c.dataset.c)); }
  }
  function removeBit(id) {
    const x = S.get("bits", id); if (!x) return;
    S.remove("bits", id); ST.sel = null;
    J.toast("Removed from the board", { label: "Undo", run: () => S.put("bits", x) });
  }

  /* pointer: drag a thing, resize it, or move around the board */
  let drag = null;
  document.addEventListener("pointerdown", e => {
    const stage = e.target.closest && e.target.closest("#cvStage"); if (!stage || !cv || e.button !== 0) return;
    if (e.target.closest("a, button, [contenteditable=true], [contenteditable=plaintext-only]")) return;
    /* pointerdown is cancelled below (so dragging doesn't select text), which also stops the note
       being written from losing focus: finish it here. */
    if (ST.editing && document.activeElement && document.activeElement.blur) document.activeElement.blur();
    const bitEl = e.target.closest(".bit");
    if (bitEl) {
      const x = S.get("bits", bitEl.dataset.bit); if (!x) return;
      select(x.id);
      drag = { kind: e.target.closest(".bit-rs") ? "size" : "move", el: bitEl, id: x.id, sx: e.clientX, sy: e.clientY, ox: x.x || 0, oy: x.y || 0, ow: bitEl.offsetWidth, oh: bitEl.offsetHeight, moved: false };
    } else {
      select(null);
      drag = { kind: "pan", sx: e.clientX, sy: e.clientY, ox: cv.x, oy: cv.y, moved: false };
      stage.classList.add("panning");
    }
    stage.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  document.addEventListener("pointermove", e => {
    if (!drag) return;
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    if (drag.kind === "pan") { cv.x = drag.ox + dx; cv.y = drag.oy + dy; apply(); }
    else if (drag.kind === "move") { drag.el.style.left = Math.round(drag.ox + dx / cv.z) + "px"; drag.el.style.top = Math.round(drag.oy + dy / cv.z) + "px"; drag.el.classList.add("lift"); }
    else { drag.el.style.width = Math.max(120, Math.round(drag.ow + dx / cv.z)) + "px"; if (!drag.el.classList.contains("link") && !drag.el.classList.contains("task")) drag.el.style.height = Math.max(70, Math.round(drag.oh + dy / cv.z)) + "px"; }
  });
  document.addEventListener("pointerup", () => {
    if (!drag) return;
    const d = drag; drag = null;
    const stage = $("#cvStage"); if (stage) stage.classList.remove("panning");
    if (d.kind === "pan") { saveView(cv.id, cv); return; }
    d.el.classList.remove("lift");
    if (!d.moved) return;
    if (d.kind === "move") S.patch("bits", d.id, { x: parseInt(d.el.style.left, 10), y: parseInt(d.el.style.top, 10) });
    else S.patch("bits", d.id, { w: parseInt(d.el.style.width, 10), h: parseInt(d.el.style.height, 10) || undefined });
  });
  document.addEventListener("dblclick", e => {
    const stage = e.target.closest && e.target.closest("#cvStage"); if (!stage || !cv) return;
    const bitEl = e.target.closest(".bit");
    if (bitEl) { const x = S.get("bits", bitEl.dataset.bit); if (x && x.type === "note") editNote(x.id); else if (x && x.type === "link") editLink(x); return; }
    const p = toWorld(stage, e.clientX, e.clientY);
    const x = addBit("note", { x: p.x + 100, y: p.y + 30 }, { text: "", color: "paper" });
    if (x) { ST.sel = x.id; ST.pendingEdit = x.id; }
  });
  document.addEventListener("wheel", e => {
    const stage = e.target.closest && e.target.closest("#cvStage"); if (!stage || !cv) return;
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) zoomAt(stage, e.clientX, e.clientY, Math.exp(-e.deltaY * .0025));
    else { cv.x -= e.deltaX; cv.y -= e.deltaY; apply(); clearTimeout(cv.t); cv.t = setTimeout(() => saveView(cv.id, cv), 300); }
  }, { passive: false });
  document.addEventListener("keydown", e => {
    if (!cv || J.ui.view !== "studio" || ST.editing) return;
    if (e.target.closest && e.target.closest("input, textarea, select")) return;
    if ((e.key === "Delete" || e.key === "Backspace") && ST.sel) { e.preventDefault(); e.stopPropagation(); removeBit(ST.sel); }
    else if (e.key === "Enter" && ST.sel) { const x = S.get("bits", ST.sel); if (x && x.type === "note") { e.preventDefault(); e.stopPropagation(); editNote(x.id); } }
  }, true);
  /* paste a picture, a link or some text onto the open board */
  document.addEventListener("paste", async e => {
    if (!(J.ui && J.ui.view === "studio") || ST.editing) return;
    if (e.target.closest && e.target.closest("input, textarea, [contenteditable=true], [contenteditable=plaintext-only]")) return;
    const b = ST.board && S.get("boards", ST.board); if (!b) return;
    const files = [...(e.clipboardData && e.clipboardData.files || [])].filter(f => f.type.startsWith("image/"));
    if (files.length) { e.preventDefault(); for (const f of files) await addPicture(b, f); return; }
    const text = (e.clipboardData && e.clipboardData.getData("text/plain") || "").trim(); if (!text) return;
    e.preventDefault();
    if (b.kind === "mood") { if (/^#?[0-9a-f]{6}$/i.test(text)) S.put("bits", { board: b.id, type: "color", color: "#" + text.replace("#", "").toLowerCase(), at: Date.now() }); else S.put("bits", { board: b.id, type: "note", text: text.slice(0, 600), at: Date.now() }); return; }
    if (/^https:\/\/\S+$/i.test(text)) addBit("link", null, { url: text, text: "" });
    else addBit("note", null, { text: text.slice(0, 4000), color: "paper" });
  });
  /* drop pictures from the desktop */
  document.addEventListener("dragover", e => { if (e.target.closest && e.target.closest("#cvStage, .md-drop") && [...(e.dataTransfer.types || [])].includes("Files")) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } });
  document.addEventListener("drop", async e => {
    const zone = e.target.closest && e.target.closest("#cvStage, .md-drop"); if (!zone) return;
    const files = [...(e.dataTransfer.files || [])].filter(f => f.type.startsWith("image/")); if (!files.length) return;
    e.preventDefault();
    const b = ST.board && S.get("boards", ST.board); if (!b) return;
    const at = b.kind !== "mood" && cv ? toWorld(zone, e.clientX, e.clientY) : null;
    for (const [i, f] of files.entries()) await addPicture(b, f, at ? { x: at.x + 130 + i * 30, y: at.y + 100 + i * 30 } : null);
  });
  async function addPicture(b, file, at) {
    const id = await upload(file); if (!id) return;
    const dims = await new Promise(res => { const im = new Image(); im.onload = () => res([im.naturalWidth, im.naturalHeight]); im.onerror = () => res([4, 3]); im.src = J.assetUrl(id); });
    const w = 260, h = Math.round(w * dims[1] / (dims[0] || 1));
    if (b.kind === "mood") S.put("bits", { board: b.id, type: "image", asset: id, ratio: dims[1] / (dims[0] || 1), at: Date.now() });
    else addBit("image", at, { asset: id, w, h: J.clamp(h, 60, 900) });
  }
  document.addEventListener("change", async e => {
    const up = e.target.dataset && e.target.dataset.upload; if (!up) return;
    const b = ST.board && S.get("boards", ST.board); if (!b) return;
    for (const f of [...e.target.files]) await addPicture(b, f);
    e.target.value = "";
  });
  function editLink(x) {
    J.form.open({ eyebrow: "Link", title: x && x.text ? x.text : "Add a link", value: x || { url: "", text: "" },
      fields: [{ key: "url", label: "Address", placeholder: "https://…" }, { key: "text", label: "What it is", placeholder: "Optional" }],
      validate: v => /^https:\/\/\S+$/i.test(v.url.trim()) ? "" : "Links need to start with https://",
      onSave: v => { if (x && x.id) S.patch("bits", x.id, { url: v.url.trim(), text: v.text.trim() }); else addBit("link", null, { url: v.url.trim(), text: v.text.trim() }); },
      onDelete: x && x.id ? () => S.remove("bits", x.id) : null });
  }
  function pickTask() {
    const open = S.list("tasks").filter(t => t.status !== "done").slice(0, 200);
    J.form.open({ eyebrow: "Board", title: "Put a task on the board", value: { pick: "", title: "" },
      fields: [{ key: "pick", label: "An existing task", type: "select", options: [["", "Choose…"], ...open.map(t => [t.id, t.title.slice(0, 70)])] }, { key: "title", label: "Or a new one", placeholder: "New task title" }],
      validate: v => v.pick || v.title.trim() ? "" : "Choose a task or type a new one.",
      onSave: v => {
        let id = v.pick;
        if (!id) { const b = S.get("boards", cv.id); const t = J.act.add({ title: v.title.trim(), project: b && b.project || null }); id = t && t.id; }
        if (id) addBit("task", null, { task: id, w: 220 });
      } });
  }
  function editBoard(b, kind) {
    const pjs = S.list("projects").filter(p => p.status !== "landed");
    J.form.open({ eyebrow: "Studio", title: b ? b.title : kind === "mood" ? "New moodboard" : "New board", value: b || { title: "", project: "" },
      fields: [{ key: "title", label: "Name", placeholder: kind === "mood" ? "e.g. Portfolio site look" : "e.g. Engineering club ideas" }, { key: "project", label: "Belongs to", type: "select", options: [["", "No project"], ...pjs.map(p => [p.id, p.name])] }],
      validate: v => v.title.trim() ? "" : "Give it a name.",
      onSave: v => {
        if (b) S.patch("boards", b.id, { title: v.title.trim(), project: v.project || null });
        else { const nb = S.put("boards", { kind: kind || "canvas", title: v.title.trim(), project: v.project || null, at: Date.now() }); openBoard(nb.id); }
      },
      onDelete: b ? () => { const bs = bitsOf(b.id); S.remove("boards", b.id); bs.forEach(x => S.remove("bits", x.id)); closeBoard(); J.toast(`Deleted “${b.title}”`, { label: "Undo", run: () => { S.put("boards", b); bs.forEach(x => S.put("bits", x)); } }); } : null });
  }
  function openBoard(id) { ST.board = id; ST.sel = null; P.lsSet("studioBoard", id); J.render(); scrollTo(0, 0); }
  function closeBoard() { ST.board = null; ST.sel = null; cv = null; P.lsSet("studioBoard", null); J.render(); }

  /* ---------- moodboards ---------- */
  function moodView(b) {
    const bs = bitsOf(b.id).sort((x, y) => (y.at || 0) - (x.at || 0));
    const pal = b.palette || [];
    const head = P.viewHead(b.title, "A moodboard", `<button type="button" class="btn" data-act="stBack">${J.icon.left}Studio</button><button type="button" class="btn" data-act="stEdit">${J.icon.edit}Moodboard</button>`);
    return `<div class="studio">${head}
      <section class="md-pal">${pal.length ? `<p class="jn-k">Palette from the pictures <span class="tr-dim">Click a colour to copy it</span></p><div class="md-sw">${pal.map(c => `<button type="button" class="mdsw" data-act="mdCopy" data-c="${esc(c)}" style="--c:${esc(c)}"><i></i><span>${esc(c)}</span></button>`).join("")}</div>` : `<p class="tr-dim">Add pictures and Jules pulls a colour palette out of them.</p>`}</section>
      <div class="md-drop">${assets ? `<label class="btn">${J.icon.image}Add pictures<input type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple data-upload="mood"></label><span class="tr-dim">or drop them here, or paste one. Paste a hex code to add a colour.</span>` : `<span class="tr-dim">Pictures can be added when Jules is open in claude.ai.</span>`}
        <form class="md-note" autocomplete="off"><input type="text" placeholder="Add a word or a note: calm, clinical, warm light…" aria-label="Add a note" maxlength="300" id="mdNote" data-keep></form></div>
      <div class="md-wall">${bs.map(x => {
        if (x.type === "image") return `<figure class="md-it" data-bit="${esc(x.id)}"><img src="${esc(J.assetUrl(x.asset))}" alt="" loading="lazy" style="aspect-ratio:${1 / (x.ratio || .75)}">${(x.palette || []).length ? `<span class="md-chips">${x.palette.map(c => `<i style="background:${esc(c)}"></i>`).join("")}</span>` : ""}<button type="button" class="ibtn md-x" data-act="mdDrop" data-id="${esc(x.id)}" aria-label="Remove">${J.icon.close}</button></figure>`;
        if (x.type === "color") return `<figure class="md-it md-color" style="--c:${esc(x.color)}"><span>${esc(x.color)}</span><button type="button" class="ibtn md-x" data-act="mdDrop" data-id="${esc(x.id)}" aria-label="Remove">${J.icon.close}</button></figure>`;
        return `<figure class="md-it md-word"><p>${esc(x.text || "")}</p><button type="button" class="ibtn md-x" data-act="mdDrop" data-id="${esc(x.id)}" aria-label="Remove">${J.icon.close}</button></figure>`;
      }).join("")}</div></div>`;
  }
  /* A rough palette: shrink the picture, bucket its colours, keep the commonest distinct ones. */
  function paletteOf(img, n = 5) {
    try {
      const c = document.createElement("canvas"), k = 48; c.width = c.height = k;
      const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(img, 0, 0, k, k);
      const d = x.getImageData(0, 0, k, k).data, m = new Map();
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 128) continue;
        const key = (d[i] >> 4) << 8 | (d[i + 1] >> 4) << 4 | (d[i + 2] >> 4);
        const v = m.get(key) || [0, 0, 0, 0]; v[0] += d[i]; v[1] += d[i + 1]; v[2] += d[i + 2]; v[3]++; m.set(key, v);
      }
      const cs = [...m.values()].sort((a, b) => b[3] - a[3]).map(v => [v[0] / v[3], v[1] / v[3], v[2] / v[3]]);
      const out = [];
      for (const col of cs) { if (out.every(o => Math.hypot(o[0] - col[0], o[1] - col[1], o[2] - col[2]) > 48)) out.push(col); if (out.length >= n) break; }
      return out.map(([r, g, b]) => "#" + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, "0")).join(""));
    } catch (e) { return []; }
  }
  function boardPalette(b) {
    const all = bitsOf(b.id).flatMap(x => x.type === "image" ? (x.palette || []) : x.type === "color" ? [x.color] : []);
    const out = [];
    all.forEach(h => { const v = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); if (out.every(o => Math.hypot(o[0] - v[0], o[1] - v[1], o[2] - v[2]) > 40)) out.push(v); });
    return out.slice(0, 8).map(v => "#" + v.map(n => n.toString(16).padStart(2, "0")).join(""));
  }
  function moodAfter(b) {
    $$(".md-it img").forEach(img => {
      const id = img.closest("[data-bit]").dataset.bit, x = S.get("bits", id);
      if (!x || x.palette) return;
      const go = () => { const p = paletteOf(img); if (p.length) S.patch("bits", id, { palette: p }); };
      if (img.complete && img.naturalWidth) go(); else img.addEventListener("load", go, { once: true });
    });
    const pal = boardPalette(b);
    if (JSON.stringify(pal) !== JSON.stringify(b.palette || [])) S.patch("boards", b.id, { palette: pal });
  }

  /* ---------- ideas ---------- */
  const STAGES = [["spark", "Sparks", "New and unexamined"], ["warm", "Warming up", "Worth more thought"], ["project", "Became something", "Projects and boards"]];
  function ideasView() {
    const all = S.list("ideas").sort((a, b) => (b.at || 0) - (a.at || 0));
    return `<form class="id-add" autocomplete="off"><input type="text" id="ideaIn" data-keep placeholder="Throw an idea in…" aria-label="New idea" maxlength="400"><button type="submit" class="btn primary">${J.icon.plus}Keep it</button></form>
      <div class="id-cols">${STAGES.map(([k, l, sub]) => {
        const list = all.filter(i => (i.stage || "spark") === k);
        return `<section class="id-col"><h2 class="grp-h"><span>${l}</span><em>${sub}</em><span class="count tc">${list.length || ""}</span></h2>${list.map(ideaCard).join("") || `<p class="empty sm">${k === "spark" ? "Nothing yet. The best ones arrive at inconvenient times." : "Empty."}</p>`}</section>`;
      }).join("")}</div>`;
  }
  function ideaCard(i) {
    const help = ST.ideaHelp[i.id];
    const pj = i.project && S.get("projects", i.project), bd = i.board && S.get("boards", i.board);
    const age = Math.max(0, Math.round((Date.now() - (i.at || Date.now())) / 864e5));
    return `<article class="id-card">
      <p class="id-t">${esc(i.text)}</p>${i.note ? `<p class="id-n">${esc(i.note)}</p>` : ""}
      <p class="id-meta">${age === 0 ? "Today" : age === 1 ? "Yesterday" : age + " days ago"}${pj ? ` · <a class="link" href="#projects" data-act="openProject" data-id="${esc(pj.id)}">${esc(pj.name)}</a>` : ""}${bd ? ` · <button type="button" class="link" data-act="stOpen" data-id="${esc(bd.id)}">Board</button>` : ""}</p>
      ${help ? help === "busy" ? `<p class="id-help thinking"><span class="dots"><i></i><i></i><i></i></span></p>` : `<div class="id-help"><p class="mnote"><span class="mn-by">Jules</span>${esc(help)}</p><span class="row"><button type="button" class="btn sm" data-act="idKeep" data-id="${esc(i.id)}">Keep as notes</button><button type="button" class="btn sm" data-act="idDismiss" data-id="${esc(i.id)}">Dismiss</button></span></div>` : ""}
      <div class="id-acts">${(i.stage || "spark") === "spark" ? `<button type="button" class="link" data-act="idStage" data-id="${esc(i.id)}" data-s="warm">Warm it up</button>` : ""}
        ${!pj ? `<button type="button" class="link" data-act="idProject" data-id="${esc(i.id)}">Make it a project</button>` : ""}${!bd ? `<button type="button" class="link" data-act="idBoard" data-id="${esc(i.id)}">Open a board</button>` : ""}
        ${sample && !help ? `<button type="button" class="link" data-act="idAsk" data-id="${esc(i.id)}">Ask Jules</button>` : ""}
        <button type="button" class="ibtn id-x" data-act="idDrop" data-id="${esc(i.id)}" aria-label="Delete idea">${J.icon.close}</button></div></article>`;
  }
  async function askAbout(i) {
    if (!sample) return;
    ST.ideaHelp[i.id] = "busy"; J.render();
    try {
      const r = await sample.json(`You help a first-year engineering student develop his ideas. Idea: ${JSON.stringify(i.text)}${i.note ? `\nHis notes so far: ${JSON.stringify(i.note)}` : ""}\nGive three concrete next steps, each under 18 words, and one honest risk or question in under 18 words. Plain words, no hype. Reply with only JSON: {"steps":["…","…","…"],"risk":"…"}`, { modelTier: "quick", cache: { gcTime: 7 * 864e5 } });
      const steps = (Array.isArray(r && r.steps) ? r.steps : []).slice(0, 3).map(s => String(s).slice(0, 160));
      ST.ideaHelp[i.id] = steps.length ? steps.map((s, k) => `${k + 1}. ${s}`).join("  ") + (r.risk ? `  Watch out: ${String(r.risk).slice(0, 160)}` : "") : null;
    } catch (e) { ST.ideaHelp[i.id] = null; J.toast("Jules couldn't think about that one just now."); }
    J.render();
  }

  /* ---------- wiring ---------- */
  P.register("studio", {
    label: "Studio", short: "Studio", part: "body",
    icon: '<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 13.5 10 6M10 6l1.6-3.6L13.6 4.4 10 6z"/><path d="M3 4.5h4M3 7h2.5M8.5 13.5h5"/></svg>',
    render,
    after() {
      ST.redrawing = false;
      const b = ST.board && S.get("boards", ST.board);
      if (b && b.kind !== "mood") {
        if (!cv || cv.id !== b.id) cv = Object.assign({ id: b.id }, viewOf(b.id));
        apply();
        if (ST.pendingEdit) { const id = ST.pendingEdit; ST.pendingEdit = null; editNote(id); }
      } else cv = null;
      if (b && b.kind === "mood") moodAfter(b);
    },
    acts: {
      stNew: a => editBoard(null, a.dataset.kind),
      stOpen: a => { if (J.ui.view !== "studio") { ST.board = a.dataset.id; P.lsSet("studioBoard", a.dataset.id); P.go("studio"); } else openBoard(a.dataset.id); },
      stBack: () => closeBoard(),
      stEdit: () => { const b = S.get("boards", ST.board); if (b) editBoard(b, b.kind); },
      cvAdd: a => { const t = a.dataset.type; if (t === "note") { const x = addBit("note", null, { text: "", color: "paper" }); if (x) { ST.sel = x.id; ST.pendingEdit = x.id; } } else if (t === "link") editLink(null); else if (t === "task") pickTask(); },
      cvColor: a => { if (ST.sel) S.patch("bits", ST.sel, { color: a.dataset.c }); },
      cvZoom: a => { const s = $("#cvStage"), r = s.getBoundingClientRect(); zoomAt(s, r.left + r.width / 2, r.top + r.height / 2, +a.dataset.d > 0 ? 1.25 : .8); },
      cvFit: () => fit(),
      mdCopy: a => { J.copyText ? J.copyText(a.dataset.c) : navigator.clipboard.writeText(a.dataset.c); J.toast(`Copied ${a.dataset.c}`, null, 1800); },
      mdDrop: a => { const x = S.get("bits", a.dataset.id); if (!x) return; S.remove("bits", x.id); J.toast("Removed", { label: "Undo", run: () => S.put("bits", x) }); },
      idStage: a => S.patch("ideas", a.dataset.id, { stage: a.dataset.s }),
      idProject: a => { const i = S.get("ideas", a.dataset.id); if (!i) return; const p = J.act.newProject(i.text.slice(0, 60)); S.patch("projects", p.id, { notes: i.text + (i.note ? "\n\n" + i.note : "") }); S.patch("ideas", i.id, { stage: "project", project: p.id }); J.toast(`Project “${i.text.slice(0, 30)}” started`); },
      idBoard: a => { const i = S.get("ideas", a.dataset.id); if (!i) return; const b = S.put("boards", { kind: "canvas", title: i.text.slice(0, 60), project: i.project || null, at: Date.now() }); S.put("bits", { board: b.id, type: "note", x: -100, y: -60, w: 240, h: 140, text: i.text + (i.note ? "\n\n" + i.note : ""), color: "sand", at: Date.now() }); S.patch("ideas", i.id, { board: b.id, stage: i.stage === "spark" ? "warm" : i.stage }); openBoard(b.id); },
      idAsk: a => { const i = S.get("ideas", a.dataset.id); if (i) askAbout(i); },
      idKeep: a => { const i = S.get("ideas", a.dataset.id), h = ST.ideaHelp[a.dataset.id]; if (!i || !h || h === "busy") return; S.patch("ideas", i.id, { note: (i.note ? i.note + "\n\n" : "") + h }); delete ST.ideaHelp[i.id]; },
      idDismiss: a => { delete ST.ideaHelp[a.dataset.id]; J.render(); },
      idDrop: a => { const i = S.get("ideas", a.dataset.id); if (!i) return; S.remove("ideas", i.id); J.toast("Idea deleted", { label: "Undo", run: () => S.put("ideas", i) }); }
    }
  });
  document.addEventListener("submit", e => {
    if (e.target.matches(".id-add")) {
      e.preventDefault(); const inp = $("#ideaIn"), v = inp.value.trim(); if (!v) return;
      S.put("ideas", { text: v, stage: "spark", at: Date.now() }); inp.value = "";
    } else if (e.target.matches(".md-note")) {
      e.preventDefault(); const inp = $("#mdNote"), v = inp.value.trim(); if (!v || !ST.board) return;
      if (/^#?[0-9a-f]{6}$/i.test(v)) S.put("bits", { board: ST.board, type: "color", color: "#" + v.replace("#", "").toLowerCase(), at: Date.now() });
      else S.put("bits", { board: ST.board, type: "note", text: v, at: Date.now() });
      inp.value = "";
    }
  });
  /* The tabs on the Studio landing page are ordinary [data-tab] buttons; keep ST in step. */
  document.addEventListener("click", e => { const t = e.target.closest && e.target.closest('[data-tab="studioTab"]'); if (t) ST.tab = t.dataset.val; }, true);
  J.studio.summary = () => ({ ideas: S.list("ideas").filter(i => (i.stage || "spark") !== "project").slice(0, 8).map(i => i.text.slice(0, 80)), boards: S.list("boards").map(b => b.title).slice(0, 8) });
})();
