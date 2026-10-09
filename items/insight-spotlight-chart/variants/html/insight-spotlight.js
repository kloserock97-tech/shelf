/* Insight Spotlight — an "Explain" tour over a time series. The insights come from plain local statistics,
   no model: the weekly rhythm (autocorrelation), a change in trend (best two-line least-squares split),
   an outlier (robust z-score of what's left) and the record day. Each step dims the rest of the chart,
   draws an arrow and writes a note the way a newsroom graphic would. */

const NS = 'http://www.w3.org/2000/svg';
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const sv = (tag, attrs = {}) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const median = (a) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
let uid = 0;

// =====================================================================================================
// Statistics
// =====================================================================================================

/** Finds the weekly rhythm, a trend change, outliers and the peak of a series. Pure, deterministic. */
export function findInsights(values, { maxLag = 21, minSegment = 14, zLimit = 3.5 } = {}) {
  const n = values.length;
  // seasonality: ratio to a centred 7-day mean, then autocorrelation of that ratio
  const ma = values.map((_, i) => {
    let s = 0, c = 0;
    for (let j = Math.max(0, i - 3); j <= Math.min(n - 1, i + 3); j++) { s += values[j]; c++; }
    return s / c;
  });
  const ratio = values.map((v, i) => v / ma[i]);
  const mean = ratio.reduce((a, b) => a + b, 0) / n;
  const dev = ratio.map((r) => r - mean);
  const den = dev.reduce((a, d) => a + d * d, 0) || 1;
  let lag = 0, acf = 0;
  for (let L = 2; L <= Math.min(maxLag, Math.floor(n / 3)); L++) {
    let s = 0;
    for (let i = 0; i + L < n; i++) s += dev[i] * dev[i + L];
    if (s / den > acf) { acf = s / den; lag = L; }
  }
  const period = acf > 0.25 ? lag : 0;
  let profile = [1];
  if (period) {
    profile = Array.from({ length: period }, (_, p) => {
      const xs = ratio.filter((_, i) => i % period === p);
      return xs.reduce((a, b) => a + b, 0) / xs.length;
    });
    const pm = profile.reduce((a, b) => a + b, 0) / period;
    profile = profile.map((v) => v / pm);
  }
  const season = (i) => (period ? profile[i % period] : 1);
  const ds = values.map((v, i) => v / season(i));

  // trend change on the deseasonalised series; outliers are left out of the second pass
  let mask = values.map(() => true);
  let cp = changepoint(ds, mask, minSegment);
  const zOf = (fit) => {
    const res = ds.map((v, i) => (v - fit(i)) / (Math.abs(fit(i)) || 1)); // relative: noise grows with the level
    const med = median(res), mad = median(res.map((r) => Math.abs(r - med))) * 1.4826 || 1;
    return res.map((r) => (r - med) / mad);
  };
  let z = zOf(cp.fit);
  mask = z.map((v) => Math.abs(v) <= zLimit);
  cp = changepoint(ds, mask, minSegment);
  z = zOf(cp.fit);
  const outliers = z.map((v, i) => [i, v]).filter(([, v]) => Math.abs(v) > zLimit).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  const expected = values.map((_, i) => cp.fit(i) * season(i));

  let peak = 0;
  values.forEach((v, i) => { if (v > values[peak]) peak = i; });

  return { period, acf, profile, cp, outliers, expected, peak, z };
}

