// ==========================================================================
// Wires: cables are free curves, not cells. XPBD ropes in world space
// (x, y in cells, z in levels) that anchor on lattice points, collide with the
// cell grid and drape. Ties gather cables into round bundles (or flat
// ribbons); tied cables move as one heavier body. Posts carry bundles over
// voids. A bundle's loose end is a "head": pulling it pays cable out of the
// loose tail, so a run can be extended support by support.
// Drawn per level in the iso pass with the sprites' palette and baked light.
// ==========================================================================
const WGRAV = 16;
const GAUGES = [
  { key: 'data', name: 'data wire', r: 0.05, seg: 0.22, mass: 0.3, stretch: 0.004, bend: 6, drag: 0.984, fric: 0.6, grab: 1.5, px: 1,
    hues: ['#5fd3c4', '#9b87e8', '#a9cf56'] },
  { key: 'power', name: 'power cable', r: 0.09, seg: 0.25, mass: 0.8, stretch: 0.002, bend: 1.5, drag: 0.984, fric: 0.7, grab: 2.5, px: 2,
    hues: ['#e27a4e', '#e0a33a'] },
  { key: 'hose', name: 'flex hose', r: 0.17, seg: 0.3, mass: 3, stretch: 0.0008, bend: 0.25, drag: 0.978, fric: 0.8, grab: 5, px: 3,
    hues: ['#b89a58', '#7e9a5e'] },
  { key: 'trunk', name: 'trunk pipe', r: 0.3, seg: 0.38, mass: 10, stretch: 0.0002, bend: 0.04, drag: 0.978, fric: 0.9, grab: 10, px: 5,
    hues: ['#7fa0b8'] }
];
const DARK = ['#3c3f45', '#33302d', '#45484f', '#2c2f33'];
const GIRDER_HEX = '#a9b6bf', MOUNT_HEX = '#c9a54a', GLEAM = '#f4f8fa', SLEEVE_HEX = '#4a4540', TIE_HEX = '#eeeae0', ROD_HEX = '#5c646b', POST_HEX = '#8a9298';
const WIRES = { hl: 'amber', only: null, cables: [], ties: [], posts: [], girders: [], mounts: [], gauge: 1, sleeve: false, outline: true, round: true, tieStyle: 'band', palette: 'bright', sockets: true, bundleLook: 'wires', feel: 'weighty', nextId: 1, hue: [0, 0, 0, 0], stage: null };
const FEEL = { springy: { stretch: 6, bend: 3, drag: 1.002, grab: 0.3 }, weighty: { stretch: 1, bend: 1, drag: 1, grab: 1 }, taut: { stretch: 0.2, bend: 0.5, drag: 1, grab: 1 } };
const v3 = {
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  norm: a => { const l = Math.hypot(a[0], a[1], a[2]) || 1e-9; return [a[0] / l, a[1] / l, a[2] / l]; },
  dist: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
};
const xAt = (c, i) => [c.X[i * 3], c.X[i * 3 + 1], c.X[i * 3 + 2]];

// ---------- the world as the wires see it ----------
// vertical extent of a cell's solid part, as a fraction of the level (null = passable)
const OCC_SLAB = [0, 0.25], OCC_CANOPY = [0.8, 1], OCC_FULL = [0, 1];
function occOf(t) {
  if (!t) return null;
  switch (t) {
    case T.WATER: case T.STREET: case T.WALK: case T.DECK: case T.TERRACE: case T.ROOFWALK: return OCC_SLAB;
    case T.CANOPY: return OCC_CANOPY;
    case T.TREE: case T.PILLAR: case T.LAMP: case T.ANTENNA: case T.VENT: case T.FRAME: case T.TRUSS: case T.CRANE: case T.PIPE: case T.VAULT: return null;
    default: return OCC_FULL;
  }
}
function wsolid(x, y, z) {
  if (z < 0) return true;
  const cx = Math.floor(x), cy = Math.floor(y), cz = Math.floor(z);
  if (cx < 0 || cy < 0 || cx >= W || cy >= D || cz >= NL) return false;
  const o = occOf(cells[idx(cx, cy, cz)]); if (!o) return false;
  const f = z - cz; return f >= o[0] && f <= o[1];
}
// push a point out of whatever it is inside; returns {p, n} or null when free
function wpush(x, y, z) {
  if (!wsolid(x, y, z)) return null;
  if (z < 0) return { p: [x, y, 0.002], n: [0, 0, 1] };
  const cx = Math.floor(x), cy = Math.floor(y), cz = Math.floor(z), o = occOf(cells[idx(cx, cy, cz)]), e = 0.003;
  const fx = x - cx, fy = y - cy, cand = [
    { p: [x, y, cz + o[1] + e], n: [0, 0, 1], d: cz + o[1] - z },
    { p: [cx - e, y, z], n: [-1, 0, 0], d: fx }, { p: [cx + 1 + e, y, z], n: [1, 0, 0], d: 1 - fx },
    { p: [x, cy - e, z], n: [0, -1, 0], d: fy }, { p: [x, cy + 1 + e, z], n: [0, 1, 0], d: 1 - fy }
  ];
  if (o[0] > 0) cand.push({ p: [x, y, cz + o[0] - e], n: [0, 0, -1], d: z - (cz + o[0]) });
  cand.sort((a, b) => a.d - b.d);
  for (const c of cand) if (!wsolid(c.p[0], c.p[1], c.p[2])) return c;
  return cand[0];
}

// ---------- cables ----------
// a cable along a polyline of world points; the cable is `slack` times the path length
function makeCablePath(gi, pts, o) {
  o = o || {};
  const g = GAUGES[gi], acc = [0];
  for (let k = 1; k < pts.length; k++) acc.push(acc[k - 1] + v3.dist(pts[k], pts[k - 1]));
  const L = acc[acc.length - 1] * (o.slack || 1), n = Math.max(4, Math.ceil(L / g.seg) + 1);
  const c = { id: WIRES.nextId++, gi, g, n, X: new Float32Array(n * 3), P: new Float32Array(n * 3), W: new Float32Array(n).fill(1 / g.mass), rest: L / (n - 1),
    pinA: o.freeA ? null : pts[0].slice(), pinB: o.free ? null : pts[pts.length - 1].slice(),
    hue: o.hue != null ? o.hue : WIRES.hue[gi]++ % g.hues.length, hex: o.hex || null, still: 0, asleep: false };
  let k = 0;
  for (let i = 0; i < n; i++) {
    const s = acc[acc.length - 1] * i / (n - 1);
    while (k < pts.length - 2 && acc[k + 1] < s) k++;
    const u = clamp((s - acc[k]) / ((acc[k + 1] - acc[k]) || 1e-6), 0, 1);
    for (let a = 0; a < 3; a++) c.X[i * 3 + a] = lerp(pts[k][a], pts[k + 1][a], u);
  }
  c.P.set(c.X);
  if (c.pinA) c.W[0] = 0; if (c.pinB) c.W[n - 1] = 0;
  WIRES.cables.push(c);
  return c;
}
function makeCable(gi, a, b, o) {
  o = o || {};
  const dist = v3.dist(a, b), L = o.length || Math.max(0.6, dist * (o.slack || 1.12) + 0.2);
  const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.min(a[2], b[2]) - Math.sqrt(Math.max(0, L * L - dist * dist)) * 0.45];
  return makeCablePath(gi, [a, mid, b], Object.assign({}, o, { slack: L / (v3.dist(a, mid) + v3.dist(mid, b)) }));
}
const cableLen = c => c.rest * (c.n - 1);
// palettes: 'bright' colour-codes by gauge; 'muted' is infrastructure greys and black jackets
const MUTED = [['#aab4ae', '#8f9aa6', '#b8aa8c'], ['#5e5853', '#726a62'], ['#8e8d7a', '#7d847c'], ['#a2a9ae']];
const cableHex = c => c.hex || (WIRES.palette === 'muted' ? MUTED[c.gi][c.hue % MUTED[c.gi].length] : c.g.hues[c.hue % c.g.hues.length]);
function resample(c, m) {
  const n = c.n, acc = [0];
  for (let i = 1; i < n; i++) acc.push(acc[i - 1] + Math.hypot(c.X[i * 3] - c.X[i * 3 - 3], c.X[i * 3 + 1] - c.X[i * 3 - 2], c.X[i * 3 + 2] - c.X[i * 3 - 1]));
  const tot = acc[n - 1] || 1e-6, X = new Float32Array(m * 3), P = new Float32Array(m * 3);
  let j = 0;
  for (let i = 0; i < m; i++) {
    const s = tot * i / (m - 1);
    while (j < n - 2 && acc[j + 1] < s) j++;
    const u = clamp((s - acc[j]) / ((acc[j + 1] - acc[j]) || 1e-6), 0, 1);
    for (let k = 0; k < 3; k++) { X[i * 3 + k] = lerp(c.X[j * 3 + k], c.X[j * 3 + 3 + k], u); P[i * 3 + k] = lerp(c.P[j * 3 + k], c.P[j * 3 + 3 + k], u); }
  }
  const len = cableLen(c);
  for (const t of WIRES.ties) for (const mm of t.m) if (mm.c === c) mm.i = clamp(Math.round(mm.i * (m - 1) / (n - 1)), 0, m - 1);
  c.n = m; c.X = X; c.P = P; c.W = new Float32Array(m).fill(1 / c.g.mass); c.rest = len / (m - 1);
  if (c.pinA) c.W[0] = 0; if (c.pinB) c.W[m - 1] = 0;
}
function setCableLen(c, L) {
  const want = Math.max(4, Math.ceil(L / c.g.seg) + 1);
  if (want > c.n * 1.25 || want < c.n * 0.75) resample(c, want);
  c.rest = L / (c.n - 1);
}
function wake(c) { c.asleep = false; c.still = 0; c.awakeT = 0; }
function removeCable(c) {
  WIRES.cables = WIRES.cables.filter(x => x !== c);
  for (const t of WIRES.ties) t.m = t.m.filter(m => m.c !== c);
  WIRES.ties = WIRES.ties.filter(t => t.m.length);
  WIRES.ties.forEach(t => { if (t.fixed && t.fixed.length !== t.m.length) t.fixed = null; layoutTie(t); });
}
function nearestIdx(c, p) {
  let bi = 0, bd = 1e9;
  for (let i = 0; i < c.n; i++) { const d = (c.X[i * 3] - p[0]) ** 2 + (c.X[i * 3 + 1] - p[1]) ** 2 + (c.X[i * 3 + 2] - p[2]) ** 2; if (d < bd) { bd = d; bi = i; } }
  return bi;
}

