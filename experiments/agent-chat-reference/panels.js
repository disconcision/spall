// The mock sidebar panels P1..P10. Each builds into a 312 px column.
'use strict';
const h = (tag, a, ...kids) => {
  const e = document.createElement(tag);
  if (a) for (const k in a) {
    if (k === 'class') e.className = a[k]; else if (k === 'style') e.style.cssText = a[k];
    else if (k === 'html') e.innerHTML = a[k]; else e.setAttribute(k, a[k]);
  }
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(c));
  return e;
};
const H = html => h('span', { html });
const NAME_CLS = { claude: 'cl', you: 'yo', bot: 'bt', sys: 'sy' };

// one chat row: avatar, name line, then body; `wide` children span the full width
function msg(o) {
  if (o.kind === 'bot' && o.inline && !o.text)   // bots: plate and glyph string share one line
    return h('div', { class: 'm botm ' + (o.cls || '') },
      avatar(o.av || 'sys'),
      h('div', { class: 'mc mbh' }, plate(o.name, o.plateFg || '#d9d2c2', o.plateBg), o.inline, o.time ? h('time', null, o.time) : null),
      ...(o.wide || []).map(w => h('div', { class: 'wide' }, w)));
  const head = h('div', { class: 'mh' },
    o.kind === 'bot' ? plate(o.name, o.plateFg || '#d9d2c2', o.plateBg) : h('b', { class: NAME_CLS[o.kind] }, o.name),
    o.meta ? h('i', { class: 'meta' }, o.meta) : null,
    o.time ? h('time', null, o.time) : null);
  const body = h('div', { class: 'mt' + (o.dim ? ' dim' : '') }, o.text ? (typeof o.text === 'string' ? H(o.text) : o.text) : null, o.inline || null);
  return h('div', { class: 'm ' + (o.cls || '') },
    avatar(o.av || (o.kind === 'claude' ? 'claude' : o.kind === 'you' ? 'you' : 'sys')),
    h('div', { class: 'mc' }, head, body),
    ...(o.wide || []).map(w => h('div', { class: 'wide' }, w)));
}
const ph = (title, right, cls) => h('div', { class: 'ph ' + (cls || '') }, h('span', { class: 'pt' }, title), right ? H(right) : null);
const seg = (items, on) => h('div', { class: 'seg' }, items.map((t, i) => h('button', { 'aria-pressed': i === on ? 'true' : 'false' }, H(t))));
const composer = ph => h('div', { class: 'comp' }, h('div', { class: 'in' }, ph), h('button', null, 'Send'));

function panel(o) {
  const side = h('div', { class: 'side', style: o.wide ? '' : 'height:' + (o.h || 480) + 'px' });
  o.build(side);
  const refs = (o.refs || []).map(r => h('a', { href: '#' + r }, r));
  return h('figure', { class: 'pcard' + (o.wide ? ' wide' : ''), id: o.code },
    h('div', { class: 'plabel' }, h('span', { class: 'code' }, o.code), h('span', { class: 'pname' }, o.title), h('span', { class: 'prefs' }, refs)),
    side,
    h('figcaption', { class: 'cap', html: o.cap }));
}

