// ==========================================================================
// Main loop, drawing-board backdrop for plan/section, boot, test hooks.
// ==========================================================================
let lastNow = 0, audAcc = 0, uiAcc = 0;
function step(dt) {
  S.time += dt;
  if (S.cutAnim !== S.level) {
    S.cutT = Math.min(1, S.cutT + dt / 0.22);
    S.cutAnim = lerp(S.cutFrom, S.level, 1 - Math.pow(1 - S.cutT, 3));
    if (S.cutT >= 1) { S.cutAnim = S.level; sfx.arrive(S.level); }
  }
  if (S.explode !== S.explodeTarget) { const d = S.explodeTarget - S.explode; S.explode += Math.sign(d) * Math.min(Math.abs(d), dt / 0.5); }
  S.modeT = Math.min(1, (S.modeT || 0) + dt / 0.2);
  if (S.camTarget) {
    const k = 1 - Math.exp(-dt * 7);
    S.cam.x += (S.camTarget.x - S.cam.x) * k; S.cam.y += (S.camTarget.y - S.cam.y) * k;
    if (Math.hypot(S.camTarget.x - S.cam.x, S.camTarget.y - S.cam.y) < 0.5) S.camTarget = null;
  }
  heldPan(dt);
  updateLife(dt); updateJobs(dt); if (!WIRES.agentOff) agentUpdate(dt); updateWires(dt); updateBirds(dt);
  if (S.follow && AGENT.state !== 'idle') {
    if (S.mode !== 'exploded' && AGENT.level !== S.level && S.time - (S.lastFollow || -9) > 0.9) { S.lastFollow = S.time; setLevel(AGENT.level); }
    if (S.mode === 'cut' && AGENT.screen && !S.camTarget) {
      const [X, Y] = AGENT.screen;
      if (X < S.bw * 0.22 || X > S.bw * 0.72 || Y < S.bh * 0.22 || Y > S.bh * 0.78) S.camTarget = { x: S.cam.x + (X - S.bw / 2), y: S.cam.y + (Y - S.bh / 2) };
    }
    if (S.mode === 'section') { const want = S.secAxis === 'x' ? Math.floor(AGENT.ty) : Math.floor(AGENT.tx); if (want !== S.secIdx && want >= 0 && want < W) { S.secIdx = want; secDirty = true; } }
  }
  audAcc += dt; if (audAcc > 0.1) { audAcc = 0; audTick(); }
  uiAcc += dt; if (uiAcc > 0.1) { uiAcc = 0; uiTick(); }
}
function drawBoard(ctx) {
  ctx.fillStyle = '#0c0d0e'; ctx.fillRect(0, 0, S.bw, S.bh);
  ctx.fillStyle = '#16181a';
  for (let y = 0; y < S.bh; y += 16) ctx.fillRect(0, y, S.bw, 1);
  for (let x = 0; x < S.bw; x += 16) ctx.fillRect(x, 0, 1, S.bh);
}
function sheetIn() { return REDUCED ? 0 : Math.round((1 - easeIO(S.modeT || 1)) * 14); }
function renderPlan(ctx, t) {
  for (const z of dirtyLv) buildLevel(z, false);
  if (planDirty) buildPlan();
  drawBoard(ctx);
  const o = planOrigin(), dy = sheetIn();
  ctx.save(); ctx.translate(0, dy);
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(o[0] + 4, o[1] + 4, PLAN.c.width, PLAN.c.height);
  ctx.drawImage(PLAN.c, o[0], o[1]);
  drawLifePlan(ctx, t); drawBuildPlan(ctx, t);
  ctx.restore();
}
function renderSec(ctx, t) {
  for (const z of dirtyLv) buildLevel(z, false);
  if (secDirty) buildSection();
  drawBoard(ctx);
  const o = secOrigin(), dy = sheetIn();
  ctx.save(); ctx.translate(0, dy);
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(o[0] + 4, o[1] + 4, SEC.c.width, SEC.c.height);
  ctx.drawImage(SEC.c, o[0], o[1]);
  const wc = WATERCYC[S.tod], wt = Math.floor(t * 5);
  for (let a = 0; a < W; a++) for (const z of [0, 9]) {
    const [x, y] = secXY(a), c = cell(x, y, z);
    if (c !== T.WATER && !(c === T.VAULT && z === 0)) continue;
    const col = wc[(a + wt) & 7] || '#3f7d73';
    R_(ctx, o[0] + SML + a * SCW + ((a * 3 + wt) % 6), o[1] + SMT + (NL - z) * SCH - 5, 2, 1, col);
  }
  drawLifeSec(ctx, t); drawBuildSec(ctx, t);
  ctx.restore();
}
function render() {
  const ctx = VIEW.ctx;
  if (!ctx) return;
  if (S.mode === 'plan') { renderPlan(ctx, S.time); drawInkPlan(ctx); }
  else if (S.mode === 'section') renderSec(ctx, S.time);
  else { renderIso(ctx, S.time); drawInkIso(ctx); }
  updateAgentDom();
}
function frame(now) {
  const dt = lastNow ? Math.min(0.05, (now - lastNow) / 1000) : 0.016;
  lastNow = now;
  requestAnimationFrame(frame);
  try { step(dt); render(); } catch (e) { if (!frame.warned) { frame.warned = true; console.error(e); } }
}
function boot() {
  generate(S.seed);
  if (LIT.on) { LIT.sun = 'noon'; S.tod = 'day'; }
  setupUI(); setupInput(); setupSense(); resize();
  if (S.cssW < 700) setZoom(1);
  initLife(); seedWires(); markAllDirty();
  let agentPref = '1'; try { agentPref = localStorage.getItem('stratum.agent') || '1'; } catch (e) { /* no storage: claude stays on */ }
  setAgentOn(agentPref === '1');
  centerOn(24, 24, 6);
  if (WIRES.stage) { setLevel(WIRES.stage.view, { silent: true, snap: true }); centerOn(...WIRES.stage.focus); }
  $('seedv').textContent = S.seed;
  $('bShade').setAttribute('aria-pressed', 'true');
  log('sys', `World generated · seed ${S.seed} · ${WORLD.cores.length} cores, ${WORLD.paths.length} transit runs, ${WORLD.wells.length} light wells`, 'sys');
  updateStrip(); updateStatus();
  requestAnimationFrame(frame);
}

