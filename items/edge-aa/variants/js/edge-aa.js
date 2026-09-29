/* Edge smoothing pass for WebGL2, our own "along the edge" method: for quality steps that render without
   MSAA. On the site: full strength without MSAA, half with MSAA 2×, off with MSAA 4×.

     const aa = createEdgeAA(gl);           // a WebGL2 context
     aa.resize(width, height);              // allocates aa.scene, a linear HDR target
     ...draw the scene into aa.scene.fb...
     aa.render(null);                       // smoothing + tone curve + sRGB, to the screen

   params: strength (0..1), split (0..1, raw left of it), view (0 picture, 1 edge map),
   loupe ([x, y, radius] in buffer pixels, radius 0 — off), zoom.
   Classic script, defines window.createEdgeAA. As an ES module: replace the last line with
   `export { createEdgeAA };`. */
(function () {
  // Shaders — the same files as the GLSL variant.
  const SHADERS = {
    'edge-aa.frag': `#version 300 es
precision highp float;
// Edge smoothing after the render, for quality steps without MSAA. Without it a one-pixel grass blade on a
// DPR 1 screen is drawn as a staircase and shimmers in the wind.
// Our own method, "along the edge":
//   1. read the pixel's 3×3 neighbourhood exactly (texelFetch); flat places leave after the cross;
//   2. find the way the edge runs: across a step the brightness gradient is large, across a thin line the
//      gradient in the middle vanishes but the curvature (second derivatives) is large — the stronger decides;
//   3. average four taps along the edge; nearly horizontal or vertical edges reach further, their steps are longer;
//   4. keep the result inside the neighbourhood's colour range, so nothing new appears and there are no halos.
// Brightness goes through a square root: the buffer is linear HDR, and the edge must be found the way the eye sees it.
uniform sampler2D tScene;   // linear HDR, LINEAR filtering (the taps along the edge fall between pixels)
uniform vec2 uTexel;        // 1 / buffer size
uniform float uEdgeAA;      // 0 — off, 0.5 — with MSAA 2×, 1 — without MSAA
// demo only: comparison, edge map, loupe
uniform float uSplit;       // left of this x the frame stays raw; 0 — smoothing everywhere
uniform int uView;          // 0 — picture, 1 — which pixels were touched
uniform vec3 uLoupe;        // centre in pixels, radius in pixels (0 — no loupe)
uniform float uZoom;
in vec2 vUv;
out vec4 fragColor;

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

float aaLuma(vec3 c) { return sqrt(dot(min(c, vec3(1.0)), LUMA)); }
vec3 tap(ivec2 q) { return texelFetch(tScene, clamp(q, ivec2(0), textureSize(tScene, 0) - 1), 0).rgb; }

vec3 alongEdge(vec2 uv, vec3 c, out float touched) {
  touched = 0.0;
  ivec2 p = ivec2(uv / uTexel);
  vec3 n = tap(p + ivec2(0, 1)), s = tap(p - ivec2(0, 1)), e = tap(p + ivec2(1, 0)), w = tap(p - ivec2(1, 0));
  float lc = aaLuma(c), ln = aaLuma(n), ls = aaLuma(s), le = aaLuma(e), lw = aaLuma(w);
  float lo = min(lc, min(min(ln, ls), min(le, lw)));
  float hi = max(lc, max(max(ln, ls), max(le, lw)));
  // a softer gate in bright places: the eye needs more contrast there to see a step
  float gate = 0.025 + 0.12 * hi;
  if (hi - lo < gate) return c;
  vec3 ne = tap(p + ivec2(1, 1)), nw = tap(p + ivec2(-1, 1)), se = tap(p + ivec2(1, -1)), sw = tap(p + ivec2(-1, -1));
  float lne = aaLuma(ne), lnw = aaLuma(nw), lse = aaLuma(se), lsw = aaLuma(sw);
  // brightness gradient with 1-2-1 weights: points across a step between two areas
  vec2 grad = 0.25 * vec2(lne + 2.0 * le + lse - lnw - 2.0 * lw - lsw, lnw + 2.0 * ln + lne - lsw - 2.0 * ls - lse);
  // curvature: the second derivatives form a 2×2 matrix; its stronger eigenvector points across a thin line
  float hxx = le + lw - 2.0 * lc, hyy = ln + ls - 2.0 * lc, hxy = 0.25 * (lne + lsw - lnw - lse);
  float mid = 0.5 * (hxx + hyy), spread = sqrt(0.25 * (hxx - hyy) * (hxx - hyy) + hxy * hxy);
  float bend = abs(mid + spread) > abs(mid - spread) ? mid + spread : mid - spread;
  vec2 acrossLine = abs(hxy) > 1e-4 ? vec2(bend - hyy, hxy) : (abs(hxx) > abs(hyy) ? vec2(1.0, 0.0) : vec2(0.0, 1.0));
  vec2 across = length(grad) >= 0.5 * abs(bend) ? grad : acrossLine;
  float len = length(across);
  if (len < 1e-4) return c;
  vec2 along = vec2(-across.y, across.x) / len;
  // a nearly horizontal or vertical edge breaks into long steps: reach further along it
  float axial = max(abs(along.x), abs(along.y));
  vec2 t = along * uTexel * mix(1.0, 2.25, smoothstep(0.92, 0.995, axial));
  vec3 sum = 0.2 * c
    + 0.25 * (textureLod(tScene, uv + 0.6 * t, 0.0).rgb + textureLod(tScene, uv - 0.6 * t, 0.0).rgb)
    + 0.15 * (textureLod(tScene, uv + 1.5 * t, 0.0).rgb + textureLod(tScene, uv - 1.5 * t, 0.0).rgb);
  vec3 cmin = min(min(min(c, n), min(s, e)), min(min(w, ne), min(nw, min(se, sw))));
  vec3 cmax = max(max(max(c, n), max(s, e)), max(max(w, ne), max(nw, max(se, sw))));
  touched = 1.0;
  return mix(c, clamp(sum, cmin, cmax), uEdgeAA * smoothstep(gate, 2.0 * gate, hi - lo));
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
  // inside the loupe each screen pixel shows the buffer pixel under it, enlarged without filtering
  vec2 frag = gl_FragCoord.xy;
  vec2 d = frag - uLoupe.xy;
  float inLoupe = step(length(d), uLoupe.z);
  vec2 px = inLoupe > 0.5 ? floor(uLoupe.xy + d / uZoom) + 0.5 : frag;
  vec2 uv = px * uTexel;
  vec3 m = textureLod(tScene, uv, 0.0).rgb;
  float touched = 0.0;
  vec3 c = uv.x >= uSplit && uEdgeAA > 0.001 ? alongEdge(uv, m, touched) : m;
  c = toSrgb(toneCurve(c));
  if (uView == 1) c = mix(c * 0.25, vec3(1.0, 0.36, 0.2), touched);
  // the loupe's rim
  float ring = abs(length(d) - uLoupe.z);
  c = mix(c, vec3(1.0), smoothstep(1.6, 0.4, ring) * step(0.5, uLoupe.z));
  fragColor = vec4(c, 1.0);
}
`,
    'fullscreen.vert': `#version 300 es
// One triangle over the whole screen; no vertex buffer: draw 3 vertices with an empty VAO.
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`
  };
  // End of shaders.

  function createEdgeAA(gl, options = {}) {
    const params = Object.assign({ strength: 1, split: 0, view: 0, loupe: [0, 0, 0], zoom: 8 }, options);
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
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, SHADERS['edge-aa.frag']));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || 'program');
    const U = {};
    const u = (name) => (name in U ? U[name] : (U[name] = gl.getUniformLocation(prog, name)));
    let scene = null;

    const free = () => { if (scene) { gl.deleteFramebuffer(scene.fb); gl.deleteTexture(scene.tex); } };
    return {
      params,
      get scene() { return scene; },
      resize(w, h) {
        free();
        w = Math.max(1, Math.round(w));
        h = Math.max(1, Math.round(h));
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texStorage2D(gl.TEXTURE_2D, 1, hdr ? gl.RGBA16F : gl.RGBA8, w, h);
        // LINEAR on purpose: the taps along the edge fall between pixels
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        const fb = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        scene = { fb, tex, w, h };
      },
      render(dst = null) {
        gl.useProgram(prog);
        gl.bindFramebuffer(gl.FRAMEBUFFER, dst ? dst.fb : null);
        gl.viewport(0, 0, scene.w, scene.h);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, scene.tex);
        gl.uniform1i(u('tScene'), 0);
        gl.uniform2f(u('uTexel'), 1 / scene.w, 1 / scene.h);
        gl.uniform1f(u('uEdgeAA'), params.strength);
        gl.uniform1f(u('uSplit'), params.split);
        gl.uniform1i(u('uView'), params.view);
        gl.uniform3f(u('uLoupe'), params.loupe[0], params.loupe[1], params.loupe[2]);
        gl.uniform1f(u('uZoom'), params.zoom);
        gl.bindVertexArray(vao);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      },
      dispose() {
        free();
        gl.deleteProgram(prog);
        gl.deleteVertexArray(vao);
      }
    };
  }

  window.createEdgeAA = createEdgeAA;
})();
