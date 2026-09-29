/* The stone the moss grows on, and the moss field over it.
   A rounded block, compressed after rounding so the corners stay soft in plan while the shoulder stays tight. The moss
   is a height field over a flat (x, z) grid: cushions and knobs on the top, a carpet that creeps part of the way down
   the walls and stops at a ragged line. */
export const STONE = { width: 2.2, depth: 2.0, modelHeight: 1.6, thickness: .9, radius: .5 } as const;
/** how far past the edge the moss grid reaches; that margin is wrapped down onto the wall */
export const DRAPE = .55;
/* Hash Kit (our own hash, see shelf/items/hash-kit): integers in, 0…1 out — the same bits the shaders get */
const hashU = (x: number) => { x ^= x >>> 16; x = Math.imul(x, 0x3f9c86cb); x ^= x >>> 14; x = Math.imul(x, 0x1ae9dacf); x ^= x >>> 15; return x >>> 0; };
export const rand = (n: number) => (hashU((Math.floor(n) + 0xb31c96c9) >>> 0) >>> 8) / 16777216;
export const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

const cx = STONE.width / 2 - STONE.radius, cz = STONE.depth / 2 - STONE.radius;
const sy = STONE.thickness / STONE.modelHeight;

/** Top hemisphere of the compressed rounded box, shoulders included: the point and its normal, or null past the edge. */
export function topSurface(x: number, z: number) {
  const qx = Math.max(0, Math.abs(x) - cx), qz = Math.max(0, Math.abs(z) - cz);
  const d2 = qx * qx + qz * qz;
  if (d2 > STONE.radius * STONE.radius) return null;
  const h = Math.sqrt(Math.max(0, STONE.radius * STONE.radius - d2));
  const nx = Math.sign(x) * qx, ny = h / sy, nz = Math.sign(z) * qz;
  const length = Math.hypot(nx, ny, nz);
  return { y: sy * (h - STONE.radius), nx: nx / length, ny: ny / length, nz: nz / length };
}

/** Where the layer is attached for a grid point: on the top with the true normal, or, past the edge, wrapped onto the
    wall. `wall` runs from 0 at the shoulder to 1 at the lower lip; (bx, bz) is the point of the top edge above. */
export type Anchor = { p: [number, number, number]; n: [number, number, number]; wall: number; bx: number; bz: number };
export function anchorAt(x: number, z: number): Anchor {
  const top = topSurface(x, z);
  if (top) return { p: [x, top.y, z], n: [top.nx, top.ny, top.nz], wall: 0, bx: x, bz: z };
  const qx = Math.max(0, Math.abs(x) - cx), qz = Math.max(0, Math.abs(z) - cz), dist = Math.hypot(qx, qz);
  const dx = Math.sign(x) * qx / dist, dz = Math.sign(z) * qz / dist;
  const bx = Math.sign(x) * Math.min(Math.abs(x), cx) + dx * STONE.radius, bz = Math.sign(z) * Math.min(Math.abs(z), cz) + dz * STONE.radius;
  const wall = (dist - STONE.radius) / DRAPE;
  const yTop = -sy * STONE.radius, yBottom = -(STONE.thickness - sy * STONE.radius);
  return { p: [bx, yTop + (yBottom - yTop) * Math.min(1, wall), bz], n: [dx, 0, dz], wall, bx, bz };
}

const hash = (i: number, j: number) => (hashU((i + hashU((j + 0xb31c96c9) >>> 0)) >>> 0) >>> 8) / 16777216;
const ease = (t: number) => t * t * (3 - 2 * t);
function noise(x: number, z: number) {
  const i = Math.floor(x), j = Math.floor(z), u = ease(x - i), v = ease(z - j);
  return (hash(i, j) * (1 - u) + hash(i + 1, j) * u) * (1 - v) + (hash(i, j + 1) * (1 - u) + hash(i + 1, j + 1) * u) * v;
}
export function fbm(x: number, z: number) {
  let sum = 0, amp = .5;
  for (let o = 0; o < 4; o++) { sum += noise(x, z) * amp; x = x * 2.03 + 11.7; z = z * 2.03 + 5.3; amp *= .5; }
  return sum / .9375;
}

