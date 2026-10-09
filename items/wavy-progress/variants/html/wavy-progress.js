// Wavy Progress.
// Markup: <div class="wvp" data-kind="linear|circular" data-value="0.4" data-active aria-label="Upload"></div>
// data-value is 0…1, data-active says the work is moving. Change the attributes (or el.wavy.set / el.wavy.active)
// and the indicator follows: the filled part is a wave running forward, its height springs to the activity
// (flat when idle), the wave smooths out over the last 8 % and the colour turns at 100 % (data-state="done").
// rAF runs only while something moves, and pauses off screen and in a hidden tab.
(() => {
  const NS = 'http://www.w3.org/2000/svg';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const STEP = 2; // px between path samples
  const SPEED = 1.15; // wavelengths per second at full activity
  const TAPER = 10; // px over which the wave lands on the line at the head and the start
  const FLAT_FROM = 0.92; // from here to 100 % the wave smooths out

  // amplitude: a slightly bouncy spring (ω = 9 rad/s, ζ = 0.55); value: a stiffer, almost critical one
  const AMP = { w: 9, z: 0.55 };
  const VAL = { w: 11, z: 0.95 };

  const px = (el, name, fallback) => {
    const v = parseFloat(getComputedStyle(el).getPropertyValue(name));
    return Number.isFinite(v) ? v : fallback;
  };
  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const smooth = (t) => t * t * (3 - 2 * t);

  function springStep(s, target, k, dt) {
    // semi-implicit Euler on x'' = −ω²(x − target) − 2ζω·x'
    const acc = -k.w * k.w * (s.x - target) - 2 * k.z * k.w * s.v;
    s.v += acc * dt;
    s.x += s.v * dt;
  }

  function init(el) {
    if (el.wavy) return el.wavy;
    const kind = el.dataset.kind === 'circular' ? 'circular' : 'linear';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('aria-hidden', 'true');
    const track = document.createElementNS(NS, 'path');
    const fill = document.createElementNS(NS, 'path');
    track.setAttribute('class', 'wvp__track');
    fill.setAttribute('class', 'wvp__fill');
    svg.append(track, fill);
    el.replaceChildren(svg);
    el.setAttribute('role', 'progressbar');
    el.setAttribute('aria-valuemin', '0');
    el.setAttribute('aria-valuemax', '100');

    let g = {}; // geometry
    const val = { x: clamp01(+el.dataset.value || 0), v: 0 };
    const amp = { x: 0, v: 0 };
    let target = val.x;
    let active = el.hasAttribute('data-active');
    let phase = 0;
    let raf = 0;
    let last = 0;
    let visible = true;

    function measure() {
      const sw = px(el, '--wvp-stroke', 4);
      const a = px(el, '--wvp-amp', 3.2);
      g = { sw, a, wave: px(el, '--wvp-wave', 28), gap: px(el, '--wvp-gap', 6) };
      if (kind === 'linear') {
        g.w = Math.max(40, el.clientWidth);
        g.h = Math.ceil(2 * a + sw + 2);
        svg.setAttribute('width', g.w);
        svg.setAttribute('height', g.h);
        svg.setAttribute('viewBox', `0 0 ${g.w} ${g.h}`);
        el.style.height = `${g.h}px`;
      } else {
        const size = el.clientWidth || px(el, '--wvp-size', 96);
        g.size = size;
        g.r = size / 2 - sw / 2 - a;
        // a whole number of waves round the circle, so the wave closes on itself at 100 %
        g.k = Math.max(5, Math.round((2 * Math.PI * g.r) / g.wave));
        svg.setAttribute('width', size);
        svg.setAttribute('height', size);
        svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
      }
    }

    function drawLinear(p, A) {
      const { w, h, sw, wave, gap } = g;
      const x0 = sw / 2;
      const x1 = w - sw / 2;
      const span = x1 - x0;
      const head = x0 + span * p;
      const cy = h / 2;
      let d = '';
      if (p > 0.0005) {
        const n = Math.max(1, Math.ceil((head - x0) / STEP));
        for (let i = 0; i <= n; i++) {
          const x = x0 + ((head - x0) * i) / n;
          const t = Math.min(1, (x - x0) / TAPER, (head - x) / TAPER);
          const y = cy + A * smooth(Math.max(0, t)) * Math.sin((2 * Math.PI * x) / wave - phase);
          d += `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(2)}`;
        }
      }
      fill.setAttribute('d', d);
      const ts = p > 0.0005 ? head + gap + sw : x0;
      track.setAttribute('d', ts < x1 ? `M${ts.toFixed(1)} ${cy}L${x1} ${cy}` : '');
    }

    function drawCircular(p, A) {
      const { size, r, k, sw, gap } = g;
      const c = size / 2;
      const start = -Math.PI / 2;
      const sweep = 2 * Math.PI * p;
      const gapA = (gap + sw) / r;
      const taperA = TAPER / r;
      let d = '';
      if (p > 0.0005) {
        // at 100 % the ring closes; otherwise leave room for the gap on both sides
        const end = p >= 0.9995 ? sweep : Math.max(0.0001, sweep);
        const n = Math.max(2, Math.ceil((end * r) / STEP));
        for (let i = 0; i <= n; i++) {
          const a = (end * i) / n;
          const t = p >= 0.9995 ? 1 : Math.min(1, a / taperA, (end - a) / taperA);
          const rr = r + A * smooth(Math.max(0, t)) * Math.sin(k * a - phase);
          const x = c + rr * Math.cos(start + a);
          const y = c + rr * Math.sin(start + a);
          d += `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`;
        }
        if (p >= 0.9995) d += 'Z';
      }
      fill.setAttribute('d', d);
      // the track: from the head plus the gap round to the start minus the gap
      const t0 = p > 0.0005 ? sweep + gapA : 0;
      const t1 = p > 0.0005 ? 2 * Math.PI - gapA : 2 * Math.PI - 0.0001;
      if (t1 - t0 > 0.02) {
        const large = t1 - t0 > Math.PI ? 1 : 0;
        const ax = c + r * Math.cos(start + t0);
        const ay = c + r * Math.sin(start + t0);
        const bx = c + r * Math.cos(start + t1);
        const by = c + r * Math.sin(start + t1);
        track.setAttribute('d', `M${ax.toFixed(2)} ${ay.toFixed(2)}A${r} ${r} 0 ${large} 1 ${bx.toFixed(2)} ${by.toFixed(2)}`);
      } else track.setAttribute('d', '');
    }

    function ampTarget() {
      if (reduced.matches || !active) return 0;
      return 1 - smooth(clamp01((target - FLAT_FROM) / (1 - FLAT_FROM)));
    }

    function draw() {
      const p = clamp01(val.x);
      const A = Math.max(0, amp.x) * g.a;
      if (kind === 'linear') drawLinear(p, A);
      else drawCircular(p, A);
    }

    function frame(now) {
      raf = 0;
      const dt = Math.min(0.05, last ? (now - last) / 1000 : 1 / 60);
      last = now;
      const at = ampTarget();
      if (reduced.matches) {
        val.x = target; val.v = 0; amp.x = 0; amp.v = 0;
      } else {
        springStep(val, target, VAL, dt);
        springStep(amp, at, AMP, dt);
        // the wave runs while there is a wave to see
        phase += dt * SPEED * 2 * Math.PI * Math.min(1, Math.max(0, amp.x) * 1.4);
      }
      draw();
      const settled = Math.abs(val.x - target) < 1e-4 && Math.abs(val.v) < 1e-4 && Math.abs(amp.x - at) < 1e-3 && Math.abs(amp.v) < 1e-3;
      if (settled) {
        val.x = target; amp.x = at;
        draw();
      }
      // keep going while the value or the amplitude moves, or while the wave runs
      if (!settled || at > 0) schedule();
      else last = 0;
    }
    function schedule() {
      if (!raf && visible && !document.hidden) raf = requestAnimationFrame(frame);
    }

    function aria() {
      const pct = Math.round(target * 100);
      el.setAttribute('aria-valuenow', String(pct));
      el.setAttribute('aria-valuetext', pct >= 100 ? 'Complete' : `${pct}%${active ? '' : ', paused'}`);
      if (pct >= 100) el.dataset.state = 'done';
      else delete el.dataset.state;
    }

    const api = {
      set(v) {
        const next = clamp01(+v || 0);
        // a step forward is a heartbeat: it kicks the wave a little
        if (next > target && active && !reduced.matches) amp.v += Math.min(3, (next - target) * 40);
        target = next;
        if (el.dataset.value !== String(next)) el.dataset.value = String(next);
        aria();
        schedule();
      },
      active(on) {
        active = !!on;
        if (el.hasAttribute('data-active') !== active) el.toggleAttribute('data-active', active);
        aria();
        schedule();
      },
      get value() { return target; },
      get isActive() { return active; }
    };
    el.wavy = api;

    // attributes drive it too
    new MutationObserver(() => {
      const v = clamp01(+el.dataset.value || 0);
      if (v !== target) api.set(v);
      if (el.hasAttribute('data-active') !== active) api.active(el.hasAttribute('data-active'));
    }).observe(el, { attributes: true, attributeFilter: ['data-value', 'data-active'] });

    new ResizeObserver(() => { measure(); draw(); }).observe(el);
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) schedule(); else { cancelAnimationFrame(raf); raf = 0; last = 0; } }).observe(el);
    document.addEventListener('visibilitychange', () => { if (document.hidden) { cancelAnimationFrame(raf); raf = 0; last = 0; } else schedule(); });
    reduced.addEventListener('change', schedule);

    measure();
    if (active && !reduced.matches) amp.x = ampTarget();
    aria();
    draw();
    schedule();
    return api;
  }

  const run = () => document.querySelectorAll('.wvp').forEach(init);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
  window.WavyProgress = { init };
})();
