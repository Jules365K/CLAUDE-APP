/* JULES · util.js
   Small helpers shared by every other file: DOM, escaping, ids, and dates.
   Dates are kept as plain "YYYY-MM-DD" strings in local time (no time zones to trip over);
   times of day are minutes after midnight (9:30 am = 570). */
(function (root) {
  "use strict";
  const J = root.J = root.J || {};

  /* ---------- DOM ---------- */
  J.$ = (s, r) => (r || document).querySelector(s);
  J.$$ = (s, r) => [...(r || document).querySelectorAll(s)];
  J.esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  J.pad2 = n => String(n).padStart(2, "0");
  J.clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  J.uid = p => (p || "x") + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  J.debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  /* ---------- dates (YYYY-MM-DD, local) ---------- */
  J.ymd = d => `${d.getFullYear()}-${J.pad2(d.getMonth() + 1)}-${J.pad2(d.getDate())}`;
  J.parseYmd = s => { if (!s) return null; const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  J.todayDate = () => { const n = J._now ? new Date(J._now) : new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); };
  J.today = () => J.ymd(J.todayDate());
  J.nowMin = () => { const n = J._now ? new Date(J._now) : new Date(); return n.getHours() * 60 + n.getMinutes(); };
  J.addDays = (s, n) => { const d = J.parseYmd(s); d.setDate(d.getDate() + n); return J.ymd(d); };
  J.diffDays = (a, b) => Math.round((J.parseYmd(b) - J.parseYmd(a)) / 864e5); // b - a
  J.dow = s => (J.parseYmd(s).getDay() + 6) % 7;            // Monday = 0 … Sunday = 6
  J.weekStart = s => J.addDays(s, -J.dow(s));                  // the Monday of that week
  J.monthStart = s => s.slice(0, 8) + "01";
  J.isValidYmd = s => { if (!/^\d{4}-\d{2}-\d{2}$/.test(s || "")) return false; const d = J.parseYmd(s); return J.ymd(d) === s; };

  const DAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const DAYL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const MONL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  J.DAY = DAY; J.DAYL = DAYL; J.MON = MON; J.MONL = MONL;

  /* "Mon 23 Nov", optionally with the year when it isn't this year */
  J.fmtDate = (s, o = {}) => {
    if (!s) return "";
    const d = J.parseYmd(s), y = d.getFullYear();
    let out = `${o.long ? DAYL[J.dow(s)] : DAY[J.dow(s)]} ${d.getDate()} ${o.long ? MONL[d.getMonth()] : MON[d.getMonth()]}`;
    if (o.noDay) out = `${d.getDate()} ${MON[d.getMonth()]}`;
    if (o.year || y !== J.todayDate().getFullYear()) out += ` ${y}`;
    return out;
  };
  /* "Today", "Tomorrow", "Yesterday", "Thu" (within a week), else "23 Nov" */
  J.relDay = s => {
    if (!s) return "";
    const n = J.diffDays(J.today(), s);
    if (n === 0) return "Today";
    if (n === 1) return "Tomorrow";
    if (n === -1) return "Yesterday";
    if (n > 1 && n < 7) return DAY[J.dow(s)];
    if (n < 0) return `${-n}d ago`;
    return J.fmtDate(s, { noDay: true });
  };
  J.daysUntil = s => J.diffDays(J.today(), s);

  /* ---------- times (minutes after midnight) ---------- */
  /* "09:30": for form inputs and anything a machine reads. */
  J.hm = m => m == null ? "" : `${J.pad2(Math.floor(m / 60) % 24)}:${J.pad2(m % 60)}`;
  /* "9:30 am" (or "09:30" on a 24-hour device): whatever this computer's settings say. */
  const at = m => new Date(2026, 0, 5, 0, m);
  let TF = null, HF = null;
  try { TF = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }); HF = new Intl.DateTimeFormat(undefined, { hour: "numeric" }); } catch (e) {}
  J.fmtTime = m => m == null ? "" : TF ? TF.format(at(m)) : J.hm(m);
  J.fmtHour = h => HF ? HF.format(at(h * 60)) : `${J.pad2(h)}:00`;
  J.parseHM = s => { if (!s) return null; const [h, m] = s.split(":").map(Number); return Number.isFinite(h) ? h * 60 + (m || 0) : null; };
  J.fmtDur = m => {
    if (!m) return "";
    const h = Math.floor(m / 60), r = m % 60;
    return h && r ? `${h}h ${r}m` : h ? `${h}h` : `${r}m`;
  };
  /* "9:00–10:30 am": the range shares its am/pm where the locale allows. */
  J.fmtRange = (start, dur) => {
    if (start == null) return "";
    if (!dur) return J.fmtTime(start);
    try { if (TF && TF.formatRange && start + dur < 1440) return TF.formatRange(at(start), at(start + dur)).replace(/\s+–\s+/, "–"); } catch (e) {}
    return `${J.fmtTime(start)}–${J.fmtTime(start + dur)}`;
  };

  /* ---------- repeats ---------- */
  /* The next date on or after `from` that fits the rule. */
  J.nextFit = (rule, from) => {
    let d = from;
    for (let i = 0; i < 8; i++) {
      if (rule !== "weekdays" || J.dow(d) < 5) return d;
      d = J.addDays(d, 1);
    }
    return d;
  };
  /* After finishing a repeating task due on `due`, when is the next one?
     Always after today, so a late tick never schedules the next one into the past.
     Weekly keeps the original weekday. */
  J.nextRepeat = (rule, due) => {
    const today = J.today();
    if (rule === "weekly") {
      let next = J.addDays(due || today, 7);
      while (next <= today) next = J.addDays(next, 7);
      return next;
    }
    const base = due && due > today ? due : today;
    const next = J.addDays(base, 1);
    return rule === "weekdays" ? J.nextFit("weekdays", next) : next;
  };
  J.REPEAT_LABEL = { daily: "Every day", weekdays: "Every weekday", weekly: "Every week" };

  if (typeof module !== "undefined") module.exports = J;
})(typeof window !== "undefined" ? window : globalThis);

/* A claude.ai capability (db, mcp, sample, tts…), or null outside claude.ai. Waits up to 2s for
   the host to appear and 10s for the capability; the answer is remembered. */
(function () {
  const J = window.J, cache = {};
  J.cap = name => cache[name] || (cache[name] = (async () => {
    let framed = true; try { framed = window.top !== window.self; } catch (e) {}
    const may = framed || /claude/i.test(location.hostname);
    for (let i = 0; may && i < 20 && !(window.claude && window.claude.use); i++) await new Promise(r => setTimeout(r, 100));
    const C = window.claude;
    if (!(C && typeof C.use === "function")) return null;
    try { return await Promise.race([C.use(name), new Promise(r => setTimeout(() => r(null), 10000))]); } catch (e) { return null; }
  })());
})();
