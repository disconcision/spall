// ==========================================================================
// The band: the open frequency every bot, drone and process in the city talks
// on. Flavour for now; nothing mechanical hangs on it yet. A generated crew
// (tie-bots, spinners, welders, haulers, motes, eyes, foremen, processes, a
// few residents, and something very large underneath) talks in threads. Bots
// don't write English: messages are pixels. Pidgin glyph strings (click a line
// for its gloss and time), blocks that run, plans whose holes fill as bots claim them, wire
// patches with pulses, drone routes, process lines, and live windows that
// follow something through the world (after Transport Tycoon). It shares the
// feed with the log and the chat (filter: Band) and leaks into All by a
// slider. Bots with bodies crawl the cables and fly the void.
// ==========================================================================
const BAND_MIX = [['pidgin', 'Pidgin', '#e6dfcf'], ['blocks', 'Blocks', '#a9cf56'], ['plans', 'Plans', '#9b87e8'], ['patches', 'Patches', '#5fd3c4'],
  ['routes', 'Routes', '#e8a83c'], ['windows', 'Windows', '#86b3d6'], ['procs', 'Processes', '#8f897d'], ['people', 'People', '#d8c3a5'], ['offtask', 'Off-task', '#e27a4e'], ['struct', 'Structure', '#86b3d6']];
const BAND_DEF = { on: true, traffic: 0.55, burst: 0.5, glide: 0.5, leak: 0.6, gloss: 'click', wins: 2, bodies: true, seed: 7, typing: true, names: 'col', probes: 'mix',
  mix: { pidgin: 0.9, blocks: 0.4, plans: 0.3, patches: 0.3, routes: 0.25, windows: 0.3, procs: 0.35, people: 0.1, offtask: 0.5, struct: 0.35 }, feat: {} };
const BAND = { cfg: null, crew: [], threads: [], recs: [], live: [], t: 0, ema: 0, credit: 1, weather: 1, wTo: 1, wT: 0, hush: 0, deepAt: 90,
  thN: 0, pin: true, hover: false, open: null, lt: false, anim: false, acc: 0, held: 0, focus: null, hoverBot: null, rnd: Math.random, ready: false, stage: undefined, w: null, W: 136, warm: false, anch: [], swarm: null, pulses: [] };
function bandLoad() {
  let c = null; try { c = JSON.parse(store.get('band', 'null')); } catch (e) { /* bad json: defaults */ }
  const d = JSON.parse(JSON.stringify(BAND_DEF));
  if (c && c.gloss === 'hover') c.gloss = 'click';   // hovering no longer reflows lines
  return c ? Object.assign(d, c, { mix: Object.assign(d.mix, c.mix || {}), feat: Object.assign({}, c.feat || {}) }) : d;
}
let bandSaveT = 0;
function bandSave() { clearTimeout(bandSaveT); bandSaveT = setTimeout(() => store.set('band', JSON.stringify(BAND.cfg)), 300); }
BAND.cfg = bandLoad();
const bandRate = () => 0.1 * Math.pow(80, BAND.cfg.traffic);   // messages a second: 0.1 … 8
const bnOn = code => BAND.cfg.feat[code] !== false;   // every piece of the band has a code (the catalog, 89_band2.js) and a switch
const bnR = () => BAND.rnd();
const bnPick = a => a[Math.floor(bnR() * a.length)];
const bnChance = p => bnR() < p;
const bnInt = (a, b) => a + Math.floor(bnR() * (b - a + 1));
function bnWeighted(list) { let s = 0; for (const e of list) s += e[1]; let u = bnR() * s; for (const e of list) { u -= e[1]; if (u <= 0) return e[0]; } return list[list.length - 1][0]; }

