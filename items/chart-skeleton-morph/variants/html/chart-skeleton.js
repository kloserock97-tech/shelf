/* Chart Skeleton — the placeholder of a chart is the chart itself: real axes and dates, and a ghost of the expected
   shape drawn from value noise inside the expected range. While loading a light sweeps along the ghost; when the data
   arrives the ghost turns into the real series with a front of colour moving left to right. Empty and error states keep
   the ghost, dimmed and dashed, under an honest message with an action.
   SVG; rAF only during the morph and the number roll, the sweep is a declarative SVG animation paused outside loading. */

const SVG = 'http://www.w3.org/2000/svg';
const M = { top: 14, right: 14, bottom: 26, left: 40 };
const MORPH_MS = 900;
const WAVE = 0.35; // width of the morph front, in plot widths

const make = (name, attrs = {}, parent) => {
  const n = document.createElementNS(SVG, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  parent?.append(n);
  return n;
};
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (t) => t * t * (3 - 2 * t);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
// top of the scale and a round tick step, about five intervals
function niceTop(v) {
  const raw = v / 5;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const f = raw / pow;
  const step = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * pow;
  return { top: Math.ceil(v / step) * step, step };
}

// Hash Kit mixer → value noise: random heights on integer knots, smoothstep between them
function hashU(x) {
  x ^= x >>> 16; x = Math.imul(x, 0x3f9c86cb);
  x ^= x >>> 14; x = Math.imul(x, 0x1ae9dacf);
  x ^= x >>> 15;
  return x >>> 0;
}
const knot = (i, seed) => (hashU((i + Math.imul(seed, 0x5bd1) + 0xb31c96c9) >>> 0) >>> 8) / 16777216;
function valueNoise(x, seed) {
  const i = Math.floor(x);
  return knot(i, seed) + (knot(i + 1, seed) - knot(i, seed)) * smooth(x - i);
}
const fbm = (x, seed) => (valueNoise(x, seed) * 0.62 + valueNoise(x * 2.3, seed + 1) * 0.28 + valueNoise(x * 5.1, seed + 2) * 0.1);

/**
 * chartSkeleton(root, { dates, expected: [lo, hi], format, formatDate, seed })
 *   dates    — one Date per point the chart will show; the axis is real from the first frame.
 *   expected — the range the values usually fall in (last period, a target); the ghost stays inside it.
 * Returns { loading(dates?), data(values, { kpi, kpiNote }), empty({ title, text, action, secondary }),
 *           error({ title, text, action }), freeze(t) }.
 * Actions are { label, onClick }.
 */
export function chartSkeleton(root, opts) {
  const { expected, format = String, formatDate, seed = 7 } = opts;
  let dates = opts.dates;
  const $ = (s) => root.querySelector(s);
  const plot = $('.csk__plot');
  const panel = $('.csk__panel');
  const status = $('.csk__status');
  const kpiValue = $('.csk__kpi-value');
  const kpiNote = $('.csk__kpi-note');
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const uid = `csk${Math.random().toString(36).slice(2, 8)}`;

  const svg = make('svg', { class: 'csk__svg', 'aria-hidden': 'true' }, plot);
  const defs = make('defs', {}, svg);
  // sweep: a band of light moving along the ghost
  const sweep = make('linearGradient', { id: `${uid}-sweep`, gradientUnits: 'userSpaceOnUse', x1: 0, y1: 0, x2: 1, y2: 0 }, defs);
  for (const [o, c] of [[0, 'g'], [0.5, 'h'], [1, 'g']]) make('stop', { offset: o, class: `csk__stop-${c}` }, sweep);
  const sweepArea = make('linearGradient', { id: `${uid}-sweep-a`, gradientUnits: 'userSpaceOnUse', x1: 0, y1: 0, x2: 1, y2: 0 }, defs);
  for (const [o, c] of [[0, 'ga'], [0.5, 'ha'], [1, 'ga']]) make('stop', { offset: o, class: `csk__stop-${c}` }, sweepArea);
  const sweepAnims = [sweep, sweepArea].map((g) => calm ? null : make('animateTransform', {
    attributeName: 'gradientTransform', type: 'translate', dur: '2.2s', repeatCount: 'indefinite',
    keyTimes: '0;0.7;1', calcMode: 'spline', keySplines: '0.45 0 0.55 1;0 0 1 1'
  }, g));
  // morph front: real colour left of it, ghost right of it
  const front = make('linearGradient', { id: `${uid}-front`, gradientUnits: 'userSpaceOnUse', x1: 0, y1: 0, x2: 1, y2: 0 }, defs);
  const frontStops = [make('stop', { offset: 0, class: 'csk__stop-a' }, front), make('stop', { offset: 0, class: 'csk__stop-g' }, front)];
  const frontArea = make('linearGradient', { id: `${uid}-front-a`, gradientUnits: 'userSpaceOnUse', x1: 0, y1: 0, x2: 1, y2: 0 }, defs);
  const frontAreaStops = [make('stop', { offset: 0, class: 'csk__stop-aa' }, frontArea), make('stop', { offset: 0, class: 'csk__stop-ga' }, frontArea)];

  const gGrid = make('g', { class: 'csk__grid' }, svg);
  const gY = make('g', { class: 'csk__y' }, svg);
  const gX = make('g', { class: 'csk__x' }, svg);
  const area = make('path', { class: 'csk__area' }, svg);
  const line = make('path', { class: 'csk__line' }, svg);
  const end = make('circle', { class: 'csk__end', r: 4 }, svg);
  const cross = make('g', { class: 'csk__cross' }, svg);
  const crossLine = make('line', { class: 'csk__cross-line' }, cross);
  const crossDot = make('circle', { class: 'csk__cross-dot', r: 4.5 }, cross);
  const tip = document.createElement('div');
  tip.className = 'csk__tip';
  tip.setAttribute('aria-hidden', 'true');
  plot.append(tip);

  let state = 'loading';
  let values = null;          // real series once loaded
  let morphT = 1;             // 0…1 while morphing
  let fromMax = 0, toMax = 0; // y domain top, animated with the morph
  let raf = 0;
  let W = 0, H = 0, active = -1;
  let samples = [];           // morph grid: every data point plus evenly spaced points between

  const scaleFor = (vals) => niceTop(Math.max(expected[1], ...(vals ?? [0])) * 1.08);
  const yMaxFor = (vals) => scaleFor(vals).top;
  let yMax = yMaxFor(null);
  let tickStep = scaleFor(null).step;
  const n = () => dates.length;
  const x = (u) => M.left + u * (W - M.left - M.right);         // u: 0…1 along the dates
  const y = (v) => M.top + (1 - v / yMax) * (H - M.top - M.bottom);

  function buildSamples() {
    const k = Math.max(1, Math.ceil(56 / Math.max(1, n() - 1)));
    const m = (n() - 1) * k + 1;
    samples = Array.from({ length: m }, (_, j) => {
      const u = m === 1 ? 0.5 : j / (m - 1);
      const g = expected[0] + (expected[1] - expected[0]) * (0.18 + 0.7 * fbm(u * 5.5 + 0.3, seed));
      return { u, g };
    });
  }
  // the real series on the same grid (linear between points, so the final path is exactly the data polyline)
  function dataAt(u) {
    const pos = u * (values.length - 1);
    const i = Math.min(values.length - 2, Math.floor(pos));
    if (values.length === 1) return values[0];
    return values[i] + (values[i + 1] - values[i]) * (pos - i);
  }

  function axes() {
    gGrid.replaceChildren(); gY.replaceChildren(); gX.replaceChildren();
    for (let v = 0; v <= yMax + 1e-9; v += tickStep) {
      make('line', { x1: M.left, x2: W - M.right, y1: y(v), y2: y(v), class: v === 0 ? 'csk__base' : '' }, gGrid);
      // values are unknown until data comes: pills hold their place, then numbers
      make('rect', { class: 'csk__pill', x: M.left - 30, y: y(v) - 4, width: 22, height: 8, rx: 4 }, gY);
      make('text', { class: 'csk__ylab', x: M.left - 8, y: y(v) }, gY).textContent = format(v);
    }
    // dates are known from the start
    const every = Math.max(1, Math.ceil(56 / ((W - M.left - M.right) / Math.max(1, n() - 1))));
    const pick = dates.map((d, i) => i).filter((i) => (n() - 1 - i) % every === 0);
    for (const i of pick) {
      const u = n() === 1 ? 0.5 : i / (n() - 1);
      make('text', { class: 'csk__xlab', x: x(u), y: H - M.bottom + 17 }, gX).textContent = formatDate(dates[i], 'tick');
    }
  }

  function draw() {
    W = plot.clientWidth; H = plot.clientHeight;
    if (!W || !H) return;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    yMax = fromMax + (toMax - fromMax) * easeInOut(morphT);
    if (state !== 'data') yMax = yMaxFor(null);
    tickStep = scaleFor(state === 'data' ? values : null).step;
    axes();
    const t = state === 'data' ? morphT : 0;
    const head = t * (1 + WAVE);
    let d = '';
    let last = null;
    for (const s of samples) {
      const p = state === 'data' ? smooth(clamp01((head - s.u) / WAVE)) : 0;
      const v = p ? s.g + (dataAt(s.u) - s.g) * p : s.g;
      const px = x(s.u), py = y(v);
      d += `${d ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`;
      last = [px, py];
    }
    line.setAttribute('d', d);
    area.setAttribute('d', `${d}L${x(1).toFixed(1)},${y(0).toFixed(1)}L${x(0).toFixed(1)},${y(0).toFixed(1)}Z`);
    end.setAttribute('cx', last[0]); end.setAttribute('cy', last[1]);

    // gradients live in plot pixels
    for (const g of [sweep, sweepArea]) { g.setAttribute('x1', 0); g.setAttribute('x2', W * 0.3); }
    sweepAnims.forEach((a) => a?.setAttribute('values', `${-W * 0.3} 0;${W} 0;${W} 0`));
    for (const g of [front, frontArea]) { g.setAttribute('x1', x(0)); g.setAttribute('x2', x(1)); }
    const a = clamp01(head - WAVE), b = clamp01(head);
    frontStops[0].setAttribute('offset', a); frontStops[1].setAttribute('offset', Math.max(a, b));
    frontAreaStops[0].setAttribute('offset', a); frontAreaStops[1].setAttribute('offset', Math.max(a, b));
    root.style.setProperty('--csk-reveal', String(clamp01((t - 0.55) / 0.45)));

    // inline style, so it wins over the state colours in the stylesheet
    if (state === 'loading') { line.style.stroke = `url(#${uid}-sweep)`; area.style.fill = `url(#${uid}-sweep-a)`; }
    else if (state === 'data' && morphT < 1) { line.style.stroke = `url(#${uid}-front)`; area.style.fill = `url(#${uid}-front-a)`; }
    else { line.style.stroke = ''; area.style.fill = ''; }
    crossLine.setAttribute('y1', M.top);
    crossLine.setAttribute('y2', H - M.bottom);
    if (active >= 0 && state === 'data') place(active);
  }

  function setState(next) {
    state = next;
    root.dataset.state = next;
    root.setAttribute('aria-busy', String(next === 'loading'));
    plot.tabIndex = next === 'data' ? 0 : -1;
    if (next !== 'data') hide();
    if (next === 'loading' && !calm) svg.unpauseAnimations?.(); else svg.pauseAnimations?.();
  }

  // ---------- panel for empty and error ----------
  function showPanel(kind, { title, text, action, secondary }) {
    panel.hidden = false;
    panel.dataset.kind = kind;
    panel.querySelector('.csk__panel-title').textContent = title;
    panel.querySelector('.csk__panel-text').textContent = text;
    const acts = panel.querySelector('.csk__actions');
    acts.replaceChildren(...[action, secondary].filter(Boolean).map((a, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = i ? 'csk__btn csk__btn--quiet' : 'csk__btn';
      b.textContent = a.label;
      b.addEventListener('click', a.onClick);
      return b;
    }));
    status.textContent = `${title}. ${text}`;
  }

  function loading(newDates) {
    cancelAnimationFrame(raf);
    if (newDates) dates = newDates;
    values = null; morphT = 1; fromMax = toMax = yMaxFor(null);
    buildSamples();
    panel.hidden = true;
    kpiValue.textContent = ''; kpiNote.textContent = '';
    setState('loading');
    draw();
    status.textContent = `Loading ${$('.csk__title')?.textContent ?? 'data'}…`;
  }

  function data(vals, { kpi = '', kpiNote: note = '' } = {}) {
    cancelAnimationFrame(raf);
    if (vals.length !== n()) throw new Error('chartSkeleton: one value per date');
    const wasLoading = state === 'loading';
    values = vals;
    fromMax = yMax; toMax = yMaxFor(vals);
    panel.hidden = true;
    setState('data');
    // the headline number lands together with the y labels, when the shape has settled
    const settle = () => { kpiValue.textContent = kpi; kpiNote.textContent = note; };
    let peak = 0;
    vals.forEach((v, i) => { if (v > vals[peak]) peak = i; });
    status.textContent = `Loaded ${vals.length} days. Peak ${format(vals[peak])} on ${formatDate(dates[peak], 'long')}.`;
    if (calm || !wasLoading) { morphT = 1; draw(); settle(); return; }
    morphT = 0;
    const t0 = performance.now();
    const frame = (now) => {
      morphT = Math.min(1, (now - t0) / MORPH_MS);
      draw();
      if (morphT < 1) raf = requestAnimationFrame(frame);
      else settle();
    };
    raf = requestAnimationFrame(frame);
  }

  function empty(o) { loading(); setState('empty'); draw(); showPanel('empty', o); }
  function error(o) { const keep = dates; loading(keep); setState('error'); draw(); showPanel('error', o); }

  // ---------- read-out once there is data ----------
  function place(i) {
    active = i;
    const u = n() === 1 ? 0.5 : i / (n() - 1);
    crossLine.setAttribute('x1', x(u)); crossLine.setAttribute('x2', x(u));
    crossDot.setAttribute('cx', x(u)); crossDot.setAttribute('cy', y(values[i]));
    cross.classList.add('is-on');
    tip.innerHTML = '<span></span><b></b>';
    tip.children[0].textContent = formatDate(dates[i], 'long');
    tip.children[1].textContent = format(values[i]);
    tip.classList.add('is-on');
    const tw = tip.offsetWidth;
    const right = x(u) + 12 + tw <= W - 2;
    tip.style.transform = `translate(${Math.round(right ? x(u) + 12 : x(u) - 12 - tw)}px, ${M.top}px)`;
  }
  function hide() { active = -1; cross.classList.remove('is-on'); tip.classList.remove('is-on'); }
  const indexAt = (ev) => {
    const r = plot.getBoundingClientRect();
    const u = (ev.clientX - r.left - M.left) / (W - M.left - M.right);
    return Math.max(0, Math.min(n() - 1, Math.round(u * (n() - 1))));
  };
  const ready = () => state === 'data' && morphT >= 1;
  plot.addEventListener('pointermove', (ev) => { if (ready() && (ev.pointerType !== 'touch' || ev.buttons)) place(indexAt(ev)); });
  plot.addEventListener('pointerdown', (ev) => { if (ready()) place(indexAt(ev)); });
  plot.addEventListener('pointerleave', (ev) => { if (ev.pointerType === 'mouse') hide(); });
  plot.addEventListener('blur', hide);
  plot.addEventListener('keydown', (ev) => {
    if (!ready()) return;
    let i = active < 0 ? n() - 1 : active;
    if (ev.key === 'ArrowLeft') i--;
    else if (ev.key === 'ArrowRight') i++;
    else if (ev.key === 'Home') i = 0;
    else if (ev.key === 'End') i = n() - 1;
    else if (ev.key === 'Escape') { hide(); return; }
    else return;
    ev.preventDefault();
    i = Math.max(0, Math.min(n() - 1, i));
    place(i);
    status.textContent = `${formatDate(dates[i], 'long')}: ${format(values[i])}`;
  });

  new ResizeObserver(() => draw()).observe(plot);
  loading();

  return {
    loading, data, empty, error,
    get state() { return state; },
    /** stop the morph at t (0…1), for stills */
    freeze(t) { cancelAnimationFrame(raf); morphT = clamp01(t); draw(); svg.pauseAnimations?.(); }
  };
}
