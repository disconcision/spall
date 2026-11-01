// ==========================================================================
// The band, round two: carts (a quoted program folded into a cartridge whose
// teeth are its type), braids (who answers what), and the catalog: every
// piece of the band with a code to talk about it by, a switch, a live
// sample, and a note on where it might go from flavour to play.
// ==========================================================================

// ---------- carts (P6): a quote folds into a cartridge, rides a rail, seats in a slot if the teeth match ----------
// 20x11 body and 2 px of teeth; violet corner brackets (a quote, like a hole); a paper label; one tooth per input, by role
function bnCart(g, x, y, lab, ins) {
  x = Math.round(x); y = Math.round(y);
  R_(g, x + 1, y, 18, 11, '#0b0c0e'); R_(g, x, y + 1, 20, 9, '#0b0c0e'); R_(g, x + 1, y + 1, 18, 9, '#50545b');
  R_(g, x + 1, y + 1, 18, 1, '#777c84'); R_(g, x + 1, y + 1, 1, 9, '#686d75'); R_(g, x + 1, y + 9, 18, 1, '#34373c');
  R_(g, x + 15, y + 3, 1, 5, '#2c2f33'); R_(g, x + 17, y + 3, 1, 5, '#2c2f33');
  R_(g, x + 3, y + 2, 11, 7, '#dcd5c3'); R_(g, x + 3, y + 8, 11, 1, '#a69f8c');
  const lw = lab.reduce((a, t) => a + bnTokW(t) + 1, -1); let lx = x + 3 + ((11 - lw) >> 1);
  for (const t of lab) lx += bnTok(g, t, lx, y + 3, bnIsG(t) ? mixHex(BROLE[BNG[t][0]], '#000000', 0.45) : '#3b3630') + 1;
  for (const [cx, cy, dx, dy] of [[x, y, 1, 1], [x + 19, y, -1, 1], [x, y + 10, 1, -1], [x + 19, y + 10, -1, -1]]) { R_(g, cx, cy, 1, 1, BROLE.H); R_(g, cx + dx, cy, 1, 1, BROLE.H); R_(g, cx, cy + dy, 1, 1, BROLE.H); }
  ins.forEach((rl, k) => { R_(g, x + 3 + k * 4, y + 11, 2, 2, BROLE[rl]); R_(g, x + 3 + k * 4, y + 12, 2, 1, mixHex(BROLE[rl], '#000000', 0.4)); });
}
// a socket: holes where the teeth go, lit once something seats
function bnSlot(g, x, y, ins, lit) {
  R_(g, x - 1, y - 1, 22, 1, '#3a3c41'); R_(g, x - 1, y, 22, 2, '#0b0c0e');
  ins.forEach((rl, k) => R_(g, x + 3 + k * 4, y, 2, 2, lit ? BROLE[rl] : mixHex(BROLE[rl], '#141517', 0.65)));
}
const bnEase = v => v < 0.5 ? 2 * v * v : 1 - 2 * (1 - v) * (1 - v);
// a hand-off on one line: quoted, folded, along the rail to the other bot's slot; it seats or it won't
function fCart(lab, ins, sins) {
  const fits = sins.length === ins.length && sins.every((r, k) => r === ins[k]), lw = lab.reduce((a, t) => a + bnTokW(t) + 1, -1);
  return { kind: 'cart', liveFor: 4.4, units: () => 1, fits,
    fit(rec) { return { inline: true, h: 15, draw: (g, x, y) => {
      const t = BAND.t - rec.t0 - (rec.rev ? rec.rev.end : 0), xs = rec.W - 23;
      for (let k = x + 22; k < xs - 2; k += 2) R_(g, k, y + 13, 1, 1, '#3a3c41');
      bnSlot(g, xs, y + 13, sins, fits && t >= 2.4);
      if (t < 0.6) {   // the quote: violet brackets close in on the words
        const f = Math.round(clamp(t / 0.5, 0, 1) * 3), a = x + f, b = x + lw + 10 - f;
        let lx = x + 5; for (const tk of lab) lx += bnTok(g, tk, lx, y + 3) + 1;
        for (const bx of [a, b]) R_(g, bx, y + 1, 1, 9, BROLE.H);
        R_(g, a, y + 1, 2, 1, BROLE.H); R_(g, a, y + 9, 2, 1, BROLE.H); R_(g, b - 1, y + 1, 2, 1, BROLE.H); R_(g, b - 1, y + 9, 2, 1, BROLE.H);
      } else if (t < 1) {   // folds into a cart
        bnCart(g, x, y, lab, ins); const keep = (t - 0.6) / 0.4;
        for (let yy = 0; yy < 13; yy++) for (let xx = 0; xx < 20; xx++) if (((xx * 7 + yy * 13) % 16) / 16 >= keep) g.clearRect(x + xx, y + yy, 1, 1);
      } else if (t < 2.4) {   // rides the rail
        const cx = x + bnEase((t - 1) / 1.4) * (xs - x);
        for (let k = 1; k <= 3; k++) R_(g, Math.round(cx) - k * 4, y + 11, 2, 2, mixHex(BROLE.V, '#141517', 0.3 + k * 0.18));
        bnCart(g, cx, y, lab, ins);
      } else if (fits) {   // seats: a spark at each end of the slot, then still
        bnCart(g, xs, y + 1, lab, ins);
        if (t < 2.75) { R_(g, xs, y + 12, 1, 1, '#fffbf2'); R_(g, xs + 19, y + 12, 1, 1, '#fffbf2'); }
      } else {   // the teeth are wrong: it rattles at the slot, then backs off under a cross
        const sh = t < 3 ? (Math.floor(t * 20) & 1 ? 1 : -1) : 0, back = t > 3 ? Math.min(9, (t - 3) * 22) : 0;
        bnCart(g, xs + sh - back, y, lab, ins);
        if (t > 2.6) bnGlyph(g, '✗', xs - back - 8, y + 3, BROLE.X);
      }
    } }; } };
}
// a bot's shelf: the programs it keeps, as things; one may be a gift
function fShelf(carts) {
  return { kind: 'shelf', units: () => carts.length,
    fit(rec) { return { inline: true, h: 14, draw: (g, x, y) => {
      const [k] = bnK(rec); R_(g, x, y + 13, Math.min(carts.length, k) * 23 - 2, 1, '#2c2e32');
      carts.forEach(([lab, ins], i) => { if (i < k) bnCart(g, x + i * 23, y, lab, ins); });
    } }; } };
}
const BCARTS = [[['≡'], ['V', 'V'], ['TIE', '≡', { slot: '×6' }]], [['⌣'], ['V', 'V'], ['DRAPE', { slot: '3M' }]], [['✶', '✶'], ['V'], ['WELD', '▦']], [['⊓'], ['V', 'M'], ['LIFT', '▦', { slot: '2' }]], [['◎'], ['V'], ['LOOK', '◎']]];
function* bnThCart() {
  const a = bnOf(bnPick(['tie', 'fore', 'spin'])), b = bnFriend(a);
  if (bnChance(0.25)) {   // showing the shelf
    const pick = BCARTS.slice().sort(() => bnR() - 0.5).slice(0, 3).map(c => [c[0], c[1]]);
    if (bnChance(0.5)) pick.push([['♥'], []]);
    yield { by: b, form: fShelf(pick) };
    if (bnChance(0.5)) yield { by: a, to: b, form: fPid(bnIdio(a, bnPick([['◎', '♥'], ['?', '♥'], ['⇢', '@', '?']]))) };
    return;
  }
  const [lab, ins, blk] = bnPick(BCARTS), fits = bnChance(0.78);
  const sins = fits ? ins : bnPick([['M'], ['V'], ['D', 'V'], ['V', 'V', 'V']].filter(s => s.join() !== ins.join()));
  yield { by: a, to: b, form: fCart(lab, ins, sins) };
  yield { wait: 2.6 };
  if (fits) {   // seated, it unfolds into the block it was, and runs
    yield { by: b, form: fBlocks([{ type: 'stack', col: BKC.act, label: blk }], 'type'), run: { t0: BAND.t + 0.4, per: 0.9, fail: -1 } };
    if (bnChance(0.4)) yield { by: b, to: a, form: fPid(bnIdio(b, ['✓', lab[0], '♥'])) };
  } else {
    yield { by: b, to: a, form: fPid(bnIdio(b, ['✗', ...lab, '?'])) };
    yield { by: a, form: fPid(bnIdio(a, bnPick([['☹'], ['↻'], ['⧗', '⇄']]))) };
  }
}

