#version 300 es
precision highp float;
// Disk blur on a Vogel spiral. Sample k is turned by the golden angle from the previous one and sits at
// sqrt((k + 0.5) / N) of the radius, so N samples cover the disk evenly, the centre included.
// The whole spiral is turned by per-pixel noise: with few samples the leftover pattern becomes fine grain.
// For comparison, left of uSplit: the older version, all samples on two rings (R and 0.49 R).
// A small bright point then spreads into a ring with an empty middle — a "donut".
uniform sampler2D tInput;   // linear HDR
uniform float uR;           // radius in frame-height units (site: up to 0.016)
uniform float uAspect;      // width / height
uniform int uCount;         // samples (site: 16)
uniform float uRotate;      // 1 — turn the pattern per pixel, 0 — the same pattern everywhere
uniform float uSplit;       // left of this x: two rings; -1 — the spiral everywhere
in vec2 vUv;
out vec4 fragColor;

// our screen dither (Hash Kit): a lattice without low frequencies, so neighbouring pixels differ a lot
float dither(vec2 p) { return fract(dot(floor(p), vec2(0.3455768, 0.4279792))); }

void main() {
  float rot = dither(gl_FragCoord.xy) * 6.2831 * uRotate;
  float n = float(uCount);
  bool rings = vUv.x < uSplit;
  vec3 acc = vec3(0.0);
  for (int k = 0; k < uCount; k++) {
    float a, r;
    if (rings) {
      a = float(k) * 6.2831 / n + rot;
      r = k % 2 == 0 ? uR : uR * 0.49;
    } else {
      a = float(k) * 2.39996 + rot;                 // golden angle
      r = uR * sqrt((float(k) + 0.5) / n);
    }
    // textureLod: no mipmaps here, and no implicit derivatives inside the loop
    acc += textureLod(tInput, vUv + vec2(cos(a) * r / uAspect, sin(a) * r), 0.0).rgb;
  }
  fragColor = vec4(acc / n, 1.0);
}
