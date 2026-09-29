// items/procedural-tree-rocks/variants/ts/main.ts
import * as THREE3 from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// items/procedural-tree-rocks/variants/ts/tree.ts
import * as THREE from "three";

// items/procedural-tree-rocks/variants/ts/rng.ts
function makeRng(seed = 1067064443) {
  let s = seed >>> 0;
  return () => {
    s = s + 3004995273 >>> 0;
    let x = s;
    x ^= x >>> 16;
    x = Math.imul(x, 1067222731);
    x ^= x >>> 14;
    x = Math.imul(x, 451533519);
    x ^= x >>> 15;
    return (x >>> 0) / 4294967296;
  };
}

// items/procedural-tree-rocks/variants/ts/shaders.ts
var LIGHT = (
  /* glsl */
  `
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
`
);
var WIND = (
  /* glsl */
  `
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
`
);
var TREE = (
  /* glsl */
  `
uniform vec3 uTreeBase;   /* where the tree stands (world) */
uniform float uTreeH;     /* height, m */
vec3 treeSway(vec3 local, vec3 world){
  float k = clamp(local.y / uTreeH, 0.0, 1.0);
  float g = gustAt(uTreeBase.xz);
  vec3 wind = vec3(uWindDir.x, 0.0, uWindDir.y);
  float slow = sin(uTime * 0.83 + 1.3) * 0.6 + sin(uTime * 1.37) * 0.4;
  return wind * uWind * k * k * (0.05 * slow + 0.14 * g);
}
`
);
var OUTPUT = (
  /* glsl */
  `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
`
);
var barkVertex = (
  /* glsl */
  `
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
`
);
var barkFragment = (
  /* glsl */
  `
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
`
);
var leafVertex = (
  /* glsl */
  `
${WIND}
${TREE}
uniform vec3 uCrown;      /* crown centre (local) */
uniform vec3 uSunDir;
attribute vec3 aCluster;  /* centre of the leaf cluster (local) */
attribute vec2 aLeaf;     /* x \u2014 random 0..1, y \u2014 depth in the crown: 0 inside, 1 on the rim */
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
`
);
var leafFragment = (
  /* glsl */
  `
${LIGHT}
uniform sampler2D uLeafTex;
uniform float uA2C;       /* 1 \u2014 the canvas has MSAA, the leaf edge is smoothed by coverage */
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
`
);
var rockVertex = (
  /* glsl */
  `
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
`
);
var rockFragment = (
  /* glsl */
  `
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
  /* surface relief: the normal is knocked about by noise \u2014 bumps and pits without extra geometry */
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
`
);
var groundVertex = (
  /* glsl */
  `
varying vec3 vW;
varying float vDist;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  vDist = distance(cameraPosition, wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`
);
var groundFragment = (
  /* glsl */
  `
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
`
);
var skyVertex = (
  /* glsl */
  `
varying vec3 vDir;
void main(){
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww; /* on the far plane */
}
`
);
var skyFragment = (
  /* glsl */
  `
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
`
);

