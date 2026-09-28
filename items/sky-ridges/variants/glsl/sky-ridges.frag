#version 300 es
precision highp float;
// Sky and distant ridges in one full-screen pass.
// The sky: cold zenith, almost white middle, a warm band at the horizon, a glow toward the sun's azimuth, the sun
// as an HDR disc with a halo. Three ridges stand on circles around the viewer (44, 80 and 140 m); each is a
// smooth profile plus a forest edge cut per pixel: domes of random width and height in three offset rows,
// ripples on top, clearings. The colour is aerial perspective: the further the ridge, the closer it gets to
// the colour of the sky right behind it (the same skyBase), with mist in the hollows and a warm rim against the sun.
// The site draws the ridges as ribbons of triangles (vista.ts); here each pixel intersects the three circles.
uniform vec2 uRes;
uniform vec3 uCam;          // camera position, metres (the ridges are centred on the origin)
uniform float uFovK;        // 2 tan(fovY / 2)
uniform float uPitch;       // camera pitch, radians (up is positive)
uniform vec3 uZenith, uHigh, uMid, uHorizon, uGlow;   // linear
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform float uSunDisc;
uniform vec3 uSH[4];        // L0 and L1 of the sky's light, for the ridges
uniform float uAmbient;
uniform float uHaze;        // 1 — the site's air; more — hazier, less — clearer
uniform float uExposure;
uniform float uHill;        // 1 — frame the ridges with a dark near hill (the demo does)
in vec2 vUv;
out vec4 fragColor;

// Tone curve: straight up to 0.72, then an exponential shoulder toward 1.0; then sRGB.
vec3 toneCurve(vec3 c) {
  const float s = 0.72;
  vec3 over = max(c - s, 0.0);
  return min(c, vec3(s)) + (1.0 - s) * (1.0 - exp(-over / (1.0 - s)));
}
vec3 toSrgb(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(pow(c, vec3(0.41666)) * 1.055 - 0.055, c * 12.92, vec3(lessThanEqual(c, vec3(0.0031308))));
}

// Integer hash: xorshift and a multiply by 2^32/phi, twice. Floats are hashed by their bit pattern.
uint hashU(uint x) { x ^= x >> 16; x *= 0x9E3779B9u; x ^= x >> 15; x *= 0x9E3779B9u; x ^= x >> 16; return x; }
float hashF(float x, uint seed) { return float(hashU(floatBitsToUint(x) ^ seed) >> 8) / 16777216.0; }
float hash2(ivec2 p) { return float(hashU(uint(p.x) ^ hashU(uint(p.y) + 0x6A09E667u)) >> 8) / 16777216.0; }

// value noise with rotated octaves, so the lattice does not show (the same fbm builds the hill on the site)
float vnoise(vec2 p) {
  ivec2 i = ivec2(floor(p)); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + ivec2(1, 0)), u.x), mix(hash2(i + ivec2(0, 1)), hash2(i + ivec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0, amp = 0.5, norm = 0.0;
  for (int i = 0; i < 4; i++) {
    s += amp * vnoise(p);
    norm += amp;
    p = vec2(0.8 * p.x + 0.6 * p.y, -0.6 * p.x + 0.8 * p.y) * 2.07 + vec2(3.1, -1.7);
    amp *= 0.5;
  }
  return s / norm;
}

vec3 skyBase(vec3 d) {
  float e = d.y;
  vec3 c = mix(uHorizon, uMid, smoothstep(-0.02, 0.17, e));
  c = mix(c, uHigh, smoothstep(0.13, 0.40, e));
  c = mix(c, uZenith, smoothstep(0.34, 0.90, e));
  vec3 sd = normalize(vec3(uSunDir.x, 0.0, uSunDir.z));
  float toward = max(dot(normalize(vec3(d.x, 0.0, d.z)), sd), 0.0);
  return mix(c, uGlow, pow(toward, 4.0) * (1.0 - smoothstep(-0.05, 0.25, e)) * 0.6);
}

// the forest edge along the arc, x in metres; seed per ridge
uint gSeed;
float vh(float x) { return hashF(x, gSeed); }
float vn1(float u) { float i = floor(u); float f = fract(u); return mix(vh(i), vh(i + 1.0), f * f * (3.0 - 2.0 * f)); }
float crowns(float x, float crown) {
  float t = x / crown;
  float best = 0.0;
  // three offset rows of domes with jittered centres, the highest wins; one row of even half-circles read as cartoon bubbles
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    float u = t + fk * 0.37;
    float i = floor(u);
    float c0 = 0.5 + (vh(i + fk * 31.0) - 0.5) * 0.5;
    float w = mix(0.55, 1.25, vh(i * 1.7 + 3.0 + fk * 5.0));
    float c = (fract(u) - c0) * 2.0 / w;
    float h = mix(0.3, 1.0, vh(i + fk * 17.0));
    best = max(best, h * pow(max(0.0, 1.0 - c * c), 0.62));
  }
  best += (vn1(x / (crown * 0.22)) - 0.5) * 0.16 + (vn1(x / (crown * 2.7) + 7.0) - 0.5) * 0.35;
  // clearings and forest edges: in places the wood is lower
  float clearing = smoothstep(0.2, 0.6, vn1(x / (crown * 8.0) + 40.0));
  return max(best, 0.0) * mix(0.3, 1.0, clearing);
}

