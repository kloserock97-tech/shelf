/* Demo: five objects on the drum. The cursor (or a finger) tilts the object; arrows, keys and dots roll the drum.
 * The drum coordinate catches up with the chosen object in ~0.4 s, as in the case wheel it came from. */
import { createDepthTilt } from "./depthTilt";

const OBJECTS = [
  { name: "Harbor", src: "objects/harbor.webp", depth: "objects/depth/harbor.webp", ratio: 900 / 547 },
  { name: "Lumen", src: "objects/lumen.webp", depth: "objects/depth/lumen.webp", ratio: 900 / 731 },
  { name: "Northwind", src: "objects/northwind.webp", depth: "objects/depth/northwind.webp", ratio: 888 / 851 },
  { name: "Meridian", src: "objects/meridian.webp", depth: "objects/depth/meridian.webp", ratio: 900 / 773 },
  { name: "Atlas", src: "objects/atlas.webp", depth: "objects/depth/atlas.webp", ratio: 900 / 698 },
];

const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const stage = document.querySelector<HTMLElement>(".dt-stage")!;
const name = document.querySelector<HTMLElement>(".dt-name")!;
const now = document.querySelector<HTMLElement>(".dt-now")!;
const steps = [...document.querySelectorAll<HTMLButtonElement>(".dt-step")];
document.querySelector(".dt-of")!.textContent = `/ ${String(OBJECTS.length).padStart(2, "0")}`;

let px = 0, py = 0;
let drum = 0, target = 0, raf = 0, last = 0;
const gl = reduced ? null : await createDepthTilt(stage, OBJECTS);
if (!gl) stage.classList.add("is-flat"); // no WebGL or reduced motion: the plain picture stays

const paint = () => {
  name.textContent = OBJECTS[target].name;
  now.textContent = String(target + 1).padStart(2, "0");
  steps[0].disabled = target <= 0;
  steps[1].disabled = target >= OBJECTS.length - 1;
  const img = stage.querySelector<HTMLImageElement>(".dt-flat");
  if (img) img.src = OBJECTS[target].src;
};
const spin = (t: number) => {
  raf = 0;
  const dt = Math.min(0.05, (t - last) / 1000);
  last = t;
  drum += (target - drum) * (1 - Math.exp(-dt * 11));
  if (Math.abs(target - drum) < 0.002) drum = target; else raf = requestAnimationFrame(spin);
  gl?.set(drum, px, py);
};
const go = (i: number) => {
  target = Math.max(0, Math.min(OBJECTS.length - 1, i));
  paint();
  if (!raf) { last = performance.now(); raf = requestAnimationFrame(spin); }
};

/* any pointer over the page tilts the object: the mouse by moving, a finger by dragging */
addEventListener("pointermove", (e) => {
  if (e.pointerType !== "mouse" && e.buttons === 0) return;
  const r = stage.getBoundingClientRect();
  px = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
  py = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1));
  gl?.set(drum, px, py);
});
const release = () => { px = 0; py = 0; gl?.set(drum, 0, 0); };
document.documentElement.addEventListener("pointerleave", release);
addEventListener("pointerup", (e) => { if (e.pointerType !== "mouse") release(); });

steps.forEach((b) => b.addEventListener("click", () => go(target + Number(b.dataset.d))));
addEventListener("keydown", (e) => {
  if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); go(target + 1); }
  if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); go(target - 1); }
});
addEventListener("resize", () => gl?.resize());
paint();
gl?.set(0, 0, 0);
