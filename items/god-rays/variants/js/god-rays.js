/* God rays for WebGL2: the radial-blur technique (Kenny Mitchell, GPU Gems 3, ch. 13), written from scratch.
   HDR scene → mask at quarter resolution → blur toward the sun (0.9) → blur again (0.35) → added before tone mapping.

     const rays = createGodRays(gl);            // a WebGL2 context
     rays.resize(width, height);                // drawing-buffer size; allocates the HDR scene target
     gl.bindFramebuffer(gl.FRAMEBUFFER, rays.scene.fb);
     ...draw the scene in linear HDR: the sun well above 1.0...
     rays.render([sunU, sunV], dt);             // mask + two blur passes
     rays.composite(null);                      // to the screen: scene + rays → tone curve → sRGB

   Classic script, defines window.createGodRays. As an ES module: replace the last line with
   `export { createGodRays };`. */
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
    'rays-blur.frag': `#version 300 es
precision highp float;
// God rays, passes 2 and 3 (quarter resolution): radial blur toward the sun.
// Run twice: a long pass (uStep 0.9) draws the fan, a short one (0.35) smooths the first one's steps.
uniform sampler2D tInput;
uniform vec2 uSun;
uniform float uStep;   // share of the way to the sun that the samples cover
uniform float uDecay;  // weight falloff per sample (site: 0.96)
in vec2 vUv;
out vec4 fragColor;

const int SAMPLES = 36;

// Interleaved gradient noise (Jorge Jimenez, 2014): almost blue noise, no texture needed.
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }

void main() {
  vec2 delta = (uSun - vUv) * uStep / float(SAMPLES);
  // A jittered start turns the visible steps between samples into fine noise.
  vec2 uv = vUv + delta * ign(gl_FragCoord.xy);
  vec3 sum = vec3(0.0);
  float w = 1.0, total = 0.0;
  for (int i = 0; i < SAMPLES; i++) {
    // textureLod: no implicit derivatives inside a loop (ANGLE/D3D otherwise unrolls it with a warning)
    sum += textureLod(tInput, uv, 0.0).rgb * w;
    total += w;
    w *= uDecay;
    uv += delta;
  }
  fragColor = vec4(sum / total, 1.0);
}
`,
    'rays-composite.frag': `#version 300 es
precision highp float;
// God rays, final pass: the rays are added to the HDR frame before tone mapping, so they burn into the
// highlights exactly like the sun does. Then grade, sRGB, vignette and a still grain.
uniform sampler2D tScene;   // linear HDR
uniform sampler2D tRays;    // quarter resolution; a bilinear upscale is enough, the rays are soft anyway
uniform sampler2D tMask;    // debug view only
uniform float uRays;        // strength × fade-out (site: 0.32)
uniform vec3 uRayTint;      // warm tint (site: 1.0, 0.86, 0.66)
uniform float uExposure;
uniform float uVignette;    // site: 0.55
uniform float uGrain;       // site: 0.012
uniform int uView;          // 0 — final, 1 — the mask, 2 — the blurred rays
in vec2 vUv;
out vec4 fragColor;

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }

// Tone curve: straight up to 0.72, then an exponential shoulder that approaches 1.0 without clipping.
vec3 toneCurve(vec3 c) {
  const float s = 0.72;
  vec3 over = max(c - s, 0.0);
  return min(c, vec3(s)) + (1.0 - s) * (1.0 - exp(-over / (1.0 - s)));
}

vec3 toSrgb(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(pow(c, vec3(0.41666)) * 1.055 - 0.055, c * 12.92, vec3(lessThanEqual(c, vec3(0.0031308))));
}

// Contrast in log space around middle grey, the tone curve, then vibrance that spares saturated colours.
vec3 grade(vec3 hdr) {
  vec3 lg = log2(max(hdr, 1e-5) / 0.18);
  hdr = 0.18 * pow(vec3(2.0), lg * 1.06);
  vec3 c = toneCurve(hdr);
  float lum = dot(c, LUMA);
  float sat = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
  c = max(mix(vec3(lum), c, 1.0 + 0.18 * (1.0 - sat)), 0.0);
  return toSrgb(c);
}

void main() {
  vec3 hdr;
  if (uView == 1) hdr = texture(tMask, vUv).rgb;
  else if (uView == 2) hdr = texture(tRays, vUv).rgb * uRayTint;
  else hdr = texture(tScene, vUv).rgb + texture(tRays, vUv).rgb * uRayTint * uRays;
  vec3 c = grade(hdr * uExposure);
  vec2 q = vUv - 0.5;
  c *= 1.0 - dot(q, q) * uVignette;
  // still grain on IGN: removes banding in the sky gradient and does not flicker
  c += (ign(gl_FragCoord.xy) - 0.5) * uGrain;
  fragColor = vec4(c, 1.0);
}
`,
    'rays-mask.frag': `#version 300 es
precision highp float;
// God rays, pass 1 of 3 (quarter resolution): what the rays are made of.
// Only the bright part of the frame near the sun gets in, its halo and disc. A white sky (~0.9 in linear HDR)
// stays out, otherwise every bright cloud would start a fan of its own.
uniform sampler2D tColor;      // the scene, linear HDR
uniform vec2 uSun;             // the sun in screen UV; may lie outside 0..1
uniform float uAspect;         // width / height
uniform float uHalo;           // halo falloff around the sun: smaller reaches further (site: 5)
uniform float uLumLo, uLumHi;  // luminance window that enters the mask (site: 0.85, 2.2)
in vec2 vUv;
out vec4 fragColor;

void main() {
  vec3 c = texture(tColor, vUv).rgb;
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  vec2 d = (vUv - uSun) * vec2(uAspect, 1.0);
  // A wide halo matters when the sun sits past the frame edge: its fan still falls into the frame.
  float near = exp(-dot(d, d) * uHalo);
  fragColor = vec4(c * near * smoothstep(uLumLo, uLumHi, lum), 1.0);
}
`
  };
  // End of shaders.

  const smoothstep = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };

  function createGodRays(gl, options = {}) {
    const params = Object.assign({
      enabled: true,
      strength: 0.32,           // the site's value: a warm haze, not searchlights
      halo: 5,                  // mask falloff around the sun (?rayshalo= on the site)
      lumLo: 0.85, lumHi: 2.2,  // luminance window of the mask (?raysmask=lo,hi)
      decay: 0.96,              // weight falloff per blur sample
      tint: [1.0, 0.86, 0.66],
      fade: [1.6, 2.7],         // how far past the frame the sun may go (NDC) before the rays fade (?raysoff=a,b)
      exposure: 1, vignette: 0.55, grain: 0.012,
      view: 0                   // 0 — final, 1 — mask, 2 — blurred rays
    }, options);

    // Half-float targets keep the sun above 1.0. Without them the rays still work, only weaker.
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

    const mask = program('rays-mask.frag');
    const blur = program('rays-blur.frag');
    const comp = program('rays-composite.frag');
    const T = { scene: null, mask: null, a: null, b: null };
    let W = 1, H = 1, visible = 1;

    const pass = (prog, dst, textures, set) => {
      gl.useProgram(prog.p);
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst ? dst.fb : null);
      gl.viewport(0, 0, dst ? dst.w : gl.drawingBufferWidth, dst ? dst.h : gl.drawingBufferHeight);
      Object.keys(textures).forEach((name, i) => {
        gl.activeTexture(gl.TEXTURE0 + i);
        gl.bindTexture(gl.TEXTURE_2D, textures[name]);
        gl.uniform1i(prog.u(name), i);
      });
      set(prog.u);
      gl.bindVertexArray(vao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    return {
      params,
      get hdr() { return hdr; },
      get visible() { return visible; },
      get scene() { return T.scene; },
      resize(w, h) {
        W = Math.max(1, Math.round(w));
        H = Math.max(1, Math.round(h));
        Object.values(T).forEach(free);
        T.scene = target(W, H);
        // The rays are soft anyway: a quarter of the resolution each way is enough.
        const qw = Math.max(1, Math.round(W / 4)), qh = Math.max(1, Math.round(H / 4));
        T.mask = target(qw, qh);
        T.a = target(qw, qh);
        T.b = target(qw, qh);
      },
      /* sun: [u, v] in screen UV, may be outside 0..1; inFront: false when the sun is behind the camera */
      render(sun, dt = 1 / 60, inFront = true) {
        const off = Math.max(Math.abs(sun[0] * 2 - 1), Math.abs(sun[1] * 2 - 1));
        const goal = params.enabled && inFront ? 1 - smoothstep(params.fade[0], params.fade[1], off) : 0;
        // The site eases 10% a frame at 60 fps; this is the same, whatever the frame rate.
        visible += (goal - visible) * (1 - Math.pow(0.9, dt * 60));
        if (visible < 0.01 && params.view === 0) return;
        pass(mask, T.mask, { tColor: T.scene.tex }, (u) => {
          gl.uniform2f(u('uSun'), sun[0], sun[1]);
          gl.uniform1f(u('uAspect'), W / H);
          gl.uniform1f(u('uHalo'), params.halo);
          gl.uniform1f(u('uLumLo'), params.lumLo);
          gl.uniform1f(u('uLumHi'), params.lumHi);
        });
        for (const [src, dst, step] of [[T.mask, T.a, 0.9], [T.a, T.b, 0.35]]) {
          pass(blur, dst, { tInput: src.tex }, (u) => {
            gl.uniform2f(u('uSun'), sun[0], sun[1]);
            gl.uniform1f(u('uStep'), step);
            gl.uniform1f(u('uDecay'), params.decay);
          });
        }
      },
      composite(dst = null) {
        pass(comp, dst, { tScene: T.scene.tex, tRays: T.b.tex, tMask: T.mask.tex }, (u) => {
          gl.uniform1f(u('uRays'), params.strength * visible);
          gl.uniform3f(u('uRayTint'), params.tint[0], params.tint[1], params.tint[2]);
          gl.uniform1f(u('uExposure'), params.exposure);
          gl.uniform1f(u('uVignette'), params.vignette);
          gl.uniform1f(u('uGrain'), params.grain);
          gl.uniform1i(u('uView'), params.view);
        });
      },
      dispose() {
        Object.values(T).forEach(free);
        for (const prog of [mask, blur, comp]) gl.deleteProgram(prog.p);
        gl.deleteVertexArray(vao);
      }
    };
  }

  window.createGodRays = createGodRays;
})();
