// ==========================================================================
// The vignette redrawn at 2x: same cells, same variants, same palette and
// face shading as the game, but every painter rewritten for a 32-px cell with
// the detail a doubled grid can carry. Occlusion of cables uses the game's
// per-pixel depth, ported to the doubled grid.
// ==========================================================================
const K2 = 2, CELL = 32, FACE = 24;
const TOD = { t: [1.00, 0.99, 0.95], l: [0.97, 0.96, 0.93], r: [0.78, 0.81, 0.84] };
const LQ = [0.40, 0.54, 0.69, 0.85, 1.0];
const clamp = (v, a, b) => v < a ? a : v > b ? b : v, lerp = (a, b, t) => a + (b - a) * t;
const _rgb = new Map();
function rgbOf(hex) { let c = _rgb.get(hex); if (!c) { const n = parseInt(hex.slice(1), 16); c = [n >> 16 & 255, n >> 8 & 255, n & 255]; _rgb.set(hex, c); } return c; }
function hexOf(r, g, b) { return '#' + ((1 << 24) | (clamp(r | 0, 0, 255) << 16) | (clamp(g | 0, 0, 255) << 8) | clamp(b | 0, 0, 255)).toString(16).slice(1); }
function mixHex(a, b, t) { const A = rgbOf(a), B = rgbOf(b); return hexOf(lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)); }
const dk = (h, t) => mixHex(h, '#000000', t), lt = (h, t) => mixHex(h, '#ffffff', t);
function shade(hex, f, q) { const c = rgbOf(hex), m = TOD[f], k = LQ[q]; return `rgb(${clamp(c[0] * m[0] * k | 0, 0, 255)},${clamp(c[1] * m[1] * k | 0, 0, 255)},${clamp(c[2] * m[2] * k | 0, 0, 255)})`; }
const painter = q => ({ t: h => shade(h, 't', q), l: h => shade(h, 'l', q), r: h => shade(h, 'r', q) });
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hash3(x, y, z) { let h = (x * 374761393 + y * 668265263 + z * 1274126177) | 0; h = Math.imul(h ^ (h >>> 13), 1103515245); return (h ^ (h >>> 16)) >>> 0; }

// ---- the game's raster primitives, unchanged: they already scale with w ----
function R_(g, x, y, w, h, c) { g.fillStyle = c; g.fillRect(x, y, w, h); }
function dia(g, x, y, w, c) { g.fillStyle = c; const h = w >> 1, hh = h >> 1; for (let r = 0; r < h; r++) { const half = r < hh ? (r + 1) * 2 : (h - r) * 2; g.fillRect(x + (w >> 1) - half, y + r, half * 2, 1); } }
function fL(g, x, y, w, hh, c) { g.fillStyle = c; const n = w >> 1, q = (w >> 2) + 1; for (let i = 0; i < n; i++) g.fillRect(x + i, y + q + (i >> 1), 1, hh); }
function fR(g, x, y, w, hh, c) { g.fillStyle = c; const n = w >> 1; for (let i = 0; i < n; i++) g.fillRect(x + n + i, y + n - (i >> 1), 1, hh); }
function box(g, x, y, w, hh, ct, cl, cr) { dia(g, x, y, w, ct); fL(g, x, y, w, hh, cl); fR(g, x, y, w, hh, cr); }
function pL(g, x, y, w, i, j, c) { g.fillStyle = c; g.fillRect(x + i, y + (w >> 2) + 1 + (i >> 1) + j, 1, 1); }
function pR(g, x, y, w, i, j, c) { g.fillStyle = c; g.fillRect(x + (w >> 1) + i, y + (w >> 1) - (i >> 1) + j, 1, 1); }
function diaEdge(g, x, y, w, which, c) {
  g.fillStyle = c; const n = w >> 1, q = w >> 2;
  for (let i = 0; i < n; i++) { const k = i >> 1, xr = x + w - 1 - i;
    if (which & 2) g.fillRect(x + i, y + q - 1 - k, 1, 1); if (which & 8) g.fillRect(x + i, y + q + k, 1, 1);
    if (which & 1) g.fillRect(xr, y + q - 1 - k, 1, 1); if (which & 4) g.fillRect(xr, y + q + k, 1, 1); }
}
function tpx(g, x, y, w, a, b, c, pw) { g.fillStyle = c; g.fillRect(Math.floor(x + (w >> 1) + (a - b) * (w >> 1)), Math.floor(y + (a + b) * (w >> 2)), pw || 1, 1); }
function tline(g, x, y, w, a0, b0, a1, b1, c, pw) { const n = 32; for (let k = 0; k <= n; k++) tpx(g, x, y, w, lerp(a0, a1, k / n), lerp(b0, b1, k / n), c, pw); }
// a face as a little bitmap: put(face, i, j, col) for a 32-wide cube at (0, E)
const faceOf = (g, E, w, x0) => ({ L: (i, j, c) => pL(g, x0 || 0, E, w || CELL, i, j, c), R: (i, j, c) => pR(g, x0 || 0, E, w || CELL, i, j, c) });

