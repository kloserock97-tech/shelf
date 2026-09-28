// Blur words reveal: splits each .bwr-title into words once and writes scroll progress to --k.
// Sections are measured on load and resize only; a scroll frame just does arithmetic and one style write.
(() => {
  const sections = [...document.querySelectorAll('.bwr')];
  if (!sections.length) return;

  // Words get their index in --i; screen readers get the title whole from aria-label.
  for (const title of document.querySelectorAll('.bwr-title')) {
    const words = (title.textContent || '').trim().split(/\s+/);
    title.setAttribute('aria-label', words.join(' '));
    title.innerHTML = words.map((w, i) => `<span class="bwr-word" aria-hidden="true" style="--i:${i}">${w}</span>`).join(' ');
  }

  // Window height from a 100vh probe: vh ignores the phone address bar, innerHeight does not,
  // and a jumping innerHeight would turn the same scroll position into a different progress.
  const probe = document.createElement('i');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:100vh;visibility:hidden;pointer-events:none';
  document.body.appendChild(probe);

  let boxes = [];
  const measure = () => {
    const viewH = probe.offsetHeight || innerHeight;
    boxes = sections.map((el) => {
      const r = el.getBoundingClientRect();
      // data-from: where the reveal starts, 0…1 (a first screen can open already revealed)
      return { el, top: r.top + scrollY, run: Math.max(1, r.height - viewH), from: Number(el.dataset.from) || 0, last: '' };
    });
    frame();
  };

  let raf = 0;
  const frame = () => {
    raf = 0;
    for (const b of boxes) {
      const p = Math.min(1, Math.max(0, (scrollY - b.top) / b.run));
      const k = (b.from + (1 - b.from) * p).toFixed(3);
      if (k !== b.last) { b.last = k; b.el.style.setProperty('--k', k); }
    }
  };
  addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(frame); }, { passive: true });
  addEventListener('resize', measure);
  document.fonts?.ready.then(measure);
  measure();
})();
