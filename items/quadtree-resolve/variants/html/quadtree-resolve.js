/* Quadtree Resolve — a picture that resolves through an adaptive quadtree, like a progressive image.
   Canvas 2D. The picture is painted once (any drawing function), shrunk for analysis, and turned into
   summed-area tables, so the mean colour and the spread of any square cost four lookups. Each frame the tree is
   walked from square root cells: a cell splits where its colours spread more, near the pointer, and as progress grows.
   Splitting is fractional, so children fade in from the parent's colour and the gaps open gradually: nothing pops.
   At 100% the full picture fades in over the mosaic. The loop runs only while something is moving.

     import { createQuadtreeResolve, paintDusk } from './quadtree-resolve.js';
     const qt = createQuadtreeResolve(canvas, { paint: paintDusk });
     qt.setProgress(0.42);           // 0…1, e.g. from your loader
     qt.destroy();

   Options: paint(ctx, width, height, dark) draws the picture in CSS px; rootCell (CSS px, default 160);
   minCell (default 4); gap (default 1); lensRadius (default 150, 0 turns the pointer off). */

const hashU = (x) => {
  x ^= x >>> 16; x = Math.imul(x, 0x3f9c86cb);
  x ^= x >>> 14; x = Math.imul(x, 0x1ae9dacf);
  x ^= x >>> 15;
  return x >>> 0;
};
const hash1 = (i, seed) => (hashU(((i | 0) + hashU(seed + 0xb31c96c9)) >>> 0) >>> 8) / 16777216;
/** 1D value noise on the Hash Kit mixer, for ridgelines */
const noise1 = (x, seed) => {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return hash1(i, seed) * (1 - u) + hash1(i + 1, seed) * u;
};

/** The default picture: a dusk (or night) landscape of soft gradients, a sun and three ridges. */
export function paintDusk(g, w, h, dark) {
  const P = dark
    ? { sky: ['#1c2436', '#30344a', '#5e4b5a'], sun: '#efe0c2', glow: '#b9876f', ridges: ['#3a3f52', '#262c3a', '#161b24'], mist: '#8b6f78' }
    : { sky: ['#b8c7d3', '#e7d8c3', '#e9b08f'], sun: '#fbefd9', glow: '#f0b88f', ridges: ['#a5ad98', '#76836f', '#3f4b44'], mist: '#f3d6bc' };
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, P.sky[0]); sky.addColorStop(0.55, P.sky[1]); sky.addColorStop(0.8, P.sky[2]);
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  const m = Math.min(w, h), sx = w * 0.64, sy = h * 0.34;
  const glow = g.createRadialGradient(sx, sy, m * 0.05, sx, sy, m * 0.6);
  glow.addColorStop(0, P.glow + 'cc'); glow.addColorStop(1, P.glow + '00');
  g.fillStyle = glow; g.fillRect(0, 0, w, h);
  g.fillStyle = P.sun; g.beginPath(); g.arc(sx, sy, m * 0.105, 0, Math.PI * 2); g.fill();
  P.ridges.forEach((c, k) => {
    const base = h * (0.62 + k * 0.12), amp = h * (0.22 - k * 0.05), freq = 3.4 + k * 1.6;
    g.beginPath(); g.moveTo(0, h);
    for (let x = 0; x <= w + 8; x += 8) {
      const t = x / w;
      const y = base - amp * (noise1(t * freq, 11 + k) * 0.75 + noise1(t * freq * 3.1, 31 + k) * 0.25);
      g.lineTo(x, y);
    }
    g.lineTo(w, h); g.closePath(); g.fillStyle = c; g.fill();
    if (k < 2) { // mist in the valley in front of the ridge
      const mist = g.createLinearGradient(0, base - amp * 0.2, 0, base + h * 0.08);
      mist.addColorStop(0, P.mist + '00'); mist.addColorStop(1, P.mist + '55');
      g.fillStyle = mist; g.fillRect(0, base - amp * 0.2, w, h * 0.1 + amp * 0.2);
    }
  });
}