const OLDM = [['#7c4a39', '#9c5c43', '#784331', '#5a2f22'], ['#a58c62', '#c3a878', '#977e56', '#6e5a3c'], ['#697a67', '#83947f', '#5e6c5b', '#44503f'], ['#b2ac9d', '#cec7b5', '#a19a8b', '#7b7568']];
const CAPC = [['#d6cebb', '#b6ae9b', '#908979'], ['#b3643c', '#92502e', '#6f3c23'], ['#678c83', '#53756e', '#3f5954'], ['#ca9c4a', '#a97f38', '#82622a']];
const WARM = ['#ffcf73', '#ffb44f', '#ffe39e', '#ffc566'];
// the game's ribbon layout (style 1) for an 8 x 11 face: runs of 2-3 columns
function ribbonRuns(seed) {
  const rnd = mulberry32(seed * 977 + 1 * 31 + 8), runs = []; let i = 0;
  while (i < 8) { const w = Math.min(8 - i, 2 + Math.floor(rnd() * 2)); runs.push([i, w]); i += w; }
  return runs;
}
const DRAW2 = {};

// ---------- old buildings: rendered walls, a ribbon of glazing, slab bands, roof clutter ----------
DRAW2.OLD = (g, v, E, P, at) => {
  const M = OLDM[v & 3], roof = v & 4, wp = (v >> 3) & 3, rnd = mulberry32(hash3(at.x, at.y, at.z));
  box(g, 0, E, CELL, FACE, P.t(M[0]), P.l(M[1]), P.r(M[2]));
  const F = faceOf(g, E);
  for (const [side, put, sh] of [[0, F.L, P.l], [1, F.R, P.r]]) {
    const wall = M[1 + side];
    // render texture: a few lighter and darker grains, a soft vertical stain under the sill
    for (let i = 0; i < 16; i++) for (let j = 0; j < 22; j++) { const r = rnd(); if (r < 0.05) put(i, j, sh(dk(wall, 0.07))); else if (r > 0.965) put(i, j, sh(lt(wall, 0.06))); }
    for (let j = 16; j < 21; j++) if (((hash3(at.x * 3 + side, at.y, at.z) >> j) & 3) === 0) put(3 + (side * 7), j, sh(dk(wall, 0.1)));
    // slab band at the floor: a lit lip, the slab, a shadow line
    for (let i = 0; i < 16; i++) { put(i, 20, sh(lt(wall, 0.1))); put(i, 21, sh(M[3])); put(i, 22, sh(M[3])); put(i, 23, sh(dk(M[3], 0.25))); }
    // the ribbon: head reveal, glass in runs with mullions, a bright sill and its shadow
    const runs = ribbonRuns((v & 255) + side * 13);
    const lit = at.lit[side] || {};
    for (let i = 0; i < 16; i++) { put(i, 4, sh(lt('#d2ccbf', 0.05))); put(i, 5, sh('#2a2724')); put(i, 14, sh('#e2dccf')); put(i, 15, sh(dk(wall, 0.28))); }
    runs.forEach(([c0, w], k) => {
      const x0 = c0 * 2, x1 = (c0 + w) * 2 - 1, warm = lit[k], on = !!warm;
      const blinds = (hash3(at.x + k, at.y * 5 + side, at.z) & 3) === 0;
      for (let i = x0; i <= x1; i++) for (let j = 6; j < 14; j++) {
        const edge = i === x0 || i === x1, mid = !edge && (i - x0) === ((x1 - x0 + 1) >> 1);
        let c;
        if (edge) c = sh('#4c5154');                                   // frame between runs
        else if (mid) c = sh('#3d4245');                               // a mullion
        else if (on) c = j === 6 ? lt(warm, 0.35) : (j > 11 ? dk(warm, 0.18) : warm);
        else {
          const glint = ((i * 2 + j * 3 + at.x * 5) % 13) < 2;      // a slant of sky in the glass
          c = sh(glint ? '#6d7c83' : j === 6 ? '#353b3e' : '#262a2d');
          if (blinds && j < 9 && (j & 1) === 0) c = sh('#a9a395');
        }
        put(i, j, c);
      }
      if (on && !blinds) put(x0 + 2, 12, dk(warm, 0.45));             // a silhouette inside
    });
    // the building's front corner catches light
    if (side === 0) for (let j = 0; j < 20; j++) put(15, j, sh(lt(wall, 0.07)));
  }
  // variants: a climbing plant, a balcony ledge, an AC unit
  if (wp === 1) for (let j = 1; j < 20; j++) for (let i = 6; i < 9; i++) if (((i * 7 + j * 3) % 5) < 3 && !(j > 4 && j < 15 && i === 7)) F.L(i, j, P.l(((i + j) & 1) ? '#3f6a40' : '#58864a'));
  if (wp === 2) {
    for (let i = 0; i < 16; i++) { F.R(i, 16, P.r('#b9b3a6')); F.R(i, 17, P.r('#3a3633')); if ((i & 3) === 1) { F.R(i, 13, P.r('#55595b')); F.R(i, 14, P.r('#55595b')); F.R(i, 15, P.r('#55595b')); } F.R(i, 12, P.r('#6a6f72')); }
  }
  if (wp === 3) {
    for (let i = 9; i < 14; i++) for (let j = 15; j < 19; j++) F.R(i, j, P.r(j === 15 ? '#c9c5bc' : (i & 1) ? '#8f8b84' : '#a9a59c'));
    F.R(11, 19, P.r('#5d6f74')); F.R(11, 20, P.r(dk(M[2], 0.2)));
  }
  if (roof) {
    // parapet: an outer ring with a bright coping on the front edges, a gravel roof inside
    const inner = mixHex(M[0], '#3f3a35', 0.55);
    dia(g, 3, E + 1, 26, P.t(dk(M[0], 0.18)));
    dia(g, 4, E + 2, 24, P.t(inner));
    const rr = mulberry32(hash3(at.x, at.y, 7));
    for (let k = 0; k < 40; k++) tpx(g, 4, E + 2, 24, 0.05 + rr() * 0.9, 0.05 + rr() * 0.9, P.t(rr() < 0.5 ? lt(inner, 0.12) : dk(inner, 0.12)));
    diaEdge(g, 0, E, CELL, 12, P.t(lt(M[0], 0.22)));
    diaEdge(g, 0, E, CELL, 3, P.t(dk(M[0], 0.1)));
    if (wp === 1) {   // a rooftop AC unit with a fan
      box(g, 11, E + 3, 10, 4, P.t('#a9a59f'), P.l('#8d8a84'), P.r('#6f6c67'));
      dia(g, 13, E + 4, 6, P.t('#4b4a47')); tpx(g, 13, E + 4, 6, 0.5, 0.5, P.t('#2b2a28'));
      for (let i = 1; i < 5; i += 2) for (let j = 1; j < 4; j++) pL(g, 11, E + 3, 10, i, j, P.l('#77746e'));
    } else if (wp === 2) {   // a water tank on legs
      R_(g, 8, E + 9, 1, 4, P.l('#4a4643')); R_(g, 14, E + 9, 1, 4, P.r('#3a3633'));
      box(g, 6, E + 1, 10, 8, P.t('#8a979d'), P.l('#6e7a80'), P.r('#555f64'));
      for (let i = 0; i < 5; i++) { pL(g, 6, E + 1, 10, i, 2, P.l('#5f6a6f')); pR(g, 6, E + 1, 10, i, 5, P.r('#47504f')); }
      dia(g, 8, E + 2, 6, P.t('#9eabb1'));
    } else if (wp === 0) {   // a vent stack with a cap, and a hatch
      R_(g, 19, E + 4, 2, 7, P.l('#4d4a46')); R_(g, 21, E + 4, 1, 7, P.r('#3a3836')); R_(g, 18, E + 3, 5, 1, P.t('#6b6863'));
      dia(g, 8, E + 8, 8, P.t(dk(inner, 0.2))); diaEdge(g, 8, E + 8, 8, 12, P.t(lt(inner, 0.2)));
    } else {          // wp 3: a skylight
      dia(g, 9, E + 5, 12, P.t('#4f6268')); diaEdge(g, 9, E + 5, 12, 15, P.t('#c9c5bc')); tline(g, 9, E + 5, 12, 0.5, 0.05, 0.5, 0.95, P.t('#c9c5bc'));
    }
  }
};

