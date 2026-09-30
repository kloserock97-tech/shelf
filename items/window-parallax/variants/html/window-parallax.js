// Window Parallax: a room behind the screen seen through a fixed frame. CSS does the projection: the view has
// `perspective` = viewing distance and `perspective-origin` = the eye, so everything at z = 0 (the glass) stays put
// while deeper planes shift as if you moved your head. The script only moves the eye: from the pointer on desktop,
// from a drag on touch, or from the phone's tilt after an explicit button press (iOS asks for permission).
(() => {
  const TAU = 110;          // ms, the eye eases after the pointer
  const REACH_X = 0.45;     // how far the eye travels, as a share of the window width / height
  const REACH_Y = 0.35;
  const TILT_GAIN = 1.4;    // tilt feels small in the hand, so it's amplified a little
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  class WindowParallax {
    constructor(el) {
      this.el = el;
      this.view = el.querySelector('.wp-view');
      this.rm = matchMedia('(prefers-reduced-motion: reduce)');
      const [rx, ry] = (el.dataset.eyeRest || '-0.1 -0.06').split(/\s+/).map(Number);
      this.restAt = { fx: rx, fy: ry };
      this.size();
      this.eye = this.rest();
      this.target = { ...this.eye };
      this.motion = false;
      this.raf = 0;
      this.bind();
      this.write();
      el.windowParallax = this;
    }

    size() {
      const r = this.el.getBoundingClientRect();
      this.W = r.width; this.H = r.height;
      this.P = parseFloat(getComputedStyle(this.view).perspective) || this.W * 1.15;
    }

    rest() { return { x: this.restAt.fx * this.W, y: this.restAt.fy * this.H }; }

    bind() {
      const el = this.el;
      // Desktop: the whole page is head room; the pointer's offset from the window centre is the eye's offset.
      addEventListener('pointermove', (e) => {
        if (e.pointerType === 'touch' || this.motion || this.rm.matches) return;
        const r = el.getBoundingClientRect();
        const nx = clamp((e.clientX - (r.left + r.width / 2)) / (innerWidth / 2), -1, 1);
        const ny = clamp((e.clientY - (r.top + r.height / 2)) / (innerHeight / 2), -1, 1);
        this.aim(nx, ny);
      });
      document.documentElement.addEventListener('pointerleave', () => { if (!this.motion) { this.target = this.rest(); this.kick(); } });
      // Touch without motion: drag across the window to move the eye.
      el.addEventListener('pointerdown', (e) => {
        if (e.pointerType !== 'touch' || this.motion || this.rm.matches) return;
        el.setPointerCapture(e.pointerId);
        this.dragId = e.pointerId;
        this.fromTouch(e);
      });
      el.addEventListener('pointermove', (e) => { if (e.pointerId === this.dragId) this.fromTouch(e); });
      const end = (e) => { if (e.pointerId === this.dragId) this.dragId = null; };
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
      el.addEventListener('keydown', (e) => {
        const s = e.shiftKey ? 0.25 : 0.08;
        const m = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, -s], ArrowDown: [0, s] }[e.key];
        if (!m) return;
        e.preventDefault();
        this.target = {
          x: clamp(this.target.x + m[0] * this.W, -REACH_X * this.W, REACH_X * this.W),
          y: clamp(this.target.y + m[1] * this.H, -REACH_Y * this.H, REACH_Y * this.H)
        };
        this.kick(true);
      });
      new ResizeObserver(() => {
        const f = { fx: this.target.x / this.W, fy: this.target.y / this.H };
        this.size();
        this.target = { x: f.fx * this.W, y: f.fy * this.H };
        this.eye = { ...this.target };
        this.write();
      }).observe(el);
      this.onTilt = (e) => this.tilt(e);
    }

    aim(nx, ny) {
      this.target = { x: nx * REACH_X * this.W, y: ny * REACH_Y * this.H };
      this.kick();
    }

    fromTouch(e) {
      const r = this.el.getBoundingClientRect();
      this.aim(clamp((e.clientX - r.left) / r.width * 2 - 1, -1, 1), clamp((e.clientY - r.top) / r.height * 2 - 1, -1, 1));
    }

    // Phone tilt: the eye stays where it is in the world while the screen turns, so in screen terms the eye moves
    // the other way: +gamma (right edge away) puts the eye to the left, +beta (top edge closer) puts it higher.
    tilt(e) {
      if (e.beta == null || e.gamma == null) return;
      if (!this.base) this.base = { b: e.beta, g: e.gamma };
      // the neutral pose follows slowly, so the view re-centres on however the phone is being held
      this.base.b += (e.beta - this.base.b) * 0.01;
      this.base.g += (e.gamma - this.base.g) * 0.01;
      const rad = Math.PI / 180;
      const dg = clamp(e.gamma - this.base.g, -35, 35) * rad, db = clamp(e.beta - this.base.b, -35, 35) * rad;
      const dx = -this.P * Math.sin(dg) * TILT_GAIN, up = this.P * Math.sin(db) * TILT_GAIN;
      const a = ((screen.orientation && screen.orientation.angle) || window.orientation || 0) * rad;
      const ex = dx * Math.cos(a) - up * Math.sin(a), eyUp = dx * Math.sin(a) + up * Math.cos(a);
      this.target = {
        x: clamp(ex, -REACH_X * this.W, REACH_X * this.W),
        y: clamp(-eyUp, -REACH_Y * this.H, REACH_Y * this.H)
      };
      this.kick();
    }

    // Must be called from a click or tap: iOS only shows its permission prompt for a user gesture.
    async enableMotion() {
      const DOE = window.DeviceOrientationEvent;
      if (!DOE) return 'unsupported';
      if (typeof DOE.requestPermission === 'function') {
        let state = 'denied';
        try { state = await DOE.requestPermission(); } catch { state = 'denied'; }
        if (state !== 'granted') return state;
      }
      this.base = null;
      this.motion = true;
      addEventListener('deviceorientation', this.onTilt);
      return 'granted';
    }

    disableMotion() {
      this.motion = false;
      removeEventListener('deviceorientation', this.onTilt);
      this.target = this.rest();
      this.kick();
    }

    // Look from a given eye offset at once (posters, tests): fractions of the window size.
    lookFrom(fx, fy) {
      this.target = { x: fx * this.W, y: fy * this.H };
      this.eye = { ...this.target };
      this.write();
    }

    kick(now) {
      if (now || this.rm.matches) { this.eye = { ...this.target }; this.write(); return; }
      if (this.raf) return;
      this.tLast = performance.now();
      this.raf = requestAnimationFrame((t) => this.frame(t));
    }

    frame(t) {
      this.raf = 0;
      const dt = Math.min(50, Math.max(1, t - this.tLast));
      this.tLast = t;
      const k = 1 - Math.exp(-dt / TAU);
      this.eye.x += (this.target.x - this.eye.x) * k;
      this.eye.y += (this.target.y - this.eye.y) * k;
      const moving = Math.abs(this.target.x - this.eye.x) > 0.35 || Math.abs(this.target.y - this.eye.y) > 0.35;
      if (!moving) this.eye = { ...this.target };
      this.write();
      if (moving) this.kick();
    }

    write() {
      this.view.style.setProperty('--wp-ex', `${this.eye.x.toFixed(1)}px`);
      this.view.style.setProperty('--wp-ey', `${this.eye.y.toFixed(1)}px`);
    }
  }

  window.WindowParallax = WindowParallax;
  document.querySelectorAll('[data-window-parallax]').forEach((el) => new WindowParallax(el));
})();
