// Inline pieces that sit inside chat messages: glossed glyph strings, stack
// views, ragged nested plans, pixel blocks, draped wire patches, route grids,
// voice waveforms and sketch thumbnails. Each returns a canvas.
'use strict';

// ---------- a glyph string with an optional interlinear gloss row ----------
// toks: token | [token, gloss]
function glyphLine(toks, o) {
  o = o || {};
  const gap = o.gap != null ? o.gap : 3;
  const items = toks.map(t => Array.isArray(t) ? { t: t[0], gl: t[1] } : { t, gl: null });
  const gloss = items.some(i => i.gl) && !o.noGloss;
  let x = 0;
  for (const it of items) {
    it.w = tokW(it.t); it.cw = gloss ? Math.max(it.w, it.gl ? ptextW(it.gl) : 0) : it.w;
    it.x = x; x += it.cw + gap;
  }
  const W = Math.max(1, x - gap), H = gloss ? 14 : 5;
  const [c, g] = cnv(W, H, o.sc);
  for (const it of items) {
    tokDraw(g, it.t, it.x + ((it.cw - it.w) >> 1), 0, o.col);
    if (gloss && it.gl) {
      ptext(g, it.gl, it.x + ((it.cw - ptextW(it.gl)) >> 1), 9, o.glossCol || '#5c5850');
      R(g, it.x + ((it.cw - it.w) >> 1), 7, it.w, 1, '#2a2b2f');
    }
  }
  c.classList.add('gl');
  return c;
}

// ---------- a little stack: bottom on the left, top on the right ----------
function stackView(items) {
  const ws = items.map(t => tokW(t) + 4);
  const W = ws.reduce((a, b) => a + b + 1, 0) + 9, H = 11;
  const [c, g] = cnv(W, H);
  let x = 0;
  items.forEach((t, i) => {
    const w = ws[i], top = i === items.length - 1;
    R(g, x, 1, w, 9, top ? '#2f2a45' : '#212226');
    R(g, x, 1, w, 1, top ? '#6c62a0' : '#3a3c41');
    R(g, x, 9, w, 1, '#0b0c0e');
    tokDraw(g, t, x + 2, 3);
    x += w + 1;
  });
  ptext(g, '←', x + 1, 3, '#5a554d');
  c.classList.add('stk');
  return c;
}

