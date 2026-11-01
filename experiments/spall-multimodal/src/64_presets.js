// ==========================================================================
// Preset environments and save slots. A preset is a recipe run on the
// generated city (same seed, same generator), so it costs no storage; a save
// slot stores the whole state (cells, world notes, wires, view) in this
// browser. Both live in the world menu under the wordmark.
// ==========================================================================
const PRESETS = [
  { id: 'voids', name: 'Four voids', note: 'the default: trunk and branch, bundles, girder bridge, a tangle' },
  { id: 'chasm', name: 'Chasm', note: 'one wide open expanse: a high cliff west, terraces east, a wall north' }
];
const SLOTS = 4;

// ---------- the Chasm ----------
// A wide expanse carved out of the middle of the city down to the old street level, so its
// floor is what's left of the street city: ruins, streets, two pools. West: a sheer cliff of
// old building mass, 12-16 levels, with ledges and recesses in its face. East: terraces that
// step up away from it. North: a mid-height wall with a gallery along its edge. South: the
// generated city as it is. Two megacolumn cores stay standing in the expanse, with a platform
// on pillars and a bridge stub off the cliff.
function buildChasm() {
  const rnd = mulberry32(S.seed * 13 + 5), RI = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const X0 = 15, X1 = 50, Y0 = 11, Y1 = 55;              // the expanse (ends exclusive)
  const inE = (x, y) => x >= X0 && x < X1 && y >= Y0 && y < Y1;
  const solid = (x, y, z) => { const t = cell(x, y, z); return t === T.OLD || t === T.CORE || t === T.LIFT; };
  const oldCell = (x, y, z) => { if (!coreAt(x, y)) setC(x, y, z, T.OLD, RI(0, 3) | (RI(0, 3) << 3)); };
  const clearAbove = (x, y, z) => { for (let k = z; k < NL; k++) if (!coreAt(x, y)) setC(x, y, k, T.EMPTY); };
  const deck = (x, y, z) => { if (coreAt(x, y) || !inb(x, y, z)) return; setC(x, y, z, T.DECK, 0); for (let k = z + 1; k < Math.min(NL, z + 3); k++) if (!solid(x, y, k)) setC(x, y, k, T.EMPTY); };
  // two cores stay as towers in the expanse; the others inside it go (their undercroft stubs stay)
  const inside = WORLD.cores.filter(c => inE(c.x, c.y) || inE(c.x + c.s - 1, c.y + c.s - 1)).sort((a, b) => (a.x + a.y) - (b.x + b.y));
  const keep = new Set(inside.length > 2 ? [inside[0], inside[inside.length - 1]] : inside);
  for (const c of inside) if (!keep.has(c)) for (let z = 3; z < NL; z++) for (let dy = 0; dy < c.s; dy++) for (let dx = 0; dx < c.s; dx++) setC(c.x + dx, c.y + dy, z, T.EMPTY);
  WORLD.cores = WORLD.cores.filter(c => !inside.includes(c) || keep.has(c));
  WORLD.lifts = WORLD.lifts.filter(l => WORLD.cores.includes(l.core));
  // carve down to the street level
  for (let z = 3; z < NL; z++) for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) if (!coreAt(x, y)) setC(x, y, z, T.EMPTY);
  // the floor: the old street city razed unevenly, some lots to the street, some left as broken stubs
  for (const lot of WORLD.lots || []) {
    if (!inE(lot.x, lot.y) || !inE(lot.x + lot.w - 1, lot.y + lot.h - 1)) continue;
    if (rnd() < 0.5) continue;                                             // razed: just its ground floor left
    const top = 3 + Math.min(2, RI(0, lot.hgt));                           // the rest: low broken stubs, the floor stays open
    for (let y = lot.y; y < lot.y + lot.h; y++) for (let x = lot.x; x < lot.x + lot.w; x++) for (let z = 3; z < top; z++) {
      const crumble = (z - 3) / Math.max(1, top - 3) * 0.45;                // the higher, the more is missing
      if (rnd() >= crumble) oldCell(x, y, z);
    }
  }
  for (let k = 0; k < 2; k++) {                                              // a couple of gutted mid-rises
    const w = RI(2, 3), h = RI(2, 3), x0 = RI(X0 + 4, X1 - w - 4), y0 = RI(Y0 + 4, Y1 - h - 4), top = RI(6, 10);
    for (let z = 3; z < top; z++) for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
      const edge = x === x0 || x === x0 + w - 1 || y === y0 || y === y0 + h - 1;
      if (edge && rnd() > 0.12 + (z - 3) * 0.05) oldCell(x, y, z);
    }
    if (rnd() < 0.7) for (let x = x0 - 1; x <= x0 + w; x++) deck(x, y0 + h, RI(4, top - 1));   // a balcony off one side
  }
  for (let k = 0; k < 2; k++) {                                              // pools in the floor
    const w = RI(4, 7), h = RI(3, 6), px = RI(X0 + 3, X1 - w - 3), py = RI(Y0 + 4, Y1 - h - 4);
    for (let y = py; y < py + h; y++) for (let x = px; x < px + w; x++) if (!coreAt(x, y)) { setC(x, y, 2, T.WATER); clearAbove(x, y, 3); }
  }
  // west: the cliff, built in bays along y. Each bay has its own height (now and then one stops
  // well short), and its face steps in and out level by level, so floors overhang and set back.
  for (let y = 0; y < D;) {
    const len = RI(3, 6), H = rnd() < 0.18 ? RI(7, 11) : RI(12, 16);
    let sb = RI(0, 2);
    const back = [];
    for (let z = 3; z <= H; z++) { sb = clamp(sb + (rnd() < 0.35 ? RI(-1, 1) : 0), 0, 3); back[z] = sb; }
    const loggia = rnd() < 0.5 ? RI(5, H - 2) : -1;                        // one level hollowed deep, a street in the cliff
    for (let yy = y; yy < Math.min(D, y + len); yy++) {
      for (let z = 3; z <= H; z++) {
        const face = X0 - 1 - back[z] - (z === loggia ? 3 : 0);
        for (let x = 1; x < X0; x++) { if (x <= face) oldCell(x, yy, z); else if (!coreAt(x, yy)) setC(x, yy, z, T.EMPTY); }
        if (z === loggia) deck(face + 1, yy, z);
      }
      for (let x = 1; x < X0; x++) clearAbove(x, yy, H + 1);
    }
    y += len;
  }
  for (let k = 0; k < 7; k++) {                                              // ledges off the face
    const z = RI(4, 13), y0 = RI(Y0 + 1, Y1 - 9), n = RI(3, 8);
    for (let y = y0; y < y0 + n; y++) { let x = X0 - 1; while (x > 1 && !cell(x, y, z)) x--; deck(x + 1, y, z); }
  }
  // east: terraces stepping up away from the expanse, each band along y a step higher or lower
  const stepOf = y => [0, 1, -1, 0, 1, 0, -1][Math.floor(y / 5) % 7];
  for (let x = X1; x < W; x++) for (let y = 0; y < D; y++) {
    const h = clamp(4 + 2 * Math.floor((x - X1) / 3) + 2 * stepOf(y), 3, 14);
    for (let z = 3; z < h; z++) oldCell(x, y, z); clearAbove(x, y, h);
  }
  for (let k = 0; k < 14; k++) {                                             // gardens and sheds on the steps
    const x = RI(X1, W - 2), y = RI(2, D - 3), h = clamp(4 + 2 * Math.floor((x - X1) / 3) + 2 * stepOf(y), 3, 14);
    if (coreAt(x, y) || h + 1 >= NL) continue;
    if (rnd() < 0.6) { setC(x, y, h, T.TERRACE, 0); if (rnd() < 0.6) setC(x, y, h + 1, T.TREE, RI(0, 3)); }
    else oldCell(x, y, h);
  }
  // north: terraced too, stepping up away from the expanse, with a gallery along its edge
  for (let y = 0; y < Y0; y++) for (let x = X0; x < X1; x++) {
    const h = clamp(6 + 2 * Math.floor((Y0 - 1 - y) / 3) + 2 * [0, 1, 0, -1, 1][Math.floor(x / 6) % 5], 4, 14);
    for (let z = 3; z < h; z++) oldCell(x, y, z); clearAbove(x, y, h);
  }
  for (let x = X0; x < X1; x++) deck(x, Y0, 6);
  // the upper city: a lid over everything but the chasm. Blocks of old building mass from L15
  // up to anywhere between L16 and L27, carried by the megacolumns (raised to meet it, a few
  // as spires) and by thin columns, with light wells punched through. Over the expanse it stays
  // open, the rim overhanging a little here and there on its upper floors, so at midday the
  // chasm is a pool of light and the city under the lid sits in shade.
  const LID = 17, blk = new Map(), ohm = new Map();
  const blockTop = (x, y) => { const k = (x / 6 | 0) * 100 + (y / 6 | 0); if (!blk.has(k)) blk.set(k, rnd() < 0.15 ? LID + RI(1, 3) : RI(21, NL - 3)); return blk.get(k); };
  const oh = (side, k) => { const key = side + k; if (!ohm.has(key)) ohm.set(key, [0, 0, 1, 2][RI(0, 3)]); return ohm.get(key); };
  const opening = (x, y, z) => {
    const up = z >= LID + 2, w = up ? oh('w', y / 5 | 0) : 0, e = up ? oh('e', y / 5 | 0) : 0, n = up ? oh('n', x / 5 | 0) : 0, s = up ? oh('s', x / 5 | 0) : 0;
    return x >= X0 + w && x < X1 - e && y >= Y0 + n && y < Y1 - s;
  };
  const wells = [];
  while (wells.length < 7) { const wx = RI(2, W - 5), wy = RI(2, D - 5); if (!(wx + 3 >= X0 && wx <= X1 && wy + 3 >= Y0 && wy <= Y1)) wells.push([wx, wy, RI(2, 3)]); }
  const inWell = (x, y) => wells.some(([wx, wy, n]) => x >= wx && x < wx + n && y >= wy && y < wy + n);
  for (let y = 0; y < D; y++) for (let x = 0; x < W; x++) {
    if (coreAt(x, y) || inWell(x, y)) continue;
    const top = blockTop(x, y);
    for (let z = LID; z <= top; z++) if (!opening(x, y, z)) oldCell(x, y, z);
  }
  for (const c of WORLD.cores) {                                             // megacolumns rise to meet it
    if (keep.has(c)) continue;
    const top = Math.min(NL - 2, Math.max(c.top, blockTop(c.x, c.y)) + (rnd() < 0.3 ? RI(1, 3) : 0)), lx = c.x + 1, ly = c.y + 1;
    for (let z = c.top + 1; z <= top; z++) for (let dy = 0; dy < c.s; dy++) for (let dx = 0; dx < c.s; dx++)
      setC(c.x + dx, c.y + dy, z, (c.x + dx === lx && c.y + dy === ly) ? T.LIFT : T.CORE, hash3(c.x + dx, c.y + dy, z) & 3);
    c.top = top; const l = WORLD.lifts.find(q => q.core === c); if (l) l.top = top;
  }
  for (let y = 3; y < D; y += 7) for (let x = 3; x < W; x += 7) {             // thin columns where the lid spans open air
    if (opening(x, y, LID) || inWell(x, y) || coreAt(x, y)) continue;
    let z = LID - 1; while (z > 2 && !cell(x, y, z)) z--;
    if (LID - 1 - z >= 2) for (let k = z + 1; k < LID; k++) setC(x, y, k, T.PILLAR, k === z + 1 ? 1 : 0);
  }
  for (let k = 0; k < 24; k++) {                                             // gardens on the lid
    const x = RI(1, W - 2), y = RI(1, D - 2); if (opening(x, y, LID) || coreAt(x, y)) continue;
    let z = NL - 1; while (z > LID && !cell(x, y, z)) z--;
    if (cell(x, y, z) === T.OLD && z + 2 < NL) { setC(x, y, z + 1, T.TERRACE, 0); if (rnd() < 0.5) setC(x, y, z + 2, T.TREE, RI(0, 3)); }
  }
  { const y = Y0 + RI(14, 20); for (let x = X0 - 2; x < X1 + 2; x++) { deck(x, y, 22); deck(x, y + 1, 22); } }   // a crossing high up, under the open sky
  // everywhere: a little erosion, so no mass is a clean block (holes in faces that see the air)
  for (let z = 4; z < NL - 1; z++) for (let y = 1; y < D - 1; y++) for (let x = 1; x < W - 1; x++) {
    if (cell(x, y, z) !== T.OLD || coreAt(x, y)) continue;
    const open = !cell(x + 1, y, z) || !cell(x - 1, y, z) || !cell(x, y + 1, z) || !cell(x, y - 1, z);
    if (open && rnd() < 0.06) setC(x, y, z, T.EMPTY);
  }
  // in the expanse: a platform on pillars, a bridge stub off the cliff, and two high crossings
  // whose shadows fall across the floor
  const px = X0 + RI(11, 15), py = Y0 + RI(17, 21);
  for (let y = py; y < py + 4; y++) for (let x = px; x < px + 5; x++) deck(x, y, 6);
  for (const [x, y] of [[px, py], [px + 4, py], [px, py + 3], [px + 4, py + 3]]) for (let z = 3; z < 6; z++) setC(x, y, z, T.PILLAR, z === 3 ? 1 : 0);
  const yb = Y0 + RI(26, 32);
  for (let x = X0 - 2; x < X0 + 9; x++) { deck(x, yb, 10); deck(x, yb + 1, 10); }
  for (const [y, z, x1] of [[Y0 + RI(6, 10), 13, X1 - RI(0, 6)], [Y0 + RI(34, 38), 12, X0 + RI(16, 22)]]) for (let x = X0 - 2; x < x1; x++) { deck(x, y, z); deck(x, y + 1, z); }
  computeLight(); computeFill();
  WORLD.paths = WORLD.paths.filter(p => p.cells.every(q => cell(q.x, q.y, p.z)));
  const V = { x0: X0, y0: Y0, x1: X1, y1: Y1 };
  return { V, voids: [{ V }], view: LID - 1, focus: [(X0 + X1) / 2, (Y0 + Y1) / 2, 4], zf: 2.25, LT: 10, LW: 6, LE: 10, YT: Y0 - 1, XA: X0, XB: X1 - 1, XO: X0 };
}

