// ==========================================================================
// Blueprints, jobs, drones. A job = ordered pieces (structure -> infill ->
// fit-out) shown first as ghosts, then carried in by drones from the crane.
// ==========================================================================
let JOBS = [], DRONES = [], PUFFS = [], JOBNO = 0;
const OWN = { claude: { col: '#ff7a52', name: 'claude' }, you: { col: '#5fd3f2', name: 'you' } };
const COST = { [T.FRAME]: 120, [T.CAPSULE]: 180, [T.DECK]: 90, [T.TERRACE]: 60, [T.TREE]: 45, [T.LAMP]: 30, [T.WATER]: 70 };
let UNITS = [];   // captured blueprints

function lightAt(x, y, z) {
  let sum = 0;
  for (const [dx, dy, wgt] of [[0, 0, 2], [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1]]) {
    let tr = 1;
    for (let zz = z + 1, cx = x + dx, cy = y + dy; zz < NL; zz++, cx += dx, cy += dy) {
      if (cx < 0 || cy < 0 || cx >= W || cy >= D) break;
      const t = cells[idx(cx, cy, zz)];
      if (t) { tr *= 1 - TI[t].op; if (tr < 0.02) { tr = 0; break; } }
    }
    sum += tr * wgt;
  }
  return sum / 6;
}
function findBridge(x0, y0, z, w, h) {
  let best = null;
  const tryRun = (sx, sy, dx, dy, axis) => {
    const run = [];
    for (let k = 1; k <= 10; k++) {
      const cx = sx + dx * k, cy = sy + dy * k, c = cell(cx, cy, z);
      if (!inb(cx, cy, z)) return;
      if (c === T.CORE || c === T.LIFT || c === T.DECK || c === T.TUBE) {
        const core = coreAt(cx, cy);
        if (!best || run.length < best.cells.length) best = { cells: run.slice(), target: core ? 'core ' + core.name : TI[c].name };
        return;
      }
      if (c !== 0) return;
      run.push({ x: cx, y: cy, z, axis });
    }
  };
  for (let y = y0; y < y0 + h; y++) { tryRun(x0 + w - 1, y, 1, 0, 0); tryRun(x0, y, -1, 0, 0); }
  for (let x = x0; x < x0 + w; x++) { tryRun(x, y0 + h - 1, 0, 1, 1); tryRun(x, y0, 0, -1, 1); }
  return best;
}
function stackPieces(x, y, z, br) {
  const P = [], rnd = mulberry32(x * 131 + y * 17 + z);
  for (let dz = 0; dz < 3; dz++) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) P.push({ x: x + dx, y: y + dy, z: z + dz, t: T.FRAME, v: 0, ph: 0, lab: 'support frame' });
  if (br) for (const c of br.cells) P.push({ x: c.x, y: c.y, z: c.z, t: T.DECK, v: c.axis, ph: 0, lab: 'sky-bridge deck' });
  for (let dz = 0; dz < 3; dz++) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) P.push({ x: x + dx, y: y + dy, z: z + dz, t: T.CAPSULE, v: (Math.floor(rnd() * 4)) | (Math.floor(rnd() * 2) << 2) | (Math.floor(rnd() * 4) << 3), ph: 1, lab: 'habitation capsule', rep: T.FRAME });
  for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) P.push({ x: x + dx, y: y + dy, z: z + 3, t: dx === dy ? T.TREE : T.TERRACE, v: dx === dy ? (dx ? 3 : 0) : 16, ph: 2, lab: dx === dy ? 'tree' : 'roof garden' });
  return P;
}
function bridgePieces(x, y, z, rot) {
  const d = [[1, 0], [0, 1], [-1, 0], [0, -1]][rot & 3], P = [];
  for (let k = 0; k < 6; k++) P.push({ x: x + d[0] * k, y: y + d[1] * k, z, t: T.DECK, v: rot & 1, ph: 0, lab: 'sky-bridge deck' });
  return P;
}
function gardenPieces(x, y, z) {
  const P = [];
  for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) P.push({ x: x + dx, y: y + dy, z, t: T.TERRACE, v: ((dx + dy) & 3) | ((dx + dy) % 3 === 0 ? 16 : 0), ph: 0, lab: 'terrace slab' });
  for (const [dx, dy, sp] of [[0, 0, 0], [2, 0, 3], [0, 2, 1], [2, 2, 0]]) P.push({ x: x + dx, y: y + dy, z, t: T.TREE, v: sp, ph: 2, lab: 'tree', rep: T.TERRACE });
  P.push({ x: x + 1, y: y + 1, z, t: T.LAMP, v: 1, ph: 2, lab: 'lamp', rep: T.TERRACE });
  return P;
}
function wellPieces(x, y, z) {
  const P = [];
  for (let zz = NL - 1; zz > z; zz--) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
    const c = cell(x + dx, y + dy, zz);
    if (c && c !== T.CORE && c !== T.LIFT && c !== T.CRANE) P.push({ x: x + dx, y: y + dy, z: zz, t: 0, v: 0, ph: 0, lab: 'remove ' + TI[c].name, op: 'remove' });
  }
  for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) P.push({ x: x + dx, y: y + dy, z, t: T.WATER, v: 1, ph: 2, lab: 'reflecting pool', rep: 'any' });
  return P;
}
function unitPieces(unit, x, y, z, rot) {
  const [w, d] = unit.size;
  return unit.pieces.map(p => {
    let dx = p.dx, dy = p.dy;
    for (let r = 0; r < (rot & 3); r++) { const nx = (r & 1 ? w : d) - 1 - dy; dy = dx; dx = nx; }
    const v = (TI[p.t].orient && (rot & 1)) ? p.v ^ 1 : p.v;
    return { x: x + dx, y: y + dy, z: z + p.dz, t: p.t, v, ph: PHASE_OF(p.t), lab: TI[p.t].name };
  });
}
function toolPieces(tool, x, y, z) {
  if (tool === 'stack') { const br = findBridge(x, y, z + 1, 2, 2); return stackPieces(x, y, z, br && br.cells.length <= 6 ? br : null); }
  if (tool === 'bridge') return bridgePieces(x, y, z, S.toolRot);
  if (tool === 'garden') return gardenPieces(x, y, z);
  if (tool === 'well') return wellPieces(x, y, z);
  if (tool === 'unit' && S.unit) return unitPieces(S.unit, x, y, z, S.toolRot);
  return [];
}
function pieceOK(p) {
  if (!inb(p.x, p.y, p.z)) return false;
  const c = cell(p.x, p.y, p.z);
  if (p.op === 'remove') return c !== 0 && c !== T.CORE && c !== T.LIFT;
  if (c === 0) return true;
  if (p.rep === 'any') return c !== T.CORE && c !== T.LIFT;
  return p.rep === c;
}
function sortPieces(P) {
  P.sort((a, b) => a.ph - b.ph || (a.op === 'remove' ? b.z - a.z : a.z - b.z) || a.y - b.y || a.x - b.x);
  const tot = {}, seen = {};
  for (const p of P) tot[p.lab] = (tot[p.lab] || 0) + 1;
  for (const p of P) { seen[p.lab] = (seen[p.lab] || 0) + 1; p.li = seen[p.lab]; p.lt = tot[p.lab]; }
  return P;
}
function jobMetrics(P) {
  let cost = 0, res = 0;
  const add = P.filter(p => p.state !== 'blocked');
  for (const p of add) { cost += p.op === 'remove' ? 40 : (COST[p.t] || 60); if (p.t === T.CAPSULE) res += 1; }
  const zmin = Math.min(...add.map(p => p.z)), foot = new Map();
  for (const p of add) if (p.z === zmin) foot.set(p.x + ',' + p.y, [p.x, p.y]);
  const probe = [];
  for (const [x, y] of foot.values()) for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) if (inb(x + dx, y + dy, zmin - 1)) probe.push([x + dx, y + dy, zmin - 1]);
  const before = probe.length ? probe.reduce((s, c) => s + light[idx(c[0], c[1], c[2])], 0) / probe.length : 0;
  const saved = add.map(p => [p, cells[idx(p.x, p.y, p.z)], vars[idx(p.x, p.y, p.z)]]);
  for (const p of add) if (inb(p.x, p.y, p.z)) cells[idx(p.x, p.y, p.z)] = p.op === 'remove' ? 0 : p.t;
  const after = probe.length ? probe.reduce((s, c) => s + lightAt(c[0], c[1], c[2]), 0) / probe.length : 0;
  const levels = {};
  for (const p of add) levels[p.z] = 1;
  const zs = Object.keys(levels).map(Number);
  const fillAfter = {};
  for (const z of zs) { let n = 0; for (let i = z * W * D, e = i + W * D; i < e; i++) if (cells[i]) n++; fillAfter[z] = n / (W * D); }
  for (const [p, c, v] of saved) if (inb(p.x, p.y, p.z)) { cells[idx(p.x, p.y, p.z)] = c; vars[idx(p.x, p.y, p.z)] = v; }
  const zf = zs.reduce((m, z) => WORLD.fill[z] > WORLD.fill[m] ? z : m, zs[0]);
  return { cost, res, before, after, zf, fb: WORLD.fill[zf], fa: fillAfter[zf], probeZ: zmin - 1 };
}
function makeJob(owner, kind, pieces, site, name) {
  sortPieces(pieces);
  for (const p of pieces) p.state = pieceOK(p) ? 'queued' : 'blocked';
  const j = { id: ++JOBNO, no: JOBNO, owner, kind, name, pieces, site, status: owner === 'you' ? 'building' : 'proposed', approveAt: S.time + 8, lastPh: -1 };
  j.m = jobMetrics(pieces);
  JOBS.push(j);
  return j;
}
function depot() { const c = WORLD.crane; return c ? [c.x - 1.2, c.y + 0.5, c.z + 1.6] : [24, 24, NL]; }
function dispatch(j, p) {
  p.state = 'flying';
  const from = depot(), to = [p.x + 0.5, p.y + 0.5, p.z + 0.55];
  const dist = Math.hypot(to[0] - from[0], to[1] - from[1], (to[2] - from[2]) * 1.5);
  DRONES.push({ j, p, from, to, t: 0, dur: REDUCED ? 0.4 : clamp(0.7 + dist * 0.035, 0.8, 2.0), trail: [], pos: from.slice() });
  if (j.owner === 'claude') AGENT.focus = p;
  if (p.ph !== j.lastPh) { j.lastPh = p.ph; phaseSpeech(j, p.ph); }
}
function bez(a, b, t, lift) { const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.max(a[2], b[2]) + lift]; const u = 1 - t; return [u * u * a[0] + 2 * u * t * m[0] + t * t * b[0], u * u * a[1] + 2 * u * t * m[1] + t * t * b[1], u * u * a[2] + 2 * u * t * m[2] + t * t * b[2]]; }
function land(d) {
  const p = d.p, j = d.j;
  if (!pieceOK(p)) { p.state = 'blocked'; log(j.owner, `Skipped ${p.lab} at (${p.x},${p.y},${lvCode(p.z)}) — occupied`, 'sys'); return; }
  if (p.op === 'remove') setC(p.x, p.y, p.z, 0); else setC(p.x, p.y, p.z, p.t, p.v);
  p.state = 'placed';
  markDirty(p.z);
  if (p.z > 0) markDirty(p.z - 1);
  computeLight(p.x - 5, p.y - 5, p.x + 5, p.y + 5, p.z);
  for (let z = 0; z < p.z - 1; z++) lazyLv.add(z);
  computeFill(); stripDirty = true;
  const verb = p.op === 'remove' ? 'Removing' : 'Placing';
  log(j.owner, `${verb} ${p.lab} ${p.li}/${p.lt} at (${p.x},${p.y},${lvCode(p.z)})`, 'p' + p.ph);
  sfx.tick(p.op === 'remove' ? 3 : p.ph, p.z);
  for (let k = 0; k < 6; k++) PUFFS.push({ x: p.x + 0.5, y: p.y + 0.5, z: p.z + 0.4, vx: (rr() - 0.5) * 1.2, vy: (rr() - 0.5) * 1.2, life: 0, max: 0.5 + rr() * 0.3, col: OWN[j.owner].col });
}
function updateJobs(dt) {
  for (const j of JOBS) {
    if (j.status === 'proposed' && j.owner === 'claude' && S.time >= j.approveAt) approveJob(j, true);
    if (j.status !== 'building') continue;
    let minPh = 9, flying = 0, left = 0;
    for (const p of j.pieces) { if (p.state === 'queued' || p.state === 'flying') { left++; if (p.ph < minPh) minPh = p.ph; } if (p.state === 'flying') flying++; }
    if (!left) { finishJob(j); continue; }
    if (flying < (j.owner === 'you' ? 3 : 2) && S.time >= (j.nextAt || 0)) {
      const p = j.pieces.find(q => q.state === 'queued' && q.ph === minPh);
      if (p) { dispatch(j, p); j.nextAt = S.time + (REDUCED ? 0.12 : 0.34); }
    }
  }
  for (let k = DRONES.length - 1; k >= 0; k--) {
    const d = DRONES[k];
    d.t += dt / d.dur;
    d.pos = bez(d.from, d.to, Math.min(1, easeIO(Math.min(1, d.t))), 3);
    d.trail.push(d.pos); if (d.trail.length > 9) d.trail.shift();
    if (d.t >= 1) { land(d); DRONES.splice(k, 1); }
  }
  for (let k = PUFFS.length - 1; k >= 0; k--) { const f = PUFFS[k]; f.life += dt; f.x += f.vx * dt; f.y += f.vy * dt; f.z += dt * 0.3; if (f.life > f.max) PUFFS.splice(k, 1); }
  JOBS = JOBS.filter(j => j.status !== 'rejected' && !(j.status === 'done' && S.time - j.doneAt > 1));
}
function finishJob(j) {
  j.status = 'done'; j.doneAt = S.time;
  const placed = j.pieces.filter(p => p.state === 'placed').length;
  if (j.kind === 'well' && !WORLD.wells.some(w => w.x === j.site.x && w.y === j.site.y)) {
    WORLD.wells.push({ x: j.site.x, y: j.site.y, s: 2 });
    for (let z = j.site.z; z < NL; z++) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) if (inb(j.site.x + dx, j.site.y + dy, z)) flags[idx(j.site.x + dx, j.site.y + dy, z)] |= F_WELL;
    for (let k = 0; k < 10; k++) MOTES.push({ w: WORLD.wells[WORLD.wells.length - 1], x: j.site.x + rr() * 2, y: j.site.y + rr() * 2, z: rr() * NL, ph: rr() * 6 });
  }
  log(j.owner, `${j.name} complete — ${placed} parts placed`, 'sys');
  sfx.done();
  if (j.owner === 'claude') agentJobDone(j);
  else toast(`${j.name} built · ${placed} parts`);
}
function approveJob(j, auto) {
  if (j.status !== 'proposed') return;
  j.status = 'building'; hideCard();
  log(j.owner, `Proposal ${String(j.no).padStart(2, '0')} ${auto ? 'auto-approved' : 'approved by you'}`, 'sys');
  sfx.approve();
  if (j.owner === 'claude') agentApproved(j);
}
function rejectJob(j) {
  if (j.status !== 'proposed') return;
  j.status = 'rejected'; hideCard();
  log('you', `Rejected proposal ${String(j.no).padStart(2, '0')}`, 'sys');
  sfx.reject();
  if (j.owner === 'claude') agentRejected(j);
}
function placeTool(x, y, z) {
  const P = toolPieces(S.tool, x, y, z);
  if (!P.length) return;
  const ok = P.filter(p => pieceOK(p)).length;
  if (!ok) { toast('Blocked — nothing placeable here on ' + lvCode(z)); sfx.reject(); return; }
  const names = { stack: 'Capsule stack', bridge: 'Sky bridge', garden: 'Garden terrace', well: 'Light well', unit: S.unit ? S.unit.name : 'Unit' };
  const j = makeJob('you', S.tool, P, { x, y, z }, names[S.tool]);
  log('you', `Placed ${j.name} ghost at (${x},${y},${lvCode(z)}) — ${ok} parts queued for drones`, 'sys');
  sfx.ghost();
}