// ---------- glyphs: 5x5, '#' in the role colour, '+' a highlight; [role, gloss, rows] ----------
// roles after Uiua's colour-by-arity, in the data-wire strand palette
const BROLE = { V: '#e6dfcf', M: '#a9cf56', D: '#86b3d6', H: '#9b87e8', S: '#8f897d', Q: '#e8a83c', X: '#e2573f', E: '#e27a4e', C: '#ff7a52', Y: '#5fd3f2' };
const BNG = {
  '∿': ['V', 'cable', '.....', '.#...', '#.#.#', '...#.', '.....'],
  '▦': ['V', 'girder', '#####', '.#.#.', '..#..', '.#.#.', '#####'],
  '◇': ['V', 'mount', '..#..', '.#.#.', '#...#', '.#.#.', '..#..'],
  '⊥': ['V', 'post', '..#..', '..#..', '..#..', '..#..', '#####'],
  'ᵕ': ['V', 'bird', '.....', '##.##', '..+..', '.....', '.....'],
  '☼': ['V', 'light', '#.#.#', '.#.#.', '.....', '#####', '#++##'],
  '☾': ['V', 'night', '.###.', '##...', '#....', '##...', '.###.'],
  '≈': ['V', 'mist', '.....', '.##.#', '#..#.', '.##.#', '#..#.'],
  '☁': ['V', 'steam', '.....', '.##..', '#..##', '#...#', '.###.'],
  '⬚': ['V', 'void', '#.#.#', '.....', '#...#', '.....', '#.#.#'],
  '⌂': ['V', 'dock', '..#..', '.#.#.', '#...#', '#.#.#', '#####'],
  '◍': ['V', 'charge', '.###.', '#+++#', '#+++#', '#...#', '#####'],
  '♪': ['V', 'hum', '..##.', '..#.#', '..#..', '###..', '##...'],
  '⌁': ['V', 'noise', '#.#..', '...#.', '.#..#', '#..#.', '..#.#'],
  '∅': ['V', 'nothing', '.###.', '#..##', '#.#.#', '##..#', '.###.'],
  'Ω': ['V', 'builder', '.###.', '#...#', '#...#', '.#.#.', '##.##'],
  '@': ['V', 'me', '.###.', '#+#+#', '#####', '.#.#.', '##.##'],
  '✓': ['V', 'done', '.....', '....#', '...#.', '#.#..', '.#...'],
  '✻': ['C', 'claude', '#.#.#', '.###.', '##+##', '.###.', '#.#.#'],
  '⬉': ['Y', 'you', '###..', '##...', '#.#..', '...#.', '....#'],
  '⊓': ['M', 'lift', '#####', '#...#', '#...#', '#...#', '#...#'],
  '⊔': ['M', 'drop', '#...#', '#...#', '#...#', '#...#', '#####'],
  '✶': ['M', 'weld', '+.#.+', '.###.', '##+##', '.###.', '+.#.+'],
  '≡': ['M', 'tie', '##+##', '..+..', '##+##', '..+..', '##+##'],
  '→': ['M', 'go', '..#..', '...#.', '#####', '...#.', '..#..'],
  '←': ['M', 'back', '..#..', '.#...', '#####', '.#...', '..#..'],
  '↑': ['M', 'up', '..#..', '.###.', '#.#.#', '..#..', '..#..'],
  '↓': ['M', 'down', '..#..', '..#..', '#.#.#', '.###.', '..#..'],
  '↙': ['M', 'sink', '....#', '...#.', '#.#..', '##...', '###..'],
  '↻': ['M', 'again', '.###+', '#..++', '#...#', '#...#', '.###.'],
  '⚡': ['M', 'power', '...#.', '..#..', '.###.', '..#..', '.#...'],
  '◎': ['M', 'look', '.###.', '#...#', '#.#.#', '#...#', '.###.'],
  '⊕': ['M', 'add', '.###.', '#.#.#', '#####', '#.#.#', '.###.'],
  '⊖': ['M', 'cut', '.###.', '#...#', '#####', '#...#', '.###.'],
  '⊶': ['D', 'join', '.....', '#...#', '#####', '#...#', '.....'],
  '⑂': ['D', 'merge', '#...#', '.#.#.', '..#..', '..#..', '..#..'],
  '⌣': ['D', 'sag', '+...+', '#...#', '.#.#.', '..#..', '.....'],
  '⇢': ['D', 'to', '.....', '...#.', '##.##', '...#.', '.....'],
  '∴': ['D', 'so', '.....', '..#..', '.....', '#...#', '.....'],
  '≠': ['D', 'not', '...#.', '#####', '..#..', '#####', '.#...'],
  '⍥': ['H', 'repeat', '.....', '#...#', '.#.#.', '..#..', '.#.#.'],
  '∵': ['H', 'each', '.##..', '.##..', '.....', '##.##', '##.##'],
  '▢': ['H', 'hole', '##.##', '#...#', '.....', '#...#', '##.##'],
  ':': ['S', 'dup', '.....', '..#..', '.....', '..#..', '.....'],
  '⇄': ['S', 'swap', '...#.', '#####', '.....', '#####', '.#...'],
  '◌': ['S', 'pop', '.###.', '#...#', '#...#', '#...#', '.###.'],
  '⧗': ['S', 'wait', '#####', '.#.#.', '..#..', '.#.#.', '#####'],
  '⊢': ['D', 'shows', '#....', '#....', '#####', '#....', '#....'],
  '?': ['Q', 'ask', '###..', '...#.', '.##..', '.....', '.#...'],
  '✗': ['X', 'no', '#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
  '‼': ['X', 'alarm', '#.#..', '#.#..', '#.#..', '.....', '#.#..'],
  '♥': ['E', 'like', '##.##', '#####', '#####', '.###.', '..#..'],
  '☺': ['E', 'glad', '.....', '#...#', '.....', '#...#', '.###.'],
  '☹': ['E', 'sad', '.....', '#...#', '.....', '.###.', '#...#']
};
const bnIsG = t => typeof t === 'string' && BNG[t] !== undefined;
// some glyphs move while their line is fresh (L4): the again-arrow turns, the bird flaps, the hourglass drains…
// each returns other rows for now, a lift, or null to blink out
const bnRot = rows => rows.map((_, r) => rows.map(row => row[r]).reverse().join(''));
const BNANIM = {
  '↻': (t, d) => { let rows = d.slice(2); for (let i = Math.floor(t * 5) % 4; i > 0; i--) rows = bnRot(rows); return { rows }; },
  'ᵕ': t => (Math.floor(t * 4) % 3 === 0 ? { rows: ['#...#', '.#.#.', '..+..', '.....', '.....'] } : {}),
  '⧗': t => ({ rows: Math.floor(t * 2) & 1 ? ['#####', '.#.#.', '..#..', '.###.', '#####'] : ['#####', '.###.', '..#..', '.#.#.', '#####'] }),
  '◍': t => { const n = Math.floor(t * 3) % 4; return { rows: ['.###.', n > 2 ? '#+++#' : '#...#', n > 1 ? '#+++#' : '#...#', n > 0 ? '#+++#' : '#...#', '#####'] }; },
  '◎': t => { const p = [[2, 2], [1, 2], [2, 1], [3, 2], [2, 3]][Math.floor(t * 1.5) % 5], rows = ['.###.', '#...#', '#...#', '#...#', '.###.'].map(r => r.split('')); rows[p[1]][p[0]] = '#'; return { rows: rows.map(r => r.join('')) }; },
  '♥': t => ((t * 1.3) % 1 < 0.15 ? { rows: ['.....', '.#.#.', '.###.', '..#..', '.....'] } : {}),
  '‼': t => (Math.floor(t * 3) & 1 ? null : {}),
  '♪': t => ({ dy: Math.floor(t * 2.5) & 1 ? -1 : 0 }),
  '⚡': t => (Math.floor(t * 9) % 5 === 0 ? { col: '#fffbf2' } : {}),
  '☼': t => (Math.floor(t * 2) & 1 ? { rows: ['.#.#.', '#.#.#', '.....', '#####', '#++##'] } : {}),
  '⌁': t => { const f = Math.floor(t * 8); return { rows: [0, 1, 2, 3, 4].map(r => [0, 1, 2, 3, 4].map(q => (hash3(q, r, f) & 3) === 0 ? '#' : '.').join('')) }; }
};
function bnGlyph(g, k, x, y, col, sc) {
  const d = BNG[k]; sc = sc || 1;
  let base = col || BROLE[d[0]], rows = null;
  if (BAND.anim && BNANIM[k]) { const a = BNANIM[k](BAND.t + x * 0.13, d); if (!a) return 5 * sc; rows = a.rows; if (a.dy) y += a.dy; if (a.col) base = a.col; }
  for (let r = 0; r < 5; r++) for (let q = 0; q < 5; q++) {
    const ch = rows ? rows[r][q] : d[r + 2][q]; if (ch === '.') continue;
    g.fillStyle = ch === '+' ? (d[0] === 'V' ? '#ffffff' : '#eeeae0') : base;
    g.fillRect(x + q * sc, y + r * sc, sc, sc);
  }
  return 5 * sc;
}
// worn pairs fuse into one 7x5 glyph (L5): drawn by hand, or the two laid over each other, overlap lit
const BLIG = {
  '∿≡': { gl: 'tied-cable', rows: ['...b...', '.a.b...', 'a.aba.a', '...b.a.', '...b...'] },
  '▦✶': { gl: 'welded-girder', rows: ['aaaaa.b', '.a.a.b.', '..a.b+b', '.a.a.b.', 'aaaaa.b'] },
  '⊓→': { gl: 'carry', rows: ['aaaab..', 'a..a.b.', 'a.b+bbb', 'a..a.b.', 'a..ab..'] },
  '⌣∿': { gl: 'slack-run', at: 2 }, '◎ᵕ': { gl: 'birdwatch', at: 2 }, '⊥∿': { gl: 'hung-cable', at: 2 }, '≡≡': { gl: 'bundle', at: 2 }
};
for (const [k, L] of Object.entries(BLIG)) {
  const [a, b] = [...k]; L.ra = BNG[a][0]; L.rb = BNG[b][0];
  if (!L.rows) L.rows = [0, 1, 2, 3, 4].map(r => [0, 1, 2, 3, 4, 5, 6].map(q => { const A = q < 5 && BNG[a][r + 2][q] !== '.', B = q >= L.at && BNG[b][r + 2][q - L.at] !== '.'; return A && B ? '+' : A ? 'a' : B ? 'b' : '.'; }).join(''));
}
function bnLig(g, key, x, y, col) {
  const L = BLIG[key], ca = col || BROLE[L.ra], cb = col || (L.ra === L.rb ? mixHex(BROLE[L.rb], '#ffffff', 0.4) : BROLE[L.rb]);
  for (let r = 0; r < 5; r++) for (let q = 0; q < 7; q++) { const ch = L.rows[r][q]; if (ch !== '.') R_(g, x + q, y + r, 1, 1, ch === 'a' ? ca : ch === 'b' ? cb : '#ffffff'); }
  return 7;
}
const BSMALL = { '♥': ['#.#', '###', '.#.'], '☺': ['#.#', '...', '###'], '☹': ['#.#', '...', '#.#'], '♪': ['.##', '.#.', '##.'], '∿': ['...', '#.#', '.#.'] };
// tone (L3): stress lifts a glyph and underlines it, an aside is the glyph pooled to 3x3, unsure wobbles column by column
function bnTone(g, o, x, y, col) {
  const k = o.t, gl = bnIsG(k), c = col || (gl ? BROLE[BNG[k][0]] : BROLE.V);
  if (o.tone === 'stress') { const w = bnTok(g, k, x, y - 1, col); R_(g, x, y + 5, w, 1, mixHex(c, '#000000', 0.45)); return w; }
  if (o.tone === 'aside' && gl && BSMALL[k]) { BSMALL[k].forEach((row, r) => [...row].forEach((ch, q) => { if (ch === '#') R_(g, x + q, y + 2 + r, 1, 1, mixHex(c, '#000000', 0.2)); })); return 3; }
  if (o.tone === 'aside' && gl) {
    const d = BNG[k], B = [[0, 1], [2, 2], [3, 4]];
    for (let r = 0; r < 3; r++) for (let q = 0; q < 3; q++) { let on = false; for (let rr = B[r][0]; rr <= B[r][1]; rr++) for (let qq = B[q][0]; qq <= B[q][1]; qq++) if (d[rr + 2][qq] !== '.') on = true; if (on) R_(g, x + q, y + 2 + r, 1, 1, mixHex(c, '#000000', 0.2)); }
    return 3;
  }
  if (o.tone === 'unsure' && gl && BAND.anim) {
    const d = BNG[k];
    for (let q = 0; q < 5; q++) { const dy = Math.round(Math.sin(BAND.t * 5 + q * 1.3 + x) * 0.9); for (let r = 0; r < 5; r++) { const ch = d[r + 2][q]; if (ch !== '.') R_(g, x + q, y + r + dy, 1, 1, ch === '+' ? '#ffffff' : c); } }
    return 5;
  }
  return bnTok(g, k, x, y, col);
}
// a token is a glyph, text in the 3x5 font, an array (a quoted program in violet brackets),
// or a voiced glyph: {t, tone: 'stress' | 'aside' | 'unsure'}, or {lig: pair} (a worn pair, fused)
function bnTokW(t) { return Array.isArray(t) ? t.reduce((a, u) => a + bnTokW(u) + 1, 5) : t && t.lig ? 7 : t && t.t ? (t.tone === 'aside' && bnIsG(t.t) ? 3 : bnTokW(t.t)) : bnIsG(t) ? 5 : ptextW(t); }
function bnTok(g, t, x, y, col) {
  if (t && t.lig) return bnLig(g, t.lig, x, y, col);
  if (t && t.t) return bnTone(g, t, x, y, col);
  if (Array.isArray(t)) {
    const v = col || BROLE.H;
    R_(g, x, y - 1, 2, 1, v); R_(g, x, y - 1, 1, 7, v); R_(g, x, y + 5, 2, 1, v);
    let xx = x + 3; for (const u of t) xx += bnTok(g, u, xx, y, col) + 1;
    R_(g, xx, y - 1, 2, 1, v); R_(g, xx + 1, y - 1, 1, 7, v); R_(g, xx, y + 5, 2, 1, v);
    return xx + 2 - x;
  }
  if (bnIsG(t)) return bnGlyph(g, t, x, y, col);
  ptext(g, t, x, y, col || BROLE.V); return ptextW(t);
}
const bnGloss = t => Array.isArray(t) ? 'prog' : t && t.lig ? BLIG[t.lig].gl : t && t.t ? bnGloss(t.t) : bnIsG(t) ? BNG[t][1] : null;
const bnMoves = t => t && (t.tone === 'unsure' || (t.t ? bnMoves(t.t) : !!BNANIM[t]));   // anything in it that animates
function bnSprite(g, rows, x, y, pal) {
  for (let r = 0; r < rows.length; r++) for (let q = 0; q < rows[r].length; q++) { const ch = rows[r][q]; if (ch === '.') continue; g.fillStyle = pal[ch] || '#ff00ff'; g.fillRect(x + q, y + r, 1, 1); }
}
function bnLine(g, x0, y0, x1, y1, col) {
  x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0; g.fillStyle = col;
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let e = dx + dy;
  for (;;) { g.fillRect(x0, y0, 1, 1); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
}
// the pixels of a hanging cable between two points (a parabola's sag), one per column
function bnDrape(x0, y0, x1, y1, sag) {
  const n = Math.max(2, Math.abs(x1 - x0)), pts = [];
  for (let i = 0; i <= n; i++) { const t = i / n; pts.push([Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t + sag * 4 * t * (1 - t))]); }
  return pts;
}

// ---------- the crew ----------
// 9x9 faces; the kinds run from motes the size of a moth to the Builder, which nobody has seen whole
const BNPAL = { k: '#0b0c0e', s: '#7c848b', S: '#a9b6bf', g: '#f4f8fa', a: '#e8a83c', y: '#5fd3f2', w: '#eeeae0', d: '#2f3237', m: '#c9a54a',
  l: '#a9cf56', r: '#e2573f', v: '#9b87e8', b: '#86b3d6', q: '#5fd3c4', B: '#a08a5c', o: '#5e4f33', h: '#d8b896', f: '#5d6470' };
const BNAV = {
  tie: ['...kkk...', '..kSSSk..', '.kSySySk.', 'kwwwwwwwk', '.kSSSSSk.', 'kwwwwwwwk', '.kSSSSSk.', '..kkkkk..', '.........'],
  spin: ['..kkkkk..', '.kSSSSSk.', '.kqqqqqk.', '.kSSSSSk.', '.kqqqqqk.', '.kSSSSSk.', '..kkkkk..', '....k....', '....qq...'],
  weld: ['..kkkkk..', '.kSSSSSk.', 'kSgSSSSSk', 'kdddddddk', 'kdaaaaadk', 'kdddddddk', '.kssssk..', '..kkkk...', '.........'],
  haul: ['.........', 'kkkkkkkk.', 'kSSSSSSk.', 'kSaaSaak.', 'kSSSSSSk.', 'kmmmmmmk.', 'kkkkkkkk.', 'kdk..kdk.', '.k....k..'],
  mote: ['.........', '.........', '..k...k..', '...kkk...', '..kSaSk..', '...kkk...', '....k....', '.........', '.........'],
  eye: ['...kkk...', '..kbbbk..', '.kbkkkbk.', '.kbkgkbk.', '.kbkkkbk.', '..kbbbk..', '...kkk...', '..k...k..', '.k.....k.'],
  fore: ['..kkkkk..', '.kaaaaak.', 'kaaaaaaak', 'kkkkkkkkk', '.kSSSSSk.', '.kSgSgSk.', '.kSSSSSk.', '..kSSSk..', '...kkk...'],
  sys: ['....k....', '...kSk...', '..kSdSk..', '.kSdgdSk.', 'kSdgggdSk', '.kSdgdSk.', '..kSdSk..', '...kSk...', '....k....'],
  deep: ['kkkkkkkkk', 'kBBBBBBBk', 'kBoooooBk', 'kBorrroBk', 'kBoooooBk', 'kBBBBBBBk', 'kBoBoBoBk', 'kBBBBBBBk', 'kkkkkkkkk'],
  folk: ['...kkk...', '..khhhk..', '..khhhk..', '...khk...', '.kkfffkk.', 'kfffffffk', 'kfffffffk', 'kfffffffk', '.........']
};
const BKIND = {
  tie: { col: '#eeeae0', av: 'tie', body: 'crawl', n: 4, order: 'SOV', tics: ['♪', 'ᵕ', '✓'], talk: 1.2, name: () => bnChance(0.35) ? bnPick(['PIP', 'NIB', 'OKO', 'TUK', 'LUM', 'BEK', 'YIP', 'MOL', 'ZEE', 'KIT']) : 'TIE·' + bnInt(2, 48) },
  spin: { col: '#5fd3c4', av: 'spin', body: 'fly', n: 3, order: 'SVO', tics: ['↻', '∿'], talk: 1, name: () => 'SPN-' + bnInt(1, 30) },
  weld: { col: '#e0a33a', av: 'weld', body: 'perch', n: 2, order: 'VSO', tics: ['✶', '‼'], talk: 0.8, name: () => 'WLD/' + bnInt(1, 9) },
  haul: { col: '#b89a58', av: 'haul', body: 'walk', n: 2, order: 'SVO', tics: ['⧗', '☹'], talk: 0.6, name: () => 'HL-' + bnInt(2, 19) },
  mote: { col: '#a9b6bf', av: 'mote', body: 'swarm', n: 7, order: 'VO', tics: ['↻', ':'], talk: 0.4, name: () => '·' + bnInt(10, 99) },
  eye: { col: '#86b3d6', av: 'eye', body: 'hover', n: 2, order: 'SVO', tics: ['◎', '?'], talk: 0.8, name: () => 'EYE-' + bnInt(1, 12) },
  fore: { col: '#9b87e8', av: 'fore', body: null, n: 2, order: 'SVO', tics: ['∴'], talk: 0.7, name: () => 'F-' + bnInt(1, 9) },
  proc: { col: '#8f897d', av: 'sys', body: null },
  deep: { col: '#a08a5c', av: 'deep', body: null },
  folk: { col: '#d8c3a5', av: 'folk', body: null }
};
const BPROCS = ['GC', 'SCHED', 'BAKE', 'ROUTE.D', 'TIEWATCH', 'PRUNE', 'CLOCK'];
function bnBot(k, name) {
  const K = BKIND[k];
  if (!name) { do name = K.name(); while (BAND.crew.some(b => b.name === name)); }
  const b = { id: BAND.crew.length, k, name, col: K.col, av: K.av, order: K.order, tic: K.tics ? bnPick(K.tics) : null, ticP: 0.15 + bnR() * 0.3,
    dupP: bnR() * 0.14, ligP: ((BAND.crew.length * 7919 + 31) % 97) / 110, friends: [], task: null, body: null, spokeAt: -9, pal: BNPAL, mini: BNAV[K.av].slice(1, 8).map(r => r.slice(1, 8)) };   // the 9x9 face cropped for the dense rows
  if (k === 'folk') b.pal = Object.assign({}, BNPAL, { f: bnPick(PEDCOL), h: bnPick(SKIN) });
  BAND.crew.push(b);
  return b;
}
function bandCrew() {
  BAND.rnd = mulberry32(BAND.cfg.seed * 977 + 13); BAND.crew = [];
  for (const k of ['tie', 'spin', 'weld', 'haul', 'mote', 'eye', 'fore']) for (let i = 0; i < BKIND[k].n; i++) bnBot(k);
  for (const n of BPROCS) bnBot('proc', n);
  bnBot('deep', 'BUILDER');
  for (let i = 0; i < 6; i++) { const n = bnPick(['KAI', 'MIRA', 'ODE', 'TAM', 'IVO', 'SANA', 'REN', 'LUZ', 'ABE', 'NOOR', 'JUN', 'ELI']) + '·' + lvCode(bnInt(3, 13)); if (!BAND.crew.some(b => b.name === n)) bnBot('folk', n); }
  const work = BAND.crew.filter(b => BKIND[b.k].talk);
  // friends: mostly their own trade, a couple across
  for (const b of work) { const same = work.filter(o => o !== b && o.k === b.k), any = work.filter(o => o !== b); for (let i = 0; i < 3; i++) { const f = bnPick(i < 1 && same.length ? same : any); if (!b.friends.includes(f)) b.friends.push(f); } }
  for (const b of work) b.task = bnTask(b);
  BAND.stage = undefined;   // bodies are placed again on the next tick
}
const bnOf = k => bnPick(BAND.crew.filter(b => b.k === k));
const bnTalker = () => bnWeighted(BAND.crew.filter(b => BKIND[b.k].talk).map(b => [b, BKIND[b.k].talk]));
const bnFriend = a => a.friends.length ? bnPick(a.friends) : bnTalker();
function bnLevel(b) { if (b && b.body && b.body.p) return clamp(Math.floor(b.body.p[2]), 0, NL - 1); const st = WIRES.stage; return st ? clamp(Math.round(st.zf) + bnInt(-2, 4), 0, NL - 1) : bnInt(2, 14); }
const bnLv = b => lvCode(b.task ? b.task.z : bnLevel(b));
const BTASK = { tie: [['≡', '∿'], ['≡', '◇']], spin: [['⊶', '∿'], ['⌣', '∿']], weld: [['✶', '▦'], ['✶', '◇']], haul: [['⊓', '▦'], ['⊔', '▦']],
  mote: [['◎', '⬚'], ['↻', '∿'], ['◎', 'ᵕ']], eye: [['◎', '∿'], ['◎', '⬚'], ['◎', '☼']], fore: [['∵', '▢']] };
function bnTask(b) { const T = BTASK[b.k]; if (!T) return null; const [act, obj] = bnPick(T); return { act, obj, z: bnLevel(b), n: bnInt(2, b.k === 'mote' ? 16 : 9), k: 0 }; }

// ---------- what bots say: pidgin ----------
// the work report, in the bot's word order (some are verb-final, some drop the subject)
function bnStatus(b) {
  const t = b.task; if (!t) return ['@', '?'];
  if (t.k >= t.n) { b.task = bnTask(b); return ['✓', t.act, t.obj, String(t.n)]; }
  t.k = Math.min(t.n, t.k + 1 + (bnChance(0.3) ? 1 : 0));
  const prog = t.k >= t.n ? '✓' : t.k + '/' + t.n, lv = lvCode(t.z), s = bnChance(0.6) ? ['@'] : [];
  if (b.order === 'SOV') return [...s, t.obj, lv, t.act, prog];
  if (b.order === 'VSO') return [t.act, ...s, t.obj, lv, prog];
  if (b.order === 'VO') return [t.act, t.obj, prog];
  return [...s, t.act, t.obj, lv, prog];
}
// idiolect: a tic at the end, a doubled first word, motes clipped short; then the voice (plain: words only, for structures)
function bnIdio(b, toks, plain) {
  toks = toks.slice();
  if (b.k === 'mote' && toks.length > 3) toks.length = 3;
  if (bnChance(b.dupP) && bnIsG(toks[0])) toks.unshift(toks[0]);
  if (b.tic && bnChance(b.ticP) && toks[toks.length - 1] !== b.tic) toks.push(b.tic);
  return plain ? toks : bnVoice(b, toks);
}
// the voice: worn pairs fused (each bot its own habit), a stressed act, an aside at the end, an unsure question
function bnVoice(b, toks) {
  const out = toks.slice(), str = t => typeof t === 'string';
  if (bnOn('L5') && bnChance(b.ligP)) for (let i = 0; i < out.length - 1; i++) if (str(out[i]) && str(out[i + 1]) && BLIG[out[i] + out[i + 1]]) out.splice(i, 2, { lig: out[i] + out[i + 1] });
  if (bnOn('L3')) {
    const unsure = b.k === 'mote' ? 0.5 : 0.15;
    out.forEach((t, i) => {
      if (!str(t) || !bnIsG(t)) return;
      if (t === '?' && bnChance(unsure)) out[i] = { t, tone: 'unsure' };
      else if (i === out.length - 1 && i > 0 && '♥☺☹♪'.includes(t) && bnChance(0.35)) out[i] = { t, tone: 'aside' };
    });
    const m = out.findIndex(t => str(t) && bnIsG(t) && BNG[t][0] === 'M');
    if (m >= 0 && bnChance(0.12)) out[m] = { t: out[m], tone: 'stress' };
  }
  return out;
}
// what each word leaves on the stack (L6), if the band were a concatenative language: things push, acts take one and
// leave their own, relations take two, the stack words do what they say
function bnStacks(toks) {
  const s = [], out = [];
  for (const t of toks) {
    const k = typeof t === 'string' ? t : t.t || null, r = k && bnIsG(k) ? BNG[k][0] : 'V';
    if (k === ':') { if (s.length) s.push(s[s.length - 1]); }
    else if (k === '⇄') { if (s.length > 1) s.push(s.pop(), s.pop()); }
    else if (k === '◌') s.pop();
    else if (r === 'M' || r === 'H') { s.pop(); s.push(r); }
    else if (r === 'D') { s.pop(); s.pop(); s.push('D'); }
    else s.push(r);
    while (s.length > 4) s.shift();
    out.push(s.slice());
  }
  return out;
}
// conversations: (a, b) -> turns [speaker, tokens, addressee]
const BWORK = [
  (a, b) => [[a, bnStatus(a)], [b, bnPick([['✓'], ['◎', '?'], [':', '✓'], ['⧗'], ['♥'], ['→', '✓']]), a]],
  (a, b) => { const o = bnPick(['▦', '◇', '∿', '◍', '≡']), n = String(bnInt(1, 6)), yes = bnChance(0.6);
    return [[a, ['?', o, n, bnLv(a)], b], [b, yes ? ['⊔', o, n, '⇢', '@'] : bnPick([['✗'], ['∅', o], ['⧗', '⧗'], ['?', '?'], ['◌']]), a],
      [a, yes ? bnPick([['♥'], ['✓'], [':', '♥']]) : bnPick([['☹'], ['⧗'], ['↻', '?']])]]; },
  (a, b) => { const q = bnPick([['≡', '⍥', '4'], ['⌣', '∿'], ['◎', '∵', '◇'], ['⊓', '▦', '↑'], ['✶', '⍥', '3'], ['∵', '∿', '≡']]);
    return [[a, ['⇢', q, '?'], b], [b, bnPick([[':', q], ['✓', q], ['⇄', '✓'], ['◌', '✗']]), a]]; },
  (a, b) => [[a, ['∿', String(WIRES.cables.length), '≡', String(WIRES.ties.length)]], [b, bnPick([['∴', '≡', '⊕'], ['✓'], ['≡', '≡', '≡'], ['⊥', String(WIRES.posts.length), '?'], ['⊕', '⊕']])]],
  (a, b) => [[a, ['◎', '⌣', '∿', bnLv(a)]], [b, bnPick([['⌣', '✓'], ['⌣', '↑', '≡'], ['‼', '⌣'], ['⌣', '≠', '✗']])], [a, bnPick([['✓'], ['≡', '→'], ['♥']])]],
  (a, b) => { const out = [[a, bnStatus(a)]]; if (bnChance(0.6)) out.push([a, bnStatus(a)]); out.push([b, bnPick([['→', '?'], ['✓'], ['⧗', '@'], ['◎']]), a]); return out; },
  (a, b) => [[a, ['@', '→', bnLv(b), '?'], b], [b, bnPick([['✓', '⧗'], ['✗', '‼'], ['→', '→'], ['⬚', '?']]), a]],
  a => [[a, bnStatus(a)]],
  a => [[a, bnStatus(a)]],
  a => [[a, bnStatus(a)]]
];
const BOFF = [
  (a, b) => S.tod === 'night' ? [[a, ['☾', '⧗']], [b, bnPick([['☾', '♪'], ['◍', '⌂'], ['☾', '♥']])]]
    : S.tod === 'dusk' ? [[a, ['☼', '↙', bnPick(['☹', '♥', '⧗'])]], [b, bnPick([['☼', '↙', '♥'], ['☾', '?'], [':', '☹']])]]
    : [[a, bnPick([['☼', '♥'], ['☼', '↓', bnLv(a)], ['@', '☼', '☺']])], [b, bnPick([['☼', '☺'], [':', '♥'], ['☼', '◍', '↑']])]],
  (a, b) => [[a, bnPick([['ᵕ', '◎'], ['ᵕ', '⊥', bnLv(a)], ['ᵕ', '≡', '✗'], ['ᵕ', 'ᵕ', 'ᵕ'], ['ᵕ', '♥']])], [b, bnPick([['ᵕ', '?'], ['ᵕ', '☺'], ['◎', 'ᵕ', '♥'], ['ᵕ', '⊥', '←'], ['ᵕ', '≠', '▦']])],
    ...(bnChance(0.5) ? [[a, bnPick([['ᵕ', '↑', '↑'], ['♥'], ['ᵕ', '✓']])]] : [])],
  (a, b) => [[a, ['◍', '∅'], b], [b, bnPick([['⌂', '→'], ['◍', '⇢', '@'], ['◍', '✗'], ['⌂', '⧗', '☺']]), a], [a, bnPick([['♥'], ['⌂', '→'], ['◍', '☺']])]],
  (a, b) => [[a, bnPick([['♪', '∿', '♪'], ['♪', '♪'], ['♪', '≡', '♪', '≡']])], [b, bnPick([['♪'], [':', '♪'], ['♪', '✗', '⧗'], ['⌁', '?']])]],
  (a, b) => [[a, bnPick([['Ω', '↓', '⬚', '⌁'], ['Ω', '?'], ['⌁', 'Ω', '⌁']])], [b, bnPick([['‼'], ['Ω', '☹'], ['∅', '∅'], ['⌁', '⌁', '⌁'], ['Ω', '♥', '?']])], [a, bnPick([['◌'], ['@', '↑', '↑'], ['⧗'], ['Ω', '≠', '∅']])]],
  (a, b) => [[a, ['◎', '☺', '?'], b], [b, ['◌', '◌', '◌', '∅'], a], [a, [':', '♥'], b]],
  (a, b) => [[a, bnPick([['∴', '@', '?'], ['@', '≠', '∅'], ['∿', '∵', '∿', '∴', '∿']])], [b, bnPick([['@', '⇄', '@'], ['∅', '≠', '@'], ['✓'], ['?', '?'], ['♥']])]],
  (a, b) => AGENT.state !== 'idle' ? [[a, ['✻', '◎', lvCode(AGENT.level != null ? AGENT.level : 6)]], [b, bnPick([['✻', '♥'], ['✻', '▢', '⇢', '@', '?'], ['◎', '✻'], ['✻', '?']])]]
    : [[a, ['⬉', '?']], [b, bnPick([['⬉', '◎', '@'], ['⬉', '♥'], ['⬉', '⧗'], ['∅']])]],
  (a, b) => [[a, bnPick([['≈', '↑', 'L3'], ['☁', '⇢', bnLv(a)], ['≈', '☹']])], [b, bnPick([['≈', '◎', '✗'], ['☁', '♥'], ['≈', '↓']])]],
  (a, b) => [[a, ['@', ':', '@', '?'], b], [b, bnPick([['✗', '∅'], ['@', '⇄', '@'], ['◌']]), a], [a, ['☹']]],
  a => [[a, bnPick([['♥'], ['☺'], ['♪'], ['⧗', '☺'], ['ᵕ'], ['@', '☼'], ['◌', '☺']])]]
];
const BPROCSAY = {
  GC: () => ['◌', String(bnInt(3, 240)), 'STK', String(bnInt(0, 9))],
  SCHED: () => { const b = bnTalker(); return [b.name, '⇢', bnLv(b)]; },
  BAKE: () => ['☼', lvCode(bnInt(2, 15)), (bnR() * 0.9).toFixed(2)],
  'ROUTE.D': () => ['⑂', String(bnInt(2, 9)), '→', lvCode(bnInt(2, 15))],
  TIEWATCH: () => ['≡', String(WIRES.ties.length), '∿', String(WIRES.cables.length)],
  PRUNE: () => { const n = bnInt(40, 400); return ['⌁', String(n), '→', String(Math.round(n * bnR() * 0.3))]; },
  CLOCK: () => [fmtTime(S.time), S.tod === 'night' ? '☾' : '☼']
};
const BFOLKSAY = [
  z => `is anyone else's light flickering on ${lvCode(z)}?`, () => 'the tie robots are humming again',
  () => `something big moved under ${bnPick(['B1', 'B2'])}. felt it in the stairs`, () => 'whose drone keeps landing on my balcony',
  z => `${lvCode(z)} lift smells like solder`, z => `saw a bird ride a cable all the way up to ${lvCode(z)}`,
  () => 'who restrung the gallery overnight', () => 'ok who hung laundry on the data line', z => `pods are late on ${lvCode(z)} again`,
  () => 'mist so thick down here you could chew it', () => 'there is a little one stuck on the girder outside my window. it seems fine about it',
  () => 'thank you to whoever fixed the stair', () => 'my kid says the robots talk about us', () => 'anyone know what the violet boxes mean',
  () => 'the coral one waved at me. i think', z => `${lvCode(z)} is humming at a new pitch tonight`
];

// ---------- message forms: each fits itself to the row and draws in art pixels ----------
// fit(rec, hx) -> { inline (starts beside the name, at hx), full (whole width), h, draw(g, x, y) }.
// units(): how many steps it is typed out in (glyphs, blocks, leaves…): bots don't send messages, they compose them on air.
const BROW = 7, BNAMEW = 32;
const BPACE = { tie: 0.07, spin: 0.06, weld: 0.08, haul: 0.13, mote: 0.035, eye: 0.06, fore: 0.075, proc: 0.016 };
// when each unit lands: an uneven hand, the odd hesitation, now and then a wrong glyph typed and taken back
function bnRev(b, n, kind) {
  if (kind === 'win') return { ts: [0.7], end: 0.7, ghost: null };   // a window tunes in
  const base = (BPACE[b.k] || 0.06) * ({ blocks: 0.8, rocks: 1.8, patch: 3, route: 2.6 }[kind] || 1) * clamp(1.1 / Math.sqrt(bandRate()), 0.25, 1.6);
  const ts = []; let t = 0;
  for (let i = 0; i < n; i++) { t += base * (0.45 + bnR() * 1.1); if (i && bnChance(0.07)) t += base * (3 + bnR() * 6); ts.push(t); }
  let ghost = null;
  if (kind === 'pid' && n > 2 && bnChance(0.08)) { const i = bnInt(1, n - 1), gap = 0.25 + base * 2, a = ts[i - 1] + base * 0.6; ghost = { i, g: bnPick(Object.keys(BNG)), a, b: a + gap }; for (let j = i; j < n; j++) ts[j] += gap + base; }
  return { ts, end: ts[n - 1] || 0, ghost };
}
// how far a message is typed: [units shown, progress toward the next]
function bnK(rec) {
  const R = rec && rec.rev; if (!R) return [1e9, 0];
  const t = BAND.t - rec.t0, ts = R.ts; let k = 0;
  while (k < ts.length && ts[k] <= t) k++;
  if (k >= ts.length) return [1e9, 0];
  const a = k ? ts[k - 1] : 0; return [k, clamp((t - a) / Math.max(1e-3, ts[k] - a), 0, 1)];
}
const bnTyping = rec => !!rec.rev && BAND.t - rec.t0 < rec.rev.end;
function bnLay(toks, maxW, gloss) {
  const gap = gloss ? 3 : 2, rowH = gloss ? 16 : 7, cells = []; let x = 0, y = 0, w = 0;
  for (const t of toks) {
    const tw = bnTokW(t), gl = gloss ? bnGloss(t) : null, cw = Math.max(tw, gl ? ptextW(gl) : 0);
    if (x > 0 && x + cw > maxW) { x = 0; y += rowH; }
    cells.push({ t, gl, x, y, tw, cw }); x += cw + gap; w = Math.max(w, x - gap);
  }
  return { w, h: y + (gloss ? 14 : 5), cells };
}
// the first k cells, then a caret where the next glyph will land (and a wrong one, briefly)
function bnDrawLay(g, L, ox, oy, col, rec) {
  const [k] = bnK(rec);
  L.cells.forEach((c, i) => {
    if (i >= k) return;
    const dx = (c.cw - c.tw) >> 1; bnTok(g, c.t, ox + c.x + dx, oy + c.y, col);
    if (c.gl) { R_(g, ox + c.x + dx, oy + c.y + 7, c.tw, 1, '#2c2b28'); ptext(g, c.gl, ox + c.x + ((c.cw - ptextW(c.gl)) >> 1), oy + c.y + 9, '#77705f'); }
  });
  if (k >= L.cells.length) return;
  const R = rec.rev, t = BAND.t - rec.t0, c = L.cells[k];
  let cx = ox + c.x; const cy = oy + c.y;
  if (R.ghost && R.ghost.i === k && t >= R.ghost.a && t < R.ghost.b) { bnGlyph(g, R.ghost.g, cx, cy, '#5a554d'); cx += 6; }
  if ((Math.floor(BAND.t * 7) & 1) || t - (k ? R.ts[k - 1] : 0) < 0.12) R_(g, cx, cy, 1, 5, rec.bot.col);
}
// loud: a shout, every glyph doubled (alarms); stacks: the stack strip under it (one row only)
function fPid(toks, col, loud, stacks) {
  const stk = stacks ? bnStacks(toks) : null, depth = stk ? Math.max(1, ...stk.map(q => q.length)) : 0;
  return { kind: 'pid', toks, glossy: !col && toks.some(bnGloss), units: () => toks.length, anim: () => toks.some(bnMoves),
    fit(rec, hx) {
      const W = rec.W, gl = rec.gloss && this.glossy, hang = BAND.cfg.names === 'col';
      if (stk && !gl && !loud) {
        const L = bnLay(toks, W - hx, false);
        if (L.h === 5) return { inline: true, h: 7 + depth * 3, draw: (g, x, y) => {
          bnDrawLay(g, L, x, y, col, rec);
          const [k] = bnK(rec), by = y + 6 + depth * 3;
          R_(g, x, by, L.w, 1, '#26272b');
          L.cells.forEach((c, i) => { if (i >= k) return; const bx = x + c.x + ((c.cw - 5) >> 1); stk[i].forEach((rl, j) => R_(g, bx, by - 2 - j * 3, 5, 2, j === stk[i].length - 1 ? BROLE[rl] : mixHex(BROLE[rl], '#141517', 0.5))); });
        } };
      }
      if (loud && !gl) {
        const L = bnLay(toks, (W - hx) >> 1, false), c = mk(L.w + 3, L.h), cg = c.getContext('2d');
        return { inline: true, h: L.h * 2, draw: (g, x, y) => { cg.clearRect(0, 0, c.width, c.height); bnDrawLay(cg, L, 0, 0, col, rec); g.imageSmoothingEnabled = false; g.drawImage(c, x, y, c.width * 2, c.height * 2); } };
      }
      if (hang || !gl) { const L = bnLay(toks, W - hx, gl); if (hang || L.h === 5) return { inline: true, h: L.h, draw: (g, x, y) => bnDrawLay(g, L, x, y, col, rec) }; }
      const L = bnLay(toks, W - 9, gl);
      return { h: L.h, draw: (g, x, y) => bnDrawLay(g, L, x, y, col, rec) };
    } };
}
// a process's stack, bottom left, top right
function fStack(items) {
  return { kind: 'stk', units: () => items.length, fit(rec) {
    const ws = items.map(t => bnTokW(t) + 4);
    return { inline: true, h: 5, draw: (g, x, y) => {
      const [k] = bnK(rec); let xx = x;
      items.forEach((t, i) => { if (i >= k) return; const top = i === items.length - 1; R_(g, xx, y - 1, ws[i], 7, top ? '#2f2a45' : '#212226'); R_(g, xx, y - 1, ws[i], 1, top ? '#6c62a0' : '#3a3c41'); bnTok(g, t, xx + 2, y, '#8f897d'); xx += ws[i] + 1; });
      if (k >= items.length) ptext(g, '<', xx + 1, y, '#5a554d');
    } };
  } };
}
// ---------- blocks (after Scratch / Snap!): built block by block, then run; probes in a gutter on the right ----------
const BKC = { ev: '#d9a441', act: '#8fb44a', ctl: '#8a78d6', rel: '#6f9fc6', stk: '#8a8478' };
const bnSayW = toks => toks.reduce((s, t) => s + bnTokW(t) + 1, -1) + 4;
const bnItemW = t => t.proj ? t.w : t.slot != null ? bnTokW(t.slot) + 4 : t.bool ? bnTokW(t.bool) + 6 : t.say ? bnSayW(t.say) : bnTokW(t);
// projectors (P3, after Hazel's livelits): a live view inside a block of what it is doing. s: { col, cur, done, bad, prog }
const BPROJ = {
  cable(g, x, y, w, s) {   // two posts, the cable paying out to its sag
    R_(g, x, y - 2, w, 9, mixHex(s.col, '#000000', 0.62)); R_(g, x + 1, y - 1, 1, 7, '#d9d2c2'); R_(g, x + w - 2, y - 1, 1, 7, '#d9d2c2');
    if (!s.cur && !s.done) return;
    const sag = s.cur ? clamp(s.prog * 1.3, 0, 1) * 2.6 : 2.6 + (BAND.anim ? Math.sin(BAND.t * 2.2) * 0.7 : 0);
    for (const [px, py] of bnDrape(x + 2, y, x + w - 3, y, sag)) R_(g, px, py, 1, 1, '#e27a4e');
  },
  dots(g, x, y, w, s) {    // the ties put on so far this run
    R_(g, x, y - 2, w, 9, mixHex(s.col, '#000000', 0.62)); R_(g, x + 1, y + 2, w - 2, 1, '#e27a4e');
    const n = s.bad ? 2 : s.cur ? Math.floor(s.prog * 6.99) : s.done ? 6 : 0;
    for (let k = 0; k < n; k++) R_(g, x + 2 + k * 4, y, 1, 5, '#eeeae0');
  },
  gauge(g, x, y, w, s) {   // the tension the IF reads
    R_(g, x, y - 2, w, 9, mixHex(s.col, '#000000', 0.62));
    const cx = x + 5, cy = y + 5;
    for (let a = 0; a <= 8; a++) { const th = Math.PI * (1 - a / 8); R_(g, Math.round(cx + Math.cos(th) * 4), Math.round(cy - Math.sin(th) * 4), 1, 1, a > 5 ? '#e2573f' : '#d9d2c2'); }
    const v = s.cur ? 0.3 + 0.55 * s.prog : s.done ? 0.86 : 0.32, th = Math.PI * (1 - v);
    bnLine(g, cx, cy, Math.round(cx + Math.cos(th) * 3), Math.round(cy - Math.sin(th) * 3), '#fffbf2');
  }
};
function bnBlkLabelW(label) { let w = 0; for (const t of label) w += bnItemW(t) + 3; return w - 3; }
// n: how many of the label's items are typed so far; s: the block's run state, for projectors
function bnBlkLabel(g, label, x, y, ink, n, s) {
  for (let i = 0; i < label.length && i < n; i++) {
    const t = label[i];
    if (t.proj) { BPROJ[t.proj](g, x, y, t.w, s); x += t.w + 3; }
    else if (t.slot != null) { const w = bnTokW(t.slot) + 4; R_(g, x, y - 2, w, 9, '#f2ede1'); g.clearRect(x, y - 2, 1, 1); g.clearRect(x + w - 1, y - 2, 1, 1); g.clearRect(x, y + 6, 1, 1); g.clearRect(x + w - 1, y + 6, 1, 1); bnTok(g, t.slot, x + 2, y, '#24211d'); x += w + 3; }
    else if (t.bool) { const w = bnTokW(t.bool) + 6; R_(g, x + 2, y - 2, w - 4, 9, '#3a5a1a'); R_(g, x + 1, y - 1, w - 2, 7, '#3a5a1a'); R_(g, x, y, w, 5, '#3a5a1a'); bnTok(g, t.bool, x + 3, y, '#e9f3c9'); x += w + 3; }
    else if (t.say) { const w = bnSayW(t.say); R_(g, x, y - 2, w, 9, '#16171a'); R_(g, x, y - 2, w, 1, '#0b0c0e'); let xx = x + 2; for (const u of t.say) xx += bnTok(g, u, xx, y) + 1; x += w + 3; }   // pidgin in a slot, in its own colours
    else { bnTok(g, t, x, y, ink); x += bnTokW(t) + 3; }
  }
}
// probes: 3x3 marks, a type alphabet nobody was taught
const BMICRO = { o: ['###', '#.#', '###'], d: ['.#.', '#.#', '.#.'], l: ['#..', '#..', '###'], w: ['...', '#.#', '.#.'], c: ['#..', '.#.', '#..'], i: ['.#.', '.#.', '.#.'],
  e: ['###', '...', '###'], u: ['#.#', '#.#', '###'], n: ['###', '#.#', '#.#'], t: ['###', '.#.', '.#.'], x: ['#.#', '.#.', '#.#'] };
function bnMicro(g, k, x, y, col) { const m = BMICRO[k]; for (let r = 0; r < 3; r++) for (let q = 0; q < 3; q++) if (m[r][q] === '#') R_(g, x + q, y + r, 1, 1, col); }
function bnProbeOf() {
  const sym = () => [bnPick('odlwiuntex'), bnPick([BROLE.V, BROLE.M, BROLE.D, BROLE.H, '#5fd3c4'])];
  return { ty: [...Array(bnInt(0, 2)).fill(0).map(sym), ['c', '#5a554d'], sym()], sb: bnInt(0, 3), sa: bnInt(0, 3), lv: 0.15 + bnR() * 0.8, ph: bnR() * 6 };
}
const bnProbeW = (st, p) => st === 'type' ? p.ty.length * 4 - 1 : st === 'stack' ? (p.sb + p.sa) * 2 + 4 : 11;
// st: type (static: shown once built), stack (what it left: shown once run), live (a meter that moves while it runs)
function bnDrawProbe(g, st, p, x, y, state) {
  if (state === 'bad') { bnMicro(g, 'x', x, y, '#e2573f'); bnMicro(g, p.ty[p.ty.length - 1][0], x + 4, y, '#7a3a30'); return; }
  if (st === 'type') { const cur = state === 'cur' && (Math.floor(BAND.t * 8) & 1); p.ty.forEach(([k, c], i) => bnMicro(g, k, x + i * 4, y, cur ? '#fffbf2' : c)); return; }
  if (st === 'stack') {
    if (state === 'todo') { R_(g, x + 2, y + 1, 1, 1, '#3e3c37'); R_(g, x + 5, y + 1, 1, 1, '#3e3c37'); return; }
    let xx = x; for (let i = 0; i < p.sb; i++, xx += 2) R_(g, xx, y, 1, 3, '#8f897d');
    bnMicro(g, 'c', xx, y, '#5a554d'); xx += 4;
    for (let i = 0; i < p.sa; i++, xx += 2) R_(g, xx, y, 1, 3, i === p.sa - 1 ? BROLE.H : '#8f897d');
    return;
  }
  const v = state === 'cur' ? 0.5 + 0.5 * Math.sin(BAND.t * 9 + p.ph) : state === 'done' ? p.lv : 0;
  R_(g, x, y + 1, 11, 1, '#2c2b28'); if (v) R_(g, x, y + 1, Math.max(1, Math.round(11 * v)), 1, state === 'cur' ? '#fffbf2' : '#5fd3c4');
  if (state !== 'todo') R_(g, x + Math.round(10 * v), y, 1, 3, state === 'cur' ? '#fffbf2' : '#a39c8e');
}
function fBlocks(spec, pstyle) {
  let n = 0, u = 0; (function num(list) { for (const b of list) { b.ix = n++; b.u0 = u; u += 1 + b.label.length; b.pr = bnProbeOf(); if (b.inner) num(b.inner); } })(spec);
  const measure = list => { let w = 0, h = 0; for (const b of list) { const lw = bnBlkLabelW(b.label) + 8; if (b.type === 'c') { const m = measure(b.inner); w = Math.max(w, lw, m.w + 6); h += 11 + m.h + 6; } else { w = Math.max(w, lw); h += 11 + (b.type === 'hat' ? 3 : 0); } } return { w, h }; };
  const m = measure(spec);
  return { kind: 'blocks', spec, n, w: m.w + 5, pstyle, units: () => u,
    fit(rec) { return { h: m.h + 3, draw: (g, x, y) => bnDrawBlocks(g, spec, x, y, rec) }; } };
}
function bnDrawBlocks(g, spec, X, Y, rec) {
  const run = rec.run, pc = run ? Math.floor((BAND.t - run.t0) / run.per) : 99, stop = run && run.fail >= 0 ? run.fail : 99;
  const at = Math.min(pc, stop), over = pc >= rec.form.n || (run && run.fail >= 0 && pc > run.fail), [k] = bnK(rec);
  const pst = BAND.cfg.probes === 'off' ? null : BAND.cfg.probes === 'mix' ? rec.form.pstyle : BAND.cfg.probes, gx = rec.W - 2;
  const tabs = [], prog = run ? clamp((BAND.t - run.t0) / run.per - pc, 0, 1) : 0; let mark = null, halt = false, crack = null;
  const probe = (b, x, y, lw, cur, done, bad) => {
    if (!pst || !bnOn('P2') || k <= b.u0 + b.label.length) return;
    const pw = bnProbeW(pst, b.pr), px = gx - pw;
    for (let lx = x + lw + 2; lx < px - 2; lx += 2) R_(g, lx, y + 5, 1, 1, '#3e3c37');   // a dotted leader out to the gutter
    bnDrawProbe(g, pst, b.pr, px, y + 4, bad ? 'bad' : cur ? 'cur' : done || (run && over) ? 'done' : 'todo');
  };
  const round = (x, y, w, h) => { g.clearRect(x, y, 1, 1); g.clearRect(x + w - 1, y, 1, 1); g.clearRect(x, y + h - 1, 1, 1); g.clearRect(x + w - 1, y + h - 1, 1, 1); };   // a pixel off each corner
  const draw = (list, x, y, parentCol) => {
    for (const b of list) {
      if (halt || b.u0 >= k) { halt = true; return y; }
      let col = b.col;
      if (parentCol && parentCol === col) col = mixHex(col, '#ffffff', 0.25);   // zebra, after Snap!
      const cur = run && !over && b.ix === at && pc >= 0, done = run && !over && b.ix < at, bad = run && run.fail === b.ix && pc >= b.ix;
      const after = bnOn('P4') && run && run.fail >= 0 && pc >= run.fail && b.ix > run.fail;   // past a failure: never ran, knocked askew
      if (done) col = mixHex(col, '#1b1c1f', 0.45);
      if (after) col = mixHex(col, '#1b1c1f', 0.68);
      if (bad) col = '#a8463a';
      const st = { col, cur, done: done || (run && over && !after), bad, prog };
      if (after) { x += 1; y += 1; }   // past the failure: knocked a pixel askew
      const lw = bnBlkLabelW(b.label) + 8, hi = mixHex(col, '#ffffff', 0.35), lo = mixHex(col, '#000000', 0.4), ink = done ? '#3a372f' : '#1b1305', ni = k - b.u0 - 1;
      if (cur) mark = [x, y + (b.type === 'hat' ? 3 : 0)];
      if (b.type === 'hat') {
        R_(g, x + 1, y, 14, 1, hi); R_(g, x, y + 1, 18, 1, col); R_(g, x, y + 2, lw, 1, col); y += 3;
        R_(g, x, y, lw, 11, col); R_(g, x, y + 10, lw, 1, lo); g.clearRect(x + lw - 1, y - 1, 1, 1); g.clearRect(x, y + 10, 1, 1); g.clearRect(x + lw - 1, y + 10, 1, 1); bnBlkLabel(g, b.label, x + 4, y + 3, ink, ni, st); probe(b, x, y, lw, cur, done, bad); tabs.push([x + 3, y + 11, lo]); y += 11;
      } else if (b.type === 'c') {
        const im = (function hgt(l) { let h = 0; for (const q of l) h += q.type === 'c' ? 17 + hgt(q.inner) : 11 + (q.type === 'hat' ? 3 : 0); return h; })(b.inner);
        const w = Math.max(lw, 30);
        R_(g, x, y, w, 11, col); R_(g, x, y, w, 1, hi); g.clearRect(x, y, 1, 1); g.clearRect(x + w - 1, y, 1, 1); g.clearRect(x + w - 1, y + 10, 1, 1);
        bnBlkLabel(g, b.label, x + 4, y + 3, ink, ni, st); probe(b, x, y, w, cur, done, bad);
        R_(g, x, y + 11, 4, im, col); R_(g, x, y + 11, 1, im, hi);
        draw(b.inner, x + 4, y + 11, b.col);
        if (after) { x -= 1; y -= 1; }
        const yb = y + 11 + im, bw = Math.min(w, 22); R_(g, x, yb, bw, 6, col); R_(g, x, yb + 5, bw, 1, lo); g.clearRect(x + bw - 1, yb, 1, 1); g.clearRect(x, yb + 5, 1, 1); g.clearRect(x + bw - 1, yb + 5, 1, 1); tabs.push([x + 3, yb + 6, lo]); y = yb + 6;
      } else {
        R_(g, x, y, lw, 11, col); R_(g, x, y, lw, 1, hi); R_(g, x, y + 10, lw, 1, lo); R_(g, x + 3, y, 5, 1, mixHex(col, '#000000', 0.25)); round(x, y, lw, 11);
        bnBlkLabel(g, b.label, x + 4, y + 3, ink, ni, st); probe(b, x, y, lw, cur, done, bad);
        if (bad) {
          if (bnOn('P4')) crack = [x, y, lw, col];
          else { let cy = y + 1; for (let cx = x + lw - 9; cx < x + lw - 2; cx++) { R_(g, cx, cy, 1, 2, '#2a1210'); cy += (cx & 1) ? 2 : -1; } }
        }
        if (b.type !== 'cap') tabs.push([x + 3, y + 11, lo]); y += 11;
      }
      if (after && b.type !== 'c') { x -= 1; y -= 1; }   // drawn askew, laid out where it was
    }
    return y;
  };
  draw(spec, X + 3, Y, null);
  for (const [x, y, col] of tabs) R_(g, x, y, 5, 1, col);
  if (crack) {   // a failed block: cracked through, a chip knocked off its corner, a red flag on a string
    const [x, y, lw, col] = crack, P = [[x + 5, y], [x + 9, y + 3], [x + 8, y + 5], [x + 13, y + 7], [x + 12, y + 9], [x + 16, y + 11]];
    for (let i = 0; i < P.length - 1; i++) { bnLine(g, P[i][0] + 1, P[i][1], P[i + 1][0] + 1, P[i + 1][1], mixHex(col, '#ffffff', 0.45)); bnLine(g, P[i][0], P[i][1], P[i + 1][0], P[i + 1][1], '#0b0c0e'); }
    g.clearRect(x + lw - 3, y, 3, 2); g.clearRect(x + lw - 1, y + 2, 1, 1); R_(g, x + lw + 1, y + 12, 2, 2, col);
    R_(g, x + lw, y + 4, 5, 1, '#8b857a'); R_(g, x + lw + 5, y + 1, 7, 7, '#e2573f'); R_(g, x + lw + 5, y + 8, 1, 3, '#8b857a'); bnGlyph(g, '‼', x + lw + 6, y + 2, '#1b1305');
  }
  if (mark) { R_(g, mark[0] - 3, mark[1] + 3, 1, 5, '#fffbf2'); R_(g, mark[0] - 2, mark[1] + 4, 1, 3, '#fffbf2'); R_(g, mark[0] - 1, mark[1] + 5, 1, 1, '#fffbf2'); }
}
const bnProbeStyle = () => bnPick(['type', 'stack', 'live']);
function bnBlocksFor(b) {
  const lv = bnLv(b), f = bnFriend(b), n = String(bnInt(2, 8));
  const verbs = {
    tie: [['TIE', { slot: n }], ['GRIP', '∿'], ['SLIDE', '≡', { slot: '0.5' }], ['COUNT', '≡']],
    spin: [['SPAN', '⊥', { slot: 'A' }, '⇢', { slot: 'B' }], ['PAY', '∿', { slot: (1 + bnR() * 4).toFixed(1) }], ['SAG', { slot: '0.4' }]],
    weld: [['WELD', '▦', { slot: lv }], ['HEAT', { slot: '900' }], ['COOL', { slot: '4S' }]],
    haul: [['LIFT', '▦', { slot: n }], ['WALK', '→', { slot: lv }], ['SET', '▦']],
    mote: [['SCAN', '⬚'], ['ORBIT', '⊥'], ['PING', '◎']],
    eye: [['LOOK', '◎', { slot: lv }], ['FOLLOW', 'ᵕ'], ['SNAP', '☼']],
    fore: [['ASSIGN', '▢', '⇢', { slot: f.name }], ['CHECK', '✓']]
  }[b.k] || [['PING', '◎']];
  const lit = bnOn('P3') && bnChance(0.55);   // some routines carry live projectors
  if (lit) verbs.push(...({ tie: [['TIE', 'EVERY', { slot: '4' }, { proj: 'dots', w: 25 }]], spin: [['DRAPE', { slot: '3M' }, { proj: 'cable', w: 20 }], ['PAY', '∿', { proj: 'cable', w: 18 }]],
    haul: [['LIFT', '▦', { proj: 'gauge', w: 11 }]], weld: [['HEAT', { proj: 'gauge', w: 11 }]], fore: [['TIE', 'EVERY', { slot: '4' }, { proj: 'dots', w: 25 }]] }[b.k] || []).flatMap(v => [v, v, v]));
  const st = () => ({ type: 'stack', col: BKC.act, label: bnPick(verbs) });
  const say = () => !bnOn('P5') ? st() : ({ type: 'stack', col: BKC.rel, label: ['SAY', { say: bnIdio(b, bnPick([bnStatus(b).slice(0, 3), ['♪', '∿'], ['ᵕ', '◎'], ['◍', '?'], ['✓', '♥'], ['@', '⧗']])) }] });
  const hat = { type: 'hat', col: BKC.ev, label: bnPick([['WHEN', '⚡'], ['WHEN', '☼'], ['ON', '‼'], ['WHEN', '◍', { slot: '20%' }], ['ON', '⇢', { slot: f.name }]]) };
  const body = [st()];
  const c = bnPick([['REPEAT', { slot: n }], ['EACH', '∿'], ['IF', { bool: 'ᵕ' }], ['UNTIL', { bool: '☼' }], ['EACH', '◇'], ['IF', { say: ['ᵕ', '≡'] }], ...(lit ? [['IF', { bool: 'TAUT' }, { proj: 'gauge', w: 11 }]] : [])]);
  body.push({ type: 'c', col: BKC.ctl, label: c, inner: [st(), ...(bnChance(0.5) ? [bnChance(0.4) ? say() : st()] : [])] });
  if (bnChance(0.5)) body.push(bnChance(0.5) ? say() : { type: 'stack', col: BKC.rel, label: ['SEND', '⇢', { slot: f.name }] });
  body.push({ type: 'cap', col: BKC.stk, label: bnPick([['DOCK', '⌂'], ['SLEEP'], ['REPORT', '✓'], ['POP', '◌']]) });
  const ps = bnProbeStyle(), room = BAND.W - 12 - (BAND.cfg.probes === 'off' ? 0 : 22);
  const fb = fBlocks([hat, ...body], ps);
  return fb.w <= room ? fb : fBlocks([hat, body[0], body[body.length - 1]], ps);
}
// ---------- pidgin set in structures: proof trees, parse trees ----------
// a derivation (sequent style): premises over a line, the rule's name beside it, the conclusion under; built from the leaves down
function fDeriv(root) {
  let u = 0;
  const lay = n => {
    n.p.forEach(lay);
    n.lined = n.p.length > 0 || !!n.ax;
    n.cw = n.c.reduce((s, t) => s + bnTokW(t) + 2, -2);
    n.pw = n.p.reduce((s, q) => s + q.w, 0) + Math.max(0, n.p.length - 1) * 7;
    n.lineW = Math.max(n.cw, n.pw, 9);
    n.rw = n.r && n.lined ? n.r.reduce((s, t) => s + bnTokW(t) + 1, 1) : 0;
    n.w = n.lineW + n.rw;
    const hp = n.p.length ? Math.max(...n.p.map(q => q.h)) : 0;
    n.h = n.lined ? hp + 8 : 5; n.hp = hp;
    n.uL = u; if (n.lined) u += 2;   // the line, then its rule's name
    n.uC = u; u += n.c.length;
  };
  lay(root);
  const draw = (g, n, x, y, k, fr) => {
    let px = x + ((n.lineW - n.pw) >> 1);
    for (const q of n.p) { draw(g, q, px, y + n.hp - q.h, k, fr); px += q.w + 7; }
    let cy = y;
    if (n.lined) {
      const ly = y + n.hp + 1, lw = k > n.uL ? n.lineW : k === n.uL ? Math.round(n.lineW * fr) : 0;
      if (lw) R_(g, x, ly, lw, 1, '#8f897d');
      if (k > n.uL + 1 && n.r) { let rx = x + n.lineW + 2; for (const t of n.r) rx += bnTok(g, t, rx, ly - 2, '#6a655b') + 1; }
      cy = ly + 2;
    }
    let tx = x + ((n.lineW - n.cw) >> 1);
    n.c.forEach((t, i) => { if (n.uC + i < k) bnTok(g, t, tx, cy); tx += bnTokW(t) + 2; });
  };
  return { kind: 'deriv', w: root.w, units: () => u,
    fit(rec) { return { h: root.h, draw: (g, x, y) => { const [k, fr] = bnK(rec); draw(g, root, x, y, k, fr); } }; } };
}
function bnDeriv(b, concl) {
  const seq = () => bnPick([['@', '◍', '⊢', '⊓'], ['∿', '⊢', '≡'], ['@', '⊢', b.task ? b.task.act : '◎'], ['☼', '⊢', '◍'], ['ᵕ', '⊢', '∅'], ['⊥', '∿', '⊢', '⌣']]);
  const ax = () => ({ c: bnPick([['◍', '⊢', '◍'], ['@', '⊢', '@'], ['∿', '⊢', '∿'], ['☼'], ['⊥', bnLv(b)], ['ᵕ']]), p: [], ax: bnChance(0.6), r: ['AX'] });
  const rule = () => bnPick([['≡', 'I'], ['⊓', 'R'], ['∿', 'E'], ['CUT'], [':', 'L'], ['⇄'], ['∵', 'I']]);
  const mid = () => ({ c: seq(), p: bnChance(0.5) ? [ax(), ax()] : [ax()], r: rule() });
  const c = concl.includes('⊢') ? concl : [bnPick(['@', '◍', '∿']), '⊢', ...concl];
  for (const ps of [() => [mid(), ax()], () => [mid()], () => [ax()]]) { const F = fDeriv({ c, p: ps(), r: rule() }); if (F.w <= BAND.W - 12) return F; }
  return null;
}
// a parse tree over the sentence: typed first, then parsed, bracket by bracket up to the root
function fTree(toks) {
  const L = bnLay(toks, 1e9, false), leaves = L.cells.map(c => ({ lv: 0, x: c.x + (c.tw >> 1) }));
  const split = (i, j) => {
    if (j - i === 1) return leaves[i];
    const n = j - i, parts = n > 3 && bnChance(0.4) ? 3 : 2, cuts = [i];
    for (let p = 1; p < parts; p++) cuts.push(clamp(i + Math.round(n * p / parts + (bnR() - 0.5)), cuts[cuts.length - 1] + 1, j - (parts - p)));
    cuts.push(j);
    const kids = []; for (let p = 0; p < parts; p++) kids.push(split(cuts[p], cuts[p + 1]));
    const head = toks[i], role = bnIsG(head) ? BNG[head][0] : 'V';
    return { kids, lv: 1 + Math.max(...kids.map(q => q.lv)), x: Math.round(kids.reduce((s, q) => s + q.x, 0) / kids.length), col: BROLE[role], m: bnPick('odtnu') };
  };
  const root = toks.length > 1 ? split(0, toks.length) : leaves[0], top = root.lv, nodes = [];
  (function walk(n) { if (n.kids) { nodes.push(n); n.kids.forEach(walk); } })(root);
  root.m = 'd';
  const yOf = n => (top - n.lv) * 6;
  return { kind: 'tree', w: L.w, units: () => toks.length + top,
    fit(rec) { return { h: top * 6 + 5, draw: (g, x, y) => {
      const [k] = bnK(rec), shown = lv => k > toks.length + lv - 1;
      for (const n of nodes) if (shown(n.lv)) {
        const ny = y + yOf(n);
        for (const q of n.kids) bnLine(g, x + n.x, ny + 3, x + q.x, y + (q.kids ? yOf(q) : top * 6) - 1, '#4a4740');
        bnMicro(g, n.m, x + n.x - 1, ny, n === root ? '#e6dfcf' : n.col);
      }
      bnDrawLay(g, L, x, y + top * 6, null, k < toks.length ? rec : null);
    } }; } };
}
// some turns are set in structure rather than said in a line: the same words, parsed, derived or put in a block
function bnStructured(b, toks) {
  const u = bnR();
  if (u < 0.4 && toks.length > 2 && bnOn('L9')) return fTree(toks);
  if (u < 0.8 && bnOn('L8')) return bnDeriv(b, toks);
  if (!bnOn('P5')) return null;
  return fBlocks([{ type: 'hat', col: BKC.ev, label: ['ON', '⇢'] }, { type: 'cap', col: BKC.rel, label: ['SAY', { say: toks }] }], bnProbeStyle());
}
// ---------- plans: ragged nested blocks with holes (after Cohen & Chugh's rocks; holes after Hazel) ----------
// tree: nested arrays; '\n' breaks the line; leaves: tokens or {hole}, {slider:[l,v]}, {check:[l,on]}
const BLEX = { SPAN: 'M', TIE: 'M', WELD: 'M', LIFT: 'M', DRAPE: 'M', SET: 'M', EACH: 'H', WHEN: 'H', PLAN: 'H', VIA: 'D', TO: 'D', AT: 'D' };
function fRocks(tree, holes) {
  const leaves = [];
  const norm = (a, depth, parent) => {
    const n = { k: 'n', ch: [], depth, parent };
    for (const e of a) {
      if (e === '\n') { n.ch.push({ k: 'nl' }); continue; }
      if (Array.isArray(e)) { n.ch.push(norm(e, depth + 1, n)); continue; }
      const L = { k: 't', parent: n };
      if (typeof e === 'string') { L.t = e; L.w = bnTokW(e); } else if (e.hole) { L.hole = e; L.w = 9; }
      else if (e.fill) { L.fill = e; L.w = e.fill.reduce((s, t) => s + bnTokW(t) + 1, -1) + 2; }   // a hole that was filled: what filled it (H3)
      else if (e.slider) { L.slider = e.slider; L.w = ptextW(e.slider[0]) + 3 + 15 + 3 + ptextW(e.slider[1]); } else if (e.check) { L.check = e.check; L.w = 6 + ptextW(e.check[0]); }
      n.ch.push(L);
    }
    return n;
  };
  const root = norm(tree, 0, null);
  const hgt = n => n.k !== 'n' ? 0 : (n.h = 1 + Math.max(0, ...n.ch.filter(c => c.k !== 'nl').map(hgt)));
  hgt(root);
  const nodes = []; (function walk(n) { if (n.k === 'n') { nodes.push(n); n.ch.forEach(walk); } })(root);
  let hmax = 0; for (const n of nodes) if (n !== root) hmax = Math.max(hmax, n.h);
  const pitch = 7 + 2 * hmax + 2, x0 = root.h + 1, y0 = root.h + 1;
  const path = L => { const p = []; let q = L; while (q) { p.unshift(q); q = q.parent; } return p; };
  let x = x0, ln = 0, prev = null, maxX = 0;
  (function flow(n) {
    for (const c of n.ch) {
      if (c.k === 'nl') { ln++; x = (n.firstX != null ? n.firstX : x) + 6; prev = null; continue; }
      if (c.k === 'n') { flow(c); if (n.firstX == null) n.firstX = c.firstX; continue; }
      if (prev) { const pa = path(prev), pb = path(c); let i = 0; while (pa[i] === pb[i]) i++; const A = pa[i], B = pb[i]; x += (A.k === 'n' ? A.h : 0) + (B.k === 'n' ? B.h : 0) + 2; }
      c.x = x; c.ln = ln; x += c.w + 2; maxX = Math.max(maxX, x);
      if (n.firstX == null) n.firstX = c.x;
      leaves.push(c); prev = c;
    }
  })(root);
  const Wd = maxX + root.h + 2, Hd = y0 + ln * pitch + 7 + root.h + 2;
  const id = (xx, yy) => yy * Wd + xx, masks = new Map();
  const leafMask = L => { const m = new Uint8Array(Wd * Hd), y = y0 + L.ln * pitch; for (let yy = y - 1; yy < y + 6; yy++) for (let xx = L.x - 1; xx < L.x + L.w + 1; xx++) m[id(xx, yy)] = 1; return m; };
  // a node's shape: the row hull of its children, bridged between lines, dilated by a pixel
  const nodeMask = n => {
    const kids = n.ch.filter(c => c.k !== 'nl').map(c => c.k === 'n' ? nodeMask(c) : leafMask(c)), u = new Uint8Array(Wd * Hd);
    for (const m of kids) for (let i = 0; i < u.length; i++) u[i] |= m[i];
    const span = [];
    for (let yy = 0; yy < Hd; yy++) { let a = -1, b = -1; for (let xx = 0; xx < Wd; xx++) if (u[id(xx, yy)]) { if (a < 0) a = xx; b = xx; } span.push(a < 0 ? null : [a, b]); }
    const occ = span.map((s, i) => s ? i : -1).filter(i => i >= 0), h = new Uint8Array(Wd * Hd);
    for (let yy = occ[0]; yy <= occ[occ.length - 1]; yy++) {
      let s = span[yy];
      if (!s) { let ya = yy; while (!span[ya]) ya--; let yb = yy; while (!span[yb]) yb++; const A = span[ya], B = span[yb], lo = Math.max(A[0], B[0]), hi = Math.min(A[1], B[1]); s = lo <= hi ? [lo, hi] : [Math.min(A[0], B[0]), Math.max(A[1], B[1])]; }
      for (let xx = s[0]; xx <= s[1]; xx++) h[id(xx, yy)] = 1;
    }
    const d = new Uint8Array(Wd * Hd);
    for (let yy = 1; yy < Hd - 1; yy++) for (let xx = 1; xx < Wd - 1; xx++) { let on = 0; for (let dy = -1; dy <= 1 && !on; dy++) for (let dx = -1; dx <= 1; dx++) if (h[id(xx + dx, yy + dy)]) { on = 1; break; } d[id(xx, yy)] = on; }
    masks.set(n, d); return d;
  };
  nodeMask(root);
  // the shapes and the fixed words are drawn once; holes change, so they're drawn per paint
  const base = mk(Wd, Hd), bg = base.getContext('2d');
  const FILL = ['#211d31', '#2b2642', '#363052', '#413963', '#4b4274'], LITE = ['#564c84', '#685d9b', '#7a6eb0', '#8a7ec0', '#9a8ecf'];
  nodes.sort((a, b) => a.depth - b.depth);
  for (const n of nodes) {
    const m = masks.get(n), f = FILL[Math.min(n.depth, 4)], li = LITE[Math.min(n.depth, 4)], dk = mixHex(li, '#000000', 0.38);
    const out = (xx, yy) => xx < 0 || yy < 0 || xx >= Wd || yy >= Hd || !m[id(xx, yy)];
    for (let yy = 0; yy < Hd; yy++) for (let xx = 0; xx < Wd; xx++) {
      if (!m[id(xx, yy)]) continue;
      const U = out(xx, yy - 1), Dn = out(xx, yy + 1), Lf = out(xx - 1, yy), Rt = out(xx + 1, yy);
      if ((U || Dn) && (Lf || Rt)) continue;   // a convex corner: a pixel off, so the rocks read rounded
      const edge = U || Lf || Rt || Dn;
      bg.fillStyle = !edge ? f : (U || Lf) ? li : dk; bg.fillRect(xx, yy, 1, 1);
    }
  }
  if (bnOn('H6')) {   // rivets along the outer rock's top and bottom edges
    const m = masks.get(root);
    for (let xx = 3; xx < Wd - 3; xx += 5) {
      let a = -1, b = -1; for (let yy = 0; yy < Hd; yy++) if (m[id(xx, yy)]) { if (a < 0) a = yy; b = yy; }
      if (a >= 0 && b - a > 6) { R_(bg, xx, a + 1, 1, 1, '#7a6eb0'); R_(bg, xx, b - 1, 1, 1, '#3f3866'); }
    }
  }
  for (const L of leaves) {
    const y = y0 + L.ln * pitch;
    if (L.t != null) { const role = bnIsG(L.t) ? null : BLEX[L.t] || 'V'; bnTok(bg, L.t, L.x, y, role ? BROLE[role] : null); }
    else if (L.slider) { const xx = L.x + ptextW(L.slider[0]) + 3; ptext(bg, L.slider[0], L.x, y, BROLE.V); R_(bg, xx, y + 2, 15, 1, '#57506f'); R_(bg, xx, y + 2, 9, 1, BROLE.H); R_(bg, xx + 8, y, 3, 5, '#eeeae0'); R_(bg, xx + 9, y + 1, 1, 3, BROLE.H); ptext(bg, L.slider[1], xx + 18, y, '#eeeae0'); }
    else if (L.fill) { let xx = L.x + 1; for (const t of L.fill.fill) xx += bnTok(bg, t, xx, y) + 1; }
    else if (L.check) { R_(bg, L.x, y, 5, 5, '#6c62a0'); R_(bg, L.x + 1, y + 1, 3, 3, '#16141f'); if (L.check[1]) { R_(bg, L.x + 1, y + 2, 1, 1, '#eeeae0'); R_(bg, L.x + 2, y + 3, 1, 1, '#eeeae0'); R_(bg, L.x + 3, y + 1, 1, 2, '#eeeae0'); } ptext(bg, L.check[0], L.x + 7, y, BROLE.V); }
  }
  const slots = leaves.filter(L => L.hole).map(L => ({ L, y: y0 + L.ln * pitch })), fills = leaves.filter(L => L.fill), tech = bnOn('H6');
  return { kind: 'rocks', w: Wd, holes, tree, units: () => leaves.length,
    fit(rec) { return { h: Hd + (tech ? 2 : 0), draw: (g, x, y) => {
      if (tech) {   // registration ticks at the corners, and the plan's serial up on the name line
        for (const [cx, cy, dx, dy] of [[x - 2, y - 1, 1, 0], [x - 2, y - 1, 0, 1], [x + Wd + 1, y - 1, -1, 0], [x + Wd + 1, y - 1, 0, 1], [x - 2, y + Hd, 1, 0], [x - 2, y + Hd, 0, -1], [x + Wd + 1, y + Hd, -1, 0], [x + Wd + 1, y + Hd, 0, -1]]) R_(g, cx, cy, dx ? 2 : 1, dy ? 2 : 1, '#4a4466');
        const sn = 'PLN ' + String(rec.th % 100).padStart(2, '0'); ptext(g, sn, rec.W - 1 - ptextW(sn), y - 8, '#4a4466');
      }
      const [k] = bnK(rec);
      if (k < leaves.length) {   // printed line by line, leaf by leaf
        const L = leaves[Math.max(0, k - 1)], cy = y + y0 + L.ln * pitch - 3;
        g.save(); g.beginPath(); g.rect(x, y, Wd, cy - y); if (k) g.rect(x, cy, L.x + L.w + 3, pitch + 2); g.clip(); g.drawImage(base, x, y); g.restore();
      } else g.drawImage(base, x, y);
      for (const s of slots) if (leaves.indexOf(s.L) < k) bnDrawHole(g, x + s.L.x, y + s.y, s.L.hole);
      for (const L of fills) { const a = BAND.t - L.fill.at; if (a < 3.5 && (a > 2.5 || Math.floor(a * 6) & 1 || a < 0.4)) { const yy = y + y0 + L.ln * pitch; R_(g, x + L.x - 1, yy + 6, L.w + 2, 1, '#e8a83c'); R_(g, x + L.x - 1, yy - 2, 1, 2, '#e8a83c'); R_(g, x + L.x + L.w, yy - 2, 1, 2, '#e8a83c'); } }   // fresh: marked in amber
    } }; } };
}
// where a hole went (H5): from the crew that couldn't, past the foreman and claude, up to you
function fLadder(chain, h) {
  const st = [...chain.map(b => ({ b })), { g: '✻', col: BROLE.C }, { g: '⬉', col: BROLE.Y }];
  return { kind: 'ladder', liveFor: st.length * 0.7 + 0.6, units: () => 1,
    fit(rec, hx) { return { inline: true, h: 17, draw: (g, x, y) => {
      const gap = Math.min(26, Math.floor((rec.W - x - 10) / (st.length - 1))), X = st.map((_, i) => x + 1 + i * gap);
      st.forEach((s, i) => {
        if (s.b) bnSprite(g, s.b.mini, X[i], y + 9, s.b.pal); else bnGlyph(g, s.g, X[i] + 1, y + 10, s.col);
        if (i < st.length - 1) for (let k = X[i] + 10; k < X[i + 1] - 1; k += 2) R_(g, k, y + 12, 1, 1, '#3f3c37');
      });
      const q = clamp((BAND.t - rec.t0) / 0.7, 0, st.length - 1), i = Math.floor(q), j = Math.min(st.length - 1, i + 1), f = q - i;
      const hx2 = Math.round(X[i] + (X[j] - X[i]) * f), hy = y + 1 - Math.round(Math.sin(Math.PI * f) * (i === j ? 0 : 1));
      const col = i >= st.length - 1 ? BROLE.Y : i < chain.length ? BROLE.X : BROLE.H, x0 = hx2 - 1, x1 = hx2 + 7, y0 = hy - 1, y1 = hy + 5;
      for (const [cx, cy, dx, dy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) { R_(g, cx, cy, 1, 1, col); R_(g, cx + dx, cy, 1, 1, col); R_(g, cx, cy + dy, 1, 1, col); }
      ptext(g, h.label, hx2 + 2, hy, col);
    } }; } };
}
// a hole filled: the plan is laid out again with what filled it in its place, so it grows (H3)
const BFILL = { spin: () => ['∿', (1 + bnR() * 4).toFixed(1)], weld: () => ['✶', bnPick(['N', 'S', 'E', 'W'])], haul: () => ['▦', '×' + bnInt(2, 6)], tie: () => ['≡', String(bnInt(3, 8))] };
function bnRegrow(F, h) {
  const swap = a => a.map(e => e === h ? { fill: (BFILL[h.kind] || BFILL.tie)(), at: BAND.t } : Array.isArray(e) ? swap(e) : e);
  const G = fRocks(swap(F.tree), F.holes);
  return G.w <= BAND.W - 14 ? G : null;
}
// a hole: a dark well in corner brackets; claimed, a sub-agent's progress runs along its foot; done, it fills
function bnDrawHole(g, x, y, h) {
  const w = 9, x0 = x - 1, x1 = x + w, y0 = y - 1, y1 = y + 5;
  const br = h.up ? BROLE.Y : h.no ? BROLE.X : h.by && !h.done ? h.by.col : BROLE.H;
  R_(g, x0, y0, w + 2, 7, h.done ? mixHex(h.by.col, '#1b1c1f', 0.55) : h.by ? '#262139' : '#120f1b');
  for (const [cx, cy, dx, dy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) { R_(g, cx, cy, 1, 1, br); R_(g, cx + dx, cy, 1, 1, br); R_(g, cx, cy + dy, 1, 1, br); }
  if (h.done) { bnGlyph(g, '✓', x + 2, y, mixHex(h.by.col, '#ffffff', 0.3)); return; }
  if (h.up) { bnGlyph(g, '⬉', x + 2, y, BROLE.Y); return; }
  if (h.no) { ptext(g, '!', x + 3, y, BROLE.X); return; }
  if (h.by) { const p = clamp((BAND.t - h.t0) / (h.t1 - h.t0), 0, 1); R_(g, x0 + 2, y1, w - 2, 1, '#3a3356'); R_(g, x0 + 2, y1, Math.round((w - 2) * p), 1, h.by.col); }
  ptext(g, h.label, x + 3, y, h.by ? h.by.col : BROLE.H);
}
function bnPlan(f) {
  const lv = bnLv(f), holes = [], H = kind => { const h = { hole: true, label: 'ABCDEFGHJKMNPQRSTUVWXYZ'[(BAND.holeN = (BAND.holeN || 0) + 1) % 23], kind }; holes.push(h); return h; };
  const subs = [
    () => ['SPAN', '∿', H('spin'), 'TO', H('spin')], () => ['TIE', '≡', { slider: ['N', String(bnInt(3, 8))] }], () => ['WELD', '▦', 'AT', H('weld')],
    () => ['LIFT', '▦', '×' + bnInt(2, 6), H('haul')], () => ['EACH', '◇', ['DRAPE', '⌣', H('tie')]], () => [{ check: ['BIRDS', bnChance(0.5)] }],
    () => ['VIA', lvCode(bnInt(2, 15))], () => ['TIE', H('tie')]
  ];
  for (let tries = 0; tries < 6; tries++) {
    holes.length = 0;
    const open = bnPick([['EACH', '∿', 'AT', lv], ['WHEN', '☼'], ['PLAN', lv], ['EACH', '⊥']]), a = bnPick(subs)(), b = bnPick(subs)();
    const tree = [open, '\n', a, ...(bnChance(0.5) ? ['\n'] : []), b, ...(bnChance(0.5) ? ['\n', bnPick(subs)()] : [])];
    if (!holes.length) tree.push('\n', ['SET', H('haul')]);
    const F = fRocks(tree, holes.slice());
    if (F.w <= BAND.W - 26) return F;   // room left to grow as holes fill
  }
  holes.length = 0; return fRocks([['PLAN', lv], '\n', ['TIE', H('tie')]], holes.slice());
}
// ---------- wire patches (after Max / Pd), drawn as the city's own cables with ties; signals run along them ----------
const BWIRE = ['#5fd3c4', '#9b87e8', '#a9cf56', '#e27a4e', '#e0a33a', '#b89a58', '#7fa0b8'];
function fPatch(seed, variant, force) {
  force = force || {};
  let lay = null;
  const build = W => {
    const r = mulberry32(seed), pk = a => a[Math.floor(r() * a.length)];
    const srcs = [['◇'], ['⊥', 'A'], ['☼'], ['⚡'], ['∿']], ops = [['≡', '×4'], ['⑂'], ['⌣'], ['⧗'], ['∵'], ['⍥', '3'], ['⇄']], sinks = [['▦'], [lvCode(4 + Math.floor(r() * 10))], ['⌂'], ['✶'], ['◍']];
    const rows = 2 + (r() < 0.5 ? 1 : 0), nodes = [];
    const bang = bnOn('W2') ? 3 : 0;   // room for the lamp that lights when a signal arrives
    const node = (lab, row) => { const w = lab.reduce((s, t) => s + bnTokW(t) + 1, -1) + 7 + bang; const n = { lab, w, row, bang: !!bang }; nodes.push(n); return n; };
    const L = [], M = [], Rt = [];
    for (let i = 0; i < rows; i++) L.push(node(pk(srcs), i));
    const nm = rows - (r() < 0.5 ? 1 : 0);
    for (let i = 0; i < nm; i++) M.push(node(pk(ops), i + (nm < rows ? 0.5 : 0)));
    Rt.push(node(pk(sinks), r() < 0.5 ? 0 : rows - 1));
    // the reply is the same patch with a change, marked in amber: a new operator and one more run
    const dm = variant ? M[Math.floor(r() * M.length)] : null;
    if (dm) { dm.lab = pk(ops); dm.w = dm.lab.reduce((s, t) => s + bnTokW(t) + 1, -1) + 7 + bang; dm.diff = true; }
    L.forEach(n => { n.x = 1; }); M.forEach(n => { n.x = Math.round(W / 2 - n.w / 2); }); Rt.forEach(n => { n.x = W - n.w - 1; });
    nodes.forEach(n => { n.y = Math.round(2 + n.row * 14); });
    const wires = [], hue = () => pk(BWIRE);
    const wire = (a, b, col) => { const x0 = a.x + a.w, y0 = a.y + 4, x1 = b.x - 1, y1 = b.y + 4; wires.push({ a, b, col, pts: bnDrape(x0, y0, x1, y1, 3 + r() * 6), ph: r() }); };
    for (const a of L) wire(a, pk(M), hue());
    for (const m of M) wire(m, pk(Rt), hue());
    if (r() < 0.6) wire(L[0], Rt[0], hue());   // one long run hanging under the rest
    if (dm) { wire(L[L.length - 1], Rt[0], hue()); wires[wires.length - 1].diff = true; }
    // a feedback ring (W4): from the sink back under everything to an operator
    if (force.ring || (bnOn('W4') && r() < 0.35)) { const a = Rt[0], b = M[0]; wires.push({ a, b, ring: true, col: '#9b87e8', pts: bnDrape(a.x + 2, a.y + 9, b.x + b.w - 3, b.y + 9, 9 + r() * 4), ph: r() }); }
    // an interlock (W5): one operator holds; a bird landing on what it feeds stops everything after it until it goes
    let bird = null;
    if (force.bird || (bnOn('W5') && r() < 0.3)) { const hold = M[0], out = wires.filter(w => w.a === hold); if (out.length) { hold.hold = true; for (const w of wires) if (w.a === hold || w.ring) w.gated = true; bird = { w: out[0], t0: 2 + r() * 3, t1: 0 }; bird.t1 = bird.t0 + 2.5 + r() * 2; } }
    // ties: where two wires pass close at the same column
    const ties = [];
    for (let i = 0; i < wires.length; i++) for (let j = i + 1; j < wires.length; j++) {
      const A = wires[i].pts, B = wires[j].pts, xa = Math.max(A[0][0], B[0][0]) + 3, xb = Math.min(A[A.length - 1][0], B[B.length - 1][0]) - 3;
      if (xb - xa < 4) continue;
      const tx = Math.round((xa + xb) / 2), ya = A.find(p => p[0] === tx), yb = B.find(p => p[0] === tx);
      if (ya && yb && Math.abs(ya[1] - yb[1]) <= 5 && !ties.some(t => Math.abs(t.x - tx) < 6)) ties.push({ x: tx, lo: Math.min(ya[1], yb[1]), hi: Math.max(ya[1], yb[1]) });
    }
    const H = Math.max(...nodes.map(n => n.y + 10), ...wires.map(w => Math.max(...w.pts.map(p => p[1])) + 3));
    return { W, H, nodes, wires, ties, bird };
  };
  return { kind: 'patch', live: true,
    units(rec) { if (!lay || lay.W !== rec.W - 14) lay = build(rec.W - 14); return lay.nodes.length + lay.wires.length + 1; },
    fit(rec) {
      if (!lay || lay.W !== rec.W - 14) lay = build(rec.W - 14);
      return { h: lay.H, draw: (g, x, y) => bnDrawPatch(g, x + 1, y, lay, rec) };
    } };
}
function bnDrawPatch(g, X, Y, P, rec) {
  const [k, fr] = bnK(rec), nn = P.nodes.length;
  P.wires.forEach((w, j) => {
    const u = nn + j; if (u > k) return;
    const pts = u < k ? w.pts : w.pts.slice(0, Math.round(w.pts.length * fr)), sh = w.diff ? '#e8a83c' : mixHex(w.col, '#000000', 0.5);
    for (const [px, py] of pts) R_(g, X + px, Y + py + 1, 1, 1, sh); for (const [px, py] of pts) R_(g, X + px, Y + py, 1, 1, w.col);
  });
  if (k < nn + P.wires.length) { P.nodes.forEach((n, i) => { if (i < k) bnPatchNode(g, X, Y, n); }); return; }
  // signals run along the wires (time since the patch was finished); a gated wire's clock stops while the bird sits
  const live = BAND.t < rec.liveTo, t = BAND.t - rec.t0 - (rec.rev ? rec.rev.end : 0), B = P.bird, held = !!B && t >= B.t0 && t < B.t1;
  const gt = B ? (t < B.t0 ? t : held ? B.t0 : t - (B.t1 - B.t0)) : t;
  for (const n of P.nodes) n.lit = false;
  if (live) for (const w of P.wires) {
    const n = w.pts.length, u = (((w.gated ? gt : t) * 0.55 + w.ph) % 1 + 1) % 1, i = Math.floor(u * n);
    for (let k = 0; k < 2; k++) { const p = w.pts[clamp(i - k, 0, n - 1)]; R_(g, X + p[0], Y + p[1], 1, 1, k ? mixHex(w.col, '#ffffff', 0.5) : '#fffbf2'); }
    if (u > 0.86 && w.b) w.b.lit = true;
  }
  for (const t of P.ties) { R_(g, X + t.x - 1, Y + t.lo - 1, 3, t.hi - t.lo + 3, '#0b0c0e'); R_(g, X + t.x, Y + t.lo - 1, 1, t.hi - t.lo + 3, '#eeeae0'); }
  for (const n of P.nodes) bnPatchNode(g, X, Y, n, held && n.hold);
  if (B && live && t > B.t0 - 0.6 && t < B.t1 + 0.6) {   // the bird: in, sitting, off
    const [mx, my] = B.w.pts[B.w.pts.length >> 1], c = '#f3f0e8';
    if (held) { const x = X + mx, y = Y + my; R_(g, x - 1, y - 3, 3, 2, c); R_(g, x + 1, y - 4, 2, 1, c); R_(g, x + 2, y - 4, 1, 1, '#2a2826'); R_(g, x - 2, y - 2, 1, 1, c); R_(g, x + 3, y - 3, 1, 1, '#e8a83c'); }
    else { const f = t < B.t0 ? (B.t0 - t) / 0.6 : (t - B.t1) / 0.6, x = Math.round(X + mx + (t < B.t0 ? f : -f) * 18), y = Math.round(Y + my - 3 - f * 10), up = Math.floor(BAND.t * 8) & 1;
      R_(g, x - 2, y - up, 1, 1, c); R_(g, x - 1, y - 1 + up, 1, 1, c); R_(g, x, y, 1, 1, c); R_(g, x + 1, y - 1 + up, 1, 1, c); R_(g, x + 2, y - up, 1, 1, c); }
  }
}
function bnPatchNode(g, X, Y, n, held) {
  const x = X + n.x, y = Y + n.y;
  const fr = n.diff ? '#e8a83c' : '#0b0c0e'; R_(g, x + 1, y, n.w - 2, 9, fr); R_(g, x, y + 1, n.w, 7, fr); R_(g, x + 1, y + 1, n.w - 2, 7, held ? '#3a1712' : '#1f2024'); R_(g, x + 1, y + 1, n.w - 2, 1, '#34363b');
  if (n.bang) R_(g, x + n.w - 4, y + 2, 2, 2, held ? '#e2573f' : n.lit ? '#e8a83c' : '#34363b');
  R_(g, x - 1, y + 3, 2, 3, '#6d685f'); R_(g, x + n.w - 1, y + 3, 2, 3, '#6d685f');
  let xx = x + 4; for (const t of n.lab) xx += bnTok(g, t, xx, y + 2) + 1;
}
// ---------- drone routes (after Befunge / Orca): motes walk the arrows as instruction pointers ----------
function fRoute(seed) {
  let lay = null;
  const build = W => {
    const r = mulberry32(seed), cols = clamp(Math.floor((W - 1) / 7), 8, 18), rows = 4 + (r() < 0.5 ? 1 : 0);
    const grid = Array.from({ length: rows }, () => Array(cols).fill('.'));
    let x = 0, y = Math.floor(r() * rows); const path = [[x, y]];
    while (x < cols - 1) { const d = r(); let nx = x, ny = y; if (d < 0.62) nx++; else if (d < 0.81 && y > 0) ny--; else if (y < rows - 1) ny++; else nx++; if (path.some(p => p[0] === nx && p[1] === ny)) { nx = x + 1; ny = y; } x = nx; y = ny; path.push([x, y]); }
    for (let i = 0; i < path.length - 1; i++) { const [ax, ay] = path[i], [bx, by] = path[i + 1]; grid[ay][ax] = bx > ax ? '→' : by < ay ? '↑' : '↓'; }
    const [sx, sy] = path[0], [ex, ey] = path[path.length - 1]; grid[sy][sx] = '◇'; grid[ey][ex] = ['✶', '⊔', '⌂', '▦'][Math.floor(r() * 4)];
    for (let k = 0; k < 4; k++) { const qx = Math.floor(r() * cols), qy = Math.floor(r() * rows); if (grid[qy][qx] === '.') grid[qy][qx] = ['ᵕ', '←', '↓', '⌁'][Math.floor(r() * 4)]; }
    return { cols, rows, grid, path, W: cols * 7 + 1, H: rows * 7 + 1, ips: 1 + Math.floor(r() * 2) };
  };
  return { kind: 'route', live: true, units(rec) { if (!lay) lay = build(rec.W - 14); return lay.rows; },
    fit(rec) { if (!lay) lay = build(rec.W - 14); return { h: lay.H + 1, draw: (g, x, y) => bnDrawRoute(g, x, y - 1, lay, rec) }; } };
}
function bnDrawRoute(g, X, Y, P, rec) {
  R_(g, X, Y, P.W, P.H, '#101113'); R_(g, X, Y, P.W, 1, '#1d1e21'); bnChamfer(g, X, Y, P.W, P.H, 2, '#101113');
  const [kr, fr] = bnK(rec), whole = kr >= P.rows, re = rec.rev ? rec.rev.end : 0;
  const n = P.path.length, step = Math.floor((BAND.t - rec.t0 - re) * 3.2), live = whole && BAND.t < rec.liveTo, ip = new Map();
  if (live) for (let k = 0; k < P.ips; k++) { const i = (step - k * 5) % (n + 4); if (i >= 0 && i < n) ip.set(P.path[i].join(','), k); }
  P.grid.forEach((row, r) => row.forEach((ch, q) => {
    if (r > kr || (r === kr && q >= Math.round(P.cols * fr))) return;
    const x = X + q * 7 + 1, y = Y + r * 7 + 1, k = ip.get(q + ',' + r);
    if (k != null) { R_(g, x - 1, y - 1, 7, 7, k ? '#a9b6bf' : '#e8a83c'); if (ch !== '.') bnGlyph(g, ch, x, y, '#1b1305'); return; }
    if (ch === '.') { R_(g, x + 2, y + 2, 1, 1, '#34363a'); return; }
    if (ch === '◇' || ch === '✶' || ch === '⊔' || ch === '⌂' || ch === '▦') { R_(g, x - 1, y - 1, 7, 7, ch === '◇' ? '#cfc8b6' : '#7d9a3c'); bnGlyph(g, ch, x, y, '#16171a'); return; }
    bnGlyph(g, ch, x, y, ch === 'ᵕ' || ch === '⌁' ? '#5a5650' : null);
  }));
}
// ---------- the Builder: huge slow glyphs, carved, one arriving at a time ----------
function fDeep(toks) {
  return { kind: 'deep', live: true,
    fit(rec) {
      const per = Math.max(1, Math.floor((rec.W - 2) / 20)), rows = Math.ceil(toks.length / per);
      return { full: true, h: rows * 20, draw: (g, x, y) => {
        toks.forEach((tk, i) => {
          // each glyph is welded on row by row; the newest row still glows, and throws the odd spark
          const f = clamp((BAND.t - rec.t0 - i * 0.8) / 0.8, 0, 1), rws = f * 5, full = bnOn('L10') ? Math.floor(rws) : f > 0 ? 5 : 0;
          const gx = x + 1 + (i % per) * 20, gy = y + Math.floor(i / per) * 20, d = BNG[tk];
          for (let r = 0; r < 5; r++) for (let q = 0; q < 5; q++) {
            if (d[r + 2][q] === '.') continue;
            const px = gx + q * 3, py = gy + r * 3;
            if (r < full) { R_(g, px, py, 3, 3, '#a08a5c'); R_(g, px, py, 3, 1, '#d8c08a'); R_(g, px + 2, py + 1, 1, 2, '#5e4f33'); }
            else if (r === full && q < (rws - full) * 5) { R_(g, px, py, 3, 3, '#ffd27a'); R_(g, px, py + 2, 3, 1, '#e8a83c'); if (Math.floor(BAND.t * 14 + q) % 3 === 0) R_(g, px + 1, py - 2, 1, 1, '#fffbf2'); }
          }
        });
      } };
    } };
}
// ---------- live windows into the world (after Transport Tycoon's follow windows) ----------
// half: half the width and shorter, with the poster's remark beside it (V2). Dead windows shade to their title bar (V3)
function fWin(tg, say) {
  return { kind: 'win', tg, say: say || null, live: true, units: () => 1, vh: say ? 40 : 58, off: null, og: null, stale: false, last: null, rendered: false,
    fit(rec) { const sh = this.stale && !this.unshade && bnOn('V3') && BAND.t - this.staleT > 4; return { full: true, h: sh ? 8 : 8 + this.vh + 8, draw: (g, _x, y) => bnDrawWin(g, rec, this, y, sh) }; } };
}
function bnTarget(tg) {
  if (tg.bot) return tg.bot.body ? tg.bot.body.p : null;
  if (tg.drone) { if (DRONES.includes(tg.drone)) tg.at = tg.drone.pos.slice(); return tg.at || tg.drone.to; }
  if (tg.pod) { if (!PODS.includes(tg.pod)) return null; const p = podPos(tg.pod); return [p[0], p[1], p[2]]; }
  if (tg.bird) return BIRDS.list.includes(tg.bird) ? tg.bird.p : null;
  return tg.at || null;
}
// draw the city around a point into a small canvas: the levels up to the point's own, then life, wires, birds, bots, drones
function bnWinRender(F, w, h) {
  const p = bnTarget(F.tg);
  if (!p) { F.stale = true; return; }
  F.last = p.slice();
  const g = F.og, sky = SKYCOL[LIT.on && LIT.sun === 'evening' ? 'dusk' : S.tod];
  for (let y = 0; y < h; y++) { g.fillStyle = sky[Math.min(sky.length - 1, Math.floor(y / h * sky.length))]; g.fillRect(0, y, w, 1); }
  if (F.tg.deep) { bnStatic(g, w, h); return; }
  const zc = clamp(Math.floor(p[2] + 0.3), 0, NL - 1), sv = [S.bw, S.bh, S.cam.x, S.cam.y, S.level, S.mode, S.explode, WDT.on];
  try {
    S.bw = w; S.bh = h; S.explode = 0; S.level = zc; S.mode = 'cut'; WDT.on = false;
    const r = toRotF(p[0], p[1]); S.cam.x = (r[0] - r[1]) * 8; S.cam.y = (r[0] + r[1]) * 4 - p[2] * LH;
    const b = isoBase(), bx0 = b[0] - OX, by0 = b[1] - OY;
    for (let z = 0; z <= zc; z++) {
      const L = LC[z]; if (!L || !L.c) continue;
      const oy = by0 - z * LH;
      g.drawImage(L.c, bx0, oy); drawDyn(g, z, bx0, oy, S.time, false); drawLifeLevel(g, z, S.time); bnWiresLite(g, z, zc + HT / LH);
    }
    drawBirds(g); drawBots(g, true); drawDronesIso(g, S.time, false);
  } finally { [S.bw, S.bh, S.cam.x, S.cam.y, S.level, S.mode, S.explode, WDT.on] = sv; }
}
// the cables as a camera sees them at this size: a lit line and its shadow through the particles, posts, girders, ties
// (the full bundle renderer costs ~7 ms a window; this ~0.3)
function bnWiresLite(g, z, cutTop) {
  const P = (x, y, h) => { const q = projIso(x, y, h); return [Math.round(q[0]), Math.round(q[1])]; };
  for (const p of WIRES.posts) if (Math.floor(p.z0) === z) { const a = P(p.x + 0.5, p.y + 0.5, p.z0), b = P(p.x + 0.5, p.y + 0.5, Math.min(p.z1, cutTop)); bnLine(g, a[0], a[1], b[0], b[1], '#6a7076'); bnLine(g, a[0] + 1, a[1], b[0] + 1, b[1], '#9aa2a8'); }
  for (const gd of WIRES.girders) if (Math.floor((gd.a[2] + gd.b[2]) / 2) === z) { const a = P(...gd.a), b = P(...gd.b); bnLine(g, a[0], a[1] + 1, b[0], b[1] + 1, '#5c646b'); bnLine(g, a[0], a[1], b[0], b[1], '#a9b6bf'); }
  for (const c of WIRES.cables) {
    const m = c.n >> 1; if (Math.floor(c.X[m * 3 + 2]) !== z) continue;
    const col = cableHex(c), dk = mixHex(col, '#000000', 0.5); let pv = null;
    for (let i = 0; i < c.n; i++) {
      if (c.X[i * 3 + 2] > cutTop) { pv = null; continue; }
      const q = P(c.X[i * 3], c.X[i * 3 + 1], c.X[i * 3 + 2]);
      if (pv) { bnLine(g, pv[0], pv[1] + 1, q[0], q[1] + 1, dk); bnLine(g, pv[0], pv[1], q[0], q[1], col); }
      pv = q;
    }
  }
  for (const t of WIRES.ties) { const c = tieCenter(t); if (Math.floor(c[2]) !== z || c[2] > cutTop) continue; const q = P(...c); R_(g, q[0], q[1] - 1, 1, 3, '#eeeae0'); }
}
// nothing down there answers a camera: static, and something large passing
function bnStatic(g, w, h, plain) {
  const t = BAND.t, ox = Math.round(((t * 9) % (w + 90)) - 60), img = g.createImageData(w, h), d = img.data, f = Math.floor(t * 12);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = (hash3(x, y, f) & 63) + 18, i = (y * w + x) * 4; d[i] = v; d[i + 1] = v - 4; d[i + 2] = v - 8; d[i + 3] = 255; }
  g.putImageData(img, 0, 0);
  if (plain) return;
  g.fillStyle = '#0d0b09'; g.fillRect(ox, 6, 70, h); g.fillRect(ox + 6, 2, 58, 4);
  g.fillStyle = '#e2573f'; g.fillRect(ox + 18, 20, 30, 1);
  if ((Math.floor(t * 3) & 3) === 0) { g.fillStyle = '#ff8a6a'; g.fillRect(ox + 26, 20, 8, 1); }
}
function bnDrawWin(g, rec, F, Y, shaded) {
  const W = F.say ? (rec.W >> 1) + 1 : rec.W, vw = W - 2, vh = F.vh; F.ww = W;
  if (shaded) {   // just the title bar: who it was, when it went dark; click to open it where it is
    R_(g, 0, Y, W, 8, '#0b0c0e'); R_(g, 1, Y + 1, W - 2, 6, '#2a2b30'); R_(g, 1, Y + 1, W - 2, 1, '#3c3f45');
    const tl = F.tg.label || '?'; ptext(g, tl, 3, Y + 2, F.tg.col || '#e6dfcf');
    const lt = 'LAST ' + fmtTime(rec.staleAt || S.time); ptext(g, lt, W - 10 - ptextW(lt), Y + 2, '#5a554d');
    R_(g, W - 8, Y + 1, 7, 6, '#44474c'); bnSprite(g, ['#####', '.###.', '..#..'], W - 7, Y + 2, { '#': '#c9c2b2' });
    bnChamfer(g, 0, Y, W, 8, 2, '#0b0c0e'); return;
  }
  if (!F.off || F.off.width !== vw) { F.off = mk(vw, vh); F.og = F.off.getContext('2d'); F.og.imageSmoothingEnabled = false; F.rendered = false; }
  const tuning = bnK(rec)[0] < 1;
  if (tuning) bnStatic(F.og, vw, vh, true);
  else if (!F.stale && (rec.renderNow || !F.rendered)) { bnWinRender(F, vw, vh); F.rendered = true; }
  const by = rec.bot, tl = F.tg.label || '?';
  R_(g, 0, Y, W, 8 + vh + 8, '#0b0c0e');
  R_(g, 1, Y + 1, W - 2, 6, '#2a2b30'); R_(g, 1, Y + 1, W - 2, 1, '#3c3f45');
  ptext(g, tl, 3, Y + 2, F.tg.col || '#e6dfcf');
  if (F.last) ptext(g, lvCode(clamp(Math.floor(F.last[2] + 0.3), 0, NL - 1)), 3 + ptextW(tl) + 4, Y + 2, '#77705f');
  R_(g, W - 8, Y + 1, 7, 6, '#44474c'); if (F.stale && bnOn('V3')) bnSprite(g, ['..#..', '.###.', '#####'], W - 7, Y + 2, { '#': '#c9c2b2' }); else ptext(g, '×', W - 6, Y + 2, '#c9c2b2');
  g.drawImage(F.off, 1, Y + 8);
  const cx = 1 + (vw >> 1), cy = Y + 8 + (vh >> 1);
  if (F.stale) {
    g.fillStyle = 'rgba(11,12,14,0.55)'; g.fillRect(1, Y + 8, vw, vh);
    for (let y = Y + 8; y < Y + 8 + vh; y += 2) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(1, y, vw, 1); }
    const s = 'SIGNAL LOST'; R_(g, cx - (ptextW(s) >> 1) - 2, cy - 4, ptextW(s) + 4, 7, '#0b0c0e'); ptext(g, s, cx - (ptextW(s) >> 1), cy - 3, '#a39c8e');
  } else if (tuning) {
    const s = 'TUNING'; R_(g, cx - (ptextW(s) >> 1) - 2, cy - 4, ptextW(s) + 4, 7, '#0b0c0e'); ptext(g, s, cx - (ptextW(s) >> 1), cy - 3, '#a39c8e');
  } else if (!F.tg.deep) {
    // the poster's reticle and its remark, drawn over the picture
    const c = by.col, k = 6;
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const ex = cx + sx * k, ey = cy - 1 + sy * k; R_(g, sx < 0 ? ex : ex - 2, ey, 3, 1, c); R_(g, ex, sy < 0 ? ey : ey - 2, 1, 3, c); }
    if (F.note) { const nx = cx + 9, ny = cy - 16; R_(g, nx, ny, 9, 9, '#0b0c0e'); R_(g, nx + 1, ny + 1, 7, 7, '#1d1e21'); bnGlyph(g, F.note, nx + 2, ny + 2, c); R_(g, nx, ny + 9, 1, 2, '#0b0c0e'); }
  }
  const sy = Y + 8 + vh;
  R_(g, 1, sy, W - 2, 7, '#16171a');
  if (F.last) ptext(g, `(${Math.round(F.last[0])},${Math.round(F.last[1])})`, 3, sy + 1, '#77705f');
  if (F.stale) ptext(g, 'LAST ' + fmtTime(rec.staleAt || S.time), W - 3 - ptextW('LAST 00:00'), sy + 1, '#5a554d');
  else { const on = (Math.floor(BAND.t * 2) & 1) === 0; R_(g, W - 28, sy + 2, 3, 3, on ? '#e2573f' : '#5a2a22'); ptext(g, 'LIVE', W - 3 - ptextW('LIVE'), sy + 1, '#a39c8e'); }
  bnChamfer(g, 0, Y, W, 8 + vh + 8, 3, '#0b0c0e');
  if (F.say) {   // drawn on a CPU canvas of its own so a light tone can re-ink it
    const L = bnLay(F.say, rec.W - W - 5, false);
    if (!F.sc || F.sc.width !== L.w + 1) { F.sc = mk(L.w + 1, L.h + 1); F.sg = F.sc.getContext('2d', { willReadFrequently: true }); }
    F.sg.clearRect(0, 0, F.sc.width, F.sc.height); bnDrawLay(F.sg, L, 0, 0, null, null);
    if (bnLight()) bnInkCtx(F.sg, F.sc.width, F.sc.height, []);
    g.drawImage(F.sc, W + 4, Y + 10);
  }
}
// cut corners: k pixels off each, edged with a 1px diagonal in the frame's colour
function bnChamfer(g, x, y, w, h, k, edge) {
  for (let i = 0; i < k; i++) for (let j = 0; j < k - i; j++) { g.clearRect(x + i, y + j, 1, 1); g.clearRect(x + w - 1 - i, y + j, 1, 1); g.clearRect(x + i, y + h - 1 - j, 1, 1); g.clearRect(x + w - 1 - i, y + h - 1 - j, 1, 1); }
  for (let i = 0; i <= k; i++) { const j = k - i; R_(g, x + i, y + j, 1, 1, edge); R_(g, x + w - 1 - i, y + j, 1, 1, edge); R_(g, x + i, y + h - 1 - j, 1, 1, edge); R_(g, x + w - 1 - i, y + h - 1 - j, 1, 1, edge); }
}
// ---------- residents: plain words, in the interface type ----------
function fFolk(text) { return { kind: 'folk', text }; }