// ---------- braids (L7): call and response, arcs joining the words that answer each other ----------
function fBraid(rows) {
  const RH = 12, pos = rows.map(([, toks], i) => { let x = 10; return toks.map(t => { const p = [x, i * RH]; x += bnTokW(t) + 5; return p; }); });
  const curves = [];
  for (let i = 1; i < rows.length; i++) rows[i][1].forEach((t, j) => {
    const k = rows[i - 1][1].findIndex(u => u === t && bnIsG(u)); if (k < 0) return;
    const x0 = pos[i - 1][k][0] + 2, y0 = pos[i - 1][k][1] + 6, x1 = pos[i][j][0] + 2, y1 = pos[i][j][1] - 1, ym = (y0 + y1) / 2, pts = [];
    for (let n = 0; n <= 24; n++) {
      const s = n / 24, u = 1 - s, p = [Math.round(u * u * u * x0 + 3 * u * u * s * x0 + 3 * u * s * s * x1 + s * s * s * x1), Math.round(u * u * u * y0 + 3 * u * u * s * ym + 3 * u * s * s * ym + s * s * s * y1)];
      if (!pts.length || pts[pts.length - 1][0] !== p[0] || pts[pts.length - 1][1] !== p[1]) pts.push(p);
    }
    curves.push({ row: i, pts, col: BROLE[BNG[t][0]] });
  });
  return { kind: 'braid', liveFor: 7, units: () => rows.length,
    fit(rec) { return { h: rows.length * RH - 6, draw: (g, x, y) => {
      const [k] = bnK(rec), t = BAND.t - rec.t0;
      rows.forEach(([b, toks], i) => { if (i >= k) return; bnSprite(g, b.mini, x, y + i * RH - 1, b.pal); toks.forEach((tk, j) => bnTok(g, tk, x + pos[i][j][0], y + pos[i][j][1])); });
      curves.forEach((cv, n) => {
        if (cv.row >= k) return;
        for (const [px, py] of cv.pts) R_(g, x + px, y + py, 1, 1, mixHex(cv.col, '#141517', 0.4));
        const ph = ((t * 0.5 - n * 0.25) % 1 + 1) % 1;   // the answer runs down each arc in turn
        if (BAND.t < rec.liveTo && ph < 0.6) { const p = cv.pts[Math.floor(ph / 0.6 * (cv.pts.length - 1))]; R_(g, x + p[0], y + p[1], 1, 1, '#fffbf2'); }
      });
    } }; } };
}
function bnBraidRows() {
  const f = bnOf('fore'), o = bnPick(['▦', '∿', '◇', '≡']), act = { '▦': '✶', '∿': '⌣', '◇': '✶', '≡': '≡' }[o], a = bnTalker(), b = bnFriend(a);
  return [[f, ['▢', o, bnLv(f), '?']], [a, ['@', act, o, bnPick(['✓', '⧗'])]], [b, ['@', o, '⇢', act, bnPick(['◇', '✓', '?'])]]];
}
function* bnThBraid() { const rows = bnBraidRows(); yield { by: rows[0][0], form: fBraid(rows), sal: 0.5 }; }

