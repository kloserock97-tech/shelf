/* Edge smoothing pass for WebGL2 (FXAA-like, written from scratch): for quality steps that render without
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
// The FXAA idea, written from scratch: four diagonal samples give the direction of the edge by brightness,
// and the pixel is averaged along it. Brightness goes through a square root: the buffer is linear HDR, and
// the edge must be found the way the eye sees it. Flat areas cost four extra samples, edges eight.
uniform sampler2D tScene;   // linear HDR, LINEAR filtering (the diagonal samples fall between pixels)
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

float edgeLuma(vec3 c) { return sqrt(dot(min(c, vec3(1.0)), LUMA)); }

vec3 edgeAA(vec2 uv, vec3 m, out float touched) {
  touched = 0.0;
  vec3 nw = textureLod(tScene, uv + vec2(-0.5, -0.5) * uTexel, 0.0).rgb;
  vec3 ne = textureLod(tScene, uv + vec2(0.5, -0.5) * uTexel, 0.0).rgb;
  vec3 sw = textureLod(tScene, uv + vec2(-0.5, 0.5) * uTexel, 0.0).rgb;
  vec3 se = textureLod(tScene, uv + vec2(0.5, 0.5) * uTexel, 0.0).rgb;
  float lM = edgeLuma(m), lNW = edgeLuma(nw), lNE = edgeLuma(ne), lSW = edgeLuma(sw), lSE = edgeLuma(se);
  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
  float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
  // not an edge: the contrast is low, in absolute terms or next to the brightest neighbour
  if (lMax - lMin < max(0.03, lMax * 0.1)) return m;
  touched = 1.0;
  vec2 dir = vec2((lSW + lSE) - (lNW + lNE), (lNW + lSW) - (lNE + lSE));
  float damp = max((lNW + lNE + lSW + lSE) * 0.03, 0.008);
  dir = clamp(dir / (min(abs(dir.x), abs(dir.y)) + damp), vec2(-6.0), vec2(6.0)) * uTexel;
  vec3 near = 0.5 * (textureLod(tScene, uv - dir * 0.1667, 0.0).rgb + textureLod(tScene, uv + dir * 0.1667, 0.0).rgb);
  vec3 far = 0.5 * near + 0.25 * (textureLod(tScene, uv - dir * 0.5, 0.0).rgb + textureLod(tScene, uv + dir * 0.5, 0.0).rgb);
  // the long average left the local range: it ran into another edge, so keep the short one
  float lF = edgeLuma(far);
  return mix(m, (lF < lMin || lF > lMax) ? near : far, uEdgeAA);
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
  vec3 c = uv.x >= uSplit && uEdgeAA > 0.001 ? edgeAA(uv, m, touched) : m;
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
        // LINEAR on purpose: the four diagonal samples sit on pixel corners and average four pixels each
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