// best split into two independent least-squares lines, O(n) per split from prefix sums
function changepoint(y, mask, minSeg) {
  const n = y.length;
  const P = Array.from({ length: 6 }, () => new Float64Array(n + 1)); // count, Sx, Sy, Sxx, Sxy, Syy
  for (let i = 0; i < n; i++) {
    const w = mask[i] ? 1 : 0;
    P[0][i + 1] = P[0][i] + w; P[1][i + 1] = P[1][i] + w * i; P[2][i + 1] = P[2][i] + w * y[i];
    P[3][i + 1] = P[3][i] + w * i * i; P[4][i + 1] = P[4][i] + w * i * y[i]; P[5][i + 1] = P[5][i] + w * y[i] * y[i];
  }
  const fit = (a, b) => {
    const [c, sx, sy, sxx, sxy, syy] = P.map((p) => p[b] - p[a]);
    const d = c * sxx - sx * sx;
    const m = d ? (c * sxy - sx * sy) / d : 0, k = c ? (sy - m * sx) / c : 0;
    return { m, k, sse: Math.max(0, syy - k * sy - m * sxy) };
  };
  const one = fit(0, n);
  let best = null;
  for (let at = minSeg; at <= n - minSeg; at++) {
    const L = fit(0, at), R = fit(at, n), sse = L.sse + R.sse;
    if (!best || sse < best.sse) best = { at, L, R, sse };
  }
  const { at, L, R } = best;
  return { at, slope1: L.m, slope2: R.m, gain: 1 - best.sse / (one.sse || 1), fit: (i) => (i < at ? L.m * i + L.k : R.m * i + R.k), seg: [L, R] };
}

// =====================================================================================================
// Chart
// =====================================================================================================

/**
 * @param {HTMLElement} root  .is with .is__plot, .is__bar, .is__readout, .is__sr, .is__live inside
 * @param {object} o
 *   values, dates — the series, one date per value
 *   unit          — 'orders'
 *   format        — v => '1,532'
 *   formatDate    — (d, style) => 'Jul 14' | 'Tue, Jul 14' (style 'long') | 'Jul' (style 'month')
 *   initialStep   — open the tour at this step
 */
