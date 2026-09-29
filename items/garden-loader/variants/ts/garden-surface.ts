/* The geometry of the loading object, shared by everything that lies on it.
   A thick slab (thickness ≈ 14 % of the width) with a small vertical bevel: the box is rounded at `modelHeight` and
   then compressed, so the corner radius in plan stays large while the edge bevel stays tight. */
export const TILE = { width: 3.05, depth: 3.25, modelHeight: 1.5, thickness: .42, radius: .36 } as const;
/* Hash Kit (our own hash, see shelf/items/hash-kit): integers in, 0…1 out — the same bits the shaders get */
const hashU = (x: number) => { x ^= x >>> 16; x = Math.imul(x, 0x3f9c86cb); x ^= x >>> 14; x = Math.imul(x, 0x1ae9dacf); x ^= x >>> 15; return x >>> 0; };
export const rand = (n: number) => (hashU((Math.floor(n) + 0xb31c96c9) >>> 0) >>> 8) / 16777216;
/** smoothstep with the range first: 0 below a, 1 above b */
export const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Order in which the moss takes the slab: small in the warm corner (+x, +z), .70 in the far, cold one. */
const delayAt = (x: number, z: number) => Math.min(.70, Math.max(.025,
  Math.hypot((x - 1.15) * .8, z - 1.1) / 4.5 + Math.sin(x * 5 + z * 3) * .035));
export const GARDEN_DELAY_GLSL = "clamp(length(vec2((x-1.15)*.8,z-1.1))/4.5+sin(x*5.+z*3.)*.035,.025,.70)";

/** 100 % means the whole solid is overgrown, walls included. The front starts in the warm corner and reaches the
    cold one at FRONT; the rest of the run is for the pile, the walls and the bloom. The classic look (moss in one
    corner, ice and drops on bare glass) is the middle of the run. */
export const FRONT = .66;
export const seedDelay = (x: number, z: number) => delayAt(x, z) / .70 * FRONT;
/** how far past the edge a layer's grid reaches; that margin is wrapped down onto the wall */
export const DRAPE = .3;

const cx = TILE.width / 2 - TILE.radius, cz = TILE.depth / 2 - TILE.radius;
const sy = TILE.thickness / TILE.modelHeight;
export type GardenSurface = { x: number; y: number; z: number; nx: number; ny: number; nz: number };

/** Top hemisphere of the compressed rounded box, including its curved shoulders. */
export function topSurface(x: number, z: number): GardenSurface | null {
  const qx = Math.max(0, Math.abs(x) - cx), qz = Math.max(0, Math.abs(z) - cz);
  const d2 = qx * qx + qz * qz;
  if (d2 > TILE.radius * TILE.radius) return null;
  const h = Math.sqrt(Math.max(0, TILE.radius * TILE.radius - d2));
  const nx = Math.sign(x) * qx, ny = h / sy, nz = Math.sign(z) * qz;
  const length = Math.hypot(nx, ny, nz);
  return { x, y: sy * (h - TILE.radius), z, nx: nx / length, ny: ny / length, nz: nz / length };
}

/** Where a layer (moss, ice) is attached for a grid point (x, z).
    Inside the footprint: the point on the top, with the true normal, so a thick layer on the shoulder leans out over
    the edge. Past the edge: the grid margin is wrapped onto the wall. `wall` runs from 0 at the shoulder to 1 at the
    lower lip and past 1 it tucks under, (bx, bz) is the point of the top edge above. A layer of height h stands at p + n·h. */
