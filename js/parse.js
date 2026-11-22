/* JULES · parse.js
   Quick add: turns "Vectors tomorrow 9am 1h #prep !! every weekday" into a task.
   Each rule finds a phrase, records it as a token (so the UI can show what it understood),
   and cuts it out of the title. Whatever is left is the title.

   Understands
     dates      today, tonight, tomorrow (tmr), mon … sun, next mon, next week, weekend,
                in 3 days, in 2 weeks, 23 nov, nov 23, 23/11, 2026-11-23   (optional by/on/due)
     times      9am, 9:30pm, 14:00, at 5, noon, midnight, ranges like 9-11am or 14:00-15:30
     durations  1h, 1.5h, 1h30, 90m, 45 min, for 2 hours
     project    #name  (matches the start of a project's name, ignoring case and spaces)
     priority   !  !!  !!!  (low, medium, high) or p1 p2 p3 (high, medium, low)
     repeats    daily, every day, weekdays, every weekday, weekly, every week, every fri
   Pass opts.ignore = ["tonight"] to leave a phrase in the title (the UI's × on a chip). */
(function (root) {
  "use strict";
  const J = root.J = root.J || (typeof require !== "undefined" ? require("./util.js") : {});

  const DAYS = { mon: 0, monday: 0, tue: 1, tues: 1, tuesday: 1, wed: 2, weds: 2, wednesday: 2, thu: 3, thur: 3, thurs: 3, thursday: 3, fri: 4, friday: 4, sat: 5, saturday: 5, sun: 6, sunday: 6 };
  const MONTHS = { jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11 };
  const DAY_RE = "mon(?:day)?|tue(?:s|sday)?|wed(?:s|nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?";
  const MON_RE = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
  const END = "(?=$|[\\s,.;:!?)])";              // a phrase must end at a word edge
  const PRE = "(^|[\\s(])";                        // and start at one (kept when cutting)
  const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");

  /* Next date (from today, inclusive) that falls on weekday `d` (Mon = 0). */
  const nextDow = (today, d, strictlyNextWeek) => {
    if (strictlyNextWeek) return J.addDays(J.weekStart(today), 7 + d);
    return J.addDays(today, (d - J.dow(today) + 7) % 7);
  };
  /* A day and month with no year: this year, unless that has passed, then next year. */
  const dayMonth = (today, d, m, y) => {
    const ty = +today.slice(0, 4);
    const make = yy => `${yy}-${J.pad2(m + 1)}-${J.pad2(d)}`;
    if (y) { y = +y; if (y < 100) y += 2000; const s = make(y); return J.isValidYmd(s) ? s : null; }
    let s = make(ty);
    if (!J.isValidYmd(s)) return null;
    if (s < today) s = make(ty + 1);
    return J.isValidYmd(s) ? s : null;
  };
  /* 12-hour clock to minutes. With no am/pm, small hours (1–6) are read as afternoon. */
  const toMin = (h, m, mer) => {
    h = +h; m = +(m || 0);
    if (m > 59) return null;
    if (mer) {
      if (h < 1 || h > 12) return null;
      mer = mer.toLowerCase();
      if (mer.startsWith("p") && h !== 12) h += 12;
      if (mer.startsWith("a") && h === 12) h = 0;
    } else if (h > 23) return null;
    return h * 60 + m;
  };

  J.parseQuick = function parseQuick(input, opts = {}) {
    const today = opts.today || J.today();
    const projects = opts.projects || [];
    const ignore = new Set((opts.ignore || []).map(s => s.toLowerCase().trim()));
    const out = { title: "", due: null, start: null, dur: null, project: null, priority: 0, repeat: null, tokens: [], unknownProject: null };
    let text = " " + String(input || "") + " ";
    let tonight = false;

    /* Run a rule: for each match, `fn` returns a token label (accept) or null (leave it). */
    function rule(src, fn) {
      const re = new RegExp(src, "gi");
      text = text.replace(re, (...a) => {
        const whole = a[0], pre = a[1] || "", groups = a.slice(2, -2);
        const phrase = whole.slice(pre.length).trim();
        if (ignore.has(phrase.toLowerCase())) return whole;
        const res = fn(groups, phrase);
        if (!res) return whole;
        out.tokens.push({ type: res.type, text: phrase, label: res.label });
        return pre + " ";
      });
    }

    /* ---- repeats (first, so "every fri" isn't read as a plain date) ---- */
    rule(PRE + `every\\s+(${DAY_RE})` + END, ([d]) => {
      if (out.repeat) return null;
      out.repeat = "weekly";
      if (!out.due) out.due = nextDow(today, DAYS[d.toLowerCase()]);
      return { type: "repeat", label: `Every ${J.DAYL[DAYS[d.toLowerCase()]]}` };
    });
    rule(PRE + "(every\\s+day|daily|every\\s+weekday|weekdays|every\\s+week|weekly)" + END, ([w]) => {
      if (out.repeat) return null;
      w = w.toLowerCase().replace(/\s+/g, " ");
      out.repeat = /weekday/.test(w) ? "weekdays" : /week/.test(w) ? "weekly" : "daily";
      return { type: "repeat", label: J.REPEAT_LABEL[out.repeat] };
    });

    /* ---- time ranges: 9-11am, 9am-11am, 14:00-15:30 ---- */
    rule(PRE + "(?:from\\s+)?(\\d{1,2})(?:[:.](\\d{2}))?\\s*(am|pm|a|p)?\\s*(?:-|–|to)\\s*(\\d{1,2})(?:[:.](\\d{2}))?\\s*(am|pm|a|p)?" + END,
      ([h1, m1, a1, h2, m2, a2]) => {
        if (out.start != null) return null;
        if (!a1 && !a2 && m1 == null && m2 == null) return null;         // "1-2" is just numbers
        let e = toMin(h2, m2, a2), s;
        if (e == null) return null;
        if (a1) s = toMin(h1, m1, a1);
        else if (a2) {                                                    // 9-11am: borrow the am/pm
          s = toMin(h1, m1, a2);
          if (s == null || s >= e) s = toMin(h1, m1, a2.toLowerCase().startsWith("p") ? "am" : "pm");
        } else s = toMin(h1, m1, null);
        if (s == null) return null;
        let dur = e - s; if (dur <= 0) dur += 1440;
        if (dur > 720) return null;
        out.start = s; out.dur = dur;
        return { type: "time", label: J.fmtRange(s, dur) };
      });

    /* ---- durations (before times so "1.5h" never looks like a clock) ---- */
    rule(PRE + "(?:for\\s+)?(\\d+(?:\\.\\d+)?)\\s*(?:h|hr|hrs|hour|hours)(?:\\s*(\\d{1,2})\\s*(?:m|min|mins)?)?" + END, ([h, m]) => {
      if (out.dur != null) return null;
      const d = Math.round(+h * 60 + +(m || 0));
      if (!(d > 0 && d <= 720)) return null;
      out.dur = d;
      return { type: "dur", label: J.fmtDur(d) };
    });
    rule(PRE + "(?:for\\s+)?(\\d{1,3})\\s*(?:m|min|mins|minute|minutes)" + END, ([m]) => {
      if (out.dur != null) return null;
      const d = +m;
      if (!(d > 0 && d <= 720)) return null;
      out.dur = d;
      return { type: "dur", label: J.fmtDur(d) };
    });

    /* ---- times ---- */
    rule(PRE + "(?:at\\s+)?(noon|midday|midnight)" + END, ([w]) => {
      if (out.start != null) return null;
      out.start = /mid ?night/i.test(w) ? 0 : 720;
      return { type: "time", label: J.fmtTime(out.start) };
    });
    rule(PRE + "(?:at\\s+)?(\\d{1,2})(?:[:.](\\d{2}))?\\s*(am|pm|a\\.m\\.|p\\.m\\.)" + END, ([h, m, mer]) => {
      if (out.start != null) return null;
      const t = toMin(h, m, mer.replace(/\./g, ""));
      if (t == null) return null;
      out.start = t;
      return { type: "time", label: J.fmtTime(t) };
    });
    rule(PRE + "(at\\s+)?(\\d{1,2}):(\\d{2})" + END, ([at, h, m]) => {
      if (out.start != null) return null;
      let hh = +h;
      if (h.length === 1 && hh >= 1 && hh <= 6) hh += 12;                  // "3:30" means afternoon
      const t = toMin(hh, m, null);
      if (t == null) return null;
      out.start = t;
      return { type: "time", label: J.fmtTime(t) };
    });
    rule(PRE + "at\\s+(\\d{1,2})" + END, ([h]) => {
      if (out.start != null) return null;
      let hh = +h;
      if (hh >= 1 && hh <= 6) hh += 12;                                    // "at 5" means 5 pm
      if (hh > 23) return null;
      out.start = hh * 60;
      return { type: "time", label: J.fmtTime(out.start) };
    });

    /* ---- dates ---- */
    const setDue = d => {
      if (out.due || !d) return null;
      out.due = d;
      const n = J.diffDays(today, d);
      return { type: "date", label: n === 0 ? "Today" : n === 1 ? "Tomorrow" : J.fmtDate(d) };
    };
    const LEAD = "(?:(?:by|on|due|this)\\s+)?";
    rule(PRE + LEAD + "(today|tod|tonight|tomorrow|tmrw|tmr|tomoz)" + END, ([w]) => {
      w = w.toLowerCase();
      if (w === "tonight") tonight = true;
      return setDue(w.startsWith("to") && w !== "tomorrow" && w !== "tomoz" ? today : J.addDays(today, 1));
    });
    rule(PRE + "in\\s+(\\d{1,3}|a|an|one|two|three)\\s+(day|days|week|weeks|wk|wks)" + END, ([n, u]) => {
      const num = { a: 1, an: 1, one: 1, two: 2, three: 3 }[n.toLowerCase()] || +n;
      return setDue(J.addDays(today, num * (/^w/i.test(u) ? 7 : 1)));
    });
    rule(PRE + "next\\s+week" + END, () => setDue(J.addDays(J.weekStart(today), 7)));
    rule(PRE + "(next\\s+)?weekend" + END, ([nx]) => {
      const d = J.dow(today) >= 5 && !nx ? today : J.addDays(J.weekStart(today), (nx ? 7 : 0) + 5);
      return setDue(d);
    });
    rule(PRE + LEAD + "(next\\s+)?(" + DAY_RE + ")" + END, ([nx, d]) => setDue(nextDow(today, DAYS[d.toLowerCase()], !!nx)));
    rule(PRE + LEAD + "(\\d{1,2})(?:st|nd|rd|th)?\\s+(" + MON_RE + ")(?:,?\\s+(\\d{4}))?" + END,
      ([d, m, y]) => setDue(dayMonth(today, +d, MONTHS[m.toLowerCase()], y)));
    rule(PRE + LEAD + "(" + MON_RE + ")\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?" + END,
      ([m, d, y]) => setDue(dayMonth(today, +d, MONTHS[m.toLowerCase()], y)));
    rule(PRE + LEAD + "(\\d{4})-(\\d{2})-(\\d{2})" + END, ([y, m, d]) => { const s = `${y}-${m}-${d}`; return J.isValidYmd(s) ? setDue(s) : null; });
    rule(PRE + LEAD + "(\\d{1,2})/(\\d{1,2})(?:/(\\d{2,4}))?" + END, ([d, m, y]) => {
      if (+m < 1 || +m > 12) return null;
      return setDue(dayMonth(today, +d, +m - 1, y));
    });

    /* ---- project ---- */
    rule(PRE + "#([\\w][\\w-]*)" + END, ([tag]) => {
      if (out.project) return null;
      const t = norm(tag);
      const hit = projects.find(p => norm(p.name) === t) || projects.find(p => norm(p.name).startsWith(t)) || (t.length >= 3 && projects.find(p => norm(p.name).includes(t)));
      if (!hit) { out.unknownProject = tag; return null; }
      out.project = hit.id;
      return { type: "project", label: hit.name };
    });

    /* ---- priority ---- */
    rule(PRE + "(!{1,3}|p[123]|!high|!med|!medium|!low)" + END, ([w]) => {
      if (out.priority) return null;
      w = w.toLowerCase();
      out.priority = w[0] === "p" ? 4 - +w[1] : w === "!high" ? 3 : w === "!low" ? 1 : w.startsWith("!med") ? 2 : w.length;
      return { type: "priority", label: ["", "Low", "Medium", "High"][out.priority] + " priority" };
    });

    /* ---- defaults that follow from what was said ---- */
    if (tonight && out.start == null) out.start = 19 * 60;
    if (out.start != null && !out.due) out.due = today;
    if (out.repeat && !out.due) out.due = out.repeat === "weekdays" ? J.nextFit("weekdays", today) : today;

    out.title = text.replace(/\s+/g, " ").replace(/^[\s,;:–-]+|[\s,;:–-]+$/g, "").trim();
    return out;
  };

  if (typeof module !== "undefined") module.exports = J;
})(typeof window !== "undefined" ? window : globalThis);
