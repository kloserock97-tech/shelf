/* God rays demo: a low sun behind a tree on a hill, drawn procedurally into the HDR buffer of createGodRays.
   Drag anywhere to move the sun; it may go past the frame edge, where the rays keep coming in and then fade.
   URL: ?rays=0, ?view=mask|rays, ?rayshalo=5, ?raysmask=0.85,2.2, ?raysoff=1.6,2.7 — as on the site. */
(function () {
  const SCENE = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform vec2 uSun;        // the sun in screen UV
uniform float uTime;
uniform float uWind;
uniform vec3 uZenith, uHigh, uMid, uHorizon, uGlow, uSunCol;
uniform float uSunDisc;
in vec2 vUv;
out vec4 fragColor;

// Integer hash: xorshift and a multiply by 2^32/phi, twice. Precise far from the origin, unlike a sine hash.
// Hash Kit (our own hash, see shelf/items/hash-kit)
uint hashU(uint x) { x ^= x >> 16; x *= 0x3f9c86cbu; x ^= x >> 14; x *= 0x1ae9dacfu; x ^= x >> 15; return x; }
float hash1(int i) { return float(hashU(uint(i) + 0xb31c96c9u) >> 8) / 16777216.0; }
vec3 hash23(ivec2 p) {
  uint h = hashU(uint(p.x) + hashU(uint(p.y) + 0xb31c96c9u));
  uint g = hashU(h);
  return vec3(float(h >> 16), float(h & 0xFFFFu), float(g >> 16)) / 65536.0;
}
float vnoise1(float x) { float i = floor(x), f = fract(x); return mix(hash1(int(i)), hash1(int(i) + 1), f * f * (3.0 - 2.0 * f)); }

float A;                    // aspect
float PX;                   // one pixel in scene units (frame height = 1)
const float K = 0.73;       // 2 tan(fovY / 2) for a 40-degree lens
const float PITCH = 0.13;   // the camera looks a little up

vec3 dirAt(vec2 uv) { vec2 n = (uv - 0.5) * vec2(A, 1.0) * K; return normalize(vec3(n.x, n.y + PITCH, -1.0)); }

// The site's sky: cold zenith, almost white middle, warm band at the horizon, glow toward the sun's azimuth.
vec3 skyBase(vec3 d, vec3 sd) {
  float e = d.y;
  vec3 c = mix(uHorizon, uMid, smoothstep(-0.02, 0.17, e));
  c = mix(c, uHigh, smoothstep(0.13, 0.40, e));
  c = mix(c, uZenith, smoothstep(0.34, 0.90, e));
  vec3 flat_ = normalize(vec3(sd.x, 0.0, sd.z));
  float toward = max(dot(normalize(vec3(d.x, 0.0, d.z)), flat_), 0.0);
  return mix(c, uGlow, pow(toward, 4.0) * (1.0 - smoothstep(-0.05, 0.25, e)) * 0.6);
}

float hillY(float x, float cx) {
  return -0.235 + 0.215 * exp(-pow((x - cx) / 0.62, 2.0)) + (vnoise1(x * 9.0) - 0.5) * 0.012 + (vnoise1(x * 31.0) - 0.5) * 0.004;
}
float farY(float x) { return -0.168 + (vnoise1(x * 3.1 + 7.0) - 0.5) * 0.05 + (vnoise1(x * 11.0) - 0.5) * 0.012; }

float capsule(vec2 p, vec2 a, vec2 b, float ra, float rb) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - mix(ra, rb, h);
}

// grass along the crest: thin blades, the tips lean with the wind
float grass(vec2 p, float cx, out float tip) {
  const float CELL = 0.0042;
  float cov = 0.0;
  tip = 0.0;
  int ci = int(floor(p.x / CELL));
  for (int k = -3; k <= 3; k++) {
    int i = ci + k;
    float x0 = (float(i) + hash1(i * 3 + 1)) * CELL;
    float hgt = mix(0.010, 0.034, pow(hash1(i * 3 + 2), 2.0));
    float base = hillY(x0, cx) - 0.006;
    float t = (p.y - base) / hgt;
    if (t < 0.0 || t > 1.0) continue;
    float lean = (hash1(i * 3 + 3) - 0.5) * 0.6 + uWind * (0.25 + 0.2 * sin(uTime * 1.7 + x0 * 37.0));
    float dx = p.x - (x0 + lean * hgt * t * t);
    float c = clamp((0.0017 * (1.0 - t) - abs(dx)) / PX + 0.5, 0.0, 1.0);
    if (c > cov) { cov = c; tip = t; }
  }
  return cov;
}

// crown: clusters of leaves around its centre; the density decides leaf size and how many cells stay empty
const int NC = 8;
const vec3 CL[NC] = vec3[](vec3(0.0, 0.0, 0.55), vec3(-0.56, 0.08, 0.44), vec3(0.54, 0.05, 0.46), vec3(-0.26, 0.46, 0.42),
                           vec3(0.30, 0.42, 0.40), vec3(-0.74, -0.26, 0.30), vec3(0.76, -0.22, 0.32), vec3(0.04, 0.66, 0.30));
float crownField(vec2 q) {
  float f = 0.0;
  for (int i = 0; i < NC; i++) f = max(f, smoothstep(1.0, 0.45, length(q - CL[i].xy) / CL[i].z));
  return f;
}
float leaves(vec2 p, vec2 c, float s, out float dens) {
  dens = crownField((p - c) / s);
  if (dens < 0.001) return 0.0;
  const float L = 0.0078;
  vec2 g = p / L;
  ivec2 ci = ivec2(floor(g));
  float cov = 0.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    ivec2 cell = ci + ivec2(x, y);
    vec3 h = hash23(cell);
    float d0 = crownField(((vec2(cell) + 0.5) * L - c) / s);
    if (h.z < 0.14 + 0.55 * (1.0 - d0)) continue;            // gaps: the sky shows through, rays come out of them
    vec2 pt = vec2(cell) + 0.15 + 0.7 * h.xy;
    float r = mix(0.3, 0.78, d0) * (0.8 + 0.4 * h.z);
    cov = max(cov, clamp((r - length(g - pt)) * L / PX + 0.5, 0.0, 1.0));
  }
  return cov;
}

