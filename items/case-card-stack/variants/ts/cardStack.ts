/* Case card stack: a full-screen scene. On the left a column of case titles with a dot at the current one, in the
 * middle a squircle card with the case object, bottom left a huge condensed title, bottom right a table of facts
 * with thin dividers.
 *
 * The scroll drives the case (the host passes a fractional number). Cards lie in a stack and change by a fractional
 * position: the leaving card slides left and fades, the coming one enters from the right. That position is a drum of
 * its own which catches up with the nearest whole case, so a card never stops half-faded.
 * The title assembles letter by letter from below, fact rows come in a staircase (ease-out with a sharp start,
 * 0.5–0.6 s in, 0.16 s out, 18–40 ms per element). Only the card opens the case — over it the cursor becomes an
 * "Open" circle; a title in the list only switches the case. */

export type StackCase = {
  id: string;
  title: string;
  subtitle: string;
  tag: string;
  platform: string;
  stat: { value: string; label: string };
  look: { stage: [string, string]; ink: string; accent: string };
  object: { src: string; ratio: number };
};

export type CardStack = {
  /** run — fractional case index from the host's scroll */
  set(run: number): void;
  layout(): void;
};

type Options = {
  cases: StackCase[];
  goTo(i: number): void;
  onOpen?(i: number): void;
  labels?: { caption?: string; open?: string; prev?: string; next?: string; facts?: [string, string, string, string] };
};

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const pad2 = (n: number) => String(n).padStart(2, "0");
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const chevron = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5 8 12l7 7"/></svg>`;
/** the subtitle without the tail after a colon — the tail retells the result figure, which has its own row */
const headOf = (s: string) => { const i = s.indexOf(":"); return i > 12 ? s.slice(0, i) : s; };
/** a soft stop at every case (same as the case wheel) */
const dwell = (x: number, k = 0.5) => { const i = Math.floor(x); const f = x - i; return i + f - (k / (2 * Math.PI)) * Math.sin(2 * Math.PI * f); };