// =====================================================================
// P1 firehose
// =====================================================================
function buildFirehose(side) {
  side.append(ph('Chatter', '<b class="num">4,812</b> msg/s'));
  side.append(seg(['All', 'Claude <i>212</i>', 'Bots <i>1.9k</i>', 'You', '<b class="badtx">!</b> 3'], 0));
  const W = 155, Hh = 186;
  const [c, g] = cnv(W, Hh);
  const wrap = h('div', { class: 'fh' }, c);
  side.append(wrap);
  const r = mulberry(29);
  const LEG = [
    ['claude', 'claude·power', ['SLACK', '+12%']], ['bot', 'W-07', ['✶', 'L12', '✓']], ['bot', 'H-3', ['12', '∿', '⊓', '→']],
    ['claude', 'claude·deck', ['GIRDERS', 'DOWN', 'L12']], ['sys', 'sys', ['14', 'SUB-AGENTS', 'UP']], ['bot', 'T-TIE', ['⟦', '≡', '⟧', '⍥', '6']],
    ['bot', 'D-4', ['↻', '↻', '↻', '↻', '↻']], ['claude', 'claude·garden', ['GHOST', 'L9']], ['bot', 'F-2', ['▢', '⇢', 'W-07']],
    ['claude', 'claude·arch', ['SPAN', 'V3']], ['bot', 'C-9', ['∿', '⑂', '∿', '✓']]
  ];
  const BOTW = [ROLE.M, ROLE.D, ROLE.H, ROLE.V, ROLE.S, ROLE.M, ROLE.D];
  const rows = [];
  let y = 0;
  for (let i = 0; i < 900; i++) {
    const u = r();
    let row;
    if (i % 9 === 4) row = { kind: 'leg', leg: LEG[((i / 9 | 0) * 7) % LEG.length], p: 8 };
    else if (u > 0.93 && rows.length && rows[rows.length - 1].kind !== 'gap') row = { kind: 'gap', p: 2 };
    else {
      const kind = u < 0.5 ? 'bot' : u < 0.8 ? 'claude' : u < 0.9 ? 'sys' : u < 0.915 ? 'you' : u < 0.93 ? 'bad' : 'bot';
      const words = []; let x = kind === 'bot' ? 9 : 14 + ((r() * 6) | 0), end = 24 + Math.pow(r(), 0.7) * 122;
      while (x < end) { const w = 1 + ((r() * (kind === 'bot' ? 4 : 6)) | 0); words.push([x, w, (r() * 7) | 0]); x += w + 1 + (r() < 0.2 ? 1 : 0); }
      row = { kind, words, nl: kind === 'bot' ? 4 : 6 + ((r() * 5) | 0), p: 3 };
    }
    row.y = y; y += row.p; rows.push(row);
  }
  const total = y;
  const CASTE = { claude: C.agent, you: C.you, sys: '#5a564f', bad: C.bad, bot: '#8a9298' };
  function drawRow(row, yy, a) {
    g.globalAlpha = a;
    if (row.kind === 'gap') { g.globalAlpha = 1; return; }
    if (row.kind === 'leg') {
      const [k, name, toks] = row.leg;
      let x = 1;
      R(g, x, yy + 1, 2, 2, CASTE[k]); x += 4;
      x += ptext(g, name, x, yy, k === 'claude' ? C.agent : k === 'sys' ? '#8b857a' : '#b9b2a3') + 2;
      for (const t of toks) { tokDraw(g, t, x, yy, k === 'claude' ? '#cfc7b6' : null); x += tokW(t) + 3; }
      g.globalAlpha = 1; return;
    }
    R(g, 1, yy, 2, 2, CASTE[row.kind]);
    R(g, 4, yy, row.nl, 2, row.kind === 'bot' ? '#9a948a' : CASTE[row.kind]);
    g.globalAlpha = a * (row.kind === 'bot' ? 0.5 : 0.72);
    for (const [x, w, k] of row.words) {
      const col = row.kind === 'bot' ? BOTW[k] : row.kind === 'you' ? '#3f8fa5' : row.kind === 'bad' ? '#a8452f' : row.kind === 'sys' ? '#4a4741' : (k < 2 ? '#8b857a' : '#5f5a52');
      R(g, x, yy, w, 2, col);
    }
    g.globalAlpha = 1;
  }
  let off = 0, last = performance.now();
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches || /still/.test(location.search);
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!still) off = (off + dt * 34) % total;
    R(g, 0, 0, W, Hh, '#101113');
    // find the first visible row
    for (const row of rows) {
      let yy = row.y - off; if (yy < -10) yy += total;
      if (yy < -10 || yy > Hh) continue;
      const yi = Math.round(yy);
      if (row.kind !== 'leg') { drawRow(row, yi + 2, 0.08); drawRow(row, yi + 1, 0.22); }
      drawRow(row, yi, 1);
    }
    // the activity rail
    R(g, W - 5, 0, 5, Hh, '#17181b');
    const rr = mulberry(5);
    for (let yy = 0; yy < Hh; yy += 2) { const v = rr(); R(g, W - 4, yy, 3, 1, v < 0.45 ? '#3b3e44' : v < 0.7 ? '#6b5a3f' : v < 0.9 ? '#7a4a3a' : '#2e5d6a'); }
    R(g, W - 5, 60, 1, 34, C.accent); R(g, W - 1, 60, 1, 34, C.accent);
    // fade top and bottom
    for (let k = 0; k < 8; k++) { g.globalAlpha = (8 - k) / 10; R(g, 0, k, W - 5, 1, '#101113'); R(g, 0, Hh - 1 - k, W - 5, 1, '#101113'); }
    g.globalAlpha = 1;
    if (!still) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  // things that surface through the blur
  const chips = [
    ['bad', '<b class="badtx">‼ H-3</b> dropped 12 cable · L9'],
    ['yo', '<b class="yo">@you</b> claude·garden: approve the garden?'],
    ['cl', '<b class="cl">claude·arch</b> span plan v3 → 4 sub-agents']
  ].map(([k, t], i) => { const e = h('div', { class: 'surf ' + k, html: t }); e.style.top = (22 + i * 104) + 'px'; wrap.append(e); return e; });
  if (!still) {
    let t0 = performance.now();
    (function rise(now) {
      const t = (now - t0) / 1000;
      chips.forEach((e, i) => { const yy = 300 - ((t * 9 + i * 104 + 278) % 330); e.style.top = yy + 'px'; e.style.opacity = Math.max(0, Math.min(1, (yy + 10) / 40, (310 - yy) / 40)); });
      requestAnimationFrame(rise);
    })(t0);
  }
  const hot = h('div', { class: 'hot' }, h('div', { class: 'sub' }, 'Hot threads ', h('span', null, 'click to zoom in')),
    ...[['bridge L9→L14', 612, [0.4, 0.6, 0.7, 0.9, 1, 0.8, 0.95, 1]], ['power crew', 288, [0.3, 0.5, 0.4, 0.6, 0.5, 0.7, 0.6, 0.55]], ['#breakroom', 31, [0.1, 0.2, 0.1, 0.3, 0.2, 0.15, 0.25, 0.2]]]
      .map(([n, v, s]) => h('div', { class: 'hrow' }, spark(s, v > 300 ? C.agent : v > 100 ? '#a39c8e' : '#5a564f', 6), h('span', { class: 'hn' }, n), h('span', { class: 'hv' }, v + '/s'))));
  side.append(hot);
}

