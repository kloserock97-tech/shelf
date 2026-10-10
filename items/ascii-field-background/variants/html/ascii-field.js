/* ASCII Field — a living background drawn in characters. A procedural scene (rolling waves over value noise and a
   slow band of light passing across) is sampled once per character cell; the brightness, dithered per cell, picks a
   glyph from a density ladder. The ladder is measured at runtime: candidate characters are drawn with the system
   monospace font into a glyph atlas (Canvas 2D), their ink coverage is counted, and evenly spaced steps are kept.
   One instanced WebGL2 draw renders every cell; the pointer pushes characters aside. Glyphs are drawn on a
   transparent canvas, so the page colour shows through.

     import { createAsciiField } from './ascii-field.js';
     const field = createAsciiField(canvas, { fontSize: 13, quiet: document.querySelector('.hero') });

   `quiet` — an element whose box the field dims around, so content on top stays readable. Returns null without
   WebGL2. The loop pauses off-screen and on a hidden tab; with prefers-reduced-motion a single still frame is drawn. */

const VERT = `#version 300 es
precision highp float;
uniform vec2 uCell;        // cell size, CSS px
uniform vec2 uView;        // canvas size, CSS px
uniform float uDpr;
uniform int uCols;
uniform float uLevels;     // glyphs in the ladder
uniform float uTime;
uniform vec3 uPointer;     // x, y in CSS px, push strength 0…1
uniform float uPushRadius; // CSS px
uniform vec4 uQuiet;       // box to keep calm: left, top, right, bottom in CSS px (0 size — none)
out vec2 vUv;
out float vLight;

// ---- hash from Hash Kit ----
const uint HASH_SALT = 0xb31c96c9u;
uint hashU(uint x) {
  x ^= x >> 16; x *= 0x3f9c86cbu;
  x ^= x >> 14; x *= 0x1ae9dacfu;
  x ^= x >> 15;
  return x;
}
uint hashU(uvec2 v) { return hashU(v.x + hashU(v.y + HASH_SALT)); }
float hashUnit(uint h) { return float(h >> 8) * (1.0 / 16777216.0); }
float hash2(vec2 p) { return hashUnit(hashU(uvec2(ivec2(floor(p))))); }
float dither(vec2 pixel) { return fract(dot(floor(pixel), vec2(0.3455768, 0.4279792))); }

// ---- our value noise: cubic fade between lattice values ----
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash2(i), b = hash2(i + vec2(1.0, 0.0)), c = hash2(i + vec2(0.0, 1.0)), d = hash2(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float layered(vec2 p) {
  return vnoise(p) * 0.6 + vnoise(p * 2.03 + vec2(17.0, 5.0)) * 0.28 + vnoise(p * 4.1 + vec2(3.0, 41.0)) * 0.12;
}

// the scene: brightness 0…1 at a point (CSS px); also returns how much of it is the passing light
float scene(vec2 p, out float light) {
  float m = min(uView.x, uView.y);
  vec2 q = p / m;                                  // ~0…1.8 across the long side
  float t = uTime;
  float n = layered(q * 2.4 + vec2(t * 0.035, -t * 0.02));
  // soft rolling waves: rows of crests bent by the noise, drifting slowly
  float crest = sin(q.y * 7.0 - q.x * 2.6 + n * 6.5 - t * 0.45) * 0.5 + 0.5;
  float waves = smoothstep(0.1, 1.0, crest) * (0.3 + 0.7 * n);
  // a wide band of light crossing on the diagonal every ~26 s
  vec2 dir = normalize(vec2(0.86, 0.5));
  float span = dot(uView / m, abs(dir)) + 1.0;
  float along = dot(q, dir) - (mod(t * 0.07, span) - 0.5);
  light = exp(-along * along / 0.045) * (0.55 + 0.45 * n);
  return clamp(0.04 + n * 0.2 + waves * 0.6 + light * 0.5 * (0.35 + waves), 0.0, 1.0);
}

float roundBoxDist(vec2 p, vec4 box, float r) {
  vec2 c = (box.xy + box.zw) * 0.5, hs = (box.zw - box.xy) * 0.5;
  vec2 d = abs(p - c) - hs + r;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r;
}

void main() {
  int id = gl_InstanceID;
  vec2 cell = vec2(float(id % uCols), float(id / uCols));
  vec2 corner = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1));
  vec2 center = (cell + 0.5) * uCell;

  float light;
  float b = scene(center, light);
  if (uQuiet.z > uQuiet.x) {
    float d = roundBoxDist(center, uQuiet, 18.0);
    b *= smoothstep(-6.0, 70.0, d);
  }
  // dithered pick of the step: neighbouring cells round differently, so gradients do not band
  float level = clamp(floor(b * (uLevels - 1.0) + dither(cell)), 0.0, uLevels - 1.0);

  // the pointer pushes characters away from it; the offset snaps to whole device pixels to keep glyphs crisp
  vec2 away = center - uPointer.xy;
  float dist = length(away);
  float push = uPointer.z * exp(-dist * dist / (uPushRadius * uPushRadius));
  vec2 offset = away / max(dist, 1.0) * push * uPushRadius * 0.42;
  offset = floor(offset * uDpr + 0.5) / uDpr;

  vec2 pos = cell * uCell + corner * uCell + offset;
  vUv = vec2((level + corner.x) / uLevels, corner.y);
  vLight = light;
  gl_Position = vec4(pos / uView * 2.0 - 1.0, 0.0, 1.0) * vec4(1.0, -1.0, 1.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
uniform sampler2D uAtlas;
uniform vec3 uInk;
uniform vec3 uGlow;
uniform float uOpacity;
in vec2 vUv;
in float vLight;
out vec4 outColor;
void main() {
  float a = texture(uAtlas, vUv).a * uOpacity;
  vec3 col = mix(uInk, uGlow, smoothstep(0.15, 0.8, vLight));
  outColor = vec4(col * a, a);
}`;

