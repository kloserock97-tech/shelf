import * as THREE from "three";

/* Weather and the live atmosphere of a meadow.

   States: clear → cloudy → rain → dusk. The change is smooth: three coefficients, overcast / rain / dusk, chase their
   targets over a couple of seconds, and every frame the light, the sky, the fog and the exposure are mixed from them.

   What each state does (weather changes the light, not the picture):
   - cloudy: a weaker sun, a greyer sky, denser cloud shadows drifting over the meadow;
   - rain: slanted streaks, wet grass goes darker and glossier, thicker haze, a gustier wind;
   - dusk: the sky goes to blue hour, the sun reddens, exposure drops, fireflies blink in the grass.
   Always: now and then the wind tears petals off the flowers and carries them along. */

export type WeatherKind = "clear" | "cloudy" | "rain" | "dusk";
export const WEATHER_ORDER: WeatherKind[] = ["clear", "cloudy", "rain", "dusk"];

type Uniform<T> = { value: T };
export type SkyUniforms = { uZenith: Uniform<THREE.Color>; uHigh: Uniform<THREE.Color>; uMid: Uniform<THREE.Color>; uHorizon: Uniform<THREE.Color>; uGlow: Uniform<THREE.Color>; uSunCol: Uniform<THREE.Color>; uSunDisc: Uniform<number> };
type Palette = { zenith: THREE.Color; high: THREE.Color; mid: THREE.Color; horizon: THREE.Color; glow: THREE.Color };
export type FlowerDrift = { x: number; z: number; r: number; color: THREE.Color };

const OVERCAST: Palette = {
  zenith: new THREE.Color("#8e979c"), high: new THREE.Color("#a8aeae"), mid: new THREE.Color("#c1c1b9"),
  horizon: new THREE.Color("#cbc5b5"), glow: new THREE.Color("#d3c8ae"),
};
const DUSK: Palette = {
  zenith: new THREE.Color("#3a4670"), high: new THREE.Color("#77769a"), mid: new THREE.Color("#c3a09a"),
  horizon: new THREE.Color("#d99a78"), glow: new THREE.Color("#e8946a"),
};
const FOG_OVERCAST = new THREE.Color("#b9bab2");
const FOG_DUSK = new THREE.Color("#a98a86");
const TMP = new THREE.Color();

/** Cloud shadows: a sum of four sines, not a hashed noise, so that the same function can run in GLSL and in JS.
    The props darken exactly when a shadow passes under them. 1 is sun, about 0.4 under a cloud.
    uCloud: xy — offset of the pattern along the wind, z — cover (0 — no shadows). */
export const CLOUD_SHADE_GLSL = /* glsl */ `
float cloudShade(vec3 w){
  if (uCloud.z < 0.001) return 1.0;
  vec2 p = w.xz * 0.11 + uCloud.xy;
  float n = 0.5 + 0.22 * sin(p.x + p.y * 0.6) + 0.18 * sin(-0.7 * p.x + 1.3 * p.y + 1.7)
              + 0.12 * sin(2.1 * p.x + 1.9 * p.y + 4.1) + 0.08 * sin(-2.9 * p.x + 0.8 * p.y + 2.3);
  float edge = 1.0 - uCloud.z;
  return mix(1.0, 0.4, smoothstep(edge - 0.07, edge + 0.07, n));
}`;

/** the same sum of sines as cloudShade in the shaders */
export function cloudShadeAt(x: number, z: number, offset: THREE.Vector2, cover: number) {
  if (cover < 0.001) return 1;
  const px = x * 0.11 + offset.x, py = z * 0.11 + offset.y;
  const n = 0.5 + 0.22 * Math.sin(px + py * 0.6) + 0.18 * Math.sin(-0.7 * px + 1.3 * py + 1.7)
    + 0.12 * Math.sin(2.1 * px + 1.9 * py + 4.1) + 0.08 * Math.sin(-2.9 * px + 0.8 * py + 2.3);
  const edge = 1 - cover;
  const t = THREE.MathUtils.clamp((n - (edge - 0.07)) / 0.14, 0, 1);
  return 1 - 0.6 * t * t * (3 - 2 * t);
}

