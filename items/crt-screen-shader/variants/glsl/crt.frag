#version 300 es
/* CRT tube over any picture (WebGL2, GLSL ES 3.00).
   A screen shaped as a superellipse, glass that bulges with a quadratic and a small quartic term, colour channels
   that drift apart towards the rim, scanlines with thin dark gaps, a flicker from two unrelated frequencies, an
   elliptical vignette and, on demand, interference: rows jumping sideways in bands under snow. */
precision highp float;

uniform sampler2D uImage;
uniform float uTime;
uniform float uCurve;        // bulge of the glass, 0 = flat (0.1 is a nearly flat 2000s monitor)
uniform float uCorner;       // how round the corners are; the superellipse power is 0.9 / uCorner
uniform float uChroma;       // channel drift towards the rim
uniform float uScan;         // depth of the scanline gaps
uniform float uScanCount;    // scanline frequency
uniform float uFlicker;      // brightness wobble
uniform float uVignette;     // radius of the vignette ellipse
uniform float uVignetteSoft; // its softness
uniform float uAspect;       // width / height of the screen
uniform float uStatic;       // interference, 0…1

in vec2 vUv;
out vec4 outColor;

float hash21(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  vec2 c = vUv - 0.5;
  /* the bulge: a quadratic term plus a weak quartic one, so the edges bend more than the middle */
  float r2 = dot(c, c);
  vec2 w = 0.5 + c * (1.0 + uCurve * r2 * (1.0 + 1.6 * r2));

  /* The tube is a superellipse ("squircle"): a real screen has no straight sides with rounded corners, its edge fades
     out smoothly. The power comes from uCorner: less rounding, closer to a square. */
  vec2 p = (w - 0.5) * 2.0;
  float n = clamp(0.9 / max(uCorner, 0.01), 4.0, 40.0);
  float shape = pow(pow(abs(p.x), n) + pow(abs(p.y), n), 1.0 / n);
  float d = (shape - 1.0) * 0.5;
  /* past the edge of the picture nothing is drawn: the bezel or the page shows through */
  if (d > 0.004) discard;

  /* interference: rows jump sideways in bands */
  vec2 s = w;
  if (uStatic > 0.001) {
    float jump = hash21(vec2(floor(w.y * 34.0), floor(uTime * 24.0)));
    s.x += (jump - 0.5) * 0.12 * uStatic * step(0.5, jump);
  }
  /* channels drift outwards from the centre, along the radius, more towards the rim */
  vec2 spread = c * (0.0016 + r2 * uChroma * 2.0);
  vec3 col = vec3(texture(uImage, s + spread).r, texture(uImage, s).g, texture(uImage, s - spread).b);
  if (uStatic > 0.001) {
    float snow = hash21(floor(w * vec2(300.0, 280.0)) + floor(uTime * 30.0) * 1.7);
    col = mix(col, vec3(snow * 0.9), uStatic * 0.6);
  }

  /* scanlines: narrow dark gaps between bright rows, not an even sine */
  float row = abs(fract(w.y * uScanCount / 6.2831853) - 0.5) * 2.0;
  col *= 1.0 - uScan * 1.6 * smoothstep(0.55, 1.0, row);
  /* flicker from two unrelated frequencies, so it never reads as an even pulse */
  col *= 1.0 + (sin(uTime * 9.7) * 0.6 + sin(uTime * 23.3) * 0.4) * uFlicker;
  /* vignette along the ellipse of the screen, not a circle */
  float ell = length((w - 0.5) * vec2(1.0, 1.0 / max(uAspect, 0.01)) * 1.08);
  col *= 1.0 - smoothstep(uVignette - uVignetteSoft, uVignette + uVignetteSoft, ell);
  /* the rim of the tube goes dark */
  col *= 1.0 - smoothstep(-0.004, 0.004, d);

  outColor = vec4(col, 1.0);
}
