/* Glitch transition for WebGL2: bands jump sideways, some turn into pixel blocks, the shifted ones split into
   colour channels, and the picture is cut at the peak, where the glitch hides the seam.

     const fx = createGlitchTransition(gl);   // a WebGL2 context
     fx.resize(width, height);                // allocates fx.from and fx.to, two linear HDR targets
     ...draw picture A into fx.from.fb and picture B into fx.to.fb...
     fx.render(progress, time);               // 0 → A, 1 → B; time in seconds drives the jerks

   Classic script, defines window.createGlitchTransition. As an ES module: replace the last line with
   `export { createGlitchTransition };`. */
(function () {
  // Shaders — the same files as the GLSL variant.
  const SHADERS = {
    'fullscreen.vert': `#version 300 es
// One triangle over the whole screen; no vertex buffer: draw 3 vertices with an empty VAO.
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`,
    'glitch-bands.frag': `#version 300 es
precision highp float;
// Glitch transition between two pictures. Horizontal bands of random height jump sideways, some of them turn
// into big pixel blocks, and every shifted band splits into colour channels. Everything changes in jerks:
// uSeed is an integer that ticks 18 times a second and with the progress, so the bands jump rather than float.
// The picture switches at the peak, when the glitch hides the cut; glitched bands may switch early or late.
uniform sampler2D tFrom;     // linear HDR
uniform sampler2D tTo;
uniform float uGlitch;       // strength right now, 0..1 (a bell over the progress × the overall strength)
uniform float uSeed;         // integer: floor(time · 18) + floor(progress · 60)
uniform float uProgress;     // 0..1
uniform float uFlash;        // 0..1, cold white balance at the peak
uniform float uFade;         // 1 — reduced motion: a plain crossfade instead of the cut
in vec2 vUv;
out vec4 fragColor;

// Integer hash: xorshift and a multiply by 2^32/phi, twice.
uint hashU(uint x) { x ^= x >> 16; x *= 0x9E3779B9u; x ^= x >> 15; x *= 0x9E3779B9u; x ^= x >> 16; return x; }
float rnd(int a, int b) { return float(hashU(uint(a) ^ hashU(uint(b) + 0x6A09E667u)) >> 8) / 16777216.0; }

vec3 pick(sampler2D t, vec2 uv, float split) {
  vec3 c = texture(t, uv).rgb;
  if (split > 0.0) {
    c.r = texture(t, uv + vec2(split, 0.0)).r;
    c.b = texture(t, uv - vec2(split, 0.0)).b;
  }
  return c;
}

vec3 toneCurve(vec3 c) {
  const float s = 0.72;
  vec3 over = max(c - s, 0.0);
  return min(c, vec3(s)) + (1.0 - s) * (1.0 - exp(-over / (1.0 - s)));
}
vec3 toSrgb(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(pow(c, vec3(0.41666)) * 1.055 - 0.055, c * 12.92, vec3(lessThanEqual(c, vec3(0.0031308))));
}

void main() {
  vec2 uv = vUv;
  float split = 0.0;
  float flip = 0.0;
  int seed = int(uSeed);
  if (uGlitch > 0.001) {
    float rows = mix(14.0, 60.0, rnd(0, seed));                   // 14 to 60 bands, new every jerk
    int band = int(floor(vUv.y * rows));
    float on = step(1.0 - uGlitch * 0.75, rnd(band * 4 + 1, seed)); // at full strength 3 bands of 4 go
    uv.x = fract(uv.x + (rnd(band * 4 + 2, seed) - 0.5) * 0.18 * uGlitch * on);
    // blocks: coarse pixelation in some of the glitched bands (cells 1.6 times wider than tall)
    float px = mix(1.0, 90.0, on * step(0.6, rnd(band * 4 + 3, seed)));
    uv = px > 1.0 ? (floor(uv * vec2(px * 1.6, px)) + 0.5) / vec2(px * 1.6, px) : uv;
    split = (0.004 + 0.02 * on) * uGlitch;
    flip = on * step(0.5, rnd(band * 4 + 4, seed));
  }
  // the cut: at the middle for the frame, earlier or later inside half of the glitched bands
  float toB = abs(step(0.5, uProgress) - flip);
  float w = uFade > 0.5 ? smoothstep(0.35, 0.65, uProgress) : toB;
  vec3 hdr = mix(pick(tFrom, uv, split), pick(tTo, uv, split), w);
  hdr *= mix(vec3(1.0), vec3(0.86, 0.95, 1.12), uFlash);         // cold flash, like a camera losing signal
  vec3 c = toSrgb(toneCurve(hdr));
  vec2 q = vUv - 0.5;
  c *= 1.0 - dot(q, q) * 0.55;
  fragColor = vec4(c, 1.0);
}
`
  };
  // End of shaders.

  /* 0 before a, 1 at b, 0 after c, eased */
  const bell = (x, a, b, c) => {
    if (x <= a || x >= c) return 0;
    const t = x < b ? (x - a) / (b - a) : (c - x) / (c - b);
    return t * t * (3 - 2 * t);
  };

  function createGlitchTransition(gl, options = {}) {
    const params = Object.assign({
      strength: 1,              // the site used 0.32 inside a longer scroll transition: bands only as a hint
      bell: [0.15, 0.5, 0.85],  // where the glitch starts, peaks and ends along the progress
      rate: 18,                 // jerks per second
      reduced: matchMedia('(prefers-reduced-motion: reduce)').matches  // no glitch, a crossfade instead
    }, options);

    const hdr = !!(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));
    const vao = gl.createVertexArray();
    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
      return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, SHADERS['fullscreen.vert']));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, SHADERS['glitch-bands.frag']));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || 'program');
    const U = {};
    const u = (name) => (name in U ? U[name] : (U[name] = gl.getUniformLocation(prog, name)));

    const target = (w, h) => {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texStorage2D(gl.TEXTURE_2D, 1, hdr ? gl.RGBA16F : gl.RGBA8, w, h);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      // REPEAT across: a band pushed past the edge comes back from the other side (fract in the shader)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      return { fb, tex, w, h };
    };
    const free = (t) => { if (t) { gl.deleteFramebuffer(t.fb); gl.deleteTexture(t.tex); } };
    let from = null, to = null;

    return {
      params,
      get from() { return from; },
      get to() { return to; },
      resize(w, h) {
        free(from);
        free(to);
        from = target(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
        to = target(from.w, from.h);
      },
      render(progress, time, dst = null) {
        const g = params.reduced ? 0 : bell(progress, params.bell[0], params.bell[1], params.bell[2]);
        gl.useProgram(prog);
        gl.bindFramebuffer(gl.FRAMEBUFFER, dst ? dst.fb : null);
        gl.viewport(0, 0, dst ? dst.w : gl.drawingBufferWidth, dst ? dst.h : gl.drawingBufferHeight);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, from.tex);
        gl.uniform1i(u('tFrom'), 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, to.tex);
        gl.uniform1i(u('tTo'), 1);
        gl.uniform1f(u('uGlitch'), g * params.strength);
        // the seed only takes whole values: the bands jump 18 times a second and as the progress moves
        gl.uniform1f(u('uSeed'), Math.floor(time * params.rate) + Math.floor(progress * 60));
        gl.uniform1f(u('uProgress'), progress);
        gl.uniform1f(u('uFlash'), g);
        gl.uniform1f(u('uFade'), params.reduced ? 1 : 0);
        gl.bindVertexArray(vao);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      },
      dispose() {
        free(from);
        free(to);
        gl.deleteProgram(prog);
        gl.deleteVertexArray(vao);
      }
    };
  }

  window.createGlitchTransition = createGlitchTransition;
})();
