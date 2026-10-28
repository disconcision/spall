'use strict';
// ==========================================================================
// Cables: XPBD ropes in world space. Ends anchor on lattice points (cell
// corners and edge midpoints), the rest is free and collides with the same
// world the shader draws. Wire ties cinch several cables into a flat ribbon;
// tied cables move as one heavier body, so bundling is how scale emerges.
// Drawing is pixel-exact (no AA) and depth-tested against the readback.
// ==========================================================================
const GRAV = 16;
const GAUGES = [
  { key: 'data', name: 'Data wire', r: 0.055, seg: 0.22, mass: 0.15, stretch: 0.05, bend: 40, drag: 0.9965, fric: 0.5, grab: 0, wpx: 1,
    hues: [['#9af0e2', '#46c1b1', '#1f7069', '#0c2a27'], ['#c9b8ff', '#8f7ae6', '#4f3f94', '#1b1534'], ['#d7f08c', '#9fc24a', '#56702a', '#1d260f']] },
  { key: 'power', name: 'Power cable', r: 0.1, seg: 0.25, mass: 0.5, stretch: 0.02, bend: 8, drag: 0.9975, fric: 0.6, grab: 0.4, wpx: 2,
    hues: [['#ffb592', '#e2774c', '#8f3f25', '#2d130b'], ['#ffd27a', '#e0a33a', '#8a5f17', '#2b1d07']] },
  { key: 'hose', name: 'Flex hose', r: 0.2, seg: 0.3, mass: 2.5, stretch: 0.006, bend: 1.2, drag: 0.9985, fric: 0.75, grab: 3, wpx: 4,
    hues: [['#e8d29a', '#b89a58', '#6e5a2c', '#211a0c'], ['#b4c99a', '#7e9a5e', '#465a31', '#141b0e']] },
  { key: 'trunk', name: 'Trunk pipe', r: 0.42, seg: 0.4, mass: 10, stretch: 0.001, bend: 0.12, drag: 0.999, fric: 0.85, grab: 9, wpx: 10,
    hues: [['#c3d0d9', '#7f909d', '#4a5761', '#151a1e']] }
];
const SLEEVE = ['#77706a', '#46413d', '#2a2724', '#100f0e'];
const TIE = ['#f1ede3', '#c9c4b8', '#8d887e', '#1c1b19'];
const LOOK = { outline: true, sleeve: true, glow: false, feel: 'weighty' };
const FEEL = { springy: { stretch: 3, bend: 2, drag: 0.9985 }, weighty: { stretch: 1, bend: 1, drag: 1 }, taut: { stretch: 0.2, bend: 0.5, drag: 0.999 } };

let cables = [], ties = [], nextId = 1;
const hueCounter = [0, 0, 0, 0];

