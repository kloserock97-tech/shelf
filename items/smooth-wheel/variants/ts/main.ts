/* Demo wiring: a switch for the smoothing, a live speed graph and which route the last input took. */
import { smoothWheel, type Smoother, type WheelRoute } from "./smoothScroll";

const $ = <T extends HTMLElement>(s: string) => document.querySelector<T>(s);
const toggle = $<HTMLButtonElement>("#smooth");
const speed = $("#speed");
const route = $("#route");
const canvas = $<HTMLCanvasElement>("#spark");

const ROUTES: Record<WheelRoute, string> = {
  smooth: "Wheel · smoothed",
  trackpad: "Trackpad · native",
  nested: "Inner box · native",
  zoom: "Ctrl + wheel · zoom",
  sideways: "Sideways · native",
  reduced: "Reduced motion · native",
  edge: "Page edge · passed on",
};
const show = (s: string) => { if (route && route.textContent !== s) route.textContent = s; };

let smoother: Smoother | null = null;
const enable = () => { smoother = smoothWheel(window, undefined, (r) => show(ROUTES[r])); };
enable();
toggle?.addEventListener("click", () => {
  const on = toggle.getAttribute("aria-checked") !== "true";
  toggle.setAttribute("aria-checked", String(on));
  smoother?.stop();
  smoother = null;
  if (on) enable();
  show(on ? "Smoothing on" : "Wheel · native (smoothing off)");
});
addEventListener("keydown", (e) => {
  if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(e.key)) show("Keys · native");
});
addEventListener("touchstart", () => show("Finger · native"), { passive: true });

/* jumps travel with the same motion as the wheel */
document.querySelectorAll<HTMLElement>("[data-to]").forEach((b) => b.addEventListener("click", () => {
  const to = b.dataset.to === "end" ? document.documentElement.scrollHeight : 0;
  if (smoother) smoother.to(to); else scrollTo({ top: to, behavior: "instant" as ScrollBehavior });
}));

/* speed graph: the last ~1.5 s of scroll speed, drawn only while the page moves */
const W = 180, H = 36, N = 90;
const samples = new Array<number>(N).fill(0);
const ctx = canvas?.getContext("2d");
const dpr = Math.min(2, devicePixelRatio || 1);
if (canvas && ctx) { canvas.width = W * dpr; canvas.height = H * dpr; ctx.scale(dpr, dpr); }
const accent = () => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#3e63dd";
const draw = () => {
  if (!ctx) return;
  /* a jump (scrollbar, Home, a far cut) is one huge sample; the scale is capped so it doesn't flatten the rest */
  const peak = Math.min(8000, Math.max(2500, ...samples.map(Math.abs)));
  const c = accent();
  ctx.clearRect(0, 0, W, H);
  ctx.beginPath();
  samples.forEach((v, i) => {
    const x = (i * W) / (N - 1), y = H - 2 - Math.min(1, Math.abs(v) / peak) * (H - 6);
    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  });
  ctx.strokeStyle = c;
  ctx.lineWidth = 1.6;
  ctx.lineJoin = "round";
  ctx.stroke();
  ctx.lineTo(W, H);
  ctx.lineTo(0, H);
  ctx.closePath();
  ctx.globalAlpha = 0.14;
  ctx.fillStyle = c;
  ctx.fill();
  ctx.globalAlpha = 1;
};
let lastY = scrollY, lastT = performance.now(), still = 0, loop = 0;
const frame = (t: number) => {
  const v = ((scrollY - lastY) / Math.max(1, t - lastT)) * 1000;
  lastY = scrollY;
  lastT = t;
  samples.push(v);
  samples.shift();
  if (speed) speed.textContent = `${Math.round(Math.abs(v)).toLocaleString("en")} px/s`;
  draw();
  still = v === 0 ? still + 1 : 0;
  loop = still > N ? 0 : requestAnimationFrame(frame);
};
addEventListener("scroll", () => {
  if (loop) return;
  lastY = scrollY;
  lastT = performance.now();
  still = 0;
  loop = requestAnimationFrame(frame);
}, { passive: true });
draw();
