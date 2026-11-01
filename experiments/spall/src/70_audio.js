// ==========================================================================
// Procedural Web Audio: level-aware ambience beds crossfaded by the active
// level + view mode, generated convolution reverb, synthesized UI sounds.
// No audio files. Starts only after the "Sound on" click.
// ==========================================================================
const AUD = { ctx: null, on: false, muted: false, vol: 0.55, beds: {}, noise: {}, formants: [], tickT: 0 };
const BED_BASE = { under: 0.6, street: 0.5, transit: 0.42, wind: 0.34, canopy: 0.55, rooms: 0.34 };
function noiseBuf(ctx, kind, sec) {
  const n = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'white') d[i] = w * 0.5;
    else if (kind === 'pink') { b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898; d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926; }
    else { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
  }
  const f = Math.min(4000, n >> 3);
  for (let i = 0; i < f; i++) { const a = i / f; d[i] = d[i] * a + d[n - f + i] * (1 - a); }
  return b;
}
function makeIR(ctx, sec, decay) {
  const n = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    for (let i = 0; i < n; i++) { const t = i / n; d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * (i < 120 ? i / 120 : 1); }
    for (let k = 0; k < 7; k++) { const at = Math.floor(ctx.sampleRate * (0.011 + k * 0.017 + ch * 0.004)); if (at < n) d[at] += (k & 1 ? -0.5 : 0.6) * Math.pow(0.8, k); }
  }
  return b;
}
const filt = (ctx, type, f, q) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q != null) b.Q.value = q; return b; };
const gainN = (ctx, v) => { const g = ctx.createGain(); g.gain.value = v; return g; };
function lfo(ctx, freq, depth, param) { const o = ctx.createOscillator(); o.frequency.value = freq; const g = gainN(ctx, depth); o.connect(g); g.connect(param); o.start(); return o; }
function loopSrc(ctx, buf, rate) { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = rate || 1; s.start(0, Math.random() * buf.duration * 0.9); return s; }
function mkBed(ctx, name, send) {
  const out = gainN(ctx, 0), sg = gainN(ctx, send);
  out.connect(AUD.bus); out.connect(sg); sg.connect(AUD.verb);
  AUD.beds[name] = { out, send: sg, base: send };
  return out;
}
function audStart() {
  if (AUD.ctx) { if (AUD.ctx.state === 'suspended') AUD.ctx.resume(); AUD.on = true; applyVol(); return true; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  const ctx = new AC(); AUD.ctx = ctx;
  const master = gainN(ctx, 0), comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -20; comp.knee.value = 12; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.25;
  const modeLP = filt(ctx, 'lowpass', 16000, 0.5);
  modeLP.connect(master); master.connect(comp); comp.connect(ctx.destination);
  const verb = ctx.createConvolver(); verb.buffer = makeIR(ctx, 3.4, 2.4);
  const verbOut = gainN(ctx, 0.5); verb.connect(verbOut); verbOut.connect(modeLP);
  Object.assign(AUD, { master, bus: modeLP, verb, modeLP });
  AUD.noise = { white: noiseBuf(ctx, 'white', 3), pink: noiseBuf(ctx, 'pink', 4), brown: noiseBuf(ctx, 'brown', 4) };
  // undercroft: mains hum, muffled city through the slab (drips are events)
  const U = mkBed(ctx, 'under', 0.35), hum = gainN(ctx, 0.1), hlp = filt(ctx, 'lowpass', 240, 0.7);
  hum.connect(hlp); hlp.connect(U);
  for (const [f, g, type] of [[55, 1, 'sine'], [110.4, 0.45, 'sine'], [165.2, 0.16, 'triangle'], [49.7, 0.3, 'sine']]) { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; const gg = gainN(ctx, g); o.connect(gg); gg.connect(hum); o.start(); }
  lfo(ctx, 0.13, 0.03, hum.gain);
  const city = loopSrc(ctx, AUD.noise.brown), clp = filt(ctx, 'lowpass', 190, 0.5), cg = gainN(ctx, 0.5);
  city.connect(clp); clp.connect(cg); cg.connect(U); lfo(ctx, 0.05, 0.2, cg.gain);
  // street: formant babble + traffic
  const Sb = mkBed(ctx, 'street', 0.12), pink = loopSrc(ctx, AUD.noise.pink);
  AUD.formants = [];
  for (const [f, q] of [[420, 5], [950, 6], [1600, 7], [2600, 8]]) { const bp = filt(ctx, 'bandpass', f, q), g = gainN(ctx, 0); pink.connect(bp); bp.connect(g); g.connect(Sb); AUD.formants.push({ bp, g, f }); }
  const traffic = loopSrc(ctx, AUD.noise.brown, 0.7), tl = filt(ctx, 'lowpass', 520, 0.6), tg = gainN(ctx, 0.35);
  traffic.connect(tl); tl.connect(tg); tg.connect(Sb); AUD.trafficG = tg;
  // transit decks: rail hum + air handling (whooshes are events synced to pods)
  const Tr = mkBed(ctx, 'transit', 0.2), saw = ctx.createOscillator(); saw.type = 'sawtooth'; saw.frequency.value = 58;
  const sl = filt(ctx, 'lowpass', 210, 1), sg = gainN(ctx, 0.05); saw.connect(sl); sl.connect(sg); sg.connect(Tr); saw.start();
  const air = loopSrc(ctx, AUD.noise.white), ab = filt(ctx, 'bandpass', 900, 0.7), ag = gainN(ctx, 0.05); air.connect(ab); ab.connect(ag); ag.connect(Tr);
  // wind in voids and at height, heavy reverb send + shaft whistle
  const Wd = mkBed(ctx, 'wind', 0.8), wn = loopSrc(ctx, AUD.noise.white, 0.8), wb = filt(ctx, 'bandpass', 480, 0.9), wg = gainN(ctx, 0.35);
  wn.connect(wb); wb.connect(wg); wg.connect(Wd); lfo(ctx, 0.07, 220, wb.frequency); lfo(ctx, 0.11, 0.15, wg.gain);
  const wh = ctx.createOscillator(); wh.frequency.value = 740; const whg = gainN(ctx, 0); wh.connect(whg); whg.connect(Wd); wh.start(); lfo(ctx, 0.3, 6, wh.frequency); AUD.whistleG = whg;
  // canopy: leaf rustle (birds / crickets are events)
  const Cn = mkBed(ctx, 'canopy', 0.15), lv = loopSrc(ctx, AUD.noise.white, 1.1), lh = filt(ctx, 'highpass', 2400, 0.7), lg = gainN(ctx, 0.05);
  lv.connect(lh); lh.connect(lg); lg.connect(Cn); AUD.leafG = lg;
  // habitation: muffled rooms (radio phrases are events)
  const Rm = mkBed(ctx, 'rooms', 0.1), rp = loopSrc(ctx, AUD.noise.pink, 0.6), rb = filt(ctx, 'bandpass', 260, 1.8), rg = gainN(ctx, 0.25);
  rp.connect(rb); rb.connect(rg); rg.connect(Rm);
  AUD.on = true; applyVol(); audTick(true);
  return true;
}
function applyVol() { if (!AUD.ctx) return; AUD.master.gain.setTargetAtTime(AUD.on && !AUD.muted ? AUD.vol * AUD.vol * 0.9 : 0, AUD.ctx.currentTime, 0.25); }
function levelMix(z) {
  const m = { under: 0, street: 0, transit: 0, wind: 0, canopy: 0, rooms: 0 };
  if (z <= 1) { m.under = 1; m.street = 0.1; }
  else if (z <= 3) { m.street = 1; m.under = 0.18; m.transit = 0.15; m.wind = 0.08; }
  else if (z <= 5) { m.street = 0.55; m.rooms = 0.45; m.transit = 0.25; m.wind = 0.15; }
  else if (z === 6) { m.transit = 1; m.street = 0.3; m.wind = 0.25; m.rooms = 0.15; }
  else if (z <= 8) { m.rooms = 0.8; m.transit = 0.3; m.wind = 0.3; m.street = 0.12; }
  else if (z === 9) { m.canopy = 0.8; m.wind = 0.4; m.rooms = 0.25; }
  else if (z <= 11) { m.rooms = 0.7; m.wind = 0.5; m.canopy = 0.25; }
  else if (z === 12) { m.transit = 1; m.wind = 0.6; }
  else if (z === 13) { m.rooms = 0.5; m.wind = 0.6; m.canopy = 0.4; }
  else { m.canopy = 1; m.wind = 0.8; }
  return m;
}
function shaftiness() {
  const [u, v] = planeAt(S.bw / 2, S.bh / 2, S.level), p = fromRot(clamp(Math.floor(u), 0, W - 1), clamp(Math.floor(v), 0, D - 1));
  let s = 0;
  for (const w of WORLD.wells) { const d = Math.hypot(w.x + w.s / 2 - p[0], w.y + w.s / 2 - p[1]); s = Math.max(s, 1 - d / 12); }
  return s;
}
function audTick(force) {
  if (!AUD.ctx || !AUD.on) return;
  const ctx = AUD.ctx, now = ctx.currentTime, m = levelMix(S.level), night = S.tod === 'night';
  const modeK = S.mode === 'plan' ? 0.35 : S.mode === 'exploded' ? 0.55 : S.mode === 'section' ? 0.8 : 1;
  const lp = S.mode === 'plan' ? 1400 : S.mode === 'exploded' ? 5200 : S.mode === 'section' ? 9000 : 16000;
  const sh = S.mode === 'cut' ? shaftiness() : 0;
  if (S.mode === 'exploded') m.wind += 0.4;
  m.wind += sh * 0.7;
  if (night) { m.street *= 0.5; m.rooms *= 1.25; }
  AUD.lastMix = m; AUD.modeK = modeK;
  const tc = force ? 0.05 : 0.45;
  for (const k in AUD.beds) { const b = AUD.beds[k]; b.out.gain.setTargetAtTime(Math.min(1.2, m[k]) * modeK * BED_BASE[k], now, tc); }
  AUD.beds.wind.send.gain.setTargetAtTime(0.8 + sh * 1.2, now, 0.5);
  AUD.whistleG.gain.setTargetAtTime(0.03 * sh, now, 0.6);
  AUD.modeLP.frequency.setTargetAtTime(lp, now, 0.3);
  for (const f of AUD.formants) if (Math.random() < 0.35) { f.bp.frequency.setTargetAtTime(f.f * (0.75 + Math.random() * 0.6), now, 0.08); f.g.gain.setTargetAtTime(Math.random() < 0.4 ? 0 : 0.5 + Math.random() * 0.6, now, 0.05); }
  AUD.leafG.gain.setTargetAtTime(0.02 + Math.random() * 0.08, now, 0.06);
  if (Math.random() < 0.05) AUD.trafficG.gain.setTargetAtTime(0.2 + Math.random() * 0.5, now, 1.2);
  const r = Math.random;
  if (m.under * modeK > 0.1 && r() < 0.09) drip();
  if (m.canopy * modeK > 0.1 && r() < 0.06) (night ? cricket() : bird());
  if (m.street * modeK > 0.3 && r() < 0.004) bell();
  if (m.rooms * modeK > 0.3 && r() < 0.004) radio();
}
function envG(g, t0, a, peak, d) { g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + a); g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d); }
function tone(dest, type, f0, f1, t0, a, peak, d, pan) {
  const ctx = AUD.ctx, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t0); if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t0 + a + d);
  envG(g, t0, a, peak, d); o.connect(g);
  if (pan) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(dest); } else g.connect(dest);
  o.start(t0); o.stop(t0 + a + d + 0.05);
}
function noiseHit(dest, type, f, q, t0, a, peak, d, f1, pan) {
  const ctx = AUD.ctx, s = ctx.createBufferSource(); s.buffer = AUD.noise.white;
  const b = filt(ctx, type, f, q), g = ctx.createGain();
  if (f1) b.frequency.exponentialRampToValueAtTime(f1, t0 + a + d);
  envG(g, t0, a, peak, d); s.connect(b); b.connect(g);
  if (pan != null) { const p = ctx.createStereoPanner(); p.pan.setValueAtTime(pan[0], t0); p.pan.linearRampToValueAtTime(pan[1], t0 + a + d); g.connect(p); p.connect(dest); } else g.connect(dest);
  s.start(t0, Math.random() * 2); s.stop(t0 + a + d + 0.05);
}
function drip() { const t0 = AUD.ctx.currentTime + 0.01, f = 900 + Math.random() * 1800; tone(AUD.beds.under.out, 'sine', f, f * 0.55, t0, 0.003, 0.28, 0.12, Math.random() * 1.6 - 0.8); }
function bird() {
  const t = AUD.ctx.currentTime + 0.02, base = [2600, 3400, 4200][Math.floor(Math.random() * 3)], n = 2 + Math.floor(Math.random() * 4), pan = Math.random() * 1.4 - 0.7;
  for (let k = 0; k < n; k++) { const t0 = t + k * (0.09 + Math.random() * 0.07), f = base * (0.9 + Math.random() * 0.3); tone(AUD.beds.canopy.out, 'sine', f, f * (Math.random() < 0.5 ? 1.35 : 0.72), t0, 0.01, 0.12, 0.06, pan); }
}
function cricket() { const t = AUD.ctx.currentTime + 0.02, pan = Math.random() * 1.6 - 0.8; for (let k = 0; k < 4 + Math.floor(Math.random() * 3); k++) tone(AUD.beds.canopy.out, 'sine', 4300, 4300, t + k * 0.045, 0.004, 0.05, 0.02, pan); }
function bell() { const t0 = AUD.ctx.currentTime + 0.02, pan = Math.random() - 0.5; tone(AUD.beds.street.out, 'triangle', 2150, 2150, t0, 0.002, 0.07, 0.7, pan); tone(AUD.beds.street.out, 'sine', 2980, 2980, t0, 0.002, 0.04, 0.5, pan); }
function radio() {
  const ctx = AUD.ctx, lp = filt(ctx, 'lowpass', 900, 0.8); lp.connect(AUD.beds.rooms.out);
  const sc = [0, 2, 4, 7, 9, 12], root = 220 * Math.pow(2, Math.floor(Math.random() * 5) / 12), t = ctx.currentTime + 0.05;
  for (let k = 0; k < 6; k++) { const f = root * Math.pow(2, sc[Math.floor(Math.random() * sc.length)] / 12); tone(lp, 'triangle', f, f, t + k * 0.24, 0.02, 0.07, 0.2, 0.3); }
}
const PENTA = [0, 2, 4, 7, 9];
const lvFreq = z => 196 * Math.pow(2, (PENTA[z % 5] + 12 * Math.floor(z / 5)) / 12);
const sfxOn = () => AUD.ctx && AUD.on && !AUD.muted;
const sfx = {
  level(z) { if (!sfxOn()) return; const t0 = AUD.ctx.currentTime; tone(AUD.bus, 'triangle', lvFreq(z), lvFreq(z), t0, 0.004, 0.08, 0.07); noiseHit(AUD.bus, 'highpass', 3000, 0.7, t0, 0.001, 0.05, 0.015); },
  arrive(z) { if (!sfxOn()) return; const t0 = AUD.ctx.currentTime + 0.02, f = lvFreq(z) * 2; tone(AUD.bus, 'sine', f, f, t0, 0.005, 0.06, 0.5); tone(AUD.bus, 'sine', f * 1.5, f * 1.5, t0 + 0.11, 0.005, 0.05, 0.6); },
  mode(m) {
    if (!sfxOn()) return; const t0 = AUD.ctx.currentTime;
    if (m === 'cut') { noiseHit(AUD.bus, 'bandpass', 2200, 1.2, t0, 0.002, 0.12, 0.05); tone(AUD.bus, 'sine', 120, 70, t0, 0.003, 0.15, 0.09); }
    else if (m === 'exploded') [0, 4, 7].forEach((s, k) => tone(AUD.bus, 'triangle', 330 * Math.pow(2, s / 12), 330 * Math.pow(2, s / 12), t0 + k * 0.06, 0.01, 0.06, 0.35));
    else if (m === 'plan') noiseHit(AUD.bus, 'bandpass', 1400, 0.8, t0, 0.04, 0.1, 0.16, 700);
    else noiseHit(AUD.bus, 'highpass', 6000, 0.7, t0, 0.01, 0.1, 0.14, 1500);
  },
  ghost() { if (!sfxOn()) return; const ctx = AUD.ctx, t0 = ctx.currentTime, c = ctx.createOscillator(), mo = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain(); c.frequency.value = 1320; mo.frequency.value = 1320 * 2.4; mg.gain.setValueAtTime(900, t0); mg.gain.exponentialRampToValueAtTime(5, t0 + 0.4); mo.connect(mg); mg.connect(c.frequency); envG(g, t0, 0.004, 0.07, 0.45); c.connect(g); g.connect(AUD.bus); g.connect(AUD.verb); c.start(t0); mo.start(t0); c.stop(t0 + 0.5); mo.stop(t0 + 0.5); },
  tick(ph, z) {
    if (!sfxOn()) return; const t0 = AUD.ctx.currentTime, k = z === S.level ? 1 : 0.5, j = 0.95 + Math.random() * 0.1;
    if (ph === 0) { [523, 1187, 1789].forEach((f, i) => tone(AUD.bus, 'sine', f * j, f * j, t0, 0.001, 0.07 * k / (i + 1), 0.16)); noiseHit(AUD.bus, 'highpass', 4000, 0.7, t0, 0.001, 0.06 * k, 0.02); }
    else if (ph === 1) { tone(AUD.bus, 'sine', 150 * j, 70, t0, 0.003, 0.22 * k, 0.12); noiseHit(AUD.bus, 'lowpass', 600, 0.7, t0, 0.002, 0.1 * k, 0.06); }
    else if (ph === 2) { tone(AUD.bus, 'triangle', 660 * j, 640, t0, 0.002, 0.08 * k, 0.12); noiseHit(AUD.bus, 'highpass', 5000, 0.8, t0 + 0.01, 0.01, 0.04 * k, 0.12); }
    else noiseHit(AUD.bus, 'bandpass', 2500, 2, t0, 0.01, 0.08 * k, 0.18, 500);
  },
  whoosh(side, near) { if (!sfxOn()) return; const t0 = AUD.ctx.currentTime; noiseHit(AUD.bus, 'bandpass', 300, 1.4, t0, 0.45, 0.2 * near * (AUD.modeK || 1), 0.7, 1500, [-side * 0.85, side * 0.85]); },
  approve() { if (!sfxOn()) return; const t0 = AUD.ctx.currentTime; tone(AUD.bus, 'sine', 659, 659, t0, 0.005, 0.08, 0.3); tone(AUD.bus, 'sine', 880, 880, t0 + 0.09, 0.005, 0.08, 0.45); },
  reject() { if (!sfxOn()) return; const t0 = AUD.ctx.currentTime; tone(AUD.bus, 'triangle', 440, 440, t0, 0.005, 0.07, 0.2); tone(AUD.bus, 'triangle', 330, 330, t0 + 0.1, 0.005, 0.07, 0.3); },
  done() { if (!sfxOn()) return; const t0 = AUD.ctx.currentTime; [523, 659, 784].forEach((f, i) => tone(AUD.bus, 'sine', f, f, t0 + i * 0.07, 0.005, 0.05, 0.6)); },
  look() { if (!sfxOn()) return; tone(AUD.bus, 'sine', 1200, 1600, AUD.ctx.currentTime, 0.01, 0.025, 0.06); },
  pin() { if (!sfxOn()) return; tone(AUD.bus, 'sine', 900, 300, AUD.ctx.currentTime, 0.002, 0.12, 0.05); },
  chat() { if (!sfxOn()) return; tone(AUD.bus, 'sine', 1100, 1100, AUD.ctx.currentTime, 0.003, 0.04, 0.05); },
  click() { if (!sfxOn()) return; noiseHit(AUD.bus, 'highpass', 3500, 0.7, AUD.ctx.currentTime, 0.001, 0.04, 0.012); }
};