function makeCable(gi, a, b, opts) {
  opts = opts || {};
  const g = GAUGES[gi];
  const dist = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const L = opts.length || Math.max(0.6, dist * (opts.slack || 1.12) + 0.2);
  const n = Math.max(4, Math.ceil(L / g.seg) + 1);
  const c = { id: nextId++, gi, g, n, X: new Float32Array(n * 3), P: new Float32Array(n * 3), W: new Float32Array(n), rest: L / (n - 1),
    pinA: a.slice(), pinB: opts.freeEnd ? null : b.slice(), hue: opts.hue != null ? opts.hue : (hueCounter[gi]++ % g.hues.length), still: 0, asleep: false };
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), sag = Math.sin(Math.PI * t) * Math.sqrt(Math.max(0, L * L - dist * dist)) * 0.5;
    for (let k = 0; k < 3; k++) c.X[i * 3 + k] = a[k] + (b[k] - a[k]) * t;
    c.X[i * 3 + 2] -= sag;
    c.W[i] = 1 / g.mass;
  }
  c.P.set(c.X);
  c.W[0] = 0; if (c.pinB) c.W[n - 1] = 0;
  cables.push(c);
  return c;
}
function cableLength(c) { return c.rest * (c.n - 1); }
// re-sample a cable to m particles along its current polyline (keeps velocity)
function resample(c, m) {
  const n = c.n, acc = [0];
  for (let i = 1; i < n; i++) acc.push(acc[i - 1] + Math.hypot(c.X[i * 3] - c.X[i * 3 - 3], c.X[i * 3 + 1] - c.X[i * 3 - 2], c.X[i * 3 + 2] - c.X[i * 3 - 1]));
  const tot = acc[n - 1] || 1e-6, X = new Float32Array(m * 3), P = new Float32Array(m * 3);
  let j = 0;
  for (let i = 0; i < m; i++) {
    const s = tot * i / (m - 1);
    while (j < n - 2 && acc[j + 1] < s) j++;
    const u = Math.min(1, Math.max(0, (s - acc[j]) / ((acc[j + 1] - acc[j]) || 1e-6)));
    for (let k = 0; k < 3; k++) { X[i * 3 + k] = c.X[j * 3 + k] + (c.X[j * 3 + 3 + k] - c.X[j * 3 + k]) * u; P[i * 3 + k] = c.P[j * 3 + k] + (c.P[j * 3 + 3 + k] - c.P[j * 3 + k]) * u; }
  }
  const len = cableLength(c);
  c.n = m; c.X = X; c.P = P; c.W = new Float32Array(m).fill(1 / c.g.mass); c.rest = len / (m - 1);
  c.W[0] = c.pinA ? 0 : 1 / c.g.mass; c.W[m - 1] = c.pinB ? 0 : 1 / c.g.mass;
}
function setLength(c, L) {
  const want = Math.max(4, Math.ceil(L / c.g.seg) + 1);
  if (want > c.n * 1.25 || want < c.n * 0.75) resample(c, want);
  c.rest = L / (c.n - 1);
}
function wake(c) { c.asleep = false; c.still = 0; }
function wakeAll() { cables.forEach(wake); }

// --- ties ---------------------------------------------------------------------
function tieWidth(members) { return members.reduce((s, m) => s + pitchOf(m.c), 0); }
function pitchOf(c) { return Math.max(2 * c.g.r * 1.15, (c.g.wpx + 1) / 8.5); }
function makeTie(members) {
  // members: [{c, i}] ; orders them across the bundle and gives each a slot
  const ctr = [0, 0, 0]; members.forEach(m => { for (let k = 0; k < 3; k++) ctr[k] += m.c.X[m.i * 3 + k] / members.length; });
  const t = { id: nextId++, m: members, axis: [1, 0, 0], hang: null, top: null, w: 0, ctr };
  t.axis = bundleAxis(t, null);
  members.sort((p, q) => dot3(sub3(xAt(p.c, p.i), ctr), t.axis) - dot3(sub3(xAt(q.c, q.i), ctr), t.axis));
  t.w = tieWidth(members);
  let o = -t.w / 2; for (const m of members) { const p = pitchOf(m.c); m.off = o + p / 2; o += p; }
  members.forEach(m => wake(m.c));
  ties.push(t);
  return t;
}
const xAt = (c, i) => [c.X[i * 3], c.X[i * 3 + 1], c.X[i * 3 + 2]];
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm3 = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1e-9; return [a[0] / l, a[1] / l, a[2] / l]; };
function bundleAxis(t, prev) {
  const b = [0, 0, 0];
  for (const m of t.m) { const i = Math.max(1, Math.min(m.c.n - 2, m.i)); for (let k = 0; k < 3; k++) b[k] += m.c.X[(i + 1) * 3 + k] - m.c.X[(i - 1) * 3 + k]; }
  let a = [-b[1], b[0], 0];                        // b x up: horizontal, across the bundle
  if (Math.hypot(a[0], a[1]) < 0.25 * Math.hypot(b[0], b[1], b[2])) a = prev ? prev.slice() : [1, 0, 0];
  a = norm3(a);
  if (prev && dot3(a, prev) < 0) a = [-a[0], -a[1], -a[2]];
  if (prev) a = norm3([prev[0] * 0.7 + a[0] * 0.3, prev[1] * 0.7 + a[1] * 0.3, prev[2] * 0.7 + a[2] * 0.3]);
  return a;
}
function tieCenter(t) {
  if (t.hang) return t.hang;
  let s = 0; const c = [0, 0, 0];
  for (const m of t.m) { const w = m.c.W[m.i], mass = w > 0 ? 1 / w : 1e3; s += mass; for (let k = 0; k < 3; k++) c[k] += m.c.X[m.i * 3 + k] * mass; }
  return [c[0] / s, c[1] / s, c[2] / s];
}
function tieMass(t) { return t.m.reduce((s, m) => s + m.c.g.mass, 0); }
function removeCable(c) {
  cables = cables.filter(x => x !== c);
  for (const t of ties) t.m = t.m.filter(m => m.c !== c);
  ties = ties.filter(t => t.m.length > 0);
  ties.forEach(t => { t.w = tieWidth(t.m); let o = -t.w / 2; for (const m of t.m) { const p = pitchOf(m.c); m.off = o + p / 2; o += p; } t.m.forEach(m => wake(m.c)); });
}
function removeTie(t) { ties = ties.filter(x => x !== t); t.m.forEach(m => wake(m.c)); }
function hangTie(t) {
  const c = tieCenter(t);
  // a rod straight up to the first ceiling; failing that, a bracket to the nearest wall
  let top = null;
  for (let z = c[2] + 0.3; z < ZTOP; z += 0.1) if (solidAt(c[0], c[1], z)) { top = [c[0], c[1], z]; break; }
  if (!top) {
    let best = 1e9;
    for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let s = 0.2; s < 6; s += 0.1) if (solidAt(c[0] + d[0] * s, c[1] + d[1] * s, c[2])) { if (s < best) { best = s; top = [c[0] + d[0] * s, c[1] + d[1] * s, c[2]]; } break; }
  }
  t.hang = c; t.top = top;
  t.m.forEach(m => wake(m.c));
}

