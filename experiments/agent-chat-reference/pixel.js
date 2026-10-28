// Pixel kit for the agent-chat reference board: palette, the game's 3x5
// font, an original bot glyph set, avatars, and small drawing helpers.
// Every canvas is drawn at art resolution and shown at SC css px per pixel.
'use strict';
const SC = 2;
const C = {
  bg: '#0e0f11', panel: '#141517', panel2: '#1b1c1f', raise: '#24252a', line: '#2c2e32', line2: '#44474c',
  text: '#e6dfcf', dim: '#a39c8e', faint: '#716c62', accent: '#e8a83c', ink: '#1b1305',
  agent: '#ff7a52', you: '#5fd3f2', ok: '#a3c46c', bad: '#e2573f', paper: '#dcd5c3', pink: '#e27a4e',
  tie: '#eeeae0', steel: '#8a9298', girder: '#a9b6bf', gold: '#c9a54a', dark: '#3c3f45'
};
// glyph roles, borrowed from the data-wire strand palette (idea: Uiua colours by arity)
const ROLE = {
  V: '#e6dfcf',   // value: things, numbers, places
  M: '#a9cf56',   // act on one thing (lift, weld, tie, go)
  D: '#86b3d6',   // relate two things (connect, merge, drape)
  H: '#9b87e8',   // higher order: quoted plans, repeat, each, holes (blueprint violet)
  S: '#8f897d',   // stack shuffling (dup, swap, pop)
  Q: '#e8a83c',   // ask
  X: '#e2573f',   // alarm / no
  E: '#e27a4e'    // feelings
};

// ---------- the game's 3x5 font (copied from stratum-wires/src/10_util.js) ----------
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
  '!': '010010010000010', '?': '110001010000010', '▽': '111101010000000', '"': '101101000000000', '→': '000001111001000',
  '…': '000000000000101', '&': '010101010101011'
};
function ptext(g, s, x, y, col, sc) {
  s = String(s).toUpperCase(); sc = sc || 1;
  g.fillStyle = col;
  let cx = x | 0; y |= 0;
  for (const ch of s) {
    const f = FONT[ch];
    if (f) for (let i = 0; i < 15; i++) if (f.charCodeAt(i) === 49) g.fillRect(cx + (i % 3) * sc, y + (i / 3 | 0) * sc, sc, sc);
    cx += 4 * sc;
  }
  return cx - x;
}
const ptextW = s => Math.max(0, String(s).length * 4 - 1);

