/* JULES · gcal.js
   Google Calendar, reached through the Notion connector in claude.ai.
   Read and add only: Jules lists your events and, when you press "Send to Google" on a task,
   creates one new event in your primary calendar. It never edits or deletes an event.

   Events are fetched in 4-week blocks (each starting on a Monday) and kept fresh by the host,
   which re-asks every five minutes while the page is open. */
(function () {
  "use strict";
  const J = window.J;
  const SERVER = "Notion", LIST = "notion-calendar-list-events", CREATE = "notion-calendar-create-events";
  const TZ = (Intl.DateTimeFormat().resolvedOptions().timeZone) || "Australia/Sydney";
  const EPOCH = "2026-01-05";                  // a Monday; blocks are counted from here
  const BLOCK = 28, MAX_WATCHES = 6;
  const LS_HIDE = "jules5:calHidden", LS_AUTO = "jules5:calAuto";

  const G = J.gcal = { state: "starting", code: null, message: "", storedAt: null, calendars: new Map(), tz: TZ };
  const listeners = new Set();
  G.on = fn => { listeners.add(fn); return () => listeners.delete(fn); };
  let emitQ = false;
  const emit = () => { if (emitQ) return; emitQ = true; setTimeout(() => { emitQ = false; listeners.forEach(f => { try { f(); } catch (e) { console.error(e); } }); }, 0); };

  let mcp = null;
  const blocks = new Map();                    // key -> { from, to, input, unsub, events, used, loaded }

  /* ---------- preferences: hidden calendars, Reclaim blocks ---------- */
  const lsGet = (k, f) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? f : v; } catch (e) { return f; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  let hidden = new Set(lsGet(LS_HIDE, []));
  G.showAuto = lsGet(LS_AUTO, true);
  G.isHidden = calId => hidden.has(calId);
  G.toggleCal = calId => { hidden.has(calId) ? hidden.delete(calId) : hidden.add(calId); lsSet(LS_HIDE, [...hidden]); emit(); };
  G.toggleAuto = () => { G.showAuto = !G.showAuto; lsSet(LS_AUTO, G.showAuto); emit(); };

  /* ---------- reading the connector's answer ---------- */
  const minutesOf = d => d.getHours() * 60 + d.getMinutes();
  function calColor(c) {
    if (c.isPrimary) return "steel";
    if (/holiday/i.test(c.calendarId || "") || /holiday/i.test(c.name || "")) return "sand";
    if (/family/i.test(c.name || "")) return "sage";
    return "plume";
  }
  function normalise(payload) {
    const out = [];
    const accounts = (payload && payload.accounts) || [];
    accounts.forEach(a => (a.calendars || []).forEach(c => {
      if (c.isHidden) return;
      const name = c.isPrimary ? "Primary" : (c.name || "Calendar");
      G.calendars.set(c.calendarId, { id: c.calendarId, name, color: calColor(c), readOnly: !!c.isReadOnly, primary: !!c.isPrimary });
      (c.events || []).forEach(ev => {
        if (ev.eventStatus === "cancelled") return;
        const p = ev.period || {};
        const base = {
          id: ev.eventId, calId: c.calendarId, calName: name, color: calColor(c),
          title: ev.summary || "(No title)", url: ev.webUrl || "",
          transparent: !!ev.isTransparent,
          auto: /^reclaim/i.test(ev.eventId || "") || /reclaim\.ai/i.test(ev.description || "") || !!ev.isAutoBlock
        };
        if (p.type === "DATE" && p.start && p.start.date) {
          const endIncl = p.end && p.end.date ? J.addDays(p.end.date, -1) : p.start.date;   // Google's end date is exclusive
          out.push(Object.assign(base, { allDay: true, startYmd: p.start.date, endYmd: endIncl < p.start.date ? p.start.date : endIncl }));
        } else if (p.start && p.start.dateTime) {
          const s = new Date(p.start.dateTime), e = new Date((p.end && p.end.dateTime) || p.start.dateTime);
          if (isNaN(s)) return;
          let endYmd = J.ymd(e), endMin = minutesOf(e);
          if (endMin === 0 && endYmd > J.ymd(s)) { endYmd = J.addDays(endYmd, -1); endMin = 1440; }  // ends at midnight
          out.push(Object.assign(base, { allDay: false, startYmd: J.ymd(s), endYmd, startMin: minutesOf(s), endMin, startTs: +s, endTs: +e }));
        }
      });
    }));
    return out;
  }

  /* ---------- blocks and watches ---------- */
  const blockIndex = ymd => Math.floor(J.diffDays(EPOCH, ymd) / BLOCK);
  const blockFrom = i => J.addDays(EPOCH, i * BLOCK);
  function inputFor(from, to) {
    const a = J.parseYmd(from), b = J.parseYmd(to);
    return { timeMin: a.toISOString(), timeMax: b.toISOString(), timeZone: TZ };
  }
  const AUTHZ = new Set(["needs_reauth", "server_not_connected", "blocked_by_policy", "approval_required", "not_in_manifest", "selection_required", "not_granted", "capability_disabled", "capability_removed", "server_not_found"]);

  function onEvent(key, ev) {
    const b = blocks.get(key);
    if (!b) return;
    if (ev.type === "data") {
      b.events = normalise(ev.result && ev.result.payload);
      b.loaded = true;
      G.storedAt = (ev.result && ev.result.cache && ev.result.cache.storedAt) || Date.now();
      G.state = "ok"; G.code = null; G.message = "";
    } else {
      const err = ev.error || {};
      G.code = err.code || "upstream_error";
      G.message = err.message || "";
      if (AUTHZ.has(G.code)) {                         // access lost: stop showing what we had
        blocks.forEach(x => { x.events = []; x.loaded = false; });
        G.state = "blocked";
      } else G.state = G.storedAt ? "stale" : "error";
    }
    emit();
  }
  function watchBlock(i) {
    const key = "b" + i;
    let b = blocks.get(key);
    if (b) { b.used = Date.now(); return b; }
    const from = blockFrom(i), to = J.addDays(from, BLOCK);
    b = { key, from, to, input: inputFor(from, to), events: [], loaded: false, used: Date.now(), unsub: null };
    blocks.set(key, b);
    b.unsub = mcp.watchTool(SERVER, LIST, b.input, ev => onEvent(key, ev), { refetchInterval: 5 * 60 * 1000, cache: { staleTime: 60 * 1000, gcTime: 7 * 24 * 3600 * 1000 } });
    if (blocks.size > MAX_WATCHES) {                   // forget the least recently used block
      const old = [...blocks.values()].sort((x, y) => x.used - y.used)[0];
      if (old && old.key !== key) { try { old.unsub(); } catch (e) {} blocks.delete(old.key); }
    }
    return b;
  }
  /* Views call this with the date range they show. */
  G.ensure = (fromYmd, toYmd) => {
    if (!mcp) return;
    for (let i = blockIndex(fromYmd); i <= blockIndex(toYmd); i++) watchBlock(i);
  };
  G.loadedFor = ymd => { const b = blocks.get("b" + blockIndex(ymd)); return !!(b && b.loaded); };

  /* Events on one day, already split for that day. Hidden calendars and (optionally) Reclaim blocks left out. */
  G.eventsOn = ymd => {
    const seen = new Set(), out = [];
    blocks.forEach(b => b.events.forEach(e => {
      if (ymd < e.startYmd || ymd > e.endYmd) return;
      const k = e.calId + "|" + e.id;
      if (seen.has(k) || hidden.has(e.calId) || (e.auto && !G.showAuto)) return;
      seen.add(k);
      if (e.allDay) out.push(e);
      else out.push(Object.assign({}, e, { segStart: ymd === e.startYmd ? e.startMin : 0, segEnd: ymd === e.endYmd ? e.endMin : 1440 }));
    }));
    return out.sort((a, b) => (b.allDay - a.allDay) || ((a.segStart || 0) - (b.segStart || 0)) || a.title.localeCompare(b.title));
  };

  /* ---------- the one action: create an event for a task ---------- */
  const isoLocal = (ymd, min) => `${ymd}T${J.pad2(Math.floor(min / 60))}:${J.pad2(min % 60)}:00`;
  function findEvent(x, depth = 0) {
    if (!x || typeof x !== "object" || depth > 6) return null;
    if (typeof x.eventId === "string") return x;
    for (const v of Array.isArray(x) ? x : Object.values(x)) { const r = findEvent(v, depth + 1); if (r) return r; }
    return null;
  }
  G.sendTask = async (task, projectName) => {
    if (!mcp) throw { code: "unavailable", message: "Google Calendar only works when Jules is opened in claude.ai." };
    if (!task.due) throw { code: "no_date", message: "Give the task a date first." };
    let period;
    if (task.start != null) {
      const dur = task.dur || 30, endAbs = task.start + dur;
      const endYmd = J.addDays(task.due, Math.floor(endAbs / 1440));
      period = { type: "DATE_TIME", start: { dateTime: isoLocal(task.due, task.start), timeZone: TZ }, end: { dateTime: isoLocal(endYmd, endAbs % 1440), timeZone: TZ } };
    } else {
      period = { type: "DATE", start: { date: task.due }, end: { date: J.addDays(task.due, 1) } };
    }
    const lines = ["Planned in Jules" + (projectName ? " · " + projectName : "")];
    if (task.notes) lines.push("", task.notes.slice(0, 2000));
    const res = await mcp.callTool(SERVER, CREATE, { timeZone: TZ, events: [{ summary: task.title.slice(0, 250), description: lines.join("\n"), period }] });
    const ev = findEvent(res && res.payload);
    try { await mcp.invalidate(SERVER, LIST); } catch (e) {}
    return { id: ev ? ev.eventId : null, url: ev ? (ev.webUrl || "") : "", sentAt: Date.now(), due: task.due, start: task.start, dur: task.dur || (task.start != null ? 30 : null) };
  };

  /* When a watch can't ask for approval, a button calls this: the same read, once, which may ask. */
  G.approve = async () => {
    if (!mcp) return;
    const b = [...blocks.values()].sort((x, y) => y.used - x.used)[0];
    if (!b) return;
    G.state = "starting"; emit();
    try { const res = await mcp.callTool(SERVER, LIST, b.input); onEvent(b.key, { type: "data", result: res }); }
    catch (err) { onEvent(b.key, { type: "error", error: err }); }
  };
  G.refresh = async () => { if (!mcp) return; try { await mcp.invalidate(SERVER, LIST); } catch (e) {} };

  /* Plain-English status for the UI. */
  G.describe = () => {
    if (G.state === "unavailable") return { tone: "off", text: "Google Calendar shows up when Jules is opened in claude.ai with the Notion connector." };
    if (G.state === "starting") return { tone: "busy", text: "Loading your calendar…" };
    if (G.state === "ok") return { tone: "ok", text: "" };
    const t = { tone: "warn", text: "", action: null };
    switch (G.code) {
      case "needs_reauth": t.text = "Your Notion connection has lapsed. Reconnect Notion in claude.ai Settings → Connectors."; break;
      case "server_not_connected": t.text = "Add the Notion connector in claude.ai Settings → Connectors to see Google Calendar here."; break;
      case "selection_required": t.text = "You have more than one Notion connector. claude.ai will ask which one to use."; break;
      case "approval_required": t.text = "Jules needs your OK to read your calendar."; t.action = "approve"; break;
      case "not_in_manifest": t.text = "Calendar access is switched off for Jules. You can allow it from the artifact's settings in claude.ai."; break;
      case "blocked_by_policy": t.text = "Your organisation's policy blocks calendar access here."; break;
      case "server_unavailable": t.text = G.storedAt ? `Calendar isn't answering just now. Showing what loaded at ${J.fmtTime(minutesOf(new Date(G.storedAt)))}.` : "Calendar isn't answering just now. It will try again shortly."; t.action = "retry"; break;
      default: t.text = (G.storedAt ? "Calendar refresh failed; showing the last good copy. " : "Couldn't load the calendar. ") + (G.message ? "(" + G.message.slice(0, 120) + ")" : ""); t.action = "retry";
    }
    return t;
  };

  G.ready = (async () => {
    let framed = true; try { framed = window.top !== window.self; } catch (e) {}
    const mayHaveHost = framed || /claude/i.test(location.hostname);
    for (let i = 0; mayHaveHost && i < 20 && !(window.claude && window.claude.use); i++) await new Promise(r => setTimeout(r, 100));
    const C = window.claude;
    if (C && typeof C.use === "function") {
      try { mcp = await Promise.race([C.use("mcp"), new Promise(r => setTimeout(() => r(null), 10000))]); } catch (e) { mcp = null; }
    }
    G.state = mcp ? "starting" : "unavailable";
    emit();
    return !!mcp;
  })();
})();
