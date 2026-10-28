// chrome.js - the persistent game chrome shared by every screen: top bar (brand, modes, clock, funds,
// agents) and the drawing-sheet title block. Each page sets window.PAGE before loading this file.
(function () {
  const P = window.PAGE || {};
  const TABS = [['VIEW', 'F1'], ['SECTION', 'F2'], ['PATTERNS', 'F3'], ['TIMELINE', 'F4'], ['SOUND', 'F5'], ['MODS', 'F6']];
  const mark = `<svg class="mark" viewBox="0 0 26 26" width="26" height="26">
      <circle cx="12" cy="13" r="10.5" fill="none" stroke="#eeebe4" stroke-width="1.6"/>
      <line x1="1.5" y1="13" x2="22.5" y2="13" stroke="#eeebe4" stroke-width="1.6"/>
      <path d="M12 2.5 A10.5 10.5 0 0 1 22.5 13 L12 13 Z" fill="#eeebe4"/>
      <path d="M22.5 13 L26 10 L26 16 Z" fill="#ffe13a"/></svg>`;
  const agents = (P.agents || [['Claude', 'Foreman · L25', 'a'], ['Claude', 'Surveyor · L3', 'b']])
    .map(([n, s, k]) => `<span class="agent-chip ${k === 'b' ? 'b' : ''}"><span class="dot"></span>${n}<span class="st">${s}</span></span>`).join('');
  const tabs = TABS.map(([t, k]) => `<div class="tab ${t === P.tab ? 'on' : ''}"><span class="k">${k}</span>${t}</div>`).join('');
  const speed = ['II', '1', '2', '3'].map((s, i) => `<span class="${i === (P.speed ?? 1) ? 'on' : ''}">${s}</span>`).join('');
  const bar = `<div class="topbar">
    <div class="cell brand">${mark}<span class="word">Tessera</span><span class="sub">Block 07 · Kessler Stack</span></div>
    <div class="cell tabs">${tabs}</div>
    <div class="spacer"></div>
    <div class="cell stat"><span class="l">Funds</span><span class="v">§ ${P.funds || '128,430'}</span></div>
    <div class="cell stat"><span class="l">Cashflow</span><span class="v">${P.cash || '+§ 412/day'}</span></div>
    <div class="cell stat"><span class="l">Residents · Block 07</span><span class="v">${P.pop || '1,829'} <span style="color:var(--text-3)">/ 48,210</span></span></div>
    <div class="cell agents">${agents}</div>
    <div class="cell"><div class="speed">${speed}</div></div>
    <div class="cell stat" style="min-width:176px"><span class="l">${P.date || 'Year 38 · Autumn · Day 112'}</span><span class="v">${P.time || '17:42'}</span></div>
  </div>`;
  document.body.insertAdjacentHTML('afterbegin', bar);

  if (P.title) {
    const t = P.title;
    const tb = `<div class="titleblock" id="titleblock" style="${t.style || ''}">
      <div class="tb-main"><div class="tb-proj">Tessera Arcology · Block 07 · Kessler Stack</div><div class="tb-name">${t.name}</div></div>
      <div class="tb-sheet"><span class="l">SHEET</span><span class="v">${t.sheet}</span></div>
      <div class="tb-row">
        <div><span class="l">View</span>${t.view}</div>
        <div><span class="l">Scale</span>${t.scale || '1:400 axo'}</div>
        <div><span class="l">Grid</span>${t.grid || '4.0 m · 3.5 m/lv'}</div>
        <div><span class="l">Drawn</span>${t.drawn || 'player + Claude'}</div>
        <div><span class="l">Rev</span>${t.rev || '12'}</div>
      </div></div>`;
    document.body.insertAdjacentHTML('beforeend', tb);
  }
})();