// ---------- cores: board-marked concrete, tie holes, a ladder, a lift machine room ----------
DRAW2.CORE = (g, v, E, P, at) => {
  box(g, 0, E, CELL, FACE, P.t('#c2bbac'), P.l('#a09989'), P.r('#7b7568'));
  const F = faceOf(g, E), rnd = mulberry32(hash3(at.x, at.y, at.z) + 3);
  for (const [put, sh, base] of [[F.L, P.l, '#a09989'], [F.R, P.r, '#7b7568']]) {
    for (let i = 0; i < 16; i++) for (let j = 0; j < 24; j++) {
      if (i === 5 || i === 11) put(i, j, sh(dk(base, 0.12)));          // panel joints
      else if (j === 7 || j === 15) put(i, j, sh(dk(base, 0.1)));
      else if (j === 8 || j === 16) put(i, j, sh(lt(base, 0.05)));
      else if (rnd() < 0.04) put(i, j, sh(rnd() < 0.5 ? dk(base, 0.06) : lt(base, 0.05)));
    }
    for (const [i, j] of [[2, 3], [8, 3], [14, 3], [2, 11], [8, 11], [14, 11], [2, 19], [8, 19], [14, 19]]) {
      put(i, j, sh(dk(base, 0.3)));
      for (let s = 1; s < 3 + ((i + j + at.z) % 3); s++) if (j + s < 24) put(i, j + s, sh(dk(base, 0.08)));   // rust-less weep streaks
    }
    for (let i = 0; i < 16; i++) { put(i, 22, sh(dk(base, 0.15))); put(i, 23, sh(dk(base, 0.25))); }
  }
  for (let j = 0; j < 24; j++) { F.L(15, j, P.l('#b8b1a2')); F.L(14, j, P.l('#aca596')); }   // the lit arris
  for (let j = 1; j < 24; j += 3) for (let i = 6; i < 10; i++) F.R(i, j, P.r('#5e594f'));    // ladder rungs
  for (let j = 0; j < 24; j++) { F.R(6, j, P.r('#68625a')); F.R(9, j, P.r('#68625a')); }
  if (v & 8) {
    dia(g, 3, E + 1, 26, P.t('#b3ac9d')); dia(g, 4, E + 2, 24, P.t('#aaa393'));
    const rr = mulberry32(hash3(at.x, at.y, 9));
    for (let k = 0; k < 30; k++) tpx(g, 4, E + 2, 24, 0.05 + rr() * 0.9, 0.05 + rr() * 0.9, P.t(rr() < 0.5 ? '#9d9688' : '#b9b2a3'));
    diaEdge(g, 0, E, CELL, 12, P.t('#ddd6c7')); diaEdge(g, 0, E, CELL, 3, P.t('#a69f90'));
    if ((v & 3) === 1) {   // lift machine room: louvres on one side, a door on the other
      box(g, 9, E + 1, 12, 7, P.t('#a7a89f'), P.l('#8b8c84'), P.r('#6e6f68'));
      for (let j = 1; j < 7; j += 2) for (let i = 1; i < 5; i++) pR(g, 9, E + 1, 12, i, j, P.r('#55564f'));
      for (let j = 2; j < 7; j++) for (let i = 2; i < 4; i++) pL(g, 9, E + 1, 12, i, j, P.l('#4a4b45'));
      diaEdge(g, 9, E + 1, 12, 12, P.t('#c4c5bc'));
    }
  }
};

