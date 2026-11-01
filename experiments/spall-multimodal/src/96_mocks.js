// ==========================================================================
// Static look mock-ups. Bundles are built route-first: a centerline, and each
// wire laid along it at its slot with exactly the length it needs, then tied.
// Nothing has spare length to bunch up between ties, so bundles stay tight.
// window.mock(id) builds one; window.MOCKS lists them.
// ==========================================================================
const MOCKS = [];
const defMock = (id, title, note, o) => MOCKS.push(Object.assign({ id, title, note }, o));

// ---------- route geometry ----------
function resamplePath(pts, step) {
  const out = [pts[0]];
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1], b = pts[k], n = Math.max(1, Math.ceil(v3.dist(a, b) / step));
    for (let j = 1; j <= n; j++) out.push([lerp(a[0], b[0], j / n), lerp(a[1], b[1], j / n), lerp(a[2], b[2], j / n)]);
  }
  return out;
}
// a straight run between two points that hangs `sag` levels in the middle
function sagLine(a, b, sag, n) {
  n = n || 24; const out = [];
  for (let j = 0; j <= n; j++) { const t = j / n; out.push([lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t) - sag * 4 * t * (1 - t)]); }
  return out;
}
// frames along a path: across (horizontal) and up (perpendicular to the run)
function frames(path) {
  const F = []; let prevA = null;
  for (let k = 0; k < path.length; k++) {
    const p0 = path[Math.max(0, k - 1)], p1 = path[Math.min(path.length - 1, k + 1)], T = v3.norm(v3.sub(p1, p0));
    let A = [-T[1], T[0], 0];
    if (Math.hypot(A[0], A[1]) < 0.3) A = prevA ? prevA.slice() : [1, 0, 0];
    A = v3.norm(A); if (prevA && v3.dot(A, prevA) < 0) A = [-A[0], -A[1], -A[2]];
    let U = v3.norm(v3.cross(T, A)); if (U[2] < 0 || (Math.abs(U[2]) < 0.2 && v3.dot(U, [1, 1, 0]) < 0)) U = [-U[0], -U[1], -U[2]];
    F.push({ A, U }); prevA = A;
  }
  return F;
}
const offAt = (p, f, o) => [p[0] + f.A[0] * o[0] + f.U[0] * o[1], p[1] + f.A[1] * o[0] + f.U[1] * o[1], p[2] + f.A[2] * o[0] + f.U[2] * o[1]];
// cross-section slots: round (hex rings, heaviest at the core) or flat (a row)
function slots(gauges, kind, pitch) {
  const n = gauges.length;
  if (kind === 'flat' || kind === 'row') { const p = pitch || 0.15; return gauges.map((g, i) => [(i - (n - 1) / 2) * p, 0]); }
  const p = pitch || Math.max(0.11, 2.0 * gauges.reduce((s, g) => s + GAUGES[g].r, 0) / n);
  const order = gauges.map((g, i) => i).sort((a, b) => GAUGES[gauges[b]].r - GAUGES[gauges[a]].r), out = new Array(n);
  let ring = 0, k = 0;
  while (k < n) {
    const cap = ring === 0 ? 1 : 6 * ring, cnt = Math.min(cap, n - k);
    for (let j = 0; j < cnt; j++, k++) { const th = j / cnt * Math.PI * 2 + ring * 0.4; out[order[k]] = ring === 0 ? [0, 0] : [Math.cos(th) * ring * p, Math.sin(th) * ring * p]; }
    ring++;
  }
  return out;
}
// a row of sockets centred on p, running along dir
const socketRow = (p, dir, n, sp) => Array.from({ length: n }, (_, i) => [p[0] + dir[0] * (i - (n - 1) / 2) * sp, p[1] + dir[1] * (i - (n - 1) / 2) * sp, p[2] + dir[2] * (i - (n - 1) / 2) * sp]);
// One bundle along a centerline. Each wire: socket -> its slot along the run -> socket.
// ties: arc fractions where the bundle is tied (round or flat); clamp: {frac: point} ties pinned there.
function makeBundle(o) {
  const path = resamplePath(o.center, 0.25), F = frames(path), n = o.gauges.length;
  const sl = o.slots || slots(o.gauges, o.kind || 'round', o.pitch);
  const cables = o.gauges.map((g, i) => {
    const pts = [];
    if (o.sa) pts.push(o.sa[i]);
    for (let k = 0; k < path.length; k++) pts.push(offAt(path[k], F[k], sl[i]));
    if (o.sb) pts.push(o.sb[i]);
    return makeCablePath(g, pts, { slack: 1.0, hue: o.hues ? o.hues[i] : i, hex: o.hex ? o.hex[i % o.hex.length] : null });
  });
  const tieAtFrac = (f, clampTo) => {
    const k = Math.round(f * (path.length - 1)), ms = cables.map((c, i) => ({ c, i: nearestIdx(c, offAt(path[k], F[k], sl[i])) }));
    const t = makeTie(ms, { round: (o.kind || 'round') === 'round', instant: true, offs: sl });
    if (clampTo) clampTie(t, clampTo);
    return t;
  };
  const ends = (o.ties && o.ties.length && o.endTies !== false) ? [o.sa ? 0.015 : null, o.sb ? 0.985 : null].filter(f => f != null) : [];
  for (const f of [...ends, ...(o.ties || [])]) tieAtFrac(f);
  for (const [f, p] of o.clamps || []) tieAtFrac(f, p);
  return { cables, path, F, slots: sl, tieAtFrac };
}
// a wire that rides one bundle's slot for part of its way and another's after
function concatRoutes(parts) {
  const out = [];
  for (const pr of parts) { const path = resamplePath(pr.center, 0.25), F = frames(path), k0 = Math.round((pr.from || 0) * (path.length - 1)), k1 = Math.round((pr.to == null ? 1 : pr.to) * (path.length - 1)); for (let k = k0; k <= k1; k++) out.push(offAt(path[k], F[k], pr.slot)); }
  return out;
}
const lift = (p, r) => [p[0], p[1], p[2] + r + 0.02];

