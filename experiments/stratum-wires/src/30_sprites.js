// ==========================================================================
// Pixel sprites: every element type is rasterised by hand (span fills, no AA)
// into small canvases keyed by type/variant/light/cut-mode/mask.
// Local frame: 16 x (20+E); top diamond of a full cube at row E; floor at E+12.
// ==========================================================================
function R_(g, x, y, w, h, c) { g.fillStyle = c; g.fillRect(x, y, w, h); }
function dia(g, x, y, w, c) {
  g.fillStyle = c; const h = w >> 1, hh = h >> 1;
  for (let r = 0; r < h; r++) { const half = r < hh ? (r + 1) * 2 : (h - r) * 2; g.fillRect(x + (w >> 1) - half, y + r, half * 2, 1); }
}
function fL(g, x, y, w, hh, c) { g.fillStyle = c; const n = w >> 1, q = (w >> 2) + 1; for (let i = 0; i < n; i++) g.fillRect(x + i, y + q + (i >> 1), 1, hh); }
function fR(g, x, y, w, hh, c) { g.fillStyle = c; const n = w >> 1; for (let i = 0; i < n; i++) g.fillRect(x + n + i, y + n - (i >> 1), 1, hh); }
function box(g, x, y, w, hh, ct, cl, cr) { dia(g, x, y, w, ct); fL(g, x, y, w, hh, cl); fR(g, x, y, w, hh, cr); }
function pL(g, x, y, w, i, j, c) { g.fillStyle = c; g.fillRect(x + i, y + (w >> 2) + 1 + (i >> 1) + j, 1, 1); }
function pR(g, x, y, w, i, j, c) { g.fillStyle = c; g.fillRect(x + (w >> 1) + i, y + (w >> 1) - (i >> 1) + j, 1, 1); }
function diaEdge(g, x, y, w, which, c) {
  g.fillStyle = c; const n = w >> 1, q = w >> 2;
  for (let i = 0; i < n; i++) {
    const k = i >> 1, xr = x + w - 1 - i;
    if (which & 2) g.fillRect(x + i, y + q - 1 - k, 1, 1);   // back-left
    if (which & 8) g.fillRect(x + i, y + q + k, 1, 1);       // front-left
    if (which & 1) g.fillRect(xr, y + q - 1 - k, 1, 1);      // back-right
    if (which & 4) g.fillRect(xr, y + q + k, 1, 1);          // front-right
  }
}
// point on a top plane (a,b in 0..1 along u,v) of a diamond at (x,y,w)
function tpx(g, x, y, w, a, b, c, pw) { g.fillStyle = c; g.fillRect(Math.floor(x + (w >> 1) + (a - b) * (w >> 1)), Math.floor(y + (a + b) * (w >> 2)), pw || 1, 1); }
function tline(g, x, y, w, a0, b0, a1, b1, c, pw) { const n = 16; for (let k = 0; k <= n; k++) tpx(g, x, y, w, lerp(a0, a1, k / n), lerp(b0, b1, k / n), c, pw); }

const POCHE = {
  support: { ink: '#141312', hat: '#232120', pat: null },
  infill: { ink: '#1c1916', hat: '#4b4238', pat: (x, y) => ((x + y) & 3) === 0 },
  old: { ink: '#1d1915', hat: '#4f3d30', pat: (x, y) => ((x + y) & 3) === 0 || ((x - y) & 3) === 0 },
  earth: { ink: '#231c16', hat: '#51412f', pat: (x, y) => (x & 3) === 0 && (y & 1) === 0 && (((x >> 2) + (y >> 1)) & 1) === 0 }
};
const CUTLINE = '#ece2cc';
function poche(g, x, ty, w, style) {
  const st = POCHE[style]; dia(g, x, ty, w, st.ink); if (!st.pat) return;
  g.fillStyle = st.hat; const h = w >> 1, hh = h >> 1;
  for (let r = 0; r < h; r++) {
    const half = r < hh ? (r + 1) * 2 : (h - r) * 2, x0 = x + (w >> 1) - half;
    for (let xx = x0; xx < x0 + half * 2; xx++) if (st.pat(xx, ty + r)) g.fillRect(xx, ty + r, 1, 1);
  }
}
function cutBlock(g, E, mask, cl, cr, style) {
  const ty = E + 12 - HT;
  fL(g, 0, ty, 16, HT, cl); fR(g, 0, ty, 16, HT, cr);
  poche(g, 0, ty, 16, style);
  diaEdge(g, 0, ty, 16, 15 & ~mask, CUTLINE);
}

function shadeA(hex, face, q, a) {
  const c = rgbOf(hex), m = TODS[S.tod][face], k = LQ[q];
  return `rgba(${clamp(c[0] * m[0] * k | 0, 0, 255)},${clamp(c[1] * m[1] * k | 0, 0, 255)},${clamp(c[2] * m[2] * k | 0, 0, 255)},${a})`;
}
function painter(q) {
  return { t: h => shadeRGB(h, 't', q), l: h => shadeRGB(h, 'l', q), r: h => shadeRGB(h, 'r', q),
    ta: (h, a) => shadeA(h, 't', q, a), la: (h, a) => shadeA(h, 'l', q, a), ra: (h, a) => shadeA(h, 'r', q, a) };
}