// ---------- decks: planking, a safety edge, real railings ----------
function railings2(g, ty, nb, rail, hi, post) {
  for (const which of [1, 2, 4, 8]) {
    if (nb & which) continue;
    for (let i = 0; i < 16; i++) {
      const k = i >> 1, x = (which === 2 || which === 8) ? i : 31 - i, y = (which === 1 || which === 2) ? ty + 7 - k : ty + 8 + k;
      g.fillStyle = hi; g.fillRect(x, y - 9, 1, 1);
      g.fillStyle = rail; g.fillRect(x, y - 8, 1, 1); g.fillRect(x, y - 4, 1, 1);
      if ((i & 3) === 0) { g.fillStyle = post; g.fillRect(x, y - 8, 1, 8); }
    }
  }
}
DRAW2.DECK = (g, v, E, P, at) => {
  const ty = E + 18, ax = v & 1, nb = (v >> 1) & 15;
  box(g, 0, ty, CELL, 6, P.t('#9a9488'), P.l('#6f6a5f'), P.r('#57534a'));
  const rnd = mulberry32(hash3(at.x, at.y, at.z) + 11);
  for (let k = 1; k < 8; k++) {      // planks: joints along the deck, a staggered butt joint in each
    const s = k / 8, c = P.t(k & 1 ? '#8b8579' : '#a49e92');
    if (ax === 0) tline(g, 0, ty, CELL, 0, s, 1, s, c); else tline(g, 0, ty, CELL, s, 0, s, 1, c);
    const b = 0.2 + rnd() * 0.6;
    if (ax === 0) tpx(g, 0, ty, CELL, b, s + 0.06, P.t('#7c776c')); else tpx(g, 0, ty, CELL, s + 0.06, b, P.t('#7c776c'));
  }
  const F = faceOf(g, ty);
  for (let i = 0; i < 16; i++) { F.L(i, 0, P.l('#8a8478')); F.R(i, 0, P.r('#6c675d')); F.L(i, 5, P.l('#57534a')); F.R(i, 5, P.r('#45423b')); if ((i & 3) === 3) { F.L(i, 2, P.l('#625d54')); F.R(i, 2, P.r('#4d4a42')); } }
  diaEdge(g, 0, ty, CELL, 15 & ~nb, P.t('#d9ae4a'));
  diaEdge(g, 2, ty + 1, 28, 15 & ~nb, P.t('#8f7a3e'));
  railings2(g, ty, nb, P.t('#4a4f52'), P.t('#868c8f'), P.l('#3a3e41'));
};

// ---------- water: depth under the far walls, ripples and glints ----------
DRAW2.WATER = (g, v, E, P, at) => {
  const ty = E + 16;
  box(g, 0, ty, CELL, 8, P.t('#2b5853'), P.l('#6b645a'), P.r('#524c44'));
  dia(g, 0, ty, CELL, P.t('#2b5853'));
  diaEdge(g, 0, ty, CELL, 3, P.t('#1f3f3b')); diaEdge(g, 2, ty + 1, 28, 3, P.t('#24504a'));
  const rnd = mulberry32(hash3(at.x, at.y, 1));
  for (let k = 0; k < 5; k++) { const a = 0.15 + rnd() * 0.7, b = 0.15 + rnd() * 0.7; tpx(g, 0, ty, CELL, a, b, P.t('#3a776f'), 3); if (rnd() < 0.5) tpx(g, 0, ty, CELL, a + 0.04, b - 0.04, P.t('#5f9a8f'), 1); }
  const F = faceOf(g, ty);
  for (let i = 0; i < 16; i++) { F.L(i, 0, P.l('#4e6a63')); F.R(i, 0, P.r('#3d544f')); F.L(i, 1, P.l('#5c574e')); }
};

