/* Dither Density Chart — a heatmap printed in one ink, where the share of inked area in a cell is its value.
   Three screens: ordered dither on a Bayer matrix (built recursively), a 45° halftone whose dot area equals the value
   (paper holes above one half), and a line screen whose line width equals the value. The legend is the same ladder
   printed by the same code. Hover, touch or arrow keys give the exact number.
   Canvas 2D; pixels are computed once per mode and size, a mode switch wipes the new print in with rAF, then stops. */

const MODES = {
  bayer: { label: 'Bayer', spec: (p) => `Ordered dither ${p.matrix}×${p.matrix} · ${p.matrix * p.matrix + 1} levels` },
  halftone: { label: 'Halftone', spec: (p) => `Halftone 45° · ${p.pitchCss.toFixed(0)} px screen` },
  lines: { label: 'Lines', spec: (p) => `Line screen · ${p.pitchCss.toFixed(0)} px` }
};
const WIPE_MS = 520;
const STEPS = 9; // legend swatches: 0, 1/8 … 1

/** Bayer index matrix of size n (a power of two): each quadrant of the 2n matrix is 4·M plus 0, 2, 3, 1. */
export function bayerMatrix(n) {
  if (n === 1) return [[0]];
  const half = bayerMatrix(n / 2);
  const h = n / 2;
  const q = [[0, 2], [3, 1]];
  return Array.from({ length: n }, (_, y) => Array.from({ length: n }, (_, x) =>
    4 * half[y % h][x % h] + q[y < h ? 0 : 1][x < h ? 0 : 1]));
}