export type WeatherDeps = {
  scene: THREE.Scene;
  uniforms: {
    uTime: Uniform<number>;
    uWindDir: Uniform<THREE.Vector2>;
    uSunCol: Uniform<THREE.Color>;
    uAmbient: Uniform<number>;
    uFogCol: Uniform<THREE.Color>;
    uHaze: Uniform<number>;
    uCloud: Uniform<THREE.Vector3>;
    uWet: Uniform<number>;
  };
  sky: SkyUniforms;
  /** exposure of the frame: the weather multiplies its clear value */
  exposure: Uniform<number>;
  lights: () => { key: THREE.DirectionalLight; rim: THREE.DirectionalLight; hemi: THREE.HemisphereLight } | null;
  flowers: () => FlowerDrift[];
  /** ground height, for the fireflies and the petals */
  heightAt: (x: number, z: number) => number;
  /** where the props stand: their light follows the cloud shadow at this point */
  propAt?: { x: number; z: number };
  reduced: boolean;
  initial?: WeatherKind;
};

export class Weather {
  kind: WeatherKind = "clear";
  private overcast = 0;
  private rain = 0;
  private dusk = 0;
  private wet = 0;
  private cloudOffset = new THREE.Vector2(3.1, -1.7);
  /* the clear values: sky, fog, light and haze are taken when the weather is created */
  private base: {
    sun: THREE.Color; ambient: number; haze: number; fog: THREE.Color; exposure: number;
    sky: Palette; skySun: THREE.Color; disc: number; key: number; rim: number; hemi: number;
  };

  private petals: Particles;
  private fireflies: THREE.Points;
  private rainLines: THREE.LineSegments;
  private petalTimer = 0;

  constructor(private d: WeatherDeps) {
    this.petals = new Particles(160, d.uniforms.uTime);
    d.scene.add(this.petals.points);
    this.fireflies = buildFireflies(d.uniforms.uTime, d.heightAt);
    d.scene.add(this.fireflies);
    this.rainLines = buildRain(d.uniforms.uTime, d.uniforms.uWindDir);
    d.scene.add(this.rainLines);
    const { uniforms: u, sky } = d;
    const l = d.lights();
    this.base = {
      sun: u.uSunCol.value.clone(), ambient: u.uAmbient.value, haze: u.uHaze.value, fog: u.uFogCol.value.clone(),
      exposure: d.exposure.value,
      sky: { zenith: sky.uZenith.value.clone(), high: sky.uHigh.value.clone(), mid: sky.uMid.value.clone(), horizon: sky.uHorizon.value.clone(), glow: sky.uGlow.value.clone() },
      skySun: sky.uSunCol.value.clone(), disc: sky.uSunDisc.value,
      key: l?.key.intensity ?? 2.1, rim: l?.rim.intensity ?? 2.6, hemi: l?.hemi.intensity ?? 0.38,
    };
    if (d.initial && WEATHER_ORDER.includes(d.initial)) {
      this.kind = d.initial;
      const t = this.targets();
      this.overcast = t.overcast; this.rain = t.rain; this.dusk = t.dusk; this.wet = t.rain;
    }
  }

  /** point sizes of the petals and the fireflies grow with the pixel ratio of the canvas; `size` scales them for a
      closer or a farther camera */
  setPixelRatio(dpr: number, size = 1) {
    (this.petals.points.material as THREE.ShaderMaterial).uniforms.uScale.value = 34 * dpr * size;
    (this.fireflies.material as THREE.ShaderMaterial).uniforms.uScale.value = 26 * dpr * size;
  }

  set(kind: WeatherKind) {
    this.kind = kind;
  }

  next() {
    this.kind = WEATHER_ORDER[(WEATHER_ORDER.indexOf(this.kind) + 1) % WEATHER_ORDER.length];
    return this.kind;
  }

  /** a multiplier of the wind for the grass: gustier in the rain */
  get windScale() {
    return 1 + this.rain * 0.8 + this.overcast * 0.15;
  }

