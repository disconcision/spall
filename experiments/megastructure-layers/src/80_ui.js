// ==========================================================================
// DOM UI: level strip, section thumbnail, tools, proposal card, log, chat,
// status line, agent tag / speech bubble placement, toasts.
// ==========================================================================
let stripDirty = true, CARDJOB = null, toastT = 0, pinSeq = 0;
const STRIPB = [];
const MODES = ['cut', 'exploded', 'plan', 'section'];
const BUILD_TOOLS = ['stack', 'bridge', 'garden', 'well'];

function buildStrip() {
  const ol = $('levels'); ol.innerHTML = '';
  for (let z = NL - 1; z >= 0; z--) {
    const li = document.createElement('li');
    if (z === G - 1) li.className = 'gl';
    const b = document.createElement('button');
    b.type = 'button'; b.dataset.z = z;
    b.title = `${LEVELS[z].code} ${LEVELS[z].name} — click to cut here`;
    b.innerHTML = `<span class="c">${LEVELS[z].code}</span><span class="n">${LEVELS[z].name}</span><span class="f"><i></i></span><span class="a"></span>`;
    b.addEventListener('click', () => { if (S.mode === 'exploded') setMode('cut'); setLevel(z); });
    li.appendChild(b); ol.appendChild(li); STRIPB[z] = b;
  }
}
function updateStrip() {
  for (let z = 0; z < NL; z++) {
    const b = STRIPB[z]; if (!b) continue;
    const f = WORLD.fill[z], on = z === S.level;
    b.classList.toggle('on', on);
    b.setAttribute('aria-current', on ? 'true' : 'false');
    b.classList.toggle('over', f > 0.5 && z >= G);
    b.classList.toggle('ag', AGENT.state !== 'idle' && AGENT.level === z);
    b.querySelector('.f i').style.width = Math.round(Math.min(1, f) * 100) + '%';
  }
  const sliced = S.level < NL - 1;
  $('stripCut').textContent = S.mode === 'exploded' ? 'exploded' : sliced ? 'cut ' + lvCode(S.level) : 'full stack';
  renderThumb();
  stripDirty = false;
}
function renderThumb() {
  const c = $('thumb'), g = c.getContext('2d');
  g.fillStyle = '#101113'; g.fillRect(0, 0, 96, 54);
  const row = S.mode === 'section' ? S.secIdx : 24;
  for (let a = 0; a < W; a++) for (let z = 0; z < NL; z++) {
    const [x, y] = S.mode === 'section' ? secXY(a) : [a, row], t = cell(x, y, z);
    if (!t) continue;
    const cat = TI[t].cat;
    g.fillStyle = t === T.CORE || t === T.LIFT ? '#cfc7b6' : cat === 'earth' ? '#3a2f25' : cat === 'circ' ? '#b08a3e' : cat === 'land' ? (t === T.WATER ? '#3f7d73' : '#5d893d') : cat === 'infill' ? '#8a7f70' : '#55585b';
    g.fillRect(a * 2, (NL - 1 - z) * 3, 2, 3);
  }
  g.fillStyle = 'rgba(232,168,60,0.95)';
  const y = (NL - 1 - S.level) * 3;
  g.fillRect(0, y, 96, 1); g.fillRect(0, y + 2, 96, 1);
  if (AGENT.state !== 'idle') { g.fillStyle = '#ff7a52'; g.fillRect(94, (NL - 1 - AGENT.level) * 3, 2, 3); }
}
function drawToolIcons() {
  const P = painter(4);
  const icon = (tool, fn) => { const b = document.querySelector(`#tools [data-tool="${tool}"] canvas`); if (!b) return; const g = b.getContext('2d'); g.clearRect(0, 0, 30, 22); fn(g); };
  icon('stack', g => { for (let k = 0; k < 3; k++) { box(g, 11, 12 - k * 5, 8, 5, P.t(CAPC[k][0]), P.l(CAPC[k][1]), P.r(CAPC[k][2])); } box(g, 19, 12, 8, 1, P.t('#9a9488'), P.l('#6f6a5f'), P.r('#57534a')); });
  icon('bridge', g => { box(g, 3, 8, 12, 2, P.t('#9a9488'), P.l('#6f6a5f'), P.r('#57534a')); box(g, 11, 12, 12, 2, P.t('#9a9488'), P.l('#6f6a5f'), P.r('#57534a')); R_(g, 5, 9, 18, 1, P.t('#cfa645')); });
  icon('garden', g => { box(g, 5, 10, 20, 3, P.t('#5d893d'), P.l('#7a7367'), P.r('#5f5a51')); R_(g, 12, 4, 6, 6, P.t('#3f7236')); R_(g, 13, 3, 3, 2, P.t('#6f9f4a')); R_(g, 14, 10, 1, 2, '#5a4030'); });
  icon('well', g => { box(g, 5, 10, 20, 3, P.t('#2b5853'), P.l('#6b645a'), P.r('#524c44')); pline(g, 9, 12, 21, 18, '#e6dfcf'); pline(g, 21, 12, 9, 18, '#e6dfcf'); R_(g, 14, 1, 2, 8, 'rgba(255,236,190,0.6)'); });
}
function setTool(t, unit) {
  S.tool = t; S.capture = null;
  if (unit) S.unit = unit;
  document.querySelectorAll('#tools [data-tool]').forEach(b => b.setAttribute('aria-pressed', b.dataset.tool === t && (t !== 'unit' || b.unitRef === S.unit) ? 'true' : 'false'));
  const dir = ['+x', '+y', '−x', '−y'][S.toolRot & 3];
  const msg = {
    inspect: 'Hover to inspect. Only the active level is editable; dbl-click a visible part to cut there.',
    stack: 'Capsule stack 2×2×3: frames, then capsules, then roof garden. Adds a bridge if a core is ≤6 away.',
    bridge: `Sky bridge, 6 deck segments along ${dir}. R turns.`,
    garden: 'Garden terrace 3×3: slabs first, then 4 trees and a lamp.',
    well: 'Light well 2×2: drones remove infill above (top down), then a pool on this level.',
    capture: `Drag a box on the active level to save it as a unit. Height <button type="button" id="hMinus" aria-label="Lower">−</button> ${S.captureH} <button type="button" id="hPlus" aria-label="Higher">+</button> levels`,
    point: 'Click to pin a spot for claude (Alt-click works with any tool). The pin becomes a chat chip.',
    unit: S.unit ? `Stamp ${S.unit.name} (${S.unit.size.join('×')}, ${S.unit.pieces.length} parts). R turns (${dir}).` : ''
  }[t] || '';
  $('toolOpt').innerHTML = msg;
  const hm = $('hMinus'), hp = $('hPlus');
  if (hm) hm.onclick = () => { S.captureH = Math.max(1, S.captureH - 1); setTool('capture'); };
  if (hp) hp.onclick = () => { S.captureH = Math.min(4, S.captureH + 1); setTool('capture'); };
  if (t !== 'inspect' && t !== 'point' && (S.mode === 'exploded' || S.mode === 'section')) toast('Placing works in Cut plane or Plan views');
  if (t !== 'inspect') $('tools').classList.remove('collapsed');
}
function addUnitButton(u) {
  const b = document.createElement('button');
  b.type = 'button'; b.dataset.tool = 'unit'; b.unitRef = u; b.setAttribute('aria-pressed', 'false');
  const c = mk(30, 22); c.style.width = '30px'; c.style.height = '22px';
  const g = c.getContext('2d'), [w, d, h] = u.size;
  const sc = Math.min(1, 26 / ((w + d) * 8), 20 / ((w + d) * 4 + h * LH)), tmp = mk((w + d) * 8 + 16, (w + d) * 4 + h * LH + 24), tg = tmp.getContext('2d');
  const sorted = u.pieces.slice().sort((a, b2) => a.dz - b2.dz || (a.dx + a.dy) - (b2.dx + b2.dy));
  for (const p of sorted) { const spr = getSprite(p.t, p.t === T.CRANE ? 0 : (TI[p.t].orient ? p.v & 1 : p.v) & 255, 4, 0, 0); tg.drawImage(spr.c, d * 8 + (p.dx - p.dy) * 8 + spr.ox + 8, (p.dx + p.dy) * 4 - p.dz * LH + h * LH + spr.oy + 12); }
  g.imageSmoothingEnabled = false;
  g.drawImage(tmp, 0, 0, tmp.width, tmp.height, (30 - tmp.width * sc) / 2, (22 - tmp.height * sc) / 2, tmp.width * sc, tmp.height * sc);
  b.appendChild(c); b.appendChild(document.createTextNode(u.name));
  b.addEventListener('click', () => setTool('unit', u));
  $('units').appendChild(b);
}
function log(owner, text, cls) {
  const el = $('log'), li = document.createElement('li');
  li.className = owner + ' ' + (cls || '') + ' new';
  const tm = document.createElement('time'); tm.textContent = fmtTime(S.time);
  const b = document.createElement('b'); b.textContent = OWN[owner] ? OWN[owner].name : owner;
  li.appendChild(tm); li.appendChild(b); li.appendChild(document.createTextNode(text));
  el.appendChild(li);
  while (el.children.length > 120) el.removeChild(el.firstChild);
  el.scrollTop = el.scrollHeight;
  setTimeout(() => li.classList.remove('new'), 1800);
}
function toast(text) { const t = $('toast'); t.textContent = text; t.hidden = false; toastT = S.time + 2.6; }
function showCard(j) {
  CARDJOB = j; $('card').hidden = false;
  const ph = [0, 0, 0], zs = j.pieces.map(p => p.z);
  j.pieces.forEach(p => { if (p.state !== 'blocked') ph[p.ph]++; });
  const blocked = j.pieces.filter(p => p.state === 'blocked').length;
  $('cNo').textContent = 'Proposal ' + pad2(j.no);
  $('cBy').textContent = 'by ' + OWN[j.owner].name; $('cBy').className = 'by' + (j.owner === 'you' ? ' you' : '');
  $('cTitle').textContent = j.name;
  $('cSite').textContent = `(${j.site.x},${j.site.y}) · ${lvCode(Math.min(...zs))}–${lvCode(Math.max(...zs))}`;
  $('cParts').textContent = `${ph[0]} structure · ${ph[1]} infill · ${ph[2]} fit-out${blocked ? ' · ' + blocked + ' blocked' : ''}`;
  $('cCost').textContent = '¤ ' + j.m.cost.toLocaleString('en-US');
  $('cRes').textContent = j.m.res ? '+' + j.m.res + ' households' : '—';
  const drop = j.m.before - j.m.after;
  $('cLight').textContent = j.m.probeZ >= 0 ? `${lvCode(j.m.probeZ)}: ${Math.round(j.m.before * 100)}% → ${Math.round(j.m.after * 100)}% sky` : '—';
  $('cLight').className = drop > 0.12 ? 'warn' : '';
  $('cFill').textContent = j.m.zf != null ? `${lvCode(j.m.zf)}: ${Math.round(j.m.fb * 100)}% → ${Math.round(j.m.fa * 100)}% (cap 50%)` : '—';
  $('cFill').className = j.m.fa > 0.5 ? 'warn' : '';
}
function hideCard() { CARDJOB = null; $('card').hidden = true; }
function renderChips() {
  const el = $('chips'); el.innerHTML = '';
  S.pins.forEach((p, k) => {
    const s = document.createElement('span'); s.className = 'chip';
    s.appendChild(document.createTextNode(`◎${k + 1} ${TI[p.t].name} @ (${p.x},${p.y},${lvCode(p.z)})`));
    const x = document.createElement('button'); x.type = 'button'; x.textContent = '×'; x.setAttribute('aria-label', 'Remove pin ' + (k + 1));
    x.onclick = () => { S.pins.splice(k, 1); renderChips(); };
    s.appendChild(x); el.appendChild(s);
  });
}
function addPin(h) {
  const t = cell(h.x, h.y, h.z);
  S.pins.push({ x: h.x, y: h.y, z: h.z, t, id: ++pinSeq });
  if (S.pins.length > 4) S.pins.shift();
  renderChips(); sfx.pin();
  toast(`Pinned ${TI[t].name} @ (${h.x},${h.y},${lvCode(h.z)}) — now ask claude in the chat`);
}
function addMsg(who, text, ctx) {
  const el = $('msgs'), li = document.createElement('li');
  li.className = who === 'me' ? 'me' : 'ai';
  if (ctx) { const s = document.createElement('span'); s.className = 'ctx'; s.textContent = ctx; li.appendChild(s); }
  if (who !== 'me') { const b = document.createElement('b'); b.textContent = 'claude '; li.appendChild(b); }
  li.appendChild(document.createTextNode(text));
  el.appendChild(li); el.scrollTop = el.scrollHeight;
}
function sendChat(text) {
  text = text.trim(); if (!text) return;
  const pin = S.pins[S.pins.length - 1];
  addMsg('me', text, pin ? `Selected: ${TI[pin.t].name} @ (${pin.x},${pin.y},${lvCode(pin.z)})` : null);
  sfx.chat();
  setTimeout(() => { addMsg('ai', chatRespond(text)); sfx.chat(); }, REDUCED ? 50 : 600);
}
function describe(h) {
  if (!h) return '';
  const t = h.t, nm = t ? TI[t].name : 'open air';
  return `${nm} · (${h.x},${h.y}) · ${lvCode(h.z)} ${LEVELS[h.z].name}`;
}
function updateStatus() {
  const sl = $('slice'), sliced = S.level < NL - 1;
  let txt, on = false;
  if (S.mode === 'exploded') txt = 'Exploded · ' + STRATA.length + ' strata';
  else if (S.mode === 'plan') { txt = 'Plan ' + lvCode(S.level); on = true; }
  else if (S.mode === 'section') txt = 'Section ' + (S.secAxis === 'x' ? 'row ' : 'col ') + S.secIdx;
  else if (sliced) { txt = 'Slice active · ' + lvCode(S.level); on = true; }
  else txt = 'Full stack · read-only picks';
  sl.textContent = txt; sl.classList.toggle('on', on);
  const h = S.hover;
  let ht = '';
  if (h) {
    ht = `<b>${(h.t ? TI[h.t].name : 'open air')}</b> · (${h.x},${h.y}) · ${lvCode(h.z)}`;
    if (h.top) ht += ' · read-only (dbl-click to cut here)';
    else if (h.stratum != null) ht += ` · stratum “${STRATA[h.stratum][2]}” — click to focus`;
    else if (!h.t && S.mode === 'cut' && sliced) { for (let z = h.z - 1; z >= 0; z--) { const b = cell(h.x, h.y, z); if (b) { ht += ` · open: you see ${TI[b].name} on ${lvCode(z)}`; break; } } }
  } else if (S.mode === 'cut' && !sliced) ht = 'Full stack: picks are read-only · dbl-click a part to cut to its level';
  else if (S.mode === 'cut' || S.mode === 'plan') ht = `Editing ${lvCode(S.level)} ${LEVELS[S.level].name} only`;
  const hv = $('hover'); if (hv.innerHTML !== ht) hv.innerHTML = ht;
  $('viewinfo').textContent = `×${S.zoom} · ${['N', 'E', 'S', 'W'][S.rot]}-up · ${TODS[S.tod].name.toLowerCase()}`;
  document.querySelectorAll('.tb-modes [data-mode]').forEach(b => b.setAttribute('aria-selected', b.dataset.mode === S.mode ? 'true' : 'false'));
}
function updateTip(cssX, cssY) {
  const tip = $('tip'), h = S.hover;
  if (!h || cssX == null) { tip.style.transform = 'translate(-9999px,0)'; return; }
  let s = `<b>${lvCode(h.z)}</b> ${h.t ? TI[h.t].name : 'open air'} · ${h.x},${h.y}`;
  if (S.tool === 'capture' && S.capture) s = `capture ${Math.abs(S.capture.x1 - S.capture.x0) + 1}×${Math.abs(S.capture.y1 - S.capture.y0) + 1}×${S.captureH}`;
  if (tip.innerHTML !== s) tip.innerHTML = s;
  const x = Math.min(cssX + 16, S.cssW - tip.offsetWidth - 4), y = Math.min(cssY + 18, S.cssH - 50);
  tip.style.transform = `translate(${x}px,${y}px)`;
}
function updateAgentDom() {
  const A = AGENT, sc = A.screen, tag = $('agentTag'), bub = $('bubble');
  if (!sc) { tag.style.transform = bub.style.transform = 'translate(-9999px,0)'; return; }
  const X = sc[0] * S.zoom, Y = sc[1] * S.zoom, off = !!sc[3];
  tag.classList.toggle('off', off);
  const label = 'claude' + (off ? ' · ' + lvCode(A.level) : '');
  if (tag.textContent !== label) tag.textContent = label;
  tag.style.transform = `translate(${Math.round(clamp(X + 11 * S.zoom, S.safeL + 2, S.cssW - S.safeR - tag.offsetWidth - 4))}px,${Math.round(Math.min(Y + 13 * S.zoom, S.cssH - 44))}px)`;
  if (S.time < A.speechT) {
    const bx = Math.max(S.safeL + 4, Math.min(X + 12, S.cssW - S.safeR - bub.offsetWidth - 6));
    let by = Y - bub.offsetHeight - 10;
    if (by < 4) by = Math.min(Y + 18 * S.zoom + 8, S.cssH - bub.offsetHeight - 40);
    bub.style.transform = `translate(${Math.round(bx)}px,${Math.round(by)}px)`;
    bub.classList.toggle('dim', off);
  } else bub.style.transform = 'translate(-9999px,0)';
}
function uiTick() {
  if (stripDirty) updateStrip();
  updateStatus();
  if (CARDJOB) { const r = clamp((CARDJOB.approveAt - S.time) / 8, 0, 1); $('cTimer').style.width = (r * 100).toFixed(1) + '%'; }
  if (toastT && S.time > toastT) { $('toast').hidden = true; toastT = 0; }
}
function setupUI() {
  buildStrip(); drawToolIcons();
  document.querySelectorAll('.tb-modes [data-mode]').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
  document.querySelectorAll('#tools [data-tool]').forEach(b => { if (b.dataset.tool !== 'unit') b.addEventListener('click', () => setTool(b.dataset.tool)); });
  $('toolsHead').addEventListener('click', () => { $('tools').classList.toggle('collapsed'); $('toolsHead').setAttribute('aria-expanded', !$('tools').classList.contains('collapsed')); resize(); });
  $('bGhost').onclick = () => toggleGhost();
  $('bShade').onclick = () => { S.shade = !S.shade; $('bShade').setAttribute('aria-pressed', S.shade); };
  $('bFollow').onclick = () => toggleFollow();
  $('bTod').onclick = () => cycleTod();
  $('bRotL').onclick = () => rotate(-1);
  $('bRotR').onclick = () => rotate(1);
  $('bRegen').onclick = () => { S.seed += 1; regenerateWorld(); };
  $('bSound').onclick = () => {
    if (!AUD.ctx || !AUD.on) { if (audStart()) { $('bSound').textContent = 'Sound live'; $('bSound').classList.add('live'); sfx.mode(S.mode); } else toast('Web Audio is not available here'); }
    else { AUD.on = false; applyVol(); $('bSound').textContent = 'Sound on'; $('bSound').classList.remove('live'); }
  };
  $('bMute').onclick = () => toggleMute();
  $('vol').oninput = e => { AUD.vol = e.target.value / 100; applyVol(); };
  $('bApprove').onclick = () => { if (CARDJOB) approveJob(CARDJOB, false); };
  $('bReject').onclick = () => { if (CARDJOB) rejectJob(CARDJOB); };
  $('thumb').addEventListener('click', e => { const r = e.target.getBoundingClientRect(); const z = NL - 1 - Math.floor((e.clientY - r.top) / r.height * NL); if (S.mode === 'exploded') setMode('cut'); setLevel(clamp(z, 0, NL - 1)); });
  $('chatf').addEventListener('submit', e => { e.preventDefault(); const i = $('chatIn'); sendChat(i.value); i.value = ''; });
  for (const s of ['Add a garden here', 'Connect this to the nearest core', 'Build housing near here', 'Open a light well here', 'Why there?']) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = s; b.onclick = () => sendChat(s); $('sugg').appendChild(b);
  }
  addMsg('ai', "I'm the coral cursor. I survey bays, drop a ghost with a proposal card, and build only once it's approved (auto after 8 s). Pin a spot with Alt-click, then ask for a garden, bridge, housing or a light well.");
  setTool('inspect');
}