// items/procedural-tree-rocks/variants/ts/tree.ts
var UP = new THREE.Vector3(0, 1, 0);
function leafTexture(rng) {
  const S = 256;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d");
  g.clearRect(0, 0, S, S);
  g.lineCap = "round";
  for (let i = 0; i < 7; i++) {
    const a = rng() * Math.PI * 2;
    g.strokeStyle = "rgba(90,60,40,1)";
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(S / 2, S / 2);
    g.lineTo(S / 2 + Math.cos(a) * S * 0.36, S / 2 + Math.sin(a) * S * 0.36);
    g.stroke();
  }
  for (let i = 0; i < 120; i++) {
    const ang = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * S * 0.38;
    const x = S / 2 + Math.cos(ang) * r, y = S / 2 + Math.sin(ang) * r;
    const len = S * (0.05 + rng() * 0.035), wid = len * (0.45 + rng() * 0.15);
    const rot = ang + (rng() - 0.5) * 1.2;
    const bright = Math.round(150 + rng() * 105), tone = Math.round(rng() * 255);
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    g.fillStyle = `rgba(${bright},${tone},0,1)`;
    g.beginPath();
    g.moveTo(-len / 2, 0);
    g.quadraticCurveTo(0, -wid, len / 2, 0);
    g.quadraticCurveTo(0, wid, -len / 2, 0);
    g.fill();
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  t.anisotropy = 4;
  return t;
}
function createTree(uniforms2, o) {
  const rng = makeRng(o.seed ?? 334462);
  const limbs = [];
  const clusters = [];
  const MAX = 4;
  const trunkLen = o.height * 0.44;
  const tropism = o.lean.clone().add(UP).normalize();
  const envC = new THREE.Vector3(o.lean.x * o.height * 0.25, o.height * 0.66, o.lean.z * o.height * 0.25);
  const envR = new THREE.Vector3(o.height * 0.44, o.height * 0.33, o.height * 0.4);
  const inCrown = (p) => {
    const q2 = p.clone().sub(envC);
    const e2 = Math.sqrt((q2.x / envR.x) ** 2 + (q2.y / envR.y) ** 2 + (q2.z / envR.z) ** 2);
    if (e2 > 1) p.copy(envC).addScaledVector(q2, (1 + (e2 - 1) * 0.12) / e2);
    return p;
  };
  const grow = (start, dir, len, r, depth) => {
    const n = depth === 0 ? 4 : 3;
    const pts = [start.clone()];
    const rad = [r];
    let d = dir.clone();
    for (let i = 0; i < n; i++) {
      const jitter = new THREE.Vector3(rng() - 0.5, (rng() - 0.5) * 0.4, rng() - 0.5).multiplyScalar(depth === 0 ? 0.22 : 0.5);
      d = d.add(jitter).lerp(tropism, depth === 0 ? 0.12 : 0.1).normalize();
      if (depth >= 3) d.y -= 0.12 * (rng() * 0.6 + 0.4);
      d.normalize();
      const next = pts[i].clone().addScaledVector(d, len / n);
      pts.push(depth > 0 ? inCrown(next) : next);
      rad.push(r * (1 - (i + 1) / n * 0.42));
    }
    limbs.push({ pts, rad });
    if (depth >= MAX - 1) {
      for (let i = Math.floor(n / 2); i <= n; i++) clusters.push({ p: pts[i].clone(), d: d.clone() });
      if (depth >= MAX) return;
    }
    const kids = depth === 0 ? 4 : 2 + (rng() < 0.55 ? 1 : 0);
    let az = rng() * Math.PI * 2;
    for (let k = 0; k < kids; k++) {
      const leader = k === 0;
      const t = leader ? 1 : (depth === 0 ? 0.72 : 0.35) + rng() * (depth === 0 ? 0.28 : 0.6);
      const at = Math.min(n - 1e-3, t * n);
      const i = Math.floor(at), f = at - i;
      const p = pts[i].clone().lerp(pts[i + 1], f);
      const rAt = rad[i] + (rad[i + 1] - rad[i]) * f;
      az += 2.39996;
      const angle = leader ? 0.25 + rng() * 0.2 : 0.65 + rng() * 0.45;
      const side = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
      side.addScaledVector(d, -side.dot(d)).normalize();
      const cd = d.clone().multiplyScalar(Math.cos(angle)).addScaledVector(side, Math.sin(angle)).normalize();
      const cl = len * (leader ? 0.62 : 0.58 + rng() * 0.16);
      const r0 = Math.max(0.012, rAt * (leader ? 1 : 0.62));
      grow(p.clone().addScaledVector(cd, -rAt * 0.8), cd, cl + rAt * 0.8, r0, depth + 1);
    }
  };
  grow(new THREE.Vector3(0, -0.4, 0), o.lean.clone().multiplyScalar(0.35).add(UP).normalize(), trunkLen + 0.4, o.height * 0.036, 0);
  const bp = [], bn = [], bi = [];
  for (const { pts, rad } of limbs) {
    if (rad[0] < 0.015) continue;
    const k = rad[0] > 0.06 ? 9 : 5;
    const dir0 = new THREE.Vector3().subVectors(pts[pts.length - 1], pts[0]).normalize();
    const ref = Math.abs(dir0.y) < 0.9 ? UP : new THREE.Vector3(1, 0, 0);
    const base = bp.length / 3;
    for (let i = 0; i < pts.length; i++) {
      const tan = new THREE.Vector3().subVectors(pts[Math.min(i + 1, pts.length - 1)], pts[Math.max(i - 1, 0)]).normalize();
      const u = new THREE.Vector3().crossVectors(tan, ref).normalize();
      const v = new THREE.Vector3().crossVectors(tan, u);
      const r = rad[i] * (limbs[0].pts === pts && i === 0 ? 1.35 : 1);
      for (let j = 0; j < k; j++) {
        const t = j / k * Math.PI * 2;
        const cs = Math.cos(t), sn = Math.sin(t);
        const nx = u.x * cs + v.x * sn, ny = u.y * cs + v.y * sn, nz = u.z * cs + v.z * sn;
        bp.push(pts[i].x + nx * r, pts[i].y + ny * r, pts[i].z + nz * r);
        bn.push(nx, ny, nz);
      }
    }
    for (let i = 0; i < pts.length - 1; i++) {
      for (let j = 0; j < k; j++) {
        const a = base + i * k + j, b = base + i * k + (j + 1) % k, c2 = a + k, d2 = b + k;
        bi.push(a, b, c2, b, d2, c2);
      }
    }
    const n = pts.length;
    const tip = new THREE.Vector3().subVectors(pts[n - 1], pts[n - 2]).normalize();
    const cap = pts[n - 1].clone().addScaledVector(tip, rad[n - 1] * 0.7);
    const ci = bp.length / 3;
    bp.push(cap.x, cap.y, cap.z);
    bn.push(tip.x, tip.y, tip.z);
    const last2 = base + (n - 1) * k;
    for (let j = 0; j < k; j++) bi.push(last2 + j, last2 + (j + 1) % k, ci);
  }
  const barkGeo = new THREE.BufferGeometry();
  barkGeo.setAttribute("position", new THREE.Float32BufferAttribute(bp, 3));
  barkGeo.setAttribute("normal", new THREE.Float32BufferAttribute(bn, 3));
  barkGeo.setIndex(bi);
  barkGeo.computeBoundingSphere();
  const crown = new THREE.Vector3();
  clusters.forEach((c) => crown.add(c.p));
  crown.divideScalar(Math.max(1, clusters.length));
  let crownR = 0;
  clusters.forEach((c) => crownR = Math.max(crownR, c.p.distanceTo(crown)));
  for (const c of clusters.slice()) if (rng() < 0.6) clusters.push({ p: c.p.clone().lerp(crown, 0.3 + rng() * 0.35), d: c.d.clone() });
  const lp = [], luv = [], lc = [], ll = [], li = [];
  const q = new THREE.Quaternion(), e = new THREE.Euler();
  const corner = [[-0.5, -0.5, 0, 0], [0.5, -0.5, 1, 0], [0.5, 0.5, 1, 1], [-0.5, 0.5, 0, 1]];
  for (const c of clusters) {
    const depth = THREE.MathUtils.clamp(c.p.distanceTo(crown) / Math.max(crownR, 1e-3), 0, 1);
    const cards = 5 + (rng() < 0.5 ? 1 : 0);
    for (let k = 0; k < cards; k++) {
      const size = o.height * (0.09 + rng() * 0.045);
      const center = c.p.clone().add(new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).multiplyScalar(size * 0.7));
      e.set((rng() - 0.5) * Math.PI, rng() * Math.PI * 2, (rng() - 0.5) * Math.PI);
      q.setFromEuler(e);
      const rnd = rng();
      const base = lp.length / 3;
      for (const [x, y, uu, vv] of corner) {
        const p = new THREE.Vector3(x * size, y * size, 0).applyQuaternion(q).add(center);
        lp.push(p.x, p.y, p.z);
        luv.push(uu, vv);
        lc.push(c.p.x, c.p.y, c.p.z);
        ll.push(rnd, depth);
      }
      li.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  const leafGeo = new THREE.BufferGeometry();
  leafGeo.setAttribute("position", new THREE.Float32BufferAttribute(lp, 3));
  leafGeo.setAttribute("uv", new THREE.Float32BufferAttribute(luv, 2));
  leafGeo.setAttribute("aCluster", new THREE.Float32BufferAttribute(lc, 3));
  leafGeo.setAttribute("aLeaf", new THREE.Float32BufferAttribute(ll, 2));
  leafGeo.setIndex(li);
  leafGeo.computeBoundingSphere();
  const shared = { ...uniforms2, uTreeBase: { value: o.base.clone() }, uTreeH: { value: o.height } };
  const bark = new THREE.Mesh(barkGeo, new THREE.ShaderMaterial({ vertexShader: barkVertex, fragmentShader: barkFragment, uniforms: shared }));
  const leafMat = new THREE.ShaderMaterial({
    vertexShader: leafVertex,
    fragmentShader: leafFragment,
    side: THREE.DoubleSide,
    uniforms: { ...shared, uCrown: { value: crown }, uLeafTex: { value: leafTexture(rng) }, uA2C: { value: o.msaa ? 1 : 0 } }
  });
  leafMat.alphaToCoverage = true;
  const leaves = new THREE.Mesh(leafGeo, leafMat);
  const group = new THREE.Group();
  group.name = "tree";
  group.position.copy(o.base);
  group.add(bark, leaves);
  return {
    group,
    /** crown centre in the tree's own space */
    crown,
    /** stand it on the ground: x, z — the point at the foot, y — its height, s — scale (same shape) */
    place(x, y, z, s) {
      group.position.set(x, y, z);
      group.scale.setScalar(s);
      shared.uTreeBase.value.set(x, y, z);
    },
    /** without MSAA the leaf edge is an alpha test, with it — coverage */
    setMsaa(on) {
      leafMat.uniforms.uA2C.value = on ? 1 : 0;
    },
    stats: { limbs: limbs.length, clusters: clusters.length, cards: li.length / 6, barkTris: bi.length / 3 }
  };
}

// items/procedural-tree-rocks/variants/ts/rocks.ts
import * as THREE2 from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
var rockFootprints = (rocks) => rocks.map((r) => ({ x: r.x, z: r.z, rx: r.size * 0.46, rz: r.size * 0.42 }));
var hashU = (x) => {
  x ^= x >>> 16;
  x = Math.imul(x, 1067222731);
  x ^= x >>> 14;
  x = Math.imul(x, 451533519);
  x ^= x >>> 15;
  return x >>> 0;
};
function hash3(x, y, z, s) {
  return (hashU(x + hashU(y + hashU(z + hashU(s + 3004995273 >>> 0) >>> 0) >>> 0) >>> 0) >>> 8) / 16777216;
}
function noise3(x, y, z, s) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy), uz = fz * fz * (3 - 2 * fz);
  const l = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash3(ix + dx, iy + dy, iz + dz, s);
  return l(
    l(l(c(0, 0, 0), c(1, 0, 0), ux), l(c(0, 1, 0), c(1, 1, 0), ux), uy),
    l(l(c(0, 0, 1), c(1, 0, 1), ux), l(c(0, 1, 1), c(1, 1, 1), ux), uy),
    uz
  );
}
function rockGeometry(seed) {
  const rng = makeRng(195911405 ^ seed);
  const ico = new THREE2.IcosahedronGeometry(1, 4);
  ico.deleteAttribute("normal");
  ico.deleteAttribute("uv");
  const geo = mergeVertices(ico);
  ico.dispose();
  const pos = geo.attributes.position;
  const tilt = new THREE2.Vector3(rng() - 0.5, 0, rng() - 0.5).multiplyScalar(0.5);
  const v = new THREE2.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const big = noise3(v.x * 1.1 + 3, v.y * 1.1, v.z * 1.1, seed) - 0.5;
    const mid = noise3(v.x * 2.6, v.y * 2.6 + 7, v.z * 2.6, seed + 1) - 0.5;
    const fine = noise3(v.x * 7, v.y * 7 - 3, v.z * 7, seed + 2) - 0.5;
    const r = 1 + big * 0.5 + mid * 0.16 + fine * 0.04 + v.dot(tilt) * 0.3;
    v.multiplyScalar(r);
    if (v.y > 0.35) v.y = 0.35 + (v.y - 0.35) * 0.72;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}
