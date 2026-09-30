/* Thumb-Aware Layout — guesses which thumb holds the phone and tells CSS.

   Evidence, from touch only (a mouse is not a thumb):
   · taps — where on the screen they land, and for small targets how far off-centre: the pad of a right thumb touches
     a little right of the point the person aims at, a left thumb a little left;
   · vertical swipes — a thumb pivots at its base in the bottom corner, so its path is an arc: it bulges away from the
     holding side and drifts towards it going up.
   Each gesture gives a vote e in −1…1 (left…right) with a weight w. The last `window` gestures add up as log-odds:
   P(right) = 1 / (1 + exp(−gain · Σ w·e)). The side flips only when P passes `switchAt` for the other side, so one odd
   tap never moves the layout.

   Output on the root: --hand: left | right, --hand-sign: −1 | 1, data-hand, data-hand-confidence (0…1), and a
   "handchange" event. setOverride('left' | 'right' | 'auto') pins it by hand.

   const hand = thumbAware(root, { move: '.ta-thumb-row > *, .ta-fab', onUpdate(state) {} });
   hand.observeTap(x, y, targetElement)  // feed gestures yourself (tests, a simulator); coordinates are client px
   hand.observeSwipe([{ x, y }, …])
   hand.state.recent lists the gestures that count ({ kind, x, y | pts, e, w }, root-relative px) — enough to draw them.
   reach(surface, { handle, button }) — pulling the handle down slides the surface down so the top half is in reach. */

const TARGETS = 'button, a[href], input, select, label, [role="button"], [role="checkbox"], [role="switch"], [data-thumb-target]';
const clamp = (v, a = -1, b = 1) => Math.min(b, Math.max(a, v));

export function thumbAware(root, options = {}) {
  const o = {
    window: 10,        // gestures that count
    switchAt: 0.85,    // P needed to move the layout to that side
    minGestures: 3,    // …and at least this many
    gain: 1.1,
    initial: 'right',  // until there is evidence
    listen: true,      // read real touches on the root
    move: null,        // elements (or a selector) that glide to their new place when the side changes
    onUpdate: () => {},
    ...options
  };
  const log = [];
  let inferred = o.initial, hand = null, override = 'auto', pRight = 0.5;

  const box = () => root.getBoundingClientRect();

  function tapVote(x, y, target) {
    const r = box();
    const across = clamp(((x - r.left) / r.width) * 2 - 1); // −1 left edge … 1 right edge
    const t = target?.closest?.(TARGETS)?.getBoundingClientRect();
    if (t && t.width <= 160 && t.height <= 120) {
      const off = clamp((x - (t.left + t.width / 2)) / Math.max(10, t.width / 2) * 1.6);
      return { e: 0.65 * off + 0.35 * across * 0.6, w: 0.8 };
    }
    return { e: 0.45 * across, w: 0.5 };
  }

  function swipeVote(pts) {
    if (pts.length < 5) return null;
    const a = pts[0], b = pts[pts.length - 1];
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
    if (len < 60 || Math.abs(dy) < Math.abs(dx) * 0.8) return null; // scrolls, not sideways swipes, carry the arc
    let sum = 0, n = 0;
    for (const p of pts) {
      const t = (p.y - a.y) / dy;
      if (t < 0.2 || t > 0.8) continue;
      sum += p.x - (a.x + dx * t); // how far the path is from its chord, sideways
      n++;
    }
    const bulge = n ? sum / n : 0;
    const arc = clamp(-bulge / (0.045 * len)); // a right thumb's arc bulges left
    const drift = clamp((-dx / dy) * 1.5);     // …and drifts right going up, left going down
    return { e: 0.65 * arc + 0.35 * drift, w: 1.2 };
  }

  function add(entry) {
    log.push(entry);
    if (log.length > o.window * 3) log.splice(0, log.length - o.window * 3);
    update();
  }

  function update() {
    const recent = log.slice(-o.window);
    const logit = recent.reduce((s, g) => s + o.gain * g.w * g.e, 0);
    pRight = 1 / (1 + Math.exp(-logit));
    if (recent.length >= o.minGestures) {
      if (pRight >= o.switchAt) inferred = 'right';
      else if (pRight <= 1 - o.switchAt) inferred = 'left';
    }
    apply(override === 'auto' ? inferred : override);
    o.onUpdate(state());
  }

  function apply(next) {
    const write = () => {
      root.style.setProperty('--hand', next);
      root.style.setProperty('--hand-sign', next === 'left' ? -1 : 1);
      root.dataset.hand = next;
      root.dataset.handConfidence = Math.abs(pRight * 2 - 1).toFixed(2);
    };
    if (next === hand) return write();
    const first = hand === null;
    hand = next;
    const els = typeof o.move === 'string' ? [...root.querySelectorAll(o.move)] : o.move ?? [];
    if (!first && els.length) flip(els, write); else write();
    if (!first) root.dispatchEvent(new CustomEvent('handchange', { detail: state() }));
  }

  const state = () => ({
    hand, inferred, override, pRight,
    confidence: Math.abs(pRight * 2 - 1),
    gestures: Math.min(log.length, o.window),
    recent: log.slice(-o.window)
  });

  /* real touches: Touch Events keep arriving while the page scrolls natively, pointer events would be cancelled */
  const live = new Map();
  if (o.listen) {
    root.addEventListener('touchstart', (e) => {
      for (const t of e.changedTouches) live.set(t.identifier, { target: e.target, pts: [{ x: t.clientX, y: t.clientY }] });
    }, { passive: true, capture: true });
    root.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        const g = live.get(t.identifier);
        const last = g?.pts[g.pts.length - 1];
        if (last && Math.hypot(t.clientX - last.x, t.clientY - last.y) >= 4) g.pts.push({ x: t.clientX, y: t.clientY });
      }
    }, { passive: true, capture: true });
    const end = (e) => {
      for (const t of e.changedTouches) {
        const g = live.get(t.identifier);
        live.delete(t.identifier);
        if (!g || e.type === 'touchcancel') continue;
        const a = g.pts[0];
        if (Math.hypot(t.clientX - a.x, t.clientY - a.y) < 12) observeTap(t.clientX, t.clientY, g.target);
        else observeSwipe(g.pts);
      }
    };
    root.addEventListener('touchend', end, { passive: true, capture: true });
    root.addEventListener('touchcancel', end, { passive: true, capture: true });
  }

  // gestures come in client px; the log keeps them relative to the root, ready to draw
  function observeTap(x, y, target = document.elementFromPoint(x, y)) {
    const r = box();
    add({ kind: 'tap', x: x - r.left, y: y - r.top, ...tapVote(x, y, target) });
  }
  function observeSwipe(pts) {
    const v = swipeVote(pts);
    const r = box();
    if (v) add({ kind: 'swipe', pts: pts.map((p) => ({ x: p.x - r.left, y: p.y - r.top })), ...v });
  }
  function setOverride(side) {
    override = side === 'left' || side === 'right' ? side : 'auto';
    update();
  }
  function reset() {
    log.length = 0;
    inferred = o.initial;
    update();
  }

  apply(o.initial);
  return { observeTap, observeSwipe, setOverride, reset, get state() { return state(); } };
}