// ---------- posting into the feed ----------
function bnW() { const el = $('feed'); const w = el && el.clientWidth ? Math.floor((el.clientWidth - 20) / 2) : 0; if (w > 60) BAND.W = Math.min(w, 200); return BAND.W; }
// the header: a 7x7 face, the name (a right-aligned column with a rule after it, a plate, or inline: the panel's Names), whom it's to
function bnHead(g, rec, ink) {
  const b = rec.bot, st = BAND.cfg.names, C = ink || (c => c); let x;
  if (g) bnSprite(g, b.mini, 0, 0, b.pal);
  if (st === 'col') { if (g) ptext(g, b.name, Math.max(8, 8 + BNAMEW - ptextW(b.name)), 1, C(b.col)); x = 8 + BNAMEW + 5; }
  else if (st === 'plate') { const w = ptextW(b.name) + 4; if (g) { R_(g, 9, 0, w, 7, C(mixHex(b.col, '#141517', 0.78))); ptext(g, b.name, 11, 1, C(b.col)); } x = 9 + w + 3; }
  else { if (g) ptext(g, b.name, 9, 1, C(b.col)); x = 9 + ptextW(b.name) + 4; }
  if (rec.to) {
    const ar = C('#5a554d'); if (g) { R_(g, x, 3, 4, 1, ar); R_(g, x + 2, 2, 1, 1, ar); R_(g, x + 2, 4, 1, 1, ar); }
    x += 6; if (g) ptext(g, rec.to.name, x, 1, C(mixHex(rec.to.col, '#3a3833', 0.45))); x += ptextW(rec.to.name) + 4;
  }
  return x;
}
function bnPaint(rec) {
  if (rec.form.kind === 'folk') return;
  const hx = bnHead(null, rec), fit = rec.form.fit(rec, hx), W = rec.W, cv = rec.cv, g = rec.g;
  let cx, cy, H;
  if (fit.inline) { cx = hx; cy = 1; H = Math.max(BROW, fit.h + 2); } else { cx = fit.full ? 0 : 9; cy = BROW + 2; H = cy + fit.h + 1; }
  const fy = H; if (rec.open) H += 8;
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; cv.style.width = W * 2 + 'px'; cv.style.height = H * 2 + 'px'; g.imageSmoothingEnabled = false; }
  else g.clearRect(0, 0, W, H);
  // light tones re-ink each line after it's drawn; a window (on the GPU, as it draws the world in) has its header drawn pre-inked
  const lt = bnLight(), pre = lt && fit.full ? bnFlipHex : null;
  bnHead(g, rec, pre);
  if (BAND.cfg.names === 'col') R_(g, 8 + BNAMEW + 2, 0, 1, fit.inline ? H : BROW, pre ? pre('#33312c') : '#33312c');
  if (!fit.inline && !fit.full) R_(g, 3, BROW + 1, 1, H - BROW - 2, mixHex(rec.bot.col, '#141517', 0.72));   // a rule from the face down the message
  BAND.anim = rec.animTo > BAND.t; fit.draw(g, cx, cy); BAND.anim = false;
  if (rec.open) bnFoot(g, rec, fit.full ? 1 : cx, fy + 1, pre);
  if (lt && !pre) bnInk(rec, [[0, 0, 7, 7]]);
  rec.paintedAt = BAND.t;
}
// an opened line says when, who (in words), to whom, and which thread
const BKINDW = { tie: 'tie-bot', spin: 'spinner', weld: 'welder', haul: 'hauler', mote: 'mote', eye: 'eye', fore: 'foreman', proc: 'process', deep: '?' };
function bnFoot(g, rec, x, y, ink) {
  const parts = [fmtTime(rec.at), (BKINDW[rec.bot.k] || rec.bot.k).toUpperCase(), '#' + rec.th, ...(rec.to ? ['>' + rec.to.name] : [])];
  while (parts.length > 1 && ptextW(parts.join('  ')) > rec.W - x - 1) parts.pop();
  ptext(g, parts.join('  '), x, y, ink ? ink('#77705f') : '#77705f');
}
// light themes: the band is drawn for a dark ground, so each painted line is re-inked after: lightness
// flipped, hue kept (OKLab), one colour at a time from a cache. Faces and windows keep their own.
const bnLight = () => { const m = document.body.dataset.mt; return m === '11' || m === '15'; };
const BINK = new Map();
function bnFlip(r, g, b) {
  const lin = c => (c /= 255) <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4), R = lin(r), G = lin(g), B = lin(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B), m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B), q = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  const L = 1.086 - 0.92 * (0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * q), A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * q, Bb = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * q;
  const l2 = (L + 0.3963377774 * A + 0.2158037573 * Bb) ** 3, m2 = (L - 0.1055613458 * A - 0.0638541728 * Bb) ** 3, q2 = (L - 0.0894841775 * A - 1.2914855480 * Bb) ** 3;
  const enc = c => Math.round(255 * clamp(c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055, 0, 1));
  return enc(4.0767416621 * l2 - 3.3077115913 * m2 + 0.2309699292 * q2) << 16 | enc(-1.2684380046 * l2 + 2.6097574011 * m2 - 0.3413193965 * q2) << 8 | enc(-0.0041960863 * l2 - 0.7034186147 * m2 + 1.7076147010 * q2);
}
const bnFlipHex = hex => { const c = rgbOf(hex), k = c[0] << 16 | c[1] << 8 | c[2]; let v = BINK.get(k); if (v === undefined) { v = bnFlip(c[0], c[1], c[2]); BINK.set(k, v); } return '#' + v.toString(16).padStart(6, '0'); };
function bnInk(rec, keep) { bnInkCtx(rec.g, rec.cv.width, rec.cv.height, keep); }
function bnInkCtx(g, w, h, keep) {
  const img = g.getImageData(0, 0, w, h), d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4; if (!d[i + 3]) continue;
    if (keep.some(k => x >= k[0] && y >= k[1] && x < k[0] + k[2] && y < k[1] + k[3])) continue;
    const key = d[i] << 16 | d[i + 1] << 8 | d[i + 2]; let v = BINK.get(key);
    if (v === undefined) { v = bnFlip(d[i], d[i + 1], d[i + 2]); BINK.set(key, v); }
    d[i] = v >> 16; d[i + 1] = v >> 8 & 255; d[i + 2] = v & 255;
  }
  g.putImageData(img, 0, 0);
}
const bnLeaks = rec => rec.sal >= 0.8 || rec.u < BAND.cfg.leak;
// a line: its record, its row and canvas, how it's typed out and how long it stays live; sample: for the catalog (not the feed)
function bnMakeRec(v, th, sample) {
  const f = v.form;
  const rec = { bot: v.by, to: v.to || null, form: f, th: th.id, t0: BAND.t, at: S.time, open: false, W: bnW(), gloss: BAND.cfg.gloss === 'on', run: v.run || null, sal: v.sal || 0, u: th.u, liveTo: 0, paintedAt: -9 };
  const li = document.createElement('li'); li.className = 'bd k-' + f.kind; li.dataset.th = th.id; rec.li = li; li._bn = rec;
  if (!bnLeaks(rec)) li.classList.add('bq');
  if (BAND.focus === th.id) li.classList.add('th-on');
  if (f.kind === 'folk') {
    const [c, g] = (() => { const c = mk(9, 9); c.className = 'px'; c.style.width = c.style.height = '18px'; return [c, c.getContext('2d')]; })();
    bnSprite(g, BNAV.folk, 0, 0, v.by.pal); li.appendChild(c);
    const s = document.createElement('span'), [nm, lv] = v.by.name.split('·'); s.innerHTML = `<b>${nm.toLowerCase()}</b><i>${lv}</i><time>${fmtTime(S.time)}</time> `; s.appendChild(document.createTextNode(f.text)); li.appendChild(s);
  } else {
    rec.cv = mk(1, 1); rec.cv.className = 'px'; rec.g = rec.cv.getContext('2d', f.kind === 'win' ? {} : { willReadFrequently: true }); li.appendChild(rec.cv);   // windows draw the world in: they stay on the GPU
    if (v.by.body) { const w = document.createElement('button'); w.type = 'button'; w.className = 'bdw'; w.dataset.tip = 'Watch ' + v.by.name; w.setAttribute('aria-label', 'Watch ' + v.by.name); li.appendChild(w); }
  }
  const nu = f.units ? f.units(rec) : 0;
  if (nu && BAND.cfg.typing) rec.rev = bnRev(v.by, nu, f.kind);
  const re = rec.rev ? rec.rev.end : 0;
  if (f.kind === 'win') {
    // one window per slot: the oldest live one loses its signal
    const wins = BAND.live.filter(r => r.form.kind === 'win' && !r.form.stale);
    while (!sample && wins.length >= Math.max(1, BAND.cfg.wins)) bnStale(wins.shift());
    rec.liveTo = BAND.t + re + 45; rec.fps = 9;
  } else if (rec.run) { rec.run.t0 = Math.max(rec.run.t0, BAND.t + re + 0.4); rec.liveTo = rec.run.t0 + rec.run.per * (f.n + 2); rec.fps = 6; }
  else if (f.kind === 'patch') { rec.liveTo = BAND.t + re + 14; rec.fps = 8; }
  else if (f.kind === 'route') { rec.liveTo = BAND.t + re + 16; rec.fps = 6; }
  else if (f.kind === 'deep') { rec.liveTo = BAND.t + f.n * 0.8 + 1; rec.fps = 8; }
  else if (f.liveFor) { rec.liveTo = BAND.t + re + f.liveFor; rec.fps = 10; }
  if (re) { rec.liveTo = Math.max(rec.liveTo, BAND.t + re + 0.05); rec.fps = rec.fps || 4; }
  if (bnOn('L4') && f.anim && f.anim()) { rec.animTo = BAND.t + re + 6 + bnR() * 6; rec.liveTo = Math.max(rec.liveTo, rec.animTo); rec.fps = Math.max(rec.fps || 0, 8); }
  if (v.gloss) rec.gloss = true;
  bnPaint(rec);
  return rec;
}
function bnPost(v, th) {
  const el = $('feed'); if (!el) return null;
  const rec = bnMakeRec(v, th), li = rec.li;
  el.appendChild(li);
  BAND.recs.push(rec);
  if (rec.liveTo) BAND.live.push(rec);
  v.by.spokeAt = S.time;
  if (!BAND.warm) bnPulse(v.by);
  bnPrune();
  BAND.emitted = (BAND.emitted || 0) + 1;
  return rec;
}
function bnStale(rec) {
  const first = rec.form.kind === 'win' && !rec.form.stale;
  if (first) { rec.form.stale = true; rec.form.staleT = BAND.t; rec.staleAt = S.time; }
  rec.liveTo = 0; BAND.live = BAND.live.filter(r => r !== rec); bnPaint(rec);
  if (first && bnOn('V3')) bnLiveUntil(rec, BAND.t + 4.3, 1);   // once more, later, to shade it
}
function bnRepaint(rec) { if (rec && rec.li.isConnected) bnPaint(rec); }
function bnLiveUntil(rec, t, fps) { if (!rec) return; rec.liveTo = Math.max(rec.liveTo, t); rec.fps = fps; if (!BAND.live.includes(rec)) BAND.live.push(rec); }
function bnHeld() { return BAND.hover || !BAND.pin; }
function bnPrune() {
  if (bnHeld() && BAND.recs.length < 400) return;
  while (BAND.recs.length > 150) { const r = BAND.recs.shift(); r.li.remove(); BAND.live = BAND.live.filter(q => q !== r); if (BAND.open === r) { BAND.open = null; bnFocus(null); } }
}

