import { createGardenLoader } from "./garden-loader";

/* Demo driver. A real page reports its own readiness; here a fake load runs 0 → 100 % in LOAD seconds, the loader
   leaves, the page underneath shows for a moment and the garden starts again.
   ?garden=0…1 — a still of one phase, ?gardentier=0…4 — pin a quality step, ?slow=1 — offer the lightweight version early. */
const LOAD = 12, PAUSE = 2600;
const query = new URLSearchParams(location.search);
const number = (key: string) => (query.has(key) && query.get(key) !== "" ? Number(query.get(key)) : NaN);
const frozen = Number.isFinite(number("garden")) ? Math.min(1, Math.max(0, number("garden"))) : null;
const tier = Number.isInteger(number("gardentier")) ? number("gardentier") : undefined;
const site = document.querySelector<HTMLElement>(".site")!;
const note = document.querySelector<HTMLElement>(".site__note")!;

function run() {
  site.classList.remove("is-shown");
  let raf = 0, again = 0;
  const start = performance.now();
  const restart = (text: string) => {
    cancelAnimationFrame(raf); clearTimeout(again);
    note.textContent = text; site.classList.add("is-shown");
    again = window.setTimeout(run, PAUSE);
  };
  const loader = createGardenLoader({
    name: "NOA LINDEN", role: "PRODUCT DESIGNER", frozen, tier,
    slowAfterMs: query.has("slow") ? 3000 : 20000,
    onDone: () => restart("Loaded. The garden grows again in a moment."),
    onLite: () => restart("The lightweight version opens here. The garden grows again in a moment."),
  });
  /* a replayed loader fades in instead of cutting in over the page */
  const root = document.querySelector<HTMLElement>(".garden-loader:last-of-type");
  if (root && site.classList.contains("was-shown")) {
    root.style.opacity = "0";
    requestAnimationFrame(() => requestAnimationFrame(() => { root.style.opacity = ""; }));
  }
  site.classList.add("was-shown");
  if (frozen !== null) {
    loader.progress(frozen);
    if (frozen >= 1) loader.ready();
    return;
  }
  const tick = (now: number) => {
    const t = (now - start) / 1000;
    loader.progress(t / LOAD);
    if (t >= LOAD) { loader.ready(); return; }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
}

run();
