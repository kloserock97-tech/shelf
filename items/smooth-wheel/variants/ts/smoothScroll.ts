/* Smooth wheel for a scrolling page or box.

   Why like this. Changing the speed or direction of scrolling is off limits: NN/g calls it scrolljacking,
   and people take it for a broken page. So the distance stays 1:1 (one notch travels exactly as far as in
   the browser) and only the jolt is smoothed: the position chases the target exponentially. The same idea
   as Lenis (a target plus a chasing position, the real scrollTop, no transforms), written from scratch.

   What stays native: trackpads (they have their own inertia; smoothing them again feels like rubber),
   fingers, keys, the scrollbar, find-in-page, Ctrl + wheel (zoom) and nested scrolling boxes. If the page
   was scrolled by something else (a key, the scrollbar, scrollTo), the chase picks up the new place at once.
   prefers-reduced-motion: no smoothing at all.

   Ported from Portfolio 3D TS2: src/ui/smoothScroll.ts. One change: at the very edge the wheel is passed on
   (not swallowed), so a page inside an iframe or an embed lets the outer page scroll. */

import { SCROLL_LAMBDA as LAMBDA } from "./scrollFeel";

const LINE = 100 / 3; // pixels in a wheel "line" (deltaMode = 1, Firefox)

export type Smoother = { to: (top: number) => void; stop: () => void };
/** where a wheel event went: smoothed here, or left to the browser and why */
export type WheelRoute = "smooth" | "trackpad" | "nested" | "zoom" | "sideways" | "reduced" | "edge";

/** scroller — a scrolling box or window; skip — when the wheel belongs to someone else; report — for a debug readout */
export function smoothWheel(scroller: HTMLElement | Window, skip?: () => boolean, report?: (route: WheelRoute) => void): Smoother {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const win = scroller === window;
  const root = document.scrollingElement as HTMLElement;
  const box = win ? root : (scroller as HTMLElement);
  const getTop = () => (win ? scrollY : box.scrollTop);
  const setTop = (v: number) => { if (win) scrollTo({ top: v, behavior: "instant" as ScrollBehavior }); else box.scrollTop = v; };
  const view = () => (win ? innerHeight : box.clientHeight);
  let target = getTop();
  let current = target;
  let expected = -1;
  let raf = 0;
  let last = 0;

  const max = () => Math.max(0, box.scrollHeight - view());
  const clamp = (v: number) => Math.min(max(), Math.max(0, v));

  const tick = (now: number) => {
    /* the step is measured in real time: on a slow device with rare frames the ride still takes ~0.5 s */
    const dt = Math.min(1, (now - last) / 1000);
    last = now;
    current += (target - current) * (1 - Math.exp(-dt * LAMBDA));
    if (Math.abs(target - current) < 0.4) current = target;
    expected = current;
    setTop(current);
    raf = current === target ? 0 : requestAnimationFrame(tick);
  };
  const start = () => {
    if (raf) return;
    last = performance.now();
    raf = requestAnimationFrame(tick);
  };
  const halt = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    target = current = getTop();
  };

  /* a scrolling box under the cursor can still go this way: leave it alone */
  const nested = (from: EventTarget | null, dy: number) => {
    for (let el = from as HTMLElement | null; el && el !== box; el = el.parentElement) {
      if (el === document.body || el.scrollHeight <= el.clientHeight + 1) continue;
      const oy = getComputedStyle(el).overflowY;
      if (oy !== "auto" && oy !== "scroll") continue;
      if (dy > 0 ? el.scrollTop + el.clientHeight < el.scrollHeight - 1 : el.scrollTop > 0) return true;
    }
    return false;
  };

  const onWheel = (e: WheelEvent) => {
    if (e.ctrlKey || e.metaKey) { report?.("zoom"); return; }
    if (reduce.matches) { report?.("reduced"); return; }
    if (e.defaultPrevented || skip?.()) return;
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) { report?.("sideways"); return; }
    /* a trackpad sends small pixel deltas with its own inertia */
    if (e.deltaMode === 0 && Math.abs(e.deltaY) < 40) { if (raf) halt(); report?.("trackpad"); return; }
    if (nested(e.target, e.deltaY)) { report?.("nested"); return; }
    /* standing at the edge: the wheel goes on to the page around this one */
    if (!raf && (e.deltaY > 0 ? getTop() >= max() - 1 : getTop() <= 1)) { report?.("edge"); return; }
    const px = e.deltaMode === 1 ? e.deltaY * LINE : e.deltaMode === 2 ? e.deltaY * view() * 0.9 : e.deltaY;
    e.preventDefault();
    if (!raf) target = current = getTop();
    target = clamp(target + px);
    report?.("smooth");
    start();
  };

  /* someone else scrolled (a key, the scrollbar, another scrollTo): take the new place, don't argue */
  const onScroll = () => {
    if (raf && Math.abs(getTop() - expected) > 2) halt();
  };

  scroller.addEventListener("wheel", onWheel as EventListener, { passive: false });
  scroller.addEventListener("scroll", onScroll, { passive: true });

  return {
    /** get to a place with the same motion as the wheel; from far away, cut closer first and glide the rest */
    to(top: number) {
      const goal = clamp(top);
      if (reduce.matches) { halt(); setTop(goal); return; }
      if (!raf) target = current = getTop();
      const reach = view() * 1.2;
      if (Math.abs(goal - current) > reach) {
        current = goal + (current > goal ? reach : -reach);
        expected = current;
        setTop(current);
      }
      target = goal;
      start();
    },
    stop() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      scroller.removeEventListener("wheel", onWheel as EventListener);
      scroller.removeEventListener("scroll", onScroll);
    },
  };
}