// ---------------------------------------------------------------- drawing
function ghostVar(p) { return TI[p.t] && TI[p.t].orient ? (p.v & ~1) | screenAxis(p.v & 1) : p.v; }
function drawPieceGhostIso(ctx, p, col, alpha, sliced, bad) {
  const above = sliced && p.z > S.level;
  const eo = S.explode > 0.001 ? explodeOff(p.z) : 0;
  if (above || p.op === 'remove' || !p.t) {
    const hh = p.op === 'remove' ? 1 : 0.5;
    isoQuad(ctx, p.x, p.y, p.x + 1, p.y + 1, p.z + hh, bad ? '#e2573f' : (p.op === 'remove' ? '#e2573f' : col), [2, 1], eo);
    if (p.op === 'remove' && !above) { const a = projIso(p.x, p.y, p.z + 1), b = projIso(p.x + 1, p.y + 1, p.z + 1); pline(ctx, a[0], a[1], b[0], b[1], '#e2573f', [2, 1]); }
    return;
  }
  const r = toRot(p.x, p.y), b = isoBase(), spr = getGhost(p.t, ghostVar(p), col, bad);
  ctx.globalAlpha = alpha;
  ctx.drawImage(spr.c, b[0] + (r[0] - r[1]) * 8 + spr.ox, b[1] + (r[0] + r[1]) * 4 - p.z * LH + spr.oy + eo);
  ctx.globalAlpha = 1;
}
function sortedForPaint(P) { return P.slice().sort((a, b) => { const ra = toRot(a.x, a.y), rb = toRot(b.x, b.y); return a.z - b.z || (ra[0] + ra[1]) - (rb[0] + rb[1]); }); }
function drawBuildIso(ctx, t, sliced, ex) {
  for (const j of JOBS) {
    if (j.status !== 'proposed' && j.status !== 'building') continue;
    const col = OWN[j.owner].col;
    let next = null;
    if (j.status === 'building') next = j.pieces.find(p => p.state === 'queued');
    const pend0 = j.pieces.filter(p => p.state === 'queued' || p.state === 'flying' || (j.status === 'proposed' && p.state === 'blocked'));
    const byCell = new Map();   // one ghost per cell: final state while proposed, next step while building
    for (const p of pend0) { const k = p.x + ',' + p.y + ',' + p.z, o = byCell.get(k); if (!o || (j.status === 'proposed' ? p.ph > o.ph : p.ph < o.ph)) byCell.set(k, p); }
    const pend = [...byCell.values()];
    for (const p of sortedForPaint(pend)) {
      const pulse = p === next ? 0.55 + 0.35 * Math.sin(t * 8) : p.state === 'flying' ? 0.75 : (j.status === 'proposed' ? 0.5 : 0.32);
      drawPieceGhostIso(ctx, p, col, pulse, sliced, p.state === 'blocked');
    }
  }
  if (!ex && S.hover && !S.hover.top && ['stack', 'bridge', 'garden', 'well', 'unit'].includes(S.tool)) {
    const P = sortPieces(toolPieces(S.tool, S.hover.x, S.hover.y, S.level));
    for (const p of sortedForPaint(P)) drawPieceGhostIso(ctx, p, '#5fd3f2', 0.5, sliced, !pieceOK(p));
  }
  if (S.capture && !ex) {
    const c = S.capture, x0 = Math.min(c.x0, c.x1), x1 = Math.max(c.x0, c.x1) + 1, y0 = Math.min(c.y0, c.y1), y1 = Math.max(c.y0, c.y1) + 1;
    isoQuad(ctx, x0, y0, x1, y1, S.level + 0.03, '#5fd3f2');
    isoQuad(ctx, x0, y0, x1, y1, S.level + S.captureH, '#5fd3f2', [2, 2]);
    for (const [a, b] of [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]) { const p = projIso(a, b, S.level), q = projIso(a, b, S.level + S.captureH); pline(ctx, p[0], p[1], q[0], q[1], 'rgba(95,211,242,0.7)', [2, 2]); }
  }
  drawDemolish(ctx, ex);
  for (const f of PUFFS) { const [bx, by] = projIso(f.x, f.y, f.z); ctx.fillStyle = rgba(f.col, 0.8 * (1 - f.life / f.max)); ctx.fillRect(Math.round(bx), Math.round(by), 1, 1); }
  drawPinsIso(ctx, t, sliced);
  drawDronesIso(ctx, t, sliced);
  drawAgentIso(ctx, t, sliced, ex);
}
function drawPinsIso(ctx, t, sliced) {
  S.pins.forEach((p, k) => {
    const [bx, by] = projIso(p.x + 0.5, p.y + 0.5, p.z + (p.t && !TI[p.t].slab ? (sliced && p.z === S.level ? HT / LH : 1) : 0.25));
    const X = Math.round(bx), Y = Math.round(by), faint = sliced && p.z > S.level;
    ctx.globalAlpha = faint ? 0.45 : 1;
    R_(ctx, X, Y - 9, 1, 9, '#5fd3f2'); R_(ctx, X - 1, Y - 1, 3, 1, '#5fd3f2');
    plate(ctx, String(k + 1), X - 3, Y - 16, '#5fd3f2', '#04222b');
    ctx.globalAlpha = 1;
  });
}
function drawDronesIso(ctx, t, sliced) {
  for (const d of DRONES) {
    const col = OWN[d.j.owner].col;
    d.trail.forEach((q, k) => { const [bx, by] = projIso(q[0], q[1], q[2]); ctx.fillStyle = rgba(col, (k + 1) / d.trail.length * 0.5); ctx.fillRect(Math.round(bx), Math.round(by), 1, 1); });
    const [bx, by] = projIso(d.pos[0], d.pos[1], d.pos[2]), X = Math.round(bx), Y = Math.round(by);
    const above = sliced && d.pos[2] > S.level + 1;
    ctx.globalAlpha = above ? 0.55 : 1;
    R_(ctx, X - 2, Y - 1, 5, 1, '#1a1b1d'); R_(ctx, X - 1, Y - 2, 3, 2, col); R_(ctx, X - 3, Y - 2, 1, 1, '#d8d0bf'); R_(ctx, X + 3, Y - 2, 1, 1, '#d8d0bf');
    const pc = d.p.op === 'remove' ? '#e2573f' : (SEC_BASE[d.p.t] || '#999999');
    R_(ctx, X - 1, Y + 1, 3, 2, pc); R_(ctx, X, Y, 1, 1, '#2a2826');
    ctx.globalAlpha = 1;
  }
}
function drawBuildPlan(ctx, t) {
  const z = S.level, o = planOrigin();
  const sq = (x, y, col, dashed, fill) => {
    const r = toRot(x, y), X = o[0] + PM + r[0] * PS, Y = o[1] + PM + r[1] * PS;
    if (fill) { ctx.fillStyle = fill; ctx.fillRect(X, Y, PS, PS); }
    for (let k = 0; k < PS; k++) { if (dashed && (k & 2)) continue; R_(ctx, X + k, Y, 1, 1, col); R_(ctx, X + k, Y + PS - 1, 1, 1, col); R_(ctx, X, Y + k, 1, 1, col); R_(ctx, X + PS - 1, Y + k, 1, 1, col); }
  };
  const planCol = { claude: '#d4502a', you: '#1a8fb0' };
  for (const j of JOBS) {
    if (j.status !== 'proposed' && j.status !== 'building') continue;
    for (const p of j.pieces) {
      if (p.state === 'placed' || p.state === 'blocked' || p.z < z - 0 || p.z > z + 1) continue;
      if (p.z === z) sq(p.x, p.y, planCol[j.owner], false, rgba(planCol[j.owner], p.op === 'remove' ? 0.12 : 0.28));
      else sq(p.x, p.y, planCol[j.owner], true);
    }
  }
  if (S.hover && ['stack', 'bridge', 'garden', 'well', 'unit'].includes(S.tool))
    for (const p of toolPieces(S.tool, S.hover.x, S.hover.y, z)) if (p.z === z) sq(p.x, p.y, pieceOK(p) ? '#1a8fb0' : '#b8321c', false, pieceOK(p) ? 'rgba(26,143,176,0.25)' : 'rgba(184,50,28,0.25)');
  if (S.capture) { const c = S.capture; for (let y = Math.min(c.y0, c.y1); y <= Math.max(c.y0, c.y1); y++) for (let x = Math.min(c.x0, c.x1); x <= Math.max(c.x0, c.x1); x++) sq(x, y, '#1a8fb0', true, 'rgba(26,143,176,0.12)'); }
  if (S.hover) sq(S.hover.x, S.hover.y, '#c9861c', false);
  S.pins.forEach((p, k) => { const [bx, by] = projPlan(p.x + 0.5, p.y + 0.5); plate(ctx, String(k + 1), Math.round(bx) - 3, Math.round(by) - 4, p.z === z ? '#1a8fb0' : '#7aa9b8', '#ffffff'); });
  for (const d of DRONES) { const [bx, by] = projPlan(d.pos[0], d.pos[1]); R_(ctx, Math.round(bx) - 1, Math.round(by) - 1, 3, 3, planCol[d.j.owner]); }
  drawAgentPlan(ctx, t);
}
function drawBuildSec(ctx, t) {
  const o = secOrigin();
  const cellBox = (x, y, z, col, fill) => { const [bx, by] = projSec(x, y, z + 1); const X = Math.round(S.secAxis === 'x' ? bx : bx - SCW), Y = Math.round(by); if (fill) R_(ctx, X, Y, SCW, SCH, fill); for (let k = 0; k < SCW; k += 2) { R_(ctx, X + k, Y, 1, 1, col); R_(ctx, X + k, Y + SCH - 1, 1, 1, col); } for (let k = 0; k < SCH; k += 2) { R_(ctx, X, Y + k, 1, 1, col); R_(ctx, X + SCW - 1, Y + k, 1, 1, col); } };
  for (const j of JOBS) {
    if (j.status !== 'proposed' && j.status !== 'building') continue;
    for (const p of j.pieces) {
      if (p.state !== 'queued' && p.state !== 'flying') continue;
      const d = Math.abs(secDepth(p.x + 0.5, p.y + 0.5));
      if (d > 0.5) { if (d < 4) cellBox(p.x, p.y, p.z, rgba(OWN[j.owner].col, 0.35)); continue; }
      cellBox(p.x, p.y, p.z, OWN[j.owner].col, rgba(OWN[j.owner].col, 0.3));
    }
  }
  if (S.hover) cellBox(S.hover.x, S.hover.y, S.hover.z, '#f0b43c');
  for (const d of DRONES) { const [bx, by] = projSec(d.pos[0], d.pos[1], d.pos[2]); R_(ctx, Math.round(bx) - 1, Math.round(by) - 1, 3, 2, OWN[d.j.owner].col); }
  S.pins.forEach((p, k) => { if (Math.abs(secDepth(p.x + 0.5, p.y + 0.5)) > 0.5) return; const [bx, by] = projSec(p.x + 0.5, p.y + 0.5, p.z + 1); plate(ctx, String(k + 1), Math.round(bx) - 3, Math.round(by) - 9, '#5fd3f2', '#04222b'); });
  drawAgentSec(ctx, t);
}