// ---------- ragged nested plan (after Cohen & Chugh's "rocks") ----------
// tree: [opt?, child...]; strings are tokens, '\n' breaks the line,
// objects are special leaves: {hole}, {slider:[label,v]}, {check:[label,on]}, {fold:n}
const LEX = { SPAN: 'M', DECK: 'M', DRAPE: 'M', RAIL: 'M', TIE: 'M', WELD: 'M', LAY: 'M', HOSE: 'V', EACH: 'H', EVERY: 'H', VIA: 'D', TO: 'D', AT: 'D' };
function rocks(tree, o) {
  o = o || {};
  const leaves = [];
  function norm(a, depth, parent) {
    const n = { k: 'n', ch: [], depth, parent, opt: {} };
    for (const e of a) {
      if (e && typeof e === 'object' && !Array.isArray(e) && e.opt) { n.opt = e.opt; continue; }
      if (e === '\n') { n.ch.push({ k: 'nl' }); continue; }
      if (Array.isArray(e)) { n.ch.push(norm(e, depth + 1, n)); continue; }
      const L = { k: 't', depth: depth + 1, parent: n };
      if (typeof e === 'string') { L.t = e; L.w = tokW(e); }
      else if (e.hole != null) { L.hole = e.hole; L.by = e.by; L.w = Math.max(9, ptextW(e.hole) + 6); }
      else if (e.slider) { L.slider = e.slider; L.w = ptextW(e.slider[0]) + 3 + 15 + 3 + ptextW(e.slider[1]); }
      else if (e.check) { L.check = e.check; L.w = 6 + ptextW(e.check[0]); }
      else if (e.fold != null) { L.fold = e.fold; L.w = ptextW('…' + e.fold) + 4; }
      n.ch.push(L);
    }
    return n;
  }
  const root = norm(tree, 0, null);
  const hgt = n => n.k !== 'n' ? 0 : (n.h = 1 + Math.max(0, ...n.ch.filter(c => c.k !== 'nl').map(hgt)));
  hgt(root);
  const nodes = [];
  (function walk(n) { if (n.k === 'n') { nodes.push(n); n.ch.forEach(walk); } })(root);
  let hmax = 0; for (const n of nodes) if (n !== root) hmax = Math.max(hmax, n.h);
  const pitch = 7 + 2 * hmax + 2, x0 = root.h + 1, y0 = root.h + 1;
  // flow: place leaves, the gap between two leaves depends on what lies between them
  const path = L => { const p = []; let q = L; while (q) { p.unshift(q); q = q.parent; } return p; };
  let x = x0, ln = 0, prev = null, maxX = 0;
  (function flow(n) {
    let first = null;
    for (const c of n.ch) {
      if (c.k === 'nl') { ln++; x = (n.firstX != null ? n.firstX : x) + 6; prev = null; continue; }
      if (c.k === 'n') { flow(c); if (first == null) first = c.firstX; if (n.firstX == null) n.firstX = c.firstX; continue; }
      if (prev) {
        const pa = path(prev), pb = path(c);
        let i = 0; while (pa[i] === pb[i]) i++;
        const A = pa[i], B = pb[i];
        x += (A.k === 'n' ? A.h : 0) + (B.k === 'n' ? B.h : 0) + 2;
      }
      c.x = x; c.ln = ln; x += c.w + 2; maxX = Math.max(maxX, x);
      if (n.firstX == null) n.firstX = c.x;
      leaves.push(c); prev = c;
    }
  })(root);
  const lines = ln + 1;
  const W = maxX + root.h + 2, H = y0 + lines * pitch - pitch + 7 + root.h + 2;
  const masks = new Map();
  const idx = (x, y) => y * W + x;
  function leafMask(L) {
    const m = new Uint8Array(W * H), y = y0 + L.ln * pitch;
    for (let yy = y - 1; yy < y + 6; yy++) for (let xx = L.x - 1; xx < L.x + L.w + 1; xx++) m[idx(xx, yy)] = 1;
    return m;
  }
  function nodeMask(n) {
    const kids = n.ch.filter(c => c.k !== 'nl').map(c => c.k === 'n' ? nodeMask(c) : leafMask(c));
    const u = new Uint8Array(W * H);
    for (const m of kids) for (let i = 0; i < u.length; i++) u[i] |= m[i];
    const span = [];
    for (let y = 0; y < H; y++) {
      let a = -1, b = -1;
      for (let xx = 0; xx < W; xx++) if (u[idx(xx, y)]) { if (a < 0) a = xx; b = xx; }
      span.push(a < 0 ? null : [a, b]);
    }
    const occ = span.map((s, i) => s ? i : -1).filter(i => i >= 0);
    const top = occ[0], bot = occ[occ.length - 1];
    const h = new Uint8Array(W * H);
    for (let y = top; y <= bot; y++) {
      let s = span[y];
      if (!s) {
        let ya = y; while (!span[ya]) ya--; let yb = y; while (!span[yb]) yb++;
        const A = span[ya], B = span[yb], lo = Math.max(A[0], B[0]), hi = Math.min(A[1], B[1]);
        s = lo <= hi ? [lo, hi] : [Math.min(A[0], B[0]), Math.max(A[1], B[1])];
      }
      for (let xx = s[0]; xx <= s[1]; xx++) h[idx(xx, y)] = 1;
    }
    const d = new Uint8Array(W * H);
    for (let y = 1; y < H - 1; y++) for (let xx = 1; xx < W - 1; xx++) {
      let on = 0;
      for (let dy = -1; dy <= 1 && !on; dy++) for (let dx = -1; dx <= 1; dx++) if (h[idx(xx + dx, y + dy)]) { on = 1; break; }
      d[idx(xx, y)] = on;
    }
    masks.set(n, d);
    return d;
  }
  nodeMask(root);
  const [c, g] = cnv(W, H);
  const FILL = o.fills || ['#211d31', '#2b2642', '#363052', '#413963', '#4b4274'];
  const LITE = o.lites || ['#564c84', '#685d9b', '#7a6eb0', '#8a7ec0', '#9a8ecf'];
  nodes.sort((a, b) => a.depth - b.depth);
  for (const n of nodes) {
    const m = masks.get(n), f = FILL[Math.min(n.depth, 4)], li = n.opt.diff ? C.accent : LITE[Math.min(n.depth, 4)], dk = n.opt.diff ? '#9a6a22' : shade(li, 0.62);
    for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) {
      if (!m[idx(xx, y)]) continue;
      const out = (dx, dy) => { const X = xx + dx, Y = y + dy; return X < 0 || Y < 0 || X >= W || Y >= H || !m[idx(X, Y)]; };
      const edge = out(0, -1) || out(-1, 0) || out(1, 0) || out(0, 1);
      g.fillStyle = !edge ? f : (out(0, -1) || out(-1, 0)) ? li : dk;
      g.fillRect(xx, y, 1, 1);
    }
  }
  for (const L of leaves) {
    const y = y0 + L.ln * pitch;
    if (L.t != null) {
      const role = isGlyph(L.t) ? null : LEX[L.t.toUpperCase()] || 'V';
      tokDraw(g, L.t, L.x, y, role ? ROLE[role] : null);
    } else if (L.hole != null) {
      const w = L.w;
      // a slot: dark well with corner brackets; a claimed one shows a sub-agent's progress along the bottom
      const x0 = L.x - 1, x1 = L.x + w, y0 = y - 1, y1 = y + 5;
      R(g, x0, y0, w + 2, 7, L.by ? '#262139' : '#120f1b');
      for (const [cx, cy, dx, dy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, 1 - 2]]) { R(g, cx, cy, 1, 1, ROLE.H); R(g, cx + dx, cy, 1, 1, ROLE.H); R(g, cx, cy + dy, 1, 1, ROLE.H); }
      if (L.by) { R(g, x0 + 2, y1, w - 2, 1, '#3a3356'); R(g, x0 + 2, y1, (w - 2) * 0.6 | 0, 1, '#c9bff2'); }
      ptext(g, L.hole || '?', L.x + ((w - ptextW(L.hole || '?')) >> 1), y, L.by ? '#c9bff2' : ROLE.H);
    } else if (L.slider) {
      let xx = L.x + ptext(g, L.slider[0], L.x, y, ROLE.V) + 2;
      R(g, xx, y + 2, 15, 1, '#57506f'); R(g, xx, y + 2, 9, 1, ROLE.H); R(g, xx + 8, y, 3, 5, C.tie); R(g, xx + 9, y + 1, 1, 3, ROLE.H);
      ptext(g, L.slider[1], xx + 18, y, C.tie);
    } else if (L.check) {
      R(g, L.x, y, 5, 5, '#6c62a0'); R(g, L.x + 1, y + 1, 3, 3, '#16141f');
      if (L.check[1]) { R(g, L.x + 1, y + 2, 1, 1, C.tie); R(g, L.x + 2, y + 3, 1, 1, C.tie); R(g, L.x + 3, y + 1, 1, 2, C.tie); }
      ptext(g, L.check[0], L.x + 7, y, ROLE.V);
    } else if (L.fold != null) {
      R(g, L.x - 1, y - 1, L.w + 1, 7, '#4f4778'); R(g, L.x - 1, y - 1, L.w + 1, 1, '#7064a6');
      ptext(g, '…' + L.fold, L.x + 1, y, '#e3defa');
    }
  }
  c.classList.add('rock');
  return c;
}

