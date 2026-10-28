'use strict';
// ==========================================================================
// World = a voxel base grid (cells) + carves (exact shapes cut out of it)
// + adds (exact solids placed into it). Units: 1 = one cell across, 1 = one
// level up. The shader (render.js) and the physics (cables.js) both read the
// same prim list, so what you see is what cables collide with.
// ==========================================================================
const NX = 96, NY = 96, NZ = 32, Z0 = -4, ZTOP = Z0 + NZ;
const M = { EMPTY: 0, ROCK: 1, CONC: 2, HAB: 3, OLD: 4, DECK: 5, WATER: 6, GREEN: 7, STEEL: 8, STONE: 9, CROWN: 10, PAVE: 11, BOX: 12 };
const cells = new Uint8Array(NX * NY * NZ);
const sky = new Uint8Array(NX * NY * NZ);        // 0..255 sky openness per cell (for AO)
const cidx = (x, y, z) => x + NX * (y + NY * (z - Z0));
const inGrid = (x, y, z) => x >= 0 && y >= 0 && z >= Z0 && x < NX && y < NY && z < ZTOP;
const cellAt = (x, y, z) => inGrid(x, y, z) ? cells[cidx(x, y, z)] : 0;

// --- prims -------------------------------------------------------------------
const T_BOX = 1, T_VCYL = 2, T_HCYL = 3, T_WEDGE = 4;
const ADD = 0, CARVE = 1;
const adds = [], carves = [], groups = [];   // groups: {prims:[...], bb}
let curGroup = null;
function beginGroup(name) { curGroup = { name, prims: [] }; groups.push(curGroup); }
function mk(type, role, mat, c, h, ang, plane) {
  const p = { type, role, mat, c, h, ang: ang || 0, cs: Math.cos(ang || 0), sn: Math.sin(ang || 0), n: plane ? plane.slice(0, 3) : [0, 0, 1], d: plane ? plane[3] : 1e9 };
  p.bb = primBB(p);
  if (role === CARVE) carves.push(p); else { adds.push(p); if (!curGroup) beginGroup('misc'); curGroup.prims.push(p); }
  return p;
}
// axis-aligned box from corners
const box = (role, mat, x0, y0, z0, x1, y1, z1) => mk(T_BOX, role, mat, [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], [(x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2]);
const obb = (role, mat, cx, cy, cz, hx, hy, hz, ang) => mk(T_BOX, role, mat, [cx, cy, cz], [hx, hy, hz], ang);
const vcyl = (role, mat, cx, cy, r, z0, z1) => mk(T_VCYL, role, mat, [cx, cy, (z0 + z1) / 2], [r, r, (z1 - z0) / 2]);
const hcyl = (role, mat, cx, cy, cz, half, r, ang) => mk(T_HCYL, role, mat, [cx, cy, cz], [half, r, r], ang);
// box that keeps only the side n·p <= d (world-space plane; box is axis-aligned)
function wedge(role, mat, x0, y0, z0, x1, y1, z1, nx, ny, nz, d) {
  const L = Math.hypot(nx, ny, nz); nx /= L; ny /= L; nz /= L; d /= L;
  const c = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2];
  return mk(T_WEDGE, role, mat, c, [(x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2], 0, [nx, ny, nz, d - (nx * c[0] + ny * c[1] + nz * c[2])]);
}
function primBB(p) {
  const [cx, cy, cz] = p.c, [hx, hy, hz] = p.h;
  if (p.type === T_VCYL) return [cx - hx, cy - hx, cz - hz, cx + hx, cy + hx, cz + hz];
  // rotated box / horizontal cylinder: extent of the rotated rectangle
  const ex = Math.abs(p.cs) * hx + Math.abs(p.sn) * hy, ey = Math.abs(p.sn) * hx + Math.abs(p.cs) * hy;
  return [cx - ex, cy - ey, cz - hz, cx + ex, cy + ey, cz + hz];
}
function toLocal(p, x, y, z) {
  const dx = x - p.c[0], dy = y - p.c[1];
  return [p.cs * dx + p.sn * dy, -p.sn * dx + p.cs * dy, z - p.c[2]];
}
function toWorldDir(p, l) { return [p.cs * l[0] - p.sn * l[1], p.sn * l[0] + p.cs * l[1], l[2]]; }
function insidePrim(p, x, y, z) {
  const b = p.bb; if (x < b[0] || y < b[1] || z < b[2] || x > b[3] || y > b[4] || z > b[5]) return false;
  const [lx, ly, lz] = toLocal(p, x, y, z), [hx, hy, hz] = p.h;
  switch (p.type) {
    case T_BOX: return Math.abs(lx) <= hx && Math.abs(ly) <= hy && Math.abs(lz) <= hz;
    case T_VCYL: return lx * lx + ly * ly <= hx * hx && Math.abs(lz) <= hz;
    case T_HCYL: return Math.abs(lx) <= hx && ly * ly + lz * lz <= hy * hy;
    case T_WEDGE: return Math.abs(lx) <= hx && Math.abs(ly) <= hy && Math.abs(lz) <= hz && p.n[0] * lx + p.n[1] * ly + p.n[2] * lz <= p.d;
  }
  return false;
}
// nearest exit from inside a solid prim: returns [point, normal]
function exitPrim(p, x, y, z) {
  const l = toLocal(p, x, y, z), [hx, hy, hz] = p.h; let best = 1e9, out = null, nrm = null;
  const consider = (dist, lp, ln) => { if (dist < best) { best = dist; out = lp; nrm = ln; } };
  if (p.type === T_BOX || p.type === T_WEDGE) {
    for (let a = 0; a < 3; a++) for (const s of [-1, 1]) {
      const h = [hx, hy, hz][a], dist = h - s * l[a];
      const lp = l.slice(); lp[a] = s * (h + 0.002); const ln = [0, 0, 0]; ln[a] = s; consider(dist, lp, ln);
    }
    if (p.type === T_WEDGE) { const dist = p.d - (p.n[0] * l[0] + p.n[1] * l[1] + p.n[2] * l[2]); consider(dist, [l[0] + p.n[0] * (dist + .002), l[1] + p.n[1] * (dist + .002), l[2] + p.n[2] * (dist + .002)], p.n.slice()); }
  } else if (p.type === T_VCYL) {
    const rr = Math.hypot(l[0], l[1]) || 1e-6, k = (hx + .002) / rr;
    consider(hx - rr, [l[0] * k, l[1] * k, l[2]], [l[0] / rr, l[1] / rr, 0]);
    consider(hz - l[2], [l[0], l[1], hz + .002], [0, 0, 1]); consider(hz + l[2], [l[0], l[1], -hz - .002], [0, 0, -1]);
  } else {
    const rr = Math.hypot(l[1], l[2]) || 1e-6, k = (hy + .002) / rr;
    consider(hy - rr, [l[0], l[1] * k, l[2] * k], [0, l[1] / rr, l[2] / rr]);
    consider(hx - l[0], [hx + .002, l[1], l[2]], [1, 0, 0]); consider(hx + l[0], [-hx - .002, l[1], l[2]], [-1, 0, 0]);
  }
  const w = toWorldDir(p, out), n = toWorldDir(p, nrm);
  return { p: [w[0] + p.c[0], w[1] + p.c[1], w[2] + p.c[2]], n, dist: best };
}
// nearest point just inside a carve (the void), from a point in the solid next to it
function enterCarve(p, x, y, z) {
  const l = toLocal(p, x, y, z), [hx, hy, hz] = p.h, e = 0.003;
  let q = l.slice();
  if (p.type === T_VCYL) {
    const rr = Math.hypot(q[0], q[1]); if (rr > hx - e) { const k = (hx - e) / rr; q[0] *= k; q[1] *= k; }
    q[2] = Math.max(-hz + e, Math.min(hz - e, q[2]));
  } else if (p.type === T_HCYL) {
    const rr = Math.hypot(q[1], q[2]); if (rr > hy - e) { const k = (hy - e) / rr; q[1] *= k; q[2] *= k; }
    q[0] = Math.max(-hx + e, Math.min(hx - e, q[0]));
  } else {
    q = [Math.max(-hx + e, Math.min(hx - e, q[0])), Math.max(-hy + e, Math.min(hy - e, q[1])), Math.max(-hz + e, Math.min(hz - e, q[2]))];
    if (p.type === T_WEDGE) { const s = p.n[0] * q[0] + p.n[1] * q[1] + p.n[2] * q[2] - p.d; if (s > -e) for (let a = 0; a < 3; a++) q[a] -= p.n[a] * (s + e); }
  }
  const w = toWorldDir(p, q);
  const wp = [w[0] + p.c[0], w[1] + p.c[1], w[2] + p.c[2]];
  const dn = [wp[0] - x, wp[1] - y, wp[2] - z], dl = Math.hypot(dn[0], dn[1], dn[2]) || 1e-6;
  return { p: wp, n: [dn[0] / dl, dn[1] / dl, dn[2] / dl], dist: dl };
}

// --- spatial buckets for the CPU side (physics) --------------------------------
const BK = 8, BNX = NX / BK, BNY = NY / BK, BNZ = NZ / BK;
let bucketAdds = [], bucketCarves = [];
function buildBuckets() {
  bucketAdds = Array.from({ length: BNX * BNY * BNZ }, () => []);
  bucketCarves = Array.from({ length: BNX * BNY * BNZ }, () => []);
  const put = (list, p) => {
    const b = p.bb;
    for (let bz = Math.max(0, Math.floor((b[2] - Z0) / BK)); bz <= Math.min(BNZ - 1, Math.floor((b[5] - Z0) / BK)); bz++)
      for (let by = Math.max(0, Math.floor(b[1] / BK)); by <= Math.min(BNY - 1, Math.floor(b[4] / BK)); by++)
        for (let bx = Math.max(0, Math.floor(b[0] / BK)); bx <= Math.min(BNX - 1, Math.floor(b[3] / BK)); bx++)
          list[bx + BNX * (by + BNY * bz)].push(p);
  };
  adds.forEach(p => put(bucketAdds, p)); carves.forEach(p => put(bucketCarves, p));
}
function bucketOf(x, y, z) {
  const bx = Math.floor(x / BK), by = Math.floor(y / BK), bz = Math.floor((z - Z0) / BK);
  if (bx < 0 || by < 0 || bz < 0 || bx >= BNX || by >= BNY || bz >= BNZ) return -1;
  return bx + BNX * (by + BNY * bz);
}
function inCarve(x, y, z) {
  const b = bucketOf(x, y, z); if (b < 0) return null;
  for (const p of bucketCarves[b]) if (insidePrim(p, x, y, z)) return p;
  return null;
}
function inAdd(x, y, z) {
  const b = bucketOf(x, y, z); if (b < 0) return null;
  for (const p of bucketAdds[b]) if (insidePrim(p, x, y, z)) return p;
  return null;
}
function voxelSolid(x, y, z) { return cellAt(Math.floor(x), Math.floor(y), Math.floor(z)) > 0 && !inCarve(x, y, z); }
function solidAt(x, y, z) { return voxelSolid(x, y, z) || !!inAdd(x, y, z); }

// Push a point out of the world: returns {p, n} or null when the point is free.
function pushOut(x, y, z) {
  const a = inAdd(x, y, z);
  if (a) { const e = exitPrim(a, x, y, z); if (!solidAt(e.p[0], e.p[1], e.p[2])) return e; }
  if (!a && !voxelSolid(x, y, z)) return null;
  // candidates: the six faces of the cell, and every carve touching this cell
  const cx = Math.floor(x), cy = Math.floor(y), cz = Math.floor(z), cand = [];
  const fx = x - cx, fy = y - cy, fz = z - cz, e = 0.003;
  cand.push({ p: [cx - e, y, z], n: [-1, 0, 0], dist: fx }, { p: [cx + 1 + e, y, z], n: [1, 0, 0], dist: 1 - fx });
  cand.push({ p: [x, cy - e, z], n: [0, -1, 0], dist: fy }, { p: [x, cy + 1 + e, z], n: [0, 1, 0], dist: 1 - fy });
  cand.push({ p: [x, y, cz - e], n: [0, 0, -1], dist: fz }, { p: [x, y, cz + 1 + e], n: [0, 0, 1], dist: 1 - fz });
  const b = bucketOf(x, y, z);
  if (b >= 0) for (const p of bucketCarves[b]) { const bb = p.bb; if (x > bb[0] - 1.5 && y > bb[1] - 1.5 && z > bb[2] - 1.5 && x < bb[3] + 1.5 && y < bb[4] + 1.5 && z < bb[5] + 1.5) cand.push(enterCarve(p, x, y, z)); }
  if (a) cand.push(exitPrim(a, x, y, z));
  cand.sort((u, v) => u.dist - v.dist);
  for (const c of cand) if (!solidAt(c.p[0], c.p[1], c.p[2])) return c;
  return { p: [x, y, cz + 1 + e], n: [0, 0, 1], dist: 1 - fz };   // stuck deep inside: go up
}

// --- the scene -----------------------------------------------------------------
const PORTS = {};          // named anchor points for the preset cables
const BLOCKS = [
  { name: 'A', x0: 4, y0: 4, x1: 44, y1: 44, top: 24, skin: M.HAB },
  { name: 'B', x0: 4, y0: 52, x1: 60, y1: 92, top: 14, skin: M.HAB },
  { name: 'C', x0: 52, y0: 4, x1: 92, y1: 44, top: 16, skin: M.CONC },
  { name: 'D', x0: 68, y0: 52, x1: 92, y1: 92, top: 10, skin: M.HAB }
];
function hash3(x, y, z) { let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

function rails(cx, cy, z, half, along, width, ang) {
  // two thin rails either side of a deck running along local x
  const a = ang || (along === 'y' ? Math.PI / 2 : 0);
  const ox = -Math.sin(a) * (width - 0.06), oy = Math.cos(a) * (width - 0.06);
  obb(ADD, M.STEEL, cx + ox, cy + oy, z + 0.22, half, 0.06, 0.22, a);
  obb(ADD, M.STEEL, cx - ox, cy - oy, z + 0.22, half, 0.06, 0.22, a);
}
function deck(cx, cy, ztop, half, width, along) {
  const a = along === 'y' ? Math.PI / 2 : 0;
  obb(ADD, M.DECK, cx, cy, ztop - 0.15, half, width, 0.15, a);
  rails(cx, cy, ztop, half, along, width, a);
}

function buildScene() {
  cells.fill(0); adds.length = 0; carves.length = 0; groups.length = 0; curGroup = null;
  const fill = (x0, y0, z0, x1, y1, z1, f) => { for (let z = z0; z < z1; z++) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) cells[cidx(x, y, z)] = typeof f === 'function' ? f(x, y, z) : f; };
  fill(0, 0, Z0, NX, NY, -1, M.ROCK);
  fill(0, 0, -1, NX, NY, 0, M.PAVE);
  for (const b of BLOCKS) fill(b.x0, b.y0, 0, b.x1, b.y1, b.top, (x, y, z) => {
    if (z < 4) return M.OLD;
    if (z >= b.top - 1) return M.CROWN;
    if (b.name === 'C') return (z % 6 === 3 || z % 6 === 4) ? M.HAB : M.CONC;   // ribbon windows in the cast mass
    return b.skin;
  });
  // overgrowth on A's roof and D's roof
  for (const b of [BLOCKS[0], BLOCKS[3]]) for (let y = b.y0; y < b.y1; y++) for (let x = b.x0; x < b.x1; x++) {
    const n = hash3(x >> 2, y >> 2, 7) * 0.7 + hash3(x, y, 9) * 0.3;
    if (n > 0.62) cells[cidx(x, y, b.top - 1)] = M.GREEN;
  }

  // --- block A: the borehole ---------------------------------------------------
  vcyl(CARVE, 0, 24, 24, 10, Z0 - 1, ZTOP + 1);
  box(CARVE, 0, 31, 21, 5, 45, 27, 9);                 // portal from the shaft out to the canyon
  wedge(CARVE, 0, 33, 33, -1, 45, 45, 25, -1, -1, 0, -79);   // vertical chamfer on the SE corner
  beginGroup('borehole');
  vcyl(ADD, M.WATER, 24, 24, 10.2, Z0, Z0 + 0.6);
  const steps = 158;
  for (let i = 0; i < steps; i++) {
    const th = i * (2 * Math.PI / 48) + 0.4, z = Z0 + 0.6 + i * (1 / 6) + 0.17;
    obb(ADD, M.CONC, 24 + Math.cos(th) * 9.05, 24 + Math.sin(th) * 9.05, z - 0.09, 1.05, 0.66, 0.09, th);
  }
  beginGroup('shaft bridges');
  deck(24, 24, 12, 10.6, 0.9, 'x');
  deck(24, 24, 6, 10.6, 0.9, 'y');
  PORTS.bridgeA = [[20, 24.75, 11.7], [21, 24.75, 11.7], [22, 24.75, 11.7], [23, 24.75, 11.7]];
  // the far wall of the shaft is the one that faces the viewer
  PORTS.shaftWall = [0, 1, 2, 3].map(k => { const th = 3.55 + k * 0.12; return [24 + Math.cos(th) * 9.85, 24 + Math.sin(th) * 9.85, 1.5 + k * 0.4]; });

  // --- block B: the hall ---------------------------------------------------------
  box(CARVE, 0, 10, 58, 3, 54, 86, 12);
  for (const y of [63, 71, 79]) box(CARVE, 0, 12, y, 11.9, 52, y + 2, ZTOP);   // skylight slots
  box(CARVE, 0, 53, 66, 3, 61, 78, 10);                  // portal to the street
  beginGroup('hall floor');
  box(ADD, M.STONE, 10, 58, 2.9, 54, 86, 3);
  box(ADD, M.WATER, 12, 70.6, 3, 52, 73.4, 3.1);
  beginGroup('hall columns');
  for (const x of [16, 23, 38, 45]) for (const y of [65, 79]) vcyl(ADD, M.CONC, x, y, 1.15, 3, 12);
  beginGroup('hall walkways');
  deck(32, 72, 8, 22, 1.0, 'x');
  deck(31, 72, 6, 14, 1.0, 'y');
  beginGroup('hall stair');
  for (let i = 0; i < 12; i++) { const h = (i + 1) * 0.25; obb(ADD, M.CONC, 19.45 + i * 0.9, 59.6, 3 + h / 2, 0.45, 0.8, h / 2, 0); }
  PORTS.walkX = [[40, 72.8, 8.25], [41, 72.8, 8.25]];
  PORTS.hallFloor = [[46, 76.5, 3.25], [47, 77.5, 3.25]];

  // --- block C: a 1:2 ramp face, 24 cells long ----------------------------------------
  wedge(CARVE, 0, 51, 19, 3, 93, 45, ZTOP + 1, 0, -1, -2, -52);
  // --- block D: garden court ------------------------------------------------------
  box(CARVE, 0, 74, 60, 2, 86, 84, 11);
  beginGroup('court');
  box(ADD, M.GREEN, 74, 60, 2, 86, 84, 2.2);
  for (const [x, y] of [[77, 64], [82, 70], [78, 77], [83, 81]]) { vcyl(ADD, M.OLD, x, y, 0.14, 2.2, 3.6); vcyl(ADD, M.GREEN, x, y, 1.1, 3.4, 4.4); }

  // --- the canyon: rigid mains, posts, a footbridge ---------------------------------
  beginGroup('mains');
  hcyl(ADD, M.STEEL, 48, 28, 11, 30, 1.1, Math.PI / 2);
  for (let y = 4; y < 50; y += 8) obb(ADD, M.CONC, 48, y, 4.95, 0.35, 0.35, 4.95, 0);
  hcyl(ADD, M.STEEL, 34, 48, 2.6, 36, 0.7, 0);
  beginGroup('footbridge');
  deck(48, 30, 13, 4.3, 0.9, 'x');
  // junction boxes on the facades, with ports in front of them
  beginGroup('junctions');
  PORTS.facadeA = []; PORTS.towerC = []; PORTS.southA = []; PORTS.northB = [];
  for (let i = 0; i < 6; i++) { obb(ADD, M.BOX, 44.12, 12.5 + i * 0.5, 14.3, 0.12, 0.2, 0.3, 0); PORTS.facadeA.push([44.3, 12.5 + i * 0.5, 14.15]); }
  for (let i = 0; i < 6; i++) PORTS.towerC.push([51.85, 14 + i * 0.5, 15.5]);
  for (let i = 0; i < 4; i++) { obb(ADD, M.BOX, 22 + i * 1.2, 44.12, 14.3, 0.25, 0.12, 0.3, 0); PORTS.southA.push([22 + i * 1.2, 44.3, 14.1]); }
  for (let i = 0; i < 4; i++) PORTS.northB.push([25 + i * 1.2, 51.85, 12.6]);
  PORTS.roofC = [[70, 18.5, 16.45]];
  PORTS.canyonFloor = [[70, 48.5, 0.45]];

  for (const g of groups) {
    const bb = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
    for (const p of g.prims) for (let a = 0; a < 3; a++) { bb[a] = Math.min(bb[a], p.bb[a]); bb[a + 3] = Math.max(bb[a + 3], p.bb[a + 3]); }
    g.bb = bb;
  }
  buildBuckets();
  // clear voxels that a carve swallows whole (the shader then skips them for free)
  for (const p of carves) {
    const b = p.bb;
    for (let z = Math.max(Z0, Math.floor(b[2])); z <= Math.min(ZTOP - 1, Math.floor(b[5])); z++)
      for (let y = Math.max(0, Math.floor(b[1])); y <= Math.min(NY - 1, Math.floor(b[4])); y++)
        for (let x = Math.max(0, Math.floor(b[0])); x <= Math.min(NX - 1, Math.floor(b[3])); x++) {
          const i = cidx(x, y, z); if (!cells[i]) continue;
          let all = true;
          for (let k = 0; k < 8 && all; k++) if (!insidePrim(p, x + (k & 1), y + ((k >> 1) & 1), z + ((k >> 2) & 1))) all = false;
          if (all) cells[i] = 0;
        }
  }
  computeSky();
}

// sky openness: fraction of nine upward rays that escape, per cell (coarse AO)
function computeSky() {
  const occ = new Uint8Array(NX * NY * NZ);
  for (let z = Z0; z < ZTOP; z++) for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) {
    const i = cidx(x, y, z); occ[i] = cells[i] && !inCarve(x + .5, y + .5, z + .5) ? 1 : 0;
  }
  const dirs = [[0, 0, 3], [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [.7, .7, 1], [-.7, .7, 1], [.7, -.7, 1], [-.7, -.7, 1]];
  for (let z = Z0; z < ZTOP; z++) for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) {
    const i = cidx(x, y, z); if (occ[i]) { sky[i] = 0; continue; }
    let s = 0, tot = 0;
    for (const d of dirs) {
      const w = d[2] === 3 ? 3 : 1; tot += w;
      let px = x + .5, py = y + .5, pz = z + .5, hit = false;
      for (let k = 0; k < 40; k++) {
        px += d[0]; py += d[1]; pz += 1;
        if (pz >= ZTOP) break;
        if (px < 0 || py < 0 || px >= NX || py >= NY) break;
        if (occ[cidx(px | 0, py | 0, Math.floor(pz))]) { hit = true; break; }
      }
      if (!hit) s += w;
    }
    sky[i] = Math.round(255 * s / tot);
  }
}
function skyAt(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  return inGrid(ix, iy, iz) ? sky[cidx(ix, iy, iz)] / 255 : 1;
}
