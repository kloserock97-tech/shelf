/* Anchor-Hop Product Tour.
   const tour = anchorTour(root, steps, { onEnd });  tour.start(0)
   root  — the element the tour dims (position: relative; overflow: clip keeps the dim inside it)
   steps — [{ target: 'css selector' | Element, title, text, hint? }]
   One spotlight hops between targets: the current target carries anchor-name --aht-target, the spotlight and the
   card are anchored to it, so a step change is one property move and CSS transitions do the travel. The card picks
   its side with position-try-fallbacks; without anchor positioning the script places both by hand. */
(function (global) {
  const ANCHORS = CSS.supports('anchor-name: --a') && CSS.supports('top: anchor(top)') && CSS.supports('position-area: bottom');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let uid = 0;

  // Damped spring, sampled into a CSS linear() easing (bounce 0..1).
  function spring(bounce = 0.18, n = 40) {
    const z = 1 - bounce, w0 = 4.6 / z, wd = w0 * Math.sqrt(Math.max(1e-4, 1 - z * z));
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pts.push(+(1 - Math.exp(-z * w0 * t) * (Math.cos(wd * t) + (z * w0 / wd) * Math.sin(wd * t))).toFixed(3));
    }
    pts[n] = 1;
    return `linear(${pts.join(', ')})`;
  }

  const X = '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M3 3l8 8M11 3l-8 8"/></svg>';
  const TAP = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.5 8.5V3.2a1.2 1.2 0 0 1 2.4 0v4.3l3 .9a1.4 1.4 0 0 1 1 1.6l-.5 3.1a1.5 1.5 0 0 1-1.5 1.3H8a1.7 1.7 0 0 1-1.3-.6L4 10.6a1.1 1.1 0 0 1 1.5-1.6z"/></svg>';

  function anchorTour(root, steps, opts = {}) {
    const id = `aht${++uid}`;
    root.classList.add('aht-root');
    root.style.setProperty('--aht-spring', spring());

    const spot = document.createElement('div');
    spot.className = 'aht-spot is-full is-out';
    spot.hidden = true;
    spot.setAttribute('aria-hidden', 'true');

    const card = document.createElement('div');
    card.className = 'aht-card';
    card.hidden = true;
    card.tabIndex = -1;
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'false');
    card.setAttribute('aria-labelledby', `${id}-title`);
    card.setAttribute('aria-describedby', `${id}-text`);
    card.innerHTML =
      '<span class="aht-card__arrow" aria-hidden="true"></span>' +
      `<p class="aht-card__count" id="${id}-count" aria-live="polite"></p>` +
      `<h3 class="aht-card__title" id="${id}-title"></h3>` +
      `<p class="aht-card__text" id="${id}-text"></p>` +
      `<p class="aht-card__hint">${TAP}<span></span></p>` +
      '<div class="aht-card__foot"><span class="aht-card__dots" aria-hidden="true"></span>' +
      '<button class="aht-btn" type="button" data-aht="prev">Back</button>' +
      '<button class="aht-btn aht-btn--primary" type="button" data-aht="next">Next</button></div>' +
      `<button class="aht-card__close" type="button" data-aht="end" aria-label="End tour">${X}</button>`;
    root.append(spot, card);

    const $ = (s) => card.querySelector(s);
    const dots = $('.aht-card__dots');
    dots.innerHTML = steps.map(() => '<i></i>').join('');
    const prevBtn = $('[data-aht="prev"]');
    const nextBtn = $('[data-aht="next"]');

    let index = -1, target = null, open = false, lastFocus = null, still = false;

    const resolve = (s) => (typeof s.target === 'string' ? root.querySelector(s.target) : s.target);

    function radiusFor(t) {
      const r = t.getBoundingClientRect();
      const br = parseFloat(getComputedStyle(t).borderTopLeftRadius) || 0;
      const pad = parseFloat(getComputedStyle(root).getPropertyValue('--aht-pad')) || 6;
      return `${Math.min(br, r.height / 2) + pad}px`;
    }

    function fill(n) {
      const s = steps[n];
      $('.aht-card__count').textContent = `Step ${n + 1} of ${steps.length}`;
      $('.aht-card__title').textContent = s.title;
      $('.aht-card__text').textContent = s.text;
      const hint = $('.aht-card__hint');
      hint.hidden = !s.hint;
      hint.querySelector('span').textContent = s.hint || '';
      [...dots.children].forEach((d, i) => d.classList.toggle('is-on', i === n));
      prevBtn.disabled = n === 0;
      nextBtn.textContent = n === steps.length - 1 ? 'Done' : 'Next';
    }

    function setTarget(t) {
      if (target) {
        target.style.removeProperty('anchor-name');
        if (target.getAttribute('aria-describedby') === `${id}-text`) target.removeAttribute('aria-describedby');
      }
      target = t;
      if (!t) return;
      t.style.setProperty('anchor-name', '--aht-target');
      if (!t.hasAttribute('aria-describedby')) t.setAttribute('aria-describedby', `${id}-text`);
      spot.style.setProperty('--aht-r', radiusFor(t));
    }

    // --- placement without anchor positioning: the same spot insets and card areas, computed ---
    function box(el) {
      const r = el.getBoundingClientRect(), o = root.getBoundingClientRect();
      const x = o.left + root.clientLeft, y = o.top + root.clientTop;
      return { l: r.left - x, t: r.top - y, r: r.right - x, b: r.bottom - y, w: r.width, h: r.height };
    }
    function placeByHand() {
      if (ANCHORS || !target) return;
      const a = box(target), pad = parseFloat(getComputedStyle(root).getPropertyValue('--aht-pad')) || 6;
      const W = root.clientWidth, H = root.clientHeight;
      Object.assign(spot.style, { top: `${a.t - pad}px`, left: `${a.l - pad}px`, right: `${W - a.r - pad}px`, bottom: `${H - a.b - pad}px` });
      const cw = card.offsetWidth, ch = card.offsetHeight, m = 14, e = 12;
      const cx = a.l + a.w / 2 - cw / 2, cy = a.t + a.h / 2 - ch / 2;
      const tries = [
        [cx, a.b + m], [a.l, a.b + m], [a.r - cw, a.b + m],
        [cx, a.t - m - ch], [a.l, a.t - m - ch], [a.r - cw, a.t - m - ch],
        [a.r + m, cy], [a.l - m - cw, cy]
      ];
      const fits = ([x, y]) => x >= e && y >= e && x + cw <= W - e && y + ch <= H - e;
      const [x, y] = tries.find(fits) || tries[0];
      Object.assign(card.style, { margin: '0', top: `${y}px`, left: `${x}px` });
    }

    // arrow side and offset, read from where the card actually landed
    function aim() {
      if (!target || card.hidden) return;
      const c = card.getBoundingClientRect(), t = target.getBoundingClientRect();
      let side;
      if (c.top >= t.bottom - 1) side = 'bottom';
      else if (c.bottom <= t.top + 1) side = 'top';
      else if (c.left >= t.right - 1) side = 'right';
      else side = 'left';
      card.dataset.side = side;
      const along = side === 'bottom' || side === 'top'
        ? Math.min(Math.max(t.left + t.width / 2 - c.left, 18), c.width - 18)
        : Math.min(Math.max(t.top + t.height / 2 - c.top, 18), c.height - 18);
      card.style.setProperty('--aht-arrow', `${along}px`);
    }
    const layout = () => { placeByHand(); aim(); };

    function apply(n) {
      const t = resolve(steps[n]);
      index = n;
      setTarget(t);
      fill(n);
      layout();
    }

    function go(n) {
      if (n < 0 || n >= steps.length) return;
      if (!resolve(steps[n])) return go(n + (n > index ? 1 : -1));
      resolve(steps[n]).scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      if (!open) return begin(n);
      const hop = document.startViewTransition && !reduce.matches && !still;
      if (hop) {
        const html = document.documentElement;
        html.classList.add('aht-hopping');
        const vt = document.startViewTransition(() => apply(n));
        vt.finished.finally(() => { html.classList.remove('aht-hopping'); aim(); });
      } else {
        apply(n);
      }
      card.focus({ preventScroll: true });
    }

    function begin(n) {
      open = true;
      lastFocus = document.activeElement;
      root.classList.add('aht-on');
      spot.hidden = false;
      card.hidden = false;
      apply(n);
      if (still) spot.classList.remove('is-full', 'is-out');
      else {
        spot.getBoundingClientRect(); // commit the full-frame start before the iris closes in
        requestAnimationFrame(() => { spot.classList.remove('is-full', 'is-out'); });
      }
      requestAnimationFrame(aim);
      card.focus({ preventScroll: true });
      document.addEventListener('keydown', onKey, true);
      document.addEventListener('click', onClick, true);
      addEventListener('resize', layout);
      ro.observe(root);
    }

    function end(reason = 'skip') {
      if (!open) return;
      open = false;
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('click', onClick, true);
      removeEventListener('resize', layout);
      ro.disconnect();
      spot.classList.add('is-full', 'is-out');
      const done = () => { if (!open) { spot.hidden = true; setTarget(null); root.classList.remove('aht-on'); } };
      reduce.matches ? done() : setTimeout(done, 580);
      const hadFocus = card.contains(document.activeElement);
      card.hidden = true;
      const back = opts.returnFocus || lastFocus;
      if (hadFocus && back && back.isConnected) back.focus({ preventScroll: true });
      opts.onEnd?.(reason, index);
    }

    const next = () => (index >= steps.length - 1 ? end('done') : go(index + 1));
    const prev = () => go(index - 1);

    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); end('escape'); return; }
      if (!card.contains(document.activeElement)) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
    }

    // the highlighted control works as itself and moves the tour on; a click anywhere else ends the tour
    function onClick(e) {
      if (card.contains(e.target)) return;
      if (target && target.contains(e.target)) {
        const at = index;
        setTimeout(() => { if (open && index === at) next(); }, 0);
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      end('outside');
    }

    card.addEventListener('click', (e) => {
      const act = e.target.closest('[data-aht]')?.dataset.aht;
      if (act === 'next') next();
      else if (act === 'prev') prev();
      else if (act === 'end') end('skip');
    });

    const ro = new ResizeObserver(() => layout());

    return {
      start: (n = 0) => { if (open) go(n); else go(n); },
      next, prev, end,
      // a static frame for posters: no iris, no hop
      freeze(on = true) { still = on; root.classList.toggle('is-still', on); },
      get index() { return index; },
      get open() { return open; }
    };
  }

  global.anchorTour = anchorTour;
})(window);
