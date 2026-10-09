/* Haptic Scrub Chart — a line chart you read by dragging a finger along it.
   The value comes back three ways at once:
   - on screen: a big number above the finger, a dot on the line, the grid line or extremum that was crossed flashes;
   - sound: short synthesized ticks (Web Audio), a pulse train whose rate follows the value, a click per grid line,
     a double tick on a peak or valley;
   - vibration, where the browser has navigator.vibrate (Android): the same pulses, clicks and double pulses.
   Markup: see index.html. Usage: hapticScrub(root, { xs, ys, gridStep, format, formatX }). */

const NS = 'http://www.w3.org/2000/svg';
const svgEl = (name, attrs = {}, parent) => {
  const n = document.createElementNS(NS, name);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
};
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* ── extrema: a local top (bottom) within ±win samples whose prominence is at least `prominence`.
      Prominence: walk left and right until a higher (lower) point or the edge, take the deepest dip (highest rise)
      on each side; the shallower of the two sides is how far the point stands out. ── */
function findExtrema(ys, win, prominence) {
  const out = new Map(), n = ys.length;
  const standOut = (i, s) => { // s = 1 for peaks, -1 for valleys
    let worst = [Infinity, Infinity];
    for (const [side, dir] of [[0, -1], [1, 1]]) {
      let m = s * ys[i];
      for (let j = i + dir; j >= 0 && j < n && s * ys[j] <= s * ys[i]; j += dir) m = Math.min(m, s * ys[j]);
      worst[side] = s * ys[i] - m;
    }
    return Math.min(worst[0], worst[1]);
  };
  for (let i = 1; i < n - 1; i++) {
    let isMax = true, isMin = true;
    for (let j = Math.max(0, i - win); j <= Math.min(n - 1, i + win); j++) {
      if (j === i) continue;
      if (ys[j] > ys[i] || (ys[j] === ys[i] && j < i)) isMax = false;
      if (ys[j] < ys[i] || (ys[j] === ys[i] && j < i)) isMin = false;
    }
    if (isMax && standOut(i, 1) >= prominence) out.set(i, "peak");
    else if (isMin && standOut(i, -1) >= prominence) out.set(i, "valley");
  }
  return out;
}

/* ── sound: one tiny synth, built on the first gesture ── */
function makeTicker() {
  let ctx = null, bus = null;
  const ensure = () => {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return ctx; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    bus = ctx.createGain();
    bus.gain.value = 0.5;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 3200; lp.Q.value = 0.4;
    bus.connect(lp).connect(ctx.destination);
    return ctx;
  };
  // a tick: a sine blip with a pitch drop and a 1 ms rise, gone in ~25 ms
  const blip = (freq, level, at = 0, len = 0.026) => {
    if (!ctx) return;
    const t = ctx.currentTime + 0.005 + at;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq * 1.35, t);
    o.frequency.exponentialRampToValueAtTime(freq, t + 0.012);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g).connect(bus);
    o.start(t); o.stop(t + len + 0.01);
  };
  return {
    ensure,
    pulse: (k) => blip(520 + 380 * k, 0.05, 0, 0.018),
    grid: () => blip(1250, 0.22),
    extremum: (kind) => { const f = kind === 'peak' ? 1650 : 880; blip(f, 0.24); blip(f, 0.24, 0.075); }
  };
}

