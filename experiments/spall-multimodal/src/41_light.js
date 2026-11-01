// ==========================================================================
// Lighting and fidelity studies, as a post-process on the rendered frame.
// Every pixel has a depth (and a face: top/left/right, or wire) from the
// occlusion pass; with its screen position that gives its exact 3D point.
// From there: sun shadows marched through the cell grid, per-pixel sky
// visibility and ambient occlusion, height mist, light shafts marched
// through open air, and bloom. lightMock(opts) draws the result into an
// overlay over the view; fidelityMock(mode, rect) shows a crop upscaled.
// ==========================================================================
function solidL(x, y, z) {
  if (z < 0) return true;
  const cx = Math.floor(x), cy = Math.floor(y), cz = Math.floor(z);
  if (cx < 0 || cy < 0 || cx >= W || cy >= D || cz >= NL) return false;
  const t = cells[idx(cx, cy, cz)]; if (!t) return false;
  const f = z - cz;
  if (t === T.TREE) return f > 0.35;
  const o = occOf(t); return !!o && f >= o[0] && f <= o[1];
}
// a direction in the rotated (view) frame -> world frame
function dirFromRot(a, b) {
  switch (S.rot) { case 1: return [b, -a]; case 2: return [-a, -b]; case 3: return [-b, a]; default: return [a, b]; }
}
const SUNS = {
  morning: { az: 200, el: 22, col: [1.12, 0.98, 0.82], shade: [0.55, 0.6, 0.78] },
  noon: { az: 120, el: 62, col: [1.08, 1.06, 1.0], shade: [0.62, 0.66, 0.78] },
  evening: { az: 330, el: 13, col: [1.2, 0.86, 0.62], shade: [0.48, 0.5, 0.7] }
};
function sunVec(name) { const s = SUNS[name], a = s.az * Math.PI / 180, e = s.el * Math.PI / 180; return [Math.cos(e) * Math.cos(a), Math.cos(e) * Math.sin(a), Math.sin(e)]; }
function sunVisible(p, sv, maxd) {
  for (let d = 0.12; d < maxd; d += 0.25) {
    const x = p[0] + sv[0] * d, y = p[1] + sv[1] * d, z = p[2] + sv[2] * d;
    if (z >= NL || x < -2 || y < -2 || x > W + 2 || y > D + 2) return true;
    if (solidL(x, y, z)) return false;
  }
  return true;
}
// world point and normal for buffer pixel i (null for sky)
function pixelWorld(i, bw, b) {
  const fd = WDT.fd[i], wd = WDT.wd ? WDT.wd[i] : -1e9, Dv = Math.max(fd, wd);
  if (Dv < -1e8) return null;
  const x = i % bw, y = (i / bw) | 0, Xp = x + 0.5 - b[0], Yp = y + 0.5 - b[1];
  const s = (Yp + 12 * Dv) / 22, z = Dv - 1.5 * s, dd = Xp / 8, u = (s + dd) / 2, v = (s - dd) / 2;
  const [wx, wy] = fromRotF(u, v), face = wd > fd ? 4 : WDT.face[i];
  let n = [0, 0, 1];
  if (face === 2) { const d = dirFromRot(0, 1); n = [d[0], d[1], 0]; }
  else if (face === 3) { const d = dirFromRot(1, 0); n = [d[0], d[1], 0]; }
  return { p: [wx, wy, z], n, face };
}
function boxBlur(src, w, h, r) {
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
  for (let y = 0; y < h; y++) { let acc = 0; for (let x = -r; x <= r; x++) acc += src[y * w + clamp(x, 0, w - 1)]; for (let x = 0; x < w; x++) { tmp[y * w + x] = acc / (2 * r + 1); acc += src[y * w + clamp(x + r + 1, 0, w - 1)] - src[y * w + clamp(x - r, 0, w - 1)]; } }
  for (let x = 0; x < w; x++) { let acc = 0; for (let y = -r; y <= r; y++) acc += tmp[clamp(y, 0, h - 1) * w + x]; for (let y = 0; y < h; y++) { out[y * w + x] = acc / (2 * r + 1); acc += tmp[clamp(y + r + 1, 0, h - 1) * w + x] - tmp[clamp(y - r, 0, h - 1) * w + x]; } }
  return out;
}
// o: { sun: 'morning'|'noon'|'evening'|null, ao, sky, fog, shafts, bloom, fogCol }
function lightMock(o) {
  WIRES.forceScreen = true; render(); WIRES.forceScreen = false;
  const bw = S.bw, bh = S.bh, b = isoBase(), img = VIEW.ctx.getImageData(0, 0, bw, bh), px = img.data;
  const sv = o.sun ? sunVec(o.sun) : null, SUN = o.sun ? SUNS[o.sun] : null;
  const zref = (S.mode === 'cut' && S.level < NL - 1) ? S.level + HT / LH : NL;
  const view = (() => { const d = dirFromRot(1.5, 1.5); return v3.norm([d[0], d[1], 1]); })();
  const out = new Float32Array(bw * bh * 3);
  const P = new Array(bw * bh);
  for (let i = 0; i < bw * bh; i++) P[i] = pixelWorld(i, bw, b);
  for (let i = 0; i < bw * bh; i++) {
    let r = px[i * 4], g = px[i * 4 + 1], bl = px[i * 4 + 2];
    const w = P[i];
    if (w) {
      const p = w.p, n = w.n, q = [p[0] + n[0] * 0.06, p[1] + n[1] * 0.06, p[2] + n[2] * 0.06];
      let m = [1, 1, 1];
      if (o.sky || o.ao) {
        let sky = 1, ao = 1;
        if (o.sky) { let open = 0; for (const [dx, dy] of [[0, 0], [0.7, 0], [-0.7, 0], [0, 0.7], [0, -0.7]]) { let hit = false; for (let d = 0.5; d < 14 && !hit; d += 0.5) { const z = q[2] + d; if (z >= NL) break; if (solidL(q[0] + dx * d, q[1] + dy * d, z)) hit = true; } if (!hit) open++; } sky = open / 5; }
        if (o.ao) { let occ = 0; const S6 = [[0.4, 0, 0.15], [-0.4, 0, 0.15], [0, 0.4, 0.15], [0, -0.4, 0.15], [0.28, 0.28, 0.4], [-0.28, -0.28, 0.4]]; for (const [a, c, e] of S6) if (solidL(q[0] + a + n[0] * e, q[1] + c + n[1] * e, q[2] + n[2] * e + 0.05)) occ++; ao = 1 - occ / 6 * 0.55; }
        const k = (o.sky ? 0.55 + 0.45 * sky : 1) * ao;
        m = [k, k, k * (o.sky ? 0.96 + 0.06 * sky : 1)];
      }
      if (sv) {
        const ndl = w.face === 0 ? 0.5 : w.face === 4 ? 0.8 : Math.max(0, n[0] * sv[0] + n[1] * sv[1] + n[2] * sv[2]);
        const lit = ndl > 0.02 && sunVisible(q, sv, 34);
        const L = lit ? SUN.col.map(c => lerp(1, c, 0.6) * (0.92 + 0.22 * ndl)) : SUN.shade;
        m = [m[0] * L[0], m[1] * L[1], m[2] * L[2]];
      }
      r *= m[0]; g *= m[1]; bl *= m[2];
      if (o.fog) {
        const depth = Math.max(0, zref - p[2]), f = Math.min(0.85, (1 - Math.exp(-depth * o.fog)) * 0.9), fc = o.fogCol || [70, 82, 92];
        r = lerp(r, fc[0], f); g = lerp(g, fc[1], f); bl = lerp(bl, fc[2], f);
      }
    }
    out[i * 3] = r; out[i * 3 + 1] = g; out[i * 3 + 2] = bl;
  }
  // light shafts: march from each surface toward the viewer through open air, counting sunlit air
  if (o.shafts && sv) {
    const hw = bw >> 1, hh = bh >> 1, acc = new Float32Array(hw * hh);
    for (let y = 0; y < hh; y++) for (let x = 0; x < hw; x++) {
      const w = P[(y * 2) * bw + x * 2];
      let a = 0;
      const p = w ? w.p : null;
      if (p) for (let d = 0.3; d < 7; d += 0.35) {
        const s3 = [p[0] + view[0] * d, p[1] + view[1] * d, p[2] + view[2] * d];
        if (s3[2] > zref) break;
        if (solidL(...s3)) continue;
        if (sunVisible(s3, sv, 26)) a += 0.35;
      }
      acc[y * hw + x] = a;
    }
    const bl2 = boxBlur(acc, hw, hh, 1), C = SUN.col;
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
      const a = bl2[(y >> 1) * hw + Math.min(hw - 1, x >> 1)], k = Math.min(0.4, a * o.shafts * 0.09), i = y * bw + x;
      out[i * 3] += 255 * k * 0.9 * C[0] * 0.55; out[i * 3 + 1] += 255 * k * 0.85 * C[1] * 0.55; out[i * 3 + 2] += 255 * k * 0.7 * C[2] * 0.55;
    }
  }
  // bloom: bright warm pixels bleed into the air around them
  if (o.bloom) {
    const lum = new Float32Array(bw * bh);
    for (let i = 0; i < bw * bh; i++) { const r = out[i * 3], g = out[i * 3 + 1], bl = out[i * 3 + 2], l = (r * 0.5 + g * 0.4 + bl * 0.1) / 255; lum[i] = l > 0.55 && r > bl * 1.3 ? (l - 0.4) * 2.2 : 0; }
    const b1 = boxBlur(lum, bw, bh, 2), b2 = boxBlur(lum, bw, bh, 7);
    for (let i = 0; i < bw * bh; i++) { const k = (b1[i] * 0.9 + b2[i] * 1.4) * o.bloom; out[i * 3] += 255 * k; out[i * 3 + 1] += 200 * k; out[i * 3 + 2] += 110 * k; }
  }
  for (let i = 0; i < bw * bh; i++) { px[i * 4] = clamp(out[i * 3], 0, 255); px[i * 4 + 1] = clamp(out[i * 3 + 1], 0, 255); px[i * 4 + 2] = clamp(out[i * 3 + 2], 0, 255); }
  showOverlay(img);
}
function showOverlay(img) {
  let ov = document.getElementById('lightov');
  if (!ov) { ov = document.createElement('canvas'); ov.id = 'lightov'; document.getElementById('stage').appendChild(ov); }
  const cv = document.getElementById('view');
  ov.width = img.width; ov.height = img.height;
  Object.assign(ov.style, { position: 'absolute', left: cv.offsetLeft + 'px', top: cv.offsetTop + 'px', width: cv.style.width, height: cv.style.height, imageRendering: 'pixelated', zIndex: 15, pointerEvents: 'none' });
  ov.getContext('2d').putImageData(img, 0, 0);
}
function clearOverlay() { const ov = document.getElementById('lightov'); if (ov) ov.remove(); }

