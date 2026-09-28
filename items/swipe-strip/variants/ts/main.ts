/* Demo wiring: the page scroll is the "story" (vertical axis), the strip is the finger axis.
 *   page scroll → stickyIndex → strip.follow(i)
 *   swipe / Tab / arrow buttons → onUserSettle(i) → the page jumps to the same card
 * One card is 0.85 of a screen of page scroll: a 500 px finger fling carries a page ~1.2 screens, so at 0.5 it
 * skipped two or three cards; at 0.85 one fling is one card, like in story feeds. */
import { swipeStrip, stickyIndex } from "./swipeStrip";

type Card = { id: string; title: string; tag: string; sub: string; stage: [string, string]; ink: string; accent: string; obj: { w: number; x: number; y: number; ratio: number } };

const CARDS: Card[] = [
  { id: "harbor", title: "Harbor", tag: "Web platform · 2024", sub: "A neighbourhood noticeboard people actually read", stage: ["#fcefe6", "#f6d9c6"], ink: "#3a1d12", accent: "#d9603b", obj: { w: 1.32, x: -0.16, y: 0.02, ratio: 900 / 547 } },
  { id: "lumen", title: "Lumen", tag: "Analytics · 2025", sub: "Alert rules without a single spreadsheet", stage: ["#edf6f0", "#d2e8da"], ink: "#12281c", accent: "#1f8a4c", obj: { w: 1.14, x: -0.07, y: -0.01, ratio: 900 / 731 } },
  { id: "northwind", title: "Northwind", tag: "AI assistant · 2026", sub: "An assistant that drafts the next step for you", stage: ["#eef3fb", "#d3e1f6"], ink: "#14213d", accent: "#2f5fd0", obj: { w: 1.18, x: -0.06, y: -0.03, ratio: 888 / 851 } },
  { id: "meridian", title: "Meridian", tag: "B2B dashboard · 2024", sub: "A review queue with fewer clicks per item", stage: ["#f1eef9", "#dbd3ee"], ink: "#231a3a", accent: "#6b55c9", obj: { w: 1.16, x: -0.02, y: -0.05, ratio: 900 / 773 } },
  { id: "atlas", title: "Atlas", tag: "iOS · Android · 2023", sub: "First-run setup that ends in a working app", stage: ["#e9f4f7", "#cbe3ea"], ink: "#0f2a31", accent: "#15899d", obj: { w: 1.28, x: -0.12, y: -0.02, ratio: 900 / 698 } },
  { id: "quarry", title: "Quarry", tag: "Field app · 2025", sub: "Site inspections that work without a signal", stage: ["#f6f1e7", "#e7dcc6"], ink: "#2a2318", accent: "#a9752b", obj: { w: 0.62, x: 0.19, y: -0.05, ratio: 900 / 1156 } },
];

const STEP = 0.85;
const pad = (n: number) => String(n).padStart(2, "0");
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

const strip = document.querySelector<HTMLElement>(".ss-strip")!;
strip.innerHTML = CARDS.map((c, i) => `
  <a class="ss-card case" role="listitem" href="#${c.id}" aria-label="${c.title}. ${c.sub}"
     style="--s1:${c.stage[0]};--s2:${c.stage[1]};--ink:${c.ink};--accent:${c.accent};--ow:${pct(c.obj.w)};--ox:${pct(c.obj.x)};--oy:${pct(c.obj.y)};--oar:${c.obj.ratio.toFixed(4)}">
    <span class="case-text">
      <span class="case-tag">${pad(i + 1)} · ${c.tag}</span>
      <span class="case-title">${c.title}</span>
      <span class="case-sub">${c.sub}</span>
    </span>
    <img class="case-obj" src="objects/${c.id}.webp" alt="" width="900" height="${Math.round(900 / c.obj.ratio)}" draggable="false" decoding="async">
  </a>`).join("");
const cards = [...strip.querySelectorAll<HTMLElement>(".ss-card")];
cards.forEach((a) => a.addEventListener("click", (e) => e.preventDefault()));

const root = document.querySelector<HTMLElement>(".ss")!;
const now = document.querySelector<HTMLElement>(".ss-now")!;
const bar = document.querySelector<HTMLElement>(".ss-bar--strip i")!;
const pageBar = document.querySelector<HTMLElement>(".ss-bar--page i")!;
const log = document.querySelector<HTMLElement>(".ss-log")!;
const spacer = document.querySelector<HTMLElement>(".ss-spacer")!;
document.querySelector(".ss-of")!.textContent = `/ ${pad(CARDS.length)}`;
document.querySelector(".ss-kicker sup")!.textContent = pad(CARDS.length);

/* what just synced what: a line under the strip */
let logTimer = 0;
const say = (dir: "page" | "strip", text: string) => {
  log.dataset.dir = dir;
  log.textContent = text;
  log.classList.add("is-on");
  clearTimeout(logTimer);
  logTimer = window.setTimeout(() => log.classList.remove("is-on"), 2200);
};

const stepPx = () => innerHeight * STEP;
const topFor = (i: number) => i * stepPx();

let followed = -1; // the card the page stands on (with hysteresis)
let held = -1; // a card the person picked on the strip; the page scroll is not allowed to take it back for a moment
let holdTimer = 0;
const sw = swipeStrip(strip, {
  items: () => cards,
  onMove: (i, fraction) => {
    now.textContent = pad(i + 1);
    bar.style.transform = `scaleX(${fraction.toFixed(4)})`;
  },
  onUserSettle: (i) => {
    root.classList.add("is-swiped");
    /* the person turned the strip — move the page to the same card, otherwise the next vertical scroll would pull
       the strip back */
    held = i;
    followed = i;
    clearTimeout(holdTimer);
    holdTimer = window.setTimeout(() => (held = -1), 2500);
    if (Math.abs(scrollY - topFor(i)) > 1) scrollTo({ top: topFor(i), behavior: "instant" as ScrollBehavior });
    say("strip", `strip → onUserSettle(${pad(i + 1)}) → page`);
  },
});

const onPageScroll = () => {
  const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
  pageBar.style.transform = `scaleX(${Math.min(1, scrollY / max).toFixed(4)})`;
  const run = Math.min(CARDS.length - 1, Math.max(0, scrollY / stepPx()));
  if (held >= 0) {
    followed = held;
    if (Math.abs(run - held) < 0.05) held = -1;
    return;
  }
  const next = stickyIndex(run, followed);
  if (next !== followed && followed >= 0) say("page", `page → follow(${pad(next + 1)})`);
  followed = next;
  sw.follow(followed);
};
addEventListener("scroll", onPageScroll, { passive: true });

const layout = () => {
  spacer.style.height = `${(innerHeight + (CARDS.length - 1) * stepPx()).toFixed(0)}px`;
  sw.refresh();
  onPageScroll();
};
addEventListener("resize", () => requestAnimationFrame(layout));
layout();

/* mouse has no sideways swipe: the arrows scroll the strip itself, so they count as a person's gesture */
document.querySelectorAll<HTMLButtonElement>(".ss-step").forEach((b) =>
  b.addEventListener("click", () => {
    const d = Number(b.dataset.d);
    const target = cards[Math.min(cards.length - 1, Math.max(0, sw.index() + d))];
    strip.scrollTo({ left: target.offsetLeft + target.offsetWidth / 2 - strip.clientWidth / 2, behavior: "smooth" });
  }),
);
