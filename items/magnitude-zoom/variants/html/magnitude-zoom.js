/* Magnitude Zoom — a continuous log zoom through quantities a thousand times apart.
   Every tier is a block made of exactly cols × rows copies of the tier before it, all anchored at one corner,
   so the previous block shrinks into the corner of the next one and stays there as a landmark.
   The camera lives in log space: t = log10(count). The block for 10^t is filled in reading order. */

const OMEGA = 8.5;       // camera spring, rad/s, critically damped
const SNAP = 0.6;        // a tier within this many orders catches the camera when you let go
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/**
 * @param {HTMLElement} root  .mz with .mz__plot, .mz__ruler, .mz__tiers, .mz__num, .mz__unit, .mz__say, .mz__live inside
 * @param {object} o
 *   tiers — [{ name, short, count, cols, rows, note }]; tier 0 is one unit (cols = rows = 1),
 *           tier k is cols × rows blocks of tier k-1, so cols * rows = count_k / count_(k-1)
 *   unit  — 'seconds'; unitOne — 'second' for a count of one
 *   say   — (value) => short text for the number, e.g. '≈ 11.6 days'
 *   start — starting t (log10 of the count)
 */
export function magnitudeZoom(root, o) {
  const tiers = o.tiers.map((tr) => ({ ...tr }));
  tiers.forEach((tr, k) => {
    tr.w = k ? tiers[k - 1].w * tr.cols : 1;
    tr.h = k ? tiers[k - 1].h * tr.rows : 1;
    tr.tau = Math.log10(tr.count);
  });
  const T0 = tiers[0].tau, T1 = tiers[tiers.length - 1].tau;
  const plot = root.querySelector('.mz__plot');
  const ruler = root.querySelector('.mz__ruler');
  const chips = root.querySelector('.mz__tiers');
  const numEl = root.querySelector('.mz__num');
  const unitEl = root.querySelector('.mz__unit');
  const sayEl = root.querySelector('.mz__say');
  const live = root.querySelector('.mz__live');
  const canvas = el('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  plot.append(canvas);
  const ctx = canvas.getContext('2d');

  let t = clamp(o.start ?? T0, T0, T1), v = 0, target = t;
  let W = 0, H = 0, dpr = 1, raf = 0, last = 0, settledAt = null;
  let colors = [], ink = '#000', ink2 = '#555', ink3 = '#888', grid = 'rgba(0,0,0,.1)', surface = '#fff', dark = false;
  const fmt = new Intl.NumberFormat('en-US');
  const unitFor = (count) => (Math.abs(count - 1) < 1e-9 ? o.unitOne ?? o.unit : o.unit);
  const fmt3 = new Intl.NumberFormat('en-US', { maximumSignificantDigits: 3 });

  function readColors() {
    const cs = getComputedStyle(root);
    colors = tiers.map((_, k) => cs.getPropertyValue(`--mz-t${k}`).trim() || '#888');
    ink = cs.getPropertyValue('--mz-ink').trim();
    ink2 = cs.getPropertyValue('--mz-ink-2').trim();
    ink3 = cs.getPropertyValue('--mz-ink-3').trim();
    grid = cs.getPropertyValue('--mz-grid').trim();
    surface = cs.getPropertyValue('--mz-surface').trim();
    dark = matchMedia('(prefers-color-scheme: dark)').matches;
  }

  // ---- plot is the slider
  plot.setAttribute('role', 'slider');
  plot.setAttribute('aria-orientation', 'vertical');
  plot.setAttribute('aria-valuemin', String(T0));
  plot.setAttribute('aria-valuemax', String(T1));
  if (!plot.hasAttribute('tabindex')) plot.tabIndex = 0;

  // ---- ruler of orders
  const thumb = el('span', 'mz__thumb');
  if (ruler) {
    ruler.setAttribute('aria-hidden', 'true');
    ruler.append(el('span', 'mz__rail'));
    for (let p = Math.ceil(T0); p <= T1; p++) {
      const tier = tiers.find((tr) => Math.abs(tr.tau - p) < 1e-9);
      const top = `${(1 - (p - T0) / (T1 - T0)) * 100}%`;
      const tick = el('span', `mz__tick${tier ? ' mz__tick--tier' : ''}`);
      tick.style.top = top;
      const lab = el('span', `mz__tick-label${tier ? ' mz__tick-label--tier' : ''}`, esc(tier ? tier.short : shortNum(10 ** p)));
      lab.style.top = top;
      ruler.append(tick, lab);
    }
    ruler.append(thumb);
  }

  // ---- tier chips
  const chipBtns = tiers.map((tr, k) => {
    const li = el('li');
    const b = el('button', null, `<i style="background:var(--mz-t${k})"></i>${esc(tr.name)}`);
    b.type = 'button';
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => go(tr.tau));
    li.append(b);
    chips?.append(li);
    return b;
  });

  // ---- motion
  function go(to, instant = reduced()) {
    target = clamp(to, T0, T1);
    if (instant) { t = target; v = 0; }
    kick();
  }
  function kick() {
    if (raf) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function frame(now) {
    raf = 0;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    for (let s = 0, n = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / n; s < n; s++) {
      v += (OMEGA * OMEGA * (target - t) - 2 * OMEGA * v) * h;
      t += v * h;
    }
    const moving = Math.abs(target - t) > 0.0004 || Math.abs(v) > 0.002;
    if (!moving) { t = target; v = 0; }
    render();
    if (moving) raf = requestAnimationFrame(frame);
    else settled();
  }
  function settled() {
    if (settledAt === t) return;
    settledAt = t;
    const near = tiers.find((tr) => Math.abs(tr.tau - t) < 0.02);
    if (live) live.textContent = near ? `${near.name}: ${fmt.format(near.count)} ${unitFor(near.count)}, ${o.say(near.count)}. ${near.note ?? ''}` : `${fmt3.format(10 ** t)} ${o.unit}, ${o.say(10 ** t)}`;
  }
  function snapNear(at) {
    const tr = tiers.reduce((a, b) => (Math.abs(b.tau - at) < Math.abs(a.tau - at) ? b : a));
    return Math.abs(tr.tau - at) <= SNAP ? tr.tau : at;
  }

  // ---- camera: the box being framed is interpolated in log space between tier blocks
  function camera(at) {
    let k = 0;
    while (k < tiers.length - 2 && at > tiers[k + 1].tau) k++;
    const a = tiers[k], b = tiers[k + 1] ?? a;
    const f = b === a ? 0 : clamp((at - a.tau) / (b.tau - a.tau), 0, 1);
    const bw = Math.exp(Math.log(a.w) + (Math.log(b.w) - Math.log(a.w)) * f);
    const bh = Math.exp(Math.log(a.h) + (Math.log(b.h) - Math.log(a.h)) * f);
    const padT = 58, padB = 34, padX = 18;
    const s = Math.min((W - 2 * padX) / bw, (H - padT - padB) / bh) * 0.82;
    const cx = W / 2, cy = padT + (H - padT - padB) / 2;
    return { s, ox: cx - (bw / 2) * s, oy: cy + (bh / 2) * s };
  }

  // ---- drawing
  function rect(x0, y0, x1, y1) { // screen rect clamped so huge blocks stay finite
    const L = clamp(Math.min(x0, x1), -20, W + 20), R = clamp(Math.max(x0, x1), -20, W + 20);
    const T = clamp(Math.min(y0, y1), -20, H + 20), B = clamp(Math.max(y0, y1), -20, H + 20);
    if (R - L > 0 && B - T > 0) ctx.rect(L, T, R - L, B - T);
  }
  function render() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const { s, ox, oy } = camera(t);
    const X = (wx) => ox + wx * s, Y = (wy) => oy - wy * s;

    // the block that holds the current count; bigger blocks are not drawn yet
    const C = 10 ** t;
    let host = tiers.findIndex((tr) => tr.count >= C * (1 - 1e-9));
    if (host < 0) host = tiers.length - 1;

    // tint of each block up to the host, biggest first
    for (let k = host; k >= 0; k--) {
      const tr = tiers[k];
      ctx.beginPath();
      rect(X(0), Y(0), X(tr.w), Y(tr.h));
      ctx.globalAlpha = k === 0 ? 0.9 : dark ? 0.1 : 0.06;
      ctx.fillStyle = colors[k];
      ctx.fill();
    }

    // the count itself: 10^t units, filled row by row from the corner
    if (host > 0) {
      ctx.beginPath();
      fillCount(host, C, 0, 0, 0, X, Y);
      ctx.globalAlpha = dark ? 0.42 : 0.3;
      ctx.fillStyle = colors[host];
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // inner grid of each block: lines between its sub-blocks, faded in by on-screen size
    ctx.lineWidth = 1;
    for (let k = 1; k <= host; k++) {
      const tr = tiers[k], sub = tiers[k - 1];
      const sx = sub.w * s, sy = sub.h * s;
      const a = clamp((Math.min(sx, sy) - 4) / 16, 0, 1);
      if (a <= 0.01) continue;
      ctx.beginPath();
      const yTop = clamp(Y(tr.h), 0, H), yBot = clamp(Y(0), 0, H), xL = clamp(X(0), 0, W), xR = clamp(X(tr.w), 0, W);
      for (let i = Math.max(1, Math.ceil(-ox / sx)); i < tr.cols && X(i * sub.w) <= W; i++) {
        const gx = Math.round(X(i * sub.w)) + 0.5;
        ctx.moveTo(gx, yTop); ctx.lineTo(gx, yBot);
      }
      for (let j = Math.max(1, Math.ceil((oy - H) / sy)); j < tr.rows && Y(j * sub.h) >= 0; j++) {
        const gy = Math.round(Y(j * sub.h)) + 0.5;
        ctx.moveTo(xL, gy); ctx.lineTo(xR, gy);
      }
      ctx.globalAlpha = a;
      ctx.strokeStyle = grid;
      ctx.stroke();
    }

    // outlines
    ctx.globalAlpha = 1;
    for (let k = host; k >= 1; k--) {
      const tr = tiers[k];
      if (tr.w * s < 3) continue;
      const x0 = clamp(X(0), -4, W + 4), y0 = clamp(Y(tr.h), -4, H + 4), x1 = clamp(X(tr.w), -4, W + 4), y1 = clamp(Y(0), -4, H + 4);
      ctx.beginPath();
      ctx.rect(Math.round(x0) + 0.5, Math.round(y0) + 0.5, Math.round(x1 - x0), Math.round(y1 - y0));
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = colors[k];
      ctx.stroke();
    }

    // labels: a block big enough carries its name above it (the host, when its top is off screen, in its top-right
    // corner); the largest block too small for a name becomes a pin with a leader line
    let pinned = false, above = null;
    for (let k = host; k >= 0; k--) {
      const tr = tiers[k];
      const sw = tr.w * s;
      const x0 = X(0), y0 = Y(tr.h);
      const big = clamp((sw - 40) / 26, 0, 1);
      if (big > 0.01) {
        ctx.globalAlpha = big;
        const sub = `${fmt.format(tr.count)} ${unitFor(tr.count)} · ${o.say(tr.count)}`;
        if (y0 - 30 >= 14) { label(Math.max(x0, 12), y0 - 28, tr.name, sub, colors[k], false); above = { x: Math.max(x0, 12), y: y0 - 28 }; }
        else if (k === host) label(Math.min(X(tr.w), W) - 14, Math.max(y0, 0) + 26, tr.name, sub, colors[k], true);
      }
      if (big < 0.99 && !pinned && sw > 0) {
        pinned = true;
        ctx.globalAlpha = 1 - big;
        pin(tr, k, X, Y, s, above);
      }
    }
    ctx.globalAlpha = 1;
    updateText();
  }
  function pin(tr, k, X, Y, s, above) {
    const sw = tr.w * s;
    const cx = X(tr.w / 2), cy = Y(tr.h / 2), rr = Math.max(6, Math.hypot(tr.w, tr.h) * s / 2 + 2);
    ctx.beginPath();
    ctx.arc(cx, cy, rr + 3, 0, Math.PI * 2);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = colors[k];
    ctx.stroke();
    if (sw < 6) {
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fillStyle = colors[k];
      ctx.fill();
    }
    const up = !(above && Math.abs(above.y - (cy - rr - 20)) < 60);
    const lx = cx + rr + 24, ly = up ? cy - rr - 20 : cy + rr + 22;
    ctx.beginPath();
    ctx.moveTo(cx + (rr + 3) * 0.71, cy + (up ? -1 : 1) * (rr + 3) * 0.71);
    ctx.lineTo(lx - 5, up ? ly + 5 : ly - 10);
    ctx.lineWidth = 1;
    ctx.strokeStyle = ink3;
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '650 12.5px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.fillStyle = ink;
    ctx.fillText(tr.name, lx, ly);
    const nw = ctx.measureText(tr.name).width;
    ctx.font = '12.5px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.fillStyle = ink2;
    ctx.fillText(o.say(tr.count), lx + nw + 7, ly);
  }
  function label(x, y, title, sub, color, right) {
    ctx.textBaseline = 'alphabetic';
    ctx.font = '650 14px system-ui, -apple-system, "Segoe UI", sans-serif';
    const tw = ctx.measureText(title).width;
    ctx.textAlign = right ? 'right' : 'left';
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(right ? x - tw - 14 : x), Math.round(y - 9), 8, 8);
    ctx.fillStyle = ink;
    ctx.fillText(title, right ? x : x + 14, y);
    ctx.font = '12.5px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.fillStyle = ink2;
    ctx.fillText(sub, x, y + 18);
    ctx.textAlign = 'left';
  }
  // fill `count` units inside block of tier k whose corner is at world (wx, wy)
  function fillCount(k, count, wx, wy, depth, X, Y) {
    const tr = tiers[k], sub = tiers[k - 1];
    const n = count / sub.count, F = Math.floor(n + 1e-9);
    const full = Math.floor(F / tr.cols), rem = F % tr.cols;
    if (full) rect(X(wx), Y(wy), X(wx + tr.cols * sub.w), Y(wy + full * sub.h));
    if (rem && full < tr.rows) rect(X(wx), Y(wy + full * sub.h), X(wx + rem * sub.w), Y(wy + (full + 1) * sub.h));
    const p = n - F;
    if (p > 1e-6 && full < tr.rows) {
      const cx = wx + rem * sub.w, cy = wy + full * sub.h;
      if (k - 1 >= 1 && depth < 2) fillCount(k - 1, p * sub.count, cx, cy, depth + 1, X, Y);
      else rect(X(cx), Y(cy), X(cx + p * sub.w), Y(cy + sub.h));
    }
  }

  // ---- text outside the canvas
  function updateText() {
    const C = 10 ** t;
    const near = tiers.find((tr) => Math.abs(tr.tau - t) < 0.015);
    if (numEl) numEl.textContent = near ? fmt.format(near.count) : fmt3.format(C);
    if (unitEl) unitEl.textContent = unitFor(near ? near.count : C);
    if (sayEl) {
      const tierNote = tiers.find((tr) => Math.abs(tr.tau - t) < 0.12)?.note;
      sayEl.innerHTML = `<b>${esc(o.say(near ? near.count : C))}</b>${tierNote ? `. ${esc(tierNote)}` : ''}`;
    }
    thumb.style.top = `${(1 - (t - T0) / (T1 - T0)) * 100}%`;
    plot.setAttribute('aria-valuenow', t.toFixed(2));
    plot.setAttribute('aria-valuetext', `${near ? fmt.format(near.count) : fmt3.format(C)} ${unitFor(near ? near.count : C)}, ${o.say(near ? near.count : C)}`);
    const nearest = tiers.reduce((a, b) => (Math.abs(b.tau - t) < Math.abs(a.tau - t) ? b : a));
    chipBtns.forEach((b, k) => b.setAttribute('aria-pressed', String(tiers[k] === nearest && Math.abs(nearest.tau - t) < 0.5)));
  }

  // ---- input
  // wheel and trackpad: continuous; after a pause the nearest tier catches the camera
  let idle = 0;
  plot.addEventListener('wheel', (e) => {
    e.preventDefault();
    const d = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1);
    target = clamp(target + d * (e.ctrlKey ? 0.012 : 0.0035), T0, T1);
    if (reduced()) t = target;
    kick();
    clearTimeout(idle);
    idle = setTimeout(() => go(snapNear(target), false), 220);
  }, { passive: false });

  // drag: up = bigger; two fingers: pinch apart = smaller
  const pts = new Map();
  let base = null;
  function startGesture() {
    const p = [...pts.values()];
    base = { t: target, y: p[0].y, d: p.length > 1 ? Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) : 0 };
  }
  plot.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    plot.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    startGesture();
  });
  plot.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = [...pts.values()];
    if (p.length > 1 && base.d > 0) target = clamp(base.t - 2 * Math.log10(Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) / base.d), T0, T1);
    else target = clamp(base.t - (p[0].y - base.y) * 0.014, T0, T1);
    t = target; v = 0;
    kick();
  });
  const end = (e) => {
    if (!pts.delete(e.pointerId)) return;
    if (pts.size) startGesture();
    else go(snapNear(target), false);
  };
  plot.addEventListener('pointerup', end);
  plot.addEventListener('pointercancel', end);

  // ruler: press or drag to scrub
  if (ruler) {
    const at = (e) => {
      const b = ruler.getBoundingClientRect();
      return T1 - clamp((e.clientY - b.top) / b.height, 0, 1) * (T1 - T0);
    };
    let dragging = false;
    ruler.addEventListener('pointerdown', (e) => { dragging = true; ruler.setPointerCapture(e.pointerId); go(at(e), false); });
    ruler.addEventListener('pointermove', (e) => { if (dragging) go(at(e), false); });
    const stop = () => { if (dragging) { dragging = false; go(snapNear(target), false); } };
    ruler.addEventListener('pointerup', stop);
    ruler.addEventListener('pointercancel', stop);
  }

  // keys: ↑/→ one order up, ↓/← one down, PageUp/PageDown the next tier, Home/End the ends
  plot.addEventListener('keydown', (e) => {
    const nextTier = (dir) => {
      const list = tiers.map((tr) => tr.tau);
      return dir > 0 ? (list.find((x) => x > target + 0.01) ?? T1) : ([...list].reverse().find((x) => x < target - 0.01) ?? T0);
    };
    const map = {
      ArrowUp: () => Math.round(target) + 1, ArrowRight: () => Math.round(target) + 1, '+': () => Math.round(target) + 1, '=': () => Math.round(target) + 1,
      ArrowDown: () => Math.round(target) - 1, ArrowLeft: () => Math.round(target) - 1, '-': () => Math.round(target) - 1,
      PageUp: () => nextTier(1), PageDown: () => nextTier(-1), Home: () => T0, End: () => T1
    };
    const f = map[e.key];
    if (!f) return;
    e.preventDefault();
    go(f());
  });

  // ---- size and theme
  function resize() {
    const b = plot.getBoundingClientRect();
    const w = Math.round(b.width), h = Math.round(b.height);
    if (!w || !h || (w === W && h === H)) return;
    W = w; H = h;
    dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    render();
  }
  new ResizeObserver(resize).observe(plot);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { readColors(); render(); });
  readColors();
  resize();
  settled();

  return {
    go: (to, instant) => go(to, instant),
    get value() { return t; }
  };
}

function shortNum(v) {
  const units = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
  for (const [d, s] of units) if (v >= d) return `${Math.round(v / d)}${s}`;
  return String(Math.round(v));
}