// --- simulation ------------------------------------------------------------------
const grab = { on: false, c: null, i: -1, tie: null, target: null, end: false };
function stepCables(dt) {
  const SUB = 4, h = dt / SUB, IT = 8, fe = FEEL[LOOK.feel];
  // ties share wakefulness
  for (const t of ties) if (t.m.some(m => !m.c.asleep)) t.m.forEach(m => { if (m.c.asleep) wake(m.c); });
  for (const t of ties) if (!t.m[0].c.asleep) t.axis = bundleAxis(t, t.axis);
  for (let s = 0; s < SUB; s++) {
    for (const c of cables) {
      if (c.asleep) continue;
      const X = c.X, P = c.P, Wt = c.W, drag = Math.min(0.99995, c.g.drag * fe.drag);
      for (let i = 0; i < c.n; i++) {
        if (Wt[i] === 0) continue;
        const j = i * 3;
        for (let k = 0; k < 3; k++) { const v = (X[j + k] - P[j + k]) * drag; P[j + k] = X[j + k]; X[j + k] += v; }
        X[j + 2] -= GRAV * h * h;
      }
      if (c.pinA) { X[0] = c.pinA[0]; X[1] = c.pinA[1]; X[2] = c.pinA[2]; }
      if (c.pinB) { const j = (c.n - 1) * 3; X[j] = c.pinB[0]; X[j + 1] = c.pinB[1]; X[j + 2] = c.pinB[2]; }
      if (!c.lamS || c.lamS.length !== c.n) { c.lamS = new Float32Array(c.n); c.lamB = new Float32Array(c.n); } else { c.lamS.fill(0); c.lamB.fill(0); }
    }
    // grabbing: a spring whose give grows with the mass being dragged
    if (grab.on && grab.target) {
      if (grab.tie) {
        const t = grab.tie, f = 1 / (1 + tieMass(t) * 0.25), c0 = tieCenter(t);
        const d = sub3(grab.target, c0);
        for (const m of t.m) if (m.c.W[m.i] > 0) for (let k = 0; k < 3; k++) m.c.X[m.i * 3 + k] += d[k] * f;
      } else if (grab.c && grab.c.W[grab.i] > 0) {
        const c = grab.c, f = 1 / (1 + c.g.grab);
        for (let k = 0; k < 3; k++) c.X[grab.i * 3 + k] += (grab.target[k] - c.X[grab.i * 3 + k]) * f;
      }
    }
    for (let it = 0; it < IT; it++) {
      for (const c of cables) {
        if (c.asleep) continue;
        const X = c.X, Wt = c.W, r = c.rest, bs = c.g.stretch * fe.stretch, bb = c.g.bend * fe.bend;
        for (let i = 0; i < c.n - 1; i++) {
          const a = i * 3, b = a + 3, wa = Wt[i], wb = Wt[i + 1], ws = wa + wb; if (!ws) continue;
          const dx = X[b] - X[a], dy = X[b + 1] - X[a + 1], dz = X[b + 2] - X[a + 2], len = Math.hypot(dx, dy, dz) || 1e-9;
          const C = len - r, at = bs * ws, dl = (-C - at * c.lamS[i]) / (ws + at); c.lamS[i] += dl;
          const nx = dx / len * dl, ny = dy / len * dl, nz = dz / len * dl;
          X[a] -= nx * wa; X[a + 1] -= ny * wa; X[a + 2] -= nz * wa; X[b] += nx * wb; X[b + 1] += ny * wb; X[b + 2] += nz * wb;
        }
        for (let i = 0; i < c.n - 2; i++) {
          const a = i * 3, b = a + 6, wa = Wt[i], wb = Wt[i + 2], ws = wa + wb; if (!ws) continue;
          const dx = X[b] - X[a], dy = X[b + 1] - X[a + 1], dz = X[b + 2] - X[a + 2], len = Math.hypot(dx, dy, dz) || 1e-9;
          const C = len - 2 * r; if (C >= 0) continue;
          const at = bb * ws, dl = (-C - at * c.lamB[i]) / (ws + at); c.lamB[i] += dl;
          const nx = dx / len * dl, ny = dy / len * dl, nz = dz / len * dl;
          X[a] -= nx * wa; X[a + 1] -= ny * wa; X[a + 2] -= nz * wa; X[b] += nx * wb; X[b + 1] += ny * wb; X[b + 2] += nz * wb;
        }
      }
      for (const t of ties) {
        if (t.m[0].c.asleep) continue;
        const ctr = tieCenter(t);
        for (const m of t.m) {
          const c = m.c; if (c.W[m.i] === 0) continue;
          for (let k = 0; k < 3; k++) c.X[m.i * 3 + k] += (ctr[k] + t.axis[k] * m.off - c.X[m.i * 3 + k]) * 0.6;
        }
        for (const dk of [-1, 1]) {                       // the clip keeps a short run parallel
          const cn = [0, 0, 0]; let cnt = 0;
          for (const m of t.m) { const j = m.i + dk; if (j < 0 || j >= m.c.n) continue; for (let k = 0; k < 3; k++) cn[k] += m.c.X[j * 3 + k]; cnt++; }
          if (cnt < 2) continue;
          for (let k = 0; k < 3; k++) cn[k] /= cnt;
          for (const m of t.m) { const j = m.i + dk; if (j < 0 || j >= m.c.n || m.c.W[j] === 0) continue; for (let k = 0; k < 3; k++) m.c.X[j * 3 + k] += (cn[k] + t.axis[k] * m.off - m.c.X[j * 3 + k]) * 0.3; }
        }
      }
    }
    // collisions with the world, with friction so cables drape and stay put
    for (const c of cables) {
      if (c.asleep) continue;
      const X = c.X, P = c.P, r = c.g.r, fr = c.g.fric;
      for (let i = 0; i < c.n; i++) {
        if (c.W[i] === 0) continue;
        const j = i * 3, q = pushOut(X[j], X[j + 1], X[j + 2] - r);
        if (!q) continue;
        X[j] = q.p[0]; X[j + 1] = q.p[1]; X[j + 2] = q.p[2] + r;
        const vx = X[j] - P[j], vy = X[j + 1] - P[j + 1], vz = X[j + 2] - P[j + 2], n = q.n, vn = vx * n[0] + vy * n[1] + vz * n[2];
        const tx = vx - vn * n[0], ty = vy - vn * n[1], tz = vz - vn * n[2], keep = 1 - fr, vnp = Math.max(0, vn) * 0.2;
        P[j] = X[j] - (tx * keep + n[0] * vnp); P[j + 1] = X[j + 1] - (ty * keep + n[1] * vnp); P[j + 2] = X[j + 2] - (tz * keep + n[2] * vnp);
      }
    }
  }
  // sleep cables that have come to rest (and nothing is holding them)
  for (const c of cables) {
    if (c.asleep) continue;
    let mx = 0; for (let i = 0; i < c.n * 3; i++) { const d = Math.abs(c.X[i] - c.P[i]); if (d > mx) mx = d; }
    const held = grab.on && (grab.c === c || (grab.tie && grab.tie.m.some(m => m.c === c))) || (lay.on && lay.c === c);
    c.still = (mx < 4e-5 && !held) ? c.still + 1 : 0;
    if (c.still > 90) c.asleep = true;
  }
}
function jolt(strength) {
  for (const c of cables) { wake(c); for (let i = 0; i < c.n; i++) if (c.W[i] > 0) { const ph = Math.sin(i * 0.37 + c.id); c.P[i * 3] -= 0.03 * strength * ph; c.P[i * 3 + 1] += 0.02 * strength * ph; c.P[i * 3 + 2] -= 0.05 * strength * (0.5 + 0.5 * Math.cos(i * 0.21 + c.id)); } }
}

