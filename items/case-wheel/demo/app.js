// items/case-wheel/variants/ts/casesWheel.ts
var clamp = (v, a, b) => Math.min(b, Math.max(a, v));
var pad = (n) => String(n).padStart(2, "0");
var esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
var chevron = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5 8 12l7 7"/></svg>`;
var goArrow = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7"/><path d="M8.5 7H17v8.5"/></svg>`;
var dwell = (x, k = 0.5) => {
  const i = Math.floor(x);
  const f = x - i;
  return i + f - k / (2 * Math.PI) * Math.sin(2 * Math.PI * f);
};
var lookVars = (c) => `--s1:${c.look.stage[0]};--s2:${c.look.stage[1]};--ink:${c.look.ink};--accent:${c.look.accent}`;
function createCaseWheel(root2, opts) {
  const reduced2 = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const list = opts.cases;
  const n = list.length;
  const L = { cta: "View case", prev: "Previous case", next: "Next case", nav: "Case studies", ...opts.labels };
  const href = (c) => esc(opts.href?.(c) ?? `#${c.id}`);
  root2.dataset.mode = "wheel";
  const wrap = document.createElement("div");
  wrap.className = "cw";
  wrap.innerHTML = `
    <div class="cw-preview">
      <div class="cw-stage">
        <div class="cw-objs">${list.map((c) => `<div class="cw-objbox" style="${lookVars(c)}"><picture class="cw-obj" aria-hidden="true"><img src="${esc(c.object.src)}" alt="" width="900" height="${Math.round(900 / c.object.ratio)}" decoding="async" draggable="false"></picture></div>`).join("")}</div>
      </div>
      <div class="cw-info" aria-live="polite">
        <p class="cw-tag"></p>
        <p class="cw-sub"></p>
        <p class="cw-fact"><b></b><span></span></p>
        <a class="cw-open" href="#"><span class="cw-open-l"></span>${goArrow}</a>
      </div>
    </div>
    <nav class="cw-wheel" aria-label="${esc(L.nav)}">
      <svg class="cw-arc" aria-hidden="true"><circle class="cw-ring"/><g class="cw-ticks"></g></svg>
      <i class="cw-needle" aria-hidden="true"></i>
      <ol class="cw-list">${list.map((c, i) => `<li><a class="cw-item" href="${href(c)}" data-i="${i}" aria-label="${esc(`${c.title}. ${c.subtitle}`)}"><span class="cw-n">${pad(i + 1)}</span><span class="cw-t">${esc(c.title)}</span></a></li>`).join("")}</ol>
    </nav>
    <div class="cw-steps">
      <button type="button" class="cw-step" data-d="-1" aria-label="${esc(L.prev)}">${chevron}</button>
      <button type="button" class="cw-step cw-step--next" data-d="1" aria-label="${esc(L.next)}">${chevron}</button>
    </div>`;
  root2.appendChild(wrap);
  const stage = wrap.querySelector(".cw-stage");
  const objs = [...wrap.querySelectorAll(".cw-objbox")];
  const items = [...wrap.querySelectorAll(".cw-item")];
  const info = wrap.querySelector(".cw-info");
  const open = info.querySelector(".cw-open");
  const wheel2 = wrap.querySelector(".cw-wheel");
  const ticks = wrap.querySelector(".cw-ticks");
  const ring = wrap.querySelector(".cw-ring");
  const steps = [...wrap.querySelectorAll(".cw-step")];
  let current = -1;
  let shown = false;
  const paintSteps = () => {
    steps[0].disabled = current <= 0;
    steps[1].disabled = current >= n - 1;
  };
  const paintInfo = (i, animate) => {
    const c = list[i];
    const put = () => {
      info.style.cssText = lookVars(c);
      info.querySelector(".cw-tag").textContent = `${pad(i + 1)} \xB7 ${c.tag}`;
      info.querySelector(".cw-sub").textContent = c.subtitle;
      info.querySelector(".cw-fact b").textContent = c.stat.value;
      info.querySelector(".cw-fact span").textContent = c.stat.label;
      info.querySelector(".cw-open-l").textContent = L.cta;
      open.href = opts.href?.(c) ?? `#${c.id}`;
    };
    if (!animate || reduced2) {
      put();
      return;
    }
    info.classList.add("is-out");
    window.setTimeout(() => {
      put();
      info.classList.remove("is-out");
      info.classList.add("is-in");
      requestAnimationFrame(() => requestAnimationFrame(() => info.classList.remove("is-in")));
    }, 170);
  };
  paintInfo(0, false);
  let narrow = false;
  let R = 480;
  let step = 17;
  const measure = () => {
    narrow = matchMedia("(max-width: 900px), (pointer: coarse) and (max-width: 1100px)").matches;
    root2.classList.toggle("is-narrow", narrow);
    const r = wheel2.getBoundingClientRect();
    if (narrow) {
      R = clamp(innerWidth * 1.15, 380, 760);
      step = clamp(Math.asin(Math.min(0.9, innerWidth * 0.62 / R)) * 180 / Math.PI, 22, 40);
      wheel2.style.setProperty("--cx", `${(r.width / 2).toFixed(1)}px`);
      wheel2.style.setProperty("--cy", `${(R + 30).toFixed(1)}px`);
    } else {
      R = clamp(innerHeight * 0.68, 420, 760);
      step = 18.5;
      wheel2.style.setProperty("--cx", `${(R + 64).toFixed(1)}px`);
      wheel2.style.setProperty("--cy", `${(r.height / 2).toFixed(1)}px`);
    }
    wheel2.style.setProperty("--R", `${R.toFixed(1)}px`);
    ring.setAttribute("r", R.toFixed(1));
    ring.setAttribute("cx", "0");
    ring.setAttribute("cy", "0");
  };
  ticks.innerHTML = list.map(() => `<line class="cw-tick" x1="0" y1="0" x2="0" y2="0"/>`).join("");
  const tickEls = [...ticks.querySelectorAll(".cw-tick")];
  let drum = 0, drumTo = 0, drumRaf = 0, drumLast = 0;
  const placeObjects = () => {
    objs.forEach((o, i) => {
      const d = i - drum;
      const ad = Math.abs(d);
      o.classList.toggle("is-far", ad > 1);
      if (ad > 1) return;
      o.style.opacity = clamp(1 - ad * 1.45, 0, 1).toFixed(3);
      o.style.transform = reduced2 ? "none" : `translate3d(${(d * 6).toFixed(2)}%, ${(d * 96).toFixed(2)}%, 0) rotate(${(d * -7).toFixed(2)}deg) scale(${(1 - ad * 0.12).toFixed(3)})`;
    });
  };
  const spin = (now) => {
    drumRaf = 0;
    const dt = Math.min(0.05, (now - drumLast) / 1e3);
    drumLast = now;
    drum += (drumTo - drum) * (1 - Math.exp(-dt * 11));
    if (Math.abs(drumTo - drum) < 2e-3) drum = drumTo;
    else drumRaf = requestAnimationFrame(spin);
    placeObjects();
  };
  const turnTo = (i) => {
    if (drumTo === i && current >= 0) return;
    drumTo = i;
    if (reduced2) {
      drum = i;
      placeObjects();
      return;
    }
    if (!drumRaf) {
      drumLast = performance.now();
      drumRaf = requestAnimationFrame(spin);
    }
  };
  let lastKey = "";
  let lastRun = 0;
  const place = (active, e2) => {
    const key = `${active.toFixed(4)}|${e2.toFixed(3)}|${narrow}`;
    if (key === lastKey) return;
    lastKey = key;
    root2.style.setProperty("--e", e2.toFixed(3));
    items.forEach((a, i) => {
      const d = i - active;
      const ad = Math.abs(d);
      const ang = reduced2 ? Math.round(d) * step : d * step;
      a.style.transform = narrow ? `rotate(${ang.toFixed(2)}deg) translateY(${(-R).toFixed(1)}px)` : `rotate(${(-ang).toFixed(2)}deg) translateX(${(-R).toFixed(1)}px)`;
      a.style.setProperty("--k", clamp(1 - ad, 0, 1).toFixed(3));
      a.style.opacity = clamp(1.12 - ad * 0.46, 0, 1).toFixed(3);
      a.classList.toggle("is-active", ad < 0.5);
      a.tabIndex = shown && ad < 3.2 ? 0 : -1;
      const tk = tickEls[i];
      const rad = ang * Math.PI / 180;
      const ux = narrow ? Math.sin(rad) : -Math.cos(rad);
      const uy = narrow ? -Math.cos(rad) : Math.sin(rad);
      const r0 = R - 6, r1 = R + 6 + clamp(1 - ad, 0, 1) * 12;
      tk.setAttribute("x1", (ux * r0).toFixed(1));
      tk.setAttribute("y1", (uy * r0).toFixed(1));
      tk.setAttribute("x2", (ux * r1).toFixed(1));
      tk.setAttribute("y2", (uy * r1).toFixed(1));
      tk.style.opacity = clamp(1 - ad * 0.28, 0.12, 1).toFixed(2);
    });
    const idx = clamp(Math.round(active), 0, n - 1);
    if (idx !== current) {
      const first = current < 0;
      current = idx;
      paintInfo(idx, !first);
      paintSteps();
      turnTo(idx);
    }
  };
  let lastE = 1;
  const set = (run2, e2 = 1) => {
    shown = true;
    lastRun = run2;
    lastE = e2;
    place(reduced2 ? Math.round(run2) : dwell(run2), e2);
  };
  const goTo = (i) => opts.goTo(clamp(i, 0, n - 1));
  items.forEach((a, i) => {
    a.addEventListener("click", (e2) => {
      if (i !== current) {
        e2.preventDefault();
        goTo(i);
        return;
      }
      if (opts.onOpen) {
        e2.preventDefault();
        opts.onOpen(i);
      }
    });
    a.addEventListener("focus", () => {
      if (a.matches(":focus-visible") && i !== current) goTo(i);
    });
  });
  open.addEventListener("click", (e2) => {
    if (opts.onOpen) {
      e2.preventDefault();
      opts.onOpen(current);
    }
  });
  steps.forEach((b) => b.addEventListener("click", () => goTo(current + Number(b.dataset.d))));
  stage.addEventListener("click", () => opts.onOpen?.(Math.max(0, current)));
  addEventListener("keydown", (e2) => {
    if (!shown || e2.metaKey || e2.ctrlKey || e2.altKey) return;
    if (e2.key !== "ArrowLeft" && e2.key !== "ArrowRight") return;
    const el = document.activeElement;
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el?.isContentEditable) return;
    e2.preventDefault();
    goTo(current + (e2.key === "ArrowRight" ? 1 : -1));
  });
  stage.addEventListener("pointermove", (e2) => {
    if (e2.pointerType !== "mouse" || reduced2) return;
    const r = stage.getBoundingClientRect();
    stage.style.setProperty("--px", ((e2.clientX - r.left) / r.width * 2 - 1).toFixed(3));
    stage.style.setProperty("--py", ((e2.clientY - r.top) / r.height * 2 - 1).toFixed(3));
  });
  stage.addEventListener("pointerleave", () => {
    stage.style.setProperty("--px", "0");
    stage.style.setProperty("--py", "0");
  });
  let mouseY = 0, dragging = false, dragged = 0, runAtDown = 0;
  const DRAG_K = 2.2;
  const FLICK = 0.18;
  addEventListener("pointerdown", (e2) => {
    if (!shown || e2.pointerType !== "mouse" || e2.button !== 0) return;
    if (e2.target.closest?.("a, button, input, textarea")) return;
    mouseY = e2.clientY;
    dragging = true;
    dragged = 0;
    runAtDown = lastRun;
    document.body.classList.add("is-wheel-drag");
  });
  addEventListener("pointermove", (e2) => {
    if (!dragging) return;
    const dy = e2.clientY - mouseY;
    mouseY = e2.clientY;
    dragged += Math.abs(dy);
    opts.dragBy(-dy * DRAG_K);
    e2.preventDefault();
  });
  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove("is-wheel-drag");
    if (dragged <= 6) return;
    const moved = lastRun - runAtDown;
    let to = Math.round(lastRun);
    if (to === Math.round(runAtDown) && Math.abs(moved) > FLICK) to += Math.sign(moved);
    goTo(to);
  };
  addEventListener("pointerup", endDrag);
  addEventListener("pointercancel", endDrag);
  addEventListener("blur", endDrag);
  let tx = 0, ty = 0, tSwipe = false;
  addEventListener("touchstart", (ev) => {
    const t = ev.changedTouches[0];
    if (!shown || !t || ev.touches.length > 1 || !wrap.contains(t.target)) {
      tSwipe = false;
      return;
    }
    tx = t.clientX;
    ty = t.clientY;
    tSwipe = true;
  }, { passive: true });
  addEventListener("touchend", (ev) => {
    const t = ev.changedTouches[0];
    if (!tSwipe || !t) return;
    tSwipe = false;
    const dx = t.clientX - tx, dy = t.clientY - ty;
    if (Math.abs(dx) > 34 && Math.abs(dx) > Math.abs(dy) * 1.2) goTo(current + (dx < 0 ? 1 : -1));
  }, { passive: true });
  addEventListener("touchcancel", () => tSwipe = false, { passive: true });
  const layout2 = () => {
    measure();
    lastKey = "";
    placeObjects();
    set(lastRun, lastE);
  };
  layout2();
  return { set, layout: layout2, current: () => Math.max(0, current) };
}

