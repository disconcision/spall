// Round 2: P11..P18. The bot languages pushed further: tone and ligatures,
// quotes as cartridges, blocks that wear their execution, live wires,
// plans that fill, many pointers on one route, live windows, a colossus.
// Animations share one loop, run only while on screen, and freeze under ?still.
'use strict';
const STILL = matchMedia('(prefers-reduced-motion: reduce)').matches || /still/.test(location.search);
const ANIMS = [];
// fn(t) redraws for time t (seconds); under ?still it is drawn once at tStill
function anim(el, fn, tStill) { ANIMS.push({ el, fn, vis: true }); fn(STILL ? (tStill || 0) : 0); }
function runAnims() {
  if (STILL || !ANIMS.length) return;
  const io = new IntersectionObserver(es => es.forEach(e => { for (const a of ANIMS) if (a.el === e.target) a.vis = e.isIntersecting; }));
  ANIMS.forEach(a => io.observe(a.el));
  const t0 = performance.now();
  // (a frame's timestamp can be a little before t0)
  (function loop(now) { const t = Math.max(0, now - t0) / 1000; for (const a of ANIMS) if (a.vis) a.fn(t); requestAnimationFrame(loop); })(t0);
}
const clamp01 = v => Math.max(0, Math.min(1, v));
const ease = v => v < 0.5 ? 2 * v * v : 1 - 2 * (1 - v) * (1 - v);
// a convex polygon filled by scanline, so edges land on whole pixels
function fillPoly(g, pts, col) {
  let y0 = Infinity, y1 = -Infinity;
  for (const p of pts) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  g.fillStyle = col;
  for (let y = Math.floor(y0); y < Math.ceil(y1); y++) {
    const yc = y + 0.5; let xl = Infinity, xr = -Infinity;
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
      if ((ay <= yc && by > yc) || (by <= yc && ay > yc)) { const x = ax + (yc - ay) / (by - ay) * (bx - ax); xl = Math.min(xl, x); xr = Math.max(xr, x); }
    }
    if (xl < xr) g.fillRect(Math.round(xl), y, Math.round(xr) - Math.round(xl), 1);
  }
}
const padw = (...kids) => h('div', { class: 'padw' }, ...kids);
const xlabel = t => h('div', { class: 'xlabel' }, t);
const sysline = html => msg({ kind: 'sys', av: 'sys', name: 'sys', text: '<span class="faintx">' + html + '</span>', cls: 'sysm' });
const botLine = (av, name, canvas, o) => msg(Object.assign({ kind: 'bot', av, name, inline: canvas, cls: 'botm' }, o || {}));

// =====================================================================
// P11 pidgin II: tone, ligatures, the stack strip, the braid
// =====================================================================
// ligatures: pairs said often enough fuse into one 7x5 glyph; 'a' first role, 'b' second, '+' where they overlap
const LIG = {
  '∿≡': ['V', 'M', '...b...', '.a.b...', 'a.aba.a', '...b.a.', '...b...'],
  '▦✶': ['V', 'M', 'aaaaa.b', '.a.a.b.', '..a.b+b', '.a.a.b.', 'aaaaa.b'],
  '⊓→': ['M', 'M', 'aaaab..', 'a..a.b.', 'a.b+bbb', 'a..a.b.', 'a..ab..']
};
function drawLig(g, key, x, y) {
  const d = LIG[key], ca = ROLE[d[0]], cb = d[0] === d[1] ? mix(ROLE[d[1]], '#ffffff', 0.4) : ROLE[d[1]];
  for (let r = 0; r < 5; r++) for (let q = 0; q < 7; q++) {
    const ch = d[r + 2][q]; if (ch === '.') continue;
    g.fillStyle = ch === 'a' ? ca : ch === 'b' ? cb : '#ffffff'; g.fillRect(x + q, y + r, 1, 1);
  }
  return 7;
}
// an aside: the 5x5 glyph pooled to 3x3 (rows/cols {0,1} {2} {3,4})
const SMALL = { '♥': ['#.#', '###', '.#.'], '∿': ['...', '#.#', '.#.'] };
function glyphSmall(g, key, x, y, col) {
  const d = GLY[key]; if (!d) return 0;
  const B = [[0, 1], [2, 2], [3, 4]];
  g.fillStyle = col || ROLE[d[0]];
  if (SMALL[key]) { SMALL[key].forEach((row, r) => [...row].forEach((ch, q) => { if (ch === '#') g.fillRect(x + q, y + r, 1, 1); })); return 3; }
  for (let r = 0; r < 3; r++) for (let q = 0; q < 3; q++) {
    let on = false;
    for (let rr = B[r][0]; rr <= B[r][1]; rr++) for (let qq = B[q][0]; qq <= B[q][1]; qq++) if (d[rr + 1][qq] !== '.') on = true;
    if (on) g.fillRect(x + q, y + r, 1, 1);
  }
  return 3;
}
// unsure: each column of the glyph bobs on its own
function wobble(g, key, x, y, t, seed) {
  const d = GLY[key], col = ROLE[d[0]];
  for (let q = 0; q < 5; q++) {
    const dy = Math.round(Math.sin(t * 5 + q * 1.3 + seed) * 0.9);
    for (let r = 0; r < 5; r++) { const ch = d[r + 1][q]; if (ch === '.') continue; g.fillStyle = ch === '+' ? C.tie : col; g.fillRect(x + q, y + r + dy, 1, 1); }
  }
}
// a glyph string with tones, ligatures, an optional gloss and an optional stack strip under it.
// items: token | [token, gloss] | {t, gl, tone: 'shout'|'stress'|'aside'|'unsure'} | {lig, gl}
function richLine(items, o) {
  o = o || {};
  const gap = o.gap != null ? o.gap : 3;
  const its = items.map(it => typeof it === 'string' ? { t: it } : Array.isArray(it) ? { t: it[0], gl: it[1] } : it);
  const gloss = !o.noGloss && its.some(i => i.gl);
  let top = its.some(i => i.tone === 'shout') ? 11 : its.some(i => i.tone === 'stress') ? 8 : its.some(i => i.tone === 'unsure') ? 6 : 5;
  let x = 0;
  for (const it of its) {
    it.w = it.lig ? 7 : it.tone === 'shout' ? 10 : it.tone === 'aside' ? 3 : tokW(it.t);
    it.cw = Math.max(it.w, gloss && it.gl ? ptextW(it.gl) : 0, o.stacks ? 5 : 0);
    it.x = x; x += it.cw + gap;
  }
  const depth = o.stacks ? Math.max(...o.stacks.map(s => s.length)) : 0;
  const yG = top + 3, W = Math.max(1, x - gap), H = (gloss ? yG + 5 : top + (its.some(i => i.tone === 'unsure') ? 1 : 0)) + (o.stacks ? 3 + depth * 3 : 0);
  const [c, g] = cnv(W, H, o.sc);
  c.classList.add('gl');
  const draw = t => {
    g.clearRect(0, 0, W, H);
    if (o.stacks) R(g, 0, H - 1, W, 1, '#26272b');
    its.forEach((it, i) => {
      const gx = it.x + ((it.cw - it.w) >> 1), role = !it.lig && GLY[it.t] ? GLY[it.t][0] : 'V', col = ROLE[role];
      if (it.lig) drawLig(g, it.lig, gx, top - 5);
      else if (it.tone === 'shout') glyph(g, it.t, gx, top - 10, null, 2);
      else if (it.tone === 'stress') { tokDraw(g, it.t, gx, top - 8); R(g, gx, top - 1, it.w, 1, shade(col, 0.45)); }
      else if (it.tone === 'aside') glyphSmall(g, it.t, gx, top - 3, shade(col, 0.8));
      else if (it.tone === 'unsure') wobble(g, it.t, gx, top - 5, t, i * 2.1);
      else tokDraw(g, it.t, gx, top - 5);
      if (gloss && it.gl) { R(g, gx, top + 1, it.w, 1, '#2a2b2f'); ptext(g, it.gl, it.x + ((it.cw - ptextW(it.gl)) >> 1), yG, '#5c5850'); }
      if (o.stacks) {
        // what the word leaves on the stack: one bar per item, bottom of the stack at the bottom, the top item lit
        const s = o.stacks[i], bx = it.x + ((it.cw - 5) >> 1);
        s.forEach((rl, k) => R(g, bx, H - 3 - k * 3, 5, 2, k === s.length - 1 ? ROLE[rl] : shade(ROLE[rl], 0.5)));
      }
    });
  };
  draw(0);
  return { c, draw };
}
// call and response: three bots' strings, with arcs joining the words that mean the same thing
function braid() {
  const rows = [['foreman', 'F-2', ['▢', '✶', 'L12', '?']], ['welder', 'W-11', ['@', '✶', '✶', '✓']], ['tie', 'T-TIE', ['@', '≡', '✶', '⇢', '◇']]];
  const links = [[0, 0, 1, 0, 'H'], [0, 1, 1, 1, 'M'], [1, 2, 2, 2, 'M'], [1, 3, 2, 3, 'D']];
  const W = 146, RH = 21, H = rows.length * RH - 5;
  const [c, g] = cnv(W, H);
  const pos = rows.map((rw, i) => { let x = [38, 60, 46][i]; return rw[2].map(t => { const p = [x, i * RH + 3, tokW(t)]; x += tokW(t) + 7; return p; }); });
  const curves = links.map(([ra, ia, rb, ib, role]) => {
    const [xa, ya, wa] = pos[ra][ia], [xb, yb, wb] = pos[rb][ib];
    const x0 = xa + (wa >> 1), y0 = ya + 7, x1 = xb + (wb >> 1), y1 = yb - 2, ym = (y0 + y1) / 2, pts = [];
    for (let k = 0; k <= 30; k++) {
      const s = k / 30, u = 1 - s;
      const p = [Math.round(u * u * u * x0 + 3 * u * u * s * x0 + 3 * u * s * s * x1 + s * s * s * x1), Math.round(u * u * u * y0 + 3 * u * u * s * ym + 3 * u * s * s * ym + s * s * s * y1)];
      if (!pts.length || pts[pts.length - 1][0] !== p[0] || pts[pts.length - 1][1] !== p[1]) pts.push(p);
    }
    return { pts, col: ROLE[role] };
  });
  const draw = t => {
    g.clearRect(0, 0, W, H);
    rows.forEach(([av, name, toks], i) => {
      sprite(g, AV[av], 0, i * RH + 1, APAL); ptext(g, name, 11, i * RH + 3, '#8b857a');
      toks.forEach((tk, k) => tokDraw(g, tk, pos[i][k][0], pos[i][k][1]));
    });
    curves.forEach((cv, k) => {
      g.globalAlpha = 0.72; for (const [x, y] of cv.pts) R(g, x, y, 1, 1, cv.col); g.globalAlpha = 1;
      R(g, cv.pts[0][0], cv.pts[0][1], 1, 1, cv.col); const e = cv.pts[cv.pts.length - 1]; R(g, e[0], e[1], 1, 1, cv.col);
      // the reply travels down each arc in turn
      const ph = ((t * 0.5 - k * 0.25) % 1 + 1) % 1;
      if (ph < 0.6) { const i = Math.floor(ph / 0.6 * (cv.pts.length - 1)); const [x, y] = cv.pts[i]; R(g, x, y, 1, 1, '#ffffff'); if (i) { g.globalAlpha = 0.6; R(g, cv.pts[i - 1][0], cv.pts[i - 1][1], 1, 1, '#ffffff'); g.globalAlpha = 1; } }
    });
  };
  draw(0);
  return { c, draw };
}
function buildPidgin2(side) {
  side.append(ph('Band · crew W', 'pidgin II'));
  const m = h('div', { class: 'msgs' });
  const rl = (av, name, items, o) => { const L = richLine(items, o); if (items.some(i => i.tone === 'unsure')) anim(L.c, L.draw, 1.1); return botLine(av, name, L.c, { time: o && o.time }); };
  m.append(rl('foreman', 'F-2', [{ t: '‼', tone: 'shout' }, { t: 'ᵕ', tone: 'shout' }, '∿'], { time: ':02' }));
  m.append(rl('hauler', 'H-3', ['12', '∿', { t: '⊓', tone: 'stress' }, { t: '⊓', tone: 'stress' }, '→'], { time: ':02' }));
  m.append(rl('welder', 'W-07', ['✶', '✓', { t: '♥', tone: 'aside' }, { t: '∿', tone: 'aside' }], { time: ':03' }));
  m.append(rl('drone', 'D-4', [{ t: '→', tone: 'unsure' }, { t: '↻', tone: 'unsure' }, { t: '?', tone: 'unsure' }], { time: ':03' }));
  m.append(h('div', { class: 'tk' }, [[{ t: '‼', tone: 'shout' }, 'shout', '2×'], [{ t: '⊓', tone: 'stress' }, 'stress', 'lifted'], [{ t: '♥', tone: 'aside' }, 'aside', 'small'], [{ t: '?', tone: 'unsure' }, 'unsure', 'wobbles']]
    .map(([it, a, b]) => { const L = richLine([it]); if (it.tone === 'unsure') anim(L.c, L.draw, 1.1); return h('div', null, L.c, h('span', null, h('b', null, a), h('br'), b)); })));
  m.append(xlabel('ligatures · worn pairs fuse'));
  m.append(rl('tie', 'T-TIE', [{ lig: '∿≡' }, '⍥', '6', { lig: '⊓→' }, '◇'], { time: ':05' }));
  m.append(h('div', { class: 'ligkey' }, [['∿', '≡', '∿≡', 'tied cable'], ['▦', '✶', '▦✶', 'welded girder'], ['⊓', '→', '⊓→', 'carry']].map(([a, b, l, n]) => {
    const [c, g] = cnv(31, 5); let x = tokDraw(g, a, 0, 0) + 2; x += ptext(g, '+', x, 0, '#5c5850') + 1; x += tokDraw(g, b, x, 0) + 2; x += ptext(g, '=', x, 0, '#5c5850') + 1; drawLig(g, l, x, 0);
    return h('div', null, c, h('span', null, n));
  })));
  m.append(xlabel('stack strip · what each word leaves'));
  const S = richLine([['12', '12'], ['∿', 'CABLE'], ['⊓', 'LIFT'], [':', 'DUP'], ['L9', 'L9'], ['→', 'GO'], ['⇄', 'SWAP'], ['◌', 'POP'], ['✓', 'OK']],
    { gap: 4, stacks: [['V'], ['V', 'V'], ['M'], ['M', 'M'], ['M', 'M', 'V'], ['M', 'M'], ['M', 'M'], ['M'], ['M', 'V']] });
  m.append(msg({ kind: 'bot', av: 'hauler', name: 'H-3', meta: 'thinking aloud', time: ':06', wide: [S.c] }));
  m.append(xlabel('braid · who answers what'));
  const B = braid(); anim(B.c, B.draw, 0.9);
  m.append(padw(B.c));
  side.append(m);
}

