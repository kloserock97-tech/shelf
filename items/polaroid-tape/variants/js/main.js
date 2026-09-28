import * as THREE from "three";
import { createPolaroid } from "./polaroid.js";
import { paintLandscape } from "./landscape.js";

/* The polaroid hangs on its tape and sways a little; it turns to face the cursor. A handwritten note with an arrow
   sits in the DOM and follows the top edge of the card: that point is projected from 3D to the window every frame. */

const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const canvas = document.getElementById("stage");
const note = document.querySelector(".note");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setClearColor(0x000000, 0);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap; // PCF honours shadow.radius

const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight("#ffffff", "#d9d2c6", 1.5));
const key = new THREE.DirectionalLight("#fff6ea", 1.9);
key.position.set(-1.2, 1.6, 3);
key.castShadow = true;
key.shadow.mapSize.setScalar(1024);
Object.assign(key.shadow.camera, { left: -1.4, right: 1.4, top: 1.4, bottom: -1.4, near: 0.5, far: 8 });
key.shadow.radius = 12;
key.shadow.bias = -0.0005;
scene.add(key);

/* a wall behind the card that only catches its shadow; far enough that a turned card never touches it */
const wall = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.ShadowMaterial({ opacity: 0.22 }));
wall.position.z = -0.25;
wall.receiveShadow = true;
scene.add(wall);

const CARD_H = 616 / 512;
const card = createPolaroid(paintLandscape(512, 7), { caption: "lake, 6 a.m." });
card.castShadow = true;
card.material.shadowSide = THREE.DoubleSide; // a FrontSide plane casts nothing: the shadow pass draws back faces by default
/* hung by the tape: the pivot is at the top edge */
const hanger = new THREE.Group();
card.position.y = -CARD_H / 2 + 0.02;
hanger.add(card);
scene.add(hanger);

const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 30);
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  /* narrow screens: the card moves right, so the note fits on its left */
  const narrow = camera.aspect < 0.8;
  hanger.position.set(narrow ? 0.16 : 0, CARD_H / 2 - 0.14, 0);
  const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const dist = Math.max(1.12 / t, 0.8 / (t * camera.aspect));
  camera.position.set(0, 0.06, dist);
  camera.lookAt(0, 0.06, 0);
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();

/* cursor, −1…1 on both axes; a tap on a touch screen counts for a moment */
const pointer = new THREE.Vector2();
const tilt = new THREE.Vector2();
let tapUntil = 0;
addEventListener("pointermove", (e) => {
  if (e.pointerType === "touch") return;
  pointer.set((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1);
});
addEventListener("pointerdown", (e) => {
  pointer.set((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1);
  if (e.pointerType === "touch") tapUntil = performance.now() + 1600;
});
document.documentElement.addEventListener("pointerleave", () => pointer.set(0, 0));

const anchor = new THREE.Vector3();
let noteX = NaN, noteY = NaN;
setTimeout(() => note?.classList.add("is-on"), 700);

let last = performance.now(), time = 0;
renderer.setAnimationLoop((now) => {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  time += dt;
  if (tapUntil && now > tapUntil) { tapUntil = 0; pointer.set(0, 0); }
  if (!reduced) {
    /* same smoothing as the rest of the site: frame-rate independent, rate 3.2 per second */
    tilt.lerp(pointer, 1 - Math.exp(-dt * 3.2));
    hanger.rotation.z = -0.09 + Math.sin(time * 0.9) * 0.03 + Math.sin(time * 0.37 + 1) * 0.015;
    hanger.rotation.x = tilt.y * 0.2 + Math.sin(time * 0.7 + 1.3) * 0.02;
    hanger.rotation.y = tilt.x * 0.32;
  } else {
    hanger.rotation.z = -0.09;
  }
  renderer.render(scene, camera);

  /* the note hangs on a point just above the top edge of the card */
  if (note) {
    card.updateMatrixWorld();
    anchor.set(0, 0.62, 0).applyMatrix4(card.matrixWorld).project(camera);
    const x = Math.round((anchor.x * 0.5 + 0.5) * innerWidth), y = Math.round((-anchor.y * 0.5 + 0.5) * innerHeight);
    if (x !== noteX || y !== noteY) {
      noteX = x;
      noteY = y;
      note.style.translate = `${x}px ${y}px`;
    }
  }
});
