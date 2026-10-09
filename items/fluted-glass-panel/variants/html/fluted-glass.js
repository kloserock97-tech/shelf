/* Fluted Glass Panel — a ribbed glass pane over any picture, in one WebGL2 pass.
   Every rib is a cylindrical lens: the picture under it is shifted only across the ribs (anisotropic), squeezed and
   mirrored toward the grooves; red, green and blue bend slightly differently. Each rib has its own highlight and a
   shade at its groove; tilting the pane (pointer or touch drag) slides the picture inside the ribs and moves the light.
   Outside the pane the picture stays sharp and takes a soft shadow. The loop runs only while the tilt settles.

     import { createFlutedGlass } from './fluted-glass.js';
     const glass = createFlutedGlass(canvas, picture, { rib: 22, refraction: 0.9, dispersion: 0.35 });
     glass.set({ panel: [0.36, 0.1, 0.94, 0.9] });   // pane in 0…1 of the canvas (left, top, right, bottom)
     glass.update();                                  // after redrawing `picture`

   `picture` is either a function paint(ctx, width, height, dark) — drawn in CSS px into an inner canvas and redrawn on
   resize and theme change — or a ready canvas/image the size of the canvas in device px. Returns null without WebGL2. */

const VERT = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
uniform sampler2D uSrc;
uniform vec2 uRes;          // device px
uniform float uDpr;
uniform float uRib;         // rib width, CSS px
uniform float uRefract;     // 0…1.5
uniform float uDisp;        // 0…1
uniform float uAngle;       // rib direction, radians (0 — vertical ribs)
uniform vec2 uTilt;         // −1…1
uniform vec4 uPanel;        // left, top, right, bottom in CSS px (top-left origin)
uniform float uRadius;      // corner radius, CSS px
uniform float uDark;
out vec4 outColor;