// ---------- pixel blocks (after Scratch / Snap!) ----------
// spec: [{type:'hat'|'stack'|'cap'|'c', col, label:[tok...], inner:[spec...]}]
function blockLabelW(label) {
  let w = 0;
  for (const t of label) w += (typeof t === 'object' && t.slot ? tokW(t.slot) + 4 : typeof t === 'object' && t.bool ? tokW(t.bool) + 6 : tokW(t)) + 3;
  return w - 3;
}
function blockLabel(g, label, x, y, ink) {
  for (const t of label) {
    if (typeof t === 'object' && t.slot) {
      const w = tokW(t.slot) + 4;
      R(g, x, y - 2, w, 9, '#f2ede1'); R(g, x, y - 2, 1, 1, null);
      g.clearRect(x, y - 2, 1, 1); g.clearRect(x + w - 1, y - 2, 1, 1); g.clearRect(x, y + 6, 1, 1); g.clearRect(x + w - 1, y + 6, 1, 1);
      tokDraw(g, t.slot, x + 2, y, '#24211d'); x += w + 3;
    } else if (typeof t === 'object' && t.bool) {
      const w = tokW(t.bool) + 6;
      R(g, x + 2, y - 2, w - 4, 9, '#3a5a1a'); R(g, x + 1, y - 1, w - 2, 7, '#3a5a1a'); R(g, x, y, w, 5, '#3a5a1a');
      tokDraw(g, t.bool, x + 3, y, '#e9f3c9'); x += w + 3;
    } else { tokDraw(g, t, x, y, ink); x += tokW(t) + 3; }
  }
}
function blockStack(spec) {
  function measure(list) {
    let w = 0, h = 0;
    for (const b of list) {
      const lw = blockLabelW(b.label) + 8;
      if (b.type === 'c') { const m = measure(b.inner); w = Math.max(w, lw, m.w + 6); h += 11 + m.h + 6; }
      else { w = Math.max(w, lw); h += 11 + (b.type === 'hat' ? 3 : 0); }
    }
    return { w, h };
  }
  const m = measure(spec);
  const [c, g] = cnv(m.w + 2, m.h + 3);
  const tabs = [];
  function draw(list, x, y, parentCol) {
    for (const b of list) {
      let col = b.col;
      if (parentCol && parentCol === col) col = mix(col, '#ffffff', 0.25);   // zebra, after Snap!
      const lw = blockLabelW(b.label) + 8;
      const hi = mix(col, '#ffffff', 0.35), lo = shade(col, 0.6);
      if (b.type === 'hat') {
        R(g, x + 1, y, 14, 1, hi); R(g, x, y + 1, 18, 1, col); R(g, x, y + 2, lw, 1, col); R(g, x + 15, y + 1, 3, 1, col);
        y += 3;
        R(g, x, y, lw, 11, col); R(g, x, y + 10, lw, 1, lo);
        blockLabel(g, b.label, x + 4, y + 3, C.ink);
        tabs.push([x + 3, y + 11, lo]); y += 11;
      } else if (b.type === 'c') {
        const im = measure(b.inner), w = Math.max(lw, im.w + 6);
        R(g, x, y, w, 11, col); R(g, x, y, w, 1, hi);
        blockLabel(g, b.label, x + 4, y + 3, C.ink);
        R(g, x, y + 11, 4, im.h, col); R(g, x, y + 11, 1, im.h, hi);
        R(g, x + 4, y + 11, 6, 1, shade(col, 0.8));
        draw(b.inner, x + 4, y + 11, b.col);
        const yb = y + 11 + im.h;
        R(g, x, yb, Math.min(w, 22), 6, col); R(g, x, yb + 5, Math.min(w, 22), 1, lo);
        tabs.push([x + 3, yb + 6, lo]);
        y = yb + 6;
      } else {
        R(g, x, y, lw, 11, col); R(g, x, y, lw, 1, hi); R(g, x, y + 10, lw, 1, lo);
        R(g, x + 3, y, 5, 1, shade(col, 0.75));
        blockLabel(g, b.label, x + 4, y + 3, C.ink);
        if (b.type !== 'cap') tabs.push([x + 3, y + 11, lo]);
        y += 11;
      }
    }
    return y;
  }
  draw(spec, 0, 0, null);
  for (const [x, y, col] of tabs) R(g, x, y, 5, 1, col);
  c.classList.add('blk');
  return c;
}
// a Snap!-style ring around one small block (a quoted program passed as a value)
function ringBlock(label, col) {
  const lw = blockLabelW(label) + 8, W = lw + 8, H = 11 + 8;
  const [c, g] = cnv(W, H);
  R(g, 1, 0, W - 2, H, '#8f897d'); R(g, 0, 1, W, H - 2, '#8f897d');
  R(g, 2, 1, W - 4, H - 2, '#2a2b30'); R(g, 1, 2, W - 2, H - 4, '#2a2b30');
  R(g, 4, 4, lw, 11, col); R(g, 4, 4, lw, 1, mix(col, '#fff', 0.35)); R(g, 4, 14, lw, 1, shade(col, 0.6));
  blockLabel(g, label, 8, 7, C.ink);
  c.classList.add('blk');
  return c;
}