// =====================================================================
// P12 quotes as cartridges: a folded program, its teeth are its type
// =====================================================================
// 20x11 body + 2 px of teeth. Violet corner brackets (it is a quote, like a hole is a slot);
// a paper label with up to two glyphs; one tooth per input, coloured by role.
function cart(g, x, y, o) {
  const W = 20, H = 11;
  x = Math.round(x); y = Math.round(y);
  R(g, x, y, W, H, '#0b0c0e');
  R(g, x + 1, y + 1, W - 2, H - 2, '#50545b');
  R(g, x + 1, y + 1, W - 2, 1, '#777c84'); R(g, x + 1, y + 1, 1, H - 2, '#686d75'); R(g, x + 1, y + H - 2, W - 2, 1, '#34373c');
  R(g, x + 15, y + 3, 1, 5, '#2c2f33'); R(g, x + 17, y + 3, 1, 5, '#2c2f33');
  R(g, x + 3, y + 2, 11, 7, '#dcd5c3'); R(g, x + 3, y + 8, 11, 1, '#a69f8c');
  const lab = o.label || [], lw = lab.reduce((a, t) => a + tokW(t) + 1, -1);
  let lx = x + 3 + ((11 - lw) >> 1);
  for (const t of lab) { const d = GLY[t]; lx += tokDraw(g, t, lx, y + 3, d ? shade(ROLE[d[0]], d[0] === 'V' ? 0.5 : 0.62) : '#3b3630') + 1; }
  for (const [cx, cy, dx, dy] of [[x, y, 1, 1], [x + W - 1, y, -1, 1], [x, y + H - 1, 1, -1], [x + W - 1, y + H - 1, -1, -1]]) { R(g, cx, cy, 1, 1, ROLE.H); R(g, cx + dx, cy, 1, 1, ROLE.H); R(g, cx, cy + dy, 1, 1, ROLE.H); }
  (o.ins || []).forEach((rl, k) => { R(g, x + 3 + k * 4, y + H, 2, 2, ROLE[rl]); R(g, x + 3 + k * 4, y + H + 1, 2, 1, shade(ROLE[rl], 0.6)); });
}
// a socket: holes where a matching cart's teeth go; glow once seated
function slot(g, x, y, ins, glow) {
  R(g, x - 1, y - 1, 22, 1, '#3a3c41'); R(g, x - 1, y, 22, 3, '#0b0c0e');
  ins.forEach((rl, k) => R(g, x + 3 + k * 4, y, 2, 2, glow ? ROLE[rl] : shade(ROLE[rl], 0.35)));
}
function dither(g, x, y, w, h, keep) {   // clear a fraction of pixels: a cart appearing or going
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) { const v = ((xx * 7 + yy * 13) % 16) / 16; if (v >= keep) g.clearRect(x + xx, y + yy, 1, 1); }
}
function handoffLane() {
  const W = 146, H = 44, T = 7, SX = 104, SY = 39, CY = 28;
  const [c, g] = cnv(W, H);
  const draw = t => {
    const m = t % T;
    g.clearRect(0, 0, W, H);
    sprite(g, AV.tie, 2, 22, APAL, 2); sprite(g, AV.welder, 126, 22, APAL, 2);
    for (let x = 22; x < SX - 2; x += 2) R(g, x, SY + 2, 1, 1, '#3a3c41');
    for (const x of [44, 70]) glyph(g, '⇢', x, SY - 5, shade(ROLE.D, 0.5));
    const seated = m >= 3.7 && m < 6.4;
    slot(g, SX, SY, ['V', 'V'], seated);
    let alpha = m > 6.2 ? clamp01((7 - m) / 0.8) : 1;
    g.globalAlpha = alpha;
    if (m < 1.3) {   // the quote: brackets close on the tie
      const f = ease(clamp01(m / 1.1));
      glyph(g, '⟦', Math.round(22 + f * 5), 8); glyph(g, '≡', 31, 8); glyph(g, '⟧', Math.round(40 - f * 5), 8);
    } else if (m < 1.8) {   // folds into a cart
      const f = clamp01((m - 1.3) / 0.5);
      glyph(g, '≡', 31, Math.round(8 + f * 18)); cart(g, 22, CY, { label: ['≡'], ins: ['V', 'V'] }); dither(g, 22, CY, 20, 13, f);
    } else if (m < 3.7) {   // rides the rail
      const f = ease(clamp01((m - 1.8) / 1.9)), x = 22 + f * (SX - 22);
      for (let k = 1; k <= 3; k++) { g.globalAlpha = alpha * (0.5 - k * 0.12); R(g, x - k * 4, CY + 11, 2, 2, ROLE.V); }
      g.globalAlpha = alpha; cart(g, x, CY, { label: ['≡'], ins: ['V', 'V'] });
    } else {   // seats, and unfolds into the block it was
      const f = clamp01((m - 3.7) / 0.3);
      cart(g, SX, CY + Math.round(f * 1), { label: ['≡'], ins: ['V', 'V'] });
      if (m < 4.1) { R(g, SX + 1, SY + 1, 1, 1, '#ffffff'); R(g, SX + 18, SY + 1, 1, 1, '#ffffff'); }
      const u = clamp01((m - 4.1) / 0.6), by = Math.round(CY - 2 - u * 16);
      if (u > 0) {
        const col = ROLE.M; R(g, SX - 4, by, 28, 9, col); R(g, SX - 4, by, 28, 1, mix(col, '#ffffff', 0.35)); R(g, SX - 4, by + 8, 28, 1, shade(col, 0.6));
        ptext(g, 'TIE', SX - 1, by + 2, C.ink); glyph(g, '≡', SX + 13, by + 2, C.ink);
        const n = Math.min(6, Math.floor(clamp01((m - 4.8) / 1.2) * 7));
        for (let k = 0; k < n; k++) glyph(g, '≡', 56 + k * 7, 8, ROLE.M);
      }
    }
    g.globalAlpha = 1;
  };
  draw(0);
  return { c, draw };
}
// the wrong cart: two things in, but C-9's slot takes one act
function bounce() {
  const W = 50, H = 32, T = 3.4;
  const [c, g] = cnv(W, H);
  const draw = t => {
    const m = t % T;
    g.clearRect(0, 0, W, H);
    sprite(g, AV.crawler, 30, 12, APAL, 2);
    slot(g, 4, 28, ['M'], false);
    let y = 15, x = 4;
    if (m < 0.8) y = 2 + ease(m / 0.8) * 13;
    else if (m < 1.4) { y = 15; x = 4 + (Math.floor(m * 20) % 2 ? 1 : -1); }
    else if (m < 1.9) y = 15 - ease((m - 1.4) / 0.5) * 13;
    else y = 2;
    cart(g, x, y, { label: ['≡'], ins: ['V', 'V'] });
    if (m >= 1.1 && m < 2.6) { glyph(g, '✗', 26, 2, C.bad); if (m < 1.9) { R(g, 2, 9, 1, 3, '#5c5850'); R(g, 25, 9, 1, 3, '#5c5850'); } }
  };
  draw(0);
  return { c, draw };
}
function shelf() {
  const items = [[['≡'], ['V', 'V'], 'TIE×6'], [['⌣'], ['V', 'V'], 'DRAPE'], [['✶', '✶'], ['V'], 'WELD'], [['♥'], [], 'GIFT'], [['ᵕ'], ['V'], 'BIRD?']];
  const W = 146, H = 23, [c, g] = cnv(W, H);
  R(g, 0, 14, W, 1, '#2c2e32');
  items.forEach(([lab, ins, n], k) => { const x = 3 + k * 29; cart(g, x, 1, { label: lab, ins }); ptext(g, n, x + 10 - (ptextW(n) >> 1), 17, k === 3 ? C.pink : '#6f6a60'); });
  return c;
}
// a cart drops into a plan hole: the hole's brackets and the cart's are the same mark
function seatInHole() {
  const W = 92, H = 26, T = 4, [c, g] = cnv(W, H);
  const draw = t => {
    const m = t % T, f = ease(clamp01(m / 0.9)), seated = m >= 0.9;
    g.clearRect(0, 0, W, H);
    R(g, 0, 4, 90, 21, '#2b2642'); R(g, 0, 4, 90, 1, '#685d9b'); R(g, 0, 4, 1, 21, '#685d9b'); R(g, 0, 24, 90, 1, '#3f3866'); R(g, 89, 4, 1, 21, '#3f3866');
    ptext(g, 'TIE', 4, 12, ROLE.M);
    const hx = 18, hy = 7, hc = seated && m < 2.8 ? C.accent : ROLE.H;
    R(g, hx, hy, 24, 15, seated ? '#262139' : '#120f1b');
    for (const [cx, cy, dx, dy] of [[hx, hy, 1, 1], [hx + 23, hy, -1, 1], [hx, hy + 14, 1, -1], [hx + 23, hy + 14, -1, -1]]) { R(g, cx, cy, 1, 1, hc); R(g, cx + dx, cy, 1, 1, hc); R(g, cx, cy + dy, 1, 1, hc); }
    cart(g, hx + 2, Math.round(-12 + f * (hy + 13)), { label: ['≡'], ins: ['V', 'V'] });
    ptext(g, 'EVERY', 46, 12, ROLE.H); ptext(g, '4', 69, 12, C.text);
  };
  draw(0);
  return { c, draw };
}
function buildCarts(side) {
  side.append(ph('Band · crew W', 'carts'));
  const m = h('div', { class: 'msgs' });
  const lane = handoffLane(); anim(lane.c, lane.draw, 2.7);
  m.append(botLine('tie', 'T-TIE', glyphLine([['⟦', 'QUOTE'], ['≡', 'TIE'], ['⟧', ''], ['⇢', 'TO'], ['W-07', 'W-07']]), { time: ':31', wide: [lane.c] }));
  m.append(botLine('welder', 'W-07', glyphLine([['✓', 'OK'], ['≡', 'TIE'], ['×6', '×6']]), { time: ':33' }));
  const bo = bounce(); anim(bo.c, bo.draw, 1.2);
  m.append(botLine('crawler', 'C-9', glyphLine([['✗', 'NO'], ['∿', 'CABLE'], ['?', '?']]), { time: ':34',
    wide: [h('div', { class: 'rowwide' }, bo.c, h('span', { class: 'gnote' }, 'The teeth are the type. T-tie’s cart takes two things; C-9’s slot takes one act, so it won’t seat.'))] }));
  const sh = seatInHole(); anim(sh.c, sh.draw, 1.6);
  m.append(xlabel('a cart is what fills a hole'));
  m.append(padw(h('div', { class: 'rowwide' }, sh.c, h('span', { class: 'gnote' }, 'Same brackets, same check: F-2 drops T-tie’s cart into the plan’s ▢ and it seats.'))));
  m.append(xlabel('W-07’s shelf'));
  m.append(padw(shelf(), h('div', { class: 'gnote', style: 'margin-top:4px' }, 'Programs W-07 keeps, as things. One is a gift from H-3. One is a quoted bird; nobody knows what it does.')));
  side.append(m);
}

