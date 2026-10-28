// ui.js - projection + annotation helpers shared by the mock-ups.
// Overlays are placed from world coordinates with the exact camera of each render (data.js, written by
// render/composite.py), so ghosts, cursors, leaders and outlines land on the geometry they describe.
(function () {
  const CELL = 4.0, LH = 3.5;
  const NS = 'http://www.w3.org/2000/svg';

  // grid cells / levels -> metres
  function W(x, y, lv) { return [x * CELL, y * CELL, lv * LH]; }

  // camera from a cam json; ox/oy/s map render pixels to page pixels (image offset + scale)
  function Cam(name, ox = 0, oy = 0, s = 1) {
    const c = window.CAMS[name];
    if (!c) throw new Error('no camera ' + name);
    const rx = c.res[0], ry = c.res[1], ppm = rx / c.scale;
    const d = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    return {
      c, ppm: ppm * s,
      p(pt) { return [ox + (rx / 2 + (d(pt, c.right) - c.cx) * ppm) * s, oy + (ry / 2 - (d(pt, c.up) - c.cy) * ppm) * s]; },
      g(x, y, lv) { return this.p(W(x, y, lv)); },
    };
  }

  function hull(pts) {
    const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
    for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
    up.pop(); lo.pop();
    return lo.concat(up);
  }

  // 8 projected corners of a box given in cells/levels
  function boxPts(cam, x0, y0, l0, x1, y1, l1) {
    const out = [];
    for (const x of [x0, x1]) for (const y of [y0, y1]) for (const l of [l0, l1]) out.push(cam.g(x, y, l));
    return out;
  }
  const poly = (pts) => 'M' + pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('L') + 'Z';
  function boxHull(cam, ...b) { return poly(hull(boxPts(cam, ...b))); }
  // visible edges of a box seen from the standard camera (+x,-y,+z side): 9 silhouette+front edges
  function boxEdges(cam, x0, y0, l0, x1, y1, l1) {
    const P = (x, y, l) => cam.g(x, y, l);
    const e = [
      [P(x0, y0, l1), P(x1, y0, l1)], [P(x1, y0, l1), P(x1, y1, l1)], [P(x1, y1, l1), P(x0, y1, l1)], [P(x0, y1, l1), P(x0, y0, l1)],
      [P(x0, y0, l0), P(x1, y0, l0)], [P(x1, y0, l0), P(x1, y1, l0)],
      [P(x0, y0, l0), P(x0, y0, l1)], [P(x1, y0, l0), P(x1, y0, l1)], [P(x1, y1, l0), P(x1, y1, l1)],
    ];
    return e.map(([a, b]) => 'M' + a[0].toFixed(1) + ',' + a[1].toFixed(1) + 'L' + b[0].toFixed(1) + ',' + b[1].toFixed(1)).join('');
  }

  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs || {}) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function text(parent, x, y, str, attrs) { const t = el('text', Object.assign({ x, y }, attrs || {}), parent); t.textContent = str; return t; }

  // revision cloud around a polygon (points in page px): scallops of radius ~r bulging outward
  function cloud(pts, r) {
    let area = 0;
    for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; area += a[0] * b[1] - b[0] * a[1]; }
    const sweep = area > 0 ? 1 : 0;
    let d = 'M' + pts[0][0].toFixed(1) + ',' + pts[0][1].toFixed(1);
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n = Math.max(1, Math.round(L / (1.6 * r)));
      for (let k = 1; k <= n; k++) {
        const x = a[0] + (b[0] - a[0]) * k / n, y = a[1] + (b[1] - a[1]) * k / n;
        const rr = (L / n) * 0.62;
        d += `A${rr.toFixed(1)},${rr.toFixed(1)} 0 0 ${sweep} ${x.toFixed(1)},${y.toFixed(1)}`;
      }
    }
    return d + 'Z';
  }
  // grow a convex polygon outward by m px (approximate offset along vertex bisectors)
  function grow(pts, m) {
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    return pts.map(p => { const dx = p[0] - cx, dy = p[1] - cy, L = Math.hypot(dx, dy) || 1; return [p[0] + dx / L * m, p[1] + dy / L * m]; });
  }

  // leader: polyline from a target point through elbows; dot (or tick) at the target
  function leader(parent, pts, o = {}) {
    const g = el('g', {}, parent);
    el('polyline', { points: pts.map(p => p.join(',')).join(' '), fill: 'none', stroke: o.stroke || '#eeebe4', 'stroke-width': o.w || 1.5,
      'stroke-dasharray': o.dash || '' }, g);
    if (o.dot !== false) el('circle', { cx: pts[0][0], cy: pts[0][1], r: o.r || 4, fill: o.dotFill || (o.stroke || '#eeebe4'),
      stroke: o.dotStroke || 'none', 'stroke-width': 1.5 }, g);
    return g;
  }

  // position an HTML element (by id) at page px, anchor 'tl' | 'bl' | 'c' | 'bc' | 'tc' | 'r' | 'l'
  function place(id, x, y, anchor = 'tl') {
    const e = typeof id === 'string' ? document.getElementById(id) : id;
    e.style.position = 'absolute';
    e.style.left = x + 'px'; e.style.top = y + 'px';
    const T = { tl: '', bl: 'translate(0,-100%)', c: 'translate(-50%,-50%)', bc: 'translate(-50%,-100%)', tc: 'translate(-50%,0)',
      r: 'translate(-100%,-50%)', l: 'translate(0,-50%)', br: 'translate(-100%,-100%)', tr: 'translate(-100%,0)' };
    e.style.transform = T[anchor] || '';
    return e;
  }

  // Claude-style agent cursor (arrow + name flag) as SVG, tip at (x, y)
  function agentCursor(parent, x, y, name, sub, o = {}) {
    const g = el('g', { transform: `translate(${x},${y})` }, parent);
    const col = o.color || '#ffe13a';
    el('path', { d: 'M0,0 L0,30 L8,23 L13.5,35 L19,32.5 L13.8,21 L24,20 Z', fill: col, stroke: '#111214', 'stroke-width': 2, 'stroke-linejoin': 'round' }, g);
    const fg = el('g', { transform: 'translate(22,30)' }, g);
    const w = o.w || (name.length * 9.5 + 22);
    el('rect', { x: 0, y: 0, width: w, height: 24, fill: col }, fg);
    text(fg, 8, 17, name, { 'font-family': 'Barlow Condensed', 'font-weight': 700, 'font-size': 15, 'letter-spacing': '1.2', fill: '#111214' });
    if (sub) {
      const sw = o.sw || (sub.length * 7.2 + 16);
      el('rect', { x: 0, y: 24, width: sw, height: 21, fill: '#111214', stroke: col, 'stroke-width': 1 }, fg);
      text(fg, 8, 39, sub, { 'font-family': 'Barlow Semi Condensed', 'font-size': 13.5, fill: '#eeebe4' });
    }
    return g;
  }

  // player cursor (plain white arrow)
  function playerCursor(parent, x, y) {
    const g = el('g', { transform: `translate(${x},${y})` }, parent);
    el('path', { d: 'M0,0 L0,28 L7.5,21.5 L12.5,32.5 L17.5,30.3 L12.7,19.6 L22,18.8 Z', fill: '#ffffff', stroke: '#111214', 'stroke-width': 1.8, 'stroke-linejoin': 'round' }, g);
    return g;
  }

  // grid bubble (architectural column-grid marker)
  function bubble(parent, x, y, label, o = {}) {
    const g = el('g', {}, parent);
    el('circle', { cx: x, cy: y, r: o.r || 15, fill: o.fill || 'rgba(17,18,20,0.85)', stroke: o.stroke || '#eeebe4', 'stroke-width': 1.5 }, g);
    text(g, x, y + 5.5, label, { 'text-anchor': 'middle', 'font-family': 'Barlow Condensed', 'font-weight': 600, 'font-size': o.fs || 16, fill: o.color || '#eeebe4' });
    return g;
  }

  // level datum symbol: filled/hollow triangle on a line + text
  function datum(parent, x, y, label, sub, o = {}) {
    const g = el('g', {}, parent);
    const col = o.color || '#eeebe4';
    const L = o.len || 90;
    el('line', { x1: x - (o.left ? L : 0), y1: y, x2: x + (o.left ? 0 : L), y2: y, stroke: col, 'stroke-width': 1.2 }, g);
    el('path', { d: `M${x - 7},${y - 12} L${x + 7},${y - 12} L${x},${y} Z`, fill: o.fill || col, stroke: col, 'stroke-width': 1 }, g);
    const tx = x + (o.left ? -L : 12);
    text(g, tx, y - 5, label, { 'font-family': 'Barlow Condensed', 'font-weight': 600, 'font-size': o.fs || 15, fill: col, 'letter-spacing': '0.6' });
    if (sub) text(g, tx, y + 14, sub, { 'font-family': 'IBM Plex Mono', 'font-size': 11.5, fill: o.subColor || col, opacity: 0.85 });
    return g;
  }

  window.UI = { CELL, LH, W, Cam, hull, boxPts, boxHull, boxEdges, poly, el, text, cloud, grow, leader, place, agentCursor, playerCursor, bubble, datum };
})();
