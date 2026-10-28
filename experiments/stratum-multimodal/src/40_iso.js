// ==========================================================================
// Isometric renderer: per-level cached canvases (painter's order inside a
// level, levels composited bottom-up), cut-plane poché cache, ghost-above
// outlines, exploded strata, dynamic per-level details, sky.
// ==========================================================================
const LC = new Array(NL).fill(null);
const DYN = new Array(NL).fill(null);
const CUTS = new Map();   // per-level cut (poché) caches, small LRU
function cutCache(z) {
  let c = CUTS.get(z);
  if (!c) {
    if (CUTS.size >= 3) { const k = CUTS.keys().next().value; CUTS.delete(k); }
    const cv = mk(CW, CH); c = { c: cv, g: cv.getContext('2d'), dirty: true }; CUTS.set(z, c);
  }
  return c;
}
const GHC = { c: null, g: null, z: -1, dirty: true };
const dirtyLv = new Set();
const lazyLv = new Set();
let planDirty = true, secDirty = true, thumbDirty = true, skyDirty = true;
const CUTTABLE = new Uint8Array(32);
[T.EARTH, T.ROCK, T.OLD, T.CORE, T.LIFT, T.CAPSULE, T.TANK, T.TRUSS, T.FRAME, T.PILLAR, T.VAULT, T.RISER, T.CANOPY].forEach(t => CUTTABLE[t] = 1);
const WARM = ['#ffcf73', '#ffb44f', '#ffe39e', '#ffc566'];
const CAP_RW = [[2, 2], [3, 2], [1, 3], [2, 3], [3, 3], [4, 3], [1, 4], [2, 4], [3, 4], [4, 4], [2, 5], [3, 5]];
const WATERCYC = {
  day: [0, 0, '#3f786e', '#56927f', '#7db8a0', '#b3dcc6', '#7db8a0', '#56927f'],
  dusk: [0, 0, '#3b6d62', '#57806c', '#9c8f68', '#e0b36e', '#9c8f68', '#57806c'],
  night: [0, 0, '#1f3b39', '#2b4d48', '#4a6660', '#b08a4e', '#4a6660', '#2b4d48']
};

function markAllDirty() { for (let z = 0; z < NL; z++) dirtyLv.add(z); for (const c of CUTS.values()) c.dirty = true; GHC.dirty = true; planDirty = secDirty = thumbDirty = true; }
function markDirty(z) { dirtyLv.add(z); const cc = CUTS.get(z); if (cc) cc.dirty = true; if (z > S.level) GHC.dirty = true; planDirty = secDirty = thumbDirty = true; }
const tallN = n => n && TI[n].tall;
function faceOccluded(u, v, z, face) {
  return face === 0 ? (tallN(cellR(u, v + 1, z)) || tallN(cellR(u + 1, v + 1, z)) || tallN(cellR(u + 1, v + 2, z)))
    : (tallN(cellR(u + 1, v, z)) || tallN(cellR(u + 1, v + 1, z)) || tallN(cellR(u + 2, v + 1, z)));
}