// ---------- bot glyphs: 5x5, '#' role colour, '+' highlight, 'o' shade ----------
const GLY = {
  '∿': ['V', '.....', '.#...', '#.#.#', '...#.', '.....'],        // cable
  '▦': ['V', '#####', '.#.#.', '..#..', '.#.#.', '#####'],        // girder
  '◇': ['V', '..#..', '.#.#.', '#...#', '.#.#.', '..#..'],        // mount point
  'ᵕ': ['V', '.....', '##.##', '..+..', '.....', '.....'],        // bird
  '✓': ['V', '.....', '....#', '...#.', '#.#..', '.#...'],        // yes
  '☼': ['V', '#.#.#', '.#.#.', '.....', '#####', '#++##'],        // light, falling on a floor
  '♥': ['E', '##.##', '#####', '#####', '.###.', '..#..'],
  '✗': ['X', '#...#', '.#.#.', '..#..', '.#.#.', '#...#'],        // no
  '‼': ['X', '#.#..', '#.#..', '#.#..', '.....', '#.#..'],
  '⊓': ['M', '#####', '#...#', '#...#', '#...#', '#...#'],        // lift
  '⊔': ['M', '#...#', '#...#', '#...#', '#...#', '#####'],        // drop
  '✶': ['M', '+.#.+', '.###.', '##+##', '.###.', '+.#.+'],        // weld
  '≡': ['M', '##+##', '..+..', '##+##', '..+..', '##+##'],        // tie
  '→': ['M', '..#..', '...#.', '#####', '...#.', '..#..'],
  '←': ['M', '..#..', '.#...', '#####', '.#...', '..#..'],
  '↑': ['M', '..#..', '.###.', '#.#.#', '..#..', '..#..'],
  '↓': ['M', '..#..', '..#..', '#.#.#', '.###.', '..#..'],
  '↗': ['M', '..###', '...##', '..#.#', '.#...', '#....'],
  '↙': ['M', '....#', '...#.', '#.#..', '##...', '###..'],
  '↻': ['M', '.###+', '#..++', '#...#', '#...#', '.###.'],        // orbit / retry
  '⚡': ['M', '...#.', '..#..', '.###.', '..#..', '.#...'],        // power on
  '⊶': ['D', '.....', '#...#', '#####', '#...#', '.....'],        // connect
  '⑂': ['D', '#...#', '.#.#.', '..#..', '..#..', '..#..'],        // merge
  '⌣': ['D', '+...+', '#...#', '.#.#.', '..#..', '.....'],        // drape between
  '⇢': ['D', '.....', '...#.', '##.##', '...#.', '.....'],        // hand to
  '⟦': ['H', '##...', '#....', '#....', '#....', '##...'],        // quote open
  '⟧': ['H', '...##', '....#', '....#', '....#', '...##'],        // quote close
  '⍥': ['H', '.....', '#...#', '.#.#.', '..#..', '.#.#.'],        // repeat (×n)
  '∵': ['H', '.##..', '.##..', '.....', '##.##', '##.##'],        // each
  '⊞': ['H', '#####', '#.#.#', '#####', '#.#.#', '#####'],        // grid / table
  '▢': ['H', '##.##', '#...#', '.....', '#...#', '##.##'],        // hole
  ':': ['S', '.....', '..#..', '.....', '..#..', '.....'],        // dup
  '⇄': ['S', '...#.', '#####', '.....', '#####', '.#...'],        // swap
  '◌': ['S', '.###.', '#...#', '#...#', '#...#', '.###.'],        // pop
  '?': ['Q', '###..', '...#.', '.##..', '.....', '.#...'],
  '@': ['V', '.###.', '#+#+#', '#####', '.#.#.', '##.##']         // self (a little bot)
};
const isGlyph = t => !!GLY[t];
function glyph(g, key, x, y, col, sc) {
  const d = GLY[key]; sc = sc || 1;
  if (!d) return 0;
  const base = col || ROLE[d[0]];
  for (let r = 0; r < 5; r++) for (let q = 0; q < 5; q++) {
    const ch = d[r + 1][q];
    if (ch === '.') continue;
    g.fillStyle = ch === '+' ? (d[0] === 'V' ? '#ffffff' : C.tie) : ch === 'o' ? shade(base, 0.6) : base;
    g.fillRect(x + q * sc, y + r * sc, sc, sc);
  }
  return 5 * sc;
}
// a token is a glyph, or text drawn in the 3x5 font; {t, r} forces a role
// an array token is a sequence drawn tight (e.g. a quoted program)
function tokW(t) {
  if (Array.isArray(t)) return t.reduce((a, u) => a + tokW(u) + 1, -1);
  const s = typeof t === 'object' ? t.t : t; return isGlyph(s) ? 5 : ptextW(s);
}
function tokDraw(g, t, x, y, col) {
  if (Array.isArray(t)) { let xx = x; for (const u of t) xx += tokDraw(g, u, xx, y, col) + 1; return xx - x - 1; }
  const s = typeof t === 'object' ? t.t : t, r = typeof t === 'object' ? t.r : null;
  if (isGlyph(s)) return glyph(g, s, x, y, col || (r && ROLE[r]));
  return ptext(g, s, x, y, col || ROLE[r || (/^[0-9×]+$/.test(s) ? 'V' : 'V')]);
}

