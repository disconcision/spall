'use strict';
// ==========================================================================
// Shell: camera, input, tools, presets, frame loop.
// ==========================================================================
const stage = document.getElementById('stage'), view = document.getElementById('view'), ctx = view.getContext('2d');
const tipEl = document.getElementById('tip');
let SCALE = 2, frame = null, fb32 = null, dirty = true;
let tool = 'hand', gauge = 1, hover = null, anchorHint = null, stroke = null, pan = null, spaceDown = false;
const ptr = { x: 0, y: 0, in: false, cx: 0, cy: 0 };
const focus = [30, 40, 8];

// --- camera ---------------------------------------------------------------------
const snapC = v => Math.round(v * CAM.k) / CAM.k;
function lookAt(x, y, z, k) {
  if (k) CAM.k = k;
  focus[0] = x; focus[1] = y; focus[2] = z;
  const s = worldSX(x, y, z); CAM.x = snapC(s[0]); CAM.y = snapC(s[1]);
  if (CAM.sect) CAM.sectV = viewV(x, y);
  dirty = true; syncUI();
}
// the world point at height z that sits under the screen centre
function centreAtZ(z) {
  const R = ROTS[CAM.rot], s = (CAM.y + 12 * z) / 4, d = CAM.x / 8, u = (s + d) / 2, v = (s - d) / 2;
  return [R[0] * u + R[2] * v + PIV, R[1] * u + R[3] * v + PIV, z];
}
function setZoom(k) { const c = centreAtZ(focus[2]); lookAt(c[0], c[1], c[2], k); }
function rotate(d) { const c = centreAtZ(focus[2]); CAM.rot = (CAM.rot + d + 4) % 4; lookAt(c[0], c[1], c[2]); }

function fit() {
  const r = stage.getBoundingClientRect();
  SCALE = r.width >= 1700 ? 3 : 2;
  const w = Math.max(64, Math.floor(r.width / SCALE)), h = Math.max(64, Math.floor(r.height / SCALE));
  if (w === W && h === H) return;
  resizeTargets(w, h);
  view.width = w; view.height = h; view.style.width = w * SCALE + 'px'; view.style.height = h * SCALE + 'px';
  frame = ctx.createImageData(w, h); fb32 = new Uint32Array(frame.data.buffer); DR.zb = new Float32Array(w * h);
  dirty = true;
}

// --- presets ------------------------------------------------------------------------
function seedCables() {
  cables = []; ties = []; hueCounter.fill(0);
  const bundle = [];
  for (let i = 0; i < 6; i++) bundle.push(makeCable(0, PORTS.facadeA[i], PORTS.towerC[i], { slack: 1.16, hue: i % 3 }));
  const canyon = [0, 1, 2, 1].map((g, i) => makeCable(g, PORTS.southA[i], PORTS.northB[i], { slack: 1.2 }));
  const shaft = PORTS.bridgeA.map((a, i) => makeCable(1, a, PORTS.shaftWall[i], { slack: 1.08, hue: i % 2 }));
  makeCable(3, PORTS.roofC[0], PORTS.canyonFloor[0], { slack: 1.12 });
  makeCable(2, PORTS.walkX[0], PORTS.hallFloor[0], { slack: 1.25, hue: 1 });
  for (let i = 0; i < 3; i++) makeCable(0, [46.5 + i * 0.6, 30.95, 12.6], [46.5 + i * 0.6, 31.2, 6.5], { freeEnd: true, length: 5 + i * 1.3, hue: i });
  for (let s = 0; s < 120; s++) stepCables(1 / 60);
  const at = (cs, f) => cs.map(c => ({ c, i: Math.round((c.n - 1) * f) }));
  makeTie(at(bundle, 0.3)); makeTie(at(bundle, 0.7));
  const t2 = makeTie(at(canyon, 0.5));
  makeTie(at(shaft, 0.42));
  for (let s = 0; s < 120; s++) stepCables(1 / 60);
  hangTie(t2);
  for (let s = 0; s < 200; s++) stepCables(1 / 60);
}

// --- input -------------------------------------------------------------------------------
function artXY(e) { const r = view.getBoundingClientRect(); return [(e.clientX - r.left) / SCALE, (e.clientY - r.top) / SCALE]; }
function surfaceUnder(px, py) { const h = pickWorld(px, py); return h && h.kind !== 3 ? h : null; }
function planeTarget(px, py, D) { return unproj(px, py, D); }

