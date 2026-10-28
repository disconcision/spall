// ==========================================================================
// Live lighting (the L-series studies, running for real). Volumes over the
// cell grid, half a cell across and a quarter cell up, are worked out once per
// world or sun change: what each voxel lets through, how much sky it sees and
// how much sun reaches it. Each level's cached image is lit from them as it is
// built (sun and shadow, sky light, occlusion), so a settled frame costs
// nothing extra. Mist is a tint per level at composite time; light shafts and
// night bloom are overlays cached per view and drawn with one call a frame.
// ==========================================================================
const LIT = {
  on: true,
  sunOn: true, sky: true, ao: true,   // baked into the level images (changing them relights)
  mist: true, shafts: true, bloom: true, mistA: 0.035, shaftK: 1, bloomK: 1,   // drawn per frame
  sun: 'noon',                        // 'morning' | 'noon' | 'evening' | 'night'
  tkey: '', skey: '', tr: null, skyV: null, sunSoft: null, sunHard: null, sv: null,
  shaftC: null, shKey: '', bloomC: null, blKey: ''
};
const LNX = W * 2, LNY = D * 2, LNZ = NL * 4, LLAY = LNX * LNY;
const LIGHT_TIMES = ['morning', 'noon', 'evening', 'night'];
const MIST = { morning: [104, 98, 94], noon: [62, 78, 90], evening: [104, 74, 58], night: [18, 26, 36] };
const litFloor = () => S.lightFloor || 0;   // the coarse baked sky term stays under the live light, as in the studies
const litSun = () => LIT.on && LIT.sunOn && LIT.sun !== 'night' ? SUNS[LIT.sun] : null;
const litKey = () => [LIT.skey, LIT.sunOn, LIT.sky, LIT.ao].join('|');   // what the baked light depends on

