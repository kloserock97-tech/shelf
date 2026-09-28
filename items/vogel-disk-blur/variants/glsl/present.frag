#version 300 es
precision highp float;
// Shows the blurred HDR buffer: a bilinear upscale from quarter resolution, tone curve, sRGB, vignette.
uniform sampler2D tInput;
in vec2 vUv;
out vec4 fragColor;

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
  vec3 c = toSrgb(toneCurve(texture(tInput, vUv).rgb));
  vec2 q = vUv - 0.5;
  fragColor = vec4(c * (1.0 - dot(q, q) * 0.55), 1.0);
}
