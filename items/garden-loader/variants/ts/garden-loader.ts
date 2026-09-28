import { GardenScene } from "./garden-scene";

export type GardenLoader = { progress: (value: number) => void; ready: () => void; dispose: () => void };

export type GardenLoaderOptions = {
  /** the page is ready and the grown garden has been seen: reveal the page (the loader fades out and cleans up) */
  onDone: () => void;
  /** the visitor chose the lightweight version (offered only when loading drags on) */
  onLite?: () => void;
  name?: string;
  role?: string;
  edition?: string;
  /** the big line at the bottom, one per stage: three while loading and the last one when ready */
  stages?: readonly [string, string, string, string];
  progressLabel?: string;
  fallbackLabel?: string;
  /** a still of one phase, 0…1: the garden stops there and the loader never leaves (for checking frames) */
  frozen?: number | null;
  /** pin a quality step 0…4 */
  tier?: number;
  /** when to offer the lightweight version, ms */
  slowAfterMs?: number;
};

/** The garden grows while the real page prepares, not as a second intro after loading.
    This file is the page side of the loader: the markup, the link between real readiness and growth, focus and
    clean-up. The picture itself is GardenScene.
    There is no skip control: the run is a few seconds. What stays is the way out for a device that cannot cope, the
    lightweight version, offered when loading drags on. */
