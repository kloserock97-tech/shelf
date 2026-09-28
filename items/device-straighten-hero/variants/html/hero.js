// Device-straighten hero: writes --hs (0…1, how much of the hero has scrolled past the top) and
// --px/--py (−1…1, mouse over the stage); pauses the object's float when nobody can see it.
// Ported from Portfolio 3D TS2 v64: src/ui/caseHero.ts (mountHero) and src/ui/caseStoryView.ts (--hs).
(() => {
  const hero = document.querySelector('.hero');
  const stage = hero && hero.querySelector('.hero-stage');
  if (!stage) return;
  const media = matchMedia('(prefers-reduced-motion: reduce)');

  // --hs reaches 1 when 80% of the hero's height has gone past the top of the window
  let raf = 0;
  let last = -1;
  const onScroll = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const hs = Math.min(1, Math.max(0, -hero.getBoundingClientRect().top / Math.max(1, hero.offsetHeight * 0.8)));
      if (hs !== last) { last = hs; stage.style.setProperty('--hs', hs.toFixed(3)); }
    });
  };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll);
  onScroll();

  // only a mouse spreads the layers: a finger has no hover, and reduced motion keeps them still
  stage.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || media.matches) return;
    const r = stage.getBoundingClientRect();
    stage.style.setProperty('--px', (((e.clientX - r.left) / r.width) * 2 - 1).toFixed(3));
    stage.style.setProperty('--py', (((e.clientY - r.top) / r.height) * 2 - 1).toFixed(3));
  });
  stage.addEventListener('pointerleave', () => {
    stage.style.setProperty('--px', '0');
    stage.style.setProperty('--py', '0');
  });

  // the object stops floating off screen, in a hidden tab and with reduced motion
  const arts = [...stage.querySelectorAll('.hero-art')];
  const sync = () => arts.forEach((el) => el.classList.toggle('is-paused', media.matches || document.hidden || el.dataset.visible !== 'true'));
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { e.target.dataset.visible = String(e.isIntersecting); });
    sync();
  });
  arts.forEach((el) => io.observe(el));
  document.addEventListener('visibilitychange', sync);
  media.addEventListener('change', sync);
})();
