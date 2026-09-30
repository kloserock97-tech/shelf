/* Morphing Island — one persistent pill that changes role with its content.
   The pill holds every view it can show (idle, live activity, message, expanded controls) and morphs its width,
   height and corner radius on springs to fit the view on stage, while the views cross-fade through a blur.
   A second live activity splits off into a round bubble beside it. Long-press expands, a swipe dismisses.

   const island = new MorphingIsland(rootElement);
   island.show('timer'); island.bubble('upload'); island.bubble(null);
   Events on the root: island:press (tap, Enter, Space), island:hold (long-press), island:dismiss { dir },
   island:bubble (bubble tapped), island:escape (Esc or a press outside while expanded). */
(function () {
  'use strict';

  const HOLD_MS = 420;     // long-press
  const FLING = 56;        // px of swipe that dismisses
  const GAP = 8;           // px between the pill and the bubble
  const BUB = 36;          // bubble size
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const buzz = (ms) => { try { navigator.vibrate && navigator.vibrate(ms); } catch (_) { /* not allowed */ } };

  function Spring(k, zeta, x) { this.set(k, zeta); this.x = x; this.v = 0; this.to = x; }
  Spring.prototype.set = function (k, zeta) { this.k = k; this.c = 2 * Math.sqrt(k) * zeta; return this; };
  Spring.prototype.step = function (dt) {
    const h = dt / 3;
    for (let i = 0; i < 3; i++) { this.v += (this.k * (this.to - this.x) - this.c * this.v) * h; this.x += this.v * h; }
  };
  Spring.prototype.idle = function (eps) { return Math.abs(this.to - this.x) < eps && Math.abs(this.v) < eps * 10; };
  Spring.prototype.snap = function (x) { this.x = this.to = x; this.v = 0; };

  function MorphingIsland(root) {
    this.root = root;
    this.pill = root.querySelector('.mi__pill');
    this.hit = root.querySelector('.mi__hit');
    this.bub = root.querySelector('.mi__bubble');
    this.views = {};
    for (const v of this.pill.querySelectorAll('[data-view]')) this.views[v.dataset.view] = v;
    this.bviews = {};
    if (this.bub) for (const v of this.bub.querySelectorAll('[data-view]')) this.bviews[v.dataset.view] = v;

    // size and corner of the pill: a little overshoot, like a soft body settling
    this.w = new Spring(360, 0.68, 0);
    this.h = new Spring(360, 0.72, 0);
    this.r = new Spring(360, 0.8, 0);
    this.x = new Spring(260, 0.62, 0);    // swipe offset
    this.y = new Spring(260, 0.62, 0);
    this.s = new Spring(380, 0.6, 1);     // press / hold scale
    this.gx = new Spring(300, 0.8, 0);    // group shift that keeps pill + bubble centred
    this.bg = new Spring(300, 0.66, -BUB);// bubble gap: tucked under the pill's end when hidden
    this.bs = new Spring(320, 0.64, 0);   // bubble scale
    this.current = null; this.bcur = null; this.expanded = false;
    this.raf = 0; this.last = 0; this.suppressUntil = 0;
    this.frame = this.frame.bind(this);

    this.ro = new ResizeObserver(() => this.measure());
    this.bindGestures();
  }

  MorphingIsland.prototype.emit = function (type, detail) {
    this.root.dispatchEvent(new CustomEvent('island:' + type, { detail }));
  };

  MorphingIsland.prototype.measure = function () {
    const v = this.views[this.current];
    if (!v) return;
    const w = v.offsetWidth, h = v.offsetHeight;
    this.w.to = w; this.h.to = h;
    this.r.to = v.dataset.radius ? Math.min(Number(v.dataset.radius), h / 2) : h / 2;
    if (!this.shown) { this.w.snap(w); this.h.snap(h); this.r.snap(this.r.to); this.shown = true; this.paint(); }
    this.kick();
  };

  /** Morph the pill to a view. The view element has data-view="<name>" and sets its own size with padding. */
  MorphingIsland.prototype.show = function (name) {
    const v = this.views[name];
    if (!v || name === this.current) return;
    const old = this.views[this.current];
    if (old) { old.classList.remove('is-on'); old.setAttribute('aria-hidden', 'true'); this.ro.unobserve(old); }
    v.classList.add('is-on');
    v.removeAttribute('aria-hidden');
    this.current = name;
    this.expanded = v.hasAttribute('data-expanded');
    this.root.dataset.state = name;
    this.root.classList.toggle('mi--expanded', this.expanded);
    if (this.hit) {
      this.hit.hidden = this.expanded;
      this.hit.setAttribute('aria-expanded', String(this.expanded));
      if (v.dataset.label) this.hit.setAttribute('aria-label', v.dataset.label);
    }
    this.ro.observe(v);
    this.measure();
    // a bubble never sits beside the expanded island
    this.placeBubble();
  };

  /** Show a second activity as a bubble beside the pill, or hide it with null. */
  MorphingIsland.prototype.bubble = function (name) {
    if (name === this.bcur) return;
    if (this.bcur && this.bviews[this.bcur]) this.bviews[this.bcur].classList.remove('is-on');
    this.bcur = name;
    if (name && this.bviews[name]) {
      this.bviews[name].classList.add('is-on');
      if (this.bub.dataset[`label${name}`]) this.bub.setAttribute('aria-label', this.bub.dataset[`label${name}`]);
    }
    this.placeBubble();
  };

  MorphingIsland.prototype.placeBubble = function () {
    if (!this.bub) return;
    const on = !!this.bcur && !this.expanded;
    if (on) this.bub.hidden = false;   // hiding waits until the bubble has tucked back in
    this.bub.tabIndex = on ? 0 : -1;
    this.bub.setAttribute('aria-hidden', String(!on));
    this.bg.to = on ? GAP : -BUB;
    this.bs.to = on ? 1 : 0;
    this.gx.to = on ? -(BUB + GAP) / 2 : 0;
    this.kick();
  };

  /** Jump to the end of every morph at once (posters, tests, restoring a saved state). */
  MorphingIsland.prototype.settle = function () {
    this.measure();
    for (const sp of [this.w, this.h, this.r, this.x, this.y, this.s, this.gx, this.bg, this.bs]) sp.snap(sp.to);
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (this.bub) this.bub.hidden = !this.bcur || this.expanded;
    this.paint();
  };

  MorphingIsland.prototype.kick = function () {
    if (!this.raf) { this.last = performance.now(); this.raf = requestAnimationFrame(this.frame); }
  };

  MorphingIsland.prototype.frame = function (now) {
    this.raf = 0;
    const dt = clamp((now - this.last) / 1000, 0.001, 0.05);
    this.last = now;
    const still = reduced();
    const all = [this.w, this.h, this.r, this.x, this.y, this.s, this.gx, this.bg, this.bs];
    for (const sp of all) {
      if (still) { sp.x += (sp.to - sp.x) * (1 - Math.exp(-dt / 0.06)); sp.v = 0; }
      else sp.step(dt);
    }
    if (this.g && this.g.drag) { this.x.x = this.g.ox; this.x.v = 0; this.y.x = this.g.oy; this.y.v = 0; }
    this.paint();
    const busy = (this.g && this.g.drag) || all.some((sp) => !sp.idle(0.05));
    if (busy) this.raf = requestAnimationFrame(this.frame);
    else if (!this.bcur && this.bub) this.bub.hidden = true;
  };

  MorphingIsland.prototype.paint = function () {
    const w = Math.max(0, this.w.x), h = Math.max(0, this.h.x);
    const p = this.pill.style;
    p.width = w.toFixed(2) + 'px';
    p.height = h.toFixed(2) + 'px';
    p.borderRadius = clamp(this.r.x, 0, h / 2).toFixed(2) + 'px';
    // a sideways swipe stretches the pill a touch along the swipe, an upward one along the height
    const pull = Math.min(1, Math.abs(this.x.x) / 120), lift = Math.min(1, Math.abs(Math.min(0, this.y.x)) / 80);
    const sx = this.s.x * (1 + pull * 0.06 - lift * 0.04), sy = this.s.x * (1 - pull * 0.05 + lift * 0.05);
    p.transform = `translate(${(this.gx.x + this.x.x - w / 2).toFixed(2)}px, ${this.y.x.toFixed(2)}px) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`;
    p.opacity = String(clamp(1 - pull * 0.35 - lift * 0.35, 0, 1));
    if (this.bub) {
      const b = this.bub.style, s = Math.max(0, this.bs.x);
      b.transform = `translate(${(this.gx.x + w / 2 + this.bg.x).toFixed(2)}px, ${((Math.min(h, 36) - BUB) / 2).toFixed(2)}px) scale(${s.toFixed(4)})`;
      b.opacity = String(clamp(s * 1.3, 0, 1));
    }
  };

  MorphingIsland.prototype.bindGestures = function () {
    const pill = this.pill;
    const rubber = (d, lim) => Math.sign(d) * lim * (1 - Math.exp(-Math.abs(d) / lim));

    pill.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || !e.isPrimary) return;
      if (e.target.closest('button, a, input') && e.target !== this.hit && !this.hit.contains(e.target)) return;
      this.g = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t: performance.now(), vx: 0, vy: 0, drag: null, held: false, ox: 0, oy: 0 };
      try { pill.setPointerCapture(e.pointerId); } catch (_) { /* gone */ }
      if (!this.expanded) {
        // the hold charges: the pill swells slowly until the long-press lands
        this.s.set(42, 1).to = 1.06;
        this.holdTimer = setTimeout(() => {
          if (!this.g || this.g.drag) return;
          this.g.held = true;
          this.suppressUntil = performance.now() + 500;
          this.s.set(380, 0.6).to = 1;
          buzz(10);
          this.emit('hold');
        }, HOLD_MS);
      }
      this.kick();
    });

    pill.addEventListener('pointermove', (e) => {
      const g = this.g;
      if (!g || e.pointerId !== g.id) return;
      const dx = e.clientX - g.x0, dy = e.clientY - g.y0, now = performance.now();
      const dt = Math.max(1, now - g.t);
      g.vx = g.vx * 0.6 + ((e.clientX - (g.lx ?? g.x0)) / dt) * 0.4;
      g.vy = g.vy * 0.6 + ((e.clientY - (g.ly ?? g.y0)) / dt) * 0.4;
      g.lx = e.clientX; g.ly = e.clientY; g.t = now;
      if (!g.drag && Math.hypot(dx, dy) > 8 && !g.held) {
        g.drag = Math.abs(dx) >= Math.abs(dy) ? 'x' : dy < 0 ? 'y' : 'none';
        clearTimeout(this.holdTimer);
        this.s.set(380, 0.6).to = 1;
      }
      if (g.drag === 'x') g.ox = rubber(dx, 90);
      if (g.drag === 'y') g.oy = rubber(Math.min(0, dy), 50);
      if (g.drag) this.kick();
    });

    const end = (e) => {
      const g = this.g;
      if (!g || e.pointerId !== g.id) return;
      this.g = null;
      clearTimeout(this.holdTimer);
      this.s.set(380, 0.6).to = 1;
      if (g.drag === 'x' || g.drag === 'y') {
        this.suppressUntil = performance.now() + 400;
        const dist = g.drag === 'x' ? g.ox : -g.oy, vel = g.drag === 'x' ? g.vx : -g.vy;
        this.x.x = g.ox; this.y.x = g.oy;
        if (e.type === 'pointerup' && (Math.abs(dist) > FLING * 0.7 || Math.abs(vel) > 0.6)) {
          // carry the throw into the return, then let the new state land
          if (g.drag === 'x') this.x.v = clamp(g.vx * 1000, -1600, 1600);
          else this.y.v = clamp(g.vy * 1000, -1600, 0);
          this.emit('dismiss', { dir: g.drag === 'x' ? (dist > 0 ? 'right' : 'left') : 'up' });
        }
        this.x.to = 0; this.y.to = 0;
      }
      this.kick();
    };
    pill.addEventListener('pointerup', end);
    pill.addEventListener('pointercancel', end);
    pill.addEventListener('contextmenu', (e) => { if (this.g) e.preventDefault(); });

    if (this.hit) {
      this.hit.addEventListener('click', () => {
        if (performance.now() < this.suppressUntil) return;
        this.emit('press');
      });
      this.hit.addEventListener('keydown', (e) => {
        if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); this.emit('dismiss', { dir: 'key' }); }
      });
    }
    if (this.bub) this.bub.addEventListener('click', () => this.emit('bubble'));
    this.root.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.expanded) { e.preventDefault(); this.emit('escape'); } });
    document.addEventListener('pointerdown', (e) => { if (this.expanded && !this.root.contains(e.target)) this.emit('escape', { outside: true }); });
  };

  window.MorphingIsland = MorphingIsland;
})();
