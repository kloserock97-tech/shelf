#version 300 es
precision highp float;
// God rays, final pass: the rays are added to the HDR frame before tone mapping, so they burn into the
// highlights exactly like the sun does. Then grade, sRGB, vignette and a still grain.
uniform sampler2D tScene;   // linear HDR
uniform sampler2D tRays;    // quarter resolution; a bilinear upscale is enough, the rays are soft anyway
uniform sampler2D tMask;    // debug view only
uniform float uRays;        // strength × fade-out (site: 0.32)
uniform vec3 uRayTint;      // warm tint (site: 1.0, 0.86, 0.66)
uniform float uExposure;
uniform float uVignette;    // site: 0.55
uniform float uGrain;       // site: 0.012
uniform int uView;          // 0 — final, 1 — the mask, 2 — the blurred rays
in vec2 vUv;
out vec4 fragColor;

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }

// Tone curve: straight up to 0.72, then an exponential shoulder that approaches 1.0 without clipping.
vec3 toneCurve(vec3 c) {
  const float s = 0.72;
  vec3 over = max(c - s, 0.0);
  return min(c, vec3(s)) + (1.0 - s) * (1.0 - exp(-over / (1.0 - s)));
}

vec3 toSrgb(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(pow(c, vec3(0.41666)) * 1.055 - 0.055, c * 12.92, vec3(lessThanEqual(c, vec3(0.0031308))));
}

// Contrast in log space around middle grey, the tone curve, then vibrance that spares saturated colours.
vec3 grade(vec3 hdr) {
  vec3 lg = log2(max(hdr, 1e-5) / 0.18);
  hdr = 0.18 * pow(vec3(2.0), lg * 1.06);
  vec3 c = toneCurve(hdr);
  float lum = dot(c, LUMA);
  float sat = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
  c = max(mix(vec3(lum), c, 1.0 + 0.18 * (1.0 - sat)), 0.0);
  return toSrgb(c);
}

void main() {
  vec3 hdr;
  if (uView == 1) hdr = texture(tMask, vUv).rgb;
  else if (uView == 2) hdr = texture(tRays, vUv).rgb * uRayTint;
  else hdr = texture(tScene, vUv).rgb + texture(tRays, vUv).rgb * uRayTint * uRays;
  vec3 c = grade(hdr * uExposure);
  vec2 q = vUv - 0.5;
  c *= 1.0 - dot(q, q) * uVignette;
  // still grain on IGN: removes banding in the sky gradient and does not flicker
  c += (ign(gl_FragCoord.xy) - 0.5) * uGrain;
  fragColor = vec4(c, 1.0);
}
