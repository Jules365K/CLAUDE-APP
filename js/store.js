/* JULES · store.js
   One place that holds every record and keeps it saved.

   Two modes, chosen at start-up:
   - "db"    inside claude.ai: the artifact's own database. Changes sync to every device you
             open Jules on. Each collection is subscribed to once; writes go one at a time per
             record, newest wins.
   - "local" anywhere else (GitHub Pages, opening the file): this browser's localStorage,
             filled from data.js the first time.

   The rest of the app only ever calls list / get / put / patch / remove and on(change). */
(function () {
  "use strict";
  const J = window.J;
  const COLS = ["tasks", "projects", "path", "skills", "log", "meta", "mail"];
  const LS = "jules5:";
  const cache = {}; COLS.forEach(c => { cache[c] = new Map(); });
  const listeners = new Set();
  let db = null;

  const S = J.store = { mode: "loading", status: "loading", ready: null, error: null, empty: false };

  /* ---------- change notifications, batched to one per frame ---------- */
  let dirty = new Set(), flushQueued = false;
  function emit(col) {
    dirty.add(col);
    if (flushQueued) return;
    flushQueued = true;
    (window.requestAnimationFrame || setTimeout)(() => {
      flushQueued = false;
      const cols = dirty; dirty = new Set();
      listeners.forEach(fn => { try { fn(cols); } catch (e) { console.error(e); } });
    });
  }
  S.on = fn => { listeners.add(fn); return () => listeners.delete(fn); };

  /* ---------- reading ---------- */
  const byOrder = (a, b) => (a.order ?? 1e9) - (b.order ?? 1e9) || (a.createdAt || 0) - (b.createdAt || 0) || String(a.id).localeCompare(String(b.id));
  S.list = col => [...cache[col].values()].sort(byOrder);
  S.get = (col, id) => cache[col].get(id) || null;
  S.meta = () => Object.assign({ name: "", fuelGoal: 10, countdowns: [] }, cache.meta.get("app") || {});
  S.nextOrder = col => { let m = -1; cache[col].forEach(v => { if ((v.order ?? -1) > m) m = v.order; }); return m + 1; };

  /* ---------- writing ---------- */
  const clean = v => { const o = JSON.parse(JSON.stringify(v)); delete o.id; return o; };
  S.put = (col, obj) => {
    const id = obj.id || J.uid(col[0]);
    const v = Object.assign({}, obj, { id });
    const cur = cache[col].get(id);
    if (cur && JSON.stringify(cur) === JSON.stringify(v)) return cur;    // only write on change
    cache[col].set(id, v);
    emit(col);
    if (S.mode === "db") enqueue(col, id, v); else saveLocal(col);
    return v;
  };
  S.patch = (col, id, part) => { const cur = cache[col].get(id); return cur ? S.put(col, Object.assign({}, cur, part)) : null; };
  S.remove = (col, id) => {
    if (!cache[col].has(id)) return;
    cache[col].delete(id);
    emit(col);
    if (S.mode === "db") enqueue(col, id, null); else saveLocal(col);
  };

  /* db writes: one in flight per record; if more arrive meanwhile, only the newest is sent next. */
  const inflight = new Set(), queued = new Map(), pending = new Map();
  function enqueue(col, id, v) {
    const key = col + "/" + id;
    pending.set(key, v);
    if (inflight.has(key)) { queued.set(key, v); return; }
    send(col, id, v);
  }
  async function send(col, id, v) {
    const key = col + "/" + id;
    inflight.add(key);
    try {
      const ref = db.collection(col).doc(id);
      await (v === null ? ref.delete() : ref.set(clean(v)));
      if (S.status === "error") { S.status = "synced"; emit(col); }
    } catch (e) {
      console.warn("Jules: save failed", key, e);
      S.status = "error"; S.error = (e && (e.message || e.code)) || "Save failed";
      emit(col);
    }
    inflight.delete(key);
    if (queued.has(key)) { const nv = queued.get(key); queued.delete(key); send(col, id, nv); }
    else pending.delete(key);
  }
  S.pendingCount = () => pending.size;

  /* ---------- local mode ---------- */
  function saveLocal(col) {
    try { localStorage.setItem(LS + col, JSON.stringify(S.list(col))); }
    catch (e) { S.status = "error"; S.error = "This browser refused to save (storage full or blocked)."; }
  }
  function loadLocal() {
    let seeded = false;
    try { seeded = localStorage.getItem(LS + "seeded") === "1"; } catch (e) {}
    if (!seeded) {
      S.importSeed(J.buildSeed(window.JULES_SEED));
      try { localStorage.setItem(LS + "seeded", "1"); } catch (e) {}
      return;
    }
    COLS.forEach(col => {
      let arr = [];
      try { arr = JSON.parse(localStorage.getItem(LS + col) || "[]") || []; } catch (e) {}
      cache[col] = new Map(arr.map(v => [v.id, v]));
      emit(col);
    });
  }
  /* Another tab changed something: pick it up. */
  window.addEventListener("storage", e => {
    if (S.mode !== "local" || !e.key || !e.key.startsWith(LS)) return;
    const col = e.key.slice(LS.length);
    if (!cache[col]) return;
    try { cache[col] = new Map((JSON.parse(e.newValue || "[]") || []).map(v => [v.id, v])); emit(col); } catch (err) {}
  });

  /* Write a whole seed (from J.buildSeed). Used for local first-run, and the "load starter data" button. */
  S.importSeed = seed => { COLS.forEach(col => (seed[col] || []).forEach(v => S.put(col, v))); };
  S.isEmpty = () => COLS.every(c => cache[c].size === 0);

  /* ---------- db mode ---------- */
  function subscribe() {
    return new Promise(resolve => {
      let waiting = COLS.length;
      const arrived = () => { if (--waiting === 0) resolve(); };
      COLS.forEach(col => {
        let first = true;
        db.collection(col).onSnapshot(snap => {
          const m = new Map();
          snap.docs.forEach(d => m.set(d.id, Object.assign({}, d.data(), { id: d.id })));
          pending.forEach((v, key) => {                       // keep our newest unsent edits on screen
            const i = key.indexOf("/");
            if (key.slice(0, i) !== col) return;
            const id = key.slice(i + 1);
            if (v === null) m.delete(id); else m.set(id, v);
          });
          cache[col] = m;
          S.status = snap.metadata && snap.metadata.fromCache ? "cached" : "synced";
          emit(col);
          if (first) { first = false; arrived(); }
        }, err => {
          console.warn("Jules: sync error on", col, err);
          S.status = "error"; S.error = (err && (err.message || err.code)) || "Sync error";
          emit(col);
          if (first) { first = false; arrived(); }
        });
      });
    });
  }

  const withTimeout = (p, ms) => Promise.race([p, new Promise(r => setTimeout(() => r(null), ms))]);
  S.ready = (async () => {
    /* The host may attach window.claude a moment after this script runs: give it two seconds. */
    let framed = true; try { framed = window.top !== window.self; } catch (e) {}
    const mayHaveHost = framed || /claude/i.test(location.hostname);
    for (let i = 0; mayHaveHost && i < 20 && !(window.claude && window.claude.use); i++) await new Promise(r => setTimeout(r, 100));
    const C = window.claude;
    if (C && typeof C.use === "function") {
      try { db = await withTimeout(C.use("db"), 10000); } catch (e) { db = null; }
    }
    if (db) {
      S.mode = "db"; S.status = "connecting";
      await withTimeout(subscribe(), 10000);
      S.empty = S.isEmpty();
    } else {
      S.mode = "local"; S.status = "local";
      loadLocal();
    }
    emit("tasks");
    return S.mode;
  })();
})();