// items/case-wheel/variants/ts/main.ts
var CASES = [
  { id: "harbor", title: "Harbor", subtitle: "A neighbourhood noticeboard people actually read", tag: "Web platform \xB7 2024", stat: { value: "3\xD7", label: "more replies per post" }, look: { stage: ["#fcefe6", "#f6d9c6"], ink: "#3a1d12", accent: "#d9603b" }, object: { src: "objects/harbor.webp", ratio: 900 / 547 } },
  { id: "lumen", title: "Lumen", subtitle: "Alert rules without a single spreadsheet", tag: "Analytics \xB7 2025", stat: { value: "\u221240 %", label: "time to set up an alert" }, look: { stage: ["#edf6f0", "#d2e8da"], ink: "#12281c", accent: "#1f8a4c" }, object: { src: "objects/lumen.webp", ratio: 900 / 731 } },
  { id: "northwind", title: "Northwind", subtitle: "An assistant that drafts the next step for you", tag: "AI assistant \xB7 2026", stat: { value: "12", label: "flows shipped in the first month" }, look: { stage: ["#eef3fb", "#d3e1f6"], ink: "#14213d", accent: "#2f5fd0" }, object: { src: "objects/northwind.webp", ratio: 888 / 851 } },
  { id: "meridian", title: "Meridian", subtitle: "A review queue with fewer clicks per item", tag: "B2B dashboard \xB7 2024", stat: { value: "\u221235 %", label: "steps per review" }, look: { stage: ["#f1eef9", "#dbd3ee"], ink: "#231a3a", accent: "#6b55c9" }, object: { src: "objects/meridian.webp", ratio: 900 / 773 } },
  { id: "atlas", title: "Atlas", subtitle: "First-run setup that ends in a working app", tag: "iOS \xB7 Android \xB7 2023", stat: { value: "+22 %", label: "finish the setup" }, look: { stage: ["#e9f4f7", "#cbe3ea"], ink: "#0f2a31", accent: "#15899d" }, object: { src: "objects/atlas.webp", ratio: 900 / 698 } },
  { id: "quarry", title: "Quarry", subtitle: "Site inspections that work without a signal", tag: "Field app \xB7 2025", stat: { value: "2 min", label: "to file a report" }, look: { stage: ["#f6f1e7", "#e7dcc6"], ink: "#2a2318", accent: "#a9752b" }, object: { src: "objects/quarry.webp", ratio: 900 / 1156 } }
];
var STEP = 0.7;
var reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
var root = document.querySelector(".cases");
var spacer = document.querySelector(".spacer");
var toast = document.querySelector(".toast");
root.querySelector(".cases-sup").textContent = String(CASES.length).padStart(2, "0");
var stepPx = () => innerHeight * STEP;
var run = () => Math.min(CASES.length - 1, Math.max(0, scrollY / stepPx()));
var toastTimer = 0;
var wheel = createCaseWheel(root, {
  cases: CASES,
  goTo: (i) => scrollTo({ top: i * stepPx(), behavior: reduced ? "instant" : "smooth" }),
  dragBy: (px) => scrollBy({ top: px, behavior: "instant" }),
  onOpen: (i) => {
    toast.textContent = `Open \u201C${CASES[i].title}\u201D`;
    toast.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("is-on"), 1600);
  }
});
var e = reduced ? 1 : 0;
var t0 = performance.now();
var enter = (now) => {
  const k = Math.min(1, (now - t0) / 1100);
  e = 1 - (1 - k) ** 3;
  wheel.set(run(), e);
  if (k < 1) requestAnimationFrame(enter);
};
if (!reduced) requestAnimationFrame(enter);
addEventListener("scroll", () => wheel.set(run(), e), { passive: true });
var layout = () => {
  spacer.style.height = `${(innerHeight + (CASES.length - 1) * stepPx()).toFixed(0)}px`;
  wheel.layout();
  wheel.set(run(), e);
};
addEventListener("resize", () => requestAnimationFrame(layout));
layout();
