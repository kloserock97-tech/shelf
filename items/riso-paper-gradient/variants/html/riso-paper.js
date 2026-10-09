/* Riso Paper Gradient — a gradient printed like a risograph, in one WebGL2 full-screen pass.
   Three ink plates (yellow, coral, blue on white paper; cream, coral, teal on black paper), each with its own
   halftone angle and its own misregistration, ink grain, paper fibres and creases. Everything is procedural.
   The canvas is redrawn only when something changes (size, theme, a parameter, a reprint), so at rest it costs nothing.

     import { createRisoPaper } from './riso-paper.js';
     const riso = createRisoPaper(canvas, { registration: 0.5, grain: 0.5, creases: 0.4 });
     riso.set({ creases: 0.8 });   // redraws once
     riso.reprint();               // a new sheet: new seed, the plates slide into their new places

   Returns null when WebGL2 is not available (show a CSS gradient instead). */

const VERT = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
uniform vec2 uRes;         // canvas, device px
uniform float uDpr;
uniform uint uSeed;
uniform float uGrain;      // 0…1
uniform float uCrease;     // 0…1
uniform float uDark;       // 0 — white paper, 1 — black paper
uniform float uCell;       // halftone cell, CSS px
uniform vec3 uPaper;
uniform vec3 uInk[3];
uniform float uOpacity[3];
uniform vec3 uPlate[3];    // per plate: offset x, offset y (CSS px), turn (radians)
uniform float uAngle[3];   // halftone screen angle per plate
out vec4 outColor;

// Hash Kit (shelf/items/hash-kit): integer mixer, our own constants
const uint HASH_SALT = 0xb31c96c9u;
uint hashU(uint x) {
  x ^= x >> 16; x *= 0x3f9c86cbu;
  x ^= x >> 14; x *= 0x1ae9dacfu;
  x ^= x >> 15;
  return x;
}
float hashUnit(uint h) { return float(h >> 8) * (1.0 / 16777216.0); }
float cellHash(vec2 p) {
  ivec2 i = ivec2(floor(p));
  return hashUnit(hashU(uint(i.x) + hashU(uint(i.y) + hashU(uSeed + HASH_SALT))));
}
float dither(vec2 pixel) { return fract(dot(floor(pixel), vec2(0.3455768, 0.4279792))); }

// value noise on the hash, quintic fade so the lattice does not show in fibres
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = cellHash(i), b = cellHash(i + vec2(1.0, 0.0));
  float c = cellHash(i + vec2(0.0, 1.0)), d = cellHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
// octaves turned by half a radian and scaled by 2.03
const mat2 OCT = mat2(0.877583, 0.479426, -0.479426, 0.877583) * 2.03;
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = OCT * p + vec2(5.3, 1.7); a *= 0.5; }
  return s / 0.9375;
}
mat2 turn(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }

// The design: one picture split into three plates. q is in sheet units (height 1, centre 0).
// The warp is fixed (not seeded), so a reprint keeps the picture and changes only the print.
float sunMask(vec2 r, float soft) { return smoothstep(0.25 + soft, 0.25 - soft * 0.3, length(r - vec2(0.3, 0.07))); }
float plateField(int k, vec2 q) {
  vec2 w = vec2(fbm(q * 1.6 + vec2(3.1, 7.4)), fbm(q * 1.6 + vec2(-6.2, 2.9))) - 0.5;
  vec2 r = q + w * 0.42;
  vec2 rs = q + w * 0.05;           // the sun keeps a round, crisp edge: misregistration shows on it
  if (k == 0) {                     // first plate: rises from the lower right
    return 0.92 * smoothstep(0.42, -0.62, r.y + 0.28 * r.x);
  } else if (k == 1) {              // second plate: a sun with a glow and a warm band across the middle
    float sun = max(sunMask(rs, 0.006), 0.45 * sunMask(rs, 0.3));
    float band = 0.5 * exp(-pow((r.y + 0.14 - 0.22 * r.x) / 0.22, 2.0));
    return clamp(max(sun, band), 0.0, 1.0);
  }
  // third plate: deepens toward the top, knocked out under the sun
  return 0.9 * smoothstep(-0.42, 0.6, r.y - 0.18 * r.x) * (1.0 - 0.85 * sunMask(rs, 0.012));
}

// Halftone dot for coverage d at plate point pc (CSS px). The spot function makes round dots in the light,
// a chequer at half, holes in the shadows. rough jitters the threshold: the dot edge goes ragged like riso ink.
float halftone(vec2 pc, float angle, float d, float rough) {
  vec2 g = turn(angle) * pc / uCell;
  float spot = 0.5 + 0.25 * (cos(6.2831853 * g.x) + cos(6.2831853 * g.y));
  float aa = fwidth(spot) * 0.75 + 1e-4;
  float t = mix(1.03, -0.03, clamp(d, 0.0, 1.0));
  return smoothstep(t - aa, t + aa, spot + rough);
}