export function hapticScrub(root, {
  xs, ys,
  gridStep = 100,
  format = (v) => String(Math.round(v)),
  formatX = (x) => String(x),
  pulseSlow = 300, // ms between pulses at the lowest value
  pulseFast = 70, // … and at the highest
  window: win = 6,
  prominence = gridStep * 0.6,
  labels = { peak: 'Peak', valley: 'Valley' }
} = {}) {
  const plot = root.querySelector('.hs__plot');
  const bubble = root.querySelector('.hs__bubble');
  const bubbleValue = root.querySelector('.hs__bubble-value');
  const bubbleX = root.querySelector('.hs__bubble-x');
  const bubbleTag = root.querySelector('.hs__bubble-tag');
  const keys = Object.fromEntries([...root.querySelectorAll('.hs__key[data-k]')].map((k) => [k.dataset.k, k]));
  const soundBtn = root.querySelector('.hs__sound');
  const vibeBtn = root.querySelector('.hs__vibe');
  const hint = root.querySelector('.hs__hint');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');

  const n = ys.length;
  const yMin = Math.min(...ys), yMax = Math.max(...ys);
  const g0 = Math.floor(yMin / gridStep) * gridStep, g1 = Math.ceil(yMax / gridStep) * gridStep;
  const extrema = findExtrema(ys, win, prominence);
  const canVibrate = typeof navigator.vibrate === 'function';
  const ticker = makeTicker();
  let soundOn = true, vibeOn = canVibrate;

  /* ── drawing ── */
  const svg = svgEl('svg', { class: 'hs__svg', 'aria-hidden': 'true' }, plot);
  const gGrid = svgEl('g', { class: 'hs__grid' }, svg);
  const area = svgEl('path', { class: 'hs__area' }, svg);
  const line = svgEl('path', { class: 'hs__line' }, svg);
  const gExt = svgEl('g', { class: 'hs__ext' }, svg);
  const cross = svgEl('line', { class: 'hs__cross' }, svg);
  const ring = svgEl('circle', { class: 'hs__ring', r: 9 }, svg);
  const touch = svgEl('circle', { class: 'hs__touch', r: 22 }, svg);
  const dot = svgEl('circle', { class: 'hs__dot', r: 6 }, svg);
  const gridLines = new Map();
  let W = 0, H = 0, top = 0, bottom = 0, right = 0;
  const sx = (i) => (i / (n - 1)) * (W - right);
  const sy = (v) => top + (1 - (v - g0) / (g1 - g0)) * (H - top - bottom);

  function draw() {
    W = plot.clientWidth; H = plot.clientHeight;
    if (!W || !H) return;
    top = Math.max(84, H * 0.24); bottom = 26; right = 44;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    gGrid.replaceChildren(); gridLines.clear(); gExt.replaceChildren();
    for (let v = g0; v <= g1 + 1e-9; v += gridStep) {
      const y = sy(v);
      const l = svgEl('line', { x1: 0, x2: W - right + 6, y1: y, y2: y }, gGrid);
      svgEl('text', { x: W, y, class: 'hs__ylab' }, gGrid).textContent = format(v);
      gridLines.set(Math.round(v), l);
    }
    let d = '';
    for (let i = 0; i < n; i++) d += `${i ? 'L' : 'M'}${sx(i).toFixed(1)},${sy(ys[i]).toFixed(1)}`;
    line.setAttribute('d', d);
    area.setAttribute('d', `${d}L${sx(n - 1)},${H - bottom}L0,${H - bottom}Z`);
    // x labels: first, middle, last
    for (const i of [0, Math.round((n - 1) / 2), n - 1]) {
      const t = svgEl('text', { x: sx(i), y: H - 6, class: 'hs__xlab' }, gGrid);
      t.textContent = formatX(xs[i]);
      t.setAttribute('text-anchor', i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle');
    }
    for (const [i, kind] of extrema) {
      const y = sy(ys[i]), x = sx(i);
      svgEl('path', { class: `hs__mark hs__mark--${kind}`, d: kind === 'peak' ? `M${x - 4},${y - 8}h8l-4,-6z` : `M${x - 4},${y + 8}h8l-4,6z` }, gExt);
    }
    if (cur >= 0) place(cur, lastPY);
  }
  new ResizeObserver(draw).observe(plot);

  /* ── state ── */
  let cur = -1, lastPY = null, active = false, pulseTimer = 0;

  function place(i, pointerY) {
    const x = sx(i), y = sy(ys[i]);
    root.classList.add('is-scrubbing');
    cross.setAttribute('x1', x); cross.setAttribute('x2', x); cross.setAttribute('y1', top - 6); cross.setAttribute('y2', H - bottom);
    dot.setAttribute('cx', x); dot.setAttribute('cy', y);
    touch.setAttribute('cx', x); touch.setAttribute('cy', pointerY ?? y + 44);
    const kind = extrema.get(i);
    bubbleValue.textContent = format(ys[i]);
    bubbleX.textContent = formatX(xs[i]);
    bubbleTag.textContent = kind ? labels[kind] : '';
    bubbleTag.hidden = !kind;
    // the number sits above the finger and above the line, never under them
    const bw = bubble.offsetWidth, bh = bubble.offsetHeight;
    const lift = Math.min(y, pointerY ?? y) - bh - 26;
    bubble.style.transform = `translate(${clamp(x - bw / 2, 0, W - bw).toFixed(1)}px, ${Math.max(0, lift).toFixed(1)}px)`;
    bubble.style.setProperty('--hs-tip', `${clamp(x - clamp(x - bw / 2, 0, W - bw), 14, bw - 14).toFixed(1)}px`);
    plot.setAttribute('aria-valuenow', i);
    plot.setAttribute('aria-valuetext', `${formatX(xs[i])}, ${format(ys[i])}${kind ? `, ${labels[kind].toLowerCase()}` : ''}`);
  }

  const flash = (node) => {
    if (!node) return;
    node.classList.remove('is-hit');
    void node.getBoundingClientRect(); // restart the CSS animation
    node.classList.add('is-hit');
  };

  const level = (i) => (ys[i] - yMin) / (yMax - yMin || 1);
  // Chrome refuses vibrate() until the page has had a tap or a key press
  const vibrate = (p) => {
    if (!vibeOn || !canVibrate || navigator.userActivation?.hasBeenActive === false) return;
    try { navigator.vibrate(p); } catch { /* blocked */ }
  };

  // what happened on the way from a to b: extremum beats a grid crossing
  function eventsBetween(a, b) {
    if (a < 0 || a === b) return null;
    const step = b > a ? 1 : -1;
    let ext = null, grid = null;
    for (let i = a; i !== b; i += step) {
      const j = i + step;
      if (extrema.has(j)) ext = j;
      const lo = Math.min(ys[i], ys[j]), hi = Math.max(ys[i], ys[j]);
      const k = (Math.floor(lo / gridStep) + 1) * gridStep; // the first grid line strictly above lo
      if (k <= hi) grid = k;
    }
    return ext != null ? { kind: 'ext', i: ext } : grid != null ? { kind: 'grid', v: grid } : null;
  }

  function feedback(ev) {
    if (!ev) return;
    if (ev.kind === 'ext') {
      const kind = extrema.get(ev.i);
      ring.setAttribute('cx', sx(ev.i)); ring.setAttribute('cy', sy(ys[ev.i]));
      flash(ring); flash(keys.extremum);
      if (soundOn) ticker.extremum(kind);
      vibrate([16, 60, 16]);
    } else {
      flash(gridLines.get(Math.round(ev.v))); flash(keys.grid);
      if (soundOn) ticker.grid();
      vibrate(22);
    }
  }

  // the pulse train runs only while a finger, pen or button is down
  function pulseLoop() {
    if (!active || cur < 0) return;
    const k = level(cur);
    flash(dot); flash(keys.pulse);
    if (soundOn) ticker.pulse(k);
    vibrate(9);
    pulseTimer = setTimeout(pulseLoop, pulseSlow + (pulseFast - pulseSlow) * k);
  }

  function goTo(i, pointerY, withFeedback) {
    i = clamp(i, 0, n - 1);
    const ev = withFeedback ? eventsBetween(cur, i) : null;
    cur = i; lastPY = pointerY;
    place(i, pointerY);
    feedback(ev);
  }

  const indexAt = (clientX) => {
    const r = plot.getBoundingClientRect();
    return Math.round(clamp((clientX - r.left) / (W - right), 0, 1) * (n - 1));
  };
  const localY = (clientY) => clientY - plot.getBoundingClientRect().top;

  plot.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    plot.setPointerCapture(e.pointerId);
    ticker.ensure();
    active = true;
    root.classList.toggle('is-touch', e.pointerType !== 'mouse');
    goTo(indexAt(e.clientX), localY(e.clientY), cur >= 0);
    clearTimeout(pulseTimer);
    pulseLoop();
  });
  plot.addEventListener('pointermove', (e) => {
    if (!active && e.pointerType !== 'mouse') return;
    const i = indexAt(e.clientX);
    if (i !== cur || active) goTo(i, localY(e.clientY), true);
  });
  const hide = () => { root.classList.remove('is-scrubbing'); cur = -1; };
  // a lifted finger or pen hides the scrubber; a mouse keeps it while it hovers
  const end = (e) => {
    active = false;
    clearTimeout(pulseTimer);
    root.classList.remove('is-touch');
    if (e.pointerType !== 'mouse') hide();
  };
  plot.addEventListener('pointerup', end);
  plot.addEventListener('pointercancel', end);
  plot.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !active) hide(); });

  // keys: ←/→ one sample, PageUp/PageDown a tenth, Home/End the ends; the first key starts at the left end
  plot.addEventListener('keydown', (e) => {
    const big = Math.max(1, Math.round(n / 10));
    const step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: big, PageDown: -big }[e.key];
    if (step === undefined && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    ticker.ensure();
    const target = e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : cur < 0 ? 0 : clamp(cur + step, 0, n - 1);
    const ev = eventsBetween(cur, target);
    goTo(target, null, false);
    if (ev) feedback(ev);
    else { flash(dot); flash(keys.pulse); if (soundOn) ticker.pulse(level(target)); vibrate(9); }
  });
  plot.addEventListener('blur', () => { if (!active) hide(); });

  /* ── controls ── */
  soundBtn?.addEventListener('click', () => {
    soundOn = !soundOn;
    soundBtn.setAttribute('aria-checked', String(soundOn));
    if (soundOn) { ticker.ensure(); ticker.grid(); }
  });
  if (vibeBtn) {
    vibeBtn.setAttribute('aria-checked', String(vibeOn));
    if (!canVibrate) {
      vibeBtn.setAttribute('aria-disabled', 'true');
      root.classList.add('no-vibrate');
    }
    vibeBtn.addEventListener('click', () => {
      if (!canVibrate) return;
      vibeOn = !vibeOn;
      vibeBtn.setAttribute('aria-checked', String(vibeOn));
      if (vibeOn) vibrate(22);
    });
  }
  if (hint) hint.textContent = canVibrate
    ? 'Drag along the line. Pulses speed up as the value climbs, a click marks each grid line, a double pulse a peak or valley.'
    : 'This browser can’t vibrate (iPhone Safari never does). The number, the flashes and the clicks carry the same signals.';

  plot.setAttribute('aria-valuemin', 0);
  plot.setAttribute('aria-valuemax', n - 1);
  reduce.addEventListener?.('change', () => root.classList.toggle('is-reduced', reduce.matches));
  root.classList.toggle('is-reduced', reduce.matches);

  return {
    extrema,
    /** Put the scrubber on sample i and fire what it would fire: 'pulse', 'grid' or 'extremum' (for stills and tests). */
    show(i, fire) {
      draw();
      goTo(i, null, false);
      if (fire === 'extremum') feedback({ kind: 'ext', i });
      else if (fire === 'grid') feedback({ kind: 'grid', v: Math.round(ys[i] / gridStep) * gridStep });
      else if (fire === 'pulse') { flash(dot); flash(keys.pulse); }
    }
  };
}