  private targets() {
    return {
      overcast: this.kind === "cloudy" || this.kind === "rain" ? 1 : 0,
      rain: this.kind === "rain" ? 1 : 0,
      dusk: this.kind === "dusk" ? 1 : 0,
    };
  }

  update(dt: number) {
    const b = this.base;
    const { uniforms: u, sky } = this.d;
    const t = this.targets();
    const k = 1 - Math.exp(-dt / 2.2);
    this.overcast += (t.overcast - this.overcast) * k;
    this.rain += (t.rain - this.rain) * k;
    this.dusk += (t.dusk - this.dusk) * k;
    /* the grass gets wet fast and dries slowly */
    this.wet += (this.rain - this.wet) * (1 - Math.exp(-dt / (this.rain > this.wet ? 3 : 25)));
    const o = this.overcast, r = this.rain, du = this.dusk;

    /* cloud shadows: always a few, denser when cloudy; the pattern drifts with the wind */
    const wd = u.uWindDir.value;
    this.cloudOffset.addScaledVector(wd, -dt * (0.035 + r * 0.03) * (this.d.reduced ? 0.3 : 1));
    const cover = 0.3 + o * 0.28 - du * 0.2;
    u.uCloud.value.set(this.cloudOffset.x, this.cloudOffset.y, cover);
    u.uWet.value = this.wet;

    /* the sun: weaker under clouds, redder at dusk */
    const sunK = (1 - o * 0.72) * (1 - du * 0.35);
    u.uSunCol.value.copy(b.sun).multiplyScalar(sunK);
    if (du > 0.001) u.uSunCol.value.lerp(TMP.set(b.sun.r * 1.1, b.sun.g * 0.55, b.sun.b * 0.35).multiplyScalar(sunK), du);
    u.uAmbient.value = b.ambient * (1 - du * 0.55) * (1 + o * 0.12);
    u.uFogCol.value.copy(b.fog).lerp(FOG_OVERCAST, o * 0.75).lerp(FOG_DUSK, du * 0.7);
    u.uHaze.value = b.haze * (1 + o * 0.4 + r * 0.5);

    /* the sky */
    const mix = (dst: THREE.Color, clear: THREE.Color, cloudy: THREE.Color, duskC: THREE.Color) =>
      dst.copy(clear).lerp(cloudy, o).lerp(duskC, du * (1 - o));
    mix(sky.uZenith.value, b.sky.zenith, OVERCAST.zenith, DUSK.zenith);
    mix(sky.uHigh.value, b.sky.high, OVERCAST.high, DUSK.high);
    mix(sky.uMid.value, b.sky.mid, OVERCAST.mid, DUSK.mid);
    mix(sky.uHorizon.value, b.sky.horizon, OVERCAST.horizon, DUSK.horizon);
    mix(sky.uGlow.value, b.sky.glow, OVERCAST.glow, DUSK.glow);
    sky.uSunCol.value.copy(b.skySun).multiplyScalar((1 - o * 0.9) * (1 - du * 0.25));
    sky.uSunDisc.value = b.disc * (1 - o);

    /* the grade */
    this.d.exposure.value = b.exposure * (1 - o * 0.08) * (1 - du * 0.4);

    /* props: the same cloud shadows as on the grass under them */
    const l = this.d.lights();
    if (l) {
      const at = this.d.propAt ?? { x: 0, z: 0 };
      const shade = cloudShadeAt(at.x, at.z, this.cloudOffset, cover);
      l.key.intensity = b.key * sunK * (0.55 + 0.45 * shade);
      l.rim.intensity = b.rim * sunK * shade;
      l.hemi.intensity = b.hemi * (1 - du * 0.35);
    }

    /* the atmosphere */
    (this.rainLines.material as THREE.ShaderMaterial).uniforms.uAmount.value = r;
    this.rainLines.visible = r > 0.01;
    (this.fireflies.material as THREE.ShaderMaterial).uniforms.uAmount.value = du * (1 - r);
    this.fireflies.visible = du > 0.01;
    this.spawnPetals(dt, 1 - r);
    this.petals.update();
  }

