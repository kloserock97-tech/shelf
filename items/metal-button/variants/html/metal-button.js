// Metal Button behaviour: the glow follows the cursor, a ring closes in on press,
// and the rim light speeds up on hover without jumping to another angle.
(function () {
  const RIM_SLOW = 9;   // s per turn at rest
  const RIM_FAST = 3.2; // s per turn under the cursor

  function initMetal(button) {
    if (button.dataset.metalReady) return;
    button.dataset.metalReady = 'true';

    button.addEventListener('pointermove', (e) => {
      const r = button.getBoundingClientRect();
      button.style.setProperty('--mx', `${(((e.clientX - r.left) / r.width) * 100).toFixed(1)}%`);
      button.style.setProperty('--my', `${(((e.clientY - r.top) / r.height) * 100).toFixed(1)}%`);
    });
    button.addEventListener('pointerleave', () => {
      button.style.removeProperty('--mx');
      button.style.removeProperty('--my');
    });
    button.addEventListener('click', () => {
      button.classList.remove('is-rippling');
      void button.offsetWidth; // restart the ring animation
      button.classList.add('is-rippling');
    });

    // Changing animation-duration of a running animation keeps the elapsed time, so the angle jumps.
    // The playback rate keeps the current angle and only changes the speed.
    const rim = button.querySelector('.metal-rim');
    if (!rim || typeof rim.getAnimations !== 'function') return;
    const spin = () => rim.getAnimations({ subtree: true }).find((a) => a.animationName === 'metal-spin');
    if (!spin()) return;
    button.classList.add('has-rim-rate');
    const rate = (r) => { const a = spin(); if (a) a.updatePlaybackRate(r); };
    button.addEventListener('pointerenter', () => rate(RIM_SLOW / RIM_FAST));
    button.addEventListener('pointerleave', () => rate(1));
  }

  document.querySelectorAll('.metal').forEach(initMetal);
  window.initMetal = initMetal;
})();