// Paper fibres: four directions of stretched noise; the ridge of each makes a thin strand that wanders a little
float fibres(vec2 p) {
  float f = 0.0;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    vec2 r = turn(fi * 0.83 + 0.4) * p;
    r += (vec2(vnoise(r / 46.0 + fi * 3.7), vnoise(r / 46.0 - fi * 5.1)) - 0.5) * 16.0;
    float n = vnoise(vec2(r.x / 38.0, r.y / 1.7) + fi * 17.0);
    float strand = pow(1.0 - abs(2.0 * n - 1.0), 16.0);
    f += strand * smoothstep(0.35, 0.8, vnoise(r / 70.0 + fi * 9.0));
  }
  return f;
}

void main() {
  vec2 res = uRes / uDpr;
  vec2 p = gl_FragCoord.xy / uDpr;            // CSS px, origin bottom left
  vec2 centre = res * 0.5;

  // --- creases: three folds across the sheet and four short wrinkles that fade out at their ends
  float shade = 0.0, crack = 0.0;
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    float r1 = cellHash(vec2(fi, 101.0)), r2 = cellHash(vec2(fi, 102.0));
    float r3 = cellHash(vec2(fi, 103.0)), r4 = cellHash(vec2(fi, 104.0));
    bool fold = i < 3;
    vec2 c = centre + (vec2(r1, r2) - 0.5) * res * 0.8;
    float a = fold ? (fi * 1.05 + r3 * 0.7) : r3 * 3.14159;
    vec2 dir = vec2(cos(a), sin(a)), nrm = vec2(-dir.y, dir.x);
    vec2 d = p - c;
    float along = dot(d, dir);
    float len = mix(70.0, 240.0, r4);
    float weight = fold ? 1.0 : 0.55 * smoothstep(len, len * 0.25, abs(along));
    float across = dot(d, nrm) + (vnoise(vec2(along / 80.0, fi * 13.0)) - 0.5) * 5.0;
    float w = fold ? 30.0 : 12.0;
    // a ridge: one side catches the light, the other falls into shade; zero on the ridge itself, so no seam
    shade += weight * sign(across) * (1.0 - exp(-abs(across) / 1.6)) * exp(-abs(across) / w);
    // the ridge line: dark core with a light lip
    shade += weight * (0.7 * exp(-abs(across - 1.1) / 0.8) - 0.9 * exp(-abs(across) / 0.7));
    // ink flakes off along the ridge, in broken stretches
    float broken = smoothstep(0.42, 0.55, vnoise(vec2(along / 4.0, fi * 7.0)));
    crack = max(crack, weight * exp(-abs(across) / 1.1) * broken);
  }
  shade *= uCrease;
  crack *= uCrease;

  // --- paper
  float fib = fibres(p);
  float tooth = vnoise(p / 1.3) - 0.5;
  float cloud = fbm(p / 160.0) - 0.5;
  vec3 col = uPaper * (1.0 + tooth * 0.035 * (0.4 + uGrain) + cloud * 0.05);
  col += mix(-0.035, 0.05, uDark) * fib * mix(vec3(0.9, 0.85, 0.75), vec3(1.0), uDark);

  // --- ink, plate by plate: each plate has its own offset and a tiny turn (the drum never lands twice the same)
  for (int k = 0; k < 3; k++) {
    vec3 pl = uPlate[k];
    vec2 pc = turn(pl.z) * (p - centre) + centre + pl.xy;
    vec2 q = (pc - centre) / min(res.x, res.y);   // portrait screens keep the whole design
    float d = plateField(k, q);
    // uneven inking: blotches and faint streaks along the paper feed
    float blotch = fbm(pc / 110.0 + float(k) * 6.1);
    float streak = vnoise(vec2(pc.x / 2.5, pc.y / 260.0) + float(k) * 4.3);
    d *= 1.0 - uGrain * (0.32 * blotch + 0.1 * streak);
    float rough = (vnoise(pc / 1.1 + float(k) * 9.0) - 0.5) * (0.12 + 0.4 * uGrain);
    float a = halftone(pc, uAngle[k], d, rough);
    // speckle: pinholes where the ink did not take; fibres take less ink
    a *= 1.0 - step(0.985 - 0.02 * uGrain, cellHash(pc / 1.4 + float(k) * 31.0)) * 0.8;
    a *= (1.0 - 0.3 * clamp(fib, 0.0, 1.0)) * (1.0 - crack);
    a *= uOpacity[k];
    vec3 ink = uInk[k];
    vec3 printed = col * mix(vec3(1.0), ink, a);          // white paper: inks multiply
    vec3 laid = mix(col, ink * (0.82 + 0.18 * col / max(max(col.r, col.g), max(col.b, 0.2))), a); // black paper: ink sits on top
    col = mix(printed, laid, uDark);
  }

  // --- light on the sheet: folds, a gentle falloff toward the corners
  col *= 1.0 + shade * mix(0.075, 0.11, uDark);
  col += shade * 0.012 * uDark;
  vec2 v = (p - centre) / res.y;
  col *= 1.0 - 0.07 * dot(v, v);
  col += (dither(gl_FragCoord.xy) - 0.5) / 255.0;
  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);

