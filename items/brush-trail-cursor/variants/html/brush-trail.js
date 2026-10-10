/* Brush Trail Cursor — the pointer leaves a brush stroke that dries into the paper and fades.
   Three brushes: a flat brush with streaks, a bristle brush whose hairs run dry, and a stamp that prints leaves along
   the path. Slow strokes are wide and saturated, fast ones thin and pale. Wet ink bleeds a little, then dries: the
   pigment settles into the paper grain, the edges darken, and the trail fades out.

     import { createBrushTrail } from './brush-trail.js';
     const trail = createBrushTrail(document.querySelector('.paper'), { brush: 'bristle', size: 22 });
     trail.setBrush('stamp');   trail.clear();   trail.destroy();

   WebGL2: the ink lives in two float textures (ping-pong). Each frame one pass dries, bleeds and fades the previous
   state into the next, then the new stamps are blended on top (pigment adds, wetness takes the max), then one pass
   paints the result with the paper. Stamps are instanced quads laid along a Catmull-Rom spline through the pointer
   events, turned along the direction of travel. The loop stops once the last stroke has faded, when the page is hidden
   or the area is off screen. Returns null without WebGL2. */

const VERT_FULL = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

// Hash Kit (shelf/items/hash-kit) + value noise and the paper it makes
const PAPER = `
const uint HASH_SALT = 0xb31c96c9u;
uint hashU(uint x) {
  x ^= x >> 16; x *= 0x3f9c86cbu;
  x ^= x >> 14; x *= 0x1ae9dacfu;
  x ^= x >> 15;
  return x;
}
float hashUnit(uint h) { return float(h >> 8) * (1.0 / 16777216.0); }
float hash2(vec2 p) { ivec2 i = ivec2(floor(p)); return hashUnit(hashU(uint(i.x) + hashU(uint(i.y) + HASH_SALT))); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), u.x), mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), u.x), u.y);
}
// fibres and clouds only: smooth enough to steer the bleeding without printing the noise lattice into it
float fibre(vec2 q) {
  float cloud = vnoise(q / 41.0) * 0.6 + vnoise(q / 14.0) * 0.4;
  vec2 r = mat2(0.866, 0.5, -0.5, 0.866) * q;
  float fib = max(vnoise(vec2(q.x / 46.0, q.y / 1.6)), vnoise(vec2(r.x / 1.6 + 17.0, r.y / 52.0)));
  return 0.5 * cloud + 0.5 * smoothstep(0.62, 0.9, fib);
}
// paper height 0…1 at a CSS-pixel position: tooth on two turned lattices (so no grid shows), clouds, fibres
float paper(vec2 q) {
  float tooth = vnoise(mat2(0.951, 0.309, -0.309, 0.951) * q / 2.1) * 0.6 + vnoise(mat2(0.643, -0.766, 0.766, 0.643) * q / 4.3) * 0.4;
  return clamp(0.45 * tooth + 0.7 * fibre(q) - 0.1, 0.0, 1.0);
}`;

const FRAG_UPDATE = `#version 300 es
precision highp float;
uniform sampler2D uPrev;
uniform float uDt, uDry, uFadeWet, uFadeDry, uQuant;
uniform uint uFrame;
out vec4 o;
${PAPER}
vec4 at(ivec2 p) { return texelFetch(uPrev, clamp(p, ivec2(0), textureSize(uPrev, 0) - 1), 0); }
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 c = at(p);
  c.a *= exp(-uDt / uDry);
  c.rgb *= exp(-uDt / mix(uFadeDry, uFadeWet, c.a));
  c.rgb = max(c.rgb - uDt * 0.006, 0.0);                              // so it really reaches zero
  if (uQuant > 0.0) {                                                  // 8-bit fallback: stochastic rounding
    float d = hashUnit(hashU(uint(p.x) + hashU(uint(p.y) + hashU(uFrame + HASH_SALT))));
    c = floor(c * 255.0 + d) / 255.0;
  }
  o = c;
}`;

