/* Story timeline: where each chapter sits in the scroll, computed from the content instead of written in CSS.

   Every scene is measured in screens (1 = 100vh). A list chapter is lead + (items − 1)·step + tail: one card is
   one step of scroll, so adding a card lengthens the story by itself, and a card takes the same scroll distance
   on any screen. The step comes from the real distance between cards (see main.ts), clamped to 0.4…0.9 screens.
   layoutTimeline() returns a function that maps an old progress to the new one: same chapter, same share. */

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
/** 0 before a, 1 after b, linear between */
export const ramp = (x: number, a: number, b: number) => clamp01((x - a) / (b - a));

export type ChapterSpec =
  | { id: string; screens: number }
  | { id: string; items: number; lead: number; tail: number };

export type TimelineInput = {
  /** narrow screen: fixed scenes are shorter (×0.88) */
  narrow: boolean;
  /** screens of scroll per list item */
  step: number;
  chapters: ChapterSpec[];
};

export type Chapter = {
  id: string;
  /** where the chapter starts and ends, as shares of the whole story */
  from: number;
  to: number;
  /** its length in screens */
  screens: number;
  items: number;
  /** where the list runs from the first item to the last, as shares of the chapter */
  run: readonly [number, number];
};

/** the result of the last layout */
export const TIMELINE = { total: 1, step: 0.7, chapters: [] as Chapter[] };

export function layoutTimeline(input: TimelineInput) {
  const old = TIMELINE.chapters.map((c) => [c.from, c.to] as const);
  const k = input.narrow ? 0.88 : 1;
  const step = Math.min(0.9, Math.max(0.4, input.step));
  const spans = input.chapters.map((c) => {
    if ("items" in c) {
      const lead = c.lead * k;
      const run = Math.max(1, c.items - 1) * step;
      const screens = lead + run + c.tail * k;
      return { id: c.id, screens, items: c.items, runA: lead, runB: lead + run };
    }
    return { id: c.id, screens: c.screens * k, items: 0, runA: 0, runB: 0 };
  });
  const total = spans.reduce((s, c) => s + c.screens, 0);
  let at = 0;
  const chapters: Chapter[] = spans.map((c) => {
    const from = at / total;
    at += c.screens;
    return { id: c.id, from, to: at / total, screens: c.screens, items: c.items, run: [c.runA / c.screens, c.runB / c.screens] as const };
  });
  Object.assign(TIMELINE, { total, step, chapters });
  /* the reader keeps their place: same chapter, same share of it */
  return (p: number) => {
    if (old.length !== chapters.length) return p;
    const i = old.findIndex(([a, b]) => p >= a && p <= b);
    if (i < 0) return p;
    const [a, b] = old[i];
    const c = chapters[i];
    return c.from + ((p - a) / Math.max(1e-6, b - a)) * (c.to - c.from);
  };
}

/** which chapter the story is in and how far through it (0…1) */
export function chapterAt(p: number) {
  const list = TIMELINE.chapters;
  let i = list.findIndex((c) => p < c.to);
  if (i < 0) i = list.length - 1;
  const c = list[i];
  return { index: i, chapter: c, local: clamp01((p - c.from) / Math.max(1e-6, c.to - c.from)) };
}

/** Steps with a soft stop: at every item the list slows down, between items it moves faster.
    Speed is 1 − k·cos(2πf): at k = 0.5 it is half the average at an item, with no stops or jerks. */
export const dwell = (x: number, k = 0.5) => {
  const i = Math.floor(x);
  const f = x - i;
  return i + f - (k / (2 * Math.PI)) * Math.sin(2 * Math.PI * f);
};

/** Item index for a list the reader also swipes: forward once 60 % of a step is covered, back once
    60 % is undone, the item holds in between. Plain rounding flipped it on half a step. */
export const stickyIndex = (run: number, current: number) => {
  if (current < 0) return Math.round(run);
  if (run > current + 0.6) return Math.floor(run + 0.4);
  if (run < current - 0.6) return Math.ceil(run - 0.4);
  return current;
};