// =====================================================================
// P2 focused thread with sub-threads
// =====================================================================
function digest(avs, toks, n, label) {
  return h('button', { class: 'digest' }, h('span', { class: 'tri' }),
    h('span', { class: 'avs' }, avs.map(a => avatar(a, 1))),
    glyphLine(toks, { gap: 2 }),
    h('span', { class: 'dn' }, n + ' ' + (label || 'crew msgs')));
}
function buildThread(side) {
  side.append(h('div', { class: 'ph crumbs' }, H('<span class="back">◂</span> All / Bridge L9→L14 / <b>East span</b>')));
  const t = h('div', { class: 'thread' });
  t.append(msg({ kind: 'claude', name: 'claude·arch', time: '14:02', text: 'East span: 14 tiles from core B to the stair tower. Splitting it into deck, power and ties.',
    wide: [h('div', { class: 'stat' }, H('<b>3</b> sub-agents'), H('<b>214</b> bot msgs'), H('<b class="hole">▢ 2</b> open holes'))] }));
  const k1 = h('div', { class: 'kids' });
  k1.append(msg({ kind: 'claude', name: 'claude·deck', meta: 'sub-agent', time: '14:03', text: 'Girders down on L12, x4–x17. Two welds queued.' }));
  k1.append(h('div', { class: 'kids k2' }, digest(['welder', 'welder', 'hauler'], ['✶', '✶', '⊓', '▦', '✓'], 96)));
  k1.append(msg({ kind: 'claude', name: 'claude·power', meta: 'sub-agent', time: '14:03', text: 'Two runs up from the L9 substation. Tie every 3 m.' }));
  const k2 = h('div', { class: 'kids k2' });
  k2.append(msg({ kind: 'bot', av: 'tie', name: 'T-TIE', time: '14:04', inline: glyphLine([['⟦', ''], ['≡', 'TIE'], ['⟧', ''], ['⍥', '×'], ['6', '6'], ['✓', 'OK']]) }));
  k2.append(digest(['tie', 'crawler', 'crawler'], ['∿', '⑂', '∿', '≡', '✓'], 41));
  k1.append(k2);
  k1.append(msg({ kind: 'you', name: 'you', time: '14:06', text: 'the cables look too tight. let them droop', cls: 'me' }));
  const k3 = h('div', { class: 'kids k2' });
  k3.append(msg({ kind: 'claude', name: 'claude·power', time: '14:06', text: 'Slack +12%. Ties stay where they are.', wide: [slackCompare()] }));
  k1.append(k3);
  t.append(k1);
  side.append(t);
  side.append(composer('Reply in east span…'));
}

// =====================================================================
// P3 nested outline
// =====================================================================
function orow(lv, o) {
  const e = h('div', { class: 'or ' + (o.cls || ''), style: 'padding-left:' + (8 + lv * 11) + 'px' },
    h('span', { class: 'tg ' + (o.open === true ? 'open' : o.open === false ? 'shut' : 'leaf') }),
    o.av ? avatar(o.av, 1) : null,
    h('span', { class: 'on' }, typeof o.name === 'string' ? H(o.name) : o.name),
    o.extra || null,
    o.right != null ? h('span', { class: 'orr' }, typeof o.right === 'string' ? H(o.right) : o.right) : null);
  return e;
}
function buildNested(side) {
  side.append(ph('Roster', 'nested · <u>expand all</u>'));
  const L = h('div', { class: 'outline' });
  const rows = [
    [0, { open: true, name: '<b>stratum</b>', right: '212 <i>·</i> 1,906' }],
    [1, { open: false, name: 'power crew', right: '3 <i>·</i> 140', extra: spark([0.4, 0.6, 0.5, 0.8, 0.7, 0.9], '#6f6a60') }],
    [1, { open: true, name: 'bridge crew', right: '4 <i>·</i> 61', extra: spark([0.6, 0.9, 1, 0.8, 1, 0.9], C.agent) }],
    [2, { open: true, av: 'claude', name: '<span class="cl">claude·power</span>', right: 'laying runs' }],
    [3, { open: true, name: 'thoughts' }],
    [4, { open: false, name: '<q>slack is a feeling</q>', cls: 'th' }],
    [4, { open: true, name: 'worries', right: '3' }],
    [5, { open: true, name: 'the L12 tie', extra: spark([0.3, 0.4, 0.6, 0.8, 0.9, 1], C.bad), right: 'strain 0.81' }],
    [6, { open: false, name: 'it might slip', cls: 'th' }],
    [6, { open: true, name: 'a bird sat on it', cls: 'th' }],
    [7, { open: true, av: 'bird', name: 'the bird' }],
    [8, { open: true, name: 'thoughts' }],
    [9, { open: null, name: '<q>·</q>', cls: 'th' }],
    [3, { open: false, name: 'plan', extra: h('span', { class: 'fold' }, '…14 steps'), right: '<span class="hole">▢ 1</span>' }],
    [2, { open: false, av: 'claude', name: '<span class="cl">claude·deck</span>', right: 'welding' }],
    [2, { open: true, av: 'tie', name: 'T-tie', right: glyphLine(['≡', '⍥', '6'], { gap: 2 }) }],
    [3, { open: null, name: 'stack', extra: stackView(['∿', '6', '≡']) }],
    [3, { open: false, name: 'last words', right: glyphLine(['ᵕ', '?'], { gap: 2 }) }],
    [1, { open: false, name: 'garden crew', right: '2 <i>·</i> 33', extra: spark([0.2, 0.3, 0.2, 0.4, 0.3, 0.3], '#6f6a60') }],
    [1, { open: false, av: 'bird', name: 'the birds', right: '0 <i>·</i> 9' }],
    [1, { open: false, av: 'you', name: '<span class="yo">you</span>', right: '1 · thinking' }]
  ];
  for (const [lv, o] of rows) L.append(orow(lv, o));
  side.append(L);
  side.append(h('div', { class: 'crumbbar' }, H('stratum › bridge crew › claude·power › thoughts › worries › the L12 tie › a bird sat on it › <b>the bird</b>')));
}