// ---------- the scenes ----------
// a void is 24 x 8 cells: near lip y0-1 and far balcony y1 at L10 (floor 10.25); west ledge x0 at
// L6 (floor 6.25); east ledge x1-1 at L10; floor (water) 2.25. Scenes were drawn for a void at
// x0 = 7: XR maps those x's onto whichever void they are built in.
const XR = (st, x) => x + st.V.x0 - 7;
const G8 = [0, 0, 1, 0, 0, 1, 0, 2];
const lipToBalcony = (st, x, sag, kind, ties, extra) => {
  const z = st.zf + 0.12, a = [x, st.V.y0 - 0.5, z], b = [x + 0.4, st.V.y1 + 0.5, z], sp = kind === 'round' ? 0.2 : 0.15;
  const sa = socketRow([x, st.V.y0 - 0.9, st.zf], [-1, 0, 0], 8, sp).map((p, i) => lift(p, GAUGES[G8[i]].r));
  const sb = socketRow([x + 0.4, st.V.y1 + 0.9, st.zf], [-1, 0, 0], 8, sp).map((p, i) => lift(p, GAUGES[G8[i]].r));
  return makeBundle(Object.assign({ center: sagLine([a[0], a[1] + 0.6, z], [b[0], b[1] - 0.6, z], sag), gauges: G8, sa, sb, kind, ties }, extra || {}));
};
const camA = st => ({ zoom: 4, at: [XR(st, 13.5), st.V.y0 + 4, st.LT - 1.5] });
const camWide = st => ({ zoom: 3, at: [XR(st, 19), st.V.y0 + 4, st.LT - 3] });

defMock('A1', 'Close, loose', 'Eight cables side by side, 1/4 cell apart, no ties: they hang together but nothing holds them.', {
  build(st) { lipToBalcony(st, XR(st, 13), 1.2, 'row', []); settle(300); }, cam: camA });
defMock('A2', 'Ribbon', 'The same eight held flat by clips; between clips the ribbon is one piece.', {
  build(st) { lipToBalcony(st, XR(st, 13), 1.2, 'flat', [0.2, 0.4, 0.6, 0.8]); settle(300); }, cam: camA });
defMock('A3', 'Round bundle: glued wires', 'Banded round; between bands every wire holds its place around one spine, over a dark core. Bands wrap tight.', {
  build(st) { lipToBalcony(st, XR(st, 13), 1.2, 'round', [0.12, 0.3, 0.5, 0.7, 0.88]); settle(300); }, cam: camA });
defMock('A4', 'Round bundle: striped tube', 'The same bundle drawn as one cylinder with lengthwise stripes, each row taking the colour of the wire nearest it, shaded round.', {
  build(st) { lipToBalcony(st, XR(st, 13), 1.2, 'round', [0.12, 0.3, 0.5, 0.7, 0.88]); settle(300); }, cam: camA, look: { bundleLook: 'tube' } });
defMock('A5', 'Striped tube, taut', 'A4 pulled nearly straight.', {
  build(st) { lipToBalcony(st, XR(st, 13), 0.35, 'round', [0.12, 0.3, 0.5, 0.7, 0.88]); settle(300); }, cam: camA, look: { bundleLook: 'tube' } });
defMock('A6', 'Striped tube, muted', 'A4 in the infrastructure palette.', {
  build(st) { lipToBalcony(st, XR(st, 13), 1.2, 'round', [0.12, 0.3, 0.5, 0.7, 0.88]); settle(300); }, cam: camA, look: { bundleLook: 'tube', palette: 'muted' } });

