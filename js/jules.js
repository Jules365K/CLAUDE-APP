/* JULES · jules.js
   Jules the assistant: Claude, built into the app, but not a chat window. Jules is around the room:
   - Subtitles: what Jules says appears at the bottom of the screen like a film's subtitles,
     spoken aloud too if the voice is on, and fades when it's done.
   - The line: press ⌘J (or the Jules mark) and one line opens to type or talk into.
   - Drafts: when you ask for a change, it appears as a draft: on the task itself where it's on
     screen, and in a small tray. One tap confirms it; nothing changes until you do.
   - Margin notes: small remarks written beside things on each page (overdue tasks, packing,
     emails waiting), worked out on this device without asking Claude.
   - Jules can see your tasks, calendar, mail flags, projects and the flight path.
   - Jules never changes anything by itself: it proposes changes, and each one waits for
     your Confirm.
   - Briefings: a morning rundown on the first open of the day, an evening wrap-up on request.
   - Nudges: a heads-up ten minutes before a timed task or event, and an evening check on
     anything still open from today.
   Claude runs on your own Claude account (the `sample` capability); the voice is `tts`;
   talking back is `dictation`. Each one is optional: without it, that part just hides. */
(function () {
  "use strict";
  const J = window.J, S = J.store, { $, $$, esc } = J;

  const JU = J.jules = { open: false, busy: false, speaking: false, turns: [], drafts: [], last: "", ready: null, brief: null, briefBusy: false };
  let sample = null, tts = null, dict = null, listening = false;
  const VOICES = [["buttery", "Buttery (default)"], ["airy", "Airy"], ["glassy", "Glassy"], ["rounded", "Rounded"]];
  JU.VOICES = VOICES;

  /* ---------- preferences (synced with the rest of your settings) ---------- */
  const DEF = { on: true, name: "buttery", rate: 1, briefings: true, nudges: true, nudgeVoice: true, nudgeLead: 10 };
  JU.prefs = () => Object.assign({}, DEF, (S.meta().voice || {}));
  JU.setPrefs = part => S.put("meta", Object.assign({}, S.meta(), { id: "app", voice: Object.assign(JU.prefs(), part) }));

  /* ---------- what Jules can see: a compact picture of your world ---------- */
  function snapshot() {
    const today = J.today(), all = S.list("tasks"), proj = new Map(S.list("projects").map(p => [p.id, p]));
    const t = x => ({ id: x.id, title: x.title, due: x.due, time: x.start != null ? J.hm(x.start) : undefined, mins: x.dur || undefined, project: x.project ? (proj.get(x.project) || {}).name : undefined, priority: x.priority || undefined, repeat: x.repeat || undefined, status: x.status });
    const open = all.filter(x => x.status !== "done");
    const days = Array.from({ length: 8 }, (_, i) => J.addDays(today, i));
    const cal = [];
    days.forEach(d => (J.gcal ? J.gcal.eventsOn(d) : []).forEach(e => {
      if (e.auto) return;
      cal.push({ date: d, time: e.allDay ? "all day" : `${J.hm(e.segStart)}-${J.hm(e.segEnd % 1440 === 0 && e.segEnd ? 1440 : e.segEnd)}`, title: e.title, calendar: e.calName });
    }));
    const focus = J.gcal ? days.slice(0, 1).reduce((n, d) => n + J.gcal.eventsOn(d).filter(e => e.auto).length, 0) : 0;
    const M = J.mail;
    const mail = M && M.state === "ok" ? { needsReply: M.items.filter(m => M.needsReply(m)).slice(0, 8).map(m => ({ from: m.fromName || m.fromEmail, subject: m.subject })) } : { status: "not connected" };
    const path = J.pathItems ? J.pathItems() : [];
    const meta = S.meta();
    const nowD = new Date(J._now || Date.now());
    return {
      now: `${J.fmtDate(today, { long: true, year: true })}, ${J.hm(J.nowMin())}`,
      name: meta.name || "",
      tasksToday: open.filter(x => x.due === today).map(t),
      overdue: open.filter(x => x.due && x.due < today).map(t),
      doneToday: all.filter(x => x.status === "done" && x.doneAt && J.ymd(new Date(x.doneAt)) === today).map(x => x.title),
      nextSevenDays: open.filter(x => x.due > today && x.due <= J.addDays(today, 7)).map(t),
      inbox: open.filter(x => !x.due).slice(0, 15).map(t),
      calendar: cal.slice(0, 40),
      reclaimBlocksToday: focus || undefined,
      mail,
      countdowns: (meta.countdowns || []).filter(c => J.daysUntil(c.date) >= 0).map(c => ({ label: c.label, date: c.date, days: J.daysUntil(c.date) })),
      projects: S.list("projects").filter(p => p.status !== "landed").map(p => { const ts = all.filter(x => x.project === p.id); return { id: p.id, name: p.name, status: p.status, done: ts.filter(x => x.status === "done").length, total: ts.length }; }),
      flightPath: path.filter(x => (x.kind === "event" ? x.at : x.to) >= today).slice(0, 4).map(x => ({ title: x.title, from: x.from || x.at, to: x.to || undefined, estimate: x.estimate || undefined })),
      trip: J.trip ? J.trip.summary() || undefined : undefined,
      habits: J.journal ? J.journal.summary() || undefined : undefined,
      ideas: J.studio && J.studio.summary ? J.studio.summary().ideas : undefined,
      flashcards: J.notes && J.notes.summary ? J.notes.summary() : undefined,
      weekday: J.DAYL[J.dow(today)], hour: nowD.getHours()
    };
  }

  const persona = () => [
    `You are Jules, the assistant built into ${S.meta().name ? S.meta().name + "'s" : "its owner's"} personal app, a rocket-themed mission control.`,
    "Voice: calm, polished, lightly formal, with dry, understated British wit. Address him as \"sir\" now and then, never every message. Never gush or over-praise. Be honest: flag problems plainly and tell him when he's wrong, politely.",
    "Your words are usually read aloud: keep replies to one to three short sentences unless he asks for more. No markdown, no lists, no emoji."
  ].join("\n");

  /* ---------- chat ---------- */
  const ACTIONS_HELP = [
    "You cannot change anything yourself. When he asks for a change, propose actions; he confirms each one before it happens. Say what you propose in your reply.",
    "Action types (use only task and project ids from the data; dates YYYY-MM-DD; times HH:MM, 24-hour; mins = minutes):",
    '{"type":"add_task","title":"…","due":"YYYY-MM-DD"?,"time":"HH:MM"?,"mins":60?,"project":"<project id>"?,"priority":0-3?,"notes":"…"?}',
    '{"type":"update_task","id":"<task id>", then any of title, due, time, mins, project, priority, notes; use null to clear due or time}',
    '{"type":"complete_task","id":"<task id>"}',
    '{"type":"delete_task","id":"<task id>"}',
    'Reply with only JSON: {"say":"<what you say to him>","actions":[…]}. Use an empty actions list when nothing should change.'
  ].join("\n");

  function describeAction(a) {
    const tk = a.id && S.get("tasks", a.id);
    const when = (due, time, mins) => [due ? J.relDay(due) + (J.daysUntil(due) > 1 ? " " + J.fmtDate(due, { noDay: true }) : "") : "", time ? J.fmtTime(J.parseHM(time)) : "", mins ? J.fmtDur(+mins) : ""].filter(Boolean).join(", ");
    if (a.type === "add_task") return `Add “${a.title}”${when(a.due, a.time, a.mins) ? " · " + when(a.due, a.time, a.mins) : ""}`;
    if (!tk) return null;
    if (a.type === "complete_task") return `Tick off “${tk.title}”`;
    if (a.type === "delete_task") return `Delete “${tk.title}”`;
    if (a.type === "update_task") {
      const bits = [];
      if (a.title && a.title !== tk.title) bits.push(`rename to “${a.title}”`);
      if ("due" in a || "time" in a || "mins" in a) bits.push(a.due === null ? "remove the date" : "move to " + (when(a.due || tk.due, a.time === null ? "" : (a.time || (tk.start != null ? J.hm(tk.start) : "")), a.mins || tk.dur) || "no date"));
      if (a.priority != null) bits.push(["no", "low", "medium", "high"][a.priority] + " priority");
      if (a.project !== undefined) bits.push(a.project ? "project " + ((S.get("projects", a.project) || {}).name || "?") : "no project");
      if (a.notes) bits.push("add notes");
      return `“${tk.title}”: ${bits.join(", ") || "update"}`;
    }
    return null;
  }
  function applyAction(a) {
    const A = J.act;
    if (a.type === "add_task") return A.add({ title: String(a.title).slice(0, 200), due: J.isValidYmd(a.due) ? a.due : null, start: a.time ? J.parseHM(a.time) : null, dur: a.mins ? +a.mins : (a.time ? 60 : null), project: a.project && S.get("projects", a.project) ? a.project : null, priority: Math.max(0, Math.min(3, +a.priority || 0)), notes: a.notes || "" });
    const tk = S.get("tasks", a.id); if (!tk) return;
    if (a.type === "complete_task") return A.toggle(tk.id);
    if (a.type === "delete_task") return A.remove(tk.id);
    if (a.type === "update_task") {
      const part = {};
      if (a.title) part.title = String(a.title).slice(0, 200);
      if ("due" in a) part.due = a.due === null ? null : (J.isValidYmd(a.due) ? a.due : tk.due);
      if ("time" in a) part.start = a.time === null ? null : J.parseHM(a.time);
      if (a.mins) part.dur = +a.mins;
      if (a.priority != null) part.priority = Math.max(0, Math.min(3, +a.priority));
      if (a.project !== undefined) part.project = a.project && S.get("projects", a.project) ? a.project : null;
      if (a.notes) part.notes = (tk.notes ? tk.notes + "\n\n" : "") + a.notes;
      if (part.due === null) part.start = null;
      if (part.start != null && !tk.dur && !part.dur) part.dur = 60;
      return A.update(tk.id, part);
    }
  }

  async function ask(text) {
    text = String(text || "").trim();
    if (!text || JU.busy) return;
    if (!sample) { say("I need Claude to answer, and Claude is only here when Jules is opened in claude.ai or as the installed app.", { speak: false }); return; }
    JU.turns.push({ role: "user", content: text });
    JU.busy = true; drawSub(); drawLine();
    const ctx = `${persona()}\n\n${ACTIONS_HELP}\n\nHis data right now (JSON):\n${JSON.stringify(snapshot())}`;
    const turns = [{ role: "user", content: ctx }, { role: "assistant", content: "Understood." }, ...JU.turns.slice(-12)];
    try {
      const res = await sample.json(turns, { modelTier: "quick", cache: false });
      const line = String((res && res.say) || "").trim() || "Done thinking, though I've nothing useful to add.";
      const acts = (Array.isArray(res && res.actions) ? res.actions : []).map(a => ({ a, label: describeAction(a), state: "pending" })).filter(x => x.label);
      JU.turns.push({ role: "assistant", content: JSON.stringify({ say: line, actions: acts.map(x => x.a) }) });
      JU.busy = false;
      addDrafts(acts);
      say(line);
    } catch (e) {
      JU.turns.pop();
      JU.busy = false;
      say(errText(e), { speak: false, err: true });
    }
    drawLine();
  }
  JU.ask = ask;
  function errText(e) {
    const c = e && e.code;
    if (c === "not_granted" || c === "sampling_disabled") return "Claude isn't allowed for Jules right now. You can allow it the next time claude.ai asks.";
    if (c === "rate_limited") return "Claude needs a breather. Try again in a minute.";
    if (c === "invalid_json") return "I garbled that answer. Ask me again?";
    return "That didn't go through. Try again in a moment.";
  }

  /* ---------- voice ---------- */
  function speak(text) {
    const p = JU.prefs();
    if (!tts || !p.on || !text) return Promise.resolve();
    return tts.speak(String(text).slice(0, 2000), { voice: p.name, rate: p.rate }).catch(() => {});
  }
  JU.speak = speak;
  JU.stop = () => { if (tts) { try { tts.stop(); } catch (e) {} } };
  /* Dictation's listeners are attached once (in JU.ready) and write into whichever session is live. */
  let dBase = "", dFinals = "";
  function wireDictation() {
    dict.onPartial(({ text }) => { const i = $("#julesIn"); if (listening && i) i.value = dBase + dFinals + text; });
    dict.onFinal(({ text }) => { dFinals += text + " "; const i = $("#julesIn"); if (listening && i) i.value = dBase + dFinals; });
    dict.onState(({ state }) => {
      if (state === "idle" && listening) {
        const i = $("#julesIn"), v = i ? i.value.trim() : "";
        listening = false;
        if (i) i.value = "";
        if (v) ask(v); else drawLine();
      }
    });
  }
  async function mic() {
    if (!dict) return;
    if (listening) { try { await dict.stop(); } catch (e) {} return; }
    const input = $("#julesIn");
    dBase = input.value ? input.value.trim() + " " : ""; dFinals = "";
    dict.start().catch(e => { listening = false; if (e && e.code === "not_granted") dict = null; drawLine(); });
    listening = true; JU.stop(); drawLine();
  }

  /* ---------- briefings ---------- */
  const briefKey = () => "brief-" + J.today();
  JU.briefFor = () => (S.get("meta", briefKey()) || {});
  async function makeBrief(kind) {
    if (!sample || JU.briefBusy) return null;
    JU.briefBusy = kind; drawSub(); if (J.render && J.ui.view === "home") J.render();
    const what = kind === "morning"
      ? "Write his morning briefing, to be spoken aloud: 60 to 110 words in natural sentences. Cover the day ahead (first commitments with times, how full it is), anything overdue, emails waiting for a reply if any, and the nearest countdown. End with one dry, encouraging line. No greeting beyond a short 'Good morning'."
      : "Write his evening wrap-up, to be spoken aloud: 50 to 100 words in natural sentences. Say what got done today, what is still open (suggest moving it if sensible), and what tomorrow starts with. End with one dry line. No greeting beyond a short 'Good evening'.";
    try {
      const { text } = await sample(`${persona()}\n\n${what}\nPlain text only.\n\nHis data (JSON):\n${JSON.stringify(snapshot())}`, { modelTier: "default", cache: { gcTime: 6 * 3600 * 1000 } });
      const rec = Object.assign({ id: briefKey() }, JU.briefFor(), { [kind]: { text: text.trim(), at: Date.now() } });
      S.put("meta", rec);
      JU.briefBusy = false; drawSub();
      return text.trim();
    } catch (e) {
      JU.briefBusy = false; drawSub();
      J.toast(kind === "morning" ? "The briefing didn't come through." : "The wrap-up didn't come through.");
      return null;
    }
  }
  JU.playBrief = async kind => {
    let b = JU.briefFor()[kind];
    if (!b) { const t = await makeBrief(kind); if (!t) return; b = { text: t }; }
    JU.turns.push({ role: "assistant", content: JSON.stringify({ say: b.text, actions: [] }) });
    say(b.text, { brief: kind });
  };
  JU.canTalk = () => !!sample;
  JU.canSpeak = () => !!tts;

  /* First open of the day, before evening: prepare the morning briefing quietly (it's spoken only when you press play). */
  function maybeMorning() {
    const p = JU.prefs(), h = new Date(J._now || Date.now()).getHours();
    if (!sample || !p.briefings || h < 4 || h >= 17 || JU.briefFor().morning) return;
    makeBrief("morning").then(() => { if (J.ui && J.ui.view === "home" && J.render) J.render(); });
  }

  /* ---------- nudges ---------- */
  const NK = "jules5:nudged";
  const nudged = (() => { try { const v = JSON.parse(localStorage.getItem(NK)) || {}; return v.day === J.today() ? new Set(v.keys) : new Set(); } catch (e) { return new Set(); } })();
  const saveNudged = () => { try { localStorage.setItem(NK, JSON.stringify({ day: J.today(), keys: [...nudged] })); } catch (e) {} };
  function nudge(text, key) {
    nudged.add(key); saveNudged();
    const p = JU.prefs();
    if (J.desktopNotify) J.desktopNotify(text);
    say(text, { speak: p.nudgeVoice });
  }
  function checkNudges() {
    const p = JU.prefs();
    if (!p.nudges) return;
    const today = J.today(), nm = J.nowMin(), lead = p.nudgeLead || 10;
    const soon = [];
    S.list("tasks").forEach(t => { if (t.due === today && t.start != null && t.status !== "done") soon.push({ key: "t:" + t.id + ":" + t.start, title: t.title, start: t.start }); });
    if (J.gcal) J.gcal.eventsOn(today).forEach(e => { if (!e.allDay && !e.auto) soon.push({ key: "e:" + e.id + ":" + e.segStart, title: e.title, start: e.segStart }); });
    soon.forEach(x => {
      const until = x.start - nm;
      if (until > 0 && until <= lead && !nudged.has(x.key)) nudge(`${x.title} in ${until} minute${until === 1 ? "" : "s"}${Math.random() < .35 ? ", sir" : ""}.`, x.key);
    });
    /* evening check: anything still open from today */
    const h = new Date(J._now || Date.now()).getHours();
    if (h >= 20 && !nudged.has("evening:" + today)) {
      const left = S.list("tasks").filter(t => t.due === today && t.status !== "done");
      if (left.length) {
        nudged.add("evening:" + today); saveNudged();
        const acts = left.slice(0, 6).map(t => { const a = { type: "update_task", id: t.id, due: J.addDays(today, 1) }; return { a, label: describeAction(a), state: "pending" }; });
        addDrafts(acts);
        J.desktopNotify && J.desktopNotify(`${left.length} still open from today. Jules has drafted moving ${left.length === 1 ? "it" : "them"} to tomorrow.`);
        say(`${left.length === 1 ? "One thing is" : left.length + " things are"} still open from today. I've drafted moving ${left.length === 1 ? "it" : "them"} to tomorrow, if you'd like.`, { speak: false });
      }
    }
  }

  /* ---------- subtitles ---------- */
  /* What Jules says, shown a sentence or two at a time at the bottom of the screen. Timed to
     roughly how long it takes to say; hover to hold it. */
  let subQ = [], subT = 0, subHold = false, subErr = false;
  function chunks(text) {
    const sents = String(text).replace(/\s+/g, " ").trim().match(/[^.!?…]+[.!?…]+["”’)]*|[^.!?…]+$/g) || [text];
    const out = []; let cur = "";
    sents.forEach(x => { x = x.trim(); if ((cur + " " + x).trim().length > 150 && cur) { out.push(cur); cur = x; } else cur = (cur + " " + x).trim(); });
    if (cur) out.push(cur);
    return out;
  }
  function say(text, o = {}) {
    text = String(text || "").trim(); if (!text) return;
    JU.last = text; subErr = !!o.err;
    subQ = chunks(text);
    if (o.speak !== false) speak(text);
    clearTimeout(subT);
    nextSub();
  }
  JU.say = say;
  function nextSub() {
    const box = $("#julesSub"); if (!box) return;
    const line = subQ.shift();
    if (line == null) { box.classList.remove("on"); return; }
    box.innerHTML = `<p class="${subErr ? "err" : ""}">${esc(line)}</p>`;
    box.classList.remove("on"); void box.offsetWidth; box.classList.add("on");
    const rate = JU.prefs().rate || 1;
    const ms = Math.max(2600, line.length * 62 / rate) + (subQ.length ? 0 : 1800);
    const tick = () => { if (subHold) { subT = setTimeout(tick, 400); return; } nextSub(); };
    subT = setTimeout(tick, ms);
  }
  function drawSub() {
    const box = $("#julesSub"); if (!box) return;
    if (JU.busy || JU.briefBusy) {
      clearTimeout(subT); subQ = [];
      box.innerHTML = `<p class="thinking"><span class="dots"><i></i><i></i><i></i></span>${JU.briefBusy ? `<span>Preparing the ${JU.briefBusy === "morning" ? "briefing" : "wrap-up"}</span>` : ""}</p>`;
      box.classList.add("on");
    } else if (box.querySelector(".thinking")) box.classList.remove("on");
  }

  /* ---------- drafts: proposed changes, waiting for one tap ---------- */
  function addDrafts(acts) {
    acts.forEach(x => { x.key = J.uid("d"); JU.drafts.push(x); });
    JU.drafts = JU.drafts.filter(x => x.state === "pending").slice(-8);
    drawTray(); markRows();
  }
  function settle(key, yes) {
    const x = JU.drafts.find(d => d.key === key); if (!x || x.state !== "pending") return;
    if (yes) { try { applyAction(x.a); x.state = "done"; } catch (e) { x.state = "failed"; } } else x.state = "skipped";
    JU.drafts = JU.drafts.filter(d => d.state === "pending");
    drawTray(); markRows();
    if (yes && x.state === "done") J.toast(x.label.replace(/^“([^”]*)”:/, "$1:"), null, 2600);
  }
  JU.settle = settle;
  function drawTray() {
    const box = $("#julesTray"); if (!box) return;
    const ds = JU.drafts.filter(d => d.state === "pending");
    box.hidden = !ds.length;
    box.innerHTML = ds.length ? `<p class="jl-tray-h">${ds.length === 1 ? "A draft" : ds.length + " drafts"} from Jules${ds.length > 1 ? `<button type="button" class="link" data-jall>Do all</button>` : ""}</p>` +
      ds.map(d => `<div class="jl-draft"><span>${esc(d.label)}</span><span class="row"><button type="button" class="ibtn ok" data-jok="${d.key}" aria-label="Do it: ${esc(d.label)}">${J.icon.check}</button><button type="button" class="ibtn" data-jno="${d.key}" aria-label="Skip: ${esc(d.label)}">${J.icon.close}</button></span></div>`).join("") : "";
  }
  /* A draft that touches a task on screen is shown on that task too. */
  function markRows() {
    $$("#view .trow.drafted").forEach(r => { r.classList.remove("drafted"); const c = $(".jl-mark", r); if (c) c.remove(); });
    JU.drafts.filter(d => d.state === "pending" && d.a.id).forEach(d => {
      $$(`#view .trow[data-task="${CSS.escape(d.a.id)}"]`).forEach(r => {
        r.classList.add("drafted");
        const m = document.createElement("span"); m.className = "jl-mark";
        m.innerHTML = `<em>${esc(draftVerb(d.a))}</em><button type="button" class="ibtn ok" data-jok="${d.key}" aria-label="Do it">${J.icon.check}</button><button type="button" class="ibtn" data-jno="${d.key}" aria-label="Skip">${J.icon.close}</button>`;
        r.appendChild(m);
      });
    });
  }
  function draftVerb(a) {
    if (a.type === "complete_task") return "Jules: tick off?";
    if (a.type === "delete_task") return "Jules: delete?";
    const l = describeAction(a) || ""; const i = l.indexOf(":");
    return "Jules: " + (i > 0 ? l.slice(i + 1).trim() : "update") + "?";
  }

  /* ---------- margin notes ---------- */
  /* Worked out here, from your data, each time a page is drawn. Each rule returns where to write
     and what; only the first few that apply are shown, so the margins stay quiet. */
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const NOTES = {
    home: () => {
      const out = [], today = J.today(), open = S.list("tasks").filter(t => t.status !== "done");
      const late = open.filter(t => t.due && t.due < today);
      if (late.length) out.push(["#h-today .cs-head", `${plural(late.length, "task")} overdue. They won't do themselves, sir.`]);
      const tdy = open.filter(t => t.due === today);
      if (!tdy.length && !late.length) out.push(["#h-today .cs-head", "Nothing booked today. Unusual, but not unwelcome."]);
      const due = J.notes && J.notes.dueCount ? J.notes.dueCount(null) : 0;
      if (due >= 5) out.push(["#h-today .cs-head", `${due} flashcards due. Ten minutes now saves an hour later.`]);
      const trip = J.trip && J.trip.summary && J.trip.summary();
      if (trip && trip.daysToGo != null && trip.daysToGo >= 0 && trip.daysToGo <= 14) out.push(["#h-launch .count-what", `${trip.packed} packed so far.`]);
      return out;
    },
    tasks: () => {
      const out = [], today = J.today(), open = S.list("tasks").filter(t => t.status !== "done");
      const late = open.filter(t => t.due && t.due < today).sort((a, b) => a.due.localeCompare(b.due));
      if (late.length) out.push([".grp.late .grp-h", `The oldest has waited since ${J.fmtDate(late[0].due)}. Do it, move it, or let it go.`]);
      const inbox = open.filter(t => !t.due);
      if (inbox.length >= 6) out.push([".grp[data-date=''] .grp-h", `${inbox.length} with no date. A date is a decision.`]);
      const tom = open.filter(t => t.due === J.addDays(today, 1)).reduce((n, t) => n + (t.dur || 30), 0);
      if (tom > 8 * 60) out.push([`.grp[data-date='${J.addDays(today, 1)}'] .grp-h`, `Tomorrow holds ${Math.round(tom / 60)} hours. Ambitious.`]);
      return out;
    },
    mail: () => {
      const M = J.mail; if (!M || M.state !== "ok") return [];
      const waiting = M.items.filter(m => M.needsReply(m) && m.ts).sort((a, b) => a.ts - b.ts);
      if (!waiting.length) return [];
      const d = Math.floor((Date.now() - waiting[0].ts) / 864e5);
      return d >= 2 ? [[".mgroup:not(.rest):not(.soon) .grp-h", `The oldest has waited ${d} days for you.`]] : [];
    },
    trip: () => {
      const t = J.trip && J.trip.summary && J.trip.summary(); if (!t) return [];
      const out = [], [done, all] = t.packed.split(" of ").map(Number);
      if (t.daysToGo != null && t.daysToGo >= 0 && t.daysToGo <= 7 && all && done / all < .5) out.push([".tr-pack header", `${all - done} to pack, ${plural(t.daysToGo, "day")} to go.`]);
      if (t.beforeYouGoLeft.length && t.daysToGo != null && t.daysToGo <= 10) out.push([".tr-prep header", `Start with: ${t.beforeYouGoLeft[0].toLowerCase()}.`]);
      if (t.stops.some(s => !s.from)) out.push([".tr-route", "Some stops have no dates yet. Tap one to set them."]);
      return out;
    },
    notes: () => {
      const N = J.notes; if (!N || N.review || N.open) return [];
      const due = N.dueCount(null), mine = N.course ? N.dueCount(N.course) : 0;
      return due ? [[".nt-head", mine && mine !== due ? `${mine} due here, ${due} across everything.` : `${due} due. They get easier the sooner you see them.`]] : [];
    },
    journal: () => {
      const J2 = J.journal, hs = J2 && J2.habits(); if (!hs) return [];
      const out = [], h = new Date(J._now || Date.now()).getHours();
      const sleep = hs.find(x => /midnight|sleep|bed/i.test(x.name));
      if (sleep && h >= 22 && !(J2.summary().today.find(t => t.habit === sleep.name) || {}).done) out.push([".jn-left .hb-strip", h >= 23 ? "It's past eleven, sir. The midnight habit is looking optimistic." : "Two hours to midnight, if that habit still matters."]);
      const best = J2.summary().today.filter(t => t.streak >= 3).sort((a, b) => b.streak - a.streak)[0];
      if (best && !best.done) out.push([".jn-left .hb-strip", `${best.habit}: ${best.streak} days running. Today would make it ${best.streak + 1}.`]);
      return out;
    },
    projects: () => {
      if (J.ui.project) return [];
      const quiet = S.list("projects").filter(p => p.status === "burning" && !S.list("tasks").some(t => t.project === p.id && t.status !== "done"));
      return quiet.length ? [[".pgroup .grp-h", `${quiet[0].name} is marked as burning, with nothing left to do in it.`]] : [];
    }
  };
  function writeNotes() {
    $$("#view .mnote.auto").forEach(n => n.remove());
    const fn = NOTES[J.ui && J.ui.view];
    if (!fn) return;
    let list = []; try { list = fn(); } catch (e) { return; }
    list.slice(0, 3).forEach(([sel, text]) => {
      const at = $(`#view ${sel.split(",").join(", #view ")}`); if (!at) return;
      const n = document.createElement("p"); n.className = "mnote auto"; n.innerHTML = `<span class="mn-by">Jules</span>${esc(text)}`;
      at.insertAdjacentElement("afterend", n);
    });
  }
  /* Called by the app after every page is drawn. */
  JU.afterRender = () => { markRows(); writeNotes(); };

  /* ---------- the line: type or talk ---------- */
  const CHIPS = [["Brief me", () => JU.playBrief(new Date(J._now || Date.now()).getHours() >= 17 ? "evening" : "morning")], ["What's next?", () => ask("What's next for me?")], ["Plan tomorrow", () => ask("Help me plan tomorrow.")], ["Anything I'm forgetting?", () => ask("Is there anything I'm forgetting or letting slip?")]];
  function drawLine() {
    const box = $("#julesLine"); if (!box) return;
    box.hidden = !JU.open;
    const btn = $("#julesBtn"); if (btn) { btn.classList.toggle("on", JU.open); btn.classList.toggle("speaking", JU.speaking); }
    if (!JU.open) return;
    const prev = $("#julesIn"), keep = prev ? { v: prev.value, f: document.activeElement === prev } : null;
    box.innerHTML = `${!JU.busy ? `<div class="jl-chips">${CHIPS.map(([l], i) => `<button type="button" class="chip-btn" data-chip="${i}">${esc(l)}</button>`).join("")}${JU.last ? `<button type="button" class="chip-btn" data-again>Say that again</button>` : ""}</div>` : ""}
      <form class="jl-form" id="juForm" autocomplete="off">${dict ? `<button type="button" class="ibtn ju-mic${listening ? " on" : ""}" id="juMic" aria-pressed="${listening}" aria-label="${listening ? "Stop listening and send" : "Talk"}">${ICON_MIC}</button>` : ""}
        <input id="julesIn" type="text" placeholder="${listening ? "Listening…" : sample ? "Ask Jules, or tell it what to change" : "Jules needs claude.ai to answer"}" ${sample ? "" : "disabled"} maxlength="600" aria-label="Ask Jules">
        ${tts ? `<button type="button" class="ibtn${JU.prefs().on ? " on" : ""}" id="juVoice" aria-pressed="${JU.prefs().on}" title="${JU.prefs().on ? "Voice on" : "Voice off"}" aria-label="Voice">${JU.prefs().on ? ICON_SPK : ICON_MUTE}</button>` : ""}
        <button type="submit" class="ibtn" aria-label="Send" ${sample ? "" : "disabled"}>${ICON_SEND}</button></form>`;
    const ni = $("#julesIn"); if (keep) { ni.value = keep.v; if (keep.f && !ni.disabled) ni.focus(); }
    $("#juForm").onsubmit = e => { e.preventDefault(); const i = $("#julesIn"); const v = i.value; i.value = ""; ask(v); };
    const mb = $("#juMic"); if (mb) mb.onclick = mic;
    const vb = $("#juVoice"); if (vb) vb.onclick = () => { const on = !JU.prefs().on; JU.setPrefs({ on }); if (!on) JU.stop(); drawLine(); };
    $$("[data-chip]", box).forEach(b => b.onclick = () => CHIPS[+b.dataset.chip][1]());
    const ag = $("[data-again]", box); if (ag) ag.onclick = () => say(JU.last);
  }
  const ICON_SPK = `<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 6h2.4L8.5 3v10L4.9 10H2.5z"/><path d="M11 5.6a3.4 3.4 0 0 1 0 4.8M12.8 3.8a6 6 0 0 1 0 8.4"/></svg>`;
  const ICON_MUTE = `<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 6h2.4L8.5 3v10L4.9 10H2.5z"/><path d="m11 6 3.5 4M14.5 6 11 10"/></svg>`;
  const ICON_MIC = `<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><rect x="5.8" y="2" width="4.4" height="7.6" rx="2.2"/><path d="M3.6 8a4.4 4.4 0 0 0 8.8 0M8 12.4V14.5"/></svg>`;
  const ICON_SEND = `<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 8h10M8.5 3.5 13 8l-4.5 4.5"/></svg>`;
  JU.ICON_SPK = ICON_SPK;

  JU.toggle = on => {
    JU.open = on == null ? !JU.open : !!on;
    drawLine();
    if (JU.open) { setTimeout(() => { const i = $("#julesIn"); if (i && !i.disabled) i.focus(); }, 60); J.overlay && J.overlay.push("jules", () => JU.toggle(false)); }
    else J.overlay && J.overlay.pop("jules");
  };

  /* Clicks on drafts (tray or on a task row) and on the subtitles. */
  document.addEventListener("click", e => {
    const ok = e.target.closest("[data-jok]"), no = e.target.closest("[data-jno]"), all = e.target.closest("[data-jall]");
    if (ok) { e.stopPropagation(); e.preventDefault(); settle(ok.dataset.jok, true); return; }
    if (no) { e.stopPropagation(); e.preventDefault(); settle(no.dataset.jno, false); return; }
    if (all) { JU.drafts.filter(d => d.state === "pending").map(d => d.key).forEach(k => settle(k, true)); return; }
    if (e.target.closest("#julesSub p:not(.thinking)")) { if (!JU.open) JU.toggle(true); }
  }, true);

  JU.ready = (async () => {
    [sample, tts, dict] = await Promise.all(["sample", "tts", "dictation"].map(n => J.cap(n)));
    if (dict) wireDictation();
    if (tts) tts.onState(({ state }) => { JU.speaking = state === "speaking"; const b = $("#julesBtn"); if (b) b.classList.toggle("speaking", JU.speaking); const sb = $("#julesSub"); if (sb) sb.classList.toggle("speaking", JU.speaking); });
    const sb = $("#julesSub"); if (sb) { sb.addEventListener("mouseenter", () => { subHold = true; }); sb.addEventListener("mouseleave", () => { subHold = false; }); }
    await S.ready;
    maybeMorning();
    JU.checkNudges = checkNudges;
    setInterval(checkNudges, 30000);
    setTimeout(checkNudges, 4000);
    drawLine(); drawTray();
    return true;
  })();
})();
