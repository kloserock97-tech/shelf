import * as THREE from "three";
import { createBird } from "./bird.js";
import { createLookAt } from "./look-at.js";

/* The bird looks at the point on the ground under the cursor. Take the cursor away and it looks around by itself:
   at you, to the sides, up, at the mushroom. The switch at the bottom shows the naive way (turns in bone axes). */

const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const canvas = document.getElementById("stage");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setClearColor(0x000000, 0);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight("#ffffff", "#cfc6b8", 1.3));
const key = new THREE.DirectionalLight("#fff1de", 2.2);
key.position.set(-1.2, 2.4, 1.6);
key.castShadow = true;
key.shadow.mapSize.setScalar(1024);
Object.assign(key.shadow.camera, { left: -0.8, right: 0.8, top: 0.8, bottom: -0.8, near: 0.5, far: 6 });
key.shadow.radius = 5;
key.shadow.bias = -0.0005;
key.shadow.normalBias = 0.003;
scene.add(key);

const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.ShadowMaterial({ opacity: 0.14 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

/* the bird, turned a little towards the viewer */
const bird = createBird();
bird.root.rotation.y = 0.35;
scene.add(bird.root);

/* a mushroom to glance at */
const mushroom = new THREE.Group();
const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.024, 0.07, 7), new THREE.MeshStandardMaterial({ color: "#f3ead8", flatShading: true }));
stem.position.y = 0.035;
const cap = new THREE.Mesh(new THREE.SphereGeometry(0.05, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: "#d9503f", flatShading: true, side: THREE.DoubleSide }));
cap.position.y = 0.066;
cap.scale.y = 0.75;
mushroom.add(stem, cap);
mushroom.position.set(0.42, 0, 0.2);
mushroom.traverse((o) => { if (o.isMesh) o.castShadow = true; });
scene.add(mushroom);

const look = createLookAt(bird.root, bird.bones, { eyeHeight: 0.45, interest: new THREE.Vector3(0.42, 0.07, 0.2), reduced });

/* a ring on the ground where the cursor points */
const marker = new THREE.Mesh(new THREE.RingGeometry(0.028, 0.036, 32), new THREE.MeshBasicMaterial({ color: "#0073e6", transparent: true, opacity: 0, depthWrite: false }));
marker.rotation.x = -Math.PI / 2;
marker.position.y = 0.002;
scene.add(marker);

const camera = new THREE.PerspectiveCamera(28, 1, 0.05, 50);
const TARGET = new THREE.Vector3(0.08, 0.28, 0);
const VIEW = new THREE.Vector3(0.12, 0.34, 1).normalize();
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  camera.position.copy(TARGET).addScaledVector(VIEW, Math.max(0.5 / t, 0.56 / (t * camera.aspect)));
  camera.lookAt(TARGET);
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();

/* cursor → a point on the ground; above the horizon → a point far along the ray */
const ndc = new THREE.Vector2();
const ray = new THREE.Raycaster();
const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const cursor = new THREE.Vector3();
let active = false, tapUntil = 0;
const setNdc = (e) => ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
addEventListener("pointermove", (e) => { if (e.pointerType !== "touch") { setNdc(e); active = true; } });
addEventListener("pointerdown", (e) => { setNdc(e); active = true; if (e.pointerType === "touch") tapUntil = performance.now() + 2000; });
document.documentElement.addEventListener("pointerleave", () => { active = false; });
document.getElementById("naive")?.addEventListener("change", (e) => { look.naive = e.target.checked; });

let last = performance.now();
renderer.setAnimationLoop((now) => {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  if (tapUntil && now > tapUntil) { tapUntil = 0; active = false; }
  let onGround = false;
  if (active) {
    ray.setFromCamera(ndc, camera);
    const hit = ray.ray.intersectPlane(ground, cursor);
    onGround = !!hit && hit.distanceTo(camera.position) < 25;
    if (!onGround) ray.ray.at(8, cursor);
  }
  look.update(dt, active ? cursor : null, camera);
  if (onGround) marker.position.set(cursor.x, 0.002, cursor.z);
  marker.material.opacity += ((onGround ? 0.85 : 0) - marker.material.opacity) * (1 - Math.exp(-dt * 10));
  renderer.render(scene, camera);
});
