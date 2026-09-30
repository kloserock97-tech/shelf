// Bubble Target Cursor: inside [data-bubble-cursor] the pointer's hit area always reaches the nearest control
// (up to data-reach px). A liquid neck joins the pointer to that control, a click anywhere activates it,
// and the velocity ray lights the control you are heading to before you get there.
(() => {
  const NS = 'http://www.w3.org/2000/svg';
  const TARGETS = 'button:not([disabled]), a[href], [role="button"]:not([aria-disabled="true"]), [data-bubble-target]';
  const SKIP = 'input, textarea, select, [contenteditable=""], [contenteditable="true"], [data-bubble-ignore]';
  const PAD = 4;          // halo gap around the captured control, px
  const SPRING = 0.026;   // 1/ms: the halo reaches 95% of a move in ~115 ms
  const HOLD = 2;         // px: a new control must be this much closer to take over (no flicker on ties)
  const RAY_MIN = 0.3;    // px/ms: slower than this, no prediction
  const RAY_TIME = 380;   // ms of travel the ray looks ahead
  const RAY_MAX = 640;    // px
  const GRID = 6;         // px between samples of the hit-area map
  let seq = 0;

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const mix = (a, b, t) => a + (b - a) * t;
  const make = (tag, attrs, parent) => {
    const el = document.createElementNS(NS, tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(el);
    return el;
  };
  // Distance from a point to a rectangle, 0 inside.
  const rectDist = (x, y, r) => Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom));
  // First entry of the ray o + t·d (t in 0..tMax) into a rectangle, or -1.
  const rayEnter = (ox, oy, dx, dy, r, tMax) => {
    let t0 = 0, t1 = tMax;
    if (Math.abs(dx) < 1e-6) { if (ox < r.left || ox > r.right) return -1; }
    else {
      let a = (r.left - ox) / dx, b = (r.right - ox) / dx;
      if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a); t1 = Math.min(t1, b);
    }
    if (Math.abs(dy) < 1e-6) { if (oy < r.top || oy > r.bottom) return -1; }
    else {
      let a = (r.top - oy) / dy, b = (r.bottom - oy) / dy;
      if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a); t1 = Math.min(t1, b);
    }
    return t0 <= t1 ? t0 : -1;
  };
  const grow = (r, g) => ({ left: r.left - g, top: r.top - g, right: r.right + g, bottom: r.bottom + g });

  class BubbleCursor {
    constructor(root) {
      this.root = root;
      this.reach = Number(root.dataset.reach) || 120;
      this.p = { x: 0, y: 0 };
      this.v = { x: 0, y: 0 };
      this.tMove = 0;
      this.on = false;           // a mouse is inside and the keyboard is not in charge
      this.flashUntil = 0;       // a tap shows the blob for a moment
      this.hold = false;         // pointAt(): keep the velocity for a still frame
      this.pressed = false;
      this.cap = null; this.capR = null; this.capD = Infinity; this.capIdx = -1;
      this.pred = null; this.predPt = null;
      this.halo = null;          // animated {x, y, w, h, r}
      this.alpha = 0; this.rayA = 0;
      this.list = []; this.rects = []; this.dirty = true;
      this.raf = 0; this.tLast = 0; this.sentD = -1;
      this.areas = false;
      this.rm = matchMedia('(prefers-reduced-motion: reduce)');
      this.build();
      this.bind();
      root.bubbleCursor = this;
    }

    build() {
      const id = `bt-goo-${++seq}`;
      const svg = make('svg', { class: 'bt-svg', 'aria-hidden': 'true', focusable: 'false' });
      const defs = make('defs', {}, svg);
      // Metaball: blur the shapes, cut the alpha sharply, then keep a thin ring plus a faint fill.
      const f = make('filter', { id, filterUnits: 'userSpaceOnUse', 'color-interpolation-filters': 'sRGB' }, defs);
      make('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: '4', result: 'b' }, f);
      make('feColorMatrix', { in: 'b', type: 'matrix', values: '1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 21 -8.6', result: 's' }, f);
      make('feMorphology', { in: 's', operator: 'erode', radius: '1.2', result: 'e' }, f);
      make('feComposite', { in: 's', in2: 'e', operator: 'out', result: 'ring' }, f);
      const ct = make('feComponentTransfer', { in: 's', result: 'fill' }, f);
      this.fillA = make('feFuncA', { type: 'linear', slope: '0.16' }, ct);
      const m = make('feMerge', {}, f);
      make('feMergeNode', { in: 'fill' }, m);
      make('feMergeNode', { in: 'ring' }, m);
      this.filter = f;
      this.ray = make('line', { class: 'bt-ray' }, svg);
      this.goo = make('g', { filter: `url(#${id})`, fill: 'currentColor' }, svg);
      this.blob = make('circle', { r: '10' }, this.goo);
      this.neck = make('path', {}, this.goo);
      this.haloEl = make('rect', {}, this.goo);
      this.core = make('circle', { class: 'bt-core', r: '3.5', fill: 'currentColor' }, svg);
      this.svg = svg;
      svg.style.display = 'none';
      document.body.appendChild(svg);
      this.readTheme();
    }

    readTheme() {
      const cs = getComputedStyle(this.root);
      this.fillA.setAttribute('slope', cs.getPropertyValue('--bt-fill').trim() || '0.16');
      this.lineCol = cs.getPropertyValue('--bt-line').trim() || 'rgba(0,0,0,.2)';
      this.accent = cs.getPropertyValue('--bt-accent').trim() || '#0073e6';
      if (this.areas) this.paintAreas();
    }

    bind() {
      const r = this.root;
      r.addEventListener('pointermove', (e) => {
        if (e.pointerType === 'touch') return;
        const now = performance.now();
        const dt = Math.max(1, now - (this.tMove || now - 16));
        if (this.on && dt < 100) {
          const k = 1 - Math.exp(-dt / 45);
          this.v.x = mix(this.v.x, (e.clientX - this.p.x) / dt, k);
          this.v.y = mix(this.v.y, (e.clientY - this.p.y) / dt, k);
        } else { this.v.x = 0; this.v.y = 0; }
        this.tMove = now;
        this.p.x = e.clientX; this.p.y = e.clientY;
        this.hold = false;
        this.overField = !!e.target.closest(SKIP);
        this.setOn(!this.overField);
        this.kick();
      });
      r.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch') { this.setOn(false); this.kick(); } });
      r.addEventListener('pointerdown', (e) => {
        this.lastType = e.pointerType;
        if (e.pointerType !== 'touch' && this.cap) { this.pressed = true; this.cap.classList.add('bt-pressed'); this.kick(); }
      });
      addEventListener('pointerup', () => {
        if (!this.pressed) return;
        this.pressed = false;
        this.root.querySelectorAll('.bt-pressed').forEach((el) => el.classList.remove('bt-pressed'));
        this.kick();
      });
      r.addEventListener('click', (e) => this.onClick(e), true);
      addEventListener('keydown', (e) => {
        if (e.key === 'Tab' || e.key.startsWith('Arrow') || e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
          this.setOn(false); this.alpha = 0; this.kick();
        }
      });
      const relayout = () => { if (this.areas) this.scheduleAreas(); if (this.on) this.kick(); };
      addEventListener('resize', relayout);
      addEventListener('scroll', relayout, { capture: true, passive: true });
      new MutationObserver(() => { this.dirty = true; relayout(); })
        .observe(r, { subtree: true, childList: true, attributes: true, attributeFilter: ['disabled', 'hidden', 'aria-disabled', 'style'] });
      this.rm.addEventListener('change', () => { this.setOn(this.on); this.kick(); });
      matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => this.readTheme());
    }

    setOn(on) {
      this.on = on;
      this.root.classList.toggle('bt-on', on && !this.rm.matches);
      if (!on) { this.setPred(null); this.v.x = this.v.y = 0; }
    }

    kick() {
      if (this.raf) return;
      this.tLast = performance.now();
      this.raf = requestAnimationFrame((t) => this.frame(t));
    }

    collect() {
      if (this.dirty) {
        this.list = [...this.root.querySelectorAll(TARGETS)].filter((el) => !el.closest('[data-bubble-ignore], [inert]'));
        this.dirty = false;
      }
      this.rects = this.list.map((el) => {
        const b = el.getBoundingClientRect();
        return b.width && b.height ? b : null;
      });
    }

    nearest(x, y) {
      let best = -1, d = Infinity;
      for (let i = 0; i < this.rects.length; i++) {
        const r = this.rects[i];
        if (!r) continue;
        const di = rectDist(x, y, r);
        if (di < d) { d = di; best = i; }
      }
      return { i: best, d };
    }

    onClick(e) {
      if (e.detail === 0 || e.button !== 0) return;            // keyboard or a synthetic click: leave it alone
      if (e.target.closest(SKIP)) return;
      this.collect();
      let el = null;
      if (this.lastType !== 'touch' && this.cap) el = this.cap;
      else {
        const n = this.nearest(e.clientX, e.clientY);
        if (n.i >= 0 && n.d <= this.reach) el = this.list[n.i];
      }
      if (!el || el.contains(e.target)) return;               // nothing in reach, or a direct hit
      e.preventDefault();
      e.stopPropagation();
      if (this.lastType === 'touch') {
        this.p.x = e.clientX; this.p.y = e.clientY;
        this.flashUntil = performance.now() + 460;
        this.kick();
      }
      el.click();
    }

    setCap(el, i, r, d) {
      if (el !== this.cap) {
        this.cap?.classList.remove('bt-captured');
        el?.classList.add('bt-captured');
        if (el && !this.cap && this.halo) this.bloom = true;
        this.cap = el;
        this.capIdx = i;
        if (this.areas) this.paintAreas();
        this.sentD = -1;
      }
      this.capR = r;
      this.capD = d;
      const rd = el ? Math.round(d) : -1;
      if (rd !== this.sentD) {
        this.sentD = rd;
        this.root.dispatchEvent(new CustomEvent('bubbletarget', { detail: { target: el, distance: rd } }));
      }
    }

    setPred(el, pt) {
      if (el === this.pred) { this.predPt = pt; return; }
      this.pred?.classList.remove('bt-predicted');
      el?.classList.add('bt-predicted');
      this.pred = el;
      this.predPt = pt;
    }

    frame(t) {
      const dt = Math.min(64, Math.max(1, t - this.tLast));
      this.tLast = t;
      this.raf = 0;
      if (this.step(dt)) this.kick();
    }

    // One simulation step; returns true while anything is still moving.
    step(dt) {
      const now = performance.now();
      const live = this.on || now < this.flashUntil;
      const rm = this.rm.matches;
      this.collect();
      if (!this.hold) { const f = Math.exp(-dt / 70); this.v.x *= f; this.v.y *= f; }

      // 1. Which control owns the pointer: the nearest one within reach, with a little stickiness.
      let el = null, idx = -1, rect = null, d = Infinity;
      if (live) {
        const n = this.nearest(this.p.x, this.p.y);
        if (n.i >= 0 && n.d <= this.reach) { idx = n.i; el = this.list[n.i]; rect = this.rects[n.i]; d = n.d; }
        const ci = this.cap ? this.list.indexOf(this.cap) : -1;
        if (el && ci >= 0 && ci !== idx && this.rects[ci]) {
          const dc = rectDist(this.p.x, this.p.y, this.rects[ci]);
          if (dc <= this.reach && dc - d < HOLD) { idx = ci; el = this.cap; rect = this.rects[ci]; d = dc; }
        }
      }
      this.setCap(el, idx, rect, d);

      // 2. Where the pointer is heading: cast the velocity ray, light the first control it enters.
      const speed = Math.hypot(this.v.x, this.v.y);
      let pred = null, predPt = null;
      if (this.on && !rm && speed > RAY_MIN) {
        const len = Math.min(RAY_MAX, speed * RAY_TIME);
        const dx = this.v.x / speed, dy = this.v.y / speed;
        let tBest = Infinity;
        for (let i = 0; i < this.rects.length; i++) {
          const r = this.rects[i];
          if (!r || i === idx) continue;
          const tt = rayEnter(this.p.x, this.p.y, dx, dy, grow(r, 8), len);
          if (tt > 0 && tt < tBest) { tBest = tt; pred = this.list[i]; }
        }
        if (pred) predPt = { x: this.p.x + dx * tBest, y: this.p.y + dy * tBest };
      }
      this.setPred(pred, predPt);

      if (rm) { this.svg.style.display = 'none'; this.alpha = 0; return false; }

      // 3. Animate the halo: around the captured control, or folded into the pointer.
      const pad = this.pressed ? PAD - 2 : PAD;
      let T;
      if (el) {
        const rad = this.radiusOf(el) + pad;
        T = { x: rect.left - pad, y: rect.top - pad, w: rect.width + pad * 2, h: rect.height + pad * 2, r: rad };
      } else T = { x: this.p.x - 5, y: this.p.y - 5, w: 10, h: 10, r: 5 };
      if (!this.halo) this.halo = { ...T };
      if (this.bloom) {
        // a fresh capture grows out of the point where the neck meets the control
        const ax = clamp(this.p.x, T.x, T.x + T.w), ay = clamp(this.p.y, T.y, T.y + T.h);
        this.halo = { x: ax - 4, y: ay - 4, w: 8, h: 8, r: 4 };
        this.bloom = false;
      }
      const k = 1 - Math.exp(-dt * SPRING);
      let moving = false;
      for (const key of ['x', 'y', 'w', 'h', 'r']) {
        this.halo[key] = mix(this.halo[key], T[key], k);
        if (Math.abs(this.halo[key] - T[key]) > 0.15) moving = true;
      }
      const aT = live ? 1 : 0;
      this.alpha = mix(this.alpha, aT, 1 - Math.exp(-dt / 70));
      if (Math.abs(this.alpha - aT) > 0.01) moving = true; else this.alpha = aT;
      const rT = pred ? clamp((speed - RAY_MIN) / 0.5, 0, 1) : 0;
      this.rayA = mix(this.rayA, rT, 1 - Math.exp(-dt / 60));
      if (Math.abs(this.rayA - rT) > 0.01) moving = true;
      if (speed > 0.02 && !this.hold) moving = true;
      if (live && now < this.flashUntil) moving = true;
      this.draw(d);
      return moving;
    }

    radiusOf(el) {
      if (el._btR === undefined) el._btR = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
      return el._btR;
    }

    draw(d) {
      if (this.alpha < 0.01) { this.svg.style.display = 'none'; return; }
      this.svg.style.display = '';
      const { x, y } = this.p;
      const H = this.halo;
      const r = this.pressed ? 8.5 : 10;
      this.blob.setAttribute('cx', x); this.blob.setAttribute('cy', y); this.blob.setAttribute('r', r);
      this.core.setAttribute('cx', x); this.core.setAttribute('cy', y);
      this.core.setAttribute('r', this.pressed ? 3 : 3.5);
      this.haloEl.setAttribute('x', H.x); this.haloEl.setAttribute('y', H.y);
      this.haloEl.setAttribute('width', Math.max(0, H.w)); this.haloEl.setAttribute('height', Math.max(0, H.h));
      this.haloEl.setAttribute('rx', Math.min(H.r, H.w / 2, H.h / 2));
      // The neck: a tapered band from the pointer to the closest point of the halo, thinner as it stretches.
      const ax = clamp(x, H.x, H.x + H.w), ay = clamp(y, H.y, H.y + H.h);
      const lx = ax - x, ly = ay - y, len = Math.hypot(lx, ly);
      if (len > 1) {
        const nx = -ly / len, ny = lx / len;
        const t = Number.isFinite(d) ? clamp(d / this.reach, 0, 1) : 0;
        const w0 = 7, w1 = mix(5.4, 3.3, t);
        this.neck.setAttribute('d', `M${x + nx * w0} ${y + ny * w0}L${ax + nx * w1} ${ay + ny * w1}L${ax - nx * w1} ${ay - ny * w1}L${x - nx * w0} ${y - ny * w0}Z`);
      } else this.neck.setAttribute('d', '');
      const m = 24;
      const x0 = Math.min(x - r, H.x) - m, y0 = Math.min(y - r, H.y) - m;
      const x1 = Math.max(x + r, H.x + H.w) + m, y1 = Math.max(y + r, H.y + H.h) + m;
      this.filter.setAttribute('x', x0); this.filter.setAttribute('y', y0);
      this.filter.setAttribute('width', x1 - x0); this.filter.setAttribute('height', y1 - y0);
      this.goo.setAttribute('opacity', this.alpha.toFixed(3));
      this.core.setAttribute('opacity', this.alpha.toFixed(3));
      if (this.rayA > 0.01 && this.predPt) {
        this.ray.setAttribute('x1', x); this.ray.setAttribute('y1', y);
        this.ray.setAttribute('x2', this.predPt.x); this.ray.setAttribute('y2', this.predPt.y);
        this.ray.setAttribute('opacity', (this.rayA * this.alpha).toFixed(3));
        this.ray.style.display = '';
      } else this.ray.style.display = 'none';
    }

    // Freeze the cursor at a point (posters, tests): velocity in px/ms.
    pointAt(x, y, vx = 0, vy = 0) {
      this.p.x = x; this.p.y = y; this.v.x = vx; this.v.y = vy;
      this.hold = true;
      this.setOn(true);
      this.alpha = 1;
      for (let i = 0; i < 40; i++) this.step(16);
    }

    // Hit-area map: each control's territory (points closer to it than to any other, within reach).
    showAreas(on) {
      this.areas = on;
      if (!on) { this.canvas?.remove(); this.canvas = null; return; }
      if (!this.canvas) {
        this.canvas = document.createElement('canvas');
        this.canvas.className = 'bt-areas';
        this.canvas.setAttribute('aria-hidden', 'true');
        document.body.appendChild(this.canvas);
      }
      this.computeAreas();
    }

    scheduleAreas() {
      if (this.areasRaf) return;
      this.areasRaf = requestAnimationFrame(() => { this.areasRaf = 0; if (this.areas) this.computeAreas(); });
    }

    computeAreas() {
      this.collect();
      const R = this.root.getBoundingClientRect();
      const cols = Math.ceil(R.width / GRID) + 1, rows = Math.ceil(R.height / GRID) + 1;
      const lab = new Int16Array(cols * rows);
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const n = this.nearest(R.left + Math.min(i * GRID, R.width), R.top + Math.min(j * GRID, R.height));
          lab[j * cols + i] = n.i >= 0 && n.d <= this.reach ? n.i : -1;
        }
      }
      this.map = { R, cols, rows, lab };
      const dpr = Math.min(2, devicePixelRatio || 1);
      const c = this.canvas;
      c.style.left = `${R.left}px`; c.style.top = `${R.top}px`;
      c.style.width = `${R.width}px`; c.style.height = `${R.height}px`;
      c.width = Math.round(R.width * dpr); c.height = Math.round(R.height * dpr);
      this.dpr = dpr;
      this.paintAreas();
    }

    paintAreas() {
      const M = this.map, c = this.canvas;
      if (!M || !c) return;
      const g = c.getContext('2d');
      const { R, cols, rows, lab } = M;
      const px = (i) => Math.min(i * GRID, R.width), py = (j) => Math.min(j * GRID, R.height);
      g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      g.clearRect(0, 0, R.width, R.height);
      // The captured control's territory, filled softly (a coarse image, smoothed on upscale).
      if (this.capIdx >= 0) {
        const off = document.createElement('canvas');
        off.width = cols; off.height = rows;
        const og = off.getContext('2d');
        const img = og.createImageData(cols, rows);
        for (let k = 0; k < lab.length; k++) if (lab[k] === this.capIdx) img.data[k * 4 + 3] = 255;
        og.putImageData(img, 0, 0);
        g.save();
        g.drawImage(off, -GRID / 2, -GRID / 2, cols * GRID, rows * GRID);
        g.globalCompositeOperation = 'source-in';
        g.globalAlpha = 0.09;
        g.fillStyle = this.accent;
        g.fillRect(0, 0, R.width, R.height);
        g.restore();
      }
      // Borders: marching squares on the distance difference, so the lines run where two controls are equally near.
      const field = (a, b, x, y) => {
        const X = R.left + x, Y = R.top + y;
        const da = a < 0 ? this.reach : rectDist(X, Y, this.rects[a]);
        const db = b < 0 ? this.reach : rectDist(X, Y, this.rects[b]);
        return da - db;
      };
      const inner = new Path2D(), outer = new Path2D();
      for (let j = 0; j < rows - 1; j++) {
        for (let i = 0; i < cols - 1; i++) {
          const k = j * cols + i;
          const L = [lab[k], lab[k + 1], lab[k + cols + 1], lab[k + cols]];
          if (L[0] === L[1] && L[1] === L[2] && L[2] === L[3]) continue;
          const P = [[px(i), py(j)], [px(i + 1), py(j)], [px(i + 1), py(j + 1)], [px(i), py(j + 1)]];
          const set = [...new Set(L)];
          const path = set.includes(-1) ? outer : inner;
          if (set.length === 2) {
            const [a, b] = set;
            const f = P.map(([x, y]) => field(a, b, x, y));
            const pts = [];
            for (let e = 0; e < 4; e++) {
              const e2 = (e + 1) % 4;
              if ((L[e] === a) !== (L[e2] === a)) {
                const t = clamp(f[e] / (f[e] - f[e2] || 1e-6), 0, 1);
                pts.push([mix(P[e][0], P[e2][0], t), mix(P[e][1], P[e2][1], t)]);
              }
            }
            for (let q = 0; q + 1 < pts.length; q += 2) { path.moveTo(pts[q][0], pts[q][1]); path.lineTo(pts[q + 1][0], pts[q + 1][1]); }
          } else {
            const cx = (P[0][0] + P[2][0]) / 2, cy = (P[0][1] + P[2][1]) / 2;
            for (let e = 0; e < 4; e++) {
              const e2 = (e + 1) % 4;
              if (L[e] !== L[e2]) { path.moveTo((P[e][0] + P[e2][0]) / 2, (P[e][1] + P[e2][1]) / 2); path.lineTo(cx, cy); }
            }
          }
        }
      }
      g.lineWidth = 1;
      g.strokeStyle = this.lineCol;
      g.stroke(inner);
      g.setLineDash([3, 4]);
      g.stroke(outer);
      g.setLineDash([]);
    }
  }

  window.BubbleCursor = BubbleCursor;
  document.querySelectorAll('[data-bubble-cursor]').forEach((el) => new BubbleCursor(el));
})();
