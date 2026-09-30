/* Scrub KPI Sparkline — the big number is the tooltip.
   Moving along the line rolls the headline, digit by digit, to the value on that day; the meta line says how far that
   is from today and when it was. Letting go rolls back. Mouse and pen scrub on hover, touch after a long press,
   the keyboard with arrows. SVG, no library; work happens only on input. */

const SVG = 'http://www.w3.org/2000/svg';
const LONG_PRESS_MS = 320;
const PRESS_SLOP = 8; // px a finger may wander before the long press counts as a scroll instead
const PAD_X = 6;
const PAD_Y = 10;

/** A number whose digits roll like an odometer. Same shape (length, commas) → the columns roll; otherwise rebuilt. */
export function digitRoller(el) {
  let shape = '';
  let cols = [];
  const calm = matchMedia('(prefers-reduced-motion: reduce)');

  function build(str) {
    el.replaceChildren();
    cols = [];
    let n = 0;
    for (const ch of str) {
      if (ch >= '0' && ch <= '9') {
        const col = document.createElement('span');
        col.className = 'roll';
        const strip = document.createElement('span');
        strip.className = 'roll__strip';
        for (let d = 0; d < 10; d++) {
          const s = document.createElement('span');
          s.textContent = String(d);
          strip.append(s);
        }
        col.style.setProperty('--i', String(n++));
        col.append(strip);
        el.append(col);
        cols.push(strip);
      } else {
        const s = document.createElement('span');
        s.className = 'roll__sym';
        s.textContent = ch;
        el.append(s);
        cols.push(null);
      }
    }
  }

  return {
    set(str, { instant = false } = {}) {
      const next = str.replace(/\d/g, '0');
      const rebuild = next !== shape;
      if (rebuild) { build(str); shape = next; }
      el.classList.toggle('is-instant', rebuild || instant || calm.matches);
      [...str].forEach((ch, i) => { if (cols[i]) cols[i].style.setProperty('--d', ch); });
      if (rebuild || instant) void el.offsetWidth; // commit the jump before transitions come back
      el.classList.toggle('is-instant', calm.matches);
    }
  };
}

