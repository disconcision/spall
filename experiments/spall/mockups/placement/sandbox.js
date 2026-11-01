// Placement sandbox: a small editable world in Spall's projection (8 px per half-cell across, 4 down,
// 12 per level, four 90° rotations, a cut). Ray-cast per pixel, so the picture and the pick buffer
// are the same thing. Every element with data-sandbox='{...}' becomes one independent sandbox.
(function () {
  const N = 16, NZ = 9, CW = 272, CH = 256, OX = 136, OY = 120, CUTH = 0.58, BAND = 2.5, STEP = 1 / 16;
  const E = 0, CONC = 1, LEDGE = 2, TOWER = 3, BLOCK = 4, WATER = 5, DECK = 6, ROAD = 7, RAMP = 8, GROUND = 9;
  const isSolid = t => t >= CONC && t <= BLOCK;
  const SLAB = { [WATER]: [0, 0.25], [DECK]: [0.75, 1], [ROAD]: [0, 0.25] };
  const idx = (x, y, z) => (z * N + y) * N + x;
  const inb = (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < N && y < N && z < NZ;
  const U_DIR = [[1, 0], [0, -1], [-1, 0], [0, 1]], V_DIR = [[0, 1], [1, 0], [0, -1], [-1, 0]];
  const hx = s => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
  const PAL = {   // top, +u face, +v face
    [CONC]: ['#8d877a', '#615d55', '#4a4740'], [LEDGE]: ['#a39c8e', '#6d685f', '#55514a'], [TOWER]: ['#7b7d82', '#55575c', '#414347'],
    [BLOCK]: ['#b08e62', '#7d6449', '#614d38'], [WATER]: ['#2f6a66', '#24504d', '#1d403e'], [DECK]: ['#b3a68a', '#7c7360', '#5e5748'],
    [ROAD]: ['#4a4b50', '#5a5853', '#45433f'], [RAMP]: ['#4a4b50', '#5a5853', '#45433f'], [GROUND]: ['#3a3833', '#2a2925', '#22211e']
  };
  const PALR = {}; for (const k in PAL) PALR[k] = PAL[k].map(hx);
  const FOG = hx('#16202a'), CUTC = hx('#2b2925'), MARK = hx('#f0d98a'), CURB = hx('#8e9097'), LIT = hx('#e0ad55'), GLASS = hx('#2b3038');
  const AXC = { x: '#e8735a', y: '#a9cf56', z: '#6fc6e8' };
  const hash = (a, b, c) => { let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

  // ---------- scenes ----------
  function sceneVoid(S) {
    for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) {
      let h = 0, k = CONC;
      if (y <= 2) h = 5;
      if (x <= 2 && y >= 3) h = 6;
      if (x >= 13 && y >= 3) { h = 3; k = LEDGE; }
      if (y >= 11 && x >= 3 && x <= 12) h = 2;
      if (x <= 1 && y <= 1) { h = 8; k = TOWER; }
      for (let z = 0; z < h; z++) S.T[idx(x, y, z)] = k;
      if (h === 0) S.T[idx(x, y, 0)] = WATER;
    }
    for (let x = 5; x <= 7; x++) S.T[idx(x, 3, 4)] = DECK;
    S.girders = [{ a: [3, 6, 3], b: [13, 6, 3] }, { a: [3, 8, 3], b: [13, 8, 3] }];
    for (const x of [5, 7, 9, 11]) S.girders.push({ a: [x, 6, 3], b: [x, 8, 3] });
    S.anchors = [{ p: [10, 3, 5], host: 'top' }, { p: [6, 8, 3], host: 'girder' }];
    S.cables = [{ a: [10, 3, 5], b: [6, 8, 3], sag: 0.7 }];
  }
  function scenePlain(S) {
    for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) S.T[idx(x, y, 0)] = CONC;
    for (let x = 2; x <= 4; x++) for (let y = 2; y <= 3; y++) for (let z = 1; z <= 4; z++) S.T[idx(x, y, z)] = BLOCK;
    for (let x = 10; x <= 13; x++) for (let y = 2; y <= 5; y++) for (let z = 1; z <= 2; z++) S.T[idx(x, y, z)] = CONC;
    for (let x = 6; x <= 9; x++) for (let y = 9; y <= 12; y++) S.T[idx(x, y, 0)] = WATER;
  }
  function sceneInterchange(S) {
    for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) S.T[idx(x, y, 0)] = CONC;
    for (let x = 1; x <= 3; x++) for (let y = 1; y <= 3; y++) for (let z = 1; z <= 3; z++) S.T[idx(x, y, z)] = BLOCK;
    for (let x = 11; x <= 14; x++) for (let y = 11; y <= 14; y++) for (let z = 1; z <= 2; z++) S.T[idx(x, y, z)] = CONC;
    layRoad(S, roadPath([0, 9], [15, 9], 'x'), 1, 0);                 // a street on the ground
    layRoad(S, roadPath([7, 0], [7, 15], 'y'), 3, 0);                 // an overpass two levels up
    layRoad(S, roadPath([12, 8], [12, 3], 'y'), 1, 2);                // a ramp from the street up...
    layRoad(S, roadPath([11, 3], [8, 3], 'x'), 3, 0);                 // ...joining the overpass
  }
  const SCENES = { void: sceneVoid, plain: scenePlain, interchange: sceneInterchange }, SCENE_L = { void: 6, plain: 3, interchange: 3 };

  // ---------- roads: cells with a deck slab; ramps climb a level over two cells ----------
  function roadPath(a, b, first) {   // an L from cell a to cell b, the `first` axis leg first
    const out = [[a[0], a[1], first]];
    let [x, y] = a;
    const legs = first === 'x' ? ['x', 'y'] : ['y', 'x'];
    for (const ax of legs) {
      const t = ax === 'x' ? b[0] : b[1];
      while ((ax === 'x' ? x : y) !== t) { if (ax === 'x') x += Math.sign(t - x); else y += Math.sign(t - y); out.push([x, y, ax]); }
    }
    return out;
  }
  // the cells a road path makes: level and ramp shape for each, climbing `rise` levels right after the start
  function roadCells(path, z0, rise) {
    const n = Math.min(Math.abs(rise) * 2, path.length - 1), r = Math.sign(rise) * Math.floor(n / 2), out = [];
    path.forEach(([x, y, ax], k) => {
      const prev = path[Math.max(0, k - 1)], d = k ? [x - prev[0], y - prev[1]] : [0, 0];
      const dir = d[0] === 1 ? 1 : d[1] === 1 ? 2 : d[0] === -1 ? 3 : d[1] === -1 ? 4 : 0;
      if (k >= 1 && k <= Math.abs(r) * 2 && dir) {
        if (r > 0) out.push({ x, y, z: z0 + Math.floor((k - 1) / 2), ramp: dir | (((k - 1) % 2) << 3), ax });
        else { const j = Math.abs(r) * 2 - k, back = ((dir + 1) % 4) + 1; out.push({ x, y, z: z0 + r + Math.floor(j / 2), ramp: back | ((j % 2) << 3), ax }); }
      } else out.push({ x, y, z: z0 + (k > Math.abs(r) * 2 ? r : 0), ramp: 0, ax });
    });
    return out;
  }
  function layRoad(S, path, z0, rise) {
    for (const c of roadCells(path, z0, rise)) {
      if (!inb(c.x, c.y, c.z)) break;
      const i = idx(c.x, c.y, c.z), t = S.T[i];
      if (t !== E && t !== ROAD && t !== WATER) break;
      if (c.ramp) { S.T[i] = RAMP; S.RA[i] = c.ramp; } else if (t !== ROAD || !S.RA[i]) S.T[i] = ROAD;
      S.RX[i] |= c.ax === 'x' ? 1 : 2;
    }
  }

  // ---------- one sandbox ----------
  function Sandbox(root, opts) {
    const S = { T: new Uint8Array(N * N * NZ), RA: new Uint8Array(N * N * NZ), RX: new Uint8Array(N * N * NZ), rot: opts.rot || 0, L: opts.L != null ? opts.L : 6,
      rules: 'proposed', tool: opts.tool || 'block', bmode: opts.bmode || 'auto', cues: true, scene: opts.scene || 'void', girders: [], anchors: [], cables: [], pipes: [], hist: [] };
    root.classList.add('sb');
    root.innerHTML = `
      <div class="sb-bar">
        <div class="sb-grp" role="group" aria-label="Rules"><button data-rules="today">Today</button><button data-rules="proposed">Proposed</button></div>
        <div class="sb-grp" role="group" aria-label="Tool"><button data-tool="block" title="B">Block</button><button data-tool="girder" title="G">Girder</button><button data-tool="anchor" title="A">Anchor</button><button data-tool="cable" title="C">Cable</button><button data-tool="pipe" title="P">Pipe</button><button data-tool="road" title="R">Road</button><button data-tool="erase" title="X">Erase</button></div>
      </div>
      <div class="sb-bar">
        <div class="sb-grp" role="group" aria-label="Block placement"><button data-bmode="auto">Auto</button><button data-bmode="cut">On cut</button><button data-bmode="attach">Attach</button><button data-bmode="drop">Drop</button></div>
        <div class="sb-grp"><button data-act="cues">Cues</button></div>
        <div class="sb-grp" role="group" aria-label="Cut"><button data-act="cutdn" aria-label="Lower the cut">Cut −</button><span class="sb-cut"></span><button data-act="cutup" aria-label="Raise the cut">Cut +</button></div>
        <div class="sb-grp" role="group" aria-label="Rotate"><button data-act="rotl" aria-label="Rotate left">⟲</button><button data-act="rotr" aria-label="Rotate right">⟳</button></div>
        <div class="sb-grp"><button data-act="undo">Undo</button><button data-act="reset">Reset</button></div>
        <div class="sb-grp" role="group" aria-label="Scene"><button data-scene="void">Void</button><button data-scene="plain">Plain</button><button data-scene="interchange">Roads</button></div>
      </div>
      <div class="sb-wrap"><canvas tabindex="0" aria-label="Placement sandbox"></canvas><div class="sb-chip" hidden></div></div>
      <div class="sb-status" aria-live="polite"></div>`;
    const cv = root.querySelector('canvas'), g = cv.getContext('2d'), chipEl = root.querySelector('.sb-chip'), statusEl = root.querySelector('.sb-status');
    cv.width = CW; cv.height = CH;

    // ---------- geometry ----------
    const toRotF = (x, y) => { switch (S.rot) { case 1: return [N - y, x]; case 2: return [N - x, N - y]; case 3: return [y, N - x]; default: return [x, y]; } };
    const fromRotF = (u, v) => { switch (S.rot) { case 1: return [v, N - u]; case 2: return [N - u, N - v]; case 3: return [N - v, u]; default: return [u, v]; } };
    const proj = (x, y, z) => { const [u, v] = toRotF(x, y); return [OX + (u - v) * 8, OY + (u + v) * 4 - z * 12]; };
    const planeXY = (X, Y, z) => { const A = (Y - OY + z * 12) / 4, B = (X - OX) / 8; return fromRotF((A + B) / 2, (A - B) / 2); };
    const cellT = (x, y, z) => inb(x, y, z) ? S.T[idx(x, y, z)] : E;
    function rampSurf(i, fx, fy) { const a = S.RA[i], d = a & 7, t = d === 1 ? fx : d === 2 ? fy : d === 3 ? 1 - fx : 1 - fy; return 0.25 + 0.5 * (a >> 3) + 0.5 * t; }
    function solid(x, y, z) {
      const cx = Math.floor(x), cy = Math.floor(y);
      if (cx < 0 || cy < 0 || cx >= N || cy >= N) return E;
      if (z < 0) return GROUND;
      const cz = Math.floor(z), f = z - cz;
      if (cz > S.L || cz >= NZ || (cz === S.L && f > CUTH)) return E;
      const i = idx(cx, cy, cz), t = S.T[i];
      if (isSolid(t)) return t;
      if (SLAB[t]) { if (f >= SLAB[t][0] && f <= SLAB[t][1]) return t; }
      else if (t === RAMP) { const s = rampSurf(i, x - cx, y - cy); if (f <= s && f >= s - 0.25) return RAMP; }
      if (cz > 0) { const j = idx(cx, cy, cz - 1); if (S.T[j] === RAMP) { const s = rampSurf(j, x - cx, y - cy) - 1; if (f <= s && f >= s - 0.25) return RAMP; } }
      return E;
    }
    // ---------- per-pixel ray cast ----------
    const HIT = new Float32Array(CW * CH * 4), HK = new Uint8Array(CW * CH);
    let base = null, edgeSites = [];
    function cast() {
      const img = g.createImageData(CW, CH), d = img.data, top = Math.min(NZ, S.L + 1) + 0.02;
      for (let Y = 0; Y < CH; Y++) for (let X = 0; X < CW; X++) {
        const B = (X - OX) / 8, o = (Y * CW + X) * 4, q = Y * CW + X;
        let hit = E, lo = 0, hi = 0;
        // only the stretch of the ray inside the world's footprint: u, v in [0, N] (u, v grow with h)
        const c0 = (Y - OY) / 8, hMax = Math.min(top, (N - B / 2 - c0) * 8 / 12 + 0.1, (N + B / 2 - c0) * 8 / 12 + 0.1), hMin = Math.max(-0.3, (-B / 2 - c0) * 8 / 12 - 0.1, (B / 2 - c0) * 8 / 12 - 0.1);
        for (let h = hMax; h >= hMin; h -= STEP) {
          const A = (Y - OY + h * 12) / 4, [x, y] = fromRotF((A + B) / 2, (A - B) / 2), s = solid(x, y, h);
          if (s) { hit = s; lo = h; hi = h + STEP; break; }
        }
        HK[q] = hit;
        if (!hit) { HIT[o + 3] = -1; d[o] = 14; d[o + 1] = 15; d[o + 2] = 17; d[o + 3] = 255; continue; }
        for (let k = 0; k < 7; k++) { const m = (lo + hi) / 2, A = (Y - OY + m * 12) / 4, [x, y] = fromRotF((A + B) / 2, (A - B) / 2); if (solid(x, y, m)) lo = m; else hi = m; }
        const Al = (Y - OY + lo * 12) / 4, Ah = (Y - OY + hi * 12) / 4, ul = (Al + B) / 2, vl = (Al - B) / 2, uh = (Ah + B) / 2, vh = (Ah - B) / 2;
        const face = Math.floor(uh) > Math.floor(ul) ? 1 : Math.floor(vh) > Math.floor(vl) ? 2 : 0;
        const [px, py] = fromRotF(ul, vl), pz = lo;
        HIT[o] = px; HIT[o + 1] = py; HIT[o + 2] = pz; HIT[o + 3] = face;
        let c = PALR[hit][face].slice();
        const cx = Math.floor(px), cy = Math.floor(py), cz = Math.floor(pz - (face === 0 ? 1e-3 : 0)), fx = px - cx, fy = py - cy, fz = pz - Math.floor(pz);
        const along = face === 1 ? vl - Math.floor(vl) : ul - Math.floor(ul);
        if (face === 0 && isSolid(hit) && Math.abs(pz - (S.L + CUTH)) < 0.02) c = CUTC.map((v, k) => v + (((X + Y) % 4 === 0) ? 10 : 0) * (k ? 1 : 1));
        else if (face === 0 && (hit === ROAD || hit === RAMP)) {
          const i = idx(cx, cy, Math.min(NZ - 1, Math.max(0, Math.floor(pz - 0.05)))), rx = S.RX[i] || S.RX[idx(cx, cy, Math.max(0, Math.floor(pz - 1.05)))] || 1;
          const run = rx === 1 ? fx : fy, across = rx === 1 ? fy : fx;
          if (rx !== 3 && Math.abs(across - 0.5) < 0.07 && Math.floor(run * 4) % 2 === 0) c = MARK.slice();
          else if (rx !== 3 && (Math.abs(across - 0.1) < 0.04 || Math.abs(across - 0.9) < 0.04)) c = CURB.slice();
        } else if (face === 0 && hit === WATER && ((X * 3 + Y * 7 + (X >> 2)) % 11 === 0)) c = [92, 150, 140];
        else if (face > 0 && (hit === BLOCK || hit === CONC) && fz > 0.32 && fz < 0.62 && ((along > 0.18 && along < 0.44) || (along > 0.56 && along < 0.82))) {
          const lit = hash(cx * 3 + face, cy * 5 + Math.floor(along * 2), cz) < (hit === BLOCK ? 0.55 : 0.12);
          if (hit === BLOCK || lit) c = lit ? LIT.slice() : GLASS.slice();
        }
        if (face > 0 && hit !== WATER && fz < 0.04) c = c.map(v => v * 0.78);
        const fog = Math.min(0.55, Math.max(0, (S.L - pz - 1) / 9));
        for (let k = 0; k < 3; k++) d[o + k] = c[k] * (1 - fog) + FOG[k] * fog;
        d[o + 3] = 255;
      }
      const e = new Uint8ClampedArray(d);
      for (let Y = 1; Y < CH; Y++) for (let X = 1; X < CW; X++) {
        const o = (Y * CW + X) * 4; if (HIT[o + 3] < 0) continue;
        for (const q of [o - 4, o - CW * 4]) {
          const edge = HIT[q + 3] !== HIT[o + 3] || Math.abs(HIT[q + 2] - HIT[o + 2]) > 0.3 || HK[q >> 2] !== HK[o >> 2];
          const tile = !edge && HIT[o + 3] === 0 && (Math.floor(HIT[q] + 1e-3) !== Math.floor(HIT[o] + 1e-3) || Math.floor(HIT[q + 1] + 1e-3) !== Math.floor(HIT[o + 1] + 1e-3));
          if (edge) { for (let k = 0; k < 3; k++) e[o + k] = d[o + k] * 0.6; break; }
          if (tile) { for (let k = 0; k < 3; k++) e[o + k] = d[o + k] * 0.88; }
        }
      }
      img.data.set(e); base = img;
      edgeSites = computeEdges();
    }
    function computeEdges() {   // where an exposed top meets a drop, at corners and half-cells, inside the band
      const m = new Map();
      for (let z = 0; z <= Math.min(S.L, NZ - 1); z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        if (!isSolid(S.T[idx(x, y, z)])) continue;
        const th = z === S.L ? z + CUTH : z + 1;
        if (th < S.L - BAND || (z < S.L && isSolid(cellT(x, y, z + 1)))) continue;
        for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
          if (isSolid(cellT(x + dx, y + dy, z)) && inb(x + dx, y + dy, z)) continue;
          for (const f of [0, 0.5, 1]) {
            const ex = dx === 1 ? x + 1 : dx === -1 ? x : x + f, ey = dy === 1 ? y + 1 : dy === -1 ? y : y + f, p = [ex, ey, th];
            m.set(p.join(), { p, tier: 1, kind: 'EDGE', host: 'top' });
          }
        }
      }
      return [...m.values()];
    }
    // ---------- drawing helpers ----------
    const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); };
    const depthAt = (X, Y) => { X = Math.round(X); Y = Math.round(Y); if (X < 0 || Y < 0 || X >= CW || Y >= CH) return -9; const o = (Y * CW + X) * 4; return HIT[o + 3] < 0 ? -9 : HIT[o + 2]; };
    const visible = p => { const [X, Y] = proj(...p); return p[2] >= depthAt(X, Y) - 0.07 && p[2] <= S.L + CUTH + 0.01; };
    function seg3(a, b, col, w, xray) {   // depth-tested per pixel; hidden parts as a faint dotted x-ray
      const A = proj(...a), B = proj(...b), n = Math.max(1, Math.ceil(Math.hypot(B[0] - A[0], B[1] - A[1])));
      for (let i = 0; i <= n; i++) {
        const t = i / n, X = A[0] + (B[0] - A[0]) * t, Y = A[1] + (B[1] - A[1]) * t, z = a[2] + (b[2] - a[2]) * t;
        if (z >= depthAt(X, Y) - 0.03) R(X - ((w || 1) >> 1), Y - ((w || 1) >> 1), w || 1, w || 1, col); else if (xray && i % 3 === 0) R(X, Y, 1, 1, xray);
      }
    }
    const shown = p => p[2] <= S.L + CUTH + 0.01;
    function girderDraw(gd, col) { seg3(gd.a, gd.b, '#22262b', 3, null); seg3(gd.a, gd.b, col || '#a9b6bf', 2, 'rgba(169,182,191,0.35)'); seg3([gd.a[0], gd.a[1], gd.a[2] + 0.09], [gd.b[0], gd.b[1], gd.b[2] + 0.09], '#f4f8fa', 1, null); }
    function pipeDraw(pts, col, bad) {
      const c = bad ? '#e2573f' : col || '#7e9a5e';
      for (let k = 1; k < pts.length; k++) { seg3(pts[k - 1], pts[k], '#1c211a', 4, null); seg3(pts[k - 1], pts[k], c, 3, 'rgba(126,154,94,0.4)'); seg3([pts[k - 1][0], pts[k - 1][1], pts[k - 1][2] + 0.1], [pts[k][0], pts[k][1], pts[k][2] + 0.1], bad ? '#ffb4a6' : '#b9d48e', 1, null); }
      pts.forEach((p, k) => { const [X, Y] = proj(...p); if (!visibleLoose(p)) return; if (k > 0 && k < pts.length - 1) { R(X - 2, Y - 2, 5, 5, '#1c211a'); R(X - 1, Y - 2, 3, 4, c); } else { R(X - 3, Y - 2, 7, 5, '#1c211a'); R(X - 2, Y - 2, 5, 4, '#9aa080'); } });
    }
    const visibleLoose = p => { const [X, Y] = proj(...p); return p[2] >= depthAt(X, Y) - 0.2; };
    function joints() {
      const m = new Map(), on = (gd, p) => [0, 1, 2].every(k => p[k] >= Math.min(gd.a[k], gd.b[k]) - 1e-6 && p[k] <= Math.max(gd.a[k], gd.b[k]) + 1e-6);
      for (const gd of S.girders) for (const p of [gd.a, gd.b]) m.set(p.join(), p);
      for (const a of S.girders) for (const b of S.girders) if (a !== b) for (const p of [a.a, a.b]) if (on(b, p)) m.set(p.join(), p);
      return [...m.values()];
    }
    function anchorGlyph(p, hot, host) {
      const [X, Y] = proj(...p), vis = visibleLoose(p), c = hot ? '#ffe9a8' : '#c9a54a';
      g.globalAlpha = vis ? 1 : 0.45;
      if (host === 'girder') { R(X - 2, Y - 1, 5, 1, c); R(X, Y, 1, 1, c); R(X - 1, Y + 1, 3, 1, c); R(X - 1, Y + 2, 1, 1, c); R(X + 1, Y + 2, 1, 1, c); R(X - 1, Y + 3, 3, 1, c); }
      else if (host === 'wall') { R(X - 1, Y - 2, 2, 5, '#2c2f33'); R(X, Y - 1, 2, 3, c); }
      else { R(X - 1, Y - 3, 3, 1, c); R(X - 2, Y - 2, 1, 2, c); R(X + 2, Y - 2, 1, 2, c); R(X - 1, Y, 3, 1, c); R(X - 2, Y + 1, 5, 1, '#2c2f33'); }
      g.globalAlpha = 1;
    }
    const cablePts = cb => { const a = cb.a, b = cb.b, o = []; for (let i = 0; i <= 24; i++) { const t = i / 24; o.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t - 4 * cb.sag * t * (1 - t)]); } return o; };
    function cableDraw(cb, col) { const p = cablePts(cb); for (let i = 1; i < p.length; i++) { seg3(p[i - 1], p[i], 'rgba(0,0,0,0.55)', 1, null); seg3([p[i - 1][0], p[i - 1][1], p[i - 1][2] + 0.06], [p[i][0], p[i][1], p[i][2] + 0.06], col || '#e27a4e', 1, 'rgba(226,122,78,0.35)'); } }
    function mark(p, col) { const [X, Y] = proj(...p); R(X - 4, Y, 2, 1, col); R(X + 3, Y, 2, 1, col); R(X, Y - 4, 1, 2, col); R(X, Y + 3, 1, 2, col); R(X, Y, 1, 1, col); }
    function floorBelow(x, y, z) { let z0 = z; while (z0 > 0 && !solid(x, y, z0 - 0.02)) z0 -= 0.02; return Math.max(0, z0); }
    function plumb(p, col) {
      const z0 = floorBelow(p[0], p[1], p[2]), [X, Y0] = proj(...p), [, Y1] = proj(p[0], p[1], z0);
      for (let y = Y0 + 2; y <= Y1; y++) if ((y - Y0) % 3 < 2) { R(X, y + 1, 1, 1, 'rgba(0,0,0,0.5)'); R(X, y, 1, 1, col); }
      for (let z = Math.ceil(z0); z < p[2]; z++) { const [, yt] = proj(p[0], p[1], z); R(X - 1, yt, 3, 1, col); }
      return z0;
    }
    function checker(x0, y0, x1, y1, z, col) {
      const c = [proj(x0, y0, z), proj(x1, y0, z), proj(x1, y1, z), proj(x0, y1, z)];
      const mnY = Math.min(...c.map(q => q[1])), mxY = Math.max(...c.map(q => q[1])), mnX = Math.min(...c.map(q => q[0])), mxX = Math.max(...c.map(q => q[0]));
      g.fillStyle = col;
      for (let Y = Math.floor(mnY); Y <= mxY; Y++) for (let X = Math.floor(mnX); X <= mxX; X++) {
        if ((X + Y) & 1) continue;
        const [wx, wy] = planeXY(X, Y, z);
        if (wx >= x0 && wx <= x1 && wy >= y0 && wy <= y1 && depthAt(X, Y) <= z + 0.05) g.fillRect(X, Y, 1, 1);
      }
    }
    function vfloor(cx, cy, z, r) {
      for (let k = -r; k <= r; k++) for (let s = -r * 8; s <= r * 8; s += 2) {
        const t = s / 8, fade = 1 - Math.hypot(k, t) / (r + 0.5); if (fade <= 0) continue;
        const a = 'rgba(240,180,60,' + Math.min(0.9, 1.5 * fade).toFixed(2) + ')';
        for (const p of [[Math.floor(cx) + k, cy + t, z], [cx + t, Math.floor(cy) + k, z]]) { const [X, Y] = proj(...p); if (depthAt(X, Y) <= z + 0.05) R(X, Y, 1, 1, a); }
      }
    }
    // a unit cube as a sprite: top diamond and the two faces toward the viewer
    const CUBE = {};
    function cubeSprite(col) {
      if (CUBE[col]) return CUBE[col];
      const c = document.createElement('canvas'); c.width = 17; c.height = 21; const x = c.getContext('2d'), [r, gg, b] = hx(col);
      const im = x.createImageData(17, 21);
      for (let py = 0; py < 21; py++) for (let px = 0; px < 17; px++) {
        const dx = px - 8, dy = py; let k = -1;
        const a = dy / 4, bb = dx / 8, u = (a + bb) / 2, v = (a - bb) / 2;
        if (u >= 0 && v >= 0 && u <= 1 && v <= 1) k = 0;
        else { const v1 = 1 - dx / 8, zd = (dy - (1 + v1) * 4) / 12; if (dx >= 0 && v1 >= 0 && v1 <= 1 && zd >= 0 && zd <= 1) k = 1; const u1 = 1 + dx / 8, zd2 = (dy - (u1 + 1) * 4) / 12; if (dx <= 0 && u1 >= 0 && u1 <= 1 && zd2 >= 0 && zd2 <= 1) k = 2; }
        if (k < 0) continue;
        const o = (py * 17 + px) * 4, sh = [1, 0.78, 0.62][k], edge = k === 0 ? (Math.abs(u) < 0.07 || Math.abs(v) < 0.07 || u > 0.93 || v > 0.93) : false;
        im.data[o] = r * sh; im.data[o + 1] = gg * sh; im.data[o + 2] = b * sh; im.data[o + 3] = edge ? 235 : 150;
      }
      x.putImageData(im, 0, 0); CUBE[col] = c; return c;
    }
    function cellTopVertex(x, y, z) { const c = [toRotF(x, y), toRotF(x + 1, y + 1)], U = Math.min(c[0][0], c[1][0]), V = Math.min(c[0][1], c[1][1]); return [OX + (U - V) * 8, OY + (U + V) * 4 - (z + 1) * 12, U + V]; }
    function ghostCells(cells, col) {
      const list = cells.map(c => { const t = cellTopVertex(c[0], c[1], c[2]); return { c, t }; }).sort((a, b) => a.c[2] - b.c[2] || a.t[2] - b.t[2]);
      for (const { c, t } of list) g.drawImage(cubeSprite(c[3] ? '#e2573f' : col), Math.round(t[0] - 8), Math.round(t[1]));
    }

    // ---------- snap sites and picking ----------
    function roadEnds() {
      const out = [];
      for (let z = 0; z < Math.min(NZ, S.L + 1); z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const t = S.T[idx(x, y, z)]; if (t !== ROAD && t !== RAMP) continue;
        let n = 0; for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) for (const dz of [-1, 0, 1]) { const u = cellT(x + dx, y + dy, z + dz); if (u === ROAD || u === RAMP) n++; }
        if (n <= 1 && t === ROAD) out.push({ p: [x + 0.5, y + 0.5, z + 0.25], tier: 0, kind: 'ROAD END', host: 'road', cell: [x, y, z] });
      }
      return out;
    }
    function sites(tool) {
      const s = [];
      if (tool === 'road') return roadEnds();
      for (const a of S.anchors) s.push({ p: a.p, tier: 0, kind: 'ANCHOR', host: a.host });
      for (const j of joints()) s.push({ p: j, tier: 0, kind: 'JOINT', host: 'girder' });
      for (const pp of S.pipes) for (const p of [pp.pts[0], pp.pts[pp.pts.length - 1]]) s.push({ p, tier: 0, kind: 'PIPE END', host: 'pipe', pipe: pp });
      for (const gd of S.girders) { const n = Math.round(Math.hypot(gd.b[0] - gd.a[0], gd.b[1] - gd.a[1], gd.b[2] - gd.a[2]) * 2); for (let i = 1; i < n; i++) { const t = i / n; s.push({ p: [0, 1, 2].map(k => gd.a[k] + (gd.b[k] - gd.a[k]) * t), tier: 1, kind: 'GIRDER', host: 'girder' }); } }
      for (const e of edgeSites) s.push(e);
      return s.filter(q => shown(q.p));
    }
    function hitAt(X, Y) { X = Math.round(X); Y = Math.round(Y); if (X < 0 || Y < 0 || X >= CW || Y >= CH) return null; const o = (Y * CW + X) * 4; if (HIT[o + 3] < 0) return null; return { p: [HIT[o], HIT[o + 1], HIT[o + 2]], face: HIT[o + 3], kind: HK[Y * CW + X] }; }
    const worldNormal = f => f === 0 ? [0, 0, 1] : f === 1 ? [...U_DIR[S.rot], 0] : [...V_DIR[S.rot], 0];
    function faceSite(X, Y, cellCentre) {
      const h = hitAt(X, Y); if (!h) return null;
      let [x, y, z] = h.p; const n = worldNormal(h.face);
      if (h.face === 0) { if (cellCentre) { x = Math.floor(x) + 0.5; y = Math.floor(y) + 0.5; } else { x = Math.round(x * 2) / 2; y = Math.round(y * 2) / 2; } }
      else { if (n[0]) { x = Math.round(x); y = Math.round(y * 2) / 2; } else { y = Math.round(y); x = Math.round(x * 2) / 2; } z = Math.round(z * 2) / 2; }
      const kind = h.face ? 'WALL' : Math.abs(h.p[2] - (S.L + CUTH)) < 0.02 ? 'CUT FACE' : (h.kind === ROAD || h.kind === RAMP) ? 'ROAD' : h.p[2] < 0.3 ? 'FLOOR' : 'TOP';
      return { p: [x, y, z], tier: 2, kind, host: h.face ? 'wall' : 'top', face: h.face, hitKind: h.kind };
    }
    function pick(X, Y, tool) {
      if (S.rules === 'today') { const f = faceSite(X, Y); return f ? Object.assign(f, { kind: 'FIRST SURFACE' }) : null; }
      const all = sites(tool);
      for (const [t, r] of [[0, 7], [1, 5]]) {
        let best = null, bd = r * r;
        for (const q of all) if (q.tier === t && visible(q.p)) { const [x, y] = proj(...q.p), d = (x - X) ** 2 + (y - Y) ** 2; if (d < bd) { bd = d; best = q; } }
        if (best) return best;
      }
      const f = faceSite(X, Y, tool === 'road');
      if (!f) return null;
      if (tool === 'road' && f.face !== 0) return Object.assign(f, { out: true, why: 'ROADS START ON A TOP' });
      if (f.p[2] < S.L - BAND) return Object.assign(f, { out: true, why: 'BELOW BAND' });
      return f;
    }
    // ---------- blocks ----------
    function blockTarget(X, Y) {
      let mode = S.rules === 'today' ? 'cut' : S.bmode;
      if (mode === 'auto') { const h = hitAt(X, Y); mode = h && h.p[2] >= S.L - BAND ? 'attach' : 'cut'; }
      if (mode === 'attach') {
        const h = hitAt(X, Y); if (!h) return null;
        const n = worldNormal(h.face), c = [0, 1, 2].map(k => Math.floor(h.p[k] + n[k] * 0.5 - (k === 2 && !h.face ? 0 : 0)));
        if (h.face) c[2] = Math.floor(h.p[2]);
        return checkCell(c, mode);
      }
      const [x, y] = planeXY(X, Y, S.L + 0.2), c = [Math.floor(x), Math.floor(y), S.L];
      if (!inb(...c)) return null;
      if (mode === 'drop') { if (S.T[idx(...c)] && S.T[idx(...c)] !== WATER) return checkCell(c, mode); while (c[2] > 0 && freeCell(cellT(c[0], c[1], c[2] - 1))) c[2]--; }
      return checkCell(c, mode);
    }
    const freeCell = t => t === E || t === WATER;
    function checkCell(c, mode) {
      if (!inb(...c)) return null;
      const t = S.T[idx(...c)], ok = t === E || t === WATER;
      return { c, ok, mode, held: heldBy(c) };
    }
    function heldBy(c) {
      const [x, y, z] = c, below = cellT(x, y, z - 1);
      if (z === 0 || isSolid(below) || below === ROAD || below === DECK) return 'RESTS';
      for (const gd of S.girders) { const lo = [0, 1, 2].map(k => Math.min(gd.a[k], gd.b[k])), hi = [0, 1, 2].map(k => Math.max(gd.a[k], gd.b[k])); if (Math.abs(lo[2] - z) < 0.01 && hi[2] - lo[2] < 0.01 && lo[0] <= x + 1 && hi[0] >= x && lo[1] <= y + 1 && hi[1] >= y) return 'ON GIRDER'; }
      for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) if (isSolid(cellT(x + dx, y + dy, z))) return 'CANTILEVER';
      return 'FLOATS';
    }
    // ---------- axis runs (girders, block rows, pipe legs) ----------
    const AXES = [['x', [1, 0, 0]], ['y', [0, 1, 0]], ['z', [0, 0, 1]]];
    function bestAxis(a, X, Y, only) {
      const A = proj(...a); let best = null;
      for (const [n, d] of AXES) {
        if (only && !only.includes(n)) continue;
        const e = proj(a[0] + d[0], a[1] + d[1], a[2] + d[2]), ex = e[0] - A[0], ey = e[1] - A[1], L2 = ex * ex + ey * ey;
        const t = ((X - A[0]) * ex + (Y - A[1]) * ey) / L2, off = Math.abs((X - A[0]) * ey - (Y - A[1]) * ex) / Math.sqrt(L2);
        if (!best || off < best.off) best = { n, d, t, off };
      }
      return best;
    }
    function axisRun(a, X, Y) {   // a girder from a: the axis nearest the drag, stopped by the first solid
      const best = bestAxis(a, X, Y);
      let len = Math.round(best.t), stop = 'AIR', k;
      const s = Math.sign(len);
      for (k = 1; k <= Math.abs(len) * 4; k++) { const p = a.map((v, i) => v + best.d[i] * s * k / 4); if (solid(...p) || p[2] < 0 || p[2] > S.L + CUTH) { stop = 'WALL'; break; } }
      len = s * Math.floor((k - 1) / 4);
      let b = a.map((v, i) => v + best.d[i] * len);
      if (best.n === 'z' && s < 0) {
        let z = Math.min(a[2], b[2] + 1); while (z > -0.01 && !solid(b[0] + 1e-3, b[1] + 1e-3, z - 0.02)) z -= 0.02;
        z = Math.round(Math.max(0, z) * 4) / 4;
        if (b[2] - z < 1.01) { b = [b[0], b[1], z]; len = b[2] - a[2]; stop = 'FLOOR'; }
      }
      if (stop === 'AIR') for (const j of joints()) if (j.join() === b.join()) stop = 'JOINT';
      return { axis: best.n, b, len, stop };
    }
    function todayGirder(a, X, Y) {
      const zz = S.L + 0.08, [u, v] = planeXY(X, Y, zz), p = [Math.round(u), Math.round(v), zz];
      return Math.abs(p[0] - a[0]) >= Math.abs(p[1] - a[1]) ? { axis: 'x', b: [p[0], a[1], zz], len: p[0] - a[0], stop: 'PLANE' } : { axis: 'y', b: [a[0], p[1], zz], len: p[1] - a[1], stop: 'PLANE' };
    }
    function blockRow(start, X, Y) {
      const c0 = start.c, ctr = [c0[0] + 0.5, c0[1] + 0.5, c0[2] + 0.5], best = bestAxis(ctr, X, Y), n = Math.round(best.t), s = Math.sign(n), out = [c0.slice()];
      for (let k = 1; k <= Math.abs(n); k++) {
        const c = c0.map((v, i) => v + best.d[i] * s * k);
        if (!inb(...c) || !(S.T[idx(...c)] === E || S.T[idx(...c)] === WATER)) break;
        out.push(c);
      }
      return { cells: out, axis: best.n };
    }
    // ---------- pipes: axis legs that route themselves to the site you point at ----------
    function pipeRoute(a, X, Y) {
      const s = pick(X, Y, 'pipe'), first = bestAxis(a, X, Y);
      if (s && !s.out && s.p.join() !== a.join() && Math.hypot(...proj(...s.p).map((v, i) => v - [X, Y][i])) < 9) {
        const order = [first.n, ...['x', 'y', 'z'].filter(n => n !== first.n).sort((m, n) => Math.abs(s.p['xyz'.indexOf(n)] - a['xyz'.indexOf(n)]) - Math.abs(s.p['xyz'.indexOf(m)] - a['xyz'.indexOf(m)]))];
        const pts = [a.slice()]; let cur = a.slice();
        for (const n of order) { const k = 'xyz'.indexOf(n); if (Math.abs(s.p[k] - cur[k]) > 1e-6) { cur = cur.slice(); cur[k] = s.p[k]; pts.push(cur); } }
        return { pts, to: s, bad: pathBlocked(pts) };
      }
      const r = axisRun(a, X, Y);
      return { pts: r.len ? [a.slice(), r.b] : [a.slice()], to: null, stop: r.stop, bad: false };
    }
    function pathBlocked(pts) {
      for (let k = 1; k < pts.length; k++) { const a = pts[k - 1], b = pts[k], n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) * 4); for (let i = 1; i < n; i++) { const p = a.map((v, j) => v + (b[j] - v) * i / n); if (solid(p[0], p[1], p[2] + 0.12)) return true; } }
      return false;
    }
    // ---------- roads: an L from a top or a road end, rising with scroll ----------
    function roadPlan(start, X, Y, rise) {
      const z0 = start.cell ? start.cell[2] : Math.round(start.p[2]);
      const sc = start.cell ? start.cell : [Math.floor(start.p[0]), Math.floor(start.p[1]), z0];
      let [tx, ty] = planeXY(X, Y, z0 + 0.25).map(Math.floor);
      const snap = pick(X, Y, 'road');
      if (snap && snap.cell && snap.cell.join() !== sc.join()) { [tx, ty] = snap.cell; rise = snap.cell[2] - z0; }
      tx = Math.max(0, Math.min(N - 1, tx)); ty = Math.max(0, Math.min(N - 1, ty));
      const first = Math.abs(tx - sc[0]) >= Math.abs(ty - sc[1]) ? 'x' : 'y';
      const path = roadPath([sc[0], sc[1]], [tx, ty], first);
      const cells = roadCells(path, z0, rise);
      let okN = cells.length;
      cells.forEach((c, k) => { if (k === 0 && start.cell) return; const t = cellT(c.x, c.y, c.z), head = (c.ramp >> 3) ? cellT(c.x, c.y, c.z + 1) : E; if (k < okN && (!inb(c.x, c.y, c.z) || !(t === E || t === WATER || (t === ROAD && !c.ramp)) || head !== E)) okN = k; });
      return { path, cells, okN, z0, rise, snap: snap && snap.cell ? snap : null };
    }
    // ---------- state, undo ----------
    function snapshot() { S.hist.push({ T: S.T.slice(), RA: S.RA.slice(), RX: S.RX.slice(), L: S.L, j: JSON.stringify({ g: S.girders, a: S.anchors, c: S.cables, p: S.pipes }) }); if (S.hist.length > 60) S.hist.shift(); }
    function undo() { const h = S.hist.pop(); if (!h) return; S.T = h.T; S.RA = h.RA; S.RX = h.RX; S.L = h.L; const o = JSON.parse(h.j); S.girders = o.g; S.anchors = o.a; S.cables = o.c; S.pipes = o.p; refresh(); }
    function loadScene(name, keepL) { S.scene = name; if (!keepL) S.L = SCENE_L[name]; S.T.fill(0); S.RA.fill(0); S.RX.fill(0); S.girders = []; S.anchors = []; S.cables = []; S.pipes = []; S.hist = []; SCENES[name](S); refresh(); }
    function addAnchor(s) { if (!S.anchors.some(a => a.p.join() === s.p.join()) && !['ANCHOR', 'PIPE END'].includes(s.kind)) S.anchors.push({ p: s.p.slice(), host: s.host === 'pipe' ? 'top' : s.host }); }
    const autoSag = (a, b) => S.rules === 'today' ? Math.max(0.15, Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) * 0.18 + 0.2) : Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.12 + 0.15;
    function setCut(L) { S.L = Math.max(1, Math.min(NZ - 1, L)); refresh(); }
    function refresh() { cast(); syncBar(); draw(); }

    // ---------- gestures ----------
    const PT = { X: -99, Y: -99, down: null, belly: null, sag: null, rise: 0 };
    let flashMsg = '', flashT = 0;
    function flash(m) { flashMsg = m; flashT = performance.now(); draw(); setTimeout(draw, 2400); }
    const notToday = { anchor: 'There is no anchor tool in the prototype today: cables pick their own ends.', pipe: 'Rigid pipes are not in the prototype yet. Switch to Proposed.', road: 'Roads are not in the prototype yet. Switch to Proposed.' };
    function nearThing(X, Y) {   // for erase: the overlay object nearest the pointer
      let best = null, bd = 25;
      const consider = (p, o) => { if (!shown(p)) return; const [x, y] = proj(...p), d = (x - X) ** 2 + (y - Y) ** 2; if (d < bd) { bd = d; best = o; } };
      for (const a of S.anchors) consider(a.p, { list: 'anchors', o: a });
      for (const cb of S.cables) for (const p of cablePts(cb)) consider(p, { list: 'cables', o: cb });
      for (const pp of S.pipes) for (let k = 1; k < pp.pts.length; k++) for (let i = 0; i <= 8; i++) consider(pp.pts[k - 1].map((v, j) => v + (pp.pts[k][j] - v) * i / 8), { list: 'pipes', o: pp });
      for (const gd of S.girders) for (let i = 0; i <= 16; i++) consider(gd.a.map((v, j) => v + (gd.b[j] - v) * i / 16), { list: 'girders', o: gd });
      return best;
    }
    function nearCable(X, Y) { for (const cb of S.cables) { const m = cablePts(cb)[12], [x, y] = proj(...m); if ((x - X) ** 2 + (y - Y) ** 2 < 49) return cb; } return null; }
    function onDown(X, Y) {
      PT.X = X; PT.Y = Y; PT.sag = null; PT.rise = 0;
      const tool = S.tool;
      if (S.rules === 'today' && notToday[tool]) { flash(notToday[tool]); return; }
      if (tool === 'erase') {
        const t = nearThing(X, Y);
        snapshot();
        if (t) { S[t.list] = S[t.list].filter(o => o !== t.o); if (t.list === 'anchors') S.cables = S.cables.filter(c => c.a.join() !== t.o.p.join() && c.b.join() !== t.o.p.join()); draw(); return; }
        const h = hitAt(X, Y); if (!h) { S.hist.pop(); return; }
        const n = worldNormal(h.face), c = [0, 1, 2].map(k => Math.floor(h.p[k] - n[k] * 0.02));
        if (h.face === 0 && (h.kind === ROAD || h.kind === RAMP || h.kind === WATER)) c[2] = Math.floor(h.p[2] - 0.05);
        if (h.kind === RAMP && S.T[idx(...c)] !== RAMP && c[2] > 0) c[2]--;
        if (inb(...c) && S.T[idx(...c)]) { const i = idx(...c); S.T[i] = 0; S.RA[i] = 0; S.RX[i] = 0; refresh(); } else S.hist.pop();
        return;
      }
      if (tool === 'cable' && S.rules === 'proposed') { const cb = nearCable(X, Y); if (cb) { snapshot(); PT.belly = { cb, y0: Y, s0: cb.sag }; return; } }
      if (tool === 'block') { const t = blockTarget(X, Y); if (!t || !t.ok) { flash(t ? 'That cell is taken.' : 'Point at the world.'); return; } PT.down = t; return; }
      if (tool === 'girder' && S.rules === 'today') { const [u, v] = planeXY(X, Y, S.L + 0.08); PT.down = { p: [Math.round(u), Math.round(v), S.L + 0.08], kind: 'PLANE' }; return; }
      const s = pick(X, Y, tool);
      if (!s || s.out) { flash(s && s.out ? (s.why === 'BELOW BAND' ? 'Below the working band: lower the cut, or anchor there first.' : 'Roads start on a top surface or a road end.') : 'Nothing to fix to here.'); return; }
      PT.down = s;
      if (tool === 'anchor') { snapshot(); addAnchor(s); PT.down = null; }
    }
    function onMove(X, Y) {
      PT.X = X; PT.Y = Y;
      if (PT.belly) { const b = PT.belly, cb = b.cb, span = Math.hypot(cb.b[0] - cb.a[0], cb.b[1] - cb.a[1]); cb.sag = Math.max(0, Math.min(span * 0.9 + 1, b.s0 + (Y - b.y0) / 12)); }
      draw();
    }
    function onUp(X, Y) {
      if (PT.belly) { PT.belly = null; draw(); return; }
      const a = PT.down; PT.down = null;
      if (!a) { draw(); return; }
      const tool = S.tool;
      if (tool === 'block') {
        const cells = S.rules === 'today' ? [a.c] : blockRow(a, X, Y).cells;
        snapshot();
        for (const c of cells) { const i = idx(...c); S.T[i] = BLOCK; S.RA[i] = 0; S.RX[i] = 0; }
        const top = Math.max(...cells.map(c => c[2]));
        if (top > S.L) { S.L = top; flash('The cut followed you up to L' + top + '.'); }
        refresh(); return;
      }
      if (tool === 'girder') {
        const r = S.rules === 'today' ? todayGirder(a.p, X, Y) : axisRun(a.p, X, Y);
        snapshot();
        if (r.len !== 0) S.girders.push({ a: a.p.slice(), b: r.b });
        else if (S.rules === 'today') { const z0 = floorBelow(a.p[0] + 0.01, a.p[1] + 0.01, a.p[2]); if (a.p[2] - z0 > 0.3) S.girders.push({ a: [a.p[0], a.p[1], Math.round(z0 * 4) / 4], b: a.p.slice() }); else S.hist.pop(); }
        else S.hist.pop();
      } else if (tool === 'cable') {
        const b = pick(X, Y, 'cable');
        if (b && !b.out && b.p.join() !== a.p.join()) { snapshot(); if (S.rules === 'proposed') { addAnchor(a); addAnchor(b); } S.cables.push({ a: a.p.slice(), b: b.p.slice(), sag: PT.sag != null ? PT.sag : autoSag(a.p, b.p) }); }
      } else if (tool === 'pipe') {
        const r = pipeRoute(a.p, X, Y);
        if (r.pts.length > 1 && !r.bad) {
          snapshot();
          const ext = a.kind === 'PIPE END' && a.pipe;
          if (ext) { if (ext.pts[ext.pts.length - 1].join() === a.p.join()) ext.pts.push(...r.pts.slice(1)); else ext.pts.unshift(...r.pts.slice(1).reverse()); }
          else S.pipes.push({ pts: r.pts });
          if (a.kind !== 'PIPE END' && a.kind !== 'ANCHOR' && a.kind !== 'JOINT') addAnchor(a);
          if (r.to && r.to.tier >= 1) addAnchor(r.to);
        } else if (r.bad) flash('That route goes through something solid.');
      } else if (tool === 'road') {
        const r = roadPlan(a, X, Y, PT.rise);
        if (r.okN > 1) {
          snapshot();
          const cells = r.cells.slice(0, r.okN);
          for (const c of cells) { const i = idx(c.x, c.y, c.z); if (c.ramp) { S.T[i] = RAMP; S.RA[i] = c.ramp; } else if (S.T[i] !== ROAD) { S.T[i] = ROAD; S.RA[i] = 0; } S.RX[i] |= c.ax === 'x' ? 1 : 2; }
          if (a.cell) S.RX[idx(...a.cell)] |= cells[1] ? (cells[1].ax === 'x' ? 1 : 2) : 0;
          const top = Math.max(...cells.map(c => c.z));
          if (top > S.L) { S.L = top; flash('The cut followed the road up to L' + top + '.'); }
          refresh(); return;
        }
      }
      draw();
    }

    // ---------- the frame ----------
    function chip(p, text, bad) {
      if (!p || !text) { chipEl.hidden = true; return; }
      const [X, Y] = proj(...p), r = cv.getBoundingClientRect(), k = r.width / CW;
      chipEl.hidden = false; chipEl.textContent = text; chipEl.classList.toggle('bad', !!bad);
      chipEl.style.left = Math.min(r.width - 150, X * k + 14) + 'px'; chipEl.style.top = Math.max(0, Y * k - 28) + 'px';
    }
    function pillars() {   // supports under every road cell with air beneath, every other cell
      for (let z = 1; z <= Math.min(S.L, NZ - 1); z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const t = S.T[idx(x, y, z)]; if (t !== ROAD && t !== RAMP) continue;
        if (cellT(x, y, z - 1) !== E || (x + y) % 2) continue;
        const p = [x + 0.5, y + 0.5, z], z0 = floorBelow(x + 0.5, y + 0.5, z - 0.01);
        seg3(p, [p[0], p[1], z0], '#2a2825', 4, null); seg3(p, [p[0], p[1], z0], '#8d877a', 3, null); seg3([p[0], p[1], p[2]], [p[0], p[1], z0], '#a39c8e', 1, null);
      }
    }
    function draw() {
      if (!base) cast();
      g.putImageData(base, 0, 0);
      for (const [a, b] of [[[0, 0], [N, 0]], [[N, 0], [N, N]], [[N, N], [0, N]], [[0, N], [0, 0]]]) { const A = proj(a[0], a[1], S.L + CUTH), B = proj(b[0], b[1], S.L + CUTH), n = Math.hypot(B[0] - A[0], B[1] - A[1]); for (let i = 0; i < n; i++) if (i % 8 < 5) R(A[0] + (B[0] - A[0]) * i / n, A[1] + (B[1] - A[1]) * i / n, 1, 1, 'rgba(232,168,60,0.75)'); }
      pillars();
      for (const gd of S.girders) if (shown(gd.a) && shown(gd.b)) girderDraw(gd);
      for (const j of joints()) if (shown(j) && visible(j)) { const [X, Y] = proj(...j); R(X - 1, Y - 1, 3, 3, '#cdd6dc'); R(X, Y - 1, 1, 1, '#ffffff'); }
      for (const pp of S.pipes) if (pp.pts.every(shown)) pipeDraw(pp.pts);
      for (const cb of S.cables) if (shown(cb.a) && shown(cb.b)) cableDraw(cb);
      for (const a of S.anchors) if (shown(a.p)) anchorGlyph(a.p, false, a.host);
      const X = PT.X, Y = PT.Y, tool = S.tool, prop = S.rules === 'proposed';
      let status = '', cp = null, ct = '', cbad = false;
      if (PT.belly) {
        const cb = PT.belly.cb, m = cablePts(cb)[12]; mark(m, '#e6dfcf');
        cp = m; ct = cb.sag < 0.05 ? 'TAUT' : 'SAG ' + cb.sag.toFixed(1); cbad = cb.sag < 0.05;
        status = 'Dragging the belly: the sag lives in the vertical plane through both ends, so up and down is all the pointer has to say.';
      } else if (PT.down && tool === 'block') {
        const row = S.rules === 'today' ? { cells: [PT.down.c], axis: '' } : blockRow(PT.down, X, Y);
        ghostCells(row.cells, '#5fd3f2'); const last = row.cells[row.cells.length - 1];
        cp = [last[0] + 0.5, last[1] + 0.5, last[2] + 1]; ct = row.cells.length > 1 ? row.axis.toUpperCase() + ' ×' + row.cells.length : 'BLOCK L' + last[2];
        status = prop ? 'Drag to repeat the block along x, y or z (the drag direction picks). Up stacks a column; the cut follows you.' : 'Today: one cell on the cut level per click.';
      } else if (PT.down && tool === 'girder') {
        const a = PT.down.p, r = prop ? axisRun(a, X, Y) : todayGirder(a, X, Y);
        if (prop) for (const [n, d] of AXES) for (const sg of [-1, 1]) for (let s = 0.25; s <= 3; s += 0.25) { if (n === r.axis || (s * 4) % 2 === 0) continue; const p = a.map((v, i) => v + d[i] * s * sg), [px, py] = proj(...p); R(px, py, 1, 1, AXC[n]); }
        if (r.len) girderDraw({ a, b: r.b }, '#f0b43c');
        mark(a, '#f0b43c'); mark(r.b, '#e6dfcf');
        cp = r.b; ct = r.axis.toUpperCase() + ' ' + +Math.abs(r.len).toFixed(2) + (prop ? ' > ' + r.stop : ' @ L' + Math.floor(r.b[2]));
        status = prop ? 'The drag direction picks the axis: x, y and z are three different screen directions in iso. The run stops at the first wall or floor.' : 'Today: girders live on one plane just under the cut, x or y only; a click makes a column.';
      } else if (PT.down && tool === 'cable') {
        const a = PT.down.p, s = pick(X, Y, 'cable');
        if (s && !s.out) { const cb = { a, b: s.p, sag: PT.sag != null ? PT.sag : autoSag(a, s.p) }; cableDraw(cb, '#f0b43c'); mark(s.p, s.tier === 0 ? '#ffe9a8' : '#f0b43c'); cp = s.p; ct = s.kind + ' L' + Math.floor(s.p[2] + 1e-6) + (prop ? '  SAG ' + cb.sag.toFixed(1) : ''); cbad = !prop && Math.abs(s.p[2] - a[2]) > 2; }
        else if (s) { cp = s.p; ct = s.why || 'NO'; cbad = true; }
        mark(a, '#f0b43c');
        status = prop ? 'Release on a site. Scroll (or − and =) sets the sag before you let go.' : 'Today: the far end lands on the first surface under the pointer, however deep.';
      } else if (PT.down && tool === 'pipe') {
        const r = pipeRoute(PT.down.p, X, Y);
        if (r.pts.length > 1) pipeDraw(r.pts, '#f0b43c', r.bad);
        mark(PT.down.p, '#f0b43c');
        const end = r.pts[r.pts.length - 1]; cp = end; cbad = r.bad;
        ct = r.to ? 'TO ' + r.to.kind + (r.pts.length > 2 ? ' · ' + (r.pts.length - 2) + ' ELBOW' + (r.pts.length > 3 ? 'S' : '') : '') : (r.pts.length > 1 ? 'RUN > ' + r.stop : '');
        status = 'Drag along an axis for a straight run; point at a site (an anchor, a pipe end, a joint) and the pipe routes itself there with elbows. Start on a pipe end to extend it.';
      } else if (PT.down && tool === 'road') {
        const r = roadPlan(PT.down, X, Y, PT.rise);
        const ok = r.cells.slice(0, r.okN), bad = r.cells.slice(r.okN);
        ghostCells(ok.filter((c, k) => k || !PT.down.cell).map(c => [c.x, c.y, c.z, 0]).concat(bad.map(c => [c.x, c.y, c.z, 1])), '#d8c37a');
        const last = r.cells[r.cells.length - 1]; cp = [last.x + 0.5, last.y + 0.5, last.z + 1];
        ct = 'ROAD ' + (r.cells.length - 1) + (r.rise ? ' · ' + (r.rise > 0 ? '+' : '') + r.rise + ' LEVEL' + (Math.abs(r.rise) > 1 ? 'S' : '') : '') + (r.snap ? ' > JOIN' : ''); cbad = r.okN < r.cells.length;
        status = 'A road is an L from where you pressed. Scroll (or − and =) adds ramps, two cells per level, right after the start. Point at another road end to join it; crossing at another level makes a bridge.';
      } else if (X > 0) {
        if (tool === 'block') {
          const t = blockTarget(X, Y);
          if (t) {
            const c = t.c, ctr = [c[0] + 0.5, c[1] + 0.5, c[2]];
            if (S.cues && prop) { vfloor(ctr[0], ctr[1], c[2], 2); const z0 = floorBelow(ctr[0], ctr[1], c[2]); checker(c[0], c[1], c[0] + 1, c[1] + 1, z0 + 0.01, 'rgba(0,0,0,0.55)'); }
            ghostCells([[...c, t.ok ? 0 : 1]], '#5fd3f2');
            if (S.cues && prop) plumb(ctr, 'rgba(95,211,242,0.95)');
            cp = [ctr[0], ctr[1], c[2] + 1]; cbad = !t.ok;
            ct = !t.ok ? 'TAKEN' : 'L' + c[2] + (prop ? ' · ' + t.held + (c[2] > S.L ? ' · CUT > L' + c[2] : '') : '');
          }
          status = !prop ? 'Today: the block goes on the cut level, whatever you point at.' : S.bmode === 'auto' ? 'Auto: a face you point at inside the band picks the cell (attach); over open air or deep down, the block goes on the cut level. The cut follows you up.' : S.bmode === 'cut' ? 'On cut: the block goes on the cut level (your hand). [ and ] move the cut. The ghost shows how far it floats and what holds it.' : S.bmode === 'attach' ? 'Attach: the face you point at picks the cell (Townscaper). On top of a cut face it goes up a level and the cut follows.' : 'Drop: the column under the pointer, falling from the cut level until it rests on something.';
        } else if (tool === 'girder' && !prop) {
          const [u, v] = planeXY(X, Y, S.L + 0.08), p = [Math.round(u), Math.round(v), S.L + 0.08]; mark(p, '#f0b43c'); cp = p; ct = 'PLANE L' + S.L;
          status = 'Today: the girder starts on the working plane, whatever is under the pointer.';
        } else if (tool === 'erase') {
          const t = nearThing(X, Y);
          if (t) { const p = t.o.p || (t.o.a) || t.o.pts[0]; mark(t.list === 'cables' ? cablePts(t.o)[12] : p, '#e2573f'); cp = p; ct = 'ERASE ' + t.list.slice(0, -1).toUpperCase(); cbad = true; }
          else { const h = hitAt(X, Y); if (h) { cp = h.p; ct = 'ERASE CELL'; cbad = true; } }
          status = 'Click to remove the thing or the cell under the pointer.';
        } else if (!(S.rules === 'today' && notToday[tool])) {
          if (prop) for (const q of sites(tool)) { if (!visible(q.p)) continue; const [x, y] = proj(...q.p); if ((x - X) ** 2 + (y - Y) ** 2 < 26 * 26) R(x, y, 1, 1, q.tier === 0 ? '#ffe9a8' : 'rgba(255,233,168,0.65)'); }
          const s = pick(X, Y, tool);
          if (s) {
            if (s.out) { mark(s.p, '#e2573f'); cbad = true; ct = s.kind + ' L' + Math.floor(s.p[2] + 1e-6) + ' · ' + s.why; }
            else { mark(s.p, s.tier === 0 ? '#ffe9a8' : '#f0b43c'); ct = s.kind + ' L' + Math.floor(s.p[2] + 1e-6); if (tool === 'anchor') anchorGlyph(s.p, true, s.host); }
            cp = s.p;
            if (s.kind !== 'FLOOR' && s.p[2] > 0.3 && tool !== 'road') plumb(s.p, s.out ? 'rgba(226,87,63,0.8)' : 'rgba(240,180,60,0.85)');
          }
          status = !prop ? 'Today: whatever surface is first under the pointer, at any depth.'
            : tool === 'road' ? 'Roads start on a top surface or at a road end (bright dots).'
            : 'Points beat lines beat faces: anchors, joints and pipe ends win inside 7 px; girder slots and lip edges inside 5; then the face under the pointer, if it is within 2.5 levels of the cut.';
        } else status = notToday[tool];
      }
      if (performance.now() - flashT < 2300) status = flashMsg;
      statusEl.textContent = status;
      chip(cp, ct, cbad);
    }
    function syncBar() {
      root.querySelectorAll('[data-rules]').forEach(b => b.setAttribute('aria-pressed', b.dataset.rules === S.rules));
      root.querySelectorAll('[data-tool]').forEach(b => b.setAttribute('aria-pressed', b.dataset.tool === S.tool));
      root.querySelectorAll('[data-bmode]').forEach(b => { b.setAttribute('aria-pressed', b.dataset.bmode === S.bmode); b.disabled = S.rules === 'today'; });
      root.querySelectorAll('[data-scene]').forEach(b => b.setAttribute('aria-pressed', b.dataset.scene === S.scene));
      root.querySelector('[data-act="cues"]').setAttribute('aria-pressed', S.cues);
      root.querySelector('.sb-cut').textContent = 'L' + S.L;
    }
    // ---------- wiring ----------
    const toBuf = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * CW / r.width, (e.clientY - r.top) * CH / r.height]; };
    cv.addEventListener('pointerdown', e => { cv.focus({ preventScroll: true }); try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } onDown(...toBuf(e)); draw(); });
    cv.addEventListener('pointermove', e => onMove(...toBuf(e)));
    cv.addEventListener('pointerup', e => onUp(...toBuf(e)));
    cv.addEventListener('pointerleave', () => { if (!PT.down && !PT.belly) { PT.X = -99; draw(); } });
    const nudge = d => { if (PT.down && S.tool === 'cable' && S.rules === 'proposed') { const s = pick(PT.X, PT.Y, 'cable'); PT.sag = Math.max(0, (PT.sag != null ? PT.sag : (s ? autoSag(PT.down.p, s.p) : 0.5)) + d * 0.1); draw(); return true; } if (PT.down && S.tool === 'road') { PT.rise = Math.max(-4, Math.min(4, PT.rise + d)); draw(); return true; } return false; };
    cv.addEventListener('wheel', e => { if (nudge(e.deltaY > 0 ? (S.tool === 'road' ? -1 : 1) : (S.tool === 'road' ? 1 : -1))) e.preventDefault(); }, { passive: false });
    root.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.rules) { S.rules = b.dataset.rules; syncBar(); draw(); }
      else if (b.dataset.tool) { S.tool = b.dataset.tool; syncBar(); draw(); }
      else if (b.dataset.bmode) { S.bmode = b.dataset.bmode; syncBar(); draw(); }
      else if (b.dataset.scene) loadScene(b.dataset.scene);
      else { const a = b.dataset.act; if (a === 'cues') { S.cues = !S.cues; syncBar(); draw(); } else if (a === 'cutdn') setCut(S.L - 1); else if (a === 'cutup') setCut(S.L + 1); else if (a === 'rotl') { S.rot = (S.rot + 3) & 3; refresh(); } else if (a === 'rotr') { S.rot = (S.rot + 1) & 3; refresh(); } else if (a === 'undo') undo(); else if (a === 'reset') loadScene(S.scene); }
    });
    const KEYT = { b: 'block', g: 'girder', a: 'anchor', c: 'cable', p: 'pipe', r: 'road', x: 'erase' };
    cv.addEventListener('keydown', e => {
      const k = e.key.toLowerCase();
      if (k === '[') setCut(S.L - 1); else if (k === ']') setCut(S.L + 1);
      else if (k === 'q') { S.rot = (S.rot + 3) & 3; refresh(); } else if (k === 'e') { S.rot = (S.rot + 1) & 3; refresh(); }
      else if (KEYT[k] && !e.metaKey && !e.ctrlKey) { S.tool = KEYT[k]; syncBar(); draw(); }
      else if (k === 't') { S.rules = S.rules === 'today' ? 'proposed' : 'today'; syncBar(); draw(); }
      else if (k === 'z' || k === 'backspace') undo();
      else if (k === '=' || k === '+') nudge(S.tool === 'road' ? 1 : 1);
      else if (k === '-' || k === '_') nudge(-1);
      else if (k === 'escape') { PT.down = null; PT.belly = null; draw(); }
      else return;
      e.preventDefault();
    });
    window.addEventListener('resize', () => draw());
    loadScene(S.scene, opts.L != null);
    root.sandbox = { S, PT, pick, proj, onDown, onMove, onUp, refresh, loadScene, setCut, blockTarget, roadPlan, pipeRoute, axisRun };
  }
  document.querySelectorAll('[data-sandbox]').forEach(el => { let o = {}; try { o = JSON.parse(el.dataset.sandbox || '{}'); } catch (e) { /* defaults */ } Sandbox(el, o); });
})();