// progressive: from a spread row of sockets, pairs, then fours, then all eight
function progressive(st, center, sa, sb, hues) {
  const n = 8, row = slots(G8, 'row', 0.3), all = slots(G8, 'round');
  const s1 = 0.1, s2 = 0.22, s3 = 0.36, bl = 0.05;
  const pairC = i => [(Math.floor(i / 2) - 1.5) * 0.42, 0], pairS = i => [(i % 2 - 0.5) * 0.15, 0];
  const quadC = i => [(Math.floor(i / 4) - 0.5) * 0.5, 0], quadS = i => [((i % 2) - 0.5) * 0.15, ((Math.floor(i / 2) % 2) - 0.5) * 0.15];
  const sm = t => t * t * (3 - 2 * t);
  const offOf = (i, s) => {
    const stage = [[0, row[i]], [s1, [pairC(i)[0] + pairS(i)[0], 0]], [s2, [quadC(i)[0] + quadS(i)[0], quadS(i)[1]]], [s3, all[i]]];
    let o = stage[0][1];
    for (let k = 1; k < stage.length; k++) { const w = sm(clamp((s - stage[k][0] + bl) / bl, 0, 1)); o = [lerp(o[0], stage[k][1][0], w), lerp(o[1], stage[k][1][1], w)]; }
    return o;
  };
  const path = resamplePath(center, 0.25), F = frames(path);
  const cables = G8.map((g, i) => {
    const pts = [sa[i]];
    for (let k = 0; k < path.length; k++) pts.push(offAt(path[k], F[k], offOf(i, k / (path.length - 1))));
    pts.push(sb[i]);
    return makeCablePath(g, pts, { slack: 1.0, hue: hues ? hues[i] : i });
  });
  const tie = (f, idxs) => { const k = Math.round(f * (path.length - 1)); return makeTie(idxs.map(i => ({ c: cables[i], i: nearestIdx(cables[i], offAt(path[k], F[k], offOf(i, f))) })), { round: true, instant: true, offs: idxs.map(i => offOf(i, f)) }); };
  for (let p = 0; p < 4; p++) tie(s1 + 0.04, [2 * p, 2 * p + 1]);
  for (let q = 0; q < 2; q++) tie(s2 + 0.04, [4 * q, 4 * q + 1, 4 * q + 2, 4 * q + 3]);
  for (let f = s3 + 0.04; f < 0.97; f += 0.13) tie(f, [0, 1, 2, 3, 4, 5, 6, 7]);
  return cables;
}
const eastToWest = (st, y) => {
  const zE = st.zf + 0.15, zW = st.LW + 0.4;
  const sa = socketRow([st.V.x1 - 0.4, y, st.zf], [0, 1, 0], 8, 0.3).map((p, i) => lift(p, GAUGES[G8[i]].r));
  const sb = socketRow([st.V.x0 + 0.5, y, st.LW + 0.25], [0, 1, 0], 8, 0.25).map((p, i) => lift(p, GAUGES[G8[i]].r));
  return { center: sagLine([st.V.x1 - 1, y, zE], [st.V.x0 + 1, y, zW], 1.6, 40), sa, sb };
};
const camEast = st => ({ zoom: 4, at: [st.V.x1 - 4.5, st.V.y0 + 4, st.LT - 1.2] });
defMock('B1', 'Progressive bundling, glued wires', 'Framed on the east ledge: from a spread row of sockets, pairs, then fours, then all eight, heading off across the chasm.', {
  build(st) { const r = eastToWest(st, st.V.y0 + 4); progressive(st, r.center, r.sa, r.sb); settle(400); }, cam: camEast });
defMock('B1t', 'Progressive bundling, striped tube', 'B1 with bundles drawn as striped tubes.', {
  build(st) { const r = eastToWest(st, st.V.y0 + 4); progressive(st, r.center, r.sa, r.sb); settle(400); }, cam: camEast, look: { bundleLook: 'tube' } });
defMock('B2', 'Progressive, whole span', 'The B1 bundle all the way across: high east ledge to low west ledge, a vertical bend from the height change.', {
  build(st) { const r = eastToWest(st, st.V.y0 + 4); progressive(st, r.center, r.sa, r.sb); settle(400); }, cam: camWide, look: { bundleLook: 'tube' } });
defMock('B3', 'Bundles joining a trunk', 'Three small bundles leave the near lip at different points and meet mid-chasm, then run on as one trunk to the west ledge (striped tube).', {
  build(st) { joiningBundles(st); settle(400); }, cam: camWide, look: { bundleLook: 'tube' } });