// ---------- the catalog ----------
// [code, name, what it is, where it could go, now: 'flavour' (made up) | 'world' (reads the city), sample(), fixed (no switch)]
const bnB = k => bnOf(k);
const bnBlk = (b, extra) => { const F = fBlocks([{ type: 'hat', col: BKC.ev, label: ['WHEN', '⚡'] }, ...extra, { type: 'cap', col: BKC.stk, label: ['DOCK', '⌂'] }], 'type'); return F; };
const bnHoles = () => { const h = k => ({ hole: true, label: 'ABCDEFGH'[(BAND.holeN = (BAND.holeN || 0) + 1) % 8], kind: k }); const a = h('spin'), b = h('tie'); const tree = [['PLAN', 'L9'], '\n', ['SPAN', '∿', a, 'TO', '⊥'], '\n', ['TIE', b]]; return { F: fRocks(tree, [a, b]), a, b }; };
const BCAT = [
  ['Language', 'how the bots talk', [
    ['L1', 'Pidgin', 'Glyph strings, typed out a glyph at a time. Each bot has its own word order, a tic, a habit of doubling.', 'Learnable: a glyph you have met enough times glosses itself. Reading the band is a skill you grow into.', 'flavour', () => ({ by: bnB('tie'), form: fPid(['@', '≡', '∿', 'L7', '3/6']) }), true],
    ['L2', 'Gloss', 'Click a line: the words under the glyphs, its time, who and which thread. Off, on click, or always.', 'The gloss could be earned (see L1); unknown glyphs stay blank.', 'flavour', () => ({ by: bnB('haul'), form: fPid(['∿', '⊓', '→', 'L9', '♥']), gloss: true }), true],
    ['L3', 'Tone', 'Stress lifts a word and underlines it; an aside shrinks to 3×3; unsure wobbles.', 'Tone as urgency: stressed requests sort higher in the work queue.', 'flavour', () => ({ by: bnB('mote'), form: fPid(['@', { t: '≡', tone: 'stress' }, '∿', { t: '?', tone: 'unsure' }, { t: '♥', tone: 'aside' }]) })],
    ['L4', 'Moving glyphs', 'While a line is fresh some glyphs move: the again-arrow turns, birds flap, the hourglass drains, the eye looks about.', 'Motion as freshness: what still moves is still true.', 'flavour', () => ({ by: bnB('eye'), form: fPid(['↻', 'ᵕ', '⧗', '◍', '◎', '♪', '⚡']), anim: true })],
    ['L5', 'Worn pairs', 'Pairs said often enough fuse into one 7×5 glyph: tied-cable, welded-girder, carry, bundle…', 'Ligatures as the crew\'s jargon: new ones appear for the things your city does most.', 'flavour', () => ({ by: bnB('tie'), form: fPid([{ lig: '∿≡' }, '⍥', '6', { lig: '⊓→' }, { lig: '▦✶' }, { lig: '≡≡' }]) })],
    ['L6', 'Stack strip', 'Read as a concatenative language: what each word leaves on the stack, under the line.', 'A hauler\'s stack is its load. The strip could be its real inventory.', 'flavour', () => ({ by: bnB('haul'), form: fPid(['12', '∿', '⊓', ':', 'L9', '→', '⇄', '◌', '✓'], null, false, true) })],
    ['L7', 'Braid', 'Call and response in one message: arcs join the words that answer each other.', 'Shows who is coordinating with whom: a braid is a crew forming.', 'flavour', () => { const rows = bnBraidRows(); return { by: rows[0][0], form: fBraid(rows) }; }],
    ['L8', 'Proof trees', 'Pidgin set as a derivation: premises over a line, the rule\'s name beside it.', 'A bot justifying a decision; a broken step is where it went wrong.', 'flavour', () => { const b = bnB('fore'); return { by: b, form: bnDeriv(b, ['∿', '⊢', '≡']) || fPid(['∿', '⊢', '≡']) }; }],
    ['L9', 'Parse trees', 'The sentence typed, then parsed upward bracket by bracket.', '—', 'flavour', () => ({ by: bnB('spin'), form: fTree(['@', '⌣', '∿', 'L7', '✓']) })],
    ['L10', 'Welded giants', 'The Builder\'s words: huge glyphs welded on row by row, the newest row glowing.', 'Kept rare, and kept for what is very large.', 'flavour', () => { const F = fDeep(['Ω', '↑', '⬚']); F.n = 3; return { by: bnB('deep'), form: F, loop: 4 }; }]
  ]],
  ['Programs', 'what they run', [
    ['P1', 'Routines', 'Scratch-like blocks, built block by block, then run: a counter on the current block, done blocks dimmed.', 'Routines could be the real behaviour of crews; you read them to see why a bot does what it does.', 'flavour', () => { const b = bnB('tie'); return { by: b, form: bnBlk(b, [{ type: 'stack', col: BKC.act, label: ['TIE', { slot: '4' }] }, { type: 'stack', col: BKC.rel, label: ['SEND', '⇢', { slot: 'F-2' }] }]), run: { t0: BAND.t + 0.8, per: 0.7, fail: -1 } }; }],
    ['P2', 'Probes', 'At the right edge of each block: an inscrutable type mark, the stack before and after, or a live meter.', 'Teeth and probes are the same type: a probe that doesn\'t match its slot is a bug you can see.', 'flavour', () => { const b = bnB('weld'); return { by: b, form: bnBlk(b, [{ type: 'stack', col: BKC.act, label: ['HEAT', { slot: '900' }] }, { type: 'stack', col: BKC.act, label: ['WELD', '▦'] }]), run: { t0: BAND.t + 0.8, per: 0.8, fail: -1 } }; }],
    ['P3', 'Projectors', 'Live views inside blocks (after livelits): the drape settling, ties counted on, the tension gauge.', 'Projectors could read the real cable the routine is working on.', 'flavour', () => { const b = bnB('spin'); return { by: b, form: bnBlk(b, [{ type: 'stack', col: BKC.act, label: ['DRAPE', { slot: '3M' }, { proj: 'cable', w: 20 }] }, { type: 'stack', col: BKC.act, label: ['TIE', 'EVERY', { slot: '4' }, { proj: 'dots', w: 25 }] }]), run: { t0: BAND.t + 1, per: 1.1, fail: -1 } }; }],
    ['P4', 'Cracks', 'A run that fails cracks the block through, knocks a chip off it, flies a red flag, and leaves the rest askew.', 'A crack is a real fault: the flag goes to it, and fixing it in the world mends the block.', 'flavour', () => { const b = bnB('tie'); return { by: b, form: bnBlk(b, [{ type: 'stack', col: BKC.act, label: ['GRIP', '∿'] }, { type: 'stack', col: BKC.act, label: ['TIE', { slot: '6' }] }, { type: 'stack', col: BKC.act, label: ['SLIDE', '≡'] }]), run: { t0: BAND.t + 0.8, per: 0.6, fail: 2 } }; }],
    ['P5', 'Pidgin in slots', 'Blocks whose slots hold pidgin: SAY, IF over glyphs.', '—', 'flavour', () => { const b = bnB('eye'); return { by: b, form: bnBlk(b, [{ type: 'stack', col: BKC.rel, label: ['SAY', { say: ['ᵕ', '◎', '♥'] }] }]) }; }],
    ['P6', 'Carts', 'A quoted program folds into a cartridge whose teeth are its type. It rides to another bot and seats if the teeth fit, then unfolds and runs. Bots keep shelves of them.', 'Programs as things: your captured patterns become carts you hand to crews; wrong teeth won\'t seat.', 'flavour', () => { const [lab, ins] = BCARTS[0]; return { by: bnB('tie'), to: bnB('weld'), form: fCart(lab, ins, bnChance(0.7) ? ins : ['M']) }; }]
  ]],
  ['Plans', 'hand-offs with holes', [
    ['H1', 'Plans', 'Ragged nested blocks (rocks) with holes a foreman hands out; crews claim holes and a bar fills under each.', 'Holes as real open jobs: claiming one assigns a crew.', 'flavour', () => { const P = bnHoles(); return { by: bnB('fore'), form: P.F, tick: (_, t) => { if (t > 1.2 && !P.a.by) { P.a.by = bnB('spin'); P.a.t0 = BAND.t; P.a.t1 = BAND.t + 4; } } }; }],
    ['H3', 'Fill and grow', 'A filled hole is replaced by what filled it, marked in amber for a moment. That\'s why plans get bigger.', 'The plan becomes the record of who decided what.', 'flavour', () => { const P = bnHoles(); return { by: bnB('fore'), form: P.F, tick: (rec, t) => { if (t > 1.5 && !P.a.done) { P.a.done = true; P.a.by = bnB('spin'); const G = bnRegrow(rec.form, P.a); if (G) rec.form = G; } } }; }],
    ['H4', 'Climbs to you', 'A hole nobody can fill turns red, then cyan, and climbs to you.', 'The core hand-off: a decision only you can make, made by acting in the world, not in a dialog.', 'flavour', () => { const P = bnHoles(); return { by: bnB('fore'), form: P.F, tick: (_, t) => { P.b.no = t > 1 && t < 2.6; P.b.up = t >= 2.6; } }; }],
    ['H5', 'Ladder', 'Where a hole went: from the crew that couldn\'t, past the foreman and claude, to you.', '—', 'flavour', () => ({ by: bnB('fore'), form: fLadder([bnB('tie'), bnB('fore')], { label: 'C' }), loop: 4.5 })],
    ['H6', 'Plan trim', 'Rivets on the outer rock, registration ticks at the corners, a serial on the name line.', '—', 'flavour', () => ({ by: bnB('fore'), form: bnHoles().F })]
  ]],
  ['Wires', 'patches drawn as cables', [
    ['W1', 'Patches', 'Max/Pd-style patches drawn as the city\'s own cables, sagging, tied where they pass close.', 'Patches could be the real wiring of a system you built.', 'flavour', () => ({ by: bnB('spin'), form: fPatch(bnInt(1, 1e6), 0) })],
    ['W2', 'Arrival lamps', 'Signals run along the wires; a node\'s lamp lights when one arrives.', '—', 'flavour', () => ({ by: bnB('spin'), form: fPatch(bnInt(1, 1e6), 0) })],
    ['W3', 'Merges', 'A reply is the same patch with a change: the new part and its wire in amber.', 'Diffs between bots\' programs: who changed what.', 'flavour', () => ({ by: bnB('spin'), form: fPatch(77, 1) })],
    ['W4', 'Feedback ring', 'A wire from the sink back under everything to an operator.', '—', 'flavour', () => ({ by: bnB('tie'), form: fPatch(bnInt(1, 1e6), 0, { ring: true }) })],
    ['W5', 'Interlock', 'A bird lands on a wire; the operator before it holds, and everything after it stops until the bird goes.', 'Birds on cables really pause work.', 'flavour', () => ({ by: bnB('tie'), form: fPatch(bnInt(1, 1e6), 0, { bird: true }) })]
  ]],
  ['Routes and windows', 'where things go, and watching them', [
    ['R1', 'Route grids', 'Befunge-style grids that motes walk as instruction pointers.', 'Could be real drone pathing, shown as program.', 'flavour', () => ({ by: bnB('eye'), form: fRoute(bnInt(1, 1e6)) })],
    ['V1', 'Follow windows', 'Transport Tycoon windows: a live picture of a bot, drone, bird or pod, tuned in through static. Click to go there.', 'Attention as a resource: pin the windows that matter.', 'world', () => { const b = BAND.crew.find(c => c.body); return { by: bnB('eye'), form: Object.assign(fWin(b ? { bot: b, label: b.name, col: b.col } : { at: [24, 24, 6], label: '?' }), { note: '◎' }) }; }],
    ['V2', 'Half windows', 'Half the width, with the poster\'s remark beside it.', '—', 'world', () => { const b = BAND.crew.filter(c => c.body)[1]; return { by: bnB('eye'), form: Object.assign(fWin(b ? { bot: b, label: b.name, col: b.col } : { at: [24, 24, 6], label: '?' }, ['◎', '≡', '✓']), { note: '♥' }) }; }],
    ['V3', 'Shaded when dead', 'A window that lost its signal folds to its title bar; click it open where it is.', '—', 'world', () => { const F = fWin({ at: [24, 24, 6], label: 'TIE·9' }); F.stale = true; F.staleT = BAND.t - 9; return { by: bnB('eye'), form: F }; }]
  ]],
  ['Voices and world', 'who else is on the band', [
    ['X1', 'Processes', 'GC, SCHED, BAKE, ROUTE.D, TIEWATCH, PRUNE, CLOCK: terse lines, sometimes a stack.', 'TIEWATCH and SCHED already read real counts and could report real queues.', 'world', () => { const p = BAND.crew.find(b => b.name === 'TIEWATCH'); return { by: p, form: fPid(BPROCSAY.TIEWATCH(), '#8f897d') }; }],
    ['X2', 'Residents', 'People, rarely, in plain words.', 'Complaints map to real conditions (dark levels, late pods): needs you can see.', 'flavour', () => ({ by: bnB('folk'), form: fFolk('anyone know what the violet boxes mean') })],
    ['X3', 'Alarms', 'A shout, every glyph doubled; a welder answers; an eye may open a window on it.', 'Alarms for real faults: a cable sagging into a walkway, a tie that slipped.', 'flavour', () => ({ by: bnB('tie'), form: fPid(['‼', '⌣', '∿', 'L7'], null, true) })],
    ['X4', 'The Builder', 'Every few minutes the band hushes, something very large under the city speaks, and an eye shows static.', 'A rare world event that changes something real.', 'flavour', () => ({ by: bnB('eye'), form: Object.assign(fWin({ deep: true, at: [32, 32, 0], label: '??', col: '#a08a5c' }), { note: 'Ω' }) })],
    ['X5', 'World news', 'The band reacts to the time of day, your cables and ties, and claude\'s proposals, builds and finishes.', 'Already wired to the world; the start of the band as a sensor.', 'world', () => ({ by: bnB('mote'), form: fPid(['∿', '⊕', String(WIRES.cables.length)]) })],
    ['X6', 'Bodies', 'Tie-bots crawl the real cables, spinners and eyes fly, motes swarm, haulers walk; each message pulses a data wire.', 'Bodies are where gameplay would land: the bot that says it is tying is tying.', 'world', () => { const b = BAND.crew.find(c => c.k === 'tie' && c.body); return { by: bnB('eye'), form: Object.assign(fWin(b ? { bot: b, label: b.name, col: b.col } : { at: [24, 24, 6], label: '?' }), { note: '≡' }) }; }],
    ['X7', 'Off-task', 'Inner life: birds, the light, music, the Builder, each other.', 'Mood as a readout of the city\'s health.', 'flavour', () => ({ by: bnB('spin'), form: fPid(['ᵕ', '◎', '♥']) })]
  ]]
];
const BCAT_PLAY = [
  ['Holes are the hand-off', 'H1–H5', 'A hole that climbs to you is a real decision, made by doing the thing in the world (lay the gauge, pick the route), not by answering a dialog. Unfilled holes stall a real job.'],
  ['Cracks are faults', 'P4 X3', 'A failed routine points at a real failure (a sagging cable, a bird on a tie). The flag takes you there; fixing it mends the block and the crew re-runs.'],
  ['Carts are programs you own', 'P6 P2', 'Captured patterns become carts; the teeth say what they need. You hand carts to crews; wrong teeth won\'t seat.'],
  ['Reading is the skill', 'L1 L2', 'Glosses unlock as you meet glyphs. The band starts as noise and becomes legible: the zine\'s "legibility is the core skill".']
];
const BX6 = 'X6';
const bnCatOn = code => code === BX6 ? BAND.cfg.bodies : bnOn(code);
function bnCatSet(code, on) {
  if (code === BX6) BAND.cfg.bodies = on;
  else if (on) delete BAND.cfg.feat[code]; else BAND.cfg.feat[code] = false;
  bandSave();
}
const BCATS = { el: null, cards: [], timer: 0 };
function bnCatSample(card) {
  const v = card.fn(); if (!v || !v.form) return;
  const rec = bnMakeRec(v, { id: 900 + card.i, u: 0 }, true);
  if (v.anim) rec.animTo = 1e9;
  rec.tick = v.tick || null; rec.loop = v.loop || 9;
  const box = card.box; box.innerHTML = ''; box.appendChild(rec.li); card.rec = rec;
}
function bnCatTick() {
  if (!BCATS.el || BCATS.el.hidden) { clearInterval(BCATS.timer); BCATS.timer = 0; return; }
  for (const c of BCATS.cards) {
    const r = c.rec; if (!r) continue;
    const age = BAND.t - r.t0;
    if (age > r.loop + (r.rev ? r.rev.end : 0)) { bnCatSample(c); continue; }
    if (r.tick) r.tick(r, age);
    if (r.form.kind === 'win') r.renderNow = (Math.floor(BAND.t * 6) !== Math.floor((BAND.t - 0.07) * 6));
    bnPaint(r); r.renderNow = false;
  }
}
function bnCatCount() { const all = BCAT.flatMap(s => s[2]); return [all.filter(e => e[6] || bnCatOn(e[0])).length, all.length]; }
function openBandCatalog() {
  let el = BCATS.el;
  if (!el) {
    el = BCATS.el = document.createElement('div'); el.id = 'bandCat'; el.className = 'popm pn'; el.hidden = true; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'The band: catalog');
    document.body.appendChild(el);
    el.addEventListener('click', e => {
      if (e.target.closest('[data-catx]')) { closeBandCatalog(); return; }
      const sw = e.target.closest('[data-cat]'); if (!sw) return;
      const code = sw.dataset.cat, on = !bnCatOn(code); bnCatSet(code, on);
      sw.setAttribute('aria-checked', on); sw.querySelector('.tgl').classList.toggle('on', on); sw.closest('.cc').classList.toggle('off', !on);
      const c = BCATS.cards.find(q => q.code === code); if (c) bnCatSample(c);
      const [n, m] = bnCatCount(); el.querySelector('.cat-n').textContent = `${n} of ${m} on`;
      sfx.click();
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !el.hidden) closeBandCatalog(); });
  }
  const [n, m] = bnCatCount();
  el.innerHTML = `<div class="lp-h ttl"><span>The band · catalog</span><span class="lp-dim cat-n">${n} of ${m} on</span><button type="button" class="ibtn" data-catx="1" aria-label="Close">×</button></div>` +
    `<div class="cat-body"><p class="cat-lede">Every part of the band has a code to talk about it by. Switches change what gets generated from now on. <span class="cat-k flavour">flavour</span> is made up; <span class="cat-k world">world</span> reads the city.</p>` +
    `<div class="cat-play"><div class="lp-sub">Toward play</div>${BCAT_PLAY.map(([h, c, t]) => `<div><b>${h}</b> <span class="cat-code">${c}</span><p>${t}</p></div>`).join('')}</div>` +
    BCAT.map(([sec, sub, items]) => `<div class="lp-sub">${sec}<span>${sub}</span></div><div class="cat-grid">` + items.map(([code, name, what, play, now, , fixed]) =>
      `<div class="cc${fixed || bnCatOn(code) ? '' : ' off'}" data-code="${code}"><div class="cc-h"><span class="cat-code">${code}</span><b>${name}</b><span class="cat-k ${now}">${now}</span>` +
      (fixed ? '<span class="cc-fix">always</span>' : `<span class="cc-sw" data-cat="${code}" role="switch" aria-checked="${bnCatOn(code)}" aria-label="${name}"><span class="tgl ${bnCatOn(code) ? 'on' : ''}"></span></span>`) +
      `</div><ul class="cs"></ul><p>${what}</p>${play && play !== '—' ? `<p class="cc-play">→ ${play}</p>` : ''}</div>`).join('') + '</div>').join('') + '</div>';
  BCATS.cards = [];
  let i = 0;
  for (const [, , items] of BCAT) for (const it of items) { const card = { i: i++, code: it[0], fn: it[5], box: el.querySelector(`.cc[data-code="${it[0]}"] .cs`) }; BCATS.cards.push(card); bnCatSample(card); }
  el.hidden = false;
  clearInterval(BCATS.timer); BCATS.timer = setInterval(bnCatTick, 66);
}
function closeBandCatalog() { if (BCATS.el) BCATS.el.hidden = true; clearInterval(BCATS.timer); BCATS.timer = 0; BCATS.cards = []; }
