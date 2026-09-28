import * as THREE from "three";
import { TILE, rand, seedDelay, meltDelay, topSurface, mossAt, iceAt, smooth } from "./garden-surface";
import { FUR } from "./garden-moss";
import type { Garden } from "./garden-sheet";

/** Condensation on the bare glass, thickest along the retreating ice; it goes when the moss arrives.
    A little dew stays on the moss itself. Returns the per-frame update. */
export function buildDrops(garden: Garden, world: THREE.Group) {
  const glass = garden.small ? 260 : 480, dew = garden.small ? 40 : 80, total = glass + dew;
  const seeds: { p: THREE.Vector3; size: number; at: number; until: number; flat: number }[] = [];
  /* A drop on white glass is a lens: clear in the middle, a dark rim where it bends the view, one hard highlight.
     Faked with view-dependent alpha and colour; real transmission would render the whole scene a second time. */
  const water = new THREE.MeshPhysicalMaterial({ color: "#ffffff", metalness: 0, roughness: .02, clearcoat: 1, clearcoatRoughness: .02, ior: 1.33,
    transparent: true, opacity: 1, envMapIntensity: 2.6, depthWrite: false });
  water.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", `
      #include <color_fragment>
      float rim=pow(1.-clamp(dot(normalize(vNormal),normalize(vViewPosition)),0.,1.),1.6);
      diffuseColor.rgb=mix(vec3(.88,.94,.95),vec3(.16,.25,.29),rim);
      diffuseColor.a=mix(.24,.95,rim);
    `);
  };
  const drops = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8), water, total);
  drops.frustumCulled = false; drops.castShadow = true;
  for (let n = 0; seeds.length < glass && n < glass * 40; n++) {
    const x = (rand(n * 3 + 711) - .5) * TILE.width, z = (rand(n * 3 + 712) - .5) * TILE.depth;
    const surface = topSurface(x, z); if (!surface || surface.ny < .8) continue;
    const ice = iceAt(x, z), arrive = seedDelay(x, z);
    /* most drops sit in the band the ice gives up; far from it the glass is only lightly fogged */
    if (ice.t > 1.35 && rand(n + 9) > .4) continue;
    /* under the ice a drop is born when the ice above it goes, elsewhere soon after the start */
    const at = ice.t < 1 ? meltDelay(ice.t) + .16 : .04 + rand(n + 4) * .22;
    if (arrive < at + .1) continue;
    /* condensation: a haze of tiny beads and a few fat drops that have run together */
    seeds.push({ p: new THREE.Vector3(x, surface.y, z), size: .009 + Math.pow(rand(n + 13), 5) * .075, at, until: arrive, flat: .42 });
  }
  for (let n = 0; seeds.length < total && n < dew * 40; n++) {
    const x = (rand(n * 3 + 1711) - .5) * TILE.width, z = (rand(n * 3 + 1712) - .5) * TILE.depth;
    const surface = topSurface(x, z); if (!surface || surface.ny < .8) continue;
    /* dew rests on the tips of the pile */
    seeds.push({ p: new THREE.Vector3(x, surface.y + mossAt(x, z) + FUR * .85, z), size: .008 + rand(n + 13) * .011, at: seedDelay(x, z) + .32, until: 9, flat: .8 });
  }
  drops.count = seeds.length;
  world.add(drops);
  const dummy = new THREE.Object3D();
  return (progress: number) => {
    seeds.forEach((drop, i) => {
      const g = smooth(drop.at, drop.at + .2, progress) * (1 - smooth(drop.until - .03, drop.until + .05, progress));
      dummy.position.copy(drop.p);
      dummy.scale.setScalar(Math.max(.00001, drop.size * g));
      dummy.scale.y *= drop.flat; dummy.updateMatrix(); drops.setMatrixAt(i, dummy.matrix);
    });
    drops.instanceMatrix.needsUpdate = true;
  };
}

/** Pollen in the light above the warm corner, once it blooms: a few dozen soft specks that rise and drift.
    Returns the size setter: specks keep their size relative to the slab, whatever the canvas is. */
export function buildPollen(garden: Garden, world: THREE.Group) {
  if (garden.reduced) return null;
  const count = garden.small ? 28 : 52;
  const base = new Float32Array(count * 3), seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    base.set([-.5 + rand(i * 3 + 3101) * 2.1, .12, -1.0 + rand(i * 3 + 3102) * 2.4], i * 3);
    seed[i] = rand(i * 3 + 3103);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(base, 3));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
  const material = new THREE.ShaderMaterial({
    uniforms: { uGarden: garden.growth, uGardenTime: garden.clock, uSize: { value: 6 } },
    vertexShader: `
      uniform float uGarden, uGardenTime, uSize; attribute float aSeed; varying float vAlpha;
      void main(){
        float life=fract(uGardenTime*(.035+aSeed*.03)+aSeed*7.);
        vec3 p=position+vec3(sin(uGardenTime*.31+aSeed*40.)*.16, life*1.25, cos(uGardenTime*.27+aSeed*23.)*.16);
        vec4 mv=modelViewMatrix*vec4(p,1.);
        gl_Position=projectionMatrix*mv;
        gl_PointSize=uSize*(.55+aSeed*.7)*(12.9/-mv.z);
        // born softly, gone softly, and only once the corner is in bloom
        vAlpha=smoothstep(0.,.18,life)*(1.-smoothstep(.7,1.,life))*smoothstep(.42,.7,uGarden);
      }`,
    fragmentShader: `
      varying float vAlpha;
      void main(){
        float d=length(gl_PointCoord-.5);
        float a=(1.-smoothstep(.12,.5,d))*vAlpha*.7;
        gl_FragColor=vec4(vec3(1.,.93,.70)*2.4,a);
      }`,
    transparent: true, depthWrite: false,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  world.add(points);
  return (canvasHeightPx: number) => { material.uniforms.uSize.value = Math.max(2.5, canvasHeightPx / 150); };
}
