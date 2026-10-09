/* Relief Icons: line icons pressed out of a plate. Each icon's strokes are drawn as a thin centre line into a
   Canvas 2D mask (red = icon id), the SDF core floods it into a nearest-seed field, and the distance to the line
   becomes a rounded ridge. The ridge profile is baked once per layout (and softened by a small blur, which hides
   the staircase of a pixel centre line); every frame a single pass lights it: normals from the baked heights,
   a lamp at the pointer (or the phone's tilt), a soft shadow marched over the height field and contact shading
   where the ridge meets the plate. Hover lifts an icon, press pushes it in: the per-icon lift is a uniform array,
   so nothing is rebuilt for it. Frames run only while the lamp or a lift is still moving. */
import { compileProgram, createTexture, createTarget, uploadCanvas, fullscreen, createJfa, FULLSCREEN_VS, SDF_GLSL } from './sdf-core.js';

const MAX_ICONS = 32; // ids 1…31, stored × 7 in the red channel

// baked once per layout: r = ridge profile 0…1, g = icon id × 7 / 255, b = closeness to a ridge's foot (contact shading)
const PROFILE_FS = `#version 300 es
precision highp float;
precision highp int;
${SDF_GLSL}
uniform sampler2D uMask;
uniform float uR;
out vec4 o;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec2 s = seedOf(p);
  if (s.x < 0.0) { o = vec4(0.0); return; }
  float t = length(s - vec2(p)) / uR;
  float u = max(1.0 - t * t, 0.0);
  float ridge = u * sqrt(u);                                   // rounded top, soft fillet into the plate
  float foot = clamp(1.0 - abs(t - 1.05) / 1.25, 0.0, 1.0);    // a band just outside the ridge
  o = vec4(ridge, texelFetch(uMask, ivec2(s), 0).r, foot * foot * (1.0 - ridge), 1.0);
}`;

// binomial 1-4-6-4-1 blur of the profile and contact channels, one axis per pass; the id channel is kept as is
const BLUR_FS = `#version 300 es
precision highp float;
uniform sampler2D uSrc;
uniform ivec2 uAxis;
out vec4 o;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  ivec2 n = textureSize(uSrc, 0) - 1;
  vec4 c = texelFetch(uSrc, p, 0);
  vec2 acc = c.rb * 6.0;
  acc += texelFetch(uSrc, clamp(p - uAxis, ivec2(0), n), 0).rb * 4.0;
  acc += texelFetch(uSrc, clamp(p + uAxis, ivec2(0), n), 0).rb * 4.0;
  acc += texelFetch(uSrc, clamp(p - 2 * uAxis, ivec2(0), n), 0).rb;
  acc += texelFetch(uSrc, clamp(p + 2 * uAxis, ivec2(0), n), 0).rb;
  acc /= 16.0;
  o = vec4(acc.x, c.g, acc.y, 1.0);
}`;

const SHADE_FS = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uProfile;     // linear filtering
uniform vec2 uSize;             // canvas, device px
uniform float uH;               // ridge height at lift 1, device px
uniform float uR;
uniform float uLift[${MAX_ICONS}];
uniform float uTint[${MAX_ICONS}];
uniform vec3 uLamp;             // device px, y up; z = height over the plate
uniform vec3 uPlate;            // linear albedo
uniform vec3 uRidge;
uniform vec3 uAccent;
uniform vec3 uLampColor;
uniform float uAmbient;
uniform float uSpec;
uniform float uSpread;          // how far the lamp's pool reaches, in lamp heights
out vec4 o;

// Screen dither from hash-kit: a lattice whose strong harmonics sit at high frequencies.
float dither(vec2 pixel) { return fract(dot(floor(pixel), vec2(0.3455768, 0.4279792))); }

vec4 prof(vec2 q) { return texture(uProfile, q / uSize); }
int idOf(vec4 v) { return min(int(v.g * (255.0 / 7.0) + 0.5), ${MAX_ICONS - 1}); }
float heightAt(vec2 q) { vec4 v = prof(q); return uH * uLift[idOf(v)] * v.r; }

