// ==========================================================================
// The backdrop: the city is the top of a pedestal, and an endless city lies
// far below it. All of it is real geometry, drawn through each view's own
// camera, so it turns, tilts and pans exactly with the city. This file draws
// it for the 2D view; the 3D study (spall-3d) hands it its own camera.
//
// Both views are orthographic. In pure ortho every ray is parallel and points
// down at the tilt, so an endless floor fills the whole frame: no horizon, no
// sky, and nothing shrinks with distance. So everything beyond the city's far
// side gets a gentle perspective: an eye E cells in front of that plane. The
// city and the near pedestal stay exactly ortho; what lies beyond shrinks
// toward the view's centre and slides less when the view pans (parallax).
//
// The air is one model for geometry and sky alike: a colour for each
// direction seen from that eye, and fog that thins with height. Far geometry
// fogs to exactly the sky behind it, so the horizon has no seam.
// ==========================================================================
const UC = { gl: null, cv: null, P: null, BG: null, vao: null, n: 0, built: '', key: '', ov: {}, seed: 7 };
const BD = { scene: 'under' };   // 'under', or 'off' for the game's own flat sky
const UC_T = 400, UC_AV = 10;    // the avenue grid: tiles and avenue width (cells)
const UC_LZ = Math.sqrt(1.5), UC_PXS = 8 * Math.SQRT2;   // one level in cell widths; art px per cell at the default view
const ucW3 = p => [p[0], p[1], p[2] * UC_LZ], ucDot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// ---------- the world: boxes of boxes ----------
// one instance: x0 y0 z0 x1 y1 z1 (cells, levels), kind + taper, seed, tint, chance a window is lit
// kinds: 0 pedestal, 1 podium, 2 block, 3 tower, 4 monolith, 5 mast, 6 floor tile, 7 viaduct
// taper (0..0.9) pulls the top face in toward its centre: battered walls, pyramid caps
function ucGen() {
  const rnd = mulberry32(UC.seed * 7919 + 17), I = [];
  const put = (x0, y0, z0, x1, y1, z1, k, lit, tp) => I.push(x0, y0, z0, x1, y1, z1, k + (tp || 0), rnd(), rnd() * 2 - 1, lit == null ? 0.2 : lit);
  // big boxes are cut into pieces: the perspective bends at the city's far plane, and only whole pieces bend right
  const putS = (x0, y0, z0, x1, y1, z1, k, lit, sx, sz) => {
    const nx = Math.max(1, Math.ceil((x1 - x0) / sx)), ny = Math.max(1, Math.ceil((y1 - y0) / sx)), nz = Math.max(1, Math.ceil((z1 - z0) / sz));
    for (let c = 0; c < nz; c++) for (let b = 0; b < ny; b++) for (let a = 0; a < nx; a++)
      put(x0 + (x1 - x0) * a / nx, y0 + (y1 - y0) * b / ny, z0 + (z1 - z0) * c / nz, x0 + (x1 - x0) * (a + 1) / nx, y0 + (y1 - y0) * (b + 1) / ny, z0 + (z1 - z0) * (c + 1) / nz, k, lit);
  };
  const Zf = ucPar('Zf');
  ucPedestal(put, putS, rnd, Zf);
  ucUnder(put, putS, rnd, Zf);
  // nearest first, for early depth rejection
  const n = I.length / 10, ord = [...Array(n).keys()], dist = i => Math.hypot((I[i * 10] + I[i * 10 + 3]) / 2 - W / 2, (I[i * 10 + 1] + I[i * 10 + 4]) / 2 - D / 2);
  ord.sort((a, b) => dist(a) - dist(b));
  const out = new Float32Array(I.length);
  ord.forEach((s, d) => out.set(I.slice(s * 10, s * 10 + 10), d * 10));
  return out;
}

// the city's footprint carries on down: a core a little inside the city's edge, with bays standing out from it by
// different amounts, some stopping partway down, and a few slots where the core shows. Near featureless.
function ucPedestal(put, putS, rnd, Zf) {
  const fl = -Zf, ci = 7;
  const col = (x0, y0, x1, y1, z1, z0) => {
    for (let z = z1; z > z0;) { const h = z > -40 ? 10 : z > -240 ? 30 : 90, zb = Math.max(z0, z - h); putS(x0, y0, zb, x1, y1, z, 0, 0.02, 24, h); z = zb; }
  };
  col(ci, ci, W - ci, D - ci, 0, fl);
  for (let side = 0; side < 4; side++) for (let p = 0; p < W;) {
    const q = Math.min(W, p + 5 + Math.floor(rnd() * 14));
    if (rnd() < 0.18) { p = Math.min(W, p + 2 + Math.floor(rnd() * 2)); continue; }   // a slot
    const e = [1.5, 2.5, 3.5, 4.5][Math.floor(rnd() * 4)], z0 = rnd() < 0.5 ? fl : -(20 + rnd() * Zf * 0.55), z1 = rnd() < 0.8 ? 0 : -(1 + Math.floor(rnd() * 4));
    if (side === 0) col(e, p, ci, q, z1, z0); else if (side === 1) col(W - ci, p, W - e, q, z1, z0);
    else if (side === 2) col(p, e, q, ci, z1, z0); else col(p, D - ci, q, D - e, z1, z0);
    p = q;
  }
  // where it meets the undercity: a battered footing that spreads into the streets
  const s = 22; put(-s, -s, fl, W + s, D + s, fl + 45, 0, 0.02, s / (W / 2 + s) * 1.05);
}