stage.addEventListener('contextmenu', e => e.preventDefault());
stage.addEventListener('pointerdown', e => {
  stage.focus(); stage.setPointerCapture(e.pointerId);
  const [px, py] = artXY(e); ptr.x = px; ptr.y = py;
  if (e.button === 2 || e.button === 1 || spaceDown) { pan = { x: e.clientX, y: e.clientY, cx: CAM.x, cy: CAM.y }; stage.classList.add('panning'); return; }
  if (e.button !== 0) return;
  if (tool === 'tie' || e.altKey) { stroke = { x0: px, y0: py, x1: px, y1: py }; return; }
  const pc = pickCable(px, py, 6);
  if (tool === 'erase') { if (pc) { pc.tie ? removeTie(pc.tie) : removeCable(pc.c); } return; }
  if (tool === 'hang') { if (pc && pc.tie) { if (pc.tie.hang) { pc.tie.hang = null; pc.tie.top = null; pc.tie.m.forEach(m => wake(m.c)); } else hangTie(pc.tie); } return; }
  if (tool === 'hand' && pc) {
    grab.on = true; grab.tie = pc.tie || null; grab.c = pc.c || null; grab.i = pc.i; grab.D = pc.D;
    grab.end = !!pc.c && (pc.i === 0 || pc.i === pc.c.n - 1);
    if (grab.end) { const c = pc.c; if (pc.i === 0) c.pinA = c.pinA || xAt(c, 0); else c.pinB = c.pinB || xAt(c, c.n - 1); c.W[pc.i] = 0; }
    if (grab.tie && grab.tie.hang) grab.hung = true;
    grab.target = planeTarget(px, py, pc.D);
    (grab.tie ? grab.tie.m.map(m => m.c) : [grab.c]).forEach(wake);
    return;
  }
  const hit = surfaceUnder(px, py);
  if ((tool === 'hand' || tool === 'lay') && hit) { layStart(gauge, hit); lay.D = proj(...lay.a)[2]; }
});
stage.addEventListener('pointermove', e => {
  const [px, py] = artXY(e); ptr.x = px; ptr.y = py; ptr.in = true; ptr.cx = e.clientX; ptr.cy = e.clientY;
  if (pan) {
    CAM.x = snapC(pan.cx - (e.clientX - pan.x) / SCALE / CAM.k); CAM.y = snapC(pan.cy - (e.clientY - pan.y) / SCALE / CAM.k);
    const c = centreAtZ(focus[2]); focus[0] = c[0]; focus[1] = c[1]; if (CAM.sect) CAM.sectV = viewV(c[0], c[1]);
    dirty = true; return;
  }
  if (stroke) { stroke.x1 = px; stroke.y1 = py; return; }
  if (lay.on) {
    const h = surfaceUnder(px, py);
    lay.target = h ? snapAnchor(h, lay.c.g.r) : planeTarget(px, py, lay.D);
    return;
  }
  if (grab.on) {
    if (grab.end) { const h = surfaceUnder(px, py); grab.target = h ? snapAnchor(h, grab.c.g.r) : planeTarget(px, py, grab.D); }
    else grab.target = planeTarget(px, py, grab.D);
    return;
  }
});
stage.addEventListener('pointerup', e => {
  const [px, py] = artXY(e);
  if (pan) { pan = null; stage.classList.remove('panning'); return; }
  if (stroke) { const s = stroke; stroke = null; if (Math.hypot(s.x1 - s.x0, s.y1 - s.y0) > 2) tieStroke(s.x0, s.y0, s.x1, s.y1); return; }
  if (lay.on) { layEnd(surfaceUnder(px, py)); return; }
  if (grab.on) {
    if (grab.end) {
      const c = grab.c, h = surfaceUnder(px, py), atA = grab.i === 0;
      if (h) { const b = snapAnchor(h, c.g.r); if (atA) c.pinA = b; else c.pinB = b; c.W[grab.i] = 0; }
      else { if (atA) c.pinA = null; else c.pinB = null; c.W[grab.i] = 1 / c.g.mass; }
      wake(c);
    }
    if (grab.tie && grab.hung) hangTie(grab.tie);
    grab.on = false; grab.c = null; grab.tie = null; grab.end = false; grab.hung = false;
  }
});
stage.addEventListener('pointerleave', () => { ptr.in = false; });
stage.addEventListener('wheel', e => {
  e.preventDefault();
  if (e.ctrlKey || e.metaKey) { const ks = [0.25, 0.5, 1, 2, 3], i = ks.indexOf(CAM.k); if (Math.abs(e.deltaY) > 2) setZoom(ks[Math.max(0, Math.min(ks.length - 1, i + (e.deltaY < 0 ? 1 : -1)))]); return; }
  CAM.x = snapC(CAM.x + e.deltaX / SCALE / CAM.k); CAM.y = snapC(CAM.y + e.deltaY / SCALE / CAM.k);
  const c = centreAtZ(focus[2]); focus[0] = c[0]; focus[1] = c[1]; if (CAM.sect) CAM.sectV = viewV(c[0], c[1]);
  dirty = true;
}, { passive: false });

