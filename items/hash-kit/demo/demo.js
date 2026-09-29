// Hash Kit demo: four small canvases drawn with the JavaScript variant (the shader variant returns the same bits).
import { hashU, hash2, makeRandom, dither } from '../variants/js/hash-kit.js';

const $ = (id) => document.getElementById(id);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
let seed = 1;

function paint(canvas, fn) {
  const { width: w, height: h } = canvas;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, g, b] = fn(x, y);
    const i = (y * w + x) * 4;
    img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

const smooth = (t) => t * t * (3 - 2 * t);
function valueNoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = smooth(x - ix), fy = smooth(y - iy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

function drawStatic() {
  const off = hashU(seed) & 0xffff; // a new seed moves the grid somewhere else
  paint($('c-hash'), (x, y) => { const v = Math.floor(hash2(x + off, y) * 256); return [v, v, v]; });
  paint($('c-noise'), (x, y) => {
    const n = 0.55 * valueNoise((x + off) / 24, y / 24) + 0.3 * valueNoise((x + off) / 12, y / 12) + 0.15 * valueNoise((x + off) / 6, y / 6);
    // a cool-to-warm ramp, so the octaves read as terrain rather than grey fog
    return [40 + n * 180, 70 + n * 150, 90 + n * 90].map(Math.round);
  });
  // a dark dusk sky quantised to 5 bits: bands on the left, the same with dither on the right, a hairline between
  const c = $('c-dither');
  paint(c, (x, y) => {
    const t = y / (c.height - 1);
    if (x === c.width / 2) return [255, 255, 255];
    const sky = [0.06 + 0.16 * t, 0.07 + 0.12 * t, 0.15 + 0.1 * t];
    const d = x < c.width / 2 ? 0 : dither(x, y) - 0.5;
    return sky.map((v) => Math.round((Math.floor(v * 31 + 0.5 + d) / 31) * 255));
  });
  $('seed-value').textContent = `seed ${seed}`;
}

// Avalanche: flip each of the 32 input bits and count how often each output bit flips. Ideal: half the time.
const counts = new Float64Array(1024);
let samples = 0;
let rand = makeRandom(seed);
const LIMIT = 1 << 17;
function stepAvalanche(n) {
  for (let k = 0; k < n; k++) {
    const x = Math.floor(rand() * 4294967296) >>> 0;
    const h0 = hashU(x);
    for (let j = 0; j < 32; j++) {
      let d = (hashU((x ^ (1 << j)) >>> 0) ^ h0) >>> 0;
      while (d) { const i = 31 - Math.clz32(d & -d); counts[j * 32 + i]++; d &= d - 1; }
    }
  }
  samples += n;
}
function drawAvalanche() {
  let s = 0;
  paint($('c-avalanche'), (x, y) => {
    const p = counts[y * 32 + x] / Math.max(1, samples) - 0.5;
    s += p * p;
    // white = exactly half; tinted = drifting away from half (scaled ×40 so small drifts show)
    const t = Math.min(1, Math.abs(p) * 40);
    return p > 0 ? [255, 255 - 150 * t, 255 - 190 * t].map(Math.round) : [255 - 190 * t, 255 - 120 * t, 255].map(Math.round);
  });
  // what is left after the sampling noise; at this sample count our mixer's real drift (0.096) is still below it
  const bias = 1000 * Math.sqrt(Math.max(0, s / 1024 - 0.25 / Math.max(1, samples)));
  $('bias').textContent = `${samples.toLocaleString('en')} samples · ${bias < 0.005 ? 'within noise' : `bias ${bias.toFixed(2)}`}`;
}
function tick() {
  if (samples < LIMIT) {
    stepAvalanche(reduced ? 4096 : 1024);
    drawAvalanche();
    requestAnimationFrame(tick);
  }
}

$('seed').addEventListener('click', () => {
  seed = (hashU(seed + 1) % 9999) + 1;
  rand = makeRandom(seed);
  counts.fill(0);
  samples = 0;
  drawStatic();
  requestAnimationFrame(tick);
});

drawStatic();
if (reduced) { stepAvalanche(LIMIT); drawAvalanche(); } else requestAnimationFrame(tick);
