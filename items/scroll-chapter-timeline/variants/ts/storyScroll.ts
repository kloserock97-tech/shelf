/* The story's scroll in one place: the bounds of the .story block, progress ↔ pixels, and the story length.
   The length is not written in CSS: layoutTimeline() counts it from the content, and applyTimeline() sets
   the height of .story in vh. */
import { TIMELINE, layoutTimeline, type TimelineInput } from "./timeline";

const story = () => document.querySelector<HTMLElement>(".story");

/* Window height that the phone address bar does not shake.
   Progress used to be computed from innerHeight. A phone hides and shows the address bar, innerHeight changes
   by 50–90 px while the page does not move at all, and the same scrollY turned into a different progress:
   the chapter jumped, a card flipped to the next one. Measured on a phone emulation: a window 64 px lower
   with the scroll unchanged moved progress 0.750 → 0.809. Scrolling back suffered most, because scrolling up
   is exactly the gesture that pulls the address bar out.
   The fix: measure the vh unit, not the window. vh is taken from the large viewport and ignores the address
   bar; the story height is set in the same units. The value comes from a tiny hidden probe and is kept until
   a real viewport change. */
let probe: HTMLElement | null = null;
let cached = 0;
export function viewH() {
  if (cached) return cached;
  if (!probe) {
    probe = document.createElement("i");
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText = "position:fixed;top:0;left:0;width:0;height:100vh;visibility:hidden;pointer-events:none";
    document.body.appendChild(probe);
  }
  cached = probe.offsetHeight || innerHeight;
  return cached;
}

type Listener = () => void;
const listeners = new Set<Listener>();
/** called after the story length was recomputed (the bounds changed) */
export const onTimeline = (cb: Listener) => { listeners.add(cb); };

const viewport = new Set<Listener>();
/** A real viewport change: a phone turned, a desktop window resized. The address bar hiding does not count:
    it used to trigger a full chapter relayout right under the finger. */
export const onViewport = (cb: Listener) => { viewport.add(cb); };
let lastW = innerWidth;
let lastH = 0;
const recheck = () => {
  cached = 0;
  const w = innerWidth, h = viewH();
  if (w === lastW && Math.abs(h - lastH) < 2) return;
  lastW = w; lastH = h;
  viewport.forEach((cb) => cb());
};
addEventListener("resize", recheck);
addEventListener("orientationchange", recheck);

/* How much of the screen above the story it should already fill when it starts. Wide screen: the story starts
   as soon as the content above it could be gone. Narrow screen: the content above scrolls, and the story waits
   until its bottom edge rises to 40 % of the window height, so whatever sits at the bottom of that first
   screen reaches the middle and can be used before the story takes over. */
const leadPx = (top: number) => Math.min(top, viewH() * (innerWidth <= 900 ? 0.4 : 1));

/** where the story starts and ends in the page scroll */
export function storyBounds() {
  const el = story();
  if (!el) return { start: 0, end: 1 };
  const top = el.offsetTop;
  return { start: Math.max(0, top - leadPx(top)), end: top + el.offsetHeight - viewH() };
}
/** the page scroll for story progress p (menu jumps, "go to card i") */
export function topFor(p: number) {
  const b = storyBounds();
  return p <= 0 ? 0 : b.start + (b.end - b.start) * p;
}
export function progressNow() {
  const b = storyBounds();
  return Math.min(1, Math.max(0, (scrollY - b.start) / Math.max(1, b.end - b.start)));
}

let lastKey = "";
/** Recompute chapter shares and the height of .story. The reader keeps the place: same chapter, same share. */
export function applyTimeline(input: TimelineInput) {
  const el = story();
  if (!el) return;
  const lead = leadPx(el.offsetTop) / Math.max(1, viewH());
  const key = `${JSON.stringify(input)}|${lead.toFixed(2)}`;
  if (key === lastKey) return;
  lastKey = key;
  const before = progressNow();
  const moved = scrollY > storyBounds().start + 2;
  const remap = layoutTimeline(input);
  /* progress runs from "the story starts" to "its bottom reaches the bottom of the window". If less than a
     screen sits above the story, the missing part goes into the height, so the story is always exactly
     TIMELINE.total screens of scroll */
  el.style.height = `${((TIMELINE.total + 1 - lead) * 100).toFixed(1)}vh`;
  if (moved) scrollTo({ top: topFor(remap(before)), behavior: "instant" as ScrollBehavior });
  listeners.forEach((cb) => cb());
}