function joiningBundles(st) {
  {
    const M = [XR(st, 17), st.V.y0 + 4, 7.6], end = [st.V.x0 + 1, st.V.y0 + 4, st.LW + 0.4], G = [0, 1, 0], all = [];
    const main = sagLine(M, end, 0.6, 20), allSl = slots([0, 1, 0, 0, 1, 0, 0, 1, 0], 'round');
    const groups = [[11, 0], [19, 3], [26, 6]].map(([x, k0]) => { x = XR(st, x);
      const a = [x, st.V.y0 - 0.5, st.zf + 0.15], sa = socketRow([x, st.V.y0 - 0.9, st.zf], [1, 0, 0], 3, 0.25).map((p, i) => lift(p, GAUGES[G[i]].r));
      const c1 = sagLine(a, M, 0.8, 20), sl = slots(G, 'round');
      const cs = G.map((g, i) => makeCablePath(g, [sa[i], ...concatRoutes([{ center: c1, slot: sl[i], to: 0.97 }, { center: main, slot: allSl[k0 + i] }]), lift([end[0] - 0.4, end[1] + (k0 + i - 4) * 0.22, st.LW + 0.25], GAUGES[g].r)], { slack: 1.0, hue: k0 + i }));
      all.push(...cs);
      const p1 = resamplePath(c1, 0.25), F1 = frames(p1);
      for (const f of [0.35, 0.7]) { const k = Math.round(f * (p1.length - 1)); makeTie(cs.map((c, i) => ({ c, i: nearestIdx(c, offAt(p1[k], F1[k], sl[i])) })), { round: true, instant: true, offs: sl }); }
      return cs;
    });
    const pm = resamplePath(main, 0.25), FM = frames(pm);
    for (const f of [0.05, 0.3, 0.55, 0.8]) { const k = Math.round(f * (pm.length - 1)); makeTie(all.map((c, j) => ({ c, i: nearestIdx(c, offAt(pm[k], FM[k], allSl[j])) })), { round: true, instant: true, offs: allSl }); }
  }
}

// trunk on stands along the gallery; a branch turns off at 90° down the spur
function trunkAndBranch(st, onward) {
  const { V, YT, XO, XA, XB, zf } = st, zs = zf + 0.37, y0 = YT + 0.5, xo = XO + 0.5, zT = zs + 0.36;
  const standsX = []; for (let x = XA + 1; x <= XB - 1; x += 3) standsX.push(x + 0.5);
  if (!standsX.some(x => Math.abs(x - xo) < 0.6)) { standsX.push(xo); standsX.sort((a, b) => a - b); }
  const stands = standsX.map(x => addPost(x, y0, zf, zs));
  const spurPosts = []; for (let y = y0 + 3; y < V.y0 - 1.5; y += 3) spurPosts.push(addPost(xo, y, zf, zs));
  const TG = [0, 0, 0, 1, 0, 1, 0, 2, 0, 1], BG = [0, 0, 1, 0, 1];
  const trunkC = [[XA + 0.3, y0, zT], [XB - 0.3, y0, zT]];
  const tsl = slots([...TG, ...BG], 'round'), bsl = slots(BG, 'round');
  const cornerF = (xo - trunkC[0][0]) / (trunkC[1][0] - trunkC[0][0]);
  const spurEnd = onward ? [xo, V.y0 - 0.6, zT] : [xo, V.y0 - 1.6, zT];
  const branchC = [[xo, y0, zT], [xo, y0 + 0.6, zT], spurEnd];
  const trunk = TG.map((g, i) => makeCablePath(g, concatRoutes([{ center: trunkC, slot: tsl[i] }]), { slack: 1.0, hue: i % 3 }));
  const sb = socketRow([xo, V.y0 - 0.9, zf], [1, 0, 0], 5, 0.25).map((p, i) => lift(p, GAUGES[BG[i]].r));
  const branch = BG.map((g, i) => {
    let pts = concatRoutes([{ center: trunkC, slot: tsl[TG.length + i], to: cornerF }, { center: branchC, slot: bsl[i] }]);
    if (onward) pts = pts.concat(concatRoutes([{ center: onward, slot: bsl[i] }]));
    else pts.push(sb[i]);
    return makeCablePath(g, pts, { slack: 1.0, hue: (i + 1) % 3 });
  });
  for (const p of stands) {
    const ms = trunk.map((c, i) => ({ c, i: nearestIdx(c, offAt([p.x, y0, zT], { A: [0, 1, 0], U: [0, 0, 1] }, tsl[i])) }));
    const offs = TG.map((g, i) => tsl[i]);
    if (p.x <= xo + 0.01) branch.forEach((c, i) => { ms.push({ c, i: nearestIdx(c, offAt([p.x, y0, zT], { A: [0, 1, 0], U: [0, 0, 1] }, tsl[TG.length + i])) }); offs.push(tsl[TG.length + i]); });
    clampTie(makeTie(ms, { round: true, instant: true, offs }), postTop(p));
  }
  for (const p of spurPosts) clampTie(makeTie(branch.map(c => ({ c, i: nearestIdx(c, [p.x, p.y, zT]) })), { round: true, instant: true, offs: bsl }), postTop(p));
  return { trunk, branch, bsl, zT };
}
defMock('C1', 'Trunk and branch', 'Trunk on stands along the gallery; a branch turns off at 90° and ends at a socket panel on the lip. Built route-first.', {
  build(st) { trunkAndBranch(st); settle(400); }, cam: st => ({ zoom: 4, at: [st.XO - 1, st.YT + 5, st.LT + 0.5] }) });