function setTool(t) { tool = t; syncUI(); }
function setCut(z) { CAM.cutZ = z == null ? 99 : Math.max(Z0 + 1, Math.min(ZTOP, z)); dirty = true; syncUI(); }
function cycleTod() { const o = ['day', 'dusk', 'night']; CAM.tod = o[(o.indexOf(CAM.tod) + 1) % 3]; dirty = true; syncUI(); }
window.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  const k = e.key;
  if (k === ' ') { spaceDown = true; e.preventDefault(); return; }
  if (k >= '1' && k <= '4') { gauge = +k - 1; syncUI(); return; }
  const map = { v: 'hand', c: 'lay', t: 'tie', h: 'hang' };
  if (map[k.toLowerCase()] && !e.metaKey && !e.ctrlKey) { setTool(map[k.toLowerCase()]); return; }
  switch (k) {
    case 'x': case 'X': case 'Backspace': case 'Delete': if (hover) { hover.tie ? removeTie(hover.tie) : removeCable(hover.c); hover = null; } else if (k === 'x' || k === 'X') setTool('erase'); break;
    case 'q': case 'Q': rotate(-1); break;
    case 'e': case 'E': rotate(1); break;
    case '[': setCut(CAM.cutZ > 50 ? Math.floor(focus[2]) + 2 : CAM.cutZ - 1); break;
    case ']': setCut(CAM.cutZ > 50 ? Math.floor(focus[2]) + 2 : CAM.cutZ + 1); break;
    case '\\': setCut(null); break;
    case 's': case 'S': CAM.sect = !CAM.sect; CAM.sectV = viewV(focus[0], focus[1]); dirty = true; syncUI(); break;
    case 'n': case 'N': cycleTod(); break;
    case 'z': case 'Z': { const ks = [0.25, 1, 2], i = ks.indexOf(CAM.k); setZoom(ks[(i + 1) % ks.length]); break; }
    case 'j': case 'J': jolt(1); break;
    case 'r': case 'R': if (!e.metaKey && !e.ctrlKey) seedCables(); break;
    case 'Escape': if (lay.on) { removeCable(lay.c); lay.on = false; lay.c = null; } stroke = null; break;
  }
});
window.addEventListener('keyup', e => { if (e.key === ' ') spaceDown = false; });

