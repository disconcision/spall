// ==========================================================================
// World generation: old street grid, cores, decks, tubes, infill, gardens,
// canopy, light wells, undercroft. Seeded + deterministic.
// ==========================================================================
function setC(x, y, z, t, v) { if (!inb(x, y, z)) return; const i = idx(x, y, z); cells[i] = t; vars[i] = v || 0; }
const isEmpty = (x, y, z) => inb(x, y, z) && cells[idx(x, y, z)] === 0;
function coreAt(x, y) { for (const c of WORLD.cores) if (x >= c.x && x < c.x + c.s && y >= c.y && y < c.y + c.s) return c; return null; }
const coreCenter = c => [c.x + (c.s >> 1), c.y + (c.s >> 1)];
// something to stand on / hang from
function supportAt(x, y, z) {
  const b = cell(x, y, z - 1);
  if (b && b !== T.TREE && b !== T.WATER && b !== T.LAMP && b !== T.VENT && b !== T.ANTENNA) return true;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = cell(x + dx, y + dy, z); if (n === T.CORE || n === T.LIFT) return true; }
  return false;
}

function generate(seed) {
  const rng = mulberry32(seed);
  const R = rng, RI = (a, b) => a + Math.floor(rng() * (b - a + 1)), pick = a => a[Math.floor(rng() * a.length)];
  cells.fill(0); vars.fill(0); flags.fill(0);
  rr = mulberry32(seed ^ 0x5bd1e995);
  const Wd = WORLD = { cores: [], paths: [], wells: [], lifts: [], emitters: [], crane: null, fill: new Float32Array(NL), cistern: null, lots: [] };

  // 1. ground mass ------------------------------------------------------------
  for (let y = 0; y < D; y++) for (let x = 0; x < W; x++) { setC(x, y, 0, T.ROCK, hash3(x, y, 0) & 3 | 4); setC(x, y, 1, T.EARTH, hash3(x, y, 1) & 3); }

  // 2. undercroft: pillared cistern, service tunnels, plant rooms --------------
  const cw = RI(10, 13), chh = RI(8, 10), cx0 = RI(12, 20), cy0 = RI(18, 26);
  Wd.cistern = { x: cx0, y: cy0, w: cw, h: chh };
  for (let y = cy0; y < cy0 + chh; y++) for (let x = cx0; x < cx0 + cw; x++) {
    if ((x - cx0) % 3 === 1 && (y - cy0) % 3 === 1) { setC(x, y, 0, T.VAULT, 1); setC(x, y, 1, T.VAULT, 0); }
    else { setC(x, y, 0, T.WATER); setC(x, y, 1, T.EMPTY); }
  }
  const tunnels = [];
  for (let k = 0; k < 2; k++) tunnels.push({ axis: 0, c: RI(5, 42) });
  for (let k = 0; k < 2; k++) tunnels.push({ axis: 1, c: RI(5, 42) });
  for (const tn of tunnels) for (let s = 2; s < W - 2; s++) {
    const a = tn.axis === 0 ? [s, tn.c] : [tn.c, s], b = tn.axis === 0 ? [s, tn.c + 1] : [tn.c + 1, s];
    if (cell(a[0], a[1], 1) === T.EARTH) setC(a[0], a[1], 1, (s % 7 === 3) ? T.LAMP : T.EMPTY, 0);
    if (cell(b[0], b[1], 1) === T.EARTH) setC(b[0], b[1], 1, T.PIPE, tn.axis | ((tn.c & 1) << 1));
  }
  for (let k = 0; k < 3; k++) {
    const tn = pick(tunnels), s = RI(6, 38), side = R() < 0.5 ? -3 : 2;
    const bx = tn.axis === 0 ? s : tn.c + side, by = tn.axis === 0 ? tn.c + side : s;
    for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) if (cell(bx + dx, by + dy, 1) === T.EARTH) setC(bx + dx, by + dy, 1, T.EMPTY);
    if (inb(bx + 1, by + 1, 1)) setC(bx + 1, by + 1, 1, T.TANK, RI(0, 1));
    if (R() < 0.7 && inb(bx, by, 1)) setC(bx, by, 1, T.TANK, 1);
  }

  // 3. the old city at L0: streets + small buildings ---------------------------
  const roadLines = [3, 11, 19, 27, 35, 43];
  const rx = new Uint8Array(W), ry = new Uint8Array(D);
  roadLines.forEach(r => { rx[r] = rx[r + 1] = 1; ry[r] = ry[r + 1] = 1; });
  const seg = v => v < 3 ? 0 : Math.floor((v - 5) / 8) + 1;
  const dropNS = new Set(), dropEW = new Set();
  roadLines.forEach(r => { for (let j = 0; j < 7; j++) { if (R() < 0.17) dropNS.add(r * 10 + j); if (R() < 0.17) dropEW.add(r * 10 + j); } });
  const isRoad = (x, y) => {
    const ns = rx[x] && (ry[y] || !dropNS.has((rx[x - 1] ? x - 1 : x) * 10 + seg(y)));
    const ew = ry[y] && (rx[x] || !dropEW.has((ry[y - 1] ? y - 1 : y) * 10 + seg(x)));
    return ns || ew;
  };
  const road = new Uint8Array(W * D);
  for (let y = 0; y < D; y++) for (let x = 0; x < W; x++) if (isRoad(x, y)) {
    road[y * W + x] = 1;
    const ns = rx[x] && !ry[y], ew = ry[y] && !rx[x];
    let mark = 0, orient = ns ? 1 : 0;
    if (ns && (ry[y - 1] || ry[y + 1])) mark = 2;
    else if (ew && (rx[x - 1] || rx[x + 1])) mark = 2;
    else if (ns || ew) mark = ((ns ? y : x) & 1) ? 1 : 0;
    if (mark < 2 && (ns || ew) && R() < 0.035) mark = 4;
    setC(x, y, 2, T.STREET, orient | (mark << 1));
  }
  const taken = new Uint8Array(W * D);
  for (let y = 0; y < D; y++) for (let x = 0; x < W; x++) {
    if (road[y * W + x] || taken[y * W + x]) continue;
    let w = RI(2, 4), h = RI(2, 4);
    let ww = 0; while (ww < w && x + ww < W && !road[y * W + x + ww] && !taken[y * W + x + ww]) ww++;
    let hh = 0; outer: while (hh < h && y + hh < D) { for (let k = 0; k < ww; k++) if (road[(y + hh) * W + x + k] || taken[(y + hh) * W + x + k]) break outer; hh++; }
    for (let j = 0; j < hh; j++) for (let k = 0; k < ww; k++) taken[(y + j) * W + x + k] = 1;
    if (R() < 0.13 || ww * hh === 1) {
      for (let j = 0; j < hh; j++) for (let k = 0; k < ww; k++) setC(x + k, y + j, 2, T.WALK, 0);
      if (ww >= 2 && hh >= 2) setC(x + (ww >> 1), y + (hh >> 1), 2, T.TREE, RI(0, 3));
      else if (R() < 0.5) setC(x, y, 2, T.LAMP, 1);
    } else {
      const hgt = pick([1, 2, 2, 2, 3, 3]), mat = RI(0, 3);
      for (let j = 0; j < hh; j++) for (let k = 0; k < ww; k++) for (let z = 2; z < 2 + hgt; z++) setC(x + k, y + j, z, T.OLD, mat | (RI(0, 3) << 3));
      if (R() < 0.45) { const k = RI(0, ww - 1), j = RI(0, hh - 1), z = 2 + RI(0, hgt - 1); flags[idx(x + k, y + j, z)] |= F_SIGN; }
      if (R() < 0.2) { setC(x, y, 2 + hgt, T.VENT, 0); Wd.emitters.push({ x, y, z: 2 + hgt, k: 'vent' }); }
      Wd.lots.push({ x, y, w: ww, h: hh, hgt });
    }
  }

  // 4. megacolumn cores ---------------------------------------------------------
  const skip = RI(0, 8);
  for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
    if (j * 3 + i === skip) continue;
    const s = (i === 1 && j === 1) ? 4 : 3;
    Wd.cores.push({ x: 6 + i * 16 + RI(-2, 2), y: 6 + j * 16 + RI(-2, 2), s, top: RI(13, 15) });
  }
  Wd.cores.forEach((c, k) => { c.name = 'C' + (k + 1); });
  pick(Wd.cores).top = 16;
  for (const c of Wd.cores) {
    const lx = c.x + 1, ly = c.y + 1;
    for (let z = 0; z <= c.top; z++) for (let dy = 0; dy < c.s; dy++) for (let dx = 0; dx < c.s; dx++)
      setC(c.x + dx, c.y + dy, z, (c.x + dx === lx && c.y + dy === ly) ? T.LIFT : T.CORE, hash3(c.x + dx, c.y + dy, z) & 3);
    Wd.lifts.push({ x: lx, y: ly, top: c.top, z: RI(1, c.top), target: RI(0, c.top), wait: R() * 3, core: c });
  }

  // helpers for corridors
  function mst(list) {
    const edges = [], inT = [0];
    while (inT.length < list.length) {
      let best = null;
      for (const a of inT) for (let b = 0; b < list.length; b++) {
        if (inT.includes(b)) continue;
        const [ax, ay] = coreCenter(list[a]), [bx, by] = coreCenter(list[b]);
        const d = Math.abs(ax - bx) + Math.abs(ay - by);
        if (!best || d < best[2]) best = [a, b, d];
      }
      edges.push([list[best[0]], list[best[1]]]); inT.push(best[1]);
    }
    return edges;
  }
  function corridor(a, b, z, width, type, xFirst, kind) {
    const [ax, ay] = coreCenter(a), [bx, by] = coreCenter(b);
    const pts = [[ax, ay]]; let x = ax, y = ay;
    const stepTo = (tx, ty) => { while (x !== tx || y !== ty) { if (x !== tx) x += Math.sign(tx - x); else y += Math.sign(ty - y); pts.push([x, y]); } };
    if (xFirst) { stepTo(bx, ay); stepTo(bx, by); } else { stepTo(ax, by); stepTo(bx, by); }
    let run = [];
    const flush = () => { if (run.length >= 4) Wd.paths.push({ cells: run, z, kind }); run = []; };
    for (let k = 0; k < pts.length; k++) {
      const [px, py] = pts[k];
      if (coreAt(px, py)) { flush(); continue; }
      const n = pts[Math.min(k + 1, pts.length - 1)], p = pts[Math.max(k - 1, 0)];
      const axis = Math.abs(n[0] - p[0]) >= Math.abs(n[1] - p[1]) ? 0 : 1;
      const perp = axis === 0 ? [0, 1] : [1, 0];
      const ok = cell(px, py, z) === 0 || cell(px, py, z) === type;
      if (!ok) { flush(); continue; }
      setC(px, py, z, type, axis);
      if (width === 2 && isEmpty(px + perp[0], py + perp[1], z)) setC(px + perp[0], py + perp[1], z, type, axis);
      run.push({ x: px, y: py, axis, perp: width === 2 ? perp : [0, 0] });
    }
    flush();
  }

  // 5. transit decks (L4) with pillars, tubes (L6), upper transit (L10) ---------
  const deckEdges = mst(Wd.cores);
  for (let k = 0; k < 1; k++) { const a = pick(Wd.cores), b = pick(Wd.cores); if (a !== b) deckEdges.push([a, b]); }
  const p0 = Wd.paths.length;
  deckEdges.forEach(([a, b]) => corridor(a, b, 6, 2, T.DECK, R() < 0.5, 'deck'));
  for (let pi = p0; pi < Wd.paths.length; pi++) Wd.paths[pi].cells.forEach((c, k) => {
    if (k % 5 !== 2) return;
    for (let z = 5; z >= 2; z--) {
      const t = cell(c.x, c.y, z);
      if (t === T.EMPTY) { setC(c.x, c.y, z, T.PILLAR, (z === 2 || cell(c.x, c.y, z - 1) !== 0) ? 1 : 0); if (cell(c.x, c.y, z - 1) !== 0) break; }
      else if (z === 2 && (t === T.STREET || t === T.WALK)) { setC(c.x, c.y, 2, T.PILLAR, 3); break; }
      else break;
    }
  });
  const pairs = [];
  for (let a = 0; a < Wd.cores.length; a++) for (let b = a + 1; b < Wd.cores.length; b++) {
    const A = Wd.cores[a], B = Wd.cores[b];
    if (Math.abs(A.y - B.y) <= 2 || Math.abs(A.x - B.x) <= 2) pairs.push([A, B]);
  }
  for (let k = 0; k < 3 && pairs.length; k++) {
    const [A, B] = pairs.splice(Math.floor(R() * pairs.length), 1)[0];
    corridor(A, B, 8, 1, T.TUBE, Math.abs(A.y - B.y) <= 2, 'tube');
  }
  mst(Wd.cores.slice().sort(() => R() - 0.5)).forEach(([a, b]) => corridor(a, b, 12, 1, T.DECK, R() < 0.5, 'deck'));

  // 6. sky garden (L7) on a truss grid (L6) --------------------------------------
  let best = null;
  for (const A of Wd.cores) for (const B of Wd.cores) {
    if (A === B) continue;
    const [ax, ay] = coreCenter(A), [bx, by] = coreCenter(B);
    const d = Math.abs(ax - bx) + Math.abs(ay - by), m = Math.abs((ax + bx) / 2 - 24) + Math.abs((ay + by) / 2 - 24);
    if (d >= 10 && d <= 22 && (!best || m < best[2])) best = [A, B, m];
  }
  if (best) {
    const [A, B] = best;
    let gx0 = Math.min(A.x, B.x) + 1, gx1 = Math.max(A.x + A.s, B.x + B.s) - 2, gy0 = Math.min(A.y, B.y) + 1, gy1 = Math.max(A.y + A.s, B.y + B.s) - 2;
    if (gx1 - gx0 < 5) { gx0 -= 2; gx1 += 2; } if (gy1 - gy0 < 5) { gy0 -= 2; gy1 += 2; }
    gx1 = Math.min(gx1, gx0 + 13); gy1 = Math.min(gy1, gy0 + 11);
    Wd.garden = { x0: gx0, y0: gy0, x1: gx1, y1: gy1 };
    const pw = RI(gx0 + 2, gx1 - 3), ph = RI(gy0 + 2, gy1 - 3);
    for (let y = gy0; y <= gy1; y++) for (let x = gx0; x <= gx1; x++) {
      if (!isEmpty(x, y, 9)) continue;
      if (x >= pw && x < pw + 2 && y >= ph && y < ph + 3) setC(x, y, 9, T.WATER, 1);
      else if (R() < 0.3) setC(x, y, 9, T.TREE, RI(0, 3));
      else setC(x, y, 9, T.TERRACE, R() < 0.2 ? 16 : 0);
      if (((x - gx0) % 3 === 0 || (y - gy0) % 3 === 0) && isEmpty(x, y, 8)) setC(x, y, 8, T.TRUSS, (x + y) & 1);
    }
  }
  // extra transfer trusses (L8) between aligned cores
  for (let k = 0; k < 2 && pairs.length; k++) { const [A, B] = pairs.splice(Math.floor(R() * pairs.length), 1)[0]; corridor(A, B, 10, 1, T.TRUSS, Math.abs(A.y - B.y) <= 2, 'truss'); }
  Wd.paths = Wd.paths.filter(p => p.kind !== 'truss');

  // 7. supports + infill: frames around cores, capsules plugged in ----------------
  const bands = [[7, 8], [10, 11], [13, 13]];
  for (const c of Wd.cores) for (const band of bands) {
    if (band[1] > c.top) continue;
    const n = RI(2, 3);
    for (let k = 0; k < n; k++) {
      const side = RI(0, 3), along = RI(2, c.s + 3), out = RI(2, 6), off = RI(-2, 1);
      let x0, y0, x1, y1;
      if (side === 0) { x0 = c.x + c.s; x1 = x0 + out - 1; y0 = c.y + off; y1 = y0 + along - 1; }
      else if (side === 1) { x1 = c.x - 1; x0 = x1 - out + 1; y0 = c.y + off; y1 = y0 + along - 1; }
      else if (side === 2) { y0 = c.y + c.s; y1 = y0 + out - 1; x0 = c.x + off; x1 = x0 + along - 1; }
      else { y1 = c.y - 1; y0 = y1 - out + 1; x0 = c.x + off; x1 = x0 + along - 1; }
      for (let z = band[0]; z <= band[1]; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        if (!isEmpty(x, y, z)) continue;
        if (R() < 0.64) setC(x, y, z, T.CAPSULE, RI(0, 3) | (RI(0, 1) << 2) | (RI(0, 3) << 3));
        else setC(x, y, z, T.FRAME, 0);
      }
    }
  }
  // Kowloon-style accretion on old roofs (L2-L3)
  for (const L of Wd.lots) {
    const top = 2 + L.hgt;
    if (top > 5 || R() > 0.42) continue;
    const zs = top === 5 ? [5] : R() < 0.5 ? [top] : [top, top + 1];
    for (const z of zs) for (let j = 0; j < L.h; j++) for (let k = 0; k < L.w; k++) {
      if (!isEmpty(L.x + k, L.y + j, z) || R() < 0.25 || !supportAt(L.x + k, L.y + j, z)) continue;
      setC(L.x + k, L.y + j, z, R() < 0.72 ? T.CAPSULE : T.FRAME, RI(0, 3) | (RI(0, 1) << 2) | (RI(0, 3) << 3));
    }
  }
  // rooftop passage network at L3 (z=5): walkways over roofs, short plank bridges across gaps
  for (let wk = 0; wk < 9; wk++) {
    let x = RI(2, 45), y = RI(2, 45), tries = 0;
    while (!(cell(x, y, 4) && isEmpty(x, y, 5)) && tries++ < 200) { x = RI(2, 45); y = RI(2, 45); }
    if (tries >= 200) continue;
    let dir = RI(0, 3);
    for (let st = 0; st < 26; st++) {
      const dx = [1, 0, -1, 0][dir], dy = [0, 1, 0, -1][dir];
      if (cell(x, y, 5) === 0) setC(x, y, 5, T.ROOFWALK, dir & 1);
      let nx = x + dx, ny = y + dy, gap = 0;
      while (inb(nx + dx * gap, ny + dy * gap, 5) && !cell(nx + dx * gap, ny + dy * gap, 4) && gap < 4) gap++;
      if (!inb(nx, ny, 5) || !(isEmpty(nx, ny, 5) || cell(nx, ny, 5) === T.ROOFWALK) || gap > 3) { dir = (dir + (R() < 0.5 ? 1 : 3)) % 4; continue; }
      x = nx; y = ny;
      if (R() < 0.18) dir = RI(0, 3);
    }
  }
  // terraces / trees on top of habitation clusters
  for (let z = 7; z < NL - 1; z++) for (let y = 0; y < D; y++) for (let x = 0; x < W; x++) {
    const t = cell(x, y, z);
    if ((t === T.CAPSULE || t === T.FRAME) && isEmpty(x, y, z + 1) && R() < 0.3) setC(x, y, z + 1, R() < 0.35 ? T.TREE : T.TERRACE, RI(0, 3));
  }

  // 8. canopy (L12), canopy walk (L13), crown ------------------------------------
  for (const c of Wd.cores) {
    const r = RI(3, 6);
    for (let y = c.y - r; y < c.y + c.s + r; y++) for (let x = c.x - r; x < c.x + c.s + r; x++)
      if (isEmpty(x, y, 14) && R() < 0.8) setC(x, y, 14, T.CANOPY, (x + y) & 1);
  }
  mst(Wd.cores).forEach(([a, b]) => corridor(a, b, 15, 1, T.ROOFWALK, R() < 0.5, 'walk'));
  Wd.paths = Wd.paths.filter(p => p.kind !== 'walk');
  for (let y = 0; y < D; y++) for (let x = 0; x < W; x++) if (cell(x, y, 15) === T.ROOFWALK && R() < 0.12) {
    for (const [dx, dy] of [[1, 0], [0, 1]]) if (isEmpty(x + dx, y + dy, 15) && cell(x + dx, y + dy, 14)) { setC(x + dx, y + dy, 15, T.TREE, RI(0, 3)); break; }
  }
  let tall = Wd.cores[0];
  for (const c of Wd.cores) if (c.top > tall.top) tall = c;
  for (const c of Wd.cores) {
    if (c === tall) continue;
    if (R() < 0.6) setC(c.x + c.s - 1, c.y, c.top + 1, T.ANTENNA, 0);
    for (let dy = 0; dy < c.s; dy++) for (let dx = 0; dx < c.s; dx++) if (isEmpty(c.x + dx, c.y + dy, c.top + 1) && R() < 0.45) setC(c.x + dx, c.y + dy, c.top + 1, R() < 0.4 ? T.TREE : T.TERRACE, RI(0, 3));
  }
  Wd.crane = { x: tall.x + 1, y: tall.y + 1, z: tall.top + 1 };
  setC(Wd.crane.x, Wd.crane.y, Wd.crane.z, T.CRANE, 0);

  // 9. light wells: voids from sky to the undercroft pool ------------------------
  const wellSizes = [3, 2];
  for (let k = 0; k < 2; k++) {
    const s = wellSizes[k];
    for (let tries = 0; tries < 300; tries++) {
      let x, y;
      if (k === 0) { x = RI(cx0 - 1, cx0 + cw - s + 1); y = RI(cy0 - 1, cy0 + chh - s + 1); }
      else { x = RI(3, W - 3 - s); y = RI(3, D - 3 - s); }
      let ok = true;
      for (let dy = -1; dy <= s && ok; dy++) for (let dx = -1; dx <= s; dx++) if (coreAt(x + dx, y + dy) || !inb(x + dx, y + dy, 0)) { ok = false; break; }
      for (const w of Wd.wells) if (Math.abs(w.x - x) < 8 && Math.abs(w.y - y) < 8) ok = false;
      if (!ok) continue;
      for (let z = 0; z < NL; z++) for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) {
        const X = x + dx, Y = y + dy;
        if (z === 0) { if (cell(X, Y, 0) !== T.VAULT) setC(X, Y, 0, T.WATER, 0); }
        else if (cell(X, Y, z) !== T.VAULT) setC(X, Y, z, T.EMPTY);
        flags[idx(X, Y, z)] |= F_WELL;
      }
      for (let dy = -1; dy <= s; dy++) for (let dx = -1; dx <= s; dx++) if (cell(x + dx, y + dy, 2) === T.STREET) setC(x + dx, y + dy, 2, T.WALK, 0);
      Wd.wells.push({ x, y, s });
      break;
    }
  }

  // 10. risers, grates -------------------------------------------------------------
  for (let k = 0; k < 2; k++) {
    const c = pick(Wd.cores), rx0 = c.x + c.s, ry0 = c.y + RI(0, c.s - 1);
    for (let z = 1; z <= Math.min(12, c.top); z++) { const t = cell(rx0, ry0, z); if (t === T.EMPTY || t === T.EARTH) setC(rx0, ry0, z, T.RISER, 0); }
  }
  for (let y = 0; y < D; y++) for (let x = 0; x < W; x++) {
    if (cell(x, y, 2) !== T.STREET) continue;
    const below = cell(x, y, 1);
    if ((below === T.EMPTY || below === T.PIPE || below === T.LAMP) && R() < 0.14) {
      vars[idx(x, y, 2)] = (vars[idx(x, y, 2)] & 1) | (3 << 1); flags[idx(x, y, 2)] |= F_GRATE;
      Wd.emitters.push({ x, y, z: 2, k: 'grate' });
    }
  }
  computeLight();
  computeFill();
}

