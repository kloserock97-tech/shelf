/* Corner Shape Kit — the lab: a slider for k in corner-shape: superellipse(k) and a Play loop over k.
   The shapes themselves are CSS only; this script just feeds --k and names the value. */

export const hasCornerShape = () => typeof CSS !== 'undefined' && CSS.supports('corner-shape', 'squircle');

// the keywords are points on the same k scale
const NAMED = [[-1, 'scoop'], [0, 'bevel'], [1, 'round'], [2, 'squircle']];

export function describeK(k) {
  if (k <= -2.5) return 'close to notch';
  if (k >= 3.5) return 'close to square';
  for (const [v, name] of NAMED) if (Math.abs(k - v) < 0.05) return `= ${name}`;
  const lo = [...NAMED].reverse().find(([v]) => v < k), hi = NAMED.find(([v]) => v > k);
  if (!lo) return `between notch and ${hi[1]}`;
  if (!hi) return `between ${lo[1]} and square`;
  return `between ${lo[1]} and ${hi[1]}`;
}

/**
 * @param {HTMLElement} root .csk
 * @returns {{ setK(k: number): void, play(on: boolean): void }}
 */
export function cornerShapeLab(root) {
  const slider = root.querySelector('.csk__slider');
  const play = root.querySelector('.csk__play');
  const code = root.querySelector('.csk__code');
  const words = root.querySelector('.csk__words');
  const tile = root.querySelector('.csk-morph');
  const supported = hasCornerShape();
  let raf = 0;

  const show = (k) => {
    const v = (Math.round(k * 10) / 10).toFixed(1);
    code.textContent = `superellipse(${v})`;
    words.textContent = supported ? describeK(k) : 'corner-shape isn’t supported here: plain border-radius';
    slider.setAttribute('aria-valuetext', `superellipse ${v}, ${describeK(k)}`);
  };
  const setK = (k) => { root.style.setProperty('--k', String(k)); slider.value = String(k); show(k); };

  slider.addEventListener('input', () => {
    if (root.classList.contains('is-playing')) toggle(false);
    setK(Number(slider.value));
  });

  // while the loop runs, read k back from the animation once a frame; the frame loop stops with it
  const follow = () => {
    const k = parseFloat(getComputedStyle(tile).getPropertyValue('--k'));
    if (!Number.isNaN(k)) { slider.value = String(k); show(k); }
    raf = requestAnimationFrame(follow);
  };
  function toggle(on) {
    root.classList.toggle('is-playing', on);
    play.setAttribute('aria-pressed', String(on));
    play.textContent = on ? 'Pause' : 'Play';
    cancelAnimationFrame(raf);
    if (on) raf = requestAnimationFrame(follow);
    else {
      // keep the shape where the loop left it
      const k = parseFloat(slider.value);
      setK(Number.isNaN(k) ? 2 : k);
    }
  }
  play?.addEventListener('click', () => toggle(!root.classList.contains('is-playing')));
  document.addEventListener('visibilitychange', () => { if (document.hidden && root.classList.contains('is-playing')) toggle(false); });

  if (!supported) { slider.disabled = true; if (play) play.disabled = true; root.classList.add('csk--fallback'); }
  setK(Number(slider.value));
  return { setK, play: toggle };
}
