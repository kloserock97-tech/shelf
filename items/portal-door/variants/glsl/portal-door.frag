#version 300 es
precision highp float;
// Portal door: a glass door stands in one scene, and another scene is behind it.
// The shape is a rounded rectangle in frame-height units (an SDF), so it stays crisp at any size. At the inner
// edge the picture refracts like thick glass: it shifts toward the centre and splits by colour. The edge is a
// thin glowing line with a warm halo, and light spills from the door onto the scene outside.
uniform sampler2D tScene;    // behind the door (inside), linear HDR
uniform sampler2D tPortal;   // around the door (outside), linear HDR
uniform vec2 uTexel;         // 1 / buffer size
uniform vec4 uPortal;        // centre (UV), half-height (share of the frame height), how much of the inside shows 0..1
uniform vec3 uPortal2;       // edge brightness 0..1, corner radius as a share of the half-width, door opacity 0..1
uniform float uRefract;      // 1 — refraction at the inner edge, 0 — a plain cut
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
  vec2 uv = vUv;
  vec3 outside = texture(tPortal, uv).rgb;
  vec3 e = outside;
  if (uPortal.z > 0.0) {
    float asp = uTexel.y / uTexel.x;
    vec2 pp = (uv - uPortal.xy) * vec2(asp, 1.0);
    vec2 hs = vec2(uPortal.z * 0.62, uPortal.z);          // the door is 0.62 as wide as tall
    float rr = hs.x * uPortal2.y;
    vec2 qq = abs(pp) - hs + rr;
    float dd = length(max(qq, 0.0)) + min(max(qq.x, qq.y), 0.0) - rr;   // < 0 inside
    float aa = uTexel.y * 1.5;
    float inside = 1.0 - smoothstep(-aa, aa, dd);
    // refraction along the inner edge: a band 4% of the frame height
    float band = 1.0 - smoothstep(0.0, 0.04, -dd);
    vec2 nrm = normalize(pp + 1e-5) / vec2(asp, 1.0);
    vec2 off = -nrm * band * band * 0.018 * uRefract;
    vec3 inner = vec3(texture(tScene, uv + off * 1.25).r, texture(tScene, uv + off).g, texture(tScene, uv + off * 0.75).b);
    // while the door is still appearing it is frosted glass over the outside; then the inside opens up
    vec3 glass = outside * 1.12 + vec3(0.06, 0.05, 0.035);
    inner = mix(glass, inner, uPortal.w);
    // a soft diagonal glare on the glass, top left
    vec2 lp = (pp + hs) / (2.0 * hs);
    inner += vec3(1.0, 0.95, 0.85) * 0.07 * smoothstep(0.55, 0.0, lp.x + (1.0 - lp.y) * 0.6) * uPortal2.x;
    vec3 door = mix(outside, inner, inside);
    // the edge: a line about two pixels wide, a halo outside it, and light spilling onto the scene
    float rim = exp(-abs(dd) / (uTexel.y * 2.2)) * 1.6 + exp(-max(dd, 0.0) * 14.0) * 0.22 * step(0.0, dd);
    float spill = exp(-max(dd, 0.0) * 3.5) * 0.12 * uPortal.w * step(0.0, dd);
    door += vec3(1.0, 0.9, 0.72) * (rim * uPortal2.x + spill);
    // the door fades in from transparency instead of popping up
    e = mix(outside, door, uPortal2.z);
  }
  vec3 c = toSrgb(toneCurve(e));
  vec2 q = vUv - 0.5;
  c *= 1.0 - dot(q, q) * 0.55;
  fragColor = vec4(c, 1.0);
}
