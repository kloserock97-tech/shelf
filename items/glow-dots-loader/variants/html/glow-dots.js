/* Glow Dots Loader: the three dots of a loader are lights, and their light falls on the card around them.
   The card's text and button are occluders: they catch light on the side that faces the dots and throw soft
   shadows away from them. Per frame: the occluders (drawn once from the DOM) and the moving dots are composed into
   a small scene, the SDF core floods its distance field, radiance cascades gather the light, and a final pass
   lights the card at full resolution. Success gathers the light into a check mark; failure turns it red and lets it
   go out. Frames run while the dots move; a finished state stays on screen as one still frame. */
import { compileProgram, createTexture, createTarget, uploadCanvas, fullscreen, createJfa, FULLSCREEN_VS, SDF_GLSL } from './sdf-core.js';
import { createRadiance } from './radiance.js';
import { drawText, drawBox } from './dom-mask.js';

const COMPOSE_FS = `#version 300 es
precision highp float;
uniform sampler2D uStatic;      // a = occluder
uniform vec2 uCheck[3];         // check mark corners, GI px
uniform float uCheckDraw;       // 0…1 of the stroke drawn
uniform float uCheckW;          // half width, GI px
uniform vec4 uCheckColor;       // rgb, intensity
out vec4 o;

float segment(vec2 p, vec2 a, vec2 b) {
  vec2 ab = b - a;
  float h = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
  return length(p - a - ab * h);
}
// distance to the drawn part of the check: corner 0 → 1 → 2
float checkDistance(vec2 p) {
  float l1 = length(uCheck[1] - uCheck[0]);
  float l2 = length(uCheck[2] - uCheck[1]);
  float drawn = uCheckDraw * (l1 + l2);
  if (drawn <= 0.0) return 1e4;
  vec2 e1 = mix(uCheck[0], uCheck[1], clamp(drawn / l1, 0.0, 1.0));
  float d = segment(p, uCheck[0], e1);
  if (drawn > l1) d = min(d, segment(p, uCheck[1], mix(uCheck[1], uCheck[2], clamp((drawn - l1) / l2, 0.0, 1.0))));
  return d;
}

void main() {
  vec2 p = gl_FragCoord.xy;
  float solid = texelFetch(uStatic, ivec2(p), 0).a;
  vec3 e = vec3(0.0);
  float a = solid >= 0.5 ? 1.0 : 0.0;
  if (uCheckColor.a > 0.002 && checkDistance(p) < uCheckW) { e = uCheckColor.rgb * uCheckColor.a; a = 1.0; }
  o = vec4(e, a);
}`;