defMock('C2', 'Branch carried across', 'The same branch continues over the lip and across the chasm to the balcony as one bundle, banded along the way.', {
  build(st) {
    const xo = st.XO + 0.5, zT = st.zf + 0.73, onward = sagLine([xo, st.V.y0 - 0.6, zT], [xo + 0.5, st.V.y1 + 0.6, st.zf + 0.3], 1.4, 30);
    const r = trunkAndBranch(st, onward);
    const p = resamplePath(onward, 0.25), F = frames(p);
    for (const f of [0.15, 0.35, 0.55, 0.75, 0.92]) { const k = Math.round(f * (p.length - 1)); makeTie(r.branch.map((c, i) => ({ c, i: nearestIdx(c, offAt(p[k], F[k], r.bsl[i])) })), { round: true, instant: true, offs: r.bsl }); }
    settle(400);
  }, cam: st => ({ zoom: 3, at: [st.XO + 2, st.V.y0 - 1, st.LT - 1] }) });
const MIX20 = [0, 0, 1, 0, 2, 0, 1, 0, 0, 3, 1, 0, 0, 1, 2, 0, 0, 1, 0, 3];
defMock('C3', 'A big trunk over the chasm', 'Twenty cables, from data wire to trunk pipe, from the high east ledge to the low west ledge, banded every couple of cells.', {
  build(st) {
    const y = st.V.y0 + 4.5, zE = st.zf + 0.5, zW = st.LW + 0.7, center = sagLine([st.V.x1 - 1.2, y, zE], [st.V.x0 + 1.2, y, zW], 2.2, 40);
    const sa = socketRow([st.V.x1 - 0.4, y, st.zf], [0, 1, 0], 20, 0.24).map((p, i) => lift(p, GAUGES[MIX20[i]].r));
    const sb = socketRow([st.V.x0 + 0.5, y, st.LW + 0.25], [0, 1, 0], 20, 0.22).map((p, i) => lift(p, GAUGES[MIX20[i]].r));
    makeBundle({ center, gauges: MIX20, sa, sb, ties: [0.06, 0.16, 0.26, 0.36, 0.46, 0.56, 0.66, 0.76, 0.86, 0.94] });
    settle(400);
  }, cam: camWide });
defMock('C4', 'Crossing trunks, one peeling off', 'A trunk along the chasm passes over another running across it; three wires peel off the upper one and drop to the floor.', {
  build(st) {
    const y = st.V.y0 + 3.5, upper = sagLine([st.V.x1 - 1.2, y, st.zf + 0.4], [st.V.x0 + 1.2, y, st.LW + 0.6], 1.6, 40);
    const G = [0, 0, 1, 0, 2, 0, 1, 0, 0, 1], sl = slots(G, 'round');
    const sa = socketRow([st.V.x1 - 0.4, y, st.zf], [0, 1, 0], 10, 0.24).map((p, i) => lift(p, GAUGES[G[i]].r));
    const sb = socketRow([st.V.x0 + 0.5, y, st.LW + 0.25], [0, 1, 0], 10, 0.22).map((p, i) => lift(p, GAUGES[G[i]].r));
    const peel = 0.42, pu = resamplePath(upper, 0.25), kP = Math.round(peel * (pu.length - 1)), P = pu[kP];
    const drop = [[P[0], P[1], P[2]], [P[0] - 0.3, P[1] + 0.8, P[2] - 1.5], [P[0] - 0.6, P[1] + 1.4, 2.6]];
    const peelers = [1, 5, 8];
    const cs = G.map((g, i) => {
      if (!peelers.includes(i)) return makeCablePath(g, [sa[i], ...concatRoutes([{ center: upper, slot: sl[i] }]), sb[i]], { slack: 1.0, hue: i });
      const j = peelers.indexOf(i), ps = slots([0, 0, 1], 'round');
      return makeCablePath(g, [sa[i], ...concatRoutes([{ center: upper, slot: sl[i], to: peel }, { center: drop, slot: ps[j] }]), lift([P[0] - 0.6 + j * 0.3, P[1] + 1.9, 2.25], GAUGES[g].r)], { slack: 1.0, hue: i });
    });
    const F = frames(pu);
    for (const f of [0.08, 0.22, 0.36, 0.5, 0.64, 0.78, 0.92]) { const k = Math.round(f * (pu.length - 1)); const keep = (m, i) => f < peel || !peelers.includes(i); makeTie(cs.map((c, i) => ({ c, i: nearestIdx(c, offAt(pu[k], F[k], sl[i])) })).filter(keep), { round: true, instant: true, offs: sl.filter(keep) }); }
    const pd = resamplePath(drop, 0.25), FD = frames(pd), ps = slots([0, 0, 1], 'round');
    for (const f of [0.4, 0.75]) { const k = Math.round(f * (pd.length - 1)); makeTie(peelers.map((i, j) => ({ c: cs[i], i: nearestIdx(cs[i], offAt(pd[k], FD[k], ps[j])) })), { round: true, instant: true, offs: ps }); }
    const x = XR(st, 18), lower = sagLine([x, st.V.y0 - 0.5, st.zf + 0.1], [x + 0.4, st.V.y1 + 0.5, st.zf + 0.1], 3.2, 30);
    makeBundle({ center: lower, gauges: [0, 1, 0, 2, 0, 1, 0], hex: ['#3c3f45', '#33302d', '#45484f'], ties: [0.1, 0.3, 0.5, 0.7, 0.9] });
    settle(400);
  }, cam: camWide , look: { bundleLook: 'tube' } });