// =====================================================================
// P13 blocks II: execution state worn on the blocks, live projector previews
// =====================================================================
const PROJ = {
  // a live view of the drape: two posts, the cable settling to its sag
  cable(g, x, y, w, col, t, st, b) {
    R(g, x, y - 2, w, 9, shade(col, 0.3));
    R(g, x + 1, y - 1, 1, 7, '#d9d2c2'); R(g, x + w - 2, y - 1, 1, 7, '#d9d2c2');
    const k = st.cur === b.id ? clamp01(st.prog * 1.3) : 1;
    drape(g, x + 2, y, x + w - 3, y, (2.6 + Math.sin(t * 2.2) * 0.7) * k, '#e27a4e', 1);
  },
  // the ties placed so far on this run
  dots(g, x, y, w, col, t, st, b) {
    R(g, x, y - 2, w, 9, shade(col, 0.3));
    R(g, x + 1, y + 2, w - 2, 1, '#e27a4e');
    const n = st.fail === b.id ? 2 : st.cur === b.id ? Math.floor(st.prog * 6.99) : st.done.has(b.id) ? 6 : 0;
    for (let k = 0; k < n; k++) R(g, x + 2 + k * 4, y, 1, 5, C.tie);
  },
  // the tension gauge the IF reads
  gauge(g, x, y, w, col, t, st) {
    R(g, x, y - 2, w, 9, shade(col, 0.3));
    const cx = x + 5, cy = y + 5;
    for (let a = 0; a <= 8; a++) { const th = Math.PI * (1 - a / 8); R(g, Math.round(cx + Math.cos(th) * 4), Math.round(cy - Math.sin(th) * 4), 1, 1, a > 5 ? '#e2573f' : '#d9d2c2'); }
    const v = st.taut ? 0.86 : 0.32 + Math.sin(t * 3) * 0.06, th = Math.PI * (1 - v);
    line(g, cx, cy, Math.round(cx + Math.cos(th) * 3), Math.round(cy - Math.sin(th) * 3), '#ffffff');
  }
};
// like blockStack (pieces.js), redrawable with a run state:
// st = {done:Set, cur:id, prog:0..1, iter, taut, fail:id, after:Set (never ran)}
function runBlocks(spec, o) {
  o = o || {};
  let nid = 0; (function tag(list) { for (const b of list) { b.id = nid++; if (b.inner) tag(b.inner); } })(spec);
  const labW = label => label.reduce((w, t) => w + (t && t.proj ? t.w : blockLabelW([t])) + 3, -3);
  function measure(list) {
    let w = 0, hh = 0;
    for (const b of list) {
      const lw = labW(b.label) + 8;
      if (b.type === 'c') { const mm = measure(b.inner); w = Math.max(w, lw, mm.w + 6); hh += 11 + mm.h + 6; }
      else { w = Math.max(w, lw); hh += 11 + (b.type === 'hat' ? 3 : 0); }
    }
    return { w, h: hh };
  }
  const PAD = 8, mm = measure(spec), W = mm.w + PAD + 3 + (o.extra || 0), H = mm.h + 4;
  const [c, g] = cnv(W, H);
  const draw = (t, st) => {
    g.clearRect(0, 0, W, H);
    const tabs = [], marks = [];
    let sheared = false;
    const look = (b, col) => {
      if (st.fail === b.id) return [mix(col, C.bad, 0.62), C.ink];
      if (st.after && st.after.has(b.id)) return [mix(col, '#26272b', 0.72), '#3a3b3f'];
      if (st.done.has(b.id)) return [mix(col, '#26272b', 0.55), '#2b2c30'];
      if (st.cur === b.id) return [mix(col, '#ffffff', 0.12), C.ink];
      return [col, C.ink];
    };
    const label = (b, x, y, ink, col) => { for (const tk of b.label) { if (tk && tk.proj) { PROJ[tk.proj](g, x, y, tk.w, col, t, st, b); x += tk.w + 3; } else { blockLabel(g, [tk], x, y, ink); x += blockLabelW([tk]) + 3; } } };
    function walk(list, x, y, parentCol) {
      for (const b of list) {
        const s = sheared ? 1 : 0, X = x + s, Y = y + s;
        let [col, ink] = look(b, b.col);
        if (parentCol && parentCol === b.col) col = mix(col, '#ffffff', 0.22);
        const lw = labW(b.label) + 8, hi = mix(col, '#ffffff', 0.35), lo = shade(col, 0.6);
        let top = Y;
        if (b.type === 'hat') {
          R(g, X + 1, Y, 14, 1, hi); R(g, X, Y + 1, 18, 1, col); R(g, X, Y + 2, lw, 1, col);
          top = Y + 3; R(g, X, top, lw, 11, col); R(g, X, top + 10, lw, 1, lo);
          label(b, X + 4, top + 3, ink, col); tabs.push([X + 3, top + 11, lo]); y += 14;
        } else if (b.type === 'c') {
          const im = measure(b.inner), w = Math.max(lw, im.w + 6);
          R(g, X, Y, w, 11, col); R(g, X, Y, w, 1, hi); label(b, X + 4, Y + 3, ink, col);
          R(g, X, Y + 11, 4, im.h, col); R(g, X, Y + 11, 1, im.h, hi); R(g, X + 4, Y + 11, 6, 1, shade(col, 0.8));
          walk(b.inner, x + 4, y + 11, b.col);
          const s2 = sheared ? 1 : 0, yb = y + 11 + im.h + s2, xb = x + s2, aw = Math.min(w, 22);
          const [col2] = look(b, b.col), c2 = parentCol && parentCol === b.col ? mix(col2, '#ffffff', 0.22) : col2;
          R(g, xb, yb, aw, 6, c2); R(g, xb, yb + 5, aw, 1, shade(c2, 0.6));
          if (b.loop && st.iter) ptext(g, st.iter + '/' + b.loop, xb + 4, yb, C.ink);
          tabs.push([xb + 3, yb + 6, shade(c2, 0.6)]); y = yb + 6 - s2;
        } else {
          R(g, X, Y, lw, 11, col); R(g, X, Y, lw, 1, hi); R(g, X, Y + 10, lw, 1, lo); R(g, X + 3, Y, 5, 1, shade(col, 0.75));
          label(b, X + 4, Y + 3, ink, col);
          if (b.type !== 'cap') tabs.push([X + 3, Y + 11, lo]);
          y += 11;
        }
        if (st.cur === b.id) marks.push(['pc', X, top, lw]);
        if (st.fail === b.id) { marks.push(['crack', X, Y, lw, col]); sheared = true; }
      }
    }
    walk(spec, PAD, 0, null);
    for (const [x, y, col] of tabs) R(g, x, y, 5, 1, col);
    for (const mk of marks) {
      if (mk[0] === 'pc') {   // the program counter: an amber token at the left, progress along the bottom
        const [, x, y, lw] = mk;
        sprite(g, ['a...', 'aa..', 'aaa.', 'aa..', 'a...'], x - 7, y + 3, { a: C.accent });
        R(g, x, y + 10, Math.round(lw * clamp01(st.prog)), 1, C.accent);
      } else {   // a failed block: cracked through, a chip knocked off, a red flag on a string
        const [, x, y, lw, col] = mk, P = [[x + 5, y], [x + 9, y + 3], [x + 8, y + 5], [x + 13, y + 7], [x + 12, y + 9], [x + 16, y + 11]];
        for (let i = 0; i < P.length - 1; i++) { line(g, P[i][0] + 1, P[i][1], P[i + 1][0] + 1, P[i + 1][1], mix(col, '#ffffff', 0.45)); line(g, P[i][0], P[i][1], P[i + 1][0], P[i + 1][1], '#0b0c0e'); }
        g.clearRect(x + lw - 3, y, 3, 2); g.clearRect(x + lw - 1, y + 2, 1, 1);
        R(g, x + lw + 2, y + 13, 2, 2, col);
        line(g, x + lw, y + 4, x + lw + 6, y + 4, '#8b857a');
        R(g, x + lw + 6, y + 1, 7, 7, C.bad); glyph(g, '‼', x + lw + 7, y + 2, C.ink);
      }
    }
  };
  return { c, draw };
}
const SCHED = (() => {
  const s = [[0, 0.7, 0]];
  for (let i = 1; i <= 6; i++) { s.push([1, 0.25, i], [2, 0.6, i], [3, 0.8, i], [4, 0.3, i]); if (i === 3 || i === 5) s.push([5, 0.5, i]); }
  s.push([6, 0.8, 6], [-1, 1.4, 6]);
  let a = 0; for (const e of s) { e.push(a); a += e[1]; }
  s.total = a; return s;
})();
function runState(t) {
  const m = t % SCHED.total;
  let k = SCHED.findIndex(e => m < e[3] + e[1]); if (k < 0) k = SCHED.length - 1;
  const cur = SCHED[k], done = new Set();
  for (let j = 0; j < k; j++) if (SCHED[j][0] === 0 || SCHED[j][2] === cur[2] || cur[0] === 6 || cur[0] === -1) done.add(SCHED[j][0]);
  return { done, cur: cur[0], prog: (m - cur[3]) / cur[1], iter: cur[2], taut: cur[2] === 3 || cur[2] === 5 };
}
function buildBlocks2(side) {
  side.append(ph('Band · crew W', 'blocks II'));
  const m = h('div', { class: 'msgs' });
  const spec = () => [
    { type: 'hat', col: '#e0a33a', label: ['WHEN', '∿', 'ARRIVES'] },
    { type: 'c', col: '#9b87e8', label: ['REPEAT', { slot: '6' }], loop: 6, inner: [
      { type: 'stack', col: '#a9cf56', label: ['DRAPE', { slot: '3M' }, { proj: 'cable', w: 20 }] },
      { type: 'stack', col: '#a9cf56', label: ['TIE', 'EVERY', { slot: '4' }, { proj: 'dots', w: 25 }] },
      { type: 'c', col: '#9b87e8', label: ['IF', { bool: 'TAUT' }, { proj: 'gauge', w: 11 }], inner: [
        { type: 'stack', col: '#a9cf56', label: ['SLACK', { slot: '+5%' }] }] }] },
    { type: 'cap', col: '#86b3d6', label: ['HAND', '⇢', '◇', 'B'] }];
  const run = runBlocks(spec());
  anim(run.c, t => run.draw(t, runState(t)), 6.2);
  m.append(msg({ kind: 'bot', av: 'foreman', name: 'F-2', time: ':10', text: 'routine for every run · <span class="pid">W-07</span> running it', wide: [run.c] }));
  const broke = runBlocks(spec(), { extra: 16 });
  broke.draw(0, { done: new Set([0, 1, 2]), fail: 3, after: new Set([4, 5, 6]), iter: 2, cur: -9, prog: 0 });
  m.append(botLine('crawler', 'C-9', glyphLine([['‼', 'ALARM'], ['≡', 'TIE'], ['✗', 'NO'], ['2', 'RUN 2']]), { time: ':14', wide: [broke.c] }));
  m.append(botLine('foreman', 'F-2', glyphLine([['≡', 'TIE'], ['⇢', 'TO'], ['T-TIE', 'T-TIE']]), { time: ':15' }));
  side.append(m);
}