const SHADE_FS = `#version 300 es
precision highp float;
precision highp int;
${SDF_GLSL}
uniform sampler2D uAlbedo;      // full resolution: rgb = surface colour (sRGB), a = foreground (text, button)
uniform sampler2D uIrr;         // irradiance per probe, linear + mips
uniform vec2 uSize;             // device px
uniform float uGi;              // GI px per device px
uniform ivec2 uGiSize;
uniform vec2 uProbeUv;          // 1 / (spacing · probes)
uniform float uOutRange;
uniform vec3 uFloor;            // linear albedo of the card
uniform float uAmbFloor;
uniform float uAmbFg;
uniform float uExposure;
uniform vec4 uDot[3];           // device px (y up), radius, intensity
uniform vec3 uDotColor[3];
uniform vec2 uCheck[3];         // device px
uniform float uCheckDraw;
uniform float uCheckW;
uniform vec4 uCheckColor;
out vec4 o;

// Screen dither from hash-kit.
float dither(vec2 pixel) { return fract(dot(floor(pixel), vec2(0.3455768, 0.4279792))); }
vec3 toLinear(vec3 c) { return pow(c, vec3(2.2)); }
vec3 irr(vec2 g) { return textureLod(uIrr, g * uProbeUv, 0.0).rgb * uOutRange; }
vec3 irrWide(vec2 g) { return textureLod(uIrr, g * uProbeUv, 3.0).rgb * uOutRange; }

float segment(vec2 p, vec2 a, vec2 b) {
  vec2 ab = b - a;
  float h = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
  return length(p - a - ab * h);
}
float checkDistance(vec2 p) {
  float l1 = length(uCheck[1] - uCheck[0]);
  float l2 = length(uCheck[2] - uCheck[1]);
  float drawn = uCheckDraw * (l1 + l2);
  if (drawn <= 0.0) return 1e4;
  float d = segment(p, uCheck[0], mix(uCheck[0], uCheck[1], clamp(drawn / l1, 0.0, 1.0)));
  if (drawn > l1) d = min(d, segment(p, uCheck[1], mix(uCheck[1], uCheck[2], clamp((drawn - l1) / l2, 0.0, 1.0))));
  return d;
}

void main() {
  vec2 q = gl_FragCoord.xy;
  vec4 A = texture(uAlbedo, q / uSize);
  vec3 albedo = mix(uFloor, toLinear(A.rgb), A.a);
  float amb = mix(uAmbFloor, uAmbFg, A.a);

  // light arriving here; inside an occluder it comes from the nearest open pixel and fades with depth
  vec2 g = q * uGi;
  vec3 E = irr(g);
  vec2 open = seedOf(clamp(ivec2(g), ivec2(0), uGiSize - 1));
  if (open.x >= 0.0) {
    vec2 to = open + 0.5 - g;
    float depth = length(to);
    if (depth > 0.75) {
      vec2 edge = open + 0.5 + to / depth * 0.75;
      E = max(E, irr(edge) * exp(-depth / 2.5) + irrWide(g) * 0.35);
    }
  }
  vec3 c = albedo * (amb + E);

  // crisp cores of the lights on top of their glow
  for (int i = 0; i < 3; i++) {
    float d = length(q - uDot[i].xy);
    float core = clamp(uDot[i].z - d + 0.5, 0.0, 1.0);
    c += uDotColor[i] * uDot[i].w * core * 3.0;
  }
  if (uCheckColor.a > 0.002) {
    float core = clamp(uCheckW - checkDistance(q) + 0.5, 0.0, 1.0);
    c += uCheckColor.rgb * uCheckColor.a * core * 3.0;
  }

  c = 1.0 - exp(-c * uExposure);
  c = pow(c, vec3(1.0 / 2.2));
  c += (dither(q) - 0.5) / 255.0;
  o = vec4(c, 1.0);
}`;

const hexToLinear = (hex) => {
  const v = parseInt(String(hex).trim().replace('#', ''), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((c) => Math.pow(c / 255, 2.2));
};
const mix3 = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };

/**
 * root: the card. Inside: <canvas>, elements with data-gd-text (lit text, colour from --gd-ink), elements with
 * data-gd-box (lit solid faces such as buttons), a .gd__dots box where the dots live, and a role="status" line.
 * Options: giScale (GI px per css px, 1), emit (light strength, 72), fade (extinction per css px, 1/120), shot ('loading' | 'success' | 'error' frame).
 * Returns { setState(state), get state, destroy } or null without WebGL2 (the CSS dots stay).
 */
