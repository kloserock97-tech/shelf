/* Gem Icons: icons as small gems. Each 2D shape (gem-shapes.js) is baked once into a float atlas tile; the shader
   extrudes the tile's distance field into a body with a girdle, sloped crown facets and a flat table, and ray-marches
   it. At the hit the ray splits: a Fresnel reflection of a procedural studio, and a refracted ray that crosses the
   body, picks up colour by absorption (Beer–Lambert) and leaves with a separate index of refraction per colour
   channel — that spread is the dispersion. Where the exit is a total internal reflection the ray takes one more trip
   inside. Under each gem lie a soft shadow and a coloured caustic.
   One instanced draw paints the whole grid; while a few gems move, only their tiles are cleared and redrawn.
   Frames run only while a pose eases or a flash fades. */
import { bakeAtlas, silhouette, GEM_COLORS } from './gem-shapes.js';

const MAX = 24;

const VS = `#version 300 es
uniform vec2 uSize;          // canvas, device px
uniform vec4 uRect[${MAX}];  // centre x, y (device px, y up), half side of the button, gem tile half / button half
uniform int uBase;
out vec2 vP;                 // tile units: ±1 is the gem's tile
flat out int vI;
void main() {
  int i = gl_InstanceID + uBase;
  vec2 c = vec2((gl_VertexID & 1) == 0 ? -1.0 : 1.0, (gl_VertexID >> 1) == 0 ? -1.0 : 1.0);
  vec4 r = uRect[i];
  vP = c / r.w;
  vI = i;
  gl_Position = vec4((r.xy + c * r.z) / uSize * 2.0 - 1.0, 0.0, 1.0);
}`;