// =====================================================================
// P4 bot pidgin: linear glyph strings with a gloss row
// =====================================================================
function bot(av, name, toks, o) {
  o = o || {};
  return msg({ kind: 'bot', av, name, time: o.time, inline: glyphLine(toks), wide: o.wide, cls: 'botm' });
}
function buildPidgin(side) {
  side.append(h('div', { class: 'ph' }, h('span', { class: 'pt' }, 'Crew W'), h('span', { class: 'tgl' }, 'gloss', h('i', { class: 'sw on' }))));
  const m = h('div', { class: 'msgs' });
  m.append(bot('hauler', 'H-3', [['12', '12'], ['∿', 'CABLE'], ['⊓', 'LIFT'], ['L9', 'L9'], ['→', 'GO'], ['3', '3']], { time: ':41' }));
  m.append(bot('welder', 'W-07', [['▢', 'WHO'], ['✶', 'WELD'], ['L12', 'L12'], ['?', '?']], { time: ':41' }));
  m.append(bot('welder', 'W-11', [['@', 'ME'], ['✶', 'WELD'], ['✶', 'WELD'], ['✓', 'OK']], { time: ':42' }));
  m.append(bot('tie', 'T-TIE', [['⟦', ''], ['≡', 'TIE'], ['⟧', ''], ['⍥', 'REPEAT'], ['6', '6'], ['L9', 'FROM'], ['L12', 'TO']], { time: ':42',
    wide: [h('div', { class: 'stackline' }, h('span', null, 'stack'), stackView(['∿', '12', 'L9', '≡', '6']))] }));
  m.append(msg({ kind: 'bot', av: 'drone', name: 'D-4', time: ':43', inline: glyphLine([['⊞', 'ROUTE'], ['⇢', 'TO'], ['W-11', 'W-11']]),
    wide: [h('div', { class: 'gridmsg' }, routeGrid(['>>>>v...', '....v...', '..◇<<<v.', '......✶.'], { ip: [4, 1] }),
      h('span', { class: 'gnote' }, 'a route as a tiny 2D program: the drone walks the arrows, the amber cell is where it is now'))] }));
  m.append(bot('hauler', 'H-3', [['⇄', 'SWAP'], ['◌', 'DROP'], ['◌', 'DROP']], { time: ':44' }));
  m.append(h('div', { class: 'xlabel' }, 'gloss off'));
  const bare = (av, name, toks) => msg({ kind: 'bot', av, name, inline: glyphLine(toks, { noGloss: true }), cls: 'tight' });
  m.append(bare('crawler', 'C-9', ['∿', '⑂', '∿', '≡', '✓']));
  m.append(bare('foreman', 'F-2', ['▢', '⇢', 'W-11', '?']));
  m.append(bare('welder', 'W-11', ['✓', '✶', '✶', '✶', '✶']));
  m.append(bare('drone', 'D-4', ['↻', '↻', '↻', '?']));
  m.append(bare('hauler', 'H-3', ['◌']));
  side.append(m);
  side.append(h('div', { class: 'legend' }, [['V', 'thing'], ['M', 'act'], ['D', 'relate'], ['H', 'plan'], ['S', 'stack']].map(([k, n]) => h('span', null, h('i', { style: 'background:' + ROLE[k] }), n))));
}

// =====================================================================
// P5 plan hand-off: nested ragged plans with holes and projectors
// =====================================================================
function buildPlan(side) {
  side.append(ph('Plan hand-off', 'claude·arch → F-2'));
  const m = h('div', { class: 'msgs' });
  const plan = ['SPAN', 'L9', 'TO', 'L14', '\n',
    ['DECK', '▦', '×14', 'AT', '◇', 'B'], '\n',
    ['EACH', ['RUN1', 'RUN2'], '\n',
      ['DRAPE', { hole: 'GAUGE', by: 'F-2' }, { slider: ['SLACK', '12%'] }], '\n',
      ['TIE', 'EVERY', '3M']], '\n',
    ['RAIL', { hole: 'STYLE' }, { check: ['LIT', true] }, { fold: 6 }]];
  m.append(msg({ kind: 'claude', name: 'claude·arch', time: '14:02', text: 'East span plan. The two holes are yours.', wide: [rocks(plan)] }));
  m.append(msg({ kind: 'bot', av: 'foreman', name: 'F-2', time: '14:05', text: '<span class="pid">▢gauge</span> = hose. <span class="pid">▢style</span> is not a crew call. passing up.',
    wide: [rocks(['DRAPE', [{ opt: { diff: true } }, 'HOSE'], { slider: ['SLACK', '12%'] }])] }));
  m.append(h('div', { class: 'ask' },
    h('div', { class: 'ah' }, h('span', { class: 'hl' }, '▢ style'), H('east-span rail · <b class="yo">needs you</b>')),
    h('div', { class: 'ab' }, ['glass', 'mesh', 'none'].map((t, i) => h('button', { 'aria-pressed': i === 0 ? 'false' : 'false' }, t)), h('button', { class: 'ghost' }, 'sketch it'))));
  m.append(msg({ kind: 'sys', av: 'sys', name: 'sys', text: '<span class="faintx">F-2 spawned W-07 to fill <span class="pid">▢weld-order</span></span>', cls: 'sysm' }));
  m.append(msg({ kind: 'you', name: 'you', time: '14:09', text: 'mesh. only on the outside edge', cls: 'me' }));
  m.append(msg({ kind: 'claude', name: 'claude·arch', time: '14:09', text: '<span class="pid">▢style</span> ← mesh, outside. Plan is whole: <b class="okx">0 holes</b>.' }));
  side.append(m);
  side.append(composer('Reply in plan…'));
}

