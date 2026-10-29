// ==========================================================================
// 3D view (study). The same world, drawn by WebGL2 from any angle.
//
// Every cell becomes a few axis-aligned planes (boxes, slabs, lattices, rails)
// and each plane is painted by projecting the cell's own iso sprite onto it:
// a point on a plane shows the sprite pixel it covers in the default view.
// So the default view reproduces the 2D renderer, and any other view carries
// the same pixels in 3D. A plane seen from its far side (-x or -y) takes the
// near face's pixels, mirrored, which is what the 2D view does turned 180°.
// Trees, masts, risers, tanks and the crane are camera-facing sprites.
//
// Cables, ties, girders and birds are drawn by the 2D cable code itself
// through this camera (projIso swapped for the 3D projection) and depth-tested
// against the GL depth, so they keep their exact pixel look.
//
// The scene renders at one art pixel per pixel into a small target, which is
// scaled to the screen at any zoom with square pixels. Panning is snapped to
// the art grid and the remainder applied in the upscale (no pixel creep).
// Live lighting (sky, occlusion, sun shadows, mist) runs per pixel from the
// same light volumes, uploaded as 3D textures.
// ==========================================================================
const LZ = Math.sqrt(1.5);        // one level, in cell widths: 12 px / (8√2 · cos 30°)
const PXS = 8 * Math.SQRT2;       // art px per cell width at the default view
const G3 = {
  on: false, gl: null, cv: null, wcv: null, wg: null, hud: null,
  az: 45, el: 30, T: [32, 32, 6], zf: 2, filter: 'sharp', snap: true, texel: 0, grow: 0, splat: 0, splatK: 1,
  anim: null, drag: null, last: 0,
  lv: [], cuts: new Map(), dirty: new Set(), built: false,
  A: null, EA: null, tex: {}, prog: {}, fbo: null, size: [0, 0], litKey: '', skyKey: '',
  stats: {}
};
const ISO_AZ = k => 45 - 90 * k;   // the 2D view's rotation k as an azimuth (degrees)

// ---------- camera ----------
function g3Basis(az, el) {
  const a = az * Math.PI / 180, e = el * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a), ce = Math.cos(e), se = Math.sin(e);
  return { C: [ce * ca, ce * sa, se], R: [sa, -ca, 0], U: [-ca * se, -sa * se, ce] };
}
const w3 = p => [p[0], p[1], p[2] * LZ];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
// everything a frame needs to project: art px = dot(P, R)·s + off.x,  -dot(P, U)·s + off.y
function g3View() {
  const B = g3Basis(G3.az, G3.el), cssW = S.cssW, cssH = S.cssH;
  const Wv = cssW / G3.zf, Hv = cssH / G3.zf, Wt = Math.ceil(Wv) + 4, Ht = Math.ceil(Hv) + 4, hw = Wt >> 1, hh = Ht >> 1;
  const T = w3(G3.T), cr = dot3(T, B.R) * PXS, cu = dot3(T, B.U) * PXS, rr = Math.round(cr), ru = Math.round(cu);
  const off = [hw - rr, hh + ru];
  // depth range over the world box
  let d0 = 1e9, d1 = -1e9;
  for (const x of [0, W]) for (const y of [0, D]) for (const z of [-1, NL + 3]) { const d = dot3(w3([x, y, z]), B.C); d0 = Math.min(d0, d); d1 = Math.max(d1, d); }
  const K = 1 / (B.C[2] * LZ);   // depthKey units: one level of height = 1, as the 2D wires use
  return { ...B, Wt, Ht, off, shift: [hw - Wv / 2 + (cr - rr), hh - Hv / 2 - (cu - ru)], d0, d1, K, dk0: d0 * K, dk1: d1 * K };
}
function g3Proj(V, x, y, z) { const P = w3([x, y, z]); return [dot3(P, V.R) * PXS + V.off[0], -dot3(P, V.U) * PXS + V.off[1]]; }

// ---------- sprite atlases ----------
function mkAtlas(size) { const c = mk(size, size), g = c.getContext('2d', { willReadFrequently: true }); return { c, g, size, x: 0, y: 0, rowH: 0, map: new Map(), dirty: true, full: false }; }
function atlasAlloc(A, w, h) {
  if (A.x + w > A.size) { A.x = 0; A.y += A.rowH + 1; A.rowH = 0; }
  if (A.y + h > A.size) { A.full = true; return null; }
  const r = [A.x, A.y]; A.x += w + 1; A.rowH = Math.max(A.rowH, h); A.dirty = true; return r;
}
const NEUTRAL = { t: h => h, l: h => h, r: h => h, ta: (h, a) => rgba(h, a), la: (h, a) => rgba(h, a), ra: (h, a) => rgba(h, a) };
const SCR = { c: null, g: null, c2: null, g2: null };
function scratch(w, h, two) {
  const k = two ? 'c2' : 'c', gk = two ? 'g2' : 'g';
  if (!SCR[k] || SCR[k].width < w || SCR[k].height < h) { SCR[k] = mk(Math.max(64, w), Math.max(64, h)); SCR[gk] = SCR[k].getContext('2d', { willReadFrequently: true }); }
  SCR[gk].clearRect(0, 0, SCR[k].width, SCR[k].height);
  return SCR[gk];
}
// an atlas entry {x, y, w, h, E} drawn by fn(g, E); `minus` draws a base whose pixels are removed
function g3Sprite(key, t, fn, minus) {
  const A = G3.A; let e = A.map.get(key);
  if (e !== undefined) return e;
  const E = EXTRA[t] || 0, w = t === T.CRANE ? 48 : 16, h = 20 + E, at = atlasAlloc(A, w, h);
  if (!at) { A.map.set(key, null); return null; }
  const g = scratch(w, h); fn(g, E);
  if (minus) {
    const g2 = scratch(w, h, true); minus(g2, E);
    const a = g.getImageData(0, 0, w, h), b = g2.getImageData(0, 0, w, h), d = a.data, s = b.data;
    for (let i = 0; i < d.length; i += 4) if (d[i] === s[i] && d[i + 1] === s[i + 1] && d[i + 2] === s[i + 2] && d[i + 3] === s[i + 3]) d[i + 3] = 0;
    g.putImageData(a, 0, 0);
  }
  A.g.clearRect(at[0], at[1], w, h); A.g.drawImage(SCR.c, 0, 0, w, h, at[0], at[1], w, h);
  e = { x: at[0], y: at[1], w, h, E }; A.map.set(key, e); return e;
}
const noRails = fn => { const r = railings; railings = () => {}; try { fn(); } finally { railings = r; } };
// the kinds of art one cell can ask for
function sprFull(t, vv, m, mask) { return g3Sprite('n' + t + ':' + vv + ':' + m + ':' + mask, t, (g, E) => DRAW[t](g, vv, E, NEUTRAL, m, mask, t)); }
function sprShaded(t, vv, m, mask) { return g3Sprite('s' + t + ':' + vv + ':' + m + ':' + mask, t, (g, E) => DRAW[t](g, vv, E, painter(4), m, mask, t)); }
function sprNoRail(t, vv) { return g3Sprite('r' + t + ':' + vv, t, (g, E) => noRails(() => DRAW[t](g, vv, E, NEUTRAL, 0, 0, t))); }
function sprBase(t, vv, bt, bv) { return g3Sprite('b' + t + ':' + vv, t, (g, E) => DRAW[bt](g, bv, E, NEUTRAL, 0, 0, bt)); }
function sprDiff(t, vv, m, bt, bv) {   // shaded art of the cell minus its floor (what stands on it)
  return g3Sprite('d' + t + ':' + vv + ':' + m, t, (g, E) => DRAW[t](g, vv, E, painter(4), m, 0, t), bt == null ? null : (g, E) => DRAW[bt](g, bv, E, painter(4), 0, 0, bt));
}
// a frame's cage alone (posts and rims, no floor slab): the art of its four open sides
function sprCage(m) {
  return g3Sprite('cage:' + m, T.FRAME, (g, E) => { if (m !== 1) R_(g, 7, E, 2, 10, '#5a544b'); frameCage(g, E, NEUTRAL, m, true); });
}
// one edge's railing alone (bit as in the deck's open-edge bits), so each rail plane shows its own
function sprRail(t, vv, bit) {
  const v1 = (vv & ~30) | ((15 & ~bit) << 1);
  return g3Sprite('e' + t + ':' + v1, t, (g, E) => DRAW[t](g, v1, E, NEUTRAL, 0, 0, t), (g, E) => noRails(() => DRAW[t](g, v1, E, NEUTRAL, 0, 0, t)));
}
// a cut block's art without its one-pixel outline: the outline is drawn as real lines (see cutEdges)
const noCutline = fn => { const d = diaEdge; diaEdge = (g, x, y, w, which, c) => { if (c !== CUTLINE || w !== 16) d(g, x, y, w, which, c); }; try { fn(); } finally { diaEdge = d; } };
function sprCut(t, vv, mask) { return g3Sprite('c' + t + ':' + vv + ':' + mask, t, (g, E) => noCutline(() => DRAW[t](g, vv, E, NEUTRAL, 1, mask, t))); }
// lit windows etc. for one cell, in sprite space (only cells with something lit get an entry)
function sprEmissive(t, vv, x, y, z, E) {
  const w = 16, h = 20 + E, g = scratch(w, h), dl = { flick: [], water: [], blink: [] };
  lightsFor(g, dl, t, vv, x, y, z, x, y, 0, 0, E, TODS[S.tod].lit);
  // the 2D view's flickering windows and TVs: alpha 254 / 253 marks them for the shader to switch
  if (S.tod !== 'day') for (const f of dl.flick) { g.fillStyle = rgba(f.tv ? '#9fd3e0' : f.col, (f.tv ? 253 : 254) / 255); for (let q = 0; q < f.rects.length; q += 4) g.fillRect(f.rects[q], f.rects[q + 1], f.rects[q + 2], f.rects[q + 3]); }
  const d = g.getImageData(0, 0, w, h).data; let any = false;
  for (let i = 3; i < d.length; i += 4) if (d[i]) { any = true; break; }
  if (!any) return null;
  const at = atlasAlloc(G3.EA, w, h); if (!at) return null;
  G3.EA.g.clearRect(at[0], at[1], w, h); G3.EA.g.drawImage(SCR.c, 0, 0, w, h, at[0], at[1], w, h);
  return at;
}