// ---------- ties ----------
// A tie holds each member at a slot in the bundle's cross-section. Round ties pack
// members in hex rings around the core (biggest in the middle); flat ties lay them
// side by side, like a ribbon.
const pitchOf = c => Math.max(2 * c.g.r * 1.15, (c.g.px + 1) / 8.5);
function layoutTie(t) {
  const ms = t.m;
  if (t.fixed && t.fixed.length === ms.length) {     // a route-built tie keeps the slots the run was laid with
    ms.forEach((m, j) => { m.off = t.fixed[j].slice(); });
    t.R = Math.max(...ms.map(m => Math.hypot(m.off[0], m.off[1]) + m.c.g.r)); t.w = 2 * t.R;
    ms.forEach(m => wake(m.c)); return;
  }
  if (t.round && ms.length > 2) {
    // keep the wires where they already are around the bundle: inner ones stay inner,
    // and each ring keeps its members' angular order, so runs stay parallel tie to tie
    const p = Math.max(0.11, 2.0 * ms.reduce((s, m) => s + m.c.g.r, 0) / ms.length), ctr = [0, 0, 0];
    ms.forEach(m => { for (let k = 0; k < 3; k++) ctr[k] += m.c.X[m.i * 3 + k] / ms.length; });
    const a = t.axis || [1, 0, 0], b = t.up || [0, 0, 1];
    const loc = ms.map(m => { const d = v3.sub(xAt(m.c, m.i), ctr), u = v3.dot(d, a), v = v3.dot(d, b); return { m, r: Math.hypot(u, v), ang: Math.atan2(v, u) }; });
    loc.sort((x, y) => x.r - y.r);
    const big = loc.reduce((m, q) => q.m.c.g.r > m.m.c.g.r ? q : m, loc[0]);   // the heaviest cable is the core
    loc.splice(loc.indexOf(big), 1); loc.unshift(big);
    let rmax = 0, idx0 = 0, ring = 0;
    while (idx0 < loc.length) {
      const cap = ring === 0 ? 1 : 6 * ring, grp = loc.slice(idx0, idx0 + cap);
      grp.sort((x, y) => x.ang - y.ang);
      const ph = grp[0].ang, n = grp.length;
      grp.forEach((g, j) => { const th = ph + j * Math.PI * 2 / n; g.m.off = ring === 0 ? [0, 0] : [Math.cos(th) * ring * p, Math.sin(th) * ring * p]; rmax = Math.max(rmax, ring * p + g.m.c.g.r); });
      idx0 += cap; ring++;
    }
    t.R = rmax; t.w = 2 * rmax;
  } else if (t.round) {   // two (or one) in a round tie: drawn together until they touch
    const gap = 0.005, w = ms.reduce((s, m) => s + 2 * m.c.g.r + gap, 0);
    let o = -w / 2; for (const m of ms) { const p = 2 * m.c.g.r + gap; m.off = [o + p / 2, 0]; o += p; }
    t.w = w; t.R = Math.max(...ms.map(m => Math.abs(m.off[0]) + m.c.g.r));
  } else {
    t.w = ms.reduce((s, m) => s + pitchOf(m.c), 0);
    let o = -t.w / 2; for (const m of ms) { const p = pitchOf(m.c); m.off = [o + p / 2, 0]; o += p; }
    t.R = Math.max(...ms.map(m => m.c.g.r));
  }
  ms.forEach(m => wake(m.c));
}
// the bundle's frame at a tie: a = across (kept horizontal so ribbons read from above), b = up-ish
function bundleFrame(t, prev) {
  const d = [0, 0, 0];
  for (const m of t.m) { const i = clamp(m.i, 1, m.c.n - 2); for (let k = 0; k < 3; k++) d[k] += m.c.X[(i + 1) * 3 + k] - m.c.X[(i - 1) * 3 + k]; }
  let a = [-d[1], d[0], 0];
  if (Math.hypot(a[0], a[1]) < 0.25 * Math.hypot(d[0], d[1], d[2])) {
    if (prev) a = prev.slice();
    else {   // a steep run has no 'across' of its own: lay the slots the way the cables are already spread
      const T = v3.norm(d), cc = [0, 0, 0]; for (const m of t.m) for (let k = 0; k < 3; k++) cc[k] += m.c.X[m.i * 3 + k] / t.m.length;
      let bl = 0; a = [1, 0, 0];
      for (const m of t.m) { const q = v3.sub(xAt(m.c, m.i), cc), dt = v3.dot(q, T), pq = [q[0] - T[0] * dt, q[1] - T[1] * dt, q[2] - T[2] * dt], l = Math.hypot(...pq); if (l > bl) { bl = l; a = pq; } }
    }
  }
  a = v3.norm(a);
  if (prev && v3.dot(a, prev) < 0) a = [-a[0], -a[1], -a[2]];
  if (prev) a = v3.norm([prev[0] * 0.7 + a[0] * 0.3, prev[1] * 0.7 + a[1] * 0.3, prev[2] * 0.7 + a[2] * 0.3]);
  t.T = v3.norm(d);
  // keep 'up' on the side it was on: on a vertical run up is sideways, and z can't decide it
  let b = v3.norm(v3.cross(v3.norm(d), a)); if (prev && t.up ? v3.dot(b, t.up) < 0 : b[2] < 0) b = [-b[0], -b[1], -b[2]];
  if (!isFinite(b[0])) b = [0, 0, 1];
  t.up = b;
  return a;
}
// a tie grips each cable at its nearest point, not a fixed one: cables slip through it to equilibrium
function slideTie(t) {
  const ctr = tieCenter(t);
  for (const m of t.m) {
    const c = m.c; let lo = 1, hi = c.n - 2;
    for (const o of WIRES.ties) if (o !== t) for (const n of o.m) if (n.c === c) { if (n.i < m.i) lo = Math.max(lo, n.i + 2); else if (n.i > m.i) hi = Math.min(hi, n.i - 2); }
    const dist = i => Math.sqrt((c.X[i * 3] - ctr[0]) ** 2 + (c.X[i * 3 + 1] - ctr[1]) ** 2 + (c.X[i * 3 + 2] - ctr[2]) ** 2);
    let best = m.i, bd = 1e9;
    for (let i = Math.max(lo, m.i - 2); i <= Math.min(hi, m.i + 2); i++) { const d = dist(i); if (d < bd) { bd = d; best = i; } }
    // hysteresis: move only when another particle is clearly nearer, or the tie flips between neighbours
    if (best !== m.i && bd < dist(m.i) - 0.35 * c.rest) m.i = best;
  }
}
function tieCenter(t) {
  if (t.hang) return t.hang;
  let s = 0; const c = [0, 0, 0];
  for (const m of t.m) { const w = m.c.W[m.i], ms = w > 0 ? 1 / w : 1e3; s += ms; for (let k = 0; k < 3; k++) c[k] += m.c.X[m.i * 3 + k] * ms; }
  return [c[0] / s, c[1] / s, c[2] / s];
}
const tieMass = t => t.m.reduce((s, m) => s + m.c.g.mass, 0);
function slotOf(t, m, ctr) { return [ctr[0] + t.axis[0] * m.off[0] + t.up[0] * m.off[1], ctr[1] + t.axis[1] * m.off[0] + t.up[1] * m.off[1], ctr[2] + t.axis[2] * m.off[0] + t.up[2] * m.off[1]]; }
function makeTie(members, o) {
  o = o || {};
  const ctr = [0, 0, 0]; members.forEach(m => { for (let k = 0; k < 3; k++) ctr[k] += m.c.X[m.i * 3 + k] / members.length; });
  // given slots are kept, but centred on the tie itself
  let fixed = null;
  if (o.offs) { const n = o.offs.length, m0 = o.offs.reduce((q, f) => q + f[0], 0) / n, m1 = o.offs.reduce((q, f) => q + f[1], 0) / n; fixed = o.offs.map(f => [f[0] - m0, f[1] - m1]); }
  const t = { id: WIRES.nextId++, m: members, axis: null, up: [0, 0, 1], hang: null, top: null, w: 0, R: 0, ramp: o.instant ? 1 : 0, fixed, round: o.round != null ? o.round : WIRES.round };
  t.axis = bundleFrame(t, null);
  if ((!t.round || members.length <= 2) && !t.fixed) members.sort((p, q) => v3.dot(v3.sub(xAt(p.c, p.i), ctr), t.axis) - v3.dot(v3.sub(xAt(q.c, q.i), ctr), t.axis));
  layoutTie(t); WIRES.ties.push(t);
  members.forEach(m => { m.c.calm = 0.8; });
  return t;
}
function removeTie(t) { WIRES.ties = WIRES.ties.filter(x => x !== t); t.m.forEach(m => wake(m.c)); }
function hangTie(t) {
  const c = tieCenter(t); let top = null;
  for (let z = c[2] + 0.2; z < NL; z += 0.05) if (wsolid(c[0], c[1], z)) { top = [c[0], c[1], z]; break; }
  if (!top) {
    let best = 1e9;
    for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let s = 0.1; s < 5; s += 0.05) if (wsolid(c[0] + d[0] * s, c[1] + d[1] * s, c[2])) { if (s < best) { best = s; top = [c[0] + d[0] * s, c[1] + d[1] * s, c[2]]; } break; }
  }
  t.hang = c; t.top = top; t.m.forEach(m => wake(m.c));
}
function clampTie(t, p) { t.hang = [p[0], p[1], p[2] + t.R]; t.top = null; t.m.forEach(m => wake(m.c)); }
// a cap gathers loose ends; a head is a tie with nothing beyond it but loose tail
const isCap = t => t.m.every(m => m.i === m.c.n - 1 && !m.c.pinB);
function isHead(t) {
  return !isCap(t) && t.m.every(m => !m.c.pinB && !WIRES.ties.some(o => o !== t && !isCap(o) && o.m.some(n => n.c === m.c && n.i > m.i)));
}
// the index a head member pays out from: the nearest tie or pin behind it
function behind(t, m) {
  let i0 = 0;
  for (const o of WIRES.ties) if (o !== t) for (const n of o.m) if (n.c === m.c && n.i < m.i && n.i > i0) i0 = n.i;
  return i0;
}

// runs between consecutive ties on the same cables: the bundle keeps its cross-section
function bundleRuns() {
  const map = new Map();
  for (const c of WIRES.cables) {
    const ts = [];
    for (const t of WIRES.ties) for (const m of t.m) if (m.c === c) ts.push({ t, m });
    ts.sort((a, b) => a.m.i - b.m.i);
    for (let k = 0; k + 1 < ts.length; k++) {
      const A = ts[k], B = ts[k + 1], key = A.t.id + ':' + B.t.id;
      let r = map.get(key); if (!r) { r = { t1: A.t, t2: B.t, pairs: [] }; map.set(key, r); }
      r.pairs.push({ c, a: A.m, b: B.m });
    }
  }
  return [...map.values()].filter(r => r.pairs.length >= 2);
}
// Between two ties each wire is linked to its nearest neighbours in the cross-section by
// tension-only distance constraints: the bundle stays together without fighting itself.
function runLinks(r) {
  const P = r.pairs, links = [];
  for (let j = 0; j < P.length; j++) {
    const oj = P[j].a.off, near = [];
    for (let k = 0; k < P.length; k++) if (k !== j) { const ok = P[k].a.off, ob = P[j].b.off, okb = P[k].b.off; near.push({ k, d: Math.max(Math.hypot(oj[0] - ok[0], oj[1] - ok[1]), Math.hypot(ob[0] - okb[0], ob[1] - okb[1])) }); }
    near.sort((x, y) => x.d - y.d);
    for (const n of near.slice(0, 3)) if (!links.some(l => l[0] === n.k && l[1] === j)) links.push([j, n.k, n.d + 0.04]);
  }
  return links;
}
const LINKS = new Map();   // neighbour links per run, kept across steps (slots don't change)
function cohere(runs, stiff) {
  for (const r of runs) {
    if (r.pairs[0].c.asleep) continue;
    if (!r.links) { const key = r.t1.id + ':' + r.t2.id + ':' + r.pairs.length; r.links = LINKS.get(key); if (!r.links) LINKS.set(key, r.links = runLinks(r)); }
    for (const [j, k, L] of r.links) {
      const A = r.pairs[j], B = r.pairs[k], sa = A.b.i - A.a.i, sb = B.b.i - B.a.i;
      if (sa < 2 || sb < 2 || sa > 400) continue;
      const XA = A.c.X, XB = B.c.X, WA = A.c.W, WB = B.c.W;
      for (let i = A.a.i + 1; i < A.b.i; i++) {
        const ib = Math.round(B.a.i + (i - A.a.i) / sa * sb), wa = WA[i], wb = WB[ib], ws = wa + wb; if (!ws) continue;
        const dx = XB[ib * 3] - XA[i * 3], dy = XB[ib * 3 + 1] - XA[i * 3 + 1], dz = XB[ib * 3 + 2] - XA[i * 3 + 2], d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d <= L) continue;
        const f = (d - L) / d / ws * stiff * Math.min(1, r.t1.ramp, r.t2.ramp);
        XA[i * 3] += dx * f * wa; XA[i * 3 + 1] += dy * f * wa; XA[i * 3 + 2] += dz * f * wa;
        XB[ib * 3] -= dx * f * wb; XB[ib * 3 + 1] -= dy * f * wb; XB[ib * 3 + 2] -= dz * f * wb;
      }
    }
  }
}

// glue: inside a run, each wire is pulled to its slot around the run's centreline
function glue(runs, k) {
  for (const r of runs) {
    const P = r.pairs, np = P.length; if (P[0].c.asleep) continue;
    // the centreline (and mean slot) is sampled once per run and interpolated
    const N = Math.max(2, Math.min(400, ...P.map(pr => pr.b.i - pr.a.i))), SC = new Float64Array((N + 1) * 5);
    for (let q = 0; q <= N; q++) {
      const u = q / N; let cx = 0, cy = 0, cz = 0, m0 = 0, m1 = 0;
      for (const pr of P) {
        const fi = pr.a.i + (pr.b.i - pr.a.i) * u, i0 = Math.floor(fi), i1 = Math.min(pr.c.n - 1, i0 + 1), f = fi - i0, X = pr.c.X;
        cx += X[i0 * 3] + (X[i1 * 3] - X[i0 * 3]) * f; cy += X[i0 * 3 + 1] + (X[i1 * 3 + 1] - X[i0 * 3 + 1]) * f; cz += X[i0 * 3 + 2] + (X[i1 * 3 + 2] - X[i0 * 3 + 2]) * f;
        m0 += lerp(pr.a.off[0], pr.b.off[0], u); m1 += lerp(pr.a.off[1], pr.b.off[1], u);
      }
      SC.set([cx / np, cy / np, cz / np, m0 / np, m1 / np], q * 5);
    }
    // frames carried along the centreline, so a bend or a vertical drop never flips them
    const FR = []; let pa = r.t1.axis, pu = r.t1.up;
    for (let q = 0; q <= N; q++) {
      const a = Math.max(0, q - 1) * 5, b = Math.min(N, q + 1) * 5, T = v3.norm([SC[b] - SC[a], SC[b + 1] - SC[a + 1], SC[b + 2] - SC[a + 2]]), f = carryFrame(T, pa, pu);
      FR.push(f); pa = f.A; pu = f.U;
    }
    for (const pr of P) {
      const span = pr.b.i - pr.a.i; if (span < 2 || span > 400) continue;
      const X = pr.c.X, Wt = pr.c.W, ao = pr.a.off, bo = pr.b.off;
      for (let i = pr.a.i + 1; i < pr.b.i; i++) {
        if (Wt[i] === 0) continue;
        const u = (i - pr.a.i) / span, fq = u * N, q = Math.min(N - 1, Math.floor(fq)), w = fq - q, A = q * 5, B = A + 5, F = FR[Math.min(N, Math.round(fq))];
        const cx = SC[A] + (SC[B] - SC[A]) * w, cy = SC[A + 1] + (SC[B + 1] - SC[A + 1]) * w, cz = SC[A + 2] + (SC[B + 2] - SC[A + 2]) * w;
        const o0 = lerp(ao[0], bo[0], u) - (SC[A + 3] + (SC[B + 3] - SC[A + 3]) * w), o1 = lerp(ao[1], bo[1], u) - (SC[A + 4] + (SC[B + 4] - SC[A + 4]) * w);
        const ku = k * Math.min(1, 6 * u * (1 - u));             // fades out at the ties: there the ties hold the slots
        X[i * 3] += (cx + F.A[0] * o0 + F.U[0] * o1 - X[i * 3]) * ku;
        X[i * 3 + 1] += (cy + F.A[1] * o0 + F.U[1] * o1 - X[i * 3 + 1]) * ku;
        X[i * 3 + 2] += (cz + F.A[2] * o0 + F.U[2] * o1 - X[i * 3 + 2]) * ku;
      }
    }
  }
}

// ---------- posts: supports for carrying bundles over voids ----------
// the working height: half a level under the cut, so what you place stays in view
const workHeight = () => (S.mode === 'cut' && S.level < NL - 1 ? S.level + HT / LH : NL) - 0.5;
function addGirder(a, b) { const g = { a: a.slice(), b: b.slice() }; WIRES.girders.push(g); return g; }
function addMount(p) { const m = { p: p.slice() }; WIRES.mounts.push(m); return m; }
function addPost(x, y, z0, z1) { const p = { x, y, z0, z1 }; WIRES.posts.push(p); WIRES.cables.forEach(wake); return p; }
const postTop = p => [p.x, p.y, p.z1];

