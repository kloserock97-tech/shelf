// items/depth-tilt-object/variants/ts/depthTilt.ts
import * as THREE from "three";
var VERT = (
  /* glsl */
  `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`
);
var FRAG = (
  /* glsl */
  `
  precision highp float;
  uniform sampler2D uMap, uDepth;
  uniform vec2 uTilt;      // "camera" tilt: cursor, drum travel, a little breathing
  uniform float uOpacity;
  varying vec2 vUv;

  void main() {
    /* depth shift in two steps: the second step reads depth at the already shifted point, the outline tears less */
    float d = texture2D(uDepth, vUv).r;
    vec2 uv = vUv - (d - 0.42) * uTilt * 0.052;
    d = texture2D(uDepth, uv).r;
    uv = vUv - (d - 0.42) * uTilt * 0.052;
    vec4 c = texture2D(uMap, uv);

    /* a normal from the depth map: a highlight and soft shading that follow the tilt */
    float e = 1.0 / 384.0;
    float dx = texture2D(uDepth, uv + vec2(e, 0.0)).r - texture2D(uDepth, uv - vec2(e, 0.0)).r;
    float dy = texture2D(uDepth, uv + vec2(0.0, e)).r - texture2D(uDepth, uv - vec2(0.0, e)).r;
    vec3 n = normalize(vec3(-dx * 9.0, -dy * 9.0, 1.0));
    vec3 l = normalize(vec3(-0.35 + uTilt.x * 1.6, 0.55 + uTilt.y * 1.6, 0.9));
    float diff = dot(n, l) - dot(vec3(0.0, 0.0, 1.0), l);
    float spec = pow(max(dot(n, normalize(l + vec3(0.0, 0.0, 1.0))), 0.0), 36.0);
    c.rgb = clamp(c.rgb + diff * 0.22 + spec * 0.16, 0.0, 1.0);

    gl_FragColor = vec4(c.rgb, c.a * uOpacity);
  }
`
);
var loadTexture = (loader, url) => new Promise((resolve, reject) => loader.load(url, resolve, void 0, reject));
async function createDepthTilt(host, list, opts = {}) {
  const align = opts.align ?? 0.5;
  const canvas = document.createElement("canvas");
  canvas.className = "dt-gl";
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: true, powerPreference: "low-power" });
  } catch {
    return null;
  }
  renderer.setClearColor(0, 0);
  const loader = new THREE.TextureLoader();
  let maps, depths;
  try {
    [maps, depths] = await Promise.all([
      Promise.all(list.map((c) => loadTexture(loader, c.src))),
      Promise.all(list.map((c) => loadTexture(loader, c.depth)))
    ]);
  } catch {
    renderer.dispose();
    return null;
  }
  for (const m of maps) {
    m.colorSpace = THREE.NoColorSpace;
    m.generateMipmaps = true;
    m.minFilter = THREE.LinearMipmapLinearFilter;
    m.anisotropy = 4;
    m.needsUpdate = true;
  }
  for (const d of depths) {
    d.colorSpace = THREE.NoColorSpace;
    d.minFilter = THREE.LinearFilter;
    d.generateMipmaps = false;
    d.needsUpdate = true;
  }
  const scene = new THREE.Scene();
  const FOV = 26;
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 50);
  const DIST = 1 / Math.tan(FOV * Math.PI / 360);
  camera.position.set(0, 0, DIST);
  const geo = new THREE.PlaneGeometry(1, 1);
  const meshes = list.map((_c, i) => {
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      uniforms: { uMap: { value: maps[i] }, uDepth: { value: depths[i] }, uTilt: { value: new THREE.Vector2() }, uOpacity: { value: 0 } }
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    scene.add(mesh);
    return mesh;
  });
  host.appendChild(canvas);
  let aspect = 1;
  let dirty = true;
  const fit = () => {
    const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight);
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, innerWidth <= 900 ? 1.5 : 2));
    renderer.setSize(w, h, false);
    aspect = w / h;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    const boxW = 0.98 * 2 * aspect, boxH = 2 - 0.06, top = 1 - 0.02;
    list.forEach((c, i) => {
      let ph = boxH, pw = ph * c.ratio;
      if (pw > boxW) {
        pw = boxW;
        ph = pw / c.ratio;
      }
      const m = meshes[i];
      m.scale.set(pw, ph, 1);
      m.userData.x = -aspect + (2 * aspect - boxW) / 2 + (boxW - pw) * align + pw / 2;
      m.userData.y = top - (boxH - ph) * 0.6 - ph / 2;
    });
    dirty = true;
  };
  let active = 0, lastActive = 0, spin2 = 0;
  let tx = 0, ty = 0, cx = 0, cy = 0;
  let visible = true, raf2 = 0, last2 = performance.now();
  const RD = 1.7;
  const STEP = 1.5;
  const frame = (now2) => {
    raf2 = 0;
    const dt = Math.min(0.05, (now2 - last2) / 1e3);
    last2 = now2;
    const k = 1 - Math.exp(-dt * 7);
    cx += (tx - cx) * k;
    cy += (ty - cy) * k;
    spin2 += ((active - lastActive) * 9 - spin2) * k;
    lastActive = active;
    const breathe = now2 * 55e-5;
    const tiltX = cx * 0.9 + Math.sin(breathe) * 0.16;
    const tiltY = -cy * 0.7 + Math.cos(breathe * 0.8) * 0.1 + Math.max(-1.2, Math.min(1.2, spin2));
    meshes.forEach((m, i) => {
      const d = i - active;
      const ad = Math.abs(d);
      const on = ad < 1;
      m.visible = on;
      if (!on) return;
      const phi = d * STEP;
      m.position.set(m.userData.x + d * 0.08 * aspect, m.userData.y - Math.sin(phi) * RD, (Math.cos(phi) - 1) * RD);
      m.rotation.set(phi * 0.9, -tiltX * 0.12, d * -0.12);
      const u = m.material.uniforms;
      u.uTilt.value.set(tiltX, tiltY);
      u.uOpacity.value = Math.max(0, Math.min(1, 1 - ad * 2.1));
    });
    renderer.render(scene, camera);
    if (visible) raf2 = requestAnimationFrame(frame);
  };
  const kick = () => {
    if (!raf2) {
      last2 = performance.now();
      raf2 = requestAnimationFrame(frame);
    }
  };
  const io = new IntersectionObserver((entries) => {
    visible = entries.some((e) => e.isIntersecting) && !document.hidden;
    if (visible) kick();
  });
  io.observe(host);
  const onVis = () => {
    visible = !document.hidden && host.getBoundingClientRect().bottom > 0;
    if (visible) kick();
  };
  document.addEventListener("visibilitychange", onVis);
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    canvas.remove();
    host.classList.remove("has-gl");
  });
  fit();
  kick();
  host.classList.add("has-gl");
  return {
    set(a, px2, py2) {
      active = a;
      tx = px2;
      ty = py2;
      if (dirty || visible) kick();
      dirty = false;
    },
    resize: fit,
    dispose() {
      cancelAnimationFrame(raf2);
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      maps.forEach((m) => m.dispose());
      depths.forEach((d) => d.dispose());
      meshes.forEach((m) => m.material.dispose());
      geo.dispose();
      renderer.dispose();
      canvas.remove();
    }
  };
}

