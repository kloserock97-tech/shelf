/* Work mega menu. Categories come from the data, not written by hand: every project has a `kind` list,
 * a new project is picked up by the filter by itself; the number next to a category is how many will stay.
 * Opens on hover (mouse) and on click (finger, keyboard); closes when the cursor has left both the trigger and
 * the panel, on Esc and on a click outside. Motion: ease-out with a sharp start, scale from 0.97 at the trigger,
 * a short card cascade; closing is faster than opening. The category switches only on click: on hover it would
 * change under the cursor while it travels diagonally to the cards. */

const FILTERS = ['all', 'web', 'mobile'];
const pad = (n) => String(n).padStart(2, '0');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const arrow = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7"/><path d="M8.5 7H17v8.5"/></svg>';

/* placeholder product screens, drawn: a web dashboard and a phone app, in the project's accent (currentColor) */
const INK = 'fill="#1d1d1f"';
export const webScreen = () => `<svg viewBox="0 0 320 200" aria-hidden="true" style="color:var(--accent)">
  <rect width="320" height="200" fill="#fff"/><rect width="62" height="200" fill="currentColor" opacity=".07"/>
  <rect x="12" y="16" width="26" height="8" rx="4" fill="currentColor"/>
  ${[40, 56, 72, 88, 104].map((y, i) => `<rect x="12" y="${y}" width="${i === 1 ? 38 : 30}" height="5" rx="2.5" ${INK} opacity="${i === 1 ? 0.5 : 0.16}"/>`).join('')}
  <rect x="76" y="16" width="86" height="9" rx="4.5" ${INK} opacity=".82"/><rect x="266" y="14" width="40" height="13" rx="6.5" fill="currentColor"/>
  ${[76, 154, 232].map((x, i) => `<rect x="${x}" y="38" width="72" height="42" rx="7" fill="currentColor" opacity="${i ? 0.07 : 0.14}"/><rect x="${x + 9}" y="47" width="26" height="5" rx="2.5" ${INK} opacity=".35"/><rect x="${x + 9}" y="59" width="${36 - i * 6}" height="11" rx="3" ${INK} opacity=".8"/>`).join('')}
  <rect x="76" y="92" width="150" height="94" rx="8" ${INK} opacity=".035"/>
  <polyline points="86,170 104,158 122,162 140,142 158,148 176,124 194,130 214,108" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
  ${[98, 118, 138, 158].map((y) => `<rect x="236" y="${y}" width="70" height="12" rx="4" ${INK} opacity=".07"/>`).join('')}
</svg>`;
export const phoneScreen = () => `<svg viewBox="0 0 180 390" preserveAspectRatio="xMidYMin slice" aria-hidden="true" style="color:var(--accent)">
  <rect width="180" height="390" fill="#f6f6f4"/>
  <rect x="16" y="14" width="22" height="6" rx="3" ${INK} opacity=".7"/><rect x="138" y="14" width="26" height="6" rx="3" ${INK} opacity=".5"/>
  <rect x="16" y="40" width="96" height="12" rx="6" ${INK} opacity=".85"/><rect x="16" y="58" width="64" height="7" rx="3.5" ${INK} opacity=".3"/>
  <rect x="16" y="80" width="148" height="92" rx="16" fill="currentColor"/>
  <rect x="30" y="96" width="54" height="7" rx="3.5" fill="#fff" opacity=".7"/><rect x="30" y="112" width="84" height="18" rx="5" fill="#fff"/>
  <rect x="30" y="146" width="120" height="12" rx="6" fill="#fff" opacity=".28"/><rect x="30" y="146" width="78" height="12" rx="6" fill="#fff" opacity=".85"/>
  ${[190, 238, 286].map((y) => `<rect x="16" y="${y}" width="148" height="38" rx="10" fill="#fff"/><circle cx="36" cy="${y + 19}" r="9" fill="currentColor" opacity=".18"/><rect x="54" y="${y + 11}" width="70" height="6" rx="3" ${INK} opacity=".7"/><rect x="54" y="${y + 22}" width="46" height="5" rx="2.5" ${INK} opacity=".25"/>`).join('')}
  <rect x="0" y="340" width="180" height="50" fill="#fff"/>
  ${[30, 70, 110, 150].map((x, i) => `<circle cx="${x}" cy="360" r="6" fill="${i ? '#1d1d1f' : 'currentColor'}" opacity="${i ? 0.2 : 1}"/>`).join('')}
</svg>`;

const lookVars = (c) => `--s1:${c.look.stage[0]};--s2:${c.look.stage[1]};--ink:${c.look.ink};--accent:${c.look.accent};--oar:${c.object.ratio.toFixed(4)}`;
const device = (c) => c.kind.includes('mobile')
  ? `<span class="work-menu__dev work-menu__dev--phone" aria-hidden="true">${phoneScreen()}</span>`
  : `<span class="work-menu__dev" aria-hidden="true"><i class="work-menu__dev-bar"></i>${webScreen()}</span>`;

