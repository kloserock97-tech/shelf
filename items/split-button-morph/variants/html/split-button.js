// Split Button Morph.
// Markup: .spb[data-key] > button.spb__main (.spb__icon, .spb__label) + button.spb__toggle[commandfor][command=toggle-popover]
//         + .spb__menu[popover][role=menu] > button.spb__item[role=menuitemradio][data-value][data-label].
// Picking an item runs it and makes it the main action; the choice is kept in localStorage under "spb:<data-key>".
// The main button and a picked item both fire "spb:run" on .spb with detail { value, label }.
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

  const MORPH = springEase(0.5, 0.3);
  const SWAP = springEase(0.42, 0.18);
  const DONE_MS = 1400;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const hasCommands = 'commandForElement' in HTMLButtonElement.prototype;
  const hasAnchors = CSS.supports('anchor-name', '--a') && CSS.supports('position-area', 'bottom');
  let uid = 0;

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } }
  };

  function init(root) {
    if (root.dataset.spbReady) return;
    root.dataset.spbReady = '1';
    const main = root.querySelector('.spb__main');
    const label = root.querySelector('.spb__label');
    const toggle = root.querySelector('.spb__toggle');
    const menu = root.querySelector('.spb__menu');
    const items = [...menu.querySelectorAll('.spb__item')];
    const key = root.dataset.key ? `spb:${root.dataset.key}` : null;
    let doneTimer = 0;

    root.style.setProperty('--spb-spring', MORPH.easing);
    root.style.setProperty('--spb-dur', `${MORPH.ms}ms`);

    // invoker: commands where they exist, the popovertarget property otherwise
    if (!hasCommands) {
      toggle.removeAttribute('commandfor');
      toggle.removeAttribute('command');
      toggle.popoverTargetElement = menu;
      toggle.popoverTargetAction = 'toggle';
    }
    // a name per instance, so several split buttons on a page each find their own toggle
    if (hasAnchors) {
      const name = `--spb-${++uid}`;
      toggle.style.anchorName = name;
      menu.style.positionAnchor = name;
    }
    const place = () => {
      if (hasAnchors) return;
      const r = toggle.getBoundingClientRect();
      menu.style.top = `${r.bottom}px`;
      menu.style.right = `${Math.max(8, document.documentElement.clientWidth - r.right)}px`;
    };

    const current = () => items.find((i) => i.getAttribute('aria-checked') === 'true') ?? items[0];

    function setLabel(text, animate) {
      if (label.textContent === text) return;
      if (!animate || reduced.matches) { label.textContent = text; return; }
      const from = main.getBoundingClientRect().width;
      label.textContent = text;
      const to = main.getBoundingClientRect().width;
      main.animate({ width: [`${from}px`, `${to}px`] }, { duration: SWAP.ms, easing: SWAP.easing });
      label.animate(
        { translate: ['0 10px', '0 0'], opacity: [0, 1], filter: ['blur(3px)', 'blur(0)'] },
        { duration: 320, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }
      );
    }

    function choose(item, animate) {
      items.forEach((i) => i.setAttribute('aria-checked', String(i === item)));
      setLabel(item.dataset.label ?? item.textContent.trim(), animate);
      main.dataset.value = item.dataset.value;
      if (key) store.set(key, item.dataset.value);
    }

    function run() {
      const item = current();
      root.dispatchEvent(new CustomEvent('spb:run', { bubbles: true, detail: { value: item.dataset.value, label: item.dataset.label } }));
      clearTimeout(doneTimer);
      root.setAttribute('data-done', '');
      doneTimer = setTimeout(() => root.removeAttribute('data-done'), DONE_MS);
    }

    const saved = key && store.get(key);
    const start = items.find((i) => i.dataset.value === saved) ?? current();
    choose(start, false);

    main.addEventListener('click', run);

    menu.addEventListener('beforetoggle', (e) => { if (e.newState === 'open') place(); });
    menu.addEventListener('toggle', (e) => {
      const open = e.newState === 'open';
      toggle.setAttribute('aria-expanded', String(open));
      if (open) current().focus({ preventScroll: true });
    });

    menu.addEventListener('click', (e) => {
      const item = e.target.closest('.spb__item');
      if (!item) return;
      choose(item, true);
      menu.hidePopover();
      main.focus({ preventScroll: true });
      run();
    });

    // roving focus inside the menu; Tab leaves and closes it
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
    // ArrowDown on the toggle opens the menu, like a select
    toggle.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' && !menu.matches(':popover-open')) { e.preventDefault(); menu.showPopover({ source: toggle }); }
    });

    addEventListener('resize', () => { if (menu.matches(':popover-open')) place(); });
  }

  const runAll = () => document.querySelectorAll('.spb').forEach(init);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', runAll);
  else runAll();
  window.SplitButtonMorph = { init };
})();