export function createGardenLoader(options: GardenLoaderOptions): GardenLoader {
  const {
    onDone, onLite, name = "YOUR NAME", role = "PRODUCT DESIGNER", edition = "DIGITAL NATURE · 01",
    stages = ["Setting the light.", "Building the space.", "Finishing touches.", "Ready to explore."],
    progressLabel = "Preparing the page", fallbackLabel = "Open lightweight version", slowAfterMs = 10000,
  } = options;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const frozen = typeof options.frozen === "number" && Number.isFinite(options.frozen) ? Math.min(1, Math.max(0, options.frozen)) : null;
  const root = document.createElement("section");
  root.className = "garden-loader";
  root.tabIndex = -1;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-labelledby", "garden-title");
  root.innerHTML = `
    <header class="garden-loader__top">
      <div class="garden-loader__identity"><b></b><span></span></div>
      <span class="garden-loader__edition"></span>
    </header>
    <div class="garden-loader__stage" aria-hidden="true"><canvas></canvas></div>
    <div class="garden-loader__bottom">
      <h1 class="garden-loader__title garden-loader__status" id="garden-title" role="status" aria-live="polite"></h1>
      <div class="garden-loader__line">
        <div class="garden-loader__track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></div>
        <span class="garden-loader__step" aria-hidden="true">01 / 03</span>
      </div>
      <button class="garden-loader__fallback" type="button"></button>
    </div>`;
  root.querySelector(".garden-loader__identity b")!.textContent = name;
  root.querySelector(".garden-loader__identity span")!.textContent = role;
  root.querySelector(".garden-loader__edition")!.textContent = edition;
  document.body.appendChild(root);
  document.body.classList.add("garden-loading");
  const previousFocus = document.activeElement as HTMLElement | null;
  const inert = [...document.body.children].filter((e): e is HTMLElement => e instanceof HTMLElement && e !== root && !["SCRIPT", "STYLE", "LINK"].includes(e.tagName)).map(e => ({ e, was: e.inert }));
  inert.forEach(({ e }) => { e.inert = true; });
  const fallback = root.querySelector<HTMLButtonElement>(".garden-loader__fallback")!;
  const label = root.querySelector<HTMLElement>(".garden-loader__status")!;
  const stepEl = root.querySelector<HTMLElement>(".garden-loader__step")!;
  const track = root.querySelector<HTMLElement>(".garden-loader__track")!;
  const stage = root.querySelector<HTMLElement>(".garden-loader__stage")!;
  const canvas = root.querySelector("canvas")!;
  fallback.textContent = fallbackLabel;
  track.setAttribute("aria-label", progressLabel);
  label.textContent = stages[0];
  /* The dialog itself holds the focus: there is nothing to press until the fallback shows up. Only when the document
     already has it: a loader inside an embedded frame must not pull the focus away from the page around it. */
  if (document.hasFocus()) root.focus({ preventScroll: true });
  let view: GardenScene | null = null;
  let target = .04, growth = 0, elapsed = 0, last = performance.now(), lastDraw = 0;
  let ready = false, leaving = false, disposed = false, raf = 0, exitTimer = 0;
  let statusIndex = 0, completedAt = -1, renderedGrowth = -1;
  const resize = () => { const { width, height } = stage.getBoundingClientRect(); view?.resize(width, height); };
  const buildStart = performance.now();
  try {
    view = new GardenScene(canvas, reduced, options.tier); resize();
    root.dataset.buildMs = (performance.now() - buildStart).toFixed(0); root.dataset.build = JSON.stringify(view.timings);
  } catch (error) { console.warn("Garden renderer unavailable; using the static loader", error); }
  const observer = new ResizeObserver(resize); observer.observe(stage);
  canvas.addEventListener("webglcontextlost", () => {
    if (disposed) return;
    view?.dispose(); view = null; stage.classList.remove("has-render");
  });
  const slowTimer = window.setTimeout(() => root.classList.add("is-slow"), slowAfterMs);
  const dispose = () => {
    if (disposed) return; disposed = true;
    cancelAnimationFrame(raf); clearTimeout(slowTimer); clearTimeout(exitTimer); observer.disconnect();
    view?.dispose(); view = null;
    inert.forEach(({ e, was }) => { e.inert = was; });
    root.remove(); document.body.classList.remove("garden-loading");
    if (previousFocus?.isConnected && previousFocus !== document.body) previousFocus.focus({ preventScroll: true });
  };
  const finish = () => {
    if (leaving || disposed || frozen !== null) return;
    leaving = true; root.classList.add("is-leaving");
    // Reveal the page underneath while the opacity fades. No extra fixed-duration intro.
    onDone();
    exitTimer = window.setTimeout(dispose, reduced ? 0 : 680);
  };
  fallback.addEventListener("click", () => { dispose(); onLite?.(); });
  /* the slab leans a little towards the cursor; a finger on a phone does not steer it */
  root.addEventListener("pointermove", e => {
    if (e.pointerType !== "mouse" || reduced) return;
    view?.setPointer(e.clientX / innerWidth * 2 - 1, e.clientY / innerHeight * 2 - 1);
  });
  root.addEventListener("pointerdown", e => e.stopPropagation());
  root.addEventListener("click", e => e.stopPropagation());
  /* Tab stays inside the dialog: on the fallback button once it is offered, on the dialog itself before that */
  root.addEventListener("keydown", e => {
    if (e.key !== "Tab") return;
    e.preventDefault();
    (root.classList.contains("is-slow") ? fallback : root).focus({ preventScroll: true });
  });
  const frame = (now: number) => {
    if (disposed) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    if (document.hidden) return;
    elapsed += dt;
    /* Loading phases gate growth; elapsed time is only choreography, never a fake byte count. The choreography is
       short (2.8 s to full): by the time it starts the scripts have loaded and the garden has been built. */
    const desired = frozen ?? (reduced ? target : Math.min(target, elapsed / 2.8));
    growth += (desired - growth) * (1 - Math.exp(-dt * 4.5));
    if (frozen !== null) growth = frozen;
    else if (reduced || (ready && desired === 1 && growth > .995)) growth = desired;
    root.dataset.growth = growth.toFixed(3);
    /* Every display frame up to about 120 Hz; on faster screens every other one. A cap of 60 turns a 165 Hz screen
       into an uneven 55. */
    if (now - lastDraw >= (reduced ? 220 : 7.5) || (growth === 1 && renderedGrowth !== 1)) {
      view?.render(growth, elapsed);
      if (view?.isReady) { stage.classList.add("has-render"); renderedGrowth = growth; root.dataset.quality = String(view.quality); }
      lastDraw = now;
    }
    // 100 means both a ready page AND a rendered, fully overgrown solid: no ice, no bare glass, walls included.
    const complete = ready && growth === 1 && (!view || renderedGrowth === 1);
    const progress = complete ? 1 : Math.min(.99, growth, target);
    root.style.setProperty("--garden-progress", String(progress));
    track.setAttribute("aria-valuenow", String(Math.floor(progress * 100)));
    if (complete && completedAt < 0) completedAt = elapsed;
    const index = complete ? 3 : progress < .36 ? 0 : progress < .72 ? 1 : 2;
    if (index !== statusIndex) {
      statusIndex = index;
      /* the big line is the stage itself; the counter next to the bar numbers it */
      label.textContent = stages[index];
      stepEl.textContent = `0${Math.min(3, index + 1)} / 03`;
    }
    // Let the completed edge-to-edge garden read before the dissolve begins.
    if (complete && (reduced || elapsed - completedAt >= .32)) finish();
  };
  raf = requestAnimationFrame(frame);
  return {
    /** real readiness of the page, 0…1; held under 94 % until ready() */
    progress(value) {
      target = Math.max(target, Math.min(.94, value));
    },
    ready() {
      if (disposed) return;
      ready = true; target = 1;
    },
    dispose,
  };
}