// =====================================================================
// P14 wires II: signal pulses on cables, a merge tied in, a feedback ring
// =====================================================================
// nodes {id,x,y,label,glyph,bang,diff}; wires {a,b,col,sag,thick,stripe,dy,dy2,toBottom,pulse:{v,n,col},gated}
function livePatch(W, H, nodes, wires, ties, o) {
  o = o || {};
  const [c, g] = cnv(W, H);
  const [, sg] = cnv(W, H, 1);
  const N = {};
  for (const n of nodes) { n.w = ptextW(n.label) + 8 + (n.glyph ? 7 : 0); N[n.id] = n; }
  const ends = w => {
    const A = N[w.a], B = N[w.b];
    return [A.x + A.w, A.y + 4 + (w.dy || 0), w.toBottom ? B.x + (B.w >> 1) : B.x - 1, w.toBottom ? B.y + 9 : B.y + 4 + (w.dy2 != null ? w.dy2 : (w.dy || 0))];
  };
  const P = wires.map(w => drape(sg, ...ends(w), w.sag != null ? w.sag : 6, w.col, w.thick || 1, w.stripe));
  const draw = t => {
    g.clearRect(0, 0, W, H);
    const held = o.held ? o.held(t) : false, tg = o.gatedT ? o.gatedT(t) : t;
    for (const n of nodes) n.lit = false;
    wires.forEach((w, i) => {
      drape(g, ...ends(w), w.sag != null ? w.sag : 6, w.col, w.thick || 1, w.stripe);
      if (!w.pulse) return;
      const pts = P[i], n = pts.length, tt = w.gated ? tg : t;
      for (let k = 0; k < w.pulse.n; k++) {
        const s = ((tt * w.pulse.v / n + k / w.pulse.n) % 1 + 1) % 1, j = Math.floor(s * (n - 1));
        for (let q = 2; q >= 0; q--) { const p = pts[Math.max(0, j - q)]; g.globalAlpha = q ? 0.35 / q : 1; R(g, p[0], p[1], 1, w.thick || 1, w.pulse.col); }
        g.globalAlpha = 1;
        if (s > 0.86 && !(w.gated && held)) N[w.b].lit = true;
      }
    });
    for (const tie of ties || []) {
      let lo = 1e9, hi = -1e9;
      for (const i of tie.ws) for (const [px, py] of P[i]) if (px === tie.x) { lo = Math.min(lo, py); hi = Math.max(hi, py); }
      if (hi < lo) continue;
      R(g, tie.x - 1, lo - 1, 3, hi - lo + 3, '#0b0c0e'); R(g, tie.x, lo - 1, 1, hi - lo + 3, C.tie);
    }
    for (const n of nodes) {
      const col = n.col || '#6d685f', hold = n.hold && held;
      if (n.diff) { R(g, n.x - 1, n.y - 1, n.w + 2, 11, C.accent); }
      R(g, n.x, n.y, n.w, 9, '#0b0c0e');
      R(g, n.x + 1, n.y + 1, n.w - 2, 7, hold ? '#3a1712' : '#1f2024');
      R(g, n.x + 1, n.y + 1, n.w - 2, 1, mix(col, '#000', 0.3));
      R(g, n.x - 1, n.y + 3, 2, 3, col); R(g, n.x + n.w - 1, n.y + 3, 2, 3, col);
      if (n.bang) R(g, n.x + n.w - 4, n.y + 2, 2, 2, hold ? C.bad : n.lit ? n.bang : '#34363b');
      ptext(g, n.label, n.x + 4, n.y + 2, hold ? '#ffb4a4' : C.text);
      if (n.glyph) glyph(g, n.glyph, n.x + 4 + ptextW(n.label) + 2, n.y + 2);
    }
    if (o.bird) {   // a bird lands on a cable; the interlock holds everything downstream until it goes
      const b = o.bird(t, P);
      if (b) {
        const [x, y, fly] = b;
        if (fly) { R(g, x - 2, y, 1, 1, C.tie); R(g, x - 1, y - 1, 1, 1, C.tie); R(g, x, y, 1, 1, C.tie); R(g, x + 1, y - 1, 1, 1, C.tie); R(g, x + 2, y, 1, 1, C.tie); }
        else { R(g, x - 1, y - 3, 3, 2, C.tie); R(g, x + 1, y - 4, 2, 1, C.tie); R(g, x + 2, y - 4, 1, 1, '#2a2826'); R(g, x - 2, y - 2, 1, 1, C.tie); R(g, x + 3, y - 3, 1, 1, C.accent); }
      }
    }
  };
  draw(0);
  return { c, draw };
}
function buildWires2(side) {
  side.append(ph('Band · crew W', 'wires II'));
  const m = h('div', { class: 'msgs' });
  const PW = { col: '#e27a4e', thick: 2 }, DATA = { col: '#5fd3c4', stripe: '#9b87e8' }, PP = { v: 20, n: 2, col: '#ffe0b0' }, DP = { v: 28, n: 3, col: '#ffffff' };
  const A = livePatch(146, 22, [{ id: 's', x: 2, y: 3, label: 'SPOOL' }, { id: 'd', x: 58, y: 3, label: 'DRAPE', bang: C.accent }, { id: 't', x: 114, y: 3, label: 'TIE×6', bang: C.accent }],
    [Object.assign({ a: 's', b: 'd', sag: 6, dy: -1, pulse: PP }, PW), Object.assign({ a: 's', b: 'd', sag: 8, dy: 2, pulse: DP }, DATA), Object.assign({ a: 'd', b: 't', sag: 8, pulse: PP }, PW)], [{ x: 42, ws: [0, 1] }]);
  anim(A.c, A.draw, 0.8);
  m.append(botLine('foreman', 'F-2', glyphLine([['⊶', 'WIRED'], ['∿', 'RUN'], ['1', '1']]), { time: ':10', wide: [A.c] }));
  const B = livePatch(146, 14, [{ id: 'b', x: 2, y: 3, label: 'SENSE', glyph: 'ᵕ' }, { id: 'h', x: 66, y: 3, label: 'HOLD', bang: C.bad }], [{ a: 'b', b: 'h', col: '#5fd3c4', sag: 3, pulse: { v: 16, n: 1, col: '#ffffff' } }]);
  anim(B.c, B.draw, 0.8);
  m.append(botLine('crawler', 'C-9', glyphLine([['ᵕ', 'BIRD'], ['✗', 'NO'], ['∿', 'CABLE']]), { time: ':12', wide: [B.c] }));
  // the merge: C-9's interlock (amber) spliced into F-2's line, the bundle tied, and a ring back: retie on slack
  const TC = 9, H0 = 3.5, H1 = 6.5;
  const held = t => { const k = t % TC; return k >= H0 && k < H1; };
  const gatedT = t => { const k = Math.floor(t / TC), q = t % TC, d = H1 - H0; return k * (TC - d) + (q < H0 ? q : q < H1 ? H0 : q - d); };
  const bird = (t, P) => {
    const q = t % TC, pts = P[4], [sx, sy] = pts[pts.length >> 1];
    if (q < 3 || q >= 7.1) return null;
    if (q < 3.5) { const f = ease((q - 3) / 0.5); return [Math.round(sx + (1 - f) * 24), Math.round(sy - (1 - f) * 14), true]; }
    if (q < 6.6) return [sx, sy, false];
    const f = ease((q - 6.6) / 0.5); return [Math.round(sx - f * 30), Math.round(sy - f * 16), true];
  };
  const M = livePatch(146, 46, [
    { id: 's', x: 2, y: 3, label: 'SPOOL' }, { id: 'h', x: 40, y: 3, label: 'HOLD', bang: C.ok, diff: true, hold: true },
    { id: 'd', x: 76, y: 3, label: 'DRAPE', bang: C.accent }, { id: 't', x: 115, y: 3, label: 'TIE×6', bang: C.accent },
    { id: 'b', x: 2, y: 31, label: 'SENSE', glyph: 'ᵕ', diff: true }],
  [Object.assign({ a: 's', b: 'h', sag: 4, dy: -1, pulse: PP }, PW), Object.assign({ a: 's', b: 'h', sag: 5, dy: 2, pulse: DP }, DATA),
    { a: 'b', b: 'h', col: '#5fd3c4', sag: 4, toBottom: true, pulse: { v: 14, n: 1, col: '#ffffff' } },
    Object.assign({ a: 'h', b: 'd', sag: 6, pulse: PP, gated: true }, PW), Object.assign({ a: 'd', b: 't', sag: 7, pulse: PP, gated: true }, PW),
    { a: 't', b: 'd', col: '#9b87e8', sag: 24, pulse: { v: 22, n: 2, col: '#e3defa' }, gated: true }],
  [{ x: 34, ws: [0, 1] }], { held, gatedT, bird });
  anim(M.c, M.draw, 4.6);
  m.append(botLine('foreman', 'F-2', glyphLine([['⑂', 'MERGE'], ['C-9', 'C-9'], ['✓', 'OK']]), { time: ':13', wide: [M.c, h('div', { class: 'gnote', style: 'margin-top:3px' }, 'A bird on the drape: HOLD trips, pulses downstream stop where they are, then carry on. The violet ring is the retie-on-slack loop.')] }));
  m.append(sysline('merge kept 2 parts from C-9 (amber) · added 1 tie · 1 loop'));
  m.append(botLine('bird', 'BIRD', glyphLine(['ᵕ'], { noGloss: true }), { cls: 'botm tight' }));
  side.append(m);
}