// r, base, lo, hi, freq, forest, crown, aerial, mist, seed — the site's numbers
const int N = 3;
const float R[N] = float[](44.0, 80.0, 140.0);
const float BASE[N] = float[](-1.2, -1.5, -2.0);
const float LO[N] = float[](0.4, 2.2, 7.0);
const float HI[N] = float[](2.4, 7.5, 20.0);
const float FREQ[N] = float[](3.2, 2.4, 1.9);
const float FOREST[N] = float[](1.1, 1.8, 2.6);
const float CROWN[N] = float[](1.1, 1.9, 3.4);
const float AERIAL[N] = float[](0.36, 0.52, 0.62);
const float MIST[N] = float[](0.9, 2.0, 4.0);
const float SEED[N] = float[](1.7, 5.3, 9.1);
const vec3 TINT[N] = vec3[](vec3(0.025, 0.042, 0.012), vec3(0.028, 0.047, 0.023), vec3(0.030, 0.045, 0.072));
const float THETA0 = -3.14159265 - 0.7, THETA1 = 0.7;   // the arc behind the hill and at its sides

void main() {
  vec2 n = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0) * uFovK;
  float cp = cos(uPitch), sp = sin(uPitch);
  vec3 d = normalize(vec3(n.x, n.y * cp + sp, -cp + n.y * sp));
  float pixel = uFovK / uRes.y;                          // one pixel as an angle

  vec3 col = skyBase(d);
  float cosA = max(dot(d, uSunDir), 0.0);
  col += uSunCol * (pow(cosA, 900.0) * 2.2 + pow(cosA, 90.0) * 0.45 + pow(cosA, 12.0) * 0.06
                  + smoothstep(0.99965, 0.99985, cosA) * uSunDisc);
  // the sky right behind a ridge, with the softer part of the sun's glow: what the ridge dissolves into
  vec3 skyAt = skyBase(d) + uSunCol * (pow(cosA, 90.0) * 0.3 + pow(cosA, 12.0) * 0.06);

  float nearest = 1e9;
  for (int r = N - 1; r >= 0; r--) {
    // the ray meets the circle of radius R from inside
    vec2 o = uCam.xz, dd = d.xz;
    float a = dot(dd, dd), b = dot(o, dd), c = dot(o, o) - R[r] * R[r];
    float t = (-b + sqrt(max(b * b - a * c, 0.0))) / max(a, 1e-6);
    vec3 w = uCam + d * t;
    float theta = atan(w.z, w.x);
    if (theta > THETA0 + 6.2831853) theta -= 6.2831853;   // keep the angle on the arc's side of the circle
    if (theta > THETA1) continue;                          // behind the viewer: no ridge there
    if (w.y > BASE[r] + HI[r] + FOREST[r] * 1.6 || w.y < BASE[r] - 4.0) continue;   // clearly above or below
    gSeed = hashU(floatBitsToUint(SEED[r] * 13.7));
    // the smooth profile: big hills and small folds; lower toward the ends of the arc so it is not a wall at the sides
    float nz = fbm(vec2(theta * FREQ[r] + SEED[r], SEED[r] * 3.1));
    float side = min(1.0, min(theta - THETA0, THETA1 - theta) / 0.5);
    float h = BASE[r] + (LO[r] + (HI[r] - LO[r]) * pow(nz, 1.35)) * (0.55 + 0.45 * side);
    float x = theta * R[r];
    float top = h + crowns(x, CROWN[r]) * FOREST[r];
    // edge coverage: how much of this pixel lies below the edge
    float cov = clamp((top - w.y) / max(t * pixel, 1e-4) + 0.5, 0.0, 1.0);
    if (cov <= 0.0) continue;
    // normal: toward the camera and up, at the very edge toward the sky
    float edge = smoothstep(top - max(FOREST[r], 0.6) * 0.9, top, w.y);
    vec3 nrm = normalize(-vec3(d.x, 0.0, d.z) + vec3(0.0, mix(0.55, 1.4, edge), 0.0));
    vec3 light = max(vec3(0.0), uSH[0] * 0.886227 + uSH[1] * 1.023328 * nrm.y + uSH[2] * 1.023328 * nrm.z + uSH[3] * 1.023328 * nrm.x) * uAmbient;
    // forest texture: darker gaps between crowns, lighter toward the edge
    float tex = 0.78 + 0.22 * vh(floor(x / (CROWN[r] * 0.5)) + floor(w.y / max(CROWN[r] * 0.4, 0.5)) * 13.0);
    vec3 cc = TINT[r] * light * tex * mix(0.85, 1.15, edge);
    // against the sun the crest glows with a thin warm rim
    float aerial = min(AERIAL[r] * uHaze, 0.97);
    float toSun = pow(max(dot(normalize(vec3(d.x, 0.0, d.z)), normalize(vec3(uSunDir.x, 0.0, uSunDir.z))), 0.0), 6.0);
    cc += uSunCol * TINT[r] * 6.0 * toSun * smoothstep(top - 0.25 - FOREST[r] * 0.3, top, w.y) * (1.0 - aerial);
    // air: the share of the sky grows toward the foot of the ridge, where mist lies in the hollows
    float mist = exp(-max(w.y - BASE[r], 0.0) / (MIST[r] * uHaze));
    float air = clamp(aerial + (1.0 - aerial) * mist * 0.85, 0.0, 1.0);
    col = mix(col, mix(cc, skyAt, air), cov);
    nearest = t;
  }

  // the meadow in front of the ridges
  if (d.y < 0.0) {
    float tg = (BASE[0] - uCam.y) / d.y;
    if (tg < nearest) {
      vec3 w = uCam + d * tg;
      float g = vnoise(w.xz * 0.35) * 0.6 + vnoise(w.xz * 1.7) * 0.4;
      vec3 light = max(vec3(0.0), uSH[0] * 0.886227 + uSH[1] * 1.023328) * uAmbient;   // lit from above
      vec3 ground = mix(vec3(0.03, 0.05, 0.012), vec3(0.06, 0.085, 0.022), g) * light;
      float air = 1.0 - exp(-tg / (55.0 / uHaze));
      col = mix(ground, skyAt, air);
    }
  }

  // optional framing: a dark near hill across the bottom, as on the site, where the ridges sit behind it
  if (uHill > 0.5) {
    vec2 p = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
    float px = p.x - uCam.x * 0.02;                        // the nearest thing moves most with the camera
    float hy = -0.23 + 0.14 * exp(-pow((px - 0.3) / 0.55, 2.0)) + (vnoise(vec2(px * 7.0, 1.5)) - 0.5) * 0.02
             + (vnoise(vec2(px * 60.0, 4.5)) - 0.5) * 0.004;
    vec3 light = max(vec3(0.0), uSH[0] * 0.886227 + uSH[1] * 1.023328) * uAmbient;
    vec3 hill = mix(vec3(0.02, 0.03, 0.008), vec3(0.04, 0.055, 0.014), vnoise(p * vec2(30.0, 90.0))) * light;
    hill = mix(hill, skyAt, 0.1 * uHaze);
    col = mix(col, hill, clamp((hy - p.y) * uRes.y + 0.5, 0.0, 1.0));
  }

  // dither against banding in the smooth gradient
  col += (hash2(ivec2(gl_FragCoord.xy)) - 0.5) / 400.0;
  fragColor = vec4(toSrgb(toneCurve(col * uExposure)), 1.0);
}
