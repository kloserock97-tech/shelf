/* Gem Shapes: 2D signed distance fields for the gem icons. Every shape is a plain function f(x, y) on a 24-unit grid
   (x right, y down, the centre at 0, the outline kept within ±10.5), negative inside, built from a few primitives
   with min (union) and max(a, −b) (cut). The shapes are baked once into tiles of an atlas; the shader only samples
   the atlas, so the cost of a frame does not depend on how complex an icon is. */

const hypot = Math.hypot;

export function circle(x, y, cx, cy, r) {
  return hypot(x - cx, y - cy) - r;
}

/** rectangle centred at (cx, cy) with half sizes hw × hh and corner radius r */
export function box(x, y, cx, cy, hw, hh, r = 0) {
  const dx = Math.abs(x - cx) - hw + r;
  const dy = Math.abs(y - cy) - hh + r;
  return hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - r;
}

/** segment a → b thickened by r */
export function capsule(x, y, ax, ay, bx, by, r) {
  const px = x - ax, py = y - ay, vx = bx - ax, vy = by - ay;
  const t = Math.max(0, Math.min(1, (px * vx + py * vy) / (vx * vx + vy * vy || 1)));
  return hypot(px - vx * t, py - vy * t) - r;
}

/** any simple polygon [x0, y0, x1, y1, …]: the exact distance to the nearest edge, the sign from an even-odd count */
export function polygon(x, y, pts) {
  let d = Infinity;
  let inside = false;
  const n = pts.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const ax = pts[j * 2], ay = pts[j * 2 + 1], bx = pts[i * 2], by = pts[i * 2 + 1];
    d = Math.min(d, capsule(x, y, ax, ay, bx, by, 0));
    if ((ay > y) !== (by > y) && x < ax + ((y - ay) * (bx - ax)) / (by - ay)) inside = !inside;
  }
  return inside ? -d : d;
}