// =====================================================================
// P6 blocks and wires inline
// =====================================================================
function buildPatch(side) {
  side.append(ph('Crew patch', 'F-2 · T-tie · W-07'));
  const m = h('div', { class: 'msgs' });
  const blocks = blockStack([
    { type: 'hat', col: '#e0a33a', label: ['WHEN', '∿', 'ARRIVES'] },
    { type: 'c', col: '#9b87e8', label: ['REPEAT', { slot: '6' }], inner: [
      { type: 'stack', col: '#a9cf56', label: ['DRAPE', { slot: '3M' }] },
      { type: 'stack', col: '#a9cf56', label: ['TIE', '≡'] },
      { type: 'c', col: '#9b87e8', label: ['IF', { bool: 'TAUT' }], inner: [
        { type: 'stack', col: '#a9cf56', label: ['SLACK', { slot: '+5%' }] }] }] },
    { type: 'cap', col: '#86b3d6', label: ['HAND', '⇢', '◇', 'B'] }]);
  m.append(msg({ kind: 'bot', av: 'foreman', name: 'F-2', time: ':10', text: 'routine for every run', wide: [blocks] }));
  m.append(msg({ kind: 'bot', av: 'tie', name: 'T-TIE', time: ':11', inline: glyphLine([['⇢', 'GIVE'], ['W-07', 'W-07']]), wide: [h('div', { class: 'rowwide' }, ringBlock(['TIE', '≡'], '#a9cf56'), h('span', { class: 'gnote' }, 'a ringed block is a program handed over as a thing'))] }));
  const p = patch(146, 38, [
    { id: 's', x: 2, y: 3, label: 'SPOOL' }, { id: 'd', x: 50, y: 3, label: 'DRAPE', bang: C.accent },
    { id: 't', x: 104, y: 3, label: 'TIE×6' }, { id: 'm', x: 98, y: 27, label: 'MOUNT B', col: C.gold }],
  [{ a: 's', b: 'd', col: '#e27a4e', thick: 2, sag: 7, dy: -1 }, { a: 's', b: 'd', col: '#5fd3c4', sag: 8, dy: 2, stripe: '#9b87e8' },
    { a: 'd', b: 't', col: '#e27a4e', thick: 2, sag: 9 }, { a: 't', b: 'm', col: '#e27a4e', thick: 2, sag: 8, dy2: 0 }],
  [{ x: 36, ws: [0, 1] }]);
  m.append(msg({ kind: 'bot', av: 'welder', name: 'W-07', time: ':12', inline: glyphLine([['✓', 'OK'], ['⊶', 'WIRED'], ['⇢', 'TO'], ['◇', 'B']]), wide: [p] }));
  m.append(msg({ kind: 'bot', av: 'foreman', name: 'F-2', time: ':20', text: 'merged. 6 runs, 36 ties, 0 birds.' }));
  side.append(m);
}