// ---------- threads: generators that yield turns ({by, to, form, sal} or a bare {wait}) ----------
function bnSpawn(gen, force, arg) { const th = { id: ++BAND.thN, it: null, at: BAND.t, u: bnR(), force: !!force, last: null }; th.it = gen(th, arg); BAND.threads.push(th); return th; }
function bnGap() { return (0.6 + bnR() * 1.4) * clamp(1.5 / Math.sqrt(bandRate()), 0.25, 5); }
function bnStep(th) {
  const r = th.it.next(th.last);
  if (r.done) return 0;
  const v = r.value;
  if (v.form) th.last = bnPost(v, th);
  const re = v.form && th.last && th.last.rev ? th.last.rev.end : 0;   // replies wait for the line to be typed
  th.at = BAND.t + re + (v.wait != null ? v.wait : bnGap() * (re ? 0.6 : 1));
  return v.form ? 1 : 2;
}
function* bnThChat(th) {
  // no two live chats on the same topic from the same speaker
  let a, pool, i, n = 0;
  do { a = bnTalker(); pool = bnOn('X7') && bnChance(BAND.cfg.mix.offtask) ? BOFF : BWORK; i = Math.floor(bnR() * pool.length); th.sig = a.id + (pool === BOFF ? 'o' : 'w') + i; } while (n++ < 4 && BAND.threads.some(q => q !== th && q.sig === th.sig));
  const b = bnFriend(a), turns = pool[i](a, b);
  for (const [sp, toks, to] of turns) {
    const w = bnIdio(sp, toks, true);
    yield { by: sp, to, form: (w.length > 1 && bnChance(BAND.cfg.mix.struct * 0.4) && bnStructured(sp, w)) || fPid(bnVoice(sp, w), null, false, (sp.k === 'haul' || sp.k === 'fore') && bnOn('L6') && bnChance(0.18)) };
  }
}
function* bnThPlan() {
  const f = bnOf('fore'), F = bnPlan(f), plan = yield { by: f, form: F, sal: 0.5 };
  let up = false;
  for (const h of F.holes) {
    if (!up && bnOn('H4') && bnChance(0.14)) {   // nobody here can fill it (red, H4); then the hole climbs to the player
      up = true; const w = bnOf({ spin: 'spin', weld: 'weld', haul: 'haul', tie: 'tie' }[h.kind] || 'tie');
      h.no = true; bnRepaint(plan);
      yield { by: w, to: f, form: fPid(bnIdio(w, ['▢', h.label, '✗', '∅'])) };
      h.no = false; h.up = true; bnRepaint(plan);
      yield { by: f, form: bnOn('H5') && bnChance(0.6) ? fLadder([w, f], h) : fPid(['▢', h.label, '⇢', '⬉', '?']), sal: 0.9 }; continue;
    }
    const w = bnOf({ spin: 'spin', weld: 'weld', haul: 'haul', tie: 'tie' }[h.kind] || 'tie');
    h.by = w; h.t0 = BAND.t; h.t1 = BAND.t + 3 + bnR() * 9; bnLiveUntil(plan, h.t1 + 0.3, 4); bnRepaint(plan);
    yield { by: w, to: f, form: fPid(bnIdio(w, ['@', '⊓', '▢', h.label])) };
  }
  for (const h of F.holes.filter(q => q.by).sort((p, q) => p.t1 - q.t1)) {
    if (h.t1 > BAND.t) yield { wait: h.t1 - BAND.t };
    h.done = true;
    const G = bnOn('H3') && plan.li.isConnected && bnRegrow(plan.form, h);
    if (G) { plan.form = G; bnLiveUntil(plan, BAND.t + 3.6, 6); }
    bnRepaint(plan);
    yield { by: h.by, to: f, form: fPid(bnIdio(h.by, ['✓', '▢', h.label])) };
  }
  yield { by: f, form: fPid(up ? ['⧗', '⬉'] : bnPick([['✓', '✓'], ['∴', '✓'], ['♥', '✓']])) };
}
function* bnThRoutine() {
  const b = bnTalker(), F = bnBlocksFor(b), per = clamp(1.4 / Math.sqrt(bandRate()), 0.3, 1.4), fail = bnChance(0.16) ? bnInt(1, F.n - 2) : -1;
  yield { by: b, form: F, run: { t0: BAND.t + 0.8, per, fail } };
  yield { wait: 0.8 + per * (fail >= 0 ? fail + 1.5 : F.n) + 0.3 };
  if (fail >= 0) { yield { by: b, form: fPid(bnIdio(b, ['✗', '↻', '?'])) }; yield { by: bnFriend(b), to: b, form: fPid(bnPick([['⧗', '@', '→'], ['✶', '?'], ['♥', '↻'], ['◌']])) }; }
  else if (bnChance(0.5)) yield { by: bnFriend(b), to: b, form: fPid(bnPick([['♥'], ['✓'], [':', '✓'], ['≡', '♥']])) };
}
function* bnThPatch() {
  const a = bnTalker(), b = bnFriend(a), seed = bnInt(1, 1e6);
  yield { by: a, to: b, form: fPatch(seed, 0) };
  yield { by: b, to: a, form: bnOn('W3') && bnChance(0.5) ? fPatch(seed, 1) : fPid(bnPick([['⇄', '✓'], ['⌣', '✗'], ['⑂', '?']])) };
  if (bnChance(0.6)) yield { by: a, form: fPid(bnPick([['♥'], ['✓', '≡'], ['⑂', '✓'], ['✗', '⌣', '↻']])) };
}
function* bnThRoute() {
  const e = bnChance(0.6) ? bnOf('eye') : bnOf('mote'), m = bnOf('mote');
  yield { by: e, form: fRoute(bnInt(1, 1e6)) };
  yield { by: m, to: e, form: fPid(bnIdio(m, bnPick([['✓'], ['→', '→', '✓'], ['↻']]))) };
  if (bnChance(0.4)) yield { by: bnOf('mote'), to: e, form: fPid(bnPick([['ᵕ', '?'], ['✓'], [':', '✓']])) };
}
// who or what a window can follow
function bnPickTarget() {
  const c = [];
  for (const b of BAND.crew) if (b.body) c.push([{ bot: b, label: b.name, col: b.col }, 3]);
  for (const d of DRONES) c.push([{ drone: d, label: 'DRONE', col: '#ff7a52' }, 4]);
  for (const p of PODS) if (bnChance(0.08)) c.push([{ pod: p, label: 'POD', col: '#d8b36a' }, 1]);
  for (const b of BIRDS.list) c.push([{ bird: b, label: 'BIRD', col: '#f3f0e8' }, 1]);
  for (const w of WORLD.wells || []) c.push([{ at: [w.x + 1, w.y + 1, 3], label: 'WELL', col: '#e8d9a8' }, 0.4]);
  return c.length ? bnWeighted(c) : null;
}
function* bnThWindow(th, tg) {
  tg = tg || bnPickTarget(); if (!tg) return;
  const poster = tg.bot && bnChance(0.4) ? bnFriend(tg.bot) : bnOf('eye'), half = bnOn('V2') && bnChance(0.4);
  const F = fWin(tg, half ? bnIdio(poster, bnPick([['◎', '♥'], ['ᵕ', '◎', '?'], ['@', '◎', '→', '⧗'], ['☼', '◎', '☺'], ['◎', '≡', '✓'], ['⧗', '◎', '⧗']])) : null);
  F.note = tg.bird ? 'ᵕ' : tg.drone ? '▦' : tg.bot ? bnPick(['◎', '♥', '?', '☺']) : '◎';
  yield { by: poster, form: F, sal: 0.6 };
  if (tg.bot && bnChance(0.7)) yield { by: tg.bot, to: poster, form: fPid(bnIdio(tg.bot, bnPick([['@', '?'], ['◎', '✗'], ['☺'], ['♥'], ['@', '⧗', '→']]))) };
  else if (bnChance(0.5)) yield { by: bnTalker(), to: poster, form: fPid(bnPick([['♥'], ['◎', '✓'], ['ᵕ', '♥'], [':', '◎']])) };
}
function* bnThProc() {
  const nm = bnPick(BPROCS), p = BAND.crew.find(b => b.name === nm);
  yield { by: p, form: fPid(BPROCSAY[p.name](), '#8f897d'), sal: 0.05 };
  if (p.name === 'GC' && bnChance(0.4)) yield { by: p, form: fStack(bnPick([['∿', '◇', '3'], ['▦', ':', '▦'], ['≡', '≡', '≡', '◌'], ['@']])), sal: 0.05 };
}
function* bnThFolk() {
  const f = bnOf('folk'), z = bnInt(2, 14);
  yield { by: f, form: fFolk(bnPick(BFOLKSAY)(z)), sal: 0.7 };
  if (bnChance(0.7)) { const b = bnTalker(); yield { by: b, to: f, form: fPid(bnIdio(b, bnPick([['@', '◎'], ['✓'], ['?'], ['☺'], ['♥'], ['⧗', '@']]))) }; }
  if (bnChance(0.25)) yield { by: f, form: fFolk(bnPick(['thanks?', 'what does that mean', 'ok', 'love you too i guess', 'i will take that as a yes'])), sal: 0.7 };
}
function* bnThAlarm() {
  const a = bnOf(bnPick(['tie', 'eye', 'spin'])), lv = bnLv(a);
  yield { by: a, form: fPid(bnPick([['‼', '⌣', '∿', lv], ['‼', 'ᵕ', '≡', lv], ['‼', '◍', '∅'], ['‼', '▦', '↙', lv]]), null, true), sal: 0.85 };
  const w = bnOf('weld'); yield { by: w, to: a, form: fPid(bnIdio(w, ['✶', '→', lv])) };
  if (BAND.cfg.wins && a.body && bnChance(0.6)) yield* bnThWindow(null, { bot: a, label: a.name, col: a.col });
  yield { by: a, form: fPid(['✓']) };
}
function* bnThDeep() {
  const d = bnOf('deep'), toks = bnPick([['Ω', '↑', '⬚'], ['Ω', '⊓', '▦', '▦', '▦'], ['∵', '⬚', 'Ω'], ['Ω', '☼', '∅'], ['@', '⊕', '⬚', '⍥'], ['Ω', '♪']]);
  BAND.hush = BAND.t + toks.length * 0.8 + 6;
  yield { by: BAND.crew.find(b => b.name === 'CLOCK'), form: fPid(['⌁', '⌁', '⌁'], '#8f897d'), wait: 1.2, sal: 0.9 };
  const F = fDeep(toks); F.n = toks.length;
  yield { by: d, form: F, sal: 1, wait: toks.length * 0.8 + 1.5 };
  if (BAND.cfg.wins && bnChance(0.6)) yield { by: bnOf('eye'), form: Object.assign(fWin({ deep: true, at: [32, 32, 0], label: '??', col: '#a08a5c' }), { note: 'Ω' }), sal: 0.9 };
  for (let k = 0; k < 3; k++) { const b = bnTalker(); yield { by: b, form: fPid(bnIdio(b, bnPick([['‼'], ['Ω', '♥'], ['ᵕ', '↑', '↑'], ['◌'], ['Ω', '?'], ['@', '⧗']]))), sal: 0.5 }; }
}
// the world's own news, as it happens
function* bnThNews(th, ev) {
  if (!bnOn('X5')) return;
  const m = bnOf('mote'), f = bnOf('fore');
  if (ev.k === 'tod') { const a = bnTalker(); yield { by: a, form: fPid(ev.v === 'night' ? ['☾', '↓'] : ev.v === 'dusk' ? ['☼', '↙'] : ['☼', '↑', '☺']) }; yield { by: bnFriend(a), form: fPid(bnPick([['♥'], ['◍', '☼'], ['⧗'], ['♪']])) }; }
  if (ev.k === 'cable') { const t = bnOf('tie'); yield { by: t, form: fPid(bnIdio(t, ['∿', '⊕', String(WIRES.cables.length)])) }; if (bnChance(0.6)) yield { by: BAND.crew.find(b => b.name === 'TIEWATCH'), form: fPid(BPROCSAY.TIEWATCH(), '#8f897d') }; }
  if (ev.k === 'tie') { const t = bnOf('tie'); yield { by: t, form: fPid(bnIdio(t, ['≡', ev.v > 0 ? '⊕' : '⊖', String(WIRES.ties.length)])) }; }
  if (ev.k === 'proposed') { yield { by: f, form: fPid(['✻', '▢', '⇢', '⬉', '?']), sal: 0.6 }; yield { by: m, form: fPid(bnIdio(m, ['◎', '✻'])) }; }
  if (ev.k === 'building') {
    yield { by: BAND.crew.find(b => b.name === 'SCHED'), form: fPid(['▦', '⇢', lvCode(ev.j.site.z), String(ev.j.pieces.length)], '#8f897d') };
    if (BAND.cfg.wins && DRONES.length) yield { by: bnOf('eye'), form: Object.assign(fWin({ drone: DRONES[DRONES.length - 1], label: 'DRONE', col: '#ff7a52' }), { note: '▦' }), sal: 0.7 };
    yield { by: m, form: fPid(bnIdio(m, ['▦', '↓', lvCode(ev.j.site.z)])) };
  }
  if (ev.k === 'done') { yield { by: f, form: fPid(['✓', '✓', lvCode(ev.j.site.z)]) }; yield { by: m, form: fPid(['♥']) }; }
  if (ev.k === 'rejected') yield { by: f, form: fPid(['✻', '⊖', '▢', '☹']) };
}
function bnWatchWorld() {
  const w = BAND.w || (BAND.w = { tod: S.tod, cab: WIRES.cables.length, ties: WIRES.ties.length, jobs: new Map() });
  if (S.tod !== w.tod) { w.tod = S.tod; bnSpawn(bnThNews, true, { k: 'tod', v: S.tod }); }
  if (WIRES.cables.length > w.cab) bnSpawn(bnThNews, true, { k: 'cable' });
  w.cab = WIRES.cables.length;
  if (WIRES.ties.length !== w.ties && BAND.t - (w.tieAt || -9) > 4) { bnSpawn(bnThNews, true, { k: 'tie', v: WIRES.ties.length - w.ties }); w.ties = WIRES.ties.length; w.tieAt = BAND.t; }
  for (const j of JOBS) { const s = w.jobs.get(j.id); if (s !== j.status) { w.jobs.set(j.id, j.status); if (s !== undefined || j.status !== 'done') bnSpawn(bnThNews, true, { k: j.status, j }); } }
}

