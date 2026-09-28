import * as THREE from "three";
import { Weather, WEATHER_ORDER, type WeatherKind } from "./weather";
import { heightAt, createUniforms, planDrifts, buildSky, buildGround, buildSignpost } from "./meadow";

/* Demo: the weather on a simple hill. The buttons switch clear / cloudy / rain / dusk, Gust throws a handful of petals.
   ?weather=clear|cloudy|rain|dusk starts in that state. */
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const canvas = document.querySelector<HTMLCanvasElement>("#scene")!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, .1, 200);

const u = createUniforms();
const drifts = planDrifts();
const sky = buildSky(u);
scene.add(sky.mesh, buildGround(u, drifts));
const signpost = buildSignpost();
scene.add(signpost);
/* the prop is lit by real lights; the weather dims them when a cloud shadow passes over the top of the hill */
const hemi = new THREE.HemisphereLight("#dfe8f0", "#4a5a2a", 2.6);
const key = new THREE.DirectionalLight("#ffd9a8", 3.2);
key.position.copy(u.uSunDir.value).multiplyScalar(10);
const rim = new THREE.DirectionalLight("#ffe2b8", 2.2);
rim.position.set(3, 2, 6);
scene.add(hemi, key, rim);

const exposure = { value: 1 };
const initial = new URLSearchParams(location.search).get("weather") as WeatherKind | null;
const weather = new Weather({
  scene, uniforms: u, sky: sky.uniforms, exposure,
  lights: () => ({ key, rim, hemi }),
  flowers: () => drifts,
  heightAt, propAt: { x: 0, z: 0 },
  reduced, initial: initial && WEATHER_ORDER.includes(initial) ? initial : undefined,
});

/* the switcher */
const buttons = [...document.querySelectorAll<HTMLButtonElement>("[data-weather]")];
const mark = () => buttons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.weather === weather.kind)));
buttons.forEach((b) => b.addEventListener("click", () => { weather.set(b.dataset.weather as WeatherKind); mark(); }));
document.querySelector("#gust")!.addEventListener("click", () => weather.burst());
mark();

const resize = () => {
  const w = Math.max(1, canvas.clientWidth), h = Math.max(1, canvas.clientHeight);
  const dpr = Math.min(devicePixelRatio, 2);
  renderer.setPixelRatio(dpr); renderer.setSize(w, h, false);
  camera.aspect = w / h;
  /* a narrow screen steps back so the top of the hill and a strip of sky stay in frame */
  const back = Math.max(1, 1.25 / camera.aspect);
  camera.position.set(0, 2.5 + (back - 1) * .8, 11 * back);
  camera.lookAt(0, 1.75, 0);
  camera.updateProjectionMatrix();
  /* the demo camera stands close to the flowers: petals and fireflies are drawn larger than on the far hill */
  weather.setPixelRatio(dpr, 2.4);
};
new ResizeObserver(resize).observe(canvas);
resize();

let last = performance.now();
renderer.setAnimationLoop(() => {
  const now = performance.now(), dt = Math.min(.05, (now - last) / 1000); last = now;
  u.uTime.value += dt;
  weather.update(dt);
  renderer.toneMappingExposure = exposure.value;
  renderer.render(scene, camera);
});
