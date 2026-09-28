/* Case wheel: case titles stand on a circle whose centre lies beyond the right edge of the window, so only its
 * left arc is visible and each title runs from the arc towards the centre. The active title sits at "3 o'clock"
 * next to a needle; its neighbours go up and down the arc, shrink and fade. On a phone the same circle lies below
 * the bottom edge: the arc bends upwards and titles follow the tangent.
 *
 * Everything is a function of scroll. The host passes a fractional case number (run); the titles turn with it
 * continuously, like a scale. The objects on the left have a drum of their own: its coordinate catches up with the
 * nearest whole case in ~0.4 s, so between two cases you always see one whole object, never two half-transparent
 * ones. The text under the object changes in steps, when the whole number changes: text that crawls with the scroll
 * is hard to read.
 *
 * A click on an inactive title brings the wheel to it, on the active one opens the case. The wheel also turns with a
 * held mouse button, a sideways swipe, the arrow keys and the two step buttons. */

export type WheelCase = {
  id: string;
  title: string;
  subtitle: string;
  tag: string;
  stat: { value: string; label: string };
  look: { stage: [string, string]; ink: string; accent: string };
  object: { src: string; ratio: number };
};

export type CaseWheel = {
  /** run — fractional case index from the host's scroll (0 … n−1); e — entrance of the whole block, 0…1 */
  set(run: number, e?: number): void;
  layout(): void;
  current(): number;
};

type Options = {
  cases: WheelCase[];
  /** move the host's scroll so that case i is active */
  goTo(i: number): void;
  /** move the host's scroll by px right now (drag with a held mouse button) */
  dragBy(px: number): void;
  /** the active case was clicked again, or its object */
  onOpen?(i: number): void;
  href?(c: WheelCase): string;
  labels?: { cta?: string; prev?: string; next?: string; nav?: string };
};

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const pad = (n: number) => String(n).padStart(2, "0");
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const chevron = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5 8 12l7 7"/></svg>`;
const goArrow = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7"/><path d="M8.5 7H17v8.5"/></svg>`;

/** Steps with a soft stop: near every case the wheel slows down, between cases it goes faster.
 *  The derivative is 1 − k·cos(2πf): at k = 0.5 the speed at a case is half the average, with no stops or jerks. */
export const dwell = (x: number, k = 0.5) => {
  const i = Math.floor(x);
  const f = x - i;
  return i + f - (k / (2 * Math.PI)) * Math.sin(2 * Math.PI * f);
};

const lookVars = (c: WheelCase) => `--s1:${c.look.stage[0]};--s2:${c.look.stage[1]};--ink:${c.look.ink};--accent:${c.look.accent}`;