export function createQuadtreeResolve(canvas, options = {}) {
  const opt = { paint: paintDusk, rootCell: 160, minCell: 4, gap: 1, lensRadius: 150, progress: 0, ...options };
  const g = canvas.getContext('2d');
  const darkQuery = matchMedia('(prefers-color-scheme: dark)');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const full = document.createElement('canvas');
  const small = document.createElement('canvas');
  let W = 0, H = 0, dpr = 1, sw = 0, sh = 0, sat = null, k = 1;
  let progress = opt.progress;
  let reveal = progress >= 1 ? 1 : 0;
  const lens = { x: 0, y: 0, tx: 0, ty: 0, s: 0, ts: 0 };   // pointer lens: position and strength, smoothed
  let raf = 0, last = 0, visible = true, cells = 0;

  /* Summed-area tables: r, g, b and r²+g²+b² over the shrunk picture (Float64, ≤ 480 px on the long side). */
  function analyse() {
    const scale = Math.min(1, 480 / Math.max(W, H));
    sw = Math.max(1, Math.round(W * scale)); sh = Math.max(1, Math.round(H * scale)); k = sw / W;
    small.width = sw; small.height = sh;
    const s = small.getContext('2d', { willReadFrequently: true });
    s.imageSmoothingQuality = 'high';
    s.drawImage(full, 0, 0, sw, sh);
    const px = s.getImageData(0, 0, sw, sh).data;
    const stride = sw + 1;
    sat = new Float64Array(stride * (sh + 1) * 4);
    for (let y = 0; y < sh; y++) {
      let r = 0, gg = 0, b = 0, q = 0;
      for (let x = 0; x < sw; x++) {
        const i = (y * sw + x) * 4;
        const R = px[i] / 255, G = px[i + 1] / 255, B = px[i + 2] / 255;
        r += R; gg += G; b += B; q += R * R + G * G + B * B;
        const o = ((y + 1) * stride + x + 1) * 4, up = (y * stride + x + 1) * 4;
        sat[o] = sat[up] + r; sat[o + 1] = sat[up + 1] + gg; sat[o + 2] = sat[up + 2] + b; sat[o + 3] = sat[up + 3] + q;
      }
    }
  }
  /* mean colour and spread of a square in CSS px: four lookups per channel */
  const out = [0, 0, 0, 0];
  function stats(x, y, size) {
    const stride = sw + 1;
    let x0 = Math.max(0, Math.floor(x * k)), y0 = Math.max(0, Math.floor(y * k));
    let x1 = Math.min(sw, Math.max(x0 + 1, Math.ceil((x + size) * k))), y1 = Math.min(sh, Math.max(y0 + 1, Math.ceil((y + size) * k)));
    if (x0 >= sw) x0 = sw - 1; if (y0 >= sh) y0 = sh - 1;
    if (x1 <= x0) x1 = x0 + 1; if (y1 <= y0) y1 = y0 + 1;
    const a = (y0 * stride + x0) * 4, b = (y0 * stride + x1) * 4, c = (y1 * stride + x0) * 4, d = (y1 * stride + x1) * 4;
    const n = (x1 - x0) * (y1 - y0);
    for (let ch = 0; ch < 4; ch++) out[ch] = (sat[d + ch] - sat[b + ch] - sat[c + ch] + sat[a + ch]) / n;
    const spread = Math.sqrt(Math.max(0, out[3] - out[0] * out[0] - out[1] * out[1] - out[2] * out[2]));
    return spread;
  }

  function layout() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = Math.max(1, canvas.clientWidth); H = Math.max(1, canvas.clientHeight);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    full.width = canvas.width; full.height = canvas.height;
    const f = full.getContext('2d');
    f.setTransform(dpr, 0, 0, dpr, 0, 0);
    opt.paint(f, W, H, darkQuery.matches);
    analyse();
  }

  /* Levels from a root cell down to minCell; progress spends a budget of levels.
     A cell splits by f = clamp(budget + lens·3 − depth − 2.2·(1 − spread'), 0, 1): busy cells go first,
     flat ones up to 2.2 levels later, the lens adds up to three levels around the pointer. */
  let levels = 1;
  function drawCell(x, y, size, depth, pr, pg, pb, fade) {
    const spread = stats(x, y, size);
    let r = out[0], gg = out[1], b = out[2];
    if (fade < 1) { r = pr + (r - pr) * fade; gg = pg + (gg - pg) * fade; b = pb + (b - pb) * fade; }
    let f = 0;
    const half = size / 2;
    if (half >= opt.minCell && cells < 60000 && spread > 0.008) {
      let boost = 0;
      if (lens.s > 0.001 && opt.lensRadius > 0) {
        const dx = Math.max(x - lens.x, 0, lens.x - x - size), dy = Math.max(y - lens.y, 0, lens.y - y - size);
        boost = lens.s * Math.exp(-(dx * dx + dy * dy) / (2 * opt.lensRadius * opt.lensRadius));
      }
      const busy = Math.min(1, spread / 0.18);
      const budget = progress * (levels + 3.2);
      f = Math.min(1, Math.max(0, budget + boost * 3 - depth - 2.2 * (1 - busy)));
    }
    if (f > 0) {
      drawCell(x, y, half, depth + 1, r, gg, b, f);
      drawCell(x + half, y, half, depth + 1, r, gg, b, f);
      drawCell(x, y + half, half, depth + 1, r, gg, b, f);
      drawCell(x + half, y + half, half, depth + 1, r, gg, b, f);
      return;
    }
    cells++;
    // the gap opens with the split and narrows on tiny cells
    const gap = opt.gap * Math.min(1, size / 10) * (depth ? fade : 1);
    g.fillStyle = `rgb(${(r * 255) | 0},${(gg * 255) | 0},${(b * 255) | 0})`;
    g.fillRect(x + gap / 2, y + gap / 2, size - gap, size - gap);
  }

  function frame(now) {
    raf = 0;
    const dt = Math.min(0.05, (now - (last || now)) / 1000);
    last = now;
    // smooth the lens: position follows in ~80 ms, strength in ~200 ms
    const fast = reduced.matches ? 1 : 1 - Math.exp(-dt / 0.08), slow = reduced.matches ? 1 : 1 - Math.exp(-dt / 0.2);
    lens.x += (lens.tx - lens.x) * fast; lens.y += (lens.ty - lens.y) * fast; lens.s += (lens.ts - lens.s) * slow;
    const wantReveal = progress >= 1 ? 1 : 0;
    reveal = reduced.matches ? wantReveal : reveal + Math.sign(wantReveal - reveal) * Math.min(Math.abs(wantReveal - reveal), dt / 0.7);
    draw();
    const moving = Math.abs(lens.tx - lens.x) > 0.3 || Math.abs(lens.ty - lens.y) > 0.3 || Math.abs(lens.ts - lens.s) > 0.002 || reveal !== wantReveal;
    if (moving) request(); else last = 0;
  }
  function draw() {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    if (reveal < 1) {
      cells = 0;
      const R = opt.rootCell;
      levels = Math.max(1, Math.log2(R / opt.minCell));
      const cols = Math.ceil(W / R), rows = Math.ceil(H / R);
      const ox = (W - cols * R) / 2, oy = (H - rows * R) / 2;
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) drawCell(ox + i * R, oy + j * R, R, 0, 0, 0, 0, 1);
    }
    if (reveal > 0) {
      g.globalAlpha = reveal * reveal * (3 - 2 * reveal);
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.drawImage(full, 0, 0);
      g.globalAlpha = 1;
    }
  }
  const request = () => { if (!raf && visible) raf = requestAnimationFrame(frame); };

  const onMove = (e) => {
    const r = canvas.getBoundingClientRect();
    lens.tx = e.clientX - r.left; lens.ty = e.clientY - r.top;
    if (lens.ts === 0) { lens.x = lens.tx; lens.y = lens.ty; }
    lens.ts = 1;
    request();
  };
  const onLeave = () => { lens.ts = 0; request(); };
  const target = opt.pointerTarget || canvas;
  target.addEventListener('pointermove', onMove);
  target.addEventListener('pointerdown', onMove);
  target.addEventListener('pointerleave', onLeave);
  target.addEventListener('pointercancel', onLeave);

  const ro = new ResizeObserver(() => { layout(); request(); });
  ro.observe(canvas);
  const onTheme = () => { layout(); request(); };
  darkQuery.addEventListener('change', onTheme);
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) request(); });
  io.observe(canvas);

  return {
    /** 0…1. Below 1 the mosaic resolves; at 1 the full picture fades in. */
    setProgress(p) {
      progress = Math.min(1, Math.max(0, p));
      request();
    },
    get progress() { return progress; },
    /** Place the lens without a pointer (x, y in CSS px; strength 0…1), e.g. for a still frame. */
    setLens(x, y, strength = 1) {
      lens.tx = lens.x = x; lens.ty = lens.y = y; lens.ts = lens.s = strength;
      request();
    },
    /** Repaint the picture (after changing what paint() draws). */
    repaint() { layout(); request(); },
    /** Cells drawn in the last frame. */
    get cells() { return cells; },
    destroy() {
      cancelAnimationFrame(raf);
      ro.disconnect(); io.disconnect();
      darkQuery.removeEventListener('change', onTheme);
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerdown', onMove);
      target.removeEventListener('pointerleave', onLeave);
      target.removeEventListener('pointercancel', onLeave);
    }
  };
}
