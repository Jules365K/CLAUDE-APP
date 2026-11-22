/* JULES · ui.js
   Building blocks the views share: icons, notes formatting, toasts, drag and drop,
   the task editor drawer, a general form drawer, and the command palette. */
(function () {
  "use strict";
  const J = window.J, { $, $$, esc } = J;

  /* ================= icons (16 × 16, drawn with lines) ================= */
  const I = (d, extra = "") => `<svg class="ico" viewBox="0 0 16 16" aria-hidden="true" ${extra}>${d}</svg>`;
  J.icon = {
    home: I('<path d="M2.5 7.2 8 2.8l5.5 4.4V13.5h-11z"/><path d="M6.5 13.5V9.8h3v3.7"/>'),
    tasks: I('<circle cx="8" cy="8" r="5.6"/><path d="m5.5 8.1 1.8 1.8 3.3-3.5"/>'),
    calendar: I('<rect x="2.5" y="3.5" width="11" height="10" rx="1"/><path d="M2.5 6.6h11M5.5 2v3M10.5 2v3"/>'),
    projects: I('<path d="M8 2.4 13.6 5 8 7.6 2.4 5z"/><path d="m2.4 8 5.6 2.6L13.6 8M2.4 11l5.6 2.6 5.6-2.6"/>'),
    path: I('<circle cx="3.6" cy="12.4" r="1.4"/><circle cx="12.4" cy="3.6" r="1.4"/><path d="M5 12.4h3.6a2 2 0 0 0 0-4H7.4a2 2 0 0 1 0-4H11"/>'),
    log: I('<path d="M8 14.2c2.4 0 4-1.7 4-4.1 0-2.6-2.1-3.6-2.6-6.5C7.7 4.9 6.3 6.5 6.6 8.5 5.7 8.1 5.1 7.4 5 6.6c-.7.9-1 2-1 3.4 0 2.4 1.6 4.2 4 4.2z"/>'),
    search: I('<circle cx="7" cy="7" r="4.4"/><path d="m10.4 10.4 3.2 3.2"/>'),
    gear: I('<circle cx="8" cy="8" r="2.1"/><path d="M8 1.8v2.1M8 12.1v2.1M1.8 8h2.1M12.1 8h2.1M3.6 3.6l1.5 1.5M10.9 10.9l1.5 1.5M3.6 12.4l1.5-1.5M10.9 5.1l1.5-1.5"/>'),
    plus: I('<path d="M8 3v10M3 8h10"/>'),
    left: I('<path d="m9.8 3.5-4.5 4.5 4.5 4.5"/>'),
    right: I('<path d="m6.2 3.5 4.5 4.5-4.5 4.5"/>'),
    close: I('<path d="m4 4 8 8M12 4l-8 8"/>'),
    repeat: I('<path d="M3 7.2V6a2 2 0 0 1 2-2h7.5M10.8 2.2 12.6 4l-1.8 1.8M13 8.8V10a2 2 0 0 1-2 2H3.5M5.2 13.8 3.4 12l1.8-1.8"/>'),
    grip: I('<path d="M6 4h.01M10 4h.01M6 8h.01M10 8h.01M6 12h.01M10 12h.01" stroke-width="2.2" stroke-linecap="round"/>'),
    up: I('<path d="m4 10 4-4 4 4"/>'),
    down: I('<path d="m4 6 4 4 4-4"/>'),
    edit: I('<path d="M10.6 2.9 13.1 5.4 6 12.5l-3.1.6.6-3.1z"/>'),
    star: I('<path d="M8 2.2 9.6 6.3l4.3.3-3.3 2.8 1 4.2L8 11.3 4.4 13.6l1-4.2L2.1 6.6l4.3-.3z"/>'),
    check: I('<path d="m3.5 8.3 2.9 2.9 6.1-6.4"/>'),
    ext: I('<path d="M9 3h4v4M13 3 7.5 8.5M11.5 9.5v3a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3"/>'),
    image: I('<rect x="2.5" y="3" width="11" height="10" rx="1"/><circle cx="6" cy="6.6" r="1.2"/><path d="m2.8 11.6 3.4-3.2 2.4 2.2 1.8-1.6 3.1 2.8"/>'),
    mail: I('<rect x="2" y="3.5" width="12" height="9" rx="1"/><path d="m2.5 4.2 5.5 4.6 5.5-4.6"/>'),
    film: I('<rect x="2.5" y="3" width="11" height="10" rx="1"/><path d="M5 3v10M11 3v10M2.5 6h2.5M2.5 10h2.5M11 6h2.5M11 10h2.5"/>'),
    copy: I('<rect x="5.5" y="5.5" width="8" height="8" rx="1"/><path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2"/>')
  };

  /* ================= the rocket mark (logo + "where am I" indicator) ================= */
  J.ROCKET = {
    star: ["M100 22 L105 41 L124 46 L105 51 L100 70 L95 51 L76 46 L95 41 Z"],
    command: ["M100 110 C 126 140 140 210 140 300 L 60 300 C 60 210 74 140 100 110 Z", "M84 236 H116"],
    body: ["M60 300 H140 V640 H60 Z", "M60 470 H140", "M60 560 L34 652 L60 640", "M140 560 L166 652 L140 640"],
    engines: ["M64 640 H136 V666 H64 Z", "M72 666 H88 L92 704 H68 Z", "M92 666 H108 L112 704 H88 Z", "M112 666 H128 L132 704 H108 Z"],
    exhaust: ["M76 712 C 66 770 58 830 100 892 C 142 830 134 770 124 712 Z"]
  };
  /* Generous invisible hit areas so each part of a small rocket is easy to click. */
  const HIT = { star: [40, 0, 120, 90], command: [40, 96, 120, 204], body: [10, 300, 180, 340], engines: [40, 640, 120, 72], exhaust: [40, 712, 120, 188] };
  J.PART_LABEL = { star: "The star · skills", command: "Command module · the route", body: "Body · projects", engines: "Engines · today", exhaust: "Exhaust · the launch" };
  J.rocketSVG = (cls = "", interactive = false) => `<svg class="rocket ${cls}" viewBox="0 0 200 900"${interactive ? "" : ' aria-hidden="true"'}>` +
    Object.entries(J.ROCKET).map(([k, ds]) => `<g class="rp" data-part="${k}"${interactive ? ` role="button" tabindex="0" aria-label="${J.PART_LABEL[k]}"` : ""}>` +
      (interactive ? `<rect class="hit" x="${HIT[k][0]}" y="${HIT[k][1]}" width="${HIT[k][2]}" height="${HIT[k][3]}"/>` : "") +
      `${ds.map(d => `<path d="${d}"/>`).join("")}</g>`).join("") + `</svg>`;

  /* ================= notes: a small, safe slice of Markdown ================= */
  function inline(s) {
    s = esc(s);
    s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
    s = s.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
    s = s.replace(/(^|[\s(])_([^_]+)_(?=$|[\s).,!?])/g, "$1<i>$2</i>");
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');
    return s;
  }
  /* Lines starting "- [ ]" become checkboxes; data-line lets a click tick the source text. */
  J.md = function md(src) {
    const lines = String(src || "").split("\n");
    let html = "", list = null, para = [];
    const flushPara = () => { if (para.length) { html += `<p>${para.map(inline).join("<br>")}</p>`; para = []; } };
    const closeList = () => { if (list) { html += `</${list}>`; list = null; } };
    lines.forEach((ln, i) => {
      let m;
      if (!ln.trim()) { flushPara(); closeList(); return; }
      if ((m = ln.match(/^(#{1,3})\s+(.*)$/))) { flushPara(); closeList(); html += `<h${m[1].length + 2}>${inline(m[2])}</h${m[1].length + 2}>`; return; }
      if (/^-{3,}\s*$/.test(ln)) { flushPara(); closeList(); html += "<hr>"; return; }
      if ((m = ln.match(/^\s*[-*]\s+\[( |x|X)\]\s+(.*)$/))) {
        flushPara(); if (list !== "ul") { closeList(); html += `<ul class="checks">`; list = "ul"; }
        const on = m[1].toLowerCase() === "x";
        html += `<li class="${on ? "on" : ""}"><button type="button" class="md-check" data-line="${i}" aria-pressed="${on}" aria-label="Tick"></button><span>${inline(m[2])}</span></li>`; return;
      }
      if ((m = ln.match(/^\s*[-*]\s+(.*)$/))) { flushPara(); if (list !== "ul") { closeList(); html += "<ul>"; list = "ul"; } html += `<li>${inline(m[1])}</li>`; return; }
      if ((m = ln.match(/^\s*\d+[.)]\s+(.*)$/))) { flushPara(); if (list !== "ol") { closeList(); html += "<ol>"; list = "ol"; } html += `<li>${inline(m[1])}</li>`; return; }
      closeList(); para.push(ln);
    });
    flushPara(); closeList();
    return html;
  };
  J.mdToggleLine = (src, i) => {
    const lines = String(src).split("\n");
    if (lines[i] != null) lines[i] = lines[i].replace(/\[( |x|X)\]/, m => m === "[ ]" ? "[x]" : "[ ]");
    return lines.join("\n");
  };

  /* ================= toasts ================= */
  J.toast = (msg, action, ms = 5200) => {
    const box = $("#toasts");
    const el = document.createElement("div");
    el.className = "toast";
    el.setAttribute("role", "status");
    el.innerHTML = `<span>${esc(msg)}</span>` + (action ? `<button type="button">${esc(action.label)}</button>` : "");
    box.appendChild(el);
    requestAnimationFrame(() => el.classList.add("in"));
    const kill = () => { el.classList.remove("in"); setTimeout(() => el.remove(), 300); };
    const t = setTimeout(kill, ms);
    if (action) $("button", el).addEventListener("click", () => { clearTimeout(t); kill(); action.run(); });
    while (box.children.length > 3) box.firstChild.remove();
  };

  /* ================= clipboard (with a fallback for frames that block it) ================= */
  J.copyText = async text => {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) {}
    try {
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.cssText = "position:fixed;opacity:0;top:0;left:0";
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand("copy"); ta.remove();
      return ok;
    } catch (e) { return false; }
  };

  /* ================= drag and drop =================
     Anything with data-drag='{"type":"task","id":"…"}' can be picked up (with a mouse, or by its
     grip on a touch screen). Anything with data-drop="slot|day|status|group" can receive it;
     each drop type registers what "over" shows and what "drop" does. */
  J.dnd = (() => {
    const handlers = {};
    let d = null, suppressClick = false;
    function onDown(e) {
      if (e.button !== 0) return;
      const src = e.target.closest("[data-drag]");
      if (!src || e.target.closest("button:not(.grip), input, select, textarea, a, .rz")) return;
      if (e.pointerType !== "mouse" && !e.target.closest(".grip")) return;
      const r = src.getBoundingClientRect();
      d = { src, x0: e.clientX, y0: e.clientY, started: false, over: null, payload: null, grabY: e.clientY - r.top, w: r.width };
      addEventListener("pointermove", onMove, { passive: false });
      addEventListener("pointerup", onUp);
      addEventListener("pointercancel", end);
    }
    function begin() {
      d.started = true;
      try { d.payload = JSON.parse(d.src.dataset.drag); } catch (e) { d.payload = {}; }
      d.payload.grabY = d.grabY;
      d.ghost = document.createElement("div");
      d.ghost.className = "dnd-ghost";
      d.ghost.innerHTML = `<b>${esc(d.src.dataset.dragLabel || "Task")}</b><span></span>`;
      document.body.appendChild(d.ghost);
      document.body.classList.add("is-dragging");
      d.src.classList.add("drag-src");
    }
    /* Scroll a list or timeline when the pointer rests near its edge (after a short pause,
       so passing over an edge on the way in doesn't scroll it). */
    function autoScroll(x, y) {
      const el = document.elementFromPoint(x, y);
      const sc = el && el.closest("[data-keep-scroll]");
      if (sc !== d.sc) { d.sc = sc; d.scAt = performance.now(); }
      if (sc && performance.now() - d.scAt > 350) {
        const r = sc.getBoundingClientRect();
        if (y < r.top + 36) sc.scrollTop -= 10; else if (y > r.bottom - 36) sc.scrollTop += 10;
      }
      if (y < 40) scrollBy(0, -12); else if (y > innerHeight - 40) scrollBy(0, 12);
    }
    function onMove(e) {
      if (!d) return;
      if (!d.started) { if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 6) return; begin(); }
      e.preventDefault();
      d.ghost.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + 12}px)`;
      autoScroll(e.clientX, e.clientY);
      d.ghost.style.visibility = "hidden";
      const el = document.elementFromPoint(e.clientX, e.clientY);
      d.ghost.style.visibility = "";
      const tgt = el && el.closest("[data-drop]");
      if (d.over && d.over !== tgt) { d.over.classList.remove("drop-over"); const h = handlers[d.over.dataset.drop]; if (h && h.leave) h.leave(d.over); }
      d.over = tgt;
      let label = "";
      if (tgt) {
        tgt.classList.add("drop-over");
        const h = handlers[tgt.dataset.drop];
        label = h && h.over ? (h.over(tgt, d.payload, e.clientX, e.clientY) || "") : "";
      }
      $("span", d.ghost).textContent = label;
    }
    function onUp(e) {
      if (d && d.started) {
        suppressClick = true; setTimeout(() => { suppressClick = false; }, 0);
        const tgt = d.over;
        if (tgt) { const h = handlers[tgt.dataset.drop]; if (h) { if (h.leave) h.leave(tgt); h.drop(tgt, d.payload, e.clientX, e.clientY); } }
      }
      end();
    }
    function end() {
      removeEventListener("pointermove", onMove); removeEventListener("pointerup", onUp); removeEventListener("pointercancel", end);
      if (d) {
        if (d.ghost) d.ghost.remove();
        if (d.over) d.over.classList.remove("drop-over");
        d.src.classList.remove("drag-src");
      }
      document.body.classList.remove("is-dragging");
      d = null;
    }
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("click", e => { if (suppressClick) { e.stopPropagation(); e.preventDefault(); suppressClick = false; } }, true);
    return { register: (type, h) => { handlers[type] = h; }, active: () => !!(d && d.started) };
  })();

  /* ================= overlay focus helpers ================= */
  let overlayStack = [];
  J.overlay = {
    push(name, close) { overlayStack = overlayStack.filter(o => o.name !== name); overlayStack.push({ name, close, focus: document.activeElement }); },
    pop(name) { const o = overlayStack.find(x => x.name === name); overlayStack = overlayStack.filter(x => x.name !== name); if (o && o.focus && o.focus.focus && document.contains(o.focus)) o.focus.focus({ preventScroll: true }); },
    top() { return overlayStack[overlayStack.length - 1]; },
    closeTop() { const o = overlayStack[overlayStack.length - 1]; if (o) { o.close(); return true; } return false; },
    any() { return overlayStack.length > 0; }
  };

  /* ================= general form drawer =================
     J.form.open({ eyebrow, title, fields, value, onSave, onDelete, saveLabel, note })
     field types: text, textarea, date, time, number, select, check, lines (one item per line) */
  J.form = (() => {
    let cur = null;
    function field(f, v) {
      const id = "ff-" + f.key, val = v[f.key];
      const lab = `<span class="fl">${esc(f.label)}</span>`;
      const hint = f.hint ? `<span class="fh">${esc(f.hint)}</span>` : "";
      if (f.type === "check") return `<label class="frow check" for="${id}"><input id="${id}" type="checkbox" ${val ? "checked" : ""}><span>${esc(f.label)}</span>${hint}</label>`;
      if (f.type === "textarea" || f.type === "lines") {
        const text = f.type === "lines" ? (val || []).map(f.toLine || (x => x)).join("\n") : (val || "");
        return `<label class="frow" for="${id}">${lab}<textarea id="${id}" rows="${f.rows || 4}" placeholder="${esc(f.placeholder || "")}">${esc(text)}</textarea>${hint}</label>`;
      }
      if (f.type === "select") return `<label class="frow" for="${id}">${lab}<select id="${id}">${f.options.map(([k, l]) => `<option value="${esc(k)}" ${String(val) === String(k) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>${hint}</label>`;
      if (f.type === "html") return `<div class="frow">${lab}${f.html}</div>`;
      return `<label class="frow" for="${id}">${lab}<input id="${id}" type="${f.type || "text"}" value="${esc(val == null ? "" : val)}" placeholder="${esc(f.placeholder || "")}" ${f.attrs || ""}>${hint}</label>`;
    }
    function read() {
      const out = Object.assign({}, cur.value);
      cur.fields.forEach(f => {
        const el = $("#ff-" + f.key); if (!el) return;
        if (f.type === "check") out[f.key] = el.checked;
        else if (f.type === "lines") out[f.key] = el.value.split("\n").map(s => s.trim()).filter(Boolean).map(f.fromLine || (x => x));
        else if (f.type === "number") out[f.key] = el.value === "" ? null : +el.value;
        else out[f.key] = el.value;
      });
      return out;
    }
    function open(o) {
      cur = o;
      const el = $("#form");
      el.innerHTML = `<div class="dw-scrim" data-close></div><form class="dw-panel" novalidate aria-labelledby="formTitle">
        <header class="dw-head"><span class="eyebrow-s">${esc(o.eyebrow || "")}</span><button type="button" class="ibtn" data-close aria-label="Close">${J.icon.close}</button></header>
        <h2 class="dw-h" id="formTitle">${esc(o.title || "")}</h2>
        ${o.note ? `<p class="dw-note">${o.note}</p>` : ""}
        <div class="fgrid">${o.fields.map(f => field(f, o.value || {})).join("")}</div>
        <p class="ferr" role="alert"></p>
        <footer class="dw-foot">${o.onSave ? `<button type="submit" class="btn primary">${esc(o.saveLabel || "Save")}</button>` : ""}<button type="button" class="btn" data-close>${o.onSave ? "Cancel" : "Close"}</button>${o.onDelete ? `<button type="button" class="btn danger" data-del>Delete</button>` : ""}</footer>
      </form>`;
      el.hidden = false;
      requestAnimationFrame(() => el.classList.add("open"));
      J.overlay.push("form", close);
      $$("[data-close]", el).forEach(b => b.addEventListener("click", close));
      const del = $("[data-del]", el);
      if (del) del.addEventListener("click", () => { if (del.dataset.armed) { o.onDelete(); close(); } else { del.dataset.armed = "1"; del.textContent = "Click again to delete"; } });
      $("form", el).addEventListener("submit", e => {
        e.preventDefault();
        const v = read();
        const err = o.validate ? o.validate(v) : "";
        if (err) { $(".ferr", el).textContent = err; return; }
        o.onSave(v); close();
      });
      if (o.onOpen) o.onOpen(el);
      const first = $("input:not([type=checkbox]), textarea, select", el);
      if (first) setTimeout(() => first.focus(), 60);
    }
    function close() {
      const el = $("#form");
      if (el.hidden) return;
      el.classList.remove("open");
      setTimeout(() => { if (!el.classList.contains("open")) { el.hidden = true; el.innerHTML = ""; } }, 260);
      cur = null;
      J.overlay.pop("form");
    }
    return { open, close };
  })();

  /* ================= fuzzy matching for search ================= */
  J.fuzzy = (q, text) => {
    q = q.toLowerCase().trim(); text = String(text || "").toLowerCase();
    if (!q) return 1;
    const i = text.indexOf(q);
    if (i >= 0) return 100 - Math.min(i, 50) + (i === 0 ? 20 : 0);
    let ti = 0, score = 0;
    for (const ch of q) { const f = text.indexOf(ch, ti); if (f < 0) return 0; score += f === ti ? 2 : 1; ti = f + 1; }
    return score;
  };
})();