// ---------- the tick: rate, weather, threads, live repaints, glide ----------
function updateBand(dt) {
  if (!BAND.ready) { if (!BOOT.done) return; bandStart(); }
  BAND.t += dt;
  if (BAND.stage !== WIRES.stage) bnPlaceBodies();
  bnMoveBodies(dt);
  const cfg = BAND.cfg;
  if (cfg.on) {
    bnWatchWorld();
    // the band's weather: activity wanders, more so the burstier it is set
    if ((BAND.wT -= dt) <= 0) { BAND.wT = 4 + bnR() * 10; BAND.wTo = lerp(1, bnPick([0.2, 0.5, 1, 1.4, 2.4]), cfg.burst); }
    BAND.weather += (BAND.wTo - BAND.weather) * (1 - Math.exp(-dt / 3));
    const R = bandRate() * BAND.weather * (BAND.t < BAND.hush ? 0.12 : 1);
    BAND.credit = Math.min(1 + cfg.burst * 5, BAND.credit + R * dt);
    let sent = 0;
    for (const th of BAND.threads.slice()) {
      if (BAND.t < th.at) continue;
      if (!th.force && BAND.credit < 1) { th.at += 0.1 + bnR() * 0.2; continue; }
      const k = bnStep(th);
      if (k === 1) { sent++; if (!th.force) BAND.credit -= 1; }
      if (!k) BAND.threads = BAND.threads.filter(q => q !== th);
    }
    const cap = 2 + Math.ceil(R * 2.5);
    while (BAND.credit >= 1 && BAND.threads.length < cap) {
      const m = cfg.mix;
      const on = c => bnOn(c) ? 1 : 0;   // each kind has its catalog switch
      const gen = bnWeighted([[bnThChat, m.pidgin * 2.4], [bnThPlan, m.plans * on('H1')], [bnThRoutine, m.blocks * on('P1')], [bnThPatch, m.patches * on('W1')], [bnThRoute, m.routes * on('R1')],
        [bnThWindow, cfg.wins ? m.windows * 0.7 * on('V1') : 0], [bnThProc, m.procs * 1.4 * on('X1')], [bnThFolk, m.people * 0.8 * on('X2')], [bnThAlarm, 0.08 * m.pidgin * on('X3')],
        [bnThBraid, 0.1 * m.pidgin * on('L7')], [bnThCart, 0.3 * m.blocks * on('P6')], [null, 0.0001]]);
      if (!gen) break;
      const th = bnSpawn(gen), k = bnStep(th);
      if (k === 1) { sent++; BAND.credit -= 1; }
      if (!k) BAND.threads = BAND.threads.filter(q => q !== th);
    }
    if (BAND.t > BAND.deepAt) { BAND.deepAt = BAND.t + 150 + bnR() * 260; if (BAND.recs.length > 8 && bnOn('X4')) bnSpawn(bnThDeep, true); }
    BAND.ema += (sent / Math.max(dt, 1e-3) - BAND.ema) * (1 - Math.exp(-dt / 8));
  }
  const lt = bnLight(); if (lt !== BAND.lt) { BAND.lt = lt; for (const r of BAND.recs) bnRepaint(r); }   // the UI tone changed: re-ink
  if (!BAND.warm) { bnLive(); bnGlide(dt); }
}
function bnLive() {
  if (!BAND.live.length) return;
  const el = $('feed'), fr = el.getBoundingClientRect();
  for (const rec of BAND.live.slice()) {
    if (BAND.t >= rec.liveTo) { if (rec.form.kind === 'win') bnStale(rec); else { BAND.live = BAND.live.filter(r => r !== rec); bnRepaint(rec); } continue; }
    if (BAND.t - rec.paintedAt < 1 / (bnTyping(rec) ? 24 : rec.fps)) continue;
    const r = rec.li.getBoundingClientRect();
    if (!r.height || r.bottom < fr.top || r.top > fr.bottom) continue;
    rec.renderNow = true; bnPaint(rec); rec.renderNow = false;
  }
}
// the feed glides down to the newest line; it holds while the pointer is over it or you've scrolled up
function bnGlide(dt) {
  const el = $('feed'); if (!el || !el.clientHeight) return;
  const max = el.scrollHeight - el.clientHeight, d = max - el.scrollTop;
  bnPill();
  if (bnHeld() || d <= 0.5) { BAND.acc = 0; return; }
  const g = BAND.cfg.glide;
  if (REDUCED || g < 0.03 || d > el.clientHeight * 2) { el.scrollTop = d > el.clientHeight * 2 && !REDUCED && g >= 0.03 ? max - el.clientHeight : max; return; }
  BAND.acc += Math.max(d * lerp(9, 1.4, g), lerp(260, 24, g)) * dt;
  const mv = Math.min(Math.floor(BAND.acc), Math.ceil(d));
  if (mv > 0) { BAND.acc -= mv; el.scrollTop += mv; }
}
function bnPill() {
  const p = $('bandPill'); if (!p) return;
  const el = $('feed'), below = el.scrollHeight - el.clientHeight - el.scrollTop;
  const show = bnHeld() && below > 30 && UI.feed !== 'log' && UI.feed !== 'chat';
  if (show !== !p.hidden) p.hidden = !show;
  if (show) { p.style.top = el.offsetTop + el.clientHeight - 24 + 'px'; const n = BAND.recs.filter(r => r.li.offsetTop - el.offsetTop > el.scrollTop + el.clientHeight).length; const t = (BAND.hover ? 'held · ' : '') + n + ' below'; if (p.textContent !== t) p.textContent = t; }
}
function bandStart() {
  BAND.ready = true;
  bandCrew();
  BAND.deepAt = 100 + Math.random() * 120;
  BAND.rnd = mulberry32(BAND.cfg.seed * 7919 + 1);
  bnCount();
}
// a run of band time without drawing, for screenshots and tests
function bandWarm(sec) {
  if (!BAND.ready) bandStart();
  BAND.warm = true;
  try { for (let k = 0; k < sec * 20; k++) updateBand(1 / 20); } finally { BAND.warm = false; }
  for (const r of BAND.recs) { r.W = bnW(); r.renderNow = true; bnPaint(r); r.renderNow = false; }
  const el = $('feed'); el.scrollTop = el.scrollHeight;
}

