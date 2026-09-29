// The profile's avatar is a face with googly eyes, for fun. The pupils look at the pointer anywhere on the page and hang
// on a spring, so they overshoot and wobble; scrolling jiggles them. The face blinks now and then (sometimes twice),
// squints and grins under the pointer, squishes when pressed and rolls its eyes if poked five times in a row. After a
// minute with nothing happening it falls asleep (z z z) and wakes up startled when you come back.
// Reduced motion: a still face, no blinking, no sleep.
const REACH = 2.1; // how far a pupil rolls from the middle of its eye, in the face's 28-unit box
const STIFF = 240; // spring pull towards where the pupil wants to be
const DAMP = 13; // how fast the wobble dies down
const SLEEP_AFTER = 60_000;
const DIZZY_POKES = 5;

type Vec = { x: number; y: number };
interface Eye { pupil: SVGCircleElement; cx: number; cy: number; p: Vec; v: Vec; t: Vec }

export function initFace() {
  const face = document.querySelector<HTMLElement>('[data-face]');
  if (!face) return;
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  const eyes: Eye[] = Array.from(face.querySelectorAll<SVGGElement>('[data-eye]')).map((g) => {
    const white = g.querySelector('circle')!;
    return { pupil: g.querySelector<SVGCircleElement>('.sh-face__pupil')!, cx: Number(white.getAttribute('cx')), cy: Number(white.getAttribute('cy')), p: { x: 0, y: 0 }, v: { x: 0, y: 0 }, t: { x: 0, y: 0 } };
  });
  let pointer: Vec | null = null;
  let raf = 0;
  let last = 0;
  let dizzyUntil = 0;

  // where each pupil wants to be: towards the pointer, further the further away it is (near the face they cross)
  function aim(now: number) {
    if (now < dizzyUntil) {
      const a = now / 90;
      eyes.forEach((e, i) => (e.t = { x: Math.cos(a + i * Math.PI) * REACH, y: Math.sin(a + i * Math.PI) * REACH }));
      return;
    }
    if (!pointer) { eyes.forEach((e) => (e.t = { x: 0, y: 0 })); return; }
    const r = face!.getBoundingClientRect();
    const s = r.width / 28;
    for (const e of eyes) {
      const dx = pointer.x - (r.left + e.cx * s);
      const dy = pointer.y - (r.top + e.cy * s);
      const d = Math.hypot(dx, dy) || 1;
      const m = Math.min(1, d / 90) * REACH;
      e.t = { x: (dx / d) * m, y: (dy / d) * m };
    }
  }

  function tick(now: number) {
    const dt = Math.min(0.033, (now - last) / 1000 || 0.016);
    last = now;
    aim(now);
    let busy = now < dizzyUntil;
    for (const e of eyes) {
      for (const k of ['x', 'y'] as const) {
        e.v[k] += ((e.t[k] - e.p[k]) * STIFF - e.v[k] * DAMP) * dt;
        e.p[k] += e.v[k] * dt;
        if (Math.abs(e.t[k] - e.p[k]) > 0.01 || Math.abs(e.v[k]) > 0.02) busy = true;
      }
      // the pupil stays inside the white and bounces off its edge
      const len = Math.hypot(e.p.x, e.p.y);
      if (len > REACH) {
        const n = { x: e.p.x / len, y: e.p.y / len };
        e.p = { x: n.x * REACH, y: n.y * REACH };
        const out = e.v.x * n.x + e.v.y * n.y;
        if (out > 0) e.v = { x: e.v.x - 1.5 * out * n.x, y: e.v.y - 1.5 * out * n.y };
      }
      e.pupil.style.transform = `translate(${e.p.x.toFixed(2)}px, ${e.p.y.toFixed(2)}px)`;
    }
    raf = busy ? requestAnimationFrame(tick) : 0;
  }
  const kick = () => {
    if (raf || still.matches) return;
    last = performance.now();
    raf = requestAnimationFrame(tick);
  };
  const shove = (x: number, y: number) => { eyes.forEach((e) => { e.v.x += x; e.v.y += y; }); kick(); };
  const flash = (cls: string, ms: number) => { face.classList.add(cls); setTimeout(() => face.classList.remove(cls), ms); };

  /* ---------- sleep ---------- */
  let idle = 0;
  const asleep = () => face.classList.contains('is-asleep');
  function wake() {
    clearTimeout(idle);
    if (still.matches) return;
    if (asleep()) {
      face.classList.remove('is-asleep');
      flash('is-startled', 450);
      shove((Math.random() - 0.5) * 60, -40);
    }
    idle = window.setTimeout(() => face.classList.add('is-asleep'), SLEEP_AFTER);
  }

  /* ---------- blinking ---------- */
  function blinkLater() {
    setTimeout(() => {
      if (!still.matches && !asleep() && !document.hidden) {
        flash('is-blink', 120);
        if (Math.random() < 0.15) setTimeout(() => flash('is-blink', 110), 230);
      }
      blinkLater();
    }, 2500 + Math.random() * 4500);
  }

  /* ---------- wiring ---------- */
  addEventListener('pointermove', (e) => { pointer = { x: e.clientX, y: e.clientY }; kick(); wake(); }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => { pointer = null; kick(); });
  let lastY = scrollY;
  addEventListener('scroll', () => {
    const dy = scrollY - lastY;
    lastY = scrollY;
    shove(0, Math.max(-50, Math.min(50, -dy * 2)));
    wake();
  }, { passive: true });
  addEventListener('keydown', wake);
  let pokes: number[] = [];
  face.closest('button')?.addEventListener('pointerdown', () => {
    if (still.matches) return;
    flash('is-boop', 140);
    const now = performance.now();
    pokes = [...pokes.filter((t) => now - t < 2000), now];
    if (pokes.length >= DIZZY_POKES) { pokes = []; dizzyUntil = now + 1400; }
    shove((Math.random() - 0.5) * 80, (Math.random() - 0.5) * 80);
  });
  still.addEventListener('change', () => { if (still.matches) { face.classList.remove('is-asleep', 'is-blink'); eyes.forEach((e) => e.pupil.style.removeProperty('transform')); } });

  blinkLater();
  wake();
}
