// ==========================================================================
// Actions + input. Wheel = zoom only (never levels). Levels: [ ] PgUp PgDn,
// strip, thumbnail. Only the active level is editable.
// ==========================================================================
const HELD = new Set();
function centerOn(px, py, pz) { const r = toRotF(px, py); S.cam.x = (r[0] - r[1]) * 8; S.cam.y = (r[0] + r[1]) * 4 - pz * LH; S.camTarget = null; }
function setLevel(z, o) {
  z = clamp(z | 0, 0, NL - 1);
  if (z === S.level) return;
  S.cutFrom = S.cutAnim; S.cutT = 0; S.level = z;
  if (REDUCED || (o && o.snap)) { S.cutAnim = z; S.cutT = 1; }
  GHC.dirty = true; planDirty = true; secDirty = true; stripDirty = true;
  if (!o || !o.silent) sfx.level(z);
  S.hover = null;
}
function setMode(m) {
  if (m === S.mode || !MODES.includes(m)) return;
  const prev = S.mode;
  S.mode = m; S.modeT = 0;
  const lf = m === 'exploded' ? 2 : 0;   // strata are seen from above when exploded: lift baked occlusion so plates read
  if (lf !== (S.lightFloor || 0)) { S.lightFloor = lf; markAllDirty(); }
  S.explodeTarget = m === 'exploded' ? 1 : 0;
  const overlayTools = getComputedStyle($('tools')).position === 'absolute';
  $('tools').classList.toggle('collapsed', overlayTools && (m === 'exploded' || m === 'section'));
  $('toolsHead').setAttribute('aria-expanded', !$('tools').classList.contains('collapsed'));
  if (m === 'plan') S.zoom = fitZoomFor(...planSize());
  else if (m === 'section') S.zoom = fitZoomFor(...secSize());
  else if (m === 'exploded') S.zoom = S.cssH >= 560 && S.cssW >= 760 ? 1 : S.isoZoom;
  else S.zoom = S.isoZoom;
  resize();
  if (m === 'exploded') S.camTarget = { x: S.cam.x, y: (W + D) * 2 - 8 * LH - STRATUM_OF[8] * GAP };
  if (prev === 'exploded') S.camTarget = { x: S.cam.x, y: (W + D) * 2 - S.level * LH };
  if (m === 'plan' || m === 'section' || prev === 'plan' || prev === 'section') S.explode = S.explodeTarget;
  if (REDUCED) { S.explode = S.explodeTarget; if (S.camTarget) { S.cam.x = S.camTarget.x; S.cam.y = S.camTarget.y; S.camTarget = null; } }
  if (m === 'plan') planDirty = true;
  if (m === 'section') { secDirty = true; if (S.hover && S.hover.x != null && prev !== 'section') S.secIdx = S.secAxis === 'x' ? S.hover.y : S.hover.x; }
  S.hover = null; S.hoverStratum = -1;
  sfx.mode(m); stripDirty = true; updateStatus();
}
function rotate(d) {
  const [u, v] = planeAt(S.bw / 2, S.bh / 2, S.level);
  let px, py;
  switch (S.rot) { case 1: px = v; py = D - u; break; case 2: px = W - u; py = D - v; break; case 3: px = W - v; py = u; break; default: px = u; py = v; }
  S.rot = (S.rot + d + 4) % 4;
  centerOn(px, py, S.level);
  markAllDirty(); sfx.click();
}
function setZoom(z) { z = clamp(z, 1, 5); if (z === S.zoom) return; S.zoom = z; if (S.mode === 'cut') S.isoZoom = z; planDirty = true; secDirty = true; resize(); }
function fitZoomFor(w, h) { return Math.max(1, Math.min(4, Math.floor(Math.min((S.cssW - 8) / w, (S.cssH - 34) / h)))); }
function cycleTod() { const o = ['day', 'dusk', 'night']; setTod(o[(o.indexOf(S.tod) + 1) % 3]); }
function setTod(n) { S.tod = n; $('todv').textContent = TODS[n].name; SPR = new Map(); GHOST.clear(); podSprites(); markAllDirty(); skyDirty = true; sfx.click(); }
function toggleGhost(v) { S.ghost = v == null ? !S.ghost : v; $('bGhost').setAttribute('aria-pressed', S.ghost); GHC.dirty = true; }
function toggleFollow(v) { S.follow = v == null ? !S.follow : v; $('bFollow').setAttribute('aria-pressed', S.follow); if (S.follow) S.lastFollow = -9; }
function toggleMute() { AUD.muted = !AUD.muted; $('bMute').setAttribute('aria-pressed', AUD.muted); applyVol(); }
function regenerateWorld() {
  generate(S.seed); $('seedv').textContent = S.seed;
  JOBS = []; DRONES = []; PUFFS = []; S.pins = []; renderChips(); hideCard(); agentReset(); initLife();
  markAllDirty(); skyDirty = true; stripDirty = true;
  log('sys', `World generated · seed ${S.seed}`, 'sys');
}
function resize() {
  const st = $('stage'), r = st.getBoundingClientRect();
  S.cssW = Math.max(1, Math.floor(r.width)); S.cssH = Math.max(1, Math.floor(r.height));
  S.bw = Math.ceil(S.cssW / S.zoom); S.bh = Math.ceil(S.cssH / S.zoom);
  const cv = $('view');
  cv.width = S.bw; cv.height = S.bh;
  cv.style.width = S.bw * S.zoom + 'px'; cv.style.height = S.bh * S.zoom + 'px';
  VIEW.ctx = cv.getContext('2d'); VIEW.ctx.imageSmoothingEnabled = false;
  const tr = $('tools').getBoundingClientRect(), sr = $('strip').getBoundingClientRect();
  const over = getComputedStyle($('tools')).position === 'absolute';
  S.safeL = over ? Math.max(0, tr.right - r.left + 6) : 0; S.safeR = over ? Math.max(0, r.right - sr.left + 6) : 0;
  skyDirty = true;
}
const VIEW = { ctx: null };
function pickAt(bx, by) {
  if (S.mode === 'plan') return pickPlan(bx, by);
  if (S.mode === 'section') return pickSec(bx, by);
  return pickIso(bx, by);
}
function toBuf(e) { const r = $('view').getBoundingClientRect(); return [(e.clientX - r.left) / S.zoom, (e.clientY - r.top) / S.zoom, e.clientX - r.left, e.clientY - r.top]; }
function panBy(dxCss, dyCss) {
  const dx = dxCss / S.zoom, dy = dyCss / S.zoom;
  const c = S.mode === 'plan' ? S.planCam : S.mode === 'section' ? S.secCam : S.cam;
  if (S.mode === 'plan' || S.mode === 'section') { c.x -= dx; c.y -= dy; } else { c.x -= dx; c.y -= dy; S.camTarget = null; }
}
function doClick(e, h) {
  if (e.altKey || S.tool === 'point') { if (h && !h.top && h.stratum == null) addPin(h); else if (h) addPin(h); return; }
  if (S.mode === 'exploded') { if (h && h.stratum != null) { const [z0, z1] = STRATA[h.stratum]; setMode('cut'); setLevel(z1); toast(`Focused ${lvCode(z0)}${z0 !== z1 ? '–' + lvCode(z1) : ''} ${STRATA[h.stratum][2]} · cut at ${lvCode(z1)}`); } return; }
  if (S.mode === 'section') { if (h) { setLevel(h.z); toast(`Active level ${lvCode(h.z)} ${LEVELS[h.z].name}`); } return; }
  if (!h) return;
  if (h.top) { setLevel(h.z); toast(`Cut to ${lvCode(h.z)} — edits now apply to this level only`); return; }
  if (BUILD_TOOLS.includes(S.tool) || S.tool === 'unit') { placeTool(h.x, h.y, S.level); return; }
  if (S.tool === 'inspect') toast(describe(h));
}
function finishCapture() {
  const c = S.capture; S.capture = null;
  if (!c) return;
  const x0 = Math.min(c.x0, c.x1), x1 = Math.max(c.x0, c.x1), y0 = Math.min(c.y0, c.y1), y1 = Math.max(c.y0, c.y1), h = S.captureH, L = S.level, P = [];
  for (let dz = 0; dz < h; dz++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const t = cell(x, y, L + dz);
    if (!t || t === T.EARTH || t === T.ROCK || t === T.CORE || t === T.LIFT || t === T.CRANE) continue;
    P.push({ dx: x - x0, dy: y - y0, dz, t, v: vars[idx(x, y, L + dz)] });
  }
  if (!P.length) { toast('Nothing to capture there (cores and ground are excluded)'); return; }
  const u = { name: 'Unit ' + String.fromCharCode(65 + UNITS.length % 26), size: [x1 - x0 + 1, y1 - y0 + 1, h], pieces: P };
  UNITS.push(u); addUnitButton(u); setTool('unit', u);
  log('you', `Captured blueprint ${u.name}: ${u.size.join('×')}, ${P.length} parts (supports excluded)`, 'sys');
  toast(`Captured ${u.name} — click to stamp copies; drones build them`); sfx.ghost();
}
function setupInput() {
  const st = $('stage'), cv = $('view');
  const P = { pts: new Map(), down: false, moved: false, sx: 0, sy: 0, lx: 0, ly: 0, pinch: null, lp: null, capturing: false, lastCss: null };
  st.addEventListener('pointerdown', e => {
    if (e.target.closest('.card')) return;
    cv.focus({ preventScroll: true });
    P.pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (P.pts.size === 2) { const [a, b] = [...P.pts.values()]; P.pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z: S.zoom }; clearTimeout(P.lp); P.down = false; return; }
    try { st.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    P.down = true; P.moved = false; P.sx = P.lx = e.clientX; P.sy = P.ly = e.clientY; P.alt = e.altKey;
    const [bx, by] = toBuf(e); S.hover = pickAt(bx, by);
    if (S.tool === 'capture' && e.button === 0 && S.hover && !S.hover.top && (S.mode === 'cut' || S.mode === 'plan')) { S.capture = { x0: S.hover.x, y0: S.hover.y, x1: S.hover.x, y1: S.hover.y }; P.capturing = true; }
    if (e.pointerType === 'touch') { clearTimeout(P.lp); P.lp = setTimeout(() => { if (!P.moved && S.hover) { addPin(S.hover); P.down = false; P.longDone = true; } }, 600); }
  });
  st.addEventListener('pointermove', e => {
    if (P.pts.has(e.pointerId)) P.pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (P.pinch && P.pts.size === 2) { const [a, b] = [...P.pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]), z = clamp(Math.round(P.pinch.z * d / P.pinch.d), 1, 5); setZoom(z); return; }
    const [bx, by, cx, cy] = toBuf(e);
    P.lastCss = [cx, cy];
    if (P.down) {
      if (!P.moved && Math.hypot(e.clientX - P.sx, e.clientY - P.sy) > 5) { P.moved = true; clearTimeout(P.lp); if (!P.capturing) st.classList.add('pan'); }
      if (P.moved && !P.capturing) panBy(e.clientX - P.lx, e.clientY - P.ly);
      P.lx = e.clientX; P.ly = e.clientY;
    }
    const h = pickAt(bx, by);
    if (P.capturing && h && !h.top) { S.capture.x1 = h.x; S.capture.y1 = h.y; }
    S.hover = h; S.hoverStratum = h && h.stratum != null ? h.stratum : -1;
    updateTip(cx, cy);
  });
  const end = e => {
    P.pts.delete(e.pointerId);
    if (P.pinch) { if (P.pts.size < 2) P.pinch = null; return; }
    clearTimeout(P.lp);
    st.classList.remove('pan');
    if (!P.down) { P.longDone = false; return; }
    P.down = false;
    if (P.capturing) { P.capturing = false; finishCapture(); return; }
    if (!P.moved && !P.longDone && e.type === 'pointerup') { const [bx, by] = toBuf(e); doClick(e, pickAt(bx, by)); }
    P.longDone = false;
  };
  st.addEventListener('pointerup', end); st.addEventListener('pointercancel', end);
  st.addEventListener('pointerleave', () => { if (!P.down) { S.hover = null; S.hoverStratum = -1; updateTip(null); } });
  cv.addEventListener('dblclick', e => {
    const [bx, by] = toBuf(e), h = pickAt(bx, by);
    if (!h || S.mode === 'exploded') return;
    if (h.top || S.mode === 'section') { setLevel(h.z); return; }
    if (!h.t) for (let z = h.z - 1; z >= 0; z--) if (cell(h.x, h.y, z)) { setLevel(z); toast(`Dropped to ${lvCode(z)} — what you were looking at`); return; }
  });
  let wheelAcc = 0;
  st.addEventListener('wheel', e => {
    e.preventDefault();
    wheelAcc += e.deltaY;
    if (Math.abs(wheelAcc) > 80) { setZoom(S.zoom + (wheelAcc < 0 ? 1 : -1)); wheelAcc = 0; sfx.click(); }
  }, { passive: false });
  window.addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('input, textarea, select')) return;
    if (e.metaKey || e.ctrlKey) return;
    const k = e.key, lk = k.length === 1 ? k.toLowerCase() : k;
    let used = true;
    if (k === '[' || k === 'PageDown') setLevel(S.level - 1);
    else if (k === ']' || k === 'PageUp') setLevel(S.level + 1);
    else if (k >= '1' && k <= '4') setMode(MODES[+k - 1]);
    else if (lk === 'q') rotate(-1);
    else if (lk === 'e') rotate(1);
    else if (lk === 'g') toggleGhost();
    else if (lk === 'f') toggleFollow();
    else if (lk === 't') cycleTod();
    else if (lk === 'm') toggleMute();
    else if (lk === 'v') setTool('inspect');
    else if (lk === 'b') setTool(BUILD_TOOLS[(BUILD_TOOLS.indexOf(S.tool) + 1) % BUILD_TOOLS.length]);
    else if (lk === 'c') setTool('capture');
    else if (lk === 'p') setTool('point');
    else if (lk === 'r') { S.toolRot = (S.toolRot + 1) & 3; if (S.tool === 'bridge' || S.tool === 'unit') setTool(S.tool); }
    else if (lk === 'x') { S.secAxis = S.secAxis === 'x' ? 'y' : 'x'; secDirty = true; stripDirty = true; }
    else if (k === ',' || k === '<') { S.secIdx = clamp(S.secIdx - 1, 0, W - 1); secDirty = true; stripDirty = true; }
    else if (k === '.' || k === '>') { S.secIdx = clamp(S.secIdx + 1, 0, W - 1); secDirty = true; stripDirty = true; }
    else if (k === 'Enter') { if (CARDJOB) approveJob(CARDJOB, false); else used = false; }
    else if (k === 'Delete' || k === 'Backspace') { if (CARDJOB) rejectJob(CARDJOB); else used = false; }
    else if (k === 'Escape') { setTool('inspect'); S.capture = null; }
    else if (k === '+' || k === '=') setZoom(S.zoom + 1);
    else if (k === '-' || k === '_') setZoom(S.zoom - 1);
    else if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'a', 'd', 'w', 's', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(lk)) HELD.add(lk.toLowerCase().replace('arrow', ''));
    else used = false;
    if (used) e.preventDefault();
  });
  window.addEventListener('keyup', e => { HELD.delete(e.key.toLowerCase().replace('arrow', '')); });
  window.addEventListener('blur', () => HELD.clear());
  if (window.ResizeObserver) new ResizeObserver(() => resize()).observe(st); else window.addEventListener('resize', resize);
}
function heldPan(dt) {
  if (!HELD.size) return;
  const sp = 320 * dt;
  let dx = 0, dy = 0;
  if (HELD.has('left') || HELD.has('a')) dx += sp; if (HELD.has('right') || HELD.has('d')) dx -= sp;
  if (HELD.has('up') || HELD.has('w')) dy += sp; if (HELD.has('down') || HELD.has('s')) dy -= sp;
  if (dx || dy) panBy(dx, dy);
}