void main() {
  A = uRes.x / uRes.y;
  PX = 1.0 / uRes.y;
  vec2 p = (vUv - 0.5) * vec2(A, 1.0);
  vec3 sd = dirAt(uSun);
  vec3 d = dirAt(vUv);

  vec3 col = skyBase(d, sd);
  float cosA = max(dot(d, sd), 0.0);
  float halo = pow(cosA, 900.0) * 2.2 + pow(cosA, 90.0) * 0.45 + pow(cosA, 12.0) * 0.06;
  float disc = smoothstep(0.99965, 0.99985, cosA) * uSunDisc;
  col += uSunCol * (halo + disc);

  vec2 sp = (uSun - 0.5) * vec2(A, 1.0);
  vec2 sdl = p - sp;
  float glow = exp(-dot(sdl, sdl) * 26.0);          // how close to the sun: backlit edges light up

  // far ridge in haze
  float fy = farY(p.x);
  col = mix(col, mix(vec3(0.05, 0.06, 0.04), col, 0.72), clamp((fy - p.y) / PX + 0.5, 0.0, 1.0));

  // tree position: right third on a wide frame, closer to the centre on a phone
  float tx = min(0.30, 0.5 * A - 0.19);
  float cx = tx - 0.2;
  float hy = hillY(p.x, cx);
  float tip;
  float gcov = grass(p, cx, tip);
  float hill = max(clamp((hy - p.y) / PX + 0.5, 0.0, 1.0), gcov);
  vec3 hillCol = mix(vec3(0.010, 0.013, 0.005), vec3(0.030, 0.040, 0.014), smoothstep(-0.5, hy, p.y));
  hillCol += uSunCol * vec3(0.30, 0.34, 0.12) * glow * tip * tip * gcov;
  col = mix(col, hillCol, hill);

  // trunk, branches, crown; the crown sways with the wind above the trunk
  vec2 base = vec2(tx + 0.02, hillY(tx + 0.02, cx) - 0.01);
  vec2 top = vec2(tx - 0.005, 0.1);
  vec2 cc = vec2(tx - 0.01, 0.19);
  float sway = uWind * (sin(uTime * 0.9) * 0.6 + sin(uTime * 1.43 + 1.0) * 0.4) * 0.004;
  vec2 pw = p - vec2(sway * smoothstep(base.y, cc.y + 0.1, p.y), 0.0);
  float wood = capsule(pw, base, top, 0.011, 0.006);
  wood = min(wood, capsule(pw, top, cc + vec2(-0.09, 0.03), 0.006, 0.002));
  wood = min(wood, capsule(pw, top, cc + vec2(0.085, 0.02), 0.0055, 0.002));
  wood = min(wood, capsule(pw, top + vec2(0.0, -0.03), cc + vec2(-0.13, -0.03), 0.004, 0.0015));
  wood = min(wood, capsule(pw, top, cc + vec2(0.0, 0.08), 0.005, 0.002));
  float woodCov = clamp(-wood / PX + 0.5, 0.0, 1.0);
  col = mix(col, vec3(0.018, 0.014, 0.009), woodCov);

  float dens;
  float leaf = leaves(pw + vec2(0.0015 * sin(uTime * 2.3 + p.y * 30.0) * uWind, 0.0), cc, 0.155, dens);
  vec3 leafCol = mix(vec3(0.012, 0.018, 0.006), vec3(0.028, 0.036, 0.010), dens);
  leafCol += uSunCol * vec3(0.20, 0.26, 0.06) * glow * pow(1.0 - dens, 2.0) * 0.6;   // rim leaves glow through
  col = mix(col, leafCol, leaf);

  fragColor = vec4(col, 1.0);
}`;

  const canvas = document.getElementById('stage');
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance' });
  if (!gl) { document.getElementById('fallback').hidden = false; return; }

  const q = new URLSearchParams(location.search);
  const pair = (name) => { const v = (q.get(name) || '').split(',').map(Number); return v.length === 2 && v.every(Number.isFinite) ? v : null; };
  const rays = createGodRays(gl, { enabled: q.get('rays') !== '0' });
  const P = rays.params;
  if (q.has('rayshalo') && Number.isFinite(Number(q.get('rayshalo')))) P.halo = Number(q.get('rayshalo'));
  if (pair('raysmask')) [P.lumLo, P.lumHi] = pair('raysmask');
  if (pair('raysoff')) P.fade = pair('raysoff');
  P.view = { mask: 1, rays: 2 }[q.get('view')] || 0;

  // the scene program (fullscreen triangle, as in the harness)
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, '#version 300 es\nout vec2 vUv;\nvoid main(){ vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }'));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, SCENE));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  const U = (n) => gl.getUniformLocation(prog, n);
  const vao = gl.createVertexArray();

  // the site's sky (sRGB hex → linear) and its sun: HDR, the disc is 6× the sun colour
  const lin = (hex) => [0, 2, 4].map((i) => { const c = parseInt(hex.slice(1 + i, 3 + i), 16) / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });
  gl.useProgram(prog);
  gl.uniform3fv(U('uZenith'), lin('#b3c1c8'));
  gl.uniform3fv(U('uHigh'), lin('#d8ddd8'));
  gl.uniform3fv(U('uMid'), lin('#efebdd'));
  gl.uniform3fv(U('uHorizon'), lin('#f4d49a'));
  gl.uniform3fv(U('uGlow'), lin('#f7c27e'));
  gl.uniform3f(U('uSunCol'), 1.6, 1.15, 0.7);
  gl.uniform1f(U('uSunDisc'), 6);

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // the sun's home: just behind the crown (the tree stands at tx, as in the shader)
  const HOME = () => {
    const a = canvas.clientWidth / canvas.clientHeight, tx = Math.min(0.3, 0.5 * a - 0.19);
    return [0.5 + (tx + 0.02) / a, 0.7];
  };
  let sun = HOME();

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 1.75);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width === w && canvas.height === h) return;
    canvas.width = w;
    canvas.height = h;
    rays.resize(w, h);
  }

  // drag anywhere: the sun follows the pointer's movement and may leave the frame
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    sun = [Math.min(1.8, Math.max(-0.8, sun[0] + (e.clientX - drag.x) / canvas.clientWidth)), Math.min(1.8, Math.max(-0.8, sun[1] - (e.clientY - drag.y) / canvas.clientHeight))];
    drag = { x: e.clientX, y: e.clientY };
  });
  const end = () => { drag = null; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('dblclick', () => { sun = HOME(); });
  canvas.addEventListener('keydown', (e) => {
    const k = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key];
    if (!k) return;
    e.preventDefault();
    sun = [Math.min(1.8, Math.max(-0.8, sun[0] + k[0] * 0.02)), Math.min(1.8, Math.max(-0.8, sun[1] + k[1] * 0.02))];
  });

  HUD.set('view', P.enabled ? ['on', 'mask', 'rays'][P.view] : 'off');
  HUD.on('view', (v) => { P.enabled = v !== 'off'; P.view = { mask: 1, rays: 2 }[v] || 0; });
  HUD.set('strength', P.strength);
  HUD.on('strength', (v) => { P.strength = v; });
  HUD.set('halo', P.halo);
  HUD.on('halo', (v) => { P.halo = v; });
  HUD.set('threshold', P.lumLo);
  HUD.on('threshold', (v) => { P.lumHi = v * (2.2 / 0.85); P.lumLo = v; });

  let last = performance.now(), time = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    time += dt;
    resize();
    gl.bindFramebuffer(gl.FRAMEBUFFER, rays.scene.fb);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(prog);
    gl.uniform2f(U('uRes'), canvas.width, canvas.height);
    gl.uniform2f(U('uSun'), sun[0], sun[1]);
    gl.uniform1f(U('uTime'), time);
    gl.uniform1f(U('uWind'), reduced ? 0.25 : 1);
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    rays.render(sun, dt);
    rays.composite(null);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
