/* Vogel disk blur for WebGL2, the way the site blurs its background behind the cases:
   the scene is drawn at half resolution, blurred at quarter resolution with 16 samples on a Vogel spiral,
   and the final pass reads it back with one bilinear sample.

     const blur = createVogelBlur(gl);       // a WebGL2 context
     blur.resize(width, height);             // allocates blur.scene (half size, linear HDR) and the blur target
     ...draw the scene into blur.scene.fb...
     blur.render(null);                      // blur, then show on the screen

   Classic script, defines window.createVogelBlur. As an ES module: replace the last line with
   `export { createVogelBlur };`. */
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
    'present.frag': `#version 300 es
precision highp float;
// Shows the blurred HDR buffer: a bilinear upscale from quarter resolution, tone curve, sRGB, vignette.
uniform sampler2D tInput;
in vec2 vUv;
out vec4 fragColor;

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
  vec3 c = toSrgb(toneCurve(texture(tInput, vUv).rgb));
  vec2 q = vUv - 0.5;
  fragColor = vec4(c * (1.0 - dot(q, q) * 0.55), 1.0);
}
`,
    'vogel-blur.frag': `#version 300 es
precision highp float;
// Disk blur on a Vogel spiral. Sample k is turned by the golden angle from the previous one and sits at
// sqrt((k + 0.5) / N) of the radius, so N samples cover the disk evenly, the centre included.
// The whole spiral is turned by per-pixel noise: with few samples the leftover pattern becomes fine grain.
// For comparison, left of uSplit: the older version, all samples on two rings (R and 0.49 R).
// A small bright point then spreads into a ring with an empty middle — a "donut".
uniform sampler2D tInput;   // linear HDR
uniform float uR;           // radius in frame-height units (site: up to 0.016)
uniform float uAspect;      // width / height
uniform int uCount;         // samples (site: 16)
uniform float uRotate;      // 1 — turn the pattern per pixel, 0 — the same pattern everywhere
uniform float uSplit;       // left of this x: two rings; -1 — the spiral everywhere
in vec2 vUv;
out vec4 fragColor;

// Interleaved gradient noise (Jorge Jimenez, 2014)
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }

void main() {
  float rot = ign(gl_FragCoord.xy) * 6.2831 * uRotate;
  float n = float(uCount);
  bool rings = vUv.x < uSplit;
  vec3 acc = vec3(0.0);
  for (int k = 0; k < uCount; k++) {
    float a, r;
    if (rings) {
      a = float(k) * 6.2831 / n + rot;
      r = k % 2 == 0 ? uR : uR * 0.49;
    } else {
      a = float(k) * 2.39996 + rot;                 // golden angle
      r = uR * sqrt((float(k) + 0.5) / n);
    }
    // textureLod: no mipmaps here, and no implicit derivatives inside the loop
    acc += textureLod(tInput, vUv + vec2(cos(a) * r / uAspect, sin(a) * r), 0.0).rgb;
  }
  fragColor = vec4(acc / n, 1.0);
}
`
  };
  // End of shaders.

  function createVogelBlur(gl, options = {}) {
    const params = Object.assign({
      radius: 0.016,   // frame-height units; the site's maximum
      count: 16,       // samples
      rotate: true,    // per-pixel noise rotation of the pattern
      quarter: true,   // blur at quarter resolution (false — at the scene's resolution)
      split: -1        // x (0..1) left of which the two-ring version is drawn, for comparison; -1 — off
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
    const program = (frag) => {
      const p = gl.createProgram();
      gl.attachShader(p, compile(gl.VERTEX_SHADER, SHADERS['fullscreen.vert']));
      gl.attachShader(p, compile(gl.FRAGMENT_SHADER, SHADERS[frag]));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'program');
      const cache = {};
      return { p, u: (name) => (name in cache ? cache[name] : (cache[name] = gl.getUniformLocation(p, name))) };
    };
    const target = (w, h) => {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texStorage2D(gl.TEXTURE_2D, 1, hdr ? gl.RGBA16F : gl.RGBA8, w, h);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      return { fb, tex, w, h };
    };
    const free = (t) => { if (t) { gl.deleteFramebuffer(t.fb); gl.deleteTexture(t.tex); } };
    const blurProg = program('vogel-blur.frag');
    const showProg = program('present.frag');
    const T = { scene: null, quarter: null, full: null };
    let W = 1, H = 1;

    const pass = (prog, dst, src, set) => {
      gl.useProgram(prog.p);
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst ? dst.fb : null);
      gl.viewport(0, 0, dst ? dst.w : gl.drawingBufferWidth, dst ? dst.h : gl.drawingBufferHeight);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, src.tex);
      gl.uniform1i(prog.u('tInput'), 0);
      if (set) set(prog.u);
      gl.bindVertexArray(vao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    return {
      params,
      get scene() { return T.scene; },
      resize(w, h) {
        W = Math.max(1, Math.round(w));
        H = Math.max(1, Math.round(h));
        Object.values(T).forEach(free);
        // under a blur, full-size detail is invisible: half the size for the scene, a quarter for the blur
        T.scene = target(Math.ceil(W / 2), Math.ceil(H / 2));
        T.quarter = target(Math.ceil(W / 4), Math.ceil(H / 4));
        T.full = target(T.scene.w, T.scene.h);
      },
      render(dst = null) {
        const out = params.quarter ? T.quarter : T.full;
        pass(blurProg, out, T.scene, (u) => {
          gl.uniform1f(u('uR'), params.radius);
          gl.uniform1f(u('uAspect'), W / H);
          gl.uniform1i(u('uCount'), params.count);
          gl.uniform1f(u('uRotate'), params.rotate ? 1 : 0);
          gl.uniform1f(u('uSplit'), params.split);
        });
        pass(showProg, dst, out);
      },
      dispose() {
        Object.values(T).forEach(free);
        gl.deleteProgram(blurProg.p);
        gl.deleteProgram(showProg.p);
        gl.deleteVertexArray(vao);
      }
    };
  }

  window.createVogelBlur = createVogelBlur;
})();
