import * as THREE from "three/webgpu";
import { color, mix, uniform, viewportUV } from "three/tsl";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import GUI from "lil-gui";
import { createClock } from "./clock.js";
import { createSky } from "./sky.js";
import { createOcean } from "./ocean.js";
import { createLight, CORE } from "./light.js";
import { createSparks } from "./sparks.js";
import { createFlow } from "./flow.js";
import { createDebris } from "./debris.js";
import { createStatue } from "./statue.js";
import { createPost } from "./post.js";
import { buildPanel } from "./panel.js";

/* Nightsail: a column of light over a night sea, and a marble head drowning under it.
 *
 * The lighting is almost entirely fake, and that is the point: there is one light source at a known spot,
 * so the sea, the shards and the air brighten by how much they face the core and how close they are to its
 * axis, instead of asking a lighting system. */

const SEA_LEVEL = 3.6;
const SEA_SIZE = 300;
const BASE = import.meta.env.BASE_URL;

const canvas = document.getElementById("stage");
const clock = createClock();

const renderer = new THREE.WebGPURenderer({
    canvas,
    powerPreference: "high-performance",
    /* #webgl in the address forces the WebGL2 backend. */
    forceWebGL: /webgl/i.test(location.hash),
    antialias: devicePixelRatio < 2,
});

renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);

try
{
    await renderer.init();
}
catch(error)
{
    document.getElementById("fallback").hidden = false;
    throw error;
}

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(25, innerWidth / innerHeight, 0.1, 600);

/* The air: shared by the sea, the shards and the sky. */
const air = {
    skyTop: uniform(color("#030408")),
    skyBottom: uniform(color("#080b12")),
    fogNear: uniform(27),
    fogFar: uniform(89),
    fogColor: uniform(color("#04050a")),
    scatter: uniform(0.4),
    scatterRadius: uniform(16),
    mistColor: uniform(color("#aeb9c8")),
    mistRadius: uniform(46),
};

const sky = createSky(`${BASE}sky.hdr`);
const skyAmount = uniform(1);

/* The background is a mix, not a swap: replacing the node would recompile it. Panorama at 1, a dark
   corner-to-corner gradient at 0. */
scene.backgroundNode = mix(mix(air.skyTop, air.skyBottom, viewportUV.length().smoothstep(0, 1)), sky.background(), skyAmount);

const light = createLight({ clock });
const ocean = createOcean({ size: SEA_SIZE, level: SEA_LEVEL, air, sky, clock, light });
const sparks = createSparks({ clock, light });
const flow = createFlow({ clock, light });
const debris = createDebris({ clock, air });
const statue = createStatue({ url: `${BASE}statue/marble_bust_01.glb`, ocean, clock });

scene.add(ocean.mesh, light.group, sparks.mesh, flow.mesh, debris.mesh, statue.group);

/* The only real lights are for the statue: weak steel moonlight from behind the column and the core
   itself, which lights the head from above like a spotlight. */
const moon = new THREE.DirectionalLight("#8a96b8", 1.4);
moon.position.set(12, 50, 70);
const coreLight = new THREE.PointLight("#dfe8ff", 900, 0, 2);
coreLight.position.set(0, CORE, 0);
const ambient = new THREE.HemisphereLight("#1a2230", "#040608", 0.5);
scene.add(moon, coreLight, ambient);

const post = createPost({ renderer, scene, camera });

/* ── the view ─────────────────────────────────────────────────────────────── */

/* A wide shot from high and far back: the whole sea, the head and the column fit at once. */
camera.position.set(0, 22, -112);

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 10, 8);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 12;
controls.maxDistance = 240;
controls.maxPolarAngle = Math.PI * 0.49; // below the surface there is nothing to see
controls.autoRotateSpeed = 0.25;
controls.update();

const view = {
    drift: 1,          // slow breathing of the camera on three sines
    autoRotate: false,
    fov: 25,
};

const lens = { flare: 0.085, spread: 1 };