// emissive details drawn right after each sprite (so painter's order still occludes them)
function lightsFor(g, dl, t, vv, x, y, z, u, v, sx, sy, E, litP) {
  const h = hash3(x, y, z), night = S.tod !== 'day';
  if ((t === T.OLD || t === T.CAPSULE) && ((vv >> 8) & 15)) { facadeLights(g, t === T.OLD ? 'old' : 'cap', (vv >> 8) & 15, vv & 255, x, y, z, sx, sy, E, litP); return; }
  if (t === T.OLD) {
    for (let k = 0; k < 4; k++) {
      const face = k >> 1, c0 = (k & 1) ? 5 : 1;
      if (((h >>> (k * 4)) & 15) / 16 >= litP) continue;
      const rects = [];
      for (let ii = c0; ii < c0 + 2; ii++) rects.push(face === 0 ? sx + ii : sx + 8 + ii, face === 0 ? sy + E + 8 + (ii >> 1) : sy + E + 11 - (ii >> 1), 1, 4);
      const col = WARM[(h >>> (16 + k * 2)) & 3];
      if (((h >>> (24 + k)) & 7) === 0 && !faceOccluded(u, v, z, face)) { dl.flick.push({ rects, col, ph: ((h >>> k) & 255) / 37, rate: 0.25 + ((h >>> (8 + k)) & 7) * 0.12, tv: ((h >>> 20) & 3) === 0 }); continue; }
      g.fillStyle = col; for (let q = 0; q < rects.length; q += 4) g.fillRect(rects[q], rects[q + 1], rects[q + 2], rects[q + 3]);
    }
    if ((vv & 32) && night) {
      const nc = ['#ff6b4a', '#f4d35e', '#6fd0b8'][h % 3];
      g.fillStyle = nc; for (let j = 2; j < 9; j += 2) g.fillRect(sx + 4, sy + E + 7 + j, 2, 1);
      g.fillStyle = rgba(nc, 0.25); g.fillRect(sx + 3, sy + E + 8, 4, 8);
    }
  } else if (t === T.CAPSULE) {
    if ((h & 255) / 256 >= litP) return;
    const ws = (vv >> 2) & 1, col = WARM[(h >>> 8) & 3], rects = [];
    for (const [ii, j] of CAP_RW) rects.push(ws ? sx + 8 + ii : sx + 2 + ii, (ws ? sy + E + 8 - (ii >> 1) : sy + E + 6 + (ii >> 1)) + j, 1, 1);
    if (((h >>> 12) & 7) === 0 && !faceOccluded(u, v, z, ws)) { dl.flick.push({ rects, col, ph: ((h >>> 3) & 255) / 37, rate: 0.2 + ((h >>> 16) & 7) * 0.1, tv: ((h >>> 20) & 3) === 0 }); return; }
    g.fillStyle = col; for (let q = 0; q < rects.length; q += 4) g.fillRect(rects[q], rects[q + 1], 1, 1);
  } else if (t === T.CORE) {
    if ((vv & 4) && night) { g.fillStyle = '#dfe8d6'; for (let ii = 3; ii < 5; ii++) g.fillRect(sx + ii, sy + E + 9 + (ii >> 1), 1, 3); }
  } else if (t === T.LAMP) {
    if (night) { g.fillStyle = 'rgba(255,205,130,0.28)'; g.fillRect(sx + 5, sy + E + 3, 7, 4); g.fillStyle = '#ffe2a2'; g.fillRect(sx + 7, sy + E + 4, 3, 1); }
  } else if (t === T.DECK) {
    if (night && (h & 7) === 0) { g.fillStyle = '#ffd98a'; g.fillRect(sx + 8, sy + E + 12, 1, 1); g.fillStyle = 'rgba(255,210,140,0.25)'; g.fillRect(sx + 6, sy + E + 13, 5, 2); }
  } else if (t === T.ANTENNA) {
    dl.blink.push(sx + 8, sy + 9);
  } else if (t === T.TUBE && night) {
    g.fillStyle = 'rgba(255,214,150,0.35)';
    if (vv & 1) tline(g, sx, sy + 3 + 2, 16, 0.5, 0.1, 0.5, 0.9, 'rgba(255,214,150,0.35)'); else tline(g, sx, sy + 3 + 2, 16, 0.1, 0.5, 0.9, 0.5, 'rgba(255,214,150,0.35)');
  }
}

