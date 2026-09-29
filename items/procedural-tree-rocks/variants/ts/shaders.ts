/* GLSL for the tree and the boulders. Colours are linear HDR: tone mapping and sRGB output come from the renderer
   through the three.js chunks at the end of each fragment shader.

   Light is the same for everything: sky light from a hemisphere (sky above, warm bounce below), a low sun and the air.
   Wind: gust patches from scrolling value noise, the same function that bends the grass on the portfolio hill, so the
   tree stands in the same weather as the meadow. */

const LIGHT = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform vec3 uSkyAmb;
uniform vec3 uGroundAmb;
uniform float uAmbient;
uniform vec3 uFogCol;
uniform float uHaze;

/* sky light from a direction; on the portfolio it is an SH9 probe baked from the HDRI, here a hemisphere is enough */
vec3 skyLight(vec3 n){ return mix(uGroundAmb, uSkyAmb, n.y * 0.5 + 0.5); }

/* air: distant haze plus low fog near the ground, so hollows and far slopes sink into warm light */
float airFog(vec3 w, float dist){
  float distant = smoothstep(9.0, 30.0, dist) * 0.55;
  float low = (1.0 - exp(-dist * 0.035)) * exp(-max(w.y - 0.2, 0.0) * 1.15) * 0.55;
  return clamp(distant + low * uHaze, 0.0, 0.8);
}
`;

const WIND = /* glsl */ `
uniform float uTime;
uniform float uWind;
uniform vec2 uWindDir;

/* Hash Kit (our own hash, see shelf/items/hash-kit): unlike a sine hash it keeps its precision far from the origin */
uint hashU(uint x) { x ^= x >> 16; x *= 0x3f9c86cbu; x ^= x >> 14; x *= 0x1ae9dacfu; x ^= x >> 15; return x; }
float hash12(vec2 p){
  uvec2 q = uvec2(ivec2(floor(p)));
  return float(hashU(q.x + hashU(q.y + 0xb31c96c9u)) >> 8) * (1.0 / 16777216.0);
}
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
/* gust strength at a point: big patches drift with the wind, small ones faster; a travelling wave stays as a faint base */
float gustAt(vec2 p){
  vec2 scroll = uWindDir * uTime;
  float n = vnoise(p * 0.16 - scroll * 0.42) * 0.62 + vnoise(p * 0.52 - scroll * 1.1) * 0.38;
  float wave = sin(dot(p, uWindDir) * 0.85 - uTime * 1.55) * 0.5 + 0.5;
  float g = smoothstep(0.28, 0.82, n) * 0.8 + wave * 0.2;
  return g * g;
}
`;

/* ---- tree (tree.ts) ----
   The crown is lit as one volume: leaf normals point out of the crown centre, not out of each card, so it reads as a
   soft ball rather than a heap of paper. Against the sun the rim of the crown glows (light through the leaves).
   Wind: the whole tree sways with the square of the height, gusts come from gustAt. */
const TREE = /* glsl */ `
uniform vec3 uTreeBase;   /* where the tree stands (world) */
uniform float uTreeH;     /* height, m */
vec3 treeSway(vec3 local, vec3 world){
  float k = clamp(local.y / uTreeH, 0.0, 1.0);
  float g = gustAt(uTreeBase.xz);
  vec3 wind = vec3(uWindDir.x, 0.0, uWindDir.y);
  float slow = sin(uTime * 0.83 + 1.3) * 0.6 + sin(uTime * 1.37) * 0.4;
  return wind * uWind * k * k * (0.05 * slow + 0.14 * g);
}
`;

const OUTPUT = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
`;

export const barkVertex = /* glsl */ `
${WIND}
${TREE}
varying vec3 vW;
varying vec3 vN;
varying float vDist;
varying float vY;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  wp.xyz += treeSway(position, wp.xyz);
  vW = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  vY = position.y;
  vDist = distance(cameraPosition, wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const barkFragment = /* glsl */ `
