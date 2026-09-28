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

// Interleaved gradient noise (Jorge Jimenez, 2014): almost blue noise, no texture needed.
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }

void main() {
  vec2 delta = (uSun - vUv) * uStep / float(SAMPLES);
  // A jittered start turns the visible steps between samples into fine noise.
  vec2 uv = vUv + delta * ign(gl_FragCoord.xy);
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