// ---------- a draped wire patch (after Max / Pd, drawn as Stratum cables) ----------
// nodes: {id,x,y,label,col}, wires: {a,b,col,sag,thick,stripe,dy}, ties: [{x, ws:[i,j]}]
function patch(W, H, nodes, wires, ties) {
  const [c, g] = cnv(W, H);
  const N = {};
  for (const n of nodes) { n.w = ptextW(n.label) + 8; N[n.id] = n; }
  const P = [];
  for (const w of wires) {
    const A = N[w.a], B = N[w.b];
    const x0 = A.x + A.w, y0 = A.y + 4 + (w.dy || 0), x1 = B.x - 1, y1 = B.y + 4 + (w.dy2 != null ? w.dy2 : (w.dy || 0));
    P.push(drape(g, x0, y0, x1, y1, w.sag != null ? w.sag : 6, w.col, w.thick || 1, w.stripe));
  }
  for (const t of ties || []) {
    let lo = 1e9, hi = -1e9;
    for (const i of t.ws) for (const [px, py] of P[i]) if (px === t.x) { lo = Math.min(lo, py); hi = Math.max(hi, py); }
    if (hi < lo) continue;
    R(g, t.x - 1, lo - 1, 3, hi - lo + 3, '#0b0c0e'); R(g, t.x, lo - 1, 1, hi - lo + 3, C.tie);
  }
  for (const n of nodes) {
    const col = n.col || '#6d685f';
    R(g, n.x, n.y, n.w, 9, '#0b0c0e');
    R(g, n.x + 1, n.y + 1, n.w - 2, 7, n.fill || '#1f2024');
    R(g, n.x + 1, n.y + 1, n.w - 2, 1, mix(col, '#000', 0.3));
    R(g, n.x - 1, n.y + 3, 2, 3, col); R(g, n.x + n.w - 1, n.y + 3, 2, 3, col);   // ports
    if (n.bang) R(g, n.x + n.w - 4, n.y + 2, 2, 2, n.bang);
    ptext(g, n.label, n.x + 4, n.y + 2, n.ink || C.text);
  }
  c.classList.add('patch');
  return c;
}

