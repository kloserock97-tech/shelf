// Film gallery: the stage is pinned (position: sticky) and the screen inside moves 1:1 with the page.
// shift = how far the pin's top has gone past the sticky line, capped by the run-out (--over).
// Ported from Portfolio 3D TS2: src/ui/caseStoryView.ts (mountStory: films, measureFilms, onScroll).
(() => {
  const films = [...document.querySelectorAll('.film-pin')].map((pin) => ({
    pin,
    sticky: pin.querySelector('.film-sticky'),
    stage: pin.querySelector('.film-stage'),
    track: pin.querySelector('.film-track'),
    line: 0, // sticky line, px from the top of the window
    over: 0, // how much of the screen doesn't fit the stage
  }));
  if (!films.length) return;

  let raf = 0;
  const update = () => {
    raf = 0;
    for (const f of films) {
      const shift = Math.min(f.over, Math.max(0, f.line - f.pin.getBoundingClientRect().top));
      f.pin.style.setProperty('--shift', `${shift}px`);
      f.pin.classList.toggle('is-end', f.over === 0 || shift >= f.over - 1);
    }
  };
  const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };

  // The part of the screen that doesn't fit the stage is exactly how long the pinned stretch has to be.
  const measure = () => {
    for (const f of films) {
      f.line = parseFloat(getComputedStyle(f.sticky).top) || 0;
      // The track sits at top: var(--stage-pad). offsetTop gives the resolved pixels; reading the custom
      // property itself returns the unresolved "clamp(...)" string.
      const pad = f.track.offsetTop;
      const full = f.track.offsetHeight + pad * 2;
      f.pin.style.setProperty('--film-h', `${Math.ceil(full)}px`);
      f.over = Math.max(0, Math.round(full - f.stage.clientHeight));
      f.pin.style.setProperty('--over', `${f.over}px`);
    }
    update();
  };

  // The image loads later and the window resizes: both change the numbers.
  const ro = new ResizeObserver(measure);
  films.forEach((f) => { ro.observe(f.track); ro.observe(f.stage); });
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', measure);
})();
