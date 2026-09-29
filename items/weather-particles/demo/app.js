// items/weather-particles/variants/ts/main.ts
import * as THREE3 from "three";

// items/weather-particles/variants/ts/weather.ts
import * as THREE from "three";
var WEATHER_ORDER = ["clear", "cloudy", "rain", "dusk"];
var OVERCAST = {
  zenith: new THREE.Color("#8e979c"),
  high: new THREE.Color("#a8aeae"),
  mid: new THREE.Color("#c1c1b9"),
  horizon: new THREE.Color("#cbc5b5"),
  glow: new THREE.Color("#d3c8ae")
};
var DUSK = {
  zenith: new THREE.Color("#3a4670"),
  high: new THREE.Color("#77769a"),
  mid: new THREE.Color("#c3a09a"),
  horizon: new THREE.Color("#d99a78"),
  glow: new THREE.Color("#e8946a")
};
var FOG_OVERCAST = new THREE.Color("#b9bab2");
var FOG_DUSK = new THREE.Color("#a98a86");
var TMP = new THREE.Color();
var CLOUD_SHADE_GLSL = (
  /* glsl */
  `
float cloudShade(vec3 w){
  if (uCloud.z < 0.001) return 1.0;
  vec2 p = w.xz * 0.11 + uCloud.xy;
  float n = 0.5 + 0.22 * sin(p.x + p.y * 0.6) + 0.18 * sin(-0.7 * p.x + 1.3 * p.y + 1.7)
              + 0.12 * sin(2.1 * p.x + 1.9 * p.y + 4.1) + 0.08 * sin(-2.9 * p.x + 0.8 * p.y + 2.3);
  float edge = 1.0 - uCloud.z;
  return mix(1.0, 0.4, smoothstep(edge - 0.07, edge + 0.07, n));
}`
);
function cloudShadeAt(x, z, offset, cover) {
  if (cover < 1e-3) return 1;
  const px = x * 0.11 + offset.x, py = z * 0.11 + offset.y;
  const n = 0.5 + 0.22 * Math.sin(px + py * 0.6) + 0.18 * Math.sin(-0.7 * px + 1.3 * py + 1.7) + 0.12 * Math.sin(2.1 * px + 1.9 * py + 4.1) + 0.08 * Math.sin(-2.9 * px + 0.8 * py + 2.3);
  const edge = 1 - cover;
  const t = THREE.MathUtils.clamp((n - (edge - 0.07)) / 0.14, 0, 1);
  return 1 - 0.6 * t * t * (3 - 2 * t);
}
var Weather = class {
  constructor(d) {
    this.d = d;
    this.petals = new Particles(160, d.uniforms.uTime);
    d.scene.add(this.petals.points);
    this.fireflies = buildFireflies(d.uniforms.uTime, d.heightAt);
    d.scene.add(this.fireflies);
    this.rainLines = buildRain(d.uniforms.uTime, d.uniforms.uWindDir);
    d.scene.add(this.rainLines);
    const { uniforms: u2, sky: sky2 } = d;
    const l = d.lights();
    this.base = {
      sun: u2.uSunCol.value.clone(),
      ambient: u2.uAmbient.value,
      haze: u2.uHaze.value,
      fog: u2.uFogCol.value.clone(),
      exposure: d.exposure.value,
      sky: { zenith: sky2.uZenith.value.clone(), high: sky2.uHigh.value.clone(), mid: sky2.uMid.value.clone(), horizon: sky2.uHorizon.value.clone(), glow: sky2.uGlow.value.clone() },
      skySun: sky2.uSunCol.value.clone(),
      disc: sky2.uSunDisc.value,
      key: l?.key.intensity ?? 2.1,
      rim: l?.rim.intensity ?? 2.6,
      hemi: l?.hemi.intensity ?? 0.38
    };
    if (d.initial && WEATHER_ORDER.includes(d.initial)) {
      this.kind = d.initial;
      const t = this.targets();
      this.overcast = t.overcast;
      this.rain = t.rain;
      this.dusk = t.dusk;
      this.wet = t.rain;
    }
  }
  d;
  kind = "clear";
  overcast = 0;
  rain = 0;
  dusk = 0;
  wet = 0;
  cloudOffset = new THREE.Vector2(3.1, -1.7);
  /* the clear values: sky, fog, light and haze are taken when the weather is created */
  base;
  petals;
  fireflies;
  rainLines;
  petalTimer = 0;
  /** point sizes of the petals and the fireflies grow with the pixel ratio of the canvas; `size` scales them for a
      closer or a farther camera */
  setPixelRatio(dpr, size = 1) {
    this.petals.points.material.uniforms.uScale.value = 34 * dpr * size;
    this.fireflies.material.uniforms.uScale.value = 26 * dpr * size;
  }
  set(kind) {
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
  targets() {
    return {
      overcast: this.kind === "cloudy" || this.kind === "rain" ? 1 : 0,
      rain: this.kind === "rain" ? 1 : 0,
      dusk: this.kind === "dusk" ? 1 : 0
    };
  }
  update(dt) {
    const b = this.base;
    const { uniforms: u2, sky: sky2 } = this.d;
    const t = this.targets();
    const k = 1 - Math.exp(-dt / 2.2);
    this.overcast += (t.overcast - this.overcast) * k;
    this.rain += (t.rain - this.rain) * k;
    this.dusk += (t.dusk - this.dusk) * k;
    this.wet += (this.rain - this.wet) * (1 - Math.exp(-dt / (this.rain > this.wet ? 3 : 25)));
    const o = this.overcast, r = this.rain, du = this.dusk;
    const wd = u2.uWindDir.value;
    this.cloudOffset.addScaledVector(wd, -dt * (0.035 + r * 0.03) * (this.d.reduced ? 0.3 : 1));
    const cover = 0.3 + o * 0.28 - du * 0.2;
    u2.uCloud.value.set(this.cloudOffset.x, this.cloudOffset.y, cover);
    u2.uWet.value = this.wet;
    const sunK = (1 - o * 0.72) * (1 - du * 0.35);
    u2.uSunCol.value.copy(b.sun).multiplyScalar(sunK);
    if (du > 1e-3) u2.uSunCol.value.lerp(TMP.set(b.sun.r * 1.1, b.sun.g * 0.55, b.sun.b * 0.35).multiplyScalar(sunK), du);
    u2.uAmbient.value = b.ambient * (1 - du * 0.55) * (1 + o * 0.12);
    u2.uFogCol.value.copy(b.fog).lerp(FOG_OVERCAST, o * 0.75).lerp(FOG_DUSK, du * 0.7);
    u2.uHaze.value = b.haze * (1 + o * 0.4 + r * 0.5);
    const mix = (dst, clear, cloudy, duskC) => dst.copy(clear).lerp(cloudy, o).lerp(duskC, du * (1 - o));
    mix(sky2.uZenith.value, b.sky.zenith, OVERCAST.zenith, DUSK.zenith);
    mix(sky2.uHigh.value, b.sky.high, OVERCAST.high, DUSK.high);
    mix(sky2.uMid.value, b.sky.mid, OVERCAST.mid, DUSK.mid);
    mix(sky2.uHorizon.value, b.sky.horizon, OVERCAST.horizon, DUSK.horizon);
    mix(sky2.uGlow.value, b.sky.glow, OVERCAST.glow, DUSK.glow);
    sky2.uSunCol.value.copy(b.skySun).multiplyScalar((1 - o * 0.9) * (1 - du * 0.25));
    sky2.uSunDisc.value = b.disc * (1 - o);
    this.d.exposure.value = b.exposure * (1 - o * 0.08) * (1 - du * 0.4);
    const l = this.d.lights();
    if (l) {
      const at = this.d.propAt ?? { x: 0, z: 0 };
      const shade = cloudShadeAt(at.x, at.z, this.cloudOffset, cover);
      l.key.intensity = b.key * sunK * (0.55 + 0.45 * shade);
      l.rim.intensity = b.rim * sunK * shade;
      l.hemi.intensity = b.hemi * (1 - du * 0.35);
    }
    this.rainLines.material.uniforms.uAmount.value = r;
    this.rainLines.visible = r > 0.01;
    this.fireflies.material.uniforms.uAmount.value = du * (1 - r);
    this.fireflies.visible = du > 0.01;
    this.spawnPetals(dt, 1 - r);
    this.petals.update();
  }
  /** a gust: a handful of petals at once */
  burst() {
    for (let i = 0; i < 26; i++) this.spawnPetal(1.8);
  }
  spawnPetals(dt, amount) {
    if (this.d.reduced || amount < 0.05) return;
    this.petalTimer += dt * amount * 1.6;
    while (this.petalTimer > 1) {
      this.petalTimer -= 1;
      this.spawnPetal(1);
    }
  }
  spawnPetal(boost) {
    const drifts2 = this.d.flowers();
    if (!drifts2.length) return;
    const f = drifts2[Math.floor(Math.random() * drifts2.length)];
    const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * f.r;
    const x = f.x + Math.cos(a) * rr, z = f.z + Math.sin(a) * rr;
    const wd = this.d.uniforms.uWindDir.value;
    const s = (0.35 + Math.random() * 0.4) * boost;
    this.petals.spawn(
      x,
      this.d.heightAt(x, z) + 0.12,
      z,
      wd.x * s + (Math.random() - 0.5) * 0.1,
      0.12 + Math.random() * 0.18 * boost,
      wd.y * s + (Math.random() - 0.5) * 0.1,
      f.color
    );
  }
};
var Particles = class {
  constructor(n, time) {
    this.n = n;
    this.time = time;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute("aVel", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute("aBirth", new THREE.BufferAttribute(new Float32Array(n).fill(-999), 1));
    g.setAttribute("aColor", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(new Float32Array(n), 1));
    this.points = new THREE.Points(g, new THREE.ShaderMaterial({
      vertexShader: petalVertex,
      fragmentShader: petalFragment,
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: time, uLife: { value: 6 }, uScale: { value: 34 } }
    }));
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }
  n;
  time;
  points;
  head = 0;
  dirty = false;
  spawn(x, y, z, vx, vy, vz, c) {
    const i = this.head;
    this.head = (this.head + 1) % this.n;
    const a = this.points.geometry.attributes;
    a.position.array.set([x, y, z], i * 3);
    a.aVel.array.set([vx, vy, vz], i * 3);
    a.aBirth.array[i] = this.time.value;
    a.aColor.array.set([c.r, c.g, c.b], i * 3);
    a.aSeed.array[i] = Math.random();
    this.dirty = true;
  }
  update() {
    if (!this.dirty) return;
    this.dirty = false;
    const a = this.points.geometry.attributes;
    a.position.needsUpdate = a.aVel.needsUpdate = a.aBirth.needsUpdate = a.aColor.needsUpdate = a.aSeed.needsUpdate = true;
  }
};
var petalVertex = (
  /* glsl */
  `
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
}`
);
var petalFragment = (
  /* glsl */
  `
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
}`
);
function buildFireflies(time, heightAt2) {
  const N = 90;
  const pos = new Float32Array(N * 3), seed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const x = (Math.random() - 0.5) * 11, z = -0.5 + Math.random() * 8;
    pos.set([x, heightAt2(x, z) + 0.15 + Math.random() * 0.7, z], i * 3);
    seed[i] = Math.random();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
  const pts = new THREE.Points(g, new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: time, uAmount: { value: 0 }, uScale: { value: 26 } },
    vertexShader: (
      /* glsl */
      `
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
      }`
    ),
    fragmentShader: (
      /* glsl */
      `
      varying float vA;
      void main(){
        vec2 q = gl_PointCoord - 0.5;
        float a = exp(-dot(q, q) * 26.0) * vA;
        if (a < 0.01) discard;
        gl_FragColor = vec4(vec3(1.6, 1.5, 0.55) * a, a);
      }`
    )
  }));
  pts.frustumCulled = false;
  pts.renderOrder = 6;
  pts.visible = false;
  return pts;
}
function buildRain(time, windDir) {
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
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: time, uWindDir: windDir, uAmount: { value: 0 } },
    vertexShader: (
      /* glsl */
      `
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
      }`
    ),
    fragmentShader: (
      /* glsl */
      `
      varying float vA;
      void main(){
        if (vA < 0.01) discard;
        gl_FragColor = vec4(vec3(0.82, 0.84, 0.86), vA * 0.32);
      }`
    )
  }));
  lines.frustumCulled = false;
  lines.renderOrder = 6;
  lines.visible = false;
  return lines;
}

