/* JULES · seed.js
   Turns the starter data (data.js, or data.example.js) into the records Jules stores.
   Used in two places: the browser, to fill an empty local copy, and a small Node script
   that writes the same records into the synced database. */
(function (root) {
  "use strict";
  const J = root.J = root.J || (typeof require !== "undefined" ? require("./util.js") : {});

  const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

  J.buildSeed = function buildSeed(S, today) {
    today = today || J.today();
    const now = Date.now();
    const out = { meta: [], projects: [], tasks: [], path: [], skills: [], log: [] };
    if (!S) return out;
    const m = S.meta || {};
    out.meta.push({ id: "app", name: m.name || "", fuelGoal: m.fuelGoal || 10, countdowns: (m.countdowns || []).map(c => ({ label: c.label, date: c.date })) });

    const pid = {};
    (S.projects || []).forEach((p, i) => {
      const id = "p-" + slug(p.key || p.name);
      pid[p.key || p.name] = id;
      out.projects.push({ id, name: p.name, status: p.status || "burning", color: p.color || "flame", notes: p.notes || "", progress: p.progress || 0, order: i, createdAt: now });
    });

    const seen = {};
    (S.tasks || []).forEach((t, i) => {
      let id = "t-" + slug(t.title);
      if (seen[id]) id += "-" + i;
      seen[id] = 1;
      const due = typeof t.due === "number" ? J.addDays(today, t.due) : (t.due || null);
      const done = t.status === "done";
      out.tasks.push({
        id, title: t.title, status: t.status || "todo", due,
        start: t.start ? J.parseHM(t.start) : null, dur: t.dur || null,
        project: t.project ? (pid[t.project] || null) : null,
        priority: t.priority || 0, repeat: t.repeat || null, notes: t.notes || "",
        order: i, createdAt: now, doneAt: done ? +J.parseYmd(J.addDays(today, -1)) + 18 * 3600e3 : null, gcal: null, spawnedId: null
      });
    });

    (S.path || []).forEach((x, i) => {
      out.path.push({
        id: "m-" + String(i + 1).padStart(2, "0") + "-" + slug(x.title).slice(0, 24),
        kind: x.kind === "period" ? "period" : "event", title: x.title, sub: x.sub || "",
        from: x.from || null, to: x.to || null, at: x.at || null,
        courses: (x.courses || []).map(c => Array.isArray(c) ? { code: c[0], name: c[1] || "" } : c),
        goal: !!x.goal, estimate: !!x.estimate, order: i
      });
    });

    (S.skills || []).forEach((s, i) => out.skills.push({ id: "s-" + slug(s.name), name: s.name, detail: s.detail || "", eta: s.eta || "", why: s.why || "", goal: !!s.goal, order: i }));
    (S.log || []).forEach((l, i) => out.log.push({ id: "l-" + String(i + 1).padStart(2, "0") + "-" + slug(l.title).slice(0, 24), group: l.group || "Other", when: l.when || "", title: l.title, detail: l.detail || "", highlight: !!l.highlight, order: i }));
    return out;
  };

  if (typeof module !== "undefined") module.exports = J;
})(typeof window !== "undefined" ? window : globalThis);
