'use strict';
/* ==========================================================================
   SPALL (working title; was Stratum) — layer-view study for an isometric megastructure builder.
   Single-file prototype: canvas 2D, procedural pixel sprites, Web Audio.
   ========================================================================== */

// ---------- world constants ----------
const W = 64, D = 64, NL = 30, G = 2;          // footprint, levels, ground index (L0)
const LH = 12, HT = 7;                           // level height px, cut height px (plan cut ~0.6 storey)
const CW = (W + D) * 8 + 16, CH = (W + D) * 4 + 40, OX = D * 8 + 8, OY = 36;     // per-level cache canvas + anchor origin
const GAP = 44;                                  // exploded gap between strata (px)
const REDUCED = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

const LEVELS = [
  ['B2', 'cistern'], ['B1', 'undercroft'], ['L0', 'street'], ['L1', 'arcade'],
  ['L2', 'lower infill'], ['L3', 'rooftop passages'], ['L4', 'transit deck'], ['L5', 'habitation'],
  ['L6', 'tube crossing'], ['L7', 'sky garden'], ['L8', 'habitation'], ['L9', 'habitation'],
  ['L10', 'upper transit'], ['L11', 'habitation'], ['L12', 'canopy'], ['L13', 'canopy walk'],
  ['L14', 'crown'], ['L15', 'crane deck'],
  // above the generated city: room for upper cities, lids and spires
  ['L16', 'high habitation'], ['L17', 'high habitation'], ['L18', 'high transit'], ['L19', 'high habitation'],
  ['L20', 'high habitation'], ['L21', 'high habitation'], ['L22', 'high canopy'], ['L23', 'high canopy'],
  ['L24', 'spire'], ['L25', 'spire'], ['L26', 'spire'], ['L27', 'sky']
].map(([code, name], z) => ({ code, name, z }));
const STRATA = [[0, 1, 'undercroft'], [2, 3, 'street + arcade'], [4, 5, 'lower infill'], [6, 6, 'transit deck'],
  [7, 8, 'habitation'], [9, 9, 'sky garden'], [10, 11, 'habitation'], [12, 12, 'upper transit'],
  [13, 13, 'habitation'], [14, 15, 'canopy'], [16, 17, 'crown'],
  [18, 20, 'high habitation'], [21, 23, 'high habitation'], [24, 25, 'high canopy'], [26, 29, 'spire']];
const STRATUM_OF = new Int8Array(NL);
STRATA.forEach((s, i) => { for (let z = s[0]; z <= s[1]; z++) STRATUM_OF[z] = i; });
const lvCode = z => LEVELS[z] ? LEVELS[z].code : '?';

// ---------- rng / hash ----------
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function hash3(x, y, z) {
  let h = (x * 374761393 + y * 668265263 + z * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return (h ^ (h >>> 16)) >>> 0;
}
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
let rr = mulberry32(99);   // runtime rng (reseeded on generate)

// ---------- colour ----------
const _rgb = new Map();
function rgbOf(hex) {
  let c = _rgb.get(hex);
  if (!c) { const n = parseInt(hex.slice(1), 16); c = [n >> 16 & 255, n >> 8 & 255, n & 255]; _rgb.set(hex, c); }
  return c;
}
function hexOf(r, g, b) { return '#' + ((1 << 24) | (clamp(r | 0, 0, 255) << 16) | (clamp(g | 0, 0, 255) << 8) | clamp(b | 0, 0, 255)).toString(16).slice(1); }
function mixHex(a, b, t) { const A = rgbOf(a), B = rgbOf(b); return hexOf(lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)); }
function rgba(hex, a) { const c = rgbOf(hex); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }

// time-of-day face multipliers: top / left (sun side at dusk) / right (shadow side)
const TODS = {
  day:   { t: [1.00, 0.99, 0.95], l: [0.97, 0.96, 0.93], r: [0.78, 0.81, 0.84], lit: 0.10, name: 'Day' },
  dusk:  { t: [0.84, 0.69, 0.58], l: [1.00, 0.74, 0.54], r: [0.50, 0.47, 0.50], lit: 0.46, name: 'Dusk' },
  night: { t: [0.30, 0.33, 0.37], l: [0.27, 0.29, 0.33], r: [0.20, 0.22, 0.26], lit: 0.66, name: 'Night' }
};
const LQ = [0.40, 0.54, 0.69, 0.85, 1.0, 1.12, 1.24];   // baked sky-light quantised (5, 6: sunlit, live lighting only)
function shadeRGB(hex, face, q) {
  const c = rgbOf(hex), m = TODS[S.tod][face], k = LQ[q];
  return 'rgb(' + clamp(c[0] * m[0] * k | 0, 0, 255) + ',' + clamp(c[1] * m[1] * k | 0, 0, 255) + ',' + clamp(c[2] * m[2] * k | 0, 0, 255) + ')';
}

// ---------- tiny 3x5 pixel font ----------
const FONT = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
  F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010',
  K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010',
  P: '110101110100100', Q: '010101101111011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010',
  Z: '111001010100111', 0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110',
  4: '101101111001001', 5: '111100110001110', 6: '011100111101111', 7: '111001010010010', 8: '111101111101111',
  9: '111101111001110', '.': '000000000000010', ',': '000000000010100', ':': '000010000010000', '-': '000000111000000',
  '+': '000010111010000', '/': '001001010100100', '(': '010100100100010', ')': '010001001001010', '%': '101001010100101',
  '#': '101111101111101', '>': '100010001010100', '<': '001010100010001', '=': '000111000111000', '_': '000000000000111',
  '|': '010010010010010', '[': '110100100100110', ']': '011001001001011', '↑': '010111010010010', '↓': '010010010111010',
  "'": '010010000000000', '@': '010101111100011', '·': '000000010000000', '×': '000101010101000', '*': '000101010101000',
  '!': '010010010000010', '?': '110001010000010', '▽': '111101010000000'
};
function ptext(g, s, x, y, col, shadow, sc) {
  s = String(s).toUpperCase(); sc = sc || 1;
  if (shadow) ptext(g, s, x + sc, y + sc, shadow, null, sc);
  g.fillStyle = col;
  let cx = x | 0; y |= 0;
  for (const ch of s) {
    const f = FONT[ch];
    if (f) for (let i = 0; i < 15; i++) if (f.charCodeAt(i) === 49) g.fillRect(cx + (i % 3) * sc, y + (i / 3 | 0) * sc, sc, sc);
    cx += 4 * sc;
  }
  return cx - x;
}
const ptextW = (s, sc) => (String(s).length * 4 - 1) * (sc || 1);
function plate(g, s, x, y, bg, fg, border) {   // pixel label on a plate
  const w = ptextW(s) + 4;
  if (border) { g.fillStyle = border; g.fillRect(x - 1, y - 1, w + 2, 9); }
  g.fillStyle = bg; g.fillRect(x, y, w, 7);
  ptext(g, s, x + 2, y + 1, fg);
  return w;
}

// ---------- element types ----------
const T = { EMPTY: 0, EARTH: 1, ROCK: 2, WATER: 3, STREET: 4, WALK: 5, OLD: 6, CORE: 7, LIFT: 8, TRUSS: 9, DECK: 10,
  TUBE: 11, FRAME: 12, CAPSULE: 13, TERRACE: 14, TREE: 15, PILLAR: 16, PIPE: 17, TANK: 18, VENT: 19, CANOPY: 20,
  ROOFWALK: 21, ANTENNA: 22, CRANE: 23, VAULT: 24, RISER: 25, LAMP: 26 };
// cat: support | infill | circ | land | util | earth ; op = light opacity ; poche = drawn as cut solid ; walk ; orient = has axis bit
const TI = [];
function defT(id, name, cat, op, o) { TI[id] = Object.assign({ id, name, cat, op, poche: false, walk: false, orient: false, tall: false, slab: false }, o || {}); }
defT(0, 'open air', 'void', 0);
defT(1, 'earth', 'earth', 1, { poche: true });
defT(2, 'bedrock', 'earth', 1, { poche: true });
defT(3, 'water', 'land', 0.1, { slab: true });
defT(4, 'street', 'circ', 0.9, { walk: true, slab: true, orient: true });
defT(5, 'plaza paving', 'circ', 0.9, { walk: true, slab: true });
defT(6, 'old building', 'infill', 1, { poche: true, tall: true });
defT(7, 'megacolumn core', 'support', 1, { poche: true, tall: true });
defT(8, 'lift shaft', 'support', 1, { poche: true, tall: true });
defT(9, 'transfer truss', 'support', 0.3, { tall: true });
defT(10, 'transit deck', 'circ', 0.85, { walk: true, slab: true, orient: true });
defT(11, 'enclosed corridor', 'circ', 0.35, { orient: true, tall: true });
defT(12, 'support frame (empty bay)', 'support', 0.2, { tall: true });
defT(13, 'habitation capsule', 'infill', 1, { poche: true, tall: true });
defT(14, 'garden terrace', 'land', 0.9, { walk: true, slab: true });
defT(15, 'tree', 'land', 0.55, { tall: true });
defT(16, 'deck pillar', 'support', 0.1, { tall: true });
defT(17, 'utility pipes', 'util', 0.3, { orient: true });
defT(18, 'cistern tank', 'util', 1, { poche: true, tall: true });
defT(19, 'vent stack', 'util', 0.4);
defT(20, 'solar canopy', 'util', 0.6);
defT(21, 'rooftop walkway', 'circ', 0.5, { walk: true, slab: true, orient: true });
defT(22, 'antenna mast', 'util', 0.05, { tall: true });
defT(23, 'gantry crane (drone depot)', 'util', 0.2, { tall: true });
defT(24, 'cistern column', 'support', 0.2, { tall: true });
defT(25, 'service riser', 'util', 0.3, { tall: true });
defT(26, 'lamp post', 'util', 0.02);
const PHASE_OF = t => { const c = TI[t].cat; return (c === 'support' || c === 'circ') ? 0 : c === 'infill' ? 1 : 2; };
const PHASE_NAME = ['structure', 'infill', 'fit-out'];
const isCirc = t => t && TI[t].cat === 'circ';

// ---------- world storage ----------
const NCELL = W * D * NL;
const cells = new Uint8Array(NCELL), vars = new Uint8Array(NCELL), flags = new Uint8Array(NCELL), light = new Float32Array(NCELL);
const F_WELL = 1, F_SIGN = 2, F_GRATE = 4;
const idx = (x, y, z) => (z * D + y) * W + x;
const inb = (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < W && y < D && z < NL;
const cell = (x, y, z) => inb(x, y, z) ? cells[idx(x, y, z)] : 0;
let WORLD = { cores: [], paths: [], wells: [], lifts: [], emitters: [], crane: null, fill: new Float32Array(NL), cistern: null };

// ---------- global UI/view state ----------
const S = {
  seed: 1729, mode: 'cut', level: 6, cutAnim: 6, cutFrom: 6, cutT: 1,
  explode: 0, explodeTarget: 0, ghost: false, shade: true, follow: false, tod: 'dusk', rot: 0, zoom: 2,
  cam: { x: 0, y: 120 }, camTarget: null, planCam: { x: 0, y: 0 }, secCam: { x: 0, y: 0 },
  floor: -1, hover: null, hoverStratum: -1, isoZoom: 2, safeL: 0, safeR: 0, cssW: 800, cssH: 600, tool: 'inspect', toolRot: 0, unit: null, captureH: 2, capture: null,
  secAxis: 'x', secIdx: 24, pins: [], time: 0, paused: false, bw: 400, bh: 300
};

// ---------- rotation (view turns in 90° steps) ----------
function toRot(x, y) {
  switch (S.rot) { case 1: return [D - 1 - y, x]; case 2: return [W - 1 - x, D - 1 - y]; case 3: return [y, W - 1 - x]; default: return [x, y]; }
}
function fromRot(u, v) {
  switch (S.rot) { case 1: return [v, D - 1 - u]; case 2: return [W - 1 - u, D - 1 - v]; case 3: return [W - 1 - v, u]; default: return [u, v]; }
}
function toRotF(px, py) {   // continuous point
  switch (S.rot) { case 1: return [D - py, px]; case 2: return [W - px, D - py]; case 3: return [py, W - px]; default: return [px, py]; }
}
function cellR(u, v, z) { if (u < 0 || v < 0 || u >= W || v >= D || z < 0 || z >= NL) return 0; const p = fromRot(u, v); return cells[idx(p[0], p[1], z)]; }
// world axis (0 = x, 1 = y) -> screen axis (0 = u, 1 = v)
const screenAxis = a => (a ^ (S.rot & 1));

function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function fmtTime(t) { const m = Math.floor(t / 60), s = Math.floor(t % 60); return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0'); }
const $ = id => document.getElementById(id);
// ==========================================================================
// World generation: old street grid, cores, decks, tubes, infill, gardens,
// canopy, light wells, undercroft. Seeded + deterministic.
// ==========================================================================
function setC(x, y, z, t, v) { if (!inb(x, y, z)) return; const i = idx(x, y, z); cells[i] = t; vars[i] = v || 0; }
const isEmpty = (x, y, z) => inb(x, y, z) && cells[idx(x, y, z)] === 0;
function coreAt(x, y) { for (const c of WORLD.cores) if (x >= c.x && x < c.x + c.s && y >= c.y && y < c.y + c.s) return c; return null; }
const coreCenter = c => [c.x + (c.s >> 1), c.y + (c.s >> 1)];
// something to stand on / hang from
function supportAt(x, y, z) {
  const b = cell(x, y, z - 1);
  if (b && b !== T.TREE && b !== T.WATER && b !== T.LAMP && b !== T.VENT && b !== T.ANTENNA) return true;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = cell(x + dx, y + dy, z); if (n === T.CORE || n === T.LIFT) return true; }
  return false;
}

function generate(seed) {
  const rng = mulberry32(seed);
  const R = rng, RI = (a, b) => a + Math.floor(rng() * (b - a + 1)), pick = a => a[Math.floor(rng() * a.length)];
  cells.fill(0); vars.fill(0); flags.fill(0);
  rr = mulberry32(seed ^ 0x5bd1e995);
  const Wd = WORLD = { cores: [], paths: [], wells: [], lifts: [], emitters: [], crane: null, fill: new Float32Array(NL), cistern: null, lots: [] };

  // 1. ground mass ------------------------------------------------------------
  for (let y = 0; y < D; y++) for (let x = 0; x < W; x++) { setC(x, y, 0, T.ROCK, hash3(x, y, 0) & 3 | 4); setC(x, y, 1, T.EARTH, hash3(x, y, 1) & 3); }

  // 2. undercroft: pillared cistern, service tunnels, plant rooms --------------
  const cw = RI(10, 13), chh = RI(8, 10), cx0 = RI(12, 20), cy0 = RI(18, 26);
  Wd.cistern = { x: cx0, y: cy0, w: cw, h: chh };
  for (let y = cy0; y < cy0 + chh; y++) for (let x = cx0; x < cx0 + cw; x++) {
    if ((x - cx0) % 3 === 1 && (y - cy0) % 3 === 1) { setC(x, y, 0, T.VAULT, 1); setC(x, y, 1, T.VAULT, 0); }
    else { setC(x, y, 0, T.WATER); setC(x, y, 1, T.EMPTY); }
  }
  const tunnels = [];
  for (let k = 0; k < 2; k++) tunnels.push({ axis: 0, c: RI(5, W - 6) });
  for (let k = 0; k < 2; k++) tunnels.push({ axis: 1, c: RI(5, D - 6) });
  for (const tn of tunnels) for (let s = 2; s < W - 2; s++) {
    const a = tn.axis === 0 ? [s, tn.c] : [tn.c, s], b = tn.axis === 0 ? [s, tn.c + 1] : [tn.c + 1, s];
    if (cell(a[0], a[1], 1) === T.EARTH) setC(a[0], a[1], 1, (s % 7 === 3) ? T.LAMP : T.EMPTY, 0);
    if (cell(b[0], b[1], 1) === T.EARTH) setC(b[0], b[1], 1, T.PIPE, tn.axis | ((tn.c & 1) << 1));
  }
  for (let k = 0; k < 3; k++) {
    const tn = pick(tunnels), s = RI(6, W - 10), side = R() < 0.5 ? -3 : 2;
    const bx = tn.axis === 0 ? s : tn.c + side, by = tn.axis === 0 ? tn.c + side : s;
    for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) if (cell(bx + dx, by + dy, 1) === T.EARTH) setC(bx + dx, by + dy, 1, T.EMPTY);
    if (inb(bx + 1, by + 1, 1)) setC(bx + 1, by + 1, 1, T.TANK, RI(0, 1));
    if (R() < 0.7 && inb(bx, by, 1)) setC(bx, by, 1, T.TANK, 1);
  }

  // 3. the old city at L0: streets + small buildings ---------------------------
  const roadLines = []; for (let r = 3; r < W - 4; r += 8) roadLines.push(r);
  const rx = new Uint8Array(W), ry = new Uint8Array(D);
  roadLines.forEach(r => { rx[r] = rx[r + 1] = 1; ry[r] = ry[r + 1] = 1; });
  const seg = v => v < 3 ? 0 : Math.floor((v - 5) / 8) + 1;
  const dropNS = new Set(), dropEW = new Set();
  roadLines.forEach(r => { for (let j = 0; j < Math.ceil(W / 8) + 1; j++) { if (R() < 0.17) dropNS.add(r * 10 + j); if (R() < 0.17) dropEW.add(r * 10 + j); } });
  const isRoad = (x, y) => {
    const ns = rx[x] && (ry[y] || !dropNS.has((rx[x - 1] ? x - 1 : x) * 10 + seg(y)));
    const ew = ry[y] && (rx[x] || !dropEW.has((ry[y - 1] ? y - 1 : y) * 10 + seg(x)));
    return ns || ew;
  };
  const road = new Uint8Array(W * D);
  for (let y = 0; y < D; y++) for (let x = 0; x < W; x++) if (isRoad(x, y)) {
    road[y * W + x] = 1;
    const ns = rx[x] && !ry[y], ew = ry[y] && !rx[x];
    let mark = 0, orient = ns ? 1 : 0;
    if (ns && (ry[y - 1] || ry[y + 1])) mark = 2;
    else if (ew && (rx[x - 1] || rx[x + 1])) mark = 2;
    else if (ns || ew) mark = ((ns ? y : x) & 1) ? 1 : 0;
    if (mark < 2 && (ns || ew) && R() < 0.035) mark = 4;
    setC(x, y, 2, T.STREET, orient | (mark << 1));
  }
  const taken = new Uint8Array(W * D);
  for (let y = 0; y < D; y++) for (let x = 0; x < W; x++) {
    if (road[y * W + x] || taken[y * W + x]) continue;
    let w = RI(2, 4), h = RI(2, 4);
    let ww = 0; while (ww < w && x + ww < W && !road[y * W + x + ww] && !taken[y * W + x + ww]) ww++;
    let hh = 0; outer: while (hh < h && y + hh < D) { for (let k = 0; k < ww; k++) if (road[(y + hh) * W + x + k] || taken[(y + hh) * W + x + k]) break outer; hh++; }
    for (let j = 0; j < hh; j++) for (let k = 0; k < ww; k++) taken[(y + j) * W + x + k] = 1;
    if (R() < 0.13 || ww * hh === 1) {
      for (let j = 0; j < hh; j++) for (let k = 0; k < ww; k++) setC(x + k, y + j, 2, T.WALK, 0);
      if (ww >= 2 && hh >= 2) setC(x + (ww >> 1), y + (hh >> 1), 2, T.TREE, RI(0, 3));
      else if (R() < 0.5) setC(x, y, 2, T.LAMP, 1);
    } else {
      const hgt = pick([1, 2, 2, 2, 3, 3]), mat = RI(0, 3);
      for (let j = 0; j < hh; j++) for (let k = 0; k < ww; k++) for (let z = 2; z < 2 + hgt; z++) setC(x + k, y + j, z, T.OLD, mat | (RI(0, 3) << 3));
      if (R() < 0.45) { const k = RI(0, ww - 1), j = RI(0, hh - 1), z = 2 + RI(0, hgt - 1); flags[idx(x + k, y + j, z)] |= F_SIGN; }
      if (R() < 0.2) { setC(x, y, 2 + hgt, T.VENT, 0); Wd.emitters.push({ x, y, z: 2 + hgt, k: 'vent' }); }
      Wd.lots.push({ x, y, w: ww, h: hh, hgt });
    }
  }

  // 4. megacolumn cores ---------------------------------------------------------
  const NCG = Math.floor((W - 10) / 16) + 1, skip = RI(0, NCG * NCG - 1);
  for (let j = 0; j < NCG; j++) for (let i = 0; i < NCG; i++) {
    if (j * NCG + i === skip) continue;
    const s = (i === 1 && j === 1) ? 4 : 3;
    Wd.cores.push({ x: 6 + i * 16 + RI(-2, 2), y: 6 + j * 16 + RI(-2, 2), s, top: RI(13, 15) });
  }
  Wd.cores.forEach((c, k) => { c.name = 'C' + (k + 1); });
  pick(Wd.cores).top = 16;
  for (const c of Wd.cores) {
    const lx = c.x + 1, ly = c.y + 1;
    for (let z = 0; z <= c.top; z++) for (let dy = 0; dy < c.s; dy++) for (let dx = 0; dx < c.s; dx++)
      setC(c.x + dx, c.y + dy, z, (c.x + dx === lx && c.y + dy === ly) ? T.LIFT : T.CORE, hash3(c.x + dx, c.y + dy, z) & 3);
    Wd.lifts.push({ x: lx, y: ly, top: c.top, z: RI(1, c.top), target: RI(0, c.top), wait: R() * 3, core: c });
  }

  // helpers for corridors
  function mst(list) {
    const edges = [], inT = [0];
    while (inT.length < list.length) {
      let best = null;
      for (const a of inT) for (let b = 0; b < list.length; b++) {
        if (inT.includes(b)) continue;
        const [ax, ay] = coreCenter(list[a]), [bx, by] = coreCenter(list[b]);
        const d = Math.abs(ax - bx) + Math.abs(ay - by);
        if (!best || d < best[2]) best = [a, b, d];
      }
      edges.push([list[best[0]], list[best[1]]]); inT.push(best[1]);
    }
    return edges;
  }
  function corridor(a, b, z, width, type, xFirst, kind) {
    const [ax, ay] = coreCenter(a), [bx, by] = coreCenter(b);
    const pts = [[ax, ay]]; let x = ax, y = ay;
    const stepTo = (tx, ty) => { while (x !== tx || y !== ty) { if (x !== tx) x += Math.sign(tx - x); else y += Math.sign(ty - y); pts.push([x, y]); } };
    if (xFirst) { stepTo(bx, ay); stepTo(bx, by); } else { stepTo(ax, by); stepTo(bx, by); }
    let run = [];
    const flush = () => { if (run.length >= 4) Wd.paths.push({ cells: run, z, kind }); run = []; };
    for (let k = 0; k < pts.length; k++) {
      const [px, py] = pts[k];
      if (coreAt(px, py)) { flush(); continue; }
      const n = pts[Math.min(k + 1, pts.length - 1)], p = pts[Math.max(k - 1, 0)];
      const axis = Math.abs(n[0] - p[0]) >= Math.abs(n[1] - p[1]) ? 0 : 1;
      const perp = axis === 0 ? [0, 1] : [1, 0];
      const ok = cell(px, py, z) === 0 || cell(px, py, z) === type;
      if (!ok) { flush(); continue; }
      setC(px, py, z, type, axis);
      if (width === 2 && isEmpty(px + perp[0], py + perp[1], z)) setC(px + perp[0], py + perp[1], z, type, axis);
      run.push({ x: px, y: py, axis, perp: width === 2 ? perp : [0, 0] });
    }
    flush();
  }

  // 5. transit decks (L4) with pillars, tubes (L6), upper transit (L10) ---------
  const deckEdges = mst(Wd.cores);
  for (let k = 0; k < 1; k++) { const a = pick(Wd.cores), b = pick(Wd.cores); if (a !== b) deckEdges.push([a, b]); }
  const p0 = Wd.paths.length;
  deckEdges.forEach(([a, b]) => corridor(a, b, 6, 2, T.DECK, R() < 0.5, 'deck'));
  for (let pi = p0; pi < Wd.paths.length; pi++) Wd.paths[pi].cells.forEach((c, k) => {
    if (k % 5 !== 2) return;
    for (let z = 5; z >= 2; z--) {
      const t = cell(c.x, c.y, z);
      if (t === T.EMPTY) { setC(c.x, c.y, z, T.PILLAR, (z === 2 || cell(c.x, c.y, z - 1) !== 0) ? 1 : 0); if (cell(c.x, c.y, z - 1) !== 0) break; }
      else if (z === 2 && (t === T.STREET || t === T.WALK)) { setC(c.x, c.y, 2, T.PILLAR, 3); break; }
      else break;
    }
  });
  const pairs = [];
  for (let a = 0; a < Wd.cores.length; a++) for (let b = a + 1; b < Wd.cores.length; b++) {
    const A = Wd.cores[a], B = Wd.cores[b];
    if (Math.abs(A.y - B.y) <= 2 || Math.abs(A.x - B.x) <= 2) pairs.push([A, B]);
  }
  for (let k = 0; k < 3 && pairs.length; k++) {
    const [A, B] = pairs.splice(Math.floor(R() * pairs.length), 1)[0];
    corridor(A, B, 8, 1, T.TUBE, Math.abs(A.y - B.y) <= 2, 'tube');
  }
  mst(Wd.cores.slice().sort(() => R() - 0.5)).forEach(([a, b]) => corridor(a, b, 12, 1, T.DECK, R() < 0.5, 'deck'));

  // 6. sky garden (L7) on a truss grid (L6) --------------------------------------
  let best = null;
  for (const A of Wd.cores) for (const B of Wd.cores) {
    if (A === B) continue;
    const [ax, ay] = coreCenter(A), [bx, by] = coreCenter(B);
    const d = Math.abs(ax - bx) + Math.abs(ay - by), m = Math.abs((ax + bx) / 2 - W / 2) + Math.abs((ay + by) / 2 - D / 2);
    if (d >= 10 && d <= 22 && (!best || m < best[2])) best = [A, B, m];
  }
  if (best) {
    const [A, B] = best;
    let gx0 = Math.min(A.x, B.x) + 1, gx1 = Math.max(A.x + A.s, B.x + B.s) - 2, gy0 = Math.min(A.y, B.y) + 1, gy1 = Math.max(A.y + A.s, B.y + B.s) - 2;
    if (gx1 - gx0 < 5) { gx0 -= 2; gx1 += 2; } if (gy1 - gy0 < 5) { gy0 -= 2; gy1 += 2; }
    gx1 = Math.min(gx1, gx0 + 13); gy1 = Math.min(gy1, gy0 + 11);
    Wd.garden = { x0: gx0, y0: gy0, x1: gx1, y1: gy1 };
    const pw = RI(gx0 + 2, gx1 - 3), ph = RI(gy0 + 2, gy1 - 3);
    for (let y = gy0; y <= gy1; y++) for (let x = gx0; x <= gx1; x++) {
      if (!isEmpty(x, y, 9)) continue;
      if (x >= pw && x < pw + 2 && y >= ph && y < ph + 3) setC(x, y, 9, T.WATER, 1);
      else if (R() < 0.3) setC(x, y, 9, T.TREE, RI(0, 3));
      else setC(x, y, 9, T.TERRACE, R() < 0.2 ? 16 : 0);
      if (((x - gx0) % 3 === 0 || (y - gy0) % 3 === 0) && isEmpty(x, y, 8)) setC(x, y, 8, T.TRUSS, (x + y) & 1);
    }
  }
  // extra transfer trusses (L8) between aligned cores
  for (let k = 0; k < 2 && pairs.length; k++) { const [A, B] = pairs.splice(Math.floor(R() * pairs.length), 1)[0]; corridor(A, B, 10, 1, T.TRUSS, Math.abs(A.y - B.y) <= 2, 'truss'); }
  Wd.paths = Wd.paths.filter(p => p.kind !== 'truss');

  // 7. supports + infill: frames around cores, capsules plugged in ----------------
  const bands = [[7, 8], [10, 11], [13, 13]];
  for (const c of Wd.cores) for (const band of bands) {
    if (band[1] > c.top) continue;
    const n = RI(2, 3);
    for (let k = 0; k < n; k++) {
      const side = RI(0, 3), along = RI(2, c.s + 3), out = RI(2, 6), off = RI(-2, 1);
      let x0, y0, x1, y1;
      if (side === 0) { x0 = c.x + c.s; x1 = x0 + out - 1; y0 = c.y + off; y1 = y0 + along - 1; }
      else if (side === 1) { x1 = c.x - 1; x0 = x1 - out + 1; y0 = c.y + off; y1 = y0 + along - 1; }
      else if (side === 2) { y0 = c.y + c.s; y1 = y0 + out - 1; x0 = c.x + off; x1 = x0 + along - 1; }
      else { y1 = c.y - 1; y0 = y1 - out + 1; x0 = c.x + off; x1 = x0 + along - 1; }
      for (let z = band[0]; z <= band[1]; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        if (!isEmpty(x, y, z)) continue;
        if (R() < 0.64) setC(x, y, z, T.CAPSULE, RI(0, 3) | (RI(0, 1) << 2) | (RI(0, 3) << 3));
        else setC(x, y, z, T.FRAME, 0);
      }
    }
  }
  // Kowloon-style accretion on old roofs (L2-L3)
  for (const L of Wd.lots) {
    const top = 2 + L.hgt;
    if (top > 5 || R() > 0.42) continue;
    const zs = top === 5 ? [5] : R() < 0.5 ? [top] : [top, top + 1];
    for (const z of zs) for (let j = 0; j < L.h; j++) for (let k = 0; k < L.w; k++) {
      if (!isEmpty(L.x + k, L.y + j, z) || R() < 0.25 || !supportAt(L.x + k, L.y + j, z)) continue;
      setC(L.x + k, L.y + j, z, R() < 0.72 ? T.CAPSULE : T.FRAME, RI(0, 3) | (RI(0, 1) << 2) | (RI(0, 3) << 3));
    }
  }
  // rooftop passage network at L3 (z=5): walkways over roofs, short plank bridges across gaps
  for (let wk = 0; wk < 9; wk++) {
    let x = RI(2, W - 3), y = RI(2, D - 3), tries = 0;
    while (!(cell(x, y, 4) && isEmpty(x, y, 5)) && tries++ < 200) { x = RI(2, W - 3); y = RI(2, D - 3); }
    if (tries >= 200) continue;
    let dir = RI(0, 3);
    for (let st = 0; st < 26; st++) {
      const dx = [1, 0, -1, 0][dir], dy = [0, 1, 0, -1][dir];
      if (cell(x, y, 5) === 0) setC(x, y, 5, T.ROOFWALK, dir & 1);
      let nx = x + dx, ny = y + dy, gap = 0;
      while (inb(nx + dx * gap, ny + dy * gap, 5) && !cell(nx + dx * gap, ny + dy * gap, 4) && gap < 4) gap++;
      if (!inb(nx, ny, 5) || !(isEmpty(nx, ny, 5) || cell(nx, ny, 5) === T.ROOFWALK) || gap > 3) { dir = (dir + (R() < 0.5 ? 1 : 3)) % 4; continue; }
      x = nx; y = ny;
      if (R() < 0.18) dir = RI(0, 3);
    }
  }
  // terraces / trees on top of habitation clusters
  for (let z = 7; z < NL - 1; z++) for (let y = 0; y < D; y++) for (let x = 0; x < W; x++) {
    const t = cell(x, y, z);
    if ((t === T.CAPSULE || t === T.FRAME) && isEmpty(x, y, z + 1) && R() < 0.3) setC(x, y, z + 1, R() < 0.35 ? T.TREE : T.TERRACE, RI(0, 3));
  }

  // 8. canopy (L12), canopy walk (L13), crown ------------------------------------
  for (const c of Wd.cores) {
    const r = RI(3, 6);
    for (let y = c.y - r; y < c.y + c.s + r; y++) for (let x = c.x - r; x < c.x + c.s + r; x++)
      if (isEmpty(x, y, 14) && R() < 0.8) setC(x, y, 14, T.CANOPY, (x + y) & 1);
  }
  mst(Wd.cores).forEach(([a, b]) => corridor(a, b, 15, 1, T.ROOFWALK, R() < 0.5, 'walk'));
  Wd.paths = Wd.paths.filter(p => p.kind !== 'walk');
  for (let y = 0; y < D; y++) for (let x = 0; x < W; x++) if (cell(x, y, 15) === T.ROOFWALK && R() < 0.12) {
    for (const [dx, dy] of [[1, 0], [0, 1]]) if (isEmpty(x + dx, y + dy, 15) && cell(x + dx, y + dy, 14)) { setC(x + dx, y + dy, 15, T.TREE, RI(0, 3)); break; }
  }
  let tall = Wd.cores[0];
  for (const c of Wd.cores) if (c.top > tall.top) tall = c;
  for (const c of Wd.cores) {
    if (c === tall) continue;
    if (R() < 0.6) setC(c.x + c.s - 1, c.y, c.top + 1, T.ANTENNA, 0);
    for (let dy = 0; dy < c.s; dy++) for (let dx = 0; dx < c.s; dx++) if (isEmpty(c.x + dx, c.y + dy, c.top + 1) && R() < 0.45) setC(c.x + dx, c.y + dy, c.top + 1, R() < 0.4 ? T.TREE : T.TERRACE, RI(0, 3));
  }
  Wd.crane = { x: tall.x + 1, y: tall.y + 1, z: tall.top + 1 };
  setC(Wd.crane.x, Wd.crane.y, Wd.crane.z, T.CRANE, 0);

  // 9. light wells: voids from sky to the undercroft pool ------------------------
  const wellSizes = [3, 2];
  for (let k = 0; k < 2; k++) {
    const s = wellSizes[k];
    for (let tries = 0; tries < 300; tries++) {
      let x, y;
      if (k === 0) { x = RI(cx0 - 1, cx0 + cw - s + 1); y = RI(cy0 - 1, cy0 + chh - s + 1); }
      else { x = RI(3, W - 3 - s); y = RI(3, D - 3 - s); }
      let ok = true;
      for (let dy = -1; dy <= s && ok; dy++) for (let dx = -1; dx <= s; dx++) if (coreAt(x + dx, y + dy) || !inb(x + dx, y + dy, 0)) { ok = false; break; }
      for (const w of Wd.wells) if (Math.abs(w.x - x) < 8 && Math.abs(w.y - y) < 8) ok = false;
      if (!ok) continue;
      for (let z = 0; z < NL; z++) for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) {
        const X = x + dx, Y = y + dy;
        if (z === 0) { if (cell(X, Y, 0) !== T.VAULT) setC(X, Y, 0, T.WATER, 0); }
        else if (cell(X, Y, z) !== T.VAULT) setC(X, Y, z, T.EMPTY);
        flags[idx(X, Y, z)] |= F_WELL;
      }
      for (let dy = -1; dy <= s; dy++) for (let dx = -1; dx <= s; dx++) if (cell(x + dx, y + dy, 2) === T.STREET) setC(x + dx, y + dy, 2, T.WALK, 0);
      Wd.wells.push({ x, y, s });
      break;
    }
  }

  // 10. risers, grates -------------------------------------------------------------
  for (let k = 0; k < 2; k++) {
    const c = pick(Wd.cores), rx0 = c.x + c.s, ry0 = c.y + RI(0, c.s - 1);
    for (let z = 1; z <= Math.min(12, c.top); z++) { const t = cell(rx0, ry0, z); if (t === T.EMPTY || t === T.EARTH) setC(rx0, ry0, z, T.RISER, 0); }
  }
  for (let y = 0; y < D; y++) for (let x = 0; x < W; x++) {
    if (cell(x, y, 2) !== T.STREET) continue;
    const below = cell(x, y, 1);
    if ((below === T.EMPTY || below === T.PIPE || below === T.LAMP) && R() < 0.14) {
      vars[idx(x, y, 2)] = (vars[idx(x, y, 2)] & 1) | (3 << 1); flags[idx(x, y, 2)] |= F_GRATE;
      Wd.emitters.push({ x, y, z: 2, k: 'grate' });
    }
  }
  computeLight();
  computeFill();
}

// baked sky exposure: 5 rays (straight up weighted x2, four 45° diagonals)
function computeLight(x0 = 0, y0 = 0, x1 = W - 1, y1 = D - 1, zmax = NL - 1) {
  const dirs = [[0, 0, 2], [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1]];
  for (let z = 0; z <= zmax; z++) for (let y = Math.max(0, y0); y <= Math.min(D - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) {
    const i = idx(x, y, z);
    let sum = 0;
    for (const [dx, dy, wgt] of dirs) {
      let tr = 1;
      for (let zz = z + 1, cx = x + dx, cy = y + dy; zz < NL; zz++, cx += dx, cy += dy) {
        if (cx < 0 || cy < 0 || cx >= W || cy >= D) break;
        const t = cells[idx(cx, cy, zz)];
        if (t) { tr *= 1 - TI[t].op; if (tr < 0.02) { tr = 0; break; } }
      }
      sum += tr * wgt;
    }
    light[i] = sum / 6;
  }
}
const lightQ = i => { const l = light[i]; return l < 0.1 ? 0 : l < 0.28 ? 1 : l < 0.5 ? 2 : l < 0.76 ? 3 : 4; };
function computeFill() {
  for (let z = 0; z < NL; z++) {
    let n = 0;
    for (let i = z * W * D, e = i + W * D; i < e; i++) { const t = cells[i]; if (t && t !== T.EARTH && t !== T.ROCK) n++; }
    WORLD.fill[z] = n / (W * D);
  }
}
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
// ==========================================================================
// Isometric renderer: per-level cached canvases (painter's order inside a
// level, levels composited bottom-up), cut-plane poché cache, ghost-above
// outlines, exploded strata, dynamic per-level details, sky.
// ==========================================================================
const LC = new Array(NL).fill(null);
const DYN = new Array(NL).fill(null);
const CUTS = new Map();   // per-level cut (poché) caches, small LRU
function cutCache(z) {
  let c = CUTS.get(z);
  if (!c) {
    if (CUTS.size >= 3) { const k = CUTS.keys().next().value; CUTS.delete(k); }
    const cv = mk(CW, CH); c = { c: cv, g: cv.getContext('2d'), dirty: true }; CUTS.set(z, c);
  }
  return c;
}
const GHC = { c: null, g: null, z: -1, dirty: true };
const dirtyLv = new Set();
const lazyLv = new Set();
let planDirty = true, secDirty = true, thumbDirty = true, skyDirty = true;
const CUTTABLE = new Uint8Array(32);
[T.EARTH, T.ROCK, T.OLD, T.CORE, T.LIFT, T.CAPSULE, T.TANK, T.TRUSS, T.FRAME, T.PILLAR, T.VAULT, T.RISER, T.CANOPY].forEach(t => CUTTABLE[t] = 1);
const WARM = ['#ffcf73', '#ffb44f', '#ffe39e', '#ffc566'];
const CAP_RW = [[2, 2], [3, 2], [1, 3], [2, 3], [3, 3], [4, 3], [1, 4], [2, 4], [3, 4], [4, 4], [2, 5], [3, 5]];
const WATERCYC = {
  day: [0, 0, '#3f786e', '#56927f', '#7db8a0', '#b3dcc6', '#7db8a0', '#56927f'],
  dusk: [0, 0, '#3b6d62', '#57806c', '#9c8f68', '#e0b36e', '#9c8f68', '#57806c'],
  night: [0, 0, '#1f3b39', '#2b4d48', '#4a6660', '#b08a4e', '#4a6660', '#2b4d48']
};

// lazy: the level images are rebuilt a level a frame (renderIso) rather than all before the next frame
function markAllDirty(lazy) { for (let z = 0; z < NL; z++) (lazy ? lazyLv : dirtyLv).add(z); for (const c of CUTS.values()) c.dirty = true; GHC.dirty = true; planDirty = secDirty = thumbDirty = true; }
function markDirty(z) { dirtyLv.add(z); const cc = CUTS.get(z); if (cc) cc.dirty = true; if (z > S.level) GHC.dirty = true; planDirty = secDirty = thumbDirty = true; }
const tallN = n => n && TI[n].tall;
function faceOccluded(u, v, z, face) {
  return face === 0 ? (tallN(cellR(u, v + 1, z)) || tallN(cellR(u + 1, v + 1, z)) || tallN(cellR(u + 1, v + 2, z)))
    : (tallN(cellR(u + 1, v, z)) || tallN(cellR(u + 1, v + 1, z)) || tallN(cellR(u + 2, v + 1, z)));
}

// emissive details drawn right after each sprite (so painter's order still occludes them)
function lightsFor(g, dl, t, vv, x, y, z, u, v, sx, sy, E, litP) {
  const h = hash3(x, y, z), night = S.tod !== 'day';
  if ((t === T.OLD || t === T.CAPSULE) && ((vv >> 8) & 15)) { facadeLights(g, t === T.OLD ? 'old' : 'cap', (vv >> 8) & 15, vv & 255, x, y, z, sx, sy, E, litP); return; }
  if (t === T.OLD) {
    for (let k = 0; k < 4; k++) {
      const face = k >> 1, c0 = (k & 1) ? 5 : 1;
      if (((h >>> (k * 4)) & 15) / 16 >= litP) continue;
      const rects = [];
      for (let ii = c0; ii < c0 + 2; ii++) rects.push(face === 0 ? sx + ii : sx + 8 + ii, face === 0 ? sy + E + 8 + (ii >> 1) : sy + E + 11 - (ii >> 1), 1, 4);
      const col = WARM[(h >>> (16 + k * 2)) & 3];
      if (((h >>> (24 + k)) & 7) === 0 && !faceOccluded(u, v, z, face)) { dl.flick.push({ rects, col, ph: ((h >>> k) & 255) / 37, rate: 0.25 + ((h >>> (8 + k)) & 7) * 0.12, tv: ((h >>> 20) & 3) === 0 }); continue; }
      g.fillStyle = col; for (let q = 0; q < rects.length; q += 4) g.fillRect(rects[q], rects[q + 1], rects[q + 2], rects[q + 3]);
    }
    if ((vv & 32) && night) {
      const nc = ['#ff6b4a', '#f4d35e', '#6fd0b8'][h % 3];
      g.fillStyle = nc; for (let j = 2; j < 9; j += 2) g.fillRect(sx + 4, sy + E + 7 + j, 2, 1);
      g.fillStyle = rgba(nc, 0.25); g.fillRect(sx + 3, sy + E + 8, 4, 8);
    }
  } else if (t === T.CAPSULE) {
    if ((h & 255) / 256 >= litP) return;
    const ws = (vv >> 2) & 1, col = WARM[(h >>> 8) & 3], rects = [];
    for (const [ii, j] of CAP_RW) rects.push(ws ? sx + 8 + ii : sx + 2 + ii, (ws ? sy + E + 8 - (ii >> 1) : sy + E + 6 + (ii >> 1)) + j, 1, 1);
    if (((h >>> 12) & 7) === 0 && !faceOccluded(u, v, z, ws)) { dl.flick.push({ rects, col, ph: ((h >>> 3) & 255) / 37, rate: 0.2 + ((h >>> 16) & 7) * 0.1, tv: ((h >>> 20) & 3) === 0 }); return; }
    g.fillStyle = col; for (let q = 0; q < rects.length; q += 4) g.fillRect(rects[q], rects[q + 1], 1, 1);
  } else if (t === T.CORE) {
    if ((vv & 4) && night) { g.fillStyle = '#dfe8d6'; for (let ii = 3; ii < 5; ii++) g.fillRect(sx + ii, sy + E + 9 + (ii >> 1), 1, 3); }
  } else if (t === T.LAMP) {
    if (night) { g.fillStyle = 'rgba(255,205,130,0.28)'; g.fillRect(sx + 5, sy + E + 3, 7, 4); g.fillStyle = '#ffe2a2'; g.fillRect(sx + 7, sy + E + 4, 3, 1); }
  } else if (t === T.DECK) {
    if (night && (h & 7) === 0) { g.fillStyle = '#ffd98a'; g.fillRect(sx + 8, sy + E + 12, 1, 1); g.fillStyle = 'rgba(255,210,140,0.25)'; g.fillRect(sx + 6, sy + E + 13, 5, 2); }
  } else if (t === T.ANTENNA) {
    dl.blink.push(sx + 8, sy + 9);
  } else if (t === T.TUBE && night) {
    g.fillStyle = 'rgba(255,214,150,0.35)';
    if (vv & 1) tline(g, sx, sy + 3 + 2, 16, 0.5, 0.1, 0.5, 0.9, 'rgba(255,214,150,0.35)'); else tline(g, sx, sy + 3 + 2, 16, 0.1, 0.5, 0.9, 0.5, 'rgba(255,214,150,0.35)');
  }
}

// ---------- depth for wires ----------
// Each cached level also keeps a depth per pixel (how near the sprite's cell is to the
// viewer, in the same units as the wires' depthKey). Wires are drawn after all levels and
// tested against the nearest depth at each pixel, so they pass behind and in front of
// buildings correctly instead of over or under whole levels.
let DEPV = 0;
function spriteMask(spr) {
  if (!spr.mask) { const w = spr.c.width, h = spr.c.height, d = spr.c.getContext('2d').getImageData(0, 0, w, h).data, m = new Uint8Array(w * h); for (let i = 0; i < w * h; i++) m[i] = d[i * 4 + 3] > 0 ? 1 : 0; spr.mask = m; }
  return spr.mask;
}
function levelEmpty(z) { for (let i = z * W * D, e = i + W * D; i < e; i++) if (cells[i]) return false; return true; }
function buildLevel(z, cutMode) {
  if (!cutMode && levelEmpty(z)) { LC[z] = null; DYN[z] = null; dirtyLv.delete(z); lazyLv.delete(z); return; }
  let tgt;
  if (cutMode) tgt = cutCache(z);
  else { if (!LC[z]) { const c = mk(CW, CH); LC[z] = { c, g: c.getContext('2d') }; } tgt = LC[z]; }
  // with live lighting the sprites go to a scratch canvas that is read back and lit; the
  // cache itself is only ever written, so the browser keeps it on the GPU
  const g = LIT.on ? litScratch() : tgt.g;
  g.clearRect(0, 0, CW, CH);
  const dl = { flick: [], water: [], blink: [] };
  const litP = TODS[S.tod].lit;
  if (!tgt.dep) { tgt.dep = new Float32Array(CW * CH); tgt.face = new Uint8Array(CW * CH); }
  const dep = tgt.dep, fac = tgt.face; dep.fill(-1e9); fac.fill(0); DEPV++;
  // with live lighting, lit windows go to their own layer so the light pass doesn't shade them
  if (LIT.on && !tgt.em) { const c = mk(CW, CH); tgt.em = { c, g: c.getContext('2d') }; }
  if (tgt.em) tgt.em.g.clearRect(0, 0, CW, CH);
  const lg = LIT.on ? tgt.em.g : g;
  for (let s = 0; s <= W + D - 2; s++) {
    const u0 = Math.max(0, s - (D - 1)), u1 = Math.min(W - 1, s);
    for (let u = u0; u <= u1; u++) {
      const v = s - u, p = fromRot(u, v), x = p[0], y = p[1], i = idx(x, y, z), t = cells[i];
      if (!t) continue;
      const vv = spriteVar(t, i, x, y, z, u, v);
      let m = 0, mask = 0;
      if (cutMode && CUTTABLE[t]) { m = 1; if (TI[t].poche && t !== T.LIFT && t !== T.TANK) mask = pocheMask(u, v, z, t); }
      const spr = getSprite(t, vv, Math.max(lightQ(i), litFloor()), m, mask);
      const X = OX + (u - v) * 8, Y = OY + (u + v) * 4, sx = X + spr.ox, sy = Y + spr.oy;
      g.drawImage(spr.c, sx, sy);
      {
        // per-pixel depth: resolve each sprite pixel to the cell's top, left or right face
        const o = occOf(t), top = o ? (m ? Math.min(o[1], HT / LH) : o[1]) : 0.6;
        const mk_ = spriteMask(spr), w = spr.c.width, h = spr.c.height, Dc = (u + v + 1) * 1.5 + z + top * 0.5;
        for (let yy = 0; yy < h; yy++) {
          const ry = sy + yy; if (ry < 0 || ry >= CH) continue; const row = ry * CW, Yr = ry + 0.5 - OY;
          for (let xx = 0; xx < w; xx++) {
            if (!mk_[yy * w + xx]) continue; const rx = sx + xx; if (rx < 0 || rx >= CW) continue;
            const d = (rx + 0.5 - OX) / 8;
            let D = Dc, F = 0;
            const st = (Yr + top * 12) / 4, ut = (st + d) / 2, vt = (st - d) / 2;
            if (ut >= u && ut <= u + 1 && vt >= v && vt <= v + 1) { D = st * 1.5 + z + top; F = 1; }
            else {
              const ul = v + 1 + d, ur = u + 1, vr = u + 1 - d;
              if (ul >= u && ul <= u + 1) { const sl = ul + v + 1; D = sl * 1.5 + z + (sl * 4 - Yr) / 12; F = 2; }
              else if (vr >= v && vr <= v + 1) { const sr = ur + vr; D = sr * 1.5 + z + (sr * 4 - Yr) / 12; F = 3; }
            }
            dep[row + rx] = D; fac[row + rx] = F;
          }
        }
      }
      if (!m) lightsFor(lg, dl, t, vv, x, y, z, u, v, sx, sy, spr.E || 0, litP);
      if (t === T.WATER && !cutMode) {
        const occ = tallN(cellR(u + 1, v, z)) || tallN(cellR(u, v + 1, z)) || tallN(cellR(u + 1, v + 1, z));
        if (!occ) { const h = hash3(x, y, z); for (let k = 0; k < 4; k++) { const a = 0.15 + ((h >>> (k * 5)) & 15) / 22, b = 0.15 + ((h >>> (k * 5 + 3)) & 15) / 22; dl.water.push(Math.floor(X + (a - b) * 8), Math.floor(Y - 4 + (a + b) * 4), (h >>> (k * 3)) & 7); } }
      }
    }
  }
  if (LIT.on) { lightLevel(tgt, z, cutMode, g); tgt.g.drawImage(tgt.em.c, 0, 0); }
  if (cutMode) tgt.dirty = false; else { DYN[z] = dl; dirtyLv.delete(z); lazyLv.delete(z); }
}

// ghost-above: dotted plate outlines of every level above the cut
function buildGhost(L) {
  const H = CH + (NL - 1) * LH;
  if (!GHC.c) { GHC.c = mk(CW, H); GHC.g = GHC.c.getContext('2d'); }
  const g = GHC.g; g.clearRect(0, 0, CW, H);
  for (let z = L + 1; z <= Math.min(NL - 1, L + 3); z++) {
    const a = [0.62, 0.34, 0.18][z - L - 1];
    g.fillStyle = `rgba(206,226,228,${a})`;
    for (let v = 0; v < D; v++) for (let u = 0; u < W; u++) {
      const t = cellR(u, v, z); if (!t) continue;
      const hgt = TI[t].slab ? 3 : (t === T.TREE ? 6 : 12);
      const X = OX + (u - v) * 8, Y = OY + (u + v) * 4 + (NL - 1 - z) * LH - hgt;
      const E = n => !n;
      const bits = (E(cellR(u, v - 1, z)) ? 1 : 0) | (E(cellR(u - 1, v, z)) ? 2 : 0) | (E(cellR(u + 1, v, z)) ? 4 : 0) | (E(cellR(u, v + 1, z)) ? 8 : 0);
      if (!bits) continue;
      for (let i = 0; i < 8; i += 2) {
        const k = i >> 1;
        if (bits & 2) g.fillRect(X - 8 + i, Y + 3 - k, 1, 1);
        if (bits & 8) g.fillRect(X - 8 + i, Y + 4 + k, 1, 1);
        if (bits & 1) g.fillRect(X + 7 - i, Y + 3 - k, 1, 1);
        if (bits & 4) g.fillRect(X + 7 - i, Y + 4 + k, 1, 1);
      }
      if ((bits & 12) === 12) for (let j = 0; j < hgt; j += 2) g.fillRect(X - 1, Y + 8 + j, 1, 1);
    }
  }
  GHC.z = L; GHC.dirty = false;
}

// ---------- view geometry ----------
const easeIO = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const explodeOff = z => -Math.round(STRATUM_OF[z] * GAP * easeIO(S.explode));
function isoBase() { return [Math.round(S.bw / 2 - S.cam.x), Math.round(S.bh / 2 - S.cam.y)]; }
function projIso(px, py, pz) {
  const r = toRotF(px, py), b = isoBase();
  const eo = S.explode > 0 ? explodeOff(clamp(Math.floor(pz), 0, NL - 1)) : 0;
  return [b[0] + (r[0] - r[1]) * 8, b[1] + (r[0] + r[1]) * 4 - pz * LH + eo];
}
function planeAt(bx, by, h, eo) {   // buffer point -> rotated (u,v) on plane height h (levels)
  const b = isoBase(), wx = bx - b[0], wy = by - b[1] - (eo || 0);
  const A = (wy + h * LH) / 4, B = wx / 8;
  return [(A + B) / 2, (A - B) / 2];
}
function pickIso(bx, by) {
  if (S.mode === 'exploded') return pickExploded(bx, by);
  const L = S.level;
  const sliced = L < NL - 1;
  if (!sliced) {   // full stack: report the topmost visible cell (read-only info)
    for (let z = NL - 1; z >= 0; z--) for (const hh of [1, 0.25]) {
      const [u, v] = planeAt(bx, by, z + hh), U = Math.floor(u), V = Math.floor(v);
      const t = cellR(U, V, z);
      if (t && (hh === 1 ? !TI[t].slab : true)) { const p = fromRot(U, V); return { x: p[0], y: p[1], z, t, u: U, v: V, top: true }; }
    }
    return null;
  }
  const [u1, v1] = planeAt(bx, by, L + HT / LH), U1 = Math.floor(u1), V1 = Math.floor(v1);
  const t1 = cellR(U1, V1, L);
  if (t1 && CUTTABLE[t1]) { const p = fromRot(U1, V1); return { x: p[0], y: p[1], z: L, t: t1, u: U1, v: V1 }; }
  const [u0, v0] = planeAt(bx, by, L + 0.2), U0 = Math.floor(u0), V0 = Math.floor(v0);
  if (U0 < 0 || V0 < 0 || U0 >= W || V0 >= D) return null;
  const p = fromRot(U0, V0);
  return { x: p[0], y: p[1], z: L, t: cellR(U0, V0, L), u: U0, v: V0 };
}
function pickExploded(bx, by) {
  for (let s = STRATA.length - 1; s >= 0; s--) {
    const [z0, z1] = STRATA[s];
    for (let z = z1; z >= z0; z--) for (const hh of [1, 0.25]) {
      const [u, v] = planeAt(bx, by, z + hh, explodeOff(z)), U = Math.floor(u), V = Math.floor(v);
      const t = cellR(U, V, z);
      if (t) { const p = fromRot(U, V); return { x: p[0], y: p[1], z, t, u: U, v: V, stratum: s }; }
    }
    const [u, v] = planeAt(bx, by, z0, explodeOff(z0));
    if (u >= 0 && v >= 0 && u < W && v < D) { const U = Math.floor(u), V = Math.floor(v), p = fromRot(U, V); return { x: p[0], y: p[1], z: z0, t: cellR(U, V, z0), u: U, v: V, stratum: s }; }
  }
  return null;
}

// ---------- pixel line helpers ----------
function pline(ctx, x0, y0, x1, y1, col, dash) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy, n = 0;
  ctx.fillStyle = col;
  for (let guard = 0; guard < 4000; guard++) {
    if (!dash || (n % dash[0]) < dash[1]) ctx.fillRect(x0, y0, 1, 1);
    n++;
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}
function isoQuad(ctx, x0, y0, x1, y1, h, col, dash, eoz) {  // world-rect outline (continuous) at height h
  const P = (a, b) => { const r = toRotF(a, b), bb = isoBase(); return [bb[0] + (r[0] - r[1]) * 8, bb[1] + (r[0] + r[1]) * 4 - h * LH + (eoz || 0)]; };
  const c = [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)];
  for (let k = 0; k < 4; k++) pline(ctx, c[k][0], c[k][1], c[(k + 1) % 4][0], c[(k + 1) % 4][1], col, dash);
  return c;
}

// ---------- sky ----------
const SKYC = { c: null };
const SKYCOL = { day: ['#8ea5ab', '#a7b6b2', '#c4c3b1', '#d9cfb3'], dusk: ['#1c2630', '#343538', '#5f4439', '#a75f39', '#d98a45'], night: ['#06080b', '#0a0f13', '#0f171b', '#16201f'] };
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
function buildSky() {
  const bw = S.bw, bh = S.bh;
  if (!SKYC.c || SKYC.c.width !== bw || SKYC.c.height !== bh) SKYC.c = mk(bw, bh);
  // the dithered gradient is a canvas call per pixel: batched like the wires (same pixels)
  const g0 = SKYC.c.getContext('2d'), px = wpxBegin(g0), g = px ? WPXC : g0;
  try { buildSkyTo(g); } finally { if (px) wpxEnd(); }
  skyDirty = false;
}
function buildSkyTo(g) {
  const bw = S.bw, bh = S.bh;
  const skyT = LIT.on && LIT.sun === 'evening' ? 'dusk' : S.tod, cols = SKYCOL[skyT], n = cols.length;
  const hz = Math.round(bh * 0.62);
  for (let y = 0; y < bh; y++) {
    const f = clamp(y / hz, 0, 1) * (n - 1), k = Math.min(n - 2, Math.floor(f)), fr = f - k;
    g.fillStyle = cols[k]; g.fillRect(0, y, bw, 1);
    if (fr > 0.02) { g.fillStyle = cols[k + 1]; for (let x = 0; x < bw; x++) if (fr * 16 > BAYER[(x & 3) + (y & 3) * 4]) g.fillRect(x, y, 1, 1); }
  }
  // far arcologies on the horizon (Trantor goes on forever)
  const rnd = mulberry32(S.seed * 3 + 1);
  const far = skyT === 'day' ? '#9ba39f' : skyT === 'dusk' ? '#3d3438' : '#0d1316', mid = skyT === 'day' ? '#8a918d' : skyT === 'dusk' ? '#2d282c' : '#0a0f11';
  for (const [col, base, amp] of [[far, hz + 6, 34], [mid, hz + 18, 22]]) {
    let x = -4;
    while (x < bw) {
      const w = 6 + Math.floor(rnd() * 18), h = 6 + Math.floor(rnd() * amp);
      g.fillStyle = col; g.fillRect(x, base - h, w, bh - base + h);
      if (rnd() < 0.3) g.fillRect(x + (w >> 1), base - h - 5, 1, 5);
      if (S.tod !== 'day') { g.fillStyle = S.tod === 'night' ? '#e0b45e' : '#b98a55'; for (let k = 0; k < w * h / 40; k++) if (rnd() < 0.5) g.fillRect(x + 1 + Math.floor(rnd() * (w - 2)), base - h + 2 + Math.floor(rnd() * h), 1, 1); }
      x += w + Math.floor(rnd() * 3);
    }
    g.fillStyle = col; g.fillRect(0, base, bw, bh - base);
  }
  if (S.tod === 'night') { g.fillStyle = '#c9cfc8'; for (let k = 0; k < 60; k++) g.fillRect(Math.floor(rnd() * bw), Math.floor(rnd() * hz * 0.6), 1, 1); }
}

// ---------- dynamic layer for one level ----------
function drawDyn(ctx, z, ox, oy, t, isCut) {
  const dl = DYN[z]; if (!dl) return;
  const wc = WATERCYC[S.tod], wt = Math.floor(t * 5);
  for (let k = 0; k < dl.water.length; k += 3) { const c = wc[(dl.water[k + 2] + wt) & 7]; if (c) { ctx.fillStyle = c; ctx.fillRect(ox + dl.water[k], oy + dl.water[k + 1], 2, 1); } }
  if (!isCut && S.tod !== 'day') for (const f of dl.flick) {
    const st = hash3(Math.floor((t + f.ph * 7) * f.rate), f.rects[0], f.rects[1]);
    const on = f.tv ? true : (st & 7) !== 0;
    if (!on) continue;
    ctx.fillStyle = f.tv ? ((st & 1) ? '#9fd3e0' : '#d8eef2') : f.col;
    for (let q = 0; q < f.rects.length; q += 4) ctx.fillRect(ox + f.rects[q], oy + f.rects[q + 1], f.rects[q + 2], f.rects[q + 3]);
  }
  if ((t % 1.6) < 0.2) for (let k = 0; k < dl.blink.length; k += 2) { ctx.fillStyle = 'rgba(255,90,60,0.35)'; ctx.fillRect(ox + dl.blink[k] - 1, oy + dl.blink[k + 1] - 1, 3, 3); ctx.fillStyle = '#ff5a3c'; ctx.fillRect(ox + dl.blink[k], oy + dl.blink[k + 1], 1, 1); }
}

// ---------- main iso render (cut + exploded) ----------
function renderIso(ctx, t) {
  for (const z of dirtyLv) buildLevel(z, false);
  if (lazyLv.size) { const z = lazyLv.values().next().value; buildLevel(z, false); }
  const L = S.level, ex = S.mode === 'exploded' || S.explode > 0.001;
  const sliced = !ex && !(L >= NL - 1 && Math.abs(S.cutAnim - L) < 0.001);
  const settled = Math.abs(S.cutAnim - L) < 0.001;
  if (sliced && settled && cutCache(L).dirty) buildLevel(L, true);
  if (ex && cutCache(1).dirty) buildLevel(1, true);
  const b = isoBase(), bx0 = b[0] - OX, by0 = b[1] - OY;
  const top = Math.floor(S.cutAnim + 1e-4), frac = S.cutAnim - top;
  const shadeK = S.shade ? 0.1 : 0;
  ctx.clearRect(0, 0, S.bw, S.bh);
  const useDepth = !ex && settled, depthLevels = [];
  const floor = !ex && S.floor >= 0 ? S.floor : 0;   // the floor cutoff: levels below it aren't drawn
  for (let z = floor; z < NL; z++) {
    let img = LC[z] && LC[z].c, alpha = 1, isCut = false;
    const eo = ex ? explodeOff(z) : 0;
    if (!ex) {
      if (z > top + 1 || (z === top + 1 && frac < 0.001)) break;
      if (z === top + 1) alpha = frac;
      if (z === top && sliced && settled && z === L) { img = cutCache(L).c; isCut = true; }
    } else {
      if (S.hoverStratum >= 0 && STRATUM_OF[z] !== S.hoverStratum) alpha = 0.34;
      if (z === 1) { img = cutCache(1).c; isCut = true; }
    }
    if (!img) continue;
    if (ex && S.explode > 0.05 && z === STRATA[STRATUM_OF[z]][0] && z > 0) stratumPlate(ctx, STRATUM_OF[z]);
    const oy = by0 - z * LH + eo;
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, bx0, oy);
    if (alpha > 0.5) { drawDyn(ctx, z, bx0, oy, t, isCut); drawLifeLevel(ctx, z, t); if (!useDepth) drawWiresLevel(ctx, z, isCut); }
    if (useDepth && alpha > 0.5 && img) depthLevels.push([z, isCut ? cutCache(L) : LC[z], oy]);
    ctx.globalAlpha = 1;
    if (!ex && sliced && (shadeK || mistOn()) && z < L && z < top && !(mistOn() && z < L - MIST_LEVELS)) {
      // below the cut: mist with live lighting, otherwise the plain darkening
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = mistOn() ? `rgba(${mistRGB().join(',')},${LIT.mistA})` : `rgba(14,11,9,${shadeK})`; ctx.fillRect(0, 0, S.bw, S.bh);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (ex && z === STRATA[STRATUM_OF[z]][1]) drawStratumAnnot(ctx, STRATUM_OF[z]);
  }
  if (useDepth && wiresAtRest()) {
    // nothing is moving: the wires are drawn once into a layer fixed to the world, and a pan just slides it
    const wf = wireFrame(depthLevels, top, L, sliced, floor), fy = by0 - NL * LH;
    ctx.drawImage(wf, bx0, fy);
    Object.assign(WDT, { fd: WFC.fd, w: CW, h: LFH, ox: bx0, oy: fy, wd: null }); WDT.key = '';
    WDT.on = true; drawBirds(ctx); drawWireHighlight(ctx, floor, t); WDT.on = false; WDT.ox = WDT.oy = 0;
  } else if (useDepth) { compositeDepth(depthLevels, bx0); if (!WDT.wd || WDT.wd.length !== S.bw * S.bh) WDT.wd = new Float32Array(S.bw * S.bh); WDT.wd.fill(-1e9); WDT.on = true; wpxHold(ctx, () => { for (let z = floor; z < NL; z++) drawWiresLevel(ctx, z); }); drawBirds(ctx); drawWireHighlight(ctx, floor, t); WDT.on = false; }
  LIT.ov = useDepth ? [top, L, sliced, bx0, by0] : null;   // drawn once the sky is in, so additive light never punches holes in it
  drawAfterWorld(ctx, t, sliced, ex);
}
const WDT = { on: false, fd: null, w: 0, h: 0, D: 0, key: '', ox: 0, oy: 0 };
// ---------- the resting-wires layer ----------
// In the level frame (x as the level caches, y shifted down NL levels so every level fits):
// its own depth composite (rebuilt when the levels change) and the wires drawn against it
// (rebuilt when the wires, hover or look change). Cached while every cable sleeps.
const WFC = { c: null, g: null, fd: null, dKey: '', wKey: '' };
const wiresAtRest = () => !WIRES.forceScreen && !LAY.on && !WGRAB.on && !WIRES.stroke && WIRES.cables.every(c => c.asleep);
function wireFrame(levels, top, L, sliced, floor) {
  if (!WFC.c) { WFC.c = mk(CW, LFH); WFC.g = WFC.c.getContext('2d'); WFC.fd = new Float32Array(CW * LFH); }
  const dKey = [levels.map(l => l[0] + (l[1] === LC[l[0]] ? '' : 'c')).join(','), S.rot, DEPV].join('|');
  if (WFC.dKey !== dKey) {
    const fd = WFC.fd; fd.fill(-1e9);
    for (const [z, cache] of levels) {
      const dep = cache.dep; if (!dep) continue; const off = (NL - z) * LH;
      for (let cy = 0; cy < CH; cy++) { const fy = cy + off; if (fy < 0 || fy >= LFH) continue; const r = cy * CW, f = fy * CW; for (let x = 0; x < CW; x++) { const d = dep[r + x]; if (d > fd[f + x]) fd[f + x] = d; } }
    }
    WFC.dKey = dKey; WFC.wKey = '';
  }
  const hv = WIRES.hl === 'amber' && WIRES.hover ? (WIRES.hover.tie ? 't' + WIRES.hover.tie.id : 'c' + WIRES.hover.c.id) : '';   // other styles highlight in an overlay
  const wKey = [WIRES.ver || 0, hv, top, L, sliced, floor, LIT.on, litKey(), LIT.mist && LIT.mistA, S.tod, S.mode, WIRES.palette, WIRES.bundleLook, WIRES.tieStyle, WIRES.joint, WIRES.sleeve,
    WIRES.cables.length, WIRES.ties.length, WIRES.posts.length, WIRES.girders.length, WIRES.mounts.length].join('|');
  if (WFC.wKey !== wKey) {
    // project as if the view's base sat at the frame's origin
    const sv = [S.bw, S.bh, S.cam.x, S.cam.y];
    S.bw = CW; S.bh = LFH; S.cam.x = CW / 2 - OX; S.cam.y = LFH / 2 - OY - NL * LH;
    Object.assign(WDT, { fd: WFC.fd, w: CW, h: LFH, ox: 0, oy: 0, wd: null }); WDT.key = '';
    WFC.g.clearRect(0, 0, CW, LFH);
    try { WDT.on = true; wpxHold(WFC.g, () => { for (let z = floor || 0; z < NL; z++) drawWiresLevel(WFC.g, z); }); }
    finally { WDT.on = false; [S.bw, S.bh, S.cam.x, S.cam.y] = sv; }
    WFC.wKey = wKey;
  }
  return WFC.c;
}
function compositeDepth(levels, bx0) {
  const key = [bx0, levels.map(l => l[0] + ':' + l[2]).join(','), S.bw, S.bh, DEPV, S.rot].join('|');
  if (WDT.key === key && WDT.fd === WDT.sfd) return;
  const bw = S.bw, bh = S.bh;
  if (!WDT.sfd || WDT.sfd.length !== bw * bh) WDT.sfd = new Float32Array(bw * bh);   // its own buffer: WDT.fd may be lent to the resting-wires layer
  const fd = WDT.fd = WDT.sfd; fd.fill(-1e9); WDT.w = bw; WDT.h = bh;
  if (!WDT.face || WDT.face.length !== bw * bh) WDT.face = new Uint8Array(bw * bh);
  const ff = WDT.face; ff.fill(0);
  if (window.__depthDebug) { WDT.src = new Int8Array(bw * bh).fill(-1); }
  for (const [z, cache, oy] of levels) {
    const dep = cache.dep, fac = cache.face; if (!dep) continue;
    for (let py = 0; py < bh; py++) {
      const cy = py - oy; if (cy < 0 || cy >= CH) continue;
      // the level image sits at buffer x = bx0 + cache x
      const row = cy * CW, frow = py * bw, x0 = Math.max(0, bx0), x1 = Math.min(bw, CW + bx0);
      for (let px = x0; px < x1; px++) { const d = dep[row + px - bx0]; if (d > fd[frow + px]) { fd[frow + px] = d; ff[frow + px] = fac[row + px - bx0]; if (WDT.src) WDT.src[frow + px] = z; } }
    }
  }
  WDT.key = key;
}
// a wire pixel shows when nothing nearer was drawn there
const wdt = (x, y) => { if (!WDT.on) return true; x -= WDT.ox; y -= WDT.oy; if (x < 0 || y < 0 || x >= WDT.w || y >= WDT.h) return false; const i = y * WDT.w + x; if (WDT.fd[i] > WDT.D + 0.12) return false; if (WDT.wd && WDT.D > WDT.wd[i]) WDT.wd[i] = WDT.D; return true; };

function stratumPlate(ctx, s) {
  const z0 = STRATA[s][0], eo = explodeOff(z0), k = easeIO(S.explode);
  const P = (a, b) => { const r = toRotF(a, b), bb = isoBase(); return [bb[0] + (r[0] - r[1]) * 8, bb[1] + (r[0] + r[1]) * 4 - z0 * LH + eo]; };
  const c = [P(0, 0), P(W, 0), P(W, D), P(0, D)];
  const dim = S.hoverStratum >= 0 && S.hoverStratum !== s ? 0.3 : 0.4;
  ctx.fillStyle = `rgba(9,10,11,${(dim * k).toFixed(3)})`;
  ctx.beginPath(); ctx.moveTo(c[0][0], c[0][1]); for (let q = 1; q < 4; q++) ctx.lineTo(c[q][0], c[q][1]); ctx.closePath(); ctx.fill();
}
function drawStratumAnnot(ctx, s) {
  if (S.explode < 0.35) return;
  const [z0, z1, name] = STRATA[s], eo = explodeOff(z0);
  const hov = S.hoverStratum === s;
  const P = (a, b, h, e) => { const r = toRotF(a, b), bb = isoBase(); return [bb[0] + (r[0] - r[1]) * 8, bb[1] + (r[0] + r[1]) * 4 - h * LH + e]; };
  // registration lines up to the next stratum
  if (s < STRATA.length - 1) {
    const zn = STRATA[s + 1][0], en = explodeOff(zn);
    for (const [a, b] of [[0, 0], [W, 0], [W, D], [0, D]]) { const p = P(a, b, z1 + 1, eo), q = P(a, b, zn, en); pline(ctx, p[0], p[1], q[0], q[1], 'rgba(200,190,170,0.55)', [4, 2]); }
    for (const c of WORLD.cores) { const p = P(c.x, c.y + c.s, Math.min(c.top + 1, z1 + 1), eo), q = P(c.x, c.y + c.s, zn, en); if (c.top >= zn) pline(ctx, p[0], p[1], q[0], q[1], 'rgba(232,168,60,0.45)', [2, 1]); }
  }
  // corners of the stratum plate
  const corners = [[0, 0], [W, 0], [W, D], [0, D]].map(([a, b]) => P(a, b, z0, eo));
  for (let k = 0; k < 4; k++) pline(ctx, corners[k][0], corners[k][1], corners[(k + 1) % 4][0], corners[(k + 1) % 4][1], hov ? '#e8a83c' : 'rgba(200,190,170,0.35)', hov ? null : [3, 3]);
  const left = corners.reduce((m, c) => c[0] < m[0] ? c : m, corners[0]);
  const label = (z0 === z1 ? lvCode(z0) : lvCode(z0) + '-' + lvCode(z1)) + ' ' + name;
  const lx = left[0] - 14 - ptextW(label) - 4;
  pline(ctx, left[0] - 2, left[1], left[0] - 13, left[1], hov ? '#e8a83c' : '#8d877b');
  plate(ctx, label, lx, left[1] - 4, hov ? '#e8a83c' : '#1a1b1d', hov ? '#1b1305' : '#d8d0bf', hov ? null : '#44474c');
}

function drawAfterWorld(ctx, t, sliced, ex) {
  const L = S.level;
  if (!ex) {
    if (S.ghost && sliced) {
      if (GHC.dirty || GHC.z !== L) buildGhost(L);
      const b = isoBase(); ctx.drawImage(GHC.c, b[0] - OX, b[1] - OY - (NL - 1) * LH);
    }
    drawWellLight(ctx, t, sliced ? L : NL - 1);
    if (Math.abs(S.cutAnim - L) > 0.001) {
      const h = S.cutAnim + HT / LH;
      const c = isoQuad(ctx, 0, 0, W, D, h, 'rgba(232,168,60,0.9)');
      ctx.fillStyle = 'rgba(232,168,60,0.07)';
      const ymin = Math.min(c[0][1], c[1][1], c[2][1], c[3][1]), ymax = Math.max(c[0][1], c[1][1], c[2][1], c[3][1]);
      const cx = (c[0][0] + c[2][0]) / 2, cy = (ymin + ymax) / 2, hw = Math.abs(c[1][0] - c[3][0]) / 2, hh = (ymax - ymin) / 2;
      for (let y = Math.ceil(ymin); y < ymax; y += 2) { const w = hw * (1 - Math.abs(y - cy) / hh); ctx.fillRect(Math.round(cx - w), y, Math.round(w * 2), 1); }
    } else if (sliced) {
      const c = isoQuad(ctx, 0, 0, W, D, L + HT / LH, 'rgba(232,168,60,0.55)', [5, 3]);
      const left = c.reduce((m, p) => p[0] < m[0] ? p : m, c[0]), lab = 'CUT ' + lvCode(L) + ' ' + LEVELS[L].name, lw = ptextW(lab) + 4;
      plate(ctx, lab, clamp(Math.round(left[0]) - 8 - lw, Math.round(S.safeL / S.zoom) + 2, S.bw - lw - 4), clamp(Math.round(left[1]) - 4, 4, S.bh - 30), '#e8a83c', '#1b1305');
    }
  }
  drawSteam(ctx, t, ex ? NL : (sliced ? L : NL));
  drawBuildIso(ctx, t, sliced, ex);
  drawWireOverlay(ctx);
  if (!WIRES.hover && !LAY.on && !WGRAB.on && !WIRES.stroke) drawHoverIso(ctx, t, sliced, ex);
  if (skyDirty || !SKYC.c) buildSky();
  ctx.globalCompositeOperation = 'destination-over';
  ctx.drawImage(SKYC.c, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  if (LIT.ov) drawLightOverlays(ctx, ...LIT.ov);
  ctx.globalCompositeOperation = 'source-over';
}

function drawHoverIso(ctx, t, sliced, ex) {
  const h = S.hover; if (!h || S.mode === 'plan' || S.mode === 'section') return;
  const eo = ex ? explodeOff(h.z) : 0;
  const tt = h.t;
  const hh = tt ? (CUTTABLE[tt] && sliced && !h.top ? HT / LH : TI[tt].slab ? 0.25 : 1) : 0.02;
  const col = h.top ? '#d8d0bf' : '#f0b43c';
  isoQuad(ctx, h.x, h.y, h.x + 1, h.y + 1, h.z + hh, col, null, eo);
  if (!tt && sliced && !ex) {   // plumb line to what you actually see below
    for (let z = h.z - 1; z >= 0; z--) {
      const b = cell(h.x, h.y, z);
      if (!b) continue;
      const ht = TI[b].slab ? 0.25 : 1;
      const p = projIso(h.x + 0.5, h.y + 0.5, h.z), q = projIso(h.x + 0.5, h.y + 0.5, z + ht);
      pline(ctx, p[0], p[1], q[0], q[1], 'rgba(240,180,60,0.8)', [2, 1]);
      isoQuad(ctx, h.x + 0.2, h.y + 0.2, h.x + 0.8, h.y + 0.8, z + ht, 'rgba(240,180,60,0.7)');
      plate(ctx, lvCode(z), q[0] + 4, q[1] - 3, '#1a1b1d', '#f0b43c', '#5a4a2a');
      break;
    }
  }
}
// ==========================================================================
// Lighting and fidelity studies, as a post-process on the rendered frame.
// Every pixel has a depth (and a face: top/left/right, or wire) from the
// occlusion pass; with its screen position that gives its exact 3D point.
// From there: sun shadows marched through the cell grid, per-pixel sky
// visibility and ambient occlusion, height mist, light shafts marched
// through open air, and bloom. lightMock(opts) draws the result into an
// overlay over the view; fidelityMock(mode, rect) shows a crop upscaled.
// ==========================================================================
function solidL(x, y, z) {
  if (z < 0) return true;
  const cx = Math.floor(x), cy = Math.floor(y), cz = Math.floor(z);
  if (cx < 0 || cy < 0 || cx >= W || cy >= D || cz >= NL) return false;
  const t = cells[idx(cx, cy, cz)]; if (!t) return false;
  const f = z - cz;
  if (t === T.TREE) return f > 0.35;
  const o = occOf(t); return !!o && f >= o[0] && f <= o[1];
}
// a direction in the rotated (view) frame -> world frame
function dirFromRot(a, b) {
  switch (S.rot) { case 1: return [b, -a]; case 2: return [-a, -b]; case 3: return [-b, a]; default: return [a, b]; }
}
const SUNS = {
  morning: { az: 200, el: 22, col: [1.12, 0.98, 0.82], shade: [0.55, 0.6, 0.78] },
  noon: { az: 120, el: 62, col: [1.08, 1.06, 1.0], shade: [0.62, 0.66, 0.78] },
  evening: { az: 330, el: 13, col: [1.2, 0.86, 0.62], shade: [0.48, 0.5, 0.7] }
};
function sunVec(name) { const s = SUNS[name], a = s.az * Math.PI / 180, e = s.el * Math.PI / 180; return [Math.cos(e) * Math.cos(a), Math.cos(e) * Math.sin(a), Math.sin(e)]; }
function sunVisible(p, sv, maxd) {
  for (let d = 0.12; d < maxd; d += 0.25) {
    const x = p[0] + sv[0] * d, y = p[1] + sv[1] * d, z = p[2] + sv[2] * d;
    if (z >= NL || x < -2 || y < -2 || x > W + 2 || y > D + 2) return true;
    if (solidL(x, y, z)) return false;
  }
  return true;
}
// world point and normal for buffer pixel i (null for sky)
function pixelWorld(i, bw, b) {
  const fd = WDT.fd[i], wd = WDT.wd ? WDT.wd[i] : -1e9, Dv = Math.max(fd, wd);
  if (Dv < -1e8) return null;
  const x = i % bw, y = (i / bw) | 0, Xp = x + 0.5 - b[0], Yp = y + 0.5 - b[1];
  const s = (Yp + 12 * Dv) / 22, z = Dv - 1.5 * s, dd = Xp / 8, u = (s + dd) / 2, v = (s - dd) / 2;
  const [wx, wy] = fromRotF(u, v), face = wd > fd ? 4 : WDT.face[i];
  let n = [0, 0, 1];
  if (face === 2) { const d = dirFromRot(0, 1); n = [d[0], d[1], 0]; }
  else if (face === 3) { const d = dirFromRot(1, 0); n = [d[0], d[1], 0]; }
  return { p: [wx, wy, z], n, face };
}
function boxBlur(src, w, h, r) {
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
  for (let y = 0; y < h; y++) { let acc = 0; for (let x = -r; x <= r; x++) acc += src[y * w + clamp(x, 0, w - 1)]; for (let x = 0; x < w; x++) { tmp[y * w + x] = acc / (2 * r + 1); acc += src[y * w + clamp(x + r + 1, 0, w - 1)] - src[y * w + clamp(x - r, 0, w - 1)]; } }
  for (let x = 0; x < w; x++) { let acc = 0; for (let y = -r; y <= r; y++) acc += tmp[clamp(y, 0, h - 1) * w + x]; for (let y = 0; y < h; y++) { out[y * w + x] = acc / (2 * r + 1); acc += tmp[clamp(y + r + 1, 0, h - 1) * w + x] - tmp[clamp(y - r, 0, h - 1) * w + x]; } }
  return out;
}
// o: { sun: 'morning'|'noon'|'evening'|null, ao, sky, fog, shafts, bloom, fogCol }
function lightMock(o) {
  WIRES.forceScreen = true; render(); WIRES.forceScreen = false;
  const bw = S.bw, bh = S.bh, b = isoBase(), img = VIEW.ctx.getImageData(0, 0, bw, bh), px = img.data;
  const sv = o.sun ? sunVec(o.sun) : null, SUN = o.sun ? SUNS[o.sun] : null;
  const zref = (S.mode === 'cut' && S.level < NL - 1) ? S.level + HT / LH : NL;
  const view = (() => { const d = dirFromRot(1.5, 1.5); return v3.norm([d[0], d[1], 1]); })();
  const out = new Float32Array(bw * bh * 3);
  const P = new Array(bw * bh);
  for (let i = 0; i < bw * bh; i++) P[i] = pixelWorld(i, bw, b);
  for (let i = 0; i < bw * bh; i++) {
    let r = px[i * 4], g = px[i * 4 + 1], bl = px[i * 4 + 2];
    const w = P[i];
    if (w) {
      const p = w.p, n = w.n, q = [p[0] + n[0] * 0.06, p[1] + n[1] * 0.06, p[2] + n[2] * 0.06];
      let m = [1, 1, 1];
      if (o.sky || o.ao) {
        let sky = 1, ao = 1;
        if (o.sky) { let open = 0; for (const [dx, dy] of [[0, 0], [0.7, 0], [-0.7, 0], [0, 0.7], [0, -0.7]]) { let hit = false; for (let d = 0.5; d < 14 && !hit; d += 0.5) { const z = q[2] + d; if (z >= NL) break; if (solidL(q[0] + dx * d, q[1] + dy * d, z)) hit = true; } if (!hit) open++; } sky = open / 5; }
        if (o.ao) { let occ = 0; const S6 = [[0.4, 0, 0.15], [-0.4, 0, 0.15], [0, 0.4, 0.15], [0, -0.4, 0.15], [0.28, 0.28, 0.4], [-0.28, -0.28, 0.4]]; for (const [a, c, e] of S6) if (solidL(q[0] + a + n[0] * e, q[1] + c + n[1] * e, q[2] + n[2] * e + 0.05)) occ++; ao = 1 - occ / 6 * 0.55; }
        const k = (o.sky ? 0.55 + 0.45 * sky : 1) * ao;
        m = [k, k, k * (o.sky ? 0.96 + 0.06 * sky : 1)];
      }
      if (sv) {
        const ndl = w.face === 0 ? 0.5 : w.face === 4 ? 0.8 : Math.max(0, n[0] * sv[0] + n[1] * sv[1] + n[2] * sv[2]);
        const lit = ndl > 0.02 && sunVisible(q, sv, 34);
        const L = lit ? SUN.col.map(c => lerp(1, c, 0.6) * (0.92 + 0.22 * ndl)) : SUN.shade;
        m = [m[0] * L[0], m[1] * L[1], m[2] * L[2]];
      }
      r *= m[0]; g *= m[1]; bl *= m[2];
      if (o.fog) {
        const depth = Math.max(0, zref - p[2]), f = Math.min(0.85, (1 - Math.exp(-depth * o.fog)) * 0.9), fc = o.fogCol || [70, 82, 92];
        r = lerp(r, fc[0], f); g = lerp(g, fc[1], f); bl = lerp(bl, fc[2], f);
      }
    }
    out[i * 3] = r; out[i * 3 + 1] = g; out[i * 3 + 2] = bl;
  }
  // light shafts: march from each surface toward the viewer through open air, counting sunlit air
  if (o.shafts && sv) {
    const hw = bw >> 1, hh = bh >> 1, acc = new Float32Array(hw * hh);
    for (let y = 0; y < hh; y++) for (let x = 0; x < hw; x++) {
      const w = P[(y * 2) * bw + x * 2];
      let a = 0;
      const p = w ? w.p : null;
      if (p) for (let d = 0.3; d < 7; d += 0.35) {
        const s3 = [p[0] + view[0] * d, p[1] + view[1] * d, p[2] + view[2] * d];
        if (s3[2] > zref) break;
        if (solidL(...s3)) continue;
        if (sunVisible(s3, sv, 26)) a += 0.35;
      }
      acc[y * hw + x] = a;
    }
    const bl2 = boxBlur(acc, hw, hh, 1), C = SUN.col;
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
      const a = bl2[(y >> 1) * hw + Math.min(hw - 1, x >> 1)], k = Math.min(0.4, a * o.shafts * 0.09), i = y * bw + x;
      out[i * 3] += 255 * k * 0.9 * C[0] * 0.55; out[i * 3 + 1] += 255 * k * 0.85 * C[1] * 0.55; out[i * 3 + 2] += 255 * k * 0.7 * C[2] * 0.55;
    }
  }
  // bloom: bright warm pixels bleed into the air around them
  if (o.bloom) {
    const lum = new Float32Array(bw * bh);
    for (let i = 0; i < bw * bh; i++) { const r = out[i * 3], g = out[i * 3 + 1], bl = out[i * 3 + 2], l = (r * 0.5 + g * 0.4 + bl * 0.1) / 255; lum[i] = l > 0.55 && r > bl * 1.3 ? (l - 0.4) * 2.2 : 0; }
    const b1 = boxBlur(lum, bw, bh, 2), b2 = boxBlur(lum, bw, bh, 7);
    for (let i = 0; i < bw * bh; i++) { const k = (b1[i] * 0.9 + b2[i] * 1.4) * o.bloom; out[i * 3] += 255 * k; out[i * 3 + 1] += 200 * k; out[i * 3 + 2] += 110 * k; }
  }
  for (let i = 0; i < bw * bh; i++) { px[i * 4] = clamp(out[i * 3], 0, 255); px[i * 4 + 1] = clamp(out[i * 3 + 1], 0, 255); px[i * 4 + 2] = clamp(out[i * 3 + 2], 0, 255); }
  showOverlay(img);
}
function showOverlay(img) {
  let ov = document.getElementById('lightov');
  if (!ov) { ov = document.createElement('canvas'); ov.id = 'lightov'; document.getElementById('stage').appendChild(ov); }
  const cv = document.getElementById('view');
  ov.width = img.width; ov.height = img.height;
  Object.assign(ov.style, { position: 'absolute', left: cv.offsetLeft + 'px', top: cv.offsetTop + 'px', width: cv.style.width, height: cv.style.height, imageRendering: 'pixelated', zIndex: 15, pointerEvents: 'none' });
  ov.getContext('2d').putImageData(img, 0, 0);
}
function clearOverlay() { const ov = document.getElementById('lightov'); if (ov) ov.remove(); }

// ---------- fidelity ----------
// Scale2x (EPX): smooths staircase edges while keeping hard colour boundaries
function scale2x(src) {
  const w = src.width, h = src.height, s = src.data, out = new ImageData(w * 2, h * 2), o = out.data;
  const at = (x, y) => (clamp(y, 0, h - 1) * w + clamp(x, 0, w - 1)) * 4, eq = (a, b) => s[a] === s[b] && s[a + 1] === s[b + 1] && s[a + 2] === s[b + 2];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const P = at(x, y), A = at(x, y - 1), B = at(x + 1, y), C = at(x - 1, y), Dd = at(x, y + 1);
    const e = [P, P, P, P];
    if (eq(C, A) && !eq(C, Dd) && !eq(A, B)) e[0] = A;
    if (eq(A, B) && !eq(A, C) && !eq(B, Dd)) e[1] = B;
    if (eq(Dd, C) && !eq(Dd, B) && !eq(C, A)) e[2] = C;
    if (eq(B, Dd) && !eq(B, A) && !eq(Dd, C)) e[3] = Dd;
    for (let k = 0; k < 4; k++) { const ox = x * 2 + (k & 1), oy = y * 2 + (k >> 1), oi = (oy * w * 2 + ox) * 4; o[oi] = s[e[k]]; o[oi + 1] = s[e[k] + 1]; o[oi + 2] = s[e[k] + 2]; o[oi + 3] = 255; }
  }
  return out;
}
// mode: 'crisp' | 'scale2x' | 'smooth' | 'hybrid'; rect in buffer pixels; result is 4x
function fidelityMock(mode, rect) {
  const [rx, ry, rw, rh] = rect, cv = document.createElement('canvas'); cv.width = rw * 4; cv.height = rh * 4;
  const g = cv.getContext('2d');
  const grab = () => VIEW.ctx.getImageData(rx, ry, rw, rh);
  if (mode === 'hybrid') {
    // the city crisp, the wires redrawn as smooth strokes at 4x
    const keep = [WIRES.cables, WIRES.ties, WIRES.girders, WIRES.mounts, WIRES.posts];
    WIRES.cables = []; WIRES.ties = []; WIRES.girders = []; WIRES.mounts = []; WIRES.posts = []; spineCache.key = -1; render();
    const base = grab(); [WIRES.cables, WIRES.ties, WIRES.girders, WIRES.mounts, WIRES.posts] = keep; spineCache.key = -1; render();
    const t1 = document.createElement('canvas'); t1.width = rw; t1.height = rh; t1.getContext('2d').putImageData(base, 0, 0);
    g.imageSmoothingEnabled = false; g.drawImage(t1, 0, 0, rw * 4, rh * 4);
    g.save(); g.scale(4, 4); g.translate(-rx, -ry); g.lineCap = 'round'; g.lineJoin = 'round';
    const SPn = spines(), hidden = new Map();
    for (const sp of SPn) sp.r.pairs.forEach(pr => { if (!hidden.has(pr.c)) hidden.set(pr.c, []); hidden.get(pr.c).push([pr.a.i, pr.b.i]); });
    const strokes = [];
    for (const c of WIRES.cables) {
      const hid = hidden.get(c) || [], run = [];
      for (let i = 0; i < c.n; i++) {
        const inside = hid.some(([a, b]) => i > a && i < b);
        if (inside) { if (run.length > 1) strokes.push({ c, pts: run.slice() }); run.length = 0; continue; }
        run.push(projIso(c.X[i * 3], c.X[i * 3 + 1], c.X[i * 3 + 2] + c.g.r * 0.6));
      }
      if (run.length > 1) strokes.push({ c, pts: run });
    }
    for (const sp of SPn) sp.r.pairs.forEach((pr, j) => { const pts = []; for (let k = 0; k <= sp.N; k++) { const q = sp.pos(j, k); pts.push(projIso(q[0], q[1], q[2] + pr.c.g.r * 0.6)); } strokes.push({ c: pr.c, pts, d: depthKey(...sp.pos(j, sp.N >> 1)) }); });
    strokes.forEach(st => { if (st.d == null) st.d = depthKey(...xAt(st.c, st.c.n >> 1)); });
    strokes.sort((a, b) => a.d - b.d);
    for (const st of strokes) {
      const pal = wpal(cableHex(st.c), 4), wv = Math.max(0.55, st.c.g.px * 0.8);
      for (const [col, lw, dy] of [[pal[3], wv + 0.45, 0], [pal[1], wv, 0], [pal[0], wv * 0.35, -wv * 0.25]]) {
        g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); st.pts.forEach((q, k) => k ? g.lineTo(q[0], q[1] + dy) : g.moveTo(q[0], q[1] + dy)); g.stroke();
      }
    }
    for (const sp of SPn) for (const [t, k] of [[sp.r.t1, 0], [sp.r.t2, sp.N]]) {
      const p = sp.pts[k], f = sp.F[k], rr = sp.R[k] + 0.02; g.strokeStyle = '#efe9dc'; g.lineWidth = 0.6; g.beginPath();
      for (let j = 0; j <= 24; j++) { const th = j / 24 * Math.PI * 2, q3 = [p[0] + f.A[0] * Math.cos(th) * rr + f.U[0] * Math.sin(th) * rr, p[1] + f.A[1] * Math.cos(th) * rr + f.U[1] * Math.sin(th) * rr, p[2] + f.A[2] * Math.cos(th) * rr + f.U[2] * Math.sin(th) * rr], q = projIso(...q3); j ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); }
      g.stroke();
    }
    for (const gd of WIRES.girders) { const a = projIso(...gd.a), b2 = projIso(...gd.b); g.strokeStyle = '#2a3036'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b2[0], b2[1]); g.stroke(); g.strokeStyle = '#c7d2d9'; g.lineWidth = 0.9; g.beginPath(); g.moveTo(a[0], a[1] - 0.2); g.lineTo(b2[0], b2[1] - 0.2); g.stroke(); }
    g.restore();
  } else {
    let im = grab();
    if (mode === 'scale2x' || mode === 'smooth') im = scale2x(scale2x(im));
    const t1 = document.createElement('canvas'); t1.width = im.width; t1.height = im.height; t1.getContext('2d').putImageData(im, 0, 0);
    g.imageSmoothingEnabled = mode === 'smooth'; g.imageSmoothingQuality = 'high';
    if (mode === 'smooth') { g.filter = 'blur(0.7px)'; }
    g.drawImage(t1, 0, 0, rw * 4, rh * 4);
  }
  Object.assign(cv.style, { position: 'fixed', left: 0, top: 0, zIndex: 103, imageRendering: mode === 'smooth' ? 'auto' : 'pixelated' });
  document.getElementById('sheet') && document.getElementById('sheet').remove();
  cv.id = 'sheet'; document.body.appendChild(cv);
  return [cv.width, cv.height];
}
window.lightMock = lightMock; window.fidelityMock = fidelityMock; window.clearOverlay = clearOverlay;
// ==========================================================================
// Live lighting (the L-series studies, running for real). Volumes over the
// cell grid, half a cell across and a quarter cell up, are worked out once per
// world or sun change: what each voxel lets through, how much sky it sees and
// how much sun reaches it. Each level's cached image is lit from them as it is
// built (sun and shadow, sky light, occlusion), so a settled frame costs
// nothing extra. Mist is a tint per level at composite time; light shafts and
// night bloom are overlays cached per view and drawn with one call a frame.
// ==========================================================================
const LIT = {
  on: true,
  sunOn: true, sky: true, ao: true,   // baked into the level images (changing them relights)
  mist: true, shafts: true, bloom: true, mistA: 0.035, shaftK: 1, bloomK: 1,   // drawn per frame
  sun: 'noon',                        // 'morning' | 'noon' | 'evening' | 'night'
  tkey: '', skey: '', tr: null, skyV: null, sunSoft: null, sunHard: null, sv: null,
  shaftC: null, shKey: '', bloomC: null, blKey: ''
};
const LNX = W * 2, LNY = D * 2, LNZ = NL * 4, LLAY = LNX * LNY;
const LIGHT_TIMES = ['morning', 'noon', 'evening', 'night'];
const MIST = { morning: [104, 98, 94], noon: [62, 78, 90], evening: [104, 74, 58], night: [18, 26, 36] };
const litFloor = () => S.lightFloor || 0;   // the coarse baked sky term stays under the live light, as in the studies
const litSun = () => LIT.on && LIT.sunOn && LIT.sun !== 'night' ? SUNS[LIT.sun] : null;
const litKey = () => [LIT.skey, LIT.sunOn, LIT.sky, LIT.ao].join('|');   // what the baked light depends on

// how much light a voxel lets through (0 solid .. 1 open air)
function litTrans(t, f) {
  if (!t) return 1;
  switch (t) {
    case T.TREE: return f > 0.35 ? 0.3 : 1;
    case T.FRAME: case T.TRUSS: case T.CRANE: return 0.7;
    case T.PILLAR: case T.LAMP: case T.ANTENNA: case T.VENT: case T.PIPE: return 0.85;
    case T.VAULT: return 0.6;
  }
  const o = occOf(t); return o && f >= o[0] && f <= o[1] ? 0 : 1;
}
// light arriving along dir, swept down one voxel layer at a time from the open sky; each
// layer reads the one above (bilinear), so it is soft: right for sky light and shafts
function sweepSoft(dir, out, wgt) {
  const tr = LIT.tr, k = 0.25 / dir[2], ox = dir[0] * k * 2, oy = dir[1] * k * 2;
  const cur = new Float32Array(LLAY), prev = new Float32Array(LLAY).fill(1);
  const at = (xi, yi) => xi < 0 || yi < 0 || xi >= LNX || yi >= LNY ? 1 : prev[yi * LNX + xi];
  for (let z = LNZ - 1; z >= 0; z--) {
    for (let y = 0; y < LNY; y++) for (let x = 0; x < LNX; x++) {
      const fx = x + ox, fy = y + oy, x0 = Math.floor(fx), y0 = Math.floor(fy), wx = fx - x0, wy = fy - y0;
      const up = (at(x0, y0) * (1 - wx) + at(x0 + 1, y0) * wx) * (1 - wy) + (at(x0, y0 + 1) * (1 - wx) + at(x0 + 1, y0 + 1) * wx) * wy;
      const i = y * LNX + x, v = tr[z * LLAY + i] * up;
      cur[i] = v; out[z * LLAY + i] += v * wgt;
    }
    prev.set(cur);
  }
}
function ensureLightVol() {
  let h = 0; for (let i = 0; i < cells.length; i++) h = (h * 31 + cells[i]) | 0;
  const tkey = String(h), skey = tkey + ':' + LIT.sun;
  if (LIT.tkey !== tkey) {
    const tr = LIT.tr || (LIT.tr = new Float32Array(LLAY * LNZ));
    for (let z = 0; z < LNZ; z++) { const cz = z >> 2, f = ((z & 3) + 0.5) / 4;
      for (let y = 0; y < LNY; y++) for (let x = 0; x < LNX; x++) tr[z * LLAY + y * LNX + x] = litTrans(cells[idx(x >> 1, y >> 1, cz)], f); }
    const sky = LIT.skyV || (LIT.skyV = new Float32Array(LLAY * LNZ)); sky.fill(0);
    for (const [d, w] of [[[0, 0, 1], 2], [[0.6, 0, 0.8], 1], [[-0.6, 0, 0.8], 1], [[0, 0.6, 0.8], 1], [[0, -0.6, 0.8], 1]]) sweepSoft(d, sky, w / 6);
    LIT.tkey = tkey; LIT.skey = '';
  }
  if (LIT.skey !== skey) {
    const s = litSun();
    LIT.sv = s ? sunVec(LIT.sun) : null;
    if (s) {
      const soft = LIT.sunSoft || (LIT.sunSoft = new Float32Array(LLAY * LNZ)); soft.fill(0); sweepSoft(LIT.sv, soft, 1);
      (LIT.sunHard || (LIT.sunHard = new Float32Array(LLAY * LNZ))).fill(-1);
    }
    LIT.skey = skey;
  }
}
// hard sun at one voxel, marched on demand (only voxels next to surfaces are ever asked)
function sunHardAt(i) {
  let v = LIT.sunHard[i]; if (v >= 0) return v;
  const tr = LIT.tr, sv = LIT.sv, k = 0.25 / sv[2], ox = sv[0] * k * 2, oy = sv[1] * k * 2;
  const z = (i / LLAY) | 0, r = i - z * LLAY, y = (r / LNX) | 0, x = r - y * LNX;
  v = tr[i];
  if (v > 0) for (let s = 1; z + s < LNZ; s++) {
    const xi = Math.round(x + ox * s), yi = Math.round(y + oy * s);
    if (xi < 0 || yi < 0 || xi >= LNX || yi >= LNY) break;
    v *= tr[(z + s) * LLAY + yi * LNX + xi]; if (v < 0.02) { v = 0; break; }
  }
  LIT.sunHard[i] = v; return v;
}
// trilinear lookup at a world point; V null means the hard sun
function volAt(V, x, y, z) {
  const fx = x * 2 - 0.5, fy = y * 2 - 0.5, fz = z * 4 - 0.5;
  if (fz >= LNZ - 1) return 1;
  const x0 = Math.floor(fx), y0 = Math.floor(fy), z0 = Math.floor(fz), wx = fx - x0, wy = fy - y0, wz = fz - z0;
  let s = 0;
  for (let c = 0; c < 8; c++) {
    const dx = c & 1, dy = (c >> 1) & 1, dz = c >> 2, w = (dx ? wx : 1 - wx) * (dy ? wy : 1 - wy) * (dz ? wz : 1 - wz);
    if (w === 0) continue;
    const xi = x0 + dx, yi = y0 + dy, zi = z0 + dz;
    let v;
    if (zi >= LNZ || xi < 0 || yi < 0 || xi >= LNX || yi >= LNY) v = 1;
    else if (zi < 0) v = 0;
    else { const i = zi * LLAY + yi * LNX + xi; v = V ? V[i] : sunHardAt(i); }
    s += v * w;
  }
  return s;
}
const trAt = (x, y, z) => { const xi = Math.floor(x * 2), yi = Math.floor(y * 2), zi = Math.floor(z * 4); if (zi >= LNZ || xi < 0 || yi < 0 || xi >= LNX || yi >= LNY) return 1; if (zi < 0) return 0; return LIT.tr[zi * LLAY + yi * LNX + xi]; };
const AO6 = [[0.4, 0, 0.15], [-0.4, 0, 0.15], [0, 0.4, 0.15], [0, -0.4, 0.15], [0.28, 0.28, 0.4], [-0.28, -0.28, 0.4]];
// light multiplier (r, g, b) for a surface point p with normal n; ndl given for sprite pixels (-1: from n)
function litMul(p, n, ndlFix, out) {
  const e = n[2] > 0.5 ? 0.2 : 0.3, qx = p[0] + n[0] * e, qy = p[1] + n[1] * e, qz = p[2] + n[2] * e;
  const sky = LIT.sky ? volAt(LIT.skyV, qx, qy, qz) : 1;
  let occ = 0; if (LIT.ao) for (const [a, c, h] of AO6) occ += 1 - trAt(qx + a + n[0] * h, qy + c + n[1] * h, qz + n[2] * h + 0.05);
  const k = (0.55 + 0.45 * Math.min(1, sky * 1.15)) * (1 - occ / 6 * 0.55);
  out[0] = k; out[1] = k; out[2] = k * (0.96 + 0.06 * sky);
  const SUN = litSun();
  if (SUN) {
    const sv = LIT.sv, ndl = ndlFix >= 0 ? ndlFix : Math.max(0, n[0] * sv[0] + n[1] * sv[1] + n[2] * sv[2]);
    const s = ndl > 0.02 ? volAt(null, qx, qy, qz) : 0, f = s * s * (3 - 2 * s);
    for (let c = 0; c < 3; c++) out[c] *= lerp(SUN.shade[c], lerp(1, SUN.col[c], 0.6) * (0.92 + 0.22 * ndl), f);
  }
  return out;
}
// light one level's cached image in place. Pixels map back to world points through their
// depth: s = u+v = (Y + 12 (D - z)) / 22, height = D - 1.5 s.
let LSCR = null;
function litScratch() { if (!LSCR) { const c = mk(CW, CH); LSCR = c.getContext('2d', { willReadFrequently: true }); } return LSCR; }
function lightLevel(tgt, z, cutMode, src) {
  ensureLightVol();
  const img = src.getImageData(0, 0, CW, CH), px = img.data, dep = tgt.dep, fac = tgt.face;
  const dl = dirFromRot(0, 1), dr = dirFromRot(1, 0), N = [[0, 0, 1], [0, 0, 1], [dl[0], dl[1], 0], [dr[0], dr[1], 0]];
  const m = [1, 1, 1], p = [0, 0, 0];
  for (let ry = 0; ry < CH; ry++) {
    const Yr = ry + 0.5 - OY, row = ry * CW;
    for (let rx = 0; rx < CW; rx++) {
      const i = row + rx, Dv = dep[i];
      if (Dv < -1e8 || px[i * 4 + 3] === 0) continue;
      const s = (Yr + 12 * (Dv - z)) / 22, d = (rx + 0.5 - OX) / 8, w = fromRotF((s + d) / 2, (s - d) / 2), F = fac[i];
      p[0] = w[0]; p[1] = w[1]; p[2] = Dv - 1.5 * s;
      if (cutMode && F === 1 && p[2] > z + HT / LH - 0.03) continue;   // the cut face itself is a drawing convention, not a lit surface
      litMul(p, N[F], F === 0 ? 0.5 : -1, m);
      px[i * 4] = Math.min(255, px[i * 4] * m[0]); px[i * 4 + 1] = Math.min(255, px[i * 4 + 1] * m[1]); px[i * 4 + 2] = Math.min(255, px[i * 4 + 2] * m[2]);
    }
  }
  tgt.g.clearRect(0, 0, CW, CH); tgt.g.putImageData(img, 0, 0);
}
// a cable's light: the same model, folded into the palette's brightness steps
const LQ_LIT = [0.40, 0.54, 0.69, 0.85, 1.0, 1.12, 1.24];
const WLQ = new Map();   // per quarter cell, cleared when the volumes change
function wireLightQ(x, y, z) {
  if (!LIT.tr || !LIT.skey) ensureLightVol();
  if (WLQ.key !== litKey()) { WLQ.clear(); WLQ.key = litKey(); }
  const qk = (Math.floor(x * 4) * 512 + Math.floor(y * 4)) * 128 + Math.floor(z * 4 + 4);
  let best = WLQ.get(qk); if (best !== undefined) return best;
  const m = litMul([x, y, z], [0, 0, 1], 0.8, [1, 1, 1]), l = (m[0] + m[1] + m[2]) / 3;
  best = 0; for (let k = 1; k < LQ_LIT.length; k++) if (Math.abs(LQ_LIT[k] - l) < Math.abs(LQ_LIT[best] - l)) best = k;
  WLQ.set(qk, best); return best;
}
const mistOn = () => LIT.on && LIT.mist && LIT.mistA > 0;
const MIST_LEVELS = 8;   // mist thickens over the first eight levels below the cut, then holds (a deep view stays legible)
const mistRGB = () => MIST[LIT.sun] || MIST.noon;
// mist over a cable drawn at level z, as much as the per-level tints give the level itself
function wireMist(z) {
  if (!mistOn() || S.mode !== 'cut' || S.level >= NL - 1 || z >= S.level) return 0;
  return 1 - Math.pow(1 - LIT.mistA, Math.min(MIST_LEVELS, S.level - z));
}

// ---------- overlays in the level frame (x as the caches, y from NL levels above level 0) ----------
const LFH = CH + NL * LH;
function levelCache(z, L, cut) { return cut && z === L ? cutCache(L) : LC[z]; }
// shafts: from the surface under each (quarter-res) pixel, march toward the viewer through
// open air below the cut and add up the sunlit air
function shaftsLayer(top, L, cut) {
  const key = [top, L, cut, S.rot, LIT.sun, LIT.skey, DEPV, LIT.shaftK].join('|');
  if (LIT.shKey === key) return LIT.shaftC;
  const qw = Math.ceil(CW / 4), qh = Math.ceil(LFH / 4), acc = new Float32Array(qw * qh), SUN = litSun();
  const zref = cut ? L + HT / LH : NL, vd = dirFromRot(1.5, 1.5), view = v3.norm([vd[0], vd[1], 1]);
  for (let qy = 0; qy < qh; qy++) for (let qx = 0; qx < qw; qx++) {
    const px = qx * 4 + 2, pyR = qy * 4 + 2 - NL * LH;
    let best = -1e9;
    for (let z = 0; z <= top; z++) { const c = levelCache(z, L, cut); if (!c || !c.dep) continue; const cy = pyR + z * LH; if (cy < 0 || cy >= CH) continue; const d = c.dep[cy * CW + px]; if (d > best) best = d; }
    if (best < -1e8) continue;
    const s = (pyR + 0.5 - OY + 12 * best) / 22, dd = (px + 0.5 - OX) / 8, w = fromRotF((s + dd) / 2, (s - dd) / 2), pz = best - 1.5 * s;
    let a = 0;
    for (let d = 0.3; d < 7; d += 0.35) {
      const x = w[0] + view[0] * d, y = w[1] + view[1] * d, z = pz + view[2] * d;
      if (z > zref) break;
      if (trAt(x, y, z) < 0.5) continue;
      a += volAt(LIT.sunSoft, x, y, z) * 0.35;
    }
    acc[qy * qw + qx] = a;
  }
  const bl = boxBlur(acc, qw, qh, 1), c = LIT.shaftC && LIT.shaftC.width === qw && LIT.shaftC.height === qh ? LIT.shaftC : mk(qw, qh);
  const g = c.getContext('2d'), img = g.createImageData(qw, qh), C = SUN.col;
  for (let i = 0; i < qw * qh; i++) {
    const k = Math.min(0.3 * LIT.shaftK, bl[i] * 0.065 * LIT.shaftK) * 255 * 0.55;
    img.data[i * 4] = k * 0.9 * C[0]; img.data[i * 4 + 1] = k * 0.85 * C[1]; img.data[i * 4 + 2] = k * 0.7 * C[2]; img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  LIT.shaftC = c; LIT.shKey = key;
  return c;
}
// bloom: every level's lit windows, hidden where a nearer level covers them, blurred
function bloomLayer(top, L, cut) {
  const key = [top, L, cut, S.rot, S.tod, DEPV].join('|');
  if (LIT.blKey === key) return LIT.bloomC;
  const full = mk(CW, LFH), g = full.getContext('2d');
  for (let z = 0; z <= top; z++) {
    const c = levelCache(z, L, cut); if (!c) continue;
    const y = NL * LH - z * LH;
    g.globalCompositeOperation = 'destination-out'; g.drawImage(c.c, 0, y);
    g.globalCompositeOperation = 'source-over'; if (c.em) g.drawImage(c.em.c, 0, y);
  }
  const b = LIT.bloomC || mk(CW >> 1, LFH >> 1), bg = b.getContext('2d');
  bg.clearRect(0, 0, b.width, b.height);
  bg.globalCompositeOperation = 'lighter';
  bg.filter = 'blur(2px)'; bg.drawImage(full, 0, 0, b.width, b.height);
  bg.filter = 'blur(6px)'; bg.drawImage(full, 0, 0, b.width, b.height);
  bg.filter = 'none'; bg.globalCompositeOperation = 'source-over';
  LIT.bloomC = b; LIT.blKey = key;
  return b;
}
// drawn after the world: shafts by day, bloom by night
function drawLightOverlays(ctx, top, L, cut, bx0, by0) {
  if (!LIT.on) return;
  const y = by0 - NL * LH;
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.imageSmoothingEnabled = true;
  if (LIT.shafts && LIT.shaftK > 0 && litSun()) ctx.drawImage(shaftsLayer(top, L, cut), bx0, y, Math.ceil(CW / 4) * 4, Math.ceil(LFH / 4) * 4);
  if (LIT.bloom && LIT.bloomK > 0 && S.tod !== 'day') { ctx.globalAlpha = Math.min(1, (S.tod === 'night' ? 0.85 : 0.5) * LIT.bloomK); ctx.drawImage(bloomLayer(top, L, cut), bx0, y, CW, LFH); if (LIT.bloomK > 1) { ctx.globalAlpha = Math.min(1, LIT.bloomK - 1) * 0.85; ctx.drawImage(LIT.bloomC, bx0, y, CW, LFH); } }
  ctx.restore();
}

// ---------- controls ----------
function setLightTime(sun) {
  LIT.sun = sun;
  S.tod = sun === 'night' ? 'night' : 'day';
  SPR = new Map(); GHOST.clear(); podSprites(); markAllDirty(); skyDirty = true;
  $('todv').textContent = sun[0].toUpperCase() + sun.slice(1);
  syncLightPanel();
}
function relight() { SPR = new Map(); GHOST.clear(); podSprites(); markAllDirty(); skyDirty = true; }
function toggleLight(v) {
  LIT.on = v == null ? !LIT.on : v;
  $('bLight').setAttribute('aria-pressed', LIT.on);
  if (LIT.on) setLightTime(LIT.sun); else { $('todv').textContent = TODS[S.tod].name; relight(); }
  syncLightPanel(); sfx.click();
}
// the settings popover (LT1): what is baked into the levels (relights) and what is drawn per frame.
// Built with the shared chrome controls (groove toggles, groove sliders, segmented times; see 80_ui.js).
const LIGHT_PARTS = [['sunOn', 'Sun & shadows', 1], ['sky', 'Sky light', 1], ['ao', 'Occlusion', 1], ['mist', 'Mist', 0, 'mistA', 0, 0.08, 0.005], ['shafts', 'Shafts', 0, 'shaftK', 0, 2, 0.1], ['bloom', 'Night glow', 0, 'bloomK', 0, 2, 0.1]];
const LIGHT_DEFAULTS = { sunOn: true, sky: true, ao: true, mist: true, shafts: true, bloom: true, mistA: 0.035, shaftK: 1, bloomK: 1 };
let relightT = 0;
function setupLightPanel() {
  const pop = document.createElement('div'); pop.id = 'lightPop'; pop.className = 'popm pn'; pop.hidden = true;
  document.body.appendChild(pop);
  pop.addEventListener('click', e => {
    const t = e.target.closest('[data-lk],[data-t],[data-lreset]'); if (!t) return;
    if (t.dataset.lk === 'on') { toggleLight(); return; }
    if (t.dataset.lk) {
      if (!LIT.on) return;
      const k = t.dataset.lk; LIT[k] = !LIT[k];
      if (LIGHT_PARTS.find(q => q[0] === k)[2]) { clearTimeout(relightT); relightT = setTimeout(relight, 60); }
      syncLightPanel(); sfx.click(); return;
    }
    if (t.dataset.t) { if (LIT.on) { setLightTime(t.dataset.t); sfx.click(); } return; }
    if (t.dataset.lreset) { Object.assign(LIT, LIGHT_DEFAULTS); relight(); syncLightPanel(); sfx.click(); }
  });
  const open = () => { const r = $('bLight').getBoundingClientRect(); pop.hidden = false; syncLightPanel(); pop.style.left = clamp(r.left, 4, innerWidth - pop.offsetWidth - 4) + 'px'; pop.style.top = r.bottom + 6 + 'px'; syncBar(); };
  const close = () => { pop.hidden = true; syncBar(); };
  $('bLight').addEventListener('contextmenu', e => { e.preventDefault(); open(); });
  $('bLight').addEventListener('click', e => { if (e.ctrlKey || e.metaKey) { e.stopImmediatePropagation(); e.preventDefault(); open(); } }, true);
  $('bLightMenu').onclick = e => { e.stopPropagation(); pop.hidden ? open() : close(); };
  document.addEventListener('pointerdown', e => { if (!pop.hidden && !pop.contains(e.target) && !$('bLightMenu').contains(e.target) && !$('bLight').contains(e.target)) close(); });
}
function syncLightPanel() {
  const pop = $('lightPop'); if (!pop || pop.hidden) return;
  const off = !LIT.on, ti = Math.max(0, LIGHT_TIMES.indexOf(LIT.sun));
  pop.innerHTML = `<div class="lp-h ttl"><span>Lighting</span><span class="lp-sw" data-lk="on" role="switch" aria-checked="${LIT.on}" aria-label="Lighting on/off">${LIT.on ? 'on' : 'off'}<span class="tgl ${LIT.on ? 'on' : ''}"></span></span></div>` +
    `<span class="sgc ${off ? 'dis' : ''}" role="radiogroup" aria-label="Time of day" style="--n:4;--i:${ti}">${LIGHT_TIMES.map(t => `<button type="button" class="${LIT.sun === t ? 'on' : ''}" data-t="${t}" data-tip="${t[0].toUpperCase() + t.slice(1)}" role="radio" aria-checked="${LIT.sun === t}" aria-label="${t}">${glyph(t)}</button>`).join('')}<i class="ind"></i></span>` +
    `<div class="rows">` + LIGHT_PARTS.map(([k, name, , pk]) => `<div class="row ${LIT[k] && !off ? 'on' : ''}"><span class="rt" data-lk="${k}">${glyph(k)}<span>${name}</span></span>${pk ? slHTML(pk, off || !LIT[k]) : '<span></span>'}<span data-lk="${k}" role="switch" aria-checked="${LIT[k]}" aria-label="${name}"><span class="tgl ${LIT[k] ? 'on' : ''} ${off ? 'dis' : ''}"></span></span></div>`).join('') +
    `</div><div class="foot"><span>I on/off · T time</span><button type="button" class="btn sm" data-lreset="1">Reset</button></div>`;
}
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
  const kx = SML + W * SCW - W - 2, ky = ty + 4;
  R_(g, kx - 1, ky - 1, W + 2, D + 2, '#6b665d'); R_(g, kx, ky, W, D, '#141516');
  for (let y = 0; y < D; y++) for (let x = 0; x < W; x++) {
    let tt = 0; for (let z = NL - 1; z >= G; z--) { tt = cell(x, y, z); if (tt) break; }
    if (!tt) continue;
    const cat = TI[tt].cat;
    g.fillStyle = tt === T.CORE || tt === T.LIFT ? '#d8d0bf' : cat === 'circ' ? '#9c7a37' : cat === 'land' ? '#4f6d3a' : cat === 'infill' ? '#6a6258' : '#3d3b38';
    g.fillRect(kx + x, ky + y, 1, 1);
  }
  g.fillStyle = '#e2573f';
  if (S.secAxis === 'x') g.fillRect(kx, ky + S.secIdx, W, 1); else g.fillRect(kx + S.secIdx, ky, 1, D);
  secDirty = false;
}
// ==========================================================================
// Life: transit pods on decks/tubes, pedestrians, lift cars, steam, motes,
// daylight columns in the light wells.
// ==========================================================================
let PODS = [], PEDS = [], STEAM = [], MOTES = [];
const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const PEDCOL = ['#c9b8a0', '#7a5a48', '#4f6a74', '#a04a3a', '#d9c38a', '#3f4a3a', '#b98a6a', '#6a6e7a', '#e0d6c0', '#8a3a2a'];
const SKIN = ['#e0bc96', '#9a6a48', '#c89870'];
const PODSPR = [];
function podSprites() {
  const cols = [['#e2dbc9', '#c8432b', '#9a948a'], ['#d6a84a', '#3a3632', '#94753a']];
  for (let ax = 0; ax < 2; ax++) { PODSPR[ax] = []; for (let c = 0; c < 2; c++) {
    const cv = mk(11, 8), g = cv.getContext('2d'), C = cols[c], lit = S.tod !== 'day';
    for (let k = 0; k < 8; k++) {
      const x = ax === 0 ? 1 + k : 9 - k, y = 1 + (k >> 1);
      R_(g, x, y, 1, 1, shadeRGB(C[0], 't', 4)); R_(g, x, y + 1, 1, 2, lit && k > 0 && k < 7 ? '#ffd98a' : shadeRGB(C[1], 'l', 4)); R_(g, x, y + 3, 1, 1, shadeRGB(C[2], 'r', 4));
    }
    PODSPR[ax][c] = cv;
  } }
}
function walkable(x, y, z) { const t = cell(x, y, z); if (!t || !TI[t].walk) return false; const up = cell(x, y, z + 1); return !(up && TI[up].poche); }
function initLife() {
  podSprites();
  PODS = [];
  for (const p of WORLD.paths) {
    const n = p.kind === 'tube' ? 2 : (p.cells.length > 12 ? 2 : 1);
    for (let k = 0; k < n; k++) PODS.push({ p, s: rr() * (p.cells.length - 1), dir: rr() < 0.5 ? 1 : -1, sp: 2.2 + rr() * 1.8, wait: 0, col: rr() < 0.5 ? 0 : 1, side: 0, lastW: -9 });
  }
  const walk = [];
  for (let z = 0; z < NL; z++) for (let y = 0; y < D; y++) for (let x = 0; x < W; x++) if (walkable(x, y, z)) walk.push([x, y, z]);
  PEDS = [];
  for (let k = 0; k < 260 && walk.length; k++) {
    const c = walk[Math.floor(rr() * walk.length)];
    PEDS.push({ x: c[0], y: c[1], z: c[2], tx: c[0], ty: c[1], f: 1, ox: 0.2 + rr() * 0.6, oy: 0.2 + rr() * 0.6, sp: 0.35 + rr() * 0.5, col: PEDCOL[k % PEDCOL.length], skin: SKIN[k % 3], dx: 0, dy: 0 });
  }
  STEAM = []; MOTES = [];
  for (const w of WORLD.wells) for (let k = 0; k < 18; k++) MOTES.push({ w, x: w.x + rr() * w.s, y: w.y + rr() * w.s, z: rr() * NL, ph: rr() * 6 });
}
function podPos(pod) {
  const cs = pod.p.cells, L = cs.length - 1, i = Math.min(L, Math.floor(pod.s)), f = pod.s - i, a = cs[i], b = cs[Math.min(i + 1, L)];
  const o = (a.perp[0] || a.perp[1]) ? (pod.dir > 0 ? 0.25 : 0.75) : 0.5;
  return [lerp(a.x, b.x, f) + 0.5 + a.perp[0] * o, lerp(a.y, b.y, f) + 0.5 + a.perp[1] * o, pod.p.z + (pod.p.kind === 'tube' ? 0.3 : 0.25), a.axis];
}
function updateLife(dt) {
  const cx = S.bw / 2;
  for (const pod of PODS) {
    if (pod.wait > 0) { pod.wait -= dt; continue; }
    const L = pod.p.cells.length - 1;
    pod.s += pod.dir * pod.sp * dt;
    if (pod.s >= L) { pod.s = L; pod.dir = -1; pod.wait = 1 + rr() * 1.6; }
    else if (pod.s <= 0) { pod.s = 0; pod.dir = 1; pod.wait = 1 + rr() * 1.6; }
    if (S.mode === 'cut' || S.mode === 'exploded') {
      const [px, py, pz] = podPos(pod), [sx, sy] = projIso(px, py, pz);
      const side = sx < cx ? -1 : 1;
      const dz = Math.abs(pod.p.z - S.level), near = S.mode === 'exploded' ? 0.35 : (dz === 0 ? 1 : dz <= 2 ? 0.45 : pod.p.z > S.level ? 0 : 0.15);
      if (pod.side && side !== pod.side && near > 0 && sy > 0 && sy < S.bh && S.time - pod.lastW > 2.5) { pod.lastW = S.time; sfx.whoosh(side, near); }
      pod.side = side;
    }
  }
  for (const p of PEDS) {
    p.f += dt * p.sp;
    if (p.f < 1) continue;
    p.x = p.tx; p.y = p.ty; p.f = 0;
    const opts = [];
    for (const d of DIRS4) if (walkable(p.x + d[0], p.y + d[1], p.z)) opts.push(d);
    if (!opts.length) { p.f = 1; continue; }
    const straight = opts.find(o => o[0] === p.dx && o[1] === p.dy);
    const ch = (straight && rr() < 0.7) ? straight : opts[Math.floor(rr() * opts.length)];
    p.dx = ch[0]; p.dy = ch[1]; p.tx = p.x + ch[0]; p.ty = p.y + ch[1];
  }
  for (const l of WORLD.lifts) {
    if (l.wait > 0) { l.wait -= dt; continue; }
    const d = l.target - l.z, st = Math.sign(d) * Math.min(Math.abs(d), dt * 1.6);
    l.z += st;
    if (Math.abs(l.target - l.z) < 0.001) { l.z = l.target; l.wait = 1.5 + rr() * 3; l.target = Math.floor(rr() * (l.top + 1)); }
  }
  if (!REDUCED) for (const e of WORLD.emitters) {
    if (rr() < dt * (e.k === 'vent' ? 1.6 : 1.1) && STEAM.length < 240)
      STEAM.push({ e, x: e.x + 0.3 + rr() * 0.4, y: e.y + 0.3 + rr() * 0.4, z: e.z + (e.k === 'vent' ? 0.55 : 0.28), vx: 0.12 + rr() * 0.1, vy: -0.05 + rr() * 0.1, vz: 0.25 + rr() * 0.12, life: 0, max: 2.5 + rr() * 2.5 });
  }
  for (let k = STEAM.length - 1; k >= 0; k--) {
    const s = STEAM[k]; s.life += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
    if (s.life > s.max) STEAM.splice(k, 1);
  }
  for (const m of MOTES) { m.z -= dt * 0.12; m.x += Math.sin(S.time * 0.7 + m.ph) * dt * 0.08; if (m.z < 0.2) m.z = NL - 0.5; }
}
function drawPed(ctx, bx, by, p) { ctx.fillStyle = p.skin; ctx.fillRect(bx, by - 3, 1, 1); ctx.fillStyle = p.col; ctx.fillRect(bx, by - 2, 1, 2); }
function drawLifeLevel(ctx, z, t) {
  const ex = S.explode > 0.001;
  for (const pod of PODS) {
    if (pod.p.z !== z) continue;
    const [px, py, pz, ax] = podPos(pod), [bx, by] = projIso(px, py, pz);
    if (bx < -12 || by < -12 || bx > S.bw + 12 || by > S.bh + 12) continue;
    ctx.globalAlpha = pod.p.kind === 'tube' ? 0.85 : 1;
    ctx.drawImage(PODSPR[screenAxis(ax)][pod.col], Math.round(bx) - 5, Math.round(by) - 6);
    ctx.globalAlpha = 1;
  }
  for (const p of PEDS) {
    if (p.z !== z) continue;
    const [bx, by] = projIso(lerp(p.x, p.tx, p.f) + p.ox, lerp(p.y, p.ty, p.f) + p.oy, z + 0.25);
    if (bx < 0 || by < 0 || bx > S.bw || by > S.bh) continue;
    drawPed(ctx, Math.round(bx), Math.round(by), p);
  }
  if (!ex && z === S.level && z < NL - 1) for (const l of WORLD.lifts) {
    if (l.top < z) continue;
    const at = Math.abs(l.z - z) < 0.5, below = l.z < z - 0.5 && l.z > z - 4;
    if (!at && !below) continue;
    const [bx, by] = projIso(l.x + 0.5, l.y + 0.5, z + HT / LH), X = Math.round(bx), Y = Math.round(by);
    if (at) { dia(ctx, X - 4, Y - 1, 8, '#d8b36a'); R_(ctx, X - 1, Y, 2, 1, '#8a6a36'); R_(ctx, X, Y - 3, 1, 3, '#3a3835'); }
    else { ctx.fillStyle = `rgba(216,179,106,${(0.5 - (z - l.z) * 0.1).toFixed(2)})`; ctx.fillRect(X - 2, Y + 1, 4, 1); }
  }
}
function drawSteam(ctx, t, maxZ) {
  for (const s of STEAM) {
    if (s.e.z > maxZ || s.z > maxZ + 1.4) continue;
    const [bx, by] = projIso(s.x, s.y, s.z), k = s.life / s.max, sz = 1 + Math.floor(k * 3);
    ctx.fillStyle = `rgba(222,216,204,${(0.34 * (1 - k)).toFixed(3)})`;
    ctx.fillRect(Math.round(bx) - (sz >> 1), Math.round(by) - (sz >> 1), sz, sz);
  }
}
function drawWellLight(ctx, t, maxZ) {
  const night = S.tod === 'night';
  for (const w of WORLD.wells) {
    const topH = Math.min(NL, maxZ + 1), botH = 0.35;
    const pts = [[w.x, w.y], [w.x + w.s, w.y], [w.x + w.s, w.y + w.s], [w.x, w.y + w.s]];
    const T0 = pts.map(p => projIso(p[0], p[1], topH)), B0 = pts.map(p => projIso(p[0], p[1], botH));
    const xl = Math.min(...T0.map(p => p[0])), xr = Math.max(...T0.map(p => p[0]));
    const ytop = Math.min(...T0.map(p => p[1])), ybot = Math.max(...B0.map(p => p[1]));
    ctx.fillStyle = night ? 'rgba(160,190,200,0.035)' : S.tod === 'dusk' ? 'rgba(255,196,120,0.06)' : 'rgba(255,246,220,0.07)';
    for (let x = Math.round(xl); x < xr; x += 2) ctx.fillRect(x, Math.round(ytop), 1, Math.round(ybot - ytop));
    if (!night) for (const m of MOTES) {
      if (m.w !== w || m.z > maxZ + 1) continue;
      const [bx, by] = projIso(m.x, m.y, m.z);
      if ((Math.sin(t * 3 + m.ph * 5) + 1) > 0.8) { ctx.fillStyle = 'rgba(255,240,205,0.8)'; ctx.fillRect(Math.round(bx), Math.round(by), 1, 1); }
    }
  }
}
function drawLifePlan(ctx, t) {
  const z = S.level;
  for (const pod of PODS) {
    if (pod.p.z !== z) continue;
    const [px, py] = podPos(pod), [bx, by] = projPlan(px, py);
    R_(ctx, Math.round(bx) - 2, Math.round(by) - 2, 4, 4, '#23201c'); R_(ctx, Math.round(bx) - 1, Math.round(by) - 1, 2, 2, pod.col ? '#d6a84a' : '#c8432b');
  }
  for (const p of PEDS) { if (p.z !== z) continue; const [bx, by] = projPlan(lerp(p.x, p.tx, p.f) + p.ox, lerp(p.y, p.ty, p.f) + p.oy); R_(ctx, Math.round(bx), Math.round(by), 1, 1, '#3a342c'); }
  for (const l of WORLD.lifts) if (Math.abs(l.z - z) < 0.5) { const [bx, by] = projPlan(l.x, l.y); R_(ctx, bx + 2, by + 2, 4, 4, '#e8a83c'); }
}
function drawLifeSec(ctx, t) {
  for (const l of WORLD.lifts) {
    if (Math.abs(secDepth(l.x + 0.5, l.y + 0.5)) > 0.5) continue;
    const [bx, by] = projSec(l.x + 0.5, l.y + 0.5, l.z);
    R_(ctx, Math.round(bx) - 3, Math.round(by) - 10, 6, 10, '#2a2724'); R_(ctx, Math.round(bx) - 2, Math.round(by) - 9, 4, 8, '#d8b36a');
    const o = secOrigin(); R_(ctx, Math.round(bx), o[1] + SMT + (NL - 1 - l.top) * SCH, 1, Math.round(by) - 10 - (o[1] + SMT + (NL - 1 - l.top) * SCH), '#5a5752');
  }
  for (const pod of PODS) {
    const [px, py, pz] = podPos(pod), d = secDepth(px, py);
    if (Math.abs(d) > 1.2) continue;
    const [bx, by] = projSec(px, py, pz - 0.25);
    ctx.globalAlpha = 1 - Math.abs(d) * 0.5;
    R_(ctx, Math.round(bx) - 4, Math.round(by) - 7, 8, 5, pod.col ? '#d6a84a' : '#e2dbc9'); R_(ctx, Math.round(bx) - 3, Math.round(by) - 6, 6, 1, S.tod === 'day' ? '#3a3632' : '#ffd98a');
    ctx.globalAlpha = 1;
  }
  for (const p of PEDS) {
    const px = lerp(p.x, p.tx, p.f) + p.ox, py = lerp(p.y, p.ty, p.f) + p.oy;
    if (Math.abs(secDepth(px, py)) > 0.5) continue;
    const [bx, by] = projSec(px, py, p.z + 0.25);
    R_(ctx, Math.round(bx), Math.round(by) - 4, 1, 1, p.skin); R_(ctx, Math.round(bx), Math.round(by) - 3, 1, 3, p.col);
  }
}
// ==========================================================================
// Blueprints, jobs, drones. A job = ordered pieces (structure -> infill ->
// fit-out) shown first as ghosts, then carried in by drones from the crane.
// ==========================================================================
let JOBS = [], DRONES = [], PUFFS = [], JOBNO = 0;
const OWN = { claude: { col: '#ff7a52', name: 'claude' }, you: { col: '#5fd3f2', name: 'you' } };
const COST = { [T.FRAME]: 120, [T.CAPSULE]: 180, [T.DECK]: 90, [T.TERRACE]: 60, [T.TREE]: 45, [T.LAMP]: 30, [T.WATER]: 70 };
let UNITS = [];   // captured blueprints

function lightAt(x, y, z) {
  let sum = 0;
  for (const [dx, dy, wgt] of [[0, 0, 2], [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1]]) {
    let tr = 1;
    for (let zz = z + 1, cx = x + dx, cy = y + dy; zz < NL; zz++, cx += dx, cy += dy) {
      if (cx < 0 || cy < 0 || cx >= W || cy >= D) break;
      const t = cells[idx(cx, cy, zz)];
      if (t) { tr *= 1 - TI[t].op; if (tr < 0.02) { tr = 0; break; } }
    }
    sum += tr * wgt;
  }
  return sum / 6;
}
function findBridge(x0, y0, z, w, h) {
  let best = null;
  const tryRun = (sx, sy, dx, dy, axis) => {
    const run = [];
    for (let k = 1; k <= 10; k++) {
      const cx = sx + dx * k, cy = sy + dy * k, c = cell(cx, cy, z);
      if (!inb(cx, cy, z)) return;
      if (c === T.CORE || c === T.LIFT || c === T.DECK || c === T.TUBE) {
        const core = coreAt(cx, cy);
        if (!best || run.length < best.cells.length) best = { cells: run.slice(), target: core ? 'core ' + core.name : TI[c].name };
        return;
      }
      if (c !== 0) return;
      run.push({ x: cx, y: cy, z, axis });
    }
  };
  for (let y = y0; y < y0 + h; y++) { tryRun(x0 + w - 1, y, 1, 0, 0); tryRun(x0, y, -1, 0, 0); }
  for (let x = x0; x < x0 + w; x++) { tryRun(x, y0 + h - 1, 0, 1, 1); tryRun(x, y0, 0, -1, 1); }
  return best;
}
function stackPieces(x, y, z, br) {
  const P = [], rnd = mulberry32(x * 131 + y * 17 + z);
  for (let dz = 0; dz < 3; dz++) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) P.push({ x: x + dx, y: y + dy, z: z + dz, t: T.FRAME, v: 0, ph: 0, lab: 'support frame' });
  if (br) for (const c of br.cells) P.push({ x: c.x, y: c.y, z: c.z, t: T.DECK, v: c.axis, ph: 0, lab: 'sky-bridge deck' });
  for (let dz = 0; dz < 3; dz++) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) P.push({ x: x + dx, y: y + dy, z: z + dz, t: T.CAPSULE, v: (Math.floor(rnd() * 4)) | (Math.floor(rnd() * 2) << 2) | (Math.floor(rnd() * 4) << 3), ph: 1, lab: 'habitation capsule', rep: T.FRAME });
  for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) P.push({ x: x + dx, y: y + dy, z: z + 3, t: dx === dy ? T.TREE : T.TERRACE, v: dx === dy ? (dx ? 3 : 0) : 16, ph: 2, lab: dx === dy ? 'tree' : 'roof garden' });
  return P;
}
function bridgePieces(x, y, z, rot) {
  const d = [[1, 0], [0, 1], [-1, 0], [0, -1]][rot & 3], P = [];
  for (let k = 0; k < 6; k++) P.push({ x: x + d[0] * k, y: y + d[1] * k, z, t: T.DECK, v: rot & 1, ph: 0, lab: 'sky-bridge deck' });
  return P;
}
function gardenPieces(x, y, z) {
  const P = [];
  for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) P.push({ x: x + dx, y: y + dy, z, t: T.TERRACE, v: ((dx + dy) & 3) | ((dx + dy) % 3 === 0 ? 16 : 0), ph: 0, lab: 'terrace slab' });
  for (const [dx, dy, sp] of [[0, 0, 0], [2, 0, 3], [0, 2, 1], [2, 2, 0]]) P.push({ x: x + dx, y: y + dy, z, t: T.TREE, v: sp, ph: 2, lab: 'tree', rep: T.TERRACE });
  P.push({ x: x + 1, y: y + 1, z, t: T.LAMP, v: 1, ph: 2, lab: 'lamp', rep: T.TERRACE });
  return P;
}
function wellPieces(x, y, z) {
  const P = [];
  for (let zz = NL - 1; zz > z; zz--) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
    const c = cell(x + dx, y + dy, zz);
    if (c && c !== T.CORE && c !== T.LIFT && c !== T.CRANE) P.push({ x: x + dx, y: y + dy, z: zz, t: 0, v: 0, ph: 0, lab: 'remove ' + TI[c].name, op: 'remove' });
  }
  for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) P.push({ x: x + dx, y: y + dy, z, t: T.WATER, v: 1, ph: 2, lab: 'reflecting pool', rep: 'any' });
  return P;
}
function unitPieces(unit, x, y, z, rot) {
  const [w, d] = unit.size;
  return unit.pieces.map(p => {
    let dx = p.dx, dy = p.dy;
    for (let r = 0; r < (rot & 3); r++) { const nx = (r & 1 ? w : d) - 1 - dy; dy = dx; dx = nx; }
    const v = (TI[p.t].orient && (rot & 1)) ? p.v ^ 1 : p.v;
    return { x: x + dx, y: y + dy, z: z + p.dz, t: p.t, v, ph: PHASE_OF(p.t), lab: TI[p.t].name };
  });
}
function toolPieces(tool, x, y, z) {
  if (tool === 'stack') { const br = findBridge(x, y, z + 1, 2, 2); return stackPieces(x, y, z, br && br.cells.length <= 6 ? br : null); }
  if (tool === 'bridge') return bridgePieces(x, y, z, S.toolRot);
  if (tool === 'garden') return gardenPieces(x, y, z);
  if (tool === 'well') return wellPieces(x, y, z);
  if (tool === 'unit' && S.unit) return unitPieces(S.unit, x, y, z, S.toolRot);
  return [];
}
function pieceOK(p) {
  if (!inb(p.x, p.y, p.z)) return false;
  const c = cell(p.x, p.y, p.z);
  if (p.op === 'remove') return c !== 0 && c !== T.CORE && c !== T.LIFT;
  if (c === 0) return true;
  if (p.rep === 'any') return c !== T.CORE && c !== T.LIFT;
  return p.rep === c;
}
function sortPieces(P) {
  P.sort((a, b) => a.ph - b.ph || (a.op === 'remove' ? b.z - a.z : a.z - b.z) || a.y - b.y || a.x - b.x);
  const tot = {}, seen = {};
  for (const p of P) tot[p.lab] = (tot[p.lab] || 0) + 1;
  for (const p of P) { seen[p.lab] = (seen[p.lab] || 0) + 1; p.li = seen[p.lab]; p.lt = tot[p.lab]; }
  return P;
}
function jobMetrics(P) {
  let cost = 0, res = 0;
  const add = P.filter(p => p.state !== 'blocked');
  for (const p of add) { cost += p.op === 'remove' ? 40 : (COST[p.t] || 60); if (p.t === T.CAPSULE) res += 1; }
  const zmin = Math.min(...add.map(p => p.z)), foot = new Map();
  for (const p of add) if (p.z === zmin) foot.set(p.x + ',' + p.y, [p.x, p.y]);
  const probe = [];
  for (const [x, y] of foot.values()) for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) if (inb(x + dx, y + dy, zmin - 1)) probe.push([x + dx, y + dy, zmin - 1]);
  const before = probe.length ? probe.reduce((s, c) => s + light[idx(c[0], c[1], c[2])], 0) / probe.length : 0;
  const saved = add.map(p => [p, cells[idx(p.x, p.y, p.z)], vars[idx(p.x, p.y, p.z)]]);
  for (const p of add) if (inb(p.x, p.y, p.z)) cells[idx(p.x, p.y, p.z)] = p.op === 'remove' ? 0 : p.t;
  const after = probe.length ? probe.reduce((s, c) => s + lightAt(c[0], c[1], c[2]), 0) / probe.length : 0;
  const levels = {};
  for (const p of add) levels[p.z] = 1;
  const zs = Object.keys(levels).map(Number);
  const fillAfter = {};
  for (const z of zs) { let n = 0; for (let i = z * W * D, e = i + W * D; i < e; i++) if (cells[i]) n++; fillAfter[z] = n / (W * D); }
  for (const [p, c, v] of saved) if (inb(p.x, p.y, p.z)) { cells[idx(p.x, p.y, p.z)] = c; vars[idx(p.x, p.y, p.z)] = v; }
  const zf = zs.reduce((m, z) => WORLD.fill[z] > WORLD.fill[m] ? z : m, zs[0]);
  return { cost, res, before, after, zf, fb: WORLD.fill[zf], fa: fillAfter[zf], probeZ: zmin - 1 };
}
function makeJob(owner, kind, pieces, site, name) {
  sortPieces(pieces);
  for (const p of pieces) p.state = pieceOK(p) ? 'queued' : 'blocked';
  const j = { id: ++JOBNO, no: JOBNO, owner, kind, name, pieces, site, status: owner === 'you' ? 'building' : 'proposed', approveAt: S.time + 8, lastPh: -1 };
  j.m = jobMetrics(pieces);
  JOBS.push(j);
  return j;
}
function depot() { const c = WORLD.crane; return c ? [c.x - 1.2, c.y + 0.5, c.z + 1.6] : [24, 24, NL]; }
function dispatch(j, p) {
  p.state = 'flying';
  const from = depot(), to = [p.x + 0.5, p.y + 0.5, p.z + 0.55];
  const dist = Math.hypot(to[0] - from[0], to[1] - from[1], (to[2] - from[2]) * 1.5);
  DRONES.push({ j, p, from, to, t: 0, dur: REDUCED ? 0.4 : clamp(0.7 + dist * 0.035, 0.8, 2.0), trail: [], pos: from.slice() });
  if (j.owner === 'claude') AGENT.focus = p;
  if (p.ph !== j.lastPh) { j.lastPh = p.ph; phaseSpeech(j, p.ph); }
}
function bez(a, b, t, lift) { const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.max(a[2], b[2]) + lift]; const u = 1 - t; return [u * u * a[0] + 2 * u * t * m[0] + t * t * b[0], u * u * a[1] + 2 * u * t * m[1] + t * t * b[1], u * u * a[2] + 2 * u * t * m[2] + t * t * b[2]]; }
function land(d) {
  const p = d.p, j = d.j;
  if (!pieceOK(p)) { p.state = 'blocked'; log(j.owner, `Skipped ${p.lab} at (${p.x},${p.y},${lvCode(p.z)}) — occupied`, 'sys'); return; }
  if (p.op === 'remove') setC(p.x, p.y, p.z, 0); else setC(p.x, p.y, p.z, p.t, p.v);
  p.state = 'placed';
  markDirty(p.z);
  if (p.z > 0) markDirty(p.z - 1);
  computeLight(p.x - 5, p.y - 5, p.x + 5, p.y + 5, p.z);
  for (let z = 0; z < p.z - 1; z++) lazyLv.add(z);
  computeFill(); stripDirty = true;
  const verb = p.op === 'remove' ? 'Removing' : 'Placing';
  log(j.owner, `${verb} ${p.lab} ${p.li}/${p.lt} at (${p.x},${p.y},${lvCode(p.z)})`, 'p' + p.ph);
  sfx.tick(p.op === 'remove' ? 3 : p.ph, p.z);
  for (let k = 0; k < 6; k++) PUFFS.push({ x: p.x + 0.5, y: p.y + 0.5, z: p.z + 0.4, vx: (rr() - 0.5) * 1.2, vy: (rr() - 0.5) * 1.2, life: 0, max: 0.5 + rr() * 0.3, col: OWN[j.owner].col });
}
function updateJobs(dt) {
  for (const j of JOBS) {
    if (j.status === 'proposed' && j.owner === 'claude' && S.time >= j.approveAt) approveJob(j, true);
    if (j.status !== 'building') continue;
    let minPh = 9, flying = 0, left = 0;
    for (const p of j.pieces) { if (p.state === 'queued' || p.state === 'flying') { left++; if (p.ph < minPh) minPh = p.ph; } if (p.state === 'flying') flying++; }
    if (!left) { finishJob(j); continue; }
    if (flying < (j.owner === 'you' ? 3 : 2) && S.time >= (j.nextAt || 0)) {
      const p = j.pieces.find(q => q.state === 'queued' && q.ph === minPh);
      if (p) { dispatch(j, p); j.nextAt = S.time + (REDUCED ? 0.12 : 0.34); }
    }
  }
  for (let k = DRONES.length - 1; k >= 0; k--) {
    const d = DRONES[k];
    d.t += dt / d.dur;
    d.pos = bez(d.from, d.to, Math.min(1, easeIO(Math.min(1, d.t))), 3);
    d.trail.push(d.pos); if (d.trail.length > 9) d.trail.shift();
    if (d.t >= 1) { land(d); DRONES.splice(k, 1); }
  }
  for (let k = PUFFS.length - 1; k >= 0; k--) { const f = PUFFS[k]; f.life += dt; f.x += f.vx * dt; f.y += f.vy * dt; f.z += dt * 0.3; if (f.life > f.max) PUFFS.splice(k, 1); }
  JOBS = JOBS.filter(j => j.status !== 'rejected' && !(j.status === 'done' && S.time - j.doneAt > 1));
}
function finishJob(j) {
  j.status = 'done'; j.doneAt = S.time;
  const placed = j.pieces.filter(p => p.state === 'placed').length;
  if (j.kind === 'well' && !WORLD.wells.some(w => w.x === j.site.x && w.y === j.site.y)) {
    WORLD.wells.push({ x: j.site.x, y: j.site.y, s: 2 });
    for (let z = j.site.z; z < NL; z++) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) if (inb(j.site.x + dx, j.site.y + dy, z)) flags[idx(j.site.x + dx, j.site.y + dy, z)] |= F_WELL;
    for (let k = 0; k < 10; k++) MOTES.push({ w: WORLD.wells[WORLD.wells.length - 1], x: j.site.x + rr() * 2, y: j.site.y + rr() * 2, z: rr() * NL, ph: rr() * 6 });
  }
  log(j.owner, `${j.name} complete — ${placed} parts placed`, 'sys');
  sfx.done();
  if (j.owner === 'claude') agentJobDone(j);
  else toast(`${j.name} built · ${placed} parts`);
}
function approveJob(j, auto) {
  if (j.status !== 'proposed') return;
  j.status = 'building'; hideCard();
  log(j.owner, `Proposal ${String(j.no).padStart(2, '0')} ${auto ? 'auto-approved' : 'approved by you'}`, 'sys');
  sfx.approve();
  if (j.owner === 'claude') agentApproved(j);
}
function rejectJob(j) {
  if (j.status !== 'proposed') return;
  j.status = 'rejected'; hideCard();
  log('you', `Rejected proposal ${String(j.no).padStart(2, '0')}`, 'sys');
  sfx.reject();
  if (j.owner === 'claude') agentRejected(j);
}
function placeTool(x, y, z) {
  const P = toolPieces(S.tool, x, y, z);
  if (!P.length) return;
  const ok = P.filter(p => pieceOK(p)).length;
  if (!ok) { toast('Blocked — nothing placeable here on ' + lvCode(z)); sfx.reject(); return; }
  const names = { stack: 'Capsule stack', bridge: 'Sky bridge', garden: 'Garden terrace', well: 'Light well', unit: S.unit ? S.unit.name : 'Unit' };
  const j = makeJob('you', S.tool, P, { x, y, z }, names[S.tool]);
  log('you', `Placed ${j.name} ghost at (${x},${y},${lvCode(z)}) — ${ok} parts queued for drones`, 'sys');
  sfx.ghost();
}

// ---------------------------------------------------------------- drawing
function ghostVar(p) { return TI[p.t] && TI[p.t].orient ? (p.v & ~1) | screenAxis(p.v & 1) : p.v; }
function drawPieceGhostIso(ctx, p, col, alpha, sliced, bad) {
  const above = sliced && p.z > S.level;
  const eo = S.explode > 0.001 ? explodeOff(p.z) : 0;
  if (above || p.op === 'remove' || !p.t) {
    const hh = p.op === 'remove' ? 1 : 0.5;
    isoQuad(ctx, p.x, p.y, p.x + 1, p.y + 1, p.z + hh, bad ? '#e2573f' : (p.op === 'remove' ? '#e2573f' : col), [2, 1], eo);
    if (p.op === 'remove' && !above) { const a = projIso(p.x, p.y, p.z + 1), b = projIso(p.x + 1, p.y + 1, p.z + 1); pline(ctx, a[0], a[1], b[0], b[1], '#e2573f', [2, 1]); }
    return;
  }
  const r = toRot(p.x, p.y), b = isoBase(), spr = getGhost(p.t, ghostVar(p), col, bad);
  ctx.globalAlpha = alpha;
  ctx.drawImage(spr.c, b[0] + (r[0] - r[1]) * 8 + spr.ox, b[1] + (r[0] + r[1]) * 4 - p.z * LH + spr.oy + eo);
  ctx.globalAlpha = 1;
}
function sortedForPaint(P) { return P.slice().sort((a, b) => { const ra = toRot(a.x, a.y), rb = toRot(b.x, b.y); return a.z - b.z || (ra[0] + ra[1]) - (rb[0] + rb[1]); }); }
function drawBuildIso(ctx, t, sliced, ex) {
  for (const j of JOBS) {
    if (j.status !== 'proposed' && j.status !== 'building') continue;
    const col = OWN[j.owner].col;
    let next = null;
    if (j.status === 'building') next = j.pieces.find(p => p.state === 'queued');
    const pend0 = j.pieces.filter(p => p.state === 'queued' || p.state === 'flying' || (j.status === 'proposed' && p.state === 'blocked'));
    const byCell = new Map();   // one ghost per cell: final state while proposed, next step while building
    for (const p of pend0) { const k = p.x + ',' + p.y + ',' + p.z, o = byCell.get(k); if (!o || (j.status === 'proposed' ? p.ph > o.ph : p.ph < o.ph)) byCell.set(k, p); }
    const pend = [...byCell.values()];
    for (const p of sortedForPaint(pend)) {
      const pulse = p === next ? 0.55 + 0.35 * Math.sin(t * 8) : p.state === 'flying' ? 0.75 : (j.status === 'proposed' ? 0.5 : 0.32);
      drawPieceGhostIso(ctx, p, col, pulse, sliced, p.state === 'blocked');
    }
  }
  if (!ex && S.hover && !S.hover.top && ['stack', 'bridge', 'garden', 'well', 'unit'].includes(S.tool)) {
    const P = sortPieces(toolPieces(S.tool, S.hover.x, S.hover.y, S.level));
    for (const p of sortedForPaint(P)) drawPieceGhostIso(ctx, p, '#5fd3f2', 0.5, sliced, !pieceOK(p));
  }
  if (S.capture && !ex) {
    const c = S.capture, x0 = Math.min(c.x0, c.x1), x1 = Math.max(c.x0, c.x1) + 1, y0 = Math.min(c.y0, c.y1), y1 = Math.max(c.y0, c.y1) + 1;
    isoQuad(ctx, x0, y0, x1, y1, S.level + 0.03, '#5fd3f2');
    isoQuad(ctx, x0, y0, x1, y1, S.level + S.captureH, '#5fd3f2', [2, 2]);
    for (const [a, b] of [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]) { const p = projIso(a, b, S.level), q = projIso(a, b, S.level + S.captureH); pline(ctx, p[0], p[1], q[0], q[1], 'rgba(95,211,242,0.7)', [2, 2]); }
  }
  drawDemolish(ctx, ex);
  for (const f of PUFFS) { const [bx, by] = projIso(f.x, f.y, f.z); ctx.fillStyle = rgba(f.col, 0.8 * (1 - f.life / f.max)); ctx.fillRect(Math.round(bx), Math.round(by), 1, 1); }
  drawPinsIso(ctx, t, sliced);
  drawDronesIso(ctx, t, sliced);
  drawAgentIso(ctx, t, sliced, ex);
}
function drawPinsIso(ctx, t, sliced) {
  S.pins.forEach((p, k) => {
    const [bx, by] = projIso(p.x + 0.5, p.y + 0.5, p.z + (p.t && !TI[p.t].slab ? (sliced && p.z === S.level ? HT / LH : 1) : 0.25));
    const X = Math.round(bx), Y = Math.round(by), faint = sliced && p.z > S.level;
    ctx.globalAlpha = faint ? 0.45 : 1;
    R_(ctx, X, Y - 9, 1, 9, '#5fd3f2'); R_(ctx, X - 1, Y - 1, 3, 1, '#5fd3f2');
    plate(ctx, String(k + 1), X - 3, Y - 16, '#5fd3f2', '#04222b');
    ctx.globalAlpha = 1;
  });
}
function drawDronesIso(ctx, t, sliced) {
  for (const d of DRONES) {
    const col = OWN[d.j.owner].col;
    d.trail.forEach((q, k) => { const [bx, by] = projIso(q[0], q[1], q[2]); ctx.fillStyle = rgba(col, (k + 1) / d.trail.length * 0.5); ctx.fillRect(Math.round(bx), Math.round(by), 1, 1); });
    const [bx, by] = projIso(d.pos[0], d.pos[1], d.pos[2]), X = Math.round(bx), Y = Math.round(by);
    const above = sliced && d.pos[2] > S.level + 1;
    ctx.globalAlpha = above ? 0.55 : 1;
    R_(ctx, X - 2, Y - 1, 5, 1, '#1a1b1d'); R_(ctx, X - 1, Y - 2, 3, 2, col); R_(ctx, X - 3, Y - 2, 1, 1, '#d8d0bf'); R_(ctx, X + 3, Y - 2, 1, 1, '#d8d0bf');
    const pc = d.p.op === 'remove' ? '#e2573f' : (SEC_BASE[d.p.t] || '#999999');
    R_(ctx, X - 1, Y + 1, 3, 2, pc); R_(ctx, X, Y, 1, 1, '#2a2826');
    ctx.globalAlpha = 1;
  }
}
function drawBuildPlan(ctx, t) {
  const z = S.level, o = planOrigin();
  const sq = (x, y, col, dashed, fill) => {
    const r = toRot(x, y), X = o[0] + PM + r[0] * PS, Y = o[1] + PM + r[1] * PS;
    if (fill) { ctx.fillStyle = fill; ctx.fillRect(X, Y, PS, PS); }
    for (let k = 0; k < PS; k++) { if (dashed && (k & 2)) continue; R_(ctx, X + k, Y, 1, 1, col); R_(ctx, X + k, Y + PS - 1, 1, 1, col); R_(ctx, X, Y + k, 1, 1, col); R_(ctx, X + PS - 1, Y + k, 1, 1, col); }
  };
  const planCol = { claude: '#d4502a', you: '#1a8fb0' };
  for (const j of JOBS) {
    if (j.status !== 'proposed' && j.status !== 'building') continue;
    for (const p of j.pieces) {
      if (p.state === 'placed' || p.state === 'blocked' || p.z < z - 0 || p.z > z + 1) continue;
      if (p.z === z) sq(p.x, p.y, planCol[j.owner], false, rgba(planCol[j.owner], p.op === 'remove' ? 0.12 : 0.28));
      else sq(p.x, p.y, planCol[j.owner], true);
    }
  }
  if (S.hover && ['stack', 'bridge', 'garden', 'well', 'unit'].includes(S.tool))
    for (const p of toolPieces(S.tool, S.hover.x, S.hover.y, z)) if (p.z === z) sq(p.x, p.y, pieceOK(p) ? '#1a8fb0' : '#b8321c', false, pieceOK(p) ? 'rgba(26,143,176,0.25)' : 'rgba(184,50,28,0.25)');
  if (S.capture) { const c = S.capture; for (let y = Math.min(c.y0, c.y1); y <= Math.max(c.y0, c.y1); y++) for (let x = Math.min(c.x0, c.x1); x <= Math.max(c.x0, c.x1); x++) sq(x, y, '#1a8fb0', true, 'rgba(26,143,176,0.12)'); }
  if (S.hover) sq(S.hover.x, S.hover.y, '#c9861c', false);
  S.pins.forEach((p, k) => { const [bx, by] = projPlan(p.x + 0.5, p.y + 0.5); plate(ctx, String(k + 1), Math.round(bx) - 3, Math.round(by) - 4, p.z === z ? '#1a8fb0' : '#7aa9b8', '#ffffff'); });
  for (const d of DRONES) { const [bx, by] = projPlan(d.pos[0], d.pos[1]); R_(ctx, Math.round(bx) - 1, Math.round(by) - 1, 3, 3, planCol[d.j.owner]); }
  drawAgentPlan(ctx, t);
}
function drawBuildSec(ctx, t) {
  const o = secOrigin();
  const cellBox = (x, y, z, col, fill) => { const [bx, by] = projSec(x, y, z + 1); const X = Math.round(S.secAxis === 'x' ? bx : bx - SCW), Y = Math.round(by); if (fill) R_(ctx, X, Y, SCW, SCH, fill); for (let k = 0; k < SCW; k += 2) { R_(ctx, X + k, Y, 1, 1, col); R_(ctx, X + k, Y + SCH - 1, 1, 1, col); } for (let k = 0; k < SCH; k += 2) { R_(ctx, X, Y + k, 1, 1, col); R_(ctx, X + SCW - 1, Y + k, 1, 1, col); } };
  for (const j of JOBS) {
    if (j.status !== 'proposed' && j.status !== 'building') continue;
    for (const p of j.pieces) {
      if (p.state !== 'queued' && p.state !== 'flying') continue;
      const d = Math.abs(secDepth(p.x + 0.5, p.y + 0.5));
      if (d > 0.5) { if (d < 4) cellBox(p.x, p.y, p.z, rgba(OWN[j.owner].col, 0.35)); continue; }
      cellBox(p.x, p.y, p.z, OWN[j.owner].col, rgba(OWN[j.owner].col, 0.3));
    }
  }
  if (S.hover) cellBox(S.hover.x, S.hover.y, S.hover.z, '#f0b43c');
  for (const d of DRONES) { const [bx, by] = projSec(d.pos[0], d.pos[1], d.pos[2]); R_(ctx, Math.round(bx) - 1, Math.round(by) - 1, 3, 2, OWN[d.j.owner].col); }
  S.pins.forEach((p, k) => { if (Math.abs(secDepth(p.x + 0.5, p.y + 0.5)) > 0.5) return; const [bx, by] = projSec(p.x + 0.5, p.y + 0.5, p.z + 1); plate(ctx, String(k + 1), Math.round(bx) - 3, Math.round(by) - 9, '#5fd3f2', '#04222b'); });
  drawAgentSec(ctx, t);
}
// ==========================================================================
// Wires: cables are free curves, not cells. XPBD ropes in world space
// (x, y in cells, z in levels) that anchor on lattice points, collide with the
// cell grid and drape. Ties gather cables into round bundles (or flat
// ribbons); tied cables move as one heavier body. Posts carry bundles over
// voids. A bundle's loose end is a "head": pulling it pays cable out of the
// loose tail, so a run can be extended support by support.
// Drawn per level in the iso pass with the sprites' palette and baked light.
// ==========================================================================
const WGRAV = 16;
const GAUGES = [
  { key: 'data', name: 'data wire', r: 0.05, seg: 0.22, mass: 0.3, stretch: 0.004, bend: 6, drag: 0.984, fric: 0.6, grab: 1.5, px: 1,
    hues: ['#5fd3c4', '#9b87e8', '#a9cf56'] },
  { key: 'power', name: 'power cable', r: 0.09, seg: 0.25, mass: 0.8, stretch: 0.002, bend: 1.5, drag: 0.984, fric: 0.7, grab: 2.5, px: 2,
    hues: ['#e27a4e', '#e0a33a'] },
  { key: 'hose', name: 'flex hose', r: 0.17, seg: 0.3, mass: 3, stretch: 0.0008, bend: 0.25, drag: 0.978, fric: 0.8, grab: 5, px: 3,
    hues: ['#b89a58', '#7e9a5e'] },
  { key: 'trunk', name: 'trunk pipe', r: 0.3, seg: 0.38, mass: 10, stretch: 0.0002, bend: 0.04, drag: 0.978, fric: 0.9, grab: 10, px: 5,
    hues: ['#7fa0b8'] }
];
const DARK = ['#3c3f45', '#33302d', '#45484f', '#2c2f33'];
const GIRDER_HEX = '#a9b6bf', MOUNT_HEX = '#c9a54a', GLEAM = '#f4f8fa', SLEEVE_HEX = '#4a4540', TIE_HEX = '#eeeae0', ROD_HEX = '#5c646b', POST_HEX = '#8a9298';
const WIRES = { hl: 'amber', only: null, cables: [], ties: [], posts: [], girders: [], mounts: [], gauge: 1, sleeve: false, outline: true, round: true, tieStyle: 'band', palette: 'bright', sockets: true, bundleLook: 'wires', feel: 'weighty', nextId: 1, hue: [0, 0, 0, 0], stage: null };
const FEEL = { springy: { stretch: 6, bend: 3, drag: 1.002, grab: 0.3 }, weighty: { stretch: 1, bend: 1, drag: 1, grab: 1 }, taut: { stretch: 0.2, bend: 0.5, drag: 1, grab: 1 } };
const v3 = {
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  norm: a => { const l = Math.hypot(a[0], a[1], a[2]) || 1e-9; return [a[0] / l, a[1] / l, a[2] / l]; },
  dist: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
};
const xAt = (c, i) => [c.X[i * 3], c.X[i * 3 + 1], c.X[i * 3 + 2]];

// ---------- the world as the wires see it ----------
// vertical extent of a cell's solid part, as a fraction of the level (null = passable)
const OCC_SLAB = [0, 0.25], OCC_CANOPY = [0.8, 1], OCC_FULL = [0, 1];
function occOf(t) {
  if (!t) return null;
  switch (t) {
    case T.WATER: case T.STREET: case T.WALK: case T.DECK: case T.TERRACE: case T.ROOFWALK: return OCC_SLAB;
    case T.CANOPY: return OCC_CANOPY;
    case T.TREE: case T.PILLAR: case T.LAMP: case T.ANTENNA: case T.VENT: case T.FRAME: case T.TRUSS: case T.CRANE: case T.PIPE: case T.VAULT: return null;
    default: return OCC_FULL;
  }
}
function wsolid(x, y, z) {
  if (z < 0) return true;
  const cx = Math.floor(x), cy = Math.floor(y), cz = Math.floor(z);
  if (cx < 0 || cy < 0 || cx >= W || cy >= D || cz >= NL) return false;
  const o = occOf(cells[idx(cx, cy, cz)]); if (!o) return false;
  const f = z - cz; return f >= o[0] && f <= o[1];
}
// push a point out of whatever it is inside; returns {p, n} or null when free
function wpush(x, y, z) {
  if (!wsolid(x, y, z)) return null;
  if (z < 0) return { p: [x, y, 0.002], n: [0, 0, 1] };
  const cx = Math.floor(x), cy = Math.floor(y), cz = Math.floor(z), o = occOf(cells[idx(cx, cy, cz)]), e = 0.003;
  const fx = x - cx, fy = y - cy, cand = [
    { p: [x, y, cz + o[1] + e], n: [0, 0, 1], d: cz + o[1] - z },
    { p: [cx - e, y, z], n: [-1, 0, 0], d: fx }, { p: [cx + 1 + e, y, z], n: [1, 0, 0], d: 1 - fx },
    { p: [x, cy - e, z], n: [0, -1, 0], d: fy }, { p: [x, cy + 1 + e, z], n: [0, 1, 0], d: 1 - fy }
  ];
  if (o[0] > 0) cand.push({ p: [x, y, cz + o[0] - e], n: [0, 0, -1], d: z - (cz + o[0]) });
  cand.sort((a, b) => a.d - b.d);
  for (const c of cand) if (!wsolid(c.p[0], c.p[1], c.p[2])) return c;
  return cand[0];
}

// ---------- cables ----------
// a cable along a polyline of world points; the cable is `slack` times the path length
function makeCablePath(gi, pts, o) {
  o = o || {};
  const g = GAUGES[gi], acc = [0];
  for (let k = 1; k < pts.length; k++) acc.push(acc[k - 1] + v3.dist(pts[k], pts[k - 1]));
  const L = acc[acc.length - 1] * (o.slack || 1), n = Math.max(4, Math.ceil(L / g.seg) + 1);
  const c = { id: WIRES.nextId++, gi, g, n, X: new Float32Array(n * 3), P: new Float32Array(n * 3), W: new Float32Array(n).fill(1 / g.mass), rest: L / (n - 1),
    pinA: o.freeA ? null : pts[0].slice(), pinB: o.free ? null : pts[pts.length - 1].slice(),
    hue: o.hue != null ? o.hue : WIRES.hue[gi]++ % g.hues.length, hex: o.hex || null, still: 0, asleep: false };
  let k = 0;
  for (let i = 0; i < n; i++) {
    const s = acc[acc.length - 1] * i / (n - 1);
    while (k < pts.length - 2 && acc[k + 1] < s) k++;
    const u = clamp((s - acc[k]) / ((acc[k + 1] - acc[k]) || 1e-6), 0, 1);
    for (let a = 0; a < 3; a++) c.X[i * 3 + a] = lerp(pts[k][a], pts[k + 1][a], u);
  }
  c.P.set(c.X);
  if (c.pinA) c.W[0] = 0; if (c.pinB) c.W[n - 1] = 0;
  WIRES.cables.push(c);
  return c;
}
function makeCable(gi, a, b, o) {
  o = o || {};
  const dist = v3.dist(a, b), L = o.length || Math.max(0.6, dist * (o.slack || 1.12) + 0.2);
  const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.min(a[2], b[2]) - Math.sqrt(Math.max(0, L * L - dist * dist)) * 0.45];
  return makeCablePath(gi, [a, mid, b], Object.assign({}, o, { slack: L / (v3.dist(a, mid) + v3.dist(mid, b)) }));
}
const cableLen = c => c.rest * (c.n - 1);
// palettes: 'bright' colour-codes by gauge; 'muted' is infrastructure greys and black jackets
const MUTED = [['#aab4ae', '#8f9aa6', '#b8aa8c'], ['#5e5853', '#726a62'], ['#8e8d7a', '#7d847c'], ['#a2a9ae']];
const cableHex = c => c.hex || (WIRES.palette === 'muted' ? MUTED[c.gi][c.hue % MUTED[c.gi].length] : c.g.hues[c.hue % c.g.hues.length]);
function resample(c, m) {
  const n = c.n, acc = [0];
  for (let i = 1; i < n; i++) acc.push(acc[i - 1] + Math.hypot(c.X[i * 3] - c.X[i * 3 - 3], c.X[i * 3 + 1] - c.X[i * 3 - 2], c.X[i * 3 + 2] - c.X[i * 3 - 1]));
  const tot = acc[n - 1] || 1e-6, X = new Float32Array(m * 3), P = new Float32Array(m * 3);
  let j = 0;
  for (let i = 0; i < m; i++) {
    const s = tot * i / (m - 1);
    while (j < n - 2 && acc[j + 1] < s) j++;
    const u = clamp((s - acc[j]) / ((acc[j + 1] - acc[j]) || 1e-6), 0, 1);
    for (let k = 0; k < 3; k++) { X[i * 3 + k] = lerp(c.X[j * 3 + k], c.X[j * 3 + 3 + k], u); P[i * 3 + k] = lerp(c.P[j * 3 + k], c.P[j * 3 + 3 + k], u); }
  }
  const len = cableLen(c);
  for (const t of WIRES.ties) for (const mm of t.m) if (mm.c === c) mm.i = clamp(Math.round(mm.i * (m - 1) / (n - 1)), 0, m - 1);
  c.n = m; c.X = X; c.P = P; c.W = new Float32Array(m).fill(1 / c.g.mass); c.rest = len / (m - 1);
  if (c.pinA) c.W[0] = 0; if (c.pinB) c.W[m - 1] = 0;
}
function setCableLen(c, L) {
  const want = Math.max(4, Math.ceil(L / c.g.seg) + 1);
  if (want > c.n * 1.25 || want < c.n * 0.75) resample(c, want);
  c.rest = L / (c.n - 1);
}
function wake(c) { c.asleep = false; c.still = 0; c.awakeT = 0; }
function removeCable(c) {
  WIRES.cables = WIRES.cables.filter(x => x !== c);
  for (const t of WIRES.ties) t.m = t.m.filter(m => m.c !== c);
  WIRES.ties = WIRES.ties.filter(t => t.m.length);
  WIRES.ties.forEach(t => { if (t.fixed && t.fixed.length !== t.m.length) t.fixed = null; layoutTie(t); });
}
function nearestIdx(c, p) {
  let bi = 0, bd = 1e9;
  for (let i = 0; i < c.n; i++) { const d = (c.X[i * 3] - p[0]) ** 2 + (c.X[i * 3 + 1] - p[1]) ** 2 + (c.X[i * 3 + 2] - p[2]) ** 2; if (d < bd) { bd = d; bi = i; } }
  return bi;
}

// ---------- ties ----------
// A tie holds each member at a slot in the bundle's cross-section. Round ties pack
// members in hex rings around the core (biggest in the middle); flat ties lay them
// side by side, like a ribbon.
const pitchOf = c => Math.max(2 * c.g.r * 1.15, (c.g.px + 1) / 8.5);
function layoutTie(t) {
  const ms = t.m;
  if (t.fixed && t.fixed.length === ms.length) {     // a route-built tie keeps the slots the run was laid with
    ms.forEach((m, j) => { m.off = t.fixed[j].slice(); });
    t.R = Math.max(...ms.map(m => Math.hypot(m.off[0], m.off[1]) + m.c.g.r)); t.w = 2 * t.R;
    ms.forEach(m => wake(m.c)); return;
  }
  if (t.round && ms.length > 2) {
    // keep the wires where they already are around the bundle: inner ones stay inner,
    // and each ring keeps its members' angular order, so runs stay parallel tie to tie
    const p = Math.max(0.11, 2.0 * ms.reduce((s, m) => s + m.c.g.r, 0) / ms.length), ctr = [0, 0, 0];
    ms.forEach(m => { for (let k = 0; k < 3; k++) ctr[k] += m.c.X[m.i * 3 + k] / ms.length; });
    const a = t.axis || [1, 0, 0], b = t.up || [0, 0, 1];
    const loc = ms.map(m => { const d = v3.sub(xAt(m.c, m.i), ctr), u = v3.dot(d, a), v = v3.dot(d, b); return { m, r: Math.hypot(u, v), ang: Math.atan2(v, u) }; });
    loc.sort((x, y) => x.r - y.r);
    const big = loc.reduce((m, q) => q.m.c.g.r > m.m.c.g.r ? q : m, loc[0]);   // the heaviest cable is the core
    loc.splice(loc.indexOf(big), 1); loc.unshift(big);
    let rmax = 0, idx0 = 0, ring = 0;
    while (idx0 < loc.length) {
      const cap = ring === 0 ? 1 : 6 * ring, grp = loc.slice(idx0, idx0 + cap);
      grp.sort((x, y) => x.ang - y.ang);
      const ph = grp[0].ang, n = grp.length;
      grp.forEach((g, j) => { const th = ph + j * Math.PI * 2 / n; g.m.off = ring === 0 ? [0, 0] : [Math.cos(th) * ring * p, Math.sin(th) * ring * p]; rmax = Math.max(rmax, ring * p + g.m.c.g.r); });
      idx0 += cap; ring++;
    }
    t.R = rmax; t.w = 2 * rmax;
  } else if (t.round) {   // two (or one) in a round tie: drawn together until they touch
    const gap = 0.005, w = ms.reduce((s, m) => s + 2 * m.c.g.r + gap, 0);
    let o = -w / 2; for (const m of ms) { const p = 2 * m.c.g.r + gap; m.off = [o + p / 2, 0]; o += p; }
    t.w = w; t.R = Math.max(...ms.map(m => Math.abs(m.off[0]) + m.c.g.r));
  } else {
    t.w = ms.reduce((s, m) => s + pitchOf(m.c), 0);
    let o = -t.w / 2; for (const m of ms) { const p = pitchOf(m.c); m.off = [o + p / 2, 0]; o += p; }
    t.R = Math.max(...ms.map(m => m.c.g.r));
  }
  ms.forEach(m => wake(m.c));
}
// the bundle's frame at a tie: a = across (kept horizontal so ribbons read from above), b = up-ish
function bundleFrame(t, prev) {
  const d = [0, 0, 0];
  for (const m of t.m) { const i = clamp(m.i, 1, m.c.n - 2); for (let k = 0; k < 3; k++) d[k] += m.c.X[(i + 1) * 3 + k] - m.c.X[(i - 1) * 3 + k]; }
  let a = [-d[1], d[0], 0];
  if (Math.hypot(a[0], a[1]) < 0.25 * Math.hypot(d[0], d[1], d[2])) {
    if (prev) a = prev.slice();
    else {   // a steep run has no 'across' of its own: lay the slots the way the cables are already spread
      const T = v3.norm(d), cc = [0, 0, 0]; for (const m of t.m) for (let k = 0; k < 3; k++) cc[k] += m.c.X[m.i * 3 + k] / t.m.length;
      let bl = 0; a = [1, 0, 0];
      for (const m of t.m) { const q = v3.sub(xAt(m.c, m.i), cc), dt = v3.dot(q, T), pq = [q[0] - T[0] * dt, q[1] - T[1] * dt, q[2] - T[2] * dt], l = Math.hypot(...pq); if (l > bl) { bl = l; a = pq; } }
    }
  }
  a = v3.norm(a);
  if (prev && v3.dot(a, prev) < 0) a = [-a[0], -a[1], -a[2]];
  if (prev) a = v3.norm([prev[0] * 0.7 + a[0] * 0.3, prev[1] * 0.7 + a[1] * 0.3, prev[2] * 0.7 + a[2] * 0.3]);
  t.T = v3.norm(d);
  // keep 'up' on the side it was on: on a vertical run up is sideways, and z can't decide it
  let b = v3.norm(v3.cross(v3.norm(d), a)); if (prev && t.up ? v3.dot(b, t.up) < 0 : b[2] < 0) b = [-b[0], -b[1], -b[2]];
  if (!isFinite(b[0])) b = [0, 0, 1];
  t.up = b;
  return a;
}
// a tie grips each cable at its nearest point, not a fixed one: cables slip through it to equilibrium
function slideTie(t) {
  const ctr = tieCenter(t);
  for (const m of t.m) {
    const c = m.c; let lo = 1, hi = c.n - 2;
    for (const o of WIRES.ties) if (o !== t) for (const n of o.m) if (n.c === c) { if (n.i < m.i) lo = Math.max(lo, n.i + 2); else if (n.i > m.i) hi = Math.min(hi, n.i - 2); }
    const dist = i => Math.sqrt((c.X[i * 3] - ctr[0]) ** 2 + (c.X[i * 3 + 1] - ctr[1]) ** 2 + (c.X[i * 3 + 2] - ctr[2]) ** 2);
    let best = m.i, bd = 1e9;
    for (let i = Math.max(lo, m.i - 2); i <= Math.min(hi, m.i + 2); i++) { const d = dist(i); if (d < bd) { bd = d; best = i; } }
    // hysteresis: move only when another particle is clearly nearer, or the tie flips between neighbours
    if (best !== m.i && bd < dist(m.i) - 0.35 * c.rest) m.i = best;
  }
}
function tieCenter(t) {
  if (t.hang) return t.hang;
  let s = 0; const c = [0, 0, 0];
  for (const m of t.m) { const w = m.c.W[m.i], ms = w > 0 ? 1 / w : 1e3; s += ms; for (let k = 0; k < 3; k++) c[k] += m.c.X[m.i * 3 + k] * ms; }
  return [c[0] / s, c[1] / s, c[2] / s];
}
const tieMass = t => t.m.reduce((s, m) => s + m.c.g.mass, 0);
function slotOf(t, m, ctr) { return [ctr[0] + t.axis[0] * m.off[0] + t.up[0] * m.off[1], ctr[1] + t.axis[1] * m.off[0] + t.up[1] * m.off[1], ctr[2] + t.axis[2] * m.off[0] + t.up[2] * m.off[1]]; }
function makeTie(members, o) {
  o = o || {};
  const ctr = [0, 0, 0]; members.forEach(m => { for (let k = 0; k < 3; k++) ctr[k] += m.c.X[m.i * 3 + k] / members.length; });
  // given slots are kept, but centred on the tie itself
  let fixed = null;
  if (o.offs) { const n = o.offs.length, m0 = o.offs.reduce((q, f) => q + f[0], 0) / n, m1 = o.offs.reduce((q, f) => q + f[1], 0) / n; fixed = o.offs.map(f => [f[0] - m0, f[1] - m1]); }
  const t = { id: WIRES.nextId++, m: members, axis: null, up: [0, 0, 1], hang: null, top: null, w: 0, R: 0, ramp: o.instant ? 1 : 0, fixed, round: o.round != null ? o.round : WIRES.round };
  t.axis = bundleFrame(t, null);
  if ((!t.round || members.length <= 2) && !t.fixed) members.sort((p, q) => v3.dot(v3.sub(xAt(p.c, p.i), ctr), t.axis) - v3.dot(v3.sub(xAt(q.c, q.i), ctr), t.axis));
  layoutTie(t); WIRES.ties.push(t);
  members.forEach(m => { m.c.calm = 0.8; });
  return t;
}
function removeTie(t) { WIRES.ties = WIRES.ties.filter(x => x !== t); t.m.forEach(m => wake(m.c)); }
function hangTie(t) {
  const c = tieCenter(t); let top = null;
  for (let z = c[2] + 0.2; z < NL; z += 0.05) if (wsolid(c[0], c[1], z)) { top = [c[0], c[1], z]; break; }
  if (!top) {
    let best = 1e9;
    for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let s = 0.1; s < 5; s += 0.05) if (wsolid(c[0] + d[0] * s, c[1] + d[1] * s, c[2])) { if (s < best) { best = s; top = [c[0] + d[0] * s, c[1] + d[1] * s, c[2]]; } break; }
  }
  t.hang = c; t.top = top; t.m.forEach(m => wake(m.c));
}
function clampTie(t, p) { t.hang = [p[0], p[1], p[2] + t.R]; t.top = null; t.m.forEach(m => wake(m.c)); }
// a cap gathers loose ends; a head is a tie with nothing beyond it but loose tail
const isCap = t => t.m.every(m => m.i === m.c.n - 1 && !m.c.pinB);
function isHead(t) {
  return !isCap(t) && t.m.every(m => !m.c.pinB && !WIRES.ties.some(o => o !== t && !isCap(o) && o.m.some(n => n.c === m.c && n.i > m.i)));
}
// the index a head member pays out from: the nearest tie or pin behind it
function behind(t, m) {
  let i0 = 0;
  for (const o of WIRES.ties) if (o !== t) for (const n of o.m) if (n.c === m.c && n.i < m.i && n.i > i0) i0 = n.i;
  return i0;
}

// runs between consecutive ties on the same cables: the bundle keeps its cross-section
function bundleRuns() {
  const map = new Map();
  for (const c of WIRES.cables) {
    const ts = [];
    for (const t of WIRES.ties) for (const m of t.m) if (m.c === c) ts.push({ t, m });
    ts.sort((a, b) => a.m.i - b.m.i);
    for (let k = 0; k + 1 < ts.length; k++) {
      const A = ts[k], B = ts[k + 1], key = A.t.id + ':' + B.t.id;
      let r = map.get(key); if (!r) { r = { t1: A.t, t2: B.t, pairs: [] }; map.set(key, r); }
      r.pairs.push({ c, a: A.m, b: B.m });
    }
  }
  return [...map.values()].filter(r => r.pairs.length >= 2);
}
// Between two ties each wire is linked to its nearest neighbours in the cross-section by
// tension-only distance constraints: the bundle stays together without fighting itself.
function runLinks(r) {
  const P = r.pairs, links = [];
  for (let j = 0; j < P.length; j++) {
    const oj = P[j].a.off, near = [];
    for (let k = 0; k < P.length; k++) if (k !== j) { const ok = P[k].a.off, ob = P[j].b.off, okb = P[k].b.off; near.push({ k, d: Math.max(Math.hypot(oj[0] - ok[0], oj[1] - ok[1]), Math.hypot(ob[0] - okb[0], ob[1] - okb[1])) }); }
    near.sort((x, y) => x.d - y.d);
    for (const n of near.slice(0, 3)) if (!links.some(l => l[0] === n.k && l[1] === j)) links.push([j, n.k, n.d + 0.04]);
  }
  return links;
}
const LINKS = new Map();   // neighbour links per run, kept across steps (slots don't change)
function cohere(runs, stiff) {
  for (const r of runs) {
    if (r.pairs[0].c.asleep) continue;
    if (!r.links) { const key = r.t1.id + ':' + r.t2.id + ':' + r.pairs.length; r.links = LINKS.get(key); if (!r.links) LINKS.set(key, r.links = runLinks(r)); }
    for (const [j, k, L] of r.links) {
      const A = r.pairs[j], B = r.pairs[k], sa = A.b.i - A.a.i, sb = B.b.i - B.a.i;
      if (sa < 2 || sb < 2 || sa > 400) continue;
      const XA = A.c.X, XB = B.c.X, WA = A.c.W, WB = B.c.W;
      for (let i = A.a.i + 1; i < A.b.i; i++) {
        const ib = Math.round(B.a.i + (i - A.a.i) / sa * sb), wa = WA[i], wb = WB[ib], ws = wa + wb; if (!ws) continue;
        const dx = XB[ib * 3] - XA[i * 3], dy = XB[ib * 3 + 1] - XA[i * 3 + 1], dz = XB[ib * 3 + 2] - XA[i * 3 + 2], d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d <= L) continue;
        const f = (d - L) / d / ws * stiff * Math.min(1, r.t1.ramp, r.t2.ramp);
        XA[i * 3] += dx * f * wa; XA[i * 3 + 1] += dy * f * wa; XA[i * 3 + 2] += dz * f * wa;
        XB[ib * 3] -= dx * f * wb; XB[ib * 3 + 1] -= dy * f * wb; XB[ib * 3 + 2] -= dz * f * wb;
      }
    }
  }
}

// glue: inside a run, each wire is pulled to its slot around the run's centreline
function glue(runs, k) {
  for (const r of runs) {
    const P = r.pairs, np = P.length; if (P[0].c.asleep) continue;
    // the centreline (and mean slot) is sampled once per run and interpolated
    const N = Math.max(2, Math.min(400, ...P.map(pr => pr.b.i - pr.a.i))), SC = new Float64Array((N + 1) * 5);
    for (let q = 0; q <= N; q++) {
      const u = q / N; let cx = 0, cy = 0, cz = 0, m0 = 0, m1 = 0;
      for (const pr of P) {
        const fi = pr.a.i + (pr.b.i - pr.a.i) * u, i0 = Math.floor(fi), i1 = Math.min(pr.c.n - 1, i0 + 1), f = fi - i0, X = pr.c.X;
        cx += X[i0 * 3] + (X[i1 * 3] - X[i0 * 3]) * f; cy += X[i0 * 3 + 1] + (X[i1 * 3 + 1] - X[i0 * 3 + 1]) * f; cz += X[i0 * 3 + 2] + (X[i1 * 3 + 2] - X[i0 * 3 + 2]) * f;
        m0 += lerp(pr.a.off[0], pr.b.off[0], u); m1 += lerp(pr.a.off[1], pr.b.off[1], u);
      }
      SC.set([cx / np, cy / np, cz / np, m0 / np, m1 / np], q * 5);
    }
    // frames carried along the centreline, so a bend or a vertical drop never flips them
    const FR = []; let pa = r.t1.axis, pu = r.t1.up;
    for (let q = 0; q <= N; q++) {
      const a = Math.max(0, q - 1) * 5, b = Math.min(N, q + 1) * 5, T = v3.norm([SC[b] - SC[a], SC[b + 1] - SC[a + 1], SC[b + 2] - SC[a + 2]]), f = carryFrame(T, pa, pu);
      FR.push(f); pa = f.A; pu = f.U;
    }
    for (const pr of P) {
      const span = pr.b.i - pr.a.i; if (span < 2 || span > 400) continue;
      const X = pr.c.X, Wt = pr.c.W, ao = pr.a.off, bo = pr.b.off;
      for (let i = pr.a.i + 1; i < pr.b.i; i++) {
        if (Wt[i] === 0) continue;
        const u = (i - pr.a.i) / span, fq = u * N, q = Math.min(N - 1, Math.floor(fq)), w = fq - q, A = q * 5, B = A + 5, F = FR[Math.min(N, Math.round(fq))];
        const cx = SC[A] + (SC[B] - SC[A]) * w, cy = SC[A + 1] + (SC[B + 1] - SC[A + 1]) * w, cz = SC[A + 2] + (SC[B + 2] - SC[A + 2]) * w;
        const o0 = lerp(ao[0], bo[0], u) - (SC[A + 3] + (SC[B + 3] - SC[A + 3]) * w), o1 = lerp(ao[1], bo[1], u) - (SC[A + 4] + (SC[B + 4] - SC[A + 4]) * w);
        const ku = k * Math.min(1, 6 * u * (1 - u));             // fades out at the ties: there the ties hold the slots
        X[i * 3] += (cx + F.A[0] * o0 + F.U[0] * o1 - X[i * 3]) * ku;
        X[i * 3 + 1] += (cy + F.A[1] * o0 + F.U[1] * o1 - X[i * 3 + 1]) * ku;
        X[i * 3 + 2] += (cz + F.A[2] * o0 + F.U[2] * o1 - X[i * 3 + 2]) * ku;
      }
    }
  }
}

// ---------- posts: supports for carrying bundles over voids ----------
// the working height: half a level under the cut, so what you place stays in view
const workHeight = () => (S.mode === 'cut' && S.level < NL - 1 ? S.level + HT / LH : NL) - 0.5;
function addGirder(a, b) { const g = { a: a.slice(), b: b.slice() }; WIRES.girders.push(g); return g; }
function addMount(p) { const m = { p: p.slice() }; WIRES.mounts.push(m); return m; }
function addPost(x, y, z0, z1) { const p = { x, y, z0, z1 }; WIRES.posts.push(p); WIRES.cables.forEach(wake); return p; }
const postTop = p => [p.x, p.y, p.z1];

// ---------- simulation ----------
const WGRAB = { on: false, c: null, i: -1, tie: null, target: null, goal: null, end: false, ref: null, hung: false };
const LAY = { on: false, c: null, a: null, cur: null, target: null };
let runs0 = [];
function stepWires(dt) {
  const SUB = 4, h = dt / SUB, IT = 10, fe = FEEL[WIRES.feel], CS = WIRES.cables, TS = WIRES.ties;
  for (const t of TS) if (t.m.some(m => !m.c.asleep)) t.m.forEach(m => { if (m.c.asleep) wake(m.c); });
  for (const t of TS) if (!t.m[0].c.asleep) t.axis = bundleFrame(t, t.axis);
  for (const t of TS) if (t.ramp < 1) t.ramp = Math.min(1, t.ramp + dt * 2);
  if (!window.__noslide) for (const t of TS) { if (t.m[0].c.asleep) continue; slideTie(t); }
  for (const c of CS) if (c.calm > 0) c.calm -= dt;
  // a clamped tie holds its bundle on its post or mount: the support doesn't push back there
  for (const c of CS) { if (!c.nearTie || c.nearTie.length !== c.n) c.nearTie = new Uint8Array(c.n); else c.nearTie.fill(0); }
  for (const t of TS) if (t.hang) for (const m of t.m) for (let i = Math.max(0, m.i - 3); i <= Math.min(m.c.n - 1, m.i + 3); i++) m.c.nearTie[i] = 1;
  for (const c of CS) {
    const held = (LAY.on && LAY.c === c) || (WGRAB.on && (WGRAB.c === c || (WGRAB.tie && WGRAB.tie.m.some(m => m.c === c))));
    c.soft = held ? 1 : Math.max(0, (c.soft || 0) - dt * 1.2);
  }
  for (let s = 0; s < SUB; s++) {
    for (const c of CS) {
      if (c.asleep) continue;
      const X = c.X, P = c.P, Wt = c.W, drag = Math.min(0.9995, c.g.drag * fe.drag) * (c.calm > 0 ? 0.94 : 1), VMAX = c.soft > 0 ? 0.12 : 0.035;   // the cable in hand follows the hand
      for (let i = 0; i < c.n; i++) {
        if (Wt[i] === 0) continue;
        const j = i * 3;
        let vx = (X[j] - P[j]) * drag, vy = (X[j + 1] - P[j + 1]) * drag, vz = (X[j + 2] - P[j + 2]) * drag;
        const sp = Math.sqrt(vx * vx + vy * vy + vz * vz); if (sp > VMAX) { const f = VMAX / sp; vx *= f; vy *= f; vz *= f; }   // nothing gets flung
        P[j] = X[j]; P[j + 1] = X[j + 1]; P[j + 2] = X[j + 2]; X[j] += vx; X[j + 1] += vy; X[j + 2] += vz;
        X[j + 2] -= WGRAV * h * h;
      }
      if (c.pinA) { X[0] = c.pinA[0]; X[1] = c.pinA[1]; X[2] = c.pinA[2]; }
      if (c.pinB) { const j = (c.n - 1) * 3; X[j] = c.pinB[0]; X[j + 1] = c.pinB[1]; X[j + 2] = c.pinB[2]; }
      if (!c.lamS || c.lamS.length !== c.n) { c.lamS = new Float32Array(c.n); c.lamB = new Float32Array(c.n); } else { c.lamS.fill(0); c.lamB.fill(0); }
    }
    // dragging is a soft spring whose give grows with the mass being dragged
    if (WGRAB.on && WGRAB.target) {
      if (WGRAB.tie && !WGRAB.hung && WGRAB.mode !== 'slide') {
        const t = WGRAB.tie, f = 1 / (1 + tieMass(t) * 0.2 * fe.grab), d = v3.sub(WGRAB.target, tieCenter(t));
        for (const m of t.m) if (m.c.W[m.i] > 0) for (let k = 0; k < 3; k++) m.c.X[m.i * 3 + k] += d[k] * f;
      } else if (WGRAB.c && WGRAB.c.W[WGRAB.i] > 0) {
        const c = WGRAB.c, f = 1 / (1 + c.g.grab * fe.grab * 0.35);
        for (let k = 0; k < 3; k++) c.X[WGRAB.i * 3 + k] += (WGRAB.target[k] - c.X[WGRAB.i * 3 + k]) * f;
      }
    }
    const runs = s === 0 ? bundleRuns() : runs0; runs0 = runs;
    for (let it = 0; it < IT; it++) {
      if (!window.__nocohere && !(it & 1)) cohere(runs, 0.7);     // every other pass, a little stiffer
      for (const c of CS) {
        if (c.asleep) continue;
        const X = c.X, Wt = c.W, LS = c.lamS, LB = c.lamB, r = c.rest, bs = c.g.stretch * fe.stretch, bb = c.g.bend * fe.bend;   // a cable in hand is the same cable as one attached
        // alternate the sweep direction so a pull travels both ways along the cable in a few passes
        const fwd = !(it & 1);
        for (let q = 0; q < c.n - 1; q++) {
          const i = fwd ? q : c.n - 2 - q;
          const a = i * 3, b = a + 3, wa = Wt[i], wb = Wt[i + 1], ws = wa + wb; if (!ws) continue;
          const dx = X[b] - X[a], dy = X[b + 1] - X[a + 1], dz = X[b + 2] - X[a + 2], len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-9;
          const at = bs * ws, dl = (r - len - at * LS[i]) / (ws + at); LS[i] += dl;
          const nx = dx / len * dl, ny = dy / len * dl, nz = dz / len * dl;
          X[a] -= nx * wa; X[a + 1] -= ny * wa; X[a + 2] -= nz * wa; X[b] += nx * wb; X[b + 1] += ny * wb; X[b + 2] += nz * wb;
        }
        for (let i = 0; i < c.n - 2; i++) {
          const a = i * 3, b = a + 6, wa = Wt[i], wb = Wt[i + 2], ws = wa + wb; if (!ws) continue;
          const dx = X[b] - X[a], dy = X[b + 1] - X[a + 1], dz = X[b + 2] - X[a + 2], len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-9;
          if (len >= 2 * r) continue;
          const at = bb * ws, dl = (2 * r - len - at * LB[i]) / (ws + at); LB[i] += dl;
          const nx = dx / len * dl, ny = dy / len * dl, nz = dz / len * dl;
          X[a] -= nx * wa; X[a + 1] -= ny * wa; X[a + 2] -= nz * wa; X[b] += nx * wb; X[b + 1] += ny * wb; X[b + 2] += nz * wb;
        }
      }
      if (!window.__notie) for (const t of TS) {
        if (t.m[0].c.asleep) continue;
        // slots are centred on the members' (weighted) mean so a tie never pushes its own bundle
        let ctr = tieCenter(t), om = [0, 0];
        if (!t.hang) { let sw = 0; for (const m of t.m) { const w = m.c.W[m.i], ms = w > 0 ? 1 / w : 1e3; sw += ms; om[0] += m.off[0] * ms; om[1] += m.off[1] * ms; } om = [om[0] / sw, om[1] / sw]; }
        ctr = [ctr[0] - t.axis[0] * om[0] - t.up[0] * om[1], ctr[1] - t.axis[1] * om[0] - t.up[1] * om[1], ctr[2] - t.axis[2] * om[0] - t.up[2] * om[1]];
        for (const m of t.m) { const c = m.c; if (c.W[m.i] === 0) continue; const q = slotOf(t, m, ctr), st = 0.7 * Math.min(1, t.ramp);
          { const f = wpush(q[0], q[1], q[2] - c.g.r); if (f) { q[0] = f.p[0]; q[1] = f.p[1]; q[2] = f.p[2] + c.g.r; } }   // a slot inside a floor sits on it instead
          // squeeze across the bundle only: along it, cables stay free to slip through the tie
          const T = t.T || [0, 0, 0], dx = (q[0] - c.X[m.i * 3]) * st, dy = (q[1] - c.X[m.i * 3 + 1]) * st, dz = (q[2] - c.X[m.i * 3 + 2]) * st, al = t.hang ? 0 : dx * T[0] + dy * T[1] + dz * T[2];
          c.X[m.i * 3] += dx - al * T[0]; c.X[m.i * 3 + 1] += dy - al * T[1]; c.X[m.i * 3 + 2] += dz - al * T[2]; }
      }
    }
    if (!window.__noglue && !(s & 1)) glue(runs, 2 * (window.__gk || 0.03) * Math.min(1, ...runs.map(r => Math.min(r.t1.ramp, r.t2.ramp)), 1));
    for (const g of WIRES.girders) if (!g.lo) { g.lo = [0, 1, 2].map(k => Math.min(g.a[k], g.b[k])); g.hi = [0, 1, 2].map(k => Math.max(g.a[k], g.b[k])); }
    for (const c of CS) {                                     // collide, with friction so cables drape and stay put
      if (c.asleep) continue;
      const X = c.X, P = c.P, r = c.g.r, fr = c.g.fric;
      // only the posts and girders near this cable
      const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
      for (let i = 0; i < c.n * 3; i += 3) for (let k = 0; k < 3; k++) { const v = X[i + k]; if (v < lo[k]) lo[k] = v; if (v > hi[k]) hi[k] = v; }
      const m = r + 0.3, posts = WIRES.posts.filter(p => p.x > lo[0] - m && p.x < hi[0] + m && p.y > lo[1] - m && p.y < hi[1] + m && p.z1 + m > lo[2] && p.z0 - m < hi[2]);
      const near = posts.length > 3 ? new Map() : null;                // posts bucketed by cell when there are many
      if (near) for (const p of posts) for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const k = (Math.floor(p.x) + dx) * 4096 + Math.floor(p.y) + dy; let a = near.get(k); if (!a) near.set(k, a = []); a.push(p); }
      const girders = WIRES.girders.filter(g => g.hi[0] > lo[0] - m && g.lo[0] < hi[0] + m && g.hi[1] > lo[1] - m && g.lo[1] < hi[1] + m && g.hi[2] > lo[2] - m && g.lo[2] < hi[2] + m);
      for (let i = 0; i < c.n; i++) {
        if (c.W[i] === 0) continue;
        const j = i * 3;
        let n = null;
        const q = wpush(X[j], X[j + 1], X[j + 2] - r);
        if (q) { X[j] = q.p[0]; X[j + 1] = q.p[1]; X[j + 2] = q.p[2] + r; n = q.n; }
        if (!c.nearTie[i]) for (const p of (near ? near.get(Math.floor(X[j]) * 4096 + Math.floor(X[j + 1])) || [] : posts)) {   // posts: a slim column with a cradle on top
          const dx = X[j] - p.x, dy = X[j + 1] - p.y, rr = Math.sqrt(dx * dx + dy * dy), lim = 0.1 + r;
          if (rr > lim + 0.15 || X[j + 2] < p.z0 || X[j + 2] > p.z1 + r) continue;
          if (X[j + 2] > p.z1 - 0.05 && rr < lim + 0.15) { X[j + 2] = p.z1 + r; n = [0, 0, 1]; }
          else if (rr < lim) { const k = lim / (rr || 1e-6); X[j] = p.x + dx * k; X[j + 1] = p.y + dy * k; n = [dx / (rr || 1), dy / (rr || 1), 0]; }
        }
        if (!c.nearTie[i]) for (const g of girders) {         // girders: thin beams along grid lines
          const a = g.a, ab = g.ab || (g.ab = v3.sub(g.b, g.a)), L2 = v3.dot(ab, ab) || 1, lim = 0.08 + r;
          const u = clamp(((X[j] - a[0]) * ab[0] + (X[j + 1] - a[1]) * ab[1] + (X[j + 2] - a[2]) * ab[2]) / L2, 0, 1);
          const qx = a[0] + ab[0] * u, qy = a[1] + ab[1] * u, qz = a[2] + ab[2] * u, d0 = X[j] - qx, d1 = X[j + 1] - qy, d2 = X[j + 2] - qz;
          if (Math.abs(d0) > lim || Math.abs(d1) > lim || Math.abs(d2) > lim) continue;
          const dl = Math.sqrt(d0 * d0 + d1 * d1 + d2 * d2);
          if (dl < lim && dl > 1e-6) { const k = lim / dl; X[j] = qx + d0 * k; X[j + 1] = qy + d1 * k; X[j + 2] = qz + d2 * k; n = [d0 / dl, d1 / dl, d2 / dl]; }
        }
        if (!n) continue;
        const vx = X[j] - P[j], vy = X[j + 1] - P[j + 1], vz = X[j + 2] - P[j + 2], vn = vx * n[0] + vy * n[1] + vz * n[2];
        // static friction: a slow particle in contact just stops (no resting-contact jitter)
        if (vx * vx + vy * vy + vz * vz < 2e-5) { P[j] = X[j]; P[j + 1] = X[j + 1]; P[j + 2] = X[j + 2]; continue; }
        const keep = 1 - fr, bn = Math.max(0, vn) * 0.1;
        P[j] = X[j] - ((vx - vn * n[0]) * keep + n[0] * bn); P[j + 1] = X[j + 1] - ((vy - vn * n[1]) * keep + n[1] * bn); P[j + 2] = X[j + 2] - ((vz - vn * n[2]) * keep + n[2] * bn);
      }
    }
  }
  if (CS.some(c => !c.asleep)) WIRES.ver = (WIRES.ver || 0) + 1;   // the resting-wires layer is stale
  for (const c of CS) {                                       // cables at rest go to sleep
    if (c.asleep) continue;
    let mx = 0; for (let i = 0; i < c.n * 3; i++) { const d = Math.abs(c.X[i] - c.P[i]); if (d > mx) mx = d; }
    const held = (WGRAB.on && (WGRAB.c === c || (WGRAB.tie && WGRAB.tie.m.some(m => m.c === c)))) || (LAY.on && LAY.c === c);
    if (held) { c.still = 0; c.ref = null; c.awakeT = 0; continue; }
    // still = no drift over the last second; jitter in place doesn't keep a cable awake
    if (!c.ref || c.ref.length !== c.X.length) { c.ref = c.X.slice(); c.still = 0; continue; }
    let dr = 0; for (let i = 0; i < c.n * 3; i++) { const d = Math.abs(c.X[i] - c.ref[i]); if (d > dr) dr = d; }
    // six seconds after anyone touched it, residual creep or a wire caught on a corner no
    // longer keeps it awake: the scene settles
    c.awakeT = (c.awakeT || 0) + dt;
    if (c.awakeT < 6 && (dr > 0.03 || mx > 0.02)) { c.ref.set(c.X); c.still = 0; } else c.still++;
  }
  // tied cables sleep together: a group goes to sleep once all of it has been still
  const grp = new Map(), find = c => { while (grp.get(c) !== c) c = grp.get(c); return c; };
  for (const c of CS) grp.set(c, c);
  for (const t of TS) for (let k = 1; k < t.m.length; k++) { const a = find(t.m[0].c), b = find(t.m[k].c); if (a !== b) grp.set(a, b); }
  const quiet = new Map();
  for (const c of CS) { const r = find(c); quiet.set(r, quiet.get(r) !== false && (c.asleep || c.still > 60)); }
  for (const c of CS) if (!c.asleep && quiet.get(find(c))) c.asleep = true;
}
function jolt() {
  for (const c of WIRES.cables) { wake(c); for (let i = 0; i < c.n; i++) if (c.W[i] > 0) { const ph = Math.sin(i * 0.17 + c.id * 0.3); c.P[i * 3] -= 0.012 * ph; c.P[i * 3 + 2] -= 0.02 * (0.5 + 0.5 * ph); } }
  sfx.click();
}
// a grabbed point can't be pulled further from the cable's fixed points (its pinned ends,
// clamped ties) than the cable reaches: past that the hand slips, the cable doesn't stretch
function reachClamp(c, i, p, movingEnd) {
  const an = [];
  if (c.pinA && !(movingEnd && i === 0)) an.push([c.pinA, i]);
  if (c.pinB && !(movingEnd && i === c.n - 1)) an.push([c.pinB, c.n - 1 - i]);
  for (const t of WIRES.ties) if (t.hang && t !== WGRAB.tie) for (const m of t.m) if (m.c === c) an.push([t.hang, Math.abs(m.i - i)]);
  for (let pass = 0; pass < 3; pass++) for (const [a, k] of an) {
    const R = k * c.rest * 1.01 + 0.02, dx = p[0] - a[0], dy = p[1] - a[1], dz = p[2] - a[2], L = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (L > R) { p[0] = a[0] + dx / L * R; p[1] = a[1] + dy / L * R; p[2] = a[2] + dz / L * R; }
  }
  return p;
}
const layLength = (c, end) => Math.max(0.8, v3.dist(end, LAY.a) * 1.1 + 0.4);
function updateWires(dt) {
  if (LAY.on) {
    const c = LAY.c;
    // the end eases toward where it will land (the anchor under the cursor, if any), and the
    // length is always the one it will keep, so letting go changes nothing
    for (let k = 0; k < 3; k++) LAY.cur[k] += (LAY.target[k] - LAY.cur[k]) * 0.35;
    setCableLen(c, layLength(c, LAY.target));
    c.pinB = LAY.cur.slice(); c.W[c.n - 1] = 0; wake(c);
  }
  for (const c of WIRES.cables) if (c.pinGoal) {      // an end finishing its last bit of travel onto its anchor
    for (let k = 0; k < 3; k++) c.pinB[k] += (c.pinGoal[k] - c.pinB[k]) * 0.35;
    if (v3.dist(c.pinB, c.pinGoal) < 0.005) { c.pinB = c.pinGoal; c.pinGoal = null; }
    wake(c);
  }
  if (WGRAB.on && WGRAB.goal) {
    WGRAB.target = WGRAB.target || WGRAB.goal.slice();
    for (let k = 0; k < 3; k++) WGRAB.target[k] += (WGRAB.goal[k] - WGRAB.target[k]) * 0.5;
    if (WGRAB.c && !WGRAB.tie) reachClamp(WGRAB.c, WGRAB.i, WGRAB.target, WGRAB.end);
    else if (WGRAB.tie && !WGRAB.head) for (const m of WGRAB.tie.m) reachClamp(m.c, m.i, WGRAB.target, false);
    if (WGRAB.end) { const c = WGRAB.c, pin = WGRAB.i === 0 ? c.pinA : c.pinB; for (let k = 0; k < 3; k++) pin[k] += (WGRAB.target[k] - pin[k]) * 0.6; wake(c); }
    if (WGRAB.hung) { const t = WGRAB.tie; for (let k = 0; k < 3; k++) t.hang[k] += (WGRAB.target[k] - t.hang[k]) * 0.3; t.top = null; t.m.forEach(m => wake(m.c)); }
    // pulling a head pays cable out of its loose tail (and takes it back in)
    if (WGRAB.tie && WGRAB.head) for (const m of WGRAB.tie.m) {
      const c = m.c, i0 = behind(WGRAB.tie, m);
      for (let step = 0; step < 3; step++) {
        const need = v3.dist(xAt(c, i0), WGRAB.target) * 1.07 + 0.3, have = (m.i - i0) * c.rest;
        if (need > have && m.i < c.n - 4) m.i++;
        else if (need < have * 0.82 && m.i > i0 + 4) m.i--;
        else break;
      }
    }
  }
  WIRES.acc = (WIRES.acc || 0) + dt;
  let n = 0; while (WIRES.acc >= 1 / 60 && n < 3) { stepWires(1 / 60); WIRES.acc -= 1 / 60; n++; }
  if (n === 3) WIRES.acc = 0;
}

// ---------- anchors (on the lattice) ----------
// The first visible surface under the cursor, looking down from the cut: a cut face, a
// roof or a floor. Snapped to half-cell lattice points (cell corners and edge midpoints).
function wireAnchor(bx, by, gi) {
  const r = GAUGES[gi].r, sliced = S.mode === 'cut' && S.level < NL - 1, z0 = sliced ? S.level : NL - 1;
  for (let z = z0; z >= 0; z--) {
    const tops = (sliced && z === S.level) ? [HT / LH, 0.25] : [1, 0.25];
    for (const hh of tops) {
      const [u, v] = planeAt(bx, by, z + hh), U = Math.floor(u), V = Math.floor(v);
      if (u < 0 || v < 0 || u >= W || v >= D) continue;
      const o = occOf(cellR(U, V, z));
      if (!o) continue;
      const full = o[1] >= 1;
      if (hh === 0.25 ? full : !full) continue;
      const su = clamp(Math.round(u * 2) / 2, U, U + 1), sv = clamp(Math.round(v * 2) / 2, V, V + 1);
      const [x, y] = fromRotF(su, sv);
      return [x, y, z + Math.min(hh, o[1]) + r + 0.02];
    }
  }
  return null;
}
function fromRotF(u, v) {   // continuous inverse of toRotF
  switch (S.rot) { case 1: return [v, D - u]; case 2: return [W - u, D - v]; case 3: return [W - v, u]; default: return [u, v]; }
}
// the world point under a screen point that keeps the iso depth (u+v) of a reference point
function screenAtDepthOf(bx, by, p) {
  const r = toRotF(p[0], p[1]), b = isoBase(), sxy = r[0] + r[1];
  const dd = (bx - b[0]) / 8, z = (sxy * 4 - (by - b[1])) / LH;
  const u = (sxy + dd) / 2, v = (sxy - dd) / 2, [x, y] = fromRotF(u, v);
  return [x, y, z];
}
function screenAtZ(bx, by, z) { const [u, v] = planeAt(bx, by, z), [x, y] = fromRotF(u, v); return [x, y, z]; }
// ---------- slack: Cmd/Ctrl-drag on a cable pays cable in (up) or out (down) ----------
// The ends and any clamped ties stay put; the cable just gets longer or shorter between them
// (ties slide, so the new length finds its own way along). It can't be pulled shorter than
// the straight line through its fixed points.
const SLACK = { on: false, c: null, y0: 0, L0: 0, min: 0 };
function slackMin(c) {
  const fx = [];
  if (c.pinA) fx.push([0, c.pinA]);
  for (const t of WIRES.ties) if (t.hang) for (const m of t.m) if (m.c === c) fx.push([m.i, t.hang]);
  if (c.pinB) fx.push([c.n - 1, c.pinGoal || c.pinB]);
  fx.sort((p, q) => p[0] - q[0]);
  let L = 0; for (let k = 1; k < fx.length; k++) L += v3.dist(fx[k - 1][1], fx[k][1]);
  return Math.max(0.8, L * 1.01);
}
function startSlack(c, by) { Object.assign(SLACK, { on: true, c, y0: by, L0: cableLen(c), min: slackMin(c) }); wake(c); }
function moveSlack(by) {
  const c = SLACK.c, L = Math.max(SLACK.min, SLACK.L0 + (by - SLACK.y0) * 0.04);   // 25 view px per cell of cable
  setCableLen(c, L); wake(c);
}
function endSlack() {
  const c = SLACK.c, d = cableLen(c) - SLACK.L0; SLACK.on = false; SLACK.c = null;
  if (Math.abs(d) > 0.02) log('you', `${d > 0 ? 'Paid out' : 'Took in'} ${Math.abs(d).toFixed(1)} cells of ${c.g.name} (now ${cableLen(c).toFixed(1)})`, 'sys');
}
// ---------- girder tool ----------
// Girders run along grid lines at the working height: drag to lay one along x or y (it snaps
// to the lines), click without dragging to stand a column from the floor below. Option-click
// removes one. A bundle dropped near a girder hangs from a mount under it.
const GDRAG = { on: false, a: null, b: null };
function gridPointAt(bx, by, z) { const [u, v] = planeAt(bx, by, z), [x, y] = fromRotF(u, v); return [clamp(Math.round(x), 0, W), clamp(Math.round(y), 0, D), z]; }
function girderNear(bx, by, rad) {
  let best = null, bd = rad * rad;
  for (const g of WIRES.girders) {
    const A = projIso(...g.a), B = projIso(...g.b), dx = B[0] - A[0], dy = B[1] - A[1], L2 = dx * dx + dy * dy;
    const u = L2 ? clamp(((bx - A[0]) * dx + (by - A[1]) * dy) / L2, 0, 1) : 0, d = (A[0] + dx * u - bx) ** 2 + (A[1] + dy * u - by) ** 2;
    if (d < bd) { bd = d; best = { g, u, p: [lerp(g.a[0], g.b[0], u), lerp(g.a[1], g.b[1], u), lerp(g.a[2], g.b[2], u)] }; }
  }
  return best;
}
const GIRDER_HANG = 0.55;   // a bundle's centre sits this far under the girder it hangs from
function hangFromGirder(t, gn) {
  const p = gn.p;
  clampTie(t, [p[0], p[1], p[2] - GIRDER_HANG - t.R]); t.top = addMount([p[0], p[1], p[2] - 0.08]).p;
}
function postNear(bx, by, rad) {
  let best = null, bd = rad * rad;
  for (const p of WIRES.posts) { const q = projIso(p.x, p.y, p.z1), d = (q[0] - bx) ** 2 + (q[1] - by) ** 2; if (d < bd) { bd = d; best = p; } }
  return best;
}

// ---------- undo ----------
// Snapshots of the wire layer, taken before every edit. Cmd/Ctrl-Z restores the last one.
const UNDO = { past: [], future: [] };
function snapWires() {
  const ci = new Map(WIRES.cables.map((c, k) => [c, k]));
  return {
    cables: WIRES.cables.map(c => ({ gi: c.gi, n: c.n, X: c.X.slice(), W: c.W.slice(), rest: c.rest, pinA: c.pinA && c.pinA.slice(), pinB: c.pinB && c.pinB.slice(), hue: c.hue, hex: c.hex })),
    ties: WIRES.ties.map(t => ({ m: t.m.map(m => ({ c: ci.get(m.c), i: m.i, off: m.off.slice() })), axis: t.axis.slice(), up: t.up.slice(), hang: t.hang && t.hang.slice(), top: t.top && t.top.slice(), w: t.w, R: t.R, round: t.round, fixed: t.fixed })),
    posts: WIRES.posts.map(p => Object.assign({}, p)), girders: WIRES.girders.map(g => ({ a: g.a.slice(), b: g.b.slice() })), mounts: WIRES.mounts.map(m => ({ p: m.p.slice() }))
  };
}
function loadWires(sn) {
  WIRES.cables = sn.cables.map(o => ({ id: WIRES.nextId++, gi: o.gi, g: GAUGES[o.gi], n: o.n, X: o.X.slice(), P: o.X.slice(), W: o.W.slice(), rest: o.rest, pinA: o.pinA && o.pinA.slice(), pinB: o.pinB && o.pinB.slice(), hue: o.hue, hex: o.hex, still: 0, asleep: false }));
  WIRES.ties = sn.ties.map(o => ({ id: WIRES.nextId++, m: o.m.map(m => ({ c: WIRES.cables[m.c], i: m.i, off: m.off.slice() })), axis: o.axis.slice(), up: o.up.slice(), hang: o.hang && o.hang.slice(), top: o.top && o.top.slice(), w: o.w, R: o.R, round: o.round, fixed: o.fixed, ramp: 1 }));
  WIRES.posts = sn.posts.map(p => Object.assign({}, p)); WIRES.girders = sn.girders.map(g => ({ a: g.a.slice(), b: g.b.slice() })); WIRES.mounts = sn.mounts.map(m => ({ p: m.p.slice() }));
  spineCache.key = -1;
}
function pushUndo() { UNDO.past.push(snapWires()); if (UNDO.past.length > 60) UNDO.past.shift(); UNDO.future = []; }
function undoWires(redo) {
  const from = redo ? UNDO.future : UNDO.past, to = redo ? UNDO.past : UNDO.future;
  if (!from.length) { toast(redo ? 'Nothing to redo' : 'Nothing to undo'); return; }
  const e = from.pop();
  if (e.cells) { to.push(undoCells(e)); loadWires(e.wires); }   // a demolition: the cells come back too
  else { to.push(snapWires()); loadWires(e); }
  Object.assign(WGRAB, { on: false, c: null, tie: null }); LAY.on = false; LAY.c = null; WIRES.stroke = null;
  sfx.click();
}

// ---------- gestures ----------
function segX(ax, ay, bx, by, cx, cy, dx, dy) {
  const r1x = bx - ax, r1y = by - ay, r2x = dx - cx, r2y = dy - cy, den = r1x * r2y - r1y * r2x;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((cx - ax) * r2y - (cy - ay) * r2x) / den, u = ((cx - ax) * r1y - (cy - ay) * r1x) / den;
  return (t >= 0 && t <= 1 && u >= 0 && u <= 1) ? [t, u] : null;
}
function wireVisible(z) { return S.mode !== 'cut' || S.level >= NL - 1 || z <= S.level + HT / LH; }
function tieStroke(x0, y0, x1, y1) {
  const members = [];
  for (const c of WIRES.cables) {
    let best = null;
    for (let i = 1; i < c.n - 2; i++) {
      if (!wireVisible(c.X[i * 3 + 2])) continue;
      const A = projIso(c.X[i * 3], c.X[i * 3 + 1], c.X[i * 3 + 2]), B = projIso(c.X[i * 3 + 3], c.X[i * 3 + 4], c.X[i * 3 + 5]);
      const hit = segX(x0, y0, x1, y1, A[0], A[1], B[0], B[1]); if (!hit) continue;
      const zz = c.X[i * 3 + 2];
      if (!best || zz > best.z) best = { c, i: hit[1] < 0.5 ? i : i + 1, z: zz };
    }
    if (!best) continue;
    if (WIRES.ties.some(t => t.m.some(m => m.c === c && Math.abs(m.i - best.i) < 3))) continue;
    members.push({ c: best.c, i: best.i });
  }
  if (!members.length) return null;
  const t = makeTie(members);
  sfx.ghost && sfx.ghost();
  return t;
}
function pickWire(bx, by, rad) {
  let best = null, bd = rad * rad;
  for (const t of WIRES.ties) { const c = tieCenter(t); if (!wireVisible(c[2])) continue; const q = projIso(c[0], c[1], c[2]), d = (q[0] - bx) ** 2 + (q[1] - by) ** 2; if (d < bd * 2) { bd = d / 2; best = { tie: t }; } }
  if (best) return best;
  for (const c of WIRES.cables) for (let i = 0; i < c.n; i++) {
    if (!wireVisible(c.X[i * 3 + 2])) continue;
    const q = projIso(c.X[i * 3], c.X[i * 3 + 1], c.X[i * 3 + 2]), d = (q[0] - bx) ** 2 + (q[1] - by) ** 2;
    if (d < bd) { bd = d; best = { c, i }; }
  }
  return best;
}
// where a tie member may go: between the next ties on its cable, clear of the ends
function tieRange(t, m) {
  const c = m.c; let lo = 1, hi = c.n - 2;
  for (const o of WIRES.ties) if (o !== t) for (const n of o.m) if (n.c === c) { if (n.i < m.i) lo = Math.max(lo, n.i + 3); else if (n.i > m.i) hi = Math.min(hi, n.i - 3); }
  return [lo, hi];
}
// dragging a tie slides it along its bundle to the point nearest the pointer, stopping at the
// next tie either side. Returns false once the pointer is pulled well off the cables: the
// drag then lifts the bundle instead (to drop it on a post, a girder or a ledge).
function slideTieTo(t, bx, by) {
  const ref = t.m[0], c = ref.c, [lo, hi] = tieRange(t, ref), lim = Math.max(6, 24 / S.zoom);
  let best = ref.i, bd = 1e9;
  for (let i = lo; i <= hi; i++) { const q = projIso(c.X[i * 3], c.X[i * 3 + 1], c.X[i * 3 + 2] + c.g.r * 0.6), d = (q[0] - bx) ** 2 + (q[1] - by) ** 2; if (d < bd) { bd = d; best = i; } }
  if (bd > lim * lim) return false;
  if (best === ref.i) return true;
  const p = xAt(c, best);
  for (const m of t.m) {
    const [l, h] = tieRange(t, m); let bi = m.i, bdd = 1e9;
    for (let i = l; i <= h; i++) { const d = v3.dist(xAt(m.c, i), p); if (d < bdd) { bdd = d; bi = i; } }
    m.i = bi; wake(m.c);
  }
  return true;
}
function grabTie(t) {
  // picking up a clamped head leaves a clamp behind and carries the head on
  if (t.hang && isHead(t)) {
    const keep = { id: WIRES.nextId++, m: t.m.map(m => ({ c: m.c, i: m.i, off: m.off })), axis: t.axis, up: t.up, hang: t.hang, top: t.top, w: t.w, R: t.R, round: t.round };
    WIRES.ties.push(keep);
    for (const m of t.m) m.i = Math.min(m.c.n - 4, m.i + 3);
    t.hang = null; t.top = null;
  }
  const p = tieCenter(t);
  // a free tie slides along its cables; a clamped one or a bundle head is carried
  Object.assign(WGRAB, { on: true, tie: t, c: null, i: -1, end: false, hung: !!t.hang, head: isHead(t), ref: p, goal: p.slice(), target: p.slice(), mode: t.hang || isHead(t) ? 'carry' : 'slide' });
  t.m.forEach(m => wake(m.c));
}
// pointer hooks, called from input; return true when the wire layer took the gesture
function wireDown(bx, by, e) {
  if (S.mode !== 'cut') return false;
  birdsStartle(bx, by);
  pushUndo();
  if (e.altKey) { const pc = pickWire(bx, by, 5); if (pc) { pc.tie ? removeTie(pc.tie) : removeCable(pc.c); return true; } }
  if (S.tool === 'tie' && !e.shiftKey) { const pt = pickWire(bx, by, 5); if (pt && pt.tie) { if (e.detail >= 2) { pt.tie.hang ? (pt.tie.hang = null, pt.tie.top = null, pt.tie.m.forEach(m => wake(m.c))) : hangTie(pt.tie); return true; } grabTie(pt.tie); return true; } }
  if (S.tool === 'tie' || (e.shiftKey && S.tool !== 'inspect' && S.tool !== 'demolish')) { WIRES.stroke = { x0: bx, y0: by, x1: bx, y1: by }; return true; }
  if (S.tool === 'girder') {
    if (e.altKey) { const gn = girderNear(bx, by, 6); if (gn) { WIRES.girders = WIRES.girders.filter(g => g !== gn.g); WIRES.cables.forEach(wake); sfx.click(); } return true; }
    const a = gridPointAt(bx, by, workHeight()); GDRAG.on = true; GDRAG.a = a; GDRAG.b = a.slice(); return true;
  }
  if (S.tool === 'post') {
    // a post stands at the working height and drops to whatever is below it
    const top = workHeight(), [u, v] = planeAt(bx, by, top), [x, y] = fromRotF(Math.round(u * 2) / 2, Math.round(v * 2) / 2);
    if (x < 0 || y < 0 || x >= W || y >= D || wsolid(x, y, top)) { toast('A post needs open air at the working height'); return true; }
    let z0 = top; while (z0 > 0 && !wsolid(x, y, z0 - 0.05)) z0 -= 0.05;
    addPost(x, y, z0, top); sfx.click();
    log('you', `Post at ${x},${y}: ${lvCode(Math.floor(z0))} up to ${lvCode(Math.floor(top))}, ${(top - z0).toFixed(1)} levels`, 'sys');
    return true;
  }
  const pc = pickWire(bx, by, 5);
  if ((e.metaKey || e.ctrlKey) && pc && pc.c) { startSlack(pc.c, by); return true; }
  if (S.tool === 'tie' || S.tool === 'cable' || S.tool === 'inspect') {
    if (pc && e.altKey) { pc.tie ? removeTie(pc.tie) : removeCable(pc.c); return true; }
    if (pc && pc.tie && e.detail >= 2) { pc.tie.hang ? (pc.tie.hang = null, pc.tie.top = null, pc.tie.m.forEach(m => wake(m.c))) : hangTie(pc.tie); return true; }
    if (pc && pc.tie) { grabTie(pc.tie); return true; }
    if (pc) {
      const p = xAt(pc.c, pc.i), end = pc.i === 0 || pc.i === pc.c.n - 1;
      Object.assign(WGRAB, { on: true, tie: null, c: pc.c, i: pc.i, end, hung: false, head: false, ref: p, goal: p.slice(), target: p.slice() });
      if (end) { const c = pc.c; if (pc.i === 0) c.pinA = c.pinA || p.slice(); else c.pinB = c.pinB || p.slice(); c.W[pc.i] = 0; }
      wake(pc.c);
      return true;
    }
  }
  if (S.tool === 'cable') {
    const a = wireAnchor(bx, by, WIRES.gauge);
    if (!a) { UNDO.past.pop(); toast('Nothing to anchor to there'); return true; }
    const c = makeCable(WIRES.gauge, a, [a[0] + 0.1, a[1] + 0.1, a[2]], { length: 0.8 });
    c.pinB = a.slice();
    Object.assign(LAY, { on: true, c, a, cur: a.slice(), target: a.slice() });
    sfx.click();
    return true;
  }
  return false;
}
function wireMove(bx, by) {
  WIRES.ptr = [bx, by];
  if (WIRES.stroke) { WIRES.stroke.x1 = bx; WIRES.stroke.y1 = by; return true; }
  if (LAY.on) { LAY.hint = wireAnchor(bx, by, LAY.c.gi); LAY.target = LAY.hint || screenAtZ(bx, by, LAY.a[2]); return true; }
  if (SLACK.on) { moveSlack(by); return true; }
  if (GDRAG.on) { const p = gridPointAt(bx, by, GDRAG.a[2]), a = GDRAG.a; GDRAG.b = Math.abs(p[0] - a[0]) >= Math.abs(p[1] - a[1]) ? [p[0], a[1], a[2]] : [a[0], p[1], a[2]]; return true; }
  if (WGRAB.on && WGRAB.tie && WGRAB.mode === 'slide') { if (slideTieTo(WGRAB.tie, bx, by)) return true; WGRAB.mode = 'carry'; }
  if (WGRAB.on) {
    const post = WGRAB.tie && postNear(bx, by, 7), gn = WGRAB.tie && !post && girderNear(bx, by, 7);
    WGRAB.goal = post ? [post.x, post.y, post.z1 + WGRAB.tie.R] : gn ? [gn.p[0], gn.p[1], gn.p[2] - GIRDER_HANG] : (WGRAB.end && wireAnchor(bx, by, WGRAB.c.gi)) || screenAtDepthOf(bx, by, WGRAB.ref);
    return true;
  }
  return false;
}
function wireUp(bx, by) {
  if (WIRES.stroke) { const s = WIRES.stroke; WIRES.stroke = null; if (Math.hypot(s.x1 - s.x0, s.y1 - s.y0) <= 2) { const pc = pickWire(bx, by, 5); if (pc && pc.tie) { removeTie(pc.tie); log('you', 'Snipped a tie', 'sys'); } return true; } if (true) { const t = tieStroke(s.x0, s.y0, s.x1, s.y1); if (t) log('you', `Tied ${t.m.length} cable${t.m.length > 1 ? 's' : ''} into a ${t.round ? 'round bundle' : 'ribbon'} (${tieMass(t).toFixed(1)} t/m)`, 'sys'); } return true; }
  if (SLACK.on) { endSlack(); return true; }
  if (GDRAG.on) {
    GDRAG.on = false; const a = GDRAG.a, b = GDRAG.b;
    if (v3.dist(a, b) >= 1) { addGirder(a, b); log('you', `Girder ${v3.dist(a, b)} cells along ${a[0] === b[0] ? 'y' : 'x'} at ${lvCode(Math.floor(a[2]))}`, 'sys'); }
    else {   // a column: from whatever is below up to the working height
      let z0 = a[2]; while (z0 > 0 && !wsolid(a[0] + 0.01, a[1] + 0.01, z0 - 0.05)) z0 -= 0.05;
      if (a[2] - z0 > 0.3) addGirder([a[0], a[1], z0], a);
    }
    WIRES.cables.forEach(wake); sfx.click();
    return true;
  }
  if (LAY.on) {
    const c = LAY.c, b = wireAnchor(bx, by, c.gi); LAY.on = false; LAY.c = null;
    setCableLen(c, layLength(c, b || LAY.target));
    if (b) c.pinGoal = b;                                   // the end eases the rest of the way onto it
    else { c.pinB = null; c.W[c.n - 1] = 1 / c.g.mass; }
    wake(c); sfx.click();
    return true;
  }
  if (WGRAB.on) {
    if (WGRAB.end) {
      const c = WGRAB.c, b = wireAnchor(bx, by, c.gi), atA = WGRAB.i === 0;
      if (b) { if (atA) c.pinA = b; else c.pinB = b; c.W[WGRAB.i] = 0; }
      else { if (atA) c.pinA = null; else c.pinB = null; c.W[WGRAB.i] = 1 / c.g.mass; }
      wake(c);
    }
    if (WGRAB.tie && WGRAB.mode !== 'slide') {
      const t = WGRAB.tie, post = postNear(bx, by, 7), gn = !post && girderNear(bx, by, 7), ctr = tieCenter(t);
      if (post) { clampTie(t, postTop(post)); sfx.click(); }
      else if (gn) { hangFromGirder(t, gn); sfx.click(); }
      else if (WGRAB.hung) hangTie(t);
      else {   // set it down on a ledge at about its own height
        const a = wireAnchor(bx, by, 0);
        if (a && Math.abs(a[2] - ctr[2]) < 1.6) { clampTie(t, a); sfx.click(); }
      }
    }
    Object.assign(WGRAB, { on: false, c: null, tie: null, end: false, hung: false, head: false, goal: null, target: null });
    return true;
  }
  return false;
}
function wireHover(bx, by) {
  if (S.mode !== 'cut' || LAY.on || WGRAB.on || WIRES.stroke) return null;
  const pc = pickWire(bx, by, 5);
  if (pc && pc.tie) return `<b>${isHead(pc.tie) ? 'bundle head' : pc.tie.round ? 'tie' : 'ribbon tie'}</b> · ${pc.tie.m.length} cable${pc.tie.m.length > 1 ? 's' : ''} · ${tieMass(pc.tie).toFixed(1)} t/m${pc.tie.hang ? ' · clamped' : ''}${isHead(pc.tie) ? ' · drag to pay out' : pc.tie.hang ? '' : ' · drag to slide, pull off to lift · ⌥-click removes'}`;
  if (pc) return `<b>${pc.c.g.name}</b> · ${cableLen(pc.c).toFixed(1)} cells${(pc.i === 0 || pc.i === pc.c.n - 1) ? ' · end' : ''} · ⌘-drag ↑↓ slack`;
  if (S.tool === 'post') return '<b>post</b> · click a floor to stand a support up to the working height';
  if (S.tool === 'girder') return '<b>girder</b> · drag along a grid line · click for a column · Option-click removes';
  return null;
}

// ---------- the staged scene ----------
// Geometry: four open voids in two rows, a service gallery along a grid line north of
// them, a spur deck from the gallery to the first void's near lip. Each void has a near
// lip and a short far balcony at LT, a low west ledge (LW) and a high east ledge (LE).
// The stage itself is the first void (so single-void presets keep working); st.voids
// holds one sub-stage per void.
const VOIDS = [[6, 24], [36, 24], [6, 44], [36, 44]], VW = 24, VD = 8;
function buildStageGeometry() {
  const LT = 10, LW = 6, LE = LT;
  const deck = (x, y) => { if (coreAt(x, y) || !inb(x, y, LT)) return; setC(x, y, LT, T.DECK, 0); for (let z = LT + 1; z < Math.min(NL, LT + 3); z++) setC(x, y, z, T.EMPTY); };
  const ledge = (x, y, z) => { if (coreAt(x, y)) return; setC(x, y, z, T.DECK, 0); for (let k = z + 1; k < Math.min(NL, z + 3); k++) setC(x, y, k, T.EMPTY); };
  const Vs = VOIDS.map(([x0, y0]) => ({ x0, y0, x1: x0 + VW, y1: y0 + VD }));
  for (const V of Vs) {
    for (let z = 3; z < NL; z++) for (let y = V.y0; y < V.y1; y++) for (let x = V.x0; x < V.x1; x++) if (!coreAt(x, y)) setC(x, y, z, T.EMPTY);
    for (let y = V.y0; y < V.y1; y++) for (let x = V.x0; x < V.x1; x++) if (!coreAt(x, y)) setC(x, y, 2, T.WATER);
  }
  const V = Vs[0];
  let YT = V.y0 - 4;
  const XA = clamp(V.x0 - 4, 1, W - 2), XB = clamp(Vs[1].x1 + 1, 1, W - 2);
  for (let y = V.y0 - 4; y >= 3; y--) { let ok = true; for (let x = XA; x <= XB && ok; x++) if (coreAt(x, y) || coreAt(x, y + 1)) ok = false; if (ok) { YT = y; break; } }
  const XO = V.x0 + 3;
  for (let x = XA; x <= XB; x++) { deck(x, YT); deck(x, YT + 1); }
  for (let y = YT; y < V.y0; y++) { deck(XO, y); deck(XO + 1, y); }
  for (const U of Vs) {
    for (let x = U.x0 + 3; x < U.x0 + 10; x++) deck(x, U.y1);              // a short far balcony
    for (let x = U.x0 - 1; x <= U.x1; x++) deck(x, U.y0 - 1);                 // near lip
    for (let y = U.y0 + 1; y < U.y1 - 1; y++) { ledge(U.x0, y, LW); ledge(U.x1 - 1, y, LE); }
  }
  computeLight(); computeFill();
  const base = { YT, XO, XA, XB, LT, LW, LE, view: LT + 1, zf: LT + 0.25 };
  const st = Object.assign({ V, focus: [(V.x0 + Vs[1].x1) / 2, V.y0 + 6, LT - 0.5] }, base);
  st.voids = Vs.map(U => Object.assign({ V: U }, base));
  return st;
}
// the main trunk on stands along the gallery, and a branch turning off at 90° that ends in
// a socket panel at the void's lip
function presetTrunk(st) {
  const { V, YT, XO, XA, XB, zf } = st, zs = zf + 0.37, y0 = YT + 0.5, xo = XO + 0.5;
  const standsX = []; for (let x = XA + 1; x <= XB - 1; x += 3) standsX.push(x + 0.5);
  if (!standsX.some(x => Math.abs(x - xo) < 0.6)) { standsX.push(xo); standsX.sort((a, b) => a - b); }
  const stands = standsX.map(x => addPost(x, y0, zf, zs));
  const spur = []; for (let y = y0 + 3; y < V.y0 - 1.5; y += 3) spur.push(addPost(xo, y, zf, zs));
  const zT = zs + 0.32, a = [XA + 0.2, y0, zT], b = [XB - 0.2, y0, zT];
  const trunk = [0, 0, 0, 1, 0, 1, 0, 2, 0, 1].map((g, k) => makeCablePath(g, [a, b], { slack: 1.01, hue: k % 3 }));
  const branch = [0, 0, 1, 0, 1].map((g, k) => {
    const end = [xo - 1 + k * 0.5, V.y0 - 0.9, zf + GAUGES[g].r + 0.02];
    return makeCablePath(g, [a, [xo, y0, zT], [xo, V.y0 - 2, zT], [end[0], V.y0 - 1.4, zf + 0.5], end], { slack: 1.02, hue: (k + 1) % 3 });
  });
  for (let s = 0; s < 60; s++) stepWires(1 / 60);
  for (const p of stands) {
    const ms = trunk.map(c => ({ c, i: nearestIdx(c, postTop(p)) }));
    if (p.x <= xo + 0.01) branch.forEach(c => ms.push({ c, i: nearestIdx(c, [p.x, p.y, zT]) }));
    clampTie(makeTie(ms, { round: true }), postTop(p));
  }
  for (const p of spur) clampTie(makeTie(branch.map(c => ({ c, i: nearestIdx(c, [p.x, p.y, zT]) })), { round: true }), postTop(p));
  return { trunk, branch };
}
function settle(n) { for (let s = 0; s < (n || 400); s++) stepWires(1 / 60); }
function clearWires() { spineCache.key = -1; WIRES.cables = []; WIRES.ties = []; WIRES.posts = []; WIRES.girders = []; WIRES.mounts = []; WIRES.hue = [0, 0, 0, 0]; }
// defer: lay the cables out but leave the settling (that many steps of stepWires, then
// seedWiresDone) to the caller; boot does it in slices so the loading screen keeps moving
function seedWires(defer) {
  clearWires();
  WIRES.stage = buildStageGeometry();
  let n;
  if (typeof defaultScene === 'function') { defaultScene(WIRES.stage); n = 150; } else { presetTrunk(WIRES.stage); n = 400; }
  if (defer) return n;
  settle(n); seedWiresDone();
}
function seedWiresDone() {
  if (typeof initBirds === 'function') initBirds();
  markAllDirty(); skyDirty = true; stripDirty = true;
}

// ---------- drawing ----------
// a cable is a pixel tube: highlight on top (top-face tone), body (left-face tone),
// shadow (right-face tone), dark outline once it is 3 px or wider
const WPAL = new Map();
function wpal(hex, q) {
  const fog = Math.round((WIRES.mist || 0) * 20), key = hex + S.tod + q + ':' + fog + (fog ? LIT.sun : ''); let p = WPAL.get(key);
  if (!p) {
    const hi = mixHex(hex, '#ffffff', 0.28); p = [shadeRGB(hi, 't', q), shadeRGB(hex, 'l', q), shadeRGB(hex, 'r', q), shadeRGB(mixHex(hex, '#000000', 0.78), 'l', q)];
    if (fog) { const mc = mistRGB(), f = fog / 20; p = p.map(s => { const c = s.match(/\d+/g).map(Number); return `rgb(${c.map((v, k) => Math.round(lerp(v, mc[k], f))).join(',')})`; }); }
    WPAL.set(key, p);
  }
  return p;
}
function tubeProfile(w, outline) {
  let inner;
  if (w <= 1) inner = [1]; else if (w === 2) inner = [0, 1]; else if (w === 3) inner = [0, 1, 2];
  else { inner = [0]; while (inner.length < w - 1) inner.push(1); inner.push(2); }
  return outline ? [3, ...inner, 3] : inner;
}
function wq(x, y, z) {
  const cx = clamp(Math.floor(x), 0, W - 1), cy = clamp(Math.floor(y), 0, D - 1), cz = clamp(Math.floor(z + 0.5), 0, NL - 1);
  if (LIT.on) return wireLightQ(x, y, z);
  return Math.max(lightQ(idx(cx, cy, cz)), S.lightFloor || 0);
}
function tubeSeg(ctx, a, b, prof, pal) {
  const dx = b[0] - a[0], dy = b[1] - a[1], n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
  const horiz = Math.abs(dx) >= Math.abs(dy), half = (prof.length - 1) / 2;
  let lastCol = null;
  for (let s = 0; s <= n; s++) {
    const t = s / n, x = a[0] + dx * t, y = a[1] + dy * t;
    if (horiz) { const px = Math.floor(x), y0 = Math.round(y - half - 0.5); for (let j = 0; j < prof.length; j++) { if (!wdt(px, y0 + j)) continue; const c = pal[prof[j]]; if (c !== lastCol) { ctx.fillStyle = c; lastCol = c; } ctx.fillRect(px, y0 + j, 1, 1); } }
    else { const py = Math.floor(y), x0 = Math.round(x - half - 0.5); for (let j = 0; j < prof.length; j++) { if (!wdt(x0 + j, py)) continue; const c = pal[prof[j]]; if (c !== lastCol) { ctx.fillStyle = c; lastCol = c; } ctx.fillRect(x0 + j, py, 1, 1); } }
  }
}
function sleeveRuns() {
  const runs = [], seen = new Set();
  if (!WIRES.sleeve) return runs;
  for (const c of WIRES.cables) {
    const ts = WIRES.ties.filter(t => t.m.some(m => m.c === c)).map(t => ({ t, i: t.m.find(m => m.c === c).i })).sort((a, b) => a.i - b.i);
    for (let k = 0; k + 1 < ts.length; k++) {
      const t1 = ts[k].t, t2 = ts[k + 1].t, key = Math.min(t1.id, t2.id) + ':' + Math.max(t1.id, t2.id);
      if (seen.has(key)) continue; seen.add(key);
      if (t1.m.length < 2 || t1.m.length !== t2.m.length || !t1.m.every(m => t2.m.some(n => n.c === m.c))) continue;
      runs.push({ t1, t2, pairs: t1.m.map(m => ({ c: m.c, a: m.i, b: t2.m.find(n => n.c === m.c).i })) });
    }
  }
  return runs;
}
function sleevePath(run) {
  const pts = [], N = 20;
  for (let s = 0; s <= N; s++) {
    const u = s / N, ctr = [0, 0, 0];
    for (const pr of run.pairs) {
      const fi = lerp(pr.a, pr.b, u), i0 = Math.floor(fi), i1 = Math.min(pr.c.n - 1, i0 + 1), f = fi - i0;
      for (let k = 0; k < 3; k++) ctr[k] += lerp(pr.c.X[i0 * 3 + k], pr.c.X[i1 * 3 + k], f) / run.pairs.length;
    }
    pts.push(ctr);
  }
  return pts;
}
const depthKey = (x, y, z) => { const r = toRotF(x, y); return (r[0] + r[1]) * 1.5 + z; };
// everything whose midpoint sits in level z is drawn right after that level's image,
// back to front, so a round bundle reads as a cylinder of wires
// ---------- bundles as one thing ----------
// Between two ties a bundle has a spine: the smoothed centreline of its wires. Every wire in
// the run is drawn at its slot around the spine, so wires in a bundle stay parallel and the
// bundle keeps one cross-section along its length, whatever the individual particles do.
// a frame carried from the previous one: across stays across, up stays on its side, and it
// eases to the horizontal-across convention (the ties' own) wherever the run isn't steep
function carryFrame(T, pA, pU) {
  const tA = v3.norm([pA[0] - T[0] * v3.dot(pA, T), pA[1] - T[1] * v3.dot(pA, T), pA[2] - T[2] * v3.dot(pA, T)]);
  let h = [-T[1], T[0], 0]; const hl = Math.hypot(h[0], h[1]), w = clamp((hl - 0.2) / 0.3, 0, 1);
  if (hl > 1e-6) { h = [h[0] / hl, h[1] / hl, 0]; if (v3.dot(h, tA) < 0) h = [-h[0], -h[1], 0]; } else h = tA;
  let A = v3.norm([tA[0] * (1 - w) + h[0] * w, tA[1] * (1 - w) + h[1] * w, tA[2] * (1 - w) + h[2] * w]);
  if (!isFinite(A[0])) A = tA;
  let U = v3.norm(v3.cross(T, A)); if (v3.dot(U, pU) < 0) U = [-U[0], -U[1], -U[2]];
  return { A, U };
}
function frameAt(T, prevA) {
  let A = [-T[1], T[0], 0];
  if (Math.hypot(A[0], A[1]) < 0.3) A = prevA ? prevA.slice() : [1, 0, 0];
  A = v3.norm(A); if (prevA && v3.dot(A, prevA) < 0) A = [-A[0], -A[1], -A[2]];
  let U = v3.norm(v3.cross(T, A)); if (U[2] < 0) U = [-U[0], -U[1], -U[2]];
  return { A, U };
}
const memberAt = (pr, u) => { const fi = lerp(pr.a.i, pr.b.i, u), i0 = Math.floor(fi), i1 = Math.min(pr.c.n - 1, i0 + 1), f = fi - i0, X = pr.c.X; return [lerp(X[i0 * 3], X[i1 * 3], f), lerp(X[i0 * 3 + 1], X[i1 * 3 + 1], f), lerp(X[i0 * 3 + 2], X[i1 * 3 + 2], f)]; };
function buildSpine(r) {
  const P = r.pairs, N = clamp(Math.max(...P.map(p => p.b.i - p.a.i)), 4, 60), pts = [];
  for (let s = 0; s <= N; s++) { const u = s / N, c = [0, 0, 0]; for (const pr of P) { const x = memberAt(pr, u); for (let k = 0; k < 3; k++) c[k] += x[k] / P.length; } pts.push(c); }
  for (let pass = 0; pass < 3; pass++) for (let s = 1; s < N; s++) for (let k = 0; k < 3; k++) pts[s][k] = (pts[s - 1][k] + 2 * pts[s][k] + pts[s + 1][k]) / 4;
  const F = []; let prevA = r.t1.axis;
  for (let s = 0; s <= N; s++) { const T = v3.norm(v3.sub(pts[Math.min(N, s + 1)], pts[Math.max(0, s - 1)])); const f = frameAt(T, prevA); F.push(f); prevA = f.A; }
  // the centroid sits at the mean slot; move the spine to the bundle's axis
  const offs = P.map(pr => { const o = []; for (let s = 0; s <= N; s++) { const u = s / N; o.push([lerp(pr.a.off[0], pr.b.off[0], u), lerp(pr.a.off[1], pr.b.off[1], u)]); } return o; });
  for (let s = 0; s <= N; s++) { let m0 = 0, m1 = 0; for (const o of offs) { m0 += o[s][0] / P.length; m1 += o[s][1] / P.length; } for (let k = 0; k < 3; k++) pts[s][k] -= F[s].A[k] * m0 + F[s].U[k] * m1; }
  const R = []; for (let s = 0; s <= N; s++) R.push(Math.max(...P.map((pr, j) => Math.hypot(offs[j][s][0], offs[j][s][1]) + pr.c.g.r)));
  const Wpx = [];
  for (let s = 0; s <= N; s++) {
    const p = pts[s], f = F[s], qa = projIso(...pts[Math.max(0, s - 1)]), qb = projIso(...pts[Math.min(N, s + 1)]);
    let tx = qb[0] - qa[0], ty = qb[1] - qa[1]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    let lo = 1e9, hi = -1e9; const q0 = projIso(...p);
    for (let j = 0; j < 12; j++) { const th = j / 12 * Math.PI * 2, ca = Math.cos(th) * R[s], sa = Math.sin(th) * R[s], q = projIso(p[0] + f.A[0] * ca + f.U[0] * sa, p[1] + f.A[1] * ca + f.U[1] * sa, p[2] + f.A[2] * ca + f.U[2] * sa); const d = -(q[0] - q0[0]) * ty + (q[1] - q0[1]) * tx; lo = Math.min(lo, d); hi = Math.max(hi, d); }
    Wpx.push(Math.max(3, Math.round(hi - lo) + 1));
  }
  const pos = (j, s) => { const o = offs[j][s], f = F[s], p = pts[s]; return [p[0] + f.A[0] * o[0] + f.U[0] * o[1], p[1] + f.A[1] * o[0] + f.U[1] * o[1], p[2] + f.A[2] * o[0] + f.U[2] * o[1]]; };
  return { r, N, pts, F, offs, R, Wpx, pos, round: r.t1.round && r.t2.round };
}
let spineCache = { key: -1, list: [] };
function spines() {
  const key = S.time;
  if (spineCache.key !== key) spineCache = { key, list: bundleRuns().map(buildSpine) };
  return spineCache.list;
}
const deepC = new Map();
const rgbHex = c => { const m = c.match(/\d+/g); return m && c[0] !== '#' ? hexOf(+m[0], +m[1], +m[2]) : c; };
const deep = pal => { let d = deepC.get(pal); if (!d) { d = mixHex(rgbHex(pal[2]), rgbHex(pal[3]), 0.5); deepC.set(pal, d); } return d; };
// a pixel tube whose rows are given per column: rowsFn(j) -> colour
function tubeRows(ctx, a, b, w, colAt) {
  const dx = b[0] - a[0], dy = b[1] - a[1], n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
  const horiz = Math.abs(dx) >= Math.abs(dy), half = (w - 1) / 2;
  let last = null;
  for (let s = 0; s <= n; s++) {
    const t = s / n, x = a[0] + dx * t, y = a[1] + dy * t;
    for (let j = 0; j < w; j++) {
      const c = colAt(j, t); if (!c) continue;
      if (c !== last) { ctx.fillStyle = c; last = c; }
      const X = horiz ? Math.floor(x) : Math.round(x - half - 0.5) + j, Y = horiz ? Math.round(y - half - 0.5) + j : Math.floor(y);
      if (wdt(X, Y)) ctx.fillRect(X, Y, 1, 1);
    }
  }
}
const RW = (ctx, x, y, w, h, c) => { ctx.fillStyle = c; for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (wdt(xx, yy)) ctx.fillRect(xx, yy, 1, 1); };
// ---------- highlight: making what's under the pointer (or in hand) unmistakable ----------
// 'amber' recolours it in place (the original). The others draw just that cable or tie into an
// overlay each frame and treat it: a soft glow, a 1-px outline, a brightening, a pulsing
// outline, or dimming everything else.
const HL_STYLES = ['amber', 'glow', 'outline', 'outline-amber', 'bright', 'pulse', 'dim', 'glow-outline'];
const HLC = { c: null, g: null, t: null, tg: null };
function hlTarget() {
  if (WIRES.hover) return WIRES.hover.tie ? { tie: WIRES.hover.tie } : { c: WIRES.hover.c };
  if (WGRAB.on) return WGRAB.tie ? { tie: WGRAB.tie } : WGRAB.c ? { c: WGRAB.c } : null;
  if (LAY.on && LAY.c) return { c: LAY.c };
  return null;
}
function hlMatch(sg) {
  const O = WIRES.only;
  if (O.c) return sg.c === O.c || sg.sock === O.c || (sg.tube && sg.tube.r.pairs.some(pr => pr.c === O.c));
  return !!O.tie && sg.band === O.tie;
}
function drawWireHighlight(ctx, floor, t) {
  const style = WIRES.hl || 'amber', target = hlTarget();
  if (style === 'amber' || !target) return;
  const w = S.bw, h = S.bh;
  if (!HLC.c || HLC.c.width !== w || HLC.c.height !== h) { HLC.c = mk(w, h); HLC.g = HLC.c.getContext('2d'); HLC.t = mk(w, h); HLC.tg = HLC.t.getContext('2d'); }
  const g = HLC.g; g.clearRect(0, 0, w, h);
  WIRES.only = target;
  try { wpxHold(g, () => { for (let z = floor || 0; z < NL; z++) drawWiresLevel(g, z); }); } finally { WIRES.only = null; }
  const tint = col => { const tg = HLC.tg; tg.globalCompositeOperation = 'source-over'; tg.clearRect(0, 0, w, h); tg.drawImage(HLC.c, 0, 0); tg.globalCompositeOperation = 'source-in'; tg.fillStyle = col; tg.fillRect(0, 0, w, h); tg.globalCompositeOperation = 'source-over'; return HLC.t; };
  const outline = (col, a) => { const o = tint(col); ctx.globalAlpha = a; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) ctx.drawImage(o, dx, dy); ctx.globalAlpha = 1; ctx.drawImage(HLC.c, 0, 0); };
  const glow = (a) => { const o = tint('#ffc062'); ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.filter = 'blur(2px)'; ctx.globalAlpha = 0.85 * a; ctx.drawImage(o, 0, 0); ctx.filter = 'blur(5px)'; ctx.globalAlpha = 0.55 * a; ctx.drawImage(o, 0, 0); ctx.restore(); };
  ctx.save();
  if (style === 'glow') glow(1);
  else if (style === 'outline') outline('#fff4dc', 1);
  else if (style === 'outline-amber') outline('#f0b43c', 1);
  else if (style === 'bright') { ctx.filter = 'brightness(1.45) saturate(1.35)'; ctx.drawImage(HLC.c, 0, 0); }
  else if (style === 'pulse') outline('#fff4dc', 0.35 + 0.65 * (0.5 + 0.5 * Math.sin((t || 0) * 7)));
  else if (style === 'dim') { ctx.fillStyle = 'rgba(8,9,11,0.42)'; ctx.fillRect(0, 0, w, h); ctx.drawImage(HLC.c, 0, 0); glow(0.5); }
  else if (style === 'glow-outline') { outline('#2a1a08', 1); glow(0.8); }
  ctx.restore();
}
// Every cable segment, bundle step, socket and band, bucketed by the level its midpoint is
// in and sorted back to front: built once per frame (or wire change) for all the levels
// instead of each level walking every cable. oz is the height the cut-plane test uses.
let WSEG = { key: null };
function wireSegs() {
  const SP = spines(), key = [S.time, WIRES.ver || 0, WIRES.nextId, WIRES.cables.length, WIRES.ties.length, WIRES.sockets, WIRES.bundleLook, S.rot].join('|');
  if (WSEG.key === key && WSEG.sp === SP) return WSEG;
  const hidden = new Map(), override = new Map(), lv = new Map();
  const put = (zz, sg) => { const k = Math.floor(zz); let a = lv.get(k); if (!a) lv.set(k, a = []); a.push(sg); };
  for (const sp of SP) sp.r.pairs.forEach((pr, j) => {
    if (!hidden.has(pr.c)) hidden.set(pr.c, []);
    hidden.get(pr.c).push([pr.a.i, pr.b.i]);
    if (!override.has(pr.c)) override.set(pr.c, new Map());
    override.get(pr.c).set(pr.a.i, sp.pos(j, 0)); override.get(pr.c).set(pr.b.i, sp.pos(j, sp.N));
  });
  // loose wire: drawn from its own particles, joined seamlessly to the bundles it enters
  for (const c of WIRES.cables) {
    const hid = hidden.get(c) || [], ov = override.get(c);
    const P = i => (ov && ov.get(i)) || xAt(c, i);
    for (let i = 0; i < c.n - 1; i++) {
      if (hid.some(([a, b]) => i >= a && i < b)) continue;
      const pa = P(i), pb = P(i + 1), zm = (pa[2] + pb[2]) / 2;
      put(zm, { c, i, pa, pb, k: depthKey((pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, zm), zm, oz: zm });
    }
    if (WIRES.sockets) for (const pin of [c.pinA, c.pinB]) {
      if (!pin) continue;
      put(pin[2], { sock: c, p: pin, k: depthKey(pin[0], pin[1], pin[2]) + 0.05, oz: pin[2] });
    }
  }
  // bundled runs
  const tube = WIRES.bundleLook === 'tube';
  for (const sp of SP) {
    for (let s = 0; s < sp.N; s++) {
      const a = sp.pts[s], b = sp.pts[s + 1], zm = (a[2] + b[2]) / 2;
      const k = depthKey((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, zm);
      if (tube && sp.round) put(zm, { tube: sp, s, k, oz: zm });
      else {
        if (sp.round) put(zm, { core: sp, s, k: k - 0.4, d: k, oz: zm });
        sp.r.pairs.forEach((pr, j) => { const pa = sp.pos(j, s), pb = sp.pos(j, s + 1); put(zm, { c: pr.c, i: -1, pa, pb, k: depthKey((pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, zm), zm, oz: zm }); });
      }
    }
  }
  // ties: a band wrapped tight round the bundle where a run starts or ends; a clip on a ribbon
  const banded = new Set();
  for (const sp of SP) for (const [t, s] of [[sp.r.t1, 0], [sp.r.t2, sp.N]]) {
    if (banded.has(t)) continue; banded.add(t);
    const p = sp.pts[s];
    put(p[2], { band: t, sp, s, k: depthKey(p[0], p[1], p[2]) + 0.6, d: depthKey(p[0], p[1], p[2]) + 0.3, oz: p[2] });
  }
  for (const a of lv.values()) a.sort((a, b) => a.k - b.k);
  WSEG = { key, sp: SP, lv, loneTies: WIRES.ties.filter(t => !banded.has(t)) };
  return WSEG;
}
// ---------- pixel batching ----------
// A cable is drawn a pixel at a time, and a canvas call per pixel cost more than the rest of
// the wire pass. So the wires are written into a pixel buffer (WPXC stands in for the canvas)
// and the rectangle they touched goes onto the real canvas in one putImageData + drawImage:
// the same pixels in the same order. wpxHold() keeps one batch open over several levels.
const WPX = { bufs: [], b: null, ctx: null, depth: 0, cols: new Map(), probe: null };
function wpxColor(s) {
  let v = WPX.cols.get(s);
  if (v !== undefined) return v;
  let r, g, b, a = 255;
  if (s[0] === '#' && s.length === 7) { r = parseInt(s.slice(1, 3), 16); g = parseInt(s.slice(3, 5), 16); b = parseInt(s.slice(5, 7), 16); }
  else if (/^rgb\(/.test(s)) [r, g, b] = s.match(/\d+/g).map(Number);
  else {   // anything else (named, short hex, rgba): let the canvas parse it
    if (!WPX.probe) WPX.probe = mk(1, 1).getContext('2d', { willReadFrequently: true });
    const p = WPX.probe; p.clearRect(0, 0, 1, 1); p.fillStyle = s; p.fillRect(0, 0, 1, 1); [r, g, b, a] = p.getImageData(0, 0, 1, 1).data;
  }
  v = ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
  WPX.cols.set(s, v);
  return v;
}
const WPXC = {
  col: 0, str: '',
  get fillStyle() { return this.str; },
  set fillStyle(s) { this.str = s; this.col = wpxColor(s); },
  fillRect(x, y, w, h) {
    const B = WPX.b, bw = B.w, bh = B.h, u = B.u;
    let x0 = Math.max(0, x | 0), y0 = Math.max(0, y | 0); const x1 = Math.min(bw, (x + w) | 0), y1 = Math.min(bh, (y + h) | 0);
    if (x1 <= x0 || y1 <= y0) return;
    if (x0 < B.x0) B.x0 = x0; if (y0 < B.y0) B.y0 = y0; if (x1 > B.x1) B.x1 = x1; if (y1 > B.y1) B.y1 = y1;
    const c = this.col, sa = c >>> 24;
    for (let yy = y0; yy < y1; yy++) {
      const row = yy * bw;
      if (sa === 255) { for (let xx = x0; xx < x1; xx++) u[row + xx] = c; continue; }
      for (let xx = x0; xx < x1; xx++) u[row + xx] = wpxOver(c, u[row + xx]);
    }
  }
};
function wpxOver(s, d) {   // source-over, unpremultiplied
  const sa = (s >>> 24) / 255, da = (d >>> 24) / 255, oa = sa + da * (1 - sa);
  if (oa <= 0) return 0;
  const ch = k => Math.round((((s >>> k) & 255) * sa + ((d >>> k) & 255) * da * (1 - sa)) / oa);
  return ((Math.round(oa * 255) << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)) >>> 0;
}
function wpxBegin(ctx) {
  if (window.__nowpx) return false;   // debug: draw straight to the canvas
  if (WPX.depth > 0) { if (WPX.ctx !== ctx) return false; WPX.depth++; return true; }
  const cv = ctx.canvas, w = cv && cv.width, h = cv && cv.height;
  if (!w || !h || !ctx.getTransform().isIdentity) return false;
  let B = WPX.bufs.find(q => q.w === w && q.h === h);
  if (!B) {
    const c = mk(w, h), u8 = new Uint8ClampedArray(w * h * 4);
    B = { w, h, c, g: c.getContext('2d'), u: new Uint32Array(u8.buffer), img: new ImageData(u8, w, h), x0: w, y0: h, x1: 0, y1: 0 };
    WPX.bufs.unshift(B); if (WPX.bufs.length > 3) WPX.bufs.pop();
  }
  WPX.b = B; WPX.ctx = ctx; WPX.depth = 1;
  return true;
}
function wpxEnd() {
  if (--WPX.depth > 0) return;
  const B = WPX.b, ctx = WPX.ctx; WPX.b = WPX.ctx = null; WPX.depth = 0;
  if (B.x1 <= B.x0) return;
  const { x0, y0 } = B, w = B.x1 - x0, h = B.y1 - y0;
  B.g.putImageData(B.img, 0, 0, x0, y0, w, h);
  ctx.drawImage(B.c, x0, y0, w, h, x0, y0, w, h);
  for (let y = y0; y < B.y1; y++) B.u.fill(0, y * B.w + x0, y * B.w + B.x1);
  B.x0 = B.w; B.y0 = B.h; B.x1 = B.y1 = 0;
}
// several drawWiresLevel calls onto one canvas, nothing else drawn between them: one batch
function wpxHold(ctx, fn) { const on = wpxBegin(ctx); try { fn(); } finally { if (on) wpxEnd(); } }
function drawWiresLevel(ctx, z) {
  if (!wpxBegin(ctx)) { drawWiresLevelTo(ctx, z); return; }
  try { drawWiresLevelTo(WPXC, z); } finally { wpxEnd(); }
}
function drawWiresLevelTo(ctx, z) {
  WIRES.mist = wireMist(z);
  const cutTop = S.level + HT / LH, inLv = p => Math.floor(p) === z;
  const cutting = S.mode === 'cut' && S.level < NL - 1;
  const ok = p => !cutting || p <= cutTop;
  const all = !WIRES.only;                                    // WIRES.only: draw just one cable or tie (the highlight pass)
  if (all) for (const p of WIRES.posts) {                    // posts first: bundles rest on them
    const a = Math.max(p.z0, z), b = Math.min(p.z1, z + 1);
    if (b <= a || !ok(a)) continue;
    const q = wq(p.x, p.y, a), pal = wpal(POST_HEX, q); WDT.D = depthKey(p.x, p.y, Math.min(b, p.z1));
    tubeSeg(ctx, projIso(p.x, p.y, a), projIso(p.x, p.y, Math.min(b, cutting ? cutTop : b)), tubeProfile(2, true), pal);
    if (inLv(p.z1) && ok(p.z1)) { const c = projIso(p.x, p.y, p.z1); tubeSeg(ctx, [c[0] - 3, c[1]], [c[0] + 3, c[1]], [3, 0, 3], pal); }
  }
  // girders: slim gleaming steel along grid lines, a small bulb where they join
  const joints = new Map();
  if (all) for (const g of WIRES.girders) {
    const za = Math.min(g.a[2], g.b[2]), zb = Math.max(g.a[2], g.b[2]), vert = zb - za > 0.5;
    for (const e of [g.a, g.b]) joints.set(e.map(v => v.toFixed(2)).join(), e);
    const pa = vert ? (g.a[2] < g.b[2] ? g.a : g.b) : g.a, pb = vert ? (g.a[2] < g.b[2] ? g.b : g.a) : g.b;
    let t0 = 0, t1 = 1;
    if (vert) { t0 = clamp((z - za) / (zb - za), 0, 1); t1 = clamp((z + 1 - za) / (zb - za), 0, 1); if (t1 <= t0) continue; }
    else if (!inLv(za)) continue;
    const A = [lerp(pa[0], pb[0], t0), lerp(pa[1], pb[1], t0), lerp(pa[2], pb[2], t0)], B = [lerp(pa[0], pb[0], t1), lerp(pa[1], pb[1], t1), Math.min(lerp(pa[2], pb[2], t1), cutting ? cutTop : 99)];
    if (!ok(A[2])) continue;
    const pal = wpal(GIRDER_HEX, Math.max(3, wq(A[0], A[1], A[2]))); WDT.D = Math.max(depthKey(...A), depthKey(...B));
    tubeSeg(ctx, projIso(...A), projIso(...B), [0, 2], [mixHex(rgbHex(pal[0]), GLEAM, 0.35), pal[1], pal[2], pal[3]]);
  }
  if (all) for (const e of joints.values()) {
    if (!inLv(e[2]) || !ok(e[2])) continue;
    const q = projIso(...e), X = Math.round(q[0]), Y = Math.round(q[1]), pal = wpal(GIRDER_HEX, 4); WDT.D = depthKey(...e) + 0.2;
    if (WIRES.joint === 'plate') { RW(ctx, X - 2, Y - 2, 5, 5, pal[3]); RW(ctx, X - 1, Y - 1, 3, 3, pal[1]); RW(ctx, X, Y - 1, 1, 3, pal[2]); RW(ctx, X - 1, Y, 3, 1, pal[2]); }
    else if (WIRES.joint === 'ring') { RW(ctx, X - 2, Y - 1, 5, 3, pal[2]); RW(ctx, X - 1, Y - 2, 3, 5, pal[2]); RW(ctx, X - 1, Y - 1, 3, 3, pal[0]); RW(ctx, X, Y, 1, 1, pal[3]); }
    else { RW(ctx, X - 1, Y - 1, 3, 3, pal[2]); RW(ctx, X - 1, Y - 1, 2, 2, pal[0]); }
  }
  if (all) for (const m of WIRES.mounts) {
    if (!inLv(m.p[2]) || !ok(m.p[2])) continue;
    const q = projIso(...m.p), X = Math.round(q[0]), Y = Math.round(q[1]), pal = wpal(GIRDER_HEX, 4); WDT.D = depthKey(...m.p) + 0.2;
    RW(ctx, X - 1, Y, 3, 2, pal[2]); RW(ctx, X - 1, Y, 2, 1, pal[0]); RW(ctx, X, Y, 1, 1, GLEAM);
  }
  const WS = wireSegs(), segs = (WS.lv.get(z) || []).filter(sg => ok(sg.oz)), loneTies = WS.loneTies;
  const light = p => wq(p[0], p[1], p[2]);
  for (const sg of segs) {
    if (!all && !hlMatch(sg)) continue;
    WDT.D = sg.d != null ? sg.d : sg.k;
    if (sg.core) {
      const sp = sg.core, a = sp.pts[sg.s], b = sp.pts[sg.s + 1], w = Math.max(2, sp.Wpx[sg.s] - 1), pal = wpal('#2c2925', light(a));
      tubeSeg(ctx, projIso(...a), projIso(...b), Array.from({ length: w }, (_, j) => j === 0 ? 1 : j === w - 1 ? 3 : 2), pal);
      continue;
    }
    if (sg.tube) {
      // a striped tube: each row takes the colour of the wire nearest it on screen, shaded like a cylinder
      const sp = sg.tube, s = sg.s, a = sp.pts[s], b = sp.pts[s + 1], qa = projIso(...a), qb = projIso(...b);
      const w = sp.Wpx[s], horiz = Math.abs(qb[0] - qa[0]) >= Math.abs(qb[1] - qa[1]);
      const rows = sp.r.pairs.map((pr, j) => { const q = projIso(...sp.pos(j, s)); return { y: horiz ? q[1] - qa[1] : q[0] - qa[0], hex: cableHex(pr.c), d: depthKey(...sp.pos(j, s)) }; });
      const q = light(a), half = (w - 1) / 2, cols = [];
      for (let j = 0; j < w; j++) {
        const y = j - half; let best = null, bd = 1e9;
        for (const r of rows) { const dd = Math.abs(r.y - y) - r.d * 0.15; if (dd < bd) { bd = dd; best = r; } }
        const pal = wpal(best.hex, q), f = w > 3 ? (j - 1) / (w - 3) : 0.5;
        cols.push(j === 0 || j === w - 1 ? pal[3] : f < 0.22 ? pal[0] : f < 0.6 ? pal[1] : f < 0.86 ? pal[2] : deep(pal));
      }
      tubeRows(ctx, qa, qb, w, j => cols[j]);
      continue;
    }
    if (sg.band) {
      const t = sg.band, sp = sg.sp, s = sg.s, p = sp.pts[s], hov = WIRES.hl === 'amber' && WIRES.hover && WIRES.hover.tie === t;
      const pal = wpal(hov ? '#f0b43c' : TIE_HEX, light(p));
      const q0 = projIso(...sp.pts[Math.max(0, s - 1)]), q1 = projIso(...sp.pts[Math.min(sp.N, s + 1)]), qp = projIso(...p);
      let tx = q1[0] - q0[0], ty = q1[1] - q0[1]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      if (!sp.round) {                                          // ribbon clip: straight, seated on the ribbon
        const half = Math.max(...sp.r.pairs.map((pr, j) => Math.hypot(...sp.offs[j][s]) + pr.c.g.r)) * 9 + 1;
        tubeSeg(ctx, [qp[0] - ty * half, qp[1] + tx * half], [qp[0] + ty * half, qp[1] - tx * half], tubeProfile(2, true), pal);
        continue;
      }
      // the strap: a ring round the bundle at this point, front half only, drawn as a 2-px band
      const f = sp.F[s], rr = sp.R[s] + 0.01, k0 = depthKey(...p), N = 28;
      let prev = null;
      for (let j = 0; j <= N; j++) {
        const th = j / N * Math.PI * 2, ca = Math.cos(th) * rr, sa = Math.sin(th) * rr;
        const q3 = [p[0] + f.A[0] * ca + f.U[0] * sa, p[1] + f.A[1] * ca + f.U[1] * sa, p[2] + f.A[2] * ca + f.U[2] * sa];
        const front = depthKey(...q3) >= k0 - 0.02, q = projIso(q3[0], q3[1], q3[2] + 0.04);
        if (prev && front && prev.front) { tubeSeg(ctx, prev.q, q, [0], pal); tubeSeg(ctx, [prev.q[0] + tx, prev.q[1] + ty], [q[0] + tx, q[1] + ty], [2], pal); }
        prev = { q, front };
      }
      continue;
    }
    if (sg.sock) {
      const c = sg.sock, q = projIso(sg.p[0], sg.p[1], sg.p[2] - c.g.r), X = Math.round(q[0]), Y = Math.round(q[1]), sz = c.g.px + 2;
      const pal = wpal('#3a3d42', light(sg.p));
      RW(ctx, X - (sz >> 1) - 1, Y - 1, sz + 2, 3, pal[3]); RW(ctx, X - (sz >> 1), Y - 1, sz, 1, pal[0]); RW(ctx, X - (sz >> 1), Y, sz, 1, pal[1]);
      continue;
    }
    const c = sg.c, w = c.g.px, prof = tubeProfile(w, WIRES.outline && w >= 3);
    const hov = WIRES.hl === 'amber' && WIRES.hover && WIRES.hover.c === c;
    const a = projIso(sg.pa[0], sg.pa[1], sg.pa[2] + c.g.r * 0.6), b = projIso(sg.pb[0], sg.pb[1], sg.pb[2] + c.g.r * 0.6);
    const pal = wpal(hov ? '#f0b43c' : cableHex(c), light(sg.pa));
    tubeSeg(ctx, a, b, prof, c.gi >= 2 && sg.i >= 0 && sg.i % (c.gi === 3 ? 5 : 7) === 0 ? [pal[2], pal[2], pal[3], pal[3]] : pal);
  }
  for (const t of WIRES.ties) {                               // hanger rods
    if (!all && WIRES.only.tie !== t) continue;
    const c = tieCenter(t); if (!t.top || !inLv(c[2]) || !ok(c[2])) continue; WDT.D = depthKey(...c);
    tubeSeg(ctx, projIso(c[0], c[1], c[2] + t.R), projIso(t.top[0], t.top[1], t.top[2]), [1, 3], wpal(ROD_HEX, wq(c[0], c[1], c[2])));
  }
  for (const t of loneTies) {                                 // a tie with no bundle on either side
    if (!all && WIRES.only.tie !== t) continue;
    const c = tieCenter(t); if (!inLv(c[2]) || !ok(c[2])) continue; WDT.D = depthKey(...c) + 0.3;
    const cc = [0, 0, 0]; for (const m of t.m) for (let k = 0; k < 3; k++) cc[k] += m.c.X[m.i * 3 + k] / t.m.length;
    if (t.round) {
      // a band square to the run, wrapped round the cables where they actually are; front half only
      const T = t.T || [0, 0, 1], A = t.axis, U = v3.norm(v3.cross(T, A)), hov = WIRES.hl === 'amber' && WIRES.hover && WIRES.hover.tie === t, pal = wpal(hov ? '#f0b43c' : TIE_HEX, wq(...cc));
      let rr = 0; for (const m of t.m) { const q = v3.sub(xAt(m.c, m.i), cc), dt = v3.dot(q, T); rr = Math.max(rr, Math.hypot(q[0] - T[0] * dt, q[1] - T[1] * dt, q[2] - T[2] * dt) + m.c.g.r); }
      rr += 0.01;
      const k0 = depthKey(...cc), q0 = projIso(cc[0] - T[0] * 0.1, cc[1] - T[1] * 0.1, cc[2] - T[2] * 0.1), q1 = projIso(cc[0] + T[0] * 0.1, cc[1] + T[1] * 0.1, cc[2] + T[2] * 0.1);
      let tx = q1[0] - q0[0], ty = q1[1] - q0[1]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      let prev = null;
      for (let j = 0; j <= 28; j++) {
        const th = j / 28 * Math.PI * 2, ca = Math.cos(th) * rr, sa = Math.sin(th) * rr;
        const q3 = [cc[0] + A[0] * ca + U[0] * sa, cc[1] + A[1] * ca + U[1] * sa, cc[2] + A[2] * ca + U[2] * sa];
        const front = depthKey(...q3) >= k0 - 0.02, q = projIso(...q3);
        if (prev && front && prev.front) { tubeSeg(ctx, prev.q, q, [0], pal); tubeSeg(ctx, [prev.q[0] + tx, prev.q[1] + ty], [q[0] + tx, q[1] + ty], [2], pal); }
        prev = { q, front };
      }
      continue;
    }
    const half = Math.max(...t.m.map(m => Math.abs(v3.dot(v3.sub(xAt(m.c, m.i), cc), t.axis)) + m.c.g.r)) + 0.04, lift = Math.max(...t.m.map(m => m.c.g.r)) + 0.02;
    tubeSeg(ctx, projIso(cc[0] - t.axis[0] * half, cc[1] - t.axis[1] * half, cc[2] + lift), projIso(cc[0] + t.axis[0] * half, cc[1] + t.axis[1] * half, cc[2] + lift), tubeProfile(2, true), wpal(TIE_HEX, wq(...cc)));
  }
}
// gesture overlays: tie stroke, anchor and post markers (drawn after the world)
function drawWireOverlay(ctx) {
  if (S.mode !== 'cut') return;
  const s = WIRES.stroke;
  if (s) { pline(ctx, s.x0, s.y0 + 1, s.x1, s.y1 + 1, 'rgba(0,0,0,0.6)'); pline(ctx, s.x0, s.y0, s.x1, s.y1, '#f0b43c', [3, 2]); }
  const mark = (p, col) => { if (!p) return; const q = projIso(p[0], p[1], p[2]); const X = Math.round(q[0]), Y = Math.round(q[1]); dia(ctx, X - 4, Y - 2, 8, col); R_(ctx, X, Y, 1, 1, '#1b1305'); };
  if (SLACK.on && WIRES.ptr) {
    const c = SLACK.c, d = cableLen(c) - SLACK.L0, X = Math.round(WIRES.ptr[0]), Y = Math.round(WIRES.ptr[1]), at = cableLen(c) <= SLACK.min + 0.01;
    ptext(ctx, (d >= 0 ? '+' : '') + d.toFixed(1) + (at ? ' TAUT' : ''), X + 7, Y - 9, '#f0b43c', true);
    return;
  }
  if (GDRAG.on) { const A = projIso(...GDRAG.a), B = projIso(...GDRAG.b); pline(ctx, A[0], A[1] + 1, B[0], B[1] + 1, 'rgba(0,0,0,0.6)'); pline(ctx, A[0], A[1], B[0], B[1], '#f0b43c', [3, 2]); mark(GDRAG.a, '#f0b43c'); mark(GDRAG.b, '#e6dfcf'); return; }
  if (S.tool === 'girder' && WIRES.ptr && !WGRAB.on) { const gn = WIRES.ptr && girderNear(WIRES.ptr[0], WIRES.ptr[1], 6); mark(gridPointAt(WIRES.ptr[0], WIRES.ptr[1], workHeight()), 'rgba(240,180,60,0.85)'); if (gn) { const A = projIso(...gn.g.a), B = projIso(...gn.g.b); pline(ctx, A[0], A[1], B[0], B[1], 'rgba(240,180,60,0.6)'); } }
  if (LAY.on) { mark(LAY.a, '#f0b43c'); mark(LAY.hint || LAY.target, LAY.hint ? '#e6dfcf' : 'rgba(230,223,207,0.5)'); }
  else if (WGRAB.on && WGRAB.end) mark(WGRAB.goal, '#e6dfcf');
  else if (WGRAB.on && WGRAB.tie && WGRAB.mode !== 'slide' && WIRES.ptr) { const p = postNear(WIRES.ptr[0], WIRES.ptr[1], 7), gn = !p && girderNear(WIRES.ptr[0], WIRES.ptr[1], 7); if (p) mark(postTop(p), '#f0b43c'); else if (gn) mark(gn.p, '#f0b43c'); }
  else if ((S.tool === 'cable' || S.tool === 'post') && WIRES.ptr && !WIRES.hover) mark(wireAnchor(WIRES.ptr[0], WIRES.ptr[1], WIRES.gauge), 'rgba(240,180,60,0.85)');
}
// ==========================================================================
// Birds: a little ambience, kept plain. One or two soar over the city,
// mostly gliding, now and then circling up a thermal over a void or a light
// well; a few perch on lips, girders and the gallery and flush when you start
// work near them, then wander back to a perch later. Pixels, not sprites:
// three for a bird in the air, two for one sitting.
// ==========================================================================
const BIRDS = { list: [], perches: [], thermals: [], top: 16 };
// soaring heights are measured from the top of what's built, not from the level limit
function cityTop() { for (let z = NL - 1; z > 0; z--) if (!levelEmpty(z)) return z; return 0; }
function initBirds() {
  const rnd = mulberry32(S.seed * 7 + 3), st = WIRES.stage; BIRDS.list = []; BIRDS.perches = []; BIRDS.thermals = []; BIRDS.top = cityTop();
  if (!st) return;
  for (const v of st.voids || [st]) {
    const V = v.V;
    BIRDS.thermals.push([(V.x0 + V.x1) / 2, (V.y0 + V.y1) / 2]);
    for (let x = V.x0; x < V.x1; x += 2.5) BIRDS.perches.push([x + rnd() * 1.5, V.y0 - 0.15, st.zf]);   // the near lip's edge
    for (let x = V.x0 + 3.5; x < V.x0 + 9.5; x += 2) BIRDS.perches.push([x, V.y1 + 0.85, st.zf]);       // the far balcony
  }
  for (const w of WORLD.wells || []) BIRDS.thermals.push([w.x + (w.s || 1) / 2, w.y + (w.s || 1) / 2]);
  for (const g of WIRES.girders) if (Math.abs(g.a[2] - g.b[2]) < 0.01 && v3.dist(g.a, g.b) > 4) for (let f = 0.15; f < 0.9; f += 0.18) BIRDS.perches.push([lerp(g.a[0], g.b[0], f), lerp(g.a[1], g.b[1], f), g.a[2] + 0.06]);
  for (let x = st.XA + 2; x < st.XB - 2; x += 4) BIRDS.perches.push([x + rnd(), st.YT + 1.85, st.zf]);   // gallery rail
  const taken = new Set();
  for (let k = 0; k < 5 && BIRDS.perches.length; k++) {
    let j = Math.floor(rnd() * BIRDS.perches.length); while (taken.has(j)) j = (j + 1) % BIRDS.perches.length;
    taken.add(j); BIRDS.list.push({ mode: 'perch', p: BIRDS.perches[j].slice(), pj: j, face: rnd() < 0.5 ? 1 : -1, t: rnd() * 10, ph: rnd() * 9 });
  }
  for (let k = 0; k < 2; k++) BIRDS.list.push(newSoarer(rnd));
}
function newSoarer(rnd) {
  rnd = rnd || Math.random;
  return { mode: 'glide', p: [rnd() * W, rnd() * D, BIRDS.top + 3 + rnd() * 4], h: rnd() * 6.28, v: 1.3 + rnd() * 0.5, t: 0, ph: rnd() * 9, flap: 0, alt: BIRDS.top + 3 + rnd() * 4, next: 8 + rnd() * 20 };
}
function birdsAwake() { return S.tod !== 'night' || (LIT.on && LIT.sun !== 'night'); }
function updateBirds(dt) {
  if (!BIRDS.list.length) return;
  const day = birdsAwake();
  for (const b of BIRDS.list) {
    b.t += dt; b.flap = Math.max(0, b.flap - dt);
    if (b.mode === 'perch') {
      if (day && b.t > 25 && Math.random() < dt / 90) takeOff(b, Math.random() * 6.28);   // now and then one just leaves
      continue;
    }
    if (b.mode === 'flee') {                        // a few hard wingbeats up and away
      b.p[0] += Math.cos(b.h) * 3 * dt; b.p[1] += Math.sin(b.h) * 3 * dt; b.p[2] += 1.6 * dt; b.flap = 0.3;
      if (b.t > 2.2) { b.mode = 'glide'; b.t = 0; b.alt = b.p[2] + 1; b.next = 10 + Math.random() * 20; }
      continue;
    }
    if (b.mode === 'land') {                        // glide down onto a free perch
      const q = BIRDS.perches[b.pj], d = v3.sub(q, b.p), L = Math.hypot(d[0], d[1], d[2]);
      if (L < 0.08) { b.mode = 'perch'; b.p = q.slice(); b.t = 0; b.face = Math.random() < 0.5 ? 1 : -1; continue; }
      const sp = Math.min(L, (L < 2 ? 1.2 : 2.2) * dt); for (let k = 0; k < 3; k++) b.p[k] += d[k] / L * sp;
      if (L < 1.2) b.flap = 0.2;
      continue;
    }
    if (b.mode === 'circle') {                      // riding a thermal: a slow climbing spiral
      b.a += b.v / b.R * dt; b.p[0] = b.c[0] + Math.cos(b.a) * b.R; b.p[1] = b.c[1] + Math.sin(b.a) * b.R; b.p[2] += 0.12 * dt; b.h = b.a + Math.PI / 2;
      if (b.t > b.dur) { b.mode = 'glide'; b.t = 0; b.alt = b.p[2]; b.next = 15 + Math.random() * 25; }
      continue;
    }
    // glide: a slowly wandering heading that bends back toward the city when it strays
    const cx = W / 2 - b.p[0], cy = D / 2 - b.p[1], far = Math.hypot(cx, cy) > W * 0.6;
    let turn = Math.sin(b.t * 0.21 + b.ph) * 0.22;
    if (far) { const want = Math.atan2(cy, cx), dh = Math.atan2(Math.sin(want - b.h), Math.cos(want - b.h)); turn += clamp(dh, -0.5, 0.5); }
    b.h += turn * dt;
    b.p[0] += Math.cos(b.h) * b.v * dt; b.p[1] += Math.sin(b.h) * b.v * dt; b.p[2] += clamp(b.alt - b.p[2], -0.3, 0.3) * dt;
    if (Math.random() < dt / 7) b.flap = 0.5 + Math.random() * 0.4;
    b.next -= dt;
    if (b.next < 0 && day) {
      const free = BIRDS.perches.map((_, j) => j).filter(j => !BIRDS.list.some(o => o.pj === j && o.mode !== 'glide'));
      if (Math.random() < 0.35 && free.length && BIRDS.list.filter(o => o.mode === 'perch').length < 5) { b.mode = 'land'; b.pj = free[Math.floor(Math.random() * free.length)]; }
      else if (BIRDS.thermals.length) {
        const c = BIRDS.thermals[Math.floor(Math.random() * BIRDS.thermals.length)];
        b.mode = 'circle'; b.c = c; b.R = 2.5 + Math.random() * 2.5; b.a = Math.atan2(b.p[1] - c[1], b.p[0] - c[0]); b.dur = 18 + Math.random() * 20;
        b.p[2] = Math.min(b.p[2], BIRDS.top + 3);
      }
      b.t = 0; b.next = 12 + Math.random() * 20;
    }
    if (!day && b.p[2] > 0) b.alt = BIRDS.top + 10;          // at night the soarers drift off
  }
}
function takeOff(b, h) { b.mode = 'flee'; b.t = 0; b.h = h; b.pj = -1; b.flap = 0.3; b.v = 1.4; b.ph = Math.random() * 9; }
// work near perched birds flushes them (bx, by: the gesture's point in the view buffer)
function birdsStartle(bx, by) {
  for (const b of BIRDS.list) {
    if (b.mode !== 'perch' && b.mode !== 'land') continue;
    const q = projIso(...b.p), d = Math.hypot(q[0] - bx, q[1] - by);
    if (d < 70) setTimeout(() => takeOff(b, Math.random() * 6.28), d * 6 + Math.random() * 120);
  }
}
const BIRD_GLIDE = [[-1, 0], [0, 0], [1, 0]], BIRD_UP = [[-1, -1], [0, 0], [1, -1]], BIRD_DN = [[-1, 1], [0, 0], [1, 1]];
function drawBirds(ctx) {
  if (!BIRDS.list.length || S.mode !== 'cut') return;
  const cutTop = S.level + HT / LH, cutting = S.level < NL - 1, night = !birdsAwake();
  const body = night ? '#6f7882' : LIT.on && LIT.sun === 'evening' ? '#f2d8b6' : '#f3f0e8', under = night ? '#4a525b' : '#bdb7aa';
  for (const b of BIRDS.list) {
    if (b.mode === 'perch' && cutting && b.p[2] > cutTop) continue;
    const q = projIso(...b.p), X = Math.round(q[0]), Y = Math.round(q[1]);
    WDT.D = depthKey(b.p[0], b.p[1], b.p[2]) + 0.15;
    if (b.mode === 'perch') {
      const bob = (Math.floor(b.t * 1.3 + b.ph) % 7) === 0 ? 1 : 0;   // a peck now and then
      if (wdt(X, Y - 1 + bob)) { ctx.fillStyle = body; ctx.fillRect(X, Y - 1 + bob, 1, 1); }
      if (wdt(X + b.face, Y - 1)) { ctx.fillStyle = body; ctx.fillRect(X + b.face, Y - 1, 1, 1); }
      if (wdt(X, Y)) { ctx.fillStyle = under; ctx.fillRect(X, Y, 1, 1); }
      continue;
    }
    const sh = b.flap > 0 ? ((Math.floor(b.t * 9) & 1) ? BIRD_UP : BIRD_DN) : BIRD_GLIDE;
    for (const [dx, dy] of sh) { if (!wdt(X + dx, Y + dy)) continue; ctx.fillStyle = dx === 0 ? under : body; ctx.fillRect(X + dx, Y + dy, 1, 1); }
  }
}
// ==========================================================================
// Preset environments and save slots. A preset is a recipe run on the
// generated city (same seed, same generator), so it costs no storage; a save
// slot stores the whole state (cells, world notes, wires, view) in this
// browser. Both live in the world menu under the wordmark.
// ==========================================================================
const PRESETS = [
  { id: 'voids', name: 'Four voids', note: 'the default: trunk and branch, bundles, girder bridge, a tangle' },
  { id: 'chasm', name: 'Chasm', note: 'one wide open expanse: a high cliff west, terraces east, a wall north' }
];
const SLOTS = 4;

// ---------- the Chasm ----------
// A wide expanse carved out of the middle of the city down to the old street level, so its
// floor is what's left of the street city: ruins, streets, two pools. West: a sheer cliff of
// old building mass, 12-16 levels, with ledges and recesses in its face. East: terraces that
// step up away from it. North: a mid-height wall with a gallery along its edge. South: the
// generated city as it is. Two megacolumn cores stay standing in the expanse, with a platform
// on pillars and a bridge stub off the cliff.
function buildChasm() {
  const rnd = mulberry32(S.seed * 13 + 5), RI = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const X0 = 15, X1 = 50, Y0 = 11, Y1 = 55;              // the expanse (ends exclusive)
  const inE = (x, y) => x >= X0 && x < X1 && y >= Y0 && y < Y1;
  const solid = (x, y, z) => { const t = cell(x, y, z); return t === T.OLD || t === T.CORE || t === T.LIFT; };
  const oldCell = (x, y, z) => { if (!coreAt(x, y)) setC(x, y, z, T.OLD, RI(0, 3) | (RI(0, 3) << 3)); };
  const clearAbove = (x, y, z) => { for (let k = z; k < NL; k++) if (!coreAt(x, y)) setC(x, y, k, T.EMPTY); };
  const deck = (x, y, z) => { if (coreAt(x, y) || !inb(x, y, z)) return; setC(x, y, z, T.DECK, 0); for (let k = z + 1; k < Math.min(NL, z + 3); k++) if (!solid(x, y, k)) setC(x, y, k, T.EMPTY); };
  // two cores stay as towers in the expanse; the others inside it go (their undercroft stubs stay)
  const inside = WORLD.cores.filter(c => inE(c.x, c.y) || inE(c.x + c.s - 1, c.y + c.s - 1)).sort((a, b) => (a.x + a.y) - (b.x + b.y));
  const keep = new Set(inside.length > 2 ? [inside[0], inside[inside.length - 1]] : inside);
  for (const c of inside) if (!keep.has(c)) for (let z = 3; z < NL; z++) for (let dy = 0; dy < c.s; dy++) for (let dx = 0; dx < c.s; dx++) setC(c.x + dx, c.y + dy, z, T.EMPTY);
  WORLD.cores = WORLD.cores.filter(c => !inside.includes(c) || keep.has(c));
  WORLD.lifts = WORLD.lifts.filter(l => WORLD.cores.includes(l.core));
  // carve down to the street level
  for (let z = 3; z < NL; z++) for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) if (!coreAt(x, y)) setC(x, y, z, T.EMPTY);
  // the floor: the old street city razed unevenly, some lots to the street, some left as broken stubs
  for (const lot of WORLD.lots || []) {
    if (!inE(lot.x, lot.y) || !inE(lot.x + lot.w - 1, lot.y + lot.h - 1)) continue;
    if (rnd() < 0.5) continue;                                             // razed: just its ground floor left
    const top = 3 + Math.min(2, RI(0, lot.hgt));                           // the rest: low broken stubs, the floor stays open
    for (let y = lot.y; y < lot.y + lot.h; y++) for (let x = lot.x; x < lot.x + lot.w; x++) for (let z = 3; z < top; z++) {
      const crumble = (z - 3) / Math.max(1, top - 3) * 0.45;                // the higher, the more is missing
      if (rnd() >= crumble) oldCell(x, y, z);
    }
  }
  for (let k = 0; k < 2; k++) {                                              // a couple of gutted mid-rises
    const w = RI(2, 3), h = RI(2, 3), x0 = RI(X0 + 4, X1 - w - 4), y0 = RI(Y0 + 4, Y1 - h - 4), top = RI(6, 10);
    for (let z = 3; z < top; z++) for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
      const edge = x === x0 || x === x0 + w - 1 || y === y0 || y === y0 + h - 1;
      if (edge && rnd() > 0.12 + (z - 3) * 0.05) oldCell(x, y, z);
    }
    if (rnd() < 0.7) for (let x = x0 - 1; x <= x0 + w; x++) deck(x, y0 + h, RI(4, top - 1));   // a balcony off one side
  }
  for (let k = 0; k < 2; k++) {                                              // pools in the floor
    const w = RI(4, 7), h = RI(3, 6), px = RI(X0 + 3, X1 - w - 3), py = RI(Y0 + 4, Y1 - h - 4);
    for (let y = py; y < py + h; y++) for (let x = px; x < px + w; x++) if (!coreAt(x, y)) { setC(x, y, 2, T.WATER); clearAbove(x, y, 3); }
  }
  // west: the cliff, built in bays along y. Each bay has its own height (now and then one stops
  // well short), and its face steps in and out level by level, so floors overhang and set back.
  for (let y = 0; y < D;) {
    const len = RI(3, 6), H = rnd() < 0.18 ? RI(7, 11) : RI(12, 16);
    let sb = RI(0, 2);
    const back = [];
    for (let z = 3; z <= H; z++) { sb = clamp(sb + (rnd() < 0.35 ? RI(-1, 1) : 0), 0, 3); back[z] = sb; }
    const loggia = rnd() < 0.5 ? RI(5, H - 2) : -1;                        // one level hollowed deep, a street in the cliff
    for (let yy = y; yy < Math.min(D, y + len); yy++) {
      for (let z = 3; z <= H; z++) {
        const face = X0 - 1 - back[z] - (z === loggia ? 3 : 0);
        for (let x = 1; x < X0; x++) { if (x <= face) oldCell(x, yy, z); else if (!coreAt(x, yy)) setC(x, yy, z, T.EMPTY); }
        if (z === loggia) deck(face + 1, yy, z);
      }
      for (let x = 1; x < X0; x++) clearAbove(x, yy, H + 1);
    }
    y += len;
  }
  for (let k = 0; k < 7; k++) {                                              // ledges off the face
    const z = RI(4, 13), y0 = RI(Y0 + 1, Y1 - 9), n = RI(3, 8);
    for (let y = y0; y < y0 + n; y++) { let x = X0 - 1; while (x > 1 && !cell(x, y, z)) x--; deck(x + 1, y, z); }
  }
  // east: terraces stepping up away from the expanse, each band along y a step higher or lower
  const stepOf = y => [0, 1, -1, 0, 1, 0, -1][Math.floor(y / 5) % 7];
  for (let x = X1; x < W; x++) for (let y = 0; y < D; y++) {
    const h = clamp(4 + 2 * Math.floor((x - X1) / 3) + 2 * stepOf(y), 3, 14);
    for (let z = 3; z < h; z++) oldCell(x, y, z); clearAbove(x, y, h);
  }
  for (let k = 0; k < 14; k++) {                                             // gardens and sheds on the steps
    const x = RI(X1, W - 2), y = RI(2, D - 3), h = clamp(4 + 2 * Math.floor((x - X1) / 3) + 2 * stepOf(y), 3, 14);
    if (coreAt(x, y) || h + 1 >= NL) continue;
    if (rnd() < 0.6) { setC(x, y, h, T.TERRACE, 0); if (rnd() < 0.6) setC(x, y, h + 1, T.TREE, RI(0, 3)); }
    else oldCell(x, y, h);
  }
  // north: terraced too, stepping up away from the expanse, with a gallery along its edge
  for (let y = 0; y < Y0; y++) for (let x = X0; x < X1; x++) {
    const h = clamp(6 + 2 * Math.floor((Y0 - 1 - y) / 3) + 2 * [0, 1, 0, -1, 1][Math.floor(x / 6) % 5], 4, 14);
    for (let z = 3; z < h; z++) oldCell(x, y, z); clearAbove(x, y, h);
  }
  for (let x = X0; x < X1; x++) deck(x, Y0, 6);
  // the upper city: a lid over everything but the chasm. Blocks of old building mass from L15
  // up to anywhere between L16 and L27, carried by the megacolumns (raised to meet it, a few
  // as spires) and by thin columns, with light wells punched through. Over the expanse it stays
  // open, the rim overhanging a little here and there on its upper floors, so at midday the
  // chasm is a pool of light and the city under the lid sits in shade.
  const LID = 17, blk = new Map(), ohm = new Map();
  const blockTop = (x, y) => { const k = (x / 6 | 0) * 100 + (y / 6 | 0); if (!blk.has(k)) blk.set(k, rnd() < 0.15 ? LID + RI(1, 3) : RI(21, NL - 3)); return blk.get(k); };
  const oh = (side, k) => { const key = side + k; if (!ohm.has(key)) ohm.set(key, [0, 0, 1, 2][RI(0, 3)]); return ohm.get(key); };
  const opening = (x, y, z) => {
    const up = z >= LID + 2, w = up ? oh('w', y / 5 | 0) : 0, e = up ? oh('e', y / 5 | 0) : 0, n = up ? oh('n', x / 5 | 0) : 0, s = up ? oh('s', x / 5 | 0) : 0;
    return x >= X0 + w && x < X1 - e && y >= Y0 + n && y < Y1 - s;
  };
  const wells = [];
  while (wells.length < 7) { const wx = RI(2, W - 5), wy = RI(2, D - 5); if (!(wx + 3 >= X0 && wx <= X1 && wy + 3 >= Y0 && wy <= Y1)) wells.push([wx, wy, RI(2, 3)]); }
  const inWell = (x, y) => wells.some(([wx, wy, n]) => x >= wx && x < wx + n && y >= wy && y < wy + n);
  for (let y = 0; y < D; y++) for (let x = 0; x < W; x++) {
    if (coreAt(x, y) || inWell(x, y)) continue;
    const top = blockTop(x, y);
    for (let z = LID; z <= top; z++) if (!opening(x, y, z)) oldCell(x, y, z);
  }
  for (const c of WORLD.cores) {                                             // megacolumns rise to meet it
    if (keep.has(c)) continue;
    const top = Math.min(NL - 2, Math.max(c.top, blockTop(c.x, c.y)) + (rnd() < 0.3 ? RI(1, 3) : 0)), lx = c.x + 1, ly = c.y + 1;
    for (let z = c.top + 1; z <= top; z++) for (let dy = 0; dy < c.s; dy++) for (let dx = 0; dx < c.s; dx++)
      setC(c.x + dx, c.y + dy, z, (c.x + dx === lx && c.y + dy === ly) ? T.LIFT : T.CORE, hash3(c.x + dx, c.y + dy, z) & 3);
    c.top = top; const l = WORLD.lifts.find(q => q.core === c); if (l) l.top = top;
  }
  for (let y = 3; y < D; y += 7) for (let x = 3; x < W; x += 7) {             // thin columns where the lid spans open air
    if (opening(x, y, LID) || inWell(x, y) || coreAt(x, y)) continue;
    let z = LID - 1; while (z > 2 && !cell(x, y, z)) z--;
    if (LID - 1 - z >= 2) for (let k = z + 1; k < LID; k++) setC(x, y, k, T.PILLAR, k === z + 1 ? 1 : 0);
  }
  for (let k = 0; k < 24; k++) {                                             // gardens on the lid
    const x = RI(1, W - 2), y = RI(1, D - 2); if (opening(x, y, LID) || coreAt(x, y)) continue;
    let z = NL - 1; while (z > LID && !cell(x, y, z)) z--;
    if (cell(x, y, z) === T.OLD && z + 2 < NL) { setC(x, y, z + 1, T.TERRACE, 0); if (rnd() < 0.5) setC(x, y, z + 2, T.TREE, RI(0, 3)); }
  }
  { const y = Y0 + RI(14, 20); for (let x = X0 - 2; x < X1 + 2; x++) { deck(x, y, 22); deck(x, y + 1, 22); } }   // a crossing high up, under the open sky
  // everywhere: a little erosion, so no mass is a clean block (holes in faces that see the air)
  for (let z = 4; z < NL - 1; z++) for (let y = 1; y < D - 1; y++) for (let x = 1; x < W - 1; x++) {
    if (cell(x, y, z) !== T.OLD || coreAt(x, y)) continue;
    const open = !cell(x + 1, y, z) || !cell(x - 1, y, z) || !cell(x, y + 1, z) || !cell(x, y - 1, z);
    if (open && rnd() < 0.06) setC(x, y, z, T.EMPTY);
  }
  // in the expanse: a platform on pillars, a bridge stub off the cliff, and two high crossings
  // whose shadows fall across the floor
  const px = X0 + RI(11, 15), py = Y0 + RI(17, 21);
  for (let y = py; y < py + 4; y++) for (let x = px; x < px + 5; x++) deck(x, y, 6);
  for (const [x, y] of [[px, py], [px + 4, py], [px, py + 3], [px + 4, py + 3]]) for (let z = 3; z < 6; z++) setC(x, y, z, T.PILLAR, z === 3 ? 1 : 0);
  const yb = Y0 + RI(26, 32);
  for (let x = X0 - 2; x < X0 + 9; x++) { deck(x, yb, 10); deck(x, yb + 1, 10); }
  for (const [y, z, x1] of [[Y0 + RI(6, 10), 13, X1 - RI(0, 6)], [Y0 + RI(34, 38), 12, X0 + RI(16, 22)]]) for (let x = X0 - 2; x < x1; x++) { deck(x, y, z); deck(x, y + 1, z); }
  computeLight(); computeFill();
  WORLD.paths = WORLD.paths.filter(p => p.cells.every(q => cell(q.x, q.y, p.z)));
  const V = { x0: X0, y0: Y0, x1: X1, y1: Y1 };
  return { V, voids: [{ V }], view: LID - 1, focus: [(X0 + X1) / 2, (Y0 + Y1) / 2, 4], zf: 2.25, LT: 10, LW: 6, LE: 10, YT: Y0 - 1, XA: X0, XB: X1 - 1, XO: X0 };
}

// ---------- presets ----------
function resetWorldState() {
  JOBS = []; DRONES = []; PUFFS = []; S.pins = []; renderChips(); hideCard(); agentReset(); setFloor(-1);
  UNDO.past = []; UNDO.future = [];
}
function loadPreset(id) {
  generate(S.seed); $('seedv').textContent = S.seed;
  resetWorldState();
  if (id === 'chasm') { clearWires(); WIRES.stage = buildChasm(); initBirds(); }
  else seedWires();
  initLife(); markAllDirty(); skyDirty = true; stripDirty = true;
  setLevel(WIRES.stage.view, { silent: true, snap: true }); centerOn(...WIRES.stage.focus);
  S.preset = id;
  log('sys', `Loaded preset · ${PRESETS.find(p => p.id === id).name} · seed ${S.seed}`, 'sys');
}

// ---------- save slots ----------
function u8ToB64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
function b64ToU8(b) { const s = atob(b), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
const r3 = v => Math.round(v * 1000) / 1000;
function saveState(name) {
  const sn = snapWires();
  return {
    v: 1, name, at: Date.now(), seed: S.seed, preset: S.preset || 'voids',
    cells: u8ToB64(cells), vars: u8ToB64(vars), flags: u8ToB64(flags),
    world: Object.assign({}, WORLD, { fill: Array.from(WORLD.fill), lifts: WORLD.lifts.map(l => Object.assign({}, l, { core: l.core && l.core.name })) }),
    stage: WIRES.stage,
    wires: Object.assign({}, sn, { cables: sn.cables.map(c => Object.assign({}, c, { X: Array.from(c.X, r3), W: Array.from(c.W, r3) })) }),
    view: { level: S.level, cam: [S.cam.x, S.cam.y], zoom: S.zoom, rot: S.rot, sun: LIT.sun, lit: LIT.on }
  };
}
function restoreState(d) {
  cells.set(b64ToU8(d.cells)); vars.set(b64ToU8(d.vars)); flags.set(b64ToU8(d.flags));
  const w = d.world; WORLD = Object.assign({}, w, { fill: new Float32Array(w.fill) });
  WORLD.lifts = w.lifts.map(l => Object.assign({}, l, { core: WORLD.cores.find(c => c.name === l.core) || null }));
  S.seed = d.seed; S.preset = d.preset; $('seedv').textContent = S.seed;
  computeLight(); computeFill(); resetWorldState();
  clearWires();
  loadWires(Object.assign({}, d.wires, { cables: d.wires.cables.map(c => Object.assign({}, c, { X: new Float32Array(c.X), W: new Float32Array(c.W) })) }));
  WIRES.stage = d.stage;
  initLife(); initBirds();
  if (d.view.rot !== S.rot) { S.rot = d.view.rot; }
  LIT.sun = d.view.sun || LIT.sun; LIT.on = d.view.lit !== false;
  SPR = new Map(); GHOST.clear(); podSprites(); markAllDirty(); skyDirty = true; stripDirty = true;
  if (LIT.on) setLightTime(LIT.sun);
  $('bLight').setAttribute('aria-pressed', LIT.on);
  setZoom(d.view.zoom); S.cam.x = d.view.cam[0]; S.cam.y = d.view.cam[1]; S.camTarget = null;
  setLevel(d.view.level, { silent: true, snap: true });
}
const slotKey = k => 'stratum.slot.' + k;
function slotInfo(k) { try { const s = localStorage.getItem(slotKey(k)); if (!s) return null; const d = JSON.parse(s); return { name: d.name, at: d.at, cables: d.wires.cables.length, preset: d.preset }; } catch (e) { return null; } }
function saveSlot(k) {
  const pre = PRESETS.find(p => p.id === S.preset), d = saveState((pre ? pre.name : 'World') + ' · seed ' + S.seed);
  try { localStorage.setItem(slotKey(k), JSON.stringify(d)); toast(`Saved to slot ${k}`); }
  catch (e) { toast('Could not save: this browser\'s storage is full or unavailable'); }
  syncWorldMenu();
}
function loadSlot(k) {
  let d = null; try { d = JSON.parse(localStorage.getItem(slotKey(k))); } catch (e) { /* unreadable slot: treated as empty */ }
  if (!d) { toast(`Slot ${k} is empty`); return; }
  restoreState(d); toast(`Loaded slot ${k}`); log('sys', `Loaded slot ${k} · ${d.name}`, 'sys');
}

// ---------- the world menu (click the wordmark text): the sheet, presets, save slots, new seed, interface, keys ----------
function setupWorldMenu() {
  const pop = document.createElement('div'); pop.id = 'worldPop'; pop.className = 'popm pn'; pop.hidden = true;
  document.body.appendChild(pop);
  const name = $('wmText');
  const open = () => { const r = name.getBoundingClientRect(); syncWorldMenu(); pop.hidden = false; pop.style.left = clamp(r.left, 4, innerWidth - pop.offsetWidth - 4) + 'px'; pop.style.top = r.bottom + 6 + 'px'; name.setAttribute('aria-expanded', 'true'); };
  const close = () => { pop.hidden = true; name.setAttribute('aria-expanded', 'false'); };
  name.addEventListener('click', () => pop.hidden ? open() : close());
  pop.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.preset) { close(); loadPreset(b.dataset.preset); }
    else if (b.dataset.save) saveSlot(+b.dataset.save);
    else if (b.dataset.load) { close(); loadSlot(+b.dataset.load); }
    else if (b.dataset.seed) { close(); S.seed += 1; loadPreset(S.preset || 'voids'); }
    else if (b.dataset.tone) { setUiTone(b.dataset.tone === 'dark'); syncWorldMenu(); }
    else if (b.dataset.keys) { close(); openKeys(); }
    else return;
    sfx.click();
  });
  document.addEventListener('pointerdown', e => { if (!pop.hidden && !pop.contains(e.target) && !name.contains(e.target)) close(); });
}
function syncWorldMenu() {
  const pop = $('worldPop'); if (!pop) return;
  const when = t => { const d = new Date(t); return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + d.toTimeString().slice(0, 5); };
  const dark = UICFG.MT === 10 || UICFG.MT === 16;
  pop.innerHTML = `<div class="lp-h ttl"><span>Spall</span><span class="lp-dim">wires study · sheet 02 · seed ${S.seed}</span></div>
    <div class="lp-sub">Presets <span class="lp-dim">replace the scene</span></div>` +
    PRESETS.map(p => `<div class="lp-row"><button type="button" class="btn" data-preset="${p.id}" aria-pressed="${S.preset === p.id}">${p.name}</button><span class="lp-note">${p.note}</span></div>`).join('') +
    `<div class="lp-sub">Save slots <span class="lp-dim">in this browser</span></div>` +
    Array.from({ length: SLOTS }, (_, j) => { const k = j + 1, s = slotInfo(k);
      return `<div class="lp-row"><span class="lp-slot">${k}</span><span class="lp-note">${s ? `${s.name} · ${s.cables} cables · ${when(s.at)}` : 'empty'}</span><span class="lp-btns"><button type="button" class="btn" data-save="${k}">Save</button>${s ? `<button type="button" class="btn" data-load="${k}">Load</button>` : ''}</span></div>`; }).join('') +
    `<div class="lp-row"><button type="button" class="btn" data-seed="1">New seed</button><span class="lp-note">regenerate the current preset</span></div>
    <div class="lp-sub">Interface</div>
    <div class="lp-row"><span class="sgc" role="radiogroup" aria-label="Interface tone" style="--n:2;--i:${dark ? 1 : 0}"><button type="button" class="${dark ? '' : 'on'}" data-tone="light" role="radio" aria-checked="${!dark}">Light</button><button type="button" class="${dark ? 'on' : ''}" data-tone="dark" role="radio" aria-checked="${dark}">Dark</button><i class="ind"></i></span><span class="lp-note">the chrome only; the scene keeps its time of day</span></div>
    <div class="lp-row"><button type="button" class="btn" data-keys="1">Keys</button><span class="lp-note">every shortcut</span></div>`;
}
// ==========================================================================
// Embodied agent "claude": a visible cursor that surveys (gaze + sightline),
// proposes (ghost + card), then narrates a legible, ordered build.
// ==========================================================================
const AGENT = { x: 22, y: 20, z: 14, tx: 22, ty: 20, tz: 14, state: 'idle', timer: 2.5, cands: [], ci: 0, job: null, gaze: null,
  looking: false, lookT: 0, focus: null, requests: [], rejected: [], paused: false, level: 12, speechT: 0, pending: null, last: null, screen: null };
const pad2 = n => String(n).padStart(2, '0');
function agentReset() {
  Object.assign(AGENT, { x: 22, y: 20, z: 14, tx: 22, ty: 20, tz: 14, state: 'idle', timer: 2.5, cands: [], ci: 0, job: null, gaze: null, looking: false, focus: null, requests: [], rejected: [], pending: null, last: null, speechT: 0 });
  setAgentState('idle', 'idle');
}
function agentSay(text, dur) { AGENT.speechT = S.time + (dur || 5); const b = $('bubble'); if (b) b.textContent = text; }
function setAgentState(s, label) { AGENT.state = s; const e = $('agentState'); if (e) e.textContent = label || s; }
function moveAgent(x, y, z) { AGENT.tx = x; AGENT.ty = y; AGENT.tz = z; }
function siteScore(x, y, z) {
  if (x < 1 || y < 1 || x > W - 3 || y > D - 3 || z < G + 2 || z + 3 >= NL) return null;
  for (let dz = 0; dz < 3; dz++) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) if (!isEmpty(x + dx, y + dy, z + dz)) return null;
  let sup = 0;
  for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) if (supportAt(x + dx, y + dy, z)) sup++;
  if (sup < 2) return null;
  const br = findBridge(x, y, z + 1, 2, 2);
  if (!br || br.cells.length > 6) return null;
  let lt = 0;
  for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) lt += light[idx(x + dx, y + dy, z + 1)];
  lt /= 4;
  const fill = Math.max(WORLD.fill[z], WORLD.fill[z + 1], WORLD.fill[z + 2]);
  return { x, y, z, br, light: lt, fill, sup, score: lt * 2 - Math.max(0, fill - 0.42) * 5 - br.cells.length * 0.07 + sup * 0.05 + rr() * 0.1 };
}
function findSites(n, near) {
  const out = [];
  for (let k = 0; k < 900 && out.length < 24; k++) {
    let x, y, z;
    if (near) { x = near.x + Math.floor(rr() * 11) - 5; y = near.y + Math.floor(rr() * 11) - 5; z = near.z + Math.floor(rr() * 2); }
    else { x = 1 + Math.floor(rr() * (W - 3)); y = 1 + Math.floor(rr() * (D - 3)); z = [7, 8, 10, 11, 13][Math.floor(rr() * 5)]; }
    const s = siteScore(x, y, z);
    if (!s) continue;
    if (!near && AGENT.rejected.some(r => Math.abs(r.x - x) < 4 && Math.abs(r.y - y) < 4 && Math.abs(r.z - z) < 2)) continue;
    if (JOBS.some(j => (j.status === 'proposed' || j.status === 'building') && Math.abs(j.site.x - x) < 4 && Math.abs(j.site.y - y) < 4 && Math.abs(j.site.z - z) < 4)) continue;
    out.push(s);
  }
  out.sort((a, b) => b.score - a.score);
  const pick = [];
  for (const s of out) { if (pick.every(p => Math.abs(p.x - s.x) + Math.abs(p.y - s.y) > 6)) pick.push(s); if (pick.length >= n) break; }
  return pick;
}
const siteNote = s => `${lvCode(s.z)} (${s.x},${s.y}): daylight ${Math.round(s.light * 100)}%, fill ${Math.round(s.fill * 100)}%${s.fill > 0.5 ? ' (over cap)' : ''}, ${s.br.cells.length ? s.br.cells.length + '-cell bridge to ' + s.br.target : 'abuts ' + s.br.target}`;
function startSurvey() {
  const c = findSites(3);
  if (!c.length) { agentSay('No free bay with support and a bridge route right now. Waiting.', 3); AGENT.timer = 6; return; }
  AGENT.cands = c; AGENT.ci = 0;
  setAgentState('survey', 'surveying');
  agentSay(`Surveying ${c.length} bays for a capsule stack (light, fill cap, bridge).`, 3);
  log('claude', `Survey started: ${c.length} candidate bays`, 'sys');
  goLook(c[0]);
}
function goLook(s) { moveAgent(s.x + 2.4, s.y + 0.5, s.z + 3.2); AGENT.looking = false; AGENT.gaze = null; AGENT.level = s.z; }
function planFor(kind, pin) {
  const p = pin || { x: 24, y: 24, z: S.level, t: 0 };
  const zUp = p.t ? p.z + 1 : p.z;
  if (kind === 'stack') {
    const c = findSites(1, { x: p.x, y: p.y, z: Math.max(G + 2, zUp) });
    if (!c.length) return null;
    const s = c[0];
    return { kind, site: s, pieces: stackPieces(s.x, s.y, s.z, s.br), name: 'Capsule stack 2×2×3 + sky bridge', summary: `12 frames, 12 capsules, ${s.br.cells.length}-cell bridge to ${s.br.target}, roof garden`, note: siteNote(s) };
  }
  if (kind === 'garden') {
    let best = null;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const x = clamp(p.x - 1 + dx, 0, W - 3), y = clamp(p.y - 1 + dy, 0, D - 3);
      let free = 0, sup = 0;
      for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) { if (isEmpty(x + i, y + j, zUp)) free++; if (supportAt(x + i, y + j, zUp)) sup++; }
      const d = Math.abs(dx) + Math.abs(dy);
      if (free === 9 && sup >= 4 && (!best || d < best.d)) best = { x, y, d, sup };
    }
    if (!best) return null;
    const P = gardenPieces(best.x, best.y, zUp);
    return { kind, site: { x: best.x, y: best.y, z: zUp }, pieces: P, name: 'Garden terrace 3×3', summary: `${P.length} parts: slabs first, then 4 trees and a lamp`, note: `${lvCode(zUp)} (${best.x},${best.y}): ${best.d ? best.d + ' cells from your pin, ' : ''}${best.sup}/9 bays have structure below` };
  }
  if (kind === 'bridge') {
    const br = findBridge(p.x, p.y, p.z, 1, 1);
    if (!br || !br.cells.length) return null;
    const P = br.cells.map(c => ({ x: c.x, y: c.y, z: c.z, t: T.DECK, v: c.axis, ph: 0, lab: 'sky-bridge deck' }));
    return { kind, site: { x: p.x, y: p.y, z: p.z }, pieces: P, name: 'Sky bridge to ' + br.target, summary: `${P.length} deck segments at ${lvCode(p.z)}`, note: `${lvCode(p.z)}: shortest clear run from your pin is ${P.length} cells to ${br.target}` };
  }
  if (kind === 'well') {
    const x = clamp(p.x, 0, W - 2), y = clamp(p.y, 0, D - 2), P = wellPieces(x, y, p.z);
    const rem = P.filter(q => q.op === 'remove').length;
    return { kind, site: { x, y, z: p.z }, pieces: P, name: 'Light well 2×2', summary: `remove ${rem} parts above, pool at ${lvCode(p.z)}`, note: `${lvCode(p.z)} (${x},${y}): daylight here is ${Math.round(light[idx(x, y, p.z)] * 100)}%` };
  }
  return null;
}
function startRequest() {
  const r = AGENT.requests.shift();
  if (!r) return;
  AGENT.pending = r;
  setAgentState('look', 'reading your pin');
  const s = r.site;
  moveAgent(s.x + 2.4, s.y + 0.5, s.z + 2.2); AGENT.level = s.z; AGENT.looking = false; AGENT.gaze = null;
}
function proposeSite(site, kind, pieces, name, note) {
  if (S.propMute) { AGENT.job = null; setAgentState('idle', 'proposals paused'); return; }   // muted: nothing pops up
  const j = makeJob('claude', kind, pieces, { x: site.x, y: site.y, z: site.z }, name);
  AGENT.job = j; AGENT.last = { site, note, name };
  setAgentState('propose', 'awaiting approval');
  const xs = pieces.map(p => p.x), ys = pieces.map(p => p.y), zs = pieces.map(p => p.z);
  AGENT.gaze = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs) + 1, y1: Math.max(...ys) + 1, z0: Math.min(...zs), z1: Math.max(...zs) + 1 };
  showCard(j);
  agentSay(`Proposal ${pad2(j.no)}: ${name} at ${lvCode(site.z)}. Ghost is down — approve?`, 9);
  log('claude', `Proposed ${name} at (${site.x},${site.y},${lvCode(site.z)}) · ¤${j.m.cost} · +${j.m.res} residents`, 'sys');
  sfx.ghost();
}
function phaseSpeech(j, ph) {
  if (j.owner !== 'claude') return;
  const n = t => j.pieces.filter(p => p.ph === ph && p.t === t && p.state !== 'blocked').length;
  if (ph === 0) {
    const fr = n(T.FRAME), dk = n(T.DECK), rm = j.pieces.filter(p => p.op === 'remove').length;
    agentSay(rm ? `Clearing first: removing ${rm} parts from the shaft, top down.` : `Structure first: ${fr ? fr + ' support frames' : ''}${fr && dk ? ' + ' : ''}${dk ? dk + ' deck segments' : ''}${n(T.TERRACE) ? n(T.TERRACE) + ' terrace slabs' : ''}.`, 6);
  } else if (ph === 1) agentSay(`Infill: plugging ${n(T.CAPSULE)} capsules into the frame.`, 6);
  else agentSay('Fit-out: planting, pools and lamps last.', 5);
}
function agentApproved(j) { setAgentState('build', 'building'); AGENT.level = j.site.z; }
function agentRejected(j) {
  AGENT.rejected.push(j.site); AGENT.job = null; AGENT.gaze = null;
  agentSay("Understood. I'll look somewhere else.", 3);
  setAgentState('idle', 'idle'); AGENT.timer = 1.6;
}
function agentJobDone(j) {
  const res = j.pieces.filter(p => p.t === T.CAPSULE && p.state === 'placed').length;
  const br = j.pieces.filter(p => p.lab === 'sky-bridge deck' && p.state === 'placed').length;
  agentSay(res ? `Done: ${res} households housed${br ? ', bridge linked (' + br + ' cells)' : ''}. Roof garden planted.` : `Done: ${j.name}.`, 5);
  setAgentState('done', 'done'); AGENT.job = null; AGENT.focus = null; AGENT.gaze = null; AGENT.timer = 4;
}
function explainLast() {
  const L = AGENT.last;
  if (!L) return 'No proposal yet. I rank bays by daylight reaching them, the 50% fill cap per level, and how short a bridge to a core would be.';
  return `${L.name}: ${L.note}. I prefer bays that keep level fill under ~50% (light and air) and need the shortest bridge to a core.`;
}
function chatRespond(text) {
  const s = text.toLowerCase(), pin = S.pins[S.pins.length - 1] || null;
  if (/\b(why|explain|reason)\b/.test(s)) return explainLast();
  if (/\b(stop|pause|hold)\b/.test(s)) { AGENT.paused = true; return 'Pausing after the current piece. Say "resume" to carry on surveying.'; }
  if (/\b(resume|continue|go on)\b/.test(s)) { AGENT.paused = false; return 'Resuming the survey.'; }
  let kind = null;
  if (/garden|tree|green|park|plant/.test(s)) kind = 'garden';
  else if (/bridge|connect|link|cross/.test(s)) kind = 'bridge';
  else if (/light|well|dark|sun|void|air/.test(s)) kind = 'well';
  else if (/stack|capsule|hous|home|resid|build|unit|flat/.test(s)) kind = 'stack';
  if (!kind) return 'I can propose a capsule stack, a sky bridge, a garden terrace or a light well. Pin a spot (Alt-click or Point), then ask.';
  if (!pin && kind !== 'stack') return 'Pin a spot first (Alt-click or the Point tool) so I know where you mean.';
  const plan = planFor(kind, pin);
  const where = pin ? `${TI[pin.t].name} @ (${pin.x},${pin.y},${lvCode(pin.z)})` : 'somewhere near the middle';
  if (!plan) return `I checked ${where}: no room for that without demolishing supports. Try another pin?`;
  AGENT.requests.push(plan);
  if (AGENT.state === 'propose' && AGENT.job) { rejectQuiet(AGENT.job); }
  if (AGENT.state !== 'build' && AGENT.state !== 'look') startRequest();
  return `Plan for ${where}: ${plan.name}: ${plan.summary}. ${AGENT.state === 'build' ? 'After the current build I' : 'I'}'ll put the ghost down for you to approve.`;
}
// claude can be switched off: it stops where it is, an open proposal is withdrawn, and the
// log, chat, cursor, bubbles and pins leave the screen (approved builds still finish)
function setAgentOn(v) {
  S.agentOn = v == null ? !S.agentOn : v;
  WIRES.agentOff = !S.agentOn;
  document.body.classList.toggle('noagent', !S.agentOn);
  $('bAgent').setAttribute('aria-pressed', S.agentOn);
  if (!S.agentOn) { AGENT.screen = null; if (CARDJOB) rejectQuiet(CARDJOB); if (S.tool === 'point') setTool('inspect'); }
  try { localStorage.setItem('stratum.agent', S.agentOn ? '1' : '0'); } catch (e) { /* storage unavailable: the switch just isn't remembered */ }
  resize();
}
function rejectQuiet(j) { j.status = 'rejected'; hideCard(); AGENT.job = null; }
function agentUpdate(dt) {
  const A = AGENT, k = REDUCED ? 1 : 1 - Math.exp(-dt * 3.4);
  A.x += (A.tx - A.x) * k; A.y += (A.ty - A.y) * k; A.z += (A.tz - A.z) * k;
  const arrived = Math.hypot(A.tx - A.x, A.ty - A.y) < 0.25 && Math.abs(A.tz - A.z) < 0.12;
  const lookDur = REDUCED ? 0.8 : 1.7;
  switch (A.state) {
    case 'idle': case 'done':
      A.timer -= dt;
      if (A.requests.length) startRequest();
      else if (A.timer <= 0 && !A.paused) { if (A.state === 'done') { setAgentState('idle', 'idle'); A.timer = 2.5; } else startSurvey(); }
      break;
    case 'survey': {
      if (A.requests.length) { startRequest(); break; }
      const c = A.cands[A.ci];
      if (!c) { setAgentState('idle', 'idle'); A.timer = 2; break; }
      if (arrived && !A.looking) {
        A.looking = true; A.lookT = S.time + lookDur;
        A.gaze = { x0: c.x, y0: c.y, x1: c.x + 2, y1: c.y + 2, z0: c.z, z1: c.z + 3 };
        agentSay('Looking at ' + siteNote(c), lookDur + 0.6);
        log('claude', 'Looked at ' + siteNote(c), 'sys');
        sfx.look();
      } else if (A.looking && S.time >= A.lookT) {
        A.looking = false; A.ci++;
        if (A.ci < A.cands.length) goLook(A.cands[A.ci]);
        else {
          const best = A.cands.slice().sort((a, b) => b.score - a.score)[0];
          if (siteScore(best.x, best.y, best.z)) proposeSite(best, 'stack', stackPieces(best.x, best.y, best.z, best.br), 'Capsule stack 2×2×3 + sky bridge', siteNote(best));
          else { setAgentState('idle', 'idle'); A.timer = 1; }
        }
      }
      break;
    }
    case 'look': {
      const r = A.pending;
      if (!r) { setAgentState('idle', 'idle'); break; }
      if (arrived && !A.looking) {
        A.looking = true; A.lookT = S.time + lookDur;
        const xs = r.pieces.map(p => p.x), ys = r.pieces.map(p => p.y), zs = r.pieces.map(p => p.z);
        A.gaze = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs) + 1, y1: Math.max(...ys) + 1, z0: Math.min(...zs), z1: Math.max(...zs) + 1 };
        agentSay('Checking your pin: ' + r.note, lookDur + 0.6); sfx.look();
      } else if (A.looking && S.time >= A.lookT) {
        A.looking = false; A.pending = null;
        proposeSite(r.site, r.kind, r.pieces, r.name, r.note);
      }
      break;
    }
    case 'propose':
      if (!A.job || A.job.status === 'rejected') { setAgentState('idle', 'idle'); A.timer = 1.5; }
      break;
    case 'build':
      if (A.focus) {
        const f = A.focus;
        moveAgent(f.x + 1.6, f.y + 0.2, f.z + 1.4);
        A.gaze = { x0: f.x, y0: f.y, x1: f.x + 1, y1: f.y + 1, z0: f.z, z1: f.z + 1 };
        A.level = f.z;
      }
      break;
  }
}

// ---------------------------------------------------------------- drawing
const ARROW = ['X.........', 'XX........', 'XWX.......', 'XWWX......', 'XWWWX.....', 'XWWWWX....', 'XWWWWWX...', 'XWWWWWWX..', 'XWWWWWWWX.', 'XWWWWXXXXX', 'XWXXWWX...', 'XX..XWWX..', 'X....XWX..', '.....XX...'];
let ARROWC = null;
function arrowSprite() {
  const c = mk(10, 14), g = c.getContext('2d');
  ARROW.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === 'X') R_(g, x, y, 1, 1, '#2a0f06'); if (ch === 'W') R_(g, x, y, 1, 1, x <= 2 ? '#ffb08f' : '#ff7a52'); }));
  return c;
}
function gazeBoxIso(ctx, gz, col, eo) {
  isoQuad(ctx, gz.x0, gz.y0, gz.x1, gz.y1, gz.z0 + 0.02, col, [3, 2], eo);
  isoQuad(ctx, gz.x0, gz.y0, gz.x1, gz.y1, gz.z1, col, [1, 2], eo);
  for (const [a, b] of [[gz.x0, gz.y1], [gz.x1, gz.y1], [gz.x1, gz.y0]]) { const p = projIso(a, b, gz.z0), q = projIso(a, b, gz.z1); pline(ctx, p[0], p[1], q[0], q[1], col, [1, 2]); }
}
function drawAgentIso(ctx, t, sliced, ex) {
  if (WIRES.agentOff) return;
  if (!ARROWC) ARROWC = arrowSprite();
  const A = AGENT, bob = REDUCED ? 0 : Math.sin(t * 2.3) * 0.05;
  const [bx, by] = projIso(A.x, A.y, A.z + bob);
  const off = sliced && A.level > S.level;
  if (A.gaze) {
    const gz = A.gaze, gAbove = sliced && gz.z0 > S.level;
    const col = gAbove ? 'rgba(255,122,82,0.4)' : '#ff7a52';
    gazeBoxIso(ctx, gz, col, ex ? explodeOff(gz.z0) : 0);
    const c = projIso((gz.x0 + gz.x1) / 2, (gz.y0 + gz.y1) / 2, gz.z0 + 0.5);
    pline(ctx, bx, by, c[0], c[1], gAbove ? 'rgba(255,122,82,0.35)' : 'rgba(255,122,82,0.85)', [2, 2]);
    if (!REDUCED && Math.sin(t * 9) > 0) R_(ctx, Math.round(c[0]) - 1, Math.round(c[1]) - 1, 3, 3, '#ff7a52');
  }
  let X = Math.round(bx), Y = Math.round(by);
  const xl = Math.round(S.safeL / S.zoom) + 4, xr = Math.round((S.cssW - S.safeR) / S.zoom) - 70;
  const inView = X >= xl - 4 && Y >= 0 && X < xr + 60 && Y < S.bh - 20;
  if (!inView) { X = clamp(X, xl, Math.max(xl, xr)); Y = clamp(Y, 4, S.bh - 34); }
  ctx.globalAlpha = off ? 0.5 : 1;
  ctx.drawImage(ARROWC, X, Y);
  ctx.globalAlpha = 1;
  if (!inView) plate(ctx, 'OFF VIEW ' + lvCode(A.level), X + 12, Y, '#ff7a52', '#2a0f06');
  else if (sliced && A.level !== S.level) plate(ctx, (A.level > S.level ? '↑ ' : '↓ ') + lvCode(A.level), X + 12, Y + 12, '#ff7a52', '#2a0f06');
  A.screen = [X, Y, inView, off || (sliced && A.level !== S.level)];
}
function drawAgentPlan(ctx, t) {
  if (WIRES.agentOff) return;
  if (!ARROWC) ARROWC = arrowSprite();
  const A = AGENT, [bx, by] = projPlan(A.x, A.y), off = A.level !== S.level;
  if (A.gaze && A.gaze.z0 <= S.level && A.gaze.z1 > S.level) {
    const a = projPlan(A.gaze.x0, A.gaze.y0), b = projPlan(A.gaze.x1, A.gaze.y1);
    const x0 = Math.min(a[0], b[0]), y0 = Math.min(a[1], b[1]), x1 = Math.max(a[0], b[0]), y1 = Math.max(a[1], b[1]);
    for (let x = x0; x < x1; x += 2) { R_(ctx, x, y0, 1, 1, '#d4502a'); R_(ctx, x, y1 - 1, 1, 1, '#d4502a'); }
    for (let y = y0; y < y1; y += 2) { R_(ctx, x0, y, 1, 1, '#d4502a'); R_(ctx, x1 - 1, y, 1, 1, '#d4502a'); }
  }
  const X = Math.round(bx), Y = Math.round(by);
  ctx.globalAlpha = off ? 0.55 : 1; ctx.drawImage(ARROWC, X, Y); ctx.globalAlpha = 1;
  if (off) plate(ctx, (A.level > S.level ? '↑ ' : '↓ ') + lvCode(A.level), X + 12, Y + 12, '#ff7a52', '#2a0f06');
  A.screen = [X, Y, true, off];
}
function drawAgentSec(ctx, t) {
  if (WIRES.agentOff) return;
  if (!ARROWC) ARROWC = arrowSprite();
  const A = AGENT, [bx, by] = projSec(A.x, A.y, A.z), d = Math.abs(secDepth(A.x, A.y));
  if (A.gaze) {
    const a = projSec(A.gaze.x0, A.gaze.y0, A.gaze.z1), b = projSec(A.gaze.x1, A.gaze.y1, A.gaze.z0);
    const x0 = Math.round(Math.min(a[0], b[0])), x1 = Math.round(Math.max(a[0], b[0])), y0 = Math.round(a[1]), y1 = Math.round(b[1]);
    const col = d < 3 ? '#ff7a52' : 'rgba(255,122,82,0.45)';
    for (let x = x0; x < x1; x += 2) { R_(ctx, x, y0, 1, 1, col); R_(ctx, x, y1 - 1, 1, 1, col); }
    for (let y = y0; y < y1; y += 2) { R_(ctx, x0, y, 1, 1, col); R_(ctx, x1 - 1, y, 1, 1, col); }
  }
  const X = Math.round(bx), Y = Math.round(by);
  ctx.globalAlpha = d < 3 ? 1 : 0.5; ctx.drawImage(ARROWC, X, Y); ctx.globalAlpha = 1;
  if (d >= 3) plate(ctx, (secDepth(A.x, A.y) > 0 ? 'BEHIND ' : 'IN FRONT ') + Math.round(d), X + 12, Y + 12, '#ff7a52', '#2a0f06');
  A.screen = [X, Y, true, d >= 3];
}
// ==========================================================================
// Demolish: the quick way to clear room. Click a module on the active level
// to remove it, or drag a box to clear an area; "to the sky" also takes
// everything above the footprint. In the full stack view it peels the topmost
// module of each column. Cores, lifts and the ground stay. What will go is
// shown in red before you let go; it goes at once, in a puff of dust, and
// Cmd-Z puts it back.
// ==========================================================================
const DEMO = { box: null, sky: false };
const DEMO_KEEP = new Set([T.CORE, T.LIFT, T.EARTH, T.ROCK]);
const demoOK = t => t && !DEMO_KEEP.has(t);
// the cells a box (inclusive cell coords) would remove
function demoTargets(x0, y0, x1, y1) {
  const out = [], L = S.level, full = L >= NL - 1;
  for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
    if (!inb(x, y, 0)) continue;
    if (full) { for (let z = NL - 1; z >= G; z--) { const t = cell(x, y, z); if (t) { if (demoOK(t)) out.push([x, y, z]); break; } } continue; }
    for (let z = L; z < (DEMO.sky ? NL : L + 1); z++) if (demoOK(cell(x, y, z))) out.push([x, y, z]);
  }
  return out;
}
function demoBoxFromHover() { const h = S.hover; return h && S.mode === 'cut' ? { x0: h.x, y0: h.y, x1: h.x, y1: h.y } : null; }
function demoStart() { DEMO.box = demoBoxFromHover(); return !!DEMO.box; }
function demoMove(h) { if (DEMO.box && h) { DEMO.box.x1 = h.x; DEMO.box.y1 = h.y; } }
function demoFinish() {
  const b = DEMO.box; DEMO.box = null; if (!b) return;
  const tg = demoTargets(b.x0, b.y0, b.x1, b.y1);
  if (!tg.length) { toast('Nothing to demolish there (cores and ground stay)'); return; }
  const undo = { cells: [], wires: snapWires() }, zs = new Set();
  for (const [x, y, z] of tg) {
    const i = idx(x, y, z); undo.cells.push([i, cells[i], vars[i], flags[i]]);
    cells[i] = 0; vars[i] = 0; flags[i] = 0; zs.add(z);
    if (rr() < 0.5) for (let k = 0; k < 3; k++) PUFFS.push({ x: x + 0.5, y: y + 0.5, z: z + 0.3, vx: (rr() - 0.5) * 1.4, vy: (rr() - 0.5) * 1.4, life: 0, max: 0.5 + rr() * 0.4, col: '#b8ac98' });
  }
  UNDO.past.push(undo); if (UNDO.past.length > 60) UNDO.past.shift(); UNDO.future = [];
  worldChanged(zs);
  sfx.click();
  log('you', `Demolished ${tg.length} module${tg.length > 1 ? 's' : ''}${DEMO.sky ? ' to the sky' : ''}`, 'sys');
}
// after cells change: rebuild what shows them, relight, let cables fall where floors went
function worldChanged(zs) {
  for (const z of zs) for (const k of [z - 1, z, z + 1]) if (k >= 0 && k < NL) markDirty(k);
  computeLight(); computeFill();
  const n = WORLD.paths.length;
  WORLD.paths = WORLD.paths.filter(p => p.cells.every(q => cell(q.x, q.y, p.z)));
  if (WORLD.paths.length !== n) initLife();
  WIRES.cables.forEach(wake);
  skyDirty = true; stripDirty = true;
}
// an undo entry that changed cells: put them back (and hand back the inverse)
function undoCells(e) {
  const inv = { cells: e.cells.map(([i]) => [i, cells[i], vars[i], flags[i]]), wires: snapWires() }, zs = new Set();
  for (const [i, t, v, f] of e.cells) { cells[i] = t; vars[i] = v; flags[i] = f; zs.add(Math.floor(i / (W * D))); }
  worldChanged(zs);
  return inv;
}
// the preview: every module that would go, filled red; the box outlined
function drawDemolish(ctx, ex) {
  if (ex || S.tool !== 'demolish' || S.mode !== 'cut') return;
  const b = DEMO.box || demoBoxFromHover(); if (!b) return;
  const tg = demoTargets(b.x0, b.y0, b.x1, b.y1), full = S.level >= NL - 1;
  ctx.save();
  for (const [x, y, z] of tg) {
    const top = full || DEMO.sky ? z + 1 : Math.min(z + 1, S.level + HT / LH);
    const q = [projIso(x, y, top), projIso(x + 1, y, top), projIso(x + 1, y + 1, top), projIso(x, y + 1, top)];
    ctx.beginPath(); q.forEach((p, k) => k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath();
    ctx.fillStyle = 'rgba(226,87,63,0.38)'; ctx.fill();
  }
  ctx.restore();
  const x0 = Math.min(b.x0, b.x1), x1 = Math.max(b.x0, b.x1) + 1, y0 = Math.min(b.y0, b.y1), y1 = Math.max(b.y0, b.y1) + 1, h = full ? NL : S.level + HT / LH;
  isoQuad(ctx, x0, y0, x1, y1, h, '#e2573f');
  if (DEMO.box || tg.length) { const p = projIso(x1, y0, h); ptext(ctx, tg.length ? `-${tg.length}` : 'none', Math.round(p[0]) + 4, Math.round(p[1]) - 8, tg.length ? '#ff8a6a' : '#a39c8e', true); }
}
function bulldozerIcon(g) {
  R_(g, 3, 15, 18, 5, '#2a2622'); R_(g, 4, 16, 16, 3, '#4a443c');                       // track
  for (let x = 5; x < 20; x += 3) R_(g, x, 17, 1, 1, '#2a2622');
  R_(g, 6, 9, 13, 6, '#e8a83c'); R_(g, 6, 9, 13, 1, '#f6cf7a'); R_(g, 6, 14, 13, 1, '#a8701c');   // body
  R_(g, 12, 4, 6, 5, '#e8a83c'); R_(g, 13, 5, 4, 3, '#5f7f8c'); R_(g, 12, 4, 6, 1, '#f6cf7a'); // cab
  R_(g, 7, 6, 1, 3, '#3a3530');                                                            // exhaust
  R_(g, 19, 11, 3, 2, '#7d776c');                                                          // arm
  R_(g, 22, 7, 3, 13, '#9aa3a8'); R_(g, 22, 7, 1, 13, '#d7dde0'); R_(g, 24, 19, 3, 1, '#9aa3a8');   // blade
}
// ==========================================================================
// Procedural Web Audio: level-aware ambience beds crossfaded by the active
// level + view mode, generated convolution reverb, synthesized UI sounds.
// No audio files. Starts only after the "Sound on" click.
// ==========================================================================
const AUD = { ctx: null, on: false, muted: false, vol: 0.55, beds: {}, noise: {}, formants: [], tickT: 0 };
const BED_BASE = { under: 0.6, street: 0.5, transit: 0.42, wind: 0.34, canopy: 0.55, rooms: 0.34 };
function noiseBuf(ctx, kind, sec) {
  const n = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'white') d[i] = w * 0.5;
    else if (kind === 'pink') { b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898; d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926; }
    else { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
  }
  const f = Math.min(4000, n >> 3);
  for (let i = 0; i < f; i++) { const a = i / f; d[i] = d[i] * a + d[n - f + i] * (1 - a); }
  return b;
}
function makeIR(ctx, sec, decay) {
  const n = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    for (let i = 0; i < n; i++) { const t = i / n; d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * (i < 120 ? i / 120 : 1); }
    for (let k = 0; k < 7; k++) { const at = Math.floor(ctx.sampleRate * (0.011 + k * 0.017 + ch * 0.004)); if (at < n) d[at] += (k & 1 ? -0.5 : 0.6) * Math.pow(0.8, k); }
  }
  return b;
}
const filt = (ctx, type, f, q) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q != null) b.Q.value = q; return b; };
const gainN = (ctx, v) => { const g = ctx.createGain(); g.gain.value = v; return g; };
function lfo(ctx, freq, depth, param) { const o = ctx.createOscillator(); o.frequency.value = freq; const g = gainN(ctx, depth); o.connect(g); g.connect(param); o.start(); return o; }
function loopSrc(ctx, buf, rate) { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = rate || 1; s.start(0, Math.random() * buf.duration * 0.9); return s; }
function mkBed(ctx, name, send) {
  const out = gainN(ctx, 0), sg = gainN(ctx, send);
  out.connect(AUD.bus); out.connect(sg); sg.connect(AUD.verb);
  AUD.beds[name] = { out, send: sg, base: send };
  return out;
}
function audStart() {
  if (AUD.ctx) { if (AUD.ctx.state === 'suspended') AUD.ctx.resume(); AUD.on = true; applyVol(); return true; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  const ctx = new AC(); AUD.ctx = ctx;
  const master = gainN(ctx, 0), comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -20; comp.knee.value = 12; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.25;
  const modeLP = filt(ctx, 'lowpass', 16000, 0.5);
  modeLP.connect(master); master.connect(comp); comp.connect(ctx.destination);
  const verb = ctx.createConvolver(); verb.buffer = makeIR(ctx, 3.4, 2.4);
  const verbOut = gainN(ctx, 0.5); verb.connect(verbOut); verbOut.connect(modeLP);
  Object.assign(AUD, { master, bus: modeLP, verb, modeLP });
  AUD.noise = { white: noiseBuf(ctx, 'white', 3), pink: noiseBuf(ctx, 'pink', 4), brown: noiseBuf(ctx, 'brown', 4) };
  // undercroft: mains hum, muffled city through the slab (drips are events)
  const U = mkBed(ctx, 'under', 0.35), hum = gainN(ctx, 0.1), hlp = filt(ctx, 'lowpass', 240, 0.7);
  hum.connect(hlp); hlp.connect(U);
  for (const [f, g, type] of [[55, 1, 'sine'], [110.4, 0.45, 'sine'], [165.2, 0.16, 'triangle'], [49.7, 0.3, 'sine']]) { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; const gg = gainN(ctx, g); o.connect(gg); gg.connect(hum); o.start(); }
  lfo(ctx, 0.13, 0.03, hum.gain);
  const city = loopSrc(ctx, AUD.noise.brown), clp = filt(ctx, 'lowpass', 190, 0.5), cg = gainN(ctx, 0.5);
  city.connect(clp); clp.connect(cg); cg.connect(U); lfo(ctx, 0.05, 0.2, cg.gain);
  // street: formant babble + traffic
  const Sb = mkBed(ctx, 'street', 0.12), pink = loopSrc(ctx, AUD.noise.pink);
  AUD.formants = [];
  for (const [f, q] of [[420, 5], [950, 6], [1600, 7], [2600, 8]]) { const bp = filt(ctx, 'bandpass', f, q), g = gainN(ctx, 0); pink.connect(bp); bp.connect(g); g.connect(Sb); AUD.formants.push({ bp, g, f }); }
  const traffic = loopSrc(ctx, AUD.noise.brown, 0.7), tl = filt(ctx, 'lowpass', 520, 0.6), tg = gainN(ctx, 0.35);
  traffic.connect(tl); tl.connect(tg); tg.connect(Sb); AUD.trafficG = tg;
  // transit decks: rail hum + air handling (whooshes are events synced to pods)
  const Tr = mkBed(ctx, 'transit', 0.2), saw = ctx.createOscillator(); saw.type = 'sawtooth'; saw.frequency.value = 58;
  const sl = filt(ctx, 'lowpass', 210, 1), sg = gainN(ctx, 0.05); saw.connect(sl); sl.connect(sg); sg.connect(Tr); saw.start();
  const air = loopSrc(ctx, AUD.noise.white), ab = filt(ctx, 'bandpass', 900, 0.7), ag = gainN(ctx, 0.05); air.connect(ab); ab.connect(ag); ag.connect(Tr);
  // wind in voids and at height, heavy reverb send + shaft whistle
  const Wd = mkBed(ctx, 'wind', 0.8), wn = loopSrc(ctx, AUD.noise.white, 0.8), wb = filt(ctx, 'bandpass', 480, 0.9), wg = gainN(ctx, 0.35);
  wn.connect(wb); wb.connect(wg); wg.connect(Wd); lfo(ctx, 0.07, 220, wb.frequency); lfo(ctx, 0.11, 0.15, wg.gain);
  const wh = ctx.createOscillator(); wh.frequency.value = 740; const whg = gainN(ctx, 0); wh.connect(whg); whg.connect(Wd); wh.start(); lfo(ctx, 0.3, 6, wh.frequency); AUD.whistleG = whg;
  // canopy: leaf rustle (birds / crickets are events)
  const Cn = mkBed(ctx, 'canopy', 0.15), lv = loopSrc(ctx, AUD.noise.white, 1.1), lh = filt(ctx, 'highpass', 2400, 0.7), lg = gainN(ctx, 0.05);
  lv.connect(lh); lh.connect(lg); lg.connect(Cn); AUD.leafG = lg;
  // habitation: muffled rooms (radio phrases are events)
  const Rm = mkBed(ctx, 'rooms', 0.1), rp = loopSrc(ctx, AUD.noise.pink, 0.6), rb = filt(ctx, 'bandpass', 260, 1.8), rg = gainN(ctx, 0.25);
  rp.connect(rb); rb.connect(rg); rg.connect(Rm);
  AUD.on = true; applyVol(); audTick(true);
  return true;
}
function applyVol() { if (!AUD.ctx) return; AUD.master.gain.setTargetAtTime(AUD.on && !AUD.muted ? AUD.vol * AUD.vol * 0.9 : 0, AUD.ctx.currentTime, 0.25); }
function levelMix(z) {
  const m = { under: 0, street: 0, transit: 0, wind: 0, canopy: 0, rooms: 0 };
  if (z <= 1) { m.under = 1; m.street = 0.1; }
  else if (z <= 3) { m.street = 1; m.under = 0.18; m.transit = 0.15; m.wind = 0.08; }
  else if (z <= 5) { m.street = 0.55; m.rooms = 0.45; m.transit = 0.25; m.wind = 0.15; }
  else if (z === 6) { m.transit = 1; m.street = 0.3; m.wind = 0.25; m.rooms = 0.15; }
  else if (z <= 8) { m.rooms = 0.8; m.transit = 0.3; m.wind = 0.3; m.street = 0.12; }
  else if (z === 9) { m.canopy = 0.8; m.wind = 0.4; m.rooms = 0.25; }
  else if (z <= 11) { m.rooms = 0.7; m.wind = 0.5; m.canopy = 0.25; }
  else if (z === 12) { m.transit = 1; m.wind = 0.6; }
  else if (z === 13) { m.rooms = 0.5; m.wind = 0.6; m.canopy = 0.4; }
  else { m.canopy = 1; m.wind = 0.8; }
  return m;
}
function shaftiness() {
  const [u, v] = planeAt(S.bw / 2, S.bh / 2, S.level), p = fromRot(clamp(Math.floor(u), 0, W - 1), clamp(Math.floor(v), 0, D - 1));
  let s = 0;
  for (const w of WORLD.wells) { const d = Math.hypot(w.x + w.s / 2 - p[0], w.y + w.s / 2 - p[1]); s = Math.max(s, 1 - d / 12); }
  return s;
}
function audTick(force) {
  if (!AUD.ctx || !AUD.on) return;
  const ctx = AUD.ctx, now = ctx.currentTime, m = levelMix(S.level), night = S.tod === 'night';
  const modeK = S.mode === 'plan' ? 0.35 : S.mode === 'exploded' ? 0.55 : S.mode === 'section' ? 0.8 : 1;
  const lp = S.mode === 'plan' ? 1400 : S.mode === 'exploded' ? 5200 : S.mode === 'section' ? 9000 : 16000;
  const sh = S.mode === 'cut' ? shaftiness() : 0;
  if (S.mode === 'exploded') m.wind += 0.4;
  m.wind += sh * 0.7;
  if (night) { m.street *= 0.5; m.rooms *= 1.25; }
  AUD.lastMix = m; AUD.modeK = modeK;
  const tc = force ? 0.05 : 0.45;
  for (const k in AUD.beds) { const b = AUD.beds[k]; b.out.gain.setTargetAtTime(Math.min(1.2, m[k]) * modeK * BED_BASE[k], now, tc); }
  AUD.beds.wind.send.gain.setTargetAtTime(0.8 + sh * 1.2, now, 0.5);
  AUD.whistleG.gain.setTargetAtTime(0.03 * sh, now, 0.6);
  AUD.modeLP.frequency.setTargetAtTime(lp, now, 0.3);
  for (const f of AUD.formants) if (Math.random() < 0.35) { f.bp.frequency.setTargetAtTime(f.f * (0.75 + Math.random() * 0.6), now, 0.08); f.g.gain.setTargetAtTime(Math.random() < 0.4 ? 0 : 0.5 + Math.random() * 0.6, now, 0.05); }
  AUD.leafG.gain.setTargetAtTime(0.02 + Math.random() * 0.08, now, 0.06);
  if (Math.random() < 0.05) AUD.trafficG.gain.setTargetAtTime(0.2 + Math.random() * 0.5, now, 1.2);
  const r = Math.random;
  if (m.under * modeK > 0.1 && r() < 0.09) drip();
  if (m.canopy * modeK > 0.1 && r() < 0.06) (night ? cricket() : bird());
  if (m.street * modeK > 0.3 && r() < 0.004) bell();
  if (m.rooms * modeK > 0.3 && r() < 0.004) radio();
}
function envG(g, t0, a, peak, d) { g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + a); g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d); }
function tone(dest, type, f0, f1, t0, a, peak, d, pan) {
  const ctx = AUD.ctx, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t0); if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t0 + a + d);
  envG(g, t0, a, peak, d); o.connect(g);
  if (pan) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(dest); } else g.connect(dest);
  o.start(t0); o.stop(t0 + a + d + 0.05);
}
function noiseHit(dest, type, f, q, t0, a, peak, d, f1, pan) {
  const ctx = AUD.ctx, s = ctx.createBufferSource(); s.buffer = AUD.noise.white;
  const b = filt(ctx, type, f, q), g = ctx.createGain();
  if (f1) b.frequency.exponentialRampToValueAtTime(f1, t0 + a + d);
  envG(g, t0, a, peak, d); s.connect(b); b.connect(g);
  if (pan != null) { const p = ctx.createStereoPanner(); p.pan.setValueAtTime(pan[0], t0); p.pan.linearRampToValueAtTime(pan[1], t0 + a + d); g.connect(p); p.connect(dest); } else g.connect(dest);
  s.start(t0, Math.random() * 2); s.stop(t0 + a + d + 0.05);
}
function drip() { const t0 = AUD.ctx.currentTime + 0.01, f = 900 + Math.random() * 1800; tone(AUD.beds.under.out, 'sine', f, f * 0.55, t0, 0.003, 0.28, 0.12, Math.random() * 1.6 - 0.8); }
function bird() {
  const t = AUD.ctx.currentTime + 0.02, base = [2600, 3400, 4200][Math.floor(Math.random() * 3)], n = 2 + Math.floor(Math.random() * 4), pan = Math.random() * 1.4 - 0.7;
  for (let k = 0; k < n; k++) { const t0 = t + k * (0.09 + Math.random() * 0.07), f = base * (0.9 + Math.random() * 0.3); tone(AUD.beds.canopy.out, 'sine', f, f * (Math.random() < 0.5 ? 1.35 : 0.72), t0, 0.01, 0.12, 0.06, pan); }
}
function cricket() { const t = AUD.ctx.currentTime + 0.02, pan = Math.random() * 1.6 - 0.8; for (let k = 0; k < 4 + Math.floor(Math.random() * 3); k++) tone(AUD.beds.canopy.out, 'sine', 4300, 4300, t + k * 0.045, 0.004, 0.05, 0.02, pan); }
function bell() { const t0 = AUD.ctx.currentTime + 0.02, pan = Math.random() - 0.5; tone(AUD.beds.street.out, 'triangle', 2150, 2150, t0, 0.002, 0.07, 0.7, pan); tone(AUD.beds.street.out, 'sine', 2980, 2980, t0, 0.002, 0.04, 0.5, pan); }
function radio() {
  const ctx = AUD.ctx, lp = filt(ctx, 'lowpass', 900, 0.8); lp.connect(AUD.beds.rooms.out);
  const sc = [0, 2, 4, 7, 9, 12], root = 220 * Math.pow(2, Math.floor(Math.random() * 5) / 12), t = ctx.currentTime + 0.05;
  for (let k = 0; k < 6; k++) { const f = root * Math.pow(2, sc[Math.floor(Math.random() * sc.length)] / 12); tone(lp, 'triangle', f, f, t + k * 0.24, 0.02, 0.07, 0.2, 0.3); }
}
const PENTA = [0, 2, 4, 7, 9];
const lvFreq = z => 196 * Math.pow(2, (PENTA[z % 5] + 12 * Math.floor(z / 5)) / 12);
const sfxOn = () => AUD.ctx && AUD.on && !AUD.muted;
const sfx = {
  level(z) { if (!sfxOn()) return; const t0 = AUD.ctx.currentTime; tone(AUD.bus, 'triangle', lvFreq(z), lvFreq(z), t0, 0.004, 0.08, 0.07); noiseHit(AUD.bus, 'highpass', 3000, 0.7, t0, 0.001, 0.05, 0.015); },
  arrive(z) { if (!sfxOn()) return; const t0 = AUD.ctx.currentTime + 0.02, f = lvFreq(z) * 2; tone(AUD.bus, 'sine', f, f, t0, 0.005, 0.06, 0.5); tone(AUD.bus, 'sine', f * 1.5, f * 1.5, t0 + 0.11, 0.005, 0.05, 0.6); },
  mode(m) {
    if (!sfxOn()) return; const t0 = AUD.ctx.currentTime;
    if (m === 'cut') { noiseHit(AUD.bus, 'bandpass', 2200, 1.2, t0, 0.002, 0.12, 0.05); tone(AUD.bus, 'sine', 120, 70, t0, 0.003, 0.15, 0.09); }
    else if (m === 'exploded') [0, 4, 7].forEach((s, k) => tone(AUD.bus, 'triangle', 330 * Math.pow(2, s / 12), 330 * Math.pow(2, s / 12), t0 + k * 0.06, 0.01, 0.06, 0.35));
    else if (m === 'plan') noiseHit(AUD.bus, 'bandpass', 1400, 0.8, t0, 0.04, 0.1, 0.16, 700);
    else noiseHit(AUD.bus, 'highpass', 6000, 0.7, t0, 0.01, 0.1, 0.14, 1500);
  },
  ghost() { if (!sfxOn()) return; const ctx = AUD.ctx, t0 = ctx.currentTime, c = ctx.createOscillator(), mo = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain(); c.frequency.value = 1320; mo.frequency.value = 1320 * 2.4; mg.gain.setValueAtTime(900, t0); mg.gain.exponentialRampToValueAtTime(5, t0 + 0.4); mo.connect(mg); mg.connect(c.frequency); envG(g, t0, 0.004, 0.07, 0.45); c.connect(g); g.connect(AUD.bus); g.connect(AUD.verb); c.start(t0); mo.start(t0); c.stop(t0 + 0.5); mo.stop(t0 + 0.5); },
  tick(ph, z) {
    if (!sfxOn()) return; const t0 = AUD.ctx.currentTime, k = z === S.level ? 1 : 0.5, j = 0.95 + Math.random() * 0.1;
    if (ph === 0) { [523, 1187, 1789].forEach((f, i) => tone(AUD.bus, 'sine', f * j, f * j, t0, 0.001, 0.07 * k / (i + 1), 0.16)); noiseHit(AUD.bus, 'highpass', 4000, 0.7, t0, 0.001, 0.06 * k, 0.02); }
    else if (ph === 1) { tone(AUD.bus, 'sine', 150 * j, 70, t0, 0.003, 0.22 * k, 0.12); noiseHit(AUD.bus, 'lowpass', 600, 0.7, t0, 0.002, 0.1 * k, 0.06); }
    else if (ph === 2) { tone(AUD.bus, 'triangle', 660 * j, 640, t0, 0.002, 0.08 * k, 0.12); noiseHit(AUD.bus, 'highpass', 5000, 0.8, t0 + 0.01, 0.01, 0.04 * k, 0.12); }
    else noiseHit(AUD.bus, 'bandpass', 2500, 2, t0, 0.01, 0.08 * k, 0.18, 500);
  },
  whoosh(side, near) { if (!sfxOn()) return; const t0 = AUD.ctx.currentTime; noiseHit(AUD.bus, 'bandpass', 300, 1.4, t0, 0.45, 0.2 * near * (AUD.modeK || 1), 0.7, 1500, [-side * 0.85, side * 0.85]); },
  approve() { if (!sfxOn()) return; const t0 = AUD.ctx.currentTime; tone(AUD.bus, 'sine', 659, 659, t0, 0.005, 0.08, 0.3); tone(AUD.bus, 'sine', 880, 880, t0 + 0.09, 0.005, 0.08, 0.45); },
  reject() { if (!sfxOn()) return; const t0 = AUD.ctx.currentTime; tone(AUD.bus, 'triangle', 440, 440, t0, 0.005, 0.07, 0.2); tone(AUD.bus, 'triangle', 330, 330, t0 + 0.1, 0.005, 0.07, 0.3); },
  done() { if (!sfxOn()) return; const t0 = AUD.ctx.currentTime; [523, 659, 784].forEach((f, i) => tone(AUD.bus, 'sine', f, f, t0 + i * 0.07, 0.005, 0.05, 0.6)); },
  look() { if (!sfxOn()) return; tone(AUD.bus, 'sine', 1200, 1600, AUD.ctx.currentTime, 0.01, 0.025, 0.06); },
  pin() { if (!sfxOn()) return; tone(AUD.bus, 'sine', 900, 300, AUD.ctx.currentTime, 0.002, 0.12, 0.05); },
  chat() { if (!sfxOn()) return; tone(AUD.bus, 'sine', 1100, 1100, AUD.ctx.currentTime, 0.003, 0.04, 0.05); },
  click() { if (!sfxOn()) return; noiseHit(AUD.bus, 'highpass', 3500, 0.7, AUD.ctx.currentTime, 0.001, 0.04, 0.012); }
};
// ==========================================================================
// DOM UI: the chrome (top bar, tool palette + option flyouts, levels panel,
// agent feed, status line), proposal card, toasts, tooltips, help bubbles.
// The open design choices are codes in UICFG (written onto <body> as data
// attributes); everything decided is built in. See mockups/ui.html.
// ==========================================================================
let stripDirty = true, CARDJOB = null, toastT = 0, pinSeq = 0;
const MODES = ['cut', 'exploded', 'plan', 'section'];
const BUILD_TOOLS = ['stack', 'bridge', 'garden', 'well'];

// ---------- chrome config: interim picks for what is still open ----------
// MT tone (10 dark, 11 light; the UI light/dark switch flips these) · PX chrome pixel · BV bevel · OL outline ·
// DT title dither · TX type · WF wordmark · LG logo · TB top bar · KH key hints · FO flyout · LT light popover ·
// SL slider · SG segmented · BT button · BB status bar · SC sidebar collapse
const UICFG = { MT: 10, PX: 1, BV: 1, OL: 1, DT: 1, TX: 1, WF: 24, LG: 2, TB: 3, KH: 2, FO: 2, LT: 1, SL: 3, SG: 1, BT: 2, BB: 3, SC: 1 };
const UI = { tb: 1, open: new Set(), fo: null, hueOpen: false, hue: [null, null, null, null], sel: { select: 'inspect', build: 'stack', wires: 'cable', units: 'u0' },
  lvx: true, feed: 'all', unread: 0, help: false, helpP: null, helpSig: '', hoverPanel: null, logo: 0, modeFold: false, grabbing: false, lvSeen: false };
const store = { get(k, d) { try { const v = localStorage.getItem('spall.' + k); return v == null ? d : v; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('spall.' + k, v); } catch (e) { /* storage unavailable */ } } };

// ---------- pixel glyphs (1 char = 1 px) ----------
const GPAL = { l: ['#a9cf56'], A: ['#b07a22'], o: ['#e27a4e'], O: ['#f5a078'], W: ['#eeeae0'], w: ['#e6dfcf'], '#': ['currentColor'], '+': ['currentColor', .45], '-': ['currentColor', .2], a: ['#e8a83c'], c: ['#ff7a52'], t: ['#5fd3c4'], v: ['#9b87e8'], s: ['#a9b6bf'], k: ['#121314'], y: ['#5fd3f2'], d: ['#6d675c'] };
const GLYPH = {
  cut: ['.........','.+.+.+.+.','.........','aaaaaaaaa','#.......#','#.#####.#','#.......#','#.#####.#','#########'],
  exploded: ['.#######.','.#.....#.','.#######.','.........','.#######.','.#.....#.','.#######.','.........','.#######.'],
  plan: ['#########','#...#...#','#...#...#','#...#...#','#########','#...#...#','#...#...#','#...#...#','#########'],
  section: ['....#....','....#..#.','.#..#..#.','.#.##..#.','.#.##.##.','.#####.##','.########','#########','#########'],
  ghost: ['#.#.#.#.#','.........','#.......#','.........','#.......#','.........','#.......#','.........','#.#.#.#.#'],
  shade: ['#########','#.......#','#.......#','#.......#','#########','#+#+#+#+#','##+#+#+##','#+#+#+#+#','#########'],
  follow: ['....#....','....#....','..#####..','..#...#..','###.#.###','..#...#..','..#####..','....#....','....#....'],
  bulb: ['..###..','.#...#.','#.....#','#..#..#','.#.#.#.','..###..','..+++..','...#...'],
  rotl: ['...#.....','..##.....','.#######.','..##....#','...#....#','........#','.......#.','..#####..','.........'],
  rotr: ['.....#...','.....##..','.#######.','#....##..','#....#...','#........','.#.......','..#####..','.........'],
  dice: ['#########','#.......#','#.#...#.#','#.......#','#...#...#','#.......#','#.#...#.#','#.......#','#########'],
  speaker: ['....#....','...##..#.','#####...#','#####.#.#','#####.#.#','#####...#','...##..#.','....#....','.........'],
  mute: ['....#....','...##....','#####.#.#','#####..#.','#####.#.#','#####....','...##....','....#....','.........'],
  caret: ['#####','.###.','..#..'],
  xx: ['#...#','.#.#.','..#..','.#.#.','#...#'],
  chevr: ['#...','##..','.##.','..##','.##.','##..','#...'],
  fold: ['#..#...','.#..#..','..#..#.','.#..#..','#..#...'],
  unfold: ['...#..#','..#..#.','.#..#..','..#..#.','...#..#'],
  up: ['...#...','..###..','.##.##.','##...##','#.....#'],
  enter: ['.......#','.......#','..#....#','.##....#','########','.##.....','..#.....'],
  log: ['#.#######','.........','#.#######','.........','#.#####..','.........','#.######.'],
  chat: ['#########','#.......#','#.#####.#','#.......#','#.###...#','#.......#','#########','.##......','.#.......'],
  clawd: ['.#########.','.##.###.##.','.#########.','###########','.#########.','.#########.','.#.#...#.#.','.#.#...#.#.'],
  q: ['.#####.','##...##','.....##','...###.','...##..','.......','...##..'],
  morning: ['.........','....#....','.#.....#.','...###...','..#####..','#.#####.#','#########','.........','.+.+.+.+.'],
  noon: ['....#....','.#.....#.','...###...','..#####..','#.#####.#','..#####..','...###...','.#.....#.','....#....'],
  evening: ['.........','.........','.#.....#.','...###...','..#####..','#########','.........','.+++++++.','.........'],
  night: ['...###...','..###....','.###.....','.###.....','.###.....','.###.....','..###....','...###...','.........'],
  sunOn: ['#.#......','.##......','##.......','.....###.','....#####','....#####','..++#####','.++++....','++++.....'],
  sky: ['.........','..#####..','.#.....#.','#.......#','#.......#','#########','.........','.+.+.+.+.','.........'],
  ao: ['#########','#++++....','#++......','#+.......','#+.......','#........','#........','#........','#........'],
  mist: ['.........','.##...##.','#..###..#','.........','.##...##.','#..###..#','.........','.##...##.','#..###..#'],
  shafts: ['#..#..#..','.#..#..#.','..#..#..#','...#..#..','....#..#.','.....#..#','......#..','.......#.','........#'],
  bloom: ['....+....','..+.#.+..','...###...','+.#####.+','.+#####+.','+.#####.+','...###...','..+.#.+..','....+....'],
  L7: ['+.+.+.+.+.+.+','.............','+...........+','.............','aaaaaaaaaaaaa','#############','#+#+#+#+#+#+#','#############','#++++##+++++#','#############'],
  LGB: ["ttt..............ttt", "...tt....w.....tt...", ".....t...Ww...t.....", "......tttWwttt......", "vvvvvvvvvWwvvvvvvvvv", "......oooWwooo......", ".....o...Ww...o.....", "...oo.....k....oo...", "ooo..............ooo"],
  LGB2S: ["ttt.............ttt", "...t..w.....w..t...", "vvvvttWtttttWttvvvv", "....vvWvvvvvWvv....", "......W.....W......", "....ooWoooooWoo....", "oooollWlllllWlloooo", "...l..w.....w..l...", "lll.............lll"],
  C24: [".#####...######....#####...##.......##.....", "##...##..##...##..##...##..##.......##.....", "##.......##...##..##...##..##.......##.....", ".#####...######...#######..##.......##.....", ".....##..##.......##...##..##.......##.....", "##...##..##.......##...##..##.......##.....", ".#####...##.......##...##..#######..#######"],
};
function glyph(rows, sc = 2) {
  if (typeof rows === 'string') rows = GLYPH[rows];
  const h = rows.length, w = Math.max(...rows.map(r => r.length)); let out = '';
  rows.forEach((r, y) => { let x = 0; while (x < r.length) { const ch = r[x]; if (ch === '.' || ch === ' ') { x++; continue; } let x2 = x; while (x2 < r.length && r[x2] === ch) x2++; const p = GPAL[ch] || GPAL['#']; out += `<rect x="${x}" y="${y}" width="${x2 - x}" height="1" fill="${p[0]}"${p[1] ? ` fill-opacity="${p[1]}"` : ''}/>`; x = x2; } });
  return `<svg class="px" width="${w * sc}" height="${h * sc}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges" aria-hidden="true">${out}</svg>`;
}
// logo shortlist: clicking the mark cycles it (LG2 strata stack, LG3 cut cube, LG4 pixel strata, LG8 tied bundle, LG22 bundle with two ties)
const VMARK = {
  2: [0, 0, 26, 24, `<path d="M13 13.5 25 18.5 13 23.5 1 18.5Z" fill="currentColor"/><path d="M1 13v2l12 5 12-5v-2l-12 5Z" fill="#b07a22"/><path d="M13 8 25 13 13 18 1 13Z" fill="#e8a83c"/><defs><clipPath id="c2a"><path d="M13 8 25 13 13 18 1 13Z"/></clipPath></defs><path d="M13 1 25 6 13 11 1 6Z" fill="none" stroke="currentColor" stroke-opacity=".85" stroke-dasharray="2 2"/><path d="M13 1 25 6 13 11 1 6Z" fill="none" stroke="#1b1305" stroke-opacity=".8" stroke-width="1.3" stroke-dasharray="2 2" clip-path="url(#c2a)"/>`],
  3: [0, 0, 26, 28, `<path d="M13 9.5 24 15 13 20.5 2 15Z" fill="#e8a83c" stroke="#e8a83c"/><path d="M2 15v6l11 5.5L24 21v-6M13 20.5v6"/><defs><clipPath id="c3a"><path d="M13 9.5 24 15 13 20.5 2 15Z"/></clipPath></defs><path d="M13 1.5 24 7 13 12.5 2 7Z M2 7v5M24 7v5M13 12.5v1.5" stroke-dasharray="2 2" stroke-opacity=".85"/><path d="M13 1.5 24 7 13 12.5 2 7Z M13 12.5v1.5" stroke="#1b1305" stroke-opacity=".8" stroke-dasharray="2 2" clip-path="url(#c3a)"/>`, 'fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"'],
};
const LOGOS = [2, 3, 4, 8, 22], PMARK = { 4: 'L7', 8: 'LGB', 22: 'LGB2S' };
function markSVG(lg) {
  if (PMARK[lg]) return glyph(PMARK[lg], 2);
  const v = VMARK[lg]; if (!v) return '';
  const [x, y, w, hh, inner, attrs] = v, k = Math.min(1, 28 / hh);
  return `<svg class="px" width="${(w * k).toFixed(1)}" height="${(hh * k).toFixed(1)}" viewBox="${x} ${y} ${w} ${hh}" aria-hidden="true" ${attrs || ''}>${inner}</svg>`;
}
const WORDMARKS = { 24: ['C24', 2] };   // WF24: the custom pixel SPALL

// ---------- the chrome: tone, pixel size, bevel, outline, title dither (nine-slice frames made here) ----------
const CHROME_TONE = {
  10: { o: '#0b0a09', L: '#6a645a', l: '#4f4a41', m: '#38342e', f: '#26241f', d: '#161513', t: '#6b6457', x: ['#fff', .09] },
  11: { o: '#2a2622', L: '#ffffff', l: '#fbf8f0', m: '#ebe6da', f: '#d9d3c4', d: '#9a9284', t: '#a39a8a', x: ['#000', .14] },
  15: { o: '#3b3833', L: '#ffffff', l: '#ffffff', m: '#f8f7f3', f: '#f1efe9', d: '#c4bfb4', t: '#c9c3b6', x: ['#000', .1] },
  16: { o: '#000000', L: '#3e3c38', l: '#2c2b28', m: '#1d1c1a', f: '#121211', d: '#060606', t: '#46433d', x: ['#fff', .1] }
};
const svgURL = s => `url("data:image/svg+xml,${encodeURIComponent(s)}")`;
function pxFrame(T, bv, ol, round) {
  const o = ol ? T.o : T.d, rings = [];
  if (ol) rings.push([o, o]);
  if (bv === 1) rings.push([T.l, T.d]); else if (bv === 2) rings.push([T.L, o], [T.m, T.d]);
  if (!rings.length) rings.push([T.d, T.d]);
  const b = rings.length, N = 2 * b + 1; let s = '';
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const ring = Math.min(x, y, N - 1 - x, N - 1 - y), cx = Math.min(x, N - 1 - x), cy = Math.min(y, N - 1 - y);
    let col;
    if (ring >= b) col = T.f;
    else { const br = (x === N - 1 - ring && y >= ring) || (y === N - 1 - ring && x >= ring); col = rings[ring][br ? 1 : 0]; }
    if (cx === 0 && cy === 0) col = null;
    if (round && b > 1) { if ((cx === 0 && cy === 1) || (cx === 1 && cy === 0)) col = null; if (cx === 1 && cy === 1) col = rings[0][x > y ? 1 : 0]; }
    if (col) s += `<rect x="${x}" y="${y}" width="1" height="1" fill="${col}"/>`;
  }
  return { url: svgURL(`<svg xmlns="http://www.w3.org/2000/svg" width="${N}" height="${N}" shape-rendering="crispEdges">${s}</svg>`), b };
}
function pxDither(kind, col, op, p) {
  if (kind === 3) return 'none';
  const cells = kind === 1 ? 'M0 0h1v1H0zM1 1h1v1H1z' : 'M0 0h2v1H0z';
  return svgURL(`<svg xmlns="http://www.w3.org/2000/svg" width="${2 * p}" height="${2 * p}" viewBox="0 0 2 2" shape-rendering="crispEdges"><path d="${cells}" fill="${col}" fill-opacity="${op}"/></svg>`);
}
function applyChrome() {
  const c = UICFG, b = document.body, T = CHROME_TONE[c.MT] || CHROME_TONE[10], p = +c.PX === 2 ? 1 : 2, fr = pxFrame(T, +c.BV, +c.OL === 1, p === 1);
  for (const k in c) b.dataset[k.toLowerCase()] = c[k];
  const st = b.style;
  st.setProperty('--p', p + 'px'); st.setProperty('--px9', fr.url); st.setProperty('--bs', fr.b); st.setProperty('--pb', fr.b * p + 'px');
  st.setProperty('--dtitle', pxDither(+c.DT, T.t, 1, p)); st.setProperty('--dith', pxDither(1, T.x[0], T.x[1], p));
  st.setProperty('--tbh', (34 + 3 * p) + 'px');
  const dark = c.MT === 10 || c.MT === 16, bt = $('bUiTone');
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  if (bt) { bt.innerHTML = glyph(dark ? 'noon' : 'night'); bt.dataset.tip = dark ? 'Interface: switch to light' : 'Interface: switch to dark'; }
  if ($('worldPop') && !$('worldPop').hidden) syncWorldMenu();
}
// the interface light/dark switch: the chrome only, never the scene's time of day
function setUiTone(dark) { UICFG.MT = dark ? 10 : 11; store.set('tone', dark ? 'dark' : 'light'); applyChrome(); UI.helpSig = ''; }

// ---------- tool icons and option swatches (drawn once, used as images) ----------
const TOOLICON = {}, SWC = ['#5fd3c4', '#9b87e8', '#e27a4e', '#a9cf56'];
function uiMk(w, h, fn) { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); fn((x, y, ww, hh, col) => { g.fillStyle = col; g.fillRect(x, y, ww, hh); }, g); return c.toDataURL(); }
function uiShade(hex, k) { const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = n >> 8 & 255, b = n & 255; if (k < 1) { r *= k; g *= k; b *= k; } else { const t = k - 1; r += (255 - r) * t; g += (255 - g) * t; b += (255 - b) * t; } return `rgb(${r | 0},${g | 0},${b | 0})`; }
function uiIso(P, cx, cy, hw, col, dash) { const hh = hw / 2; for (let k = 0; k <= hh; k++) { if (dash && (k & 1)) continue; P(cx - hw + 2 * k, cy - k, 2, 1, col); P(cx + hw - 2 * k - 2, cy - k, 2, 1, col); P(cx - hw + 2 * k, cy + k, 2, 1, col); P(cx + hw - 2 * k - 2, cy + k, 2, 1, col); } }
const swCable = (px, col) => uiMk(20, 12, P => { for (let x = 1; x < 19; x++) { const y = Math.round(2 + Math.sin((x - 1) / 17 * Math.PI) * (6 - px)); for (let k = 0; k < px; k++) P(x, y + k, 1, 1, k === 0 ? uiShade(col, 1.35) : (k === px - 1 && px > 1) ? uiShade(col, .62) : col); } P(0, 1, 2, 3, '#9a9488'); P(18, 1, 2, 3, '#9a9488'); });
let SWATCH = null;
function drawToolIcons() {
  const P = painter(4);
  const icon = (tool, fn) => { const c = document.createElement('canvas'); c.width = 30; c.height = 22; fn(c.getContext('2d')); TOOLICON[tool] = c.toDataURL(); };
  icon('stack', g => { for (let k = 0; k < 3; k++) { box(g, 11, 12 - k * 5, 8, 5, P.t(CAPC[k][0]), P.l(CAPC[k][1]), P.r(CAPC[k][2])); } box(g, 19, 12, 8, 1, P.t('#9a9488'), P.l('#6f6a5f'), P.r('#57534a')); });
  icon('bridge', g => { box(g, 3, 8, 12, 2, P.t('#9a9488'), P.l('#6f6a5f'), P.r('#57534a')); box(g, 11, 12, 12, 2, P.t('#9a9488'), P.l('#6f6a5f'), P.r('#57534a')); R_(g, 5, 9, 18, 1, P.t('#cfa645')); });
  icon('garden', g => { box(g, 5, 10, 20, 3, P.t('#5d893d'), P.l('#7a7367'), P.r('#5f5a51')); R_(g, 12, 4, 6, 6, P.t('#3f7236')); R_(g, 13, 3, 3, 2, P.t('#6f9f4a')); R_(g, 14, 10, 1, 2, '#5a4030'); });
  icon('cable', g => { const pal = wpal('#e27a4e', 4), pal2 = wpal('#5fd3c4', 4); for (let x = 2; x < 28; x++) { const y = Math.round(5 + Math.sin(x / 26 * Math.PI) * 9); g.fillStyle = pal[0]; g.fillRect(x, y, 1, 1); g.fillStyle = pal[1]; g.fillRect(x, y + 1, 1, 1); g.fillStyle = pal2[1]; g.fillRect(x, y + 4 - Math.round(Math.sin(x / 26 * Math.PI) * 2), 1, 1); } R_(g, 1, 3, 2, 4, '#9a9488'); R_(g, 27, 3, 2, 4, '#9a9488'); });
  icon('tie', g => { for (let k = 0; k < 4; k++) { g.fillStyle = wpal(['#5fd3c4', '#9b87e8', '#e27a4e', '#a9cf56'][k], 4)[1]; for (let x = 1; x < 29; x++) { const sp = Math.abs(x - 15) < 4 ? 2 : 2 + Math.round(Math.abs(x - 15) / 4); g.fillRect(x, 11 + (k - 1.5) * sp | 0, 1, 1); } } R_(g, 13, 4, 3, 15, '#1c1b19'); R_(g, 14, 5, 1, 13, '#d8d2c4'); });
  icon('demolish', bulldozerIcon);
  icon('girder', g => { const pal = wpal(GIRDER_HEX, 4); R_(g, 2, 9, 26, 1, pal[0]); R_(g, 2, 10, 26, 1, pal[1]); R_(g, 2, 11, 26, 1, pal[3]); for (const x of [6, 15, 24]) { R_(g, x, 4, 1, 14, pal[1]); R_(g, x - 1, 9, 3, 3, pal[0]); } });
  icon('post', g => { const pal = wpal(POST_HEX, 4); R_(g, 13, 7, 4, 13, pal[3]); R_(g, 14, 7, 2, 13, pal[1]); R_(g, 14, 7, 1, 13, pal[0]); R_(g, 9, 5, 12, 3, pal[3]); R_(g, 10, 6, 10, 1, pal[0]); for (let k = 0; k < 5; k++) { g.fillStyle = wpal(['#5fd3c4', '#9b87e8', '#e27a4e', '#a9cf56', '#5fd3c4'][k], 4)[1]; g.fillRect(2, 3 + (k % 3), 26, 1); } });
  icon('well', g => { box(g, 5, 10, 20, 3, P.t('#2b5853'), P.l('#6b645a'), P.r('#524c44')); pline(g, 9, 12, 21, 18, '#e6dfcf'); pline(g, 21, 12, 9, 18, '#e6dfcf'); R_(g, 14, 1, 2, 8, 'rgba(255,236,190,0.6)'); });
  Object.assign(TOOLICON, {
    inspect: uiMk(30, 22, P => { uiIso(P, 16, 15, 10, '#e8a83c'); const A = ['k......','kk.....','kwk....','kwwk...','kwwwk..','kwwwwk.','kwwwwwk','kwwkkkk','kwk....','kk.....','k......']; A.forEach((r, y) => [...r].forEach((ch, x) => { if (ch !== '.') P(9 + x, 2 + y, 1, 1, ch === 'k' ? '#121314' : '#e6dfcf'); })); }),
    capture: uiMk(30, 22, P => { uiIso(P, 15, 12, 12, '#e6dfcf', true); P(13, 8, 4, 3, '#8d877a'); P(13, 8, 4, 1, '#cfc7b6'); P(12, 11, 3, 4, '#6f6a5f'); P(15, 11, 3, 4, '#57534a'); P(26, 16, 3, 1, '#e8a83c'); P(27, 15, 1, 3, '#e8a83c'); }),
    point: uiMk(30, 22, P => { uiIso(P, 15, 17, 6, 'rgba(0,0,0,.45)'); P(14, 9, 2, 8, '#2f8aa3'); P(12, 2, 6, 7, '#5fd3f2'); P(13, 1, 4, 9, '#5fd3f2'); P(11, 3, 8, 5, '#5fd3f2'); P(13, 3, 2, 2, '#e9fbff'); P(14, 9, 2, 1, '#1f6f86'); }),
  });
  SWATCH = {
    tieRound: uiMk(20, 12, P => { SWC.forEach((c, i) => { for (let x = 0; x < 20; x++) { const sp = Math.abs(x - 10) < 3 ? 1 : 1 + Math.round(Math.abs(x - 10) / 4); P(x, Math.round(6 + (i - 1.5) * sp), 1, 1, c); } }); P(9, 2, 2, 8, '#eeeae0'); P(8, 3, 1, 6, '#bdb7aa'); P(11, 3, 1, 6, '#bdb7aa'); }),
    tieFlat: uiMk(20, 12, P => { SWC.forEach((c, i) => { for (let x = 0; x < 20; x++) { const sp = Math.abs(x - 10) < 4 ? 1 : 1 + Math.round(Math.abs(x - 10) / 4); P(x, Math.round(6 + (i - 1.5) * sp), 1, 1, c); } }); P(7, 3, 6, 6, '#eeeae0'); P(7, 3, 6, 1, '#fffaf0'); P(7, 8, 6, 1, '#a8a294'); }),
    glued: uiMk(20, 12, P => { SWC.forEach((c, i) => { P(1, 4 + i, 18, 1, c); P(1, 4 + i, 18, 1, c); }); P(1, 3, 18, 1, 'rgba(0,0,0,.4)'); P(1, 8, 18, 1, 'rgba(0,0,0,.4)'); }),
    tube: uiMk(20, 12, P => { P(1, 3, 18, 6, '#6f7f8a'); for (let x = 1; x < 19; x++) P(x, 3 + ((x * 2) % 6), 1, 1, SWC[(x >> 1) & 3]); P(1, 3, 18, 1, '#b9c6ce'); P(1, 8, 18, 1, '#3f4a52'); }),
    bare: uiMk(20, 12, P => { ['#e27a4e','#5fd3c4','#9b87e8'].forEach((c, i) => P(1, 3 + i * 3, 18, 1, c)); }),
    sleeved: uiMk(20, 12, P => { ['#e27a4e','#5fd3c4','#9b87e8'].forEach((c, i) => { P(1, 3 + i * 3, 3, 1, c); P(16, 3 + i * 3, 3, 1, c); }); P(4, 2, 12, 9, '#4a4540'); P(4, 2, 12, 1, '#6b645b'); for (let x = 5; x < 16; x += 3) P(x, 3, 1, 7, '#3a3632'); }),
    cable: GAUGES.map((g, i) => swCable(i + 1, g.hues[0])),
    level: uiMk(20, 12, P => { P(3, 5, 14, 3, '#e2573f'); P(3, 5, 14, 1, '#ff8a6a'); P(3, 9, 14, 2, '#8d877a'); P(3, 2, 14, 2, '#8d877a'); }),
    sky: uiMk(20, 12, P => { for (let k = 0; k < 3; k++) { P(3, 1 + k * 3, 14, 2, '#e2573f'); P(3, 1 + k * 3, 14, 1, '#ff8a6a'); } P(3, 10, 14, 2, '#8d877a'); })
  };
}

// ---------- tool palette (decided): a thumb cycles collapsed / groups / all tools; names on approach;
// an opened group's row stays out until its group button (or the thumb) is clicked ----------
const TOOLS = [
  { g: 'select', n: 'Select', items: [{ id: 'inspect', n: 'Inspect', k: 'V' }, { id: 'capture', n: 'Capture', k: 'C' }, { id: 'point', n: 'Point', k: 'P' }] },
  { g: 'build', n: 'Build', items: [{ id: 'stack', n: 'Stack', k: 'B' }, { id: 'bridge', n: 'Bridge' }, { id: 'garden', n: 'Garden' }, { id: 'well', n: 'Light well' }, { id: 'demolish', n: 'Demolish', k: 'X' }] },
  { g: 'wires', n: 'Wires', items: [{ id: 'cable', n: 'Cable', k: 'L' }, { id: 'tie', n: 'Tie', k: 'Y' }, { id: 'post', n: 'Post', k: 'K' }, { id: 'girder', n: 'Girder', k: 'H' }] },
  { g: 'units', n: 'Units', items: [] }   // captured blueprints, added by addUnitButton
];
const HINTS = {
  inspect: [['hover', 'inspect'], ['dbl-click', 'cut here'], ['⌥-click', 'point']], capture: [['drag', 'box a unit'], ['− +', 'height']], point: [['click', 'pin for claude']],
  stack: [['click', 'place'], ['B', 'next build tool']], bridge: [['click', 'place'], ['R', 'turn']], garden: [['click', 'place'], ['B', 'next']], well: [['click', 'open a well'], ['B', 'next']],
  demolish: [['click / drag', 'remove'], ['⌘Z', 'undo']], unit: [['click', 'stamp'], ['R', 'turn']],
  cable: [['drag', 'lay'], ['R', 'gauge'], ['⌘-drag', 'slack'], ['⌥-click', 'remove'], ['⌘Z', 'undo']],
  tie: [['drag across', 'tie'], ['R', 'round / flat'], ['dbl-click', 'hang'], ['J', 'jolt']],
  post: [['click', 'stand a post'], ['drop a bundle', 'clamp']], girder: [['drag', 'span'], ['click', 'column'], ['⌥-click', 'remove']]
};
const tkOf = it => it.u ? 'u' + UNITS.indexOf(it.u) : it.id;
const itemOfTk = tk => { if (tk[0] === 'u' && /^u\d+$/.test(tk)) { const u = UNITS[+tk.slice(1)]; return u && { id: 'unit', n: u.name, u }; } for (const G_ of TOOLS) for (const it of G_.items) if (it.id === tk) return it; return null; };
const groupOfTool = t => t === 'unit' ? 'units' : (TOOLS.find(G_ => G_.items.some(it => it.id === t)) || {}).g;
const isActiveItem = it => it.u ? S.tool === 'unit' && S.unit === it.u : S.tool === it.id;
const cap1 = s => s[0].toUpperCase() + s.slice(1);
function iconOf(it) { return it.u ? it.u.icon : TOOLICON[it.id]; }
function tbState() { return UI.modeFold ? 0 : UI.tb; }
function visGroups() { return TOOLS.filter(G_ => G_.g !== 'units' || UNITS.length); }
function toolBtn(it, i, mode) {
  const tk = tkOf(it), has = !!toolOpts(it.u ? 'unit' : it.id), nw = it.isNew ? '<span class="new">new</span>' : '';
  const lb = mode === 'strip' ? `<span class="lb">${it.k ? `<kbd>${it.k}</kbd>` : ''}${it.n}${nw}</span>` : `<span class="lb">${it.n}</span>${it.k ? `<kbd>${it.k}</kbd>` : ''}`;
  return `<button type="button" class="tool" data-tk="${tk}" data-tool="${it.u ? 'unit' : it.id}" style="--i:${i}" aria-pressed="${isActiveItem(it)}" aria-label="${it.n}${it.k ? ' (' + it.k + ')' : ''}"><span class="ic"><img src="${iconOf(it)}" alt=""></span>${lb}${has ? '<i class="tri"></i>' : ''}</button>`;
}
function renderTools() {
  const nav = $('tools'), st = tbState(), names = ['collapsed', 'groups', 'all tools']; let i = 0;
  const thumb = `<div class="grp gthumb"><button type="button" class="tl-thumb" data-act="tlstate" aria-label="Tool palette: ${names[st]}, click to cycle"><i class="${st === 0 ? 'on' : ''}"></i><i class="${st === 1 ? 'on' : ''}"></i><i class="${st === 2 ? 'on' : ''}"></i><span class="lb">Tools · ${names[st]}<kbd>\`</kbd></span></button></div>`;
  let body = '';
  if (st === 1) body = visGroups().map(G_ => { const it = itemOfTk(UI.sel[G_.g]) || G_.items[0]; if (!it) return ''; return `<div class="grp"><button type="button" class="tool slot ${UI.open.has(G_.g) ? 'open' : ''}" data-slot="${G_.g}" data-tool="${it.u ? 'unit' : it.id}" style="--i:${i++}" aria-pressed="${groupOfTool(S.tool) === G_.g}" aria-expanded="${UI.open.has(G_.g)}" aria-label="${G_.n} tools"><span class="ic"><img src="${iconOf(it)}" alt=""></span><span class="lb">${G_.n}</span><i class="sc">${glyph('chevr', 1)}</i></button></div>`; }).join('');
  if (st === 2) body = visGroups().map(G_ => `<div class="grp">${groupItems(G_).map(it => toolBtn(it, i++, 'strip')).join('')}</div>`).join('');
  nav.className = 'pn tls' + st;
  nav.innerHTML = thumb + body;
  renderToolLayer();
}
function groupItems(G_) { return G_.g === 'units' ? UNITS.map(u => ({ id: 'unit', n: u.name, u, icon: u.icon })) : G_.items; }
function syncTools() {
  document.querySelectorAll('#tools .tool[data-tk], #toolLayer .tool[data-tk]').forEach(b => { const it = itemOfTk(b.dataset.tk); b.setAttribute('aria-pressed', !!(it && isActiveItem(it))); });
  document.querySelectorAll('#tools .tool[data-slot]').forEach(b => { const g = b.dataset.slot, it = itemOfTk(UI.sel[g]); b.setAttribute('aria-pressed', groupOfTool(S.tool) === g); if (it) { b.querySelector('img').src = iconOf(it); b.dataset.tool = it.u ? 'unit' : it.id; } });
}
// option flyouts (FO2): every choice one click away; they stay open until the same tool again, the × or Esc
function toolOpts(t) {
  const look = { n: 'Look', vals: [{ n: 'Glued wires', img: SWATCH.glued }, { n: 'Striped tube', img: SWATCH.tube }], get: () => WIRES.bundleLook === 'tube' ? 1 : 0, set: i => { WIRES.bundleLook = i ? 'tube' : 'wires'; } };
  switch (t) {
    case 'cable': return { rows: [{ n: 'Gauge', vals: GAUGES.map((g, i) => ({ n: cap1(g.name), img: SWATCH.cable[i] })), get: () => WIRES.gauge, set: i => { WIRES.gauge = i; }, hue: true }, look], note: 'Drag from a floor or cut wall to lay; it anchors on a grid line or hangs free.' };
    case 'tie': return { rows: [{ n: 'Tie', vals: [{ n: 'Round', img: SWATCH.tieRound }, { n: 'Flat ribbon', img: SWATCH.tieFlat }], get: () => WIRES.round ? 0 : 1, set: i => { WIRES.round = !i; } }, Object.assign({}, look, { n: 'Bundle' })], acts: [{ n: 'Jolt', k: 'J', fn: () => jolt() }], note: 'Drag across cables to tie them (Shift-drag with any tool). Drag a bundle head to pay out; drop it on a post or ledge to clamp.' };
    case 'demolish': return { rows: [{ n: 'Scope', vals: [{ n: 'This level', img: SWATCH.level }, { n: 'To the sky', img: SWATCH.sky }], get: () => DEMO.sky ? 1 : 0, set: i => { DEMO.sky = !!i; } }], note: 'Click a module or drag a box; red shows what goes. Cores, lifts and ground stay.' };
    case 'capture': return { step: { n: 'Height', get: () => S.captureH, set: v => { S.captureH = clamp(v, 1, 4); }, fmt: v => v + (v > 1 ? ' levels' : ' level') }, note: 'Drag a box on the active level to save it as a unit.' };
    case 'bridge': case 'unit': return { rows: [{ n: 'Heading', vals: ['+x', '+y', '−x', '−y'].map(n => ({ n, txt: n })), get: () => S.toolRot & 3, set: i => { S.toolRot = i; } }], acts: [{ n: 'Turn', k: 'R', fn: () => { S.toolRot = (S.toolRot + 1) & 3; } }] };
  }
  return null;
}
function foHTML(t) {
  const O = toolOpts(t); if (!O) return '';
  const name = t === 'unit' && S.unit ? S.unit.name : (itemOfTk(t) || { n: cap1(t) }).n;
  let h = `<div class="fo pn" id="flyout" data-fo="${t}"><div class="foh ttl"><span>${name}</span><button type="button" class="fx" data-act="foclose" data-tip="Close" data-key="Esc" aria-label="Close the options">${glyph('xx', 1)}</button></div>`;
  (O.rows || []).forEach((r, ri) => {
    const cur = r.get();
    h += `<div class="r"><span class="cap">${r.n}<b>${r.vals[cur].n}</b></span><div class="tiles">${r.vals.map((v, j) => `<button type="button" class="tile ${cur === j ? 'on' : ''}" data-opt="${ri}" data-v="${j}" data-tip="${v.n}" aria-pressed="${cur === j}">${v.img ? `<img class="sw" src="${v.img}" alt="">` : `<span class="swt">${v.txt}</span>`}</button>`).join('')}</div>`;
    if (r.hue) {
      const gi = WIRES.gauge, hs = GAUGES[gi].hues, k = UI.hue[gi];
      const sw = k == null ? '<i class="hue auto"></i>' : `<i class="hue" style="background:${hs[k]}"></i>`;
      h += `<div class="hue-row"><button type="button" class="hue-t" data-act="hueopen" aria-expanded="${UI.hueOpen}"><span class="cap">Colour</span>${sw}<span>${k == null ? 'cycle' : hs[k]}</span>${glyph(UI.hueOpen ? 'caret' : 'chevr', 1)}</button>${UI.hueOpen ? `<span class="hues"><button type="button" class="${k == null ? 'on' : ''}" data-hue="-1" data-tip="Cycle the gauge’s colours"><i class="hue auto"></i></button>${hs.map((c, j) => `<button type="button" class="${k === j ? 'on' : ''}" data-hue="${j}" data-tip="${c}"><i class="hue" style="background:${c}"></i></button>`).join('')}</span>` : ''}</div>`;
    }
    h += '</div>';
  });
  if (O.step) { const v = O.step.get(); h += `<div class="r"><span class="cap">${O.step.n}<b>${O.step.fmt(v)}</b></span><span class="stp"><button type="button" data-step="-1" aria-label="Less">−</button><b>${v}</b><button type="button" data-step="1" aria-label="More">+</button></span></div>`; }
  if (O.note) h += `<div class="note">${O.note}</div>`;
  if (O.acts) h += `<div class="acts">${O.acts.map((a, j) => `<button type="button" class="btn" data-foact="${j}">${a.n}<kbd>${a.k}</kbd></button>`).join('')}</div>`;
  return h + '</div>';
}
function vwRel(el) { const R = $('viewwrap').getBoundingClientRect(), a = el.getBoundingClientRect(); return { left: a.left - R.left, top: a.top - R.top, right: a.right - R.left, bottom: a.bottom - R.top, w: a.width, h: a.height, cx: (a.left + a.right) / 2 - R.left, cy: (a.top + a.bottom) / 2 - R.top }; }
function renderToolLayer() {
  const lay = $('toolLayer'), st = tbState(); if (!lay) return;
  let h = '';
  if (st === 1) for (const g of UI.open) { const G_ = TOOLS.find(x => x.g === g); if (G_ && (g !== 'units' || UNITS.length)) h += `<div class="grow pn" data-g="${g}">${groupItems(G_).map((it, i) => toolBtn(it, i, 'row')).join('')}</div>`; }
  if (UI.fo && toolOpts(UI.fo)) h += foHTML(UI.fo) + '<div class="fcon"></div>';
  lay.innerHTML = h;
  const nav = $('tools'), N = vwRel(nav), W_ = $('viewwrap').clientWidth, H_ = $('viewwrap').clientHeight;
  lay.querySelectorAll('.grow').forEach(row => {
    const slot = nav.querySelector(`[data-slot="${row.dataset.g}"]`); if (!slot) return; const g = vwRel(slot.closest('.grp')), s = vwRel(slot);
    row.style.left = (N.right + 4) + 'px'; row.style.top = g.top + 'px';
    const gc = document.createElement('div'); gc.className = 'gcon'; Object.assign(gc.style, { left: s.right + 'px', top: Math.round(s.cy) + 'px', width: Math.max(2, N.right + 4 - s.right) + 'px' }); lay.appendChild(gc);
  });
  const fo = $('flyout'); if (!fo) return;
  // where it goes: right of the palette, past the name column (all tools) or the opened rows (groups)
  let a, x0 = N.right, x;
  if (st === 2) { const b = nav.querySelector(`.tool[aria-pressed="true"]`) || nav.querySelector('.tl-thumb'); a = vwRel(b); const lw = Math.max(0, ...[...nav.querySelectorAll('.tool .lb')].map(l => l.offsetWidth)); x = N.right + lw + 18; }
  else if (st === 1) { const rowB = lay.querySelector('.grow .tool[aria-pressed="true"]'), b = rowB || nav.querySelector(`[data-slot="${groupOfTool(S.tool)}"]`) || nav.querySelector('.tl-thumb'); a = vwRel(b); if (rowB) x0 = vwRel(rowB.closest('.grow')).right; x = Math.max(N.right, ...[...lay.querySelectorAll('.grow')].map(r => vwRel(r).right)) + 10; }
  else { a = vwRel(nav.querySelector('.tl-thumb')); x = N.right + 10; }
  const under = st === 1 && lay.querySelector('.grow .tool[aria-pressed="true"]');
  if (under) {   // groups: the options hang directly beneath the tool row, tied to the active tool
    const R = vwRel(under.closest('.grow')), B = vwRel(under), fx = clamp(R.left, 4, W_ - fo.offsetWidth - 4), fy = clamp(R.bottom + 6, 4, H_ - fo.offsetHeight - 34);
    fo.style.left = fx + 'px'; fo.style.top = fy + 'px';
    const con = lay.querySelector('.fcon'); con.classList.add('v'); Object.assign(con.style, { left: Math.round(B.cx) + 'px', top: R.bottom + 'px', height: Math.max(2, fy - R.bottom) + 'px', width: '1px' });
    return;
  }
  const fx = clamp(x, 4, W_ - fo.offsetWidth - 4), fy = clamp(a.top - 4, 4, H_ - fo.offsetHeight - 34);
  fo.style.left = fx + 'px'; fo.style.top = fy + 'px';
  const con = lay.querySelector('.fcon'), w = fx - x0 - 3;
  if (con && w > 6) Object.assign(con.style, { left: x0 + 'px', top: Math.round(a.cy) + 'px', width: w + 'px' }); else if (con) con.remove();
}
function setTool(t, unit, how) {
  const prev = S.tool, prevU = S.unit;
  S.tool = t; S.capture = null;
  if (unit) S.unit = unit;
  const same = prev === t && (t !== 'unit' || prevU === S.unit), has = !!toolOpts(t);
  if (how === 'click') UI.fo = same && UI.fo === t ? null : (has ? t : null);
  else if (!same) UI.fo = has ? t : null;
  const g = groupOfTool(t); if (g) UI.sel[g] = t === 'unit' ? 'u' + UNITS.indexOf(S.unit) : t;
  syncTools(); renderToolLayer(); updateHints();
  if (t !== 'inspect' && t !== 'point' && (S.mode === 'exploded' || S.mode === 'section')) toast('Placing works in Cut plane or Plan views');
}
// exploded and section views fold the palette to its thumb; the cut and plan views restore it
function toolsForMode(m) {
  const over = getComputedStyle($('tools')).position === 'absolute';
  const fold = over && (m === 'exploded' || m === 'section');
  if (fold !== UI.modeFold) { UI.modeFold = fold; renderTools(); }
}
function setToolsState(n) { UI.tb = (n + 3) % 3; UI.modeFold = false; UI.open.clear(); store.set('tools', UI.tb); renderTools(); resize(); }
function closeFlyout() { if (!UI.fo) return false; UI.fo = null; renderToolLayer(); return true; }
function onToolsClick(e) {
  const t = e.target.closest('button'); if (!t) return;
  if (t.dataset.act === 'tlstate') { setToolsState(tbState() + 1); sfx.click(); return; }
  if (t.dataset.slot) {   // one open path: a group at a time, and only a flyout that belongs to it
    const g = t.dataset.slot, opening = !UI.open.has(g);
    UI.open.clear(); if (opening) UI.open.add(g);
    if (UI.fo && (!opening || groupOfTool(UI.fo) !== g)) UI.fo = null;
    document.querySelectorAll('#tools .tool[data-slot]').forEach(b => { const on = UI.open.has(b.dataset.slot); b.classList.toggle('open', on); b.setAttribute('aria-expanded', on); });
    renderToolLayer(); sfx.click(); return;
  }
  if (t.dataset.tk) { const it = itemOfTk(t.dataset.tk); if (it) setTool(it.u ? 'unit' : it.id, it.u, 'click'); return; }
  const O = UI.fo && toolOpts(UI.fo); if (!O) return;
  if (t.dataset.act === 'foclose') { closeFlyout(); return; }
  if (t.dataset.opt != null) { const r = O.rows[+t.dataset.opt]; r.set(+t.dataset.v); }
  else if (t.dataset.act === 'hueopen') UI.hueOpen = !UI.hueOpen;
  else if (t.dataset.hue != null) { const v = +t.dataset.hue; UI.hue[WIRES.gauge] = v < 0 ? null : v; }
  else if (t.dataset.step != null) O.step.set(O.step.get() + +t.dataset.step);
  else if (t.dataset.foact != null) O.acts[+t.dataset.foact].fn();
  else return;
  sfx.click(); renderToolLayer(); updateHints();
}
function addUnitButton(u) {
  const c = mk(30, 22), g = c.getContext('2d'), [w, d, h] = u.size;
  const sc = Math.min(1, 26 / ((w + d) * 8), 20 / ((w + d) * 4 + h * LH)), tmp = mk((w + d) * 8 + 16, (w + d) * 4 + h * LH + 24), tg = tmp.getContext('2d');
  const sorted = u.pieces.slice().sort((a, b2) => a.dz - b2.dz || (a.dx + a.dy) - (b2.dx + b2.dy));
  for (const p of sorted) { const spr = getSprite(p.t, p.t === T.CRANE ? 0 : (TI[p.t].orient ? p.v & 1 : p.v) & 255, 4, 0, 0); tg.drawImage(spr.c, d * 8 + (p.dx - p.dy) * 8 + spr.ox + 8, (p.dx + p.dy) * 4 - p.dz * LH + h * LH + spr.oy + 12); }
  g.imageSmoothingEnabled = false;
  g.drawImage(tmp, 0, 0, tmp.width, tmp.height, (30 - tmp.width * sc) / 2, (22 - tmp.height * sc) / 2, tmp.width * sc, tmp.height * sc);
  u.icon = c.toDataURL();
  UI.sel.units = 'u' + UNITS.indexOf(u);
  renderTools();
}

// ---------- levels panel (decided): ruler <-> expanded, rows faded above the cut, an amber cut line and
// the placement row lit; a window kept on the cut; a grabber sets the floor cutoff ----------
function buildStrip() {
  const ol = $('levels'); let h = '';
  for (let z = NL - 1; z >= 0; z--) {
    h += `<li class="row" data-z="${z}" role="option" aria-label="${LEVELS[z].code} ${LEVELS[z].name}"><span class="c">${LEVELS[z].code}</span><span class="n">${LEVELS[z].name}</span><span class="f"><i></i></span><span class="a"></span><span class="nl">${LEVELS[z].name}</span></li>`;
    if (z === G) h += '<li class="gl" role="presentation"></li>';
  }
  ol.innerHTML = h + '<li class="lv-cut" role="presentation"></li><li class="lv-floor" role="presentation"></li>';
}
function sizeLevels() {
  const st = $('strip'), vw = $('viewwrap'); if (!st || !vw) return;
  const avail = vw.clientHeight - 8 - 40 - (UI.lvx ? 56 : 0) - 13 - 12 - 8 - 34;
  const v = Math.max(96, Math.min(NL * 16 + 8, avail)) + 'px';
  if (st.style.getPropertyValue('--lvh') !== v) { st.style.setProperty('--lvh', v); stripDirty = true; UI.lvSeen = false; }
}
function updateStrip() {
  const st = $('strip'), ol = $('levels'); if (!st || !ol) return;
  st.classList.toggle('lvc', !UI.lvx); st.classList.toggle('lvx', UI.lvx);
  ol.querySelectorAll('.row').forEach(row => {
    const z = +row.dataset.z, f = WORLD.fill[z], fp = Math.round(Math.min(1, f) * 100);
    row.classList.toggle('cut', z === S.level && S.mode !== 'exploded'); row.classList.toggle('above', z > S.level && S.mode !== 'exploded');
    row.classList.toggle('out', S.floor > 0 && z < S.floor); row.classList.toggle('over', f > 0.5 && z >= G);
    row.classList.toggle('ag', AGENT.state !== 'idle' && AGENT.level === z && !!S.agentOn);
    row.setAttribute('aria-selected', z === S.level); row.style.setProperty('--fh', fp + '%'); row.querySelector('.f i').style.width = fp + '%';
  });
  st.classList.toggle('hasfloor', S.floor > 0);
  const cutRow = ol.querySelector(`.row[data-z="${S.level}"]`), fr = S.floor > 0 && ol.querySelector(`.row[data-z="${S.floor}"]`);
  const cl = ol.querySelector('.lv-cut'), fl = ol.querySelector('.lv-floor');
  if (cutRow) { cl.style.top = cutRow.offsetTop + 'px'; cl.style.display = S.mode === 'exploded' ? 'none' : ''; }
  if (fr) fl.style.top = (fr.offsetTop + fr.offsetHeight) + 'px';
  $('stripCut').innerHTML = S.mode === 'exploded' ? 'exploded' : S.level >= NL - 1 ? 'full stack' : `<b>${lvCode(S.level)}</b> ${LEVELS[S.level].name}`;
  st.querySelector('.lv-grab .fv').textContent = S.floor > 0 ? 'floor ' + lvCode(S.floor) : '';
  $('lvToggle').innerHTML = glyph(UI.lvx ? 'fold' : 'unfold'); $('lvToggle').dataset.tip = UI.lvx ? 'Collapse to a ruler' : 'Expand the levels';
  // keep a window of levels centred on the cut (with a floor set, frame both)
  const win = $('lvWin');
  if (win && cutRow && !UI.grabbing) {
    const ct = cutRow.offsetTop, wh = win.clientHeight, fb = fr ? fr.offsetTop + fr.offsetHeight : null;
    let want = fb != null ? (ct + fb) / 2 - wh / 2 : ct - wh / 2 + 8;
    want = clamp(clamp(want, ct + 24 - wh, ct - 8), 0, Math.max(0, ol.offsetHeight - wh));
    ol.style.transition = UI.lvSeen && !REDUCED ? 'transform .2s cubic-bezier(.3,.7,.4,1)' : 'none';
    ol.style.transform = `translateY(${-Math.round(want)}px)`;   // (a transform, so the ruler's names can still pop out sideways)
    UI.lvSeen = true;
  }
  renderThumb();
  stripDirty = false;
}
function renderThumb() {
  const c = $('thumb'), g = c.getContext('2d');
  g.fillStyle = '#101113'; g.fillRect(0, 0, 96, 54);
  const row = S.mode === 'section' ? S.secIdx : 24;
  for (let a = 0; a < W; a++) for (let z = 0; z < NL; z++) {
    const [x, y] = S.mode === 'section' ? secXY(a) : [a, row], t = cell(x, y, z);
    if (!t) continue;
    const cat = TI[t].cat;
    g.fillStyle = t === T.CORE || t === T.LIFT ? '#cfc7b6' : cat === 'earth' ? '#3a2f25' : cat === 'circ' ? '#b08a3e' : cat === 'land' ? (t === T.WATER ? '#3f7d73' : '#5d893d') : cat === 'infill' ? '#8a7f70' : '#55585b';
    g.fillRect(Math.floor(a * 96 / W), Math.floor((NL - 1 - z) * 54 / NL), Math.ceil(96 / W), Math.ceil(54 / NL));
  }
  if (S.floor > 0) { g.fillStyle = 'rgba(16,17,19,0.7)'; const yf = Math.floor((NL - S.floor) * 54 / NL); g.fillRect(0, yf, 96, 54 - yf); }
  g.fillStyle = 'rgba(232,168,60,0.95)';
  const y = Math.floor((NL - 1 - S.level) * 54 / NL);
  g.fillRect(0, y, 96, 1); g.fillRect(0, y + 2, 96, 1);
  if (AGENT.state !== 'idle' && S.agentOn) { g.fillStyle = '#ff7a52'; g.fillRect(94, Math.floor((NL - 1 - AGENT.level) * 54 / NL), 2, 2); }
}
function levelAt(z) { if (S.mode === 'exploded') setMode('cut'); setLevel(clamp(z, 0, NL - 1)); }
function setupLevels() {
  buildStrip(); sizeLevels();
  const ol = $('levels'), st = $('strip');
  ol.addEventListener('click', e => { const r = e.target.closest('.row'); if (r) { levelAt(+r.dataset.z); ol.focus({ preventScroll: true }); } });
  ol.addEventListener('keydown', e => {
    const sh = e.shiftKey; let z = S.level, f = S.floor > 0 ? S.floor : 0;
    if (e.key === 'ArrowUp') sh ? f++ : z++; else if (e.key === 'ArrowDown') sh ? f-- : z--;
    else if (e.key === 'PageUp') z += 4; else if (e.key === 'PageDown') z -= 4;
    else if (e.key === 'Home') z = NL - 1; else if (e.key === 'End') z = Math.max(0, S.floor);
    else return;
    e.preventDefault(); e.stopPropagation();
    if (sh && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) setFloor(f); else levelAt(z);
  });
  // two-finger scroll over the list scrubs the cut (the "MRI scrub"; it may be a little easy to trigger)
  let acc = 0;
  $('lvWin').addEventListener('wheel', e => { if (e.ctrlKey) return; e.preventDefault(); acc += e.deltaY * (e.deltaMode === 1 ? 30 : 1); if (Math.abs(acc) > 30) { levelAt(S.level + (acc < 0 ? 1 : -1)); acc = 0; } }, { passive: false });
  $('lvToggle').addEventListener('click', () => { UI.lvx = !UI.lvx; UI.lvSeen = false; store.set('levels', UI.lvx ? 'x' : 'c'); sizeLevels(); updateStrip(); resize(); sfx.click(); });
  $('thumb').addEventListener('click', e => { const r = e.target.getBoundingClientRect(); levelAt(NL - 1 - Math.floor((e.clientY - r.top) / r.height * NL)); });
  // the floor grabber: drag up to cut away the levels below; back down to the bottom to remove it
  $('lvGrab').addEventListener('pointerdown', e => {
    e.preventDefault(); const gb = e.currentTarget; try { gb.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    st.classList.add('dragging'); UI.grabbing = true;
    const move = ev => {
      const win = $('lvWin').getBoundingClientRect(); let best = -1, bd = 1e9;
      if (ev.clientY < win.bottom - 4) for (const row of ol.querySelectorAll('.row')) { const b = row.getBoundingClientRect(); if (b.bottom > win.bottom + 1 || b.top < win.top - 1) continue; const d = Math.abs(b.bottom - ev.clientY); if (d < bd) { bd = d; best = +row.dataset.z; } }
      setFloor(best);
    };
    const up = () => { gb.removeEventListener('pointermove', move); gb.removeEventListener('pointerup', up); gb.removeEventListener('pointercancel', up); st.classList.remove('dragging'); UI.grabbing = false; stripDirty = true; };
    gb.addEventListener('pointermove', move); gb.addEventListener('pointerup', up); gb.addEventListener('pointercancel', up);
  });
  $('lvGrab').addEventListener('keydown', e => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); setFloor((S.floor > 0 ? S.floor : 0) + (e.key === 'ArrowUp' ? 1 : -1)); } });
}

// ---------- shared controls: groove sliders (drag / arrow keys), toggles, steppers ----------
const SLD = {
  vol: { lo: 0, hi: 1, get: () => AUD.vol, set: v => { AUD.vol = v; applyVol(); } },
  mistA: { lo: 0, hi: 0.08, get: () => LIT.mistA, set: v => { LIT.mistA = Math.round(v / 0.005) * 0.005; } },
  shaftK: { lo: 0, hi: 2, get: () => LIT.shaftK, set: v => { LIT.shaftK = Math.round(v * 10) / 10; } },
  bloomK: { lo: 0, hi: 2, get: () => LIT.bloomK, set: v => { LIT.bloomK = Math.round(v * 10) / 10; } }
};
function slHTML(k, dis) { const s = SLD[k], v = clamp((s.get() - s.lo) / (s.hi - s.lo), 0, 1); return `<span class="sl ${dis ? 'dis' : ''}" data-sl="${k}" tabindex="${dis ? -1 : 0}" role="slider" aria-valuenow="${Math.round(v * 100)}" aria-valuemin="0" aria-valuemax="100" style="--v:${v.toFixed(3)}"><span class="tr"><i class="fl"></i></span><i class="th"></i></span>`; }
function syncSliders() { document.querySelectorAll('.sl[data-sl]').forEach(el => { const s = SLD[el.dataset.sl]; if (!s) return; const v = clamp((s.get() - s.lo) / (s.hi - s.lo), 0, 1); el.style.setProperty('--v', v.toFixed(3)); el.setAttribute('aria-valuenow', Math.round(v * 100)); }); }
function slSet(k, v) { const s = SLD[k]; s.set(s.lo + clamp(v, 0, 1) * (s.hi - s.lo)); syncSliders(); }
function setupControls() {
  document.addEventListener('pointerdown', e => {
    const sl = e.target.closest && e.target.closest('.sl[data-sl]'); if (!sl || sl.classList.contains('dis')) return;
    e.preventDefault(); try { sl.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    const box = sl.getBoundingClientRect(), move = ev => slSet(sl.dataset.sl, (ev.clientX - box.left - 4.5) / (box.width - 9));
    move(e); sl.focus({ preventScroll: true });
    const up = () => { sl.removeEventListener('pointermove', move); sl.removeEventListener('pointerup', up); sl.removeEventListener('pointercancel', up); };
    sl.addEventListener('pointermove', move); sl.addEventListener('pointerup', up); sl.addEventListener('pointercancel', up);
  });
  document.addEventListener('keydown', e => {
    const sl = e.target.closest && e.target.closest('.sl[data-sl]'); if (!sl || !/^Arrow|^Home$|^End$/.test(e.key)) return;
    e.preventDefault(); e.stopPropagation();
    const s = SLD[sl.dataset.sl], v = (s.get() - s.lo) / (s.hi - s.lo);
    slSet(sl.dataset.sl, e.key === 'Home' ? 0 : e.key === 'End' ? 1 : v + (e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 0.05 : -0.05));
  });
}

// ---------- tooltips (chrome only; the scene keeps its own hover tip) ----------
const TIP = { el: null, t: 0, hid: 0 };
function setupTooltips() {
  const tip = $('ctip');
  const hide = () => { TIP.el = null; clearTimeout(TIP.t); if (tip.classList.contains('show')) { tip.classList.remove('show'); TIP.hid = performance.now(); } };
  document.addEventListener('mouseover', e => {
    const el = e.target.closest && e.target.closest('[data-tip]');
    if (!el) { hide(); return; }
    if (el === TIP.el) return;
    TIP.el = el; clearTimeout(TIP.t);
    const go = () => {
      if (TIP.el !== el || !el.isConnected || UI.help) return;
      const k = el.dataset.key, hint = el.dataset.hint;
      tip.innerHTML = `<b>${el.dataset.tip}</b>${k ? `<kbd>${k}</kbd>` : ''}${hint ? `<span class="hint">${hint}</span>` : ''}`;
      const a = el.getBoundingClientRect(), tw = tip.offsetWidth, th = tip.offsetHeight;
      const d = el.dataset.tipdir || (el.closest('#side,#strip') ? 'l' : el.closest('#tools,#toolLayer') ? 'r' : el.closest('#status') ? 'u' : 'd');
      let x, y;
      if (d === 'r') { x = a.right + 8; y = (a.top + a.bottom) / 2 - th / 2; } else if (d === 'l') { x = a.left - tw - 8; y = (a.top + a.bottom) / 2 - th / 2; } else if (d === 'u') { x = (a.left + a.right) / 2 - tw / 2; y = a.top - th - 7; } else { x = (a.left + a.right) / 2 - tw / 2; y = a.bottom + 7; }
      tip.style.left = clamp(x, 4, innerWidth - tw - 4) + 'px'; tip.style.top = clamp(y, 4, innerHeight - th - 4) + 'px'; tip.classList.add('show');
    };
    TIP.t = setTimeout(go, performance.now() - TIP.hid < 400 ? 0 : 380);
  });
  document.addEventListener('mouseout', e => { const el = e.target.closest && e.target.closest('[data-tip]'); if (el && !el.contains(e.relatedTarget)) hide(); });
  document.addEventListener('pointerdown', hide, true);
}

// ---------- help bubbles: one global toggle (? in the bar, or the ? key); the panel under the pointer explains itself ----------
const HELP = {
  tb: { el: '#topbar', side: 'd', items: [['#logoMark', 'The mark: click to try the next one'], ['#wmText', 'World menu: sheet, seed, presets, save slots, keys'], ['[data-mode="cut"]', 'Views: cut, exploded, plan, section · <kbd>1</kbd>–<kbd>4</kbd>'], ['#bGhost', 'Levels above the cut as outlines · <kbd>G</kbd>'], ['#bFollow', 'Follow claude’s level · <kbd>F</kbd>'], ['#bLightMenu', 'Lighting settings (or right-click the bulb)'], ['#bTod', 'Time of day · <kbd>T</kbd>'], ['#bRotL', 'Rotate the view · <kbd>Q</kbd> <kbd>E</kbd>'], ['#bAgent', 'claude on/off'], ['#bSound', 'Start the ambience'], ['#vol', 'Volume'], ['#bUiTone', 'Light / dark interface'], ['#bHelp', 'Help on/off · <kbd>?</kbd>']] },
  tl: { el: '#tools', side: 'r', extra: '#toolLayer .grow, #flyout', items: [['.tl-thumb', 'Collapsed · groups · all tools · <kbd>`</kbd>'], ['[data-slot="build"]', 'A group: click to stick its tools out; they stay out'], ['.grow', 'Its tools. Click one; click it again for its options'], ['#flyout', 'Options stay open until the same tool, × or <kbd>Esc</kbd>'], ['#tools .tool[aria-pressed="true"]', 'The tool in use']] },
  lv: { el: '#strip', side: 'l', items: [['#lvToggle', 'Collapse to a thin ruler, or expand'], ['#stripCut', 'The cut: the level you build on'], ['#thumb', 'Section through the stack; click to cut there'], ['#levels .row.above', 'Above the cut: removed from the view'], ['#levels .row.cut', 'Click a row, <kbd>↑</kbd> <kbd>↓</kbd>, or scroll over the list to move the cut'], ['#levels .row.cut .f', 'How built-up the level is; the tick is 50%'], ['#levels .row.ag .a', 'claude is working on this level'], ['#lvGrab', 'Drag up to cut away the levels below too (<kbd>Shift</kbd> <kbd>↑</kbd> <kbd>↓</kbd>)']] },
  sb: { el: '#side', side: 'l', items: [['#sbGlyph', 'claude, and what it is doing now'], ['#feedFilter', 'Everything, just the log, or just the chat'], ['#feed', 'What claude did and said; newest at the bottom'], ['#sugg', 'Quick requests'], ['#chatf', 'Ask claude. <kbd>Alt</kbd>-click the scene to point'], ['#sbFold', 'Collapse · <kbd>\\</kbd>'], ['.sb-rail .rb.cl', 'Expand · <kbd>\\</kbd>']] },
  st: { el: '#status', side: 'u', items: [['#slice', 'The cut you are editing'], ['#hints', 'Keys for the current tool'], ['#zoomStep', 'Zoom · <kbd>+</kbd> <kbd>−</kbd>']] }
};
const PANEL_SEL = '#topbar, #tools, #toolLayer, #strip, #side, #status';
function panelKey(el) { const p = el && el.closest && el.closest(PANEL_SEL); if (!p) return null; return { topbar: 'tb', tools: 'tl', toolLayer: 'tl', strip: 'lv', side: 'sb', status: 'st' }[p.id]; }
function toggleHelp(v) { UI.help = v == null ? !UI.help : v; if (UI.help && !UI.helpP) UI.helpP = UI.hoverPanel || 'tb'; $('bHelp').setAttribute('aria-pressed', UI.help); UI.helpSig = ''; layoutHelp(); }
function layoutHelp() {
  const lay = $('helpLayer');
  if (!UI.help) { if (lay.innerHTML) lay.innerHTML = ''; UI.helpSig = ''; return; }
  const p = UI.helpP || 'tb', D = HELP[p], panel = document.querySelector(D.el);
  if (!panel || !panel.getClientRects().length) { lay.innerHTML = ''; return; }
  const R = r => { const a = r.getBoundingClientRect(); return { left: a.left, top: a.top, right: a.right, bottom: a.bottom, w: a.width, h: a.height, cx: (a.left + a.right) / 2, cy: (a.top + a.bottom) / 2 }; };
  const P = R(panel);
  if (D.extra) document.querySelectorAll(D.extra).forEach(x => { const q = R(x); P.right = Math.max(P.right, q.right); P.bottom = Math.max(P.bottom, q.bottom); });
  const found = [];
  for (const [sel, text] of D.items) { const t = panel.querySelector(sel) || document.querySelector(sel); if (!t || !t.getClientRects().length) continue; const a = R(t); if (!a.w && !a.h) continue; if (D.side !== 'd' && D.side !== 'u' && (a.cy < P.top - 2 || a.cy > P.bottom + 2)) continue; found.push({ a, text }); }
  const sig = p + '|' + found.map(f => Math.round(f.a.left) + ',' + Math.round(f.a.top)).join(';') + '|' + innerWidth + 'x' + innerHeight;
  if (sig === UI.helpSig) return;
  UI.helpSig = sig; lay.innerHTML = '';
  const W_ = innerWidth, H_ = innerHeight, items = [];
  for (const f of found) { const b = document.createElement('div'); b.className = 'hbub'; b.innerHTML = f.text; b.style.left = '0px'; b.style.top = '0px'; lay.appendChild(b); items.push({ b, a: f.a, w: b.offsetWidth, h: b.offsetHeight }); }
  // one column beside a side panel, or two staggered rows under / over a bar, each relaxed so the
  // bubbles sit near what they label without overlapping; ordered like the targets so leaders never cross
  const spread = (arr, lo, hi, gap) => {
    const cl = arr.map((a, i) => ({ i0: i, i1: i, size: a.s, top: a.t - a.s / 2 }));
    const ideal = c => { let off = 0, sum = 0; for (let i = c.i0; i <= c.i1; i++) { sum += arr[i].t - off - arr[i].s / 2; off += arr[i].s + gap; } return sum / (c.i1 - c.i0 + 1); };
    for (let guard = 0; guard < 200; guard++) { const k = cl.findIndex((a, q) => q < cl.length - 1 && a.top + a.size + gap > cl[q + 1].top); if (k < 0) break; const a = cl[k], b = cl[k + 1], m = { i0: a.i0, i1: b.i1, size: a.size + gap + b.size }; m.top = ideal(m); cl.splice(k, 2, m); }
    cl.forEach(c => { let off = c.top; for (let i = c.i0; i <= c.i1; i++) { arr[i].p = off; off += arr[i].s + gap; } });
    for (let i = 0; i < arr.length; i++) arr[i].p = Math.max(arr[i].p, i ? arr[i - 1].p + arr[i - 1].s + gap : lo);
    for (let i = arr.length - 1; i >= 0; i--) arr[i].p = Math.min(arr[i].p, i < arr.length - 1 ? arr[i + 1].p - gap - arr[i].s : hi - arr[i].s);
    for (let i = 0; i < arr.length; i++) arr[i].p = Math.max(arr[i].p, i ? arr[i - 1].p + arr[i - 1].s + gap : lo);
  };
  if (D.side === 'd' || D.side === 'u') {
    items.sort((m, n) => m.a.cx - n.a.cx);
    const tot = items.reduce((t, o) => t + o.w + 10, 0), two = tot > (W_ - 8) * .55, rh = Math.max(...items.map(o => o.h));
    const rows = two ? [items.filter((_, i) => i % 2 === 0), items.filter((_, i) => i % 2 === 1)] : [items];
    rows.forEach((row, ri) => { row.forEach(o => { o.t = o.a.cx; o.s = o.w; }); spread(row, 4, W_ - 4, 12); row.forEach(o => { o.x = o.p; o.y = D.side === 'd' ? P.bottom + 14 + ri * (rh + 14) : P.top - 14 - o.h - ri * (rh + 14); }); });
  } else {
    const left = D.side === 'l', top0 = $('topbar').getBoundingClientRect().bottom + 6;
    items.sort((m, n) => m.a.cy - n.a.cy);
    items.forEach(o => { o.t = o.a.cy; o.s = o.h; });
    spread(items, top0, H_ - 6, 8);
    items.forEach((o, i) => { o.y = o.p; o.x = clamp(left ? P.left - 18 - o.w - (i % 2) * 14 : P.right + 18 + (i % 2) * 14, 4, W_ - o.w - 4); });
  }
  let svg = '';
  for (const o of items) {
    o.b.style.left = o.x + 'px'; o.b.style.top = o.y + 'px';
    const a = o.a; let ax, ay;
    if (D.side === 'd') { ax = clamp(a.cx, o.x + 6, o.x + o.w - 6); ay = o.y; } else if (D.side === 'u') { ax = clamp(a.cx, o.x + 6, o.x + o.w - 6); ay = o.y + o.h; }
    else { ay = clamp(a.cy, o.y + 5, o.y + o.h - 5); ax = D.side === 'l' ? o.x + o.w : o.x; }
    const tx = clamp(ax, a.left + Math.min(4, a.w / 2), a.right - Math.min(4, a.w / 2)), ty = clamp(ay, a.top + Math.min(4, a.h / 2), a.bottom - Math.min(4, a.h / 2));
    svg += `<line x1="${ax}" y1="${ay}" x2="${tx}" y2="${ty}"/><circle cx="${tx}" cy="${ty}" r="2.5"/>`;
  }
  lay.insertAdjacentHTML('afterbegin', `<svg width="${W_}" height="${H_}">${svg}</svg>`);
}

// ---------- the agent feed (decided: log and chat in one timeline, filtered; collapses to the slim rail) ----------
function feedAppend(li) {
  const el = $('feed'), atEnd = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  el.appendChild(li);
  while (el.children.length > 160) el.removeChild(el.firstChild);
  if (atEnd || !li.classList.contains('lg')) el.scrollTop = el.scrollHeight;
  if (document.body.classList.contains('sb-off')) { UI.unread++; $('railBadge').textContent = UI.unread > 9 ? '9+' : UI.unread; }
}
// consecutive entries of the same kind (same actor, same words once numbers are set aside)
// fold into one row with a count; click it to see each one
const logSig = (owner, text) => owner + '|' + text.replace(/\(.*?\)/g, '').replace(/[\d/]+/g, '#').split(/\s+/).slice(0, 3).join(' ');
function log(owner, text, cls) {
  const sig = logSig(owner, text), last = $('feed').lastElementChild;
  if (last && last.dataset.sig === sig) {
    const sub = last.querySelector('.sub') || (() => {
      const o = document.createElement('ol'); o.className = 'sub';
      const first = document.createElement('li'); first.textContent = last.dataset.text; o.appendChild(first);
      last.classList.add('grp'); last.appendChild(o);
      last.querySelector('span').addEventListener('click', () => last.classList.toggle('open'));
      return o;
    })();
    const it = document.createElement('li'); it.textContent = fmtTime(S.time) + ' ' + text; sub.appendChild(it);
    const n = sub.children.length, sp = last.querySelector('span');
    sp.querySelector('time').textContent = fmtTime(S.time);
    sp.childNodes[1].textContent = (OWN[owner] ? OWN[owner].name : owner) + ' · ' + text;   // [0] is the time
    let c = sp.querySelector('.cnt'); if (!c) { c = document.createElement('b'); c.className = 'cnt'; sp.appendChild(c); const ch = document.createElement('i'); ch.className = 'chev'; ch.textContent = '›'; sp.appendChild(ch); }
    c.textContent = '×' + n;
    return;
  }
  const li = document.createElement('li');
  li.dataset.sig = sig; li.dataset.text = fmtTime(S.time) + ' ' + text;
  li.className = 'lg ' + owner + ' ' + (cls || '') + ' new';
  const tm = document.createElement('time'); tm.textContent = fmtTime(S.time);
  const sp = document.createElement('span'); sp.appendChild(tm); sp.appendChild(document.createTextNode((OWN[owner] ? OWN[owner].name : owner) + ' · ' + text));
  li.appendChild(sp); feedAppend(li);
  setTimeout(() => li.classList.remove('new'), 1800);
}
function addMsg(who, text, ctx) {
  const li = document.createElement('li');
  li.className = 'm ' + (who === 'me' ? 'me' : 'ai');
  if (ctx) { const s = document.createElement('span'); s.className = 'ctx'; s.textContent = ctx; li.appendChild(s); }
  if (who !== 'me') { const b = document.createElement('b'); b.textContent = 'claude '; li.appendChild(b); }
  li.appendChild(document.createTextNode(text));
  feedAppend(li);
}
function setFeed(f) {
  UI.feed = f; $('feed').className = 'f-' + f;
  const fl = $('feedFilter'), i = ['all', 'log', 'chat'].indexOf(f);
  fl.style.setProperty('--i', i); fl.querySelectorAll('button').forEach(b => { const on = b.dataset.feed === f; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
  $('feed').scrollTop = $('feed').scrollHeight;
}
// pausing claude's proposals: no new surveys or approve/reject cards until resumed; an open one is withdrawn
function setProposalsMuted(on, quiet) {
  S.propMute = on; AGENT.paused = on; store.set('propMute', on ? '1' : '0');
  const b = $('sbMute'); b.setAttribute('aria-pressed', on); b.dataset.tip = on ? 'Resume claude’s proposals' : 'Pause claude’s proposals'; b.setAttribute('aria-label', b.dataset.tip);
  if (on && CARDJOB && CARDJOB.status === 'proposed') rejectQuiet(CARDJOB);
  if (on) setAgentState('idle', 'proposals paused'); else if (AGENT.state === 'idle') setAgentState('idle', 'idle');
  if (!quiet) { log('you', on ? 'Paused claude’s proposals' : 'Resumed claude’s proposals', 'sys'); sfx.click(); }
}
function setSidebar(open) {
  document.body.classList.toggle('sb-off', !open); store.set('side', open ? 'open' : 'rail');
  if (open) { UI.unread = 0; $('railBadge').textContent = ''; $('feed').scrollTop = $('feed').scrollHeight; }
  resize();
}
function toast(text) { const t = $('toast'); t.textContent = text; t.hidden = false; toastT = S.time + 2.6; }
function showCard(j) {
  CARDJOB = j; $('card').hidden = false;
  const ph = [0, 0, 0], zs = j.pieces.map(p => p.z);
  j.pieces.forEach(p => { if (p.state !== 'blocked') ph[p.ph]++; });
  const blocked = j.pieces.filter(p => p.state === 'blocked').length;
  $('cNo').textContent = 'Proposal ' + pad2(j.no);
  $('cBy').textContent = 'by ' + OWN[j.owner].name; $('cBy').className = 'by' + (j.owner === 'you' ? ' you' : '');
  $('cTitle').textContent = j.name;
  $('cSite').textContent = `(${j.site.x},${j.site.y}) · ${lvCode(Math.min(...zs))}–${lvCode(Math.max(...zs))}`;
  $('cParts').textContent = `${ph[0]} structure · ${ph[1]} infill · ${ph[2]} fit-out${blocked ? ' · ' + blocked + ' blocked' : ''}`;
  $('cCost').textContent = '¤ ' + j.m.cost.toLocaleString('en-US');
  $('cRes').textContent = j.m.res ? '+' + j.m.res + ' households' : '—';
  const drop = j.m.before - j.m.after;
  $('cLight').textContent = j.m.probeZ >= 0 ? `${lvCode(j.m.probeZ)}: ${Math.round(j.m.before * 100)}% → ${Math.round(j.m.after * 100)}% sky` : '—';
  $('cLight').className = drop > 0.12 ? 'warn' : '';
  $('cFill').textContent = j.m.zf != null ? `${lvCode(j.m.zf)}: ${Math.round(j.m.fb * 100)}% → ${Math.round(j.m.fa * 100)}% (cap 50%)` : '—';
  $('cFill').className = j.m.fa > 0.5 ? 'warn' : '';
}
function hideCard() { CARDJOB = null; $('card').hidden = true; }
function renderChips() {
  const el = $('chips'); el.innerHTML = '';
  S.pins.forEach((p, k) => {
    const s = document.createElement('span'); s.className = 'chip';
    s.appendChild(document.createTextNode(`◎${k + 1} ${TI[p.t].name} @ (${p.x},${p.y},${lvCode(p.z)})`));
    const x = document.createElement('button'); x.type = 'button'; x.textContent = '×'; x.setAttribute('aria-label', 'Remove pin ' + (k + 1));
    x.onclick = () => { S.pins.splice(k, 1); renderChips(); };
    s.appendChild(x); el.appendChild(s);
  });
}
function addPin(h) {
  const t = cell(h.x, h.y, h.z);
  S.pins.push({ x: h.x, y: h.y, z: h.z, t, id: ++pinSeq });
  if (S.pins.length > 4) S.pins.shift();
  renderChips(); sfx.pin();
  toast(`Pinned ${TI[t].name} @ (${h.x},${h.y},${lvCode(h.z)}) — now ask claude in the chat`);
}
function sendChat(text) {
  text = text.trim(); if (!text) return;
  const pin = S.pins[S.pins.length - 1];
  addMsg('me', text, pin ? `Selected: ${TI[pin.t].name} @ (${pin.x},${pin.y},${lvCode(pin.z)})` : null);
  sfx.chat();
  setTimeout(() => { addMsg('ai', chatRespond(text)); sfx.chat(); }, REDUCED ? 50 : 600);
}
function describe(h) {
  if (!h) return '';
  const t = h.t, nm = t ? TI[t].name : 'open air';
  return `${nm} · (${h.x},${h.y}) · ${lvCode(h.z)} ${LEVELS[h.z].name}`;
}

// ---------- status line (BB3) and the bar's live state ----------
function updateHints() {
  const el = $('hints'); if (!el) return;
  const h = (HINTS[S.tool] || []).map(x => `<span><b>${x[0]}</b>${x[1]}</span>`).join('');
  if (el.innerHTML !== h) el.innerHTML = h;
}
function updateStatus() {
  const sl = $('slice'), sliced = S.level < NL - 1;
  let txt, on = false;
  if (S.mode === 'exploded') txt = 'Exploded · ' + STRATA.length + ' strata';
  else if (S.mode === 'plan') { txt = 'Plan ' + lvCode(S.level); on = true; }
  else if (S.mode === 'section') txt = 'Section ' + (S.secAxis === 'x' ? 'row ' : 'col ') + S.secIdx;
  else if (sliced) { txt = 'Slice · ' + lvCode(S.level); on = true; }
  else txt = 'Full stack';
  if (sl.textContent !== txt) sl.textContent = txt; sl.classList.toggle('on', on);
  const h = S.hover;
  let ht = '';
  if (h) {
    ht = `<b>${(h.t ? TI[h.t].name : 'open air')}</b> · (${h.x},${h.y}) · ${lvCode(h.z)}`;
    if (h.top) ht += ' · read-only (dbl-click to cut here)';
    else if (h.stratum != null) ht += ` · stratum “${STRATA[h.stratum][2]}” — click to focus`;
    else if (!h.t && S.mode === 'cut' && sliced) { for (let z = h.z - 1; z >= 0; z--) { const b = cell(h.x, h.y, z); if (b) { ht += ` · open: you see ${TI[b].name} on ${lvCode(z)}`; break; } } }
  } else if (S.mode === 'cut' && !sliced) ht = 'Full stack: picks are read-only · dbl-click a part to cut to its level';
  else if (S.mode === 'cut' || S.mode === 'plan') ht = `Editing ${lvCode(S.level)} ${LEVELS[S.level].name} only`;
  const hv = $('hover'); if (hv.innerHTML !== ht) hv.innerHTML = ht;
  const vi = `${['N', 'E', 'S', 'W'][S.rot]}-up · ${TODS[S.tod].name.toLowerCase()}`; if ($('viewinfo').textContent !== vi) $('viewinfo').textContent = vi;
  const zv = '×' + S.zoom; if ($('zoomv').textContent !== zv) $('zoomv').textContent = zv;
  document.querySelectorAll('.tb-modes [data-mode]').forEach(b => b.setAttribute('aria-selected', b.dataset.mode === S.mode ? 'true' : 'false'));
  syncBar();
}
function syncBar() {
  const tn = LIT.on ? LIT.sun : ({ day: 'noon', dusk: 'evening', night: 'night' }[S.tod] || 'noon'), bt = $('bTod');
  if (bt.dataset.g !== tn) { bt.dataset.g = tn; bt.innerHTML = glyph(tn) + `<span class="sr" id="todv">${$('todv') ? $('todv').textContent : ''}</span>`; }
  bt.dataset.tip = 'Time of day: ' + ($('todv') ? $('todv').textContent : '');
  const live = !!(AUD.ctx && AUD.on), bs = $('bSound');
  bs.classList.toggle('live', live); bs.setAttribute('aria-pressed', live); bs.dataset.tip = live ? 'Sound: live (click to stop)' : 'Sound: start the procedural ambience';
  $('bLightMenu').classList.toggle('open', !!($('lightPop') && !$('lightPop').hidden));
}
function updateTip(cssX, cssY) {
  const tip = $('tip'), h = S.hover;
  if (!h || cssX == null) { tip.style.transform = 'translate(-9999px,0)'; return; }
  let s = `<b>${lvCode(h.z)}</b> ${h.t ? TI[h.t].name : 'open air'} · ${h.x},${h.y}`;
  const ws = WIRES.ptr && wireHover(WIRES.ptr[0], WIRES.ptr[1]); if (ws) s = ws;
  if (S.tool === 'capture' && S.capture) s = `capture ${Math.abs(S.capture.x1 - S.capture.x0) + 1}×${Math.abs(S.capture.y1 - S.capture.y0) + 1}×${S.captureH}`;
  if (tip.innerHTML !== s) tip.innerHTML = s;
  const x = Math.min(cssX + 16, S.cssW - tip.offsetWidth - 4), y = Math.min(cssY + 18, S.cssH - 50);
  tip.style.transform = `translate(${x}px,${y}px)`;
}
function updateAgentDom() {
  const A = AGENT, sc = A.screen, tag = $('agentTag'), bub = $('bubble');
  if (!sc) { tag.style.transform = bub.style.transform = 'translate(-9999px,0)'; return; }
  const X = sc[0] * S.zoom, Y = sc[1] * S.zoom, off = !!sc[3];
  tag.classList.toggle('off', off);
  const label = 'claude' + (off ? ' · ' + lvCode(A.level) : '');
  if (tag.textContent !== label) tag.textContent = label;
  tag.style.transform = `translate(${Math.round(clamp(X + 11 * S.zoom, S.safeL + 2, S.cssW - S.safeR - tag.offsetWidth - 4))}px,${Math.round(Math.min(Y + 13 * S.zoom, S.cssH - 44))}px)`;
  if (S.time < A.speechT) {
    const bx = Math.max(S.safeL + 4, Math.min(X + 12, S.cssW - S.safeR - bub.offsetWidth - 6));
    let by = Y - bub.offsetHeight - 10;
    if (by < 4) by = Math.min(Y + 18 * S.zoom + 8, S.cssH - bub.offsetHeight - 40);
    bub.style.transform = `translate(${Math.round(bx)}px,${Math.round(by)}px)`;
    bub.classList.toggle('dim', off);
  } else bub.style.transform = 'translate(-9999px,0)';
}
let helpAcc = 0;
function uiTick() {
  if (stripDirty) updateStrip();
  updateStatus();
  if (CARDJOB) { const r = clamp((CARDJOB.approveAt - S.time) / 8, 0, 1); $('cTimer').style.width = (r * 100).toFixed(1) + '%'; }
  if (toastT && S.time > toastT) { $('toast').hidden = true; toastT = 0; }
  if (UI.help && ++helpAcc % 3 === 0) layoutHelp();
}
// Esc peels the top layer: popovers, then help, then the flyout; true when it closed something
function closeLayers() {
  for (const id of ['keysPop', 'worldPop', 'lightPop']) { const p = $(id); if (p && !p.hidden) { p.hidden = true; if (id === 'worldPop') $('wmText').setAttribute('aria-expanded', 'false'); syncBar(); return true; } }
  if (UI.help) { toggleHelp(false); return true; }
  return closeFlyout();
}
// the keyboard sheet (from the world menu)
const KEYS = [
  ['View', [['Drag · two-finger scroll', 'pan'], ['Pinch · + −', 'zoom'], ['[ ] · PgUp PgDn', 'level'], ['1–4', 'cut · exploded · plan · section'], ['Q E', 'rotate'], ['G · F', 'ghost · follow'], ['I · T', 'light · time of day'], ['dbl-click', 'go to that level']]],
  ['Tools', [['V C P', 'inspect · capture · point'], ['B', 'cycle build tools'], ['X', 'demolish'], ['R', 'turn / next option'], ['`', 'tool palette state'], ['Esc', 'close · cancel']]],
  ['Wires', [['L Y K H', 'cable · tie · post · girder'], ['Shift-drag', 'tie with any tool'], ['J', 'jolt'], ['⌥-click', 'remove'], ['⌘-drag', 'slack'], ['⌘Z · ⌘⇧Z', 'undo · redo']]],
  ['Agent + views', [['Alt-click · long-press', 'point for claude'], ['Enter · Del', 'approve · reject'], ['\\', 'claude panel'], [', . · X', 'section: move · axis'], ['?', 'help bubbles']]]
];
function openKeys() {
  let pop = $('keysPop');
  if (!pop) { pop = document.createElement('div'); pop.id = 'keysPop'; pop.className = 'popm pn'; pop.hidden = true; document.body.appendChild(pop); pop.innerHTML = `<div class="lp-h ttl"><span>Keys</span><span class="lp-dim">Esc closes</span></div>` + KEYS.map(([h, rows]) => `<div><h4>${h}</h4>${rows.map(r => `<div class="kr"><b>${r[0]}</b>${r[1]}</div>`).join('')}</div>`).join(''); document.addEventListener('pointerdown', e => { if (!pop.hidden && !pop.contains(e.target)) pop.hidden = true; }); }
  pop.hidden = false; pop.style.left = Math.max(8, (innerWidth - pop.offsetWidth) / 2) + 'px'; pop.style.top = Math.max(50, (innerHeight - pop.offsetHeight) / 2) + 'px';
}

function setupUI() {
  const tone = store.get('tone', 'dark'); UICFG.MT = tone === 'dark' ? 10 : 11;
  UI.logo = clamp(+store.get('logo', 0) || 0, 0, LOGOS.length - 1); UICFG.LG = LOGOS[UI.logo];
  UI.tb = clamp(+store.get('tools', 1), 0, 2);
  UI.lvx = store.get('levels', innerWidth < 860 ? 'c' : 'x') === 'x';
  applyChrome(); drawToolIcons();
  // the bar's pixel icons
  document.querySelectorAll('#topbar [data-g]').forEach(b => { if (b.id !== 'bTod') b.insertAdjacentHTML('afterbegin', glyph(b.dataset.g)); });
  $('bLightMenu').innerHTML = glyph('caret', 1);
  $('wmWord').innerHTML = glyph(WORDMARKS[UICFG.WF][0], WORDMARKS[UICFG.WF][1]);
  $('logoMark').innerHTML = markSVG(LOGOS[UI.logo]);
  $('logoMark').addEventListener('click', () => { UI.logo = (UI.logo + 1) % LOGOS.length; UICFG.LG = LOGOS[UI.logo]; store.set('logo', UI.logo); $('logoMark').innerHTML = markSVG(LOGOS[UI.logo]); document.body.dataset.lg = UICFG.LG; sfx.click(); });
  $('sbGlyph').innerHTML = glyph('clawd', 2); $('sbFold').innerHTML = glyph('fold');
  const rail = document.querySelectorAll('.sb-rail .rb'); rail[0].insertAdjacentHTML('afterbegin', glyph('clawd', 2)); rail[1].insertAdjacentHTML('afterbegin', glyph('log')); rail[2].insertAdjacentHTML('afterbegin', glyph('chat'));
  $('chatf').querySelector('button').innerHTML = glyph('enter', 1);
  renderTools(); setupLevels(); setupControls(); setupTooltips();
  $('tools').addEventListener('click', onToolsClick); $('toolLayer').addEventListener('click', onToolsClick);
  // names appear as the pointer nears the palette (and the ruler's names near the ruler)
  let nearRaf = 0;
  document.addEventListener('pointermove', e => {
    if (nearRaf) return; nearRaf = requestAnimationFrame(() => {
      nearRaf = 0;
      const dist = el => { const b = el.getBoundingClientRect(); if (!b.width && !b.height) return 1e9; const dx = Math.max(b.left - e.clientX, 0, e.clientX - b.right), dy = Math.max(b.top - e.clientY, 0, e.clientY - b.bottom); return Math.hypot(dx, dy); };
      const near = [...document.querySelectorAll('#tools, #toolLayer .grow, #flyout')].some(el => dist(el) < 64);
      $('viewwrap').classList.toggle('tl-near', near);
      const st = $('strip'); st.classList.toggle('near', !UI.lvx && dist(st) < 56);
      const pk = panelKey(document.elementFromPoint(e.clientX, e.clientY));
      if (pk) UI.hoverPanel = pk;
      if (UI.help && pk && pk !== UI.helpP) { UI.helpP = pk; layoutHelp(); }
    });
  });
  document.querySelectorAll('.tb-modes [data-mode]').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
  $('bGhost').onclick = () => toggleGhost();
  $('bShade').onclick = () => { S.shade = !S.shade; $('bShade').setAttribute('aria-pressed', S.shade); };
  $('bFollow').onclick = () => toggleFollow();
  $('bTod').onclick = () => cycleTod();
  $('bLight').onclick = () => toggleLight();
  setupLightPanel();
  $('bRotL').onclick = () => rotate(-1);
  $('bRotR').onclick = () => rotate(1);
  setupWorldMenu();
  $('bAgent').onclick = () => setAgentOn();
  $('bSound').onclick = () => {
    if (!AUD.ctx || !AUD.on) { if (audStart()) sfx.mode(S.mode); else toast('Web Audio is not available here'); }
    else { AUD.on = false; applyVol(); }
    syncBar();
  };
  $('bMute').onclick = () => toggleMute();
  $('bUiTone').onclick = () => setUiTone(UICFG.MT !== 10);
  $('bHelp').onclick = () => toggleHelp();
  $('zoomStep').addEventListener('click', e => { const b = e.target.closest('[data-zoom]'); if (b) { setZoom(S.zoom + +b.dataset.zoom); sfx.click(); updateStatus(); } });
  $('bApprove').onclick = () => { if (CARDJOB) approveJob(CARDJOB, false); };
  $('bReject').onclick = () => { if (CARDJOB) rejectJob(CARDJOB); };
  $('sbFold').onclick = () => setSidebar(false);
  $('sbMute').onclick = () => setProposalsMuted(!S.propMute);
  setProposalsMuted(store.get('propMute', '0') === '1', true);
  document.querySelectorAll('.sb-rail [data-sbopen]').forEach(b => b.onclick = () => { setFeed(b.dataset.sbopen); setSidebar(true); });
  $('feedFilter').addEventListener('click', e => { const b = e.target.closest('[data-feed]'); if (b) setFeed(b.dataset.feed); });
  $('chatf').addEventListener('submit', e => { e.preventDefault(); const i = $('chatIn'); sendChat(i.value); i.value = ''; });
  for (const s of ['Add a garden here', 'Connect this to the nearest core', 'Build housing near here', 'Open a light well here', 'Why there?']) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'btn sm'; b.textContent = s; b.onclick = () => sendChat(s); $('sugg').appendChild(b);
  }
  if (store.get('side', 'open') === 'rail') document.body.classList.add('sb-off');
  addEventListener('resize', () => { sizeLevels(); renderToolLayer(); UI.helpSig = ''; layoutHelp(); });
  syncSliders();
  addMsg('ai', "I'm the coral cursor. I survey bays, drop a ghost with a proposal card, and build only once it's approved (auto after 8 s). Pin a spot with Alt-click, then ask for a garden, bridge, housing or a light well.");
  setTool('inspect');
}
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
  if (S.floor > z) S.floor = z > 0 ? z : -1;   // the floor cutoff never sits above the cut: it follows it down
  if (REDUCED || (o && o.snap)) { S.cutAnim = z; S.cutT = 1; }
  GHC.dirty = true; planDirty = true; secDirty = true; stripDirty = true;
  if (!o || !o.silent) sfx.level(z);
  S.hover = null;
}
// the floor cutoff (levels panel grabber, Shift+arrows in the list): S.floor is the lowest level still shown,
// everything below it is cut away; -1 = no floor. Clamped to the cut. (The renderer reads S.floor.)
function setFloor(z) {
  z = z == null || z <= 0 ? -1 : clamp(z | 0, 1, S.level);
  if (z === S.floor) return;
  S.floor = z;
  GHC.dirty = true; planDirty = true; secDirty = true; stripDirty = true;
}
function setMode(m) {
  if (m === S.mode || !MODES.includes(m)) return;
  const prev = S.mode;
  S.mode = m; S.modeT = 0;
  const lf = m === 'exploded' ? 2 : 0;   // strata are seen from above when exploded: lift baked occlusion so plates read
  if (lf !== (S.lightFloor || 0)) { S.lightFloor = lf; markAllDirty(true); }   // a subtle lift: let it arrive during the move instead of stalling it
  S.explodeTarget = m === 'exploded' ? 1 : 0;
  toolsForMode(m);
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
function cycleTod() {
  if (LIT.on) { setLightTime(LIGHT_TIMES[(LIGHT_TIMES.indexOf(LIT.sun) + 1) % LIGHT_TIMES.length]); sfx.click(); return; }
  const o = ['day', 'dusk', 'night']; setTod(o[(o.indexOf(S.tod) + 1) % 3]);
}
function setTod(n) { S.tod = n; $('todv').textContent = TODS[n].name; SPR = new Map(); GHOST.clear(); podSprites(); markAllDirty(); skyDirty = true; sfx.click(); }
function toggleGhost(v) { S.ghost = v == null ? !S.ghost : v; $('bGhost').setAttribute('aria-pressed', S.ghost); GHC.dirty = true; }
function toggleFollow(v) { S.follow = v == null ? !S.follow : v; $('bFollow').setAttribute('aria-pressed', S.follow); if (S.follow) S.lastFollow = -9; }
function toggleMute() { AUD.muted = !AUD.muted; $('bMute').setAttribute('aria-pressed', AUD.muted); applyVol(); }
function regenerateWorld() {
  generate(S.seed); $('seedv').textContent = S.seed;
  JOBS = []; DRONES = []; PUFFS = []; S.pins = []; renderChips(); hideCard(); agentReset(); initLife(); seedWires();
  markAllDirty(); skyDirty = true; stripDirty = true;
  log('sys', `World generated · seed ${S.seed}`, 'sys');
}
function resize() {
  const st = $('stage'), r = st.getBoundingClientRect(), bw0 = S.bw, bh0 = S.bh, had = !!VIEW.ctx, sameZoom = resize.zoom === S.zoom;
  resize.zoom = S.zoom;
  S.cssW = Math.max(1, Math.floor(r.width)); S.cssH = Math.max(1, Math.floor(r.height));
  S.bw = Math.ceil(S.cssW / S.zoom); S.bh = Math.ceil(S.cssH / S.zoom);
  // keep the view's top-left where it was, so a panel opening or closing beside it doesn't shift the city
  if (had && sameZoom && bw0 && S.mode !== 'plan' && S.mode !== 'section') { S.cam.x += (S.bw - bw0) / 2; S.cam.y += (S.bh - bh0) / 2; }
  const cv = $('view');
  cv.width = S.bw; cv.height = S.bh;
  cv.style.width = S.bw * S.zoom + 'px'; cv.style.height = S.bh * S.zoom + 'px';
  VIEW.ctx = cv.getContext('2d'); VIEW.ctx.imageSmoothingEnabled = false;
  const tr = $('tools').getBoundingClientRect(), sr = $('strip').getBoundingClientRect();
  const over = getComputedStyle($('tools')).position === 'absolute';
  S.safeL = over ? Math.max(0, tr.right - r.left + 6) : 0; S.safeR = over ? Math.max(0, r.right - sr.left + 6) : 0;
  skyDirty = true;
  sizeLevels();
  if (had) render();   // redraw at once: a resized canvas is blank until the next frame otherwise
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
    if (S.tool === 'cable' && UI.hue[WIRES.gauge] != null) WIRES.hue[WIRES.gauge] = UI.hue[WIRES.gauge];   // a colour picked in the cable flyout
    P.wire = e.button === 0 && wireDown(bx, by, e);
    if (e.button === 0 && !P.wire && S.mode === 'cut') UNDO.past.pop();
    if (P.wire) { clearTimeout(P.lp); return; }
    if (S.tool === 'demolish' && e.button === 0 && demoStart()) { P.demolishing = true; clearTimeout(P.lp); return; }
    if (S.tool === 'capture' && e.button === 0 && S.hover && !S.hover.top && (S.mode === 'cut' || S.mode === 'plan')) { S.capture = { x0: S.hover.x, y0: S.hover.y, x1: S.hover.x, y1: S.hover.y }; P.capturing = true; }
    if (e.pointerType === 'touch') { clearTimeout(P.lp); P.lp = setTimeout(() => { if (!P.moved && S.hover) { addPin(S.hover); P.down = false; P.longDone = true; } }, 600); }
  });
  st.addEventListener('pointermove', e => {
    if (P.pts.has(e.pointerId)) P.pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (P.pinch && P.pts.size === 2) { const [a, b] = [...P.pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]), z = clamp(Math.round(P.pinch.z * d / P.pinch.d), 1, 5); setZoom(z); return; }
    const [bx, by, cx, cy] = toBuf(e);
    P.lastCss = [cx, cy];
    if (wireMove(bx, by)) { S.hover = null; WIRES.hover = null; updateTip(null); return; }
    WIRES.hover = !P.down ? (S.mode === 'cut' ? pickWire(bx, by, 4) : null) : WIRES.hover;
    if (P.down) {
      if (!P.moved && Math.hypot(e.clientX - P.sx, e.clientY - P.sy) > 5) { P.moved = true; clearTimeout(P.lp); if (!P.capturing && !P.demolishing) st.classList.add('pan'); }
      if (P.moved && !P.capturing && !P.demolishing) panBy(e.clientX - P.lx, e.clientY - P.ly);
      P.lx = e.clientX; P.ly = e.clientY;
    }
    const h = pickAt(bx, by);
    if (P.capturing && h && !h.top) { S.capture.x1 = h.x; S.capture.y1 = h.y; }
    if (P.demolishing) demoMove(h);
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
    if (P.wire) { P.wire = false; const [bx, by] = toBuf(e); wireUp(bx, by); return; }
    if (P.capturing) { P.capturing = false; finishCapture(); return; }
    if (P.demolishing) { P.demolishing = false; demoFinish(); return; }
    if (!P.moved && !P.longDone && e.type === 'pointerup') { const [bx, by] = toBuf(e); doClick(e, pickAt(bx, by)); }
    P.longDone = false;
  };
  st.addEventListener('pointerup', end); st.addEventListener('pointercancel', end);
  st.addEventListener('contextmenu', e => e.preventDefault());   // Ctrl-drag (slack) on a Mac would open it
  st.addEventListener('pointerleave', () => { if (!P.down) { S.hover = null; S.hoverStratum = -1; updateTip(null); } });
  cv.addEventListener('dblclick', e => {
    const [bx, by] = toBuf(e), h = pickAt(bx, by);
    if (!h || S.mode === 'exploded') return;
    if (h.top || S.mode === 'section') { setLevel(h.z); return; }
    if (!h.t) for (let z = h.z - 1; z >= 0; z--) if (cell(h.x, h.y, z)) { setLevel(z); toast(`Dropped to ${lvCode(z)} — what you were looking at`); return; }
  });
  // trackpad: two-finger scroll pans, pinch (ctrl+wheel) zooms; a line-stepping mouse wheel zooms
  let wheelAcc = 0;
  st.addEventListener('wheel', e => {
    e.preventDefault();
    const zoomy = e.ctrlKey || e.deltaMode === 1;
    if (!zoomy) { panBy(-e.deltaX, -e.deltaY); return; }
    wheelAcc += e.deltaY * (e.deltaMode === 1 ? 40 : 1);
    const step = e.ctrlKey ? 24 : 80;
    if (Math.abs(wheelAcc) > step) { setZoom(S.zoom + (wheelAcc < 0 ? 1 : -1)); wheelAcc = 0; sfx.click(); }
  }, { passive: false });
  window.addEventListener('keydown', e => {
    if (!BOOT.done) return;   // still loading
    if (e.target.closest && e.target.closest('input, textarea, select')) return;
    if ((e.metaKey || e.ctrlKey) && k_lower(e) === 'z') { undoWires(e.shiftKey); e.preventDefault(); return; }
    if ((e.metaKey || e.ctrlKey) && k_lower(e) === 'y') { undoWires(true); e.preventDefault(); return; }
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
    else if (lk === 'i') toggleLight();
    else if (lk === 'm') toggleMute();
    else if (lk === 'v') setTool('inspect');
    else if (lk === 'b') setTool(BUILD_TOOLS[(BUILD_TOOLS.indexOf(S.tool) + 1) % BUILD_TOOLS.length]);
    else if (lk === 'c') setTool('capture');
    else if (lk === 'p') setTool('point');
    else if (lk === 'l') setTool('cable');
    else if (lk === 'y') setTool('tie');
    else if (lk === 'k') setTool('post');
    else if (lk === 'h' && e.shiftKey) { WIRES.hl = HL_STYLES[(HL_STYLES.indexOf(WIRES.hl) + 1) % HL_STYLES.length]; try { localStorage.setItem('spall.hl', WIRES.hl); } catch (err) { /* not remembered */ } toast('Highlight: ' + WIRES.hl); }
    else if (lk === 'h') setTool('girder');
    else if (lk === 'r' && S.tool === 'tie') { WIRES.round = !WIRES.round; setTool('tie'); }
    else if (lk === 'j') jolt();
    else if (lk === 'r' && S.tool === 'cable') { WIRES.gauge = (WIRES.gauge + 1) % GAUGES.length; setTool('cable'); }
    else if (lk === 'r') { S.toolRot = (S.toolRot + 1) & 3; if (S.tool === 'bridge' || S.tool === 'unit') setTool(S.tool); }
    else if (lk === 'x' && S.mode !== 'section') setTool('demolish');
    else if (lk === 'x') { S.secAxis = S.secAxis === 'x' ? 'y' : 'x'; secDirty = true; stripDirty = true; }
    else if (k === ',' || k === '<') { S.secIdx = clamp(S.secIdx - 1, 0, W - 1); secDirty = true; stripDirty = true; }
    else if (k === '.' || k === '>') { S.secIdx = clamp(S.secIdx + 1, 0, W - 1); secDirty = true; stripDirty = true; }
    else if (k === 'Enter') { if (CARDJOB) approveJob(CARDJOB, false); else used = false; }
    else if (k === 'Delete' || k === 'Backspace') {
      if (CARDJOB) rejectJob(CARDJOB);
      else if (WIRES.hover) { pushUndo(); WIRES.hover.tie ? removeTie(WIRES.hover.tie) : removeCable(WIRES.hover.c); WIRES.hover = null; sfx.click(); }
      else used = false;
    }
    else if (k === 'Escape') { DEMO.box = null; if (LAY.on) { removeCable(LAY.c); LAY.on = false; LAY.c = null; } WIRES.stroke = null; S.capture = null; if (!closeLayers()) setTool('inspect'); }
    else if (k === '?') toggleHelp();
    else if (k === '`') setToolsState(tbState() + 1);
    else if (k === '\\') setSidebar(document.body.classList.contains('sb-off'));
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
const k_lower = e => (e.key || '').toLowerCase();
function heldPan(dt) {
  if (!HELD.size) return;
  const sp = 320 * dt;
  let dx = 0, dy = 0;
  if (HELD.has('left') || HELD.has('a')) dx += sp; if (HELD.has('right') || HELD.has('d')) dx -= sp;
  if (HELD.has('up') || HELD.has('w')) dy += sp; if (HELD.has('down') || HELD.has('s')) dy -= sp;
  if (dx || dy) panBy(dx, dy);
}
// ==========================================================================
// Main loop, drawing-board backdrop for plan/section, boot, test hooks.
// ==========================================================================
let lastNow = 0, audAcc = 0, uiAcc = 0;
function step(dt) {
  S.time += dt;
  if (S.cutAnim !== S.level) {
    S.cutT = Math.min(1, S.cutT + dt / 0.22);
    S.cutAnim = lerp(S.cutFrom, S.level, 1 - Math.pow(1 - S.cutT, 3));
    if (S.cutT >= 1) { S.cutAnim = S.level; sfx.arrive(S.level); }
  }
  if (S.explode !== S.explodeTarget) { const d = S.explodeTarget - S.explode; S.explode += Math.sign(d) * Math.min(Math.abs(d), dt / 0.5); }
  S.modeT = Math.min(1, (S.modeT || 0) + dt / 0.2);
  if (S.camTarget) {
    const k = 1 - Math.exp(-dt * 7);
    S.cam.x += (S.camTarget.x - S.cam.x) * k; S.cam.y += (S.camTarget.y - S.cam.y) * k;
    if (Math.hypot(S.camTarget.x - S.cam.x, S.camTarget.y - S.cam.y) < 0.5) S.camTarget = null;
  }
  heldPan(dt);
  updateLife(dt); updateJobs(dt); if (!WIRES.agentOff) agentUpdate(dt); updateWires(dt); updateBirds(dt);
  if (S.follow && AGENT.state !== 'idle') {
    if (S.mode !== 'exploded' && AGENT.level !== S.level && S.time - (S.lastFollow || -9) > 0.9) { S.lastFollow = S.time; setLevel(AGENT.level); }
    if (S.mode === 'cut' && AGENT.screen && !S.camTarget) {
      const [X, Y] = AGENT.screen;
      if (X < S.bw * 0.22 || X > S.bw * 0.72 || Y < S.bh * 0.22 || Y > S.bh * 0.78) S.camTarget = { x: S.cam.x + (X - S.bw / 2), y: S.cam.y + (Y - S.bh / 2) };
    }
    if (S.mode === 'section') { const want = S.secAxis === 'x' ? Math.floor(AGENT.ty) : Math.floor(AGENT.tx); if (want !== S.secIdx && want >= 0 && want < W) { S.secIdx = want; secDirty = true; } }
  }
  audAcc += dt; if (audAcc > 0.1) { audAcc = 0; audTick(); }
  uiAcc += dt; if (uiAcc > 0.1) { uiAcc = 0; uiTick(); }
}
function drawBoard(ctx) {
  ctx.fillStyle = '#0c0d0e'; ctx.fillRect(0, 0, S.bw, S.bh);
  ctx.fillStyle = '#16181a';
  for (let y = 0; y < S.bh; y += 16) ctx.fillRect(0, y, S.bw, 1);
  for (let x = 0; x < S.bw; x += 16) ctx.fillRect(x, 0, 1, S.bh);
}
function sheetIn() { return REDUCED ? 0 : Math.round((1 - easeIO(S.modeT || 1)) * 14); }
function renderPlan(ctx, t) {
  for (const z of dirtyLv) buildLevel(z, false);
  if (planDirty) buildPlan();
  drawBoard(ctx);
  const o = planOrigin(), dy = sheetIn();
  ctx.save(); ctx.translate(0, dy);
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(o[0] + 4, o[1] + 4, PLAN.c.width, PLAN.c.height);
  ctx.drawImage(PLAN.c, o[0], o[1]);
  drawLifePlan(ctx, t); drawBuildPlan(ctx, t);
  ctx.restore();
}
function renderSec(ctx, t) {
  for (const z of dirtyLv) buildLevel(z, false);
  if (secDirty) buildSection();
  drawBoard(ctx);
  const o = secOrigin(), dy = sheetIn();
  ctx.save(); ctx.translate(0, dy);
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(o[0] + 4, o[1] + 4, SEC.c.width, SEC.c.height);
  ctx.drawImage(SEC.c, o[0], o[1]);
  const wc = WATERCYC[S.tod], wt = Math.floor(t * 5);
  for (let a = 0; a < W; a++) for (const z of [0, 9]) {
    const [x, y] = secXY(a), c = cell(x, y, z);
    if (c !== T.WATER && !(c === T.VAULT && z === 0)) continue;
    const col = wc[(a + wt) & 7] || '#3f7d73';
    R_(ctx, o[0] + SML + a * SCW + ((a * 3 + wt) % 6), o[1] + SMT + (NL - z) * SCH - 5, 2, 1, col);
  }
  drawLifeSec(ctx, t); drawBuildSec(ctx, t);
  ctx.restore();
}
function render() {
  const ctx = VIEW.ctx;
  if (!ctx || BOOT.hold) return;
  if (S.mode === 'plan') renderPlan(ctx, S.time);
  else if (S.mode === 'section') renderSec(ctx, S.time);
  else renderIso(ctx, S.time);
  updateAgentDom();
}
function frame(now) {
  const dt = lastNow ? Math.min(0.05, (now - lastNow) / 1000) : 0.016;
  lastNow = now;
  requestAnimationFrame(frame);
  try { step(dt); render(); } catch (e) { if (!frame.warned) { frame.warned = true; console.error(e); } }
}
// ---- boot, behind the loading screen (#loader) ----
// The same steps as ever, in slices: every ~200 ms it lets a frame through so the status line
// and bar can move (the loop itself runs on the compositor either way). Nothing is drawn
// until the end (BOOT.hold), so the level images are built once, here, not by a resize.
// window.__booted resolves once the first frame is up and the loading screen is going.
const BOOT = { hold: true, done: false };
window.__booted = new Promise(r => { BOOT.resolve = r; });
const afterPaint = () => new Promise(r => { if (document.hidden) setTimeout(r, 0); else requestAnimationFrame(() => setTimeout(r, 0)); });
function bootSlicer() {
  let t0 = performance.now();
  return force => (!force && performance.now() - t0 < 200) ? null : afterPaint().then(() => { t0 = performance.now(); });
}
function bootNote(txt, f) { const n = $('ldNote'), b = $('ldBar'); if (txt) performance.mark('boot: ' + txt); if (n && txt) n.textContent = txt; if (b) b.style.transform = `scaleX(${f.toFixed(3)})`; }
async function boot() {
  const slice = bootSlicer();
  bootNote('generating the world', 0.02); await slice(true);
  generate(S.seed);
  if (LIT.on) { LIT.sun = 'noon'; S.tod = 'day'; }
  setupUI(); setupInput(); resize();
  if (S.cssW < 700) setZoom(1);
  initLife();
  bootNote('settling the cables', 0.1); await slice(true);
  const n = seedWires(true);
  for (let k = 0; k < n; k++) { stepWires(1 / 60); const w = slice(); if (w) { bootNote(null, 0.1 + 0.62 * k / n); await w; } }
  seedWiresDone(); markAllDirty();
  bootNote('lighting the levels', 0.72); await slice(true);
  const lv = [...dirtyLv];
  for (let k = 0; k < lv.length; k++) { buildLevel(lv[k], false); const w = slice(); if (w) { bootNote(null, 0.72 + 0.26 * k / lv.length); await w; } }
  BOOT.hold = false; performance.mark('boot: levels built');
  let agentPref = '1'; try { agentPref = localStorage.getItem('stratum.agent') || '1'; } catch (e) { /* no storage: claude stays on */ }
  setAgentOn(agentPref === '1');
  try { const hl = localStorage.getItem('spall.hl'); if (HL_STYLES.includes(hl)) WIRES.hl = hl; } catch (e) { /* default highlight */ }
  centerOn(24, 24, 6);
  if (WIRES.stage) { setLevel(WIRES.stage.view, { silent: true, snap: true }); centerOn(...WIRES.stage.focus); }
  $('seedv').textContent = S.seed;
  $('bShade').setAttribute('aria-pressed', 'true');
  log('sys', `World generated · seed ${S.seed} · ${WORLD.cores.length} cores, ${WORLD.paths.length} transit runs, ${WORLD.wells.length} light wells`, 'sys');
  updateStrip(); updateStatus();
  render(); performance.mark('boot: first frame');
  requestAnimationFrame(frame);
  bootNote(null, 1);
  // lift the loading screen once the interface fonts are in (or have had their chance)
  await Promise.race([document.fonts ? document.fonts.ready : Promise.resolve(), new Promise(r => setTimeout(r, 1500))]);
  performance.mark('boot: fonts');
  await afterPaint();
  performance.mark('boot: done');
  const ld = $('loader'); if (ld) { ld.classList.add('out'); setTimeout(() => ld.remove(), 600); }
  BOOT.done = true; BOOT.resolve();
}
function bootFailed(e) {
  console.error(e);
  BOOT.hold = false;
  const n = $('ldNote'); if (n) { n.textContent = 'could not start: ' + (e && e.message || e); n.style.color = 'var(--bad)'; }
}

// ---- hooks used by the local test wrapper (screenshots); harmless in the page ----
function demoAgent(stage) {
  const c = findSites(1);
  if (!c.length) return;
  const s = c[0];
  AGENT.x = AGENT.tx = s.x + 2.4; AGENT.y = AGENT.ty = s.y + 0.5; AGENT.z = AGENT.tz = s.z + 3;
  proposeSite(s, 'stack', stackPieces(s.x, s.y, s.z, s.br), 'Capsule stack 2×2×3 + sky bridge', siteNote(s));
  setLevel(s.z + 1, { silent: true, snap: true });
  centerOn(s.x + 1, s.y + 1, s.z + 1);
  if (stage === 'proposal') return s;
  approveJob(AGENT.job, false);
  const j = JOBS[JOBS.length - 1];
  for (let k = 0; k < 3000; k++) { step(1 / 30); if (j.pieces.filter(p => p.state === 'placed').length >= j.pieces.length * (stage === 'done' ? 1 : 0.55)) break; }
  for (let k = 0; k < 8; k++) step(1 / 30);
  return s;
}
window.STRATUM = {
  S, AGENT, WIRES, LAY, WGRAB, seedWires, jolt, tieStroke, stepWires, JOBS: () => JOBS, setMode, setLevel, rotate, setTod, setZoom, toggleGhost, toggleFollow, centerOn, demoAgent,
  step(sec) { const n = Math.round(sec * 30); for (let k = 0; k < n; k++) step(1 / 30); },
  test(p) {
    if (p.zoom) setZoom(+p.zoom);
    if (p.tod) setTod(p.tod);
    if (p.rot) for (let k = 0; k < +p.rot; k++) rotate(1);
    if (p.seed) { S.seed = +p.seed; regenerateWorld(); }
    if (p.t) this.step(+p.t);
    if (p.level != null) setLevel(+p.level, { silent: true, snap: true });
    if (p.ghost) toggleGhost(true);
    if (p.follow) toggleFollow(true);
    if (p.agent) demoAgent(p.agent);
    if (p.cam) { const [x, y, z] = p.cam.split(',').map(Number); centerOn(x, y, z); }
    if (p.sec) S.secIdx = +p.sec;
    if (p.axis) S.secAxis = p.axis;
    if (p.mode) { setMode(p.mode); S.explode = S.explodeTarget; if (S.camTarget) { S.cam.x = S.camTarget.x; S.cam.y = S.camTarget.y; S.camTarget = null; } S.modeT = 1; }
    if (p.hover) { const [x, y] = p.hover.split(',').map(Number); const r = toRot(x, y); S.hover = { x, y, z: S.level, t: cell(x, y, S.level), u: r[0], v: r[1] }; }
    if (p.stratum != null) S.hoverStratum = +p.stratum;
    if (p.tool) setTool(p.tool);
    if (p.pin) { const [x, y, z] = p.pin.split(',').map(Number); addPin({ x, y, z }); }
    if (p.chat) sendChat(p.chat);
    if (p.t2) this.step(+p.t2);
    render();
    if (p.perf) { const t0 = performance.now(); for (let k = 0; k < 30; k++) { step(1 / 60); render(); } window.__perf = ((performance.now() - t0) / 30).toFixed(2) + 'ms/frame'; }
  }
};
setTimeout(() => boot().catch(bootFailed), 0);   // after the later script parts (route builders) have run
// ==========================================================================
// Scripted wire demo for recordings: a visible cursor drives the same wire
// handlers the mouse does. The story: an offshoot of the main trunk stops at
// the lip of a void; we stand two posts in the void, carry the bundle out to
// them, then tie it into the dark bundle already hanging there.
// window.wireDemo() returns a promise.
// ==========================================================================
async function wireDemo() {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const cur = document.createElement('div');
  cur.innerHTML = '<svg width="18" height="22" viewBox="0 0 9 11" shape-rendering="crispEdges"><path d="M0 0h1v1h1v1h1v1h1v1h1v1h1v1h1v1h-3v1h1v2h-2v-2h-1v1h-1z" fill="#f4efe4" stroke="#14110e" stroke-width=".6"/></svg>';
  Object.assign(cur.style, { position: 'absolute', left: 0, top: 0, pointerEvents: 'none', zIndex: 20 });
  $('stage').appendChild(cur);
  const css = (bx, by) => { cur.style.transform = `translate(${bx * S.zoom - 1}px,${by * S.zoom - 1}px)`; };
  WIRES.agentOff = true; AGENT.screen = null; $('agentTag').style.visibility = $('bubble').style.visibility = 'hidden';
  const st = WIRES.stage, V = st.V, xo = st.XO + 0.5;
  setLevel(st.view, { silent: true, snap: true });
  setZoom(4);
  centerOn(xo + 1, V.y0 - 1.5, st.LT);
  await sleep(700);
  const work = workHeight();
  let pos = projIso(xo, V.y0 - 2, work);
  css(pos[0], pos[1]);
  async function moveTo(p, ms, held) {
    const p0 = pos.slice(), n = Math.max(1, Math.round(ms / 16));
    for (let k = 1; k <= n; k++) {
      const t = k / n, e = t < 0.5 ? 2 * t * t : 1 - (2 - 2 * t) * (2 - 2 * t) / 2;
      pos = [lerp(p0[0], p[0], e), lerp(p0[1], p[1], e)]; css(pos[0], pos[1]);
      if (held) wireMove(pos[0], pos[1]); else { WIRES.ptr = pos.slice(); WIRES.hover = pickWire(pos[0], pos[1], 5); }
      await sleep(16);
    }
  }
  const press = () => wireDown(pos[0], pos[1], { shiftKey: false, altKey: false, detail: 1 });
  const release = () => { wireUp(pos[0], pos[1]); WIRES.hover = null; };
  const at = p => { const q = projIso(p[0], p[1], p[2]); return [q[0], q[1]]; };
  // 1. two posts in the void: one straight out, one where the run turns
  setTool('post');
  const P1 = [xo, V.y0 + 3, work], P2 = [xo + 4, V.y0 + 3, work];
  for (const p of [P1, P2]) { await moveTo(at(p), 800, false); press(); release(); await sleep(600); }
  setTool('inspect');
  await sleep(400);
  // 2. carry the head out to the first post, then on to the second
  const head = st.head, posts = WIRES.posts.slice(-2);
  for (const post of posts) {
    await moveTo(at(tieCenter(head)), 800, false);
    await sleep(250); press();
    await moveTo(at([post.x, post.y, post.z1 + 0.8]), 1700, true);
    await moveTo(at(postTop(post)), 600, true);
    await sleep(600); release(); await sleep(1500);
  }
  // 3. tie the new run into the dark bundle below it, twice
  setTool('tie');
  const dark = WIRES.cables.filter(c => c.hex);
  for (const f of [0.35, 0.7]) {
    const p = [lerp(posts[0].x, posts[1].x, f), lerp(posts[0].y, posts[1].y, f), work];
    const dc = [0, 0, 0];
    for (const c of dark) { const q = xAt(c, nearestIdx(c, [p[0], p[1], c.X[Math.floor(c.n / 2) * 3 + 2]])); for (let k = 0; k < 3; k++) dc[k] += q[k] / dark.length; }
    const a = at([p[0], p[1], p[2] + 0.3]), b = at(dc);
    await moveTo([a[0] + 5, a[1] - 8], 700, false);
    WIRES.stroke = { x0: pos[0], y0: pos[1], x1: pos[0], y1: pos[1] };
    await moveTo([b[0] - 5, b[1] + 8], 900, true);
    release(); await sleep(2200);
  }
  await sleep(1500);
  cur.remove(); WIRES.agentOff = false; $('agentTag').style.visibility = $('bubble').style.visibility = '';
}
window.wireDemo = wireDemo;
// ==========================================================================
// Static look mock-ups. Bundles are built route-first: a centerline, and each
// wire laid along it at its slot with exactly the length it needs, then tied.
// Nothing has spare length to bunch up between ties, so bundles stay tight.
// window.mock(id) builds one; window.MOCKS lists them.
// ==========================================================================
const MOCKS = [];
const defMock = (id, title, note, o) => MOCKS.push(Object.assign({ id, title, note }, o));

// ---------- route geometry ----------
function resamplePath(pts, step) {
  const out = [pts[0]];
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1], b = pts[k], n = Math.max(1, Math.ceil(v3.dist(a, b) / step));
    for (let j = 1; j <= n; j++) out.push([lerp(a[0], b[0], j / n), lerp(a[1], b[1], j / n), lerp(a[2], b[2], j / n)]);
  }
  return out;
}
// a straight run between two points that hangs `sag` levels in the middle
function sagLine(a, b, sag, n) {
  n = n || 24; const out = [];
  for (let j = 0; j <= n; j++) { const t = j / n; out.push([lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t) - sag * 4 * t * (1 - t)]); }
  return out;
}
// frames along a path: across (horizontal) and up (perpendicular to the run)
function frames(path) {
  const F = []; let prevA = null;
  for (let k = 0; k < path.length; k++) {
    const p0 = path[Math.max(0, k - 1)], p1 = path[Math.min(path.length - 1, k + 1)], T = v3.norm(v3.sub(p1, p0));
    let A = [-T[1], T[0], 0];
    if (Math.hypot(A[0], A[1]) < 0.3) A = prevA ? prevA.slice() : [1, 0, 0];
    A = v3.norm(A); if (prevA && v3.dot(A, prevA) < 0) A = [-A[0], -A[1], -A[2]];
    let U = v3.norm(v3.cross(T, A)); if (U[2] < 0 || (Math.abs(U[2]) < 0.2 && v3.dot(U, [1, 1, 0]) < 0)) U = [-U[0], -U[1], -U[2]];
    F.push({ A, U }); prevA = A;
  }
  return F;
}
const offAt = (p, f, o) => [p[0] + f.A[0] * o[0] + f.U[0] * o[1], p[1] + f.A[1] * o[0] + f.U[1] * o[1], p[2] + f.A[2] * o[0] + f.U[2] * o[1]];
// cross-section slots: round (hex rings, heaviest at the core) or flat (a row)
function slots(gauges, kind, pitch) {
  const n = gauges.length;
  if (kind === 'flat' || kind === 'row') { const p = pitch || 0.15; return gauges.map((g, i) => [(i - (n - 1) / 2) * p, 0]); }
  const p = pitch || Math.max(0.11, 2.0 * gauges.reduce((s, g) => s + GAUGES[g].r, 0) / n);
  const order = gauges.map((g, i) => i).sort((a, b) => GAUGES[gauges[b]].r - GAUGES[gauges[a]].r), out = new Array(n);
  let ring = 0, k = 0;
  while (k < n) {
    const cap = ring === 0 ? 1 : 6 * ring, cnt = Math.min(cap, n - k);
    for (let j = 0; j < cnt; j++, k++) { const th = j / cnt * Math.PI * 2 + ring * 0.4; out[order[k]] = ring === 0 ? [0, 0] : [Math.cos(th) * ring * p, Math.sin(th) * ring * p]; }
    ring++;
  }
  return out;
}
// a row of sockets centred on p, running along dir
const socketRow = (p, dir, n, sp) => Array.from({ length: n }, (_, i) => [p[0] + dir[0] * (i - (n - 1) / 2) * sp, p[1] + dir[1] * (i - (n - 1) / 2) * sp, p[2] + dir[2] * (i - (n - 1) / 2) * sp]);
// One bundle along a centerline. Each wire: socket -> its slot along the run -> socket.
// ties: arc fractions where the bundle is tied (round or flat); clamp: {frac: point} ties pinned there.
function makeBundle(o) {
  const path = resamplePath(o.center, 0.25), F = frames(path), n = o.gauges.length;
  const sl = o.slots || slots(o.gauges, o.kind || 'round', o.pitch);
  const cables = o.gauges.map((g, i) => {
    const pts = [];
    if (o.sa) pts.push(o.sa[i]);
    for (let k = 0; k < path.length; k++) pts.push(offAt(path[k], F[k], sl[i]));
    if (o.sb) pts.push(o.sb[i]);
    return makeCablePath(g, pts, { slack: 1.0, hue: o.hues ? o.hues[i] : i, hex: o.hex ? o.hex[i % o.hex.length] : null });
  });
  const tieAtFrac = (f, clampTo) => {
    const k = Math.round(f * (path.length - 1)), ms = cables.map((c, i) => ({ c, i: nearestIdx(c, offAt(path[k], F[k], sl[i])) }));
    const t = makeTie(ms, { round: (o.kind || 'round') === 'round', instant: true, offs: sl });
    if (clampTo) clampTie(t, clampTo);
    return t;
  };
  const ends = (o.ties && o.ties.length && o.endTies !== false) ? [o.sa ? 0.015 : null, o.sb ? 0.985 : null].filter(f => f != null) : [];
  for (const f of [...ends, ...(o.ties || [])]) tieAtFrac(f);
  for (const [f, p] of o.clamps || []) tieAtFrac(f, p);
  return { cables, path, F, slots: sl, tieAtFrac };
}
// a wire that rides one bundle's slot for part of its way and another's after
function concatRoutes(parts) {
  const out = [];
  for (const pr of parts) { const path = resamplePath(pr.center, 0.25), F = frames(path), k0 = Math.round((pr.from || 0) * (path.length - 1)), k1 = Math.round((pr.to == null ? 1 : pr.to) * (path.length - 1)); for (let k = k0; k <= k1; k++) out.push(offAt(path[k], F[k], pr.slot)); }
  return out;
}
const lift = (p, r) => [p[0], p[1], p[2] + r + 0.02];

// ---------- the scenes ----------
// a void is 24 x 8 cells: near lip y0-1 and far balcony y1 at L10 (floor 10.25); west ledge x0 at
// L6 (floor 6.25); east ledge x1-1 at L10; floor (water) 2.25. Scenes were drawn for a void at
// x0 = 7: XR maps those x's onto whichever void they are built in.
const XR = (st, x) => x + st.V.x0 - 7;
const G8 = [0, 0, 1, 0, 0, 1, 0, 2];
const lipToBalcony = (st, x, sag, kind, ties, extra) => {
  const z = st.zf + 0.12, a = [x, st.V.y0 - 0.5, z], b = [x + 0.4, st.V.y1 + 0.5, z], sp = kind === 'round' ? 0.2 : 0.15;
  const sa = socketRow([x, st.V.y0 - 0.9, st.zf], [-1, 0, 0], 8, sp).map((p, i) => lift(p, GAUGES[G8[i]].r));
  const sb = socketRow([x + 0.4, st.V.y1 + 0.9, st.zf], [-1, 0, 0], 8, sp).map((p, i) => lift(p, GAUGES[G8[i]].r));
  return makeBundle(Object.assign({ center: sagLine([a[0], a[1] + 0.6, z], [b[0], b[1] - 0.6, z], sag), gauges: G8, sa, sb, kind, ties }, extra || {}));
};
const camA = st => ({ zoom: 4, at: [XR(st, 13.5), st.V.y0 + 4, st.LT - 1.5] });
const camWide = st => ({ zoom: 3, at: [XR(st, 19), st.V.y0 + 4, st.LT - 3] });

defMock('A1', 'Close, loose', 'Eight cables side by side, 1/4 cell apart, no ties: they hang together but nothing holds them.', {
  build(st) { lipToBalcony(st, XR(st, 13), 1.2, 'row', []); settle(300); }, cam: camA });
defMock('A2', 'Ribbon', 'The same eight held flat by clips; between clips the ribbon is one piece.', {
  build(st) { lipToBalcony(st, XR(st, 13), 1.2, 'flat', [0.2, 0.4, 0.6, 0.8]); settle(300); }, cam: camA });
defMock('A3', 'Round bundle: glued wires', 'Banded round; between bands every wire holds its place around one spine, over a dark core. Bands wrap tight.', {
  build(st) { lipToBalcony(st, XR(st, 13), 1.2, 'round', [0.12, 0.3, 0.5, 0.7, 0.88]); settle(300); }, cam: camA });
defMock('A4', 'Round bundle: striped tube', 'The same bundle drawn as one cylinder with lengthwise stripes, each row taking the colour of the wire nearest it, shaded round.', {
  build(st) { lipToBalcony(st, XR(st, 13), 1.2, 'round', [0.12, 0.3, 0.5, 0.7, 0.88]); settle(300); }, cam: camA, look: { bundleLook: 'tube' } });
defMock('A5', 'Striped tube, taut', 'A4 pulled nearly straight.', {
  build(st) { lipToBalcony(st, XR(st, 13), 0.35, 'round', [0.12, 0.3, 0.5, 0.7, 0.88]); settle(300); }, cam: camA, look: { bundleLook: 'tube' } });
defMock('A6', 'Striped tube, muted', 'A4 in the infrastructure palette.', {
  build(st) { lipToBalcony(st, XR(st, 13), 1.2, 'round', [0.12, 0.3, 0.5, 0.7, 0.88]); settle(300); }, cam: camA, look: { bundleLook: 'tube', palette: 'muted' } });

// progressive: from a spread row of sockets, pairs, then fours, then all eight
function progressive(st, center, sa, sb, hues) {
  const n = 8, row = slots(G8, 'row', 0.3), all = slots(G8, 'round');
  const s1 = 0.1, s2 = 0.22, s3 = 0.36, bl = 0.05;
  const pairC = i => [(Math.floor(i / 2) - 1.5) * 0.42, 0], pairS = i => [(i % 2 - 0.5) * 0.15, 0];
  const quadC = i => [(Math.floor(i / 4) - 0.5) * 0.5, 0], quadS = i => [((i % 2) - 0.5) * 0.15, ((Math.floor(i / 2) % 2) - 0.5) * 0.15];
  const sm = t => t * t * (3 - 2 * t);
  const offOf = (i, s) => {
    const stage = [[0, row[i]], [s1, [pairC(i)[0] + pairS(i)[0], 0]], [s2, [quadC(i)[0] + quadS(i)[0], quadS(i)[1]]], [s3, all[i]]];
    let o = stage[0][1];
    for (let k = 1; k < stage.length; k++) { const w = sm(clamp((s - stage[k][0] + bl) / bl, 0, 1)); o = [lerp(o[0], stage[k][1][0], w), lerp(o[1], stage[k][1][1], w)]; }
    return o;
  };
  const path = resamplePath(center, 0.25), F = frames(path);
  const cables = G8.map((g, i) => {
    const pts = [sa[i]];
    for (let k = 0; k < path.length; k++) pts.push(offAt(path[k], F[k], offOf(i, k / (path.length - 1))));
    pts.push(sb[i]);
    return makeCablePath(g, pts, { slack: 1.0, hue: hues ? hues[i] : i });
  });
  const tie = (f, idxs) => { const k = Math.round(f * (path.length - 1)); return makeTie(idxs.map(i => ({ c: cables[i], i: nearestIdx(cables[i], offAt(path[k], F[k], offOf(i, f))) })), { round: true, instant: true, offs: idxs.map(i => offOf(i, f)) }); };
  for (let p = 0; p < 4; p++) tie(s1 + 0.04, [2 * p, 2 * p + 1]);
  for (let q = 0; q < 2; q++) tie(s2 + 0.04, [4 * q, 4 * q + 1, 4 * q + 2, 4 * q + 3]);
  for (let f = s3 + 0.04; f < 0.97; f += 0.13) tie(f, [0, 1, 2, 3, 4, 5, 6, 7]);
  return cables;
}
const eastToWest = (st, y) => {
  const zE = st.zf + 0.15, zW = st.LW + 0.4;
  const sa = socketRow([st.V.x1 - 0.4, y, st.zf], [0, 1, 0], 8, 0.3).map((p, i) => lift(p, GAUGES[G8[i]].r));
  const sb = socketRow([st.V.x0 + 0.5, y, st.LW + 0.25], [0, 1, 0], 8, 0.25).map((p, i) => lift(p, GAUGES[G8[i]].r));
  return { center: sagLine([st.V.x1 - 1, y, zE], [st.V.x0 + 1, y, zW], 1.6, 40), sa, sb };
};
const camEast = st => ({ zoom: 4, at: [st.V.x1 - 4.5, st.V.y0 + 4, st.LT - 1.2] });
defMock('B1', 'Progressive bundling, glued wires', 'Framed on the east ledge: from a spread row of sockets, pairs, then fours, then all eight, heading off across the chasm.', {
  build(st) { const r = eastToWest(st, st.V.y0 + 4); progressive(st, r.center, r.sa, r.sb); settle(400); }, cam: camEast });
defMock('B1t', 'Progressive bundling, striped tube', 'B1 with bundles drawn as striped tubes.', {
  build(st) { const r = eastToWest(st, st.V.y0 + 4); progressive(st, r.center, r.sa, r.sb); settle(400); }, cam: camEast, look: { bundleLook: 'tube' } });
defMock('B2', 'Progressive, whole span', 'The B1 bundle all the way across: high east ledge to low west ledge, a vertical bend from the height change.', {
  build(st) { const r = eastToWest(st, st.V.y0 + 4); progressive(st, r.center, r.sa, r.sb); settle(400); }, cam: camWide, look: { bundleLook: 'tube' } });
defMock('B3', 'Bundles joining a trunk', 'Three small bundles leave the near lip at different points and meet mid-chasm, then run on as one trunk to the west ledge (striped tube).', {
  build(st) { joiningBundles(st); settle(400); }, cam: camWide, look: { bundleLook: 'tube' } });
function joiningBundles(st) {
  {
    const M = [XR(st, 17), st.V.y0 + 4, 7.6], end = [st.V.x0 + 1, st.V.y0 + 4, st.LW + 0.4], G = [0, 1, 0], all = [];
    const main = sagLine(M, end, 0.6, 20), allSl = slots([0, 1, 0, 0, 1, 0, 0, 1, 0], 'round');
    const groups = [[11, 0], [19, 3], [26, 6]].map(([x, k0]) => { x = XR(st, x);
      const a = [x, st.V.y0 - 0.5, st.zf + 0.15], sa = socketRow([x, st.V.y0 - 0.9, st.zf], [1, 0, 0], 3, 0.25).map((p, i) => lift(p, GAUGES[G[i]].r));
      const c1 = sagLine(a, M, 0.8, 20), sl = slots(G, 'round');
      const cs = G.map((g, i) => makeCablePath(g, [sa[i], ...concatRoutes([{ center: c1, slot: sl[i], to: 0.97 }, { center: main, slot: allSl[k0 + i] }]), lift([end[0] - 0.4, end[1] + (k0 + i - 4) * 0.22, st.LW + 0.25], GAUGES[g].r)], { slack: 1.0, hue: k0 + i }));
      all.push(...cs);
      const p1 = resamplePath(c1, 0.25), F1 = frames(p1);
      for (const f of [0.35, 0.7]) { const k = Math.round(f * (p1.length - 1)); makeTie(cs.map((c, i) => ({ c, i: nearestIdx(c, offAt(p1[k], F1[k], sl[i])) })), { round: true, instant: true, offs: sl }); }
      return cs;
    });
    const pm = resamplePath(main, 0.25), FM = frames(pm);
    for (const f of [0.05, 0.3, 0.55, 0.8]) { const k = Math.round(f * (pm.length - 1)); makeTie(all.map((c, j) => ({ c, i: nearestIdx(c, offAt(pm[k], FM[k], allSl[j])) })), { round: true, instant: true, offs: allSl }); }
  }
}

// trunk on stands along the gallery; a branch turns off at 90° down the spur
function trunkAndBranch(st, onward) {
  const { V, YT, XO, XA, XB, zf } = st, zs = zf + 0.37, y0 = YT + 0.5, xo = XO + 0.5, zT = zs + 0.36;
  const standsX = []; for (let x = XA + 1; x <= XB - 1; x += 3) standsX.push(x + 0.5);
  if (!standsX.some(x => Math.abs(x - xo) < 0.6)) { standsX.push(xo); standsX.sort((a, b) => a - b); }
  const stands = standsX.map(x => addPost(x, y0, zf, zs));
  const spurPosts = []; for (let y = y0 + 3; y < V.y0 - 1.5; y += 3) spurPosts.push(addPost(xo, y, zf, zs));
  const TG = [0, 0, 0, 1, 0, 1, 0, 2, 0, 1], BG = [0, 0, 1, 0, 1];
  const trunkC = [[XA + 0.3, y0, zT], [XB - 0.3, y0, zT]];
  const tsl = slots([...TG, ...BG], 'round'), bsl = slots(BG, 'round');
  const cornerF = (xo - trunkC[0][0]) / (trunkC[1][0] - trunkC[0][0]);
  const spurEnd = onward ? [xo, V.y0 - 0.6, zT] : [xo, V.y0 - 1.6, zT];
  const branchC = [[xo, y0, zT], [xo, y0 + 0.6, zT], spurEnd];
  const trunk = TG.map((g, i) => makeCablePath(g, concatRoutes([{ center: trunkC, slot: tsl[i] }]), { slack: 1.0, hue: i % 3 }));
  const sb = socketRow([xo, V.y0 - 0.9, zf], [1, 0, 0], 5, 0.25).map((p, i) => lift(p, GAUGES[BG[i]].r));
  const branch = BG.map((g, i) => {
    let pts = concatRoutes([{ center: trunkC, slot: tsl[TG.length + i], to: cornerF }, { center: branchC, slot: bsl[i] }]);
    if (onward) pts = pts.concat(concatRoutes([{ center: onward, slot: bsl[i] }]));
    else pts.push(sb[i]);
    return makeCablePath(g, pts, { slack: 1.0, hue: (i + 1) % 3 });
  });
  for (const p of stands) {
    const ms = trunk.map((c, i) => ({ c, i: nearestIdx(c, offAt([p.x, y0, zT], { A: [0, 1, 0], U: [0, 0, 1] }, tsl[i])) }));
    const offs = TG.map((g, i) => tsl[i]);
    if (p.x <= xo + 0.01) branch.forEach((c, i) => { ms.push({ c, i: nearestIdx(c, offAt([p.x, y0, zT], { A: [0, 1, 0], U: [0, 0, 1] }, tsl[TG.length + i])) }); offs.push(tsl[TG.length + i]); });
    clampTie(makeTie(ms, { round: true, instant: true, offs }), postTop(p));
  }
  for (const p of spurPosts) clampTie(makeTie(branch.map(c => ({ c, i: nearestIdx(c, [p.x, p.y, zT]) })), { round: true, instant: true, offs: bsl }), postTop(p));
  return { trunk, branch, bsl, zT };
}
defMock('C1', 'Trunk and branch', 'Trunk on stands along the gallery; a branch turns off at 90° and ends at a socket panel on the lip. Built route-first.', {
  build(st) { trunkAndBranch(st); settle(400); }, cam: st => ({ zoom: 4, at: [st.XO - 1, st.YT + 5, st.LT + 0.5] }) });
defMock('C2', 'Branch carried across', 'The same branch continues over the lip and across the chasm to the balcony as one bundle, banded along the way.', {
  build(st) {
    const xo = st.XO + 0.5, zT = st.zf + 0.73, onward = sagLine([xo, st.V.y0 - 0.6, zT], [xo + 0.5, st.V.y1 + 0.6, st.zf + 0.3], 1.4, 30);
    const r = trunkAndBranch(st, onward);
    const p = resamplePath(onward, 0.25), F = frames(p);
    for (const f of [0.15, 0.35, 0.55, 0.75, 0.92]) { const k = Math.round(f * (p.length - 1)); makeTie(r.branch.map((c, i) => ({ c, i: nearestIdx(c, offAt(p[k], F[k], r.bsl[i])) })), { round: true, instant: true, offs: r.bsl }); }
    settle(400);
  }, cam: st => ({ zoom: 3, at: [st.XO + 2, st.V.y0 - 1, st.LT - 1] }) });
const MIX20 = [0, 0, 1, 0, 2, 0, 1, 0, 0, 3, 1, 0, 0, 1, 2, 0, 0, 1, 0, 3];
defMock('C3', 'A big trunk over the chasm', 'Twenty cables, from data wire to trunk pipe, from the high east ledge to the low west ledge, banded every couple of cells.', {
  build(st) {
    const y = st.V.y0 + 4.5, zE = st.zf + 0.5, zW = st.LW + 0.7, center = sagLine([st.V.x1 - 1.2, y, zE], [st.V.x0 + 1.2, y, zW], 2.2, 40);
    const sa = socketRow([st.V.x1 - 0.4, y, st.zf], [0, 1, 0], 20, 0.24).map((p, i) => lift(p, GAUGES[MIX20[i]].r));
    const sb = socketRow([st.V.x0 + 0.5, y, st.LW + 0.25], [0, 1, 0], 20, 0.22).map((p, i) => lift(p, GAUGES[MIX20[i]].r));
    makeBundle({ center, gauges: MIX20, sa, sb, ties: [0.06, 0.16, 0.26, 0.36, 0.46, 0.56, 0.66, 0.76, 0.86, 0.94] });
    settle(400);
  }, cam: camWide });
defMock('C4', 'Crossing trunks, one peeling off', 'A trunk along the chasm passes over another running across it; three wires peel off the upper one and drop to the floor.', {
  build(st) {
    const y = st.V.y0 + 3.5, upper = sagLine([st.V.x1 - 1.2, y, st.zf + 0.4], [st.V.x0 + 1.2, y, st.LW + 0.6], 1.6, 40);
    const G = [0, 0, 1, 0, 2, 0, 1, 0, 0, 1], sl = slots(G, 'round');
    const sa = socketRow([st.V.x1 - 0.4, y, st.zf], [0, 1, 0], 10, 0.24).map((p, i) => lift(p, GAUGES[G[i]].r));
    const sb = socketRow([st.V.x0 + 0.5, y, st.LW + 0.25], [0, 1, 0], 10, 0.22).map((p, i) => lift(p, GAUGES[G[i]].r));
    const peel = 0.42, pu = resamplePath(upper, 0.25), kP = Math.round(peel * (pu.length - 1)), P = pu[kP];
    const drop = [[P[0], P[1], P[2]], [P[0] - 0.3, P[1] + 0.8, P[2] - 1.5], [P[0] - 0.6, P[1] + 1.4, 2.6]];
    const peelers = [1, 5, 8];
    const cs = G.map((g, i) => {
      if (!peelers.includes(i)) return makeCablePath(g, [sa[i], ...concatRoutes([{ center: upper, slot: sl[i] }]), sb[i]], { slack: 1.0, hue: i });
      const j = peelers.indexOf(i), ps = slots([0, 0, 1], 'round');
      return makeCablePath(g, [sa[i], ...concatRoutes([{ center: upper, slot: sl[i], to: peel }, { center: drop, slot: ps[j] }]), lift([P[0] - 0.6 + j * 0.3, P[1] + 1.9, 2.25], GAUGES[g].r)], { slack: 1.0, hue: i });
    });
    const F = frames(pu);
    for (const f of [0.08, 0.22, 0.36, 0.5, 0.64, 0.78, 0.92]) { const k = Math.round(f * (pu.length - 1)); const keep = (m, i) => f < peel || !peelers.includes(i); makeTie(cs.map((c, i) => ({ c, i: nearestIdx(c, offAt(pu[k], F[k], sl[i])) })).filter(keep), { round: true, instant: true, offs: sl.filter(keep) }); }
    const pd = resamplePath(drop, 0.25), FD = frames(pd), ps = slots([0, 0, 1], 'round');
    for (const f of [0.4, 0.75]) { const k = Math.round(f * (pd.length - 1)); makeTie(peelers.map((i, j) => ({ c: cs[i], i: nearestIdx(cs[i], offAt(pd[k], FD[k], ps[j])) })), { round: true, instant: true, offs: ps }); }
    const x = XR(st, 18), lower = sagLine([x, st.V.y0 - 0.5, st.zf + 0.1], [x + 0.4, st.V.y1 + 0.5, st.zf + 0.1], 3.2, 30);
    makeBundle({ center: lower, gauges: [0, 1, 0, 2, 0, 1, 0], hex: ['#3c3f45', '#33302d', '#45484f'], ties: [0.1, 0.3, 0.5, 0.7, 0.9] });
    settle(400);
  }, cam: camWide , look: { bundleLook: 'tube' } });

// risers: bundled at the sockets, over the lip, down the wall, then a slow curve out along the floor
function riser(st, x, G, mountZs, o) {
  o = o || {};
  const yW = st.V.y0 + 0.22, top = st.zf + 0.2, zb = o.zb != null ? o.zb : 2.25, rb = 0.35;
  const center = [[x, st.V.y0 - 1.2, top], [x, st.V.y0 - 0.3, top], [x, yW + 0.12, top - 0.35], [x, yW, top - 1.1], [x, yW, zb + 1.8],
    [x, yW + 0.12, zb + 1.0], [x + (o.dx || 0) * 0.2, yW + 0.6, zb + rb + 0.35], [x + (o.dx || 0) * 0.6, yW + 1.5, zb + rb + 0.06], [x + (o.dx || 0), yW + (o.run || 4), zb + rb]];
  const sa = socketRow([x, st.V.y0 - 1.6, st.zf], [1, 0, 0], G.length, 0.2).map((p, i) => lift(p, GAUGES[G[i]].r));
  const end = center[center.length - 1], sb = socketRow([end[0], end[1] + 0.4, zb], [1, 0, 0], G.length, 0.2).map((p, i) => lift(p, GAUGES[G[i]].r));
  const b = makeBundle({ center, gauges: G, sa, sb, ties: o.ties || [0.06, 0.12, 0.62, 0.72, 0.84] });
  for (const z of mountZs) {
    const m = [x, st.V.y0 + 0.06, z]; addMount(m);
    const k = b.path.reduce((bi, p, i) => Math.abs(p[2] - z) < Math.abs(b.path[bi][2] - z) && p[1] > st.V.y0 && p[1] < st.V.y0 + 0.4 ? i : bi, 0);
    const t = b.tieAtFrac(k / (b.path.length - 1)); clampTie(t, [x, yW, z - t.R]); t.top = m;
  }
  return b;
}
defMock('D1', 'Riser down the chasm wall', 'Bundled at the sockets, over the lip, down the wall on mounts every two levels, then a slow curve out along the floor.', {
  build(st) { riser(st, XR(st, 15), [0, 0, 1, 0, 1, 2], [9, 7, 5, 3.4]); settle(300); },
  cam: st => ({ zoom: 4, at: [XR(st, 15), st.V.y0 + 1.5, 6] }), look: { bundleLook: 'tube' } });
defMock('D2', 'Three risers', 'Three bundles of different sizes over the lip and down the far wall, each curving out along the floor.', {
  build(st) {
    riser(st, XR(st, 11), [0, 1, 0, 0, 1], [9, 6.5, 4], { dx: -1, run: 3 });
    riser(st, XR(st, 17), [0, 0, 1, 2, 0, 1, 0, 0, 1], [9, 7, 5, 3.4], { run: 5 });
    riser(st, XR(st, 23), [0, 1, 0], [8.5, 5.5], { dx: 1.5, run: 3.5 });
    settle(300);
  }, cam: st => ({ zoom: 3, at: [XR(st, 17), st.V.y0 + 2, 6] }), look: { bundleLook: 'tube' } });
function tangle(st, n, seed, noSettle) {
  const rnd = mulberry32(seed), cs = [];
  const ends = [
    () => [st.V.x0 + rnd() * 24, st.V.y0 - 0.6, st.zf + 0.1],
    () => [st.V.x0 + 1 + rnd() * 21, st.V.y1 + 0.4, st.zf + 0.1],
    () => [st.V.x0 + 0.5, st.V.y0 + 1 + rnd() * 5.5, st.LW + 0.35],
    () => [st.V.x1 - 0.5, st.V.y0 + 1 + rnd() * 5.5, st.zf + 0.1]];
  for (let k = 0; k < n; k++) {
    const g = [0, 0, 0, 1, 1, 2, 3][Math.floor(rnd() * 7)], ia = Math.floor(rnd() * 4); let ib = Math.floor(rnd() * 4); if (ib === ia) ib = (ib + 1 + Math.floor(rnd() * 3)) % 4;
    const a = ends[ia](), b = ends[ib](); a[2] += GAUGES[g].r; b[2] += GAUGES[g].r;
    cs.push(makeCable(g, a, b, { slack: 1.02 + rnd() * 0.1, hue: k }));
  }
  if (!noSettle) settle(500);
  return cs;
}
defMock('D3', 'Tangle over the chasm, muted', 'Thirty-six cables of every gauge between the lip, the balcony and both ledges: the Kowloon look, wide.', {
  build(st) { tangle(st, 36, 11); }, cam: camWide, look: { palette: 'muted' } });
defMock('D4', 'Tangle over the chasm, bright', 'D3 colour-coded by gauge.', {
  build(st) { tangle(st, 36, 11); }, cam: camWide });

// girders: thin steel along grid lines; mount points on them carry the cables
defMock('E1', 'Girder bridge with a strapped bundle', 'Two girders span the chasm wall to wall along a grid line, with cross-pieces; a twelve-cable bundle is strapped under them at mount points.', {
  build(st) { girderBridge(st, 3); settle(300); }, cam: camWide });
function girderBridge(st, dy) {
  {
    const z = 9, y0 = st.V.y0 + dy, y1 = y0 + 1, x0 = st.V.x0 - 0.02, x1 = st.V.x1 + 0.02;
    addGirder([x0, y0, z], [x1, y0, z]); addGirder([x0, y1, z], [x1, y1, z]);
    for (let x = st.V.x0 + 2; x < st.V.x1; x += 3) addGirder([x, y0, z], [x, y1, z]);
    const G = [0, 0, 1, 0, 2, 0, 1, 0, 0, 1, 0, 0], yc = y0 + 0.5, zc = z - 0.62;
    const sa = socketRow([st.V.x1 - 0.4, yc, st.zf], [0, 1, 0], 12, 0.2).map((p, i) => lift(p, GAUGES[G[i]].r));
    const sb = socketRow([st.V.x0 + 0.3, yc, st.LW + 0.25], [0, 1, 0], 12, 0.2).map((p, i) => lift(p, GAUGES[G[i]].r));
    const b = makeBundle({ center: [[st.V.x1 - 1, yc, st.zf + 0.4], [st.V.x1 - 2, yc, zc], [st.V.x0 + 0.9, yc, zc], [st.V.x0 + 0.7, yc, st.LW + 0.6]], gauges: G, sa, sb });
    for (let x = st.V.x0 + 2; x < st.V.x1 - 1.5; x += 3) { const m = addMount([x, yc, z - 0.08]); const k = b.path.reduce((bi, p, i) => Math.abs(p[0] - x) + Math.abs(p[2] - zc) < Math.abs(b.path[bi][0] - x) + Math.abs(b.path[bi][2] - zc) ? i : bi, 0); const t = b.tieAtFrac(k / (b.path.length - 1)); clampTie(t, [x, yc, zc - t.R]); t.top = m.p; }
  }
}
defMock('E1p', 'Girder bridge, plate joints', 'E1 with square gusset plates where girders meet.', {
  build(st) { MOCKS.find(m => m.id === 'E1').build(st); }, cam: camWide, look: { joint: 'plate' } });
defMock('E1r', 'Girder bridge, collar joints', 'E1 with round collars where girders meet.', {
  build(st) { MOCKS.find(m => m.id === 'E1').build(st); }, cam: camWide, look: { joint: 'ring' } });
defMock('E2', 'Girder scaffold', 'A cage of vertical and horizontal girders standing in the chasm; a bundle rises up one column, turns along a beam at L6, and climbs again to the lip.', {
  build(st) {
    const xs = [12, 18, 24].map(x => XR(st, x)), ya = st.V.y0 + 2, yb = st.V.y0 + 5;
    for (const x of xs) for (const y of [ya, yb]) addGirder([x, y, 2.25], [x, y, 10.1]);
    for (const z of [6, 10]) { addGirder([xs[0], ya, z], [xs[2], ya, z]); addGirder([xs[0], yb, z], [xs[2], yb, z]); for (const x of xs) addGirder([x, ya, z], [x, yb, z]); }
    const G = [0, 1, 0, 0, 2, 0, 1], o = 0.3;
    const center = [[xs[0] + o, ya + o, 2.6], [xs[0] + o, ya + o, 6 - 0.3], [xs[0] + 1, ya + o, 6 - 0.35], [xs[1] - 1, ya + o, 6 - 0.35], [xs[1] + o, ya + o, 6 - 0.3], [xs[1] + o, ya + o, 9.6], [xs[1] + o, ya - 0.5, st.zf + 0.3], [xs[1] + o, st.V.y0 - 0.9, st.zf + 0.3]];
    const sa = socketRow([xs[0] + o + 0.6, ya + o + 0.6, 2.25], [1, -1, 0], 7, 0.18).map((p, i) => lift(p, GAUGES[G[i]].r));
    const b = makeBundle({ center, gauges: G, sa });
    const mounts = [[xs[0] + o, ya + 0.08, 4], [xs[0] + 2.5, ya + 0.08, 5.9], [xs[1] - 2.5, ya + 0.08, 5.9], [xs[1] + o, ya + 0.08, 8]];
    for (const m of mounts) { addMount(m); const k = b.path.reduce((bi, p, i) => v3.dist(p, m) < v3.dist(b.path[bi], m) ? i : bi, 0); const t = b.tieAtFrac(k / (b.path.length - 1)); clampTie(t, [b.path[k][0], b.path[k][1], b.path[k][2] - t.R]); t.top = m; }
    for (let f = 0.05; f < 1; f += 0.09) b.tieAtFrac(f);
    settle(300);
  }, cam: st => ({ zoom: 3, at: [XR(st, 18), st.V.y0 + 3.5, 6] }) });
defMock('E3', 'Tangle with girders', 'D3 again with two girders across the chasm; the cables that pass near them are strapped to mount points.', {
  build(st) {
    const z = 8.5;
    addGirder([st.V.x0 - 0.02, st.V.y0 + 2, z], [st.V.x1 + 0.02, st.V.y0 + 2, z]); addGirder([st.V.x0 - 0.02, st.V.y0 + 5.5, z + 1], [st.V.x1 + 0.02, st.V.y0 + 5.5, z + 1]);
    const cs = tangle(st, 30, 21);
    for (const [y, zz] of [[st.V.y0 + 2, z], [st.V.y0 + 5.5, z + 1]]) for (let x = st.V.x0 + 2; x < st.V.x1 - 1; x += 2.5) {
      const near = cs.map(c => { let bi = 0, bd = 9; for (let i = 0; i < c.n; i++) { const d = Math.hypot(c.X[i * 3] - x, c.X[i * 3 + 1] - y); if (d < bd) { bd = d; bi = i; } } return { c, i: bi, d: bd, z: c.X[bi * 3 + 2] }; }).filter(q => q.d < 0.5 && Math.abs(q.z - zz) < 1.6);
      if (near.length < 2) continue;
      const m = addMount([x, y, zz - 0.08]), t = makeTie(near.map(q => ({ c: q.c, i: q.i })), { round: true }); clampTie(t, [x, y, zz - 0.35 - t.R]); t.top = m.p;
    }
    settle(400);
  }, cam: camWide, look: { palette: 'muted' } });

// a riser that hangs: bundled from sockets on the lip, over the edge, and one free curve down
// to sockets on the floor. No wall mounts, a few sliding ties: gravity draws the curve.
function hangingRiser(st, x, G, o) {
  o = o || {};
  const top = st.zf + 0.2, zb = 2.25, rb = 0.3, y0 = st.V.y0, run = o.run || 6, dx = o.dx || 0;
  // a quarter-ellipse sweep: straight down off the edge, easing out to lie along the floor
  const A = [x, y0 + 0.1, top - 0.3], B = [x + dx, y0 + run, zb + rb], h = A[2] - B[2], r = B[1] - A[1];
  const C1 = [x, A[1] + 0.05, A[2] - h * 0.55], C2 = [B[0], B[1] - r * 0.6, B[2]];
  const curve = []; for (let k = 0; k <= 20; k++) { const t = k / 20, u = 1 - t; curve.push([0, 1, 2].map(d => u * u * u * A[d] + 3 * u * u * t * C1[d] + 3 * u * t * t * C2[d] + t * t * t * B[d])); }
  const center = [[x, y0 - 1.2, top], [x, y0 - 0.35, top], ...curve];
  const sa = socketRow([x, y0 - 1.6, st.zf], [1, 0, 0], G.length, 0.2).map((p, i) => lift(p, GAUGES[G[i]].r));
  const sb = socketRow([B[0], B[1] + 0.4, zb], [1, 0, 0], G.length, 0.2).map((p, i) => lift(p, GAUGES[G[i]].r));
  return makeBundle({ center, gauges: G, sa, sb, ties: o.ties || [0.12, 0.4, 0.68] });
}
defMock('D5', 'Hanging riser', 'Bundled over the lip and left to hang: one free curve down to the floor, three sliding ties, no mounts.', {
  build(st) { hangingRiser(st, XR(st, 17), [0, 0, 1, 2, 0, 1, 0, 0, 1]); settle(400); },
  cam: st => ({ zoom: 4, at: [XR(st, 17), st.V.y0 + 2.5, 6] }), look: { bundleLook: 'tube' } });

// the interactive's opening scene: one or two things per void, room left over to work in
function defaultScene(st) {
  const [a, b, c, d] = st.voids;
  trunkAndBranch(a);
  lipToBalcony(a, XR(a, 14), 1.2, 'row', []);                                   // A1
  hangingRiser(a, XR(a, 25), [0, 0, 1, 2, 0, 1, 0]);
  girderBridge(b, 1.5);                                                           // E1
  { const r = eastToWest(b, b.V.y0 + 5.5); progressive(b, r.center, r.sa, r.sb); }  // B1
  joiningBundles(c);                                                              // B3
  tangle(d, 14, 11, true);                                                        // D4, thinned
}

const LOOK0 = { tieStyle: 'band', palette: 'bright', sleeve: false, bundleLook: 'wires', joint: 'bulb' };
function mock(id) {
  const m = MOCKS.find(q => q.id === id); if (!m) return null;
  const st = WIRES.stage;
  Object.assign(WIRES, LOOK0, m.look || {});
  clearWires(); m.build(st);
  WIRES.agentOff = true; AGENT.screen = null; WIRES.hover = null;
  document.body.classList.add('shoot');
  setLevel(st.view, { silent: true, snap: true });
  const cam = m.cam ? m.cam(st) : camA(st);
  setZoom(cam.zoom); centerOn(...cam.at);
  render();
  return { id: m.id, title: m.title, cables: WIRES.cables.length, ties: WIRES.ties.length };
}
window.MOCKS = MOCKS; window.mock = mock;
// ==========================================================================
// Building-set sheet: every cell type the prototype builds with, in four
// variants, and the wire parts, laid out as a labelled parts sheet.
// window.partsSheet() draws it into a full-window overlay canvas.
// ==========================================================================
function partsSheet() {
  const CW1 = 600, cell = 72, cols = 8, types = TI.filter(t => t && t.id > 0);
  const rows = Math.ceil(types.length / 2) + 4;
  const g0 = mk(CW1, rows * cell / 2 * 1.0 + 360).getContext('2d');
  const c0 = g0.canvas;
  g0.fillStyle = '#121315'; g0.fillRect(0, 0, c0.width, c0.height);
  ptext(g0, 'STRATUM BUILDING SET · CELL TYPES (4 VARIANTS EACH)', 8, 6, '#e8a83c');
  // cell types: two per row, four variants each
  types.forEach((ti, k) => {
    const col = k % 2, row = Math.floor(k / 2), X = 8 + col * 296, Y = 22 + row * 40;
    g0.fillStyle = '#191a1d'; g0.fillRect(X, Y, 288, 37);
    for (let v = 0; v < 4; v++) {
      const vv = ti.orient ? (v & 1) | (v << 1) : v * 37;
      let spr; try { spr = getSprite(ti.id, vv & 255, 4, 0, 0); } catch (e) { continue; }
      g0.drawImage(spr.c, X + 4 + v * 22, Y + 34 - spr.c.height);
    }
    ptext(g0, ti.id + ' ' + ti.name.slice(0, 22), X + 96, Y + 8, '#d8d0bf');
    ptext(g0, ti.cat + (ti.slab ? ' · slab' : '') + (ti.tall ? ' · tall' : ''), X + 96, Y + 18, '#8d877b');
  });
  // wire parts
  let Y = 22 + Math.ceil(types.length / 2) * 40 + 10;
  ptext(g0, 'WIRE PARTS', 8, Y, '#e8a83c'); Y += 12;
  const part = (i, label, fn) => { const X = 8 + (i % 4) * 148, YY = Y + Math.floor(i / 4) * 64; g0.fillStyle = '#191a1d'; g0.fillRect(X, YY, 140, 58); fn(X, YY); ptext(g0, label, X + 4, YY + 49, '#d8d0bf'); };
  GAUGES.forEach((g, i) => part(i, g.name, (X, YY) => {
    const hex = g.hues[0], pal = wpal(hex, 4), prof = tubeProfile(g.px, g.px >= 3);
    for (let s = 0; s < 3; s++) { const p = wpal(g.hues[s % g.hues.length], 4); tubeSeg(g0, [X + 8, YY + 12 + s * 10], [X + 130, YY + 18 + s * 10], prof, i >= 2 ? p : p); }
    ptext(g0, 'r ' + g.r + ' · ' + g.mass + ' t/m', X + 4, YY + 40, '#8d877b');
  }));
  part(4, 'round band (tie)', (X, YY) => {
    const cx = X + 70, cy = YY + 22, pal = wpal(TIE_HEX, 4);
    for (let k = -4; k <= 4; k++) { const p = wpal(['#5fd3c4', '#9b87e8', '#e27a4e', '#a9cf56'][(k + 4) % 4], 4); tubeSeg(g0, [X + 8, cy + k], [X + 130, cy + k], [1], p); }
    for (let a = 0; a < 40; a++) { const th = a / 40 * Math.PI * 2, x = cx + Math.cos(th) * 3, y = cy + Math.sin(th) * 7; g0.fillStyle = Math.cos(th) > 0 ? pal[0] : pal[2]; g0.fillRect(Math.round(x), Math.round(y), 1, 1); }
  });
  part(5, 'flat clip (ribbon)', (X, YY) => {
    for (let k = 0; k < 6; k++) { const p = wpal(['#5fd3c4', '#9b87e8', '#e27a4e', '#a9cf56'][k % 4], 4); tubeSeg(g0, [X + 8, YY + 12 + k * 2], [X + 130, YY + 12 + k * 2], [1], p); }
    tubeSeg(g0, [X + 70, YY + 9], [X + 70, YY + 25], tubeProfile(2, true), wpal(TIE_HEX, 4));
  });
  part(6, 'socket', (X, YY) => { const pal = wpal('#3a3d42', 4); for (let k = 0; k < 4; k++) { const x = X + 20 + k * 26, y = YY + 24, sz = k + 2; R_(g0, x - (sz >> 1) - 1, y - 1, sz + 2, 3, pal[3]); R_(g0, x - (sz >> 1), y - 1, sz, 1, pal[0]); R_(g0, x - (sz >> 1), y, sz, 1, pal[1]); } });
  part(7, 'post + cradle', (X, YY) => { const pal = wpal(POST_HEX, 4); tubeSeg(g0, [X + 70, YY + 40], [X + 70, YY + 10], tubeProfile(2, true), pal); tubeSeg(g0, [X + 67, YY + 10], [X + 73, YY + 10], [3, 0, 3], pal); });
  part(8, 'girder (along x / y / z)', (X, YY) => {
    const pal = wpal(GIRDER_HEX, 4);
    tubeSeg(g0, [X + 8, YY + 10], [X + 56, YY + 34], [3, 0, 1, 2, 3], pal); for (let s = 1; s < 6; s++) R_(g0, X + 8 + s * 8, YY + 9 + s * 4, 1, 3, pal[3]);
    tubeSeg(g0, [X + 70, YY + 34], [X + 118, YY + 10], [3, 0, 1, 2, 3], pal); for (let s = 1; s < 6; s++) R_(g0, X + 70 + s * 8, YY + 33 - s * 4, 1, 3, pal[3]);
    tubeSeg(g0, [X + 130, YY + 6], [X + 130, YY + 40], [3, 0, 1, 2, 3], pal); for (let s = 1; s < 6; s++) R_(g0, X + 129, YY + 6 + s * 6, 3, 1, pal[3]);
  });
  part(9, 'mount point', (X, YY) => { const g = wpal(GIRDER_HEX, 4), pal = wpal(MOUNT_HEX, 4); tubeSeg(g0, [X + 8, YY + 14], [X + 130, YY + 14], [3, 0, 1, 2, 3], g); for (const x of [X + 40, X + 100]) { R_(g0, x - 2, YY + 15, 5, 4, pal[3]); R_(g0, x - 1, YY + 16, 3, 1, pal[0]); R_(g0, x - 1, YY + 17, 3, 1, pal[1]); tubeSeg(g0, [x, YY + 19], [x, YY + 30], [1, 3], wpal(ROD_HEX, 4)); } });
  part(10, 'hanger rod', (X, YY) => { tubeSeg(g0, [X + 70, YY + 6], [X + 70, YY + 34], [1, 3], wpal(ROD_HEX, 4)); });
  part(11, 'palettes: bright / muted', (X, YY) => {
    GAUGES.forEach((g, i) => { g.hues.forEach((h, j) => R_(g0, X + 8 + j * 9, YY + 6 + i * 9, 7, 7, h)); MUTED[i].forEach((h, j) => R_(g0, X + 74 + j * 9, YY + 6 + i * 9, 7, 7, h)); });
  });
  const ov = document.createElement('canvas'), sc = 2;
  ov.width = c0.width * sc; ov.height = Math.min(c0.height, Y + 3 * 64 + 10) * sc;
  const g = ov.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(c0, 0, 0, c0.width * sc, c0.height * sc);
  Object.assign(ov.style, { position: 'fixed', left: 0, top: 0, zIndex: 100, imageRendering: 'pixelated', background: '#121315' });
  ov.id = 'sheet'; document.body.appendChild(ov);
  return [ov.width, ov.height];
}
window.partsSheet = partsSheet;
// ==========================================================================
// Window-style study: one 2x2-cell, 3-level block per style, faces painted
// cell by cell (8 px across, 12 px per level) in the sprites' palette, at the
// current time of day. window.windowSheet() draws them into an overlay.
// ==========================================================================
const WSTYLES = [];
const defWin = (name, note, wall, fn) => WSTYLES.push({ name, note, wall, fn });
// fn(put, ci, lv, side, rnd, lit) paints one cell face: put(i, j, colour), i 0..7 across, j 0..11 down
const glassC = '#262a2d', frameC = '#4a4642';
defWin('current', 'two small punched windows per cell', '#8d6a55', (put, rnd, lit) => {
  for (const c0 of [1, 5]) { const L = lit(); for (let i = c0; i < c0 + 2; i++) { for (let j = 3; j < 7; j++) put(i, j, L || glassC); put(i, 7, '#6b5240'); } }
});
defWin('ribbon glazing', 'a continuous glass band each level; lit runs', '#b8b2a6', (put, rnd, lit) => {
  let L = lit(); for (let i = 0; i < 8; i++) { if (rnd() < 0.25) L = lit(); for (let j = 4; j < 8; j++) put(i, j, L || glassC); put(i, 3, '#d8d3c8'); }
});
defWin('deep punched', 'one deep window per cell: shadowed reveal, bright sill', '#a39c8e', (put, rnd, lit) => {
  const L = lit(); for (let i = 2; i < 6; i++) for (let j = 3; j < 8; j++) put(i, j, i === 2 || j === 3 ? '#3a3734' : (L || glassC)); for (let i = 2; i < 6; i++) put(i, 8, '#e3dccc');
});
defWin('vertical slots', 'three tall slits per cell', '#9c968a', (put, rnd, lit) => {
  for (const i of [1, 4, 6]) { const L = lit(); for (let j = 2; j < 10; j++) put(i, j, L || glassC); }
});
defWin('curtain grid', 'all glass, mullions every two columns; scattered lit panes', '#5d6a72', (put, rnd, lit) => {
  for (let i = 0; i < 8; i++) for (let j = 0; j < 12; j++) {
    if (i % 2 === 1 || j % 4 === 3) { put(i, j, '#8695a0'); continue; }
    put(i, j, (j < 2 ? '#5f7482' : '#34404a'));
  }
  for (let b = 0; b < 4; b++) if (rnd() < 0.5) { const L = lit(), i0 = Math.floor(rnd() * 4) * 2, j0 = Math.floor(rnd() * 3) * 4; if (L) for (let j = j0; j < j0 + 3; j++) put(i0, j, L); }
});
defWin('portholes', 'a round window per cell with a bright rim', '#c9c2b0', (put, rnd, lit) => {
  const L = lit(), px = [[3, 3], [4, 3], [2, 4], [3, 4], [4, 4], [5, 4], [2, 5], [3, 5], [4, 5], [5, 5], [3, 6], [4, 6]];
  for (const [i, j] of px) put(i, j, L || glassC);
  for (const [i, j] of [[3, 2], [4, 2], [1, 4], [6, 4], [1, 5], [6, 5], [3, 7], [4, 7]]) put(i, j, '#efe9da');
});
defWin('loggias', 'recessed balconies with a rail; plants and laundry', '#b09f86', (put, rnd, lit) => {
  const L = lit();
  for (let i = 1; i < 7; i++) for (let j = 2; j < 9; j++) put(i, j, j < 4 ? '#2a2724' : (L && i > 2 && i < 6 && j < 7 ? L : '#3a3632'));
  for (let i = 1; i < 7; i++) put(i, 7, '#d8d0bf');
  if (rnd() < 0.4) { put(1, 6, '#5a8a3e'); put(2, 6, '#6f9f4a'); }
  if (rnd() < 0.35) for (let i = 3; i < 6; i++) put(i, 4, ['#d9d2c0', '#8fb3c9', '#c96f4f'][i % 3]);
});
defWin('kowloon mix', 'irregular sizes, AC units, a sign now and then', '#9b8b74', (put, rnd, lit) => {
  const w = 2 + Math.floor(rnd() * 3), h = 2 + Math.floor(rnd() * 4), i0 = Math.floor(rnd() * (8 - w)), j0 = 1 + Math.floor(rnd() * (9 - h)), L = lit();
  for (let i = i0; i < i0 + w; i++) for (let j = j0; j < j0 + h; j++) put(i, j, L || glassC);
  if (rnd() < 0.5) { put(i0, j0 + h + 1, '#cfcac0'); put(i0 + 1, j0 + h + 1, '#a8a39a'); }
  if (rnd() < 0.15) for (let j = 1; j < 9; j++) put(7, j, j % 2 ? '#ff6b4a' : '#f4d35e');
});
defWin('shutters', 'slatted shutters, some thrown open and lit', '#c4b8a0', (put, rnd, lit) => {
  for (const c0 of [1, 5]) {
    const open = rnd() < 0.35, L = open ? lit() : null;
    for (let i = c0; i < c0 + 2; i++) for (let j = 3; j < 8; j++) put(i, j, open ? (L || glassC) : (j % 2 ? '#6e5a44' : '#8a7458'));
  }
});
defWin('clerestory', 'a high strip under each slab; workshop light below', '#8f8a80', (put, rnd, lit) => {
  const L = lit(); for (let i = 0; i < 8; i++) { put(i, 1, L || glassC); put(i, 2, L || glassC); if (i % 3 === 2) { put(i, 1, '#6a665e'); put(i, 2, '#6a665e'); } }
});
defWin('sparse brutal', 'mostly blank cast concrete, board marks, a rare deep window', '#a9a397', (put, rnd, lit) => {
  for (let i = 0; i < 8; i++) if (i % 4 === 0) for (let j = 0; j < 11; j++) put(i, j, '#9a9488');
  if (rnd() < 0.3) { const L = lit(); for (let i = 3; i < 5; i++) for (let j = 4; j < 7; j++) put(i, j, L || '#1e1d1c'); }
});
defWin('lattice screen', 'a perforated screen over glass; glow shows through', '#b39a72', (put, rnd, lit) => {
  const L = lit(); for (let i = 0; i < 8; i++) for (let j = 1; j < 10; j++) if ((i + j) % 2 === 0) put(i, j, L ? mixHex(L, '#3a2a1a', 0.35) : '#3a342c');
});

function windowSheet() {
  const cols = 4, cw = 150, chh = 150, rows = Math.ceil(WSTYLES.length / cols);
  const c0 = mk(cols * cw + 16, rows * chh + 30), g = c0.getContext('2d');
  g.fillStyle = '#121315'; g.fillRect(0, 0, c0.width, c0.height);
  ptext(g, 'WINDOW STYLES · ' + TODS[S.tod].name.toUpperCase() + ' · SAME 3X3X4 BLOCK', 8, 8, '#e8a83c');
  const P = painter(4), rnd = mulberry32(7), litP = TODS[S.tod].lit;
  WSTYLES.forEach((st, k) => {
    const X = 8 + (k % cols) * cw, Y = 22 + Math.floor(k / cols) * chh, bx = X + 47, by = Y + 6, w = 48, hh = 48;
    g.fillStyle = '#191a1d'; g.fillRect(X, Y, cw - 6, chh - 6);
    box(g, bx, by, w, hh, P.t(mixHex(st.wall, '#ffffff', 0.08)), P.l(st.wall), P.r(st.wall));
    for (const side of [0, 1]) for (let lv = 0; lv < 4; lv++) for (let ci = 0; ci < 3; ci++) {
      const put = (i, j, col) => { if (i < 0 || i > 7 || j < 0 || j > 11) return; const isWarm = WARM.includes(col); const c = isWarm ? col : (side ? P.r(col) : P.l(col)); (side ? pR : pL)(g, bx, by + 1, w, ci * 8 + i, lv * 12 + j, c); };
      const lit = () => rnd() < litP ? WARM[Math.floor(rnd() * WARM.length)] : null;
      st.fn(put, rnd, lit);
      for (let i = 0; i < 8; i++) put(i, 11, mixHex(st.wall, '#000000', 0.25));   // slab edge
    }
    ptext(g, (k + 1) + ' ' + st.name, X + 4, Y + chh - 30, '#d8d0bf');
    ptext(g, st.note.slice(0, 34), X + 4, Y + chh - 20, '#8d877b');
    if (st.note.length > 34) ptext(g, st.note.slice(34, 68), X + 4, Y + chh - 13, '#8d877b');
  });
  const ov = document.createElement('canvas'), sc = 2;
  ov.width = c0.width * sc; ov.height = c0.height * sc;
  const og = ov.getContext('2d'); og.imageSmoothingEnabled = false; og.drawImage(c0, 0, 0, ov.width, ov.height);
  Object.assign(ov.style, { position: 'fixed', left: 0, top: 0, zIndex: 101, imageRendering: 'pixelated', background: '#121315' });
  document.getElementById('sheet') && document.getElementById('sheet').remove();
  ov.id = 'sheet'; document.body.appendChild(ov);
  return [ov.width, ov.height];
}
window.windowSheet = windowSheet;
// ==========================================================================
// Variant study: trees (trunkless, geometric, complex) and construction
// equipment, drawn in the sprites' palette. window.floraSheet() draws both
// into an overlay canvas.
// ==========================================================================
function leafCols(P, hex) { return [P.t(mixHex(hex, '#ffffff', 0.25)), P.t(hex), P.l(mixHex(hex, '#000000', 0.25)), P.r(mixHex(hex, '#000000', 0.5))]; }
// a leafy ellipse lit from the upper left, with a little dither at the edge
function blob(g, cx, cy, rx, ry, cols, rnd, rough) {
  for (let dy = -ry; dy <= ry; dy++) for (let dx = -rx; dx <= rx; dx++) {
    if ((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) > 1 - rnd() * (rough || 0.15)) continue;
    const s = dx * 0.8 + dy * 1.2 + (rnd() - 0.5) * 2;
    g.fillStyle = s < -rx * 0.6 ? cols[0] : s < 0 ? cols[1] : s < rx * 0.6 ? cols[2] : cols[3];
    g.fillRect(cx + dx, cy + dy, 1, 1);
  }
}
const TREES = [
  ['mound', 'trunkless: a low shrub mound', (g, P, r) => { blob(g, 8, 17, 6, 3, leafCols(P, '#5f9446'), r, 0.25); }],
  ['hedge', 'trunkless: a clipped hedge block', (g, P, r) => { box(g, 3, 9, 10, 5, P.t('#6f9f4a'), P.l('#4f7f3a'), P.r('#355c2a')); for (let k = 0; k < 14; k++) { g.fillStyle = k & 1 ? P.t('#8ab65c') : P.l('#3f6a30'); g.fillRect(3 + Math.floor(r() * 10), 9 + Math.floor(r() * 8), 1, 1); } }],
  ['ground ball', 'trunkless: a round shrub sitting on the slab', (g, P, r) => { blob(g, 8, 12, 5, 5, leafCols(P, '#4f8a42'), r, 0.1); }],
  ['cone', 'geometric: a clean two-tone cone', (g, P) => { for (let j = 0; j < 14; j++) { const hw = Math.round(j * 0.42); g.fillStyle = P.l('#4e8a3e'); g.fillRect(8 - hw, 2 + j, hw, 1); g.fillStyle = P.r('#336230'); g.fillRect(8, 2 + j, hw + 1, 1); } }],
  ['column', 'geometric: a tall columnar cypress', (g, P) => { for (let j = 0; j < 16; j++) { const hw = j < 2 ? 1 : j > 13 ? 1 : 2; g.fillStyle = P.l('#467d38'); g.fillRect(8 - hw, 1 + j, hw, 1); g.fillStyle = P.r('#2f5a2a'); g.fillRect(8, 1 + j, hw, 1); } }],
  ['clipped cube', 'geometric: topiary cube on a stem', (g, P) => { R_(g, 8, 13, 1, 3, P.l('#6a4c36')); box(g, 4, 3, 8, 6, P.t('#7fae55'), P.l('#558a40'), P.r('#3a662e')); }],
  ['tiers', 'geometric: stacked tiers', (g, P) => { for (const [y, w] of [[2, 3], [6, 5], [10, 7]]) for (let j = 0; j < 4; j++) { const hw = Math.round(w * (j + 1) / 4); g.fillStyle = P.l('#4b8a3f'); g.fillRect(8 - hw, y + j, hw, 1); g.fillStyle = P.r('#305f2c'); g.fillRect(8, y + j, hw, 1); } R_(g, 8, 14, 1, 2, P.r('#4b3526')); }],
  ['multi-crown', 'complex: three overlapping crowns', (g, P, r) => { R_(g, 7, 10, 1, 6, P.l('#6a4c36')); R_(g, 8, 10, 1, 6, P.r('#4b3526')); R_(g, 5, 11, 2, 1, P.l('#6a4c36')); blob(g, 5, 8, 4, 3, leafCols(P, '#548d44'), r); blob(g, 11, 7, 4, 4, leafCols(P, '#5f9446'), r); blob(g, 8, 4, 4, 3, leafCols(P, '#6aa04e'), r); }],
  ['weeping', 'complex: a weeping willow', (g, P, r) => { R_(g, 8, 8, 1, 8, P.r('#4b3526')); blob(g, 8, 6, 6, 3, leafCols(P, '#7aa956'), r); for (let k = -5; k <= 5; k += 2) { const len = 5 + Math.floor(r() * 5); for (let j = 0; j < len; j++) { g.fillStyle = k < 0 ? P.l('#5f9446') : P.r('#3f6f34'); g.fillRect(8 + k + (j > 3 ? Math.sign(k) : 0), 7 + j, 1, 1); } } }],
  ['umbrella', 'complex: a wide flat canopy on a thin trunk', (g, P, r) => { R_(g, 8, 6, 1, 10, P.r('#4b3526')); R_(g, 6, 7, 2, 1, P.l('#6a4c36')); R_(g, 9, 6, 2, 1, P.r('#4b3526')); blob(g, 8, 4, 8, 2, leafCols(P, '#5c8f3e'), r, 0.3); }],
  ['blossom', 'complex: a flowering tree', (g, P, r) => { R_(g, 7, 9, 1, 7, P.l('#6a4c36')); R_(g, 8, 9, 1, 7, P.r('#4b3526')); blob(g, 8, 6, 6, 5, [P.t('#f2d2dc'), P.t('#e6a8bc'), P.l('#c97e98'), P.r('#8f4f68')], r); for (let k = 0; k < 6; k++) { g.fillStyle = P.t('#fff1f4'); g.fillRect(3 + Math.floor(r() * 10), 2 + Math.floor(r() * 8), 1, 1); } }]
];
const RIGS = [
  ['tower crane (current)', 48, (g, P) => DRAW[T.CRANE](g, 0, 24, P)],
  ['hammerhead tower crane', 56, (g, P) => {
    const Y = P.l('#d4a13a'), Yd = P.r('#9c7426'), K = '#2e2a24';
    box(g, 22, 44, 12, 2, P.t('#8f887b'), P.l('#6f695e'), P.r('#58534b'));
    for (let y = 8; y < 46; y++) { R_(g, 26, y, 1, 1, Y); R_(g, 29, y, 1, 1, Yd); if (y % 4 === 0) R_(g, 27, y, 2, 1, Y); }
    for (let x = 2; x < 54; x++) { R_(g, x, 7, 1, 1, Y); if (x % 3 === 0) R_(g, x, 8, 1, 1, Yd); R_(g, x, 9, 1, 1, Yd); }
    box(g, 42, 3, 8, 5, P.t('#6d6a64'), P.l('#58554f'), P.r('#46443f')); R_(g, 25, 3, 6, 4, P.l('#d9d4c8')); R_(g, 26, 4, 4, 1, '#4e6a78');
    R_(g, 12, 10, 1, 14, K); R_(g, 11, 24, 3, 2, P.l('#8a8478'));
  }],
  ['luffing jib crane', 48, (g, P) => {
    const Y = P.l('#d0703f'), Yd = P.r('#8f4627');
    box(g, 18, 46, 12, 2, P.t('#8f887b'), P.l('#6f695e'), P.r('#58534b'));
    for (let y = 18; y < 48; y++) { R_(g, 22, y, 1, 1, Y); R_(g, 25, y, 1, 1, Yd); if (y % 4 === 0) R_(g, 23, y, 2, 1, Y); }
    for (let k = 0; k < 26; k++) { R_(g, 24 - Math.round(k * 0.55), 18 - k, 1, 1, Y); if (k % 3 === 0) R_(g, 25 - Math.round(k * 0.55), 18 - k, 1, 1, Yd); }
    box(g, 26, 14, 9, 5, P.t('#6d6a64'), P.l('#58554f'), P.r('#46443f')); R_(g, 10, 0, 1, 18, '#2e2a24');
  }],
  ['mobile crane', 48, (g, P) => {
    box(g, 6, 34, 30, 6, P.t('#e0b048'), P.l('#c2912e'), P.r('#8f6a20')); box(g, 30, 28, 10, 6, P.t('#e8c060'), P.l('#c2912e'), P.r('#8f6a20')); R_(g, 34, 30, 3, 2, '#4e6a78');
    for (const x of [10, 18, 26, 34]) { R_(g, x, 44, 3, 3, '#1f1d1b'); R_(g, x + 1, 45, 1, 1, '#5a5650'); }
    for (let k = 0; k < 28; k++) { const x = 14 + Math.round(k * 0.7), y = 32 - k; R_(g, x, y, 2, 1, P.l('#d6a23c')); R_(g, x, y + 1, 2, 1, P.r('#8f6a20')); }
    R_(g, 34, 6, 1, 14, '#2e2a24'); R_(g, 33, 20, 3, 2, P.l('#8a8478'));
  }],
  ['scaffold tower', 32, (g, P) => {
    const pole = P.l('#9aa3aa'), poleD = P.r('#6c757c'), board = P.t('#b48a52');
    for (const [x, d] of [[4, 0], [16, 1], [28, 0]]) for (let y = 6; y < 46; y++) R_(g, x, y + (d ? -3 : 0), 1, 1, d ? poleD : pole);
    for (let y = 10; y < 46; y += 10) { for (let x = 4; x < 29; x++) R_(g, x, y + (x > 16 ? -((x - 16) >> 1) : -((16 - x) >> 2) * 0), 1, 1, pole); for (let x = 5; x < 16; x++) R_(g, x, y - 1, 1, 1, board); }
    for (let k = 0; k < 10; k++) { R_(g, 5 + k, 11 + k, 1, 1, poleD); R_(g, 5 + k, 21 + k, 1, 1, poleD); }
    R_(g, 6, 2, 8, 4, P.l('#3d7a8c')); R_(g, 6, 2, 8, 1, P.t('#5a9cb0'));
  }],
  ['site hoist', 32, (g, P) => {
    for (let y = 2; y < 46; y++) { R_(g, 14, y, 1, 1, P.l('#9aa3aa')); R_(g, 17, y, 1, 1, P.r('#6c757c')); if (y % 3 === 0) R_(g, 15, y, 2, 1, P.l('#9aa3aa')); }
    box(g, 6, 20, 10, 8, P.t('#c9c3b6'), P.l('#a69f90'), P.r('#7d776c')); for (let x = 7; x < 15; x += 2) R_(g, x, 26, 1, 7, P.l('#4f5559'));
    box(g, 4, 42, 16, 2, P.t('#8f887b'), P.l('#6f695e'), P.r('#58534b')); R_(g, 15, 0, 2, 2, '#ff5a3c');
  }]
];
function floraSheet() {
  const c0 = mk(640, 280), g = c0.getContext('2d'), P = painter(4);
  g.fillStyle = '#121315'; g.fillRect(0, 0, c0.width, c0.height);
  ptext(g, 'TREES · CURRENT (FIRST FOUR), THEN TRUNKLESS, GEOMETRIC, COMPLEX', 8, 6, '#e8a83c');
  for (let v = 0; v < 4; v++) { const sp = getSprite(T.TREE, v, 4, 0, 0); g.fillStyle = '#191a1d'; g.fillRect(8 + v * 40, 16, 36, 46); g.drawImage(sp.c, 18 + v * 40, 20); }
  TREES.forEach(([name, note, fn], k) => {
    const X = 8 + ((k + 4) % 15) * 40, Y = 16 + Math.floor((k + 4) / 15) * 60;
    g.fillStyle = '#191a1d'; g.fillRect(X, Y, 36, 46);
    const cv = mk(16, 28), cg = cv.getContext('2d');
    DRAW[T.TERRACE](cg, 0, 8, P); cg.save(); cg.translate(0, 4); fn(cg, P, mulberry32(k * 31 + 5)); cg.restore();
    g.drawImage(cv, X + 10, Y + 10);
    ptext(g, String(k + 5), X + 2, Y + 39, '#8d877b');
  });
  TREES.forEach(([name, note], k) => ptext(g, (k + 5) + ' ' + name, 8 + (k % 3) * 210, 72 + Math.floor(k / 3) * 9, '#d8d0bf'));
  ptext(g, 'CONSTRUCTION EQUIPMENT', 8, 116, '#e8a83c');
  let X = 8;
  RIGS.forEach(([name, w, fn]) => {
    g.fillStyle = '#191a1d'; g.fillRect(X, 126, w + 16, 150);
    const cv = mk(w, 56), cg = cv.getContext('2d'); fn(cg, P);
    cg.canvas && g.drawImage(cv, X + 8, 140, w, 56 * 2 / 2);
    ptext(g, name.slice(0, Math.floor((w + 14) / 4)), X + 4, 262, '#d8d0bf');
    X += w + 22;
  });
  const ov = document.createElement('canvas'), sc = 3;
  ov.width = c0.width * sc; ov.height = c0.height * sc;
  const og = ov.getContext('2d'); og.imageSmoothingEnabled = false; og.drawImage(c0, 0, 0, ov.width, ov.height);
  Object.assign(ov.style, { position: 'fixed', left: 0, top: 0, zIndex: 102, imageRendering: 'pixelated', background: '#121315' });
  document.getElementById('sheet') && document.getElementById('sheet').remove();
  ov.id = 'sheet'; document.body.appendChild(ov);
  return [ov.width, ov.height];
}
window.floraSheet = floraSheet;
