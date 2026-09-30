// Shared Light Surface: one lamp above a layout lights every card in it the same way. The floor and the cards share
// one pool of light (cos³ falloff from the lamp), each card gets a rim and a sheen on the side that faces the lamp,
// and casts a shadow away from it that grows longer and softer with distance. The script only writes CSS
// variables, from one rAF loop that runs while the lamp moves.
(() => {
  const TAU_XY = 90;       // ms: the lamp trails the pointer a little, like something you carry
  const TAU_H = 110;       // ms: height changes ease in
  const H_MIN = 90, H_MAX = 640;
  const H_REF = 220;       // px: at this height the pool peaks at full strength
  const SHADOW_MAX = 150;  // px: longest cast shadow
  const INTRO = 1500;      // ms: the lamp glides in once on load

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const smooth = (t) => t * t * (3 - 2 * t);

  class SharedLight {
    constructor(root) {
      this.root = root;
      this.rm = matchMedia('(prefers-reduced-motion: reduce)');
      this.h = this.hT = clamp(Number(root.dataset.lampHeight) || 260, H_MIN, H_MAX);
      const [rx, ry] = (root.dataset.lampRest || '0.3 0.28').split(/\s+/).map(Number);
      this.rest = { fx: rx, fy: ry };
      this.cards = [];
      this.raf = 0;
      this.marker = document.createElement('span');
      this.marker.className = 'ls-lamp';
      this.marker.setAttribute('aria-hidden', 'true');
      this.label = document.createElement('span');
      this.label.className = 'ls-lamp-label';
      this.marker.appendChild(this.label);
      root.appendChild(this.marker);
      if (!root.hasAttribute('tabindex')) root.tabIndex = 0;
      this.layout();
      const p = this.restPoint();
      this.lamp = { ...p };
      this.target = { ...p };
      if (!this.rm.matches && !root.hasAttribute('data-lamp-still')) {
        this.intro = { t0: 0, from: { x: -0.08 * this.W, y: -0.12 * this.H }, to: p };
        this.lamp = { ...this.intro.from };
      }
      this.bind();
      this.write(true);
      this.kick();
      root.sharedLight = this;
    }

    restPoint() { return { x: this.rest.fx * this.W, y: this.rest.fy * this.H }; }

    // Card boxes in the root's coordinates; each card keeps its own top-left for the shared light pool.
    layout() {
      const R = this.root.getBoundingClientRect();
      this.W = R.width; this.H = R.height;
      this.cards = [...this.root.querySelectorAll('.ls-card')].map((el) => {
        const b = el.getBoundingClientRect();
        const x0 = b.left - R.left, y0 = b.top - R.top;
        el.style.setProperty('--ls-x0', `${x0.toFixed(1)}px`);
        el.style.setProperty('--ls-y0', `${y0.toFixed(1)}px`);
        const e = parseFloat(getComputedStyle(el).getPropertyValue('--ls-e')) || 18;
        return { el, cx: x0 + b.width / 2, cy: y0 + b.height / 2, e, key: '' };
      });
    }

    bind() {
      const r = this.root;
      const follow = (e) => {
        const b = r.getBoundingClientRect();
        this.intro = null;
        this.target = { x: e.clientX - b.left, y: e.clientY - b.top };
        this.kick();
      };
      r.addEventListener('pointermove', (e) => { if (e.pointerType !== 'touch' || e.pressure > 0) follow(e); });
      r.addEventListener('pointerdown', follow);   // a tap moves the lamp; a drag still scrolls the page
      r.addEventListener('pointerleave', (e) => {
        if (e.pointerType === 'touch') return;
        this.target = this.restPoint();
        this.kick();
      });
      r.addEventListener('wheel', (e) => {
        if (!e.altKey) return;
        e.preventDefault();
        this.setHeight(this.hT * Math.exp(e.deltaY * 0.0012));
      }, { passive: false });
      r.addEventListener('keydown', (e) => {
        if (e.target !== r) return;
        const s = e.shiftKey ? 96 : 24;
        const m = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, -s], ArrowDown: [0, s] }[e.key];
        if (m) {
          e.preventDefault();
          this.intro = null;
          this.target = { x: clamp(this.target.x + m[0], 0, this.W), y: clamp(this.target.y + m[1], 0, this.H) };
          this.kick();
        } else if (e.key === 'PageUp' || e.key === '+' || e.key === '=') { e.preventDefault(); this.setHeight(this.hT * 1.15); }
        else if (e.key === 'PageDown' || e.key === '-') { e.preventDefault(); this.setHeight(this.hT / 1.15); }
      });
      new ResizeObserver(() => {
        const wasRest = Math.abs(this.target.x - this.rest.fx * this.W) < 1 && Math.abs(this.target.y - this.rest.fy * this.H) < 1;
        this.layout();
        if (wasRest) this.target = this.restPoint();
        this.write(true);
        this.kick();
      }).observe(r);
    }

    setHeight(h) {
      this.hT = clamp(h, H_MIN, H_MAX);
      this.label.textContent = `Lamp height ${Math.round(this.hT)} px`;
      this.marker.classList.add('ls-talk');
      clearTimeout(this.tLabel);
      this.tLabel = setTimeout(() => this.marker.classList.remove('ls-talk'), 1200);
      this.root.dispatchEvent(new CustomEvent('lampheight', { detail: this.hT }));
      this.kick();
    }

    // Put the lamp somewhere at once (posters, tests): root coordinates in px, optional height.
    placeLamp(x, y, h) {
      this.intro = null;
      if (h) this.h = this.hT = clamp(h, H_MIN, H_MAX);
      this.lamp = { x, y };
      this.target = { x, y };
      this.write(true);
    }

    kick() {
      if (this.raf) return;
      this.tLast = performance.now();
      this.raf = requestAnimationFrame((t) => this.frame(t));
    }

    frame(t) {
      this.raf = 0;
      const dt = Math.min(50, Math.max(1, t - this.tLast));
      this.tLast = t;
      let moving = false;
      if (this.intro) {
        if (!this.intro.t0) this.intro.t0 = t;
        const p = Math.min(1, (t - this.intro.t0) / INTRO), s = smooth(p);
        const { from, to } = this.intro;
        this.target = { x: from.x + (to.x - from.x) * s, y: from.y + (to.y - from.y) * s };
        if (p < 1) moving = true; else this.intro = null;
      }
      const still = this.rm.matches;
      const kx = still ? 1 : 1 - Math.exp(-dt / TAU_XY), kh = still ? 1 : 1 - Math.exp(-dt / TAU_H);
      this.lamp.x += (this.target.x - this.lamp.x) * kx;
      this.lamp.y += (this.target.y - this.lamp.y) * kx;
      this.h += (this.hT - this.h) * kh;
      if (Math.abs(this.target.x - this.lamp.x) > 0.15 || Math.abs(this.target.y - this.lamp.y) > 0.15 || Math.abs(this.hT - this.h) > 0.5) moving = true;
      else { this.lamp = { ...this.target }; this.h = this.hT; }
      this.write(false);
      if (moving) this.kick();
    }

    write(force) {
      const { x: lx, y: ly } = this.lamp;
      const h = this.h;
      const s = this.root.style;
      // The pool: every surface uses the same centre and radius, so light runs across card edges unbroken.
      s.setProperty('--ls-lx', `${lx.toFixed(1)}px`);
      s.setProperty('--ls-ly', `${ly.toFixed(1)}px`);
      s.setProperty('--ls-h', `${h.toFixed(1)}px`);
      s.setProperty('--ls-i', clamp((H_REF / h) ** 0.9, 0.3, 1).toFixed(3));
      this.marker.style.translate = `${lx.toFixed(1)}px ${ly.toFixed(1)}px`;
      for (const c of this.cards) {
        const dx = c.cx - lx, dy = c.cy - ly;
        const d = Math.hypot(dx, dy);
        const hh = Math.max(24, h - c.e);           // lamp height above the card's top
        const len = Math.hypot(d, hh);
        const cos = hh / len, sin = d / len;
        const E = cos * cos * cos;                   // light on the card: 1 right under the lamp
        const rim = clamp(2.4 * sin * cos * cos, 0, 1);  // edges catch the most light at a slant
        const k = c.e / hh;                          // similar triangles: shadow offset per px of distance
        let sx = dx * k, sy = dy * k;
        const sl = Math.hypot(sx, sy);
        if (sl > SHADOW_MAX) { sx *= SHADOW_MAX / sl; sy *= SHADOW_MAX / sl; }
        const L = Math.min(sl, SHADOW_MAX);
        const blur = 2 + c.e * 0.35 + L * 0.45;     // longer shadows are softer
        const dark = 0.45 + 0.55 * E;                // a shadow is as dark as the light it blocks
        const ang = Math.atan2(-dx, dy) * 180 / Math.PI;  // CSS gradient angle pointing at the lamp
        const vals = [ang.toFixed(1), rim.toFixed(3), sx.toFixed(1), sy.toFixed(1), blur.toFixed(1), dark.toFixed(3)];
        const key = vals.join();
        if (!force && key === c.key) continue;
        c.key = key;
        const cs = c.el.style;
        cs.setProperty('--ls-a', `${vals[0]}deg`);
        cs.setProperty('--ls-rim', vals[1]);
        cs.setProperty('--ls-sx', `${vals[2]}px`);
        cs.setProperty('--ls-sy', `${vals[3]}px`);
        cs.setProperty('--ls-sb', `${vals[4]}px`);
        cs.setProperty('--ls-so', vals[5]);
      }
    }
  }

  window.SharedLight = SharedLight;
  document.querySelectorAll('[data-shared-light]').forEach((el) => new SharedLight(el));
})();