// items/depth-tilt-object/variants/ts/main.ts
var OBJECTS = [
  { name: "Harbor", src: "objects/harbor.webp", depth: "objects/depth/harbor.webp", ratio: 900 / 547 },
  { name: "Lumen", src: "objects/lumen.webp", depth: "objects/depth/lumen.webp", ratio: 900 / 731 },
  { name: "Northwind", src: "objects/northwind.webp", depth: "objects/depth/northwind.webp", ratio: 888 / 851 },
  { name: "Meridian", src: "objects/meridian.webp", depth: "objects/depth/meridian.webp", ratio: 900 / 773 },
  { name: "Atlas", src: "objects/atlas.webp", depth: "objects/depth/atlas.webp", ratio: 900 / 698 }
];
var reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
var stage = document.querySelector(".dt-stage");
var name = document.querySelector(".dt-name");
var now = document.querySelector(".dt-now");
var steps = [...document.querySelectorAll(".dt-step")];
document.querySelector(".dt-of").textContent = `/ ${String(OBJECTS.length).padStart(2, "0")}`;
var px = 0;
var py = 0;
var drum = 0;
var target = 0;
var raf = 0;
var last = 0;
var gl = reduced ? null : await createDepthTilt(stage, OBJECTS);
if (!gl) stage.classList.add("is-flat");
var paint = () => {
  name.textContent = OBJECTS[target].name;
  now.textContent = String(target + 1).padStart(2, "0");
  steps[0].disabled = target <= 0;
  steps[1].disabled = target >= OBJECTS.length - 1;
  const img = stage.querySelector(".dt-flat");
  if (img) img.src = OBJECTS[target].src;
};
var spin = (t) => {
  raf = 0;
  const dt = Math.min(0.05, (t - last) / 1e3);
  last = t;
  drum += (target - drum) * (1 - Math.exp(-dt * 11));
  if (Math.abs(target - drum) < 2e-3) drum = target;
  else raf = requestAnimationFrame(spin);
  gl?.set(drum, px, py);
};
var go = (i) => {
  target = Math.max(0, Math.min(OBJECTS.length - 1, i));
  paint();
  if (!raf) {
    last = performance.now();
    raf = requestAnimationFrame(spin);
  }
};
addEventListener("pointermove", (e) => {
  if (e.pointerType !== "mouse" && e.buttons === 0) return;
  const r = stage.getBoundingClientRect();
  px = Math.max(-1, Math.min(1, (e.clientX - r.left) / r.width * 2 - 1));
  py = Math.max(-1, Math.min(1, (e.clientY - r.top) / r.height * 2 - 1));
  gl?.set(drum, px, py);
});
var release = () => {
  px = 0;
  py = 0;
  gl?.set(drum, 0, 0);
};
document.documentElement.addEventListener("pointerleave", release);
addEventListener("pointerup", (e) => {
  if (e.pointerType !== "mouse") release();
});
steps.forEach((b) => b.addEventListener("click", () => go(target + Number(b.dataset.d))));
addEventListener("keydown", (e) => {
  if (e.key === "ArrowRight" || e.key === "ArrowDown") {
    e.preventDefault();
    go(target + 1);
  }
  if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
    e.preventDefault();
    go(target - 1);
  }
});
addEventListener("resize", () => gl?.resize());
paint();
gl?.set(0, 0, 0);