const el = (name, attrs = {}) => {
  const n = document.createElementNS(SVG, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};

/**
 * scrubKpi(root, { points, format, formatDelta, formatDate, restLabel })
 *   points — [{ date: Date, value: number }] oldest first; the last one is "today".
 *   Returns { setPoints(points, restLabel), scrubTo(i), release() }.
 */
export function scrubKpi(root, opts) {
  const $ = (s) => root.querySelector(s);
  const chart = $('.kpi__chart');
  const roller = digitRoller($('.kpi__digits'));
  const sr = $('.kpi__sr');
  const deltaEl = $('.kpi__delta');
  const contextEl = $('.kpi__context');
  const dateEl = $('.kpi__date');
  const axis = [...root.querySelectorAll('.kpi__axis span')];
  const { format, formatDelta, formatDate } = opts;

  const svg = el('svg', { class: 'kpi__svg', 'aria-hidden': 'true' });
  const uid = `kpi${Math.random().toString(36).slice(2, 8)}`;
  const defs = el('defs');
  const clipPast = el('clipPath', { id: `${uid}-past` });
  const clipFuture = el('clipPath', { id: `${uid}-future` });
  const rPast = el('rect', { x: 0, y: 0, height: '100%' });
  const rFuture = el('rect', { y: 0, height: '100%' });
  clipPast.append(rPast);
  clipFuture.append(rFuture);
  defs.append(clipPast, clipFuture);
  const area = el('path', { class: 'kpi__area', 'clip-path': `url(#${uid}-past)` });
  const lineDim = el('path', { class: 'kpi__line kpi__line--dim', 'clip-path': `url(#${uid}-future)` });
  const line = el('path', { class: 'kpi__line', 'clip-path': `url(#${uid}-past)` });
  const today = el('line', { class: 'kpi__today' });
  const hair = el('line', { class: 'kpi__hair' });
  const dot = el('circle', { class: 'kpi__dot', r: 4.5 });
  svg.append(defs, area, today, lineDim, line, hair, dot);
  chart.append(svg);

  let points = [];
  let xs = [];
  let ys = [];
  let w = 0;
  let h = 0;
  let current = -1; // scrubbed index, -1 = resting on today
  let restLabel = opts.restLabel ?? '';
  let raf = 0;
  let want = -1;

  function layout() {
    const r = chart.getBoundingClientRect();
    w = r.width;
    h = r.height;
    if (!w || !h || !points.length) return;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of points) { lo = Math.min(lo, p.value); hi = Math.max(hi, p.value); }
    const span = hi - lo || 1;
    const n = points.length - 1 || 1;
    xs = points.map((_, i) => PAD_X + (i / n) * (w - 2 * PAD_X));
    ys = points.map((p) => PAD_Y + (1 - (p.value - lo) / span) * (h - 2 * PAD_Y));
    const d = xs.map((x, i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${ys[i].toFixed(1)}`).join('');
    line.setAttribute('d', d);
    lineDim.setAttribute('d', d);
    area.setAttribute('d', `${d}L${xs[xs.length - 1].toFixed(1)} ${h}L${xs[0].toFixed(1)} ${h}Z`);
    const ty = ys[ys.length - 1];
    today.setAttribute('x1', 0); today.setAttribute('x2', w);
    today.setAttribute('y1', ty); today.setAttribute('y2', ty);
    hair.setAttribute('y1', 0); hair.setAttribute('y2', h);
    draw(current, true);
  }

  function draw(i, instant = false) {
    if (!points.length) return;
    const last = points.length - 1;
    const on = i >= 0;
    const k = on ? i : last;
    const x = xs[k] ?? w;
    rPast.setAttribute('width', Math.max(0, on ? x : w));
    rFuture.setAttribute('x', on ? x : w);
    rFuture.setAttribute('width', Math.max(0, w - (on ? x : w)));
    hair.setAttribute('x1', x);
    hair.setAttribute('x2', x);
    dot.setAttribute('cx', x);
    dot.setAttribute('cy', ys[k] ?? 0);
    root.dataset.scrubbing = String(on);

    const p = points[k];
    const now = points[last];
    roller.set(format(p.value), { instant });
    if (on && k !== last) {
      const diff = p.value - now.value;
      deltaEl.textContent = formatDelta(diff, diff / now.value);
      deltaEl.dataset.sign = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
      contextEl.textContent = 'vs today';
    } else {
      const first = points[0];
      const diff = now.value - first.value;
      deltaEl.textContent = formatDelta(diff, diff / first.value);
      deltaEl.dataset.sign = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
      contextEl.textContent = restLabel;
    }
    dateEl.textContent = formatDate(p.date, on && k !== last ? 'past' : 'today');
    chart.setAttribute('aria-valuenow', String(k));
    chart.setAttribute('aria-valuetext', `${formatDate(p.date, 'full')}: ${format(p.value)}${on && k !== last ? `, ${deltaEl.textContent} vs today` : ''}`);
  }

  // coalesce input into one draw per frame; nothing runs between inputs
  function scrubTo(i) {
    want = Math.max(0, Math.min(points.length - 1, i));
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      if (want === current) return;
      current = want;
      draw(current);
    });
  }
  function release() {
    cancelAnimationFrame(raf);
    raf = 0;
    want = -1;
    if (current === -1) return;
    current = -1;
    draw(-1);
  }
  const indexAt = (clientX) => {
    const r = chart.getBoundingClientRect();
    const t = (clientX - r.left - PAD_X) / (r.width - 2 * PAD_X);
    return Math.round(Math.max(0, Math.min(1, t)) * (points.length - 1));
  };

  // mouse and pen: hover scrubs. touch: a long press, then slide.
  let press = null;
  chart.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') { scrubTo(indexAt(e.clientX)); return; }
    press = { id: e.pointerId, x: e.clientX, y: e.clientY, live: false };
    press.timer = setTimeout(() => {
      if (!press) return;
      press.live = true;
      chart.setPointerCapture(press.id);
      navigator.vibrate?.(8);
      scrubTo(indexAt(press.x));
    }, LONG_PRESS_MS);
  });
  chart.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'touch') { scrubTo(indexAt(e.clientX)); return; }
    if (!press || e.pointerId !== press.id) return;
    if (press.live) scrubTo(indexAt(e.clientX));
    else if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > PRESS_SLOP) { clearTimeout(press.timer); press = null; }
    else { press.x = e.clientX; }
  });
  const endPress = (e) => {
    if (e.pointerType !== 'touch') return;
    if (press) clearTimeout(press.timer);
    press = null;
    release();
  };
  chart.addEventListener('pointerup', endPress);
  chart.addEventListener('pointercancel', endPress);
  chart.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch') release(); });
  // while a finger scrubs, the page must not scroll under it
  chart.addEventListener('touchmove', (e) => { if (press?.live) e.preventDefault(); }, { passive: false });
  chart.addEventListener('contextmenu', (e) => { if (press) e.preventDefault(); });

  chart.addEventListener('keydown', (e) => {
    const last = points.length - 1;
    const at = current < 0 ? last : current;
    const step = { ArrowLeft: -1, ArrowRight: 1, PageUp: -30, PageDown: 30 }[e.key];
    if (step !== undefined) scrubTo(at + step * (e.shiftKey ? 7 : 1));
    else if (e.key === 'Home') scrubTo(0);
    else if (e.key === 'End') scrubTo(last);
    else if (e.key === 'Escape') release();
    else return;
    e.preventDefault();
  });
  chart.addEventListener('blur', release);

  // redraw only when the size really changed (the first notification repeats the size we already drew)
  new ResizeObserver(() => {
    const r = chart.getBoundingClientRect();
    if (Math.abs(r.width - w) > 0.5 || Math.abs(r.height - h) > 0.5) layout();
  }).observe(chart);

  const api = {
    setPoints(next, label) {
      if (!next?.length) return;
      points = next;
      restLabel = label ?? restLabel;
      current = -1;
      chart.setAttribute('aria-valuemin', '0');
      chart.setAttribute('aria-valuemax', String(points.length - 1));
      sr.textContent = format(points[points.length - 1].value);
      if (axis[0]) axis[0].textContent = formatDate(points[0].date, 'axis');
      if (axis[1]) axis[1].textContent = formatDate(points[points.length - 1].date, 'axis');
      layout();
    },
    scrubTo(i) { current = i; draw(i, true); },
    release
  };
  api.setPoints(opts.points, restLabel);
  return api;
}