// --- laying ------------------------------------------------------------------------
const lay = { on: false, c: null, a: null, cur: null, target: null };
function snapAnchor(hit, r) {
  const q = hit.p.slice(), n = hit.n;
  const ax = Math.abs(n[0]) > 0.9 ? 0 : Math.abs(n[1]) > 0.9 ? 1 : Math.abs(n[2]) > 0.9 ? 2 : -1;
  for (let a = 0; a < 3; a++) { if (a === ax) continue; if (ax === -1 && a !== 2) continue; q[a] = Math.round(q[a] * 2) / 2; }
  return [q[0] + n[0] * (r + 0.03), q[1] + n[1] * (r + 0.03), q[2] + n[2] * (r + 0.03)];
}
function layStart(gi, hit) {
  const a = snapAnchor(hit, GAUGES[gi].r);
  const c = makeCable(gi, a, [a[0] + 0.1, a[1] + 0.1, a[2]], { length: 0.8 });
  c.pinB = a.slice(); lay.on = true; lay.c = c; lay.a = a; lay.cur = a.slice(); lay.target = a.slice();
}
function layUpdate() {
  if (!lay.on) return;
  const c = lay.c;
  for (let k = 0; k < 3; k++) lay.cur[k] += (lay.target[k] - lay.cur[k]) * 0.3;
  const d = Math.hypot(lay.cur[0] - lay.a[0], lay.cur[1] - lay.a[1], lay.cur[2] - lay.a[2]);
  setLength(c, Math.max(0.8, d * 1.1 + 0.4));
  c.pinB = lay.cur.slice(); c.W[c.n - 1] = 0; wake(c);
}
function layEnd(hit) {
  const c = lay.c; lay.on = false;
  if (hit && hit.kind !== 3) {
    const b = snapAnchor(hit, c.g.r); c.pinB = b;
    const d = Math.hypot(b[0] - lay.a[0], b[1] - lay.a[1], b[2] - lay.a[2]);
    setLength(c, Math.max(0.8, d * 1.1 + 0.4));
  } else { c.pinB = null; c.W[c.n - 1] = 1 / c.g.mass; }
  wake(c); lay.c = null;
  return c;
}

