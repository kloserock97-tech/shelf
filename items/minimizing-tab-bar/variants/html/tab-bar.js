// Minimizing Tab Bar: collapses on a steady scroll down, comes back on a steady scroll up, scrubs tabs under a lens.
// Usage: const bar = minimizingTabBar(document.querySelector('.mtb'), { scroller: el });
//        nav.addEventListener('tabchange', (e) => show(e.detail.index));

const COLLAPSE_AFTER = 24; // px of unbroken downward scroll before the bar tucks away
const EXPAND_AFTER = 56;   // px of unbroken upward scroll before it comes back: harder to undo than to do
const TOP_ZONE = 64;       // never collapsed this close to the top
const SLOP = 6;            // px of sideways travel that turns a press into a scrub
const HOLD_MS = 260;       // a press held this long lifts the lens without moving
const EDGE_GIVE = 0.35;    // how far the lens follows the finger past the first and last tab

const clamp = (v, a, b) => Math.min(Math.max(v, a), b);

export function minimizingTabBar(nav, { scroller = document.scrollingElement } = {}) {
  const bar = nav.querySelector('.mtb__bar');
  const row = nav.querySelector('.mtb__tabs');
  const thumb = nav.querySelector('.mtb__thumb');
  const tabs = [...row.querySelectorAll('[role="tab"]')];
  const n = tabs.length;
  let index = Math.max(0, tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true'));
  let collapsed = nav.dataset.state === 'collapsed';
  let tw = 0;

  // The lens shows a copy of the row. The thumb is scaled up, so the copy under it reads magnified.
  const lensRow = document.createElement('div');
  lensRow.className = 'mtb__lensrow';
  lensRow.setAttribute('aria-hidden', 'true');
  const copies = tabs.map((t) => {
    const c = document.createElement('span');
    c.className = 'mtb__tab';
    c.innerHTML = t.innerHTML;
    lensRow.append(c);
    return c;
  });
  thumb.append(lensRow);

  nav.style.setProperty('--mtb-n', n);
  const measure = () => {
    const cs = getComputedStyle(nav);
    const side = parseFloat(cs.getPropertyValue('--mtb-side')) || 16;
    tw = (nav.clientWidth - 2 * side - 8) / n;
    nav.style.setProperty('--mtb-tw', `${tw}px`);
  };
  measure();
  new ResizeObserver(measure).observe(nav);

  // ---------- state ----------
  function setCollapsed(v) {
    if (v === collapsed || (v && scrubbing)) return;
    collapsed = v;
    nav.dataset.state = v ? 'collapsed' : 'expanded';
    nav.dispatchEvent(new CustomEvent('barstate', { detail: { collapsed: v } }));
  }

  function select(i, { focus = false } = {}) {
    i = clamp(i, 0, n - 1);
    tabs.forEach((t, k) => {
      t.setAttribute('aria-selected', String(k === i));
      t.tabIndex = k === i ? 0 : -1;
    });
    nav.style.setProperty('--mtb-i', i);
    if (focus) tabs[i].focus();
    const changed = i !== index;
    index = i;
    setCollapsed(false);
    if (changed) nav.dispatchEvent(new CustomEvent('tabchange', { detail: { index: i, tab: tabs[i] } }));
  }
  select(index);

  // ---------- scroll direction with hysteresis ----------
  let target = null;
  let lastY = 0;
  let run = 0; // signed distance scrolled without changing direction
  const readY = () => {
    const el = target === window ? document.scrollingElement : target;
    // iOS reports rubber-band overshoot outside 0…max; clamp it so the bounce isn't read as a direction change
    return clamp(el.scrollTop, 0, Math.max(0, el.scrollHeight - el.clientHeight));
  };
  function onScroll() {
    const y = readY();
    const dy = y - lastY;
    lastY = y;
    if (!dy) return;
    if (y < TOP_ZONE) {
      run = 0;
      setCollapsed(false);
      return;
    }
    if (dy > 0 !== run > 0) run = 0;
    run += dy;
    if (run > COLLAPSE_AFTER) setCollapsed(true);
    else if (run < -EXPAND_AFTER) setCollapsed(false);
  }
  function setScroller(el) {
    target?.removeEventListener('scroll', onScroll);
    target = !el || el === document.scrollingElement || el === document.documentElement ? window : el;
    target.addEventListener('scroll', onScroll, { passive: true });
    lastY = readY();
    run = 0;
    if (lastY < TOP_ZONE) setCollapsed(false);
  }
  setScroller(scroller);

  // ---------- scrubbing ----------
  let press = null;
  let scrubbing = false;
  let hot = index;
  let rect = null;
  let holdTimer = 0;
  let settleTimer = 0;
  let clickGuard = 0;

  function setHot(h) {
    if (h === hot) return;
    copies[hot]?.classList.remove('is-hot');
    hot = h;
    copies[hot].classList.add('is-hot');
    // a light tick where the platform has one; Chrome refuses (and logs) before the first tap on the frame
    if (navigator.vibrate && navigator.userActivation?.hasBeenActive !== false) navigator.vibrate(4);
  }

  function startScrub(clientX) {
    if (scrubbing || !press) return;
    scrubbing = true;
    clearTimeout(holdTimer);
    clearTimeout(settleTimer);
    try { bar.setPointerCapture(press.id); } catch { /* the pointer is already gone */ }
    rect = bar.getBoundingClientRect();
    copies.forEach((c) => c.classList.remove('is-hot'));
    hot = -1;
    nav.classList.remove('is-settling');
    nav.classList.add('is-lens', 'is-dragging');
    moveLens(clientX);
  }

  function moveLens(clientX) {
    const max = (n - 1) * tw;
    let x = clientX - rect.left - 4 - tw / 2;
    if (x < 0) x *= EDGE_GIVE;
    else if (x > max) x = max + (x - max) * EDGE_GIVE;
    thumb.style.translate = `${x}px 0`;
    lensRow.style.translate = `${-x}px 0`;
    setHot(clamp(Math.round(x / tw), 0, n - 1));
  }

  function endScrub(commit) {
    scrubbing = false;
    nav.classList.remove('is-dragging', 'is-lens');
    nav.classList.add('is-settling');
    // Drop the inline position in the same frame as the index changes: the thumb springs from the finger to the tab.
    thumb.style.translate = '';
    lensRow.style.translate = '';
    if (commit) select(hot, { focus: document.activeElement && nav.contains(document.activeElement) });
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => nav.classList.remove('is-settling'), 440);
    clickGuard = performance.now() + 80;
  }

  bar.addEventListener('pointerdown', (e) => {
    if (collapsed || e.button !== 0 || press) return;
    press = { id: e.pointerId, x: e.clientX };
    clearTimeout(holdTimer);
    holdTimer = setTimeout(() => press && startScrub(press.x), HOLD_MS);
  });
  bar.addEventListener('pointermove', (e) => {
    if (!press || e.pointerId !== press.id) return;
    if (!scrubbing) {
      if (Math.abs(e.clientX - press.x) < SLOP) return;
      startScrub(e.clientX);
    }
    moveLens(e.clientX);
  });
  const release = (commit) => (e) => {
    if (!press || e.pointerId !== press.id) return;
    clearTimeout(holdTimer);
    if (scrubbing) endScrub(commit);
    press = null;
  };
  bar.addEventListener('pointerup', release(true));
  bar.addEventListener('pointercancel', release(false));
  // Touch pointers start captured by the tab under the finger; moving the capture to the bar fires a lost capture on
  // that tab, which bubbles here. Only the bar's own loss ends a scrub.
  bar.addEventListener('lostpointercapture', (e) => e.target === bar && scrubbing && release(true)(e));

  // ---------- taps and keys ----------
  bar.addEventListener('click', (e) => {
    if (performance.now() < clickGuard) return;
    if (collapsed) {
      setCollapsed(false);
      return;
    }
    const t = e.target.closest('[role="tab"]');
    if (t) select(tabs.indexOf(t));
  });
  row.addEventListener('keydown', (e) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    let i = null;
    if (step) i = (index + step + n) % n;
    else if (e.key === 'Home') i = 0;
    else if (e.key === 'End') i = n - 1;
    if (i === null) return;
    e.preventDefault();
    select(i, { focus: true });
  });
  nav.addEventListener('focusin', () => setCollapsed(false));

  return {
    select: (i) => select(i),
    collapse: () => setCollapsed(true),
    expand: () => setCollapsed(false),
    setScroller,
    get index() { return index; },
    get collapsed() { return collapsed; }
  };
}
