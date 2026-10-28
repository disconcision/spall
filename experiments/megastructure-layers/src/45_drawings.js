// ==========================================================================
// Drawing views: PLAN (architect's floor plan on paper) and SECTION
// (SimTower-like cutaway with datum markers, beyond-elevation, key plan).
// ==========================================================================
const PS = 12, PM = 32, PB = 56;
const PLAN = { c: null };
const PAPER = { bg: '#dbd4c1', grid: '#cec6b1', grid2: '#b9b09a', ink: '#23201c', ink2: '#4b453d', infill: '#cfc6b0', circ: '#e7c77e', circ2: '#9c7a37',
  green: '#b6c39b', green2: '#56733f', water: '#a8c3ba', water2: '#6b958b', below: '#cac2ac', above: '#5f584e', street: '#c9c1ab', walk: '#d2cab5' };
function planSize() { return [W * PS + PM * 2, D * PS + PM + PB]; }
function sheetX(pw) { const cx = (S.safeL + S.cssW - S.safeR) / 2 / S.zoom; return pw <= S.bw ? clamp(Math.round(cx - pw / 2), Math.min(Math.round(S.safeL / S.zoom), S.bw - pw), S.bw - pw) : Math.round(S.bw / 2 - pw / 2); }
function planOrigin() { const [pw, ph] = planSize(); return [sheetX(pw) - Math.round(S.planCam.x), Math.round(S.bh / 2 - ph / 2 - S.planCam.y)]; }
function projPlan(px, py) { const o = planOrigin(), r = toRotF(px, py); return [o[0] + PM + r[0] * PS, o[1] + PM + r[1] * PS]; }
function pickPlan(bx, by) {
  const o = planOrigin(), U = Math.floor((bx - o[0] - PM) / PS), V = Math.floor((by - o[1] - PM) / PS);
  if (U < 0 || V < 0 || U >= W || V >= D) return null;
  const p = fromRot(U, V);
  return { x: p[0], y: p[1], z: S.level, t: cellR(U, V, S.level), u: U, v: V };
}
function hatchRect(g, X, Y, w, h, col, step, cross) {
  g.fillStyle = col;
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
    const ax = X + xx, ay = Y + yy;
    if (((ax + ay) % step) === 0 || (cross && ((ax - ay + 1000) % step) === 0)) g.fillRect(ax, ay, 1, 1);
  }
}
function treeSymbol(g, cx, cy, r, col, fill) {
  g.fillStyle = fill;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r) g.fillRect(cx + dx, cy + dy, 1, 1);
  g.fillStyle = col;
  for (let k = 0; k < 20; k++) { const a = k / 20 * Math.PI * 2, rr2 = r + ((k & 1) ? 0.6 : -0.3); g.fillRect(Math.round(cx + Math.cos(a) * rr2), Math.round(cy + Math.sin(a) * rr2), 1, 1); }
  g.fillRect(cx, cy, 1, 1);
}
function drawPlanCell(g, t, x, y, z, X, Y) {
  const vv = vars[idx(x, y, z)], ax = screenAxis(vv & 1), s = PS, h = PS >> 1, q = PS >> 2;
  const cx = X + h, cy = Y + h;
  const along = (a, b, w, col) => { if (ax === 0) R_(g, X + a, cy + b, w, 1, col); else R_(g, cx + b, Y + a, 1, w, col); };
  switch (t) {
    case T.EARTH: case T.ROCK: {
      R_(g, X, Y, s, s, t === T.ROCK ? '#b9ae97' : '#c3b8a0'); g.fillStyle = '#7a6b55';
      for (let k = 0; k < 4; k++) { const hh = hash3(x, y, k + z * 7); g.fillRect(X + (hh % s), Y + ((hh >> 5) % s), 1, 1); }
      break;
    }
    case T.CORE: R_(g, X, Y, s, s, PAPER.ink); break;
    case T.LIFT: R_(g, X, Y, s, s, PAPER.ink); R_(g, X + 2, Y + 2, s - 4, s - 4, PAPER.bg); pline(g, X + 2, Y + 2, X + s - 3, Y + s - 3, PAPER.ink); pline(g, X + s - 3, Y + 2, X + 2, Y + s - 3, PAPER.ink); break;
    case T.PILLAR: case T.VAULT: if (t === T.VAULT && z === 0) R_(g, X, Y, s, s, PAPER.water); R_(g, X + q + 1, Y + q + 1, h - 2, h - 2, PAPER.ink); break;
    case T.FRAME: for (const [a, b] of [[0, 0], [s - 3, 0], [0, s - 3], [s - 3, s - 3]]) R_(g, X + a, Y + b, 3, 3, PAPER.ink); break;
    case T.TRUSS: pline(g, X, Y, X + s - 1, Y + s - 1, PAPER.ink2); pline(g, X + s - 1, Y, X, Y + s - 1, PAPER.ink2); R_(g, X, Y, s, 1, PAPER.ink2); R_(g, X, Y + s - 1, s, 1, PAPER.ink2); break;
    case T.CAPSULE:
      R_(g, X + 1, Y + 1, s - 2, s - 2, PAPER.infill); hatchRect(g, X + 1, Y + 1, s - 2, s - 2, PAPER.ink2, 3, false);
      R_(g, X + 1, Y + 1, s - 2, 1, PAPER.ink2); R_(g, X + 1, Y + s - 2, s - 2, 1, PAPER.ink2); R_(g, X + 1, Y + 1, 1, s - 2, PAPER.ink2); R_(g, X + s - 2, Y + 1, 1, s - 2, PAPER.ink2);
      for (const [a, b] of [[0, 0], [s - 2, 0], [0, s - 2], [s - 2, s - 2]]) R_(g, X + a, Y + b, 2, 2, PAPER.ink);
      break;
    case T.OLD: R_(g, X, Y, s, s, PAPER.infill); hatchRect(g, X, Y, s, s, '#7a6a58', 4, true); break;
    case T.STREET: {
      R_(g, X, Y, s, s, PAPER.street);
      const mark = (vv >> 1) & 7;
      if (mark === 1) along(2, 0, s - 4, '#8f836b');
      if (mark === 2) for (let k = 1; k < s; k += 3) { if (ax === 0) R_(g, X + k, Y + 2, 2, s - 4, '#f1ecdf'); else R_(g, X + 2, Y + k, s - 4, 2, '#f1ecdf'); }
      if (mark === 3) { R_(g, X + q, Y + q, h, h, PAPER.ink2); for (let k = X + q + 1; k < X + q + h; k += 2) R_(g, k, Y + q, 1, h, PAPER.street); }
      if (mark === 4) treeSymbol(g, cx, cy, 2, PAPER.ink2, PAPER.street);
      break;
    }
    case T.WALK: R_(g, X, Y, s, s, PAPER.walk); R_(g, X, Y, 1, 1, '#b8af98'); R_(g, cx, cy, 1, 1, '#b8af98'); R_(g, X + h, Y, 1, 1, '#c6bea9'); R_(g, X, Y + h, 1, 1, '#c6bea9'); break;
    case T.DECK: R_(g, X, Y, s, s, PAPER.circ); for (let k = 0; k < s; k += 6) along(k, 0, 3, PAPER.circ2); break;
    case T.TUBE: R_(g, X, Y, s, s, '#ecd49a'); along(0, -h, s, PAPER.ink2); along(0, h - 1, s, PAPER.ink2); along(0, -h + 2, s, '#c9b27a'); along(0, h - 3, s, '#c9b27a'); along(3, 0, 5, PAPER.circ2); break;
    case T.ROOFWALK: R_(g, X, Y, s, s, '#d8b98a'); for (let k = 1; k < s; k += 3) { if (ax === 0) R_(g, X + k, Y + 2, 1, s - 4, '#a88257'); else R_(g, X + 2, Y + k, s - 4, 1, '#a88257'); } break;
    case T.TERRACE: R_(g, X, Y, s, s, PAPER.green); R_(g, X + 2, Y + s - 4, 1, 1, PAPER.green2); R_(g, X + s - 4, Y + 3, 1, 1, PAPER.green2); R_(g, cx, cy, 1, 1, PAPER.green2); break;
    case T.TREE: R_(g, X, Y, s, s, PAPER.green); treeSymbol(g, cx, cy, h - 1, PAPER.green2, '#9fb384'); break;
    case T.WATER: R_(g, X, Y, s, s, PAPER.water); for (const [a, b] of [[1, 3], [5, 6], [2, 9]]) { R_(g, X + a, Y + b, 3, 1, PAPER.water2); R_(g, X + a + 3, Y + b - 1, 2, 1, PAPER.water2); } break;
    case T.PIPE: along(0, -q, s, '#9b5a38'); along(0, q, s, '#58726d'); along(0, 0, s, '#8a8a82'); break;
    case T.TANK: treeSymbol(g, cx, cy, h - 1, PAPER.ink, '#bdb4a0'); treeSymbol(g, cx, cy, 2, PAPER.ink2, '#bdb4a0'); break;
    case T.VENT: R_(g, X + q, Y + q, h, h, PAPER.ink2); R_(g, X + q + 1, Y + q + 1, h - 2, h - 2, PAPER.bg); for (let k = Y + q + 2; k < Y + q + h - 1; k += 2) R_(g, X + q + 1, k, h - 2, 1, PAPER.ink2); break;
    case T.CANOPY: for (let k = 0; k < s; k += 2) { R_(g, X + k, Y, 1, 1, '#5a6b7c'); R_(g, X, Y + k, 1, 1, '#5a6b7c'); R_(g, X + k, cy, 1, 1, '#8796a5'); } R_(g, cx - 1, cy - 1, 3, 3, '#5a6b7c'); break;
    case T.ANTENNA: case T.LAMP: treeSymbol(g, cx, cy, 2, PAPER.ink, PAPER.bg); R_(g, cx, cy, 1, 1, t === T.LAMP ? '#c9861c' : PAPER.ink); break;
    case T.CRANE: R_(g, X - s, Y, s * 3, 1, PAPER.ink); R_(g, X - s, Y + s - 1, s * 3, 1, PAPER.ink); pline(g, X - s, Y, X + 2 * s - 1, Y + s - 1, PAPER.ink2); R_(g, X + q, Y + q, h, h, PAPER.ink); break;
    case T.RISER: R_(g, X + 2, Y + 3, 2, 2, '#9b5a38'); R_(g, X + 5, Y + 6, 2, 2, '#58726d'); R_(g, X + 8, Y + 3, 2, 2, PAPER.ink2); break;
  }
}
function buildPlan() {
  const [pw, ph] = planSize();
  if (!PLAN.c || PLAN.c.width !== pw || PLAN.c.height !== ph) PLAN.c = mk(pw, ph);
  const g = PLAN.c.getContext('2d'), z = S.level;
  R_(g, 0, 0, pw, ph, PAPER.bg);
  const rnd = mulberry32(7); g.fillStyle = 'rgba(110,90,60,0.07)';
  for (let k = 0; k < 1800; k++) g.fillRect(rnd() * pw | 0, rnd() * ph | 0, 1, 1);
  for (let i = 0; i <= W; i++) for (let k = 0; k <= D * PS; k += 2) {
    g.fillStyle = i % 8 === 0 ? PAPER.grid2 : PAPER.grid;
    if (i % 8 === 0 || k % 8 === 0) { g.fillRect(PM + i * PS, PM + k, 1, 1); g.fillRect(PM + k, PM + i * PS, 1, 1); }
  }
  if (z > 0) for (let v = 0; v < D; v++) for (let u = 0; u < W; u++) {
    const t = cellR(u, v, z - 1);
    if (t && t !== T.EARTH && t !== T.ROCK) R_(g, PM + u * PS, PM + v * PS, PS, PS, PAPER.below);
  }
  for (let v = 0; v < D; v++) for (let u = 0; u < W; u++) {
    const t = cellR(u, v, z); if (!t) continue;
    const p = fromRot(u, v);
    drawPlanCell(g, t, p[0], p[1], z, PM + u * PS, PM + v * PS);
  }
  // cut lines: heavy ink on boundaries of poché masses
  const solid = n => n && TI[n].poche;
  g.fillStyle = PAPER.ink;
  for (let v = 0; v < D; v++) for (let u = 0; u < W; u++) {
    if (!solid(cellR(u, v, z))) continue;
    const X = PM + u * PS, Y = PM + v * PS;
    if (!solid(cellR(u, v - 1, z))) g.fillRect(X, Y, PS, 1);
    if (!solid(cellR(u, v + 1, z))) g.fillRect(X, Y + PS - 1, PS, 1);
    if (!solid(cellR(u - 1, v, z))) g.fillRect(X, Y, 1, PS);
    if (!solid(cellR(u + 1, v, z))) g.fillRect(X + PS - 1, Y, 1, PS);
  }
  // overhead (level above): dashed outlines — plan convention for things above the cut
  if (z < NL - 1) {
    const a = n => !!n;
    g.fillStyle = PAPER.above;
    for (let v = 0; v < D; v++) for (let u = 0; u < W; u++) {
      if (!a(cellR(u, v, z + 1))) continue;
      const X = PM + u * PS, Y = PM + v * PS;
      for (let k = 0; k < PS; k++) {
        if (((X + Y + k) % 5) > 2) continue;
        if (!a(cellR(u, v - 1, z + 1))) g.fillRect(X + k, Y, 1, 1);
        if (!a(cellR(u, v + 1, z + 1))) g.fillRect(X + k, Y + PS - 1, 1, 1);
        if (!a(cellR(u - 1, v, z + 1))) g.fillRect(X, Y + k, 1, 1);
        if (!a(cellR(u + 1, v, z + 1))) g.fillRect(X + PS - 1, Y + k, 1, 1);
      }
    }
  }
  // voids: light wells marked with the "open to below" cross
  for (const w of WORLD.wells) {
    const r0 = toRot(w.x, w.y), r1 = toRot(w.x + w.s - 1, w.y + w.s - 1);
    const u0 = Math.min(r0[0], r1[0]), v0 = Math.min(r0[1], r1[1]), X = PM + u0 * PS, Y = PM + v0 * PS, s = w.s * PS - 1;
    if (z > 0 && cell(w.x, w.y, z) === 0) { pline(g, X, Y, X + s, Y + s, PAPER.ink2); pline(g, X + s, Y, X, Y + s, PAPER.ink2); }
    g.fillStyle = PAPER.ink2; g.fillRect(X, Y, s + 1, 1); g.fillRect(X, Y + s, s + 1, 1); g.fillRect(X, Y, 1, s + 1); g.fillRect(X + s, Y, 1, s + 1);
  }
  // grid bubbles
  const FS = S.zoom === 1 ? 2 : 1, br = FS === 2 ? 8 : 5;
  for (let k = 0; k <= W; k += 8) {
    const X = PM + k * PS, lab = String.fromCharCode(65 + k / 8), lab2 = String(1 + k / 8);
    treeSymbol(g, X, PM - 13, br, PAPER.ink, PAPER.bg); ptext(g, lab, X - 1 - (FS - 1) * 2, PM - 15 - (FS - 1) * 3, PAPER.ink, null, FS);
    treeSymbol(g, PM - 13, PM + k * PS, br, PAPER.ink, PAPER.bg); ptext(g, lab2, PM - 14 - (FS - 1) * 2, PM + k * PS - 2 - (FS - 1) * 3, PAPER.ink, null, FS);
    for (let q = PM - 13 + br; q < PM; q += 2) { g.fillRect(X, q, 1, 1); g.fillRect(q, PM + k * PS, 1, 1); }
  }
  // north arrow + title block
  const nx = pw - PM + 12, ny = PM + 8, dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]], d = dirs[S.rot];
  treeSymbol(g, nx, ny, 6, PAPER.ink, PAPER.bg);
  pline(g, nx - d[0] * 5, ny - d[1] * 5, nx + d[0] * 5, ny + d[1] * 5, PAPER.ink);
  R_(g, nx + d[0] * 5 - 1, ny + d[1] * 5 - 1, 3, 3, PAPER.ink);
  ptext(g, 'N', nx + d[0] * 10 - 1, ny + d[1] * 10 - 2, PAPER.ink);
  const ty = PM + D * PS + 6, lh = 7 * FS;
  R_(g, PM, ty, W * PS, 1, PAPER.ink); R_(g, PM, ty + 3 * lh + 8, W * PS, 1, PAPER.ink);
  ptext(g, 'PLAN ' + lvCode(z) + ' ' + LEVELS[z].name, PM + 2, ty + 4, PAPER.ink, null, FS);
  ptext(g, 'CUT +' + (HT / LH * 3.6).toFixed(1) + 'M  FILL ' + Math.round(WORLD.fill[z] * 100) + '%' + (WORLD.fill[z] > 0.5 ? ' OVER CAP' : ''), PM + 2, ty + 5 + lh, WORLD.fill[z] > 0.5 ? '#9b2e1c' : PAPER.ink2, null, FS);
  let lx = PM + 2;
  const key = [['SUPPORT', PAPER.ink], ['INFILL', PAPER.infill], ['CIRC', PAPER.circ], ['GREEN', PAPER.green], ['WATER', PAPER.water]], ky = ty + 6 + lh * 2;
  for (const [nm, c] of key) { R_(g, lx, ky, 6, 6, c); R_(g, lx, ky, 6, 1, PAPER.ink); if (nm === 'INFILL') hatchRect(g, lx, ky, 6, 6, PAPER.ink2, 3); ptext(g, nm, lx + 8, ky + 1, PAPER.ink2); lx += 12 + ptextW(nm) + 4; }
  for (let k = 0; k < 10; k += 2) R_(g, lx + k, ky + 3, 1, 1, PAPER.above); ptext(g, 'ABOVE', lx + 12, ky + 1, PAPER.ink2);
  const sb = PM + W * PS - 66;
  for (let k = 0; k < 4; k++) R_(g, sb + k * 16, ty + 5, 16, 3, k & 1 ? PAPER.bg : PAPER.ink);
  R_(g, sb, ty + 5, 64, 1, PAPER.ink); R_(g, sb, ty + 7, 64, 1, PAPER.ink);
  ptext(g, '0', sb, ty + 11, PAPER.ink); ptext(g, '32M', sb + 54, ty + 11, PAPER.ink);
  ptext(g, 'A-1' + String(z).padStart(2, '0'), sb, ty + 20, PAPER.ink, null, FS);
  planDirty = false;
}

