/* Vogel Disk Blur demo: a dusk meadow full of small bright flowers and fireflies, the hardest case for a
   blur with few samples. Left of the handle — the older two-ring version, right — the Vogel spiral. */
(function () {
  const SCENE = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uTime;
in vec2 vUv;
out vec4 fragColor;

uint hashU(uint x) { x ^= x >> 16; x *= 0x9E3779B9u; x ^= x >> 15; x *= 0x9E3779B9u; x ^= x >> 16; return x; }
float hash1(int i) { return float(hashU(uint(i)) >> 8) / 16777216.0; }
float hash2(ivec2 p) { return float(hashU(uint(p.x) ^ hashU(uint(p.y) + 0x6A09E667u)) >> 8) / 16777216.0; }
float vnoise1(float x) { float i = floor(x), f = fract(x); return mix(hash1(int(i)), hash1(int(i) + 1), f * f * (3.0 - 2.0 * f)); }

void main() {
  float A = uRes.x / uRes.y, PX = 1.0 / uRes.y;
  vec2 p = (vUv - 0.5) * vec2(A, 1.0);
  // dusk sky from the site's palette, the glow low on the left
  float e = p.y * 0.73 + 0.13;
  vec3 col = mix(vec3(0.694, 0.323, 0.188), vec3(0.546, 0.352, 0.323), smoothstep(-0.02, 0.17, e));
  col = mix(col, vec3(0.184, 0.181, 0.323), smoothstep(0.13, 0.40, e));
  col = mix(col, vec3(0.042, 0.061, 0.162), smoothstep(0.34, 0.90, e));
  col *= 0.8;
  // a dark tree line
  float y0 = -0.06 + (vnoise1(p.x * 5.0) - 0.5) * 0.06 + (vnoise1(p.x * 23.0) - 0.5) * 0.02;
  col = mix(col, vec3(0.012, 0.016, 0.02), clamp((y0 - p.y) / PX + 0.5, 0.0, 1.0));
  // the meadow: darker toward the viewer
  float y1 = -0.12 + (vnoise1(p.x * 2.0 + 4.0) - 0.5) * 0.04;
  vec3 grass = mix(vec3(0.008, 0.012, 0.006), vec3(0.03, 0.035, 0.018), smoothstep(-0.5, y1, p.y));
  col = mix(col, grass, clamp((y1 - p.y) / PX + 0.5, 0.0, 1.0));
  // flowers: small and far near the horizon, bigger in front
  if (p.y < y1) {
    float depth = clamp((y1 - p.y) / 0.4, 0.0, 1.0);
    float scale = mix(170.0, 45.0, depth);
    vec2 g = vec2(p.x, p.y / mix(0.35, 1.0, depth)) * scale;
    ivec2 cell = ivec2(floor(g));
    float h = hash2(cell);
    if (h > 0.9) {
      vec2 at = vec2(cell) + 0.5 + (vec2(hash2(cell + 3), hash2(cell + 11)) - 0.5) * 0.7;
      float k = hash2(cell + 29);
      vec3 petal = k < 0.5 ? vec3(3.2, 3.0, 2.6) : k < 0.8 ? vec3(3.4, 1.6, 2.2) : vec3(3.6, 2.6, 0.9);
      col += petal * smoothstep(0.26, 0.16, length(g - at)) * mix(0.6, 1.0, depth);
    }
  }
  // a garland of warm lights over the tree line: small bright points on a dark ground show a blur's shape best
  float halfW = 0.5 * A;
  float uw = p.x / halfW;
  col = mix(col, vec3(0.01), smoothstep(0.0012, 0.0005, abs(p.y - (0.204 - 0.14 * (1.0 - uw * uw)))) * 0.7);
  for (int i = 0; i < 24; i++) {
    float x = -halfW + (float(i) + 0.5) * (2.0 * halfW / 24.0);
    float u = x / halfW;
    vec2 at = vec2(x, 0.2 - 0.14 * (1.0 - u * u) + sin(uTime * 0.8 + float(i)) * 0.002);
    vec3 bulb = mod(float(i), 3.0) < 1.0 ? vec3(7.0, 4.2, 1.6) : mod(float(i), 3.0) < 2.0 ? vec3(6.0, 5.0, 3.2) : vec3(7.0, 3.0, 2.2);
    col += bulb * smoothstep(0.0045, 0.0025, length(p - at));
  }
  // fireflies drifting above the grass
  for (int i = 0; i < 26; i++) {
    float t = uTime * (0.05 + 0.03 * hash1(i * 7 + 1));
    vec2 f = vec2((hash1(i * 7 + 2) - 0.5) * A + sin(t * 6.28 + hash1(i * 7 + 3) * 6.28) * 0.05,
                  -0.1 - hash1(i * 7 + 4) * 0.3 + sin(t * 9.0 + hash1(i * 7 + 5) * 6.28) * 0.02);
    float blink = 0.5 + 0.5 * sin(uTime * (1.5 + hash1(i * 7 + 6)) + float(i));
    col += vec3(6.0, 4.6, 1.6) * blink * smoothstep(0.004, 0.0015, length(p - f));
  }
  fragColor = vec4(col, 1.0);
}`;

  const canvas = document.getElementById('stage');
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance' });
  if (!gl) { document.getElementById('fallback').hidden = false; return; }

  const q = new URLSearchParams(location.search);
  const blur = createVogelBlur(gl, { radius: 0.03, split: 0.5 });
  const P = blur.params;
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, '#version 300 es\nout vec2 vUv;\nvoid main(){ vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }'));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, SCENE));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  const U = (n) => gl.getUniformLocation(prog, n);
  const vao = gl.createVertexArray();

  HUD.set('radius', P.radius);
  HUD.on('radius', (v) => { P.radius = v; });
  HUD.set('samples', P.count);
  HUD.on('samples', (v) => { P.count = Math.round(v); });
  HUD.on('noise', (v) => { P.rotate = v === 'on'; });
  HUD.on('buffer', (v) => { P.quarter = v === 'quarter'; });

  // the handle between the two halves
  const handle = document.getElementById('split');
  const place = () => { handle.style.left = `${P.split * 100}%`; };
  place();
  let dragging = false;
  const move = (e) => { if (dragging) { P.split = Math.min(0.98, Math.max(0.02, e.clientX / innerWidth)); place(); } };
  handle.addEventListener('pointerdown', (e) => { dragging = true; handle.setPointerCapture(e.pointerId); });
  handle.addEventListener('pointermove', move);
  handle.addEventListener('pointerup', () => { dragging = false; });
  handle.addEventListener('keydown', (e) => {
    const d = { ArrowLeft: -0.02, ArrowRight: 0.02 }[e.key];
    if (d) { e.preventDefault(); P.split = Math.min(0.98, Math.max(0.02, P.split + d)); place(); }
  });

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width === w && canvas.height === h) return;
    canvas.width = w;
    canvas.height = h;
    blur.resize(w, h);
  }

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let last = performance.now(), time = 3;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!reduced && q.get('play') !== '0') time += dt;
    resize();
    gl.bindFramebuffer(gl.FRAMEBUFFER, blur.scene.fb);
    gl.viewport(0, 0, blur.scene.w, blur.scene.h);
    gl.useProgram(prog);
    gl.uniform2f(U('uRes'), blur.scene.w, blur.scene.h);
    gl.uniform1f(U('uTime'), time);
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    blur.render(null);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