/* Moss grows as cushions: a union of flattened domes with small knobs riding on them. The knobs are what makes it read
   as moss and not as a lawn. A coarse grid of buckets keeps every lookup to the few domes that can reach the point. */
type Dome = { x: number; z: number; r: number; k: number };
const CELL = .5, COLS = 9, OFFSET = 2.2;
const bucket = (list: Dome[]) => {
  const cells: Dome[][] = Array.from({ length: COLS * COLS }, () => []);
  const index = (v: number) => Math.min(COLS - 1, Math.max(0, Math.floor((v + OFFSET) / CELL)));
  for (const c of list)
    for (let j = index(c.z - c.r); j <= index(c.z + c.r); j++)
      for (let i = index(c.x - c.r); i <= index(c.x + c.r); i++) cells[j * COLS + i].push(c);
  return (x: number, z: number) => cells[index(z) * COLS + index(x)];
};
const cushions: Dome[] = [], knobs: Dome[] = [];
for (let n = 0; cushions.length < 70 && n < 4000; n++) {
  const x = (rand(n * 5 + 901) - .5) * STONE.width, z = (rand(n * 5 + 902) - .5) * STONE.depth;
  if (topSurface(x, z)) cushions.push({ x, z, r: .14 + rand(n * 5 + 903) * .30, k: .45 + rand(n * 5 + 904) * .4 });
}
for (let n = 0; knobs.length < 420 && n < 9000; n++) {
  const x = (rand(n * 5 + 1901) - .5) * STONE.width, z = (rand(n * 5 + 1902) - .5) * STONE.depth;
  if (topSurface(x, z)) knobs.push({ x, z, r: .05 + rand(n * 5 + 1903) * .075, k: .55 + rand(n * 5 + 1904) * .35 });
}
const cushionsNear = bucket(cushions), knobsNear = bucket(knobs);
/* cushions are paraboloids: a hemisphere would meet its neighbours with a vertical wall, which the grid of the sheet
   can only draw as a staircase. Knobs ride on top, so they stay round. */
const cushionAt = (x: number, z: number) => {
  let h = 0;
  for (const c of cushionsNear(x, z)) { const dx = x - c.x, dz = z - c.z; h = Math.max(h, (1 - (dx * dx + dz * dz) / (c.r * c.r)) * c.r * .9 * c.k); }
  return h;
};
const knobAt = (x: number, z: number) => {
  let h = 0;
  for (const c of knobsNear(x, z)) { const dx = x - c.x, dz = z - c.z, d2 = dx * dx + dz * dz; if (d2 < c.r * c.r) h = Math.max(h, Math.sqrt(c.r * c.r - d2) * c.k); }
  return h;
};
/** 0 in the creases between knobs, 1 on their crowns: drives the colour of the pile */
export const mossKnob = (x: number, z: number) => Math.min(1, knobAt(x, z) / .07);
const CARPET = .045;

/** Thickness of the moss for a grid point. On the walls the carpet thins out and stops at a ragged line; below it the
    height goes negative, the vertex sinks just under the stone and the stone itself cuts a smooth edge. */
export function mossAt(x: number, z: number, anchor = anchorAt(x, z)) {
  const wallMoss = () => {
    const stop = .42 + (fbm(anchor.bx * 2.6 + 7, anchor.bz * 2.6) - .5) * .7;
    return (CARPET + .02 + fbm(anchor.bx * 5 + anchor.wall * 4, anchor.bz * 5) * .07) * (1 - smooth(stop - .18, stop, anchor.wall)) - smooth(stop, stop + .08, anchor.wall) * .06;
  };
  if (anchor.wall > 0) return wallMoss();
  const big = Math.max(cushionAt(x, z), CARPET);
  const top = big + knobAt(x, z) * Math.min(1, big / .05);
  /* on the rounded shoulder the cushions hand over to the wall carpet, so the sheet is continuous round the edge */
  const flat = Math.min(1, anchor.n[1] * anchor.n[1] * 1.15);
  return flat >= 1 ? top : top * flat + wallMoss() * (1 - flat);
}

/** When the moss arrives at a point, 0….62: from a spot on the top outwards, then down the walls. */
export const arrivalAt = (anchor: Anchor) => Math.min(.62, Math.hypot(anchor.bx - .35, anchor.bz - .25) / 1.9 * .48 + Math.min(1, anchor.wall) * .14);
