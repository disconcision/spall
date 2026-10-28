// ==========================================================================
// Facades: window styles for old buildings and habitation capsules. A style
// is chosen per neighbourhood (4x4 cells, per few levels) so streets read as
// coherent buildings rather than a patchwork. The sprite paints glass and
// frames; lightsFor lights individual windows from the same layout.
// Styles: 1 ribbon, 2 slots, 3 curtain, 4 clerestory, 5 deep punched,
//         6 kowloon, 7 lattice, 8 portholes, 9 loggias.
// ==========================================================================
const FACADE_W = {
  old: [[1, 14], [2, 10], [3, 5], [4, 10], [5, 20], [6, 22], [7, 5], [8, 5], [9, 9]],
  cap: [[1, 30], [2, 15], [3, 15], [4, 10], [5, 8], [6, 7], [7, 7], [8, 4], [9, 4]]
};
function facadeStyle(kind, x, y, z) {
  const w = FACADE_W[kind], tot = w.reduce((s, q) => s + q[1], 0);
  let r = (hash3((x >> 2) + kind.length * 31, y >> 2, (z >> 2) + 7) % 1000) / 1000 * tot;
  for (const [st, wt] of w) { if (r < wt) return st; r -= wt; }
  return 1;
}
// layout of one face: C columns, R usable rows. Returns { px: [[i, j, kind]], wins: [[[i, j], ...]] }
// kinds: 'g' glass, 'f' light frame/sill, 'd' dark reveal, 'r' rail, 'a' AC unit
const FACADE_CACHE = new Map();
function facadeLayout(style, C, R, seed) {
  const key = style + ':' + C + ':' + R + ':' + seed;
  let L = FACADE_CACHE.get(key); if (L) return L;
  const px = [], wins = [], rnd = mulberry32(seed * 977 + style * 31 + C);
  const win = cellsArr => { wins.push(cellsArr); for (const [i, j] of cellsArr) px.push([i, j, 'g']); };
  const rect = (i0, j0, w, h) => { const a = []; for (let i = i0; i < i0 + w; i++) for (let j = j0; j < j0 + h; j++) a.push([i, j]); return a; };
  switch (style) {
    case 1: {   // ribbon glazing: one band per level, lit in runs
      const j0 = Math.max(1, Math.round(R * 0.3)), h = Math.max(2, Math.round(R * 0.32));
      for (let i = 0; i < C; i++) px.push([i, j0 - 1, 'f']);
      let i = 0; while (i < C) { const w = Math.min(C - i, 2 + Math.floor(rnd() * 2)); win(rect(i, j0, w, h)); i += w; }
      break;
    }
    case 2: {   // vertical slots
      for (let i = 1; i < C; i += 3) win(rect(i, 1, 1, R - 2));
      break;
    }
    case 3: {   // curtain grid: all glass, mullions and transoms
      for (let i = 0; i < C; i++) for (let j = 0; j < R; j++) if (i % 2 === 1 || j % 4 === 3) px.push([i, j, 'f']);
      for (let i = 0; i < C; i += 2) for (let j = 0; j < R; j += 4) win(rect(i, j, 1, Math.min(3, R - j)));
      break;
    }
    case 4: {   // clerestory: a high strip under the slab
      for (let i = 0; i < C; i += 3) { const w = Math.min(2, C - i); win(rect(i, 0, w, 2)); if (i + 2 < C) px.push([i + 2, 0, 'f'], [i + 2, 1, 'f']); }
      break;
    }
    case 5: {   // deep punched: one window, shadowed reveal, bright sill
      const w = Math.max(2, Math.round(C / 2)), h = Math.max(3, Math.round(R * 0.45)), i0 = Math.floor((C - w) / 2), j0 = Math.max(1, Math.round(R * 0.25));
      for (let i = i0; i < i0 + w; i++) px.push([i, j0, 'd']);
      for (let j = j0; j < j0 + h; j++) px.push([i0, j, 'd']);
      win(rect(i0 + 1, j0 + 1, w - 1, h - 1));
      for (let i = i0; i < i0 + w; i++) px.push([i, j0 + h, 'f']);
      break;
    }
    case 6: {   // kowloon: two or three windows of any size, AC units, the odd sign
      const n = 1 + Math.floor(rnd() * 3);
      for (let k = 0; k < n; k++) {
        const w = 1 + Math.floor(rnd() * Math.min(4, C - 1)), h = 1 + Math.floor(rnd() * Math.max(1, R - 3)), i0 = Math.floor(rnd() * (C - w + 1)), j0 = Math.floor(rnd() * Math.max(1, R - h - 1));
        win(rect(i0, j0, w, h));
        if (rnd() < 0.5 && j0 + h < R) px.push([i0, j0 + h, 'a'], [Math.min(C - 1, i0 + 1), j0 + h, 'a']);
      }
      if (rnd() < 0.12) for (let j = 1; j < R - 1; j++) px.push([C - 1, j, j % 2 ? 's' : 't']);
      break;
    }
    case 7: {   // lattice screen over glass
      const a = []; for (let i = 0; i < C; i++) for (let j = 1; j < R - 1; j++) if ((i + j) % 2 === 0) a.push([i, j]);
      win(a);
      break;
    }
    case 8: {   // portholes
      const cs = C >= 8 ? [2, 5] : [Math.floor(C / 2) - 1];
      const jc = Math.floor(R / 2) - 1;
      for (const ic of cs) { win([[ic, jc], [ic + 1, jc], [ic, jc + 1], [ic + 1, jc + 1]]); px.push([ic, jc - 1, 'f'], [ic + 1, jc - 1, 'f'], [ic, jc + 2, 'f'], [ic + 1, jc + 2, 'f'], [ic - 1, jc, 'f'], [ic - 1, jc + 1, 'f'], [ic + 2, jc, 'f'], [ic + 2, jc + 1, 'f']); }
      break;
    }
    case 9: {   // loggias: a recess with a rail, a lit door at the back
      for (let i = 1; i < C - 1; i++) for (let j = 1; j < R - 1; j++) px.push([i, j, j < 3 ? 'd' : 'k']);
      win(rect(Math.floor(C / 2) - 1, 3, 2, Math.max(1, R - 5)));
      for (let i = 1; i < C - 1; i++) px.push([i, R - 3, 'r']);
      if (rnd() < 0.4) px.push([1, R - 4, 'p'], [2, R - 4, 'p']);
      break;
    }
  }
  L = { px, wins }; FACADE_CACHE.set(key, L);
  return L;
}
const FAC_COL = { g: '#262a2d', f: '#d2ccbf', d: '#2a2724', k: '#3a3632', r: '#d8d0bf', a: '#c9c4ba', p: '#5f8f42', s: '#ff6b4a', t: '#f4d35e' };
// paint both faces of a sprite: put(face, i, j, colour)
function paintFacade(style, C, R, seed, putL, putR, P, wall) {
  for (const [side, put, sh] of [[0, putL, P.l], [1, putR, P.r]]) {
    const L = facadeLayout(style, C, R, seed + side * 13);
    for (const [i, j, k] of L.px) put(i, j, k === 's' || k === 't' ? FAC_COL[k] : sh(k === 'g' && S.tod === 'day' && (i + j) % 5 === 0 ? '#5f6d74' : FAC_COL[k]));
  }
}
// where an old building's / capsule's face pixels land inside its sprite
const FACE_GEOM = {
  old: { C: 8, R: 11, put: (side, x, y, i, j) => side ? [x + 8 + i, y + 8 - (i >> 1) + j] : [x + i, y + 5 + (i >> 1) + j] },
  cap: { C: 6, R: 8, put: (side, x, y, i, j) => side ? [x + 8 + i, y + 8 - (i >> 1) + j] : [x + 2 + i, y + 6 + (i >> 1) + j] }
};
// lit windows for restyled cells (called from lightsFor)
function facadeLights(g, kind, style, seed, x, y, z, sx, sy, E, litP) {
  const G = FACE_GEOM[kind];
  for (const side of [0, 1]) {
    if (faceOccluded(...toRot(x, y), z, side)) continue;
    const L = facadeLayout(style, G.C, G.R, seed + side * 13);
    L.wins.forEach((w, k) => {
      const h = hash3(x * 7 + k, y * 13 + side, z * 31 + style);
      if ((h & 255) / 256 >= litP) return;
      g.fillStyle = style === 7 ? '#a8783a' : WARM[(h >>> 8) & 3];   // light through a lattice is dimmer
      for (const [i, j] of w) { const [px, py] = G.put(side, sx, sy + E, i, j); g.fillRect(px, py, 1, 1); }
    });
  }
}
