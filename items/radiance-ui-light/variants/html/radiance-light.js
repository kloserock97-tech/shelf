/* Radiance UI Light: 2D global illumination over a live page layout. Cards and display text are occluders,
   accent elements (a button, a status dot) are coloured lights, the pointer carries a lamp. Light goes around the
   cards, leaves soft shadows behind them and behind every letter of a headline, and mixes colours where lights
   overlap. Once per layout the DOM is drawn into two canvases (colour at full resolution, occluders and emitters
   at GI resolution) and the SDF core floods the distance fields; every frame only the radiance cascades and the
   final lighting pass run, and only while the lamp is still moving. */
import { compileProgram, createTexture, uploadCanvas, fullscreen, createJfa, FULLSCREEN_VS, SDF_GLSL } from './sdf-core.js';
import { createRadiance } from './radiance.js';
import { drawText, drawBox } from './dom-mask.js';

const SHADE_FS = `#version 300 es
precision highp float;
precision highp int;
${SDF_GLSL}
uniform sampler2D uAlbedo;      // full resolution: rgb = surface colour (sRGB), a = foreground (card, text)
uniform sampler2D uIrr;         // irradiance per probe, linear + mips
uniform vec2 uSize;
uniform float uGi;              // GI px per device px
uniform ivec2 uGiSize;
uniform vec2 uProbeUv;
uniform float uOutRange;
uniform vec3 uFloor;
uniform float uAmbFloor;
uniform float uAmbFg;
uniform float uRim;             // how deep light goes into an occluder from its edge, GI px
uniform float uExposure;
uniform vec4 uLamp;             // device px (y up), radius, intensity
uniform vec3 uLampColor;
out vec4 o;

// Screen dither from hash-kit.
float dither(vec2 pixel) { return fract(dot(floor(pixel), vec2(0.3455768, 0.4279792))); }
vec3 toLinear(vec3 c) { return pow(c, vec3(2.2)); }
vec3 irr(vec2 g, float lod) { return textureLod(uIrr, g * uProbeUv, lod).rgb * uOutRange; }

void main() {
  vec2 q = gl_FragCoord.xy;
  vec4 A = texture(uAlbedo, q / uSize);
  vec3 albedo = mix(uFloor, toLinear(A.rgb), A.a);
  float amb = mix(uAmbFloor, uAmbFg, A.a);

  vec2 g = q * uGi;
  vec3 E = irr(g, 0.0);
  vec2 open = seedOf(clamp(ivec2(g), ivec2(0), uGiSize - 1));
  if (open.x >= 0.0) {
    vec2 to = open + 0.5 - g;
    float depth = length(to);
    if (depth > 0.75) {
      // inside a card or a letter: light from the nearest open pixel, fading inwards, plus the wide glow around
      vec2 edge = open + 0.5 + to / depth * 0.75;
      E = max(E, irr(edge, 0.0) * exp(-depth / uRim) + irr(g, 4.0) * 0.45);
    }
  }
  vec3 c = albedo * (amb + E);
  float core = clamp(uLamp.z - length(q - uLamp.xy) + 0.5, 0.0, 1.0);
  c += uLampColor * uLamp.w * core * 4.0;
  c = 1.0 - exp(-c * uExposure);
  c = pow(c, vec3(1.0 / 2.2));
  c += (dither(q) - 0.5) / 255.0;
  o = vec4(c, 1.0);
}`;