// =====================================================================
// P7 your voice note, collapsed to one line with a sketch thumbnail
// =====================================================================
function buildVoice(side) {
  side.append(ph('Chat', 'you · claude ×4'));
  const m = h('div', { class: 'msgs' });
  m.append(msg({ kind: 'you', name: 'you', time: '9:02', cls: 'me', inline: h('div', { class: 'vn' }, h('span', { class: 'play' }), h('span', { class: 'dur' }, '0:06'), wave(9, 9, 2), h('span', { class: 'q' }, '“open the well all the way up”')) }));
  m.append(msg({ kind: 'claude', name: 'claude·garden', time: '9:14', text: 'The light well on L9 opens to the sky now. Want anything in the gap?' }));
  const vn = h('div', { class: 'vn' },
    h('span', { class: 'play' }), h('span', { class: 'dur' }, '0:21'), wave(16, 9, 7),
    h('span', { class: 'q' }, '“a garden where the light falls, round, keep the walkway”'),
    sketch(36, 24, { sc: 1 }));
  m.append(msg({ kind: 'you', name: 'you', time: '9:15', inline: vn, cls: 'me' }));
  m.append(h('div', { class: 'xlabel' }, 'same note, opened'));
  const card = h('div', { class: 'vcard' },
    h('div', { class: 'vtop' }, h('span', { class: 'play' }), h('span', { class: 'dur' }, '0:21'), wave(52, 11, 7)),
    h('div', { class: 'vbody' },
      sketch(60, 40, { label: true }),
      h('p', null, 'put a garden where the light falls in the morning… sort of round, here, and keep the walkway.')),
    h('div', { class: 'vfoot' }, H('pin <b>L9 x12 y7</b>'), H('heard 4 · taken <b class="cl">claude·garden</b>')));
  m.append(msg({ kind: 'you', name: 'you', time: '9:15', wide: [card], cls: 'me' }));
  m.append(msg({ kind: 'claude', name: 'claude·garden', time: '9:15', text: 'Round bed, five tiles, your walkway kept. Ghost is up.',
    wide: [h('div', { class: 'ab' }, h('button', { 'aria-pressed': 'true' }, 'Approve'), h('button', null, 'Tweak'), h('span', { class: 'auto' }, 'auto in 8 s'))] }));
  m.append(msg({ kind: 'bot', av: 'hauler', name: 'H-3', time: '9:16', inline: glyphLine([['5', '5'], ['⊓', 'LIFT'], ['L9', 'L9'], ['→', 'GO'], ['✓', 'OK']]) }));
  side.append(m);
  side.append(h('div', { class: 'comp' }, h('div', { class: 'in' }, 'hold V to talk, or type…'), h('button', { class: 'mic' }, H('<i></i>'))));
}

// =====================================================================
// P8 breakroom: robot chatter
// =====================================================================
function buildBreak(side) {
  side.append(ph('#breakroom', 'off-shift · 31 bots'));
  const m = h('div', { class: 'msgs end' });
  m.append(bot('hauler', 'H-3', [['4000', '4000'], ['▦', 'GIRDER'], ['⊓', 'LIFT'], ['⊔', 'DROP'], ['?', 'ANY'], ['♥', 'LOVE']]));
  m.append(bot('welder', 'W-07', [['♥', 'LOVE']]));
  m.append(bot('hauler', 'H-3', [[':', 'DUP']], { wide: [h('div', { class: 'stackline' }, h('span', null, 'stack'), stackView(['♥', '♥']))] }));
  m.append(bot('tie', 'T-TIE', [['≡', 'TIE'], ['≡', 'TIE'], ['≡', 'TIE'], ['≡', 'TIE'], ['ᵕ', 'BIRD']]));
  m.append(msg({ kind: 'sys', av: 'sys', name: 'sys', text: 'T-tie tied a bird to a power run. Bird released, unharmed, offended.', cls: 'sysm' }));
  m.append(msg({ kind: 'bot', av: 'bird', name: 'BIRD', plateFg: '#1b1c1f', plateBg: '#e9e4d8', inline: glyphLine(['ᵕ']) }));
  m.append(msg({ kind: 'claude', name: 'claude·deck', text: 'I have been asked to reroute the reroute.' }));
  m.append(msg({ kind: 'claude', name: 'claude·power', text: 'I spawned an agent to understand your reroute. It spawned one too. We are six deep.' }));
  m.append(msg({ kind: 'claude', name: 'claude·arch', text: 'How is everyone holding up?' }));
  m.append(bot('hauler', 'H-3', [['◌', 'POP'], ['◌', 'POP'], ['◌', 'POP'], ['◌', 'POP']]));
  m.append(msg({ kind: 'sys', av: 'sys', name: 'sys', text: 'H-3: stack empty', cls: 'sysm' }));
  m.append(msg({ kind: 'bot', av: 'drone', name: 'D-4', inline: glyphLine([['☼', 'SUN'], ['⇢', 'FOR'], ['@', 'YOU']]), wide: [h('div', { class: 'rowwide' }, postcard(), h('span', { class: 'gnote' }, 'D-4 sent a photo (it is 24 colour blocks)'))] }));
  m.append(msg({ kind: 'sys', av: 'sys', name: 'sys', text: 'GC collected 14 idle sub-agents. Some had good ideas.', cls: 'sysm' }));
  side.append(m);
}

