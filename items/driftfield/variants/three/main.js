import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import GUI from "lil-gui";
import { vertexShader, fragmentShader } from "./field.glsl.js";
import { DEFAULTS, PRESETS, readUrl, writeUrl } from "./settings.js";

/* Driftfield — a particle cloud in a curl-noise flow field.
 *
 * The whole thing is one draw call of gl.POINTS. Positions are never stored and never integrated:
 * the vertex shader evaluates the field from scratch every frame, so the only per-point data on the
 * GPU is the seed it started from. That is why the count can be changed on a slider without any
 * warm-up, why pausing freezes the shape exactly as it is, and why nothing drifts out of place if a
 * frame is dropped. */

const settings = { ...DEFAULTS, ...readUrl() };

const canvas = document.getElementById("stage");
let renderer;

try
{
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
}
catch(error)
{
    document.getElementById("fallback").hidden = false;
    throw error;
}

renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(25, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 0, 6);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 1.2;
controls.maxDistance = 40;

const uniforms = {
    uTime: { value: 0 },
    uFrequency: { value: settings.frequency },
    uSpray: { value: settings.spray },
    uRadius: { value: settings.radius },
    uFocus: { value: settings.focus },
    uFStop: { value: settings.fstop },
    uScreenScale: { value: 1 },
    uPointScale: { value: settings.pointScale },
    uColor: { value: new THREE.Color(settings.color) },
    uOpacity: { value: settings.opacity },
};

const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms,
    defines: { STEPS: settings.steps, PROBES: settings.probes },
    transparent: true,
    depthWrite: false,
    /* Alpha blending rather than additive. Added light has no ceiling, so wherever the cloud is dense
       it burns out to a flat white patch; alpha compositing saturates towards the particle colour
       and keeps the structure readable even in the thickest part. */
    blending: THREE.NormalBlending,
});

let points = null;

/* Seeds: uniform over a sphere, by rejection rather than by picking two angles, which would bunch
   points at the poles and show up on the cloud as two bright knots. The radius has nothing to do
   with the size of the cloud (normalising the curl decides that) — it sets how far apart neighbours
   sit in the noise, which is what makes the shreds coarse or fine. */
function buildCloud()
{
    if(points)
    {
        points.geometry.dispose();
        scene.remove(points);
    }

    const count = Math.round(settings.count);
    const seeds = new Float32Array(count * 3);
    const point = new THREE.Vector3();

    for(let i = 0; i < count; i++)
    {
        do
        {
            point.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1);
        }
        while(point.lengthSq() > 1);

        point.normalize().multiplyScalar(settings.spread).toArray(seeds, i * 3);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 3));
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 12);

    points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    scene.add(points);
}

function resize()
{
    const width = innerWidth;
    const height = innerHeight;

    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    /* World units to pixels at a depth of one. Point size then only has to be divided by depth. */
    uniforms.uScreenScale.value = (height * renderer.getPixelRatio()) / (2 * Math.tan((camera.fov * Math.PI) / 360));
}

addEventListener("resize", resize);
buildCloud();
resize();

/* ── the panel ──────────────────────────────────────────────────────────────
   Everything that shapes the cloud is here, in the order you would reach for it: how much of it
   there is, what the field does to it, and how the lens sees it. */

const gui = new GUI({ title: "Driftfield", width: 300 });
const apply = () => { sync(); writeUrl(settings); };

const shape = gui.addFolder("Cloud");
shape.add(settings, "count", 5000, 200000, 1000).name("points").onFinishChange(() => { buildCloud(); apply(); });
shape.add(settings, "spread", 16, 512, 1).name("seed spread").onFinishChange(() => { buildCloud(); apply(); });
shape.add(settings, "radius", 0.2, 4, 0.01).name("radius").onChange(apply);

const flow = gui.addFolder("Flow field");
flow.add(settings, "frequency", 0.05, 2, 0.01).name("frequency").onChange(apply);
flow.add(settings, "speed", 0, 30, 0.1).name("speed").onChange(apply);
flow.add(settings, "spray", -1, 1.5, 0.01).name("spray").onChange(apply);
flow.add(settings, "steps", 0, 6, 1).name("trace steps").onChange(rebuild);
flow.add(settings, "probes", { "fast (3 probes)": 3, "accurate (6 probes)": 6 }).name("sampling").onChange(rebuild);