const MONO = 'ui-monospace, "SF Mono", "Cascadia Mono", Menlo, Consolas, "Liberation Mono", "DejaVu Sans Mono", monospace';
// candidates for the ladder; the ladder itself is measured from the font in use
const CANDIDATES = " .,:;-~=+*!?ilcvxzjrtfsnuoeawkhdbpq7#%&$0@WMB8QN";

export const ASCII_DEFAULTS = {
  fontSize: 13, lineHeight: 1.3, levels: 16, speed: 1, pushRadius: 90,
  themes: {
    light: { ink: [0.17, 0.155, 0.14], glow: [0.78, 0.36, 0.2], opacity: 0.62 },
    dark: { ink: [0.8, 0.78, 0.72], glow: [1.0, 0.68, 0.42], opacity: 0.6 }
  }
};

/** Draws candidate glyphs into tiles, measures each tile's ink, keeps `levels` evenly spaced steps (space first). */
export function buildLadder(fontPx, cellW, cellH, levels) {
  const c = document.createElement('canvas');
  c.width = cellW * CANDIDATES.length; c.height = cellH;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.font = `${fontPx}px ${MONO}`;
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
  [...CANDIDATES].forEach((ch, i) => g.fillText(ch, i * cellW + cellW / 2, cellH / 2 + fontPx * 0.04));
  const px = g.getImageData(0, 0, c.width, c.height).data;
  const ink = [...CANDIDATES].map((ch, i) => {
    let sum = 0;
    for (let y = 0; y < cellH; y++) for (let x = i * cellW; x < (i + 1) * cellW; x++) sum += px[(y * c.width + x) * 4 + 3];
    return { ch, ink: sum / (255 * cellW * cellH) };
  });
  ink.sort((a, b) => a.ink - b.ink);
  const max = ink[ink.length - 1].ink, chosen = [];
  for (let s = 0; s < levels; s++) {
    const want = (s / (levels - 1)) * max;
    let best = null;
    for (const e of ink) if (!chosen.includes(e) && (!best || Math.abs(e.ink - want) < Math.abs(best.ink - want))) best = e;
    chosen.push(best);
  }
  chosen.sort((a, b) => a.ink - b.ink);
  return chosen.map((e) => e.ch).join('');
}

