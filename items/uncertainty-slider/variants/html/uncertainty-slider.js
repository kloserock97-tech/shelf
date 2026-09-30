// Uncertainty Slider: an estimate with its confidence.
// Horizontal position = the value (mean). Height of the peak = how sure: the thumb sits on the top of a normal curve,
// pulling it up narrows the curve, pushing it down spreads it. The shaded bands are the central 50% and 90%.
// Emits `input` while it changes and `change` when it settles, detail = { mean, low, high } (low/high: the 90% range).
(() => {
  const Z90 = 1.6449; // half-width of the central 90% in standard deviations
  const Z50 = 0.6745; // … and of the central 50%
  const PLOT_PAD = 12; // px kept free at both ends of the track
  const TOP = 20; // highest point of the peak, px from the top
  const LOW = 36; // lowest peak height above the track, px
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  // the word follows the relative spread: ±1 on 12 days is sure, ±1 on 2 days is not
  const WORDS = [
    [0.1, 'Very sure'],
    [0.3, 'Fairly sure'],
    [0.6, 'Not so sure'],
    [Infinity, 'Rough guess']
  ];

  function niceStep(span) {
    const raw = span / 6;
    const p = 10 ** Math.floor(Math.log10(raw));
    return [1, 2, 5, 10].map((m) => m * p).find((s) => s >= raw) ?? raw;
  }

  function create(root, options = {}) {
    const ds = root.dataset;
    const o = {
      min: Number(ds.min ?? 0),
      max: Number(ds.max ?? 30),
      step: Number(ds.step ?? 1),
      value: Number(ds.value ?? 12),
      spread: Number(ds.spread ?? 3), // the ± shown: half of the 90% range
      unit: ds.unit ?? 'days',
      label: ds.label ?? 'Estimate',
      ...options
    };
    const span = o.max - o.min;
    const lnMin = Math.log(o.step * 0.4);
    const lnMax = Math.log(span / 6);
    const decimals = (String(o.step).split('.')[1] || '').length;
    const snap = (v) => clamp(Math.round((v - o.min) / o.step) * o.step + o.min, o.min, o.max);
    const num = (v) => v.toFixed(decimals);

    let mean = clamp(o.value, o.min, o.max);
    let sigma = Math.exp(clamp(Math.log(o.spread / Z90), lnMin, lnMax));
    let W = 0;
    let H = 0;

    root.classList.add('us');
    const uid = `us-${Math.random().toString(36).slice(2, 8)}`;
    root.innerHTML = `
      <div class="us-top">
        <div class="us-readout" aria-hidden="true"><span class="us-num"></span><span class="us-pm">±</span><span class="us-half"></span><span class="us-unit"></span></div>
        <span class="us-word" aria-hidden="true"></span>
      </div>
      <div class="us-plot">
        <svg class="us-svg" aria-hidden="true" focusable="false">
          <path class="us-area90"/><path class="us-area50"/><path class="us-curve"/>
          <line class="us-stem"/><line class="us-rail"/><line class="us-bar90"/><line class="us-bar50"/>
        </svg>
        <div class="us-guide" aria-hidden="true"></div>
        <div class="us-tip" aria-hidden="true"><span>↑ More sure</span><span>↓ Less sure</span></div>
        <div class="us-thumb" role="slider" tabindex="0" aria-describedby="${uid}"></div>
      </div>
      <div class="us-axis" aria-hidden="true"></div>
      <p class="us-legend" aria-hidden="true">
        <span><i class="us-sw50"></i>1 in 2 chance <b class="us-r50"></b></span>
        <span><i class="us-sw90"></i>9 in 10 <b class="us-r90"></b></span>
      </p>
      <p class="us-sr" id="${uid}">Left and right arrows set the estimate. Up and down arrows, or Shift with left and right, set how sure you are.</p>`;
    const $ = (s) => root.querySelector(s);
    const plot = $('.us-plot');
    const svg = $('.us-svg');
    const thumb = $('.us-thumb');
    const guide = $('.us-guide');
    const tip = $('.us-tip');
    const els = {
      area90: $('.us-area90'), area50: $('.us-area50'), curve: $('.us-curve'), stem: $('.us-stem'),
      rail: $('.us-rail'), bar90: $('.us-bar90'), bar50: $('.us-bar50'),
      num: $('.us-num'), half: $('.us-half'), unit: $('.us-unit'), word: $('.us-word'),
      r50: $('.us-r50'), r90: $('.us-r90'), axis: $('.us-axis')
    };
    els.unit.textContent = o.unit;
    thumb.setAttribute('aria-label', o.label);
    thumb.setAttribute('aria-valuemin', String(o.min));
    thumb.setAttribute('aria-valuemax', String(o.max));

    // geometry
    const trackY = () => H - 12;
    const hMax = () => trackY() - TOP;
    const X = (v) => PLOT_PAD + ((v - o.min) / span) * (W - PLOT_PAD * 2);
    const invX = (x) => o.min + ((x - PLOT_PAD) / (W - PLOT_PAD * 2)) * span;
    const t = () => (Math.log(sigma) - lnMin) / (lnMax - lnMin); // 0 = sure, 1 = rough guess
    const peakH = () => hMax() - t() * (hMax() - LOW);
    const peakY = () => trackY() - peakH();
    const sigmaFromPeak = (y) => {
      const k = clamp((hMax() - (trackY() - y)) / (hMax() - LOW), 0, 1);
      return Math.exp(lnMin + k * (lnMax - lnMin));
    };
    const Y = (v) => trackY() - peakH() * Math.exp(-0.5 * ((v - mean) / sigma) ** 2);

    function area(a, b, n) {
      a = clamp(a, o.min, o.max);
      b = clamp(b, o.min, o.max);
      if (b <= a) return '';
      let d = `M${X(a).toFixed(1)},${trackY()}`;
      for (let i = 0; i <= n; i++) {
        const v = a + ((b - a) * i) / n;
        d += `L${X(v).toFixed(1)},${Y(v).toFixed(1)}`;
      }
      return `${d}L${X(b).toFixed(1)},${trackY()}Z`;
    }
    function curve() {
      // only where the curve lifts off the track, so the tails don't paint the whole rail
      const a = Math.max(o.min, mean - 4.5 * sigma);
      const b = Math.min(o.max, mean + 4.5 * sigma);
      let d = `M${X(a).toFixed(1)},${Y(a).toFixed(1)}`;
      for (let i = 1; i <= 96; i++) {
        const v = a + ((b - a) * i) / 96;
        d += `L${X(v).toFixed(1)},${Y(v).toFixed(1)}`;
      }
      return d;
    }
    const line = (el, x1, y1, x2, y2) => {
      el.setAttribute('x1', x1.toFixed(1)); el.setAttribute('y1', y1.toFixed(1));
      el.setAttribute('x2', x2.toFixed(1)); el.setAttribute('y2', y2.toFixed(1));
    };

    function value() {
      const m = snap(mean);
      const r = (v) => Math.round(v * 10) / 10;
      return { mean: m, low: r(Math.max(o.min, m - Z90 * sigma)), high: r(Math.min(o.max, m + Z90 * sigma)) };
    }
    const shownHalf = () => {
      const h = Z90 * sigma;
      return h >= 2 ? String(Math.round(h)) : String(Math.max(0.5, Math.round(h * 2) / 2));
    };
    const range = (z) => {
      const m = snap(mean);
      const lo = Math.max(o.min, m - z * sigma);
      const hi = Math.min(o.max, m + z * sigma);
      // whole steps unless rounding would collapse the range
      const whole = hi - lo >= 2 * o.step;
      const f = (v) => (whole ? num(Math.round(v / o.step) * o.step) : v.toFixed(Math.max(1, decimals)));
      return `${f(lo)}–${f(hi)} ${o.unit}`;
    };
    const wordOf = () => {
      const m = snap(mean);
      const rel = (Z90 * sigma) / Math.max(Math.abs(m), span * 0.1);
      return WORDS.find(([k]) => rel < k)[1];
    };

    function drawAxis() {
      const s = niceStep(span);
      let html = '';
      for (let v = Math.ceil(o.min / s) * s; v <= o.max + 1e-9; v += s) html += `<span style="left:${X(v).toFixed(1)}px">${num(v)}</span>`;
      els.axis.innerHTML = html;
    }

    // the little legend for the vertical axis: above the peak when there is room, else beside it, past the curve
    function placeTip(mx, py) {
      const w = tip.offsetWidth;
      const h = tip.offsetHeight;
      let off = 8;
      let top = py - h - 16;
      if (top < -6) {
        const f = clamp((peakH() - h / 2 - 2) / peakH(), 0.02, 1);
        off = Math.max(20, Math.sqrt(-2 * Math.log(f)) * sigma * ((W - PLOT_PAD * 2) / span) + 6);
        top = py - h / 2;
      }
      const left = mx + off + w > W ? mx - off - w : mx + off;
      tip.style.transform = `translate(${left.toFixed(1)}px, ${top.toFixed(1)}px)`;
    }

    let queued = false;
    function render() {
      queued = false;
      if (!W) return;
      const ty = trackY();
      els.area90.setAttribute('d', area(mean - Z90 * sigma, mean + Z90 * sigma, 64));
      els.area50.setAttribute('d', area(mean - Z50 * sigma, mean + Z50 * sigma, 40));
      els.curve.setAttribute('d', curve());
      const mx = X(mean);
      const py = peakY();
      line(els.stem, mx, py, mx, ty);
      line(els.rail, PLOT_PAD, ty, W - PLOT_PAD, ty);
      line(els.bar90, X(Math.max(o.min, mean - Z90 * sigma)), ty, X(Math.min(o.max, mean + Z90 * sigma)), ty);
      line(els.bar50, X(Math.max(o.min, mean - Z50 * sigma)), ty, X(Math.min(o.max, mean + Z50 * sigma)), ty);
      thumb.style.transform = `translate(${mx.toFixed(1)}px, ${py.toFixed(1)}px)`;
      guide.style.transform = `translateX(${mx.toFixed(1)}px)`;
      guide.style.top = `${TOP - 14}px`;
      guide.style.height = `${ty - TOP + 14}px`;
      placeTip(mx, py);

      const m = snap(mean);
      const half = shownHalf();
      els.num.textContent = num(m);
      els.half.textContent = half;
      const word = wordOf();
      els.word.textContent = word;
      els.r50.textContent = range(Z50);
      els.r90.textContent = range(Z90);
      thumb.setAttribute('aria-valuenow', num(m));
      thumb.setAttribute('aria-valuetext', `${num(m)} ${o.unit}, give or take ${half}. 9 in 10 chance: ${range(Z90)}. ${word}.`);
    }
    const schedule = () => {
      if (!queued) { queued = true; requestAnimationFrame(render); }
    };
    const emit = (type) => root.dispatchEvent(new CustomEvent(type, { detail: value(), bubbles: true }));

    const ro = new ResizeObserver(() => {
      W = plot.clientWidth;
      H = plot.clientHeight;
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      drawAxis();
      render();
    });
    ro.observe(plot);

    // settle the mean onto the step after a drag
    let anim = 0;
    function settle() {
      cancelAnimationFrame(anim);
      const from = mean;
      const to = snap(mean);
      if (from === to || reduce.matches) { mean = to; schedule(); return; }
      const t0 = performance.now();
      const tick = (now) => {
        const k = Math.min(1, (now - t0) / 200);
        mean = from + (to - from) * (1 - (1 - k) ** 3);
        render();
        if (k < 1) anim = requestAnimationFrame(tick);
      };
      anim = requestAnimationFrame(tick);
    }

    // pointer: one finger drags in 2D, two fingers pinch the spread
    const pointers = new Map();
    let drag = null;
    let pinch = null;
    const local = (e) => {
      const r = plot.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const grab = (on) => root.classList.toggle('is-grabbed', on);

    plot.addEventListener('pointerdown', (e) => {
      if (e.button > 0) return;
      e.preventDefault();
      root.classList.add('is-pointer'); // no focus ring or guide after a click; a key press brings them back
      cancelAnimationFrame(anim);
      plot.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, local(e));
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { d: Math.max(20, Math.abs(a.x - b.x)), s: sigma };
        drag = null;
        return;
      }
      thumb.focus({ preventScroll: true });
      const p = local(e);
      const tx = X(mean);
      const ty = peakY();
      const near = Math.hypot(p.x - tx, p.y - ty) < 30;
      drag = { ox: near ? p.x - tx : 0, oy: p.y - ty };
      if (!near) mean = clamp(invX(p.x), o.min, o.max);
      grab(true);
      schedule();
      emit('input');
    });
    plot.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, local(e));
      if (pinch && pointers.size >= 2) {
        const [a, b] = [...pointers.values()];
        sigma = Math.exp(clamp(Math.log(pinch.s * (Math.max(20, Math.abs(a.x - b.x)) / pinch.d)), lnMin, lnMax));
      } else if (drag) {
        const p = local(e);
        mean = clamp(invX(p.x - drag.ox), o.min, o.max);
        sigma = sigmaFromPeak(p.y - drag.oy);
      } else return;
      schedule();
      emit('input');
    });
    const release = (e) => {
      if (!pointers.delete(e.pointerId)) return;
      if (pointers.size) {
        // one finger lifted after a pinch: carry on dragging from where the other one is
        pinch = null;
        const p = [...pointers.values()][0];
        drag = { ox: p.x - X(mean), oy: p.y - peakY() };
        return;
      }
      drag = null;
      pinch = null;
      grab(false);
      settle();
      emit('change');
    };
    plot.addEventListener('pointerup', release);
    plot.addEventListener('pointercancel', release);

    // trackpad pinch arrives as ctrl + wheel
    let wheelEnd = 0;
    plot.addEventListener('wheel', (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      sigma = Math.exp(clamp(Math.log(sigma) + e.deltaY * 0.01, lnMin, lnMax));
      schedule();
      emit('input');
      clearTimeout(wheelEnd);
      wheelEnd = setTimeout(() => emit('change'), 250);
    }, { passive: false });

    thumb.addEventListener('keydown', (e) => {
      root.classList.remove('is-pointer');
      const k = e.key;
      const narrow = (f) => { sigma = Math.exp(clamp(Math.log(sigma) + f, lnMin, lnMax)); };
      const s = (lnMax - lnMin) / 12;
      if (e.shiftKey && (k === 'ArrowLeft' || k === 'ArrowRight')) narrow(k === 'ArrowRight' ? s : -s);
      else if (k === 'ArrowUp') narrow(-s * (e.shiftKey ? 3 : 1));
      else if (k === 'ArrowDown') narrow(s * (e.shiftKey ? 3 : 1));
      else if (k === 'ArrowLeft') mean = snap(mean - o.step);
      else if (k === 'ArrowRight') mean = snap(mean + o.step);
      else if (k === 'PageDown') mean = snap(mean - o.step * 5);
      else if (k === 'PageUp') mean = snap(mean + o.step * 5);
      else if (k === 'Home') mean = o.min;
      else if (k === 'End') mean = o.max;
      else return;
      e.preventDefault();
      cancelAnimationFrame(anim);
      mean = snap(mean);
      render();
      emit('input');
      emit('change');
    });

    render();
    return {
      get value() { return value(); },
      set(next = {}) {
        if (next.mean != null) mean = snap(next.mean);
        if (next.spread != null) sigma = Math.exp(clamp(Math.log(next.spread / Z90), lnMin, lnMax));
        render();
      },
      grab,
      destroy() { ro.disconnect(); root.innerHTML = ''; }
    };
  }

  window.UncertaintySlider = { create };
  document.querySelectorAll('[data-uncertainty-slider]').forEach((el) => {
    el.uncertaintySlider = create(el);
  });
})();
