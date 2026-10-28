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