export function insightSpotlight(root, o) {
  const { values, dates, unit = 'units' } = o;
  const fmt = o.format ?? ((v) => Math.round(v).toLocaleString('en-US'));
  const fd = o.formatDate ?? ((d, s) => d.toLocaleDateString('en-US', s === 'long' ? { weekday: 'short', month: 'short', day: 'numeric' } : s === 'month' ? { month: 'short' } : { month: 'short', day: 'numeric' }));
  const n = values.length;
  const stats = findInsights(values);
  const steps = buildSteps(stats);
  const id = `is${++uid}`;

  const plot = root.querySelector('.is__plot');
  const bar = root.querySelector('.is__bar');
  const readout = root.querySelector('.is__readout');
  const live = root.querySelector('.is__live');
  const sr = root.querySelector('.is__sr');

  // ---- svg skeleton
  const svg = sv('svg', { class: 'is__svg', 'aria-hidden': 'true' });
  const mask = sv('mask', { id: `${id}-hole`, maskUnits: 'userSpaceOnUse' });
  const maskAll = sv('rect', { fill: '#fff' });
  const hole = sv('rect', { fill: '#000', rx: 10 });
  mask.append(maskAll, hole);
  const defs = sv('defs');
  defs.append(mask);
  const gGrid = sv('g'), gData = sv('g');
  const dim = sv('rect', { class: 'is__dim', mask: `url(#${id}-hole)` });
  const cross = sv('g', { class: 'is__cross' });
  const crossLine = sv('line'), crossDot = sv('circle', { r: 4.5 });
  cross.append(crossLine, crossDot);
  svg.append(defs, gGrid, gData, cross, dim);
  plot.append(svg);
  let note = null, label = null;

  // ---- controls
  const icon = (d) => `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const explain = el('button', 'is__explain', `${icon('<path d="M8 1.8l1.5 3.9 3.9 1.5-3.9 1.5L8 12.6 6.5 8.7 2.6 7.2l3.9-1.5z"/><path d="M13 11.2l.6 1.5 1.4.5-1.4.6-.6 1.4-.5-1.4-1.5-.6 1.5-.5z" stroke-width="1.2"/>')}Explain this chart`);
  explain.type = 'button';
  const found = el('p', 'is__found', `${steps.length} things worth a look · found by local statistics, no model`);
  const nav = el('div', 'is__nav');
  const prev = el('button', 'is__btn', icon('<path d="M10 3L5 8l5 5"/>'));
  prev.type = 'button'; prev.setAttribute('aria-label', 'Previous insight');
  const next = el('button', 'is__btn', icon('<path d="M6 3l5 5-5 5"/>'));
  next.type = 'button'; next.setAttribute('aria-label', 'Next insight');
  const dots = el('span', 'is__dots');
  const dotBtns = steps.map((s, k) => {
    const d = el('button', 'is__dot');
    d.type = 'button';
    d.setAttribute('aria-label', `Insight ${k + 1}: ${s.kicker}`);
    d.addEventListener('click', () => go(k));
    dots.append(d);
    return d;
  });
  const count = el('span', 'is__count');
  const done = el('button', 'is__btn', 'Done');
  done.type = 'button';
  nav.append(prev, dots, next, count, done);
  bar.append(explain, found, nav);
  explain.addEventListener('click', () => { go(0); next.focus(); });
  prev.addEventListener('click', () => go(step - 1));
  next.addEventListener('click', () => (step < steps.length - 1 ? go(step + 1) : exit()));
  done.addEventListener('click', exit);
  root.addEventListener('keydown', (e) => {
    if (step < 0) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); if (step < steps.length - 1) go(step + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); if (step > 0) go(step - 1); }
    else if (e.key === 'Escape') { e.preventDefault(); exit(); }
  });

  // the same insights as text, always there for screen readers
  if (sr) sr.innerHTML = `<p>${steps.length} insights:</p><ol>${steps.map((s) => `<li>${esc(s.kicker)}. ${esc(s.headline)}. ${esc(s.text)}</li>`).join('')}</ol>`;

  // ---- geometry
  let W = 0, H = 0, step = -1, yMax = 1, pending = o.initialStep ?? null;
  const M = { l: 44, r: 12, t: 14, b: 28 };
  const X = (i) => M.l + (i / (n - 1)) * (W - M.l - M.r);
  const Y = (v) => M.t + (1 - v / yMax) * (H - M.t - M.b);

  function niceMax(v) {
    const raw = v / 4, mag = 10 ** Math.floor(Math.log10(raw));
    const stepV = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
    return { top: Math.ceil(v / stepV) * stepV, step: stepV };
  }

  function render() {
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    for (const r of [maskAll, dim]) { r.setAttribute("x", M.l - 4); r.setAttribute("y", M.t - 6); r.setAttribute("width", W - M.l - M.r + 8); r.setAttribute("height", H - M.t - M.b + 6); }
    const { top, step: ts } = niceMax(Math.max(...values) * 1.06);
    yMax = top;
    gGrid.replaceChildren();
    for (let v = 0; v <= top + 1e-9; v += ts) {
      const y = Math.round(Y(v)) + 0.5;
      gGrid.append(sv('line', { class: v === 0 ? 'is__base' : 'is__grid', x1: M.l, x2: W - M.r, y1: y, y2: y }));
      const t = sv('text', { class: 'is__ylab', x: M.l - 8, y });
      t.textContent = v >= 1000 ? `${+(v / 1000).toFixed(1)}k` : String(v);
      gGrid.append(t);
    }
    let lastX = -Infinity;
    dates.forEach((d, i) => {
      if (i && d.getMonth() === dates[i - 1].getMonth()) return;
      const x = X(i);
      if (x - lastX < 34) return;
      lastX = x;
      gGrid.append(sv('line', { class: 'is__base', x1: Math.round(x) + 0.5, x2: Math.round(x) + 0.5, y1: H - M.b, y2: H - M.b + 5 }));
      const t = sv('text', { class: 'is__xlab', x: x + 3, y: H - M.b + 16 });
      t.textContent = fd(d, 'month');
      gGrid.append(t);
    });
    const pts = values.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`);
    gData.replaceChildren(
      sv('path', { class: 'is__area', d: `M${X(0)},${Y(0)}L${pts.join('L')}L${X(n - 1)},${Y(0)}Z` }),
      sv('path', { class: 'is__line', d: `M${pts.join('L')}` })
    );
    if (pending != null && steps.length) { const k = clamp(pending, 0, steps.length - 1); pending = null; show(k, false); }
    else if (step >= 0) show(step, false);
    else setHole(fullHole(), false);
  }

  // ---- the steps
  function buildSteps(st) {
    const out = [];
    const signed = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v) < 10 ? Math.abs(v).toFixed(1) : Math.round(Math.abs(v))}`;
    const { cp } = st;
    if (cp.gain > 0.1) {
      const faster = cp.slope2 > cp.slope1 * 1.3, slower = cp.slope2 < cp.slope1 * 0.7;
      out.push({
        kind: 'trend', kicker: 'Trend shift',
        headline: `${faster ? 'Growth sped up' : slower ? 'Growth slowed' : 'The trend turned'} after ${fd(dates[cp.at])}`,
        text: `The daily climb went from ${signed(cp.slope1)} to ${signed(cp.slope2)} ${unit} a day.`,
        method: `Changepoint: the best two-line least-squares split, ${Math.round(cp.gain * 100)}% less error than one line.`
      });
    }
    const p = st.peak;
    const firstWeek = values.slice(0, 7).reduce((a, b) => a + b, 0) / Math.min(7, n);
    out.push({
      kind: 'peak', kicker: 'Record day',
      headline: `${fd(dates[p], 'long')}: ${fmt(values[p])} ${unit}`,
      text: `${(values[p] / firstWeek).toFixed(1)}× the average day of the first week.`,
      method: `The maximum of ${n} days.`
    });
    if (st.outliers.length) {
      const [i, z] = st.outliers[0];
      const pct = Math.round((values[i] / st.expected[i] - 1) * 100);
      out.push({
        kind: 'outlier', kicker: 'Outlier', i,
        headline: `${fd(dates[i])} ${pct < 0 ? 'fell' : 'jumped'} ${Math.abs(pct)}% ${pct < 0 ? 'below' : 'above'} expected`,
        text: `Trend and weekday pointed to about ${fmt(st.expected[i])}; the day closed at ${fmt(values[i])}.`,
        method: `Robust z-score ${z.toFixed(1)} on what trend and rhythm leave over${st.outliers.length > 1 ? `, the strongest of ${st.outliers.length} past 3.5` : ', the only one past 3.5'}.`
      });
    }
    if (st.period === 7) {
      const top = st.profile.indexOf(Math.max(...st.profile)), low = st.profile.indexOf(Math.min(...st.profile));
      const day = (ph) => dates[ph].toLocaleDateString('en-US', { weekday: 'long' });
      out.push({
        kind: 'season', kicker: 'Weekly rhythm', phase: top,
        headline: `${day(top)}s run ${Math.round((st.profile[top] - 1) * 100)}% above an average day`,
        text: `${day(low)}s are the quietest, ${Math.round((1 - st.profile[low]) * 100)}% below.`,
        method: `Autocorrelation at a 7-day lag: ${st.acf.toFixed(2)}.`
      });
    }
    return out;
  }

  function fullHole() { return { x: 0, y: 0, w: W, h: H }; }

  function go(k) {
    k = clamp(k, 0, steps.length - 1);
    show(k, !reduced());
  }

  function show(k, animate) {
    const first = step < 0;
    step = k;
    const s = steps[k];
    root.dataset.step = String(k);
    root.dataset.focus = s.kind;
    hideCross();

    // marks and the area to keep lit
    const g = sv('g', { class: 'is__note' });
    let target, lit, avoid;
    const top = M.t, bot = H - M.b;
    if (s.kind === 'trend') {
      const { cp } = stats;
      const [L, R] = cp.seg;
      g.append(
        sv('line', { class: 'is__fit', x1: X(0), y1: Y(L.k), x2: X(cp.at - 1), y2: Y(L.m * (cp.at - 1) + L.k) }),
        sv('line', { class: 'is__fit', x1: X(cp.at), y1: Y(R.m * cp.at + R.k), x2: X(n - 1), y2: Y(R.m * (n - 1) + R.k) }),
        sv('line', { class: 'is__break', x1: X(cp.at), x2: X(cp.at), y1: top, y2: bot })
      );
      const tag = sv('text', { class: 'is__tag', x: X(cp.at) + 5, y: bot - 6 });
      tag.textContent = fd(dates[cp.at]);
      g.append(tag);
      const span = Math.max(16, Math.round(n * 0.11));
      lit = { x: X(Math.max(0, cp.at - span)), y: top - 4, w: X(Math.min(n - 1, cp.at + span)) - X(Math.max(0, cp.at - span)), h: bot - top + 8 };
      const ti = Math.min(n - 1, cp.at + Math.round(span * 0.6));
      target = { x: X(ti), y: Y(cp.fit(ti)) };
      avoid = lit;
    } else if (s.kind === 'peak' || s.kind === 'outlier') {
      const i = s.kind === 'peak' ? stats.peak : s.i;
      const px = X(i), py = Y(values[i]);
      if (s.kind === 'outlier') {
        const ey = Y(stats.expected[i]);
        g.append(sv('line', { class: 'is__gap', x1: px, x2: px, y1: Math.min(py, ey) + 5, y2: Math.max(py, ey) - 5 }));
        g.append(sv('circle', { class: 'is__ghost', cx: px, cy: ey, r: 4.5 }));
        const tag = sv('text', { class: 'is__tag', x: px + 9, y: ey + 4 });
        tag.textContent = 'expected';
        g.append(tag);
        lit = { x: px - 26, y: Math.min(py, ey) - 24, w: 52, h: Math.abs(py - ey) + 48 };
      } else {
        g.append(sv('circle', { class: 'is__ring', cx: px, cy: py, r: 9 }));
        lit = { x: px - 24, y: py - 24, w: 48, h: 48 };
      }
      g.append(sv('circle', { class: 'is__pt', cx: px, cy: py, r: 4.5 }));
      target = { x: px, y: py };
      avoid = lit;
    } else {
      const ph = s.phase, period = stats.period;
      let pick = 0;
      for (let i = ph; i < n; i += period) {
        g.append(sv('circle', { class: 'is__seasonpt', cx: X(i), cy: Y(values[i]), r: 3.5 }));
        if (i <= n * 0.62) pick = i;
      }
      lit = fullHole();
      target = { x: X(pick), y: Y(values[pick]) };
      avoid = { x: target.x - 14, y: target.y - 14, w: 28, h: 28 };
    }

    // the note: text first, so it can be measured and placed
    const lab = el('div', 'is__label');
    lab.setAttribute('aria-hidden', 'true');
    lab.innerHTML = `<p class="is__kicker">${esc(s.kicker)}</p><p class="is__headline">${esc(s.headline)}</p><p class="is__text">${esc(s.text)}</p>` +
      (s.kind === 'season' ? weekBars() : '') + `<p class="is__method">${esc(s.method)}</p>`;
    plot.append(lab);
    const lw = lab.offsetWidth, lh = lab.offsetHeight;
    const at = placeLabel(lw, lh, target, avoid);
    lab.style.left = `${at.x}px`;
    lab.style.top = `${at.y}px`;

    // the arrow: from the note's edge to the mark, a gentle arc
    const a = arrow(at, lw, lh, target);
    const arc = sv('path', { class: 'is__arc', d: a.d, pathLength: 1 });
    const head = sv('path', { class: 'is__head-arrow', d: a.head });
    g.append(arc, head);

    // swap in
    if (note) { const old = note; old.classList.add('is-out'); setTimeout(() => old.remove(), animate ? 180 : 0); }
    if (label) { const old = label; old.classList.add('is-out'); setTimeout(() => old.remove(), animate ? 160 : 0); }
    svg.append(g);
    note = g;
    label = lab;
    if (animate) requestAnimationFrame(() => requestAnimationFrame(() => { g.classList.add('is-drawn'); lab.classList.add('is-on'); }));
    else { g.classList.add('is-drawn'); lab.classList.add('is-on'); }
    setHole(lit, animate && !first ? true : animate);

    // controls
    dotBtns.forEach((d, j) => (j === k ? d.setAttribute('aria-current', 'step') : d.removeAttribute('aria-current')));
    count.textContent = `${k + 1} / ${steps.length}`;
    prev.disabled = k === 0;
    next.setAttribute('aria-label', k === steps.length - 1 ? 'Finish' : 'Next insight');
    if (live) live.textContent = `Insight ${k + 1} of ${steps.length}. ${s.kicker}. ${s.headline}. ${s.text}`;
  }

  function exit() {
    if (step < 0) return;
    step = -1;
    delete root.dataset.step;
    delete root.dataset.focus;
    for (const e of [note, label]) if (e) { e.classList.add('is-out'); setTimeout(() => e.remove(), 180); }
    note = label = null;
    setHole(fullHole(), !reduced());
    if (live) live.textContent = 'Tour closed';
    explain.focus();
  }

  function weekBars() {
    const order = [1, 2, 3, 4, 5, 6, 0]; // Mon … Sun
    const prof = stats.profile;
    const byDay = new Map(prof.map((v, ph) => [dates[ph].getDay(), v]));
    const max = Math.max(...prof), min = Math.min(...prof) * 0.8;
    const bars = order.map((d) => `<span class="${byDay.get(d) === max ? 'is-top' : ''}" style="height:${Math.round(((byDay.get(d) - min) / (max - min)) * 100)}%"></span>`).join('');
    const names = order.map((d) => `<span>${'SMTWTFS'[d]}</span>`).join('');
    return `<div class="is__bars">${bars}</div><div class="is__days">${names}</div>`;
  }

  function placeLabel(lw, lh, t, avoid) {
    // four spots around the mark plus the four corners of the plot; the cheapest wins:
    // covering the lit area or the mark costs most, then covering the line, then being far from the mark
    const spots = [];
    for (const sy of [-1, 1]) for (const sx of [-1, 1]) spots.push([sx < 0 ? t.x - 54 - lw : t.x + 54, sy < 0 ? t.y - 50 - lh : t.y + 46]);
    for (const cy of [2, H - M.b - lh]) for (const cx of [M.l + 4, W - M.r - lw]) spots.push([cx, cy]);
    let best = null;
    for (const [sx, sy] of spots) {
      const x = clamp(sx, M.l + 4, W - M.r - lw), y = clamp(sy, 2, H - M.b - lh);
      const box = { x, y, w: lw, h: lh };
      const hit = overlap(box, grow(avoid, 8)) + overlap(box, { x: t.x - 12, y: t.y - 12, w: 24, h: 24 }) * 20;
      const d = Math.hypot(x + lw / 2 - t.x, y + lh / 2 - t.y);
      const score = hit + lineCover(box) + Math.max(0, d - lw * 0.7) * 3;
      if (!best || score < best.score) best = { x, y, score };
    }
    return best;
  }
  // how much of the series runs under a box: notes go where the line is not
  function lineCover(b) {
    let c = 0;
    for (let i = 0; i < n; i++) {
      const x = X(i), y = Y(values[i]);
      if (x >= b.x && x <= b.x + b.w && y >= b.y - 4 && y <= b.y + b.h + 4) c++;
    }
    return c * ((W - M.l - M.r) / n) * 8;
  }
  const grow = (r, p) => ({ x: r.x - p, y: r.y - p, w: r.w + 2 * p, h: r.h + 2 * p });
  const overlap = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

  function arrow(at, lw, lh, t) {
    let sx, sy;
    if (at.x + lw < t.x - 8) { sx = at.x + lw + 6; sy = at.y + 22; }
    else if (at.x > t.x + 8) { sx = at.x - 6; sy = at.y + 22; }
    else { sx = clamp(t.x, at.x + 12, at.x + lw - 12); sy = at.y > t.y ? at.y - 6 : at.y + lh + 6; }
    const dx = t.x - sx, dy = t.y - sy, len = Math.hypot(dx, dy) || 1;
    const bend = (dx * dy > 0 ? -1 : 1) * Math.min(60, len * 0.28);
    const cx = (sx + t.x) / 2 - (dy / len) * bend, cy = (sy + t.y) / 2 + (dx / len) * bend;
    const tx = t.x - cx, ty = t.y - cy, tl = Math.hypot(tx, ty) || 1;
    const ex = t.x - (tx / tl) * 10, ey = t.y - (ty / tl) * 10;
    const ux = (ex - cx) / (Math.hypot(ex - cx, ey - cy) || 1), uy = (ey - cy) / (Math.hypot(ex - cx, ey - cy) || 1);
    const side = (ang) => [ex - 7 * (ux * Math.cos(ang) - uy * Math.sin(ang)), ey - 7 * (ux * Math.sin(ang) + uy * Math.cos(ang))];
    const [ax, ay] = side(0.5), [bx, by] = side(-0.5);
    return { d: `M${sx.toFixed(1)},${sy.toFixed(1)}Q${cx.toFixed(1)},${cy.toFixed(1)} ${ex.toFixed(1)},${ey.toFixed(1)}`, head: `M${ax.toFixed(1)},${ay.toFixed(1)}L${ex.toFixed(1)},${ey.toFixed(1)}L${bx.toFixed(1)},${by.toFixed(1)}` };
  }

  // ---- the lit window glides between steps
  let holeNow = null, tween = 0;
  function setHole(to, animate) {
    cancelAnimationFrame(tween);
    const from = holeNow ?? to;
    const apply = (r) => { hole.setAttribute('x', r.x); hole.setAttribute('y', r.y); hole.setAttribute('width', Math.max(0, r.w)); hole.setAttribute('height', Math.max(0, r.h)); holeNow = r; };
    if (!animate) { apply(to); return; }
    const t0 = performance.now(), dur = 560;
    const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
    const frame = (now) => {
      const k = ease(Math.min(1, (now - t0) / dur));
      apply({ x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k, w: from.w + (to.w - from.w) * k, h: from.h + (to.h - from.h) * k });
      if (k < 1) tween = requestAnimationFrame(frame);
    };
    tween = requestAnimationFrame(frame);
  }

  // ---- hover readout (outside the tour)
  const total7 = values.slice(-7).reduce((a, b) => a + b, 0);
  const restText = `Last 7 days: <b>${esc(fmt(total7))}</b> ${esc(unit)}`;
  if (readout) readout.innerHTML = restText;
  let crossAt = -1;
  function showCross(i) {
    crossAt = i;
    const x = X(i), y = Y(values[i]);
    crossLine.setAttribute('x1', x); crossLine.setAttribute('x2', x);
    crossLine.setAttribute('y1', M.t); crossLine.setAttribute('y2', H - M.b);
    crossDot.setAttribute('cx', x); crossDot.setAttribute('cy', y);
    cross.classList.add('is-on');
    if (readout) readout.innerHTML = `${esc(fd(dates[i], 'long'))}: <b>${esc(fmt(values[i]))}</b> ${esc(unit)}`;
  }
  function hideCross() {
    crossAt = -1;
    cross.classList.remove('is-on');
    if (readout) readout.innerHTML = restText;
  }
  plot.addEventListener('pointermove', (e) => {
    if (step >= 0 || !W) return;
    const b = plot.getBoundingClientRect();
    const i = Math.round(clamp((e.clientX - b.left - M.l) / (W - M.l - M.r), 0, 1) * (n - 1));
    showCross(i);
  });
  plot.addEventListener('pointerleave', () => { if (step < 0) hideCross(); });
  plot.addEventListener('keydown', (e) => {
    if (step >= 0 || !W) return;
    const d = { ArrowRight: 1, ArrowLeft: -1, PageUp: 7, PageDown: -7 }[e.key];
    if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); showCross(e.key === 'Home' ? 0 : n - 1); return; }
    if (!d) return;
    e.preventDefault();
    showCross(clamp((crossAt < 0 ? n - 1 : crossAt) + d, 0, n - 1));
    if (live) live.textContent = readout?.textContent ?? '';
  });
  plot.addEventListener('blur', hideCross);

  // ---- size
  function resize() {
    const b = plot.getBoundingClientRect();
    if (!b.width || !b.height || (Math.round(b.width) === W && Math.round(b.height) === H)) return;
    W = Math.round(b.width); H = Math.round(b.height);
    holeNow = null;
    render();
    if (crossAt >= 0) showCross(crossAt);
  }
  new ResizeObserver(resize).observe(plot);
  resize();



  return { insights: steps, stats, go, exit };
}
