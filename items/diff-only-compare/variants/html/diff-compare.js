/* Differences-Only Compare.
   Markup: .dfc > .dfc-scroll > table.dfc-table. Body rows are <tr> with a <th scope="row"> and one <td> per option.
   data-v on a <td> is the number to compare; data-better="higher|lower" on the <tr> says which way is better.
   Rows whose values all match get .is-same; the switch folds them away. Section rows (.dfc-section) fold
   when every row under them is the same. */
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const ICON = {
    best: '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M5 8.5v-7M2 4.2 5 1.5l3 2.7"/></svg>',
    worst: '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M5 1.5v7M2 5.8 5 8.5l3-2.7"/></svg>'
  };

  // td > .dfc-fold > .dfc-clip > .dfc-pad: the grid row folds 1fr → 0fr, the padding goes with it
  function wrap(cell) {
    const fold = document.createElement('div');
    const clip = document.createElement('div');
    const pad = document.createElement('div');
    fold.className = 'dfc-fold';
    clip.className = 'dfc-clip';
    pad.className = 'dfc-pad';
    while (cell.firstChild) pad.appendChild(cell.firstChild);
    clip.appendChild(pad);
    fold.appendChild(clip);
    cell.appendChild(fold);
    return pad;
  }

  const key = (td) => td.dataset.v ?? td.textContent.trim().replace(/\s+/g, ' ');

  function mark(td, kind) {
    td.dataset.mark = kind;
    const pad = td.querySelector('.dfc-pad');
    const val = document.createElement('span');
    val.className = 'dfc-val';
    while (pad.firstChild) val.appendChild(pad.firstChild);
    const m = document.createElement('span');
    m.className = 'dfc-mark';
    m.dataset.mark = kind;
    m.innerHTML = kind === 'best' ? `${ICON.best}Best` : `${ICON.worst}<span class="dfc-sr">worst</span>`;
    if (kind === 'best') m.querySelector('svg').insertAdjacentHTML('afterend', '<span class="dfc-sr">, </span>');
    pad.append(val, m);
  }

  function scoreRow(tr) {
    const cells = [...tr.querySelectorAll(':scope > td')];
    const keys = cells.map(key);
    const same = keys.every((k) => k === keys[0]);
    tr.classList.toggle('is-same', same);
    const dir = tr.dataset.better;
    if (same || (dir !== 'higher' && dir !== 'lower')) return same;
    const vals = cells.map((td) => Number(td.dataset.v));
    if (vals.some((v) => !Number.isFinite(v))) return same;
    const hi = Math.max(...vals);
    const lo = Math.min(...vals);
    const best = dir === 'higher' ? hi : lo;
    const worst = dir === 'higher' ? lo : hi;
    cells.forEach((td, i) => {
      if (vals[i] === best) mark(td, 'best');
      else if (vals[i] === worst) mark(td, 'worst');
    });
    return same;
  }

  function init(root) {
    if (root.dfc) return;
    const table = root.querySelector('.dfc-table');
    const scroller = root.querySelector('.dfc-scroll');
    const input = root.querySelector('.dfc-switch input');
    const status = root.querySelector('.dfc-status');
    const foldMs = parseFloat(getComputedStyle(root).getPropertyValue('--dfc-fold-ms')) || 340;

    const cols = table.querySelectorAll('thead th').length;
    root.style.setProperty('--dfc-cols', cols);

    for (const cell of table.querySelectorAll('tbody th, tbody td')) wrap(cell);

    // score rows, then fold a section when nothing under it differs
    let section = null;
    let sectionSame = true;
    const closeSection = () => { if (section) section.classList.toggle('is-same', sectionSame); };
    for (const tr of table.tBodies[0].rows) {
      if (tr.classList.contains('dfc-section')) {
        closeSection();
        section = tr;
        sectionSame = true;
        const label = tr.querySelector('.dfc-pad');
        label.innerHTML = `<span class="dfc-section__label">${label.innerHTML}</span>`;
        continue;
      }
      if (!scoreRow(tr)) sectionSame = false;
    }
    closeSection();

    const sameRows = [...table.querySelectorAll('tbody tr.is-same')];
    const sameData = sameRows.filter((tr) => !tr.classList.contains('dfc-section')).length;
    const total = table.querySelectorAll('tbody tr:not(.dfc-section)').length;

    let timer = 0;
    function setDiff(on, { animate = true } = {}) {
      clearTimeout(timer);
      input.checked = on;
      const instant = !animate;
      if (instant) root.classList.add('is-instant');
      if (on) {
        root.classList.add('is-diff');
        // folded rows leave the table (and the accessibility tree) once the fold ends
        if (instant) sameRows.forEach((tr) => (tr.hidden = true));
        else timer = setTimeout(() => sameRows.forEach((tr) => (tr.hidden = true)), reduce.matches ? 170 : foldMs);
      } else {
        sameRows.forEach((tr) => (tr.hidden = false));
        void table.offsetHeight; // start the unfold from 0fr
        root.classList.remove('is-diff');
      }
      if (instant) requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('is-instant')));
      if (status) {
        status.textContent = on
          ? `${sameData} identical row${sameData === 1 ? '' : 's'} hidden`
          : `${total} rows, ${sameData} identical`;
      }
      onScroll();
    }
    input.addEventListener('change', () => setDiff(input.checked));

    // stuck head → chips. Plain scroll check with hysteresis: the head shrinks when stuck, and a short scroll
    // range could otherwise clamp scrollTop to 0 and make it flip back and forth.
    let stuck = false;
    function onScroll() {
      const room = scroller.scrollHeight - scroller.clientHeight;
      const y = scroller.scrollTop;
      const next = stuck ? y > 0 : y > 8 && room > 48;
      if (next !== stuck) {
        stuck = next;
        root.classList.toggle('is-stuck', stuck);
      }
    }
    scroller.addEventListener('scroll', onScroll, { passive: true });

    setDiff(false, { animate: false });
    root.dfc = { setDiff, scroller };
  }

  const boot = () => document.querySelectorAll('.dfc').forEach(init);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
