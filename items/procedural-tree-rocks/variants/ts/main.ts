/* A lone tree and a few boulders on a glade at golden hour. Drag to look around; on its own the camera slowly circles.
   Everything is generated at start-up from seeds: nothing but three.js is downloaded. */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createTree } from "./tree";
import { createRocks, rockFootprints, type Rock } from "./rocks";
import { groundFragment, groundVertex, skyFragment, skyVertex } from "./shaders";

const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const canvas = document.getElementById("stage") as HTMLCanvasElement;
/* antialias: the canvas itself is multisampled, alpha to coverage on the leaves needs it */
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;

/* a low sun: from most angles the crown is lit from the side or from behind */
const SUN_DIR = new THREE.Vector3(-0.5, 0.3, -0.81).normalize();
const FOG = new THREE.Color("#eedcb8");
const uniforms: Record<string, THREE.IUniform> = {
  uTime: { value: 0 },
  uWind: { value: reduced ? 0.25 : 1 },
  uWindDir: { value: new THREE.Vector2(0.86, 0.5).normalize() },
  uSunDir: { value: SUN_DIR },
  uSunCol: { value: new THREE.Color(2.4, 1.55, 0.85) },
  uSkyAmb: { value: new THREE.Color(1.75, 1.95, 2.3) },
  uGroundAmb: { value: new THREE.Color(0.8, 0.74, 0.5) },
  uAmbient: { value: 1.0 },
  uFogCol: { value: FOG },
  uHaze: { value: 0.35 },
  uGroundY: { value: 0 },
};

const scene = new THREE.Scene();

/* seeds and sizes are the ones from the portfolio hill; only the places are new */
const ROCKS: Rock[] = [
  { x: 2.3, z: 1.7, size: 0.9, h: 0.6, yaw: 0.6, sink: 0.36, seed: 11 },
  { x: 2.85, z: 1.45, size: 0.36, h: 0.7, yaw: 2.1, sink: 0.3, seed: 23 },
  { x: -2.4, z: -1.3, size: 0.62, h: 0.62, yaw: 1.2, sink: 0.36, seed: 37 },
  { x: -1.9, z: -0.88, size: 0.28, h: 0.75, yaw: 0.2, sink: 0.3, seed: 41 },
];
scene.add(createRocks(uniforms, ROCKS));

const tree = createTree(uniforms, { base: new THREE.Vector3(), height: 5.6, lean: new THREE.Vector3(-0.2, 0, 0.1), msaa: true });
tree.place(0, -0.05, 0, 0.85);
scene.add(tree.group);

/* the glade: contact shade under the trunk and the rocks, a soft crown shade stretched away from the sun */
const HORIZON = FOG.clone().multiplyScalar(1.1);
const spots = rockFootprints(ROCKS).map((f) => new THREE.Vector4(f.x, f.z, f.rx, f.rz));
spots.push(new THREE.Vector4(0, 0, 0.45, 0.45));
while (spots.length < 6) spots.push(new THREE.Vector4(0, 0, 0, 0));
const away = new THREE.Vector2(-SUN_DIR.x, -SUN_DIR.z).normalize();
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(40, 96),
  new THREE.ShaderMaterial({
    vertexShader: groundVertex,
    fragmentShader: groundFragment,
    uniforms: {
      ...uniforms,
      uSpots: { value: spots },
      uShade: { value: new THREE.Vector4(away.x * 3.6, away.y * 3.6, 4.4, 2.3) },
      uShadeDir: { value: away },
      uHorizon: { value: HORIZON },
    },
  }),
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

const sky = new THREE.Mesh(
  new THREE.SphereGeometry(90, 32, 16),
  new THREE.ShaderMaterial({
    vertexShader: skyVertex,
    fragmentShader: skyFragment,
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { uSunDir: uniforms.uSunDir, uSunCol: uniforms.uSunCol, uZenith: { value: new THREE.Color(0.16, 0.34, 0.82) }, uHorizon: { value: HORIZON } },
  }),
);
sky.renderOrder = -1;
scene.add(sky);

const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 200);
camera.position.set(9.0, 2.2, 8.3);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 2.2, 0);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 6;
controls.maxDistance = 18;
controls.minPolarAngle = 0.7;
controls.maxPolarAngle = 1.5;
controls.autoRotate = !reduced;
controls.autoRotateSpeed = 0.5;
sky.onBeforeRender = () => sky.position.copy(camera.position);

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  /* on a tall screen keep the width of the view instead of the height, so the crown fits */
  camera.fov = camera.aspect < 1 ? Math.min(72, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(17.5)) / camera.aspect))) : 35;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();

let last = performance.now();
renderer.setAnimationLoop((now) => {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  uniforms.uTime.value += dt;
  controls.update(dt);
  renderer.render(scene, camera);
});
