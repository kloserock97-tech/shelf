/* HOP Forecast Chart — uncertainty shown two ways from the same simulated draws:
   a fan of 50/80/95% bands (quantiles across draws, week by week) and, on toggle, hypothetical outcome plots:
   one plausible future at a time, about three a second, switched without tweening so each frame reads as its own
   outcome. Hover or focus freezes a future; a slider keeps the last few as faint trails. SVG; a timer only while
   futures play and the chart is on screen. */

const SVG = 'http://www.w3.org/2000/svg';
const FRAME_MS = 333;
const MAX_TRAILS = 20;
const BANDS = [[0.025, 0.975], [0.1, 0.9], [0.25, 0.75]];
const M = { top: 22, right: 58, bottom: 28, left: 46 };

const make = (name, attrs = {}, parent) => {
  const n = document.createElementNS(SVG, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  parent?.append(n);
  return n;
};
const quantile = (sorted, a) => {
  const i = a * (sorted.length - 1);
  const lo = Math.floor(i);
  const hi = Math.min(sorted.length - 1, lo + 1);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
};
function niceStep(span, target = 4) {
  const raw = span / target;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const f = raw / pow;
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * pow;
}

/**
 * hopForecast(root, { history, dates, draws, events, format, formatDate, seedOrder })
 *   history — actual values, oldest first; dates — one Date per history point and forecast step, in order.
 *   draws   — simulated futures, each an array of the forecast steps (the same length for all).
 *   events  — [{ step, label }] marks in the forecast (step 1 = the first forecast week).
 */
export function hopForecast(root, opts) {
  const { history, dates, draws, events = [], format, formatDate } = opts;
  const H = history.length;
  const F = draws[0].length;
  const N = draws.length;
  const $ = (s) => root.querySelector(s);
  const plot = $('.hop__plot');
  const toggle = $('.hop__toggle');
  const trailsInput = $('.hop__trails input');
  const trailsOut = $('.hop__trails output');
  const playBtn = $('.hop__play');
  const live = $('.hop__live');
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // quantiles per forecast step; step 0 is the last actual value, where the fan starts
  const q = Array.from({ length: F + 1 }, (_, t) => {
    if (t === 0) return () => history[H - 1];
    const col = draws.map((d) => d[t - 1]).sort((a, b) => a - b);
    return (a) => quantile(col, a);
  });

  // a fixed shuffled order of draws, so the sequence never repeats a pattern the eye could learn
  const order = Array.from({ length: N }, (_, i) => i);
  const rnd = opts.random ?? Math.random;
  for (let i = N - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }

  const svg = make('svg', { class: 'hop__svg', 'aria-hidden': 'true' }, plot);
  const clipId = `hop${Math.random().toString(36).slice(2, 8)}`;
  const clipRect = make('rect', {}, make('clipPath', { id: clipId }, make('defs', {}, svg)));
  const gGrid = make('g', { class: 'hop__grid' }, svg);
  const gBands = make('g', { class: 'hop__bands' }, svg);
  const bandEls = BANDS.map((_, i) => make('path', { class: `hop__band hop__band--${i}` }, gBands));
  const median = make('path', { class: 'hop__median' }, svg);
  const gMarks = make('g', { class: 'hop__marks' }, svg);
  const actual = make('path', { class: 'hop__actual' }, svg);
  // the rare extreme future may leave the plot; it is clipped at the frame rather than squashing the scale
  const gFutures = make('g', { 'clip-path': `url(#${clipId})` }, svg);
  const gTrails = make('g', { class: 'hop__trails-g' }, gFutures);
  const trailEls = Array.from({ length: MAX_TRAILS }, () => make('path', { class: 'hop__trail' }, gTrails));
  const path = make('path', { class: 'hop__path' }, gFutures);
  const endDot = make('circle', { class: 'hop__end', r: 3.5 }, svg);
  const endLabel = make('text', { class: 'hop__end-label' }, svg);
  const counter = make('text', { class: 'hop__counter' }, svg);

  let W = 0;
  let Hpx = 0;
  let x = () => 0;
  let y = () => 0;
  let pos = 0;
  let timer = 0;
  let on = false;
  let paused = calm; // reduced motion: futures step by hand unless Play is pressed
  let frozen = false;
  let visible = true;
  let trails = Number(trailsInput?.value ?? 8);

  const line = (pts) => pts.map(([i, v], k) => `${k ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join('');
  const future = (d) => [[H - 1, history[H - 1]], ...d.map((v, t) => [H + t, v])];

  function layout() {
    const r = plot.getBoundingClientRect();
    if (!r.width || !r.height) return;
    W = r.width;
    Hpx = r.height;
    svg.setAttribute('viewBox', `0 0 ${W} ${Hpx}`);
    // the scale covers the actuals and 99% of the futures
    let lo = Math.min(...history, ...q.map((f) => f(0.005)));
    let hi = Math.max(...history, ...q.map((f) => f(0.995)));
    const step = niceStep(hi - lo);
    lo = Math.floor(lo / step) * step;
    hi = Math.ceil(hi / step) * step;
    const iw = W - M.left - M.right;
    const ih = Hpx - M.top - M.bottom;
    x = (i) => M.left + (i / (H + F - 1)) * iw;
    y = (v) => M.top + (1 - (v - lo) / (hi - lo)) * ih;
    clipRect.setAttribute('x', M.left - 4);
    clipRect.setAttribute('y', M.top - 4);
    clipRect.setAttribute('width', iw + 8);
    clipRect.setAttribute('height', ih + 8);

    // grid and axis labels
    gGrid.replaceChildren();
    for (let v = lo; v <= hi + 1e-9; v += step) {
      make('line', { x1: M.left, x2: W - M.right, y1: y(v), y2: y(v) }, gGrid);
      make('text', { x: M.left - 8, y: y(v), class: 'hop__ylab' }, gGrid).textContent = format(v);
    }
    let lastMonth = -1;
    dates.forEach((d, i) => {
      if (d.getMonth() === lastMonth) return;
      lastMonth = d.getMonth();
      if (x(i) > W - M.right - 16) return;
      make('text', { x: x(i), y: Hpx - 8, class: 'hop__xlab' }, gGrid).textContent = formatDate(d, 'month');
    });

    // the fan: 95, 80 and 50% bands from the same draws
    BANDS.forEach(([a, b], k) => {
      const top = q.map((f, t) => [H - 1 + t, f(b)]);
      const bottom = q.map((f, t) => [H - 1 + t, f(a)]).reverse();
      bandEls[k].setAttribute('d', `${line(top)}${line(bottom).replace('M', 'L')}Z`);
    });
    median.setAttribute('d', line(q.map((f, t) => [H - 1 + t, f(0.5)])));
    actual.setAttribute('d', line(history.map((v, i) => [i, v])));

    // today and the uncertain event
    gMarks.replaceChildren();
    const tx = x(H - 1);
    make('line', { x1: tx, x2: tx, y1: M.top - 6, y2: Hpx - M.bottom, class: 'hop__today' }, gMarks);
    make('text', { x: tx - 6, y: M.top - 8, class: 'hop__mark-label hop__mark-label--end' }, gMarks).textContent = 'Today';
    for (const ev of events) {
      const ex = x(H - 1 + ev.step);
      make('line', { x1: ex, x2: ex, y1: M.top - 6, y2: Hpx - M.bottom, class: 'hop__event' }, gMarks);
      make('text', { x: ex + 6, y: M.top - 8, class: 'hop__mark-label' }, gMarks).textContent = ev.label;
    }
    draw();
  }

  function draw() {
    root.dataset.mode = on ? 'futures' : 'bands';
    if (!on || !W) return;
    const k = order[pos];
    const d = draws[k];
    path.setAttribute('d', line(future(d)));
    const ex = x(H + F - 1);
    const ey = y(d[F - 1]);
    endDot.setAttribute('cx', ex);
    endDot.setAttribute('cy', ey);
    endLabel.setAttribute('x', ex + 8);
    endLabel.setAttribute('y', ey);
    endLabel.textContent = format(d[F - 1]);
    trailEls.forEach((el, i) => {
      if (i >= trails) { el.setAttribute('d', ''); return; }
      const past = order[(pos - 1 - i + N * 2) % N];
      el.setAttribute('d', line(future(draws[past])));
      el.style.opacity = (0.34 * (1 - i / Math.max(trails, 1)) + 0.05).toFixed(3);
    });
    counter.setAttribute('x', M.left + 8);
    counter.setAttribute('y', M.top + 14);
    counter.textContent = `Future ${pos + 1} of ${N}${frozen || paused ? ' · paused' : ''}`;
  }

  function announce() {
    const d = draws[order[pos]];
    live.textContent = `Possible future ${pos + 1} of ${N}: ${format(d[F - 1])} in the week of ${formatDate(dates[H + F - 1], 'long')}.`;
  }

  function schedule() {
    clearInterval(timer);
    timer = 0;
    if (on && !paused && !frozen && visible && !document.hidden) {
      timer = setInterval(() => { pos = (pos + 1) % N; draw(); }, FRAME_MS);
    }
    if (playBtn) {
      playBtn.disabled = !on;
      playBtn.textContent = paused ? 'Play' : 'Pause';
      playBtn.setAttribute('aria-pressed', String(!paused));
    }
    draw();
  }

  function setOn(v) {
    on = v;
    toggle?.setAttribute('aria-checked', String(on));
    schedule();
    if (on && paused) announce();
  }
  function step(dir) {
    if (!on) return;
    paused = true;
    pos = (pos + dir + N) % N;
    schedule();
    announce();
  }

  toggle?.addEventListener('click', () => setOn(!on));
  playBtn?.addEventListener('click', () => { paused = !paused; schedule(); if (paused) announce(); });
  trailsInput?.addEventListener('input', () => {
    trails = Number(trailsInput.value);
    if (trailsOut) trailsOut.value = String(trails);
    draw();
  });

  // hover (mouse, pen) and focus freeze the current future; a tap pauses it
  plot.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch') { frozen = true; schedule(); } });
  plot.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch') { frozen = false; schedule(); } });
  plot.addEventListener('pointerup', (e) => { if (e.pointerType === 'touch' && on) { paused = !paused; schedule(); } });
  plot.addEventListener('focus', () => { frozen = true; schedule(); if (on) announce(); });
  plot.addEventListener('blur', () => { frozen = false; schedule(); });
  plot.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') step(1);
    else if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === ' ' || e.key === 'Enter') { if (!on) setOn(true); else { paused = !paused; schedule(); } }
    else return;
    e.preventDefault();
  });

  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; schedule(); }).observe(plot);
  document.addEventListener('visibilitychange', schedule);
  let size = '';
  new ResizeObserver(() => {
    const r = plot.getBoundingClientRect();
    const s = `${Math.round(r.width)}x${Math.round(r.height)}`;
    if (s !== size) { size = s; layout(); }
  }).observe(plot);

  const q80 = [q[F](0.1), q[F](0.9)];
  return {
    summary: { median: q[F](0.5), low80: q80[0], high80: q80[1] },
    setOn,
    /** Freeze on draw n with trails (posters). */
    show(n, trailCount) {
      on = true;
      paused = true;
      pos = n % N;
      if (trailCount !== undefined) { trails = trailCount; if (trailsInput) trailsInput.value = String(trailCount); if (trailsOut) trailsOut.value = String(trailCount); }
      toggle?.setAttribute('aria-checked', 'true');
      schedule();
    }
  };
}
