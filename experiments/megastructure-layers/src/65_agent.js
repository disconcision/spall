// ==========================================================================
// Embodied agent "claude": a visible cursor that surveys (gaze + sightline),
// proposes (ghost + card), then narrates a legible, ordered build.
// ==========================================================================
const AGENT = { x: 22, y: 20, z: 14, tx: 22, ty: 20, tz: 14, state: 'idle', timer: 2.5, cands: [], ci: 0, job: null, gaze: null,
  looking: false, lookT: 0, focus: null, requests: [], rejected: [], paused: false, level: 12, speechT: 0, pending: null, last: null, screen: null };
const pad2 = n => String(n).padStart(2, '0');
function agentReset() {
  Object.assign(AGENT, { x: 22, y: 20, z: 14, tx: 22, ty: 20, tz: 14, state: 'idle', timer: 2.5, cands: [], ci: 0, job: null, gaze: null, looking: false, focus: null, requests: [], rejected: [], pending: null, last: null, speechT: 0 });
  setAgentState('idle', 'idle');
}
function agentSay(text, dur) { AGENT.speechT = S.time + (dur || 5); const b = $('bubble'); if (b) b.textContent = text; }
function setAgentState(s, label) { AGENT.state = s; const e = $('agentState'); if (e) e.textContent = label || s; }
function moveAgent(x, y, z) { AGENT.tx = x; AGENT.ty = y; AGENT.tz = z; }
function siteScore(x, y, z) {
  if (x < 1 || y < 1 || x > W - 3 || y > D - 3 || z < G + 2 || z + 3 >= NL) return null;
  for (let dz = 0; dz < 3; dz++) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) if (!isEmpty(x + dx, y + dy, z + dz)) return null;
  let sup = 0;
  for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) if (supportAt(x + dx, y + dy, z)) sup++;
  if (sup < 2) return null;
  const br = findBridge(x, y, z + 1, 2, 2);
  if (!br || br.cells.length > 6) return null;
  let lt = 0;
  for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) lt += light[idx(x + dx, y + dy, z + 1)];
  lt /= 4;
  const fill = Math.max(WORLD.fill[z], WORLD.fill[z + 1], WORLD.fill[z + 2]);
  return { x, y, z, br, light: lt, fill, sup, score: lt * 2 - Math.max(0, fill - 0.42) * 5 - br.cells.length * 0.07 + sup * 0.05 + rr() * 0.1 };
}
function findSites(n, near) {
  const out = [];
  for (let k = 0; k < 900 && out.length < 24; k++) {
    let x, y, z;
    if (near) { x = near.x + Math.floor(rr() * 11) - 5; y = near.y + Math.floor(rr() * 11) - 5; z = near.z + Math.floor(rr() * 2); }
    else { x = 1 + Math.floor(rr() * (W - 3)); y = 1 + Math.floor(rr() * (D - 3)); z = [7, 8, 10, 11, 13][Math.floor(rr() * 5)]; }
    const s = siteScore(x, y, z);
    if (!s) continue;
    if (!near && AGENT.rejected.some(r => Math.abs(r.x - x) < 4 && Math.abs(r.y - y) < 4 && Math.abs(r.z - z) < 2)) continue;
    if (JOBS.some(j => (j.status === 'proposed' || j.status === 'building') && Math.abs(j.site.x - x) < 4 && Math.abs(j.site.y - y) < 4 && Math.abs(j.site.z - z) < 4)) continue;
    out.push(s);
  }
  out.sort((a, b) => b.score - a.score);
  const pick = [];
  for (const s of out) { if (pick.every(p => Math.abs(p.x - s.x) + Math.abs(p.y - s.y) > 6)) pick.push(s); if (pick.length >= n) break; }
  return pick;
}
const siteNote = s => `${lvCode(s.z)} (${s.x},${s.y}): daylight ${Math.round(s.light * 100)}%, fill ${Math.round(s.fill * 100)}%${s.fill > 0.5 ? ' (over cap)' : ''}, ${s.br.cells.length ? s.br.cells.length + '-cell bridge to ' + s.br.target : 'abuts ' + s.br.target}`;
function startSurvey() {
  const c = findSites(3);
  if (!c.length) { agentSay('No free bay with support and a bridge route right now. Waiting.', 3); AGENT.timer = 6; return; }
  AGENT.cands = c; AGENT.ci = 0;
  setAgentState('survey', 'surveying');
  agentSay(`Surveying ${c.length} bays for a capsule stack (light, fill cap, bridge).`, 3);
  log('claude', `Survey started: ${c.length} candidate bays`, 'sys');
  goLook(c[0]);
}
function goLook(s) { moveAgent(s.x + 2.4, s.y + 0.5, s.z + 3.2); AGENT.looking = false; AGENT.gaze = null; AGENT.level = s.z; }
function planFor(kind, pin) {
  const p = pin || { x: 24, y: 24, z: S.level, t: 0 };
  const zUp = p.t ? p.z + 1 : p.z;
  if (kind === 'stack') {
    const c = findSites(1, { x: p.x, y: p.y, z: Math.max(G + 2, zUp) });
    if (!c.length) return null;
    const s = c[0];
    return { kind, site: s, pieces: stackPieces(s.x, s.y, s.z, s.br), name: 'Capsule stack 2×2×3 + sky bridge', summary: `12 frames, 12 capsules, ${s.br.cells.length}-cell bridge to ${s.br.target}, roof garden`, note: siteNote(s) };
  }
  if (kind === 'garden') {
    let best = null;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const x = clamp(p.x - 1 + dx, 0, W - 3), y = clamp(p.y - 1 + dy, 0, D - 3);
      let free = 0, sup = 0;
      for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) { if (isEmpty(x + i, y + j, zUp)) free++; if (supportAt(x + i, y + j, zUp)) sup++; }
      const d = Math.abs(dx) + Math.abs(dy);
      if (free === 9 && sup >= 4 && (!best || d < best.d)) best = { x, y, d, sup };
    }
    if (!best) return null;
    const P = gardenPieces(best.x, best.y, zUp);
    return { kind, site: { x: best.x, y: best.y, z: zUp }, pieces: P, name: 'Garden terrace 3×3', summary: `${P.length} parts: slabs first, then 4 trees and a lamp`, note: `${lvCode(zUp)} (${best.x},${best.y}): ${best.d ? best.d + ' cells from your pin, ' : ''}${best.sup}/9 bays have structure below` };
  }
  if (kind === 'bridge') {
    const br = findBridge(p.x, p.y, p.z, 1, 1);
    if (!br || !br.cells.length) return null;
    const P = br.cells.map(c => ({ x: c.x, y: c.y, z: c.z, t: T.DECK, v: c.axis, ph: 0, lab: 'sky-bridge deck' }));
    return { kind, site: { x: p.x, y: p.y, z: p.z }, pieces: P, name: 'Sky bridge to ' + br.target, summary: `${P.length} deck segments at ${lvCode(p.z)}`, note: `${lvCode(p.z)}: shortest clear run from your pin is ${P.length} cells to ${br.target}` };
  }
  if (kind === 'well') {
    const x = clamp(p.x, 0, W - 2), y = clamp(p.y, 0, D - 2), P = wellPieces(x, y, p.z);
    const rem = P.filter(q => q.op === 'remove').length;
    return { kind, site: { x, y, z: p.z }, pieces: P, name: 'Light well 2×2', summary: `remove ${rem} parts above, pool at ${lvCode(p.z)}`, note: `${lvCode(p.z)} (${x},${y}): daylight here is ${Math.round(light[idx(x, y, p.z)] * 100)}%` };
  }
  return null;
}
function startRequest() {
  const r = AGENT.requests.shift();
  if (!r) return;
  AGENT.pending = r;
  setAgentState('look', 'reading your pin');
  const s = r.site;
  moveAgent(s.x + 2.4, s.y + 0.5, s.z + 2.2); AGENT.level = s.z; AGENT.looking = false; AGENT.gaze = null;
}
function proposeSite(site, kind, pieces, name, note) {
  const j = makeJob('claude', kind, pieces, { x: site.x, y: site.y, z: site.z }, name);
  AGENT.job = j; AGENT.last = { site, note, name };
  setAgentState('propose', 'awaiting approval');
  const xs = pieces.map(p => p.x), ys = pieces.map(p => p.y), zs = pieces.map(p => p.z);
  AGENT.gaze = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs) + 1, y1: Math.max(...ys) + 1, z0: Math.min(...zs), z1: Math.max(...zs) + 1 };
  showCard(j);
  agentSay(`Proposal ${pad2(j.no)}: ${name} at ${lvCode(site.z)}. Ghost is down — approve?`, 9);
  log('claude', `Proposed ${name} at (${site.x},${site.y},${lvCode(site.z)}) · ¤${j.m.cost} · +${j.m.res} residents`, 'sys');
  sfx.ghost();
}
function phaseSpeech(j, ph) {
  if (j.owner !== 'claude') return;
  const n = t => j.pieces.filter(p => p.ph === ph && p.t === t && p.state !== 'blocked').length;
  if (ph === 0) {
    const fr = n(T.FRAME), dk = n(T.DECK), rm = j.pieces.filter(p => p.op === 'remove').length;
    agentSay(rm ? `Clearing first: removing ${rm} parts from the shaft, top down.` : `Structure first: ${fr ? fr + ' support frames' : ''}${fr && dk ? ' + ' : ''}${dk ? dk + ' deck segments' : ''}${n(T.TERRACE) ? n(T.TERRACE) + ' terrace slabs' : ''}.`, 6);
  } else if (ph === 1) agentSay(`Infill: plugging ${n(T.CAPSULE)} capsules into the frame.`, 6);
  else agentSay('Fit-out: planting, pools and lamps last.', 5);
}
function agentApproved(j) { setAgentState('build', 'building'); AGENT.level = j.site.z; }
function agentRejected(j) {
  AGENT.rejected.push(j.site); AGENT.job = null; AGENT.gaze = null;
  agentSay("Understood. I'll look somewhere else.", 3);
  setAgentState('idle', 'idle'); AGENT.timer = 1.6;
}
function agentJobDone(j) {
  const res = j.pieces.filter(p => p.t === T.CAPSULE && p.state === 'placed').length;
  const br = j.pieces.filter(p => p.lab === 'sky-bridge deck' && p.state === 'placed').length;
  agentSay(res ? `Done: ${res} households housed${br ? ', bridge linked (' + br + ' cells)' : ''}. Roof garden planted.` : `Done: ${j.name}.`, 5);
  setAgentState('done', 'done'); AGENT.job = null; AGENT.focus = null; AGENT.gaze = null; AGENT.timer = 4;
}
function explainLast() {
  const L = AGENT.last;
  if (!L) return 'No proposal yet. I rank bays by daylight reaching them, the 50% fill cap per level, and how short a bridge to a core would be.';
  return `${L.name}: ${L.note}. I prefer bays that keep level fill under ~50% (light and air) and need the shortest bridge to a core.`;
}
function chatRespond(text) {
  const s = text.toLowerCase(), pin = S.pins[S.pins.length - 1] || null;
  if (/\b(why|explain|reason)\b/.test(s)) return explainLast();
  if (/\b(stop|pause|hold)\b/.test(s)) { AGENT.paused = true; return 'Pausing after the current piece. Say "resume" to carry on surveying.'; }
  if (/\b(resume|continue|go on)\b/.test(s)) { AGENT.paused = false; return 'Resuming the survey.'; }
  let kind = null;
  if (/garden|tree|green|park|plant/.test(s)) kind = 'garden';
  else if (/bridge|connect|link|cross/.test(s)) kind = 'bridge';
  else if (/light|well|dark|sun|void|air/.test(s)) kind = 'well';
  else if (/stack|capsule|hous|home|resid|build|unit|flat/.test(s)) kind = 'stack';
  if (!kind) return 'I can propose a capsule stack, a sky bridge, a garden terrace or a light well. Pin a spot (Alt-click or Point), then ask.';
  if (!pin && kind !== 'stack') return 'Pin a spot first (Alt-click or the Point tool) so I know where you mean.';
  const plan = planFor(kind, pin);
  const where = pin ? `${TI[pin.t].name} @ (${pin.x},${pin.y},${lvCode(pin.z)})` : 'somewhere near the middle';
  if (!plan) return `I checked ${where}: no room for that without demolishing supports. Try another pin?`;
  AGENT.requests.push(plan);
  if (AGENT.state === 'propose' && AGENT.job) { rejectQuiet(AGENT.job); }
  if (AGENT.state !== 'build' && AGENT.state !== 'look') startRequest();
  return `Plan for ${where}: ${plan.name}: ${plan.summary}. ${AGENT.state === 'build' ? 'After the current build I' : 'I'}'ll put the ghost down for you to approve.`;
}
function rejectQuiet(j) { j.status = 'rejected'; hideCard(); AGENT.job = null; }
function agentUpdate(dt) {
  const A = AGENT, k = REDUCED ? 1 : 1 - Math.exp(-dt * 3.4);
  A.x += (A.tx - A.x) * k; A.y += (A.ty - A.y) * k; A.z += (A.tz - A.z) * k;
  const arrived = Math.hypot(A.tx - A.x, A.ty - A.y) < 0.25 && Math.abs(A.tz - A.z) < 0.12;
  const lookDur = REDUCED ? 0.8 : 1.7;
  switch (A.state) {
    case 'idle': case 'done':
      A.timer -= dt;
      if (A.requests.length) startRequest();
      else if (A.timer <= 0 && !A.paused) { if (A.state === 'done') { setAgentState('idle', 'idle'); A.timer = 2.5; } else startSurvey(); }
      break;
    case 'survey': {
      if (A.requests.length) { startRequest(); break; }
      const c = A.cands[A.ci];
      if (!c) { setAgentState('idle', 'idle'); A.timer = 2; break; }
      if (arrived && !A.looking) {
        A.looking = true; A.lookT = S.time + lookDur;
        A.gaze = { x0: c.x, y0: c.y, x1: c.x + 2, y1: c.y + 2, z0: c.z, z1: c.z + 3 };
        agentSay('Looking at ' + siteNote(c), lookDur + 0.6);
        log('claude', 'Looked at ' + siteNote(c), 'sys');
        sfx.look();
      } else if (A.looking && S.time >= A.lookT) {
        A.looking = false; A.ci++;
        if (A.ci < A.cands.length) goLook(A.cands[A.ci]);
        else {
          const best = A.cands.slice().sort((a, b) => b.score - a.score)[0];
          if (siteScore(best.x, best.y, best.z)) proposeSite(best, 'stack', stackPieces(best.x, best.y, best.z, best.br), 'Capsule stack 2×2×3 + sky bridge', siteNote(best));
          else { setAgentState('idle', 'idle'); A.timer = 1; }
        }
      }
      break;
    }
    case 'look': {
      const r = A.pending;
      if (!r) { setAgentState('idle', 'idle'); break; }
      if (arrived && !A.looking) {
        A.looking = true; A.lookT = S.time + lookDur;
        const xs = r.pieces.map(p => p.x), ys = r.pieces.map(p => p.y), zs = r.pieces.map(p => p.z);
        A.gaze = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs) + 1, y1: Math.max(...ys) + 1, z0: Math.min(...zs), z1: Math.max(...zs) + 1 };
        agentSay('Checking your pin: ' + r.note, lookDur + 0.6); sfx.look();
      } else if (A.looking && S.time >= A.lookT) {
        A.looking = false; A.pending = null;
        proposeSite(r.site, r.kind, r.pieces, r.name, r.note);
      }
      break;
    }
    case 'propose':
      if (!A.job || A.job.status === 'rejected') { setAgentState('idle', 'idle'); A.timer = 1.5; }
      break;
    case 'build':
      if (A.focus) {
        const f = A.focus;
        moveAgent(f.x + 1.6, f.y + 0.2, f.z + 1.4);
        A.gaze = { x0: f.x, y0: f.y, x1: f.x + 1, y1: f.y + 1, z0: f.z, z1: f.z + 1 };
        A.level = f.z;
      }
      break;
  }
}