// ---------------------------------------------------------------- section
const SCW = 8, SCH = 12, SML = 44, SMT = 34, SMB = 70;
const SEC = { c: null };
function secSize() { return [W * SCW + SML + 12, NL * SCH + SMT + SMB]; }
function secOrigin() { const [sw, sh] = secSize(); return [sheetX(sw) - Math.round(S.secCam.x), Math.round(S.bh / 2 - sh / 2 - S.secCam.y)]; }
function secXY(a) { return S.secAxis === 'x' ? [a, S.secIdx] : [S.secIdx, D - 1 - a]; }
function secDir() { return S.secAxis === 'x' ? [0, 1] : [1, 0]; }
function secA(px, py) { return S.secAxis === 'x' ? px : D - py; }
function projSec(px, py, pz) { const o = secOrigin(); return [o[0] + SML + secA(px, py) * SCW, o[1] + SMT + (NL - pz) * SCH]; }
function secDepth(px, py) { return S.secAxis === 'x' ? py - (S.secIdx + 0.5) : px - (S.secIdx + 0.5); }
function pickSec(bx, by) {
  const o = secOrigin(), a = Math.floor((bx - o[0] - SML) / SCW), zr = Math.floor((by - o[1] - SMT) / SCH);
  if (a < 0 || a >= W || zr < 0 || zr >= NL) return null;
  const z = NL - 1 - zr, [x, y] = secXY(a);
  return { x, y, z, t: cell(x, y, z), a };
}
function secCol(hex, z, x, y) { return shadeRGB(hex, 'l', lightQ(idx(x, y, z))); }
function drawSecCut(g, t, x, y, z, X, Y) {
  const vv = vars[idx(x, y, z)], h = hash3(x, y, z), lit = (h & 255) / 256 < TODS[S.tod].lit;
  const C = hex => secCol(hex, z, x, y), B = Y + SCH;
  switch (t) {
    case T.EARTH: case T.ROCK: R_(g, X, Y, SCW, SCH, t === T.ROCK ? '#3b3835' : '#4f3f31'); g.fillStyle = t === T.ROCK ? '#57534e' : '#6d5843'; for (let k = 0; k < 5; k++) g.fillRect(X + ((h >> (k * 3)) & 7), Y + ((h >> (k * 4 + 2)) % 12), 1, 1); break;
    case T.CORE: R_(g, X, Y, SCW, SCH, '#2a2724'); g.fillStyle = '#3d3934'; for (let k = 0; k < SCW + SCH; k += 4) for (let q = 0; q < SCW; q++) { const yy = k - q; if (yy >= 0 && yy < SCH) g.fillRect(X + q, Y + yy, 1, 1); } break;
    case T.LIFT: R_(g, X, Y, SCW, SCH, '#0f0f10'); R_(g, X + 1, Y, 1, SCH, '#3a3835'); R_(g, X + 6, Y, 1, SCH, '#3a3835'); break;
    case T.OLD: {
      const M = OLDM[vv & 3];
      R_(g, X, Y, SCW, SCH, lit && S.tod !== 'day' ? '#c38a45' : C(mixHex(M[1], '#2a2420', 0.55)));
      R_(g, X + 2, Y + 3, 3, 4, lit ? '#ffd27a' : C('#4d5a5e'));
      R_(g, X, B - 2, SCW, 2, '#1d1915');
      if (cell(x, y, z + 1) !== T.OLD) R_(g, X, Y, SCW, 2, '#1d1915');
      const [ax, ay] = S.secAxis === 'x' ? [1, 0] : [0, -1];
      if (cell(x - ax, y - ay, z) !== T.OLD) R_(g, X, Y, 1, SCH, '#1d1915');
      if (cell(x + ax, y + ay, z) !== T.OLD) R_(g, X + SCW - 1, Y, 1, SCH, '#1d1915');
      break;
    }
    case T.CAPSULE: case T.FRAME: {
      R_(g, X, B - 1, SCW, 1, '#6f695e'); R_(g, X, Y, 1, SCH, C('#9a9283')); R_(g, X + SCW - 1, Y, 1, SCH, C('#9a9283'));
      if (t === T.FRAME) { R_(g, X, Y, SCW, 1, C('#9a9283')); break; }
      const Cc = CAPC[vv & 3];
      R_(g, X + 1, Y + 2, 6, 9, C(Cc[1])); R_(g, X + 2, Y + 3, 4, 7, lit && S.tod !== 'day' ? '#d8a052' : C(mixHex(Cc[2], '#1a1a1a', 0.5)));
      R_(g, X + 3, Y + 4, 2, 2, lit ? '#ffe0a0' : C('#6d7c80')); R_(g, X + 1, Y + 2, 1, 1, C('#3a3632')); R_(g, X + 6, Y + 2, 1, 1, C('#3a3632'));
      if (lit && (h & 3) === 0) R_(g, X + 4, Y + 8, 1, 2, '#3b2a20');
      break;
    }
    case T.DECK: R_(g, X, B - 3, SCW, 3, '#1c1a18'); R_(g, X, B - 4, SCW, 1, '#cfa645'); break;
    case T.ROOFWALK: R_(g, X, B - 2, SCW, 2, '#5c4631'); R_(g, X, B - 6, SCW, 1, '#5c4631'); R_(g, X + 3, B - 6, 1, 4, '#5c4631'); break;
    case T.TUBE: R_(g, X, B - 2, SCW, 2, '#1c1a18'); R_(g, X, Y + 3, SCW, 1, '#2c3234'); R_(g, X, Y + 4, SCW, B - Y - 6, 'rgba(150,196,190,0.22)'); if (S.tod !== 'day') R_(g, X, Y + 4, SCW, 1, 'rgba(255,214,150,0.5)'); break;
    case T.STREET: R_(g, X, B - 3, SCW, 3, '#48443e'); R_(g, X, B - 3, SCW, 1, '#6a655c'); if ((vv >> 1 & 7) === 3) R_(g, X + 2, B - 3, 4, 3, '#151413'); break;
    case T.WALK: R_(g, X, B - 3, SCW, 3, '#7c766b'); break;
    case T.TERRACE: case T.TREE: R_(g, X, B - 3, SCW, 3, '#5b4631'); R_(g, X, B - 3, SCW, 1, C('#6f9b4a')); break;
    case T.WATER: R_(g, X, B - 5, SCW, 5, '#23504b'); R_(g, X, B - 5, SCW, 1, '#3f7d73'); break;
    case T.VAULT: if (z === 0) { R_(g, X, B - 5, SCW, 5, '#23504b'); R_(g, X, B - 5, SCW, 1, '#3f7d73'); } R_(g, X + 3, Y, 2, SCH, '#7d604c'); R_(g, X + 2, Y, 4, 1, '#7d604c'); break;
    case T.PILLAR: R_(g, X + 3, Y, 2, SCH, '#1c1a18'); if (vv & 1) R_(g, X + 1, B - 2, 6, 2, '#1c1a18'); break;
    case T.TRUSS: R_(g, X, Y, SCW, 2, '#3d4246'); R_(g, X, B - 2, SCW, 2, '#3d4246'); pline(g, X, Y + 2, X + 7, B - 3, '#565d61'); pline(g, X + 7, Y + 2, X, B - 3, '#565d61'); break;
    case T.PIPE: { const along = (vv & 1) === (S.secAxis === 'x' ? 0 : 1); if (along) { R_(g, X, Y + 4, SCW, 2, '#9b5a38'); R_(g, X, Y + 7, SCW, 2, '#8a8a82'); } else { R_(g, X + 1, Y + 4, 3, 3, '#9b5a38'); R_(g, X + 4, Y + 7, 3, 3, '#58726d'); } break; }
    case T.TANK: R_(g, X + 1, Y + 2, 6, 10, '#7e6f54'); R_(g, X + 1, Y + 2, 6, 1, '#9c8a6a'); R_(g, X + 2, Y + 4, 1, 7, '#9c8a6a'); break;
    case T.VENT: R_(g, X + 2, B - 6, 4, 6, '#6a6964'); R_(g, X + 2, B - 5, 4, 1, '#4a4a47'); R_(g, X + 2, B - 3, 4, 1, '#4a4a47'); break;
    case T.CANOPY: R_(g, X, Y, SCW, 2, '#2b3440'); R_(g, X, Y, SCW, 1, '#5d6d80'); if (vv & 1) R_(g, X + 4, Y + 2, 1, SCH - 2, '#3c4145'); break;
    case T.ANTENNA: R_(g, X + 4, Y - 14, 1, SCH + 14, '#8e8f8a'); R_(g, X + 2, Y - 6, 5, 1, '#7b7c77'); break;
    case T.CRANE: R_(g, X + 3, Y - 20, 2, SCH + 20, '#d4a13a'); R_(g, X - 16, Y - 20, 30, 2, '#d4a13a'); R_(g, X - 12, Y - 18, 1, 14, '#46423b'); R_(g, X - 15, Y - 4, 7, 5, '#c0663f'); break;
    case T.RISER: R_(g, X + 2, Y, 1, SCH, '#9b5a38'); R_(g, X + 4, Y, 1, SCH, '#58726d'); R_(g, X + 6, Y, 1, SCH, '#8d8b83'); break;
    case T.LAMP: R_(g, X + 4, Y + 2, 1, SCH - 2, '#3d3f40'); R_(g, X + 3, Y + 1, 3, 1, S.tod === 'day' ? '#d9d2c0' : '#ffe2a2'); break;
  }
}
const SEC_BASE = { 1: '#5a4838', 2: '#4a4744', 3: '#2b5853', 4: '#57524b', 5: '#8a8377', 6: '#9c5c43', 7: '#a09989', 8: '#a09989', 9: '#565d61', 10: '#8a8478',
  11: '#6f8f8b', 12: '#8f887b', 13: '#b6ae9b', 14: '#5d893d', 15: '#3f7236', 16: '#9d9687', 17: '#7c5a44', 18: '#7e6f54', 19: '#6a6964', 20: '#2b3440',
  21: '#6b5035', 22: '#8e8f8a', 23: '#d4a13a', 24: '#8a6a55', 25: '#7c6a5a', 26: '#3d3f40' };