/**
 * @param {{ trigger: HTMLElement, items: Array<{id:string,title:string,tag:string,kind:string[],href?:string,look:{stage:[string,string],ink:string,accent:string},object:{src:string,ratio:number}}>,
 *           labels?: {title?:string, filters?:string, all?:string, web?:string, mobile?:string, note?:string, allCases?:string}, onAll?: () => void }} opts
 */
export function initWorkMenu(opts) {
  const { trigger, items: all } = opts;
  const L = { title: 'Work', filters: 'Filter projects', all: 'All', web: 'Web', mobile: 'Mobile', note: 'Selected projects, 2023–2026', allCases: 'All case studies', ...opts.labels };
  const counts = Object.fromEntries(FILTERS.map((f) => [f, f === 'all' ? all.length : all.filter((c) => c.kind.includes(f)).length]));
  let filter = 'all';

  const panel = document.createElement('div');
  panel.className = 'work-menu';
  panel.id = 'work-menu';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', L.title);
  panel.innerHTML = `
    <div class="work-menu__body">
      <div class="work-menu__filters" role="group" aria-label="${esc(L.filters)}">
        ${FILTERS.map((f) => `<button type="button" class="work-menu__filter${f === filter ? ' is-on' : ''}" data-filter="${f}" aria-pressed="${f === filter}">
          <span class="work-menu__filter-l">${esc(L[f])}</span><span class="work-menu__filter-n">${pad(counts[f])}</span></button>`).join('')}
      </div>
      <div class="work-menu__pane">
        <ul class="work-menu__grid">
          ${all.map((c, i) => `<li style="--i:${i}" data-kinds="${esc(c.kind.join(' '))}">
            <a class="work-menu__card" href="${esc(c.href ?? `#${c.id}`)}">
              <span class="work-menu__thumb" style="${lookVars(c)}">${device(c)}<picture class="work-menu__obj" aria-hidden="true"><img src="${esc(c.object.src)}" alt="" loading="lazy" decoding="async" draggable="false"></picture><span class="work-menu__go">${arrow}</span></span>
              <span class="work-menu__name">${esc(c.title)}</span>
              <span class="work-menu__sub">${esc(c.tag)}</span>
            </a></li>`).join('')}
        </ul>
        <div class="work-menu__rail" aria-hidden="true"><span class="work-menu__bar"></span></div>
      </div>
    </div>
    <div class="work-menu__foot">
      <p class="work-menu__note">${esc(L.note)}</p>
      <div class="work-menu__actions"><button class="work-menu__all" type="button">${esc(L.allCases)} <span aria-hidden="true">→</span></button></div>
    </div>`;
  document.body.appendChild(panel);

  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', panel.id);

  const items = [...panel.querySelectorAll('.work-menu__grid li')];
  const grid = panel.querySelector('.work-menu__grid');
  const pane = panel.querySelector('.work-menu__pane');
  const rail = panel.querySelector('.work-menu__rail');
  const bar = panel.querySelector('.work-menu__bar');
  const filterButtons = [...panel.querySelectorAll('.work-menu__filter')];

  /* Scrolling inside the frame: the frame, categories and bottom row stand, only the grid scrolls. Instead of the
     system bar — a thin capsule with a gap from the edge, shown on hover and while scrolling (like macOS overlay
     bars); it can be dragged, a click on the track pages by a screen. The edge beyond which there are more cards
     dissolves. The system bar is hidden, but wheel, touchpad, finger and keyboard scroll as usual. */
  const px = (v) => Math.max(0, v).toFixed(1) + 'px';
  const syncRail = () => {
    const { scrollTop, scrollHeight, clientHeight } = grid;
    const range = scrollHeight - clientHeight;
    const over = range > 2;
    pane.classList.toggle('is-scrollable', over);
    grid.style.setProperty('--fade-top', over ? px(Math.min(28, scrollTop)) : '0px');
    grid.style.setProperty('--fade-bot', over ? px(Math.min(28, range - scrollTop)) : '0px');
    if (!over) return;
    const track = rail.clientHeight;
    const h = Math.max(32, (track * clientHeight) / scrollHeight);
    bar.style.height = px(h);
    bar.style.translate = '0 ' + px(((track - h) * scrollTop) / range);
  };
  let railTimer = 0;
  grid.addEventListener('scroll', () => {
    syncRail();
    pane.classList.add('is-scrolling');
    clearTimeout(railTimer);
    railTimer = setTimeout(() => pane.classList.remove('is-scrolling'), 800);
  }, { passive: true });
  new ResizeObserver(syncRail).observe(grid);
  bar.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    bar.setPointerCapture(e.pointerId);
    pane.classList.add('is-dragging');
    const y0 = e.clientY, top0 = grid.scrollTop;
    const k = (grid.scrollHeight - grid.clientHeight) / Math.max(1, rail.clientHeight - bar.offsetHeight);
    const move = (ev) => { grid.scrollTop = top0 + (ev.clientY - y0) * k; };
    const up = () => {
      pane.classList.remove('is-dragging');
      bar.removeEventListener('pointermove', move);
      bar.removeEventListener('pointerup', up);
      bar.removeEventListener('pointercancel', up);
    };
    bar.addEventListener('pointermove', move);
    bar.addEventListener('pointerup', up);
    bar.addEventListener('pointercancel', up);
  });
  rail.addEventListener('pointerdown', (e) => {
    if (e.target === bar) return;
    const below = e.clientY > bar.getBoundingClientRect().top;
    grid.scrollBy({ top: (below ? 1 : -1) * grid.clientHeight * 0.85, behavior: 'smooth' });
  });

  /* the filter: the grid fades for a moment, changes its set and shows again with a cascade — no layout jumps
     in the middle of a visible frame */
  let filterTimer = 0;
  const setFilter = (next) => {
    if (next === filter) return;
    filter = next;
    filterButtons.forEach((b) => {
      const on = b.dataset.filter === next;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    panel.classList.add('is-filtering');
    clearTimeout(filterTimer);
    filterTimer = setTimeout(() => {
      let k = 0;
      items.forEach((li) => {
        const show = next === 'all' || (li.dataset.kinds ?? '').split(' ').includes(next);
        li.hidden = !show;
        if (show) li.style.setProperty('--i', String(k++));
      });
      grid.scrollTop = 0;
      syncRail();
      requestAnimationFrame(() => panel.classList.remove('is-filtering'));
    }, 120);
  };
  filterButtons.forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); setFilter(b.dataset.filter); }));

  let open = false, openedAt = 0, closeTimer = 0, openTimer = 0;
  /* the panel stands under the trigger, centred on it, but never past the window edge */
  const place = () => {
    const tr = trigger.getBoundingClientRect();
    const top = tr.bottom + 10;
    panel.style.setProperty('--wm-top', `${top}px`);
    panel.style.top = `${top}px`;
    if (innerWidth <= 900) { panel.style.left = ''; return; }
    const pw = panel.offsetWidth, margin = 16, centre = tr.left + tr.width / 2;
    const left = Math.min(Math.max(centre - pw / 2, margin), innerWidth - pw - margin);
    panel.style.left = `${left}px`;
    panel.style.setProperty('--origin-x', `${centre - left}px`);
  };
  const setOpen = (on) => {
    clearTimeout(closeTimer);
    clearTimeout(openTimer);
    if (on === open) return;
    open = on;
    if (on) { place(); openedAt = performance.now(); requestAnimationFrame(syncRail); }
    panel.classList.toggle('is-open', on);
    trigger.setAttribute('aria-expanded', String(on));
  };
  const closeSoon = () => { clearTimeout(openTimer); clearTimeout(closeTimer); closeTimer = setTimeout(() => setOpen(false), 220); };

  const hoverable = matchMedia('(hover: hover) and (pointer: fine)');
  for (const el of [trigger, panel]) {
    el.addEventListener('pointerenter', (e) => {
      if (e.pointerType !== 'mouse' || !hoverable.matches) return;
      clearTimeout(closeTimer);
      if (!open) openTimer = setTimeout(() => setOpen(true), el === trigger ? 60 : 0);
    });
    el.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') closeSoon(); });
  }
  trigger.addEventListener('click', (e) => {
    e.preventDefault();
    /* a click right after a hover-open must not slam it shut */
    if (open && performance.now() - openedAt < 450) return;
    setOpen(!open);
    if (open && e.detail === 0) filterButtons[0]?.focus();
  });
  panel.querySelectorAll('.work-menu__card').forEach((a) => a.addEventListener('click', () => setOpen(false)));
  panel.querySelector('.work-menu__all').addEventListener('click', () => { setOpen(false); opts.onAll?.(); });
  document.addEventListener('pointerdown', (e) => {
    if (open && !panel.contains(e.target) && !trigger.contains(e.target)) setOpen(false);
  });
  document.addEventListener('keydown', (e) => {
    if (!open) return;
    if (e.key === 'Escape') { setOpen(false); trigger.focus(); return; }
    /* the arrows walk every control of the panel in order: categories, cards, buttons */
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const focusables = [...panel.querySelectorAll('button, a')].filter((el) => !el.closest('[hidden]'));
      const i = focusables.indexOf(document.activeElement);
      const next = e.key === 'ArrowDown' ? (i + 1) % focusables.length : (i - 1 + focusables.length) % focusables.length;
      focusables[next]?.focus();
      e.preventDefault();
    }
  });
  addEventListener('resize', () => { if (open) place(); });

  return { open: () => setOpen(true), close: () => setOpen(false) };
}