// ---------- capsules: a moulded pod in a steel cage ----------
function cage2(g, E, P, front) {
  const cl = P.l('#9a9283'), cr = P.r('#766f63'), ct = P.t('#b8b09f'), cd = P.l('#7e776a');
  if (!front) { box(g, 0, E + 20, CELL, 4, P.t('#8f887b'), P.l('#6f695e'), P.r('#58534b')); R_(g, 15, E, 2, 20, P.r('#5a544b')); R_(g, 14, E, 1, 20, P.l('#6e675c')); return; }
  const F = faceOf(g, E);
  for (let j = 0; j < 20; j++) { F.L(0, j, cl); F.L(1, j, cd); F.L(14, j, ct); F.L(15, j, cl); F.R(0, j, cr); F.R(1, j, P.r('#625c51')); F.R(14, j, cr); F.R(15, j, P.r('#625c51')); }
  for (let i = 0; i < 16; i++) { F.L(i, 0, ct); F.L(i, 1, cd); F.R(i, 0, cr); F.R(i, 1, P.r('#5c564b')); }
  diaEdge(g, 0, E, CELL, 15, ct);
  for (const [put, i] of [[F.L, 0], [F.L, 14], [F.R, 14]]) { put(i, 0, P.t('#d8d0bf')); put(i + 1, 1, P.l('#5a544b')); }   // bolted joints
}
DRAW2.CAPSULE = (g, v, E, P, at) => {
  const C = CAPC[v & 3], ws = (v >> 2) & 1, det = (v >> 3) & 3, roof = v & 32;
  cage2(g, E, P, false);
  const bx = 4, by = E + 4, w = 24;
  box(g, bx, by, w, 18, P.t(C[0]), P.l(C[1]), P.r(C[2]));
  const F = faceOf(g, by, w, bx);
  for (let i = 0; i < 12; i++) { F.L(i, 0, P.l(lt(C[1], 0.22))); F.R(i, 0, P.r(lt(C[2], 0.12))); F.L(i, 17, P.l(dk(C[1], 0.22))); F.R(i, 17, P.r(dk(C[2], 0.25))); }
  for (const [put, sh, c] of [[F.L, P.l, C[1]], [F.R, P.r, C[2]]]) { put(0, 0, sh(dk(c, 0.3))); put(0, 17, sh(dk(c, 0.35))); put(11, 0, sh(dk(c, 0.15))); put(11, 17, sh(dk(c, 0.35))); }   // moulded corners
  const win = ws ? F.R : F.L, other = ws ? F.L : F.R, sh = ws ? P.r : P.l, osh = ws ? P.l : P.r, body = C[ws ? 2 : 1], obody = C[ws ? 1 : 2];
  // the window: a rounded pane with a bright rim, a sky glint and a half-drawn curtain
  const lit = at.capLit;
  for (let i = 2; i < 10; i++) for (let j = 3; j < 14; j++) {
    const cornerOut = (i === 2 || i === 9) && (j === 3 || j === 13), rim = i === 2 || i === 9 || j === 3 || j === 13;
    if (cornerOut) continue;
    let c;
    if (rim) c = sh(lt(body, 0.32));
    else if (lit) c = j < 6 ? lt(lit, 0.3) : lit;
    else c = sh(((i + j) % 9) < 2 && j < 9 ? '#7b8a8f' : j > 10 ? '#1f2325' : '#2a2e30');
    if (!rim && i >= 7 && j < 12) c = lit ? dk(lit, 0.2) : sh('#8f897c');   // curtain
    win(i, j, c);
  }
  for (let i = 3; i < 9; i++) win(i, 14, sh(dk(body, 0.3)));
  // the blank side: a louvred vent, a service hatch, rivets
  for (let j = 4; j < 12; j += 2) for (let i = 2; i < 7; i++) { other(i, j, osh(dk(obody, 0.35))); other(i, j + 1, osh(lt(obody, 0.08))); }
  for (let j = 3; j < 15; j++) { other(8, j, osh(dk(obody, 0.2))); other(10, j, osh(dk(obody, 0.2))); }
  for (let i = 8; i <= 10; i++) { other(i, 3, osh(dk(obody, 0.2))); other(i, 14, osh(dk(obody, 0.2))); }
  other(9, 8, osh(lt(obody, 0.25)));
  for (const [i, j] of [[1, 2], [1, 15], [11, 2], [11, 15]]) other(i, j, osh(dk(obody, 0.28)));
  // top: a seam and a little skylight
  tline(g, bx, by, w, 0.5, 0.08, 0.5, 0.92, P.t(dk(C[0], 0.12)));
  dia(g, bx + 13, by + 5, 6, P.t('#5a6a70')); diaEdge(g, bx + 13, by + 5, 6, 12, P.t(lt(C[0], 0.2)));
  if (roof) {
    if (det === 1) { box(g, 9, E + 3, 10, 4, P.t('#a9a59f'), P.l('#8d8a84'), P.r('#6f6c67')); dia(g, 11, E + 4, 6, P.t('#4b4a47')); }
    if (det === 2) {   // a planter
      box(g, 14, E + 7, 10, 3, P.t('#5b4631'), P.l('#7a5a3e'), P.r('#5f452f'));
      const rr = mulberry32(hash3(at.x, at.y, 5));
      for (let k = 0; k < 16; k++) { const x = 15 + Math.floor(rr() * 8), y = E + 4 + Math.floor(rr() * 5); R_(g, x, y, 1, 1, P.t(rr() < 0.5 ? '#6f9f48' : '#4f7d38')); }
      R_(g, 17, E + 3, 1, 1, '#e2b35b'); R_(g, 21, E + 5, 1, 1, '#d9785a');
    }
    if (det === 3) { R_(g, 12, E - 4, 1, 10, P.l('#3a3836')); R_(g, 13, E - 4, 1, 10, P.r('#2a2826')); R_(g, 10, E - 2, 6, 1, P.t('#55534f')); R_(g, 11, E + 1, 4, 1, P.t('#55534f')); R_(g, 12, E - 5, 2, 1, '#e2573f'); }
  }
  cage2(g, E, P, true);
};

