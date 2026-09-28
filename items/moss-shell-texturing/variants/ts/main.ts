import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { FullScreenQuad } from "three/addons/postprocessing/Pass.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { STONE, DRAPE, mossAt, mossKnob, fbm, arrivalAt, smooth } from "./moss-stone";
import { buildSheet, type MossState } from "./moss-sheet";
import { buildMossPile } from "./moss-shells";

/* Demo: a mossy stone on a grey studio floor; drag to turn it. The panel turns the knobs of the technique. */
const FOV = 30, DISTANCE = 7.2, GROW_SECONDS = 3.2;
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const canvas = document.querySelector<HTMLCanvasElement>("#scene")!;
const state: MossState = { growth: { value: reduced ? 1 : 0 }, clock: { value: 0 }, reduced };

const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, premultipliedAlpha: true, antialias: false });
renderer.setClearColor(0x000000, 0);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
const room = new RoomEnvironment();
const env = pmrem.fromScene(room, .05);
scene.environment = env.texture; scene.environmentIntensity = .35;
room.dispose(); pmrem.dispose();

const camera = new THREE.PerspectiveCamera(FOV, 1, .5, 40);
const elevation = THREE.MathUtils.degToRad(30), azimuth = THREE.MathUtils.degToRad(-28);
camera.position.set(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.cos(azimuth) * Math.cos(elevation)).multiplyScalar(DISTANCE);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, -.3, 0);
Object.assign(controls, { enableZoom: false, enablePan: false, enableDamping: true, autoRotate: !reduced, autoRotateSpeed: .7, minPolarAngle: .45, maxPolarAngle: 1.3 });
controls.update();

scene.add(new THREE.HemisphereLight("#f3f7ee", "#5c6349", .5));
const key = new THREE.DirectionalLight("#fff1de", 2.3);
key.position.set(-2.6, 6.5, 2.2); key.castShadow = true;
key.shadow.mapSize.setScalar(2048);
Object.assign(key.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: .5, far: 16 });
key.shadow.bias = -.0003; key.shadow.normalBias = .016; key.shadow.radius = 7;
scene.add(key);
const fill = new THREE.DirectionalLight("#d6e4ff", .6);
fill.position.set(3, 2, 4); scene.add(fill);

/* the floor is only a shadow catcher: the page behind is the studio */
const floorMat = new THREE.ShadowMaterial({ color: "#1d1e1f", opacity: .28 });
const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), floorMat);
floor.rotation.x = -Math.PI / 2; floor.position.y = -STONE.thickness; floor.receiveShadow = true;
scene.add(floor);

/* grey stone with a mottled surface, all generated here */
const size = 128, stoneData = new Uint8Array(size * size * 4);
for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
  const v = 84 + fbm(i / 14, j / 14) * 54 + (fbm(i / 3, j / 3) - .5) * 24, k = (j * size + i) * 4;
  stoneData.set([v, v * 1.01, v * .98, 255], k);
}
const stoneMap = new THREE.DataTexture(stoneData, size, size);
stoneMap.colorSpace = THREE.SRGBColorSpace; stoneMap.wrapS = stoneMap.wrapT = THREE.RepeatWrapping; stoneMap.needsUpdate = true;
const stoneGeo = new RoundedBoxGeometry(STONE.width, STONE.modelHeight, STONE.depth, 10, STONE.radius);
stoneGeo.scale(1, STONE.thickness / STONE.modelHeight, 1);
stoneGeo.translate(0, -STONE.thickness / 2, 0);
const stone = new THREE.Mesh(stoneGeo, new THREE.MeshStandardMaterial({ map: stoneMap, bumpMap: stoneMap, bumpScale: 1.2, roughness: .88, envMapIntensity: .6 }));
stone.castShadow = stone.receiveShadow = true;
scene.add(stone);

