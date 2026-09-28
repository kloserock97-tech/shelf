/* Device-straighten hero: the device in perspective straightens while the hero scrolls away (--hs, 0…1),
   the layers drift after the mouse (--px, --py, −1…1), and the object's float pauses when nobody sees it.
   Styles: hero.css. Ported from Portfolio 3D TS2 v64: src/ui/caseHero.ts (mountHero), src/ui/caseStoryView.ts (--hs). */

/** hero — the whole hero block (stage + facts); scroller — the page (window) or a scrolling box. Returns stop(). */
export function mountHero(hero: HTMLElement, scroller: HTMLElement | Window = window): () => void {
  const stage = hero.querySelector<HTMLElement>(".hero-stage");
  if (!stage) return () => {};
  const media = matchMedia("(prefers-reduced-motion: reduce)");
  const box = scroller === window ? null : (scroller as HTMLElement);
  const top = () => (box ? box.getBoundingClientRect().top : 0);

  /* --hs reaches 1 when 80% of the hero's height has gone past the top of the scroller */
  let raf = 0;
  let last = -1;
  const onScroll = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const passed = top() - hero.getBoundingClientRect().top;
      const hs = Math.min(1, Math.max(0, passed / Math.max(1, hero.offsetHeight * 0.8)));
      if (hs !== last) { last = hs; stage.style.setProperty("--hs", hs.toFixed(3)); }
    });
  };

  /* only a mouse spreads the layers: a finger has no hover, and reduced motion keeps them still */
  const move = (e: PointerEvent) => {
    if (e.pointerType !== "mouse" || media.matches) return;
    const r = stage.getBoundingClientRect();
    stage.style.setProperty("--px", (((e.clientX - r.left) / r.width) * 2 - 1).toFixed(3));
    stage.style.setProperty("--py", (((e.clientY - r.top) / r.height) * 2 - 1).toFixed(3));
  };
  const leave = () => { stage.style.setProperty("--px", "0"); stage.style.setProperty("--py", "0"); };

  /* the object stops floating off screen, in a hidden tab and with reduced motion */
  const arts = [...stage.querySelectorAll<HTMLElement>(".hero-art")];
  const sync = () => arts.forEach((el) => el.classList.toggle("is-paused", media.matches || document.hidden || el.dataset.visible !== "true"));
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { (e.target as HTMLElement).dataset.visible = String(e.isIntersecting); });
    sync();
  }, { root: box });
  arts.forEach((el) => io.observe(el));

  scroller.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  stage.addEventListener("pointermove", move);
  stage.addEventListener("pointerleave", leave);
  document.addEventListener("visibilitychange", sync);
  media.addEventListener("change", sync);
  onScroll();
  sync();

  return () => {
    if (raf) cancelAnimationFrame(raf);
    io.disconnect();
    scroller.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onScroll);
    stage.removeEventListener("pointermove", move);
    stage.removeEventListener("pointerleave", leave);
    document.removeEventListener("visibilitychange", sync);
    media.removeEventListener("change", sync);
  };
}
