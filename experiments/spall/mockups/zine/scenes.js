  // ---------- shared overlay bits ----------
  const AMB = '#f0b43c', CY = '#5fd3f2', RED = '#e2573f', INK = '#1b1305', CRM = '#e6dfcf', BLU = '#6fa8f0', TEAL = '#5fd3c4', WHT = '#eef2f0';
  function ring(ctx, p, c) { const [X, Y] = P(...p); R_(ctx, X - 1, Y - 2, 3, 1, c); R_(ctx, X - 1, Y + 2, 3, 1, c); R_(ctx, X - 2, Y - 1, 1, 3, c); R_(ctx, X + 2, Y - 1, 1, 3, c); R_(ctx, X, Y, 1, 1, c); return [X, Y]; }
  function chip(ctx, s, X, Y, bg, fg) { return plate(ctx, s, X, Y, bg || AMB, fg || INK, 'rgba(0,0,0,0.6)'); }
  function chipAt(ctx, p, s, bg, dx, dy, fg) { const [X, Y] = P(...p); pline(ctx, X, Y, X + (dx || 6), Y + (dy || -8), bg || AMB); return chip(ctx, s, X + (dx || 6), Y + (dy || -8) - 3, bg, fg); }
  function poly3(ctx, pts, c, dash, sh) { for (let k = 1; k < pts.length; k++) { const A = P(...pts[k - 1]), B = P(...pts[k]); if (sh) pline(ctx, A[0], A[1] + 1, B[0], B[1] + 1, 'rgba(0,0,0,0.6)', dash); pline(ctx, A[0], A[1], B[0], B[1], c, dash); } }
  function xmark(ctx, p, c) { const [X, Y] = P(...p); for (let k = -3; k <= 3; k++) { R_(ctx, X + k, Y + k, 1, 1, c); R_(ctx, X + k, Y - k, 1, 1, c); R_(ctx, X + k + 1, Y + k, 1, 1, 'rgba(0,0,0,0.5)'); } }
  function dimAll(ctx, a) { ctx.fillStyle = 'rgba(6,10,14,' + a + ')'; ctx.fillRect(0, 0, cv().width, cv().height); }
  function drone(ctx, p, c, trail) { const [X, Y] = P(...p); if (trail) { const [TX, TY] = P(...trail); pline(ctx, TX, TY, X, Y, 'rgba(255,255,255,0.25)', [1, 2]); } R_(ctx, X - 1, Y, 3, 1, '#20262a'); R_(ctx, X, Y - 1, 1, 3, '#20262a'); R_(ctx, X, Y, 1, 1, c || '#ffd56a'); R_(ctx, X - 2, Y - 1, 1, 1, '#9aa3a8'); R_(ctx, X + 2, Y - 1, 1, 1, '#9aa3a8'); const [, GY] = P(p[0], p[1], Math.floor(p[2]) - 1); R_(ctx, X, GY, 1, 1, 'rgba(0,0,0,0.4)'); }
  function ghosts(ctx, list, c, a) { const all = []; list.forEach(([x, y, z]) => stackPieces(x, y, z).forEach(p => { if (p.ph === 1 || p.ph === 2) all.push(p); })); sortedForPaint(all).forEach(p => drawPieceGhostIso(ctx, p, c || CY, a || 0.55, true, false)); }
  function voidB(fn) {
    const sn = snapWires(), inB = p => p[0] > 33 && p[0] < 63 && p[1] > 20 && p[1] < 36;
    WIRES.cables = WIRES.cables.filter(c => !(inB(xAt(c, 0)) || inB(xAt(c, c.n - 1)) || inB(xAt(c, c.n >> 1))));
    WIRES.ties = WIRES.ties.filter(t => t.m.every(m => WIRES.cables.includes(m.c)));
    WIRES.posts = WIRES.posts.filter(p => !inB([p.x, p.y]));
    spineCache.key = -1;
    try { return fn(); } finally { loadWires(sn); spineCache.key = -1; }
  }
  const WARD = (x, y) => y >= 32 && x >= 38 && x <= 60;
  const A_N = [44.5, 24.0, 8.5], A_S = [48.5, 32.0, 5.5];
  const NIGHT = { zoom: 3, level: 11, at: [48, 28.5, 6.5], sun: 'night', mist: 0.02 };
  function line7() { const c = makeCable(1, A_N, A_S, { slack: 1.06, hex: '#e0a33a' }); settle(500); return c; }

  // ---- night shift 1: the ward is dark; the feeder was cut ----
  SC.fault = () => voidB(() => {
    look(NIGHT); power((x, y) => WARD(x, y) ? 0 : 1); look({});
    const ctx = draw(), o = [];
    o.push(grab());
    const feed = [[36, 33.5, 6], [43, 33.5, 6], [43, 33.5, 6.6]], feed2 = [[47, 33.5, 6], [58, 33.5, 6]];
    poly3(ctx, [[36, 33.5, 6], [43.2, 33.5, 6]], AMB, [3, 2], true); poly3(ctx, feed2, 'rgba(240,180,60,0.45)', [3, 2], true);
    xmark(ctx, [45, 33.5, 6], RED);
    chipAt(ctx, [45, 33.5, 6], 'FEEDER 3 CUT 02:14', RED, 8, 10, '#fff');
    chipAt(ctx, [54, 36, 5], 'WARD 7  0 KW  340 RESIDENTS', CRM, -10, 16);
    chipAt(ctx, [44, 23, 9], 'NORTH BUS  LIVE  12 KW SPARE', AMB, 6, -12);
    o.push(grab());
    return o;
  });
  // ---- night shift 2: a splice across the void ----
  SC.splice = () => voidB(() => {
    look(NIGHT); power((x, y) => WARD(x, y) ? 0 : 1); line7(); look({});
    const o = []; let ctx = draw();
    ring(ctx, A_N, AMB); ring(ctx, A_S, AMB);
    chipAt(ctx, A_N, 'TAP  NORTH BUS', AMB, 6, -10); chipAt(ctx, A_S, 'WARD 7 RISER', CRM, 8, 8);
    o.push(grab());
    // the lights come back, outward from the riser
    for (let f = 0; f <= 14; f++) {
      const r = f * 1.6;
      power((x, y, z) => { if (!WARD(x, y)) return 1; const d = Math.hypot(x - A_S[0], y - A_S[1]) + Math.abs(z - A_S[2]) * 0.6; return d < r ? 1 : (d < r + 2 ? 0.3 : 0); });
      look({}); ctx = draw(); if (f < 4) { ring(ctx, A_S, f & 1 ? '#fff6c8' : AMB); }
      o.push(grab());
    }
    return o;
  });
  // ---- night shift 3: the builders' forecast crosses the line ----
  const PLAN = [[42, 26, 5], [44, 27, 5], [46, 26, 5], [46, 28, 5], [48, 27, 5], [44, 26, 8], [46, 27, 8]];
  SC.forecast = () => voidB(() => {
    look(NIGHT); power(null); const c = line7(); look({});
    const o = []; let ctx = draw();
    ghosts(ctx, PLAN, CY, 0.5);
    const mid = xAt(c, c.n >> 1); xmark(ctx, mid, RED);
    chipAt(ctx, [49, 28, 8.5], 'FORECAST  ACCRETOR 3  +2 DAYS', CY, 6, -14);
    chipAt(ctx, mid, 'CONFLICT  LINE 7', RED, -70, 12, '#fff');
    o.push(grab());
    // tagged and acknowledged: the plan bends around the line
    ctx = draw();
    ghosts(ctx, PLAN.map(([x, y, z]) => [x + 7, y, z]), CY, 0.5);
    for (const t of [0.3, 0.5, 0.7]) { const p = xAt(c, Math.round((c.n - 1) * t)); const [X, Y] = P(...p); R_(ctx, X - 1, Y - 1, 3, 3, '#eeeae0'); R_(ctx, X, Y - 1, 1, 3, AMB); }
    chipAt(ctx, xAt(c, Math.round((c.n - 1) * 0.5)), 'LINE 7  LIVE  ASK BEFORE CUTTING', AMB, -60, 14);
    chipAt(ctx, [56, 28, 8.5], 'ACK  REPLANNED  0.4% LESS VOLUME', CY, -20, -16);
    o.push(grab());
    return o;
  });
  // ---- foreman: accretion, frame by frame ----
  SC.growth = () => {
    look({ zoom: 3, level: 13, at: [16, 28, 7], sun: 'evening', mist: 0.02 }); power(null);
    const sites = [[8, 24, 6], [10, 24, 6], [12, 24, 6], [8, 26, 6], [14, 24, 6], [10, 26, 6], [16, 24, 6], [12, 26, 6], [9, 24, 9], [11, 24, 9], [18, 24, 6], [14, 26, 6], [13, 24, 9], [16, 26, 6], [20, 24, 6], [10, 26, 9]];
    const o = [], placed = [];
    const commit = ([x, y, z]) => { stackPieces(x, y, z).forEach(p => { if (p.ph === 0 && p.t === T.FRAME) return; if (inb(p.x, p.y, p.z) && !cells[idx(p.x, p.y, p.z)]) { setC(p.x, p.y, p.z, p.t, p.v); } }); for (let dz = 0; dz < 4; dz++) markDirty(z + dz); };
    for (let f = 0; f <= sites.length; f++) {
      if (f > 0) { commit(sites[f - 1]); computeLight(); }
      look({}); const ctx = draw();
      const next = sites.slice(f, f + 3); ghosts(ctx, next, CY, 0.45);
      next.forEach(([x, y, z], k) => drone(ctx, [x + 1 + Math.sin(f + k) * 0.6, y + 1, z + 3.6 + k * 0.3], '#ffd56a', [x + 1, y + 1, z + 6]));
      chip(ctx, 'ACCRETOR 3  ORDER 77  ' + String(Math.min(f, sites.length)).padStart(2, '0') + '/' + sites.length, 6, 6, CY);
      o.push(grab());
    }
    return o;
  };
  // ---- water: a roof cistern feeding a low terrace; head is height ----
  SC.water = () => voidB(() => {
    look({ zoom: 3, level: 13, at: [48, 28, 7], sun: 'morning', mist: 0.015 }); power(null);
    setC(52, 21, 12, T.TANK, 0); markDirty(12); computeLight();
    const top = [52.5, 22.0, 12.4], end = [40.5, 32.0, 4.6];
    makeCable(2, top, end, { slack: 1.08 }); settle(600); look({});
    const ctx = draw();
    for (let z = 5; z <= 12; z++) { const [X, Y] = P(61, 23.5, z); R_(ctx, X, Y, 6, 1, z % 2 ? BLU : 'rgba(111,168,240,0.5)'); }
    chipAt(ctx, [52.5, 21.5, 13.2], 'CISTERN 40 KL', BLU, 6, -10, '#fff');
    chipAt(ctx, end, 'TERRACE TAP  HEAD 8 LV  GOOD', BLU, -60, 12, '#fff');
    chipAt(ctx, [61, 23.5, 12], 'HEAD', BLU, 4, -6, '#fff');
    return grab();
  });
  // ---- daylight: a mirror sends the sun down the void ----
  SC.light = () => {
    look({ zoom: 3, level: 13, at: [16, 28, 6], sun: 'morning', mist: 0.015 }); power(null);
    const ctx = draw(), m = [20, 23.6, 12.6], g = [14, 30.5, 3.2];
    const [MX, MY] = P(...m), [GX, GY] = P(...g);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let w = 6; w >= 1; w -= 1) { ctx.strokeStyle = 'rgba(255,220,140,' + (0.05 + 0.03 * (6 - w)) + ')'; ctx.lineWidth = w * 2; ctx.beginPath(); ctx.moveTo(MX + 120, MY - 200); ctx.lineTo(MX, MY); ctx.lineTo(GX, GY); ctx.stroke(); }
    ctx.fillStyle = 'rgba(255,220,140,0.18)'; ctx.beginPath(); ctx.ellipse(GX, GY, 14, 7, 0, 0, 7); ctx.fill();
    ctx.restore();
    R_(ctx, MX - 3, MY - 1, 7, 2, '#dff4ff'); R_(ctx, MX - 3, MY + 1, 7, 1, '#5d6b73');
    chipAt(ctx, m, 'HELIOSTAT', '#fff1c4', 8, -10);
    chipAt(ctx, g, 'COURT 4  DAYLIGHT 3% TO 28%', '#fff1c4', 10, 10);
    return grab();
  };
  // ---- x-ray: every network reads the structure differently ----
  SC.xray = () => voidB(() => {
    look(Object.assign({}, NIGHT, { zoom: 2, at: [46, 28, 6] })); power(null); line7(); look({});
    const ctx = draw(); dimAll(ctx, 0.55);
    poly3(ctx, [[36, 23.5, 8.5], [60, 23.5, 8.5]], AMB, null, true); poly3(ctx, [[38, 22, 3], [38, 22, 8.5]], AMB, null, true); poly3(ctx, [[56, 22, 3], [56, 22, 8.5]], AMB, null, true);
    poly3(ctx, [[36, 33.5, 6], [43, 33.5, 6]], AMB, [3, 2], true); poly3(ctx, [A_N, [46.5, 28, 5.2], A_S], AMB, null, true);
    poly3(ctx, [[52.5, 21.5, 12.4], [52.5, 21.5, 4], [40.5, 33, 4], [40.5, 33, 3]], BLU, null, true); poly3(ctx, [[30, 21.5, 12], [52.5, 21.5, 12]], BLU, [1, 1], true);
    poly3(ctx, [[36, 25.5, 9], [60, 25.5, 9]], TEAL, [1, 1]); poly3(ctx, [[36, 26.5, 9], [60, 26.5, 9]], TEAL, [1, 1]);
    for (let x = 40; x <= 58; x += 6) for (let z = 3; z <= 10; z += 3) { const [X, Y] = P(x, 28, z); R_(ctx, X, Y, 1, 1, WHT); R_(ctx, X - 1, Y + 1, 1, 1, WHT); R_(ctx, X + 1, Y + 1, 1, 1, WHT); }
    chipAt(ctx, [60, 23.5, 8.5], 'POWER  CONNECTIVITY', AMB, 6, -8);
    chipAt(ctx, [52.5, 21.5, 12.4], 'WATER  HEIGHT', BLU, 6, -10, '#fff');
    chipAt(ctx, [60, 26.5, 9], 'DATA  THE BUILDERS BUS', TEAL, 6, 4);
    chipAt(ctx, [58, 28, 10], 'AIR  THE VOID IS A LUNG', WHT, 6, -6);
    return grab();
  });
  // ---- daemons: every robot is a process you can inspect ----
  SC.daemon = () => voidB(() => {
    look({ zoom: 3, level: 11, at: [48, 28.5, 6.5], sun: 'noon', mist: 0.015 }); power(null);
    const c = makeCable(0, [40.5, 24.0, 8.3], [43.5, 32.0, 4.4], { slack: 1.1, hex: '#9b87e8' }); line7(); look({});
    const ctx = draw();
    ghosts(ctx, [[50, 26, 5], [52, 26, 5]], CY, 0.45);
    const d1 = [51.5, 27, 9.2], d2 = [42, 27.5, 6.6], d3 = [47, 29, 7.4];
    drone(ctx, d1, CY, [49, 25, 11]); drone(ctx, d2, RED, [41, 26, 7.5]); drone(ctx, d3, AMB, [46, 30, 8]);
    chipAt(ctx, d1, 'PID 4411  ACCRETOR 3  BUILD', CY, 6, -10);
    chipAt(ctx, d2, 'PID 5120  JANITOR 9  STRIP UNLABELED', RED, -40, -18, '#fff');
    chipAt(ctx, xAt(c, c.n >> 1), 'NO TAG  REMOVE AT 06:00', RED, -60, 10, '#fff');
    chipAt(ctx, d3, 'PID 7  LINEMAN  YOU', AMB, 8, 8);
    return grab();
  });
  // ---- garden: no pressure, just the view ----
  SC.garden = () => { const o = []; look({ zoom: 3, level: 13, at: [30, 18, 8], sun: 'evening', mist: 0.02 }); power(null); look({}); o.push(grab(draw() && null)); look({ zoom: 2, level: NL - 1, at: [32, 30, 8], sun: 'morning' }); o.push(grab(draw() && null)); return o; };
  SC.cover = () => { const o = []; look({ zoom: 1, level: NL - 1, at: [32, 30, 6], sun: 'night', mist: 0.02 }); power((x, y) => (x >= 34 && y >= 30) ? 0 : (x < 18 && y > 44 ? 0.3 : 1)); look({}); o.push(grab(draw() && null)); return o; };