// ---------- colour + raster helpers ----------
function rgb(hex) { const n = parseInt(hex.slice(1), 16); return [n >> 16, n >> 8 & 255, n & 255]; }
function hexOf(c) { return '#' + c.map(v => Math.max(0, Math.min(255, v | 0)).toString(16).padStart(2, '0')).join(''); }
function shade(hex, k) { return hexOf(rgb(hex).map(v => v * k)); }
function mix(a, b, t) { const A = rgb(a), B = rgb(b); return hexOf(A.map((v, i) => v + (B[i] - v) * t)); }
function cnv(w, h, sc) {
  sc = sc || SC;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  c.style.width = w * sc + 'px'; c.style.height = h * sc + 'px'; c.className = 'px';
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  return [c, g];
}
function R(g, x, y, w, h, col) { g.fillStyle = col; g.fillRect(x | 0, y | 0, w | 0, h | 0); }
function line(g, x0, y0, x1, y1, col, dash) {
  x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0; g.fillStyle = col;
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let e = dx + dy, n = 0;
  for (;;) {
    if (!dash || (n % (dash[0] + dash[1])) < dash[0]) g.fillRect(x0, y0, 1, 1);
    n++;
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * e;
    if (e2 >= dy) { e += dy; x0 += sx; }
    if (e2 <= dx) { e += dx; y0 += sy; }
  }
}
// a hanging cable between two points: parabola sag, 1 or 2 px thick with a lit top edge
function drape(g, x0, y0, x1, y1, sag, col, thick, stripe) {
  const n = Math.max(8, Math.abs(x1 - x0) | 0);
  const pts = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t + sag * 4 * t * (1 - t);
    pts.push([Math.round(x), Math.round(y)]);
  }
  pts.unshift([x0, y0]);
  for (let i = 0; i < pts.length - 1; i++) {
    const [a, b] = pts[i], [c2, d] = pts[i + 1];
    const k = stripe && ((i / 3 | 0) % 2) ? stripe : col;
    if (thick > 1) line(g, a, b + 1, c2, d + 1, shade(k, 0.55));
    line(g, a, b, c2, d, k);
  }
  return pts;
}
function sprite(g, rows, x, y, pal, sc) {
  sc = sc || 1;
  for (let r = 0; r < rows.length; r++) for (let q = 0; q < rows[r].length; q++) {
    const ch = rows[r][q]; if (ch === '.' || ch === ' ') continue;
    g.fillStyle = pal[ch] || '#f0f'; g.fillRect(x + q * sc, y + r * sc, sc, sc);
  }
}
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// ---------- avatars, 9x9 ----------
const APAL = { k: '#0b0c0e', s: '#7c848b', S: '#a9b6bf', g: '#f4f8fa', a: '#e8a83c', c: '#ff7a52', C: '#ffb08f', y: '#5fd3f2', w: '#eeeae0',
  d: '#2f3237', m: '#c9a54a', l: '#a9cf56', r: '#e2573f', v: '#9b87e8', b: '#86b3d6', p: '#e27a4e', t: '#4a4540' };
const AV = {
  claude: ['....c....', '.c..c..c.', '..c.c.c..', '...cCc...', 'cccCCCccc', '...cCc...', '..c.c.c..', '.c..c..c.', '....c....'],
  you: ['yk.......', 'yyk......', 'yyyk.....', 'yyyyk....', 'yyyyyk...', 'yyyyyyk..', 'yyyykkk..', 'yk.yyk...', 'k..kyyk..'],
  hauler: ['.........', 'kkkkkkkk.', 'kSSSSSSk.', 'kSaaSaak.', 'kSSSSSSk.', 'kmmmmmmk.', 'kkkkkkkk.', 'kdk..kdk.', '.k....k..'],
  welder: ['..kkkkk..', '.kSSSSSk.', 'kSgSSSSSk', 'kdddddddk', 'kdaaaaadk', 'kdddddddk', '.kssssk..', '..kkkk...', '.........'],
  tie: ['...kkk...', '..kSSSk..', '.kSySySk.', 'kwwwwwwwk', '.kSSSSSk.', 'kwwwwwwwk', '.kSSSSSk.', '..kkkkk..', '.........'],
  drone: ['kkkk.kkkk', '...k.k...', '..kkkkk..', '.kSSSSSk.', '.kSlSlSk.', '.kSSSSSk.', '..kkkkk..', '..k...k..', '.........'],
  foreman: ['..kkkkk..', '.kaaaaak.', 'kaaaaaaak', 'kkkkkkkkk', '.kSSSSSk.', '.kSgSgSk.', '.kSSSSSk.', '..kSSSk..', '...kkk...'],
  crawler: ['.........', '..kkkk...', '.kSSSSk..', 'kSbSSbSk.', 'kSSSSSSk.', 'kkkkkkkkk', 'kdsdsdsdk', '.kkkkkkk.', '.........'],
  bird: ['.........', '.........', '.........', 'ww.....ww', '.ww...ww.', '...www...', '....w....', '.........', '.........'],
  sys: ['....k....', '...kSk...', '..kSdSk..', '.kSdgdSk.', 'kSdgggdSk', '.kSdgdSk.', '..kSdSk..', '...kSk...', '....k....']
};
function avatar(kind, sc) {
  const [c, g] = cnv(9, 9, sc || SC);
  sprite(g, AV[kind] || AV.sys, 0, 0, APAL);
  c.classList.add('av');
  return c;
}
// a pixel name plate, like the in-world tags
function plate(text, fg, bg, sc) {
  const w = ptextW(text) + 4;
  const [c, g] = cnv(w, 7, sc || SC);
  R(g, 0, 0, w, 7, bg || '#2a2b30'); ptext(g, text, 2, 1, fg || C.text);
  c.classList.add('plate');
  return c;
}