// any CSS colour → [r, g, b] through the canvas parser
const probe = document.createElement('canvas').getContext('2d');
function rgb(color) {
  probe.fillStyle = '#000';
  probe.fillStyle = color;
  const s = probe.fillStyle;
  if (s[0] === '#') return [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
  return s.match(/[\d.]+/g).slice(0, 3).map(Number);
}

/**
 * Prints a rows×cols grid of values 0…1 into an RGBA buffer of w×h device pixels.
 * p: { mode, dot, pitch, gap, ink, paper, threshold } — dot and pitch in device pixels.
 * Returns the cell rectangles in device pixels.
 */
function print(buf, w, h, rows, cols, at, p) {
  const data = buf.data;
  const g = p.gap;
  const rects = [];
  const th = p.threshold;
  const tn = th.length;
  const aa = 1 / p.pitch; // one device pixel, in screen periods
  const s2 = Math.SQRT1_2 / p.pitch;
  for (let r = 0; r < rows; r++) {
    const y0 = Math.round((r * (h + g)) / rows);
    const y1 = Math.round(((r + 1) * (h + g)) / rows) - g;
    for (let c = 0; c < cols; c++) {
      const x0 = Math.round((c * (w + g)) / cols);
      const x1 = Math.round(((c + 1) * (w + g)) / cols) - g;
      rects.push([x0, y0, x1 - x0, y1 - y0]);
      const v = Math.max(0, Math.min(1, at(r, c)));
      // halftone radius in screen periods: ink dots up to one half, paper holes above it — area equals v either way
      const hole = v > 0.5;
      const rad = Math.sqrt((hole ? 1 - v : v) / Math.PI);
      for (let y = y0; y < y1; y++) {
        let i = (y * w + x0) * 4;
        for (let x = x0; x < x1; x++, i += 4) {
          let cov;
          if (p.mode === 'bayer') {
            const bx = Math.floor(x / p.dot) % tn;
            const by = Math.floor(y / p.dot) % tn;
            cov = v > th[by][bx] ? 1 : 0;
          } else if (p.mode === 'halftone') {
            const u = (x + y + 1) * s2;
            const t = (x - y) * s2;
            const du = u - Math.floor(u) - 0.5;
            const dt = t - Math.floor(t) - 0.5;
            const d = Math.sqrt(du * du + dt * dt);
            cov = Math.max(0, Math.min(1, (rad - d) / aa + 0.5));
            if (hole) cov = 1 - cov;
            if (v === 0) cov = 0;
          } else {
            const f = (y + 0.5) / p.pitch;
            const dist = Math.abs(f - Math.floor(f) - 0.5); // 0 at the line centre, 0.5 between lines
            cov = Math.max(0, Math.min(1, (v / 2 - dist) / aa + 0.5));
            if (v === 0) cov = 0;
          }
          data[i] = p.paper[0] + (p.ink[0] - p.paper[0]) * cov;
          data[i + 1] = p.paper[1] + (p.ink[1] - p.paper[1]) * cov;
          data[i + 2] = p.paper[2] + (p.ink[2] - p.paper[2]) * cov;
          data[i + 3] = 255;
        }
      }
    }
  }
  return rects;
}

/**
 * ditherDensity(root, { values, rowLabels, colLabel, cellLabel, format, unit, mode, matrix })
 *   values   — rows × cols array of numbers (≥ 0); the darkest cell is the maximum.
 *   colLabel(c) — tick text or '' for column c; cellLabel(r, c) — words for one cell ("Thu, 19:00–20:00").
 * Returns { setMode(id), show(r, c) }.
 */
export function ditherDensity(root, opts) {
  const { values, rowLabels, colLabel, cellLabel, format = String, unit = '' } = opts;
  const rows = values.length;
  const cols = values[0].length;
  const max = Math.max(...values.flat()) || 1;
  const matrix = opts.matrix ?? 8;
  const levels = matrix * matrix;
  const threshold = bayerMatrix(matrix).map((row) => row.map((k) => (k + 0.5) / levels));
  const $ = (s) => root.querySelector(s);
  const plot = $('.dd__plot');
  const canvas = $('.dd__canvas');
  const ctx = canvas.getContext('2d');
  const legend = $('.dd__ramp');
  const lctx = legend.getContext('2d');
  const seg = $('.dd__seg');
  const radios = [...seg.querySelectorAll('[data-mode]')];
  const live = $('.dd__live');
  const spec = $('.dd__spec');
  const focus = $('.dd__focus');
  const tip = $('.dd__tip');
  const caret = $('.dd__caret');
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dark = matchMedia('(prefers-color-scheme: dark)');

  // axis labels
  const rowBox = $('.dd__rows');
  rowBox.replaceChildren(...rowLabels.map((t) => Object.assign(document.createElement('span'), { textContent: t })));
  const colBox = $('.dd__cols');
  function colTicks(narrow) {
    colBox.replaceChildren();
    for (let c = 0; c < cols; c++) {
      const t = colLabel(c, narrow);
      if (!t) continue;
      const s = document.createElement('span');
      s.textContent = t;
      s.style.left = `${((c + 0.5) / cols) * 100}%`;
      colBox.append(s);
    }
  }

  // legend numbers under every other swatch
  const rampLabels = $('.dd__ramp-labels');
  if (rampLabels) {
    rampLabels.replaceChildren(...[0, 2, 4, 6, 8].map((k) => {
      const s = document.createElement('span');
      s.textContent = format((max * k) / (STEPS - 1));
      s.style.left = `${((k + 0.5) / STEPS) * 100}%`;
      return s;
    }));
  }

  // a hidden table with every number, for screen readers
  const table = $('.dd__table');
  if (table) {
    const head = `<tr><th></th>${Array.from({ length: cols }, (_, c) => `<th scope="col">${cellLabel(0, c).split(', ').pop()}</th>`).join('')}</tr>`;
    table.innerHTML = head + values.map((row, r) =>
      `<tr><th scope="row">${rowLabels[r]}</th>${row.map((v) => `<td>${format(v)}</td>`).join('')}</tr>`).join('');
  }

  let mode = opts.mode in MODES ? opts.mode : 'bayer';
  let cache = {};             // mode → { canvas, rects }
  let params = null;
  let W = 0, H = 0, dpr = 1;
  let rects = [];
  let active = null;          // [r, c]
  let wipe = null;            // { from, to, t0 }
  let raf = 0;

  function measure() {
    dpr = Math.min(3, window.devicePixelRatio || 1);
    const w = plot.clientWidth;
    const h = plot.clientHeight;
    W = Math.round(w * dpr); H = Math.round(h * dpr);
    canvas.width = W; canvas.height = H;
    const cellCss = w / cols;
    const styles = getComputedStyle(root);
    // screens scale with the cell, so a narrow phone cell still holds a few dots
    const pitchCss = Math.max(4, Math.min(7, cellCss / 4.2));
    params = {
      dot: Math.max(1, Math.round((cellCss >= 18 ? 2 : 1) * dpr)),
      pitch: pitchCss * dpr,
      pitchCss,
      gap: Math.max(1, Math.round(2 * dpr)),
      ink: rgb(styles.getPropertyValue('--dd-ink').trim()),
      paper: rgb(styles.getPropertyValue('--dd-paper').trim()),
      threshold, matrix
    };
    cache = {};
    colTicks(cellCss < 20);
  }

  function printed(id) {
    if (cache[id]) return cache[id];
    const off = document.createElement('canvas');
    off.width = W; off.height = H;
    const octx = off.getContext('2d');
    const buf = octx.createImageData(W, H);
    const r = print(buf, W, H, rows, cols, (rr, cc) => values[rr][cc] / max, { ...params, mode: id });
    octx.putImageData(buf, 0, 0);
    cache[id] = { canvas: off, rects: r };
    return cache[id];
  }

  function drawLegend() {
    const steps = STEPS;
    const lw = legend.clientWidth, lh = legend.clientHeight;
    const w = Math.round(lw * dpr), h = Math.round(lh * dpr);
    if (!w || !h) return;
    legend.width = w; legend.height = h;
    const buf = lctx.createImageData(w, h);
    print(buf, w, h, 1, steps, (r, c) => c / (steps - 1), { ...params, mode });
    lctx.putImageData(buf, 0, 0);
  }

  function paint() {
    const cur = printed(mode);
    rects = cur.rects;
    ctx.clearRect(0, 0, W, H);
    if (wipe) {
      const k = Math.min(1, (performance.now() - wipe.t0) / WIPE_MS);
      const e = 1 - (1 - k) ** 3;
      const edge = Math.round(e * W);
      ctx.drawImage(printed(wipe.from).canvas, 0, 0);
      if (edge > 0) ctx.drawImage(cur.canvas, 0, 0, edge, H, 0, 0, edge, H);
      // the print head: a thin bar of ink at the edge
      ctx.fillStyle = `rgb(${params.ink.join(',')})`;
      ctx.globalAlpha = 0.85 * (1 - k);
      ctx.fillRect(Math.max(0, edge - dpr), 0, Math.max(1, Math.round(1.5 * dpr)), H);
      ctx.globalAlpha = 1;
      if (k < 1) { raf = requestAnimationFrame(paint); return; }
      wipe = null;
      ctx.clearRect(0, 0, W, H);
    }
    ctx.drawImage(cur.canvas, 0, 0);
  }

  function setMode(id, animate) {
    if (!(id in MODES)) return;
    const prev = mode;
    mode = id;
    radios.forEach((b) => {
      const on = b.dataset.mode === id;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
    });
    seg.style.setProperty('--dd-i', radios.findIndex((b) => b.dataset.mode === id));
    root.dataset.mode = id;
    spec.textContent = MODES[id].spec(params);
    cancelAnimationFrame(raf);
    wipe = animate && !calm && prev !== id && W ? { from: prev, t0: performance.now() } : null;
    paint();
    drawLegend();
    if (animate) live.textContent = `${MODES[id].label}. ${spec.textContent}.`;
  }

  // ---------- read-out ----------
  function show(r, c, announce) {
    active = [r, c];
    const [x, y, w, h] = rects[r * cols + c];
    const v = values[r][c];
    focus.style.transform = `translate(${x / dpr - 2}px, ${y / dpr - 2}px)`;
    focus.style.width = `${w / dpr + 4}px`;
    focus.style.height = `${h / dpr + 4}px`;
    focus.classList.add('is-on');
    tip.innerHTML = '<span></span><b></b><span></span>';
    tip.children[0].textContent = cellLabel(r, c);
    tip.children[1].textContent = `${format(v)} ${unit}`;
    tip.children[2].textContent = `${Math.round((v / max) * 100)}% of the peak`;
    tip.classList.add('is-on');
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    const cx = (x + w / 2) / dpr;
    const left = Math.max(0, Math.min(plot.clientWidth - tw, cx - tw / 2));
    const above = y / dpr - th - 8;
    tip.style.transform = `translate(${Math.round(left)}px, ${Math.round(above >= -40 ? above : (y + h) / dpr + 8)}px)`;
    caret.style.left = `${(((v / max) * (STEPS - 1) + 0.5) / STEPS) * 100}%`;
    caret.classList.add('is-on');
    if (announce) live.textContent = `${cellLabel(r, c)}: ${format(v)} ${unit}, ${Math.round((v / max) * 100)}% of the peak.`;
  }
  function hide() {
    active = null;
    focus.classList.remove('is-on');
    tip.classList.remove('is-on');
    caret.classList.remove('is-on');
  }
  function cellAt(ev) {
    const b = canvas.getBoundingClientRect();
    const x = (ev.clientX - b.left) * dpr, y = (ev.clientY - b.top) * dpr;
    const c = Math.max(0, Math.min(cols - 1, Math.floor((x / (W + params.gap)) * cols)));
    const r = Math.max(0, Math.min(rows - 1, Math.floor((y / (H + params.gap)) * rows)));
    return [r, c];
  }
  plot.addEventListener('pointermove', (ev) => { if (ev.pointerType !== 'touch' || ev.buttons) show(...cellAt(ev)); });
  plot.addEventListener('pointerdown', (ev) => show(...cellAt(ev)));
  plot.addEventListener('pointerleave', (ev) => { if (ev.pointerType === 'mouse') hide(); });
  plot.addEventListener('focus', () => {
    if (active) return;
    let best = [0, 0];
    values.forEach((row, r) => row.forEach((v, c) => { if (v > values[best[0]][best[1]]) best = [r, c]; }));
    show(...best, true);
  });
  plot.addEventListener('blur', hide);
  plot.addEventListener('keydown', (ev) => {
    const d = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[ev.key];
    if (ev.key === 'Escape') { hide(); return; }
    if (!d && ev.key !== 'Home' && ev.key !== 'End') return;
    ev.preventDefault();
    let [r, c] = active ?? [0, 0];
    if (d) { r = Math.max(0, Math.min(rows - 1, r + d[0])); c = Math.max(0, Math.min(cols - 1, c + d[1])); }
    else c = ev.key === 'Home' ? 0 : cols - 1;
    show(r, c, true);
  });

  // ---------- mode switch: a radio group with arrow keys ----------
  seg.style.setProperty('--dd-n', radios.length);
  radios.forEach((b, i) => {
    b.addEventListener('click', () => setMode(b.dataset.mode, true));
    b.addEventListener('keydown', (ev) => {
      const dir = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[ev.key];
      if (!dir) return;
      ev.preventDefault();
      const next = radios[(i + dir + radios.length) % radios.length];
      next.focus();
      setMode(next.dataset.mode, true);
    });
  });

  function refresh() {
    measure();
    if (!W || !H) return;
    wipe = null;
    setMode(mode, false);
    if (active) show(...active);
  }
  let pending = 0;
  new ResizeObserver(() => { cancelAnimationFrame(pending); pending = requestAnimationFrame(refresh); }).observe(plot);
  dark.addEventListener('change', refresh);
  refresh();

  return { setMode: (id) => setMode(id, false), show: (r, c) => show(r, c, false) };
}