// ---------- simulation ----------
const WGRAB = { on: false, c: null, i: -1, tie: null, target: null, goal: null, end: false, ref: null, hung: false };
const LAY = { on: false, c: null, a: null, cur: null, target: null };
let runs0 = [];
function stepWires(dt) {
  const SUB = 4, h = dt / SUB, IT = 10, fe = FEEL[WIRES.feel], CS = WIRES.cables, TS = WIRES.ties;
  for (const t of TS) if (t.m.some(m => !m.c.asleep)) t.m.forEach(m => { if (m.c.asleep) wake(m.c); });
  for (const t of TS) if (!t.m[0].c.asleep) t.axis = bundleFrame(t, t.axis);
  for (const t of TS) if (t.ramp < 1) t.ramp = Math.min(1, t.ramp + dt * 2);
  if (!window.__noslide) for (const t of TS) { if (t.m[0].c.asleep) continue; slideTie(t); }
  for (const c of CS) if (c.calm > 0) c.calm -= dt;
  // a clamped tie holds its bundle on its post or mount: the support doesn't push back there
  for (const c of CS) { if (!c.nearTie || c.nearTie.length !== c.n) c.nearTie = new Uint8Array(c.n); else c.nearTie.fill(0); }
  for (const t of TS) if (t.hang) for (const m of t.m) for (let i = Math.max(0, m.i - 3); i <= Math.min(m.c.n - 1, m.i + 3); i++) m.c.nearTie[i] = 1;
  for (const c of CS) {
    const held = (LAY.on && LAY.c === c) || (WGRAB.on && (WGRAB.c === c || (WGRAB.tie && WGRAB.tie.m.some(m => m.c === c))));
    c.soft = held ? 1 : Math.max(0, (c.soft || 0) - dt * 1.2);
  }
  for (let s = 0; s < SUB; s++) {
    for (const c of CS) {
      if (c.asleep) continue;
      const X = c.X, P = c.P, Wt = c.W, drag = Math.min(0.9995, c.g.drag * fe.drag) * (c.calm > 0 ? 0.94 : 1), VMAX = c.soft > 0 ? 0.12 : 0.035;   // the cable in hand follows the hand
      for (let i = 0; i < c.n; i++) {
        if (Wt[i] === 0) continue;
        const j = i * 3;
        let vx = (X[j] - P[j]) * drag, vy = (X[j + 1] - P[j + 1]) * drag, vz = (X[j + 2] - P[j + 2]) * drag;
        const sp = Math.sqrt(vx * vx + vy * vy + vz * vz); if (sp > VMAX) { const f = VMAX / sp; vx *= f; vy *= f; vz *= f; }   // nothing gets flung
        P[j] = X[j]; P[j + 1] = X[j + 1]; P[j + 2] = X[j + 2]; X[j] += vx; X[j + 1] += vy; X[j + 2] += vz;
        X[j + 2] -= WGRAV * h * h;
      }
      if (c.pinA) { X[0] = c.pinA[0]; X[1] = c.pinA[1]; X[2] = c.pinA[2]; }
      if (c.pinB) { const j = (c.n - 1) * 3; X[j] = c.pinB[0]; X[j + 1] = c.pinB[1]; X[j + 2] = c.pinB[2]; }
      if (!c.lamS || c.lamS.length !== c.n) { c.lamS = new Float32Array(c.n); c.lamB = new Float32Array(c.n); } else { c.lamS.fill(0); c.lamB.fill(0); }
    }
    // dragging is a soft spring whose give grows with the mass being dragged
    if (WGRAB.on && WGRAB.target) {
      if (WGRAB.tie && !WGRAB.hung && WGRAB.mode !== 'slide') {
        const t = WGRAB.tie, f = 1 / (1 + tieMass(t) * 0.2 * fe.grab), d = v3.sub(WGRAB.target, tieCenter(t));
        for (const m of t.m) if (m.c.W[m.i] > 0) for (let k = 0; k < 3; k++) m.c.X[m.i * 3 + k] += d[k] * f;
      } else if (WGRAB.c && WGRAB.c.W[WGRAB.i] > 0) {
        const c = WGRAB.c, f = 1 / (1 + c.g.grab * fe.grab * 0.35);
        for (let k = 0; k < 3; k++) c.X[WGRAB.i * 3 + k] += (WGRAB.target[k] - c.X[WGRAB.i * 3 + k]) * f;
      }
    }
    const runs = s === 0 ? bundleRuns() : runs0; runs0 = runs;
    for (let it = 0; it < IT; it++) {
      if (!window.__nocohere && !(it & 1)) cohere(runs, 0.7);     // every other pass, a little stiffer
      for (const c of CS) {
        if (c.asleep) continue;
        const X = c.X, Wt = c.W, r = c.rest, bs = c.g.stretch * fe.stretch, bb = c.g.bend * fe.bend;   // a cable in hand is the same cable as one attached
        // alternate the sweep direction so a pull travels both ways along the cable in a few passes
        const fwd = !(it & 1);
        for (let q = 0; q < c.n - 1; q++) {
          const i = fwd ? q : c.n - 2 - q;
          const a = i * 3, b = a + 3, wa = Wt[i], wb = Wt[i + 1], ws = wa + wb; if (!ws) continue;
          const dx = X[b] - X[a], dy = X[b + 1] - X[a + 1], dz = X[b + 2] - X[a + 2], len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-9;
          const at = bs * ws, dl = (r - len - at * c.lamS[i]) / (ws + at); c.lamS[i] += dl;
          const nx = dx / len * dl, ny = dy / len * dl, nz = dz / len * dl;
          X[a] -= nx * wa; X[a + 1] -= ny * wa; X[a + 2] -= nz * wa; X[b] += nx * wb; X[b + 1] += ny * wb; X[b + 2] += nz * wb;
        }
        for (let i = 0; i < c.n - 2; i++) {
          const a = i * 3, b = a + 6, wa = Wt[i], wb = Wt[i + 2], ws = wa + wb; if (!ws) continue;
          const dx = X[b] - X[a], dy = X[b + 1] - X[a + 1], dz = X[b + 2] - X[a + 2], len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-9;
          if (len >= 2 * r) continue;
          const at = bb * ws, dl = (2 * r - len - at * c.lamB[i]) / (ws + at); c.lamB[i] += dl;
          const nx = dx / len * dl, ny = dy / len * dl, nz = dz / len * dl;
          X[a] -= nx * wa; X[a + 1] -= ny * wa; X[a + 2] -= nz * wa; X[b] += nx * wb; X[b + 1] += ny * wb; X[b + 2] += nz * wb;
        }
      }
      if (!window.__notie) for (const t of TS) {
        if (t.m[0].c.asleep) continue;
        // slots are centred on the members' (weighted) mean so a tie never pushes its own bundle
        let ctr = tieCenter(t), om = [0, 0];
        if (!t.hang) { let sw = 0; for (const m of t.m) { const w = m.c.W[m.i], ms = w > 0 ? 1 / w : 1e3; sw += ms; om[0] += m.off[0] * ms; om[1] += m.off[1] * ms; } om = [om[0] / sw, om[1] / sw]; }
        ctr = [ctr[0] - t.axis[0] * om[0] - t.up[0] * om[1], ctr[1] - t.axis[1] * om[0] - t.up[1] * om[1], ctr[2] - t.axis[2] * om[0] - t.up[2] * om[1]];
        for (const m of t.m) { const c = m.c; if (c.W[m.i] === 0) continue; const q = slotOf(t, m, ctr), st = 0.7 * Math.min(1, t.ramp);
          { const f = wpush(q[0], q[1], q[2] - c.g.r); if (f) { q[0] = f.p[0]; q[1] = f.p[1]; q[2] = f.p[2] + c.g.r; } }   // a slot inside a floor sits on it instead
          // squeeze across the bundle only: along it, cables stay free to slip through the tie
          const T = t.T || [0, 0, 0], dx = (q[0] - c.X[m.i * 3]) * st, dy = (q[1] - c.X[m.i * 3 + 1]) * st, dz = (q[2] - c.X[m.i * 3 + 2]) * st, al = t.hang ? 0 : dx * T[0] + dy * T[1] + dz * T[2];
          c.X[m.i * 3] += dx - al * T[0]; c.X[m.i * 3 + 1] += dy - al * T[1]; c.X[m.i * 3 + 2] += dz - al * T[2]; }
      }
    }
    if (!window.__noglue && !(s & 1)) glue(runs, 2 * (window.__gk || 0.03) * Math.min(1, ...runs.map(r => Math.min(r.t1.ramp, r.t2.ramp)), 1));
    for (const g of WIRES.girders) if (!g.lo) { g.lo = [0, 1, 2].map(k => Math.min(g.a[k], g.b[k])); g.hi = [0, 1, 2].map(k => Math.max(g.a[k], g.b[k])); }
    for (const c of CS) {                                     // collide, with friction so cables drape and stay put
      if (c.asleep) continue;
      const X = c.X, P = c.P, r = c.g.r, fr = c.g.fric;
      // only the posts and girders near this cable
      const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
      for (let i = 0; i < c.n * 3; i += 3) for (let k = 0; k < 3; k++) { const v = X[i + k]; if (v < lo[k]) lo[k] = v; if (v > hi[k]) hi[k] = v; }
      const m = r + 0.3, posts = WIRES.posts.filter(p => p.x > lo[0] - m && p.x < hi[0] + m && p.y > lo[1] - m && p.y < hi[1] + m && p.z1 + m > lo[2] && p.z0 - m < hi[2]);
      const near = posts.length > 3 ? new Map() : null;                // posts bucketed by cell when there are many
      if (near) for (const p of posts) for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const k = (Math.floor(p.x) + dx) * 4096 + Math.floor(p.y) + dy; let a = near.get(k); if (!a) near.set(k, a = []); a.push(p); }
      const girders = WIRES.girders.filter(g => g.hi[0] > lo[0] - m && g.lo[0] < hi[0] + m && g.hi[1] > lo[1] - m && g.lo[1] < hi[1] + m && g.hi[2] > lo[2] - m && g.lo[2] < hi[2] + m);
      for (let i = 0; i < c.n; i++) {
        if (c.W[i] === 0) continue;
        const j = i * 3;
        let n = null;
        const q = wpush(X[j], X[j + 1], X[j + 2] - r);
        if (q) { X[j] = q.p[0]; X[j + 1] = q.p[1]; X[j + 2] = q.p[2] + r; n = q.n; }
        if (!c.nearTie[i]) for (const p of (near ? near.get(Math.floor(X[j]) * 4096 + Math.floor(X[j + 1])) || [] : posts)) {   // posts: a slim column with a cradle on top
          const dx = X[j] - p.x, dy = X[j + 1] - p.y, rr = Math.sqrt(dx * dx + dy * dy), lim = 0.1 + r;
          if (rr > lim + 0.15 || X[j + 2] < p.z0 || X[j + 2] > p.z1 + r) continue;
          if (X[j + 2] > p.z1 - 0.05 && rr < lim + 0.15) { X[j + 2] = p.z1 + r; n = [0, 0, 1]; }
          else if (rr < lim) { const k = lim / (rr || 1e-6); X[j] = p.x + dx * k; X[j + 1] = p.y + dy * k; n = [dx / (rr || 1), dy / (rr || 1), 0]; }
        }
        if (!c.nearTie[i]) for (const g of girders) {         // girders: thin beams along grid lines
          const a = g.a, ab = g.ab || (g.ab = v3.sub(g.b, g.a)), L2 = v3.dot(ab, ab) || 1, lim = 0.08 + r;
          const u = clamp(((X[j] - a[0]) * ab[0] + (X[j + 1] - a[1]) * ab[1] + (X[j + 2] - a[2]) * ab[2]) / L2, 0, 1);
          const qx = a[0] + ab[0] * u, qy = a[1] + ab[1] * u, qz = a[2] + ab[2] * u, d0 = X[j] - qx, d1 = X[j + 1] - qy, d2 = X[j + 2] - qz;
          if (Math.abs(d0) > lim || Math.abs(d1) > lim || Math.abs(d2) > lim) continue;
          const dl = Math.sqrt(d0 * d0 + d1 * d1 + d2 * d2);
          if (dl < lim && dl > 1e-6) { const k = lim / dl; X[j] = qx + d0 * k; X[j + 1] = qy + d1 * k; X[j + 2] = qz + d2 * k; n = [d0 / dl, d1 / dl, d2 / dl]; }
        }
        if (!n) continue;
        const vx = X[j] - P[j], vy = X[j + 1] - P[j + 1], vz = X[j + 2] - P[j + 2], vn = vx * n[0] + vy * n[1] + vz * n[2];
        // static friction: a slow particle in contact just stops (no resting-contact jitter)
        if (vx * vx + vy * vy + vz * vz < 2e-5) { P[j] = X[j]; P[j + 1] = X[j + 1]; P[j + 2] = X[j + 2]; continue; }
        const keep = 1 - fr, bn = Math.max(0, vn) * 0.1;
        P[j] = X[j] - ((vx - vn * n[0]) * keep + n[0] * bn); P[j + 1] = X[j + 1] - ((vy - vn * n[1]) * keep + n[1] * bn); P[j + 2] = X[j + 2] - ((vz - vn * n[2]) * keep + n[2] * bn);
      }
    }
  }
  if (CS.some(c => !c.asleep)) WIRES.ver = (WIRES.ver || 0) + 1;   // the resting-wires layer is stale
  for (const c of CS) {                                       // cables at rest go to sleep
    if (c.asleep) continue;
    let mx = 0; for (let i = 0; i < c.n * 3; i++) { const d = Math.abs(c.X[i] - c.P[i]); if (d > mx) mx = d; }
    const held = (WGRAB.on && (WGRAB.c === c || (WGRAB.tie && WGRAB.tie.m.some(m => m.c === c)))) || (LAY.on && LAY.c === c);
    if (held) { c.still = 0; c.ref = null; c.awakeT = 0; continue; }
    // still = no drift over the last second; jitter in place doesn't keep a cable awake
    if (!c.ref || c.ref.length !== c.X.length) { c.ref = c.X.slice(); c.still = 0; continue; }
    let dr = 0; for (let i = 0; i < c.n * 3; i++) { const d = Math.abs(c.X[i] - c.ref[i]); if (d > dr) dr = d; }
    // six seconds after anyone touched it, residual creep or a wire caught on a corner no
    // longer keeps it awake: the scene settles
    c.awakeT = (c.awakeT || 0) + dt;
    if (c.awakeT < 6 && (dr > 0.03 || mx > 0.02)) { c.ref.set(c.X); c.still = 0; } else c.still++;
  }
  // tied cables sleep together: a group goes to sleep once all of it has been still
  const grp = new Map(), find = c => { while (grp.get(c) !== c) c = grp.get(c); return c; };
  for (const c of CS) grp.set(c, c);
  for (const t of TS) for (let k = 1; k < t.m.length; k++) { const a = find(t.m[0].c), b = find(t.m[k].c); if (a !== b) grp.set(a, b); }
  const quiet = new Map();
  for (const c of CS) { const r = find(c); quiet.set(r, quiet.get(r) !== false && (c.asleep || c.still > 60)); }
  for (const c of CS) if (!c.asleep && quiet.get(find(c))) c.asleep = true;
}
function jolt() {
  for (const c of WIRES.cables) { wake(c); for (let i = 0; i < c.n; i++) if (c.W[i] > 0) { const ph = Math.sin(i * 0.17 + c.id * 0.3); c.P[i * 3] -= 0.012 * ph; c.P[i * 3 + 2] -= 0.02 * (0.5 + 0.5 * ph); } }
  sfx.click();
}
// a grabbed point can't be pulled further from the cable's fixed points (its pinned ends,
// clamped ties) than the cable reaches: past that the hand slips, the cable doesn't stretch
function reachClamp(c, i, p, movingEnd) {
  const an = [];
  if (c.pinA && !(movingEnd && i === 0)) an.push([c.pinA, i]);
  if (c.pinB && !(movingEnd && i === c.n - 1)) an.push([c.pinB, c.n - 1 - i]);
  for (const t of WIRES.ties) if (t.hang && t !== WGRAB.tie) for (const m of t.m) if (m.c === c) an.push([t.hang, Math.abs(m.i - i)]);
  for (let pass = 0; pass < 3; pass++) for (const [a, k] of an) {
    const R = k * c.rest * 1.01 + 0.02, dx = p[0] - a[0], dy = p[1] - a[1], dz = p[2] - a[2], L = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (L > R) { p[0] = a[0] + dx / L * R; p[1] = a[1] + dy / L * R; p[2] = a[2] + dz / L * R; }
  }
  return p;
}
const layLength = (c, end) => Math.max(0.8, v3.dist(end, LAY.a) * 1.1 + 0.4);
function updateWires(dt) {
  if (LAY.on) {
    const c = LAY.c;
    // the end eases toward where it will land (the anchor under the cursor, if any), and the
    // length is always the one it will keep, so letting go changes nothing
    for (let k = 0; k < 3; k++) LAY.cur[k] += (LAY.target[k] - LAY.cur[k]) * 0.35;
    setCableLen(c, layLength(c, LAY.target));
    c.pinB = LAY.cur.slice(); c.W[c.n - 1] = 0; wake(c);
  }
  for (const c of WIRES.cables) if (c.pinGoal) {      // an end finishing its last bit of travel onto its anchor
    for (let k = 0; k < 3; k++) c.pinB[k] += (c.pinGoal[k] - c.pinB[k]) * 0.35;
    if (v3.dist(c.pinB, c.pinGoal) < 0.005) { c.pinB = c.pinGoal; c.pinGoal = null; }
    wake(c);
  }
  if (WGRAB.on && WGRAB.goal) {
    WGRAB.target = WGRAB.target || WGRAB.goal.slice();
    for (let k = 0; k < 3; k++) WGRAB.target[k] += (WGRAB.goal[k] - WGRAB.target[k]) * 0.5;
    if (WGRAB.c && !WGRAB.tie) reachClamp(WGRAB.c, WGRAB.i, WGRAB.target, WGRAB.end);
    else if (WGRAB.tie && !WGRAB.head) for (const m of WGRAB.tie.m) reachClamp(m.c, m.i, WGRAB.target, false);
    if (WGRAB.end) { const c = WGRAB.c, pin = WGRAB.i === 0 ? c.pinA : c.pinB; for (let k = 0; k < 3; k++) pin[k] += (WGRAB.target[k] - pin[k]) * 0.6; wake(c); }
    if (WGRAB.hung) { const t = WGRAB.tie; for (let k = 0; k < 3; k++) t.hang[k] += (WGRAB.target[k] - t.hang[k]) * 0.3; t.top = null; t.m.forEach(m => wake(m.c)); }
    // pulling a head pays cable out of its loose tail (and takes it back in)
    if (WGRAB.tie && WGRAB.head) for (const m of WGRAB.tie.m) {
      const c = m.c, i0 = behind(WGRAB.tie, m);
      for (let step = 0; step < 3; step++) {
        const need = v3.dist(xAt(c, i0), WGRAB.target) * 1.07 + 0.3, have = (m.i - i0) * c.rest;
        if (need > have && m.i < c.n - 4) m.i++;
        else if (need < have * 0.82 && m.i > i0 + 4) m.i--;
        else break;
      }
    }
  }
  WIRES.acc = (WIRES.acc || 0) + dt;
  let n = 0; while (WIRES.acc >= 1 / 60 && n < 3) { stepWires(1 / 60); WIRES.acc -= 1 / 60; n++; }
  if (n === 3) WIRES.acc = 0;
}

