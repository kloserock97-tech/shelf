/* Demo wiring: scroll progress of the section → the canvas line, the heading swap and the paragraph words.
   The heading is measured on start, on resize and when the font arrives; a scroll frame reads no layout. */
import { KINETIC, drawKinetic, makeStrip, ramp, type Strip, type Target } from "./kinetic";

const FAMILY = "Onest, system-ui, sans-serif";
const HEAD = "Hi there!";
const REST = "I make complex things simple.";

const section = document.querySelector<HTMLElement>(".kh")!;
const stage = section.querySelector<HTMLElement>(".kh-stage")!;
const canvas = section.querySelector<HTMLCanvasElement>(".kh-canvas")!;
const head = section.querySelector<HTMLElement>(".kh-hi")!;
const base = section.querySelector<HTMLElement>(".kh-base")!;
const intro = section.querySelector<HTMLElement>(".kh-intro")!;
const ctx = canvas.getContext("2d")!;
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

/* the paragraph by words: a span per word with its index; CSS computes each word's opacity from --r */
const words = (intro.textContent ?? "").trim().split(/\s+/);
intro.setAttribute("aria-label", words.join(" "));
intro.innerHTML = words.map((w, i) => `<span class="w" aria-hidden="true" style="--i:${i}">${w}</span>`).join(" ");
intro.style.setProperty("--n", String(words.length));

let strip: Strip | null = null;
let target: Target = { left: 0, baseline: 0, font: 64 };
let W = 0;
let H = 0;
let top = 0;
let span = 1;
let on = false;

const buildStrip = () => {
  strip = makeStrip(HEAD, REST, FAMILY, 700, Math.min(2, devicePixelRatio || 1));
  draw();
};

/* where the heading stands, relative to the stage: left edge, baseline (a zero-size inline-block sits on it)
   and font size */
const measure = () => {
  const dpr = Math.min(2, devicePixelRatio || 1);
  const sr = stage.getBoundingClientRect();
  W = sr.width;
  H = sr.height;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  target = {
    left: head.getBoundingClientRect().left - sr.left,
    baseline: base.getBoundingClientRect().top - sr.top,
    font: parseFloat(getComputedStyle(head).fontSize),
  };
  const r = section.getBoundingClientRect();
  top = r.top + scrollY;
  span = Math.max(1, r.height - H);
  draw();
};

let raf = 0;
function draw() {
  raf = 0;
  const pinned = new URLSearchParams(location.search).get("p");
  const s = pinned !== null ? Number(pinned) : Math.min(1, Math.max(0, (scrollY - top) / span));
  if (!reduced && strip) drawKinetic(ctx, strip, s, target, W, H);
  /* the heading appears by swap (or simply fades in when motion is reduced) */
  const headA = reduced ? ramp(s, KINETIC.morph[0] + 0.07, KINETIC.swap[1]) : ramp(s, ...KINETIC.swap);
  head.style.opacity = headA.toFixed(3);
  intro.style.setProperty("--r", ramp(s, ...KINETIC.words).toFixed(3));
  /* the right column comes in once the heading is in place, and leaves a bit earlier on the way back */
  const next = on ? s > 0.8 : s > 0.83;
  if (next !== on) { on = next; section.classList.toggle("is-on", on); }
}
const schedule = () => { if (!raf) raf = requestAnimationFrame(draw); };

addEventListener("scroll", schedule, { passive: true });
addEventListener("resize", measure);
/* The font arrives asynchronously. Until the page styles are in, the face is not even declared and
   fonts.check() says "ready" anyway, so load() is asked with the text and, if it finds nothing,
   we wait for the next loadingdone. The heading is measured again too: the font changes its width. */
const ensure = () => {
  const font = `700 100px ${FAMILY}`;
  document.fonts?.load(font, `${HEAD} ${REST}`).then((faces) => {
    if (faces.length) { buildStrip(); measure(); }
    else document.fonts.addEventListener("loadingdone", ensure, { once: true });
  }).catch(() => {});
};
buildStrip();
measure();
ensure();
