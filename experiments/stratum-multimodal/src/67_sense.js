// ==========================================================================
// Multimodal input: you talk, point and sketch over the city, and all of it
// becomes one time-stamped stream an agent could read.
// Sketch: pixel ink anchored in the world through the per-pixel depth of the
// level caches: painted onto the surfaces under the pen, or floated on a plane
// at the height where the stroke started (ramping to where it ends, so an arrow
// keeps joining its two things). Strokes re-project every frame.
// Pointer: what the cursor is over (visible surface, active-level cell, cable),
// sampled at 10 Hz when it changes; resting 450 ms makes a dwell.
// Voice: Web Speech, or Moonshine running in the page, both with interim text;
// a local level meter marks voice on and off so the lag to the first partial
// and to the final can be measured per engine.
// Activity groups into turns, shown in the chat as a collapsible "you" entry
// (words interleaved with what you pointed at or drew), exported as JSON.
// ==========================================================================
const MM = {
  strokes: [], ink: null, anchor: 'paint', sid: 0, hi: 0,
  ptr: [], dwells: [], css: null, key: '', dw: null,
  turn: null, turns: [], tid: 0, marks: [], vad: [], typed: [],
  lat: {}, auto: true
};
const mmNow = () => Math.round(performance.now());
const TURN_GAP = 1400, LEAD = 1500;
const INK = '#5fd3f2', INK_DK = '#04222b', INK_HI = '#f2fdff';
const whatOf = t => t ? TI[t].name : 'open air';
const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };

// ---------- the world under a pixel ----------
// depth of what renderIso drew at each buffer pixel: the nearest of the visible level caches
function depthSampler() {
  if (S.mode !== 'cut') return null;
  const L = S.level, top = Math.floor(S.cutAnim + 1e-4), settled = Math.abs(S.cutAnim - L) < 0.001;
  const sliced = !(L >= NL - 1 && settled), b = isoBase(), bx0 = b[0] - OX, lv = [];
  for (let z = 0; z <= top && z < NL; z++) {
    const c = z === top && sliced && settled && z === L ? (CUTS.get(L) || LC[z]) : LC[z];
    if (c && c.dep) lv.push([c, b[1] - OY - z * LH, z]);
  }
  return (px, py) => {
    const cx = px - bx0; let best = -1e9, face = 0, lz = 0;
    if (cx < 0 || cx >= CW) return null;
    for (const [c, oy, z] of lv) { const cy = py - oy; if (cy < 0 || cy >= CH) continue; const i = cy * CW + cx, d = c.dep[i]; if (d > best) { best = d; face = c.face[i]; lz = z; } }
    return best < -1e8 ? null : { D: best, face, z: lz };
  };
}
// world point, cell and type under buffer point (bx, by), or null over the sky
function worldAt(bx, by, ds) {
  ds = ds || depthSampler(); if (!ds) return null;
  const px = Math.floor(bx), py = Math.floor(by), h = ds(px, py);
  if (!h) return null;
  const b = isoBase(), Xp = px + 0.5 - b[0], Yp = py + 0.5 - b[1];
  const s = (Yp + 12 * h.D) / 22, z = h.D - 1.5 * s, dd = Xp / 8, u = (s + dd) / 2, v = (s - dd) / 2;
  // nudge into the solid the face belongs to, to name its cell
  const p = fromRotF(u, v), q = fromRotF(u - (h.face === 3 ? 0.02 : 0), v - (h.face === 2 ? 0.02 : 0));
  let c = [Math.floor(q[0]), Math.floor(q[1]), Math.floor(z - (h.face === 1 ? 0.02 : 0))], t = cell(c[0], c[1], c[2]);
  // parapets, rails and tall sprites draw above their cell: name it from the level the pixel came from
  if (!t || c[2] !== h.z) {
    const U = Math.floor(u - (h.face === 3 ? 0.02 : 0)), V = Math.floor(v - (h.face === 2 ? 0.02 : 0));
    for (const [du, dv] of [[0, 0], [-1, 0], [0, -1], [-1, -1], [1, 0], [0, 1]]) { const t2 = cellR(U + du, V + dv, h.z); if (t2) { c = [...fromRot(U + du, V + dv), h.z]; t = t2; break; } }
  }
  for (let k = 1; !t && k <= 24; k++) {   // else the nearest solid along this pixel's view ray
    const a = (k & 1 ? -1 : 1) * Math.ceil(k / 2) * 0.08, w = fromRotF(u + 1.5 * a, v + 1.5 * a), c2 = [Math.floor(w[0]), Math.floor(w[1]), Math.floor(z + a)], t2 = cell(c2[0], c2[1], c2[2]);
    if (t2) { c = c2; t = t2; }
  }
  return { p: [p[0], p[1], z], D: h.D, face: h.face, c, t };
}
const depthOf = (x, y, z) => { const r = toRotF(x, y); return z + 1.5 * (r[0] + r[1]); };
const cutTop = () => S.mode === 'cut' && S.level < NL - 1 ? S.level + HT / LH + 0.05 : 99;
const r2 = v => Math.round(v * 100) / 100;
const refOf = h => h ? { cell: h.c, what: whatOf(h.t), at: h.p.map(r2) } : null;

