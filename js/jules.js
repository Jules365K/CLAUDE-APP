/* JULES · jules.js
   Jules the assistant: Claude, built into the app.
   - You type (or talk, where dictation is available) and Jules answers in a few sentences,
     spoken aloud in a Claude voice if you like.
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

  const JU = J.jules = { open: false, busy: false, speaking: false, turns: [], items: [], ready: null, brief: null, briefBusy: false };
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
    if (!sample) { push({ who: "jules", text: "I need Claude to answer, and Claude is only available when Jules is opened in claude.ai or as the installed app." }); return; }
    push({ who: "you", text });
    JU.turns.push({ role: "user", content: text });
    JU.busy = true; draw();
    const ctx = `${persona()}\n\n${ACTIONS_HELP}\n\nHis data right now (JSON):\n${JSON.stringify(snapshot())}`;
    const turns = [{ role: "user", content: ctx }, { role: "assistant", content: "Understood." }, ...JU.turns.slice(-12)];
    try {
      const res = await sample.json(turns, { modelTier: "quick", cache: false });
      const say = String((res && res.say) || "").trim() || "Done thinking, though I've nothing useful to add.";
      const acts = (Array.isArray(res && res.actions) ? res.actions : []).map(a => ({ a, label: describeAction(a), state: "pending" })).filter(x => x.label);
      JU.turns.push({ role: "assistant", content: JSON.stringify({ say, actions: acts.map(x => x.a) }) });
      push({ who: "jules", text: say, actions: acts });
      speak(say);
    } catch (e) {
      JU.turns.pop();
      push({ who: "jules", text: errText(e), error: true });
    }
    JU.busy = false; draw();
  }
  JU.ask = ask;
  function errText(e) {
    const c = e && e.code;
    if (c === "not_granted" || c === "sampling_disabled") return "Claude isn't allowed for Jules right now. You can allow it the next time claude.ai asks.";
    if (c === "rate_limited") return "Claude needs a breather. Try again in a minute.";
    if (c === "invalid_json") return "I garbled that answer. Ask me again?";
    return "That didn't go through. Try again in a moment.";
  }
  function push(item) { item.at = Date.now(); JU.items.push(item); if (JU.items.length > 60) JU.items.shift(); draw(); }

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
        if (v) ask(v); else draw();
      }
    });
  }
  async function mic() {
    if (!dict) return;
    if (listening) { try { await dict.stop(); } catch (e) {} return; }
    const input = $("#julesIn");
    dBase = input.value ? input.value.trim() + " " : ""; dFinals = "";
    dict.start().catch(e => { listening = false; if (e && e.code === "not_granted") dict = null; draw(); });
    listening = true; JU.stop(); draw();
  }

  /* ---------- briefings ---------- */
  const briefKey = () => "brief-" + J.today();
  JU.briefFor = () => (S.get("meta", briefKey()) || {});
  async function makeBrief(kind) {
    if (!sample || JU.briefBusy) return null;
    JU.briefBusy = kind; draw(); if (J.render && J.ui.view === "home") J.render();
    const what = kind === "morning"
      ? "Write his morning briefing, to be spoken aloud: 60 to 110 words in natural sentences. Cover the day ahead (first commitments with times, how full it is), anything overdue, emails waiting for a reply if any, and the nearest countdown. End with one dry, encouraging line. No greeting beyond a short 'Good morning'."
      : "Write his evening wrap-up, to be spoken aloud: 50 to 100 words in natural sentences. Say what got done today, what is still open (suggest moving it if sensible), and what tomorrow starts with. End with one dry line. No greeting beyond a short 'Good evening'.";
    try {
      const { text } = await sample(`${persona()}\n\n${what}\nPlain text only.\n\nHis data (JSON):\n${JSON.stringify(snapshot())}`, { modelTier: "default", cache: { gcTime: 6 * 3600 * 1000 } });
      const rec = Object.assign({ id: briefKey() }, JU.briefFor(), { [kind]: { text: text.trim(), at: Date.now() } });
      S.put("meta", rec);
      JU.briefBusy = false; draw();
      return text.trim();
    } catch (e) {
      JU.briefBusy = false; draw();
      J.toast(kind === "morning" ? "The briefing didn't come through." : "The wrap-up didn't come through.");
      return null;
    }
  }
  JU.playBrief = async kind => {
    let b = JU.briefFor()[kind];
    if (!b) { const t = await makeBrief(kind); if (!t) return; b = { text: t }; }
    if (!JU.open) JU.toggle(true);
    push({ who: "jules", text: b.text, brief: kind });
    JU.turns.push({ role: "assistant", content: JSON.stringify({ say: b.text, actions: [] }) });
    speak(b.text);
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
    if (J.desktopNotify && J.desktopNotify(text)) {} else J.toast(text, null, 9000);
    if (p.nudgeVoice) speak(text);
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
        push({ who: "jules", text: `${left.length === 1 ? "One thing is" : left.length + " things are"} still open from today. Shall I move ${left.length === 1 ? "it" : "them"} to tomorrow?`, actions: acts });
        if (J.desktopNotify && J.desktopNotify(`${left.length} still open from today. Open Jules to move ${left.length === 1 ? "it" : "them"} to tomorrow.`)) {} else J.toast(`${left.length} still open from today`, { label: "Review", run: () => JU.toggle(true) }, 9000);
      }
    }
  }

  /* ---------- the panel ---------- */
  function draw() {
    const box = $("#jules");
    if (!box) return;
    box.classList.toggle("open", JU.open);
    box.setAttribute("aria-hidden", JU.open ? "false" : "true");
    const btn = $("#julesBtn"); if (btn) { btn.classList.toggle("on", JU.open); btn.classList.toggle("speaking", JU.speaking); }
    if (!JU.open) return;
    const p = JU.prefs();
    const items = JU.items;
    const prevIn = $("#julesIn"), keep = prevIn ? { v: prevIn.value, f: document.activeElement === prevIn } : null;
    const chips = [["Brief me on today", () => JU.playBrief(new Date(J._now || Date.now()).getHours() >= 17 ? "evening" : "morning")], ["What's next?", () => ask("What's next for me?")], ["Plan tomorrow", () => ask("Help me plan tomorrow.")], ["Anything I'm forgetting?", () => ask("Is there anything I'm forgetting or letting slip?")]];
    box.innerHTML = `<div class="ju-head"><div class="ju-title"><b>Jules</b><span class="ju-wave${JU.speaking ? " on" : ""}" aria-hidden="true"><i></i><i></i><i></i><i></i></span></div>
        <div class="ju-tools">${tts ? `<button type="button" class="ibtn${p.on ? " on" : ""}" id="juVoice" aria-pressed="${p.on}" title="${p.on ? "Voice on" : "Voice off"}" aria-label="Voice">${p.on ? ICON_SPK : ICON_MUTE}</button>` : ""}<button type="button" class="ibtn" id="juClose" aria-label="Close (Esc)">${J.icon.close}</button></div></div>
      <div class="ju-log" id="juLog" aria-live="polite">${items.length ? items.map(itemHtml).join("") : `<div class="ju-empty"><p>${esc(greeting())}</p><p class="dim">Ask about your day, or tell me what to move. I'll check with you before changing anything.</p></div>`}
        ${JU.busy ? `<div class="ju-msg bot thinking"><span class="dots"><i></i><i></i><i></i></span></div>` : ""}
        ${JU.briefBusy ? `<div class="ju-msg bot thinking"><span class="dim">Preparing the ${JU.briefBusy === "morning" ? "briefing" : "wrap-up"}…</span></div>` : ""}</div>
      ${items.length < 2 ? `<div class="ju-chips">${chips.map(([l], i) => `<button type="button" class="chip-btn" data-chip="${i}">${esc(l)}</button>`).join("")}</div>` : ""}
      <form class="ju-form" id="juForm" autocomplete="off">${dict ? `<button type="button" class="ibtn ju-mic${listening ? " on" : ""}" id="juMic" aria-pressed="${listening}" aria-label="${listening ? "Stop listening and send" : "Talk"}">${ICON_MIC}</button>` : ""}
        <input id="julesIn" type="text" placeholder="${listening ? "Listening…" : sample ? "Ask Jules…" : "Jules needs claude.ai to answer"}" ${sample ? "" : "disabled"} maxlength="600">
        <button type="submit" class="ibtn" aria-label="Send" ${sample ? "" : "disabled"}>${ICON_SEND}</button></form>`;
    const log = $("#juLog"); log.scrollTop = log.scrollHeight;
    if (keep) { const ni = $("#julesIn"); ni.value = keep.v; if (keep.f && !ni.disabled) ni.focus(); }
    $("#juClose").onclick = () => JU.toggle(false);
    const vb = $("#juVoice"); if (vb) vb.onclick = () => { const on = !JU.prefs().on; JU.setPrefs({ on }); if (!on) JU.stop(); draw(); };
    const mb = $("#juMic"); if (mb) mb.onclick = mic;
    $("#juForm").onsubmit = e => { e.preventDefault(); const i = $("#julesIn"); const v = i.value; i.value = ""; ask(v); };
    $$("[data-chip]", box).forEach(b => b.onclick = () => chips[+b.dataset.chip][1]());
    $$("[data-act-i]", box).forEach(b => b.onclick = () => {
      const it = items[+b.dataset.item], x = it && it.actions[+b.dataset.actI];
      if (!x || x.state !== "pending") return;
      if (b.dataset.do === "yes") { try { applyAction(x.a); x.state = "done"; } catch (err) { x.state = "failed"; } } else x.state = "skipped";
      draw();
    });
    $$("[data-all]", box).forEach(b => b.onclick = () => {
      const it = items[+b.dataset.all];
      it.actions.forEach(x => { if (x.state === "pending") { try { applyAction(x.a); x.state = "done"; } catch (err) { x.state = "failed"; } } });
      draw();
    });
    $$("[data-replay]", box).forEach(b => b.onclick = () => speak(items[+b.dataset.replay].text));
  }
  function itemHtml(it, i) {
    if (it.who === "you") return `<div class="ju-msg you">${esc(it.text)}</div>`;
    const acts = it.actions || [];
    const pending = acts.filter(x => x.state === "pending").length;
    return `<div class="ju-msg bot${it.error ? " err" : ""}"><p>${esc(it.text)}</p>${tts && !it.error ? `<button type="button" class="ju-replay link" data-replay="${i}" aria-label="Say it again">${ICON_SPK} Hear it</button>` : ""}
      ${acts.length ? `<div class="ju-acts">${acts.map((x, k) => `<div class="ju-act ${x.state}"><span>${esc(x.label)}</span>${x.state === "pending" ? `<span class="row"><button type="button" class="btn sm primary" data-item="${i}" data-act-i="${k}" data-do="yes">Confirm</button><button type="button" class="btn sm" data-item="${i}" data-act-i="${k}" data-do="no">Skip</button></span>` : `<em>${x.state === "done" ? "Done" : x.state === "skipped" ? "Skipped" : "Couldn't do that"}</em>`}</div>`).join("")}
        ${pending > 1 ? `<button type="button" class="link ju-all" data-all="${i}">Confirm all ${pending}</button>` : ""}</div>` : ""}</div>`;
  }
  function greeting() {
    const h = new Date(J._now || Date.now()).getHours(), n = S.meta().name;
    const part = h < 5 ? "Burning the midnight oil" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
    return `${part}${n ? ", " + n : ""}. What can I do for you?`;
  }
  const ICON_SPK = `<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 6h2.4L8.5 3v10L4.9 10H2.5z"/><path d="M11 5.6a3.4 3.4 0 0 1 0 4.8M12.8 3.8a6 6 0 0 1 0 8.4"/></svg>`;
  const ICON_MUTE = `<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 6h2.4L8.5 3v10L4.9 10H2.5z"/><path d="m11 6 3.5 4M14.5 6 11 10"/></svg>`;
  const ICON_MIC = `<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><rect x="5.8" y="2" width="4.4" height="7.6" rx="2.2"/><path d="M3.6 8a4.4 4.4 0 0 0 8.8 0M8 12.4V14.5"/></svg>`;
  const ICON_SEND = `<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 8h10M8.5 3.5 13 8l-4.5 4.5"/></svg>`;
  JU.ICON_SPK = ICON_SPK;

  JU.toggle = on => {
    JU.open = on == null ? !JU.open : !!on;
    draw();
    if (JU.open) { setTimeout(() => { const i = $("#julesIn"); if (i && !i.disabled) i.focus(); }, 80); J.overlay && J.overlay.push("jules", () => JU.toggle(false)); }
    else J.overlay && J.overlay.pop("jules");
  };

  JU.ready = (async () => {
    let framed = true; try { framed = window.top !== window.self; } catch (e) {}
    const mayHaveHost = framed || /claude/i.test(location.hostname);
    for (let i = 0; mayHaveHost && i < 20 && !(window.claude && window.claude.use); i++) await new Promise(r => setTimeout(r, 100));
    const C = window.claude;
    if (C && typeof C.use === "function") {
      const t = ms => new Promise(r => setTimeout(() => r(null), ms));
      [sample, tts, dict] = await Promise.all(["sample", "tts", "dictation"].map(n => Promise.race([C.use(n), t(10000)]).catch(() => null)));
    }
    if (dict) wireDictation();
    if (tts) tts.onState(({ state }) => { JU.speaking = state === "speaking"; const w = $(".ju-wave"); if (w) w.classList.toggle("on", JU.speaking); const b = $("#julesBtn"); if (b) b.classList.toggle("speaking", JU.speaking); });
    await S.ready;
    maybeMorning();
    JU.checkNudges = checkNudges;
    setInterval(checkNudges, 30000);
    setTimeout(checkNudges, 4000);
    draw();
    return true;
  })();
})();
