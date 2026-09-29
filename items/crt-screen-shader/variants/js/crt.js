/* CRT tube over any picture: plain WebGL2, no libraries.
   const crt = createCrt(canvas, picture);    // picture: a canvas, an image or a video
   crt.params.curve = 0.2;                     // see DEFAULTS
   crt.render(seconds, { upload: true });      // upload: the picture changed since the last frame
   The same shader as variants/glsl/crt.frag. */

/** The values of the original screen: a nearly flat 2000s monitor, the effect barely there. */
export const DEFAULTS = {
  curve: 0.1, corner: 0.035, chroma: 0.004, scan: 0.035, scanCount: 640, flicker: 0.008,
  vignette: 0.72, vignetteSoft: 0.5, static: 0,
};

const VERTEX = `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = vec2(p.x, 1.0 - p.y);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D uImage;
uniform float uTime, uCurve, uCorner, uChroma, uScan, uScanCount, uFlicker, uVignette, uVignetteSoft, uAspect, uStatic;
in vec2 vUv;
out vec4 outColor;
// Hash Kit (our own hash, see shelf/items/hash-kit): cells in, 0…1 out
uint hashU(uint x) { x ^= x >> 16; x *= 0x3f9c86cbu; x ^= x >> 14; x *= 0x1ae9dacfu; x ^= x >> 15; return x; }
float hash21(vec2 p) { uvec2 q = uvec2(ivec2(floor(p))); return float(hashU(q.x + hashU(q.y + 0xb31c96c9u)) >> 8) * (1.0 / 16777216.0); }
float hash31(vec3 p) { uvec3 q = uvec3(ivec3(floor(p))); return float(hashU(q.x + hashU(q.y + hashU(q.z + 0xb31c96c9u))) >> 8) * (1.0 / 16777216.0); }
void main() {
  vec2 c = vUv - 0.5;
  /* the bulge: a quadratic term plus a weak quartic one, so the edges bend more than the middle */
  float r2 = dot(c, c);
  vec2 w = 0.5 + c * (1.0 + uCurve * r2 * (1.0 + 1.6 * r2));
  /* the tube is a superellipse: no straight sides with rounded corners, the edge fades out smoothly */
  vec2 p = (w - 0.5) * 2.0;
  float n = clamp(0.9 / max(uCorner, 0.01), 4.0, 40.0);
  float shape = pow(pow(abs(p.x), n) + pow(abs(p.y), n), 1.0 / n);
  float d = (shape - 1.0) * 0.5;
  if (d > 0.004) discard;
  /* interference: rows jump sideways in bands */
  vec2 s = w;
  if (uStatic > 0.001) {
    float jump = hash21(vec2(floor(w.y * 34.0), floor(uTime * 24.0)));
    s.x += (jump - 0.5) * 0.12 * uStatic * step(0.5, jump);
  }
  /* channels drift outwards along the radius, more towards the rim */
  vec2 spread = c * (0.0016 + r2 * uChroma * 2.0);
  vec3 col = vec3(texture(uImage, s + spread).r, texture(uImage, s).g, texture(uImage, s - spread).b);
  if (uStatic > 0.001) {
    float snow = hash31(vec3(floor(w * vec2(300.0, 280.0)), floor(uTime * 30.0)));
    col = mix(col, vec3(snow * 0.9), uStatic * 0.6);
  }
  /* scanlines: narrow dark gaps between bright rows, not an even sine */
  float row = abs(fract(w.y * uScanCount / 6.2831853) - 0.5) * 2.0;
  col *= 1.0 - uScan * 1.6 * smoothstep(0.55, 1.0, row);
  /* flicker from two unrelated frequencies */
  col *= 1.0 + (sin(uTime * 9.7) * 0.6 + sin(uTime * 23.3) * 0.4) * uFlicker;
  /* vignette along the ellipse of the screen */
  float ell = length((w - 0.5) * vec2(1.0, 1.0 / max(uAspect, 0.01)) * 1.08);
  col *= 1.0 - smoothstep(uVignette - uVignetteSoft, uVignette + uVignetteSoft, ell);
  col *= 1.0 - smoothstep(-0.004, 0.004, d);
  outColor = vec4(col, 1.0);
}`;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || "CRT shader did not compile");
  return shader;
}

export function createCrt(canvas, picture) {
  const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false });
  if (!gl) throw new Error("WebGL2 is not available");
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || "CRT program did not link");
  const names = ["uImage", "uTime", "uCurve", "uCorner", "uChroma", "uScan", "uScanCount", "uFlicker", "uVignette", "uVignetteSoft", "uAspect", "uStatic"];
  const at = Object.fromEntries(names.map((name) => [name, gl.getUniformLocation(program, name)]));
  const vao = gl.createVertexArray();
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  let uploaded = false;
  const params = { ...DEFAULTS };

  /** keeps the drawing buffer at the canvas size on screen */
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(canvas.clientWidth * dpr)), height = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  }

  function render(time, { upload = true } = {}) {
    resize();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    if (upload || !uploaded) { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, picture); uploaded = true; }
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);
    gl.uniform1i(at.uImage, 0);
    gl.uniform1f(at.uTime, time);
    gl.uniform1f(at.uCurve, params.curve);
    gl.uniform1f(at.uCorner, params.corner);
    gl.uniform1f(at.uChroma, params.chroma);
    gl.uniform1f(at.uScan, params.scan);
    gl.uniform1f(at.uScanCount, params.scanCount);
    gl.uniform1f(at.uFlicker, params.flicker);
    gl.uniform1f(at.uVignette, params.vignette);
    gl.uniform1f(at.uVignetteSoft, params.vignetteSoft);
    gl.uniform1f(at.uAspect, canvas.width / canvas.height);
    gl.uniform1f(at.uStatic, params.static);
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function dispose() {
    gl.deleteTexture(texture); gl.deleteVertexArray(vao); gl.deleteProgram(program);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }

  return { params, render, resize, dispose };
}