/* the base of the moss: a sheet on the stone, the dark between the strands */
const base = buildSheet(state, {
  x0: -STONE.width / 2 - DRAPE - .1, x1: STONE.width / 2 + DRAPE + .1, z0: -STONE.depth / 2 - DRAPE - .1, z1: STONE.depth / 2 + DRAPE + .1,
  res: 110, material: new THREE.MeshLambertMaterial({ color: "#ffffff", vertexColors: true }),
  sample: (x, z, anchor) => {
    const h = mossAt(x, z, anchor);
    /* 0 in the creases between the knobs, 1 on their crowns; a tall mound is lighter than the carpet around it */
    const crown = anchor.wall > 0 ? .3 + fbm(x * 7, z * 7) * .5 : mossKnob(x, z) * .5 + fbm(x * 6, z * 6) * .22 + Math.min(1, h / .3) * .28;
    return { h, delay: arrivalAt(anchor), shade: crown };
  },
  tint: (shade, out) => out.setRGB(.012 + shade * .02, .022 + shade * .045, .006 + shade * .009),
});
scene.add(base);
const pile = buildMossPile(state, base);
scene.add(pile.group);

/* The scene goes into a multisampled half-float target and is composited onto the transparent canvas. Four samples:
   with two, alpha to coverage gives a strand only three levels of edge. The target is premultiplied, and tone mapping
   is not linear, so the composite divides by coverage first: otherwise every silhouette gets a pale fringe. */
const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
const composite = new FullScreenQuad(new THREE.ShaderMaterial({
  uniforms: { tScene: { value: target.texture } },
  vertexShader: "varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }",
  fragmentShader: `
    uniform sampler2D tScene; varying vec2 vUv;
    void main(){
      vec4 texel=texture2D(tScene,vUv);
      float coverage=texel.a;
      gl_FragColor=vec4(coverage>.001?texel.rgb/coverage:vec3(0.),1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      gl_FragColor=vec4(gl_FragColor.rgb*coverage,coverage);
    }`,
  depthTest: false, depthWrite: false,
}));

/* the panel */
const layers = document.querySelector<HTMLInputElement>("#layers")!;
const cell = document.querySelector<HTMLInputElement>("#cell")!;
const hull = document.querySelector<HTMLInputElement>("#hull")!;
const lock = document.querySelector<HTMLInputElement>("#lock")!;
const out = (id: string) => document.querySelector<HTMLOutputElement>(id)!;
let height = 1, dpr = 1, distance = DISTANCE, grownAt = performance.now();
/* a cell of the strand lattice is kept at a few device pixels, whatever the size of the canvas */
const applyDensity = () => {
  const pixelsPerUnit = height * dpr / (2 * distance * Math.tan(THREE.MathUtils.degToRad(FOV / 2)));
  pile.setDensity(THREE.MathUtils.clamp(pixelsPerUnit / Number(cell.value), 16, 200));
  out("#cell-out").value = `${Number(cell.value).toFixed(1)} px`;
};
layers.addEventListener("input", () => { pile.setShells(Number(layers.value)); out("#layers-out").value = layers.value; });
cell.addEventListener("input", applyDensity);
hull.addEventListener("change", () => pile.setHull(hull.checked));
lock.addEventListener("change", () => pile.setAlphaLock(lock.checked));
document.querySelector("#regrow")!.addEventListener("click", () => { grownAt = performance.now(); });
pile.setShells(Number(layers.value)); out("#layers-out").value = layers.value;

const resize = () => {
  const w = Math.max(1, canvas.clientWidth), h = Math.max(1, canvas.clientHeight);
  dpr = Math.min(devicePixelRatio, 2); height = h;
  renderer.setPixelRatio(dpr); renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  /* on a tall, narrow screen the camera steps back until the stone fits the width */
  distance = Math.max(DISTANCE, 3.4 / (2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * camera.aspect));
  camera.position.sub(controls.target).setLength(distance).add(controls.target);
  target.setSize(Math.round(w * dpr), Math.round(h * dpr));
  applyDensity();
};
new ResizeObserver(resize).observe(canvas);
resize();

const startedAt = performance.now();
renderer.setAnimationLoop(() => {
  const time = (performance.now() - startedAt) / 1000;
  state.clock.value = reduced ? 0 : time;
  state.growth.value = reduced ? 1 : smooth(0, 1, (performance.now() - grownAt) / 1000 / GROW_SECONDS);
  controls.update();
  renderer.setRenderTarget(target);
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  composite.render(renderer);
});
