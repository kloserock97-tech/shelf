import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RetroScreen, RETRO_SCREEN_ASPECT } from "./retro-screen";
import { buildMonitor } from "./monitor";

/* Demo: the monitor up close. Hover and click the three buttons, scroll the page with the wheel, a finger or
   PageUp / PageDown / Home / End. */
const FOV = 26;
const canvas = document.querySelector<HTMLCanvasElement>("#scene")!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setClearColor(0x000000, 0);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture;
scene.environmentIntensity = .5;
pmrem.dispose();
scene.add(new THREE.HemisphereLight("#fff8ec", "#8a8270", .9));
const key = new THREE.DirectionalLight("#fff3e0", 1.6);
key.position.set(-2.5, 4, 3.5); key.castShadow = true;
key.shadow.mapSize.setScalar(1024); key.shadow.radius = 6; key.shadow.bias = -.0005;
Object.assign(key.shadow.camera, { left: -2.5, right: 2.5, top: 2.5, bottom: -2.5, near: .5, far: 12 });
scene.add(key);

const screen = new RetroScreen();
const monitor = buildMonitor(screen.material, RETRO_SCREEN_ASPECT);
scene.add(monitor.group);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.ShadowMaterial({ opacity: .16 }));
floor.rotation.x = -Math.PI / 2; floor.position.y = monitor.floorY; floor.receiveShadow = true;
scene.add(floor);

const camera = new THREE.PerspectiveCamera(FOV, 1, .1, 50);
const look = new THREE.Vector3(0, -.12, 0);
const resize = () => {
  const w = Math.max(1, canvas.clientWidth), h = Math.max(1, canvas.clientHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  /* the whole monitor fits, whichever side of the frame is tighter */
  const tan = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  const distance = Math.max(monitor.size.y / (2 * tan), monitor.size.x / (2 * tan * camera.aspect)) * 1.08;
  camera.position.set(distance * .12, distance * .1, distance);
  camera.lookAt(look);
  camera.updateProjectionMatrix();
};
new ResizeObserver(resize).observe(canvas);
resize();

/* pointer → uv of the screen: the screen itself accounts for the bulge of the glass and for the scroll */
const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
const screenUv = (event: PointerEvent | MouseEvent) => {
  const r = canvas.getBoundingClientRect();
  ndc.set(((event.clientX - r.left) / r.width) * 2 - 1, -((event.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  return raycaster.intersectObject(monitor.screen, false)[0]?.uv ?? null;
};
let drag: { y: number; id: number } | null = null;
canvas.addEventListener("pointermove", (event) => {
  if (drag && event.pointerId === drag.id) {
    const px = monitor.screen.geometry.parameters.height / (2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * camera.position.length()) * canvas.clientHeight;
    screen.scrollBy((drag.y - event.clientY) * screen.viewHeight / Math.max(1, px));
    drag.y = event.clientY;
    return;
  }
  const uv = screenUv(event);
  canvas.style.cursor = screen.hoverAt(uv ? uv.x : -1, uv ? uv.y : -1) ? "pointer" : "default";
});
canvas.addEventListener("pointerleave", () => { screen.hoverAt(-1, -1); canvas.style.cursor = "default"; });
canvas.addEventListener("pointerdown", (event) => {
  if (event.pointerType !== "mouse" && screenUv(event)) { drag = { y: event.clientY, id: event.pointerId }; canvas.setPointerCapture(event.pointerId); }
});
const endDrag = () => { drag = null; };
canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);
canvas.addEventListener("click", (event) => {
  const uv = screenUv(event);
  if (uv) screen.clickAt(uv.x, uv.y);
});
canvas.addEventListener("wheel", (event) => {
  if (!screenUv(event)) return;
  event.preventDefault();
  screen.scrollBy(event.deltaY * (event.deltaMode === 1 ? 40 : 1) * 1.2);
}, { passive: false });
canvas.addEventListener("keydown", (event) => {
  const keys: Record<string, () => void> = {
    PageDown: () => screen.scrollPage(1), PageUp: () => screen.scrollPage(-1), " ": () => screen.scrollPage(event.shiftKey ? -1 : 1),
    ArrowDown: () => screen.scrollBy(60), ArrowUp: () => screen.scrollBy(-60), Home: () => screen.scrollHome(false), End: () => screen.scrollHome(true),
  };
  if (keys[event.key]) { event.preventDefault(); keys[event.key](); }
});

let last = performance.now();
const start = last;
renderer.setAnimationLoop(() => {
  const now = performance.now(), dt = Math.min(.05, (now - last) / 1000); last = now;
  screen.update((now - start) / 1000, dt);
  renderer.render(scene, camera);
});