// ---------- anchors (on the lattice) ----------
// The first visible surface under the cursor, looking down from the cut: a cut face, a
// roof or a floor. Snapped to half-cell lattice points (cell corners and edge midpoints).
function wireAnchor(bx, by, gi) {
  const r = GAUGES[gi].r, sliced = S.mode === 'cut' && S.level < NL - 1, z0 = sliced ? S.level : NL - 1;
  for (let z = z0; z >= 0; z--) {
    const tops = (sliced && z === S.level) ? [HT / LH, 0.25] : [1, 0.25];
    for (const hh of tops) {
      const [u, v] = planeAt(bx, by, z + hh), U = Math.floor(u), V = Math.floor(v);
      if (u < 0 || v < 0 || u >= W || v >= D) continue;
      const o = occOf(cellR(U, V, z));
      if (!o) continue;
      const full = o[1] >= 1;
      if (hh === 0.25 ? full : !full) continue;
      const su = clamp(Math.round(u * 2) / 2, U, U + 1), sv = clamp(Math.round(v * 2) / 2, V, V + 1);
      const [x, y] = fromRotF(su, sv);
      return [x, y, z + Math.min(hh, o[1]) + r + 0.02];
    }
  }
  return null;
}
function fromRotF(u, v) {   // continuous inverse of toRotF
  switch (S.rot) { case 1: return [v, D - u]; case 2: return [W - u, D - v]; case 3: return [W - v, u]; default: return [u, v]; }
}
// the world point under a screen point that keeps the iso depth (u+v) of a reference point
function screenAtDepthOf(bx, by, p) {
  const r = toRotF(p[0], p[1]), b = isoBase(), sxy = r[0] + r[1];
  const dd = (bx - b[0]) / 8, z = (sxy * 4 - (by - b[1])) / LH;
  const u = (sxy + dd) / 2, v = (sxy - dd) / 2, [x, y] = fromRotF(u, v);
  return [x, y, z];
}
function screenAtZ(bx, by, z) { const [u, v] = planeAt(bx, by, z), [x, y] = fromRotF(u, v); return [x, y, z]; }
// ---------- slack: Cmd/Ctrl-drag on a cable pays cable in (up) or out (down) ----------
// The ends and any clamped ties stay put; the cable just gets longer or shorter between them
// (ties slide, so the new length finds its own way along). It can't be pulled shorter than
// the straight line through its fixed points.
const SLACK = { on: false, c: null, y0: 0, L0: 0, min: 0 };
function slackMin(c) {
  const fx = [];
  if (c.pinA) fx.push([0, c.pinA]);
  for (const t of WIRES.ties) if (t.hang) for (const m of t.m) if (m.c === c) fx.push([m.i, t.hang]);
  if (c.pinB) fx.push([c.n - 1, c.pinGoal || c.pinB]);
  fx.sort((p, q) => p[0] - q[0]);
  let L = 0; for (let k = 1; k < fx.length; k++) L += v3.dist(fx[k - 1][1], fx[k][1]);
  return Math.max(0.8, L * 1.01);
}
function startSlack(c, by) { Object.assign(SLACK, { on: true, c, y0: by, L0: cableLen(c), min: slackMin(c) }); wake(c); }
function moveSlack(by) {
  const c = SLACK.c, L = Math.max(SLACK.min, SLACK.L0 + (by - SLACK.y0) * 0.04);   // 25 view px per cell of cable
  setCableLen(c, L); wake(c);
}
function endSlack() {
  const c = SLACK.c, d = cableLen(c) - SLACK.L0; SLACK.on = false; SLACK.c = null;
  if (Math.abs(d) > 0.02) log('you', `${d > 0 ? 'Paid out' : 'Took in'} ${Math.abs(d).toFixed(1)} cells of ${c.g.name} (now ${cableLen(c).toFixed(1)})`, 'sys');
}
// ---------- girder tool ----------
// Girders run along grid lines at the working height: drag to lay one along x or y (it snaps
// to the lines), click without dragging to stand a column from the floor below. Option-click
// removes one. A bundle dropped near a girder hangs from a mount under it.
const GDRAG = { on: false, a: null, b: null };
function gridPointAt(bx, by, z) { const [u, v] = planeAt(bx, by, z), [x, y] = fromRotF(u, v); return [clamp(Math.round(x), 0, W), clamp(Math.round(y), 0, D), z]; }
function girderNear(bx, by, rad) {
  let best = null, bd = rad * rad;
  for (const g of WIRES.girders) {
    const A = projIso(...g.a), B = projIso(...g.b), dx = B[0] - A[0], dy = B[1] - A[1], L2 = dx * dx + dy * dy;
    const u = L2 ? clamp(((bx - A[0]) * dx + (by - A[1]) * dy) / L2, 0, 1) : 0, d = (A[0] + dx * u - bx) ** 2 + (A[1] + dy * u - by) ** 2;
    if (d < bd) { bd = d; best = { g, u, p: [lerp(g.a[0], g.b[0], u), lerp(g.a[1], g.b[1], u), lerp(g.a[2], g.b[2], u)] }; }
  }
  return best;
}
const GIRDER_HANG = 0.55;   // a bundle's centre sits this far under the girder it hangs from
function hangFromGirder(t, gn) {
  const p = gn.p;
  clampTie(t, [p[0], p[1], p[2] - GIRDER_HANG - t.R]); t.top = addMount([p[0], p[1], p[2] - 0.08]).p;
}
function postNear(bx, by, rad) {
  let best = null, bd = rad * rad;
  for (const p of WIRES.posts) { const q = projIso(p.x, p.y, p.z1), d = (q[0] - bx) ** 2 + (q[1] - by) ** 2; if (d < bd) { bd = d; best = p; } }
  return best;
}

// ---------- undo ----------
// Snapshots of the wire layer, taken before every edit. Cmd/Ctrl-Z restores the last one.
const UNDO = { past: [], future: [] };
function snapWires() {
  const ci = new Map(WIRES.cables.map((c, k) => [c, k]));
  return {
    cables: WIRES.cables.map(c => ({ gi: c.gi, n: c.n, X: c.X.slice(), W: c.W.slice(), rest: c.rest, pinA: c.pinA && c.pinA.slice(), pinB: c.pinB && c.pinB.slice(), hue: c.hue, hex: c.hex })),
    ties: WIRES.ties.map(t => ({ m: t.m.map(m => ({ c: ci.get(m.c), i: m.i, off: m.off.slice() })), axis: t.axis.slice(), up: t.up.slice(), hang: t.hang && t.hang.slice(), top: t.top && t.top.slice(), w: t.w, R: t.R, round: t.round, fixed: t.fixed })),
    posts: WIRES.posts.map(p => Object.assign({}, p)), girders: WIRES.girders.map(g => ({ a: g.a.slice(), b: g.b.slice() })), mounts: WIRES.mounts.map(m => ({ p: m.p.slice() }))
  };
}
function loadWires(sn) {
  WIRES.cables = sn.cables.map(o => ({ id: WIRES.nextId++, gi: o.gi, g: GAUGES[o.gi], n: o.n, X: o.X.slice(), P: o.X.slice(), W: o.W.slice(), rest: o.rest, pinA: o.pinA && o.pinA.slice(), pinB: o.pinB && o.pinB.slice(), hue: o.hue, hex: o.hex, still: 0, asleep: false }));
  WIRES.ties = sn.ties.map(o => ({ id: WIRES.nextId++, m: o.m.map(m => ({ c: WIRES.cables[m.c], i: m.i, off: m.off.slice() })), axis: o.axis.slice(), up: o.up.slice(), hang: o.hang && o.hang.slice(), top: o.top && o.top.slice(), w: o.w, R: o.R, round: o.round, fixed: o.fixed, ramp: 1 }));
  WIRES.posts = sn.posts.map(p => Object.assign({}, p)); WIRES.girders = sn.girders.map(g => ({ a: g.a.slice(), b: g.b.slice() })); WIRES.mounts = sn.mounts.map(m => ({ p: m.p.slice() }));
  spineCache.key = -1;
}
function pushUndo() { UNDO.past.push(snapWires()); if (UNDO.past.length > 60) UNDO.past.shift(); UNDO.future = []; }
function undoWires(redo) {
  const from = redo ? UNDO.future : UNDO.past, to = redo ? UNDO.past : UNDO.future;
  if (!from.length) { toast(redo ? 'Nothing to redo' : 'Nothing to undo'); return; }
  const e = from.pop();
  if (e.cells) { to.push(undoCells(e)); loadWires(e.wires); }   // a demolition: the cells come back too
  else { to.push(snapWires()); loadWires(e); }
  Object.assign(WGRAB, { on: false, c: null, tie: null }); LAY.on = false; LAY.c = null; WIRES.stroke = null;
  sfx.click();
}

