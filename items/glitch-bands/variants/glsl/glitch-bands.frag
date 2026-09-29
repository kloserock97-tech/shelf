#version 300 es
precision highp float;
// Glitch transition between two pictures. Horizontal bands of random height jump sideways, some of them turn
// into big pixel blocks, and every shifted band splits into colour channels. Everything changes in jerks:
// uSeed is an integer that ticks 18 times a second and with the progress, so the bands jump rather than float.
// The picture switches at the peak, when the glitch hides the cut; glitched bands may switch early or late.
uniform sampler2D tFrom;     // linear HDR
uniform sampler2D tTo;
uniform float uGlitch;       // strength right now, 0..1 (a bell over the progress × the overall strength)
uniform float uSeed;         // integer: floor(time · 18) + floor(progress · 60)
uniform float uProgress;     // 0..1
uniform float uFlash;        // 0..1, cold white balance at the peak
uniform float uFade;         // 1 — reduced motion: a plain crossfade instead of the cut
in vec2 vUv;
out vec4 fragColor;

// Integer hash: xorshift and a multiply by 2^32/phi, twice.
// Hash Kit (our own hash, see shelf/items/hash-kit)
uint hashU(uint x) { x ^= x >> 16; x *= 0x3f9c86cbu; x ^= x >> 14; x *= 0x1ae9dacfu; x ^= x >> 15; return x; }
float rnd(int a, int b) { return float(hashU(uint(a) + hashU(uint(b) + 0xb31c96c9u)) >> 8) / 16777216.0; }

vec3 pick(sampler2D t, vec2 uv, float split) {
  vec3 c = texture(t, uv).rgb;
  if (split > 0.0) {
    c.r = texture(t, uv + vec2(split, 0.0)).r;
    c.b = texture(t, uv - vec2(split, 0.0)).b;
  }
  return c;
}

vec3 toneCurve(vec3 c) {
  const float s = 0.72;
  vec3 over = max(c - s, 0.0);
  return min(c, vec3(s)) + (1.0 - s) * (1.0 - exp(-over / (1.0 - s)));
}
vec3 toSrgb(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(pow(c, vec3(0.41666)) * 1.055 - 0.055, c * 12.92, vec3(lessThanEqual(c, vec3(0.0031308))));
}

void main() {
  vec2 uv = vUv;
  float split = 0.0;
  float flip = 0.0;
  int seed = int(uSeed);
  if (uGlitch > 0.001) {
    float rows = mix(14.0, 60.0, rnd(0, seed));                   // 14 to 60 bands, new every jerk
    int band = int(floor(vUv.y * rows));
    float on = step(1.0 - uGlitch * 0.75, rnd(band * 4 + 1, seed)); // at full strength 3 bands of 4 go
    uv.x = fract(uv.x + (rnd(band * 4 + 2, seed) - 0.5) * 0.18 * uGlitch * on);
    // blocks: coarse pixelation in some of the glitched bands (cells 1.6 times wider than tall)
    float px = mix(1.0, 90.0, on * step(0.6, rnd(band * 4 + 3, seed)));
    uv = px > 1.0 ? (floor(uv * vec2(px * 1.6, px)) + 0.5) / vec2(px * 1.6, px) : uv;
    split = (0.004 + 0.02 * on) * uGlitch;
    flip = on * step(0.5, rnd(band * 4 + 4, seed));
  }
  // the cut: at the middle for the frame, earlier or later inside half of the glitched bands
  float toB = abs(step(0.5, uProgress) - flip);
  float w = uFade > 0.5 ? smoothstep(0.35, 0.65, uProgress) : toB;
  vec3 hdr = mix(pick(tFrom, uv, split), pick(tTo, uv, split), w);
  hdr *= mix(vec3(1.0), vec3(0.86, 0.95, 1.12), uFlash);         // cold flash, like a camera losing signal
  vec3 c = toSrgb(toneCurve(hdr));
  vec2 q = vUv - 0.5;
  c *= 1.0 - dot(q, q) * 0.55;
  fragColor = vec4(c, 1.0);
}
