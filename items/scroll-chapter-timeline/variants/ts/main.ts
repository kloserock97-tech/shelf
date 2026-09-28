/* Demo: a four-chapter story on DOM. Intro and End are fixed scenes; Cases and Notes are lists whose length
   is (items − 1) · step. The step comes from the real distance between cards, so the strip moves at about
   the page's speed on any screen. +/− changes the number of cases: the story grows or shrinks, the map below
   is redrawn, and the reader stays in the same place of the same chapter. */
import { TIMELINE, chapterAt, dwell, ramp } from "./timeline";
import { applyTimeline, onTimeline, onViewport, progressNow, topFor, viewH } from "./storyScroll";

const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const pad = (n: number) => String(n).padStart(2, "0");
const ease = (x: number) => x * x * (3 - 2 * x);

const CASES = ["Onboarding", "Search", "Checkout", "Settings", "Reports", "Inbox", "Billing", "Profile", "Help"];
const NOTES = ["Three screens instead of nine", "Search that forgives typos", "A settings page people finish", "Reports that open in a second"];

const strip = $(".strip");
const reel = $(".reel");
const map = $(".map");
const head = $(".map-head");
const barFill = $(".bar i");
const barTicks = $(".bar-ticks");
const now = $("[data-now]");
const of = $("[data-of]");
const count = $("[data-n]");
const readout = $(".readout");
const caseBar = $(".case-bar i");
const panels = [...document.querySelectorAll<HTMLElement>(".ch")];

let cases = 5;
let cards: HTMLElement[] = [];
let rows: HTMLElement[] = [];
let spacing = 360;
let rowH = 64;
const written = new Map<HTMLElement, string>();
/* write a style only when it changed */
const put = (el: HTMLElement, css: string) => {
  if (written.get(el) === css) return;
  written.set(el, css);
  el.style.cssText = css;
};

function build() {
  strip.innerHTML = Array.from({ length: cases }, (_, i) =>
    `<article class="card" data-h="${(150 + i * 38) % 360}" style="--h:${(150 + i * 38) % 360}"><span class="card-n">Case ${pad(i + 1)}</span><b>${CASES[i % CASES.length]}</b></article>`).join("");
  cards = [...strip.querySelectorAll<HTMLElement>(".card")];
  reel.innerHTML = NOTES.map((t, i) => `<p class="row"><span>${pad(i + 1)}</span>${t}</p>`).join("");
  rows = [...reel.querySelectorAll<HTMLElement>(".row")];
  written.clear();
  count.textContent = String(cases);
  of.textContent = pad(cases);
}

/* measured on start, on a real viewport change and when the list changes, never in a scroll frame */
function layout() {
  const w = cards[0]?.offsetWidth ?? 300;
  const gap = Math.min(44, Math.max(22, innerWidth * 0.024));
  spacing = w + gap;
  rowH = rows[0]?.offsetHeight ?? 64;
  /* a card takes a bit more scroll than its own width: the strip moves slightly slower than the page (1 : 1.3) */
  const step = (spacing * 1.3) / Math.max(1, viewH());
  applyTimeline({
    narrow: innerWidth <= 900,
    step,
    chapters: [
      { id: "Intro", screens: 1.4 },
      { id: "Cases", items: cases, lead: 0.5, tail: 0.4 },
      { id: "Notes", items: NOTES.length, lead: 0.4, tail: 0.3 },
      { id: "End", screens: 1.1 },
    ],
  });
  frame();
}

/* the map: one segment per chapter, as wide as its length in screens, a tick per list item */
function drawMap() {
  map.innerHTML = TIMELINE.chapters.map((c, i) => {
    const ticks = c.items
      ? Array.from({ length: c.items }, (_, j) => `<i style="left:${((c.run[0] + (c.run[1] - c.run[0]) * (j / Math.max(1, c.items - 1))) * 100).toFixed(2)}%"></i>`).join("")
      : "";
    return `<button type="button" class="seg" data-i="${i}" style="flex-grow:${c.screens.toFixed(3)}"><span class="seg-l">${c.id}</span><span class="seg-v">${c.screens.toFixed(1)}</span>${ticks}</button>`;
  }).join("") + `<span class="playhead"></span>`;
  barTicks.innerHTML = TIMELINE.chapters.slice(1).map((c) => `<i style="top:${(c.from * 100).toFixed(2)}%"></i>`).join("");
  head.textContent = `${TIMELINE.total.toFixed(1)} screens · step ${TIMELINE.step.toFixed(2)}`;
  written.clear();
}