const lens = gui.addFolder("Lens");
lens.add(settings, "focus", 0.5, 20, 0.05).name("focus distance").onChange(apply);
lens.add(settings, "fstop", 1.4, 16, 0.1).name("f-stop").onChange(apply);
lens.add(settings, "pointScale", 0.2, 6, 0.01).name("point size").onChange(apply);
lens.add(settings, "opacity", 0.02, 1, 0.01).name("opacity").onChange(apply);
lens.addColor(settings, "color").name("particles").onChange(apply);
lens.addColor(settings, "background").name("background").onChange(apply);

const view = gui.addFolder("View");
view.add(settings, "autoRotate").name("orbit by itself").onChange(apply);
view.add(settings, "rotateSpeed", -2, 2, 0.05).name("orbit speed").onChange(apply);
view.add(settings, "paused").name("freeze time").onChange(apply).listen();

const actions = {
    preset: "bubble",
    reseed: () => buildCloud(),
    copyLink: async () =>
    {
        writeUrl(settings);
        try { await navigator.clipboard.writeText(location.href); toast("Link copied"); }
        catch { toast("Copy failed, the address bar has it"); }
    },
    copySettings: async () =>
    {
        try { await navigator.clipboard.writeText(JSON.stringify(settings, null, 2)); toast("Settings copied"); }
        catch { toast("Copy failed"); }
    },
    reset: () => load(DEFAULTS),
};

gui.add(actions, "preset", Object.keys(PRESETS)).name("preset").onChange((key) => load({ ...DEFAULTS, ...PRESETS[key] }));
gui.add(actions, "reseed").name("new seeds");
gui.add(actions, "copyLink").name("copy link to this look");
gui.add(actions, "copySettings").name("copy settings as JSON");
gui.add(actions, "reset").name("reset");

function rebuild()
{
    material.defines.STEPS = Math.round(settings.steps);
    material.defines.PROBES = Number(settings.probes);
    material.needsUpdate = true;
    apply();
}

function sync()
{
    uniforms.uFrequency.value = settings.frequency;
    uniforms.uSpray.value = settings.spray;
    uniforms.uRadius.value = settings.radius;
    uniforms.uFocus.value = settings.focus;
    uniforms.uFStop.value = settings.fstop;
    uniforms.uPointScale.value = settings.pointScale;
    uniforms.uOpacity.value = settings.opacity;
    uniforms.uColor.value.set(settings.color);
    renderer.setClearColor(settings.background, 1);
    document.body.style.background = settings.background;
    controls.autoRotate = settings.autoRotate;
    controls.autoRotateSpeed = settings.rotateSpeed;
}

function load(next)
{
    const rebuildCloud = next.count !== settings.count || next.spread !== settings.spread;

    Object.assign(settings, next);
    gui.controllersRecursive().forEach((controller) => controller.updateDisplay());

    if(rebuildCloud) buildCloud();
    rebuild();
}

/* ── toast, stats, keys ─────────────────────────────────────────────────── */

const note = document.createElement("p");
note.className = "toast";
document.body.appendChild(note);
let noteTimer = 0;

function toast(text)
{
    note.textContent = text;
    note.classList.add("is-on");
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => note.classList.remove("is-on"), 1600);
}

const stats = document.createElement("p");
stats.className = "stats";
document.body.appendChild(stats);

addEventListener("keydown", (event) =>
{
    if(event.key === "h" || event.key === "H") gui.show(gui._hidden);
    if(event.code === "Space")
    {
        event.preventDefault();
        settings.paused = !settings.paused;
        writeUrl(settings);
    }
});

/* ── the loop ───────────────────────────────────────────────────────────── */

const clock = new THREE.Clock();
let elapsed = 0;
let frames = 0;
let fpsAt = performance.now();

function tick()
{
    requestAnimationFrame(tick);

    const delta = Math.min(clock.getDelta(), 0.1);
    if(!settings.paused) elapsed += delta * settings.speed * 0.02;
    uniforms.uTime.value = elapsed;

    controls.update();
    renderer.render(scene, camera);

    frames++;
    const now = performance.now();
    if(now - fpsAt > 500)
    {
        stats.textContent = `${Math.round((frames * 1000) / (now - fpsAt))} fps · ${Math.round(settings.count / 1000)}k points`;
        frames = 0;
        fpsAt = now;
    }
}

/* A handle for the console: poke at the cloud without digging through the bundle. */
globalThis.driftfield = { settings, uniforms, material, renderer, scene, camera, controls, buildCloud, load };

sync();
rebuild();
tick();