// ---------- bodies: tiny bots on the cables and in the void ----------
function bnPlaceBodies() {
  BAND.stage = WIRES.stage;
  const st = WIRES.stage, an = [];
  for (const p of WIRES.posts) an.push([p.x + 0.5, p.y + 0.5, p.z1 + 0.3]);
  for (const g of WIRES.girders) an.push([(g.a[0] + g.b[0]) / 2, (g.a[1] + g.b[1]) / 2, (g.a[2] + g.b[2]) / 2 + 0.2]);
  if (st) for (const v of st.voids || [st]) for (let k = 0; k < 6; k++) an.push([lerp(v.V.x0, v.V.x1, Math.random()), lerp(v.V.y0, v.V.y1, Math.random()), st.zf + 1 + Math.random() * 4]);
  if (!an.length) { const d = depot(); for (let k = 0; k < 8; k++) an.push([d[0] + (Math.random() - 0.5) * 12, d[1] + (Math.random() - 0.5) * 12, d[2] - Math.random() * 4]); }
  BAND.anch = an;
  const cables = WIRES.cables.filter(c => cableLen(c) > 3);
  BAND.swarm = { p: an[0].slice(), to: an[0].slice(), t: 0 };
  for (const b of BAND.crew) {
    const kind = BKIND[b.k].body; b.body = null; if (!kind) continue;
    const a = bnPick(an).slice();
    if (kind === 'crawl') { if (!cables.length) continue; const c = bnPick(cables); b.body = { kind, c, s: Math.random() * (c.n - 1), dir: Math.random() < 0.5 ? 1 : -1, sp: 0.6 + Math.random() * 0.8, wait: 0, p: [0, 0, 0], ph: Math.random() * 9 }; }
    else if (kind === 'walk' && st) b.body = { kind, p: [st.XA + 2 + Math.random() * (st.XB - st.XA - 4), st.YT + 1, st.zf], dir: 1, wait: 0, ph: Math.random() * 9 };
    else b.body = { kind: kind === 'walk' ? 'fly' : kind, p: a, to: a.slice(), wait: Math.random() * 3, ph: Math.random() * 9, sp: kind === 'hover' ? 0.8 : 2 };
  }
}
const bnAt = (c, s) => { const i = clamp(Math.floor(s), 0, c.n - 2), f = s - i; return [lerp(c.X[i * 3], c.X[i * 3 + 3], f), lerp(c.X[i * 3 + 1], c.X[i * 3 + 4], f), lerp(c.X[i * 3 + 2], c.X[i * 3 + 5], f)]; };
function bnMoveBodies(dt) {
  const an = BAND.anch; if (!an.length) return;
  const sw = BAND.swarm;
  BAND.pulses = BAND.pulses.filter(q => { q.s += q.dir * q.sp * dt; return q.s >= 0 && q.s <= q.c.n - 1 && WIRES.cables.includes(q.c); });
  if (sw) { if ((sw.t -= dt) <= 0) { sw.t = 6 + Math.random() * 8; sw.to = bnPick(an).slice(); } for (let k = 0; k < 3; k++) sw.p[k] += (sw.to[k] - sw.p[k]) * (1 - Math.exp(-dt / 2.5)); }
  let mi = 0;
  for (const b of BAND.crew) {
    const B = b.body; if (!B) continue;
    if (B.kind === 'crawl') {
      if (!WIRES.cables.includes(B.c)) { const cs = WIRES.cables.filter(c => cableLen(c) > 3); if (!cs.length) { b.body = null; continue; } B.c = bnPick(cs); B.s = 0; }
      if (B.wait > 0) B.wait -= dt;
      else {
        const s0 = B.s; B.s += B.dir * B.sp * dt;
        if (B.s <= 0 || B.s >= B.c.n - 1) { B.s = clamp(B.s, 0, B.c.n - 1); B.dir *= -1; B.wait = 0.6 + Math.random(); }
        // a pause at each tie it passes, to check it
        for (const t of WIRES.ties) for (const m of t.m) if (m.c === B.c && (m.i - s0) * (m.i - B.s) <= 0) { B.wait = 0.8 + Math.random() * 1.2; break; }
      }
      B.p = bnAt(B.c, B.s); B.p[2] += 0.06;
    } else if (B.kind === 'walk') {
      const st = WIRES.stage; if (!st) continue;
      if (B.wait > 0) { B.wait -= dt; continue; }
      B.p[0] += B.dir * 0.45 * dt;
      if (B.p[0] < st.XA + 1.5 || B.p[0] > st.XB - 1.5) { B.dir *= -1; B.wait = 1.5 + Math.random() * 2; }
      else if (Math.random() < dt * 0.06) B.wait = 1 + Math.random() * 2;
    } else if (B.kind === 'swarm') {
      const a = BAND.t * (0.7 + (mi % 3) * 0.2) + mi * 2.1, r = 0.8 + (mi % 4) * 0.35; mi++;
      B.p = [sw.p[0] + Math.cos(a) * r, sw.p[1] + Math.sin(a) * r, sw.p[2] + Math.sin(a * 1.7) * 0.3];
    } else {
      if (B.wait > 0) { B.wait -= dt; continue; }
      const d = Math.hypot(B.to[0] - B.p[0], B.to[1] - B.p[1], B.to[2] - B.p[2]);
      if (d < 0.08) { B.wait = (B.kind === 'perch' ? 8 : 1.5) + Math.random() * (B.kind === 'perch' ? 20 : 5); const a = bnPick(an); B.to = [a[0] + (Math.random() - 0.5) * 2, a[1] + (Math.random() - 0.5) * 2, a[2] + (B.kind === 'perch' ? 0 : Math.random())]; continue; }
      const k = Math.min(1, (B.sp || 2) * dt / d); for (let q = 0; q < 3; q++) B.p[q] += (B.to[q] - B.p[q]) * k;
    }
  }
}
// every message also runs down a real data wire as a pulse of light, from near whoever said it
function bnPulse(b) {
  const data = WIRES.cables.filter(c => c.gi === 0 && c.n > 6); if (!data.length || !BAND.cfg.bodies) return;
  let c = data[Math.floor(Math.random() * data.length)];
  if (b.body && b.body.p) { let bd = 1e9; for (let k = 0; k < 6; k++) { const q = data[Math.floor(Math.random() * data.length)], m = bnAt(q, q.n / 2), d = Math.hypot(m[0] - b.body.p[0], m[1] - b.body.p[1], m[2] - b.body.p[2]); if (d < bd) { bd = d; c = q; } } }
  const dir = Math.random() < 0.5 ? 1 : -1;
  BAND.pulses.push({ c, s: dir > 0 ? 0 : c.n - 1, dir, sp: 14 + Math.random() * 10, col: b.col });
  if (BAND.pulses.length > 16) BAND.pulses.shift();
}
// drawn in the depth pass with the birds (plain: no depth test, for the windows)
function drawBots(ctx, plain) {
  if (!BAND.ready || !BAND.cfg.bodies || S.mode !== 'cut') return;
  const cutTop = S.level + HT / LH, cutting = S.level < NL - 1, t = S.time;
  const px = (x, y, col) => { if (plain || wdt(x, y)) { ctx.fillStyle = col; ctx.fillRect(x, y, 1, 1); } };
  for (const q of BAND.pulses) for (let k = 0; k < 3; k++) {
    const p = bnAt(q.c, clamp(q.s - q.dir * k * 0.7, 0, q.c.n - 1)), r = projIso(p[0], p[1], p[2]);
    if (cutting && p[2] > cutTop) continue;
    if (!plain) WDT.D = depthKey(p[0], p[1], p[2]) + 0.2;
    px(Math.round(r[0]), Math.round(r[1]), k ? mixHex(q.col, '#1b1c1f', k * 0.3) : '#fffbf2');
  }
  for (const b of BAND.crew) {
    const B = b.body; if (!B || !B.p) continue;
    const p = B.p; if (cutting && p[2] > cutTop + 1.2) continue;
    const bob = B.kind === 'hover' || B.kind === 'fly' ? Math.sin(t * 2.2 + B.ph) * 0.05 : 0;
    const q = projIso(p[0], p[1], p[2] + bob), X = Math.round(q[0]), Y = Math.round(q[1]);
    if (X < -8 || Y < -8 || X > S.bw + 8 || Y > S.bh + 8) continue;
    if (!plain) WDT.D = depthKey(p[0], p[1], p[2]) + 0.2;
    const blink = ((t * 2 + B.ph) % 1) < 0.5;
    if (b.k === 'tie') { px(X - 1, Y - 1, '#eeeae0'); px(X, Y - 1, '#eeeae0'); px(X - 1, Y, '#4a4540'); px(X, Y, '#4a4540'); if (blink) px(B.dir > 0 ? X + 1 : X - 2, Y - 1, '#5fd3f2'); }
    else if (b.k === 'mote') { px(X, Y, '#a9b6bf'); if (blink) px(X, Y - 1, '#e8a83c'); }
    else if (b.k === 'spin') { px(X - 1, Y - 1, '#5fd3c4'); px(X, Y - 1, '#5fd3c4'); px(X + 1, Y - 1, '#5fd3c4'); px(blink ? X - 2 : X - 1, Y - 2, '#d8d0bf'); px(blink ? X + 2 : X + 1, Y - 2, '#d8d0bf'); px(X, Y, '#2f8c80'); px(X, Y + 1, '#2f8c80'); }
    else if (b.k === 'eye') {
      px(X - 1, Y - 2, '#86b3d6'); px(X, Y - 2, '#86b3d6'); px(X - 1, Y - 1, '#4f7899'); px(X, Y - 1, '#f4f8fa');
      if (((t + B.ph) % 6) < 1.4) for (let k = 1; k < 9; k += 2) { if (plain || wdt(X, Y + k)) { ctx.fillStyle = 'rgba(134,179,214,0.45)'; ctx.fillRect(X, Y + k, 1, 1); } }
    } else if (b.k === 'haul') {
      const st = Math.floor(t * 4 + B.ph) & 1;
      for (let k = -3; k < 3; k++) px(X + k, Y - 4, '#a9b6bf');
      for (let k = -2; k < 2; k++) { px(X + k, Y - 3, '#b89a58'); px(X + k, Y - 2, '#7d6a3c'); }
      px(X - 2 + st, Y - 1, '#2a2826'); px(X + 1 - st, Y - 1, '#2a2826');
    } else if (b.k === 'weld') {
      px(X, Y - 2, '#e0a33a'); px(X, Y - 1, '#8a5c14'); px(X + 1, Y - 2, '#3a3835');
      if (B.wait > 0 && Math.random() < 0.6) for (let k = 0; k < 3; k++) { const sx = X + 1 + Math.floor(Math.random() * 4) - 1, sy = Y - 2 + Math.floor(Math.random() * 4) - 1; if (plain || wdt(sx, sy)) { ctx.fillStyle = k ? '#ffd27a' : '#fff6d8'; ctx.fillRect(sx, sy, 1, 1); } }
    }
    // a pip over whoever just spoke on the band
    if (S.time - b.spokeAt < 1.2 && !plain) { ctx.fillStyle = b.col; ctx.fillRect(X - 1, Y - 6, 3, 1); }
    if (BAND.hoverBot === b && !plain) {
      ctx.fillStyle = b.col;
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const ex = X + sx * 5, ey = Y - 1 + sy * 5; ctx.fillRect(sx < 0 ? ex : ex - 1, ey, 2, 1); ctx.fillRect(ex, sy < 0 ? ey : ey - 1, 1, 2); }
    }
  }
}

