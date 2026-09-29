#version 300 es
precision highp float;
// Edge smoothing after the render, for quality steps without MSAA. Without it a one-pixel grass blade on a
// DPR 1 screen is drawn as a staircase and shimmers in the wind.
// Our own method, "along the edge":
//   1. read the pixel's 3×3 neighbourhood exactly (texelFetch); flat places leave after the cross;
//   2. find the way the edge runs: across a step the brightness gradient is large, across a thin line the
//      gradient in the middle vanishes but the curvature (second derivatives) is large — the stronger decides;
//   3. average four taps along the edge; nearly horizontal or vertical edges reach further, their steps are longer;
//   4. keep the result inside the neighbourhood's colour range, so nothing new appears and there are no halos.
// Brightness goes through a square root: the buffer is linear HDR, and the edge must be found the way the eye sees it.
uniform sampler2D tScene;   // linear HDR, LINEAR filtering (the taps along the edge fall between pixels)
uniform vec2 uTexel;        // 1 / buffer size
uniform float uEdgeAA;      // 0 — off, 0.5 — with MSAA 2×, 1 — without MSAA
// demo only: comparison, edge map, loupe
uniform float uSplit;       // left of this x the frame stays raw; 0 — smoothing everywhere
uniform int uView;          // 0 — picture, 1 — which pixels were touched
uniform vec3 uLoupe;        // centre in pixels, radius in pixels (0 — no loupe)
uniform float uZoom;
in vec2 vUv;
out vec4 fragColor;

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

float aaLuma(vec3 c) { return sqrt(dot(min(c, vec3(1.0)), LUMA)); }
vec3 tap(ivec2 q) { return texelFetch(tScene, clamp(q, ivec2(0), textureSize(tScene, 0) - 1), 0).rgb; }

vec3 alongEdge(vec2 uv, vec3 c, out float touched) {
  touched = 0.0;
  ivec2 p = ivec2(uv / uTexel);
  vec3 n = tap(p + ivec2(0, 1)), s = tap(p - ivec2(0, 1)), e = tap(p + ivec2(1, 0)), w = tap(p - ivec2(1, 0));
  float lc = aaLuma(c), ln = aaLuma(n), ls = aaLuma(s), le = aaLuma(e), lw = aaLuma(w);
  float lo = min(lc, min(min(ln, ls), min(le, lw)));
  float hi = max(lc, max(max(ln, ls), max(le, lw)));
  // a softer gate in bright places: the eye needs more contrast there to see a step
  float gate = 0.025 + 0.12 * hi;
  if (hi - lo < gate) return c;
  vec3 ne = tap(p + ivec2(1, 1)), nw = tap(p + ivec2(-1, 1)), se = tap(p + ivec2(1, -1)), sw = tap(p + ivec2(-1, -1));
  float lne = aaLuma(ne), lnw = aaLuma(nw), lse = aaLuma(se), lsw = aaLuma(sw);
  // brightness gradient with 1-2-1 weights: points across a step between two areas
  vec2 grad = 0.25 * vec2(lne + 2.0 * le + lse - lnw - 2.0 * lw - lsw, lnw + 2.0 * ln + lne - lsw - 2.0 * ls - lse);
  // curvature: the second derivatives form a 2×2 matrix; its stronger eigenvector points across a thin line
  float hxx = le + lw - 2.0 * lc, hyy = ln + ls - 2.0 * lc, hxy = 0.25 * (lne + lsw - lnw - lse);
  float mid = 0.5 * (hxx + hyy), spread = sqrt(0.25 * (hxx - hyy) * (hxx - hyy) + hxy * hxy);
  float bend = abs(mid + spread) > abs(mid - spread) ? mid + spread : mid - spread;
  vec2 acrossLine = abs(hxy) > 1e-4 ? vec2(bend - hyy, hxy) : (abs(hxx) > abs(hyy) ? vec2(1.0, 0.0) : vec2(0.0, 1.0));
  vec2 across = length(grad) >= 0.5 * abs(bend) ? grad : acrossLine;
  float len = length(across);
  if (len < 1e-4) return c;
  vec2 along = vec2(-across.y, across.x) / len;
  // a nearly horizontal or vertical edge breaks into long steps: reach further along it
  float axial = max(abs(along.x), abs(along.y));
  vec2 t = along * uTexel * mix(1.0, 2.25, smoothstep(0.92, 0.995, axial));
  vec3 sum = 0.2 * c
    + 0.25 * (textureLod(tScene, uv + 0.6 * t, 0.0).rgb + textureLod(tScene, uv - 0.6 * t, 0.0).rgb)
    + 0.15 * (textureLod(tScene, uv + 1.5 * t, 0.0).rgb + textureLod(tScene, uv - 1.5 * t, 0.0).rgb);
  vec3 cmin = min(min(min(c, n), min(s, e)), min(min(w, ne), min(nw, min(se, sw))));
  vec3 cmax = max(max(max(c, n), max(s, e)), max(max(w, ne), max(nw, max(se, sw))));
  touched = 1.0;
  return mix(c, clamp(sum, cmin, cmax), uEdgeAA * smoothstep(gate, 2.0 * gate, hi - lo));
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
  // inside the loupe each screen pixel shows the buffer pixel under it, enlarged without filtering
  vec2 frag = gl_FragCoord.xy;
  vec2 d = frag - uLoupe.xy;
  float inLoupe = step(length(d), uLoupe.z);
  vec2 px = inLoupe > 0.5 ? floor(uLoupe.xy + d / uZoom) + 0.5 : frag;
  vec2 uv = px * uTexel;
  vec3 m = textureLod(tScene, uv, 0.0).rgb;
  float touched = 0.0;
  vec3 c = uv.x >= uSplit && uEdgeAA > 0.001 ? alongEdge(uv, m, touched) : m;
  c = toSrgb(toneCurve(c));
  if (uView == 1) c = mix(c * 0.25, vec3(1.0, 0.36, 0.2), touched);
  // the loupe's rim
  float ring = abs(length(d) - uLoupe.z);
  c = mix(c, vec3(1.0), smoothstep(1.6, 0.4, ring) * step(0.5, uLoupe.z));
  fragColor = vec4(c, 1.0);
}