const FS = `#version 300 es
precision highp float;
in vec2 vP;
flat in int vI;
uniform sampler2D uAtlas;      // R16F distances, linear filtering
uniform vec2 uAtlasSize;
uniform float uTile;
uniform vec4 uTileAt[${MAX}];  // atlas origin x, y (px), pixel size in tile units, flash phase 0…1
uniform vec4 uPose[${MAX}];    // yaw, pitch, flash 0…1, colour 0 (clear glass) … 1 (gem)
uniform vec3 uColor[${MAX}];   // gem colour, linear
uniform vec3 uWall;
uniform vec3 uFloor;
uniform float uExposure;
uniform float uShadow;
uniform float uCaustic;
uniform float uMotion;         // 0 with prefers-reduced-motion: the flash only brightens, nothing sweeps
out vec4 o;

const float H0 = 0.085;        // half height of the girdle
const float SLOPE = 0.9;       // crown facets
const float CROWN = 0.16;      // crown width; further in is the flat table
const float LIP = 0.74;        // 1 / sqrt(1 + SLOPE²): the field grows faster than distance on the crown
const float IOR = 1.62;
const float SPREAD = 0.045;    // dispersion: IOR − / + this for red / blue

vec2 gTile;

// Screen dither from hash-kit: a lattice whose strong harmonics sit at high frequencies.
float dither(vec2 pixel) { return fract(dot(floor(pixel), vec2(0.3455768, 0.4279792))); }

float sdf2(vec2 p) {
  vec2 c = clamp(p, -1.0, 1.0);
  vec2 uv = (gTile + (c * 0.5 + 0.5) * (uTile - 1.0) + 0.5) / uAtlasSize;
  return texture(uAtlas, uv).r + length(p - c);
}

float gem(vec3 p) {
  float d2 = sdf2(p.xy);
  float hz = H0 + SLOPE * clamp(-d2, 0.0, CROWN);
  return max(d2, abs(p.z) - hz);
}

vec3 nrm(vec3 p) {
  const vec2 e = vec2(0.011, 0.0);   // about one atlas texel: smooths the bilinear steps of the field
  return normalize(vec3(gem(p + e.xyy) - gem(p - e.xyy), gem(p + e.yxy) - gem(p - e.yxy), gem(p + e.yyx) - gem(p - e.yyx)));
}

// a soft rectangular light seen in direction d: axis is its centre, half its angular size
float panel(vec3 d, vec3 axis, vec3 up, vec2 hs, float soft) {
  float k = dot(d, axis);
  if (k <= 0.0) return 0.0;
  vec3 rt = normalize(cross(up, axis));
  vec3 u2 = cross(axis, rt);
  vec2 q = vec2(dot(d, rt), dot(d, u2)) / k;
  vec2 e = abs(q) - hs;
  return 1.0 - smoothstep(-soft, soft, max(e.x, e.y));
}

float gFlash, gPhase;

// procedural studio: a floor, a wall, two strips, a key softbox above, a window behind; the flash adds a sweeping strip
vec3 env(vec3 d) {
  vec3 c = mix(uFloor, uWall, smoothstep(-0.3, 0.3, d.y));
  c += uWall * 0.5 * exp(-abs(d.y + 0.02) * 14.0);
  c += vec3(1.0, 0.95, 0.88) * 5.5 * panel(d, normalize(vec3(-0.3, 0.82, 0.48)), vec3(0.0, 0.0, -1.0), vec2(0.6, 0.32), 0.1);
  c += vec3(0.9, 0.95, 1.0) * 3.6 * panel(d, normalize(vec3(0.86, 0.12, 0.5)), vec3(0.0, 1.0, 0.0), vec2(0.07, 0.75), 0.05);
  c += vec3(0.85, 0.92, 1.0) * 2.8 * panel(d, normalize(vec3(-0.82, 0.18, -0.55)), vec3(0.0, 1.0, 0.0), vec2(0.09, 0.7), 0.06);
  c += vec3(1.0, 0.98, 0.95) * 2.2 * panel(d, normalize(vec3(0.28, 0.32, -0.9)), vec3(0.0, 1.0, 0.0), vec2(0.36, 0.42), 0.12);
  if (gFlash > 0.001) {
    float a = mix(-1.3, 1.3, gPhase) * uMotion;
    vec3 sweep = normalize(vec3(sin(a), 0.15, -cos(a)));
    vec3 front = normalize(vec3(-sin(a), 0.25, cos(a)));
    c += vec3(1.0) * 9.0 * gFlash * (panel(d, sweep, vec3(0.0, 1.0, 0.0), vec2(0.14, 1.2), 0.08)
                                    + panel(d, front, vec3(0.0, 1.0, 0.0), vec2(0.1, 1.2), 0.06));
    c *= 1.0 + 0.6 * gFlash;
  }
  return c;
}

// march inside the body from P along dir; returns the exit point and the path length
vec3 crossBody(vec3 P, vec3 dir, out float len) {
  float s = 0.012;
  for (int k = 0; k < 40; k++) {
    float d = -gem(P + dir * s);
    if (d < 0.0012) break;
    s += max(d * LIP, 0.004);
  }
  len = s;
  return P + dir * s;
}

vec3 shadeGem(vec3 P, vec3 rd, mat3 R, vec3 absorb) {
  vec3 n = nrm(P);
  float ci = clamp(-dot(rd, n), 0.0, 1.0);
  float f = 0.055 + 0.945 * pow(1.0 - ci, 5.0);
  vec3 refl = env(R * reflect(rd, n));

  vec3 ri = refract(rd, n, 1.0 / IOR);
  float len1;
  vec3 X = crossBody(P - n * 0.004, ri, len1);
  vec3 nx = nrm(X);

  vec3 eR = refract(ri, -nx, IOR - SPREAD);
  vec3 eG = refract(ri, -nx, IOR);
  vec3 eB = refract(ri, -nx, IOR + SPREAD);
  vec3 t1 = exp(-absorb * len1);
  vec3 col;
  if (dot(eB, eB) > 1e-4) {
    col = vec3(env(R * eR).r, env(R * eG).g, env(R * eB).b) * t1;
  } else {
    // total internal reflection for at least blue: one more trip inside the body
    vec3 rb = reflect(ri, nx);
    float len2;
    vec3 Y = crossBody(X - nx * 0.004, rb, len2);
    vec3 ny = nrm(Y);
    vec3 t2 = exp(-absorb * (len1 + len2));
    vec3 fR = refract(rb, -ny, IOR - SPREAD), fG = refract(rb, -ny, IOR), fB = refract(rb, -ny, IOR + SPREAD);
    // still trapped: let the light leave along the bounce, dimmer
    if (dot(fR, fR) < 1e-4) fR = rb;
    if (dot(fG, fG) < 1e-4) fG = rb;
    if (dot(fB, fB) < 1e-4) fB = rb;
    vec3 inner = vec3(env(R * fR).r, env(R * fG).g, env(R * fB).b) * t2;
    col.r = dot(eR, eR) > 1e-4 ? env(R * eR).r * t1.r : inner.r;
    col.g = dot(eG, eG) > 1e-4 ? env(R * eG).g * t1.g : inner.g;
    col.b = inner.b;
  }
  return mix(col, refl, f);
}

vec3 toScreen(vec3 c) {
  c = 1.0 - exp(-max(c, 0.0) * uExposure);
  return pow(c, vec3(1.0 / 2.2));
}

void main() {
  int i = vI;
  vec4 tile = uTileAt[i];
  vec4 pose = uPose[i];
  gTile = tile.xy;
  gFlash = pose.z;
  gPhase = tile.w;
  float pix = tile.z;

  float cy = cos(pose.x), sy = sin(pose.x), cp = cos(pose.y), sp = sin(pose.y);
  mat3 rotY = mat3(cy, 0.0, -sy, 0.0, 1.0, 0.0, sy, 0.0, cy);
  mat3 rotX = mat3(1.0, 0.0, 0.0, 0.0, cp, sp, 0.0, -sp, cp);
  mat3 R = rotY * rotX;          // body → world
  mat3 Ri = transpose(R);

  const float CAM = 6.0;
  vec3 ro = Ri * vec3(0.0, 0.0, CAM);
  vec3 rd = Ri * normalize(vec3(vP, -CAM));

  // clip the ray to the body's box
  vec3 bmax = vec3(0.96, 0.96, 0.26);
  vec3 inv = 1.0 / rd;
  vec3 ta = (-bmax - ro) * inv, tb = (bmax - ro) * inv;
  vec3 tlo = min(ta, tb), thi = max(ta, tb);
  float tn = max(max(tlo.x, tlo.y), tlo.z), tf = min(min(thi.x, thi.y), thi.z);

  vec3 gemCol = mix(vec3(1.0), uColor[i], pose.w);
  // absorption per unit of path: clear glass barely tints, a gem takes its colour over a typical path of 0.4
  vec3 absorb = mix(vec3(0.05, 0.035, 0.02), -log(max(uColor[i], vec3(0.015))) * 2.4, pose.w);

  float cov = 0.0;
  vec3 c = vec3(0.0);
  if (tn < tf && tf > 0.0) {
    float t = max(tn, 0.0), best = 1e9, tBest = t;
    bool hit = false;
    for (int k = 0; k < 72; k++) {
      float d = gem(ro + rd * t);
      if (d < best) { best = d; tBest = t; }
      if (d < 0.0007) { hit = true; break; }
      t += d * LIP;
      if (t > tf) break;
    }
    // a ray that passes within a pixel of the body still covers part of it: soft edges without supersampling
    cov = hit ? 1.0 : 1.0 - smoothstep(0.0, pix * 1.1, best / LIP);
    if (cov > 0.0) c = toScreen(shadeGem(ro + rd * (hit ? t : tBest), rd, R, absorb));
  }

  // the floor under the gem: a soft shadow down and right, and a caustic where the body focuses light
  vec2 g = vP - vec2(0.05, -0.12) - vec2(pose.x, pose.y) * vec2(0.08, -0.08);
  float ds = sdf2(g);
  float sq = clamp(0.4 - ds / 0.16, 0.0, 1.0);
  float sh = sq * sq * uShadow;                  // dense under the body, gone 0.06 outside its offset outline
  vec3 band = vec3(sdf2(g * 1.03), ds, sdf2(g * 0.97));
  vec3 bq = (band + 0.07) / 0.035;
  vec3 ring = exp(-bq * bq);
  float core = 1.0 - smoothstep(-0.2, -0.02, ds);
  vec3 caus = (ring * 0.9 + core * 0.25) * gemCol * (uCaustic * (0.35 + 0.65 * pose.w) + 2.2 * gFlash);
  caus = toScreen(caus);
  float ca = clamp(max(caus.r, max(caus.g, caus.b)), 0.0, 1.0);
  vec4 floor_ = vec4(caus * ca, max(sh, ca * 0.85));

  vec4 body = vec4(c + (dither(gl_FragCoord.xy) - 0.5) / 255.0, 1.0);
  o = body * cov + floor_ * (1.0 - cov);
}`;