// ---------- fidelity ----------
// Scale2x (EPX): smooths staircase edges while keeping hard colour boundaries
function scale2x(src) {
  const w = src.width, h = src.height, s = src.data, out = new ImageData(w * 2, h * 2), o = out.data;
  const at = (x, y) => (clamp(y, 0, h - 1) * w + clamp(x, 0, w - 1)) * 4, eq = (a, b) => s[a] === s[b] && s[a + 1] === s[b + 1] && s[a + 2] === s[b + 2];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const P = at(x, y), A = at(x, y - 1), B = at(x + 1, y), C = at(x - 1, y), Dd = at(x, y + 1);
    const e = [P, P, P, P];
    if (eq(C, A) && !eq(C, Dd) && !eq(A, B)) e[0] = A;
    if (eq(A, B) && !eq(A, C) && !eq(B, Dd)) e[1] = B;
    if (eq(Dd, C) && !eq(Dd, B) && !eq(C, A)) e[2] = C;
    if (eq(B, Dd) && !eq(B, A) && !eq(Dd, C)) e[3] = Dd;
    for (let k = 0; k < 4; k++) { const ox = x * 2 + (k & 1), oy = y * 2 + (k >> 1), oi = (oy * w * 2 + ox) * 4; o[oi] = s[e[k]]; o[oi + 1] = s[e[k] + 1]; o[oi + 2] = s[e[k] + 2]; o[oi + 3] = 255; }
  }
  return out;
}
// mode: 'crisp' | 'scale2x' | 'smooth' | 'hybrid'; rect in buffer pixels; result is 4x
function fidelityMock(mode, rect) {
  const [rx, ry, rw, rh] = rect, cv = document.createElement('canvas'); cv.width = rw * 4; cv.height = rh * 4;
  const g = cv.getContext('2d');
  const grab = () => VIEW.ctx.getImageData(rx, ry, rw, rh);
  if (mode === 'hybrid') {
    // the city crisp, the wires redrawn as smooth strokes at 4x
    const keep = [WIRES.cables, WIRES.ties, WIRES.girders, WIRES.mounts, WIRES.posts];
    WIRES.cables = []; WIRES.ties = []; WIRES.girders = []; WIRES.mounts = []; WIRES.posts = []; spineCache.key = -1; render();
    const base = grab(); [WIRES.cables, WIRES.ties, WIRES.girders, WIRES.mounts, WIRES.posts] = keep; spineCache.key = -1; render();
    const t1 = document.createElement('canvas'); t1.width = rw; t1.height = rh; t1.getContext('2d').putImageData(base, 0, 0);
    g.imageSmoothingEnabled = false; g.drawImage(t1, 0, 0, rw * 4, rh * 4);
    g.save(); g.scale(4, 4); g.translate(-rx, -ry); g.lineCap = 'round'; g.lineJoin = 'round';
    const SPn = spines(), hidden = new Map();
    for (const sp of SPn) sp.r.pairs.forEach(pr => { if (!hidden.has(pr.c)) hidden.set(pr.c, []); hidden.get(pr.c).push([pr.a.i, pr.b.i]); });
    const strokes = [];
    for (const c of WIRES.cables) {
      const hid = hidden.get(c) || [], run = [];
      for (let i = 0; i < c.n; i++) {
        const inside = hid.some(([a, b]) => i > a && i < b);
        if (inside) { if (run.length > 1) strokes.push({ c, pts: run.slice() }); run.length = 0; continue; }
        run.push(projIso(c.X[i * 3], c.X[i * 3 + 1], c.X[i * 3 + 2] + c.g.r * 0.6));
      }
      if (run.length > 1) strokes.push({ c, pts: run });
    }
    for (const sp of SPn) sp.r.pairs.forEach((pr, j) => { const pts = []; for (let k = 0; k <= sp.N; k++) { const q = sp.pos(j, k); pts.push(projIso(q[0], q[1], q[2] + pr.c.g.r * 0.6)); } strokes.push({ c: pr.c, pts, d: depthKey(...sp.pos(j, sp.N >> 1)) }); });
    strokes.forEach(st => { if (st.d == null) st.d = depthKey(...xAt(st.c, st.c.n >> 1)); });
    strokes.sort((a, b) => a.d - b.d);
    for (const st of strokes) {
      const pal = wpal(cableHex(st.c), 4), wv = Math.max(0.55, st.c.g.px * 0.8);
      for (const [col, lw, dy] of [[pal[3], wv + 0.45, 0], [pal[1], wv, 0], [pal[0], wv * 0.35, -wv * 0.25]]) {
        g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); st.pts.forEach((q, k) => k ? g.lineTo(q[0], q[1] + dy) : g.moveTo(q[0], q[1] + dy)); g.stroke();
      }
    }
    for (const sp of SPn) for (const [t, k] of [[sp.r.t1, 0], [sp.r.t2, sp.N]]) {
      const p = sp.pts[k], f = sp.F[k], rr = sp.R[k] + 0.02; g.strokeStyle = '#efe9dc'; g.lineWidth = 0.6; g.beginPath();
      for (let j = 0; j <= 24; j++) { const th = j / 24 * Math.PI * 2, q3 = [p[0] + f.A[0] * Math.cos(th) * rr + f.U[0] * Math.sin(th) * rr, p[1] + f.A[1] * Math.cos(th) * rr + f.U[1] * Math.sin(th) * rr, p[2] + f.A[2] * Math.cos(th) * rr + f.U[2] * Math.sin(th) * rr], q = projIso(...q3); j ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); }
      g.stroke();
    }
    for (const gd of WIRES.girders) { const a = projIso(...gd.a), b2 = projIso(...gd.b); g.strokeStyle = '#2a3036'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b2[0], b2[1]); g.stroke(); g.strokeStyle = '#c7d2d9'; g.lineWidth = 0.9; g.beginPath(); g.moveTo(a[0], a[1] - 0.2); g.lineTo(b2[0], b2[1] - 0.2); g.stroke(); }
    g.restore();
  } else {
    let im = grab();
    if (mode === 'scale2x' || mode === 'smooth') im = scale2x(scale2x(im));
    const t1 = document.createElement('canvas'); t1.width = im.width; t1.height = im.height; t1.getContext('2d').putImageData(im, 0, 0);
    g.imageSmoothingEnabled = mode === 'smooth'; g.imageSmoothingQuality = 'high';
    if (mode === 'smooth') { g.filter = 'blur(0.7px)'; }
    g.drawImage(t1, 0, 0, rw * 4, rh * 4);
  }
  Object.assign(cv.style, { position: 'fixed', left: 0, top: 0, zIndex: 103, imageRendering: mode === 'smooth' ? 'auto' : 'pixelated' });
  document.getElementById('sheet') && document.getElementById('sheet').remove();
  cv.id = 'sheet'; document.body.appendChild(cv);
  return [cv.width, cv.height];
}
window.lightMock = lightMock; window.fidelityMock = fidelityMock; window.clearOverlay = clearOverlay;