// ---------- depth for wires ----------
// Each cached level also keeps a depth per pixel (how near the sprite's cell is to the
// viewer, in the same units as the wires' depthKey). Wires are drawn after all levels and
// tested against the nearest depth at each pixel, so they pass behind and in front of
// buildings correctly instead of over or under whole levels.
let DEPV = 0;
function spriteMask(spr) {
  if (!spr.mask) { const w = spr.c.width, h = spr.c.height, d = spr.c.getContext('2d').getImageData(0, 0, w, h).data, m = new Uint8Array(w * h); for (let i = 0; i < w * h; i++) m[i] = d[i * 4 + 3] > 0 ? 1 : 0; spr.mask = m; }
  return spr.mask;
}
function levelEmpty(z) { for (let i = z * W * D, e = i + W * D; i < e; i++) if (cells[i]) return false; return true; }
function buildLevel(z, cutMode) {
  if (!cutMode && levelEmpty(z)) { LC[z] = null; DYN[z] = null; dirtyLv.delete(z); lazyLv.delete(z); return; }
  let tgt;
  if (cutMode) tgt = cutCache(z);
  else { if (!LC[z]) { const c = mk(CW, CH); LC[z] = { c, g: c.getContext('2d') }; } tgt = LC[z]; }
  // with live lighting the sprites go to a scratch canvas that is read back and lit; the
  // cache itself is only ever written, so the browser keeps it on the GPU
  const g = LIT.on ? litScratch() : tgt.g;
  g.clearRect(0, 0, CW, CH);
  const dl = { flick: [], water: [], blink: [] };
  const litP = TODS[S.tod].lit;
  if (!tgt.dep) { tgt.dep = new Float32Array(CW * CH); tgt.face = new Uint8Array(CW * CH); }
  const dep = tgt.dep, fac = tgt.face; dep.fill(-1e9); fac.fill(0); DEPV++;
  // with live lighting, lit windows go to their own layer so the light pass doesn't shade them
  if (LIT.on && !tgt.em) { const c = mk(CW, CH); tgt.em = { c, g: c.getContext('2d') }; }
  if (tgt.em) tgt.em.g.clearRect(0, 0, CW, CH);
  const lg = LIT.on ? tgt.em.g : g;
  for (let s = 0; s <= W + D - 2; s++) {
    const u0 = Math.max(0, s - (D - 1)), u1 = Math.min(W - 1, s);
    for (let u = u0; u <= u1; u++) {
      const v = s - u, p = fromRot(u, v), x = p[0], y = p[1], i = idx(x, y, z), t = cells[i];
      if (!t) continue;
      const vv = spriteVar(t, i, x, y, z, u, v);
      let m = 0, mask = 0;
      if (cutMode && CUTTABLE[t]) { m = 1; if (TI[t].poche && t !== T.LIFT && t !== T.TANK) mask = pocheMask(u, v, z, t); }
      const spr = getSprite(t, vv, Math.max(lightQ(i), litFloor()), m, mask);
      const X = OX + (u - v) * 8, Y = OY + (u + v) * 4, sx = X + spr.ox, sy = Y + spr.oy;
      g.drawImage(spr.c, sx, sy);
      {
        // per-pixel depth: resolve each sprite pixel to the cell's top, left or right face
        const o = occOf(t), top = o ? (m ? Math.min(o[1], HT / LH) : o[1]) : 0.6;
        const mk_ = spriteMask(spr), w = spr.c.width, h = spr.c.height, Dc = (u + v + 1) * 1.5 + z + top * 0.5;
        for (let yy = 0; yy < h; yy++) {
          const ry = sy + yy; if (ry < 0 || ry >= CH) continue; const row = ry * CW, Yr = ry + 0.5 - OY;
          for (let xx = 0; xx < w; xx++) {
            if (!mk_[yy * w + xx]) continue; const rx = sx + xx; if (rx < 0 || rx >= CW) continue;
            const d = (rx + 0.5 - OX) / 8;
            let D = Dc, F = 0;
            const st = (Yr + top * 12) / 4, ut = (st + d) / 2, vt = (st - d) / 2;
            if (ut >= u && ut <= u + 1 && vt >= v && vt <= v + 1) { D = st * 1.5 + z + top; F = 1; }
            else {
              const ul = v + 1 + d, ur = u + 1, vr = u + 1 - d;
              if (ul >= u && ul <= u + 1) { const sl = ul + v + 1; D = sl * 1.5 + z + (sl * 4 - Yr) / 12; F = 2; }
              else if (vr >= v && vr <= v + 1) { const sr = ur + vr; D = sr * 1.5 + z + (sr * 4 - Yr) / 12; F = 3; }
            }
            dep[row + rx] = D; fac[row + rx] = F;
          }
        }
      }
      if (!m) lightsFor(lg, dl, t, vv, x, y, z, u, v, sx, sy, spr.E || 0, litP);
      if (t === T.WATER && !cutMode) {
        const occ = tallN(cellR(u + 1, v, z)) || tallN(cellR(u, v + 1, z)) || tallN(cellR(u + 1, v + 1, z));
        if (!occ) { const h = hash3(x, y, z); for (let k = 0; k < 4; k++) { const a = 0.15 + ((h >>> (k * 5)) & 15) / 22, b = 0.15 + ((h >>> (k * 5 + 3)) & 15) / 22; dl.water.push(Math.floor(X + (a - b) * 8), Math.floor(Y - 4 + (a + b) * 4), (h >>> (k * 3)) & 7); } }
      }
    }
  }
  if (LIT.on) { lightLevel(tgt, z, cutMode, g); tgt.g.drawImage(tgt.em.c, 0, 0); }
  if (cutMode) tgt.dirty = false; else { DYN[z] = dl; dirtyLv.delete(z); lazyLv.delete(z); }
}

// ghost-above: dotted plate outlines of every level above the cut
function buildGhost(L) {
  const H = CH + (NL - 1) * LH;
  if (!GHC.c) { GHC.c = mk(CW, H); GHC.g = GHC.c.getContext('2d'); }
  const g = GHC.g; g.clearRect(0, 0, CW, H);
  for (let z = L + 1; z <= Math.min(NL - 1, L + 3); z++) {
    const a = [0.62, 0.34, 0.18][z - L - 1];
    g.fillStyle = `rgba(206,226,228,${a})`;
    for (let v = 0; v < D; v++) for (let u = 0; u < W; u++) {
      const t = cellR(u, v, z); if (!t) continue;
      const hgt = TI[t].slab ? 3 : (t === T.TREE ? 6 : 12);
      const X = OX + (u - v) * 8, Y = OY + (u + v) * 4 + (NL - 1 - z) * LH - hgt;
      const E = n => !n;
      const bits = (E(cellR(u, v - 1, z)) ? 1 : 0) | (E(cellR(u - 1, v, z)) ? 2 : 0) | (E(cellR(u + 1, v, z)) ? 4 : 0) | (E(cellR(u, v + 1, z)) ? 8 : 0);
      if (!bits) continue;
      for (let i = 0; i < 8; i += 2) {
        const k = i >> 1;
        if (bits & 2) g.fillRect(X - 8 + i, Y + 3 - k, 1, 1);
        if (bits & 8) g.fillRect(X - 8 + i, Y + 4 + k, 1, 1);
        if (bits & 1) g.fillRect(X + 7 - i, Y + 3 - k, 1, 1);
        if (bits & 4) g.fillRect(X + 7 - i, Y + 4 + k, 1, 1);
      }
      if ((bits & 12) === 12) for (let j = 0; j < hgt; j += 2) g.fillRect(X - 1, Y + 8 + j, 1, 1);
    }
  }
  GHC.z = L; GHC.dirty = false;
}

