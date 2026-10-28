// components.js - reusable HUD components (level strip) built from the spec-derived numbers in data.js
(function () {
  // named strata of Block 07 (decks at L6, L12, L18, L24; tube T1 at L7.4, viaduct V2 at L12.45)
  const STRATA = [
    { name: 'Canopy', from: 24, to: 25 },
    { name: 'High Rows', from: 18, to: 23 },
    { name: 'Lantern Rows', from: 12, to: 17 },
    { name: 'Tube Quarter', from: 6, to: 11 },
    { name: 'Stilt Market', from: 1, to: 5 },
    { name: 'Canal St', short: 'St', from: 0, to: 0 },
    { name: 'Undercroft', short: 'Under', from: -2, to: -1 },
  ];
  const DECK = { 6: 'DK1', 12: 'DK2', 18: 'DK3', 24: 'DK4' };
  const MARK = { 7: 'T1 tube', 12: 'V2 viaduct', 0: 'canal', '-1': 'pumps', '-2': 'cisterns', 24: 'garden', 25: 'cranes' };
  const tag = (L) => (L < 0 ? 'B' + (-L) : 'L' + L);
  const elev = (L) => (L * 3.5 >= 0 ? '+' : '−') + Math.abs(L * 3.5).toFixed(1);
  function stratumOf(L) { return STRATA.find(s => L >= s.from && L <= s.to); }

  function levelData(L) {
    if (L < 0) return { fill: null, light: null, residents: 0 };
    const d = (window.LEVELS.levels || [])[L] || {};
    return { fill: d.fill, light: d.light, residents: d.residents };
  }

  // opts: active, ghostTo (level), hiddenFrom, fadeLevels, agents: [{level, label, kind}], rowH, compact, width
  function levelStrip(host, o) {
    const rowH = o.rowH || 30;
    const rows = [];
    for (let L = 25; L >= -2; L--) rows.push(L);
    let html = `<div class="ls-rows" style="position:relative">`;
    for (const L of rows) {
      const d = levelData(L);
      let cls = 'ls-row';
      if (L === o.active) cls += ' on';
      else if (o.active != null && L > o.active && L <= Math.floor(o.ghostTo ?? o.active)) cls += ' ghost';
      else if (o.active != null && L > o.active) cls += ' hidden';
      else if (o.active != null && L < o.active && L >= o.active - (o.fadeLevels || 0)) cls += ' fade';
      if (DECK[L]) cls += ' deck';
      const fill = d.fill == null ? '' : `<span class="ls-bar"><i style="width:${Math.min(100, d.fill * 200).toFixed(0)}%"></i><b></b></span><span class="ls-v">${Math.round(d.fill * 100)}%</span>`;
      const light = d.light == null ? '<span class="ls-v dim2">—</span>' : `<span class="ls-v">${d.light}%</span>`;
      const ag = (o.agents || []).filter(a => a.level === L).map(a =>
        `<span class="ls-agent ${a.kind || ''}"><i></i>${a.label}</span>`).join('');
      const note = (DECK[L] ? `<span class="ls-note">${DECK[L]}</span>` : '') + (MARK[L] && !o.compact ? `<span class="ls-note">${MARK[L]}</span>` : '');
      if (o.compact) {
        html += `<div class="${cls}" style="height:${rowH}px"><span class="ls-tag">${tag(L)}</span>${d.fill == null ? '<span class="ls-bar empty"></span>' : `<span class="ls-bar"><i style="width:${Math.min(100, d.fill * 200).toFixed(0)}%"></i><b></b></span>`}${ag}</div>`;
      } else {
        html += `<div class="${cls}" style="height:${rowH}px"><span class="ls-tag">${tag(L)}</span><span class="ls-el">${elev(L)}</span>${fill || '<span class="ls-bar empty"></span><span class="ls-v dim2">—</span>'}${light}<span class="ls-extra">${ag}${note}</span></div>`;
      }
    }
    html += `</div>`;
    host.insertAdjacentHTML('beforeend', html);
    // stratum bands (rotated names) to the left of the rows
    const band = document.createElement('div');
    band.className = 'ls-band';
    for (const s of STRATA) {
      const top = rows.indexOf(s.to) * rowH, h = (s.to - s.from + 1) * rowH;
      const on = o.active != null && o.active >= s.from && o.active <= s.to;
      band.insertAdjacentHTML('beforeend', `<div class="ls-str ${on ? 'on' : ''}" style="top:${top}px;height:${h}px"><span>${(s.to - s.from + 1) * rowH < 90 && s.short ? s.short : s.name}</span></div>`);
    }
    host.querySelector('.ls-rows').appendChild(band);
    return { rowY: (L) => rows.indexOf(L) * rowH + rowH / 2 };
  }

  const css = `
  .ls-rows { margin-left: 30px; }
  .ls-row { display: flex; align-items: center; gap: 8px; padding: 0 8px 0 6px; border-top: 1px solid rgba(255,255,255,0.06); position: relative; }
  .ls-row.deck { border-top: 3px solid var(--text-2); }
  .ls-tag { width: 34px; font-family: var(--f-cond); font-weight: 700; font-size: 15px; letter-spacing: 0.03em; }
  .ls-el { width: 50px; font-family: var(--f-mono); font-size: 12px; color: var(--text-2); text-align: right; }
  .ls-bar { position: relative; width: 64px; height: 7px; background: rgba(255,255,255,0.08); }
  .ls-bar.empty { background: transparent; border-bottom: 1px dotted var(--line-2); height: 1px; }
  .ls-bar i { position: absolute; left: 0; top: 0; bottom: 0; background: var(--text-2); }
  .ls-bar b { position: absolute; left: 50%; top: -3px; bottom: -3px; width: 1.5px; background: var(--text); opacity: 0.9; }
  .ls-v { width: 34px; font-family: var(--f-mono); font-size: 12px; text-align: right; color: var(--text-2); }
  .ls-extra { display: flex; gap: 6px; margin-left: 4px; overflow: hidden; white-space: nowrap; }
  .ls-note { font-family: var(--f-cond); font-weight: 600; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-3); border: 1px solid var(--line); padding: 0 4px; }
  .ls-row.on { background: var(--accent); color: var(--ink); }
  .ls-row.on .ls-el, .ls-row.on .ls-v, .ls-row.on .ls-note { color: var(--ink); border-color: rgba(0,0,0,0.35); }
  .ls-row.on .ls-bar { background: rgba(0,0,0,0.15); } .ls-row.on .ls-bar i { background: var(--ink); } .ls-row.on .ls-bar b { background: var(--ink); }
  .ls-row.ghost { color: var(--ghost); background: rgba(127,176,255,0.07); }
  .ls-row.ghost .ls-el, .ls-row.ghost .ls-v { color: var(--ghost); opacity: 0.85; }
  .ls-row.ghost .ls-bar i { background: var(--ghost); opacity: 0.7; }
  .ls-row.hidden { color: var(--text-3); background-image: var(--hatch); }
  .ls-row.hidden .ls-el, .ls-row.hidden .ls-v { color: var(--text-3); }
  .ls-row.hidden .ls-bar i { background: var(--text-3); }
  .ls-row.fade .ls-tag { color: var(--text-2); }
  .ls-agent { display: inline-flex; align-items: center; gap: 4px; font-family: var(--f-cond); font-weight: 700; font-size: 11.5px; letter-spacing: 0.08em; text-transform: uppercase;
    color: var(--ink); background: var(--accent); padding: 0 5px 0 3px; }
  .ls-agent i { width: 9px; height: 11px; background: var(--ink); clip-path: polygon(0 0, 100% 55%, 45% 62%, 30% 100%); }
  .ls-agent.b { background: var(--text); }
  .ls-band { position: absolute; left: -30px; top: 0; width: 26px; bottom: 0; }
  .ls-str { position: absolute; left: 0; width: 26px; border-left: 1.5px solid var(--line-2); border-top: 1.5px solid var(--line-2); border-bottom: 1.5px solid var(--line-2); }
  .ls-str span { position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%) rotate(-90deg); white-space: nowrap;
    font-family: var(--f-cond); font-weight: 600; font-size: 11.5px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--text-3); }
  .ls-str.on { border-color: var(--accent); } .ls-str.on span { color: var(--accent); }
  `;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  window.COMP = { STRATA, levelStrip, tag, elev, levelData, stratumOf };
})();