const VERT_STAMP = `#version 300 es
layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec4 aA;     // x, y (device px), angle, half width
layout(location = 2) in vec4 aB;     // half length, density, saturation, dryness
layout(location = 3) in vec2 aC;     // stroke seed, hue
uniform vec2 uRes;
out vec2 vLocal;
out vec4 vB;
out vec2 vC;
out float vHalfL;
out float vHalfW;
void main() {
  vec2 local = aCorner * vec2(aB.x, aA.w);
  float c = cos(aA.z), s = sin(aA.z);
  vec2 pos = aA.xy + vec2(c * local.x - s * local.y, s * local.x + c * local.y);
  vLocal = local / aA.w;
  vHalfL = aB.x / aA.w;
  vHalfW = aA.w;
  vB = aB; vC = aC;
  gl_Position = vec4(pos / uRes * 2.0 - 1.0, 0.0, 1.0);
  gl_Position.y = -gl_Position.y;
}`;

const FRAG_STAMP = `#version 300 es
precision highp float;
in vec2 vLocal;
in vec4 vB;
in vec2 vC;
in float vHalfL;
in float vHalfW;
uniform int uShape;
uniform float uRefHalf;   // half width of the brush at rest, device px: hairs keep their place when the stroke narrows
out vec4 o;
${PAPER}
float lane(float x, float seed) { return vnoise(vec2(x, seed)); }
void main() {
  float along = vLocal.x, across = vLocal.y;
  float fixedAcross = across * vHalfW / uRefHalf;   // -1…1 over the whole brush, whatever this stamp's width
  float m = 0.0;
  if (uShape == 0) {                     // flat: soft-sided ribbon with streaks running along the stroke
    float side = (1.0 - smoothstep(0.8, 1.0, abs(across)));
    float ends = (1.0 - smoothstep(0.0, vHalfL, abs(along)));
    float streak = 0.62 + 0.38 * lane(fixedAcross * 7.0 + 3.0, vC.x * 97.0);
    m = side * ends * streak;
  } else if (uShape == 1) {              // bristle: hairs in lanes, dry ones drop out
    const float LANES = 9.0;
    float x = clamp(fixedAcross * 0.5 + 0.5, 0.0, 0.999) * LANES;
    float li = floor(x), lf = fract(x);
    float h = hashUnit(hashU(uint(li) + hashU(uint(vC.x * 4096.0) + HASH_SALT)));
    float h2 = hashUnit(hashU(uint(li) + 7919u + hashU(uint(vC.x * 4096.0))));
    float hair = (1.0 - smoothstep(0.06 + 0.14 * h2, 0.5, abs(lf - 0.5)));
    float alive = smoothstep(vB.w - 0.06, vB.w + 0.06, h);
    float ends = (1.0 - smoothstep(0.0, vHalfL, abs(along)));
    m = hair * alive * ends * (0.55 + 0.45 * h2) * step(abs(across), 1.0) * 1.35;
  } else {                               // stamp: a leaf with a pale vein
    vec2 q = vec2(along, across);
    const float K = 1.25;
    float r = sqrt(1.0 + K * K);
    float d = max(length(q - vec2(0.0, K)), length(q + vec2(0.0, K))) - r;
    m = (1.0 - smoothstep(-0.04, 0.04, d));
    m *= 1.0 - 0.6 * (1.0 - smoothstep(0.0, 0.045, abs(across))) * step(abs(along), 0.82);
    m *= 0.8 + 0.2 * lane(along * 5.0, vC.x * 31.0);
  }
  float pig = m * vB.y;
  o = vec4(pig, pig * vB.z, pig * vC.y, m);
}`;