export function createAsciiField(canvas, options = {}) {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: true, premultipliedAlpha: true });
  if (!gl) return null;
  const opt = { ...ASCII_DEFAULTS, ...options, themes: { ...ASCII_DEFAULTS.themes, ...options.themes } };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const darkQuery = matchMedia('(prefers-color-scheme: dark)');
  let prog, atlas, loc = {}, lost = false;
  let dpr = 1, cssW = 1, cssH = 1, cellW = 8, cellH = 16, cols = 1, rows = 1, ladder = '';
  let time = opt.time ?? 0, raf = 0, last = 0, visible = true, lastPointer = -1e9;
  const pointer = { x: -1e4, y: -1e4, push: 0, target: 0 };

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
    for (const n of ['uCell', 'uView', 'uDpr', 'uCols', 'uLevels', 'uTime', 'uPointer', 'uPushRadius', 'uQuiet', 'uAtlas', 'uInk', 'uGlow', 'uOpacity'])
      loc[n] = gl.getUniformLocation(prog, n);
    gl.bindVertexArray(gl.createVertexArray());
    atlas = gl.createTexture();
    buildAtlas();
  }

  /* glyph tiles at device resolution, one row, white on transparent */
  function buildAtlas() {
    const fontPx = Math.round(opt.fontSize * dpr);
    const m = document.createElement('canvas').getContext('2d');
    m.font = `${fontPx}px ${MONO}`;
    const tileW = Math.max(4, Math.round(m.measureText('M').width));
    const tileH = Math.max(6, Math.round(fontPx * opt.lineHeight));
    ladder = opt.ladder || buildLadder(fontPx, tileW, tileH, opt.levels);
    const c = document.createElement('canvas');
    c.width = tileW * ladder.length; c.height = tileH;
    const g = c.getContext('2d');
    g.font = `${fontPx}px ${MONO}`;
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
    [...ladder].forEach((ch, i) => g.fillText(ch, i * tileW + tileW / 2, tileH / 2 + fontPx * 0.04));
    gl.bindTexture(gl.TEXTURE_2D, atlas);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    cellW = tileW / dpr; cellH = tileH / dpr;
  }

  let quiet = [0, 0, 0, 0];
  function measureQuiet() {
    if (!opt.quiet) { quiet = [0, 0, 0, 0]; return; }
    const r = canvas.getBoundingClientRect(), q = opt.quiet.getBoundingClientRect();
    quiet = [q.left - r.left, q.top - r.top, q.right - r.left, q.bottom - r.top];
  }

  function resize() {
    const nextDpr = Math.min(window.devicePixelRatio || 1, 2);
    cssW = Math.max(1, canvas.clientWidth); cssH = Math.max(1, canvas.clientHeight);
    canvas.width = Math.round(cssW * nextDpr); canvas.height = Math.round(cssH * nextDpr);
    if (nextDpr !== dpr || !ladder) { dpr = nextDpr; buildAtlas(); }
    cols = Math.ceil(cssW / cellW) + 1; rows = Math.ceil(cssH / cellH) + 1;
    measureQuiet();
  }

  function render() {
    if (lost) return;
    const th = opt.themes[darkQuery.matches ? 'dark' : 'light'];
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(prog);
    gl.uniform2f(loc.uCell, cellW, cellH);
    gl.uniform2f(loc.uView, cssW, cssH);
    gl.uniform1f(loc.uDpr, dpr);
    gl.uniform1i(loc.uCols, cols);
    gl.uniform1f(loc.uLevels, ladder.length);
    gl.uniform1f(loc.uTime, time);
    gl.uniform3f(loc.uPointer, pointer.x, pointer.y, pointer.push);
    gl.uniform1f(loc.uPushRadius, opt.pushRadius);
    gl.uniform4fv(loc.uQuiet, quiet);
    gl.uniform3fv(loc.uInk, th.ink);
    gl.uniform3fv(loc.uGlow, th.glow);
    gl.uniform1f(loc.uOpacity, th.opacity);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, atlas);
    gl.uniform1i(loc.uAtlas, 0);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, cols * rows);
  }

  /* loop: 30 fps while only the scene drifts, every frame while the pointer is pushing */
  const still = () => reduced.matches || opt.frozen;
  function frame(now) {
    raf = 0;
    const dt = Math.min((now - last) / 1000, 0.1);
    const busy = now - lastPointer < 1200 || Math.abs(pointer.push - pointer.target) > 0.002;
    if (!busy && dt < 1 / 32) { raf = requestAnimationFrame(frame); return; }
    last = now;
    time += dt * opt.speed;
    pointer.push += (pointer.target - pointer.push) * (1 - Math.exp(-dt / 0.12));
    if (now - lastPointer > 900) pointer.target = 0;   // the gap closes when the pointer rests
    render();
    raf = requestAnimationFrame(frame);
  }
  function start() {
    if (raf || !visible || lost || still()) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; }

  const target = opt.pointerTarget || window;
  function onPointer(e) {
    if (still()) return;
    const r = canvas.getBoundingClientRect();
    pointer.x = e.clientX - r.left; pointer.y = e.clientY - r.top;
    pointer.target = 1;
    lastPointer = performance.now();
  }
  function onLeave() { pointer.target = 0; }
  target.addEventListener('pointermove', onPointer, { passive: true });
  target.addEventListener('pointerdown', onPointer, { passive: true });
  document.documentElement.addEventListener('pointerleave', onLeave);

  const ro = new ResizeObserver(() => { resize(); render(); });
  ro.observe(canvas);
  if (opt.quiet) ro.observe(opt.quiet);
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting && !document.hidden; visible ? start() : stop(); });
  io.observe(canvas);
  const onVisibility = () => { visible = !document.hidden; visible ? start() : stop(); };
  document.addEventListener('visibilitychange', onVisibility);
  const onTheme = () => render();
  darkQuery.addEventListener('change', onTheme);
  const onReduced = () => { if (still()) { stop(); pointer.push = 0; render(); } else start(); };
  reduced.addEventListener('change', onReduced);
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; stop(); });
  canvas.addEventListener('webglcontextrestored', () => { lost = false; ladder = ''; init(); resize(); render(); start(); });

  init();
  resize();
  render();
  start();

  return {
    get ladder() { return ladder; },
    /** for still frames: set the scene time (s) and an optional push at x, y (CSS px) */
    pose(t, push) {
      time = t;
      if (push) { pointer.x = push.x; pointer.y = push.y; pointer.push = pointer.target = push.strength ?? 1; }
      render();
    },
    set(next) {
      Object.assign(opt, next);
      if ('fontSize' in next || 'lineHeight' in next || 'levels' in next || 'ladder' in next) { ladder = ''; buildAtlas(); resize(); }
      measureQuiet(); render(); start();
    },
    refresh() { measureQuiet(); render(); },
    destroy() {
      stop(); ro.disconnect(); io.disconnect();
      target.removeEventListener('pointermove', onPointer);
      target.removeEventListener('pointerdown', onPointer);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      document.removeEventListener('visibilitychange', onVisibility);
      darkQuery.removeEventListener('change', onTheme);
      reduced.removeEventListener('change', onReduced);
    }
  };
}
