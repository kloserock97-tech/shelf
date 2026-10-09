/* Radiance cascades in 2D: global illumination of a flat scene of emitters and occluders.
   Input: a scene texture (rgb = emission 0…1, a ≥ 0.5 = solid) and the nearest-seed field of its solid pixels
   (sdf-core.js), both at GI resolution. Output: an irradiance texture, one texel per probe of cascade 0.
   Cascade n has probes every spacing·2ⁿ px and 4ⁿ⁺¹ directions per probe, laid out as a 2ⁿ⁺¹ × 2ⁿ⁺¹ block, so
   every cascade has about the same number of texels. Its rays cover the interval [a·(4ⁿ − 1)/3, a·(4ⁿ⁺¹ − 1)/3]:
   near rays are many and short, far rays few and long. Rays are sphere-traced through the distance field.
   Merging goes from the top cascade down: a ray that reached the end of its interval without hitting anything
   takes the light the four child rays of the cascade above saw from there, averaged over the four nearest upper
   probes with bilinear weights. Cascade 0 averaged over its 4 directions is the irradiance at a probe. */
import { compileProgram, createTexture, createTarget, fullscreen, FULLSCREEN_VS, SDF_GLSL } from './sdf-core.js';

const CASCADE_FS = `#version 300 es
precision highp float;
precision highp int;
${SDF_GLSL}
uniform sampler2D uScene;
uniform sampler2D uUpper;
uniform bool uHasUpper;
uniform ivec2 uGi;
uniform float uSpacing;
uniform int uBlock;
uniform ivec2 uProbes;
uniform float uUpperSpacing;
uniform int uUpperBlock;
uniform ivec2 uUpperProbes;
uniform vec2 uInterval;
uniform float uEmit;
uniform float uRange;        // values are stored divided by this (1 on float targets)
uniform int uSteps;
uniform bool uFix;
uniform int uDiscs;           // translucent disc lights: they glow but cast no shadows on each other
uniform vec4 uDisc[8];        // centre (GI px), radius, intensity
uniform vec3 uDiscColor[8];
uniform float uFade;          // optional extinction per GI px: pools of light instead of a 1/r haze
out vec4 o;
const float TAU = 6.283185307;

// radiance (rgb) and transmittance (a) along the segment from a to b, sphere-traced through the distance field
vec4 march(vec2 a, vec2 b) {
  vec2 size = vec2(uGi);
  vec2 ab = b - a;
  float len = length(ab);
  vec2 dir = ab / max(len, 1e-4);
  float t = 0.0;
  vec4 res = vec4(0.0, 0.0, 0.0, 1.0);
  // no return inside the loop: ANGLE on D3D11 miscompiles that once the function is called from another loop
  for (int i = 0; i < 96; i++) {
    if (i >= uSteps || t > len) break;
    vec2 p = a + dir * t;
    if (p.x < 0.0 || p.y < 0.0 || p.x >= size.x || p.y >= size.y) break;
    ivec2 ip = ivec2(p);
    float d = seedDistance(ip);
    if (d < 0.5) { res = vec4(texelFetch(uScene, ip, 0).rgb * (uEmit * exp(-uFade * (uInterval.x + t))), 0.0); break; }
    t += max(d - 0.75, 0.5);
  }
  // disc lights in front of the hit (or along the whole segment): the chord through a disc, relative to its
  // diameter, is how much of its light this ray picks up, which also gives the discs soft edges
  float tEnd = res.a > 0.5 ? len : min(t, len);
  for (int i = 0; i < 8; i++) {
    if (i >= uDiscs) break;
    vec2 oc = a - uDisc[i].xy;
    float r = uDisc[i].z;
    float pb = dot(oc, dir);
    float h = pb * pb - (dot(oc, oc) - r * r);
    if (h <= 0.0) continue;
    float sq = sqrt(h);
    float chord = max(min(-pb + sq, tEnd) - max(-pb - sq, 0.0), 0.0);
    float mid = uInterval.x + clamp(-pb, 0.0, tEnd);
    res.rgb += uDiscColor[i] * (uDisc[i].w * uEmit * chord / (2.0 * r) * exp(-uFade * mid));
  }
  return res;
}

// what upper probe pr saw beyond its interval start in the four child directions of k, averaged
vec4 upperProbe(ivec2 pr, int k) {
  vec4 s = vec4(0.0);
  for (int j = 0; j < 4; j++) {
    int kk = k * 4 + j;
    s += texelFetch(uUpper, pr * uUpperBlock + ivec2(kk % uUpperBlock, kk / uUpperBlock), 0);
  }
  s *= 0.25;
  s.rgb *= uRange;
  return s;
}

// the segment from start towards upper probe b + off, merged with what that probe saw from there
vec4 corner(vec2 start, vec2 dir, ivec2 b, ivec2 off, int k) {
  ivec2 pr = clamp(b + off, ivec2(0), uUpperProbes - 1);
  vec2 upos = (vec2(pr) + 0.5) * uUpperSpacing;
  vec4 r = march(start, upos + dir * uInterval.y);
  if (r.a > 0.0) {
    vec4 up = upperProbe(pr, k);
    r.rgb += r.a * up.rgb;
    r.a *= up.a;
  }
  return r;
}

void main() {
  ivec2 tc = ivec2(gl_FragCoord.xy);
  ivec2 probe = tc / uBlock;
  if (probe.x >= uProbes.x || probe.y >= uProbes.y) { o = vec4(0.0, 0.0, 0.0, 1.0); return; }
  ivec2 sub = tc - probe * uBlock;
  int k = sub.x + sub.y * uBlock;
  float ang = (float(k) + 0.5) * TAU / float(uBlock * uBlock);
  vec2 dir = vec2(cos(ang), sin(ang));
  vec2 origin = (vec2(probe) + 0.5) * uSpacing;
  vec2 start = origin + dir * uInterval.x;
  if (!uHasUpper || !uFix) {
    vec4 r = march(start, origin + dir * uInterval.y);
    if (uHasUpper && r.a > 0.0) {
      // plain merge: what the upper probes saw from this ray's end, interpolated
      vec2 g = origin / uUpperSpacing - 0.5;
      vec2 fl = floor(g);
      vec2 f = g - fl;
      ivec2 b = ivec2(fl);
      vec4 up = vec4(0.0);
      for (int c = 0; c < 4; c++) {
        ivec2 off = ivec2(c & 1, c >> 1);
        float w = (off.x == 1 ? f.x : 1.0 - f.x) * (off.y == 1 ? f.y : 1.0 - f.y);
        up += w * upperProbe(clamp(b + off, ivec2(0), uUpperProbes - 1), k);
      }
      r.rgb += r.a * up.rgb;
      r.a *= up.a;
    }
    o = vec4(r.rgb / uRange, r.a);
    return;
  }
  // Bilinear fix: one segment towards each of the four nearest upper probes, ending where that probe's own
  // interval begins, merged with what that probe saw from there; the four results are blended bilinearly.
  // Merging a single ray with interpolated upper light leaves rings at every cascade boundary.
  vec2 g = origin / uUpperSpacing - 0.5;
  vec2 fl = floor(g);
  vec2 f = g - fl;
  ivec2 b = ivec2(fl);
  // written out four times on purpose: ANGLE on D3D11 returns wrong results for march() called inside a loop
  vec4 acc = corner(start, dir, b, ivec2(0, 0), k) * ((1.0 - f.x) * (1.0 - f.y));
  acc += corner(start, dir, b, ivec2(1, 0), k) * (f.x * (1.0 - f.y));
  acc += corner(start, dir, b, ivec2(0, 1), k) * ((1.0 - f.x) * f.y);
  acc += corner(start, dir, b, ivec2(1, 1), k) * (f.x * f.y);
  o = vec4(acc.rgb / uRange, acc.a);
}`;

