import * as THREE from "three";
import { CLOUD_SHADE_GLSL, type FlowerDrift } from "./weather";

/* A simple stage for the weather: a smooth hill with a painted meadow, a gradient sky, a signpost on the top.
   The ground shader reads the same uniforms the weather drives: sun, ambient, fog, haze, cloud shadows, wetness. */

/** the hill: one analytic dome, the same one the rain shader lands on */
export const heightAt = (x: number, z: number) => 2.3 * Math.exp(-(x * x / 46.24 + z * z / 19.36));

export function createUniforms() {
  return {
    uTime: { value: 0 },
    uWindDir: { value: new THREE.Vector2(0.86, 0.5).normalize() },
    uSunDir: { value: new THREE.Vector3(-0.8, 0.5, -0.35).normalize() },
    uSunCol: { value: new THREE.Color(2.4, 1.55, 0.85) },
    uAmbient: { value: 1.0 },
    uFogCol: { value: new THREE.Color("#eedcb8") },
    uHaze: { value: 1 },
    uCloud: { value: new THREE.Vector3(0, 0, 0) },
    uWet: { value: 0 },
  };
}
export type MeadowUniforms = ReturnType<typeof createUniforms>;

/** flower drifts: patches of one kind, as in a field; petals fly off them */
export function planDrifts(): FlowerDrift[] {
  const palette = [
    new THREE.Color(0.80, 0.78, 0.70), new THREE.Color(0.78, 0.56, 0.08), new THREE.Color(0.44, 0.22, 0.50),
    new THREE.Color(0.80, 0.42, 0.52), new THREE.Color(0.28, 0.36, 0.78),
  ];
  const spots = [[-3.6, 2.4], [-1.4, 3.6], [1.2, 2.2], [3.3, 3.1], [-2.2, 0.8], [2.4, 0.4], [0.2, 4.6], [-4.8, 4.2], [4.6, 4.6], [-0.6, 1.4]];
  return spots.map(([x, z], i) => ({ x, z, r: 0.45 + (i % 3) * 0.18, color: palette[i % palette.length] }));
}

export function buildSky(u: MeadowUniforms) {
  const sky = {
    uZenith: { value: new THREE.Color("#b3c1c8") }, uHigh: { value: new THREE.Color("#d8ddd8") }, uMid: { value: new THREE.Color("#efebdd") },
    uHorizon: { value: new THREE.Color("#f4d49a") }, uGlow: { value: new THREE.Color("#f7c27e") },
    uSunCol: { value: new THREE.Color(1.6, 1.15, 0.7) }, uSunDisc: { value: 6 },
  };
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { ...sky, uSunDir: u.uSunDir },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: /* glsl */ `
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
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(80, 32, 16), material);
  mesh.frustumCulled = false; mesh.renderOrder = -1;
  return { mesh, uniforms: sky };
}

export function buildGround(u: MeadowUniforms, drifts: FlowerDrift[]) {
  const geometry = new THREE.PlaneGeometry(44, 30, 176, 120);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, 0, -3);
  const p = geometry.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, heightAt(p.getX(i), p.getZ(i)));
  geometry.computeVertexNormals();
  const driftData = drifts.slice(0, 10).map((d) => new THREE.Vector4(d.x, d.z, d.r, 0));
  const driftColor = drifts.slice(0, 10).map((d) => d.color.clone());
  while (driftData.length < 10) { driftData.push(new THREE.Vector4(0, 0, 0, 0)); driftColor.push(new THREE.Color()); }
  const material = new THREE.ShaderMaterial({
    uniforms: { ...u, uDrift: { value: driftData }, uDriftCol: { value: driftColor } },
    vertexShader: /* glsl */ `
      varying vec3 vW; varying vec3 vN; varying float vDist;
      void main(){
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); vDist = distance(w.xyz, cameraPosition);
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
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
      // Hash Kit (our own hash, see shelf/items/hash-kit): cells in, 0…1 out
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
      }`,
  });
  return new THREE.Mesh(geometry, material);
}

/** a wooden signpost on the top: a prop whose light follows the cloud shadow passing under it */
export function buildSignpost() {
  const wood = new THREE.MeshStandardMaterial({ color: "#8a6844", roughness: .85 });
  const group = new THREE.Group();
  const post = new THREE.Mesh(new THREE.BoxGeometry(.09, 1.1, .09), wood); post.position.y = .55;
  const board = new THREE.Mesh(new THREE.BoxGeometry(.78, .26, .05), wood); board.position.set(.16, .88, .06); board.rotation.z = .06;
  const arrow = new THREE.Mesh(new THREE.BoxGeometry(.5, .2, .05), wood); arrow.position.set(-.12, .56, .06); arrow.rotation.z = -.08;
  group.add(post, board, arrow);
  group.position.set(0, heightAt(0, 0) - .02, 0);
  group.rotation.y = -.35;
  return group;
}
