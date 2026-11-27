/* JULES · app.js
   The app you use every day. Read it in this order:
     1. state and small helpers
     2. actions (everything that changes a task goes through here)
     3. shared pieces: task rows, quick add, notes, the day timeline
     4. one function per view: Home, Tasks, Calendar, Projects, Flight path, Log
     5. the task editor, settings, command palette, keyboard
     6. the router, which shows a view (or the film) for the address after the #  */
(function () {
  "use strict";
  const J = window.J, { $, $$, esc } = J, S = J.store, G = J.gcal;

  /* ======================================================================
     1. STATE AND HELPERS
     ====================================================================== */
  const lsGet = (k, f) => { try { const v = JSON.parse(localStorage.getItem("jules5:ui:" + k)); return v == null ? f : v; } catch (e) { return f; } };
  const lsSet = (k, v) => { try { localStorage.setItem("jules5:ui:" + k, JSON.stringify(v)); } catch (e) {} };

  const UI = J.ui = {
    view: "home",
    tasksMode: lsGet("tasksMode", "list"),       // list | board
    tasksProject: "all",
    showDone: lsGet("showDone", false),
    calMode: lsGet("calMode", "week"),            // week | month | day
    /* On a Sunday afternoon or evening the calendar opens on the coming week: that's the one being planned. */
    calDate: J.dow(J.today()) === 6 && new Date(J._now || Date.now()).getHours() >= 12 && lsGet("calMode", "week") === "week" && innerWidth >= 760 ? J.addDays(J.today(), 1) : J.today(),
    homeDay: J.today(),
    project: null,                                // open project id
    openCourse: null,
    hero: lsGet("hero", 0),
    sel: null,                                    // keyboard-selected task id
    scrolledFor: {}                               // timelines already scrolled to "now"
  };

  const VIEWS_META = {
    home:     { label: "Home",        part: "engines", key: "1" },
    tasks:    { label: "Tasks",       part: "engines", key: "2" },
    calendar: { label: "Calendar",    part: "engines", key: "3" },
    mail:     { label: "Mail",        part: "engines", key: "4" },
    projects: { label: "Projects",    part: "body",    key: "5" },
    path:     { label: "Flight path", part: "command", key: "6" },
    log:      { label: "Flight log",  part: "exhaust", key: "7" }
  };
  const ORDER = ["home", "tasks", "calendar", "mail", "projects", "path", "log"];
  const COLORS = ["flame", "plume", "steel", "sage", "sand", "rose"];
  const STATUS = { burning: "Burning · active", fuelling: "Fuelling · getting ready", coasting: "Coasting · paused", landed: "Landed · done" };
  const STATUS_SHORT = { burning: "Burning", fuelling: "Fuelling", coasting: "Coasting", landed: "Landed" };
  const HERO = [
    { img: "hero.jpg", pos: "52% 36%" }, { img: "space.jpg", pos: "46% 40%" }, { img: "launch-tower.jpg", pos: "50% 30%" },
    { img: "n1.jpg", pos: "62% 32%" }, { img: "engines.jpg", pos: "50% 45%" }, { img: "tower.jpg", pos: "50% 55%" }
  ];
  const DURS = [15, 30, 45, 60, 90, 120, 150, 180, 240];

  const allTasks = () => S.list("tasks");
  const projects = () => S.list("projects");
  const project = id => (id && S.get("projects", id)) || null;
  const cvar = c => `var(--c-${COLORS.includes(c) ? c : "flame"})`;
  const short = (s, n = 40) => (s = String(s || "")).length > n ? s.slice(0, n - 1) + "…" : s;
  const isDone = t => t.status === "done";
  const plural = (n, w, ws) => `${n} ${n === 1 ? w : (ws || w + "s")}`;

  /* Sorting inside a day: timed tasks by time, then by priority, then by your order. */
  const byDay = (a, b) => (a.start == null) - (b.start == null) || (a.start || 0) - (b.start || 0) || (b.priority || 0) - (a.priority || 0) || (a.order || 0) - (b.order || 0);
  const byDue = (a, b) => String(a.due || "9999").localeCompare(String(b.due || "9999")) || byDay(a, b);

  /* Project progress: from its tasks; with no tasks yet, the hand-set number. */
  function progressOf(pid) {
    const ts = allTasks().filter(t => t.project === pid);
    const done = ts.filter(isDone).length;
    if (!ts.length) { const p = project(pid); return { done: 0, total: 0, pct: Math.round(((p && p.progress) || 0) * 100), manual: true }; }
    return { done, total: ts.length, pct: Math.round(done / ts.length * 100), manual: false };
  }
  const nextTaskOf = pid => allTasks().filter(t => t.project === pid && !isDone(t)).sort(byDue)[0] || null;

  function dueLabel(t) {
    if (!t.due) return "";
    const n = J.daysUntil(t.due);
    if (n < 0) return n === -1 ? "Yesterday" : J.fmtDate(t.due, { noDay: true });
    return J.relDay(t.due);
  }

  /* ======================================================================
     2. ACTIONS
     ====================================================================== */
  const A = J.act = {
    add(fields) {
      const t = Object.assign({
        title: "", status: "todo", due: null, start: null, dur: null, project: null, priority: 0,
        repeat: null, notes: "", doneAt: null, gcal: null, spawnedId: null
      }, fields, { id: J.uid("t"), createdAt: Date.now(), order: S.nextOrder("tasks") });
      return S.put("tasks", t);
    },
    update(id, part) { return S.patch("tasks", id, part); },
    setStatus(id, status) {
      const t = S.get("tasks", id);
      if (!t || t.status === status) return;
      if (status === "done") return A.complete(t);
      if (isDone(t)) return A.uncomplete(t, status);
      S.patch("tasks", id, { status });
    },
    toggle(id) { const t = S.get("tasks", id); if (t) isDone(t) ? A.uncomplete(t) : A.complete(t); },
    /* Finishing a repeating task books the next one; un-ticking takes it back. */
    complete(t) {
      const part = { status: "done", doneAt: Date.now() };
      if (t.repeat && !t.spawnedId) {
        const next = A.add({ title: t.title, due: J.nextRepeat(t.repeat, t.due), start: t.start, dur: t.dur, project: t.project, priority: t.priority, repeat: t.repeat, notes: t.notes });
        part.spawnedId = next.id;
        J.toast(`Done. Next one: ${J.relDay(next.due)}${J.daysUntil(next.due) > 1 ? " " + J.fmtDate(next.due, { noDay: true }) : ""}`);
      }
      S.patch("tasks", t.id, part);
    },
    uncomplete(t, status = "todo") {
      const part = { status, doneAt: null, spawnedId: null };
      const sp = t.spawnedId && S.get("tasks", t.spawnedId);
      if (sp && !isDone(sp)) S.remove("tasks", sp.id);
      S.patch("tasks", t.id, part);
    },
    remove(id) {
      const t = S.get("tasks", id);
      if (!t) return;
      S.remove("tasks", id);
      if (t.title.trim()) J.toast(`Deleted “${short(t.title, 32)}”`, { label: "Undo", run: () => S.put("tasks", t) });
    },
    schedule(id, due, start) {
      const t = S.get("tasks", id);
      if (!t) return;
      const part = { due };
      if (start !== undefined) part.start = start;
      if (!due) part.start = null;
      if (part.start != null && !t.dur) part.dur = 60;
      S.patch("tasks", id, part);
    },
    /* Quick add: parse the text, apply the place's defaults, save. */
    fromText(text, defaults = {}, ignore = []) {
      const r = J.parseQuick(text, { projects: projects(), ignore });
      if (!r.title) return null;
      return A.add({
        title: r.title,
        due: r.due || defaults.due || null,
        start: r.start, dur: r.dur,
        project: r.project || defaults.project || null,
        priority: r.priority, repeat: r.repeat,
        status: defaults.status || "todo"
      });
    },
    newProject(name) {
      const p = { id: J.uid("p"), name: name || "New project", status: "burning", color: COLORS[projects().length % COLORS.length], notes: "", progress: 0, order: S.nextOrder("projects"), createdAt: Date.now() };
      S.put("projects", p);
      return p;
    },
    move(col, id, dir, sameGroup) {
      const list = S.list(col).filter(x => !sameGroup || sameGroup(x));
      const i = list.findIndex(x => x.id === id), j = i + dir;
      if (i < 0 || j < 0 || j >= list.length) return;
      list.splice(j, 0, list.splice(i, 1)[0]);
      list.forEach((x, k) => { if (x.order !== k) S.patch(col, x.id, { order: k }); });
    }
  };

  /* ======================================================================
     3. SHARED PIECES
     ====================================================================== */

  /* ---------- a task row ---------- */
  function taskRow(t, o = {}) {
    const p = project(t.project), done = isDone(t);
    const late = !done && t.due && t.due < J.today();
    const meta = [];
    if (o.date !== false && t.due) meta.push(`<span class="${late ? "late" : ""}">${esc(late ? "Overdue · " + dueLabel(t) : dueLabel(t))}</span>`);
    if (t.start != null) meta.push(`<span class="tc">${J.fmtRange(t.start, t.dur)}</span>`);
    else if (t.dur) meta.push(`<span class="tc">${J.fmtDur(t.dur)}</span>`);
    if (p && o.project !== false) meta.push(`<span class="pj"><i class="sw" style="--c:${cvar(p.color)}"></i>${esc(p.name)}</span>`);
    if (t.status === "doing") meta.push(`<span class="doing">In progress</span>`);
    if (t.repeat && !done) meta.push(`<span class="rpt" title="${esc(J.REPEAT_LABEL[t.repeat])}">${J.icon.repeat}</span>`);
    if (t.gcal) meta.push(`<span class="gc" title="Sent to Google Calendar">Google</span>`);
    if (t.notes) meta.push(`<span class="nt" title="Has notes">Notes</span>`);
    const prio = t.priority ? `<span class="prio p${t.priority}" aria-label="${["", "Low", "Medium", "High"][t.priority]} priority">${"!".repeat(t.priority)}</span>` : "";
    return `<div class="trow${done ? " done" : ""}${UI.sel === t.id ? " sel" : ""}" data-task="${t.id}" data-drag='{"type":"task","id":"${t.id}"}' data-drag-label="${esc(short(t.title, 48))}" tabindex="0">` +
      `<button type="button" class="grip" tabindex="-1" aria-hidden="true">${J.icon.grip}</button>` +
      `<button type="button" class="chk" data-act="toggle" data-id="${t.id}" aria-pressed="${done}" aria-label="${done ? "Mark not done" : "Mark done"}: ${esc(t.title)}">${J.icon.check}</button>` +
      `<div class="tmain"><span class="ttl">${prio}${esc(t.title || "Untitled")}</span>${meta.length ? `<span class="tmeta">${meta.join("")}</span>` : ""}</div></div>`;
  }
  const taskList = (ts, o) => ts.length ? `<div class="tlist">${ts.map(t => taskRow(t, o)).join("")}</div>` : "";

  /* ---------- quick add ---------- */
  const qaIgnore = {};
  function quickAdd(key, o = {}) {
    return `<form class="qa" data-qa="${key}" data-due="${o.due || ""}" data-project="${o.project || ""}" autocomplete="off">` +
      `<span class="qa-plus">${J.icon.plus}</span>` +
      `<input id="qa-${key}" data-keep class="qa-in" type="text" maxlength="200" placeholder="${esc(o.placeholder || "Add a task")}" aria-label="Add a task. Dates, times, #project and !priority are understood.">` +
      `<div class="qa-chips" aria-live="polite"></div></form>`;
  }
  function qaPreview(form) {
    const input = $(".qa-in", form), box = $(".qa-chips", form), key = form.dataset.qa;
    const text = input.value;
    if (!text.trim()) { box.innerHTML = ""; form.classList.remove("has"); return; }
    const r = J.parseQuick(text, { projects: projects(), ignore: qaIgnore[key] || [] });
    let h = r.tokens.map(tk => `<span class="chip ${tk.type}"><span>${esc(tk.label)}</span><button type="button" data-ignore="${esc(tk.text)}" aria-label="Don't read “${esc(tk.text)}” as ${tk.type}">${J.icon.close}</button></span>`).join("");
    if (!r.due && form.dataset.due === "today") h += `<span class="chip ghost">Today</span>`;
    if (r.unknownProject) h += `<span class="chip warn">No project called #${esc(r.unknownProject)} <button type="button" class="link" data-newproj="${esc(r.unknownProject)}">Create it</button></span>`;
    h += `<span class="qa-hint">Enter to add</span>`;
    box.innerHTML = h;
    form.classList.add("has");
  }
  function qaSubmit(form) {
    const input = $(".qa-in", form), key = form.dataset.qa;
    const due = form.dataset.due === "today" ? J.today() : (form.dataset.due || null);
    const t = A.fromText(input.value, { due, project: form.dataset.project || null }, qaIgnore[key] || []);
    if (!t) { input.focus(); return; }
    input.value = ""; qaIgnore[key] = []; qaPreview(form);
    J.toast(`Added “${short(t.title, 30)}”${t.due ? " · " + J.relDay(t.due) : " to the inbox"}`);
  }
  document.addEventListener("input", e => { const f = e.target.closest && e.target.closest(".qa"); if (f && e.target.classList.contains("qa-in")) qaPreview(f); });
  document.addEventListener("submit", e => { const f = e.target.closest(".qa"); if (f) { e.preventDefault(); qaSubmit(f); } });
  document.addEventListener("click", e => {
    const ig = e.target.closest("[data-ignore]");
    if (ig) { const f = ig.closest(".qa"); (qaIgnore[f.dataset.qa] = qaIgnore[f.dataset.qa] || []).push(ig.dataset.ignore); qaPreview(f); $(".qa-in", f).focus(); return; }
    const np = e.target.closest("[data-newproj]");
    if (np) { const f = np.closest(".qa"); const p = A.newProject(np.dataset.newproj.replace(/[-_]/g, " ")); J.toast(`Project “${p.name}” created`); qaPreview(f); $(".qa-in", f).focus(); }
  });

  /* ---------- notes (click to edit, Markdown when read) ---------- */
  const notesSave = {};
  function notesBlock(key, text, onSave, placeholder) {
    notesSave[key] = onSave;
    return `<div class="notes" data-notes="${esc(key)}">` +
      `<div class="md" tabindex="0" role="button" aria-label="Edit notes">${J.md(text) || `<p class="ph">${esc(placeholder || "Nothing written yet. Click to write.")}</p>`}</div>` +
      `<textarea id="notes-${esc(key.replace(/[^a-z0-9]/gi, "_"))}" data-keep class="notes-ta" hidden spellcheck="true">${esc(text || "")}</textarea>` +
      `<p class="notes-help" hidden># heading · - list · - [ ] checkbox · **bold** · links work · click outside to save</p></div>`;
  }
  function notesEdit(block, on) {
    const md = $(".md", block), ta = $(".notes-ta", block), help = $(".notes-help", block);
    md.hidden = on; ta.hidden = !on; help.hidden = !on; block.classList.toggle("editing", on);
    if (on) { autoGrow(ta); ta.focus(); }
  }
  const autoGrow = ta => { ta.style.height = "auto"; ta.style.height = Math.max(120, ta.scrollHeight + 2) + "px"; };
  document.addEventListener("click", e => {
    const chk = e.target.closest(".md-check");
    if (chk) {
      const block = chk.closest(".notes"), ta = $(".notes-ta", block);
      const next = J.mdToggleLine(ta.value, +chk.dataset.line);
      ta.value = next; notesSave[block.dataset.notes](next);
      return;
    }
    const md = e.target.closest(".notes .md");
    if (md && !e.target.closest("a")) notesEdit(md.closest(".notes"), true);
  });
  document.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.matches && e.target.matches(".notes .md")) { e.preventDefault(); notesEdit(e.target.closest(".notes"), true); } });
  document.addEventListener("input", e => { if (e.target.classList && e.target.classList.contains("notes-ta")) autoGrow(e.target); });
  document.addEventListener("focusout", e => {
    if (!e.target.classList || !e.target.classList.contains("notes-ta")) return;
    const block = e.target.closest(".notes");
    const fn = notesSave[block.dataset.notes];
    if (fn) fn(e.target.value);
    notesEdit(block, false);
  });

  /* ---------- the day timeline (Home's schedule and the calendar's columns) ---------- */
  function sentIds() { const s = new Set(); allTasks().forEach(t => { if (t.gcal && t.gcal.id) s.add(t.gcal.id); }); return s; }
  function dayData(ymd, sent) {
    const evs = G.eventsOn(ymd).filter(e => !sent.has(e.id));
    const ts = allTasks().filter(t => t.due === ymd && (UI.showDone || !isDone(t) || (t.doneAt && J.ymd(new Date(t.doneAt)) === J.today())));
    return {
      allDay: evs.filter(e => e.allDay), timed: evs.filter(e => !e.allDay),
      timedTasks: ts.filter(t => t.start != null), untimed: ts.filter(t => t.start == null).sort(byDay)
    };
  }
  /* Side-by-side columns for things that overlap in time. */
  function layoutCols(items) {
    items.sort((a, b) => a.s - b.s || (b.e - b.s) - (a.e - a.s));
    let cluster = [], colsEnd = [], clusterEnd = -1;
    const finish = () => { const n = colsEnd.length; cluster.forEach(it => { it.cols = n; }); cluster = []; colsEnd = []; };
    items.forEach(it => {
      if (it.s >= clusterEnd) { finish(); clusterEnd = -1; }
      let c = colsEnd.findIndex(end => end <= it.s);
      if (c < 0) { c = colsEnd.length; colsEnd.push(0); }
      colsEnd[c] = it.e; it.col = c; cluster.push(it);
      clusterEnd = Math.max(clusterEnd, it.e);
    });
    finish();
    return items;
  }
  function hourRange(dates, sent) {
    let h0 = 6;
    dates.forEach(d => {
      const x = dayData(d, sent);
      x.timed.forEach(e => { if (!e.auto) h0 = Math.min(h0, Math.floor(e.segStart / 60)); });
      x.timedTasks.forEach(t => { h0 = Math.min(h0, Math.floor(t.start / 60)); });
    });
    return { h0: Math.max(0, h0), h1: 24 };
  }
  function timelineCol(ymd, R, pph, sent, o = {}) {
    const x = dayData(ymd, sent);
    const top = m => (Math.max(m, R.h0 * 60) - R.h0 * 60) / 60 * pph;
    const auto = x.timed.filter(e => e.auto), real = x.timed.filter(e => !e.auto);
    const items = layoutCols([
      ...real.map(e => ({ k: "ev", s: e.segStart, e: Math.max(e.segEnd, e.segStart + 15), ev: e })),
      ...x.timedTasks.map(t => ({ k: "tk", s: t.start, e: t.start + (t.dur || 30), t }))
    ]);
    let h = auto.map(e => `<div class="blk auto" style="top:${top(e.segStart)}px;height:${Math.max(14, top(e.segEnd) - top(e.segStart) - 1)}px" title="${esc(e.title)} · ${J.fmtTime(e.segStart)}–${J.fmtTime(e.segEnd % 1440 === 0 && e.segEnd ? 1440 : e.segEnd)} (Reclaim block)"><span>${esc(e.title.replace(/^[^\p{L}\p{N}]+/u, ""))}</span></div>`).join("");
    items.forEach(it => {
      const y = top(it.s), hh = Math.max(20, top(it.e) - y - 2);
      const pos = `top:${y}px;height:${hh}px;left:calc(${it.col / it.cols * 100}% + 2px);width:calc(${100 / it.cols}% - 4px)`;
      const tiny = hh < 34 ? " tiny" : "";
      if (it.k === "ev") {
        const e = it.ev;
        h += `<button type="button" class="blk ev${tiny}${e.transparent ? " free" : ""}" style="${pos};--c:var(--c-${e.color})" data-ev="${esc(e.calId)}|${esc(e.id)}" data-date="${ymd}"><b>${esc(e.title)}</b><span class="tc">${J.fmtRange(e.segStart, e.segEnd - e.segStart)}</span></button>`;
      } else {
        const t = it.t, p = project(t.project), done = isDone(t);
        h += `<div class="blk tk${tiny}${done ? " done" : ""}" style="${pos};--c:${p ? cvar(p.color) : "var(--ink)"}" data-task="${t.id}" data-drag='{"type":"task","id":"${t.id}","block":1}' data-drag-label="${esc(short(t.title, 40))}">` +
          `<button type="button" class="chk" data-act="toggle" data-id="${t.id}" aria-pressed="${done}" aria-label="${done ? "Mark not done" : "Mark done"}: ${esc(t.title)}">${J.icon.check}</button>` +
          `<b>${esc(t.title || "Untitled")}</b><span class="tc">${J.fmtRange(t.start, t.dur || 30)}${p ? " · " + esc(p.name) : ""}</span><span class="rz" data-rz="${t.id}" aria-hidden="true"></span></div>`;
      }
    });
    if (ymd === J.today()) {
      const nm = J.nowMin();
      if (nm >= R.h0 * 60) h += `<div class="now-line" style="top:${top(nm)}px"><span class="tc">${J.fmtTime(nm)}</span></div>`;
    }
    return `<div class="tl-col${o.cls ? " " + o.cls : ""}" data-drop="slot" data-date="${ymd}" data-h0="${R.h0}" data-pph="${pph}" style="height:${(R.h1 - R.h0) * pph}px;--pph:${pph}px">${h}</div>`;
  }
  const hourLabels = (R, pph) => `<div class="tl-hours" style="height:${(R.h1 - R.h0) * pph}px">` +
    Array.from({ length: R.h1 - R.h0 }, (_, i) => `<span style="top:${i * pph}px">${J.fmtHour(R.h0 + i)}</span>`).join("") + `</div>`;

  /* Drop targets */
  function minuteAt(col, y) {
    const r = col.getBoundingClientRect(), h0 = +col.dataset.h0, pph = +col.dataset.pph;
    const m = Math.round((h0 * 60 + (y - r.top) / pph * 60) / 15) * 15;
    return J.clamp(m, 0, 1440 - 15);
  }
  J.dnd.register("slot", {
    over(col, p, x, y) {
      const t = S.get("tasks", p.id); if (!t) return "";
      const m = minuteAt(col, y - (p.block ? p.grabY : 0)), dur = t.dur || 60, pph = +col.dataset.pph, h0 = +col.dataset.h0;
      let pv = $(".drop-prev", col);
      if (!pv) { pv = document.createElement("div"); pv.className = "drop-prev"; col.appendChild(pv); }
      pv.style.top = ((m - h0 * 60) / 60 * pph) + "px"; pv.style.height = (dur / 60 * pph - 2) + "px";
      pv.textContent = J.fmtRange(m, dur);
      return `${J.relDay(col.dataset.date)} · ${J.fmtRange(m, dur)}`;
    },
    leave(col) { const pv = $(".drop-prev", col); if (pv) pv.remove(); },
    drop(col, p, x, y) { A.schedule(p.id, col.dataset.date, minuteAt(col, y - (p.block ? p.grabY : 0))); }
  });
  J.dnd.register("day", {
    over(el) { return el.dataset.date ? J.fmtDate(el.dataset.date) + (el.dataset.untimed ? " · no time" : "") : "No date"; },
    drop(el, p) {
      const t = S.get("tasks", p.id); if (!t) return;
      A.schedule(p.id, el.dataset.date || null, el.dataset.untimed ? null : t.start);
    }
  });
  J.dnd.register("status", {
    over(el) { return { todo: "To do", doing: "Doing", done: "Done" }[el.dataset.status]; },
    drop(el, p) { A.setStatus(p.id, el.dataset.status); }
  });
  J.dnd.register("unsched", { over() { return "Unschedule the time"; }, drop(el, p) { A.update(p.id, { start: null }); } });

  /* Resize a task block from its bottom edge to change the duration. */
  document.addEventListener("pointerdown", e => {
    const rz = e.target.closest(".rz");
    if (!rz || e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const blk = rz.closest(".blk"), col = rz.closest(".tl-col"), t = S.get("tasks", rz.dataset.rz);
    if (!t || !col) return;
    const pph = +col.dataset.pph;
    let dur = t.dur || 30;
    const move = ev => {
      const m = minuteAt(col, ev.clientY);
      dur = Math.max(15, m - t.start);
      blk.style.height = (dur / 60 * pph - 2) + "px";
      const lab = $(".tc", blk); if (lab) lab.textContent = J.fmtRange(t.start, dur);
    };
    const up = () => { removeEventListener("pointermove", move); removeEventListener("pointerup", up); A.update(t.id, { dur }); };
    addEventListener("pointermove", move); addEventListener("pointerup", up);
  });

  /* Clicking an empty spot on a timeline makes a new task there. */
  function newTaskAt(col, y) {
    const m = minuteAt(col, y - 10);
    const t = A.add({ title: "", due: col.dataset.date, start: m, dur: 60 });
    TD.open(t.id, { focusTitle: true });
  }

  function eventDetails(calId, evId, ymd) {
    const e = G.eventsOn(ymd).find(x => x.calId === calId && x.id === evId);
    if (!e) return;
    J.form.open({
      eyebrow: "Google Calendar · " + e.calName, title: e.title, fields: [{
        key: "x", type: "html", label: "When",
        html: `<p class="dw-text">${e.allDay ? (e.startYmd === e.endYmd ? J.fmtDate(e.startYmd, { long: true }) : J.fmtDate(e.startYmd) + " – " + J.fmtDate(e.endYmd)) + " · all day" : J.fmtDate(ymd, { long: true }) + " · " + J.fmtRange(e.segStart, e.segEnd - e.segStart)}</p>` +
          (e.url ? `<p><a class="btn" href="${esc(e.url)}" target="_blank" rel="noopener noreferrer">Open in Notion Calendar ${J.icon.ext}</a></p>` : "") +
          `<p class="dw-note">Jules only reads your calendar here. Change or delete events in Google or Notion Calendar.</p>`
      }], value: {}
    });
  }

  /* ---------- small view furniture ---------- */
  const viewHead = (title, sub, right = "") => `<header class="vhead"><div><h1 class="vtitle">${esc(title)}</h1>${sub ? `<p class="vsub">${sub}</p>` : ""}</div><div class="vtools">${right}</div></header>`;
  const tabs = (name, cur, opts) => `<div class="tabs" role="tablist">${opts.map(([k, l]) => `<button type="button" role="tab" aria-selected="${cur === k}" data-tab="${name}" data-val="${k}">${esc(l)}</button>`).join("")}</div>`;
  const secHead = (t, right = "") => `<div class="shead"><h2>${esc(t)}</h2>${right}</div>`;
  function gcalNote() {
    const d = G.describe();
    if (d.tone === "ok") return "";
    return `<p class="gnote ${d.tone}">${esc(d.text)}${d.action === "approve" ? ` <button type="button" class="link" data-act="gapprove">Allow</button>` : d.action === "retry" ? ` <button type="button" class="link" data-act="gretry">Try again</button>` : ""}</p>`;
  }

  /* ======================================================================
     4. VIEWS
     ====================================================================== */
  const V = {};

  /* ---------------- HOME: the film you can work in ----------------
     One scroll, five scenes, one per part of the rocket:
       launch (exhaust) → today (engines) → projects (body) → the route (command module) → the star.
     Each scene has a photo behind it that drifts as you scroll; the rocket in the sidebar
     lights up the part you're looking at, and clicking a part jumps to its scene. */
  const SCENES = [["h-launch", "exhaust"], ["h-today", "engines"], ["h-projects", "body"], ["h-route", "command"], ["h-star", "star"]];
  UI.revealed = new Set();
  const rv = id => UI.revealed.has(id) ? " in" : "";
  const daysWord = n => n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`;

  V.home = () => {
    const today = J.today(), meta = S.meta(), all = allTasks();
    const open = all.filter(t => !isDone(t));
    const overdue = open.filter(t => t.due && t.due < today).sort(byDue);
    const todays = open.filter(t => t.due === today).sort(byDay);
    const doneToday = all.filter(t => isDone(t) && (t.due === today || (t.doneAt && J.ymd(new Date(t.doneAt)) === today))).sort((a, b) => (a.doneAt || 0) - (b.doneAt || 0));
    const tomorrow = open.filter(t => t.due === J.addDays(today, 1)).sort(byDay);
    const inbox = open.filter(t => !t.due).sort((a, b) => (b.priority || 0) - (a.priority || 0) || a.order - b.order);
    const planned = todays.reduce((s, t) => s + (t.dur || 0), 0);
    const nm = J.nowMin(), next = todays.find(t => t.start != null && t.start + (t.dur || 30) > nm);
    const hr = new Date(J._now || Date.now()).getHours();
    const greet = hr < 5 ? "Late night" : hr < 12 ? "Morning" : hr < 18 ? "Afternoon" : "Evening";
    const H = HERO[UI.hero % HERO.length];
    const cds = (meta.countdowns || []).filter(c => c.date && J.daysUntil(c.date) >= 0).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3);
    const lead = cds[0];

    let summary;
    if (todays.length) summary = `${plural(todays.length, "task")} today${planned ? `, ${J.fmtDur(planned)} planned` : ""}${next ? `. Next up: ${esc(short(next.title, 34))} at ${J.fmtTime(next.start)}` : ""}.`;
    else if (tomorrow.length) summary = `Nothing left for today. ${plural(tomorrow.length, "task")} tomorrow, starting with ${esc(short(tomorrow[0].title, 34))}${tomorrow[0].start != null ? " at " + J.fmtTime(tomorrow[0].start) : ""}.`;
    else summary = "A clear day.";

    /* 1. launch */
    let h = `<div class="cine">
    <section class="cs cs-launch${rv("h-launch")}" id="h-launch" aria-label="Today at a glance">
      <div class="cs-bg" aria-hidden="true"><img class="hero-img" src="img/${H.img}" alt="" style="object-position:${H.pos}"></div>
      <div class="cs-shade"></div>
      <div class="cs-wrap launch-in">
        <div class="launch-l">
          <p class="cs-kicker rv">${esc(J.fmtDate(today, { long: true }))} · <span id="clock">${J.fmtTime(nm)}</span></p>
          <h1 class="cs-title rv" style="--d:1">${greet}${meta.name ? ", " + esc(meta.name) : ""}</h1>
          ${briefLine()}
          <p class="cs-sub rv" style="--d:2">${summary}${overdue.length ? ` <a class="late" href="#h-today" data-act="homeScroll" data-to="h-today">${overdue.length} overdue.</a>` : ""}</p>
        </div>
        ${lead ? `<div class="launch-r rv" style="--d:3">
          <p class="count-big"><span class="num">${J.daysUntil(lead.date) || "Today"}</span>${J.daysUntil(lead.date) ? `<span class="unit">${J.daysUntil(lead.date) === 1 ? "day" : "days"}</span>` : ""}</p>
          <p class="count-what">${J.daysUntil(lead.date) ? "until " : ""}${esc(lead.label)}<span>${esc(J.fmtDate(lead.date))}</span></p>
          ${cds.slice(1).map(c => `<p class="count-more">${esc(c.label)} ${daysWord(J.daysUntil(c.date))}</p>`).join("")}
          <button type="button" class="link count-edit" data-act="settings">Edit countdowns</button>
        </div>` : `<div class="launch-r rv"><button type="button" class="link" data-act="settings">Add a countdown</button></div>`}
      </div>
      <button type="button" class="hero-swap ibtn" data-act="hero" aria-label="Change the picture" title="Change the picture">${J.icon.image}</button>
      <button type="button" class="cs-cue" data-act="homeScroll" data-to="h-today">Today ${J.icon.down}</button>
    </section>`;

    if (S.mode === "db" && S.isEmpty()) h += `<div class="cs-wrap">${emptyWelcome()}</div>`;

    /* 2. today */
    h += `<section class="cs cs-today${rv("h-today")}" id="h-today" aria-label="Today">
      <div class="cs-bg dim" aria-hidden="true"><img src="img/engines.jpg" alt=""></div>
      <div class="cs-shade heavy"></div>
      <div class="cs-wrap">
        <header class="cs-head rv"><h2>Today</h2><p>${todays.length + doneToday.length ? `${doneToday.length} of ${todays.length + doneToday.length} done` : ""}${mailLine()}</p></header>
        <div class="home-main">
          <div class="sec today rv" style="--d:1">
            ${quickAdd("home", { due: "today", placeholder: "Add to today, e.g. “Vectors 9am 1h #prep”" })}
            ${overdue.length ? `<p class="lbl late">Overdue</p>${taskList(overdue)}` : ""}
            ${todays.length ? taskList(todays, { date: false }) : (overdue.length ? "" : `<p class="empty">Nothing booked for today.</p>`)}
            ${doneToday.length ? `<p class="lbl">Done today</p>${taskList(doneToday, { date: false })}` : ""}
            ${tomorrow.length ? `<p class="lbl" data-drop="day" data-date="${J.addDays(today, 1)}">Tomorrow</p>${taskList(tomorrow, { date: false })}` : ""}
            <div class="week-block"><p class="lbl">Next 7 days</p>${weekBars()}</div>
          </div>
          <div class="sec sched rv" style="--d:2">${homeSchedule()}</div>
        </div>
      </div>
    </section>`;

    /* 3. projects */
    const ps = projects().filter(p => p.status !== "landed").slice(0, 4);
    h += `<section class="cs cs-body${rv("h-projects")}" id="h-projects" aria-label="Projects">
      <div class="cs-bg dim" aria-hidden="true"><img src="img/steel.jpg" alt=""></div>
      <div class="cs-shade heavy"></div>
      <div class="cs-wrap">
        <header class="cs-head rv"><h2>Projects</h2><a class="link" href="#projects">All projects</a></header>
        <div class="body-grid">
          <div class="pgrid home-pgrid rv" style="--d:1">${ps.map(projTile).join("") || `<p class="empty">No projects yet.</p>`}</div>
          <div class="sec inbox rv" style="--d:2" data-drop="day" data-date=""><p class="lbl">Inbox <span class="count">${inbox.length || ""}</span></p>
            ${inbox.length ? taskList(inbox.slice(0, 6), { date: false }) + (inbox.length > 6 ? `<a class="link more" href="#tasks">${inbox.length - 6} more</a>` : "") : `<p class="empty">Empty. Tasks with no date land here.</p>`}
          </div>
        </div>
      </div>
    </section>`;

    /* 4. the route */
    h += `<section class="cs cs-route${rv("h-route")}" id="h-route" aria-label="The route">
      <div class="cs-wrap">
        <header class="cs-head rv"><h2>The route</h2><a class="link" href="#path">Open the flight path</a></header>
        <div class="rv" style="--d:1">${J.strip(pathItems())}</div>
        <div class="route-next rv" style="--d:2">${upNext()}</div>
      </div>
    </section>`;

    /* 5. the star */
    const skills = S.list("skills");
    h += `<section class="cs cs-star${rv("h-star")}" id="h-star" aria-label="Where it's all going">
      <div class="cs-bg" aria-hidden="true"><img src="img/space.jpg" alt=""></div>
      <div class="cs-shade star"></div>
      <div class="cs-wrap">
        <header class="cs-head rv"><h2>Where it's all going</h2><a class="link" href="#star">All skills</a></header>
        <ol class="star-list rv" style="--d:1">${skills.slice(0, 4).map(s => `<li class="${s.goal ? "goal" : ""}"><span class="sk-eta">${esc(s.eta)}</span><b>${esc(s.name)}</b><em>${esc(s.why || s.detail)}</em></li>`).join("") || `<li class="empty">Add the skills you're aiming at on the flight path.</li>`}</ol>
        <a class="btn film-btn rv" style="--d:2" href="#film">${J.icon.film}Watch the full film</a>
      </div>
    </section></div>`;
    return h;
  };

  /* After Home is drawn: reveal scenes once, light the rocket part in view, drift the photos. */
  const HOMEFX = { io: null, raf: 0, ratios: {}, gl: null, glCanvas: null, glSrc: "", mouse: [0, 0], mouseT: [0, 0] };
  addEventListener("pointermove", e => { if (e.pointerType === "mouse") { HOMEFX.mouseT[0] = e.clientX / innerWidth * 2 - 1; HOMEFX.mouseT[1] = e.clientY / innerHeight * 2 - 1; } }, { passive: true });
  /* The launch photo gets real depth: one WebGL canvas, kept across redraws and moved into each new page. */
  function heroDepth() {
    const bg = $(".cs-launch .cs-bg");
    if (!bg || !J.depthRenderer || matchMedia("(prefers-reduced-motion: reduce)").matches) return null;
    if (!HOMEFX.glCanvas) {
      HOMEFX.glCanvas = document.createElement("canvas");
      HOMEFX.glCanvas.className = "cs-gl";
      try { HOMEFX.gl = J.depthRenderer(HOMEFX.glCanvas, .011); } catch (e) { HOMEFX.gl = null; }
    }
    if (!HOMEFX.gl) return null;
    bg.appendChild(HOMEFX.glCanvas);
    const H = HERO[UI.hero % HERO.length];
    if (HOMEFX.glSrc !== H.img) {
      HOMEFX.glSrc = H.img;
      HOMEFX.glCanvas.classList.remove("ready");
      HOMEFX.gl.setSource({ img: H.img, depth: H.img.replace(/\.jpg$/, "-depth.png") }).then(() => HOMEFX.glCanvas.classList.add("ready")).catch(() => {});
    } else if (HOMEFX.gl.ready) HOMEFX.glCanvas.classList.add("ready");
    const [fx, fy] = H.pos.split(" ").map(v => parseFloat(v) / 100);
    return { focus: [fx, fy] };
  }
  function homeAfter() {
    if (HOMEFX.io) HOMEFX.io.disconnect();
    cancelAnimationFrame(HOMEFX.raf);
    if (UI.view !== "home") return;
    const secs = SCENES.map(([id]) => document.getElementById(id)).filter(Boolean);
    HOMEFX.io = new IntersectionObserver(entries => {
      entries.forEach(en => {
        HOMEFX.ratios[en.target.id] = en.intersectionRatio;
        if (en.isIntersecting && en.intersectionRatio > .12 && !UI.revealed.has(en.target.id)) { UI.revealed.add(en.target.id); en.target.classList.add("in"); }
      });
      let best = null, bestR = 0;
      SCENES.forEach(([id, part]) => { const r = HOMEFX.ratios[id] || 0; if (r > bestR) { bestR = r; best = part; } });
      if (best) lightRocket(best);
    }, { threshold: [0, .12, .25, .5, .75, 1] });
    secs.forEach(s => HOMEFX.io.observe(s));
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { secs.forEach(s => { UI.revealed.add(s.id); s.classList.add("in"); }); return; }
    const depth = heroDepth(), launch = $("#h-launch");
    const bgs = secs.map(s => ({ s, bg: $(".cs-bg", s) })).filter(x => x.bg && !(depth && x.s.id === "h-launch"));
    const tick = now => {
      if (UI.view !== "home") return;
      const vh = innerHeight;
      if (depth && launch) {
        const r = launch.getBoundingClientRect();
        if (r.bottom > 0) {
          const m = HOMEFX.mouse, idle = !HOMEFX.mouseT[0] && !HOMEFX.mouseT[1];
          const tx = idle ? Math.sin(now * .00021) * .35 : HOMEFX.mouseT[0], ty = idle ? Math.cos(now * .00017) * .2 : HOMEFX.mouseT[1];
          m[0] += (tx - m[0]) * .045; m[1] += (ty - m[1]) * .045;
          const p = J.clamp(-r.top / Math.max(1, r.height));
          HOMEFX.gl.draw({ zoom: 1 + p * .14, focus: depth.focus, center: [.5, depth.focus[1]], mouse: m, dark: p * .25, glow: 0, time: (now / 1000) % 1000, star: null, starI: 0 });
        }
      }
      bgs.forEach(({ s, bg }) => {
        const r = s.getBoundingClientRect();
        if (r.bottom < -50 || r.top > vh + 50) return;
        const p = (vh - r.top) / (vh + r.height);               // 0 entering … 1 leaving
        bg.style.transform = `translate3d(0, ${((p - .5) * -70).toFixed(1)}px, 0) scale(${(1.08 - p * .05).toFixed(3)})`;
      });
      HOMEFX.raf = requestAnimationFrame(tick);
    };
    HOMEFX.raf = requestAnimationFrame(tick);
  }
  function lightRocket(part) {
    $$(".side-rocket .rp").forEach(g => g.classList.toggle("on", g.dataset.part === part));
    const lab = $("#rocketLabel"); if (lab && !lab.matches(":hover")) lab.textContent = J.PART_LABEL[part] || "";
  }
  function homeScrollTo(id) {
    const el = document.getElementById(id);
    if (!el) return;
    scrollTo({ top: el.getBoundingClientRect().top + scrollY - (id === "h-launch" ? 0 : 8), behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }
  /* The rocket in the sidebar: on Home it jumps between scenes; elsewhere it opens that part's view. */
  const PART_VIEW = { exhaust: "log", engines: "home", body: "projects", command: "path", star: "star" };
  function rocketGo(part) {
    if (UI.view === "home") { homeScrollTo((SCENES.find(s => s[1] === part) || [])[0]); return; }
    if (part === "engines") { UI.homeTarget = "h-today"; go("home"); return; }
    location.hash = PART_VIEW[part];
  }

  function homeSchedule() {
    const d = UI.homeDay, sent = sentIds();
    G.ensure(d, d);
    const R = hourRange([d], sent), pph = 46;
    const x = dayData(d, sent);
    const isToday = d === J.today();
    return secHead(isToday ? "Schedule" : J.fmtDate(d, { long: true }),
      `<div class="daynav"><button type="button" class="ibtn" data-act="homeday" data-step="-1" aria-label="Previous day">${J.icon.left}</button><button type="button" class="link" data-act="homeday" data-step="0">${isToday ? J.relDay(d) : "Back to today"}</button><button type="button" class="ibtn" data-act="homeday" data-step="1" aria-label="Next day">${J.icon.right}</button></div>`) +
      gcalNote() +
      (x.allDay.length || x.untimed.length ? `<div class="allday" data-drop="day" data-date="${d}" data-untimed="1">${x.allDay.map(e => `<button type="button" class="ad ev" style="--c:var(--c-${e.color})" data-ev="${esc(e.calId)}|${esc(e.id)}" data-date="${d}">${esc(e.title)}</button>`).join("")}${x.untimed.map(t => `<button type="button" class="ad tk${isDone(t) ? " done" : ""}" data-task="${t.id}" data-drag='{"type":"task","id":"${t.id}"}' data-drag-label="${esc(short(t.title, 40))}">${esc(t.title)}</button>`).join("")}</div>` : "") +
      `<div class="tl" data-keep-scroll="home-${d}" id="homeTl"><div class="tl-grid">${hourLabels(R, pph)}${timelineCol(d, R, pph, sent, { cls: "wide" })}</div></div>`;
  }
  /* The next seven days from today: how full each one is, and what got done. */
  function weekBars() {
    const days = Array.from({ length: 7 }, (_, i) => J.addDays(J.today(), i)), all = allTasks();
    const data = days.map(d => {
      const ts = all.filter(t => t.due === d);
      return { d, plan: ts.reduce((s, t) => s + (t.dur || 0), 0) / 60, done: ts.filter(isDone).reduce((s, t) => s + (t.dur || 0), 0) / 60, n: ts.length };
    });
    const max = Math.max(4, ...data.map(x => x.plan));
    return `<div class="wbars">${data.map(x => `<div class="wb${x.d === J.today() ? " today" : ""}" data-drop="day" data-date="${x.d}" title="${J.fmtDate(x.d)}: ${x.plan.toFixed(1)} h planned, ${x.done.toFixed(1)} h done">` +
      `<div class="wb-col"><i class="plan" style="height:${x.plan / max * 100}%"></i><i class="done" style="height:${x.done / max * 100}%"></i></div>` +
      `<span class="wb-d">${J.DAY[J.dow(x.d)].slice(0, 2)}</span><span class="wb-n tc">${x.plan ? x.plan.toFixed(x.plan % 1 ? 1 : 0) + " h" : ""}</span></div>`).join("")}</div>
      <p class="hint">${fuelText()}</p>`;
  }
  function fuelText() {
    const ws = J.weekStart(J.today()), we = J.addDays(ws, 6), goal = S.meta().fuelGoal || 10;
    const h = allTasks().filter(t => isDone(t) && t.doneAt && J.ymd(new Date(t.doneAt)) >= ws && J.ymd(new Date(t.doneAt)) <= we).reduce((s, t) => s + (t.dur || 0), 0) / 60;
    return `${h.toFixed(h % 1 ? 1 : 0)} of ${goal} hours done this week.`;
  }
  function upNext() {
    const today = J.today(), items = pathItems();
    const now = items.filter(x => x.kind === "period" && x.from <= today && x.to >= today);
    const next = items.filter(x => (x.kind === "event" ? x.at : x.from) > today).slice(0, 4 - Math.min(now.length, 1));
    const row = (x, isNow) => {
      const n = J.daysUntil(x.kind === "event" ? x.at : x.from);
      return `<a class="pnext${isNow ? " now" : ""}" href="#path" data-act="pathTo" data-id="${x.id}"><span class="pn-n">${isNow ? "Now" : n === 1 ? "Tomorrow" : `${n} days`}</span><b>${esc(x.title)}${x.estimate ? ' <span class="est" title="Estimated date">≈</span>' : ""}</b><em>${isNow ? periodProgress(x) : esc(fmtSpan(x))}</em></a>`;
    };
    return (now.slice(0, 1).map(x => row(x, true)).join("") + next.map(x => row(x, false)).join("")) || `<p class="empty">Nothing ahead yet.</p>`;
  }
  function emptyWelcome() {
    return `<section class="welcome"><h2>Jules is empty</h2><p>Your synced space has no data yet. Load the starter data that came with Jules, or start from a blank slate.</p>
      <div class="row">${window.JULES_SEED ? `<button type="button" class="btn primary" data-act="seed">Load starter data</button>` : ""}<a class="btn" href="#tasks">Start blank</a></div></section>`;
  }

  /* ---------------- TASKS: everything, as a list or a board ---------------- */
  V.tasks = () => {
    const pf = UI.tasksProject;
    const all = allTasks().filter(t => pf === "all" || (pf === "none" ? !t.project : t.project === pf));
    const open = all.filter(t => !isDone(t));
    const tools = tabs("tasksMode", UI.tasksMode, [["list", "List"], ["board", "Board"]]) +
      `<label class="sel"><span class="sr">Project</span><select data-ctl="tasksProject"><option value="all">All projects</option><option value="none" ${pf === "none" ? "selected" : ""}>No project</option>${projects().map(p => `<option value="${p.id}" ${pf === p.id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></label>` +
      `<label class="tog"><input type="checkbox" data-ctl="showDone" ${UI.showDone ? "checked" : ""}><span>Show done</span></label>`;
    let h = viewHead("Tasks", `${plural(open.length, "open task")}${open.filter(t => t.due && t.due < J.today()).length ? ` · <span class="late">${open.filter(t => t.due && t.due < J.today()).length} overdue</span>` : ""}`, tools);
    h += quickAdd("tasks", { project: pf !== "all" && pf !== "none" ? pf : "", placeholder: "Add a task… “Essay outline fri 2pm 1h #prep !!”, or just a title for the inbox" });
    h += UI.tasksMode === "board" ? taskBoard(all) : taskGroups(all);
    return h;
  };
  function taskGroups(all) {
    const today = J.today(), open = all.filter(t => !isDone(t));
    const groups = [];
    const late = open.filter(t => t.due && t.due < today).sort(byDue);
    if (late.length) groups.push({ title: "Overdue", cls: "late", ts: late });
    for (let i = 0; i < 7; i++) {
      const d = J.addDays(today, i), ts = open.filter(t => t.due === d).sort(byDay);
      if (ts.length || i < 2) groups.push({ title: i === 0 ? "Today" : i === 1 ? "Tomorrow" : J.DAYL[J.dow(d)], sub: J.fmtDate(d, { noDay: true }), date: d, ts, dateless: true });
    }
    const later = open.filter(t => t.due && t.due > J.addDays(today, 6)).sort(byDue);
    if (later.length) groups.push({ title: "Later", ts: later });
    groups.push({ title: "No date", sub: "Inbox", date: "", ts: open.filter(t => !t.due).sort((a, b) => (b.priority || 0) - (a.priority || 0) || a.order - b.order), drop: true });
    if (UI.showDone) groups.push({ title: "Done", sub: "Most recent first", ts: all.filter(isDone).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0)).slice(0, 40) });
    return `<div class="groups">${groups.map(g => {
      const target = g.date !== undefined ? ` data-drop="day" data-date="${g.date}"` : "";
      return `<section class="grp ${g.cls || ""}"${target}><h2 class="grp-h"><span>${esc(g.title)}</span>${g.sub ? `<em>${esc(g.sub)}</em>` : ""}<span class="count tc">${g.ts.length || ""}</span></h2>` +
        (g.ts.length ? taskList(g.ts, { date: !g.dateless }) : `<p class="empty sm">Nothing here. Drag a task in, or add one above.</p>`) + `</section>`;
    }).join("")}</div>`;
  }
  function taskBoard(all) {
    const cols = [["todo", "To do"], ["doing", "Doing"], ["done", "Done"]];
    const recent = Date.now() - 14 * 864e5;
    return `<div class="kanban">${cols.map(([k, l]) => {
      let ts = all.filter(t => t.status === k);
      ts = k === "done" ? ts.filter(t => (t.doneAt || 0) > recent).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0)) : ts.sort(byDue);
      return `<section class="bcol" data-drop="status" data-status="${k}"><h2 class="grp-h"><span>${l}</span><span class="count tc">${ts.length}</span></h2>${taskList(ts)}${!ts.length ? `<p class="empty sm">${k === "doing" ? "Drag what you're working on here." : "Empty."}</p>` : ""}</section>`;
    }).join("")}</div>`;
  }

  /* ---------------- CALENDAR: Google events and your tasks together ---------------- */
  V.calendar = () => {
    const narrow = innerWidth < 760;
    const mode = narrow && UI.calMode === "week" ? "day" : UI.calMode;
    const d = UI.calDate, ws = J.weekStart(d);
    let label;
    if (mode === "week") { const we = J.addDays(ws, 6); label = `${J.parseYmd(ws).getDate()}${ws.slice(5, 7) !== we.slice(5, 7) ? " " + J.MON[+ws.slice(5, 7) - 1] : ""} – ${J.parseYmd(we).getDate()} ${J.MON[+we.slice(5, 7) - 1]} ${we.slice(0, 4)}`; }
    else if (mode === "month") label = `${J.MONL[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}`;
    else label = J.fmtDate(d, { long: true, year: true });
    const tools = `<div class="daynav"><button type="button" class="ibtn" data-act="calstep" data-step="-1" aria-label="Back">${J.icon.left}</button><button type="button" class="btn sm" data-act="calstep" data-step="0">Today</button><button type="button" class="ibtn" data-act="calstep" data-step="1" aria-label="Forward">${J.icon.right}</button></div>` +
      tabs("calMode", mode, narrow ? [["day", "Day"], ["month", "Month"]] : [["day", "Day"], ["week", "Week"], ["month", "Month"]]) + calFilter();
    let h = viewHead("Calendar", esc(label), tools) + gcalNote();
    if (mode === "month") h += calMonth(d);
    else h += `<div class="cal-wrap">${calTray()}${calWeek(mode === "day" ? [d] : Array.from({ length: 7 }, (_, i) => J.addDays(ws, i)))}</div>`;
    return h;
  };
  function calFilter() {
    const cals = [...G.calendars.values()];
    if (!cals.length) return "";
    return `<details class="calf"><summary class="btn sm">Calendars</summary><div class="calf-menu">${cals.map(c => `<label class="tog"><input type="checkbox" data-cal="${esc(c.id)}" ${G.isHidden(c.id) ? "" : "checked"}><i class="sw" style="--c:var(--c-${c.color})"></i><span>${esc(c.name)}</span></label>`).join("")}<label class="tog"><input type="checkbox" data-calauto ${G.showAuto ? "checked" : ""}><span>Reclaim focus and lunch blocks</span></label></div></details>`;
  }
  function calTray() {
    const today = J.today(), ws = J.weekStart(UI.calDate), we = J.addDays(ws, 6);
    const open = allTasks().filter(t => !isDone(t) && t.start == null);
    const thisWeek = open.filter(t => t.due && t.due >= ws && t.due <= we).sort(byDue);
    const late = open.filter(t => t.due && t.due < today && t.due < ws).sort(byDue);
    const inbox = open.filter(t => !t.due).sort((a, b) => (b.priority || 0) - (a.priority || 0) || a.order - b.order);
    return `<aside class="tray" data-drop="unsched" aria-label="Tasks without a time"><h2 class="grp-h"><span>No time yet</span></h2>` +
      (late.length ? `<p class="lbl late">Overdue</p>${taskList(late.slice(0, 6))}` : "") +
      (thisWeek.length ? `<p class="lbl">This week</p>${taskList(thisWeek)}` : "") +
      `<p class="lbl">Inbox</p>${inbox.length ? taskList(inbox.slice(0, 12), { date: false }) : `<p class="empty sm">Empty.</p>`}` +
      `</aside>`;
  }
  function calWeek(days) {
    const sent = sentIds();
    G.ensure(days[0], days[days.length - 1]);
    const R = hourRange(days, sent), pph = 48, today = J.today();
    const head = days.map(d => `<div class="wk-day${d === today ? " today" : ""}${d < today ? " past" : ""}"><span>${J.DAY[J.dow(d)]}</span><b>${J.parseYmd(d).getDate()}</b></div>`).join("");
    const allDay = days.map(d => {
      const x = dayData(d, sent);
      return `<div class="wk-ad" data-drop="day" data-date="${d}" data-untimed="1">${x.allDay.map(e => `<button type="button" class="ad ev" style="--c:var(--c-${e.color})" data-ev="${esc(e.calId)}|${esc(e.id)}" data-date="${d}" title="${esc(e.title)}">${esc(e.title)}</button>`).join("")}` +
        x.untimed.map(t => `<button type="button" class="ad tk${isDone(t) ? " done" : ""}" data-task="${t.id}" data-drag='{"type":"task","id":"${t.id}"}' data-drag-label="${esc(short(t.title, 40))}" title="${esc(t.title)}">${esc(t.title)}</button>`).join("") + `</div>`;
    }).join("");
    return `<div class="wk" style="--days:${days.length}">
      <div class="wk-head"><div class="wk-gut"></div>${head}</div>
      <div class="wk-adrow"><div class="wk-gut lbl">All day</div>${allDay}</div>
      <div class="wk-body" data-keep-scroll="wk-${days[0]}-${days.length}" id="wkBody"><div class="tl-grid">${hourLabels(R, pph)}${days.map(d => timelineCol(d, R, pph, sent, { cls: d === today ? "today" : "" })).join("")}</div></div>
    </div>`;
  }
  function calMonth(d) {
    const m0 = J.monthStart(d), start = J.weekStart(m0), sent = sentIds(), today = J.today();
    const mEnd = J.addDays(J.ymd(new Date(+m0.slice(0, 4), +m0.slice(5, 7), 1)), -1);
    const weeks = Math.ceil((J.diffDays(start, mEnd) + 1) / 7);
    G.ensure(start, J.addDays(start, weeks * 7 - 1));
    let cells = "";
    for (let i = 0; i < weeks * 7; i++) {
      const day = J.addDays(start, i), x = dayData(day, sent);
      const items = [
        ...x.allDay.map(e => `<button type="button" class="mi ev" style="--c:var(--c-${e.color})" data-ev="${esc(e.calId)}|${esc(e.id)}" data-date="${day}">${esc(e.title)}</button>`),
        ...x.timed.filter(e => !e.auto).map(e => `<button type="button" class="mi ev" style="--c:var(--c-${e.color})" data-ev="${esc(e.calId)}|${esc(e.id)}" data-date="${day}"><span class="tc">${J.fmtTime(e.segStart)}</span> ${esc(e.title)}</button>`),
        ...[...x.timedTasks].sort(byDay).concat(x.untimed).map(t => `<button type="button" class="mi tk${isDone(t) ? " done" : ""}" data-task="${t.id}" data-drag='{"type":"task","id":"${t.id}"}' data-drag-label="${esc(short(t.title, 40))}">${t.start != null ? `<span class="tc">${J.fmtTime(t.start)}</span> ` : ""}${esc(t.title)}</button>`)
      ];
      const more = items.length > 4 ? `<button type="button" class="mi more" data-act="gotoDay" data-date="${day}">+${items.length - 3} more</button>` : "";
      cells += `<div class="mc${day.slice(0, 7) !== m0.slice(0, 7) ? " out" : ""}${day === today ? " today" : ""}" data-drop="day" data-date="${day}">` +
        `<button type="button" class="mc-n" data-act="gotoDay" data-date="${day}" aria-label="Open ${J.fmtDate(day, { long: true })}">${J.parseYmd(day).getDate()}</button>${(items.length > 4 ? items.slice(0, 3) : items).join("")}${more}</div>`;
    }
    return `<div class="month"><div class="mh">${J.DAY.map(x => `<span>${x}</span>`).join("")}</div><div class="mg" style="--weeks:${weeks}">${cells}</div></div>`;
  }

  /* ---------------- MAIL: the inbox, with Claude marking what needs a reply ---------------- */
  function mailLine() {
    const Mx = J.mail;
    if (Mx.state !== "ok") return "";
    const n = Mx.counts().reply;
    return n ? ` <a class="link mail-line" href="#mail">${plural(n, "email needs", "emails need")} a reply</a>` : "";
  }
  function mailWhen(ts) {
    if (!ts) return "";
    const d = new Date(ts), ymd = J.ymd(d);
    if (ymd === J.today()) return J.fmtTime(d.getHours() * 60 + d.getMinutes());
    if (J.diffDays(ymd, J.today()) < 7) return J.relDay(ymd);
    return J.fmtDate(ymd, { noDay: true });
  }
  function mailRow(m, reply) {
    const v = J.mail.verdict(m.id);
    return `<div class="mrow${m.unread ? " unread" : ""}" title="${esc(v && v.why ? "Claude: " + v.why : "")}">
      <div class="m-main">
        <div class="m-top"><span class="m-from">${esc(m.fromName || m.fromEmail || "Unknown")}</span><span class="m-when tc">${esc(mailWhen(m.ts))}</span></div>
        <span class="m-subj">${esc(m.subject)}</span>
        ${m.snippet ? `<span class="m-snip">${esc(short(m.snippet, 140))}</span>` : ""}
      </div>
      <div class="m-act">
        <button type="button" class="btn sm" data-act="mailTask" data-id="${esc(m.id)}">Make a task</button>
        <a class="btn sm" href="${esc(m.url)}" target="_blank" rel="noopener noreferrer">Open ${J.icon.ext}</a>
        ${v ? `<button type="button" class="link" data-act="mailFlip" data-id="${esc(m.id)}">${reply ? "Doesn't need a reply" : "Needs a reply"}</button>` : ""}
      </div>
    </div>`;
  }
  function mailToTask(id) {
    const m = J.mail.items.find(x => x.id === id);
    if (!m) return;
    const t = A.add({ title: short(`Reply to ${m.fromName || m.fromEmail}: ${m.subject}`, 120), due: J.today(), notes: `From ${m.fromName}${m.fromEmail ? " <" + m.fromEmail + ">" : ""}\n\n[Open the email](${m.url})` });
    TD.open(t.id, { focusTitle: true });
  }
  V.mail = () => {
    const Mx = J.mail, d = Mx.describe();
    Mx.ensure();
    const c = Mx.counts();
    let h = viewHead("Mail", Mx.state === "ok" ? `${plural(c.total, "recent email")} in your inbox${c.reply ? `, <b class="hl">${c.reply} need${c.reply === 1 ? "s" : ""} a reply</b>` : ""}.` : "Your inbox, with Claude marking which emails need a reply.",
      Mx.state === "ok" ? `<button type="button" class="btn" data-act="mretry">Refresh</button>` : "");
    if (d.tone !== "ok") h += `<p class="gnote ${d.tone}">${esc(d.text)}${d.action === "approve" ? ` <button type="button" class="link" data-act="mapprove">Allow</button>` : d.action === "retry" ? ` <button type="button" class="link" data-act="mretry">Try again</button>` : ""}</p>`;
    if (Mx.state === "ok" || Mx.state === "stale") {
      const reply = Mx.items.filter(m => Mx.needsReply(m));
      const rest = Mx.items.filter(m => !Mx.needsReply(m));
      if (Mx.sorting) h += `<p class="gnote busy">Claude is reading the new emails…</p>`;
      else if (c.unsorted && Mx.canSort) h += `<p class="gnote">${plural(c.unsorted, "email hasn't", "emails haven't")} been sorted yet. <button type="button" class="link" data-act="mailSort">Sort with Claude</button></p>`;
      if (Mx.sortErr && Mx.sortErr !== "cancelled") h += `<p class="gnote warn">${Mx.sortErr === "not_granted" ? "Claude wasn't allowed to sort your mail, so everything is listed together. You can allow it next time claude.ai asks." : Mx.sortErr === "rate_limited" ? "Claude is busy right now. Try sorting again in a minute." : "Sorting didn't work this time."}</p>`;
      h += `<section class="mgroup"><h2 class="grp-h"><span>Needs a reply</span><span class="count">${reply.length}</span></h2>${reply.length ? reply.map(m => mailRow(m, true)).join("") : `<p class="empty sm">${c.unsorted ? "Waiting to be sorted." : "Nothing waiting on you."}</p>`}</section>`;
      const shown = UI.mailAll ? rest : rest.slice(0, 12);
      h += `<section class="mgroup rest"><h2 class="grp-h"><span>Everything else</span><span class="count">${rest.length}</span></h2>${shown.map(m => mailRow(m, false)).join("")}${rest.length > shown.length ? `<button type="button" class="link more" data-act="mailMore">Show ${rest.length - shown.length} more</button>` : ""}</section>`;
    }
    h += `<section class="mgroup soon"><h2 class="grp-h"><span>UNSW mail</span></h2><p class="empty sm">Your student email is Outlook. When your UNSW account exists (around O-Week), connect Microsoft 365 in claude.ai and it can join this view.</p></section>`;
    h += `<p class="hint">Read only. Claude sees the sender, subject, date and preview of each new email, once.</p>`;
    return h;
  };

  /* ---------------- PROJECTS: the body of the rocket ---------------- */
  V.projects = () => {
    if (UI.project && project(UI.project)) return projectPage(project(UI.project));
    UI.project = null;
    const ps = projects();
    const groups = [["Active", ps.filter(p => p.status === "burning" || p.status === "fuelling")], ["Paused", ps.filter(p => p.status === "coasting")], ["Landed", ps.filter(p => p.status === "landed")]];
    let h = viewHead("Projects", "The body of the rocket: everything you're building alongside. Progress is worked out from each project's tasks.", `<button type="button" class="btn primary" data-act="newProject">${J.icon.plus}New project</button>`);
    groups.forEach(([title, list]) => {
      if (!list.length) return;
      h += `<section class="pgroup"><h2 class="grp-h"><span>${title}</span><span class="count tc">${list.length}</span></h2><div class="pgrid">${list.map(projTile).join("")}</div></section>`;
    });
    if (!ps.length) h += `<p class="empty">No projects yet. Make one for each thing you're building, studying or chasing; then add tasks to it.</p>`;
    return h;
  };
  function projTile(p) {
    const pr = progressOf(p.id), nx = nextTaskOf(p.id);
    return `<button type="button" class="ptile" data-act="openProject" data-id="${p.id}" style="--c:${cvar(p.color)}">
      <span class="pt-top"><span class="pt-status">${esc(STATUS_SHORT[p.status] || "")}</span><span class="tc pt-pct">${pr.pct}%</span></span>
      <b class="pt-name">${esc(p.name)}</b>
      <span class="bar"><i style="width:${pr.pct}%"></i></span>
      <span class="pt-meta">${pr.manual ? "No tasks yet" : `${pr.done} of ${pr.total} done`}</span>
      <span class="pt-next">${nx ? `<em>Next</em>${esc(short(nx.title, 52))}${nx.due ? ` · ${esc(dueLabel(nx))}` : ""}` : ""}</span>
    </button>`;
  }
  function projectPage(p) {
    const pr = progressOf(p.id), ts = allTasks().filter(t => t.project === p.id);
    const open = ts.filter(t => !isDone(t)).sort(byDue), done = ts.filter(isDone).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
    return `<a class="back link" href="#projects" data-act="closeProject">${J.icon.left}All projects</a>
      <header class="pp-head" style="--c:${cvar(p.color)}">
        <input class="pp-name" id="pp-name" data-keep value="${esc(p.name)}" aria-label="Project name" data-pfield="name" maxlength="60">
        <div class="pp-ctrl">
          <label class="sel"><span class="sr">Status</span><select data-pfield="status">${Object.entries(STATUS).map(([k, l]) => `<option value="${k}" ${p.status === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>
          <div class="swatches" role="radiogroup" aria-label="Colour">${COLORS.map(c => `<button type="button" role="radio" aria-checked="${p.color === c}" class="swb" style="--c:${cvar(c)}" data-pcolor="${c}" aria-label="${c}"></button>`).join("")}</div>
          <button type="button" class="btn danger sm" data-act="delProject">Delete project</button>
        </div>
      </header>
      <div class="pp-prog" style="--c:${cvar(p.color)}"><span class="tc big">${pr.pct}%</span><span class="bar lg"><i style="width:${pr.pct}%"></i></span>
        <span class="pp-pm">${pr.manual ? `No tasks yet, so progress is set by hand: <input type="range" min="0" max="100" step="5" value="${pr.pct}" data-pfield="progress" aria-label="Progress">` : `${pr.done} of ${pr.total} tasks done`}</span></div>
      <div class="pp-grid">
        <section class="sec">${secHead("Tasks", `<span class="count tc">${open.length} open</span>`)}
          ${quickAdd("proj-" + p.id, { project: p.id, placeholder: "Add a task to " + p.name + "…" })}
          ${open.length ? taskList(open, { project: false }) : `<p class="empty">No open tasks. What's the next move?</p>`}
          ${done.length ? `<details class="donebox"><summary class="lbl">Done · ${done.length}</summary>${taskList(done, { project: false })}</details>` : ""}
        </section>
        <section class="sec">${secHead("Notes")}${notesBlock("project:" + p.id, p.notes, v => S.patch("projects", p.id, { notes: v }), "What this project is, what done looks like, links, ideas. Click to write.")}</section>
      </div>`;
  }

  /* ---------------- FLIGHT PATH: the command module ---------------- */
  function pathItems() {
    return S.list("path").filter(x => (x.kind === "period" ? x.from && x.to : x.at)).sort((a, b) => {
      const sa = a.kind === "period" ? a.from : a.at, sb = b.kind === "period" ? b.from : b.at;
      return sa.localeCompare(sb) || (a.kind === "event" ? -1 : 1) || (a.order || 0) - (b.order || 0);
    });
  }
  J.pathItems = pathItems;
  const startOf = x => x.kind === "period" ? x.from : x.at;
  const dm = ymd => `${+ymd.slice(8, 10)} ${J.MON[+ymd.slice(5, 7) - 1]}`;
  function fmtSpan(x) {
    if (x.kind === "event") return `${dm(x.at)} ${x.at.slice(0, 4)}`;
    const sameYear = x.from.slice(0, 4) === x.to.slice(0, 4);
    return `${dm(x.from)}${sameYear ? "" : " " + x.from.slice(0, 4)} – ${dm(x.to)} ${x.to.slice(0, 4)}`;
  }
  function periodProgress(x) {
    const total = J.diffDays(x.from, x.to) + 1, gone = J.diffDays(x.from, J.today()) + 1;
    const weeks = Math.ceil(total / 7), wk = Math.ceil(gone / 7);
    return total > 21 ? `Week ${wk} of ${weeks} · ${total - gone} days left` : `Day ${gone} of ${total}`;
  }
  const stateOf = x => { const t = J.today(); if (x.kind === "event") return x.at < t ? "past" : x.at === t ? "now" : "future"; return x.to < t ? "past" : x.from <= t ? "now" : "future"; };

  /* The overview strip: the whole flight on one line. Shared with the film. */
  J.strip = function strip(items, o = {}) {
    if (!items.length) return "";
    const y0 = +startOf(items[0]).slice(0, 4);
    const y1 = Math.max(...items.map(x => +(x.kind === "period" ? x.to : x.at).slice(0, 4)));
    const n = y1 - y0 + 1;
    const pos = ymd => { const d = J.parseYmd(ymd), y = d.getFullYear(); const doy = J.diffDays(`${y}-01-01`, ymd), len = J.diffDays(`${y}-01-01`, `${y + 1}-01-01`); return ((y - y0) + doy / len) / n * 100; };
    const lanes = [];
    let segs = "", ticks = "";
    items.forEach(x => {
      const st = stateOf(x), tip = `${x.title} · ${fmtSpan(x)}${x.estimate ? " (estimated)" : ""}`;
      if (x.kind === "period") {
        const a = pos(x.from), b = pos(J.addDays(x.to, 1));
        let lane = lanes.findIndex(end => end <= a); if (lane < 0) { lane = lanes.length; lanes.push(0); } lanes[lane] = b;
        segs += `<button type="button" class="sp-seg ${st}${x.estimate ? " est" : ""}" style="left:${a}%;width:${Math.max(.35, b - a)}%;--lane:${Math.min(lane, 2)}" title="${esc(tip)}" data-act="pathTo" data-id="${x.id}"><span class="sr">${esc(tip)}</span></button>`;
      } else {
        ticks += `<button type="button" class="sp-tick ${st}${x.goal ? " goal" : ""}" style="left:${pos(x.at)}%" title="${esc(tip)}" data-act="pathTo" data-id="${x.id}"><span class="sr">${esc(tip)}</span></button>`;
      }
    });
    const t = J.today(), nowX = (+t.slice(0, 4) >= y0 && +t.slice(0, 4) <= y1) ? pos(t) : null;
    return `<div class="strip${o.cls ? " " + o.cls : ""}"><div class="sp-track">${segs}${ticks}${nowX != null ? `<span class="sp-now" style="left:${nowX}%"><em>Now</em></span>` : ""}</div>` +
      `<div class="sp-years">${Array.from({ length: n }, (_, i) => `<button type="button" class="sp-y" data-act="pathYear" data-year="${y0 + i}" style="width:${100 / n}%"><span class="tc">${y0 + i}</span></button>`).join("")}</div></div>`;
  };

  /* ---------------- FLIGHT PATH: two ways to read the route ----------------
     Planner: one row per year, months across, terms as labelled blocks.
     Chapters: one card per year, swiped sideways, everything listed inside.
     Click anything in either to see its details underneath. */
  UI.pathMode = lsGet("pathMode", innerWidth <= 820 ? "chapters" : "planner");
  const yearLabelFor = items => {
    const uniStart = (items.find(x => x.kind === "period" && (x.courses || []).length) || {}).from;
    const uy = uniStart ? +uniStart.slice(0, 4) : null;
    return y => !uy ? "" : y < uy ? "Before uni" : `Year ${y - uy + 1}`;
  };
  const yearBounds = items => {
    const y0 = +startOf(items[0]).slice(0, 4);
    const y1 = Math.max(...items.map(x => +(x.kind === "period" ? x.to : x.at).slice(0, 4)));
    return [y0, y1];
  };
  const fracOfYear = (ymd, y) => { const len = J.diffDays(`${y}-01-01`, `${y + 1}-01-01`); return J.clamp(J.diffDays(`${y}-01-01`, ymd) / len, 0, 1); };

  V.path = () => {
    const items = pathItems();
    let h = viewHead("Flight path", "From here to the degree. ≈ marks a date that's still an estimate.",
      tabs("pathMode", UI.pathMode, [["planner", "Planner"], ["chapters", "Chapters"]]) +
      `<button type="button" class="btn" data-act="addPath" data-kind="event">${J.icon.plus}Milestone</button><button type="button" class="btn" data-act="addPath" data-kind="period">${J.icon.plus}Term</button>`);
    if (!items.length) return h + `<p class="empty">Nothing on the flight path yet. Add terms, exams, trips and big milestones.</p>`;
    h += UI.pathMode === "chapters" ? pathChapters(items) : pathPlanner(items);
    const sel = UI.pathSel && S.get("path", UI.pathSel);
    h += sel ? pathDetail(sel) : `<p class="pd-hint">Select a term or milestone to see its details.</p>`;

    const skills = S.list("skills");
    h += `<section class="star-sec" id="path-star"><div class="shead"><h2>Skills you're flying toward</h2><button type="button" class="btn" data-act="addSkill">${J.icon.plus}Skill</button></div>
      <ol class="skills">${skills.map((s, i) => `<li class="skill${s.goal ? " goal" : ""}"><span class="tc sk-eta">${esc(s.eta)}</span><div><b>${esc(s.name)}</b>${s.detail ? `<em>${esc(s.detail)}</em>` : ""}${s.why ? `<p>${esc(s.why)}</p>` : ""}</div>
        <span class="rowtools"><button type="button" class="ibtn" data-act="moveSkill" data-id="${s.id}" data-dir="-1" aria-label="Move up" ${i === 0 ? "disabled" : ""}>${J.icon.up}</button><button type="button" class="ibtn" data-act="moveSkill" data-id="${s.id}" data-dir="1" aria-label="Move down" ${i === skills.length - 1 ? "disabled" : ""}>${J.icon.down}</button><button type="button" class="ibtn" data-act="editSkill" data-id="${s.id}" aria-label="Edit ${esc(s.name)}">${J.icon.edit}</button></span></li>`).join("") || `<li class="empty">No skills yet.</li>`}</ol></section>`;
    return h;
  };

  /* Planner: months across, one row per year. */
  function pathPlanner(items) {
    const [y0, y1] = yearBounds(items), today = J.today(), ty = +today.slice(0, 4), yl = yearLabelFor(items);
    /* roughly how many pixels one percent of the track is, so labels can be measured before they exist */
    const iw = innerWidth, mob = iw <= 820, pad = Math.max(18, Math.min(44, iw * .03));
    const pxPct = Math.max(2.4, (Math.min(1240, iw - (mob ? 0 : 236)) - 2 * pad - (iw <= 980 ? 74 : 112)) / 100);
    const monthsAt = y => J.MON.map((m, i) => [m, fracOfYear(`${y}-${J.pad2(i + 1)}-01`, y) * 100]);
    let h = `<div class="planner"><div class="pl-row pl-months"><div class="pl-year"></div><div class="pl-track">${monthsAt(ty).map(([m, x]) => `<span style="left:${x}%">${m}</span>`).join("")}</div></div>`;
    for (let y = y0; y <= y1; y++) {
      /* periods (cut to this year), packed into lanes */
      const segs = [];
      items.filter(x => x.kind === "period" && x.from.slice(0, 4) <= String(y) && x.to.slice(0, 4) >= String(y)).forEach(x => {
        const a = x.from.slice(0, 4) < String(y) ? 0 : fracOfYear(x.from, y) * 100;
        const b = x.to.slice(0, 4) > String(y) ? 100 : fracOfYear(J.addDays(x.to, 1), y) * 100;
        segs.push({ x, a, b, cutL: x.from.slice(0, 4) < String(y), cutR: x.to.slice(0, 4) > String(y) });
      });
      const labW = t => (18 + t.length * 6.7) / pxPct;
      /* pack the blocks themselves first; then a block too narrow for its name puts the name beside it
         when that space in its lane is free, and otherwise keeps it inside, cut short (hover shows it whole) */
      const lanes = [];
      segs.sort((p, q) => p.a - q.a).forEach(s => { let l = lanes.findIndex(e => e <= s.a + .2); if (l < 0) { l = lanes.length; lanes.push(0); } lanes[l] = s.b; s.lane = l; });
      const taken = (lane, lo, hi, me) => segs.some(o => o !== me && o.lane === lane && o.a < hi && lo < o.b) || segs.some(o => o !== me && o.out && o.lane === lane && o.lo < hi && lo < o.hi);
      segs.forEach(s => {
        const lw = labW(s.x.title);
        if (s.b - s.a >= lw) return;
        const right = s.b + lw + .6 <= 100 && !taken(s.lane, s.b, s.b + lw + .6, s);
        const left = !right && s.a - lw - .6 >= 0 && !taken(s.lane, s.a - lw - .6, s.a, s);
        if (right || left) { s.narrow = s.out = true; s.flip = left; s.lo = left ? s.a - lw - .6 : s.b; s.hi = left ? s.a : s.b + lw + .6; }
        else if ((s.b - s.a) * pxPct < 34) { s.narrow = s.out = true; s.lane = lanes.length; lanes.push(0); s.flip = s.b + lw > 99; s.lo = s.flip ? s.a - lw : s.b; s.hi = s.flip ? s.a : s.b + lw; }
      });
      /* milestones, with labels staggered so they don't collide; near the right edge the label sits on the left */
      const evs = items.filter(x => x.kind === "event" && x.at.slice(0, 4) === String(y)).map(x => ({ x, at: fracOfYear(x.at, y) * 100 }));
      const elanes = [];
      evs.sort((p, q) => p.at - q.at).forEach(e => {
        const w = Math.min(40, (20 + (e.x.title.length + (e.x.estimate ? 2 : 0)) * 6.4) / pxPct);
        e.flip = e.at + w > 99;
        const lo = e.flip ? e.at - w : e.at - .6, hi = e.flip ? e.at + .8 : e.at + w;
        let l = elanes.findIndex(end => end <= lo); if (l < 0) { l = elanes.length; elanes.push(0); } elanes[l] = hi; e.lane = l;
      });
      const ph = Math.max(1, lanes.length) * 38, eh = elanes.length * 20;
      const blocks = segs.map(s => {
        const st = stateOf(s.x), w = s.b - s.a;
        const cls = `${st}${s.x.estimate ? " est" : ""}${UI.pathSel === s.x.id ? " sel" : ""}`;
        const tip = esc(s.x.title + " · " + fmtSpan(s.x) + (s.x.estimate ? " (estimate)" : ""));
        return `<button type="button" class="pl-blk ${cls}${s.cutL ? " cut-l" : ""}${s.cutR ? " cut-r" : ""}${s.narrow ? " narrow" : ""}" style="left:${s.a}%;width:${w}%;top:${s.lane * 38}px" data-act="pathSel" data-id="${s.x.id}" title="${tip}" aria-label="${esc(s.x.title)}">` +
          (s.narrow ? "" : `<b>${esc(s.x.title)}</b>${w > 14 && (s.x.courses || []).length ? `<em>${s.x.courses.length} courses</em>` : ""}`) + `</button>` +
          (s.narrow ? `<button type="button" class="pl-blab ${cls}" style="${s.flip ? `right:${100 - s.a + .6}%` : `left:${s.b + .6}%`};top:${s.lane * 38}px" data-act="pathSel" data-id="${s.x.id}" tabindex="-1" title="${tip}">${esc(s.x.title)}</button>` : "");
      }).join("");
      const pins = evs.map(e => `<button type="button" class="pl-pin ${stateOf(e.x)}${e.x.goal ? " goal" : ""}${e.flip ? " flip" : ""}${UI.pathSel === e.x.id ? " sel" : ""}" style="left:${e.at}%;top:${ph + 8}px;--l:${e.lane}" data-act="pathSel" data-id="${e.x.id}" title="${esc(e.x.title + " · " + fmtSpan(e.x))}"><i></i><span>${esc(e.x.title)}${e.x.estimate ? " ≈" : ""}</span></button>`).join("");
      const now = y === ty ? `<span class="pl-now" style="left:${fracOfYear(today, y) * 100}%"><em>Now</em></span>` : "";
      const grid = monthsAt(y).map(([, x]) => `<i style="left:${x}%"></i>`).join("");
      h += `<div class="pl-row${y < ty ? " past" : ""}" id="year-${y}"><div class="pl-year"><b>${y}</b><em>${esc(yl(y))}</em></div><div class="pl-track" style="height:${ph + 18 + eh + 8}px"><div class="pl-grid">${grid}</div><span class="pl-axis" style="top:${ph + 12}px"></span>${blocks}${pins}${now}</div></div>`;
    }
    return h + `</div>`;
  }

  /* Chapters: one card per year. */
  function pathChapters(items) {
    const [y0, y1] = yearBounds(items), ty = +J.today().slice(0, 4), yl = yearLabelFor(items), n = y1 - y0 + 1;
    let cards = "";
    for (let y = y0; y <= y1; y++) {
      const its = items.filter(x => startOf(x).slice(0, 4) === String(y));
      const prog = y < ty ? 1 : y > ty ? 0 : fracOfYear(J.today(), y);
      cards += `<section class="ch-card${y === ty ? " current" : ""}${y < ty ? " past" : ""}" id="chap-${y}">
        <p class="ch-kick">Chapter ${y - y0 + 1} of ${n}</p>
        <h2 class="ch-year">${y}</h2><p class="ch-label">${esc(yl(y))}</p>
        <span class="bar ch-bar"><i style="width:${prog * 100}%"></i></span>
        <ol class="ch-list">${its.map(x => {
          const st = stateOf(x);
          return `<li class="ch-item ${x.kind} ${st}${UI.pathSel === x.id ? " sel" : ""}"><button type="button" class="ch-hit" data-act="pathSel" data-id="${x.id}">
            <span class="ch-date">${esc(fmtSpan(x))}${x.estimate ? " ≈" : ""}</span><b>${esc(x.title)}</b>${st === "now" && x.kind === "period" ? `<span class="ch-now">${periodProgress(x)}</span>` : ""}${x.sub ? `<em>${esc(x.sub)}</em>` : ""}</button>
            ${(x.courses || []).length ? `<div class="ch-courses">${x.courses.map(c => `<span title="${esc(c.name || "")}">${esc(c.code)}</span>`).join("")}</div>` : ""}</li>`;
        }).join("") || `<li class="empty sm">Nothing planned yet.</li>`}</ol>
      </section>`;
    }
    return `<div class="chapters"><div class="ch-nav"><button type="button" class="ibtn" data-act="chapStep" data-step="-1" aria-label="Previous year">${J.icon.left}</button>${Array.from({ length: n }, (_, i) => `<button type="button" class="ch-y${y0 + i === ty ? " cur" : ""}" data-act="pathYear" data-year="${y0 + i}">${y0 + i}</button>`).join("")}<button type="button" class="ibtn" data-act="chapStep" data-step="1" aria-label="Next year">${J.icon.right}</button></div>
      <div class="ch-track" id="chTrack" data-keep-hscroll>${cards}</div></div>`;
  }

  /* Details for whatever's selected. */
  function pathDetail(x) {
    const st = stateOf(x), today = J.today();
    let status;
    if (x.kind === "event") { const n = J.daysUntil(x.at); status = n > 0 ? (n === 1 ? "Tomorrow" : `In ${n} days`) : n === 0 ? "Today" : `${-n} days ago`; }
    else status = st === "now" ? periodProgress(x) : st === "future" ? `Starts in ${J.daysUntil(x.from)} days · ${Math.ceil((J.diffDays(x.from, x.to) + 1) / 7)} weeks long` : "Finished";
    const courses = (x.courses || []).map(c => {
      const pj = projects().find(p => p.name.startsWith(c.code));
      return `<li><b>${esc(c.code)}</b><span>${esc(c.name || "")}</span>${pj ? `<button type="button" class="link" data-act="openProject" data-id="${pj.id}">Open project</button>` : `<button type="button" class="link" data-act="courseProject" data-code="${esc(c.code)}" data-name="${esc(c.name || "")}">Start a project</button>`}</li>`;
    }).join("");
    return `<section class="pd ${st}" id="pathDetail">
      <div class="pd-main"><p class="pd-kind">${x.kind === "event" ? (x.goal ? "Goal" : "Milestone") : "Period"}${x.estimate ? " · date is an estimate" : ""}</p>
        <h2>${esc(x.title)}</h2><p class="pd-when">${esc(fmtSpan(x))}</p><p class="pd-status">${esc(status)}</p>${x.sub ? `<p class="pd-sub">${esc(x.sub)}</p>` : ""}</div>
      ${courses ? `<div class="pd-courses"><p class="lbl">Courses</p><ul>${courses}</ul></div>` : ""}
      <div class="pd-tools"><button type="button" class="btn sm" data-act="editPath" data-id="${x.id}">${J.icon.edit}Edit</button><button type="button" class="ibtn" data-act="pathSel" data-id="" aria-label="Close details">${J.icon.close}</button></div>
    </section>`;
  }

  /* ---------------- LOG: the exhaust ---------------- */
  V.log = () => {
    const entries = S.list("log");
    const groups = [];
    entries.forEach(e => { let g = groups.find(x => x.name === e.group); if (!g) groups.push(g = { name: e.group, items: [] }); g.items.push(e); });
    let h = viewHead("Flight log", "The exhaust: everything already burned. It doubles as the raw material for your CV.",
      `<button type="button" class="btn" data-act="copyCV">${J.icon.copy}Copy as CV text</button><button type="button" class="btn primary" data-act="addLog">${J.icon.plus}Entry</button>`);
    h += burnHistory();
    groups.forEach(g => {
      h += `<section class="lgroup"><h2 class="grp-h"><span>${esc(g.name)}</span><span class="count tc">${g.items.length}</span></h2><ol class="logl">` +
        g.items.map((e, i) => `<li class="le"><span class="tc le-when">${esc(e.when)}</span><div><b>${esc(e.title)}</b>${e.detail ? `<em>${esc(e.detail)}</em>` : ""}</div>
          <span class="rowtools always"><button type="button" class="ibtn${e.highlight ? " on" : ""}" data-act="hlLog" data-id="${e.id}" aria-pressed="${!!e.highlight}" title="${e.highlight ? "Shown in the film" : "Show in the film"}" aria-label="Highlight">${J.icon.star}</button>
          <button type="button" class="ibtn" data-act="moveLog" data-id="${e.id}" data-dir="-1" aria-label="Move up" ${i === 0 ? "disabled" : ""}>${J.icon.up}</button><button type="button" class="ibtn" data-act="moveLog" data-id="${e.id}" data-dir="1" aria-label="Move down" ${i === g.items.length - 1 ? "disabled" : ""}>${J.icon.down}</button>
          <button type="button" class="ibtn" data-act="editLog" data-id="${e.id}" aria-label="Edit ${esc(e.title)}">${J.icon.edit}</button></span></li>`).join("") + `</ol></section>`;
    });
    if (!entries.length) h += `<p class="empty">Nothing logged yet. Add results, awards, roles, competitions and projects as they happen.</p>`;
    return h;
  };
  function burnHistory() {
    const days = [];
    const done = allTasks().filter(t => isDone(t) && t.doneAt);
    for (let i = 0; i < 14; i++) {
      const d = J.addDays(J.today(), -i), ts = done.filter(t => J.ymd(new Date(t.doneAt)) === d);
      if (ts.length) days.push({ d, ts });
    }
    const total = days.reduce((s, x) => s + x.ts.length, 0), hrs = days.reduce((s, x) => s + x.ts.reduce((a, t) => a + (t.dur || 0), 0), 0) / 60;
    return `<section class="burns"><h2 class="grp-h"><span>Recent burns</span><em>Tasks finished in the last two weeks</em><span class="count tc">${total ? `${total} · ${hrs.toFixed(1)} h` : ""}</span></h2>` +
      (days.length ? days.map((x, i) => `<details class="bday" ${i === 0 ? "open" : ""}><summary><span>${esc(J.relDay(x.d) === "Today" || J.relDay(x.d) === "Yesterday" ? J.relDay(x.d) : J.fmtDate(x.d))}</span><span class="tc">${x.ts.length} · ${(x.ts.reduce((a, t) => a + (t.dur || 0), 0) / 60).toFixed(1)} h</span></summary>${taskList(x.ts)}</details>`).join("") : `<p class="empty sm">Nothing finished yet in the last two weeks. Tick a task and it shows up here.</p>`) + `</section>`;
  }
  function cvText() {
    const groups = {};
    S.list("log").forEach(e => { (groups[e.group] = groups[e.group] || []).push(e); });
    return Object.entries(groups).map(([g, es]) => g.toUpperCase() + "\n" + es.map(e => `${e.when ? e.when + "  " : ""}${e.title}${e.detail ? " — " + e.detail : ""}`).join("\n")).join("\n\n");
  }

  /* ======================================================================
     5. EDITORS, SETTINGS, PALETTE, KEYBOARD
     ====================================================================== */

  /* ---------------- the task editor drawer ---------------- */
  const TD = J.taskDrawer = (() => {
    let id = null, sending = false;
    const el = () => $("#drawer");
    function googleBlock(t) {
      const can = G.state !== "unavailable";
      if (!can) return `<p class="dw-note">Send to Google works when Jules is opened in claude.ai with the Notion connector.</p>`;
      if (sending) return `<button type="button" class="btn" disabled>Sending…</button>`;
      if (t.gcal) {
        const changed = t.gcal.due !== t.due || t.gcal.start !== t.start || (t.start != null && t.gcal.dur !== (t.dur || 30));
        return `<p class="dw-text">In Google Calendar since ${esc(J.fmtDate(J.ymd(new Date(t.gcal.sentAt))))}.${t.gcal.url ? ` <a class="link" href="${esc(t.gcal.url)}" target="_blank" rel="noopener noreferrer">Open ${J.icon.ext}</a>` : ""}</p>` +
          (changed ? `<p class="dw-note warn">You've changed the time since sending. Google still has the old one: edit it there, or send a new copy and delete the old one in Google.</p><button type="button" class="btn sm" data-dact="gsend">Send a new copy</button>` : "");
      }
      if (!t.due) return `<p class="dw-note">Give the task a date (and ideally a time) to send it.</p>`;
      return `<button type="button" class="btn" data-dact="gsend">Send to Google</button><p class="dw-note">Adds one event to your primary Google calendar${t.start == null ? " as an all-day event" : ` at ${J.fmtRange(t.start, t.dur || 30)}`}${t.repeat ? ". Only this occurrence is sent" : ""}. Jules never edits or deletes Google events.</p>`;
    }
    function render(focusTitle) {
      const t = S.get("tasks", id), box = el();
      if (!t) { close(); return; }
      const durOpts = [["", "None"], ...DURS.map(d => [d, J.fmtDur(d)])];
      if (t.dur && !DURS.includes(t.dur)) durOpts.push([t.dur, J.fmtDur(t.dur)]);
      box.innerHTML = `<div class="dw-scrim" data-dact="close"></div><div class="dw-panel" role="dialog" aria-modal="true" aria-label="Edit task">
        <header class="dw-head"><span class="eyebrow-s">Task${t.repeat ? " · " + esc(J.REPEAT_LABEL[t.repeat]) : ""}</span><button type="button" class="ibtn" data-dact="close" aria-label="Close (Esc)">${J.icon.close}</button></header>
        <textarea class="dw-title" id="dwTitle" rows="1" maxlength="200" placeholder="What needs doing?">${esc(t.title)}</textarea>
        <div class="seg" role="radiogroup" aria-label="Status">${[["todo", "To do"], ["doing", "Doing"], ["done", "Done"]].map(([k, l]) => `<button type="button" role="radio" aria-checked="${t.status === k}" data-dact="status" data-val="${k}">${l}</button>`).join("")}</div>
        <div class="fgrid two">
          <label class="frow"><span class="fl">Date</span><input type="date" id="dwDue" value="${t.due || ""}"></label>
          <label class="frow"><span class="fl">Time</span><input type="time" id="dwStart" step="300" value="${t.start != null ? J.hm(t.start) : ""}"></label>
          <div class="frow full quick">${[["Today", J.today()], ["Tomorrow", J.addDays(J.today(), 1)], ["Next week", J.addDays(J.weekStart(J.today()), 7)], ["No date", ""]].map(([l, v]) => `<button type="button" class="link" data-dact="due" data-val="${v}">${l}</button>`).join("")}</div>
          <label class="frow"><span class="fl">Duration</span><select id="dwDur">${durOpts.map(([v, l]) => `<option value="${v}" ${String(t.dur || "") === String(v) ? "selected" : ""}>${l}</option>`).join("")}</select></label>
          <label class="frow"><span class="fl">Repeat</span><select id="dwRepeat">${[["", "Never"], ["daily", "Every day"], ["weekdays", "Every weekday"], ["weekly", "Every week"]].map(([v, l]) => `<option value="${v}" ${String(t.repeat || "") === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
          <label class="frow"><span class="fl">Project</span><select id="dwProject"><option value="">None</option>${projects().map(p => `<option value="${p.id}" ${t.project === p.id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}<option value="__new">New project…</option></select></label>
          <div class="frow"><span class="fl">Priority</span><div class="seg sm" role="radiogroup" aria-label="Priority">${["None", "Low", "Med", "High"].map((l, i) => `<button type="button" role="radio" aria-checked="${(t.priority || 0) === i}" data-dact="prio" data-val="${i}">${l}</button>`).join("")}</div></div>
          <div class="frow full newproj" hidden><span class="fl">New project name</span><span class="inl"><input type="text" id="dwNewProj" maxlength="60" placeholder="e.g. MATH1131"><button type="button" class="btn sm" data-dact="mkproj">Create</button></span></div>
        </div>
        <div class="frow full"><span class="fl">Notes</span>${notesBlock("task:" + t.id, t.notes, v => A.update(t.id, { notes: v }), "Steps, links, details. Click to write.")}</div>
        <section class="dw-g"><span class="fl">Google Calendar</span><div id="dwGoogle">${googleBlock(t)}</div></section>
        <footer class="dw-foot"><span class="dw-meta">Added ${esc(J.fmtDate(J.ymd(new Date(t.createdAt || Date.now()))))}${t.doneAt ? " · done " + esc(J.fmtDate(J.ymd(new Date(t.doneAt)))) : ""}</span><button type="button" class="btn danger sm" data-dact="delete">Delete</button></footer>
      </div>`;
      const ti = $("#dwTitle", box);
      autoGrowTitle(ti);
      if (focusTitle) setTimeout(() => { ti.focus(); ti.setSelectionRange(ti.value.length, ti.value.length); }, 80);
    }
    const autoGrowTitle = ta => { ta.style.height = "auto"; ta.style.height = ta.scrollHeight + "px"; };
    const saveTitle = J.debounce(v => { if (id) A.update(id, { title: v.replace(/\s+/g, " ").trim() }); }, 250);

    function open(taskId, o = {}) {
      const box = el();
      id = taskId;
      render(o.focusTitle);
      box.hidden = false;
      requestAnimationFrame(() => box.classList.add("open"));
      J.overlay.push("drawer", close);
    }
    function close() {
      const box = el();
      if (!id) return;
      const ti = $("#dwTitle", box);
      const t = S.get("tasks", id);
      if (t && ti) {
        const v = ti.value.replace(/\s+/g, " ").trim();
        if (!v) S.remove("tasks", id); else if (v !== t.title) A.update(id, { title: v });
      }
      id = null;
      box.classList.remove("open");
      setTimeout(() => { if (!box.classList.contains("open")) { box.hidden = true; box.innerHTML = ""; } }, 260);
      J.overlay.pop("drawer");
    }

    document.addEventListener("input", e => {
      if (!id) return;
      if (e.target.id === "dwTitle") { autoGrowTitle(e.target); saveTitle(e.target.value); }
    });
    document.addEventListener("keydown", e => { if (id && e.target.id === "dwTitle" && e.key === "Enter") { e.preventDefault(); e.target.blur(); } });
    document.addEventListener("change", e => {
      if (!id) return;
      const t = S.get("tasks", id); if (!t) return;
      const v = e.target.value;
      if (e.target.id === "dwDue") A.update(id, v ? { due: v } : { due: null, start: null });
      else if (e.target.id === "dwStart") A.update(id, v ? { start: J.parseHM(v), due: t.due || J.today(), dur: t.dur || 60 } : { start: null });
      else if (e.target.id === "dwDur") A.update(id, { dur: v ? +v : null });
      else if (e.target.id === "dwRepeat") A.update(id, { repeat: v || null, due: v && !t.due ? J.today() : t.due });
      else if (e.target.id === "dwProject") {
        if (v === "__new") { $(".newproj", el()).hidden = false; $("#dwNewProj").focus(); }
        else A.update(id, { project: v || null });
      }
    });
    document.addEventListener("click", async e => {
      const b = e.target.closest("[data-dact]");
      if (!b || !id || !el().contains(b)) return;
      const t = S.get("tasks", id), act = b.dataset.dact;
      if (act === "close") close();
      else if (act === "status") A.setStatus(id, b.dataset.val);
      else if (act === "prio") A.update(id, { priority: +b.dataset.val });
      else if (act === "due") A.update(id, b.dataset.val ? { due: b.dataset.val } : { due: null, start: null });
      else if (act === "mkproj") { const n = $("#dwNewProj").value.trim(); if (!n) return; const p = A.newProject(n); A.update(id, { project: p.id }); }
      else if (act === "delete") { if (b.dataset.armed) { const tid = id; close(); A.remove(tid); } else { b.dataset.armed = "1"; b.textContent = "Click again to delete"; } }
      else if (act === "gsend") {
        if (sending) return;
        sending = true; b.disabled = true; b.textContent = "Sending…";
        try {
          const res = await G.sendTask(t, (project(t.project) || {}).name);
          sending = false;
          A.update(t.id, { gcal: res });
          J.toast("Sent to Google Calendar");
        } catch (err) {
          const code = err && err.code;
          const msg = {
            approval_required: "Jules needs your OK to add events. Press the button again and allow it when claude.ai asks.",
            needs_reauth: "Your Notion connection has lapsed. Reconnect Notion in claude.ai Settings → Connectors, then try again.",
            server_not_connected: "Add the Notion connector in claude.ai Settings → Connectors first.",
            not_in_manifest: "Adding events is switched off for Jules in this view.",
            no_date: "Give the task a date first.",
            unavailable: "Google Calendar only works when Jules is opened in claude.ai."
          }[code] || (code === "server_unavailable" || code === "upstream_error" || code === "tool_error"
            ? "Not sure it went through. Check Google Calendar before sending again, so you don't get a duplicate." + (err.message ? ` (${String(err.message).slice(0, 120)})` : "")
            : "Couldn't send it" + (err && err.message ? ": " + String(err.message).slice(0, 120) : "."));
          sending = false;
          const g = $("#dwGoogle");
          if (g) { g.innerHTML = googleBlock(S.get("tasks", t.id) || t); g.insertAdjacentHTML("beforeend", `<p class="dw-note warn">${esc(msg)}</p>`); }
        }
        sending = false;
      }
    });
    /* Keep the drawer in step with changes made elsewhere (but never while you're typing in it). */
    S.on(cols => {
      if (!id || !cols.has("tasks") && !cols.has("projects")) return;
      if (!S.get("tasks", id)) { close(); return; }
      const a = document.activeElement;
      if (a && el().contains(a) && a.matches("input, textarea, select")) return;
      render(false);
    });
    G.on(() => { if (id && $("#dwGoogle")) $("#dwGoogle").innerHTML = googleBlock(S.get("tasks", id)); });
    return { open, close, isOpen: () => !!id, current: () => id };
  })();

  /* ---------------- forms for the other record types ---------------- */
  function editPath(item, kind) {
    const isNew = !item;
    const x = item || { kind: kind || "event", title: "", sub: "", from: J.today(), to: J.addDays(J.today(), 30), at: J.today(), courses: [], estimate: false, goal: false };
    const fields = [
      { key: "kind", label: "Type", type: "select", options: [["event", "Milestone (one day)"], ["period", "Period (term, semester, trip…)"]] },
      { key: "title", label: "Title", placeholder: "Term 1, exam results, a trip…" },
      { key: "sub", label: "Detail", placeholder: "Optional one-liner" },
      { key: "at", label: "Date (milestone)", type: "date" },
      { key: "from", label: "Starts (period)", type: "date" },
      { key: "to", label: "Ends (period)", type: "date" },
      { key: "courses", label: "Courses", type: "lines", rows: 4, placeholder: "MATH1131 Mathematics 1A\nPHYS1121 Physics 1A", hint: "One per line: the code, a space, then the name.", toLine: c => `${c.code} ${c.name || ""}`.trim(), fromLine: l => { const [code, ...r] = l.split(/\s+/); return { code: code.toUpperCase(), name: r.join(" ") }; } },
      { key: "estimate", label: "This date is an estimate (shows ≈)", type: "check" },
      { key: "goal", label: "This is a goal (marked at the end of the flight)", type: "check" }
    ];
    J.form.open({
      eyebrow: "Flight path", title: isNew ? "Add to the flight path" : "Edit " + x.title, fields, value: x,
      onOpen(box) {
        const sync = () => { const k = $("#ff-kind", box).value; ["at"].forEach(f => $("#ff-" + f, box).closest(".frow").hidden = k !== "event"); ["from", "to", "courses"].forEach(f => $("#ff-" + f, box).closest(".frow").hidden = k !== "period"); };
        $("#ff-kind", box).addEventListener("change", sync); sync();
      },
      validate(v) {
        if (!v.title.trim()) return "Give it a title.";
        if (v.kind === "event" && !J.isValidYmd(v.at)) return "Pick a date.";
        if (v.kind === "period" && (!J.isValidYmd(v.from) || !J.isValidYmd(v.to))) return "Pick both dates.";
        if (v.kind === "period" && v.to < v.from) return "The end is before the start.";
        return "";
      },
      onSave(v) {
        const rec = Object.assign({}, v, { title: v.title.trim(), sub: (v.sub || "").trim() });
        if (rec.kind === "event") { rec.from = null; rec.to = null; rec.courses = []; } else rec.at = null;
        if (isNew) { rec.id = J.uid("m"); rec.order = S.nextOrder("path"); }
        S.put("path", rec);
        J.toast(isNew ? "Added to the flight path" : "Saved");
      },
      onDelete: isNew ? null : () => { S.remove("path", x.id); J.toast(`Removed “${short(x.title, 30)}”`, { label: "Undo", run: () => S.put("path", x) }); }
    });
  }
  function editSkill(s) {
    const isNew = !s;
    J.form.open({
      eyebrow: "The star", title: isNew ? "Add a skill" : "Edit " + s.name, value: s || { name: "", detail: "", eta: "", why: "", goal: false },
      fields: [{ key: "name", label: "Skill", placeholder: "CAD fluency" }, { key: "detail", label: "How you'll get it", placeholder: "Onshape tutorials, then MMAN1130" }, { key: "eta", label: "How far out", placeholder: "~3 months, Term 1, Year 3…" }, { key: "why", label: "Why it matters", type: "textarea", rows: 3 }, { key: "goal", label: "This is the end goal", type: "check" }],
      validate: v => v.name.trim() ? "" : "Name the skill.",
      onSave(v) { S.put("skills", Object.assign({}, v, isNew ? { id: J.uid("s"), order: S.nextOrder("skills") } : {})); },
      onDelete: isNew ? null : () => { S.remove("skills", s.id); J.toast(`Removed “${short(s.name, 30)}”`, { label: "Undo", run: () => S.put("skills", s) }); }
    });
  }
  function editLog(e) {
    const isNew = !e, groups = [...new Set(S.list("log").map(x => x.group))];
    J.form.open({
      eyebrow: "Flight log", title: isNew ? "Log an achievement" : "Edit entry", value: e || { group: groups[0] || "Academic", when: String(new Date().getFullYear()), title: "", detail: "", highlight: false },
      fields: [{ key: "title", label: "What", placeholder: "Won a design competition" }, { key: "detail", label: "Detail", placeholder: "Where, with whom, the result" }, { key: "when", label: "When", placeholder: "2026, or 3 yrs, or Ongoing" },
        { key: "group", label: "Group", placeholder: "Academic", hint: groups.length ? "Existing: " + groups.join(", ") : "" }, { key: "highlight", label: "Show it in the film", type: "check" }],
      validate: v => v.title.trim() ? "" : "Say what it was.",
      onSave(v) { v.group = (v.group || "Other").trim(); S.put("log", Object.assign({}, v, isNew ? { id: J.uid("l"), order: S.nextOrder("log") } : {})); },
      onDelete: isNew ? null : () => { S.remove("log", e.id); J.toast(`Removed “${short(e.title, 30)}”`, { label: "Undo", run: () => S.put("log", e) }); }
    });
  }
  function connStatus() {
    const row = (name, ok, text) => `<li><b>${name}</b><span class="${ok ? "ok" : ""}">${esc(text)}</span></li>`;
    const g = G.describe(), m = J.mail.describe(), sp = J.spotify || {}, ju = J.jules;
    return `<ul class="conn">` +
      row("Google Calendar", g.tone === "ok", g.tone === "ok" ? "Connected through Notion" : g.text) +
      row("Gmail", m.tone === "ok", m.tone === "ok" ? "Connected" : m.text) +
      row("Spotify", sp.state === "ok" || sp.state === "idle", sp.state === "ok" ? "Connected · playing" : sp.state === "idle" ? "Connected · nothing playing" : sp.state === "unavailable" ? "Works when Jules is opened in claude.ai or installed" : "Add the Spotify connector in claude.ai to show what's playing") +
      row("Claude", ju && ju.canTalk(), ju && ju.canTalk() ? "Jules can talk" : "Works when Jules is opened in claude.ai or installed") +
      row("Voice", ju && ju.canSpeak(), ju && ju.canSpeak() ? "Available" : "Not available here (Safari and phones can't speak)") + `</ul>`;
  }
  const pw = st => ({ granted: "on", prompt: "not set up", denied: "off", unavailable: "unavailable" })[st] || "off";
  function desktopBlock() {
    const D = J.desktop || {};
    if (D.mode === "app") return D.needsSetup() ? `<p class="fh">Jules can remind you before things start, sit in your menu bar, and come up with Cmd/Ctrl+Shift+J.</p><button type="button" class="btn sm primary" id="dkPerms">Allow reminders, shortcut and menu bar</button>`
      : `<p class="fh">Installed. Reminders ${pw(D.perms.notifications)} · shortcut ${pw(D.perms.shortcuts)} · menu bar ${pw(D.perms["menu-bar"])}.</p><button type="button" class="btn sm" id="dkManage">Manage permissions</button>`;
    if (D.install === "available") return `<p class="fh">Give Jules its own window and icon on this computer.</p><button type="button" class="btn sm primary" id="dkInstall">Install Jules as an app</button>`;
    if (D.install === "installed") return `<p class="fh">Jules is installed on this computer. Open it from your Applications folder or Start menu.</p>`;
    return `<p class="fh">In the Claude desktop app for Mac or Windows, open Jules and choose “Install as app” from its menu.</p>`;
  }
  function openSettings() {
    const m = S.meta(), vp = J.jules ? J.jules.prefs() : {};
    J.form.open({
      eyebrow: "Settings", title: "Jules", value: Object.assign({}, m, { voiceOn: vp.on, voiceName: vp.name, voiceRate: String(vp.rate || 1), briefings: vp.briefings, nudges: vp.nudges, nudgeVoice: vp.nudgeVoice }),
      note: S.mode === "db" ? "Everything syncs through this artifact's private storage in claude.ai." : "Everything is saved in this browser only. Open Jules in claude.ai to sync across devices.",
      fields: [
        { key: "name", label: "Your name", placeholder: "For the greeting" },
        { key: "fuelGoal", label: "Weekly goal (hours of tasks done)", type: "number", attrs: 'min="1" max="80" step="1"' },
        { key: "countdowns", label: "Countdowns", type: "lines", rows: 4, placeholder: "2027-02-15 Term 1", hint: "One per line: the date (YYYY-MM-DD), a space, then the label. Past ones hide themselves.",
          toLine: c => `${c.date} ${c.label}`, fromLine: l => { const [date, ...r] = l.split(/\s+/); return { date, label: r.join(" ") || "Countdown" }; } },
        { key: "voiceOn", label: "Jules speaks out loud", type: "check" },
        { key: "voiceName", label: "Voice", type: "select", options: (J.jules ? J.jules.VOICES : [["buttery", "Buttery"]]) },
        { key: "voiceRate", label: "Speaking speed", type: "select", options: [["0.9", "Unhurried"], ["1", "Normal"], ["1.1", "Brisk"], ["1.2", "Quick"]] },
        { key: "voiceTest", label: "", type: "html", html: `<button type="button" class="btn sm" id="vTest">Hear this voice</button>` },
        { key: "briefings", label: "Prepare a morning briefing", type: "check" },
        { key: "nudges", label: "Heads-ups ten minutes before tasks and events", type: "check" },
        { key: "nudgeVoice", label: "Say heads-ups out loud", type: "check" },
        { key: "desk", label: "Desktop app", type: "html", html: desktopBlock() },
        { key: "conn", label: "Connections", type: "html", html: connStatus() },
        { key: "backup", label: "Backup", type: "html", html: `<div class="row"><button type="button" class="btn sm" id="bkCopy">${J.icon.copy}Copy everything as text</button><button type="button" class="btn sm" id="bkRestore">Restore from a copy…</button></div><p class="fh">Paste the copy somewhere safe (a note, an email to yourself) now and then.</p>` }
      ],
      validate(v) { const bad = (v.countdowns || []).find(c => !J.isValidYmd(c.date)); return bad ? `“${bad.date}” isn't a date. Use YYYY-MM-DD.` : ""; },
      onSave(v) {
        S.put("meta", Object.assign({}, S.meta(), { id: "app", name: (v.name || "").trim(), fuelGoal: Math.max(1, +v.fuelGoal || 10), countdowns: v.countdowns,
          voice: Object.assign(J.jules ? J.jules.prefs() : {}, { on: !!v.voiceOn, name: v.voiceName, rate: +v.voiceRate || 1, briefings: !!v.briefings, nudges: !!v.nudges, nudgeVoice: !!v.nudgeVoice }) }));
        J.toast("Settings saved");
      },
      onOpen(box) {
        $("#bkCopy", box).addEventListener("click", async () => {
          const data = { app: "Jules", version: 5, at: new Date().toISOString() };
          ["tasks", "projects", "path", "skills", "log", "meta"].forEach(c => { data[c] = S.list(c); });
          const ok = await J.copyText(JSON.stringify(data));
          J.toast(ok ? "Copied. Paste it somewhere safe." : "Your browser blocked copying here.");
        });
        $("#bkRestore", box).addEventListener("click", () => setTimeout(restoreForm, 280));
        const vt = $("#vTest", box);
        if (vt) vt.addEventListener("click", () => { if (!J.jules || !J.jules.canSpeak()) { J.toast("Voice isn't available here."); return; } const was = J.jules.prefs(); const tmp = { on: true, name: $("#ff-voiceName", box).value, rate: +$("#ff-voiceRate", box).value }; J.jules.stop(); window.claude.use("tts").then(t => t && t.speak("Good evening, sir. Everything is in hand, more or less.", { voice: tmp.name, rate: tmp.rate })).catch(() => {}); });
        const dp = $("#dkPerms", box); if (dp) dp.addEventListener("click", () => J.desktop.askPermissions().then(() => { J.form.close(); setTimeout(openSettings, 300); }));
        const dm = $("#dkManage", box); if (dm) dm.addEventListener("click", () => J.desktop.managePermissions());
        const di = $("#dkInstall", box); if (di) di.addEventListener("click", () => J.desktop.requestInstall());
      }
    });
  }
  function restoreForm() {
    J.form.open({
      eyebrow: "Settings", title: "Restore from a copy", value: { text: "" }, saveLabel: "Restore",
      note: "Paste a copy made with “Copy everything as text”. Records with the same id are replaced; nothing else is deleted.",
      fields: [{ key: "text", label: "Copy", type: "textarea", rows: 8 }],
      validate(v) { try { const d = JSON.parse(v.text); return d && d.app === "Jules" ? "" : "That doesn't look like a Jules copy."; } catch (e) { return "That isn't valid. Paste the whole copy."; } },
      onSave(v) { const d = JSON.parse(v.text); let n = 0; ["tasks", "projects", "path", "skills", "log", "meta"].forEach(c => (d[c] || []).forEach(r => { if (r && r.id) { S.put(c, r); n++; } })); J.toast(`Restored ${n} records`); }
    });
  }
  function showKeys() {
    const rows = [["1 – 7", "Home, Tasks, Calendar, Mail, Projects, Flight path, Log"], ["N", "New task"], ["⌘K or /", "Search and commands"], ["F", "Launch the film"], ["J / K", "Move through tasks"], ["X", "Tick the selected task"], ["Enter", "Open the selected task"], ["Delete", "Delete the selected task (undo in the toast)"], ["⌘J or Ctrl+J", "Ask Jules"], ["Cmd/Ctrl+Shift+J", "Bring Jules up from anywhere (installed app)"], ["Esc", "Close whatever's open"]];
    J.form.open({ eyebrow: "Help", title: "Keyboard", value: {}, fields: [{ key: "k", type: "html", label: "", html: `<dl class="keys-dl">${rows.map(([k, d]) => `<dt><kbd>${esc(k)}</kbd></dt><dd>${esc(d)}</dd>`).join("")}</dl><p class="fh">Quick add understands: today, tomorrow, mon–sun, next week, 23 nov, 9am, 14:00, 9-11am, 1h, 90m, #project, !, !!, !!!, daily, weekdays, every fri.</p>` }] });
  }

  /* ---------------- command palette ---------------- */
  const PAL = (() => {
    let items = [], sel = 0;
    const box = () => $("#palette");
    function compute(q) {
      const out = [];
      const r = q.trim() ? J.parseQuick(q, { projects: projects() }) : null;
      out.push({ group: "Do", label: q.trim() ? `New task: ${r.title || q}` : "New task", hint: r && r.tokens.length ? r.tokens.map(t => t.label).join(" · ") : "N", run: () => { if (q.trim()) { const t = A.fromText(q); if (t) J.toast(`Added “${short(t.title, 30)}”`); } else focusQuickAdd(); } });
      const cmds = [
        ...ORDER.map(v => ({ label: "Go to " + VIEWS_META[v].label, hint: VIEWS_META[v].key, run: () => go(v) })),
        { label: "Launch the film", hint: "F", run: () => J.warp(() => go("film")) },
        { label: "Ask Jules", hint: "⌘J", run: () => J.jules && J.jules.toggle(true) },
        { label: "Hear today's briefing", run: () => J.jules && J.jules.playBrief(new Date(J._now || Date.now()).getHours() >= 17 ? "evening" : "morning") },
        { label: "New project", run: () => { const p = A.newProject("New project"); go("projects"); openProject(p.id, true); } },
        { label: "Add a milestone to the flight path", run: () => { go("path"); editPath(null, "event"); } },
        { label: "Log an achievement", run: () => { go("log"); editLog(null); } },
        { label: "Settings and countdowns", run: openSettings },
        { label: "Keyboard shortcuts", hint: "?", run: showKeys }
      ];
      cmds.forEach(c => { const s = J.fuzzy(q, c.label); if (s) out.push(Object.assign({ group: "Go", score: s }, c)); });
      if (q.trim()) {
        const hits = [];
        allTasks().forEach(t => { const s = J.fuzzy(q, t.title); if (s) hits.push({ group: "Tasks", score: s + (isDone(t) ? -30 : 0), label: t.title, hint: [isDone(t) ? "Done" : dueLabel(t), (project(t.project) || {}).name].filter(Boolean).join(" · "), run: () => { go(UI.view === "film" ? "tasks" : UI.view); TD.open(t.id); } }); });
        projects().forEach(p => { const s = J.fuzzy(q, p.name); if (s) hits.push({ group: "Projects", score: s + 10, label: p.name, hint: progressOf(p.id).pct + "%", run: () => { go("projects"); openProject(p.id); } }); });
        S.list("path").forEach(x => { const s = J.fuzzy(q, x.title + " " + (x.courses || []).map(c => c.code + " " + c.name).join(" ")); if (s) hits.push({ group: "Flight path", score: s, label: x.title, hint: fmtSpan(Object.assign({}, x)), run: () => { UI.pathSel = x.id; go("path"); setTimeout(() => scrollToPath(x.id), 700); } }); });
        S.list("log").forEach(e => { const s = J.fuzzy(q, e.title + " " + e.detail); if (s) hits.push({ group: "Flight log", score: s, label: e.title, hint: e.when, run: () => go("log") }); });
        hits.sort((a, b) => b.score - a.score);
        out.push(...hits.slice(0, 12));
      }
      return out.filter((x, i) => i === 0 || x.group !== "Go" || x.score > (q.trim() ? 2 : 0)).slice(0, 18);
    }
    function draw() {
      const ul = $("#palList");
      let lastGroup = "";
      ul.innerHTML = items.map((it, i) => {
        const g = it.group !== lastGroup ? `<li class="pg" role="presentation">${esc(it.group)}</li>` : "";
        lastGroup = it.group;
        return g + `<li role="option" id="pal-${i}" aria-selected="${i === sel}" data-i="${i}"><span>${esc(it.label)}</span>${it.hint ? `<em>${esc(it.hint)}</em>` : ""}</li>`;
      }).join("");
      $("#palIn").setAttribute("aria-activedescendant", "pal-" + sel);
      const cur = $("#pal-" + sel); if (cur) cur.scrollIntoView({ block: "nearest" });
    }
    function open(q = "") {
      const b = box();
      b.hidden = false;
      requestAnimationFrame(() => b.classList.add("open"));
      const inp = $("#palIn");
      inp.value = q; items = compute(q); sel = 0; draw();
      setTimeout(() => inp.focus(), 30);
      J.overlay.push("palette", close);
    }
    function close() { const b = box(); if (b.hidden) return; b.classList.remove("open"); setTimeout(() => { b.hidden = true; }, 180); J.overlay.pop("palette"); }
    function run(i) { const it = items[i]; if (!it) return; close(); setTimeout(() => it.run(), 10); }
    document.addEventListener("input", e => { if (e.target.id === "palIn") { items = compute(e.target.value); sel = 0; draw(); } });
    document.addEventListener("keydown", e => {
      if (e.target.id !== "palIn") return;
      if (e.key === "ArrowDown") { e.preventDefault(); sel = Math.min(items.length - 1, sel + 1); draw(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(0, sel - 1); draw(); }
      else if (e.key === "Enter") { e.preventDefault(); run(sel); }
    });
    document.addEventListener("click", e => {
      const b = box(); if (b.hidden) return;
      const li = e.target.closest("#palList [data-i]");
      if (li) run(+li.dataset.i);
      else if (e.target === b || e.target.classList.contains("pal-scrim")) close();
    });
    return { open, close };
  })();

  function focusQuickAdd() {
    if (!["home", "tasks"].includes(UI.view) && !(UI.view === "projects" && UI.project)) go("tasks");
    setTimeout(() => { const q = $("#view .qa-in"); if (q) { q.focus(); q.scrollIntoView({ block: "center", behavior: "smooth" }); } }, 40);
  }
  function openProject(pid, focusName) {
    UI.project = pid;
    if (UI.view !== "projects") go("projects"); else render();
    scrollTo(0, 0);
    if (focusName) setTimeout(() => { const n = $("#pp-name"); if (n) { n.focus(); n.select(); } }, 60);
  }
  function scrollToPath(pid) {
    const el = $("#pathDetail");
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
  }

  /* ---------------- clicks inside views ---------------- */
  document.addEventListener("click", e => {
    if (!e.target.closest("#app")) return;
    const a = e.target.closest("[data-act]");
    if (a) {
      const act = a.dataset.act, id = a.dataset.id;
      switch (act) {
        case "toggle": e.stopPropagation(); A.toggle(id); return;
        case "homeScroll": e.preventDefault(); homeScrollTo(a.dataset.to); return;
        case "brief": J.jules && J.jules.playBrief(a.dataset.kind); return;
        case "installApp": J.desktop && J.desktop.requestInstall(); return;
        case "desktopSetup": J.desktop && J.desktop.askPermissions(); return;
        case "mailTask": mailToTask(id); return;
        case "mailFlip": { const v = J.mail.verdict(id); J.mail.setVerdict(id, !(v && v.reply)); return; }
        case "mailSort": J.mail.sort(); return;
        case "mailMore": UI.mailAll = true; render(); return;
        case "mapprove": J.mail.approve(); return;
        case "mretry": J.mail.refresh(); return;
        case "settings": openSettings(); return;
        case "hero": UI.hero = (UI.hero + 1) % HERO.length; lsSet("hero", UI.hero); render(); return;
        case "homeday": UI.homeDay = +a.dataset.step === 0 ? J.today() : J.addDays(UI.homeDay, +a.dataset.step); render(); return;
        case "calstep": {
          const s = +a.dataset.step, m = innerWidth < 760 && UI.calMode === "week" ? "day" : UI.calMode;
          if (s === 0) UI.calDate = J.today();
          else if (m === "month") { const d = J.parseYmd(UI.calDate); UI.calDate = J.ymd(new Date(d.getFullYear(), d.getMonth() + s, 1)); }
          else UI.calDate = J.addDays(UI.calDate, s * (m === "week" ? 7 : 1));
          render(); return;
        }
        case "gotoDay": UI.calDate = a.dataset.date; UI.calMode = innerWidth < 760 ? "day" : "week"; lsSet("calMode", UI.calMode); render(); return;
        case "gapprove": G.approve(); return;
        case "gretry": G.refresh(); return;
        case "openProject": e.preventDefault(); openProject(id); return;
        case "closeProject": e.preventDefault(); UI.project = null; render(); return;
        case "newProject": { const p = A.newProject("New project"); openProject(p.id, true); return; }
        case "delProject": {
          if (!a.dataset.armed) { a.dataset.armed = "1"; a.textContent = "Click again: tasks stay, unassigned"; return; }
          const p = project(UI.project), ts = allTasks().filter(t => t.project === p.id);
          ts.forEach(t => A.update(t.id, { project: null }));
          S.remove("projects", p.id); UI.project = null; render();
          J.toast(`Deleted “${short(p.name, 30)}”`, { label: "Undo", run: () => { S.put("projects", p); ts.forEach(t => A.update(t.id, { project: p.id })); } });
          return;
        }
        case "pathTo": e.preventDefault(); UI.pathSel = id; if (UI.view !== "path") { go("path"); setTimeout(() => scrollToPath(id), 700); } else { render(); scrollToPath(id); } return;
        case "pathSel": UI.pathSel = UI.pathSel === id ? null : (id || null); render(); if (UI.pathSel) setTimeout(() => { const d = $("#pathDetail"); if (d && d.getBoundingClientRect().top > innerHeight - 120) d.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, 30); return;
        case "pathYear": { const el = document.getElementById("year-" + a.dataset.year) || document.getElementById("chap-" + a.dataset.year); if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" }); return; }
        case "chapStep": { const tr = $("#chTrack"); if (tr) tr.scrollBy({ left: +a.dataset.step * (tr.firstElementChild ? tr.firstElementChild.getBoundingClientRect().width + 20 : 400), behavior: "smooth" }); return; }
        case "courseProject": { const p = A.newProject(`${a.dataset.code}${a.dataset.name ? " · " + a.dataset.name : ""}`); S.patch("projects", p.id, { notes: `Course notes for ${a.dataset.code}.\n\n## Week 1\n- ` }); J.toast(`Project “${short(p.name, 30)}” created`); render(); return; }
        case "addPath": editPath(null, a.dataset.kind); return;
        case "editPath": editPath(S.get("path", id)); return;
        case "addSkill": editSkill(null); return;
        case "editSkill": editSkill(S.get("skills", id)); return;
        case "moveSkill": A.move("skills", id, +a.dataset.dir); return;
        case "addLog": editLog(null); return;
        case "editLog": editLog(S.get("log", id)); return;
        case "hlLog": { const en = S.get("log", id); S.patch("log", id, { highlight: !en.highlight }); return; }
        case "moveLog": { const en = S.get("log", id); A.move("log", id, +a.dataset.dir, x => x.group === en.group); return; }
        case "copyCV": J.copyText(cvText()).then(ok => ok ? J.toast("Copied your flight log as plain text") : J.form.open({ eyebrow: "Flight log", title: "CV text", value: { t: cvText() }, fields: [{ key: "t", label: "Select all and copy", type: "textarea", rows: 14 }] })); return;
        case "seed": S.importSeed(J.buildSeed(window.JULES_SEED)); J.toast("Starter data loaded"); return;
      }
    }
    const tab = e.target.closest("[data-tab]");
    if (tab) { UI[tab.dataset.tab] = tab.dataset.val; lsSet(tab.dataset.tab, tab.dataset.val); render(); return; }
    const ev = e.target.closest("[data-ev]");
    if (ev) { const [calId, evId] = ev.dataset.ev.split("|"); eventDetails(calId, evId, ev.dataset.date); return; }
    const sw = e.target.closest("[data-pcolor]");
    if (sw) { S.patch("projects", UI.project, { color: sw.dataset.pcolor }); return; }
    const row = e.target.closest("[data-task]");
    if (row && !e.target.closest("button.chk, .grip, a")) { UI.sel = row.dataset.task; TD.open(row.dataset.task); return; }
    const col = e.target.closest(".tl-col");
    if (col && e.target === col) newTaskAt(col, e.clientY);
  });
  document.addEventListener("change", e => {
    if (!e.target.closest("#app")) return;
    const c = e.target.dataset.ctl;
    if (c === "tasksProject") { UI.tasksProject = e.target.value; render(); }
    else if (c === "showDone") { UI.showDone = e.target.checked; lsSet("showDone", UI.showDone); render(); }
    else if (e.target.dataset.cal !== undefined) G.toggleCal(e.target.dataset.cal);
    else if (e.target.dataset.calauto !== undefined) G.toggleAuto();
    else if (e.target.dataset.pfield === "status") S.patch("projects", UI.project, { status: e.target.value });
    else if (e.target.dataset.pfield === "progress") S.patch("projects", UI.project, { progress: +e.target.value / 100 });
    else if (e.target.dataset.pfield === "name") { const v = e.target.value.trim(); if (v) S.patch("projects", UI.project, { name: v }); }
  });
  document.addEventListener("keydown", e => { if (e.target.dataset && e.target.dataset.pfield === "name" && e.key === "Enter") e.target.blur(); });

  /* ---------------- keyboard ---------------- */
  document.addEventListener("keydown", e => {
    const typing = e.target.closest && e.target.closest("input, textarea, select, [contenteditable]");
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); $("#palette").hidden ? PAL.open() : PAL.close(); return; }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") { e.preventDefault(); J.jules && J.jules.toggle(); return; }
    if (e.key === "Escape") {
      if (J.overlay.closeTop()) { e.preventDefault(); return; }
      if (typing) { e.target.blur(); return; }
      if (UI.view === "film") { J.warp(() => go("home")); return; }
      if (UI.view === "projects" && UI.project) { UI.project = null; render(); }
      return;
    }
    if (typing || e.metaKey || e.ctrlKey || e.altKey || J.overlay.any()) return;
    if (UI.view === "film") return;
    const k = e.key;
    const vi = ["1", "2", "3", "4", "5", "6", "7"].indexOf(k);
    if (vi >= 0) { go(ORDER[vi]); return; }
    if (k === "n" || k === "N") { e.preventDefault(); focusQuickAdd(); return; }
    if (k === "/") { e.preventDefault(); PAL.open(); return; }
    if (k === "?") { showKeys(); return; }
    if (k === "f" || k === "F") { J.warp(() => go("film")); return; }
    /* moving through the task rows on screen */
    const rows = $$("#view .trow");
    if (!rows.length) return;
    let i = rows.findIndex(r => r.dataset.task === UI.sel);
    if (k === "j" || k === "ArrowDown" && document.activeElement && document.activeElement.classList.contains("trow")) { e.preventDefault(); i = Math.min(rows.length - 1, i + 1); }
    else if (k === "k" || k === "ArrowUp" && document.activeElement && document.activeElement.classList.contains("trow")) { e.preventDefault(); i = Math.max(0, i - 1); }
    else if (i >= 0 && (k === "x" || k === " ")) { e.preventDefault(); A.toggle(UI.sel); return; }
    else if (i >= 0 && k === "Enter") { e.preventDefault(); TD.open(UI.sel); return; }
    else if (i >= 0 && (k === "Delete" || k === "Backspace")) { e.preventDefault(); const nx = rows[i + 1] || rows[i - 1]; A.remove(UI.sel); UI.sel = nx ? nx.dataset.task : null; return; }
    else return;
    UI.sel = rows[Math.max(0, i)].dataset.task;
    rows.forEach(r => r.classList.toggle("sel", r.dataset.task === UI.sel));
    rows[Math.max(0, i)].focus({ preventScroll: false });
  });
  document.addEventListener("focusin", e => { const r = e.target.closest && e.target.closest("#view .trow"); if (r) { UI.sel = r.dataset.task; $$("#view .trow.sel").forEach(x => x !== r && x.classList.remove("sel")); r.classList.add("sel"); } });

  /* ======================================================================
     6. ROUTER AND RENDERING
     ====================================================================== */
  function capture() {
    const st = { scroll: {}, inputs: [] };
    $$("#view [data-keep-scroll]").forEach(el => { st.scroll[el.dataset.keepScroll] = el.scrollTop; });
    $$("#view [data-keep-hscroll]").forEach(el => { st.hscroll = st.hscroll || {}; st.hscroll[el.id] = el.scrollLeft; });
    const a = document.activeElement;
    $$("#view [data-keep]").forEach(el => {
      if (el.value || el === a) st.inputs.push({ id: el.id, value: el.value, focus: el === a, s: el.selectionStart, e: el.selectionEnd, editing: el.classList.contains("notes-ta") && !el.hidden });
    });
    return st;
  }
  function restore(st) {
    Object.entries(st.scroll).forEach(([k, v]) => { const el = $(`#view [data-keep-scroll="${k}"]`); if (el) el.scrollTop = v; });
    $$("#view [data-keep-hscroll]").forEach(el => {
      if (st.hscroll && st.hscroll[el.id] != null) el.scrollLeft = st.hscroll[el.id];
      else { const cur = $(".ch-card.current", el); if (cur) el.scrollLeft = Math.max(0, cur.offsetLeft - el.offsetLeft - 8); }
    });
    st.inputs.forEach(x => {
      const el = x.id && document.getElementById(x.id);
      if (!el) return;
      if (x.editing) notesEdit(el.closest(".notes"), true);
      el.value = x.value;
      if (el.classList.contains("qa-in")) qaPreview(el.closest(".qa"));
      if (x.focus) { el.focus({ preventScroll: true }); try { el.setSelectionRange(x.s, x.e); } catch (err) {} }
    });
  }
  /* Scroll a timeline so "now" (or 7 am on other days) is in view, once per day shown. */
  function scrollTimelines() {
    $$("#view [data-keep-scroll]").forEach(sc => {
      const key = sc.dataset.keepScroll;
      if (UI.scrolledFor[key]) return;
      const col = $(".tl-col", sc); if (!col) return;
      UI.scrolledFor[key] = true;
      const h0 = +col.dataset.h0, pph = +col.dataset.pph;
      const hasToday = !!$(".now-line", sc);
      const m = hasToday ? J.nowMin() - 90 : 7 * 60;
      sc.scrollTop = Math.max(0, (m / 60 - h0) * pph);
    });
  }

  let lastRendered = null;
  function render() {
    if (UI.view === "film") return;
    const view = $("#view");
    const st = lastRendered === UI.view ? capture() : { scroll: {}, inputs: [] };
    const entering = lastRendered !== UI.view;
    view.dataset.view = UI.view;
    view.innerHTML = (V[UI.view] || V.home)();
    restore(st);
    scrollTimelines();
    homeAfter();
    if (entering) { view.classList.remove("enter"); void view.offsetWidth; view.classList.add("enter"); }
    lastRendered = UI.view;
    $$(".nav a[data-view]").forEach(a => { a.classList.toggle("on", a.dataset.view === UI.view); a.setAttribute("aria-current", a.dataset.view === UI.view ? "page" : "false"); });
    if (UI.view !== "home") lightRocket((VIEWS_META[UI.view] || {}).part);
    document.title = `${(VIEWS_META[UI.view] || {}).label || "Jules"} · Jules`;
    syncStatus();
  }
  J.render = render;

  function syncStatus() {
    const el = $("#syncStatus"); if (!el) return;
    const n = S.pendingCount ? S.pendingCount() : 0;
    const txt = S.mode === "local" ? "Saved in this browser" : S.status === "error" ? "Sync problem · changes kept here" : n ? "Saving…" : S.status === "cached" ? "Offline copy · will sync" : S.mode === "db" ? "Synced" : "Starting…";
    el.textContent = txt;
    el.className = "side-status" + (S.status === "error" ? " warn" : "");
    el.title = S.error || "";
  }

  function go(view) {
    if (location.hash.slice(1) === view) route();
    else location.hash = view;
  }
  J.go = go;
  let booted = false;
  function route() {
    let v = location.hash.slice(1), toStar = false;
    if (v === "star") { v = "path"; toStar = true; }
    if (!VIEWS_META[v] && v !== "film") v = "home";
    const was = UI.view;
    if (was === "home" && v !== "home" && booted) UI.homeScrollY = scrollY;
    if (v === "film") {
      if (TD.isOpen()) TD.close();
      UI.view = v;
      $("#app").hidden = true;
      J.film && J.film.enter();
      document.title = "Film · Jules";
      return;
    }
    const show = () => {
      UI.view = v;
      if (was === "film" && J.film) J.film.leave();
      $("#app").hidden = false;
      render();
      if (v === "home") {
        if (UI.homeTarget) { const t = UI.homeTarget; UI.homeTarget = null; requestAnimationFrame(() => homeScrollTo(t)); }
        else if (was === "home" && booted) homeScrollTo("h-launch");          /* Home pressed while on Home: back to the top */
        else scrollTo(0, was === "film" ? 0 : (UI.homeScrollY || 0));
      } else if (was !== v) scrollTo(0, 0);
      if (toStar) setTimeout(() => { const el = $("#path-star"); if (el) el.scrollIntoView({ behavior: "smooth" }); }, 80);
    };
    const animate = booted && was !== v && was !== "film";
    booted = true;
    if (animate) J.cut(VIEWS_META[v].label, show); else show();
  }

  /* The cut: a quick letterbox shutter between views, with the view's name in the gap. */
  let cutBusy = false;
  J.cut = (label, fn) => {
    const el = $("#cut");
    if (cutBusy || !el || matchMedia("(prefers-reduced-motion: reduce)").matches) { fn(); return; }
    cutBusy = true;
    $(".cut-label", el).textContent = label;
    el.classList.remove("open"); el.classList.add("on");
    setTimeout(() => { fn(); el.classList.add("open"); }, 230);
    setTimeout(() => { el.classList.remove("on", "open"); cutBusy = false; }, 640);
  };

  /* The warp: a burst of streaks used for jumps between the app and the film. */
  J.warp = (mid, done) => {
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const cv = $("#warp");
    if (reduced || !cv) { mid && mid(); done && done(); return; }
    const ctx = cv.getContext("2d"), dpr = Math.min(2, devicePixelRatio || 1), W = innerWidth, H = innerHeight;
    cv.width = W * dpr; cv.height = H * dpr; cv.classList.add("on");
    const cx = W / 2, cy = H / 2, R = Math.hypot(W, H) / 2;
    const stars = Array.from({ length: 240 }, () => ({ a: Math.random() * Math.PI * 2, r: Math.random() * .9 + .05, w: Math.random() * 1.2 + .3, c: Math.random() < .2 ? "255,200,150" : "235,240,255" }));
    const t0 = performance.now(), dur = 950;
    const sm = t => { t = J.clamp(t); return t * t * (3 - 2 * t); };
    let jumped = false;
    const step = now => {
      const t = J.clamp((now - t0) / dur), k = t < .45 ? sm(t / .45) : 1 - sm((t - .45) / .55);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = `rgba(0,0,0,${(.94 * k).toFixed(3)})`; ctx.fillRect(0, 0, W, H);
      stars.forEach(s => {
        const r1 = s.r * R * (1 + k * .35), len = R * .55 * k * k * (s.r + .2);
        ctx.strokeStyle = `rgba(${s.c},${(.85 * k).toFixed(3)})`; ctx.lineWidth = s.w;
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(s.a) * r1, cy + Math.sin(s.a) * r1); ctx.lineTo(cx + Math.cos(s.a) * (r1 + len), cy + Math.sin(s.a) * (r1 + len)); ctx.stroke();
      });
      if (t >= .45 && !jumped) { jumped = true; mid && mid(); }
      if (t < 1) requestAnimationFrame(step); else { cv.classList.remove("on"); done && done(); }
    };
    requestAnimationFrame(step);
  };
  /* Links to #film get the warp on the way in. */
  document.addEventListener("click", e => {
    const a = e.target.closest('a[href="#film"]');
    if (!a) return;
    e.preventDefault();
    J.warp(() => go("film"));
  });

  /* ---------------- start up ---------------- */
  function buildShell() {
    $("#sideBrand").innerHTML = `<div class="side-rocket">${J.rocketSVG("", true)}</div><div class="brand-txt"><a class="brand-word" href="#home">Jules</a><span class="rocket-label" id="rocketLabel" aria-live="polite"></span></div>`;
    const lab = $("#rocketLabel");
    $$(".side-rocket .rp").forEach(g => {
      const part = g.dataset.part;
      g.addEventListener("click", () => rocketGo(part));
      g.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); rocketGo(part); } });
      g.addEventListener("mouseenter", () => { lab.textContent = J.PART_LABEL[part]; lab.classList.add("hov"); });
      g.addEventListener("mouseleave", () => { lab.classList.remove("hov"); const on = $(".side-rocket .rp.on"); lab.textContent = on ? J.PART_LABEL[on.dataset.part] : ""; });
    });
    const nav = ORDER.map(v => `<a href="#${v}" data-view="${v}"><span class="ni">${J.icon[v]}</span><span class="nl">${VIEWS_META[v].label}</span><kbd>${VIEWS_META[v].key}</kbd></a>`).join("");
    $("#sideNav").innerHTML = nav;
    $("#tabbar").innerHTML = ORDER.map(v => `<a href="#${v}" data-view="${v}">${J.icon[v]}<span>${v === "path" ? "Path" : v === "log" ? "Log" : v === "calendar" ? "Cal" : VIEWS_META[v].label}</span></a>`).join("");
    $("#sideSearch").innerHTML = `${J.icon.search}<span>Search or do</span><kbd>⌘K</kbd>`;
    $("#sideSearch").addEventListener("click", () => PAL.open());
    $("#sideSettings").innerHTML = `${J.icon.gear}<span>Settings</span>`;
    $("#sideSettings").addEventListener("click", openSettings);
    $("#sideKeys").addEventListener("click", showKeys);
    $("#julesBtn").innerHTML = `<span class="jb-wave" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span>Jules</span><kbd>⌘J</kbd>`;
    $("#julesBtn").addEventListener("click", () => J.jules && J.jules.toggle());
    $("#sideInstall").addEventListener("click", () => { const D = J.desktop; if (!D) return; if (D.mode === "app") D.askPermissions(); else D.requestInstall(); });
  }
  /* What's playing (top right) and the desktop install prompt (sidebar). */
  function drawNowPlaying() {
    const el = $("#nowPlaying"), sp = J.spotify, t = sp && sp.track;
    if (!el) return;
    el.hidden = !(t && sp.state === "ok");
    if (el.hidden) return;
    el.href = t.url || "https://open.spotify.com/";
    el.title = `${t.playing ? "Playing" : "Paused"}: ${t.name}${t.artist ? " · " + t.artist : ""}`;
    el.innerHTML = `<span class="eq${t.playing ? " on" : ""}" aria-hidden="true"><i></i><i></i><i></i></span><span class="np-t"><b>${esc(t.name)}</b>${t.artist ? `<em>${esc(t.artist)}</em>` : ""}</span><span class="np-bar" aria-hidden="true"><i style="width:${(sp.position() * 100).toFixed(1)}%"></i></span>`;
  }
  setInterval(() => { const b = $("#nowPlaying .np-bar i"); if (b && J.spotify) b.style.width = (J.spotify.position() * 100).toFixed(1) + "%"; }, 1000);
  function drawSideInstall() {
    const b = $("#sideInstall"), D = J.desktop;
    if (!b || !D) return;
    const setup = D.mode === "app" && D.needsSetup(), inst = D.mode === "web" && D.install === "available";
    b.hidden = !(setup || inst);
    b.textContent = setup ? "Finish desktop setup" : "Install as app";
  }
  /* The briefing, shown in the launch scene like a subtitle. */
  function briefLine() {
    const JU = J.jules;
    if (!JU || !JU.canTalk()) return "";
    const hr = new Date(J._now || Date.now()).getHours(), b = JU.briefFor();
    if (JU.briefBusy) return `<p class="brief rv" style="--d:2"><span class="brief-dim">Jules is preparing the ${JU.briefBusy === "morning" ? "briefing" : "wrap-up"}…</span></p>`;
    if (hr >= 17) return `<p class="brief rv" style="--d:2"><button type="button" class="brief-play" data-act="brief" data-kind="evening">${PLAY}<span>${b.evening ? "Hear the evening wrap-up again" : "Evening wrap-up"}</span></button></p>`;
    if (b.morning) return `<p class="brief rv" style="--d:2"><button type="button" class="brief-play" data-act="brief" data-kind="morning">${PLAY}<span>Hear the briefing</span></button><span class="brief-text">“${esc(short(b.morning.text, 150))}”</span></p>`;
    return `<p class="brief rv" style="--d:2"><button type="button" class="brief-play" data-act="brief" data-kind="morning">${PLAY}<span>Morning briefing</span></button></p>`;
  }
  const PLAY = `<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3.5v9l7-4.5z" fill="currentColor" stroke="none"/></svg>`;

  /* A missing header photo (e.g. on GitHub, where photos aren't included) just disappears. */
  document.addEventListener("error", e => { if (e.target && e.target.classList && e.target.classList.contains("hero-img")) e.target.remove(); }, true);
  buildShell();
  $("#view").innerHTML = `<div class="loading">Loading…</div>`;
  let routed = false;
  S.on(() => { if (!routed) return; if (UI.view !== "film") render(); else syncStatus(); });
  G.on(() => { if (routed && (UI.view === "home" || UI.view === "calendar")) render(); });
  J.mail.on(() => { if (routed && (UI.view === "home" || UI.view === "mail")) render(); });
  if (J.spotify) { J.spotify.on(drawNowPlaying); drawNowPlaying(); }
  if (J.desktop) { J.desktop.on(drawSideInstall); drawSideInstall(); if (J.desktop.ready) J.desktop.ready.then(drawSideInstall); }
  addEventListener("hashchange", route);
  let lastDay = J.today(), resizeT;
  addEventListener("resize", () => { clearTimeout(resizeT); resizeT = setTimeout(() => { if (UI.view === "calendar" || UI.view === "path") render(); }, 200); });
  setInterval(() => {
    if (J.today() !== lastDay) { lastDay = J.today(); UI.homeDay = lastDay; render(); return; }
    const c = $("#clock"); if (c) c.textContent = J.fmtTime(J.nowMin());
    $$("#view .now-line").forEach(l => {
      const col = l.closest(".tl-col"); const h0 = +col.dataset.h0, pph = +col.dataset.pph, nm = J.nowMin();
      l.style.top = ((nm - h0 * 60) / 60 * pph) + "px"; $("span", l).textContent = J.fmtTime(nm);
    });
  }, 30000);
  S.ready.then(() => { routed = true; route(); });
})();