// --- UI wiring -----------------------------------------------------------------------------
const PLACES = [
  { name: 'Borehole', at: [24, 26, 6], k: 1 },
  { name: 'Canyon', at: [46, 30, 10], k: 1 },
  { name: 'Hall', at: [32, 72, 5], k: 1, cut: 11 },
  { name: 'Slope', at: [66, 36, 16], k: 1 },
  { name: 'Clips', at: [48, 16, 14], k: 3 },
  { name: 'Overview', at: [48, 48, 8], k: 0.25 }
];
function goPlace(p) { setCut(p.cut == null ? null : p.cut); lookAt(p.at[0], p.at[1], p.at[2], p.k); }
document.querySelectorAll('#zooms button').forEach(b => b.onclick = () => setZoom(+b.dataset.k));
document.querySelectorAll('#tods button').forEach(b => b.onclick = () => { CAM.tod = b.dataset.t; dirty = true; syncUI(); });
document.querySelectorAll('#tools button').forEach(b => b.onclick = () => setTool(b.dataset.tool));
document.querySelectorAll('#feels button').forEach(b => b.onclick = () => { LOOK.feel = b.dataset.f; wakeAll(); syncUI(); });
document.getElementById('cutDn').onclick = () => setCut(CAM.cutZ > 50 ? Math.floor(focus[2]) + 1 : CAM.cutZ - 1);
document.getElementById('cutUp').onclick = () => setCut(CAM.cutZ > 50 ? Math.floor(focus[2]) + 3 : CAM.cutZ + 1);
document.getElementById('cutOff').onclick = () => setCut(null);
document.getElementById('bSect').onclick = () => { CAM.sect = !CAM.sect; CAM.sectV = viewV(focus[0], focus[1]); dirty = true; syncUI(); };
document.getElementById('rotL').onclick = () => rotate(-1);
document.getElementById('rotR').onclick = () => rotate(1);
document.getElementById('bJolt').onclick = () => jolt(1);
document.getElementById('bReset').onclick = () => seedCables();
document.getElementById('oOutline').onclick = () => { LOOK.outline = !LOOK.outline; syncUI(); };
document.getElementById('oSleeve').onclick = () => { LOOK.sleeve = !LOOK.sleeve; syncUI(); };
document.getElementById('oGlow').onclick = () => { LOOK.glow = !LOOK.glow; syncUI(); };
const placesEl = document.getElementById('places');
for (const p of PLACES) { const b = document.createElement('button'); b.textContent = p.name; b.onclick = () => goPlace(p); placesEl.appendChild(b); }
const gaugesEl = document.getElementById('gauges');
GAUGES.forEach((g, i) => {
  const b = document.createElement('button'); b.dataset.g = i;
  const cv = document.createElement('canvas'); cv.width = 22; cv.height = 8;
  const gx = cv.getContext('2d'), w = Math.max(1, Math.round(2 * g.r * 12)), prof = profile(w, w >= 3), cols = g.hues[0];
  prof.forEach((pi, j) => { gx.fillStyle = cols[[0, 1, 2, 3][pi]]; gx.fillRect(0, Math.round(4 - prof.length / 2) + j, 22, 1); });
  b.append(cv);
  const t = document.createElement('div'); t.innerHTML = `<div class="gn">${g.name}</div><div class="gm">r ${g.r} · ${g.mass} t/m · ${['bouncy', 'lively', 'heavy', 'massive'][i]}</div>`;
  b.append(t); const kb = document.createElement('kbd'); kb.textContent = i + 1; b.append(kb);
  b.onclick = () => { gauge = i; syncUI(); };
  gaugesEl.append(b);
});
function syncUI() {
  document.querySelectorAll('#zooms button').forEach(b => b.setAttribute('aria-pressed', +b.dataset.k === CAM.k));
  document.querySelectorAll('#tods button').forEach(b => b.setAttribute('aria-pressed', b.dataset.t === CAM.tod));
  document.querySelectorAll('#tools button').forEach(b => b.setAttribute('aria-pressed', b.dataset.tool === tool));
  document.querySelectorAll('#feels button').forEach(b => b.setAttribute('aria-pressed', b.dataset.f === LOOK.feel));
  document.querySelectorAll('#gauges button').forEach(b => b.setAttribute('aria-pressed', +b.dataset.g === gauge));
  document.getElementById('cutV').textContent = CAM.cutZ > 50 ? 'off' : 'L' + CAM.cutZ;
  document.getElementById('bSect').setAttribute('aria-pressed', CAM.sect);
  document.getElementById('oOutline').setAttribute('aria-pressed', LOOK.outline);
  document.getElementById('oSleeve').setAttribute('aria-pressed', LOOK.sleeve);
  document.getElementById('oGlow').setAttribute('aria-pressed', LOOK.glow);
}