const EXTRA = []; EXTRA[T.TREE] = 8; EXTRA[T.ANTENNA] = 24; EXTRA[T.CRANE] = 24;
const DRAW = [];
const OLDM = [['#7c4a39', '#9c5c43', '#784331', '#5a2f22'], ['#a58c62', '#c3a878', '#977e56', '#6e5a3c'],
  ['#697a67', '#83947f', '#5e6c5b', '#44503f'], ['#b2ac9d', '#cec7b5', '#a19a8b', '#7b7568']];
const CAPC = [['#d6cebb', '#b6ae9b', '#908979'], ['#b3643c', '#92502e', '#6f3c23'], ['#678c83', '#53756e', '#3f5954'], ['#ca9c4a', '#a97f38', '#82622a']];

DRAW[T.EARTH] = DRAW[T.ROCK] = (g, v, E, P, m, mask, t) => {
  const rock = t === T.ROCK;
  const ct = rock ? '#5d5954' : '#6c5842', cl = rock ? '#4c4946' : '#5a4838', cr = rock ? '#3b3936' : '#46382b';
  if (m === 1) { cutBlock(g, E, mask, P.l(cl), P.r(cr), 'earth'); return; }
  box(g, 0, E, 16, 12, P.t(ct), P.l(cl), P.r(cr));
  const bl = P.l(rock ? '#43403d' : '#4e3f31'), br = P.r(rock ? '#33312f' : '#3c3025');
  for (let i = 0; i < 8; i++) {
    pL(g, 0, E, 16, i, 3 + (((i + v) % 3 === 0) ? 1 : 0), bl); pL(g, 0, E, 16, i, 8, bl);
    pR(g, 0, E, 16, i, 5, br); pR(g, 0, E, 16, i, 9 + (((i + v) % 4 === 0) ? 1 : 0), br);
  }
  const rnd = mulberry32(v * 31 + (rock ? 99 : 7));
  for (let k = 0; k < 6; k++) tpx(g, 0, E, 16, 0.12 + rnd() * 0.76, 0.12 + rnd() * 0.76, P.t(rnd() < 0.5 ? (rock ? '#6f6b65' : '#7e6950') : (rock ? '#4a4743' : '#57452f')));
};
DRAW[T.WATER] = (g, v, E, P) => {
  const ty = E + 8;
  box(g, 0, ty, 16, 4, P.t('#2b5853'), P.l('#6b645a'), P.r('#524c44'));
  const rnd = mulberry32(v + 3);
  for (let k = 0; k < 3; k++) tpx(g, 0, ty, 16, 0.2 + rnd() * 0.6, 0.2 + rnd() * 0.6, P.t('#336760'), 2);
  diaEdge(g, 0, ty, 16, 3, P.t('#23443f'));
};
DRAW[T.STREET] = (g, v, E, P) => {
  const ty = E + 9, ax = v & 1, mark = (v >> 1) & 7;
  box(g, 0, ty, 16, 3, P.t('#57524b'), P.l('#4a463f'), P.r('#3a3732'));
  const rnd = mulberry32(v * 7 + 1);
  for (let k = 0; k < 4; k++) tpx(g, 0, ty, 16, rnd(), rnd(), P.t(rnd() < 0.5 ? '#5f5a52' : '#4d4943'));
  const paint = P.t('#c7a54c'), zebra = P.t('#b8b1a1');
  if (mark === 1) { if (ax === 0) tline(g, 0, ty, 16, 0.2, 0.5, 0.75, 0.5, paint); else tline(g, 0, ty, 16, 0.5, 0.2, 0.5, 0.75, paint); }
  else if (mark === 2) { for (let k = 0; k < 4; k++) { const s = 0.15 + k * 0.22; if (ax === 0) tline(g, 0, ty, 16, 0.2, s, 0.8, s, zebra); else tline(g, 0, ty, 16, s, 0.2, s, 0.8, zebra); } }
  else if (mark === 3) { dia(g, 4, ty + 2, 8, P.t('#26241f')); for (let k = 0; k < 3; k++) tline(g, 4, ty + 2, 8, 0.2 + k * 0.3, 0.1, 0.2 + k * 0.3, 0.9, P.t('#4a463f')); }
  else if (mark === 4) { R_(g, 7, ty + 3, 3, 2, P.t('#3a3631')); R_(g, 6, ty + 4, 5, 1, P.t('#3a3631')); }
};
DRAW[T.WALK] = (g, v, E, P) => {
  const ty = E + 9;
  box(g, 0, ty, 16, 3, P.t('#8a8377'), P.l('#6f695f'), P.r('#58534b'));
  tline(g, 0, ty, 16, 0.5, 0.02, 0.5, 0.98, P.t('#7a7368')); tline(g, 0, ty, 16, 0.02, 0.5, 0.98, 0.5, P.t('#7a7368'));
  diaEdge(g, 0, ty, 16, 12, P.t('#9d968a'));
};
DRAW[T.OLD] = (g, v, E, P, m, mask) => {
  const M = OLDM[v & 3], roof = v & 4, wp = (v >> 3) & 3;
  if (m === 1) { cutBlock(g, E, mask, P.l(M[1]), P.r(M[2]), 'old'); return; }
  box(g, 0, E, 16, 12, P.t(M[0]), P.l(M[1]), P.r(M[2]));
  const gl = P.l('#2f2d2b'), gr = P.r('#2b2a29'), tl = P.l(M[3]), tr = P.r(M[3]), fst = (v >> 8) & 15;
  for (let i = 0; i < 8; i++) { pL(g, 0, E, 16, i, 11, tl); pR(g, 0, E, 16, i, 11, tr); }
  if (fst) paintFacade(fst, 8, 11, v & 255, (i, j, c) => pL(g, 0, E, 16, i, j, c), (i, j, c) => pR(g, 0, E, 16, i, j, c), P, M[1]);
  else {
    for (const c0 of [1, 5]) for (let i = c0; i < c0 + 2; i++) {
      for (let j = 3; j < 7; j++) { pL(g, 0, E, 16, i, j, gl); pR(g, 0, E, 16, i, j, gr); }
      pL(g, 0, E, 16, i, 7, tl); pR(g, 0, E, 16, i, 7, tr);
    }
    if (S.tod === 'day') { pL(g, 0, E, 16, 1, 3, P.l('#79868a')); pR(g, 0, E, 16, 5, 3, P.r('#79868a')); }
  }
  if (wp === 1) { for (let j = 3; j < 7; j++) pL(g, 0, E, 16, 3, j, P.l('#3f5d4e')); }
  if (wp === 2) { for (let i = 0; i < 8; i++) pR(g, 0, E, 16, i, 8, P.r('#3a3633')); }
  if (wp === 3) { R_(g, 11, E + 11, 2, 2, P.r('#a9a59c')); }
  if (v & 32) { for (let j = 1; j < 10; j++) { pL(g, 0, E, 16, 4, j, '#231d1a'); pL(g, 0, E, 16, 5, j, '#231d1a'); } }
  if (roof) {
    dia(g, 2, E + 1, 12, P.t(mixHex(M[0], '#3f3a35', 0.55)));
    diaEdge(g, 0, E, 16, 12, P.t(mixHex(M[0], '#ffffff', 0.12)));
    if (wp === 1) box(g, 6, E + 1, 4, 2, P.t('#8d8a84'), P.l('#77746e'), P.r('#5f5c57'));
    if (wp === 2) { box(g, 3, E + 2, 4, 3, P.t('#6e7a80'), P.l('#5d676c'), P.r('#4a5256')); }
    if (wp === 0) R_(g, 9, E + 3, 1, 3, P.t('#3a3836'));
  }
};
function coreBody(g, E, P, v, h) {
  box(g, 0, E + 12 - h, 16, h, P.t('#c2bbac'), P.l('#a09989'), P.r('#7b7568'));
  const ty = E + 12 - h, gl = P.l('#8c8577'), gr = P.r('#6a6459');
  for (let j = 0; j < h; j++) { pL(g, 0, ty, 16, 2, j, gl); pL(g, 0, ty, 16, 5, j, gl); pR(g, 0, ty, 16, 2, j, gr); pR(g, 0, ty, 16, 5, j, gr); pL(g, 0, ty, 16, 7, j, P.l('#b3ac9d')); }
  if (h === 12) for (let i = 0; i < 8; i++) { pL(g, 0, ty, 16, i, 11, P.l('#857e71')); pR(g, 0, ty, 16, i, 11, P.r('#625c52')); }
  const k = v & 3;
  for (let j = 4; j < h; j += 2) pR(g, 0, ty, 16, 3 + k, j, P.r('#6f695e'));
}
DRAW[T.CORE] = (g, v, E, P, m, mask) => {
  if (m === 1) { cutBlock(g, E, mask, P.l('#a09989'), P.r('#7b7568'), 'support'); return; }
  coreBody(g, E, P, v, 12);
  if (v & 4) { for (let i = 3; i < 5; i++) for (let j = 4; j < 7; j++) pL(g, 0, E, 16, i, j, P.l('#2e2c2a')); }
  if (v & 8) {
    dia(g, 2, E + 1, 12, P.t('#aaa393'));
    diaEdge(g, 0, E, 16, 12, P.t('#d3ccbd'));
    if ((v & 3) === 1) box(g, 5, E + 2, 4, 2, P.t('#8b8c86'), P.l('#707169'), P.r('#5a5b55'));
  }
};
DRAW[T.LIFT] = (g, v, E, P, m) => {
  if (m !== 1) { DRAW[T.CORE](g, v, E, P, 0, 0); return; }
  const ty = E + 12 - HT;
  fL(g, 0, ty, 16, HT, P.l('#a09989')); fR(g, 0, ty, 16, HT, P.r('#7b7568'));
  dia(g, 0, ty, 16, '#0b0b0c');
  dia(g, 2, ty + 1, 12, '#121213');
  diaEdge(g, 2, ty + 1, 12, 3, '#2d2b29');
  R_(g, 5, ty + 2, 1, 5, '#3a3835'); R_(g, 10, ty + 2, 1, 5, '#3a3835');
  diaEdge(g, 0, ty, 16, 15, CUTLINE);
};
DRAW[T.TRUSS] = (g, v, E, P, m) => {
  const rust = v & 1;
  const c1 = P.l(rust ? '#8a5236' : '#565d61'), c2 = P.r(rust ? '#6d3f29' : '#40464a'), ct = P.t(rust ? '#a0674a' : '#737a7e');
  const jmin = m === 1 ? 12 - HT : 0;
  if (m !== 1) R_(g, 7, E, 2, 12, P.r('#2a2e31'));
  diaEdge(g, 0, E + 12, 16, 3, P.r('#34393c'));
  for (let i = 0; i < 8; i++) {
    const j1 = Math.round(i * 11 / 7), j2 = 11 - j1;
    if (j1 >= jmin) { pL(g, 0, E, 16, i, j1, c1); pR(g, 0, E, 16, i, j2, c2); }
    if (j2 >= jmin) { pL(g, 0, E, 16, i, j2, c1); pR(g, 0, E, 16, i, j1, c2); }
    pL(g, 0, E, 16, i, 11, c1); pR(g, 0, E, 16, i, 11, c2);
    if (m !== 1) { pL(g, 0, E, 16, i, 0, c1); pR(g, 0, E, 16, i, 0, c2); }
  }
  for (let j = jmin; j < 12; j++) { pL(g, 0, E, 16, 0, j, c1); pL(g, 0, E, 16, 7, j, ct); pR(g, 0, E, 16, 0, j, c1); pR(g, 0, E, 16, 7, j, c2); }
  if (m !== 1) diaEdge(g, 0, E, 16, 15, ct);
  else { for (const [i, f] of [[0, pL], [7, pL], [7, pR]]) f(g, 0, E, 16, i, jmin, '#141312'); }
};
function railings(g, ty, nb, col, post, hgt) {
  for (const [bit, which] of [[1, 1], [2, 2], [4, 4], [8, 8]]) {
    if (nb & bit) continue;
    g.fillStyle = col;
    for (let i = 0; i < 8; i++) {
      const k = i >> 1;
      const x = (which === 2 || which === 8) ? i : 15 - i;
      const y = (which === 1 || which === 2) ? ty + 3 - k : ty + 4 + k;
      g.fillRect(x, y - hgt, 1, 1);
      if ((i & 1) === 0) { g.fillStyle = post; g.fillRect(x, y - hgt + 1, 1, hgt - 1); g.fillStyle = col; }
    }
  }
}
DRAW[T.DECK] = (g, v, E, P) => {
  const ty = E + 9, ax = v & 1, nb = (v >> 1) & 15;
  box(g, 0, ty, 16, 3, P.t('#9a9488'), P.l('#6f6a5f'), P.r('#57534a'));
  const rail = P.t('#6d685e');
  if (ax === 0) { tline(g, 0, ty, 16, 0, 0.3, 1, 0.3, rail); tline(g, 0, ty, 16, 0, 0.7, 1, 0.7, rail); }
  else { tline(g, 0, ty, 16, 0.3, 0, 0.3, 1, rail); tline(g, 0, ty, 16, 0.7, 0, 0.7, 1, rail); }
  diaEdge(g, 0, ty, 16, 15 & ~nb, P.t('#cfa645'));
  railings(g, ty, nb, P.t('#4a4f52'), P.l('#3a3e41'), 4);
};
DRAW[T.ROOFWALK] = (g, v, E, P) => {
  const ty = E + 10, ax = v & 1, nb = (v >> 1) & 15;
  box(g, 0, ty, 16, 2, P.t('#8b6a46'), P.l('#6b5035'), P.r('#553f2a'));
  for (let k = 1; k < 4; k++) { const s = k / 4; if (ax === 0) tline(g, 0, ty, 16, s, 0.05, s, 0.95, P.t('#6f5237')); else tline(g, 0, ty, 16, 0.05, s, 0.95, s, P.t('#6f5237')); }
  railings(g, ty, nb, P.t('#5c4631'), P.l('#4a3826'), 3);
};
DRAW[T.TUBE] = (g, v, E, P) => {
  const nb = (v >> 1) & 15, ty = E + 3, h = 7;
  box(g, 0, E + 10, 16, 2, P.t('#8c877c'), P.l('#666157'), P.r('#504c45'));
  box(g, 0, ty, 16, h, P.ta('#1d2729', 0.62), P.la('#1d2729', 0.62), P.ra('#1d2729', 0.62));
  const frame = P.l('#2c3234'), frameR = P.r('#23282a');
  if (!(nb & 8)) { fL(g, 0, ty, 16, h, P.la('#9cc0ba', 0.28)); for (let j = 0; j < h; j++) { pL(g, 0, ty, 16, 0, j, frame); pL(g, 0, ty, 16, 4, j, frame); pL(g, 0, ty, 16, 7, j, frame); } for (let i = 0; i < 8; i++) pL(g, 0, ty, 16, i, 0, frame); }
  if (!(nb & 4)) { fR(g, 0, ty, 16, h, P.ra('#9cc0ba', 0.24)); for (let j = 0; j < h; j++) { pR(g, 0, ty, 16, 0, j, frameR); pR(g, 0, ty, 16, 3, j, frameR); pR(g, 0, ty, 16, 7, j, frameR); } for (let i = 0; i < 8; i++) pR(g, 0, ty, 16, i, 0, frameR); }
  dia(g, 0, ty, 16, P.ta('#a6c8c2', 0.34));
  diaEdge(g, 0, ty, 16, 15 & ~nb, P.t('#3a4245'));
  if (v & 1) tline(g, 0, ty, 16, 0.5, 0.05, 0.5, 0.95, P.ta('#e4f2ee', 0.55)); else tline(g, 0, ty, 16, 0.05, 0.5, 0.95, 0.5, P.ta('#e4f2ee', 0.55));
};
function frameCage(g, E, P, m, front) {
  const cl = P.l('#9a9283'), cr = P.r('#766f63'), ct = P.t('#b8b09f');
  const jmin = m === 1 ? 12 - HT : 0;
  if (!front) {
    box(g, 0, E + 10, 16, 2, P.t('#8f887b'), P.l('#6f695e'), P.r('#58534b'));
    if (m !== 1) R_(g, 7, E, 2, 10, P.r('#5a544b'));
    return;
  }
  for (let j = jmin; j < 10; j++) { pL(g, 0, E, 16, 0, j, cl); pL(g, 0, E, 16, 7, j, ct); pR(g, 0, E, 16, 0, j, cl); pR(g, 0, E, 16, 7, j, cr); }
  if (m !== 1) { diaEdge(g, 0, E, 16, 15, ct); for (let i = 0; i < 8; i++) { pL(g, 0, E, 16, i, 0, cl); pR(g, 0, E, 16, i, 0, cr); } }
  else for (const [i, f] of [[0, pL], [7, pL], [7, pR]]) f(g, 0, E, 16, i, jmin, '#141312');
}
DRAW[T.FRAME] = (g, v, E, P, m) => { frameCage(g, E, P, m, false); frameCage(g, E, P, m, true); };
DRAW[T.CAPSULE] = (g, v, E, P, m, mask) => {
  const C = CAPC[v & 3], ws = (v >> 2) & 1, det = (v >> 3) & 3, roof = v & 32;
  frameCage(g, E, P, m, false);
  if (m === 1) {
    fL(g, 2, E + 6, 12, 5, P.l(C[1])); fR(g, 2, E + 6, 12, 5, P.r(C[2]));
    poche(g, 2, E + 6, 12, 'infill'); diaEdge(g, 2, E + 6, 12, 15 & ~mask, '#cdbf9f');
    frameCage(g, E, P, m, true); return;
  }
  const bx = 2, by = E + 2;
  box(g, bx, by, 12, 9, P.t(C[0]), P.l(C[1]), P.r(C[2]));
  for (let i = 0; i < 6; i++) { pL(g, bx, by, 12, i, 0, P.l(mixHex(C[1], '#ffffff', 0.18))); pR(g, bx, by, 12, i, 8, P.r(mixHex(C[2], '#000000', 0.2))); }
  const fst = (v >> 8) & 15;
  if (fst) paintFacade(fst, 6, 8, v & 255, (i, j, c) => pL(g, bx, by, 12, i, j, c), (i, j, c) => pR(g, bx, by, 12, i, j, c), P, C[1]);
  const win = ws ? pR : pL, other = ws ? pL : pR, sh = ws ? P.r : P.l;
  if (!fst) {
  const glass = sh('#2a2e30'), rim = sh(mixHex(C[ws ? 2 : 1], '#ffffff', 0.25));
  const RW = [[2, 2], [3, 2], [1, 3], [2, 3], [3, 3], [4, 3], [1, 4], [2, 4], [3, 4], [4, 4], [2, 5], [3, 5]];
  for (const [i, j] of RW) win(g, bx, by, 12, i, j, glass);
  win(g, bx, by, 12, 2, 1, rim); win(g, bx, by, 12, 3, 1, rim); win(g, bx, by, 12, 2, 6, rim); win(g, bx, by, 12, 3, 6, rim);
  if (S.tod === 'day') win(g, bx, by, 12, 2, 3, sh('#8c9a9c'));
  const osh = ws ? P.l : P.r;
  for (const j of [3, 5, 7]) for (let i = 1; i < 4; i++) other(g, bx, by, 12, i, j, osh(mixHex(C[ws ? 1 : 2], '#000000', 0.3)));
  }
  if (roof) {
    if (det === 1) box(g, 5, E + 2, 4, 2, P.t('#8d8a84'), P.l('#77746e'), P.r('#5f5c57'));
    if (det === 2) { R_(g, 9, E + 3, 2, 1, P.t('#5a8a3e')); R_(g, 9, E + 4, 2, 1, P.r('#7a5a3e')); }
    if (det === 3) R_(g, 6, E - 0, 1, 4, P.t('#3a3836'));
  }
  frameCage(g, E, P, m, true);
};
DRAW[T.TERRACE] = (g, v, E, P) => {
  const ty = E + 9;
  box(g, 0, ty, 16, 3, P.t('#5d893d'), P.l('#7a7367'), P.r('#5f5a51'));
  for (let i = 0; i < 8; i++) { pL(g, 0, ty, 16, i, 0, P.l('#5b4631')); pR(g, 0, ty, 16, i, 0, P.r('#4a3927')); }
  const rnd = mulberry32((v & 3) * 13 + 5);
  for (let k = 0; k < 11; k++) tpx(g, 0, ty, 16, 0.08 + rnd() * 0.84, 0.08 + rnd() * 0.84, P.t(rnd() < 0.5 ? '#72a04c' : '#4c7434'));
  if (v & 16) { tpx(g, 0, ty, 16, 0.3, 0.6, '#e2b35b'); tpx(g, 0, ty, 16, 0.6, 0.35, '#d9785a'); tpx(g, 0, ty, 16, 0.7, 0.7, '#e9d9a8'); }
};
DRAW[T.TREE] = (g, v, E, P) => {
  DRAW[T.TERRACE](g, v & 3, E, P);
  const sp = v & 3, base = E + 13;
  R_(g, 7, base - 6, 1, 6, P.l('#6a4c36')); R_(g, 8, base - 6, 1, 6, P.r('#4b3526'));
  const rx = sp === 2 ? 4 : 6, ry = sp === 2 ? 3 : 5, cy = base - (sp === 2 ? 6 : 9);
  const rnd = mulberry32(v * 97 + 11);
  const cols = [P.t('#86b35c'), P.t('#5f9446'), P.l('#437a36'), P.r('#2d5a2a')];
  for (let dy = -ry - (sp === 1 ? 4 : 0); dy <= ry; dy++) for (let dx = -rx; dx <= rx; dx++) {
    let inside;
    if (sp === 1) { const t = (dy + ry + 4) / (2 * ry + 4); inside = Math.abs(dx) <= t * rx + 0.5; }
    else inside = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1 - rnd() * 0.18;
    if (!inside) continue;
    const s = dx * 0.8 + dy * 1.2 + (rnd() - 0.5) * 2.2;
    g.fillStyle = s < -4 ? cols[0] : s < 0 ? cols[1] : s < 3.5 ? cols[2] : cols[3];
    g.fillRect(8 + dx, cy + dy, 1, 1);
  }
  if (sp === 3) for (let k = 0; k < 6; k++) { g.fillStyle = k & 1 ? '#e6a07a' : '#f0c9a0'; g.fillRect(8 + Math.round((rnd() - 0.5) * 10), cy + Math.round((rnd() - 0.5) * 8), 1, 1); }
};
function column(g, E, P, m, cols, cap) {
  const h = m === 1 ? HT : 12, top = E + 15 - h;
  box(g, 6, top, 4, h, m === 1 ? '#141312' : P.t(cols[0]), P.l(cols[1]), P.r(cols[2]));
  if (m === 1) diaEdge(g, 6, top, 4, 15, CUTLINE);
  else if (cap) box(g, 4, top - 1, 8, 1, P.t(cols[0]), P.l(cols[1]), P.r(cols[2]));
}
DRAW[T.PILLAR] = (g, v, E, P, m) => {
  if (v & 2) DRAW[T.STREET](g, 0, E, P);
  if (v & 1) box(g, 4, E + 12, 8, 2, P.t('#8f887b'), P.l('#6f695e'), P.r('#58534b'));
  column(g, E, P, m, ['#b4ad9e', '#9d9687', '#77716a'], true);
};
DRAW[T.VAULT] = (g, v, E, P, m) => {
  if (v & 1) DRAW[T.WATER](g, 0, E, P);
  column(g, E, P, m, ['#9b7a62', '#8a6a55', '#654c3c'], true);
  if (m !== 1) for (let j = 2; j < 12; j += 3) R_(g, 6, E + 3 + 2 + j, 2, 1, P.l('#6f5444'));
};
DRAW[T.RISER] = (g, v, E, P, m) => {
  const top = m === 1 ? E + 12 - HT + 4 : E + 3;
  const cs = [['#a2603c', '#7c472b'], ['#5f7c76', '#475e59'], ['#8d8b83', '#6b6a64']];
  cs.forEach((c, k) => { const x = 5 + k * 3, y = top + (k === 1 ? 1 : 0); R_(g, x, y, 1, E + 17 - y, P.l(c[0])); R_(g, x + 1, y, 1, E + 17 - y, P.r(c[1])); if (m === 1) R_(g, x, y, 2, 1, '#141312'); });
  if (m !== 1) for (const j of [6, 12]) R_(g, 4, E + j, 9, 1, P.r('#3a3e41'));
};
DRAW[T.PIPE] = (g, v, E, P) => {
  const ax = v & 1, set = (v >> 1) & 1;
  const pc = set ? ['#58726d', '#7d9892', '#3f5450'] : ['#9b5a38', '#c07a50', '#6e3f27'];
  const fy = (a, b, h) => [Math.floor(8 + (a - b) * 8), Math.floor(E + 12 + (a + b) * 4 - h)];
  for (const [bb, hh, cc] of [[0.3, 7, pc], [0.62, 4, ['#8a8a82', '#b0afa6', '#66665f']]]) for (let k = 0; k <= 16; k++) {
    const a = k / 16; const [x, y] = ax === 0 ? fy(a, bb, hh) : fy(bb, a, hh);
    R_(g, x, y, 2, 3, P.l(cc[0])); R_(g, x, y, 2, 1, P.t(cc[1])); R_(g, x, y + 2, 2, 1, P.r(cc[2]));
  }
  const [bx, by] = ax === 0 ? fy(0.5, 0.45, 0) : fy(0.45, 0.5, 0);
  R_(g, bx, by - 7, 1, 7, P.r('#3a3e41'));
};
DRAW[T.TANK] = (g, v, E, P, m) => {
  const h = m === 1 ? HT : 10, cy = E + 16, top = cy - h;
  const body = v & 1 ? ['#8a8c86', '#6d6f69', '#50524d'] : ['#9c8a6a', '#7e6f54', '#5c513e'];
  for (let dx = -5; dx <= 5; dx++) { const ey = Math.round(Math.sqrt(Math.max(0, 1 - (dx * dx) / 30.25)) * 2.5); R_(g, 8 + dx, top, 1, h + ey, dx < -1 ? P.l(body[0]) : dx < 2 ? P.l(body[1]) : P.r(body[2])); }
  for (let dx = -5; dx <= 5; dx++) { const ey = Math.round(Math.sqrt(Math.max(0, 1 - (dx * dx) / 30.25)) * 2.5); R_(g, 8 + dx, top - ey, 1, ey * 2 + 1, m === 1 ? '#141312' : P.t(mixHex(body[0], '#ffffff', 0.1))); }
  if (m === 1) { for (let dx = -5; dx <= 5; dx++) { const ey = Math.round(Math.sqrt(Math.max(0, 1 - (dx * dx) / 30.25)) * 2.5); R_(g, 8 + dx, top - ey, 1, 1, CUTLINE); R_(g, 8 + dx, top + ey, 1, 1, CUTLINE); } }
  else { R_(g, 10, top + 3, 1, h - 3, P.r('#6e3f27')); R_(g, 4, top + 2, 1, h - 4, P.l(mixHex(body[0], '#ffffff', 0.2))); }
};
DRAW[T.VENT] = (g, v, E, P) => {
  box(g, 4, E + 8, 8, 6, P.t('#4a4a47'), P.l('#8c8a84'), P.r('#6a6964'));
  for (let j = 1; j < 6; j += 2) for (let i = 0; i < 4; i++) { pL(g, 4, E + 8, 8, i, j, P.l('#5a5955')); pR(g, 4, E + 8, 8, i, j, P.r('#484743')); }
  diaEdge(g, 4, E + 8, 8, 15, P.t('#7a7974'));
};
DRAW[T.CANOPY] = (g, v, E, P, m) => {
  if ((v & 1) || m === 1) R_(g, 8, m === 1 ? E + 12 - HT + 4 : E + 4, 1, m === 1 ? HT : 12, P.r('#3c4145'));
  if (m === 1) return;
  box(g, 0, E, 16, 1, P.t('#2b3440'), P.l('#1f262e'), P.r('#181e25'));
  for (const s of [0.34, 0.67]) { tline(g, 0, E, 16, s, 0.03, s, 0.97, P.t('#455466')); tline(g, 0, E, 16, 0.03, s, 0.97, s, P.t('#3a4757')); }
  tline(g, 0, E, 16, 0.1, 0.55, 0.45, 0.9, P.t('#7a8ea3'));
  diaEdge(g, 0, E, 16, 12, P.t('#5d6d80'));
};
DRAW[T.ANTENNA] = (g, v, E, P) => {
  box(g, 4, E + 12, 8, 2, P.t('#7a7a74'), P.l('#62625d'), P.r('#4c4c48'));
  R_(g, 8, 10, 1, E + 6, P.l('#8e8f8a')); R_(g, 9, 12, 1, E + 4, P.r('#5a5b57'));
  for (const y of [16, 22, 28]) R_(g, 6, y, 5, 1, P.l('#7b7c77'));
  R_(g, 4, 19, 3, 3, P.t('#c9c7bd')); R_(g, 3, 20, 1, 2, P.l('#9a988f'));
};
DRAW[T.CRANE] = (g, v, E, P) => {
  const Y = '#d4a13a', Yd = '#9c7426', K = '#2e2a24';
  box(g, 18, E + 12, 12, 2, P.t('#8f887b'), P.l('#6f695e'), P.r('#58534b'));
  for (let y = 10; y < E + 16; y++) { R_(g, 22, y, 1, 1, P.l(Y)); R_(g, 25, y, 1, 1, P.r(Yd)); if ((y & 3) === 0) R_(g, 23, y, 2, 1, P.l(Y)); if ((y & 3) === 2) { R_(g, 23, y, 1, 1, P.r(Yd)); R_(g, 24, y + 1, 1, 1, P.r(Yd)); } }
  for (let k = 0; k <= 20; k++) { R_(g, 22 - k, 9 + (k >> 1), 1, 1, P.l(Y)); if (k % 3 === 0) R_(g, 22 - k, 10 + (k >> 1), 1, 2, P.r(Yd)); }
  for (let k = 0; k <= 8; k++) R_(g, 25 + k, 9 - (k >> 1), 1, 1, P.r(Yd));
  box(g, 29, 2, 8, 4, P.t('#6d6a64'), P.l('#58554f'), P.r('#46443f'));
  R_(g, 22, 4, 3, 6, P.l(Y)); R_(g, 21, 3, 1, 3, K);
  const tx = 10, ty = 15;
  R_(g, tx, ty, 2, 2, K); R_(g, tx + 1, ty + 2, 1, 12, '#46423b');
  box(g, tx - 3, ty + 14, 8, 5, P.t('#d0714a'), P.l('#b35a37'), P.r('#8a4428'));
};
DRAW[T.LAMP] = (g, v, E, P) => {
  if (v & 1) DRAW[T.WALK](g, 0, E, P);
  R_(g, 8, E + 5, 1, 10, P.l('#3d3f40')); R_(g, 7, E + 4, 3, 1, P.t('#55575a'));
};
const DRAW_MISSING = (g) => { R_(g, 4, 8, 8, 8, '#ff00ff'); };

