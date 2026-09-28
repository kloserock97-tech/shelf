/* Portal door for WebGL2: a glass door with a glowing edge grows in one scene, another scene opens behind it,
   and the camera passes through. The whole timeline is one number, progress 0..1:
     0.00–0.34  the door fades in almost at full size, as frosted glass
     0.16–0.46  the inside opens up behind the glass
     0.46–0.97  the dive: the door grows by the same factor for every equal step, until it fills the screen

     const portal = createPortalDoor(gl);    // a WebGL2 context
     portal.resize(width, height);           // allocates portal.inside and portal.outside, linear HDR targets
     ...draw the far scene into portal.inside.fb and the near one into portal.outside.fb...
     portal.render(progress);                // to the screen; returns { appear, dive } for your camera

   Classic script, defines window.createPortalDoor. As an ES module: replace the last line with
   `export { createPortalDoor };`. */
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
    'portal-door.frag': `#version 300 es
precision highp float;
// Portal door: a glass door stands in one scene, and another scene is behind it.
// The shape is a rounded rectangle in frame-height units (an SDF), so it stays crisp at any size. At the inner
// edge the picture refracts like thick glass: it shifts toward the centre and splits by colour. The edge is a
// thin glowing line with a warm halo, and light spills from the door onto the scene outside.
uniform sampler2D tScene;    // behind the door (inside), linear HDR
uniform sampler2D tPortal;   // around the door (outside), linear HDR
uniform vec2 uTexel;         // 1 / buffer size
uniform vec4 uPortal;        // centre (UV), half-height (share of the frame height), how much of the inside shows 0..1
uniform vec3 uPortal2;       // edge brightness 0..1, corner radius as a share of the half-width, door opacity 0..1
uniform float uRefract;      // 1 — refraction at the inner edge, 0 — a plain cut
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
  vec2 uv = vUv;
  vec3 outside = texture(tPortal, uv).rgb;
  vec3 e = outside;
  if (uPortal.z > 0.0) {
    float asp = uTexel.y / uTexel.x;
    vec2 pp = (uv - uPortal.xy) * vec2(asp, 1.0);
    vec2 hs = vec2(uPortal.z * 0.62, uPortal.z);          // the door is 0.62 as wide as tall
    float rr = hs.x * uPortal2.y;
    vec2 qq = abs(pp) - hs + rr;
    float dd = length(max(qq, 0.0)) + min(max(qq.x, qq.y), 0.0) - rr;   // < 0 inside
    float aa = uTexel.y * 1.5;
    float inside = 1.0 - smoothstep(-aa, aa, dd);
    // refraction along the inner edge: a band 4% of the frame height
    float band = 1.0 - smoothstep(0.0, 0.04, -dd);
    vec2 nrm = normalize(pp + 1e-5) / vec2(asp, 1.0);
    vec2 off = -nrm * band * band * 0.018 * uRefract;
    vec3 inner = vec3(texture(tScene, uv + off * 1.25).r, texture(tScene, uv + off).g, texture(tScene, uv + off * 0.75).b);
    // while the door is still appearing it is frosted glass over the outside; then the inside opens up
    vec3 glass = outside * 1.12 + vec3(0.06, 0.05, 0.035);
    inner = mix(glass, inner, uPortal.w);
    // a soft diagonal glare on the glass, top left
    vec2 lp = (pp + hs) / (2.0 * hs);
    inner += vec3(1.0, 0.95, 0.85) * 0.07 * smoothstep(0.55, 0.0, lp.x + (1.0 - lp.y) * 0.6) * uPortal2.x;
    vec3 door = mix(outside, inner, inside);
    // the edge: a line about two pixels wide, a halo outside it, and light spilling onto the scene
    float rim = exp(-abs(dd) / (uTexel.y * 2.2)) * 1.6 + exp(-max(dd, 0.0) * 14.0) * 0.22 * step(0.0, dd);
    float spill = exp(-max(dd, 0.0) * 3.5) * 0.12 * uPortal.w * step(0.0, dd);
    door += vec3(1.0, 0.9, 0.72) * (rim * uPortal2.x + spill);
    // the door fades in from transparency instead of popping up
    e = mix(outside, door, uPortal2.z);
  }
  vec3 c = toSrgb(toneCurve(e));
  vec2 q = vUv - 0.5;
  c *= 1.0 - dot(q, q) * 0.55;
  fragColor = vec4(c, 1.0);
}
`
  };
  // End of shaders.

  const sm = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };

  function createPortalDoor(gl, options = {}) {
    const params = Object.assign({ corner: 0.14, refract: true }, options);
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
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, SHADERS['portal-door.frag']));
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
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      return { fb, tex, w, h };
    };
    const free = (t) => { if (t) { gl.deleteFramebuffer(t.fb); gl.deleteTexture(t.tex); } };
    let inside = null, outside = null;

    return {
      params,
      get inside() { return inside; },
      get outside() { return outside; },
      resize(w, h) {
        free(inside);
        free(outside);
        inside = target(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
        outside = target(inside.w, inside.h);
      },
      render(k, dst = null) {
        const appear = sm(0.0, 0.34, k);
        const dive = sm(0.46, 0.97, k);
        // the door grows slowly while it is being looked at, then exponentially: an even camera move, no jerk at the end
        const h = (0.22 + 0.08 * appear + 0.04 * sm(0.2, 0.5, k)) * Math.exp(2.2 * dive);
        gl.useProgram(prog);
        gl.bindFramebuffer(gl.FRAMEBUFFER, dst ? dst.fb : null);
        gl.viewport(0, 0, dst ? dst.w : gl.drawingBufferWidth, dst ? dst.h : gl.drawingBufferHeight);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, inside.tex);
        gl.uniform1i(u('tScene'), 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, outside.tex);
        gl.uniform1i(u('tPortal'), 1);
        gl.uniform2f(u('uTexel'), 1 / inside.w, 1 / inside.h);
        gl.uniform4f(u('uPortal'), 0.5, 0.52 - 0.02 * dive, k > 0.001 ? h : 0, sm(0.16, 0.46, k));
        gl.uniform3f(u('uPortal2'), appear * (1 - sm(0.78, 0.97, k)), params.corner, sm(0.0, 0.26, k));
        gl.uniform1f(u('uRefract'), params.refract ? 1 : 0);
        gl.bindVertexArray(vao);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        return { appear, dive };
      },
      dispose() {
        free(inside);
        free(outside);
        gl.deleteProgram(prog);
        gl.deleteVertexArray(vao);
      }
    };
  }

  window.createPortalDoor = createPortalDoor;
})();
