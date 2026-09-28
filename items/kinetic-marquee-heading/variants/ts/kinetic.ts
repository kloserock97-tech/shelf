/* Kinetic marquee → heading. A huge line of text runs across the stage behind an object, brakes, shrinks and
   settles exactly where a DOM heading stands; then the DOM heading takes over.

   The line is drawn once into a strip canvas and repeated along x. Its metrics are fixed and known to the DOM
   side: the font size is FONT of the strip height, the baseline sits at BASE of the height from the top, and the
   text starts at x = 0 (the same left bearing as in the DOM). So a band of height fontSize / FONT with its
   baseline on the heading's baseline covers the heading to the pixel, and the swap is invisible.
   In the portfolio the strip is a WebGL texture sampled in the final pass; here it is Canvas 2D. */

export const FONT = 0.72;
export const BASE = 0.76;

/** progress keys, 0…1 of the section. Same proportions as in the portfolio's About chapter
    (run 0.36 : morph 0.10 : words 0.075 of it), stretched to a section of its own */
export const KINETIC = {
  run: [0.0, 0.63] as const, // runs right to left and brakes to a stop
  morph: [0.63, 0.81] as const, // shrinks and moves onto the heading
  keep: [0.63, 0.72] as const, // meanwhile everything but the head of the line fades
  swap: [0.8, 0.82] as const, // the DOM heading takes over
  words: [0.81, 0.94] as const, // the paragraph under it comes in word by word
};

export const ramp = (x: number, a: number, b: number) => Math.min(1, Math.max(0, (x - a) / (b - a)));
const smooth = (x: number) => x * x * (3 - 2 * x);
const smoother = (x: number) => x * x * x * (x * (x * 6 - 15) + 10);

export type Strip = { canvas: HTMLCanvasElement; ratio: number; headFrac: number; headW: number };

/** Draw "<head> <rest>  ✦  " into a strip canvas. `family` must be the heading's font. */
export function makeStrip(head: string, rest: string, family: string, weight = 700, scale = 1): Strip {
  const text = `${head} ${rest}  ✦  `;
  const probe = document.createElement("canvas").getContext("2d")!;
  probe.font = `${weight} 100px ${family}`;
  const per100 = probe.measureText(text).width;
  /* canvases wider than 8192 px fail on some GPUs: the strip height adapts so the line always fits */
  const H = Math.max(120, Math.min(Math.round(300 * scale), Math.floor((8190 / per100) * 100 / FONT)));
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const font = `${weight} ${Math.round(H * FONT)}px ${family}`;
  ctx.font = font;
  const w = Math.min(8192, Math.ceil(ctx.measureText(text).width));
  const headW = ctx.measureText(head).width;
  canvas.width = w;
  canvas.height = H;
  ctx.font = font; // resizing a canvas resets its context
  ctx.fillStyle = "#14140f";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(text, 0, H * BASE);
  return { canvas, ratio: w / H, headFrac: headW / w, headW };
}

export type Target = { left: number; baseline: number; font: number };

/** Draw the line for progress s onto a stage canvas of W × H css pixels (the context is already scaled by DPR). */
export function drawKinetic(ctx: CanvasRenderingContext2D, strip: Strip, s: number, target: Target, W: number, H: number) {
  ctx.clearRect(0, 0, W, H);
  const alpha = 1 - ramp(s, ...KINETIC.swap);
  if (alpha <= 0.001) return;
  const portrait = W < H;
  /* the big line: a constant band height and centre */
  const bigH = (portrait ? 0.15 : 0.27) * H;
  const bigY = (1 - (portrait ? 0.5 : 0.47)) * H;
  /* the heading: band height from the font size, centre from the baseline */
  const headH = target.font / FONT;
  const headY = target.baseline - (BASE - 0.5) * headH;
  const m = smoother(ramp(s, ...KINETIC.morph));
  const bandH = bigH + (headH - bigH) * m;
  const cy = bigY + (headY - bigY) * m;
  const top = cy - bandH / 2;
  const stripW = strip.ratio * bandH;
  /* copy N stands with its left edge on the heading; before that the line comes in from the right and brakes:
     the offset shrinks as (1 − run)², so the speed falls to zero right at the heading */
  const N = 3;
  const run = ramp(s, ...KINETIC.run);
  const approach = (1 - run) * (1 - run);
  const xN = target.left + approach * 1.35 * stripW;
  const keep = smooth(ramp(s, ...KINETIC.keep));
  const src = strip.canvas;
  const sw = src.width;
  const sh = src.height;
  const headSw = strip.headFrac * sw;
  const headDw = strip.headFrac * stripW;
  const first = Math.floor(-xN / stripW) + N;
  const last = Math.ceil((W - xN) / stripW) + N;
  ctx.imageSmoothingQuality = "high";
  for (let k = first; k <= last; k++) {
    const x = xN + (k - N) * stripW;
    if (k === N) {
      /* the head of copy N stays; the rest of the line fades out as the morph begins */
      ctx.globalAlpha = alpha;
      ctx.drawImage(src, 0, 0, headSw, sh, x, top, headDw, bandH);
      if (keep < 1) {
        ctx.globalAlpha = alpha * (1 - keep);
        ctx.drawImage(src, headSw, 0, sw - headSw, sh, x + headDw, top, stripW - headDw, bandH);
      }
    } else if (keep < 1) {
      ctx.globalAlpha = alpha * (1 - keep);
      ctx.drawImage(src, 0, 0, sw, sh, x, top, stripW, bandH);
    }
  }
  ctx.globalAlpha = 1;
}