// ---------- cells as planes ----------
// a full-footprint box from the floor up (for hiding faces two cells share), as a fraction of the level
function boxH(t, m) {
  switch (t) {
    case T.EARTH: case T.ROCK: case T.OLD: case T.CORE: case T.LIFT: return m ? HT / LH : 1;
    case T.STREET: case T.WALK: case T.TERRACE: case T.DECK: case T.TREE: return 0.25;
    case T.WATER: return 4 / 12;
    case T.ROOFWALK: return 2 / 12;
  }
  return 0;
}
// a level's geometry: planes (axis 0/1/2 at a local coordinate, over a rect) and billboards
function mkBuilder() { return { v: [], idx: [], nq: 0, bb: [], nb: 0, segs: [], blinks: [] }; }
// one plane. axis 0: x = k, rect over (y, z); axis 1: y = k, rect over (x, z); axis 2: z = k, rect over (x, y)
function quad(B, cx, cy, cz, axis, k, a0, a1, b0, b1, spr, emi, q, flags) {
  if (!spr) return;
  // grown by about a pixel so a sprite's edge pixels can spill onto its neighbour, as in the
  // 2D painter's order (the nearer cell wins the overlap; transparent pixels fall through)
  const ea = G3.grow / 16, eb = G3.grow / (axis === 2 ? 16 : 12);
  a0 -= ea; a1 += ea; b0 -= eb; b1 += eb;
  // flags: 1 shows the plane's own art from both sides (rails), 2 water (emi carries the cell hash)
  const base = B.nq * 4, P = [];
  for (const [a, b] of [[a0, b0], [a1, b0], [a1, b1], [a0, b1]]) {
    const p = axis === 0 ? [k, a, b] : axis === 1 ? [a, k, b] : [a, b, k];
    P.push(p);
  }
  for (const p of P) B.v.push(cx + p[0], cy + p[1], cz + p[2], cx, cy, cz, spr.x, spr.y, spr.E, spr.w, emi ? emi[0] : -1, emi ? emi[1] : -1, q, axis, flags || 0);
  B.idx.push(base, base + 1, base + 2, base, base + 2, base + 3); B.nq++;
}
// a box: top and four sides (no bottom); `cull(dir)` may hide a side the neighbour covers
function boxP(B, c, x0, y0, z0, x1, y1, z1, spr, emi, o) {
  o = o || {};
  const [cx, cy, cz, q] = c, f = o.flags;
  if (!o.noTop) quad(B, cx, cy, cz, 2, z1, x0, x1, y0, y1, spr, emi, q, f);
  if (o.top) return;
  if (!(o.cull && o.cull(2))) quad(B, cx, cy, cz, 0, x0, y0, y1, z0, z1, spr, emi, q, f);
  if (!(o.cull && o.cull(0))) quad(B, cx, cy, cz, 0, x1, y0, y1, z0, z1, spr, emi, q, f);
  if (!(o.cull && o.cull(1))) quad(B, cx, cy, cz, 1, y0, x0, x1, z0, z1, spr, emi, q, f);
  if (!(o.cull && o.cull(3))) quad(B, cx, cy, cz, 1, y1, x0, x1, z0, z1, spr, emi, q, f);
}
function bill(B, c, spr, zc) {
  if (!spr) return;
  const [cx, cy, cz, q] = c;
  B.bb.push(cx + 0.5, cy + 0.5, cz + (zc == null ? 0.5 : zc), spr.x, spr.y, spr.w, spr.h, spr.w >> 1, spr.E + 10, q, cz); B.nb++;
}
const G3DIR = [[1, 0], [0, -1], [-1, 0], [0, 1]];   // cull(dir): 0 +x, 1 -y, 2 -x, 3 +y
function cellPlanes(B, t, i, x, y, z, cut) {
  const vv = spriteVar(t, i, x, y, z, x, y), m = cut && CUTTABLE[t] ? 1 : 0;
  const mask = m && TI[t].poche && t !== T.LIFT && t !== T.TANK ? pocheMask(x, y, z, t) : 0;
  const q = Math.max(lightQ(i), litFloor()), c = [x, y, z, q], h1 = m ? HT / LH : 1;
  const emi = !m && (t === T.OLD || t === T.CAPSULE || t === T.CORE || t === T.LAMP || t === T.DECK) ? sprEmissive(t, vv, x, y, z, EXTRA[t] || 0) : null;
  const myH = boxH(t, m);
  // a side is hidden when the neighbour's floor-up box is at least as tall (and is drawn in the same pass)
  const cull = top => dir => {
    const nx = x + G3DIR[dir][0], ny = y + G3DIR[dir][1]; if (nx < 0 || ny < 0 || nx >= W || ny >= D) return false;
    const n = cells[idx(nx, ny, z)]; if (!n) return false;
    return boxH(n, cut && CUTTABLE[n] ? 1 : 0) >= top - 1e-6;
  };
  const upCovers = () => { if (cut || z + 1 >= NL) return false; const n = cells[idx(x, y, z + 1)]; return n && boxH(n, 0) > 0; };
  const solid = t === T.EARTH || t === T.ROCK || t === T.OLD || t === T.CORE || t === T.LIFT;
  const F = m && solid ? sprCut(t, vv, mask) : sprFull(t, vv, m, mask);
  switch (t) {
    case T.EARTH: case T.ROCK: case T.OLD: case T.CORE: case T.LIFT:
      if (m) cutEdges(B, x, y, z + h1, t === T.LIFT ? 15 : 15 & ~mask);
      boxP(B, c, 0, 0, 0, 1, 1, h1, F, emi, { cull: cull(h1), noTop: !m && upCovers() }); return;
    case T.WATER: boxP(B, c, 0, 0, 0, 1, 1, 4 / 12, F, [hash3(x, y, z) & 0x7fffff, 0], { cull: cull(4 / 12), flags: 2 }); return;
    case T.STREET: case T.WALK: case T.TERRACE:
      boxP(B, c, 0, 0, 0, 1, 1, 0.25, F, null, { cull: cull(0.25) }); return;
    case T.DECK: case T.ROOFWALK: {
      const th = t === T.DECK ? 0.25 : 2 / 12, rh = th + (t === T.DECK ? 5 : 4) / 12, nb = (vv >> 1) & 15;
      boxP(B, c, 0, 0, 0, 1, 1, th, sprNoRail(t, vv), emi, { cull: cull(th) });
      // railings on the open edges: bit 1 -> y = 0, 2 -> x = 0, 4 -> x = 1, 8 -> y = 1
      if (!(nb & 1)) quad(B, x, y, z, 1, 0, 0, 1, th, rh, sprRail(t, vv, 1), null, q, 1);
      if (!(nb & 2)) quad(B, x, y, z, 0, 0, 0, 1, th, rh, sprRail(t, vv, 2), null, q, 1);
      if (!(nb & 4)) quad(B, x, y, z, 0, 1, 0, 1, th, rh, sprRail(t, vv, 4), null, q, 1);
      if (!(nb & 8)) quad(B, x, y, z, 1, 1, 0, 1, th, rh, sprRail(t, vv, 8), null, q, 1);
      return;
    }
    case T.TUBE: {
      const nb = (vv >> 1) & 15;
      boxP(B, c, 0, 0, 0, 1, 1, 2 / 12, F, null, { cull: cull(2 / 12) });
      quad(B, x, y, z, 2, 9 / 12, 0, 1, 0, 1, F, null, q);
      if (!(nb & 1)) quad(B, x, y, z, 1, 0, 0, 1, 2 / 12, 9 / 12, F, null, q);
      if (!(nb & 2)) quad(B, x, y, z, 0, 0, 0, 1, 2 / 12, 9 / 12, F, null, q);
      if (!(nb & 4)) quad(B, x, y, z, 0, 1, 0, 1, 2 / 12, 9 / 12, F, null, q);
      if (!(nb & 8)) quad(B, x, y, z, 1, 1, 0, 1, 2 / 12, 9 / 12, F, null, q);
      return;
    }
    case T.FRAME: case T.CAPSULE: {
      // the slab takes the frame's full art; the sides only its cage (the full art's floor would
      // paint over a capsule's body from the front)
      const cage = sprCage(m), top = m ? HT / LH : 1;
      boxP(B, c, 0, 0, 0, 1, 1, 2 / 12, sprFull(T.FRAME, 0, m, 0), null, { cull: cull(2 / 12) });
      // the cage: four open sides (their art is all post and rim) and the back post
      quad(B, x, y, z, 0, 0, 0, 1, 0, top, cage, null, q); quad(B, x, y, z, 0, 1, 0, 1, 0, top, cage, null, q);
      quad(B, x, y, z, 1, 0, 0, 1, 0, top, cage, null, q); quad(B, x, y, z, 1, 1, 0, 1, 0, top, cage, null, q);
      if (t === T.CAPSULE) boxP(B, c, 0.125, 0.125, 2 / 12, 0.875, 0.875, m ? HT / LH : 11 / 12, F, emi);
      return;
    }
    case T.TRUSS: {
      const top = m ? HT / LH : 1;
      quad(B, x, y, z, 0, 0, 0, 1, 0, top, F, null, q); quad(B, x, y, z, 0, 1, 0, 1, 0, top, F, null, q);
      quad(B, x, y, z, 1, 0, 0, 1, 0, top, F, null, q); quad(B, x, y, z, 1, 1, 0, 1, 0, top, F, null, q);
      return;
    }
    case T.PILLAR: case T.VAULT: {
      if (t === T.PILLAR && (vv & 2)) boxP(B, c, 0, 0, 0, 1, 1, 0.25, sprBase(t, vv & 2, T.STREET, 0), null, { cull: cull(0.25) });
      if (t === T.VAULT && (vv & 1)) boxP(B, c, 0, 0, 0, 1, 1, 4 / 12, sprBase(t, 1, T.WATER, 0), null, { cull: cull(4 / 12) });
      if (t === T.PILLAR && (vv & 1)) boxP(B, c, 0.25, 0.25, 0, 0.75, 0.75, 2 / 12, F);
      boxP(B, c, 0.375, 0.375, 0, 0.625, 0.625, h1, F);
      if (!m) boxP(B, c, 0.25, 0.25, 11 / 12, 0.75, 0.75, 1, F);
      return;
    }
    case T.VENT: boxP(B, c, 0.25, 0.25, 0, 0.75, 0.75, 0.5, F); return;
    case T.CANOPY:
      if (!m) quad(B, x, y, z, 2, 1, 0, 1, 0, 1, F, null, q);
      if ((vv & 1) || m) boxP(B, c, 15 / 32, 15 / 32, 0, 17 / 32, 17 / 32, m ? h1 : 11 / 12, F);
      return;
    case T.PIPE: {
      const ax = vv & 1, P = (b, z0, z1) => ax === 0 ? boxP(B, c, 0, b - 0.06, z0, 1, b + 0.06, z1, F) : boxP(B, c, b - 0.06, 0, z0, b + 0.06, 1, z1, F);
      P(0.3, 4 / 12, 7 / 12); P(0.62, 1 / 12, 4 / 12); return;
    }
    case T.TREE: boxP(B, c, 0, 0, 0, 1, 1, 0.25, sprBase(t, vv & 3, T.TERRACE, vv & 3), null, { cull: cull(0.25) }); bill(B, c, sprDiff(t, vv, 0, T.TERRACE, vv & 3)); return;
    case T.LAMP:
      if (vv & 1) boxP(B, c, 0, 0, 0, 1, 1, 0.25, sprBase(t, 1, T.WALK, 0), null, { cull: cull(0.25) });
      bill(B, c, sprDiff(t, vv, 0, (vv & 1) ? T.WALK : null, 0)); return;
    case T.TANK: case T.RISER: case T.ANTENNA: case T.CRANE:
      bill(B, c, sprShaded(t, vv, m, mask));
      if (t === T.ANTENNA) { const s = sprShaded(t, vv, m, mask); if (s) B.blinks.push(x + 0.5, y + 0.5, z + 0.5, 8 - (s.w >> 1), 9 - (s.E + 10)); }
      return;
    default: boxP(B, c, 0, 0, 0, 1, 1, h1, F, emi);
  }
}
// the cut outline of a solid cell, as the 2D cutBlock draws it: an edge on each side whose
// neighbour is not cut the same way (bits: 1 y = 0, 2 x = 0, 4 x = 1, 8 y = 1), set in a hair
function cutEdges(B, x, y, h, bits) {
  const e = 0.035;
  if (bits & 1) B.segs.push(0, y + e, h, x); if (bits & 8) B.segs.push(0, y + 1 - e, h, x);
  if (bits & 2) B.segs.push(1, x + e, h, y); if (bits & 4) B.segs.push(1, x + 1 - e, h, y);
}
// unit edges -> runs: [x0, y0, z, x1, y1]
function mergeSegs(segs) {
  const runs = new Map(), out = [];
  for (let k = 0; k < segs.length; k += 4) { const key = segs[k] + ':' + segs[k + 1] + ':' + segs[k + 2]; (runs.get(key) || runs.set(key, []).get(key)).push(segs[k + 3]); }
  for (const [key, st] of runs) {
    const [ax, f, h] = key.split(':').map(Number); st.sort((a, b) => a - b);
    for (let i = 0; i < st.length;) { let j = i; while (j + 1 < st.length && st[j + 1] <= st[j] + 1) j++; out.push(ax ? [f, st[i], h, f, st[j] + 1] : [st[i], f, h, st[j] + 1, f]); i = j + 1; }
  }
  return out;
}
function buildLevel3(z, cut) {
  const B = mkBuilder(), sr = S.rot; S.rot = 0;   // sprite variants are worked out in the default view's frame
  try {
    for (let y = 0; y < D; y++) for (let x = 0; x < W; x++) { const i = idx(x, y, z), t = cells[i]; if (t) cellPlanes(B, t, i, x, y, z, cut); }
  } finally { S.rot = sr; }
  return uploadLevel(B);
}

