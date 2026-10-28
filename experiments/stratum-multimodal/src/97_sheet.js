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
