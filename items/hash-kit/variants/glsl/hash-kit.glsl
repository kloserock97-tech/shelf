// Hash Kit — our own integer hash, grid and float hashes, and a screen dither. WebGL2 / GLSL ES 3.00 (uint).
// hashU is a xorshift–multiply mixer; its shifts (16/14/15) and multipliers come from our own search
// (avalanche bias 0.096 on 2^24 samples, see the notes). The JavaScript version returns the same bits.

const uint HASH_SALT = 0xb31c96c9u;   // keeps cell (0, 0) away from the mixer's fixed point hashU(0) = 0

uint hashU(uint x) {
  x ^= x >> 16; x *= 0x3f9c86cbu;
  x ^= x >> 14; x *= 0x1ae9dacfu;
  x ^= x >> 15;
  return x;
}
uint hashU(uvec2 v) { return hashU(v.x + hashU(v.y + HASH_SALT)); }
uint hashU(uvec3 v) { return hashU(v.x + hashU(v.y + hashU(v.z + HASH_SALT))); }

// 0…1 from the top 24 bits: exact in a float and never 1.0
float hashUnit(uint h) { return float(h >> 8) * (1.0 / 16777216.0); }

// the cell a point falls into (negative coordinates are fine)
float hash1(float x) { return hashUnit(hashU(uint(int(floor(x))) + HASH_SALT)); }
float hash2(vec2 p) { return hashUnit(hashU(uvec2(ivec2(floor(p))))); }
float hash3(vec3 p) { return hashUnit(hashU(uvec3(ivec3(floor(p))))); }
// any float as it is (a time seed, a band index times 1.37…): hashes its bit pattern
float hashBits(float x) { return hashUnit(hashU(floatBitsToUint(x) + HASH_SALT)); }

// Screen dither: a lattice whose strong harmonics sit at high frequencies, so neighbouring pixels differ a lot
// and there are no blotches. Breaks banding in gradients and jitters sample patterns. Pass gl_FragCoord.xy.
float dither(vec2 pixel) { return fract(dot(floor(pixel), vec2(0.3455768, 0.4279792))); }