// ---------- GL ----------
const VS_SCENE = `#version 300 es
precision highp float;
layout(location=0) in vec3 a_pos; layout(location=1) in vec3 a_cell; layout(location=2) in vec4 a_spr; layout(location=3) in vec2 a_emi; layout(location=4) in vec3 a_misc;
uniform vec3 u_R, u_U, u_C; uniform float u_s, u_LZ; uniform vec2 u_off, u_size, u_dr;
out vec3 v_pos; flat out vec3 v_cell; flat out vec4 v_spr; flat out vec2 v_emi; flat out vec3 v_misc;
void main() {
  vec3 w = vec3(a_pos.xy, a_pos.z * u_LZ);
  vec2 px = vec2(dot(w, u_R) * u_s + u_off.x, -dot(w, u_U) * u_s + u_off.y);
  vec3 cc = a_cell + 0.5;
  float dc = (dot(vec3(cc.xy, cc.z * u_LZ), u_C) - u_dr.x) / (u_dr.y - u_dr.x);
  // coplanar faces of two cells: the cell nearer the viewer wins, as in the 2D painter's order
  float z = 1.0 - 2.0 * (dot(w, u_C) - u_dr.x) / (u_dr.y - u_dr.x) - dc * 4e-5;
  gl_Position = vec4(px.x / u_size.x * 2.0 - 1.0, 1.0 - px.y / u_size.y * 2.0, z, 1.0);
  v_pos = a_pos; v_cell = a_cell; v_spr = a_spr; v_emi = a_emi; v_misc = a_misc;
}`;
const VS_BILL = `#version 300 es
precision highp float;
layout(location=0) in vec2 a_corner; layout(location=1) in vec3 a_anchor; layout(location=2) in vec4 a_rect; layout(location=3) in vec4 a_bm;
uniform vec3 u_R, u_U, u_C; uniform float u_s, u_LZ; uniform vec2 u_off, u_size, u_dr;
out vec2 v_loc; out vec3 v_pos; flat out vec4 v_rect; flat out vec4 v_bm;
void main() {
  vec3 w = vec3(a_anchor.xy, a_anchor.z * u_LZ);
  vec2 ap = floor(vec2(dot(w, u_R) * u_s + u_off.x, -dot(w, u_U) * u_s + u_off.y) + 0.5);
  vec2 loc = a_corner * a_rect.zw, d = loc - a_bm.xy, px = ap + d;
  // lit as the top of its cell (a sprite's own shading already carries its form)
  vec3 wp = w + (u_R * d.x - u_U * d.y) / u_s;
  v_pos = vec3(a_anchor.xy, max(a_anchor.z + 0.5, wp.z / u_LZ));
  float z = 1.0 - 2.0 * (dot(w, u_C) - u_dr.x) / (u_dr.y - u_dr.x);
  gl_Position = vec4(px.x / u_size.x * 2.0 - 1.0, 1.0 - px.y / u_size.y * 2.0, z, 1.0);
  v_loc = loc; v_rect = a_rect; v_bm = a_bm;
}`;
const FS_COMMON = `#version 300 es
precision highp float; precision highp int; precision highp sampler3D;
uniform sampler2D u_atlas, u_emi; uniform sampler3D u_sky, u_tr, u_sun3;
uniform vec3 u_R, u_C, u_toneT, u_toneL, u_toneR, u_sv, u_sunCol, u_sunShade, u_mist, u_dk;
uniform float u_LQ[7], u_cutTop, u_mistA, u_mistCap, u_LZ, u_time;
uniform int u_lit, u_sun, u_skyOn, u_ao, u_cutL, u_pass, u_texel, u_wt, u_cons;
uniform vec4 u_wcyc[8];
layout(location=0) out vec4 o_col; layout(location=1) out vec4 o_dep; layout(location=2) out vec4 o_em;
const int LNX = ${W * 2}, LNY = ${D * 2}, LNZ = ${NL * 4};
vec3 g_em = vec3(0.0);   // what this pixel gives off (lit windows), for the bloom
uint hsh(uint x) { x ^= x >> 16; x *= 0x7feb352du; x ^= x >> 15; x *= 0x846ca68bu; x ^= x >> 16; return x; }
float trAt(vec3 p) {
  ivec3 v = ivec3(floor(p.x * 2.0), floor(p.y * 2.0), floor(p.z * 4.0));
  if (v.z >= LNZ || v.x < 0 || v.y < 0 || v.x >= LNX || v.y >= LNY) return 1.0;
  if (v.z < 0) return 0.0;
  return texelFetch(u_tr, v, 0).r;
}
float skyAt(vec3 p) { if (p.z * 4.0 - 0.5 >= float(LNZ - 1)) return 1.0; return texture(u_sky, vec3(p.x / ${W}.0, p.y / ${D}.0, p.z / ${NL}.0)).r; }
// hard sun: the 2D lighting's own per-voxel march, filled in for every voxel and filtered
float sunHard(vec3 p) { if (p.z * 4.0 - 0.5 >= float(LNZ - 1)) return 1.0; if (p.z < 0.0) return 0.0; return texture(u_sun3, vec3(p.x / ${W}.0, p.y / ${D}.0, p.z / ${NL}.0)).r; }
vec3 litMul(vec3 p, vec3 n, float ndlFix) {
  float e = n.z > 0.5 ? 0.2 : 0.3; vec3 q = p + n * e;
  float sky = u_skyOn == 1 ? skyAt(q) : 1.0;
  float occ = 0.0;
  if (u_ao == 1) {
    vec3 ao[6] = vec3[6](vec3(0.4, 0.0, 0.15), vec3(-0.4, 0.0, 0.15), vec3(0.0, 0.4, 0.15), vec3(0.0, -0.4, 0.15), vec3(0.28, 0.28, 0.4), vec3(-0.28, -0.28, 0.4));
    for (int k = 0; k < 6; k++) occ += 1.0 - trAt(q + vec3(ao[k].x + n.x * ao[k].z, ao[k].y + n.y * ao[k].z, n.z * ao[k].z + 0.05));
  }
  float kk = (0.55 + 0.45 * min(1.0, sky * 1.15)) * (1.0 - occ / 6.0 * 0.55);
  vec3 m = vec3(kk, kk, kk * (0.96 + 0.06 * sky));
  if (u_sun == 1) {
    float ndl = ndlFix >= 0.0 ? ndlFix : max(0.0, dot(n, u_sv));
    float s = ndl > 0.02 ? sunHard(q) : 0.0, f = s * s * (3.0 - 2.0 * s);
    m *= mix(u_sunShade, mix(vec3(1.0), u_sunCol, 0.6) * (0.92 + 0.22 * ndl), f);
  }
  return m;
}
vec3 mist(vec3 col, float cz) {
  if (u_cutL < 0) return col;
  float k = float(u_cutL) - cz; if (k <= 0.0) return col;
  return mix(col, u_mist, 1.0 - pow(1.0 - u_mistA, min(k, u_mistCap)));
}
vec4 packDepth(vec3 p) {
  float dk = dot(vec3(p.xy, p.z * u_LZ), u_C) * u_dk.x;
  float f = clamp((dk - u_dk.y) / u_dk.z, 0.0, 1.0), v = floor(f * 16777215.0 + 0.5);
  float r = floor(v / 65536.0), g = floor((v - r * 65536.0) / 256.0), b = v - r * 65536.0 - g * 256.0;
  return vec4(r, g, b, 255.0) / 255.0;
}
void emit(vec3 col, float a, vec3 p) {
  if (u_pass == 0) { o_col = vec4(col, 1.0); o_dep = packDepth(p); o_em = vec4(g_em, 1.0); }
  else { o_col = vec4(col * a, a); o_dep = vec4(0.0); o_em = vec4(0.0); }
}
`;
const FS_SCENE = FS_COMMON + `
in vec3 v_pos; flat in vec3 v_cell; flat in vec4 v_spr; flat in vec2 v_emi; flat in vec3 v_misc;
void main() {
  int axis = int(v_misc.y), fl = int(v_misc.z);
  bool own = (fl & 1) != 0, water = (fl & 2) != 0;
  vec3 L = v_pos - v_cell, n = vec3(0.0);
  // the side a plane is seen from; from -x / -y it shows the +x / +y face's pixels, mirrored
  // (a rail is its own art from both sides)
  if (axis == 0) { if (u_C.x >= 0.0) n.x = 1.0; else { n.x = -1.0; if (!own) L.x = 1.0 - L.x; } }
  else if (axis == 1) { if (u_C.y >= 0.0) n.y = 1.0; else { n.y = -1.0; if (!own) L.y = 1.0 - L.y; } }
  else n.z = 1.0;
  // texel mode 1: each face keeps its own square grid (8 across a cell, 12 up a level) and shows
  // the sprite pixel at each texel's centre; mode 0 projects the sprite as it is
  if (u_texel == 1) {
    if (axis == 2) L.xy = (floor(L.xy * 8.0) + 0.5) / 8.0;
    else { if (axis == 0) L.y = (floor(L.y * 8.0) + 0.5) / 8.0; else L.x = (floor(L.x * 8.0) + 0.5) / 8.0; L.z = (floor(L.z * 12.0) + 0.5) / 12.0; }
  }
  float X = v_spr.w * 0.5 + (L.x - L.y) * 8.0, Y = v_spr.z + (L.x + L.y) * 4.0 + (1.0 - L.z) * 12.0;
  vec2 dx = vec2(dFdx(X), dFdx(Y)), dy = vec2(dFdy(X), dFdy(Y));
  ivec2 tc = ivec2(floor(X), floor(Y));
  if (tc.x < 0 || tc.y < 0 || tc.x >= int(v_spr.w) || tc.y >= 20 + int(v_spr.z)) discard;
  vec4 c = texelFetch(u_atlas, ivec2(v_spr.xy) + tc, 0);
  // conservative mode: where this pixel's footprint covers more than one sprite pixel and the
  // centre misses, take an opaque one from inside the footprint, so one-pixel lines (rails,
  // posts, lattice) never drop out on a foreshortened plane
  if (u_cons == 1 && c.a < 0.99 && u_pass == 0 && max(length(dx), length(dy)) > 1.0) {
    for (int k = 0; k < 4; k++) {
      vec2 o = (k == 0 ? dx : k == 1 ? -dx : k == 2 ? dy : -dy) * 0.45;
      ivec2 t2 = ivec2(floor(vec2(X, Y) + o));
      if (t2.x < 0 || t2.y < 0 || t2.x >= int(v_spr.w) || t2.y >= 20 + int(v_spr.z)) continue;
      vec4 c2 = texelFetch(u_atlas, ivec2(v_spr.xy) + t2, 0);
      if (c2.a >= 0.99) { c = c2; tc = t2; break; }
    }
  }
  if (u_pass == 0 ? c.a < 0.99 : (c.a >= 0.99 || c.a < 0.01)) discard;
  vec3 col = c.rgb;
  bool cutFace = axis == 2 && u_cutL >= 0 && v_cell.z == float(u_cutL) && abs(v_pos.z - u_cutTop) < 0.03;
  if (!cutFace) {
    // face tones stay tied to the view, as in the sprites: top, left (lit), right (shade)
    if (axis == 2) col *= u_toneT; else col *= mix(u_toneL, u_toneR, smoothstep(-0.25, 0.25, dot(n, u_R)));
    col *= u_LQ[int(v_misc.x)];
    if (u_lit == 1) col *= litMul(v_pos, n, -1.0);
  }
  if (!water && v_emi.x >= 0.0 && u_pass == 0) {
    vec4 e = texelFetch(u_emi, ivec2(v_emi) + tc, 0);
    int ea = int(e.a * 255.0 + 0.5);
    if (ea == 253 || ea == 254) {
      // the 2D view's flickering windows (off one beat in eight) and TVs, one rhythm per face of a cell
      uint h = hsh(uint(v_cell.x) + uint(v_cell.y) * 131u + uint(v_cell.z) * 17161u + uint(axis) * 7919u);
      float ph = float(h & 255u) / 37.0, rate = 0.25 + float((h >> 8) & 7u) * 0.12;
      uint st = hsh(uint(floor((u_time + ph * 7.0) * rate)) ^ h);
      if (ea == 253) e = vec4((st & 1u) != 0u ? vec3(0.624, 0.827, 0.878) : vec3(0.847, 0.933, 0.949), 1.0);
      else e.a = (st & 7u) == 0u ? 0.0 : 1.0;
    }
    col = mix(col, e.rgb, e.a); g_em = e.rgb * e.a;
  }
  // the 2D view's water glints: four 2x1 dots per cell on the surface, cycling through colours
  if (water && axis == 2 && u_pass == 0) {
    int h = int(v_emi.x), ty = int(v_spr.z) + 8;
    for (int k = 0; k < 4; k++) {
      float a = 0.15 + float((h >> (k * 5)) & 15) / 22.0, b = 0.15 + float((h >> (k * 5 + 3)) & 15) / 22.0;
      int dx = tc.x - 8 - int(floor((a - b) * 8.0)), dy = tc.y - ty - int(floor((a + b) * 4.0));
      if (dx >= 0 && dx < 2 && dy == 0) { vec4 w = u_wcyc[(((h >> (k * 3)) & 7) + u_wt) & 7]; if (w.a > 0.0) col = w.rgb; }
    }
  }
  emit(mist(min(col, vec3(1.0)), v_cell.z), c.a, v_pos);
}`;
// ---------- splat mode (U) ----------
// Instead of each screen pixel asking a plane which art pixel lies under it (which drops thin
// lines on a foreshortened plane, differently every frame), every opaque art pixel of every
// plane is sent as a point at its own place in the world, rounded to a screen pixel and sized
// to its footprint. One instance per plane, one vertex per pixel of the plane's sprite: the
// vertex shader finds where that art pixel sits on the plane, or drops it.
const SPLAT_H = 28;   // tallest sprite a plane carries (20 + the tree's extra 8)
const VS_SPLAT = `#version 300 es
precision highp float;
layout(location=0) in vec3 a_p0; layout(location=1) in vec3 a_p2; layout(location=2) in vec3 a_cell; layout(location=3) in vec4 a_spr; layout(location=4) in vec2 a_emi; layout(location=5) in vec3 a_misc;
uniform sampler2D u_atlas;
uniform vec3 u_R, u_U, u_C, u_psz; uniform float u_s, u_LZ, u_zb; uniform vec2 u_off, u_size, u_dr; uniform int u_pass;
out vec3 v_pos; flat out vec3 v_cell; flat out vec4 v_spr; flat out vec2 v_emi; flat out vec3 v_misc; flat out ivec2 v_tc;
void main() {
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 1.0;   // dropped unless placed below
  int axis = int(a_misc.y); bool own = (int(a_misc.z) & 1) != 0;
  int tw = int(a_spr.w), tx = gl_VertexID % 16, ty = gl_VertexID / 16;
  if (tx >= tw || ty >= 20 + int(a_spr.z)) return;
  vec4 c = texelFetch(u_atlas, ivec2(a_spr.xy) + ivec2(tx, ty), 0);
  if (u_pass == 0 ? c.a < 0.99 : (c.a >= 0.99 || c.a < 0.01)) return;
  // the inverse of the scene shader's projection: X = w/2 + (x - y)·8, Y = E + (x + y)·4 + (1 - z)·12
  vec3 lo = min(a_p0, a_p2) - a_cell, hi = max(a_p0, a_p2) - a_cell;
  float k = axis == 0 ? lo.x : axis == 1 ? lo.y : lo.z;
  bool mir = !own && ((axis == 0 && u_C.x < 0.0) || (axis == 1 && u_C.y < 0.0));   // seen from behind: mirrored
  float ks = mir ? 1.0 - k : k, X = float(tx) + 0.5, Y = float(ty) + 0.5, d = (X - a_spr.w * 0.5) / 8.0, E = a_spr.z;
  vec3 L;
  if (axis == 2) { float sm = (Y - E - (1.0 - ks) * 12.0) / 4.0; L = vec3((sm + d) * 0.5, (sm - d) * 0.5, ks); }
  else if (axis == 0) { float y = ks - d; L = vec3(ks, y, 1.0 - (Y - E - (ks + y) * 4.0) / 12.0); }
  else { float x = d + ks; L = vec3(x, ks, 1.0 - (Y - E - (x + ks) * 4.0) / 12.0); }
  if (axis == 0) L.x = k; else if (axis == 1) L.y = k;
  vec2 uv = axis == 0 ? L.yz : axis == 1 ? L.xz : L.xy, ulo = axis == 0 ? lo.yz : axis == 1 ? lo.xz : lo.xy, uhi = axis == 0 ? hi.yz : axis == 1 ? hi.xz : hi.xy;
  if (any(lessThan(uv, ulo)) || any(greaterThanEqual(uv, uhi))) return;
  vec3 P = a_cell + L, w = vec3(P.xy, P.z * u_LZ);
  vec2 px = vec2(dot(w, u_R) * u_s + u_off.x, -dot(w, u_U) * u_s + u_off.y);
  vec3 cc = a_cell + 0.5;
  float dc = (dot(vec3(cc.xy, cc.z * u_LZ), u_C) - u_dr.x) / (u_dr.y - u_dr.x);
  float z = 1.0 - 2.0 * (dot(w, u_C) - u_dr.x) / (u_dr.y - u_dr.x) - dc * 4e-5 - u_zb;
  gl_Position = vec4(px.x / u_size.x * 2.0 - 1.0, 1.0 - px.y / u_size.y * 2.0, z, 1.0);
  gl_PointSize = u_psz[axis];
  v_pos = P; v_cell = a_cell; v_spr = a_spr; v_emi = a_emi; v_misc = a_misc; v_tc = ivec2(tx, ty);
}`;
const FS_SPLAT = FS_COMMON + `
in vec3 v_pos; flat in vec3 v_cell; flat in vec4 v_spr; flat in vec2 v_emi; flat in vec3 v_misc; flat in ivec2 v_tc;
void main() {
  int axis = int(v_misc.y), fl = int(v_misc.z);
  bool own = (fl & 1) != 0, water = (fl & 2) != 0;
  vec3 n = vec3(0.0);
  if (axis == 0) n.x = u_C.x >= 0.0 ? 1.0 : -1.0; else if (axis == 1) n.y = u_C.y >= 0.0 ? 1.0 : -1.0; else n.z = 1.0;
  ivec2 tc = v_tc;
  vec4 c = texelFetch(u_atlas, ivec2(v_spr.xy) + tc, 0);
` + FS_SCENE.slice(FS_SCENE.indexOf('  if (u_pass == 0 ? c.a < 0.99'));
// how big one art pixel of a plane facing each axis is on screen, as a square point (at least 1)
function splatSizes(V) {
  const px = v => { const w = w3(v); return [dot3(w, V.R) * PXS, dot3(w, V.U) * PXS]; };
  // the art pixel's two edges on each kind of plane (from the projection's inverse)
  const E = [[[0, -1 / 8, -1 / 24], [0, 0, -1 / 12]], [[1 / 8, 0, 1 / 24], [0, 0, -1 / 12]], [[1 / 16, -1 / 16, 0], [1 / 8, 1 / 8, 0]]];
  return E.map(([a, b]) => { const A = px(a), B = px(b), ext = Math.max(Math.abs(A[0]) + Math.abs(B[0]), Math.abs(A[1]) + Math.abs(B[1])); return Math.max(1, Math.ceil(ext * G3.splatK - 0.2)); });
}
const FS_BILL = FS_COMMON + `
in vec2 v_loc; in vec3 v_pos; flat in vec4 v_rect; flat in vec4 v_bm;
void main() {
  ivec2 tc = ivec2(floor(v_loc));
  vec4 c = texelFetch(u_atlas, ivec2(v_rect.xy) + tc, 0);
  if (u_pass == 0 ? c.a < 0.99 : (c.a >= 0.99 || c.a < 0.01)) discard;
  vec3 col = c.rgb * u_LQ[int(v_bm.z)];
  if (u_lit == 1) col *= litMul(v_pos, vec3(0.0, 0.0, 1.0), 0.5);
  emit(mist(min(col, vec3(1.0)), v_bm.w), c.a, v_pos);
}`;
// the light well's beam: the faces of the well's column that face the viewer, depth tested
// against the scene, in the 2D view's every-other-column stripes
const VS_BEAM = `#version 300 es
precision highp float;
layout(location=0) in vec3 a_pos;
uniform vec3 u_R, u_U, u_C; uniform float u_s, u_LZ; uniform vec2 u_off, u_size, u_dr;
void main() {
  vec3 w = vec3(a_pos.xy, a_pos.z * u_LZ);
  vec2 px = vec2(dot(w, u_R) * u_s + u_off.x, -dot(w, u_U) * u_s + u_off.y);
  float z = 1.0 - 2.0 * (dot(w, u_C) - u_dr.x) / (u_dr.y - u_dr.x);
  gl_Position = vec4(px.x / u_size.x * 2.0 - 1.0, 1.0 - px.y / u_size.y * 2.0, z, 1.0);
}`;
const FS_BEAM = `#version 300 es
precision highp float;
uniform vec4 u_bcol; uniform float u_x0;
layout(location=0) out vec4 o;
void main() { if (mod(floor(gl_FragCoord.x) - u_x0, 2.0) > 0.5) discard; o = vec4(u_bcol.rgb * u_bcol.a, u_bcol.a); }`;
const VS_FULL = `#version 300 es
void main() { vec2 p = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0); gl_Position = vec4(p, 0.0, 1.0); }`;
// scene + sky + wires, from art pixels to the screen: nearest, or square pixels with soft seams
const FS_OUT = `#version 300 es
precision highp float;
uniform sampler2D u_scene, u_wire, u_sky, u_b2, u_b6, u_sh; uniform vec2 u_tsize, u_shift, u_canvas, u_bsz, u_qsz; uniform float u_scale, u_bloomA; uniform int u_sharp, u_shOn;
out vec4 o;
// the light overlays, added over everything as the 2D view does: night bloom (half-res) and
// sunlit air (quarter-res), both smooth, so sampled bilinearly at the exact art position
vec3 glow(vec2 a) {
  vec2 p = vec2(a.x, u_tsize.y - a.y);
  vec3 g = vec3(0.0);
  if (u_bloomA > 0.0) g += (texture(u_b2, p / (2.0 * u_bsz)).rgb + texture(u_b6, p / (2.0 * u_bsz)).rgb) * u_bloomA;
  if (u_shOn == 1) g += texture(u_sh, p / (4.0 * u_qsz)).rgb;
  return g;
}
vec3 at(ivec2 t) {
  t = clamp(t, ivec2(0), ivec2(u_tsize) - 1);
  vec4 s = texelFetch(u_scene, ivec2(t.x, int(u_tsize.y) - 1 - t.y), 0);
  vec3 c = mix(texelFetch(u_sky, t, 0).rgb, s.rgb / max(s.a, 1e-4), s.a);
  vec4 w = texelFetch(u_wire, t, 0);
  return mix(c, w.rgb, w.a);
}
void main() {
  vec2 fc = vec2(gl_FragCoord.x, u_canvas.y - gl_FragCoord.y), a = fc / u_scale + u_shift;
  if (u_sharp == 0) { o = vec4(min(at(ivec2(floor(a))) + glow(a), 1.0), 1.0); return; }
  vec2 b = a - 0.5, f = fract(b), i = floor(b);
  vec2 w = clamp((f - 0.5) * u_scale + 0.5, 0.0, 1.0);
  ivec2 k = ivec2(i);
  o = vec4(min(mix(mix(at(k), at(k + ivec2(1, 0)), w.x), mix(at(k + ivec2(0, 1)), at(k + ivec2(1, 1)), w.x), w.y) + glow(a), 1.0), 1.0);
}`;
// bloom: lit windows (as the scene left them visible), halved, then blurred twice (as the 2D
// view's blur(2px) and blur(6px) at half size)
const FS_DOWN = `#version 300 es
precision highp float;
uniform sampler2D u_src; out vec4 o;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy) * 2, m = textureSize(u_src, 0) - 1;
  o = (texelFetch(u_src, min(p, m), 0) + texelFetch(u_src, min(p + ivec2(1, 0), m), 0) + texelFetch(u_src, min(p + ivec2(0, 1), m), 0) + texelFetch(u_src, min(p + ivec2(1, 1), m), 0)) * 0.25;
}`;
const FS_BLUR = `#version 300 es
precision highp float;
uniform sampler2D u_src; uniform ivec2 u_dir; uniform float u_sigma; out vec4 o;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy), m = textureSize(u_src, 0) - 1;
  int r = int(ceil(u_sigma * 3.0)); vec4 s = vec4(0.0); float ws = 0.0;
  for (int i = -18; i <= 18; i++) {
    if (i < -r || i > r) continue;
    float w = exp(-float(i * i) / (2.0 * u_sigma * u_sigma));
    s += texelFetch(u_src, clamp(p + u_dir * i, ivec2(0), m), 0) * w; ws += w;
  }
  o = s / ws;
}`;
// sunlit air (the 2D view's shaftsLayer): from the surface under each quarter-res pixel, march
// toward the viewer through open air below the cut and add up the soft sun
const FS_SHAFT = FS_COMMON.replace('void emit', 'void emit_') + `
uniform sampler2D u_dep; uniform sampler3D u_soft; uniform vec3 u_Uv; uniform vec2 u_offv; uniform float u_K, u_zref, u_Ht;
float softAt(vec3 p) { if (p.z * 4.0 - 0.5 >= float(LNZ - 1)) return 1.0; if (p.z < 0.0) return 0.0; return texture(u_soft, vec3(p.x / ${W}.0, p.y / ${D}.0, p.z / ${NL}.0)).r; }
void main() {
  ivec2 g = min(ivec2(gl_FragCoord.xy) * 4 + 2, textureSize(u_dep, 0) - 1);
  vec4 c = texelFetch(u_dep, g, 0);
  if (c.a < 0.5) { o_col = vec4(0.0); return; }
  vec3 b = floor(c.rgb * 255.0 + 0.5);
  float dk = u_dk.y + (b.r * 65536.0 + b.g * 256.0 + b.b) / 16777215.0 * u_dk.z, d = dk / u_K;
  vec2 art = vec2(float(g.x) + 0.5, u_Ht - float(g.y) - 0.5);
  float ra = (art.x - u_offv.x) / ${PXS}, ub = -(art.y - u_offv.y) / ${PXS};
  vec3 P = u_R * ra + u_Uv * ub + u_C * d, p = vec3(P.xy, P.z / u_LZ);
  vec3 view = normalize(vec3(u_C.xy, u_C.z / u_LZ));
  float a = 0.0;
  for (int k = 0; k < 20; k++) {
    vec3 q = p + view * (0.3 + 0.35 * float(k));
    if (q.z > u_zref) break;
    if (trAt(q) < 0.5) continue;
    a += softAt(q) * 0.35;
  }
  o_col = vec4(a);
}`;
const FS_SHBLUR = `#version 300 es
precision highp float;
uniform sampler2D u_src; uniform vec3 u_col; uniform float u_k; out vec4 o;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy), m = textureSize(u_src, 0) - 1; float s = 0.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) s += texelFetch(u_src, clamp(p + ivec2(i, j), ivec2(0), m), 0).r;
  float k = min(0.3 * u_k, s / 9.0 * 0.065 * u_k) * 0.55;
  o = vec4(k * vec3(0.9, 0.85, 0.7) * u_col, 1.0);
}`;
function glProg(gl, vs, fs) {
  const mkS = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(s)); return s; };
  const p = gl.createProgram(); gl.attachShader(p, mkS(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mkS(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
  const U = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let k = 0; k < n; k++) { const info = gl.getActiveUniform(p, k), nm = info.name.replace(/\[0\]$/, ''); U[nm] = gl.getUniformLocation(p, info.name); }
  return { p, U };
}
function glTex(gl, filter) {
  const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter || gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter || gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}
function g3Init() {
  if (G3.gl) return true;
  const st = $('stage'), cv = document.createElement('canvas');
  cv.id = 'gl3d'; cv.style.cssText = 'position:absolute;left:0;top:0;display:none;touch-action:none;cursor:grab';
  st.appendChild(cv);
  const gl = cv.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: true });
  if (!gl) { log('sys', '3D view: WebGL2 is not available here', 'sys'); return false; }
  G3.cv = cv; G3.gl = gl;
  gl.getExtension('EXT_color_buffer_float');
  G3.prog.scene = glProg(gl, VS_SCENE, FS_SCENE);
  G3.prog.bill = glProg(gl, VS_BILL, FS_BILL);
  G3.prog.out = glProg(gl, VS_FULL, FS_OUT);
  G3.prog.beam = glProg(gl, VS_BEAM, FS_BEAM);
  G3.prog.splat = glProg(gl, VS_SPLAT, FS_SPLAT);
  G3.beamVao = gl.createVertexArray(); gl.bindVertexArray(G3.beamVao);
  G3.beamBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, G3.beamBuf); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  for (const [k, fs] of [['down', FS_DOWN], ['blur', FS_BLUR], ['shaft', FS_SHAFT], ['shblur', FS_SHBLUR]]) G3.prog[k] = glProg(gl, VS_FULL, fs);
  G3.A = mkAtlas(4096); G3.EA = mkAtlas(2048);
  for (const k of ['atlas', 'emi', 'scene', 'dep', 'wire', 'sky', 'em', 'bA', 'bT', 'shA']) G3.tex[k] = glTex(gl);
  for (const k of ['b2', 'b6', 'shB']) G3.tex[k] = glTex(gl, gl.LINEAR);
  G3.pfbo = gl.createFramebuffer();
  G3.quadBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, G3.quadBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]), gl.STATIC_DRAW);
  G3.wcv = mk(4, 4); G3.wg = G3.wcv.getContext('2d');
  const hud = document.createElement('div'); hud.id = 'g3hud';
  hud.style.cssText = 'position:absolute;left:84px;bottom:8px;display:none;padding:4px 8px;background:rgba(14,13,12,.82);color:#d8d0bf;font:11px/1.45 var(--mono);border-radius:3px;pointer-events:none;white-space:pre;z-index:5';
  st.appendChild(hud); G3.hud = hud;
  g3Input(cv);
  return true;
}
function uploadLevel(B) {
  const gl = G3.gl, L = { nq: B.nq, nb: B.nb, lines: B.segs.length ? mergeSegs(B.segs) : null, blinks: B.blinks.length ? B.blinks : null };
  if (B.nq) {
    L.vao = gl.createVertexArray(); gl.bindVertexArray(L.vao);
    L.vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, L.vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(B.v), gl.STATIC_DRAW);
    const st = 15 * 4; let o = 0;
    for (const [loc, n] of [[0, 3], [1, 3], [2, 4], [3, 2], [4, 3]]) { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, st, o); o += n * 4; }
    L.ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, L.ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(B.idx), gl.STATIC_DRAW);
    // splat mode reads the same buffer one plane at a time: corners 0 and 2 give the rect
    L.svao = gl.createVertexArray(); gl.bindVertexArray(L.svao); gl.bindBuffer(gl.ARRAY_BUFFER, L.vb);
    for (const [loc, n, off] of [[0, 3, 0], [1, 3, 2 * st], [2, 3, 12], [3, 4, 24], [4, 2, 40], [5, 3, 48]]) { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, st * 4, off); gl.vertexAttribDivisor(loc, 1); }
  }
  if (B.nb) {
    L.bvao = gl.createVertexArray(); gl.bindVertexArray(L.bvao);
    gl.bindBuffer(gl.ARRAY_BUFFER, G3.quadBuf); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    L.bb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, L.bb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(B.bb), gl.STATIC_DRAW);
    const st = 11 * 4;
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, st, 0); gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, st, 12); gl.vertexAttribDivisor(2, 1);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.FLOAT, false, st, 28); gl.vertexAttribDivisor(3, 1);
  }
  gl.bindVertexArray(null);
  return L;
}
function freeLevel(L) {
  if (!L) return; const gl = G3.gl;
  for (const k of ['vb', 'ib', 'bb']) if (L[k]) gl.deleteBuffer(L[k]);
  for (const k of ['vao', 'bvao']) if (L[k]) gl.deleteVertexArray(L[k]);
}
// ---------- keeping the GPU copy of the world current ----------
function g3Sync() {
  const t0 = performance.now();
  if (!G3.built) { for (let z = 0; z < NL; z++) G3.dirty.add(z); G3.built = true; }
  for (const z of G3.dirty) { freeLevel(G3.lv[z]); G3.lv[z] = levelEmpty(z) ? null : buildLevel3(z, false); for (const [k, c] of G3.cuts) if (Math.abs(k - z) <= 1) { freeLevel(c); G3.cuts.delete(k); } }
  if (G3.dirty.size) G3.stats.build = (performance.now() - t0).toFixed(0) + ' ms';
  G3.dirty.clear();
  const L = S.level;
  if (L < NL - 1 && !G3.cuts.has(L)) {
    if (G3.cuts.size >= 3) { const k = G3.cuts.keys().next().value; freeLevel(G3.cuts.get(k)); G3.cuts.delete(k); }
    G3.cuts.set(L, buildLevel3(L, true));
  }
  const gl = G3.gl;
  for (const [A, k] of [[G3.A, 'atlas'], [G3.EA, 'emi']]) if (A.dirty) {
    gl.bindTexture(gl.TEXTURE_2D, G3.tex[k]); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, A.c); A.dirty = false;
  }
  if (LIT.on) {
    g3LightVol();
    const key = LIT.tkey + '|' + LIT.skey;
    if (key !== G3.litKey) {
      const n = LNX * LNY * LNZ, tr = new Uint8Array(n);
      for (let i = 0; i < n; i++) tr[i] = Math.round(LIT.tr[i] * 255);
      G3.tex.tr = G3.tex.tr || gl.createTexture(); gl.bindTexture(gl.TEXTURE_3D, G3.tex.tr);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage3D(gl.TEXTURE_3D, 0, gl.R8, LNX, LNY, LNZ, 0, gl.RED, gl.UNSIGNED_BYTE, tr);
      G3.tex.sky3 = G3.tex.sky3 || gl.createTexture(); gl.bindTexture(gl.TEXTURE_3D, G3.tex.sky3);
      for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D, p, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage3D(gl.TEXTURE_3D, 0, gl.R16F, LNX, LNY, LNZ, 0, gl.RED, gl.FLOAT, LIT.skyV);
      if (LIT.sv && LIT.sunSoft) {   // soft sun, for the sunlit air
        G3.tex.soft3 = G3.tex.soft3 || gl.createTexture(); gl.bindTexture(gl.TEXTURE_3D, G3.tex.soft3);
        for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D, p, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texImage3D(gl.TEXTURE_3D, 0, gl.R16F, LNX, LNY, LNZ, 0, gl.RED, gl.FLOAT, LIT.sunSoft);
      }
      G3.litKey = key; G3.sunKey = '';
    }
    if (LIT.sv && G3.sunKey !== key) { g3SunPass(); G3.sunKey = key; }
  }
}
// The hard sun for every voxel: the 2D lighting's own march (sunHardAt), run on the GPU one
// layer at a time into a 3D texture. On the CPU this took a quarter of a second.
const FS_SUN = `#version 300 es
precision highp float; precision highp sampler3D;
uniform sampler3D u_tr; uniform int u_z; uniform vec2 u_o;
out vec4 o;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  float v = texelFetch(u_tr, ivec3(p, u_z), 0).r;
  if (v > 0.0) for (int s = 1; s < ${NL * 4}; s++) {
    if (u_z + s >= ${NL * 4}) break;
    vec2 q = floor(vec2(p) + u_o * float(s) + 0.5);
    if (q.x < 0.0 || q.y < 0.0 || q.x >= ${W * 2}.0 || q.y >= ${D * 2}.0) break;
    v *= texelFetch(u_tr, ivec3(ivec2(q), u_z + s), 0).r;
    if (v < 0.02) { v = 0.0; break; }
  }
  o = vec4(v);
}`;
function g3SunPass() {
  const gl = G3.gl, sv = LIT.sv, k = 0.25 / sv[2];
  if (!G3.tex.sun3) {
    G3.tex.sun3 = gl.createTexture(); gl.bindTexture(gl.TEXTURE_3D, G3.tex.sun3);
    for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D, p, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.R8, LNX, LNY, LNZ, 0, gl.RED, gl.UNSIGNED_BYTE, null);
    G3.sfbo = gl.createFramebuffer(); G3.prog.sun = glProg(gl, VS_FULL, FS_SUN);
  }
  const P = G3.prog.sun;
  gl.bindFramebuffer(gl.FRAMEBUFFER, G3.sfbo); gl.useProgram(P.p); gl.bindVertexArray(null);
  gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.viewport(0, 0, LNX, LNY);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_3D, G3.tex.tr); gl.uniform1i(P.U.u_tr, 0);
  gl.uniform2f(P.U.u_o, sv[0] * k * 2, sv[1] * k * 2);
  for (let z = 0; z < LNZ; z++) { gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, G3.tex.sun3, 0, z); gl.uniform1i(P.U.u_z, z); gl.drawArrays(gl.TRIANGLES, 0, 3); }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}
