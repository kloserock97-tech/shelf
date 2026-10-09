/* Native Scrolly Chart — the script is only a fallback.
   Where CSS scroll triggers work (timeline-trigger + animation-trigger), it does nothing but report the mode.
   Elsewhere it marks the story .nsc--io and keeps data-step on it in step with an IntersectionObserver whose
   root margin squeezes the scroller to the reading line; transitions in native-scrolly.css do the rest. */

export const supportsCssTriggers = () =>
  typeof CSS !== 'undefined' && CSS.supports('timeline-trigger', '--a view()') &&
  CSS.supports('animation-trigger', '--a play-forwards play-backwards');

/**
 * @param {HTMLElement} root .nsc, the scroll container of the story
 * @param {{ force?: 'io' }} [options] force: 'io' runs the fallback even where triggers work
 * @returns {{ mode: 'trigger' | 'io', disconnect(): void }}
 */
export function nativeScrolly(root, { force } = {}) {
  if (force !== 'io' && supportsCssTriggers()) return { mode: 'trigger', disconnect() {} };

  root.classList.add('nsc--io');
  const steps = [...root.querySelectorAll('.nsc__step')];
  let io = null, line = -1;

  // the step under the reading line, 0 when none is (the intro, or past the end)
  const pick = () => {
    const box = root.getBoundingClientRect();
    const y = box.top + box.height * line;
    let active = 0;
    steps.forEach((s, k) => {
      const r = s.getBoundingClientRect();
      const on = r.top <= y && r.bottom > y;
      s.classList.toggle('is-active', on);
      if (on) active = k + 1;
    });
    if (root.dataset.step !== String(active)) root.dataset.step = String(active);
  };

  const watch = () => {
    const next = parseFloat(getComputedStyle(steps[0] ?? root).getPropertyValue('--nsc-line')) || 0.5;
    if (next === line && io) return;
    line = next;
    io?.disconnect();
    const top = (line * 100).toFixed(2), bottom = ((1 - line) * 100).toFixed(2);
    io = new IntersectionObserver(pick, { root, rootMargin: `-${top}% 0px -${bottom}% 0px`, threshold: 0 });
    steps.forEach((s) => io.observe(s));
    pick();
  };
  // the reading line moves when the layout switches between narrow and wide
  const ro = new ResizeObserver(watch);
  ro.observe(root);
  watch();

  return { mode: 'io', disconnect() { io?.disconnect(); ro.disconnect(); } };
}