// ---------- gestures ----------
function segX(ax, ay, bx, by, cx, cy, dx, dy) {
  const r1x = bx - ax, r1y = by - ay, r2x = dx - cx, r2y = dy - cy, den = r1x * r2y - r1y * r2x;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((cx - ax) * r2y - (cy - ay) * r2x) / den, u = ((cx - ax) * r1y - (cy - ay) * r1x) / den;
  return (t >= 0 && t <= 1 && u >= 0 && u <= 1) ? [t, u] : null;
}
function wireVisible(z) { return S.mode !== 'cut' || S.level >= NL - 1 || z <= S.level + HT / LH; }
function tieStroke(x0, y0, x1, y1) {
  const members = [];
  for (const c of WIRES.cables) {
    let best = null;
    for (let i = 1; i < c.n - 2; i++) {
      if (!wireVisible(c.X[i * 3 + 2])) continue;
      const A = projIso(c.X[i * 3], c.X[i * 3 + 1], c.X[i * 3 + 2]), B = projIso(c.X[i * 3 + 3], c.X[i * 3 + 4], c.X[i * 3 + 5]);
      const hit = segX(x0, y0, x1, y1, A[0], A[1], B[0], B[1]); if (!hit) continue;
      const zz = c.X[i * 3 + 2];
      if (!best || zz > best.z) best = { c, i: hit[1] < 0.5 ? i : i + 1, z: zz };
    }
    if (!best) continue;
    if (WIRES.ties.some(t => t.m.some(m => m.c === c && Math.abs(m.i - best.i) < 3))) continue;
    members.push({ c: best.c, i: best.i });
  }
  if (!members.length) return null;
  const t = makeTie(members);
  sfx.ghost && sfx.ghost();
  return t;
}
function pickWire(bx, by, rad) {
  let best = null, bd = rad * rad;
  for (const t of WIRES.ties) { const c = tieCenter(t); if (!wireVisible(c[2])) continue; const q = projIso(c[0], c[1], c[2]), d = (q[0] - bx) ** 2 + (q[1] - by) ** 2; if (d < bd * 2) { bd = d / 2; best = { tie: t }; } }
  if (best) return best;
  for (const c of WIRES.cables) for (let i = 0; i < c.n; i++) {
    if (!wireVisible(c.X[i * 3 + 2])) continue;
    const q = projIso(c.X[i * 3], c.X[i * 3 + 1], c.X[i * 3 + 2]), d = (q[0] - bx) ** 2 + (q[1] - by) ** 2;
    if (d < bd) { bd = d; best = { c, i }; }
  }
  return best;
}
// where a tie member may go: between the next ties on its cable, clear of the ends
function tieRange(t, m) {
  const c = m.c; let lo = 1, hi = c.n - 2;
  for (const o of WIRES.ties) if (o !== t) for (const n of o.m) if (n.c === c) { if (n.i < m.i) lo = Math.max(lo, n.i + 3); else if (n.i > m.i) hi = Math.min(hi, n.i - 3); }
  return [lo, hi];
}
// dragging a tie slides it along its bundle to the point nearest the pointer, stopping at the
// next tie either side. Returns false once the pointer is pulled well off the cables: the
// drag then lifts the bundle instead (to drop it on a post, a girder or a ledge).
function slideTieTo(t, bx, by) {
  const ref = t.m[0], c = ref.c, [lo, hi] = tieRange(t, ref), lim = Math.max(6, 24 / S.zoom);
  let best = ref.i, bd = 1e9;
  for (let i = lo; i <= hi; i++) { const q = projIso(c.X[i * 3], c.X[i * 3 + 1], c.X[i * 3 + 2] + c.g.r * 0.6), d = (q[0] - bx) ** 2 + (q[1] - by) ** 2; if (d < bd) { bd = d; best = i; } }
  if (bd > lim * lim) return false;
  if (best === ref.i) return true;
  const p = xAt(c, best);
  for (const m of t.m) {
    const [l, h] = tieRange(t, m); let bi = m.i, bdd = 1e9;
    for (let i = l; i <= h; i++) { const d = v3.dist(xAt(m.c, i), p); if (d < bdd) { bdd = d; bi = i; } }
    m.i = bi; wake(m.c);
  }
  return true;
}
function grabTie(t) {
  // picking up a clamped head leaves a clamp behind and carries the head on
  if (t.hang && isHead(t)) {
    const keep = { id: WIRES.nextId++, m: t.m.map(m => ({ c: m.c, i: m.i, off: m.off })), axis: t.axis, up: t.up, hang: t.hang, top: t.top, w: t.w, R: t.R, round: t.round };
    WIRES.ties.push(keep);
    for (const m of t.m) m.i = Math.min(m.c.n - 4, m.i + 3);
    t.hang = null; t.top = null;
  }
  const p = tieCenter(t);
  // a free tie slides along its cables; a clamped one or a bundle head is carried
  Object.assign(WGRAB, { on: true, tie: t, c: null, i: -1, end: false, hung: !!t.hang, head: isHead(t), ref: p, goal: p.slice(), target: p.slice(), mode: t.hang || isHead(t) ? 'carry' : 'slide' });
  t.m.forEach(m => wake(m.c));
}
// pointer hooks, called from input; return true when the wire layer took the gesture
function wireDown(bx, by, e) {
  if (S.mode !== 'cut') return false;
  birdsStartle(bx, by);
  pushUndo();
  if (e.altKey) { const pc = pickWire(bx, by, 5); if (pc) { pc.tie ? removeTie(pc.tie) : removeCable(pc.c); return true; } }
  if (S.tool === 'tie' && !e.shiftKey) { const pt = pickWire(bx, by, 5); if (pt && pt.tie) { if (e.detail >= 2) { pt.tie.hang ? (pt.tie.hang = null, pt.tie.top = null, pt.tie.m.forEach(m => wake(m.c))) : hangTie(pt.tie); return true; } grabTie(pt.tie); return true; } }
  if (S.tool === 'tie' || (e.shiftKey && S.tool !== 'inspect' && S.tool !== 'demolish')) { WIRES.stroke = { x0: bx, y0: by, x1: bx, y1: by }; return true; }
  if (S.tool === 'girder') {
    if (e.altKey) { const gn = girderNear(bx, by, 6); if (gn) { WIRES.girders = WIRES.girders.filter(g => g !== gn.g); WIRES.cables.forEach(wake); sfx.click(); } return true; }
    const a = gridPointAt(bx, by, workHeight()); GDRAG.on = true; GDRAG.a = a; GDRAG.b = a.slice(); return true;
  }
  if (S.tool === 'post') {
    // a post stands at the working height and drops to whatever is below it
    const top = workHeight(), [u, v] = planeAt(bx, by, top), [x, y] = fromRotF(Math.round(u * 2) / 2, Math.round(v * 2) / 2);
    if (x < 0 || y < 0 || x >= W || y >= D || wsolid(x, y, top)) { toast('A post needs open air at the working height'); return true; }
    let z0 = top; while (z0 > 0 && !wsolid(x, y, z0 - 0.05)) z0 -= 0.05;
    addPost(x, y, z0, top); sfx.click();
    log('you', `Post at ${x},${y}: ${lvCode(Math.floor(z0))} up to ${lvCode(Math.floor(top))}, ${(top - z0).toFixed(1)} levels`, 'sys');
    return true;
  }
  const pc = pickWire(bx, by, 5);
  if ((e.metaKey || e.ctrlKey) && pc && pc.c) { startSlack(pc.c, by); return true; }
  if (S.tool === 'tie' || S.tool === 'cable' || S.tool === 'inspect') {
    if (pc && e.altKey) { pc.tie ? removeTie(pc.tie) : removeCable(pc.c); return true; }
    if (pc && pc.tie && e.detail >= 2) { pc.tie.hang ? (pc.tie.hang = null, pc.tie.top = null, pc.tie.m.forEach(m => wake(m.c))) : hangTie(pc.tie); return true; }
    if (pc && pc.tie) { grabTie(pc.tie); return true; }
    if (pc) {
      const p = xAt(pc.c, pc.i), end = pc.i === 0 || pc.i === pc.c.n - 1;
      Object.assign(WGRAB, { on: true, tie: null, c: pc.c, i: pc.i, end, hung: false, head: false, ref: p, goal: p.slice(), target: p.slice() });
      if (end) { const c = pc.c; if (pc.i === 0) c.pinA = c.pinA || p.slice(); else c.pinB = c.pinB || p.slice(); c.W[pc.i] = 0; }
      wake(pc.c);
      return true;
    }
  }
  if (S.tool === 'cable') {
    const a = wireAnchor(bx, by, WIRES.gauge);
    if (!a) { UNDO.past.pop(); toast('Nothing to anchor to there'); return true; }
    const c = makeCable(WIRES.gauge, a, [a[0] + 0.1, a[1] + 0.1, a[2]], { length: 0.8 });
    c.pinB = a.slice();
    Object.assign(LAY, { on: true, c, a, cur: a.slice(), target: a.slice() });
    sfx.click();
    return true;
  }
  return false;
}
function wireMove(bx, by) {
  WIRES.ptr = [bx, by];
  if (WIRES.stroke) { WIRES.stroke.x1 = bx; WIRES.stroke.y1 = by; return true; }
  if (LAY.on) { LAY.hint = wireAnchor(bx, by, LAY.c.gi); LAY.target = LAY.hint || screenAtZ(bx, by, LAY.a[2]); return true; }
  if (SLACK.on) { moveSlack(by); return true; }
  if (GDRAG.on) { const p = gridPointAt(bx, by, GDRAG.a[2]), a = GDRAG.a; GDRAG.b = Math.abs(p[0] - a[0]) >= Math.abs(p[1] - a[1]) ? [p[0], a[1], a[2]] : [a[0], p[1], a[2]]; return true; }
  if (WGRAB.on && WGRAB.tie && WGRAB.mode === 'slide') { if (slideTieTo(WGRAB.tie, bx, by)) return true; WGRAB.mode = 'carry'; }
  if (WGRAB.on) {
    const post = WGRAB.tie && postNear(bx, by, 7), gn = WGRAB.tie && !post && girderNear(bx, by, 7);
    WGRAB.goal = post ? [post.x, post.y, post.z1 + WGRAB.tie.R] : gn ? [gn.p[0], gn.p[1], gn.p[2] - GIRDER_HANG] : (WGRAB.end && wireAnchor(bx, by, WGRAB.c.gi)) || screenAtDepthOf(bx, by, WGRAB.ref);
    return true;
  }
  return false;
}
function wireUp(bx, by) {
  if (WIRES.stroke) { const s = WIRES.stroke; WIRES.stroke = null; if (Math.hypot(s.x1 - s.x0, s.y1 - s.y0) <= 2) { const pc = pickWire(bx, by, 5); if (pc && pc.tie) { removeTie(pc.tie); log('you', 'Snipped a tie', 'sys'); } return true; } if (true) { const t = tieStroke(s.x0, s.y0, s.x1, s.y1); if (t) log('you', `Tied ${t.m.length} cable${t.m.length > 1 ? 's' : ''} into a ${t.round ? 'round bundle' : 'ribbon'} (${tieMass(t).toFixed(1)} t/m)`, 'sys'); } return true; }
  if (SLACK.on) { endSlack(); return true; }
  if (GDRAG.on) {
    GDRAG.on = false; const a = GDRAG.a, b = GDRAG.b;
    if (v3.dist(a, b) >= 1) { addGirder(a, b); log('you', `Girder ${v3.dist(a, b)} cells along ${a[0] === b[0] ? 'y' : 'x'} at ${lvCode(Math.floor(a[2]))}`, 'sys'); }
    else {   // a column: from whatever is below up to the working height
      let z0 = a[2]; while (z0 > 0 && !wsolid(a[0] + 0.01, a[1] + 0.01, z0 - 0.05)) z0 -= 0.05;
      if (a[2] - z0 > 0.3) addGirder([a[0], a[1], z0], a);
    }
    WIRES.cables.forEach(wake); sfx.click();
    return true;
  }
  if (LAY.on) {
    const c = LAY.c, b = wireAnchor(bx, by, c.gi); LAY.on = false; LAY.c = null;
    setCableLen(c, layLength(c, b || LAY.target));
    if (b) c.pinGoal = b;                                   // the end eases the rest of the way onto it
    else { c.pinB = null; c.W[c.n - 1] = 1 / c.g.mass; }
    wake(c); sfx.click();
    return true;
  }
  if (WGRAB.on) {
    if (WGRAB.end) {
      const c = WGRAB.c, b = wireAnchor(bx, by, c.gi), atA = WGRAB.i === 0;
      if (b) { if (atA) c.pinA = b; else c.pinB = b; c.W[WGRAB.i] = 0; }
      else { if (atA) c.pinA = null; else c.pinB = null; c.W[WGRAB.i] = 1 / c.g.mass; }
      wake(c);
    }
    if (WGRAB.tie && WGRAB.mode !== 'slide') {
      const t = WGRAB.tie, post = postNear(bx, by, 7), gn = !post && girderNear(bx, by, 7), ctr = tieCenter(t);
      if (post) { clampTie(t, postTop(post)); sfx.click(); }
      else if (gn) { hangFromGirder(t, gn); sfx.click(); }
      else if (WGRAB.hung) hangTie(t);
      else {   // set it down on a ledge at about its own height
        const a = wireAnchor(bx, by, 0);
        if (a && Math.abs(a[2] - ctr[2]) < 1.6) { clampTie(t, a); sfx.click(); }
      }
    }
    Object.assign(WGRAB, { on: false, c: null, tie: null, end: false, hung: false, head: false, goal: null, target: null });
    return true;
  }
  return false;
}
function wireHover(bx, by) {
  if (S.mode !== 'cut' || LAY.on || WGRAB.on || WIRES.stroke) return null;
  const pc = pickWire(bx, by, 5);
  if (pc && pc.tie) return `<b>${isHead(pc.tie) ? 'bundle head' : pc.tie.round ? 'tie' : 'ribbon tie'}</b> · ${pc.tie.m.length} cable${pc.tie.m.length > 1 ? 's' : ''} · ${tieMass(pc.tie).toFixed(1)} t/m${pc.tie.hang ? ' · clamped' : ''}${isHead(pc.tie) ? ' · drag to pay out' : pc.tie.hang ? '' : ' · drag to slide, pull off to lift · ⌥-click removes'}`;
  if (pc) return `<b>${pc.c.g.name}</b> · ${cableLen(pc.c).toFixed(1)} cells${(pc.i === 0 || pc.i === pc.c.n - 1) ? ' · end' : ''} · ⌘-drag ↑↓ slack`;
  if (S.tool === 'post') return '<b>post</b> · click a floor to stand a support up to the working height';
  if (S.tool === 'girder') return '<b>girder</b> · drag along a grid line · click for a column · Option-click removes';
  return null;
}

