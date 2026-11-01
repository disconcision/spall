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