// items/weather-particles/variants/ts/meadow.ts
import * as THREE2 from "three";
var heightAt = (x, z) => 2.3 * Math.exp(-(x * x / 46.24 + z * z / 19.36));
function createUniforms() {
  return {
    uTime: { value: 0 },
    uWindDir: { value: new THREE2.Vector2(0.86, 0.5).normalize() },
    uSunDir: { value: new THREE2.Vector3(-0.8, 0.5, -0.35).normalize() },
    uSunCol: { value: new THREE2.Color(2.4, 1.55, 0.85) },
    uAmbient: { value: 1 },
    uFogCol: { value: new THREE2.Color("#eedcb8") },
    uHaze: { value: 1 },
    uCloud: { value: new THREE2.Vector3(0, 0, 0) },
    uWet: { value: 0 }
  };
}
function planDrifts() {
  const palette = [
    new THREE2.Color(0.8, 0.78, 0.7),
    new THREE2.Color(0.78, 0.56, 0.08),
    new THREE2.Color(0.44, 0.22, 0.5),
    new THREE2.Color(0.8, 0.42, 0.52),
    new THREE2.Color(0.28, 0.36, 0.78)
  ];
  const spots = [[-3.6, 2.4], [-1.4, 3.6], [1.2, 2.2], [3.3, 3.1], [-2.2, 0.8], [2.4, 0.4], [0.2, 4.6], [-4.8, 4.2], [4.6, 4.6], [-0.6, 1.4]];
  return spots.map(([x, z], i) => ({ x, z, r: 0.45 + i % 3 * 0.18, color: palette[i % palette.length] }));
}
function buildSky(u2) {
  const sky2 = {
    uZenith: { value: new THREE2.Color("#b3c1c8") },
    uHigh: { value: new THREE2.Color("#d8ddd8") },
    uMid: { value: new THREE2.Color("#efebdd") },
    uHorizon: { value: new THREE2.Color("#f4d49a") },
    uGlow: { value: new THREE2.Color("#f7c27e") },
    uSunCol: { value: new THREE2.Color(1.6, 1.15, 0.7) },
    uSunDisc: { value: 6 }
  };
  const material = new THREE2.ShaderMaterial({
    side: THREE2.BackSide,
    depthWrite: false,
    uniforms: { ...sky2, uSunDir: u2.uSunDir },
    vertexShader: (
      /* glsl */
      `
      varying vec3 vDir;
      void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`
    ),
    fragmentShader: (
      /* glsl */
      `
      uniform vec3 uZenith, uHigh, uMid, uHorizon, uGlow, uSunCol, uSunDir;
      uniform float uSunDisc;
      varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        float e = d.y;
        /* four bands from the horizon up, and a warm glow on the side of the sun */
        vec3 c = mix(uHorizon, uMid, smoothstep(-0.02, 0.14, e));
        c = mix(c, uHigh, smoothstep(0.12, 0.38, e));
        c = mix(c, uZenith, smoothstep(0.34, 0.9, e));
        float toSun = max(dot(d, uSunDir), 0.0);
        c = mix(c, uGlow, pow(toSun, 5.0) * 0.55 * (1.0 - smoothstep(0.0, 0.35, e)));
        c += uSunCol * (pow(toSun, 60.0) * 0.35 + smoothstep(0.9996, 0.9998, toSun) * uSunDisc * 0.3);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
    )
  });
  const mesh = new THREE2.Mesh(new THREE2.SphereGeometry(80, 32, 16), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return { mesh, uniforms: sky2 };
}
function buildGround(u2, drifts2) {
  const geometry = new THREE2.PlaneGeometry(44, 30, 176, 120);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, 0, -3);
  const p = geometry.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, heightAt(p.getX(i), p.getZ(i)));
  geometry.computeVertexNormals();
  const driftData = drifts2.slice(0, 10).map((d) => new THREE2.Vector4(d.x, d.z, d.r, 0));
  const driftColor = drifts2.slice(0, 10).map((d) => d.color.clone());
  while (driftData.length < 10) {
    driftData.push(new THREE2.Vector4(0, 0, 0, 0));
    driftColor.push(new THREE2.Color());
  }
  const material = new THREE2.ShaderMaterial({
    uniforms: { ...u2, uDrift: { value: driftData }, uDriftCol: { value: driftColor } },
    vertexShader: (
      /* glsl */
      `
      varying vec3 vW; varying vec3 vN; varying float vDist;
      void main(){
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); vDist = distance(w.xyz, cameraPosition);
        gl_Position = projectionMatrix * viewMatrix * w;
      }`
    ),
    fragmentShader: (
      /* glsl */
      `
      uniform vec3 uSunDir, uSunCol, uFogCol, uCloud;
      uniform float uAmbient, uHaze, uWet, uTime;
      uniform vec4 uDrift[10];
      uniform vec3 uDriftCol[10];
      varying vec3 vW; varying vec3 vN; varying float vDist;
      ${CLOUD_SHADE_GLSL}
      /* air: a distant haze plus a low fog that settles at the foot of the hill */
      float airFog(vec3 w, float dist){
        float distant = smoothstep(9.0, 30.0, dist) * 0.55;
        float low = (1.0 - exp(-dist * 0.035)) * exp(-max(w.y - 0.2, 0.0) * 1.15) * 0.55;
        return clamp(distant + low * uHaze, 0.0, 0.8);
      }
      // Hash Kit (our own hash, see shelf/items/hash-kit): cells in, 0\u20261 out
      uint hashU(uint x){ x^=x>>16; x*=0x3f9c86cbu; x^=x>>14; x*=0x1ae9dacfu; x^=x>>15; return x; }
      float h21(vec2 p){ uvec2 q = uvec2(ivec2(floor(p))); return float(hashU(q.x + hashU(q.y + 0xb31c96c9u)) >> 8) * (1.0 / 16777216.0); }
      float h31(vec3 p){ uvec3 q = uvec3(ivec3(floor(p))); return float(hashU(q.x + hashU(q.y + hashU(q.z + 0xb31c96c9u))) >> 8) * (1.0 / 16777216.0); }
      float n2(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y); }
      void main(){
        vec3 N = normalize(vN);
        /* painted meadow: patches of lighter and darker grass, fine streaks along the slope */
        float n = n2(vW.xz * 1.3) * 0.6 + n2(vW.xz * 5.0) * 0.4;
        float streak = n2(vec2(vW.x * 30.0, vW.z * 7.0));
        vec3 grass = mix(vec3(0.045, 0.085, 0.018), vec3(0.11, 0.17, 0.035), n * 0.7 + streak * 0.3);
        grass = mix(grass, vec3(0.16, 0.15, 0.06), smoothstep(0.7, 0.9, n2(vW.xz * 0.7 + 3.0)) * 0.45);
        /* flowers: dots of one colour inside each drift */
        for (int i = 0; i < 10; i++) {
          vec4 d = uDrift[i];
          if (d.z <= 0.0) continue;
          /* a drift thins out towards a ragged edge instead of ending in a circle */
          float inside = (1.0 - smoothstep(d.z * 0.35, d.z, distance(vW.xz, d.xy))) * smoothstep(0.3, 0.55, n2(vW.xz * 3.0 + float(i) * 5.3));
          vec2 cell = floor(vW.xz * 26.0 + float(i) * 7.0);
          vec2 at = fract(vW.xz * 26.0 + float(i) * 7.0) - 0.5 - (vec2(h21(cell), h31(vec3(cell, 1.0))) - 0.5) * 0.5;
          float bloom = (1.0 - smoothstep(0.14, 0.2, length(at))) * step(0.55, h31(vec3(cell, 2.0))) * inside;
          grass = mix(grass, uDriftCol[i], bloom);
        }
        float cloud = cloudShade(vW);
        vec3 V = normalize(cameraPosition - vW);
        /* sky light from above, sun with the cloud shadow, a warm edge where the light comes through against the sun */
        vec3 sky = vec3(0.34, 0.38, 0.42) * uAmbient * (0.6 + 0.4 * N.y);
        vec3 sun = uSunCol * max(dot(N, uSunDir), 0.0) * cloud;
        float back = pow(max(dot(-V, uSunDir), 0.0), 3.0) * 0.35 * cloud;
        vec3 c = grass * (sky + sun * 0.85 + uSunCol * back);
        /* wet grass: darker, and the sun glints in it */
        c *= mix(1.0, 0.72, uWet);
        vec3 H = normalize(uSunDir + V);
        c += uSunCol * pow(max(dot(N, H), 0.0), 40.0) * 0.05 * (1.0 + uWet * 3.0) * cloud;
        c = mix(c, uFogCol, airFog(vW, vDist));
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
    )
  });
  return new THREE2.Mesh(geometry, material);
}
function buildSignpost() {
  const wood = new THREE2.MeshStandardMaterial({ color: "#8a6844", roughness: 0.85 });
  const group = new THREE2.Group();
  const post = new THREE2.Mesh(new THREE2.BoxGeometry(0.09, 1.1, 0.09), wood);
  post.position.y = 0.55;
  const board = new THREE2.Mesh(new THREE2.BoxGeometry(0.78, 0.26, 0.05), wood);
  board.position.set(0.16, 0.88, 0.06);
  board.rotation.z = 0.06;
  const arrow = new THREE2.Mesh(new THREE2.BoxGeometry(0.5, 0.2, 0.05), wood);
  arrow.position.set(-0.12, 0.56, 0.06);
  arrow.rotation.z = -0.08;
  group.add(post, board, arrow);
  group.position.set(0, heightAt(0, 0) - 0.02, 0);
  group.rotation.y = -0.35;
  return group;
}

