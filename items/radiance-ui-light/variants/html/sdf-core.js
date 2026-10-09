/* SDF core: a Canvas 2D mask → jump flooding on the GPU → a field of nearest seeds, from which any shader reads the
   exact distance to the mask. WebGL2 without extensions: seeds are pixel coordinates in an RG16UI texture
   (integer textures can be render targets in core WebGL2), 65535 marks "no seed found yet".
   Coordinates are GL-style: pixel (0, 0) is the bottom-left; masks are uploaded with FLIP_Y so rows match. */

export const NO_SEED = 65535;

/** Fullscreen triangle from gl_VertexID; draw with an empty VAO and drawArrays(TRIANGLES, 0, 3). */
export const FULLSCREEN_VS = `#version 300 es
void main() {
  vec2 p = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0);
  gl_Position = vec4(p, 0.0, 1.0);
}`;

/** GLSL helpers for consumers: distance to the nearest seed and the seed itself. Bind the seed texture to uSeed. */
export const SDF_GLSL = `
uniform highp usampler2D uSeed;
const uint NO_SEED = 65535u;
// nearest seed of pixel p, or (-1, -1) when the mask was empty
vec2 seedOf(ivec2 p) {
  uvec2 s = texelFetch(uSeed, p, 0).xy;
  return s.x == NO_SEED ? vec2(-1.0) : vec2(s);
}
// distance in pixels from the centre of pixel p to the nearest seed pixel centre (1e4 when there is none)
float seedDistance(ivec2 p) {
  uvec2 s = texelFetch(uSeed, p, 0).xy;
  return s.x == NO_SEED ? 1e4 : length(vec2(s) - vec2(p));
}
// the same for any point: the seed of the pixel it falls into, measured from the point itself
float seedDistanceAt(vec2 q, ivec2 size) {
  ivec2 p = clamp(ivec2(q), ivec2(0), size - 1);
  uvec2 s = texelFetch(uSeed, p, 0).xy;
  return s.x == NO_SEED ? 1e4 : length(vec2(s) + 0.5 - q);
}`;

const SEED_FS = `#version 300 es
precision highp float;
uniform sampler2D uMask;
uniform int uChannel;
uniform float uThreshold;
uniform bool uInvert;
out uvec4 o;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  float m = texelFetch(uMask, p, 0)[uChannel];
  bool seed = (m >= uThreshold) != uInvert;
  o = seed ? uvec4(uvec2(p), 0u, 0u) : uvec4(65535u, 65535u, 0u, 0u);
}`;

const STEP_FS = `#version 300 es
precision highp float;
precision highp int;
uniform highp usampler2D uSrc;
uniform int uStep;
uniform ivec2 uSize;
out uvec4 o;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  uvec2 best = uvec2(65535u);
  float bestD = 3.0e38;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      ivec2 q = p + ivec2(i, j) * uStep;
      if (q.x < 0 || q.y < 0 || q.x >= uSize.x || q.y >= uSize.y) continue;
      uvec2 s = texelFetch(uSrc, q, 0).xy;
      if (s.x == 65535u) continue;
      vec2 d = vec2(s) - vec2(p);
      float dd = dot(d, d);
      if (dd < bestD) { bestD = dd; best = s; }
    }
  }
  o = uvec4(best, 0u, 0u);
}`;

export function compileProgram(gl, vsSrc, fsSrc) {
  const make = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) {
      const log = gl.getShaderInfoLog(s);
      gl.deleteShader(s);
      throw new Error(`shader: ${log}`);
    }
    return s;
  };
  const prog = gl.createProgram();
  const vs = make(gl.VERTEX_SHADER, vsSrc);
  const fs = make(gl.FRAGMENT_SHADER, fsSrc);
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error(`link: ${gl.getProgramInfoLog(prog)}`);
  // uniform locations, looked up once
  const loc = {};
  const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS) || 0;
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(prog, i);
    const name = info.name.replace(/\[0\]$/, '');
    loc[name] = gl.getUniformLocation(prog, info.name);
  }
  return { prog, loc };
}