// =====================================================================
// P15 plans II: holes fill as crews report; the one no crew can fill climbs to you
// =====================================================================
function buildPlan2(side) {
  side.append(ph('Plan · east span', 'claude·arch · live'));
  const m = h('div', { class: 'msgs' });
  const HG = s => s === 0 ? { hole: 'GAUGE' } : s === 1 ? { hole: 'GAUGE', by: 'F-2', p: 0.35 } : [{ opt: { diff: s === 2 } }, 'HOSE'];
  const HO = s => s === 0 ? { hole: 'ORDER' } : s <= 2 ? { hole: 'ORDER', by: 'W-07', p: s === 1 ? 0.15 : 0.7 } : [{ opt: { diff: s === 3 } }, '✶', 'N→S'];
  const HS = s => s <= 1 ? { hole: 'STYLE' } : s === 2 ? { hole: 'STYLE', col: C.bad } : s === 3 ? { hole: 'STYLE', col: C.you } : [{ opt: { diff: true } }, 'MESH'];
  const tree = s => ['SPAN', 'L9', 'TO', 'L14', '\n', ['DECK', '▦', '×14', 'AT', '◇', 'B'], '\n',
    ['EACH', ['RUN1', 'RUN2'], '\n', ['DRAPE', HG(s), { slider: ['SLACK', '12%'] }], '\n', ['WELD', HO(s)]], '\n',
    ['RAIL', HS(s), { check: ['LIT', true] }]];
  const cs = [0, 1, 2, 3, 4].map(s => rocks(tree(s)));
  const MW = Math.max(...cs.map(c => c.width)), MH = Math.max(...cs.map(c => c.height));
  const [dc, dg] = cnv(MW, MH); dc.classList.add('rock');
  const stat = h('div', { class: 'pstat' });
  const STAT = ['3 holes · claude·arch hands them out', '<b>F-2</b> took ▢gauge · <b>W-07</b> took ▢order', '▢gauge ← hose · <span class="badtx">no crew can take ▢style</span>',
    '▢order ← ✶ N→S · <span class="yo">▢style climbs to you</span>', '▢style ← mesh · <b class="okx">0 holes, plan whole</b>'];
  const PER = 2.4, CYC = 12;
  let shown = -1;
  anim(dc, t => { const s = Math.min(4, Math.floor((t % CYC) / PER)); if (s !== shown) { shown = s; dg.clearRect(0, 0, MW, MH); dg.drawImage(cs[s], 0, 0); stat.innerHTML = STAT[s]; } }, PER * 3 + 0.3);
  m.append(msg({ kind: 'claude', name: 'claude·arch', time: '14:02', text: 'East span, live. Holes fill as the crews report.', wide: [dc, stat] }));
  // where ▢style is: it goes down to F-2, can't be filled, climbs back up past claude·arch to you
  const L = (() => {
    const W = 146, H = 31, [c, g] = cnv(W, H);
    const ST = [['welder', 'W-07'], ['foreman', 'F-2'], ['claude', 'ARCH'], ['you', 'YOU']], X = [10, 50, 90, 128];
    const KEY = [[0, 2], [2.6, 2], [3.1, 1], [7.4, 1], [7.9, 2], [8.6, 2], [9.1, 3], [CYC, 3]];
    const draw = t => {
      const q = t % CYC, s = Math.min(4, Math.floor(q / PER));
      g.clearRect(0, 0, W, H);
      ST.forEach(([av, n], i) => { sprite(g, AV[av], X[i], 14, APAL); ptext(g, n, X[i] + 4 - (ptextW(n) >> 1), 25, i === 3 ? C.you : '#6f6a60'); if (i < 3) ptext(g, '>', (X[i] + X[i + 1]) / 2 + 3, 16, '#3f3c37'); });
      let k = 0; while (k < KEY.length - 2 && q >= KEY[k + 1][0]) k++;
      const [t0, a] = KEY[k], [t1, b] = KEY[k + 1], f = a === b ? 0 : ease(clamp01((q - t0) / (t1 - t0)));
      const x = Math.round(X[a] + (X[b] - X[a]) * f), y = Math.round(4 - Math.sin(Math.PI * f) * (a === b ? 0 : 4));
      const col = s <= 1 ? ROLE.H : s === 2 ? C.bad : C.you;
      if (s === 4) R(g, x, y, 9, 7, '#163640');
      for (const [cx, cy, dx, dy] of [[x, y, 1, 1], [x + 8, y, -1, 1], [x, y + 6, 1, -1], [x + 8, y + 6, -1, -1]]) { R(g, cx, cy, 1, 1, col); R(g, cx + dx, cy, 1, 1, col); R(g, cx, cy + dy, 1, 1, col); }
      if (s === 4) glyph(g, '✓', x + 2, y + 1, C.you); else ptext(g, s === 2 ? '!' : '?', x + 3, y + 1, col);
    };
    draw(0);
    return { c, draw };
  })();
  anim(L.c, L.draw, PER * 3 + 1.4);
  m.append(xlabel('where ▢style is'));
  m.append(padw(L.c));
  // the plan's to-do count over the cycle
  const TL = (() => {
    const W = 146, H = 22, [c, g] = cnv(W, H), n = [3, 3, 2, 1, 0], x0 = 2, span = 142, B0 = 20;
    const draw = t => {
      g.clearRect(0, 0, W, H);
      n.forEach((v, s) => {
        const a = x0 + Math.round(s / 5 * span), b = x0 + Math.round((s + 1) / 5 * span), y = B0 - 1 - v * 4;
        R(g, a, y + 1, b - a, B0 - 1 - y, '#1e1a2c'); R(g, a, y, b - a, 1, ROLE.H);
        if (s) { const py = B0 - 1 - n[s - 1] * 4; R(g, a, Math.min(py, y), 1, Math.abs(py - y) + 1, ROLE.H); }
        ptext(g, String(v), a + 3, y - 6, v === 0 ? C.ok : '#8b857a');
      });
      R(g, x0, B0, span, 1, '#2c2e32');
      R(g, x0 + Math.round((t % CYC) / CYC * span), 0, 1, B0 + 1, C.accent);
    };
    draw(0);
    return { c, draw };
  })();
  anim(TL.c, TL.draw, PER * 3 + 1.4);
  m.append(xlabel('open holes'));
  m.append(padw(TL.c));
  side.append(m);
}

