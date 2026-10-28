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
