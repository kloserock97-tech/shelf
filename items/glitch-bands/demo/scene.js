/* Glitch Bands demo: two procedural pictures, a golden-hour hill and a blue-hour valley, and the transition
   between them. Progress by the slider or autoplay (A → B → A). ?p=0.46&play=0 freezes a frame. */
(function () {
  const SCENE = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform int uScene;          // 0 — golden hour, 1 — blue hour
in vec2 vUv;
out vec4 fragColor;

// Hash Kit (our own hash, see shelf/items/hash-kit)
uint hashU(uint x) { x ^= x >> 16; x *= 0x3f9c86cbu; x ^= x >> 14; x *= 0x1ae9dacfu; x ^= x >> 15; return x; }
float hash1(int i) { return float(hashU(uint(i) + 0xb31c96c9u) >> 8) / 16777216.0; }
float hash2(ivec2 p) { return float(hashU(uint(p.x) + hashU(uint(p.y) + 0xb31c96c9u)) >> 8) / 16777216.0; }
float vnoise1(float x) { float i = floor(x), f = fract(x); return mix(hash1(int(i)), hash1(int(i) + 1), f * f * (3.0 - 2.0 * f)); }

float A, PX;
const float K = 0.73, PITCH = 0.13;
vec3 dirAt(vec2 uv) { vec2 n = (uv - 0.5) * vec2(A, 1.0) * K; return normalize(vec3(n.x, n.y + PITCH, -1.0)); }

// the site's sky gradient with a warm glow toward the sun's azimuth
vec3 sky(vec3 d, vec3 sd, vec3 zen, vec3 high, vec3 mid, vec3 hor, vec3 glow) {
  float e = d.y;
  vec3 c = mix(hor, mid, smoothstep(-0.02, 0.17, e));
  c = mix(c, high, smoothstep(0.13, 0.40, e));
  c = mix(c, zen, smoothstep(0.34, 0.90, e));
  float toward = max(dot(normalize(vec3(d.x, 0.0, d.z)), normalize(vec3(sd.x, 0.0, sd.z))), 0.0);
  return mix(c, glow, pow(toward, 4.0) * (1.0 - smoothstep(-0.05, 0.25, e)) * 0.6);
}
float cover(float edge, float y) { return clamp((edge - y) / PX + 0.5, 0.0, 1.0); }

vec3 golden(vec2 p, vec3 d) {
  vec3 sd = normalize(vec3(0.16, 0.035, -1.0));
  vec3 col = sky(d, sd, vec3(0.451, 0.533, 0.578), vec3(0.687, 0.723, 0.687), vec3(0.863, 0.831, 0.723), vec3(0.905, 0.658, 0.323), vec3(0.930, 0.539, 0.209));
  float cosA = max(dot(d, sd), 0.0);
  col += vec3(1.6, 1.15, 0.7) * (pow(cosA, 900.0) * 2.2 + pow(cosA, 90.0) * 0.45 + pow(cosA, 12.0) * 0.06 + smoothstep(0.99965, 0.99985, cosA) * 6.0);
  float far = -0.168 + (vnoise1(p.x * 3.1 + 7.0) - 0.5) * 0.05 + (vnoise1(p.x * 11.0) - 0.5) * 0.012;
  col = mix(col, mix(vec3(0.05, 0.06, 0.04), col, 0.7), cover(far, p.y));
  float hill = -0.25 + 0.2 * exp(-pow((p.x + 0.1) / 0.7, 2.0)) + (vnoise1(p.x * 9.0) - 0.5) * 0.012;
  // grass on the crest: thin blades, the tips lean with the wind
  float g = 0.0, tip = 0.0;
  int ci = int(floor(p.x / 0.0045));
  for (int k = -3; k <= 3; k++) {
    int i = ci + k;
    float x0 = (float(i) + hash1(i * 3 + 1)) * 0.0045;
    float base = -0.25 + 0.2 * exp(-pow((x0 + 0.1) / 0.7, 2.0)) + (vnoise1(x0 * 9.0) - 0.5) * 0.012 - 0.006;
    float h = mix(0.012, 0.045, pow(hash1(i * 3 + 2), 2.0));
    float t = (p.y - base) / h;
    if (t < 0.0 || t > 1.0) continue;
    float lean = (hash1(i * 3 + 3) - 0.5) * 0.6 + 0.3 + 0.15 * sin(uTime * 1.7 + x0 * 37.0);
    float c = clamp((0.0018 * (1.0 - t) - abs(p.x - x0 - lean * h * t * t)) / PX + 0.5, 0.0, 1.0);
    if (c > g) { g = c; tip = t; }
  }
  vec3 ground = mix(vec3(0.012, 0.016, 0.006), vec3(0.04, 0.05, 0.016), smoothstep(-0.5, hill, p.y));
  ground += vec3(0.3, 0.25, 0.08) * tip * tip * g * 0.5;
  return mix(col, ground, max(cover(hill, p.y), g));
}

vec3 bluehour(vec2 p, vec3 d) {
  vec3 sd = normalize(vec3(-0.35, -0.03, -1.0));
  vec3 col = sky(d, sd, vec3(0.042, 0.061, 0.162), vec3(0.184, 0.181, 0.323), vec3(0.546, 0.352, 0.323), vec3(0.694, 0.323, 0.188), vec3(0.807, 0.296, 0.144));
  // stars above the glow, a few of them twinkle
  vec2 sg = p * 90.0;
  ivec2 cell = ivec2(floor(sg));
  float s = hash2(cell);
  if (s > 0.965) {
    vec2 at = vec2(cell) + 0.5 + (vec2(hash2(cell + 7), hash2(cell + 13)) - 0.5) * 0.6;
    float tw = 0.7 + 0.3 * sin(uTime * (1.0 + s * 4.0) + s * 60.0);
    col += vec3(0.9, 0.92, 1.0) * exp(-dot(sg - at, sg - at) * 9.0) * smoothstep(0.08, 0.3, d.y) * tw * 1.4;
  }
  // a crescent moon: a disc minus a shifted disc
  vec2 m = p - vec2(min(0.24, 0.5 * A - 0.09), 0.27);
  float moon = smoothstep(0.036, 0.034, length(m)) * smoothstep(0.03, 0.033, length(m - vec2(0.013, 0.008)));
  col += vec3(1.3, 1.25, 1.1) * moon + vec3(0.1, 0.1, 0.14) * exp(-dot(m, m) * 90.0);
  // three ridges, each nearer one darker and less mixed with the sky
  vec3 tints[3] = vec3[](vec3(0.03, 0.045, 0.072), vec3(0.028, 0.047, 0.03), vec3(0.012, 0.02, 0.014));
  float airs[3] = float[](0.62, 0.45, 0.2);
  for (int r = 0; r < 3; r++) {
    float fr = float(r);
    float y = -0.13 - fr * 0.05 + (vnoise1(p.x * (2.2 + fr) + fr * 13.0) - 0.5) * (0.12 - fr * 0.03) + (vnoise1(p.x * 9.0 + fr * 5.0) - 0.5) * 0.02;
    if (r == 2) {
      // pines on the nearest ridge: narrow triangles of random height
      float cellW = 0.018;
      int ci = int(floor(p.x / cellW));
      float best = 0.0;
      for (int k = -1; k <= 1; k++) {
        int i = ci + k;
        if (hash1(i * 5 + 1) < 0.35) continue;
        float cx = (float(i) + 0.5 + (hash1(i * 5 + 2) - 0.5) * 0.6) * cellW;
        float h = mix(0.03, 0.075, hash1(i * 5 + 3));
        best = max(best, h * (1.0 - abs(p.x - cx) / (cellW * 0.55 * mix(0.6, 1.0, hash1(i * 5 + 4)))));
      }
      y += best;
    }
    vec3 ridge = mix(tints[r], col, airs[r]);
    // mist at the foot of the ridge
    ridge = mix(ridge, vec3(0.35, 0.22, 0.25), exp(-max(p.y - (y - 0.12), 0.0) * 30.0) * 0.25 * (1.0 - fr * 0.3));
    col = mix(col, ridge, cover(y, p.y));
  }
  return col;
}

void main() {
  A = uRes.x / uRes.y;
  PX = 1.0 / uRes.y;
  vec2 p = (vUv - 0.5) * vec2(A, 1.0);
  vec3 d = dirAt(vUv);
  fragColor = vec4(uScene == 0 ? golden(p, d) : bluehour(p, d), 1.0);
}`;

  const canvas = document.getElementById('stage');
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance' });
  if (!gl) { document.getElementById('fallback').hidden = false; return; }

  const fx = createGlitchTransition(gl);
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, '#version 300 es\nout vec2 vUv;\nvoid main(){ vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }'));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, SCENE));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  const U = (n) => gl.getUniformLocation(prog, n);
  const vao = gl.createVertexArray();

  const q = new URLSearchParams(location.search);
  let progress = q.has('p') ? Math.min(1, Math.max(0, Number(q.get('p')) || 0)) : 0;
  let playing = q.get('play') !== '0' && !fx.params.reduced;
  let clock = 0;          // autoplay clock: 0.7 s hold, 1.4 s A → B, 1.4 s hold, 1.4 s B → A
  const CYCLE = 4.9;
  const ease = (t) => t * t * (3 - 2 * t);
  const autoProgress = (t) => {
    const c = t % CYCLE;
    if (c < 0.7) return 0;
    if (c < 2.1) return ease((c - 0.7) / 1.4);
    if (c < 3.5) return 1;
    return 1 - ease((c - 3.5) / 1.4);
  };

  const playBtn = document.querySelector('[data-name="play"]');
  const setPlaying = (on) => { playing = on; playBtn.textContent = on ? 'Pause' : 'Play'; playBtn.setAttribute('aria-pressed', String(on)); };
  setPlaying(playing);
  HUD.set('progress', progress);
  HUD.on('progress', (v) => { progress = v; setPlaying(false); });
  HUD.on('play', () => { if (!playing) clock = progress >= 0.5 ? 2.1 : 0.7; setPlaying(!playing); });
  HUD.set('strength', fx.params.strength);
  HUD.on('strength', (v) => { fx.params.strength = v; });

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width === w && canvas.height === h) return;
    canvas.width = w;
    canvas.height = h;
    fx.resize(w, h);
  }
  const drawScene = (target, which, time) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb);
    gl.viewport(0, 0, target.w, target.h);
    gl.useProgram(prog);
    gl.uniform2f(U('uRes'), target.w, target.h);
    gl.uniform1f(U('uTime'), time);
    gl.uniform1i(U('uScene'), which);
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

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
    // only the pictures that can be on screen are drawn
    if (progress < 0.9) drawScene(fx.from, 0, time);
    if (progress > 0.1) drawScene(fx.to, 1, time);
    fx.render(progress, time);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