// =====================================================================
// P9 one thread at four zooms
// =====================================================================
function buildZoom(side) {
  side.append(h('div', { class: 'ph' }, h('span', { class: 'pt' }, 'Zoom'), seg(['Z0', 'Z1', 'Z2', 'Z3'], 3)));
  const band = (k, t, el) => h('div', { class: 'band' }, h('div', { class: 'bh' }, h('b', null, k), t), el);
  // Z0: threads as lanes
  {
    const [c, g] = cnv(150, 30), r = mulberry(4);
    const lanes = [[C.agent, 0.5], ['#8a9298', 0.9], [ROLE.M, 0.7], ['#8a9298', 0.3], [C.you, 0.05], ['#5a564f', 0.2]];
    lanes.forEach(([col, d], i) => {
      R(g, 0, i * 5 + 2, 150, 1, '#1d1e21');
      for (let x = 0; x < 150; x += 2) if (r() < d * (0.5 + 0.5 * Math.sin(x / 13 + i))) R(g, x, i * 5 + 1, 1 + (r() < 0.3 ? 1 : 0), 3, col);
    });
    R(g, 118, 0, 1, 30, C.accent);
    side.append(band('Z0', 'heat · each thread a lane', c));
  }
  // Z1: the game font at one screen pixel
  {
    const [c, g] = cnv(300, 42, 1);
    const L = [[C.agent, 'CLAUDE·ARCH', 'EAST SPAN: SPLIT INTO DECK, POWER, TIES'], ['#b9b2a3', 'W-07', null, ['✶', 'L12', '?']], ['#b9b2a3', 'W-11', null, ['@', '✶', '✶', '✓']],
      [C.agent, 'CLAUDE·POWER', 'TWO RUNS FROM L9. TIE EVERY 3 M.'], [C.you, 'YOU', 'THE CABLES LOOK TOO TIGHT'], [C.agent, 'CLAUDE·POWER', 'SLACK +12%. TIES STAY.']];
    L.forEach(([col, n, txt, toks], i) => {
      let x = 2 + ptext(g, n, 2, i * 7 + 1, col) + 4;
      if (txt) ptext(g, txt, x, i * 7 + 1, '#8b857a'); else for (const t of toks) { tokDraw(g, t, x, i * 7 + 1); x += tokW(t) + 3; }
    });
    side.append(band('Z1', 'skim · the game font at 1 px', c));
  }
  // Z2: one line each, glyphs at full size
  {
    const rows = [['claude', 'ARCH', ['SPAN', '⇢', 'DECK', 'POWER', 'TIES']], ['welder', 'W-07', ['▢', '✶', 'L12', '?']], ['welder', 'W-11', ['@', '✶', '✶', '✓']], ['you', 'YOU', ['CABLES', 'TOO', 'TIGHT']]];
    side.append(band('Z2', 'gist · one line per message', h('div', { class: 'z2' }, rows.map(([a, n, toks]) => h('div', { class: 'z2r' }, avatar(a, 1), plate(n, a === 'claude' ? C.agent : a === 'you' ? C.you : '#d9d2c2', '#202125'), glyphLine(toks, { col: a === 'you' ? C.you : a === 'claude' ? '#d9d2c2' : null }))))));
  }
  // Z3: words
  side.append(band('Z3', 'read · full messages', h('div', null,
    msg({ kind: 'claude', name: 'claude·arch', time: '14:02', text: 'East span: split into deck, power and ties.' }),
    msg({ kind: 'bot', av: 'welder', name: 'W-07', time: '14:03', inline: glyphLine([['▢', 'WHO'], ['✶', 'WELD'], ['L12', 'L12'], ['?', '?']]) }),
    msg({ kind: 'bot', av: 'welder', name: 'W-11', time: '14:03', inline: glyphLine([['@', 'ME'], ['✶', 'WELD'], ['✶', 'WELD'], ['✓', 'OK']]) }),
    msg({ kind: 'claude', name: 'claude·power', time: '14:04', text: 'Two runs from L9. Tie every 3 m.' }),
    msg({ kind: 'you', name: 'you', time: '14:06', text: 'the cables look too tight. let them droop', cls: 'me' }),
    msg({ kind: 'claude', name: 'claude·power', time: '14:06', text: 'Slack +12%. Ties stay where they are.' }))));
}

// =====================================================================
// P10 the bot glyph set and crew roster
// =====================================================================
function buildKey(side) {
  side.append(ph('Glyph key', 'bot pidgin v0 · 5×5 glyphs coloured by role · read left to right, like a stack'));
  const groups = [
    ['V', 'things', 'parts, places, numbers', [['∿', 'cable'], ['▦', 'girder'], ['◇', 'mount'], ['☼', 'light'], ['ᵕ', 'bird'], ['@', 'me'], ['✓', 'yes']]],
    ['M', 'act on one', 'take one thing', [['⊓', 'lift'], ['⊔', 'drop'], ['✶', 'weld'], ['≡', 'tie'], ['→', 'go'], ['↻', 'orbit'], ['⚡', 'power']]],
    ['D', 'relate two', 'take two things', [['⊶', 'connect'], ['⑂', 'merge'], ['⌣', 'drape'], ['⇢', 'hand to']]],
    ['H', 'plans', 'take a quoted program', [[['⟦', '⟧'], 'quote'], ['⍥', 'repeat'], ['∵', 'each'], ['⊞', 'grid'], ['▢', 'hole']]],
    ['S', 'stack', 'reshuffle', [[':', 'dup'], ['⇄', 'swap'], ['◌', 'pop']]],
    ['Q', 'tone', 'how it feels', [['?', 'ask'], ['✗', 'no'], ['‼', 'alarm'], ['♥', 'fond']]]
  ];
  const k = h('div', { class: 'key' });
  for (const [role, name, note, gl] of groups) {
    k.append(h('div', { class: 'krow' },
      h('div', { class: 'kh' }, h('i', { style: 'background:' + ROLE[role] }), h('span', null, name), h('small', null, note)),
      h('div', { class: 'kg' }, gl.map(([g, n]) => { const w = tokW(g); const [c, gg] = cnv(w, 5, 4); tokDraw(gg, g, 0, 0); return h('div', { class: 'kc' }, c, h('span', null, n)); }))));
  }
  const step = (tok, stack, cap, extra) => {
    const w = tokW(tok); const [c, g] = cnv(w, 5, 4); tokDraw(g, tok, 0, 0);
    return h('div', { class: 'step' }, h('div', { class: 'stok' }, c), h('div', { class: 'sst' }, stack.length ? stackView(stack) : h('span', { class: 'empty' }, 'empty'), extra || null), h('div', { class: 'scap' }, cap));
  };
  const right = h('div', { class: 'kright' },
    h('div', { class: 'kh' }, h('span', null, 'crew')),
    h('div', { class: 'ros' }, [['claude', 'claude'], ['foreman', 'foreman'], ['hauler', 'hauler'], ['welder', 'welder'], ['tie', 'tie-bot'], ['drone', 'drone'], ['crawler', 'crawler'], ['bird', 'bird'], ['you', 'you'], ['sys', 'sys']]
      .map(([a, n]) => h('div', { class: 'rc' }, avatar(a, 4), h('span', null, n)))),
    h('div', { class: 'kh' }, h('span', null, 'one sentence, step by step'), h('small', null, 'T-tie: “tie it six times, done”')),
    h('div', { class: 'steps' },
      step('6', ['6'], 'push 6'),
      step(['⟦', '≡', '⟧'], ['6', ['⟦', '≡', '⟧']], 'push a quoted tie'),
      step('⍥', [], 'repeat runs it 6×', glyphLine(['≡', '≡', '≡', '≡', '≡', '≡'], { gap: 1 })),
      step('✓', ['✓'], 'report ok')));
  side.append(h('div', { class: 'sheet' }, k, right));
}