const GATHER_FS = `#version 300 es
precision highp float;
uniform sampler2D uC0;
uniform float uRange;
uniform float uOutRange;
out vec4 o;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy) * 2;
  vec3 s = texelFetch(uC0, p, 0).rgb + texelFetch(uC0, p + ivec2(1, 0), 0).rgb
         + texelFetch(uC0, p + ivec2(0, 1), 0).rgb + texelFetch(uC0, p + ivec2(1, 1), 0).rgb;
  o = vec4(s * 0.25 * uRange / uOutRange, 1.0);
}`;

/**
 * createRadiance(gl) → { resize(w, h, spacing), render(sceneTex, seedTex, emit), irradiance, probes, spacing, outRange }
 * Float targets (EXT_color_buffer_float) keep light above 1; without them values are stored scaled into RGBA8.
 * The irradiance texture is linear-filtered with mipmaps (a cheap wide blur for surfaces that need one).
 */
export function createRadiance(gl, { interval = 1.5, steps = [12, 20, 32, 44, 56, 64, 64, 64], fix = true, fade = 0 } = {}) {
  const float = !!gl.getExtension('EXT_color_buffer_float');
  gl.getExtension('OES_texture_float_linear');
  const kind = float ? 'rgba16f' : 'rgba8';
  const RANGE = float ? 1 : 24;
  const OUT_RANGE = float ? 1 : 6;
  const cascadeProg = compileProgram(gl, FULLSCREEN_VS, CASCADE_FS);
  const gatherProg = compileProgram(gl, FULLSCREEN_VS, GATHER_FS);
  const draw = fullscreen(gl);
  let W = 0, H = 0, S = 1, P0 = [1, 1], N = 1, tw = 0, th = 0;
  let tex = [], fbo = [], irr = null, irrFbo = null;

  function free() {
    tex.forEach((t) => gl.deleteTexture(t));
    fbo.forEach((f) => gl.deleteFramebuffer(f));
    if (irr) { gl.deleteTexture(irr); gl.deleteFramebuffer(irrFbo); }
    tex = []; fbo = []; irr = null;
  }

  const probesOf = (n) => [Math.ceil(P0[0] / 2 ** n), Math.ceil(P0[1] / 2 ** n)];

  const api = {
    float,
    get irradiance() { return irr; },
    get probes() { return P0; },
    get spacing() { return S; },
    get cascades() { return N; },
    outRange: OUT_RANGE,
    fix,
    fade,
    resize(w, h, spacing = 1) {
      w = Math.max(1, w | 0); h = Math.max(1, h | 0);
      if (w === W && h === H && spacing === S && irr) return;
      free();
      W = w; H = h; S = spacing;
      P0 = [Math.ceil(W / S), Math.ceil(H / S)];
      // enough cascades for the last interval to reach across the diagonal
      const diag = Math.hypot(W, H);
      const a = interval * S;
      N = 1;
      while ((a * (4 ** N - 1)) / 3 < diag && N < 8) N++;
      tw = 0; th = 0;
      for (let n = 0; n < N; n++) {
        const [px, py] = probesOf(n);
        tw = Math.max(tw, px * 2 ** (n + 1));
        th = Math.max(th, py * 2 ** (n + 1));
      }
      for (let i = 0; i < 2; i++) {
        tex.push(createTexture(gl, tw, th, kind));
        fbo.push(createTarget(gl, tex[i]));
      }
      irr = createTexture(gl, P0[0], P0[1], kind, gl.LINEAR_MIPMAP_LINEAR);
      irrFbo = createTarget(gl, irr);
    },
    /** discs: [{ x, y, r, k, color: [r, g, b] }] in GI px (y up), up to 8 */
    render(sceneTex, seedTex, emit = 1, discs = []) {
      gl.disable(gl.BLEND);
      const L = cascadeProg.loc;
      gl.useProgram(cascadeProg.prog);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, seedTex);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, sceneTex);
      gl.uniform1i(L.uSeed, 0);
      gl.uniform1i(L.uScene, 1);
      gl.uniform1i(L.uUpper, 2);
      gl.uniform2i(L.uGi, W, H);
      gl.uniform1f(L.uEmit, emit);
      gl.uniform1f(L.uRange, RANGE);
      gl.uniform1i(L.uFix, api.fix ? 1 : 0);
      gl.uniform1f(L.uFade, api.fade);
      const n8 = Math.min(8, discs.length);
      gl.uniform1i(L.uDiscs, n8);
      if (n8) {
        const d4 = new Float32Array(32), c3 = new Float32Array(24);
        discs.slice(0, 8).forEach((d, i) => { d4.set([d.x, d.y, d.r, d.k], i * 4); c3.set(d.color, i * 3); });
        gl.uniform4fv(L.uDisc, d4);
        gl.uniform3fv(L.uDiscColor, c3);
      }
      const a = interval * S;
      let cur = 0;
      for (let n = N - 1; n >= 0; n--) {
        const [px, py] = probesOf(n);
        const block = 2 ** (n + 1);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo[cur]);
        gl.viewport(0, 0, px * block, py * block);
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, n === N - 1 ? null : tex[1 - cur]);
        gl.uniform1i(L.uHasUpper, n === N - 1 ? 0 : 1);
        gl.uniform1f(L.uSpacing, S * 2 ** n);
        gl.uniform1i(L.uBlock, block);
        gl.uniform2i(L.uProbes, px, py);
        const [ux, uy] = probesOf(n + 1);
        gl.uniform1f(L.uUpperSpacing, S * 2 ** (n + 1));
        gl.uniform1i(L.uUpperBlock, block * 2);
        gl.uniform2i(L.uUpperProbes, ux, uy);
        gl.uniform2f(L.uInterval, (a * (4 ** n - 1)) / 3, (a * (4 ** (n + 1) - 1)) / 3);
        gl.uniform1i(L.uSteps, steps[Math.min(n, steps.length - 1)]);
        draw();
        cur = 1 - cur;
      }
      // cascade 0 now sits in tex[1 - cur]
      gl.bindFramebuffer(gl.FRAMEBUFFER, irrFbo);
      gl.viewport(0, 0, P0[0], P0[1]);
      gl.useProgram(gatherProg.prog);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex[1 - cur]);
      gl.uniform1i(gatherProg.loc.uC0, 0);
      gl.uniform1f(gatherProg.loc.uRange, RANGE);
      gl.uniform1f(gatherProg.loc.uOutRange, OUT_RANGE);
      draw();
      gl.bindTexture(gl.TEXTURE_2D, irr);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return irr;
    },
    dispose() {
      free();
      gl.deleteProgram(cascadeProg.prog);
      gl.deleteProgram(gatherProg.prog);
    }
  };
  return api;
}