// how much light a voxel lets through (0 solid .. 1 open air)
function litTrans(t, f) {
  if (!t) return 1;
  switch (t) {
    case T.TREE: return f > 0.35 ? 0.3 : 1;
    case T.FRAME: case T.TRUSS: case T.CRANE: return 0.7;
    case T.PILLAR: case T.LAMP: case T.ANTENNA: case T.VENT: case T.PIPE: return 0.85;
    case T.VAULT: return 0.6;
  }
  const o = occOf(t); return o && f >= o[0] && f <= o[1] ? 0 : 1;
}
// light arriving along dir, swept down one voxel layer at a time from the open sky; each
// layer reads the one above (bilinear), so it is soft: right for sky light and shafts
function sweepSoft(dir, out, wgt) {
  const tr = LIT.tr, k = 0.25 / dir[2], ox = dir[0] * k * 2, oy = dir[1] * k * 2;
  const cur = new Float32Array(LLAY), prev = new Float32Array(LLAY).fill(1);
  const at = (xi, yi) => xi < 0 || yi < 0 || xi >= LNX || yi >= LNY ? 1 : prev[yi * LNX + xi];
  for (let z = LNZ - 1; z >= 0; z--) {
    for (let y = 0; y < LNY; y++) for (let x = 0; x < LNX; x++) {
      const fx = x + ox, fy = y + oy, x0 = Math.floor(fx), y0 = Math.floor(fy), wx = fx - x0, wy = fy - y0;
      const up = (at(x0, y0) * (1 - wx) + at(x0 + 1, y0) * wx) * (1 - wy) + (at(x0, y0 + 1) * (1 - wx) + at(x0 + 1, y0 + 1) * wx) * wy;
      const i = y * LNX + x, v = tr[z * LLAY + i] * up;
      cur[i] = v; out[z * LLAY + i] += v * wgt;
    }
    prev.set(cur);
  }
}
function ensureLightVol() {
  let h = 0; for (let i = 0; i < cells.length; i++) h = (h * 31 + cells[i]) | 0;
  const tkey = String(h), skey = tkey + ':' + LIT.sun;
  if (LIT.tkey !== tkey) {
    const tr = LIT.tr || (LIT.tr = new Float32Array(LLAY * LNZ));
    for (let z = 0; z < LNZ; z++) { const cz = z >> 2, f = ((z & 3) + 0.5) / 4;
      for (let y = 0; y < LNY; y++) for (let x = 0; x < LNX; x++) tr[z * LLAY + y * LNX + x] = litTrans(cells[idx(x >> 1, y >> 1, cz)], f); }
    const sky = LIT.skyV || (LIT.skyV = new Float32Array(LLAY * LNZ)); sky.fill(0);
    for (const [d, w] of [[[0, 0, 1], 2], [[0.6, 0, 0.8], 1], [[-0.6, 0, 0.8], 1], [[0, 0.6, 0.8], 1], [[0, -0.6, 0.8], 1]]) sweepSoft(d, sky, w / 6);
    LIT.tkey = tkey; LIT.skey = '';
  }
  if (LIT.skey !== skey) {
    const s = litSun();
    LIT.sv = s ? sunVec(LIT.sun) : null;
    if (s) {
      const soft = LIT.sunSoft || (LIT.sunSoft = new Float32Array(LLAY * LNZ)); soft.fill(0); sweepSoft(LIT.sv, soft, 1);
      (LIT.sunHard || (LIT.sunHard = new Float32Array(LLAY * LNZ))).fill(-1);
    }
    LIT.skey = skey;
  }
}
// hard sun at one voxel, marched on demand (only voxels next to surfaces are ever asked)
function sunHardAt(i) {
  let v = LIT.sunHard[i]; if (v >= 0) return v;
  const tr = LIT.tr, sv = LIT.sv, k = 0.25 / sv[2], ox = sv[0] * k * 2, oy = sv[1] * k * 2;
  const z = (i / LLAY) | 0, r = i - z * LLAY, y = (r / LNX) | 0, x = r - y * LNX;
  v = tr[i];
  if (v > 0) for (let s = 1; z + s < LNZ; s++) {
    const xi = Math.round(x + ox * s), yi = Math.round(y + oy * s);
    if (xi < 0 || yi < 0 || xi >= LNX || yi >= LNY) break;
    v *= tr[(z + s) * LLAY + yi * LNX + xi]; if (v < 0.02) { v = 0; break; }
  }
  LIT.sunHard[i] = v; return v;
}
// trilinear lookup at a world point; V null means the hard sun
function volAt(V, x, y, z) {
  const fx = x * 2 - 0.5, fy = y * 2 - 0.5, fz = z * 4 - 0.5;
  if (fz >= LNZ - 1) return 1;
  const x0 = Math.floor(fx), y0 = Math.floor(fy), z0 = Math.floor(fz), wx = fx - x0, wy = fy - y0, wz = fz - z0;
  let s = 0;
  for (let c = 0; c < 8; c++) {
    const dx = c & 1, dy = (c >> 1) & 1, dz = c >> 2, w = (dx ? wx : 1 - wx) * (dy ? wy : 1 - wy) * (dz ? wz : 1 - wz);
    if (w === 0) continue;
    const xi = x0 + dx, yi = y0 + dy, zi = z0 + dz;
    let v;
    if (zi >= LNZ || xi < 0 || yi < 0 || xi >= LNX || yi >= LNY) v = 1;
    else if (zi < 0) v = 0;
    else { const i = zi * LLAY + yi * LNX + xi; v = V ? V[i] : sunHardAt(i); }
    s += v * w;
  }
  return s;
}
const trAt = (x, y, z) => { const xi = Math.floor(x * 2), yi = Math.floor(y * 2), zi = Math.floor(z * 4); if (zi >= LNZ || xi < 0 || yi < 0 || xi >= LNX || yi >= LNY) return 1; if (zi < 0) return 0; return LIT.tr[zi * LLAY + yi * LNX + xi]; };
const AO6 = [[0.4, 0, 0.15], [-0.4, 0, 0.15], [0, 0.4, 0.15], [0, -0.4, 0.15], [0.28, 0.28, 0.4], [-0.28, -0.28, 0.4]];
// light multiplier (r, g, b) for a surface point p with normal n; ndl given for sprite pixels (-1: from n)
function litMul(p, n, ndlFix, out) {
  const e = n[2] > 0.5 ? 0.2 : 0.3, qx = p[0] + n[0] * e, qy = p[1] + n[1] * e, qz = p[2] + n[2] * e;
  const sky = LIT.sky ? volAt(LIT.skyV, qx, qy, qz) : 1;
  let occ = 0; if (LIT.ao) for (const [a, c, h] of AO6) occ += 1 - trAt(qx + a + n[0] * h, qy + c + n[1] * h, qz + n[2] * h + 0.05);
  const k = (0.55 + 0.45 * Math.min(1, sky * 1.15)) * (1 - occ / 6 * 0.55);
  out[0] = k; out[1] = k; out[2] = k * (0.96 + 0.06 * sky);
  const SUN = litSun();
  if (SUN) {
    const sv = LIT.sv, ndl = ndlFix >= 0 ? ndlFix : Math.max(0, n[0] * sv[0] + n[1] * sv[1] + n[2] * sv[2]);
    const s = ndl > 0.02 ? volAt(null, qx, qy, qz) : 0, f = s * s * (3 - 2 * s);
    for (let c = 0; c < 3; c++) out[c] *= lerp(SUN.shade[c], lerp(1, SUN.col[c], 0.6) * (0.92 + 0.22 * ndl), f);
  }
  return out;
}
// light one level's cached image in place. Pixels map back to world points through their
// depth: s = u+v = (Y + 12 (D - z)) / 22, height = D - 1.5 s.
let LSCR = null;
function litScratch() { if (!LSCR) { const c = mk(CW, CH); LSCR = c.getContext('2d', { willReadFrequently: true }); } return LSCR; }
function lightLevel(tgt, z, cutMode, src) {
  ensureLightVol();
  const img = src.getImageData(0, 0, CW, CH), px = img.data, dep = tgt.dep, fac = tgt.face;
  const dl = dirFromRot(0, 1), dr = dirFromRot(1, 0), N = [[0, 0, 1], [0, 0, 1], [dl[0], dl[1], 0], [dr[0], dr[1], 0]];
  const m = [1, 1, 1], p = [0, 0, 0];
  for (let ry = 0; ry < CH; ry++) {
    const Yr = ry + 0.5 - OY, row = ry * CW;
    for (let rx = 0; rx < CW; rx++) {
      const i = row + rx, Dv = dep[i];
      if (Dv < -1e8 || px[i * 4 + 3] === 0) continue;
      const s = (Yr + 12 * (Dv - z)) / 22, d = (rx + 0.5 - OX) / 8, w = fromRotF((s + d) / 2, (s - d) / 2), F = fac[i];
      p[0] = w[0]; p[1] = w[1]; p[2] = Dv - 1.5 * s;
      if (cutMode && F === 1 && p[2] > z + HT / LH - 0.03) continue;   // the cut face itself is a drawing convention, not a lit surface
      litMul(p, N[F], F === 0 ? 0.5 : -1, m);
      px[i * 4] = Math.min(255, px[i * 4] * m[0]); px[i * 4 + 1] = Math.min(255, px[i * 4 + 1] * m[1]); px[i * 4 + 2] = Math.min(255, px[i * 4 + 2] * m[2]);
    }
  }
  tgt.g.clearRect(0, 0, CW, CH); tgt.g.putImageData(img, 0, 0);
}
// a cable's light: the same model, folded into the palette's brightness steps
const LQ_LIT = [0.40, 0.54, 0.69, 0.85, 1.0, 1.12, 1.24];
const WLQ = new Map();   // per quarter cell, cleared when the volumes change
function wireLightQ(x, y, z) {
  if (!LIT.tr || !LIT.skey) ensureLightVol();
  if (WLQ.key !== litKey()) { WLQ.clear(); WLQ.key = litKey(); }
  const qk = (Math.floor(x * 4) * 512 + Math.floor(y * 4)) * 128 + Math.floor(z * 4 + 4);
  let best = WLQ.get(qk); if (best !== undefined) return best;
  const m = litMul([x, y, z], [0, 0, 1], 0.8, [1, 1, 1]), l = (m[0] + m[1] + m[2]) / 3;
  best = 0; for (let k = 1; k < LQ_LIT.length; k++) if (Math.abs(LQ_LIT[k] - l) < Math.abs(LQ_LIT[best] - l)) best = k;
  WLQ.set(qk, best); return best;
}
const mistOn = () => LIT.on && LIT.mist && LIT.mistA > 0;
const MIST_LEVELS = 8;   // mist thickens over the first eight levels below the cut, then holds (a deep view stays legible)
const mistRGB = () => MIST[LIT.sun] || MIST.noon;
// mist over a cable drawn at level z, as much as the per-level tints give the level itself
function wireMist(z) {
  if (!mistOn() || S.mode !== 'cut' || S.level >= NL - 1 || z >= S.level) return 0;
  return 1 - Math.pow(1 - LIT.mistA, Math.min(MIST_LEVELS, S.level - z));
}

