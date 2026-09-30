// Snap Sheet: a bottom sheet whose drag is native scrolling. Three snap points in a scroll container are the detents;
// the script reads scrollTop and shapes the card from it. Touch and trackpad need no code at all; a mouse drag is
// translated into scrollTop by hand, because desktop browsers don't drag-scroll.
// Usage: const sheet = snapSheet(document.querySelector('.ss'));  sheet.goTo('half');

const ORDER = ['peek', 'half', 'full'];
const INSET = 8;          // px gap under the floating card; melts to 0 on the way to full
const FLING_MS = 220;     // a mouse release projects its velocity this far ahead to pick the detent
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);

export function snapSheet(root, { peek = 156, top = 62, half = 0.52 } = {}) {
  const host = root.parentElement;
  const sc = root.querySelector('.ss__scroller');
  const card = root.querySelector('.ss__card');
  const head = root.querySelector('.ss__head');
  const body = root.querySelector('.ss__body');
  const grab = root.querySelector('.ss__grabber');
  const marks = Object.fromEntries(ORDER.map((d) => [d, root.querySelector(`.ss__snap[data-snap="${d}"]`)]));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let detent = ORDER.includes(root.dataset.detent) ? root.dataset.detent : 'peek';
  let pos = { peek: 0, half: 0, full: 0 };
  let P = peek;
  let frame = 0;
  let frozen = null;

  // ---------- geometry ----------
  function layout() {
    const H = sc.clientHeight;
    const W = sc.clientWidth;
    P = Math.min(peek, Math.round(H * 0.36));
    const T = Math.min(top, Math.round(H * 0.12));
    pos = { peek: 0, half: Math.max(1, Math.round(H * half) - P), full: H - T - P };
    host.style.setProperty('--ss-H', `${H}px`);
    host.style.setProperty('--ss-W', `${W}px`);
    host.style.setProperty('--ss-P', `${P}px`);
    host.style.setProperty('--ss-top', `${T}px`);
    for (const d of ORDER) marks[d].style.top = `${pos[d]}px`;
    sc.scrollTop = frozen === null ? pos[detent] : at(frozen);
    paint();
  }

  function paint() {
    frame = 0;
    const s = sc.scrollTop;
    const k = clamp(s / pos.half, 0, 1);
    const e = clamp((s - pos.half) / (pos.full - pos.half), 0, 1);
    host.style.setProperty('--ss-k', k.toFixed(4));
    host.style.setProperty('--ss-e', e.toFixed(4));
    host.style.setProperty('--ss-vis', `${(P + s - INSET * (1 - e)).toFixed(1)}px`);
    // leaving full locks the inside again, so the next drag moves the sheet
    if (detent === 'full' && s < pos.full - 1) setDetent(nearest(s));
  }

  // 0 = peek, 1 = half, 2 = full, and anything in between
  const at = (v) => {
    const i = Math.floor(clamp(v, 0, 1.999));
    return pos[ORDER[i]] + (pos[ORDER[i + 1]] - pos[ORDER[i]]) * (clamp(v, 0, 2) - i);
  };
  const nearest = (s) => ORDER.reduce((a, b) => (Math.abs(pos[b] - s) < Math.abs(pos[a] - s) ? b : a));

  function setDetent(d) {
    if (d === detent) return;
    detent = d;
    root.dataset.detent = d;
    if (d !== 'full') body.scrollTop = 0;
    const i = ORDER.indexOf(d);
    grab.setAttribute('aria-label', `Sheet: ${d === 'peek' ? 'small' : d === 'half' ? 'half height' : 'full height'}. ${i < 2 ? 'Expand' : 'Collapse'} it.`);
    root.dispatchEvent(new CustomEvent('detentchange', { detail: { detent: d } }));
  }

  function goTo(d) {
    if (!ORDER.includes(d)) return;
    sc.scrollTo({ top: pos[d], behavior: reduced.matches ? 'auto' : 'smooth' });
  }

  sc.addEventListener('scroll', () => { frame ||= requestAnimationFrame(paint); }, { passive: true });
  // the detent is decided when scrolling stops; Safari without scrollend gets a short quiet period instead
  let quiet = 0;
  const settle = () => setDetent(nearest(sc.scrollTop));
  if ('onscrollend' in window) sc.addEventListener('scrollend', settle);
  else sc.addEventListener('scroll', () => { clearTimeout(quiet); quiet = setTimeout(settle, 140); }, { passive: true });

  new ResizeObserver(layout).observe(sc);
  root.dataset.detent = detent;
  grab.setAttribute('aria-label', 'Sheet: small. Expand it.');
  layout();

  // ---------- mouse drag (touch and wheel are native) ----------
  let drag = null;
  let clickGuard = 0;
  card.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    if (e.target.closest('a, input, textarea, select, label, button:not(.ss__grabber)')) return;
    if (detent === 'full' && body.contains(e.target) && body.scrollTop > 0) return; // the inside scrolls first
    drag = { id: e.pointerId, y0: e.clientY, s0: sc.scrollTop, moved: false, pts: [[e.timeStamp, e.clientY]] };
    // follow the pointer on the window: a quick drag leaves the card before capture is taken
    addEventListener('pointermove', move);
    addEventListener('pointerup', release);
    addEventListener('pointercancel', release);
  });
  const move = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dy = e.clientY - drag.y0;
    if (!drag.moved) {
      if (Math.abs(dy) < 4) return;
      drag.moved = true;
      card.setPointerCapture(e.pointerId);
      root.classList.add('is-dragging');
      getSelection()?.removeAllRanges();
    }
    sc.scrollTop = clamp(drag.s0 - dy, 0, pos.full);
    drag.pts.push([e.timeStamp, e.clientY]);
    if (drag.pts.length > 6) drag.pts.shift();
  };
  const release = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    removeEventListener('pointermove', move);
    removeEventListener('pointerup', release);
    removeEventListener('pointercancel', release);
    if (!d.moved) return;
    clickGuard = performance.now() + 60;
    const [t1, y1] = d.pts[d.pts.length - 1];
    const [t0, y0] = d.pts.find(([t]) => t >= t1 - 100); // only the last 100 ms count: a pause kills the fling
    const v = t1 > t0 ? (y0 - y1) / (t1 - t0) : 0; // px per ms, positive when the hand moves up
    const target = pos[nearest(sc.scrollTop + v * FLING_MS)];
    const done = () => root.classList.remove('is-dragging');
    if (Math.abs(sc.scrollTop - target) < 1) return done();
    sc.scrollTo({ top: target, behavior: reduced.matches ? 'auto' : 'smooth' });
    // put snapping back once the glide lands, or it would jump to the nearest point at once
    const land = () => { clearTimeout(fallback); sc.removeEventListener('scrollend', land); done(); };
    const fallback = setTimeout(land, 700);
    sc.addEventListener('scrollend', land);
  };

  // ---------- taps and keys ----------
  grab.addEventListener('click', (e) => {
    e.stopPropagation();
    if (performance.now() < clickGuard) return;
    goTo(detent === 'full' ? 'peek' : ORDER[ORDER.indexOf(detent) + 1]);
  });
  grab.addEventListener('keydown', (e) => {
    const step = { ArrowUp: 1, ArrowDown: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    goTo(ORDER[clamp(ORDER.indexOf(detent) + step, 0, 2)]);
  });
  card.addEventListener('click', (e) => {
    if (performance.now() < clickGuard || detent !== 'peek') return;
    if (head.contains(e.target) && !e.target.closest('a, button, input')) goTo('half');
  });
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && detent !== 'peek') {
      e.preventDefault();
      goTo(ORDER[ORDER.indexOf(detent) - 1]);
    }
  });

  return {
    goTo,
    get detent() { return detent; },
    // a frozen in-between state, for posters and tests: 0 = peek, 1 = half, 2 = full
    freeze(v) {
      frozen = v;
      root.classList.add('is-dragging');
      sc.scrollTop = at(v);
      paint();
    }
  };
}