/* Reachability: pull the handle down and the surface follows; let go past 56 px (or flick) and it stays down by
   `amount` of its height, so the top half sits where the thumb is. The button toggles it from a keyboard; the
   uncovered gap, a pull back up or Esc return it. */
export function reach(surface, { handle, button = handle, gap = null, amount = 0.4, onChange = () => {} } = {}) {
  let open = false, drag = null, suppress = false;
  const max = () => surface.clientHeight * amount;

  function set(next) {
    open = next;
    surface.style.removeProperty('translate');
    surface.classList.remove('is-reach-dragging');
    surface.style.setProperty('--reach-offset', `${max().toFixed(0)}px`);
    surface.classList.toggle('is-reached', open);
    button.setAttribute('aria-expanded', String(open));
    if (gap) gap.hidden = !open;
    onChange(open);
  }

  handle.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    drag = { id: e.pointerId, y0: e.clientY, x0: e.clientX, from: open ? max() : 0, moved: false, last: [e.timeStamp, e.clientY], v: 0 };
  });
  handle.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dy = e.clientY - drag.y0;
    if (!drag.moved) {
      if (Math.abs(dy) < 6 || Math.abs(dy) < Math.abs(e.clientX - drag.x0)) return;
      drag.moved = true;
      handle.setPointerCapture(e.pointerId);
      surface.classList.add('is-reach-dragging');
    }
    const m = max();
    let y = drag.from + dy;
    if (y > m) y = m + (y - m) * 0.25;        // resist past the stop
    if (y < 0) y = 0;
    surface.style.translate = `0 ${y.toFixed(1)}px`;
    const [t0, y0] = drag.last;
    if (e.timeStamp > t0) drag.v = (e.clientY - y0) / (e.timeStamp - t0);
    drag.last = [e.timeStamp, e.clientY];
  });
  const up = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    if (!d.moved) return;
    suppress = true;
    setTimeout(() => { suppress = false; }, 60);
    const travelled = e.clientY - d.y0;
    set(open ? !(travelled < -40 || d.v < -0.5) : travelled > 56 || d.v > 0.5);
  };
  handle.addEventListener('pointerup', up);
  handle.addEventListener('pointercancel', up);
  button.addEventListener('click', () => { if (!suppress) set(!open); });
  gap?.addEventListener('click', () => set(false));
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && open) set(false); });
  addEventListener('resize', () => { if (open) surface.style.setProperty('--reach-offset', `${max().toFixed(0)}px`); });

  set(false);
  return { get open() { return open; }, set };
}

/* Moves elements to their new places with a FLIP: measure, change the layout, animate from the old spot. */
export function flip(elements, change, { duration = 420, easing = 'cubic-bezier(0.32, 0.72, 0, 1)' } = {}) {
  const before = elements.map((el) => el.getBoundingClientRect());
  change();
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    for (const el of elements) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160 });
    return;
  }
  elements.forEach((el, i) => {
    const a = before[i], b = el.getBoundingClientRect();
    const dx = a.left - b.left, dy = a.top - b.top;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
    el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration, easing });
  });
}