export function createCardStack(root: HTMLElement, opts: Options): CardStack {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const list = opts.cases;
  const n = list.length;
  const L = { caption: "Case studies", open: "Open", prev: "Previous case", next: "Next case", facts: ["Project:", "Where and when:", "Platform:", "Result:"] as [string, string, string, string], ...opts.labels };
  root.dataset.preview = "card";

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
  root.appendChild(box);

  const q = <T extends HTMLElement = HTMLElement>(sel: string) => box.querySelector<T>(sel)!;
  const cards = [...box.querySelectorAll<HTMLAnchorElement>(".cx-card")];
  const items = [...box.querySelectorAll<HTMLAnchorElement>(".cx-li")];
  const segs = [...box.querySelectorAll<HTMLElement>(".cx-seg i")];
  const steps = [...box.querySelectorAll<HTMLButtonElement>(".cx-step")];
  const title = q(".cx-title"), facts = q(".cx-facts"), stack = q(".cx-stack"), cursor = q(".cx-cursor");

  let cur = 0;
  const goTo = (i: number) => opts.goTo(clamp(i, 0, n - 1));
  items.forEach((a, i) => a.addEventListener("click", (e) => { e.preventDefault(); if (i !== cur) goTo(i); }));
  cards.forEach((a, i) => a.addEventListener("click", (e) => { if (opts.onOpen) { e.preventDefault(); opts.onOpen(i); } }));
  steps.forEach((b) => b.addEventListener("click", () => goTo(cur + Number(b.dataset.d))));

  /* over the card the cursor becomes an "Open" circle — only where there is a mouse */
  const fine = matchMedia("(hover: hover) and (pointer: fine)");
  stack.addEventListener("pointermove", (e) => {
    if (!fine.matches || e.pointerType !== "mouse") return;
    const r = stack.getBoundingClientRect();
    cursor.style.translate = `${(e.clientX - r.left).toFixed(1)}px ${(e.clientY - r.top).toFixed(1)}px`;
    stack.classList.add("is-hover");
  });
  stack.addEventListener("pointerleave", () => stack.classList.remove("is-hover"));

  /* the title letter by letter: every word in its own mask, letters come from below 18 ms apart */
  const letters = (s: string) =>
    s.toUpperCase().split(" ").map((w) => `<span class="cx-w">${[...w].map((ch, k) => `<span class="cx-c" style="--k:${k}">${esc(ch)}</span>`).join("")}</span>`).join(" ");
  /* the size fits the widest word into the given width: words never break. The CSS size is the ceiling */
  const fitTitle = () => {
    title.style.fontSize = "";
    const max = title.clientWidth || 1;
    const widest = Math.max(1, ...[...title.querySelectorAll<HTMLElement>(".cx-w")].map((w) => w.scrollWidth));
    if (widest > max) title.style.fontSize = `${(parseFloat(getComputedStyle(title).fontSize) * (max / widest) * 0.98).toFixed(1)}px`;
  };
  /* on a phone the facts may take two lines: the title stands on their top instead of a fixed height */
  const stackTitle = () => {
    if (!root.classList.contains("is-narrow")) { title.style.bottom = ""; return; }
    title.style.bottom = `${(box.clientHeight - facts.offsetTop + 14).toFixed(0)}px`;
  };
  void document.fonts?.ready.then(fitTitle);

  let shown = -1;
  let swapTimer = 0;
  const put = (i: number) => {
    const c = list[i];
    title.innerHTML = letters(c.title);
    fitTitle();
    const rows: [string, string][] = [
      [L.facts[0], headOf(c.subtitle)],
      [L.facts[1], c.tag],
      [L.facts[2], c.platform],
      [L.facts[3], `${c.stat.value} — ${c.stat.label}`],
    ];
    facts.innerHTML = rows.map(([a, b], k) => `<div style="--k:${k}"><dt>${esc(a)}</dt><dd>${esc(b)}</dd></div>`).join("");
    stackTitle();
    box.classList.remove("is-in");
    if (reduced) { box.classList.add("is-in"); return; }
    requestAnimationFrame(() => requestAnimationFrame(() => box.classList.add("is-in")));
  };
  const paint = (i: number) => {
    if (i === shown) return;
    const first = shown < 0;
    shown = i;
    clearTimeout(swapTimer);
    if (first || reduced) { put(i); return; }
    /* the old one leaves upwards fast (0.16 s), the new one assembles from below */
    box.classList.add("is-out");
    swapTimer = window.setTimeout(() => { box.classList.remove("is-out"); put(i); }, 160);
  };

  /* cards by a fractional position */
  const drum = (pos: number) => {
    cards.forEach((el, i) => {
      const d = i - pos, ad = Math.abs(d);
      el.classList.toggle("is-far", ad > 1);
      el.classList.toggle("is-cur", ad < 0.5);
      if (ad > 1) return;
      el.style.opacity = clamp(1 - ad * 1.8, 0, 1).toFixed(3);
      el.style.transform = reduced ? "none" : `translate3d(${(d * 14).toFixed(2)}%, 0, 0) scale(${(1 - ad * 0.08).toFixed(3)}) rotate(${(d * 3).toFixed(2)}deg)`;
      el.tabIndex = ad < 0.5 ? 0 : -1;
      el.setAttribute("aria-hidden", String(ad >= 0.5));
    });
  };
  /* the drum catches up with the nearest whole case in ~0.4 s */
  let pos = 0, target = 0, raf = 0, last = 0;
  const spin = (now: number) => {
    raf = 0;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    pos += (target - pos) * (1 - Math.exp(-dt * 11));
    if (Math.abs(target - pos) < 0.002) pos = target; else raf = requestAnimationFrame(spin);
    drum(pos);
  };
  const turnTo = (i: number) => {
    target = i;
    if (reduced) { pos = i; drum(pos); return; }
    if (!raf) { last = performance.now(); raf = requestAnimationFrame(spin); }
  };

  const set = (run: number) => {
    const idx = clamp(Math.round(reduced ? run : dwell(run)), 0, n - 1);
    if (idx === cur && shown >= 0) return;
    cur = idx;
    items.forEach((a, i) => { a.classList.toggle("is-on", i === cur); a.setAttribute("aria-current", i === cur ? "true" : "false"); });
    segs.forEach((s, i) => s.classList.toggle("is-on", i === cur));
    steps[0].disabled = cur <= 0;
    steps[1].disabled = cur >= n - 1;
    paint(idx);
    turnTo(idx);
  };

  /* the arrow keys and a sideways swipe anywhere on the scene */
  addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
    e.preventDefault();
    goTo(cur + (e.key === "ArrowRight" ? 1 : -1));
  });
  let tx = 0, ty = 0, tSwipe = false;
  root.addEventListener("touchstart", (ev) => {
    const t = ev.changedTouches[0];
    tSwipe = !!t && ev.touches.length === 1;
    if (t) { tx = t.clientX; ty = t.clientY; }
  }, { passive: true });
  root.addEventListener("touchend", (ev) => {
    const t = ev.changedTouches[0];
    if (!tSwipe || !t) return;
    tSwipe = false;
    const dx = t.clientX - tx, dy = t.clientY - ty;
    if (Math.abs(dx) > 34 && Math.abs(dx) > Math.abs(dy) * 1.2) goTo(cur + (dx < 0 ? 1 : -1));
  }, { passive: true });

  const layout = () => {
    root.classList.toggle("is-narrow", matchMedia("(max-width: 900px), (pointer: coarse) and (max-width: 1100px)").matches);
    fitTitle();
    stackTitle();
  };
  addEventListener("resize", () => requestAnimationFrame(layout));
  layout();
  drum(0);
  set(0);
  return { set, layout };
}