  /** a gust: a handful of petals at once */
  burst() {
    for (let i = 0; i < 26; i++) this.spawnPetal(1.8);
  }

  private spawnPetals(dt: number, amount: number) {
    if (this.d.reduced || amount < 0.05) return;
    this.petalTimer += dt * amount * 1.6;
    while (this.petalTimer > 1) { this.petalTimer -= 1; this.spawnPetal(1); }
  }

  private spawnPetal(boost: number) {
    const drifts = this.d.flowers();
    if (!drifts.length) return;
    const f = drifts[Math.floor(Math.random() * drifts.length)];
    const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * f.r;
    const x = f.x + Math.cos(a) * rr, z = f.z + Math.sin(a) * rr;
    const wd = this.d.uniforms.uWindDir.value;
    const s = (0.35 + Math.random() * 0.4) * boost;
    this.petals.spawn(
      x, this.d.heightAt(x, z) + 0.12, z,
      wd.x * s + (Math.random() - 0.5) * 0.1, 0.12 + Math.random() * 0.18 * boost, wd.y * s + (Math.random() - 0.5) * 0.1,
      f.color,
    );
  }
}

/* ───────────── petals: tumble along the wind, shimmer in the sun ───────────── */

class Particles {
  readonly points: THREE.Points;
  private head = 0;
  private dirty = false;
  constructor(private n: number, private time: Uniform<number>) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute("aVel", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute("aBirth", new THREE.BufferAttribute(new Float32Array(n).fill(-999), 1));
    g.setAttribute("aColor", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(new Float32Array(n), 1));
    this.points = new THREE.Points(g, new THREE.ShaderMaterial({
      vertexShader: petalVertex, fragmentShader: petalFragment, transparent: true, depthWrite: false,
      uniforms: { uTime: time, uLife: { value: 6 }, uScale: { value: 34 } },
    }));
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }
  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, c: THREE.Color) {
    const i = this.head;
    this.head = (this.head + 1) % this.n;
    const a = this.points.geometry.attributes;
    (a.position.array as Float32Array).set([x, y, z], i * 3);
    (a.aVel.array as Float32Array).set([vx, vy, vz], i * 3);
    (a.aBirth.array as Float32Array)[i] = this.time.value;
    (a.aColor.array as Float32Array).set([c.r, c.g, c.b], i * 3);
    (a.aSeed.array as Float32Array)[i] = Math.random();
    this.dirty = true;
  }
  update() {
    if (!this.dirty) return;
    this.dirty = false;
    const a = this.points.geometry.attributes;
    a.position.needsUpdate = a.aVel.needsUpdate = a.aBirth.needsUpdate = a.aColor.needsUpdate = a.aSeed.needsUpdate = true;
  }
}

const petalVertex = /* glsl */ `
attribute vec3 aVel;
attribute float aBirth;
attribute vec3 aColor;
attribute float aSeed;
uniform float uTime;
uniform float uLife;
uniform float uScale;
varying float vA;
varying vec3 vColor;
varying float vSpin;
varying float vFlip;
void main(){
  float age = uTime - aBirth;
  if (age < 0.0 || age > uLife){ vA = 0.0; gl_PointSize = 0.0; gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float u = age / uLife;
  /* lifted by the gust, then settling slowly; a flutter across the flight */
  vec3 p = position + aVel * age + vec3(
    sin(age * 3.1 + aSeed * 17.0) * 0.06,
    -0.045 * age * age + sin(age * 2.3 + aSeed * 9.0) * 0.04,
    cos(age * 2.7 + aSeed * 13.0) * 0.06);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = (0.55 + aSeed * 0.35) * uScale / max(-mv.z, 0.1);
  vA = smoothstep(0.0, 0.06, u) * (1.0 - smoothstep(0.7, 1.0, u));
  vColor = aColor;
  vSpin = age * (2.0 + aSeed * 3.0) + aSeed * 6.28;
  vFlip = abs(cos(age * (4.0 + aSeed * 4.0)));
  gl_Position = projectionMatrix * mv;
}`;