// --- tie gesture -----------------------------------------------------------------------
function segX(ax, ay, bx, by, cx, cy, dx, dy) {
  const r1x = bx - ax, r1y = by - ay, r2x = dx - cx, r2y = dy - cy, den = r1x * r2y - r1y * r2x;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((cx - ax) * r2y - (cy - ay) * r2x) / den, u = ((cx - ax) * r1y - (cy - ay) * r1x) / den;
  return (t >= 0 && t <= 1 && u >= 0 && u <= 1) ? [t, u] : null;
}
function tieStroke(x0, y0, x1, y1) {
  const members = [];
  for (const c of cables) {
    let best = null;
    for (let i = 1; i < c.n - 2; i++) {
      const A = proj(c.X[i * 3], c.X[i * 3 + 1], c.X[i * 3 + 2]), B = proj(c.X[i * 3 + 3], c.X[i * 3 + 4], c.X[i * 3 + 5]);
      const hit = segX(x0, y0, x1, y1, A[0], A[1], B[0], B[1]); if (!hit) continue;
      const D = A[2] + (B[2] - A[2]) * hit[1];
      if (!best || D > best.D) best = { c, i: hit[1] < 0.5 ? i : i + 1, D };
    }
    if (!best) continue;
    if (ties.some(t => t.m.some(m => m.c === c && Math.abs(m.i - best.i) < 3))) continue;
    members.push({ c: best.c, i: best.i });
  }
  return members.length ? makeTie(members) : null;
}