/** star polygon: n points on radius R, n dents on radius r, the first point straight up */
export function starPoints(cx, cy, n, R, r) {
  const pts = [];
  for (let k = 0; k < n * 2; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / n;
    const rr = k % 2 ? r : R;
    pts.push(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  return pts;
}

/** a kite from point (tx, ty) to circle (cx, cy, r) along its two tangents; joined with the circle it gives a drop */
export function tangentKite(tx, ty, cx, cy, r) {
  const dx = cx - tx, dy = cy - ty, L = hypot(dx, dy);
  const base = Math.atan2(dy, dx), a = Math.asin(r / L), t = Math.sqrt(L * L - r * r);
  return [tx, ty, tx + Math.cos(base - a) * t, ty + Math.sin(base - a) * t, cx, cy, tx + Math.cos(base + a) * t, ty + Math.sin(base + a) * t];
}

const cut = (a, b) => Math.max(a, -b);

// fixed geometry, computed once
const STAR = starPoints(0, 0.9, 5, 10.4, 4.4);
const SPARK_BIG = starPoints(-1.3, 1.3, 4, 9.4, 2.4);
const SPARK_SMALL = starPoints(6.7, -6.7, 4, 3.7, 1);
const HOUSE = [0, -9.6, 10, -0.6, 7.1, -0.6, 7.1, 9, -7.1, 9, -7.1, -0.6, -10, -0.6];
const BOLT = [2.6, -10.6, -7.6, 1.7, -0.6, 1.7, -2.6, 10.6, 7.6, -1.7, 0.6, -1.7];
const DROP = tangentKite(0, -10.6, 0, 3.6, 6.7);
const PIN = tangentKite(0, 10.8, 0, -3, 7.3);
const BELL = [-5.6, -2.4, 5.6, -2.4, 7.9, 5.2, -7.9, 5.2];
const TAIL = [-5.8, 3.4, -0.6, 3.4, -7, 10.2];
// heart: two lobes and the kite from the tip to both of them
const HEART_L = tangentKite(0, 9, -4.3, -3.2, 4.7);
const HEART_R = tangentKite(0, 9, 4.3, -3.2, 4.7);

/** name → f(x, y) on the 24 grid */
export const SHAPES = {
  home: (x, y) => cut(polygon(x, y, HOUSE), box(x, y, 0, 6.2, 2.2, 3.4, 0.7)),
  mail: (x, y) =>
    cut(
      box(x, y, 0, 0.6, 9.8, 7.3, 1.7),
      Math.min(capsule(x, y, -9.8, -6.6, 0, 1.6, 0.8), capsule(x, y, 0, 1.6, 9.8, -6.6, 0.8))
    ),
  star: (x, y) => polygon(x, y, STAR),
  heart: (x, y) =>
    Math.min(circle(x, y, -4.3, -3.2, 4.7), circle(x, y, 4.3, -3.2, 4.7), polygon(x, y, HEART_L), polygon(x, y, HEART_R)),
  lock: (x, y) => {
    const ring = y <= -3 ? Math.abs(hypot(x, y + 3) - 4.8) - 1.3 : Infinity;
    const legs = Math.min(capsule(x, y, -4.8, -3, -4.8, -0.5, 1.3), capsule(x, y, 4.8, -3, 4.8, -0.5, 1.3));
    const body = box(x, y, 0, 3.9, 8, 5.7, 1.8);
    const hole = Math.min(circle(x, y, 0, 2.6, 1.8), box(x, y, 0, 5.2, 0.8, 2.2, 0.4));
    return cut(Math.min(ring, legs, body), hole);
  },
  bell: (x, y) =>
    Math.min(
      circle(x, y, 0, -9.3, 1.5),
      circle(x, y, 0, -2.4, 5.6),
      polygon(x, y, BELL),
      box(x, y, 0, 5.9, 9.4, 1.3, 1),
      circle(x, y, 0, 9.4, 1.9)
    ),
  bolt: (x, y) => polygon(x, y, BOLT),
  drop: (x, y) => Math.min(circle(x, y, 0, 3.6, 6.7), polygon(x, y, DROP)),
  chat: (x, y) =>
    cut(
      Math.min(box(x, y, 0, -1.8, 10, 7.3, 3.4), polygon(x, y, TAIL)),
      Math.min(circle(x, y, -4.3, -1.8, 1.35), circle(x, y, 0, -1.8, 1.35), circle(x, y, 4.3, -1.8, 1.35))
    ),
  moon: (x, y) => cut(circle(x, y, -0.7, 0.5, 9.6), circle(x, y, 4.8, -4.3, 7.8)),
  pin: (x, y) => cut(Math.min(circle(x, y, 0, -3, 7.3), polygon(x, y, PIN)), circle(x, y, 0, -3, 2.9)),
  sparkle: (x, y) => Math.min(polygon(x, y, SPARK_BIG), polygon(x, y, SPARK_SMALL))
};

/** default colour of each gem (sRGB hex); a button's --gem overrides it */
export const GEM_COLORS = {
  home: '#ffb648', mail: '#3d7dff', star: '#ffd23c', heart: '#ff2f5b', lock: '#19c27a', bell: '#ff8a3a',
  bolt: '#f2e14b', drop: '#2fc6ff', chat: '#9c5cff', moon: '#6c70ff', pin: '#ff5f93', sparkle: '#c4e4ff'
};

/**
 * Bakes the shapes into one float atlas: tile side T, tiles in rows of `cols`. Inside a tile u, v run −1…1 and map to
 * the 24 grid as x = 12u, y = −12v (rows go bottom-up, as the GPU reads them). Distances are stored in tile units
 * (24-grid units / 12).
 */
export function bakeAtlas(names, T = 128) {
  const cols = Math.ceil(Math.sqrt(names.length));
  const rows = Math.ceil(names.length / cols);
  const W = cols * T, H = rows * T;
  const data = new Float32Array(W * H).fill(1);
  const tiles = names.map((name, k) => {
    const f = SHAPES[name] || SHAPES.star;
    const ox = (k % cols) * T, oy = Math.floor(k / cols) * T;
    for (let j = 0; j < T; j++) {
      const y = -12 * (-1 + (2 * j) / (T - 1));
      const row = (oy + j) * W + ox;
      for (let i = 0; i < T; i++) data[row + i] = f(12 * (-1 + (2 * i) / (T - 1)), y) / 12;
    }
    return [ox, oy];
  });
  return { data, W, H, T, tiles };
}

/** a flat silhouette of a shape as a data URL (alpha mask), for the look without WebGL2 */
export function silhouette(name, size = 96) {
  const f = SHAPES[name] || SHAPES.star;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  const k = 24 / size; // grid units per pixel
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const d = f((i + 0.5) * k - 12, (j + 0.5) * k - 12) / k; // in pixels
      const a = Math.max(0, Math.min(1, 0.5 - d));
      const o = (j * size + i) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = 0;
      img.data[o + 3] = Math.round(a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  return c.toDataURL('image/png');
}
