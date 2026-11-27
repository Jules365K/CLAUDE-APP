/* JULES · desktop.js
   Jules as an app on your Mac or Windows PC, installed from the Claude desktop app.
   In a browser or inside Claude it only offers the Install button. In its own window it adds:
   - its own icon (drawn here) and a clean window
   - a global shortcut, Cmd/Ctrl+Shift+J, that brings Jules up with the assistant open
   - a menu bar item (system tray on Windows) with your next task and what's playing
   - notifications for Jules's heads-ups, and a Dock badge with today's open tasks
   The shortcut, menu bar item and notifications each ask your permission once. */
(function () {
  "use strict";
  const J = window.J, S = J.store, { $ } = J;
  const DK = J.desktop = { mode: "none", install: "unavailable", perms: {}, platform: "", ready: null };
  const NEED = ["notifications", "shortcuts", "menu-bar"];
  const SHORTCUT = "CmdOrCtrl+Shift+J";
  let desktop = null;
  const listeners = new Set();
  DK.on = fn => { listeners.add(fn); return () => listeners.delete(fn); };
  const emit = () => listeners.forEach(f => { try { f(); } catch (e) { console.error(e); } });

  /* ---------- the app icon, drawn so it looks like Jules in the Dock ---------- */
  function rocketPath(ctx, scale, ox, oy) {
    const R = J.ROCKET;
    ["command", "body", "engines"].forEach(k => R[k].forEach(d => { const p = new Path2D(d); ctx.save(); ctx.translate(ox, oy); ctx.scale(scale, scale); ctx.stroke(p); ctx.restore(); }));
    return R;
  }
  function drawIcon() {
    const c = document.createElement("canvas"); c.width = c.height = 256;
    const x = c.getContext("2d");
    const r = 56;
    x.beginPath(); x.moveTo(r, 0); x.arcTo(256, 0, 256, 256, r); x.arcTo(256, 256, 0, 256, r); x.arcTo(0, 256, 0, 0, r); x.arcTo(0, 0, 256, 0, r); x.closePath();
    const g = x.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, "#151b23"); g.addColorStop(1, "#05070a");
    x.fillStyle = g; x.fill();
    x.save(); x.clip();
    const glow = x.createRadialGradient(128, 214, 4, 128, 214, 90); glow.addColorStop(0, "rgba(255,154,69,.55)"); glow.addColorStop(1, "rgba(255,154,69,0)");
    x.fillStyle = glow; x.fillRect(0, 0, 256, 256);
    const s = .26, ox = 128 - 100 * s, oy = 22;
    x.lineWidth = 2.2 / s * .9; x.lineJoin = "round"; x.strokeStyle = "#f2ede4";
    rocketPath(x, s, ox, oy);
    x.save(); x.translate(ox, oy); x.scale(s, s); x.fillStyle = "#ff9a45"; J.ROCKET.exhaust.forEach(d => x.fill(new Path2D(d))); x.restore();
    x.restore();
    return c.toDataURL("image/png");
  }
  /* The menu bar icon: black on transparent (macOS tints it); light for the Windows tray. */
  function drawTrayIcon(light) {
    const c = document.createElement("canvas"); c.width = c.height = 36;
    const x = c.getContext("2d");
    const s = 36 / 900 * 1.0, ox = 18 - 100 * s, oy = 0;
    x.fillStyle = light ? "#f2ede4" : "#000";
    x.save(); x.translate(ox, oy); x.scale(s, s);
    ["command", "body", "engines", "exhaust"].forEach(k => J.ROCKET[k].forEach(d => x.fill(new Path2D(d))));
    x.restore();
    return c.toDataURL("image/png");
  }

  /* ---------- menu bar contents ---------- */
  function nextUp() {
    const today = J.today(), nm = J.nowMin();
    const items = S.list("tasks").filter(t => t.due === today && t.status !== "done" && t.start != null && t.start + (t.dur || 30) > nm).sort((a, b) => a.start - b.start);
    return items[0] || S.list("tasks").filter(t => t.due === today && t.status !== "done")[0] || null;
  }
  let trayT = 0;
  async function updateTray() {
    if (!desktop || DK.perms["menu-bar"] !== "granted") return;
    clearTimeout(trayT);
    trayT = setTimeout(async () => {
      const n = nextUp(), sp = J.spotify && J.spotify.track;
      const label = n ? (n.start != null ? `${J.fmtTime(n.start)} ${n.title}` : n.title) : "Nothing left today";
      const menu = [
        { label: "Next: " + label.slice(0, 60), enabled: false },
        ...(sp ? [{ label: `${sp.playing ? "Playing" : "Paused"}: ${sp.name}${sp.artist ? " · " + sp.artist : ""}`.slice(0, 70), enabled: false }] : []),
        { type: "separator" },
        { label: "Ask Jules…", click: () => { desktop.window.show().catch(() => {}); J.jules && J.jules.toggle(true); } },
        { label: "Today", click: () => { desktop.window.show().catch(() => {}); location.hash = "home"; } },
        { label: "Calendar", click: () => { desktop.window.show().catch(() => {}); location.hash = "calendar"; } }
      ];
      try {
        const opts = { icon: DK.trayIcon, iconIsTemplate: DK.platform !== "win32", toolTip: label.slice(0, 100), menu };
        if (DK.platform === "darwin" && n) opts.title = label.slice(0, 30);
        await desktop.tray.set(opts);
      } catch (e) { /* the menu bar item is optional */ }
      const open = S.list("tasks").filter(t => t.due === J.today() && t.status !== "done").length;
      desktop.app.dock.setBadge(open ? String(open) : "").catch(() => {});
    }, 400);
  }

  /* ---------- permissions and set-up ---------- */
  let shortcutOn = false;
  async function setUp() {
    if (DK.perms.shortcuts === "granted" && !shortcutOn) {
      shortcutOn = true;
      desktop.globalShortcut.register(SHORTCUT, () => { desktop.window.show().catch(() => {}); J.jules && J.jules.toggle(true); }).then(ok => { shortcutOn = !!ok; }).catch(() => { shortcutOn = false; });
    }
    if (DK.perms["menu-bar"] === "granted") updateTray();
    emit();
  }
  DK.askPermissions = async () => {
    if (!desktop) return;
    try { DK.perms = await desktop.permissions.request(NEED); } catch (e) { /* hidden window or refused */ }
    setUp();
  };
  DK.managePermissions = () => desktop && desktop.permissions.manage().then(async () => { DK.perms = await desktop.permissions.state(); setUp(); }).catch(() => {});
  DK.needsSetup = () => DK.mode === "app" && NEED.some(n => DK.perms[n] === "prompt");
  DK.requestInstall = async () => {
    if (!desktop || !desktop.install) return;
    try { const r = await desktop.install.request(); DK.install = r === "installed" ? "installed" : DK.install; } catch (e) {}
    emit();
  };
  /* Notifications for Jules's heads-ups. Returns true if the system showed it. */
  J.desktopNotify = text => {
    if (!desktop || DK.perms.notifications !== "granted") return false;
    desktop.notification.show({ body: String(text).slice(0, 300) }).catch(() => {});
    return true;
  };

  DK.ready = (async () => {
    let framed = true; try { framed = window.top !== window.self; } catch (e) {}
    const mayHaveHost = framed || /claude/i.test(location.hostname);
    for (let i = 0; mayHaveHost && i < 20 && !(window.claude && window.claude.use); i++) await new Promise(r => setTimeout(r, 100));
    const C = window.claude;
    if (!(C && typeof C.use === "function")) { emit(); return; }
    try { desktop = await Promise.race([C.use("desktop"), new Promise(r => setTimeout(() => r(null), 10000))]); } catch (e) { desktop = null; }
    if (!desktop) { emit(); return; }
    if (desktop.window && desktop.tray) {
      DK.mode = "app";
      document.body.classList.add("is-app");
      try { DK.platform = await desktop.os.platform(); } catch (e) {}
      document.body.classList.add(DK.platform === "darwin" ? "is-mac" : "is-win");
      DK.trayIcon = drawTrayIcon(DK.platform === "win32");
      desktop.app.dock.setIcon(drawIcon()).catch(() => {});
      desktop.window.setOptions({ titleBarStyle: "hiddenInset", dragHeight: 44, width: 1320, height: 860, minWidth: 960, minHeight: 640, backgroundColor: "#06080b" }).catch(() => {});
      try { DK.perms = await desktop.permissions.state(); } catch (e) { DK.perms = {}; }
      setUp();
      S.on(updateTray);
      if (J.spotify) J.spotify.on(updateTray);
      setInterval(updateTray, 60000);
    } else if (desktop.install) {
      try { DK.install = await desktop.install.state(); } catch (e) { DK.install = "unavailable"; }
      DK.mode = "web";
    }
    emit();
  })();
})();