// ---------- the feed side: filter, open a line (gloss, time, its thread), watch ----------
function bnCount() { const n = $('bandN'); if (n) n.textContent = BAND.crew.filter(b => b.k !== 'folk').length; }
function bnWatch(b) {
  if (!b.body) return;
  bnSpawn(function* () { yield { by: bnOf('eye'), form: Object.assign(fWin({ bot: b, label: b.name, col: b.col }), { note: '◎' }), sal: 1 }; }, true);
}
function bnFocus(th) {
  BAND.focus = th;
  $('feed').classList.toggle('thf', th != null);
  for (const r of BAND.recs) r.li.classList.toggle('th-on', r.th === th);
}
// one line open at a time: it grows (gloss under the glyphs, a footer with the time); its thread stays lit.
// Hovering changes nothing in the feed's layout; only a click does.
const bnGlossOn = r => BAND.cfg.gloss === 'on' || (r.open && BAND.cfg.gloss === 'click');
function bnOpen(rec) {
  const prev = BAND.open; BAND.open = prev === rec ? null : rec;
  for (const r of [prev, BAND.open]) if (r) { r.open = r === BAND.open; r.li.classList.toggle('open', r.open); r.gloss = bnGlossOn(r); bnRepaint(r); }
  bnFocus(BAND.open ? BAND.open.th : null);
}
function setupBand() {
  const el = $('feed');
  el.addEventListener('mouseenter', () => { BAND.hover = true; });
  el.addEventListener('mouseleave', () => { BAND.hover = false; });
  el.addEventListener('wheel', e => { if (e.deltaY < 0) BAND.pin = false; }, { passive: true });
  el.addEventListener('scroll', () => { if (el.scrollHeight - el.clientHeight - el.scrollTop < 6) BAND.pin = true; });
  el.addEventListener('pointerdown', e => { if (e.offsetX > el.clientWidth) BAND.pin = false; });   // the scrollbar
  el.addEventListener('mouseover', e => {
    const li = e.target.closest && e.target.closest('.bd'); const rec = li && li._bn;
    if (!rec || BAND.hoverRec === rec) return;
    BAND.hoverRec = rec; BAND.hoverBot = rec.bot;   // a reticle on the bot in the world; nothing moves in the feed
  });
  el.addEventListener('mouseleave', bnUnhover);
  el.addEventListener('click', e => {
    const li = e.target.closest && e.target.closest('.bd'); const rec = li && li._bn; if (!rec) return;
    if (e.target.closest('.bdw')) { bnWatch(rec.bot); sfx.click(); return; }
    if (rec.form.kind === 'win') {
      const r = rec.cv.getBoundingClientRect(), ax = (e.clientX - r.left) / r.width * rec.cv.width, ay = (e.clientY - r.top) / r.height * rec.cv.height, F = rec.form, ww = F.ww || rec.W;
      if (ax > ww) { bnOpen(rec); return; }
      if (F.stale && bnOn('V3') && ay > 9 && ay < 19) { F.unshade = !F.unshade; bnRepaint(rec); sfx.click(); return; }
      if (ax > ww - 9 && ay > 10 && ay < 19) { bnStale(rec); li.remove(); BAND.recs = BAND.recs.filter(q => q !== rec); return; }
      const p = rec.form.last; if (p && ay > 18) { setLevel(clamp(Math.floor(p[2] + 0.3) + 1, 0, NL - 1)); centerOn(p[0], p[1], p[2]); sfx.click(); return; }
    }
    bnOpen(rec);
  });
  const pill = document.createElement('button'); pill.type = 'button'; pill.id = 'bandPill'; pill.hidden = true;
  pill.onclick = () => { BAND.pin = true; BAND.hover = false; el.scrollTop = el.scrollHeight; };
  el.after(pill);
  setupBandPanel();
}
function bnUnhover() { BAND.hoverRec = null; BAND.hoverBot = null; }