// ---------- presets ----------
function resetWorldState() {
  JOBS = []; DRONES = []; PUFFS = []; S.pins = []; renderChips(); hideCard(); agentReset(); setFloor(-1);
  UNDO.past = []; UNDO.future = [];
}
function loadPreset(id) {
  generate(S.seed); $('seedv').textContent = S.seed;
  resetWorldState();
  if (id === 'chasm') { clearWires(); WIRES.stage = buildChasm(); initBirds(); }
  else seedWires();
  initLife(); markAllDirty(); skyDirty = true; stripDirty = true;
  setLevel(WIRES.stage.view, { silent: true, snap: true }); centerOn(...WIRES.stage.focus);
  S.preset = id;
  log('sys', `Loaded preset · ${PRESETS.find(p => p.id === id).name} · seed ${S.seed}`, 'sys');
}

// ---------- save slots ----------
function u8ToB64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
function b64ToU8(b) { const s = atob(b), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
const r3 = v => Math.round(v * 1000) / 1000;
function saveState(name) {
  const sn = snapWires();
  return {
    v: 1, name, at: Date.now(), seed: S.seed, preset: S.preset || 'voids',
    cells: u8ToB64(cells), vars: u8ToB64(vars), flags: u8ToB64(flags),
    world: Object.assign({}, WORLD, { fill: Array.from(WORLD.fill), lifts: WORLD.lifts.map(l => Object.assign({}, l, { core: l.core && l.core.name })) }),
    stage: WIRES.stage,
    wires: Object.assign({}, sn, { cables: sn.cables.map(c => Object.assign({}, c, { X: Array.from(c.X, r3), W: Array.from(c.W, r3) })) }),
    view: { level: S.level, cam: [S.cam.x, S.cam.y], zoom: S.zoom, rot: S.rot, sun: LIT.sun, lit: LIT.on }
  };
}
function restoreState(d) {
  cells.set(b64ToU8(d.cells)); vars.set(b64ToU8(d.vars)); flags.set(b64ToU8(d.flags));
  const w = d.world; WORLD = Object.assign({}, w, { fill: new Float32Array(w.fill) });
  WORLD.lifts = w.lifts.map(l => Object.assign({}, l, { core: WORLD.cores.find(c => c.name === l.core) || null }));
  S.seed = d.seed; S.preset = d.preset; $('seedv').textContent = S.seed;
  computeLight(); computeFill(); resetWorldState();
  clearWires();
  loadWires(Object.assign({}, d.wires, { cables: d.wires.cables.map(c => Object.assign({}, c, { X: new Float32Array(c.X), W: new Float32Array(c.W) })) }));
  WIRES.stage = d.stage;
  initLife(); initBirds();
  if (d.view.rot !== S.rot) { S.rot = d.view.rot; }
  LIT.sun = d.view.sun || LIT.sun; LIT.on = d.view.lit !== false;
  SPR = new Map(); GHOST.clear(); podSprites(); markAllDirty(); skyDirty = true; stripDirty = true;
  if (LIT.on) setLightTime(LIT.sun);
  $('bLight').setAttribute('aria-pressed', LIT.on);
  setZoom(d.view.zoom); S.cam.x = d.view.cam[0]; S.cam.y = d.view.cam[1]; S.camTarget = null;
  setLevel(d.view.level, { silent: true, snap: true });
}
const slotKey = k => 'stratum.slot.' + k;
function slotInfo(k) { try { const s = localStorage.getItem(slotKey(k)); if (!s) return null; const d = JSON.parse(s); return { name: d.name, at: d.at, cables: d.wires.cables.length, preset: d.preset }; } catch (e) { return null; } }
function saveSlot(k) {
  const pre = PRESETS.find(p => p.id === S.preset), d = saveState((pre ? pre.name : 'World') + ' · seed ' + S.seed);
  try { localStorage.setItem(slotKey(k), JSON.stringify(d)); toast(`Saved to slot ${k}`); }
  catch (e) { toast('Could not save: this browser\'s storage is full or unavailable'); }
  syncWorldMenu();
}
function loadSlot(k) {
  let d = null; try { d = JSON.parse(localStorage.getItem(slotKey(k))); } catch (e) { /* unreadable slot: treated as empty */ }
  if (!d) { toast(`Slot ${k} is empty`); return; }
  restoreState(d); toast(`Loaded slot ${k}`); log('sys', `Loaded slot ${k} · ${d.name}`, 'sys');
}

// ---------- the world menu (click the wordmark text): the sheet, presets, save slots, new seed, interface, keys ----------
function setupWorldMenu() {
  const pop = document.createElement('div'); pop.id = 'worldPop'; pop.className = 'popm pn'; pop.hidden = true;
  document.body.appendChild(pop);
  const name = $('wmText');
  const open = () => { const r = name.getBoundingClientRect(); syncWorldMenu(); pop.hidden = false; pop.style.left = clamp(r.left, 4, innerWidth - pop.offsetWidth - 4) + 'px'; pop.style.top = r.bottom + 6 + 'px'; name.setAttribute('aria-expanded', 'true'); };
  const close = () => { pop.hidden = true; name.setAttribute('aria-expanded', 'false'); };
  name.addEventListener('click', () => pop.hidden ? open() : close());
  pop.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.preset) { close(); loadPreset(b.dataset.preset); }
    else if (b.dataset.save) saveSlot(+b.dataset.save);
    else if (b.dataset.load) { close(); loadSlot(+b.dataset.load); }
    else if (b.dataset.seed) { close(); S.seed += 1; loadPreset(S.preset || 'voids'); }
    else if (b.dataset.tone) { setUiTone(b.dataset.tone === 'dark'); syncWorldMenu(); }
    else if (b.dataset.keys) { close(); openKeys(); }
    else return;
    sfx.click();
  });
  document.addEventListener('pointerdown', e => { if (!pop.hidden && !pop.contains(e.target) && !name.contains(e.target)) close(); });
}
function syncWorldMenu() {
  const pop = $('worldPop'); if (!pop) return;
  const when = t => { const d = new Date(t); return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + d.toTimeString().slice(0, 5); };
  const dark = UICFG.MT === 10 || UICFG.MT === 16;
  pop.innerHTML = `<div class="lp-h ttl"><span>Spall</span><span class="lp-dim">wires study · sheet 02 · seed ${S.seed}</span></div>
    <div class="lp-sub">Presets <span class="lp-dim">replace the scene</span></div>` +
    PRESETS.map(p => `<div class="lp-row"><button type="button" class="btn" data-preset="${p.id}" aria-pressed="${S.preset === p.id}">${p.name}</button><span class="lp-note">${p.note}</span></div>`).join('') +
    `<div class="lp-sub">Save slots <span class="lp-dim">in this browser</span></div>` +
    Array.from({ length: SLOTS }, (_, j) => { const k = j + 1, s = slotInfo(k);
      return `<div class="lp-row"><span class="lp-slot">${k}</span><span class="lp-note">${s ? `${s.name} · ${s.cables} cables · ${when(s.at)}` : 'empty'}</span><span class="lp-btns"><button type="button" class="btn" data-save="${k}">Save</button>${s ? `<button type="button" class="btn" data-load="${k}">Load</button>` : ''}</span></div>`; }).join('') +
    `<div class="lp-row"><button type="button" class="btn" data-seed="1">New seed</button><span class="lp-note">regenerate the current preset</span></div>
    <div class="lp-sub">Interface</div>
    <div class="lp-row"><span class="sgc" role="radiogroup" aria-label="Interface tone" style="--n:2;--i:${dark ? 1 : 0}"><button type="button" class="${dark ? '' : 'on'}" data-tone="light" role="radio" aria-checked="${!dark}">Light</button><button type="button" class="${dark ? 'on' : ''}" data-tone="dark" role="radio" aria-checked="${dark}">Dark</button><i class="ind"></i></span><span class="lp-note">the chrome only; the scene keeps its time of day</span></div>
    <div class="lp-row"><button type="button" class="btn" data-keys="1">Keys</button><span class="lp-note">every shortcut</span></div>`;
}
