import * as THREE from "three";
import { createUmbrellaHat } from "./umbrella-hat.js";
import { createHatMotion } from "./hat-motion.js";

/* The hat on a studio stand. Click the scene (or the Replay button): the hat flies off and drops back on.
   The canvas is transparent: the studio backdrop is CSS, the floor only catches the shadow. */

const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const canvas = document.getElementById("stage");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setClearColor(0x000000, 0);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap; // PCF honours shadow.radius, PCFSoft does not

const scene = new THREE.Scene();
/* studio light without an environment map: the plastic is matte (roughness 0.62), a sky/floor hemisphere is enough.
   PMREM (RoomEnvironment) works too, but on Windows its shaders make ANGLE print X4122 warnings in the console */
scene.add(new THREE.HemisphereLight("#ffffff", "#c3c7cf", 1.25));
const key = new THREE.DirectionalLight("#fff1de", 2.3);
key.position.set(-0.9, 2.1, 1.1);
key.castShadow = true;
key.shadow.mapSize.setScalar(1024);
Object.assign(key.shadow.camera, { left: -0.35, right: 0.35, top: 0.35, bottom: -0.35, near: 0.5, far: 5 });
key.shadow.radius = 5;
key.shadow.bias = -0.0005;
key.shadow.normalBias = 0.003;
scene.add(key);
const fill = new THREE.DirectionalLight("#d6e4ff", 0.6);
fill.position.set(1.4, 0.8, 1.2);
scene.add(fill);

/* stand, floor that only catches the shadow, and a soft contact blot under the stand */
const STAND_H = 0.045;
const stand = new THREE.Mesh(
  new THREE.CylinderGeometry(0.1, 0.106, STAND_H, 64),
  new THREE.MeshStandardMaterial({ color: "#eef0f3", roughness: 0.72, metalness: 0 }),
);
stand.position.y = STAND_H / 2;
stand.castShadow = true;
stand.receiveShadow = true;
scene.add(stand);

const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.ShadowMaterial({ opacity: 0.14 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const blot = (() => {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const r = g.createRadialGradient(64, 64, 20, 64, 64, 64);
  r.addColorStop(0, "rgba(0,0,0,0.5)");
  r.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.36), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.001;
  return m;
})();
scene.add(blot);

/* the hat stands on the stand and turns slowly, like on a turntable */
const turntable = new THREE.Group();
turntable.rotation.y = -0.55;
scene.add(turntable);
const parts = createUmbrellaHat();
parts.hat.position.y = STAND_H;
parts.hat.traverse((o) => { if (o.isMesh) o.castShadow = true; });
turntable.add(parts.hat);
const motion = createHatMotion(parts, { reduced });

const camera = new THREE.PerspectiveCamera(22, 1, 0.05, 20);
const TARGET = new THREE.Vector3(0, 0.1, 0);
const VIEW = new THREE.Vector3(0.46, 0.34, 0.82).normalize();
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  /* keep a 0.42 × 0.38 m box in view on any screen shape */
  const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const dist = Math.max(0.19 / t, 0.21 / (t * camera.aspect));
  camera.position.copy(TARGET).addScaledVector(VIEW, dist);
  camera.lookAt(TARGET);
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();

/* replay: the hat flies off, then drops back */
let busy = false;
function replay() {
  if (busy) return;
  if (!motion.wearing) { motion.set(true); return; }
  busy = true;
  motion.set(false);
  setTimeout(() => { motion.set(true); busy = false; }, reduced ? 650 : 850);
}
canvas.addEventListener("click", replay);
document.getElementById("replay")?.addEventListener("click", replay);
setTimeout(() => motion.set(true), 350);

let last = performance.now();
renderer.setAnimationLoop((now) => {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  if (!reduced) turntable.rotation.y += dt * 0.32;
  motion.update(dt);
  renderer.render(scene, camera);
});
