/* Hash Kit — our own integer hash, grid hashes, seeded random numbers and a screen dither.
   Bit-for-bit the same as the GLSL version: Math.imul and >>> 0 keep everything in unsigned 32 bits,
   floats come from the top 24 bits. Checks: hashU(1) === 1488230143, hashU(123456789) === 2671570149. */

const SALT = 0xb31c96c9; // keeps cell (0, 0) away from the mixer's fixed point hashU(0) = 0

/** 32-bit mixer: shifts 16/14/15 and multipliers from our own search (avalanche bias 0.096). */
export function hashU(x: number): number {
  x ^= x >>> 16; x = Math.imul(x, 0x3f9c86cb);
  x ^= x >>> 14; x = Math.imul(x, 0x1ae9dacf);
  x ^= x >>> 15;
  return x >>> 0;
}
export const hash2U = (x: number, y: number): number => hashU((x + hashU((y + SALT) >>> 0)) >>> 0);
export const hash3U = (x: number, y: number, z: number): number => hashU((x + hashU((y + hashU((z + SALT) >>> 0)) >>> 0)) >>> 0);

/** 0…1 from the top 24 bits — the same number the shader gets. */
export const hashUnit = (h: number): number => (h >>> 8) / 16777216;

/** The cell a point falls into; negative coordinates are fine. */
export const hash1 = (x: number): number => hashUnit(hashU((Math.floor(x) + SALT) >>> 0));
export const hash2 = (x: number, y: number): number => hashUnit(hash2U(Math.floor(x), Math.floor(y)));
export const hash3 = (x: number, y: number, z: number): number => hashUnit(hash3U(Math.floor(x), Math.floor(y), Math.floor(z)));

/** Seeded random numbers 0…1: a Weyl sequence through the mixer. The same seed gives the same sequence. */
export function makeRandom(seed = 1): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + SALT) >>> 0;
    return hashU(s) / 4294967296;
  };
}

/** Screen dither 0…1 for pixel (x, y): a lattice with no low frequencies. */
export function dither(x: number, y: number): number {
  const v = Math.floor(x) * 0.3455768 + Math.floor(y) * 0.4279792;
  return v - Math.floor(v);
}