const hexToLinear = (hex) => {
  const v = parseInt(String(hex).trim().replace('#', ''), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((c) => Math.pow(c / 255, 2.2));
};

// quality steps: GI px per css px, bilinear fix on/off. The governor walks down when frames run long.
const TIERS = [
  { gi: 0.5, fix: true },
  { gi: 0.36, fix: true },
  { gi: 0.26, fix: false }
];

/**
 * root: the page area. Inside: a <canvas>, elements with data-rl-box (cards: lit faces that block light),
 * data-rl-text (text drawn lit; "cast" also blocks light, colour from --rl-ink), data-rl-emit (coloured lights,
 * colour --rl-glow, strength --rl-power; they keep their own DOM look).
 * Options: emit (60), fade (extinction per css px, 1/320), lamp (lamp strength, 2.6), tier (start step, 0), lampColor (hex), rest ({x, y} 0…1),
 * shot ({x, y} css px: a fixed lamp, one still frame), onTier(tier, ms) for a readout.
 */
export function createRadianceLight(root, options = {}) {
  const opt = { emit: 60, fade: 1 / 320, lamp: 2.6, tier: 0, lampColor: '#ffd7a8', rest: { x: 0.3, y: 0.22 }, shot: null, onTier: null, ...options };
  const canvas = root.querySelector('canvas');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false });
  if (!gl) return null;

  let shadeProg, jfaOut, jfaIn, rad, draw;
  let albedoTex, sceneTex, outSeeds, inSeeds;
  const albedoCanvas = document.createElement('canvas');
  const sceneCanvas = document.createElement('canvas');
  let W = 0, H = 0, GW = 0, GH = 0, dpr = 1, tier = Math.min(opt.tier, TIERS.length - 1);
  let palette;
  let lampColor = hexToLinear(opt.lampColor), lampOn = 1;
  const lamp = { x: 0, y: 0, tx: 0, ty: 0, follow: false };
  let raf = 0, last = 0, visible = true, lost = false, dirtyLayout = true;
  const frameTimes = [];

  function init() {
    shadeProg = compileProgram(gl, FULLSCREEN_VS, SHADE_FS);
    jfaOut = createJfa(gl);
    jfaIn = createJfa(gl);
    rad = createRadiance(gl);
    draw = fullscreen(gl);
    albedoTex = createTexture(gl, 1, 1, 'rgba8');
    sceneTex = createTexture(gl, 1, 1, 'rgba8');
    dirtyLayout = true;
  }

  function readPalette() {
    const cs = getComputedStyle(root);
    const v = (n, fb) => cs.getPropertyValue(n).trim() || fb;
    palette = {
      floor: hexToLinear(v('--rl-floor', '#3b3d45')),
      ambFloor: parseFloat(v('--rl-ambient', '0.05')),
      ambFg: parseFloat(v('--rl-ambient-ink', '0.4')),
      exposure: parseFloat(v('--rl-exposure', '1.4')),
      rim: parseFloat(v('--rl-rim', '5'))
    };
  }

  function layout() {
    const r = root.getBoundingClientRect();
    const gi = TIERS[tier].gi;
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = Math.max(1, Math.round(r.width * dpr));
    H = Math.max(1, Math.round(r.height * dpr));
    GW = Math.max(1, Math.round(r.width * gi));
    GH = Math.max(1, Math.round(r.height * gi));
    canvas.width = W; canvas.height = H;
    const origin = { x: r.left, y: r.top };
    const boxes = [...root.querySelectorAll('[data-rl-box]')];
    const texts = [...root.querySelectorAll('[data-rl-text]')];
    const emitters = [...root.querySelectorAll('[data-rl-emit]')];
    const css = (el, name, fb) => getComputedStyle(el).getPropertyValue(name).trim() || fb;

    // colour: card faces, then all lit text
    albedoCanvas.width = W; albedoCanvas.height = H;
    const a = albedoCanvas.getContext('2d');
    a.clearRect(0, 0, W, H);
    for (const b of boxes) drawBox(a, b, origin, dpr, css(b, '--rl-face', '#2c2e35'));
    for (const t of texts) drawText(a, t, origin, dpr, css(t, '--rl-ink', '#f2f2f5'));

    // GI scene: occluders black, emitters in their colour × power
    sceneCanvas.width = GW; sceneCanvas.height = GH;
    const s = sceneCanvas.getContext('2d');
    s.clearRect(0, 0, GW, GH);
    for (const b of boxes) drawBox(s, b, origin, gi, '#000');
    for (const t of texts) if (t.dataset.rlText === 'cast') drawText(s, t, origin, gi, '#000');
    for (const e of emitters) {
      const k = Math.max(0, Math.min(1, parseFloat(css(e, '--rl-power', '0.5'))));
      // the cascades read these bytes as linear light, so the colour goes in already linearised
      const c = hexToLinear(css(e, '--rl-glow', '#ff9b4a')).map((x) => Math.round(x * k * 255));
      drawBox(s, e, origin, gi, `rgb(${c[0]}, ${c[1]}, ${c[2]})`);
    }
    uploadCanvas(gl, albedoTex, albedoCanvas, gl.LINEAR);
    uploadCanvas(gl, sceneTex, sceneCanvas);
    jfaOut.resize(GW, GH);
    jfaIn.resize(GW, GH);
    outSeeds = jfaOut.run(sceneTex, { channel: 3, threshold: 0.5 });
    inSeeds = jfaIn.run(sceneTex, { channel: 3, threshold: 0.5, invert: true });
    rad.fix = TIERS[tier].fix;
    rad.resize(GW, GH, 1);
    if (!lamp.follow) placeLampAtRest(true);
    dirtyLayout = false;
  }

  function placeLampAtRest(jump) {
    const r = root.getBoundingClientRect();
    lamp.tx = opt.rest.x * r.width;
    lamp.ty = opt.rest.y * r.height;
    if (jump) { lamp.x = lamp.tx; lamp.y = lamp.ty; }
  }

  function render() {
    if (lost || !visible) return;
    if (dirtyLayout) layout();
    const gi = TIERS[tier].gi;
    const k = opt.lamp * lampOn;
    const discs = k > 0.002 ? [{ x: lamp.x * gi, y: GH - lamp.y * gi, r: Math.max(1.5, 7 * gi), k, color: lampColor }] : [];
    rad.fade = opt.fade / gi;
    const irr = rad.render(sceneTex, outSeeds, opt.emit, discs);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.useProgram(shadeProg.prog);
    const L = shadeProg.loc;
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, inSeeds);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, albedoTex);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, irr);
    gl.uniform1i(L.uSeed, 0);
    gl.uniform1i(L.uAlbedo, 1);
    gl.uniform1i(L.uIrr, 2);
    gl.uniform2f(L.uSize, W, H);
    gl.uniform1f(L.uGi, gi / dpr);
    gl.uniform2i(L.uGiSize, GW, GH);
    gl.uniform2f(L.uProbeUv, 1 / (rad.spacing * rad.probes[0]), 1 / (rad.spacing * rad.probes[1]));
    gl.uniform1f(L.uOutRange, rad.outRange);
    gl.uniform3fv(L.uFloor, palette.floor);
    gl.uniform1f(L.uAmbFloor, palette.ambFloor);
    gl.uniform1f(L.uAmbFg, palette.ambFg);
    gl.uniform1f(L.uRim, palette.rim * gi * 2);
    gl.uniform1f(L.uExposure, palette.exposure);
    gl.uniform4f(L.uLamp, lamp.x * dpr, H - lamp.y * dpr, 4 * dpr, Math.min(k, 1));
    gl.uniform3fv(L.uLampColor, lampColor);
    draw();
  }

  function frame(now) {
    raf = 0;
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
    if (last) govern(now - last);
    last = now;
    const e = reduce.matches ? 1 : 1 - Math.exp(-dt / 0.07);
    lamp.x += (lamp.tx - lamp.x) * e;
    lamp.y += (lamp.ty - lamp.y) * e;
    const moving = Math.abs(lamp.tx - lamp.x) > 0.1 || Math.abs(lamp.ty - lamp.y) > 0.1;
    if (!moving) { lamp.x = lamp.tx; lamp.y = lamp.ty; }
    render();
    if (moving) kick(); else last = 0;
  }
  function kick() {
    if (opt.shot) { render(); return; }
    if (!raf && visible && !lost) raf = requestAnimationFrame(frame);
  }

  // governor: median of 40 frame intervals while the lamp moves; over 22 ms → one step down (twice at most)
  function govern(ms) {
    frameTimes.push(ms);
    if (frameTimes.length < 40) return;
    const sorted = [...frameTimes].sort((x, y) => x - y);
    const median = sorted[20];
    frameTimes.length = 0;
    opt.onTier?.(tier, median);
    if (median > 22 && tier < TIERS.length - 1) {
      tier++;
      dirtyLayout = true;
      opt.onTier?.(tier, median);
    }
  }

  // —— input ——
  const onMove = (e) => {
    if (opt.shot) return;
    const r = root.getBoundingClientRect();
    lamp.follow = true;
    lamp.tx = e.clientX - r.left;
    lamp.ty = e.clientY - r.top;
    kick();
  };
  const onLeave = () => { if (opt.shot) return; lamp.follow = false; placeLampAtRest(false); kick(); };
  root.addEventListener('pointermove', onMove, { passive: true });
  root.addEventListener('pointerdown', onMove, { passive: true });
  root.addEventListener('pointerleave', onLeave);

  // —— lifecycle ——
  const ro = new ResizeObserver(() => { dirtyLayout = true; render(); });
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting && !document.hidden; if (visible) render(); });
  const onVis = () => { visible = !document.hidden; if (visible) render(); };
  const scheme = matchMedia('(prefers-color-scheme: dark)');
  const onScheme = () => { readPalette(); dirtyLayout = true; render(); };
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; cancelAnimationFrame(raf); raf = 0; root.classList.remove('is-lit'); });
  canvas.addEventListener('webglcontextrestored', () => { lost = false; init(); root.classList.add('is-lit'); render(); });

  try {
    init();
    readPalette();
    root.classList.add('is-lit');
    layout();
  } catch (err) {
    root.classList.remove('is-lit');
    console.warn('radiance-light: staying with the plain page', err);
    return null;
  }
  ro.observe(root);
  io.observe(root);
  document.addEventListener('visibilitychange', onVis);
  scheme.addEventListener('change', onScheme);
  if (opt.shot) {
    lamp.follow = true;
    lamp.x = lamp.tx = opt.shot.x;
    lamp.y = lamp.ty = opt.shot.y;
  }
  render();
  opt.onTier?.(tier, 0);

  return {
    /** lamp colour as hex, or null to switch the lamp off */
    setLamp(hex) {
      if (hex) { lampColor = hexToLinear(hex); lampOn = 1; } else lampOn = 0;
      render();
    },
    /** re-read the layout after the page changed in a way ResizeObserver does not see */
    refresh() { dirtyLayout = true; render(); },
    get tier() { return tier; },
    destroy() {
      cancelAnimationFrame(raf);
      ro.disconnect(); io.disconnect();
      root.removeEventListener('pointermove', onMove);
      root.removeEventListener('pointerdown', onMove);
      root.removeEventListener('pointerleave', onLeave);
      document.removeEventListener('visibilitychange', onVis);
      scheme.removeEventListener('change', onScheme);
      jfaOut.dispose(); jfaIn.dispose(); rad.dispose();
      root.classList.remove('is-lit');
    }
  };
}
