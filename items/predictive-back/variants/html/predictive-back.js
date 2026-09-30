/* Predictive Back — an edge swipe scrubs the back transition by finger.
   The current page shrinks into a card and follows the finger, the previous page comes in underneath with parallax.
   Letting go past 35% of the width (or flicking) finishes it on a spring that keeps the finger's speed; otherwise it
   springs back. A two-finger horizontal swipe on a trackpad drives the same progress.

   const nav = predictiveBack(stage, { onChange(top) {} });
   nav.push(pageElement)   // animated, the page must be a child of the stage with [data-pb-page]
   nav.back()              // animated, the same motion without a finger
   nav.preview(0.4, 'left', 380) // freeze at a progress (posters, tests); nav.preview(0) clears it

   The script only writes --pb-p, --pb-dir, --pb-lift and --pb-y on the stage; the look is in predictive-back.css.
   Nothing runs while idle: a requestAnimationFrame loop lives only while a spring is moving. */

const STEP = 1 / 240; // spring integration step, s

export function predictiveBack(stage, options = {}) {
  const o = {
    edge: 28,          // px from each side where a touch can start the gesture (mouse and pen get 12 more)
    threshold: 0.35,   // letting go past this fraction of the width goes back
    flick: 1.2,        // …and so does a flick faster than this many widths per second
    stiffness: 260,    // spring, per s²
    damping: 0.9,      // damping ratio: under 1 lets the commit overshoot a hair, which is off screen anyway
    onChange: () => {},
    ...options
  };
  const stack = [options.root ?? stage.querySelector(':scope > [data-pb-page]')];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  let p = 0, v = 0, dir = 1, lift = 0, y = 0;
  let mode = 'idle';     // idle | drag | cancel | commit | push
  let raf = 0, armed = false, width = 1;

  const top = () => stack[stack.length - 1];
  const under = () => stack[stack.length - 2] ?? null;

  function layout(moving) {
    for (const el of stage.querySelectorAll(':scope > [data-pb-page]')) {
      const isTop = el === top();
      const isUnder = moving && el === under();
      el.classList.toggle('is-top', isTop);
      el.classList.toggle('is-under', isUnder);
      el.inert = !isTop;
      if (isTop) el.removeAttribute('aria-hidden'); else el.setAttribute('aria-hidden', 'true');
    }
    stage.classList.toggle('is-moving', moving);
    if (!moving) {
      stage.classList.remove('is-pushing', 'is-auto', 'is-armed');
      armed = false;
    }
  }

  function render() {
    const s = stage.style;
    s.setProperty('--pb-p', Math.max(0, p).toFixed(4));
    s.setProperty('--pb-dir', dir);
    s.setProperty('--pb-lift', lift.toFixed(1));
    s.setProperty('--pb-y', y.toFixed(0));
    stage.dataset.pbEdge = dir > 0 ? 'left' : 'right';
    const nowArmed = mode !== 'push' && p >= o.threshold && mode !== 'cancel';
    if (nowArmed !== armed) {
      armed = nowArmed;
      stage.classList.toggle('is-armed', armed);
      // a tick under the finger; only after the page has had a real tap, or Chrome logs a blocked call
      if (armed && mode === 'drag' && navigator.userActivation?.hasBeenActive) try { navigator.vibrate?.(6); } catch { /* not allowed here */ }
    }
  }

  /* A damped spring on the progress. The finger's speed carries over, so a flick keeps going. */
  function spring(target, velocity, ratio, done) {
    cancelAnimationFrame(raf);
    v = velocity;
    const k = o.stiffness, c = 2 * ratio * Math.sqrt(k);
    let last = performance.now();
    const frame = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      for (let t = 0; t < dt; t += STEP) {
        const h = Math.min(STEP, dt - t);
        v += (-k * (p - target) - c * v) * h;
        p += v * h;
      }
      lift *= 0.86;
      if (Math.abs(p - target) < 5e-4 && Math.abs(v) < 5e-3) {
        p = target; raf = 0; render(); done(); return;
      }
      render();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
  }

  function settle(velocity) {
    const commit = velocity > o.flick || (p > o.threshold && velocity > -0.4);
    mode = commit ? 'commit' : 'cancel';
    if (!commit) { stage.classList.remove('is-armed'); armed = false; }
    spring(commit ? 1 : 0, velocity, commit ? o.damping : 1, commit ? finishBack : finishCancel);
  }

  function finishBack() {
    const leaving = stack.pop();
    p = 0; lift = 0; mode = 'idle';
    render();
    layout(false);
    leaving.scrollTop = 0;
    focusTitle(top());
    o.onChange(top(), leaving);
  }
  function finishCancel() {
    p = 0; lift = 0; mode = 'idle';
    render();
    layout(false);
  }

  function focusTitle(page) {
    const t = page.querySelector('[data-pb-title]') ?? page.querySelector('h1, h2');
    if (!t) return;
    if (!t.hasAttribute('tabindex')) t.setAttribute('tabindex', '-1');
    t.focus({ preventScroll: true });
  }

  /* ---------- finger, mouse, pen ---------- */
  let g = null;
  const swallowClick = (e) => { e.stopPropagation(); e.preventDefault(); };

  stage.addEventListener('pointerdown', (e) => {
    if (stack.length < 2 || e.button !== 0 || mode === 'commit' || mode === 'push') return;
    const r = stage.getBoundingClientRect();
    const x = e.clientX - r.left;
    const zone = o.edge + (e.pointerType === 'touch' ? 0 : 12);
    const side = x <= zone ? 1 : x >= r.width - zone ? -1 : 0;
    if (!side) return;
    // a cancel still springing back can be caught again from the same edge
    const p0 = mode === 'cancel' && side === dir ? p : 0;
    g = { id: e.pointerId, x0: e.clientX, y0: e.clientY, side, p0, top: r.top, started: false, samples: [] };
    width = r.width;
    if (e.pointerType !== 'touch') e.preventDefault(); // no text selection from the edge
  });

  stage.addEventListener('pointermove', (e) => {
    if (!g || e.pointerId !== g.id) return;
    const dx = (e.clientX - g.x0) * g.side;
    const dy = e.clientY - g.y0;
    if (!g.started) {
      if (dx > 8 && dx > Math.abs(dy)) {
        g.started = true;
        stage.setPointerCapture(e.pointerId);
        cancelAnimationFrame(raf);
        dir = g.side;
        mode = 'drag';
        layout(true);
      } else if (Math.abs(dy) > 12 || dx < -8) {
        g = null;
        return;
      } else return;
    }
    p = Math.min(1, Math.max(0, g.p0 + (dx - 8) / width));
    lift = Math.max(-28, Math.min(28, dy * 0.12));
    y = e.clientY - g.top;
    const now = performance.now();
    g.samples.push([now, p]);
    while (g.samples.length > 2 && now - g.samples[0][0] > 90) g.samples.shift();
    render();
  });

  const release = (e) => {
    if (!g || e.pointerId !== g.id) return;
    const started = g.started, s = g.samples;
    g = null;
    if (!started) return;
    stage.addEventListener('click', swallowClick, { capture: true, once: true });
    setTimeout(() => stage.removeEventListener('click', swallowClick, { capture: true }), 60);
    let vel = 0;
    if (s.length > 1) {
      const [t0, p0] = s[0], [t1, p1] = s[s.length - 1];
      if (t1 - t0 > 8) vel = ((p1 - p0) / (t1 - t0)) * 1000;
      if (performance.now() - t1 > 80) vel = 0; // held still before letting go
    }
    settle(e.type === 'pointercancel' ? -1 : vel);
  };
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);

  /* ---------- two-finger swipe on a trackpad ---------- */
  let w = null, quietTimer = 0, muted = false;
  stage.addEventListener('wheel', (e) => {
    const horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY) * 1.2;
    if (muted) {
      // the trackpad keeps sending momentum after a release: wait for silence
      if (horizontal) e.preventDefault();
      clearTimeout(quietTimer);
      quietTimer = setTimeout(() => { muted = false; }, 160);
      return;
    }
    if (!w && (!horizontal || stack.length < 2 || mode === 'commit' || mode === 'push')) return;
    e.preventDefault();
    const px = e.deltaMode === 1 ? e.deltaX * 16 : e.deltaX;
    if (!w) {
      if (Math.abs(px) < 1) return;
      const side = px < 0 ? 1 : -1; // fingers to the right scroll left: back from the left edge
      const r = stage.getBoundingClientRect();
      width = r.width;
      cancelAnimationFrame(raf);
      w = { side, acc: mode === 'cancel' && side === dir ? p * width : 0, samples: [], timer: 0 };
      dir = side;
      y = r.height / 2;
      lift = 0;
      mode = 'drag';
      layout(true);
    }
    w.acc = Math.max(0, w.acc - px * w.side);
    p = Math.min(1, w.acc / width);
    const now = performance.now();
    w.samples.push([now, p]);
    while (w.samples.length > 2 && now - w.samples[0][0] > 90) w.samples.shift();
    render();
    clearTimeout(w.timer);
    w.timer = setTimeout(() => {
      const s = w.samples;
      const [t0, p0] = s[0], [t1, p1] = s[s.length - 1];
      const vel = t1 - t0 > 8 ? ((p1 - p0) / (t1 - t0)) * 1000 * 0.6 : 0;
      w = null;
      muted = true;
      quietTimer = setTimeout(() => { muted = false; }, 160);
      settle(vel);
    }, 120);
  }, { passive: false });

  /* ---------- keyboard ---------- */
  stage.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && stack.length > 1 && mode === 'idle') { e.preventDefault(); back(); }
  });

  /* ---------- programmatic ---------- */
  function back() {
    if (stack.length < 2 || mode === 'commit' || mode === 'push') return;
    cancelAnimationFrame(raf);
    dir = 1; lift = 0; y = stage.clientHeight / 2;
    mode = 'commit';
    stage.classList.add('is-auto'); // a button press: the same motion, no finger arrow
    layout(true);
    spring(1, reduced.matches ? 0 : 0.6, 1, finishBack);
  }

  function push(page) {
    if (mode !== 'idle' || page === top()) return;
    stack.push(page);
    page.scrollTop = 0;
    dir = 1; lift = 0; p = 1;
    mode = 'push';
    stage.classList.add('is-pushing');
    layout(true);
    render();
    spring(0, 0, 1, () => {
      mode = 'idle';
      render();
      layout(false);
      focusTitle(page);
      o.onChange(page, null);
    });
  }

  function preview(progress, edge = 'left', atY = stage.clientHeight / 2) {
    cancelAnimationFrame(raf);
    if (!progress || stack.length < 2) { p = 0; mode = 'idle'; render(); layout(false); return; }
    dir = edge === 'right' ? -1 : 1;
    stage.classList.remove('is-pushing', 'is-auto');
    p = progress; y = atY; lift = 6;
    mode = 'drag';
    layout(true);
    render();
    mode = 'idle';
  }

  layout(false);
  render();
  return {
    push, back, preview,
    get depth() { return stack.length; },
    get top() { return top(); }
  };
}
