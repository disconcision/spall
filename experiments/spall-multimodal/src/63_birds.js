// ==========================================================================
// Birds: a little ambience, kept plain. One or two soar over the city,
// mostly gliding, now and then circling up a thermal over a void or a light
// well; a few perch on lips, girders and the gallery and flush when you start
// work near them, then wander back to a perch later. Pixels, not sprites:
// three for a bird in the air, two for one sitting.
// ==========================================================================
const BIRDS = { list: [], perches: [], thermals: [], top: 16 };
// soaring heights are measured from the top of what's built, not from the level limit
function cityTop() { for (let z = NL - 1; z > 0; z--) if (!levelEmpty(z)) return z; return 0; }
function initBirds() {
  const rnd = mulberry32(S.seed * 7 + 3), st = WIRES.stage; BIRDS.list = []; BIRDS.perches = []; BIRDS.thermals = []; BIRDS.top = cityTop();
  if (!st) return;
  for (const v of st.voids || [st]) {
    const V = v.V;
    BIRDS.thermals.push([(V.x0 + V.x1) / 2, (V.y0 + V.y1) / 2]);
    for (let x = V.x0; x < V.x1; x += 2.5) BIRDS.perches.push([x + rnd() * 1.5, V.y0 - 0.15, st.zf]);   // the near lip's edge
    for (let x = V.x0 + 3.5; x < V.x0 + 9.5; x += 2) BIRDS.perches.push([x, V.y1 + 0.85, st.zf]);       // the far balcony
  }
  for (const w of WORLD.wells || []) BIRDS.thermals.push([w.x + (w.s || 1) / 2, w.y + (w.s || 1) / 2]);
  for (const g of WIRES.girders) if (Math.abs(g.a[2] - g.b[2]) < 0.01 && v3.dist(g.a, g.b) > 4) for (let f = 0.15; f < 0.9; f += 0.18) BIRDS.perches.push([lerp(g.a[0], g.b[0], f), lerp(g.a[1], g.b[1], f), g.a[2] + 0.06]);
  for (let x = st.XA + 2; x < st.XB - 2; x += 4) BIRDS.perches.push([x + rnd(), st.YT + 1.85, st.zf]);   // gallery rail
  const taken = new Set();
  for (let k = 0; k < 5 && BIRDS.perches.length; k++) {
    let j = Math.floor(rnd() * BIRDS.perches.length); while (taken.has(j)) j = (j + 1) % BIRDS.perches.length;
    taken.add(j); BIRDS.list.push({ mode: 'perch', p: BIRDS.perches[j].slice(), pj: j, face: rnd() < 0.5 ? 1 : -1, t: rnd() * 10, ph: rnd() * 9 });
  }
  for (let k = 0; k < 2; k++) BIRDS.list.push(newSoarer(rnd));
}
function newSoarer(rnd) {
  rnd = rnd || Math.random;
  return { mode: 'glide', p: [rnd() * W, rnd() * D, BIRDS.top + 3 + rnd() * 4], h: rnd() * 6.28, v: 1.3 + rnd() * 0.5, t: 0, ph: rnd() * 9, flap: 0, alt: BIRDS.top + 3 + rnd() * 4, next: 8 + rnd() * 20 };
}
function birdsAwake() { return S.tod !== 'night' || (LIT.on && LIT.sun !== 'night'); }
function updateBirds(dt) {
  if (!BIRDS.list.length) return;
  const day = birdsAwake();
  for (const b of BIRDS.list) {
    b.t += dt; b.flap = Math.max(0, b.flap - dt);
    if (b.mode === 'perch') {
      if (day && b.t > 25 && Math.random() < dt / 90) takeOff(b, Math.random() * 6.28);   // now and then one just leaves
      continue;
    }
    if (b.mode === 'flee') {                        // a few hard wingbeats up and away
      b.p[0] += Math.cos(b.h) * 3 * dt; b.p[1] += Math.sin(b.h) * 3 * dt; b.p[2] += 1.6 * dt; b.flap = 0.3;
      if (b.t > 2.2) { b.mode = 'glide'; b.t = 0; b.alt = b.p[2] + 1; b.next = 10 + Math.random() * 20; }
      continue;
    }
    if (b.mode === 'land') {                        // glide down onto a free perch
      const q = BIRDS.perches[b.pj], d = v3.sub(q, b.p), L = Math.hypot(d[0], d[1], d[2]);
      if (L < 0.08) { b.mode = 'perch'; b.p = q.slice(); b.t = 0; b.face = Math.random() < 0.5 ? 1 : -1; continue; }
      const sp = Math.min(L, (L < 2 ? 1.2 : 2.2) * dt); for (let k = 0; k < 3; k++) b.p[k] += d[k] / L * sp;
      if (L < 1.2) b.flap = 0.2;
      continue;
    }
    if (b.mode === 'circle') {                      // riding a thermal: a slow climbing spiral
      b.a += b.v / b.R * dt; b.p[0] = b.c[0] + Math.cos(b.a) * b.R; b.p[1] = b.c[1] + Math.sin(b.a) * b.R; b.p[2] += 0.12 * dt; b.h = b.a + Math.PI / 2;
      if (b.t > b.dur) { b.mode = 'glide'; b.t = 0; b.alt = b.p[2]; b.next = 15 + Math.random() * 25; }
      continue;
    }
    // glide: a slowly wandering heading that bends back toward the city when it strays
    const cx = W / 2 - b.p[0], cy = D / 2 - b.p[1], far = Math.hypot(cx, cy) > W * 0.6;
    let turn = Math.sin(b.t * 0.21 + b.ph) * 0.22;
    if (far) { const want = Math.atan2(cy, cx), dh = Math.atan2(Math.sin(want - b.h), Math.cos(want - b.h)); turn += clamp(dh, -0.5, 0.5); }
    b.h += turn * dt;
    b.p[0] += Math.cos(b.h) * b.v * dt; b.p[1] += Math.sin(b.h) * b.v * dt; b.p[2] += clamp(b.alt - b.p[2], -0.3, 0.3) * dt;
    if (Math.random() < dt / 7) b.flap = 0.5 + Math.random() * 0.4;
    b.next -= dt;
    if (b.next < 0 && day) {
      const free = BIRDS.perches.map((_, j) => j).filter(j => !BIRDS.list.some(o => o.pj === j && o.mode !== 'glide'));
      if (Math.random() < 0.35 && free.length && BIRDS.list.filter(o => o.mode === 'perch').length < 5) { b.mode = 'land'; b.pj = free[Math.floor(Math.random() * free.length)]; }
      else if (BIRDS.thermals.length) {
        const c = BIRDS.thermals[Math.floor(Math.random() * BIRDS.thermals.length)];
        b.mode = 'circle'; b.c = c; b.R = 2.5 + Math.random() * 2.5; b.a = Math.atan2(b.p[1] - c[1], b.p[0] - c[0]); b.dur = 18 + Math.random() * 20;
        b.p[2] = Math.min(b.p[2], BIRDS.top + 3);
      }
      b.t = 0; b.next = 12 + Math.random() * 20;
    }
    if (!day && b.p[2] > 0) b.alt = BIRDS.top + 10;          // at night the soarers drift off
  }
}
function takeOff(b, h) { b.mode = 'flee'; b.t = 0; b.h = h; b.pj = -1; b.flap = 0.3; b.v = 1.4; b.ph = Math.random() * 9; }
// work near perched birds flushes them (bx, by: the gesture's point in the view buffer)
function birdsStartle(bx, by) {
  for (const b of BIRDS.list) {
    if (b.mode !== 'perch' && b.mode !== 'land') continue;
    const q = projIso(...b.p), d = Math.hypot(q[0] - bx, q[1] - by);
    if (d < 70) setTimeout(() => takeOff(b, Math.random() * 6.28), d * 6 + Math.random() * 120);
  }
}
const BIRD_GLIDE = [[-1, 0], [0, 0], [1, 0]], BIRD_UP = [[-1, -1], [0, 0], [1, -1]], BIRD_DN = [[-1, 1], [0, 0], [1, 1]];
function drawBirds(ctx) {
  if (!BIRDS.list.length || S.mode !== 'cut') return;
  const cutTop = S.level + HT / LH, cutting = S.level < NL - 1, night = !birdsAwake();
  const body = night ? '#6f7882' : LIT.on && LIT.sun === 'evening' ? '#f2d8b6' : '#f3f0e8', under = night ? '#4a525b' : '#bdb7aa';
  for (const b of BIRDS.list) {
    if (b.mode === 'perch' && cutting && b.p[2] > cutTop) continue;
    const q = projIso(...b.p), X = Math.round(q[0]), Y = Math.round(q[1]);
    WDT.D = depthKey(b.p[0], b.p[1], b.p[2]) + 0.15;
    if (b.mode === 'perch') {
      const bob = (Math.floor(b.t * 1.3 + b.ph) % 7) === 0 ? 1 : 0;   // a peck now and then
      if (wdt(X, Y - 1 + bob)) { ctx.fillStyle = body; ctx.fillRect(X, Y - 1 + bob, 1, 1); }
      if (wdt(X + b.face, Y - 1)) { ctx.fillStyle = body; ctx.fillRect(X + b.face, Y - 1, 1, 1); }
      if (wdt(X, Y)) { ctx.fillStyle = under; ctx.fillRect(X, Y, 1, 1); }
      continue;
    }
    const sh = b.flap > 0 ? ((Math.floor(b.t * 9) & 1) ? BIRD_UP : BIRD_DN) : BIRD_GLIDE;
    for (const [dx, dy] of sh) { if (!wdt(X + dx, Y + dy)) continue; ctx.fillStyle = dx === 0 ? under : body; ctx.fillRect(X + dx, Y + dy, 1, 1); }
  }
}