// ---- hooks used by the local test wrapper (screenshots); harmless in the page ----
function demoAgent(stage) {
  const c = findSites(1);
  if (!c.length) return;
  const s = c[0];
  AGENT.x = AGENT.tx = s.x + 2.4; AGENT.y = AGENT.ty = s.y + 0.5; AGENT.z = AGENT.tz = s.z + 3;
  proposeSite(s, 'stack', stackPieces(s.x, s.y, s.z, s.br), 'Capsule stack 2×2×3 + sky bridge', siteNote(s));
  setLevel(s.z + 1, { silent: true, snap: true });
  centerOn(s.x + 1, s.y + 1, s.z + 1);
  if (stage === 'proposal') return s;
  approveJob(AGENT.job, false);
  const j = JOBS[JOBS.length - 1];
  for (let k = 0; k < 3000; k++) { step(1 / 30); if (j.pieces.filter(p => p.state === 'placed').length >= j.pieces.length * (stage === 'done' ? 1 : 0.55)) break; }
  for (let k = 0; k < 8; k++) step(1 / 30);
  return s;
}
window.STRATUM = {
  MM, MIC, MOON, simSpeech, worldAt, streamJSON, inkUndo, inkClear, engPick,
  speakClip: url => { if (MIC.on || !isMoon()) return false; micStart(false, url); return true; },   // tests: a recorded clip into Moonshine, never the mic
  S, AGENT, WIRES, LAY, WGRAB, seedWires, jolt, tieStroke, stepWires, JOBS: () => JOBS, setMode, setLevel, rotate, setTod, setZoom, toggleGhost, toggleFollow, centerOn, demoAgent,
  step(sec) { const n = Math.round(sec * 30); for (let k = 0; k < n; k++) step(1 / 30); },
  test(p) {
    if (p.zoom) setZoom(+p.zoom);
    if (p.tod) setTod(p.tod);
    if (p.rot) for (let k = 0; k < +p.rot; k++) rotate(1);
    if (p.seed) { S.seed = +p.seed; regenerateWorld(); }
    if (p.t) this.step(+p.t);
    if (p.level != null) setLevel(+p.level, { silent: true, snap: true });
    if (p.ghost) toggleGhost(true);
    if (p.follow) toggleFollow(true);
    if (p.agent) demoAgent(p.agent);
    if (p.cam) { const [x, y, z] = p.cam.split(',').map(Number); centerOn(x, y, z); }
    if (p.sec) S.secIdx = +p.sec;
    if (p.axis) S.secAxis = p.axis;
    if (p.mode) { setMode(p.mode); S.explode = S.explodeTarget; if (S.camTarget) { S.cam.x = S.camTarget.x; S.cam.y = S.camTarget.y; S.camTarget = null; } S.modeT = 1; }
    if (p.hover) { const [x, y] = p.hover.split(',').map(Number); const r = toRot(x, y); S.hover = { x, y, z: S.level, t: cell(x, y, S.level), u: r[0], v: r[1] }; }
    if (p.stratum != null) S.hoverStratum = +p.stratum;
    if (p.tool) setTool(p.tool);
    if (p.pin) { const [x, y, z] = p.pin.split(',').map(Number); addPin({ x, y, z }); }
    if (p.chat) sendChat(p.chat);
    if (p.t2) this.step(+p.t2);
    render();
    if (p.perf) { const t0 = performance.now(); for (let k = 0; k < 30; k++) { step(1 / 60); render(); } window.__perf = ((performance.now() - t0) / 30).toFixed(2) + 'ms/frame'; }
  }
};
setTimeout(boot, 0);   // after the later script parts (route builders) have run