// risers: bundled at the sockets, over the lip, down the wall, then a slow curve out along the floor
function riser(st, x, G, mountZs, o) {
  o = o || {};
  const yW = st.V.y0 + 0.22, top = st.zf + 0.2, zb = o.zb != null ? o.zb : 2.25, rb = 0.35;
  const center = [[x, st.V.y0 - 1.2, top], [x, st.V.y0 - 0.3, top], [x, yW + 0.12, top - 0.35], [x, yW, top - 1.1], [x, yW, zb + 1.8],
    [x, yW + 0.12, zb + 1.0], [x + (o.dx || 0) * 0.2, yW + 0.6, zb + rb + 0.35], [x + (o.dx || 0) * 0.6, yW + 1.5, zb + rb + 0.06], [x + (o.dx || 0), yW + (o.run || 4), zb + rb]];
  const sa = socketRow([x, st.V.y0 - 1.6, st.zf], [1, 0, 0], G.length, 0.2).map((p, i) => lift(p, GAUGES[G[i]].r));
  const end = center[center.length - 1], sb = socketRow([end[0], end[1] + 0.4, zb], [1, 0, 0], G.length, 0.2).map((p, i) => lift(p, GAUGES[G[i]].r));
  const b = makeBundle({ center, gauges: G, sa, sb, ties: o.ties || [0.06, 0.12, 0.62, 0.72, 0.84] });
  for (const z of mountZs) {
    const m = [x, st.V.y0 + 0.06, z]; addMount(m);
    const k = b.path.reduce((bi, p, i) => Math.abs(p[2] - z) < Math.abs(b.path[bi][2] - z) && p[1] > st.V.y0 && p[1] < st.V.y0 + 0.4 ? i : bi, 0);
    const t = b.tieAtFrac(k / (b.path.length - 1)); clampTie(t, [x, yW, z - t.R]); t.top = m;
  }
  return b;
}
defMock('D1', 'Riser down the chasm wall', 'Bundled at the sockets, over the lip, down the wall on mounts every two levels, then a slow curve out along the floor.', {
  build(st) { riser(st, XR(st, 15), [0, 0, 1, 0, 1, 2], [9, 7, 5, 3.4]); settle(300); },
  cam: st => ({ zoom: 4, at: [XR(st, 15), st.V.y0 + 1.5, 6] }), look: { bundleLook: 'tube' } });
defMock('D2', 'Three risers', 'Three bundles of different sizes over the lip and down the far wall, each curving out along the floor.', {
  build(st) {
    riser(st, XR(st, 11), [0, 1, 0, 0, 1], [9, 6.5, 4], { dx: -1, run: 3 });
    riser(st, XR(st, 17), [0, 0, 1, 2, 0, 1, 0, 0, 1], [9, 7, 5, 3.4], { run: 5 });
    riser(st, XR(st, 23), [0, 1, 0], [8.5, 5.5], { dx: 1.5, run: 3.5 });
    settle(300);
  }, cam: st => ({ zoom: 3, at: [XR(st, 17), st.V.y0 + 2, 6] }), look: { bundleLook: 'tube' } });
function tangle(st, n, seed, noSettle) {
  const rnd = mulberry32(seed), cs = [];
  const ends = [
    () => [st.V.x0 + rnd() * 24, st.V.y0 - 0.6, st.zf + 0.1],
    () => [st.V.x0 + 1 + rnd() * 21, st.V.y1 + 0.4, st.zf + 0.1],
    () => [st.V.x0 + 0.5, st.V.y0 + 1 + rnd() * 5.5, st.LW + 0.35],
    () => [st.V.x1 - 0.5, st.V.y0 + 1 + rnd() * 5.5, st.zf + 0.1]];
  for (let k = 0; k < n; k++) {
    const g = [0, 0, 0, 1, 1, 2, 3][Math.floor(rnd() * 7)], ia = Math.floor(rnd() * 4); let ib = Math.floor(rnd() * 4); if (ib === ia) ib = (ib + 1 + Math.floor(rnd() * 3)) % 4;
    const a = ends[ia](), b = ends[ib](); a[2] += GAUGES[g].r; b[2] += GAUGES[g].r;
    cs.push(makeCable(g, a, b, { slack: 1.02 + rnd() * 0.1, hue: k }));
  }
  if (!noSettle) settle(500);
  return cs;
}
defMock('D3', 'Tangle over the chasm, muted', 'Thirty-six cables of every gauge between the lip, the balcony and both ledges: the Kowloon look, wide.', {
  build(st) { tangle(st, 36, 11); }, cam: camWide, look: { palette: 'muted' } });
defMock('D4', 'Tangle over the chasm, bright', 'D3 colour-coded by gauge.', {
  build(st) { tangle(st, 36, 11); }, cam: camWide });

