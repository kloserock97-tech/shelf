// items/swipe-strip/variants/ts/swipeStrip.ts
function swipeStrip(strip2, opts) {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let items = opts.items();
  let targets = [];
  let current = -1;
  let goal = -1;
  let auto = false;
  let touching = false;
  let timer = 0;
  const measure = () => {
    items = opts.items();
    const mid = strip2.clientWidth / 2;
    targets = items.map((el) => el.offsetLeft + el.offsetWidth / 2 - mid);
  };
  const nearest = () => {
    const x = strip2.scrollLeft;
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
    opts.onMove?.(i, span > 0 ? Math.min(1, Math.max(0, (strip2.scrollLeft - targets[0]) / span)) : 0);
  };
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
  const down = () => {
    touching = true;
    auto = false;
    clearTimeout(timer);
  };
  const up = () => {
    touching = false;
    arm();
  };
  const onEnd = () => {
    clearTimeout(timer);
    settle();
  };
  strip2.addEventListener("scroll", onScroll, { passive: true });
  strip2.addEventListener("scrollend", onEnd);
  strip2.addEventListener("touchstart", down, { passive: true });
  strip2.addEventListener("touchend", up, { passive: true });
  strip2.addEventListener("touchcancel", up, { passive: true });
  measure();
  paint();
  return {
    follow(i) {
      if (touching || i === goal || !targets.length) return;
      goal = i;
      if (Math.abs(strip2.scrollLeft - targets[i]) < 2) return;
      auto = true;
      strip2.scrollTo({ left: targets[i], behavior: reduced ? "auto" : "smooth" });
    },
    index: () => Math.max(0, current),
    refresh() {
      const keep = Math.max(0, current);
      measure();
      if (targets.length) strip2.scrollLeft = targets[Math.min(keep, targets.length - 1)];
      current = -1;
      paint();
    },
    destroy() {
      clearTimeout(timer);
      strip2.removeEventListener("scroll", onScroll);
      strip2.removeEventListener("scrollend", onEnd);
      strip2.removeEventListener("touchstart", down);
      strip2.removeEventListener("touchend", up);
      strip2.removeEventListener("touchcancel", up);
    }
  };
}
var stickyIndex = (run, current) => {
  if (current < 0) return Math.round(run);
  if (run > current + 0.6) return Math.floor(run + 0.4);
  if (run < current - 0.6) return Math.ceil(run - 0.4);
  return current;
};

// items/swipe-strip/variants/ts/main.ts
var CARDS = [
  { id: "harbor", title: "Harbor", tag: "Web platform \xB7 2024", sub: "A neighbourhood noticeboard people actually read", stage: ["#fcefe6", "#f6d9c6"], ink: "#3a1d12", accent: "#d9603b", obj: { w: 1.32, x: -0.16, y: 0.02, ratio: 900 / 547 } },
  { id: "lumen", title: "Lumen", tag: "Analytics \xB7 2025", sub: "Alert rules without a single spreadsheet", stage: ["#edf6f0", "#d2e8da"], ink: "#12281c", accent: "#1f8a4c", obj: { w: 1.14, x: -0.07, y: -0.01, ratio: 900 / 731 } },
  { id: "northwind", title: "Northwind", tag: "AI assistant \xB7 2026", sub: "An assistant that drafts the next step for you", stage: ["#eef3fb", "#d3e1f6"], ink: "#14213d", accent: "#2f5fd0", obj: { w: 1.18, x: -0.06, y: -0.03, ratio: 888 / 851 } },
  { id: "meridian", title: "Meridian", tag: "B2B dashboard \xB7 2024", sub: "A review queue with fewer clicks per item", stage: ["#f1eef9", "#dbd3ee"], ink: "#231a3a", accent: "#6b55c9", obj: { w: 1.16, x: -0.02, y: -0.05, ratio: 900 / 773 } },
  { id: "atlas", title: "Atlas", tag: "iOS \xB7 Android \xB7 2023", sub: "First-run setup that ends in a working app", stage: ["#e9f4f7", "#cbe3ea"], ink: "#0f2a31", accent: "#15899d", obj: { w: 1.28, x: -0.12, y: -0.02, ratio: 900 / 698 } },
  { id: "quarry", title: "Quarry", tag: "Field app \xB7 2025", sub: "Site inspections that work without a signal", stage: ["#f6f1e7", "#e7dcc6"], ink: "#2a2318", accent: "#a9752b", obj: { w: 0.62, x: 0.19, y: -0.05, ratio: 900 / 1156 } }
];
var STEP = 0.85;
var pad = (n) => String(n).padStart(2, "0");
var pct = (v) => `${(v * 100).toFixed(1)}%`;
var strip = document.querySelector(".ss-strip");
strip.innerHTML = CARDS.map((c, i) => `
  <a class="ss-card case" role="listitem" href="#${c.id}" aria-label="${c.title}. ${c.sub}"
     style="--s1:${c.stage[0]};--s2:${c.stage[1]};--ink:${c.ink};--accent:${c.accent};--ow:${pct(c.obj.w)};--ox:${pct(c.obj.x)};--oy:${pct(c.obj.y)};--oar:${c.obj.ratio.toFixed(4)}">
    <span class="case-text">
      <span class="case-tag">${pad(i + 1)} \xB7 ${c.tag}</span>
      <span class="case-title">${c.title}</span>
      <span class="case-sub">${c.sub}</span>
    </span>
    <img class="case-obj" src="objects/${c.id}.webp" alt="" width="900" height="${Math.round(900 / c.obj.ratio)}" draggable="false" decoding="async">
  </a>`).join("");