// ---------- terraces and trees ----------
function terrace2(g, E, P, at) {
  const ty = E + 18;
  box(g, 0, ty, CELL, 6, P.t('#5d893d'), P.l('#7a7367'), P.r('#5f5a51'));
  const F = faceOf(g, ty);
  for (let i = 0; i < 16; i++) { F.L(i, 0, P.l('#5b4631')); F.L(i, 1, P.l('#4d3b29')); F.R(i, 0, P.r('#4a3927')); F.R(i, 1, P.r('#3e3021')); F.L(i, 5, P.l('#625c51')); F.R(i, 5, P.r('#4b4740')); }
  const rnd = mulberry32(hash3(at.x, at.y, at.z) + 5);
  for (let k = 0; k < 70; k++) { const a = 0.04 + rnd() * 0.92, b = 0.04 + rnd() * 0.92, r = rnd(); tpx(g, 0, ty, CELL, a, b, P.t(r < 0.4 ? '#72a04c' : r < 0.8 ? '#4c7434' : '#86b35c')); }
  for (let k = 0; k < 7; k++) { const a = 0.1 + rnd() * 0.8, b = 0.1 + rnd() * 0.8; tpx(g, 0, ty - 1, CELL, a, b, P.t('#7fb055')); }   // tufts
  diaEdge(g, 0, ty, CELL, 12, P.t('#8a8377'));
}
DRAW2.TREE = (g, v, E, P, at) => {
  terrace2(g, E, P, at);
  const sp = v & 3, base = E + 26, cx = 16, rnd = mulberry32(v * 97 + 11 + hash3(at.x, at.y, 3));
  const C = [P.t('#9ac46a'), P.t('#7aad53'), P.t('#5f9446'), P.l('#477d38'), P.r('#2f5d2b'), P.r('#22451f')];
  if (sp === 1) {   // conifer: stacked tiers, lit left, shadowed right, a ragged hem on each
    R_(g, cx - 1, base - 7, 1, 7, P.l('#6a4c36')); R_(g, cx, base - 7, 1, 7, P.r('#4b3526'));
    const tiers = [[base - 6, 13, 10], [base - 14, 11, 10], [base - 22, 8, 9], [base - 29, 5, 8]];
    for (const [y1, hw, h] of tiers) for (let dy = 0; dy < h; dy++) {
      const y = y1 - h + dy + 1, half = Math.round(hw * (dy + 1) / h);
      for (let dx = -half; dx <= half; dx++) {
        if (dy === h - 1 && ((dx + 40) % 3 === 0)) continue;           // ragged hem
        const s = dx / Math.max(1, half) + (rnd() - 0.5) * 0.5;
        g.fillStyle = dy === 0 ? C[1] : s < -0.55 ? C[1] : s < -0.1 ? C[2] : s < 0.45 ? C[3] : s < 0.8 ? C[4] : C[5];
        if (dy === h - 1 && dx > 0) g.fillStyle = C[5];
        g.fillRect(cx + dx, y, 1, 1);
      }
    }
    R_(g, cx, base - 38, 1, 2, C[1]);
    return;
  }
  // broadleaf: a trunk that forks, a crown of overlapping lobes lit from the upper left
  R_(g, cx - 1, base - 11, 2, 11, P.l('#6a4c36')); R_(g, cx + 1, base - 11, 1, 11, P.r('#4b3526'));
  R_(g, cx - 3, base - 14, 2, 4, P.l('#5e4330')); R_(g, cx + 2, base - 15, 2, 5, P.r('#4b3526'));
  const cy = base - 21, lobes = [[-7, 2, 7], [7, 1, 7], [0, -5, 8], [-4, 6, 6], [5, 6, 6], [-9, -3, 5], [8, -5, 5], [1, 3, 7]];
  const cov = new Map();
  for (const [lx, ly, r] of lobes) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const d2 = (dx * dx + dy * dy) / (r * r); if (d2 > 1 - rnd() * 0.12) continue;
    const s = (dx * 0.6 + dy * 0.8) / r + (rnd() - 0.5) * 0.45, key = (cx + lx + dx) + ',' + (cy + ly + dy);
    cov.set(key, s);                                                     // later lobes sit in front
  }
  for (const [key, s] of cov) {
    const [x, y] = key.split(',').map(Number);
    const below = !cov.has(x + ',' + (y + 1));
    g.fillStyle = below ? C[5] : s < -0.7 ? C[0] : s < -0.25 ? C[1] : s < 0.15 ? C[2] : s < 0.55 ? C[3] : C[4];
    g.fillRect(x, y, 1, 1);
  }
  for (let k = 0; k < 9; k++) { const a = rnd() * 6.28, r = rnd() * 7; g.fillStyle = '#b6d987'; g.fillRect(Math.round(cx - 3 + Math.cos(a) * r), Math.round(cy - 4 + Math.sin(a) * r * 0.7), 1, 1); }
};