// --- overlay (drawn into the pixel buffer) ---------------------------------------------------------
const ACC = 0xff3ca8e8, ACC_D = 0xff0e2a3d, WHITE = 0xffe6f0f4;
function px2(x, y, c) { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < W && y < H) fb32[y * W + x] = c; }
function line2(x0, y0, x1, y1, c, dash) {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  for (let s = 0; s <= n; s++) { if (dash && ((s >> 1) & 1)) continue; px2(x0 + (x1 - x0) * s / n, y0 + (y1 - y0) * s / n, c); }
}
function marker(p, c) {
  const q = proj(p[0], p[1], p[2]), x = Math.round(q[0]), y = Math.round(q[1]);
  for (const [dx, dy] of [[0, -3], [1, -2], [2, -1], [3, 0], [2, 1], [1, 2], [0, 3], [-1, 2], [-2, 1], [-3, 0], [-2, -1], [-1, -2]]) px2(x + dx, y + dy, c);
  px2(x, y, c);
}
function drawOverlay() {
  if (stroke) { line2(stroke.x0, stroke.y0 + 1, stroke.x1, stroke.y1 + 1, ACC_D); line2(stroke.x0, stroke.y0, stroke.x1, stroke.y1, ACC, true); }
  if (lay.on) { marker(lay.a, ACC); marker(lay.target, WHITE); }
  else if (grab.on && grab.end && grab.target) marker(grab.target, WHITE);
  else if (anchorHint) marker(anchorHint, ACC);
}
function updateHover() {
  hover = null; anchorHint = null; let tip = '';
  if (!ptr.in || pan || stroke || lay.on || grab.on) { tipEl.style.transform = 'translate(-9999px,0)'; return; }
  const pc = (tool === 'hand' || tool === 'erase' || tool === 'hang') ? pickCable(ptr.x, ptr.y, 6) : null;
  if (pc && (tool !== 'hang' || pc.tie)) {
    hover = pc;
    if (pc.tie) tip = `<b>tie</b> · ${pc.tie.m.length} cable${pc.tie.m.length > 1 ? 's' : ''} · ${tieMass(pc.tie).toFixed(1)} t/m${pc.tie.hang ? ' · hung' : ''}`;
    else tip = `<b>${pc.c.g.name.toLowerCase()}</b> · ${cableLength(pc.c).toFixed(1)} cells${(pc.i === 0 || pc.i === pc.c.n - 1) ? ' · end' : ''}`;
  } else if (tool === 'hand' || tool === 'lay') {
    const h = surfaceUnder(ptr.x, ptr.y);
    if (h) { anchorHint = snapAnchor(h, GAUGES[gauge].r); tip = `anchor · L${Math.floor(anchorHint[2])} · (${(Math.round(anchorHint[0] * 2) / 2).toFixed(1)}, ${(Math.round(anchorHint[1] * 2) / 2).toFixed(1)})`; }
  }
  if (tip) { const r = stage.getBoundingClientRect(); tipEl.innerHTML = tip; tipEl.style.transform = `translate(${ptr.cx - r.left + 14}px,${ptr.cy - r.top + 14}px)`; }
  else tipEl.style.transform = 'translate(-9999px,0)';
}

// --- loop ----------------------------------------------------------------------------------------
let last = performance.now(), acc = 0, fpsT = 0, fpsN = 0, fps = 0;
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; acc += dt;
  layUpdate();
  if (grab.on && grab.end && grab.target) { const c = grab.c, pin = grab.i === 0 ? c.pinA : c.pinB; for (let k = 0; k < 3; k++) pin[k] += (grab.target[k] - pin[k]) * 0.35; wake(c); }
  if (grab.on && grab.hung && grab.target) { const t = grab.tie; for (let k = 0; k < 3; k++) t.hang[k] += (grab.target[k] - t.hang[k]) * 0.35; t.top = null; }
  let n = 0; while (acc >= 1 / 60 && n < 3) { stepCables(1 / 60); acc -= 1 / 60; n++; } if (n === 3) acc = 0;
  if (dirty) { renderScene(); dirty = false; }
  updateHover();
  frame.data.set(sceneCol); DR.fb = fb32; DR.zb.set(sceneD);
  drawAllCables(hover);
  drawOverlay();
  ctx.putImageData(frame, 0, 0);
  fpsN++; if (now - fpsT > 500) { fps = Math.round(fpsN * 1000 / (now - fpsT)); fpsN = 0; fpsT = now; }
  const awake = cables.filter(c => !c.asleep).length;
  document.getElementById('hudL').innerHTML = `<b>${cables.length}</b> cables · <b>${ties.length}</b> ties · ${awake} moving`;
  document.getElementById('hudR').innerHTML = `${['Far', '½', 'Mid', 'Near', '3×'][[0.25, 0.5, 1, 2, 3].indexOf(CAM.k)]} · ${'NESW'[CAM.rot]}-up · ${W}×${H} · ${fps} fps`;
  requestAnimationFrame(loop);
}

// --- boot -------------------------------------------------------------------------------------------
try {
  buildScene();
  initRenderer();
  fit();
  seedCables();
  goPlace(PLACES[1]);
  new ResizeObserver(fit).observe(stage);
  requestAnimationFrame(loop);
} catch (err) {
  const el = document.getElementById('err'); el.style.display = 'block'; el.textContent = 'Could not start: ' + err.message; console.error(err);
}
window.STRATUM = { CAM, cables, ties, lookAt, setZoom, goPlace, PLACES, tieStroke, jolt, proj, pickWorld, layStart, layEnd, lay, grab, stepCables };