export function createGlowDots(root, options = {}) {
  const opt = { giScale: 1, emit: 72, fade: 1 / 120, shot: null, ...options };
  const canvas = root.querySelector('canvas');
  const dotsBox = root.querySelector('.gd__dots');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false });
  if (!gl) return null;

  let composeProg, shadeProg, jfaOut, jfaIn, rad, draw;
  let albedoTex, staticTex, sceneTex, sceneFbo, insideSeeds;
  const albedoCanvas = document.createElement('canvas');
  const staticCanvas = document.createElement('canvas');
  let W = 0, H = 0, GW = 0, GH = 0, dpr = 1, giScale = opt.giScale;
  let palette, dotsAt = { x: 0, y: 0 };
  let raf = 0, last = 0, visible = true, lost = false, dirtyLayout = true;
  let state = 'loading', stateTime = 0, clock = 0;
  // the dots as drawn: css px relative to the dots box centre, radius, intensity, colour
  const dots = [0, 1, 2].map(() => ({ x: 0, y: 0, r: 4.5, k: 1, color: [1, 1, 1] }));
  const check = { draw: 0, k: 0, color: [0, 1, 0] };
  let from = null; // dot snapshot when a state starts
  const frameTimes = [];

  function init() {
    composeProg = compileProgram(gl, FULLSCREEN_VS, COMPOSE_FS);
    shadeProg = compileProgram(gl, FULLSCREEN_VS, SHADE_FS);
    jfaOut = createJfa(gl);
    jfaIn = createJfa(gl);
    rad = createRadiance(gl);
    draw = fullscreen(gl);
    albedoTex = createTexture(gl, 1, 1, 'rgba8');
    staticTex = createTexture(gl, 1, 1, 'rgba8');
    sceneTex = null;
    dirtyLayout = true;
  }

  function readPalette() {
    const cs = getComputedStyle(root);
    const v = (n, fb) => cs.getPropertyValue(n).trim() || fb;
    palette = {
      floor: hexToLinear(v('--gd-floor', '#4a4c55')),
      ambFloor: parseFloat(v('--gd-ambient', '0.035')),
      ambFg: parseFloat(v('--gd-ambient-ink', '0.34')),
      exposure: parseFloat(v('--gd-exposure', '1.5')),
      dots: [v('--gd-dot-1', '#7cc8ff'), v('--gd-dot-2', '#b69cff'), v('--gd-dot-3', '#ff9ccf')].map(hexToLinear),
      ok: hexToLinear(v('--gd-ok', '#5be38f')),
      fail: hexToLinear(v('--gd-fail', '#ff5a52'))
    };
  }

  // the card's text and button, drawn twice: as colour at full resolution and as occluders at GI resolution
  function layout() {
    const r = root.getBoundingClientRect();
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = Math.max(1, Math.round(r.width * dpr));
    H = Math.max(1, Math.round(r.height * dpr));
    GW = Math.max(1, Math.round(r.width * giScale));
    GH = Math.max(1, Math.round(r.height * giScale));
    canvas.width = W; canvas.height = H;
    const origin = { x: r.left, y: r.top };
    const texts = [...root.querySelectorAll('[data-gd-text]')];
    const boxes = [...root.querySelectorAll('[data-gd-box]')];

    albedoCanvas.width = W; albedoCanvas.height = H;
    const a = albedoCanvas.getContext('2d');
    a.clearRect(0, 0, W, H);
    for (const b of boxes) drawBox(a, b, origin, dpr, getComputedStyle(b).getPropertyValue('--gd-face').trim() || '#3a3c44');
    for (const t of texts) drawText(a, t, origin, dpr, getComputedStyle(t).getPropertyValue('--gd-ink').trim() || '#f2f2f5');

    staticCanvas.width = GW; staticCanvas.height = GH;
    const s = staticCanvas.getContext('2d');
    s.clearRect(0, 0, GW, GH);
    for (const b of boxes) drawBox(s, b, origin, giScale, '#000');
    for (const t of texts) drawText(s, t, origin, giScale, '#000');

    uploadCanvas(gl, albedoTex, albedoCanvas, gl.LINEAR);
    uploadCanvas(gl, staticTex, staticCanvas);
    if (!sceneTex || sceneTex.w !== GW || sceneTex.h !== GH) {
      if (sceneTex) { gl.deleteTexture(sceneTex.tex); gl.deleteFramebuffer(sceneFbo); }
      sceneTex = { tex: createTexture(gl, GW, GH, 'rgba8'), w: GW, h: GH };
      sceneFbo = createTarget(gl, sceneTex.tex);
    }
    jfaOut.resize(GW, GH);
    jfaIn.resize(GW, GH);
    // open pixels as seeds: inside an occluder this points at the nearest pixel light can reach
    insideSeeds = jfaIn.run(staticTex, { channel: 3, threshold: 0.5, invert: true });
    rad.resize(GW, GH, 1);
    const d = dotsBox.getBoundingClientRect();
    dotsAt = { x: d.left - r.left + d.width / 2, y: d.top - r.top + d.height / 2 };
    dirtyLayout = false;
  }

  // —— animation ——
  const CHECK = [[-12, 1], [-3.5, 9.5], [13, -8]]; // css px from the dots box centre, y down
  function begin(next) {
    from = dots.map((d) => ({ ...d, color: [...d.color] }));
    from.check = { ...check, color: [...check.color] };
    state = next;
    stateTime = 0;
  }

  function animate(dt) {
    clock += dt;
    stateTime += dt;
    const still = reduce.matches;
    const t = stateTime;
    if (state === 'loading') {
      const fade = from ? smooth(t / 0.4) : 1;
      dots.forEach((d, i) => {
        const phase = clock * (Math.PI * 2 / 1.3) - i * 0.95;
        const pulse = 0.5 + 0.5 * Math.sin(phase);
        const target = { x: (i - 1) * 22, y: still ? 0 : -4 * pulse * pulse, r: 4.5, k: still ? 0.75 : 0.22 + 0.78 * pulse * pulse };
        const f = from ? from[i] : { ...target, color: palette.dots[i] };
        d.x = f.x + (target.x - f.x) * fade;
        d.y = f.y + (target.y - f.y) * fade;
        d.r = f.r + (target.r - f.r) * fade;
        d.k = f.k + (target.k - f.k) * fade;
        d.color = mix3(f.color, palette.dots[i], fade);
      });
      check.k = from ? from.check.k * (1 - fade) : 0;
      check.draw = from ? from.check.draw : 0;
      return true;
    }
    if (state === 'success') {
      // the dots fly to the check's corners and turn green, then the stroke draws through them and they melt in
      const fly = still ? 1 : smooth(t / 0.55);
      const drawT = still ? 1 : smooth((t - 0.45) / 0.45);
      const melt = still ? smooth(t / 0.35) : smooth((t - 0.6) / 0.35);
      dots.forEach((d, i) => {
        const f = from[i];
        d.x = still ? f.x : f.x + (CHECK[i][0] - f.x) * fly;
        d.y = still ? f.y : f.y + (CHECK[i][1] - f.y) * fly;
        d.color = mix3(f.color, palette.ok, still ? 1 : fly);
        d.k = (f.k + (1 - f.k) * fly) * (1 - melt);
        d.r = f.r * (1 - melt * 0.6);
      });
      check.color = palette.ok;
      check.draw = still ? 1 : drawT;
      check.k = still ? melt * 0.85 : 0.85 * drawT;
      return t < 1.1;
    }
    if (state === 'error') {
      // red, two flickers, then the light goes out and the dots sink a little
      const red = still ? 1 : smooth(t / 0.25);
      const flicker = still ? 1 : t < 0.5 ? 0.55 + 0.45 * Math.cos(t * 26) : 1;
      const out = smooth((t - (still ? 0.1 : 0.55)) / 0.8);
      dots.forEach((d, i) => {
        const f = from[i];
        d.x = f.x + ((i - 1) * 22 - f.x) * red;
        d.y = still ? f.y : f.y + (6 - f.y) * out;
        d.r = 4.5;
        d.color = mix3(f.color, palette.fail, red);
        d.k = Math.max(f.k, 0.8) * flicker * (1 - out * 0.86); // faint red embers stay
      });
      check.k = from.check.k * (1 - red);
      return t < 1.5;
    }
    return false;
  }

  // —— render ——
  let seeds = null, sceneKey = '', layoutVersion = 0;
  function render() {
    if (lost || !visible) return;
    if (dirtyLayout) { layout(); layoutVersion++; }
    // the GI scene: occluders from the DOM plus the check mark once it is drawn; the dots are disc lights
    gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFbo);
    gl.viewport(0, 0, GW, GH);
    gl.useProgram(composeProg.prog);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, staticTex);
    gl.uniform1i(composeProg.loc.uStatic, 0);
    setCheck(composeProg.loc, giScale, GH);
    draw();
    // the distance field only changes with the layout or the check's shape
    const key = layoutVersion + '|' + (check.k > 0.002 ? check.draw.toFixed(3) : '-');
    if (key !== sceneKey) { seeds = jfaOut.run(sceneTex.tex, { channel: 3, threshold: 0.5 }); sceneKey = key; }
    const discs = dots.filter((d) => d.k > 0.002).map((d) => ({
      x: (dotsAt.x + d.x) * giScale, y: GH - (dotsAt.y + d.y) * giScale, r: d.r * giScale, k: d.k, color: d.color
    }));
    rad.fade = opt.fade / giScale;
    const irr = rad.render(sceneTex.tex, seeds, opt.emit, discs);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.useProgram(shadeProg.prog);
    const L = shadeProg.loc;
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, insideSeeds);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, albedoTex);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, irr);
    gl.uniform1i(L.uSeed, 0);
    gl.uniform1i(L.uAlbedo, 1);
    gl.uniform1i(L.uIrr, 2);
    gl.uniform2f(L.uSize, W, H);
    gl.uniform1f(L.uGi, giScale / dpr);
    gl.uniform2i(L.uGiSize, GW, GH);
    gl.uniform2f(L.uProbeUv, 1 / (rad.spacing * rad.probes[0]), 1 / (rad.spacing * rad.probes[1]));
    gl.uniform1f(L.uOutRange, rad.outRange);
    gl.uniform3fv(L.uFloor, palette.floor);
    gl.uniform1f(L.uAmbFloor, palette.ambFloor);
    gl.uniform1f(L.uAmbFg, palette.ambFg);
    gl.uniform1f(L.uExposure, palette.exposure);
    setCheck(L, dpr, H);
    dots.forEach((d, i) => {
      dotBuf.set([(dotsAt.x + d.x) * dpr, H - (dotsAt.y + d.y) * dpr, d.r * dpr, d.k], i * 4);
      colBuf.set(d.color, i * 3);
    });
    gl.uniform4fv(L.uDot, dotBuf);
    gl.uniform3fv(L.uDotColor, colBuf);
    draw();
  }

  // check mark uniforms at a given resolution (scale = px per css px, h = target height for the y flip)
  const dotBuf = new Float32Array(12), colBuf = new Float32Array(9), chkBuf = new Float32Array(6);
  function setCheck(L, scale, h) {
    CHECK.forEach(([x, y], i) => chkBuf.set([(dotsAt.x + x) * scale, h - (dotsAt.y + y) * scale], i * 2));
    gl.uniform2fv(L.uCheck, chkBuf);
    gl.uniform1f(L.uCheckDraw, check.draw);
    gl.uniform1f(L.uCheckW, 2.2 * scale);
    gl.uniform4f(L.uCheckColor, check.color[0], check.color[1], check.color[2], check.k);
  }

  function frame(now) {
    raf = 0;
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
    if (last) watchCost(now - last);
    last = now;
    const moving = animate(dt);
    render();
    if (moving) kick(); else last = 0;
  }
  function kick() {
    if (opt.shot) { render(); return; } // a poster frame stays still
    if (!raf && visible && !lost) raf = requestAnimationFrame(frame);
  }

  // a small governor: if frames stay slow, light the scene at a coarser GI resolution (twice at most)
  function watchCost(ms) {
    frameTimes.push(ms);
    if (frameTimes.length < 45) return;
    const sorted = [...frameTimes].sort((x, y) => x - y);
    frameTimes.length = 0;
    if (sorted[22] > 26 && giScale > opt.giScale * 0.5 + 1e-3) {
      giScale = Math.max(opt.giScale * 0.5, giScale * 0.72);
      dirtyLayout = true;
    }
  }

  // —— public state ——
  const status = root.querySelector('[role="status"]');
  function setState(next) {
    if (next === state && from) return;
    begin(next);
    root.dataset.state = next;
    root.setAttribute('aria-busy', String(next === 'loading'));
    dirtyLayout = true;      // text on the card may have changed
    last = 0;
    kick();
    if (status) status.textContent = root.dataset[`status${next[0].toUpperCase()}${next.slice(1)}`] || '';
  }

  // —— lifecycle ——
  const ro = new ResizeObserver(() => { dirtyLayout = true; if (!raf) render(); });
  const mo = new MutationObserver(() => { dirtyLayout = true; if (!raf) render(); });
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting && !document.hidden; if (visible) { last = 0; kick(); } });
  const onVis = () => { visible = !document.hidden; if (visible) { last = 0; kick(); } };
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; cancelAnimationFrame(raf); raf = 0; root.classList.remove('is-lit'); });
  canvas.addEventListener('webglcontextrestored', () => { lost = false; init(); root.classList.add('is-lit'); kick(); });

  try {
    init();
    readPalette();
    root.classList.add('is-lit');
    layout();
  } catch (err) {
    root.classList.remove('is-lit');
    console.warn('glow-dots: staying with CSS dots', err);
    return null;
  }
  ro.observe(root);
  mo.observe(root, { subtree: true, characterData: true, childList: true });
  io.observe(root);
  document.addEventListener('visibilitychange', onVis);
  const scheme = matchMedia('(prefers-color-scheme: dark)');
  const onScheme = () => { readPalette(); dirtyLayout = true; if (!raf) render(); };
  scheme.addEventListener('change', onScheme);

  root.dataset.state = 'loading';
  root.setAttribute('aria-busy', 'true');
  if (opt.shot) {
    // a still frame: the loader mid-pulse, or a finished state
    clock = 0.55;
    animate(0);
    if (opt.shot !== 'loading') { setState(opt.shot); cancelAnimationFrame(raf); raf = 0; animate(3); }
    render();
  } else {
    kick();
  }

  return {
    setState,
    get state() { return state; },
    destroy() {
      cancelAnimationFrame(raf);
      ro.disconnect(); mo.disconnect(); io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      scheme.removeEventListener('change', onScheme);
      jfaOut.dispose(); jfaIn.dispose(); rad.dispose();
      root.classList.remove('is-lit');
    }
  };
}