// ---------- the band's panel: traffic, mix, what leaks into All ----------
Object.assign(GLYPH, {
  band: ['#.......#', '.#.....#.', '#.#...#.#', '.#..#..#.', '....#....', '...###...', '....#....', '...#.#...', '..#...#..'],
  bnBlocks: ['.........', '####.....', '########.', '########.', '.#.......', '########.', '########.', '..#####..', '.........'],
  bnPlans: ['.#######.', '#+++++++#', '#+#####+#', '#+#...#+#', '#+#####+#', '#+++++++#', '.#######.', '.........', '.........'],
  bnPatches: ['##.....##', '##.....##', '.#.....#.', '..#...#..', '...###...', '.........', '.........', '.........', '.........'],
  bnRoutes: ['###......', '..#......', '..#####..', '......#..', '......###', '.........', '.........', '.........', '.........'],
  bnWindows: ['#########', '#+#####+#', '#########', '#.......#', '#.......#', '#.......#', '#########', '.........', '.........'],
  bnPeople: ['...###...', '...###...', '...###...', '.........', '.#######.', '#########', '#########', '.........', '.........']
});
const bnIcon = k => glyph({ pidgin: BNG['@'].slice(2), procs: BNG['◌'].slice(2), offtask: BNG['♥'].slice(2), struct: BNG['⊢'].slice(2) }[k] || GLYPH['bn' + k[0].toUpperCase() + k.slice(1)], 2);
Object.assign(SLD, {
  bnTraffic: { lo: 0, hi: 1, get: () => BAND.cfg.traffic, set: v => { BAND.cfg.traffic = Math.round(v * 100) / 100; bnVals(); } },
  bnBurst: { lo: 0, hi: 1, get: () => BAND.cfg.burst, set: v => { BAND.cfg.burst = Math.round(v * 100) / 100; bnVals(); } },
  bnGlide: { lo: 0, hi: 1, get: () => BAND.cfg.glide, set: v => { BAND.cfg.glide = Math.round(v * 100) / 100; bnVals(); } },
  bnLeak: { lo: 0, hi: 1, get: () => BAND.cfg.leak, set: v => { BAND.cfg.leak = Math.round(v * 100) / 100; for (const r of BAND.recs) r.li.classList.toggle('bq', !bnLeaks(r)); bnVals(); } }
});
for (const [k] of BAND_MIX) SLD['bnMix_' + k] = { lo: 0, hi: 1, get: () => BAND.cfg.mix[k], set: v => { BAND.cfg.mix[k] = Math.round(v * 100) / 100; bnVals(); } };
const bnPct = v => Math.round(v * 100) + '%';
function bnFmtRate(r) { return r >= 1 ? r.toFixed(1) + '/s' : Math.round(r * 60) + '/min'; }
function bnVals() {
  const c = BAND.cfg, pop = $('bandPop');
  bandSave();
  if (!pop || pop.hidden) return;
  const v = { bnTraffic: bnFmtRate(bandRate()), bnBurst: bnPct(c.burst), bnGlide: c.glide < 0.03 ? 'snap' : bnPct(c.glide), bnLeak: bnPct(c.leak) };
  for (const [k] of BAND_MIX) v['bnMix_' + k] = bnPct(c.mix[k]);
  pop.querySelectorAll('[data-bv]').forEach(e => { const t = v[e.dataset.bv]; if (t && e.textContent !== t) e.textContent = t; });
  const rd = $('bnRead'); if (rd) rd.textContent = c.on ? '≈ ' + Math.round(BAND.ema * 60) + '/min now' : 'silent';
}
function setupBandPanel() {
  const pop = document.createElement('div'); pop.id = 'bandPop'; pop.className = 'popm pn'; pop.hidden = true;
  document.body.appendChild(pop);
  const btn = $('bandBtn'); btn.insertAdjacentHTML('afterbegin', glyph('band', 1));
  pop.addEventListener('click', e => {
    const t = e.target.closest('[data-bk],[data-bgl],[data-bwn],[data-bnm],[data-bpr],[data-breset],[data-bseed],[data-bcat]'); if (!t) return;
    if (t.dataset.bcat) { pop.hidden = true; btn.setAttribute('aria-expanded', 'false'); openBandCatalog(); sfx.click(); return; }
    const c = BAND.cfg;
    if (t.dataset.bk === 'on') c.on = !c.on;
    else if (t.dataset.bk === 'bodies') c.bodies = !c.bodies;
    else if (t.dataset.bk === 'typing') c.typing = !c.typing;
    else if (t.dataset.bnm) { c.names = t.dataset.bnm; for (const r of BAND.recs) bnRepaint(r); }
    else if (t.dataset.bpr) { c.probes = t.dataset.bpr; for (const r of BAND.recs) if (r.form.kind === 'blocks') bnRepaint(r); }
    else if (t.dataset.bgl) { c.gloss = t.dataset.bgl; for (const r of BAND.recs) if (r.form.glossy) { r.gloss = bnGlossOn(r); bnRepaint(r); } }
    else if (t.dataset.bwn) { c.wins = +t.dataset.bwn; const w = BAND.live.filter(r => r.form.kind === 'win' && !r.form.stale); while (w.length > c.wins) bnStale(w.shift()); }
    else if (t.dataset.bseed) { c.seed = (c.seed * 31 + 17) % 10007; bandCrew(); bnCount(); }
    else if (t.dataset.breset) { const s = c.seed, ft = c.feat; BAND.cfg = Object.assign(JSON.parse(JSON.stringify(BAND_DEF)), { seed: s, feat: ft }); }   // the catalog's switches stay
    syncBandPanel(); bnVals(); sfx.click();
  });
  const open = () => { pop.hidden = false; syncBandPanel(); const r = btn.getBoundingClientRect(); pop.style.left = clamp(r.right - pop.offsetWidth, 4, innerWidth - pop.offsetWidth - 4) + 'px'; pop.style.top = Math.min(r.bottom + 6, innerHeight - pop.offsetHeight - 6) + 'px'; btn.setAttribute('aria-expanded', 'true'); };
  const close = () => { pop.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
  btn.onclick = e => { e.stopPropagation(); pop.hidden ? open() : close(); };
  document.addEventListener('pointerdown', e => { if (!pop.hidden && !pop.contains(e.target) && !btn.contains(e.target)) close(); });
  setInterval(() => { if (!pop.hidden) bnVals(); }, 1000);
}
function syncBandPanel() {
  const pop = $('bandPop'); if (!pop || pop.hidden) return;
  const c = BAND.cfg, off = !c.on;
  const row = (icon, col, name, sl) => `<div class="row"><span class="rt">${icon ? `<span class="ic" style="color:${col}">${icon}</span>` : ''}<span>${name}</span></span>${slHTML(sl, off)}<span class="v" data-bv="${sl}"></span></div>`;
  const seg = (attr, opts, cur, label) => `<span class="sgc ${off ? 'dis' : ''}" role="radiogroup" aria-label="${label}" style="--n:${opts.length};--i:${Math.max(0, opts.findIndex(o => String(o[0]) === String(cur)))}">${opts.map(o => `<button type="button" class="${String(o[0]) === String(cur) ? 'on' : ''}" data-${attr}="${o[0]}" role="radio" aria-checked="${String(o[0]) === String(cur)}">${o[1]}</button>`).join('')}<i class="ind"></i></span>`;
  pop.innerHTML = `<div class="lp-h ttl"><span>The band</span><span class="lp-dim" id="bnRead"></span><span class="lp-sw" data-bk="on" role="switch" aria-checked="${c.on}" aria-label="Band chatter on/off">${c.on ? 'on' : 'off'}<span class="tgl ${c.on ? 'on' : ''}"></span></span></div>` +
    `<div class="lp-sub">Flow</div><div class="rows">` + row(null, '', 'Traffic', 'bnTraffic') + row(null, '', 'Bursts', 'bnBurst') + row(null, '', 'Glide', 'bnGlide') + row(null, '', 'Into All', 'bnLeak') + `</div>` +
    `<div class="lp-sub">Mix</div><div class="rows">` + BAND_MIX.map(([k, name, col]) => row(bnIcon(k), col, name, 'bnMix_' + k)).join('') + `</div>` +
    `<div class="lp-sub">Show</div><div class="rows">` +
    `<div class="row wide"><span class="rt"><span>Gloss</span></span>${seg('bgl', [['off', 'Off'], ['click', 'On click'], ['on', 'Always']], c.gloss, 'Gloss')}</div>` +
    `<div class="row wide"><span class="rt"><span>Names</span></span>${seg('bnm', [['col', 'Column'], ['plate', 'Plate'], ['inline', 'Inline']], c.names, 'Names')}</div>` +
    `<div class="row wide"><span class="rt"><span>Probes</span></span>${seg('bpr', [['off', 'Off'], ['type', 'Type'], ['stack', 'Stack'], ['live', 'Live'], ['mix', 'Mix']], c.probes, 'Probes on blocks')}</div>` +
    `<div class="row wide"><span class="rt"><span>Windows</span></span>${seg('bwn', [[0, '0'], [1, '1'], [2, '2'], [3, '3'], [4, '4']], c.wins, 'Live windows')}</div>` +
    `<div class="row wide"><span class="rt" data-bk="typing"><span>Typed out</span></span><span data-bk="typing" role="switch" aria-checked="${c.typing}" aria-label="Typed out"><span class="tgl ${c.typing ? 'on' : ''}"></span></span></div>` +
    `<div class="row wide"><span class="rt" data-bk="bodies"><span>Bots in the world</span></span><span data-bk="bodies" role="switch" aria-checked="${c.bodies}" aria-label="Bots in the world"><span class="tgl ${c.bodies ? 'on' : ''}"></span></span></div></div>` +
    `<div class="foot"><button type="button" class="btn sm" data-bcat="1">Catalog</button><span></span><button type="button" class="btn sm" data-bseed="1">Reseed</button><button type="button" class="btn sm" data-breset="1">Reset</button></div>`;
  bnVals();
}
