/* Edge AA demo: a scene drawn with hard pixel edges at DPR 1 — wires, a turning wheel, one-pixel grass in the
   wind — the case the pass was made for. Left of the divider the raw frame, right of it the smoothed one;
   the loupe under the pointer shows real pixels, four times larger. */
(function () {
  const SCENE = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform float uWind;
in vec2 vUv;
out vec4 fragColor;

uint hashU(uint x) { x ^= x >> 16; x *= 0x9E3779B9u; x ^= x >> 15; x *= 0x9E3779B9u; x ^= x >> 16; return x; }
float hash1(int i) { return float(hashU(uint(i)) >> 8) / 16777216.0; }
float vnoise1(float x) { float i = floor(x), f = fract(x); return mix(hash1(int(i)), hash1(int(i) + 1), f * f * (3.0 - 2.0 * f)); }

void main() {
  float A = uRes.x / uRes.y, PX = 1.0 / uRes.y;
  vec2 p = (vUv - 0.5) * vec2(A, 1.0);
  // the site's evening sky, the sun low on the right
  float e = p.y * 0.73 + 0.13;
  vec3 col = mix(vec3(0.905, 0.658, 0.323), vec3(0.863, 0.831, 0.723), smoothstep(-0.02, 0.17, e));
  col = mix(col, vec3(0.687, 0.723, 0.687), smoothstep(0.13, 0.40, e));
  col = mix(col, vec3(0.451, 0.533, 0.578), smoothstep(0.34, 0.90, e));
  vec2 sp = p - vec2(0.3 * A, -0.1);
  col += vec3(1.6, 1.15, 0.7) * exp(-dot(sp, sp) * 30.0) * 0.6;
  vec3 ink = vec3(0.02, 0.022, 0.016);

  // three sagging wires, one pixel thick: every slanted line breaks into steps
  float u = p.x / (0.5 * A);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float y = 0.33 - fi * 0.05 - 0.07 * (1.0 - u * u) + u * 0.04 * (fi - 1.0);
    if (abs(p.y - y) < 0.5 * PX) col = ink;
  }
  // a turning wheel: twelve one-pixel spokes and a rim
  vec2 w = p - vec2(0.0, 0.1);
  float r = length(w);
  float a = atan(w.y, w.x) - uTime * 0.2;
  float seg = 6.2831 / 12.0;
  float spoke = abs(mod(a + seg * 0.5, seg) - seg * 0.5) * r;
  if ((r < 0.13 && spoke < 0.5 * PX) || abs(r - 0.13) < 0.6 * PX || r < 0.008) col = ink;

  // grass: blades 2 px wide at the base, under a pixel at the tip, swaying a little
  float ground = -0.3 + (vnoise1(p.x * 4.0) - 0.5) * 0.04;
  const float CELL = 0.006;
  int ci = int(floor(p.x / CELL));
  for (int k = -3; k <= 3; k++) {
    int i = ci + k;
    float x0 = (float(i) + hash1(i * 4 + 1)) * CELL;
    float base = -0.3 + (vnoise1(x0 * 4.0) - 0.5) * 0.04;
    float h = mix(0.05, 0.24, pow(hash1(i * 4 + 2), 1.5));
    float t = (p.y - base) / h;
    if (t < 0.0 || t > 1.0) continue;
    // the tip may move at most two cells sideways: the search window above only looks three cells around
    float lean = ((hash1(i * 4 + 3) - 0.5) * 0.9 + uWind * 0.35 * sin(uTime * 1.3 + x0 * 9.0)) * (0.012 / h);
    float dx = p.x - (x0 + lean * h * t * t);
    if (abs(dx) < mix(1.1, 0.35, t) * PX) col = mix(vec3(0.02, 0.03, 0.01), vec3(0.06, 0.07, 0.025), hash1(i * 4 + 4));
  }
  if (p.y < ground) col = vec3(0.018, 0.024, 0.009);
  fragColor = vec4(col, 1.0);
}`;

  const canvas = document.getElementById('stage');
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance' });
  if (!gl) { document.getElementById('fallback').hidden = false; return; }

  const aa = createEdgeAA(gl, { split: 0.5, zoom: 4 });
  const P = aa.params;
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, '#version 300 es\nout vec2 vUv;\nvoid main(){ vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }'));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, SCENE));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  const U = (n) => gl.getUniformLocation(prog, n);
  const vao = gl.createVertexArray();

  // the divider
  const handle = document.getElementById('split');
  const place = () => { handle.style.left = `${P.split * 100}%`; handle.hidden = P.split <= 0; handle.setAttribute('aria-valuenow', String(Math.round(P.split * 100))); };
  let splitAt = 0.5;
  place();
  let dragging = false;
  handle.addEventListener('pointerdown', (e) => { dragging = true; handle.setPointerCapture(e.pointerId); });
  handle.addEventListener('pointermove', (e) => { if (dragging) { P.split = splitAt = Math.min(0.98, Math.max(0.02, e.clientX / innerWidth)); place(); } });
  handle.addEventListener('pointerup', () => { dragging = false; });
  handle.addEventListener('keydown', (e) => {
    const d = { ArrowLeft: -0.02, ArrowRight: 0.02 }[e.key];
    if (d) { e.preventDefault(); P.split = splitAt = Math.min(0.98, Math.max(0.02, P.split + d)); place(); }
  });

  HUD.on('aa', (v) => { P.strength = { off: 0, half: 0.5, full: 1 }[v]; });
  HUD.on('view', (v) => { P.split = v === 'split' ? splitAt : 0; P.view = v === 'edges' ? 1 : 0; place(); });

  // the loupe follows the pointer (drag on touch); until then it sits on the wheel by the divider
  let loupe = null;
  canvas.addEventListener('pointermove', (e) => { loupe = [e.clientX, e.clientY]; });
  canvas.addEventListener('pointerdown', (e) => { loupe = [e.clientX, e.clientY]; });

  // DPR 1 on purpose: this is the screen the pass exists for. CSS keeps the pixels square on sharper screens.
  function resize() {
    const w = Math.max(1, canvas.clientWidth), h = Math.max(1, canvas.clientHeight);
    if (canvas.width === w && canvas.height === h) return;
    canvas.width = w;
    canvas.height = h;
    aa.resize(w, h);
  }

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const still = new URLSearchParams(location.search).get('play') === '0';
  let last = performance.now(), time = 2;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!still) time += dt;
    resize();
    const W = canvas.width, H = canvas.height;
    const at = loupe || [W * (P.split > 0 ? P.split : 0.5), H * 0.47];
    const radius = Math.round(Math.min(W, H) * 0.14);
    P.loupe = [at[0], H - at[1], Math.max(40, Math.min(110, radius))];
    gl.bindFramebuffer(gl.FRAMEBUFFER, aa.scene.fb);
    gl.viewport(0, 0, W, H);
    gl.useProgram(prog);
    gl.uniform2f(U('uRes'), W, H);
    gl.uniform1f(U('uTime'), time);
    gl.uniform1f(U('uWind'), reduced ? 0.25 : 1);
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    aa.render(null);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