// ---------- the undercity ----------
// Districts come from a few slow fields: how built up, how tall, and what sort of fabric. Each tile between the
// avenues is split again and again into smaller rectangles, streets narrowing at each step; each step may lift its
// ground on a podium, so neighbours share a level. Leaves become carpets of low roofs, courtyards, yards of sheds,
// slabs, or towers. Monoliths, landmarks and far giants stand up out of it.
function ucUnder(put, putS, rnd, Zf) {
  const fl = -Zf, hk = Zf / 350, cx = W / 2, cy = D / 2;
  const hsh = (a, b) => { let h = Math.imul(a * 374761393 + b * 668265263 + UC.seed * 982451653, 1274126177); h ^= h >>> 13; h = Math.imul(h, 1103515245); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const vn = (x, y) => { const X = Math.floor(x), Y = Math.floor(y), fx = x - X, fy = y - Y, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = hsh(X, Y), b = hsh(X + 1, Y), c = hsh(X, Y + 1), d = hsh(X + 1, Y + 1); return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy; };
  const fbm = (x, y) => vn(x, y) * 0.6 + vn(x * 2.3 + 5, y * 2.3) * 0.3 + vn(x * 5.1 + 9, y * 5.1) * 0.1;
  const dens = (x, y) => fbm(x / 1500 + 3, y / 1500);                     // how built up
  const tall = (x, y) => Math.pow(fbm(x / 800 + 11, y / 800 - 4), 2.6);   // clusters of towers
  const sort = (x, y) => fbm(x / 1100 - 7, y / 1100 + 2);                 // low: carpets and courts; high: slabs and yards
  // the fabric never comes near the city's height, and stays low round the pedestal
  const cap = r => Math.min(-Zf * 0.1, fl + Zf * (0.12 + 0.5 * Math.min(1, r / 1400) ** 2));
  const mono = [], inMono = (x0, y0, x1, y1) => mono.some(m => x0 < m[2] && x1 > m[0] && y0 < m[3] && y1 > m[1]);

  // a megastructure, in one of a few forms: tiered (setbacks, ledges, fins), battered (one sloped mass), stepped (a ziggurat)
  const monolith = (mx, my, w, d, top, sc, form) => {
    let x0 = mx - w / 2, y0 = my - d / 2, x1 = mx + w / 2, y1 = my + d / 2, z = fl;
    mono.push([x0 - 20 * sc, y0 - 20 * sc, x1 + 20 * sc, y1 + 20 * sc]);
    if (form === 'stepped') {
      const n = 5 + Math.floor(rnd() * 3), st = (top - fl) / n;
      for (let t = 0; t < n; t++) {
        putS(x0, y0, z, x1, y1, z + st, 4, 0.1, 240, 90);
        put(x0 - 2 * sc, y0 - 2 * sc, z + st - 1.5 * sc, x1 + 2 * sc, y1 + 2 * sc, z + st, 4, 0);
        z += st; const ix = (x1 - x0) * 0.09, iy = (y1 - y0) * 0.09; x0 += ix; x1 -= ix; y0 += iy; y1 -= iy;
      }
    } else if (form === 'battered') {
      const h = (top - fl) * 0.8, tp = 0.22;
      for (let k = 0, n = Math.ceil(h / 90); k < n; k++) {   // in bands, each a little narrower: a slope that bends right in perspective
        const a = k / n, b = (k + 1) / n, ia = tp * a, ib = tp * b;
        put(x0 + (x1 - x0) / 2 * ia, y0 + (y1 - y0) / 2 * ia, z + h * a, x1 - (x1 - x0) / 2 * ia, y1 - (y1 - y0) / 2 * ia, z + h * b, 4, 0.08, (ib - ia) / (1 - ia));
      }
      z += h; const i = tp * 0.5; x0 += (x1 - x0) * i * 1.2; x1 -= (x1 - x0) * i; y0 += (y1 - y0) * i * 1.2; y1 -= (y1 - y0) * i;
      putS(x0, y0, z, x1, y1, top, 4, 0.1, 240, 90); z = top;
    } else {
      const sk = 10 * sc, hs = Math.min(60 * sc, (top - fl) * 0.12), tiersN = 2 + Math.floor(rnd() * 3);
      put(x0 - sk, y0 - sk, fl, x1 + sk, y1 + sk, fl + hs, 4, 0.03, sk / (Math.min(w, d) / 2 + sk) * 1.02);
      for (let t = 0; t < tiersN; t++) {
        const z1 = t === tiersN - 1 ? top : z + (top - z) * (0.4 + rnd() * 0.25);
        putS(x0, y0, z, x1, y1, z1, 4, 0.08, 240, 90);
        const fw = 3 * sc, fd = 3 * sc, zf = z1 - (z1 - z) * rnd() * 0.15, nx = Math.floor((x1 - x0) / (26 * sc)), ny = Math.floor((y1 - y0) / (26 * sc));
        for (let i = 1; i < nx; i++) { const x = x0 + (x1 - x0) * i / nx; putS(x - fw / 2, y0 - fd, z, x + fw / 2, y0, zf, 4, 0, 99, 90); putS(x - fw / 2, y1, z, x + fw / 2, y1 + fd, zf, 4, 0, 99, 90); }
        for (let i = 1; i < ny; i++) { const y = y0 + (y1 - y0) * i / ny; putS(x0 - fd, y - fw / 2, z, x0, y + fw / 2, zf, 4, 0, 99, 90); putS(x1, y - fw / 2, z, x1 + fd, y + fw / 2, zf, 4, 0, 99, 90); }
        for (let a = 0; a < 3; a++) {   // lesser blocks clinging to the sides
          const side = Math.floor(rnd() * 4), L = (20 + rnd() * 50) * sc, dep = (8 + rnd() * 16) * sc, zz = z + (z1 - z) * rnd() * 0.6, hh = (20 + rnd() * 60) * sc, u = rnd();
          if (side === 0) put(x0 - dep, y0 + (y1 - y0 - L) * u, zz, x0, y0 + (y1 - y0 - L) * u + L, zz + hh, 2, 0.15);
          else if (side === 1) put(x1, y0 + (y1 - y0 - L) * u, zz, x1 + dep, y0 + (y1 - y0 - L) * u + L, zz + hh, 2, 0.15);
          else if (side === 2) put(x0 + (x1 - x0 - L) * u, y0 - dep, zz, x0 + (x1 - x0 - L) * u + L, y0, zz + hh, 2, 0.15);
          else put(x0 + (x1 - x0 - L) * u, y1, zz, x0 + (x1 - x0 - L) * u + L, y1 + dep, zz + hh, 2, 0.15);
        }
        if (t < tiersN - 1) put(x0 - 4 * sc, y0 - 4 * sc, z1 - 1.5 * sc, x1 + 4 * sc, y1 + 4 * sc, z1, 4, 0);
        z = z1;
        const ix = (x1 - x0) * (0.12 + rnd() * 0.16), iy = (y1 - y0) * (0.12 + rnd() * 0.16), sh = rnd() - 0.5;
        x0 += ix * (1 + sh); x1 -= ix * (1 - sh); y0 += iy * (1 - sh); y1 -= iy * (1 + sh);
      }
    }
    put(x0 + 2 * sc, y0 + 2 * sc, z, x1 - 2 * sc, y1 - 2 * sc, z + 8 * sc, 4, 0.05, 0.35);   // a crown
    for (let m = 0; m < 3; m++) { const ax = x0 + (x1 - x0) * (0.2 + rnd() * 0.6), ay = y0 + (y1 - y0) * (0.2 + rnd() * 0.6); put(ax, ay, z, ax + 2 * sc, ay + 2 * sc, z + (14 + rnd() * 40) * sc, 5, 0); }
  };
  const forms = ['tiered', 'tiered', 'battered', 'stepped'], at = (r, th) => [cx + Math.cos(th) * r, cy + Math.sin(th) * r];
  // near monoliths: never tall enough to reach up in front of the city, at any turn or tilt
  for (let i = 0; i < 10; i++) {
    const r = 1400 + rnd() * 2600, [mx, my] = at(r, (i + rnd() * 0.6) / 10 * Math.PI * 2);
    monolith(mx, my, 110 + rnd() * 170, 90 + rnd() * 150, -30 + rnd() * (Math.min(260, 0.17 * r) + 30), 1, forms[Math.floor(rnd() * 4)]);
  }
  // landmarks: lesser large things standing up out of the fabric
  for (let i = 0; i < 28; i++) {
    const r = 500 + rnd() * 3000, [mx, my] = at(r, rnd() * Math.PI * 2), w = 30 + rnd() * 45, d = w * (0.6 + rnd() * 0.8);
    if (inMono(mx - w, my - d, mx + w, my + d)) continue;
    monolith(mx, my, w, d, Math.min(cap(r) + 30 + rnd() * 110 * hk, 0.17 * r - 20), 0.4, forms[Math.floor(rnd() * 4)]);
  }
  // giants far out: their tops rise clear of the haze and break the horizon
  for (let i = 0; i < 9; i++) {
    const r = 6000 + rnd() * 9000, [mx, my] = at(r, (i + 0.2 + rnd() * 0.6) / 9 * Math.PI * 2);
    monolith(mx, my, 320 + rnd() * 380, 280 + rnd() * 360, Math.min(0.17 * r, 900 + rnd() * 1300), 3, rnd() < 0.7 ? 'tiered' : 'battered');
  }

  // a leaf: one building, or a court, or a yard
  const leaf = (x0, y0, x1, y1, zb, r, so, tl, dn) => {
    const w = x1 - x0, d = y1 - y0, ms = Math.min(w, d), top = cap(r), lim = z => Math.min(top, z);
    if (zb >= top - 0.5 || ms < 1.5) return;
    if (so > 0.68 && r < 2600 && rnd() < 0.4) {
      // a yard: a low deck with rows on it (sheds, tracks, stacks)
      put(x0, y0, zb, x1, y1, lim(zb + 0.8), 1, 0.04);
      const alongX = w > d, L = alongX ? w : d, Wd = alongX ? d : w, pitch = 2.5 + rnd() * 2.5, n = Math.min(16, Math.floor(Wd / pitch));
      for (let i = 0; i < n; i++) {
        if (rnd() < 0.2) continue;
        const v0 = (alongX ? y0 : x0) + i * pitch + 0.5, v1 = v0 + pitch * (0.45 + rnd() * 0.3);
        for (let s = 0, segs = 1 + Math.floor(rnd() * 3); s < segs; s++) {
          const u0 = (alongX ? x0 : y0) + L * s / segs + 0.5, u1 = (alongX ? x0 : y0) + L * (s + 1) / segs - 0.5 - rnd() * L * 0.15 / segs, h = lim(zb + 0.8 + 0.4 + rnd() * 1.6);
          if (alongX) put(u0, v0, zb + 0.8, u1, v1, h, 2, 0.1); else put(v0, u0, zb + 0.8, v1, u1, h, 2, 0.1);
        }
      }
      return;
    }
    const tower = ms > 5 && rnd() < tl * 2.2;
    let h;
    if (tower) h = Math.min(hk * (14 + Math.pow(rnd(), 1.4) * 150 * Math.min(1, tl * 2.5)), ms * 2.4);
    else if (so < 0.36) h = Math.min(hk * (0.8 + rnd() * 3 + dn * 3 * rnd() + (rnd() < 0.15 ? 4 + rnd() * 8 : 0)), ms * 0.8);   // carpet: low and varied, a few standing up
    else if (so > 0.64) h = Math.min(hk * (4 + rnd() * 16 * dn), ms * 0.9);                // slabs
    else h = Math.min(hk * (1.5 + rnd() * 11 * (0.4 + dn)), ms * 1.2);
    let z1 = lim(zb + h);
    if (z1 <= zb + 0.4) return;
    const kind = tower ? 3 : 2, lit = tower ? 0.42 : 0.32;
    if (!tower && ms > 22) {
      // too broad for one building: a row of slabs across it, each its own height
      const alongX = w > d, Wd = alongX ? d : w;
      for (let v = alongX ? y0 : x0, e = v + Wd; v < e - 3;) {
        const bw = Math.min(e - v, 5 + rnd() * 6), hz = lim(zb + h * (0.5 + rnd() * 0.8));
        if (rnd() > 0.1 && hz > zb + 0.4) { if (alongX) put(x0, v, zb, x1, v + bw, hz, 2, lit); else put(v, y0, zb, v + bw, y1, hz, 2, lit); }
        v += bw + 2 + rnd() * 2;
      }
      return;
    }
    if (!tower && so < 0.4 && ms > 9 && rnd() < 0.35) {
      // a court: buildings round a hollow
      const t = ms * (0.22 + rnd() * 0.12);
      put(x0, y0, zb, x1, y0 + t, z1, 2, lit); put(x0, y1 - t, zb, x1, y1, z1, 2, lit);
      put(x0, y0 + t, zb, x0 + t, y1 - t, lim(z1 + (rnd() - 0.5) * 2), 2, lit); put(x1 - t, y0 + t, zb, x1, y1 - t, lim(z1 + (rnd() - 0.5) * 2), 2, lit);
      return;
    }
    if (tower && z1 - zb > 16 && rnd() < 0.75) {
      // setbacks, each tier a little off-centre
      let a0 = x0, b0 = y0, a1 = x1, b1 = y1, z = zb;
      for (let t = 0, n = 2 + Math.floor(rnd() * 2); t < n; t++) {
        const zt = t === n - 1 ? z1 : z + (z1 - z) * (0.45 + rnd() * 0.3);
        put(a0, b0, z, a1, b1, zt, 3, lit); z = zt;
        const ix = (a1 - a0) * (0.1 + rnd() * 0.18), iy = (b1 - b0) * (0.1 + rnd() * 0.18), sh = rnd() - 0.5;
        a0 += ix * (1 + sh); a1 -= ix * (1 - sh); b0 += iy * (1 - sh); b1 -= iy * (1 + sh);
      }
      x0 = a0; y0 = b0; x1 = a1; y1 = b1;
    } else put(x0, y0, zb, x1, y1, z1, kind, lit);
    const cr = rnd(), cw = x1 - x0, cd = y1 - y0;
    if (tower && cr < 0.3) put(x0, y0, z1, x1, y1, z1 + 2 + Math.min(cw, cd) * 0.4, 3, 0.2, 0.75);   // a pyramid cap
    else if (tower && cr < 0.55) { const mx = x0 + cw / 2 - 0.5, my = y0 + cd / 2 - 0.5; put(mx, my, z1, mx + 1, my + 1, z1 + 6 + rnd() * 14, 5, 0); }
    else if (r < 1300 && Math.min(cw, cd) > 4) for (let k = 0, nk = 1 + Math.floor(rnd() * 3); k < nk; k++) {   // roof plant
      const bw = 1.2 + rnd() * Math.min(3, cw * 0.3), bd = 1.2 + rnd() * Math.min(3, cd * 0.3), bx = x0 + rnd() * (cw - bw), by = y0 + rnd() * (cd - bd);
      put(bx, by, z1, bx + bw, by + bd, z1 + 0.5 + rnd() * 1.5, 2, 0.05);
    }
  };
  // a node: lift its ground on a podium maybe, then split it or build on it
  const node = (x0, y0, x1, y1, zb, dep) => {
    const w = x1 - x0, d = y1 - y0, mx = (x0 + x1) / 2, my = (y0 + y1) / 2, r = Math.hypot(mx - cx, my - cy);
    const nearPed = Math.abs(mx - cx) < 72 + w / 2 && Math.abs(my - cy) < 72 + d / 2;   // the pedestal's own canyon
    if ((nearPed || inMono(x0, y0, x1, y1)) && Math.max(w, d) < 40) return;
    const so = sort(mx, my), tl = tall(mx, my), dn = dens(mx, my), top = cap(r);
    const minL = (r < 1300 ? 9 : r < 2600 ? 22 : r < 5000 ? 70 : 220) * (tl > 0.3 ? 1.8 : 1) * (so > 0.64 ? 1.5 : 1);
    if (!nearPed && !inMono(x0, y0, x1, y1) && rnd() < (dep === 0 ? 0.65 : so < 0.36 ? 0.22 : 0.4)) {
      const ph = Math.min((top - zb) * 0.3, (dep === 0 ? 2 + rnd() * 18 : 1 + rnd() * (dep < 2 ? 9 : 3)) * hk * (0.4 + dn));
      if (ph > 0.6) { put(x0, y0, zb, x1, y1, zb + ph, 1, 0.15); zb += ph; }
    }
    const leafy = dep >= 2 && Math.max(w, d) < minL * 4 && rnd() < (so < 0.36 ? 0.04 : so > 0.64 ? 0.4 : 0.14);
    if (Math.max(w, d) < minL * 1.5 || leafy || r > 5000 && dep >= 1) {
      if (nearPed || inMono(x0, y0, x1, y1)) return;
      if (r > 5000) { put(x0, y0, zb, x1, y1, Math.min(top, zb + hk * (1 + rnd() * 14 * dn)), 1, 0.25); return; }   // far off: one mass per block
      return leaf(x0, y0, x1, y1, zb, r, so, tl, dn);
    }
    const g = Math.max(1, 6 - dep * 1.4), alongX = (w > d) !== (Math.max(w, d) / Math.min(w, d) < 1.4 && rnd() < 0.3);
    const L = alongX ? w : d, cuts = rnd() < 0.2 ? [0.3 + rnd() * 0.1, 0.62 + rnd() * 0.1] : [0.3 + rnd() * 0.4];
    let a = 0;
    for (const c of [...cuts, 1]) {
      const s0 = (alongX ? x0 : y0) + L * a + (a > 0 ? g / 2 : 0), s1 = (alongX ? x0 : y0) + L * c - (c < 1 ? g / 2 : 0);
      if (alongX) node(s0, y0, s1, y1, zb, dep + 1); else node(x0, s0, x1, s1, zb, dep + 1);
      a = c;
    }
  };
  const ox = cx - UC_T / 2, oy = cy - UC_T / 2;
  for (let iy = -24; iy <= 24; iy++) for (let ix = -24; ix <= 24; ix++) {
    const X = ox + ix * UC_T, Y = oy + iy * UC_T;
    if (Math.hypot(X + UC_T / 2 - cx, Y + UC_T / 2 - cy) > 9400) continue;
    node(X + UC_AV / 2, Y + UC_AV / 2, X + UC_T - UC_AV / 2, Y + UC_T - UC_AV / 2, fl, 0);
  }
  // viaducts down some avenues, a little above the street, on piers
  for (const ax of [0, 1]) for (let i = -7; i <= 7; i++) {
    if (rnd() > 0.45) continue;
    const c = (ax ? ox : oy) + i * UC_T, zv = fl + 8 + Math.floor(rnd() * 3) * 7, seg = 60;
    for (let s = -2800; s < 2800; s += seg) {
      const x0 = ax ? c - 2 : s, x1 = ax ? c + 2 : s + seg, y0 = ax ? s : c - 2, y1 = ax ? s + seg : c + 2;
      if (Math.abs((x0 + x1) / 2 - cx) < 90 && Math.abs((y0 + y1) / 2 - cy) < 90 || inMono(x0, y0, x1, y1)) continue;
      put(x0, y0, zv - 1.5, x1, y1, zv, 7, 0.5);
      const px = ax ? c : s, py = ax ? s : c; put(px - 1, py - 1, fl, px + 1, py + 1, zv - 1.5, 7, 0);
    }
  }
  // the floor, in tiles (finer near the pedestal)
  for (let y = -6000; y < 6000; y += 300) for (let x = -6000; x < 6000; x += 300) put(x, y, fl, x + 300, y + 300, fl, 6, 0);
  for (let y = -30000; y < 30000; y += 3000) for (let x = -30000; x < 30000; x += 3000) if (Math.abs(x + 1500) > 6000 || Math.abs(y + 1500) > 6000) put(x, y, fl, x + 3000, y + 3000, fl, 6, 0);
}

// ---------- shaders ----------
const UC_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 a_p; layout(location=1) in vec3 a_n;
layout(location=2) in vec3 a_b0; layout(location=3) in vec3 a_b1; layout(location=4) in vec4 a_m;
uniform vec3 u_R, u_U, u_C; uniform vec2 u_off, u_size, u_c; uniform float u_LZ, u_PXS, u_dFar, u_E, u_dNear, u_span;
out vec3 v_P; out float v_D; flat out vec3 v_N; flat out vec4 v_m; flat out vec3 v_b0; flat out vec3 v_b1;
void main() {
  float kf = floor(a_m.x + 1e-3), tp = a_m.x - kf;
  vec3 P = mix(a_b0, a_b1, a_p), N = a_n, b0 = a_b0, b1 = a_b1;
  vec2 ctr = (a_b0.xy + a_b1.xy) * 0.5, hw = (a_b1.xy - a_b0.xy) * 0.5;
  if (tp > 0.0) {
    if (a_p.z > 0.5) P.xy = ctr + (P.xy - ctr) * (1.0 - tp);
    if (abs(a_n.z) < 0.5) { float h = (a_b1.z - a_b0.z) * u_LZ; N = normalize(vec3(a_n.xy * h, abs(a_n.x) * hw.x * tp + abs(a_n.y) * hw.y * tp)); }
    else { b0.xy = ctr - hw * (1.0 - tp); b1.xy = ctr + hw * (1.0 - tp); }
  }
  vec3 Wp = vec3(P.xy, P.z * u_LZ);
  vec2 o = vec2(dot(Wp, u_R) * u_PXS + u_off.x, -dot(Wp, u_U) * u_PXS + u_off.y);
  float d = dot(Wp, u_C), D = u_dFar - d, w = 1.0 + max(D, 0.0) / u_E;
  vec2 nd = o / u_size * 2.0 - 1.0, nc = u_c / u_size * 2.0 - 1.0; nd.y = -nd.y; nc.y = -nc.y;
  float z = clamp((u_dNear - d) / u_span, 0.0, 1.0) * 2.0 - 1.0;
  gl_Position = vec4(nc * w + (nd - nc), z * w, w);
  v_P = P; v_D = D; v_N = N; v_m = vec4(kf, a_m.yzw); v_b0 = b0; v_b1 = b1;
}`;
const UC_COMMON = `
const int BY[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
float bay() { ivec2 q = ivec2(gl_FragCoord.xy) & 3; return (float(BY[q.x + q.y * 4]) + 0.5) / 16.0; }
float qd(float v, float n, float b) { return clamp(floor(v * n + b) / n, 0.0, 1.0); }   // n flat steps, dithered between
float h21(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float vn2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
uniform vec3 u_low, u_sky[6], u_glow, u_smog, u_sunv, u_eye; uniform float u_time;
// the air's colour along a direction away from the eye: down into the depths, the horizon, the sky
vec3 airCol(vec3 d) {
  float t = d.z / max(length(d.xy), 1e-4), b = bay(), e = atan(d.z, length(d.xy));
  float s = (1.0 - pow(clamp(e / 1.5708, 0.0, 1.0), 0.45)) * 5.0;   // the sky's stops: zenith 0 .. horizon 5
  int k = int(min(4.0, floor(s)));
  vec3 c = t < 0.0 ? mix(u_sky[5], u_low, qd(smoothstep(0.0, -0.45, t), 8.0, b)) : mix(u_sky[k], u_sky[k + 1], qd(s - float(k), 4.0, b));
  float g = max(dot(normalize(d), u_sunv), 0.0);
  return c + u_glow * qd(pow(g, 5.0) * smoothstep(-0.3, 0.02, t) * (1.0 - smoothstep(0.1, 0.6, t)), 8.0, b);
}
// some lights twinkle: a slow, uneven flicker
float twinkle(vec2 id) { float h = h21(id * 0.37 + 11.0); return h < 0.85 ? 1.0 : 0.6 + 0.4 * step(0.3, fract(u_time * (0.3 + h * 1.4) + h * 7.0)); }
// how many lights a place has after dark: more along the avenue grid, and each tile its own share, so squinting finds the grid
float lightK(vec2 p) {
  vec2 g = p - vec2(${W / 2 - UC_T / 2}.0), m = mod(g, ${UC_T}.0);
  float av = min(min(m.x, ${UC_T}.0 - m.x), min(m.y, ${UC_T}.0 - m.y));
  return (0.45 + 0.9 * h21(floor(g / ${UC_T}.0) + 7.0)) * (1.0 + 0.9 * (1.0 - smoothstep(0.0, 70.0, av)));
}
`;
const UC_FS = `#version 300 es
precision highp float;
in vec3 v_P; in float v_D; flat in vec3 v_N; flat in vec4 v_m; flat in vec3 v_b0; flat in vec3 v_b1;
uniform vec3 u_wall, u_roof, u_ped, u_amb, u_sunc, u_sun, u_glass, u_lamp, u_Cv; uniform float u_night, u_E, u_Zf, u_dark;
uniform vec2 u_fog; uniform float u_zs, u_Ts, u_Fl;
out vec4 o;
${UC_COMMON}
// the mean of exp(-z/H) along a straight run of heights from za to zb
float avgExp(float za, float zb, float H) { float x = (zb - za) / H; float g = abs(x) < 1e-3 ? 1.0 - 0.5 * x : (1.0 - exp(-clamp(x, -60.0, 60.0))) / x; return exp(clamp(-za / H, -60.0, 60.0)) * g; }
void main() {
  int kind = int(v_m.x + 0.5); float sd = v_m.y * 97.0, tint = v_m.z, litP = v_m.w;
  vec3 P = v_P, N = v_N; float b = bay(), zrel = P.z + u_Zf;
  bool top = N.z > 0.9, mono = kind == 4;
  vec3 base = kind == 0 ? u_ped * (1.0 + tint * 0.06) : top ? u_roof * (1.0 + tint * 0.34) : u_wall * (1.0 + tint * 0.22);
  if (kind == 3 && fract(sd * 3.1) < 0.3) base = mix(base, u_glass * 1.7, 0.45);   // some darker glass towers
  if (mono) base *= 0.86;
  if (kind == 7) base *= 0.6;
  // sun and sky: a few flat steps
  float ndl = max(dot(N, u_sun), 0.0);
  vec3 col = base * (u_amb + u_sunc * floor(ndl * 3.0 + 0.5) / 3.0);
  vec3 emi = vec3(0.0);
  if (kind == 6) {
    // the floor: dark lots, lamps scattered down the streets, and traffic along the avenues after dark
    vec2 g = mod(P.xy - vec2(${W / 2 - UC_T / 2}.0), ${UC_T}.0);
    float ax = min(g.x, ${UC_T}.0 - g.x), ay = min(g.y, ${UC_T}.0 - g.y);
    col *= 0.6;
    vec2 lc = floor(P.xy / 4.0);
    emi += u_lamp * smoothstep(0.6, 1.0, u_night) * 0.55 * step(h21(lc + 3.0), 0.03 * lightK(P.xy)) * twinkle(lc);
    if (min(ax, ay) < 5.0 && fwidth(P.x) < 2.0) {
      col *= 1.2;
      float along = ax < ay ? P.y : P.x, lane = (ax < ay ? g.x : g.y) < ${UC_T / 2}.0 ? 1.0 : -1.0;
      float car = step(0.82, fract(along / 7.0 + u_time * 0.9 * lane + h21(vec2(floor(along / 7.0), lane))));
      emi += u_lamp * u_night * (0.1 + 0.6 * car);
    }
  } else if (top) {
    float fx = fwidth(P.x), fy = fwidth(P.y);
    float ex = min(P.x - v_b0.x, v_b1.x - P.x), ey = min(P.y - v_b0.y, v_b1.y - P.y);
    if (kind != 0 && (ex < fx || ey < fy)) col *= 1.16;   // a rim on roof edges
    else if (kind != 0 && (ex < 3.0 * fx || ey < 3.0 * fy)) col *= 0.92;
    if (kind == 5) { col *= 0.5; emi += vec3(0.9, 0.15, 0.1) * u_night * 1.6 * twinkle(vec2(sd)); }
    if (kind == 7) emi += u_lamp * u_night * 0.3 * step(h21(floor(P.xy / 3.0) + sd), 0.25);
    if (kind == 0 && P.z < -0.5) col *= 0.85;
    if (kind == 1) col *= 0.62;   // podium decks read as paving: the streets between the roofs
  } else {
    // facades, in face coordinates: u along the face (cells), v up (levels)
    float u = abs(N.x) > abs(N.y) ? P.y : P.x, v = P.z, fv = fwidth(v), fu = fwidth(u);
    float det = clamp((1.0 / max(fv, 1e-4) - 2.5) / 4.0, 0.0, 1.0);    // fades out once a storey is a few pixels
    float cw = kind == 1 ? 2.0 : mono ? 3.0 : 1.0;
    vec2 cell = vec2(floor(u / cw), floor(v)), f = vec2(fract(u / cw), fract(v));
    float win = 0.0, frac = 0.0;
    if (kind == 3 || kind == 2) { win = step(0.18, f.x) * step(f.x, 0.82) * step(0.3, f.y) * step(f.y, 0.78); frac = 0.29;
      if (mod(cell.y + floor(sd), 9.0) < 1.0) { win = 0.0; frac *= 0.89; } }
    else if (kind == 1) { win = step(0.1, f.x) * step(0.35, f.y) * step(f.y, 0.7) * step(mod(cell.y, 3.0), 0.5); frac = 0.105; }
    else if (mono) { win = step(0.35, f.x) * step(f.x, 0.65) * step(0.42, f.y) * step(f.y, 0.62) * step(mod(cell.y, 4.0), 0.5) * step(0.55, h21(floor(cell / vec2(5.0, 12.0)) + sd)); frac = 0.012; }
    vec3 wall = col;
    if (kind == 0) {
      // the pedestal: near featureless; faint seams, and a rare slit lit after dark
      if (mod(u, 6.0) < fu * 1.01) wall *= 0.94;
      if (mod(v, 24.0) < fv * 1.01) wall *= 0.92;
      float sl = step(h21(floor(vec2(u / 3.0, v / 3.0)) + sd), 0.01) * step(0.3, fract(u / 3.0)) * step(fract(u / 3.0), 0.7) * step(0.4, fract(v / 3.0)) * step(fract(v / 3.0), 0.75);
      emi += u_lamp * u_night * 0.8 * sl * det;
      // right under the city: its shadow by day, its lights spilling down after dark
      float lip = clamp(1.0 + P.z / 5.0, 0.0, 1.0);
      wall *= 1.0 - 0.3 * qd(lip, 3.0, b) * (1.0 - u_night);
      emi += u_lamp * u_night * 0.3 * qd(pow(clamp(1.0 + P.z / 14.0, 0.0, 1.0), 2.0), 5.0, b);
      col = wall;
    } else if (kind == 7) {
      col = wall * 0.9;
      float lane = fract(sd) < 0.5 ? 1.0 : -1.0;
      emi += u_lamp * u_night * 0.7 * step(0.5, fract(v)) * step(0.7, fract(u / 5.0 + u_time * 0.7 * lane));   // traffic
    } else {
      // big structure that holds at a distance: decks, ribs and panels of the megastructures
      if (mono || kind == 1) {
        float dk = mono ? 24.0 : 12.0, rb = mono ? 30.0 : 50.0;
        vec2 pn = vec2(floor(u / rb), floor(v / dk));
        wall *= 0.9 + 0.2 * qd(h21(pn + sd), 3.0, 0.5);
        float lv = mod(v, dk), lu = mod(u, rb);
        if (lv < max(fv, 0.6)) wall *= 0.7;
        else if (mono && lv < max(2.0 * fv, 1.6) && h21(vec2(floor(u / 40.0), pn.y) + sd * 3.0) < 0.45) emi += u_lamp * u_night * 0.7;   // a lit gallery under the deck
        if (lu < max(fu, 1.2)) wall *= 1.1;
        float ru = mod(u, 12.0), rv = mod(v, 8.0);
        if (mono) { if (ru < fu * 1.01) wall *= 1.12; else if (ru < fu * 2.01) wall *= 0.82; if (rv < fv * 1.01) wall *= 0.86; }
      } else if (kind == 3 && f.y < fv * 1.01) wall *= 0.9;
      // a window: glass by day; after dark some are lit, in runs along a floor
      float K = lightK(P.xy), run = h21(vec2(floor(cell.x / 5.0), cell.y) + sd), one = h21(cell + sd * 1.7);
      float lit = step(run * 0.65 + one * 0.35, litP * K) * u_night;
      vec3 lamp = u_lamp * (0.8 + 0.4 * h21(cell * 1.3 + 4.0)) * (one > 0.9 ? vec3(0.7, 0.95, 1.2) : vec3(1.0));
      vec3 glass = mix(u_glass, wall, 0.25);
      col = mix(mix(wall, glass, frac), mix(wall, glass, win), det);
      float lp = step(h21(floor(vec2(u / 7.0, v)) + sd * 2.3), litP * 1.3) * u_night;
      // far off, under a pixel a storey: a dim glow, and single bright points picked out of the world, which sparkle
      float far1 = clamp(1.0 / max(fv, 1e-4) - 1.0, 0.0, 1.0);
      vec2 pc = floor(vec2(u / cw, v));
      float pt = step(h21(pc + sd * 5.1), litP * frac * 0.3 * K) * smoothstep(0.6, 1.0, u_night) * twinkle(pc + sd);   // only at night: at dusk they'd be speckle on the smog
      emi += lamp * mix(frac * litP * K * u_night * 0.3 + pt * 0.6, mix(lp * frac * 1.3, win * lit * twinkle(cell + sd), det), far1);
    }
    // contact shadow where a box meets what it stands on
    if (kind != 0) col *= mix(0.8, 1.0, qd(smoothstep(0.0, 5.0, P.z - v_b0.z), 4.0, b));
  }
  // deep is dark: canyons and the floor get little light
  col *= mix(1.0 - u_dark, 1.0, qd(smoothstep(0.0, 0.55 * u_Zf, zrel), 6.0, b));
  // the air between here and the eye: only past the city's far plane
  vec3 Wp = vec3(P.xy, P.z * ${UC_LZ}), toEye = u_eye - Wp;
  float Le = length(toEye), Dp = max(v_D, 0.0), fr = Dp / (Dp + u_E), L = Le * fr, za = Wp.z, zb = za + toEye.z * fr;
  float tauH = L * u_fog.x * avgExp(za, zb, u_fog.y);
  // and the smog the lower city sinks into, thickening over its top Ts levels (no surface to it)
  vec3 up = v_D > 0.0 ? toEye / Le : u_Cv;
  float h = max(0.0, u_zs - P.z) * ${UC_LZ}, Tz = u_Ts * ${UC_LZ}, lay = h < Tz ? h * h / (2.0 * Tz) : h - 0.5 * Tz;
  float tauS = lay / max(up.z, 0.15) / u_Fl;
  float tau = min(tauH + tauS, 40.0), fd = qd(1.0 - exp(-tau), 12.0, b);
  vec3 fc = mix(airCol(-up), u_smog, tauS / (tau + 1e-4));
  col = mix(col, fc, fd);
  col += emi * exp(-tau * 0.3);   // lights carry a little further than the walls
  o = vec4(col, 1.0);
}`;
// behind everything: the air itself, seen from the eye, and above the horizon round one's pixel sky: sun, cumulus, stars
const UC_BG_VS = `#version 300 es
void main() { vec2 p = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0); gl_Position = vec4(p, 1.0, 1.0); }`;
const UC_BG_FS = `#version 300 es
precision highp float;
uniform vec2 u_size, u_c; uniform vec3 u_R, u_U, u_C, u_cl[4], u_sunc0; uniform float u_PXS, u_E, u_deck, u_cover, u_stars;
out vec4 o;
${UC_COMMON}
float fbm(vec2 p, int oct) { float a = 0.0, m = 0.5, n = 0.0; for (int i = 0; i < 5; i++) { if (i >= oct) break; a += vn2(p) * m; n += m; m *= 0.5; p = p * 2.03 + 17.0; } return a / n; }
vec3 grad4(float t, float b) { float f = clamp(t, 0.0, 1.0) * 3.0; int k = int(min(2.0, floor(f))); return mix(u_cl[k], u_cl[k + 1], qd(f - float(k), 4.0, b)); }
void main() {
  vec2 s = vec2(gl_FragCoord.x, u_size.y - gl_FragCoord.y);
  vec3 d = -u_C * u_E + u_R * (s.x - u_c.x) / u_PXS - u_U * (s.y - u_c.y) / u_PXS;
  vec3 c = airCol(d), dn = normalize(d);
  float b = bay(), e = asin(dn.z);
  if (acos(clamp(dot(dn, u_sunv), -1.0, 1.0)) < 0.012) c = u_sunc0;   // the sun's disc
  vec2 sp = floor(vec2(atan(dn.y, dn.x), e) * 700.0);   // stars sit on the sky, not the screen
  if (u_stars > 0.0 && e > 0.08 && h21(sp + 0.5) < 0.0016) c = mix(c, vec3(0.78, 0.81, 0.8), (0.4 + 0.6 * h21(sp + 9.0)) * u_stars);
  if (d.z > 0.0 && u_cover > 0.0) {
    // a cumulus deck overhead, seen in perspective: lit on its sun side, fading into the air far off
    float lam = (u_deck - u_eye.z) / d.z, r = lam * length(d.xy);
    if (r < 40000.0) {
      vec2 q = (u_eye.xy + d.xy * lam) / 1000.0, sq = u_sunv.xy * 0.18;
      int oct = r > 15000.0 ? 2 : r > 5500.0 ? 3 : 5;
      float n = fbm(vec2(q.x, q.y * 1.6), oct), cov = n - (1.0 - u_cover) * 0.75 - 0.18;
      if (cov > 0.0) {
        float dens = clamp(cov * 16.0, 0.0, 1.0), n2 = fbm(vec2(q.x + sq.x, (q.y + sq.y) * 1.6), oct);
        float lit = clamp(0.62 + (n - n2) * 9.0 - dens * 0.25, 0.0, 1.0);
        c = mix(c, grad4(lit, b), qd(dens * exp(-r / 17000.0), 3.0, b));
      }
    }
  }
  o = vec4(c, 1.0);
}`;

function ucProg(gl, vs, fs) {
  const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
  const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const U = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i), k = a.name.replace(/\[0\]$/, ''); U[k] = gl.getUniformLocation(p, a.name); }
  return { p, U };
}
function ucInit() {
  if (UC.gl) return true;
  const cv = document.createElement('canvas'); cv.width = cv.height = 4;
  const gl = cv.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: true, depth: true });
  if (!gl) return false;
  UC.P = ucProg(gl, UC_VS, UC_FS); UC.BG = ucProg(gl, UC_BG_VS, UC_BG_FS);
  UC.cv = cv; UC.gl = gl;
  // a unit box without its bottom: 5 faces, 30 vertices of position and normal
  const F = [[[0, 0, 1], [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]]], [[-1, 0, 0], [[0, 0, 0], [0, 1, 0], [0, 1, 1], [0, 0, 1]]], [[1, 0, 0], [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]]],
    [[0, -1, 0], [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]]], [[0, 1, 0], [[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]]]];
  const v = [];
  for (const [n, q] of F) for (const i of [0, 1, 2, 0, 2, 3]) v.push(...q[i], ...n);
  UC.vao = gl.createVertexArray(); gl.bindVertexArray(UC.vao);
  const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
  UC.ib = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, UC.ib);
  for (const [loc, size, off] of [[2, 3, 0], [3, 3, 12], [4, 4, 24]]) { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 40, off); gl.vertexAttribDivisor(loc, 1); }
  gl.bindVertexArray(null);
  return true;
}
function ucBuild() {
  const k = [UC.seed, ucPar('Zf')].join('|');
  if (UC.built === k) return;
  const t0 = performance.now(), data = ucGen(), gl = UC.gl;
  gl.bindBuffer(gl.ARRAY_BUFFER, UC.ib); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  UC.n = data.length / 10; UC.built = k; UC.genMs = Math.round(performance.now() - t0);
}

// ---------- the air, and palettes ----------
// Zf: depth of the floor below the city (levels). E: the eye's distance in front of the far plane (cells).
// F, Hf: haze (a ray of F cells at the city's base fogs by ~63%; it thins by e every Hf cells up).
// zs, Ts, Fl: the smog's top (fraction of Zf up from the floor), its soft depth (levels), its density.
// deck: the cloud deck's height (cells), about 1.7 km up. Each time of day scales the haze and smog by its own `clear`.
const UC_CFG = { Zf: 420, E: 150, F: 5000, Hf: 240, zs: 0.5, Ts: 150, Fl: 850, dark: 0.55, deck: 700 };
const UC_PED = { morning: '#4c4842', day: '#4a4740', dusk: '#2f2926', night: '#101119' };   // the city's own darkest walls
const UC_TOD = {
  // morning: the game's own sky (blue above, warm cream low down), a low warm sun, clearer air
  morning: { wall: '#7d7c74', roof: '#9a958a', amb: [0.64, 0.72, 0.86], sunc: [0.62, 0.46, 0.3], sun: [70, 20], glass: '#3e4f5c', lamp: '#000000', smog: '#b2b0a2', low: '#91a8b3', glow: '#3a2410', night: 0, clear: 1.6,
    sky: ['#5c84a0', '#7095ab', '#8caab6', '#afbfbb', '#d1cab3', '#e0cfae'], cl: ['#9aa8b0', '#c6cbc4', '#ebe6d8', '#f8f2e2'], cover: 0.5, sunc0: '#fffbea' },
  day: { wall: '#7a7f79', roof: '#959689', amb: [0.74, 0.75, 0.77], sunc: [0.36, 0.34, 0.28], sun: [120, 50], glass: '#46525a', lamp: '#000000', smog: '#a6a899', low: '#a9ab9e', glow: '#000000', night: 0, clear: 1.2,
    sky: ['#6c8b99', '#7f9aa4', '#97aaac', '#b2bab0', '#cdc8b2', '#dcd2b6'], cl: ['#a2a9a6', '#c9c8bb', '#e9e5d6', '#f6f1e2'], cover: 0.52, sunc0: '#fffbea' },
  dusk: { wall: '#4a3b39', roof: '#644e48', amb: [0.72, 0.68, 0.74], sunc: [0.75, 0.42, 0.2], sun: [330, 14], glass: '#1d1a1e', lamp: '#e0b45e', smog: '#8b5236', low: '#8a5638', glow: '#5a3010', night: 0.5, clear: 1.15,
    sky: ['#1c2630', '#343538', '#5f4439', '#a75f39', '#c27440', '#d98a45'], cl: ['#3a3236', '#6a4a42', '#a8613f', '#e09456'], cover: 0.4, sunc0: '#ffe0a0' },
  // night: dark navy, so the lights carry it, and they're far off, so faint
  night: { wall: '#0e1320', roof: '#121827', amb: [0.55, 0.62, 0.82], sunc: [0.06, 0.08, 0.14], sun: [210, 38], glass: '#05070d', lamp: '#f0a24e', smog: '#141b2c', low: '#0b111e', glow: '#000000', night: 1, clear: 1,
    sky: ['#020309', '#04060f', '#070b18', '#0a1122', '#0e172b', '#131d33'], cl: ['#070a12', '#0c111c', '#121a28', '#1a2333'], cover: 0.35, sunc0: '#dfe6e0', stars: 1 },
};
const ucPar = k => UC.ov[k] != null ? UC.ov[k] : UC_CFG[k];
const ucRGB = h => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const bdTod = () => S.tod === 'night' || S.tod === 'dusk' ? S.tod : LIT.on ? { morning: 'morning', evening: 'dusk', night: 'night' }[LIT.sun] || 'day' : 'day';

// ---------- one frame: v = { R, U, C, off, W, H, c } (art px; the camera's basis as the 3D view has it) ----------
function ucRender(v, tod) {
  if (!ucInit()) return false;
  ucBuild();
  const gl = UC.gl, cv = UC.cv, T = UC_TOD[tod], E = ucPar('E'), Zf = ucPar('Zf');
  if (cv.width !== v.W || cv.height !== v.H) { cv.width = v.W; cv.height = v.H; }
  gl.viewport(0, 0, v.W, v.H);
  let dFar = 1e9, dNear = -1e9;
  for (const x of [0, W]) for (const y of [0, D]) for (const z of [-1, NL + 3]) { const d = ucDot(ucW3([x, y, z]), v.C); dFar = Math.min(dFar, d); dNear = Math.max(dNear, d); }
  // the eye: in front of the far plane by E, on the ray through the view's centre
  const lx = (v.c[0] - v.off[0]) / UC_PXS, ly = (v.c[1] - v.off[1]) / UC_PXS;
  UC.eye = [0, 1, 2].map(i => v.R[i] * lx - v.U[i] * ly + v.C[i] * (dFar + E));
  const s = T.sun, sa = s[0] * Math.PI / 180, se = s[1] * Math.PI / 180, sun = [Math.cos(se) * Math.cos(sa), Math.cos(se) * Math.sin(sa), Math.sin(se)];
  const air = U => {
    for (const k of ['low', 'glow', 'smog']) gl.uniform3fv(U['u_' + k], ucRGB(T[k]));
    gl.uniform3fv(U.u_sky, T.sky.flatMap(ucRGB));
    gl.uniform3fv(U.u_sunv, sun); gl.uniform3fv(U.u_eye, UC.eye); gl.uniform1f(U.u_time, performance.now() / 1000);
  };
  gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
  let P = UC.BG; gl.useProgram(P.p); air(P.U);
  gl.uniform2f(P.U.u_size, v.W, v.H); gl.uniform2fv(P.U.u_c, v.c); gl.uniform3fv(P.U.u_R, v.R); gl.uniform3fv(P.U.u_U, v.U); gl.uniform3fv(P.U.u_C, v.C);
  gl.uniform1f(P.U.u_PXS, UC_PXS); gl.uniform1f(P.U.u_E, E); gl.uniform1f(P.U.u_deck, ucPar('deck'));
  gl.uniform3fv(P.U.u_cl, T.cl.flatMap(ucRGB)); gl.uniform3fv(P.U.u_sunc0, ucRGB(T.sunc0)); gl.uniform1f(P.U.u_cover, T.cover); gl.uniform1f(P.U.u_stars, T.stars || 0);
  gl.bindVertexArray(null); gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.depthMask(true); gl.clearDepth(1); gl.clear(gl.DEPTH_BUFFER_BIT);
  P = UC.P; gl.useProgram(P.p); const U = P.U; air(U);
  gl.uniform3fv(U.u_R, v.R); gl.uniform3fv(U.u_U, v.U); gl.uniform3fv(U.u_C, v.C);
  gl.uniform2fv(U.u_off, v.off); gl.uniform2f(U.u_size, v.W, v.H); gl.uniform2fv(U.u_c, v.c);
  gl.uniform1f(U.u_LZ, UC_LZ); gl.uniform1f(U.u_PXS, UC_PXS); gl.uniform1f(U.u_dFar, dFar); gl.uniform1f(U.u_E, E);
  gl.uniform1f(U.u_dNear, dNear + 100); gl.uniform1f(U.u_span, 120000); gl.uniform3fv(U.u_Cv, v.C);
  gl.uniform1f(U.u_Zf, Zf); gl.uniform1f(U.u_dark, ucPar('dark'));
  gl.uniform2f(U.u_fog, 1 / (ucPar('F') * T.clear), ucPar('Hf'));
  gl.uniform1f(U.u_zs, -Zf + ucPar('zs') * Zf); gl.uniform1f(U.u_Ts, ucPar('Ts')); gl.uniform1f(U.u_Fl, ucPar('Fl') * T.clear);
  gl.uniform3fv(U.u_sun, sun);
  for (const k of ['wall', 'roof', 'glass', 'lamp']) gl.uniform3fv(U['u_' + k], ucRGB(T[k]));
  gl.uniform3fv(U.u_ped, ucRGB(UC_PED[tod]));
  gl.uniform3fv(U.u_amb, T.amb); gl.uniform3fv(U.u_sunc, T.sunc); gl.uniform1f(U.u_night, T.night);
  gl.bindVertexArray(UC.vao); gl.drawArraysInstanced(gl.TRIANGLES, 0, 30, UC.n); gl.bindVertexArray(null);
  return true;
}
// redrawn when the camera moves, and after dark ~9 times a second, for the traffic and the twinkle
const ucKey = tod => [UC.seed, JSON.stringify(UC.ov), tod, UC_TOD[tod].night ? Math.floor(performance.now() / 110) : 0].join('|');

// ---------- 2D: the view's camera, read straight off projIso ----------
function ucView2D() {
  const o = projIso(0, 0, 0), ex = projIso(1, 0, 0), ey = projIso(0, 1, 0), ez = projIso(0, 0, 1);
  const R = [(ex[0] - o[0]) / UC_PXS, (ey[0] - o[0]) / UC_PXS, (ez[0] - o[0]) / UC_PXS / UC_LZ];
  const U = [-(ex[1] - o[1]) / UC_PXS, -(ey[1] - o[1]) / UC_PXS, -(ez[1] - o[1]) / UC_PXS / UC_LZ];
  let C = [R[1] * U[2] - R[2] * U[1], R[2] * U[0] - R[0] * U[2], R[0] * U[1] - R[1] * U[0]];
  if (C[2] < 0) C = C.map(a => -a);   // toward the camera, which looks down
  return { R, U, C, off: o, W: S.bw, H: S.bh, c: [S.bw / 2, S.bh / 2] };
}
const buildSkyFlat = buildSky;
buildSky = function () {
  if (BD.scene !== 'under') return buildSkyFlat();
  const v = ucView2D(), bw = S.bw, bh = S.bh, tod = bdTod();
  const key = [bw, bh, v.off[0], v.off[1], S.rot, ucKey(tod)].join('|');
  if (!SKYC.c || SKYC.c.width !== bw || SKYC.c.height !== bh) { SKYC.c = mk(bw, bh); UC.key = ''; }
  if (key !== UC.key && ucRender(v, tod)) { const g = SKYC.c.getContext('2d'); g.clearRect(0, 0, bw, bh); g.drawImage(UC.cv, 0, 0); UC.key = key; }
  skyDirty = true;   // checked again every frame; redrawn only when the camera moved
};

// ---------- switching and hooks: B turns the backdrop off (the old flat sky, for now) and on ----------
function setBackdrop(s) { BD.scene = s; skyDirty = true; UC.key = ''; if (typeof G3 !== 'undefined') G3.skyKey = ''; log('sys', 'Backdrop: ' + (s === 'under' ? 'Undercity' : 'the flat sky'), 'sys'); }
window.addEventListener('keydown', e => {
  if (e.target.closest && e.target.closest('input, textarea, select')) return;
  if (e.metaKey || e.ctrlKey || e.altKey || e.key.toLowerCase() !== 'b') return;
  setBackdrop(BD.scene === 'under' ? 'off' : 'under'); e.preventDefault();
});
{
  const t0 = STRATUM.test;
  STRATUM.test = function (p) {
    if (p.bd) BD.scene = p.bd;
    for (const [h, k] of [['uz', 'Zf'], ['ue', 'E'], ['uf', 'F'], ['uh', 'Hf'], ['ufl', 'Fl']]) if (p[h]) UC.ov[k] = +p[h];
    if (p.us) UC.seed = +p.us;
    t0.call(this, p);
    if (p.light) setLightTime(p.light);
    skyDirty = true; UC.key = '';
  };
  STRATUM.UC = UC; STRATUM.BD = BD;
}