function drawSecBeyond(g, t, x, y, z, X, Y, d, fog) {
  const f = 0.28 + 0.6 * (d / 16);
  let base = SEC_BASE[t] || '#777777';
  if (t === T.OLD) base = OLDM[vars[idx(x, y, z)] & 3][1];
  if (t === T.CAPSULE) base = CAPC[vars[idx(x, y, z)] & 3][1];
  const col = mixHex(shadeRGBhex(base, lightQ(idx(x, y, z))), fog, f), B = Y + SCH;
  const slab = TI[t].slab;
  if (t === T.TREE) { R_(g, X + 1, Y - 2, 6, 8, col); R_(g, X, Y, 8, 4, col); R_(g, X + 3, Y + 6, 2, 6, col); return; }
  if (t === T.FRAME || t === T.TRUSS || t === T.PILLAR || t === T.VAULT || t === T.RISER || t === T.ANTENNA || t === T.LAMP) { R_(g, X + 3, Y, 2, SCH, col); if (t === T.FRAME || t === T.TRUSS) R_(g, X, Y, SCW, 1, col); return; }
  if (t === T.CANOPY) { R_(g, X, Y, SCW, 2, col); return; }
  if (slab || t === T.PIPE) { R_(g, X, B - 3, SCW, 3, col); return; }
  R_(g, X, Y, SCW, SCH, col);
  if ((t === T.OLD || t === T.CAPSULE) && (hash3(x, y, z) & 255) / 256 < TODS[S.tod].lit && S.tod !== 'day') R_(g, X + 3, Y + 4, 2, 2, mixHex('#ffcf73', fog, f * 0.6));
  else if (t === T.OLD || t === T.CAPSULE || t === T.CORE) R_(g, X + 3, Y + 4, 2, 2, mixHex(col, '#000000', 0.25));
}
function shadeRGBhex(hex, q) { const c = rgbOf(hex), m = TODS[S.tod].l, k = LQ[q]; return hexOf(c[0] * m[0] * k, c[1] * m[1] * k, c[2] * m[2] * k); }
function buildSection() {
  const [sw, sh] = secSize();
  if (!SEC.c || SEC.c.width !== sw || SEC.c.height !== sh) SEC.c = mk(sw, sh);
  const g = SEC.c.getContext('2d'), cols = SKYCOL[S.tod], dir = secDir();
  const groundY = SMT + (NL - G) * SCH;
  for (let y = 0; y < groundY; y++) {
    const f = y / groundY * (cols.length - 1), k = Math.min(cols.length - 2, Math.floor(f)), fr = f - k;
    g.fillStyle = cols[k]; g.fillRect(0, y, sw, 1);
    if (fr > 0.02) { g.fillStyle = cols[k + 1]; for (let x = 0; x < sw; x++) if (fr * 16 > BAYER[(x & 3) + (y & 3) * 4]) g.fillRect(x, y, 1, 1); }
  }
  R_(g, 0, groundY, sw, sh - groundY, '#1a1512');
  const fogUp = cols[Math.min(cols.length - 1, 2)], fogDown = '#1a1512';
  const trees = [];
  for (let a = 0; a < W; a++) for (let z = 0; z < NL; z++) {
    const [x, y] = secXY(a), t = cell(x, y, z), X = SML + a * SCW, Y = SMT + (NL - 1 - z) * SCH;
    if (t) { drawSecCut(g, t, x, y, z, X, Y); if (t === T.TREE) trees.push([X, Y, x, y, z]); continue; }
    for (let d = 1; d <= 16; d++) {
      const xx = x + dir[0] * d, yy = y + dir[1] * d;
      if (!inb(xx, yy, z)) break;
      const t2 = cell(xx, yy, z);
      if (t2) { drawSecBeyond(g, t2, xx, yy, z, X, Y, d, z < G ? fogDown : fogUp); break; }
    }
  }
  for (const [X, Y, x, y, z] of trees) {
    const C = hex => secCol(hex, z, x, y), sp = hash3(x, y, z) & 3;
    R_(g, X + 3, Y + 2, 2, 8, C('#5a4030'));
    R_(g, X - 1, Y - 5, 10, 6, C('#3f7236')); R_(g, X, Y - 7, 8, 9, C('#3f7236')); R_(g, X + 1, Y - 7, 3, 3, C('#6f9f4a')); R_(g, X + 5, Y - 2, 3, 3, C('#2d5a2a'));
    if (sp === 3) { R_(g, X + 2, Y - 4, 1, 1, '#e6a07a'); R_(g, X + 6, Y - 6, 1, 1, '#e6a07a'); }
  }
  // light wells crossing the section plane: void column with a daylight wash
  for (const w of WORLD.wells) {
    const inPlane = S.secAxis === 'x' ? (S.secIdx >= w.y && S.secIdx < w.y + w.s) : (S.secIdx >= w.x && S.secIdx < w.x + w.s);
    if (!inPlane) continue;
    const a0 = S.secAxis === 'x' ? w.x : D - (w.y + w.s), X0 = SML + a0 * SCW, X1 = X0 + w.s * SCW;
    g.fillStyle = S.tod === 'night' ? 'rgba(160,190,200,0.10)' : 'rgba(255,232,190,0.16)';
    g.fillRect(X0, SMT, X1 - X0, NL * SCH - 4);
    for (let y = SMT; y < SMT + NL * SCH; y += 3) { R_(g, X0, y, 1, 1, 'rgba(255,240,210,0.7)'); R_(g, X1 - 1, y, 1, 1, 'rgba(255,240,210,0.7)'); }
    ptext(g, 'LIGHT WELL', X0 + 2, SMT - 9, '#e6dfcf');
  }
  // cistern arches
  const cols1 = [];
  for (let a = 0; a < W; a++) { const [x, y] = secXY(a); if (cell(x, y, 1) === T.VAULT) cols1.push(a); }
  for (let k = 0; k + 1 < cols1.length; k++) {
    if (cols1[k + 1] - cols1[k] !== 3) continue;
    const x0 = SML + cols1[k] * SCW + 4, x1 = SML + cols1[k + 1] * SCW + 4, top = SMT + (NL - 2) * SCH;
    for (let px = x0; px <= x1; px++) { const tt = (px - x0) / (x1 - x0), yy = top + Math.round(6 * (1 - Math.pow(2 * tt - 1, 2))); R_(g, px, top, 1, yy - top + 1, '#1a1512'); R_(g, px, yy, 1, 1, '#8a6a55'); }
  }
  // ground line + datums (label margin kept dark for contrast)
  R_(g, 0, 0, SML - 6, sh, '#141516'); R_(g, SML + W * SCW + 4, 0, 8, sh, '#141516'); R_(g, 0, 0, sw, SMT - 12, '#141516');
  R_(g, SML - 6, groundY - 1, W * SCW + 12, 2, '#e6dfcf');
  for (let z = 0; z < NL; z++) {
    const Y = SMT + (NL - z) * SCH, act = z === S.level;
    for (let x = SML; x < SML + W * SCW; x += 3) R_(g, x, Y - 1, 1, 1, act ? 'rgba(232,168,60,0.9)' : 'rgba(230,223,207,0.16)');
    const elev = ((z - G) * 3.6), lab = lvCode(z);
    ptext(g, lab, 4, Y - 7, act ? '#e8a83c' : '#b7b0a2');
    ptext(g, (elev >= 0 ? '+' : '') + elev.toFixed(0), 22, Y - 7, act ? '#e8a83c' : '#7d776c');
    R_(g, SML - 5, Y - 1, 4, 1, act ? '#e8a83c' : '#7d776c');
  }
  const aY = SMT + (NL - 1 - S.level) * SCH;
  R_(g, SML - 3, aY, 2, SCH, '#e8a83c'); R_(g, SML + W * SCW + 1, aY, 2, SCH, '#e8a83c');
  ptext(g, '▽', SML - 12, groundY - 7, '#e6dfcf');
  // title + key plan
  const ty = SMT + NL * SCH + 8;
  R_(g, SML, ty, W * SCW, 1, '#6b665d');
  const dirName = S.secAxis === 'x' ? 'LOOKING S' : 'LOOKING E';
  ptext(g, 'SECTION ' + (S.secAxis === 'x' ? 'A-A  ROW ' : 'B-B  COL ') + S.secIdx + '  ' + dirName, SML, ty + 6, '#e6dfcf');
  ptext(g, 'CUT = POCHE / ROOMS   BEYOND = FADED ELEVATION   , . MOVE   X AXIS', SML, ty + 15, '#8e887c');
  ptext(g, 'SHAFTS: LIFTS IN CORES, LIGHT WELLS, RISERS', SML, ty + 24, '#8e887c');
  const kx = SML + W * SCW - 50, ky = ty + 4;
  R_(g, kx - 1, ky - 1, 50, 50, '#6b665d'); R_(g, kx, ky, 48, 48, '#141516');
  for (let y = 0; y < D; y++) for (let x = 0; x < W; x++) {
    let tt = 0; for (let z = NL - 1; z >= G; z--) { tt = cell(x, y, z); if (tt) break; }
    if (!tt) continue;
    const cat = TI[tt].cat;
    g.fillStyle = tt === T.CORE || tt === T.LIFT ? '#d8d0bf' : cat === 'circ' ? '#9c7a37' : cat === 'land' ? '#4f6d3a' : cat === 'infill' ? '#6a6258' : '#3d3b38';
    g.fillRect(kx + x, ky + y, 1, 1);
  }
  g.fillStyle = '#e2573f';
  if (S.secAxis === 'x') g.fillRect(kx, ky + S.secIdx, 48, 1); else g.fillRect(kx + S.secIdx, ky, 1, 48);
  secDirty = false;
}