// The light volumes (what each voxel lets through, sky light, soft sun) are the 2D lighting's,
// worked out as ensureLightVol does, but a few milliseconds a frame: the world keeps changing
// (the drones land a job about once a second) and redoing them at once stalled the view. The
// old volumes stay in use until the new ones are done.
const SKY_DIRS = [[[0, 0, 1], 2], [[0.6, 0, 0.8], 1], [[-0.6, 0, 0.8], 1], [[0, 0.6, 0.8], 1], [[0, -0.6, 0.8], 1]];
function* sweepJob(tr, dir, out, wgt) {   // sweepSoft, a few layers at a time
  const k = 0.25 / dir[2], ox = dir[0] * k * 2, oy = dir[1] * k * 2;
  const cur = new Float32Array(LLAY), prev = new Float32Array(LLAY).fill(1);
  const at = (xi, yi) => xi < 0 || yi < 0 || xi >= LNX || yi >= LNY ? 1 : prev[yi * LNX + xi];
  for (let z = LNZ - 1; z >= 0; z--) {
    for (let y = 0; y < LNY; y++) for (let x = 0; x < LNX; x++) {
      const fx = x + ox, fy = y + oy, x0 = Math.floor(fx), y0 = Math.floor(fy), wx = fx - x0, wy = fy - y0;
      const up = (at(x0, y0) * (1 - wx) + at(x0 + 1, y0) * wx) * (1 - wy) + (at(x0, y0 + 1) * (1 - wx) + at(x0 + 1, y0 + 1) * wx) * wy;
      const i = y * LNX + x, v = tr[z * LLAY + i] * up;
      cur[i] = v; out[z * LLAY + i] += v * wgt;
    }
    prev.set(cur);
    if ((z & 3) === 0) yield;
  }
}
function* lightJob(tkey) {
  const n = LLAY * LNZ, spare = G3.spare || (G3.spare = {});
  let tr = LIT.tr, sky = LIT.skyV, soft = null;
  if (tkey !== LIT.tkey) {
    tr = spare.tr || new Float32Array(n);
    for (let z = 0; z < LNZ; z++) {
      const cz = z >> 2, f = ((z & 3) + 0.5) / 4;
      for (let y = 0; y < LNY; y++) for (let x = 0; x < LNX; x++) tr[z * LLAY + y * LNX + x] = litTrans(cells[idx(x >> 1, y >> 1, cz)], f);
      if ((z & 7) === 7) yield;
    }
    sky = spare.sky || new Float32Array(n); sky.fill(0);
    for (const [d, w] of SKY_DIRS) yield* sweepJob(tr, d, sky, w / 6);
  }
  const sv = litSun() ? sunVec(LIT.sun) : null;
  if (sv) { soft = spare.soft || new Float32Array(n); soft.fill(0); yield* sweepJob(tr, sv, soft, 1); }
  return { tr, sky, soft, sv };
}
function g3LightVol() {
  if (!LIT.tr || !LIT.skyV) { ensureLightVol(); return; }
  let job = G3.lj;
  if (!job) {
    let h = 0; for (let i = 0; i < cells.length; i++) h = (h * 31 + cells[i]) | 0;
    const tkey = String(h), skey = tkey + ':' + LIT.sun;
    if (LIT.tkey === tkey && LIT.skey === skey) return;
    job = G3.lj = { tkey, skey, it: lightJob(tkey) };
  }
  const t0 = performance.now(); let r;
  do r = job.it.next(); while (!r.done && performance.now() - t0 < 4);
  if (!r.done) return;
  const v = r.value, sp = G3.spare;
  // swap the new volumes in; the replaced ones are reused by the next job
  if (v.tr !== LIT.tr) { sp.tr = LIT.tr; LIT.tr = v.tr; sp.sky = LIT.skyV; LIT.skyV = v.sky; }
  if (v.soft) { sp.soft = LIT.sunSoft; LIT.sunSoft = v.soft; (LIT.sunHard || (LIT.sunHard = new Float32Array(LLAY * LNZ))).fill(-1); }
  LIT.sv = v.sv; LIT.tkey = job.tkey; LIT.skey = job.skey; G3.lj = null;
}
// ---------- one frame ----------
function g3Target(V) {
  const gl = G3.gl, [w, h] = [V.Wt, V.Ht];
  if (G3.size[0] === w && G3.size[1] === h && G3.fbo) return;
  G3.size = [w, h];
  for (const k of ['scene', 'dep', 'em']) { gl.bindTexture(gl.TEXTURE_2D, G3.tex[k]); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); }
  // the light overlays: bloom at half size, sunlit air at a quarter
  G3.bsz = [Math.ceil(w / 2), Math.ceil(h / 2)]; G3.qsz = [Math.ceil(w / 4), Math.ceil(h / 4)];
  for (const [k, s] of [['bA', G3.bsz], ['bT', G3.bsz], ['b2', G3.bsz], ['b6', G3.bsz], ['shA', G3.qsz], ['shB', G3.qsz]]) { gl.bindTexture(gl.TEXTURE_2D, G3.tex[k]); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, s[0], s[1], 0, gl.RGBA, gl.HALF_FLOAT, null); }
  if (!G3.fbo) { G3.fbo = gl.createFramebuffer(); G3.rb = gl.createRenderbuffer(); }
  gl.bindRenderbuffer(gl.RENDERBUFFER, G3.rb); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
  gl.bindFramebuffer(gl.FRAMEBUFFER, G3.fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, G3.tex.scene, 0);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, G3.tex.dep, 0);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT2, gl.TEXTURE_2D, G3.tex.em, 0);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, G3.rb);
  G3.depBytes = new Uint8Array(w * h * 4); G3.fd = new Float32Array(w * h);
  G3.wcv.width = w; G3.wcv.height = h;
}
function setCommon(gl, P, V) {
  const U = P.U, sun = litSun(), tod = TODS[S.tod];
  gl.uniform3fv(U.u_R, V.R); gl.uniform3fv(U.u_U, V.U); gl.uniform3fv(U.u_C, V.C);
  gl.uniform1f(U.u_s, PXS); gl.uniform1f(U.u_LZ, LZ); gl.uniform2fv(U.u_off, V.off); gl.uniform2f(U.u_size, V.Wt, V.Ht); gl.uniform2f(U.u_dr, V.d0, V.d1);
  gl.uniform3fv(U.u_toneT, tod.t); gl.uniform3fv(U.u_toneL, tod.l); gl.uniform3fv(U.u_toneR, tod.r);
  gl.uniform1fv(U.u_LQ, LQ);
  gl.uniform1i(U.u_lit, LIT.on ? 1 : 0); gl.uniform1i(U.u_skyOn, LIT.sky ? 1 : 0); gl.uniform1i(U.u_ao, LIT.ao ? 1 : 0);
  gl.uniform1i(U.u_sun, sun && LIT.sv ? 1 : 0);
  if (sun && LIT.sv) { gl.uniform3fv(U.u_sv, LIT.sv); gl.uniform3fv(U.u_sunCol, sun.col); gl.uniform3fv(U.u_sunShade, sun.shade); }
  const sliced = S.level < NL - 1;
  gl.uniform1i(U.u_cutL, sliced ? S.level : -1); gl.uniform1f(U.u_cutTop, S.level + HT / LH);
  const mOn = mistOn(), mc = mOn ? mistRGB() : [14, 11, 9];
  gl.uniform3f(U.u_mist, mc[0] / 255, mc[1] / 255, mc[2] / 255); gl.uniform1f(U.u_mistA, mOn ? LIT.mistA : (S.shade ? 0.1 : 0)); gl.uniform1f(U.u_mistCap, mOn ? MIST_LEVELS : 99);
  gl.uniform3f(U.u_dk, V.K, V.dk0, V.dk1 - V.dk0); gl.uniform1i(U.u_texel, G3.texel); gl.uniform1i(U.u_cons, G3.cons ? 1 : 0);
  if (U.u_wcyc) {
    if (G3.wcycTod !== S.tod) { G3.wcyc = new Float32Array(32); WATERCYC[S.tod].forEach((c, k) => { if (c) { const [r, g, b] = rgbOf(c); G3.wcyc.set([r / 255, g / 255, b / 255, 1], k * 4); } }); G3.wcycTod = S.tod; }
    gl.uniform4fv(U.u_wcyc, G3.wcyc); gl.uniform1i(U.u_wt, Math.floor(S.time * 5));
  }
  gl.uniform1f(U.u_time, S.time % 4096);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, G3.tex.atlas); gl.uniform1i(U.u_atlas, 0);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, G3.tex.emi); gl.uniform1i(U.u_emi, 1);
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_3D, G3.tex.sky3 || null); gl.uniform1i(U.u_sky, 2);
  gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_3D, G3.tex.tr || null); gl.uniform1i(U.u_tr, 3);
  gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_3D, G3.tex.sun3 || null); gl.uniform1i(U.u_sun3, 4);
}
function g3Levels() {
  const L = S.level, sliced = L < NL - 1, floor = S.floor >= 0 ? S.floor : 0, out = [];
  for (let z = floor; z < NL; z++) {
    if (sliced && z > L) break;
    out.push(sliced && z === L ? G3.cuts.get(L) : G3.lv[z]);
  }
  return out.filter(Boolean);
}
// hold Z: today's renderer (plain planes, no thin lines), for flipping back and forth at one angle
function g3Render() {
  if (!G3.peek) return g3Render0();
  const sv = [G3.splat, G3.cons]; G3.splat = 0; G3.cons = false;
  try { g3Render0(); } finally { [G3.splat, G3.cons] = sv; }
}
function g3Render0() {
  const gl = G3.gl, now = performance.now(), dt = G3.last ? Math.min(0.05, (now - G3.last) / 1000) : 0; G3.last = now;
  g3Animate(dt);
  const cssW = S.cssW, cssH = S.cssH, dpr = window.devicePixelRatio || 1;
  const cw = Math.round(cssW * dpr), ch = Math.round(cssH * dpr);
  if (G3.cv.width !== cw || G3.cv.height !== ch) { G3.cv.width = cw; G3.cv.height = ch; G3.cv.style.width = cssW + 'px'; G3.cv.style.height = cssH + 'px'; }
  g3Sync();
  const V = g3View(); G3.V = V; g3Target(V);
  const t0 = performance.now();
  // scene
  gl.bindFramebuffer(gl.FRAMEBUFFER, G3.fbo); gl.viewport(0, 0, V.Wt, V.Ht);
  gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2]);
  gl.clearColor(0, 0, 0, 0); gl.clearDepth(1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.disable(gl.CULL_FACE);
  const levels = g3Levels();
  for (const pass of [0, 1]) {
    if (pass === 1) { gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.NONE, gl.NONE]); }
    let P = G3.prog.scene;
    // splat 1: the planes as usual, then every art pixel as a one-pixel point a hair in front,
    // so no pixel of a rail or lattice is ever skipped. splat 2: points alone, sized to cover
    if (G3.splat !== 2) {
      gl.useProgram(P.p); setCommon(gl, P, V); gl.uniform1i(P.U.u_pass, pass);
      for (const L of levels) if (L.nq) { gl.bindVertexArray(L.vao); gl.drawElements(gl.TRIANGLES, L.nq * 6, gl.UNSIGNED_INT, 0); }
    }
    if (G3.splat && (G3.splat === 2 || pass === 0)) {   // half-transparent pixels: the planes' blend only, or they'd double
      P = G3.prog.splat; gl.useProgram(P.p); setCommon(gl, P, V); gl.uniform1i(P.U.u_pass, pass);
      gl.uniform3fv(P.U.u_psz, G3.splat === 2 ? splatSizes(V) : [1, 1, 1]); gl.uniform1f(P.U.u_zb, G3.splat === 2 ? 0 : 2e-5);
      for (const L of levels) if (L.nq) { gl.bindVertexArray(L.svao); gl.drawArraysInstanced(gl.POINTS, 0, 16 * SPLAT_H, L.nq); }
    }
    P = G3.prog.bill; gl.useProgram(P.p); setCommon(gl, P, V); gl.uniform1i(P.U.u_pass, pass);
    for (const L of levels) if (L.nb) { gl.bindVertexArray(L.bvao); gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, L.nb); }
  }
  g3Beams(V);
  gl.disable(gl.BLEND); gl.depthMask(true); gl.bindVertexArray(null);
  // the depth the cable code tests against
  gl.readBuffer(gl.COLOR_ATTACHMENT1);
  gl.readPixels(0, 0, V.Wt, V.Ht, gl.RGBA, gl.UNSIGNED_BYTE, G3.depBytes);
  const db = G3.depBytes, fd = G3.fd, span = V.dk1 - V.dk0;
  for (let y = 0; y < V.Ht; y++) {
    const src = (V.Ht - 1 - y) * V.Wt * 4, dst = y * V.Wt;
    for (let x = 0; x < V.Wt; x++) { const i = src + x * 4; fd[dst + x] = db[i + 3] ? V.dk0 + (db[i] * 65536 + db[i + 1] * 256 + db[i + 2]) / 16777215 * span : -1e9; }
  }
  const t1 = performance.now();
  const post = g3Post(V);   // queued for the GPU while the CPU draws the cables
  g3Wires(V, levels);
  const t2 = performance.now();
  g3Sky(V);
  // to the screen
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, cw, ch); gl.disable(gl.DEPTH_TEST);
  gl.bindTexture(gl.TEXTURE_2D, G3.tex.wire); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, G3.wcv);
  const P = G3.prog.out; gl.useProgram(P.p);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, G3.tex.scene); gl.uniform1i(P.U.u_scene, 0);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, G3.tex.wire); gl.uniform1i(P.U.u_wire, 1);
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, G3.tex.sky); gl.uniform1i(P.U.u_sky, 2);
  gl.uniform2f(P.U.u_tsize, V.Wt, V.Ht); gl.uniform2fv(P.U.u_shift, V.shift); gl.uniform2f(P.U.u_canvas, cw, ch);
  gl.uniform1f(P.U.u_scale, G3.zf * dpr); gl.uniform1i(P.U.u_sharp, G3.filter === 'sharp' && Math.abs(G3.zf * dpr - Math.round(G3.zf * dpr)) > 1e-3 ? 1 : 0);
  gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, G3.tex.b2); gl.uniform1i(P.U.u_b2, 3);
  gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, G3.tex.b6); gl.uniform1i(P.U.u_b6, 4);
  gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, G3.tex.shB); gl.uniform1i(P.U.u_sh, 5);
  gl.uniform2fv(P.U.u_bsz, G3.bsz); gl.uniform2fv(P.U.u_qsz, G3.qsz);
  gl.uniform1f(P.U.u_bloomA, post.bloomA); gl.uniform1i(P.U.u_shOn, post.shafts ? 1 : 0);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  G3.stats.gpu = (t1 - t0).toFixed(1); G3.stats.wires = (t2 - t1).toFixed(1);
  g3Hud();
}
function g3Beams(V) {
  const wb = wellBeam(); if (!wb || !WORLD.wells.length) return;
  const gl = G3.gl, P = G3.prog.beam, top = Math.min(NL, (S.level < NL - 1 ? S.level : NL - 1) + 1), bot = 0.35;
  gl.useProgram(P.p); setCommon(gl, P, V);
  gl.uniform4f(P.U.u_bcol, wb[0][0] / 255, wb[0][1] / 255, wb[0][2] / 255, wb[1]);
  gl.bindVertexArray(G3.beamVao); gl.bindBuffer(gl.ARRAY_BUFFER, G3.beamBuf);
  for (const w of WORLD.wells) {
    const x0 = w.x, y0 = w.y, x1 = w.x + w.s, y1 = w.y + w.s, v = [];
    const face = (n, ...c) => { if (dot3(n, V.C) <= 0) return; for (const k of [0, 1, 2, 0, 2, 3]) v.push(...c[k]); };
    face([-1, 0, 0], [x0, y0, bot], [x0, y1, bot], [x0, y1, top], [x0, y0, top]);
    face([1, 0, 0], [x1, y0, bot], [x1, y1, bot], [x1, y1, top], [x1, y0, top]);
    face([0, -1, 0], [x0, y0, bot], [x1, y0, bot], [x1, y0, top], [x0, y0, top]);
    face([0, 1, 0], [x0, y1, bot], [x1, y1, bot], [x1, y1, top], [x0, y1, top]);
    face([0, 0, 1], [x0, y0, top], [x1, y0, top], [x1, y1, top], [x0, y1, top]);
    // stripes keep to the well, as in 2D (from its leftmost top corner), so they don't crawl in a pan
    gl.uniform1f(P.U.u_x0, Math.round(Math.min(...[[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(p => g3Proj(V, p[0], p[1], top)[0]))));
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.STREAM_DRAW);
    gl.drawArrays(gl.TRIANGLES, 0, v.length / 3);
  }
}
// the light overlays the 2D view draws after the world: sunlit air by day, bloom after dark
function g3Post(V) {
  const gl = G3.gl, out = { bloomA: 0, shafts: false };
  if (!LIT.on) return out;
  const pass = (prog, tgt, size, set) => {
    const P = G3.prog[prog]; gl.useProgram(P.p);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, G3.tex[tgt], 0);
    gl.viewport(0, 0, size[0], size[1]); set(P.U); gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
  const src = (U, k, unit) => { gl.activeTexture(gl.TEXTURE0 + (unit || 0)); gl.bindTexture(gl.TEXTURE_2D, G3.tex[k]); gl.uniform1i(U.u_src, unit || 0); };
  gl.bindFramebuffer(gl.FRAMEBUFFER, G3.pfbo); gl.drawBuffers([gl.COLOR_ATTACHMENT0]); gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.bindVertexArray(null);
  if (LIT.bloom && LIT.bloomK > 0 && S.tod !== 'day') {
    out.bloomA = Math.min(1, (S.tod === 'night' ? 0.85 : 0.5) * LIT.bloomK);
    pass('down', 'bA', G3.bsz, U => src(U, 'em'));
    for (const [k, sg] of [['b2', 2], ['b6', 6]]) {
      pass('blur', 'bT', G3.bsz, U => { src(U, 'bA'); gl.uniform2i(U.u_dir, 1, 0); gl.uniform1f(U.u_sigma, sg); });
      pass('blur', k, G3.bsz, U => { src(U, 'bT'); gl.uniform2i(U.u_dir, 0, 1); gl.uniform1f(U.u_sigma, sg); });
    }
  }
  const sun = litSun();
  if (LIT.shafts && LIT.shaftK > 0 && sun && G3.tex.soft3 && G3.tex.tr) {
    out.shafts = true;
    const sliced = S.level < NL - 1;
    pass('shaft', 'shA', G3.qsz, U => {
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, G3.tex.dep); gl.uniform1i(U.u_dep, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_3D, G3.tex.soft3); gl.uniform1i(U.u_soft, 1);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_3D, G3.tex.tr); gl.uniform1i(U.u_tr, 2);
      gl.uniform3fv(U.u_R, V.R); gl.uniform3fv(U.u_C, V.C); gl.uniform3fv(U.u_Uv, V.U); gl.uniform2fv(U.u_offv, V.off);
      gl.uniform3f(U.u_dk, V.K, V.dk0, V.dk1 - V.dk0); gl.uniform1f(U.u_K, V.K); gl.uniform1f(U.u_LZ, LZ); gl.uniform1f(U.u_Ht, V.Ht);
      gl.uniform1f(U.u_zref, sliced ? S.level + HT / LH : NL);
    });
    pass('shblur', 'shB', G3.qsz, U => { src(U, 'shA'); gl.uniform3fv(U.u_col, sun.col); gl.uniform1f(U.u_k, LIT.shaftK); });
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return out;
}
function g3Sky(V) {
  const key = [V.Wt, V.Ht, S.tod, LIT.on, LIT.sun, S.seed].join('|');
  if (G3.skyKey === key) return;
  const sv = [S.bw, S.bh]; S.bw = V.Wt; S.bh = V.Ht;
  try { buildSky(); } finally { [S.bw, S.bh] = sv; skyDirty = true; }
  const gl = G3.gl; gl.bindTexture(gl.TEXTURE_2D, G3.tex.sky); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, SKYC.c);
  G3.skyKey = key;
}
// The 2D code finds its way between screen and world through a few functions (projIso,
// planeAt, screenAtDepthOf, the view rotation). Swapping them for this camera lets the cable
// drawing and the cable tools (grab, lay, tie, slack, girders, posts) run unchanged in 3D.
function withView(V, fn, drawing) {
  const sv = { projIso, toRotF, planeAt, screenAtDepthOf, rot: S.rot };
  const ray = (bx, by) => { const a = (bx - V.off[0]) / PXS, b = -(by - V.off[1]) / PXS; return [V.R[0] * a + V.U[0] * b, V.R[1] * a + V.U[1] * b, V.R[2] * a + V.U[2] * b]; };
  S.rot = 0;
  projIso = (px, py, pz) => g3Proj(V, px, py, pz);
  planeAt = (bx, by, h, eo) => { const P = ray(bx, by), t = (h * LZ - P[2]) / V.C[2]; return [P[0] + V.C[0] * t, P[1] + V.C[1] * t]; };
  screenAtDepthOf = (bx, by, p) => { const P = ray(bx, by), d = dot3(w3(p), V.C); return [P[0] + V.C[0] * d, P[1] + V.C[1] * d, (P[2] + V.C[2] * d) / LZ]; };
  // depthKey(x, y, z) = (r0 + r1)·1.5 + z: this makes it the view depth, in levels
  if (drawing) toRotF = (px, py) => [(V.C[0] * px + V.C[1] * py) * V.K / 1.5, 0];
  try { return fn(); } finally { projIso = sv.projIso; toRotF = sv.toRotF; planeAt = sv.planeAt; screenAtDepthOf = sv.screenAtDepthOf; S.rot = sv.rot; }
}
// ---------- overlays: what the 2D view draws per frame, seen through this camera ----------
// Small things (people, pods, steam, motes, lift cars, beacons) are the 2D drawing, each pixel
// tested against the scene depth. Outlines are real lines, so they stay one pixel at any angle.
const dkAt = (V, x, y, z) => (x * V.C[0] + y * V.C[1] + z * LZ * V.C[2]) * V.K;
function ovRect(g, X, Y, w, h, D, col) {   // a rect, pixel by pixel, where nothing nearer was drawn
  const fd = G3.fd, Wt = G3.V.Wt, Ht = G3.V.Ht;
  g.fillStyle = col;
  for (let y = Y; y < Y + h; y++) if (y >= 0 && y < Ht) for (let x = X; x < X + w; x++) if (x >= 0 && x < Wt && fd[y * Wt + x] <= D + 0.12) g.fillRect(x, y, 1, 1);
}
const ovSees = (X, Y, D, tol) => { const V = G3.V; return X >= 0 && Y >= 0 && X < V.Wt && Y < V.Ht && G3.fd[Y * V.Wt + X] <= D + tol; };
// a world segment as a one-pixel line; `test` hides the pixels behind the scene
function ovLine(g, V, a, b, col, dash, test) {
  const A = g3Proj(V, a[0], a[1], a[2]), B = g3Proj(V, b[0], b[1], b[2]), Da = dkAt(V, a[0], a[1], a[2]), Db = dkAt(V, b[0], b[1], b[2]);
  let x0 = Math.round(A[0]), y0 = Math.round(A[1]); const x1 = Math.round(B[0]), y1 = Math.round(B[1]);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, n = Math.max(dx, -dy) || 1;
  const fd = G3.fd, Wt = V.Wt, Ht = V.Ht; let err = dx + dy;
  g.fillStyle = col;
  for (let k = 0; k < 8000; k++) {
    if ((!dash || (k % dash[0]) < dash[1]) && x0 >= 0 && y0 >= 0 && x0 < Wt && y0 < Ht && (!test || fd[y0 * Wt + x0] <= Da + (Db - Da) * k / n + 0.12)) g.fillRect(x0, y0, 1, 1);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; }
  }
}
function ovQuad(g, V, x0, y0, x1, y1, h, col, dash) { const c = [[x0, y0, h], [x1, y0, h], [x1, y1, h], [x0, y1, h]]; for (let k = 0; k < 4; k++) ovLine(g, V, c[k], c[(k + 1) % 4], col, dash); return c.map(p => g3Proj(V, ...p)); }
function ovBox(g, V, x0, y0, z0, x1, y1, z1, col, dash) {
  ovQuad(g, V, x0, y0, x1, y1, z0, col, dash); ovQuad(g, V, x0, y0, x1, y1, z1, col, dash);
  for (const [a, b] of [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]) ovLine(g, V, [a, b, z0], [a, b, z1], col, dash);
}
function g3Overlay(g, V, levels) {
  const t = S.time, L = S.level, sliced = L < NL - 1, topZ = sliced ? L : NL - 1, floor = S.floor >= 0 ? S.floor : 0, night = S.tod === 'night';
  // the cut: real one-pixel outlines round the cut solids
  for (const lv of levels) if (lv.lines) for (const s of lv.lines) ovLine(g, V, [s[0], s[1], s[2]], [s[3], s[4], s[2]], CUTLINE, null, true);
  // dust in the well light (by day)
  const wb = wellBeam();
  if (wb && !night) for (const m of MOTES) {
    if (m.z > topZ + 1 || (Math.sin(t * 3 + m.ph * 5) + 1) <= 0.8) continue;
    const p = g3Proj(V, m.x, m.y, m.z);
    ovRect(g, Math.round(p[0]), Math.round(p[1]), 1, 1, dkAt(V, m.x, m.y, m.z), `rgba(255,240,205,${Math.min(1, 0.8 * Math.sqrt(wb[2])).toFixed(2)})`);
  }
  // pods in their tubes, people on the walks
  for (const pod of PODS) {
    if (pod.p.z > topZ || pod.p.z < floor) continue;
    const [px, py, pz, ax] = podPos(pod), p = g3Proj(V, px, py, pz), X = Math.round(p[0]), Y = Math.round(p[1]);
    if (!ovSees(X, Y, dkAt(V, px, py, pz), 0.8)) continue;
    const sv = [ax ? 0 : 1, ax ? 1 : 0, 0], ex = dot3(sv, V.R), ey = -dot3(sv, V.U);   // which way the tube runs on screen
    g.globalAlpha = pod.p.kind === 'tube' ? 0.85 : 1;
    g.drawImage(PODSPR[ex * ey > 0 ? 0 : 1][pod.col], X - 5, Y - 6);
    g.globalAlpha = 1;
  }
  for (const p of PEDS) {
    if (p.z > topZ || p.z < floor) continue;
    const px = lerp(p.x, p.tx, p.f) + p.ox, py = lerp(p.y, p.ty, p.f) + p.oy, q = g3Proj(V, px, py, p.z + 0.25), X = Math.round(q[0]), Y = Math.round(q[1]), D = dkAt(V, px, py, p.z + 0.25);
    ovRect(g, X, Y - 3, 1, 1, D, p.skin); ovRect(g, X, Y - 2, 1, 2, D, p.col);
  }
  // lift cars, on the cut level as in 2D
  if (sliced) for (const l of WORLD.lifts) {
    if (l.top < L) continue;
    const at = Math.abs(l.z - L) < 0.5, below = l.z < L - 0.5 && l.z > L - 4;
    if (!at && !below) continue;
    const h = L + HT / LH, q = g3Proj(V, l.x + 0.5, l.y + 0.5, h), X = Math.round(q[0]), Y = Math.round(q[1]);
    if (!ovSees(X, Y, dkAt(V, l.x + 0.5, l.y + 0.5, h), 0.3)) continue;
    if (at) { dia(g, X - 4, Y - 1, 8, '#d8b36a'); R_(g, X - 1, Y, 2, 1, '#8a6a36'); R_(g, X, Y - 3, 1, 3, '#3a3835'); }
    else { g.fillStyle = `rgba(216,179,106,${(0.5 - (L - l.z) * 0.1).toFixed(2)})`; g.fillRect(X - 2, Y + 1, 4, 1); }
  }
  // steam from vents and stacks
  for (const s of STEAM) {
    if (s.e.z > topZ || s.z > topZ + 1.4) continue;
    const q = g3Proj(V, s.x, s.y, s.z), k = s.life / s.max, sz = 1 + Math.floor(k * 3);
    ovRect(g, Math.round(q[0]) - (sz >> 1), Math.round(q[1]) - (sz >> 1), sz, sz, dkAt(V, s.x, s.y, s.z), `rgba(222,216,204,${(0.34 * (1 - k)).toFixed(3)})`);
  }
  // beacons on the masts
  if ((t % 1.6) < 0.2) for (const lv of levels) if (lv.blinks) for (let k = 0; k < lv.blinks.length; k += 5) {
    const b = lv.blinks, q = g3Proj(V, b[k], b[k + 1], b[k + 2]), X = Math.floor(q[0] + 0.5) + b[k + 3], Y = Math.floor(q[1] + 0.5) + b[k + 4];
    if (!ovSees(X, Y, dkAt(V, b[k], b[k + 1], b[k + 2]), 0.3)) continue;
    R_(g, X - 1, Y - 1, 3, 3, 'rgba(255,90,60,0.35)'); R_(g, X, Y, 1, 1, '#ff5a3c');
  }
  // ghost-above: dotted outlines of the three levels over the cut
  if (S.ghost && sliced) for (let z = L + 1; z <= Math.min(NL - 1, L + 3); z++) {
    const col = `rgba(206,226,228,${[0.62, 0.34, 0.18][z - L - 1]})`, segs = [];
    for (let y = 0; y < D; y++) for (let x = 0; x < W; x++) {
      const tt = cell(x, y, z); if (!tt) continue;
      const h = z + (TI[tt].slab ? 0.25 : tt === T.TREE ? 0.5 : 1), open = (dx, dy) => !inb(x + dx, y + dy, z) || !cell(x + dx, y + dy, z);
      if (open(0, -1)) segs.push(0, y, h, x); if (open(0, 1)) segs.push(0, y + 1, h, x);
      if (open(-1, 0)) segs.push(1, x, h, y); if (open(1, 0)) segs.push(1, x + 1, h, y);
    }
    for (const s of mergeSegs(segs)) ovLine(g, V, [s[0], s[1], s[2]], [s[3], s[4], s[2]], col, [2, 1]);
  }
  // the cut plane: amber outline and label, or the moving plane while the cut changes level
  if (Math.abs(S.cutAnim - L) > 0.001) {
    const c = ovQuad(g, V, 0, 0, W, D, S.cutAnim + HT / LH, 'rgba(232,168,60,0.9)');
    g.fillStyle = 'rgba(232,168,60,0.07)'; g.beginPath(); c.forEach((p, k) => k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath();
    g.save(); g.clip(); const y0 = Math.ceil(Math.min(...c.map(p => p[1]))), y1 = Math.max(...c.map(p => p[1])); for (let y = y0; y < y1; y += 2) g.fillRect(0, y, V.Wt, 1); g.restore();
  } else if (sliced) {
    const c = ovQuad(g, V, 0, 0, W, D, L + HT / LH, 'rgba(232,168,60,0.55)', [5, 3]);
    const left = c.reduce((m, p) => p[0] < m[0] ? p : m, c[0]), lab = 'CUT ' + lvCode(L) + ' ' + LEVELS[L].name, lw = ptextW(lab) + 4;
    plate(g, lab, clamp(Math.round(left[0]) - 8 - lw, Math.round(S.safeL / G3.zf) + 2, V.Wt - lw - 4), clamp(Math.round(left[1]) - 4, 4, V.Ht - 30), '#e8a83c', '#1b1305');
  }
  // builds in progress: each pending piece as a dashed box in its builder's colour; drones, pins, puffs
  for (const j of JOBS) {
    if (j.status !== 'proposed' && j.status !== 'building') continue;
    const next = j.status === 'building' ? j.pieces.find(p => p.state === 'queued') : null;
    for (const p of j.pieces) {
      if (!(p.state === 'queued' || p.state === 'flying' || (j.status === 'proposed' && p.state === 'blocked'))) continue;
      const a = p === next ? 0.55 + 0.35 * Math.sin(t * 8) : p.state === 'flying' ? 0.75 : (j.status === 'proposed' ? 0.5 : 0.32);
      const hh = p.t ? (CUTTABLE[p.t] && sliced && p.z === L ? HT / LH : TI[p.t].slab ? 0.25 : 1) : 0.05;
      ovBox(g, V, p.x, p.y, p.z, p.x + 1, p.y + 1, p.z + hh, rgba(p.state === 'blocked' || p.op === 'remove' ? '#e2573f' : OWN[j.owner].col, a), [2, 1]);
    }
  }
  for (const f of PUFFS) { const q = g3Proj(V, f.x, f.y, f.z); g.fillStyle = rgba(f.col, 0.8 * (1 - f.life / f.max)); g.fillRect(Math.round(q[0]), Math.round(q[1]), 1, 1); }
  drawPinsIso(g, t, sliced);
  drawDronesIso(g, t, sliced);
}
// the cables, girders, ties and birds: the 2D drawing code, seen through this camera
function g3Wires(V, levels) {
  const g = G3.wg; g.clearRect(0, 0, V.Wt, V.Ht);
  Object.assign(WDT, { fd: G3.fd, w: V.Wt, h: V.Ht, ox: 0, oy: 0, wd: null, on: true }); WDT.key = '';
  try {
    withView(V, () => {
      g3Overlay(g, V, levels);
      const floor = S.floor >= 0 ? S.floor : 0;
      wpxHold(g, () => { for (let z = floor; z < NL; z++) drawWiresLevel(g, z); });   // one pixel flush for all levels
      drawBirds(g);
      drawWireOverlay(g);
      drawHover3(g);
    }, true);
  } finally { WDT.on = false; WDT.fd = null; WDT.key = ''; }
}
// the world point under an art pixel, straight from the depth target (null for sky)
function g3PointAt(bx, by) {
  const V = G3.V, X = Math.floor(bx), Y = Math.floor(by);
  if (!V || !G3.fd || X < 0 || Y < 0 || X >= V.Wt || Y >= V.Ht) return null;
  const dk = G3.fd[Y * V.Wt + X]; if (dk < -1e8) return null;
  const a = (bx - V.off[0]) / PXS, b = -(by - V.off[1]) / PXS, d = dk / V.K - 0.02;   // a hair inside the surface
  const P = [V.R[0] * a + V.U[0] * b + V.C[0] * d, V.R[1] * a + V.U[1] * b + V.C[1] * d, V.R[2] * a + V.U[2] * b + V.C[2] * d];
  return [P[0], P[1], P[2] / LZ];
}
function g3Hover(bx, by, cssX, cssY) {
  const p = g3PointAt(bx, by), c = p && [Math.floor(p[0]), Math.floor(p[1]), Math.floor(p[2])];
  S.hover = c && inb(c[0], c[1], c[2]) ? { x: c[0], y: c[1], z: c[2], t: cell(c[0], c[1], c[2]), u: c[0], v: c[1] } : null;
  WIRES.ptr = [bx, by];
  withView(G3.V, () => updateTip(cssX, cssY));
}
function drawHover3(g) {
  const h = S.hover; if (!h || WIRES.hover || G3.drag) return;
  const o = h.t && occOf(h.t), top = h.z + (o ? o[1] * (S.level === h.z && S.level < NL - 1 && CUTTABLE[h.t] ? HT / LH : 1) : 0.05);
  const Q = (x, y, z) => projIso(x, y, z), E = [];
  for (const [a, b] of [[[0, 0], [1, 0]], [[1, 0], [1, 1]], [[1, 1], [0, 1]], [[0, 1], [0, 0]]]) E.push([[h.x + a[0], h.y + a[1], top], [h.x + b[0], h.y + b[1], top]]);
  for (const [a, b] of E) { const A = Q(...a), B = Q(...b); pline(g, A[0], A[1], B[0], B[1], '#f0b43c'); }
}
// a pointer event in art pixels of the current frame
function g3Buf(e) { const r = G3.cv.getBoundingClientRect(), V = G3.V; return [(e.clientX - r.left) / G3.zf + V.shift[0], (e.clientY - r.top) / G3.zf + V.shift[1]]; }

// ---------- camera moves ----------
const wrap360 = a => ((a % 360) + 360) % 360;
function g3Go(az, el, dur) { G3.anim = { az0: G3.az, el0: G3.el, az1: az, el1: el, t: 0, dur: REDUCED ? 0.001 : (dur || 0.4) }; }
function nearestIsoAz(az) { return 45 + Math.round((az - 45) / 90) * 90; }
function g3Animate(dt) {
  const a = G3.anim; if (!a) return;
  a.t = Math.min(1, a.t + dt / a.dur); const k = easeIO(a.t);
  G3.az = lerp(a.az0, a.az1, k); G3.el = lerp(a.el0, a.el1, k);
  if (a.t >= 1) { G3.az = wrap360(a.az1); G3.el = a.el1; G3.anim = null; }
}
function panArt(dx, dy) {   // move the camera by art pixels on screen
  const B = g3Basis(G3.az, G3.el);
  for (let k = 0; k < 3; k++) G3.T[k] -= (B.R[k] * dx - B.U[k] * dy) / PXS / (k === 2 ? LZ : 1);
}
function g3Input(cv) {
  for (const ev of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'wheel', 'dblclick', 'pointerleave']) cv.addEventListener(ev, e => e.stopPropagation());
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('pointerdown', e => {
    cv.setPointerCapture(e.pointerId); cv.focus && cv.focus();
    if (S.tool === 'cable' && UI.hue[WIRES.gauge] != null) WIRES.hue[WIRES.gauge] = UI.hue[WIRES.gauge];
    const [bx, by] = g3Buf(e);
    // cables first: grabbing, laying, tying, slack, girders and posts work as in 2D
    if (e.button === 0 && G3.V && withView(G3.V, () => wireDown(bx, by, e))) { G3.drag = { mode: 'wire' }; G3.anim = null; return; }
    if (e.button === 0 && S.mode === 'cut') UNDO.past.pop();
    G3.anim = null;
    G3.drag = { x: e.clientX, y: e.clientY, mode: e.button === 0 && !e.shiftKey ? 'orbit' : 'pan' };
    cv.style.cursor = 'grabbing';
  });
  cv.addEventListener('pointermove', e => {
    const d = G3.drag;
    if (d && d.mode === 'wire') { const [bx, by] = g3Buf(e); withView(G3.V, () => wireMove(bx, by)); return; }
    if (!d) {
      if (G3.V && !G3.anim) {
        const [bx, by] = g3Buf(e), r = cv.getBoundingClientRect();
        WIRES.hover = withView(G3.V, () => pickWire(bx, by, 4)); g3Hover(bx, by, e.clientX - r.left, e.clientY - r.top);
        cv.style.cursor = WIRES.hover ? 'pointer' : S.tool === 'inspect' ? 'grab' : 'crosshair';
      }
      return;
    }
    if (d.mode !== 'wire') { S.hover = null; updateTip(null); }
    const dx = e.clientX - d.x, dy = e.clientY - d.y; d.x = e.clientX; d.y = e.clientY;
    if (d.mode === 'orbit') { G3.az = wrap360(G3.az - dx * 0.35); G3.el = clamp(G3.el + dy * 0.3, 12, 89.5); }
    else panArt(dx / G3.zf, dy / G3.zf);
  });
  const end = e => {
    const d = G3.drag; G3.drag = null; cv.style.cursor = 'grab';
    if (!d) return;
    if (d.mode === 'wire') { const [bx, by] = g3Buf(e); withView(G3.V, () => wireUp(bx, by)); return; }
    if (d.mode === 'orbit' && G3.snap) g3Go(nearestIsoAz(G3.az), Math.abs(G3.el - 30) < 8 ? 30 : G3.el, 0.35);
  };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  cv.addEventListener('pointerleave', () => { if (!G3.drag) { WIRES.hover = null; S.hover = null; updateTip(null); } });
  cv.addEventListener('dblclick', () => { if (!WIRES.hover) g3Go(nearestIsoAz(G3.az), 30); });
  // as in 2D: two-finger scroll pans; pinch (ctrl + wheel) or a mouse wheel zooms, here smoothly
  cv.addEventListener('wheel', e => {
    e.preventDefault();
    if (!e.ctrlKey && e.deltaMode === 0 && !G3.wheelZoom) { panArt(-e.deltaX / G3.zf, -e.deltaY / G3.zf); return; }
    const r = cv.getBoundingClientRect(), mx = e.clientX - r.left - S.cssW / 2, my = e.clientY - r.top - S.cssH / 2;
    const z0 = G3.zf, z1 = clamp(z0 * Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : e.ctrlKey ? 0.01 : 0.0015)), 0.5, 8);
    panArt(-mx * (1 / z0 - 1 / z1), -my * (1 / z0 - 1 / z1)); G3.zf = z1;
  }, { passive: false });
}
function setG3(on) {
  if (on && !g3Init()) return;
  if (on === G3.on) return;
  G3.on = on;
  if (on) {
    // start exactly where the 2D view is
    const [u, v] = planeAt(S.bw / 2, S.bh / 2, S.level), [x, y] = fromRotF(u, v);
    G3.T = [x, y, S.level]; G3.az = ISO_AZ(S.rot); G3.el = 30; G3.zf = S.zoom; G3.anim = null; G3.last = 0;
  } else {
    // back to the nearest of the four views, centred on the same point
    const k = ((Math.round((45 - G3.az) / 90) % 4) + 4) % 4;
    if (k !== S.rot) { S.rot = k; markAllDirty(); }
    const z = clamp(Math.round(G3.zf), 1, 5); if (z !== S.zoom) setZoom(z);
    centerOn(G3.T[0], G3.T[1], G3.T[2]);
  }
  G3.cv.style.display = on ? 'block' : 'none'; G3.hud.style.display = on ? 'block' : 'none';
  $('view').style.visibility = on ? 'hidden' : 'visible';
  render();
}
function g3Hud() {
  const s = G3.stats;
  if (G3.peek) { G3.hud.textContent = 'PLANES (holding Z)  az ' + Math.round(wrap360(G3.az)) + '°  tilt ' + Math.round(G3.el) + '°'; return; }
  G3.hud.textContent = `3D VIEW  az ${Math.round(wrap360(G3.az))}°  tilt ${Math.round(G3.el)}°  zoom ${G3.zf.toFixed(2)}×  ${G3.filter}  ${G3.texel ? 'face texels' : 'projected'}${G3.cons ? '  conservative' : ''}${G3.splat ? (G3.splat === 1 ? '  planes + points' : '  points ' + splatSizes(G3.V).join('/')) : ''}${G3.snap ? '  snap' : ''}\n` +
    `drag orbit · drag a cable to move it · right-drag/scroll pan · pinch zoom · Q/E turn · W/S tilt · 9 top · 0 iso · N filter · M texels · K thin lines · U splats · hold Z planes · O snap · 3 2D\n` +
    `gpu ${s.gpu}ms · wires ${s.wires}ms · build ${s.build || '-'}`;
}
window.addEventListener('keydown', e => {
  if (e.target.closest && e.target.closest('input, textarea, select')) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (!BOOT.done) return;
  if (k === '3') { setG3(!G3.on); e.preventDefault(); e.stopImmediatePropagation(); return; }
  if (!G3.on) return;
  const tgt = G3.anim ? { az: G3.anim.az1, el: G3.anim.el1 } : { az: G3.az, el: G3.el };
  let used = true;
  if (k === 'q') g3Go(nearestIsoAz(tgt.az) - 90, tgt.el);
  else if (k === 'e') g3Go(nearestIsoAz(tgt.az) + 90, tgt.el);
  else if (k === 'w') g3Go(tgt.az, clamp(tgt.el + 10, 12, 89.5), 0.2);
  else if (k === 's') g3Go(tgt.az, clamp(tgt.el - 10, 12, 89.5), 0.2);
  else if (k === '9') g3Go(tgt.az, tgt.el > 80 ? 30 : 89.5);
  else if (k === '0') g3Go(nearestIsoAz(tgt.az), 30);
  else if (k === 'n') G3.filter = G3.filter === 'sharp' ? 'nearest' : 'sharp';
  else if (k === 'o') G3.snap = !G3.snap;
  else if (k === 'm') G3.texel = 1 - G3.texel;
  else if (k === 'k') G3.cons = !G3.cons;
  else if (k === 'u') G3.splat = (G3.splat + 1) % 3;
  else if (k === 'z') { if (!G3.peek) { G3.peek = true; render(); } }
  else used = false;
  if (used) { e.preventDefault(); e.stopImmediatePropagation(); }
}, true);