// items/weather-particles/variants/ts/main.ts
var reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
var canvas = document.querySelector("#scene");
var renderer = new THREE3.WebGLRenderer({ canvas, antialias: true });
renderer.toneMapping = THREE3.ACESFilmicToneMapping;
var scene = new THREE3.Scene();
var camera = new THREE3.PerspectiveCamera(30, 1, 0.1, 200);
var u = createUniforms();
var drifts = planDrifts();
var sky = buildSky(u);
scene.add(sky.mesh, buildGround(u, drifts));
var signpost = buildSignpost();
scene.add(signpost);
var hemi = new THREE3.HemisphereLight("#dfe8f0", "#4a5a2a", 2.6);
var key = new THREE3.DirectionalLight("#ffd9a8", 3.2);
key.position.copy(u.uSunDir.value).multiplyScalar(10);
var rim = new THREE3.DirectionalLight("#ffe2b8", 2.2);
rim.position.set(3, 2, 6);
scene.add(hemi, key, rim);
var exposure = { value: 1 };
var initial = new URLSearchParams(location.search).get("weather");
var weather = new Weather({
  scene,
  uniforms: u,
  sky: sky.uniforms,
  exposure,
  lights: () => ({ key, rim, hemi }),
  flowers: () => drifts,
  heightAt,
  propAt: { x: 0, z: 0 },
  reduced,
  initial: initial && WEATHER_ORDER.includes(initial) ? initial : void 0
});
var buttons = [...document.querySelectorAll("[data-weather]")];
var mark = () => buttons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.weather === weather.kind)));
buttons.forEach((b) => b.addEventListener("click", () => {
  weather.set(b.dataset.weather);
  mark();
}));
document.querySelector("#gust").addEventListener("click", () => weather.burst());
mark();
var resize = () => {
  const w = Math.max(1, canvas.clientWidth), h = Math.max(1, canvas.clientHeight);
  const dpr = Math.min(devicePixelRatio, 2);
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  const back = Math.max(1, 1.25 / camera.aspect);
  camera.position.set(0, 2.5 + (back - 1) * 0.8, 11 * back);
  camera.lookAt(0, 1.75, 0);
  camera.updateProjectionMatrix();
  weather.setPixelRatio(dpr, 2.4);
};
new ResizeObserver(resize).observe(canvas);
resize();
var last = performance.now();
renderer.setAnimationLoop(() => {
  const now = performance.now(), dt = Math.min(0.05, (now - last) / 1e3);
  last = now;
  u.uTime.value += dt;
  weather.update(dt);
  renderer.toneMappingExposure = exposure.value;
  renderer.render(scene, camera);
});