// ---------- view geometry ----------
const easeIO = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const explodeOff = z => -Math.round(STRATUM_OF[z] * GAP * easeIO(S.explode));
function isoBase() { return [Math.round(S.bw / 2 - S.cam.x), Math.round(S.bh / 2 - S.cam.y)]; }
function projIso(px, py, pz) {
  const r = toRotF(px, py), b = isoBase();
  const eo = S.explode > 0 ? explodeOff(clamp(Math.floor(pz), 0, NL - 1)) : 0;
  return [b[0] + (r[0] - r[1]) * 8, b[1] + (r[0] + r[1]) * 4 - pz * LH + eo];
}
function planeAt(bx, by, h, eo) {   // buffer point -> rotated (u,v) on plane height h (levels)
  const b = isoBase(), wx = bx - b[0], wy = by - b[1] - (eo || 0);
  const A = (wy + h * LH) / 4, B = wx / 8;
  return [(A + B) / 2, (A - B) / 2];
}
function pickIso(bx, by) {
  if (S.mode === 'exploded') return pickExploded(bx, by);
  const L = S.level;
  const sliced = L < NL - 1;
  if (!sliced) {   // full stack: report the topmost visible cell (read-only info)
    for (let z = NL - 1; z >= 0; z--) for (const hh of [1, 0.25]) {
      const [u, v] = planeAt(bx, by, z + hh), U = Math.floor(u), V = Math.floor(v);
      const t = cellR(U, V, z);
      if (t && (hh === 1 ? !TI[t].slab : true)) { const p = fromRot(U, V); return { x: p[0], y: p[1], z, t, u: U, v: V, top: true }; }
    }
    return null;
  }
  const [u1, v1] = planeAt(bx, by, L + HT / LH), U1 = Math.floor(u1), V1 = Math.floor(v1);
  const t1 = cellR(U1, V1, L);
  if (t1 && CUTTABLE[t1]) { const p = fromRot(U1, V1); return { x: p[0], y: p[1], z: L, t: t1, u: U1, v: V1 }; }
  const [u0, v0] = planeAt(bx, by, L + 0.2), U0 = Math.floor(u0), V0 = Math.floor(v0);
  if (U0 < 0 || V0 < 0 || U0 >= W || V0 >= D) return null;
  const p = fromRot(U0, V0);
  return { x: p[0], y: p[1], z: L, t: cellR(U0, V0, L), u: U0, v: V0 };
}
function pickExploded(bx, by) {
  for (let s = STRATA.length - 1; s >= 0; s--) {
    const [z0, z1] = STRATA[s];
    for (let z = z1; z >= z0; z--) for (const hh of [1, 0.25]) {
      const [u, v] = planeAt(bx, by, z + hh, explodeOff(z)), U = Math.floor(u), V = Math.floor(v);
      const t = cellR(U, V, z);
      if (t) { const p = fromRot(U, V); return { x: p[0], y: p[1], z, t, u: U, v: V, stratum: s }; }
    }
    const [u, v] = planeAt(bx, by, z0, explodeOff(z0));
    if (u >= 0 && v >= 0 && u < W && v < D) { const U = Math.floor(u), V = Math.floor(v), p = fromRot(U, V); return { x: p[0], y: p[1], z: z0, t: cellR(U, V, z0), u: U, v: V, stratum: s }; }
  }
  return null;
}

// ---------- pixel line helpers ----------
function pline(ctx, x0, y0, x1, y1, col, dash) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy, n = 0;
  ctx.fillStyle = col;
  for (let guard = 0; guard < 4000; guard++) {
    if (!dash || (n % dash[0]) < dash[1]) ctx.fillRect(x0, y0, 1, 1);
    n++;
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}
function isoQuad(ctx, x0, y0, x1, y1, h, col, dash, eoz) {  // world-rect outline (continuous) at height h
  const P = (a, b) => { const r = toRotF(a, b), bb = isoBase(); return [bb[0] + (r[0] - r[1]) * 8, bb[1] + (r[0] + r[1]) * 4 - h * LH + (eoz || 0)]; };
  const c = [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)];
  for (let k = 0; k < 4; k++) pline(ctx, c[k][0], c[k][1], c[(k + 1) % 4][0], c[(k + 1) % 4][1], col, dash);
  return c;
}