// ---------- hooks into the 2D game ----------
{
  const r2 = render, md = markDirty, mad = markAllDirty;
  render = function () { if (G3.on && !BOOT.hold) { try { g3Render(); } catch (e) { if (!g3Render.warned) { g3Render.warned = true; console.error(e); } } AGENT.screen = null; updateAgentDom(); } else r2(); };
  markDirty = function (z) { md(z); G3.dirty.add(z); if (z > 0) G3.dirty.add(z - 1); if (z < NL - 1) G3.dirty.add(z + 1); };
  markAllDirty = function (lazy) { mad(lazy); for (let z = 0; z < NL; z++) G3.dirty.add(z); for (const c of G3.cuts.values()) freeLevel(c); G3.cuts.clear(); };
}
// atlases are rebuilt when the look changes (time of day)
const g3Reset = () => { if (!G3.gl) return; G3.A = mkAtlas(4096); G3.EA = mkAtlas(2048); for (let z = 0; z < NL; z++) G3.dirty.add(z); for (const c of G3.cuts.values()) freeLevel(c); G3.cuts.clear(); };
{
  const rs = setTod; setTod = function (n) { rs(n); g3Reset(); };
}
window.addEventListener('keyup', e => { if (e.key.toLowerCase() === 'z' && G3.peek) { G3.peek = false; if (G3.on) render(); } }, true);
window.addEventListener('blur', () => { G3.peek = false; });
window.G3 = G3; window.setG3 = setG3; window.g3Go = g3Go;