const petalFragment = /* glsl */ `
varying float vA;
varying vec3 vColor;
varying float vSpin;
varying float vFlip;
void main(){
  vec2 q = gl_PointCoord - 0.5;
  float c = cos(vSpin), s = sin(vSpin);
  q = mat2(c, -s, s, c) * q;
  /* a petal is an ellipse that flattens when it turns edge-on */
  q.y /= max(vFlip, 0.18);
  float d = length(q * vec2(2.6, 1.5));
  float a = (1.0 - smoothstep(0.38, 0.5, d)) * vA;
  if (a < 0.02) discard;
  gl_FragColor = vec4(vColor * (0.8 + 0.5 * vFlip), a);
}`;

/* ───────────── fireflies: blinking over the grass at dusk ───────────── */

function buildFireflies(time: Uniform<number>, heightAt: (x: number, z: number) => number) {
  const N = 90;
  const pos = new Float32Array(N * 3), seed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const x = (Math.random() - 0.5) * 11, z = -0.5 + Math.random() * 8;
    pos.set([x, heightAt(x, z) + 0.15 + Math.random() * 0.7, z], i * 3);
    seed[i] = Math.random();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
  const pts = new THREE.Points(g, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: time, uAmount: { value: 0 }, uScale: { value: 26 } },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uTime;
      uniform float uAmount;
      uniform float uScale;
      varying float vA;
      void main(){
        float t = uTime * (0.35 + aSeed * 0.3) + aSeed * 40.0;
        vec3 p = position + vec3(sin(t) * 0.35, sin(t * 1.7 + 2.0) * 0.12, cos(t * 0.8) * 0.35);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        /* a flash every couple of seconds, each with its own rhythm */
        float blink = pow(max(sin(uTime * (1.3 + aSeed) + aSeed * 30.0), 0.0), 6.0);
        vA = blink * uAmount;
        gl_PointSize = vA < 0.01 ? 0.0 : uScale / max(-mv.z, 0.1);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying float vA;
      void main(){
        vec2 q = gl_PointCoord - 0.5;
        float a = exp(-dot(q, q) * 26.0) * vA;
        if (a < 0.01) discard;
        gl_FragColor = vec4(vec3(1.6, 1.5, 0.55) * a, a);
      }`,
  }));
  pts.frustumCulled = false;
  pts.renderOrder = 6;
  pts.visible = false;
  return pts;
}

/* ───────────── rain: slanted streaks, the fall is worked out in the shader ───────────── */

function buildRain(time: Uniform<number>, windDir: Uniform<THREE.Vector2>) {
  const N = 1400;
  const pos = new Float32Array(N * 6), seed = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) {
    const x = (Math.random() - 0.5) * 16, z = -3 + Math.random() * 15.5;
    const s = Math.random();
    pos.set([x, 0, z, x, 1, z], i * 6);
    seed.set([s, s], i * 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
  const lines = new THREE.LineSegments(g, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: time, uWindDir: windDir, uAmount: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uTime;
      uniform vec2 uWindDir;
      uniform float uAmount;
      varying float vA;
      /* the hill again, analytically: streaks end on the ground */
      float hillAt(vec2 p){ return 2.3 * exp(-(p.x * p.x / 46.24 + p.y * p.y / 19.36)); }
      void main(){
        const float H = 6.0;
        float ground = hillAt(position.xz);
        float fall = fract(aSeed * 13.7 - uTime * (0.9 + aSeed * 0.25));
        float y = ground + fall * H;
        /* an 18 cm streak, slanted along the wind; the upper end is lighter */
        vec3 p = vec3(position.x, y + position.y * 0.18, position.z);
        p.xz += uWindDir * (position.y * 0.05 + (1.0 - fall) * 0.6);
        vA = uAmount * (0.35 + 0.65 * position.y) * smoothstep(0.0, 0.05, fall) * step(aSeed, uAmount * 1.2);
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying float vA;
      void main(){
        if (vA < 0.01) discard;
        gl_FragColor = vec4(vec3(0.82, 0.84, 0.86), vA * 0.32);
      }`,
  }));
  lines.frustumCulled = false;
  lines.renderOrder = 6;
  lines.visible = false;
  return lines;
}