// ---------- sky ----------
const SKYC = { c: null };
const SKYCOL = { day: ['#8ea5ab', '#a7b6b2', '#c4c3b1', '#d9cfb3'], dusk: ['#1c2630', '#343538', '#5f4439', '#a75f39', '#d98a45'], night: ['#06080b', '#0a0f13', '#0f171b', '#16201f'] };
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
function buildSky() {
  const bw = S.bw, bh = S.bh;
  if (!SKYC.c || SKYC.c.width !== bw || SKYC.c.height !== bh) SKYC.c = mk(bw, bh);
  const skyT = LIT.on && LIT.sun === 'evening' ? 'dusk' : S.tod, g = SKYC.c.getContext('2d'), cols = SKYCOL[skyT], n = cols.length;
  const hz = Math.round(bh * 0.62);
  for (let y = 0; y < bh; y++) {
    const f = clamp(y / hz, 0, 1) * (n - 1), k = Math.min(n - 2, Math.floor(f)), fr = f - k;
    g.fillStyle = cols[k]; g.fillRect(0, y, bw, 1);
    if (fr > 0.02) { g.fillStyle = cols[k + 1]; for (let x = 0; x < bw; x++) if (fr * 16 > BAYER[(x & 3) + (y & 3) * 4]) g.fillRect(x, y, 1, 1); }
  }
  // far arcologies on the horizon (Trantor goes on forever)
  const rnd = mulberry32(S.seed * 3 + 1);
  const far = skyT === 'day' ? '#9ba39f' : skyT === 'dusk' ? '#3d3438' : '#0d1316', mid = skyT === 'day' ? '#8a918d' : skyT === 'dusk' ? '#2d282c' : '#0a0f11';
  for (const [col, base, amp] of [[far, hz + 6, 34], [mid, hz + 18, 22]]) {
    let x = -4;
    while (x < bw) {
      const w = 6 + Math.floor(rnd() * 18), h = 6 + Math.floor(rnd() * amp);
      g.fillStyle = col; g.fillRect(x, base - h, w, bh - base + h);
      if (rnd() < 0.3) g.fillRect(x + (w >> 1), base - h - 5, 1, 5);
      if (S.tod !== 'day') { g.fillStyle = S.tod === 'night' ? '#e0b45e' : '#b98a55'; for (let k = 0; k < w * h / 40; k++) if (rnd() < 0.5) g.fillRect(x + 1 + Math.floor(rnd() * (w - 2)), base - h + 2 + Math.floor(rnd() * h), 1, 1); }
      x += w + Math.floor(rnd() * 3);
    }
    g.fillStyle = col; g.fillRect(0, base, bw, bh - base);
  }
  if (S.tod === 'night') { g.fillStyle = '#c9cfc8'; for (let k = 0; k < 60; k++) g.fillRect(Math.floor(rnd() * bw), Math.floor(rnd() * hz * 0.6), 1, 1); }
  skyDirty = false;
}

// ---------- dynamic layer for one level ----------
function drawDyn(ctx, z, ox, oy, t, isCut) {
  const dl = DYN[z]; if (!dl) return;
  const wc = WATERCYC[S.tod], wt = Math.floor(t * 5);
  for (let k = 0; k < dl.water.length; k += 3) { const c = wc[(dl.water[k + 2] + wt) & 7]; if (c) { ctx.fillStyle = c; ctx.fillRect(ox + dl.water[k], oy + dl.water[k + 1], 2, 1); } }
  if (!isCut && S.tod !== 'day') for (const f of dl.flick) {
    const st = hash3(Math.floor((t + f.ph * 7) * f.rate), f.rects[0], f.rects[1]);
    const on = f.tv ? true : (st & 7) !== 0;
    if (!on) continue;
    ctx.fillStyle = f.tv ? ((st & 1) ? '#9fd3e0' : '#d8eef2') : f.col;
    for (let q = 0; q < f.rects.length; q += 4) ctx.fillRect(ox + f.rects[q], oy + f.rects[q + 1], f.rects[q + 2], f.rects[q + 3]);
  }
  if ((t % 1.6) < 0.2) for (let k = 0; k < dl.blink.length; k += 2) { ctx.fillStyle = 'rgba(255,90,60,0.35)'; ctx.fillRect(ox + dl.blink[k] - 1, oy + dl.blink[k + 1] - 1, 3, 3); ctx.fillStyle = '#ff5a3c'; ctx.fillRect(ox + dl.blink[k], oy + dl.blink[k + 1], 1, 1); }
}

