'use strict';
/* ==========================================================================
   STRATUM — layer-view study for an isometric megastructure builder.
   Single-file prototype: canvas 2D, procedural pixel sprites, Web Audio.
   ========================================================================== */

// ---------- world constants ----------
const W = 48, D = 48, NL = 18, G = 2;          // footprint, levels, ground index (L0)
const LH = 12, HT = 7;                           // level height px, cut height px (plan cut ~0.6 storey)
const CW = 784, CH = 424, OX = 392, OY = 36;     // per-level cache canvas + anchor origin
const GAP = 44;                                  // exploded gap between strata (px)
const REDUCED = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

const LEVELS = [
  ['B2', 'cistern'], ['B1', 'undercroft'], ['L0', 'street'], ['L1', 'arcade'],
  ['L2', 'lower infill'], ['L3', 'rooftop passages'], ['L4', 'transit deck'], ['L5', 'habitation'],
  ['L6', 'tube crossing'], ['L7', 'sky garden'], ['L8', 'habitation'], ['L9', 'habitation'],
  ['L10', 'upper transit'], ['L11', 'habitation'], ['L12', 'canopy'], ['L13', 'canopy walk'],
  ['L14', 'crown'], ['L15', 'crane deck']
].map(([code, name], z) => ({ code, name, z }));
const STRATA = [[0, 1, 'undercroft'], [2, 3, 'street + arcade'], [4, 5, 'lower infill'], [6, 6, 'transit deck'],
  [7, 8, 'habitation'], [9, 9, 'sky garden'], [10, 11, 'habitation'], [12, 12, 'upper transit'],
  [13, 13, 'habitation'], [14, 15, 'canopy'], [16, 17, 'crown']];
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
const LQ = [0.40, 0.54, 0.69, 0.85, 1.0];   // baked sky-light quantised
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
  hover: null, hoverStratum: -1, isoZoom: 2, safeL: 0, safeR: 0, cssW: 800, cssH: 600, tool: 'inspect', toolRot: 0, unit: null, captureH: 2, capture: null,
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
