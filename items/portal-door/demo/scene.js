/* Portal Door demo: a dim meadow outside, a golden-hour hill behind the door. Progress by the slider or
   autoplay; the camera pushes a little into both scenes during the dive. ?p=0.4&play=0 freezes a frame. */
(function () {
  const SCENE = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform float uZoom;
uniform int uScene;          // 0 — the hill behind the door, 1 — the meadow around it
in vec2 vUv;
out vec4 fragColor;

// Hash Kit (our own hash, see shelf/items/hash-kit)
uint hashU(uint x) { x ^= x >> 16; x *= 0x3f9c86cbu; x ^= x >> 14; x *= 0x1ae9dacfu; x ^= x >> 15; return x; }
float hash1(int i) { return float(hashU(uint(i) + 0xb31c96c9u) >> 8) / 16777216.0; }
float hash2(ivec2 p) { return float(hashU(uint(p.x) + hashU(uint(p.y) + 0xb31c96c9u)) >> 8) / 16777216.0; }
float vnoise1(float x) { float i = floor(x), f = fract(x); return mix(hash1(int(i)), hash1(int(i) + 1), f * f * (3.0 - 2.0 * f)); }
float vnoise2(vec2 p) {
  ivec2 i = ivec2(floor(p)); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + ivec2(1, 0)), u.x), mix(hash2(i + ivec2(0, 1)), hash2(i + ivec2(1, 1)), u.x), u.y);
}

float A, PX;
const float K = 0.73, PITCH = 0.13;
vec3 dirAt(vec2 p) { return normalize(vec3(p.x * K, p.y * K + PITCH, -1.0)); }
vec3 sky(vec3 d, vec3 sd, vec3 zen, vec3 high, vec3 mid, vec3 hor, vec3 glow) {
  float e = d.y;
  vec3 c = mix(hor, mid, smoothstep(-0.02, 0.17, e));
  c = mix(c, high, smoothstep(0.13, 0.40, e));
  c = mix(c, zen, smoothstep(0.34, 0.90, e));
  float toward = max(dot(normalize(vec3(d.x, 0.0, d.z)), normalize(vec3(sd.x, 0.0, sd.z))), 0.0);
  return mix(c, glow, pow(toward, 4.0) * (1.0 - smoothstep(-0.05, 0.25, e)) * 0.6);
}
float cover(float edge, float y) { return clamp((edge - y) / PX + 0.5, 0.0, 1.0); }

vec3 hill(vec2 p) {
  vec3 d = dirAt(p);
  vec3 sd = normalize(vec3(0.1, 0.035, -1.0));
  vec3 col = sky(d, sd, vec3(0.451, 0.533, 0.578), vec3(0.687, 0.723, 0.687), vec3(0.863, 0.831, 0.723), vec3(0.905, 0.658, 0.323), vec3(0.930, 0.539, 0.209));
  float cosA = max(dot(d, sd), 0.0);
  col += vec3(1.6, 1.15, 0.7) * (pow(cosA, 900.0) * 2.2 + pow(cosA, 90.0) * 0.45 + pow(cosA, 12.0) * 0.06 + smoothstep(0.99965, 0.99985, cosA) * 6.0);
  float far = -0.168 + (vnoise1(p.x * 3.1 + 7.0) - 0.5) * 0.05;
  col = mix(col, mix(vec3(0.05, 0.06, 0.04), col, 0.7), cover(far, p.y));
  float top = -0.24 + 0.17 * exp(-pow((p.x + 0.05) / 0.5, 2.0)) + (vnoise1(p.x * 9.0) - 0.5) * 0.012;
  float g = 0.0, tip = 0.0;
  int ci = int(floor(p.x / 0.0045));
  for (int k = -3; k <= 3; k++) {
    int i = ci + k;
    float x0 = (float(i) + hash1(i * 3 + 1)) * 0.0045;
    float base = -0.24 + 0.17 * exp(-pow((x0 + 0.05) / 0.5, 2.0)) + (vnoise1(x0 * 9.0) - 0.5) * 0.012 - 0.006;
    float h = mix(0.012, 0.04, pow(hash1(i * 3 + 2), 2.0));
    float t = (p.y - base) / h;
    if (t < 0.0 || t > 1.0) continue;
    float lean = (hash1(i * 3 + 3) - 0.5) * 0.6 + 0.3 + 0.15 * sin(uTime * 1.7 + x0 * 37.0);
    float c = clamp((0.0018 * (1.0 - t) - abs(p.x - x0 - lean * h * t * t)) / PX + 0.5, 0.0, 1.0);
    if (c > g) { g = c; tip = t; }
  }
  vec3 ground = mix(vec3(0.014, 0.018, 0.007), vec3(0.05, 0.06, 0.02), smoothstep(-0.5, top, p.y));
  ground += vec3(0.3, 0.25, 0.08) * tip * tip * g * 0.5;
  return mix(col, ground, max(cover(top, p.y), g));
}

