// Renders a gallery page from window.GALLERY = [{ id, title, note, cols, items: [...] }] into #gallery.
// An item is { img, title, text, out, wide, px, video, drafts: [[label, img], ...] }: img is the web copy (web/),
// out the full-size original in out/ (linked only where it exists: locally, not on the published site).
// Click any image for a lightbox; arrow keys step through every image on the page, Esc closes.
(() => {
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const shots = []; // every image on the page, in order, for the lightbox
  const add = (img, cap) => (shots.push({ img, cap }), shots.length - 1);
  function fig(it) {
    const cap = `<b>${esc(it.title)}</b>${it.text ? ' · ' + esc(it.text) : ''}`;
    const media = it.video
      ? `<div class="im"><video src="${esc(it.video)}" ${it.img ? `poster="${esc(it.img)}"` : ''} controls loop muted playsinline preload="metadata"></video></div>`
      : `<a class="im" data-i="${add(it.img, cap)}"><img src="${esc(it.img)}" alt="${esc(it.title)}" loading="lazy"${it.px ? ' class="px"' : ''}></a>`;
    const drafts = it.drafts ? `<div class="drafts">${it.drafts.map(([l, im]) =>
      `<a data-i="${add(im, `<b>${esc(it.title)}</b> · ${esc(l)}`)}"><img src="${esc(im)}" alt="${esc(l)}" loading="lazy"><i>${esc(l)}</i></a>`).join('')}</div>` : '';
    return `<figure class="pn${it.wide ? ' wide' : ''}">${media}${drafts}<figcaption><b>${esc(it.title)}</b>${it.text ? `<span>${esc(it.text)}</span>` : ''}${it.out ? `<a class="src" data-out="${esc(it.out)}" href="${esc(it.out)}" target="_blank" hidden>full size: ${esc(it.out)}</a>` : ''}</figcaption></figure>`;
  }
  document.getElementById('gallery').innerHTML = window.GALLERY.map(s =>
    `<h2 id="${esc(s.id)}">${esc(s.title)}</h2>${s.note ? `<p class="note">${s.note}</p>` : ''}<div class="grid" style="--cols:${s.cols || 2}">${s.items.map(fig).join('')}</div>`).join('');
  // full-size originals: shown only where out/ is here
  for (const a of document.querySelectorAll('a[data-out]'))
    fetch(a.dataset.out, { method: 'HEAD' }).then(r => { if (r.ok) a.hidden = false; }, () => {});

  const lb = document.createElement('div');
  lb.id = 'lb';
  lb.innerHTML = '<button class="nav prev" aria-label="Previous">‹</button><img alt=""><div class="cap"></div><button class="nav next" aria-label="Next">›</button>';
  document.body.append(lb);
  let at = -1;
  const show = i => { at = (i + shots.length) % shots.length; lb.querySelector('img').src = shots[at].img; lb.querySelector('.cap').innerHTML = shots[at].cap; lb.classList.add('on'); };
  const hide = () => { lb.classList.remove('on'); at = -1; };
  document.addEventListener('click', e => {
    const a = e.target.closest('[data-i]'); if (a) { e.preventDefault(); show(+a.dataset.i); return; }
    if (e.target.closest('.prev')) show(at - 1); else if (e.target.closest('.next')) show(at + 1); else if (at >= 0 && e.target.closest('#lb')) hide();
  });
  document.addEventListener('keydown', e => {
    if (at < 0) return;
    if (e.key === 'Escape') hide(); else if (e.key === 'ArrowLeft') show(at - 1); else if (e.key === 'ArrowRight') show(at + 1);
  });
})();