// ---- sprite cache ----
let SPR = new Map();
function getSprite(t, v, q, m, mask) {
  const key = ((((t * 4096 + v) * 8 + q) * 2 + m) * 16 + mask);
  let s = SPR.get(key);
  if (s) return s;
  const E = EXTRA[t] || 0, w = t === T.CRANE ? 48 : 16;
  // read back once for its depth mask (spriteMask): kept on the CPU, so that read costs no GPU sync
  const c = mk(w, 20 + E), g = c.getContext('2d', { willReadFrequently: true });
  (DRAW[t] || DRAW_MISSING)(g, v, E, painter(q), m, mask, t);
  s = { c, ox: -(w >> 1), oy: -12 - E, E };
  SPR.set(key, s);
  return s;
}
const GHOST = new Map();
function getGhost(t, v, tint, bad) {
  const key = t * 256 + v + (bad ? 'x' : tint);
  let s = GHOST.get(key);
  if (s) return s;
  const base = getSprite(t, v, 4, 0, 0);
  const c = mk(base.c.width, base.c.height), g = c.getContext('2d');
  g.drawImage(base.c, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = bad ? 'rgba(226,87,63,0.75)' : rgba(tint, 0.62); g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = 'rgba(255,255,255,0.18)';
  for (let y = 0; y < c.height; y += 2) g.fillRect(0, y, c.width, 1);
  s = { c, ox: base.ox, oy: base.oy }; GHOST.set(key, s);
  return s;
}

// variant bits resolved for the current view rotation / neighbours
function spriteVar(t, i, x, y, z, u, v) {
  const vv = vars[i];
  switch (t) {
    case T.STREET: case T.PIPE: return (vv & ~1) | screenAxis(vv & 1);
    case T.DECK: case T.TUBE: case T.ROOFWALK: {
      const same = t === T.TUBE ? (n => n === T.TUBE) : (n => isCirc(n) || n === T.TERRACE || n === T.PILLAR || n === T.CORE || n === T.LIFT || n === T.TREE);
      let m = 0;
      if (same(cellR(u, v - 1, z))) m |= 1; if (same(cellR(u - 1, v, z))) m |= 2;
      if (same(cellR(u + 1, v, z))) m |= 4; if (same(cellR(u, v + 1, z))) m |= 8;
      return screenAxis(vv & 1) | (m << 1);
    }
    case T.OLD: { const up = cell(x, y, z + 1); let r = vv & ~(4 | 32); if (!up || !TI[up].poche) r |= 4; if (flags[i] & F_SIGN) r |= 32; return r | (facadeStyle('old', x, y, z) << 8); }
    case T.CAPSULE: { const up = cell(x, y, z + 1); return (vv & 31) | ((up === T.CAPSULE || up === T.OLD || up === T.CORE || up === T.FRAME) ? 0 : 32) | (facadeStyle('cap', x, y, z) << 8); }
    case T.CORE: case T.LIFT: { const up = cell(x, y, z + 1); let r = vv & 3; if (up !== T.CORE && up !== T.LIFT) r |= 8; if ((hash3(x, y, z) & 7) === 0) r |= 4; return r; }
    default: return vv;
  }
}
function pocheMask(u, v, z, t) {
  const cap = t === T.CAPSULE;
  const P = n => n && (cap ? n === T.CAPSULE : (TI[n].poche && n !== T.CAPSULE && n !== T.LIFT && n !== T.TANK));
  let m = 0;
  if (P(cellR(u, v - 1, z))) m |= 1; if (P(cellR(u - 1, v, z))) m |= 2;
  if (P(cellR(u + 1, v, z))) m |= 4; if (P(cellR(u, v + 1, z))) m |= 8;
  return m;
}