var cards = [...strip.querySelectorAll(".ss-card")];
cards.forEach((a) => a.addEventListener("click", (e) => e.preventDefault()));
var root = document.querySelector(".ss");
var now = document.querySelector(".ss-now");
var bar = document.querySelector(".ss-bar--strip i");
var pageBar = document.querySelector(".ss-bar--page i");
var log = document.querySelector(".ss-log");
var spacer = document.querySelector(".ss-spacer");
document.querySelector(".ss-of").textContent = `/ ${pad(CARDS.length)}`;
document.querySelector(".ss-kicker sup").textContent = pad(CARDS.length);
var logTimer = 0;
var say = (dir, text) => {
  log.dataset.dir = dir;
  log.textContent = text;
  log.classList.add("is-on");
  clearTimeout(logTimer);
  logTimer = window.setTimeout(() => log.classList.remove("is-on"), 2200);
};
var stepPx = () => innerHeight * STEP;
var topFor = (i) => i * stepPx();
var followed = -1;
var held = -1;
var holdTimer = 0;
var sw = swipeStrip(strip, {
  items: () => cards,
  onMove: (i, fraction) => {
    now.textContent = pad(i + 1);
    bar.style.transform = `scaleX(${fraction.toFixed(4)})`;
  },
  onUserSettle: (i) => {
    root.classList.add("is-swiped");
    held = i;
    followed = i;
    clearTimeout(holdTimer);
    holdTimer = window.setTimeout(() => held = -1, 2500);
    if (Math.abs(scrollY - topFor(i)) > 1) scrollTo({ top: topFor(i), behavior: "instant" });
    say("strip", `strip \u2192 onUserSettle(${pad(i + 1)}) \u2192 page`);
  }
});
var onPageScroll = () => {
  const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
  pageBar.style.transform = `scaleX(${Math.min(1, scrollY / max).toFixed(4)})`;
  const run = Math.min(CARDS.length - 1, Math.max(0, scrollY / stepPx()));
  if (held >= 0) {
    followed = held;
    if (Math.abs(run - held) < 0.05) held = -1;
    return;
  }
  const next = stickyIndex(run, followed);
  if (next !== followed && followed >= 0) say("page", `page \u2192 follow(${pad(next + 1)})`);
  followed = next;
  sw.follow(followed);
};
addEventListener("scroll", onPageScroll, { passive: true });
var layout = () => {
  spacer.style.height = `${(innerHeight + (CARDS.length - 1) * stepPx()).toFixed(0)}px`;
  sw.refresh();
  onPageScroll();
};
addEventListener("resize", () => requestAnimationFrame(layout));
layout();
document.querySelectorAll(".ss-step").forEach(
  (b) => b.addEventListener("click", () => {
    const d = Number(b.dataset.d);
    const target = cards[Math.min(cards.length - 1, Math.max(0, sw.index() + d))];
    strip.scrollTo({ left: target.offsetLeft + target.offsetWidth / 2 - strip.clientWidth / 2, behavior: "smooth" });
  })
);