${LIGHT}
varying vec3 vW;
varying vec3 vN;
varying float vDist;
varying float vY;
void main(){
  vec3 N = normalize(vN);
  /* bark: dark grey-brown, darker and greener near the ground (moss) */
  vec3 bark = mix(vec3(0.030, 0.028, 0.012), vec3(0.055, 0.042, 0.030), smoothstep(0.0, 1.2, vY));
  vec3 light = skyLight(N) * uAmbient * 0.7 + uSunCol * max(dot(N, uSunDir), 0.0);
  vec3 V = normalize(cameraPosition - vW);
  /* a rim of light along the trunk and branches when you look into the sun */
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0) * pow(max(dot(-V, uSunDir), 0.0), 4.0);
  vec3 c = bark * light + uSunCol * vec3(0.20, 0.14, 0.06) * rim;
  c = mix(c, uFogCol, airFog(vW, vDist) * 0.6);
  gl_FragColor = vec4(c, 1.0);
  ${OUTPUT}
}
`;

export const leafVertex = /* glsl */ `
${WIND}
${TREE}
uniform vec3 uCrown;      /* crown centre (local) */
uniform vec3 uSunDir;
attribute vec3 aCluster;  /* centre of the leaf cluster (local) */
attribute vec2 aLeaf;     /* x — random 0..1, y — depth in the crown: 0 inside, 1 on the rim */
varying vec3 vW;
varying vec3 vN;
varying vec2 vUv;
varying float vDist;
varying float vDepth;
varying float vRand;
varying float vSunSide;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  wp.xyz += treeSway(position, wp.xyz);
  /* leaves flutter: each cluster shakes around its twig */
  float ph = aLeaf.x * 40.0;
  wp.xyz += normalize(position - aCluster + 1e-4) * 0.02 * uWind * sin(uTime * (5.0 + aLeaf.x * 3.0) + ph);
  vW = wp.xyz;
  /* "volume" normal: out of the crown centre (a squashed ball) with a share of the cluster normal */
  vec3 fromCrown = (position - uCrown) * vec3(1.0, 1.35, 1.0);
  vec3 fromCluster = position - aCluster;
  vN = normalize(mat3(modelMatrix) * normalize(normalize(fromCrown) * 0.7 + normalize(fromCluster + 1e-4) * 0.3));
  vSunSide = dot(normalize(mat3(modelMatrix) * fromCrown), uSunDir);
  vUv = uv;
  vDepth = aLeaf.y;
  vRand = aLeaf.x;
  vDist = distance(cameraPosition, wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const leafFragment = /* glsl */ `
${LIGHT}
uniform sampler2D uLeafTex;
uniform float uA2C;       /* 1 — the canvas has MSAA, the leaf edge is smoothed by coverage */
varying vec3 vW;
varying vec3 vN;
varying vec2 vUv;
varying float vDist;
varying float vDepth;
varying float vRand;
varying float vSunSide;
void main(){
  vec4 t = texture2D(uLeafTex, vUv);
  /* alpha to coverage with a sharpened edge (Ben Golus's trick): on far mip levels the leaf alpha averages out and the
     crown thins; dividing by fwidth gives the leaf back a crisp edge one pixel wide */
  float a = uA2C > 0.5 ? clamp((t.a - 0.45) / max(fwidth(t.a), 1e-4) + 0.5, 0.0, 1.0) : step(0.45, t.a);
  if (a < 0.02) discard;
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  /* two leaf tones: olive and a yellower green, per leaf and per cluster */
  vec3 albedo = mix(vec3(0.030, 0.058, 0.014), vec3(0.055, 0.078, 0.018), clamp(t.g * 0.7 + vRand * 0.5, 0.0, 1.0)) * (0.7 + 0.3 * t.r);
  /* darker inside the crown: neither the sky nor the sun gets there */
  float ao = mix(0.38, 1.0, vDepth);
  float sunLit = smoothstep(-0.35, 0.55, vSunSide) * mix(0.35, 1.0, vDepth);
  vec3 light = skyLight(N) * uAmbient * 0.8 * ao
             + uSunCol * max(dot(N, uSunDir), 0.0) * sunLit;
  /* light through the leaf: looking against the sun, the rim of the crown glows warm green */
  float back = pow(max(dot(-V, uSunDir), 0.0), 3.0);
  vec3 trans = uSunCol * vec3(0.20, 0.30, 0.05) * back * smoothstep(0.55, 1.0, vDepth) * (0.35 + 0.65 * t.r);
  vec3 c = albedo * light + trans * 0.35;
  /* less air on the tree than on grass at the same distance: a dark crown holds the depth of the frame */
  c = mix(c, uFogCol, airFog(vW, vDist) * 0.6);
  gl_FragColor = vec4(c, a);
  ${OUTPUT}
}
`;

/* ---- boulders (rocks.ts) ----
   Light granite with a warm speckle, moss on top and lichen patches on the sides, darker near the ground (grass and
   damp), a rim of light against the sun. The texture is noise over the rock's own coordinates: a boulder can stand
   anywhere and its pattern does not swim. */
export const rockVertex = /* glsl */ `
varying vec3 vW;
varying vec3 vN;
varying vec3 vL;
varying float vDist;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  vL = position;
  vN = normalize(mat3(modelMatrix) * normal);
  vDist = distance(cameraPosition, wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const rockFragment = /* glsl */ `
${LIGHT}
uniform mat4 modelMatrix; /* three does not declare it in fragment shaders; the bump needs it */
uniform float uGroundY;   /* ground height under the rocks (flat glade) */
varying vec3 vW;
varying vec3 vN;
varying vec3 vL;
varying float vDist;
/* Hash Kit grid hash on the lattice corner (the argument is already floored) */
uint hashU(uint x) { x ^= x >> 16; x *= 0x3f9c86cbu; x ^= x >> 14; x *= 0x1ae9dacfu; x ^= x >> 15; return x; }
float h31(vec3 p){
  uvec3 q = uvec3(ivec3(p));
  return float(hashU(q.x + hashU(q.y + hashU(q.z + 0xb31c96c9u))) >> 8) * (1.0 / 16777216.0);
}
float n3(vec3 p){
  vec3 i = floor(p), f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h31(i), h31(i + vec3(1, 0, 0)), u.x), mix(h31(i + vec3(0, 1, 0)), h31(i + vec3(1, 1, 0)), u.x), u.y),
             mix(mix(h31(i + vec3(0, 0, 1)), h31(i + vec3(1, 0, 1)), u.x), mix(h31(i + vec3(0, 1, 1)), h31(i + vec3(1, 1, 1)), u.x), u.y), u.z);
}
void main(){
  /* surface relief: the normal is knocked about by noise — bumps and pits without extra geometry */
  vec3 bump = vec3(n3(vL * 7.0 + 1.3), n3(vL * 7.0 + 9.1), n3(vL * 7.0 + 17.7)) - 0.5;
  bump += (vec3(n3(vL * 23.0 + 4.0), n3(vL * 23.0 + 8.0), n3(vL * 23.0 + 12.0)) - 0.5) * 0.5;
  vec3 N = normalize(normalize(vN) + mat3(modelMatrix) * bump * 0.55);
  vec3 V = normalize(cameraPosition - vW);
  /* light granite: on a green hill it is the only grey patch, a dark stone drowned in grass of the same tone */
  float mottle = n3(vL * 4.5) * 0.55 + n3(vL * 13.0) * 0.3 + n3(vL * 1.3) * 0.15;
  float speck = n3(vL * 60.0);
  vec3 stone = mix(vec3(0.25, 0.205, 0.150), vec3(0.39, 0.325, 0.240), mottle);
  stone *= 0.9 + 0.16 * speck;
  /* cracks and pits: dark veins where the noise crosses its middle. With the sun behind the rock the relief hardly
     shows under the sky light; the veins show in any light */
  float crack = smoothstep(0.0, 0.03, abs(n3(vL * 2.6 + 2.0) - 0.5));
  stone *= mix(0.74, 1.0, crack);
  /* moss in patches on top; lichen as pale patches on the sides */
  float mossMask = smoothstep(0.55, 0.85, N.y * 0.7 + n3(vL * 3.1 + 5.0) * 0.6);
  vec3 moss = mix(vec3(0.030, 0.048, 0.013), vec3(0.060, 0.080, 0.020), n3(vL * 9.0));
  vec3 alb = mix(stone, moss, mossMask * 0.8);
  float lichen = smoothstep(0.7, 0.78, n3(vL * 6.5 + 11.0)) * (1.0 - mossMask);
  alb = mix(alb, vec3(0.30, 0.29, 0.17), lichen * 0.55);
  /* darker near the ground: damp and the shade of the grass */
  float ground = smoothstep(0.35, 0.0, vW.y - uGroundY);
  alb *= mix(1.0, 0.45, ground);
  float ao = mix(0.55, 1.0, smoothstep(-0.2, 0.7, N.y * 0.5 + 0.5));
  vec3 light = skyLight(N) * uAmbient * 0.75 * ao + uSunCol * max(dot(N, uSunDir), 0.0);
  float rim = pow(1.0 - max(dot(N, V), 0.0), 4.0) * pow(max(dot(-V, uSunDir), 0.0), 3.0) * (1.0 - ground);
  vec3 c = alb * light + uSunCol * vec3(0.12, 0.09, 0.05) * rim;
  c = mix(c, uFogCol, airFog(vW, vDist));
  gl_FragColor = vec4(c, 1.0);
  ${OUTPUT}
}
`;

/* the glade for the demo: the same light and air, so the tree and the rocks sit in it */
export const groundVertex = /* glsl */ `
varying vec3 vW;
varying float vDist;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  vDist = distance(cameraPosition, wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const groundFragment = /* glsl */ `
${LIGHT}
${WIND}
uniform vec4 uSpots[6];   /* contact shade: xz centre, x and z radius (under rocks and the trunk) */
uniform vec4 uShade;      /* crown shade on the ground: xz centre, radius along and across the sun */
uniform vec2 uShadeDir;   /* the sun's direction on the ground */
uniform vec3 uHorizon;
varying vec3 vW;
varying float vDist;
void main(){
  vec2 p = vW.xz;
  float n = vnoise(p * 0.9) * 0.55 + vnoise(p * 3.1 + 7.0) * 0.3 + vnoise(p * 0.21 - 3.0) * 0.15;
  vec3 grass = mix(vec3(0.034, 0.060, 0.016), vec3(0.068, 0.090, 0.024), n);
  grass = mix(grass, vec3(0.105, 0.092, 0.044), smoothstep(0.6, 0.85, vnoise(p * 0.35 + 11.0)) * 0.45);
  float ao = 1.0;
  for (int i = 0; i < 6; i++){
    vec4 s = uSpots[i];
    if (s.z <= 0.0) continue;
    ao *= mix(0.4, 1.0, smoothstep(0.7, 1.7, length((p - s.xy) / s.zw)));
  }
  vec2 d = p - uShade.xy;
  vec2 e = vec2(dot(d, uShadeDir), dot(d, vec2(-uShadeDir.y, uShadeDir.x))) / uShade.zw;
  float shade = 1.0 - (1.0 - smoothstep(0.35, 1.0, length(e))) * 0.6;
  vec3 N = vec3(0.0, 1.0, 0.0);
  vec3 light = skyLight(N) * uAmbient * 0.8 * ao + uSunCol * max(uSunDir.y, 0.0) * shade * ao;
  vec3 c = grass * light;
  c = mix(c, uFogCol, airFog(vW, vDist));
  c = mix(c, uHorizon, smoothstep(16.0, 34.0, length(p)));
  gl_FragColor = vec4(c, 1.0);
  ${OUTPUT}
}
`;

export const skyVertex = /* glsl */ `
varying vec3 vDir;
void main(){
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww; /* on the far plane */
}
`;

export const skyFragment = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform vec3 uZenith;
uniform vec3 uHorizon;
varying vec3 vDir;
void main(){
  vec3 d = normalize(vDir);
  float h = max(d.y, 0.0);
  vec3 c = mix(uHorizon, uZenith, pow(h, 0.4));
  float s = max(dot(d, uSunDir), 0.0);
  c += uSunCol * (pow(s, 8.0) * 0.25 + pow(s, 64.0) * 0.6 + smoothstep(0.9993, 0.9996, s) * 4.0);
  c = mix(c, uHorizon * 0.92, smoothstep(0.0, -0.08, d.y));
  gl_FragColor = vec4(c, 1.0);
  ${OUTPUT}
}
`;
