// ==========================================================================
// Scripted wire demo for recordings: a visible cursor drives the same wire
// handlers the mouse does. The story: an offshoot of the main trunk stops at
// the lip of a void; we stand two posts in the void, carry the bundle out to
// them, then tie it into the dark bundle already hanging there.
// window.wireDemo() returns a promise.
// ==========================================================================
async function wireDemo() {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const cur = document.createElement('div');
  cur.innerHTML = '<svg width="18" height="22" viewBox="0 0 9 11" shape-rendering="crispEdges"><path d="M0 0h1v1h1v1h1v1h1v1h1v1h1v1h1v1h-3v1h1v2h-2v-2h-1v1h-1z" fill="#f4efe4" stroke="#14110e" stroke-width=".6"/></svg>';
  Object.assign(cur.style, { position: 'absolute', left: 0, top: 0, pointerEvents: 'none', zIndex: 20 });
  $('stage').appendChild(cur);
  const css = (bx, by) => { cur.style.transform = `translate(${bx * S.zoom - 1}px,${by * S.zoom - 1}px)`; };
  WIRES.agentOff = true; AGENT.screen = null; $('agentTag').style.visibility = $('bubble').style.visibility = 'hidden';
  const st = WIRES.stage, V = st.V, xo = st.XO + 0.5;
  setLevel(st.view, { silent: true, snap: true });
  setZoom(4);
  centerOn(xo + 1, V.y0 - 1.5, st.LT);
  await sleep(700);
  const work = workHeight();
  let pos = projIso(xo, V.y0 - 2, work);
  css(pos[0], pos[1]);
  async function moveTo(p, ms, held) {
    const p0 = pos.slice(), n = Math.max(1, Math.round(ms / 16));
    for (let k = 1; k <= n; k++) {
      const t = k / n, e = t < 0.5 ? 2 * t * t : 1 - (2 - 2 * t) * (2 - 2 * t) / 2;
      pos = [lerp(p0[0], p[0], e), lerp(p0[1], p[1], e)]; css(pos[0], pos[1]);
      if (held) wireMove(pos[0], pos[1]); else { WIRES.ptr = pos.slice(); WIRES.hover = pickWire(pos[0], pos[1], 5); }
      await sleep(16);
    }
  }
  const press = () => wireDown(pos[0], pos[1], { shiftKey: false, altKey: false, detail: 1 });
  const release = () => { wireUp(pos[0], pos[1]); WIRES.hover = null; };
  const at = p => { const q = projIso(p[0], p[1], p[2]); return [q[0], q[1]]; };
  // 1. two posts in the void: one straight out, one where the run turns
  setTool('post');
  const P1 = [xo, V.y0 + 3, work], P2 = [xo + 4, V.y0 + 3, work];
  for (const p of [P1, P2]) { await moveTo(at(p), 800, false); press(); release(); await sleep(600); }
  setTool('inspect');
  await sleep(400);
  // 2. carry the head out to the first post, then on to the second
  const head = st.head, posts = WIRES.posts.slice(-2);
  for (const post of posts) {
    await moveTo(at(tieCenter(head)), 800, false);
    await sleep(250); press();
    await moveTo(at([post.x, post.y, post.z1 + 0.8]), 1700, true);
    await moveTo(at(postTop(post)), 600, true);
    await sleep(600); release(); await sleep(1500);
  }
  // 3. tie the new run into the dark bundle below it, twice
  setTool('tie');
  const dark = WIRES.cables.filter(c => c.hex);
  for (const f of [0.35, 0.7]) {
    const p = [lerp(posts[0].x, posts[1].x, f), lerp(posts[0].y, posts[1].y, f), work];
    const dc = [0, 0, 0];
    for (const c of dark) { const q = xAt(c, nearestIdx(c, [p[0], p[1], c.X[Math.floor(c.n / 2) * 3 + 2]])); for (let k = 0; k < 3; k++) dc[k] += q[k] / dark.length; }
    const a = at([p[0], p[1], p[2] + 0.3]), b = at(dc);
    await moveTo([a[0] + 5, a[1] - 8], 700, false);
    WIRES.stroke = { x0: pos[0], y0: pos[1], x1: pos[0], y1: pos[1] };
    await moveTo([b[0] - 5, b[1] + 8], 900, true);
    release(); await sleep(2200);
  }
  await sleep(1500);
  cur.remove(); WIRES.agentOff = false; $('agentTag').style.visibility = $('bubble').style.visibility = '';
}
window.wireDemo = wireDemo;
