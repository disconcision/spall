// ==========================================================================
// Life: transit pods on decks/tubes, pedestrians, lift cars, steam, motes,
// daylight columns in the light wells.
// ==========================================================================
let PODS = [], PEDS = [], STEAM = [], MOTES = [];
const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const PEDCOL = ['#c9b8a0', '#7a5a48', '#4f6a74', '#a04a3a', '#d9c38a', '#3f4a3a', '#b98a6a', '#6a6e7a', '#e0d6c0', '#8a3a2a'];
const SKIN = ['#e0bc96', '#9a6a48', '#c89870'];
const PODSPR = [];
function podSprites() {
  const cols = [['#e2dbc9', '#c8432b', '#9a948a'], ['#d6a84a', '#3a3632', '#94753a']];
  for (let ax = 0; ax < 2; ax++) { PODSPR[ax] = []; for (let c = 0; c < 2; c++) {
    const cv = mk(11, 8), g = cv.getContext('2d'), C = cols[c], lit = S.tod !== 'day';
    for (let k = 0; k < 8; k++) {
      const x = ax === 0 ? 1 + k : 9 - k, y = 1 + (k >> 1);
      R_(g, x, y, 1, 1, shadeRGB(C[0], 't', 4)); R_(g, x, y + 1, 1, 2, lit && k > 0 && k < 7 ? '#ffd98a' : shadeRGB(C[1], 'l', 4)); R_(g, x, y + 3, 1, 1, shadeRGB(C[2], 'r', 4));
    }
    PODSPR[ax][c] = cv;
  } }
}
function walkable(x, y, z) { const t = cell(x, y, z); if (!t || !TI[t].walk) return false; const up = cell(x, y, z + 1); return !(up && TI[up].poche); }
function initLife() {
  podSprites();
  PODS = [];
  for (const p of WORLD.paths) {
    const n = p.kind === 'tube' ? 2 : (p.cells.length > 12 ? 2 : 1);
    for (let k = 0; k < n; k++) PODS.push({ p, s: rr() * (p.cells.length - 1), dir: rr() < 0.5 ? 1 : -1, sp: 2.2 + rr() * 1.8, wait: 0, col: rr() < 0.5 ? 0 : 1, side: 0, lastW: -9 });
  }
  const walk = [];
  for (let z = 0; z < NL; z++) for (let y = 0; y < D; y++) for (let x = 0; x < W; x++) if (walkable(x, y, z)) walk.push([x, y, z]);
  PEDS = [];
  for (let k = 0; k < 260 && walk.length; k++) {
    const c = walk[Math.floor(rr() * walk.length)];
    PEDS.push({ x: c[0], y: c[1], z: c[2], tx: c[0], ty: c[1], f: 1, ox: 0.2 + rr() * 0.6, oy: 0.2 + rr() * 0.6, sp: 0.35 + rr() * 0.5, col: PEDCOL[k % PEDCOL.length], skin: SKIN[k % 3], dx: 0, dy: 0 });
  }
  STEAM = []; MOTES = [];
  for (const w of WORLD.wells) for (let k = 0; k < 18; k++) MOTES.push({ w, x: w.x + rr() * w.s, y: w.y + rr() * w.s, z: rr() * NL, ph: rr() * 6 });
}
function podPos(pod) {
  const cs = pod.p.cells, L = cs.length - 1, i = Math.min(L, Math.floor(pod.s)), f = pod.s - i, a = cs[i], b = cs[Math.min(i + 1, L)];
  const o = (a.perp[0] || a.perp[1]) ? (pod.dir > 0 ? 0.25 : 0.75) : 0.5;
  return [lerp(a.x, b.x, f) + 0.5 + a.perp[0] * o, lerp(a.y, b.y, f) + 0.5 + a.perp[1] * o, pod.p.z + (pod.p.kind === 'tube' ? 0.3 : 0.25), a.axis];
}
function updateLife(dt) {
  const cx = S.bw / 2;
  for (const pod of PODS) {
    if (pod.wait > 0) { pod.wait -= dt; continue; }
    const L = pod.p.cells.length - 1;
    pod.s += pod.dir * pod.sp * dt;
    if (pod.s >= L) { pod.s = L; pod.dir = -1; pod.wait = 1 + rr() * 1.6; }
    else if (pod.s <= 0) { pod.s = 0; pod.dir = 1; pod.wait = 1 + rr() * 1.6; }
    if (S.mode === 'cut' || S.mode === 'exploded') {
      const [px, py, pz] = podPos(pod), [sx, sy] = projIso(px, py, pz);
      const side = sx < cx ? -1 : 1;
      const dz = Math.abs(pod.p.z - S.level), near = S.mode === 'exploded' ? 0.35 : (dz === 0 ? 1 : dz <= 2 ? 0.45 : pod.p.z > S.level ? 0 : 0.15);
      if (pod.side && side !== pod.side && near > 0 && sy > 0 && sy < S.bh && S.time - pod.lastW > 2.5) { pod.lastW = S.time; sfx.whoosh(side, near); }
      pod.side = side;
    }
  }
  for (const p of PEDS) {
    p.f += dt * p.sp;
    if (p.f < 1) continue;
    p.x = p.tx; p.y = p.ty; p.f = 0;
    const opts = [];
    for (const d of DIRS4) if (walkable(p.x + d[0], p.y + d[1], p.z)) opts.push(d);
    if (!opts.length) { p.f = 1; continue; }
    const straight = opts.find(o => o[0] === p.dx && o[1] === p.dy);
    const ch = (straight && rr() < 0.7) ? straight : opts[Math.floor(rr() * opts.length)];
    p.dx = ch[0]; p.dy = ch[1]; p.tx = p.x + ch[0]; p.ty = p.y + ch[1];
  }
  for (const l of WORLD.lifts) {
    if (l.wait > 0) { l.wait -= dt; continue; }
    const d = l.target - l.z, st = Math.sign(d) * Math.min(Math.abs(d), dt * 1.6);
    l.z += st;
    if (Math.abs(l.target - l.z) < 0.001) { l.z = l.target; l.wait = 1.5 + rr() * 3; l.target = Math.floor(rr() * (l.top + 1)); }
  }
  if (!REDUCED) for (const e of WORLD.emitters) {
    if (rr() < dt * (e.k === 'vent' ? 1.6 : 1.1) && STEAM.length < 240)
      STEAM.push({ e, x: e.x + 0.3 + rr() * 0.4, y: e.y + 0.3 + rr() * 0.4, z: e.z + (e.k === 'vent' ? 0.55 : 0.28), vx: 0.12 + rr() * 0.1, vy: -0.05 + rr() * 0.1, vz: 0.25 + rr() * 0.12, life: 0, max: 2.5 + rr() * 2.5 });
  }
  for (let k = STEAM.length - 1; k >= 0; k--) {
    const s = STEAM[k]; s.life += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
    if (s.life > s.max) STEAM.splice(k, 1);
  }
  for (const m of MOTES) { m.z -= dt * 0.12; m.x += Math.sin(S.time * 0.7 + m.ph) * dt * 0.08; if (m.z < 0.2) m.z = NL - 0.5; }
}
function drawPed(ctx, bx, by, p) { ctx.fillStyle = p.skin; ctx.fillRect(bx, by - 3, 1, 1); ctx.fillStyle = p.col; ctx.fillRect(bx, by - 2, 1, 2); }
function drawLifeLevel(ctx, z, t) {
  const ex = S.explode > 0.001;
  for (const pod of PODS) {
    if (pod.p.z !== z) continue;
    const [px, py, pz, ax] = podPos(pod), [bx, by] = projIso(px, py, pz);
    if (bx < -12 || by < -12 || bx > S.bw + 12 || by > S.bh + 12) continue;
    ctx.globalAlpha = pod.p.kind === 'tube' ? 0.85 : 1;
    ctx.drawImage(PODSPR[screenAxis(ax)][pod.col], Math.round(bx) - 5, Math.round(by) - 6);
    ctx.globalAlpha = 1;
  }
  for (const p of PEDS) {
    if (p.z !== z) continue;
    const [bx, by] = projIso(lerp(p.x, p.tx, p.f) + p.ox, lerp(p.y, p.ty, p.f) + p.oy, z + 0.25);
    if (bx < 0 || by < 0 || bx > S.bw || by > S.bh) continue;
    drawPed(ctx, Math.round(bx), Math.round(by), p);
  }
  if (!ex && z === S.level && z < NL - 1) for (const l of WORLD.lifts) {
    if (l.top < z) continue;
    const at = Math.abs(l.z - z) < 0.5, below = l.z < z - 0.5 && l.z > z - 4;
    if (!at && !below) continue;
    const [bx, by] = projIso(l.x + 0.5, l.y + 0.5, z + HT / LH), X = Math.round(bx), Y = Math.round(by);
    if (at) { dia(ctx, X - 4, Y - 1, 8, '#d8b36a'); R_(ctx, X - 1, Y, 2, 1, '#8a6a36'); R_(ctx, X, Y - 3, 1, 3, '#3a3835'); }
    else { ctx.fillStyle = `rgba(216,179,106,${(0.5 - (z - l.z) * 0.1).toFixed(2)})`; ctx.fillRect(X - 2, Y + 1, 4, 1); }
  }
}
function drawSteam(ctx, t, maxZ) {
  for (const s of STEAM) {
    if (s.e.z > maxZ || s.z > maxZ + 1.4) continue;
    const [bx, by] = projIso(s.x, s.y, s.z), k = s.life / s.max, sz = 1 + Math.floor(k * 3);
    ctx.fillStyle = `rgba(222,216,204,${(0.34 * (1 - k)).toFixed(3)})`;
    ctx.fillRect(Math.round(bx) - (sz >> 1), Math.round(by) - (sz >> 1), sz, sz);
  }
}
function drawWellLight(ctx, t, maxZ) {
  const night = S.tod === 'night';
  for (const w of WORLD.wells) {
    const topH = Math.min(NL, maxZ + 1), botH = 0.35;
    const pts = [[w.x, w.y], [w.x + w.s, w.y], [w.x + w.s, w.y + w.s], [w.x, w.y + w.s]];
    const T0 = pts.map(p => projIso(p[0], p[1], topH)), B0 = pts.map(p => projIso(p[0], p[1], botH));
    const xl = Math.min(...T0.map(p => p[0])), xr = Math.max(...T0.map(p => p[0]));
    const ytop = Math.min(...T0.map(p => p[1])), ybot = Math.max(...B0.map(p => p[1]));
    ctx.fillStyle = night ? 'rgba(160,190,200,0.035)' : S.tod === 'dusk' ? 'rgba(255,196,120,0.06)' : 'rgba(255,246,220,0.07)';
    for (let x = Math.round(xl); x < xr; x += 2) ctx.fillRect(x, Math.round(ytop), 1, Math.round(ybot - ytop));
    if (!night) for (const m of MOTES) {
      if (m.w !== w || m.z > maxZ + 1) continue;
      const [bx, by] = projIso(m.x, m.y, m.z);
      if ((Math.sin(t * 3 + m.ph * 5) + 1) > 0.8) { ctx.fillStyle = 'rgba(255,240,205,0.8)'; ctx.fillRect(Math.round(bx), Math.round(by), 1, 1); }
    }
  }
}
function drawLifePlan(ctx, t) {
  const z = S.level;
  for (const pod of PODS) {
    if (pod.p.z !== z) continue;
    const [px, py] = podPos(pod), [bx, by] = projPlan(px, py);
    R_(ctx, Math.round(bx) - 2, Math.round(by) - 2, 4, 4, '#23201c'); R_(ctx, Math.round(bx) - 1, Math.round(by) - 1, 2, 2, pod.col ? '#d6a84a' : '#c8432b');
  }
  for (const p of PEDS) { if (p.z !== z) continue; const [bx, by] = projPlan(lerp(p.x, p.tx, p.f) + p.ox, lerp(p.y, p.ty, p.f) + p.oy); R_(ctx, Math.round(bx), Math.round(by), 1, 1, '#3a342c'); }
  for (const l of WORLD.lifts) if (Math.abs(l.z - z) < 0.5) { const [bx, by] = projPlan(l.x, l.y); R_(ctx, bx + 2, by + 2, 4, 4, '#e8a83c'); }
}
function drawLifeSec(ctx, t) {
  for (const l of WORLD.lifts) {
    if (Math.abs(secDepth(l.x + 0.5, l.y + 0.5)) > 0.5) continue;
    const [bx, by] = projSec(l.x + 0.5, l.y + 0.5, l.z);
    R_(ctx, Math.round(bx) - 3, Math.round(by) - 10, 6, 10, '#2a2724'); R_(ctx, Math.round(bx) - 2, Math.round(by) - 9, 4, 8, '#d8b36a');
    const o = secOrigin(); R_(ctx, Math.round(bx), o[1] + SMT + (NL - 1 - l.top) * SCH, 1, Math.round(by) - 10 - (o[1] + SMT + (NL - 1 - l.top) * SCH), '#5a5752');
  }
  for (const pod of PODS) {
    const [px, py, pz] = podPos(pod), d = secDepth(px, py);
    if (Math.abs(d) > 1.2) continue;
    const [bx, by] = projSec(px, py, pz - 0.25);
    ctx.globalAlpha = 1 - Math.abs(d) * 0.5;
    R_(ctx, Math.round(bx) - 4, Math.round(by) - 7, 8, 5, pod.col ? '#d6a84a' : '#e2dbc9'); R_(ctx, Math.round(bx) - 3, Math.round(by) - 6, 6, 1, S.tod === 'day' ? '#3a3632' : '#ffd98a');
    ctx.globalAlpha = 1;
  }
  for (const p of PEDS) {
    const px = lerp(p.x, p.tx, p.f) + p.ox, py = lerp(p.y, p.ty, p.f) + p.oy;
    if (Math.abs(secDepth(px, py)) > 0.5) continue;
    const [bx, by] = projSec(px, py, p.z + 0.25);
    R_(ctx, Math.round(bx), Math.round(by) - 4, 1, 1, p.skin); R_(ctx, Math.round(bx), Math.round(by) - 3, 1, 3, p.col);
  }
}
