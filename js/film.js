/* JULES · film.js
   The launch film: the cinematic scroll from v0.4, now a mode you open from the app (#film).
   It reads the same live data as the app: today's tasks light the engines, projects fill the
   body, the flight path becomes one line, skills plot the route to the star.
   Nothing here runs until you open the film, and it all stops when you leave.

   Read top to bottom: helpers, data from the store, building each scene, the WebGL photo
   renderer, then enter / leave and the frame loop that moves everything as you scroll. */
(function () {
  "use strict";
  const J = window.J, S = J.store;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const clamp = J.clamp;
  const sm = t => { t = clamp(t); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;
  const ramp = (p, a, b) => sm((p - a) / (b - a));
  const { $, $$, esc, pad2 } = J;
  const ls = { get(k, f) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? f : v; } catch (e) { return f; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };

  /* Which app view each rocket part opens. */
  const PARTS = {
    star:    { label: "The star",       sub: "The future",    view: "star" },
    command: { label: "Command module", sub: "Flight path",   view: "path" },
    body:    { label: "Body",           sub: "Side projects", view: "projects" },
    engines: { label: "Engines",        sub: "Today",         view: "home" },
    exhaust: { label: "Exhaust",        sub: "Flight log",    view: "log" }
  };
  const SCENE_PART = { launch: "exhaust", rocket: null, engines: "engines", body: "body", command: "command", star: "star" };
  const HIT = { star: [70, 16, 60, 60], command: [56, 104, 88, 196], body: [30, 300, 140, 340], engines: [60, 640, 80, 68], exhaust: [54, 708, 92, 190] };
  const ORDER = ["star", "command", "body", "engines", "exhaust"];
  const rocketMarkup = (interactive = true) => ORDER.map(k =>
    `<g class="rp" data-part="${k}"${interactive ? ` role="button" tabindex="0" aria-label="${PARTS[k].label}: ${PARTS[k].sub}"` : ""}>` +
    `<rect class="hit" x="${HIT[k][0]}" y="${HIT[k][1]}" width="${HIT[k][2]}" height="${HIT[k][3]}"/>` +
    J.ROCKET[k].map(d => `<path d="${d}"/>`).join("") + `</g>`).join("");

  let inited = false, running = false, lenis = null, snap = false;
  let scenes = [], glowTarget = 0, routeLen = 1, starPos = [.82, .2];
  let mrActive = "exhaust", activeId = "", rkHover = null, rkShown = "";
  const mouse = [0, 0], mouseT = [0, 0];
  let lastMove = -1e9;

  /* Leave the film for an app view, through the warp. */
  function toApp(view) { J.warp(() => { location.hash = view; }); }

  /* ================= data from the store ================= */
  function filmData() {
    const today = J.today(), all = S.list("tasks"), meta = S.meta();
    const todays = all.filter(t => t.due === today).sort((a, b) => (a.start == null) - (b.start == null) || (a.start || 0) - (b.start || 0)).slice(0, 8);
    const projects = S.list("projects").filter(p => p.status !== "landed").slice(0, 4).map(p => {
      const ts = all.filter(t => t.project === p.id), done = ts.filter(t => t.status === "done").length;
      const next = ts.filter(t => t.status !== "done").sort((a, b) => String(a.due || "9").localeCompare(String(b.due || "9")))[0];
      return { name: p.name, p: ts.length ? done / ts.length : (p.progress || 0), next: next ? next.title : "" };
    });
    const highlights = S.list("log").filter(e => e.highlight).slice(0, 4);
    const skills = S.list("skills");
    const countdowns = (meta.countdowns || []).filter(c => c.date && J.daysUntil(c.date) >= 0).sort((a, b) => a.date.localeCompare(b.date));
    const projName = id => { const p = id && S.get("projects", id); return p ? p.name : (all.find(t => t.id === id) ? "" : ""); };
    return { todays, projects, highlights, skills, countdowns, projName };
  }

  /* ================= scene builders ================= */
  function renderEngines() {
    const D = filmData(), tasks = D.todays;
    const cd = D.countdowns.slice(0, 2);
    $("#engMeta").innerHTML = cd.map(c => `<span>${esc(c.label)} <b>T–${J.daysUntil(c.date)}</b> days</span>`).join("");
    $("#today").textContent = J.fmtDate(J.today(), { long: true });
    const cluster = $("#cluster"), tasklist = $("#tasklist");
    const W = cluster.clientWidth || 700, H = cluster.clientHeight || 440;
    const cx = W / 2, cy = H / 2, n = tasks.length;
    const lit = tasks.filter(t => t.status === "done").length;
    glowTarget = n ? lit / n : 0;
    const label = t => t.start != null ? J.fmtTime(t.start) : "Any time";
    const hrs = t => t.dur ? J.fmtDur(t.dur) : "";
    if (!n) {
      cluster.innerHTML = `<div class="cl-hub" style="left:${cx}px;top:${cy}px"><b>0</b><span>booked</span></div>`;
      tasklist.innerHTML = `<p class="note">Nothing booked for today. Open today to plan it.</p>`;
      return;
    }
    const R = Math.min(W, H) * (n > 4 ? .27 : .23), Dm = Math.min(R * (n > 4 ? .68 : .86), 98);
    const skirt = 2 * R + Dm + 34;
    let lines = "", parts = "";
    tasks.forEach((tk, i) => {
      const done = tk.status === "done";
      const ang = (-135 + i * 360 / n) * Math.PI / 180, ca = Math.cos(ang), sa = Math.sin(ang);
      const ex = cx + ca * R, ey = cy + sa * R;
      const left = ca < -0.01 || (Math.abs(ca) <= .01 && i % 2);
      const lx = cx + (left ? -1 : 1) * (skirt / 2 + 30), ly = cy + sa * (R + Dm * .2);
      lines += `<line x1="${(ex + ca * (Dm / 2 + 4)).toFixed(1)}" y1="${(ey + sa * (Dm / 2 + 4)).toFixed(1)}" x2="${(lx + (left ? 8 : -8)).toFixed(1)}" y2="${ly.toFixed(1)}"/>`;
      parts += `<button type="button" class="eng" data-id="${tk.id}" aria-pressed="${done}" aria-label="${esc(tk.title)}, ${label(tk)}" style="left:${ex}px;top:${ey}px;width:${Dm}px;height:${Dm}px"></button>` +
        `<button type="button" class="eng-label ${left ? "left" : "right"}" data-id="${tk.id}" data-lit="${done}" style="left:${lx}px;top:${ly}px" tabindex="-1" aria-hidden="true">` +
        `<span class="tm">${label(tk)}${hrs(tk) ? " · " + hrs(tk) : ""}</span><b>${esc(tk.title)}</b><em>${esc(D.projName(tk.project))}</em></button>`;
    });
    cluster.innerHTML = `<svg class="cl-lines" viewBox="0 0 ${W} ${H}">${lines}</svg>` +
      `<div class="cl-skirt" style="left:${cx}px;top:${cy}px;width:${skirt}px;height:${skirt}px"></div>${parts}` +
      `<div class="cl-hub" style="left:${cx}px;top:${cy}px"><b>${lit}/${n}</b><span>lit</span></div>`;
    tasklist.innerHTML = tasks.map(tk => `<button type="button" class="burn" data-id="${tk.id}" aria-pressed="${tk.status === "done"}"><span class="ring" aria-hidden="true"></span>` +
      `<span class="time">${label(tk)}</span><span class="what"><b>${esc(tk.title)}</b><em>${esc(D.projName(tk.project))}</em></span><span class="dur">${hrs(tk)}</span></button>`).join("");
  }
  function renderProjects() {
    $("#projects").innerHTML = filmData().projects.map((pr, i) =>
      `<div class="prj" data-show="${(.3 + i * .1).toFixed(2)},.95" data-fill="1"><span class="prj-name">${esc(pr.name)}</span>` +
      `<span class="prj-pct">${pad2(Math.round(pr.p * 100))}%</span><span class="prj-bar"><i style="--p:${pr.p * 100}%"></i></span>` +
      `<span class="prj-next"><span>NEXT</span>${esc(pr.next)}</span></div>`).join("") || `<p class="note">No active projects yet.</p>`;
  }
  const SPOTS = [[6, 30], [9, 58], [60, 26], [57, 56]];
  function renderCallouts() {
    $("#callouts").innerHTML = filmData().highlights.map((e, i) =>
      `<div class="layer callout" data-show="${(.6 + i * .05).toFixed(2)},.93" style="left:${SPOTS[i][0]}%;top:${SPOTS[i][1]}%">` +
      `<span class="mark"></span><span class="lead"></span><span><b>${esc(e.title)}</b><em>${esc([e.detail.split("·")[0].trim(), e.when].filter(Boolean).join(" · "))}</em></span></div>`).join("");
  }
  /* Skills sit on a rising diagonal towards the star, nearest first. */
  function nodePositions(n) {
    return Array.from({ length: n }, (_, i) => {
      const t = n === 1 ? 1 : i / (n - 1);
      return [14 + t * 68, 76 - t * 56 + (i % 2 && i < n - 1 ? 3 : 0)];
    });
  }
  function renderStar() {
    const skills = filmData().skills, pos = nodePositions(skills.length);
    $("#nodes").innerHTML = skills.map((f, i) =>
      `<div class="layer node${i === skills.length - 1 ? " goal" : ""}" style="left:${pos[i][0]}%;top:${pos[i][1]}%" data-show="${(.3 + i * Math.min(.11, .5 / Math.max(1, skills.length))).toFixed(2)},1">` +
      `<span class="ring2"></span><span><b>${esc(f.name)}</b><em>${esc(f.detail)}</em><span class="eta">${esc(f.eta)}</span></span></div>`).join("");
    if (skills.length) starPos = [pos[pos.length - 1][0] / 100, pos[pos.length - 1][1] / 100];
    layoutRoute(pos);
  }
  function layoutRoute(pos) {
    const route = $("#route"), svg = $(".constellation");
    pos = pos || nodePositions(S.list("skills").length);
    const pin = svg.parentElement, w = pin.clientWidth, h = pin.clientHeight;
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    route.setAttribute("d", pos.map((p, i) => `${i ? "L" : "M"}${(p[0] / 100 * w).toFixed(1)} ${(p[1] / 100 * h).toFixed(1)}`).join(" "));
    routeLen = route.getTotalLength() || 1;
    route.style.strokeDasharray = `${routeLen}`;
  }
  function renderCommand() {
    const items = J.pathItems ? J.pathItems() : [];
    $("#fpStrip").innerHTML = J.strip ? J.strip(items, { cls: "film-strip" }) : "";
    const today = J.today();
    const upcoming = items.filter(x => (x.kind === "event" ? x.at : x.from) >= today).slice(0, 3);
    $("#fpCounts").innerHTML = upcoming.map(x => { const d = x.kind === "event" ? x.at : x.from; return `<div class="fp-c"><span class="tc">T–${J.daysUntil(d)}</span><b>${esc(x.title)}</b><em>${esc(J.fmtDate(d, { year: true }))}${x.estimate ? " · estimate" : ""}</em></div>`; }).join("");
  }
  function refresh() {
    if (!inited) return;
    renderEngines(); renderProjects(); renderCallouts(); renderStar(); renderCommand();
    scenes.forEach(s => { s.shows = $$("[data-show]", s.sec).map(el => { const [a, b] = el.dataset.show.split(",").map(Number); return { el, a, b }; }); });
    layoutRocketShown();
  }
  function layoutRocketShown() { rkShown = ""; }

  /* ================= the rocket cut-out, lit part by part ================= */
  const RK = { command: [0, 29.5, 14], body: [29.5, 63.5, 46], engines: [63.5, 68.5, 66], exhaust: [68.5, 100, 84] };
  const rkSeq = [["exhaust", .08, .24], ["engines", .24, .38], ["body", .38, .52], ["command", .52, .66], ["star", .66, .8]];
  function buildRocket() {
    const st = $("#rkStage");
    st.insertAdjacentHTML("beforeend",
      Object.entries(RK).map(([k, [a, b]]) => `<img class="rk-lit" data-part="${k}" src="img/rocket.png" alt="" style="clip-path:inset(${a}% -40% ${100 - b}% -40%)">`).join("") +
      `<div class="rk-spot" id="rkSpot"></div>` +
      Object.entries(RK).map(([k, [a, b]]) => `<button type="button" class="rk-hit" data-part="${k}" aria-label="Open ${PARTS[k].label}: ${PARTS[k].sub}" style="top:${a}%;height:${b - a}%"></button>`).join("") +
      `<button type="button" class="rk-star" data-part="star" aria-label="Open the star: the future"><i></i></button>` +
      ORDER.map((k, i) => `<button type="button" class="rk-label" data-part="${k}" tabindex="-1" aria-hidden="true" style="top:${k === "star" ? -11 : RK[k][2]}%">` +
        `<span class="n">${pad2(5 - i)}</span><b>${PARTS[k].label}</b><em>${PARTS[k].sub}</em></button>`).join(""));
    $$("[data-part]", st).forEach(el => {
      el.addEventListener("mouseenter", () => { rkHover = el.dataset.part; });
      el.addEventListener("mouseleave", () => { rkHover = null; });
      el.addEventListener("focus", () => { rkHover = el.dataset.part; });
      el.addEventListener("blur", () => { rkHover = null; });
      el.addEventListener("click", () => toApp(PARTS[el.dataset.part].view));
    });
  }
  function updateRocket(p) {
    const seq = rkSeq.find(([, a, b]) => p >= a && p < b), finale = p >= .8;
    const part = rkHover || (seq ? seq[0] : null), key = `${part}|${finale}`;
    if (key === rkShown) return;
    rkShown = key;
    const st = $("#rkStage");
    $$(".rk-lit", st).forEach(im => { im.classList.toggle("on", im.dataset.part === part); im.classList.toggle("soft", finale && !part); });
    $$(".rk-label", st).forEach(l => l.classList.toggle("on", l.dataset.part === part || (finale && !part)));
    $(".rk-star", st).classList.toggle("on", part === "star" || (finale && !part));
    const spot = $("#rkSpot");
    if (part && RK[part]) { spot.style.top = RK[part][2] + "%"; spot.style.opacity = 1; }
    else if (part === "star") { spot.style.top = "-11%"; spot.style.opacity = .6; }
    else spot.style.opacity = 0;
  }

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
      { name: "Lift-off · photograph", img: "hero.jpg", depth: "hero-depth.png", focus: [.514, .5], z: [1, 2.0], cy: [.5, .5] },
      { name: "Tower · painting", img: "launch-tower.jpg", depth: "launch-tower-depth.png", focus: [.5, .42], z: [1, 1.6], cy: [.5, .5] },
      { name: "Heavy lift · painting", img: "launch-sls.jpg", depth: "launch-sls-depth.png", focus: [.48, .38], z: [1, 1.7], cy: [.5, .5] },
      { name: "Tower · on the wall", img: "wall-tower.jpg", depth: "wall-tower-depth.png", focus: [.5, .46], z: [1, 1.12], cy: [.5, .5] }
    ],
    engines: [
      { name: "Engines firing · photograph", img: "engines.jpg", depth: "engines-depth.png", focus: [.47, .52], z: [1.02, 1.4], cy: [.36, .62] },
      { name: "Engine bells · photograph", img: "steel.jpg", depth: "steel-depth.png", focus: [.48, .62], z: [1.05, 1.45], cy: [.5, .74] }
    ],
    body: [
      { name: "Steel body · photograph", img: "steel.jpg", depth: "steel-depth.png", focus: [.5, .4], z: [1.25, 1.02], cy: [.62, .2] },
      { name: "Tower arms · photograph", img: "tower.jpg", depth: "tower-depth.png", focus: [.5, .45], z: [1.2, 1.02], cy: [.66, .22] }
    ],
    star: [
      { name: "Separation · painting", img: "space.jpg", depth: "space-depth.png", focus: [.46, .36], z: [1, 1.28], cy: [.5, .5] },
      { name: "Supersonic · painting", img: "n1.jpg", depth: "n1-depth.png", focus: [.66, .32], z: [1, 1.3], cy: [.5, .5] },
      { name: "Separation · on the wall", img: "wall-space.jpg", depth: "wall-space-depth.png", focus: [.5, .46], z: [1, 1.12], cy: [.5, .5] }
    ]
  };
  const SCENE_CFG = {
    launch:  { strength: .014, zr: [.04, .8], dim: p => Math.max(.5 * ramp(p, .18, .26) * (1 - ramp(p, .54, .6)), .32 * ramp(p, .56, .62), ramp(p, .9, 1) * .96) },
    engines: { strength: .012, zr: [0, 1],    dim: p => Math.max(.96 * (1 - ramp(p, 0, .1)), .36, ramp(p, .92, 1) * .96) },
    body:    { strength: .012, zr: [0, 1],    dim: p => Math.max(.96 * (1 - ramp(p, 0, .1)), .42, ramp(p, .92, 1) * .96) },
    star:    { strength: .02,  zr: [0, 1],    dim: p => Math.max(.96 * (1 - ramp(p, 0, .1)), .12, .3 * ramp(p, .84, .92)) }
  };

  /* ================= navigation inside the film ================= */
  const JUMP_AT = { launch: 0, rocket: .86, engines: .45, body: .62, command: .5, star: .8 };
  const targetY = id => { const s = document.getElementById(id); return s ? s.offsetTop + (s.offsetHeight - innerHeight) * (JUMP_AT[id] || 0) : 0; };
  function jumpNow(id) { const y = targetY(id); if (lenis) lenis.scrollTo(y, { immediate: true, force: true }); else window.scrollTo(0, y); snap = true; }
  const hyperjump = id => J.warp(() => jumpNow(id));
  const JUMPS = [["launch", "Launch"], ["rocket", "Rocket"], ["engines", "Today"], ["body", "Projects"], ["command", "Flight path"], ["star", "Star"]];

  /* ================= one-time set-up ================= */
  function init() {
    inited = true;
    $("#jumps").innerHTML = JUMPS.map(([id, l]) => `<button type="button" data-jump="${id}">${l}</button>`).join("");
    $$("#jumps button").forEach(b => b.addEventListener("click", () => hyperjump(b.dataset.jump)));
    $("#filmBrand").addEventListener("click", e => { e.preventDefault(); toApp("home"); });
    $("#filmExit").addEventListener("click", () => toApp("home"));
    $("#brandMark").innerHTML = rocketMarkup(false);
    const mrSvg = $("#mrSvg"), mr = $("#mr"), mrLabel = $("#mrLabel");
    mrSvg.innerHTML = rocketMarkup();
    $$("[data-part]", mrSvg).forEach(g => {
      const part = g.dataset.part, pick = () => hyperjump(({ exhaust: "launch", engines: "engines", body: "body", command: "command", star: "star" })[part]);
      g.addEventListener("click", pick);
      g.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
      const hov = on => { mrLabel.textContent = on ? `${PARTS[part].label} · ${PARTS[part].sub}` : (mrActive ? PARTS[mrActive].label : "The rocket"); mr.classList.toggle("show", on); };
      g.addEventListener("mouseenter", () => hov(true)); g.addEventListener("mouseleave", () => hov(false));
      g.addEventListener("focus", () => hov(true)); g.addEventListener("blur", () => hov(false));
    });
    $$("#film .open-part").forEach(b => b.addEventListener("click", () => toApp(PARTS[b.dataset.part].view)));
    $("#restart").addEventListener("click", () => hyperjump("launch"));
    [$("#cluster"), $("#tasklist")].forEach(el => el.addEventListener("click", e => { const b = e.target.closest("[data-id]"); if (b) J.act.toggle(b.dataset.id); }));
    $$("#film [data-words]").forEach(el => {
      const text = el.textContent.trim();
      el.setAttribute("aria-label", text);
      el.innerHTML = text.split(/\s+/).map(w => `<span class="w" aria-hidden="true">${w}</span>`).join(" ");
    });
    buildRocket();
    scenes = $$("#film .scene").map(sec => {
      const s = { sec, id: sec.id, p: 0, sp: 0, glow: 0, photo: sec.classList.contains("photo") };
      s.shows = $$("[data-show]", sec).map(el => { const [a, b] = el.dataset.show.split(",").map(Number); return { el, a, b }; });
      s.words = $$("[data-words]", sec).map(el => { const [a, b] = el.dataset.words.split(",").map(Number); return { a, b, spans: $$(".w", el) }; });
      s.chapter = $(".chapter", sec); s.lbs = $$(".lb", sec);
      if (s.photo) {
        s.cfg = SCENE_CFG[s.id]; s.vars = VARIANTS[s.id];
        s.vi = clamp(ls.get("ascent-variant-" + s.id, 0) | 0, 0, s.vars.length - 1);
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
          ls.set("ascent-variant-" + s.id, s.vi);
        };
        $(".prev", ctrl).addEventListener("click", () => { s.vi = (s.vi - 1 + s.vars.length) % s.vars.length; apply(); });
        $(".next", ctrl).addEventListener("click", () => { s.vi = (s.vi + 1) % s.vars.length; apply(); });
        apply();
      }
      return s;
    });
    addEventListener("pointermove", e => {
      if (!running || e.pointerType !== "mouse") return;
      mouseT[0] = e.clientX / innerWidth * 2 - 1; mouseT[1] = e.clientY / innerHeight * 2 - 1; lastMove = performance.now();
    }, { passive: true });
    addEventListener("resize", () => { if (running) { renderEngines(); layoutRoute(); } });
    if (reduced) addEventListener("scroll", () => { if (running) frame(performance.now()); }, { passive: true });
    S.on(() => { if (running) refresh(); });
  }

  /* ================= ignition intro (once per session) ================= */
  function intro() {
    let seen = false;
    try { seen = sessionStorage.getItem("jules-intro") === "1"; } catch (e) {}
    if (reduced || seen) return;
    try { sessionStorage.setItem("jules-intro", "1"); } catch (e) {}
    const el = document.createElement("div");
    el.className = "intro"; el.setAttribute("aria-hidden", "true");
    el.innerHTML = `<div class="intro-flash"></div><span class="intro-word">Jules</span><span class="intro-count"></span><button class="intro-skip" type="button">Skip</button>`;
    document.body.appendChild(el);
    if (lenis) lenis.stop();
    const count = $(".intro-count", el), timers = [];
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
    setTimeout(() => ["click", "keydown", "wheel", "touchstart"].forEach(ev => addEventListener(ev, finish, { passive: true })), 50);
  }

  /* ================= smooth scroll, loaded only for the film ================= */
  let lenisLoading = null;
  function loadLenis() {
    if (reduced) return Promise.resolve(null);
    if (window.Lenis) return Promise.resolve(window.Lenis);
    if (!lenisLoading) lenisLoading = new Promise(res => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/lenis@1.1.13/dist/lenis.min.js";
      s.onload = () => res(window.Lenis || null); s.onerror = () => res(null);
      document.head.appendChild(s);
      setTimeout(() => res(window.Lenis || null), 4000);
    });
    return lenisLoading;
  }

  /* ================= enter and leave ================= */
  function enter() {
    const film = $("#film");
    film.hidden = false;
    document.body.classList.add("in-film");
    if (!inited) init();
    refresh();
    window.scrollTo(0, 0);
    running = true;
    snap = true;
    loadLenis().then(L => {
      if (!running || !L || lenis) return;
      lenis = new L({ lerp: .085, wheelMultiplier: .9, smoothWheel: true });
      const raf = t => { if (!lenis) return; lenis.raf(t); requestAnimationFrame(raf); };
      requestAnimationFrame(raf);
    });
    intro();
    if (reduced) Promise.all(scenes.filter(s => s.r).map(s => s.r.setSource(s.vars[s.vi]).catch(() => {}))).then(() => frame(performance.now()));
    requestAnimationFrame(frame);
  }
  function leave() {
    running = false;
    if (lenis) { try { lenis.destroy(); } catch (e) {} lenis = null; }
    $("#film").hidden = true;
    document.body.classList.remove("in-film");
    const i = $(".intro"); if (i) i.remove();
    window.scrollTo(0, 0);
  }

  /* ================= frame loop ================= */
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
    if (!running) return;
    const vh = innerHeight, sy = scrollY;
    const max = Math.max(1, document.documentElement.scrollHeight - vh);
    $("#progress").style.setProperty("--prog", (sy / max * 100).toFixed(2) + "%");
    $("#alt").textContent = `ALT ${(sy / max * 100).toFixed(1).padStart(5, "0")} KM`;
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
        $$("#mrSvg .rp").forEach(g => g.classList.toggle("on", g.dataset.part === mrActive));
        $("#mrLabel").textContent = mrActive ? PARTS[mrActive].label : "The rocket";
        $$("#jumps button").forEach(b => b.classList.toggle("on", b.dataset.jump === s.id));
      }
      if (!visible) return;
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
          s.r.draw({ zoom, focus: v.focus, center, mouse, dark, glow, time: (now / 1000) % 1000, star: starPos, starI });
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
      if (s.id === "command") { const st = $("#fpStrip"); if (st) st.style.setProperty("--draw", ramp(p, .16, .5).toFixed(3)); }
      if (s.id === "star") $("#route").style.strokeDashoffset = (routeLen * (1 - ramp(p, .3, .8))).toFixed(1);
    });
    snap = false;
    if (!reduced) requestAnimationFrame(frame);
  }

  J.film = { enter, leave, refresh };
})();
