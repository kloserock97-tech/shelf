// items/case-card-stack/variants/ts/cardStack.ts
var clamp = (v, a, b) => Math.min(b, Math.max(a, v));
var pad2 = (n) => String(n).padStart(2, "0");
var esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
var chevron = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5 8 12l7 7"/></svg>`;
var headOf = (s) => {
  const i = s.indexOf(":");
  return i > 12 ? s.slice(0, i) : s;
};
var dwell = (x, k = 0.5) => {
  const i = Math.floor(x);
  const f = x - i;
  return i + f - k / (2 * Math.PI) * Math.sin(2 * Math.PI * f);
};
function createCardStack(root2, opts) {
  const reduced2 = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const list = opts.cases;
  const n = list.length;
  const L = { caption: "Case studies", open: "Open", prev: "Previous case", next: "Next case", facts: ["Project:", "Where and when:", "Platform:", "Result:"], ...opts.labels };
  root2.dataset.preview = "card";
  const box = document.createElement("div");
  box.className = "cx";
  box.innerHTML = `
    <i class="cx-shade" aria-hidden="true"></i>
    <nav class="cx-list" aria-label="${esc(L.caption)}">
      <p class="cx-cap"><span>${esc(L.caption)}</span> <sup>${pad2(n)}</sup></p>
      <ol>${list.map((c, i) => `<li><a class="cx-li" href="#${esc(c.id)}" data-i="${i}"><i class="cx-dot" aria-hidden="true"></i><span>${esc(c.title)}</span></a></li>`).join("")}</ol>
    </nav>
    <div class="cx-center">
      <div class="cx-stack">
        ${list.map((c, i) => `<a class="cx-card" href="#${esc(c.id)}" data-i="${i}" tabindex="-1" aria-hidden="true" aria-label="${esc(`${L.open}: ${c.title}`)}"
          style="--s1:${c.look.stage[0]};--s2:${c.look.stage[1]};--ink:${c.look.ink};--accent:${c.look.accent}">
          <span class="cx-media cx-media--obj"><picture class="cx-obj"><img src="${esc(c.object.src)}" alt="" width="900" height="${Math.round(900 / c.object.ratio)}" decoding="async" draggable="false"></picture></span></a>`).join("")}
        <span class="cx-cursor" aria-hidden="true"><i></i><span class="cx-cursor-l">${esc(L.open)}</span></span>
      </div>
    </div>
    <h3 class="cx-title" aria-live="polite"></h3>
    <dl class="cx-facts"></dl>
    <p class="cx-seg" aria-hidden="true">${list.map(() => "<i></i>").join("")}</p>
    <div class="cx-steps">
      <button type="button" class="cx-step" data-d="-1" aria-label="${esc(L.prev)}">${chevron}</button>
      <button type="button" class="cx-step cx-step--next" data-d="1" aria-label="${esc(L.next)}">${chevron}</button>
    </div>`;
  root2.appendChild(box);
  const q = (sel) => box.querySelector(sel);
  const cards = [...box.querySelectorAll(".cx-card")];
  const items = [...box.querySelectorAll(".cx-li")];
  const segs = [...box.querySelectorAll(".cx-seg i")];
  const steps = [...box.querySelectorAll(".cx-step")];
  const title = q(".cx-title"), facts = q(".cx-facts"), stack2 = q(".cx-stack"), cursor = q(".cx-cursor");
  let cur = 0;
  const goTo = (i) => opts.goTo(clamp(i, 0, n - 1));
  items.forEach((a, i) => a.addEventListener("click", (e) => {
    e.preventDefault();
    if (i !== cur) goTo(i);
  }));
  cards.forEach((a, i) => a.addEventListener("click", (e) => {
    if (opts.onOpen) {
      e.preventDefault();
      opts.onOpen(i);
    }
  }));
  steps.forEach((b) => b.addEventListener("click", () => goTo(cur + Number(b.dataset.d))));
  const fine = matchMedia("(hover: hover) and (pointer: fine)");
  stack2.addEventListener("pointermove", (e) => {
    if (!fine.matches || e.pointerType !== "mouse") return;
    const r = stack2.getBoundingClientRect();
    cursor.style.translate = `${(e.clientX - r.left).toFixed(1)}px ${(e.clientY - r.top).toFixed(1)}px`;
    stack2.classList.add("is-hover");
  });
  stack2.addEventListener("pointerleave", () => stack2.classList.remove("is-hover"));
  const letters = (s) => s.toUpperCase().split(" ").map((w) => `<span class="cx-w">${[...w].map((ch, k) => `<span class="cx-c" style="--k:${k}">${esc(ch)}</span>`).join("")}</span>`).join(" ");
  const fitTitle = () => {
    title.style.fontSize = "";
    const max = title.clientWidth || 1;
    const widest = Math.max(1, ...[...title.querySelectorAll(".cx-w")].map((w) => w.scrollWidth));
    if (widest > max) title.style.fontSize = `${(parseFloat(getComputedStyle(title).fontSize) * (max / widest) * 0.98).toFixed(1)}px`;
  };
  const stackTitle = () => {
    if (!root2.classList.contains("is-narrow")) {
      title.style.bottom = "";
      return;
    }
    title.style.bottom = `${(box.clientHeight - facts.offsetTop + 14).toFixed(0)}px`;
  };
  void document.fonts?.ready.then(fitTitle);
  let shown = -1;
  let swapTimer = 0;
  const put = (i) => {
    const c = list[i];
    title.innerHTML = letters(c.title);
    fitTitle();
    const rows = [
      [L.facts[0], headOf(c.subtitle)],
      [L.facts[1], c.tag],
      [L.facts[2], c.platform],
      [L.facts[3], `${c.stat.value} \u2014 ${c.stat.label}`]
    ];
    facts.innerHTML = rows.map(([a, b], k) => `<div style="--k:${k}"><dt>${esc(a)}</dt><dd>${esc(b)}</dd></div>`).join("");
    stackTitle();
    box.classList.remove("is-in");
    if (reduced2) {
      box.classList.add("is-in");
      return;
    }
    requestAnimationFrame(() => requestAnimationFrame(() => box.classList.add("is-in")));
  };
  const paint = (i) => {
    if (i === shown) return;
    const first = shown < 0;
    shown = i;
    clearTimeout(swapTimer);
    if (first || reduced2) {
      put(i);
      return;
    }
    box.classList.add("is-out");
    swapTimer = window.setTimeout(() => {
      box.classList.remove("is-out");
      put(i);
    }, 160);
  };
  const drum = (pos2) => {
    cards.forEach((el, i) => {
      const d = i - pos2, ad = Math.abs(d);
      el.classList.toggle("is-far", ad > 1);
      el.classList.toggle("is-cur", ad < 0.5);
      if (ad > 1) return;
      el.style.opacity = clamp(1 - ad * 1.8, 0, 1).toFixed(3);
      el.style.transform = reduced2 ? "none" : `translate3d(${(d * 14).toFixed(2)}%, 0, 0) scale(${(1 - ad * 0.08).toFixed(3)}) rotate(${(d * 3).toFixed(2)}deg)`;
      el.tabIndex = ad < 0.5 ? 0 : -1;
      el.setAttribute("aria-hidden", String(ad >= 0.5));
    });
  };
  let pos = 0, target = 0, raf = 0, last = 0;
  const spin = (now) => {
    raf = 0;
    const dt = Math.min(0.05, (now - last) / 1e3);
    last = now;
    pos += (target - pos) * (1 - Math.exp(-dt * 11));
    if (Math.abs(target - pos) < 2e-3) pos = target;
    else raf = requestAnimationFrame(spin);
    drum(pos);
  };
  const turnTo = (i) => {
    target = i;
    if (reduced2) {
      pos = i;
      drum(pos);
      return;
    }
    if (!raf) {
      last = performance.now();
      raf = requestAnimationFrame(spin);
    }
  };
  const set = (run2) => {
    const idx = clamp(Math.round(reduced2 ? run2 : dwell(run2)), 0, n - 1);
    if (idx === cur && shown >= 0) return;
    cur = idx;
    items.forEach((a, i) => {
      a.classList.toggle("is-on", i === cur);
      a.setAttribute("aria-current", i === cur ? "true" : "false");
    });
    segs.forEach((s, i) => s.classList.toggle("is-on", i === cur));
    steps[0].disabled = cur <= 0;
    steps[1].disabled = cur >= n - 1;
    paint(idx);
    turnTo(idx);
  };
  addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    goTo(cur + (e.key === "ArrowRight" ? 1 : -1));
  });
  let tx = 0, ty = 0, tSwipe = false;
  root2.addEventListener("touchstart", (ev) => {
    const t = ev.changedTouches[0];
    tSwipe = !!t && ev.touches.length === 1;
    if (t) {
      tx = t.clientX;
      ty = t.clientY;
    }
  }, { passive: true });
  root2.addEventListener("touchend", (ev) => {
    const t = ev.changedTouches[0];
    if (!tSwipe || !t) return;
    tSwipe = false;
    const dx = t.clientX - tx, dy = t.clientY - ty;
    if (Math.abs(dx) > 34 && Math.abs(dx) > Math.abs(dy) * 1.2) goTo(cur + (dx < 0 ? 1 : -1));
  }, { passive: true });
  const layout2 = () => {
    root2.classList.toggle("is-narrow", matchMedia("(max-width: 900px), (pointer: coarse) and (max-width: 1100px)").matches);
    fitTitle();
    stackTitle();
  };
  addEventListener("resize", () => requestAnimationFrame(layout2));
  layout2();
  drum(0);
  set(0);
  return { set, layout: layout2 };
}