function createRocks(uniforms2, rocks, heightAt = () => 0) {
  const group = new THREE2.Group();
  group.name = "rocks";
  const mat = new THREE2.ShaderMaterial({ vertexShader: rockVertex, fragmentShader: rockFragment, uniforms: uniforms2 });
  for (const r of rocks) {
    const mesh = new THREE2.Mesh(rockGeometry(r.seed), mat);
    const half = r.size / 2;
    mesh.scale.set(half, half * r.h * 1.6, half * 0.9);
    mesh.rotation.set(0, r.yaw, 0);
    mesh.position.set(r.x, heightAt(r.x, r.z) + half * r.h * 1.6 * (1 - 2 * r.sink), r.z);
    group.add(mesh);
  }
  return group;
}

// items/procedural-tree-rocks/variants/ts/main.ts
var reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
var canvas = document.getElementById("stage");
var renderer = new THREE3.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE3.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;
var SUN_DIR = new THREE3.Vector3(-0.5, 0.3, -0.81).normalize();
var FOG = new THREE3.Color("#eedcb8");
var uniforms = {
  uTime: { value: 0 },
  uWind: { value: reduced ? 0.25 : 1 },
  uWindDir: { value: new THREE3.Vector2(0.86, 0.5).normalize() },
  uSunDir: { value: SUN_DIR },
  uSunCol: { value: new THREE3.Color(2.4, 1.55, 0.85) },
  uSkyAmb: { value: new THREE3.Color(1.75, 1.95, 2.3) },
  uGroundAmb: { value: new THREE3.Color(0.8, 0.74, 0.5) },
  uAmbient: { value: 1 },
  uFogCol: { value: FOG },
  uHaze: { value: 0.35 },
  uGroundY: { value: 0 }
};
var scene = new THREE3.Scene();
var ROCKS = [
  { x: 2.3, z: 1.7, size: 0.9, h: 0.6, yaw: 0.6, sink: 0.36, seed: 11 },
  { x: 2.85, z: 1.45, size: 0.36, h: 0.7, yaw: 2.1, sink: 0.3, seed: 23 },
  { x: -2.4, z: -1.3, size: 0.62, h: 0.62, yaw: 1.2, sink: 0.36, seed: 37 },
  { x: -1.9, z: -0.88, size: 0.28, h: 0.75, yaw: 0.2, sink: 0.3, seed: 41 }
];
scene.add(createRocks(uniforms, ROCKS));
var tree = createTree(uniforms, { base: new THREE3.Vector3(), height: 5.6, lean: new THREE3.Vector3(-0.2, 0, 0.1), msaa: true });
tree.place(0, -0.05, 0, 0.85);
scene.add(tree.group);
var HORIZON = FOG.clone().multiplyScalar(1.1);
var spots = rockFootprints(ROCKS).map((f) => new THREE3.Vector4(f.x, f.z, f.rx, f.rz));
spots.push(new THREE3.Vector4(0, 0, 0.45, 0.45));
while (spots.length < 6) spots.push(new THREE3.Vector4(0, 0, 0, 0));
var away = new THREE3.Vector2(-SUN_DIR.x, -SUN_DIR.z).normalize();
var ground = new THREE3.Mesh(
  new THREE3.CircleGeometry(40, 96),
  new THREE3.ShaderMaterial({
    vertexShader: groundVertex,
    fragmentShader: groundFragment,
    uniforms: {
      ...uniforms,
      uSpots: { value: spots },
      uShade: { value: new THREE3.Vector4(away.x * 3.6, away.y * 3.6, 4.4, 2.3) },
      uShadeDir: { value: away },
      uHorizon: { value: HORIZON }
    }
  })
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
var sky = new THREE3.Mesh(
  new THREE3.SphereGeometry(90, 32, 16),
  new THREE3.ShaderMaterial({
    vertexShader: skyVertex,
    fragmentShader: skyFragment,
    side: THREE3.BackSide,
    depthWrite: false,
    uniforms: { uSunDir: uniforms.uSunDir, uSunCol: uniforms.uSunCol, uZenith: { value: new THREE3.Color(0.16, 0.34, 0.82) }, uHorizon: { value: HORIZON } }
  })
);
sky.renderOrder = -1;
scene.add(sky);
var camera = new THREE3.PerspectiveCamera(35, 1, 0.1, 200);
camera.position.set(9, 2.2, 8.3);
var controls = new OrbitControls(camera, canvas);
controls.target.set(0, 2.2, 0);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 6;
controls.maxDistance = 18;
controls.minPolarAngle = 0.7;
controls.maxPolarAngle = 1.5;
controls.autoRotate = !reduced;
controls.autoRotateSpeed = 0.5;
sky.onBeforeRender = () => sky.position.copy(camera.position);
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = camera.aspect < 1 ? Math.min(72, THREE3.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE3.MathUtils.degToRad(17.5)) / camera.aspect))) : 35;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();
var last = performance.now();
renderer.setAnimationLoop((now) => {
  const dt = Math.min((now - last) / 1e3, 0.05);
  last = now;
  uniforms.uTime.value += dt;
  controls.update(dt);
  renderer.render(scene, camera);
});
