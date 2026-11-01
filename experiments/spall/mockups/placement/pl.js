// Placement study overlays, drawn on the real renderer's canvas (art pixels).
window.PL = (() => {
  const cv = () => document.getElementById('view');
  function init() {
    window.requestAnimationFrame = () => 0;     // stop the game loop: frames are stepped and drawn here
    WIRES.agentOff = true; AGENT.screen = null; AGENT.state = 'idle';
    document.body.classList.add('shoot');
    S.hover = null; WIRES.hover = null;
    return 'ok';
  }
  function grab(crop) {
    const c = cv(); if (!crop) return c.toDataURL();
    const o = mk(crop[2], crop[3]); o.getContext('2d').drawImage(c, -crop[0], -crop[1]); return o.toDataURL();
  }
  function draw() { S.hover = null; WIRES.hover = null; render(); return VIEW.ctx; }

  // ---------- pixel helpers (art px, same look as the game's overlays) ----------
  const P = (x, y, z) => { const q = projIso(x, y, z); return [Math.round(q[0]), Math.round(q[1])]; };
  const AMB = '#f0b43c', CRM = '#e6dfcf', CY = '#5fd3f2', RED = '#e2573f', GRN = '#a9cf56', INK = '#1b1305';
  const AX = { x: '#e8735a', y: '#a9cf56', z: '#6fc6e8' };
  function cursor(ctx, X, Y) {   // a 1-px-outlined arrow
    const rows = ['1', '11', '121', '1221', '12221', '122221', '1222221', '12222221', '122221111', '1221221', '121 1221', '11  1221', '1    1221', '     1221', '      11'];
    rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] !== ' ') R_(ctx, X + i, Y + j, 1, 1, r[i] === '1' ? '#101010' : '#ffffff'); });
  }
  function mark(ctx, p, col) { const [X, Y] = P(...p); dia(ctx, X - 4, Y - 2, 8, col); R_(ctx, X, Y, 1, 1, INK); return [X, Y]; }
  function dot(ctx, p, col, s) { const [X, Y] = P(...p); s = s || 1; R_(ctx, X - (s >> 1), Y - (s >> 1), s, s, col); return [X, Y]; }
  function ring(ctx, p, col) { const [X, Y] = P(...p); R_(ctx, X - 1, Y - 2, 3, 1, col); R_(ctx, X - 1, Y + 2, 3, 1, col); R_(ctx, X - 2, Y - 1, 1, 3, col); R_(ctx, X + 2, Y - 1, 1, 3, col); return [X, Y]; }
  function line3(ctx, a, b, col, dash) { const A = P(...a), B = P(...b); pline(ctx, A[0], A[1], B[0], B[1], col, dash); }
  function shadowLine3(ctx, a, b, col, dash) { const A = P(...a), B = P(...b); pline(ctx, A[0], A[1] + 1, B[0], B[1] + 1, 'rgba(0,0,0,0.55)', dash); pline(ctx, A[0], A[1], B[0], B[1], col, dash); }
  function chip(ctx, s, X, Y, bg, fg) { plate(ctx, s, X, Y, bg || AMB, fg || INK); }
  function floorBelow(x, y, z) { let z0 = z; while (z0 > 0 && !wsolid(x, y, z0 - 0.02)) z0 -= 0.02; return Math.max(0, z0); }
  // a plumb line from p down to whatever is under it: dashed, a tick per level, a dithered landing shadow
  function plumb(ctx, p, col, foot) {
    const z0 = floorBelow(p[0], p[1], p[2]), [X, Y0] = P(p[0], p[1], p[2]), [, Y1] = P(p[0], p[1], z0);
    for (let y = Y0; y <= Y1; y++) if (((y - Y0) % 3) < 2) { R_(ctx, X, y + 1, 1, 1, 'rgba(0,0,0,0.5)'); R_(ctx, X, y, 1, 1, col); }
    for (let z = Math.floor(p[2]); z > z0; z--) { const [, Yt] = P(p[0], p[1], z); R_(ctx, X - 1, Yt, 3, 1, col); }
    const f = foot || 0.5; footShadow(ctx, p[0] - f / 2, p[1] - f / 2, p[0] + f / 2, p[1] + f / 2, z0 + 0.01);
    return z0;
  }
  function footShadow(ctx, x0, y0, x1, y1, z, col) {   // a 50% checker shadow on a world rect
    const c = [P(x0, y0, z), P(x1, y0, z), P(x1, y1, z), P(x0, y1, z)];
    const minY = Math.min(...c.map(q => q[1])), maxY = Math.max(...c.map(q => q[1])), minX = Math.min(...c.map(q => q[0])), maxX = Math.max(...c.map(q => q[0]));
    ctx.fillStyle = col || 'rgba(0,0,0,0.55)';
    for (let Y = minY; Y <= maxY; Y++) for (let X = minX; X <= maxX; X++) {
      if ((X + Y) & 1) continue;
      const [u, v] = planeAt(X, Y, z), [wx, wy] = fromRotF(u, v);
      if (wx >= x0 && wx <= x1 && wy >= y0 && wy <= y1) ctx.fillRect(X, Y, 1, 1);
    }
  }
  function ghostStamp(ctx, tool, x, y, z, col) {
    const Pc = sortPieces(toolPieces(tool, x, y, z));
    for (const p of sortedForPaint(Pc)) drawPieceGhostIso(ctx, p, col || CY, 0.55, true, !pieceOK(p));
    return Pc;
  }
  const around = (X, Y, w, h) => [Math.round(X - w / 2), Math.round(Y - h / 2), w, h];
  const SC = {};
  SC.explore = () => {
    const o = [];
    o.push(JSON.stringify({ bw: S.bw, bh: S.bh, L: S.level, cam: S.cam, girders: WIRES.girders.map(g => [g.a.map(v => +v.toFixed(2)), g.b.map(v => +v.toFixed(2))]), posts: WIRES.posts.length, voids: WIRES.stage.voids.map(v => v.V) }));
    draw(); o.push(grab());
    return o;
  };

  // ---- 1. today: one cursor, three tools, three depth rules ----
  SC.today = () => withWires(() => {
    setRot(0); look({ zoom: 3, at: [44, 27, 9] });
    const out = [], c = [45.5, 28.5, S.level + HT / LH], [X, Y] = P(...c), crop = around(X - 10, Y + 6, 150, 100);
    // block tool: the cut level, always
    let ctx = draw(); const sp = S.hover; S.tool = 'stack';
    ghostStamp(ctx, 'stack', 45, 28, S.level); cursor(ctx, X, Y); chip(ctx, 'STACK -> ' + lvCode(S.level), X + 12, Y + 14);
    out.push(grab(crop));
    // girder tool: a fixed working height half a level under the cut
    ctx = draw(); const g = gridPointAt(X, Y, workHeight()); mark(ctx, g, AMB); cursor(ctx, X, Y); chip(ctx, 'GIRDER -> ' + lvCode(Math.floor(g[2])), X + 12, Y + 14);
    out.push(grab(crop));
    // cable tool: the first visible surface under the cursor, however far down
    ctx = draw(); const a = wireAnchor(X, Y, WIRES.gauge);
    if (a) { line3(ctx, c, a, 'rgba(240,180,60,0.7)', [2, 2]); const [ax, ay] = mark(ctx, a, AMB); chip(ctx, 'CABLE -> ' + lvCode(Math.floor(a[2])), X + 12, Y + 14); }
    cursor(ctx, X, Y);
    out.push(grab(crop));
    out.push(JSON.stringify({ a, g, L: S.level }));
    return out;
  });

  function look(o) {   // lighter mist, a set zoom, a camera target
    o = o || {};
    LIT.mistA = o.mist != null ? o.mist : 0.018;
    if (o.sun && o.sun !== LIT.sun) setLightTime(o.sun);
    if (o.zoom && o.zoom !== S.zoom) setZoom(o.zoom);
    if (o.level != null && o.level !== S.level) setLevel(o.level, { silent: true, snap: true });
    if (o.at) centerOn(...o.at);
    for (let k = 0; k < 40 && (dirtyLv.size || lazyLv.size); k++) render();
    render();
  }
  SC.frames = () => {
    const out = [];
    look({ zoom: 3, at: [48, 28, 10] }); out.push(grab(draw() && null));
    look({ zoom: 3, at: [18, 28, 9] }); out.push(grab());
    look({ zoom: 3, at: [18, 28, 9], sun: 'evening' }); out.push(grab());
    return out;
  };

  // the world points under one screen point: the iso view ray, from the top of the world down
  function rayAt(X, Y) { const pts = []; for (let h = NL; h >= 0; h -= 0.25) { const [u, v] = planeAt(X, Y, h), [x, y] = fromRotF(u, v); pts.push([x, y, h]); } return pts; }
  function setRot(r) { while (S.rot !== r) { S.rot = (S.rot + 1) & 3; } markAllDirty(); }
  // ---- 1. the diagnosis: one pixel, three tools, three places ----
  SC.ray = () => {
    const out = [];
    setRot(0); look({ zoom: 3, at: [46, 27, 10] });
    const c = [45.5, 28.5, S.level + HT / LH], [X, Y] = P(...c);
    const stackAt = [45.5, 28.5, S.level + 0.2], girder = gridPointAt(X, Y, workHeight()), cable = wireAnchor(X, Y, WIRES.gauge);
    const ray = rayAt(X, Y);
    let ctx = draw();
    cursor(ctx, X, Y);
    out.push(grab(around(X, Y, 200, 140)));
    setRot(1); look({ at: [44, 27, 9] });
    ctx = draw();
    out.push(JSON.stringify(ray.filter((p, k) => k % 8 === 0).map(p => P(...p))));
    for (let k = 1; k < ray.length; k++) if (k % 2) shadowLine3(ctx, ray[k - 1], ray[k], '#ffffff');
    const lab = (p, s, col, dx, dy) => { const [x, y] = mark(ctx, p, col); chip(ctx, s, x + (dx || 7), y + (dy || -4), col); };
    lab(stackAt, 'STACK ' + lvCode(S.level), CY);
    lab(girder, 'GIRDER', AMB);
    if (cable) lab(cable, 'CABLE ' + lvCode(Math.floor(cable[2])), '#e8735a');
    const top = ray[Math.round((NL - (S.level + 2)) * 4)]; const [tx, ty] = P(...top); chip(ctx, 'YOUR CURSOR, SEEN SIDE-ON', tx - 40, ty - 12, '#ffffff');
    out.push(grab(around(...P(44, 27, 9), 220, 160)));
    out.push(JSON.stringify({ stackAt, girder, cable }));
    setRot(0); look({});
    return out;
  };
  // ---- 2. depth cues on a block ghost ----
  function vfloor(ctx, cx, cy, z, r, col) {   // a virtual floor: grid lines on the plane z near (cx, cy), fading out
    const rgb = col || '240,180,60';
    for (let k = -r; k <= r; k++) for (let s = -r * 8; s <= r * 8; s++) {
      const t = s / 8, fade = 1 - Math.hypot(k, t) / (r + 0.5); if (fade <= 0 || (s & 1)) continue;
      const a = 'rgba(' + rgb + ',' + Math.min(1, 1.6 * fade).toFixed(2) + ')';
      dot(ctx, [Math.floor(cx) + k, cy + t, z], a); dot(ctx, [cx + t, Math.floor(cy) + k, z], a);
    }
  }
  SC.ghost = () => withWires(() => {
    const out = []; setRot(0); look({ zoom: 3, at: [44, 28, 9] });
    const x = 44, y = 27, L = S.level, [X, Y] = P(x + 1, y + 1, L + 0.3), crop = around(...P(44, 29, 7), 220, 170);
    let ctx = draw(); ghostStamp(ctx, 'bridge', x, y, L); cursor(ctx, X, Y); out.push(grab(crop));
    ctx = draw();
    vfloor(ctx, x + 1, y + 0.5, L, 4);
    S.toolRot = 0; const Pc = sortPieces(toolPieces('bridge', x, y, L));
    for (const p of Pc) footShadow(ctx, p.x, p.y, p.x + 1, p.y + 1, floorBelow(p.x + 0.5, p.y + 0.5, L) + 0.02, 'rgba(0,0,0,0.6)');
    for (const p of sortedForPaint(Pc)) drawPieceGhostIso(ctx, p, CY, 0.6, true, !pieceOK(p));
    const z0 = plumb(ctx, [x + 0.5, y + 0.5, L], CY, 0.01); plumb(ctx, [x + 5.5, y + 0.5, L], CY, 0.01);
    cursor(ctx, X, Y);
    const [gx, gy] = P(x + 6, y + 0.5, L); chip(ctx, lvCode(L) + ' / ' + (L - Math.floor(z0)) + ' UP', gx + 6, gy - 6, CY);
    out.push(grab(crop));
    return out;
  });

  // ---------- anchors: a small brass fitting, shaped by what it is fixed to ----------
  const BRASS = '#c9a54a', BRASS_D = '#6b5524', STEEL_D = '#2c2f33';
  function anchorGlyph(ctx, p, host, hot) {
    const [X, Y] = P(...p), hi = hot ? '#ffe9a8' : BRASS;
    if (host === 'top') { R_(ctx, X - 2, Y + 1, 5, 1, STEEL_D); R_(ctx, X - 1, Y - 2, 3, 1, hi); R_(ctx, X - 1, Y, 3, 1, hi); R_(ctx, X - 1, Y - 1, 1, 1, hi); R_(ctx, X + 1, Y - 1, 1, 1, hi); R_(ctx, X, Y - 1, 1, 1, BRASS_D); }
    else if (host === 'under') { R_(ctx, X - 2, Y - 2, 5, 1, hi); R_(ctx, X, Y - 1, 1, 1, hi); R_(ctx, X - 1, Y, 3, 1, hi); R_(ctx, X - 1, Y + 1, 1, 1, hi); R_(ctx, X + 1, Y + 1, 1, 1, hi); R_(ctx, X - 1, Y + 2, 3, 1, hi); R_(ctx, X, Y + 1, 1, 1, BRASS_D); }
    else { R_(ctx, X - 1, Y - 2, 2, 5, STEEL_D); R_(ctx, X, Y - 1, 2, 3, hi); R_(ctx, X + 1, Y, 1, 1, BRASS_D); }
    return [X, Y];
  }
  function hotMark(ctx, p, col) { const [X, Y] = P(...p); col = col || AMB; R_(ctx, X - 4, Y, 2, 1, col); R_(ctx, X + 3, Y, 2, 1, col); R_(ctx, X, Y - 4, 1, 2, col); R_(ctx, X, Y + 3, 1, 2, col); return [X, Y]; }
  function withWires(fn) {   // a tidy void B: its own cables, ties and posts out of the way (girders stay)
    const sn = snapWires(), inB = p => p[0] > 33 && p[0] < 63 && p[1] > 20 && p[1] < 36;
    WIRES.cables = WIRES.cables.filter(c => !(inB(xAt(c, 0)) || inB(xAt(c, c.n - 1)) || inB(xAt(c, c.n >> 1))));
    WIRES.ties = WIRES.ties.filter(t => t.m.every(m => WIRES.cables.includes(m.c)));
    WIRES.posts = WIRES.posts.filter(p => !inB([p.x, p.y]));
    spineCache.key = -1;
    try { return fn(); } finally { loadWires(sn); spineCache.key = -1; }
  }
  // the snap sites near the girder bridge of void B, by tier
  function sitesB() {
    const st = WIRES.stage.voids[1], V = st.V, out = [];
    const z = 9, y0 = V.y0 + 1.5, y1 = y0 + 1;
    for (let x = V.x0 + 2; x < V.x1; x += 3) { out.push({ p: [x, y0, z], tier: 0, kind: 'JOINT', host: 'under' }); out.push({ p: [x, y1, z], tier: 0, kind: 'JOINT', host: 'under' }); out.push({ p: [x, y0 + 0.5, z], tier: 1, kind: 'GIRDER', host: 'under' }); }
    for (let x = V.x0; x <= V.x1; x += 0.5) if ((x - V.x0 - 2) % 3) { out.push({ p: [x, y0, z], tier: 1, kind: 'GIRDER', host: 'under' }); out.push({ p: [x, y1, z], tier: 1, kind: 'GIRDER', host: 'under' }); }
    for (let x = V.x0 - 1; x <= V.x1; x += 0.5) out.push({ p: [x, V.y0, 10.25], tier: 1, kind: 'LIP EDGE', host: 'top' });
    for (let x = V.x0 - 1; x <= V.x1; x += 0.5) for (const dy of [0.5]) out.push({ p: [x, V.y0 - 1 + dy, 10.25], tier: 2, kind: 'DECK', host: 'top' });
    return out;
  }
  // winner: the highest tier with a site inside its pixel radius, nearest within it
  const TIER_R = [7, 5, 4];
  function pickSite(sites, X, Y) {
    for (let t = 0; t < 3; t++) {
      let best = null, bd = TIER_R[t] ** 2;
      for (const s of sites) if (s.tier === t) { const [x, y] = P(...s.p), d = (x - X) ** 2 + (y - Y) ** 2; if (d < bd) { bd = d; best = s; } }
      if (best) return best;
    }
    return null;
  }
  function showSites(ctx, sites, X, Y, rad) {
    for (const s of sites) {
      const [x, y] = P(...s.p); if ((x - X) ** 2 + (y - Y) ** 2 > rad * rad) continue;
      if (s.tier === 0) { R_(ctx, x - 1, y, 3, 1, BRASS); R_(ctx, x, y - 1, 1, 3, BRASS); }
      else if (s.tier === 1) { R_(ctx, x, y, 1, 1, '#ffe9a8'); R_(ctx, x, y + 1, 1, 1, 'rgba(0,0,0,0.5)'); }
      else { R_(ctx, x, y, 1, 1, 'rgba(230,223,207,0.8)'); }
    }
  }
  SC.snaps = () => withWires(() => {
    const out = []; setRot(0); look({ zoom: 3, at: [46, 26, 9] });
    const sites = sitesB();
    const cases = [[44.1, 25.55, 9.05, 'near a joint'], [45.4, 26.5, 9.0, 'on a girder'], [43.2, 24.0, 10.4, 'over the lip']];
    for (const [x, y, z] of cases) {
      const ctx = draw(), [X, Y] = P(x, y, z), cX = X + 2, cY = Y + 1;
      showSites(ctx, sites, cX, cY, 26);
      const w = pickSite(sites, cX, cY);
      if (w) { anchorGlyph(ctx, w.p, w.host, true); const [hx, hy] = hotMark(ctx, w.p); chip(ctx, w.kind + (w.tier === 1 && w.kind === 'GIRDER' ? ' 1/2' : ''), hx + 8, hy - 12); }
      cursor(ctx, cX, cY);
      out.push(grab(around(...P(44.5, 25, 9.6), 130, 90)));
    }
    return out;
  });
  // ---- laying a cable: placed anchor -> snapped site, the real cable at the length it will keep ----
  const A0 = [41, 24, 10.25 + 0.11], B0 = [47, 25.5, 9 - 0.12];
  SC.lay = () => withWires(() => {
    const out = []; setRot(0); look({ zoom: 3, at: [45, 25.5, 9.5] });
    const sites = sitesB(), L = v3.dist(A0, B0) * 1.08;
    const c = makeCable(1, A0, B0, { length: L, hue: 1 }); for (let k = 0; k < 240; k++) stepWires(1 / 60); spineCache.key = -1;
    const ctx = draw(), [X, Y] = P(...B0);
    showSites(ctx, sites, X + 3, Y + 2, 26);
    anchorGlyph(ctx, A0, 'top'); anchorGlyph(ctx, B0, 'under', true); hotMark(ctx, B0);
    let lo = 0; for (let i = 0; i < c.n; i++) if (c.X[i * 3 + 2] < c.X[lo * 3 + 2]) lo = i;
    const [lx, ly] = P(...xAt(c, lo)); chip(ctx, 'JOINT', X + 8, Y - 12); chip(ctx, 'SAG ' + (Math.min(A0[2], B0[2]) - c.X[lo * 3 + 2]).toFixed(1), lx - 34, ly + 4, CRM);
    cursor(ctx, X + 3, Y + 2);
    out.push(grab(around(...P(44, 25, 9.4), 150, 96)));
    return out;
  });
  // ---- belly drag: the sag lives in the vertical plane through the two ends ----
  SC.belly = () => withWires(() => {
    const out = []; setRot(0); look({ zoom: 3, at: [45, 25.5, 9.5] });
    const d = v3.dist(A0, B0), c = makeCable(1, A0, B0, { length: d * 1.06, hue: 1 }); for (let k = 0; k < 200; k++) stepWires(1 / 60);
    const crop = around(...P(44, 25, 8.6), 150, 110), N = 84;
    for (let f = 0; f < N; f++) {
      const u = f / (N - 1), k = u < 0.45 ? 1.06 + (u / 0.45) * 0.5 : u < 0.8 ? 1.56 - ((u - 0.45) / 0.35) * 0.56 : 1.0;
      setCableLen(c, Math.max(d * 1.001, d * k)); wake(c);
      for (let s = 0; s < 3; s++) stepWires(1 / 60); spineCache.key = -1;
      const ctx = draw();
      const zt = Math.max(A0[2], B0[2]) + 0.3, zb = Math.min(A0[2], B0[2]) - 3.4;
      for (const [p, q] of [[[A0[0], A0[1], zt], [B0[0], B0[1], zt]], [[A0[0], A0[1], zb], [B0[0], B0[1], zb]], [[A0[0], A0[1], zt], [A0[0], A0[1], zb]], [[B0[0], B0[1], zt], [B0[0], B0[1], zb]]]) line3(ctx, p, q, 'rgba(240,180,60,0.55)', [1, 1]);
      anchorGlyph(ctx, A0, 'top'); anchorGlyph(ctx, B0, 'under');
      let lo = 0; for (let i = 0; i < c.n; i++) if (c.X[i * 3 + 2] < c.X[lo * 3 + 2]) lo = i;
      const lp = xAt(c, lo), [hx, hy] = P(...lp), sag = Math.min(A0[2], B0[2]) - lp[2], taut = k <= 1.0;
      R_(ctx, hx - 2, hy - 2, 5, 1, CRM); R_(ctx, hx - 2, hy + 2, 5, 1, CRM); R_(ctx, hx - 2, hy - 1, 1, 3, CRM); R_(ctx, hx + 2, hy - 1, 1, 3, CRM);
      chip(ctx, taut ? 'TAUT' : 'SAG ' + Math.max(0, sag).toFixed(1), hx + 6, hy + 3, taut ? RED : AMB);
      cursor(ctx, hx + 1, hy + 1);
      out.push(grab(crop));
    }
    return out;
  });
  // ---- girders: the drag direction picks the axis (x, y and z are three distinct screen directions in iso) ----
  SC.girder = () => withWires(() => {
    const out = []; setRot(0); look({ zoom: 3, at: [42, 27, 9] });
    const V = WIRES.stage.voids[1].V, A = [42, V.y0, 10.25];
    let ctx = draw();
    const guide = (dir, col, n) => { for (let s = 0.25; s <= n; s += 0.25) if ((s * 4) % 3) dot(ctx, [A[0] + dir[0] * s, A[1] + dir[1] * s, A[2] + dir[2] * s], col, 2); };
    guide([1, 0, 0], AX.x, 4); guide([-1, 0, 0], AX.x, 4); guide([0, 1, 0], AX.y, 4); guide([0, 0, 1], AX.z, 2.5); guide([0, 0, -1], AX.z, 4);
    hotMark(ctx, A); const [ax, ay] = P(...A); chip(ctx, 'X', ...P(A[0] + 4.3, A[1], A[2]), AX.x); chip(ctx, 'Y', ...P(A[0], A[1] + 4.6, A[2]).map((v, i) => v - (i ? 2 : 8)), AX.y); chip(ctx, 'Z', ax + 3, ay - 34, AX.z);
    cursor(ctx, ax + 1, ay + 1);
    out.push(grab(around(ax, ay + 8, 130, 96)));
    // dragging along y: the run snaps to the far balcony
    const B = [42, V.y1, 10.25]; WIRES.girders.push({ a: A.slice(), b: B.slice() });
    ctx = draw();
    guide([1, 0, 0], 'rgba(232,115,90,0.45)', 2); guide([-1, 0, 0], 'rgba(232,115,90,0.45)', 2);
    hotMark(ctx, A, AX.y); const [bx, by] = hotMark(ctx, B, AMB); chip(ctx, 'Y 8 > BALCONY', bx + 7, by - 4, AMB);
    cursor(ctx, bx + 2, by + 2);
    out.push(grab(around(...P(42, (V.y0 + V.y1) / 2, 10), 150, 110)));
    // and down: a column from a joint to the water
    WIRES.girders.pop(); const J = [50, V.y0 + 2.5, 9], Jb = [50, V.y0 + 2.5, 2.25]; WIRES.girders.push({ a: Jb.slice(), b: J.slice() });
    ctx = draw(); hotMark(ctx, J, AX.z); const [jx, jy] = hotMark(ctx, Jb, AMB); chip(ctx, 'Z -7 > WATER', jx + 7, jy - 4, AMB); cursor(ctx, jx + 2, jy + 2);
    out.push(grab(around(...P(50, V.y0 + 2.5, 5.6), 130, 120)));
    return out;
  });
  // ---- elevator: pick a spot on a floor, then lift straight up from it ----
  SC.elevator = () => withWires(() => {
    const out = []; setRot(0); look({ zoom: 3, at: [50, 29, 6] });
    const base = [50, 29.5, 2.27], up = [50, 29.5, 7], crop = around(...P(50, 29.5, 4.8), 150, 120);
    let ctx = draw(); const [X0, Y0] = P(...base); footShadow(ctx, base[0] - 0.5, base[1] - 0.5, base[0] + 0.5, base[1] + 0.5, base[2], 'rgba(240,180,60,0.7)'); hotMark(ctx, base); chip(ctx, 'WATER ' + lvCode(2), X0 + 8, Y0 - 4); cursor(ctx, X0 + 1, Y0 + 1);
    out.push(grab(crop));
    ctx = draw(); vfloor(ctx, up[0], up[1], up[2], 2);
    const [X1, Y1] = P(...up);
    for (let y = Y1; y <= Y0; y++) if (((y - Y1) % 3) < 2) R_(ctx, X1, y, 1, 1, AMB);
    for (let z = 3; z <= 7; z++) { const [, yt] = P(up[0], up[1], z); R_(ctx, X1 - 2, yt, 5, 1, AMB); }
    footShadow(ctx, base[0] - 0.5, base[1] - 0.5, base[0] + 0.5, base[1] + 0.5, base[2], 'rgba(0,0,0,0.6)');
    anchorGlyph(ctx, up, 'top', true); chip(ctx, lvCode(7) + '  +5', X1 + 8, Y1 - 6); cursor(ctx, X1 + 2, Y1 + 3);
    out.push(grab(crop));
    return out;
  });
  // ---- an anchor below the band: placed once, it is a target from any cut ----
  SC.deep = () => withWires(() => {
    const out = []; setRot(0); look({ zoom: 3, at: [40, 27, 8] });
    const V = WIRES.stage.voids[1].V, D0 = [55, 28.5, 2.36], A = [43, V.y0, 10.36];
    const c = makeCable(1, A, D0, { length: v3.dist(A, D0) * 1.1, hue: 0 }); for (let k = 0; k < 240; k++) stepWires(1 / 60); spineCache.key = -1;
    const ctx = draw(); anchorGlyph(ctx, A, 'top');
    const [dx, dy] = anchorGlyph(ctx, D0, 'top', true); ring(ctx, D0, '#ffe9a8');
    chip(ctx, 'ANCHOR ' + lvCode(2), dx + 8, dy - 3); chip(ctx, "9 BELOW CUT", dx + 8, dy - 13, CRM); cursor(ctx, dx + 2, dy + 2);
    out.push(grab(around(...P(49.5, 26.5, 5.6), 200, 140)));
    return out;
  });
  function run(name) { return SC[name](); }
  return { init, run, SC, grab, draw, look };
})();
