/* Just-in-Time Hint — a coach mark that waits for a reason to appear.
   It counts slow paths (the same command picked from a menu again and again) and, at the threshold, points an
   anchored popover at the faster control. The hint goes away the moment the fast way is used; each hint shows once.
   Positioning is CSS anchor positioning with position-try fallbacks; where that is missing, the same order of
   placements is measured by hand. */

const ANCHORS = typeof CSS !== 'undefined' && CSS.supports('anchor-name: --a') && CSS.supports('position-area: bottom');
const POPOVERS = typeof HTMLElement !== 'undefined' && 'popover' in HTMLElement.prototype;
export const support = { anchors: ANCHORS, popovers: POPOVERS };

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

let seq = 0;
/** Ties a floating element to a control with a fresh anchor-name. */
export function anchor(pop, target) {
  if (!pop.dataset.anchor) pop.dataset.anchor = `--jit-anchor-${++seq}`;
  const name = pop.dataset.anchor;
  document.querySelectorAll(`[data-anchored="${name}"]`).forEach((el) => {
    if (el === target) return;
    el.style.removeProperty('anchor-name');
    delete el.dataset.anchored;
  });
  target.style.setProperty('anchor-name', name);
  target.dataset.anchored = name;
  pop.style.setProperty('position-anchor', name);
}

// The same order the CSS tries: centred below, below leaning right, below leaning left, then the same above.
const PLACES = {
  bottom: (a, w, h, g) => [a.left + a.width / 2 - w / 2, a.bottom + g],
  'bottom-start': (a, w, h, g) => [a.left, a.bottom + g],
  'bottom-end': (a, w, h, g) => [a.right - w, a.bottom + g],
  top: (a, w, h, g) => [a.left + a.width / 2 - w / 2, a.top - g - h],
  'top-start': (a, w, h, g) => [a.left, a.top - g - h],
  'top-end': (a, w, h, g) => [a.right - w, a.top - g - h]
};
export const HINT_ORDER = ['bottom', 'bottom-start', 'bottom-end', 'top', 'top-start', 'top-end'];

/** Fallback for browsers without anchor positioning: the first placement that fits, else the first one clamped. */
export function placeByHand(pop, target, order = HINT_ORDER, gap = 10) {
  const a = target.getBoundingClientRect();
  const w = pop.offsetWidth;
  const h = pop.offsetHeight;
  const m = 8;
  const fits = ([x, y]) => x >= m && y >= m && x + w <= innerWidth - m && y + h <= innerHeight - m;
  const tries = order.map((k) => PLACES[k](a, w, h, gap));
  const [x, y] = tries.find(fits) ?? tries[0];
  pop.style.left = `${clamp(x, m, innerWidth - w - m)}px`;
  pop.style.top = `${clamp(y, m, innerHeight - h - m)}px`;
}

/** Points the popover's arrow at the control, whichever side the browser picked. */
export function pointArrow(pop, target) {
  const a = target.getBoundingClientRect();
  const p = pop.getBoundingClientRect();
  pop.dataset.side = p.top + p.height / 2 > a.top + a.height / 2 ? 'bottom' : 'top';
  pop.style.setProperty('--jit-arrow-x', `${clamp(a.left + a.width / 2 - p.left, 18, p.width - 18)}px`);
}

/** Opens a floating element next to a control, with or without the Popover API and anchor positioning. */
export function openAt(pop, target, { order = HINT_ORDER, arrow = false } = {}) {
  anchor(pop, target);
  if (POPOVERS) { if (!pop.matches(':popover-open')) pop.showPopover(); }
  else { pop.hidden = false; pop.classList.add('is-open'); }
  if (!ANCHORS) placeByHand(pop, target, order);
  if (arrow) requestAnimationFrame(() => pointArrow(pop, target));
}

export function close(pop) {
  if (POPOVERS) { if (pop.matches(':popover-open')) pop.hidePopover(); }
  else { pop.hidden = true; pop.classList.remove('is-open'); }
}

