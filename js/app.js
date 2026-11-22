/* JULES · mission control
   Read top to bottom: data and helpers, the rocket outline, chrome (intro, smooth scroll,
   hyperjump), each scene's builder, the WebGL photo renderer, part pages, then the frame loop
   that moves everything as you scroll. */
(() => {
  "use strict";
  const D = window.ASCENT_DATA;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const sm = t => { t = clamp(t); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;
  const ramp = (p, a, b) => sm((p - a) / (b - a));
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const NS = "http://www.w3.org/2000/svg";
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const pad2 = n => String(n).padStart(2, "0");
  const store = {
    get(k, f) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? f : v; } catch (e) { return f; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  const TODAY = new Date();

  /* ================= rocket parts ================= */
  const PARTS = {
    star:    { label: "The star",       sub: "The future",  scene: "star",    title: "The target",  lede: "The skills you're flying toward, how far out each one is, and what opens up when you get there." },
    command: { label: "Command module", sub: "Flight path", scene: "command", title: "Overview",    lede: "Countdowns, your first year at UNSW term by term, and the rest of the degree." },
    body:    { label: "Body",           sub: "Side projects", scene: "body",  title: "Side projects", lede: "Everything you're building on the side. Fuel level is progress; the list is the next moves in order." },
    engines: { label: "Engines",        sub: "Today",       scene: "engines", title: "Today",       lede: "Today's burns. Tick them off to light the engines, or add a new one." },
    exhaust: { label: "Exhaust",        sub: "Flight log",  scene: "launch",  title: "Flight log",  lede: "Everything already burned. This doubles as the source for your CV." }
  };
  const ORDER = ["star", "command", "body", "engines", "exhaust"];
  const ROCKET = {
    star:    ["M100 22 L105 41 L124 46 L105 51 L100 70 L95 51 L76 46 L95 41 Z"],
    command: ["M100 110 C 126 140 140 210 140 300 L 60 300 C 60 210 74 140 100 110 Z", "M84 236 H116"],
    body:    ["M60 300 H140 V640 H60 Z", "M60 470 H140", "M60 560 L34 652 L60 640", "M140 560 L166 652 L140 640"],
    engines: ["M64 640 H136 V666 H64 Z", "M72 666 H88 L92 704 H68 Z", "M92 666 H108 L112 704 H88 Z", "M112 666 H128 L132 704 H108 Z"],
    exhaust: ["M76 712 C 66 770 58 830 100 892 C 142 830 134 770 124 712 Z"]
  };
  const HIT = { star: [70, 16, 60, 60], command: [56, 104, 88, 196], body: [30, 300, 140, 340], engines: [60, 640, 80, 68], exhaust: [54, 708, 92, 190] };
  const rocketMarkup = (interactive = true) => ORDER.map(k =>
    `<g class="rp" data-part="${k}"${interactive ? ` role="button" tabindex="0" aria-label="${PARTS[k].label}: ${PARTS[k].sub}"` : ""}>` +
    `<rect class="hit" x="${HIT[k][0]}" y="${HIT[k][1]}" width="${HIT[k][2]}" height="${HIT[k][3]}"/>` +
    ROCKET[k].map(d => `<path d="${d}"/>`).join("") + `</g>`).join("");
  function bindParts(root, onPick, onHover) {
    $$("[data-part]", root).forEach(g => {
      g.addEventListener("click", e => { e.preventDefault(); onPick(g.dataset.part, e); });
      g.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(g.dataset.part, e); } });
      if (onHover) { g.addEventListener("mouseenter", () => onHover(g.dataset.part)); g.addEventListener("mouseleave", () => onHover(null)); g.addEventListener("focus", () => onHover(g.dataset.part)); g.addEventListener("blur", () => onHover(null)); }
    });
  }

  /* ================= smooth scroll (Lenis) ================= */
  let lenis = null;
  if (!reduced && window.Lenis) {
    lenis = new window.Lenis({ lerp: .085, wheelMultiplier: .9, smoothWheel: true });
    const raf = t => { lenis.raf(t); requestAnimationFrame(raf); };
    requestAnimationFrame(raf);
  }

  /* ================= navigation: hyperjump ================= */
  const JUMP_AT = { launch: 0, rocket: .86, engines: .45, body: .62, command: .1, star: .8 };
  const targetY = id => { const s = document.getElementById(id); return s ? s.offsetTop + (s.offsetHeight - innerHeight) * (JUMP_AT[id] || 0) : 0; };
  let snap = false;
  function jumpNow(id) {
    const y = targetY(id);
    if (lenis) lenis.scrollTo(y, { immediate: true, force: true }); else window.scrollTo(0, y);
    snap = true;
  }
  const warp = $("#warp"), wctx = warp.getContext("2d");
  let warping = false;
  function hyperjump(id) {
    if (warping) return;
    if (reduced) { jumpNow(id); return; }
    warping = true;
    const dpr = Math.min(2, devicePixelRatio || 1), W = innerWidth, H = innerHeight;
    warp.width = W * dpr; warp.height = H * dpr; warp.classList.add("on");
    const cx = W / 2, cy = H / 2, R = Math.hypot(W, H) / 2;
    const stars = Array.from({ length: 260 }, () => ({ a: Math.random() * Math.PI * 2, r: Math.random() * .9 + .05, w: Math.random() * 1.2 + .3, c: Math.random() < .2 ? "255,200,150" : "235,240,255" }));
    const t0 = performance.now(), dur = 1000;
    let jumped = false;
    const step = now => {
      const t = clamp((now - t0) / dur);
      const into = sm(t / .45), out = 1 - sm((t - .45) / .55);
      const k = t < .45 ? into : out;
      wctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      wctx.clearRect(0, 0, W, H);
      wctx.fillStyle = `rgba(0,0,0,${(.92 * k).toFixed(3)})`; wctx.fillRect(0, 0, W, H);
      stars.forEach(s => {
        const r1 = s.r * R * (1 + k * .35), len = R * .55 * k * k * (s.r + .2);
        const x1 = cx + Math.cos(s.a) * r1, y1 = cy + Math.sin(s.a) * r1;
        const x2 = cx + Math.cos(s.a) * (r1 + len), y2 = cy + Math.sin(s.a) * (r1 + len);
        wctx.strokeStyle = `rgba(${s.c},${(.85 * k).toFixed(3)})`; wctx.lineWidth = s.w;
        wctx.beginPath(); wctx.moveTo(x1, y1); wctx.lineTo(x2, y2); wctx.stroke();
      });
      if (t >= .45 && !jumped) { jumped = true; jumpNow(id); }
      if (t < 1) requestAnimationFrame(step); else { warp.classList.remove("on"); warping = false; }
    };
    requestAnimationFrame(step);
  }
  const JUMPS = [["launch", "Launch"], ["rocket", "Rocket"], ["engines", "Today"], ["body", "Projects"], ["command", "Flight path"], ["star", "Star"]];
  $("#jumps").innerHTML = JUMPS.map(([id, l]) => `<button type="button" data-jump="${id}">${l}</button>`).join("");
  $$("#jumps button").forEach(b => b.addEventListener("click", () => hyperjump(b.dataset.jump)));
  $("#brand").addEventListener("click", e => { e.preventDefault(); hyperjump("launch"); });

  /* logo, side rocket, page rocket */
  $("#brandMark").innerHTML = rocketMarkup(false);
  const mrSvg = $("#mrSvg"), mr = $("#mr"), mrLabel = $("#mrLabel");
  mrSvg.innerHTML = rocketMarkup();
  let mrActive = "exhaust";
  bindParts(mrSvg, part => hyperjump(PARTS[part].scene), part => {
    mrLabel.textContent = part ? `${PARTS[part].label} · ${PARTS[part].sub}` : (mrActive ? PARTS[mrActive].label : "The rocket");
    mr.classList.toggle("show", !!part);
  });

  /* ================= ignition intro ================= */
  (function intro() {
    const el = $("#intro");
    let seen = false;
    try { seen = sessionStorage.getItem("jules-intro") === "1"; } catch (e) {}
    if (reduced || seen || location.hash) { el.remove(); return; }
    try { sessionStorage.setItem("jules-intro", "1"); } catch (e) {}
    if (lenis) lenis.stop();
    const count = $("#introCount"), timers = [];
    const at = (ms, fn) => timers.push(setTimeout(fn, ms));
    const finish = () => {
      timers.forEach(clearTimeout);
      el.classList.add("out");
      if (lenis) lenis.start();
      setTimeout(() => el.remove(), 950);
      ["click", "keydown", "wheel", "touchstart"].forEach(ev => removeEventListener(ev, finish));
    };
    at(80, () => el.classList.add("go"));
    at(900, () => count.textContent = "T – 3");
    at(1300, () => count.textContent = "T – 2");
    at(1700, () => count.textContent = "T – 1");
    at(2100, () => { count.textContent = "IGNITION"; el.classList.add("ignite"); });
    at(2550, finish);
    ["click", "keydown", "wheel", "touchstart"].forEach(ev => addEventListener(ev, finish, { passive: true }));
  })();

  /* ================= countdowns ================= */
  const daysTo = ([y, m, d]) => {
    const a = new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
    return Math.max(0, Math.round((new Date(y, m, d) - a) / 864e5));
  };
  $("#engMeta").innerHTML = `<span>${esc(D.dates.departureLabel)} <b>T–${daysTo(D.dates.departure)}</b> days</span><span>Term 1 <b>T–${daysTo(D.dates.term1)}</b> days</span>`;
  $("#today").textContent = TODAY.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" });

  /* ================= burns (today's tasks) ================= */
  let tasks = store.get("ascent-tasks", null);
  if (!Array.isArray(tasks) || !tasks.length) tasks = D.tasks.map(t => ({ ...t, done: false }));
  const saveTasks = () => store.set("ascent-tasks", tasks);
  let glowTarget = 0;
  const cluster = $("#cluster"), tasklist = $("#tasklist");
  const burnButton = (tk, i) =>
    `<button type="button" class="burn" data-i="${i}" aria-pressed="${tk.done}"><span class="ring" aria-hidden="true"></span>` +
    `<span class="time">${esc(tk.t)}</span><span class="what"><b>${esc(tk.what)}</b><em>${esc(tk.proj)}</em></span><span class="dur">${tk.h} h</span></button>`;
  function renderCluster() {
    const W = cluster.clientWidth || 700, H = cluster.clientHeight || 440;
    const cx = W / 2, cy = H / 2, n = tasks.length;
    const R = Math.min(W, H) * (n > 4 ? .27 : .23), Dm = Math.min(R * (n > 4 ? .68 : .86), 98);
    const skirt = 2 * R + Dm + 34, lit = tasks.filter(t => t.done).length;
    let lines = "", parts = "";
    tasks.forEach((tk, i) => {
      const ang = (-135 + i * 360 / n) * Math.PI / 180, ca = Math.cos(ang), sa = Math.sin(ang);
      const ex = cx + ca * R, ey = cy + sa * R;
      const left = ca < -0.01 || (Math.abs(ca) <= .01 && i % 2);
      const lx = cx + (left ? -1 : 1) * (skirt / 2 + 30), ly = cy + sa * (R + Dm * .2);
      lines += `<line x1="${(ex + ca * (Dm / 2 + 4)).toFixed(1)}" y1="${(ey + sa * (Dm / 2 + 4)).toFixed(1)}" x2="${(lx + (left ? 8 : -8)).toFixed(1)}" y2="${ly.toFixed(1)}"/>`;
      parts += `<button type="button" class="eng" data-i="${i}" aria-pressed="${tk.done}" aria-label="${esc(tk.what)} at ${esc(tk.t)}" style="left:${ex}px;top:${ey}px;width:${Dm}px;height:${Dm}px"></button>` +
        `<button type="button" class="eng-label ${left ? "left" : "right"}" data-i="${i}" data-lit="${tk.done}" style="left:${lx}px;top:${ly}px" tabindex="-1" aria-hidden="true">` +
        `<span class="tm">${esc(tk.t)} · ${tk.h} h</span><b>${esc(tk.what)}</b><em>${esc(tk.proj)}</em></button>`;
    });
    cluster.innerHTML = `<svg class="cl-lines" viewBox="0 0 ${W} ${H}">${lines}</svg>` +
      `<div class="cl-skirt" style="left:${cx}px;top:${cy}px;width:${skirt}px;height:${skirt}px"></div>${parts}` +
      `<div class="cl-hub" style="left:${cx}px;top:${cy}px"><b>${lit}/${n}</b><span>lit</span></div>`;
    tasklist.innerHTML = tasks.map(burnButton).join("");
    glowTarget = n ? lit / n : 0;
  }
  function toggleTask(i) { if (!tasks[i]) return; tasks[i].done = !tasks[i].done; saveTasks(); renderCluster(); if (openPart === "engines") renderPage("engines"); }
  [cluster, tasklist].forEach(el => el.addEventListener("click", e => { const b = e.target.closest("[data-i]"); if (b) toggleTask(+b.dataset.i); }));
  renderCluster();

  /* ================= side projects ================= */
  $("#projects").innerHTML = D.projects.map((pr, i) =>
    `<div class="prj" data-show="${(.3 + i * .1).toFixed(2)},.95" data-fill="1"><span class="prj-name">${esc(pr.n)}</span>` +
    `<span class="prj-pct">${pad2(Math.round(pr.p * 100))}%</span><span class="prj-bar"><i style="--p:${pr.p * 100}%"></i></span>` +
    `<span class="prj-next"><span>NEXT</span>${esc(pr.steps[0] || "")}</span></div>`).join("");

  /* ================= launch callouts ================= */
  const SPOTS = [[6, 30], [9, 58], [60, 26], [57, 56]];
  $("#callouts").innerHTML = D.highlights.slice(0, 4).map(([t, sub], i) =>
    `<div class="layer callout" data-show="${(.6 + i * .05).toFixed(2)},.93" style="left:${SPOTS[i][0]}%;top:${SPOTS[i][1]}%">` +
    `<span class="mark"></span><span class="lead"></span><span><b>${esc(t)}</b><em>${esc(sub)}</em></span></div>`).join("");

  /* ================= the star: route of future skills ================= */
  $("#nodes").innerHTML = D.future.map((f, i) =>
    `<div class="layer node${i === D.future.length - 1 ? " goal" : ""}" style="left:${f.x}%;top:${f.y}%" data-show="${(.3 + i * .11).toFixed(2)},1">` +
    `<span class="ring2"></span><span><b>${esc(f.n)}</b><em>${esc(f.m)}</em><span class="eta">${esc(f.eta)}</span></span></div>`).join("");
  const route = $("#route"), routeSvg = $(".constellation");
  let routeLen = 1;
  function layoutRoute() {
    const pin = routeSvg.parentElement, w = pin.clientWidth, h = pin.clientHeight;
    routeSvg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    route.setAttribute("d", D.future.map((f, i) => `${i ? "L" : "M"}${(f.x / 100 * w).toFixed(1)} ${(f.y / 100 * h).toFixed(1)}`).join(" "));
    routeLen = route.getTotalLength() || 1;
    route.style.strokeDasharray = `${routeLen}`;
  }
  const starGoal = D.future[D.future.length - 1];

  /* ================= the rocket: cut-out, lit part by part ================= */
  const RK = { command: [0, 29.5, 14], body: [29.5, 63.5, 46], engines: [63.5, 68.5, 66], exhaust: [68.5, 100, 84] };
  const rkStage = $("#rkStage");
  rkStage.insertAdjacentHTML("beforeend",
    Object.entries(RK).map(([k, [a, b]]) => `<img class="rk-lit" data-part="${k}" src="img/rocket.png" alt="" style="clip-path:inset(${a}% -40% ${100 - b}% -40%)">`).join("") +
    `<div class="rk-spot" id="rkSpot"></div>` +
    Object.entries(RK).map(([k, [a, b]]) => `<button type="button" class="rk-hit" data-part="${k}" aria-label="Open ${PARTS[k].label}: ${PARTS[k].sub}" style="top:${a}%;height:${b - a}%"></button>`).join("") +
    `<button type="button" class="rk-star" data-part="star" aria-label="Open the star: the future"><i></i></button>` +
    ["star", "command", "body", "engines", "exhaust"].map((k, i) =>
      `<button type="button" class="rk-label" data-part="${k}" tabindex="-1" aria-hidden="true" style="top:${k === "star" ? -11 : RK[k][2]}%">` +
      `<span class="n">${pad2(5 - i)}</span><b>${PARTS[k].label}</b><em>${PARTS[k].sub}</em></button>`).join(""));
  let rkHover = null;
  const rkSeq = [["exhaust", .08, .24], ["engines", .24, .38], ["body", .38, .52], ["command", .52, .66], ["star", .66, .8]];
  $$("[data-part]", rkStage).forEach(el => {
    el.addEventListener("mouseenter", () => { rkHover = el.dataset.part; });
    el.addEventListener("mouseleave", () => { rkHover = null; });
    el.addEventListener("focus", () => { rkHover = el.dataset.part; });
    el.addEventListener("blur", () => { rkHover = null; });
    el.addEventListener("click", e => openPage(el.dataset.part, e));
  });
  let rkShown = "";
  function updateRocket(p) {
    const seq = rkSeq.find(([, a, b]) => p >= a && p < b);
    const finale = p >= .8;
    const part = rkHover || (seq ? seq[0] : null);
    const key = `${part}|${finale}`;
    if (key === rkShown) return;
    rkShown = key;
    $$(".rk-lit", rkStage).forEach(im => { im.classList.toggle("on", im.dataset.part === part); im.classList.toggle("soft", finale && !part); });
    $$(".rk-label", rkStage).forEach(l => l.classList.toggle("on", l.dataset.part === part || (finale && !part)));
    $(".rk-star", rkStage).classList.toggle("on", part === "star" || (finale && !part));
    const spot = $("#rkSpot");
    if (part && RK[part]) { spot.style.top = RK[part][2] + "%"; spot.style.opacity = 1; }
    else if (part === "star") { spot.style.top = "-11%"; spot.style.opacity = .6; }
    else spot.style.opacity = 0;
  }

  /* ================= flight path: the board ================= */
  const board = $("#board");
  const BD = { LEFT: 250, MW: 175, RH: 290, TOP: 40 };
  BD.W = BD.LEFT + 12 * BD.MW + 300;
  BD.H = BD.TOP + D.board.rows.length * BD.RH;
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const parseDate = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const xOf = dt => BD.LEFT + (dt.getMonth() + (dt.getDate() - 1) / new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate()) * BD.MW;
  function buildBoard() {
    board.style.width = BD.W + "px"; board.style.height = BD.H + "px";
    board.innerHTML = D.board.rows.map((row, r) => {
      let h = `<div class="bd-row" style="top:${BD.TOP + r * BD.RH}px;width:${BD.W}px;height:${BD.RH}px">`;
      h += `<div class="bd-year">${row.yr}</div>`;
      if (row.notes) h += `<div class="bd-notes">${row.notes.map(([y, t]) => `<span><i>${esc(y)}</i>${esc(t)}</span>`).join("")}</div>`;
      h += MONTHS.map((m, i) => `<span class="bd-month" style="left:${BD.LEFT + i * BD.MW}px">${m}</span>`).join("");
      h += `<div class="bd-axis" style="left:${BD.LEFT}px;width:${12 * BD.MW}px;top:${BD.RH - 24}px"></div>`;
      h += row.bars.map(b => {
        const a = parseDate(b.from), z = parseDate(b.to), x = xOf(a), w = Math.max(xOf(z) - x, 28);
        return `<div class="bd-bar${z < TODAY ? " past" : ""}" style="left:${x}px;top:34px;width:${w}px"><b>${esc(b.t)}</b>` +
          (b.c ? `<span class="cs">${b.c.map(c => `<span>${esc(c)}</span>`).join("")}</span>` : "") + (b.s ? `<span class="s">${esc(b.s)}</span>` : "") + `</div>`;
      }).join("");
      const lanes = [-1e9, -1e9];
      h += (row.marks || []).slice().sort((a, b) => parseDate(a.at) - parseDate(b.at)).map(m => {
        const dt = parseDate(m.at), x = xOf(dt);
        const lane = x - lanes[0] > 200 ? 0 : 1; lanes[lane] = x;
        const cls = m.goal ? "goal" : dt < TODAY ? "past" : "";
        return `<div class="bd-mark ${cls}" style="left:${x}px;top:34px;--h:${lane ? 178 : 128}px"><div class="lbl"><b>${esc(m.t)}</b>${m.s ? `<em>${esc(m.s)}</em>` : ""}</div></div>`;
      }).join("");
      if (row.yr === TODAY.getFullYear()) {
        h += `<div class="bd-now" style="left:${xOf(TODAY)}px;top:14px;height:${BD.RH - 30}px"><span>NOW · ${TODAY.getDate()} ${MONTHS[TODAY.getMonth()].toUpperCase()}</span></div>`;
      }
      return h + `</div>`;
    }).join("");
  }
  buildBoard();
  $("#bdNote").textContent = D.board.note || "";
  let boardKeys = [];
  function layoutBoard() {
    const vw = innerWidth, vh = innerHeight, n = D.board.rows.length;
    const s = clamp(vh * .6 / BD.RH, .8, 1.75), half = vw / (2 * s);
    const L = Math.min(half, BD.W / 2), R = Math.max(BD.W - half, BD.W / 2);
    const cyOf = r => BD.TOP + r * BD.RH + BD.RH / 2 - 8;
    const fit = Math.min(vw * .9 / BD.W, vh * .78 / BD.H);
    const a = .1, b = .84, seg = (b - a) / n;
    boardKeys = [];
    for (let r = 0; r < n; r++) {
      boardKeys.push({ p: a + r * seg, cx: L, cy: cyOf(r), s, row: r });
      boardKeys.push({ p: a + r * seg + seg * .76, cx: R, cy: cyOf(r), s, row: r });
      if (r < n - 1) boardKeys.push({ p: a + r * seg + seg * .9, cx: BD.W / 2, cy: (cyOf(r) + cyOf(r + 1)) / 2, s: s * .6, row: r });
    }
    boardKeys.push({ p: .93, cx: BD.W / 2, cy: BD.H / 2 - 20, s: fit, row: -1 });
    boardKeys.unshift({ ...boardKeys[0], p: 0 });
  }
  const bdYear = $("#bdYear"), bdLabel = $("#bdLabel");
  let bdShownRow = null;
  function updateBoard(p) {
    let k = boardKeys[boardKeys.length - 1], cam = { cx: k.cx, cy: k.cy, s: k.s }, row = k.row;
    for (let i = 0; i < boardKeys.length - 1; i++) {
      const A = boardKeys[i], B = boardKeys[i + 1];
      if (p >= A.p && p <= B.p) { const t = sm((p - A.p) / (B.p - A.p)); cam = { cx: lerp(A.cx, B.cx, t), cy: lerp(A.cy, B.cy, t), s: lerp(A.s, B.s, t) }; row = t < .5 ? A.row : B.row; break; }
    }
    board.style.transform = `translate3d(${(innerWidth / 2 - cam.cx * cam.s).toFixed(1)}px,${(innerHeight / 2 - cam.cy * cam.s).toFixed(1)}px,0) scale(${cam.s.toFixed(4)})`;
    if (row !== bdShownRow) {
      bdShownRow = row;
      const rows = D.board.rows;
      bdYear.textContent = row >= 0 ? rows[row].yr : `${rows[0].yr}–${String(rows[rows.length - 1].yr).slice(2)}`;
      bdLabel.textContent = row >= 0 ? `Row ${row + 1} of ${rows.length}` : "The whole flight";
    }
  }

  /* ================= words split for the scroll reveal ================= */
  $$("[data-words]").forEach(el => {
    const text = el.textContent.trim();
    el.setAttribute("aria-label", text);
    el.innerHTML = text.split(/\s+/).map(w => `<span class="w" aria-hidden="true">${w}</span>`).join(" ");
  });

  /* ================= WebGL depth-photo renderer ================= */
  const VS = `attribute vec2 p;varying vec2 vUv;void main(){vUv=p*.5+.5;gl_Position=vec4(p,0.,1.);}`;
  const FS = `precision mediump float;
uniform sampler2D uImg,uDepth;
uniform vec2 uRes,uImgRes,uMouse,uFocus,uCenter,uStarPos;
uniform float uZoom,uStrength,uShift,uDark,uGlow,uTime,uStarI;
varying vec2 vUv;
void main(){
  float rs=uRes.x/uRes.y, ri=uImgRes.x/uImgRes.y;
  vec2 sc = rs>ri ? vec2(1.,ri/rs) : vec2(rs/ri,1.);
  vec2 c = clamp(uCenter, sc*.5, 1.-sc*.5);
  vec2 uv = (vUv-.5)*sc + c;
  float z = uZoom*1.045;
  uv = (uv-uFocus)/z + uFocus;
  uv += uMouse*uShift/z;
  vec2 off = uMouse*uStrength/z;
  float d0 = texture2D(uDepth, uv).r;
  float d1 = texture2D(uDepth, uv + off*(d0-.45)).r;
  uv += off*((d0+d1)*.5-.45);
  uv = clamp(uv, .002, .998);
  vec3 col = texture2D(uImg, uv).rgb;
  float l = dot(col, vec3(.299,.587,.114));
  col += uGlow * col * smoothstep(.55, .95, l) * .7;
  vec2 q = (vUv-.5)*vec2(rs,1.)/max(rs,1.);
  col *= mix(.5, 1., smoothstep(.95, .25, length(q)*1.3));
  col *= 1.-uDark;
  if (uStarI > .001) {
    vec2 sp = (vUv-uStarPos)*vec2(rs,1.);
    float r = length(sp);
    float core = exp(-r*r*36000.);
    float halo = exp(-r*48.);
    float bloom = exp(-r*7.5);
    float spk = exp(-abs(sp.y)*620.)*exp(-abs(sp.x)*30.) + exp(-abs(sp.x)*620.)*exp(-abs(sp.y)*30.);
    float tw = .9 + .1*sin(uTime*2.1) + .04*sin(uTime*7.3);
    col += (vec3(1.,.98,.94)*core*1.7 + vec3(1.,.86,.66)*halo*.65 + vec3(1.,.58,.28)*bloom*.2 + vec3(1.,.92,.84)*spk*.34) * uStarI * tw;
  }
  float g = fract(sin(dot(gl_FragCoord.xy + uTime*61.7, vec2(12.9898,78.233)))*43758.5453);
  col += (g-.5)*.03;
  gl_FragColor = vec4(col, 1.);
}`;
  const DPR = Math.min(1.75, window.devicePixelRatio || 1);
  const loadImage = src => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
  function makeRenderer(canvas, strength) {
    const gl = canvas.getContext("webgl", { antialias: false, alpha: false });
    if (!gl) return null;
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error("link");
    gl.useProgram(pr);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, "p"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = {};
    ["uImg", "uDepth", "uRes", "uImgRes", "uMouse", "uFocus", "uCenter", "uStarPos", "uZoom", "uStrength", "uShift", "uDark", "uGlow", "uTime", "uStarI"].forEach(n => U[n] = gl.getUniformLocation(pr, n));
    gl.uniform1i(U.uImg, 0); gl.uniform1i(U.uDepth, 1);
    const texes = [gl.createTexture(), gl.createTexture()];
    const upload = (unit, im) => {
      gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, texes[unit]);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, im);
      [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]].forEach(([a, b]) => gl.texParameteri(gl.TEXTURE_2D, a, b));
    };
    const r = { ready: false, size: [1, 1], fade: 0 };
    r.setSource = v => Promise.all([loadImage("img/" + v.img), loadImage("img/" + v.depth)]).then(([im, dp]) => {
      upload(0, im); upload(1, dp); r.size = [im.naturalWidth, im.naturalHeight]; r.ready = true; r.fade = 1;
    });
    r.draw = s => {
      if (!r.ready) return;
      const w = Math.round(canvas.clientWidth * DPR), h = Math.round(canvas.clientHeight * DPR);
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      gl.viewport(0, 0, w, h);
      r.fade *= .9;
      gl.uniform2f(U.uRes, w, h); gl.uniform2f(U.uImgRes, r.size[0], r.size[1]);
      gl.uniform2f(U.uMouse, s.mouse[0], -s.mouse[1]);
      gl.uniform2f(U.uFocus, s.focus[0], 1 - s.focus[1]); gl.uniform2f(U.uCenter, s.center[0], 1 - s.center[1]);
      gl.uniform2f(U.uStarPos, s.star ? s.star[0] : 0, s.star ? 1 - s.star[1] : 0);
      gl.uniform1f(U.uZoom, s.zoom); gl.uniform1f(U.uStrength, strength); gl.uniform1f(U.uShift, .014);
      gl.uniform1f(U.uDark, clamp(s.dark + r.fade)); gl.uniform1f(U.uGlow, s.glow); gl.uniform1f(U.uTime, s.time); gl.uniform1f(U.uStarI, s.starI || 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    return r;
  }

  /* ================= photo variants per scene ================= */
  const VARIANTS = {
    launch: [
      { name: "Lift-off · photograph",  img: "hero.jpg",         depth: "hero-depth.png",         focus: [.514, .5], z: [1, 2.0],  cy: [.5, .5] },
      { name: "Tower · painting",       img: "launch-tower.jpg", depth: "launch-tower-depth.png", focus: [.5, .42],  z: [1, 1.6],  cy: [.5, .5] },
      { name: "Heavy lift · painting",  img: "launch-sls.jpg",   depth: "launch-sls-depth.png",   focus: [.48, .38], z: [1, 1.7],  cy: [.5, .5] },
      { name: "Tower · on the wall",    img: "wall-tower.jpg",   depth: "wall-tower-depth.png",   focus: [.5, .46],  z: [1, 1.12], cy: [.5, .5] }
    ],
    engines: [
      { name: "Engines firing · photograph", img: "engines.jpg", depth: "engines-depth.png", focus: [.47, .52], z: [1.02, 1.4], cy: [.36, .62] },
      { name: "Engine bells · photograph",   img: "steel.jpg",   depth: "steel-depth.png",   focus: [.48, .62], z: [1.05, 1.45], cy: [.5, .74] }
    ],
    body: [
      { name: "Steel body · photograph", img: "steel.jpg", depth: "steel-depth.png", focus: [.5, .4],  z: [1.25, 1.02], cy: [.62, .2] },
      { name: "Tower arms · photograph", img: "tower.jpg", depth: "tower-depth.png", focus: [.5, .45], z: [1.2, 1.02],  cy: [.66, .22] }
    ],
    star: [
      { name: "Separation · painting",     img: "space.jpg",      depth: "space-depth.png",      focus: [.46, .36], z: [1, 1.28], cy: [.5, .5] },
      { name: "Supersonic · painting",     img: "n1.jpg",         depth: "n1-depth.png",         focus: [.66, .32], z: [1, 1.3],  cy: [.5, .5] },
      { name: "Separation · on the wall",  img: "wall-space.jpg", depth: "wall-space-depth.png", focus: [.5, .46],  z: [1, 1.12], cy: [.5, .5] }
    ]
  };
  const SCENE_CFG = {
    launch:  { strength: .014, zr: [.04, .8], dim: p => Math.max(.5 * ramp(p, .18, .26) * (1 - ramp(p, .54, .6)), .32 * ramp(p, .56, .62), ramp(p, .9, 1) * .96) },
    engines: { strength: .012, zr: [0, 1],    dim: p => Math.max(.96 * (1 - ramp(p, 0, .1)), .36, ramp(p, .92, 1) * .96) },
    body:    { strength: .012, zr: [0, 1],    dim: p => Math.max(.96 * (1 - ramp(p, 0, .1)), .42, ramp(p, .92, 1) * .96) },
    star:    { strength: .02,  zr: [0, 1],    dim: p => Math.max(.96 * (1 - ramp(p, 0, .1)), .12, .3 * ramp(p, .84, .92)) }
  };

  /* ================= scenes ================= */
  const scenes = $$(".scene").map(sec => {
    const s = { sec, id: sec.id, p: 0, sp: 0, glow: 0, photo: sec.classList.contains("photo") };
    s.shows = $$("[data-show]", sec).map(el => { const [a, b] = el.dataset.show.split(",").map(Number); return { el, a, b }; });
    s.words = $$("[data-words]", sec).map(el => { const [a, b] = el.dataset.words.split(",").map(Number); return { a, b, spans: $$(".w", el) }; });
    s.chapter = $(".chapter", sec); s.lbs = $$(".lb", sec);
    if (s.photo) {
      s.cfg = SCENE_CFG[s.id]; s.vars = VARIANTS[s.id];
      s.vi = clamp(store.get("ascent-variant-" + s.id, 0) | 0, 0, s.vars.length - 1);
      s.fallback = $(".fallback", sec);
      try { s.r = makeRenderer($(".gl", sec), s.cfg.strength); } catch (e) { s.r = null; }
      if (!s.r) sec.classList.add("no-gl");
      const ctrl = $(".variant", sec);
      ctrl.innerHTML = `<button type="button" class="prev" aria-label="Previous image">‹</button><span class="vn"></span><span class="vname"></span><button type="button" class="next" aria-label="Next image">›</button>`;
      const apply = () => {
        const v = s.vars[s.vi];
        $(".vn", ctrl).textContent = `${pad2(s.vi + 1)}/${pad2(s.vars.length)}`;
        $(".vname", ctrl).textContent = v.name;
        s.fallback.src = "img/" + v.img;
        if (s.r) s.r.setSource(v).catch(() => sec.classList.add("no-gl"));
        store.set("ascent-variant-" + s.id, s.vi);
      };
      $(".prev", ctrl).addEventListener("click", () => { s.vi = (s.vi - 1 + s.vars.length) % s.vars.length; apply(); });
      $(".next", ctrl).addEventListener("click", () => { s.vi = (s.vi + 1) % s.vars.length; apply(); });
      apply();
    }
    return s;
  });

  /* ================= input ================= */
  const mouse = [0, 0], mouseT = [0, 0];
  let lastMove = -1e9;
  addEventListener("pointermove", e => {
    if (e.pointerType !== "mouse") return;
    mouseT[0] = e.clientX / innerWidth * 2 - 1; mouseT[1] = e.clientY / innerHeight * 2 - 1; lastMove = performance.now();
  }, { passive: true });
  $("#restart").addEventListener("click", () => hyperjump("launch"));
  $$(".open-part").forEach(b => b.addEventListener("click", e => openPage(b.dataset.part, e)));

  /* ================= part pages ================= */
  const page = $("#page"), pageBody = $("#pageBody"), pageRocket = $("#pageRocket");
  pageRocket.innerHTML = rocketMarkup();
  bindParts(pageRocket, part => { history.replaceState(null, "", "#part-" + part); syncPage(); });
  let openPart = null, lastFocus = null;
  function openPage(part, e) {
    let x = innerWidth / 2, y = innerHeight / 2;
    if (e && e.clientX) { x = e.clientX; y = e.clientY; }
    else if (e && e.currentTarget && e.currentTarget.getBoundingClientRect) { const r = e.currentTarget.getBoundingClientRect(); x = r.left + r.width / 2; y = r.top + r.height / 2; }
    page.style.setProperty("--cx", x + "px"); page.style.setProperty("--cy", y + "px");
    lastFocus = document.activeElement;
    if (location.hash === "#part-" + part) syncPage(); else location.hash = "part-" + part;
  }
  function closePage() { history.replaceState(null, "", location.pathname + location.search); syncPage(); }
  function syncPage() {
    const h = location.hash.slice(1);
    const part = h.startsWith("part-") && PARTS[h.slice(5)] ? h.slice(5) : null;
    if (part) {
      renderPage(part);
      if (!openPart) {
        page.hidden = false; document.documentElement.style.overflow = "hidden"; if (lenis) lenis.stop();
        requestAnimationFrame(() => requestAnimationFrame(() => page.classList.add("open")));
        setTimeout(() => $("#pageClose").focus({ preventScroll: true }), 60);
      }
      openPart = part;
      $$(".rp", pageRocket).forEach(g => g.classList.toggle("on", g.dataset.part === part));
    } else if (openPart) {
      openPart = null;
      page.classList.remove("open");
      document.documentElement.style.overflow = ""; if (lenis) lenis.start();
      setTimeout(() => { if (!openPart) page.hidden = true; }, reduced ? 0 : 900);
      if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    }
  }
  $("#pageClose").addEventListener("click", closePage);
  addEventListener("keydown", e => { if (e.key === "Escape" && openPart) closePage(); });
  addEventListener("hashchange", syncPage);

  function renderPage(part) {
    const P = PARTS[part];
    $("#pageEyebrow").innerHTML = `<span class="num">${pad2(5 - ORDER.indexOf(part))}</span><span class="rule"></span>${P.label} · ${P.sub}`;
    $("#pageTitle").textContent = P.title;
    $("#pageLede").textContent = P.lede;
    pageBody.innerHTML = PAGES[part]();
    page.scrollTop = 0;
    if (part === "engines") wireToday();
  }
  const sec = (n, t) => `<h3 class="sec-h"><span class="num">${pad2(n)}</span>${esc(t)}</h3>`;
  const bar = p => `<span class="prj-bar"><i style="--p:${p * 100}%"></i></span>`;
  const fuelNow = () => D.fuelBase + tasks.reduce((s, t) => s + (t.done ? +t.h : 0), 0);
  const PAGES = {
    exhaust: () => D.flightLog.map((g, gi) => sec(gi + 1, g.group) + `<ul class="log">` +
      g.items.map(([y, t, s]) => `<li><span class="y">${esc(y)}</span><div><b>${esc(t)}</b>${s ? `<span>${esc(s)}</span>` : ""}</div></li>`).join("") + `</ul>`).join(""),
    engines: () => {
      const f = fuelNow(), lit = tasks.filter(t => t.done).length;
      return `<div class="stats">
        <div class="stat"><div class="l">Engines lit</div><div class="v">${lit}/${tasks.length}</div><div class="s">today's burns</div></div>
        <div class="stat"><div class="l">Fuel this week</div><div class="v">${f.toFixed(1)}<small> / ${D.fuelGoal} h</small></div><div class="gauge"><i style="width:${Math.min(100, f / D.fuelGoal * 100)}%"></i></div></div>
        <div class="stat"><div class="l">${esc(D.dates.departureLabel)}</div><div class="v">T–${daysTo(D.dates.departure)}</div><div class="s">days</div></div>
      </div>` + sec(1, "Burns") +
      `<div class="today-list" id="todayList">${tasks.map((t, i) => `<div class="today-row">${burnButton(t, i)}<button type="button" class="rm-btn" data-rm="${i}">Remove</button></div>`).join("") || `<p class="note">No burns yet. Add one below.</p>`}</div>` +
      sec(2, "Add a burn") +
      `<form class="add" id="addForm" novalidate>
        <label for="fTime">Time<input id="fTime" type="time" value="14:00"></label>
        <label for="fWhat">What<input id="fWhat" type="text" placeholder="Vectors: lines and planes" maxlength="40"></label>
        <label for="fProj">Project<select id="fProj">${["Habit", ...D.projects.map(p => p.n), "Flight school"].map(n => `<option>${esc(n)}</option>`).join("")}</select></label>
        <label for="fH">Hours<input id="fH" type="number" min="0.25" max="8" step="0.25" value="1"></label>
        <button class="cta" type="submit">Add burn</button>
        <p class="err" id="fErr" role="alert"></p>
      </form>
      <p class="note">Burns are saved in this browser. Up to eight engines fit the cluster.</p>`;
    },
    body: () => D.projects.map(pr => `<div class="proj"><div><span class="status">${esc(pr.status)}</span><h3>${esc(pr.n)}</h3></div>` +
      `<span class="pct">${pad2(Math.round(pr.p * 100))}%</span>${bar(pr.p)}<ol>${pr.steps.map(s => `<li>${esc(s)}</li>`).join("")}</ol></div>`).join(""),
    command: () => `<div class="stats">
        <div class="stat"><div class="l">${esc(D.dates.departureLabel)}</div><div class="v">T–${daysTo(D.dates.departure)}</div><div class="s">days</div></div>
        <div class="stat"><div class="l">O-Week</div><div class="v">T–${daysTo(D.dates.oweek)}</div><div class="s">days · 8 Feb 2027</div></div>
        <div class="stat"><div class="l">Term 1</div><div class="v">T–${daysTo(D.dates.term1)}</div><div class="s">days · 15 Feb 2027</div></div>
      </div>` + sec(1, "Year 1 at UNSW · 2027") +
      `<div class="terms">${D.year1.map(t => `<div class="term"><h4>${esc(t.term)}</h4><ul>${t.c.map(([c, n]) => `<li><code>${esc(c)}</code><span>${esc(n)}</span></li>`).join("")}</ul></div>`).join("")}</div>` +
      sec(2, "The rest of the degree") +
      `<div class="later">${D.later.map(y => `<div><h4>${esc(y.yr)}</h4><ul>${y.c.map(c => { const [code, ...rest] = c.split(" "); return `<li><code>${esc(code)}</code><span>${esc(rest.join(" "))}</span></li>`; }).join("")}</ul></div>`).join("")}</div>
      <p class="note">Industrial training is 60 days of approved work experience (ENGG4999), usually done over a summer. Courses come from UNSW's 2025 sample study plan for Aerospace (AEROAH). UNSW moves from terms to two semesters a year from 2028, so Years 2–4 will be reshuffled. Check myPlan when you enrol.</p>`,
    star: () => sec(1, "Skills, nearest first") + `<ul class="log">` +
      D.future.map(f => `<li><span class="y">${esc(f.eta)}</span><div><b>${esc(f.n)}</b><span>${esc(f.m)}. ${esc(f.why)}</span></div></li>`).join("") + `</ul>` +
      sec(2, "What opens up") + `<ul class="log">` + D.prospects.map(([t, s], i) => `<li><span class="y">${pad2(i + 1)}</span><div><b>${esc(t)}</b><span>${esc(s)}</span></div></li>`).join("") + `</ul>`
  };
  function wireToday() {
    const list = $("#todayList"), form = $("#addForm"), err = $("#fErr");
    list.addEventListener("click", e => {
      const rm = e.target.closest("[data-rm]");
      if (rm) { tasks.splice(+rm.dataset.rm, 1); saveTasks(); renderCluster(); renderPage("engines"); return; }
      const b = e.target.closest(".burn"); if (b) toggleTask(+b.dataset.i);
    });
    ["fWhat", "fH", "fTime"].forEach(id => $("#" + id).addEventListener("input", () => { err.textContent = ""; }));
    form.addEventListener("submit", e => {
      e.preventDefault();
      const what = $("#fWhat").value.trim(), h = parseFloat($("#fH").value), t = $("#fTime").value;
      if (!what) { err.textContent = "Give the burn a name first."; $("#fWhat").focus(); return; }
      if (!(h > 0 && h <= 8)) { err.textContent = "Hours must be between 0.25 and 8."; $("#fH").focus(); return; }
      if (!t) { err.textContent = "Pick a time."; $("#fTime").focus(); return; }
      if (tasks.length >= 8) { err.textContent = "Eight engines is the limit. Remove one first."; return; }
      tasks.push({ t, what, proj: $("#fProj").value, h, done: false });
      tasks.sort((a, b) => a.t.localeCompare(b.t));
      saveTasks(); renderCluster(); renderPage("engines");
    });
  }

  /* ================= frame loop ================= */
  const progEl = $("#progress"), altEl = $("#alt");
  const SCENE_PART = { launch: "exhaust", rocket: null, engines: "engines", body: "body", command: "command", star: "star" };
  let activeId = "";
  function layerStyle(o, p) {
    const fin = o.a <= 0 ? 1 : ramp(p, o.a, o.a + .06);
    const fout = o.b >= 1 ? 1 : 1 - ramp(p, o.b - .06, o.b);
    const v = Math.min(fin, fout);
    o.el.style.opacity = v.toFixed(3);
    o.el.style.visibility = v < .01 ? "hidden" : "visible";
    o.el.style.translate = `0 ${((1 - fin) * 22 - (1 - fout) * 16).toFixed(1)}px`;
    if (o.el.dataset.fill) o.el.style.setProperty("--fill", sm((p - o.a) / .12).toFixed(3));
  }
  function frame(now) {
    const vh = innerHeight, sy = scrollY;
    const max = Math.max(1, document.documentElement.scrollHeight - vh);
    progEl.style.setProperty("--prog", (sy / max * 100).toFixed(2) + "%");
    altEl.textContent = `ALT ${(sy / max * 100).toFixed(1).padStart(5, "0")} KM`;
    const idle = now - lastMove > 2500;
    const tx = reduced ? 0 : idle ? Math.sin(now * .00021) * .4 : mouseT[0];
    const ty = reduced ? 0 : idle ? Math.cos(now * .00017) * .25 : mouseT[1];
    mouse[0] += (tx - mouse[0]) * .045; mouse[1] += (ty - mouse[1]) * .045;

    scenes.forEach(s => {
      const top = s.sec.offsetTop, h = s.sec.offsetHeight;
      const visible = sy + vh > top && sy < top + h;
      s.p = clamp((sy - top) / (h - vh));
      s.sp = reduced || snap ? s.p : s.sp + (s.p - s.sp) * .14;
      if (Math.abs(s.p - s.sp) < .0005) s.sp = s.p;
      const mid = sy + vh / 2;
      if (mid >= top && mid < top + h && s.id !== activeId) {
        activeId = s.id;
        mrActive = SCENE_PART[s.id];
        $$(".rp", mrSvg).forEach(g => g.classList.toggle("on", g.dataset.part === mrActive));
        mrLabel.textContent = mrActive ? PARTS[mrActive].label : "The rocket";
        $$("#jumps button").forEach(b => b.classList.toggle("on", b.dataset.jump === s.id));
      }
      if (!visible || openPart) return;
      const p = s.sp;
      if (s.chapter) s.chapter.style.opacity = (1 - ramp(p, .035, .1)).toFixed(3);
      if (s.lbs.length) { const lb = 11 * Math.max(1 - ramp(p, .07, .16), ramp(p, .93, 1)); s.lbs.forEach(el => el.style.setProperty("--lb", lb.toFixed(2) + "vh")); }
      if (s.photo) {
        const v = s.vars[s.vi], c = s.cfg;
        const zoom = lerp(v.z[0], v.z[1], sm(ramp(p, c.zr[0], c.zr[1])));
        const center = [.5, lerp(v.cy[0], v.cy[1], sm(p))], dark = c.dim(p);
        if (s.id === "engines") s.glow = lerp(s.glow, glowTarget, .06);
        const glow = s.id === "engines" ? s.glow * (.85 + .15 * Math.sin(now * .012)) : 0;
        const starI = s.id === "star" ? ramp(p, .18, .34) : 0;
        if (s.r && s.r.ready && !s.sec.classList.contains("no-gl")) {
          s.r.draw({ zoom, focus: v.focus, center, mouse, dark, glow, time: (now / 1000) % 1000, star: [starGoal.x / 100, starGoal.y / 100], starI });
        } else {
          s.fallback.style.transformOrigin = `${v.focus[0] * 100}% ${v.focus[1] * 100}%`;
          s.fallback.style.objectPosition = `50% ${center[1] * 100}%`;
          s.fallback.style.transform = `scale(${zoom.toFixed(3)})`;
          s.fallback.style.filter = `brightness(${(1 - dark).toFixed(3)})`;
        }
      }
      s.shows.forEach(o => layerStyle(o, p));
      s.words.forEach(w => {
        const n = w.spans.length, span = (w.b - w.a) / n;
        w.spans.forEach((el, i) => { el.style.opacity = (.16 + .84 * ramp(p, w.a + span * i, w.a + span * (i + 1.4))).toFixed(3); });
      });
      if (s.id === "rocket") updateRocket(p);
      if (s.id === "command") updateBoard(p);
      if (s.id === "star") route.style.strokeDashoffset = (routeLen * (1 - ramp(p, .3, .8))).toFixed(1);
    });
    snap = false;
    if (!reduced) requestAnimationFrame(frame);
  }
  function relayout() { renderCluster(); layoutRoute(); layoutBoard(); if (reduced) frame(performance.now()); }
  addEventListener("resize", relayout);
  if (reduced) addEventListener("scroll", () => frame(performance.now()), { passive: true });
  layoutRoute(); layoutBoard();
  syncPage();
  requestAnimationFrame(frame);
  if (reduced) Promise.all(scenes.filter(s => s.r).map(s => s.r.setSource(s.vars[s.vi]).catch(() => {}))).then(() => frame(performance.now()));
})();
