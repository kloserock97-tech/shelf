/* Morph Progress — the loader's shape says how sure it is.
   While the total is unknown, a filled shape morphs through soft outlines and turns. Once the total is known,
   it becomes a disc, hollows out into a ring and unwinds to the real progress. An error folds it into a cross.

   const loader = new MorphProgress.Loader(svgElement);
   loader.indeterminate(); loader.progress(0.42); loader.fail(); loader.done(); loader.reset();
   const eta = new MorphProgress.Eta(); eta.sample(seconds, doneBytes, totalBytes) → { est, lo, hi, rel } */
(function () {
  'use strict';

  const N = 96;                   // points per outline: every shape is sampled at the same angles, so any two blend
  const TAU = Math.PI * 2;
  const BLOB = 40;                // outline radius in viewBox units (the viewBox is -60…60)
  const RING_R = 44, RING_W = 7;  // the determinate ring
  const HOLD = 260;               // ms a shape rests before the next morph
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = (t) => 1 - Math.pow(1 - t, 4);
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  // ---- outlines: each is a radius per angle ----
  function polar(f) {
    const r = new Float32Array(N);
    for (let i = 0; i < N; i++) r[i] = f(i / N * TAU);
    return r;
  }
  // From a signed distance function (negative inside): walk each ray out to the edge by bisection.
  // Works for any outline that the centre can see whole, which all of these are.
  function traced(sdf) {
    return polar((a) => {
      const c = Math.cos(a), s = Math.sin(a);
      let lo = 0, hi = 2;
      for (let k = 0; k < 24; k++) { const m = (lo + hi) / 2; if (sdf(c * m, s * m) < 0) lo = m; else hi = m; }
      return (lo + hi) / 2;
    });
  }
  function segDist(px, py, ax, ay, bx, by) {
    const vx = bx - ax, vy = by - ay;
    const t = clamp(((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy), 0, 1);
    return Math.hypot(px - ax - vx * t, py - ay - vy * t);
  }
  function turn(x, y, deg) {
    const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    return [x * c + y * s, -x * s + y * c];
  }

  const SHAPES = {
    circle: polar(() => 0.9),
    cookie: polar((a) => 0.88 + 0.07 * Math.cos(8 * a)),
    pill: traced((x, y) => { const [u, v] = turn(x, y, -38); return segDist(u, v, -0.42, 0, 0.42, 0) - 0.5; }),
    clover: polar((a) => 0.58 + 0.42 * Math.pow(Math.abs(Math.cos(2 * a)), 0.62)),
    burst: polar((a) => 0.7 + 0.28 * Math.pow(0.5 + 0.5 * Math.cos(8 * a), 1.1)),
    squircle: polar((a) => { const c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a)); return 0.78 / Math.pow(c ** 4 + s ** 4, 0.25); }),
    cross: traced((x, y) => Math.min(segDist(x, y, -0.5, -0.5, 0.5, 0.5), segDist(x, y, -0.5, 0.5, 0.5, -0.5)) - 0.19)
  };
  // neighbours share a symmetry (2, 4 or 8 fold), so the in-between outlines stay tidy
  const CYCLE = ['cookie', 'pill', 'squircle', 'clover', 'burst'];

  // A smooth closed path through the points: Catmull-Rom turned into cubic Béziers.
  function pathOf(r, scale) {
    const xs = new Float32Array(N), ys = new Float32Array(N);
    for (let i = 0; i < N; i++) { const a = i / N * TAU; xs[i] = Math.cos(a) * r[i] * scale; ys[i] = Math.sin(a) * r[i] * scale; }
    let d = `M${xs[0].toFixed(2)} ${ys[0].toFixed(2)}`;
    for (let i = 0; i < N; i++) {
      const i0 = (i + N - 1) % N, i2 = (i + 1) % N, i3 = (i + 2) % N;
      d += `C${(xs[i] + (xs[i2] - xs[i0]) / 6).toFixed(2)} ${(ys[i] + (ys[i2] - ys[i0]) / 6).toFixed(2)} ` +
        `${(xs[i2] - (xs[i3] - xs[i]) / 6).toFixed(2)} ${(ys[i2] - (ys[i3] - ys[i]) / 6).toFixed(2)} ` +
        `${xs[i2].toFixed(2)} ${ys[i2].toFixed(2)}`;
    }
    return d + 'Z';
  }

  function Spring(k, zeta, x) { this.k = k; this.c = 2 * Math.sqrt(k) * zeta; this.x = x; this.v = 0; this.to = x; }
  Spring.prototype.step = function (dt) {
    const h = dt / 2;
    for (let i = 0; i < 2; i++) { this.v += (this.k * (this.to - this.x) - this.c * this.v) * h; this.x += this.v * h; }
  };
  Spring.prototype.idle = function (eps) { return Math.abs(this.to - this.x) < eps && Math.abs(this.v) < eps * 4; };

  const NS = 'http://www.w3.org/2000/svg';
  function node(tag, attrs, parent) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    parent.append(n);
    return n;
  }

  // ---- the loader ----
  function Loader(svg, opts) {
    opts = opts || {};
    this.svg = svg;
    this.label = opts.label || 'Progress';
    svg.classList.add('mp', 'mp--idle');
    svg.setAttribute('viewBox', '-60 -60 120 120');
    svg.setAttribute('role', 'progressbar');
    svg.setAttribute('aria-label', this.label);
    this.track = node('circle', { class: 'mp__track', r: RING_R }, svg);
    this.arc = node('circle', { class: 'mp__arc', r: RING_R, pathLength: 100, transform: 'rotate(-90)' }, svg);
    this.spin = node('g', { class: 'mp__spin' }, svg);
    this.blob = node('path', { class: 'mp__blob' }, this.spin);
    this.check = node('path', { class: 'mp__check', d: 'M-15 1.5 -4.5 12 16 -9.5', pathLength: 100 }, svg);

    this.from = SHAPES.cookie; this.to = SHAPES.cookie;
    this.m = new Spring(150, 0.6, 1);       // blend from → to; overshoots a little, like a soft body
    this.angle = new Spring(90, 0.85, 0);   // turn, in degrees; free-running while the loader is unsure
    this.scale = new Spring(260, 0.62, 1);
    this.arcS = new Spring(90, 1, 0);       // arc length 0…100 following the real value
    this.phase = 'idle';                    // idle | spin | settle | ring-in | ring | ring-out | cross | check
    this.after = null;                      // what ring-out hands over to
    this.value = 0;
    this.tween = 0;                         // 0…1 inside ring-in / ring-out / check stroke
    this.ring = { r: RING_R, w: RING_W, arc: 0, track: 0 };
    this.next = 0; this.rest = 0; this.raf = 0; this.last = 0;
    this.frame = this.frame.bind(this);
    this.draw();
  }

  Loader.prototype.reduced = function () { return matchMedia('(prefers-reduced-motion: reduce)').matches; };

  // leaving the free spin: coast forward and stop, instead of snapping back to the last target
  Loader.prototype.coast = function () {
    if (this.phase === 'spin') this.angle.to = this.angle.x + this.angle.v * 0.45;
  };

  Loader.prototype.morphTo = function (name) {
    // start from whatever is on screen now, so a morph can be interrupted by another
    const cur = new Float32Array(N), m = this.m.x;
    for (let i = 0; i < N; i++) cur[i] = lerp(this.from[i], this.to[i], m);
    this.from = cur; this.to = SHAPES[name]; this.m.x = 0; this.m.v = 0; this.m.to = 1;
  };

  Loader.prototype.indeterminate = function () {
    this.svg.removeAttribute('aria-valuenow');
    this.svg.removeAttribute('aria-valuetext');
    if (this.phase === 'ring' || this.phase === 'ring-in') return this.ringOut('spin');
    if (this.phase === 'ring-out') { this.after = 'spin'; return; }
    this.startSpin();
  };

  Loader.prototype.startSpin = function () {
    this.svg.classList.remove('mp--idle', 'mp--error', 'mp--done');
    this.phase = 'spin';
    this.scale.to = 1;
    let name = CYCLE[this.next++ % CYCLE.length];
    if (SHAPES[name] === this.to) name = CYCLE[this.next++ % CYCLE.length];
    this.morphTo(name);
    this.rest = 0;
    this.kick();
  };

  Loader.prototype.progress = function (v, text) {
    this.value = clamp(v, 0, 1);
    this.svg.setAttribute('aria-valuemin', '0');
    this.svg.setAttribute('aria-valuemax', '100');
    this.svg.setAttribute('aria-valuenow', String(Math.round(this.value * 100)));
    if (text) this.svg.setAttribute('aria-valuetext', text);
    if (this.phase === 'ring' || this.phase === 'ring-in') { this.arcS.to = this.value * 100; return this.kick(); }
    if (this.phase === 'ring-out') { this.after = 'settle'; return; }
    if (this.phase !== 'settle') {
      this.coast();
      this.svg.classList.remove('mp--idle', 'mp--error', 'mp--done');
      this.phase = 'settle';
      this.scale.to = 1;
      this.morphTo('circle');
    }
    this.kick();
  };

  Loader.prototype.fail = function () {
    this.svg.classList.add('mp--error');
    this.svg.removeAttribute('aria-valuenow');
    if (this.phase === 'ring' || this.phase === 'ring-in') return this.ringOut('cross', 260);
    if (this.phase === 'ring-out') { this.after = 'cross'; return; }
    this.toCross();
  };

  Loader.prototype.toCross = function () {
    this.phase = 'cross';
    this.morphTo('cross');
    this.m.k = 230; this.m.c = 2 * Math.sqrt(230) * 0.5;   // a sharper fold with a visible bounce
    // stop turning on an upright ×, carrying the current spin into the stop
    this.angle.to = Math.ceil((this.angle.x + 20) / 90) * 90;
    this.scale.to = 0.84;
    this.kick();
  };

  Loader.prototype.done = function () {
    this.svg.removeAttribute('aria-valuetext');
    if (this.phase === 'ring' || this.phase === 'ring-in') return this.ringOut('check');
    if (this.phase === 'ring-out') { this.after = 'check'; return; }
    this.toCheck();
  };

  Loader.prototype.toCheck = function () {
    this.coast();
    this.phase = 'check';
    this.svg.classList.add('mp--done');
    this.morphTo('circle');
    this.tween = 0;
    this.scale.x = 0.9; this.scale.to = 1;
    this.kick();
  };

  Loader.prototype.reset = function () {
    this.svg.classList.remove('mp--error', 'mp--done');
    this.svg.classList.add('mp--idle');
    this.svg.removeAttribute('aria-valuenow');
    this.svg.removeAttribute('aria-valuetext');
    this.coast();
    this.phase = 'idle';
    this.value = 0; this.arcS.x = this.arcS.to = 0;
    this.morphTo('cookie');
    this.scale.to = 1;
    this.kick();
  };

  Loader.prototype.ringOut = function (after, ms) {
    this.phase = 'ring-out';
    this.after = after;
    this.tween = 0;
    this.outMs = ms || 380;
    this.from0 = { r: this.ring.r, w: this.ring.w, arc: this.ring.arc, track: this.ring.track };
    this.kick();
  };

  Loader.prototype.kick = function () {
    if (!this.raf) { this.last = performance.now(); this.raf = requestAnimationFrame(this.frame); }
  };

  Loader.prototype.frame = function (now) {
    this.raf = 0;
    const dt = clamp((now - this.last) / 1000, 0.001, 0.05);
    this.last = now;
    const still = this.reduced();
    let busy = !this.m.idle(0.002) || !this.scale.idle(0.002) || !this.angle.idle(0.05);

    this.m.step(dt);
    this.scale.step(dt);

    if (this.phase === 'spin') {
      // free turn, a little faster while the outline is changing
      const speed = still ? 0 : 110 + 70 * Math.min(Math.abs(this.m.v), 4);
      this.angle.x += speed * dt; this.angle.to = this.angle.x; this.angle.v = speed;
      if (this.m.idle(0.01)) {
        this.rest += dt * 1000;
        if (this.rest > (still ? HOLD * 5 : HOLD)) { this.rest = 0; this.morphTo(CYCLE[this.next++ % CYCLE.length]); }
      }
      busy = true;
    } else {
      this.angle.step(dt);
    }

    if (this.phase === 'settle' && Math.abs(1 - this.m.x) < 0.04 && Math.abs(this.m.v) < 1.2) {
      // the outline is a disc now: redraw it as a ring whose stroke covers the whole disc, then thin it out
      this.phase = 'ring-in';
      this.tween = 0;
      const R0 = 0.9 * BLOB;
      this.ring = { r: R0 / 2, w: R0, arc: 100, track: 0 };
      this.arcS.x = 100; this.arcS.v = 0; this.arcS.to = this.value * 100;
    }

    if (this.phase === 'ring-in') {
      this.tween = Math.min(1, this.tween + dt / (still ? 0.2 : 0.56));
      const e = easeOut(this.tween), R0 = 0.9 * BLOB;
      this.ring.r = lerp(R0 / 2, RING_R, e);
      this.ring.w = lerp(R0, RING_W, e);
      this.ring.track = e;
      // the arc unwinds from a full disc to the real value on the same curve
      this.arcS.x = lerp(100, this.arcS.to, e);
      this.ring.arc = this.arcS.x;
      if (this.tween >= 1) this.phase = 'ring';
      busy = true;
    } else if (this.phase === 'ring') {
      this.arcS.step(dt);
      this.ring.arc = clamp(this.arcS.x, 0, 100);
      if (!this.arcS.idle(0.05)) busy = true;
    } else if (this.phase === 'ring-out') {
      this.tween = Math.min(1, this.tween + dt / ((still ? 200 : this.outMs) / 1000));
      const e = easeInOut(this.tween), R0 = 0.9 * BLOB, f = this.from0;
      this.ring.r = lerp(f.r, R0 / 2, e);
      this.ring.w = lerp(f.w, R0, e);
      this.ring.arc = lerp(f.arc, 100, e);
      this.ring.track = lerp(f.track, 0, e);
      if (this.tween >= 1) {
        // hand the disc back to the outline renderer as a circle
        this.from = SHAPES.circle; this.to = SHAPES.circle; this.m.x = 1; this.m.v = 0; this.m.to = 1;
        const after = this.after; this.after = null;
        if (after === 'spin') this.startSpin();
        else if (after === 'cross') this.toCross();
        else if (after === 'check') this.toCheck();
        else if (after === 'settle') { this.phase = 'settle'; }
      }
      busy = true;
    } else if (this.phase === 'check') {
      if (Math.abs(1 - this.m.x) < 0.05) this.tween = Math.min(1, this.tween + dt / (still ? 0.1 : 0.3));
      if (this.tween < 1) busy = true;
    } else if (this.phase === 'cross' && this.m.idle(0.002)) {
      this.m.k = 150; this.m.c = 2 * Math.sqrt(150) * 0.6;
    }

    this.draw();
    if (busy) this.raf = requestAnimationFrame(this.frame);
  };

  Loader.prototype.draw = function () {
    const ringMode = this.phase === 'ring-in' || this.phase === 'ring' || this.phase === 'ring-out';
    this.spin.style.display = ringMode ? 'none' : '';
    this.track.style.display = this.arc.style.display = ringMode ? '' : 'none';
    if (ringMode) {
      const g = this.ring;
      for (const c of [this.track, this.arc]) { c.setAttribute('r', g.r.toFixed(2)); c.setAttribute('stroke-width', g.w.toFixed(2)); }
      this.track.style.opacity = g.track.toFixed(3);
      this.arc.setAttribute('stroke-dasharray', `${g.arc.toFixed(2)} 100`);
      this.arc.setAttribute('stroke-linecap', g.w < 12 ? 'round' : 'butt');
    } else {
      const r = new Float32Array(N), m = this.m.x;
      for (let i = 0; i < N; i++) r[i] = Math.max(0.05, lerp(this.from[i], this.to[i], m));
      this.blob.setAttribute('d', pathOf(r, BLOB));
      this.spin.setAttribute('transform', `rotate(${(this.angle.x % 360).toFixed(2)}) scale(${this.scale.x.toFixed(4)})`);
    }
    const drawn = this.phase === 'check' ? this.tween : 0;
    this.check.style.display = drawn > 0 ? '' : 'none';
    this.check.setAttribute('stroke-dasharray', `${(drawn * 100).toFixed(2)} 100`);
  };

  // A still of the loader for posters and tests: pose('ring', 0.38) or pose('blob', 0.5, 'clover', 'burst')
  Loader.prototype.pose = function (kind, t, a, b) {
    cancelAnimationFrame(this.raf); this.raf = 0;
    this.svg.classList.remove('mp--idle');
    if (kind === 'ring') {
      this.phase = 'ring'; this.value = t;
      this.ring = { r: RING_R, w: RING_W, arc: t * 100, track: 1 };
      this.arcS.x = this.arcS.to = t * 100;
    } else {
      this.phase = 'spin';
      this.from = SHAPES[a || 'clover']; this.to = SHAPES[b || 'burst']; this.m.x = t; this.m.to = 1;
      this.angle.x = 24;
    }
    this.draw();
  };

  // ---- the estimate ----
  // Rate: an exponentially weighted mean and variance of the measured speed (time constant tau), plus a fast mean.
  // Spread, relative to the rate: the noise of the mean over the samples it holds, the gap between the fast and the
  // slow mean (the network changed its mood), and a warm-up doubt that fades over the first seconds.
  function Eta(opts) { opts = opts || {}; this.tau = opts.tau || 2.5; this.reset(); }
  Eta.prototype.reset = function () { this.t = null; this.mean = 0; this.fast = 0; this.varr = 0; this.n = 0; this.t0 = 0; this.last = null; };
  Eta.prototype.sample = function (t, done, total) {
    if (this.t === null) { this.t = this.t0 = t; this.d = done; return null; }
    const dt = t - this.t;
    if (dt < 0.15) return this.last;
    const rate = (done - this.d) / dt;
    this.t = t; this.d = done;
    const a = 1 - Math.exp(-dt / this.tau);
    if (this.n === 0) { this.mean = this.fast = rate; this.varr = (rate * 0.4) ** 2; }
    else {
      const diff = rate - this.mean, inc = a * diff;
      this.mean += inc;
      this.varr = (1 - a) * (this.varr + diff * inc);
      this.fast += (rate - this.fast) * (1 - Math.exp(-dt / 0.7));
    }
    this.n++;
    const mean = Math.max(this.mean, 1e-6), remaining = Math.max(0, total - done);
    const cv = Math.sqrt(this.varr) / mean;
    const held = Math.min(this.n, 2 * this.tau / dt);
    const gap = Math.abs(this.fast - mean) / mean;
    const warm = 0.7 * Math.exp(-(t - this.t0) / 3.5);
    const rel = Math.min(0.8, Math.sqrt(cv * cv / held + gap * gap + warm * warm + 0.0016));
    this.last = { est: remaining / mean, lo: remaining / (mean * (1 + rel)), hi: remaining / (mean * (1 - rel)), rel, rate: mean };
    return this.last;
  };

  // "About 40 s left" while the spread is wide, "12 s left" once it is narrow.
  function formatEta(e) {
    if (!e) return '';
    const s = e.est;
    if (e.rel > 0.2) {
      if (s >= 90) return `About ${Math.round(s / 60)} min left`;
      const step = s < 12 ? 1 : s < 30 ? 5 : 10;
      return `About ${Math.max(step, Math.round(s / step) * step)} s left`;
    }
    if (s >= 90) return `${Math.floor(s / 60)} min ${Math.round(s % 60)} s left`;
    return s < 1 ? 'Almost done' : `${Math.ceil(s)} s left`;
  }

  window.MorphProgress = { Loader, Eta, formatEta, shapePath: (name, radius) => pathOf(SHAPES[name], radius) };
})();