// --- drawing -----------------------------------------------------------------------------
const palCache = new Map();
function hexRGB(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
function pal(hexes, f) {
  const key = hexes.join() + f;
  let p = palCache.get(key); if (p) return p;
  p = hexes.map(h => { const c = hexRGB(h); return (255 << 24) | (Math.min(255, c[2] * f) << 16) | (Math.min(255, c[1] * f) << 8) | Math.min(255, c[0] * f); });
  palCache.set(key, p); return p;
}
// profile for a w-pixel tube: indices into [hi, base, shade, outline]
function profile(w, outline) {
  let inner;
  if (w <= 1) inner = [1]; else if (w === 2) inner = [0, 1]; else if (w === 3) inner = [0, 1, 2];
  else { inner = [0]; if (w >= 6) inner.push(0); while (inner.length < w - (w >= 6 ? 2 : 1)) inner.push(1); if (w >= 6) inner.push(2); inner.push(2); }
  return outline ? [3, ...inner, 3] : inner;
}
const DR = { fb: null, zb: null };
function put(x, y, D, col, ghost) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = y * W + x;
  if (ghost) { if ((x + y) & 1) return; DR.fb[i] = col; return; }
  if (D < DR.zb[i] - 0.05) return;
  DR.fb[i] = col; DR.zb[i] = D;
}
function tubeSeg(a, b, w, p, prof, ga, gb) {
  const dx = b[0] - a[0], dy = b[1] - a[1], n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
  const horiz = Math.abs(dx) >= Math.abs(dy), half = (prof.length - 1) / 2;
  for (let s = 0; s <= n; s++) {
    const t = s / n, x = a[0] + dx * t, y = a[1] + dy * t, D = a[2] + (b[2] - a[2]) * t, gh = t < 0.5 ? ga : gb;
    if (horiz) { const px = Math.floor(x), y0 = Math.round(y - half - 0.5); for (let j = 0; j < prof.length; j++) put(px, y0 + j, D, p[prof[j]], gh); }
    else { const py = Math.floor(y), x0 = Math.round(x - half - 0.5); for (let j = 0; j < prof.length; j++) put(x0 + j, py, D, p[prof[j]], gh); }
  }
}
function lightAt(x, y, z) {
  const td = { day: 1, dusk: 0.86, night: 0.5 }[CAM.tod];
  const s = skyAt(x, y, z);
  const f = (0.42 + 0.58 * s) * td;
  return Math.round(f * 6) / 6;
}
function ghosted(x, y, z) { return z > CAM.cutZ + 0.05 || (CAM.sect && viewV(x, y) > CAM.sectV); }
function pxWidth(r) { return Math.max(1, Math.round(2 * r * 12 * CAM.k)); }
function drawCable(c, hover) {
  const g = c.g, w = pxWidth(g.r), prof = profile(w, LOOK.outline && w >= 3);
  const hx = hover ? ['#ffe0a0', '#e8a83c', '#9a6a1c', '#2a1a05'] : g.hues[c.hue % g.hues.length];
  let prev = null, pg = false, pl = -1, p = null;
  const glow = LOOK.glow && c.gi === 0 && CAM.tod !== 'day';
  for (let i = 0; i < c.n; i++) {
    const x = c.X[i * 3], y = c.X[i * 3 + 1], z = c.X[i * 3 + 2], q = proj(x, y, z);
    q[2] += g.r * 1.5;
    const gh = ghosted(x, y, z);
    if (i % 4 === 0 || !p) { const l = glow ? 1.1 : lightAt(x, y, z); if (l !== pl) { p = pal(hx, l); pl = l; } }
    if (prev) tubeSeg(prev, q, w, p, prof, pg, gh);
    prev = q; pg = gh;
  }
}
// sleeves: a run between two ties that hold exactly the same cables becomes one trunk
function sleeveRuns() {
  const runs = [];
  if (!LOOK.sleeve && CAM.k > 0.5) return runs;
  const seen = new Set();
  for (const c of cables) {
    const ts = ties.filter(t => t.m.some(m => m.c === c)).map(t => ({ t, i: t.m.find(m => m.c === c).i })).sort((a, b) => a.i - b.i);
    for (let k = 0; k + 1 < ts.length; k++) {
      const t1 = ts[k].t, t2 = ts[k + 1].t, key = Math.min(t1.id, t2.id) + ':' + Math.max(t1.id, t2.id);
      if (seen.has(key)) continue; seen.add(key);
      if (t1.m.length < 2 || t1.m.length !== t2.m.length) continue;
      if (!t1.m.every(m => t2.m.some(n => n.c === m.c))) continue;
      runs.push({ t1, t2, pairs: t1.m.map(m => ({ c: m.c, a: m.i, b: t2.m.find(n => n.c === m.c).i })) });
    }
  }
  return runs;
}
function drawSleeve(run) {
  const N = 24, w = Math.max(3, Math.round(Math.max(run.t1.w, run.t2.w) * 8.5 * CAM.k * 0.9) + 2), prof = profile(w, true);
  let prev = null, pg = false;
  for (let s = 0; s <= N; s++) {
    const u = s / N, ctr = [0, 0, 0];
    for (const pr of run.pairs) {
      const fi = pr.a + (pr.b - pr.a) * u, i0 = Math.floor(fi), i1 = Math.min(pr.c.n - 1, i0 + 1), f = fi - i0;
      for (let k = 0; k < 3; k++) ctr[k] += (pr.c.X[i0 * 3 + k] * (1 - f) + pr.c.X[i1 * 3 + k] * f) / run.pairs.length;
    }
    const q = proj(ctr[0], ctr[1], ctr[2]); q[2] += 0.5;
    const gh = ghosted(ctr[0], ctr[1], ctr[2]);
    if (prev) tubeSeg(prev, q, w, pal(SLEEVE, lightAt(ctr[0], ctr[1], ctr[2])), prof, pg, gh);
    prev = q; pg = gh;
  }
}
function drawTie(t, hover) {
  const c = tieCenter(t), half = t.w / 2 + 0.12;
  const a = proj(c[0] - t.axis[0] * half, c[1] - t.axis[1] * half, c[2] - t.axis[2] * half), b = proj(c[0] + t.axis[0] * half, c[1] + t.axis[1] * half, c[2] + t.axis[2] * half);
  const rmax = Math.max(...t.m.map(m => m.c.g.r));
  a[2] += rmax * 2 + 0.1; b[2] += rmax * 2 + 0.1;
  const gh = ghosted(c[0], c[1], c[2]), p = pal(hover ? ['#ffe0a0', '#e8a83c', '#9a6a1c', '#2a1a05'] : TIE, lightAt(c[0], c[1], c[2]));
  if (t.top) {
    const top = proj(t.top[0], t.top[1], t.top[2]), mid = proj(c[0], c[1], c[2]);
    mid[2] += rmax; top[2] += 0.05;
    tubeSeg(mid, top, 1, pal(['#9aa3ab', '#5c646b', '#3a4046', '#121416'], lightAt(c[0], c[1], c[2])), [1, 3], gh, gh);
  }
  const thick = Math.max(2, Math.round(rmax * 8 * CAM.k));
  tubeSeg(a, b, thick, p, profile(thick, true), gh, gh);
}
function drawAllCables(hover) {
  for (const c of cables) drawCable(c, hover && hover.c === c);
  if (LOOK.sleeve || CAM.k <= 0.5) for (const r of sleeveRuns()) drawSleeve(r);
  for (const t of ties) drawTie(t, hover && hover.tie === t);
}
// nearest thing under an art pixel: a tie, else a cable particle
function pickCable(px, py, rad) {
  let best = null, bd = rad * rad;
  for (const t of ties) { const c = tieCenter(t), q = proj(c[0], c[1], c[2]), d = (q[0] - px) ** 2 + (q[1] - py) ** 2; if (d < bd * 1.6) { bd = d / 1.6; best = { tie: t, D: q[2] }; } }
  if (best) return best;
  for (const c of cables) for (let i = 0; i < c.n; i++) {
    const q = proj(c.X[i * 3], c.X[i * 3 + 1], c.X[i * 3 + 2]), d = (q[0] - px) ** 2 + (q[1] - py) ** 2;
    if (d < bd) { bd = d; best = { c, i, D: q[2] }; }
  }
  return best;
}