let raf = 0;
function frame() {
  raf = 0;
  const p = progressNow();
  put(barFill, `transform:scaleY(${p.toFixed(4)})`);
  const playhead = map.querySelector<HTMLElement>(".playhead");
  if (playhead) put(playhead, `left:${(p * 100).toFixed(2)}%`);
  const { index, local } = chapterAt(p);

  TIMELINE.chapters.forEach((c, i) => {
    const panel = panels[i];
    if (!panel) return;
    const l = Math.min(1, Math.max(0, (p - c.from) / (c.to - c.from)));
    const inside = p >= c.from - 0.02 && p <= c.to + 0.02;
    const o = inside ? Math.min(c.from === 0 ? 1 : ramp(l, 0, 0.08), c.to >= 1 ? 1 : 1 - ramp(l, 0.92, 1)) : 0;
    put(panel, `opacity:${o.toFixed(3)};visibility:${o > 0.001 ? "visible" : "hidden"}`);

    if (c.id === "Cases" && o > 0) {
      const e = ease(ramp(l, 0, c.run[0]));
      const run = ramp(l, c.run[0], c.run[1]) * (cases - 1);
      /* the soft stop: the strip lingers at every card */
      const a = reduced ? run : dwell(run);
      cards.forEach((el, j) => {
        const d = j - a;
        const ad = Math.abs(d);
        const y = (1 - e) * (80 + j * 24);
        put(el, `--h:${el.dataset.h};transform:translate3d(${(d * spacing).toFixed(1)}px,${y.toFixed(1)}px,0) scale(${(1 - Math.min(ad, 2) * 0.08).toFixed(3)});opacity:${(Math.max(0, Math.min(1, 2.6 - ad)) * Math.min(1, e * 1.4)).toFixed(3)}`);
        el.classList.toggle("is-active", ad < 0.5);
      });
      now.textContent = pad(Math.round(a) + 1);
      put(caseBar, `transform:scaleX(${(a / Math.max(1, cases - 1)).toFixed(4)})`);
    }
    if (c.id === "Notes" && o > 0) {
      const run = ramp(l, c.run[0], c.run[1]) * (rows.length - 1);
      const a = reduced ? run : dwell(run);
      rows.forEach((el, j) => {
        const d = j - a;
        const ad = Math.abs(d);
        put(el, `transform:translate3d(0,${(d * rowH).toFixed(1)}px,0) scale(${(1 - Math.min(ad, 1) * 0.12).toFixed(3)});opacity:${Math.max(0, 1 - Math.min(ad, 2.5) * 0.4).toFixed(3)}`);
      });
    }
  });

  const card = TIMELINE.chapters[index]?.items ? ` · item ${pad(Math.round(ramp(local, TIMELINE.chapters[index].run[0], TIMELINE.chapters[index].run[1]) * (TIMELINE.chapters[index].items - 1)) + 1)}` : "";
  const text = `p ${p.toFixed(3)} · ${TIMELINE.chapters[index]?.id ?? ""} ${(local * 100).toFixed(0)}%${card} · story ${$(".story").style.height}`;
  if (readout.textContent !== text) readout.textContent = text;
}

addEventListener("scroll", () => { if (!raf) raf = requestAnimationFrame(frame); }, { passive: true });
onViewport(layout);
onTimeline(() => { drawMap(); frame(); });

$("[data-less]").addEventListener("click", () => { if (cases > 2) { cases--; build(); layout(); } });
$("[data-more]").addEventListener("click", () => { if (cases < 9) { cases++; build(); layout(); } });
map.addEventListener("click", (e) => {
  const seg = (e.target as HTMLElement).closest<HTMLElement>(".seg");
  if (!seg) return;
  const c = TIMELINE.chapters[Number(seg.dataset.i)];
  scrollTo({ top: topFor(c.from + (c.items ? c.run[0] * (c.to - c.from) : 0) + 0.001), behavior: reduced ? "instant" as ScrollBehavior : "smooth" });
});
$("[data-top]").addEventListener("click", () => scrollTo({ top: 0, behavior: reduced ? "instant" as ScrollBehavior : "smooth" }));

build();
layout();
document.fonts?.ready.then(layout);