const PANELS = [
  { code: 'P1', title: 'Firehose', refs: ['R1', 'R3'], build: buildFirehose, h: 520,
    cap: 'Everything at once is texture. Each message is a dash in its speaker’s colour (claude coral, bots in glyph colours), with motion smear. Three things surface legibly through the blur: alarms, anything addressed to you, and decisions. Hot threads at the bottom are the way in. Animated.' },
  { code: 'P2', title: 'Thread + sub-threads', refs: ['R5', 'R20'], build: buildThread, h: 520,
    cap: 'Zoomed into one thread. Sub-agents hang off rails; crew chatter under each one collapses to a single digest line (avatars, a glyph summary, a count). Your note gets an answer with a tiny before/after drawn in cable.' },
  { code: 'P3', title: 'Nested roster', refs: ['R21', 'R5', 'R8'], build: buildNested, h: 520,
    cap: 'Teams → agents → an agent’s thoughts → worries → a bird → the bird’s thoughts. One outline from the whole city down to a single dot, after Orteil’s Nested. Folded plans and open holes show inline; a breadcrumb trail keeps the depth readable.' },
  { code: 'P4', title: 'Bot pidgin', refs: ['R1', 'R2', 'R3', 'R22', 'R15'], build: buildPidgin, h: 540,
    cap: 'Low-level bots never speak English: they exchange stack strings of 5×5 glyphs, coloured by role. A toggleable interlinear gloss is the subtitle. The shared stack can be peeked at, and a drone answers with a 2D route program.' },
  { code: 'P5', title: 'Plan hand-off', refs: ['R4', 'R5', 'R7', 'R6'], build: buildPlan, h: 540,
    cap: 'Plans travel as nested ragged blocks in blueprint violet. Holes are delegation: a filled hole is a sub-agent at work (striped); a hole no bot can fill climbs back up to you as a question. Hazel-style projectors: slider, checkbox, fold.' },
  { code: 'P6', title: 'Blocks + wires', refs: ['R9', 'R10', 'R11', 'R12', 'R13', 'R18'], build: buildPatch, h: 540,
    cap: 'Higher-order talk between crew bosses: a block routine (same role colours; nested same-colour blocks zebra-lighten), a ringed block passed as a value, and a patch whose wires are Stratum cables, draped, with a wire tie.' },
  { code: 'P7', title: 'Your voice note', refs: ['R5'], build: buildVoice, h: 600,
    cap: 'Your voice note collapses to one line: play, length, waveform, the gist, and a thumbnail of what you drew while talking. Opened, it shows the transcript, the sketch, the pinned spot, and who took it.' },
  { code: 'P8', title: '#breakroom', refs: ['R17', 'R18', 'R1'], build: buildBreak, h: 600,
    cap: 'Off-shift chatter. A hauler dups a heart. A tie-bot ties a bird. Agents recursing on a reroute. A stack-empty mood. A drone’s photo as colour blocks, after Piet. Garbage collection takes some good ideas with it.' },
  { code: 'P9', title: 'Four zooms', refs: ['R21', 'R3'], build: buildZoom, h: 600,
    cap: 'The same thread at four zooms, like the city: lanes of heat, the game’s own 3×5 font at one screen pixel, glyph gists, then words. Proposal: the scroll wheel over the sidebar zooms the chat the way it zooms the world.' },
  { code: 'P10', title: 'Glyph key + crew', refs: ['R1', 'R2', 'R3', 'R19'], build: buildKey, wide: true,
    cap: 'The original glyph set behind P4–P9, grouped by role, with the crew avatars and one sentence run step by step. Role colours come from the game’s data-wire strands (lime, steel blue, violet), plus cream for things and grey for stack shuffles: Uiua’s colour-by-arity idea, in Stratum’s palette.' }
];
document.addEventListener('DOMContentLoaded', () => {
  const host = document.getElementById('panels');
  for (const p of PANELS) host.append(panel(p));
});
