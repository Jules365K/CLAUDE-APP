/* JULES · journal.js
   The Journal: a page for each day, and your habits.
   - Habits are ticked per day (Settings-free: add, rename or pause them right on the page).
     Each one keeps a streak, counted over the days it's meant for (gym on weekdays only, say).
   - The day's page is plain writing, saved as you type. A mood mark is optional.
   - The right-hand page shows the last six months of each habit as a grid, and recent entries.
   Storage: collection "journal", one record per day (id = the date). Habit definitions live in
   the app settings record (meta "app"), so they sync with everything else. */
(function () {
  "use strict";
  const J = window.J, S = J.store, { $, $$, esc } = J, P = J.app;
  const COL = "journal";
  const JN = J.journal = { day: null };
  const DEFAULT_HABITS = [{ name: "Exercise" }, { name: "Read" }, { name: "Asleep before midnight" }];
  const MOODS = [[1, "Rough"], [2, "Meh"], [3, "Fine"], [4, "Good"], [5, "Great"]];
  const PROMPTS = ["What moved forward today?", "What would make tomorrow good?", "Something you noticed today.", "What's on your mind?", "One thing you learned.", "What are you putting off, and why?"];

  /* ---------- habits ---------- */
  JN.habits = () => {
    const m = S.meta();
    if (Array.isArray(m.habits)) return m.habits.filter(h => !h.paused);
    return null;
  };
  JN.allHabits = () => S.meta().habits || [];
  function ensureHabits() {
    if (Array.isArray(S.meta().habits)) return;
    const seed = ((window.JULES_SEED || {}).meta || {}).habits || DEFAULT_HABITS;
    saveHabits(seed.map((h, i) => ({ id: "h" + i, name: h.name, days: h.days || [0, 1, 2, 3, 4, 5, 6] })));
  }
  function saveHabits(list) { S.put("meta", Object.assign({}, S.meta(), { id: "app", habits: list })); }
  const entry = d => S.get(COL, d) || { id: d, text: "", mood: null, habits: {} };
  const did = (h, d) => !!(entry(d).habits || {})[h.id];
  const wd = d => J.parseYmd(d).getDay();               // 0 = Sunday, as habit days are stored
  const meantFor = (h, d) => !h.days || h.days.includes(wd(d));
  JN.toggle = (hid, d) => {
    const e = entry(d), hb = Object.assign({}, e.habits || {});
    if (hb[hid]) delete hb[hid]; else hb[hid] = true;
    S.put(COL, Object.assign({}, e, { habits: hb, at: Date.now() }));
  };
  /* Days in a row, counting back from today (or yesterday, if today isn't done yet). Days the habit
     isn't meant for don't break it. */
  JN.streak = h => {
    let d = J.today(), n = 0;
    if (!did(h, d)) d = J.addDays(d, -1);
    for (let k = 0; k < 400; k++, d = J.addDays(d, -1)) {
      if (!meantFor(h, d)) continue;
      if (did(h, d)) n++; else break;
    }
    return n;
  };
  JN.best = h => {
    let best = 0, cur = 0;
    const ds = S.list(COL).map(e => e.id).filter(J.isValidYmd).sort();
    if (!ds.length) return 0;
    for (let d = ds[0]; d <= J.today(); d = J.addDays(d, 1)) { if (!meantFor(h, d)) continue; if (did(h, d)) { cur++; best = Math.max(best, cur); } else cur = 0; }
    return best;
  };
  JN.summary = () => {
    const hs = JN.habits(); if (!hs) return null;
    const t = J.today();
    return { today: hs.filter(h => meantFor(h, t)).map(h => ({ habit: h.name, done: did(h, t), streak: JN.streak(h) })), wroteToday: !!entry(t).text };
  };

  /* A row of habit buttons, also used on Home. */
  JN.strip = (d = J.today(), big = false) => {
    const hs = JN.habits(); if (!hs || !hs.length) return "";
    return `<div class="hb-strip${big ? " big" : ""}">${hs.filter(h => meantFor(h, d)).map(h => {
      const on = did(h, d), st = JN.streak(h);
      return `<button type="button" class="hb${on ? " on" : ""}" data-act="habit" data-h="${esc(h.id)}" data-d="${d}" aria-pressed="${on}"><span class="hb-dot" aria-hidden="true">${on ? J.icon.check : ""}</span><span class="hb-t"><b>${esc(h.name)}</b>${st ? `<em>${st} ${st === 1 ? "day" : "days"}</em>` : big ? "<em>Start today</em>" : ""}</span></button>`;
    }).join("")}</div>`;
  };

  /* ---------- the view ---------- */
  function render() {
    ensureHabits();
    const d = JN.day || J.today(), e = entry(d), today = J.today();
    const nav = `<div class="jn-nav"><button type="button" class="ibtn" data-act="jnDay" data-step="-1" aria-label="Previous day">${J.icon.left}</button>${d !== today ? `<button type="button" class="btn sm" data-act="jnDay" data-step="0">Today</button>` : ""}<button type="button" class="ibtn" data-act="jnDay" data-step="1" aria-label="Next day" ${d >= today ? "disabled" : ""}>${J.icon.right}</button></div>`;
    let h = P.viewHead("Journal", esc(d === today ? J.fmtDate(d, { long: true }) : J.fmtDate(d, { long: true, year: true })), nav);
    const prompt = PROMPTS[J.diffDays("2026-01-01", d) % PROMPTS.length];
    h += `<div class="jn-spread">
      <section class="jn-page jn-left">
        <p class="jn-k">Habits</p>${JN.strip(d, true) || `<p class="tr-dim">No habits yet.</p>`}
        <p class="jn-k">Mood</p><div class="jn-moods">${MOODS.map(([v, l]) => `<button type="button" class="mood${e.mood === v ? " on" : ""}" data-act="jnMood" data-v="${v}" aria-pressed="${e.mood === v}" style="--m:${v}"><i aria-hidden="true"></i><span>${l}</span></button>`).join("")}</div>
        <p class="jn-k">The page <span class="jn-saved" id="jnSaved">${e.text ? "Saved" : ""}</span></p>
        <textarea class="jn-text" id="jnText-${d}" data-day="${d}" data-keep rows="12" placeholder="${esc(prompt)}" aria-label="Journal for ${esc(J.fmtDate(d))}">${esc(e.text || "")}</textarea>
      </section>
      <section class="jn-page jn-right">
        <p class="jn-k">The last six months <button type="button" class="link" data-act="jnHabits">Edit habits</button></p>
        ${grids()}
        <p class="jn-k">Recent pages</p>${recent(d)}
      </section></div>`;
    return h;
  }
  function grids() {
    const hs = JN.habits() || [];
    if (!hs.length) return "";
    const end = J.today(), start = J.addDays(end, -J.dow(end) - 7 * 25);   // 26 weeks, Monday first
    return hs.map(h => {
      let cells = "";
      for (let d = start; d <= end; d = J.addDays(d, 1)) {
        const m = meantFor(h, d), on = did(h, d);
        cells += `<i class="${on ? "on" : m ? "" : "off"}" title="${esc(J.fmtDate(d) + (on ? " · done" : ""))}"></i>`;
      }
      const best = JN.best(h);
      return `<div class="hg"><p><b>${esc(h.name)}</b><span>${JN.streak(h)} now · best ${best}</span></p><div class="hg-grid">${cells}</div></div>`;
    }).join("");
  }
  function recent(cur) {
    const es = S.list(COL).filter(e => e.text && J.isValidYmd(e.id) && e.id !== cur).sort((a, b) => b.id.localeCompare(a.id)).slice(0, 6);
    if (!es.length) return `<p class="tr-dim">Your earlier pages will show here.</p>`;
    return `<ul class="jn-recent">${es.map(e => `<li><button type="button" data-act="jnOpen" data-d="${e.id}"><span>${esc(J.fmtDate(e.id))}</span><b>${esc(e.text.split("\n")[0].slice(0, 90))}</b></button></li>`).join("")}</ul>`;
  }
  function editHabits() {
    ensureHabits();
    const list = JN.allHabits();
    const DAYS = [["all", "Every day"], ["wk", "Weekdays"], ["we", "Weekends"]];
    const daysKey = h => !h.days || h.days.length === 7 ? "all" : h.days.join() === "1,2,3,4,5" ? "wk" : h.days.join() === "0,6" ? "we" : "all";
    J.form.open({
      eyebrow: "Journal", title: "Habits",
      note: "One per line. Add “· weekdays” or “· weekends” after a name if it's not daily. Delete a line to stop tracking it; its history stays.",
      value: { lines: list.filter(h => !h.paused).map(h => h.name + (daysKey(h) === "wk" ? " · weekdays" : daysKey(h) === "we" ? " · weekends" : "")).join("\n") },
      fields: [{ key: "lines", label: "Habits", type: "textarea", rows: 6 }],
      onSave: v => {
        const names = v.lines.split("\n").map(s => s.trim()).filter(Boolean).slice(0, 12);
        const next = [];
        names.forEach(line => {
          const m = line.match(/^(.*?)\s*·\s*(weekdays|weekends)$/i), name = (m ? m[1] : line).trim(), kind = m ? m[2].toLowerCase() : "";
          const days = kind === "weekdays" ? [1, 2, 3, 4, 5] : kind === "weekends" ? [0, 6] : [0, 1, 2, 3, 4, 5, 6];
          const old = list.find(h => h.name.toLowerCase() === name.toLowerCase());
          next.push(Object.assign({}, old || { id: J.uid("h") }, { name, days, paused: false }));
        });
        list.forEach(h => { if (!next.some(n => n.id === h.id)) next.push(Object.assign({}, h, { paused: true })); });
        saveHabits(next);
      }
    });
  }

  /* ---------- saving the page as you type ---------- */
  let saveT = 0;
  document.addEventListener("input", e => {
    if (!e.target.classList || !e.target.classList.contains("jn-text")) return;
    const d = e.target.dataset.day, v = e.target.value;
    const s = $("#jnSaved"); if (s) s.textContent = "Saving…";
    clearTimeout(saveT);
    saveT = setTimeout(() => { S.put(COL, Object.assign({}, entry(d), { text: v.slice(0, 20000), at: Date.now() })); const s2 = $("#jnSaved"); if (s2) s2.textContent = "Saved"; }, 700);
  });

  S.ready.then(() => setTimeout(() => { if (!S.isEmpty()) ensureHabits(); }, 400));
  P.register("journal", {
    label: "Journal", short: "Journal", part: "exhaust",
    icon: '<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 2.5h8a1 1 0 0 1 1 1v10h-8a1 1 0 0 1-1-1z"/><path d="M3.5 12.5a1 1 0 0 1 1-1h8M6 5.5h4M6 7.5h3"/></svg>',
    render,
    acts: {
      habit: a => JN.toggle(a.dataset.h, a.dataset.d),
      jnMood: a => { const d = JN.day || J.today(), e = entry(d), v = +a.dataset.v; S.put(COL, Object.assign({}, e, { mood: e.mood === v ? null : v, at: Date.now() })); },
      jnDay: a => { const st = +a.dataset.step, cur = JN.day || J.today(); JN.day = st === 0 ? null : J.addDays(cur, st) >= J.today() ? null : J.addDays(cur, st); J.render(); },
      jnOpen: a => { JN.day = a.dataset.d; J.render(); scrollTo(0, 0); },
      jnHabits: () => editHabits()
    }
  });
})();