/** Palettes. Plates go in print order; on black paper the order matters (later inks sit on top). */
export const RISO_PALETTES = {
  light: { paper: '#f1ece2', inks: ['#f0c45a', '#de6a52', '#35589a'], opacity: [0.9, 0.88, 0.86] },
  dark: { paper: '#161514', inks: ['#e9d7a4', '#d9765c', '#5f9c97'], opacity: [0.82, 0.8, 0.78] }
};

export const RISO_DEFAULTS = { registration: 0.5, grain: 0.5, creases: 0.45, cell: 4.6, seed: 7, theme: 'auto' };

/* Plate offsets from the seed: each plate gets its own direction and size; the first plate barely moves. */
function hashU(x) {
  x ^= x >>> 16; x = Math.imul(x, 0x3f9c86cb);
  x ^= x >>> 14; x = Math.imul(x, 0x1ae9dacf);
  x ^= x >>> 15;
  return x >>> 0;
}
const unit = (h) => (h >>> 8) / 16777216;
function platesFor(seed, registration) {
  const out = [];
  for (let k = 0; k < 3; k++) {
    const a = unit(hashU(seed * 3 + k + 0xb31c96c9)) * Math.PI * 2;
    const m = (k === 0 ? 0.35 : 0.7 + 0.3 * unit(hashU(seed * 7 + k))) * 7 * registration;
    const t = (unit(hashU(seed * 11 + k)) - 0.5) * 0.008 * registration;
    out.push([Math.cos(a) * m, Math.sin(a) * m, t]);
  }
  return out;
}

export function createRisoPaper(canvas, options = {}) {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'low-power' });
  if (!gl) return null;
  const params = { ...RISO_DEFAULTS, ...options };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const darkQuery = matchMedia('(prefers-color-scheme: dark)');
  let prog, loc = {}, raf = 0, lost = false;
  let plates = platesFor(params.seed, params.registration);
  let anim = null; // { from, start, dur }

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  function init() {
    prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    for (const n of ['uRes', 'uDpr', 'uSeed', 'uGrain', 'uCrease', 'uDark', 'uCell', 'uPaper', 'uInk', 'uOpacity', 'uPlate', 'uAngle'])
      loc[n] = gl.getUniformLocation(prog, n);
    gl.bindVertexArray(gl.createVertexArray());
  }
  init();

  const isDark = () => params.theme === 'dark' || (params.theme === 'auto' && darkQuery.matches);

  function draw(now) {
    raf = 0;
    if (lost) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    let current = plates;
    if (anim) {
      const t = Math.min(1, (now - anim.start) / anim.dur);
      const e = 1 - Math.pow(1 - t, 3);
      current = plates.map((pl, k) => pl.map((v, i) => anim.from[k][i] + (v - anim.from[k][i]) * e));
      if (t >= 1) anim = null; else raf = requestAnimationFrame(draw);
    }
    const pal = RISO_PALETTES[isDark() ? 'dark' : 'light'];
    gl.viewport(0, 0, w, h);
    gl.useProgram(prog);
    gl.uniform2f(loc.uRes, w, h);
    gl.uniform1f(loc.uDpr, dpr);
    gl.uniform1ui(loc.uSeed, params.seed >>> 0);
    gl.uniform1f(loc.uGrain, params.grain);
    gl.uniform1f(loc.uCrease, params.creases);
    gl.uniform1f(loc.uDark, isDark() ? 1 : 0);
    gl.uniform1f(loc.uCell, params.cell);
    gl.uniform3fv(loc.uPaper, hex(pal.paper));
    gl.uniform3fv(loc.uInk, pal.inks.flatMap(hex));
    gl.uniform1fv(loc.uOpacity, pal.opacity);
    gl.uniform3fv(loc.uPlate, current.flat());
    gl.uniform1fv(loc.uAngle, [0.12, 1.18, 0.66]);   // about 7°, 68° and 38°: no moiré between neighbours
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  const request = () => { if (!raf) raf = requestAnimationFrame(draw); };

  const ro = new ResizeObserver(request);
  ro.observe(canvas);
  const onTheme = () => request();
  darkQuery.addEventListener('change', onTheme);
  const onLost = (e) => { e.preventDefault(); lost = true; };
  const onRestored = () => { lost = false; loc = {}; init(); request(); };
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);
  request();

  return {
    params,
    /** Change any of registration, grain, creases (0…1), cell (px), seed, theme ('auto' | 'light' | 'dark'). */
    set(next) {
      Object.assign(params, next);
      if ('registration' in next || 'seed' in next) { anim = null; plates = platesFor(params.seed, params.registration); }
      request();
    },
    /** A new sheet: new seed (or the given one); the plates slide from a wide miss into their new places. */
    reprint(seed = (Math.random() * 1e6) | 0) {
      params.seed = seed;
      const target = platesFor(seed, params.registration);
      if (!reduced.matches) {
        const from = target.map(([x, y, t], k) => [x * 3 + (k - 1) * 6, y * 3 - 5, t * 3]);
        anim = { from, start: performance.now(), dur: 650 };
      }
      plates = target;
      request();
    },
    render: request,
    destroy() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      darkQuery.removeEventListener('change', onTheme);
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
    }
  };
}