/** A 2D texture. kind: 'seed' (RG16UI), 'rgba8', 'rgba16f', 'r8'. */
export function createTexture(gl, w, h, kind = 'rgba8', filter = gl.NEAREST) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  const f = {
    seed: [gl.RG16UI, gl.RG_INTEGER, gl.UNSIGNED_SHORT],
    rgba8: [gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE],
    rgba16f: [gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT],
    r8: [gl.R8, gl.RED, gl.UNSIGNED_BYTE]
  }[kind];
  gl.texImage2D(gl.TEXTURE_2D, 0, f[0], w, h, 0, f[1], f[2], null);
  const filt = kind === 'seed' ? gl.NEAREST : filter;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filt);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filt === gl.LINEAR_MIPMAP_LINEAR ? gl.LINEAR : filt);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

export function createTarget(gl, tex) {
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return fb;
}

/** Copies a canvas into an RGBA8 texture, rows flipped so that texel (0, 0) is the canvas's bottom-left pixel. */
export function uploadCanvas(gl, tex, canvas, filter = gl.NEAREST) {
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}

/** One empty VAO per context is enough for every fullscreen pass. */
export function fullscreen(gl) {
  const vao = gl.createVertexArray();
  return () => {
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
}

/**
 * Jump flooding. run(maskTex) marks seeds where mask[channel] >= threshold (or below it with invert),
 * then floods: steps of half the size down to 1, plus one more pass at 1 that fixes most JFA misses.
 * Returns the RG16UI texture with the nearest seed of every pixel; it stays valid until the next run().
 * Cost: (log2(max side) + 2) passes of 9 integer fetches; 1024 px takes 12 passes.
 */
export function createJfa(gl) {
  const seedProg = compileProgram(gl, FULLSCREEN_VS, SEED_FS);
  const stepProg = compileProgram(gl, FULLSCREEN_VS, STEP_FS);
  const draw = fullscreen(gl);
  let w = 0, h = 0;
  let tex = [], fbo = [];

  function free() {
    tex.forEach((t) => gl.deleteTexture(t));
    fbo.forEach((f) => gl.deleteFramebuffer(f));
    tex = []; fbo = [];
  }

  return {
    get width() { return w; },
    get height() { return h; },
    resize(nw, nh) {
      nw = Math.max(1, nw | 0); nh = Math.max(1, nh | 0);
      if (nw === w && nh === h) return;
      free();
      w = nw; h = nh;
      for (let i = 0; i < 2; i++) {
        tex.push(createTexture(gl, w, h, 'seed'));
        fbo.push(createTarget(gl, tex[i]));
      }
    },
    run(maskTex, { channel = 3, threshold = 0.5, invert = false } = {}) {
      gl.disable(gl.BLEND);
      gl.viewport(0, 0, w, h);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo[0]);
      gl.useProgram(seedProg.prog);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, maskTex);
      gl.uniform1i(seedProg.loc.uMask, 0);
      gl.uniform1i(seedProg.loc.uChannel, channel);
      gl.uniform1f(seedProg.loc.uThreshold, threshold);
      gl.uniform1i(seedProg.loc.uInvert, invert ? 1 : 0);
      draw();
      gl.useProgram(stepProg.prog);
      gl.uniform1i(stepProg.loc.uSrc, 0);
      gl.uniform2i(stepProg.loc.uSize, w, h);
      let cur = 0;
      const steps = [];
      for (let s = 1 << Math.ceil(Math.log2(Math.max(w, h) / 2 || 1)); s >= 1; s >>= 1) steps.push(s);
      steps.push(1);
      for (const s of steps) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo[1 - cur]);
        gl.bindTexture(gl.TEXTURE_2D, tex[cur]);
        gl.uniform1i(stepProg.loc.uStep, s);
        draw();
        cur = 1 - cur;
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return tex[cur];
    },
    dispose() {
      free();
      gl.deleteProgram(seedProg.prog);
      gl.deleteProgram(stepProg.prog);
    }
  };
}