// ---------- main iso render (cut + exploded) ----------
function renderIso(ctx, t) {
  for (const z of dirtyLv) buildLevel(z, false);
  if (lazyLv.size) { const z = lazyLv.values().next().value; buildLevel(z, false); }
  const L = S.level, ex = S.mode === 'exploded' || S.explode > 0.001;
  const sliced = !ex && !(L >= NL - 1 && Math.abs(S.cutAnim - L) < 0.001);
  const settled = Math.abs(S.cutAnim - L) < 0.001;
  if (sliced && settled && cutCache(L).dirty) buildLevel(L, true);
  if (ex && cutCache(1).dirty) buildLevel(1, true);
  const b = isoBase(), bx0 = b[0] - OX, by0 = b[1] - OY;
  const top = Math.floor(S.cutAnim + 1e-4), frac = S.cutAnim - top;
  const shadeK = S.shade ? 0.1 : 0;
  ctx.clearRect(0, 0, S.bw, S.bh);
  const useDepth = !ex && settled, depthLevels = [];
  for (let z = 0; z < NL; z++) {
    let img = LC[z] && LC[z].c, alpha = 1, isCut = false;
    const eo = ex ? explodeOff(z) : 0;
    if (!ex) {
      if (z > top + 1 || (z === top + 1 && frac < 0.001)) break;
      if (z === top + 1) alpha = frac;
      if (z === top && sliced && settled && z === L) { img = cutCache(L).c; isCut = true; }
    } else {
      if (S.hoverStratum >= 0 && STRATUM_OF[z] !== S.hoverStratum) alpha = 0.34;
      if (z === 1) { img = cutCache(1).c; isCut = true; }
    }
    if (!img) continue;
    if (ex && S.explode > 0.05 && z === STRATA[STRATUM_OF[z]][0] && z > 0) stratumPlate(ctx, STRATUM_OF[z]);
    const oy = by0 - z * LH + eo;
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, bx0, oy);
    if (alpha > 0.5) { drawDyn(ctx, z, bx0, oy, t, isCut); drawLifeLevel(ctx, z, t); if (!useDepth) drawWiresLevel(ctx, z, isCut); }
    if (useDepth && alpha > 0.5 && img) depthLevels.push([z, isCut ? cutCache(L) : LC[z], oy]);
    ctx.globalAlpha = 1;
    if (!ex && sliced && (shadeK || mistOn()) && z < L && z < top && !(mistOn() && z < L - MIST_LEVELS)) {
      // below the cut: mist with live lighting, otherwise the plain darkening
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = mistOn() ? `rgba(${mistRGB().join(',')},${LIT.mistA})` : `rgba(14,11,9,${shadeK})`; ctx.fillRect(0, 0, S.bw, S.bh);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (ex && z === STRATA[STRATUM_OF[z]][1]) drawStratumAnnot(ctx, STRATUM_OF[z]);
  }
  if (useDepth && wiresAtRest()) {
    // nothing is moving: the wires are drawn once into a layer fixed to the world, and a pan just slides it
    const wf = wireFrame(depthLevels, top, L, sliced), fy = by0 - NL * LH;
    ctx.drawImage(wf, bx0, fy);
    Object.assign(WDT, { fd: WFC.fd, w: CW, h: LFH, ox: bx0, oy: fy, wd: null }); WDT.key = '';
    WDT.on = true; drawBirds(ctx); WDT.on = false; WDT.ox = WDT.oy = 0;
  } else if (useDepth) { compositeDepth(depthLevels, bx0); if (!WDT.wd || WDT.wd.length !== S.bw * S.bh) WDT.wd = new Float32Array(S.bw * S.bh); WDT.wd.fill(-1e9); WDT.on = true; for (let z = 0; z < NL; z++) drawWiresLevel(ctx, z); drawBirds(ctx); WDT.on = false; }
  LIT.ov = useDepth ? [top, L, sliced, bx0, by0] : null;   // drawn once the sky is in, so additive light never punches holes in it
  drawAfterWorld(ctx, t, sliced, ex);
}
const WDT = { on: false, fd: null, w: 0, h: 0, D: 0, key: '', ox: 0, oy: 0 };
// ---------- the resting-wires layer ----------
// In the level frame (x as the level caches, y shifted down NL levels so every level fits):
// its own depth composite (rebuilt when the levels change) and the wires drawn against it
// (rebuilt when the wires, hover or look change). Cached while every cable sleeps.
const WFC = { c: null, g: null, fd: null, dKey: '', wKey: '' };
const wiresAtRest = () => !WIRES.forceScreen && !LAY.on && !WGRAB.on && !WIRES.stroke && WIRES.cables.every(c => c.asleep);
function wireFrame(levels, top, L, sliced) {
  if (!WFC.c) { WFC.c = mk(CW, LFH); WFC.g = WFC.c.getContext('2d'); WFC.fd = new Float32Array(CW * LFH); }
  const dKey = [levels.map(l => l[0] + (l[1] === LC[l[0]] ? '' : 'c')).join(','), S.rot, DEPV].join('|');
  if (WFC.dKey !== dKey) {
    const fd = WFC.fd; fd.fill(-1e9);
    for (const [z, cache] of levels) {
      const dep = cache.dep; if (!dep) continue; const off = (NL - z) * LH;
      for (let cy = 0; cy < CH; cy++) { const fy = cy + off; if (fy < 0 || fy >= LFH) continue; const r = cy * CW, f = fy * CW; for (let x = 0; x < CW; x++) { const d = dep[r + x]; if (d > fd[f + x]) fd[f + x] = d; } }
    }
    WFC.dKey = dKey; WFC.wKey = '';
  }
  const hv = WIRES.hover ? (WIRES.hover.tie ? 't' + WIRES.hover.tie.id : 'c' + WIRES.hover.c.id) : '';
  const wKey = [WIRES.ver || 0, hv, top, L, sliced, LIT.on, litKey(), LIT.mist && LIT.mistA, S.tod, S.mode, WIRES.palette, WIRES.bundleLook, WIRES.tieStyle, WIRES.joint, WIRES.sleeve,
    WIRES.cables.length, WIRES.ties.length, WIRES.posts.length, WIRES.girders.length, WIRES.mounts.length].join('|');
  if (WFC.wKey !== wKey) {
    // project as if the view's base sat at the frame's origin
    const sv = [S.bw, S.bh, S.cam.x, S.cam.y];
    S.bw = CW; S.bh = LFH; S.cam.x = CW / 2 - OX; S.cam.y = LFH / 2 - OY - NL * LH;
    Object.assign(WDT, { fd: WFC.fd, w: CW, h: LFH, ox: 0, oy: 0, wd: null }); WDT.key = '';
    WFC.g.clearRect(0, 0, CW, LFH);
    try { WDT.on = true; for (let z = 0; z < NL; z++) drawWiresLevel(WFC.g, z); }
    finally { WDT.on = false; [S.bw, S.bh, S.cam.x, S.cam.y] = sv; }
    WFC.wKey = wKey;
  }
  return WFC.c;
}
function compositeDepth(levels, bx0) {
  const key = [bx0, levels.map(l => l[0] + ':' + l[2]).join(','), S.bw, S.bh, DEPV, S.rot].join('|');
  if (WDT.key === key && WDT.fd === WDT.sfd) return;
  const bw = S.bw, bh = S.bh;
  if (!WDT.sfd || WDT.sfd.length !== bw * bh) WDT.sfd = new Float32Array(bw * bh);   // its own buffer: WDT.fd may be lent to the resting-wires layer
  const fd = WDT.fd = WDT.sfd; fd.fill(-1e9); WDT.w = bw; WDT.h = bh;
  if (!WDT.face || WDT.face.length !== bw * bh) WDT.face = new Uint8Array(bw * bh);
  const ff = WDT.face; ff.fill(0);
  if (window.__depthDebug) { WDT.src = new Int8Array(bw * bh).fill(-1); }
  for (const [z, cache, oy] of levels) {
    const dep = cache.dep, fac = cache.face; if (!dep) continue;
    for (let py = 0; py < bh; py++) {
      const cy = py - oy; if (cy < 0 || cy >= CH) continue;
      // the level image sits at buffer x = bx0 + cache x
      const row = cy * CW, frow = py * bw, x0 = Math.max(0, bx0), x1 = Math.min(bw, CW + bx0);
      for (let px = x0; px < x1; px++) { const d = dep[row + px - bx0]; if (d > fd[frow + px]) { fd[frow + px] = d; ff[frow + px] = fac[row + px - bx0]; if (WDT.src) WDT.src[frow + px] = z; } }
    }
  }
  WDT.key = key;
}
// a wire pixel shows when nothing nearer was drawn there
const wdt = (x, y) => { if (!WDT.on) return true; x -= WDT.ox; y -= WDT.oy; if (x < 0 || y < 0 || x >= WDT.w || y >= WDT.h) return false; const i = y * WDT.w + x; if (WDT.fd[i] > WDT.D + 0.12) return false; if (WDT.wd && WDT.D > WDT.wd[i]) WDT.wd[i] = WDT.D; return true; };