// ---------- a 2D route grid (after Befunge / Orca) ----------
function routeGrid(rows, o) {
  o = o || {};
  const map = { '>': '→', '<': '←', '^': '↑', 'v': '↓' };
  const cw = 7, W = rows[0].length * cw + 1, H = rows.length * cw + 1;
  const [c, g] = cnv(W, H);
  R(g, 0, 0, W, H, '#101113');
  rows.forEach((row, r) => [...row].forEach((ch, q) => {
    const x = q * cw + 1, y = r * cw + 1;
    if (o.ip && o.ip[0] === q && o.ip[1] === r) { R(g, x - 1, y - 1, cw + 1, cw + 1, C.accent); glyph(g, map[ch] || ch, x + 0, y + 0, C.ink); return; }
    if (ch === '.') { R(g, x + 2, y + 2, 1, 1, '#3a3c40'); return; }
    if (ch === '◇' || ch === '✶' || ch === '⊔') { R(g, x - 1, y - 1, cw + 1, cw + 1, ch === '◇' ? '#cfc8b6' : ROLE.M); glyph(g, ch, x, y, '#16171a'); return; }
    if (map[ch]) { glyph(g, map[ch], x, y, ROLE.M); return; }
    tokDraw(g, ch, x + 1, y);
  }));
  c.classList.add('grid');
  return c;
}

// ---------- voice waveform ----------
function wave(n, h, seed, col) {
  const r = mulberry(seed || 3);
  const [c, g] = cnv(n * 2, h);
  for (let i = 0; i < n; i++) {
    const env = Math.sin(Math.PI * (i + 1) / (n + 1)) * 0.7 + 0.3, v = Math.max(1, Math.round((r() * 0.6 + 0.4) * env * h));
    R(g, i * 2, (h - v) >> 1, 1, v, col || C.you);
  }
  c.classList.add('wave');
  return c;
}

