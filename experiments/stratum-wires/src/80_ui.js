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
const UICFG = { MT: 11, PX: 1, BV: 1, OL: 1, DT: 1, TX: 1, WF: 24, LG: 2, TB: 3, KH: 2, FO: 2, LT: 1, SL: 3, SG: 1, BT: 2, BB: 3, SC: 1 };
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
  lay.querySelectorAll('.grow').forEach(row => { const slot = nav.querySelector(`[data-slot="${row.dataset.g}"]`); if (!slot) return; const g = vwRel(slot.closest('.grp')); row.style.left = (N.right + 3) + 'px'; row.style.top = g.top + 'px'; });
  const fo = $('flyout'); if (!fo) return;
  // where it goes: right of the palette, past the name column (all tools) or the opened rows (groups)
  let a, x0 = N.right, x;
  if (st === 2) { const b = nav.querySelector(`.tool[aria-pressed="true"]`) || nav.querySelector('.tl-thumb'); a = vwRel(b); const lw = Math.max(0, ...[...nav.querySelectorAll('.tool .lb')].map(l => l.offsetWidth)); x = N.right + lw + 18; }
  else if (st === 1) { const rowB = lay.querySelector('.grow .tool[aria-pressed="true"]'), b = rowB || nav.querySelector(`[data-slot="${groupOfTool(S.tool)}"]`) || nav.querySelector('.tl-thumb'); a = vwRel(b); if (rowB) x0 = vwRel(rowB.closest('.grow')).right; x = Math.max(N.right, ...[...lay.querySelectorAll('.grow')].map(r => vwRel(r).right)) + 10; }
  else { a = vwRel(nav.querySelector('.tl-thumb')); x = N.right + 10; }
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
  if (t.dataset.slot) { const g = t.dataset.slot; UI.open.has(g) ? UI.open.delete(g) : UI.open.add(g); t.classList.toggle('open', UI.open.has(g)); t.setAttribute('aria-expanded', UI.open.has(g)); renderToolLayer(); sfx.click(); return; }
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
function log(owner, text, cls) {
  const li = document.createElement('li');
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
  const tone = store.get('tone', 'light'); UICFG.MT = tone === 'dark' ? 10 : 11;
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