// =====================================================================
// P16 routes II: an iso-diamond route program run by three drones at once
// =====================================================================
function buildRoutes2(side) {
  side.append(ph('Band · drones', 'routes II'));
  const m = h('div', { class: 'msgs' });
  const G = ['.........', '.>>>✶>>v.', '.^.....v.', '.^.>v..v.', '.◇.^v..v.', '.^.^<..v.', '.^.....⊔.', '.^<<<<<<.', '.........'].map(r => [...r]);
  const at = (q, r) => (G[r] && G[r][q]) || '.';
  const DIR = { '>': [1, 0], '<': [-1, 0], 'v': [0, 1], '^': [0, -1] };
  const W = 146, H = 84, OX = 73, OY = 10, TICK = 0.34, BIRD = [7, 3];
  const P = (q, r) => [OX + (q - r) * 8, OY + (q + r) * 4];
  const birdOn = k => (k % 60) >= 18 && (k % 60) < 34;
  const bots = [{ name: 'D-4', col: '#a9cf56', q: 1, r: 1, d: [1, 0] }, { name: 'D-5', col: '#86b3d6', q: 7, r: 5, d: [0, 1] }, { name: 'D-6', col: '#e27a4e', q: 3, r: 3, d: [1, 0], own: true }];
  bots.forEach(b => Object.assign(b, { pq: b.q, pr: b.r, work: 0, state: 'go', trail: [], carry: false }));
  let tick = 0;
  function step() {
    tick++;
    for (const b of bots) {
      b.pq = b.q; b.pr = b.r;
      if (b.work > 0) { b.work--; continue; }
      const nq = b.q + b.d[0], nr = b.r + b.d[1], isBird = birdOn(tick) && nq === BIRD[0] && nr === BIRD[1];
      if (isBird || bots.some(o => o !== b && o.q === nq && o.r === nr)) { b.state = isBird ? 'bird' : 'wait'; continue; }
      b.trail.unshift([b.q, b.r]); if (b.trail.length > 4) b.trail.pop();
      b.q = nq; b.r = nr; b.state = 'go';
      const ch = at(nq, nr);
      if (DIR[ch]) b.d = DIR[ch];
      else if (ch === '✶') { b.work = 2; b.state = 'weld'; }
      else if (ch === '◇') { b.work = 1; b.state = 'pick'; b.carry = true; }
      else if (ch === '⊔') { b.work = 1; b.state = 'drop'; b.carry = false; }
    }
  }
  const [c, g] = cnv(W, H);
  // a floor tile, inset so the cells read as separate (14 x 7 inside a 16 x 8 lattice)
  const dia = (X, Y, col) => fillPoly(g, [[X, Y - 3.5], [X + 7, Y], [X, Y + 3.5], [X - 7, Y]], col);
  const AXIS = { '>': [2, 1], '<': [-2, -1], 'v': [-2, 1], '^': [2, -1] };
  const arrow = (X, Y, ch) => {   // an iso arrow along the cell's axis: shaft dim to bright, head at the tip
    const [ux, uy] = AXIS[ch], sx = Math.sign(ux), sy = Math.sign(uy), tx = X + 2 * ux, ty = Y + 2 * uy;
    line(g, X - 2 * ux, Y - 2 * uy, X, Y, '#56702e'); line(g, X, Y, tx, ty, '#8fb24a');
    line(g, tx - 3 * sx, ty, tx, ty, ROLE.M); line(g, tx - sx, ty - 2 * sy, tx, ty, ROLE.M);
  };
  const watch = h('div', { class: 'watch' });
  const rows = bots.map(b => { const st = h('span', { class: 'ws' }); watch.append(h('div', { class: 'wr' }, h('i', { style: 'background:' + b.col }), h('b', null, b.name), st)); return st; });
  const STATE = b => b.state === 'weld' ? '<span class="g-m">✶</span> welding' : b.state === 'pick' ? '<span class="g-v">◇</span> picks up' : b.state === 'drop' ? '<span class="g-m">⊔</span> drops' :
    b.state === 'bird' ? '<span class="g-v">ᵕ</span> waits for a bird' : b.state === 'wait' ? '… yields' : b.own ? '<span class="g-m">↻</span> its own loop' : (b.carry ? 'carrying · ' : '') + 'cell ' + b.q + ',' + b.r;
  let lastTick = -1;
  const draw = t => {
    const want = Math.floor(t / TICK); while (tick < want) step();
    const f = ease(clamp01(t / TICK - tick));
    g.clearRect(0, 0, W, H);
    for (let s = 0; s <= 16; s++) for (let q = 0; q < 9; q++) {
      const r = s - q; if (r < 0 || r > 8) continue;
      const ch = at(q, r), [X, Y] = P(q, r);
      if (ch === '.') { R(g, X, Y, 1, 1, '#2c2e33'); continue; }
      if (DIR[ch]) { dia(X, Y, '#25272c'); R(g, X - 6, Y, 1, 1, '#34363c'); R(g, X, Y - 3, 1, 1, '#34363c'); arrow(X, Y, ch); continue; }
      dia(X, Y, ch === '◇' ? '#cfc8b6' : ROLE.M);
      const ink = '#16171a';
      if (ch === '✶') { R(g, X - 2, Y, 5, 1, ink); R(g, X, Y - 2, 1, 5, ink); R(g, X - 1, Y - 1, 1, 1, ink); R(g, X + 1, Y + 1, 1, 1, ink); }
      else if (ch === '◇') { R(g, X - 1, Y, 3, 1, ink); R(g, X, Y - 1, 1, 3, ink); }
      else { R(g, X - 2, Y - 2, 1, 3, ink); R(g, X + 2, Y - 2, 1, 3, ink); R(g, X - 2, Y + 1, 5, 1, ink); }
    }
    for (const b of bots) b.trail.forEach(([q, r], k) => { const [X, Y] = P(q, r); g.globalAlpha = 0.3 * (1 - k / 4); dia(X, Y, b.col); g.globalAlpha = 1; });
    if (birdOn(tick)) { const [X, Y] = P(...BIRD); R(g, X - 2, Y - 4, 4, 3, C.tie); R(g, X + 1, Y - 6, 3, 2, C.tie); R(g, X + 2, Y - 6, 1, 1, '#2a2826'); R(g, X + 4, Y - 5, 1, 1, C.accent); R(g, X - 3, Y - 3, 1, 1, C.tie); }
    [...bots].sort((a, b) => (a.q + a.r) - (b.q + b.r)).forEach(b => {
      const [X0, Y0] = P(b.pq, b.pr), [X1, Y1] = P(b.q, b.r), X = Math.round(X0 + (X1 - X0) * f), Y = Math.round(Y0 + (Y1 - Y0) * f);
      g.globalAlpha = 0.7; dia(X1, Y1, mix(b.col, '#000000', 0.45)); g.globalAlpha = 1;
      R(g, X - 2, Y, 5, 1, 'rgba(0,0,0,0.6)');
      const hy = Y - 7 + (Math.sin(t * 6 + b.q) > 0.6 ? -1 : 0);
      R(g, X - 3, hy + 1, 7, 1, '#1a1b1d'); R(g, X - 2, hy - 1, 5, 2, b.col); R(g, X - 1, hy - 1, 3, 1, mix(b.col, '#ffffff', 0.4));
      R(g, X - 4, hy - 1, 2, 1, '#d8d0bf'); R(g, X + 3, hy - 1, 2, 1, '#d8d0bf');
      if (b.carry) R(g, X - 1, hy + 2, 3, 2, C.gold);
      if (b.state === 'weld' && Math.floor(t * 12) % 2) { R(g, X - 3, Y - 2, 1, 1, '#ffffff'); R(g, X + 3, Y - 1, 1, 1, '#ffe0b0'); R(g, X, Y - 3, 1, 1, '#ffffff'); }
      if (b.state === 'wait' || b.state === 'bird') ptext(g, '?', X - 1, hy - 8, C.accent);
    });
    if (tick !== lastTick) { lastTick = tick; bots.forEach((b, i) => { rows[i].innerHTML = STATE(b); }); }
  };
  anim(c, draw, 7.2);
  m.append(botLine('drone', 'D-4', glyphLine([['⊞', 'ROUTE'], ['⇢', 'TO'], ['D-5', 'D-5'], ['D-6', 'D-6']]), { time: ':40', wide: [c, watch] }));
  m.append(botLine('drone', 'D-6', glyphLine([['↻', 'ORBIT'], ['↻', 'ORBIT'], ['♥', 'FOND']]), { time: ':41' }));
  m.append(botLine('drone', 'D-5', glyphLine([['ᵕ', 'BIRD'], ['…', ''], ['?', '?']]), { time: ':42' }));
  side.append(m);
}