// girders: thin steel along grid lines; mount points on them carry the cables
defMock('E1', 'Girder bridge with a strapped bundle', 'Two girders span the chasm wall to wall along a grid line, with cross-pieces; a twelve-cable bundle is strapped under them at mount points.', {
  build(st) { girderBridge(st, 3); settle(300); }, cam: camWide });
function girderBridge(st, dy) {
  {
    const z = 9, y0 = st.V.y0 + dy, y1 = y0 + 1, x0 = st.V.x0 - 0.02, x1 = st.V.x1 + 0.02;
    addGirder([x0, y0, z], [x1, y0, z]); addGirder([x0, y1, z], [x1, y1, z]);
    for (let x = st.V.x0 + 2; x < st.V.x1; x += 3) addGirder([x, y0, z], [x, y1, z]);
    const G = [0, 0, 1, 0, 2, 0, 1, 0, 0, 1, 0, 0], yc = y0 + 0.5, zc = z - 0.62;
    const sa = socketRow([st.V.x1 - 0.4, yc, st.zf], [0, 1, 0], 12, 0.2).map((p, i) => lift(p, GAUGES[G[i]].r));
    const sb = socketRow([st.V.x0 + 0.3, yc, st.LW + 0.25], [0, 1, 0], 12, 0.2).map((p, i) => lift(p, GAUGES[G[i]].r));
    const b = makeBundle({ center: [[st.V.x1 - 1, yc, st.zf + 0.4], [st.V.x1 - 2, yc, zc], [st.V.x0 + 0.9, yc, zc], [st.V.x0 + 0.7, yc, st.LW + 0.6]], gauges: G, sa, sb });
    for (let x = st.V.x0 + 2; x < st.V.x1 - 1.5; x += 3) { const m = addMount([x, yc, z - 0.08]); const k = b.path.reduce((bi, p, i) => Math.abs(p[0] - x) + Math.abs(p[2] - zc) < Math.abs(b.path[bi][0] - x) + Math.abs(b.path[bi][2] - zc) ? i : bi, 0); const t = b.tieAtFrac(k / (b.path.length - 1)); clampTie(t, [x, yc, zc - t.R]); t.top = m.p; }
  }
}
defMock('E1p', 'Girder bridge, plate joints', 'E1 with square gusset plates where girders meet.', {
  build(st) { MOCKS.find(m => m.id === 'E1').build(st); }, cam: camWide, look: { joint: 'plate' } });
defMock('E1r', 'Girder bridge, collar joints', 'E1 with round collars where girders meet.', {
  build(st) { MOCKS.find(m => m.id === 'E1').build(st); }, cam: camWide, look: { joint: 'ring' } });
defMock('E2', 'Girder scaffold', 'A cage of vertical and horizontal girders standing in the chasm; a bundle rises up one column, turns along a beam at L6, and climbs again to the lip.', {
  build(st) {
    const xs = [12, 18, 24].map(x => XR(st, x)), ya = st.V.y0 + 2, yb = st.V.y0 + 5;
    for (const x of xs) for (const y of [ya, yb]) addGirder([x, y, 2.25], [x, y, 10.1]);
    for (const z of [6, 10]) { addGirder([xs[0], ya, z], [xs[2], ya, z]); addGirder([xs[0], yb, z], [xs[2], yb, z]); for (const x of xs) addGirder([x, ya, z], [x, yb, z]); }
    const G = [0, 1, 0, 0, 2, 0, 1], o = 0.3;
    const center = [[xs[0] + o, ya + o, 2.6], [xs[0] + o, ya + o, 6 - 0.3], [xs[0] + 1, ya + o, 6 - 0.35], [xs[1] - 1, ya + o, 6 - 0.35], [xs[1] + o, ya + o, 6 - 0.3], [xs[1] + o, ya + o, 9.6], [xs[1] + o, ya - 0.5, st.zf + 0.3], [xs[1] + o, st.V.y0 - 0.9, st.zf + 0.3]];
    const sa = socketRow([xs[0] + o + 0.6, ya + o + 0.6, 2.25], [1, -1, 0], 7, 0.18).map((p, i) => lift(p, GAUGES[G[i]].r));
    const b = makeBundle({ center, gauges: G, sa });
    const mounts = [[xs[0] + o, ya + 0.08, 4], [xs[0] + 2.5, ya + 0.08, 5.9], [xs[1] - 2.5, ya + 0.08, 5.9], [xs[1] + o, ya + 0.08, 8]];
    for (const m of mounts) { addMount(m); const k = b.path.reduce((bi, p, i) => v3.dist(p, m) < v3.dist(b.path[bi], m) ? i : bi, 0); const t = b.tieAtFrac(k / (b.path.length - 1)); clampTie(t, [b.path[k][0], b.path[k][1], b.path[k][2] - t.R]); t.top = m; }
    for (let f = 0.05; f < 1; f += 0.09) b.tieAtFrac(f);
    settle(300);
  }, cam: st => ({ zoom: 3, at: [XR(st, 18), st.V.y0 + 3.5, 6] }) });