vec3 pick(vec2 p) {         // p: CSS px, top-left origin
  vec2 uv = clamp(p * uDpr / uRes, vec2(0.0), vec2(1.0));
  return texture(uSrc, uv).rgb;
}
float roundBox(vec2 p, vec2 hs, float r) {
  vec2 q = abs(p) - hs + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uDpr;
  vec2 c = (uPanel.xy + uPanel.zw) * 0.5, hs = (uPanel.zw - uPanel.xy) * 0.5;
  float sd = roundBox(p - c, hs, uRadius);
  vec3 base = pick(p);

  // outside: the picture as is, with the pane's soft shadow (lower, wider)
  float sdShadow = roundBox(p - c - vec2(0.0, 14.0), hs + 4.0, uRadius + 6.0);
  vec3 outside = base * (1.0 - mix(0.16, 0.42, uDark) * (1.0 - smoothstep(-10.0, 34.0, sdShadow)));

  // inside: rib frame — u runs across the ribs, v along them
  float ca = cos(uAngle), sa = sin(uAngle);
  vec2 local = p - c;
  vec2 across = vec2(ca, sa), along = vec2(-sa, ca);
  float u = dot(local, across) / uRib + 0.5;
  float s = fract(u) * 2.0 - 1.0;                    // −1…1 inside one rib
  float hgt = sqrt(max(1.0 - s * s, 0.0));
  vec3 n = normalize(vec3(s * 0.92, 0.0, hgt + 0.18)); // flattened cylinder: the middle of a rib stays readable

  // refraction: shift across the ribs by the slope; tilt slides the picture inside every rib
  float slope = clamp(n.x / n.z, -2.2, 2.2);
  float shift = -slope * uRib * 0.3 * uRefract + uTilt.x * uRib * 0.45 * uRefract;
  float lift = uTilt.y * 5.0;

  // dispersion: red bends least, blue most; five taps across the rib give the slight frosting of cast glass
  vec3 col = vec3(0.0);
  float wsum = 0.0;
  float spread = 0.5 + abs(s) * 1.6;
  for (int i = -2; i <= 2; i++) {
    float fi = float(i);
    float w = 1.0 - abs(fi) * 0.28;
    float o = fi * spread;
    vec2 q = p + across * (shift + o) + along * lift;
    vec3 k = vec3(1.0 - 0.22 * uDisp, 1.0, 1.0 + 0.22 * uDisp);
    col.r += w * pick(p + across * (shift * k.r + o) + along * lift).r;
    col.g += w * pick(q).g;
    col.b += w * pick(p + across * (shift * k.b + o) + along * lift).b;
    wsum += w;
  }
  col /= wsum;

  // light: follows the tilt; each rib gets a narrow streak and a broad sheen, the groove falls into shade
  vec3 L = normalize(vec3(-0.62 + uTilt.x * 0.9, 0.0, 0.8));
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  float nh = max(dot(n, H), 0.0);
  float diffuse = dot(n, L);
  col *= mix(0.92, 1.02, clamp(diffuse, 0.0, 1.0));
  float groove = exp(-(1.0 - abs(s)) * uRib / 1.4);
  col *= 1.0 - mix(0.14, 0.3, uDark) * groove;
  col += vec3(1.0) * (pow(nh, 420.0) * mix(0.3, 0.22, uDark) + pow(nh, 24.0) * 0.03);
  // the glass itself: a faint cool body tint, a touch lighter at the top
  vec3 tint = mix(vec3(0.95, 0.97, 1.0), vec3(0.72, 0.8, 0.86), uDark);
  float vgrad = clamp((p.y - uPanel.y) / max(1.0, uPanel.w - uPanel.y), 0.0, 1.0);
  col = mix(col, tint, mix(0.035, 0.04, uDark) + 0.03 * (1.0 - vgrad));
  // rim: a bright hairline just inside the edge and a darker band behind it
  col += vec3(1.0) * exp(min(sd, 0.0) / 0.9) * mix(0.55, 0.3, uDark) * (0.6 + 0.4 * (1.0 - vgrad));
  col *= 1.0 - 0.12 * exp(min(sd + 4.0, 0.0) / 3.0);

  float inside = 1.0 - smoothstep(-0.75, 0.75, sd);
  outColor = vec4(mix(outside, col, inside), 1.0);
}`;

export const FLUTED_DEFAULTS = { rib: 22, refraction: 0.9, dispersion: 0.35, angle: 0, radius: 18, panel: [0.36, 0.1, 0.94, 0.9] };

export function createFlutedGlass(canvas, picture, options = {}) {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false });
  if (!gl) return null;
  const params = { ...FLUTED_DEFAULTS, ...options };
  const darkQuery = matchMedia('(prefers-color-scheme: dark)');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const tilt = { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0 };
  let prog, tex, loc = {}, raf = 0, last = 0, visible = true, lost = false;
  const paint = typeof picture === 'function' ? picture : null;
  const source = paint ? document.createElement('canvas') : picture;
  let painted = '';

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
    for (const n of ['uSrc', 'uRes', 'uDpr', 'uRib', 'uRefract', 'uDisp', 'uAngle', 'uTilt', 'uPanel', 'uRadius', 'uDark'])
      loc[n] = gl.getUniformLocation(prog, n);
    gl.bindVertexArray(gl.createVertexArray());
    tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    upload();
  }
  function upload() {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  }

  function draw() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const W = canvas.clientWidth, H = canvas.clientHeight;
    const w = Math.max(1, Math.round(W * dpr)), h = Math.max(1, Math.round(H * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const key = `${w}x${h}:${darkQuery.matches}`;
    if (paint && painted !== key) {
      painted = key;
      source.width = w; source.height = h;
      const g = source.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      paint(g, W, H, darkQuery.matches);
      upload();
    }
    const [l, t, r, b] = params.panel;
    gl.viewport(0, 0, w, h);
    gl.useProgram(prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(loc.uSrc, 0);
    gl.uniform2f(loc.uRes, w, h);
    gl.uniform1f(loc.uDpr, dpr);
    gl.uniform1f(loc.uRib, params.rib);
    gl.uniform1f(loc.uRefract, params.refraction);
    gl.uniform1f(loc.uDisp, params.dispersion);
    gl.uniform1f(loc.uAngle, params.angle);
    gl.uniform2f(loc.uTilt, tilt.x, tilt.y);
    gl.uniform4f(loc.uPanel, l * W, t * H, r * W, b * H);
    gl.uniform1f(loc.uRadius, params.radius);
    gl.uniform1f(loc.uDark, darkQuery.matches ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /* the tilt is a critically damped spring (~0.35 s); the loop stops once it is still */
  function frame(now) {
    raf = 0;
    if (lost) return;
    const dt = Math.min(0.033, (now - (last || now)) / 1000);
    last = now;
    if (reduced.matches) { tilt.x = tilt.tx; tilt.y = tilt.ty; tilt.vx = tilt.vy = 0; }
    else {
      const k = 120, d = 2 * Math.sqrt(k);
      tilt.vx += (k * (tilt.tx - tilt.x) - d * tilt.vx) * dt; tilt.x += tilt.vx * dt;
      tilt.vy += (k * (tilt.ty - tilt.y) - d * tilt.vy) * dt; tilt.y += tilt.vy * dt;
    }
    draw();
    const moving = Math.abs(tilt.tx - tilt.x) + Math.abs(tilt.ty - tilt.y) > 1e-4 || Math.abs(tilt.vx) + Math.abs(tilt.vy) > 1e-3;
    if (moving && visible) raf = requestAnimationFrame(frame);
    else last = 0;
  }
  const request = () => { if (!raf && visible) raf = requestAnimationFrame(frame); };

  const target = options.pointerTarget || canvas;
  const onMove = (e) => {
    const r = canvas.getBoundingClientRect();
    tilt.tx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
    tilt.ty = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1));
    request();
  };
  const onLeave = () => { tilt.tx = 0; tilt.ty = 0; request(); };
  target.addEventListener('pointermove', onMove);
  target.addEventListener('pointerdown', onMove);
  target.addEventListener('pointerleave', onLeave);
  target.addEventListener('pointercancel', onLeave);

  const ro = new ResizeObserver(request);
  ro.observe(canvas);
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) request(); });
  io.observe(canvas);
  const onTheme = () => request();
  darkQuery.addEventListener('change', onTheme);
  const onLost = (e) => { e.preventDefault(); lost = true; };
  const onRestored = () => { lost = false; loc = {}; painted = ''; init(); request(); };
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);
  init();
  request();

  return {
    params,
    /** rib (CSS px), refraction (0…1.5), dispersion (0…1), angle (radians), radius (CSS px), panel [l, t, r, b] in 0…1 */
    set(next) { Object.assign(params, next); request(); },
    /** Redraw / re-read the picture after it changed. */
    update() { painted = ''; if (!paint) upload(); request(); },
    /** Tilt without a pointer, −1…1; `instant` skips the spring. */
    setTilt(x, y, instant = false) {
      tilt.tx = x; tilt.ty = y;
      if (instant) { tilt.x = x; tilt.y = y; tilt.vx = tilt.vy = 0; }
      request();
    },
    destroy() {
      cancelAnimationFrame(raf);
      ro.disconnect(); io.disconnect();
      darkQuery.removeEventListener('change', onTheme);
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerdown', onMove);
      target.removeEventListener('pointerleave', onLeave);
      target.removeEventListener('pointercancel', onLeave);
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
    }
  };
}