const FRAG_SHOW = `#version 300 es
precision highp float;
uniform sampler2D uState;
uniform float uDpr, uDark, uGrainShow, uBleed;
uniform vec3 uInkA, uInkB, uDull, uPaperTint;
out vec4 o;
${PAPER}
vec4 at(ivec2 p) { return texelFetch(uState, clamp(p, ivec2(0), textureSize(uState, 0) - 1), 0); }
float pig(ivec2 p) { return at(p).r; }
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 c = at(p);
  float g = paper(gl_FragCoord.xy / uDpr);
  if (uBleed > 0.0) {
    // ink feathers into the paper: a 3×3 neighbourhood (sides 2, corners 1), more where the fibres are
    int b = max(1, int(uDpr + 0.5));
    vec4 n = (2.0 * (at(p + ivec2(b, 0)) + at(p - ivec2(b, 0)) + at(p + ivec2(0, b)) + at(p - ivec2(0, b)))
            + at(p + ivec2(b, b)) + at(p - ivec2(b, b)) + at(p + ivec2(b, -b)) + at(p + ivec2(-b, b))) / 12.0;
    float k = uBleed * (0.6 + 0.6 * g) * (1.0 - 0.4 * n.a);
    c.rgb = mix(c.rgb, n.rgb, clamp(k, 0.0, 0.8));
  }
  float paperA = uGrainShow * (g - 0.35);                                // faint paper tooth everywhere
  if (c.r < 0.002) { o = vec4(uPaperTint * max(paperA, 0.0), max(paperA, 0.0)); return; }
  float wet = c.a;
  float sat = clamp(c.g / c.r, 0.0, 1.0), hue = clamp(c.b / c.r, 0.0, 1.0);
  int s = max(2, int(2.0 * uDpr + 0.5));
  float avg = (pig(p + ivec2(s, 0)) + pig(p - ivec2(s, 0)) + pig(p + ivec2(0, s)) + pig(p - ivec2(0, s))) * 0.25;
  float dry = 1.0 - wet;
  float dens = c.r * mix(1.0, 0.45 + 1.1 * g, dry * 0.8);             // dried pigment sits in the grain
  dens += max(c.r - avg, 0.0) * 1.6 * dry;                              // and pools at the edges
  float a = 1.0 - exp(-dens * 2.4);
  vec3 ink = mix(uInkA, uInkB, hue);
  ink = mix(uDull, ink, sat);
  ink *= mix(1.0, mix(0.82, 1.12, uDark), wet);                         // wet ink is deeper (lighter on dark paper)
  o = vec4(ink * a, a);
}`;

const INKS = {
  light: { a: [0.13, 0.2, 0.62], b: [0.88, 0.27, 0.16], dull: [0.42, 0.42, 0.46], tint: [0.32, 0.27, 0.2] },
  dark: { a: [0.58, 0.72, 1.0], b: [1.0, 0.56, 0.42], dull: [0.62, 0.6, 0.58], tint: [1.0, 0.96, 0.9] }
};
const SHAPES = { flat: 0, bristle: 1, stamp: 2 };
const MAX_STAMPS = 6000;
const FLOATS = 10;