/* Tuned values the panel edits; the core light follows the column's brightness. */
const tuned = { beam: 0.6, halo: 0, scatter: 0.4, sky: 1, moon: 1.4, ambient: 0.5, coreLight: 900 };

const core = new THREE.Vector3(0, CORE, 0);
const probe = new THREE.Vector3();
const breath = new THREE.Vector3();
const lookBreath = new THREE.Vector3();

function frameLoop()
{
    clock.tick();

    controls.autoRotate = view.autoRotate;
    controls.update(clock.delta);

    if(camera.fov !== view.fov) { camera.fov = view.fov; camera.updateProjectionMatrix(); }

    /* Breathing goes on top of the orbit and is taken off again after the frame, so it never fights the controls. */
    const t = clock.elapsed;
    const d = view.drift;
    breath.set((Math.sin(t * 0.11) * 2.2 + Math.sin(t * 0.29) * 0.6) * d, Math.sin(t * 0.17 + 1.3) * 1.1 * d, Math.sin(t * 0.07 + 2.1) * 1.6 * d);
    lookBreath.set(Math.sin(t * 0.13 + 0.7) * 1.4 * d, Math.sin(t * 0.23 + 2.6) * 0.7 * d, 0);

    camera.position.add(breath);
    camera.lookAt(probe.copy(controls.target).add(lookBreath));
    camera.updateMatrixWorld();

    light.beam.intensity.value = tuned.beam;
    light.halo.intensity.value = tuned.halo;
    air.scatter.value = tuned.scatter;
    skyAmount.value = tuned.sky;
    moon.intensity = tuned.moon;
    ambient.intensity = tuned.ambient;
    coreLight.intensity = tuned.coreLight;
    coreLight.color.copy(light.color.value);
    post.flare.intensity.value = lens.flare;

    sky.settings.rotation.value = -Math.atan2(-camera.position.z, -camera.position.x);

    sparks.update(camera);
    debris.update();
    ocean.update(clock.elapsed);
    statue.update(clock.delta);
    light.face(camera);

    probe.copy(core).project(camera);
    post.flare.position.value.set(probe.x * 0.5 + 0.5, probe.y * 0.5 + 0.5);
    post.shapeFlare(lens.spread);

    post.pipeline.render();

    camera.position.sub(breath);
    stats.tick();
}

/* ── panel, stats, keys ───────────────────────────────────────────────────── */

const toastElement = document.querySelector(".toast");
function toast(text)
{
    toastElement.textContent = text;
    toastElement.classList.add("is-on");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => toastElement.classList.remove("is-on"), 1400);
}

const panel = buildPanel({
    gui: new GUI({ title: "Nightsail", width: 300 }),
    clock, lens, view, tuned, air, ocean, light, sparks, flow, debris, statue, post, controls, camera, toast,
});

const stats = (() =>
{
    const element = document.querySelector(".stats");
    let frames = 0;
    let since = performance.now();

    return {
        tick()
        {
            frames++;
            const now = performance.now();
            if(now - since < 500) return;

            const backend = renderer.backend.isWebGPUBackend ? "WebGPU" : "WebGL2";
            element.textContent = `${Math.round((frames * 1000) / (now - since))} fps · ${backend}`;
            frames = 0;
            since = now;
        },
    };
})();

addEventListener("resize", () =>
{
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    post.flare.aspect.value = innerWidth / innerHeight;
});
post.flare.aspect.value = innerWidth / innerHeight;

addEventListener("keydown", (event) =>
{
    if(event.target.closest?.("input, select, .lil-gui")) return;

    if(event.code === "KeyH") document.documentElement.classList.toggle("is-clean");
    else if(event.code === "Space") { clock.paused = !clock.paused; panel.sync(); event.preventDefault(); }
});

renderer.setAnimationLoop(frameLoop);

/* Exposed for screenshots and the curious. */
window.nightsail = { clock, renderer, scene, camera, controls, view, statue, ocean, panel };
