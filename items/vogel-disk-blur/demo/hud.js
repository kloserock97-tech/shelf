/* Demo control panel wiring: collapse, segmented groups, sliders with a live readout, buttons.
   HUD.on(name, fn) calls fn(value) on change; HUD.value(name) reads; HUD.set(name, value) writes without events.
   ?ui=0 hides the panel. On narrow screens it starts collapsed. */
(function () {
  const hud = document.querySelector('.hud');
  const handlers = {};
  const emit = (name, v) => (handlers[name] || []).forEach((fn) => fn(v));
  const digits = (input) => (String(input.step).split('.')[1] || '').length;
  const show = (input) => {
    const out = input.parentElement.querySelector('output');
    if (out) out.textContent = Number(input.value).toFixed(digits(input));
  };
  const api = {
    on(name, fn) { (handlers[name] = handlers[name] || []).push(fn); return api; },
    value(name) {
      if (!hud) return undefined;
      const on = hud.querySelector(`.seg[data-name="${name}"] [aria-pressed="true"]`);
      if (on) return on.value;
      const input = hud.querySelector(`input[name="${name}"]`);
      return input ? Number(input.value) : undefined;
    },
    set(name, v) {
      if (!hud) return;
      const seg = hud.querySelector(`.seg[data-name="${name}"]`);
      if (seg) seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.value === String(v))));
      const input = hud.querySelector(`input[name="${name}"]`);
      if (input) { input.value = v; show(input); }
    }
  };
  window.HUD = api;
  if (!hud) return;
  if (new URLSearchParams(location.search).get('ui') === '0') hud.hidden = true;
  const head = hud.querySelector('.hud__head');
  if (head) {
    if (innerWidth < 560) head.setAttribute('aria-expanded', 'false');
    head.addEventListener('click', () => head.setAttribute('aria-expanded', String(head.getAttribute('aria-expanded') !== 'true')));
  }
  hud.querySelectorAll('.seg').forEach((seg) => seg.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    emit(seg.dataset.name, b.value);
  }));
  hud.querySelectorAll('input[type="range"]').forEach((input) => {
    show(input);
    input.addEventListener('input', () => { show(input); emit(input.name, Number(input.value)); });
  });
  hud.querySelectorAll('.hud__btn[data-name]').forEach((b) => b.addEventListener('click', () => emit(b.dataset.name, b)));
  // Drags on the panel must not reach the canvas underneath.
  for (const t of ['pointerdown', 'wheel', 'touchstart']) hud.addEventListener(t, (e) => e.stopPropagation(), { passive: true });
})();
