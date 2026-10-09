/* Honest Gaps — a line chart that shows missing data instead of hiding it.
   Missing days get a hatched band and a numbered note with the reason; estimates are drawn dashed with hollow points.
   Three ways to treat the gaps: leave them, fill linearly between neighbours, or carry the last reading forward.
   The KPIs above the chart are recomputed for the chosen way, so the effect of the choice on the conclusion is visible.
   SVG; redraws only on resize, strategy change and pointer moves; number roll-ups use rAF and stop when done. */

const SVG = 'http://www.w3.org/2000/svg';
const M = { top: 34, right: 14, bottom: 26, left: 46 };
const STRATEGIES = {
  gap: 'Show gaps',
  linear: 'Interpolate',
  carry: 'Carry last'
};

const make = (name, attrs = {}, parent) => {
  const n = document.createElementNS(SVG, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  parent?.append(n);
  return n;
};
function niceStep(span, target) {
  const raw = span / target;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const f = raw / pow;
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * pow;
}
const easeOut = (t) => 1 - (1 - t) ** 3;

/**
 * honestGaps(root, { dates, values, reasons, unit, format, formatDate, strategy })
 *   dates   — one Date per point; values — numbers, null where nothing was recorded.
 *   reasons — [{ from, to, reason }] by index; a missing run without a reason is labelled "No data".
 *   format(v) — number → text; formatDate(d, style) — style is 'tick' | 'short' | 'long'.
 * Returns { setStrategy(id), show(index), summary(id) }.
 */
export function honestGaps(root, opts) {
  const { dates, values, reasons = [], unit = '', format = String, formatDate } = opts;
  const n = values.length;
  const $ = (s) => root.querySelector(s);
  const plot = $('.hg__plot');
  const seg = $('.hg__seg');
  const radios = [...seg.querySelectorAll('[data-strategy]')];
  const live = $('.hg__live');
  const gapList = $('.hg__gaps');
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const known = values.map((v) => v != null && Number.isFinite(v));
  const uid = `hg${Math.random().toString(36).slice(2, 8)}`;

  // runs of missing points, each with its reason
  const runs = [];
  for (let i = 0; i < n; i++) {
    if (known[i]) continue;
    let j = i;
    while (j + 1 < n && !known[j + 1]) j++;
    const r = reasons.find((g) => g.from <= i && g.to >= i);
    runs.push({ start: i, end: j, reason: r?.reason ?? 'No data', days: j - i + 1 });
    i = j;
  }
  const runOf = (i) => runs.find((r) => r.start <= i && r.end >= i);

  // fill(id) → per point { v, est, how } — v is null where the strategy cannot say anything
  function fill(id) {
    const out = values.map((v, i) => ({ v: known[i] ? v : null, est: false, how: '' }));
    if (id === 'gap') return out;
    for (const r of runs) {
      const a = r.start - 1;
      const b = r.end + 1;
      if (a < 0) continue; // nothing before the gap: no estimate either way
      if (id === 'carry') {
        for (let i = r.start; i <= r.end; i++) out[i] = { v: values[a], est: true, how: 'carry', from: a };
      } else if (b < n) {
        for (let i = r.start; i <= r.end; i++) {
          const t = (i - a) / (b - a);
          out[i] = { v: values[a] + (values[b] - values[a]) * t, est: true, how: 'linear', from: a, to: b };
        }
      }
    }
    return out;
  }
  const filled = Object.fromEntries(Object.keys(STRATEGIES).map((id) => [id, fill(id)]));

  function summary(id) {
    const f = filled[id];
    let total = 0, count = 0, est = 0, estCount = 0;
    for (const p of f) {
      if (p.v == null) continue;
      total += p.v; count++;
      if (p.est) { est += p.v; estCount++; }
    }
    const reported = total - est;
    return {
      total, reported, est, estCount, count,
      average: count ? total / count : 0,
      knownCount: count - estCount,
      missing: n - count,
      change: reported ? (total - reported) / reported : 0
    };
  }

  // a fixed y scale over everything any strategy could draw, so switching never rescales
  let lo = Infinity, hi = -Infinity;
  for (const f of Object.values(filled)) for (const p of f) if (p.v != null) { lo = Math.min(lo, p.v); hi = Math.max(hi, p.v); }
  const pad = (hi - lo) * 0.12 || 1;
  const yStep = niceStep(hi - lo + pad * 2, 4);
  const y0 = Math.floor((lo - pad) / yStep) * yStep;
  const y1 = Math.ceil((hi + pad) / yStep) * yStep;

  // ---------- SVG skeleton ----------
  const svg = make('svg', { class: 'hg__svg', 'aria-hidden': 'true' }, plot);
  const defs = make('defs', {}, svg);
  const pat = make('pattern', { id: `${uid}-hatch`, patternUnits: 'userSpaceOnUse', width: 6, height: 6, patternTransform: 'rotate(45)' }, defs);
  make('rect', { class: 'hg__hatch-bg', width: 6, height: 6 }, pat);
  make('line', { class: 'hg__hatch-line', x1: 0, y1: 0, x2: 0, y2: 6 }, pat);
  const gGrid = make('g', { class: 'hg__grid' }, svg);
  const gBands = make('g', {}, svg);
  const gNotes = make('g', { class: 'hg__notes' }, svg);
  const estPath = make('path', { class: 'hg__est' }, svg);
  const linePath = make('path', { class: 'hg__line' }, svg);
  const gDots = make('g', {}, svg);
  const cross = make('g', { class: 'hg__cross' }, svg);
  const crossLine = make('line', { class: 'hg__cross-line' }, cross);
  const crossDot = make('circle', { class: 'hg__cross-dot', r: 4.5 }, cross);
  const tip = document.createElement('div');
  tip.className = 'hg__tip';
  tip.setAttribute('aria-hidden', 'true');
  plot.append(tip);

  // gap list under the chart
  gapList.replaceChildren(...runs.map((r, k) => {
    const li = document.createElement('li');
    const range = r.days === 1 ? formatDate(dates[r.start], 'short')
      : `${formatDate(dates[r.start], 'short')}–${formatDate(dates[r.end], 'short')}`;
    li.innerHTML = `<span class="hg__badge" aria-hidden="true">${k + 1}</span><span><b></b> <span class="hg__gap-meta"></span></span>`;
    li.querySelector('b').textContent = r.reason;
    li.querySelector('.hg__gap-meta').textContent = `${range} · ${r.days} ${r.days === 1 ? 'day' : 'days'}`;
    return li;
  }));

  let strategy = opts.strategy in STRATEGIES ? opts.strategy : 'gap';
  let W = 0, H = 0, step = 0, active = -1;
  const x = (i) => M.left + (i + 0.5) * step;
  const y = (v) => M.top + (1 - (v - y0) / (y1 - y0)) * (H - M.top - M.bottom);

  function render() {
    W = plot.clientWidth; H = plot.clientHeight;
    if (!W || !H) return;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    step = (W - M.left - M.right) / n;
    const top = M.top, bottom = H - M.bottom;

    // grid and labels
    gGrid.replaceChildren();
    for (let v = y0; v <= y1 + 1e-9; v += yStep) {
      make('line', { x1: M.left, x2: W - M.right, y1: y(v), y2: y(v) }, gGrid);
      make('text', { class: 'hg__ylab', x: M.left - 8, y: y(v) }, gGrid).textContent = format(v);
    }
    const weekPx = step * 7;
    for (let i = 0; i < n; i++) {
      make('line', { class: 'hg__tick', x1: x(i), x2: x(i), y1: bottom, y2: bottom + 3 }, gGrid);
      if (dates[i].getDay() === 1 && weekPx >= 46) {
        make('text', { class: 'hg__xlab', x: x(i), y: bottom + 16 }, gGrid).textContent = formatDate(dates[i], 'tick');
      }
    }

    // missing bands, with numbered notes above the plot
    gBands.replaceChildren();
    gNotes.replaceChildren();
    const taken = [];
    runs.forEach((r, k) => {
      const bx = M.left + r.start * step;
      const bw = r.days * step;
      make('rect', { class: 'hg__band', x: bx, y: top, width: bw, height: bottom - top, fill: `url(#${uid}-hatch)` }, gBands);
      make('line', { class: 'hg__band-edge', x1: bx, x2: bx + bw, y1: bottom, y2: bottom }, gBands);
      const cx = bx + bw / 2;
      const cy = top - 15;
      make('line', { class: 'hg__note-stem', x1: cx, x2: cx, y1: cy + 8, y2: top }, gNotes);
      make('circle', { class: 'hg__note-dot', cx, cy, r: 8 }, gNotes);
      make('text', { class: 'hg__note-num', x: cx, y: cy }, gNotes).textContent = String(k + 1);
      // the reason fits next to the badge? right first, then left, else only the number
      const tw = r.reason.length * 6.3;
      const nextCx = k + 1 < runs.length ? M.left + (runs[k + 1].start + runs[k + 1].days / 2) * step : W - M.right + 10;
      const prevEdge = taken.length ? taken[taken.length - 1] : 0;
      let right = cx + 8;
      if (cx + 13 + tw <= Math.min(nextCx - 14, W - 2)) {
        make('text', { class: 'hg__note-text', x: cx + 13, y: cy }, gNotes).textContent = r.reason;
        right = cx + 13 + tw;
      } else if (cx - 13 - tw >= Math.max(prevEdge + 10, 2)) {
        make('text', { class: 'hg__note-text hg__note-text--end', x: cx - 13, y: cy }, gNotes).textContent = r.reason;
      }
      taken.push(right);
    });

    // reported line: solid runs; a lone reading becomes a dot
    const f = filled[strategy];
    let d = '';
    gDots.replaceChildren();
    for (let i = 0; i < n; i++) {
      if (!known[i]) continue;
      const lone = (i === 0 || !known[i - 1]) && (i === n - 1 || !known[i + 1]);
      if (lone) make('circle', { class: 'hg__lone', cx: x(i), cy: y(values[i]), r: 2.75 }, gDots);
      d += `${i === 0 || !known[i - 1] ? 'M' : 'L'}${x(i).toFixed(1)},${y(values[i]).toFixed(1)}`;
    }
    linePath.setAttribute('d', d);

    // estimates: dashed from the last reading through the filled points to the next reading
    let e = '';
    for (const r of runs) {
      if (!f[r.start].est) continue;
      const a = r.start - 1;
      e += `M${x(a).toFixed(1)},${y(values[a]).toFixed(1)}`;
      for (let i = r.start; i <= r.end; i++) {
        e += `L${x(i).toFixed(1)},${y(f[i].v).toFixed(1)}`;
        make('circle', { class: 'hg__est-dot', cx: x(i), cy: y(f[i].v), r: 3 }, gDots);
      }
      if (r.end + 1 < n) e += `L${x(r.end + 1).toFixed(1)},${y(values[r.end + 1]).toFixed(1)}`;
    }
    estPath.setAttribute('d', e);
    crossLine.setAttribute('y1', top);
    crossLine.setAttribute('y2', bottom);
    if (active >= 0) place(active);
  }

  // ---------- hover / keyboard read-out ----------
  function describe(i, long) {
    const p = filled[strategy][i];
    const date = formatDate(dates[i], 'long');
    const r = runOf(i);
    if (!r) return { date, value: `${format(values[i])} ${unit}`, note: 'Reported', kind: 'known' };
    if (!p.est) {
      const why = strategy === 'gap' ? r.reason : `${r.reason} — nothing to ${strategy === 'carry' ? 'carry from' : 'interpolate between'}`;
      return { date, value: 'No reading', note: why, kind: 'missing' };
    }
    const how = p.how === 'carry'
      ? `${long ? r.reason + '. ' : ''}Carried from ${formatDate(dates[p.from], 'short')}`
      : `${long ? r.reason + '. ' : ''}Between ${formatDate(dates[p.from], 'short')} and ${formatDate(dates[p.to], 'short')}`;
    return { date, value: `≈ ${format(p.v)} ${unit}`, note: how, kind: 'est' };
  }
  function place(i) {
    active = i;
    const p = filled[strategy][i];
    const info = describe(i, false);
    root.dataset.hover = info.kind;
    crossLine.setAttribute('x1', x(i));
    crossLine.setAttribute('x2', x(i));
    crossDot.style.display = p.v == null ? 'none' : '';
    if (p.v != null) { crossDot.setAttribute('cx', x(i)); crossDot.setAttribute('cy', y(p.v)); }
    crossDot.classList.toggle('is-est', p.est);
    cross.classList.add('is-on');
    tip.innerHTML = '<span class="hg__tip-date"></span><b class="hg__tip-value"></b><span class="hg__tip-note"></span>';
    tip.children[0].textContent = info.date;
    tip.children[1].textContent = info.value;
    tip.children[2].textContent = info.note;
    tip.dataset.kind = info.kind;
    tip.classList.add('is-on');
    const tw = tip.offsetWidth;
    const right = x(i) + 12 + tw <= W - 2;
    tip.style.transform = `translate(${Math.round(right ? x(i) + 12 : x(i) - 12 - tw)}px, ${M.top + 4}px)`;
  }
  function hide() {
    active = -1;
    cross.classList.remove('is-on');
    tip.classList.remove('is-on');
    delete root.dataset.hover;
  }
  const indexAt = (ev) => {
    const rect = plot.getBoundingClientRect();
    return Math.max(0, Math.min(n - 1, Math.floor((ev.clientX - rect.left - M.left) / step)));
  };
  plot.addEventListener('pointermove', (ev) => { if (ev.pointerType !== 'touch' || ev.buttons) place(indexAt(ev)); });
  plot.addEventListener('pointerdown', (ev) => place(indexAt(ev)));
  plot.addEventListener('pointerleave', (ev) => { if (ev.pointerType === 'mouse') hide(); });
  plot.addEventListener('focus', () => { if (active < 0) place(runs.length ? runs[0].start : n - 1); });
  plot.addEventListener('blur', hide);
  plot.addEventListener('keydown', (ev) => {
    let i = active < 0 ? n - 1 : active;
    if (ev.key === 'ArrowLeft') i--;
    else if (ev.key === 'ArrowRight') i++;
    else if (ev.key === 'Home') i = 0;
    else if (ev.key === 'End') i = n - 1;
    else if (ev.key === 'Escape') { hide(); return; }
    else return;
    ev.preventDefault();
    i = Math.max(0, Math.min(n - 1, i));
    place(i);
    const info = describe(i, true);
    live.textContent = `${info.date}: ${info.value}. ${info.note}.`;
  });

  // ---------- KPIs ----------
  const kTotal = $('[data-kpi="total"]');
  const kAvg = $('[data-kpi="average"]');
  const kCov = $('[data-kpi="coverage"]');
  const nTotal = $('[data-note="total"]');
  const nAvg = $('[data-note="average"]');
  const nCov = $('[data-note="coverage"]');
  const strip = $('.hg__strip');
  const pct = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(1)}%`;
  const shown = { total: null, average: null };
  let rollRaf = 0;
  function roll(to) {
    cancelAnimationFrame(rollRaf);
    const from = { total: shown.total ?? to.total, average: shown.average ?? to.average };
    const t0 = performance.now();
    const dur = calm || shown.total == null ? 0 : 420;
    const frame = (now) => {
      const t = dur ? Math.min(1, (now - t0) / dur) : 1;
      const k = easeOut(t);
      shown.total = from.total + (to.total - from.total) * k;
      shown.average = from.average + (to.average - from.average) * k;
      kTotal.firstChild.nodeValue = format(shown.total);
      kAvg.firstChild.nodeValue = format(shown.average);
      if (t < 1) rollRaf = requestAnimationFrame(frame);
    };
    frame(t0);
  }
  for (const k of [kTotal, kAvg]) k.innerHTML = `0<small> ${unit}</small>`;
  if (strip) strip.replaceChildren(...values.map(() => document.createElement('i')));

  function updateKpis() {
    const s = summary(strategy);
    const base = summary('gap');
    roll(s);
    root.dataset.strategy = strategy;
    kCov.innerHTML = `${s.knownCount}<small> of ${n} days</small>`;
    if (strategy === 'gap') {
      nTotal.textContent = `${base.knownCount} reported days only — a floor`;
      nAvg.textContent = `Over ${base.knownCount} reported days`;
      nCov.textContent = `${base.missing} days missing in ${runs.length} ${runs.length === 1 ? 'gap' : 'gaps'}`;
    } else {
      nTotal.innerHTML = `<b></b> estimated, <span class="hg__chg"></span>`;
      nTotal.querySelector('b').textContent = `${format(s.est)} ${unit}`;
      nTotal.querySelector('.hg__chg').textContent = `${pct(s.change)} vs reported`;
      nAvg.textContent = `Over ${s.count} days, ${s.estCount} estimated`;
      nCov.textContent = `${s.estCount} estimated${s.missing ? `, ${s.missing} still missing` : ''}`;
    }
    if (strip) {
      const f = filled[strategy];
      [...strip.children].forEach((el, i) => { el.className = known[i] ? 'k' : f[i].est ? 'e' : 'm'; });
    }
    return s;
  }

  // ---------- strategy switch: a radio group with arrow keys ----------
  function setStrategy(id, announce) {
    if (!(id in STRATEGIES)) return;
    strategy = id;
    radios.forEach((b) => {
      const on = b.dataset.strategy === id;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
    });
    const i = radios.findIndex((b) => b.dataset.strategy === id);
    seg.style.setProperty('--hg-i', i);
    render();
    const s = updateKpis();
    if (announce) {
      live.textContent = id === 'gap'
        ? `${STRATEGIES[id]}: total ${format(s.total)} ${unit} over ${s.knownCount} reported days, ${s.missing} missing.`
        : `${STRATEGIES[id]}: total ${format(s.total)} ${unit}, ${s.estCount} days estimated, ${pct(s.change)} versus reported only.`;
    }
  }
  seg.style.setProperty('--hg-n', radios.length);
  radios.forEach((b, i) => {
    b.addEventListener('click', () => setStrategy(b.dataset.strategy, true));
    b.addEventListener('keydown', (ev) => {
      const dir = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[ev.key];
      if (!dir) return;
      ev.preventDefault();
      const next = radios[(i + dir + radios.length) % radios.length];
      next.focus();
      setStrategy(next.dataset.strategy, true);
    });
  });

  new ResizeObserver(() => render()).observe(plot);
  setStrategy(strategy, false);

  return {
    setStrategy: (id) => setStrategy(id, false),
    show: (i) => { render(); place(Math.max(0, Math.min(n - 1, i))); },
    summary
  };
}