// ---------- a hand sketch on paper, scaled to w x h ----------
function sketch(w, h, o) {
  o = o || {};
  const [c, g] = cnv(w, h, o.sc);
  const r = mulberry(11), s = w / 60;
  R(g, 0, 0, w, h, '#d9d1bd');
  const P = (x, y) => [x * s, y * s];
  const ink = '#3b3630', soft = '#8b8273';
  const jl = (a, b, col) => { const [x0, y0] = P(...a), [x1, y1] = P(...b); line(g, x0 + (r() - 0.5) * s, y0 + (r() - 0.5) * s, x1 + (r() - 0.5) * s, y1 + (r() - 0.5) * s, col); };
  // the L9 slab in iso
  jl([6, 22], [30, 10], ink); jl([30, 10], [54, 22], ink); jl([54, 22], [30, 34], ink); jl([30, 34], [6, 22], ink);
  jl([6, 22], [6, 26], soft); jl([30, 34], [30, 38], soft); jl([54, 22], [54, 26], soft); jl([6, 26], [30, 38], soft); jl([30, 38], [54, 26], soft);
  // a tower and the walkway
  jl([38, 9], [38, 1], ink); jl([46, 13], [46, 5], ink); jl([38, 1], [46, 5], ink); jl([42, 15], [42, 9], soft);
  jl([10, 22], [26, 30], soft); jl([13, 21], [29, 29], soft);
  // light rays
  for (let i = 0; i < 3; i++) jl([18 + i * 4, 1], [24 + i * 3, 14], '#b8ad8f');
  // the circled garden, in the player's colour
  const cx = 30 * s, cy = 21 * s, rx = 9 * s, ry = 5 * s;
  let px = null, py = null;
  for (let t = 0; t <= 6.9; t += 0.15) {
    const k = 1 + (t > 6.28 ? 0.12 : 0) + Math.sin(t * 3) * 0.04;
    const x = cx + Math.cos(t) * rx * k, y = cy + Math.sin(t) * ry * k;
    if (px != null) { line(g, px, py, x, y, '#1f9fc0'); if (s >= 1.5) line(g, px, py + 1, x, y + 1, '#1f9fc0'); }
    px = x; py = y;
  }
  if (o.label) {
    ptext(g, 'L9', 3 * s, 3 * s, '#3b3630');
    line(g, 52 * s, 34 * s, 40 * s, 25 * s, '#1f9fc0'); line(g, 40 * s, 25 * s, 43 * s, 25 * s, '#1f9fc0'); line(g, 40 * s, 25 * s, 40 * s, 28 * s, '#1f9fc0');
  }
  c.classList.add('sketch');
  return c;
}

// ---------- tight vs slack cable, for a before/after ----------
function slackCompare() {
  const [c, g] = cnv(92, 16);
  const post = x => { R(g, x, 3, 2, 12, '#5c646b'); R(g, x, 3, 1, 12, '#8a9298'); R(g, x - 1, 2, 4, 1, C.gold); };
  post(2); post(38); drape(g, 4, 4, 38, 4, 2, '#e27a4e', 2);
  ptext(g, '→', 43, 6, '#6f6a60');
  post(52); post(88); drape(g, 54, 4, 88, 4, 9, '#e27a4e', 2);
  c.classList.add('px-inline');
  return c;
}

// a tiny activity sparkline
function spark(vals, col, h) {
  h = h || 5;
  const [c, g] = cnv(vals.length * 2, h);
  vals.forEach((v, i) => { const k = Math.max(1, Math.round(v * h)); R(g, i * 2, h - k, 1, k, col); });
  c.classList.add('spark');
  return c;
}

// a Piet-ish colour-block postcard (the drone's idea of a photo)
function postcard() {
  const [c, g] = cnv(24, 16);
  const blocks = [[0, 0, 24, 9, '#e8a83c'], [0, 0, 24, 4, '#f2c76e'], [9, 3, 6, 5, '#ffe9a8'], [0, 9, 24, 7, '#3c3f45'],
    [2, 7, 4, 9, '#5c646b'], [7, 5, 3, 11, '#45484f'], [15, 6, 5, 10, '#5c646b'], [20, 8, 4, 8, '#2c2f33'], [11, 12, 4, 1, '#e27a4e'], [3, 8, 1, 1, '#ffe9a8'], [17, 9, 1, 1, '#ffe9a8']];
  for (const [x, y, w, h, col] of blocks) R(g, x, y, w, h, col);
  c.classList.add('card-px');
  return c;
}