// ---------- the staged scene ----------
// Geometry: four open voids in two rows, a service gallery along a grid line north of
// them, a spur deck from the gallery to the first void's near lip. Each void has a near
// lip and a short far balcony at LT, a low west ledge (LW) and a high east ledge (LE).
// The stage itself is the first void (so single-void presets keep working); st.voids
// holds one sub-stage per void.
const VOIDS = [[6, 24], [36, 24], [6, 44], [36, 44]], VW = 24, VD = 8;
function buildStageGeometry() {
  const LT = 10, LW = 6, LE = LT;
  const deck = (x, y) => { if (coreAt(x, y) || !inb(x, y, LT)) return; setC(x, y, LT, T.DECK, 0); for (let z = LT + 1; z < Math.min(NL, LT + 3); z++) setC(x, y, z, T.EMPTY); };
  const ledge = (x, y, z) => { if (coreAt(x, y)) return; setC(x, y, z, T.DECK, 0); for (let k = z + 1; k < Math.min(NL, z + 3); k++) setC(x, y, k, T.EMPTY); };
  const Vs = VOIDS.map(([x0, y0]) => ({ x0, y0, x1: x0 + VW, y1: y0 + VD }));
  for (const V of Vs) {
    for (let z = 3; z < NL; z++) for (let y = V.y0; y < V.y1; y++) for (let x = V.x0; x < V.x1; x++) if (!coreAt(x, y)) setC(x, y, z, T.EMPTY);
    for (let y = V.y0; y < V.y1; y++) for (let x = V.x0; x < V.x1; x++) if (!coreAt(x, y)) setC(x, y, 2, T.WATER);
  }
  const V = Vs[0];
  let YT = V.y0 - 4;
  const XA = clamp(V.x0 - 4, 1, W - 2), XB = clamp(Vs[1].x1 + 1, 1, W - 2);
  for (let y = V.y0 - 4; y >= 3; y--) { let ok = true; for (let x = XA; x <= XB && ok; x++) if (coreAt(x, y) || coreAt(x, y + 1)) ok = false; if (ok) { YT = y; break; } }
  const XO = V.x0 + 3;
  for (let x = XA; x <= XB; x++) { deck(x, YT); deck(x, YT + 1); }
  for (let y = YT; y < V.y0; y++) { deck(XO, y); deck(XO + 1, y); }
  for (const U of Vs) {
    for (let x = U.x0 + 3; x < U.x0 + 10; x++) deck(x, U.y1);              // a short far balcony
    for (let x = U.x0 - 1; x <= U.x1; x++) deck(x, U.y0 - 1);                 // near lip
    for (let y = U.y0 + 1; y < U.y1 - 1; y++) { ledge(U.x0, y, LW); ledge(U.x1 - 1, y, LE); }
  }
  computeLight(); computeFill();
  const base = { YT, XO, XA, XB, LT, LW, LE, view: LT + 1, zf: LT + 0.25 };
  const st = Object.assign({ V, focus: [(V.x0 + Vs[1].x1) / 2, V.y0 + 6, LT - 0.5] }, base);
  st.voids = Vs.map(U => Object.assign({ V: U }, base));
  return st;
}
// the main trunk on stands along the gallery, and a branch turning off at 90° that ends in
// a socket panel at the void's lip
function presetTrunk(st) {
  const { V, YT, XO, XA, XB, zf } = st, zs = zf + 0.37, y0 = YT + 0.5, xo = XO + 0.5;
  const standsX = []; for (let x = XA + 1; x <= XB - 1; x += 3) standsX.push(x + 0.5);
  if (!standsX.some(x => Math.abs(x - xo) < 0.6)) { standsX.push(xo); standsX.sort((a, b) => a - b); }
  const stands = standsX.map(x => addPost(x, y0, zf, zs));
  const spur = []; for (let y = y0 + 3; y < V.y0 - 1.5; y += 3) spur.push(addPost(xo, y, zf, zs));
  const zT = zs + 0.32, a = [XA + 0.2, y0, zT], b = [XB - 0.2, y0, zT];
  const trunk = [0, 0, 0, 1, 0, 1, 0, 2, 0, 1].map((g, k) => makeCablePath(g, [a, b], { slack: 1.01, hue: k % 3 }));
  const branch = [0, 0, 1, 0, 1].map((g, k) => {
    const end = [xo - 1 + k * 0.5, V.y0 - 0.9, zf + GAUGES[g].r + 0.02];
    return makeCablePath(g, [a, [xo, y0, zT], [xo, V.y0 - 2, zT], [end[0], V.y0 - 1.4, zf + 0.5], end], { slack: 1.02, hue: (k + 1) % 3 });
  });
  for (let s = 0; s < 60; s++) stepWires(1 / 60);
  for (const p of stands) {
    const ms = trunk.map(c => ({ c, i: nearestIdx(c, postTop(p)) }));
    if (p.x <= xo + 0.01) branch.forEach(c => ms.push({ c, i: nearestIdx(c, [p.x, p.y, zT]) }));
    clampTie(makeTie(ms, { round: true }), postTop(p));
  }
  for (const p of spur) clampTie(makeTie(branch.map(c => ({ c, i: nearestIdx(c, [p.x, p.y, zT]) })), { round: true }), postTop(p));
  return { trunk, branch };
}
function settle(n) { for (let s = 0; s < (n || 400); s++) stepWires(1 / 60); }
function clearWires() { spineCache.key = -1; WIRES.cables = []; WIRES.ties = []; WIRES.posts = []; WIRES.girders = []; WIRES.mounts = []; WIRES.hue = [0, 0, 0, 0]; }
function seedWires() {
  clearWires();
  WIRES.stage = buildStageGeometry();
  if (typeof defaultScene === 'function') { defaultScene(WIRES.stage); settle(150); } else { presetTrunk(WIRES.stage); settle(400); }
  if (typeof initBirds === 'function') initBirds();
  markAllDirty(); skyDirty = true; stripDirty = true;
}

