/* "Camera" over a screenshot: the frame stays put while the screen inside zooms and pans to named focus
   points (CSS presets on [data-focus]) and cross-fades to another state of the interface when a scene needs it.
   Each scene holds for 3.2 s, in 100 ms beats that check the cancel token, so leaving the screen or
   pressing a state button never lets an old scene advance.
   Ported from Portfolio 3D TS2: src/ui/caseScreenMotion.ts. Styles: screen-motion.css. */

export type Run = { stopped: boolean };
export type Scene = {
  /** image of this state; scenes that share a file only move the camera */
  src: string;
  caption: string;
  /** name of a camera preset in CSS: .sm[data-focus=<name>] { --camera: ... } */
  focus: string;
  /** optional raster set, e.g. "shot.webp 1000w, shot@2x.webp 2000w" */
  srcset?: string;
};

/* The camera zooms in up to ZOOM×, so a raster screenshot must be chosen for the zoomed size, not for the
   frame: sizes = frame width × ZOOM. The frame here is never wider than 1000 px. */
export const ZOOM = 1.95;
const SIZES = `(max-width: 1040px) ${Math.round(ZOOM * 100)}vw, ${Math.round(1000 * ZOOM)}px`;
const BEAT = 100;   // ms between checks of the cancel token
const BEATS = 32;   // 3.2 s per scene

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function screenMarkup(scenes: Scene[], o: { alt: string; group?: string }) {
  const files = [...new Set(scenes.map((s) => s.src))];
  const imgs = files.map((src, i) => {
    const set = scenes.find((s) => s.src === src)?.srcset;
    return `<img class="sm-screen${i === 0 ? " is-current" : ""}" data-file="${esc(src)}" src="${esc(src)}" alt="${esc(o.alt)}" decoding="async"${set ? ` srcset="${esc(set)}" sizes="${SIZES}"` : ""}>`;
  });
  const buttons = scenes.map((s, i) => `<button type="button" data-shot="${i}" aria-label="${esc(s.caption)}" aria-pressed="${i === 0}"><span>0${i + 1}</span><i></i></button>`);
  return `<div class="dm sm" data-focus="${esc(scenes[0].focus)}">
    <div class="sm-viewport"><div class="sm-camera">${imgs.join("")}</div></div>
    <div class="sm-director"><p class="sm-caption">${esc(scenes[0].caption)}</p><div class="sm-controls" role="group" aria-label="${esc(o.group ?? "Interface states")}">${buttons.join("")}</div></div>
  </div>`;
}

export async function screenPlay(root: HTMLElement, scenes: Scene[], run: Run) {
  const select = (index: number) => {
    const shot = scenes[index];
    root.dataset.focus = shot.focus;
    root.querySelectorAll<HTMLElement>(".sm-screen").forEach((img) => img.classList.toggle("is-current", img.dataset.file === shot.src));
    root.querySelector<HTMLElement>(".sm-caption")!.textContent = shot.caption;
    root.querySelectorAll<HTMLElement>("[data-shot]").forEach((b, i) => b.setAttribute("aria-pressed", String(i === index)));
  };
  /* a pressed state wins: the scenario stops and the camera goes where the person asked */
  root.querySelectorAll<HTMLButtonElement>("[data-shot]").forEach((b) => {
    b.onclick = () => { run.stopped = true; select(Number(b.dataset.shot)); };
  });
  /* reduced motion: no ride, just the scene that says the most (the second one) */
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  if (reduced.matches) { select(Math.min(1, scenes.length - 1)); return; }
  select(0);
  for (let index = 1; index < scenes.length; index++) {
    for (let tick = 0; tick < BEATS; tick++) {
      await new Promise((resolve) => window.setTimeout(resolve, BEAT));
      if (run.stopped) return;
      if (reduced.matches) { select(Math.min(1, scenes.length - 1)); return; }
      if (document.hidden) { tick--; continue; } // a hidden tab doesn't eat the scene
    }
    select(index);
  }
}