// ---------- scene ----------
const TOPS = { WATER: 0.25, DECK: 0.25, TERRACE: 0.25, TREE: 0.6, OLD: 1, CORE: 1, CAPSULE: 1 };
const EXTRA2 = { TREE: 16 };
async function renderHires(data) {
  const W2 = data.size[0] * K2, H2 = data.size[1] * K2, AX = data.anchor[0] * K2, AY = data.anchor[1] * K2;
  const cv = document.createElement('canvas'); cv.width = W2; cv.height = H2;
  const g = cv.getContext('2d');
  g.fillStyle = '#1b1d1f'; g.fillRect(0, 0, W2, H2);
  const dep = new Float32Array(W2 * H2).fill(-1e9);
  const at = new Map(); for (const c of data.cells) at.set(c.x + ',' + c.y + ',' + c.z, c);
  const order = [...data.cells].sort((a, b) => a.z - b.z || (a.x + a.y) - (b.x + b.y) || a.x - b.x);
  for (const c of order) {
    const E = EXTRA2[c.name] || 0, sc = document.createElement('canvas'); sc.width = CELL; sc.height = 40 + E;
    const sg = sc.getContext('2d'), wx = c.x + 28, wy = c.y + 28;
    // the same lit windows the game chose (facadeLights, style 1, day)
    const lit = [{}, {}];
    if (c.name === 'OLD' && ((c.vv >> 8) & 15) === 1) for (const side of [0, 1]) ribbonRuns((c.vv & 255) + side * 13).forEach((r, k) => { const h = hash3(wx * 7 + k, wy * 13 + side, c.z * 31 + 1); if ((h & 255) / 256 < 0.10) lit[side][k] = WARM[(h >>> 8) & 3]; });
    const capLit = c.name === 'CAPSULE' && (hash3(wx, wy, c.z) & 255) / 256 < 0.10 ? WARM[(hash3(wx, wy, c.z) >>> 8) & 3] : null;
    (DRAW2[c.name] || (() => {}))(sg, c.vv, E, painter(c.q), { x: wx, y: wy, z: c.z, lit, capLit });
    const X = AX + (c.x - c.y) * 16, Y = AY + (c.x + c.y) * 8 - c.z * 24, sx = X - 16, sy = Y - 24 - E;
    g.drawImage(sc, sx, sy);
    // per-pixel depth, the game's formulas on the doubled grid
    const m = sg.getImageData(0, 0, sc.width, sc.height).data, top = TOPS[c.name] ?? 1, u = c.x, v = c.y, z = c.z;
    for (let yy = 0; yy < sc.height; yy++) for (let xx = 0; xx < sc.width; xx++) {
      if (!m[(yy * sc.width + xx) * 4 + 3]) continue;
      const px = sx + xx, py = sy + yy; if (px < 0 || py < 0 || px >= W2 || py >= H2) continue;
      const d = (px + 0.5 - AX) / K2 / 8, Yr = (py + 0.5 - AY) / K2 + z * 12;
      let D = (u + v + 1) * 1.5 + z + top * 0.5;
      const st = (Yr + top * 12) / 4, ut = (st + d) / 2, vt = (st - d) / 2;
      if (ut >= u && ut <= u + 1 && vt >= v && vt <= v + 1) D = st * 1.5 + z + top;
      else { const ul = v + 1 + d, vr = u + 1 - d;
        if (ul >= u && ul <= u + 1) { const sl = ul + v + 1; D = sl * 1.5 + z + (sl * 4 - Yr) / 12; }
        else if (vr >= v && vr <= v + 1) { const sr = u + 1 + vr; D = sr * 1.5 + z + (sr * 4 - Yr) / 12; } }
      dep[py * W2 + px] = D;
    }
  }
  drawWires2(g, data, dep, W2, H2, AX, AY);
  return cv;
}