function stratumPlate(ctx, s) {
  const z0 = STRATA[s][0], eo = explodeOff(z0), k = easeIO(S.explode);
  const P = (a, b) => { const r = toRotF(a, b), bb = isoBase(); return [bb[0] + (r[0] - r[1]) * 8, bb[1] + (r[0] + r[1]) * 4 - z0 * LH + eo]; };
  const c = [P(0, 0), P(W, 0), P(W, D), P(0, D)];
  const dim = S.hoverStratum >= 0 && S.hoverStratum !== s ? 0.3 : 0.4;
  ctx.fillStyle = `rgba(9,10,11,${(dim * k).toFixed(3)})`;
  ctx.beginPath(); ctx.moveTo(c[0][0], c[0][1]); for (let q = 1; q < 4; q++) ctx.lineTo(c[q][0], c[q][1]); ctx.closePath(); ctx.fill();
}
function drawStratumAnnot(ctx, s) {
  if (S.explode < 0.35) return;
  const [z0, z1, name] = STRATA[s], eo = explodeOff(z0);
  const hov = S.hoverStratum === s;
  const P = (a, b, h, e) => { const r = toRotF(a, b), bb = isoBase(); return [bb[0] + (r[0] - r[1]) * 8, bb[1] + (r[0] + r[1]) * 4 - h * LH + e]; };
  // registration lines up to the next stratum
  if (s < STRATA.length - 1) {
    const zn = STRATA[s + 1][0], en = explodeOff(zn);
    for (const [a, b] of [[0, 0], [W, 0], [W, D], [0, D]]) { const p = P(a, b, z1 + 1, eo), q = P(a, b, zn, en); pline(ctx, p[0], p[1], q[0], q[1], 'rgba(200,190,170,0.55)', [4, 2]); }
    for (const c of WORLD.cores) { const p = P(c.x, c.y + c.s, Math.min(c.top + 1, z1 + 1), eo), q = P(c.x, c.y + c.s, zn, en); if (c.top >= zn) pline(ctx, p[0], p[1], q[0], q[1], 'rgba(232,168,60,0.45)', [2, 1]); }
  }
  // corners of the stratum plate
  const corners = [[0, 0], [W, 0], [W, D], [0, D]].map(([a, b]) => P(a, b, z0, eo));
  for (let k = 0; k < 4; k++) pline(ctx, corners[k][0], corners[k][1], corners[(k + 1) % 4][0], corners[(k + 1) % 4][1], hov ? '#e8a83c' : 'rgba(200,190,170,0.35)', hov ? null : [3, 3]);
  const left = corners.reduce((m, c) => c[0] < m[0] ? c : m, corners[0]);
  const label = (z0 === z1 ? lvCode(z0) : lvCode(z0) + '-' + lvCode(z1)) + ' ' + name;
  const lx = left[0] - 14 - ptextW(label) - 4;
  pline(ctx, left[0] - 2, left[1], left[0] - 13, left[1], hov ? '#e8a83c' : '#8d877b');
  plate(ctx, label, lx, left[1] - 4, hov ? '#e8a83c' : '#1a1b1d', hov ? '#1b1305' : '#d8d0bf', hov ? null : '#44474c');
}