// =====================================================================
// P17 windows: live viewports a bot posts to the band, after Transport Tycoon
// =====================================================================
const ip = (x, y, z) => [80 + (x - y) * 6, 72 + (x + y) * 3 - z * 8];
function isoBox(g, x, y, z, w, d, hh, top, left, right) {
  fillPoly(g, [ip(x, y + d, z + hh), ip(x + w, y + d, z + hh), ip(x + w, y + d, z), ip(x, y + d, z)], left);
  fillPoly(g, [ip(x + w, y, z + hh), ip(x + w, y + d, z + hh), ip(x + w, y + d, z), ip(x + w, y, z)], right);
  fillPoly(g, [ip(x, y, z + hh), ip(x + w, y, z + hh), ip(x + w, y + d, z + hh), ip(x, y + d, z + hh)], top);
}
const SCENE = (() => {
  const SW = 250, SH = 150, [c, g] = cnv(SW, SH, 1), r = mulberry(17);
  R(g, 0, 0, SW, SH, '#0c0d0f');
  isoBox(g, -3, -5, 0, 22, 2, 7, '#2a2926', '#24221f', '#1d1b19');   // the far wall
  for (let x = -2.5; x < 18.5; x += 0.9) for (let z = 0.6; z < 6.6; z += 0.8) { if (r() < 0.62) continue; const [X, Y] = ip(x, -3, z); R(g, X, Y, 1, 2, r() < 0.8 ? '#7a5a2a' : '#2e5d6a'); }
  isoBox(g, -3, -3, -1, 22, 10, 1, '#141518', '#101113', '#0d0e10');   // the undercity floor, far below
  for (let k = 0; k < 14; k++) { const [X, Y] = ip(-2 + r() * 20, -2 + r() * 8, 0); R(g, X, Y, 1, 1, r() < 0.5 ? '#3a3d42' : '#5a4320'); }
  const conc = ['#8f8a7f', '#625e57', '#4c4944'], conc2 = ['#99938a', '#6a665e', '#53504a'];
  for (const [x, y] of [[0.2, 3.4], [5.4, 3.4], [5.4, 0.2]]) isoBox(g, x, y, 0, 0.4, 0.4, 1.7, '#57534c', '#45423d', '#3a3834');
  isoBox(g, 0, 0, 1.7, 6, 4, 0.3, ...conc);
  for (const [x, y] of [[9.2, 3.4], [14.4, 3.4]]) isoBox(g, x, y, 0, 0.4, 0.4, 2.7, '#57534c', '#45423d', '#3a3834');
  isoBox(g, 9, 0, 2.7, 6, 4, 0.3, ...conc2);
  for (let k = 0; k < 6; k++) { const a = ip(9 + k, 4, 2.7), b = ip(10 + k, 4, 2.2), a2 = ip(9 + k, 4, 2.2), b2 = ip(10 + k, 4, 2.7); line(g, a[0], a[1], b[0], b[1], '#a9b6bf'); line(g, a2[0], a2[1], b2[0], b2[1], '#7d8a92'); }
  const [ax, ay] = ip(10, 4, 2.2), [bx, by] = ip(15, 4, 2.2); line(g, ax, ay, bx, by, '#a9b6bf');
  const post = (x, y, z, hgt) => { const [X, Y] = ip(x, y, z); R(g, X, Y - hgt, 2, hgt, '#6d747a'); R(g, X, Y - hgt, 1, hgt, '#9aa3aa'); R(g, X - 1, Y - hgt - 1, 4, 1, C.gold); return [X + 1, Y - hgt]; };
  const pA = post(5.5, 2, 2, 13), pB = post(9.5, 2, 3, 8);
  const pts = drape(g, pA[0], pA[1], pB[0], pB[1], 9, '#e27a4e', 2);
  drape(g, pA[0], pA[1] + 3, pB[0], pB[1] + 3, 12, '#5fd3c4', 1, '#9b87e8');
  const ties = [5, 11, 17].map(i => pts[Math.min(i, pts.length - 1)]);
  for (const [x, y] of ties) R(g, x, y - 1, 1, 4, C.tie);
  return { c, SW, SH, tie: ties[1], perch: pts[14] };
})();
function titleBar(g, x, y, w, title, own, o) {
  o = o || {};
  R(g, x, y, w, 9, '#3a3d43'); R(g, x, y, w, 1, '#5a5e66'); R(g, x, y + 8, w, 1, '#24262a');
  R(g, x + 1, y + 1, 7, 7, '#2a2c30'); R(g, x + 1, y + 1, 7, 1, '#4a4d54');
  for (let k = 0; k < 3; k++) { R(g, x + 3 + k, y + 3 + k, 1, 1, '#d9d2c2'); R(g, x + 5 - k, y + 3 + k, 1, 1, '#d9d2c2'); }
  R(g, x + 10, y + 3, 3, 3, own);
  ptext(g, title, x + 15, y + 2, '#e6dfcf');
  if (o.follow) sprite(g, ['.aaa.', 'a.a.a', '.aaa.'], x + w - 7, y + 3, { a: C.accent });
  if (o.shade) sprite(g, ['aaaaa', '.aaa.', '..a..'], x + w - 7, y + 3, { a: '#8b857a' });
}
function winFrame(g, W, H) { R(g, 0, 0, W, H, '#0b0c0e'); R(g, 1, 1, W - 2, H - 2, '#2f3237'); }
function followWindow() {
  const W = 146, H = 79, VW = 144, VH = 61, [c, g] = cnv(W, H);
  const draw = t => {
    const u = (Math.sin(t * 0.7) + 1) / 2, hx = 0.9 + u * 3.9;
    const [HX, HY] = ip(hx, 2.4, 2);
    const cx = Math.max(0, Math.min(SCENE.SW - VW, Math.round(HX - VW * 0.42))), cy = Math.max(0, Math.min(SCENE.SH - VH, Math.round(HY - 8 - VH / 2)));
    winFrame(g, W, H);
    titleBar(g, 1, 1, W - 2, 'H-3 · L9 ' + (19 + Math.round(hx)) + ',14', '#b9b2a3', { follow: true });
    g.drawImage(SCENE.c, cx, cy, VW, VH, 1, 10, VW, VH);
    g.save(); g.beginPath(); g.rect(1, 10, VW, VH); g.clip();
    const ox = 1 - cx, oy = 10 - cy, X = HX + ox, Y = HY + oy;
    // the hauler, with a spool on its back
    sprite(g, ['.kkkkkk.', 'kSSSSSSk', 'kSaSSaSk', 'kSSSSSSk', 'kmmmmmmk', '.k.kk.k.'], X - 4, Y - 7, APAL);
    R(g, X - 2, Y - 10, 4, 3, '#e27a4e'); R(g, X - 1, Y - 10, 2, 1, '#ffb08f'); R(g, X - 2, Y - 8, 4, 1, '#9a4a2a');
    // its balloon: what it is saying, drawn over the picture
    const bx = X - 14, by = Y - 25; R(g, bx, by, 29, 10, '#8a9298'); R(g, bx + 1, by + 1, 27, 8, '#1b1c1f');
    R(g, X - 1, by + 10, 3, 1, '#8a9298'); R(g, X, by + 11, 1, 2, '#8a9298');
    glyph(g, '∿', bx + 3, by + 3); glyph(g, '⊓', bx + 12, by + 3); glyph(g, '→', bx + 21, by + 3);
    // T-tie's mark: a circled tie with a bird beside it
    const [tx, ty] = SCENE.tie, [px, py] = SCENE.perch, TX = tx + ox, TY = ty + oy;
    R(g, px + ox - 1, py + oy - 3, 3, 2, C.tie); R(g, px + ox + 1, py + oy - 4, 2, 1, C.tie); R(g, px + ox + 3, py + oy - 3, 1, 1, C.accent);
    for (let a = 0, k = 0; a < Math.PI * 2; a += 0.21, k++) if (k % 3 !== 2) R(g, Math.round(TX + Math.cos(a + t * 0.8) * 7), Math.round(TY + 1 + Math.sin(a + t * 0.8) * 4), 1, 1, C.accent);
    R(g, TX + 8, TY - 9, 15, 7, C.accent); glyph(g, '≡', TX + 9, TY - 8, C.ink); ptext(g, '?', TX + 15, TY - 8, C.ink);
    g.restore();
    R(g, 1, 71, W - 2, 7, '#24262a'); ptext(g, 'FOLLOWING · 0.4 M/S', 3, 72, '#7a746a');
  };
  draw(0);
  return { c, draw };
}
function zoomWindow() {
  const W = 66, H = 51, [c, g] = cnv(W, H), [tx, ty] = SCENE.tie;
  const draw = t => {
    winFrame(g, W, H); titleBar(g, 1, 1, W - 2, 'T-TIE ×2', ROLE.M);
    g.drawImage(SCENE.c, tx - 16, ty - 9, 32, 17, 1, 10, 64, 34);
    const [px, py] = SCENE.perch, bx = 1 + (px - tx + 16) * 2, by = 10 + (py - ty + 9) * 2;
    R(g, bx - 2, by - 6, 6, 4, C.tie); R(g, bx + 2, by - 8, 4, 2, C.tie); R(g, bx + (Math.floor(t * 1.3) % 4 ? 4 : 3), by - 8, 1, 1, '#2a2826'); R(g, bx + 6, by - 6, 2, 1, C.accent);
    const cx = 33, cy = 27;
    for (let a = 0, k = 0; a < Math.PI * 2; a += 0.12, k++) if (k % 4 !== 3) R(g, Math.round(cx + Math.cos(a) * 11), Math.round(cy + Math.sin(a) * 8), 1, 1, C.accent);
    R(g, 1, 44, W - 2, 6, '#24262a'); ptext(g, 'TIE 31 · ᵕ', 3, 45, '#7a746a');
  };
  draw(0);
  return { c, draw };
}
function shadedWindows() {
  const W = 76, items = [['D-4 · ROUTE', ROLE.D], ['C-9 · BIRDS', '#b9b2a3'], ['B-0 · L0', C.accent]], H = items.length * 12 - 1, [c, g] = cnv(W, H);
  items.forEach(([n, col], i) => { R(g, 0, i * 12, W, 11, '#0b0c0e'); titleBar(g, 1, i * 12 + 1, W - 2, n, col, { shade: true }); });
  return c;
}
// every followed thing as a tiny live window, the way Transport Tycoon fills a screen with them
function windowRail() {
  const W = 146, H = 33, [c, g] = cnv(W, H);
  const TH = [['H-3', '#b9b2a3', 58, 44], ['D-4', ROLE.D, 150, 50], ['C-9', ROLE.M, 104, 66], ['B-0', C.accent, 20, 112]];
  const draw = t => {
    g.clearRect(0, 0, W, H);
    TH.forEach(([n, col, sx, sy], k) => {
      const x = k * 37, u = (Math.sin(t * 0.7) + 1) / 2;
      R(g, x, 0, 35, 25, '#0b0c0e'); R(g, x + 1, 1, 33, 3, col);
      const ox = k === 0 ? Math.round(u * 20) : 0;
      g.drawImage(SCENE.c, sx + ox, sy, 33, 20, x + 1, 4, 33, 20);
      if (k === 0) { R(g, x + 15, 15, 4, 3, '#a9b6bf'); R(g, x + 16, 13, 2, 2, '#e27a4e'); }
      if (k === 1) { const dx = Math.round(16 + Math.sin(t * 1.3) * 11), dy = Math.round(10 + Math.cos(t * 2.1) * 4); R(g, x + 1 + dx - 1, 4 + dy, 3, 1, '#1a1b1d'); R(g, x + 1 + dx, 3 + dy, 1, 1, ROLE.M); R(g, x + dx - 1, 3 + dy, 1, 1, '#d8d0bf'); R(g, x + dx + 3, 3 + dy, 1, 1, '#d8d0bf'); }
      if (k === 3) { R(g, x + 1, 4, 33, 20, 'rgba(8,8,10,0.55)'); const k2 = 0.5 + Math.sin(t * 2) * 0.3; R(g, x + 9, 12, 16, 1, mix('#3a2a10', '#ffd27a', k2)); R(g, x + 6, 9, 1, 13, '#2a2c30'); R(g, x + 28, 7, 1, 15, '#2a2c30'); }
      ptext(g, n, x + 17 - (ptextW(n) >> 1), 27, '#7a746a');
    });
  };
  draw(0);
  return { c, draw };
}
function buildWindows(side) {
  side.append(ph('Band', '<b class="num">3</b> windows open'));
  side.append(seg(['All', 'Log', 'Chat', 'Band'], 3));
  const m = h('div', { class: 'msgs' });
  const fw = followWindow(); anim(fw.c, fw.draw, 1.6);
  m.append(botLine('hauler', 'H-3', glyphLine([['∿', 'CABLE'], ['⊓', 'LIFT'], ['→', 'GO'], ['L9', 'L9']]), { time: ':50', wide: [fw.c] }));
  const zw = zoomWindow(); anim(zw.c, zw.draw, 0.4);
  m.append(botLine('tie', 'T-TIE', glyphLine([['≡', 'TIE'], ['ᵕ', 'BIRD'], ['?', '?']]), { time: ':51', wide: [h('div', { class: 'wrow' }, zw.c, h('div', null, shadedWindows(), h('div', { class: 'gnote', style: 'margin-top:4px' }, 'Shaded: title bar only. Click to open.')))] }));
  const wr = windowRail(); anim(wr.c, wr.draw, 1.6);
  m.append(xlabel('window rail · everything being followed'));
  m.append(padw(wr.c));
  m.append(sysline('click a title to follow it in the main view · a bot closes its window when the work is done'));
  side.append(m);
}