// ---------- cables at 2x: a real tube profile, outlined, banded ties ----------
const proj2 = (AX, AY, p) => [AX + (p[0] - p[1]) * 16, AY + (p[0] + p[1]) * 8 - p[2] * 24];
const dkey = p => (p[0] + p[1]) * 1.5 + p[2];
function wpal2(hex) { const hi = lt(hex, 0.28); return [shade(hi, 't', 4), shade(hex, 'l', 4), shade(hex, 'r', 4), shade(dk(hex, 0.78), 'l', 4), shade(lt(hex, 0.55), 't', 4)]; }
// profiles (top to bottom across the tube): 4 is a specular glint, 0 highlight, 1 body, 2 shadow, 3 outline
const PROF2 = [[0, 1, 2], [3, 0, 4, 1, 2, 3], [3, 4, 0, 1, 1, 1, 2, 2, 3], [3, 4, 0, 1, 1, 1, 1, 2, 2, 2, 3]];
function drawWires2(g, data, dep, W2, H2, AX, AY) {
  const segs = [], put = (x, y, c, D) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= W2 || y >= H2) return; if (dep[y * W2 + x] > D + 0.12) return; g.fillStyle = c; g.fillRect(x, y, 1, 1); };
  data.cables.forEach((c, ci) => {
    for (let i = 0; i + 1 < c.pts.length; i++) { const a = c.pts[i], b = c.pts[i + 1]; segs.push({ ci, i, a, b, k: dkey([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]) }); }
    for (const p of [c.pts[0], c.pts[c.pts.length - 1]]) segs.push({ sock: c, p, k: dkey(p) - 0.2 });
  });
  for (const t of data.ties) segs.push({ tie: t, k: dkey(t.c) + 0.3 });
  segs.sort((a, b) => a.k - b.k);
  for (const s of segs) {
    if (s.sock) {   // a socket: a low round boss on the floor the cable plugs into
      const c = s.sock, q = proj2(AX, AY, [s.p[0], s.p[1], s.p[2] - c.r]), X = Math.round(q[0]), Y = Math.round(q[1]), r = (PROF2[c.gi].length >> 1) + 1, D = dkey(s.p) + 0.2;
      for (let y = -2; y <= 2; y++) for (let x = -r - 1; x <= r + 1; x++) {
        const e = (x * x) / ((r + 1.5) * (r + 1.5)) + (y * y) / 6.5; if (e > 1) continue;
        put(X + x, Y + y, e > 0.62 ? '#24282c' : y < 0 ? '#6a7077' : '#454a50', D);
      }
      continue;
    }
    if (s.tie) {    // the band: a 2-px ring round the bundle, front half, with a glint
      const t = s.tie, rr = t.R * 0.86, N = 48, k0 = dkey(t.c);
      let prev = null;
      for (let j = 0; j <= N; j++) {
        const th = j / N * Math.PI * 2, ca = Math.cos(th) * rr, sa = Math.sin(th) * rr;
        const q3 = [t.c[0] + t.axis[0] * ca + t.up[0] * sa, t.c[1] + t.axis[1] * ca + t.up[1] * sa, t.c[2] + t.axis[2] * ca + t.up[2] * sa];
        const front = dkey(q3) >= k0 - 0.02, q = proj2(AX, AY, [q3[0], q3[1], q3[2] + 0.02]);
        if (prev && front && prev.front) {
          const n = Math.max(1, Math.ceil(Math.hypot(q[0] - prev.q[0], q[1] - prev.q[1])));
          for (let m = 0; m <= n; m++) { const x = lerp(prev.q[0], q[0], m / n), y = lerp(prev.q[1], q[1], m / n);
            put(x, y - 1, sa > 0.3 * rr ? '#f4f1e8' : '#d6d1c4', k0 + 1); put(x, y, '#bdb7aa', k0 + 1); put(x, y + 1, '#6f6b63', k0 + 1); }
        }
        prev = { q, front };
      }
      continue;
    }
    const c = data.cables[s.ci], prof = PROF2[c.gi], pal = wpal2(c.hex), a = proj2(AX, AY, [s.a[0], s.a[1], s.a[2] + c.r * 0.6]), b = proj2(AX, AY, [s.b[0], s.b[1], s.b[2] + c.r * 0.6]);
    const dx = b[0] - a[0], dy = b[1] - a[1], n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)))), horiz = Math.abs(dx) >= Math.abs(dy), half = (prof.length - 1) / 2;
    const banded = c.gi >= 2 && s.i % 5 === 0;                                // the hose's ribbing
    for (let m = 0; m <= n; m++) {
      const x = a[0] + dx * m / n, y = a[1] + dy * m / n;
      for (let j = 0; j < prof.length; j++) {
        let ci = prof[j]; if (banded && ci !== 3) ci = ci === 4 || ci === 0 ? 1 : 2;
        if (horiz) put(Math.floor(x), Math.round(y - half - 0.5) + j, pal[ci], s.k); else put(Math.round(x - half - 0.5) + j, Math.floor(y), pal[ci], s.k);
      }
    }
  }
}
window.renderHires = renderHires;