export type Anchor = { p: [number, number, number]; n: [number, number, number]; wall: number; bx: number; bz: number };
export function anchorAt(x: number, z: number): Anchor {
  const top = topSurface(x, z);
  if (top) return { p: [x, top.y, z], n: [top.nx, top.ny, top.nz], wall: 0, bx: x, bz: z };
  const qx = Math.max(0, Math.abs(x) - cx), qz = Math.max(0, Math.abs(z) - cz), dist = Math.hypot(qx, qz);
  const dx = Math.sign(x) * qx / dist, dz = Math.sign(z) * qz / dist;
  const bx = Math.sign(x) * Math.min(Math.abs(x), cx) + dx * TILE.radius, bz = Math.sign(z) * Math.min(Math.abs(z), cz) + dz * TILE.radius;
  /* past 1 the layer tucks under the lower lip, so no rim of bare glass shows below an overgrown wall */
  const wall = (dist - TILE.radius) / DRAPE;
  const yTop = -sy * TILE.radius, yBottom = -(TILE.thickness - sy * TILE.radius);
  return { p: [bx, yTop + (yBottom - yTop) * Math.min(1, wall) - Math.max(0, wall - 1) * .12, bz], n: [dx, 0, dz], wall, bx, bz };
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

/* ── moss ───────────────────────────────────────────────────────────────────────────────────────── */

/** Moss grows as cushions: a union of flattened domes with small knobs riding on them. The knobs are what makes it
    read as moss and not as a lawn. Cushions are tall in the warm corner and low towards the cold one. */
type Cushion = { x: number; z: number; r: number; k: number };
const CELL = .5, COLS = 9, OFFSET = 2.2;
/* hundreds of domes and thousands of lookups at start-up: a coarse grid keeps every lookup to the few domes that can
   reach the point */
const bucket = (list: Cushion[]) => {
  const cells: Cushion[][] = Array.from({ length: COLS * COLS }, () => []);
  const index = (v: number) => Math.min(COLS - 1, Math.max(0, Math.floor((v + OFFSET) / CELL)));
  for (const c of list) {
    for (let j = index(c.z - c.r); j <= index(c.z + c.r); j++)
      for (let i = index(c.x - c.r); i <= index(c.x + c.r); i++) cells[j * COLS + i].push(c);
  }
  return (x: number, z: number) => cells[index(z) * COLS + index(x)];
};
const cushionList: Cushion[] = [], knobList: Cushion[] = [];
for (let n = 0; cushionList.length < 130 && n < 6000; n++) {
  const x = (rand(n * 5 + 901) - .5) * TILE.width, z = (rand(n * 5 + 902) - .5) * TILE.depth;
  if (!topSurface(x, z)) continue;
  const warm = 1 - Math.min(1, Math.max(0, (delayAt(x, z) - .16) / .34));
  cushionList.push({ x, z, r: (.14 + rand(n * 5 + 903) * .30) * (.55 + .45 * warm), k: (.6 + rand(n * 5 + 904) * .4) * (.26 + 1.0 * warm) });
}
for (let n = 0; knobList.length < 620 && n < 12000; n++) {
  const x = (rand(n * 5 + 1901) - .5) * TILE.width, z = (rand(n * 5 + 1902) - .5) * TILE.depth;
  if (!topSurface(x, z)) continue;
  knobList.push({ x, z, r: .05 + rand(n * 5 + 1903) * .075, k: .55 + rand(n * 5 + 1904) * .35 });
}
const cushionsNear = bucket(cushionList), knobsNear = bucket(knobList);
/* cushions are paraboloids: a hemisphere would meet its neighbours and the carpet with a vertical wall, which the
   grid of the sheet can only draw as a staircase. Knobs ride on top, so they stay round. */
const cushionAt = (x: number, z: number) => {
  let h = 0;
  for (const c of cushionsNear(x, z)) {
    const dx = x - c.x, dz = z - c.z, r2 = c.r * c.r;
    h = Math.max(h, (1 - (dx * dx + dz * dz) / r2) * c.r * .9 * c.k);
  }
  return h;
};
const knobAt = (x: number, z: number) => {
  let h = 0;
  for (const c of knobsNear(x, z)) {
    const dx = x - c.x, dz = z - c.z, d2 = dx * dx + dz * dz, r2 = c.r * c.r;
    if (d2 < r2) h = Math.max(h, Math.sqrt(r2 - d2) * c.k);
  }
  return h;
};
/** 0 in the creases between knobs, 1 on their crowns: drives the colour of the pile. */
export const mossKnob = (x: number, z: number) => Math.min(1, knobAt(x, z) / .07);
const CARPET = .045;
/** Thickness of the moss for a grid point: cushions on the top, a knobbly carpet down the walls and under the lip.
    Always positive on the top: at 100 % no glass is left. */
export function mossAt(x: number, z: number, anchor = anchorAt(x, z)) {
  /* the wall carpet costs a fractal noise lookup: only work it out where it is used, on the walls and the shoulder */
  const wallMoss = () => (CARPET + .02 + fbm(anchor.bx * 5 + anchor.wall * 4, anchor.bz * 5) * .07) * (1 - Math.max(0, anchor.wall - 1) / .3 * 1.6);
  if (anchor.wall > 0) return wallMoss();
  const big = Math.max(cushionAt(x, z), CARPET);
  const top = big + knobAt(x, z) * Math.min(1, big / .05);
  /* on the rounded shoulder the cushions hand over to the wall carpet, so the sheet is continuous round the edge */
  const flat = Math.min(1, anchor.n[1] * anchor.n[1] * 1.15);
  return flat >= 1 ? top : top * flat + wallMoss() * (1 - flat);
}

/* ── ice ────────────────────────────────────────────────────────────────────────────────────────── */

/** Ice lies along the cold edge (−x) and fills the cold corner (−x, −z): a jagged sheet, thickest at the corner.
    `t` is 0 at the corner and 1 at the edge of the sheet; melting eats it from the edge inwards. */
export function iceAt(x: number, z: number): { h: number; t: number } {
  const u = Math.max(0, (x + TILE.width / 2 + .16) / 1.7), v = Math.max(0, (z + TILE.depth / 2 + .16) / 3.0);
  const t = Math.pow(u, 1.15) + Math.pow(v, 1.6) + (fbm(x * 2.4 + 3, z * 2.4) - .5) * .46;
  if (t >= 1) return { h: Math.max(-.05, (1 - t) * .3), t };
  const edge = Math.min(1, (1 - t) / .16);
  const ridge = 1 - Math.abs(2 * fbm(x * 3.1 + 40, z * 3.1 + 9) - 1);
  /* a fine crust on top of the big ridges: this is what catches the light as frost */
  const crust = fbm(x * 11 + 7, z * 11 + 3);
  return { h: edge * (.06 + ridge * ridge * .24 * (.4 + .6 * (1 - t)) + crust * .035), t };
}
/** when the ice at a point starts to melt; all of it is gone before the run ends */
export const meltDelay = (t: number) => .14 + Math.max(0, 1 - t) * .40;