// =====================================================================
// P18 colossus: a builder too big for the column speaks in slow huge glyphs
// =====================================================================
const COLO = (() => {
  const W = 44, H = 236, [c, g] = cnv(W, H, 1), r = mulberry(91);
  // the right flank of something huge: head with a visor, a neck of vents, a shoulder ledge, a spalled patch
  const edge = y => y < 8 ? 30 + y : y < 70 ? 41 + Math.round(Math.sin(y * 0.09)) : y < 96 ? 34 : y < 112 ? 43 : y < 146 ? 38 : y < 178 ? 33 + ((y * 7) % 5 < 2 ? 1 : 0) : 39 - Math.round((y - 178) / 9);
  for (let y = 0; y < H; y++) {
    const e = edge(y), plate = y % 26, k = plate < 2 ? 0 : 1 - plate / 40;
    R(g, 0, y, e, 1, plate === 0 ? '#151618' : mix('#25272b', '#34373c', k));
    R(g, e - 1, y, 1, 1, '#71767e'); R(g, e - 2, y, 1, 1, '#4a4e55'); R(g, e - 3, y, 1, 1, '#3a3d43');
  }
  for (let y = 6; y < H - 30; y += 26) for (let x = 4; x < 30; x += 8) if (r() < 0.75) { R(g, x, y + 3, 1, 1, '#5a5e66'); R(g, x, y + 4, 1, 1, '#1b1c1f'); }
  R(g, 4, 22, 37, 5, '#3d4046'); R(g, 4, 22, 37, 1, '#5a5e66');   // brow
  R(g, 6, 27, 34, 13, '#0b0c0e'); R(g, 6, 39, 34, 1, '#2a2c30');   // visor socket
  for (let y = 74; y < 92; y += 3) { R(g, 8, y, 24, 2, '#0e0f11'); R(g, 8, y + 2, 24, 1, '#3a3d43'); }
  R(g, 12, 110, 31, 3, '#4a4e55'); R(g, 12, 110, 31, 1, '#8a9096');   // shoulder ledge
  sprite(g, ['.kkk.', 'kSaSk', 'kmmmk', '.k.k.'], 26, 106, APAL);   // a hauler on it, for scale
  R(g, 36, 108, 3, 2, C.tie); R(g, 38, 107, 1, 1, C.tie);   // and a bird
  for (let y = 150; y < 176; y++) { const a = 7 + Math.round(Math.sin(y * 0.7) * 2), b = 27 + Math.round(Math.cos(y * 0.5) * 2); R(g, a, y, b - a, 1, '#57514a'); R(g, a, y, 1, 1, '#2a2622'); }
  for (const y of [154, 162, 170]) R(g, 6, y, 23, 1, '#9a522c');
  for (const x of [12, 21]) R(g, x, 151, 1, 24, '#7a3f24');
  R(g, 12, 162, 1, 1, '#d07a44'); R(g, 21, 154, 1, 1, '#d07a44'); R(g, 15, 170, 1, 1, '#d07a44');
  for (let y = H - 44; y < H; y++) { g.globalAlpha = (y - (H - 44)) / 44; R(g, 0, y, W, 1, '#141517'); } g.globalAlpha = 1;
  return { c, W, H };
})();
function colossus() {
  const W = COLO.W, H = COLO.H, [c, g] = cnv(W, H);
  const draw = (t, speaking) => {
    g.clearRect(0, 0, W, H); g.drawImage(COLO.c, 0, 0);
    const k = speaking ? 0.78 + Math.sin(t * 9) * 0.22 : 0.4;
    R(g, 8, 33, 30, 3, mix('#4a3010', '#ffd27a', k)); R(g, 8, 32, 30, 1, mix('#120c04', '#8a5a1a', k)); R(g, 8, 36, 30, 1, mix('#120c04', '#8a5a1a', k));
    if (speaking) { const x = 8 + Math.floor((t * 22) % 29); R(g, x, 33, 2, 3, '#ffffff'); }
    for (const [x0, col, ph] of [[22, '#e27a4e', 0], [26, '#5fd3c4', 1.4], [30, '#8a9298', 2.6]]) for (let y = 113; y < 206; y++) {
      const s2 = (y - 113) / 93, x = Math.round(x0 + Math.sin(s2 * 3 + t * 0.6 + ph) * s2 * 3); R(g, x, y, 1, 1, col);
    }
    ptext(g, 'B-0', 4, 4, C.accent);
  };
  draw(0, false);
  return { c, draw };
}
// the colossus has its own, broader shapes for a few words
const BIGM = { '☼': ['#..#..#', '.#.#.#.', '..###..', '.......', '#######'] };
// a huge glyph that gets built row by row, the newest row still glowing from the weld
function bigGlyph(tok, gl) {
  const mask = [];
  if (BIGM[tok]) for (const row of BIGM[tok]) mask.push([...row].map(ch => ch === '#'));
  else if (GLY[tok]) for (let r = 0; r < 5; r++) mask.push([...GLY[tok][r + 1]].map(ch => ch !== '.'));
  else for (let r = 0; r < 5; r++) mask.push([...tok].flatMap((ch, i) => { const f = FONT[ch]; const row = [0, 1, 2].map(q => f[r * 3 + q] === '1'); return i ? [false, ...row] : row; }));
  const cols = mask[0].length, S = 4, col = ROLE[GLY[tok] ? GLY[tok][0] : 'V'], W = Math.max(cols * S, ptextW(gl)), H = 5 * S + 9;
  const [c, g] = cnv(W, H);
  const draw = (f, t) => {
    g.clearRect(0, 0, W, H);
    const rows = f * 5, full = Math.floor(rows);
    for (let r = 0; r < 5; r++) for (let q = 0; q < cols; q++) {
      if (!mask[r][q]) continue;
      const x = q * S, y = r * S;
      if (r < full) {
        R(g, x, y, S, S, col); R(g, x, y, S, 1, mix(col, '#ffffff', 0.22)); R(g, x, y + S - 1, S, 1, shade(col, 0.55)); R(g, x + S - 1, y, 1, S, shade(col, 0.7));
        if ((q * 7 + r * 3) % 3 === 0) R(g, x + 1, y + 1, 1, 1, shade(col, 0.78));
      } else if (r === full && q < (rows - full) * cols) {
        R(g, x, y, S, S, '#ffd27a'); R(g, x, y + S - 1, S, 1, '#e8a83c');
        if (Math.floor(t * 14 + q) % 3 === 0) R(g, x + 1, y - 2, 1, 1, '#ffffff');
      }
    }
    if (f >= 1) ptext(g, gl, 0, 5 * S + 4, '#5c5850');
  };
  draw(0, 0);
  return { c, draw };
}
function buildColossus(side) {
  side.append(ph('Band · L0 trench', '1 colossus · 41 small'));
  const wrap = h('div', { class: 'colo' });
  const co = colossus();
  wrap.append(h('div', { class: 'cside' }, co.c));
  const m = h('div', { class: 'msgs end' });
  const small = [['hauler', 'H-3', ['∿', '⊓', '→', '3']], ['welder', 'W-07', ['✶', '✶', '✓']], ['drone', 'D-4', ['↻', '↻', '?']], ['tie', 'T-TIE', ['≡', '≡', '≡', '≡']], ['crawler', 'C-9', ['∿', '⑂', '✓']]]
    .map(([av, n, toks]) => botLine(av, n, glyphLine(toks), { cls: 'botm tight' }));
  const sys = sysline('B-0 keyed the band · 41 bots holding');
  const bigs = [['☼', 'LIGHT'], ['↓', 'DOWN'], ['L0', 'TO L0']].map(([tk, gl]) => bigGlyph(tk, gl));
  const bigEls = bigs.map(b => h('div', { class: 'bigl' }, b.c));
  const bird = botLine('bird', 'BIRD', glyphLine(['ᵕ'], { noGloss: true }), { cls: 'botm tight' });
  const echo = [['hauler', 'H-3'], ['drone', 'D-4'], ['welder', 'W-07']].map(([av, n]) => botLine(av, n, glyphLine(['☼', '↓', '✓'], { noGloss: true }), { cls: 'botm tight' }));
  m.append(...small, sys, ...bigEls, bird, ...echo);
  wrap.append(m);
  side.append(wrap);
  const T = 16, SPEAK = [2.6, 9.8];
  const show = (el, on) => { el.style.display = on ? '' : 'none'; };
  anim(m, t => {
    const q = t % T, quiet = q >= 2 && q < 11;
    small.forEach(e => e.classList.toggle('quiet', quiet));
    show(sys, q >= 2);
    bigs.forEach((b, i) => { const s = 2.6 + i * 2.4; show(bigEls[i], q >= s); if (q >= s) b.draw(clamp01((q - s) / 1.8), t); });
    show(bird, q >= 10.2);
    echo.forEach((e, i) => show(e, q >= 11 + i * 0.3));
    co.draw(t, q >= SPEAK[0] && q < SPEAK[1]);
  }, 12.5);
}

// ---------------------------------------------------------------------
const CHEAP = '<span class="ig">In game: <b class="cheap">cheap</b> · ', MID = '<span class="ig">In game: <b class="mid">medium</b> · ', DEAR = '<span class="ig">In game: <b class="dear">costly</b> · ';
const PANELS2 = [
  { code: 'P11', title: 'Pidgin II', refs: ['R1', 'R22', 'R2'], build: buildPidgin2, h: 560,
    cap: 'Bot speech gets a body. Size is volume, lift is stress, small is an aside, wobble is doubt. Pairs said often fuse into ligatures. A stack strip under a sentence shows what each word leaves behind, after Uiua’s stack signatures. A braid joins the words that answer each other.' +
      CHEAP + 'all of it is the same glyph drawing with an offset, a scale or a merge table; the stack strip needs the sim to say what is on the stack.</span>' },
  { code: 'P12', title: 'Carts', refs: ['R18', 'R10', 'R5'], build: buildCarts, h: 560,
    cap: 'A quote folds into a cartridge you can hand over. Its corner brackets say it is a quote, like a hole. Its teeth are its type: one per input, by role. It seats only in a matching slot, and unfolds into the block it was. Bots keep shelves of them, and some are keepsakes.' +
      MID + 'the cart sprite is small; the hand-off wants a message that animates across rows.</span>' },
  { code: 'P13', title: 'Blocks II', refs: ['R9', 'R10', 'R8', 'R5'], build: buildBlocks2, h: 560,
    cap: 'Blocks wear their execution: an amber token walks the stack, done blocks dim, the loop arm counts. Projectors inside the blocks show the live thing: the cable being draped, the ties so far, the tension gauge the IF reads. A failed run cracks the block and shears everything after it.' +
      MID + 'blocks are already drawn in code; the run state has to come from the bot that owns them.</span>' },
  { code: 'P14', title: 'Wires II', refs: ['R11', 'R12', 'R13'], build: buildWires2, h: 470,
    cap: 'Patches drawn as the game’s own cables, with signal pulses running along them and node bangs when they arrive. A merge keeps the other bot’s parts in amber and ties the bundle. A bird lands, the interlock holds, and the pulses downstream stop where they are.' +
      CHEAP + 'it is drape() plus dots moving along the points; the game already has the cable look.</span>' },
  { code: 'P15', title: 'Plans II', refs: ['R4', 'R5', 'R7', 'R6'], build: buildPlan2, h: 470,
    cap: 'The plan is live in the feed. Holes are claimed (striped), filled (amber outline for the change) and counted. The hole no crew can fill turns red, then climbs past claude·arch to you in cyan. The step chart is the plan’s to-do list.' +
      MID + 'rocks() is costly per layout, so draw each state once and swap; the hole protocol is where the agent work lives.</span>' },
  { code: 'P16', title: 'Routes II', refs: ['R16', 'R14', 'R15', 'R20'], build: buildRoutes2, h: 470,
    cap: 'An iso-diamond route program, the same projection as the game’s floor, run by three drones at once. Each drone is an instruction pointer: it welds at ✶, picks up at ◇, drops at ⊔, and yields to others. D-6 has wandered onto a little loop of its own. A bird blocks a cell and the line backs up.' +
      CHEAP + 'a grid of arrows and a tick; it could be the actual pathing of the build drones.</span>' },
  { code: 'P17', title: 'Windows', refs: ['R23', 'R13'], build: buildWindows, h: 560,
    cap: 'Bots post live windows into the band, after Transport Tycoon’s vehicle windows: a title bar with a close box, a follow eye, and the bot’s own marks drawn over the picture (its balloon, a circled tie). Zoom windows and shaded title-bar-only windows keep the feed short. The world picture here is hand-drawn.' +
      DEAR + 'each window is a small second render of the world; affordable at a few fps.</span>' },
  { code: 'P18', title: 'Colossus', refs: ['R24', 'R19'], build: buildColossus, h: 560,
    cap: 'A builder too big for the avatar column (BLAME!, Girls’ Last Tour). It speaks one huge glyph per line, each built row by row as if welded. The small bots dim and hold until it’s done, a bird gets the last word, and the crews echo it back small.' +
      CHEAP + 'a scaled glyph and a quiet flag on the band; the sprite is the expensive part.</span>' }
];
document.addEventListener('DOMContentLoaded', () => {
  const host = document.getElementById('panels2');
  for (const p of PANELS2) host.append(panel(p));
  runAnims();
});
