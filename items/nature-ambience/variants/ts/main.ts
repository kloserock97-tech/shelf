import { createAmbient, gust, windScale, type Weather } from "./ambient";

/* Demo: sound starts only from the Play button, the AudioContext is created inside that click. Parameters go to
   update() ten times a second, as on the site; the spectrum and the meters read the graph itself. */

const $ = <E extends Element = HTMLElement>(sel: string) => document.querySelector<E>(sel)!;
const play = $<HTMLButtonElement>("[data-play]");
const note = $("[data-note]");
const viz = $<HTMLCanvasElement>("[data-viz]");
const g2d = viz.getContext("2d")!;

let ctx: AudioContext | null = null;
let engine: ReturnType<typeof createAmbient> | null = null;
let analyser: AnalyserNode | null = null;
let bins = new Uint8Array(0);
let playing = false;
let weather: Weather = "clear";
let gustAt = -10;
let muffle = 0;
let timer = 0;
let last = 0;

const tick = () => {
  if (!engine) return;
  const t = performance.now();
  const dt = Math.min(0.5, (t - last) / 1000);
  last = t;
  engine.update({ wind: windScale(weather) + gust(t / 1000 - gustAt), weather, muffle }, dt);
};

function start() {
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) { note.textContent = "Web Audio isn't available in this browser."; return; }
  /* in the same synchronous click handler: iOS resumes a context only there */
  ctx ??= new AC({ latencyHint: "playback" });
  void ctx.resume();
  if (!engine) {
    engine = createAmbient(ctx);
    analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.82;
    /* the ambience is quiet (−38…−49 dB RMS), so the analyser's window moves down */
    analyser.minDecibels = -120;
    analyser.maxDecibels = -45;
    bins = new Uint8Array(analyser.frequencyBinCount);
    engine.output.connect(analyser);
  }
  playing = true;
  last = performance.now();
  clearInterval(timer);
  timer = window.setInterval(tick, 100);
  tick();
  paint();
}

function stop() {
  playing = false;
  clearInterval(timer);
  engine?.fadeOut();
  window.setTimeout(() => { if (!playing) void ctx?.suspend(); }, 700);
  paint();
}

function paint() {
  play.setAttribute("aria-pressed", String(playing));
  play.querySelector("span")!.textContent = playing ? "Stop" : "Play";
  note.textContent = playing ? "Sound on. Try a gust, change the weather, muffle it." : "Sound starts only when you press Play.";
}

play.addEventListener("click", () => (playing ? stop() : start()));
$("[data-gust]").addEventListener("click", () => { gustAt = performance.now() / 1000; });
const slider = $<HTMLInputElement>("[data-muffle]");
slider.addEventListener("input", () => { muffle = Number(slider.value); });
document.querySelectorAll<HTMLButtonElement>("[data-weather]").forEach((b) =>
  b.addEventListener("click", () => {
    weather = b.dataset.weather as Weather;
    document.body.dataset.weather = weather;
    document.querySelectorAll("[data-weather]").forEach((o) => o.setAttribute("aria-pressed", String(o === b)));
  }),
);
/* a tab in the background doesn't need to play */
document.addEventListener("visibilitychange", () => {
  if (!ctx) return;
  if (document.hidden) void ctx.suspend();
  else if (playing) void ctx.resume();
});

/* the spectrum (48 log-spaced bands, 80 Hz to 12 kHz) and the layer meters */
const meters = [...document.querySelectorAll<HTMLElement>("[data-meter]")];
const FULL: Record<string, number> = { wind: 0.2, rustle: 0.06, rain: 0.08, crickets: 0.012 };
const draw = () => {
  const w = viz.clientWidth, h = viz.clientHeight, k = Math.min(window.devicePixelRatio || 1, 2);
  if (viz.width !== Math.round(w * k)) { viz.width = Math.round(w * k); viz.height = Math.round(h * k); }
  g2d.setTransform(k, 0, 0, k, 0, 0);
  g2d.clearRect(0, 0, w, h);
  const accent = getComputedStyle(document.body).getPropertyValue("--accent").trim() || "#6fa35f";
  if (analyser && ctx) analyser.getByteFrequencyData(bins);
  const n = 48, gap = 3, bw = (w - gap * (n - 1)) / n;
  for (let i = 0; i < n; i++) {
    let v = 0;
    if (analyser && ctx) {
      const f0 = 80 * Math.pow(12000 / 80, i / n), f1 = 80 * Math.pow(12000 / 80, (i + 1) / n);
      const a = Math.floor((f0 / ctx.sampleRate) * 2 * bins.length), b = Math.max(a + 1, Math.floor((f1 / ctx.sampleRate) * 2 * bins.length));
      for (let j = a; j < b; j++) v = Math.max(v, bins[j] ?? 0);
      v /= 255;
    }
    const bh = Math.max(2, v * h);
    g2d.fillStyle = accent;
    g2d.globalAlpha = 0.25 + 0.75 * v;
    g2d.beginPath();
    g2d.roundRect(i * (bw + gap), h - bh, bw, bh, Math.min(2, bw / 2));
    g2d.fill();
  }
  g2d.globalAlpha = 1;
  for (const m of meters) {
    const key = m.dataset.meter!;
    const v = !engine ? 0 : key === "birds" ? engine.birds / 3 : engine.layers[key as keyof typeof engine.layers].gain.value / FULL[key];
    m.style.setProperty("--v", String(Math.min(1, v)));
  }
  requestAnimationFrame(draw);
};
paint();
requestAnimationFrame(draw);
Object.assign(window, { __ambience: { get state() { return ctx?.state ?? "none"; }, get engine() { return engine; }, get bins() { return bins; } } });