function drawAfterWorld(ctx, t, sliced, ex) {
  const L = S.level;
  if (!ex) {
    if (S.ghost && sliced) {
      if (GHC.dirty || GHC.z !== L) buildGhost(L);
      const b = isoBase(); ctx.drawImage(GHC.c, b[0] - OX, b[1] - OY - (NL - 1) * LH);
    }
    drawWellLight(ctx, t, sliced ? L : NL - 1);
    if (Math.abs(S.cutAnim - L) > 0.001) {
      const h = S.cutAnim + HT / LH;
      const c = isoQuad(ctx, 0, 0, W, D, h, 'rgba(232,168,60,0.9)');
      ctx.fillStyle = 'rgba(232,168,60,0.07)';
      const ymin = Math.min(c[0][1], c[1][1], c[2][1], c[3][1]), ymax = Math.max(c[0][1], c[1][1], c[2][1], c[3][1]);
      const cx = (c[0][0] + c[2][0]) / 2, cy = (ymin + ymax) / 2, hw = Math.abs(c[1][0] - c[3][0]) / 2, hh = (ymax - ymin) / 2;
      for (let y = Math.ceil(ymin); y < ymax; y += 2) { const w = hw * (1 - Math.abs(y - cy) / hh); ctx.fillRect(Math.round(cx - w), y, Math.round(w * 2), 1); }
    } else if (sliced) {
      const c = isoQuad(ctx, 0, 0, W, D, L + HT / LH, 'rgba(232,168,60,0.55)', [5, 3]);
      const left = c.reduce((m, p) => p[0] < m[0] ? p : m, c[0]), lab = 'CUT ' + lvCode(L) + ' ' + LEVELS[L].name, lw = ptextW(lab) + 4;
      plate(ctx, lab, clamp(Math.round(left[0]) - 8 - lw, Math.round(S.safeL / S.zoom) + 2, S.bw - lw - 4), clamp(Math.round(left[1]) - 4, 4, S.bh - 30), '#e8a83c', '#1b1305');
    }
  }
  drawSteam(ctx, t, ex ? NL : (sliced ? L : NL));
  drawBuildIso(ctx, t, sliced, ex);
  drawWireOverlay(ctx);
  if (!WIRES.hover && !LAY.on && !WGRAB.on && !WIRES.stroke) drawHoverIso(ctx, t, sliced, ex);
  if (skyDirty || !SKYC.c) buildSky();
  ctx.globalCompositeOperation = 'destination-over';
  ctx.drawImage(SKYC.c, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  if (LIT.ov) drawLightOverlays(ctx, ...LIT.ov);
  ctx.globalCompositeOperation = 'source-over';
}

function drawHoverIso(ctx, t, sliced, ex) {
  const h = S.hover; if (!h || S.mode === 'plan' || S.mode === 'section') return;
  const eo = ex ? explodeOff(h.z) : 0;
  const tt = h.t;
  const hh = tt ? (CUTTABLE[tt] && sliced && !h.top ? HT / LH : TI[tt].slab ? 0.25 : 1) : 0.02;
  const col = h.top ? '#d8d0bf' : '#f0b43c';
  isoQuad(ctx, h.x, h.y, h.x + 1, h.y + 1, h.z + hh, col, null, eo);
  if (!tt && sliced && !ex) {   // plumb line to what you actually see below
    for (let z = h.z - 1; z >= 0; z--) {
      const b = cell(h.x, h.y, z);
      if (!b) continue;
      const ht = TI[b].slab ? 0.25 : 1;
      const p = projIso(h.x + 0.5, h.y + 0.5, h.z), q = projIso(h.x + 0.5, h.y + 0.5, z + ht);
      pline(ctx, p[0], p[1], q[0], q[1], 'rgba(240,180,60,0.8)', [2, 1]);
      isoQuad(ctx, h.x + 0.2, h.y + 0.2, h.x + 0.8, h.y + 0.8, z + ht, 'rgba(240,180,60,0.7)');
      plate(ctx, lvCode(z), q[0] + 4, q[1] - 3, '#1a1b1d', '#f0b43c', '#5a4a2a');
      break;
    }
  }
}
