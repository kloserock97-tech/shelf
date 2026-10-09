// Source-Morph Menu.
// Markup: a source <button commandfor="id" command="toggle-popover"> anywhere, and
//   <div class="smm" id="id" popover role="menu"><div class="smm__body"><div class="smm__items">
//     <button class="smm__item" role="menuitem">…</button> …</div></div></div>
// Before every open the script measures the source (size, corner radius, colours), picks the corner to grow from
// by where the source sits on screen, puts a copy of the source in the panel head and anchors the panel to it.
// CSS does the rest: clip-path from the source's rectangle to the full panel, items in a cascade, and back on close.
(() => {
  // Damped oscillator x(t) = 1 − e^(−ζωt)·(cos ω_d t + (ζω/ω_d)·sin ω_d t), set by the period of one swing and the
  // share of bounce (ζ = 1 − bounce); sampled, then thinned to the stops that leave the straight line by > 0.0015.
  function springEase(period, bounce) {
    const w = (2 * Math.PI) / period;
    const z = 1 - Math.min(0.9, Math.max(0, bounce));
    const k = z * w;
    const wd = w * Math.sqrt(Math.max(1e-4, 1 - z * z));
    const x = (t) => 1 - Math.exp(-k * t) * (Math.cos(wd * t) + (k / wd) * Math.sin(wd * t));
    const T = Math.log(400) / k;
    const N = 96;
    const pts = [];
    for (let i = 0; i <= N; i++) pts.push([i / N, i === N ? 1 : x((T * i) / N)]);
    const kept = [pts[0]];
    for (let i = 1; i < N; i++) {
      const a = kept[kept.length - 1];
      const b = pts[i + 1];
      const p = pts[i];
      const y = a[1] + ((b[1] - a[1]) * (p[0] - a[0])) / (b[0] - a[0]);
      if (Math.abs(y - p[1]) > 0.0015) kept.push(p);
    }
    kept.push(pts[N]);
    const stops = kept.map(([t, v], i) => (i === 0 ? '0' : i === kept.length - 1 ? '1' : `${v.toFixed(4)} ${(t * 100).toFixed(2)}%`));
    return { easing: `linear(${stops.join(', ')})`, ms: Math.round(T * 1000) };
  }

  const PANEL = springEase(0.56, 0.16); // the shape: settles fast, a hint of overshoot
  const ITEMS = springEase(0.44, 0.36); // the rows: a visible bounce
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const hasCommands = 'commandForElement' in HTMLButtonElement.prototype;
  const hasAnchors = CSS.supports('anchor-name', '--a');
  let uid = 0;

  function init(menu) {
    if (menu.dataset.smmReady) return;
    const id = menu.id;
    const source = id && document.querySelector(`[commandfor="${CSS.escape(id)}"], [popovertarget="${CSS.escape(id)}"]`);
    if (!source) return;
    menu.dataset.smmReady = '1';
    const body = menu.querySelector('.smm__body');
    const items = [...menu.querySelectorAll('.smm__item')];

    menu.style.setProperty('--smm-spring', PANEL.easing);
    menu.style.setProperty('--smm-dur', `${PANEL.ms}ms`);
    menu.style.setProperty('--smm-item-spring', ITEMS.easing);
    menu.style.setProperty('--smm-item-dur', `${ITEMS.ms}ms`);

    if (!hasCommands && source.hasAttribute('commandfor')) {
      source.removeAttribute('commandfor');
      source.removeAttribute('command');
      source.popoverTargetElement = menu;
      source.popoverTargetAction = 'toggle';
    }
    source.setAttribute('aria-haspopup', 'menu');
    source.setAttribute('aria-expanded', 'false');
    if (hasAnchors) {
      const name = `--smm-${++uid}`;
      source.style.anchorName = name;
      menu.style.positionAnchor = name;
    }

    // the head: a copy of the source, decorative; clicking it closes the menu
    let head = menu.querySelector('.smm__head');
    if (!head) {
      head = document.createElement('div');
      head.className = 'smm__head';
      head.setAttribute('aria-hidden', 'true');
      body.prepend(head);
    }
    head.addEventListener('click', () => menu.hidePopover());
    let unhide = 0;
    const outMs = () => parseFloat(getComputedStyle(menu).getPropertyValue('--smm-out-dur')) || 240;

    function measure() {
      const r = source.getBoundingClientRect();
      const cs = getComputedStyle(source);
      const vw = document.documentElement.clientWidth;
      const vh = document.documentElement.clientHeight;
      const x = r.left + r.width / 2 > vw / 2 ? 'end' : 'start';
      const y = r.top + r.height / 2 > vh * 0.6 ? 'up' : 'down';
      menu.dataset.x = x;
      menu.dataset.y = y;
      const radius = Math.min(parseFloat(cs.borderTopLeftRadius) || 0, r.height / 2, r.width / 2);
      const bg = cs.backgroundColor;
      const transparent = /rgba\(.*,\s*0\)$|transparent/.test(bg);
      menu.style.setProperty('--src-w', `${r.width}px`);
      menu.style.setProperty('--src-h', `${r.height}px`);
      menu.style.setProperty('--src-r', `${radius}px`);
      if (!transparent) menu.style.setProperty('--src-bg', bg);
      else menu.style.removeProperty('--src-bg');
      menu.style.setProperty('--src-fg', cs.color);
      // the cascade index for browsers without sibling-index(): nearest to the source first
      items.forEach((it, i) => it.style.setProperty('--smm-i', String(y === 'up' ? items.length - 1 - i : i)));
      if (!hasAnchors) {
        menu.style.left = x === 'start' ? `${r.left}px` : 'auto';
        menu.style.right = x === 'end' ? `${vw - r.right}px` : 'auto';
        menu.style.top = y === 'down' ? `${r.top}px` : 'auto';
        menu.style.bottom = y === 'up' ? `${vh - r.bottom}px` : 'auto';
      }
      const ghost = source.cloneNode(true);
      ghost.removeAttribute('id');
      ghost.removeAttribute('commandfor');
      ghost.removeAttribute('command');
      ghost.removeAttribute('popovertarget');
      ghost.removeAttribute('style');
      ghost.setAttribute('tabindex', '-1');
      ghost.inert = true;
      ghost.classList.add('smm__ghost');
      head.replaceChildren(ghost);
    }

    menu.addEventListener('beforetoggle', (e) => { if (e.newState === 'open') measure(); });
    menu.addEventListener('toggle', (e) => {
      const open = e.newState === 'open';
      source.setAttribute('aria-expanded', String(open));
      clearTimeout(unhide);
      if (open) source.setAttribute('data-smm-under', '');
      // back on when the panel has flowed into it
      else unhide = setTimeout(() => source.removeAttribute('data-smm-under'), reduced.matches ? 0 : outMs());
      if (open) {
        const first = menu.dataset.y === 'up' ? items[items.length - 1] : items[0];
        (items.find((i) => i.getAttribute('aria-checked') === 'true') ?? first)?.focus({ preventScroll: true });
      }
    });

    menu.addEventListener('keydown', (e) => {
      const at = items.indexOf(document.activeElement);
      let next = -1;
      if (e.key === 'ArrowDown') next = (at + 1) % items.length;
      else if (e.key === 'ArrowUp') next = (at - 1 + items.length) % items.length;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = items.length - 1;
      else if (e.key === 'Tab') { menu.hidePopover(); return; }
      if (next < 0) return;
      e.preventDefault();
      items[next].focus();
    });

    // a picked item closes the menu and hands focus back to the source
    menu.addEventListener('click', (e) => {
      const item = e.target.closest('.smm__item');
      if (!item || item.getAttribute('aria-disabled') === 'true') return;
      if (item.getAttribute('role') === 'menuitemradio') items.forEach((i) => i.getAttribute('role') === 'menuitemradio' && i.setAttribute('aria-checked', String(i === item)));
      menu.dispatchEvent(new CustomEvent('smm:pick', { bubbles: true, detail: { item, value: item.dataset.value ?? item.textContent.trim() } }));
      menu.hidePopover();
      source.focus({ preventScroll: true });
    });

    // the panel is placed against the source once; if the page moves under it, it closes
    addEventListener('resize', () => menu.matches(':popover-open') && menu.hidePopover());
    if (!hasAnchors) addEventListener('scroll', () => menu.matches(':popover-open') && menu.hidePopover(), { passive: true, capture: true });
  }

  const run = () => document.querySelectorAll('.smm[popover]').forEach(init);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
  window.SourceMorphMenu = { init };
})();
