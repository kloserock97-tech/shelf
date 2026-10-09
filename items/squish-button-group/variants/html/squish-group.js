// Squish Button Group.
// Markup: fieldset.sqg > .sqg__track > label.sqg__btn > input[type=radio] + .sqg__in.
// The radios hold the state and give the keyboard (arrows move the choice). This script adds the press:
// pointer down or a held Space marks the button with [data-press], CSS widens it and makes its neighbours give way.
// It also replaces the fallback curve with a spring in CSS linear().
(() => {
  // Damped oscillator x(t) = 1 − e^(−ζωt)·(cos ω_d t + (ζω/ω_d)·sin ω_d t), set by the period of one swing
  // and the share of bounce (ζ = 1 − bounce). Sampled densely, then thinned: a point stays only where the straight
  // line between its neighbours would miss it by more than 0.0015.
  function springEase(period, bounce) {
    const w = (2 * Math.PI) / period;
    const z = 1 - Math.min(0.9, Math.max(0, bounce));
    const k = z * w;
    const wd = w * Math.sqrt(Math.max(1e-4, 1 - z * z));
    const x = (t) => 1 - Math.exp(-k * t) * (Math.cos(wd * t) + (k / wd) * Math.sin(wd * t));
    const T = Math.log(400) / k; // the swing has died down to 0.25 %
    const N = 96;
    const pts = [];
    for (let i = 0; i <= N; i++) pts.push([i / N, i === N ? 1 : x((T * i) / N)]);
    const kept = [pts[0]];
    for (let i = 1; i < N; i++) {
      const a = kept[kept.length - 1];
      const b = pts[i + 1];
      const p = pts[i];
      const y = a[1] + ((b[1] - a[1]) * (p[0] - a[0])) / (b[0] - a[0]);
      if (Math.abs(y - p[1]) > 0.0015) kept.push(p);
    }
    kept.push(pts[N]);
    const stops = kept.map(([t, v], i) => (i === 0 ? '0' : i === kept.length - 1 ? '1' : `${v.toFixed(4)} ${(t * 100).toFixed(2)}%`));
    return { easing: `linear(${stops.join(', ')})`, ms: Math.round(T * 1000) };
  }

  const SETTLE = springEase(0.52, 0.34); // choice and release: one visible overshoot
  const PRESS = springEase(0.3, 0.12); // press: quick, almost no bounce
  const KEY_FLASH = 150; // a choice made with the arrows gets a short press

  function init(root) {
    if (root.dataset.sqgReady) return;
    root.dataset.sqgReady = '1';
    root.style.setProperty('--sqg-spring', SETTLE.easing);
    root.style.setProperty('--sqg-dur', `${SETTLE.ms}ms`);
    root.style.setProperty('--sqg-press-spring', PRESS.easing);
    root.style.setProperty('--sqg-press-dur', `${PRESS.ms}ms`);

    let pressed = null;
    let flash = 0;
    let viaPointer = false;

    const press = (btn) => {
      if (pressed === btn) return;
      release();
      if (!btn || btn.querySelector('input:disabled')) return;
      pressed = btn;
      btn.setAttribute('data-press', '');
    };
    function release() {
      if (!pressed) return;
      pressed.removeAttribute('data-press');
      pressed = null;
    }

    root.addEventListener('pointerdown', (e) => {
      if (e.button > 0) return;
      viaPointer = true;
      press(e.target.closest('.sqg__btn'));
    });
    // dragging off a button lets it go; coming back does not re-press it
    root.addEventListener('pointerout', (e) => {
      if (pressed && !pressed.contains(e.relatedTarget)) release();
    });
    window.addEventListener('pointerup', () => { release(); setTimeout(() => (viaPointer = false), 0); });
    window.addEventListener('pointercancel', release);

    root.addEventListener('keydown', (e) => {
      if (e.key === ' ' && !e.repeat) press(e.target.closest('.sqg__btn'));
    });
    root.addEventListener('keyup', (e) => { if (e.key === ' ') release(); });

    root.addEventListener('change', (e) => {
      if (viaPointer || pressed) return;
      const btn = e.target.closest('.sqg__btn');
      clearTimeout(flash);
      press(btn);
      flash = setTimeout(release, KEY_FLASH);
    });
  }

  const run = () => document.querySelectorAll('.sqg').forEach(init);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
  window.SquishGroup = { init };
})();