void main() {
  vec2 q = gl_FragCoord.xy;
  vec4 v = prof(q);
  int id = idOf(v);
  float lift = uLift[id];
  float h = uH * lift * v.r;

  // normal from central differences of the baked heights
  float hx = heightAt(q + vec2(1.0, 0.0)) - heightAt(q - vec2(1.0, 0.0));
  float hy = heightAt(q + vec2(0.0, 1.0)) - heightAt(q - vec2(0.0, 1.0));
  vec3 n = normalize(vec3(-hx * 0.5, -hy * 0.5, 1.0));

  vec3 P = vec3(q, h);
  vec3 toL = uLamp - P;
  vec3 l = normalize(toL);

  // soft shadow: march towards the lamp over the height field, only as far as the tallest ridge can reach
  float shadow = 1.0;
  float flatD = length(toL.xy);
  if (flatD > 1.0) {
    vec2 dir = toL.xy / flatD;
    float rise = toL.z / flatD;                     // height gained per pixel towards the lamp
    float reach = min(flatD, max(uH * 1.9 - h, 0.0) / max(rise, 1e-3));
    reach = min(reach, 24.0 * uR);
    float j = dither(q);
    const int STEPS = 18;
    for (int i = 0; i < STEPS; i++) {
      float tt = reach * (float(i) + j) / float(STEPS) + 0.75;
      float hs = heightAt(q + dir * tt);
      float rayZ = h + rise * tt;
      // the penumbra widens with the distance to the occluder: a lamp of finite size
      shadow = min(shadow, clamp(0.5 + (rayZ - hs) / (0.16 * tt + 0.5), 0.0, 1.0));
    }
    shadow = shadow * shadow * (3.0 - 2.0 * shadow);
  }

  float ao = 1.0 - 0.45 * v.b * clamp(lift, 0.0, 2.0);
  float ridge = smoothstep(0.0, 0.3, v.r);
  float diff = max(dot(n, l), 0.0);
  vec3 hv = normalize(l + vec3(0.0, 0.0, 1.0));
  float spec = pow(max(dot(n, hv), 0.0), 40.0) * uSpec * ridge;
  // a lamp, not the sun: a wide pool of light under it
  float fall = 1.0 / (1.0 + dot(toL.xy, toL.xy) / (uLamp.z * uLamp.z * uSpread));

  vec3 albedo = mix(uPlate, mix(uRidge, uAccent, uTint[id]), ridge);
  vec3 lit = albedo * (uAmbient * ao + uLampColor * diff * shadow * fall) + uLampColor * spec * shadow * fall;
  vec3 c = pow(max(lit, 0.0), vec3(1.0 / 2.2));
  c += (dither(q + 17.0) - 0.5) / 255.0;
  o = vec4(c, 1.0);
}`;

const toLinear = (hex) => {
  const v = parseInt(hex.replace('#', ''), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((c) => Math.pow(c / 255, 2.2));
};

/** The icon's SVG children (path, circle, rect, line, polyline) as one Path2D, scaled and moved into place. */
function svgToPath(svg, scale, ox, oy) {
  const p = new Path2D();
  const m = new DOMMatrix().translate(ox, oy).scale(scale);
  for (const el of svg.querySelectorAll('path, circle, rect, line, polyline')) {
    const shape = new Path2D();
    const n = (a) => parseFloat(el.getAttribute(a) || '0');
    switch (el.tagName.toLowerCase()) {
      case 'path': shape.addPath(new Path2D(el.getAttribute('d'))); break;
      case 'circle': shape.arc(n('cx'), n('cy'), n('r'), 0, Math.PI * 2); break;
      case 'rect': shape.roundRect(n('x'), n('y'), n('width'), n('height'), n('rx')); break;
      case 'line': shape.moveTo(n('x1'), n('y1')); shape.lineTo(n('x2'), n('y2')); break;
      case 'polyline': {
        const pts = el.getAttribute('points').trim().split(/[\s,]+/).map(Number);
        for (let i = 0; i < pts.length; i += 2) i ? shape.lineTo(pts[i], pts[i + 1]) : shape.moveTo(pts[i], pts[i + 1]);
        break;
      }
    }
    p.addPath(shape, m);
  }
  return p;
}

/**
 * root: an element with a <canvas> and buttons marked data-relief-icon, each with an inline 16×16 <svg> (the flat
 * look without WebGL). Options: ridge — ridge width in icon units (1.7), lampHeight — css px (150),
 * rest — where the lamp waits, 0…1 of the root ({ x: 0.3, y: 0.15 }), shot — a fixed lamp { x, y } in css px.
 */
export function createReliefIcons(root, options = {}) {
  const canvas = root.querySelector('canvas');
  const buttons = [...root.querySelectorAll('[data-relief-icon]')].slice(0, MAX_ICONS - 1);
  const opt = { ridge: 1.7, lampHeight: 120, rest: { x: 0.3, y: 0.15 }, shot: null, ...options };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false });
  if (!gl) return null;

  let profileProg, blurProg, shadeProg, jfa, maskTex, draw;
  let profTex = [], profFbo = [];
  const mask = document.createElement('canvas');
  const mctx = mask.getContext('2d');
  let W = 0, H = 0, dpr = 1, unit = 4;
  let palette = null;
  const state = buttons.map(() => ({ lift: 1, liftTo: 1, tint: 0, tintTo: 0, hover: false, focus: false, press: 0 }));
  const lamp = { x: 0, y: 0, z: opt.lampHeight, tx: 0, ty: 0, tz: opt.lampHeight, follow: false };
  let raf = 0, last = 0, visible = true, dirtyLayout = true, lost = false;
  const lifts = new Float32Array(MAX_ICONS);
  const tints = new Float32Array(MAX_ICONS);

  function init() {
    profileProg = compileProgram(gl, FULLSCREEN_VS, PROFILE_FS);
    blurProg = compileProgram(gl, FULLSCREEN_VS, BLUR_FS);
    shadeProg = compileProgram(gl, FULLSCREEN_VS, SHADE_FS);
    jfa = createJfa(gl);
    maskTex = createTexture(gl, 1, 1, 'rgba8');
    draw = fullscreen(gl);
    profTex = []; profFbo = [];
    dirtyLayout = true;
  }

  function readPalette() {
    const cs = getComputedStyle(root);
    const v = (name, fb) => cs.getPropertyValue(name).trim() || fb;
    palette = {
      plate: toLinear(v('--ri-plate', '#e8e4dd')),
      ridge: toLinear(v('--ri-ridge', '#f1ede6')),
      accent: toLinear(v('--ri-accent', '#df7a3f')),
      lamp: toLinear(v('--ri-lamp', '#fff2e0')),
      ambient: parseFloat(v('--ri-ambient', '0.6')),
      spec: parseFloat(v('--ri-spec', '0.3')),
      spread: parseFloat(v('--ri-spread', '10')),
      power: parseFloat(v('--ri-power', '0.62'))
    };
  }

  function layout() {
    const r = root.getBoundingClientRect();
    dpr = Math.min(devicePixelRatio || 1, 2);
    const nw = Math.max(1, Math.round(r.width * dpr));
    const nh = Math.max(1, Math.round(r.height * dpr));
    if (nw !== W || nh !== H || !profTex.length) {
      W = nw; H = nh;
      canvas.width = W; canvas.height = H;
      profTex.forEach((t) => gl.deleteTexture(t));
      profFbo.forEach((f) => gl.deleteFramebuffer(f));
      profTex = [createTexture(gl, W, H, 'rgba8', gl.LINEAR), createTexture(gl, W, H, 'rgba8', gl.LINEAR)];
      profFbo = profTex.map((t) => createTarget(gl, t));
    }
    mask.width = W; mask.height = H;
    mctx.clearRect(0, 0, W, H);
    mctx.lineCap = 'round';
    mctx.lineJoin = 'round';
    buttons.forEach((btn, i) => {
      const svg = btn.querySelector('svg');
      const b = svg.getBoundingClientRect();
      unit = (b.width / 16) * dpr;
      // a thin centre line: the ridge's width comes from the distance field, not from the stroke
      mctx.strokeStyle = `rgb(${(i + 1) * 7}, 0, 0)`;
      mctx.lineWidth = 1.35;
      mctx.stroke(svgToPath(svg, unit, (b.left - r.left) * dpr, (b.top - r.top) * dpr));
    });
    uploadCanvas(gl, maskTex, mask);
    jfa.resize(W, H);
    const seedTex = jfa.run(maskTex, { channel: 3, threshold: 0.45 });

    gl.viewport(0, 0, W, H);
    gl.bindFramebuffer(gl.FRAMEBUFFER, profFbo[0]);
    gl.useProgram(profileProg.prog);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, seedTex);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, maskTex);
    gl.uniform1i(profileProg.loc.uSeed, 0);
    gl.uniform1i(profileProg.loc.uMask, 1);
    gl.uniform1f(profileProg.loc.uR, ridgeRadius());
    draw();
    gl.useProgram(blurProg.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(blurProg.loc.uSrc, 0);
    [[1, 0, 0, 1], [0, 1, 1, 0]].forEach(([ax, ay, from, to]) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, profFbo[to]);
      gl.bindTexture(gl.TEXTURE_2D, profTex[from]);
      gl.uniform2i(blurProg.loc.uAxis, ax, ay);
      draw();
    });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!lamp.follow) placeLampAtRest(true);
    dirtyLayout = false;
  }

  const ridgeRadius = () => (opt.ridge * unit) / 2;

  function placeLampAtRest(jump) {
    const r = root.getBoundingClientRect();
    lamp.tx = opt.rest.x * r.width;
    lamp.ty = opt.rest.y * r.height;
    lamp.tz = opt.lampHeight;
    if (jump) { lamp.x = lamp.tx; lamp.y = lamp.ty; lamp.z = lamp.tz; }
  }

  function render() {
    if (lost || !visible) return;
    if (dirtyLayout) layout();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.useProgram(shadeProg.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, profTex[0]);
    gl.uniform1i(shadeProg.loc.uProfile, 0);
    gl.uniform2f(shadeProg.loc.uSize, W, H);
    gl.uniform1f(shadeProg.loc.uR, ridgeRadius());
    gl.uniform1f(shadeProg.loc.uH, opt.ridge * unit * 0.62);
    state.forEach((s, i) => { lifts[i + 1] = s.lift; tints[i + 1] = s.tint; });
    gl.uniform1fv(shadeProg.loc.uLift, lifts);
    gl.uniform1fv(shadeProg.loc.uTint, tints);
    gl.uniform3f(shadeProg.loc.uLamp, lamp.x * dpr, H - lamp.y * dpr, lamp.z * dpr);
    gl.uniform3fv(shadeProg.loc.uPlate, palette.plate);
    gl.uniform3fv(shadeProg.loc.uRidge, palette.ridge);
    gl.uniform3fv(shadeProg.loc.uAccent, palette.accent);
    gl.uniform3fv(shadeProg.loc.uLampColor, palette.lamp.map((c) => c * palette.power));
    gl.uniform1f(shadeProg.loc.uAmbient, palette.ambient);
    gl.uniform1f(shadeProg.loc.uSpec, palette.spec);
    gl.uniform1f(shadeProg.loc.uSpread, palette.spread);
    draw();
  }

  // lift and tint targets from the interaction state
  function retarget() {
    state.forEach((s, i) => {
      const on = buttons[i].getAttribute('aria-pressed') === 'true';
      s.liftTo = s.press > 0 ? 0.3 : s.hover || s.focus ? 1.75 : on ? 1.3 : 1;
      s.tintTo = on ? 1 : 0;
    });
    kick();
  }

  function step(now) {
    raf = 0;
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
    last = now;
    const ease = (tau) => (reduce.matches ? 1 : 1 - Math.exp(-dt / tau));
    let moving = false;
    const k = ease(0.085);
    for (const key of ['x', 'y', 'z']) {
      const t = lamp['t' + key];
      lamp[key] += (t - lamp[key]) * k;
      if (Math.abs(t - lamp[key]) > 0.05) moving = true; else lamp[key] = t;
    }
    for (const s of state) {
      s.lift += (s.liftTo - s.lift) * ease(s.press > 0 ? 0.035 : 0.11);
      s.tint += (s.tintTo - s.tint) * ease(0.15);
      if (Math.abs(s.liftTo - s.lift) > 0.002 || Math.abs(s.tintTo - s.tint) > 0.002) moving = true;
      else { s.lift = s.liftTo; s.tint = s.tintTo; }
    }
    render();
    if (moving) kick(); else last = 0;
  }

  function kick() {
    if (!raf && visible && !lost) raf = requestAnimationFrame(step);
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
  window.addEventListener('pointermove', onMove, { passive: true });
  document.documentElement.addEventListener('pointerleave', onLeave);

  // phone tilt swings the lamp over the plate (iOS asks for permission first: call enableTilt() from a tap)
  const onTilt = (e) => {
    if (opt.shot || e.beta == null) return;
    const r = root.getBoundingClientRect();
    const gx = Math.max(-1, Math.min(1, (e.gamma || 0) / 35));
    const gy = Math.max(-1, Math.min(1, (e.beta - 40) / 35));
    lamp.follow = true;
    lamp.tx = r.width * (0.5 + gx * 0.75);
    lamp.ty = r.height * (0.5 + gy * 0.75);
    kick();
  };
  function enableTilt() {
    const D = window.DeviceOrientationEvent;
    if (!D) return Promise.resolve(false);
    const ask = typeof D.requestPermission === 'function' ? D.requestPermission() : Promise.resolve('granted');
    return ask.then((res) => {
      if (res !== 'granted') return false;
      window.addEventListener('deviceorientation', onTilt);
      return true;
    }).catch(() => false);
  }

  const cleanups = [];
  buttons.forEach((btn, i) => {
    const s = state[i];
    const on = (type, fn) => { btn.addEventListener(type, fn); cleanups.push(() => btn.removeEventListener(type, fn)); };
    on('pointerenter', (e) => { if (e.pointerType === 'mouse') { s.hover = true; retarget(); } });
    on('pointerleave', () => { s.hover = false; retarget(); });
    on('focus', () => { s.focus = btn.matches(':focus-visible'); retarget(); });
    on('blur', () => { s.focus = false; retarget(); });
    const press = () => {
      s.press = 1; retarget();
      setTimeout(() => { s.press = 0; retarget(); }, 170);
    };
    on('pointerdown', press);
    on('keydown', (e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) press(); });
    const mo = new MutationObserver(retarget);
    mo.observe(btn, { attributes: true, attributeFilter: ['aria-pressed'] });
    cleanups.push(() => mo.disconnect());
  });

  // —— lifecycle ——
  const ro = new ResizeObserver(() => { dirtyLayout = true; render(); });
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting && !document.hidden; if (visible) render(); });
  const onVis = () => { visible = !document.hidden; if (visible) render(); };
  const scheme = matchMedia('(prefers-color-scheme: dark)');
  const onScheme = () => { readPalette(); render(); };
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; root.classList.remove('is-relief'); });
  canvas.addEventListener('webglcontextrestored', () => { lost = false; init(); root.classList.add('is-relief'); render(); });

  try {
    init();
    readPalette();
    layout();
  } catch (err) {
    console.warn('relief-icons: staying flat', err);
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
  retarget();
  state.forEach((s) => { s.lift = s.liftTo; s.tint = s.tintTo; });
  root.classList.add('is-relief');
  render();

  return {
    enableTilt,
    render,
    /** holds an icon at a lift (1 = rest, 1.75 = hover, 0.3 = pressed in), e.g. for a poster */
    lift(i, v) { if (state[i]) { state[i].liftTo = state[i].lift = v; render(); } },
    destroy() {
      cancelAnimationFrame(raf);
      ro.disconnect(); io.disconnect();
      cleanups.forEach((f) => f());
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('deviceorientation', onTilt);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      document.removeEventListener('visibilitychange', onVis);
      scheme.removeEventListener('change', onScheme);
      jfa.dispose();
      root.classList.remove('is-relief');
    }
  };
}