vec3 meadow(vec2 p) {
  vec3 d = dirAt(p);
  vec3 sd = normalize(vec3(-0.3, 0.2, -1.0));
  vec3 col = sky(d, sd, vec3(0.270, 0.309, 0.332), vec3(0.392, 0.423, 0.423), vec3(0.533, 0.533, 0.485), vec3(0.597, 0.558, 0.462), vec3(0.651, 0.578, 0.423)) * vec3(0.42, 0.44, 0.38);
  // three rolling hills, darker toward the viewer
  for (int r = 0; r < 3; r++) {
    float fr = float(r);
    float y = -0.08 - fr * 0.1 + (vnoise1(p.x * (1.6 + fr * 0.8) + fr * 11.0) - 0.5) * (0.16 - fr * 0.03);
    vec3 tone = mix(vec3(0.06, 0.08, 0.035), vec3(0.018, 0.03, 0.01), fr / 2.0);
    // grass streaks and patches on each slope
    float streak = vnoise2(vec2(p.x * 60.0, (y - p.y) * 260.0)) * 0.5 + vnoise2(p * 9.0 + fr * 3.0) * 0.5;
    vec3 c = tone * (0.7 + 0.6 * streak);
    c = mix(c, col, 0.35 - fr * 0.15);
    col = mix(col, c, cover(y, p.y));
  }
  // white and pink flowers in the near grass
  vec2 fg = p * vec2(130.0, 190.0);
  ivec2 cell = ivec2(floor(fg));
  float h = hash2(cell);
  if (p.y < -0.28 && h > 0.9) {
    vec2 at = vec2(cell) + 0.5 + (vec2(hash2(cell + 5), hash2(cell + 9)) - 0.5) * 0.6;
    vec3 petal = hash2(cell + 17) > 0.7 ? vec3(0.5, 0.25, 0.35) : vec3(0.55, 0.55, 0.5);
    col = mix(col, petal, exp(-dot(fg - at, fg - at) * 10.0) * smoothstep(-0.28, -0.4, p.y));
  }
  return col;
}

void main() {
  A = uRes.x / uRes.y;
  PX = 1.0 / (uRes.y * uZoom);
  vec2 p = (vUv - 0.5) * vec2(A, 1.0) / uZoom;
  fragColor = vec4(uScene == 0 ? hill(p) : meadow(p), 1.0);
}`;

  const canvas = document.getElementById('stage');
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance' });
  if (!gl) { document.getElementById('fallback').hidden = false; return; }

  const portal = createPortalDoor(gl);
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, '#version 300 es\nout vec2 vUv;\nvoid main(){ vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }'));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, SCENE));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  const U = (n) => gl.getUniformLocation(prog, n);
  const vao = gl.createVertexArray();

  const q = new URLSearchParams(location.search);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let progress = q.has('p') ? Math.min(1, Math.max(0, Number(q.get('p')) || 0)) : 0;
  let playing = q.get('play') !== '0' && !reduced;
  // autoplay: 0.6 s meadow, 3.4 s through the door, 1.2 s on the hill, 3.4 s back, and again
  const CYCLE = 8.6;
  let clock = 0;
  const autoProgress = (t) => {
    const c = t % CYCLE;
    if (c < 0.6) return 0;
    if (c < 4.0) return (c - 0.6) / 3.4;
    if (c < 5.2) return 1;
    return 1 - (c - 5.2) / 3.4;
  };

  const playBtn = document.querySelector('[data-name="play"]');
  const setPlaying = (on) => { playing = on; playBtn.textContent = on ? 'Pause' : 'Play'; playBtn.setAttribute('aria-pressed', String(on)); };
  setPlaying(playing);
  HUD.set('progress', progress);
  HUD.on('progress', (v) => { progress = v; setPlaying(false); });
  HUD.on('play', () => { if (!playing) clock = 0.6 + progress * 3.4; setPlaying(!playing); });
  HUD.on('corner', (v) => { portal.params.corner = v; });
  HUD.on('refraction', (v) => { portal.params.refract = v === 'on'; });

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width === w && canvas.height === h) return;
    canvas.width = w;
    canvas.height = h;
    portal.resize(w, h);
  }
  const drawScene = (target, which, time, zoom) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb);
    gl.viewport(0, 0, target.w, target.h);
    gl.useProgram(prog);
    gl.uniform2f(U('uRes'), target.w, target.h);
    gl.uniform1f(U('uTime'), time);
    gl.uniform1f(U('uZoom'), zoom);
    gl.uniform1i(U('uScene'), which);
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  let last = performance.now(), time = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    time += dt;
    if (playing) {
      clock += dt;
      progress = autoProgress(clock);
      HUD.set('progress', Number(progress.toFixed(2)));
    }
    resize();
    // the camera moves forward during the dive: the near meadow grows faster than the far hill
    const dive = sm(0.46, 0.97, progress);
    if (progress < 0.999) drawScene(portal.outside, 1, time, Math.exp(0.6 * dive));
    if (progress > 0.001) drawScene(portal.inside, 0, time, 1 + 0.12 * dive);
    portal.render(progress);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