// items/case-card-stack/variants/ts/main.ts
var CASES = [
  { id: "harbor", title: "Harbor", subtitle: "A neighbourhood noticeboard people actually read", tag: "Web platform \xB7 2024", platform: "Web", stat: { value: "3\xD7", label: "more replies per post" }, look: { stage: ["#fcefe6", "#f6d9c6"], ink: "#3a1d12", accent: "#d9603b" }, object: { src: "objects/harbor.webp", ratio: 900 / 547 } },
  { id: "lumen", title: "Lumen", subtitle: "Alert rules without a single spreadsheet", tag: "Analytics \xB7 2025", platform: "Web", stat: { value: "\u221240 %", label: "time to set up an alert" }, look: { stage: ["#edf6f0", "#d2e8da"], ink: "#12281c", accent: "#1f8a4c" }, object: { src: "objects/lumen.webp", ratio: 900 / 731 } },
  { id: "northwind", title: "Northwind", subtitle: "An assistant that drafts the next step for you", tag: "AI assistant \xB7 2026", platform: "Web", stat: { value: "12", label: "flows shipped in the first month" }, look: { stage: ["#eef3fb", "#d3e1f6"], ink: "#14213d", accent: "#2f5fd0" }, object: { src: "objects/northwind.webp", ratio: 888 / 851 } },
  { id: "meridian", title: "Meridian", subtitle: "A review queue with fewer clicks per item", tag: "B2B dashboard \xB7 2024", platform: "Web", stat: { value: "\u221235 %", label: "steps per review" }, look: { stage: ["#f1eef9", "#dbd3ee"], ink: "#231a3a", accent: "#6b55c9" }, object: { src: "objects/meridian.webp", ratio: 900 / 773 } },
  { id: "atlas", title: "Atlas", subtitle: "First-run setup that ends in a working app", tag: "iOS \xB7 Android \xB7 2023", platform: "Mobile", stat: { value: "+22 %", label: "finish the setup" }, look: { stage: ["#e9f4f7", "#cbe3ea"], ink: "#0f2a31", accent: "#15899d" }, object: { src: "objects/atlas.webp", ratio: 900 / 698 } },
  { id: "quarry", title: "Quarry", subtitle: "Site inspections that work without a signal", tag: "Field app \xB7 2025", platform: "Mobile", stat: { value: "2 min", label: "to file a report" }, look: { stage: ["#f6f1e7", "#e7dcc6"], ink: "#2a2318", accent: "#a9752b" }, object: { src: "objects/quarry.webp", ratio: 900 / 1156 } }
];
var STEP = 0.7;
var reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
var root = document.querySelector(".cases");
var spacer = document.querySelector(".spacer");
var toast = document.querySelector(".toast");
var stepPx = () => innerHeight * STEP;
var run = () => Math.min(CASES.length - 1, Math.max(0, scrollY / stepPx()));
var toastTimer = 0;
var stack = createCardStack(root, {
  cases: CASES,
  goTo: (i) => scrollTo({ top: i * stepPx(), behavior: reduced ? "instant" : "smooth" }),
  onOpen: (i) => {
    toast.textContent = `Open \u201C${CASES[i].title}\u201D`;
    toast.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("is-on"), 1600);
  }
});
addEventListener("scroll", () => stack.set(run()), { passive: true });
var layout = () => {
  spacer.style.height = `${(innerHeight + (CASES.length - 1) * stepPx()).toFixed(0)}px`;
  stack.set(run());
};
addEventListener("resize", () => requestAnimationFrame(layout));
layout();
