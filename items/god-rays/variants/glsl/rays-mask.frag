#version 300 es
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
