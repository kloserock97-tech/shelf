/* Swipe strip: a horizontal carousel for the finger that stays in sync with something else.
 *
 * The strip is plain native scrolling with CSS scroll-snap: one swipe is one card, the neighbour peeks from the
 * edge, momentum and bounce come from the browser. The two axes are tied through the card index:
 *   - the outside (a vertical story, a page scroll, a tab bar) reached card i → follow(i): the strip glides there;
 *   - a person flicked the strip → onUserSettle(i): the caller moves its own state to the same card.
 * While a finger is on the strip (and while it coasts on momentum) the outside does not touch it. */

export type SwipeStrip = {
  follow(i: number): void;
  index(): number;
  refresh(): void;
  destroy(): void;
};

type Options = {
  items: () => HTMLElement[];
  /** the strip moved: nearest card and the share of the whole way, 0…1 */
  onMove?: (index: number, fraction: number) => void;
  /** the strip stopped after a person's gesture (swipe, Tab, sideways wheel, buttons) */
  onUserSettle?: (index: number) => void;
};

export function swipeStrip(strip: HTMLElement, opts: Options): SwipeStrip {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let items = opts.items();
  let targets: number[] = [];
  let current = -1;
  let goal = -1;
  let auto = false; // the outside is driving the strip
  let touching = false;
  let timer = 0;

  /** scrollLeft that centres each card */
  const measure = () => {
    items = opts.items();
    const mid = strip.clientWidth / 2;
    targets = items.map((el) => el.offsetLeft + el.offsetWidth / 2 - mid);
  };
  const nearest = () => {
    const x = strip.scrollLeft;
    let best = 0;
    for (let i = 1; i < targets.length; i++) if (Math.abs(targets[i] - x) < Math.abs(targets[best] - x)) best = i;
    return best;
  };
  const paint = () => {
    const i = nearest();
    if (i !== current) {
      current = i;
      items.forEach((el, n) => el.classList.toggle("is-active", n === i));
    }
    const span = (targets[targets.length - 1] ?? 0) - (targets[0] ?? 0);
    opts.onMove?.(i, span > 0 ? Math.min(1, Math.max(0, (strip.scrollLeft - targets[0]) / span)) : 0);
  };

  /* The stop: scrollend, and where it does not exist (Safari) 160 ms of silence. Once per movement. */
  let moving = false;
  const settle = () => {
    if (touching || !moving) return;
    moving = false;
    const byUser = !auto;
    auto = false;
    goal = nearest();
    if (byUser) opts.onUserSettle?.(goal);
  };
  const arm = () => {
    clearTimeout(timer);
    timer = window.setTimeout(settle, 160);
  };
  const onScroll = () => {
    moving = true;
    paint();
    arm();
  };
  const down = () => { touching = true; auto = false; clearTimeout(timer); };
  const up = () => { touching = false; arm(); };
  const onEnd = () => { clearTimeout(timer); settle(); };

  strip.addEventListener("scroll", onScroll, { passive: true });
  strip.addEventListener("scrollend", onEnd);
  strip.addEventListener("touchstart", down, { passive: true });
  strip.addEventListener("touchend", up, { passive: true });
  strip.addEventListener("touchcancel", up, { passive: true });
  measure();
  paint();

  return {
    follow(i) {
      if (touching || i === goal || !targets.length) return;
      goal = i;
      if (Math.abs(strip.scrollLeft - targets[i]) < 2) return;
      auto = true;
      strip.scrollTo({ left: targets[i], behavior: reduced ? "auto" : "smooth" });
    },
    index: () => Math.max(0, current),
    refresh() {
      const keep = Math.max(0, current);
      measure();
      if (targets.length) strip.scrollLeft = targets[Math.min(keep, targets.length - 1)];
      current = -1;
      paint();
    },
    destroy() {
      clearTimeout(timer);
      strip.removeEventListener("scroll", onScroll);
      strip.removeEventListener("scrollend", onEnd);
      strip.removeEventListener("touchstart", down);
      strip.removeEventListener("touchend", up);
      strip.removeEventListener("touchcancel", up);
    },
  };
}

/** Which card the outside is on, with hysteresis. Plain rounding switched cards after half a step: right after a
 *  sideways swipe the page stands exactly on a card, and 200 px of vertical scroll already turned the strip under
 *  the finger. Forward when 60 % of a step is covered, back when 60 % is undone; in between the card holds.
 *  A far jump (a menu link) lands where it should at once. */
export const stickyIndex = (run: number, current: number) => {
  if (current < 0) return Math.round(run);
  if (run > current + 0.6) return Math.floor(run + 0.4);
  if (run < current - 0.6) return Math.ceil(run - 0.4);
  return current;
};