export function createCaseWheel(root: HTMLElement, opts: Options): CaseWheel {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const list = opts.cases;
  const n = list.length;
  const L = { cta: "View case", prev: "Previous case", next: "Next case", nav: "Case studies", ...opts.labels };
  const href = (c: WheelCase) => esc(opts.href?.(c) ?? `#${c.id}`);
  root.dataset.mode = "wheel";

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
  root.appendChild(wrap);

  const stage = wrap.querySelector<HTMLElement>(".cw-stage")!;
  const objs = [...wrap.querySelectorAll<HTMLElement>(".cw-objbox")];
  const items = [...wrap.querySelectorAll<HTMLAnchorElement>(".cw-item")];
  const info = wrap.querySelector<HTMLElement>(".cw-info")!;
  const open = info.querySelector<HTMLAnchorElement>(".cw-open")!;
  const wheel = wrap.querySelector<HTMLElement>(".cw-wheel")!;
  const ticks = wrap.querySelector<SVGGElement>(".cw-ticks")!;
  const ring = wrap.querySelector<SVGCircleElement>(".cw-ring")!;
  const steps = [...wrap.querySelectorAll<HTMLButtonElement>(".cw-step")];
  let current = -1;
  let shown = false;

  /* previous / next: a mouse may have no wheel, touchpads differ, a swipe on the arc has to be guessed first.
     A button moves exactly one case and dims at the ends, so a step back is as precise as a step forward. */
  const paintSteps = () => {
    steps[0].disabled = current <= 0;
    steps[1].disabled = current >= n - 1;
  };

  const paintInfo = (i: number, animate: boolean) => {
    const c = list[i];
    const put = () => {
      info.style.cssText = lookVars(c);
      info.querySelector(".cw-tag")!.textContent = `${pad(i + 1)} · ${c.tag}`;
      info.querySelector(".cw-sub")!.textContent = c.subtitle;
      info.querySelector(".cw-fact b")!.textContent = c.stat.value;
      info.querySelector(".cw-fact span")!.textContent = c.stat.label;
      info.querySelector(".cw-open-l")!.textContent = L.cta;
      open.href = opts.href?.(c) ?? `#${c.id}`;
    };
    if (!animate || reduced) { put(); return; }
    /* the old text leaves upwards, the new one comes from below: two short beats instead of a crossfade */
    info.classList.add("is-out");
    window.setTimeout(() => {
      put();
      info.classList.remove("is-out");
      info.classList.add("is-in");
      requestAnimationFrame(() => requestAnimationFrame(() => info.classList.remove("is-in")));
    }, 170);
  };
  paintInfo(0, false);

  /* ── geometry ── */
  let narrow = false;
  let R = 480;
  let step = 17; // degrees between neighbouring titles
  const measure = () => {
    narrow = matchMedia("(max-width: 900px), (pointer: coarse) and (max-width: 1100px)").matches;
    root.classList.toggle("is-narrow", narrow);
    const r = wheel.getBoundingClientRect();
    if (narrow) {
      /* the circle below the bottom edge: radius from the window width, so the neighbours peek from the sides */
      R = clamp(innerWidth * 1.15, 380, 760);
      step = clamp((Math.asin(Math.min(0.9, (innerWidth * 0.62) / R)) * 180) / Math.PI, 22, 40);
      wheel.style.setProperty("--cx", `${(r.width / 2).toFixed(1)}px`);
      wheel.style.setProperty("--cy", `${(R + 30).toFixed(1)}px`);
    } else {
      /* A larger radius makes a flatter arc and more room between titles along it (arc length = R · angle);
         the centre is pushed right, so the arc hugs the right edge and frees the middle of the frame. */
      R = clamp(innerHeight * 0.68, 420, 760);
      step = 18.5;
      wheel.style.setProperty("--cx", `${(R + 64).toFixed(1)}px`);
      wheel.style.setProperty("--cy", `${(r.height / 2).toFixed(1)}px`);
    }
    wheel.style.setProperty("--R", `${R.toFixed(1)}px`);
    ring.setAttribute("r", R.toFixed(1));
    ring.setAttribute("cx", "0");
    ring.setAttribute("cy", "0");
  };

  /* a short tick on the arc for every case; they travel with the titles */
  ticks.innerHTML = list.map(() => `<line class="cw-tick" x1="0" y1="0" x2="0" y2="0"/>`).join("");
  const tickEls = [...ticks.querySelectorAll<SVGLineElement>(".cw-tick")];

  /* The object drum. Titles on the arc move with the scroll (they are a scale); an object is a thing: it has to stand
     whole, not melt halfway. So objects have their own coordinate that catches up with the nearest whole case. */
  let drum = 0, drumTo = 0, drumRaf = 0, drumLast = 0;
  const placeObjects = () => {
    objs.forEach((o, i) => {
      const d = i - drum;
      const ad = Math.abs(d);
      /* far objects are hidden by a class: an inline visibility would override hiding the whole block */
      o.classList.toggle("is-far", ad > 1);
      if (ad > 1) return;
      o.style.opacity = clamp(1 - ad * 1.45, 0, 1).toFixed(3);
      o.style.transform = reduced ? "none" : `translate3d(${(d * 6).toFixed(2)}%, ${(d * 96).toFixed(2)}%, 0) rotate(${(d * -7).toFixed(2)}deg) scale(${(1 - ad * 0.12).toFixed(3)})`;
    });
  };
  const spin = (now: number) => {
    drumRaf = 0;
    const dt = Math.min(0.05, (now - drumLast) / 1000);
    drumLast = now;
    drum += (drumTo - drum) * (1 - Math.exp(-dt * 11));
    if (Math.abs(drumTo - drum) < 0.002) drum = drumTo; else drumRaf = requestAnimationFrame(spin);
    placeObjects();
  };
  const turnTo = (i: number) => {
    if (drumTo === i && current >= 0) return;
    drumTo = i;
    if (reduced) { drum = i; placeObjects(); return; }
    if (!drumRaf) { drumLast = performance.now(); drumRaf = requestAnimationFrame(spin); }
  };

  let lastKey = "";
  let lastRun = 0;
  const place = (active: number, e: number) => {
    const key = `${active.toFixed(4)}|${e.toFixed(3)}|${narrow}`;
    if (key === lastKey) return;
    lastKey = key;
    root.style.setProperty("--e", e.toFixed(3));
    items.forEach((a, i) => {
      const d = i - active;
      const ad = Math.abs(d);
      const ang = reduced ? Math.round(d) * step : d * step;
      /* wide screen: next cases below the active one, angle counter-clockwise; phone: next cases to the right */
      a.style.transform = narrow
        ? `rotate(${ang.toFixed(2)}deg) translateY(${(-R).toFixed(1)}px)`
        : `rotate(${(-ang).toFixed(2)}deg) translateX(${(-R).toFixed(1)}px)`;
      a.style.setProperty("--k", clamp(1 - ad, 0, 1).toFixed(3)); // 1 on the active title, 0 on neighbours: size and brightness
      /* the arc is flat and far titles drift right, out of the frame; fade them before they get there */
      a.style.opacity = clamp(1.12 - ad * 0.46, 0, 1).toFixed(3);
      a.classList.toggle("is-active", ad < 0.5);
      a.tabIndex = shown && ad < 3.2 ? 0 : -1;
      /* the tick sits at the same point as the title: a unit vector from the centre to that point */
      const tk = tickEls[i];
      const rad = (ang * Math.PI) / 180;
      const ux = narrow ? Math.sin(rad) : -Math.cos(rad);
      const uy = narrow ? -Math.cos(rad) : Math.sin(rad);
      const r0 = R - 6, r1 = R + 6 + clamp(1 - ad, 0, 1) * 12;
      tk.setAttribute("x1", (ux * r0).toFixed(1)); tk.setAttribute("y1", (uy * r0).toFixed(1));
      tk.setAttribute("x2", (ux * r1).toFixed(1)); tk.setAttribute("y2", (uy * r1).toFixed(1));
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
  const set = (run: number, e = 1) => {
    shown = true;
    lastRun = run;
    lastE = e;
    place(reduced ? Math.round(run) : dwell(run), e);
  };
  const goTo = (i: number) => opts.goTo(clamp(i, 0, n - 1));

  /* a click on a title: inactive — bring the wheel there, active — open the case */
  items.forEach((a, i) => {
    a.addEventListener("click", (e) => {
      if (i !== current) { e.preventDefault(); goTo(i); return; }
      if (opts.onOpen) { e.preventDefault(); opts.onOpen(i); }
    });
    /* keyboard: focus on a title brings the wheel to it */
    a.addEventListener("focus", () => { if (a.matches(":focus-visible") && i !== current) goTo(i); });
  });
  open.addEventListener("click", (e) => { if (opts.onOpen) { e.preventDefault(); opts.onOpen(current); } });
  steps.forEach((b) => b.addEventListener("click", () => goTo(current + Number(b.dataset.d))));
  stage.addEventListener("click", () => opts.onOpen?.(Math.max(0, current)));
  addEventListener("keydown", (e) => {
    if (!shown || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const el = document.activeElement as HTMLElement | null;
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el?.isContentEditable) return;
    e.preventDefault();
    goTo(current + (e.key === "ArrowRight" ? 1 : -1));
  });

  /* the cursor over the stage moves the object layer a little */
  stage.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse" || reduced) return;
    const r = stage.getBoundingClientRect();
    stage.style.setProperty("--px", (((e.clientX - r.left) / r.width) * 2 - 1).toFixed(3));
    stage.style.setProperty("--py", (((e.clientY - r.top) / r.height) * 2 - 1).toFixed(3));
  });
  stage.addEventListener("pointerleave", () => { stage.style.setProperty("--px", "0"); stage.style.setProperty("--py", "0"); });

  /* A held mouse button drags the scroll itself: the scroll drives the wheel anyway, so the drag is exact and not
     a second scroll. On release the wheel settles on the nearest case, otherwise the drum would stop between two. */
  let mouseY = 0, dragging = false, dragged = 0, runAtDown = 0;
  const DRAG_K = 2.2; // scroll px per px of drag: one case in about 280 px of gesture
  const FLICK = 0.18; // a jerk shorter than this share of a case is a tremor, longer — an intent to move on
  addEventListener("pointerdown", (e) => {
    if (!shown || e.pointerType !== "mouse" || e.button !== 0) return;
    if ((e.target as Element).closest?.("a, button, input, textarea")) return;
    mouseY = e.clientY; dragging = true; dragged = 0; runAtDown = lastRun;
    document.body.classList.add("is-wheel-drag");
  });
  addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dy = e.clientY - mouseY;
    mouseY = e.clientY;
    dragged += Math.abs(dy);
    opts.dragBy(-dy * DRAG_K);
    e.preventDefault();
  });
  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove("is-wheel-drag");
    if (dragged <= 6) return; // a tremor, not a gesture
    /* usually the nearest case; but if that is where the drag began and the pull was noticeable, count a step
       in the pull's direction: nobody drags only to come back */
    const moved = lastRun - runAtDown;
    let to = Math.round(lastRun);
    if (to === Math.round(runAtDown) && Math.abs(moved) > FLICK) to += Math.sign(moved);
    goTo(to);
  };
  addEventListener("pointerup", endDrag);
  addEventListener("pointercancel", endDrag);
  addEventListener("blur", endDrag);

  /* A swipe anywhere on the block, not only on the arc. Touches, not pointers: during a gesture the browser may
     hand the pointer over to a child, and "up" never reaches the wrapper — touchend always does. */
  let tx = 0, ty = 0, tSwipe = false;
  addEventListener("touchstart", (ev) => {
    const t = ev.changedTouches[0];
    if (!shown || !t || ev.touches.length > 1 || !wrap.contains(t.target as Node)) { tSwipe = false; return; }
    tx = t.clientX; ty = t.clientY; tSwipe = true;
  }, { passive: true });
  addEventListener("touchend", (ev) => {
    const t = ev.changedTouches[0];
    if (!tSwipe || !t) return;
    tSwipe = false;
    const dx = t.clientX - tx, dy = t.clientY - ty;
    if (Math.abs(dx) > 34 && Math.abs(dx) > Math.abs(dy) * 1.2) goTo(current + (dx < 0 ? 1 : -1));
  }, { passive: true });
  addEventListener("touchcancel", () => (tSwipe = false), { passive: true });

  const layout = () => {
    measure();
    lastKey = "";
    placeObjects();
    set(lastRun, lastE);
  };
  layout();
  return { set, layout, current: () => Math.max(0, current) };
}
