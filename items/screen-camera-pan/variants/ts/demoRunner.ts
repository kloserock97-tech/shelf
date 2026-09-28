/* Plays a demo when it comes into view and stops it when it leaves. Every start gets a fresh cancel token
   and marks the previous one stopped, so "Play again", scrolling away or closing the page never leave two
   scenarios fighting over one screen.
   Ported from Portfolio 3D TS2: src/ui/caseDemos.ts (mountDemos). */

export type Run = { stopped: boolean };
export type Play = (stage: HTMLElement, run: Run) => Promise<void>;

/** root holds .dm-wrap[data-demo] blocks; plays maps data-demo to a scenario; scroller — null for the page. Returns stop(). */
export function mountDemos(root: ParentNode, plays: Record<string, Play>, scroller: Element | null = null) {
  const runs = new Map<HTMLElement, Run>();
  const start = (wrap: HTMLElement) => {
    const play = plays[wrap.dataset.demo ?? ""];
    const stage = wrap.querySelector<HTMLElement>(".dm");
    if (!play || !stage) return;
    const prev = runs.get(wrap);
    if (prev) prev.stopped = true;
    const run: Run = { stopped: false };
    runs.set(wrap, run);
    wrap.classList.add("is-playing");
    play(stage, run)
      .finally(() => { if (runs.get(wrap) === run) wrap.classList.remove("is-playing"); })
      .catch(() => {});
  };
  const played = new WeakSet<HTMLElement>();
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const wrap = e.target as HTMLElement;
      if (e.isIntersecting && !played.has(wrap)) { played.add(wrap); start(wrap); }
      if (!e.isIntersecting) { const r = runs.get(wrap); if (r) r.stopped = true; played.delete(wrap); }
    }
  }, { root: scroller, threshold: 0.45 });
  root.querySelectorAll<HTMLElement>(".dm-wrap").forEach((w) => {
    io.observe(w);
    w.querySelector(".dm-replay")?.addEventListener("click", () => start(w));
  });
  return () => { io.disconnect(); runs.forEach((r) => (r.stopped = true)); };
}