// ---------------------------------------------------------------- drawing
const ARROW = ['X.........', 'XX........', 'XWX.......', 'XWWX......', 'XWWWX.....', 'XWWWWX....', 'XWWWWWX...', 'XWWWWWWX..', 'XWWWWWWWX.', 'XWWWWXXXXX', 'XWXXWWX...', 'XX..XWWX..', 'X....XWX..', '.....XX...'];
let ARROWC = null;
function arrowSprite() {
  const c = mk(10, 14), g = c.getContext('2d');
  ARROW.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === 'X') R_(g, x, y, 1, 1, '#2a0f06'); if (ch === 'W') R_(g, x, y, 1, 1, x <= 2 ? '#ffb08f' : '#ff7a52'); }));
  return c;
}
function gazeBoxIso(ctx, gz, col, eo) {
  isoQuad(ctx, gz.x0, gz.y0, gz.x1, gz.y1, gz.z0 + 0.02, col, [3, 2], eo);
  isoQuad(ctx, gz.x0, gz.y0, gz.x1, gz.y1, gz.z1, col, [1, 2], eo);
  for (const [a, b] of [[gz.x0, gz.y1], [gz.x1, gz.y1], [gz.x1, gz.y0]]) { const p = projIso(a, b, gz.z0), q = projIso(a, b, gz.z1); pline(ctx, p[0], p[1], q[0], q[1], col, [1, 2]); }
}
function drawAgentIso(ctx, t, sliced, ex) {
  if (!ARROWC) ARROWC = arrowSprite();
  const A = AGENT, bob = REDUCED ? 0 : Math.sin(t * 2.3) * 0.05;
  const [bx, by] = projIso(A.x, A.y, A.z + bob);
  const off = sliced && A.level > S.level;
  if (A.gaze) {
    const gz = A.gaze, gAbove = sliced && gz.z0 > S.level;
    const col = gAbove ? 'rgba(255,122,82,0.4)' : '#ff7a52';
    gazeBoxIso(ctx, gz, col, ex ? explodeOff(gz.z0) : 0);
    const c = projIso((gz.x0 + gz.x1) / 2, (gz.y0 + gz.y1) / 2, gz.z0 + 0.5);
    pline(ctx, bx, by, c[0], c[1], gAbove ? 'rgba(255,122,82,0.35)' : 'rgba(255,122,82,0.85)', [2, 2]);
    if (!REDUCED && Math.sin(t * 9) > 0) R_(ctx, Math.round(c[0]) - 1, Math.round(c[1]) - 1, 3, 3, '#ff7a52');
  }
  let X = Math.round(bx), Y = Math.round(by);
  const xl = Math.round(S.safeL / S.zoom) + 4, xr = Math.round((S.cssW - S.safeR) / S.zoom) - 70;
  const inView = X >= xl - 4 && Y >= 0 && X < xr + 60 && Y < S.bh - 20;
  if (!inView) { X = clamp(X, xl, Math.max(xl, xr)); Y = clamp(Y, 4, S.bh - 34); }
  ctx.globalAlpha = off ? 0.5 : 1;
  ctx.drawImage(ARROWC, X, Y);
  ctx.globalAlpha = 1;
  if (!inView) plate(ctx, 'OFF VIEW ' + lvCode(A.level), X + 12, Y, '#ff7a52', '#2a0f06');
  else if (sliced && A.level !== S.level) plate(ctx, (A.level > S.level ? '↑ ' : '↓ ') + lvCode(A.level), X + 12, Y + 12, '#ff7a52', '#2a0f06');
  A.screen = [X, Y, inView, off || (sliced && A.level !== S.level)];
}
function drawAgentPlan(ctx, t) {
  if (!ARROWC) ARROWC = arrowSprite();
  const A = AGENT, [bx, by] = projPlan(A.x, A.y), off = A.level !== S.level;
  if (A.gaze && A.gaze.z0 <= S.level && A.gaze.z1 > S.level) {
    const a = projPlan(A.gaze.x0, A.gaze.y0), b = projPlan(A.gaze.x1, A.gaze.y1);
    const x0 = Math.min(a[0], b[0]), y0 = Math.min(a[1], b[1]), x1 = Math.max(a[0], b[0]), y1 = Math.max(a[1], b[1]);
    for (let x = x0; x < x1; x += 2) { R_(ctx, x, y0, 1, 1, '#d4502a'); R_(ctx, x, y1 - 1, 1, 1, '#d4502a'); }
    for (let y = y0; y < y1; y += 2) { R_(ctx, x0, y, 1, 1, '#d4502a'); R_(ctx, x1 - 1, y, 1, 1, '#d4502a'); }
  }
  const X = Math.round(bx), Y = Math.round(by);
  ctx.globalAlpha = off ? 0.55 : 1; ctx.drawImage(ARROWC, X, Y); ctx.globalAlpha = 1;
  if (off) plate(ctx, (A.level > S.level ? '↑ ' : '↓ ') + lvCode(A.level), X + 12, Y + 12, '#ff7a52', '#2a0f06');
  A.screen = [X, Y, true, off];
}
function drawAgentSec(ctx, t) {
  if (!ARROWC) ARROWC = arrowSprite();
  const A = AGENT, [bx, by] = projSec(A.x, A.y, A.z), d = Math.abs(secDepth(A.x, A.y));
  if (A.gaze) {
    const a = projSec(A.gaze.x0, A.gaze.y0, A.gaze.z1), b = projSec(A.gaze.x1, A.gaze.y1, A.gaze.z0);
    const x0 = Math.round(Math.min(a[0], b[0])), x1 = Math.round(Math.max(a[0], b[0])), y0 = Math.round(a[1]), y1 = Math.round(b[1]);
    const col = d < 3 ? '#ff7a52' : 'rgba(255,122,82,0.45)';
    for (let x = x0; x < x1; x += 2) { R_(ctx, x, y0, 1, 1, col); R_(ctx, x, y1 - 1, 1, 1, col); }
    for (let y = y0; y < y1; y += 2) { R_(ctx, x0, y, 1, 1, col); R_(ctx, x1 - 1, y, 1, 1, col); }
  }
  const X = Math.round(bx), Y = Math.round(by);
  ctx.globalAlpha = d < 3 ? 1 : 0.5; ctx.drawImage(ARROWC, X, Y); ctx.globalAlpha = 1;
  if (d >= 3) plate(ctx, (secDepth(A.x, A.y) > 0 ? 'BEHIND ' : 'IN FRONT ') + Math.round(d), X + 12, Y + 12, '#ff7a52', '#2a0f06');
  A.screen = [X, Y, true, d >= 3];
}