// ---------- overlays in the level frame (x as the caches, y from NL levels above level 0) ----------
const LFH = CH + NL * LH;
function levelCache(z, L, cut) { return cut && z === L ? cutCache(L) : LC[z]; }
// shafts: from the surface under each (quarter-res) pixel, march toward the viewer through
// open air below the cut and add up the sunlit air
function shaftsLayer(top, L, cut) {
  const key = [top, L, cut, S.rot, LIT.sun, LIT.skey, DEPV, LIT.shaftK].join('|');
  if (LIT.shKey === key) return LIT.shaftC;
  const qw = Math.ceil(CW / 4), qh = Math.ceil(LFH / 4), acc = new Float32Array(qw * qh), SUN = litSun();
  const zref = cut ? L + HT / LH : NL, vd = dirFromRot(1.5, 1.5), view = v3.norm([vd[0], vd[1], 1]);
  for (let qy = 0; qy < qh; qy++) for (let qx = 0; qx < qw; qx++) {
    const px = qx * 4 + 2, pyR = qy * 4 + 2 - NL * LH;
    let best = -1e9;
    for (let z = 0; z <= top; z++) { const c = levelCache(z, L, cut); if (!c || !c.dep) continue; const cy = pyR + z * LH; if (cy < 0 || cy >= CH) continue; const d = c.dep[cy * CW + px]; if (d > best) best = d; }
    if (best < -1e8) continue;
    const s = (pyR + 0.5 - OY + 12 * best) / 22, dd = (px + 0.5 - OX) / 8, w = fromRotF((s + dd) / 2, (s - dd) / 2), pz = best - 1.5 * s;
    let a = 0;
    for (let d = 0.3; d < 7; d += 0.35) {
      const x = w[0] + view[0] * d, y = w[1] + view[1] * d, z = pz + view[2] * d;
      if (z > zref) break;
      if (trAt(x, y, z) < 0.5) continue;
      a += volAt(LIT.sunSoft, x, y, z) * 0.35;
    }
    acc[qy * qw + qx] = a;
  }
  const bl = boxBlur(acc, qw, qh, 1), c = LIT.shaftC && LIT.shaftC.width === qw && LIT.shaftC.height === qh ? LIT.shaftC : mk(qw, qh);
  const g = c.getContext('2d'), img = g.createImageData(qw, qh), C = SUN.col;
  for (let i = 0; i < qw * qh; i++) {
    const k = Math.min(0.3 * LIT.shaftK, bl[i] * 0.065 * LIT.shaftK) * 255 * 0.55;
    img.data[i * 4] = k * 0.9 * C[0]; img.data[i * 4 + 1] = k * 0.85 * C[1]; img.data[i * 4 + 2] = k * 0.7 * C[2]; img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  LIT.shaftC = c; LIT.shKey = key;
  return c;
}
// bloom: every level's lit windows, hidden where a nearer level covers them, blurred
function bloomLayer(top, L, cut) {
  const key = [top, L, cut, S.rot, S.tod, DEPV].join('|');
  if (LIT.blKey === key) return LIT.bloomC;
  const full = mk(CW, LFH), g = full.getContext('2d');
  for (let z = 0; z <= top; z++) {
    const c = levelCache(z, L, cut); if (!c) continue;
    const y = NL * LH - z * LH;
    g.globalCompositeOperation = 'destination-out'; g.drawImage(c.c, 0, y);
    g.globalCompositeOperation = 'source-over'; if (c.em) g.drawImage(c.em.c, 0, y);
  }
  const b = LIT.bloomC || mk(CW >> 1, LFH >> 1), bg = b.getContext('2d');
  bg.clearRect(0, 0, b.width, b.height);
  bg.globalCompositeOperation = 'lighter';
  bg.filter = 'blur(2px)'; bg.drawImage(full, 0, 0, b.width, b.height);
  bg.filter = 'blur(6px)'; bg.drawImage(full, 0, 0, b.width, b.height);
  bg.filter = 'none'; bg.globalCompositeOperation = 'source-over';
  LIT.bloomC = b; LIT.blKey = key;
  return b;
}
// drawn after the world: shafts by day, bloom by night
function drawLightOverlays(ctx, top, L, cut, bx0, by0) {
  if (!LIT.on) return;
  const y = by0 - NL * LH;
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.imageSmoothingEnabled = true;
  if (LIT.shafts && LIT.shaftK > 0 && litSun()) ctx.drawImage(shaftsLayer(top, L, cut), bx0, y, Math.ceil(CW / 4) * 4, Math.ceil(LFH / 4) * 4);
  if (LIT.bloom && LIT.bloomK > 0 && S.tod !== 'day') { ctx.globalAlpha = Math.min(1, (S.tod === 'night' ? 0.85 : 0.5) * LIT.bloomK); ctx.drawImage(bloomLayer(top, L, cut), bx0, y, CW, LFH); if (LIT.bloomK > 1) { ctx.globalAlpha = Math.min(1, LIT.bloomK - 1) * 0.85; ctx.drawImage(LIT.bloomC, bx0, y, CW, LFH); } }
  ctx.restore();
}

// ---------- controls ----------
function setLightTime(sun) {
  LIT.sun = sun;
  S.tod = sun === 'night' ? 'night' : 'day';
  SPR = new Map(); GHOST.clear(); podSprites(); markAllDirty(); skyDirty = true;
  $('todv').textContent = sun[0].toUpperCase() + sun.slice(1);
  syncLightPanel();
}
function relight() { SPR = new Map(); GHOST.clear(); podSprites(); markAllDirty(); skyDirty = true; }
function toggleLight(v) {
  LIT.on = v == null ? !LIT.on : v;
  $('bLight').setAttribute('aria-pressed', LIT.on);
  if (LIT.on) setLightTime(LIT.sun); else { $('todv').textContent = TODS[S.tod].name; relight(); }
  syncLightPanel(); sfx.click();
}
// the settings popover: what is baked into the levels (relights) and what is drawn per frame
const LIGHT_PARTS = [['sunOn', 'Sun & shadows', 1], ['sky', 'Sky light', 1], ['ao', 'Occlusion', 1], ['mist', 'Mist', 0, 'mistA', 0, 0.08, 0.005], ['shafts', 'Shafts', 0, 'shaftK', 0, 2, 0.1], ['bloom', 'Night glow', 0, 'bloomK', 0, 2, 0.1]];
let relightT = 0;
function setupLightPanel() {
  const pop = document.createElement('div'); pop.id = 'lightPop'; pop.className = 'popm'; pop.hidden = true;
  pop.innerHTML = `<div class="lp-h"><span>Lighting</span><label class="lp-sw"><input type="checkbox" data-k="on"> on</label></div>
    <div class="lp-times">${LIGHT_TIMES.map(t => `<button data-t="${t}">${t}</button>`).join('')}</div>` +
    LIGHT_PARTS.map(([k, name, , pk, lo, hi, st]) => `<div class="lp-row"><label><input type="checkbox" data-k="${k}"> ${name}</label>${pk ? `<input type="range" data-p="${pk}" min="${lo}" max="${hi}" step="${st}">` : ''}</div>`).join('') +
    `<div class="lp-foot">I toggles · T time of day</div>`;
  document.body.appendChild(pop);
  pop.addEventListener('input', e => {
    const t = e.target, k = t.dataset.k, p = t.dataset.p;
    if (k === 'on') { toggleLight(t.checked); return; }
    if (k) { LIT[k] = t.checked; const part = LIGHT_PARTS.find(q => q[0] === k); if (part[2]) { clearTimeout(relightT); relightT = setTimeout(relight, 60); } }
    if (p) LIT[p] = +t.value;
  });
  pop.addEventListener('click', e => { const t = e.target.closest('[data-t]'); if (t && LIT.on) { setLightTime(t.dataset.t); syncLightPanel(); sfx.click(); } });
  const open = () => { const r = $('bLight').getBoundingClientRect(); pop.style.left = r.left + 'px'; pop.style.top = r.bottom + 4 + 'px'; pop.hidden = false; syncLightPanel(); };
  $('bLight').addEventListener('contextmenu', e => { e.preventDefault(); open(); });
  $('bLight').addEventListener('click', e => { if (e.ctrlKey || e.metaKey) { e.stopImmediatePropagation(); e.preventDefault(); open(); } }, true);
  $('bLightMenu').onclick = e => { e.stopPropagation(); pop.hidden ? open() : (pop.hidden = true); };
  document.addEventListener('pointerdown', e => { if (!pop.hidden && !pop.contains(e.target) && e.target !== $('bLightMenu') && e.target !== $('bLight')) pop.hidden = true; });
  window.addEventListener('keydown', e => { if (e.key === 'Escape') pop.hidden = true; });
}
function syncLightPanel() {
  const pop = $('lightPop'); if (!pop) return;
  pop.querySelector('[data-k="on"]').checked = LIT.on;
  for (const [k, , , pk] of LIGHT_PARTS) { const c = pop.querySelector(`[data-k="${k}"]`); c.checked = LIT[k]; c.disabled = !LIT.on; if (pk) { const r = pop.querySelector(`[data-p="${pk}"]`); r.value = LIT[pk]; r.disabled = !LIT.on || !LIT[k]; } }
  pop.querySelectorAll('[data-t]').forEach(b => b.setAttribute('aria-pressed', LIT.on && b.dataset.t === LIT.sun));
}
