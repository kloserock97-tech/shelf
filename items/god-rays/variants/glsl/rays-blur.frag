#version 300 es
precision highp float;
// God rays, passes 2 and 3 (quarter resolution): radial blur toward the sun.
// Run twice: a long pass (uStep 0.9) draws the fan, a short one (0.35) smooths the first one's steps.
uniform sampler2D tInput;
uniform vec2 uSun;
uniform float uStep;   // share of the way to the sun that the samples cover
uniform float uDecay;  // weight falloff per sample (site: 0.96)
in vec2 vUv;
out vec4 fragColor;

const int SAMPLES = 36;

// our screen dither (Hash Kit): a lattice without low frequencies, so neighbouring pixels differ a lot
float dither(vec2 p) { return fract(dot(floor(p), vec2(0.3455768, 0.4279792))); }

void main() {
  vec2 delta = (uSun - vUv) * uStep / float(SAMPLES);
  // A jittered start turns the visible steps between samples into fine noise.
  vec2 uv = vUv + delta * dither(gl_FragCoord.xy);
  vec3 sum = vec3(0.0);
  float w = 1.0, total = 0.0;
  for (int i = 0; i < SAMPLES; i++) {
    // textureLod: no implicit derivatives inside a loop (ANGLE/D3D otherwise unrolls it with a warning)
    sum += textureLod(tInput, uv, 0.0).rgb * w;
    total += w;
    w *= uDecay;
    uv += delta;
  }
  fragColor = vec4(sum / total, 1.0);
}