const toLinear = (hex, fb = '#ffffff') => {
  let h = (hex || fb).trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((ch) => ch + ch).join('');
  if (!/^[0-9a-f]{6}$/i.test(h)) h = fb.replace('#', '');
  const v = parseInt(h, 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((c) => Math.pow(c / 255, 2.2));
};

function compile(gl, vs, fs) {
  const make = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, make(gl.VERTEX_SHADER, vs));
  gl.attachShader(prog, make(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  const loc = {};
  const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
  for (let k = 0; k < n; k++) {
    const name = gl.getActiveUniform(prog, k).name.replace(/\[0\]$/, '');
    loc[name] = gl.getUniformLocation(prog, name);
  }
  return { prog, loc };
}

/**
 * root: an element with a <canvas> and buttons marked data-gem="<shape>" (home, mail, star, heart, lock, bell, bolt,
 * drop, chat, moon, pin, sparkle). A button's --gem sets its colour (hex). aria-pressed="true" turns clear glass into
 * a coloured gem. Options: tile — atlas tile side (128), scale — gem tile / button (0.86), shot — { i: [yaw, pitch] }
 * fixed poses and { flash: [i, phase] } for a still frame.
 */
export function createGemIcons(root, options = {}) {
  const opt = { tile: 128, scale: 0.86, shot: null, ...options };
  const canvas = root.querySelector('canvas');
  const buttons = [...root.querySelectorAll('[data-gem]')].slice(0, MAX);
  const names = buttons.map((b) => b.dataset.gem);

  // the flat look first: silhouettes as CSS masks, also what stays without WebGL2
  const masks = new Map();
  buttons.forEach((b, i) => {
    if (!masks.has(names[i])) masks.set(names[i], silhouette(names[i]));
    b.style.setProperty('--gem-mask', `url("${masks.get(names[i])}")`);
    if (!b.style.getPropertyValue('--gem')) b.style.setProperty('--gem', GEM_COLORS[names[i]] || '#dff1ff');
  });

  const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, preserveDrawingBuffer: true });
  if (!gl) return null;

  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const scheme = matchMedia('(prefers-color-scheme: dark)');
  let prog, atlasTex, atlas, palette;
  let W = 0, H = 0, dpr = 1;
  let raf = 0, last = 0, visible = true, lost = false, full = true;
  const rect = new Float32Array(MAX * 4);
  const tileAt = new Float32Array(MAX * 4);
  const pose = new Float32Array(MAX * 4);
  const color = new Float32Array(MAX * 3);
  // rest poses: a slight turn, so the crown facets catch the key light
  const state = buttons.map((b, i) => {
    const rest = [0.16 * ((i % 3) - 1) + 0.08, -0.24];
    return { rest, yaw: rest[0], pitch: rest[1], ty: rest[0], tp: rest[1], tint: 0, tintTo: 0, flashAt: -1, dirty: true };
  });

  function init() {
    prog = compile(gl, VS, FS);
    atlas = atlas || bakeAtlas(names, opt.tile);
    atlasTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, atlasTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, atlas.W, atlas.H, 0, gl.RED, gl.FLOAT, atlas.data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindVertexArray(gl.createVertexArray());
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    full = true;
  }

  function readPalette() {
    const cs = getComputedStyle(root);
    const v = (name, fb) => cs.getPropertyValue(name).trim() || fb;
    palette = {
      wall: toLinear(v('--gem-wall', '#9a9ca3')),
      floor: toLinear(v('--gem-floor', '#303238')),
      exposure: parseFloat(v('--gem-exposure', '1.25')),
      shadow: parseFloat(v('--gem-shadow', '0.28')),
      caustic: parseFloat(v('--gem-caustic', '0.9'))
    };
    buttons.forEach((b, i) => color.set(toLinear(getComputedStyle(b).getPropertyValue('--gem'), '#dff1ff'), i * 3));
  }

  function layout() {
    const r = root.getBoundingClientRect();
    dpr = Math.min(devicePixelRatio || 1, 1.75);
    W = Math.max(1, Math.round(r.width * dpr));
    H = Math.max(1, Math.round(r.height * dpr));
    canvas.width = W;
    canvas.height = H;
    buttons.forEach((b, i) => {
      const br = b.getBoundingClientRect();
      const half = (Math.min(br.width, br.height) / 2) * dpr;
      rect.set([(br.left - r.left + br.width / 2) * dpr, H - (br.top - r.top + br.height / 2) * dpr, half, opt.scale], i * 4);
      const [ox, oy] = atlas.tiles[i];
      tileAt.set([ox, oy, 1 / (half * opt.scale), 0], i * 4);
    });
    full = true;
  }

  function uniforms() {
    const L = prog.loc;
    gl.uniform2f(L.uSize, W, H);
    gl.uniform4fv(L.uRect, rect);
    gl.uniform4fv(L.uTileAt, tileAt);
    gl.uniform4fv(L.uPose, pose);
    gl.uniform3fv(L.uColor, color);
    gl.uniform2f(L.uAtlasSize, atlas.W, atlas.H);
    gl.uniform1f(L.uTile, atlas.T);
    gl.uniform3fv(L.uWall, palette.wall);
    gl.uniform3fv(L.uFloor, palette.floor);
    gl.uniform1f(L.uExposure, palette.exposure);
    gl.uniform1f(L.uShadow, palette.shadow);
    gl.uniform1f(L.uCaustic, palette.caustic);
    gl.uniform1f(L.uMotion, reduce.matches ? 0 : 1);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, atlasTex);
    gl.uniform1i(L.uAtlas, 0);
  }

  function render(now = performance.now()) {
    if (lost || !visible) return;
    state.forEach((s, i) => {
      const t = s.flashAt < 0 ? 1 : (now - s.flashAt) / 1100;
      const flash = t < 1 ? (1 - t) * (1 - t) : 0;
      pose.set([s.yaw, s.pitch, flash, s.tint], i * 4);
      tileAt[i * 4 + 3] = Math.min(t, 1);
    });
    if (opt.shot?.flash) {
      const [i, phase] = opt.shot.flash;
      pose[i * 4 + 2] = (1 - phase) * (1 - phase);
      tileAt[i * 4 + 3] = phase;
    }
    gl.viewport(0, 0, W, H);
    gl.useProgram(prog.prog);
    uniforms();
    if (full) {
      gl.disable(gl.SCISSOR_TEST);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1i(prog.loc.uBase, 0);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, buttons.length);
      full = false;
    } else {
      // only the gems that moved: clear their tiles and draw them one by one
      gl.enable(gl.SCISSOR_TEST);
      state.forEach((s, i) => {
        if (!s.dirty) return;
        const [cx, cy, hs] = rect.subarray(i * 4, i * 4 + 3);
        gl.scissor(Math.floor(cx - hs), Math.floor(cy - hs), Math.ceil(hs * 2) + 1, Math.ceil(hs * 2) + 1);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform1i(prog.loc.uBase, i);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, 1);
      });
      gl.disable(gl.SCISSOR_TEST);
    }
    state.forEach((s) => (s.dirty = false));
  }

  function step(now) {
    raf = 0;
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
    last = now;
    let moving = false;
    const ease = (tau) => (reduce.matches ? 1 : 1 - Math.exp(-dt / tau));
    state.forEach((s) => {
      const k = ease(0.12);
      const before = s.yaw + s.pitch + s.tint;
      s.yaw += (s.ty - s.yaw) * k;
      s.pitch += (s.tp - s.pitch) * k;
      s.tint += (s.tintTo - s.tint) * ease(0.18);
      if (Math.abs(s.ty - s.yaw) < 0.0008 && Math.abs(s.tp - s.pitch) < 0.0008) { s.yaw = s.ty; s.pitch = s.tp; }
      if (Math.abs(s.tintTo - s.tint) < 0.002) s.tint = s.tintTo;
      const flashing = s.flashAt >= 0 && now - s.flashAt < 1150;
      if (!flashing && s.flashAt >= 0 && now - s.flashAt >= 1150) { s.flashAt = -1; s.dirty = true; }
      if (s.yaw + s.pitch + s.tint !== before || flashing) { s.dirty = true; moving = true; }
    });
    render(now);
    if (moving) kick(); else last = 0;
  }

  function kick() {
    if (!raf && visible && !lost) raf = requestAnimationFrame(step);
  }

  function retarget() {
    buttons.forEach((b, i) => { state[i].tintTo = b.getAttribute('aria-pressed') === 'true' ? 1 : 0; });
    kick();
  }

  // —— input ——
  const cleanups = [];
  buttons.forEach((btn, i) => {
    const s = state[i];
    const on = (type, fn, o) => { btn.addEventListener(type, fn, o); cleanups.push(() => btn.removeEventListener(type, fn, o)); };
    let held = false;
    const aim = (e) => {
      if (reduce.matches || opt.shot) return;
      if (e.pointerType !== 'mouse' && !held) return;
      const r = btn.getBoundingClientRect();
      const x = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
      const y = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1));
      s.ty = s.rest[0] + x * 0.6;
      s.tp = s.rest[1] + y * 0.5;
      kick();
    };
    const home = () => { s.ty = s.rest[0]; s.tp = s.rest[1]; kick(); };
    on('pointermove', aim, { passive: true });
    on('pointerdown', (e) => { held = true; aim(e); });
    on('pointerup', () => { held = false; });
    on('pointercancel', () => { held = false; home(); });
    on('pointerleave', () => { held = false; home(); });
    on('focus', () => {
      if (!btn.matches(':focus-visible') || reduce.matches || opt.shot) return;
      s.ty = s.rest[0] - 0.35; s.tp = s.rest[1] - 0.2; kick();
    });
    on('blur', home);
    // click covers Enter and Space too
    on('click', () => { s.flashAt = performance.now(); s.dirty = true; kick(); });
    const mo = new MutationObserver(retarget);
    mo.observe(btn, { attributes: true, attributeFilter: ['aria-pressed'] });
    cleanups.push(() => mo.disconnect());
  });

  // —— lifecycle ——
  const ro = new ResizeObserver(() => { layout(); render(); });
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting && !document.hidden; if (visible) { full = true; render(); } });
  const onVis = () => { visible = !document.hidden; if (visible) { full = true; render(); } };
  const onScheme = () => { readPalette(); full = true; render(); };
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; root.classList.remove('is-gem'); });
  canvas.addEventListener('webglcontextrestored', () => { lost = false; init(); layout(); root.classList.add('is-gem'); render(); });

  try {
    init();
    readPalette();
    layout();
  } catch (err) {
    console.warn('gem-icons: staying flat', err);
    return null;
  }
  ro.observe(root);
  io.observe(root);
  document.addEventListener('visibilitychange', onVis);
  scheme.addEventListener('change', onScheme);
  retarget();
  state.forEach((s, i) => {
    s.tint = s.tintTo;
    const p = opt.shot?.[i];
    if (p) { s.yaw = s.ty = p[0]; s.pitch = s.tp = p[1]; }
  });
  root.classList.add('is-gem');
  render();

  return {
    render: () => { full = true; render(); },
    /** re-reads colours and the studio from CSS (after changing --gem or --gem-* at runtime) */
    refresh: () => { readPalette(); full = true; render(); },
    /** plays the caustic flash on gem i */
    flash(i) { if (state[i]) { state[i].flashAt = performance.now(); state[i].dirty = true; kick(); } },
    destroy() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      cleanups.forEach((f) => f());
      document.removeEventListener('visibilitychange', onVis);
      scheme.removeEventListener('change', onScheme);
      gl.deleteTexture(atlasTex);
      gl.deleteProgram(prog.prog);
      root.classList.remove('is-gem');
    }
  };
}
