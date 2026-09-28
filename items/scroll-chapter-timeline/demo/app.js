"use strict";
(() => {
  // items/scroll-chapter-timeline/variants/ts/timeline.ts
  var clamp01 = (x) => Math.min(1, Math.max(0, x));
  var ramp = (x, a, b) => clamp01((x - a) / (b - a));
  var TIMELINE = { total: 1, step: 0.7, chapters: [] };
  function layoutTimeline(input) {
    const old = TIMELINE.chapters.map((c) => [c.from, c.to]);
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
    const chapters = spans.map((c) => {
      const from = at / total;
      at += c.screens;
      return { id: c.id, from, to: at / total, screens: c.screens, items: c.items, run: [c.runA / c.screens, c.runB / c.screens] };
    });
    Object.assign(TIMELINE, { total, step, chapters });
    return (p) => {
      if (old.length !== chapters.length) return p;
      const i = old.findIndex(([a2, b2]) => p >= a2 && p <= b2);
      if (i < 0) return p;
      const [a, b] = old[i];
      const c = chapters[i];
      return c.from + (p - a) / Math.max(1e-6, b - a) * (c.to - c.from);
    };
  }
  function chapterAt(p) {
    const list = TIMELINE.chapters;
    let i = list.findIndex((c2) => p < c2.to);
    if (i < 0) i = list.length - 1;
    const c = list[i];
    return { index: i, chapter: c, local: clamp01((p - c.from) / Math.max(1e-6, c.to - c.from)) };
  }
  var dwell = (x, k = 0.5) => {
    const i = Math.floor(x);
    const f = x - i;
    return i + f - k / (2 * Math.PI) * Math.sin(2 * Math.PI * f);
  };

  // items/scroll-chapter-timeline/variants/ts/storyScroll.ts
  var story = () => document.querySelector(".story");
  var probe = null;
  var cached = 0;
  function viewH() {
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
  var listeners = /* @__PURE__ */ new Set();
  var onTimeline = (cb) => {
    listeners.add(cb);
  };
  var viewport = /* @__PURE__ */ new Set();
  var onViewport = (cb) => {
    viewport.add(cb);
  };
  var lastW = innerWidth;
  var lastH = 0;
  var recheck = () => {
    cached = 0;
    const w = innerWidth, h = viewH();
    if (w === lastW && Math.abs(h - lastH) < 2) return;
    lastW = w;
    lastH = h;
    viewport.forEach((cb) => cb());
  };
  addEventListener("resize", recheck);
  addEventListener("orientationchange", recheck);
  var leadPx = (top) => Math.min(top, viewH() * (innerWidth <= 900 ? 0.4 : 1));
  function storyBounds() {
    const el = story();
    if (!el) return { start: 0, end: 1 };
    const top = el.offsetTop;
    return { start: Math.max(0, top - leadPx(top)), end: top + el.offsetHeight - viewH() };
  }
  function topFor(p) {
    const b = storyBounds();
    return p <= 0 ? 0 : b.start + (b.end - b.start) * p;
  }
  function progressNow() {
    const b = storyBounds();
    return Math.min(1, Math.max(0, (scrollY - b.start) / Math.max(1, b.end - b.start)));
  }
  var lastKey = "";
  function applyTimeline(input) {
    const el = story();
    if (!el) return;
    const lead = leadPx(el.offsetTop) / Math.max(1, viewH());
    const key = `${JSON.stringify(input)}|${lead.toFixed(2)}`;
    if (key === lastKey) return;
    lastKey = key;
    const before = progressNow();
    const moved = scrollY > storyBounds().start + 2;
    const remap = layoutTimeline(input);
    el.style.height = `${((TIMELINE.total + 1 - lead) * 100).toFixed(1)}vh`;
    if (moved) scrollTo({ top: topFor(remap(before)), behavior: "instant" });
    listeners.forEach((cb) => cb());
  }

  // items/scroll-chapter-timeline/variants/ts/main.ts
  var reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var $ = (sel) => document.querySelector(sel);
  var pad = (n) => String(n).padStart(2, "0");
  var ease = (x) => x * x * (3 - 2 * x);
  var CASES = ["Onboarding", "Search", "Checkout", "Settings", "Reports", "Inbox", "Billing", "Profile", "Help"];
  var NOTES = ["Three screens instead of nine", "Search that forgives typos", "A settings page people finish", "Reports that open in a second"];
  var strip = $(".strip");
  var reel = $(".reel");
  var map = $(".map");
  var head = $(".map-head");
  var barFill = $(".bar i");
  var barTicks = $(".bar-ticks");
  var now = $("[data-now]");
  var of = $("[data-of]");
  var count = $("[data-n]");
  var readout = $(".readout");
  var caseBar = $(".case-bar i");
  var panels = [...document.querySelectorAll(".ch")];
  var cases = 5;
  var cards = [];
  var rows = [];
  var spacing = 360;
  var rowH = 64;
  var written = /* @__PURE__ */ new Map();
  var put = (el, css) => {
    if (written.get(el) === css) return;
    written.set(el, css);
    el.style.cssText = css;
  };
  function build() {
    strip.innerHTML = Array.from({ length: cases }, (_, i) => `<article class="card" data-h="${(150 + i * 38) % 360}" style="--h:${(150 + i * 38) % 360}"><span class="card-n">Case ${pad(i + 1)}</span><b>${CASES[i % CASES.length]}</b></article>`).join("");
    cards = [...strip.querySelectorAll(".card")];
    reel.innerHTML = NOTES.map((t, i) => `<p class="row"><span>${pad(i + 1)}</span>${t}</p>`).join("");
    rows = [...reel.querySelectorAll(".row")];
    written.clear();
    count.textContent = String(cases);
    of.textContent = pad(cases);
  }
  function layout() {
    const w = cards[0]?.offsetWidth ?? 300;
    const gap = Math.min(44, Math.max(22, innerWidth * 0.024));
    spacing = w + gap;
    rowH = rows[0]?.offsetHeight ?? 64;
    const step = spacing * 1.3 / Math.max(1, viewH());
    applyTimeline({
      narrow: innerWidth <= 900,
      step,
      chapters: [
        { id: "Intro", screens: 1.4 },
        { id: "Cases", items: cases, lead: 0.5, tail: 0.4 },
        { id: "Notes", items: NOTES.length, lead: 0.4, tail: 0.3 },
        { id: "End", screens: 1.1 }
      ]
    });
    frame();
  }
  function drawMap() {
    map.innerHTML = TIMELINE.chapters.map((c, i) => {
      const ticks = c.items ? Array.from({ length: c.items }, (_, j) => `<i style="left:${((c.run[0] + (c.run[1] - c.run[0]) * (j / Math.max(1, c.items - 1))) * 100).toFixed(2)}%"></i>`).join("") : "";
      return `<button type="button" class="seg" data-i="${i}" style="flex-grow:${c.screens.toFixed(3)}"><span class="seg-l">${c.id}</span><span class="seg-v">${c.screens.toFixed(1)}</span>${ticks}</button>`;
    }).join("") + `<span class="playhead"></span>`;
    barTicks.innerHTML = TIMELINE.chapters.slice(1).map((c) => `<i style="top:${(c.from * 100).toFixed(2)}%"></i>`).join("");
    head.textContent = `${TIMELINE.total.toFixed(1)} screens \xB7 step ${TIMELINE.step.toFixed(2)}`;
    written.clear();
  }
  var raf = 0;
  function frame() {
    raf = 0;
    const p = progressNow();
    put(barFill, `transform:scaleY(${p.toFixed(4)})`);
    const playhead = map.querySelector(".playhead");
    if (playhead) put(playhead, `left:${(p * 100).toFixed(2)}%`);
    const { index, local } = chapterAt(p);
    TIMELINE.chapters.forEach((c, i) => {
      const panel = panels[i];
      if (!panel) return;
      const l = Math.min(1, Math.max(0, (p - c.from) / (c.to - c.from)));
      const inside = p >= c.from - 0.02 && p <= c.to + 0.02;
      const o = inside ? Math.min(c.from === 0 ? 1 : ramp(l, 0, 0.08), c.to >= 1 ? 1 : 1 - ramp(l, 0.92, 1)) : 0;
      put(panel, `opacity:${o.toFixed(3)};visibility:${o > 1e-3 ? "visible" : "hidden"}`);
      if (c.id === "Cases" && o > 0) {
        const e = ease(ramp(l, 0, c.run[0]));
        const run = ramp(l, c.run[0], c.run[1]) * (cases - 1);
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
    const card = TIMELINE.chapters[index]?.items ? ` \xB7 item ${pad(Math.round(ramp(local, TIMELINE.chapters[index].run[0], TIMELINE.chapters[index].run[1]) * (TIMELINE.chapters[index].items - 1)) + 1)}` : "";
    const text = `p ${p.toFixed(3)} \xB7 ${TIMELINE.chapters[index]?.id ?? ""} ${(local * 100).toFixed(0)}%${card} \xB7 story ${$(".story").style.height}`;
    if (readout.textContent !== text) readout.textContent = text;
  }
  addEventListener("scroll", () => {
    if (!raf) raf = requestAnimationFrame(frame);
  }, { passive: true });
  onViewport(layout);
  onTimeline(() => {
    drawMap();
    frame();
  });
  $("[data-less]").addEventListener("click", () => {
    if (cases > 2) {
      cases--;
      build();
      layout();
    }
  });
  $("[data-more]").addEventListener("click", () => {
    if (cases < 9) {
      cases++;
      build();
      layout();
    }
  });
  map.addEventListener("click", (e) => {
    const seg = e.target.closest(".seg");
    if (!seg) return;
    const c = TIMELINE.chapters[Number(seg.dataset.i)];
    scrollTo({ top: topFor(c.from + (c.items ? c.run[0] * (c.to - c.from) : 0) + 1e-3), behavior: reduced ? "instant" : "smooth" });
  });
  $("[data-top]").addEventListener("click", () => scrollTo({ top: 0, behavior: reduced ? "instant" : "smooth" }));
  build();
  layout();
  document.fonts?.ready.then(layout);
})();
