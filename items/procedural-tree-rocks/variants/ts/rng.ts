/** Seeded random numbers 0…1 — Hash Kit (our own, see shelf/items/hash-kit): a Weyl sequence through our mixer.
    The same seed grows the same tree and the same rocks. */
export function makeRng(seed = 0x3f9a1c7b) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0xb31c96c9) >>> 0;
    let x = s;
    x ^= x >>> 16; x = Math.imul(x, 0x3f9c86cb); x ^= x >>> 14; x = Math.imul(x, 0x1ae9dacf); x ^= x >>> 15;
    return (x >>> 0) / 4294967296;
  };
}