// ---------- drawing ----------
// a cable is a pixel tube: highlight on top (top-face tone), body (left-face tone),
// shadow (right-face tone), dark outline once it is 3 px or wider
const WPAL = new Map();
function wpal(hex, q) {
  const fog = Math.round((WIRES.mist || 0) * 20), key = hex + S.tod + q + ':' + fog + (fog ? LIT.sun : ''); let p = WPAL.get(key);
  if (!p) {
    const hi = mixHex(hex, '#ffffff', 0.28); p = [shadeRGB(hi, 't', q), shadeRGB(hex, 'l', q), shadeRGB(hex, 'r', q), shadeRGB(mixHex(hex, '#000000', 0.78), 'l', q)];
    if (fog) { const mc = mistRGB(), f = fog / 20; p = p.map(s => { const c = s.match(/\d+/g).map(Number); return `rgb(${c.map((v, k) => Math.round(lerp(v, mc[k], f))).join(',')})`; }); }
    WPAL.set(key, p);
  }
  return p;
}
function tubeProfile(w, outline) {
  let inner;
  if (w <= 1) inner = [1]; else if (w === 2) inner = [0, 1]; else if (w === 3) inner = [0, 1, 2];
  else { inner = [0]; while (inner.length < w - 1) inner.push(1); inner.push(2); }
  return outline ? [3, ...inner, 3] : inner;
}
function wq(x, y, z) {
  const cx = clamp(Math.floor(x), 0, W - 1), cy = clamp(Math.floor(y), 0, D - 1), cz = clamp(Math.floor(z + 0.5), 0, NL - 1);
  if (LIT.on) return wireLightQ(x, y, z);
  return Math.max(lightQ(idx(cx, cy, cz)), S.lightFloor || 0);
}
function tubeSeg(ctx, a, b, prof, pal) {
  const dx = b[0] - a[0], dy = b[1] - a[1], n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
  const horiz = Math.abs(dx) >= Math.abs(dy), half = (prof.length - 1) / 2;
  let lastCol = null;
  for (let s = 0; s <= n; s++) {
    const t = s / n, x = a[0] + dx * t, y = a[1] + dy * t;
    if (horiz) { const px = Math.floor(x), y0 = Math.round(y - half - 0.5); for (let j = 0; j < prof.length; j++) { if (!wdt(px, y0 + j)) continue; const c = pal[prof[j]]; if (c !== lastCol) { ctx.fillStyle = c; lastCol = c; } ctx.fillRect(px, y0 + j, 1, 1); } }
    else { const py = Math.floor(y), x0 = Math.round(x - half - 0.5); for (let j = 0; j < prof.length; j++) { if (!wdt(x0 + j, py)) continue; const c = pal[prof[j]]; if (c !== lastCol) { ctx.fillStyle = c; lastCol = c; } ctx.fillRect(x0 + j, py, 1, 1); } }
  }
}
function sleeveRuns() {
  const runs = [], seen = new Set();
  if (!WIRES.sleeve) return runs;
  for (const c of WIRES.cables) {
    const ts = WIRES.ties.filter(t => t.m.some(m => m.c === c)).map(t => ({ t, i: t.m.find(m => m.c === c).i })).sort((a, b) => a.i - b.i);
    for (let k = 0; k + 1 < ts.length; k++) {
      const t1 = ts[k].t, t2 = ts[k + 1].t, key = Math.min(t1.id, t2.id) + ':' + Math.max(t1.id, t2.id);
      if (seen.has(key)) continue; seen.add(key);
      if (t1.m.length < 2 || t1.m.length !== t2.m.length || !t1.m.every(m => t2.m.some(n => n.c === m.c))) continue;
      runs.push({ t1, t2, pairs: t1.m.map(m => ({ c: m.c, a: m.i, b: t2.m.find(n => n.c === m.c).i })) });
    }
  }
  return runs;
}
function sleevePath(run) {
  const pts = [], N = 20;
  for (let s = 0; s <= N; s++) {
    const u = s / N, ctr = [0, 0, 0];
    for (const pr of run.pairs) {
      const fi = lerp(pr.a, pr.b, u), i0 = Math.floor(fi), i1 = Math.min(pr.c.n - 1, i0 + 1), f = fi - i0;
      for (let k = 0; k < 3; k++) ctr[k] += lerp(pr.c.X[i0 * 3 + k], pr.c.X[i1 * 3 + k], f) / run.pairs.length;
    }
    pts.push(ctr);
  }
  return pts;
}
const depthKey = (x, y, z) => { const r = toRotF(x, y); return (r[0] + r[1]) * 1.5 + z; };
// everything whose midpoint sits in level z is drawn right after that level's image,
// back to front, so a round bundle reads as a cylinder of wires
// ---------- bundles as one thing ----------
// Between two ties a bundle has a spine: the smoothed centreline of its wires. Every wire in
// the run is drawn at its slot around the spine, so wires in a bundle stay parallel and the
// bundle keeps one cross-section along its length, whatever the individual particles do.
// a frame carried from the previous one: across stays across, up stays on its side, and it
// eases to the horizontal-across convention (the ties' own) wherever the run isn't steep
function carryFrame(T, pA, pU) {
  const tA = v3.norm([pA[0] - T[0] * v3.dot(pA, T), pA[1] - T[1] * v3.dot(pA, T), pA[2] - T[2] * v3.dot(pA, T)]);
  let h = [-T[1], T[0], 0]; const hl = Math.hypot(h[0], h[1]), w = clamp((hl - 0.2) / 0.3, 0, 1);
  if (hl > 1e-6) { h = [h[0] / hl, h[1] / hl, 0]; if (v3.dot(h, tA) < 0) h = [-h[0], -h[1], 0]; } else h = tA;
  let A = v3.norm([tA[0] * (1 - w) + h[0] * w, tA[1] * (1 - w) + h[1] * w, tA[2] * (1 - w) + h[2] * w]);
  if (!isFinite(A[0])) A = tA;
  let U = v3.norm(v3.cross(T, A)); if (v3.dot(U, pU) < 0) U = [-U[0], -U[1], -U[2]];
  return { A, U };
}
function frameAt(T, prevA) {
  let A = [-T[1], T[0], 0];
  if (Math.hypot(A[0], A[1]) < 0.3) A = prevA ? prevA.slice() : [1, 0, 0];
  A = v3.norm(A); if (prevA && v3.dot(A, prevA) < 0) A = [-A[0], -A[1], -A[2]];
  let U = v3.norm(v3.cross(T, A)); if (U[2] < 0) U = [-U[0], -U[1], -U[2]];
  return { A, U };
}
const memberAt = (pr, u) => { const fi = lerp(pr.a.i, pr.b.i, u), i0 = Math.floor(fi), i1 = Math.min(pr.c.n - 1, i0 + 1), f = fi - i0, X = pr.c.X; return [lerp(X[i0 * 3], X[i1 * 3], f), lerp(X[i0 * 3 + 1], X[i1 * 3 + 1], f), lerp(X[i0 * 3 + 2], X[i1 * 3 + 2], f)]; };
function buildSpine(r) {
  const P = r.pairs, N = clamp(Math.max(...P.map(p => p.b.i - p.a.i)), 4, 60), pts = [];
  for (let s = 0; s <= N; s++) { const u = s / N, c = [0, 0, 0]; for (const pr of P) { const x = memberAt(pr, u); for (let k = 0; k < 3; k++) c[k] += x[k] / P.length; } pts.push(c); }
  for (let pass = 0; pass < 3; pass++) for (let s = 1; s < N; s++) for (let k = 0; k < 3; k++) pts[s][k] = (pts[s - 1][k] + 2 * pts[s][k] + pts[s + 1][k]) / 4;
  const F = []; let prevA = r.t1.axis;
  for (let s = 0; s <= N; s++) { const T = v3.norm(v3.sub(pts[Math.min(N, s + 1)], pts[Math.max(0, s - 1)])); const f = frameAt(T, prevA); F.push(f); prevA = f.A; }
  // the centroid sits at the mean slot; move the spine to the bundle's axis
  const offs = P.map(pr => { const o = []; for (let s = 0; s <= N; s++) { const u = s / N; o.push([lerp(pr.a.off[0], pr.b.off[0], u), lerp(pr.a.off[1], pr.b.off[1], u)]); } return o; });
  for (let s = 0; s <= N; s++) { let m0 = 0, m1 = 0; for (const o of offs) { m0 += o[s][0] / P.length; m1 += o[s][1] / P.length; } for (let k = 0; k < 3; k++) pts[s][k] -= F[s].A[k] * m0 + F[s].U[k] * m1; }
  const R = []; for (let s = 0; s <= N; s++) R.push(Math.max(...P.map((pr, j) => Math.hypot(offs[j][s][0], offs[j][s][1]) + pr.c.g.r)));
  const Wpx = [];
  for (let s = 0; s <= N; s++) {
    const p = pts[s], f = F[s], qa = projIso(...pts[Math.max(0, s - 1)]), qb = projIso(...pts[Math.min(N, s + 1)]);
    let tx = qb[0] - qa[0], ty = qb[1] - qa[1]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    let lo = 1e9, hi = -1e9; const q0 = projIso(...p);
    for (let j = 0; j < 12; j++) { const th = j / 12 * Math.PI * 2, ca = Math.cos(th) * R[s], sa = Math.sin(th) * R[s], q = projIso(p[0] + f.A[0] * ca + f.U[0] * sa, p[1] + f.A[1] * ca + f.U[1] * sa, p[2] + f.A[2] * ca + f.U[2] * sa); const d = -(q[0] - q0[0]) * ty + (q[1] - q0[1]) * tx; lo = Math.min(lo, d); hi = Math.max(hi, d); }
    Wpx.push(Math.max(3, Math.round(hi - lo) + 1));
  }
  const pos = (j, s) => { const o = offs[j][s], f = F[s], p = pts[s]; return [p[0] + f.A[0] * o[0] + f.U[0] * o[1], p[1] + f.A[1] * o[0] + f.U[1] * o[1], p[2] + f.A[2] * o[0] + f.U[2] * o[1]]; };
  return { r, N, pts, F, offs, R, Wpx, pos, round: r.t1.round && r.t2.round };
}
let spineCache = { key: -1, list: [] };
function spines() {
  const key = S.time;
  if (spineCache.key !== key) spineCache = { key, list: bundleRuns().map(buildSpine) };
  return spineCache.list;
}
const deepC = new Map();
const rgbHex = c => { const m = c.match(/\d+/g); return m && c[0] !== '#' ? hexOf(+m[0], +m[1], +m[2]) : c; };
const deep = pal => { let d = deepC.get(pal); if (!d) { d = mixHex(rgbHex(pal[2]), rgbHex(pal[3]), 0.5); deepC.set(pal, d); } return d; };
// a pixel tube whose rows are given per column: rowsFn(j) -> colour
function tubeRows(ctx, a, b, w, colAt) {
  const dx = b[0] - a[0], dy = b[1] - a[1], n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
  const horiz = Math.abs(dx) >= Math.abs(dy), half = (w - 1) / 2;
  let last = null;
  for (let s = 0; s <= n; s++) {
    const t = s / n, x = a[0] + dx * t, y = a[1] + dy * t;
    for (let j = 0; j < w; j++) {
      const c = colAt(j, t); if (!c) continue;
      if (c !== last) { ctx.fillStyle = c; last = c; }
      const X = horiz ? Math.floor(x) : Math.round(x - half - 0.5) + j, Y = horiz ? Math.round(y - half - 0.5) + j : Math.floor(y);
      if (wdt(X, Y)) ctx.fillRect(X, Y, 1, 1);
    }
  }
}
const RW = (ctx, x, y, w, h, c) => { ctx.fillStyle = c; for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (wdt(xx, yy)) ctx.fillRect(xx, yy, 1, 1); };
// ---------- highlight: making what's under the pointer (or in hand) unmistakable ----------
// 'amber' recolours it in place (the original). The others draw just that cable or tie into an
// overlay each frame and treat it: a soft glow, a 1-px outline, a brightening, a pulsing
// outline, or dimming everything else.
const HL_STYLES = ['amber', 'glow', 'outline', 'outline-amber', 'bright', 'pulse', 'dim', 'glow-outline'];
const HLC = { c: null, g: null, t: null, tg: null };
function hlTarget() {
  if (WIRES.hover) return WIRES.hover.tie ? { tie: WIRES.hover.tie } : { c: WIRES.hover.c };
  if (WGRAB.on) return WGRAB.tie ? { tie: WGRAB.tie } : WGRAB.c ? { c: WGRAB.c } : null;
  if (LAY.on && LAY.c) return { c: LAY.c };
  return null;
}
function hlMatch(sg) {
  const O = WIRES.only;
  if (O.c) return sg.c === O.c || sg.sock === O.c || (sg.tube && sg.tube.r.pairs.some(pr => pr.c === O.c));
  return !!O.tie && sg.band === O.tie;
}
function drawWireHighlight(ctx, floor, t) {
  const style = WIRES.hl || 'amber', target = hlTarget();
  if (style === 'amber' || !target) return;
  const w = S.bw, h = S.bh;
  if (!HLC.c || HLC.c.width !== w || HLC.c.height !== h) { HLC.c = mk(w, h); HLC.g = HLC.c.getContext('2d'); HLC.t = mk(w, h); HLC.tg = HLC.t.getContext('2d'); }
  const g = HLC.g; g.clearRect(0, 0, w, h);
  WIRES.only = target;
  try { for (let z = floor || 0; z < NL; z++) drawWiresLevel(g, z); } finally { WIRES.only = null; }
  const tint = col => { const tg = HLC.tg; tg.globalCompositeOperation = 'source-over'; tg.clearRect(0, 0, w, h); tg.drawImage(HLC.c, 0, 0); tg.globalCompositeOperation = 'source-in'; tg.fillStyle = col; tg.fillRect(0, 0, w, h); tg.globalCompositeOperation = 'source-over'; return HLC.t; };
  const outline = (col, a) => { const o = tint(col); ctx.globalAlpha = a; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) ctx.drawImage(o, dx, dy); ctx.globalAlpha = 1; ctx.drawImage(HLC.c, 0, 0); };
  const glow = (a) => { const o = tint('#ffc062'); ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.filter = 'blur(2px)'; ctx.globalAlpha = 0.85 * a; ctx.drawImage(o, 0, 0); ctx.filter = 'blur(5px)'; ctx.globalAlpha = 0.55 * a; ctx.drawImage(o, 0, 0); ctx.restore(); };
  ctx.save();
  if (style === 'glow') glow(1);
  else if (style === 'outline') outline('#fff4dc', 1);
  else if (style === 'outline-amber') outline('#f0b43c', 1);
  else if (style === 'bright') { ctx.filter = 'brightness(1.45) saturate(1.35)'; ctx.drawImage(HLC.c, 0, 0); }
  else if (style === 'pulse') outline('#fff4dc', 0.35 + 0.65 * (0.5 + 0.5 * Math.sin((t || 0) * 7)));
  else if (style === 'dim') { ctx.fillStyle = 'rgba(8,9,11,0.42)'; ctx.fillRect(0, 0, w, h); ctx.drawImage(HLC.c, 0, 0); glow(0.5); }
  else if (style === 'glow-outline') { outline('#2a1a08', 1); glow(0.8); }
  ctx.restore();
}
function drawWiresLevel(ctx, z) {
  WIRES.mist = wireMist(z);
  const cutTop = S.level + HT / LH, inLv = p => Math.floor(p) === z;
  const cutting = S.mode === 'cut' && S.level < NL - 1;
  const ok = p => !cutting || p <= cutTop;
  const all = !WIRES.only;                                    // WIRES.only: draw just one cable or tie (the highlight pass)
  if (all) for (const p of WIRES.posts) {                    // posts first: bundles rest on them
    const a = Math.max(p.z0, z), b = Math.min(p.z1, z + 1);
    if (b <= a || !ok(a)) continue;
    const q = wq(p.x, p.y, a), pal = wpal(POST_HEX, q); WDT.D = depthKey(p.x, p.y, Math.min(b, p.z1));
    tubeSeg(ctx, projIso(p.x, p.y, a), projIso(p.x, p.y, Math.min(b, cutting ? cutTop : b)), tubeProfile(2, true), pal);
    if (inLv(p.z1) && ok(p.z1)) { const c = projIso(p.x, p.y, p.z1); tubeSeg(ctx, [c[0] - 3, c[1]], [c[0] + 3, c[1]], [3, 0, 3], pal); }
  }
  // girders: slim gleaming steel along grid lines, a small bulb where they join
  const joints = new Map();
  if (all) for (const g of WIRES.girders) {
    const za = Math.min(g.a[2], g.b[2]), zb = Math.max(g.a[2], g.b[2]), vert = zb - za > 0.5;
    for (const e of [g.a, g.b]) joints.set(e.map(v => v.toFixed(2)).join(), e);
    const pa = vert ? (g.a[2] < g.b[2] ? g.a : g.b) : g.a, pb = vert ? (g.a[2] < g.b[2] ? g.b : g.a) : g.b;
    let t0 = 0, t1 = 1;
    if (vert) { t0 = clamp((z - za) / (zb - za), 0, 1); t1 = clamp((z + 1 - za) / (zb - za), 0, 1); if (t1 <= t0) continue; }
    else if (!inLv(za)) continue;
    const A = [lerp(pa[0], pb[0], t0), lerp(pa[1], pb[1], t0), lerp(pa[2], pb[2], t0)], B = [lerp(pa[0], pb[0], t1), lerp(pa[1], pb[1], t1), Math.min(lerp(pa[2], pb[2], t1), cutting ? cutTop : 99)];
    if (!ok(A[2])) continue;
    const pal = wpal(GIRDER_HEX, Math.max(3, wq(A[0], A[1], A[2]))); WDT.D = Math.max(depthKey(...A), depthKey(...B));
    tubeSeg(ctx, projIso(...A), projIso(...B), [0, 2], [mixHex(rgbHex(pal[0]), GLEAM, 0.35), pal[1], pal[2], pal[3]]);
  }
  if (all) for (const e of joints.values()) {
    if (!inLv(e[2]) || !ok(e[2])) continue;
    const q = projIso(...e), X = Math.round(q[0]), Y = Math.round(q[1]), pal = wpal(GIRDER_HEX, 4); WDT.D = depthKey(...e) + 0.2;
    if (WIRES.joint === 'plate') { RW(ctx, X - 2, Y - 2, 5, 5, pal[3]); RW(ctx, X - 1, Y - 1, 3, 3, pal[1]); RW(ctx, X, Y - 1, 1, 3, pal[2]); RW(ctx, X - 1, Y, 3, 1, pal[2]); }
    else if (WIRES.joint === 'ring') { RW(ctx, X - 2, Y - 1, 5, 3, pal[2]); RW(ctx, X - 1, Y - 2, 3, 5, pal[2]); RW(ctx, X - 1, Y - 1, 3, 3, pal[0]); RW(ctx, X, Y, 1, 1, pal[3]); }
    else { RW(ctx, X - 1, Y - 1, 3, 3, pal[2]); RW(ctx, X - 1, Y - 1, 2, 2, pal[0]); }
  }
  if (all) for (const m of WIRES.mounts) {
    if (!inLv(m.p[2]) || !ok(m.p[2])) continue;
    const q = projIso(...m.p), X = Math.round(q[0]), Y = Math.round(q[1]), pal = wpal(GIRDER_HEX, 4); WDT.D = depthKey(...m.p) + 0.2;
    RW(ctx, X - 1, Y, 3, 2, pal[2]); RW(ctx, X - 1, Y, 2, 1, pal[0]); RW(ctx, X, Y, 1, 1, GLEAM);
  }
  const SP = spines(), hidden = new Map(), override = new Map();
  for (const sp of SP) sp.r.pairs.forEach((pr, j) => {
    if (!hidden.has(pr.c)) hidden.set(pr.c, []);
    hidden.get(pr.c).push([pr.a.i, pr.b.i]);
    if (!override.has(pr.c)) override.set(pr.c, new Map());
    override.get(pr.c).set(pr.a.i, sp.pos(j, 0)); override.get(pr.c).set(pr.b.i, sp.pos(j, sp.N));
  });
  const segs = [];
  // loose wire: drawn from its own particles, joined seamlessly to the bundles it enters
  for (const c of WIRES.cables) {
    const hid = hidden.get(c) || [], ov = override.get(c);
    const P = i => (ov && ov.get(i)) || xAt(c, i);
    for (let i = 0; i < c.n - 1; i++) {
      if (hid.some(([a, b]) => i >= a && i < b)) continue;
      const pa = P(i), pb = P(i + 1), zm = (pa[2] + pb[2]) / 2;
      if (!inLv(zm) || !ok(zm)) continue;
      segs.push({ c, i, pa, pb, k: depthKey((pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, zm), zm });
    }
    if (WIRES.sockets) for (const pin of [c.pinA, c.pinB]) {
      if (!pin || !inLv(pin[2]) || !ok(pin[2])) continue;
      segs.push({ sock: c, p: pin, k: depthKey(pin[0], pin[1], pin[2]) + 0.05 });
    }
  }
  // bundled runs
  const tube = WIRES.bundleLook === 'tube';
  for (const sp of SP) {
    for (let s = 0; s < sp.N; s++) {
      const a = sp.pts[s], b = sp.pts[s + 1], zm = (a[2] + b[2]) / 2;
      if (!inLv(zm) || !ok(zm)) continue;
      const k = depthKey((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, zm);
      if (tube && sp.round) segs.push({ tube: sp, s, k });
      else {
        if (sp.round) segs.push({ core: sp, s, k: k - 0.4, d: k });
        sp.r.pairs.forEach((pr, j) => { const pa = sp.pos(j, s), pb = sp.pos(j, s + 1); segs.push({ c: pr.c, i: -1, pa, pb, k: depthKey((pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, zm), zm }); });
      }
    }
  }
  // ties: a band wrapped tight round the bundle where a run starts or ends; a clip on a ribbon
  const banded = new Set();
  for (const sp of SP) for (const [t, s] of [[sp.r.t1, 0], [sp.r.t2, sp.N]]) {
    if (banded.has(t)) continue; banded.add(t);
    const p = sp.pts[s]; if (!inLv(p[2]) || !ok(p[2])) continue;
    segs.push({ band: t, sp, s, k: depthKey(p[0], p[1], p[2]) + 0.6, d: depthKey(p[0], p[1], p[2]) + 0.3 });
  }
  const loneTies = WIRES.ties.filter(t => !banded.has(t));
  segs.sort((a, b) => a.k - b.k);
  const light = p => wq(p[0], p[1], p[2]);
  for (const sg of segs) {
    if (!all && !hlMatch(sg)) continue;
    WDT.D = sg.d != null ? sg.d : sg.k;
    if (sg.core) {
      const sp = sg.core, a = sp.pts[sg.s], b = sp.pts[sg.s + 1], w = Math.max(2, sp.Wpx[sg.s] - 1), pal = wpal('#2c2925', light(a));
      tubeSeg(ctx, projIso(...a), projIso(...b), Array.from({ length: w }, (_, j) => j === 0 ? 1 : j === w - 1 ? 3 : 2), pal);
      continue;
    }
    if (sg.tube) {
      // a striped tube: each row takes the colour of the wire nearest it on screen, shaded like a cylinder
      const sp = sg.tube, s = sg.s, a = sp.pts[s], b = sp.pts[s + 1], qa = projIso(...a), qb = projIso(...b);
      const w = sp.Wpx[s], horiz = Math.abs(qb[0] - qa[0]) >= Math.abs(qb[1] - qa[1]);
      const rows = sp.r.pairs.map((pr, j) => { const q = projIso(...sp.pos(j, s)); return { y: horiz ? q[1] - qa[1] : q[0] - qa[0], hex: cableHex(pr.c), d: depthKey(...sp.pos(j, s)) }; });
      const q = light(a), half = (w - 1) / 2, cols = [];
      for (let j = 0; j < w; j++) {
        const y = j - half; let best = null, bd = 1e9;
        for (const r of rows) { const dd = Math.abs(r.y - y) - r.d * 0.15; if (dd < bd) { bd = dd; best = r; } }
        const pal = wpal(best.hex, q), f = w > 3 ? (j - 1) / (w - 3) : 0.5;
        cols.push(j === 0 || j === w - 1 ? pal[3] : f < 0.22 ? pal[0] : f < 0.6 ? pal[1] : f < 0.86 ? pal[2] : deep(pal));
      }
      tubeRows(ctx, qa, qb, w, j => cols[j]);
      continue;
    }
    if (sg.band) {
      const t = sg.band, sp = sg.sp, s = sg.s, p = sp.pts[s], hov = WIRES.hl === 'amber' && WIRES.hover && WIRES.hover.tie === t;
      const pal = wpal(hov ? '#f0b43c' : TIE_HEX, light(p));
      const q0 = projIso(...sp.pts[Math.max(0, s - 1)]), q1 = projIso(...sp.pts[Math.min(sp.N, s + 1)]), qp = projIso(...p);
      let tx = q1[0] - q0[0], ty = q1[1] - q0[1]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      if (!sp.round) {                                          // ribbon clip: straight, seated on the ribbon
        const half = Math.max(...sp.r.pairs.map((pr, j) => Math.hypot(...sp.offs[j][s]) + pr.c.g.r)) * 9 + 1;
        tubeSeg(ctx, [qp[0] - ty * half, qp[1] + tx * half], [qp[0] + ty * half, qp[1] - tx * half], tubeProfile(2, true), pal);
        continue;
      }
      // the strap: a ring round the bundle at this point, front half only, drawn as a 2-px band
      const f = sp.F[s], rr = sp.R[s] + 0.01, k0 = depthKey(...p), N = 28;
      let prev = null;
      for (let j = 0; j <= N; j++) {
        const th = j / N * Math.PI * 2, ca = Math.cos(th) * rr, sa = Math.sin(th) * rr;
        const q3 = [p[0] + f.A[0] * ca + f.U[0] * sa, p[1] + f.A[1] * ca + f.U[1] * sa, p[2] + f.A[2] * ca + f.U[2] * sa];
        const front = depthKey(...q3) >= k0 - 0.02, q = projIso(q3[0], q3[1], q3[2] + 0.04);
        if (prev && front && prev.front) { tubeSeg(ctx, prev.q, q, [0], pal); tubeSeg(ctx, [prev.q[0] + tx, prev.q[1] + ty], [q[0] + tx, q[1] + ty], [2], pal); }
        prev = { q, front };
      }
      continue;
    }
    if (sg.sock) {
      const c = sg.sock, q = projIso(sg.p[0], sg.p[1], sg.p[2] - c.g.r), X = Math.round(q[0]), Y = Math.round(q[1]), sz = c.g.px + 2;
      const pal = wpal('#3a3d42', light(sg.p));
      RW(ctx, X - (sz >> 1) - 1, Y - 1, sz + 2, 3, pal[3]); RW(ctx, X - (sz >> 1), Y - 1, sz, 1, pal[0]); RW(ctx, X - (sz >> 1), Y, sz, 1, pal[1]);
      continue;
    }
    const c = sg.c, w = c.g.px, prof = tubeProfile(w, WIRES.outline && w >= 3);
    const hov = WIRES.hl === 'amber' && WIRES.hover && WIRES.hover.c === c;
    const a = projIso(sg.pa[0], sg.pa[1], sg.pa[2] + c.g.r * 0.6), b = projIso(sg.pb[0], sg.pb[1], sg.pb[2] + c.g.r * 0.6);
    const pal = wpal(hov ? '#f0b43c' : cableHex(c), light(sg.pa));
    tubeSeg(ctx, a, b, prof, c.gi >= 2 && sg.i >= 0 && sg.i % (c.gi === 3 ? 5 : 7) === 0 ? [pal[2], pal[2], pal[3], pal[3]] : pal);
  }
  for (const t of WIRES.ties) {                               // hanger rods
    if (!all && WIRES.only.tie !== t) continue;
    const c = tieCenter(t); if (!t.top || !inLv(c[2]) || !ok(c[2])) continue; WDT.D = depthKey(...c);
    tubeSeg(ctx, projIso(c[0], c[1], c[2] + t.R), projIso(t.top[0], t.top[1], t.top[2]), [1, 3], wpal(ROD_HEX, wq(c[0], c[1], c[2])));
  }
  for (const t of loneTies) {                                 // a tie with no bundle on either side
    if (!all && WIRES.only.tie !== t) continue;
    const c = tieCenter(t); if (!inLv(c[2]) || !ok(c[2])) continue; WDT.D = depthKey(...c) + 0.3;
    const cc = [0, 0, 0]; for (const m of t.m) for (let k = 0; k < 3; k++) cc[k] += m.c.X[m.i * 3 + k] / t.m.length;
    if (t.round) {
      // a band square to the run, wrapped round the cables where they actually are; front half only
      const T = t.T || [0, 0, 1], A = t.axis, U = v3.norm(v3.cross(T, A)), hov = WIRES.hl === 'amber' && WIRES.hover && WIRES.hover.tie === t, pal = wpal(hov ? '#f0b43c' : TIE_HEX, wq(...cc));
      let rr = 0; for (const m of t.m) { const q = v3.sub(xAt(m.c, m.i), cc), dt = v3.dot(q, T); rr = Math.max(rr, Math.hypot(q[0] - T[0] * dt, q[1] - T[1] * dt, q[2] - T[2] * dt) + m.c.g.r); }
      rr += 0.01;
      const k0 = depthKey(...cc), q0 = projIso(cc[0] - T[0] * 0.1, cc[1] - T[1] * 0.1, cc[2] - T[2] * 0.1), q1 = projIso(cc[0] + T[0] * 0.1, cc[1] + T[1] * 0.1, cc[2] + T[2] * 0.1);
      let tx = q1[0] - q0[0], ty = q1[1] - q0[1]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      let prev = null;
      for (let j = 0; j <= 28; j++) {
        const th = j / 28 * Math.PI * 2, ca = Math.cos(th) * rr, sa = Math.sin(th) * rr;
        const q3 = [cc[0] + A[0] * ca + U[0] * sa, cc[1] + A[1] * ca + U[1] * sa, cc[2] + A[2] * ca + U[2] * sa];
        const front = depthKey(...q3) >= k0 - 0.02, q = projIso(...q3);
        if (prev && front && prev.front) { tubeSeg(ctx, prev.q, q, [0], pal); tubeSeg(ctx, [prev.q[0] + tx, prev.q[1] + ty], [q[0] + tx, q[1] + ty], [2], pal); }
        prev = { q, front };
      }
      continue;
    }
    const half = Math.max(...t.m.map(m => Math.abs(v3.dot(v3.sub(xAt(m.c, m.i), cc), t.axis)) + m.c.g.r)) + 0.04, lift = Math.max(...t.m.map(m => m.c.g.r)) + 0.02;
    tubeSeg(ctx, projIso(cc[0] - t.axis[0] * half, cc[1] - t.axis[1] * half, cc[2] + lift), projIso(cc[0] + t.axis[0] * half, cc[1] + t.axis[1] * half, cc[2] + lift), tubeProfile(2, true), wpal(TIE_HEX, wq(...cc)));
  }
}
// gesture overlays: tie stroke, anchor and post markers (drawn after the world)
function drawWireOverlay(ctx) {
  if (S.mode !== 'cut') return;
  const s = WIRES.stroke;
  if (s) { pline(ctx, s.x0, s.y0 + 1, s.x1, s.y1 + 1, 'rgba(0,0,0,0.6)'); pline(ctx, s.x0, s.y0, s.x1, s.y1, '#f0b43c', [3, 2]); }
  const mark = (p, col) => { if (!p) return; const q = projIso(p[0], p[1], p[2]); const X = Math.round(q[0]), Y = Math.round(q[1]); dia(ctx, X - 4, Y - 2, 8, col); R_(ctx, X, Y, 1, 1, '#1b1305'); };
  if (SLACK.on && WIRES.ptr) {
    const c = SLACK.c, d = cableLen(c) - SLACK.L0, X = Math.round(WIRES.ptr[0]), Y = Math.round(WIRES.ptr[1]), at = cableLen(c) <= SLACK.min + 0.01;
    ptext(ctx, (d >= 0 ? '+' : '') + d.toFixed(1) + (at ? ' TAUT' : ''), X + 7, Y - 9, '#f0b43c', true);
    return;
  }
  if (GDRAG.on) { const A = projIso(...GDRAG.a), B = projIso(...GDRAG.b); pline(ctx, A[0], A[1] + 1, B[0], B[1] + 1, 'rgba(0,0,0,0.6)'); pline(ctx, A[0], A[1], B[0], B[1], '#f0b43c', [3, 2]); mark(GDRAG.a, '#f0b43c'); mark(GDRAG.b, '#e6dfcf'); return; }
  if (S.tool === 'girder' && WIRES.ptr && !WGRAB.on) { const gn = WIRES.ptr && girderNear(WIRES.ptr[0], WIRES.ptr[1], 6); mark(gridPointAt(WIRES.ptr[0], WIRES.ptr[1], workHeight()), 'rgba(240,180,60,0.85)'); if (gn) { const A = projIso(...gn.g.a), B = projIso(...gn.g.b); pline(ctx, A[0], A[1], B[0], B[1], 'rgba(240,180,60,0.6)'); } }
  if (LAY.on) { mark(LAY.a, '#f0b43c'); mark(LAY.hint || LAY.target, LAY.hint ? '#e6dfcf' : 'rgba(230,223,207,0.5)'); }
  else if (WGRAB.on && WGRAB.end) mark(WGRAB.goal, '#e6dfcf');
  else if (WGRAB.on && WGRAB.tie && WGRAB.mode !== 'slide' && WIRES.ptr) { const p = postNear(WIRES.ptr[0], WIRES.ptr[1], 7), gn = !p && girderNear(WIRES.ptr[0], WIRES.ptr[1], 7); if (p) mark(postTop(p), '#f0b43c'); else if (gn) mark(gn.p, '#f0b43c'); }
  else if ((S.tool === 'cable' || S.tool === 'post') && WIRES.ptr && !WIRES.hover) mark(wireAnchor(WIRES.ptr[0], WIRES.ptr[1], WIRES.gauge), 'rgba(240,180,60,0.85)');
}