// baked sky exposure: 5 rays (straight up weighted x2, four 45° diagonals)
function computeLight(x0 = 0, y0 = 0, x1 = W - 1, y1 = D - 1, zmax = NL - 1) {
  const dirs = [[0, 0, 2], [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1]];
  for (let z = 0; z <= zmax; z++) for (let y = Math.max(0, y0); y <= Math.min(D - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) {
    const i = idx(x, y, z);
    let sum = 0;
    for (const [dx, dy, wgt] of dirs) {
      let tr = 1;
      for (let zz = z + 1, cx = x + dx, cy = y + dy; zz < NL; zz++, cx += dx, cy += dy) {
        if (cx < 0 || cy < 0 || cx >= W || cy >= D) break;
        const t = cells[idx(cx, cy, zz)];
        if (t) { tr *= 1 - TI[t].op; if (tr < 0.02) { tr = 0; break; } }
      }
      sum += tr * wgt;
    }
    light[i] = sum / 6;
  }
}
const lightQ = i => { const l = light[i]; return l < 0.1 ? 0 : l < 0.28 ? 1 : l < 0.5 ? 2 : l < 0.76 ? 3 : 4; };
function computeFill() {
  for (let z = 0; z < NL; z++) {
    let n = 0;
    for (let i = z * W * D, e = i + W * D; i < e; i++) { const t = cells[i]; if (t && t !== T.EARTH && t !== T.ROCK) n++; }
    WORLD.fill[z] = n / (W * D);
  }
}