export function createBrushTrail(container, opts = {}) {
  const o = { brush: 'flat', size: 22, touch: true, grain: 1, ...opts };
  const canvas = document.createElement('canvas');
  canvas.className = 'brush-trail';
  canvas.setAttribute('aria-hidden', 'true');
  const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
  if (!gl) return null;
  container.prepend(canvas);
  if (o.touch) container.classList.add('brush-trail-touch');

  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const darkMq = matchMedia('(prefers-color-scheme: dark)');
  const floatOk = !!gl.getExtension('EXT_color_buffer_float');

  // ---------- programs ----------
  function program(vs, fs) {
    const p = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      gl.attachShader(p, s);
    }
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const name = gl.getActiveUniform(p, i).name; u[name] = gl.getUniformLocation(p, name); }
    return { p, u };
  }
  const upd = program(VERT_FULL, FRAG_UPDATE);
  const stamp = program(VERT_STAMP, FRAG_STAMP);
  const show = program(VERT_FULL, FRAG_SHOW);

  // stamp geometry: one quad, per-instance data
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const inst = gl.createBuffer();
  const data = new Float32Array(MAX_STAMPS * FLOATS);
  gl.bindBuffer(gl.ARRAY_BUFFER, inst);
  gl.bufferData(gl.ARRAY_BUFFER, data.byteLength, gl.DYNAMIC_DRAW);
  const stride = FLOATS * 4;
  [[1, 4, 0], [2, 4, 16], [3, 2, 32]].forEach(([loc, n, off]) => {
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, n, gl.FLOAT, false, stride, off);
    gl.vertexAttribDivisor(loc, 1);
  });
  gl.bindVertexArray(null);
  const emptyVao = gl.createVertexArray();

  // ---------- state textures ----------
  let W = 0, H = 0, dpr = 1;
  let tex = [], fbo = [], cur = 0;
  function makeTargets() {
    for (const t of tex) gl.deleteTexture(t);
    for (const f of fbo) gl.deleteFramebuffer(f);
    tex = []; fbo = [];
    for (let i = 0; i < 2; i++) {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      if (floatOk) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, W, H, 0, gl.RGBA, gl.HALF_FLOAT, null);
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      const f = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      tex.push(t); fbo.push(f);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  function resize() {
    const r = container.getBoundingClientRect();
    dpr = Math.min(2, devicePixelRatio || 1);
    const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (w === W && h === H) return;
    W = w; H = h;
    canvas.width = W; canvas.height = H;
    makeTargets();
    draw(0);
  }

  // ---------- the brush ----------
  let brush = SHAPES[o.brush] ?? 0;
  let count = 0;            // stamps waiting for the next frame
  let pts = [];             // recent pointer samples {x, y, t, w, d, s}
  let carry = 0;            // distance left over toward the next stamp
  let strokes = 0;
  let stroke = { seed: Math.random(), paint: 1, flip: 1, dist: 0, n: 0 };
  let vel = 0;              // smoothed speed, css px per ms
  let totalDist = 0;
  let lastInput = -1e9;
  let lastStamp = -1e9;

  function newStroke() {
    pts = []; carry = 0;
    stroke = { seed: Math.random(), paint: 1, flip: 1, dist: 0, n: ++strokes };
  }
  function push(x, y, angle, halfW, halfL, dens, sat, dry, hue) {
    if (count >= MAX_STAMPS) return;
    const i = count++ * FLOATS;
    data[i] = x * dpr; data[i + 1] = y * dpr; data[i + 2] = angle; data[i + 3] = halfW * dpr;
    data[i + 4] = halfL * dpr; data[i + 5] = dens; data[i + 6] = sat; data[i + 7] = dry;
    data[i + 8] = stroke.seed; data[i + 9] = hue;
  }
  // Catmull-Rom through p0…p3, the piece between p1 and p2
  const cr = (a, b, c, d, t) => {
    const t2 = t * t, t3 = t2 * t;
    return 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3);
  };
  function addPoint(x, y, t, pressure) {
    let prev = pts[pts.length - 1];
    if (!prev || t - lastInput > 350) { newStroke(); prev = undefined; }
    lastInput = t;
    if (prev && pts.length) {
      const dt = Math.max(1, t - prev.t);
      const v = Math.hypot(x - prev.x, y - prev.y) / dt;
      vel += (v - vel) * Math.min(1, dt / 40);
      if (vel < 0.12) stroke.paint = Math.min(1, stroke.paint + dt / 700);   // a pause reloads the brush
    } else vel = 0;
    const size = o.size * (pressure > 0 && pressure !== 0.5 ? 0.4 + pressure * 1.2 : 1);
    const k = Math.min(1, vel / 2.2);                     // 0 slow … 1 fast
    const sample = {
      x, y, t,
      w: size * (1.25 - 0.85 * k),                         // slow: wide; fast: thin
      d: 1 - 0.55 * k,                                     // slow: dense
      s: 1 - 0.7 * k                                       // slow: saturated
    };
    if (prev && Math.hypot(x - prev.x, y - prev.y) < 0.5) return;
    pts.push(sample);
    if (pts.length > 4) pts.shift();
    if (pts.length >= 2) lay();
  }
  function lay() {
    const n = pts.length;
    const p1 = pts[n - 2], p2 = pts[n - 1];
    const p0 = n >= 3 ? pts[n - 3] : p1;
    const p3 = { x: 2 * p2.x - p1.x, y: 2 * p2.y - p1.y };
    const segLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const steps = Math.max(2, Math.ceil(segLen / 2));
    let px = p1.x, py = p1.y;
    for (let j = 1; j <= steps; j++) {
      const t = j / steps;
      const x = cr(p0.x, p1.x, p2.x, p3.x, t), y = cr(p0.y, p1.y, p2.y, p3.y, t);
      let dx = x - px, dy = y - py, len = Math.hypot(dx, dy);
      if (len < 1e-4) continue;
      const angle = Math.atan2(dy, dx);
      const w = p1.w + (p2.w - p1.w) * t, d = p1.d + (p2.d - p1.d) * t, s = p1.s + (p2.s - p1.s) * t;
      const halfW = w * 0.5;
      const spacing = brush === 2 ? w * 1.15 : Math.max(0.6, halfW * 0.05);
      let walked = 0;
      while (carry + (len - walked) >= spacing) {
        walked += spacing - carry; carry = 0;
        const f = walked / len;
        const sx = px + dx * f, sy = py + dy * f;
        stroke.dist += spacing;
        totalDist += spacing;
        const hue = 0.5 + 0.5 * Math.sin(totalDist / 420 + stroke.n * 2.1);
        if (brush === 2) {
          // leaves alternate sides of the path, tilted 38° off the direction
          stroke.flip = -stroke.flip;
          const tilt = angle + stroke.flip * 0.66;
          const off = halfW * 0.55 * stroke.flip;
          push(sx - Math.sin(angle) * off, sy + Math.cos(angle) * off, tilt, halfW * 0.95, halfW * 0.95, Math.min(1, d + 0.15), s, 0, hue);
        } else {
          // long soft bumps, several per pixel: their sum is smooth, with no banding across the stroke
          const halfL = Math.max(2.2, spacing * 3.5);
          const gain = spacing / halfL * 1.1;
          stroke.paint = Math.max(0.12, stroke.paint - spacing / (o.size * 38) * (0.6 + vel));
          const dry = brush === 1 ? 1 - stroke.paint : 0;
          push(sx, sy, angle, halfW, halfL, d * gain, s, dry, hue);
        }
      }
      carry += len - walked;
      px = x; py = y;
    }
    lastStamp = performance.now();
    wake();
  }

  // ---------- frame ----------
  let raf = 0, last = 0, frame = 0, visible = true, frozen = false;
  const isDark = () => (o.theme ? o.theme === 'dark' : darkMq.matches);
  function passUpdate(dt) {
    const src = cur, dst = 1 - cur;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo[dst]);
    gl.viewport(0, 0, W, H);
    gl.disable(gl.BLEND);
    gl.useProgram(upd.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex[src]);
    gl.uniform1i(upd.u.uPrev, 0);
    const calm = reduce.matches;
    gl.uniform1f(upd.u.uDt, dt);
    gl.uniform1f(upd.u.uDry, calm ? 0.5 : 1.1);
    gl.uniform1f(upd.u.uFadeWet, calm ? 1.2 : 9);
    gl.uniform1f(upd.u.uFadeDry, calm ? 0.9 : 2.4);
    gl.uniform1f(upd.u.uQuant, floatOk ? 0 : 1);
    gl.uniform1ui(upd.u.uFrame, frame++ >>> 0);
    gl.bindVertexArray(emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    cur = dst;
  }
  function passStamps() {
    if (!count) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo[cur]);
    gl.viewport(0, 0, W, H);
    gl.enable(gl.BLEND);
    gl.blendEquationSeparate(gl.FUNC_ADD, gl.MAX);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(stamp.p);
    gl.uniform2f(stamp.u.uRes, W, H);
    gl.uniform1i(stamp.u.uShape, brush);
    gl.uniform1f(stamp.u.uRefHalf, o.size * 0.65 * dpr);
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, inst);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, count * FLOATS);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
    gl.disable(gl.BLEND);
    count = 0;
  }
  function passShow() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.useProgram(show.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex[cur]);
    gl.uniform1i(show.u.uState, 0);
    const ink = INKS[isDark() ? 'dark' : 'light'];
    gl.uniform3fv(show.u.uInkA, ink.a);
    gl.uniform3fv(show.u.uInkB, ink.b);
    gl.uniform3fv(show.u.uDull, ink.dull);
    gl.uniform3fv(show.u.uPaperTint, ink.tint);
    gl.uniform1f(show.u.uDark, isDark() ? 1 : 0);
    gl.uniform1f(show.u.uDpr, dpr);
    gl.uniform1f(show.u.uBleed, reduce.matches ? 0 : 0.55);
    gl.uniform1f(show.u.uGrainShow, (isDark() ? 0.045 : 0.055) * o.grain);
    gl.bindVertexArray(emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  function draw(dt) {
    if (!W) return;
    if (dt > 0) passUpdate(dt);
    passStamps();
    passShow();
  }
  // a stroke is gone after ~14 s (dry 1.1 s, then fading with τ 2.4 s plus the floor)
  const LIFETIME = 14000;
  function loop(now) {
    raf = 0;
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    draw(dt);
    if (!frozen && visible && !document.hidden && now - lastStamp < LIFETIME) raf = requestAnimationFrame(loop);
    else if (now - lastStamp >= LIFETIME) clearTargets();
  }
  function wake() {
    if (raf || frozen || !visible || document.hidden) return;
    last = performance.now();
    raf = requestAnimationFrame(loop);
  }
  function clearTargets() {
    for (const f of fbo) { gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); }
    count = 0;
    draw(0);
  }

  // ---------- input ----------
  const local = (e) => {
    const r = container.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  let touchDown = false;
  function onMove(e) {
    if (e.pointerType === 'touch' && (!o.touch || !touchDown)) return;
    if (e.pointerType === 'pen' && e.buttons === 0 && e.pressure === 0 && !matchMedia('(hover: hover)').matches) return;
    const list = e.getCoalescedEvents?.() ?? [];
    for (const ev of list.length ? list : [e]) {
      const [x, y] = local(ev);
      addPoint(x, y, ev.timeStamp || performance.now(), ev.pointerType === 'pen' ? ev.pressure : 0);
    }
  }
  function onDown(e) {
    if (e.pointerType !== 'touch' || !o.touch) return;
    touchDown = true;
    newStroke();
    const [x, y] = local(e);
    addPoint(x, y, e.timeStamp, 0);
  }
  function onUp(e) { if (e.pointerType === 'touch') { touchDown = false; pts = []; } }
  function onLeave(e) { if (e.pointerType !== 'touch') pts = []; }
  container.addEventListener('pointermove', onMove);
  container.addEventListener('pointerdown', onDown);
  container.addEventListener('pointerup', onUp);
  container.addEventListener('pointercancel', onUp);
  container.addEventListener('pointerleave', onLeave);

  const ro = new ResizeObserver(resize);
  ro.observe(container);
  const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible) wake(); });
  io.observe(container);
  const onVis = () => { if (!document.hidden) wake(); };
  document.addEventListener('visibilitychange', onVis);
  const onTheme = () => draw(0);
  darkMq.addEventListener('change', onTheme);
  resize();

  return {
    canvas,
    setBrush(name) { if (name in SHAPES) { brush = SHAPES[name]; newStroke(); } },
    get brush() { return Object.keys(SHAPES)[brush]; },
    clear: clearTargets,
    /** draws a path of [x, y, speed?] points (CSS px) as if the pointer moved along it at `speed` px/ms */
    paintPath(points, speed = 0.6) {
      newStroke();
      lastInput = -1e9;
      let t = performance.now() - 100000 + Math.random() * 1000;
      points.forEach(([x, y, v], i) => {
        if (i) t += Math.hypot(x - points[i - 1][0], y - points[i - 1][1]) / (v ?? speed);
        addPoint(x, y, t, 0);
        if (count > MAX_STAMPS - 400) draw(0);
      });
      lastInput = -1e9;
      draw(0);
    },
    /** runs the drying for `seconds` at once (posters) */
    age(seconds) { for (let t = 0; t < seconds; t += 1 / 60) passUpdate(1 / 60); draw(0); },
    freeze(on = true) { frozen = on; if (!on) wake(); },
    destroy() {
      cancelAnimationFrame(raf); ro.disconnect(); io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      darkMq.removeEventListener('change', onTheme);
      container.removeEventListener('pointermove', onMove);
      container.removeEventListener('pointerdown', onDown);
      container.removeEventListener('pointerup', onUp);
      container.removeEventListener('pointercancel', onUp);
      container.removeEventListener('pointerleave', onLeave);
      container.classList.remove('brush-trail-touch');
      canvas.remove();
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  };
}