defMock('E3', 'Tangle with girders', 'D3 again with two girders across the chasm; the cables that pass near them are strapped to mount points.', {
  build(st) {
    const z = 8.5;
    addGirder([st.V.x0 - 0.02, st.V.y0 + 2, z], [st.V.x1 + 0.02, st.V.y0 + 2, z]); addGirder([st.V.x0 - 0.02, st.V.y0 + 5.5, z + 1], [st.V.x1 + 0.02, st.V.y0 + 5.5, z + 1]);
    const cs = tangle(st, 30, 21);
    for (const [y, zz] of [[st.V.y0 + 2, z], [st.V.y0 + 5.5, z + 1]]) for (let x = st.V.x0 + 2; x < st.V.x1 - 1; x += 2.5) {
      const near = cs.map(c => { let bi = 0, bd = 9; for (let i = 0; i < c.n; i++) { const d = Math.hypot(c.X[i * 3] - x, c.X[i * 3 + 1] - y); if (d < bd) { bd = d; bi = i; } } return { c, i: bi, d: bd, z: c.X[bi * 3 + 2] }; }).filter(q => q.d < 0.5 && Math.abs(q.z - zz) < 1.6);
      if (near.length < 2) continue;
      const m = addMount([x, y, zz - 0.08]), t = makeTie(near.map(q => ({ c: q.c, i: q.i })), { round: true }); clampTie(t, [x, y, zz - 0.35 - t.R]); t.top = m.p;
    }
    settle(400);
  }, cam: camWide, look: { palette: 'muted' } });

// a riser that hangs: bundled from sockets on the lip, over the edge, and one free curve down
// to sockets on the floor. No wall mounts, a few sliding ties: gravity draws the curve.
function hangingRiser(st, x, G, o) {
  o = o || {};
  const top = st.zf + 0.2, zb = 2.25, rb = 0.3, y0 = st.V.y0, run = o.run || 6, dx = o.dx || 0;
  // a quarter-ellipse sweep: straight down off the edge, easing out to lie along the floor
  const A = [x, y0 + 0.1, top - 0.3], B = [x + dx, y0 + run, zb + rb], h = A[2] - B[2], r = B[1] - A[1];
  const C1 = [x, A[1] + 0.05, A[2] - h * 0.55], C2 = [B[0], B[1] - r * 0.6, B[2]];
  const curve = []; for (let k = 0; k <= 20; k++) { const t = k / 20, u = 1 - t; curve.push([0, 1, 2].map(d => u * u * u * A[d] + 3 * u * u * t * C1[d] + 3 * u * t * t * C2[d] + t * t * t * B[d])); }
  const center = [[x, y0 - 1.2, top], [x, y0 - 0.35, top], ...curve];
  const sa = socketRow([x, y0 - 1.6, st.zf], [1, 0, 0], G.length, 0.2).map((p, i) => lift(p, GAUGES[G[i]].r));
  const sb = socketRow([B[0], B[1] + 0.4, zb], [1, 0, 0], G.length, 0.2).map((p, i) => lift(p, GAUGES[G[i]].r));
  return makeBundle({ center, gauges: G, sa, sb, ties: o.ties || [0.12, 0.4, 0.68] });
}
defMock('D5', 'Hanging riser', 'Bundled over the lip and left to hang: one free curve down to the floor, three sliding ties, no mounts.', {
  build(st) { hangingRiser(st, XR(st, 17), [0, 0, 1, 2, 0, 1, 0, 0, 1]); settle(400); },
  cam: st => ({ zoom: 4, at: [XR(st, 17), st.V.y0 + 2.5, 6] }), look: { bundleLook: 'tube' } });

// the interactive's opening scene: one or two things per void, room left over to work in
function defaultScene(st) {
  const [a, b, c, d] = st.voids;
  trunkAndBranch(a);
  lipToBalcony(a, XR(a, 14), 1.2, 'row', []);                                   // A1
  hangingRiser(a, XR(a, 25), [0, 0, 1, 2, 0, 1, 0]);
  girderBridge(b, 1.5);                                                           // E1
  { const r = eastToWest(b, b.V.y0 + 5.5); progressive(b, r.center, r.sa, r.sb); }  // B1
  joiningBundles(c);                                                              // B3
  tangle(d, 14, 11, true);                                                        // D4, thinned
}

const LOOK0 = { tieStyle: 'band', palette: 'bright', sleeve: false, bundleLook: 'wires', joint: 'bulb' };
function mock(id) {
  const m = MOCKS.find(q => q.id === id); if (!m) return null;
  const st = WIRES.stage;
  Object.assign(WIRES, LOOK0, m.look || {});
  clearWires(); m.build(st);
  WIRES.agentOff = true; AGENT.screen = null; WIRES.hover = null;
  document.body.classList.add('shoot');
  setLevel(st.view, { silent: true, snap: true });
  const cam = m.cam ? m.cam(st) : camA(st);
  setZoom(cam.zoom); centerOn(...cam.at);
  render();
  return { id: m.id, title: m.title, cables: WIRES.cables.length, ties: WIRES.ties.length };
}
window.MOCKS = MOCKS; window.mock = mock;