// ---------- sketch ----------
function inkDown(bx, by, e) {
  if (S.tool !== 'sketch' && e.pointerType !== 'pen') return false;
  if (S.mode !== 'cut') { toast('Sketching works in the Cut plane view (1)'); return true; }
  const h = worldAt(bx, by), t = mmNow();
  MM.ink = { id: ++MM.sid, mode: MM.anchor, t0: t, t1: t, rot: S.rot, level: S.level, z0: h ? h.p[2] : Math.min(S.level + HT / LH, NL),
    pts: [], ts: [], brk: [], scr: [], cs: [], under: new Map(), start: h, end: null, last: null, gap: false, lastD: null };
  inkAdd(bx, by);
  turnTouch('ink');
  return true;
}
function inkAdd(bx, by) {
  const k = MM.ink; if (!k) return;
  const l = k.last, n = l ? Math.max(1, Math.ceil(Math.hypot(bx - l[0], by - l[1]))) : 1, ds = depthSampler(), t = mmNow();
  for (let i = 1; i <= n; i++) inkSample(k, l ? lerp(l[0], bx, i / n) : bx, l ? lerp(l[1], by, i / n) : by, t, ds);
  k.last = [bx, by]; k.t1 = t;
  if (MM.turn) MM.turn.last = t;
}
function inkSample(k, x, y, t, ds) {
  const m = k.scr.length;
  if (m && Math.floor(k.scr[m - 2]) === Math.floor(x) && Math.floor(k.scr[m - 1]) === Math.floor(y)) return;
  const h = worldAt(x, y, ds);
  if (h) {
    const key = h.c.join(','), u = k.under.get(key); if (u) u.n++; else k.under.set(key, { cell: h.c, what: whatOf(h.t), n: 1 });
    const lc = k.cs[k.cs.length - 1]; if (!lc || lc.key !== key) k.cs.push({ t, key, cell: h.c, what: whatOf(h.t) });   // what the pen was over, when
  }
  let p, brk = 0;
  if (k.mode === 'paint') {
    if (!h) { k.gap = true; return; }   // nothing to paint on over the sky
    if (k.gap || (k.lastD != null && Math.abs(h.D - k.lastD) > 1)) brk = 1;   // a depth jump lifts the pen
    k.gap = false; k.lastD = h.D; p = h.p;
  } else { const [u, v] = planeAt(x, y, k.z0), w = fromRotF(u, v); p = [w[0], w[1], k.z0]; }
  k.pts.push(p[0], p[1], p[2]); k.ts.push(t - k.t0); k.brk.push(brk); k.scr.push(x, y);
}
function inkUp() {
  const k = MM.ink; MM.ink = null;
  if (!k || !k.pts.length) return;
  k.end = worldAt(k.scr[k.scr.length - 2], k.scr[k.scr.length - 1]);
  k.shape = inkShape(k.scr);
  // a floating open stroke ramps from its start height to the surface it ends on
  if (k.mode === 'float' && k.shape !== 'loop' && k.end && Math.abs(k.end.p[2] - k.z0) > 0.05) rampFloat(k, k.end.p[2]);
  if (k.mode === 'float') liftFloat(k);
  k.from = refOf(k.start); k.to = refOf(k.end);
  k.crosses = [...k.under.values()].sort((a, b) => b.n - a.n).slice(0, 8);
  k.encloses = k.shape === 'loop' ? inkEncloses(k.scr) : [];
  delete k.under; delete k.last; delete k.gap; delete k.lastD; delete k.scr;
  MM.strokes.push(k);
  if (MM.turn) { MM.turn.strokes.push(k); MM.turn.last = mmNow(); renderTurn(MM.turn); }
  sfx.click();
}
function inkShape(s) {
  const n = s.length / 2; let len = 0, x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (let i = 0; i < n; i++) { const x = s[i * 2], y = s[i * 2 + 1]; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); if (i) len += Math.hypot(x - s[i * 2 - 2], y - s[i * 2 - 1]); }
  const diag = Math.hypot(x1 - x0, y1 - y0), chord = Math.hypot(s[n * 2 - 2] - s[0], s[n * 2 - 1] - s[1]);
  if (diag < 5) return 'dot';
  // closed: the end comes back near any of the first third (a lead-in or an overshoot still counts)
  let back = 1e9; for (let i = 0; i < Math.max(1, n / 3); i++) back = Math.min(back, Math.hypot(s[n * 2 - 2] - s[i * 2], s[n * 2 - 1] - s[i * 2 + 1]));
  if (back < Math.max(8, diag * 0.3) && len > diag * 1.6) return 'loop';
  if (len > diag * 3.2) return 'scribble';
  return chord / len > 0.85 ? 'line' : 'curve';
}
function rampFloat(k, z1) {
  const n = k.pts.length / 3, acc = [0]; let tot = 0;
  for (let i = 1; i < n; i++) { tot += Math.hypot(k.scr[i * 2] - k.scr[i * 2 - 2], k.scr[i * 2 + 1] - k.scr[i * 2 - 1]); acc.push(tot); }
  // slide each point along its own view ray (u and v each move 1.5 per level) so it stays where it was drawn
  for (let i = 0; i < n; i++) {
    const dz = (z1 - k.z0) * (tot ? acc[i] / tot : 0), r = toRotF(k.pts[i * 3], k.pts[i * 3 + 1]), w = fromRotF(r[0] + 1.5 * dz, r[1] + 1.5 * dz);
    k.pts[i * 3] = w[0]; k.pts[i * 3 + 1] = w[1]; k.pts[i * 3 + 2] = k.z0 + dz;
  }
}
// where a floating stroke would pass behind something, lift it toward the viewer along each view
// ray (z +1, u and v +1.5 per 5.5 of depth) just enough to clear it, smoothed into an arch, so it
// reads exactly as drawn here and arcs over the obstacle from other sides
function liftFloat(k) {
  const n = k.pts.length / 3, ds = depthSampler(); if (!ds || n < 3) return;
  const sa = [0], need = new Float32Array(n);
  for (let i = 1; i < n; i++) sa.push(sa[i - 1] + Math.hypot(k.scr[i * 2] - k.scr[i * 2 - 2], k.scr[i * 2 + 1] - k.scr[i * 2 - 1]));
  let any = false;
  for (let i = 0; i < n; i++) {
    const h = ds(Math.floor(k.scr[i * 2]), Math.floor(k.scr[i * 2 + 1])), D = depthOf(k.pts[i * 3], k.pts[i * 3 + 1], k.pts[i * 3 + 2]);
    if (h && h.D > D + 0.1) { need[i] = h.D + 0.6 - D; any = true; }
  }
  if (!any) return;
  const tot = sa[n - 1], w = Math.max(24, tot * 0.3), ends = Math.min(10, tot / 4);
  k.zb = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let L = 0;
    for (let j = 0; j < n; j++) if (need[j]) { const d = (sa[i] - sa[j]) / w; if (d * d < 1) L = Math.max(L, need[j] * (1 - d * d)); }
    L *= Math.min(1, sa[i] / ends, (tot - sa[i]) / ends);   // the ends stay on what they point at
    const a = L / 5.5, r = toRotF(k.pts[i * 3], k.pts[i * 3 + 1]), q = fromRotF(r[0] + 1.5 * a, r[1] + 1.5 * a);
    k.zb[i] = k.pts[i * 3 + 2]; k.pts[i * 3] = q[0]; k.pts[i * 3 + 1] = q[1]; k.pts[i * 3 + 2] += a;
  }
}
// cells seen inside a loop, most first
function inkEncloses(s) {
  const n = s.length / 2; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (let i = 0; i < n; i++) { x0 = Math.min(x0, s[i * 2]); y0 = Math.min(y0, s[i * 2 + 1]); x1 = Math.max(x1, s[i * 2]); y1 = Math.max(y1, s[i * 2 + 1]); }
  const inside = (x, y) => { let c = false; for (let i = 0, j = n - 1; i < n; j = i++) { const xi = s[i * 2], yi = s[i * 2 + 1], xj = s[j * 2], yj = s[j * 2 + 1]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
  const m = new Map(), ds = depthSampler(), st = Math.max(2, Math.round(Math.max(x1 - x0, y1 - y0) / 24));
  for (let y = y0; y <= y1; y += st) for (let x = x0; x <= x1; x += st) {
    if (!inside(x, y)) continue;
    const h = worldAt(x, y, ds); if (!h) continue;
    const key = h.c.join(','), u = m.get(key); if (u) u.n++; else m.set(key, { cell: h.c, what: whatOf(h.t), n: 1 });
  }
  return [...m.values()].sort((a, b) => b.n - a.n).slice(0, 6);
}
function inkUndo() { const k = MM.strokes.pop(); if (!k) return; for (const tn of MM.turns) { const i = tn.strokes.indexOf(k); if (i >= 0) { tn.strokes.splice(i, 1); renderTurn(tn); } } }
function inkClear() { MM.strokes.length = 0; for (const tn of MM.turns) if (tn.strokes.length) { tn.strokes.length = 0; renderTurn(tn); } }

// pixel line into a flat [x, y, D] list (the first point included only when asked)
function linePx(out, x0, y0, d0, x1, y1, d1, first) {
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, n = Math.max(dx, -dy) || 1;
  let err = dx + dy, k = 0, x = x0, y = y0;
  for (let g = 0; g < 4000; g++) {
    if (k || first) out.push(x, y, d0 + (d1 - d0) * k / n);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err; if (e2 >= dy) { err += dy; x += sx; } if (e2 <= dx) { err += dx; y += sy; }
    k++;
  }
}
// drop the doubled corner pixels so diagonals stay one pixel wide (Aseprite's pixel-perfect)
function pixelPerfect(p) {
  const o = [];
  for (let i = 0; i < p.length; i += 3) {
    let m = o.length;
    if (m && o[m - 3] === p[i] && o[m - 2] === p[i + 1]) continue;
    if (m >= 6) { const ax = o[m - 6], ay = o[m - 5], bx = o[m - 3], by = o[m - 2]; if (Math.abs(ax - p[i]) === 1 && Math.abs(ay - p[i + 1]) === 1 && (bx === ax || by === ay)) { o.length = m - 3; m -= 3; } }
    o.push(p[i], p[i + 1], p[i + 2]);
  }
  return o;
}
function drawInkIso(ctx) {
  if (S.mode !== 'cut' && S.mode !== 'exploded') return;
  const ds = S.mode === 'cut' && Math.abs(S.cutAnim - S.level) < 0.001 ? depthSampler() : null;
  for (const k of MM.strokes) inkStroke(ctx, k, ds);
  if (MM.ink) inkStroke(ctx, MM.ink, MM.ink.mode === 'float' ? null : ds);   // a floating stroke clears what is in front once it's done
  drawMarks(ctx);
}
function inkStroke(ctx, k, ds) {
  const n = k.pts.length / 3, top = cutTop(), runs = [];
  let run = null, px = 0, py = 0, pd = 0;
  for (let i = 0; i < n; i++) {
    const x = k.pts[i * 3], y = k.pts[i * 3 + 1], z = k.pts[i * 3 + 2], q = projIso(x, y, z);
    const X = Math.floor(q[0]), Y = Math.floor(q[1]), Dv = (k.zb ? k.zb[i] : z) > top ? 1e9 : depthOf(x, y, z);   // above the cut: flagged by a huge depth
    if (!run || k.brk[i]) { run = []; runs.push(run); linePx(run, X, Y, Dv, X, Y, Dv, true); }
    else linePx(run, px, py, pd, X, Y, Dv, false);
    px = X; py = Y; pd = Dv;
  }
  // visibility per pixel: 1 seen, 0 behind something, 2 above the cut
  const vis = [], hi = MM.hi === k.id;
  for (let r = 0; r < runs.length; r++) {
    const p = pixelPerfect(runs[r]), v = new Uint8Array(p.length / 3);
    for (let j = 0; j < v.length; j++) {
      const D = p[j * 3 + 2];
      if (D > 1e8) { v[j] = 2; continue; }
      const h = ds && ds(p[j * 3], p[j * 3 + 1]);
      v[j] = h && h.D > D + 0.5 ? 0 : 1;
    }
    runs[r] = p; vis.push(v);
  }
  const arrow = k.mode === 'float' && (k.shape === 'line' || k.shape === 'curve') && k !== MM.ink ? inkArrow(runs[runs.length - 1]) : null;
  // outline, then the core; hidden parts dotted with no outline
  ctx.fillStyle = INK_DK;
  for (let r = 0; r < runs.length; r++) { const p = runs[r], v = vis[r]; for (let j = 0; j < v.length; j++) if (v[j] === 1) ctx.fillRect(p[j * 3] - 1, p[j * 3 + 1] - 1, 3, 3); }
  if (arrow) for (let j = 0; j < arrow.length; j += 2) ctx.fillRect(arrow[j] - 1, arrow[j + 1] - 1, 3, 3);
  for (let r = 0; r < runs.length; r++) {
    const p = runs[r], v = vis[r];
    for (let j = 0; j < v.length; j++) {
      if (v[j] === 1) ctx.fillStyle = hi ? INK_HI : INK;
      else if ((j & 1) || (v[j] === 2 && j % 3)) continue;
      else ctx.fillStyle = v[j] === 2 ? 'rgba(95,211,242,0.35)' : 'rgba(95,211,242,0.6)';
      ctx.fillRect(p[j * 3], p[j * 3 + 1], 1, 1);
    }
  }
  if (arrow) { ctx.fillStyle = hi ? INK_HI : INK; for (let j = 0; j < arrow.length; j += 2) ctx.fillRect(arrow[j], arrow[j + 1], 1, 1); }
  // the stroke's number at its start, as the chat refers to it
  const p0 = runs[0];
  if (p0 && p0.length && k !== MM.ink) { const lab = '#' + k.id; plate(ctx, lab, p0[0] - ptextW(lab) - 7, p0[1] - 4, INK_DK, hi ? INK_HI : INK, hi ? INK_HI : INK); }
}
// a pixel arrowhead on the end of a run, along its last few pixels
function inkArrow(p) {
  if (!p || p.length < 15) return null;
  const m = p.length / 3, a = Math.max(0, m - 7), ex = p[(m - 1) * 3], ey = p[(m - 1) * 3 + 1];
  let dx = ex - p[a * 3], dy = ey - p[a * 3 + 1]; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
  const out = [];
  for (const s of [0.6, -0.6]) {
    const c = Math.cos(s), sn = Math.sin(s), rx = -(dx * c - dy * sn), ry = -(dx * sn + dy * c), t = [];
    linePx(t, ex, ey, 0, Math.round(ex + rx * 5), Math.round(ey + ry * 5), 0, false);
    for (let j = 0; j < t.length; j += 3) out.push(t[j], t[j + 1]);
  }
  return out;
}
function drawInkPlan(ctx) {
  if (S.mode !== 'plan' || !MM.strokes.length) return;
  const dy = sheetIn();
  for (const k of MM.strokes) {
    const n = k.pts.length / 3; let prev = null;
    for (let i = 0; i < n; i++) {
      const z = k.pts[i * 3 + 2], q = projPlan(k.pts[i * 3], k.pts[i * 3 + 1]), on = z >= S.level - 0.1 && z < S.level + 1.2;
      if (prev && !k.brk[i]) pline(ctx, prev[0], prev[1] + dy, q[0], q[1] + dy, on ? INK : 'rgba(95,211,242,0.35)', on ? null : [2, 1]);
      prev = q;
    }
  }
}
// spoken "here" / "this" land on what they refer to, for a moment
function drawMarks(ctx) {
  const now = mmNow();
  MM.marks = MM.marks.filter(m => now - m.t < 2600);
  const sliced = S.level < NL - 1;
  for (const m of MM.marks) {
    const [x, y, z] = m.cell, tt = cell(x, y, z), hh = tt ? (CUTTABLE[tt] && sliced && z === S.level ? HT / LH : TI[tt].slab ? 0.25 : 1) : 0.02;
    const k = (now - m.t) / 2600, col = k < 0.7 ? INK : 'rgba(95,211,242,0.5)';
    const c = isoQuad(ctx, x, y, x + 1, y + 1, z + hh, col, (now >> 7) & 1 ? null : [2, 1]);
    const left = c.reduce((a, p) => p[0] < a[0] ? p : a, c[0]);
    plate(ctx, m.word, Math.round(left[0]) - ptextW(m.word) - 8, Math.round(left[1]) - 4, INK, INK_DK);
  }
}
function inkIcon(g) {
  const pts = [[3, 15], [5, 12], [8, 10], [11, 11], [13, 14], [16, 15], [19, 12], [22, 8], [25, 6]], p = [];
  for (let i = 1; i < pts.length; i++) linePx(p, pts[i - 1][0], pts[i - 1][1], 0, pts[i][0], pts[i][1], 0, i === 1);
  const q = pixelPerfect(p);
  g.fillStyle = INK_DK; for (let j = 0; j < q.length; j += 3) g.fillRect(q[j] - 1, q[j + 1] - 1, 3, 3);
  g.fillStyle = INK; for (let j = 0; j < q.length; j += 3) g.fillRect(q[j], q[j + 1], 1, 1);
  R_(g, 24, 3, 3, 3, '#e6dfcf'); R_(g, 23, 5, 2, 2, '#e8a83c');
}
function inkHelp() {
  return 'Draw over the city (a pen always draws). Strokes stay put as you pan, zoom, rotate (Q E) and cut. Anchor: <button type="button" id="bInkP" aria-pressed="' + (MM.anchor === 'paint') + '">on surfaces</button> <button type="button" id="bInkF" aria-pressed="' + (MM.anchor === 'float') + '">in the air</button> <button type="button" id="bInkU">undo</button> <button type="button" id="bInkC">clear</button> Hold <b>Space</b> to talk while you draw; say “here” or “this” to point.';
}
function inkWire() {
  if ($('bInkP')) $('bInkP').onclick = () => { MM.anchor = 'paint'; setTool('sketch'); };
  if ($('bInkF')) $('bInkF').onclick = () => { MM.anchor = 'float'; setTool('sketch'); };
  if ($('bInkU')) $('bInkU').onclick = () => inkUndo();
  if ($('bInkC')) $('bInkC').onclick = () => inkClear();
}

// ---------- pointer context ----------
function samplePtr() {
  if (!MM.css || (S.mode !== 'cut' && S.mode !== 'plan')) { MM.dw = null; return; }
  const t = mmNow(), bx = MM.css[0] / S.zoom, by = MM.css[1] / S.zoom;
  const h = S.mode === 'cut' ? worldAt(bx, by) : null, pk = S.hover, wc = S.mode === 'cut' ? pickWire(bx, by, 4) : null;
  const s = { t, x: Math.round(MM.css[0]), y: Math.round(MM.css[1]),
    w: h ? h.p.map(r2) : null, see: h ? [...h.c, whatOf(h.t)] : null,
    pick: pk ? [pk.x, pk.y, pk.z, whatOf(pk.t)] : null, cable: wc ? (wc.tie ? 'tie' + wc.tie.id : 'cable' + wc.c.id) : null };
  const key = [s.see && s.see.join(), s.pick && s.pick.join(), s.cable].join('|'), last = MM.ptr[MM.ptr.length - 1];
  if (key !== MM.key || !last || Math.hypot(s.x - last.x, s.y - last.y) > 6) { MM.ptr.push(s); if (MM.ptr.length > 6000) MM.ptr.splice(0, 1000); }
  if (key !== MM.key) { MM.key = key; MM.dw = { t, s, sent: false }; return; }
  const dw = MM.dw;
  if (dw && !dw.sent && t - dw.t >= 450 && (dw.s.see || dw.s.cable)) { dw.sent = true; MM.dwells.push({ t: dw.t, see: dw.s.see, pick: dw.s.pick, cable: dw.s.cable, w: dw.s.w }); if (MM.dwells.length > 600) MM.dwells.shift(); }
}

// ---------- voice ----------
// Two engines behind one interface. Web Speech: Chrome sends the audio to Google, or recognises
// on-device where it ships that. Moonshine v2 streaming: an MIT model that runs in the page as
// WebAssembly. Both feed phrase(): the interim text as it changes, then one final per phrase.
const SRC = window.SpeechRecognition || window.webkitSpeechRecognition;
const ENGINES = {
  web: { name: 'Web Speech' },
  local: { name: 'Web Speech, on-device' },
  'moon-tiny': { name: 'Moonshine tiny', arch: 2, mb: 51 },
  'moon-small': { name: 'Moonshine small', arch: 4, mb: 166 },
  'moon-medium': { name: 'Moonshine medium', arch: 5, mb: 305, slow: true }   // can't keep up live in the browser on an M1 Max
};
const MIC = { on: false, ptt: false, stopping: false, rec: null, sess: 0, segs: new Map(), vad: null, level: 0, voice: false, onset: 0, offset: 0, onsetUsed: true, eng: SRC ? 'web' : 'moon-tiny', err: '' };
const isMoon = e => (e || MIC.eng).startsWith('moon');
const latOf = (e = MIC.eng) => MM.lat[e] || (MM.lat[e] = { first: [], final: [] });
// clip: a recorded clip to play through the microphone's audio graph instead (tests; Moonshine only,
// because Web Speech always listens to the real microphone)
function micStart(ptt, clip) {
  if (MIC.on || (clip && !isMoon())) return;
  if (!isMoon() && !SRC) { toast('Live speech needs Chrome, Edge or Safari (Web Speech API), or pick Moonshine'); return; }
  MIC.on = true; MIC.ptt = !!ptt; MIC.stopping = false; MIC.err = '';
  vadStart(clip);
  if (isMoon()) moonStart(); else recStart();
  micDom();
}
function micStop() {
  if (!MIC.on || MIC.stopping) return;
  MIC.stopping = true;
  if (isMoon()) moonStop();
  else if (MIC.rec) { try { MIC.rec.stop(); } catch (e) { micOff(); } } else micOff();
  micDom();
}
function micOff() { MIC.on = MIC.stopping = false; MIC.rec = null; vadStop(); micDom(); }
function recStart() {
  const r = new SRC(), sess = ++MIC.sess;
  MIC.rec = r;
  r.continuous = true; r.interimResults = true; r.maxAlternatives = 1; r.lang = navigator.language || 'en-US';
  if (MIC.eng === 'local' && 'processLocally' in r) r.processLocally = true;   // on-device recognition where Chrome offers it
  r.onresult = e => onSpeech(e.resultIndex, e.results, sess);
  r.onerror = e => {
    MIC.err = e.error;
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { toast('Microphone blocked: allow it for this page to talk'); MIC.stopping = true; }
    else if (e.error === 'network') toast('Speech service unreachable (Web Speech sends audio to the browser vendor)');
    else if (e.error === 'language-not-supported') toast('On-device speech is not available for ' + r.lang);
  };
  r.onend = () => {
    for (const sg of MIC.segs.values()) if (sg.id.startsWith(sess + ':') && !sg.final && sg.text) { sg.final = true; sg.tFinal = mmNow(); }   // a stop can drop the last interim
    if (MIC.rec !== r) return;
    if (MIC.on && !MIC.stopping && !MIC.ptt) { try { recStart(); return; } catch (e) { /* fall through: off */ } }
    micOff();
  };
  try { r.start(); } catch (e) { MIC.err = e.message; micOff(); }
}
// results: final phrases first, then the live phrase, which Chrome splits by stability across
// the trailing entries; it is keyed by the index it starts at, and that entry finalises it
function onSpeech(from, results, sess) {
  const t = mmNow();
  let i = from;
  for (; i < results.length && results[i].isFinal; i++) phrase(sess + ':' + i, results[i][0].transcript, t, results[i][0].confidence);
  if (i < results.length) { let text = ''; for (let j = i; j < results.length; j++) text += results[j][0].transcript; phrase(sess + ':' + i, text, t); }
  if (MM.turn) renderTurn(MM.turn);
  caption();
}
// conf is undefined for interim text; a final passes its confidence, or null when the engine gives none
function phrase(key, text, t, conf) {
  text = (text || '').trim();
  let sg = MIC.segs.get(key);
  if (!sg) {
    if (!text) return;
    turnTouch('voice');
    sg = { id: key, eng: key[0] === 's' ? 'sim' : MIC.eng, tFirst: t, tUpd: t, tFinal: 0, text: '', words: [], final: false, conf: null };
    // words that slid off the end of the last phrase as it finalised keep their times here
    if (MIC.carry && t - MIC.carry.t < 2500) { sg.words = MIC.carry.words; MIC.carry = null; }
    MIC.segs.set(key, sg); MM.turn.segs.push(sg);
  }
  if (sg.final) return;
  const n0 = sg.words.length, lat = latOf(sg.eng);
  speechWords(sg, text, t);
  if (!n0 && sg.words.length && !MIC.onsetUsed && MIC.onset && t - MIC.onset < 6000) { sg.latFirst = t - MIC.onset; MIC.onsetUsed = true; lat.first.push(sg.latFirst); }
  sg.tUpd = t;
  if (conf !== undefined) {
    if (sg.dropped && sg.dropped.length && !isMoon(sg.eng)) MIC.carry = { t, words: sg.dropped };   // Moonshine's lines don't hand words on
    sg.final = true; sg.tFinal = t; sg.conf = conf == null ? null : r2(conf || 0);
    if (!MIC.voice && MIC.offset > (sg.words.length ? sg.words[0].t : sg.tFirst) && t - MIC.offset < 6000) { sg.latFinal = t - MIC.offset; lat.final.push(sg.latFinal); }
  }
  if (MM.turn) MM.turn.last = t;
}
// partials carry no word times: a new word is stamped when it first shows, less the usual lag
// (the first word of a phrase at the measured voice onset); revised words keep their times
const lagEst = () => { const m = median(latOf().first.slice(-12)); return m == null ? 350 : clamp(m - 150, 150, 900); };
function speechWords(sg, text, t) {
  const ws = text ? text.split(/\s+/) : [], old = sg.words, out = [], est = t - lagEst();
  const fresh = ws.reduce((n, w, k) => n + (old[k] ? 0 : 1), 0);
  let j = 0;
  for (let k = 0; k < ws.length; k++) {
    if (old[k]) { out.push(old[k].w === ws[k] ? old[k] : { w: ws[k], t: old[k].t }); continue; }
    const prev = out[k - 1] ? out[k - 1].t : 0;
    const w = { w: ws[k], t: k === 0 && !MIC.onsetUsed && MIC.onset && t - MIC.onset < 6000 ? MIC.onset : Math.max(prev, est - (fresh - 1 - j) * 240) };
    j++; out.push(w);
  }
  sg.dropped = old.slice(ws.length);
  sg.words = out; sg.text = text;
  // the fast path: a pointing word resolves at once against what you were pointing at as it was
  // said ("here" straight away, the rest once the next word shows it isn't "that the" or "there is")
  const nw = ws.map(norm); sg.marked = sg.marked || new Set();
  for (let k = 0; k < nw.length; k++) {
    if (sg.marked.has(k) || !DEIX.test(nw[k]) || (nw[k] !== 'here' && k === nw.length - 1)) continue;
    sg.marked.add(k);
    if (!deictic(nw, k)) continue;
    const r = resolveAt(out[k].t); if (r && r.cell) MM.marks.push({ cell: r.cell, word: nw[k].toUpperCase(), t });
  }
}
// Moonshine: the library comes from jsDelivr and the model from Moonshine's CDN on first use (then
// the browser's Cache Storage). It transcribes in its own worker, off the render thread. Audio
// reaches it through an AudioWorklet tap on the same graph as the level meter.
const MOON_LIB = 'https://cdn.jsdelivr.net/npm/@moonshine-ai/moonshine-wasm@0.1.5/dist/index.js';
const MOON = { lib: null, host: null, arch: -1, loading: null, pct: 0, err: '', note: '', cur: null, pass: [] };
function moonLoad(arch) {
  if (MOON.arch === arch && MOON.loading) return MOON.loading;
  if (MOON.host) { MOON.host.close(); MOON.host = null; }
  MOON.arch = arch; MOON.err = ''; MOON.pct = 0; engDom();
  return MOON.loading = (async () => {
    if (!window.crossOriginIsolated) throw new Error('page is not cross-origin isolated');
    MOON.lib = MOON.lib || await import(MOON_LIB);
    const host = new MOON.lib.SttWorkerHost();
    host.onProgress = (id, loaded, total) => { if (MOON.arch === arch) { MOON.pct = total ? loaded / total : 0; engDom(); } };
    host.onPass = (sid, ms) => { MOON.pass.push(Math.round(ms)); if (MOON.pass.length > 300) MOON.pass.shift(); };
    await host.loadTranscriber({ transcriberId: 't', modelArch: arch, source: { kind: 'catalog', language: 'en' }, options: { transcription_interval: '0.2' } });
    if (MOON.arch !== arch) { host.close(); return; }   // switched model while this one loaded
    MOON.host = host; MOON.pct = 1; engDom();
  })().catch(e => { if (MOON.arch === arch) { MOON.err = e.message || String(e); MOON.loading = null; MOON.arch = -1; engDom(); } throw e; });
}
async function moonStart() {
  const ms = MOON.cur = { sid: 'm' + (++MIC.sess), q: [], fed: 0, base: 0, live: false };
  if (!MOON.host) toast(`Loading ${ENGINES[MIC.eng].name}… talk now, it catches up`);
  try {
    await moonLoad(ENGINES[MIC.eng].arch);
    const h = MOON.host;
    await h.createStream('t', ms.sid, { updateInterval: 0.2 });
    h.setListener(ms.sid, { onLineTextChanged: e => moonLine(ms, e.line, false), onLineCompleted: e => moonLine(ms, e.line, true), onError: e => { MIC.err = e.error ? e.error.message : 'error'; } });
    await h.start(ms.sid);
    for (const c of ms.q.splice(0)) h.addAudio(ms.sid, c, 16000);   // what was said while the model loaded
    if (MOON.cur === ms && MIC.on && !MIC.stopping) { ms.live = true; return; }
    await h.stop(ms.sid); await h.closeStream(ms.sid);   // released before the model was ready: still transcribe it
  } catch (e) { if (MOON.cur === ms) { toast('Moonshine could not start: ' + (e.message || e)); MOON.cur = null; micOff(); } }
}
function moonStop() {
  setTimeout(async () => {   // a short tail: the end of the last word is still on its way through the graph
    vadStop();
    const ms = MOON.cur; MOON.cur = null;
    if (ms && ms.live) { ms.live = false; try { await MOON.host.stop(ms.sid); await MOON.host.closeStream(ms.sid); } catch (e) { /* stream already gone */ } }
    micOff();
  }, 120);
}
function moonFeed(pcm) {
  const ms = MOON.cur; if (!ms) return;
  if (!ms.fed) ms.base = mmNow() - pcm.length / 16;   // page time of the stream's audio time 0
  ms.fed += pcm.length;
  if (ms.live) MOON.host.addAudio(ms.sid, pcm, 16000); else if (ms.q.length < 940) ms.q.push(pcm);   // hold ~30 s while the model loads
}
function moonLine(ms, line, done) {
  const key = ms.sid + ':' + line.id;
  phrase(key, line.text, mmNow(), done ? null : undefined);
  const sg = MIC.segs.get(key);
  if (sg && done) {
    sg.span = [Math.round(ms.base + line.startTime * 1000), Math.round(ms.base + (line.startTime + line.duration) * 1000)];
    sg.engMs = Math.round(line.lastTranscriptionLatencyMs);
  }
  if (MM.turn) renderTurn(MM.turn);
  caption();
}
const TAP_SRC = `registerProcessor('mm-tap', class extends AudioWorkletProcessor {
  constructor() { super(); this.b = new Float32Array(512); this.n = 0; }
  process(ins) {
    const c = ins[0]; if (!c || !c.length) return true;
    for (let i = 0; i < c[0].length; i++) {
      let s = 0; for (const ch of c) s += ch[i];
      this.b[this.n++] = s / c.length;
      if (this.n === 512) { this.port.postMessage(this.b, [this.b.buffer]); this.b = new Float32Array(512); this.n = 0; }
    }
    return true;
  }
});`;
async function moonTap(ac, node) {
  const url = URL.createObjectURL(new Blob([TAP_SRC], { type: 'text/javascript' }));
  try { await ac.audioWorklet.addModule(url); } finally { URL.revokeObjectURL(url); }
  const tap = new AudioWorkletNode(ac, 'mm-tap'), mute = ac.createGain();
  mute.gain.value = 0; node.connect(tap); tap.connect(mute); mute.connect(ac.destination);
  tap.port.onmessage = e => moonFeed(e.data);
  return tap;
}
// Moonshine runs threaded WebAssembly, which needs a cross-origin-isolated page: coi-sw.js adds
// the headers to this folder's page loads, and the page reloads once into isolation
async function coiReload() {
  let tried = false;
  try { tried = sessionStorage.getItem('stratum.coi') === '1'; sessionStorage.setItem('stratum.coi', '1'); } catch (e) { /* no storage: may retry */ }
  if (!('serviceWorker' in navigator)) MOON.err = 'needs service workers (http://localhost or https)';
  else if (tried) MOON.err = 'page not isolated: reload normally (not Shift-reload)';
  else {
    MOON.note = 'reloading once to enable Moonshine…'; engDom();
    try { await navigator.serviceWorker.register('coi-sw.js'); await navigator.serviceWorker.ready; location.reload(); return; }
    catch (e) { MOON.err = 'service worker: ' + e.message; }
  }
  MOON.note = ''; engDom();
}
async function engPick(id, boot) {
  const sel = $('micEng').querySelector('select');
  if (MIC.on) micStop();
  if (id === 'local' && !boot && SRC.available) {   // Chrome's on-device pack: check, fetch once if needed
    const lang = navigator.language || 'en-US', q = { langs: [lang], processLocally: true };
    let st = 'unavailable'; try { st = await SRC.available(q); } catch (err) { /* treat as unavailable */ }
    if (st === 'unavailable') { toast('No on-device speech for ' + lang + ' in this browser'); sel.value = MIC.eng; return; }
    if (st !== 'available') {
      toast('Chrome is fetching its on-device speech pack for ' + lang + ' (once)…');
      let ok = false; try { ok = await SRC.install(q); } catch (err) { /* fails below */ }
      if (!ok) { toast('Could not install on-device speech for ' + lang); sel.value = MIC.eng; return; }
      toast('On-device speech ready: audio stays on this machine');
    }
  }
  MIC.eng = id; sel.value = id;
  try { localStorage.setItem('stratum.speech', id); } catch (e) { /* not remembered */ }
  if (isMoon(id)) { if (!window.crossOriginIsolated) { coiReload(); return; } moonLoad(ENGINES[id].arch).catch(() => { /* shown in the engine row */ }); }
  engDom();
}
function engDom() {
  const st = $('micEng') && $('micEng').querySelector('.st'); if (!st) return;
  const E = ENGINES[MIC.eng];
  let s = MIC.eng === 'local' ? 'on-device' : 'audio goes to Google';
  if (isMoon()) s = MOON.err ? '⚠ ' + MOON.err : MOON.note || (MOON.host && MOON.arch === E.arch ? 'on-device · ready' + (E.slow ? ' · lags live speech' : '')
    : MOON.pct > 0 && MOON.pct < 1 ? `downloading ${Math.round(MOON.pct * 100)}% of ${E.mb} MB` : MOON.loading ? 'loading…' : `${E.mb} MB download, once`);
  st.textContent = s; st.title = s;
}

// the level meter (and Moonshine's tap) on one audio graph, fed by the microphone, or for tests by
// a recorded clip, so no test ever opens the mic
async function vadStart(clip) {
  if (MIC.vad) return;
  const tok = MIC.vad = { pending: true };
  let stream = null, ac = null;
  try {
    if (!clip) stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    ac = new (window.AudioContext || window.webkitAudioContext)(isMoon() ? { sampleRate: 16000 } : {});
    const an = ac.createAnalyser(); an.fftSize = 1024;
    const node = clip ? ac.createBufferSource() : ac.createMediaStreamSource(stream);
    if (clip) node.buffer = await clipBuffer(ac, clip);
    node.connect(an);
    const tap = isMoon() ? await moonTap(ac, node) : null;
    if (!MIC.on || MIC.vad !== tok) throw 0;   // stopped while the graph was being built
    const v = MIC.vad = { stream, ac, an, node, tap, buf: new Float32Array(an.fftSize), floor: 0.004, run: 0, quiet: 0 };
    if (clip) { node.onended = () => micStop(); node.start(); MIC.clipT0 = mmNow() + 300; }   // where the clip's own audio begins
    ac.resume();
    v.timer = setInterval(() => vadTick(v), 20);
  } catch (e) {
    if (stream) stream.getTracks().forEach(k => k.stop());
    if (ac) ac.close();
    if (MIC.vad === tok) MIC.vad = null;
    if (e && MIC.on) { MIC.err = MIC.err || e.name; if (isMoon()) { toast('No audio for Moonshine: ' + (e.message || e.name)); MOON.cur = null; micOff(); } }
  }
}
// a clip with room around it: 0.3 s before, and 2 s after so the engine hears the speech end
async function clipBuffer(ac, url) {
  const raw = await ac.decodeAudioData(await (await fetch(url)).arrayBuffer());
  const lead = Math.round(0.3 * ac.sampleRate), b = ac.createBuffer(1, lead + raw.length + 2 * ac.sampleRate, ac.sampleRate);
  b.getChannelData(0).set(raw.getChannelData(0), lead);
  return b;
}
function vadTick(v) {
  v.an.getFloatTimeDomainData(v.buf);
  let e = 0; for (let i = 0; i < v.buf.length; i++) e += v.buf[i] * v.buf[i];
  const rms = Math.sqrt(e / v.buf.length), thr = Math.max(0.012, v.floor * 3.2), t = mmNow();
  MIC.level = rms;
  if (rms > thr) {
    v.quiet = 0;
    if (!MIC.voice && ++v.run >= 3) { MIC.voice = true; MIC.onset = t - 40; MIC.onsetUsed = false; MM.vad.push([MIC.onset, 0]); turnTouch('voice'); }
  } else {
    v.run = 0;
    if (!MIC.voice) v.floor = v.floor * 0.98 + rms * 0.02;
    else if (++v.quiet >= 13) { MIC.voice = false; MIC.offset = t - 260; const l = MM.vad[MM.vad.length - 1]; if (l) l[1] = MIC.offset; }
  }
  if (MIC.voice && MM.turn) MM.turn.last = t;
}
function vadStop() {
  const v = MIC.vad; MIC.vad = null; MIC.level = 0;
  if (MIC.voice) { MIC.voice = false; MIC.offset = mmNow(); const l = MM.vad[MM.vad.length - 1]; if (l && !l[1]) l[1] = MIC.offset; }   // stopped mid-voice: the span ends here
  if (!v || v.pending) return;
  clearInterval(v.timer); if (v.stream) v.stream.getTracks().forEach(k => k.stop()); if (v.tap) v.tap.port.onmessage = null; v.ac.close();
}
// a scripted talker for tests and demos: words arrive as partials at speaking pace, split the way
// Chrome splits them (a stable head and an unstable tail entry), then one final
function simSpeech(text, o) {
  o = o || {}; const words = text.split(/\s+/), wordMs = o.wordMs || 260, lag = o.lag || 380, fin = o.final || 520, sess = 's' + (++MIC.sess);
  const t0 = mmNow(), R = (tx, f) => ({ isFinal: f, 0: { transcript: tx, confidence: f ? 0.9 : 0 }, length: 1 });
  MIC.voice = true; MIC.onset = t0; MIC.onsetUsed = false; MM.vad.push([t0, 0]); turnTouch('voice');
  words.forEach((_, k) => setTimeout(() => {
    const head = words.slice(0, Math.max(0, k - 1)).join(' '), tail = words.slice(Math.max(0, k - 1), k + 1).join(' ');
    onSpeech(0, head ? [R(head, false), R(' ' + tail, false)] : [R(tail, false)], sess);
  }, k * wordMs + lag));
  const end = words.length * wordMs;
  setTimeout(() => { MIC.voice = false; MIC.offset = t0 + end; MM.vad[MM.vad.length - 1][1] = MIC.offset; }, end);
  setTimeout(() => onSpeech(0, [R(text, true)], sess), end + fin);
  return end + fin;
}

// ---------- turns ----------
const DEIX = /^(here|there|this|that|these|those)$/;
// "connect this to that core" points; "is that the" and "there is" don't
const NOT_AFTER_THIS = new Set('the a an i we you they he she it is was are were will would should can could has have had my your our their its'.split(' '));
const NOT_AFTER_THERE = new Set('is are was were will would should could must might seems seem be s isnt arent wasnt'.split(' '));
function deictic(nw, k) {
  const w = nw[k], nx = nw[k + 1];
  if (w === 'here' || nx == null) return DEIX.test(w);
  if (w === 'there') return !NOT_AFTER_THERE.has(nx);
  return DEIX.test(w) && !NOT_AFTER_THIS.has(nx);
}
const norm = w => w.toLowerCase().replace(/[^a-z]/g, '');
function turnTouch(kind) {
  const t = mmNow();
  if (!MM.turn) { MM.turn = { id: ++MM.tid, t0: kind === 'voice' && MIC.voice && MIC.onset ? MIC.onset : t, last: t, t1: 0, segs: [], strokes: [], typed: [], refs: [], kinds: new Set(), li: null }; MM.turns.push(MM.turn); }
  MM.turn.last = t; MM.turn.kinds.add(kind);
  if (kind === 'ink' && MM.ink && !MM.turn.strokes.includes(MM.ink)) renderTurn(MM.turn);
}
function turnTick() {
  const tn = MM.turn, t = mmNow();
  if (!tn || MM.ink || MIC.voice) return;
  if (t - tn.last < TURN_GAP || tn.segs.some(s => !s.final && t - s.tUpd < 3000)) return;
  MM.turn = null; tn.t1 = tn.last;
  if (!tn.segs.some(s => s.text) && !tn.strokes.length && !tn.typed.length) { if (tn.li) tn.li.remove(); MM.turns.splice(MM.turns.indexOf(tn), 1); return; }
  tn.text = turnWords(tn).map(w => w.w).join(' ');
  const tw = turnWords(tn), nw = tw.map(w => norm(w.w));
  tn.refs = orderRefs(tw.filter((w, k) => deictic(nw, k)).map(w => ({ word: norm(w.w), t: w.t, target: resolveAt(w.t) })));
  tn.intent = intentOf(tn.text);
  renderTurn(tn, true);
  if (MM.auto && tn.text && S.agentOn) turnToClaude(tn);
}
const turnWords = tn => tn.segs.flatMap(s => s.words).sort((a, b) => a.t - b.t);
// the keyword family mentioned first (the deeper agent re-reads the words anyway)
const INTENTS = [['garden', /garden|tree|green|park|plant/], ['bridge', /bridge|connect|link|cross/], ['well', /light ?well|daylight|dark|sun|void/],
  ['stack', /stack|capsule|hous|home|resid|unit|flat/], ['remove', /remove|demolish|tear|clear|get rid|knock/], ['cable', /cable|wire|route/]];
const INTENT_ASK = { garden: 'add a garden', bridge: 'connect a bridge', well: 'open a light well', stack: 'build housing' };
function intentOf(s) {
  s = s.toLowerCase(); let best = null, at = 1e9;
  for (const [k, re] of INTENTS) { const m = s.search(re); if (m >= 0 && m < at) { at = m; best = k; } }
  return best;
}
// what a pointing word at time t meant: a stroke drawn around then, else where the pointer rested, else where it was
function resolveAt(t) {
  let best = null, bd = 1600;
  for (const k of [...MM.strokes, ...(MM.ink ? [MM.ink] : [])]) { const d = t < k.t0 ? k.t0 - t : t > k.t1 ? t - k.t1 : 0; if (d < bd) { bd = d; best = k; } }
  if (best) {
    const k = best, sr = (via, c) => c ? { kind: 'stroke', stroke: k.id, via, cell: c.cell, what: c.what } : null;
    if (k.shape === 'loop' && k.encloses.length) return sr('loop', k.encloses[0]);
    if (k.shape === 'scribble' && k.crosses.length) return sr('scribble', k.crosses[0]);
    if (t < k.t0 || !k.cs.length) return sr('stroke start', refOf(k.start));
    if (t > k.t1 && k.end) return sr('stroke end', refOf(k.end));
    let c = k.cs[0]; for (const e of k.cs) { if (e.t > t) break; c = e; }   // where the pen was as the word was said
    return sr('pen', c);
  }
  const dw = MM.dwells.filter(d => d.see && d.t <= t + 300 && d.t >= t - 2500).pop();
  if (dw) return { kind: 'cell', via: 'dwell', cell: dw.see.slice(0, 3), what: dw.see[3], cable: dw.cable || undefined };
  // else whatever the pointer was over then (a sample is kept only when that changes)
  let ps = null;
  for (let i = MM.ptr.length - 1; i >= 0; i--) { const s = MM.ptr[i]; if (s.t <= t + 150) { ps = s; break; } }
  return ps && ps.see && t - ps.t < 30000 ? { kind: 'cell', via: 'pointer', cell: ps.see.slice(0, 3), what: ps.see[3], cable: ps.cable || undefined } : null;
}
// several pointing words on one arrow: the first means where it starts, the last where it ends
function orderRefs(refs) {
  const by = new Map();
  for (const r of refs) if (r.target && r.target.stroke) { const a = by.get(r.target.stroke) || []; a.push(r); by.set(r.target.stroke, a); }
  for (const [id, rs] of by) {
    const k = MM.strokes.find(x => x.id === id);
    if (!k || rs.length < 2 || (k.shape !== 'line' && k.shape !== 'curve')) continue;
    if (k.from) rs[0].target = { kind: 'stroke', stroke: id, via: 'first word → stroke start', cell: k.from.cell, what: k.from.what };
    if (k.to) rs[rs.length - 1].target = { kind: 'stroke', stroke: id, via: 'last word → stroke end', cell: k.to.cell, what: k.to.what };
  }
  return refs;
}
// the deeper agent gets the whole turn: the words, with the first thing pointed at as its pin
function turnToClaude(tn) {
  const r = tn.refs.find(x => x.target) || (tn.strokes.length ? { target: strokeTarget(tn.strokes[tn.strokes.length - 1]) } : null);
  if (r && r.target && r.target.cell) {
    const [x, y, z] = r.target.cell;
    S.pins.push({ x, y, z, t: cell(x, y, z), id: ++pinSeq }); if (S.pins.length > 4) S.pins.shift(); renderChips();
  }
  // the scripted claude reads keywords in a fixed order, so it is handed the intent mentioned first
  const ask = /\b(why|explain|reason|stop|pause|hold|resume|continue)\b/i.test(tn.text) || !INTENT_ASK[tn.intent] ? tn.text : INTENT_ASK[tn.intent];
  const reply = chatRespond(ask);
  setTimeout(() => { addMsg('ai', reply); sfx.chat(); }, REDUCED ? 50 : 350);
}
function strokeTarget(k) {
  if (k.shape === 'loop' && k.encloses.length) return k.encloses[0];
  if (k.shape === 'scribble' && k.crosses.length) return k.crosses[0];
  return k.to || k.from;
}
// typed chat joins the stream too
function mmText(text) {
  const e = { t: mmNow(), text }; MM.typed.push(e);
  if (MM.turn) { MM.turn.typed.push(e); MM.turn.last = e.t; renderTurn(MM.turn); }
}

// ---------- the "you" entry ----------
const strokeName = k => (k.mode === 'float' && (k.shape === 'line' || k.shape === 'curve') ? 'arrow' : k.shape || 'stroke');
const cellTxt = c => c ? `${c.what} ${c.cell[0]},${c.cell[1]} ${lvCode(c.cell[2])}` : '';
function strokeTxt(k) {
  const t = strokeTarget(k), nm = strokeName(k);
  if (nm === 'arrow' && k.from && k.to) return `arrow ${cellTxt(k.from)} → ${cellTxt(k.to)}`;
  if (nm === 'loop') return `loop round ${cellTxt(t)}`;
  if (nm === 'scribble') return `scribble over ${cellTxt(t)}`;
  return `${nm} on ${cellTxt(t)}`;
}
function renderTurn(tn, closing) {
  if (!tn.li) {
    const li = tn.li = document.createElement('li'); li.className = 'me turn live';
    li.innerHTML = '<details open><summary><span class="th"><b>you</b><time></time><span class="mods"></span></span><span class="pv"></span></summary><div class="rt"></div><canvas class="tl" width="272" height="22"></canvas><div class="tf"><span class="ins"></span><button type="button" class="cj" title="Copy this turn as JSON">copy json</button></div></details>';
    li.querySelector('.cj').onclick = () => { const s = JSON.stringify(turnJSON(tn), null, 1); try { navigator.clipboard.writeText(s); toast('Turn ' + tn.id + ' copied as JSON'); } catch (e) { console.log(s); } };
    $('msgs').appendChild(li);
  }
  const li = tn.li, words = turnWords(tn), dur = ((tn.t1 || mmNow()) - tn.t0) / 1000;
  li.querySelector('time').textContent = fmtTime(S.time);
  const spk = tn.segs.length ? (tn.segs.reduce((a, s) => a + (s.words.length ? (s.tFinal || s.tUpd) - s.words[0].t : 0), 0) / 1000).toFixed(1) + 's voice' : '';
  li.querySelector('.mods').textContent = [spk, tn.strokes.length ? tn.strokes.length + ' ink' : '', dwellsIn(tn).length ? dwellsIn(tn).length + ' pts' : '', dur.toFixed(1) + 's'].filter(Boolean).join(' · ');
  // words interleaved by time with strokes, typed text, and what each pointing word resolved to
  const rt = li.querySelector('.rt'); rt.textContent = '';
  const items = [...words.map(w => ({ t: w.t, w })), ...tn.strokes.map(k => ({ t: k.t0, k })), ...tn.typed.map(x => ({ t: x.t, x }))].sort((a, b) => a.t - b.t);
  const live = new Set(tn.segs.filter(s => !s.final).flatMap(s => s.words));
  for (const it of items) {
    if (it.w) {
      const s = document.createElement('span'); s.textContent = it.w.w + ' ';
      if (live.has(it.w)) s.className = 'int';
      rt.appendChild(s);
      const ref = tn.refs.find(r => r.t === it.w.t && r.word === norm(it.w.w));
      if (ref && ref.target) { const c = document.createElement('span'); c.className = 'rf'; c.textContent = '→ ' + ref.target.what + ' ' + ref.target.cell.slice(0, 2).join(',') + ' ' + lvCode(ref.target.cell[2]); c.title = 'resolved by ' + ref.target.via; if (ref.target.stroke) inkHover(c, ref.target.stroke); rt.appendChild(c); }
    } else if (it.k) {
      const c = document.createElement('span'); c.className = 'tk'; c.textContent = '#' + it.k.id + ' ' + strokeTxt(it.k); inkHover(c, it.k.id); rt.appendChild(c);
    } else { const c = document.createElement('span'); c.className = 'ty'; c.textContent = '⌨ ' + it.x.text; rt.appendChild(c); }
  }
  if (MM.ink && tn === MM.turn) { const c = document.createElement('span'); c.className = 'tk int'; c.textContent = '#' + MM.ink.id + ' drawing…'; rt.appendChild(c); }
  const text = words.map(w => w.w).join(' ');
  li.querySelector('.pv').textContent = text ? (text.length > 64 ? text.slice(0, 62) + '…' : text) : tn.strokes.map(k => '#' + k.id + ' ' + strokeName(k)).join(' ');
  const lat = tn.segs.filter(s => s.latFirst != null || s.latFinal != null).pop();
  li.querySelector('.ins').textContent = [tn.intent ? 'intent: ' + tn.intent : '', lat && lat.latFirst != null ? 'first partial ' + lat.latFirst + ' ms' : '', lat && lat.latFinal != null ? 'final +' + lat.latFinal + ' ms' : ''].filter(Boolean).join(' · ');
  if (closing) { li.classList.remove('live'); if (text.length > 140) li.querySelector('details').open = false; }
  drawTurnStrip(li.querySelector('canvas'), tn);
  $('msgs').scrollTop = $('msgs').scrollHeight;
}
function inkHover(el, id) { el.onmouseenter = () => { MM.hi = id; }; el.onmouseleave = () => { if (MM.hi === id) MM.hi = 0; }; }
const dwellsIn = tn => MM.dwells.filter(d => d.t >= tn.t0 - LEAD && d.t <= (tn.t1 || mmNow()));
// one strip per turn: voice (level-meter spans, words as ticks), ink spans, pointer dwells, on one clock
function drawTurnStrip(cv, tn) {
  const g = cv.getContext('2d'), w = cv.width, t0 = tn.t0 - LEAD, t1 = Math.max(tn.t1 || mmNow(), t0 + 3000), X = t => Math.round(clamp((t - t0) / (t1 - t0), 0, 1) * (w - 1));
  g.clearRect(0, 0, w, cv.height);
  g.fillStyle = '#1b1c1f'; g.fillRect(0, 0, w, cv.height);
  g.fillStyle = '#2c2e32'; g.fillRect(X(tn.t0), 0, 1, cv.height);
  for (const [a, b] of MM.vad) if ((b || mmNow()) > t0 && a < t1) { g.fillStyle = 'rgba(95,211,242,0.28)'; g.fillRect(X(a), 2, Math.max(1, X(b || mmNow()) - X(a)), 5); }
  g.fillStyle = INK; for (const wd of turnWords(tn)) g.fillRect(X(wd.t), 2, 1, 5);
  for (const k of [...tn.strokes, ...(MM.ink && tn === MM.turn ? [MM.ink] : [])]) { g.fillStyle = MM.hi === k.id ? INK_HI : '#9fe6f6'; g.fillRect(X(k.t0), 10, Math.max(2, X(k.t1) - X(k.t0)), 3); }
  g.fillStyle = '#e8a83c'; for (const d of dwellsIn(tn)) g.fillRect(X(d.t), 16, 2, 3);
  g.fillStyle = '#716c62'; for (const s of MM.ptr) if (s.t >= t0 && s.t <= t1) g.fillRect(X(s.t), 20, 1, 1);
}

// ---------- caption + mic ----------
function caption() {
  const el = $('cap'); if (!el) return;
  const segs = [...MIC.segs.values()].filter(s => mmNow() - (s.tFinal || s.tUpd) < 2600 || !s.final).slice(-2);
  if (!segs.length && !MIC.on) { el.hidden = true; return; }
  el.hidden = false;
  const fin = segs.filter(s => s.final).map(s => s.text).join(' '), live = segs.filter(s => !s.final).map(s => s.text).join(' ');
  el.querySelector('.fin').textContent = fin + (fin && live ? ' ' : '');
  el.querySelector('.int').textContent = live || (MIC.on && !fin ? (MIC.voice ? '…' : 'listening') : '');
  const L = latOf(), f = median(L.first.slice(-12)), l = median(L.final.slice(-12));
  el.querySelector('.lat').textContent = f != null || l != null ? `${ENGINES[MIC.eng].name} · ${f != null ? 'partial ' + f + 'ms' : ''}${f != null && l != null ? ' · ' : ''}${l != null ? 'final +' + l + 'ms' : ''}` : '';
}
function micDom() {
  const b = $('bMic'); if (!b) return;
  b.setAttribute('aria-pressed', MIC.on ? 'true' : 'false');
  b.classList.toggle('stopping', MIC.stopping);
  b.title = MIC.on ? (MIC.ptt ? 'Talking (release Space)' : 'Open mic: click to stop') : 'Talk: click for an open mic, or hold Space';
  caption();
}
function micMeter() {
  const m = $('micLv'); if (m) m.style.transform = `scaleX(${MIC.on ? clamp(Math.sqrt(MIC.level) * 3, 0.04, 1).toFixed(2) : 0})`;
  const b = $('bMic'); if (b) b.classList.toggle('voice', MIC.voice);
}

// ---------- export ----------
function strokeJSON(k) {
  const n = k.pts.length / 3, pts = [];
  let last = null;
  for (let i = 0; i < n; i++) {   // decimated: a point per ~0.2 cell, every pen lift kept
    const p = [r2(k.pts[i * 3]), r2(k.pts[i * 3 + 1]), r2(k.pts[i * 3 + 2])];
    if (!last || k.brk[i] || i === n - 1 || Math.hypot(p[0] - last[0], p[1] - last[1], p[2] - last[2]) > 0.2) { pts.push(k.brk[i] ? [...p, k.ts[i], 'lift'] : [...p, k.ts[i]]); last = p; }
  }
  return { id: k.id, t0: k.t0, t1: k.t1, anchor: k.mode, shape: strokeName(k), from: k.from, to: k.to, encloses: k.encloses, crosses: k.crosses, drawnAt: { level: lvCode(k.level), rot: k.rot }, over: k.cs.map(e => [e.t, ...e.cell, e.what]), points: pts };
}
function turnJSON(tn) {
  const t1 = tn.t1 || mmNow();
  return {
    id: tn.id, t0: tn.t0, t1, text: tn.text != null ? tn.text : turnWords(tn).map(w => w.w).join(' '), intent: tn.intent || null,
    words: turnWords(tn).map(w => [w.w, w.t]),
    segments: tn.segs.map(s => ({ text: s.text, engine: s.eng, firstPartial: s.tFirst, final: s.tFinal || null, confidence: s.conf, latFirstMs: s.latFirst != null ? s.latFirst : null, latFinalMs: s.latFinal != null ? s.latFinal : null, ...(s.span ? { audio: s.span, engineMs: s.engMs } : {}) })),
    refs: tn.refs, strokes: tn.strokes.map(k => k.id), typed: tn.typed,
    voice: MM.vad.filter(([a, b]) => (b || t1) >= tn.t0 - LEAD && a <= t1),
    dwells: dwellsIn(tn), pointer: MM.ptr.filter(s => s.t >= tn.t0 - LEAD && s.t <= t1).map(s => [s.t, s.w, s.see, s.pick, s.cable])
  };
}
function streamJSON() {
  return {
    schema: 'stratum.stream/0.1',
    about: 'You talking, pointing and sketching over the city, on one clock (ms since page load). Word times are estimated from when each word first appeared in a partial transcript, less the measured lag (Moonshine segments also give the audio span the engine heard, segments[].audio). Cells are [x, y, z] with z the level index (L0 = 2); points are continuous world coordinates in cells and levels.',
    now: mmNow(), seed: S.seed, size: [W, D, NL],
    view: { mode: S.mode, level: lvCode(S.level), rot: S.rot, zoom: S.zoom },
    engine: ENGINES[MIC.eng].name, moonshinePassMs: median(MOON.pass),
    latency: Object.fromEntries(Object.entries(MM.lat).map(([e, l]) => [e, { firstPartialMs: median(l.first), finalMs: median(l.final), n: [l.first.length, l.final.length] }])),
    turns: MM.turns.map(turnJSON), strokes: MM.strokes.map(strokeJSON),
    pointerKey: ['t', 'world point', 'visible cell + type', 'active-level cell + type', 'cable'],
    pointer: MM.ptr.slice(-1200).map(s => [s.t, s.w, s.see, s.pick, s.cable]), dwells: MM.dwells.slice(-200)
  };
}
function exportStream() {
  const blob = new Blob([JSON.stringify(streamJSON(), null, 1)], { type: 'application/json' }), a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `stratum-stream-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

const MIC_ICON = ['..XXXXX..', '.XWWWWWX.', '.XWWWWWX.', '.XWWWWWX.', '.XWWWWWX.', 'X.XWWWX.X', 'X..XXX..X', '.X.....X.', '..XXXXX..', '....X....', '....X....', '..XXXXX..'];
function setupSense() {
  const st = $('stage'), mg = $('bMic').querySelector('canvas').getContext('2d');
  MIC_ICON.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== '.') { mg.fillStyle = ch === 'W' ? '#5a5f66' : '#e6dfcf'; mg.fillRect(x, y, 1, 1); } }));
  st.addEventListener('pointermove', e => { const r = st.getBoundingClientRect(); MM.css = [e.clientX - r.left, e.clientY - r.top]; });
  st.addEventListener('pointerleave', () => { MM.css = null; MM.key = ''; MM.ptr.push({ t: mmNow(), x: -1, y: -1, w: null, see: null, pick: null, cable: null }); });
  $('bMic').onclick = () => { if (MIC.on) micStop(); else micStart(false); };
  $('bExport').onclick = () => exportStream();
  const sel = $('micEng').querySelector('select');
  for (const [id, e] of Object.entries(ENGINES)) if (isMoon(id) || (SRC && (id !== 'local' || 'processLocally' in SRC.prototype))) sel.add(new Option(e.name, id));
  let saved = null; try { saved = localStorage.getItem('stratum.speech'); if (window.crossOriginIsolated) sessionStorage.removeItem('stratum.coi'); } catch (e) { /* no storage: default engine */ }
  if (saved && ENGINES[saved] && [...sel.options].some(o => o.value === saved)) MIC.eng = saved;
  sel.value = MIC.eng;
  sel.onchange = () => engPick(sel.value);
  if (isMoon()) engPick(MIC.eng, true);   // a remembered Moonshine choice starts loading at once
  engDom();
  window.addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('input, textarea, select')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.code === 'Space') { e.preventDefault(); if (!e.repeat && !MIC.on) micStart(true); return; }
    if (k_lower(e) === 'n') { setTool('sketch'); e.preventDefault(); }
    else if ((e.key === 'Backspace' || e.key === 'Delete') && S.tool === 'sketch' && !CARDJOB && !WIRES.hover) { inkUndo(); e.preventDefault(); }
  });
  window.addEventListener('keyup', e => { if (e.code === 'Space' && MIC.on && MIC.ptt) micStop(); });
  setInterval(() => { samplePtr(); turnTick(); if (MM.turn && MM.turn.li) drawTurnStrip(MM.turn.li.querySelector('canvas'), MM.turn); caption(); }, 100);
  (function meter() { micMeter(); requestAnimationFrame(meter); })();
}