function load(key) {
  try { return JSON.parse(localStorage.getItem(key)) ?? {}; } catch { return {}; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode: hints just repeat next visit */ }
}

/**
 * justInTimeHints({ pop, hints, threshold, storageKey, onChange })
 *   hints  — { [command]: { target, title, body, key } }; target is the faster control (element or selector).
 *   slow(command) — call when the command ran the long way (from a menu).
 *   fast(command) — call when it ran the short way (its button or key). Closes that hint as "used"; if the hint never
 *                   showed, the person already knows the way and the hint is retired.
 *   A hint shows at most once: its fate (shown / used / known) lives in localStorage under storageKey.
 */
export function justInTimeHints({ pop, hints, threshold = 3, storageKey = 'jit-hints', persist = true, delay = 450, onChange } = {}) {
  let seen = persist ? load(storageKey) : {};
  const slowCount = {};
  let current = null;
  let target = null;
  let timer = 0;
  let doneTimer = 0;

  const live = document.createElement('p');
  live.className = 'jit-sr';
  live.setAttribute('role', 'status');
  document.body.append(live);

  const $ = (s) => pop.querySelector(s);
  const resolve = (t) => (typeof t === 'string' ? document.querySelector(t) : t);
  const store = () => { if (persist) save(storageKey, seen); };
  const emit = () => onChange?.({ counts: { ...slowCount }, seen: { ...seen }, current, threshold });

  // keep the arrow on target while the page moves under it
  let raf = 0;
  const follow = () => {
    if (raf || !current) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      if (!current) return;
      if (!ANCHORS) placeByHand(pop, target);
      pointArrow(pop, target);
    });
  };

  function show(cmd) {
    const h = hints[cmd];
    target = resolve(h?.target);
    if (!h || !target?.isConnected || seen[cmd] || current) return;
    current = cmd;
    seen[cmd] = 'shown';
    store();
    $('.jit-pop__key').textContent = h.key;
    $('.jit-pop__title').textContent = h.title;
    $('.jit-pop__body').textContent = h.body;
    pop.dataset.done = 'false';
    pop.removeAttribute('data-side');
    target.classList.add('jit-beacon');
    target.setAttribute('aria-describedby', pop.id);
    openAt(pop, target, { arrow: true });
    live.textContent = `Tip: ${h.title}. ${h.body}`;
    addEventListener('resize', follow);
    addEventListener('scroll', follow, true);
    emit();
  }

  function hide() {
    if (!current) return;
    clearTimeout(doneTimer);
    close(pop);
    target?.classList.remove('jit-beacon');
    target?.removeAttribute('aria-describedby');
    removeEventListener('resize', follow);
    removeEventListener('scroll', follow, true);
    current = null;
    target = null;
    emit();
  }

  pop.querySelector('.jit-pop__close')?.addEventListener('click', hide);
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && current) hide(); });

  return {
    slow(cmd) {
      if (!seen[cmd]) {
        slowCount[cmd] = (slowCount[cmd] ?? 0) + 1;
        if (slowCount[cmd] >= threshold) {
          clearTimeout(timer);
          timer = setTimeout(() => show(cmd), delay); // after the menu has closed and the row has gone
        }
      }
      emit();
    },
    fast(cmd) {
      slowCount[cmd] = 0;
      if (current === cmd) {
        seen[cmd] = 'used';
        store();
        pop.dataset.done = 'true';
        live.textContent = 'Done. That is the fast way.';
        doneTimer = setTimeout(hide, 1100);
      } else if (!seen[cmd]) {
        seen[cmd] = 'known';
        store();
      }
      emit();
    },
    /** Show a hint now (demos, posters). */
    show,
    dismiss: hide,
    reset() {
      hide();
      clearTimeout(timer);
      seen = {};
      for (const k of Object.keys(slowCount)) delete slowCount[k];
      store();
      emit();
    },
    get state() { return { counts: { ...slowCount }, seen: { ...seen }, current, threshold }; }
  };
}
